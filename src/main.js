/**
 * TeXora renderer entry: boot, layout, documents, build pipeline, panels.
 */
import { ctx } from './js/ctx.js';
import { openUpdateDownload } from './js/external-links.js';
import { enumLabelEdit } from './js/live-math.js';
import { packageInsertion } from './js/code-blocks.js';
import { projectOutline } from './js/project-outline.js';
import { EditorController, monaco, clearMathPreviewCache } from './js/editor.js';
import { PreviewController } from './js/preview.js';
import { Sidebar } from './js/sidebar.js';
import { createCommands } from './js/commands.js';
import { createRibbon } from './js/ribbon.js';
import { createDialogs } from './js/dialogs.js';
import { createSettingsUI } from './js/settings-ui.js';
import { createAI } from './js/ai.js';
import { parseBib } from './js/bib.js';
import { beautify, normalizePunctuation, applyDisplayStyle, splitLines, ENVIRONMENTS } from './js/latex.js';
import { renderMarkdown } from './js/markdown.js';
import {
  $, $$, el, icon, escapeHtml, toast, baseName, extOf, relPath, debounce, clamp, textStats, formatBytes, copyText, openMenu, openPopover
} from './js/util.js';

const api = window.texora;
ctx.api = api;

let info = null;
let mdMode = false;
let autosaveTimers = new Map();
let liveTimer = null;
let problemsTab = 'all';
let problemsOpen = false;
let lastPages = [];
let buildStartedAt = 0;
let dirtyStatusTimer = null;
let buildPreparing = false;

/* --------------------------------------------------------------------- boot */
async function boot() {
  info = await api.info();
  ctx.state.settings = info.settings;
  ctx.state.capture = { ...info.capture, version: info.version };
  ctx.state.theme = resolveTheme(info.settings.appearance.theme);
  applyAppearance({ initial: true });

  // controllers
  ctx.editor = new EditorController();
  ctx.editor.init($('#editorHost'));
  ctx.preview = new PreviewController();
  ctx.preview.init();
  ctx.sidebar = new Sidebar();
  ctx.sidebar.init();
  ctx.dialogs = createDialogs();
  ctx.settingsUI = createSettingsUI();
  ctx.commands = createCommands();
  ctx.ribbon = createRibbon();
  ctx.ribbon.init();
  ctx.ai = createAI();

  wireWindowControls();
  wireTitlebar();
  wireSplitters();
  wireStatusbar();
  wireFindBar();
  wireProblems();
  wireShortcutsExtras();
  wireIpc();
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (ctx.state.settings?.appearance?.theme === 'system') applyAppearance();
  });

  const proj = info.initialProject || {};
  if (proj.root) {
    ctx.state.project = { ...proj };
    await onProjectOpened(proj, { openRoot: true, silent: true });
  } else {
    renderTabs();
    renderEmptyRecent(proj.recent || []);
    setEmptyState(true);
  }
  updateStats();
  updateThemeLabel();

  // background environment discovery
  refreshTexInfo();
  ctx.state.fonts = (info.settings.tex.fonts ? [] : []);
  api.tex.fonts().then((res) => (ctx.state.fonts = res.fonts || [])).catch(() => {});
  api.systemFonts().then((res) => (ctx.state.systemFonts = res.fonts || [])).catch(() => {});
  loadPackages();
  api.project.onFsChange((payload) => onExternalChange(payload));

  if (info.capture?.enabled) await applyCaptureView();

  window.__texora = ctx;
  api.ready();
  setTimeout(() => {
    const g = ctx.state.settings?.general || {};
    if (g.autoCheckUpdates !== false && Date.now() - Number(g.lastUpdateCheck || 0) > 24 * 3600 * 1000) {
      checkUpdates(false);
    }
  }, 5000);
  requestAnimationFrame(() => document.body.classList.add('ready'));
}

function resolveTheme(pref) {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return pref === 'light' ? 'light' : 'dark';
}

function applyAppearance({ initial = false } = {}) {
  const s = ctx.state.settings;
  const theme = resolveTheme(s.appearance.theme);
  ctx.state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-accent', s.appearance.accent || 'blue');
  document.documentElement.toggleAttribute('data-compact', !!s.appearance.compact);
  document.documentElement.setAttribute('data-reduce-motion', s.appearance.reduceMotion ? '1' : '0');
  document.documentElement.style.setProperty('--sidebar-w', (s.ui.sidebarWidth || 292) + 'px');
  document.documentElement.style.setProperty('--preview-w', (s.ui.previewWidth || 468) + 'px');
  let custom = document.getElementById('texora-custom-css');
  if (!custom) {
    custom = document.createElement('style');
    custom.id = 'texora-custom-css';
    document.head.appendChild(custom);
  }
  custom.textContent = s.appearance.customCss || '';
  api.theme.native(theme === 'dark');
  if (initial) api.window.setZoom?.((s.appearance.uiScale || 100) / 100);
  else api.window.setZoom?.((s.appearance.uiScale || 100) / 100);
  ctx.editor?.applySettings();
  ctx.preview?.applyInvert();
  updateThemeLabel();
}

function updateThemeLabel() {
  const elx = $('#sbTheme');
  if (elx) elx.textContent = ctx.state.theme === 'light' ? '白天' : '夜晚';
}

/* ---------------------------------------------------------------- window ui */
function wireWindowControls() {
  $('#winMin').addEventListener('click', () => api.window.minimize());
  $('#winMax').addEventListener('click', () => api.window.toggleMaximize());
  $('#winClose').addEventListener('click', () => api.window.close());
  api.window.onState(({ maximized }) => {
    const use = $('#winMax');
    if (use) use.innerHTML = icon(maximized ? 'restore' : 'maximize');
  });
  $('.titlebar').addEventListener('dblclick', (e) => {
    if (e.target.closest('button, .cmdk, .project-pill')) return;
    api.window.toggleMaximize();
  });
  $('#themeToggle').addEventListener('click', () => ctx.cmd('view.toggleTheme'));
  $('#updateBtn').addEventListener('click', async () => { const btn=$('#updateBtn');if(btn.disabled)return;btn.disabled=true;try{await checkUpdates(true);}finally{btn.disabled=false;} });
  $('#settingsBtn').addEventListener('click', () => ctx.cmd('settings.open'));
  $('#commandBar').addEventListener('click', () => ctx.commands.openPalette());
  $('#brand').addEventListener('click', () => ctx.cmd('view.sidebar', 'files'));
}

function wireTitlebar() {
  const pill = $('#projectPill');
  pill.addEventListener('click', () => {
    const recent = (ctx.state.project.recent || []).slice(0, 8);
    const items = [
      { label: '打开文件夹…', icon: 'folder', key: 'Ctrl+O', onClick: () => ctx.cmd('project.open') },
      { label: '新建文档…', icon: 'plus', key: 'Ctrl+N', onClick: () => ctx.cmd('project.new') },
      { label: '模板中心', icon: 'layers', onClick: () => ctx.cmd('templates.open') }
    ];
    if (recent.length) {
      items.push({ separator: true }, { group: '最近项目' });
      for (const r of recent) {
        items.push({
          label: r.name || baseName(r.path),
          icon: 'folder',
          tooltip: r.path,
          onClick: async () => {
            const res = await api.project.open(r.path);
            if (res.ok) await onProjectOpened(res, { openRoot: true });
            else toast({ type: 'error', title: '无法打开项目', body: res.error || '' });
          }
        });
      }
    }
    if (ctx.state.project.root) {
      items.push({ separator: true }, { label: '在资源管理器中显示', icon: 'external', onClick: () => api.showItemInFolder(ctx.state.project.root) });
      items.push({ label: '关闭项目', icon: 'close', onClick: () => ctx.cmd('project.close') });
    }
    openMenu(pill, items, { align: 'left', minWidth: 260 });
  });
  $('#sbRootFile').addEventListener('click', () => chooseRootFile());
}

function wireStatusbar() {
  const sb = $('#sbBuild');
  sb.addEventListener('click', () => (ctx.state.build.running ? ctx.cmd('build.stop') : ctx.cmd('build.run')));
  $('#sbProblems').addEventListener('click', () => ctx.cmd('build.toggleProblems'));
  $('#sbLive').addEventListener('click', () => ctx.cmd('view.livePreview'));
  $('#sbTheme').addEventListener('click', () => ctx.cmd('view.toggleTheme'));
  $('#sbWrap').addEventListener('click', () => ctx.cmd('view.toggleWordWrap'));
}

/* -------------------------------------------------------------- find bar */
const findState = { matches: [], index: 0, open: false, replace: false, caseSensitive: false, decor: null, timer: 0 };

function findBarEl() { return $('#findBar'); }

function ensureFindDecor() {
  if (!findState.decor && ctx.editor?.editor) {
    findState.decor = ctx.editor.editor.createDecorationsCollection([]);
  }
  return findState.decor;
}

function openFind(replaceMode = false) {
  const bar = findBarEl();
  if (!bar) return;
  findState.open = true;
  findState.replace = !!replaceMode;
  bar.classList.add('open');
  bar.querySelector('.find-replace-line').classList.toggle('hidden', !replaceMode);
  const ed = ctx.editor?.editor;
  if (ed) {
    const sel = ed.getSelection();
    if (sel && !sel.isEmpty()) {
      const txt = ed.getModel().getValueInRange(sel);
      if (txt && !txt.includes('\n') && txt.length < 160) $('#findInput').value = txt;
    }
    $('#findInput').focus();
    $('#findInput').select();
  }
  runFind(false);
}

function closeFind() {
  const bar = findBarEl();
  if (!bar) return;
  findState.open = false;
  bar.classList.remove('open');
  ensureFindDecor()?.clear();
  findState.matches = [];
  ctx.editor?.editor?.focus();
}

function findQueryInfo() {
  const raw = $('#findInput').value;
  const m = raw.match(/^\/(.*)\/([gimsuy]*)$/);
  if (m) {
    let flags = m[2] || 'gi';
    if (findState.caseSensitive) flags = flags.replace(/i/g, '');
    else if (!flags.includes('i')) flags += 'i';
    if (!flags.includes('g')) flags += 'g';
    return { query: m[1], regex: true, flags };
  }
  return { query: raw, regex: false, flags: findState.caseSensitive ? 'g' : 'gi' };
}

