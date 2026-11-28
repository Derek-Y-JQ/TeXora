'use strict';
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const { OTClient } = require('./overleaf-ot');
const { replaceFile } = require('./atomic-file');

function normalizeAccess(raw) {
  if (['owner', 'readAndWrite', 'readOnly', 'review', 'none'].includes(raw)) return raw;
  if (raw === 'read-write') return 'readAndWrite';
  if (raw === 'read-only') return 'readOnly';
  return 'unknown';
}

function safeMirrorRel(raw) {
  if (typeof raw !== 'string') return '';
  const rel = raw.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!rel || rel.length > 220) return '';
  const parts = rel.split('/');
  if (parts[0] === '.latex_cache' || parts[0] === '.git') return '';
  for (const p of parts) {
    if (!p || p === '.' || p === '..' || /[\x00-\x1f<>:"|?*]/.test(p) || /[ .]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)) {
      return '';
    }
  }
  return rel;
}

const ORIGIN = 'https://www.overleaf.com';
const ID_RE = /^[a-f\d]{24}$/i;
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'pdf', 'eps']);
const USER_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

function colorForUser(key) {
  const s = String(key || 'user');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return USER_COLORS[Math.abs(h) % USER_COLORS.length];
}

const utf8FatalDecoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Overleaf's `joinDoc` transmits UTF-8 bytes packed into Latin-1 JS strings.
 * Safely decodes Latin-1-packed UTF-8 while leaving ASCII or already-decoded
 * Unicode strings untouched.
 */
function decodeOverleafUtf8(str) {
  const s = String(str ?? '');
  let hasHighByte = false;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code > 0xff) return s; // Already decoded Unicode
    if (code >= 0x80) hasHighByte = true;
  }
  if (!hasHighByte) return s; // Pure ASCII
  try {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return utf8FatalDecoder.decode(bytes);
  } catch {
    return s;
  }
}

function overleafRoot(projectId) {
  return `overleaf://${projectId}`;
}

function extOfName(name) {
  const idx = String(name || '').lastIndexOf('.');
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : '';
}

function findFolderById(folder, id) {
  if (!folder) return null;
  if (folder._id === id) return folder;
  for (const sub of folder.folders || []) {
    const found = findFolderById(sub, id);
    if (found) return found;
  }
  return null;
}

function removeEntityFromFolder(folder, entityId) {
  if (!folder) return null;
  for (const [key, type] of [['docs', 'doc'], ['fileRefs', 'file'], ['folders', 'folder']]) {
    const list = folder[key] || [];
    const idx = list.findIndex((item) => item._id === entityId);
    if (idx !== -1) {
      const [removed] = list.splice(idx, 1);
      return { type, item: removed };
    }
  }
  for (const sub of folder.folders || []) {
    const found = removeEntityFromFolder(sub, entityId);
    if (found) return found;
  }
  return null;
}

function renameEntityInFolder(folder, entityId, newName) {
  if (!folder) return false;
  for (const key of ['docs', 'fileRefs', 'folders']) {
    const item = (folder[key] || []).find((x) => x._id === entityId);
    if (item) {
      item.name = newName;
      return true;
    }
  }
  for (const sub of folder.folders || []) {
    if (renameEntityInFolder(sub, entityId, newName)) return true;
  }
  return false;
}

