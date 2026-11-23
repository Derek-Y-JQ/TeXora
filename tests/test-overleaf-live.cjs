'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {
  OverleafLiveManager,
  buildTreeFromProject,
  buildBridgeScript,
  overleafRoot,
  decodeOverleafUtf8
} = require('../electron/lib/overleaf-live');

(async () => {
  // 0. UTF-8 decoding for Overleaf Latin-1-packed joinDoc lines (Chinese / CJK)
  {
    const sample = '\\section{引言} 中文测试 — Overleaf 实时同步';
    const latin1Packed = Buffer.from(sample, 'utf8').toString('latin1');
    assert.notEqual(latin1Packed, sample);
    assert.equal(decodeOverleafUtf8(latin1Packed), sample);
    assert.equal(decodeOverleafUtf8(sample), sample);
    assert.equal(decodeOverleafUtf8('plain ascii 123'), 'plain ascii 123');
  }
  const projectId = 'abcdef0123456789abcdef01';
  const rootFolderId = '111111111111111111111111';
  const subFolderId = '222222222222222222222222';
  const mainDocId = '333333333333333333333333';
  const secDocId = '444444444444444444444444';
  const figFileId = '555555555555555555555555';

  const makeProject = () => ({
    _id: projectId,
    name: 'Live Paper',
    rootDoc_id: mainDocId,
    rootFolder: [{
      _id: rootFolderId,
      name: 'rootFolder',
      docs: [{ _id: mainDocId, name: 'main.tex' }],
      fileRefs: [{ _id: figFileId, name: 'fig1.png' }],
      folders: [{
        _id: subFolderId,
        name: 'sections',
        docs: [{ _id: secDocId, name: 'intro.tex' }],
        fileRefs: [],
        folders: []
      }]
    }]
  });

  // 1. Tree conversion
  {
    const built = buildTreeFromProject(projectId, makeProject());
    assert.equal(built.rootFile, `${overleafRoot(projectId)}/main.tex`);
    assert.equal(built.tree[0].type, 'dir');
    assert.equal(built.tree[0].name, 'sections');
    assert.equal(built.tree[0].children[0].path, `${overleafRoot(projectId)}/sections/intro.tex`);
    assert.deepEqual(built.assets.tex.sort(), ['main.tex', 'sections/intro.tex']);
    assert.deepEqual(built.assets.images, ['fig1.png']);
  }

  // 2. End-to-end OverleafLiveManager with mock bridge
  {
    const rendererEvents = [];
    const sentCmds = [];
    let emitFromBridge = null;
    let bridgeClosed = false;

    const manager = new OverleafLiveManager({
      emitToRenderer: (ev) => rendererEvents.push(ev),
      bridgeFactory: async ({ onEvent }) => {
        emitFromBridge = onEvent;
        setTimeout(() => {
          onEvent('connected', {
            project: makeProject(),
            permissionsLevel: 'readAndWrite',
            protocolVersion: 2,
            csrf: 'csrf-live',
            userId: 'user-1'
          });
        }, 5);
        return {
          sendCmd: (msg) => {
            sentCmds.push(msg);
            if (msg.type === 'joinDoc') {
              const { docId, requestId } = msg.payload;
              setTimeout(() => {
                onEvent('joinDocResponse', {
                  requestId,
                  docId,
                  docLines: ['\\section{Intro}', 'Hello world'],
                  version: 7
                });
              }, 2);
            } else if (msg.type === 'leaveDoc') {
              const { docId, requestId } = msg.payload;
              setTimeout(() => onEvent('leaveDocResponse', { requestId, docId }), 2);
            }
          },
          close: () => { bridgeClosed = true; }
        };
      }
    });

    const connected = await manager.connect(projectId);
    assert.equal(connected.active, true);
    assert.equal(connected.writable, true);
    assert.equal(connected.rootFile, `${overleafRoot(projectId)}/main.tex`);

    // Join doc by virtual path
    const joined = await manager.joinDoc(`${overleafRoot(projectId)}/main.tex`);
    assert.equal(joined.docId, mainDocId);
    assert.equal(joined.text, '\\section{Intro}\nHello world');
    assert.equal(joined.version, 7);

    // Binary file cannot be joined as text doc
    await assert.rejects(manager.joinDoc(`${overleafRoot(projectId)}/fig1.png`), /二进制资源/);

    // Local edit #1 -> immediately sent
    const r1 = manager.applyLocalChanges(mainDocId, [{ rangeOffset: 27, rangeLength: 0, text: '!' }], '\\section{Intro}\nHello world!');
    assert.equal(r1.pending, true);
    const otCmd1 = sentCmds.find((c) => c.type === 'applyOtUpdate');
    assert.ok(otCmd1);
    assert.equal(otCmd1.payload.update.v, 7);
    assert.deepEqual(otCmd1.payload.update.op, [{ p: 27, i: '!' }]);
    assert.ok(otCmd1.payload.update.hash);

    // Local edit #2 while #1 in-flight -> buffered
    manager.applyLocalChanges(mainDocId, [{ rangeOffset: 28, rangeLength: 0, text: '?' }], '\\section{Intro}\nHello world!?');
    assert.equal(sentCmds.filter((c) => c.type === 'applyOtUpdate').length, 1);

    // Concurrent remote op arrives at offset 0 before ack -> transformed & emitted to renderer
    emitFromBridge('otUpdateApplied', { doc: mainDocId, v: 7, op: [{ p: 0, i: '% header\n' }] });
    const remoteEv = rendererEvents.find((e) => e.type === 'remoteOp');
    assert.ok(remoteEv);
    assert.deepEqual(remoteEv.op, [{ p: 0, i: '% header\n' }]);

    // Ack for #1 arrives -> flushes buffered #2 with shifted offset (28 + 9 = 37) and v = 9
    emitFromBridge('otUpdateApplied', { doc: mainDocId, v: 8 });
    const otCmds = sentCmds.filter((c) => c.type === 'applyOtUpdate');
    assert.equal(otCmds.length, 2);
    assert.equal(otCmds[1].payload.update.v, 9);
    assert.deepEqual(otCmds[1].payload.update.op, [{ p: 37, i: '?' }]);

    // Ack for #2
    emitFromBridge('otUpdateApplied', { doc: mainDocId, v: 9 });
    assert.equal(manager.docs.get(mainDocId).state, 'synchronized');

    // Live tree mutations
    const newDocId = '666666666666666666666666';
    emitFromBridge('treeEvent', { kind: 'newDoc', parentFolderId: subFolderId, entity: { _id: newDocId, name: 'methods.tex' } });
    assert.ok(manager.pathToEntity.has(`${overleafRoot(projectId)}/sections/methods.tex`));

    emitFromBridge('treeEvent', { kind: 'renameEntity', entityId: newDocId, newName: 'method.tex' });
    assert.ok(manager.pathToEntity.has(`${overleafRoot(projectId)}/sections/method.tex`));

    emitFromBridge('treeEvent', { kind: 'moveEntity', entityId: newDocId, folderId: rootFolderId });
    assert.ok(manager.pathToEntity.has(`${overleafRoot(projectId)}/method.tex`));

    emitFromBridge('treeEvent', { kind: 'removeEntity', entityId: newDocId });
    assert.equal(manager.pathToEntity.has(`${overleafRoot(projectId)}/method.tex`), false);

    // otUpdateError triggers automatic resync
    emitFromBridge('otUpdateError', { doc: mainDocId, error: 'hash mismatch' });
    await new Promise((r) => setTimeout(r, 20));
    const resyncEv = rendererEvents.find((e) => e.type === 'docResynced');
    assert.ok(resyncEv);
    assert.equal(resyncEv.docId, mainDocId);

    // Leave doc and disconnect
    await manager.leaveDoc(mainDocId);
    assert.equal(manager.docs.has(mainDocId), false);
    await manager.disconnect();
    assert.equal(bridgeClosed, true);
    assert.equal(manager.active, false);
  }

  // 3. Bridge script VM smoke test (joinProjectResponse + joinDoc + otUpdateApplied)
  {
    const token = 'test-bridge-token';
    const posted = [];
    const listeners = [];
    const socketEvents = {};
    const socket = {
      on: (k, fn) => { socketEvents[k] = fn; },
      emit: (k, ...args) => {
        if (k === 'joinDoc') {
          const cb = args[2];
          cb(null, ['line1', 'line2'], 3);
        }
      },
      disconnect: () => {}
    };
    const sandboxWindow = {
      io: {
        connect: () => {
          setTimeout(() => socketEvents.joinProjectResponse({ project: makeProject(), permissionsLevel: 'owner', protocolVersion: 2 }), 5);
          return socket;
        }
      },
      location: { origin: 'https://www.overleaf.com' },
      postMessage: (data) => posted.push(data),
      addEventListener: (_type, fn) => listeners.push(fn)
    };
    const script = buildBridgeScript(token);
    vm.runInNewContext(script, {
      window: sandboxWindow,
      document: {
        querySelector: (sel) => ({
          content: sel.includes('project_id') ? projectId : sel.includes('csrfToken') ? 'csrf-123' : sel.includes('wsUrl') ? '/socket.io' : ''
        })
      },
      location: sandboxWindow.location,
      URL,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval
    });

    await new Promise((r) => setTimeout(r, 140));
    const connMsg = posted.find((m) => m.type === 'connected');
    assert.ok(connMsg);
    assert.equal(connMsg.payload.csrf, 'csrf-123');

    // Send joinDoc command into page script
    for (const fn of listeners) {
      fn({ source: sandboxWindow, data: { __texoraOlBridge: token, dir: 'toPage', type: 'joinDoc', payload: { docId: mainDocId, requestId: 'req-1' } } });
    }
    const joinMsg = posted.find((m) => m.type === 'joinDocResponse');
    assert.ok(joinMsg);
    assert.deepEqual(joinMsg.payload.docLines, ['line1', 'line2']);
    assert.equal(joinMsg.payload.version, 3);
  }

  // 4. Phase 2: Cloud compile, PDF cache, log path resolution, stopCompile, and SyncTeX
  {
    const os = require('node:os');
    const fsp = require('node:fs/promises');
    const path = require('node:path');
    const cacheDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'texora-ol-compile-'));
    const httpCalls = [];
    let compileStatus = 'success';

    const mockSession = {
      request: async (route, options = {}) => {
        httpCalls.push({ route, options });
        if (route.startsWith(`/project/${projectId}/compile/stop`)) {
          return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
        }
        if (route.startsWith(`/project/${projectId}/compile`)) {
          return new Response(JSON.stringify({
            status: compileStatus,
            compileGroup: 'standard',
            clsiServerId: 'clsi-9',
            outputFiles: [
              { url: `/project/${projectId}/build/b-42/output/output.pdf`, type: 'pdf', path: 'output.pdf', build: 'b-42' },
              { url: `/project/${projectId}/build/b-42/output/output.log`, type: 'log', path: 'output.log', build: 'b-42' }
            ]
          }), { headers: { 'content-type': 'application/json' } });
        }
        if (route.includes('/output.log')) {
          return new Response('./sections/intro.tex:12: Undefined control sequence.\n', { headers: { 'content-type': 'text/plain' } });
        }
        if (route.includes('/output.pdf')) {
          return new Response(Buffer.from('%PDF-1.7\n%mock\n'), { headers: { 'content-type': 'application/pdf' } });
        }
        if (route.startsWith(`/project/${projectId}/sync/code`)) {
          return new Response(JSON.stringify({
            pdf: [{ page: 2, h: 72.5, v: 210.25, width: 320, height: 14 }]
          }), { headers: { 'content-type': 'application/json' } });
        }
        if (route.startsWith(`/project/${projectId}/sync/pdf`)) {
          return new Response(JSON.stringify({
            code: [{ file: '/compile/sections/intro.tex', line: 42, column: 5 }]
          }), { headers: { 'content-type': 'application/json' } });
        }
        throw new Error('Unexpected route: ' + route);
      }
    };

    const manager = new OverleafLiveManager({
      session: mockSession,
      cacheDir,
      parseLog: () => [{ severity: 'error', file: './sections/intro.tex', line: 12, message: 'Undefined control sequence.' }],
      bridgeFactory: async ({ onEvent }) => {
        setTimeout(() => onEvent('connected', { project: makeProject(), permissionsLevel: 'owner', csrf: 'csrf-compile' }), 2);
        return { sendCmd: () => {}, close: () => {} };
      }
    });

    await manager.connect(projectId);
    const compiled = await manager.compile();
    assert.equal(compiled.ok, true);
    assert.equal(compiled.buildId, 'b-42');
    assert.ok(compiled.pdf.endsWith(path.join(projectId, 'output.pdf')));
    assert.equal((await fsp.readFile(compiled.pdf, 'utf8')).startsWith('%PDF-1.7'), true);
    assert.equal(compiled.problems[0].file, `${overleafRoot(projectId)}/sections/intro.tex`);
    assert.equal(httpCalls[0].options.headers['X-CSRF-Token'], 'csrf-compile');
    assert.equal(JSON.parse(httpCalls[0].options.body).rootResourcePath, 'main.tex');
    assert.ok(httpCalls.some((c) => c.route.includes('/output.pdf?') && c.route.includes('compileGroup=standard') && c.route.includes('clsiserverid=clsi-9')));

    // Forward SyncTeX
    const fwd = await manager.synctexForward(`${overleafRoot(projectId)}/sections/intro.tex`, 12, 1);
    assert.deepEqual(fwd, { ok: true, page: 2, x: 72.5, y: 210.25, width: 320, height: 14 });
    assert.ok(httpCalls.some((c) => c.route.includes('/sync/code?') && c.route.includes('file=sections%2Fintro.tex') && c.route.includes('buildId=b-42') && c.route.includes('clsiserverid=clsi-9')));

    // Inverse SyncTeX
    const inv = await manager.synctexInverse(2, 72.5, 210.25);
    assert.deepEqual(inv, { ok: true, file: `${overleafRoot(projectId)}/sections/intro.tex`, line: 42, column: 5 });

    // Rate-limited compile status
    compileStatus = 'too-recently-compiled';
    const throttled = await manager.compile();
    assert.equal(throttled.ok, false);
    assert.match(throttled.error, /频繁/);

    // Stop compile
    await manager.stopCompile();
    assert.ok(httpCalls.some((c) => c.route === `/project/${projectId}/compile/stop?clsiserverid=clsi-9` && c.options.method === 'POST'));

    await manager.disconnect();
  }

  // 5. Phase 3: Collaborator presence, cursor broadcast, and live file tree CRUD + upload
  {
    const os = require('node:os');
    const fsp = require('node:fs/promises');
    const path = require('node:path');
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'texora-ol-p3-'));
    const imgFile = path.join(tmpDir, 'diagram.png');
    await fsp.writeFile(imgFile, Buffer.from([137, 80, 78, 71]));

    const events = [];
    const cmds = [];
    const httpCalls = [];
    let emitFromBridge = null;

    const mockSession = {
      request: async (route, options = {}) => {
        httpCalls.push({ route, options });
        if (route === `/project/${projectId}/doc` && options.method === 'POST') {
          return new Response(JSON.stringify({ _id: '777777777777777777777777', name: 'conclusion.tex' }), { headers: { 'content-type': 'application/json' } });
        }
        if (route === `/project/${projectId}/folder` && options.method === 'POST') {
          return new Response(JSON.stringify({ _id: '888888888888888888888888', name: 'appendix' }), { headers: { 'content-type': 'application/json' } });
        }
        if (route.endsWith('/rename') || route.endsWith('/move') || route.endsWith('/settings') || options.method === 'DELETE') {
          return new Response(null, { status: 204 });
        }
        if (route.startsWith(`/project/${projectId}/upload`)) {
          return new Response(JSON.stringify({ success: true, entity_id: '999999999999999999999999', entity_type: 'file' }), { headers: { 'content-type': 'application/json' } });
        }
        throw new Error('Unexpected route: ' + route);
      }
    };

    const manager = new OverleafLiveManager({
      session: mockSession,
      emitToRenderer: (e) => events.push(e),
      bridgeFactory: async ({ onEvent }) => {
        emitFromBridge = onEvent;
        setTimeout(() => onEvent('connected', { project: makeProject(), permissionsLevel: 'owner', csrf: 'csrf-p3', userId: 'me-1' }), 2);
        return {
          sendCmd: (msg) => {
            cmds.push(msg);
            if (msg.type === 'getConnectedUsers') {
              setTimeout(() => onEvent('connectedUsersResponse', {
                requestId: msg.payload.requestId,
                users: [{ client_id: 'c-alice', user_id: 'u-alice', first_name: 'Alice', last_name: 'Lin', doc_id: mainDocId, row: 4, column: 2 }]
              }), 2);
            }
          },
          close: () => {}
        };
      }
    });

    await manager.connect(projectId);
    await new Promise((r) => setTimeout(r, 15));

    // Initial collaborator fetched
    const usersEv1 = events.filter((e) => e.type === 'usersChanged').at(-1);
    assert.ok(usersEv1);
    assert.equal(usersEv1.users.length, 1);
    assert.equal(usersEv1.users[0].name, 'Alice Lin');
    assert.equal(usersEv1.users[0].path, `${overleafRoot(projectId)}/main.tex`);
    assert.equal(usersEv1.users[0].isSelf, false);

    // Collaborator moves cursor + disconnects
    emitFromBridge('clientUpdated', { client_id: 'c-alice', user_id: 'u-alice', doc_id: secDocId, row: 10, column: 6 });
    const usersEv2 = events.filter((e) => e.type === 'usersChanged').at(-1);
    assert.equal(usersEv2.users[0].path, `${overleafRoot(projectId)}/sections/intro.tex`);
    assert.equal(usersEv2.users[0].row, 10);

    // Local cursor broadcast
    manager.updatePosition(`${overleafRoot(projectId)}/main.tex`, 5, 3);
    const posCmd = cmds.find((c) => c.type === 'updatePosition');
    assert.ok(posCmd);
    assert.deepEqual(posCmd.payload, { doc_id: mainDocId, row: 5, column: 3 });

    emitFromBridge('clientDisconnected', { id: 'c-alice' });
    assert.equal(events.filter((e) => e.type === 'usersChanged').at(-1).users.length, 0);

    // File tree CRUD
    const createdDoc = await manager.createDoc(`${overleafRoot(projectId)}/sections`, 'conclusion.tex');
    assert.equal(createdDoc.path, `${overleafRoot(projectId)}/sections/conclusion.tex`);

    const createdFolder = await manager.createFolder(overleafRoot(projectId), 'appendix');
    assert.equal(createdFolder.path, `${overleafRoot(projectId)}/appendix`);

    const renamed = await manager.renameEntity(createdDoc.path, 'final.tex');
    assert.equal(renamed.path, `${overleafRoot(projectId)}/sections/final.tex`);

    const moved = await manager.moveEntity(renamed.path, createdFolder.path);
    assert.equal(moved.path, `${overleafRoot(projectId)}/appendix/final.tex`);

    const rootSet = await manager.setRootDoc(moved.path);
    assert.equal(rootSet.rootFile, moved.path);

    const uploaded = await manager.uploadFile(createdFolder.path, imgFile);
    assert.equal(uploaded.path, `${overleafRoot(projectId)}/appendix/diagram.png`);

    await manager.deleteEntity(moved.path);
    assert.equal(manager.pathToEntity.has(moved.path), false);

    // Read-only guard
    manager.access = 'readOnly';
    await assert.rejects(manager.createDoc(overleafRoot(projectId), 'blocked.tex'), /只读/);

    // Phase 4: On-demand cloud binary asset fetch + disconnected/readonly edit guard
    manager.cacheDir = tmpDir;
    const origReq = mockSession.request;
    mockSession.request = async (route, options) => {
      if (route === `/project/${projectId}/file/${figFileId}`) {
        return new Response(Buffer.from([137, 80, 78, 71, 13, 10]), { headers: { 'content-type': 'image/png' } });
      }
      if (route.startsWith(`/project/${projectId}/updates`)) {
        return new Response(JSON.stringify({
          updates: [{ fromV: 1, toV: 4, meta: { end_ts: 1700000000000, users: [{ first_name: 'Alice', last_name: 'Lin' }] }, pathnames: ['main.tex'] }],
          nextBeforeTimestamp: 1699999999000,
          freeHistoryLimitHit: false
        }), { headers: { 'content-type': 'application/json' } });
      }
      if (route === `/project/${projectId}/labels`) {
        return new Response(JSON.stringify([{ id: 'l1', comment: 'Initial Draft', version: 3 }]), { headers: { 'content-type': 'application/json' } });
      }
      if (route.startsWith(`/project/${projectId}/diff?`)) {
        return new Response(JSON.stringify({ diff: [{ u: 'hello ' }, { d: 'old' }, { i: 'new' }] }), { headers: { 'content-type': 'application/json' } });
      }
      if (route.startsWith(`/project/${projectId}/output`) && options?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      return origReq(route, options);
    };
    const fetched = await manager.fetchFile(`${overleafRoot(projectId)}/fig1.png`);
    assert.equal(fetched.ok, true);
    assert.equal(fetched.name, 'fig1.png');
    assert.equal((await fsp.readFile(fetched.localPath)).length, 6);

    assert.throws(() => manager.applyLocalChanges(mainDocId, [{ rangeOffset: 0, rangeLength: 0, text: 'x' }], 'x'), /只读/);
    manager.access = 'owner';

    // Phase 5: Nested cursorData parsing, settings, cache clear, cloud history timeline & diff, and cloud global search
    emitFromBridge('clientUpdated', {
      client_id: 'c-bob',
      user_id: 'u-bob',
      first_name: 'Bob',
      cursorData: { doc_id: secDocId, row: 14, column: 3 }
    });
    const bob = manager.state().users.find((u) => u.id === 'c-bob');
    assert.ok(bob);
    assert.equal(bob.path, `${overleafRoot(projectId)}/sections/intro.tex`);
    assert.equal(bob.row, 14);
    assert.equal(bob.column, 3);

    const updatedSettings = await manager.updateSettings({ compiler: 'xelatex', imageName: 'texlive-full:2024.1' });
    assert.equal(updatedSettings.compiler, 'xelatex');
    assert.equal(updatedSettings.imageName, 'texlive-full:2024.1');

    const cleared = await manager.clearCompileCache();
    assert.equal(cleared.ok, true);

    const hist = await manager.fetchHistory();
    assert.equal(hist.ok, true);
    assert.equal(hist.updates.length, 1);
    assert.equal(hist.updates[0].labels[0].comment, 'Initial Draft');

    const diff = await manager.fetchHistoryDiff({ pathname: 'main.tex', from: 1, to: 4 });
    assert.equal(diff.beforeText, 'hello old');
    assert.equal(diff.afterText, 'hello new');

    // Global cloud search across docs using cached/open text
    manager.docTextCache.set(mainDocId, '\\section{Intro}\nFindMe in main\n');
    manager.docTextCache.set(secDocId, 'Another findme here\n');
    const searchRes = await manager.searchProject({ query: 'findme', caseSensitive: false });
    assert.equal(searchRes.ok, true);
    assert.equal(searchRes.matches.length, 2);

    manager.status = 'disconnected';
    assert.throws(() => manager.applyLocalChanges(mainDocId, [{ rangeOffset: 0, rangeLength: 0, text: 'x' }], 'x'), /已断开/);

    await manager.disconnect();
  }

  console.log('PASS Overleaf Live: Phase 1-5 (OT, tree, compile, SyncTeX, presence/cursorData, CRUD, settings, history timeline/diff, global search).');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
