/**
 * Modal framework and all task dialogs: templates, wizards, table builder,
 * image insertion, citation picker, symbol palette, font picker, bib manager,
 * diff viewer, shortcuts and about.
 */
import appIcon from '../assets/icon.png';
import { ctx } from './ctx.js';
import { PROJECT_HOME, openExternalLink } from './external-links.js';
import { openCodeDialog } from './code-dialog.js';
import { monaco } from './editor.js';
import {
  $, $$, el, icon, escapeHtml, openMenu, toast, copyText, baseName, extOf, formatBytes, timeAgo, debounce
} from './util.js';
import { SYMBOL_GROUPS, toSnippet } from './symbols.js';
import { TEMPLATES, buildWizardDocument, NEW_PROJECT_DEFAULTS } from './templates.js';
import { parseBib, entryToBibtex, emptyEntry, suggestKey, formatAuthors } from './bib.js';
import { renderMarkdown, mdToLatex } from './markdown.js';
import { ENVIRONMENTS, wrapCommandFor } from './latex.js';

let activeModal = null;
let modalEscape = null;

function closeModal() {
  if (modalEscape) document.removeEventListener('keydown', modalEscape);
  modalEscape = null;
  const previous = activeModal;
  activeModal = null;
  previous?.onClose?.();
  const layer = $('#modalLayer');
  if (!layer) return;
  if (previous?.returnFocus?.isConnected) previous.returnFocus.focus();
  layer.innerHTML = '';
  layer.classList.remove('open');
  activeModal = null;
}

