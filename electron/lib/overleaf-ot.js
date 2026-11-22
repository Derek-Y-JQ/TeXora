'use strict';
const crypto = require('node:crypto');

/**
 * Overleaf / ShareJS text0 Operational Transformation (OT) engine.
 *
 * Operation format: Array of components, each either:
 *   { p: number, i: string }  — insert `i` at UTF-16 offset `p`
 *   { p: number, d: string }  — delete `d` at UTF-16 offset `p`
 */

function cloneComponent(c) {
  if (typeof c.i === 'string') return { p: c.p, i: c.i };
  if (typeof c.d === 'string') return { p: c.p, d: c.d };
  return { ...c };
}

function isTextComponent(c) {
  return c && typeof c.p === 'number' && (typeof c.i === 'string' || typeof c.d === 'string');
}

function normalizeOp(op) {
  if (!Array.isArray(op)) return [];
  const out = [];
  for (const c of op) {
    if (!isTextComponent(c)) continue;
    if (typeof c.i === 'string' && c.i.length === 0) continue;
    if (typeof c.d === 'string' && c.d.length === 0) continue;
    appendComponent(out, cloneComponent(c));
  }
  return out;
}

/**
 * Append a component to `dest`, merging adjacent inserts/deletes when possible.
 */
function appendComponent(dest, c) {
  if (!isTextComponent(c)) return;
  if (typeof c.i === 'string' && c.i.length === 0) return;
  if (typeof c.d === 'string' && c.d.length === 0) return;
  if (dest.length === 0) {
    dest.push(cloneComponent(c));
    return;
  }
  const last = dest[dest.length - 1];
  if (typeof last.i === 'string' && typeof c.i === 'string' && c.p >= last.p && c.p <= last.p + last.i.length) {
    const offset = c.p - last.p;
    last.i = last.i.slice(0, offset) + c.i + last.i.slice(offset);
    return;
  }
  if (typeof last.d === 'string' && typeof c.d === 'string') {
    if (c.p === last.p) {
      last.d += c.d;
      return;
    }
    if (c.p + c.d.length === last.p) {
      last.p = c.p;
      last.d = c.d + last.d;
      return;
    }
  }
  dest.push(cloneComponent(c));
}

function compose(op1, op2) {
  const out = [];
  for (const c of op1 || []) appendComponent(out, c);
  for (const c of op2 || []) appendComponent(out, c);
  return out;
}

function applyOp(text, op) {
  let doc = String(text ?? '');
  for (const c of op || []) {
    if (!isTextComponent(c)) continue;
    if (typeof c.i === 'string') {
      if (c.p < 0 || c.p > doc.length) {
        throw new Error(`OT insert out of bounds: p=${c.p}, len=${doc.length}`);
      }
      doc = doc.slice(0, c.p) + c.i + doc.slice(c.p);
    } else if (typeof c.d === 'string') {
      if (c.p < 0 || c.p + c.d.length > doc.length) {
        throw new Error(`OT delete out of bounds: p=${c.p}, dlen=${c.d.length}, len=${doc.length}`);
      }
      const actual = doc.slice(c.p, c.p + c.d.length);
      if (actual !== c.d) {
        throw new Error(`OT delete mismatch at p=${c.p}: expected ${JSON.stringify(c.d)}, got ${JSON.stringify(actual)}`);
      }
      doc = doc.slice(0, c.p) + doc.slice(c.p + c.d.length);
    }
  }
  return doc;
}

function transformPosition(pos, c, insertAfter) {
  if (typeof c.i === 'string') {
    if (c.p < pos || (c.p === pos && insertAfter)) return pos + c.i.length;
    return pos;
  }
  if (typeof c.d === 'string') {
    if (pos <= c.p) return pos;
    if (pos <= c.p + c.d.length) return c.p;
    return pos - c.d.length;
  }
  return pos;
}

/**
 * Transform component `c` against `otherC`.
 * `side`: 'left' means `c` wins tie at equal insert position; 'right' means `otherC` wins tie.
 */
function transformComponent(dest, c, otherC, side) {
  if (!isTextComponent(c)) return;
  if (!isTextComponent(otherC)) {
    appendComponent(dest, c);
    return;
  }

  if (typeof c.i === 'string') {
    appendComponent(dest, {
      p: transformPosition(c.p, otherC, side === 'right'),
      i: c.i
    });
    return;
  }

  // c is a delete
  if (typeof otherC.i === 'string') {
    let s = c.d;
    if (c.p < otherC.p) {
      const leftLen = otherC.p - c.p;
      appendComponent(dest, { p: c.p, d: s.slice(0, leftLen) });
      s = s.slice(leftLen);
    }
    if (s.length > 0) {
      appendComponent(dest, { p: c.p + otherC.i.length, d: s });
    }
    return;
  }

  // Both c and otherC are deletes
  const cStart = c.p;
  const cEnd = c.p + c.d.length;
  const oStart = otherC.p;
  const oEnd = otherC.p + otherC.d.length;

  if (cEnd <= oStart) {
    appendComponent(dest, c);
  } else if (cStart >= oEnd) {
    appendComponent(dest, { p: cStart - otherC.d.length, d: c.d });
  } else {
    let remaining = '';
    if (cStart < oStart) remaining += c.d.slice(0, oStart - cStart);
    if (cEnd > oEnd) remaining += c.d.slice(oEnd - cStart);
    if (remaining.length > 0) {
      appendComponent(dest, { p: Math.min(cStart, oStart), d: remaining });
    }
  }
}

