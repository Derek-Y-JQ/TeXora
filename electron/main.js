'use strict';
/**
 * TeXora — Electron main process.
 * Serves the bundled UI over a privileged app:// protocol, wires IPC to the
 * TeX toolchain, keeps settings/history/state and supports screenshot capture
 * for automated visual verification.
 */
const { app, BrowserWindow, ipcMain, protocol, net, shell, dialog, clipboard, Menu, nativeTheme } = require('electron');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');

const { Store } = require('./lib/store');
const { ProjectService } = require('./lib/fsops');
const { TexEnv } = require('./lib/texenv');
const { CodeTools } = require('./lib/code-tools');
const { Compiler } = require('./lib/compiler');
const { History } = require('./lib/history');
const { AiService } = require('./lib/ai');
const { AiHistory } = require('./lib/ai-history');
const { GitService, findGit } = require('./lib/git');
const { searchProject, replaceProject } = require('./lib/search');
const { checkForUpdates } = require('./lib/updater');
const PKG = require('../package.json');

const DIST = path.join(__dirname, '..', 'dist');
app.setName('TeXora');
// Packaged builds keep the stable %APPDATA%\\TeXora store (settings survive updates).
// Development runs use an isolated store, and tests can override it explicitly.
const USER_DATA =
  process.env.TEXORA_USER_DATA ||
  (app.isPackaged ? app.getPath('userData') : path.join(app.getPath('appData'), 'TeXora-dev'));
try { fs.mkdirSync(USER_DATA, { recursive: true }); } catch {}

// ---------------------------------------------------------------- CLI options
const argv = process.argv.slice(1);
function arg(name, fallback = '') {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const idx = hit.indexOf('=');
  return idx >= 0 ? hit.slice(idx + 1) : '1';
}

const capture = {
  enabled: argv.includes('--capture') || argv.some((a) => a.startsWith('--capture=')),
  out: arg('capture', '').startsWith('--') ? '' : arg('capture', ''),
  delay: Number(arg('capture-delay', '1600')) || 1600,
  view: arg('view', ''),
  subview: arg('subview', ''),
  theme: arg('theme', ''),
  width: Number(arg('width', '1600')) || 1600,
  height: Number(arg('height', '1000')) || 1000,
  project: arg('project', ''),
  zoom: arg('zoom', '')
};
if (capture.enabled && capture.out && !path.isAbsolute(capture.out)) capture.out = path.resolve(capture.out);
if (capture.enabled) app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

// --------------------------------------------------------------- scheme setup
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  },
  {
    scheme: 'asset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, bypassCSP: true }
  }
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm'
};
function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

// -------------------------------------------------------------------- services
const store = new Store(USER_DATA);
const project = new ProjectService(store, USER_DATA);
const tex = new TexEnv(store, USER_DATA);
const history = new History('', path.join(USER_DATA, 'history'));
const ai = new AiService(store);
const aiHistory = new AiHistory(path.join(USER_DATA, 'ai-history.json'));
let git = new GitService(project);
let win = null;
let ready = false;

function send(channel, payload) {
  if (win && !win.isDestroyed()) {
    try { win.webContents.send(channel, payload); } catch {}
  }
}

const compiler = new Compiler({ store, project, tex, history, send, fallbackCacheRoot: USER_DATA });
const codeTools = new CodeTools({ tex, store, project, userData: USER_DATA });

