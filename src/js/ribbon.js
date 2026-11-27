/** Top ribbon: compile controls, formatting, insertion menus and view toggles. */
import { ctx } from './ctx.js';
import { $, $$, icon, escapeHtml, openMenu, toast, baseName } from './util.js';
import { SIZE_OPTIONS, SYMBOL_GROUPS, toSnippet } from './symbols.js';
import { CODE_THEMES } from './code-themes.js';

export function createRibbon() {
  function init() {
    bindCommands();
    bindMenus();
    bindFormatting();
    refresh();
    ctx.on('settings:changed', () => refresh());
    ctx.on('build:state', () => refresh());
  }

  function bindCommands() {
    for (const btn of $$('[data-cmd]')) {
      if (btn.closest('.statusbar')) continue;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        ctx.cmd(btn.dataset.cmd);
      });
    }
  }

  function bindFormatting() {
    for (const btn of $$('[data-format]')) {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.format;
        if (kind === 'bold' || kind === 'italic' || kind === 'underline' || kind === 'strike' || kind === 'emph' || kind === 'texttt') {
          ctx.cmd('format.' + kind);
        } else if (kind === 'cjkPunct') {
          ctx.cmd('format.cjkPunct');
        } else if (kind === 'displaystyle') {
          ctx.cmd('format.displaystyle');
        } else if (kind === 'section') {
          ctx.cmd('format.section', btn);
        }
      });
    }
  }

  function bindMenus() {
    const handler = (menuName) => (e) => {
      const anchor = e.currentTarget;
      const menu = MENUS[menuName]?.(anchor);
      if (menu) openMenu(anchor, menu, { align: 'left' });
    };
    for (const btn of $$('[data-menu]')) {
      btn.addEventListener('click', handler(btn.dataset.menu));
    }
  }

  const check = (cond) => !!cond;

  const MENUS = {
    build: () => {
      const s = ctx.state.settings;
      if (ctx.state.overleafLive?.active) {
        const cur = ctx.state.overleafLive.compiler || 'pdflatex';
        const isLocalMirror = ctx.state.overleafLive.compileMode === 'local';
        const setOlCompiler = async (compiler) => {
          const res = await ctx.api.overleaf.liveUpdateSettings({ compiler });
          if (res?.ok) {
            ctx.state.overleafLive.compiler = res.compiler || compiler;
            ctx.app.syncOverleafModeUi?.();
          }
        };
        return [
          { group: 'Overleaf 编译方式' },
          { label: '本地极速预览（默认 · 自动镜像）', icon: 'auto-build', checked: isLocalMirror, onClick: () => ctx.app.setOverleafCompileMode?.('local') },
          { label: 'Overleaf 云端编译（终稿校验 / 兜底）', icon: 'cloud', checked: !isLocalMirror, onClick: () => ctx.app.setOverleafCompileMode?.('cloud') },
          { separator: true },
          { group: isLocalMirror ? '编译引擎（本地同步匹配）' : 'Overleaf 云端编译器' },
          { label: 'pdfLaTeX · 经典引擎', icon: 'play', checked: cur === 'pdflatex', onClick: () => setOlCompiler('pdflatex') },
          { label: 'XeLaTeX · 推荐中文', icon: 'play', checked: cur === 'xelatex', onClick: () => setOlCompiler('xelatex') },
          { label: 'LuaLaTeX · 现代引擎', icon: 'play', checked: cur === 'lualatex', onClick: () => setOlCompiler('lualatex') },
          { label: 'LaTeX', icon: 'play', checked: cur === 'latex', onClick: () => setOlCompiler('latex') },
          { separator: true },
          ...(isLocalMirror ? [
            { label: '自动编译（本地极速）', icon: 'eye', checked: s.build.livePreview, key: '自动', onClick: () => ctx.cmd('view.livePreview') },
            { label: '保存时触发本地编译', icon: 'download', checked: s.build.buildOnSave, onClick: () => ctx.api.settings.set('build.buildOnSave', !s.build.buildOnSave) },
            { label: '立即同步云端文件到本地镜像', icon: 'refresh', onClick: () => ctx.app.syncOverleafMirror?.() },
            { label: '清理本地镜像编译缓存并重编', icon: 'broom', onClick: () => ctx.cmd('build.clean', false) }
          ] : [
            { label: '极速草稿编译（Fast / Draft · 跳过高清插图）', icon: 'auto-build', checked: Boolean(ctx.state.overleafLive?.draft), onClick: () => {
              ctx.state.overleafLive.draft = !ctx.state.overleafLive.draft;
              ctx.ribbon?.refresh?.();
              toast({ type: 'info', title: ctx.state.overleafLive.draft ? '已开启 Overleaf 极速草稿编译' : '已切回 Overleaf 完整编译' });
            } },
            { label: '保存时触发云端编译', icon: 'download', checked: s.build.buildOnSave, onClick: () => ctx.api.settings.set('build.buildOnSave', !s.build.buildOnSave) },
            { label: '清除云端编译缓存并重编', icon: 'broom', onClick: () => ctx.cmd('build.clean', false) }
          ]),
          { separator: true },
          { label: 'Overleaf 项目设置…', icon: 'sliders', onClick: () => ctx.app.openOverleafSettings?.() }
        ];
      }
      const engines = [
        ['xelatex', 'XeLaTeX', '原生中文支持，推荐'],
        ['pdflatex', 'pdfLaTeX', '经典引擎，速度较快'],
        ['lualatex', 'LuaLaTeX', '支持 Lua 脚本与 OpenType'],
        ['latexmk', 'latexmk', '自动处理多遍编译与文献']
      ];
      return [
        { group: '编译引擎' },
        ...engines.map(([id, label, hint]) => ({
          label: `${label}${hint ? ' · ' + hint : ''}`,
          icon: 'play',
          checked: s.build.engine === id,
          onClick: () => ctx.cmd('build.engine', id)
        })),
        { separator: true },
        {
          label: '文献引擎',
          icon: 'book',
          onClick: () => {}
        },
        { label: `Biber（biblatex）`, checked: s.build.bibliography === 'biber', onClick: () => ctx.api.settings.set('build.bibliography', 'biber') },
        { label: `BibTeX（传统）`, checked: s.build.bibliography === 'bibtex', onClick: () => ctx.api.settings.set('build.bibliography', 'bibtex') },
        { separator: true },
        { label: '自动编译', icon: 'eye', checked: s.build.livePreview, key: '自动', onClick: () => ctx.cmd('view.livePreview') },
        { label: '保存时自动编译', icon: 'download', checked: s.build.buildOnSave, onClick: () => ctx.api.settings.set('build.buildOnSave', !s.build.buildOnSave) },
        { separator: true },
        { label: '清理过程文件', icon: 'broom', onClick: () => ctx.cmd('build.clean', false) },
        { label: '清理全部（含 PDF）', icon: 'trash', danger: true, onClick: () => ctx.cmd('build.clean', true) },
        { separator: true },
        { label: 'ChkTeX 静态语法检查', icon: 'shield', onClick: () => ctx.cmd('build.lint') },
        { label: '编译设置…', icon: 'sliders', onClick: () => ctx.cmd('settings.open', 'build') }
      ];
    },
    engine: () => (ctx.state.overleafLive?.active ? MENUS.build().slice(0, 9) : MENUS.build().slice(0, 5)),
    codeTheme: () => {
      const current = ctx.state.settings.appearance.codeTheme || 'auto';
      const toItem = ([id, label, swatch]) => ({
        label, swatch, checked: current === id,
        onClick: async () => {
          ctx.state.settings.appearance.codeTheme = id;
          ctx.editor.applyTheme();
          refresh();
          await ctx.api.settings.set('appearance.codeTheme', id);
        }
      });
      const autoItems = CODE_THEMES.filter((t) => (t[3] || 'auto') === 'auto').map(toItem);
      const darkItems = CODE_THEMES.filter((t) => t[3] === 'dark').map(toItem);
      const lightItems = CODE_THEMES.filter((t) => t[3] === 'light').map(toItem);
      const groups = ctx.state.theme === 'light'
        ? [{ group: 'Light 模式' }, ...lightItems, { separator: true }, { group: 'Dark 模式' }, ...darkItems]
        : [{ group: 'Dark 模式' }, ...darkItems, { separator: true }, { group: 'Light 模式' }, ...lightItems];
      return [
        { group: '代码编辑区高亮主题' },
        ...autoItems,
        { separator: true },
        ...groups
      ];
    },
    size: () => [
      { group: '字号（应用于选区或插入命令）' },
      ...SIZE_OPTIONS.map(([size, label]) => ({
        label: `\\${size} · ${label}`,
        icon: 'type',
        onClick: () => ctx.cmd('format.size', size)
      })),
      { separator: true },
      { label: '字体选择器（读取本地字体）…', icon: 'type', onClick: () => ctx.dialogs.openFontPicker('latin') }
    ],
    font: () => [
      { group: '中文字体（xeCJK / ctex）' },
      ...(ctx.state.fonts || [])
        .filter((f) => f.kind === 'cjk')
        .slice(0, 10)
        .map((f) => ({ label: f.name, icon: 'type', onClick: () => ctx.app.applyLocalFont('cjk', f.name) })),
      { group: '英文字体（fontspec）' },
      ...(ctx.state.fonts || [])
        .filter((f) => f.kind === 'latin')
        .slice(0, 10)
        .map((f) => ({ label: f.name, icon: 'type', onClick: () => ctx.app.applyLocalFont('latin', f.name) })),
      { separator: true },
      { label: '浏览全部本地字体…', icon: 'type', onClick: () => ctx.dialogs.openFontPicker('cjk') }
    ],
    list: () => [
      { label: '无序列表 itemize', icon: 'list-ul', onClick: () => ctx.cmd('insert.list', 'itemize') },
      { label: '有序列表 enumerate', icon: 'list-ol', onClick: () => ctx.cmd('insert.list', 'enumerate') },
      { label: '描述列表 description', icon: 'list-desc', onClick: () => ctx.cmd('insert.list', 'description') },
      { separator: true },
      { group: '编号样式' },
      { label: '（1）（2）（3）', onClick: () => ctx.app.setEnumLabel('label=(\\arabic*)') },
      { label: 'a) b) c)', onClick: () => ctx.app.setEnumLabel('label=\\alph*)') },
      { label: 'i. ii. iii.', onClick: () => ctx.app.setEnumLabel('label=\\roman*.') },
      { label: '（一）（二）（三）', onClick: () => ctx.app.setEnumLabel('label=（\\chinese*）') },
      { label: '紧凑列表（nosep）', onClick: () => ctx.app.setEnumLabel('nosep') }
    ],
    align: () => [
      { label: '左对齐 flushleft', icon: 'align-left', onClick: () => ctx.cmd('insert.align', 'flushleft') },
      { label: '居中 center', icon: 'align-center', onClick: () => ctx.cmd('insert.align', 'center') },
      { label: '右对齐 flushright', icon: 'align-right', onClick: () => ctx.cmd('insert.align', 'flushright') },
      { separator: true },
      { label: '取消段落缩进 \\noindent', icon: 'type', onClick: () => ctx.editor.insertText('\\noindent ') },
      { label: '强制换行 \\\\', icon: 'type', onClick: () => ctx.editor.insertText('\\\\\n') }
    ],
    spacing: () => [
      { label: '单倍行距 \\singlespacing', icon: 'layers', onClick: () => ctx.editor.insertText('\\singlespacing ') },
      { label: '1.5 倍行距 \\onehalfspacing', icon: 'layers', onClick: () => ctx.editor.insertText('\\onehalfspacing ') },
      { label: '双倍行距 \\doublespacing', icon: 'layers', onClick: () => ctx.editor.insertText('\\doublespacing ') },
      { separator: true },
      { label: '垂直间距 \\vspace{}', icon: 'layers', onClick: () => ctx.editor.insertText('\\vspace{1em}\n') },
      { label: '分页 \\newpage', icon: 'paper', onClick: () => ctx.editor.insertText('\\newpage\n') },
      { label: '段落间距 \\par', icon: 'layers', onClick: () => ctx.editor.insertText('\\par\n') }
    ],
    math: () => [
      { label: '打开数学符号面板…', icon: 'sigma', onClick: () => ctx.dialogs.openSymbols() },
      { label: '最近使用', icon: 'history', onClick: () => ctx.dialogs.openSymbols('recent') },
      { separator: true },
      ...SYMBOL_GROUPS.slice(0, 5).map((g) => ({ label: g.title, icon: 'sigma', onClick: () => ctx.dialogs.openSymbols(g.id) }))
    ],
    env: () => {
      const groups = [
        ['数学', ['equation', 'align', 'gather', 'cases', 'matrix', 'pmatrix', 'aligned']],
        ['定理', ['theorem', 'lemma', 'proposition', 'corollary', 'definition', 'proof', 'remark', 'example']],
        ['浮动体', ['figure', 'table', 'tabular', 'longtable', 'tblr']],
        ['列表与文本', ['itemize', 'enumerate', 'description', 'quote', 'center', 'minipage']],
        ['绘图与代码', ['tikzpicture', 'lstlisting', 'verbatim', 'minted']]
      ];
      const items = [];
      for (const [group, envs] of groups) {
        items.push({ group });
        for (const env of envs) items.push({ label: env, icon: 'code', onClick: () => ctx.app.insertEnvironment(env) });
      }
      return items;
    },
    tools: () => [
      { label: '删除线 \\sout', icon: 'strike', onClick: () => ctx.cmd('format.strike') },
      { label: '行内公式 \\displaystyle 化', icon: 'display-math', onClick: () => ctx.cmd('format.displaystyle') },
      { label: '自动换行', icon: 'wrap', key: 'Alt+Z', checked: check(ctx.state.settings?.editor?.wordWrap), onClick: () => ctx.cmd('view.toggleWordWrap') },
      { separator: true },
      { label: '模板中心', icon: 'layers', onClick: () => ctx.dialogs.openTemplates() },
      { label: '文献管理器（.bib）', icon: 'book', onClick: () => ctx.dialogs.openBibManager() },
      { label: 'DOI / arXiv 抓取 BibTeX', icon: 'download', onClick: () => ctx.dialogs.openDoiFetch() },
      { separator: true },
      { label: 'Markdown 预览与导出', icon: 'code', onClick: () => ctx.dialogs.openMarkdownTools() },
      { label: ctx.state.overleafLive?.active ? 'LaTeXdiff 对比导出（仅本地）' : 'LaTeXdiff 对比导出', icon: 'code', disabled: Boolean(ctx.state.overleafLive?.active), onClick: () => ctx.cmd('export.latexdiff') },
      { label: '批注（todonotes）', icon: 'message', onClick: () => ctx.app.insertTodo() },
      { separator: true },
      { label: '快捷键一览', icon: 'keyboard', onClick: () => ctx.dialogs.openShortcuts() },
      { label: '关于 TeXora', icon: 'info', onClick: () => ctx.cmd('help.about') }
    ]
  };

  function refresh() {
    const s = ctx.state.settings;
    if (!s) return;
    const isLive = Boolean(ctx.state.overleafLive?.active);
    const isLocalMirror = isLive && ctx.state.overleafLive.compileMode === 'local';
    const isCloudOnly = isLive && !isLocalMirror;
    const build = $('#btnBuild');
    if (build) {
      const running = !!ctx.state.build.running;
      build.dataset.cmd = running ? 'build.stop' : 'build.run';
      build.classList.toggle('busy', running);
      build.disabled = !!ctx.state.build.stopping;
      build.setAttribute('aria-busy', String(running));
      build.title = running
        ? '停止当前编译'
        : isLocalMirror
          ? '本地极速编译 Overleaf 镜像 (Ctrl+Alt+B)'
          : isLive
            ? '触发 Overleaf 云端编译 (Ctrl+Alt+B)'
            : '保存修改并编译项目 (Ctrl+Alt+B)';
      build.innerHTML = `${icon(running ? 'stop' : 'compile')}<span>${ctx.state.build.stopping ? '停止中…' : running ? '停止编译' : ctx.state.build.state === 'error' ? '重试编译' : isLocalMirror ? '本地编译' : isLive ? '云端编译' : '编译'}</span>`;
    }
    const themeLabel = $('#codeThemeLabel');
    const theme = CODE_THEMES.find(([id]) => id === (s.appearance.codeTheme || 'auto'));
    if (themeLabel) themeLabel.textContent = theme?.[1] || '代码主题';
    const themeBtn = $('#codeThemeBtn');
    if (themeBtn) themeBtn.title = '更换代码高亮主题 · ' + (theme?.[1] || '跟随日夜');
    const engNames = { xelatex: 'XeLaTeX', pdflatex: 'pdfLaTeX', lualatex: 'LuaLaTeX', latexmk: 'latexmk', latex: 'LaTeX' };
    const olEng = engNames[ctx.state.overleafLive?.compiler || 'pdflatex'] || 'pdfLaTeX';
    const engineLabel = isLocalMirror
      ? `本地 · ${olEng}`
      : isLive
        ? `云端 · ${olEng}`
        : (engNames[s.build.engine] || s.build.engine);
    const label = $('#engineLabel');
    if (label) label.textContent = engineLabel;
    const sbEngine = $('#sbEngine');
    if (sbEngine) {
      sbEngine.textContent = engineLabel;
      sbEngine.title = isLocalMirror
        ? 'Overleaf 本地极速镜像模式 · 点击打开项目设置'
        : isLive
          ? 'Overleaf 云端编译器 · 点击打开项目设置'
          : '当前本地编译引擎';
      sbEngine.style.cursor = isLive ? 'pointer' : '';
    }
    const liveBtn = $('#liveBtn');
    if (liveBtn) {
      liveBtn.classList.toggle('active', !isCloudOnly && !!s.build.livePreview);
      liveBtn.disabled = isCloudOnly;
      liveBtn.title = isCloudOnly
        ? 'Overleaf 云端编译模式下不启用自动编译（可在编译菜单切换「本地极速预览」）'
        : isLocalMirror
          ? '本地镜像自动编译'
          : '自动编译';
    }
    const sbLive = $('#sbLive');
    if (sbLive) {
      sbLive.classList.toggle('off', isCloudOnly || !s.build.livePreview);
      sbLive.classList.toggle('is-disabled', isCloudOnly);
      sbLive.title = isCloudOnly ? 'Overleaf 云端模式下不启用自动编译（可切换本地极速预览）' : '切换自动编译';
      sbLive.innerHTML = isCloudOnly
        ? `${icon('eye')}云端手动编译`
        : isLocalMirror
          ? `${icon('eye')}本地自动${s.build.livePreview ? '开' : '关'}`
          : `${icon('eye')}自动编译${s.build.livePreview ? '开' : '关'}`;
    }
    const toggleSidebarBtn = $('#toggleSidebarBtn');
    toggleSidebarBtn?.classList.toggle('active', !$('#sidebar')?.classList.contains('collapsed'));
    const togglePreviewBtn = $('#togglePreviewBtn');
    togglePreviewBtn?.classList.toggle('active', !$('#previewPane')?.classList.contains('collapsed'));
    const sizeLabel = $('#sizeLabel');
    if (sizeLabel) sizeLabel.textContent = s.editor.lastSize ? '\\' + s.editor.lastSize : '字号';
    const wrapBtn = $('#wrapBtn');
    wrapBtn?.classList.toggle('active', !!s.editor.wordWrap);
    const sbWrap = $('#sbWrap');
    if (sbWrap) sbWrap.textContent = s.editor.wordWrap ? '换行: 开' : '换行: 关';
  }

  return { init, refresh };
}