function modal({ title = '', subtitle = '', iconName = '', width = 560, height = '', body = '', foot = '', className = '', onMount, onClose, dismissable = true }) {
  const layer = $('#modalLayer');
  if (!layer) return null;
  closeModal();
  const returnFocus = document.activeElement;
  layer.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal ${className}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}" tabindex="-1" style="width:min(${width}px, 94vw);${height ? `height:${typeof height === 'number' ? height + 'px' : height};` : ''}">
      <div class="modal-head">
        <div>
          <div class="modal-title">${iconName ? icon(iconName) + ' ' : ''}${escapeHtml(title)}</div>
          ${subtitle ? `<div class="modal-sub">${escapeHtml(subtitle)}</div>` : ''}
        </div>
        ${dismissable ? `<button class="icon-btn modal-close" title="关闭">${icon('close')}</button>` : ''}
      </div>
      <div class="modal-body">${body}</div>
      ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
    </div>`;
  layer.classList.add('open');
  const root = layer.querySelector('.modal');
  const close = () => {
    if (activeModal?.root !== root) return;
    closeModal();
  };
  root.querySelector('.modal-close')?.addEventListener('click', close);
  if (dismissable) {
    layer.querySelector('.modal-backdrop')?.addEventListener('click', close);
  }
  activeModal = { root, close, onClose, returnFocus };
  modalEscape = e => {
    if (e.key === 'Tab' && activeModal?.root === root) {
      const items = [...root.querySelectorAll('button, input, textarea, select, a[href], [tabindex]')].filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (!first) { e.preventDefault(); root.focus(); }
      else if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    }
    if (dismissable && e.key === 'Escape' && activeModal?.root === root) {
      e.preventDefault();
      close();
    }
  };
  document.addEventListener('keydown', modalEscape);
  onMount?.({ root, close });
  // focus first input
  setTimeout(() => { if (activeModal?.root === root) (root.querySelector('.modal-body input, .modal-body textarea, .modal-foot button') || root).focus(); }, 30);
  return { root, close, layer };
}

function dialogButton(label, kind = '') {
  return `<button class="btn ${kind}" data-dialog-btn>${label}</button>`;
}

export function createDialogs() {
  /* ------------------------------------------------------------- primitives */
  function prompt({ title = '输入', label = '', value = '', confirmText = '确定', placeholder = '', multiline = false, hint = '' }) {
    return new Promise((resolve) => {
      const body = `
        <div class="field">
          ${label ? `<label>${escapeHtml(label)}</label>` : ''}
          ${multiline
            ? `<textarea class="input" id="dlgInput" rows="5" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>`
            : `<input class="input" id="dlgInput" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" spellcheck="false" />`}
          ${hint ? `<div class="field-hint">${escapeHtml(hint)}</div>` : ''}
        </div>`;
      let settled = false;
      const m = modal({
        title,
        width: 440,
        body,
        foot: `${dialogButton('取消')}<span class="spacer"></span><button class="btn btn-primary" id="dlgOk">${escapeHtml(confirmText)}</button>`,
        onMount: ({ root, close }) => {
          const input = root.querySelector('#dlgInput');
          const finish = (val) => {
            settled = true;
            resolve(val);
            close();
          };
          root.querySelector('#dlgOk').addEventListener('click', () => finish(input.value.trim() || null));
          root.querySelector('[data-dialog-btn]').addEventListener('click', () => finish(null));
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (!multiline || e.ctrlKey)) {
              e.preventDefault();
              finish(input.value.trim() || null);
            }
          });
          if (!multiline) {
            input.select();
          }
        },
        onClose: () => {
          if (!settled) resolve(null);
        }
      });
      return m;
    });
  }

  function confirm({ title = '确认', message = '', detail = '', confirmText = '确定', cancelText = '取消', danger = false }) {
    return new Promise((resolve) => {
      let settled = false;
      const m = modal({
        title,
        width: 440,
        body: `<div class="field"><div style="font-size:13px;line-height:1.7">${escapeHtml(message)}</div>${detail ? `<div class="field-hint">${escapeHtml(detail)}</div>` : ''}</div>`,
        foot: `${dialogButton(escapeHtml(cancelText))}<span class="spacer"></span><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="dlgOk">${escapeHtml(confirmText)}</button>`,
        onMount: ({ root, close }) => {
          root.querySelector('#dlgOk').addEventListener('click', () => {
            settled = true;
            resolve(true);
            close();
          });
          root.querySelector('[data-dialog-btn]').addEventListener('click', () => {
            settled = true;
            resolve(false);
            close();
          });
        },
        onClose: () => {
          if (!settled) resolve(false);
        }
      });
      return m;
    });
  }

  function showText({ title = '内容', subtitle = '', text = '', mono = true }) {
    const m = modal({
      title,
      subtitle,
      width: 780,
      body: `<pre class="code-block">${escapeHtml(text || '')}</pre>`,
      foot: `${dialogButton('关闭')}<span class="spacer"></span><button class="btn btn-sm" id="copyText">${icon('copy')}复制</button>`,
      onMount: ({ root, close }) => {
        root.querySelector('[data-dialog-btn]').addEventListener('click', close);
        root.querySelector('#copyText').addEventListener('click', async () => {
          await copyText(text);
          toast({ type: 'success', title: '已复制到剪贴板' });
        });
      }
    });
    return m;
  }

  function showDiff({ title = '差异对比', subtitle = '', left = '', right = '', leftLabel = '修改前', rightLabel = '修改后', onRestore, extraFoot = '' }) {
    let diffEditor = null;
    const m = modal({
      title,
      subtitle,
      width: 1040,
      height: 'min(78vh, 760px)',
      className: 'diff-modal',
      body: `<div class="diff-editor-host" style="height:100%;min-height:420px"></div>`,
      foot: `${dialogButton('关闭')}${extraFoot}<span class="spacer"></span>${onRestore ? `<button class="btn btn-sm" id="dlgRestore">${icon('history')}恢复此版本</button>` : ''}<button class="btn btn-sm btn-primary" id="dlgCopyRight">${icon('copy')}复制${escapeHtml(rightLabel)}</button>`,
      onMount: ({ root, close }) => {
        const host = root.querySelector('.diff-editor-host');
        const leftModel = monaco.editor.createModel(left, 'latex');
        const rightModel = monaco.editor.createModel(right, 'latex');
        diffEditor = monaco.editor.createDiffEditor(host, {
          theme: ctx.state.theme === 'light' ? 'texora-light' : 'texora-dark',
          readOnly: true,
          renderSideBySide: true,
          automaticLayout: true,
          fontSize: 12.5,
          lineHeight: 20,
          wordWrap: 'on',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          renderOverviewRuler: false,
          ignoreTrimWhitespace: false
        });
        diffEditor.setModel({ original: leftModel, modified: rightModel });
        const toggle = document.createElement('button');
        toggle.className = 'btn btn-sm'; toggle.textContent = '关闭 Diff 高亮'; toggle.setAttribute('aria-pressed', 'true');
        root.querySelector('.modal-foot').prepend(toggle);
        toggle.addEventListener('click', () => {
          const off = root.classList.toggle('diff-highlights-off');
          diffEditor.updateOptions({ renderIndicators: !off, renderMarginRevertIcon: false });
          toggle.textContent = off ? '开启 Diff 高亮' : '关闭 Diff 高亮';
          toggle.setAttribute('aria-pressed', String(!off));
        });
        const head = root.querySelector('.modal-head');
        head.insertAdjacentHTML('beforeend', `<div class="diff-labels"><span class="chip">${escapeHtml(leftLabel)}</span><span class="chip accent">${escapeHtml(rightLabel)}</span></div>`);
        root.querySelector('[data-dialog-btn]').addEventListener('click', close);
        root.querySelector('#dlgCopyRight').addEventListener('click', async () => {
          await copyText(right);
          toast({ type: 'success', title: '已复制' });
        });
        root.querySelector('#dlgRestore')?.addEventListener('click', async () => {
          await onRestore();
          close();
        });
        setTimeout(() => diffEditor?.layout(), 60);
      },
      onClose: () => {
        try {
          diffEditor?.getModel()?.original?.dispose();
          diffEditor?.getModel()?.modified?.dispose();
          diffEditor?.dispose();
        } catch {}
      }
    });
    return m;
  }

  /* -------------------------------------------------------------- templates */
  function openTemplates() {
    let selected = TEMPLATES[0];
    const body = `
      <div class="template-layout">
        <div class="template-grid" id="tplGrid">
          ${TEMPLATES.map(
            (t) => `<button class="template-card" data-id="${t.id}">
              <div class="t-name">${icon('paper')}${escapeHtml(t.name)}</div>
              <div class="t-desc">${escapeHtml(t.desc)}</div>
              <div class="t-meta">${t.tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join('')}</div>
            </button>`
          ).join('')}
        </div>
        <div class="template-detail" id="tplDetail"></div>
      </div>`;
    const m = modal({
      title: '模板中心',
      subtitle: '选择一个起点，TeXora 会创建完整项目结构（主文档 + 参考文献 + 常用宏包）',
      iconName: 'layers',
      width: 1060,
      height: 'min(84vh, 760px)',
      body,
      foot: `${dialogButton('关闭')}<span class="spacer"></span><button class="btn btn-sm" id="tplInsert">${icon('code')}插入到当前文件</button><button class="btn btn-primary btn-sm" id="tplCreate">${icon('folder')}创建项目…</button>`,
      onMount: ({ root, close }) => {
        const renderDetail = () => {
          const d = root.querySelector('#tplDetail');
          d.innerHTML = `
            <div class="tpl-detail-head">
              <div class="tpl-badge">${icon('paper')}</div>
              <div><div class="tpl-title">${escapeHtml(selected.name)}</div><div class="tpl-sub">${escapeHtml(selected.desc)}</div></div>
            </div>
            <div class="section-label">包含文件</div>
            <div class="tpl-files">${selected.files.map((f) => `<div class="tpl-file">${icon(fileIconFor(f.name))}<span>${escapeHtml(f.name)}</span><span class="muted">${formatBytes(new Blob([f.content]).size)}</span></div>`).join('')}</div>
            <div class="section-label">预览</div>
            <pre class="code-block tpl-preview">${escapeHtml(selected.files[0].content.slice(0, 2200))}</pre>`;
          for (const card of $$('.template-card', root)) card.classList.toggle('active', card.dataset.id === selected.id);
        };
        for (const card of $$('.template-card', root)) {
          card.addEventListener('click', () => {
            selected = TEMPLATES.find((t) => t.id === card.dataset.id) || TEMPLATES[0];
            renderDetail();
          });
        }
        renderDetail();
        root.querySelector('[data-dialog-btn]').addEventListener('click', close);
        root.querySelector('#tplCreate').addEventListener('click', async () => {
          close();
          await createFromTemplate(selected);
        });
        root.querySelector('#tplInsert').addEventListener('click', () => {
          close();
          if (!ctx.state.activePath) return toast({ type: 'warn', title: '请先打开一个文档' });
          const content = selected.files[0].content;
          const begin = content.indexOf('\\begin{document}');
          const end = content.lastIndexOf('\\end{document}');
          const inner = begin >= 0 && end > begin ? content.slice(begin + '\\begin{document}'.length, end).trim() : content;
          ctx.app.insertBlock(inner);
        });
      }
    });
    return m;
  }

  function fileIconFor(name) {
    const ext = extOf(name);
    return { tex: 'paper', bib: 'book', md: 'file', cls: 'code', sty: 'code' }[ext] || 'file';
  }

  async function createFromTemplate(template) {
    const parent = await ctx.api.dialog.openFolder();
    if (!parent.ok) return;
    const name = await prompt({ title: '新建项目', label: '项目文件夹名称', value: slug(template.name), confirmText: '创建项目' });
    if (!name) return;
    const root = `${parent.path}\\${name}`;
    const created = await ctx.api.fs.createDir(parent.path, name);
    if (!created.ok) return toast({ type: 'error', title: '创建失败', body: created.error });
    for (const file of template.files) {
      await ctx.api.fs.write(`${root}\\${file.name}`, file.content);
    }
    const res = await ctx.api.project.open(root);
    if (res.ok) {
      toast({ type: 'success', title: '项目已创建', body: name });
      ctx.app.onProjectOpened(res, { openRoot: true });
    }
  }

  function slug(s) {
    return String(s || 'texora-project')
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'texora-project';
  }

  /* ------------------------------------------------------------ new project */
  function openNewProject() {
    const opts = { ...NEW_PROJECT_DEFAULTS };
    const packagePool = ['amsmath', 'amssymb', 'graphicx', 'hyperref', 'booktabs', 'geometry', 'xcolor', 'enumitem', 'tikz', 'algorithm2e', 'listings', 'biblatex', 'cleveref', 'siunitx', 'longtable', 'multirow', 'titlesec', 'fancyhdr'];
    const body = `
      <div class="wizard-grid">
        <div class="field"><label>文档类</label>
          <select class="input" id="wzClass">
            ${[['ctexart', 'ctexart · 中文文章'], ['ctexbook', 'ctexbook · 中文书籍'], ['ctexrep', 'ctexrep · 中文报告'], ['article', 'article · 英文文章'], ['report', 'report · 英文报告'], ['book', 'book · 英文书籍'], ['beamer', 'beamer · 幻灯片']]
              .map(([v, l]) => `<option value="${v}">${l}</option>`)
              .join('')}
          </select>
        </div>
        <div class="field"><label>纸张</label>
          <select class="input" id="wzPaper"><option value="a4paper">A4</option><option value="letterpaper">Letter</option><option value="b5paper">B5</option></select>
        </div>
        <div class="field"><label>正文字号</label>
          <select class="input" id="wzSize"><option>10pt</option><option selected>11pt</option><option>12pt</option></select>
        </div>
        <div class="field"><label>分栏</label>
          <select class="input" id="wzColumns"><option value="one">单栏</option><option value="two">双栏</option></select>
        </div>
        <div class="field full"><label>标题</label><input class="input" id="wzTitle" value="未命名文档" /></div>
        <div class="field full"><label>作者</label><input class="input" id="wzAuthor" placeholder="姓名 · 单位" /></div>
      </div>
      <div class="section-label" style="padding-left:0">常用宏包</div>
      <div class="pkg-pills" id="wzPackages">
        ${packagePool.map((p) => `<button class="pkg-pill ${NEW_PROJECT_DEFAULTS.packages.includes(p) ? 'on' : ''}" data-pkg="${p}">${p}</button>`).join('')}
      </div>
      <div class="section-label" style="padding-left:0">生成预览</div>
      <pre class="code-block" id="wzPreview" style="max-height:180px"></pre>`;
    modal({
      title: '新建文档',
      subtitle: '可视化选择文档类型、纸张、字号与宏包，一键生成标准导言区',
      iconName: 'plus',
      width: 720,
      body,
      foot: `${dialogButton('取消')}<span class="spacer"></span><button class="btn btn-sm" id="wzNewProject">${icon('folder')}创建项目文件夹</button><button class="btn btn-primary btn-sm" id="wzCreate">${icon('plus')}在当前项目新建文件</button>`,
      onMount: ({ root, close }) => {
        const read = () => {
          opts.docClass = root.querySelector('#wzClass').value;
          opts.paper = root.querySelector('#wzPaper').value;
          opts.fontSize = root.querySelector('#wzSize').value;
          opts.columns = root.querySelector('#wzColumns').value;
          opts.title = root.querySelector('#wzTitle').value;
          opts.author = root.querySelector('#wzAuthor').value;
          opts.language = opts.docClass.startsWith('ctex') ? 'zh' : 'en';
          opts.packages = $$('.pkg-pill.on', root).map((b) => b.dataset.pkg);
          root.querySelector('#wzPreview').textContent = buildWizardDocument(opts);
          return opts;
        };
        for (const pill of $$('.pkg-pill', root)) {
          pill.addEventListener('click', () => {
            pill.classList.toggle('on');
            read();
          });
        }
        for (const id of ['#wzClass', '#wzPaper', '#wzSize', '#wzColumns', '#wzTitle', '#wzAuthor']) {
          root.querySelector(id).addEventListener('input', read);
          root.querySelector(id).addEventListener('change', read);
        }
        read();
        root.querySelector('[data-dialog-btn]').addEventListener('click', close);
        root.querySelector('#wzCreate').addEventListener('click', async () => {
          const o = read();
          close();
          if (!ctx.state.project.root) {
            toast({ type: 'warn', title: '请先打开项目文件夹' });
            return;
          }
          const name = await prompt({ title: '新建文件', label: '文件名', value: 'chapter1.tex', confirmText: '创建' });
          if (!name) return;
          const res = await ctx.api.fs.createFile(ctx.state.project.root, name, buildWizardDocument(o));
          if (res.ok) {
            await ctx.sidebar.refreshFiles();
            ctx.app.openDocument(res.path);
            toast({ type: 'success', title: '已创建文档', body: name });
          }
        });
        root.querySelector('#wzNewProject').addEventListener('click', async () => {
          const o = read();
          close();
          const parent = await ctx.api.dialog.openFolder();
          if (!parent.ok) return;
          const name = await prompt({ title: '新建项目', label: '项目文件夹名', value: 'my-paper', confirmText: '创建' });
          if (!name) return;
          const created = await ctx.api.fs.createDir(parent.path, name);
          if (!created.ok) return toast({ type: 'error', title: '创建失败', body: created.error });
          await ctx.api.fs.write(`${created.path}\\main.tex`, buildWizardDocument(o));
          const res = await ctx.api.project.open(created.path);
          if (res.ok) ctx.app.onProjectOpened(res, { openRoot: true });
        });
      }
    });
  }

  /* ------------------------------------------------------------ table wizard */
  function openTableWizard() {
    const state = {
      type: 'booktabs',
      rows: 3,
      cols: 3,
      align: 'lcc',
      caption: '示例表格',
      label: 'tab:example',
      position: 'htbp',
      header: true,
      data: [
        ['项目', '数值', '误差'],
        ['N = 32', '8.0e-4', '2.00'],
        ['N = 64', '2.0e-4', '2.00']
      ],
      csv: ''
    };
    const body = `
      <div class="tbl-layout">
        <div class="tbl-left">
          <div class="row-wrap">
            <div class="field" style="flex:1"><label>表格类型</label>
              <select class="input" id="twType">
                <option value="booktabs">学术三线表（booktabs）</option>
                <option value="tabular">普通表格（tabular）</option>
                <option value="longtable">跨页长表格（longtable）</option>
                <option value="tblr">Tabularray（tblr）</option>
              </select>
            </div>
            <div class="field" style="width:100px"><label>列数</label><input class="input" id="twCols" type="number" min="1" max="12" value="3" /></div>
            <div class="field" style="width:100px"><label>行数</label><input class="input" id="twRows" type="number" min="1" max="40" value="3" /></div>
          </div>
          <div class="row-wrap">
            <div class="field" style="flex:1"><label>列对齐（l c r p{2cm}）</label><input class="input input-mono" id="twAlign" value="lcc" /></div>
            <div class="field" style="width:110px"><label>浮动位置</label><input class="input" id="twPos" value="htbp" /></div>
          </div>
          <div class="row-wrap">
            <div class="field" style="flex:1"><label>Caption</label><input class="input" id="twCaption" value="示例表格" /></div>
            <div class="field" style="width:160px"><label>Label</label><input class="input input-mono" id="twLabel" value="tab:example" /></div>
          </div>
          <div class="tbl-grid-wrap"><div class="tbl-grid" id="twGrid"></div></div>
          <div class="row">
            <label class="row" style="font-size:12px;color:var(--text-2);gap:6px"><input type="checkbox" id="twHeader" checked /> 首行为表头</label>
            <span class="spacer"></span>
            <button class="btn btn-sm" id="twAddRow">${icon('plus')}行</button>
            <button class="btn btn-sm" id="twAddCol">${icon('plus')}列</button>
          </div>
          <div class="field" style="margin-top:10px">
            <label>从 Excel / CSV 粘贴</label>
            <textarea class="input" id="twCsv" rows="3" placeholder="粘贴制表符或逗号分隔的数据，自动填入网格…"></textarea>
            <button class="btn btn-sm" id="twParseCsv" style="align-self:flex-start">${icon('table')}解析到网格</button>
          </div>
        </div>
        <div class="tbl-right">
          <div class="section-label" style="padding-left:0">LaTeX 预览</div>
          <pre class="code-block" id="twPreview"></pre>
          <div class="field-hint">支持 booktabs 三线表、跨页长表格（longtable）与 Tabularray。生成后可继续手动微调。</div>
        </div>
      </div>`;
    modal({
      title: '插入表格',
      subtitle: '可视化网格编辑 · 支持三线表 / 长表格 / Excel 粘贴',
      iconName: 'table',
      width: 1000,
      height: 'min(86vh, 780px)',
      body,
      foot: `${dialogButton('取消')}<span class="spacer"></span><button class="btn btn-primary btn-sm" id="twInsert">${icon('check')}插入表格</button>`,
      onMount: ({ root, close }) => {
        const generate = () => {
          const align = state.align || 'l'.repeat(state.cols);
          const rows = state.data.map((r) => r.map((c) => (c ?? '').replace(/(?<!\\)&/g, '\\&')));
          const bodyRows = rows.map((r) => '\t\t' + r.join(' & ') + ' \\\\');
          const headerRow = state.header ? '\t\t' + rows[0].join(' & ') + ' \\\\\n\t\t\\midrule' : '';
          const dataRows = (state.header ? bodyRows.slice(1) : bodyRows).join('\n');
          let code = '';
          if (state.type === 'booktabs') {
            code = `\\begin{table}[${state.position}]\n\t\\centering\n\t\\caption{${state.caption}}\n\t\\label{${state.label}}\n\t\\begin{tabular}{${align}}\n\t\t\\toprule\n${headerRow ? headerRow + '\n' : ''}${dataRows}\n\t\t\\bottomrule\n\t\\end{tabular}\n\\end{table}`;
          } else if (state.type === 'longtable') {
            code = `\\begin{longtable}{${align}}\n\t\\caption{${state.caption}}\\label{${state.label}}\\\\\n\t\\toprule\n${headerRow ? headerRow + '\n' : ''}${dataRows}\n\t\\bottomrule\n\\end{longtable}`;
          } else if (state.type === 'tblr') {
            code = `\\begin{table}[${state.position}]\n\t\\centering\n\t\\caption{${state.caption}}\n\t\\label{${state.label}}\n\t\\begin{tblr}{colspec={${align}}, hline{1,Z}={solid}, hline{2}={solid}}\n${rows.map((r) => '\t\t' + r.join(' & ') + ' \\\\').join('\n')}\n\t\\end{tblr}\n\\end{table}`;
          } else {
            code = `\\begin{table}[${state.position}]\n\t\\centering\n\t\\caption{${state.caption}}\n\t\\label{${state.label}}\n\t\\begin{tabular}{${align}}\n\t\t\\hline\n${rows.map((r) => '\t\t' + r.join(' & ') + ' \\\\\n\t\t\\hline').join('\n')}\n\t\\end{tabular}\n\\end{table}`;
          }
          root.querySelector('#twPreview').textContent = code;
          return code;
        };
        const renderGrid = () => {
          const grid = root.querySelector('#twGrid');
          grid.style.gridTemplateColumns = `repeat(${state.cols}, minmax(70px, 1fr))`;
          grid.innerHTML = state.data
            .map((r, ri) => r.map((c, ci) => `<input data-r="${ri}" data-c="${ci}" value="${escapeHtml(c)}" />`).join(''))
            .join('');
          for (const input of $$('input', grid)) {
            input.addEventListener('input', () => {
              state.data[Number(input.dataset.r)][Number(input.dataset.c)] = input.value;
              generate();
            });
            input.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const r = Number(input.dataset.r);
                const c = Number(input.dataset.c);
                if (r === state.data.length - 1) {
                  state.rows++;
                  state.data.push(new Array(state.cols).fill(''));
                  renderGrid();
                }
                root.querySelector(`input[data-r="${Math.min(r + 1, state.data.length - 1)}"][data-c="${c}"]`)?.focus();
              }
            });
          }
        };
        const resize = (rows, cols) => {
          state.rows = Math.max(1, rows);
          state.cols = Math.max(1, cols);
          while (state.data.length < state.rows) state.data.push(new Array(state.cols).fill(''));
          state.data = state.data.slice(0, state.rows).map((r) => {
            const copy = r.slice(0, state.cols);
            while (copy.length < state.cols) copy.push('');
            return copy;
          });
          state.align = ('l' + 'c'.repeat(state.cols - 1)).slice(0, state.cols);
          root.querySelector('#twAlign').value = state.align;
          root.querySelector('#twRows').value = state.rows;
          root.querySelector('#twCols').value = state.cols;
          renderGrid();
          generate();
        };
        root.querySelector('#twType').addEventListener('change', (e) => {
          state.type = e.target.value;
          generate();
        });
        root.querySelector('#twCols').addEventListener('change', (e) => resize(state.rows, Number(e.target.value)));
        root.querySelector('#twRows').addEventListener('change', (e) => resize(Number(e.target.value), state.cols));
        root.querySelector('#twAlign').addEventListener('input', (e) => {
          state.align = e.target.value;
          generate();
        });
        root.querySelector('#twPos').addEventListener('input', (e) => {
          state.position = e.target.value;
          generate();
        });
        root.querySelector('#twCaption').addEventListener('input', (e) => {
          state.caption = e.target.value;
          generate();
        });
        root.querySelector('#twLabel').addEventListener('input', (e) => {
          state.label = e.target.value;
          generate();
        });
        root.querySelector('#twHeader').addEventListener('change', (e) => {
          state.header = e.target.checked;
          generate();
        });
        root.querySelector('#twAddRow').addEventListener('click', () => resize(state.rows + 1, state.cols));
        root.querySelector('#twAddCol').addEventListener('click', () => resize(state.rows, state.cols + 1));
        root.querySelector('#twParseCsv').addEventListener('click', () => {
          const text = root.querySelector('#twCsv').value.trim();
          if (!text) return;
          const rows = text.split(/\r?\n/).filter((l) => l.trim()).map((line) => line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, '').trim()));
          const cols = Math.max(...rows.map((r) => r.length));
          state.data = rows.map((r) => {
            const copy = r.slice();
            while (copy.length < cols) copy.push('');
            return copy;
          });
          resize(rows.length, cols);
        });
        root.querySelector('[data-dialog-btn]').addEventListener('click', close);
        root.querySelector('#twInsert').addEventListener('click', () => {
          const code = generate();
          close();
          ctx.app.insertBlock(code);
        });
        renderGrid();
        generate();
      }
    });
  }

  /* ------------------------------------------------------------ image dialog */
  async function openImageDialog({ dataUrl = '', source = '' } = {}) {
    if (!ctx.state.project.root) {
      toast({ type: 'warn', title: '请先打开项目文件夹', body: '图片会保存到项目的 figures/ 目录中' });
      return;
    }
    let imagePath = '';
    let pendingImage = dataUrl;
    const imageDir = ctx.state.settings.files.imageDir || 'figures';
    const body = `
      <div class="img-dialog">
        <div class="img-preview" id="imgPreview">${dataUrl ? `<img src="${dataUrl}" />` : `<div class="img-empty">${icon('image')}<span>选择本地图片或直接粘贴剪贴板图片</span></div>`}</div>
        <div class="img-fields">
          <div class="row">
            <button class="btn btn-sm" id="imgChoose">${icon('folder')}选择图片文件</button>
            <button class="btn btn-sm" id="imgPaste">${icon('copy')}从剪贴板粘贴</button>
          </div>
          <div class="field"><label>文件名</label><input class="input" id="imgName" value="figure" /></div>
          <div class="row">
            <div class="field" style="flex:1"><label>宽度</label><input class="input" id="imgWidth" value="0.8" /></div>
            <div class="field" style="width:90px"><label>单位</label><select class="input" id="imgUnit"><option>\\linewidth</option><option>\\textwidth</option><option>cm</option><option>in</option><option>pt</option></select></div>
          </div>
          <div class="field"><label>Caption</label><input class="input" id="imgCaption" value="示例图片" /></div>
          <div class="field"><label>Label</label><input class="input input-mono" id="imgLabel" value="fig:example" /></div>
          <div class="field"><label>浮动位置</label><input class="input" id="imgPos" value="htbp" /></div>
          <label class="row" style="font-size:12px;gap:6px"><input type="checkbox" id="imgCentered" checked /> 居中（\\centering）</label>
          <div class="field-hint">保存路径：${escapeHtml(imageDir)}/ （可在 设置 → 文件与备份 中修改）</div>
        </div>
      </div>`;
    const m = modal({
      title: '插入图片',
      subtitle: '自动保存到项目 figures 目录并生成 figure 环境',
      iconName: 'image',
      width: 820,
      body,
      foot: `${dialogButton('取消')}<span class="spacer"></span><button class="btn btn-primary btn-sm" id="imgInsert">${icon('check')}插入图片</button>`,
      onMount: ({ root, close }) => {
        const preview = root.querySelector('#imgPreview');
        const setPreview = (url) => {
          preview.innerHTML = url ? `<img src="${url}" />` : `<div class="img-empty">${icon('image')}<span>选择本地图片或直接粘贴剪贴板图片</span></div>`;
        };
        let selectedExt = 'png';
        root.querySelector('#imgChoose').addEventListener('click', async () => {
          const res = await ctx.api.dialog.openFiles({ filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'pdf', 'eps', 'svg'] }] });
          if (!res.ok || !res.paths.length) return;
          const p = res.paths[0];
          const bin = await ctx.api.fs.readBinary(p);
          if (!bin.ok) return;
          pendingImage = `data:image/${extOf(p) === 'jpg' ? 'jpeg' : extOf(p)};base64,${bin.base64}`;
          selectedExt = extOf(p) || 'png';
          imagePath = p;
          setPreview(pendingImage);
          root.querySelector('#imgName').value = baseName(p).replace(/\.[^.]+$/, '');
        });
        root.querySelector('#imgPaste').addEventListener('click', async () => {
          const res = await ctx.api.clipboard.readImage();
          if (!res.ok) return toast({ type: 'warn', title: '剪贴板中没有图片' });
          pendingImage = res.dataUrl;
          selectedExt = 'png';
          imagePath = '';
          setPreview(pendingImage);
          root.querySelector('#imgName').value = 'pasted-figure';
        });
        root.querySelector('[data-dialog-btn]').addEventListener('click', close);
        root.querySelector('#imgInsert').addEventListener('click', async () => {
          if (!pendingImage && !imagePath) return toast({ type: 'warn', title: '请先选择一张图片' });
          const dir = `${ctx.state.project.root}\\${imageDir}`;
          let rel = '';
          let filename = (root.querySelector('#imgName').value.trim() || 'figure') + '.' + (selectedExt === 'jpg' ? 'jpeg' : selectedExt);
          if (imagePath && !pendingImage) {
            // copy existing file
            const bin = await ctx.api.fs.readBinary(imagePath);
            if (!bin.ok) return;
            const saved = await ctx.api.fs.saveImage(dir, filename, bin.base64);
            rel = `${imageDir}/${baseName(saved.path)}`;
          } else {
            const saved = await ctx.api.fs.saveImage(dir, filename, pendingImage);
            if (!saved.ok) return toast({ type: 'error', title: '保存图片失败', body: saved.error });
            rel = `${imageDir}/${baseName(saved.path)}`;
          }
          const widthVal = root.querySelector('#imgWidth').value.trim() || '0.8';
          const unit = root.querySelector('#imgUnit').value;
          const widthOpt = unit.startsWith('\\') ? `width=${widthVal}${unit}` : `width=${widthVal}${unit}`;
          const caption = root.querySelector('#imgCaption').value;
          const label = root.querySelector('#imgLabel').value;
          const pos = root.querySelector('#imgPos').value;
          const centered = root.querySelector('#imgCentered').checked;
          const code = `\\begin{figure}[${pos}]\n${centered ? '\t\\centering\n' : ''}\t\\includegraphics[${widthOpt}]{${rel}}\n\t\\caption{${caption}}\n\t\\label{${label}}\n\\end{figure}`;
          close();
          ctx.app.insertBlock(code);
          ctx.app.refreshAssets();
        });
      }
    });
    return m;
  }

  /* -------------------------------------------------------------- cite picker */
  function openCitePicker(prefill) {
    if (!ctx.state.bibEntries.length) {
      toast({
        type: 'warn',
        title: '未找到文献条目',
        body: '请在项目中添加 .bib 文件，或使用 DOI / arXiv 抓取功能导入文献。'
      });
      return;
    }
    let selected = new Set(prefill ? prefill.split(',').map((s) => s.trim()).filter(Boolean) : []);
    const body = `
      <div class="cite-picker">
        <div class="search-input-wrap">${icon('search')}<input class="input" id="citeSearch" placeholder="搜索标题、作者、年份或 key…" /></div>
        <div class="cite-list" id="citeList"></div>
        <div class="cite-footer"><span id="citeCount">已选 ${selected.size} 项</span><span class="spacer"></span>
          <select class="input input-sm" id="citeCmd" style="width:140px">
            <option value="cite">\\cite</option><option value="citep">\\citep</option><option value="citet">\\citet</option><option value="parencite">\\parencite</option><option value="textcite">\\textcite</option>
          </select>
        </div>
      </div>`;
    modal({
      title: '插入文献引用',
      subtitle: '支持多选，自动去重并保留键名顺序',
      iconName: 'book',
      width: 680,
      body,
      foot: `${dialogButton('取消')}<span class="spacer"></span><button class="btn btn-primary btn-sm" id="citeInsert">${icon('check')}插入引用</button>`,
      onMount: ({ root, close }) => {
        const list = root.querySelector('#citeList');
        const render = (q = '') => {
          const query = q.toLowerCase();
          const items = ctx.state.bibEntries.filter(
            (e) => !query || e.key.toLowerCase().includes(query) || (e.title || '').toLowerCase().includes(query) || (e.author || '').toLowerCase().includes(query) || (e.year || '').includes(query)
          );
          list.innerHTML =
            items
              .map(
                (e) => `<label class="cite-row ${selected.has(e.key) ? 'on' : ''}" data-key="${escapeHtml(e.key)}">
              <input type="checkbox" ${selected.has(e.key) ? 'checked' : ''} />
              <div class="cite-main">
                <div class="cite-title">${escapeHtml(e.title || e.key)}</div>
                <div class="cite-meta">${escapeHtml(formatAuthors(e.author).slice(0, 80))}${e.year ? ' · ' + e.year : ''}${e.journal || e.booktitle ? ' · ' + escapeHtml(e.journal || e.booktitle) : ''}</div>
              </div>
              <span class="cite-key">${escapeHtml(e.key)}</span>
            </label>`
              )
              .join('') || `<div class="empty-hint">没有匹配的文献</div>`;
          for (const row of $$('.cite-row', list)) {
            row.addEventListener('change', () => {
              const key = row.dataset.key;
              if (selected.has(key)) selected.delete(key);
              else selected.add(key);
              row.classList.toggle('on', selected.has(key));
              root.querySelector('#citeCount').textContent = `已选 ${selected.size} 项`;
            });
          }
        };
        root.querySelector('#citeSearch').addEventListener('input', (e) => render(e.target.value));
        render();
        root.querySelector('[data-dialog-btn]').addEventListener('click', close);
        root.querySelector('#citeInsert').addEventListener('click', () => {
          if (!selected.size) return toast({ type: 'warn', title: '请先选择文献' });
          const cmd = root.querySelector('#citeCmd').value;
          const keys = Array.from(selected).join(',');
          close();
          ctx.editor.insertText(`\\${cmd}{${keys}}`);
        });
      }
    });
  }

  /* ----------------------------------------------------------------- symbols */
  function openSymbols(groupId = '') {
    const recent = JSON.parse(localStorage.getItem('texora.recentSymbols') || '[]');
    let active = groupId || SYMBOL_GROUPS[0].id;
    const body = `
      <div class="symbol-layout">
        <div class="symbol-tabs" id="symbolTabs">
          ${SYMBOL_GROUPS.map((g) => `<button data-group="${g.id}" class="${g.id === active ? 'active' : ''}">${escapeHtml(g.title)}</button>`).join('')}
          <button data-group="recent" class="${active === 'recent' ? 'active' : ''}">最近使用</button>
        </div>
        <div class="symbol-content" id="symbolContent"></div>
      </div>`;
    modal({
      title: '数学符号面板',
      subtitle: '点击插入到光标位置 · 最近使用会自动记录',
      iconName: 'sigma',
      width: 760,
      height: 'min(70vh, 620px)',
      body,
      foot: `${dialogButton('关闭')}<span class="spacer"></span><span class="field-hint">提示：符号会插入到当前光标位置或替换选区</span>`,
      onMount: ({ root, close }) => {
        const content = root.querySelector('#symbolContent');
        const render = (id) => {
          for (const tab of $$('.symbol-tabs button', root)) tab.classList.toggle('active', tab.dataset.group === id);
          let items = [];
          if (id === 'recent') {
            items = recent.map((tex) => [tex, tex]);
          } else {
            items = SYMBOL_GROUPS.find((g) => g.id === id)?.items || [];
          }
          content.innerHTML = `<div class="symbol-buttons">${items
            .map(([tex, glyph]) => `<button class="symbol-btn" data-tex="${escapeHtml(tex)}" title="${escapeHtml(tex)}">${escapeHtml(glyph)}</button>`)
            .join('')}</div>`;
          for (const btn of $$('.symbol-btn', content)) {
            btn.addEventListener('click', () => {
              const tex = btn.dataset.tex;
              insertSymbol(tex);
              if (!recent.includes(tex)) recent.unshift(tex);
              while (recent.length > 24) recent.pop();
              localStorage.setItem('texora.recentSymbols', JSON.stringify(recent));
            });
          }
        };
        for (const tab of $$('.symbol-tabs button', root)) {
          tab.addEventListener('click', () => {
            active = tab.dataset.group;
            render(active);
          });
        }
        render(active);
        root.querySelector('[data-dialog-btn]').addEventListener('click', close);
      }
    });
  }

  function insertSymbol(tex) {
    if (!ctx.editor || !ctx.state.activePath) {
      toast({ type: 'warn', title: '请先打开文档' });
      return;
    }
    if (ctx.editor.getSelectionText()) {
      ctx.editor.insertText(tex);
      return;
    }
    ctx.editor.insertText(tex);
  }

  function openEnvironmentPicker() {
    const body = `<div class="symbol-layout">
      <div class="symbol-tabs" id="envTabs">
        <button class="active" data-kind="math">数学</button>
        <button data-kind="theorem">定理</button>
        <button data-kind="float">浮动体</button>
        <button data-kind="text">文本</button>
      </div>
      <div class="symbol-content" id="envContent"></div></div>`;
    const sets = {
      math: ['equation', 'align', 'gather', 'multline', 'cases', 'matrix', 'pmatrix', 'bmatrix', 'aligned', 'split'],
      theorem: ['theorem', 'lemma', 'proposition', 'corollary', 'definition', 'proof', 'remark', 'example'],
      float: ['figure', 'table', 'tabular', 'longtable', 'tblr', 'minipage'],
      text: ['itemize', 'enumerate', 'description', 'quote', 'quotation', 'center', 'flushleft', 'flushright', 'abstract', 'verbatim']
    };
    modal({
      title: '插入环境',
      body,
      width: 620,
      foot: `${dialogButton('关闭')}<span class="spacer"></span><span class="field-hint">自动补全 \\begin 与 \\end，光标置于环境内部</span>`,
      onMount: ({ root, close }) => {
        const content = root.querySelector('#envContent');
        const render = (kind) => {
          content.innerHTML = `<div class="env-grid">${sets[kind]
            .map((env) => `<button class="env-card" data-env="${env}"><span class="env-name">${env}</span><span class="env-hint">${envHint(env)}</span></button>`)
            .join('')}</div>`;
          for (const card of $$('.env-card', content)) {
            card.addEventListener('click', () => {
              close();
              ctx.app.insertEnvironment(card.dataset.env);
            });
          }
        };
        for (const tab of $$('.symbol-tabs button', root)) {
          tab.addEventListener('click', () => {
            for (const t of $$('.symbol-tabs button', root)) t.classList.toggle('active', t === tab);
            render(tab.dataset.kind);
          });
        }
        render('math');
        root.querySelector('[data-dialog-btn]').addEventListener('click', close);
      }
    });
  }

  function envHint(env) {
    const hints = {
      equation: '单行编号公式', align: '多行对齐公式', gather: '多行居中公式', cases: '分段函数',
      figure: '图片浮动体', table: '表格浮动体', tabular: '表格主体', theorem: '定理', lemma: '引理',
      proof: '证明', itemize: '无序列表', enumerate: '有序列表', tikzpicture: 'TikZ 绘图'
    };
    return hints[env] || '';
  }

  /* ------------------------------------------------------------- font picker */
  async function openFontPicker(kind = 'latin') {
    let fonts = ctx.state.fonts;
    if (!fonts.length) {
      const res = await ctx.api.tex.fonts();
      fonts = res.fonts || [];
      ctx.state.fonts = fonts;
    }
    let tab = kind === 'mono' ? 'mono' : kind === 'cjk' ? 'cjk' : 'latin';
    const current = ctx.state.settings.tex.fonts;
    const body = `
      <div class="font-picker">
        <div class="row">
          <div class="seg" id="fontTabs">
            <button data-kind="latin">英文比例字体</button>
            <button data-kind="cjk">中文字体</button>
            <button data-kind="mono">等宽字体</button>
          </div>
          <span class="spacer"></span>
          <div class="search-input-wrap" style="width:220px">${icon('search')}<input class="input input-sm" id="fontSearch" placeholder="搜索字体…" /></div>
          <button class="btn btn-sm" id="fontRefresh">${icon('refresh')}刷新</button>
        </div>
        <div class="font-list" id="fontList"></div>
        <div class="field-hint" id="fontHint"></div>
      </div>`;
    modal({
      title: '本地字体',
      subtitle: '自动读取 Windows 字体列表，写入导言区的 fontspec / xeCJK 配置',
      iconName: 'type',
      width: 760,
      height: 'min(76vh, 660px)',
      body,
      foot: `${dialogButton('关闭')}<span class="spacer"></span><button class="btn btn-primary btn-sm" id="fontApply">${icon('check')}应用到导言区</button>`,
      onMount: ({ root, close }) => {
        let chosen = current[tab] || '';
        const list = root.querySelector('#fontList');
        const hint = root.querySelector('#fontHint');
        const render = () => {
          const q = root.querySelector('#fontSearch').value.toLowerCase();
          const items = fonts.filter((f) => f.kind === (tab === 'cjk' ? 'cjk' : tab === 'mono' ? 'mono' : 'latin') && (!q || f.name.toLowerCase().includes(q)));
          list.innerHTML = items
            .map(
              (f) => `<div class="font-row ${f.name === chosen ? 'active' : ''}" data-name="${escapeHtml(f.name)}">
              <span class="f-preview" style="font-family:'${escapeHtml(f.name)}'">Aa 文</span>
              <span class="f-name" style="font-family:'${escapeHtml(f.name)}'">${escapeHtml(f.name)}</span>
              <span class="f-kind">${f.kind}</span>
            </div>`
            )
            .join('') || `<div class="empty-hint">没有匹配的字体</div>`;
          for (const row of $$('.font-row', list)) {
            row.addEventListener('click', () => {
              chosen = row.dataset.name;
              for (const r of $$('.font-row', list)) r.classList.toggle('active', r === row);
              updateHint();
            });
          }
        };
        const updateHint = () => {
          const map = {
            latin: `\\setmainfont{${chosen || '…'}}  → 英文正文`,
            cjk: `\\setCJKmainfont{${chosen || '…'}}  → 中文正文`,
            mono: `\\setmonofont{${chosen || '…'}}  → 等宽 / 代码`
          };
          hint.textContent = '将写入：' + map[tab];
        };
        for (const btn of $$('#fontTabs button', root)) {
          btn.addEventListener('click', () => {
            tab = btn.dataset.kind;
            for (const b of $$('#fontTabs button', root)) b.classList.toggle('active', b === btn);
            chosen = ctx.state.settings.tex.fonts[tab] || '';
            render();
            updateHint();
          });
        }
        for (const b of $$('#fontTabs button', root)) if (b.dataset.kind === tab) b.classList.add('active');
        root.querySelector('#fontSearch').addEventListener('input', render);
        root.querySelector('#fontRefresh').addEventListener('click', async () => {
          const res = await ctx.api.tex.fonts(true);
          fonts = res.fonts || [];
          ctx.state.fonts = fonts;
          render();
        });
        root.querySelector('[data-dialog-btn]').addEventListener('click', close);
        root.querySelector('#fontApply').addEventListener('click', () => {
          if (!chosen) return;
          close();
          ctx.app.applyLocalFont(tab, chosen);
        });
        render();
        updateHint();
      }
    });
  }

  /* --------------------------------------------------------------- bib manager */
  function openBibManager() {
    const entries = ctx.state.bibEntries || [];
    const body = `
      <div class="bib-layout">
        <div class="bib-list" id="bibList">
          ${entries
            .map(
              (e, i) => `<div class="bib-card" data-i="${i}">
            <div class="bib-title">${escapeHtml(e.title || e.key)}</div>
            <div class="bib-meta">${escapeHtml(formatAuthors(e.author))}${e.year ? ' · ' + e.year : ''}</div>
            <div class="bib-key">${escapeHtml(e.key)}</div>
          </div>`
            )
            .join('') || `<div class="empty-hint">项目中还没有 .bib 文件或条目</div>`}
        </div>
        <div class="bib-editor" id="bibEditor"><div class="empty-hint">选择左侧条目查看与编辑</div></div>
      </div>`;
    modal({
      title: '文献管理器',
      subtitle: `${entries.length} 条文献 · 表单与源码双向编辑`,
      iconName: 'book',
      width: 980,
      height: 'min(82vh, 720px)',
      body,
      foot: `${dialogButton('关闭')}<span class="spacer"></span><button class="btn btn-sm" id="bibOpenSource">${icon('code')}在编辑器中打开 .bib</button><button class="btn btn-primary btn-sm" id="bibSave">${icon('check')}保存修改</button>`,
      onMount: ({ root, close }) => {
        let current = null;
        const editor = root.querySelector('#bibEditor');
        const show = (entry) => {
          current = entry;
          if (!entry) return;
          const fields = ['title', 'author', 'year', 'journal', 'booktitle', 'volume', 'number', 'pages', 'publisher', 'doi', 'url'];
          editor.innerHTML = `
            <div class="field"><label>引用键</label><input class="input input-mono" id="bibKey" value="${escapeHtml(entry.key)}" /></div>
            <div class="row-wrap">
              ${fields
                .map(
                  (f) => `<div class="field" style="flex:1;min-width:140px"><label>${f}</label><input class="input" data-field="${f}" value="${escapeHtml(entry.fields[f] || '')}" /></div>`
                )
                .join('')}
            </div>
            <div class="section-label" style="padding-left:0">BibTeX</div>
            <pre class="code-block" id="bibTex">${escapeHtml(entryToBibtex(entry))}</pre>`;
          const update = () => {
            entry.key = root.querySelector('#bibKey').value.trim() || entry.key;
            for (const input of $$('[data-field]', editor)) entry.fields[input.dataset.field] = input.value;
            const tex = entryToBibtex(entry);
            root.querySelector('#bibTex').textContent = tex;
          };
          for (const input of $$('input', editor)) input.addEventListener('input', update);
        };
        for (const card of $$('.bib-card', root)) {
          card.addEventListener('click', () => {
            for (const c of $$('.bib-card', root)) c.classList.toggle('active', c === card);
            show(entries[Number(card.dataset.i)]);
          });
        }
        root.querySelector('[data-dialog-btn]').addEventListener('click', close);
        root.querySelector('#bibSave').addEventListener('click', async () => {
          if (!entries.length) return;
          const bibFiles = ctx.state.assets.bib || [];
          if (!bibFiles.length) return toast({ type: 'warn', title: '未找到 .bib 文件' });
          const file = `${ctx.state.project.root}\\${bibFiles[0].split('/').join('\\')}`;
          const res = await ctx.api.fs.write(file, entries.map((e) => entryToBibtex(e)).join('\n\n') + '\n');
          if (res.ok) {
            toast({ type: 'success', title: '文献库已保存', body: baseName(file) });
            ctx.app.refreshBibEntries();
            close();
          }
        });
        root.querySelector('#bibOpenSource').addEventListener('click', () => {
          const bibFiles = ctx.state.assets.bib || [];
          if (!bibFiles.length) return toast({ type: 'warn', title: '未找到 .bib 文件' });
          close();
          ctx.app.openDocument(`${ctx.state.project.root}\\${bibFiles[0].split('/').join('\\')}`);
        });
      }
    });
  }

  /* ------------------------------------------------------------------ DOI */
  function openDoiFetch() {
    const body = `
      <div class="field"><label>DOI 或 arXiv ID</label>
        <input class="input input-mono" id="doiInput" placeholder="10.1093/comjnl/27.2.97  或  2301.00001" />
        <div class="field-hint">通过网络请求 Crossref / arXiv 元数据并生成 BibTeX 条目，需要可用的网络连接。</div>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="btn btn-sm" id="doiFetch">${icon('download')}抓取元数据</button>
        <span class="field-hint" id="doiStatus"></span>
      </div>
      <div class="section-label" style="padding-left:0">BibTeX 结果</div>
      <pre class="code-block" id="doiResult" style="min-height:140px">等待抓取…</pre>`;
    modal({
      title: 'DOI / arXiv 抓取 BibTeX',
      iconName: 'download',
      width: 680,
      body,
      foot: `${dialogButton('关闭')}<span class="spacer"></span><button class="btn btn-sm" id="doiCopy">${icon('copy')}复制</button><button class="btn btn-primary btn-sm" id="doiInsert">${icon('check')}追加到 .bib</button>`,
      onMount: ({ root, close }) => {
        let bibtex = '';
        root.querySelector('[data-dialog-btn]').addEventListener('click', close);
        root.querySelector('#doiFetch').addEventListener('click', async () => {
          const id = root.querySelector('#doiInput').value.trim();
          if (!id) return;
          const status = root.querySelector('#doiStatus');
          status.textContent = '抓取中…';
          const res = await ctx.api.lookup.doi(id);
          if (!res.ok) {
            status.textContent = '';
            root.querySelector('#doiResult').textContent = res.error || '抓取失败';
            return;
          }
          bibtex = res.bibtex;
          root.querySelector('#doiResult').textContent = bibtex;
          status.textContent = '✓ 已获取元数据';
        });
        root.querySelector('#doiCopy').addEventListener('click', async () => {
          if (!bibtex) return;
          await copyText(bibtex);
          toast({ type: 'success', title: '已复制 BibTeX' });
        });
        root.querySelector('#doiInsert').addEventListener('click', async () => {
          if (!bibtex) return toast({ type: 'warn', title: '请先抓取元数据' });
          const bibFiles = ctx.state.assets.bib || [];
          const file = bibFiles.length ? `${ctx.state.project.root}\\${bibFiles[0].split('/').join('\\')}` : `${ctx.state.project.root}\\references.bib`;
          const cur = await ctx.api.fs.read(file);
          const text = (cur.ok ? cur.text : '') + '\n\n' + bibtex + '\n';
          const res = await ctx.api.fs.write(file, text);
          if (res.ok) {
            toast({ type: 'success', title: '已写入文献库', body: baseName(file) });
            ctx.app.refreshBibEntries();
            close();
          } else toast({ type: 'error', title: '写入失败', body: res.error });
        });
      }
    });
  }

  /* --------------------------------------------------------------- markdown */
  function openMarkdownTools() {
    const doc = ctx.state.docs.get(ctx.state.activePath);
    const isMd = extOf(ctx.state.activePath) === 'md';
    const text = doc ? doc.model.getValue() : '';
    const body = isMd
      ? `<div class="md-split"><div class="md-preview">${renderMarkdown(text)}</div></div>
         <div class="row" style="margin-top:10px"><button class="btn btn-sm" id="mdCopyLatex">${icon('code')}转换并复制 LaTeX</button><button class="btn btn-primary btn-sm" id="mdSaveLatex">${icon('paper')}另存为 .tex</button></div>`
      : `<div class="field"><label>Markdown 内容</label><textarea class="input" id="mdInput" rows="12">${escapeHtml(text)}</textarea></div>
         <div class="section-label" style="padding-left:0">实时预览</div><div class="md-preview" id="mdPreview"></div>`;
    modal({
      title: 'Markdown 工具',
      subtitle: isMd ? '实时预览当前 Markdown 文档，可转换为 LaTeX' : '粘贴 Markdown 并转换为 LaTeX',
      iconName: 'code',
      width: 900,
      height: 'min(82vh, 720px)',
      body,
      foot: `${dialogButton('关闭')}<span class="spacer"></span><span class="field-hint">转换保留标题、列表、强调、代码块与链接</span>`,
      onMount: ({ root, close }) => {
        root.querySelector('[data-dialog-btn]').addEventListener('click', close);
        if (isMd) {
          root.querySelector('#mdCopyLatex').addEventListener('click', async () => {
            await copyText(mdToLatex(text));
            toast({ type: 'success', title: '已复制 LaTeX 源码' });
          });
          root.querySelector('#mdSaveLatex').addEventListener('click', async () => {
            const res = await ctx.api.dialog.saveFile({ title: '另存为 LaTeX', defaultPath: ctx.state.activePath.replace(/\.md$/i, '.tex') });
            if (!res.ok) return;
            const write = await ctx.api.fs.write(res.path, wrapLatexFromMd(mdToLatex(text)));
            if (write.ok) {
              toast({ type: 'success', title: '已导出 LaTeX', body: baseName(res.path) });
              ctx.app.openDocument(res.path);
            }
          });
        } else {
          const input = root.querySelector('#mdInput');
          const preview = root.querySelector('#mdPreview');
          const update = debounce(() => (preview.innerHTML = renderMarkdown(input.value)), 200);
          input.addEventListener('input', update);
          update();
        }
      }
    });
  }

  function wrapLatexFromMd(body) {
    return `\\documentclass[11pt]{ctexart}\n\\usepackage{amsmath,amssymb}\n\\usepackage{graphicx}\n\\usepackage{hyperref}\n\n\\begin{document}\n\n${body}\n\n\\end{document}\n`;
  }

  /* ----------------------------------------------------------------- about */
  async function openAbout() {
    const info = await ctx.api.info();
    const tex = ctx.state.texInfo || {};
    const body = `
      <div class="about">
        <div class="about-hero">
          <div class="about-mark"><img src="${appIcon}" alt="TeXora" /></div>
          <div>
            <div class="about-title">TeXora</div>
            <div class="about-ver">版本 ${escapeHtml(info.version)} · 本地优先的 LaTeX 写作工作台</div>
          </div>
        </div>
        <div class="about-grid">
          <div class="about-item"><span>TeX 发行版</span><strong>${escapeHtml(tex.distro || '未检测到')}</strong></div>
          <div class="about-item"><span>TeX 版本</span><strong>${escapeHtml(tex.version || '—')}</strong></div>
          <div class="about-item"><span>可执行目录</span><strong class="mono">${escapeHtml(tex.binDir || '—')}</strong></div>
          <div class="about-item"><span>Electron</span><strong>${escapeHtml(info.electron)}</strong></div>
          <div class="about-item"><span>Chromium</span><strong>${escapeHtml(info.chrome)}</strong></div>
          <div class="about-item"><span>Node.js</span><strong>${escapeHtml(info.node)}</strong></div>
          <div class="about-item"><span>用户数据</span><strong class="mono">${escapeHtml(info.userData)}</strong></div>
          <div class="about-item"><span>Git</span><strong>${info.git ? '已检测到' : '未安装'}</strong></div>
        </div>
        <div class="field-hint">TeXora 的所有文档处理均在本地完成；仅在启用 AI 功能时，所选上下文会发送到你配置的模型服务商。</div>
      </div>`;
    modal({
      title: '关于 TeXora',
      width: 640,
      body,
      foot: `${dialogButton('关闭')}<span class="spacer"></span><button class="btn btn-sm" data-project-home>${icon('external')}项目主页</button>`,
      onMount: ({ root }) => {
        root.querySelector('[data-project-home]').addEventListener('click', () => openExternalLink(ctx.api, PROJECT_HOME, toast));
      }
    });
  }

  /* -------------------------------------------------------------- shortcuts */
  function openShortcuts() {
    const keys = ctx.commands.list.filter((c) => c.keys && !c.hidden);
    const groups = new Map();
    for (const cmd of keys) {
      if (!groups.has(cmd.group)) groups.set(cmd.group, []);
      groups.get(cmd.group).push(cmd);
    }
    const body = `<div class="shortcut-groups">${Array.from(groups)
      .map(
        ([group, items]) => `<div class="shortcut-group"><div class="section-label" style="padding-left:0">${escapeHtml(group)}</div>${items
          .map((c) => `<div class="shortcut-row"><span>${escapeHtml(c.title)}</span><kbd>${escapeHtml(c.keys.split('/')[0])}</kbd></div>`)
          .join('')}</div>`
      )
      .join('')}
      <div class="shortcut-group"><div class="section-label" style="padding-left:0">编辑器</div>
        ${[
          ['加粗 / 斜体 / 下划线', 'Ctrl+B / I / U'],
          ['强调', 'Ctrl+E'],
          ['命令面板', 'Ctrl+K'],
          ['当前文件查找 / 替换', 'Ctrl+F / Ctrl+H'],
          ['跳转到行', 'Ctrl+G'],
          ['插入引用', 'Ctrl+Shift+C'],
          ['反向搜索（PDF → 源码）', '双击 PDF 内容'],
          ['正向搜索（源码 → PDF）', '双击行号']
        ]
          .map(([t, k]) => `<div class="shortcut-row"><span>${t}</span><kbd>${k}</kbd></div>`)
          .join('')}
      </div></div>`;
    modal({ title: '快捷键一览', iconName: 'keyboard', width: 720, height: 'min(80vh, 700px)', body, foot: dialogButton('关闭') });
  }

  /* ------------------------------------------------------------------- misc */
  function openLocalFileViewer(file) {
    toast({ type: 'info', title: '预览暂不可用', body: baseName(file) });
  }

  return {
    modal,
    close: closeModal,
    prompt,
    confirm,
    showText,
    showDiff,
    openTemplates,
    openNewProject,
    openTableWizard,
    openImageDialog,
    openCodeDialog,
    openCitePicker,
    openSymbols,
    openEnvironmentPicker,
    openFontPicker,
    openBibManager,
    openDoiFetch,
    openMarkdownTools,
    openAbout,
    openShortcuts,
    openLocalFileViewer,
    createFromTemplate
  };
}