// --------------------------------------------------------------------- window
function createWindow() {
  const saved = store.get('ui.window', null);
  const bounds = capture.enabled
    ? { width: capture.width, height: capture.height }
    : { width: saved?.width || 1480, height: saved?.height || 920, x: saved?.x, y: saved?.y };

  win = new BrowserWindow({
    ...bounds,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    frame: false,
    backgroundColor: store.get('appearance.theme') === 'light' ? '#f4f5f8' : '#0d0f16',
    title: 'TeXora',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      webviewTag: false,
      backgroundThrottling: false
    }
  });

  const query = new URLSearchParams();
  if (capture.enabled) {
    query.set('capture', '1');
    if (capture.view) query.set('view', capture.view);
    if (capture.subview) query.set('subview', capture.subview);
    if (capture.theme) query.set('theme', capture.theme);
    if (capture.zoom) query.set('zoom', capture.zoom);
  }
  const qs = query.toString();
  win.loadURL('app://texora/index.html' + (qs ? '?' + qs : ''));

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (capture.enabled) console.log('[renderer]', level, message, line ? sourceId + ':' + line : '');
  });
  win.webContents.on('render-process-gone', (e, details) => console.error('[renderer-gone]', details));
  win.once('ready-to-show', () => {
    win.show();
    if (capture.enabled) win.setBounds({ x: 0, y: 0, width: capture.width, height: capture.height });
  });

  const persist = () => {
    if (!win || win.isDestroyed() || win.isMaximized() || win.isFullScreen()) return;
    store.set('ui.window', win.getBounds());
  };
  win.on('resize', debounce(persist, 400));
  win.on('move', debounce(persist, 400));
  win.on('maximize', () => send('window:state', { maximized: true }));
  win.on('unmaximize', () => send('window:state', { maximized: false }));
  win.on('closed', () => {
    win = null;
    ready = false;
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://')) event.preventDefault();
  });

  // clipboard images pasted as files (Electron handles clipboard.readImage via IPC)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ---------------------------------------------------------------- app protocol
app.whenReady().then(async () => {
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname);
      if (!rel || rel === '/') rel = '/index.html';
      const full = path.normalize(path.join(DIST, rel));
      if (!full.startsWith(path.normalize(DIST))) return new Response('forbidden', { status: 403 });
      const data = await fsp.readFile(full);
      return new Response(data, { headers: { 'content-type': mimeFor(full), 'cache-control': 'no-cache' } });
    } catch (err) {
      return new Response('not found: ' + err.message, { status: 404 });
    }
  });

  protocol.handle('asset', async (request) => {
    try {
      const url = new URL(request.url);
      const p = url.searchParams.get('p');
      if (!p) return new Response('missing path', { status: 400 });
      const data = await fsp.readFile(p);
      return new Response(data, { headers: { 'content-type': mimeFor(p), 'cache-control': 'no-store' } });
    } catch (err) {
      return new Response('not found', { status: 404 });
    }
  });

  const cliProject = capture.project || arg('project', '');
  if (cliProject) {
    try { await project.open(cliProject); } catch (err) { console.error('[startup] project open failed', err.message); }
  } else if (store.get('general.reopenLastProject', true)) {
    const last = store.get('ui.lastProject', '');
    if (last && fs.existsSync(last)) {
      try { await project.open(last); } catch {}
    }
  }
  tex.detect();
  try { ai.ensureBuiltinSkill(path.join(__dirname, '..', 'skills', 'lieflat-less-ai-tone.md')); } catch (err) { console.warn('[skill]', err.message); }
  tex.version().then((v) => { tex.cache.version = v; tex._writeCache(); }).catch(() => {});
  history.setRoot(project.root, store.get('files.historyMaxDays', 14));

  createWindow();
  setupMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (store.get('build.cleanOnExit', false)) {
    try { compiler.clean(false); } catch {}
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try {
    if (win && !win.isDestroyed() && !win.isMaximized()) store.set('ui.window', win.getBounds());
  } catch {}
});

function setupMenu() {
  const template = [
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '开发者工具', accelerator: 'F12' }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  if (win) win.setMenuBarVisibility(false);
}

// ------------------------------------------------------------------ IPC utils
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(`[ipc] ${channel}`, err);
      return { ok: false, error: err.message || String(err) };
    }
  });
}

function broadcastSettings() {
  send('settings:changed', store.all());
}

