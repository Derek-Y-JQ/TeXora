'use strict';
const assert = require('node:assert/strict');
const {
  applyOp,
  compose,
  transform,
  transformX,
  diffToOp,
  changesToOp,
  sha1Hash,
  OTClient
} = require('../electron/lib/overleaf-ot');

function makeRng(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function randomOp(doc, rng, maxComponents = 3) {
  let cur = doc;
  const op = [];
  const count = 1 + Math.floor(rng() * maxComponents);
  const alphabet = 'abcxyz012\n\\{}';
  for (let i = 0; i < count; i++) {
    const doInsert = cur.length === 0 || rng() < 0.55;
    if (doInsert) {
      const p = Math.floor(rng() * (cur.length + 1));
      const len = 1 + Math.floor(rng() * 5);
      let s = '';
      for (let j = 0; j < len; j++) s += alphabet[Math.floor(rng() * alphabet.length)];
      const c = { p, i: s };
      cur = applyOp(cur, [c]);
      op.push(c);
    } else {
      const p = Math.floor(rng() * cur.length);
      const len = 1 + Math.floor(rng() * Math.min(6, cur.length - p));
      const c = { p, d: cur.slice(p, p + len) };
      cur = applyOp(cur, [c]);
      op.push(c);
    }
  }
  return op;
}

// 1. Basic apply, compose, diffToOp, sha1Hash
assert.equal(applyOp('hello world', [{ p: 5, d: ' world' }, { p: 5, i: ' TeXora' }]), 'hello TeXora');
assert.deepEqual(compose([{ p: 0, i: 'ab' }], [{ p: 2, i: 'cd' }]), [{ p: 0, i: 'abcd' }]);
assert.deepEqual(compose([{ p: 4, d: 'e' }], [{ p: 3, d: 'd' }]), [{ p: 3, d: 'de' }]);
assert.equal(applyOp('\\section{Old}', diffToOp('\\section{Old}', '\\section{New}')), '\\section{New}');
assert.equal(sha1Hash('hello'), 'b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0');
// Overleaf sharejs.js hashes `"blob " + str.length + "\0" + str` (UTF-16 code units, not UTF-8 byte length)
assert.equal(
  sha1Hash('中文'),
  require('node:crypto').createHash('sha1').update('blob 2\x00中文', 'utf8').digest('hex')
);

// 2. Monaco multi-cursor changesToOp (reverse document order)
{
  const init = 'alpha\nbeta\ngamma';
  const changes = [
    { rangeOffset: 11, rangeLength: 5, text: 'GAMMA' },
    { rangeOffset: 0, rangeLength: 5, text: 'ALPHA' }
  ];
  const op = changesToOp(init, changes, 'ALPHA\nbeta\nGAMMA');
  assert.equal(applyOp(init, op), 'ALPHA\nbeta\nGAMMA');
}

// 2b. Full-document replacement (e.g., formatter / AI rewrite) shrinks to minimal diff OT op
{
  const before = '\\section{Title}\nHello world!\n\\end{document}';
  const after = '\\section{Title}\nHello TeXora!\n\\end{document}';
  const op = changesToOp(before, [{ rangeOffset: 0, rangeLength: before.length, text: after }], after);
  assert.deepEqual(op, [{ p: 22, d: 'world' }, { p: 22, i: 'TeXora' }]);
  assert.equal(applyOp(before, op), after);
}

// 3. Property test: TP1 convergence across 400 random concurrent edit pairs
{
  const rng = makeRng(20261121);
  for (let trial = 0; trial < 400; trial++) {
    const baseLen = Math.floor(rng() * 30);
    let doc = '';
    for (let i = 0; i < baseLen; i++) doc += String.fromCharCode(97 + (i % 10));
    const opA = randomOp(doc, rng, 3);
    const opB = randomOp(doc, rng, 3);

    const [opAPrime, opBPrime] = transformX(opA, opB);
    const resAB = applyOp(applyOp(doc, opA), opBPrime);
    const resBA = applyOp(applyOp(doc, opB), opAPrime);
    assert.equal(resAB, resBA, `TP1 failed on trial ${trial}: doc=${JSON.stringify(doc)}`);

    // Also verify single-sided transform() matches transformX()
    assert.deepEqual(transform(opA, opB, 'left'), opAPrime);
    assert.deepEqual(transform(opB, opA, 'right'), opBPrime);
  }
}

// 4. Full 2-client + central Overleaf-like server simulation with out-of-order network delivery
{
  const rng = makeRng(998877);
  let serverDoc = '\\documentclass{article}\n\\begin{document}\nHello Overleaf!\n\\end{document}\n';
  let serverVersion = 10;
  const history = []; // { v, op, client }

  const clientA = new OTClient({ docId: 'doc1', text: serverDoc, version: serverVersion });
  const clientB = new OTClient({ docId: 'doc1', text: serverDoc, version: serverVersion });
  const queueA = []; // packets from A to server
  const queueB = []; // packets from B to server
  const deliverA = []; // updates from server to A
  const deliverB = []; // updates from server to B

  const sendToServer = (clientName, packet) => {
    // Transform incoming op against any server ops since packet.v
    let op = packet.op;
    for (const h of history) {
      if (h.v >= packet.v) {
        // Server ops win ties (left), incoming op is right
        op = transform(op, h.op, 'right');
      }
    }
    const v = serverVersion;
    serverDoc = applyOp(serverDoc, op);
    serverVersion += 1;
    history.push({ v, op, client: clientName });

    if (clientName === 'A') {
      deliverA.push({ doc: 'doc1', v }); // ack
      deliverB.push({ doc: 'doc1', v, op }); // broadcast
    } else {
      deliverB.push({ doc: 'doc1', v }); // ack
      deliverA.push({ doc: 'doc1', v, op }); // broadcast
    }
  };

  for (let step = 0; step < 120; step++) {
    const r = rng();
    if (r < 0.3) {
      const op = randomOp(clientA.text, rng, 2);
      const pkt = clientA.applyLocal(op);
      if (pkt) queueA.push(pkt);
    } else if (r < 0.6) {
      const op = randomOp(clientB.text, rng, 2);
      const pkt = clientB.applyLocal(op);
      if (pkt) queueB.push(pkt);
    } else if (r < 0.75 && queueA.length) {
      sendToServer('A', queueA.shift());
    } else if (r < 0.9 && queueB.length) {
      sendToServer('B', queueB.shift());
    } else if (deliverA.length) {
      const res = clientA.receiveServerUpdate(deliverA.shift());
      if (res.nextPacket) queueA.push(res.nextPacket);
    } else if (deliverB.length) {
      const res = clientB.receiveServerUpdate(deliverB.shift());
      if (res.nextPacket) queueB.push(res.nextPacket);
    }
  }

  // Drain all queues to quiescence
  while (queueA.length || queueB.length || deliverA.length || deliverB.length) {
    if (queueA.length) sendToServer('A', queueA.shift());
    if (queueB.length) sendToServer('B', queueB.shift());
    while (deliverA.length) {
      const res = clientA.receiveServerUpdate(deliverA.shift());
      if (res.nextPacket) queueA.push(res.nextPacket);
    }
    while (deliverB.length) {
      const res = clientB.receiveServerUpdate(deliverB.shift());
      if (res.nextPacket) queueB.push(res.nextPacket);
    }
  }

  assert.equal(clientA.state, 'synchronized');
  assert.equal(clientB.state, 'synchronized');
  assert.equal(clientA.version, serverVersion);
  assert.equal(clientB.version, serverVersion);
  assert.equal(clientA.text, serverDoc);
  assert.equal(clientB.text, serverDoc);
}

console.log('PASS Overleaf OT: apply, compose, diff, Monaco multi-cursor, 400x TP1 fuzz, and 2-client concurrent server simulation.');
