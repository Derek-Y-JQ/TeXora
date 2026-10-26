/**
 * Command registry, global keybindings and the quick command palette.
 * All behaviour is delegated to ctx.app / feature modules so the command list
 * stays declarative and is reused by the palette, menus and shortcuts.
 */
import { ctx } from './ctx.js';
import { $, $$, el, icon, escapeHtml, debounce, toast, baseName, extOf } from './util.js';

export function createCommands() {
  const list = [];
  const map = new Map();

  function register(def) {
    list.push(def);
    map.set(def.id, def);
    if (def.aliases) def.aliases.forEach((a) => map.set(a, def));
  }

  function run(id, ...args) {
    const def = map.get(id);
    if (!def) {
      console.warn('[cmd] unknown', id);
      return;
    }
    try {
      return def.run(...args);
    } catch (err) {
      console.error('[cmd]', id, err);
      toast({ type: 'error', title: '命令执行失败', body: err.message });
    }
  }

  /* ------------------------------------------------------------- projects */
  register({ id: 'project.open', title: '打开项目文件夹', group: '项目', icon: 'folder', keys: 'Ctrl+O', run: () => ctx.app.openProject() });
  register({ id: 'project.new', title: '新建文档 / 项目向导', group: '项目', icon: 'plus', keys: 'Ctrl+N', run: () => ctx.dialogs.openNewProject() });
  register({ id: 'project.close', title: '关闭当前项目', group: '项目', icon: 'close', run: () => ctx.app.closeProject() });
  register({ id: 'project.refreshRoot', title: '重新识别主文档', group: '项目', icon: 'target', run: () => ctx.app.refreshRootFile() });
  register({ id: 'templates.open', title: '模板中心', group: '项目', icon: 'layers', run: () => ctx.dialogs.openTemplates() });

  /* ------------------------------------------------------------ documents */
  register({ id: 'doc.open', title: '打开文件', group: '文件', icon: 'file', run: (path) => ctx.app.openDocument(path) });
  register({ id: 'doc.new', title: '新建 LaTeX 文件', group: '文件', icon: 'plus', run: () => ctx.app.newDocument() });
  register({ id: 'doc.save', title: '保存', group: '文件', icon: 'download', keys: 'Ctrl+S', run: () => ctx.app.saveDocument() });
  register({ id: 'doc.saveAll', title: '全部保存', group: '文件', icon: 'download', keys: 'Ctrl+Shift+S', run: () => ctx.app.saveAll() });
  register({ id: 'doc.close', title: '关闭当前文件', group: '文件', icon: 'close', keys: 'Ctrl+W', run: (path) => ctx.app.closeDocument(path) });
  register({ id: 'doc.reload', title: '从磁盘重新载入', group: '文件', icon: 'refresh', run: (path) => ctx.app.reloadDocument(path) });
  register({ id: 'doc.markDirty', title: '标记为已修改', group: '文件', icon: 'pencil', hidden: true, run: () => ctx.app.markDirty() });
  register({ id: 'doc.nextTab', title: '切换到下一个标签', group: '文件', icon: 'chevron-right', keys: 'Ctrl+Tab', hidden: true, run: () => ctx.app.cycleTab(1) });
  register({ id: 'doc.prevTab', title: '切换到上一个标签', group: '文件', icon: 'chevron-left', keys: 'Ctrl+Shift+Tab', hidden: true, run: () => ctx.app.cycleTab(-1) });

  /* ---------------------------------------------------------------- build */
  register({ id: 'build.run', title: '编译文档', group: '编译', icon: 'play', keys: 'Ctrl+Alt+B', run: (opts) => ctx.app.runBuild(opts) });
  register({ id: 'build.stop', title: '停止编译', group: '编译', icon: 'stop', run: () => ctx.app.stopBuild() });
  register({ id: 'build.clean', title: '清理过程文件', group: '编译', icon: 'broom', run: (all) => ctx.app.cleanBuild(all) });
  register({ id: 'build.toggleProblems', title: '切换问题面板', group: '编译', icon: 'alert', keys: 'Ctrl+Shift+M', run: () => ctx.app.toggleProblems() });
  register({
    id: 'build.engine',
    title: '切换编译引擎',
    group: '编译',
    icon: 'sliders',
    run: (engine) => ctx.app.setEngine(engine)
  });
  register({ id: 'synctex.forward', title: '正向定位到 PDF', group: '预览', icon: 'target', hidden: true, run: (line) => ctx.app.synctexForward(line) });
  register({ id: 'build.lint', title: 'ChkTeX 语法检查', group: '编译', icon: 'shield', run: () => ctx.app.runLint() });
  register({ id: 'export.latexdiff', title: '导出 LaTeXdiff 对比 PDF', group: '编译', icon: 'code', run: () => ctx.app.exportLatexdiff() });

  /* ----------------------------------------------------------------- view */
  register({ id: 'view.toggleSidebar', title: '折叠 / 展开侧边栏', group: '视图', icon: 'panel-left', keys: 'Ctrl+Alt+1', run: () => ctx.app.toggleSidebar() });
  register({ id: 'view.togglePreview', title: '折叠 / 展开 PDF 预览', group: '视图', icon: 'panel-right', keys: 'Ctrl+Alt+2', run: () => ctx.app.togglePreview() });
  register({ id: 'view.toggleWordWrap', title: '切换自动换行', group: '视图', icon: 'wrap', keys: 'Alt+Z', run: () => ctx.app.toggleWordWrap() });
  register({ id: 'view.livePreview', title: '开关自动编译', group: '视图', icon: 'eye', run: () => ctx.app.toggleLivePreview() });
  register({ id: 'view.toggleTheme', title: '切换昼 / 夜主题', group: '视图', icon: 'moon', keys: 'Ctrl+Shift+L', run: () => ctx.app.toggleTheme() });
  register({ id: 'view.sidebar', title: '显示侧边栏面板', group: '视图', icon: 'layers', run: (panel) => ctx.sidebar.show(panel) });
  register({ id: 'view.focusMode', title: '专注模式（折叠两侧）', group: '视图', icon: 'target', keys: 'F11', run: () => ctx.app.toggleFocusMode() });
  register({ id: 'app.checkUpdates', title: '检查软件更新', group: '帮助', icon: 'download', run: () => ctx.app.checkUpdates(true) });
  register({ id: 'view.shortcuts', title: '快捷键一览', group: '视图', icon: 'keyboard', run: () => ctx.dialogs.openShortcuts() });

  /* -------------------------------------------------------------- preview */
  register({ id: 'preview.next', title: '预览下一页', group: '预览', icon: 'chevron-right', hidden: true, run: () => ctx.preview.nextPage() });
  register({ id: 'preview.prev', title: '预览上一页', group: '预览', icon: 'chevron-left', hidden: true, run: () => ctx.preview.prevPage() });
  register({ id: 'preview.zoomIn', title: '预览放大', group: '预览', icon: 'zoom-in', keys: 'Ctrl+=', run: () => ctx.preview.zoomIn() });
  register({ id: 'preview.zoomOut', title: '预览缩小', group: '预览', icon: 'zoom-out', keys: 'Ctrl+-', run: () => ctx.preview.zoomOut() });
  register({ id: 'preview.fitWidth', title: '预览适合宽度', group: '预览', icon: 'fit', keys: 'Ctrl+0', run: () => ctx.preview.fitWidth() });
  register({ id: 'preview.invert', title: 'PDF 夜间反色', group: '预览', icon: 'moon', run: () => ctx.preview.toggleInvert() });
  register({ id: 'preview.refresh', title: '刷新预览', group: '预览', icon: 'refresh', run: () => ctx.app.runBuild({ previewOnly: true }) });
  register({ id: 'preview.external', title: '用系统默认程序打开 PDF', group: '预览', icon: 'external', run: () => ctx.app.openPdfExternal() });

  /* --------------------------------------------------------------- editor */
  register({ id: 'editor.goto', title: '跳转到位置', group: '编辑', icon: 'target', hidden: true, run: (opts) => ctx.app.gotoLocation(opts) });
  register({ id: 'editor.format', title: '整理 LaTeX 源稿', group: '编辑', icon: 'wand', keys: 'Ctrl+Alt+F', run: () => ctx.app.beautify() });
  register({ id: 'editor.find', title: '在当前文件中查找', group: '编辑', icon: 'search', keys: 'Ctrl+F', run: () => ctx.app.findInFile() });
  register({ id: 'editor.replace', title: '在当前文件中替换', group: '编辑', icon: 'refresh', keys: 'Ctrl+H', run: () => ctx.app.replaceInFile() });
  register({ id: 'editor.gotoLine', title: '跳转到行', group: '编辑', icon: 'target', keys: 'Ctrl+G', run: () => ctx.app.gotoLinePrompt() });
  register({ id: 'editor.selectAll', title: '全选', group: '编辑', icon: 'copy', hidden: true, run: () => ctx.editor?.editor.trigger('texora', 'editor.action.selectAll') });
  register({ id: 'editor.insertSnippet', title: '插入代码片段', group: '编辑', icon: 'code', run: () => ctx.app.triggerSuggest() });
  register({ id: 'editor.comment', title: '注释 / 取消注释', group: '编辑', icon: 'code', keys: 'Ctrl+/', run: () => ctx.app.toggleComment() });
  register({ id: 'editor.duplicateLine', title: '复制当前行', group: '编辑', icon: 'copy', keys: 'Shift+Alt+Down', run: () => ctx.app.duplicateLine() });

  /* ------------------------------------------------------------- formatting */
  register({ id: 'format.bold', title: '加粗', group: '格式', icon: 'bold', run: () => ctx.editor.wrapSelection('bold') });
  register({ id: 'format.italic', title: '斜体', group: '格式', icon: 'italic', run: () => ctx.editor.wrapSelection('italic') });
  register({ id: 'format.underline', title: '下划线', group: '格式', icon: 'underline', run: () => ctx.editor.wrapSelection('underline') });
  register({ id: 'format.strike', title: '删除线', group: '格式', icon: 'strike', run: () => ctx.app.wrapWith('\\sout') });
  register({ id: 'format.emph', title: '强调', group: '格式', icon: 'emph', run: () => ctx.editor.wrapSelection('emph') });
  register({ id: 'format.texttt', title: '等宽字体', group: '格式', icon: 'tt', run: () => ctx.editor.wrapSelection('texttt') });
  register({ id: 'format.size', title: '设置字号', group: '格式', icon: 'type', run: (size) => ctx.app.applyFontSize(size) });
  register({ id: 'format.section', title: '插入章节命令', group: '格式', icon: 'outline', run: (anchor) => ctx.app.insertSection(anchor) });
  register({ id: 'format.beautify', title: '一键整理格式', group: '整理', icon: 'wand', run: () => ctx.app.beautify() });
  register({ id: 'format.punctHalf', title: '中文标点 → 英文标点', group: '整理', icon: 'punct-half', run: () => ctx.app.normalizePunctuation('half') });
  register({ id: 'format.punctFull', title: '英文标点 → 中文标点', group: '整理', icon: 'punct-full', run: () => ctx.app.normalizePunctuation('full') });
  register({ id: 'format.displaystyle', title: '行内公式 \\displaystyle 化', group: '整理', icon: 'sigma', run: () => ctx.app.applyDisplayStyle() });
  register({ id: 'format.cleanBlank', title: '压缩多余空行', group: '整理', icon: 'layers', run: () => ctx.app.collapseBlankLines() });

  /* ---------------------------------------------------------------- insert */
  register({ id: 'insert.image', title: '插入图片', group: '插入', icon: 'image', run: () => ctx.dialogs.openImageDialog() });
  register({ id: 'insert.imageData', title: '插入剪贴板图片', group: '插入', icon: 'image', hidden: true, run: (dataUrl, source) => ctx.dialogs.openImageDialog({ dataUrl, source }) });
  register({ id: 'insert.table', title: '插入表格', group: '插入', icon: 'table', run: () => ctx.dialogs.openTableWizard() });
  register({ id: 'insert.cite', title: '插入文献引用', group: '插入', icon: 'book', keys: 'Ctrl+Shift+C', run: (key) => ctx.dialogs.openCitePicker(key) });
  register({ id: 'insert.symbols', title: '数学符号面板', group: '插入', icon: 'sigma', run: () => ctx.dialogs.openSymbols() });
  register({ id: 'insert.environment', title: '插入环境', group: '插入', icon: 'code', run: () => ctx.dialogs.openEnvironmentPicker() });
  register({ id: 'insert.footnote', title: '插入脚注', group: '插入', icon: 'message', run: () => ctx.app.wrapWith('\\footnote') });
  register({ id: 'insert.list', title: '插入列表环境', group: '插入', icon: 'list-ul', run: (kind) => ctx.app.insertList(kind) });
  register({ id: 'insert.align', title: '对齐方式', group: '插入', icon: 'align-left', run: (kind) => ctx.app.insertAlignment(kind) });

  /* ---------------------------------------------------------------- export */
  register({ id: 'export.pdf', title: '用系统程序打开 PDF', group: '导出', icon: 'paper', run: () => ctx.app.openPdfExternal() });
  register({ id: 'export.bib', title: 'DOI / arXiv 抓取 BibTeX', group: '导出', icon: 'download', run: () => ctx.dialogs.openDoiFetch() });

  /* -------------------------------------------------------------------- AI */
  register({ id: 'ai.assistant', title: '打开 AI 助手', group: 'AI', icon: 'sparkles', keys: 'Ctrl+Shift+A', run: () => ctx.ai.openAssistant() });
  register({ id: 'ai.blockAction', title: '对当前块执行 AI 操作', group: 'AI', icon: 'sparkles', hidden: true, run: (opts) => ctx.ai.runBlockAction(opts) });
  register({ id: 'ai.selectionAction', title: '对选中内容执行 AI 操作', group: 'AI', icon: 'sparkles', hidden: true, run: (opts) => ctx.ai.runSelectionAction(opts) });
  register({ id: 'ai.custom', title: '自定义 AI 指令（块）', group: 'AI', icon: 'sparkles', hidden: true, run: () => ctx.ai.runCustom({ target: 'block' }) });
  register({ id: 'ai.customSelection', title: '自定义 AI 指令（选区）', group: 'AI', icon: 'sparkles', hidden: true, run: () => ctx.ai.runCustom({ target: 'selection' }) });
  register({ id: 'ai.explain', title: 'AI 解释选中内容', group: 'AI', icon: 'message', run: () => ctx.ai.explainSelection() });
  register({ id: 'ai.polish', title: 'AI 润色当前段落', group: 'AI', icon: 'wand', run: () => ctx.ai.polishParagraph() });
  register({ id: 'ai.translate', title: 'AI 中英学术互译', group: 'AI', icon: 'code', run: () => ctx.ai.translateSelection() });
  register({ id: 'ai.tableFromText', title: 'AI 从文本生成表格', group: 'AI', icon: 'table', run: () => ctx.ai.tableFromText() });
  register({ id: 'ai.ocr', title: '从剪贴板截图识别公式', group: 'AI', icon: 'image', run: () => ctx.ai.ocrFromClipboard() });
  register({ id: 'ai.freeform', title: 'AI 自由提问', group: 'AI', icon: 'send', hidden: true, run: (opts) => ctx.ai.freeform(opts) });
  register({ id: 'ai.resultAction', title: 'AI 结果操作', group: 'AI', icon: 'check', hidden: true, run: (opts) => ctx.ai.resultAction(opts) });
  register({ id: 'ai.fixProblem', title: 'AI 诊断编译错误', group: 'AI', icon: 'sparkles', run: () => ctx.ai.fixProblems() });

  /* -------------------------------------------------------------- settings */
  register({ id: 'settings.open', title: '打开设置', group: '设置', icon: 'sliders', keys: 'Ctrl+,', run: (section) => ctx.settingsUI.open(section) });
  register({ id: 'settings.reset', title: '恢复默认设置', group: '设置', icon: 'refresh', run: () => ctx.settingsUI.resetAll() });
  register({ id: 'help.about', title: '关于 TeXora', group: '帮助', icon: 'info', run: () => ctx.dialogs.openAbout() });
  register({ id: 'help.sphinx', title: '检查 TeX 环境', group: '帮助', icon: 'shield', run: () => ctx.app.checkTexEnvironment() });

  /* ------------------------------------------------------------- keybinding */
  const KEYMAP = [
    ['ctrl+alt+b', 'build.run'],
    ['f5', 'build.run'],
    ['ctrl+s', 'doc.save'],
    ['ctrl+shift+s', 'doc.saveAll'],
    ['ctrl+o', 'project.open'],
    ['ctrl+n', 'project.new'],
    ['ctrl+w', 'doc.close'],
    ['ctrl+,', 'settings.open'],
    ['ctrl+shift+l', 'view.toggleTheme'],
    ['ctrl+alt+1', 'view.toggleSidebar'],
    ['ctrl+alt+2', 'view.togglePreview'],
    ['ctrl+shift+m', 'build.toggleProblems'],
    ['ctrl+shift+a', 'ai.assistant'],
    ['ctrl+shift+c', 'insert.cite'],
    ['ctrl+shift+f', 'view.sidebar:search'],
    ['ctrl+g', 'editor.gotoLine'],
    ['ctrl+alt+f', 'editor.format'],
    ['alt+z', 'view.toggleWordWrap'],
    ['ctrl+/', 'editor.comment'],
    ['shift+alt+down', 'editor.duplicateLine'],
    ['f11', 'view.focusMode'],
    ['ctrl+=', 'preview.zoomIn'],
    ['ctrl+-', 'preview.zoomOut'],
    ['ctrl+0', 'preview.fitWidth'],
    ['ctrl+k', 'palette.open'],
    ['ctrl+shift+p', 'palette.open'],
    ['escape', 'palette.close']
  ];

  function matchKey(def, event) {
    if (!def.keys) return false;
    return def.keys.split('/').some((combo) => normalizeCombo(combo) === eventToCombo(event));
  }

  function onKeyDown(event) {
    const target = event.target;
    const inInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    const combo = eventToCombo(event);
    if (combo === 'ctrl+k' || combo === 'ctrl+shift+p') {
      if (!inInput || target.closest('.monaco-editor')) {
        event.preventDefault();
        openPalette();
      }
      return;
    }
    if (combo === 'escape') {
      closePalette();
      return;
    }

    // user-defined bindings take precedence
    const custom = ctx.state.settings?.keys?.custom || {};
    for (const [cmdId, bound] of Object.entries(custom)) {
      if (!bound) continue;
      if (normalizeCombo(bound) === combo) {
        event.preventDefault();
        run(cmdId);
        return;
      }
    }
    // keyboard presets that re-map the primary compile shortcut
    const preset = ctx.state.settings?.keys?.preset || 'vscode';
    const presetBuild = { vscode: 'ctrl+alt+b', winedt: 'f9', texifier: 'f8', vim: 'f5' };
    if (preset !== 'vscode' && combo === presetBuild[preset]) {
      event.preventDefault();
      run('build.run');
      return;
    }
    for (const [keys, id] of KEYMAP) {
      if (keys !== combo) continue;
      if (combo === 'ctrl+k') continue;
      const [cmdId, arg] = id.split(':');
      if (cmdId === 'palette.open' || cmdId === 'palette.close') continue;
      // Monaco handles its own editor-level shortcuts; skip when typing in inputs
      event.preventDefault();
      run(cmdId, arg);
      return;
    }
  }

  function eventToCombo(e) {
    const parts = [];
    if (e.ctrlKey) parts.push('ctrl');
    if (e.shiftKey) parts.push('shift');
    if (e.altKey) parts.push('alt');
    let key = e.key.toLowerCase();
    if (key === ' ') key = 'space';
    if (key === '=' && e.shiftKey) key = '+';
    if (['control', 'shift', 'alt', 'meta'].includes(key)) return '';
    parts.push(key);
    return parts.join('+');
  }
  function normalizeCombo(combo) {
    return combo
      .toLowerCase()
      .split('+')
      .map((p) => p.trim())
      .filter(Boolean)
      .join('+');
  }

  window.addEventListener('keydown', onKeyDown);

  /* ---------------------------------------------------------------- palette */
  const paletteLayer = () => document.getElementById('paletteLayer');
  let paletteIndex = 0;
  let paletteItems = [];

  function openPalette(initial = '') {
    const layer = paletteLayer();
    if (!layer) return;
    layer.innerHTML = `
      <div class="palette-backdrop"></div>
      <div class="palette">
        <div class="palette-input-row">
          ${icon('command')}
          <input class="palette-input" id="paletteInput" placeholder="输入命令…（> 仅命令，@ 文件，: 行号）" value="${escapeHtml(initial)}" spellcheck="false" />
          <kbd>Esc</kbd>
        </div>
        <div class="palette-list" id="paletteList"></div>
        <div class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>Enter</kbd> 执行</span><span><kbd>Esc</kbd> 关闭</span><span class="spacer"></span><span>TeXora 命令面板</span></div>
      </div>`;
    layer.classList.add('open');
    const input = layer.querySelector('#paletteInput');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    const refresh = debounce(() => renderPalette(input.value), 70);
    input.addEventListener('input', refresh);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        paletteIndex = Math.min(paletteItems.length - 1, paletteIndex + 1);
        paintActive();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        paletteIndex = Math.max(0, paletteIndex - 1);
        paintActive();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = paletteItems[paletteIndex];
        if (item) {
          closePalette();
          item.action();
        }
      } else if (e.key === 'Escape') {
        closePalette();
      }
    });
    layer.querySelector('.palette-backdrop').addEventListener('click', closePalette);
    renderPalette(initial);
    setTimeout(() => input.focus(), 20);
  }

  function closePalette() {
    const layer = paletteLayer();
    if (!layer) return;
    layer.classList.remove('open');
    layer.innerHTML = '';
  }

  function paletteCommands(query) {
    const q = query.toLowerCase().replace(/^>/, '').trim();
    return list
      .filter((c) => !c.hidden)
      .filter((c) => !q || c.title.toLowerCase().includes(q) || c.id.includes(q) || (c.group || '').toLowerCase().includes(q))
      .slice(0, 40)
      .map((c) => ({
        title: c.title,
        sub: c.group + (c.keys ? ` · ${c.keys}` : ''),
        icon: c.icon || 'command',
        action: () => run(c.id)
      }));
  }

  function renderPalette(value) {
    const box = document.getElementById('paletteList');
    if (!box) return;
    paletteItems = [];
    let kind = '命令';
    if (value.trim().startsWith('@')) {
      const q = value.trim().slice(1).toLowerCase();
      kind = '文件';
      const files = (ctx.state.assets.all || []).filter((f) => f.toLowerCase().includes(q)).slice(0, 40);
      paletteItems = files.map((f) => ({ title: f, sub: '文件', icon: 'file', action: () => ctx.app.openDocument(`${ctx.state.project.root}\\${f.split('/').join('\\')}`) }));
    } else if (value.trim().startsWith(':') && ctx.state.activePath) {
      kind = '标签';
      const q = value.trim().slice(1);
      paletteItems = (ctx.state.parsed?.labels || [])
        .filter((l) => l.name.includes(q))
        .slice(0, 40)
        .map((l) => ({ title: l.name, sub: `第 ${l.line} 行`, icon: 'target', action: () => ctx.app.gotoLocation({ line: l.line }) }));
    } else {
      paletteItems = paletteCommands(value);
    }
    paletteIndex = 0;
    box.innerHTML = paletteItems.length
      ? paletteItems
          .map(
            (it, i) => `<div class="palette-item ${i === 0 ? 'active' : ''}" data-i="${i}">
        ${icon(it.icon || 'command')}
        <span class="p-title">${escapeHtml(it.title)}</span>
        <span class="p-sub">${escapeHtml(it.sub || '')}</span>
      </div>`
          )
          .join('')
      : `<div class="palette-empty">没有匹配的${kind}</div>`;
    for (const row of $$('.palette-item', box)) {
      row.addEventListener('click', () => {
        const item = paletteItems[Number(row.dataset.i)];
        closePalette();
        item?.action();
      });
      row.addEventListener('mousemove', () => {
        paletteIndex = Number(row.dataset.i);
        paintActive();
      });
    }
  }

  function paintActive() {
    const box = document.getElementById('paletteList');
    if (!box) return;
    for (const row of $$('.palette-item', box)) {
      const active = Number(row.dataset.i) === paletteIndex;
      row.classList.toggle('active', active);
      if (active) row.scrollIntoView({ block: 'nearest' });
    }
  }

  return { list, map, register, run, openPalette, closePalette, matchKey };
}