function transformComponentX(left, right, destLeft, destRight) {
  transformComponent(destLeft, left, right, 'left');
  transformComponent(destRight, right, left, 'right');
}

/**
 * Transform two concurrent ops `leftOp` and `rightOp` against each other.
 * Returns `[leftOpPrime, rightOpPrime]` satisfying TP1:
 *   applyOp(applyOp(doc, leftOp), rightOpPrime) === applyOp(applyOp(doc, rightOp), leftOpPrime)
 */
function transformX(leftOp, rightOp) {
  const newRightOp = [];
  let left = normalizeOp(leftOp);
  const right = normalizeOp(rightOp);

  for (let r = 0; r < right.length; r++) {
    let rightComponent = right[r];
    const newLeftOp = [];
    let k = 0;

    while (k < left.length) {
      const nextC = [];
      transformComponentX(left[k], rightComponent, newLeftOp, nextC);
      k++;

      if (nextC.length === 1) {
        rightComponent = nextC[0];
      } else if (nextC.length === 0) {
        while (k < left.length) {
          appendComponent(newLeftOp, left[k++]);
        }
        rightComponent = null;
        break;
      } else {
        // Split component: transform the remainder of `left` against `nextC`
        const [lPrime, rPrime] = transformX(left.slice(k), nextC);
        for (const lc of lPrime) appendComponent(newLeftOp, lc);
        for (const rc of rPrime) appendComponent(newRightOp, rc);
        rightComponent = null;
        break;
      }
    }

    if (rightComponent !== null) appendComponent(newRightOp, rightComponent);
    left = newLeftOp;
  }

  return [left, newRightOp];
}

function transform(op, otherOp, side) {
  if (side !== 'left' && side !== 'right') {
    throw new Error("side must be 'left' or 'right'");
  }
  if (!otherOp || otherOp.length === 0) return normalizeOp(op);
  if (!op || op.length === 0) return [];
  if (side === 'left') return transformX(op, otherOp)[0];
  return transformX(otherOp, op)[1];
}

/**
 * Compute a minimal single-span OT op transforming `oldText` into `newText`.
 */
function diffToOp(oldText, newText) {
  const a = String(oldText ?? '');
  const b = String(newText ?? '');
  if (a === b) return [];

  let prefix = 0;
  const minLen = Math.min(a.length, b.length);
  while (prefix < minLen && a.charCodeAt(prefix) === b.charCodeAt(prefix)) prefix++;

  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    a.charCodeAt(a.length - 1 - suffix) === b.charCodeAt(b.length - 1 - suffix)
  ) {
    suffix++;
  }

  const deleted = a.slice(prefix, a.length - suffix);
  const inserted = b.slice(prefix, b.length - suffix);
  const op = [];
  if (deleted.length > 0) op.push({ p: prefix, d: deleted });
  if (inserted.length > 0) op.push({ p: prefix, i: inserted });
  return op;
}

/**
 * Convert Monaco `onDidChangeContent` changes into an Overleaf OT op
 * relative to `shadowText`. Falls back to `diffToOp` if coordinates drift.
 */
function changesToOp(shadowText, changes, finalText) {
  let current = String(shadowText ?? '');
  if (
    typeof finalText === 'string' &&
    Array.isArray(changes) &&
    changes.length === 1 &&
    changes[0].rangeOffset === 0 &&
    changes[0].rangeLength === current.length &&
    current.length > 0
  ) {
    return diffToOp(current, finalText);
  }
  const op = [];
  let ok = Array.isArray(changes) && changes.length > 0;
  if (ok) {
    for (const ch of changes) {
      const offset = ch.rangeOffset;
      const len = ch.rangeLength;
      const insert = String(ch.text ?? '');
      if (offset < 0 || len < 0 || offset + len > current.length) {
        ok = false;
        break;
      }
      if (len > 0) {
        const deleted = current.slice(offset, offset + len);
        appendComponent(op, { p: offset, d: deleted });
        current = current.slice(0, offset) + current.slice(offset + len);
      }
      if (insert.length > 0) {
        appendComponent(op, { p: offset, i: insert });
        current = current.slice(0, offset) + insert + current.slice(offset);
      }
    }
  }
  if (ok && (finalText === undefined || current === finalText)) {
    return op;
  }
  if (typeof finalText === 'string') {
    return diffToOp(shadowText, finalText);
  }
  return op;
}