function runFind(keep = false) {
  if (!ctx.editor?.model) return;
  const info = findQueryInfo();
  const bar = findBarEl();
  if (!bar) return;
  if (!info.query) {
    findState.matches = [];
    ensureFindDecor()?.clear();
    $('#findCount').textContent = '0/0';
    return;
  }
  let matches = [];
  try {
    if (info.regex) {
      const re = new RegExp(info.query, info.flags.includes('g') ? info.flags : info.flags + 'g');
      const text = ctx.editor.model.getValue();
      let mm;
      while ((mm = re.exec(text))) {
        if (!mm[0]) { re.lastIndex++; continue; }
        const before = text.slice(0, mm.index);
        const line = before.split('\n').length;
        const col = mm.index - before.lastIndexOf('\n');
        matches.push({ range: { startLineNumber: line, startColumn: col, endLineNumber: line, endColumn: col + mm[0].length } });
        if (matches.length > 5000) break;
      }
    } else {
      matches = ctx.editor.model.findMatches(info.query, false, false, findState.caseSensitive, null, false).map((x) => x.range);
    }
  } catch (err) {
    toast({ type: 'error', title: '查找表达式无效', body: err.message, timeout: 2200 });
    return;
  }
  findState.matches = matches;
  if (!keep || findState.index >= matches.length) findState.index = 0;
  const dec = ensureFindDecor();
  if (dec) {
    dec.set(matches.map((r) => ({ range: r, options: { className: 'find-match' } })));
  }
  if (matches.length) selectFindMatch(findState.index);
  else $('#findCount').textContent = '0/0';
}

function selectFindMatch(idx) {
  const matches = findState.matches;
  if (!matches.length) return;
  findState.index = ((idx % matches.length) + matches.length) % matches.length;
  const range = matches[findState.index];
  const ed = ctx.editor.editor;
  ed.setSelection(range);
  ed.revealRangeInCenter(range);
  $('#findCount').textContent = (findState.index + 1) + '/' + matches.length;
  ensureFindDecor()?.set([
    ...matches.map((r, i) => ({ range: r, options: { className: i === findState.index ? 'find-match-current' : 'find-match' } }))
  ]);
}

function stepFind(delta) {
  if (!findState.matches.length) runFind(false);
  if (!findState.matches.length) return;
  selectFindMatch(findState.index + delta);
}

function replacementForMatch(range) {
  const info = findQueryInfo();
  const text = ctx.editor.model.getValueInRange(range);
  const replacement = $('#findReplace').value;
  if (!info.regex) return replacement;
  try {
    const re = new RegExp(info.query, (info.flags || 'gi').replace('g', ''));
    return text.replace(re, replacement);
  } catch { return replacement; }
}

function replaceCurrent() {
  if (!ctx.editor?.model) return;
  if (!findState.matches.length) runFind(false);
  if (!findState.matches.length) return;
  const range = findState.matches[findState.index];
  const text = replacementForMatch(range);
  ctx.editor.editor.executeEdits('find-replace', [{ range, text }]);
  runFind(true);
}

function replaceAllLocal() {
  if (!ctx.editor?.model) return;
  const info = findQueryInfo();
  if (!info.query) return;
  const replacement = $('#findReplace').value;
  const model = ctx.editor.model;
  const text = model.getValue();
  let next = text;
  let count = 0;
  try {
    if (info.regex) {
      const re = new RegExp(info.query, info.flags.includes('g') ? info.flags : info.flags + 'g');
      count = (text.match(re) || []).length;
      next = text.replace(re, replacement);
    } else {
      const re = new RegExp(info.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), findState.caseSensitive ? 'g' : 'gi');
      count = (text.match(re) || []).length;
      next = text.replace(re, () => replacement);
    }
  } catch (err) {
    return toast({ type: 'error', title: '替换失败', body: err.message });
  }
  if (!count) return toast({ type: 'info', title: '没有匹配项' });
  model.pushEditOperations([], [{ range: model.getFullModelRange(), text: next }], () => null);
  toast({ type: 'success', title: '已替换 ' + count + ' 处（当前文件）' });
  runFind(false);
}

function wireFindBar() {
  const bar = findBarEl();
  if (!bar) return;
  const input = $('#findInput');
  input.addEventListener('input', () => {
    clearTimeout(findState.timer);
    findState.timer = setTimeout(() => runFind(false), 180);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); }
    if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
  });
  $('#findReplace').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); replaceCurrent(); }
    if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
  });
  $('#findNext').addEventListener('click', () => stepFind(1));
  $('#findPrev').addEventListener('click', () => stepFind(-1));
  $('#findCase').addEventListener('click', () => {
    findState.caseSensitive = !findState.caseSensitive;
    $('#findCase').classList.toggle('active', findState.caseSensitive);
    runFind(false);
  });
  $('#findClose').addEventListener('click', closeFind);
  $('#findToggleReplace').addEventListener('click', () => {
    findState.replace = !findState.replace;
    bar.querySelector('.find-replace-line').classList.toggle('hidden', !findState.replace);
    if (findState.replace) $('#findReplace').focus();
  });
  $('#findReplaceOne').addEventListener('click', replaceCurrent);
  $('#findReplaceAll').addEventListener('click', replaceAllLocal);
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = String(e.key || '').toLowerCase();
    if (key !== 'f' && key !== 'h') return;
    if (document.querySelector('#modalLayer .modal, #paletteLayer .palette')) return;
    e.preventDefault();
    openFind(key === 'h');
  });
}

function wireProblems() {
  for (const tab of $$('.ptab')) {
    tab.addEventListener('click', () => {
      problemsTab = tab.dataset.problems;
      for (const t of $$('.ptab')) t.classList.toggle('active', t === tab);
      renderProblems();
    });
  }
}

function wireShortcutsExtras() {
  window.addEventListener('beforeunload', () => {
    ctx.editor?.saveViewState();
  });
}

function wireSplitters() {
  const setup = (splitterId, side) => {
    const sp = $(splitterId);
    if (!sp) return;
    sp.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sp.classList.add('dragging');
      const startX = e.clientX;
      const sidebar = $('#sidebar');
      const preview = $('#previewPane');
      const start = side === 'sidebar' ? sidebar.getBoundingClientRect().width : preview.getBoundingClientRect().width;
      const move = (ev) => {
        const delta = side === 'sidebar' ? ev.clientX - startX : startX - ev.clientX;
        const width = side === 'sidebar' ? clamp(start + delta, 220, 520) : clamp(start + delta, 280, 900);
        if (side === 'sidebar') {
          document.documentElement.style.setProperty('--sidebar-w', width + 'px');
          ctx.state.settings.ui.sidebarWidth = Math.round(width);
        } else {
          document.documentElement.style.setProperty('--preview-w', width + 'px');
          ctx.state.settings.ui.previewWidth = Math.round(width);
        }
        ctx.editor?.resize();
        ctx.preview?.relayout();
      };
      const up = () => {
        sp.classList.remove('dragging');
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        if (side === 'sidebar') api.settings.set('ui.sidebarWidth', ctx.state.settings.ui.sidebarWidth);
        else api.settings.set('ui.previewWidth', ctx.state.settings.ui.previewWidth);
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
    sp.addEventListener('dblclick', () => {
      const def = side === 'sidebar' ? 292 : 468;
      document.documentElement.style.setProperty(side === 'sidebar' ? '--sidebar-w' : '--preview-w', def + 'px');
      ctx.state.settings.ui[side === 'sidebar' ? 'sidebarWidth' : 'previewWidth'] = def;
      api.settings.set(side === 'sidebar' ? 'ui.sidebarWidth' : 'ui.previewWidth', def);
      ctx.editor?.resize();
      ctx.preview?.relayout();
    });
  };
  setup('#splitterSidebar', 'sidebar');
  setup('#splitterPreview', 'preview');
}

function wireIpc() {
  api.settings.onChange((next) => {
    const prevAppearance = JSON.stringify(ctx.state.settings.appearance || {});
    ctx.state.settings = next;
    if (prevAppearance !== JSON.stringify(next.appearance || {})) applyAppearance();
    else {
      ctx.editor?.applySettings();
      ctx.preview?.applyInvert();
    }
    ctx.emit('settings:changed');
  });
  api.project.onChange((payload) => {
    if (payload.reason === 'close') {
      resetProjectPreview();
      ctx.state.project = { root: '', name: '', rootFile: '', recent: payload.recent || [] };
      closeAllDocuments();
      setEmptyState(true);
      renderEmptyRecent(payload.recent || []);
      renderTabs();
      $('#projectName').textContent = '未打开项目';
      ctx.sidebar.refreshAll(true);
      ctx.emit('project:changed', payload);
    } else if (payload.reason === 'open') {
      /* handled by caller of open() */
    }
  });

  api.build.onStatus((st) => {
    if (previewSuspended || (st.projectRoot && (st.projectRoot !== ctx.state.project.root || st.revision !== ctx.state.project.revision))) return;
    if (st.state === 'running') {
      ctx.state.build.running = true;
      ctx.state.build.state = 'running';
      setBuildStatus('building', st.pass ? `编译中 ${st.pass}/${st.total || st.runs || '?'}` : '编译中…');
      ctx.preview.setBusy(true);
      $('#btnBuild')?.classList.add('busy');
    } else {
      if (ctx.state.build.state === 'running') ctx.state.build.state = 'idle';
      ctx.state.build.running = false;
      ctx.preview.setBusy(false);
      if (ctx.state.build.state !== 'ok' && ctx.state.build.state !== 'error') setBuildStatus('idle', ctx.state.build.stopping ? '已停止' : '空闲');
    }
  });
  api.build.onLog((payload) => {
    if (payload.reset) ctx.state.log = '';
    ctx.state.log += payload.chunk || '';
    if (ctx.state.log.length > 400000) ctx.state.log = ctx.state.log.slice(-300000);
    if (problemsOpen && problemsTab === 'log') renderProblems();
  });
  api.build.onDone((result) => handleBuildDone(result));
}

/* ------------------------------------------------------------- project ops */
async function autoSelectEngine(silent = false) {
  if (ctx.state.settings.build.autoEngine === false) return;
  const root = ctx.state.project.root;
  const rootFile = ctx.state.project.rootFile;
  if (!root || !rootFile) return;
  const files = [rootFile];
  for (const rel of (ctx.state.assets?.tex || []).slice(0, 40)) {
    const full = root + '\\' + String(rel).split('/').join('\\');
    if (full !== rootFile) files.push(full);
  }
  let text = '';
  for (const file of files) {
    const res = await api.fs.read(file).catch(() => null);
    if (res?.ok && res.text) {
      text += '\n' + res.text;
      if (/[\u3400-\u9fff]/.test(text) && /ctex|xeCJK|fontspec/.test(text)) break;
    }
  }
  let engine = 'pdflatex';
  if (/luatexja|luacode|luatexbase/.test(text)) engine = 'lualatex';
  else if (/[\u3400-\u9fff]/.test(text) || /ctex|xeCJK|fontspec/.test(text)) engine = 'xelatex';
  if (engine === ctx.state.settings.build.engine) return;
  ctx.state.settings.build.engine = engine;
  await api.settings.set('build.engine', engine);
  ctx.ribbon.refresh();
  if (!silent) {
    const label = engine === 'xelatex' ? 'XeLaTeX（中文项目）' : engine === 'lualatex' ? 'LuaLaTeX（Lua 项目）' : 'pdfLaTeX（英文项目）';
    toast({ type: 'info', title: '已自动切换编译引擎', body: label, timeout: 2200 });
  }
}

async function refreshEnvDefs() {
  const rootFile = ctx.state.project.rootFile;
  const local = {};
  ctx.state.envDefs = {};
  if (!rootFile) return;
  try {
    const files = [];
    for (const rel of (ctx.state.assets?.tex || []).slice(0, 60)) {
      files.push(String(rel).split('/').join('\\'));
    }
    const texts = [];
    const fileTexts = [];
    const seen = new Set();
    for (const rel of files) {
      const full = ctx.state.project.root + '\\' + rel;
      if (seen.has(full)) continue;
      seen.add(full);
      const res = await api.fs.read(full);
      if (res.ok && res.text) { texts.push(res.text); fileTexts.push({ file: full, text: res.text }); }
    }
    const rootRes = await api.fs.read(rootFile);
    if (rootRes.ok && rootRes.text) { texts.push(rootRes.text); fileTexts.push({ file: rootFile, text: rootRes.text }); }
    const joined = texts.join('\n');
    const labelIndex = {};
    for (const ft of fileTexts) {
      const ls = ft.text.split(/\r?\n/);
      for (let i = 0; i < ls.length; i++) {
        const re = /\\label\{([^}]+)\}/g;
        let lm;
        while ((lm = re.exec(ls[i]))) labelIndex[lm[1].trim()] = { file: ft.file, line: i + 1 };
      }
    }
    ctx.state.labelIndex = labelIndex;
    ctx.state.projectOutline = await projectOutline(rootFile, async file => {
      const entry = [...ctx.state.docs].find(([p]) => p.replace(/\\/g, '/').toLowerCase() === file.toLowerCase());
      if (entry?.[1]?.model) return entry[1].model.getValue();
      const res = await api.fs.read(file);
      return res.ok ? res.text : '';
    });
    const cls = (joined.match(/\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/) || [])[1] || '';
    const packages = [];
    for (const mm of joined.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g)) {
      for (const p of mm[1].split(',')) if (p.trim() && !packages.includes(p.trim())) packages.push(p.trim());
    }
    for (const mm of joined.matchAll(/\\(?:newenvironment|NewDocumentEnvironment|DeclareDocumentEnvironment|newtheorem|newsiamremark)\*?\{([^}]+)\}/g)) {
      local[mm[1].trim()] = '本文档';
    }
    const out = await api.tex.envDefs({ cls, packages });
    ctx.state.envDefs = { ...local, ...(out?.defs || {}) };
    window.__envDefsDebug = { cls, packages: packages.length, local: Object.keys(local).length, defs: Object.keys(ctx.state.envDefs).length };
    if (ctx.editor?.model) ctx.editor.updateEnvDiagnostics(ctx.state.parsed, ctx.editor.model.getValue());
  } catch (err) {
    window.__envDefsDebug = { error: err.message };
    console.warn('[envDefs]', err.message);
  }
  if (ctx.sidebar?.panel === 'outline') ctx.sidebar.renderOutline();
}

