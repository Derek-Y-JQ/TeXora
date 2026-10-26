/**
 * Left sidebar: file explorer, outline, math environments, labels & refs,
 * project search, local history, git and the AI assistant panel.
 */
import { ctx } from './ctx.js';
import { $, $$, el, icon, escapeHtml, baseName, relPath, fileIcon, extOf, debounce, formatBytes, timeAgo, timeOfDay, toast, openMenu, openPopover, closeMenu, copyText } from './util.js';
import { parseDocument } from './latex.js';
import { contextPolicy } from './ai-context.js';

const PANEL_META = {
  files: { title: '文件', icon: 'files' },
  outline: { title: '大纲', icon: 'outline' },
  math: { title: '数学环境', icon: 'functions' },
  labels: { title: '标签与引用', icon: 'tags' },
  search: { title: '全局查找', icon: 'search' },
  history: { title: '本地历史', icon: 'history' },
  git: { title: 'Git', icon: 'git' },
  ai: { title: 'AI 助手', icon: 'sparkles' }
};

export class Sidebar {
  constructor() {
    this.expanded = new Set();
    this.filter = '';
    this.panel = 'files';
    this.searchState = { query: '', caseSensitive: false, wholeWord: false, regex: false, include: '', results: null, busy: false, scope: 'project' };
    this.historyItems = [];
    this.aiThread = [];
    this.aiContext = { selection: true, file: true, skillIds: null, files: new Set() };
    this.ready = false;
  }

  init() {
    this.body = $('#sidebarBody');
    this.titleEl = $('#sidebarTitle');
    this.actionsEl = $('#sidebarActions');
    this.body.innerHTML = Object.keys(PANEL_META).map((id) => `<div class="panel" data-panel="${id}"></div>`).join('');
    this.panels = {};
    for (const node of $$('.panel', this.body)) this.panels[node.dataset.panel] = node;

    for (const btn of $$('.act-btn[data-panel]')) {
      btn.addEventListener('click', () => {
        if (this.panel === btn.dataset.panel && !$('#sidebar').classList.contains('collapsed')) ctx.cmd('view.toggleSidebar');
        else this.show(btn.dataset.panel);
      });
    }
    this.buildFilesPanel();
    this.buildSearchPanel();
    this.buildAiPanel();
    this.show(ctx.state.settings?.ui?.sidebarTab || 'files', true);
    this.ready = true;

    ctx.on('doc:parsed', () => this.refreshLive());
    ctx.on('doc:changed', () => this.refreshFilesDirty());
    ctx.on('project:changed', () => {
      this.expanded.clear();
      this.refreshAll(true);
    });
    ctx.on('settings:changed', () => { this.refreshAiStatus(); this.refreshAiContext(); });
    ctx.on('cursor', () => { if (this.panel === 'ai') this.refreshAiContext(); });
    ctx.on('project:changed', () => { this.aiContext.files.clear(); this.refreshAiContext(); });
  }

  show(id, silent = false) {
    if (!this.panels[id]) id = 'files';
    const changed = this.panel !== id;
    this.panel = id;
    for (const [key, node] of Object.entries(this.panels)) node.classList.toggle('active', key === id);
    this.syncActivityButtons();
    this.titleEl.textContent = PANEL_META[id].title;
    if (changed && !silent) ctx.api.settings.set('ui.sidebarTab', id);
    if (!silent) {
      const sidebar = $('#sidebar');
      if (sidebar.classList.contains('collapsed')) ctx.cmd('view.toggleSidebar');
    }
    this.refreshActions();
    this.refresh();
  }

