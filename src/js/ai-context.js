export function contextPolicy(ai = {}) {
  const scope = ai.contextScope || 'file-with-preamble';
  return {
    scope,
    file: scope !== 'selection',
    preamble: !!ai.includePreamble && ['file-with-preamble', 'project'].includes(scope),
    otherFiles: scope === 'project' && !!ai.crossFile
  };
}

/** Shared by sidebar, block and selection requests. Settings are an upper bound. */
export async function buildAIContext({ ai, fileName = '', fileText = '', preamble = '', targetText = '', attachments, readFile = async () => '', skills = [], actionId }) {
  const policy = contextPolicy(ai);
  if (attachments?.skillIds?.some(id => !skills.some(s => s.id === id))) throw new Error('所选 Skills 已被移除，请重新选择');
  const selectedSkills = attachments?.skillIds == null
    ? skills.filter(s => s.enabled && (s.scope !== 'polish' || actionId === 'polish'))
    : skills.filter(s => attachments.skillIds.includes(s.id));
  const parts = [];
  const sources = [];
  let budget = 48000;
  const add = (title, content, cap = 16000) => {
    if (!content || budget <= 0) return;
    const limit = Math.min(budget, cap);
    const clipped = content.slice(0, limit);
    parts.push(`${title}：\n<<<\n${clipped}${content.length > limit ? '\n[此参考上下文已截断]' : ''}\n>>>`);
    sources.push(title);
    budget -= clipped.length;
  };
  if (fileName) parts.push(`目标文件：${fileName}`);
  // Reserve space for the actual edit target before optional reference material.
  add('需要处理的内容', targetText, 24000);
  if (policy.file && attachments?.file !== false && fileText !== targetText) add('当前文件（参考上下文）', fileText);
  if (policy.preamble && attachments?.file !== false && preamble && !fileText.includes(preamble)) add('主文档导言区（宏与宏包）', preamble, 6000);
  if (policy.otherFiles) {
    const files = [...new Set(attachments?.files || [])].slice(0, 8);
    for (const [index, file] of files.entries()) {
      if (budget <= 0) break;
      const content = await readFile(file);
      add(`其他文件 ${file}`, content || '（空文件）', Math.min(8000, Math.floor(budget / (files.length - index))));
    }
  }
  if (selectedSkills.length) parts.push('本次遵循的 Skills：' + selectedSkills.map(s => s.name || s.id).join('、'));
  return { prompt: parts.join('\n\n'), sources, skillIds: selectedSkills.map(s => s.id), targetTruncated: targetText.length > 24000, policy };
}
