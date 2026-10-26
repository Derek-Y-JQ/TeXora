/**
 * AI assistant: context building, block / selection actions, diff preview and
 * controlled (non-agent) apply. All model calls go through the main process.
 */
import { ctx } from './ctx.js';
import { $, $$, icon, escapeHtml, toast, copyText, baseName, extOf } from './util.js';
import { stripComment, splitLines } from './latex.js';

export function createAI() {
  let lastRequest = null;

  function stripFences(text) {
    let out = String(text || '').trim();
    const fence = out.match(/^```(?:latex|tex)?\s*\n([\s\S]*?)\n```$/);
    if (fence) out = fence[1];
    out = out.replace(/^```(?:latex|tex)?\s*/i, '').replace(/```$/, '');
    // drop leading prose like "以下是润色后的版本："
    return out.trim();
  }

  function preambleText() {
    const doc = ctx.state.docs.get(ctx.state.activePath);
    if (!doc) return '';
    const text = doc.model.getValue();
    const idx = text.indexOf('\\begin{document}');
    return idx > 0 ? text.slice(0, Math.min(idx, 6000)) : '';
  }

  function contextFor(target) {
    const ai = ctx.state.settings.ai;
    const doc = ctx.state.docs.get(ctx.state.activePath);
    const scope = ai.contextScope || 'file-with-preamble';
    let text = '';
    if (target === 'selection') text = ctx.editor.getSelectionText();
    else if (target === 'block') text = ctx.editor.getCurrentParagraph().text;
    else if (target === 'file' && doc) text = doc.model.getValue().slice(0, 16000);
    if (scope === 'selection' && !text && doc) text = doc.model.getValue().slice(0, 16000);

    const parts = [];
    parts.push(`当前文件：${ctx.state.activePath ? baseName(ctx.state.activePath) : '（未打开）'}`);
    if (ai.includePreamble && (scope === 'file-with-preamble' || scope === 'project')) {
      const pre = preambleText();
      if (pre) parts.push(`文档导言区（自定义宏与宏包）：\n${pre}`);
    }
    if (ai.crossFile && ctx.state.assets.tex?.length) {
      parts.push(`项目中的其他 TeX 文件：${ctx.state.assets.tex.slice(0, 30).join(', ')}`);
    }
    if (ctx.state.parsed?.labels?.length) {
      parts.push(`已定义标签：${ctx.state.parsed.labels.slice(0, 40).map((l) => l.name).join(', ')}`);
    }
    if (ctx.state.bibEntries?.length) {
      parts.push(`可用文献键：${ctx.state.bibEntries.slice(0, 30).map((b) => b.key).join(', ')}`);
    }
    if (text) parts.push(`需要处理的内容：\n<<<\n${text}\n>>>`);
    return { text, prompt: parts.join('\n\n') };
  }

  function ensureConfigured() {
    const ai = ctx.state.settings.ai;
    if (!ai.apiKey) {
      toast({ type: 'warn', title: '尚未配置 AI 服务', body: '请在设置中填写 API Key 与服务商' });
      ctx.cmd('settings.open', 'ai');
      return false;
    }
    return true;
  }

  function resolveAction(actionId) {
    const actions = ctx.state.settings.ai.blockActions || [];
    return actions.find((a) => a.id === actionId);
  }

  async function request({ actionId, target, customPrompt = '', code = '', kind = 'text', images = [] }) {
    if (!ensureConfigured()) return;
    const action = actionId ? resolveAction(actionId) : null;
    const instruction = customPrompt || action?.prompt || '请处理下面的内容。';
    const context = contextFor(target);
    const content = code || context.text;
    const messages = [];
    const userParts = [];
    if (context.prompt && !code) userParts.push(context.prompt);
    if (code) {
      userParts.push(`当前文件：${ctx.state.activePath ? baseName(ctx.state.activePath) : '（未打开）'}`);
      userParts.push(`需要处理的内容：\n<<<\n${code}\n>>>`);
    }
    userParts.push(`任务：${instruction}`);
    if (images.length) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: userParts.join('\n\n') },
          ...images.map((dataUrl) => ({ type: 'image', dataUrl }))
        ]
      });
    } else {
      messages.push({ role: 'user', content: userParts.join('\n\n') });
    }

    const requestId = 'ai-' + Date.now();
    lastRequest = { requestId, actionId, target, instruction, code: content, images, messages };
    ctx.sidebar.pushAiThread({ role: 'user', text: instruction + (content ? `\n\n${content.slice(0, 320)}${content.length > 320 ? '…' : ''}` : ''), time: nowTime() });
    const placeholder = { role: 'assistant', text: '正在生成…', pending: true, time: nowTime() };
    ctx.sidebar.pushAiThread(placeholder);

    const allSkills = ctx.state.settings.ai.skills || [];
    // 润色默认带上内置「去AI味」规则以及用户启用的其他技能
    const skillIds = actionId === 'polish'
      ? allSkills.filter((s) => s.enabled && (s.builtin || s.scope !== 'polish')).map((s) => s.id)
      : undefined;
    try { window.__lastAiRequest = { actionId, skillIds, target, at: Date.now() }; } catch {}
    const res = await ctx.api.ai.chat({ messages, maxTokens: ctx.state.settings.ai.maxTokens, skillIds });
    ctx.sidebar.aiThread = ctx.sidebar.aiThread.filter((m) => m !== placeholder);
    if (!res.ok) {
      ctx.sidebar.pushAiThread({ role: 'assistant', text: `${res.error || '请求失败'}`, error: true, time: nowTime() });
      if (res.code === 'NO_KEY') ctx.cmd('settings.open', 'ai');
      return null;
    }
    const suggestion = stripFences(res.text);
    ctx.sidebar.pushAiThread({
      role: 'assistant',
      text: suggestion.length > 420 ? suggestion.slice(0, 420) + '…' : suggestion,
      time: nowTime()
    });
    showResult({ title: action ? action.label : 'AI 建议', instruction, original: content, suggestion, kind, requestId });
    return { suggestion, res };
  }

  function showResult({ title, instruction, original, suggestion, kind, requestId }) {
    const isCode = /\\[a-zA-Z]+|\\begin\{/.test(suggestion) || kind === 'code';
    const body = `
      <div class="ai-result">
        <div class="ai-result-note">${icon('sparkles')}<span>${escapeHtml(instruction)}</span></div>
        <div class="diff-grid">
          ${original ? `<div class="diff-pane removed"><div class="diff-pane-head">${icon('code')}修改前</div><pre>${escapeHtml(original)}</pre></div>` : ''}
          <div class="diff-pane added"><div class="diff-pane-head">${icon('check')}${isCode ? '建议的 LaTeX 源码' : 'AI 回复'}</div><pre>${escapeHtml(suggestion)}</pre></div>
        </div>
      </div>`;
    const foot = `
      <button class="btn btn-sm" data-btn="close">关闭</button>
      <span class="spacer"></span>
      <button class="btn btn-sm" data-btn="regen">${icon('refresh')}重新生成</button>
      <button class="btn btn-sm" data-btn="copy">${icon('copy')}复制</button>
      <button class="btn btn-sm" data-btn="insert">${icon('plus')}插入到下方</button>
      ${original ? `<button class="btn btn-sm btn-primary" data-btn="replace">${icon('check')}替换</button>` : `<button class="btn btn-sm btn-primary" data-btn="insertCursor">${icon('plus')}插入到光标处</button>`}`;
    const m = ctx.dialogs.modal({
      title: 'AI 建议 · ' + title,
      subtitle: '受控模式：不会自动修改文件，确认后方可替换',
      iconName: 'sparkles',
      width: 900,
      height: 'min(80vh, 700px)',
      body,
      foot,
      onMount: ({ root, close }) => {
        root.querySelector('[data-btn="close"]').addEventListener('click', close);
        root.querySelector('[data-btn="copy"]').addEventListener('click', async () => {
          await copyText(suggestion);
          toast({ type: 'success', title: '已复制建议内容' });
        });
        root.querySelector('[data-btn="regen"]').addEventListener('click', async () => {
          close();
          if (!lastRequest) return;
          await request({ actionId: lastRequest.actionId, target: lastRequest.target, customPrompt: lastRequest.instruction, code: lastRequest.code });
        });
        root.querySelector('[data-btn="insert"]')?.addEventListener('click', () => {
          close();
          insertBelow(original, suggestion);
        });
        root.querySelector('[data-btn="replace"]')?.addEventListener('click', () => {
          close();
          replaceOriginal(original, suggestion);
        });
        root.querySelector('[data-btn="insertCursor"]')?.addEventListener('click', () => {
          close();
          ctx.editor.insertText(suggestion);
        });
      }
    });
    return m;
  }

  function nowTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function applyRangeEdit(original, replacement, mode) {
    const ed = ctx.editor;
    const model = ed?.model;
    if (!model) return;
    const idx = model.getValue().indexOf(original);
    if (mode === 'replace') {
      if (idx < 0) {
        toast({ type: 'warn', title: '原文已变化', body: '无法定位原始内容，已改为插入到光标处' });
        ed.insertText(replacement);
        return;
      }
      const start = model.getPositionAt(idx);
      const end = model.getPositionAt(idx + original.length);
      const range = {
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column
      };
      ed.editor.executeEdits('texora-ai', [{ range, text: replacement, forceMoveMarkers: true }]);
      ed.editor.focus();
      toast({ type: 'success', title: '已替换为 AI 建议' });
    } else {
      insertBelow(original, replacement);
    }
  }

  function replaceOriginal(original, suggestion) {
    applyRangeEdit(original, suggestion, 'replace');
  }

  function insertBelow(original, suggestion) {
    const ed = ctx.editor;
    const model = ed?.model;
    if (!model) return;
    let line = ed.editor.getPosition().lineNumber;
    if (original) {
      const idx = model.getValue().indexOf(original);
      if (idx >= 0) line = model.getPositionAt(idx + original.length).lineNumber;
    }
    const content = '\n' + suggestion + '\n';
    ed.editor.executeEdits('texora-ai-insert', [
      { range: { startLineNumber: line, startColumn: model.getLineContent(line).length + 1, endLineNumber: line, endColumn: model.getLineContent(line).length + 1 }, text: content }
    ]);
    ed.editor.focus();
    toast({ type: 'success', title: '已插入到下方' });
  }

  /* -------------------------------------------------------------- actions */
  async function runBlockAction({ actionId, block }) {
    const targetBlock = block || ctx.editor.getCurrentParagraph();
    if (!targetBlock || !targetBlock.text) return toast({ type: 'warn', title: '当前块为空' });
    await request({ actionId, target: 'block', code: targetBlock.text });
  }

  async function runSelectionAction({ actionId }) {
    const text = ctx.editor.getSelectionText();
    if (!text) return toast({ type: 'warn', title: '请先选择一段源码' });
    await request({ actionId, target: 'selection', code: text });
  }

  async function runCustom({ target }) {
    const scope = target === 'selection' ? 'selection' : 'block';
    const text = scope === 'selection' ? ctx.editor.getSelectionText() : ctx.editor.getCurrentParagraph().text;
    if (!text) return toast({ type: 'warn', title: scope === 'selection' ? '请先选择内容' : '当前块为空' });
    const prompt = await ctx.dialogs.prompt({
      title: '自定义 AI 指令',
      label: '告诉 AI 你想做什么',
      value: '',
      confirmText: '执行',
      placeholder: '例如：把这段改写成更精炼的学术表达，保持公式不变',
      multiline: true
    });
    if (!prompt) return;
    await request({ target: scope, customPrompt: prompt, code: text });
  }

  async function explainSelection() {
    const text = ctx.editor.getSelectionText() || ctx.editor.getCurrentParagraph().text;
    if (!text) return toast({ type: 'warn', title: '请先选择内容' });
    await request({
      target: 'selection',
      code: text,
      customPrompt: '请解释这段 LaTeX 源码 / 公式的数学含义与作用，指出潜在的问题（如未定义命令、符号冲突），不必重写内容。'
    });
  }

  async function polishParagraph() {
    const block = ctx.editor.getCurrentParagraph();
    await request({ actionId: 'polish', target: 'block', code: block.text });
  }

  async function translateSelection() {
    const text = ctx.editor.getSelectionText() || ctx.editor.getCurrentParagraph().text;
    if (!text) return toast({ type: 'warn', title: '请先选择内容' });
    await request({
      target: 'selection',
      code: text,
      customPrompt:
        '请进行中英学术互译：若原文为中文则译为地道学术英文，若为英文则译为学术中文。必须完整保留所有 LaTeX 命令、数学公式、\\cite / \\ref 键与花括号结构。'
    });
  }

  async function tableFromText() {
    const text = ctx.editor.getSelectionText() || (await ctx.api.clipboard.readText()).text || '';
    if (!text.trim()) return toast({ type: 'warn', title: '请选择文本或先复制表格数据' });
    await request({
      target: 'selection',
      code: text,
      customPrompt:
        '请把下面的表格数据转换为 LaTeX 学术三线表（booktabs：\\toprule / \\midrule / \\bottomrule），包含 caption 与 label，列对齐方式合理。只输出 LaTeX 代码。'
    });
  }

  async function ocrFromClipboard() {
    const clip = await ctx.api.clipboard.readImage();
    if (!clip.ok) {
      return toast({ type: 'warn', title: '剪贴板中没有图片', body: '先用截图工具复制公式或表格截图，再点击此按钮' });
    }
    if (!ensureConfigured()) return;
    const model = ctx.state.settings.ai.ocrModel || ctx.state.settings.ai.model;
    const res = await ctx.api.ai.chat({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '请把图片中的数学公式或表格转换为 LaTeX 源码。只输出 LaTeX，公式用 $...$ 或 equation 环境，表格用 booktabs。' },
            { type: 'image', dataUrl: clip.dataUrl }
          ]
        }
      ]
    });
    if (!res.ok) {
      toast({ type: 'error', title: 'OCR 失败', body: res.error, timeout: 6000 });
      return;
    }
    const suggestion = stripFences(res.text);
    showResult({ title: '截图转 LaTeX', instruction: '识别剪贴板截图中的公式/表格', original: '', suggestion, kind: 'code' });
  }

  async function freeform({ prompt }) {
    if (!prompt) return;
    if (!ensureConfigured()) return;
    const target = ctx.editor.getSelectionText() ? 'selection' : 'block';
    await request({ target, customPrompt: prompt, code: ctx.editor.getSelectionText() || ctx.editor.getCurrentParagraph().text || '' });
  }

  async function fixProblems() {
    if (!ctx.state.problems?.length) return toast({ type: 'info', title: '当前没有编译错误' });
    const errors = ctx.state.problems.filter((p) => p.severity === 'error').slice(0, 6);
    if (!errors.length) return toast({ type: 'info', title: '没有 error 级别的错误' });
    const doc = ctx.state.docs.get(ctx.state.activePath);
    const lines = doc ? splitLines(doc.model.getValue()) : [];
    const sourceContext = errors
      .map((e) => {
        const ln = Math.max(1, e.line || 1);
        const snippet = lines.slice(Math.max(0, ln - 3), ln + 2).map((l, i) => `${Math.max(1, ln - 2) + i}: ${l}`).join('\n');
        return `错误：${e.message}\n位置：${e.file || ''}:${ln}\n源码上下文：\n${snippet}`;
      })
      .join('\n\n');
    const logTail = (ctx.state.log || '').slice(-3000);
    const prompt = `编译失败，请诊断原因并给出可直接替换的最小修复代码。\n\n${sourceContext}\n\n编译日志片段：\n${logTail}\n\n请先简要说明原因，再用代码块给出修复后的相关源码片段。`;
    const res = await ctx.api.ai.chat({ messages: [{ role: 'user', content: prompt }] });
    if (!res.ok) return toast({ type: 'error', title: 'AI 诊断失败', body: res.error });
    showResult({
      title: '编译错误诊断',
      instruction: '结合 .log 与源码给出修复方案',
      original: '',
      suggestion: res.text,
      kind: 'text'
    });
  }

  function resultAction() {
    /* results are handled inside the result dialog */
  }

  function openAssistant() {
    ctx.sidebar.show('ai');
    setTimeout(() => ctx.sidebar.panels.ai?.querySelector('#aiPrompt')?.focus(), 60);
  }

  return {
    runBlockAction,
    runSelectionAction,
    runCustom,
    explainSelection,
    polishParagraph,
    translateSelection,
    tableFromText,
    ocrFromClipboard,
    freeform,
    fixProblems,
    resultAction,
    openAssistant,
    showResult
  };
}