const refreshOutlineSoon = debounce(async () => {
  const rootFile = ctx.state.project.rootFile;
  if (!rootFile) return;
  const outline = await projectOutline(rootFile, async file => {
    const doc = [...ctx.state.docs].find(([p]) => p.replace(/\\/g, '/').toLowerCase() === file.toLowerCase())?.[1];
    if (doc?.model) return doc.model.getValue();
    const result = await api.fs.read(file);
    return result.ok ? result.text : '';
  });
  if (rootFile !== ctx.state.project.rootFile) return;
  ctx.state.projectOutline = outline;
  if (ctx.sidebar?.panel === 'outline') ctx.sidebar.renderOutline();
}, 350);

let previewGeneration = 0;
let previewSuspended = false;
function resetProjectPreview() {
  previewGeneration++;
  previewSuspended = true;
  ctx.state.build.running = false;
  lastPages = [];
  ctx.state.build.result = null;
  ctx.preview.clear();
  ctx.preview.setBusy(false);
}

async function onProjectOpened(proj, { openRoot = true, silent = false } = {}) {
  clearMathPreviewCache();
  resetProjectPreview();
  const generation = previewGeneration;
  const current = () => generation === previewGeneration;
  ctx.state.project = { ...proj };
  previewSuspended = false;
  void openPreviewOnLoad(generation);
  $('#projectName').textContent = proj.name || baseName(proj.root);
  document.title = `TeXora — ${proj.name || ''}`;
  await ctx.sidebar.refreshFiles();
  if (!current()) return;
  $('#sbRootName').textContent = proj.rootFile ? baseName(proj.rootFile) : '未识别主文档';
  await refreshAssets();
  if (!current()) return;
  await refreshBibEntries();
  if (!current()) return;
  ctx.state.gitStatus = await api.git.status().catch(() => null);
  if (!current()) return;
  if (proj.rootFile) {
    const docDir = proj.rootFile.replace(/[\\/][^\\/]+$/, '');
    if (docDir !== proj.root && !silent && !info?.capture?.enabled) {
      toast({ type: 'info', title: '主文档位于子目录', body: `编译工作目录：${baseName(docDir)}/（已自动切换，无需手动 cd）`, timeout: 4200 });
    }
  }
  if (openRoot && proj.rootFile) {
    await openDocument(proj.rootFile, { silent: true });
    if (!current()) return;
    await autoSelectEngine(silent);
    if (!current()) return;
    window.__boot = 'doc';
    if (!silent) toast({ type: 'success', title: '项目已打开', body: proj.name });
  }
  refreshEnvDefs();
  ctx.emit('project:changed', { ...proj, reason: 'open' });
  ctx.sidebar.refreshAll(true);
}

let projectOpenRequest = 0;
async function openProject(path) {
  const request = ++projectOpenRequest;
  resetProjectPreview();
  const res = await api.project.open(path);
  if (request !== projectOpenRequest) return;
  if (!res || res.canceled || !res.ok) {
    previewSuspended = false;
    if (ctx.state.project.root) void openPreviewOnLoad();
    if (!res || res.canceled) return;
  }
  if (!res.ok) return toast({ type: 'error', title: '打开项目失败', body: res.error || '' });
  await onProjectOpened(res, { openRoot: true });
}

async function closeProject() {
  const doc = ctx.state.docs.get(ctx.state.activePath);
  if (doc?.dirty) {
    const ok = await ctx.dialogs.confirm({ title: '关闭项目', message: '有未保存的修改，仍要关闭项目吗？', confirmText: '关闭', danger: true });
    if (!ok) return;
  }
  projectOpenRequest++;
  resetProjectPreview();
  await api.project.close();
  ctx.state.project = { root: '', name: '', rootFile: '', recent: ctx.state.project.recent };
  closeAllDocuments();
  renderTabs();
  setEmptyState(true);
  renderEmptyRecent(ctx.state.project.recent || []);
  $('#projectName').textContent = '未打开项目';
  ctx.sidebar.refreshAll(true);
  ctx.emit('project:changed', { root: '', reason: 'close' });
}

async function refreshAssets() {
  const res = await api.project.assets();
  if (res.ok) ctx.state.assets = { tex: res.tex || [], images: res.images || [], bib: res.bib || [], all: res.all || [] };
}

async function reloadOpenDocuments() {
  for (const [path, doc] of ctx.state.docs) {
    const res = await api.fs.read(path);
    if (res.ok && res.text && res.text !== doc.model.getValue()) doc.model.setValue(res.text);
    doc.dirty = false;
  }
  updateStats();
  renderTabs();
}

async function refreshBibEntries() {
  const entries = [];
  for (const file of ctx.state.assets.bib || []) {
    const full = `${ctx.state.project.root}\\${file.split('/').join('\\')}`;
    const res = await api.fs.read(full);
    if (res.ok && res.text) entries.push(...parseBib(res.text));
  }
  ctx.state.bibEntries = entries;
  if (ctx.state.settings.editor.spellcheck) void 0;
}

async function refreshTexInfo() {
  const res = await api.tex.info();
  if (res.ok) {
    ctx.state.texInfo = res;
    ctx.ribbon.refresh();
    ctx.sidebar.refreshAiStatus();
  }
}

async function loadPackages() {
  const res = await api.tex.packages('', 1);
  if (res.ok) ctx.state.packages = res.items?.length ? res.items : ctx.state.packages;
  // fetch a broader list lazily for completions
  api.tex.styFiles().then((r) => {
    if (r.ok && r.files?.length) {
      const merged = new Set([...(ctx.state.packages || []), ...r.files]);
      ctx.state.packages = Array.from(merged).sort();
    }
  });
}

async function chooseRootFile() {
  if (!ctx.state.project.root) return;
  const items = (ctx.state.assets.tex || [])
    .filter((f) => /\.(tex|ltx)$/i.test(f))
    .slice(0, 40)
    .map((f) => ({
      label: f,
      icon: 'paper',
      checked: ctx.state.project.rootFile === `${ctx.state.project.root}\\${f.split('/').join('\\')}`,
      onClick: async () => {
        const full = `${ctx.state.project.root}\\${f.split('/').join('\\')}`;
        await api.project.setRootFile(full);
        ctx.state.project.rootFile = full;
        $('#sbRootName').textContent = baseName(full);
        toast({ type: 'success', title: '主文档已切换', body: f });
        ctx.cmd('build.run');
      }
    }));
  if (!items.length) return toast({ type: 'info', title: '项目中还没有 .tex 文件' });
  openMenu($('#sbRootFile'), [{ group: '编译主文档（含 \\documentclass）' }, ...items], { align: 'left', minWidth: 280 });
}

function setEmptyState(empty) {
  $('#editorEmpty').classList.toggle('hidden', !empty);
  if (empty) {
    $('#tabs').innerHTML = '';
    $('#breadcrumbs').innerHTML = '';
  }
}

function renderEmptyRecent(recent) {
  const box = $('#emptyRecent');
  if (!box) return;
  if (!recent?.length) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = `<div class="empty-recent-title">最近打开</div>${recent
    .slice(0, 5)
    .map(
      (r) => `<div class="empty-recent-item" data-path="${escapeHtml(r.path)}">${icon('folder')}<span>${escapeHtml(r.name || baseName(r.path))}</span><span class="er-path">${escapeHtml(r.path)}</span></div>`
    )
    .join('')}`;
  for (const item of $$('.empty-recent-item', box)) {
    item.addEventListener('click', async () => {
      const res = await api.project.open(item.dataset.path);
      if (res.ok) await onProjectOpened(res, { openRoot: true });
    });
  }
}