  syncActivityButtons() {
    const visible = !$('#sidebar').classList.contains('collapsed');
    for (const btn of $$('.act-btn[data-panel]')) {
      const active = visible && btn.dataset.panel === this.panel;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  }

  refreshActions() {
    const a = this.actionsEl;
    a.innerHTML = '';
    const mk = (iconName, title, onClick) => {
      const b = el('button', { class: 'icon-btn sm', title, html: icon(iconName) });
      b.addEventListener('click', onClick);
      a.appendChild(b);
      return b;
    };
    switch (this.panel) {
      case 'files':
        mk('plus', '新建文件', () => this.newFile());
        mk('folder', '新建文件夹', () => this.newFolder());
        mk('refresh', '刷新文件树', () => this.refreshFiles());
        break;
      case 'outline':
        mk('refresh', '重新解析', () => ctx.editor?.doParse());
        break;
      case 'math':
        mk('refresh', '重新解析', () => ctx.editor?.doParse());
        break;
      case 'labels':
        mk('refresh', '重新解析', () => ctx.editor?.doParse());
        break;
      case 'history':
        mk('plus', '为当前文件创建快照', () => this.snapshotNow());
        mk('refresh', '刷新', () => this.refreshHistory());
        break;
      case 'git':
        mk('refresh', '刷新 Git 状态', () => this.refreshGit());
        break;
      case 'ai':
        mk('sliders', 'AI 设置', () => ctx.cmd('settings.open', 'ai'));
        break;
      case 'search':
        mk('refresh', '重新搜索', () => this.runSearch());
        break;
    }
  }

  refreshAll(force = false) {
    this.refresh(force);
  }

  async refresh(force = false) {
    if (!this.ready) return;
    switch (this.panel) {
      case 'files':
        await this.refreshFiles();
        break;
      case 'outline':
        this.renderOutline();
        break;
      case 'math':
        this.renderMathPanel();
        break;
      case 'labels':
        this.renderLabels();
        break;
      case 'search':
        this.renderSearch();
        break;
      case 'history':
        await this.refreshHistory();
        break;
      case 'git':
        await this.refreshGit();
        break;
      case 'ai':
        this.renderAi();
        break;
    }
  }

  refreshLive() {
    if (this.panel === 'outline') this.renderOutline();
    else if (this.panel === 'math') this.renderMathPanel();
    else if (this.panel === 'labels') this.renderLabels();
    this.refreshFilesDirty();
  }

  refreshFilesDirty() {
    for (const row of $$('.tree-row[data-type="file"]')) {
      const path = row.dataset.path;
      const dirty = ctx.state.docs.get(path)?.dirty;
      const nameEl = row.querySelector('.tree-name');
      let dot = row.querySelector('.tree-dirty');
      if (dirty && !dot) {
        dot = el('span', { class: 'tree-dirty' });
        nameEl?.after(dot);
      } else if (!dirty && dot) dot.remove();
    }
    this.renderTabsDirty?.();
  }

  /* ------------------------------------------------------------------ files */
  buildFilesPanel() {
    const p = this.panels.files;
    p.innerHTML = `
      <div class="panel-toolbar">
        <div class="search-input-wrap" style="flex:1">
          ${icon('search')}
          <input class="input input-sm" id="fileFilter" placeholder="筛选文件…" />
        </div>
      </div>
      <div class="tree" id="treeRoot"></div>
      <div class="tree-footer" id="treeFooter"></div>`;
    const filter = $('#fileFilter', p);
    filter.addEventListener(
      'input',
      debounce(() => {
        this.filter = filter.value.trim().toLowerCase();
        this.renderTree();
      }, 120)
    );
  }

  async refreshFiles() {
    if (!ctx.state.project.root) {
      this.panels.files.querySelector('#treeRoot').innerHTML = `<div class="empty-hint">尚未打开项目<br/><strong>点击下方按钮选择 LaTeX 项目文件夹</strong><div style="margin-top:12px"><button class="btn btn-sm btn-primary" data-open-project>${icon('folder')} 打开项目</button></div></div>`;
      this.panels.files.querySelector('[data-open-project]')?.addEventListener('click', () => ctx.cmd('project.open'));
      return;
    }
    const res = await ctx.api.project.tree();
    if (res && res.tree) {
      ctx.state.tree = res.tree;
      if (res.info?.rootFile) ctx.state.project.rootFile = res.info.rootFile;
    }
    this.renderTree();
  }

  renderTree() {
    const root = this.panels.files.querySelector('#treeRoot');
    if (!root) return;
    if (!ctx.state.project.root) return;
    const nodes = ctx.state.tree || [];
    const html = [];
    const walk = (list, depth) => {
      for (const node of list) {
        if (this.filter) {
          const matchName = node.name.toLowerCase().includes(this.filter);
          const childMatch = node.children?.some((c) => this.deepMatch(c));
          if (!matchName && !childMatch) continue;
        }
        const isDir = node.type === 'dir';
        const expanded = this.expanded.has(node.path) || (this.filter && isDir);
        const active = !isDir && node.path === ctx.state.activePath;
        const isRoot = !isDir && node.path === ctx.state.project.rootFile;
        const dirty = ctx.state.docs.get(node.path)?.dirty;
        html.push(`<div class="tree-row ${active ? 'active' : ''}" data-path="${escapeHtml(node.path)}" data-type="${node.type}" draggable="${!isDir}" style="padding-left:${6 + depth * 13}px">
          ${isDir ? `<span class="twisty">${icon(expanded ? 'chevron-down' : 'chevron-right')}</span>` : '<span class="twisty"></span>'}
          <svg class="ico file-ico"><use href="#i-${isDir ? 'folder' : fileIcon(node.ext)}"/></svg>
          <span class="tree-name">${escapeHtml(node.name)}</span>
          ${isRoot ? '<span class="tree-tag">主文档</span>' : (!isDir && /\.(tex|ltx)$/i.test(node.name) ? '<span class="tree-tag sub">SUB</span>' : '')}
          ${dirty ? '<span class="tree-dirty"></span>' : ''}
          <span class="row-actions">
            <button class="icon-btn" data-row-menu title="更多操作">${icon('more')}</button>
          </span>
        </div>`);
        if (isDir && expanded && node.children?.length) walk(node.children, depth + 1);
      }
    };
    walk(nodes, 0);
    root.innerHTML = html.join('') || `<div class="empty-hint">没有匹配的文件</div>`;

    for (const row of $$('.tree-row', root)) {
      const path = row.dataset.path;
      const type = row.dataset.type;
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-row-menu]')) return;
        if (type === 'dir') {
          if (this.expanded.has(path)) this.expanded.delete(path);
          else this.expanded.add(path);
          this.renderTree();
        } else {
          ctx.cmd('doc.open', path);
        }
      });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.fileContextMenu(e, path, type);
      });
      const menuBtn = row.querySelector('[data-row-menu]');
      if (menuBtn) {
        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const rect = menuBtn.getBoundingClientRect();
          this.fileContextMenu({ clientX: rect.left, clientY: rect.bottom, preventDefault() {} }, path, type);
        });
      }
      if (type === 'file') {
        row.addEventListener('dragstart', (e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', path);
          row.classList.add('dragging');
        });
        row.addEventListener('dragend', () => row.classList.remove('dragging'));
      } else {
        row.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          row.classList.add('drop-target');
        });
        row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
        row.addEventListener('drop', async (e) => {
          e.preventDefault();
          row.classList.remove('drop-target');
          const src = e.dataTransfer.getData('text/plain');
          if (!src) return;
          const parent = src.replace(/[\\/][^\\/]+$/, '');
          if (parent === path) return;
          const res = await ctx.api.fs.moveInto(src, path);
          if (res.ok) {
            toast({ type: 'success', title: '已移动文件', body: baseName(src) });
            if (ctx.state.activePath === src) ctx.cmd('doc.open', res.path);
            this.expanded.add(path);
            this.refreshFiles();
            ctx.emit('project:refresh');
          } else toast({ type: 'error', title: '移动失败', body: res.error });
        });
      }
    }
    const footer = this.panels.files.querySelector('#treeFooter');
    if (footer) {
      const rootName = ctx.state.project.name || '';
      footer.innerHTML = rootName
        ? `<span class="tf-name">${icon('folder')}<span>${escapeHtml(rootName)}</span></span><span class="tf-meta">${ctx.state.tree.length} 项</span>`
        : '';
    }
  }

  deepMatch(node) {
    if (node.name.toLowerCase().includes(this.filter)) return true;
    return node.children?.some((c) => this.deepMatch(c)) || false;
  }

  fileContextMenu(e, path, type) {
    const isRoot = path === ctx.state.project.rootFile;
    const items = [
      { label: '打开', icon: 'file', onClick: () => (type === 'dir' ? this.expanded.add(path) || this.renderTree() : ctx.cmd('doc.open', path)) },
      { separator: true }
    ];
    if (type === 'file') {
      items.push({ label: '设为主文档', icon: 'target', checked: isRoot, onClick: async () => {
        await ctx.api.project.setRootFile(path);
        ctx.state.project.rootFile = path;
        toast({ type: 'success', title: '主文档已切换', body: baseName(path) });
        this.renderTree();
        ctx.cmd('status.refresh');
      } });
      items.push({ label: '编译此文件', icon: 'play', onClick: () => ctx.cmd('build.run', { file: path }) });
      items.push({ label: '复制文件名', icon: 'copy', onClick: () => copyText(baseName(path)) });
    }
    if (type === 'dir') {
      items.push({ label: '在此新建文件', icon: 'plus', onClick: () => this.newFile(path) });
      items.push({ label: '在此新建文件夹', icon: 'folder', onClick: () => this.newFolder(path) });
    }
    items.push({ separator: true });
    items.push({ label: '重命名', icon: 'pencil', onClick: () => this.rename(path, type) });
    items.push({ label: '在资源管理器中显示', icon: 'external', onClick: () => ctx.api.showItemInFolder(path) });
    items.push({ separator: true });
    items.push({ label: '删除', icon: 'trash', danger: true, onClick: () => this.remove(path) });
    openMenu({ getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 0, height: 0 }), contains: () => false }, items, { align: 'left' });
  }

  async newFile(dir) {
    if (!ctx.state.project.root) return ctx.cmd('project.open');
    const parent = typeof dir === 'string' ? dir : ctx.state.project.root;
    const name = await ctx.dialogs.prompt({ title: '新建文件', label: '文件名（含扩展名）', value: 'untitled.tex', confirmText: '创建' });
    if (!name) return;
    const res = await ctx.api.fs.createFile(parent, name, this.defaultContentFor(name));
    if (res.ok) {
      this.expanded.add(parent);
      await this.refreshFiles();
      ctx.cmd('doc.open', res.path);
      toast({ type: 'success', title: '已创建', body: name });
    } else toast({ type: 'error', title: '创建失败', body: res.error });
  }

  defaultContentFor(name) {
    const ext = extOf(name);
    if (ext === 'tex') {
      const cls = ctx.state.settings?.files?.defaultDocClass || 'ctexart';
      return `\\documentclass[11pt]{${cls}}\n\\usepackage{amsmath,amssymb}\n\\usepackage{graphicx}\n\\usepackage{hyperref}\n\n\\begin{document}\n\n\\end{document}\n`;
    }
    if (ext === 'bib') return '@article{key2026,\n  title   = {Title},\n  author  = {Author, A.},\n  journal = {Journal},\n  year    = {2026}\n}\n';
    if (ext === 'md') return `# 新文档\n\n`;
    return '';
  }

  async newFolder(dir) {
    if (!ctx.state.project.root) return ctx.cmd('project.open');
    const parent = typeof dir === 'string' ? dir : ctx.state.project.root;
    const name = await ctx.dialogs.prompt({ title: '新建文件夹', label: '文件夹名称', value: 'figures', confirmText: '创建' });
    if (!name) return;
    const res = await ctx.api.fs.createDir(parent, name);
    if (res.ok) {
      this.expanded.add(parent);
      await this.refreshFiles();
      toast({ type: 'success', title: '已创建文件夹', body: name });
    } else toast({ type: 'error', title: '创建失败', body: res.error });
  }

  async rename(path, type) {
    const name = await ctx.dialogs.prompt({ title: '重命名', label: '新名称', value: baseName(path), confirmText: '重命名' });
    if (!name || name === baseName(path)) return;
    const res = await ctx.api.fs.rename(path, name);
    if (res.ok) {
      if (ctx.state.activePath === path) {
        const doc = ctx.state.docs.get(path);
        if (doc) {
          ctx.state.docs.delete(path);
          doc.path = res.path;
          doc.name = baseName(res.path);
          ctx.state.docs.set(res.path, doc);
          ctx.state.activePath = res.path;
        }
      }
      await this.refreshFiles();
      ctx.emit('tabs:refresh');
      toast({ type: 'success', title: '已重命名', body: name });
    } else toast({ type: 'error', title: '重命名失败', body: res.error });
  }

  async remove(path) {
    const res = await ctx.api.fs.delete(path);
    if (res.ok) {
      if (ctx.state.activePath === path) ctx.cmd('doc.close', path);
      await this.refreshFiles();
      toast({ type: 'success', title: '已删除', body: baseName(path) });
    }
  }

  async snapshotNow() {
    const path = ctx.state.activePath;
    if (!path) return;
    const doc = ctx.state.docs.get(path);
    if (!doc) return;
    const res = await ctx.api.history.snapshot(path, doc.model.getValue(), 'manual');
    toast(res.ok ? { type: 'success', title: '已创建本地快照' } : { type: 'warn', title: '内容未变化，未创建快照' });
    this.refreshHistory();
  }

  /* ---------------------------------------------------------------- outline */
  renderOutline() {
    const panel = this.panels.outline;
    const project = ctx.state.projectOutline || [];
    const parsed = ctx.state.parsed;
    if (!project.length && (!parsed || !parsed.outline.length)) {
      panel.innerHTML = `<div class="empty-hint">${icon('outline')}<br/>项目中暂无章节结构<br/><span class="muted">支持 part / chapter / section / subsection</span></div>`;
      return;
    }
    const activeFile = ctx.state.activePath;
    const activeLine = ctx.editor?.lastCursor?.line || 1;
    const groups = new Map();
    if (project.length) {
      for (const item of project) {
        if (!groups.has(item.rel)) groups.set(item.rel, { file: item.file, items: [] });
        groups.get(item.rel).items.push(item);
      }
    } else {
      groups.set(baseName(activeFile), { file: activeFile, items: parsed.outline });
    }
    let html = '<div class="outline-list project-outline">';
    for (const [rel, group] of groups) {
      const isActiveFile = group.file === activeFile;
      html += `<div class="outline-file ${isActiveFile ? 'active-file' : ''}">${icon('file')}<span>${escapeHtml(rel)}</span></div>`;
      for (const item of group.items) {
        const active = isActiveFile && item.line <= activeLine && item.line >= activeLine - 80;
        html += `<div class="outline-row lvl-${Math.min(4, item.level)} ${active ? 'active' : ''}" data-file="${escapeHtml(group.file)}" data-line="${item.line}">
          <span class="o-idx">${item.line}</span><span class="o-dot"></span><span class="o-title">${escapeHtml(item.title)}</span>
        </div>`;
      }
    }
    html += '</div>';
    panel.innerHTML = html;
    for (const row of $$('.outline-row', panel)) {
      row.addEventListener('click', () => ctx.cmd('editor.goto', { file: row.dataset.file, line: Number(row.dataset.line), flash: true }));
    }
  }

  /* ------------------------------------------------------------------- math */
  renderMathPanel() {
    const parsed = ctx.state.parsed;
    const panel = this.panels.math;
    if (!parsed) {
      panel.innerHTML = `<div class="empty-hint">打开一个 LaTeX 文件后自动检索数学环境</div>`;
      return;
    }
    const envs = parsed.environments.filter((e) => e.env && e.depth >= 0 && (isMathLike(e.env) || isTheoremLike(e.env)));
    if (!envs.length) {
      panel.innerHTML = `<div class="empty-hint">${icon('sigma')}<br/>未检索到数学环境<br/><span class="muted">支持 theorem / definition / equation / align 等</span></div>`;
      return;
    }
    const groups = { 定理类: [], 公式类: [] };
    for (const e of envs) (isTheoremLike(e.env) ? groups['定理类'] : groups['公式类']).push(e);
    const model = ctx.state.docs.get(ctx.state.activePath)?.model;
    const lines = model ? model.getLinesContent() : [];
    const renderGroup = (label, list) =>
      list.length
        ? `<div class="section-label">${label} · ${list.length}</div><div class="math-env-list">${list
            .map((e) => {
              const body = lines.slice(e.line, Math.min(lines.length, (e.endLine || e.line))).join(' ').replace(/\\begin\{[^}]+\}|\\end\{[^}]+\}/g, '').trim();
              const caption = e.caption || (isTheoremLike(e.env) ? '' : body.slice(0, 46));
              return `<div class="math-env" data-line="${e.line}" data-end="${e.endLine || e.line}">
                <div class="math-env-head">
                  <span class="math-env-kind">${escapeHtml(e.env)}</span>
                  <span class="badge">${e.endLine ? e.endLine - e.line + 1 : 1} 行</span>
                  <span class="math-env-line">L${e.line}</span>
                </div>
                ${caption ? `<div class="math-env-title">${escapeHtml(caption)}</div>` : ''}
                <div class="math-env-snippet">${escapeHtml(body.slice(0, 90) || '（空环境）')}</div>
              </div>`;
            })
            .join('')}</div>`
        : '';
    panel.innerHTML = renderGroup('定理类', groups['定理类']) + renderGroup('公式类', groups['公式类']);
    for (const card of $$('.math-env', panel)) {
      card.addEventListener('click', () => {
        ctx.cmd('editor.goto', { line: Number(card.dataset.line), flash: true });
      });
    }
  }

  /* ----------------------------------------------------------------- labels */
  renderLabels() {
    const parsed = ctx.state.parsed;
    const panel = this.panels.labels;
    if (!parsed) {
      panel.innerHTML = `<div class="empty-hint">打开文档后统计标签、引用与文献</div>`;
      return;
    }
    const labelNames = new Set(parsed.labels.map((l) => l.name));
    const refNames = new Set(parsed.refs.map((r) => r.name));
    const cited = new Set(parsed.cites.map((c) => c.key));
    const bibKeys = new Set((ctx.state.bibEntries || []).map((b) => b.key));
    const orphan = parsed.labels.filter((l) => !refNames.has(l.name));
    const broken = parsed.refs.filter((r) => !labelNames.has(r.name));
    const missingCites = Array.from(cited).filter((k) => bibKeys.size > 0 && !bibKeys.has(k));
    const unusedCites = Array.from(bibKeys).filter((k) => !cited.has(k));

    panel.innerHTML = `
      <div class="label-summary">
        <div class="label-stat"><div class="n">${parsed.labels.length}</div><div class="k">标签</div></div>
        <div class="label-stat"><div class="n">${parsed.refs.length}</div><div class="k">引用</div></div>
        <div class="label-stat"><div class="n">${parsed.cites.length}</div><div class="k">文献引用</div></div>
      </div>
      <div class="section-label">全部标签</div>
      <div class="label-group">${parsed.labels
        .map(
          (l) => `<div class="label-row" data-line="${l.line}" data-name="${escapeHtml(l.name)}">
          <span class="l-dot ${!refNames.has(l.name) ? 'orphan' : ''}"></span>
          <span class="l-name">${escapeHtml(l.name)}</span>
          ${l.env ? `<span class="chip">${escapeHtml(l.env)}</span>` : ''}
          <span class="l-line">L${l.line}</span>
        </div>`
        )
        .join('') || '<div class="empty-hint">暂无标签</div>'}</div>
      ${
        broken.length
          ? `<div class="section-label">未定义的引用 · ${broken.length}</div><div class="label-group">${broken
              .map((r) => `<div class="label-row" data-line="${r.line}"><span class="l-dot broken"></span><span class="l-name">${escapeHtml(r.name)}</span><span class="chip">\\${escapeHtml(r.cmd)}</span><span class="l-line">L${r.line}</span></div>`)
              .join('')}</div>`
          : ''
      }
      ${
        orphan.length
          ? `<div class="section-label">孤立标签（未被引用） · ${orphan.length}</div><div class="label-group">${orphan
              .map((l) => `<div class="label-row" data-line="${l.line}"><span class="l-dot unused"></span><span class="l-name">${escapeHtml(l.name)}</span><span class="l-line">L${l.line}</span></div>`)
              .join('')}</div>`
          : ''
      }
      ${
        missingCites.length
          ? `<div class="section-label">文献库中缺失的引用 · ${missingCites.length}</div><div class="label-group">${missingCites
              .map((k) => `<div class="label-row" data-cite="${escapeHtml(k)}"><span class="l-dot broken"></span><span class="l-name">${escapeHtml(k)}</span></div>`)
              .join('')}</div>`
          : ''
      }
      ${
        unusedCites.length
          ? `<div class="section-label">未引用的文献条目 · ${unusedCites.length}</div><div class="label-group">${unusedCites
              .slice(0, 100)
              .map((k) => `<div class="label-row" data-cite="${escapeHtml(k)}"><span class="l-dot unused"></span><span class="l-name">${escapeHtml(k)}</span><span class="l-line">BibTeX</span></div>`)
              .join('')}</div>`
          : ''
      }`;
    for (const row of $$('.label-row', panel)) {
      row.addEventListener('click', () => {
        if (row.dataset.line) ctx.cmd('editor.goto', { line: Number(row.dataset.line), flash: true });
        else if (row.dataset.cite) ctx.cmd('insert.cite', row.dataset.cite);
      });
    }
  }

  /* ----------------------------------------------------------------- search */
  buildSearchPanel() {
    const p = this.panels.search;
    p.innerHTML = `
      <div class="search-form">
        <div class="search-input-wrap">
          ${icon('search')}
          <input class="input" id="searchQuery" placeholder="搜索项目中的文本…" spellcheck="false" />
        </div>
        <div class="search-opts">
          <button class="opt-toggle" data-opt="caseSensitive" title="区分大小写">Aa</button>
          <button class="opt-toggle" data-opt="wholeWord" title="整词匹配">W</button>
          <button class="opt-toggle" data-opt="regex" title="正则表达式">.*</button>
          <button class="opt-toggle" data-opt="include" title="包含的文件（逗号分隔，如 *.tex,*.bib）">*.tex</button>
          <span class="search-scope">整个项目</span>
        </div>
        <div class="search-replace-row">
          <input class="input input-sm" id="searchReplace" placeholder="替换为…" spellcheck="false" />
          <button class="btn btn-sm" id="searchReplaceBtn">全部替换</button>
        </div>
        <div class="search-include hidden">
          <input class="input input-sm" id="searchInclude" placeholder="*.tex, sections/**" />
        </div>
      </div>
      <div class="search-results" id="searchResults">
        <div class="empty-hint">输入关键词后按 Enter 搜索<br/><span class="muted">支持正则、跨文件、整词匹配</span></div>
      </div>`;
    const input = $('#searchQuery', p);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.runSearch();
    });
    input.addEventListener('input', debounce(() => {
      if (input.value.length >= 2) this.runSearch();
    }, 420));
    for (const btn of $$('.opt-toggle', p)) {
      btn.addEventListener('click', () => {
        const opt = btn.dataset.opt;
        if (opt === 'include') {
          const wrap = p.querySelector('.search-include');
          wrap.classList.toggle('hidden');
          btn.classList.toggle('on', !wrap.classList.contains('hidden'));
          if (!wrap.classList.contains('hidden')) p.querySelector('#searchInclude').focus();
          return;
        }
        this.searchState[opt] = !this.searchState[opt];
        btn.classList.toggle('on', this.searchState[opt]);
        this.runSearch();
      });
    }
    p.querySelector('#searchInclude').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.searchState.include = e.target.value.trim();
        this.runSearch();
      }
    });
    p.querySelector('#searchReplaceBtn').addEventListener('click', () => this.runReplaceAll());
  }

  async runReplaceAll() {
    const panel = this.panels.search;
    const query = panel.querySelector('#searchQuery').value;
    const replacement = panel.querySelector('#searchReplace').value;
    if (!query) return toast({ type: 'warn', title: '请先填写查找内容' });
    if (!ctx.state.project.root) return toast({ type: 'warn', title: '请先打开项目' });
    if (!window.confirm('将在整个项目中把 “' + query + '” 替换为 “' + replacement + '”，是否继续？')) return;
    const res = await ctx.api.search.replace({
      query,
      replacement,
      regex: this.searchState.regex,
      caseSensitive: this.searchState.caseSensitive,
      wholeWord: this.searchState.wholeWord,
      include: this.searchState.include
    });
    if (!res.ok) return toast({ type: 'error', title: '替换失败', body: res.error || '' });
    await ctx.app.reloadOpenDocuments();
    toast({ type: 'success', title: '替换完成', body: `${res.replacements} 处 · ${res.files} 个文件` });
    this.runSearch();
  }

  async runSearch() {
    const q = this.panels.search.querySelector('#searchQuery').value;
    this.searchState.query = q;
    if (!q) return;
    if (!ctx.state.project.root) {
      toast({ type: 'warn', title: '请先打开项目' });
      return;
    }
    this.searchState.busy = true;
    this.renderSearch();
    const res = await ctx.api.search.project({
      query: q,
      regex: this.searchState.regex,
      caseSensitive: this.searchState.caseSensitive,
      wholeWord: this.searchState.wholeWord,
      include: this.searchState.include
    });
    this.searchState.busy = false;
    this.searchState.results = res;
    this.renderSearch();
  }

  renderSearch() {
    const panel = this.panels.search;
    if (!panel) return;
    const box = panel.querySelector('#searchResults');
    if (!box) return;
    const st = this.searchState;
    if (st.busy) {
      box.innerHTML = `<div class="empty-hint">${icon('loader')} 搜索中…</div>`;
      return;
    }
    if (!st.results) return;
    if (!st.results.ok) {
      box.innerHTML = `<div class="empty-hint danger-text">${escapeHtml(st.results.error || '搜索失败')}</div>`;
      return;
    }
    const matches = st.results.matches || [];
    if (!matches.length) {
      box.innerHTML = `<div class="empty-hint">未找到 “<strong>${escapeHtml(st.query)}</strong>”</div>`;
      return;
    }
    const byFile = new Map();
    for (const m of matches) {
      if (!byFile.has(m.rel)) byFile.set(m.rel, []);
      byFile.get(m.rel).push(m);
    }
    const q = st.query;
    const highlight = (text) => {
      try {
        const re = st.regex ? new RegExp(q, st.caseSensitive ? 'g' : 'gi') : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), st.caseSensitive ? 'g' : 'gi');
        return escapeHtml(text).replace(re, (m) => `<mark>${escapeHtml(m)}</mark>`);
      } catch {
        return escapeHtml(text);
      }
    };
    let html = `<div class="section-label">${matches.length} 个匹配 · ${byFile.size} 个文件</div>`;
    for (const [file, hits] of byFile) {
      html += `<div class="search-file"><div class="search-file-head" data-file="${escapeHtml(file)}">${icon(fileIcon(extOf(file)))}<span>${escapeHtml(file)}</span><span class="badge s-count">${hits.length}</span></div>`;
      for (const hit of hits.slice(0, 40)) {
        html += `<div class="search-hit" data-file="${escapeHtml(hit.file)}" data-line="${hit.line}" data-col="${hit.col}">
          <span class="s-line">${hit.line}</span>
          <span class="s-text">${highlight(hit.text.trim().slice(0, 160))}</span>
        </div>`;
      }
      html += '</div>';
    }
    if (st.results.truncated) html += `<div class="empty-hint">结果过多，仅显示前 ${matches.length} 条</div>`;
    box.innerHTML = html;
    for (const hit of $$('.search-hit', box)) {
      hit.addEventListener('click', () => {
        ctx.cmd('editor.goto', { file: hit.dataset.file, line: Number(hit.dataset.line), column: Number(hit.dataset.col), flash: true });
      });
    }
    for (const head of $$('.search-file-head', box)) {
      head.addEventListener('click', () => ctx.cmd('doc.open', head.dataset.file));
    }
  }

  /* ---------------------------------------------------------------- history */
  async refreshHistory() {
    const panel = this.panels.history;
    if (!ctx.state.project.root) {
      panel.innerHTML = `<div class="empty-hint">打开项目后开始记录本地快照</div>`;
      return;
    }
    const res = await ctx.api.history.list();
    this.historyItems = res.items || [];
    if (!this.historyItems.length) {
      panel.innerHTML = `<div class="empty-hint">${icon('history')}<br/>暂无快照<br/><span class="muted">保存或编译成功后会自动记录</span></div>`;
      return;
    }
    const groups = new Map();
    for (const item of this.historyItems) {
      const d = new Date(item.at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const reasonLabel = { build: '编译通过快照', save: '保存快照', manual: '手动快照', 'before-restore': '恢复前快照' };
    let html = '<div class="history-list">';
    for (const [day, items] of groups) {
      const today = new Date().toISOString().slice(0, 10) === day;
      html += `<div class="history-day">${today ? '今天' : day}</div>`;
      for (const item of items) {
        html += `<div class="history-row" data-id="${item.id}">
          <span class="h-time">${timeOfDay(item.at)}</span>
          <span class="h-reason">${escapeHtml(reasonLabel[item.reason] || item.reason)}</span>
          <span class="h-file">${escapeHtml(item.file)}</span>
          <span class="row-actions">
            <button class="icon-btn" data-act="diff" title="对比差异">${icon('code')}</button>
            <button class="icon-btn" data-act="restore" title="恢复此快照">${icon('history')}</button>
          </span>
        </div>`;
      }
    }
    html += '</div>';
    panel.innerHTML = html;
    for (const row of $$('.history-row', panel)) {
      const item = this.historyItems.find((i) => i.id === row.dataset.id);
      row.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'diff') this.diffSnapshot(item);
        else if (act === 'restore') this.restoreSnapshot(item);
        else this.diffSnapshot(item);
      });
    }
  }

  async diffSnapshot(item) {
    const snap = await ctx.api.history.read(item.id);
    if (!snap.ok) return toast({ type: 'error', title: '读取快照失败', body: snap.error });
    const full = `${ctx.state.project.root}\\${item.file.split('/').join('\\')}`;
    const cur = await ctx.api.fs.read(full);
    ctx.dialogs.showDiff({
      title: `快照对比 · ${item.file}`,
      subtitle: `${timeAgo(item.at)} · ${item.reason}`,
      left: snap.content,
      right: cur.ok ? cur.text : '',
      leftLabel: '历史快照',
      rightLabel: '当前内容',
      onRestore: () => this.restoreSnapshot(item)
    });
  }

  async restoreSnapshot(item) {
    const res = await ctx.api.history.restore(item.id);
    if (!res.ok) return toast({ type: 'error', title: '恢复失败', body: res.error });
    toast({ type: 'success', title: '已恢复到历史快照', body: item.file });
    ctx.cmd('doc.reload', res.file);
    this.refreshHistory();
  }

  /* -------------------------------------------------------------------- git */
  async refreshGit() {
    const panel = this.panels.git;
    if (!ctx.state.project.root) {
      panel.innerHTML = `<div class="empty-hint">打开项目后使用 Git 版本控制</div>`;
      return;
    }
    panel.innerHTML = `<div class="empty-hint">${icon('loader')} 读取 Git 状态…</div>`;
    const st = await ctx.api.git.status();
    ctx.state.gitStatus = st;
    this.renderGitStatus(st);
  }

  renderGitStatus(st) {
    const panel = this.panels.git;
    if (!st || st.available === false) {
      panel.innerHTML = `<div class="empty-hint">${icon('git')}<br/><strong>未检测到 Git</strong><br/><span class="muted">安装 Git for Windows 后重启 TeXora 即可使用版本控制面板</span><div style="margin-top:12px"><button class="btn btn-sm" data-ext="https://git-scm.com/download/win">下载 Git for Windows</button></div></div>`;
      panel.querySelector('[data-ext]')?.addEventListener('click', (e) => ctx.api.openExternal(e.target.dataset.ext));
      return;
    }
    if (st.repo === false) {
      panel.innerHTML = `<div class="empty-hint">${icon('git')}<br/>当前项目还不是 Git 仓库<br/><div style="margin-top:12px"><button class="btn btn-sm btn-primary" data-init>${icon('git')} 初始化仓库</button></div></div>`;
      panel.querySelector('[data-init]')?.addEventListener('click', async () => {
        const res = await ctx.api.git.init();
        toast(res.ok ? { type: 'success', title: 'Git 仓库已初始化' } : { type: 'error', title: '初始化失败', body: res.error });
        this.refreshGit();
      });
      return;
    }
    const files = st.files || [];
    const flagClass = (f) => (f.untracked ? 'u' : f.x === 'D' || f.y === 'D' ? 'd' : f.x === 'A' ? 'a' : 'm');
    const flagText = (f) => (f.untracked ? 'U' : (f.x !== ' ' ? f.x : '') + (f.y !== ' ' ? f.y : '') || 'M');
    panel.innerHTML = `
      <div class="git-panel">
        <div class="git-branch-bar">${icon('branch')}<span>${escapeHtml(st.branch || 'detached')}</span><span class="spacer"></span>
          <button class="icon-btn sm" data-git="pull" title="Pull">${icon('download')}</button>
          <button class="icon-btn sm" data-git="push" title="Push">${icon('upload')}</button>
        </div>
        <div class="section-label" style="padding:0">更改 · ${files.length}</div>
        <div class="git-changes">${
          files.length
            ? files
                .map(
                  (f) => `<div class="git-change" data-file="${escapeHtml(f.file)}" data-staged="${f.staged}">
              <span class="g-flag ${flagClass(f)}">${escapeHtml(flagText(f))}</span>
              <span class="g-path">${escapeHtml(f.file)}</span>
            </div>`
                )
                .join('')
            : '<div class="empty-hint">工作区干净</div>'
        }</div>
        <div class="git-commit-box">
          <textarea class="input" id="gitMessage" placeholder="提交说明…"></textarea>
          <div class="row">
            <button class="btn btn-sm btn-primary" id="gitCommit">${icon('check')} 提交全部</button>
            <button class="btn btn-sm" id="gitStageAl1">暂存全部</button>
          </div>
        </div>
        <div class="section-label" style="padding:0">最近提交</div>
        <div class="git-log" id="gitLog"><div class="empty-hint">加载中…</div></div>
      </div>`;
    panel.querySelector('[data-git="pull"]')?.addEventListener('click', () => this.gitAction('pull'));
    panel.querySelector('[data-git="push"]')?.addEventListener('click', () => this.gitAction('push'));
    panel.querySelector('#gitCommit')?.addEventListener('click', async () => {
      const msg = panel.querySelector('#gitMessage').value.trim();
      if (!msg) return toast({ type: 'warn', title: '请填写提交说明' });
      const res = await ctx.api.git.commit(msg, true);
      toast(res.ok ? { type: 'success', title: '提交成功', body: (res.output || '').split('\n')[0] } : { type: 'error', title: '提交失败', body: res.error });
      this.refreshGit();
    });
    panel.querySelector('#gitStageAl1')?.addEventListener('click', async () => {
      const res = await ctx.api.git.stage();
      toast(res.ok ? { type: 'success', title: '已暂存全部更改' } : { type: 'error', title: '暂存失败', body: res.error });
      this.refreshGit();
    });
    for (const row of $$('.git-change', panel)) {
      row.addEventListener('click', async () => {
        const diff = await ctx.api.git.diff(row.dataset.file, false);
        ctx.dialogs.showText({ title: `差异 · ${row.dataset.file}`, text: diff.diff || '（无差异）', mono: true });
      });
    }
    ctx.api.git.log(12).then((res) => {
      const log = panel.querySelector('#gitLog');
      if (!log) return;
      if (!res.ok || !res.commits?.length) {
        log.innerHTML = '<div class="empty-hint">暂无提交</div>';
        return;
      }
      log.innerHTML = res.commits
        .map(
          (c) => `<div class="git-log-row" data-hash="${escapeHtml(c.hash)}">
        <span class="g-hash">${escapeHtml(c.hash)}</span>
        <span class="g-subject">${escapeHtml(c.subject)}</span>
        <span class="g-date">${escapeHtml(c.date || '')}</span>
      </div>`
        )
        .join('');
    });
  }

  async gitAction(kind) {
    const res = kind === 'pull' ? await ctx.api.git.pull() : await ctx.api.git.push();
    toast(res.ok ? { type: 'success', title: `${kind === 'pull' ? 'Pull' : 'Push'} 成功`, body: (res.output || '').slice(0, 160) } : { type: 'error', title: `${kind} 失败`, body: res.error });
    this.refreshGit();
  }

  /* --------------------------------------------------------------------- AI */
  buildAiPanel() {
    const p = this.panels.ai;
    p.innerHTML = `
      <div class="ai-panel">
        <div class="ai-status" id="aiStatus"></div>
        <div class="ai-prompt">
          <div class="ai-context-row" id="aiContextControls">
            <button class="ai-context-btn" data-ctx="selection" type="button">${icon('target')}<span>选中内容</span><small></small></button>
            <button class="ai-context-btn" data-ctx="file" type="button">${icon('paper')}<span>当前文件</span><small></small></button>
            <button class="ai-context-btn" data-ctx="skills" type="button">${icon('layers')}<span>Skills</span><small></small></button>
            <button class="ai-context-btn" data-ctx="files" type="button">${icon('files')}<span>其他文件</span><small></small></button>
          </div>
          <div class="ai-context-hint" id="aiContextHint"></div>
          <textarea class="input" id="aiPrompt" placeholder="输入你的指令；上方所选上下文会放在指令前面…"></textarea>
          <div class="row">
            <button class="btn btn-sm btn-primary" id="aiSend" style="flex:1">${icon('send')} 发送</button>
            <button class="btn btn-sm hidden" id="aiCancel" title="取消当前请求">取消</button>
            <button class="btn btn-sm" id="aiOcr" title="从剪贴板图片识别公式">${icon('image')}</button>
          </div>
        </div>
        <div class="ai-thread" id="aiThread"></div>
      </div>`;
    p.querySelector('#aiSend').addEventListener('click', () => this.aiSend());
    p.querySelector('#aiPrompt').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') this.aiSend();
    });
    p.querySelector('#aiOcr').addEventListener('click', () => ctx.cmd('ai.ocr'));
    p.querySelector('#aiCancel').onclick = () => ctx.ai.cancel();
    for (const button of $$('[data-ctx]', p)) {
      button.addEventListener('click', () => {
        const type = button.dataset.ctx;
        if (type === 'skills' || type === 'files') this.openAiContextPicker(type, button).catch(err => toast({ type: 'warn', title: '上下文菜单无法打开', body: err.message }));
        else { this.aiContext[type] = !this.aiContext[type]; this.refreshAiContext(); }
      });
    }
    this.refreshAiContext();
    this.refreshAiStatus();
  }

  refreshAiStatus() {
    const elx = this.panels.ai?.querySelector('#aiStatus');
    if (!elx) return;
    const s = ctx.state.settings?.ai;
    if (!s) return;
    const configured = !!s.apiKey;
    const providerLabel = { deepseek: 'DeepSeek', openai: 'OpenAI', anthropic: 'Claude', gemini: 'Gemini', moonshot: 'Kimi', custom: '自定义' }[s.provider] || s.provider;
    elx.className = 'ai-status' + (configured ? '' : ' warn');
    elx.innerHTML = `${icon(configured ? 'sparkles' : 'alert')}<span>${configured ? `${escapeHtml(providerLabel)} · ${escapeHtml(s.model || '')}` : '尚未配置 API Key，点击右侧设置'}</span><span class="spacer"></span><button class="btn btn-tiny" data-ai-settings>配置</button>`;
    elx.querySelector('[data-ai-settings]')?.addEventListener('click', () => ctx.cmd('settings.open', 'ai'));
  }

  renderAi() {
    this.refreshAiStatus();
    this.renderAiThread();
  }

  renderAiThread() {
    const box = this.panels.ai?.querySelector('#aiThread');
    if (!box) return;
    if (!this.aiThread.length) {
      box.innerHTML = `<div class="empty-hint">选择本次上下文后发送。侧栏和 Block 共用设置中的读取上限；建议确认后才会修改文件。历史消息可点击打开。</div>`;
      return;
    }
    box.innerHTML = this.aiThread.map(m => `<div class="ai-msg ${m.role} ${m.error ? 'error' : ''} ${m.applied ? 'applied' : ''}" ${m.resultId ? `data-result-id="${escapeHtml(m.resultId)}" role="button" tabindex="0" aria-label="打开 AI 建议"` : ''}>
      <div class="ai-msg-head">${m.role === 'user' ? '你' : 'TeXora AI'}${m.time ? ` · ${escapeHtml(m.time)}` : ''}${m.applied ? '<span class="ai-applied-badge">已修改</span>' : ''}</div>
      <div class="ai-msg-body">${escapeHtml((m.text || '').slice(0, 420))}${(m.text || '').length > 420 ? '…' : ''}</div>
      ${m.resultId ? `<div class="ai-msg-actions"><button class="btn btn-tiny">${m.applied ? '查看已修改内容' : '打开 Diff 建议'}</button></div>` : ''}</div>`).join('');
    for (const message of $$('[data-result-id]', box)) {
      message.onclick = () => ctx.ai.resultAction({ id: message.dataset.resultId });
      message.onkeydown = e => { if (e.target === message && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); message.click(); } };
    }
    box.scrollTop = box.scrollHeight;
  }

  async aiSend() {
    if (ctx.state.aiBusy) return;
    const input = this.panels.ai.querySelector('#aiPrompt');
    const prompt = input.value.trim();
    if (!prompt) return;
    const result = await ctx.ai.freeform({ prompt, attachments: this.aiAttachments() });
    if (result && input.value.trim() === prompt) input.value = '';
  }

  aiAttachments() {
    const policy = contextPolicy(ctx.state.settings.ai);
    return { selection: this.aiContext.selection, file: policy.file && this.aiContext.file,
      skillIds: this.aiContext.skillIds == null ? null : [...this.aiContext.skillIds],
      files: policy.otherFiles ? [...this.aiContext.files] : [] };
  }

  refreshAiContext() {
    const panel = this.panels.ai;
    if (!panel?.querySelector('#aiContextHint')) return;
    const policy = contextPolicy(ctx.state.settings.ai);
    const selected = ctx.editor?.getSelectionText?.() || '';
    const defaults = (ctx.state.settings.ai.skills || []).filter(s => s.enabled && s.scope !== 'polish').map(s => s.id);
    const skillIds = this.aiContext.skillIds == null ? defaults : [...this.aiContext.skillIds];
    for (const button of $$('[data-ctx]', panel)) {
      const type = button.dataset.ctx;
      button.disabled = type === 'file' ? !policy.file : type === 'files' ? !policy.otherFiles : false;
      const enabled = type === 'selection' ? this.aiContext.selection : type === 'file' ? policy.file && this.aiContext.file : type === 'skills' ? skillIds.length > 0 : policy.otherFiles && this.aiContext.files.size > 0;
      button.classList.toggle('active', enabled);
      button.setAttribute('aria-pressed', String(enabled));
      button.querySelector('small').textContent = type === 'selection' ? selected ? `${selected.length} 字` : '无选区' : type === 'file' ? policy.file ? '' : '范围限制' : type === 'skills' ? `${skillIds.length} 项` : policy.otherFiles ? `${this.aiContext.files.size} 项` : '范围限制';
      button.title = type === 'selection' ? '发送时附带当前编辑器中的选区；可取消' : type === 'file' ? policy.file ? '附带当前文件作为参考；可取消' : '当前设置仅允许选中内容或 Block' : type === 'skills' ? '多选本次调用的 Skills，未选的规则不会注入' : policy.otherFiles ? '多选其他项目文件（最多 8 个）' : '需在 AI 设置中选择项目范围，并允许跨文件读取';
    }
    const scopes = { selection: '选中内容 / Block', file: '当前文件', 'file-with-preamble': '当前文件 + 导言区', project: '项目内所选文件' };
    panel.querySelector('#aiContextHint').textContent = `读取上限：${scopes[policy.scope] || scopes['file-with-preamble']}。上下文先于手写指令；不会自动附带整个项目。`;
    panel.querySelector('#aiSend').disabled = !!ctx.state.aiBusy;
    panel.querySelector('#aiSend').innerHTML = ctx.state.aiBusy ? `${icon('loader', 'spin')}正在生成…` : `${icon('send')}发送`;
    panel.querySelector('#aiCancel').classList.toggle('hidden', !ctx.state.aiBusy);
    panel.querySelector('#aiOcr').disabled = !!ctx.state.aiBusy;
  }

  async openAiContextPicker(type, anchor) {
    let choices, selected;
    if (type === 'skills') {
      const result = await ctx.api.ai.skills();
      if (!result.ok) throw new Error(result.error || 'Skills 读取失败');
      choices = (result.skills || []).map(s => ({ id: s.id, name: s.name, disabled: !s.exists }));
      if (this.aiContext.skillIds == null) this.aiContext.skillIds = new Set((ctx.state.settings.ai.skills || []).filter(s => s.enabled && s.scope !== 'polish').map(s => s.id));
      selected = this.aiContext.skillIds;
    } else {
      if (!contextPolicy(ctx.state.settings.ai).otherFiles) return;
      choices = (ctx.state.assets.all || []).filter(p => /\.(tex|ltx|sty|cls|bib|md|txt)$/i.test(p) && (!ctx.state.activePath || (ctx.state.project.root + '/' + p).replace(/\\/g, '/').toLowerCase() !== ctx.state.activePath.replace(/\\/g, '/').toLowerCase())).map(p => ({ id: p, name: p }));
      selected = this.aiContext.files;
    }
    const container = el('div', { class: 'ai-context-picker' });
    container.innerHTML = `<div class="ai-picker-title">${type === 'skills' ? '本次调用的 Skills' : '附加其他项目文件'}</div><input class="input input-sm" placeholder="筛选…" aria-label="筛选上下文"/><div class="ai-picker-options"></div><div class="row"><button class="btn btn-tiny" data-clear>全部取消</button><span class="spacer"></span><button class="btn btn-tiny" data-done>完成</button></div>`;
    const options = container.querySelector('.ai-picker-options');
    const render = query => {
      options.innerHTML = '';
      const visible = choices.filter(c => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 300);
      if (!visible.length) options.innerHTML = `<div class="field-hint">${choices.length ? '没有匹配项' : type === 'skills' ? '尚未导入 Skills，可在 AI 设置中添加。' : '当前项目没有其他文本文件。'}</div>`;
      for (const choice of visible) {
        const label = el('label', { class: 'ai-picker-option' });
        label.innerHTML = `<input type="checkbox" ${selected.has(choice.id) ? 'checked' : ''} ${choice.disabled ? 'disabled' : ''}/><span>${escapeHtml(choice.name)}${choice.disabled ? '（文件不存在）' : ''}</span>`;
        label.querySelector('input').onchange = e => {
          if (e.target.checked && type === 'files' && selected.size >= 8) { e.target.checked = false; return toast({ type: 'info', title: '最多附加 8 个文件' }); }
          if (e.target.checked) selected.add(choice.id); else selected.delete(choice.id);
          this.refreshAiContext();
        };
        options.appendChild(label);
      }
    };
    container.querySelector('input').oninput = e => render(e.target.value);
    container.querySelector('[data-clear]').onclick = () => { selected.clear(); render(container.querySelector('input').value); this.refreshAiContext(); };
    container.querySelector('[data-done]').onclick = closeMenu;
    render('');
    openPopover(anchor, container);
    container.querySelector('input').focus();
  }

  pushAiThread(message) {
    this.aiThread.push(message);
    if (this.aiThread.length > 40) this.aiThread.splice(0, this.aiThread.length - 40);
    this.renderAiThread();
  }
}

function isTheoremLike(env) {
  return ['theorem', 'lemma', 'proposition', 'corollary', 'definition', 'proof', 'remark', 'example', 'assumption', 'axiom', 'conjecture', 'claim', 'exercise', 'problem', 'solution', 'note'].includes(env);
}
function isMathLike(env) {
  return ['equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'multline', 'multline*', 'eqnarray', 'displaymath', 'math'].includes(env);
}