/**
 * Overleaf's git-blob style SHA-1 document hash.
 */
function sha1Hash(text) {
  const body = String(text ?? '');
  const bytes = Buffer.byteLength(body, 'utf8');
  return crypto.createHash('sha1').update(`blob ${bytes}\x00${body}`, 'utf8').digest('hex');
}

/**
 * Standard 3-state ShareJS / Overleaf OT client state machine:
 *   - synchronized:       inFlight === null, buffer === null
 *   - awaitingConfirm:    inFlight !== null, buffer === null
 *   - awaitingWithBuffer: inFlight !== null, buffer !== null
 */
class OTClient {
  constructor({ docId, text = '', version = 0, includeHash = true }) {
    this.docId = docId;
    this.text = String(text);
    this.version = Number(version) || 0;
    this.includeHash = includeHash;
    this.inFlight = null;
    this.buffer = null;
  }

  get state() {
    if (!this.inFlight) return 'synchronized';
    return this.buffer ? 'awaitingWithBuffer' : 'awaitingConfirm';
  }

  get pending() {
    return this.inFlight !== null || this.buffer !== null;
  }

  _makePacket(op) {
    const packet = { doc: this.docId, op, v: this.version };
    if (this.includeHash) {
      // Hash represents the document state AFTER applying `op` to the server's
      // current version (which equals `this.text` when buffer is empty).
      const targetText = this.buffer ? applyOp(this._serverBaseText(), op) : this.text;
      packet.hash = sha1Hash(targetText);
    }
    return packet;
  }

  /**
   * Apply a local OT op. Returns a packet to send immediately if the client was
   * synchronized, or `null` if buffered behind an in-flight op.
   */
  applyLocal(rawOp) {
    const op = normalizeOp(rawOp);
    if (op.length === 0) return null;
    this.text = applyOp(this.text, op);

    if (!this.inFlight) {
      this.inFlight = op;
      return {
        doc: this.docId,
        op,
        v: this.version,
        ...(this.includeHash ? { hash: sha1Hash(this.text) } : {})
      };
    }

    this.buffer = this.buffer ? compose(this.buffer, op) : op;
    return null;
  }

  /**
   * Convenience: apply local Monaco changes directly.
   */
  applyLocalChanges(changes, finalText) {
    const op = changesToOp(this.text, changes, finalText);
    return this.applyLocal(op);
  }

  /**
   * Process an `otUpdateApplied` event from Overleaf.
   * Overleaf sends:
   *   - Ack of our own op: `{ v, doc }` (no `op`, or empty `op`)
   *   - Remote collaborator op: `{ v, doc, op: [...], meta: ... }`
   *
   * Returns `{ kind: 'ack' | 'remote' | 'noop', remoteOp?: Array, nextPacket?: Object }`
   */
  receiveServerUpdate(update) {
    const op = normalizeOp(update?.op);
    if (op.length === 0) {
      // Server ack for our in-flight op
      if (!this.inFlight) {
        if (typeof update?.v === 'number' && update.v >= this.version) {
          this.version = update.v + 1;
        }
        return { kind: 'noop' };
      }
      this.version += 1;
      if (this.buffer && this.buffer.length > 0) {
        const nextOp = this.buffer;
        this.inFlight = nextOp;
        this.buffer = null;
        return {
          kind: 'ack',
          nextPacket: {
            doc: this.docId,
            op: nextOp,
            v: this.version,
            ...(this.includeHash ? { hash: sha1Hash(this.text) } : {})
          }
        };
      }
      this.inFlight = null;
      this.buffer = null;
      return { kind: 'ack', nextPacket: null };
    }

    // Remote collaborator op
    this.version += 1;
    let remoteForLocal = op;

    if (this.inFlight) {
      const [remoteAfterInFlight, newInFlight] = transformX(remoteForLocal, this.inFlight);
      remoteForLocal = remoteAfterInFlight;
      this.inFlight = newInFlight;
    }
    if (this.buffer) {
      const [remoteAfterBuffer, newBuffer] = transformX(remoteForLocal, this.buffer);
      remoteForLocal = remoteAfterBuffer;
      this.buffer = newBuffer;
    }

    this.text = applyOp(this.text, remoteForLocal);
    return { kind: 'remote', remoteOp: remoteForLocal };
  }

  /**
   * Reset client state after a resync (`joinDoc`).
   */
  reset(text, version) {
    this.text = String(text ?? '');
    this.version = Number(version) || 0;
    this.inFlight = null;
    this.buffer = null;
  }
}

module.exports = {
  normalizeOp,
  compose,
  applyOp,
  transform,
  transformX,
  diffToOp,
  changesToOp,
  sha1Hash,
  OTClient
};
