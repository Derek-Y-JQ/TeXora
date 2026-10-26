import { ctx } from './ctx.js';
import { icon, escapeHtml, toast, copyText, baseName } from './util.js';
import { buildAIContext, contextPolicy } from './ai-context.js';

const samePath = (a, b) => String(a || '').replace(/\\/g, '/').toLowerCase() === String(b || '').replace(/\\/g, '/').toLowerCase();
const time = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

export function createAI() {
  const records = new Map();
  let active = null, historyGeneration = 0;

  function ensureConfigured() {
    if (ctx.state.settings.ai.apiKey) return true;
    toast({ type: 'warn', title: '尚未配置 AI 服务', body: '请在设置中填写 API Key 与服务商' });
    ctx.cmd('settings.open', 'ai');
    return false;
  }

  function snapshot(original, target, block) {
    const editor = ctx.editor.editor, model = ctx.editor.model;
    const position = editor?.getPosition() || { lineNumber: 1, column: 1 };
    let range = null;
    if (model && original) {
      const selected = editor.getSelection();
      if (target === 'selection' && selected && model.getValueInRange(selected) === original) range = { ...selected };
      if (!range && block) range = { startLineNumber: block.startLine, startColumn: 1, endLineNumber: block.endLine, endColumn: model.getLineMaxColumn(block.endLine) };
      if (range && model.getValueInRange(range) !== original) range = null;
      if (!range) {
        const text = model.getValue(), index = text.indexOf(original);
        if (index >= 0 && text.indexOf(original, index + 1) < 0) {
          const a = model.getPositionAt(index), b = model.getPositionAt(index + original.length);
          range = { startLineNumber: a.lineNumber, startColumn: a.column, endLineNumber: b.lineNumber, endColumn: b.column };
        }
      }
    }
    const offset = model ? model.getOffsetAt(position) : 0;
    const value = model?.getValue() || '';
    return { range, position, offset, before: value.slice(Math.max(0, offset - 80), offset), after: value.slice(offset, offset + 80) };
  }

  async function readSource(path) {
    const doc = [...ctx.state.docs.entries()].find(([key]) => samePath(key, path))?.[1];
    if (doc) return doc.model.getValue();
    const result = await ctx.api.fs.read(path);
    if (!result.ok || result.binary) throw new Error('无法读取上下文文件：' + path);
    return result.text || '';
  }

  async function context(options, sourcePath) {
    const ai = ctx.state.settings.ai;
    const policy = contextPolicy(ai);
    let fileText = '', preamble = '';
    if (policy.file && options.attachments?.file !== false && sourcePath) fileText = await readSource(sourcePath);
    if (policy.preamble && options.attachments?.file !== false && ctx.state.project.rootFile) {
      const rootText = samePath(sourcePath, ctx.state.project.rootFile) ? fileText : await readSource(ctx.state.project.rootFile);
      const index = rootText.indexOf('\\begin{document}');
      if (index >= 0) preamble = rootText.slice(0, index);
    }
    const allowed = new Set((ctx.state.assets.all || []).filter(p => /\.(tex|ltx|sty|cls|bib|md|txt)$/i.test(p)));
    return buildAIContext({
      ai, fileName: baseName(sourcePath || ''), fileText, preamble, targetText: options.code || '', attachments: options.attachments,
      actionId: options.actionId, skills: ai.skills || [],
      readFile: async file => {
        if (!allowed.has(file)) throw new Error('所选文件已不在当前项目中，请重新选择：' + file);
        return readSource(ctx.state.project.root + '/' + file);
      }
    });
  }

  async function saveRecord(record) {
    const res = await ctx.api.ai.historySave(record);
    if (!res.ok) toast({ type: 'warn', title: 'AI 历史保存失败', body: res.error });
  }

  function appendRecord(record) {
    records.set(record.id, record);
    ctx.sidebar.pushAiThread({ role: 'assistant', text: record.suggestion, resultId: record.id, applied: record.applied, time: record.time });
  }

  async function loadHistory() {
    const generation = ++historyGeneration, root = ctx.state.project.root || '';
    records.clear();
    ctx.sidebar.aiThread = [];
    ctx.sidebar.renderAiThread();
    try {
      const result = await ctx.api.ai.historyList(root);
      if (generation !== historyGeneration || !samePath(root, ctx.state.project.root)) return;
      const live = new Map(records);
      ctx.sidebar.aiThread = ctx.sidebar.aiThread.filter(m => !m.resultId && m.pending);
      for (const record of result.records || []) {
        if (live.has(record.id)) continue;
        ctx.sidebar.pushAiThread({ role: 'user', text: record.instruction, time: record.time });
        appendRecord(record);
      }
      for (const record of live.values()) appendRecord(record);
    } catch (err) { toast({ type: 'warn', title: 'AI 历史读取失败', body: err.message }); }
  }

  async function request(options = {}) {
    if (active) { toast({ type: 'info', title: 'AI 正在处理上一条请求', body: '完成或取消后可再次发送' }); return null; }
    if (!ensureConfigured()) return null;
    const action = ctx.state.settings.ai.blockActions?.find(a => a.id === options.actionId);
    const instruction = options.customPrompt || action?.prompt || '请处理所附内容。';
    const id = 'ai-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
    const sourcePath = options.sourceRecord?.sourcePath ?? ctx.state.activePath;
    const projectRoot = ctx.state.project.root || '';
    const original = options.code || '';
    const origin = options.sourceRecord?.snapshot || snapshot(original, options.target, options.block);
    const placeholder = { role: 'assistant', text: '正在生成…', pending: true, time: time() };
    active = { id, projectRoot, cancelled: false };
    ctx.state.aiBusy = true;
    ctx.sidebar.refreshAiContext();
    ctx.sidebar.pushAiThread({ role: 'user', text: instruction, time: time() });
    ctx.sidebar.pushAiThread(placeholder);
    try {
      const built = await context(options, sourcePath);
      if (active?.cancelled) return null;
      const userPrompt = [built.prompt, `任务（用户指令）：\n${instruction}`].filter(Boolean).join('\n\n');
      const images = options.images || [];
      const messages = [{ role: 'user', content: images.length ? [{ type: 'text', text: userPrompt }, ...images.map(dataUrl => ({ type: 'image', dataUrl }))] : userPrompt }];
      const res = await ctx.api.ai.chat({ requestId: id, messages, skillIds: built.skillIds, model: options.model, maxTokens: ctx.state.settings.ai.maxTokens });
      if (!samePath(projectRoot, ctx.state.project.root) || active?.cancelled || res.code === 'CANCELLED') return null;
      if (!res.ok) throw new Error(res.error || 'AI 请求失败');
      // Strip only a single complete enclosing code fence; never cut mixed prose/code.
      let suggestion = String(res.text || '').trim();
      const fenced = suggestion.match(/^```(?:latex|tex)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
      if (fenced) suggestion = fenced[1];
      if (!suggestion.trim()) throw new Error('AI 返回了空内容，请重试');
      const record = {
        id, projectRoot, sourcePath, title: options.title || action?.label || 'AI 建议', instruction, original, suggestion,
        kind: options.kind || 'text', snapshot: origin, time: time(), applied: false,
        incomplete: !!res.incomplete || built.targetTruncated,
        request: { actionId: options.actionId, target: options.target, attachments: options.attachments, hasImages: images.length > 0, model: options.model },
        _images: images
      };
      appendRecord(record);
      await saveRecord(record);
      if (!document.querySelector('#modalLayer.open')) showResult(record);
      else toast({ type: 'success', title: 'AI 建议已生成', body: '可在侧栏历史消息中打开查看' });
      return { suggestion, res, record };
    } catch (err) {
      if (!active?.cancelled && samePath(projectRoot, ctx.state.project.root)) ctx.sidebar.pushAiThread({ role: 'assistant', text: err.message || '请求失败', error: true, time: time() });
      return null;
    } finally {
      ctx.sidebar.aiThread = ctx.sidebar.aiThread.filter(m => m !== placeholder);
      active = null;
      ctx.state.aiBusy = false;
      ctx.sidebar.renderAiThread();
      ctx.sidebar.refreshAiContext();
    }
  }

  async function cancel() {
    if (!active) return;
    active.cancelled = true;
    try { await ctx.api.ai.cancel(active.id); } catch {}
  }

  async function apply(record, mode) {
    if (record.applied || record._applying || record.incomplete) return false;
    if (!samePath(record.projectRoot, ctx.state.project.root) || !record.sourcePath) {
      toast({ type: 'warn', title: '请先打开原项目和目标文件', body: '此建议不会写入其他文件' }); return false;
    }
    record._applying = true;
    try {
      await ctx.app.openDocument(record.sourcePath);
      if (!samePath(ctx.state.activePath, record.sourcePath)) throw new Error('目标文件无法打开');
      const editor = ctx.editor.editor, model = ctx.editor.model;
      let range = record.snapshot.range;
      if (record.original) {
        if (!range || model.getValueInRange(range) !== record.original) {
          const value = model.getValue(), index = value.indexOf(record.original);
          if (index < 0 || value.indexOf(record.original, index + 1) >= 0) throw new Error('原文已变化或存在多个匹配，请重新生成建议');
          const start = model.getPositionAt(index), end = model.getPositionAt(index + record.original.length);
          range = { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column };
        }
      } else {
        const { offset, before, after } = record.snapshot;
        const value = model.getValue();
        if (value.slice(Math.max(0, offset - before.length), offset) !== before || value.slice(offset, offset + after.length) !== after) throw new Error('原插入位置已变化，请重新生成建议');
        const position = model.getPositionAt(offset);
        range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: position.column, endColumn: position.column };
      }
      let editRange = range, text = record.suggestion;
      if (mode === 'insert') {
        const line = range.endLineNumber, column = model.getLineMaxColumn(line);
        editRange = { startLineNumber: line, endLineNumber: line, startColumn: column, endColumn: column };
        text = '\n' + text + '\n';
      }
      editor.pushUndoStop();
      editor.executeEdits('texora-ai', [{ range: editRange, text, forceMoveMarkers: true }]);
      editor.pushUndoStop();
      record.applied = true;
      record.appliedMode = mode;
      record.appliedText = record.suggestion;
      for (const message of ctx.sidebar.aiThread) if (message.resultId === record.id) message.applied = true;
      await saveRecord(record);
      ctx.sidebar.renderAiThread();
      toast({ type: 'success', title: mode === 'replace' ? '已替换为 AI 建议' : '已添加 AI 建议' });
      return true;
    } catch (err) { toast({ type: 'warn', title: '未修改文档', body: err.message }); return false; }
    finally { record._applying = false; }
  }

  function showResult(record) {
    if (!record?.suggestion) return;
    const applied = !!record.applied;
    const body = `<div class="ai-result" data-result-id="${escapeHtml(record.id)}">
      <div class="ai-result-note">${icon(applied ? 'check' : 'sparkles')}<span>${applied ? '已修改 · ' : ''}${escapeHtml(record.instruction)}</span></div>
      <div class="field-hint">目标文件：${escapeHtml(record.sourcePath || '未打开文件')}</div>
      ${record.incomplete && !applied ? '<div class="ai-result-warning">输出或目标上下文已达到长度上限，暂不可应用。请缩小选区或提高输出上限后重新生成。</div>' : ''}
      <div class="diff-grid${applied ? ' applied' : ''}">
      ${!applied && record.original ? `<div class="diff-pane removed"><div class="diff-pane-head">${icon('code')}修改前</div><pre>${escapeHtml(record.original)}</pre></div>` : ''}
      <div class="diff-pane added"><div class="diff-pane-head">${icon('check')}${applied ? '已修改 · 应用后的内容' : 'AI 建议'}</div><pre>${escapeHtml(applied ? record.appliedText || record.suggestion : record.suggestion)}</pre></div></div></div>`;
    return ctx.dialogs.modal({
      title: `${applied ? '已修改' : 'AI 建议'}${record.title === 'AI 建议' ? '' : ' · ' + record.title}`, subtitle: applied ? '此记录已应用到文档，不会重复插入或替换' : '先预览差异，再决定是否修改原文件',
      iconName: applied ? 'check' : 'sparkles', width: 900, height: 'min(80vh, 700px)', body,
      foot: `<button class="btn btn-sm" data-btn="close">关闭</button><span class="spacer"></span><button class="btn btn-sm" data-btn="copy">${icon('copy')}复制</button>${applied ? '' : `<button class="btn btn-sm" data-btn="regen">${icon('refresh')}重新生成</button><button class="btn btn-sm" data-btn="insert" ${record.incomplete || !record.sourcePath ? 'disabled' : ''}>${icon('plus')}插入到下方</button>${record.original ? `<button class="btn btn-sm btn-primary" data-btn="replace" ${record.incomplete || !record.snapshot.range ? 'disabled' : ''}>${icon('check')}替换</button>` : `<button class="btn btn-sm btn-primary" data-btn="insertCursor" ${record.incomplete || !record.sourcePath ? 'disabled' : ''}>${icon('plus')}插入到原光标处</button>`}`}`,
      onMount: ({ root, close }) => {
        root.querySelector('[data-btn="close"]').onclick = close;
        root.querySelector('[data-btn="copy"]').onclick = () => copyText(record.appliedText || record.suggestion);
        root.querySelector('[data-btn="regen"]')?.addEventListener('click', () => {
          if (!samePath(record.projectRoot, ctx.state.project.root)) return toast({ type: 'warn', title: '请先打开原项目' });
          if (active) return toast({ type: 'info', title: '请等待当前请求完成' });
          if (record.request?.hasImages && !record._images?.length) return toast({ type: 'info', title: '请重新复制截图后执行 OCR', body: '历史记录不会保存原始截图' });
          close();
          request({ ...record.request, images: record._images, customPrompt: record.instruction, code: record.original, sourceRecord: record, title: record.title });
        });
        for (const button of root.querySelectorAll('[data-btn="replace"], [data-btn="insert"], [data-btn="insertCursor"]')) button.onclick = async () => {
          button.disabled = true;
          const ok = await apply(record, button.dataset.btn === 'replace' ? 'replace' : button.dataset.btn === 'insert' ? 'insert' : 'cursor');
          if (ok) { close(); showResult(record); } else button.disabled = false;
        };
      }
    });
  }

  function resultAction({ id, index } = {}) {
    const record = records.get(id || ctx.sidebar.aiThread[index]?.resultId);
    if (record) showResult(record);
    else toast({ type: 'warn', title: '此消息没有可查看的建议' });
  }

  function freeform({ prompt, attachments } = {}) {
    if (!String(prompt || '').trim()) return null;
    const spec = attachments || ctx.sidebar.aiAttachments();
    const selected = spec.selection ? ctx.editor.getSelectionText() : '';
    const block = spec.file !== false ? ctx.editor.getCurrentParagraph() : null;
    const code = selected || block?.text || '';
    return request({ target: selected ? 'selection' : 'block', block: selected ? null : block, code, customPrompt: prompt, attachments: spec });
  }

  const runBlockAction = ({ actionId, block } = {}) => {
    block ||= ctx.editor.getCurrentParagraph();
    if (!block?.text) return toast({ type: 'warn', title: '当前块为空' });
    return request({ actionId, target: 'block', block, code: block.text });
  };
  const runSelectionAction = ({ actionId } = {}) => {
    const code = ctx.editor.getSelectionText();
    return code ? request({ actionId, target: 'selection', code }) : toast({ type: 'warn', title: '请先选择源码' });
  };
  async function runCustom({ target, block } = {}) {
    const code = target === 'selection' ? ctx.editor.getSelectionText() : (block || ctx.editor.getCurrentParagraph()).text;
    if (!code) return toast({ type: 'warn', title: '请先选择内容' });
    const prompt = await ctx.dialogs.prompt({ title: '自定义 AI 指令', label: '告诉 AI 你想做什么', multiline: true, confirmText: '执行' });
    if (prompt) return request({ target, block, code, customPrompt: prompt });
  }
  async function ocrFromClipboard() {
    const clip = await ctx.api.clipboard.readImage();
    if (!clip.ok) return toast({ type: 'warn', title: '剪贴板中没有图片' });
    return request({ title: '截图转 LaTeX', target: 'selection', code: '', kind: 'code', images: [clip.dataUrl], model: ctx.state.settings.ai.ocrModel || ctx.state.settings.ai.model, customPrompt: '把图片中的公式或表格转换为 LaTeX，只输出源码。' });
  }
  function fixProblems() {
    const errors = (ctx.state.problems || []).filter(e => e.severity === 'error').slice(0, 6);
    if (!errors.length) return toast({ type: 'info', title: '当前没有编译错误' });
    return request({ title: '编译错误诊断', customPrompt: '请诊断编译错误并给出最小修复建议：\n' + errors.map(e => `${e.message}（${e.line || 1} 行）`).join('\n') + '\n日志：\n' + (ctx.state.log || '').slice(-3000), code: ctx.editor.getCurrentParagraph().text, target: 'block' });
  }
  const selectedRequest = customPrompt => request({ target: 'selection', code: ctx.editor.getSelectionText() || ctx.editor.getCurrentParagraph().text, customPrompt });
  ctx.on('project:changed', () => { cancel(); loadHistory(); });
  queueMicrotask(() => { if (!ctx.state.project.root) loadHistory(); });
  return {
    request, freeform, runBlockAction, runSelectionAction, runCustom, ocrFromClipboard, fixProblems, resultAction, showResult, loadHistory, cancel,
    openAssistant: () => { ctx.sidebar.show('ai'); ctx.sidebar.panels.ai.querySelector('#aiPrompt')?.focus(); },
    explainSelection: () => selectedRequest('解释所附内容的含义，不重写源码。'),
    polishParagraph: () => runBlockAction({ actionId: 'polish' }),
    translateSelection: () => selectedRequest('将所附内容进行中英学术互译，保留公式、命令和引用。'),
    tableFromText: () => selectedRequest('把所附数据转换为 booktabs 三线表 LaTeX 源码。')
  };
}
