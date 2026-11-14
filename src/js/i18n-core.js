/** Shared matcher: exact keys, `{n}` patterns built from the source templates, then known prefixes/suffixes.
 *  Generated into src/js/i18n-core.js (ESM) and electron/lib/i18n-core.js (CommonJS); edit both together. */
const CJK = /[㐀-鿿]/;
function createTranslator(dict) {
  const exact = new Map();
  const patterns = [];
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [key, value] of Object.entries(dict || {})) {
    if (!/\{\d+\}/.test(key)) { exact.set(key, value); continue; }
    const parts = key.split(/\{(\d+)\}/);
    const literal = parts.filter((_, i) => i % 2 === 0).join('');
    // A leading hole usually stands for an icon element, so the rest is also a complete text node.
    if (parts[0] === '' && parts.length === 3 && !exact.has(parts[2].trim())) exact.set(parts[2].trim(), value.replace(/^\{\d+\}\s?/, ''));
    if ((literal.match(/[㐀-鿿]/g) || []).length < 2) continue;
    const order = [];
    let source = '^';
    let anchor = '';
    parts.forEach((part, i) => {
      if (i % 2) { source += '([\\s\\S]*?)'; order.push(Number(part)); }
      else { source += esc(part).replace(/ /g, '\\s*'); if (part.trim().length > anchor.length) anchor = part.trim(); }
    });
    patterns.push({ re: new RegExp(source + '$'), order, value, anchor, weight: literal.length });
  }
  patterns.sort((a, b) => b.weight - a.weight);
  const cache = new Map();
  // Translate a fragment while keeping the whitespace that separated it from its neighbour.
  const inner = (part) => { const r = translate(part.trim()); return r == null ? part : part.match(/^\s*/)[0] + r + part.match(/\s*$/)[0]; };
  function affix(text) {
    for (let n = Math.min(text.length - 1, 48); n >= 2; n--) {
      const head = text.slice(0, n);
      if (exact.has(head) && CJK.test(head)) return exact.get(head) + inner(text.slice(n));
      const tail = text.slice(text.length - n);
      if (exact.has(tail) && CJK.test(tail)) return inner(text.slice(0, text.length - n)) + exact.get(tail);
    }
    return null;
  }
  /** Returns the translation of a whitespace-normalised string, or null when nothing applies. */
  function translate(text) {
    if (!text || !CJK.test(text)) return null;
    if (cache.has(text)) return cache.get(text);
    let out = exact.has(text) ? exact.get(text) : null;
    if (out == null) {
      for (const p of patterns) {
        if (p.anchor && !text.includes(p.anchor)) continue;
        const m = p.re.exec(text);
        if (!m) continue;
        out = p.value.replace(/\{(\d+)\}/g, (_, n) => inner(m[p.order.indexOf(Number(n)) + 1] ?? ''));
        break;
      }
    }
    if (out == null) out = affix(text);
    if (cache.size > 6000) cache.clear();
    cache.set(text, out);
    return out;
  }
  return translate;
}
export { createTranslator };