/* ---------------------------------------------------------------- documents */
async function openDocument(path, opts = {}) {
  const generation = previewGeneration;
  if (!path) return;
  if (!/\.(tex|ltx|sty|cls|bib|md|txt|cfg|def|dtx|ins|json|latexmkrc|bst)$/i.test(path) && extOf(path)) {
    if (['png', 'jpg', 'jpeg', 'pdf', 'gif', 'svg', 'webp', 'eps'].includes(extOf(path))) {
      return toast({ type: 'info', title: '二进制文件', body: baseName(path) + ' 无法在编辑器中打开' });
    }
  }
  let doc = ctx.state.docs.get(path);
  if (!doc) {
    const res = await api.fs.read(path);
    if (generation !== previewGeneration) return;
    if (!res.ok) return toast({ type: 'error', title: '读取失败', body: res.error || '' });
    if (res.binary) return toast({ type: 'info', title: '暂不支持预览此类型', body: baseName(path) });
    const model = ctx.editor.createModel(path, res.text);
    doc = { path, name: baseName(path), model, dirty: false, mtime: res.mtime, viewState: null, savedText: res.text };
    ctx.state.docs.set(path, doc);
    model.onDidChangeContent(() => {
      doc.dirty = doc.model.getValue() !== doc.savedText;
      scheduleAutosave(doc);
      scheduleLivePreview();
      refreshOutlineSoon();
      renderTabs();
      updateStats();
    });
  }
  ctx.state.activePath = path;
  ctx.editor.attach(doc, doc.viewState);
  setEmptyState(false);
  renderTabs();
  renderBreadcrumbs();
  updateStats();
  ctx.editor.doParse();
  ctx.state.previewMode = extOf(path) === 'md' ? 'markdown' : 'pdf';
  if (ctx.state.previewMode === 'markdown') showMarkdownPane();
  else restorePdfPane();
  if (opts.line) ctx.editor.revealLine(opts.line, opts.column || 1, opts.flash);
  ctx.sidebar.refreshLive();
  api.settings.set('ui.lastFile.' + hashRoot(), path);
  return doc;
}

function hashRoot() {
  return BufferLikeHash(ctx.state.project.root);
}
function BufferLikeHash(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).slice(0, 10);
}

async function newDocument() {
  if (!ctx.state.project.root) return ctx.cmd('project.new');
  const name = await ctx.dialogs.prompt({ title: '新建 LaTeX 文件', label: '文件名', value: 'untitled.tex', confirmText: '创建' });
  if (!name) return;
  const cls = ctx.state.settings.files.defaultDocClass || 'ctexart';
  const content = `\\documentclass[11pt]{${cls}}\n\\usepackage{amsmath,amssymb}\n\\usepackage{graphicx}\n\n\\begin{document}\n\n\\end{document}\n`;
  const res = await api.fs.createFile(ctx.state.project.root, name, content);
  if (!res.ok) return toast({ type: 'error', title: '创建失败', body: res.error });
  await ctx.sidebar.refreshFiles();
  await refreshAssets();
  openDocument(res.path);
}

async function saveDocument(path = ctx.state.activePath, { silent = false } = {}) {
  const doc = ctx.state.docs.get(path);
  if (!doc) return false;
  const text = doc.model.getValue();
  const res = await api.fs.write(path, text);
  if (!res.ok) {
    toast({ type: 'error', title: '保存失败', body: res.error });
    return false;
  }
  doc.dirty = false;
  doc.savedText = text;
  doc.mtime = res.mtime;
  if (ctx.state.settings.files.historyEnabled) await api.history.snapshot(path, text, 'save');
  renderTabs();
  if (!silent) {
    setBuildStatus(ctx.state.build.state, ctx.state.build.state === 'ok' ? '已保存 · 编译成功' : '已保存');
    if (ctx.state.settings.build.buildOnSave) ctx.cmd('build.run');
  }
  return true;
}

async function saveAll() {
  for (const [path, doc] of ctx.state.docs) {
    if (doc.dirty) await saveDocument(path, { silent: true });
  }
  toast({ type: 'success', title: '全部文件已保存' });
}

async function closeDocument(path = ctx.state.activePath) {
  const doc = ctx.state.docs.get(path);
  if (!doc) {
    if (!ctx.state.docs.size) return;
    return;
  }
  if (doc.dirty) {
    const keep = await ctx.dialogs.confirm({
      title: '未保存的修改',
      message: `「${doc.name}」有未保存的修改，是否保存后关闭？`,
      confirmText: '保存并关闭',
      cancelText: '取消'
    });
    if (!keep) return;
    const ok = await saveDocument(path, { silent: true });
    if (!ok) return;
  }
  const paths = Array.from(ctx.state.docs.keys());
  const idx = paths.indexOf(path);
  ctx.state.docs.delete(path);
  try {
    doc.model.dispose();
  } catch {}
  autosaveTimers.delete(path);
  if (ctx.state.activePath === path) {
    const next = paths[idx + 1] || paths[idx - 1];
    ctx.state.activePath = '';
    if (next && ctx.state.docs.has(next)) {
      const nextDoc = ctx.state.docs.get(next);
      ctx.state.activePath = next;
      ctx.editor.attach(nextDoc, nextDoc.viewState);
      ctx.editor.doParse();
      renderBreadcrumbs();
      updateStats();
    } else {
      ctx.editor.editor.setModel(null);
      ctx.editor.model = null;
      ctx.editor.blocks = [];
      setEmptyState(true);
    }
  }
  renderTabs();
}

function closeAllDocuments() {
  for (const [path, doc] of ctx.state.docs) {
    try {
      doc.model.dispose();
    } catch {}
  }
  ctx.state.docs.clear();
  ctx.state.activePath = '';
  ctx.editor.editor.setModel(null);
  ctx.editor.model = null;
}

async function reloadDocument(path = ctx.state.activePath) {
  const doc = ctx.state.docs.get(path);
  if (!doc) return;
  if (doc.dirty) {
    const ok = await ctx.dialogs.confirm({ title: '重新载入', message: '放弃未保存的修改并从磁盘重新载入？', confirmText: '重新载入', danger: true });
    if (!ok) return;
  }
  const res = await api.fs.read(path);
  if (!res.ok) return toast({ type: 'error', title: '读取失败', body: res.error });
  doc.model.pushEditOperations([], [{ range: doc.model.getFullModelRange(), text: res.text }], () => null);
  doc.savedText = res.text;
  doc.dirty = false;
  doc.mtime = res.mtime;
  renderTabs();
  ctx.editor.doParse();
  updateStats();
}

function scheduleAutosave(doc) {
  if (!ctx.state.settings.editor.autosave) return;
  const delay = Number(ctx.state.settings.editor.autosaveDelay) || 1500;
  clearTimeout(autosaveTimers.get(doc.path));
  autosaveTimers.set(
    doc.path,
    setTimeout(() => {
      if (doc.dirty) saveDocument(doc.path, { silent: true });
    }, delay)
  );
}

function scheduleLivePreview() {
  if (!ctx.state.settings.build.livePreview) return;
  if (!ctx.state.project.root) return;
  if (extOf(ctx.state.activePath) !== 'tex') return;
  clearTimeout(liveTimer);
  const delay = Number(ctx.state.settings.build.liveDelay) || 900;
  liveTimer = setTimeout(() => {
    if (!ctx.state.build.running) ctx.cmd('build.run', { live: true });
  }, delay);
}

async function cycleTab(delta) {
  const paths = Array.from(ctx.state.docs.keys());
  if (paths.length < 2) return;
  const idx = paths.indexOf(ctx.state.activePath);
  const next = paths[(idx + delta + paths.length) % paths.length];
  await openDocument(next);
}

function markDirty() {
  const doc = ctx.state.docs.get(ctx.state.activePath);
  if (!doc) return;
  doc.dirty = doc.model.getValue() !== doc.savedText;
  renderTabs();
}

/* --------------------------------------------------------------------- tabs */
function renderTabs() {
  const tabs = $('#tabs');
  if (!tabs) return;
  const docs = Array.from(ctx.state.docs.values());
  if (!docs.length) {
    tabs.innerHTML = '';
    return;
  }
  tabs.innerHTML = docs
    .map((doc) => {
      const active = doc.path === ctx.state.activePath;
      return `<div class="tab ${active ? 'active' : ''}" data-path="${escapeHtml(doc.path)}" title="${escapeHtml(doc.path)}">
        <svg class="ico t-ico"><use href="#i-${doc.icon || iconForPath(doc.path)}"/></svg>
        <span class="t-name">${escapeHtml(doc.name)}</span>
        ${doc.dirty ? '<span class="t-dirty"></span>' : ''}
        <button class="t-close" title="关闭">${icon('close')}</button>
      </div>`;
    })
    .join('');
  for (const tab of $$('.tab', tabs)) {
    const path = tab.dataset.path;
    tab.addEventListener('click', (e) => {
      if (e.target.closest('.t-close')) {
        e.stopPropagation();
        closeDocument(path);
        return;
      }
      if (path !== ctx.state.activePath) openDocument(path);
    });
    tab.addEventListener('auxclick', (e) => {
      if (e.button === 1) closeDocument(path);
    });
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openMenu({ getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }), contains: () => false }, [
        { label: '关闭', icon: 'close', onClick: () => closeDocument(path) },
        { label: '关闭其他', icon: 'close', onClick: async () => {
          for (const p of Array.from(ctx.state.docs.keys())) if (p !== path) await closeDocument(p);
        } },
        { label: '关闭全部', icon: 'close', onClick: async () => {
          for (const p of Array.from(ctx.state.docs.keys())) await closeDocument(p);
        } },
        { separator: true },
        { label: '复制路径', icon: 'copy', onClick: () => copyText(path) },
        { label: '在资源管理器中显示', icon: 'external', onClick: () => api.showItemInFolder(path) }
      ], { align: 'left' });
    });
  }
}

function iconForPath(path) {
  const ext = extOf(path);
  return { tex: 'paper', ltx: 'paper', bib: 'book', md: 'file', sty: 'code', cls: 'code' }[ext] || 'file';
}

