// Token LCS preserves unchanged words, whitespace and individual CJK characters.
export function textDiff(before, after) {
  const tokens = value => value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}_]+|\s+|[^\s]/gu) || [];
  function compare(a, b, depth = 0) {
    let start = 0, end = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
    const head = a.slice(0, start).map(text => ({ text, type: 'same' }));
    const tail = end ? a.slice(a.length - end).map(text => ({ text, type: 'same' })) : [];
    const x = a.slice(start, a.length - end), y = b.slice(start, b.length - end);
    if (x.length * y.length > 2000000) {
      if (!depth) return [...head, ...compare(x.join('').split(/(?<=\n)/), y.join('').split(/(?<=\n)/), 1), ...tail];
      return [...head, ...x.map(text => ({ text, type: 'delete' })), ...y.map(text => ({ text, type: 'insert' })), ...tail];
    }
    const width = y.length + 1, table = new Uint32Array((x.length + 1) * width);
    for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) table[i * width + j] = x[i] === y[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    let i = 0, j = 0; const middle = [];
    while (i < x.length || j < y.length) {
      if (i < x.length && j < y.length && x[i] === y[j]) { middle.push({ text: x[i++], type: 'same' }); j++; }
      else if (i < x.length && (j === y.length || table[(i + 1) * width + j] >= table[i * width + j + 1])) middle.push({ text: x[i++], type: 'delete' });
      else middle.push({ text: y[j++], type: 'insert' });
    }
    return [...head, ...middle, ...tail];
  }
  return compare(tokens(String(before)), tokens(String(after)));
}

export function diffHtml(before, after, escape) {
  let left = '', right = '';
  for (const part of textDiff(before, after)) {
    const html = escape(part.text);
    if (part.type === 'same') { left += html; right += html; }
    else if (part.type === 'delete') left += `<span class="diff-delete">${html}</span>`;
    else right += `<span class="diff-insert">${html}</span>`;
  }
  return { left, right };
}
