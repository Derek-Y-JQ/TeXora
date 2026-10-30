/** Minimal Markdown renderer + Markdown→LaTeX converter (offline, no deps). */
import { escapeHtml } from './util.js';

function inline(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m,alt,url)=>/^(asset:|data:image\/(?:png|jpeg|gif|webp);base64,)/i.test(url)?`<img alt="${alt}" src="${url}" />`:`<span>${alt}</span>`);
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m,label,url)=>/^(https?:\/\/|mailto:|#)/i.test(url)?`<a href="${url}">${label}</a>`:label);
  out = out.replace(/&lt;(https?:\/\/[^\s]+)&gt;/g, '<a href="$1">$1</a>');
  return out;
}

export function renderMarkdown(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let i = 0;
  let inList = null;
  let inCode = false;
  let codeBuf = [];
  let inTable = false;
  const closeList = () => {
    if (inList) {
      html.push(`</${inList}>`);
      inList = null;
    }
  };
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');

    if (/^```/.test(line)) {
      if (!inCode) {
        inCode = true;
        codeBuf = [];
      } else {
        inCode = false;
        html.push(`<pre class="md-code"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
      }
      i++;
      continue;
    }
    if (inCode) {
      codeBuf.push(raw);
      i++;
      continue;
    }

    // table
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      closeList();
      const header = line.split('|').slice(1, -1).map((c) => c.trim());
      const rows = [];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
        i++;
      }
      html.push(
        `<table class="md-table"><thead><tr>${header.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`
      );
      continue;
    }

    if (!line.trim()) {
      closeList();
      html.push('');
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^(---|\*\*\*|___)\s*$/.test(line)) {
      closeList();
      html.push('<hr/>');
      i++;
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeList();
      const buf = [quote[1]];
      i++;
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      html.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
      continue;
    }

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) {
      if (inList !== 'ul') {
        closeList();
        html.push('<ul>');
        inList = 'ul';
      }
      html.push(`<li>${inline(ul[1])}</li>`);
      i++;
      continue;
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      if (inList !== 'ol') {
        closeList();
        html.push('<ol>');
        inList = 'ol';
      }
      html.push(`<li>${inline(ol[1])}</li>`);
      i++;
      continue;
    }

    closeList();
    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(\s*[-*+]\s|\s*\d+[.)]\s|#{1,6}\s|>|```|\s*\|)/.test(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    html.push(`<p>${inline(para.join(' '))}</p>`);
  }
  closeList();
  return html.join('\n');
}

export function mdToLatex(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let inCode = false;
  let inList = null;
  const esc = (t) =>
    t
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/([&%$#_{}])/g, '\\$1')
      .replace(/~/g, '\\textasciitilde{}')
      .replace(/\^/g, '\\textasciicircum{}');
  const inlineTex = (t) => {
    let s = esc(t);
    s = s.replace(/`([^`]+)`/g, '\\texttt{$1}');
    s = s.replace(/\*\*([^*]+)\*\*/g, '\\textbf{$1}');
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1\\textit{$2}');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '\\href{$2}{$1}');
    return s;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      if (!inCode) {
        inCode = true;
        out.push('\\begin{verbatim}');
      } else {
        inCode = false;
        out.push('\\end{verbatim}');
      }
      continue;
    }
    if (inCode) {
      out.push(line);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const cmds = ['section', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph'];
      out.push(`\\${cmds[h[1].length - 1]}{${inlineTex(h[2])}}`);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      if (inList !== 'itemize') {
        if (inList) out.push(`\\end{${inList}}`);
        out.push('\\begin{itemize}');
        inList = 'itemize';
      }
      out.push(`  \\item ${inlineTex(line.replace(/^\s*[-*+]\s+/, ''))}`);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      if (inList !== 'enumerate') {
        if (inList) out.push(`\\end{${inList}}`);
        out.push('\\begin{enumerate}');
        inList = 'enumerate';
      }
      out.push(`  \\item ${inlineTex(line.replace(/^\s*\d+[.)]\s+/, ''))}`);
      continue;
    }
    if (inList) {
      out.push(`\\end{${inList}}`);
      inList = null;
    }
    if (!line.trim()) {
      out.push('');
      continue;
    }
    if (/^(---|\*\*\*)\s*$/.test(line)) {
      out.push('\\bigskip\\hrule\\bigskip');
      continue;
    }
    if (/^>\s?/.test(line)) {
      out.push(`\\begin{quote}\n${inlineTex(line.replace(/^>\s?/, ''))}\n\\end{quote}`);
      continue;
    }
    out.push(inlineTex(line) + '\n');
  }
  if (inList) out.push(`\\end{${inList}}`);
  if (inCode) out.push('\\end{verbatim}');
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}