function renderBreadcrumbs() {
  const box = $('#breadcrumbs');
  if (!box) return;
  const doc = ctx.state.docs.get(ctx.state.activePath);
  if (!doc) {
    box.innerHTML = '';
    return;
  }
  const rel = relPath(ctx.state.project.root, doc.path);
  const parts = rel.split(/[\\/]/);
  const crumbs = parts.map((p, i) => `<span class="bc-item ${i === parts.length - 1 ? 'current' : 'clickable'}" data-i="${i}">${i === parts.length - 1 ? '' : icon('chevron-right') .replace('class="ico', 'class="bc-sep ico')}${escapeHtml(p)}</span>`);
  const maxLine = ctx.editor?.model ? ctx.editor.model.getLineCount() : 1;
  const cursorLine = Math.min(maxLine, ctx.editor?.lastCursor?.line || 1);
  const env = ctx.editor?.model ? ctx.editor.envStackAt(cursorLine, ctx.editor.lastCursor.col) : [];
  box.innerHTML = `${icon(iconForPath(doc.path))}${crumbs.join('')}
    <span class="bc-ctx">${env.length ? `<span class="chip accent">${escapeHtml(env[env.length - 1])}</span>` : ''}<span class="chip">${extOf(doc.path).toUpperCase() || 'TEXT'}</span></span>`;
}

/* --------------------------------------------------------------------- build */
async function loadCachedPreview(generation = previewGeneration) {
  try {
    const res = await api.build.existing();
    if (generation !== previewGeneration) return false;
    window.__cachedDebug = res;
    if (res?.ok && res.pages?.length) {
      handleBuildDone({ ...res, ok: true, cached: true, live: true, problems: [], duration: 0 });
      return true;
    }
  } catch (err) {
    console.warn('[cached pdf]', err.message);
  }
  return false;
}

async function openPreviewOnLoad(generation = previewGeneration) {
  let loaded = await loadCachedPreview(generation);
  if (generation !== previewGeneration) return;
  if (!loaded) {
    // TeX tools may still be detecting when the first project opens.
    try { ctx.state.texInfo = await api.tex.refresh(); } catch {}
    if (generation !== previewGeneration) return;
    loaded = await loadCachedPreview(generation);
  }
  if (!loaded) {
    await new Promise((r) => setTimeout(r, 450));
    if (generation !== previewGeneration) return;
    loaded = await loadCachedPreview(generation);
  }
  if (loaded || generation !== previewGeneration) return;
  if (ctx.state.settings.build.livePreview && !info?.capture?.enabled) {
    setTimeout(() => { if (generation === previewGeneration) ctx.cmd('build.run'); }, 500);
  }
}

async function checkUpdates(manual = false) {
  const res = await api.update.check().catch((err) => ({ ok: false, error: err.message }));
  if (!res || !res.ok) {
    if (manual) toast({ type: 'warn', title: '无法检查更新', body: res?.error || '网络请求失败', timeout: 4200 });
    return;
  }
  ctx.state.settings.general.lastUpdateCheck = Date.now();
  await api.settings.set('general.lastUpdateCheck', Date.now());
  if (!res.hasUpdate) {
    if (manual) toast({ type: 'success', title: '已是最新版本', body: '当前 ' + res.current, timeout: 2600 });
    return;
  }
  const go = await ctx.dialogs.confirm({
    title: '发现新版本 ' + res.latest,
    message: '当前版本 ' + res.current + '，最新版本 ' + res.latest + '。',
    detail: String(res.notes || '').replace(/[#*_\u0060>]/g, '').slice(0, 500),
    confirmText: '前往下载',
    cancelText: '稍后'
  });
  if (go) await openUpdateDownload(api, res, toast);
}

async function runBuild(opts = {}) {
  const generation = previewGeneration;
  if (buildPreparing || ctx.state.build.running) return;
  if (!ctx.state.project.root) {
    toast({ type: 'warn', title: '请先打开项目', body: '编译需要一个包含主文档的项目文件夹' });
    return;
  }
  if (opts.live && !ctx.state.settings.build.livePreview) return;
  buildPreparing = true;
  try {
    if (!Object.values(ctx.state.texInfo?.engines || {}).some(Boolean)) {
      const res = await api.tex.refresh();
      ctx.state.texInfo = res;
      if (!Object.values(res.engines || {}).some(Boolean)) {
        return toast({ type: 'error', title: '未检测到 LaTeX 引擎', body: '请在设置 → 宏包与 TeX 环境中指定 TeX 发行版路径', timeout: 7000 });
      }
    }
    // Compilation reads disk, including included files, regardless of build-on-save.
    for (const [path, doc] of ctx.state.docs) {
      if (doc.dirty && !(await saveDocument(path, { silent: true }))) return;
    }
    if (generation !== previewGeneration) return;
    buildStartedAt = Date.now();
    setBuildStatus('building', '编译中…');
    ctx.preview.setBusy(true);
    const res = await api.build.run({ file: ctx.state.activePath, live: !!opts.live });
    if (generation !== previewGeneration) return;
    if (res && res.error) {
      ctx.state.build.running = false;
      setBuildStatus('error', '编译失败');
      ctx.preview.setBusy(false);
      toast({ type: 'error', title: '无法启动编译', body: res.error });
    }
  } catch (err) {
    setBuildStatus('error', '编译失败');
    ctx.preview.setBusy(false);
    toast({ type: 'error', title: '无法启动编译', body: err.message });
  } finally {
    buildPreparing = false;
  }
}

async function stopBuild() {
  if (ctx.state.build.stopping) return;
  ctx.state.build.stopping = true;
  ctx.ribbon.refresh();
  try {
    await api.build.stop();
    if (!(await api.build.state()).running) {
      setBuildStatus('idle', '已停止');
      ctx.preview.setBusy(false);
    }
  } catch (err) {
    ctx.state.build.stopping = false;
    ctx.ribbon.refresh();
    toast({ type: 'error', title: '停止编译失败', body: err.message });
  }
}

async function cleanBuild(all = false) {
  const res = await api.build.clean(all);
  if (res.ok) toast({ type: 'success', title: '已清理过程文件', body: `删除 ${res.removed} 项` });
  else toast({ type: 'error', title: '清理失败', body: res.error });
}

function setBuildStatus(state, text) {
  state = state === 'building' ? 'running' : state;
  ctx.state.build.state = state;
  ctx.state.build.running = state === 'running';
  if (state !== 'running') ctx.state.build.stopping = false;
  const sb = $('#sbBuild');
  const dot = $('#sbDot');
  const label = $('#sbBuildText');
  if (!sb) return;
  sb.classList.remove('building', 'ok', 'err');
  if (state === 'running') sb.classList.add('building');
  else if (state === 'ok') sb.classList.add('ok');
  else if (state === 'error') sb.classList.add('err');
  if (label) label.textContent = text || (state === 'ok' ? '编译成功' : state === 'error' ? '编译失败' : '空闲');
  ctx.emit('build:state', { state, text });
}

function handleBuildDone(result) {
  if (previewSuspended) return;
  if (result.projectRoot && (result.projectRoot !== ctx.state.project.root || result.revision !== ctx.state.project.revision)) return;
  if (result.rootFile && result.rootFile !== ctx.state.project.rootFile) return;
  ctx.state.build.running = false;
  ctx.state.build.result = result;
  ctx.state.build.state = result.ok ? 'ok' : 'error';
  ctx.state.problems = result.problems || [];
  ctx.preview.setBusy(false);
  setBuildStatus(result.ok ? 'ok' : 'error', result.cached ? '已加载 PDF' : result.ok ? `编译成功 · ${(result.duration / 1000).toFixed(1)}s` : `编译失败 · ${result.errorCount || 0} 个错误`);
  lastPages = result.pages || [];
  if (ctx.state.previewMode !== 'markdown') {
    if (result.pages?.length) ctx.preview.render(result.pages, { keepZoom: true });
    else {
      ctx.preview.showPlaceholder(result.ok ? '编译成功，但未能生成预览图片（检查 pdftocairo）' : '编译失败，请查看问题面板');
    }
  }
  renderProblems();
  updateBadges();
  ctx.editor.setProblems(ctx.state.problems);
  setTimeout(() => ctx.editor.refreshMathZones(), 1200);
  ctx.sidebar.refreshLive();
  ctx.ribbon.refresh();
  const firstErr = ctx.state.problems.find((p) => p.severity === 'error');
  if (!result.ok) {
    openProblems(true);
    if (!ctx.state.build.lastToast || Date.now() - ctx.state.build.lastToast > 4000) {
      ctx.state.build.lastToast = Date.now();
      toast({
        type: 'error',
        title: '编译失败',
        body: firstErr ? `${baseName(firstErr.file || '')}${firstErr.line ? ':' + firstErr.line : ''} ${firstErr.message}`.slice(0, 140) : '请查看问题面板',
        timeout: 6000
      });
    }
    if (result.pages?.length) ctx.preview.render(result.pages, { keepZoom: true });
  } else if (!result.live && !result.cached) {
    toast({ type: 'success', title: '编译成功', body: `${result.pages?.length || 0} 页 · ${((result.duration || 0) / 1000).toFixed(1)}s`, timeout: 2600 });
  }
  // missing package prompt
  const missing = (result.problems || []).find((p) => p.missingFile && /\.sty$/.test(p.missingFile));
  if (missing && ctx.state.settings.build.autoInstallMissing === 'ask') {
    promptInstallPackage(missing.missingFile.replace(/\.sty$/, ''));
  }
  updateStats();
}

async function promptInstallPackage(pkg) {
  const ok = await ctx.dialogs.confirm({
    title: '缺少宏包',
    message: `检测到缺失宏包 ${pkg}.sty，是否立即下载安装？`,
    detail: `使用镜像：${ctx.state.settings.build.mirror || '默认 CTAN'} · 安装完成后将自动重新编译`,
    confirmText: '安装并重编'
  });
  if (!ok) return;
  const res = await api.tex.installPackage(pkg);
  if (!res.ok) return toast({ type: 'error', title: '安装失败', body: res.error, timeout: 7000 });
  toast({ type: 'success', title: `${pkg} 已安装`, body: '正在重新编译…' });
  ctx.cmd('build.run');
}

function updateBadges() {
  const errors = ctx.state.problems.filter((p) => p.severity === 'error').length;
  const warnings = ctx.state.problems.filter((p) => p.severity === 'warning').length;
  $('#badgeAll').textContent = String(ctx.state.problems.length);
  $('#badgeErr').textContent = String(errors);
  $('#badgeWarn').textContent = String(warnings);
  const sb = $('#sbProblemsText');
  if (sb) sb.textContent = `${errors} 错误 · ${warnings} 警告`;
}

function openProblems(open = true) {
  problemsOpen = open;
  $('#problems').classList.toggle('open', open);
  ctx.state.settings.ui.problemsOpen = open;
  if (open) renderProblems();
}

function toggleProblems() {
  openProblems(!problemsOpen);
}

function renderProblems() {
  const body = $('#problemsBody');
  if (!body) return;
  if (problemsTab === 'log') {
    body.innerHTML = `<div class="log-view">${colorizeLog(ctx.state.log || '（暂无编译输出）')}</div>`;
    body.scrollTop = body.scrollHeight;
    return;
  }
  const list = ctx.state.problems.filter((p) => problemsTab === 'all' || p.severity === problemsTab);
  if (!list.length) {
    body.innerHTML = `<div class="empty-hint">${ctx.state.problems.length ? '当前分类没有条目' : '没有问题 · 编译输出与警告会显示在这里'}</div>`;
    return;
  }
  body.innerHTML = list
    .slice(0, 300)
    .map((p, i) => {
      const file = p.file ? baseName(p.file) : '';
      return `<div class="problem-row ${p.severity}" data-i="${i}">
        ${icon(p.severity === 'error' ? 'error' : p.severity === 'warning' ? 'alert' : 'info')}
        <span class="p-msg">${escapeHtml(p.message)}${p.detail ? `<span class="p-detail">${escapeHtml(String(p.detail).slice(0, 180))}</span>` : ''}</span>
        <span class="p-source">${escapeHtml(p.source || 'latex')}</span>
        <span class="p-loc">${escapeHtml(file)}${p.line ? ':' + p.line : ''}</span>
      </div>`;
    })
    .join('');
  for (const row of $$('.problem-row', body)) {
    const p = list[Number(row.dataset.i)];
    row.addEventListener('click', () => {
      if (!p) return;
      if (p.file && p.file !== ctx.state.activePath) {
        const file = p.file;
        api.fs.stat(file).then((st) => {
          if (st.ok && !st.dir) gotoLocation({ file, line: p.line || 1, column: p.column || 1, flash: true });
          else toast({ type: 'info', title: '无法定位', body: '该问题没有可跳转的源码位置' });
        });
      } else {
        gotoLocation({ line: p.line || 1, column: p.column || 1, flash: true });
      }
    });
  }
}

function colorizeLog(text) {
  const esc = escapeHtml(text);
  return esc
    .split('\n')
    .map((line) => {
      if (/^!|^.*:\d+: /.test(line)) return `<span class="log-err">${line}</span>`;
      if (/warning|overfull|underfull/i.test(line)) return `<span class="log-warn">${line}</span>`;
      return line;
    })
    .join('\n');
}

/* ----------------------------------------------------------------- goto etc */
async function gotoLocation({ file, line = 1, column = 1, flash = false } = {}) {
  if (file && file !== ctx.state.activePath) {
    await openDocument(file, { silent: true });
  }
  if (!ctx.state.activePath) return;
  ctx.editor.revealLine(line, column, flash);
}

/* ------------------------------------------------------------------- status */
function updateStats() {
  const doc = ctx.state.docs.get(ctx.state.activePath);
  const statsEl = $('#sbStats');
  if (!doc || !statsEl) {
    if (statsEl) statsEl.textContent = '0 字 · 0 词';
    return;
  }
  const text = doc.model.getValue();
  const st = textStats(text);
  statsEl.textContent = `${st.cjkChars} 汉字 · ${st.latinWords} 词 · ${st.formulas} 公式`;
  const rootName = ctx.state.project.rootFile ? baseName(ctx.state.project.rootFile) : '未识别主文档';
  $('#sbRootName').textContent = rootName;
  $('#sbSpaces').textContent = `空格: ${ctx.state.settings.editor.indentSize || 2}`;
}

ctx.on('cursor', ({ line, col }) => {
  const elx = $('#sbCursor');
  if (!elx) return;
  const ed = ctx.editor;
  const sel = ed?.editor.getSelection();
  const extra = sel && !sel.isEmpty() ? ` (已选 ${Math.abs(sel.endLineNumber - sel.startLineNumber) + 1} 行)` : '';
  elx.textContent = `Ln ${line}, Col ${col}${extra}`;
  renderBreadcrumbs();
});

ctx.on('doc:changed', () => {
  renderTabs();
});

/* --------------------------------------------------------------- appearance */
function setTheme(mode) {
  ctx.state.settings.appearance.theme = mode;
  api.settings.set('appearance.theme', mode);
  applyAppearance();
  toast({ type: 'info', title: mode === 'light' ? '已切换到白天主题' : mode === 'dark' ? '已切换到夜晚主题' : '跟随系统主题', timeout: 1600 });
}

function toggleTheme() {
  const current = resolveTheme(ctx.state.settings.appearance.theme);
  setTheme(current === 'dark' ? 'light' : 'dark');
}

function setAccent(accent) {
  ctx.state.settings.appearance.accent = accent;
  api.settings.set('appearance.accent', accent);
  applyAppearance();
}

function toggleSidebar() {
  const sb = $('#sidebar');
  const splitter = $('#splitterSidebar');
  const collapsed = sb.classList.toggle('collapsed');
  splitter.style.display = collapsed ? 'none' : '';
  ctx.state.settings.ui.showSidebar = !collapsed;
  api.settings.set('ui.showSidebar', !collapsed);
  ctx.ribbon.refresh();
  ctx.sidebar.syncActivityButtons();
  ctx.editor.resize();
}

function togglePreview() {
  const pv = $('#previewPane');
  const splitter = $('#splitterPreview');
  const collapsed = pv.classList.toggle('collapsed');
  splitter.style.display = collapsed ? 'none' : '';
  ctx.state.settings.ui.showPreview = !collapsed;
  api.settings.set('ui.showPreview', !collapsed);
  ctx.ribbon.refresh();
  ctx.editor.resize();
  if (!collapsed) ctx.preview.relayout();
}

function toggleWordWrap() {
  const next = !ctx.state.settings.editor.wordWrap;
  ctx.state.settings.editor.wordWrap = next;
  api.settings.set('editor.wordWrap', next);
  ctx.editor?.editor?.updateOptions({
    wordWrap: next ? 'on' : 'off',
    scrollBeyondLastColumn: next ? 0 : 5,
    scrollbar: { horizontal: next ? 'hidden' : 'auto' }
  });
  ctx.editor?.syncWrapClass();
  ctx.ribbon.refresh();
  toast({ type: 'info', title: next ? '自动换行已开启' : '自动换行已关闭', timeout: 1500 });
}

function toggleLivePreview() {
  const next = !ctx.state.settings.build.livePreview;
  api.settings.set('build.livePreview', next);
  ctx.state.settings.build.livePreview = next;
  ctx.ribbon.refresh();
  toast({ type: 'info', title: next ? '自动编译已开启' : '自动编译已关闭', timeout: 1800 });
  if (next) ctx.cmd('build.run');
}

function toggleFocusMode() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.();
  const hide = !$('#sidebar').classList.contains('collapsed') || !$('#previewPane').classList.contains('collapsed');
  if (hide) {
    if (!$('#sidebar').classList.contains('collapsed')) toggleSidebar();
    if (!$('#previewPane').classList.contains('collapsed')) togglePreview();
    toast({ type: 'info', title: '专注模式', body: '按 F11 退出全屏（Ctrl+Shift+F 可恢复侧栏搜索）', timeout: 2600 });
  }
}

/* ------------------------------------------------------------ editor helpers */
function wrapWith(command) {
  if (!ctx.editor.model) return;
  const sel = ctx.editor.editor.getSelection();
  const text = sel.isEmpty() ? '' : ctx.editor.model.getValueInRange(sel);
  ctx.editor.editor.executeEdits('texora-wrap', [{ range: sel, text: `${command}{${text}}` }]);
  ctx.editor.editor.focus();
}

function insertBlock(code) {
  if (!ctx.editor.model) {
    toast({ type: 'warn', title: '请先打开一个文档' });
    return;
  }
  const pos = ctx.editor.editor.getPosition();
  const model = ctx.editor.model;
  const lineContent = model.getLineContent(pos.lineNumber);
  const prefix = pos.column > 1 && lineContent.slice(0, pos.column - 1).trim() ? '\n' : '';
  const suffix = lineContent.slice(pos.column - 1).trim() ? '\n' : '';
  ctx.editor.editor.executeEdits('texora-insert-block', [
    { range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column }, text: prefix + code + suffix }
  ]);
  ctx.editor.editor.focus();
}

