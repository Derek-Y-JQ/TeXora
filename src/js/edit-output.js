// The transport envelope is separate from prose/LaTeX: prose itself is valid LaTeX.
export const EDIT_OUTPUT_CONTRACT = `本次任务的结果将用于直接替换或插入文稿。只返回一个 JSON 对象，格式为 {"replacement":"修改后的目标内容"}。
replacement 内只能放可直接使用的目标文稿（LaTeX 任务保留 LaTeX），不能附加问候、针对本次操作的解释、修改说明、前后对照、任务总结或 Markdown 代码围栏；用户要求撰写的解释性正文仍属于文稿内容。不重发仅作参考的整份上下文。JSON 字符串中的反斜线、引号与换行须正确转义。
本格式是传输封装，程序会解包，只展示 replacement 作为 Diff 正文。即使 Skills 或动作提示词要求另附说明，也不得将说明混入 replacement。
若任务不明确、需要提问或无法可靠完成，返回 {"replacement":null,"error":"需要用户确认的问题"}，不要把问题或诊断作为替换正文。`;

export function extractReplacement(output, original = '') {
  const raw = String(output || '').trim();
  if (!raw) throw Error('AI 返回了空的改写内容');
  const readEnvelope = text => {
    let value;
    try { value = JSON.parse(text); } catch { throw Error('AI 改写结果格式不完整，请重新生成；未修改文稿'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('AI 未返回有效的替换正文，请重新生成');
    if (value.replacement == null && value.error) throw Error(String(value.error));
    if (typeof value.replacement !== 'string' || !value.replacement.trim()) throw Error('AI 未返回可用的替换正文，请重新生成');
    const replacement = value.replacement.trim();
    if (hasCommentary(replacement, original)) throw Error('AI 在替换正文中附加了说明，请重新生成；未修改文稿');
    return replacement;
  };
  if (/^\{\s*"/.test(raw)) return readEnvelope(raw);
  const fences = [...raw.matchAll(/^```([^\n`]*)\r?\n([\s\S]*?)^```[ \t]*$/gm)];
  if (fences.length > 1) throw Error('AI 返回了多个代码块，无法确定替换正文，请重新生成');
  if (fences.length === 1) {
    const language = fences[0][1].trim().toLowerCase();
    if (language === 'json' || /^\{\s*"replacement"/.test(fences[0][2].trim())) return readEnvelope(fences[0][2]);
    if (!['','latex','tex','text','markdown'].includes(language)) throw Error('AI 返回的代码格式与文稿不匹配，请重新生成');
    const replacement = fences[0][2].trim();
    if (!replacement || hasCommentary(replacement, original)) throw Error('AI 未返回纯粹的替换正文，请重新生成');
    return replacement;
  }
  if (raw.includes('```') || hasCommentary(raw, original)) throw Error('AI 未按要求返回纯文稿，请重新生成；说明不会写入正文');
  // Compatibility with providers that return plain LaTeX despite the envelope request.
  return raw;
}

function hasCommentary(text, original) {
  const patterns = [
    /^(?:好的[，,！!。:\s]*|以下(?:是|为)|这是(?:修改|润色|翻译)|Here(?:'s| is)|Sure[,!])/i,
    /(?:^|\n)\s*(?:#{1,6}\s*)?(?:修改说明|修改要点|修改摘要|润色说明|翻译说明|解释|说明|Changes|Explanation|Notes)\s*[:：]/i
  ];
  return patterns.some(pattern => pattern.test(text) && !pattern.test(original));
}