// ----------------------------------------------------------------- app / window
handle('app:systemFonts', async () => {
  try {
    const { execFile } = require('node:child_process');
    const query = (key) => new Promise((resolve) => {
      execFile('reg', ['query', key], { windowsHide: true }, (err, stdout) => resolve(err ? '' : String(stdout || '')));
    });
    const outputs = [
      await query('HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'),
      await query('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts')
    ];
    const seen = new Set();
    for (const out of outputs) {
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes('REG_SZ')) continue;
        let name = line.slice(0, line.indexOf('REG_SZ')).trim();
        name = name.replace(/\s*\((TrueType|OpenType|Type 1|All res)\)\s*$/i, '');
        name = name.replace(/\s+(Regular|Bold|Italic|Bold Italic|Light|Medium|Black|Semibold|SemiBold|Thin|ExtraLight|ExtraBold)\s*$/i, '');
        if (!name || seen.has(name) || /\d+,\d+/.test(name) || /math/i.test(name)) continue;
        if (!/(mono|\bcode\b|consolas|courier|fira|jetbrains|cascadia|hack|inconsolata|source|dejavu|ubuntu|menlo|monaco|terminal|typewriter|fixed)/i.test(name)) continue;
        seen.add(name);
      }
    }
    return { ok: true, fonts: Array.from(seen).sort((a, b) => a.localeCompare(b)) };
  } catch (err) {
    return { ok: false, fonts: [], error: err.message };
  }
});

function githubRepo() {
  const value = typeof PKG.repository === 'string' ? PKG.repository : (PKG.repository && PKG.repository.url) || '';
  const m = String(value).match(/github\.com[\/:]([^\/]+)\/([^\/.]+)/i);
  return m ? m[1] + '/' + m[2].replace(/\.git$/i, '') : '';
}

handle('update:check', async () => {
  try {
    return await checkForUpdates({ repo: githubRepo(), current: app.getVersion() });
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

handle('app:info', async () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  userData: USER_DATA,
  osVersion: os.release(),
  home: os.homedir(),
  git: findGit() || '',
  initialProject: project.info(),
  settings: store.all(),
  capture: { enabled: capture.enabled, view: capture.view, subview: capture.subview, theme: capture.theme }
}));
handle('app:ready', async () => {
  ready = true;
  return { ok: true };
});
handle('window:minimize', async () => { win?.minimize(); return { ok: true }; });
handle('window:toggleMaximize', async () => {
  if (!win) return { ok: false };
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return { ok: true, maximized: win.isMaximized() };
});
handle('window:close', async () => { win?.close(); return { ok: true }; });
handle('window:isMaximized', async () => ({ maximized: !!win?.isMaximized() }));
handle('app:openExternal', async (url) => {
  if (!/^(https?:|mailto:)/i.test(url)) return { ok: false, error: 'unsupported url' };
  await shell.openExternal(url);
  return { ok: true };
});
handle('app:showItemInFolder', async (p) => { if (p) shell.showItemInFolder(p); return { ok: true }; });
handle('app:openPath', async (p) => {
  if (!p) return { ok: false, error: '未指定路径' };
  const err = await shell.openPath(p);
  return err ? { ok: false, error: err } : { ok: true };
});
handle('window:setZoom', async (factor) => {
  const f = Math.max(0.75, Math.min(1.5, Number(factor) || 1));
  try { win?.webContents.setZoomFactor(f); } catch {}
  return { ok: true, factor: f };
});

handle('app:captureNow', async (outPath) => {
  if (!win) return { ok: false };
  const image = await win.webContents.capturePage();
  const target = path.isAbsolute(outPath || '') ? outPath : path.join(DIST, '..', outPath || '.capture/shot.png');
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, image.toPNG());
  return { ok: true, path: target, size: image.getSize() };
});

// ------------------------------------------------------------------- settings
handle('settings:get', async () => store.all());
handle('settings:set', async (patchOrKey, value) => {
  store.set(patchOrKey, value);
  broadcastSettings();
  if (patchOrKey === 'tex.binPath' || patchOrKey === 'build.engine') tex.detect();
  return store.all();
});
handle('settings:reset', async (section) => {
  store.reset(section);
  broadcastSettings();
  return store.all();
});
handle('settings:defaults', async () => require('./lib/store').DEFAULT_SETTINGS);
handle('theme:native', async (shouldUseDark) => {
  nativeTheme.themeSource = shouldUseDark ? 'dark' : 'light';
  return { ok: true };
});