function insertEnvironment(env) {
  if (!ctx.editor.model) return;
  const templates = {
    equation: '\\begin{equation}\n\t\n\\end{equation}',
    align: '\\begin{align}\n\t\n\\end{align}',
    gather: '\\begin{gather}\n\t\n\\end{gather}',
    figure: '\\begin{figure}[htbp]\n\t\\centering\n\t\\includegraphics[width=0.8\\linewidth]{}\n\t\\caption{}\n\t\\label{fig:}\n\\end{figure}',
    table: '\\begin{table}[htbp]\n\t\\centering\n\t\\caption{}\n\t\\label{tab:}\n\t\\begin{tabular}{lcc}\n\t\t\\toprule\n\t\t & & \\\\\n\t\t\\midrule\n\t\t & & \\\\\n\t\t\\bottomrule\n\t\\end{tabular}\n\\end{table}',
    itemize: '\\begin{itemize}\n\t\\item \n\\end{itemize}',
    enumerate: '\\begin{enumerate}\n\t\\item \n\\end{enumerate}',
    tikzpicture: '\\begin{tikzpicture}\n\t\\draw (0,0) -- (1,1);\n\\end{tikzpicture}',
    theorem: '\\begin{theorem}[标题]\n\t\n\\end{theorem}',
    proof: '\\begin{proof}\n\t\n\\end{proof}'
  };
  const body = templates[env] || `\\begin{${env}}\n\t\n\\end{${env}}`;
  const pos = ctx.editor.editor.getPosition();
  const line = ctx.editor.model.getLineContent(pos.lineNumber);
  const indent = (line.match(/^\s*/) || [''])[0];
  const text = body
    .split('\n')
    .map((l, i) => (i === 0 ? l : indent + l))
    .join('\n');
  insertBlock(text);
  const targetLine = pos.lineNumber + 1;
  ctx.editor.editor.setPosition({ lineNumber: targetLine, column: indent.length + 2 });
  ctx.editor.editor.focus();
}

function applyFontSize(size) {
  api.settings.set('editor.lastSize', size);
  ctx.state.settings.editor.lastSize = size;
  ctx.ribbon.refresh();
  const ed = ctx.editor;
  if (!ed.model) return;
  const sel = ed.editor.getSelection();
  if (!sel.isEmpty()) {
    const text = ed.model.getValueInRange(sel);
    ed.editor.executeEdits('texora-size', [{ range: sel, text: `{\\${size} ${text}}` }]);
  } else {
    ed.insertText(`{\\${size} }`);
    const pos = ed.editor.getPosition();
    ed.editor.setPosition({ lineNumber: pos.lineNumber, column: Math.max(1, pos.column - 2) });
  }
  ed.editor.focus();
}