function buildTreeFromProject(projectId, project) {
  const rootPrefix = overleafRoot(projectId);
  const rootFolder = project?.rootFolder?.[0] || { _id: '', docs: [], fileRefs: [], folders: [] };
  const pathToEntity = new Map();
  const idToEntity = new Map();
  const assets = { tex: [], images: [], bib: [], all: [] };

  const walk = (folder, relPrefix) => {
    const dirs = [];
    const files = [];

    for (const sub of folder.folders || []) {
      const rel = relPrefix ? `${relPrefix}/${sub.name}` : sub.name;
      const fullPath = `${rootPrefix}/${rel}`;
      const entity = {
        id: sub._id,
        name: sub.name,
        rel,
        path: fullPath,
        entityType: 'folder',
        folderId: folder._id
      };
      pathToEntity.set(fullPath, entity);
      idToEntity.set(sub._id, entity);
      dirs.push({
        name: sub.name,
        path: fullPath,
        rel,
        type: 'dir',
        ext: '',
        entityId: sub._id,
        entityType: 'folder',
        folderId: folder._id,
        children: walk(sub, rel)
      });
    }

    for (const doc of folder.docs || []) {
      const rel = relPrefix ? `${relPrefix}/${doc.name}` : doc.name;
      const fullPath = `${rootPrefix}/${rel}`;
      const ext = extOfName(doc.name);
      const entity = {
        id: doc._id,
        name: doc.name,
        rel,
        path: fullPath,
        entityType: 'doc',
        folderId: folder._id
      };
      pathToEntity.set(fullPath, entity);
      idToEntity.set(doc._id, entity);
      assets.all.push(rel);
      if (ext === 'tex' || ext === 'ltx') assets.tex.push(rel);
      else if (ext === 'bib') assets.bib.push(rel);
      files.push({
        name: doc.name,
        path: fullPath,
        rel,
        type: 'file',
        ext,
        entityId: doc._id,
        entityType: 'doc',
        folderId: folder._id
      });
    }

    for (const file of folder.fileRefs || []) {
      const rel = relPrefix ? `${relPrefix}/${file.name}` : file.name;
      const fullPath = `${rootPrefix}/${rel}`;
      const ext = extOfName(file.name);
      const entity = {
        id: file._id,
        name: file.name,
        rel,
        path: fullPath,
        entityType: 'file',
        folderId: folder._id
      };
      pathToEntity.set(fullPath, entity);
      idToEntity.set(file._id, entity);
      assets.all.push(rel);
      if (IMAGE_EXTS.has(ext)) assets.images.push(rel);
      files.push({
        name: file.name,
        path: fullPath,
        rel,
        type: 'file',
        ext,
        entityId: file._id,
        entityType: 'file',
        folderId: folder._id
      });
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return [...dirs, ...files];
  };

  const tree = walk(rootFolder, '');
  const rootDocEntity = project?.rootDoc_id ? idToEntity.get(project.rootDoc_id) : null;
  const fallbackTex = assets.tex[0] ? `${rootPrefix}/${assets.tex[0]}` : '';
  const rootFile = rootDocEntity?.path || fallbackTex;

  return { tree, pathToEntity, idToEntity, assets, rootFile };
}

/**
 * Generates the main-world script injected into the hidden Overleaf project
 * BrowserWindow. Uses Overleaf's own bundled Socket.IO client so cookies,
 * TLS fingerprint, and protocol version always match overleaf.com.
 */
function buildBridgeScript(token) {
  return `(() => {
    const TOKEN = ${JSON.stringify(token)};
    const emit = (type, payload) => {
      window.postMessage({ __texoraOlBridge: TOKEN, dir: 'toMain', type, payload }, window.location.origin);
    };
    let socket = null;
    let joined = false;
    let destroyed = false;

    const meta = (n) => document.querySelector('meta[name="' + n + '"]')?.content || '';

    const handleCmd = (type, payload) => {
      if (!socket || destroyed) return;
      if (type === 'joinDoc') {
        const { docId, requestId } = payload || {};
        socket.emit('joinDoc', docId, { encodeRanges: true }, (err, docLines, version, ops, ranges) => {
          emit('joinDocResponse', {
            requestId,
            docId,
            error: err ? String(err.message || err) : null,
            docLines: Array.isArray(docLines) ? docLines : [],
            version: Number(version) || 0,
            ranges: ranges && typeof ranges === 'object' ? ranges : null
          });
        });
      } else if (type === 'leaveDoc') {
        const { docId, requestId } = payload || {};
        socket.emit('leaveDoc', docId, (err) => {
          emit('leaveDocResponse', { requestId, docId, error: err ? String(err.message || err) : null });
        });
      } else if (type === 'applyOtUpdate') {
        const { docId, update } = payload || {};
        socket.emit('applyOtUpdate', docId, update, (err) => {
          if (err) {
            emit('otUpdateError', { doc: docId, error: String(err.message || err) });
          }
        });
      } else if (type === 'updatePosition') {
        socket.emit('clientTracking.updatePosition', payload);
      } else if (type === 'getConnectedUsers') {
        const { requestId } = payload || {};
        socket.emit('clientTracking.getConnectedUsers', (err, users) => {
          emit('connectedUsersResponse', {
            requestId,
            error: err ? String(err.message || err) : null,
            users: Array.isArray(users) ? users : []
          });
        });
      } else if (type === 'disconnect') {
        destroyed = true;
        try { socket.disconnect(); } catch {}
      }
    };

    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.__texoraOlBridge !== TOKEN || data.dir !== 'toPage') return;
      handleCmd(data.type, data.payload);
    });

    const timeout = setTimeout(() => {
      if (!joined && !destroyed) emit('connectError', { message: '连接 Overleaf 实时服务超时，请重新登录后重试' });
    }, 25000);

    const wait = setInterval(() => {
      if (destroyed) { clearInterval(wait); return; }
      if (!window.io?.connect) return;
      clearInterval(wait);
      const id = meta('ol-project_id');
      const wsRaw = meta('ol-wsUrl') || '/socket.io';
      let url;
      try { url = new URL(wsRaw, location.origin); } catch {
        clearTimeout(timeout);
        return emit('connectError', { message: '无法解析 Overleaf 实时服务地址' });
      }
      if (!/^[a-f0-9]{24}$/i.test(id) || url.protocol !== 'https:') {
        clearTimeout(timeout);
        return emit('connectError', { message: '项目元数据不可用，请确认已登录 Overleaf' });
      }
      const options = {
        resource: url.pathname.slice(1),
        path: url.pathname,
        query: 'projectId=' + id,
        reconnection: true,
        reconnect: true,
        forceNew: true,
        'force new connection': true
      };
      socket = window.io.connect(url.origin, options);

      const finishJoin = (project, permissionsLevel, protocolVersion) => {
        clearTimeout(timeout);
        joined = true;
        emit('connected', {
          project,
          permissionsLevel: permissionsLevel || project?.accessLevel || project?.privilegeLevel || 'unknown',
          protocolVersion: protocolVersion || 2,
          csrf: meta('ol-csrfToken'),
          userId: meta('ol-user_id') || ''
        });
      };

      socket.on('joinProjectResponse', (body) => {
        finishJoin(body?.project, body?.permissionsLevel, body?.protocolVersion);
      });
      if (window.io.version) {
        socket.on('connect', () => {
          socket.emit('joinProject', { project_id: id }, (err, project, permissionsLevel, protocolVersion) => {
            if (err) return emit('connectError', { message: '无法加入 Overleaf 项目' });
            finishJoin(project, permissionsLevel, protocolVersion);
          });
        });
      }
      socket.on('connectionRejected', (err) => {
        clearTimeout(timeout);
        emit('connectionRejected', { message: err?.message || 'Overleaf 拒绝访问此项目，请重新登录' });
      });
      socket.on('connect_error', (err) => {
        if (!joined) {
          clearTimeout(timeout);
          emit('connectError', { message: err?.message || '无法连接 Overleaf 实时服务' });
        } else {
          emit('status', { status: 'reconnecting' });
        }
      });
      socket.on('disconnect', (reason) => {
        if (!destroyed) emit('status', { status: 'disconnected', reason: String(reason || '') });
      });
      socket.on('reconnect', () => {
        if (!destroyed) emit('status', { status: 'connected', reconnected: true });
      });

      // OT updates
      socket.on('otUpdateApplied', (update) => emit('otUpdateApplied', update));
      socket.on('otUpdateError', (err, update) => emit('otUpdateError', { error: String(err || ''), doc: update?.doc || '' }));

      // Live project tree mutations
      socket.on('reciveNewDoc', (parentFolderId, doc) => emit('treeEvent', { kind: 'newDoc', parentFolderId, entity: doc }));
      socket.on('reciveNewFile', (parentFolderId, file) => emit('treeEvent', { kind: 'newFile', parentFolderId, entity: file }));
      socket.on('reciveNewFolder', (parentFolderId, folder) => emit('treeEvent', { kind: 'newFolder', parentFolderId, entity: folder }));
      socket.on('removeEntity', (entityId) => emit('treeEvent', { kind: 'removeEntity', entityId }));
      socket.on('reciveEntityRename', (entityId, newName) => emit('treeEvent', { kind: 'renameEntity', entityId, newName }));
      socket.on('reciveEntityMove', (entityId, folderId) => emit('treeEvent', { kind: 'moveEntity', entityId, folderId }));
      socket.on('newRootDoc', (docId) => emit('treeEvent', { kind: 'newRootDoc', docId }));

      // Collaborator presence (for Phase 3)
      socket.on('clientTracking.clientUpdated', (user) => emit('clientUpdated', user));
      socket.on('clientTracking.clientDisconnected', (clientId) => emit('clientDisconnected', { id: clientId }));

      // Collaborator chat & review comments (real-time)
      socket.on('new-chat-message', (message) => emit('chatMessage', message));
      socket.on('new-comment', (threadId, comment) => emit('commentEvent', { kind: 'newComment', threadId, comment }));
      socket.on('resolve-thread', (threadId, user) => emit('commentEvent', { kind: 'resolveThread', threadId, user }));
      socket.on('reopen-thread', (threadId) => emit('commentEvent', { kind: 'reopenThread', threadId }));
      socket.on('delete-thread', (threadId) => emit('commentEvent', { kind: 'deleteThread', threadId }));
      socket.on('edit-message', (threadId, messageId, content) => emit('commentEvent', { kind: 'editMessage', threadId, messageId, content }));
      socket.on('delete-message', (threadId, messageId) => emit('commentEvent', { kind: 'deleteMessage', threadId, messageId }));
    }, 100);
  })();`;
}

/**
 * Manages an active live Overleaf project session, its OT document clients,
 * and real-time file tree state.
 */
class OverleafLiveManager {
  constructor({ session, emitToRenderer, bridgeFactory, cacheDir, mirrorDir, parseLog, localCompilerFactory, localCompilerOpts } = {}) {
    this.session = session;
    this.emitToRenderer = emitToRenderer || (() => {});
    this.bridgeFactory = bridgeFactory || null;
    this.cacheDir = cacheDir || '';
    this.mirrorBaseDir = mirrorDir || (cacheDir ? path.join(path.dirname(cacheDir), 'mirror') : '');
    this.parseLog = parseLog || null;
    this.localCompilerFactory = localCompilerFactory || null;
    this.localCompilerOpts = localCompilerOpts || null;
    this.bridge = null;
    this.token = '';
    this.projectId = '';
    this.project = null;
    this.csrf = '';
    this.access = 'unknown';
    this.protocolVersion = 2;
    this.userId = '';
    this.status = 'disconnected';
    this.tree = [];
    this.pathToEntity = new Map();
    this.idToEntity = new Map();
    this.assets = { tex: [], images: [], bib: [], all: [] };
    this.rootFile = '';
    this.docs = new Map(); // docId -> OTClient
    this.docTextCache = new Map(); // docId -> cached decoded text for project-wide search/structure
    this._pendingDocReads = new Map(); // docId -> Promise<string>
    this.users = new Map(); // clientId -> collaborator info
    this.commentAnchors = new Map(); // threadId -> { docId, path, offset, text }
    this.pendingRequests = new Map(); // requestId -> { resolve, reject, timer }
    this._connectDeferred = null;
    this.editorId = crypto.randomUUID();
    this.lastEditorId = '';
    this.lastBuildId = '';
    this.lastClsiServerId = '';
    this.lastCompileGroup = '';
    this.lastPdfPath = '';
    this.compiling = false;
    this.mirrorReady = false;
    this._mirrorDirtyDocs = new Set();
    this._mirrorPendingFiles = new Set();
    this._mirrorWrittenText = new Map();
    this._mirrorNeedsFullSync = false;
    this._mirrorSyncPromise = null;
    this.lastCompileSource = 'cloud';
    this._mirrorProject = { root: '', rootFile: '', revision: 0 };
    this._mirrorCompiler = null;
  }

  get active() {
    return Boolean(this.projectId && this.bridge);
  }

  _serializeUsers() {
    const out = [];
    for (const u of this.users.values()) {
      const entity = u.doc_id ? this.idToEntity.get(u.doc_id) : null;
      out.push({
        id: u.id,
        user_id: u.user_id || '',
        name: u.name || '协作者',
        email: u.email || '',
        row: Number.isFinite(u.row) ? u.row : 0,
        column: Number.isFinite(u.column) ? u.column : 0,
        doc_id: u.doc_id || '',
        path: entity?.path || '',
        fileName: entity?.name || '',
        color: u.color || colorForUser(u.user_id || u.id),
        isSelf: Boolean(this.userId && u.user_id === this.userId)
      });
    }
    return out;
  }

  state() {
    return {
      active: this.active,
      projectId: this.projectId,
      name: this.project?.name || '',
      root: this.projectId ? overleafRoot(this.projectId) : '',
      rootFile: this.rootFile,
      access: this.access,
      writable: ['owner', 'readAndWrite', 'read-write'].includes(this.access),
      status: this.status,
      compiler: this.project?.compiler || 'pdflatex',
      imageName: this.project?.imageName || '',
      spellCheckLanguage: this.project?.spellCheckLanguage || '',
      mirrorReady: this.mirrorReady,
      lastCompileSource: this.lastCompileSource,
      tree: this.tree,
      assets: this.assets,
      users: this._serializeUsers()
    };
  }

  _rebuildTree() {
    const built = buildTreeFromProject(this.projectId, this.project);
    this.tree = built.tree;
    this.pathToEntity = built.pathToEntity;
    this.idToEntity = built.idToEntity;
    this.assets = built.assets;
    this.rootFile = built.rootFile;
  }

  _rejectAllPending(message) {
    for (const [, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error(message));
    }
    this.pendingRequests.clear();
  }

  _sendBridgeCmd(type, payload) {
    if (!this.bridge) throw new Error('Overleaf 实时连接未建立');
    this.bridge.sendCmd({ token: this.token, type, payload });
  }

  _requestBridge(type, payload, timeoutMs = 15000) {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Overleaf 请求超时（${type}）`));
      }, timeoutMs);
      this.pendingRequests.set(requestId, { resolve, reject, timer });
      try {
        this._sendBridgeCmd(type, { ...payload, requestId });
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        reject(err);
      }
    });
  }

  _resolveRequest(requestId, value, error) {
    const req = this.pendingRequests.get(requestId);
    if (!req) return;
    clearTimeout(req.timer);
    this.pendingRequests.delete(requestId);
    if (error) req.reject(new Error(error));
    else req.resolve(value);
  }

  async _createDefaultBridge(projectId, token) {
    const { BrowserWindow, ipcMain } = require('electron');
    const preloadPath = path.join(__dirname, 'overleaf-bridge-preload.js');
    const win = new BrowserWindow({
      parent: this.session.parent?.() || undefined,
      width: 900,
      height: 700,
      show: false,
      title: 'Overleaf Live Bridge',
      webPreferences: {
        session: this.session.session,
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true
      }
    });

    const webContentsId = win.webContents.id;
    const onHandshake = (event) => {
      if (event.sender.id !== webContentsId) return '';
      return token;
    };
    const onEvent = (event, msg) => {
      if (event.sender.id !== webContentsId) return;
      if (!msg || msg.token !== token) return;
      this.handleBridgeEvent(msg.type, msg.payload);
    };

    // Block Overleaf's own web page inside the hidden bridge window from firing
    // background auto-compiles that race with TeXora's cloud compile and trigger
    // `too-recently-compiled` errors. Main-process session.fetch has no webContentsId.
    const webRequest = this.session?.session?.webRequest;
    const filter = { urls: [`${ORIGIN}/project/*/compile*`] };
    if (webRequest?.onBeforeRequest) {
      webRequest.onBeforeRequest(filter, (details, callback) => {
        if (details.webContentsId === webContentsId) return callback({ cancel: true });
        return callback({ cancel: false });
      });
    }

    ipcMain.handle('overleaf-bridge:handshake', onHandshake);
    ipcMain.on('overleaf-bridge:event', onEvent);

    const cleanup = () => {
      try { webRequest?.onBeforeRequest?.(filter, null); } catch {}
      try { ipcMain.removeHandler('overleaf-bridge:handshake'); } catch {}
      try { ipcMain.removeListener('overleaf-bridge:event', onEvent); } catch {}
    };

    win.on('closed', () => {
      cleanup();
      if (this.bridge?.win === win) {
        this.bridge = null;
        this.status = 'disconnected';
        this._rejectAllPending('Overleaf 实时连接已关闭');
        this.emitToRenderer({ type: 'status', status: 'disconnected' });
      }
    });

    await win.loadURL(`${ORIGIN}/project/${projectId}`);
    const landed = new URL(win.webContents.getURL());
    if (landed.origin !== ORIGIN || landed.pathname !== `/project/${projectId}`) {
      cleanup();
      if (!win.isDestroyed()) win.close();
      throw new Error('Overleaf 登录已过期或无权访问该项目，请先重新登录');
    }

    await win.webContents.executeJavaScript(buildBridgeScript(token));

    return {
      win,
      sendCmd: (msg) => {
        if (!win.isDestroyed()) win.webContents.send('overleaf-bridge:cmd', msg);
      },
      close: () => {
        cleanup();
        if (!win.isDestroyed()) win.close();
      }
    };
  }

  async connect(projectId) {
    if (!ID_RE.test(projectId)) throw new Error('无效的 Overleaf 项目编号');
    await this.disconnect();

    this.projectId = projectId;
    this.token = crypto.randomUUID();
    this.status = 'connecting';
    this.emitToRenderer({ type: 'status', status: 'connecting', projectId });

    const connectPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._connectDeferred = null;
        reject(new Error('连接 Overleaf 实时项目超时，请重试'));
      }, 30000);
      this._connectDeferred = {
        resolve: (val) => { clearTimeout(timer); this._connectDeferred = null; resolve(val); },
        reject: (err) => { clearTimeout(timer); this._connectDeferred = null; reject(err); }
      };
    });

    try {
      this.bridge = this.bridgeFactory
        ? await this.bridgeFactory({ projectId, token: this.token, onEvent: (t, p) => this.handleBridgeEvent(t, p) })
        : await this._createDefaultBridge(projectId, this.token);
      return await connectPromise;
    } catch (err) {
      await this.disconnect();
      throw err;
    }
  }

  async disconnect() {
    this._rejectAllPending('已断开 Overleaf 实时连接');
    if (this._connectDeferred) {
      this._connectDeferred.reject(new Error('连接已取消'));
      this._connectDeferred = null;
    }
    const bridge = this.bridge;
    this.bridge = null;
    if (bridge) {
      try { bridge.sendCmd({ token: this.token, type: 'disconnect', payload: {} }); } catch {}
      try { bridge.close(); } catch {}
    }
    try { this._mirrorCompiler?.stop?.(); } catch {}
    this.projectId = '';
    this.token = '';
    this.project = null;
    this.csrf = '';
    this.access = 'unknown';
    this.tree = [];
    this.pathToEntity.clear();
    this.idToEntity.clear();
    this.assets = { tex: [], images: [], bib: [], all: [] };
    this.rootFile = '';
    this.docs.clear();
    this.docTextCache.clear();
    this.users.clear();
    this.commentAnchors.clear();
    this.lastBuildId = '';
    this.lastClsiServerId = '';
    this.lastCompileGroup = '';
    this.lastPdfPath = '';
    this.compiling = false;
    this.mirrorReady = false;
    this._mirrorDirtyDocs.clear();
    this._mirrorPendingFiles.clear();
    this._mirrorWrittenText.clear();
    this._mirrorNeedsFullSync = false;
    this._mirrorSyncPromise = null;
    this.lastCompileSource = 'cloud';
    this._mirrorProject.root = '';
    this._mirrorProject.rootFile = '';
    this.status = 'disconnected';
    this.emitToRenderer({ type: 'status', status: 'disconnected' });
  }

  _normalizeRelPath(rawFile) {
    if (!rawFile || !this.projectId) return '';
    let s = String(rawFile).replace(/\\/g, '/').trim();
    const prefix = `${overleafRoot(this.projectId)}/`;
    if (s.startsWith(prefix)) s = s.slice(prefix.length);
    s = s.replace(/^.*\/compiles\/[0-9a-f]{24}(?:-[0-9a-f]{24})?\/(?:\.\/)?/i, '');
    s = s.replace(/^\/?compile\//, '');
    s = s.replace(/^\.\//, '').replace(/^\/+/, '');
    return s;
  }

  resolveVirtualPath(rawFile) {
    if (!this.projectId) return '';
    const rel = this._normalizeRelPath(rawFile);
    if (!rel) return this.rootFile || '';
    const exact = `${overleafRoot(this.projectId)}/${rel}`;
    if (this.pathToEntity.has(exact)) return exact;
    const lower = exact.toLowerCase();
    for (const key of this.pathToEntity.keys()) {
      if (key.toLowerCase() === lower) return key;
    }
    return exact;
  }

  _getLogParser() {
    if (typeof this.parseLog === 'function') return this.parseLog;
    try {
      const { parseLatexLog } = require('./compiler');
      return parseLatexLog;
    } catch {
      return () => [];
    }
  }

  _buildOutputRoute(rawUrl, { compileGroup, clsiServerId, enableCaching = false } = {}) {
    if (!rawUrl) return '';
    const u = new URL(rawUrl, ORIGIN);
    if (compileGroup && !u.searchParams.has('compileGroup')) u.searchParams.set('compileGroup', compileGroup);
    if (clsiServerId && !u.searchParams.has('clsiserverid')) u.searchParams.set('clsiserverid', clsiServerId);
    if (enableCaching && !u.searchParams.has('enable_pdf_caching')) u.searchParams.set('enable_pdf_caching', 'true');
    return u.pathname + u.search;
  }

  async compile({ stopOnFirstError = false, retryOnThrottle = false, draft = false } = {}) {
    if (!this.active) throw new Error('尚未连接 Overleaf 实时项目');
    if (!this.session || typeof this.session.request !== 'function') throw new Error('Overleaf 网络会话不可用');
    if (!this.csrf) throw new Error('缺少 Overleaf CSRF 令牌，请重新连接项目');
    if (this.compiling) throw new Error('云端编译正在进行中');

    this.compiling = true;
    const started = Date.now();
    const prevBuildId = this.lastBuildId || '';
    try {
      const rootEntity = this.pathToEntity.get(this.rootFile) || (this.project?.rootDoc_id ? this.idToEntity.get(this.project.rootDoc_id) : null);
      const rootDocId = rootEntity?.id || this.project?.rootDoc_id || undefined;
      const rootResourcePath = rootEntity?.rel || this._normalizeRelPath(this.rootFile) || undefined;
      this.editorId ||= crypto.randomUUID();
      const body = {
        check: 'silent',
        draft: Boolean(draft),
        incrementalCompilesEnabled: true,
        stopOnFirstError: Boolean(stopOnFirstError),
        editorId: this.editorId,
        ...(rootDocId ? { rootDoc_id: rootDocId } : {}),
        ...(rootResourcePath ? { rootResourcePath } : {})
      };
      const runPost = async () => {
        const res = await this.session.request(`/project/${this.projectId}/compile?enable_pdf_caching=true`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-CSRF-Token': this.csrf,
            Referer: `${ORIGIN}/project/${this.projectId}`
          },
          body: JSON.stringify(body)
        });
        if (!res.headers?.get?.('content-type')?.includes('json')) {
          throw new Error('Overleaf 云端编译未返回 JSON，请检查登录状态');
        }
        return res.json();
      };
      let data = await runPost();
      if (retryOnThrottle && data?.status === 'too-recently-compiled') {
        await new Promise((r) => setTimeout(r, 2400));
        if (!this.active) throw new Error('已断开 Overleaf 实时连接');
        data = await runPost();
      }
      const status = String(data?.status || 'failure');
      const compileGroup = data?.compileGroup ? String(data.compileGroup) : '';
      const clsiServerId = data?.clsiServerId ? String(data.clsiServerId) : '';
      if (compileGroup) this.lastCompileGroup = compileGroup;
      if (clsiServerId) this.lastClsiServerId = clsiServerId;
      const files = Array.isArray(data?.outputFiles) ? data.outputFiles : [];

      const logFile = files.find((f) => f.type === 'log' || f.path === 'output.log' || /\.log$/i.test(f.path || ''));
      const pdfFile = files.find((f) => f.type === 'pdf' || f.path === 'output.pdf' || /\.pdf$/i.test(f.path || ''));
      const urlBuildMatch = String(pdfFile?.url || logFile?.url || '').match(/\/build\/([a-f0-9-]+)\//i);
      const resolvedBuildId = String(pdfFile?.build || data?.buildId || urlBuildMatch?.[1] || '');
      if (resolvedBuildId) this.lastBuildId = resolvedBuildId;
      this.lastEditorId = String(pdfFile?.editorId || this.editorId || '');

      const fetchLog = async () => {
        if (!logFile?.url) return '';
        try {
          const logRoute = this._buildOutputRoute(logFile.url, { compileGroup, clsiServerId });
          const logRes = await this.session.request(logRoute);
          return await logRes.text();
        } catch {
          return '';
        }
      };

      const fetchPdf = async () => {
        if (!pdfFile?.url || status !== 'success') return { pdfPath: '', pdfDownloadError: '' };
        // Reuse cached PDF if Overleaf returned the exact same buildId
        if (resolvedBuildId && resolvedBuildId === prevBuildId && this.lastPdfPath && fs.existsSync(this.lastPdfPath)) {
          return { pdfPath: this.lastPdfPath, pdfDownloadError: '' };
        }
        try {
          const pdfRoute = this._buildOutputRoute(pdfFile.url, { compileGroup, clsiServerId, enableCaching: true });
          const pdfRes = await this.session.request(pdfRoute);
          const buf = Buffer.from(await pdfRes.arrayBuffer());
          if (buf.length > 0 && this.cacheDir) {
            const dir = path.join(this.cacheDir, this.projectId);
            await fsp.mkdir(dir, { recursive: true });
            const target = path.join(dir, 'output.pdf');
            const tmp = `${target}.${crypto.randomUUID()}.tmp`;
            await fsp.writeFile(tmp, buf);
            await replaceFile(tmp, target);
            this.lastPdfPath = target;
            if (pdfFile.build) this.lastBuildId = String(pdfFile.build);
            return { pdfPath: target, pdfDownloadError: '' };
          }
          return { pdfPath: '', pdfDownloadError: '' };
        } catch (err) {
          return { pdfPath: '', pdfDownloadError: err.message || String(err) };
        }
      };

      // Download PDF and log concurrently to cut post-compile network latency
      const [logText, { pdfPath, pdfDownloadError }] = await Promise.all([fetchLog(), fetchPdf()]);

      const parseLog = this._getLogParser();
      const rawProblems = logText ? parseLog(logText, { rootFile: this.rootFile }) : [];
      const problems = rawProblems.map((p) => ({
        ...p,
        file: p.file ? this.resolveVirtualPath(p.file) : this.rootFile
      }));

      const statusMessages = {
        'too-recently-compiled': '编译过于频繁，请稍候几秒后重试',
        'autocompile-backoff': '云端编译限流中，请稍候重试',
        timedout: 'Overleaf 云端编译超时（请检查是否有死循环或超大图片）',
        terminated: 'Overleaf 云端编译已停止',
        failure: 'Overleaf 云端编译失败，请查看问题面板'
      };
      const ok = status === 'success' && Boolean(pdfPath);
      if (ok) this.lastCompileSource = 'cloud';
      const duration = Date.now() - started;
      const transcriptTail = logText ? logText.split(/\r?\n/).slice(-30).join('\n') : '';

      return {
        ok,
        status,
        source: 'cloud',
        pdf: pdfPath,
        previewPdf: pdfPath,
        log: logText,
        transcriptTail,
        problems,
        duration,
        rootFile: this.rootFile,
        buildId: this.lastBuildId,
        at: Date.now(),
        ...(ok ? {} : { error: pdfDownloadError ? `PDF 下载失败：${pdfDownloadError}` : (statusMessages[status] || 'Overleaf 云端编译未生成 PDF') })
      };
    } finally {
      this.compiling = false;
    }
  }

  getMirrorDir() {
    if (!this.mirrorBaseDir || !this.projectId) return '';
    return path.join(this.mirrorBaseDir, this.projectId);
  }

  _mirrorPathForRel(rawRel) {
    const mirrorDir = this.getMirrorDir();
    const rel = safeMirrorRel(rawRel);
    if (!mirrorDir || !rel) return '';
    const resolvedBase = path.resolve(mirrorDir);
    const target = path.resolve(resolvedBase, rel);
    const prefix = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep;
    if (!target.startsWith(prefix)) return '';
    return target;
  }

  _ensureMirrorCompiler() {
    if (this._mirrorCompiler) return this._mirrorCompiler;
    if (typeof this.localCompilerFactory === 'function') {
      this._mirrorCompiler = this.localCompilerFactory({ project: this._mirrorProject });
      return this._mirrorCompiler;
    }
    if (this.localCompilerOpts) {
      const { Compiler } = require('./compiler');
      const opts = this.localCompilerOpts;
      const mirrorSend = (ch, payload) => {
        if (ch === 'build:log' && typeof opts.send === 'function') opts.send(ch, payload);
      };
      this._mirrorCompiler = new Compiler({
        store: opts.store,
        project: this._mirrorProject,
        tex: opts.tex,
        history: null,
        send: mirrorSend,
        fallbackCacheRoot: opts.fallbackCacheRoot
      });
      return this._mirrorCompiler;
    }
    return null;
  }

  async _writeMirrorFile(rawRel, content) {
    const target = this._mirrorPathForRel(rawRel);
    if (!target) return false;
    await fsp.mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.${crypto.randomUUID()}.tmp`;
    await fsp.writeFile(tmp, content);
    await replaceFile(tmp, target);
    return true;
  }

  async _removeMirrorFile(rawRel) {
    const target = this._mirrorPathForRel(rawRel);
    if (!target) return;
    await fsp.rm(target, { recursive: true, force: true }).catch(() => {});
  }

  async _pruneMirrorStale(mirrorDir, validRelSet) {
    const walk = async (dir, prefix = '') => {
      let entries = [];
      try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.name === '.latex_cache' || e.name === '.git') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          await walk(full, rel);
          try {
            const left = await fsp.readdir(full);
            if (!left.length) await fsp.rmdir(full);
          } catch {}
        } else if (e.isFile() && !validRelSet.has(rel.toLowerCase())) {
          await fsp.unlink(full).catch(() => {});
        }
      }
    };
    await walk(mirrorDir);
  }

  async syncMirror({ force = false } = {}) {
    if (!this.active) throw new Error('尚未连接 Overleaf 实时项目');
    const mirrorDir = this.getMirrorDir();
    if (!mirrorDir) throw new Error('未配置本地镜像缓存目录');
    if (this._mirrorSyncPromise && !force) return this._mirrorSyncPromise;

    const runSync = async () => {
      await fsp.mkdir(mirrorDir, { recursive: true });
      const validRels = new Set();
      let filesCount = 0;
      let syncedViaZip = false;

      if (typeof this.session?.zip === 'function') {
        try {
          const buf = await this.session.zip(`/project/${this.projectId}/download/zip`);
          const AdmZip = require('adm-zip');
          const zip = new AdmZip(buf);
          let totalBytes = 0;
          for (const entry of zip.getEntries()) {
            if (entry.isDirectory) continue;
            if (((entry.attr >>> 16) & 0xf000) === 0xa000) continue;
            const rel = safeMirrorRel(entry.entryName);
            if (!rel) continue;
            totalBytes += entry.header.size;
            if (totalBytes > 256 * 1024 * 1024 || entry.header.size > 64 * 1024 * 1024) continue;
            const data = entry.getData();
            if (await this._writeMirrorFile(rel, data)) {
              validRels.add(rel.toLowerCase());
              filesCount++;
            }
          }
          syncedViaZip = true;
        } catch {
          syncedViaZip = false;
        }
      }

      if (!syncedViaZip) {
        const entities = [...this.pathToEntity.values()].filter((e) => e.entityType === 'doc' || e.entityType === 'file');
        const CONCURRENCY = 4;
        for (let i = 0; i < entities.length; i += CONCURRENCY) {
          const batch = entities.slice(i, i + CONCURRENCY);
          await Promise.all(batch.map(async (ent) => {
            const rel = safeMirrorRel(ent.rel);
            if (!rel) return;
            try {
              if (ent.entityType === 'doc') {
                const text = await this._readDocTextForSearch(ent);
                if (await this._writeMirrorFile(rel, Buffer.from(String(text ?? ''), 'utf8'))) {
                  validRels.add(rel.toLowerCase());
                  filesCount++;
                }
              } else if (ent.entityType === 'file' && typeof this.session?.request === 'function') {
                const res = await this.session.request(`/project/${this.projectId}/file/${ent.id}`);
                const buf = Buffer.from(await res.arrayBuffer());
                if (buf.length <= 64 * 1024 * 1024 && await this._writeMirrorFile(rel, buf)) {
                  validRels.add(rel.toLowerCase());
                  filesCount++;
                }
              }
            } catch {}
          }));
        }
      }

      // Overlay currently joined OT docs from memory so recent edits are never clobbered
      this._mirrorWrittenText.clear();
      for (const [docId, client] of this.docs.entries()) {
        const ent = this.idToEntity.get(docId);
        const rel = safeMirrorRel(ent?.rel || '');
        if (!rel) continue;
        const text = String(client.text ?? '');
        if (await this._writeMirrorFile(rel, Buffer.from(text, 'utf8'))) {
          validRels.add(rel.toLowerCase());
          this._mirrorWrittenText.set(docId, text);
        }
      }

      if (validRels.size > 0) {
        await this._pruneMirrorStale(mirrorDir, validRels);
      }

      this._mirrorDirtyDocs.clear();
      this._mirrorPendingFiles.clear();
      this._mirrorNeedsFullSync = false;
      this.mirrorReady = true;
      this.emitToRenderer({ type: 'mirrorStatus', ready: true, mirrorDir, filesCount });
      return { ok: true, mirrorDir, filesCount };
    };

    const p = runSync();
    this._mirrorSyncPromise = p;
    try {
      return await p;
    } finally {
      if (this._mirrorSyncPromise === p) this._mirrorSyncPromise = null;
    }
  }

  async _flushMirrorDelta() {
    if (!this.mirrorReady || this._mirrorNeedsFullSync) {
      await this.syncMirror({ force: false });
      return;
    }
    const dirtyDocs = new Set([...this._mirrorDirtyDocs, ...this.docs.keys()]);
    this._mirrorDirtyDocs.clear();
    for (const docId of dirtyDocs) {
      const ent = this.idToEntity.get(docId);
      if (!ent || ent.entityType !== 'doc') continue;
      const client = this.docs.get(docId);
      const text = client ? client.text : (this.docTextCache.has(docId) ? this.docTextCache.get(docId) : null);
      if (text === null) continue;
      const str = String(text);
      if (this._mirrorWrittenText.get(docId) === str) continue;
      if (await this._writeMirrorFile(ent.rel, Buffer.from(str, 'utf8')).catch(() => false)) {
        this._mirrorWrittenText.set(docId, str);
      }
    }

    const pendingFiles = [...this._mirrorPendingFiles];
    this._mirrorPendingFiles.clear();
    for (const fileId of pendingFiles) {
      const ent = this.idToEntity.get(fileId);
      if (!ent || ent.entityType !== 'file' || typeof this.session?.request !== 'function') continue;
      try {
        const res = await this.session.request(`/project/${this.projectId}/file/${ent.id}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length <= 64 * 1024 * 1024) {
          await this._writeMirrorFile(ent.rel, buf);
        }
      } catch {}
    }
  }

  _mapMirrorPathToVirtual(rawFile) {
    if (!rawFile) return this.rootFile;
    const mirrorDir = this.getMirrorDir();
    if (mirrorDir) {
      const resolvedBase = path.resolve(mirrorDir);
      const resolvedFile = path.resolve(rawFile);
      const rel = path.relative(resolvedBase, resolvedFile);
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
        return this.resolveVirtualPath(rel.split(path.sep).join('/'));
      }
    }
    return this.resolveVirtualPath(rawFile);
  }

  async compileLocal({ live = false, background = false, forceSync = false } = {}) {
    if (!this.active) throw new Error('尚未连接 Overleaf 实时项目');
    const compiler = this._ensureMirrorCompiler();
    if (!compiler) throw new Error('本地编译器不可用');
    const hasEngine = () => {
      if (!compiler.tex) return true;
      if (typeof compiler.tex.get === 'function') {
        return Boolean(
          compiler.tex.get('xelatex') ||
          compiler.tex.get('pdflatex') ||
          compiler.tex.get('lualatex') ||
          compiler.tex.get('latexmk')
        );
      }
      if (typeof compiler.tex.info === 'function') {
        return Object.values(compiler.tex.info()?.engines || {}).some(Boolean);
      }
      return Object.values(compiler.tex.tools || compiler.tex.engines || {}).some(Boolean);
    };
    if (compiler.tex && typeof compiler.tex.detect === 'function' && !hasEngine()) {
      compiler.tex.detect();
    }
    if (!hasEngine()) {
      throw new Error('未检测到本地 LaTeX 引擎（TeX Live / MiKTeX），请先安装或切换回 Overleaf 云端编译');
    }

    if (forceSync) await this.syncMirror({ force: true });
    else await this._flushMirrorDelta();

    const mirrorDir = this.getMirrorDir();
    const rootRel = safeMirrorRel(this._normalizeRelPath(this.rootFile));
    if (!rootRel) throw new Error('未找到有效的主文档路径');
    const mirrorRootFile = this._mirrorPathForRel(rootRel);
    if (!mirrorRootFile) throw new Error('主文档路径不安全，无法本地镜像编译');
    if (!fs.existsSync(mirrorRootFile)) {
      await this.syncMirror({ force: true });
    }
    if (!fs.existsSync(mirrorRootFile)) {
      throw new Error(`本地镜像中未找到主文档：${rootRel}`);
    }

    if (this._mirrorProject.root !== mirrorDir) {
      this._mirrorProject.revision = (this._mirrorProject.revision || 0) + 1;
      this._mirrorProject.root = mirrorDir;
    }
    this._mirrorProject.rootFile = mirrorRootFile;

    const olCompiler = this.project?.compiler || 'pdflatex';
    let engine = olCompiler === 'latex' ? 'pdflatex' : olCompiler;
    if (compiler.tex && typeof compiler.tex.get === 'function' && !compiler.tex.get(engine)) {
      engine = compiler.tex.get('xelatex') ? 'xelatex'
        : compiler.tex.get('pdflatex') ? 'pdflatex'
        : compiler.tex.get('lualatex') ? 'lualatex'
        : engine;
    }

    const res = await compiler.build({
      file: mirrorRootFile,
      engine,
      live: Boolean(live),
      background: Boolean(background),
      ignoreProjectRc: true,
      fastIncremental: true,
      skipRootPdfCopy: true
    });

    if (res?.cancelled || res?.queued || res?.needsProjectBuild) return res;

    const problems = Array.isArray(res?.problems)
      ? res.problems.map((p) => ({
          ...p,
          file: p.file ? this._mapMirrorPathToVirtual(p.file) : this.rootFile
        }))
      : [];

    const ok = Boolean(res?.ok && res?.pdf);
    if (ok) this.lastCompileSource = 'local';

    return {
      ...res,
      ok,
      source: 'local',
      engine,
      rootFile: this.rootFile,
      projectRoot: undefined,
      revision: undefined,
      problems
    };
  }

  async cleanLocalMirrorCache(includePdf = false) {
    if (!this.active) return { ok: false, error: '尚未连接 Overleaf 实时项目' };
    const compiler = this._ensureMirrorCompiler();
    const mirrorDir = this.getMirrorDir();
    if (!compiler || !mirrorDir || !fs.existsSync(mirrorDir)) return { ok: true, removed: 0 };
    this._mirrorProject.root = mirrorDir;
    const rootRel = safeMirrorRel(this._normalizeRelPath(this.rootFile));
    if (rootRel) this._mirrorProject.rootFile = this._mirrorPathForRel(rootRel);
    return compiler.clean(Boolean(includePdf));
  }

  async stopCompile() {
    if (this._mirrorCompiler?.running) {
      try { this._mirrorCompiler.stop(); } catch {}
      return { ok: true };
    }
    if (!this.active || !this.session || !this.csrf) return { ok: true };
    try {
      const params = new URLSearchParams();
      if (this.lastClsiServerId) params.set('clsiserverid', this.lastClsiServerId);
      const qs = params.toString();
      await this.session.request(`/project/${this.projectId}/compile/stop${qs ? '?' + qs : ''}`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': this.csrf }
      });
    } catch {}
    return { ok: true };
  }

  async synctexForward(fileOrPath, line, column = 1) {
    if (!this.active) throw new Error('尚未连接 Overleaf 实时项目');
    if (this.lastCompileSource === 'local' && this.mirrorReady && this._mirrorCompiler) {
      const rel = safeMirrorRel(this._normalizeRelPath(fileOrPath || this.rootFile));
      const localFile = rel ? this._mirrorPathForRel(rel) : '';
      if (!localFile) return { ok: false, error: '无法识别当前文件的本地镜像路径' };
      return this._mirrorCompiler.synctexForward(localFile, line, column);
    }
    if (!this.session) throw new Error('Overleaf 网络会话不可用');
    let rel = this._normalizeRelPath(fileOrPath || this.rootFile);
    if (!rel) throw new Error('无法识别当前文件路径');
    const rootRel = this._normalizeRelPath(this.rootFile);
    const rootSlash = rootRel.lastIndexOf('/');
    if (rootSlash > 0) {
      const rootDir = rootRel.slice(0, rootSlash);
      if (rel === rootRel || rel.startsWith(rootDir + '/')) {
        rel = rootDir + '/.' + rel.slice(rootDir.length);
      }
    }
    const editorId = this.lastEditorId || this.editorId;
    if (!this.lastBuildId) return { ok: false, error: '请先执行一次编译后再使用 SyncTeX 定位' };
    const params = new URLSearchParams({
      file: rel,
      line: String(Math.max(1, Math.round(Number(line) || 1))),
      column: String(Math.max(1, Math.round(Number(column) || 1))),
      editorId,
      buildId: this.lastBuildId
    });
    if (this.lastClsiServerId) params.set('clsiserverid', this.lastClsiServerId);
    const res = await this.session.request(`/project/${this.projectId}/sync/code?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        Referer: `${ORIGIN}/project/${this.projectId}`
      }
    });
    const data = await res.json();
    const hit = Array.isArray(data?.pdf) ? data.pdf[0] : null;
    if (!hit || !hit.page) return { ok: false, error: '云端 SyncTeX 正向定位未命中，请先执行一次编译' };
    return {
      ok: true,
      page: Number(hit.page),
      x: Number(hit.h) || 0,
      y: Number(hit.v) || 0,
      width: Number(hit.width) || 0,
      height: Number(hit.height) || 12
    };
  }

  async synctexInverse(page, x, y) {
    if (!this.active) throw new Error('尚未连接 Overleaf 实时项目');
    if (this.lastCompileSource === 'local' && this.mirrorReady && this._mirrorCompiler) {
      const res = await this._mirrorCompiler.synctexInverse(page, x, y);
      if (!res?.ok) return res;
      return {
        ...res,
        file: this._mapMirrorPathToVirtual(res.file)
      };
    }
    if (!this.session) throw new Error('Overleaf 网络会话不可用');
    const editorId = this.lastEditorId || this.editorId;
    if (!this.lastBuildId) return { ok: false, error: '请先执行一次编译后再使用 SyncTeX 反向定位' };
    const params = new URLSearchParams({
      page: String(Math.max(1, Math.round(Number(page) || 1))),
      h: (Number(x) || 0).toFixed(2),
      v: (Number(y) || 0).toFixed(2),
      editorId,
      buildId: this.lastBuildId
    });
    if (this.lastClsiServerId) params.set('clsiserverid', this.lastClsiServerId);
    const res = await this.session.request(`/project/${this.projectId}/sync/pdf?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        Referer: `${ORIGIN}/project/${this.projectId}`
      }
    });
    const data = await res.json();
    const hit = Array.isArray(data?.code) ? data.code[0] : null;
    if (!hit || !hit.file) return { ok: false, error: '云端 SyncTeX 反向定位未命中' };
    const cleanFile = String(hit.file).replace(/\\/g, '/').replace(/\/\.\//g, '/').replace(/^\.\//, '');
    return {
      ok: true,
      file: this.resolveVirtualPath(cleanFile),
      line: Math.max(1, Number(hit.line) || 1),
      column: Math.max(1, Number(hit.column) || 1)
    };
  }

  async joinDoc(docIdOrPath) {
    if (!this.active) throw new Error('尚未连接 Overleaf 实时项目');
    const entity = this.pathToEntity.get(docIdOrPath) || this.idToEntity.get(docIdOrPath);
    if (!entity) throw new Error('未找到对应的云端文档');
    if (entity.entityType !== 'doc') throw new Error('该文件为二进制资源，暂不支持直接文本编辑');

    const res = await this._requestBridge('joinDoc', { docId: entity.id });
    const text = (res.docLines || []).map((line) => decodeOverleafUtf8(line)).join('\n');
    const version = Number(res.version) || 0;
    const client = new OTClient({ docId: entity.id, text, version, includeHash: true });
    this.docs.set(entity.id, client);
    this.docTextCache.set(entity.id, text);
    if (this.mirrorReady) this._mirrorDirtyDocs.add(entity.id);
    this._recordDocRanges(entity, res.ranges);

    return {
      docId: entity.id,
      path: entity.path,
      name: entity.name,
      text,
      version
    };
  }

  async leaveDoc(docIdOrPath) {
    const entity = this.pathToEntity.get(docIdOrPath) || this.idToEntity.get(docIdOrPath);
    const docId = entity ? entity.id : docIdOrPath;
    this.docs.delete(docId);
    if (!this.active) return { ok: true };
    try {
      await this._requestBridge('leaveDoc', { docId }, 5000);
    } catch {}
    return { ok: true };
  }

  applyLocalChanges(docIdOrPath, changes, finalText) {
    if (!this.active) throw new Error('尚未连接 Overleaf 实时项目');
    if (this.status !== 'connected') throw new Error('Overleaf 实时连接已断开，请等待重连后再编辑');
    if (!['owner', 'readAndWrite', 'read-write'].includes(this.access)) {
      throw new Error('当前账号对该 Overleaf 项目仅有只读权限');
    }
    const entity = this.pathToEntity.get(docIdOrPath) || this.idToEntity.get(docIdOrPath);
    const docId = entity ? entity.id : docIdOrPath;
    const client = this.docs.get(docId);
    if (!client) throw new Error('文档尚未加入实时会话');

    const packet = client.applyLocalChanges(changes, finalText);
    this.docTextCache.set(docId, client.text);
    if (this.mirrorReady) this._mirrorDirtyDocs.add(docId);
    if (packet) {
      this._sendBridgeCmd('applyOtUpdate', { docId, update: packet });
    }
    return { pending: client.pending, version: client.version };
  }

  async resyncDoc(docId) {
    const entity = this.idToEntity.get(docId);
    if (!entity || !this.active) return;
    try {
      const res = await this._requestBridge('joinDoc', { docId });
      const text = (res.docLines || []).map((line) => decodeOverleafUtf8(line)).join('\n');
      const version = Number(res.version) || 0;
      const client = this.docs.get(docId);
      if (client) client.reset(text, version);
      else this.docs.set(docId, new OTClient({ docId, text, version }));
      this.docTextCache.set(docId, text);
      if (this.mirrorReady) this._mirrorDirtyDocs.add(docId);
      this.emitToRenderer({
        type: 'docResynced',
        docId,
        path: entity.path,
        text,
        version
      });
    } catch (err) {
      this.emitToRenderer({
        type: 'error',
        message: `文档重同步失败：${err.message}`
      });
    }
  }

  updatePosition(docIdOrPath, row, column) {
    if (!this.active) return { ok: false };
    const entity = this.pathToEntity.get(docIdOrPath) || this.idToEntity.get(docIdOrPath);
    const docId = entity ? entity.id : docIdOrPath;
    if (!docId) return { ok: false };
    try {
      this._sendBridgeCmd('updatePosition', {
        doc_id: docId,
        row: Math.max(0, Number(row) || 0),
        column: Math.max(0, Number(column) || 0)
      });
    } catch {}
    return { ok: true };
  }

  _resolveFolderId(folderPathOrId) {
    const rootFolderId = this.project?.rootFolder?.[0]?._id || '';
    if (!folderPathOrId || folderPathOrId === overleafRoot(this.projectId)) return rootFolderId;
    const entity = this.pathToEntity.get(folderPathOrId) || this.idToEntity.get(folderPathOrId);
    if (entity?.entityType === 'folder') return entity.id;
    if (entity?.folderId) return entity.folderId;
    return rootFolderId;
  }

  _requireWritable() {
    if (!this.active) throw new Error('尚未连接 Overleaf 实时项目');
    if (!this.session || typeof this.session.request !== 'function') throw new Error('Overleaf 网络会话不可用');
    if (!this.csrf) throw new Error('缺少 Overleaf CSRF 令牌，请重新连接项目');
    if (!['owner', 'readAndWrite', 'read-write'].includes(this.access)) {
      throw new Error('当前账号对该 Overleaf 项目仅有只读权限');
    }
  }

  async createDoc(parentFolderPathOrId, name) {
    this._requireWritable();
    const cleanName = String(name || '').trim();
    if (!cleanName || /[\\/]/.test(cleanName)) throw new Error('无效的文件名');
    const parentFolderId = this._resolveFolderId(parentFolderPathOrId);
    const res = await this.session.request(`/project/${this.projectId}/doc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': this.csrf
      },
      body: JSON.stringify({ name: cleanName, parent_folder_id: parentFolderId })
    });
    const doc = await res.json();
    if (!doc?._id) throw new Error('Overleaf 未返回新建文档信息');
    this._applyTreeEvent({ kind: 'newDoc', parentFolderId, entity: { _id: doc._id, name: doc.name || cleanName } });
    const entity = this.idToEntity.get(doc._id);
    return { ok: true, id: doc._id, path: entity?.path || '' };
  }

  async createFolder(parentFolderPathOrId, name) {
    this._requireWritable();
    const cleanName = String(name || '').trim();
    if (!cleanName || /[\\/]/.test(cleanName)) throw new Error('无效的文件夹名称');
    const parentFolderId = this._resolveFolderId(parentFolderPathOrId);
    const res = await this.session.request(`/project/${this.projectId}/folder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-Token': this.csrf
      },
      body: JSON.stringify({ name: cleanName, parent_folder_id: parentFolderId })
    });
    const folder = await res.json();
    if (!folder?._id) throw new Error('Overleaf 未返回新建文件夹信息');
    this._applyTreeEvent({ kind: 'newFolder', parentFolderId, entity: { _id: folder._id, name: folder.name || cleanName, docs: [], fileRefs: [], folders: [] } });
    const entity = this.idToEntity.get(folder._id);
    return { ok: true, id: folder._id, path: entity?.path || '' };
  }

  async renameEntity(entityPathOrId, newName) {
    this._requireWritable();
    const cleanName = String(newName || '').trim();
    if (!cleanName || /[\\/]/.test(cleanName)) throw new Error('无效的新名称');
    const entity = this.pathToEntity.get(entityPathOrId) || this.idToEntity.get(entityPathOrId);
    if (!entity) throw new Error('未找到要重命名的云端条目');
    await this.session.request(`/project/${this.projectId}/${entity.entityType}/${entity.id}/rename`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': this.csrf
      },
      body: JSON.stringify({ name: cleanName })
    });
    this._applyTreeEvent({ kind: 'renameEntity', entityId: entity.id, newName: cleanName });
    const updated = this.idToEntity.get(entity.id);
    return { ok: true, id: entity.id, path: updated?.path || '' };
  }

  async moveEntity(entityPathOrId, targetFolderPathOrId) {
    this._requireWritable();
    const entity = this.pathToEntity.get(entityPathOrId) || this.idToEntity.get(entityPathOrId);
    if (!entity) throw new Error('未找到要移动的云端条目');
    const folderId = this._resolveFolderId(targetFolderPathOrId);
    if (entity.entityType === 'folder' && entity.id === folderId) {
      throw new Error('不能将文件夹移动到自身');
    }
    await this.session.request(`/project/${this.projectId}/${entity.entityType}/${entity.id}/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': this.csrf
      },
      body: JSON.stringify({ folder_id: folderId })
    });
    this._applyTreeEvent({ kind: 'moveEntity', entityId: entity.id, folderId });
    const updated = this.idToEntity.get(entity.id);
    return { ok: true, id: entity.id, path: updated?.path || '' };
  }

  async deleteEntity(entityPathOrId) {
    this._requireWritable();
    const entity = this.pathToEntity.get(entityPathOrId) || this.idToEntity.get(entityPathOrId);
    if (!entity) throw new Error('未找到要删除的云端条目');
    await this.session.request(`/project/${this.projectId}/${entity.entityType}/${entity.id}`, {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': this.csrf }
    });
    this._applyTreeEvent({ kind: 'removeEntity', entityId: entity.id });
    return { ok: true };
  }

  async setRootDoc(docPathOrId) {
    this._requireWritable();
    const entity = this.pathToEntity.get(docPathOrId) || this.idToEntity.get(docPathOrId);
    if (!entity || entity.entityType !== 'doc') throw new Error('请选择有效的 .tex 文档作为主文档');
    await this.session.request(`/project/${this.projectId}/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': this.csrf
      },
      body: JSON.stringify({ rootDocId: entity.id })
    });
    this._applyTreeEvent({ kind: 'newRootDoc', docId: entity.id });
    return { ok: true, rootFile: this.rootFile };
  }

  async uploadFile(parentFolderPathOrId, localFilePath) {
    this._requireWritable();
    if (!localFilePath || typeof localFilePath !== 'string') throw new Error('未选择要上传的文件');
    const folderId = this._resolveFolderId(parentFolderPathOrId);
    const fileName = path.basename(localFilePath);
    const buffer = await fsp.readFile(localFilePath);
    if (buffer.length > 50 * 1024 * 1024) throw new Error('单文件上传不能超过 50 MB');
    const form = new FormData();
    form.set('name', fileName);
    form.set('qqfile', new Blob([buffer]), fileName);
    const res = await this.session.request(`/project/${this.projectId}/upload?folder_id=${encodeURIComponent(folderId)}`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': this.csrf },
      body: form
    });
    const data = await res.json();
    if (!data?.success) throw new Error(data?.error || 'Overleaf 未确认上传成功');
    if (data.entity_id) {
      const kind = data.entity_type === 'doc' ? 'newDoc' : 'newFile';
      this._applyTreeEvent({ kind, parentFolderId: folderId, entity: { _id: data.entity_id, name: fileName } });
    }
    const entity = data.entity_id ? this.idToEntity.get(data.entity_id) : null;
    if (this.mirrorReady && entity?.rel) {
      this._mirrorPendingFiles.delete(entity.id);
      await this._writeMirrorFile(entity.rel, buffer).catch(() => {});
    }
    return { ok: true, id: data.entity_id || '', name: fileName, path: entity?.path || '' };
  }

  async fetchFile(filePathOrId) {
    if (!this.active) throw new Error('尚未连接 Overleaf 实时项目');
    if (!this.session || typeof this.session.request !== 'function') throw new Error('Overleaf 网络会话不可用');
    if (!this.cacheDir) throw new Error('未配置本地缓存目录');
    const entity = this.pathToEntity.get(filePathOrId) || this.idToEntity.get(filePathOrId);
    if (!entity || entity.entityType !== 'file') throw new Error('未找到对应的云端资源文件');
    const ext = extOfName(entity.name);
    const dir = path.join(this.cacheDir, this.projectId, 'files');
    await fsp.mkdir(dir, { recursive: true });
    const target = path.join(dir, `${entity.id}${ext ? '.' + ext : ''}`);
    const res = await this.session.request(`/project/${this.projectId}/file/${entity.id}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 64 * 1024 * 1024) throw new Error('资源文件超过预览大小限制（64 MB）');
    const tmp = `${target}.${crypto.randomUUID()}.tmp`;
    await fsp.writeFile(tmp, buf);
    await replaceFile(tmp, target);
    return { ok: true, localPath: target, name: entity.name, ext };
  }

  async updateSettings(patch = {}) {
    this._requireWritable();
    const allowed = {};
    if (typeof patch.compiler === 'string' && ['pdflatex', 'xelatex', 'lualatex', 'latex'].includes(patch.compiler)) {
      allowed.compiler = patch.compiler;
    }
    if (typeof patch.imageName === 'string' && patch.imageName.trim()) {
      allowed.imageName = patch.imageName.trim();
    }
    if (typeof patch.spellCheckLanguage === 'string') {
      allowed.spellCheckLanguage = patch.spellCheckLanguage;
    }
    if (typeof patch.rootDocId === 'string' && ID_RE.test(patch.rootDocId)) {
      allowed.rootDocId = patch.rootDocId;
    } else if (typeof patch.rootFile === 'string') {
      const ent = this.pathToEntity.get(patch.rootFile);
      if (ent?.entityType === 'doc') allowed.rootDocId = ent.id;
    }
    if (Object.keys(allowed).length === 0) return { ok: true, ...this.state() };

    await this.session.request(`/project/${this.projectId}/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': this.csrf
      },
      body: JSON.stringify(allowed)
    });

    if (this.project) {
      if (allowed.compiler) this.project.compiler = allowed.compiler;
      if (allowed.imageName) this.project.imageName = allowed.imageName;
      if (allowed.spellCheckLanguage !== undefined) this.project.spellCheckLanguage = allowed.spellCheckLanguage;
      if (allowed.rootDocId) {
        this.project.rootDoc_id = allowed.rootDocId;
        this._rebuildTree();
      }
    }
    const snapshot = this.state();
    this.emitToRenderer({
      type: 'settingsChanged',
      compiler: snapshot.compiler,
      imageName: snapshot.imageName,
      spellCheckLanguage: snapshot.spellCheckLanguage,
      rootFile: snapshot.rootFile
    });
    return { ok: true, ...snapshot };
  }

  async clearCompileCache() {
    this._requireWritable();
    const params = new URLSearchParams();
    if (this.lastClsiServerId) params.set('clsiserverid', this.lastClsiServerId);
    const qs = params.toString();
    await this.session.request(`/project/${this.projectId}/output${qs ? '?' + qs : ''}`, {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': this.csrf }
    });
    this.lastBuildId = '';
    return { ok: true };
  }

  async fetchHistory({ before } = {}) {
    if (!this.active) throw new Error('尚未连接 Overleaf 实时项目');
    if (!this.session || typeof this.session.request !== 'function') throw new Error('Overleaf 网络会话不可用');
    const params = new URLSearchParams({ min_count: '15' });
    if (before) params.set('before', String(before));
    const updatesRes = await this.session.request(`/project/${this.projectId}/updates?${params.toString()}`, {
      headers: { Accept: 'application/json' }
    });
    const updatesData = await updatesRes.json();

    let labels = [];
    if (!before) {
      try {
        const labelsRes = await this.session.request(`/project/${this.projectId}/labels`, {
          headers: { Accept: 'application/json' }
        });
        const labelsData = await labelsRes.json();
        if (Array.isArray(labelsData)) labels = labelsData;
      } catch {}
    }

    const rawUpdates = Array.isArray(updatesData?.updates) ? updatesData.updates : [];
    const updates = rawUpdates.map((u) => {
      const users = (Array.isArray(u?.meta?.users) ? u.meta.users : []).map((usr) => {
        const full = [usr?.first_name, usr?.last_name].filter(Boolean).join(' ').trim();
        return full || usr?.email || '协作者';
      });
      const files = Array.isArray(u?.pathnames) ? u.pathnames : [];
      return {
        fromV: Number(u?.fromV) || 0,
        toV: Number(u?.toV) || 0,
        endTs: Number(u?.meta?.end_ts) || 0,
        startTs: Number(u?.meta?.start_ts) || 0,
        users,
        pathnames: files,
        labels: labels.filter((l) => Number(l?.version) >= Number(u?.fromV) && Number(l?.version) <= Number(u?.toV))
      };
    });

    return {
      ok: true,
      updates,
      labels,
      nextBeforeTimestamp: updatesData?.nextBeforeTimestamp || null,
      freeHistoryLimitHit: Boolean(updatesData?.freeHistoryLimitHit)
    };
  }

  async fetchHistoryDiff({ pathname, from, to }) {
    if (!this.active) throw new Error('尚未连接 Overleaf 实时项目');
    if (!this.session || typeof this.session.request !== 'function') throw new Error('Overleaf 网络会话不可用');
    if (!pathname) throw new Error('缺少历史文件路径');
    const params = new URLSearchParams({
      pathname: String(pathname),
      from: String(Number(from) || 0),
      to: String(Number(to) || 0)
    });
    const res = await this.session.request(`/project/${this.projectId}/diff?${params.toString()}`, {
      headers: { Accept: 'application/json' }
    });
    const data = await res.json();
    const chunks = Array.isArray(data?.diff) ? data.diff : [];
    let beforeText = '';
    let afterText = '';
    for (const part of chunks) {
      if (typeof part?.u === 'string') {
        beforeText += part.u;
        afterText += part.u;
      } else if (typeof part?.d === 'string') {
        beforeText += part.d;
      } else if (typeof part?.i === 'string') {
        afterText += part.i;
      }
    }
    return { ok: true, pathname, beforeText, afterText, chunks };
  }

  async _readDocTextForSearch(entity) {
    const activeClient = this.docs.get(entity.id);
    if (activeClient) return activeClient.text;
    if (this.docTextCache.has(entity.id)) return this.docTextCache.get(entity.id);
    if (this._pendingDocReads.has(entity.id)) return this._pendingDocReads.get(entity.id);
    const task = (async () => {
      const res = await this._requestBridge('joinDoc', { docId: entity.id }, 10000);
      const text = (res.docLines || []).map((line) => decodeOverleafUtf8(line)).join('\n');
      this.docTextCache.set(entity.id, text);
      if (!this.docs.has(entity.id)) {
        void this._requestBridge('leaveDoc', { docId: entity.id }, 4000).catch(() => {});
      }
      return text;
    })();
    this._pendingDocReads.set(entity.id, task);
    try {
      return await task;
    } finally {
      this._pendingDocReads.delete(entity.id);
    }
  }

  _findEntityByPathLoose(fileOrPath) {
    if (!fileOrPath) return null;
    const direct = this.pathToEntity.get(fileOrPath) || this.idToEntity.get(fileOrPath);
    if (direct) return direct;
    const norm = String(fileOrPath).replace(/\\/g, '/');
    const rel = this._normalizeRelPath(norm);
    if (rel) {
      const exactVpath = `${overleafRoot(this.projectId)}/${rel}`;
      if (this.pathToEntity.has(exactVpath)) return this.pathToEntity.get(exactVpath);
      const relLower = rel.toLowerCase();
      for (const ent of this.pathToEntity.values()) {
        if ((ent.rel || '').toLowerCase() === relLower) return ent;
      }
    }
    return null;
  }

  async readDocText(fileOrPath) {
    if (!this.active) return { ok: false, error: '尚未连接 Overleaf 实时项目' };
    const entity = this._findEntityByPathLoose(fileOrPath) || (!/\.[a-z0-9]+$/i.test(String(fileOrPath || '')) ? this._findEntityByPathLoose(String(fileOrPath) + '.tex') : null);
    if (!entity) return { ok: false, error: '云端项目未找到该文件' };
    if (entity.entityType !== 'doc') return { ok: false, error: '该云端文件为非文本资源' };
    try {
      const text = await this._readDocTextForSearch(entity);
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: err?.message || '读取云端文档失败' };
    }
  }

  async searchProject({ query, regex = false, caseSensitive = false, wholeWord = false, include = '' } = {}) {
    if (!this.active) throw new Error('尚未连接 Overleaf 实时项目');
    const q = String(query || '');
    if (!q) return { ok: true, matches: [], truncated: false };

    let pattern;
    try {
      const escaped = regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const source = wholeWord ? `\\b(?:${escaped})\\b` : escaped;
      pattern = new RegExp(source, caseSensitive ? 'g' : 'gi');
    } catch (err) {
      return { ok: false, error: `无效的正则表达式：${err.message}` };
    }

    const inc = String(include || '').trim().toLowerCase();
    const docEntities = [...this.pathToEntity.values()].filter((e) => {
      if (e.entityType !== 'doc') return false;
      if (!inc) return true;
      const relLower = (e.rel || '').toLowerCase();
      if (inc.includes('*')) {
        const re = new RegExp('^' + inc.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
        return re.test(relLower) || re.test((e.name || '').toLowerCase());
      }
      return relLower.includes(inc);
    });

    const matches = [];
    const MAX_MATCHES = 500;
    let truncated = false;

    // Fetch & scan in small concurrent batches
    const CONCURRENCY = 4;
    for (let i = 0; i < docEntities.length && !truncated; i += CONCURRENCY) {
      const batch = docEntities.slice(i, i + CONCURRENCY);
      const texts = await Promise.all(batch.map((ent) => this._readDocTextForSearch(ent).catch(() => '')));
      for (let j = 0; j < batch.length && !truncated; j++) {
        const ent = batch[j];
        const lines = String(texts[j] || '').split('\n');
        for (let ln = 0; ln < lines.length; ln++) {
          const lineText = lines[ln];
          pattern.lastIndex = 0;
          const m = pattern.exec(lineText);
          if (m) {
            matches.push({
              file: ent.path,
              rel: ent.rel,
              line: ln + 1,
              col: m.index + 1,
              text: lineText
            });
            if (matches.length >= MAX_MATCHES) {
              truncated = true;
              break;
            }
          }
        }
      }
    }

    return { ok: true, matches, truncated };
  }

  _upsertUser(raw) {
    if (!raw) return;
    const id = String(raw.client_id || raw.id || raw.user_id || '');
    if (!id) return;
    const prev = this.users.get(id) || {};
    const cursor = raw.cursorData && typeof raw.cursorData === 'object' ? raw.cursorData : raw;
    const first = raw.first_name || '';
    const last = raw.last_name || '';
    const fullName = [first, last].filter(Boolean).join(' ').trim() || raw.name || raw.email || prev.name || '协作者';
    const row = typeof cursor.row === 'number' ? cursor.row : (typeof raw.row === 'number' ? raw.row : (prev.row ?? 0));
    const column = typeof cursor.column === 'number' ? cursor.column : (typeof raw.column === 'number' ? raw.column : (prev.column ?? 0));
    const docId = cursor.doc_id || raw.doc_id || prev.doc_id || '';
    this.users.set(id, {
      id,
      user_id: raw.user_id || prev.user_id || '',
      name: fullName,
      email: raw.email || prev.email || '',
      row,
      column,
      doc_id: docId,
      color: prev.color || colorForUser(raw.user_id || id)
    });
  }

  _emitUsers() {
    this.emitToRenderer({ type: 'usersChanged', users: this._serializeUsers() });
  }

  _applyTreeEvent(payload) {
    if (!this.project?.rootFolder?.[0] || !payload) return;
    const rootFolder = this.project.rootFolder[0];
    const { kind, parentFolderId, entity, entityId, newName, folderId, docId } = payload;
    const prevEntity = entityId ? this.idToEntity.get(entityId) : null;
    const prevRel = prevEntity?.rel || '';

    if (kind === 'newDoc' && entity) {
      const target = findFolderById(rootFolder, parentFolderId) || rootFolder;
      target.docs = target.docs || [];
      if (!target.docs.some((d) => d._id === entity._id)) target.docs.push(entity);
    } else if (kind === 'newFile' && entity) {
      const target = findFolderById(rootFolder, parentFolderId) || rootFolder;
      target.fileRefs = target.fileRefs || [];
      if (!target.fileRefs.some((f) => f._id === entity._id)) target.fileRefs.push(entity);
    } else if (kind === 'newFolder' && entity) {
      const target = findFolderById(rootFolder, parentFolderId) || rootFolder;
      target.folders = target.folders || [];
      if (!target.folders.some((f) => f._id === entity._id)) target.folders.push({ docs: [], fileRefs: [], folders: [], ...entity });
    } else if (kind === 'removeEntity' && entityId) {
      removeEntityFromFolder(rootFolder, entityId);
      this.docs.delete(entityId);
    } else if (kind === 'renameEntity' && entityId && newName) {
      renameEntityInFolder(rootFolder, entityId, newName);
    } else if (kind === 'moveEntity' && entityId && folderId) {
      const removed = removeEntityFromFolder(rootFolder, entityId);
      const dest = findFolderById(rootFolder, folderId);
      if (removed && dest) {
        const key = removed.type === 'doc' ? 'docs' : removed.type === 'file' ? 'fileRefs' : 'folders';
        dest[key] = dest[key] || [];
        dest[key].push(removed.item);
      }
    } else if (kind === 'newRootDoc' && docId) {
      this.project.rootDoc_id = docId;
    }

    this._rebuildTree();

    if (this.mirrorReady) {
      if (kind === 'newDoc' && entity?._id) {
        const created = this.idToEntity.get(entity._id);
        if (created?.rel) {
          this._mirrorDirtyDocs.add(entity._id);
          void this._writeMirrorFile(created.rel, Buffer.from('', 'utf8')).catch(() => {});
        }
      } else if (kind === 'newFile' && entity?._id) {
        this._mirrorPendingFiles.add(entity._id);
      } else if (kind === 'newFolder' && entity?._id) {
        const created = this.idToEntity.get(entity._id);
        const target = created?.rel ? this._mirrorPathForRel(created.rel) : '';
        if (target) void fsp.mkdir(target, { recursive: true }).catch(() => {});
      } else if (kind === 'removeEntity' && prevRel) {
        void this._removeMirrorFile(prevRel);
      } else if ((kind === 'renameEntity' || kind === 'moveEntity') && entityId) {
        const nextEntity = this.idToEntity.get(entityId);
        const fromPath = prevRel ? this._mirrorPathForRel(prevRel) : '';
        const toPath = nextEntity?.rel ? this._mirrorPathForRel(nextEntity.rel) : '';
        if (fromPath && toPath && fromPath !== toPath) {
          void (async () => {
            try {
              await fsp.mkdir(path.dirname(toPath), { recursive: true });
              await fsp.rename(fromPath, toPath);
            } catch {
              this._mirrorNeedsFullSync = true;
            }
          })();
        } else {
          this._mirrorNeedsFullSync = true;
        }
      }
    }

    this.emitToRenderer({
      type: 'treeChanged',
      tree: this.tree,
      rootFile: this.rootFile,
      assets: this.assets
    });
  }

  handleBridgeEvent(type, payload) {
    if (type === 'connected') {
      this.project = payload.project;
      this.csrf = payload.csrf || '';
      this.access = normalizeAccess(payload.permissionsLevel ?? payload.project?.accessLevel ?? payload.project?.privilegeLevel);
      this.protocolVersion = payload.protocolVersion || 2;
      this.userId = payload.userId || '';
      this.status = 'connected';
      this.users.clear();
      this._rebuildTree();
      const snapshot = this.state();
      this.emitToRenderer({ type: 'status', status: 'connected', projectId: this.projectId, name: snapshot.name });
      this._connectDeferred?.resolve(snapshot);
      // Fetch initial connected collaborators in background
      void this._requestBridge('getConnectedUsers', {}, 8000).then((users) => {
        if (!Array.isArray(users)) return;
        for (const u of users) this._upsertUser(u);
        this._emitUsers();
      }).catch(() => {});
      return;
    }

    if (type === 'connectError' || type === 'connectionRejected') {
      const msg = payload?.message || '无法连接 Overleaf 项目';
      this.status = 'disconnected';
      this.emitToRenderer({ type: 'status', status: 'disconnected', error: msg });
      this._connectDeferred?.reject(new Error(msg));
      return;
    }

    if (type === 'status') {
      this.status = payload?.status || this.status;
      this.emitToRenderer({ type: 'status', status: this.status, reconnected: Boolean(payload?.reconnected) });
      if (payload?.reconnected) {
        for (const docId of this.docs.keys()) {
          void this.resyncDoc(docId);
        }
        void this._requestBridge('getConnectedUsers', {}, 8000).then((users) => {
          if (!Array.isArray(users)) return;
          this.users.clear();
          for (const u of users) this._upsertUser(u);
          this._emitUsers();
        }).catch(() => {});
      }
      return;
    }

    if (type === 'joinDocResponse') {
      this._resolveRequest(payload.requestId, payload, payload.error);
      return;
    }

    if (type === 'leaveDocResponse') {
      this._resolveRequest(payload.requestId, payload, payload.error);
      return;
    }

    if (type === 'connectedUsersResponse') {
      this._resolveRequest(payload.requestId, payload.users, payload.error);
      return;
    }

    if (type === 'otUpdateApplied') {
      let docId = payload?.doc;
      if (!docId) {
        const inflight = [...this.docs.entries()].filter(([, c]) => c.inFlight);
        if (inflight.length === 1) docId = inflight[0][0];
      }
      const client = docId ? this.docs.get(docId) : null;
      if (!client) return;
      try {
        const res = client.receiveServerUpdate(payload);
        this.docTextCache.set(docId, client.text);
        if (this.mirrorReady) this._mirrorDirtyDocs.add(docId);
        if (res.kind === 'ack' && res.nextPacket) {
          this._sendBridgeCmd('applyOtUpdate', { docId, update: res.nextPacket });
        } else if (res.kind === 'remote' && res.remoteOp?.length) {
          const entity = this.idToEntity.get(docId);
          this.emitToRenderer({
            type: 'remoteOp',
            docId,
            path: entity?.path || '',
            op: res.remoteOp,
            version: client.version,
            meta: payload?.meta || null
          });
        }
        this.emitToRenderer({
          type: 'docSyncState',
          docId,
          pending: client.pending,
          version: client.version
        });
      } catch {
        void this.resyncDoc(docId);
      }
      return;
    }

    if (type === 'otUpdateError') {
      if (payload?.doc) void this.resyncDoc(payload.doc);
      return;
    }

    if (type === 'treeEvent') {
      this._applyTreeEvent(payload);
      return;
    }

    if (type === 'clientUpdated') {
      this._upsertUser(payload);
      this._emitUsers();
      return;
    }

    if (type === 'clientDisconnected') {
      const id = String(payload?.id || payload || '');
      if (id && this.users.delete(id)) this._emitUsers();
      return;
    }

    if (type === 'chatMessage') {
      const msg = this._normalizeChatMessage(payload);
      if (msg) this.emitToRenderer({ type: 'chatMessage', message: msg });
      return;
    }

    if (type === 'commentEvent') {
      const kind = payload?.kind || '';
      const threadId = String(payload?.threadId || '');
      if (kind === 'deleteThread' && threadId) this.commentAnchors.delete(threadId);
      const comment = payload?.comment ? this._normalizeThreadMessage(payload.comment) : null;
      const user = payload?.user ? this._formatCollabUser(payload.user) : null;
      this.emitToRenderer({
        type: 'commentEvent',
        kind,
        threadId,
        comment,
        user,
        messageId: payload?.messageId ? String(payload.messageId) : '',
        content: typeof payload?.content === 'string' ? payload.content : ''
      });
    }
  }

  _formatCollabUser(u) {
    if (!u || typeof u !== 'object') return { id: '', name: '协作者', email: '' };
    const id = String(u.id || u._id || u.user_id || '');
    const first = String(u.first_name || u.firstName || '').trim();
    const last = String(u.last_name || u.lastName || '').trim();
    const email = String(u.email || '').trim();
    const name = [first, last].filter(Boolean).join(' ') || String(u.name || '').trim() || email || '协作者';
    return { id, name, email };
  }

  _normalizeChatMessage(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const content = typeof raw.content === 'string' ? raw.content : '';
    const id = String(raw.id || raw._id || `${raw.timestamp || Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const timestamp = Number(raw.timestamp) || Date.parse(raw.timestamp) || Date.now();
    return {
      id,
      content,
      timestamp,
      user: this._formatCollabUser(raw.user)
    };
  }

  _normalizeThreadMessage(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || raw._id || `${raw.timestamp || Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const timestamp = Number(raw.timestamp) || Date.parse(raw.timestamp) || Date.now();
    const user = raw.user ? this._formatCollabUser(raw.user) : { id: String(raw.user_id || ''), name: String(raw.user_name || raw.user_id || '协作者'), email: '' };
    return {
      id,
      content: typeof raw.content === 'string' ? raw.content : '',
      timestamp,
      user
    };
  }

  _recordDocRanges(entity, ranges) {
    if (!entity || !ranges || !Array.isArray(ranges.comments)) return;
    for (const item of ranges.comments) {
      const op = item?.op || item;
      const threadId = String(op?.t || item?.threadId || '');
      if (!threadId) continue;
      this.commentAnchors.set(threadId, {
        docId: entity.id,
        path: entity.path,
        rel: entity.rel || entity.name,
        offset: Number(op?.p) || 0,
        text: typeof op?.c === 'string' ? decodeOverleafUtf8(op.c) : ''
      });
    }
  }

  async _collabRequest(endpoint, { method = 'GET', body = null } = {}) {
    if (!this.active) throw new Error('尚未连接 Overleaf 实时项目');
    if (!this.session || typeof this.session.request !== 'function') throw new Error('Overleaf 网络会话不可用');
    if (method !== 'GET' && !this.csrf) throw new Error('缺少 Overleaf CSRF 令牌，请重新连接项目');
    const headers = {
      Accept: 'application/json',
      Referer: `https://www.overleaf.com/project/${this.projectId}`,
      ...(method !== 'GET' ? { 'X-CSRF-Token': this.csrf } : {}),
      ...(body !== null ? { 'Content-Type': 'application/json' } : {})
    };
    const res = await this.session.request(endpoint, {
      method,
      headers,
      ...(body !== null ? { body: JSON.stringify(body) } : {})
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Overleaf 请求失败（HTTP ${res.status}）`);
    }
    if (!res.body) return null;
    try { return JSON.parse(res.body.toString('utf8')); } catch { return null; }
  }

  async fetchChatMessages({ limit = 50, before = '' } = {}) {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (before) qs.set('before', String(before));
    const data = await this._collabRequest(`/project/${this.projectId}/messages?${qs.toString()}`);
    const list = Array.isArray(data) ? data : (Array.isArray(data?.messages) ? data.messages : []);
    const messages = list.map((m) => this._normalizeChatMessage(m)).filter(Boolean).sort((a, b) => a.timestamp - b.timestamp);
    return { ok: true, messages };
  }

  async sendChatMessage(content) {
    const text = String(content || '').trim();
    if (!text) throw new Error('消息内容不能为空');
    await this._collabRequest(`/project/${this.projectId}/messages`, {
      method: 'POST',
      body: { content: text, _csrf: this.csrf }
    });
    return { ok: true };
  }

  async fetchCommentThreads() {
    const data = await this._collabRequest(`/project/${this.projectId}/threads`);
    const threads = [];
    if (data && typeof data === 'object') {
      for (const [threadId, raw] of Object.entries(data)) {
        if (!raw || typeof raw !== 'object') continue;
        const messages = Array.isArray(raw.messages)
          ? raw.messages.map((m) => this._normalizeThreadMessage(m)).filter(Boolean).sort((a, b) => a.timestamp - b.timestamp)
          : [];
        const lastTs = messages.length ? messages[messages.length - 1].timestamp : 0;
        threads.push({
          id: threadId,
          resolved: Boolean(raw.resolved),
          resolvedBy: raw.resolved_by_user ? this._formatCollabUser(raw.resolved_by_user) : null,
          resolvedAt: raw.resolved_at ? (Number(raw.resolved_at) || Date.parse(raw.resolved_at) || 0) : 0,
          anchor: this.commentAnchors.get(threadId) || null,
          messages,
          updatedAt: lastTs
        });
      }
    }
    threads.sort((a, b) => b.updatedAt - a.updatedAt);
    return { ok: true, threads };
  }

  async addCommentThread({ docIdOrPath = '', offset = 0, excerpt = '', content = '' } = {}) {
    const text = String(content || '').trim();
    if (!text) throw new Error('批注内容不能为空');
    const threadId = crypto.randomBytes(12).toString('hex');
    await this._collabRequest(`/project/${this.projectId}/thread/${threadId}/messages`, {
      method: 'POST',
      body: { content: text, _csrf: this.csrf }
    });
    const entity = docIdOrPath ? (this.pathToEntity.get(docIdOrPath) || this.idToEntity.get(docIdOrPath)) : null;
    if (entity) {
      const anchor = {
        docId: entity.id,
        path: entity.path,
        rel: entity.rel || entity.name,
        offset: Number(offset) || 0,
        text: String(excerpt || '').slice(0, 160)
      };
      this.commentAnchors.set(threadId, anchor);
      // Best-effort attach comment range to doc if joined and writable
      const client = this.docs.get(entity.id);
      if (client && ['owner', 'readAndWrite', 'read-write'].includes(this.access)) {
        try {
          this._sendBridgeCmd('applyOtUpdate', {
            docId: entity.id,
            update: { doc: entity.id, op: [{ p: Math.max(0, Number(offset) || 0), c: String(excerpt || ' ').slice(0, 160), t: threadId }], v: client.version }
          });
        } catch {}
      }
    }
    return { ok: true, threadId };
  }

  async replyCommentThread(threadId, content) {
    const text = String(content || '').trim();
    if (!threadId || !text) throw new Error('回复内容不能为空');
    await this._collabRequest(`/project/${this.projectId}/thread/${encodeURIComponent(threadId)}/messages`, {
      method: 'POST',
      body: { content: text, _csrf: this.csrf }
    });
    return { ok: true };
  }

  async resolveCommentThread(threadId) {
    if (!threadId) throw new Error('无效的批注编号');
    await this._collabRequest(`/project/${this.projectId}/thread/${encodeURIComponent(threadId)}/resolve`, {
      method: 'POST',
      body: { _csrf: this.csrf }
    });
    return { ok: true };
  }

  async reopenCommentThread(threadId) {
    if (!threadId) throw new Error('无效的批注编号');
    await this._collabRequest(`/project/${this.projectId}/thread/${encodeURIComponent(threadId)}/reopen`, {
      method: 'POST',
      body: { _csrf: this.csrf }
    });
    return { ok: true };
  }

  async deleteCommentThread(threadId) {
    if (!threadId) throw new Error('无效的批注编号');
    await this._collabRequest(`/project/${this.projectId}/thread/${encodeURIComponent(threadId)}`, {
      method: 'DELETE'
    });
    this.commentAnchors.delete(threadId);
    return { ok: true };
  }
}

module.exports = {
  OverleafLiveManager,
  buildTreeFromProject,
  buildBridgeScript,
  overleafRoot,
  decodeOverleafUtf8
};
