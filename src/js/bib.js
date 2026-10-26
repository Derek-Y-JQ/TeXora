/**
 * Small BibTeX parser / serialiser used by the citation picker, hovers,
 * the label panel and the .bib card view.
 */

function readBraced(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') { i++; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { value: text.slice(start + 1, i), end: i + 1 };
    }
  }
  return { value: text.slice(start + 1), end: text.length };
}

function cleanValue(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .replace(/[{}]/g, '')
    .trim();
}

export function parseBib(text) {
  const entries = [];
  if (!text) return entries;
  const re = /@(\w+)\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const type = m[1].toLowerCase();
    if (type === 'comment' || type === 'string' || type === 'preamble') continue;
    const braceStart = re.lastIndex - 1;
    const { value, end } = readBraced(text, braceStart);
    re.lastIndex = end;
    const commaIdx = value.indexOf(',');
    if (commaIdx < 0) continue;
    const key = value.slice(0, commaIdx).trim();
    const body = value.slice(commaIdx + 1);
    const fields = {};
    let i = 0;
    while (i < body.length) {
      const eq = body.indexOf('=', i);
      if (eq < 0) break;
      const name = body.slice(i, eq).replace(/[,\s]/g, '').toLowerCase();
      let j = eq + 1;
      while (j < body.length && /\s/.test(body[j])) j++;
      if (j >= body.length) break;
      let val = '';
      if (body[j] === '{') {
        const inner = readBraced(body, j);
        val = inner.value;
        j = inner.end;
      } else if (body[j] === '"') {
        let k = j + 1;
        while (k < body.length && body[k] !== '"') k++;
        val = body.slice(j + 1, k);
        j = k + 1;
      } else {
        let k = j;
        while (k < body.length && body[k] !== ',' && body[k] !== '\n') k++;
        val = body.slice(j, k);
        j = k;
      }
      if (name) fields[name] = cleanValue(val);
      const nextComma = body.indexOf(',', j);
      if (nextComma < 0) break;
      i = nextComma + 1;
    }
    const author = fields.author || '';
    const authorShort = author
      .split(/\s+and\s+/i)
      .map((a) => {
        const parts = a.replace(/,/g, '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return '';
        return parts[parts.length - 1];
      })
      .filter(Boolean)
      .join(', ');
    entries.push({
      type,
      key,
      fields,
      title: fields.title || '',
      author,
      authorShort,
      year: fields.year || '',
      journal: fields.journal || '',
      booktitle: fields.booktitle || '',
      doi: fields.doi || '',
      url: fields.url || ''
    });
  }
  return entries;
}

export function formatAuthors(author) {
  if (!author) return '';
  return author
    .split(/\s+and\s+/i)
    .map((a) => {
      const [last, first] = a.split(',').map((s) => s.trim());
      if (!first) return a.trim();
      const initials = first
        .split(/\s+/)
        .map((p) => p[0] + '.')
        .join(' ');
      return `${last}, ${initials}`;
    })
    .join('; ');
}

export function entryToBibtex(entry, indent = '  ') {
  const order = ['title', 'author', 'journal', 'booktitle', 'year', 'volume', 'number', 'pages', 'publisher', 'address', 'doi', 'url', 'editor', 'month', 'note', 'school'];
  const lines = [`@${entry.type || 'article'}{${entry.key || 'key'},`];
  const seen = new Set(['title', 'author', 'year']);
  for (const field of order) {
    const value = entry.fields?.[field] ?? entry[field];
    if (!value) continue;
    lines.push(`${indent}${field.padEnd(9)} = {${value}},`);
    seen.add(field);
  }
  for (const [field, value] of Object.entries(entry.fields || {})) {
    if (seen.has(field) || !value) continue;
    lines.push(`${indent}${field.padEnd(9)} = {${value}},`);
  }
  const last = lines.pop();
  lines.push(last.replace(/,$/, ''));
  lines.push('}');
  return lines.join('\n');
}

export function emptyEntry(key = 'newentry2026') {
  return { type: 'article', key, title: '', author: '', year: String(new Date().getFullYear()), journal: '', fields: {} };
}

/** Suggested citation key: surnameYearFirstword */
export function suggestKey(entry) {
  const surname = (entry.author || '').split(/\s+and\s+/i)[0]?.split(',')[0]?.trim() || 'ref';
  const word = (entry.title || '').split(/\s+/).find((w) => w.length > 3) || '';
  return (
    surname.toLowerCase().replace(/[^a-z]/g, '') +
    (entry.year || '') +
    word.toLowerCase().replace(/[^a-z]/g, '').slice(0, 4)
  );
}