function insertSection(anchor) {
  const element = anchor && anchor.getBoundingClientRect ? anchor : document.activeElement;
  const anchorObj = element && element.getBoundingClientRect && element.getBoundingClientRect().width
    ? element
    : $('#ribbon');
  openMenu(
    anchorObj,
    [
      { group: '章节层级' },
      ...['part', 'chapter', 'section', 'subsection', 'subsubsection'].map((level) => ({
        label: `\\${level}{…}`,
        icon: 'outline',
        onClick: () => {
          ctx.editor.insertText(`\\${level}{} \n`);
          const pos = ctx.editor.editor.getPosition();
          ctx.editor.editor.setPosition({ lineNumber: pos.lineNumber - 1, column: level.length + 3 });
        }
      }))
    ],
    { align: 'left', minWidth: 200 }
  );
}

function insertList(kind) {
  const labels = { itemize: 'itemize', enumerate: 'enumerate', description: 'description' };
  const env = labels[kind] || 'itemize';
  insertEnvironment(env);
}

function insertAlignment(kind) {
  const ed = ctx.editor;
  if (!ed.model) return;
  const sel = ed.editor.getSelection();
  const text = sel.isEmpty() ? '\n' : ed.model.getValueInRange(sel);
  ed.editor.executeEdits('texora-align', [{ range: sel, text: `\\begin{${kind}}\n\t${text.trim()}\n\\end{${kind}}` }]);
  ed.editor.focus();
}

async function setEnumLabel(option) {
  const model = ctx.editor.model;
  if (!model) return;
  const editor = ctx.editor.editor;
  const position = editor.getPosition();
  const patch = enumLabelEdit(model.getValue(), model.getOffsetAt(position), option);
  if (!patch) return toast({ type: 'info', title: '请把光标放在 enumerate 环境内', body: '支持列表项目正文和嵌套列表，无需移动到 begin 行' });
  try {
    const root = ctx.state.project.root;
    await editProjectPreamble(text => {
      const packages=['enumitem'];
      const chinese=option.includes('\\chinese');
      const p=packageInsertion(text,packages);
      let result=text.slice(0,p.offset)+p.text+text.slice(p.offset);
      if(chinese && !/\\(?:documentclass|usepackage)(?:\[[^\]]*\])?\{[^}]*ctex/.test(result.split('\\begin{document}')[0])) {
        const extra=packageInsertion(result,['ctex']);
        result=result.slice(0,extra.offset)+extra.text+result.slice(extra.offset);
      }
      return result;
    });
    if(root!==ctx.state.project.root || ctx.editor.model!==model)return;
    // Preamble edits may shift the list. Recompute against Monaco's tracked cursor.
    const latest=enumLabelEdit(model.getValue(),model.getOffsetAt(editor.getPosition()),option);
    if(!latest)return;
    const a=model.getPositionAt(latest.start),b=model.getPositionAt(latest.end);
    editor.executeEdits('texora-enum',[{range:{startLineNumber:a.lineNumber,startColumn:a.column,endLineNumber:b.lineNumber,endColumn:b.column},text:latest.text}]);
    if(option.includes('\\chinese') && ctx.state.settings.build.engine==='pdflatex') {ctx.state.settings.build.engine='xelatex';await api.settings.set('build.engine','xelatex');}
    editor.focus();
  } catch(error) { toast({type:'warn',title:'编号样式未应用',body:error.message}); }
}

function replaceModelText(model, text) {
  const before=model.getValue();
  if(before===text)return;
  let a=0,b=before.length,c=text.length;
  while(a<b && a<c && before[a]===text[a])a++;
  while(b>a && c>a && before[b-1]===text[c-1]){b--;c--;}
  const start=model.getPositionAt(a),end=model.getPositionAt(b);
  model.pushEditOperations([],[{range:{startLineNumber:start.lineNumber,startColumn:start.column,endLineNumber:end.lineNumber,endColumn:end.column},text:text.slice(a,c)}],()=>null);
}

async function editProjectPreamble(transform) {
  const project=ctx.state.project, rootFile=project.rootFile;
  if(!rootFile)throw Error('请先打开项目并指定主文档');
  const doc=ctx.state.docs.get(rootFile);
  const read=doc?null:await api.fs.read(rootFile);
  if(!doc && !read?.ok)throw Error(read?.error || '无法读取主文档');
  if(ctx.state.project!==project)throw Error('项目已切换，请重试');
  const before=doc?doc.model.getValue():read.text;
  const text=transform(before);
  if(text===before)return;
  if(doc)replaceModelText(doc.model,text);
  else {const written=await api.fs.write(rootFile,text);if(!written.ok)throw Error(written.error || '主文档写入失败');}
}

function insertTodo() {
  if (!ctx.editor.model) return;
  const sel = ctx.editor.getSelectionText();
  ctx.editor.insertText(`\\todo{${sel || '待补充'}}`);
  ensurePreamblePackage('todonotes');
}

async function applyLocalFont(kind, name) {
  const cmd = kind === 'cjk' ? 'setCJKmainfont' : kind === 'mono' ? 'setmonofont' : 'setmainfont';
  try {
    await editProjectPreamble(source => {
      let text=source;
      const begin=text.indexOf('\\begin{document}');
      if(begin<0)throw Error('主文档缺少 begin{document}');
      const pre=text.slice(0,begin);
      const hasCjk=/\\(?:documentclass|usepackage)(?:\[[^\]]*\])?\{[^}]*ctex|\\usepackage(?:\[[^\]]*\])?\{[^}]*xeCJK/.test(pre);
      const patch=packageInsertion(text,kind==='cjk'?(hasCjk?[]:['xeCJK']):['fontspec']);
      text=text.slice(0,patch.offset)+patch.text+text.slice(patch.offset);
      const command=new RegExp('\\\\'+cmd+'\\s*(?:\\[[^\\]]*\\])?\\s*\\{[^}]*\\}');
      const currentEnd=text.indexOf('\\begin{document}');
      let head=text.slice(0,currentEnd);
      head=command.test(head)?head.replace(command,()=>`\\${cmd}{${name}}`):head+`\\${cmd}{${name}}\n`;
      return head+text.slice(currentEnd);
    });
    const fonts={...ctx.state.settings.tex.fonts,[kind]:name};
    await api.settings.set('tex.fonts',fonts);ctx.state.settings.tex.fonts=fonts;
    if(kind==='cjk' || ctx.state.settings.build.engine==='pdflatex') {ctx.state.settings.build.engine='xelatex';await api.settings.set('build.engine','xelatex');}
    for(const button of document.querySelectorAll('[data-font="'+kind+'"] span'))button.textContent=name;
    toast({type:'success',title:'主文档字体已更新',body:`\\${cmd}{${name}} · 保存并编译后生效`});
  } catch(error) {toast({type:'warn',title:'字体未应用',body:error.message});}
}

function ensurePreamblePackage(pkg) {
  const doc = ctx.state.docs.get(ctx.state.activePath);
  if (!doc) return;
  const text = doc.model.getValue();
  if (new RegExp(`\\\\usepackage(\\[[^\\]]*\\])?\\{[^}]*\\b${pkg}\\b`).test(text)) return;
  const anchor = text.lastIndexOf('\\usepackage');
  if (anchor < 0) return;
  const insertAt = text.indexOf('\n', anchor) + 1;
  doc.model.pushEditOperations([], [{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: '' }], () => null);
  const pos = doc.model.getPositionAt(insertAt);
  doc.model.pushEditOperations([], [{ range: { startLineNumber: pos.lineNumber, startColumn: 1, endLineNumber: pos.lineNumber, endColumn: 1 }, text: `\\usepackage{${pkg}}\n` }], () => null);
}

/* ---------------------------------------------------------------- TeX tools */
function beautifyDocument() {
  const doc = ctx.state.docs.get(ctx.state.activePath);
  if (!doc) return;
  const cfg = ctx.state.settings.editor.formatter || {};
  const before = doc.model.getValue();
  const after = beautify(before, {
    indentSize: ctx.state.settings.editor.indentSize || 2,
    mergeParagraphLines: cfg.mergeParagraphLines !== false,
    normalizeIndent: cfg.normalizeIndent !== false,
    sectionBanners: cfg.sectionBanners !== false,
    preambleDivider: cfg.preambleDivider !== false,
    collapseBlankLines: cfg.collapseBlankLines !== false
  });
  doc.model.pushEditOperations([], [{ range: doc.model.getFullModelRange(), text: after }], () => null);
  toast({ type: 'success', title: '格式整理完成', body: '已规范化环境缩进、段落与分界线' });
}

function normalizePunctuationDocument(direction = 'half') {
  const doc = ctx.state.docs.get(ctx.state.activePath);
  if (!doc) return toast({ type: 'warn', title: '请先打开文档' });
  const before = doc.model.getValue();
  const res = normalizePunctuation(before, { direction });
  if (!res.changes || res.text === before) {
    return toast({ type: 'info', title: '没有需要替换的标点' });
  }
  doc.model.pushEditOperations([], [{ range: doc.model.getFullModelRange(), text: res.text }], () => null);
  toast({
    type: 'success',
    title: `已替换 ${res.changes} 处标点`,
    body: direction === 'half' ? '中文标点 → 英文标点（顿号与引号保留，标点后已补英文空格）' : '英文标点 → 中文标点（已去除多余空格，顿号与引号保留）'
  });
}

function applyDisplayStyleDocument() {
  const doc = ctx.state.docs.get(ctx.state.activePath);
  if (!doc) return;
  const res = applyDisplayStyle(doc.model.getValue(), { addLinespread: true });
  doc.model.pushEditOperations([], [{ range: doc.model.getFullModelRange(), text: res.text }], () => null);
  toast({
    type: 'success',
    title: res.changes ? '已写入全局公式排版设置' : '导言区已包含相应设置',
    body: res.changes ? '已添加 \\everymath{\\displaystyle} 与 \\lineskiplimit / \\lineskip 行距补偿' : ''
  });
}

function collapseBlankLinesDocument() {
  const doc = ctx.state.docs.get(ctx.state.activePath);
  if (!doc) return;
  const text = doc.model.getValue().replace(/\n{3,}/g, '\n\n');
  doc.model.pushEditOperations([], [{ range: doc.model.getFullModelRange(), text }], () => null);
  toast({ type: 'success', title: '已压缩多余空行' });
}

async function runLint() {
  const res = await api.tex.lint(ctx.state.activePath);
  if (!res.ok) return toast({ type: 'warn', title: 'ChkTeX 不可用', body: res.error });
  const others = ctx.state.problems.filter((p) => p.source !== 'chktex');
  ctx.state.problems = [...res.problems.map((p) => ({ ...p, severity: p.severity === 'warning' ? 'warning' : 'info' })), ...others];
  ctx.editor.setProblems(ctx.state.problems);
  renderProblems();
  updateBadges();
  openProblems(true);
  toast({ type: 'success', title: 'ChkTeX 检查完成', body: `${res.problems.length} 条建议` });
}