// --------------------------------------------------------------------- dialog
handle('dialog:openFolder', async () => {
  const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: '打开项目文件夹' });
  return { ok: !res.canceled, path: res.filePaths[0] || '' };
});
handle('dialog:openFiles', async (opts = {}) => {
  const res = await dialog.showOpenDialog(win, {
    properties: opts.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: opts.filters || [
      { name: 'LaTeX', extensions: ['tex', 'ltx', 'sty', 'cls', 'bib'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    title: opts.title || '选择文件'
  });
  return { ok: !res.canceled, paths: res.filePaths };
});
handle('dialog:saveFile', async (opts = {}) => {
  const res = await dialog.showSaveDialog(win, {
    title: opts.title || '保存文件',
    defaultPath: opts.defaultPath || undefined,
    filters: opts.filters || [{ name: '所有文件', extensions: ['*'] }]
  });
  return { ok: !res.canceled, path: res.filePath || '' };
});
handle('dialog:message', async (opts = {}) => {
  const res = await dialog.showMessageBox(win, {
    type: opts.type || 'info',
    title: opts.title || 'TeXora',
    message: opts.message || '',
    detail: opts.detail || '',
    buttons: opts.buttons || ['确定'],
    cancelId: opts.cancelId ?? 0,
    defaultId: opts.defaultId ?? 0,
    noLink: true
  });
  return { ok: true, response: res.response };
});

// -------------------------------------------------------------------- project
handle('project:open', async (target) => {
  let root = target;
  if (!root || !fs.existsSync(root)) {
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: '打开 LaTeX 项目文件夹' });
    if (res.canceled) return { ok: false, canceled: true };
    root = res.filePaths[0];
  }
  compiler.stop();
  compiler.lastResult = null;
  const info = await project.open(root);
  if (info.cancelled) return { ok: false, canceled: true };
  history.setRoot(project.root, store.get('files.historyMaxDays', 14));
  git = new GitService(project);
  send('project:changed', { ...info, reason: 'open' });
  return { ok: true, ...info };
});
handle('project:info', async () => ({ ok: true, ...project.info() }));
handle('project:close', async () => {
  compiler.stop();
  compiler.lastResult = null;
  project.close();
  send('project:changed', { root: '', reason: 'close' });
  return { ok: true };
});
handle('project:tree', async () => ({ ok: true, tree: await project.tree(), info: project.info() }));
handle('project:assets', async () => ({ ok: true, ...(await project.assets()) }));
handle('project:setRootFile', async (file) => {
  project.rootFile = file;
  store.set('project.rootFile.' + Buffer.from(project.root).toString('hex').slice(0, 12), file);
  return { ok: true, rootFile: file };
});
handle('project:refreshRoot', async () => {
  project.rootFile = await project.detectRootFile();
  return { ok: true, rootFile: project.rootFile };
});

// ------------------------------------------------------------------- file ops
handle('fs:read', async (file) => ({ ok: true, ...(await project.read(file)) }));
handle('fs:write', async (file, text) => {
  const res = await project.write(file, text);
  return { ok: true, ...res };
});
handle('fs:stat', async (file) => {
  try {
    const st = await fsp.stat(file);
    return { ok: true, size: st.size, mtime: st.mtimeMs, dir: st.isDirectory() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
handle('fs:createFile', async (dir, name, content) => ({ ok: true, path: await project.createFile(dir, name, content) }));
handle('fs:createDir', async (dir, name) => ({ ok: true, path: await project.createDir(dir, name) }));
handle('fs:rename', async (from, to) => ({ ok: true, path: await project.rename(from, to) }));
handle('fs:delete', async (target) => {
  const res = await dialog.showMessageBox(win, {
    type: 'warning',
    title: '删除确认',
    message: `确定删除 ${path.basename(target)} 吗？`,
    detail: '此操作不可撤销。',
    buttons: ['删除', '取消'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  });
  if (res.response !== 0) return { ok: false, canceled: true };
  await project.remove(target);
  return { ok: true };
});
handle('fs:saveImage', async (dir, filename, base64) => ({ ok: true, ...(await project.saveImage(dir, filename, base64)) }));
handle('fs:readBinary', async (file) => {
  const buf = await fsp.readFile(file);
  return { ok: true, base64: buf.toString('base64'), size: buf.length };
});
handle('fs:moveInto', async (file, dir) => {
  const dest = await project.moveInto(file, dir);
  return { ok: true, path: dest };
});

// ------------------------------------------------------------------ clipboard
handle('clipboard:readImage', async () => {
  const img = clipboard.readImage();
  if (!img || img.isEmpty()) return { ok: false, empty: true };
  const size = img.getSize();
  return { ok: true, dataUrl: img.toDataURL(), size };
});
handle('clipboard:writeText', async (text) => { clipboard.writeText(String(text ?? '')); return { ok: true }; });
handle('clipboard:readText', async () => ({ ok: true, text: clipboard.readText() }));

// ---------------------------------------------------------------------- build
handle('build:run', async (opts = {}) => compiler.build(opts));
handle('build:stop', async () => { compiler.stop(); return { ok: true }; });
handle('build:clean', async (all = false) => compiler.clean(!!all));
handle('build:last', async () => compiler.lastResult || { ok: false });
handle('build:existing', async () => compiler.loadExisting());
handle('build:state', async () => ({ running: compiler.running }));

// --------------------------------------------------------------------- TeX env
handle('tex:info', async () => ({ ok: true, ...tex.info() }));
handle('tex:refresh', async () => {
  tex.detect();
  const v = await tex.version();
  if (v) { tex.cache.version = v; tex._writeCache(); }
  return { ok: true, ...tex.info() };
});
handle('tex:packages', async (query, limit) => ({ ok: true, ...(await tex.searchPackages(query || '', limit || 200)) }));
handle('tex:fonts', async (force) => ({ ok: true, fonts: await tex.fonts(!!force) }));
handle('tex:installPackage', async (name) => ({ ok: true, ...(await tex.installPackage(name)) }));
handle('tex:codeStatus', async options => codeTools.status(options));
handle('tex:prepareCode', async options => codeTools.prepare(options));
handle('tex:styFiles', async () => ({ ok: true, files: await tex.styFiles() }));

handle('tex:envDefs', async (payload = {}) => {
  const exe = tex.get('kpsewhich');
  if (!exe) return { ok: false, defs: {}, error: '未检测到 kpsewhich' };
  const { run } = require('./lib/run');
  const root = project.root || '';
  const names = [payload.cls, ...(payload.packages || [])].filter(Boolean).map((s) => String(s).trim()).filter(Boolean).slice(0, 60);
  const defs = {};
  for (const name of names) {
    const file = /.(sty|cls)$/i.test(name) ? name : name + '.sty';
    let found = '';
    const local = path.join(root, file);
    if (root && fs.existsSync(local)) found = local;
    if (!found) {
      try {
        const res = await run(exe, [file], { cwd: root, env: tex.env, timeout: 15000 });
        found = (res.output || '').split(/\r?\n/).map((s) => s.trim()).find((s) => /\.(sty|cls)$/i.test(s)) || '';
      } catch {}
    }
    if (!found) continue;
    const content = await fsp.readFile(found, 'utf8').catch(() => '');
    if (!content) continue;
    const label = name.replace(/\.(sty|cls)$/i, '');
    for (const m of content.matchAll(/\\(?:newenvironment|NewDocumentEnvironment|DeclareDocumentEnvironment|newtheorem)\*?\{([^}]+)\}/g)) {
      const env = m[1].trim();
      if (env && !defs[env]) defs[env] = label;
    }
  }
  return { ok: true, defs };
});
handle('tex:synctexForward', async (file, line, column) => compiler.synctexForward(file, line, column));
handle('tex:synctexInverse', async (page, x, y) => compiler.synctexInverse(page, x, y));
handle('tex:snippet', async (payload) => compiler.snippet(payload));
handle('tex:lint', async (file) => compiler.lint(file));
handle('tex:latexdiff', async (a, b, outName) => compiler.latexdiff(a, b, outName));
handle('tex:kpsewhich', async (name) => {
  if (!tex.get('kpsewhich')) return { ok: false, error: 'kpsewhich 不可用' };
  const { capture: cap } = require('./lib/run');
  const out = await cap(tex.get('kpsewhich'), [name], { env: tex.env, timeout: 20000 });
  return { ok: true, path: out.trim().split(/\r?\n/)[0] || '' };
});

// ------------------------------------------------------------- DOI / arXiv
handle('lookup:doi', async (rawId) => {
  const id = String(rawId || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  if (!id) return { ok: false, error: '请输入 DOI 或 arXiv ID' };
  const escapeBib = (s) => String(s || '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  const keyFor = (family, year, title) => {
    const word = String(title || '').split(/\s+/).find((w) => w.length > 3) || 'ref';
    return (String(family || 'ref').toLowerCase().replace(/[^a-z]/g, '') + (year || '') + word.toLowerCase().replace(/[^a-z]/g, '').slice(0, 4)) || 'ref';
  };
  try {
    if (/^\d{4}\.\d{4,5}(v\d+)?$/.test(id) || /arxiv\.org/i.test(rawId)) {
      const arxivId = id.replace(/^arxiv:/i, '').replace(/v\d+$/, '');
      const res = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) return { ok: false, error: `arXiv 请求失败（HTTP ${res.status}）` };
      const xml = await res.text();
      const entry = (xml.match(/<entry>([\s\S]*?)<\/entry>/) || [])[1] || '';
      if (!entry) return { ok: false, error: '未找到该 arXiv 条目' };
      const title = escapeBib((entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
      const authors = Array.from(entry.matchAll(/<name>([\s\S]*?)<\/name>/g)).map((m) => escapeBib(m[1]));
      const published = (entry.match(/<published>(\d{4})/) || [])[1] || '';
      const doi = (entry.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/) || [])[1] || '';
      const journal = escapeBib((entry.match(/<arxiv:journal_ref[^>]*>([\s\S]*?)<\/arxiv:journal_ref>/) || [])[1]);
      const key = keyFor(authors[0]?.split(/\s+/).pop(), published, title);
      const bibtex = `@article{${key},
  title         = {{${title}}},
  author        = {${authors.join(' and ')}},
  year          = {${published}},
  eprint        = {${arxivId}},
  archivePrefix = {arXiv},${journal ? `\n  journal       = {${journal}},` : ''}${doi ? `\n  doi           = {${doi}},` : ''}
  url           = {https://arxiv.org/abs/${arxivId}}
}`;
      return { ok: true, bibtex, source: 'arXiv' };
    }
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(id)}`, {
      headers: { 'User-Agent': 'TeXora/1.0 (mailto:texora@example.com)' },
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) return { ok: false, error: `Crossref 请求失败（HTTP ${res.status}），请检查 DOI 是否正确` };
    const data = await res.json();
    const m = data.message || {};
    const title = escapeBib((m.title || [])[0]);
    const authors = (m.author || []).map((a) => (a.family ? `${a.family}${a.given ? ', ' + a.given : ''}` : a.name || '')).filter(Boolean);
    const year = m.issued?.['date-parts']?.[0]?.[0] || m.published?.['date-parts']?.[0]?.[0] || '';
    const journal = escapeBib((m['container-title'] || [])[0] || '');
    const typeMap = { 'journal-article': 'article', proceedings: 'inproceedings', 'proceedings-article': 'inproceedings', book: 'book', 'book-chapter': 'incollection', dissertation: 'phdthesis', report: 'techreport' };
    const type = typeMap[m.type] || 'article';
    const key = keyFor((m.author || [])[0]?.family, year, title);
    const lines = [`@${type}{${key},`, `  title        = {{${title}}},`, `  author       = {${authors.join(' and ')}},`, `  year         = {${year}},`];
    if (journal) lines.push(`  ${type === 'article' ? 'journal' : 'booktitle'}      = {${journal}},`);
    if (m.volume) lines.push(`  volume       = {${m.volume}},`);
    if (m.issue) lines.push(`  number       = {${m.issue}},`);
    if (m.page) lines.push(`  pages        = {${m.page}},`);
    if (m.publisher) lines.push(`  publisher    = {${escapeBib(m.publisher)}},`);
    lines.push(`  doi          = {${m.DOI || id}},`);
    lines.push(`  url          = {https://doi.org/${m.DOI || id}}`);
    lines.push('}');
    return { ok: true, bibtex: lines.join('\n'), source: 'Crossref' };
  } catch (err) {
    return { ok: false, error: `网络请求失败：${err.message}` };
  }
});

// -------------------------------------------------------------------- search
handle('search:project', async (options) => searchProject(project.root, options || {}));
handle('search:replace', async (options) => replaceProject(project.root, options || {}));

// ------------------------------------------------------------------- history
handle('history:list', async (file) => ({ ok: true, items: history.list(file) }));
handle('history:read', async (id) => history.read(id));
handle('history:restore', async (id) => history.restore(id));
handle('history:snapshot', async (file, content, reason) => {
  const id = history.snapshot(file, content, reason || 'manual');
  return { ok: !!id, id };
});

// ------------------------------------------------------------------------ AI
handle('ai:providers', async () => ({ ok: true, providers: ai.providers() }));
handle('ai:chat', async (payload) => ai.chat(payload));
handle('ai:cancel', async (id) => ai.cancel(id));
handle('ai:historyList', async (root) => ({ ok: true, records: aiHistory.list(root) }));
handle('ai:historySave', async (record) => aiHistory.save(record));
handle('ai:test', async (payload) => ai.test(payload));
handle('ai:skills', async () => ({ ok: true, skills: await ai.listSkills() }));
handle('ai:skillAdd', async (filePath) => ai.addSkill(filePath));
handle('ai:skillRemove', async (id) => ai.removeSkill(id));
handle('ai:skillToggle', async (id, enabled) => ai.toggleSkill(id, enabled));
handle('ai:skillRead', async (id) => ai.readSkill(id));
handle('ai:skillSave', async (id, content) => ai.saveSkillContent(id, content));

// ----------------------------------------------------------------------- git
handle('git:status', async () => git.status());
handle('git:log', async (limit) => git.log(limit));
handle('git:diff', async (file, staged) => git.diff(file, staged));
handle('git:stage', async (file) => git.stage(file));
handle('git:commit', async (message, all) => git.commit(message, all));
handle('git:pull', async () => git.pull());
handle('git:push', async () => git.push());
handle('git:branches', async () => git.branches());
handle('git:checkout', async (branch) => git.checkout(branch));
handle('git:init', async () => git.init());

// fs watch → renderer
project.on('changed', (payload) => send('fs:changed', payload));
store.on('change', () => broadcastSettings());

// ------------------------------------------------------------------- capture
ipcMain.on('capture:done', () => {});
async function runCapture() {
  if (!capture.enabled) return;
  setTimeout(async () => {
    try {
      if (!capture.out) {
        app.quit();
        return;
      }
      const image = await win.webContents.capturePage();
      await fsp.mkdir(path.dirname(capture.out), { recursive: true });
      await fsp.writeFile(capture.out, image.toPNG());
      console.log('[capture] saved', capture.out, image.getSize());
    } catch (err) {
      console.error('[capture] failed', err);
    } finally {
      setTimeout(() => app.quit(), 150);
    }
  }, capture.delay);
}

ipcMain.on('app:renderer-ready', () => {
  if (capture.enabled) runCapture();
});