async function exportLatexdiff() {
  const files = (ctx.state.assets.tex || []).filter((f) => /\.tex$/i.test(f));
  if (files.length < 1) return toast({ type: 'warn', title: '需要至少一个 .tex 文件' });
  const body = `
    <div class="field"><label>旧版本文件</label><select class="input" id="ldA">${files.map((f) => `<option>${escapeHtml(f)}</option>`).join('')}</select></div>
    <div class="field" style="margin-top:8px"><label>新版本文件</label><select class="input" id="ldB">${files.map((f, i) => `<option ${i === 1 ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}</select></div>
    <div class="field" style="margin-top:8px"><label>输出文件名</label><input class="input" id="ldOut" value="diff" /></div>
    <div class="field-hint" style="margin-top:8px">调用本地 latexdiff 生成带增删标记的对比 PDF（需安装 latexdiff）。</div>`;
  ctx.dialogs.modal({
    title: 'LaTeXdiff 版本对比',
    iconName: 'code',
    width: 520,
    body,
    foot: `<button class="btn btn-sm" data-dialog-btn>取消</button><span class="spacer"></span><button class="btn btn-primary btn-sm" id="ldRun">生成对比 PDF</button>`,
    onMount: ({ root, close }) => {
      root.querySelector('[data-dialog-btn]').addEventListener('click', close);
      root.querySelector('#ldRun').addEventListener('click', async () => {
        const a = `${ctx.state.project.root}\\${root.querySelector('#ldA').value.split('/').join('\\')}`;
        const b = `${ctx.state.project.root}\\${root.querySelector('#ldB').value.split('/').join('\\')}`;
        const out = root.querySelector('#ldOut').value.trim() || 'diff';
        close();
        toast({ type: 'info', title: '正在生成对比 PDF…' });
        const res = await api.tex.latexdiff(a, b, out);
        if (!res.ok) return toast({ type: 'error', title: 'latexdiff 失败', body: res.error, timeout: 7000 });
        toast({ type: 'success', title: '对比 PDF 已生成', body: baseName(res.pdf) });
        api.app.openPath(res.pdf);
      });
    }
  });
}

async function openPdfExternal() {
  const pdf = ctx.state.build.result?.rootPdf || ctx.state.build.result?.pdf;
  if (!pdf) return toast({ type: 'info', title: '尚未生成 PDF' });
  api.app.openPath(pdf);
}

async function checkTexEnvironment() {
  const res = await api.tex.refresh();
  ctx.state.texInfo = res;
  ctx.ribbon.refresh();
  const missing = Object.entries(res.tools || {}).filter(([, v]) => !v).map(([k]) => k);
  toast({
    type: missing.length ? 'warn' : 'success',
    title: missing.length ? 'TeX 环境部分可用' : 'TeX 环境正常',
    body: `${res.distro} · ${res.version || ''}${missing.length ? `\n缺少工具：${missing.join(', ')}` : ''}`,
    timeout: 7000
  });
  closeSettingsIfOpen();
}

function closeSettingsIfOpen() {
  ctx.settingsUI?.renderSection();
}

/* --------------------------------------------------------------- markdown */
function showMarkdownPane() {
  mdMode = true;
  const doc = ctx.state.docs.get(ctx.state.activePath);
  const stage = ctx.preview.stage;
  if (!stage || !doc) return;
  stage.innerHTML = `<div class="md-preview md-in-pane">${renderMarkdown(doc.model.getValue())}</div>`;
  stage.scrollTop = 0;
}

function restorePdfPane() {
  if (!mdMode) return;
  mdMode = false;
  if (lastPages?.length) ctx.preview.render(lastPages, { keepZoom: true });
  else ctx.preview.showPlaceholder('编译后在此显示 PDF 预览');
}

/* --------------------------------------------------------------- external fs */
const onExternalChange = debounce(async (payload) => {
  clearMathPreviewCache();
  refreshOutlineSoon();
  if (!ctx.state.project.root) return;
  await ctx.sidebar.refreshFiles();
  await refreshAssets();
  const doc = ctx.state.docs.get(payload.file);
  if (doc && !doc.dirty) {
    const st = await api.fs.stat(payload.file);
    if (st.ok && st.mtime > doc.mtime) {
      const res = await api.fs.read(payload.file);
      if (res.ok) {
        doc.model.pushEditOperations([], [{ range: doc.model.getFullModelRange(), text: res.text }], () => null);
        doc.savedText = res.text;
        doc.mtime = res.mtime;
        renderTabs();
      }
    }
  }
}, 400);

/* ------------------------------------------------------------------ capture */
async function applyCaptureView() {
  const cap = info.capture;
  if (cap.theme) setTheme(cap.theme);
  const view = cap.view;
  const sub = cap.subview;
  await new Promise((r) => setTimeout(r, 350));
  if (!ctx.state.project.root) return;
  switch (view) {
    case 'settings':
      ctx.settingsUI.open(sub || 'editor');
      break;
    case 'templates':
      ctx.dialogs.openTemplates();
      break;
    case 'table':
      ctx.dialogs.openTableWizard();
      break;
    case 'newproject':
      ctx.dialogs.openNewProject();
      break;
    case 'symbols':
      ctx.dialogs.openSymbols(sub || '');
      break;
    case 'image':
      ctx.dialogs.openImageDialog();
      break;
    case 'bib':
      ctx.dialogs.openBibManager();
      break;
    case 'fonts':
      ctx.dialogs.openFontPicker(sub || 'cjk');
      break;
    case 'shortcuts':
      ctx.dialogs.openShortcuts();
      break;
    case 'markdown':
      ctx.dialogs.openMarkdownTools();
      break;
    case 'problems':
      openProblems(true);
      problemsTab = 'log';
      renderProblems();
      break;
    case 'ai':
      ctx.sidebar.show('ai');
      break;
    case 'outline':
      ctx.sidebar.show('outline');
      break;
    case 'math':
      ctx.sidebar.show('math');
      break;
    case 'labels':
      ctx.sidebar.show('labels');
      break;
    case 'search':
      ctx.sidebar.show('search');
      break;
    case 'history':
      ctx.sidebar.show('history');
      break;
    case 'git':
      ctx.sidebar.show('git');
      break;
    case 'diff':
      ctx.dialogs.showDiff({
        title: '本地历史对比 · main.tex',
        subtitle: '2 小时前 · 编译通过快照',
        left: '% 旧版本\n\\section{引言}\n对流扩散方程广泛应用于流体力学。\n',
        right: ctx.state.docs.get(ctx.state.activePath)?.model.getValue().slice(0, 1200) || '',
        leftLabel: '历史快照',
        rightLabel: '当前内容'
      });
      break;
    case 'project':
    default:
      if (!view) {
        await new Promise((r) => setTimeout(r, 200));
        ctx.cmd('build.run');
      }
      break;
  }
}

/* --------------------------------------------------------------- app facade */
ctx.app = {
  // projects
  openProject,
  closeProject,
  onProjectOpened,
  refreshRootFile: async () => {
    const res = await api.project.refreshRoot();
    if (res.ok && res.rootFile) {
      ctx.state.project.rootFile = res.rootFile;
      $('#sbRootName').textContent = baseName(res.rootFile);
      toast({ type: 'success', title: '主文档已重新识别', body: baseName(res.rootFile) });
    }
  },
  refreshAssets,
  refreshBibEntries,
  newDocument,
  openDocument,
  saveDocument,
  saveAll,
  closeDocument,
  reloadDocument,
  reloadOpenDocuments,
  openFind,
  markDirty,
  cycleTab,
  runBuild,
  checkUpdates,
  loadCachedPreview,
  stopBuild,
  cleanBuild,
  toggleProblems,
  setEngine: (engine) => {
    api.settings.set('build.engine', engine);
    ctx.state.settings.build.engine = engine;
    ctx.ribbon.refresh();
    toast({ type: 'info', title: '编译引擎已切换', body: engine });
    if (ctx.state.project.root) ctx.cmd('build.run');
  },
  runLint,
  exportLatexdiff,
  toggleSidebar,
  togglePreview,
  toggleLivePreview,
  toggleWordWrap,
  toggleTheme,
  toggleFocusMode,
  beautify: beautifyDocument,
  normalizePunctuation: normalizePunctuationDocument,
  applyDisplayStyle: applyDisplayStyleDocument,
  collapseBlankLines: collapseBlankLinesDocument,
  applyFontSize,
  insertSection,
  wrapWith,
  insertList,
  insertAlignment,
  insertEnvironment,
  insertTodo,
  insertBlock,
  applyLocalFont,
  setEnumLabel,
  findInFile: () => openFind(false),
  replaceInFile: () => openFind(true),
  gotoLinePrompt: () => ctx.editor?.editor.getAction('editor.action.gotoLine')?.run(),
  triggerSuggest: () => ctx.editor?.editor.trigger('texora', 'editor.action.triggerSuggest', {}),
  toggleComment: () => ctx.editor?.editor.getAction('editor.action.commentLine')?.run(),
  duplicateLine: () => ctx.editor?.editor.getAction('editor.action.copyLinesDownAction')?.run(),
  synctexForward: async (line) => {
    if (!ctx.state.project.rootFile) return toast({ type: 'warn', title: '尚未识别主文档' });
    const file = ctx.state.activePath || ctx.state.project.rootFile;
    const target = line || ctx.editor.lastCursor.line;
    const generation = previewGeneration;
    const res = await api.tex.synctexForward(file, target, 1);
    if (generation !== previewGeneration) return;
    if (!res.ok) return toast({ type: 'warn', title: '正向定位失败', body: res.error || '请确认使用 -synctex=1 编译' });
    ctx.preview.flashAt(res.page, res.x, res.y, res.height || 12, res.width || 0);
    toast({ type: 'success', title: '已定位到 PDF', body: '第 ' + res.page + ' 页', timeout: 1500 });
  },
  gotoLocation,
  openPdfExternal,
  checkTexEnvironment,
  setTheme,
  setAccent,
  applyAppearance,
  loadPackages,
  applyAppRefresh: () => {},
  appRefreshRootLabel: () => {
    $('#sbRootName').textContent = ctx.state.project.rootFile ? baseName(ctx.state.project.rootFile) : '未识别主文档';
  }
};

// boot
boot().catch((err) => {
  console.error('[boot]', err);
  document.body.innerHTML = `<div style="padding:40px;font-family:system-ui;color:#e6e9f2;background:#0d0f16;height:100vh"><h2>TeXora 启动失败</h2><pre>${escapeHtml(err.stack || err.message)}</pre></div>`;
});
