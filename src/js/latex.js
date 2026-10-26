/**
 * LaTeX document intelligence: structure parsing, block detection,
 * punctuation normalisation, formatting helpers and snippet catalogue.
 */

const MATH_ENVS = new Set([
  'equation', 'align', 'gather', 'multline', 'eqnarray', 'displaymath', 'math', 'flalign', 'alignat',
  'split', 'aligned', 'gathered', 'cases', 'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix', 'array'
]);
const THEOREM_ENVS = new Set([
  'theorem', 'definition', 'proposition', 'lemma', 'corollary', 'proof', 'remark', 'remarks',
  'example', 'conjecture', 'assumption', 'axiom', 'claim', 'exercise', 'problem', 'solution',
  'note', 'observation', 'property', 'fact', 'question', 'answer'
]);
const VERBATIM_ENVS = new Set(['verbatim', 'verbatim*', 'lstlisting', 'minted', 'Verbatim', 'comment', 'alltt']);
const SECTION_CMDS = [
  ['part', 0], ['chapter', 1], ['section', 2], ['subsection', 3], ['subsubsection', 4],
  ['paragraph', 5], ['subparagraph', 6]
];

export function stripComment(line) {
  let out = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && line[i + 1] === '%') {
      out += '\\%';
      i++;
      continue;
    }
    if (ch === '%') break;
    out += ch;
  }
  return out;
}

export function splitLines(text) {
  return String(text || '').replace(/\r\n?/g, '\n').split('\n');
}

function matchBraces(text, start) {
  // text[start] === '{'; returns index of matching '}' or -1
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') { i++; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Parse headings, environments, labels, refs and cite keys with line numbers. */
export function parseDocument(text) {
  const lines = splitLines(text);
  const outline = [];
  const environments = [];
  const labels = [];
  const refs = [];
  const cites = [];
  const packages = [];
  let inVerbatim = null;
  let inPreamble = true;
  let beginDocumentLine = -1;
  let endDocumentLine = -1;
  const stack = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = stripComment(raw);
    const lineNo = i + 1;

    if (/\\begin\{document\}/.test(line)) {
      inPreamble = false;
      beginDocumentLine = lineNo;
    }
    if (/\\end\{document\}/.test(line)) endDocumentLine = lineNo;

    if (inVerbatim) {
      if (line.includes(`\\end{${inVerbatim}}`)) inVerbatim = null;
      continue;
    }
    const verb = line.match(/\\begin\{(verbatim\*?|lstlisting|minted|Verbatim|comment|alltt)\}/);
    if (verb) {
      inVerbatim = verb[1];
    }

    if (inPreamble) {
      const pm = line.match(/\\usepackage\s*(?:\[[^\]]*\])?\{([^}]+)\}/);
      if (pm) pm[1].split(',').forEach((p) => p.trim() && packages.push(p.trim()));
    }

    // headings
    for (const [cmd, level] of SECTION_CMDS) {
      const re = new RegExp(`\\\\(${cmd})\\*?\\s*(?:\\[[^\\]]*\\])?\\s*\\{`);
      const m = line.match(re);
      if (!m) continue;
      const braceIdx = line.indexOf('{', m.index + m[0].length - 1);
      let title = '';
      if (braceIdx >= 0) {
        const close = matchBraces(line, braceIdx);
        title = close > 0 ? line.slice(braceIdx + 1, close) : line.slice(braceIdx + 1);
      } else {
        // title on following line
        const nextLine = stripComment(lines[i + 1] || '');
        const nb = nextLine.indexOf('{');
        if (nb >= 0) {
          const close = matchBraces(nextLine, nb);
          title = close > 0 ? nextLine.slice(nb + 1, close) : '';
        }
      }
      title = cleanTitle(title);
      if (title) outline.push({ level, cmd, title, line: lineNo, starred: /\\\w+\*/.test(m[0]) });
      break;
    }

    // environments
    const beginRe = /\\begin\{([^}]+)\}/g;
    let bm;
    while ((bm = beginRe.exec(line))) {
      const env = bm[1].trim();
      const argStart = bm.index + bm[0].length;
      let caption = '';
      let args = '';
      const rest = line.slice(argStart);
      const optMatch = rest.match(/^\s*\[([^\]]*)\]/);
      if (optMatch) {
        caption = optMatch[1].trim();
        args = optMatch[0];
      } else {
        // lookahead for theorem captions in braces on same/next line
        const braceMatch = rest.match(/^\s*\{([^{}]*)\}\s*$/);
        const nextLine = stripComment(lines[i + 1] || '').trim();
        if (braceMatch && (THEOREM_ENVS.has(env) || !rest.trim())) caption = braceMatch[1].trim();
        else if (THEOREM_ENVS.has(env) && !rest.trim() && /^\{[^{}]*\}$/.test(nextLine)) caption = nextLine.slice(1, -1).trim();
      }
      const entry = { env, line: lineNo, caption, args, depth: stack.length, endLine: lineNo, labels: [] };
      environments.push(entry);
      stack.push(entry);
    }

    const endRe = /\\end\{([^}]+)\}/g;
    let em;
    while ((em = endRe.exec(line))) {
      const env = em[1].trim();
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s].env === env) {
          stack[s].endLine = lineNo;
          stack.slice(s).forEach((e) => { if (!e.endLine) e.endLine = lineNo; });
          stack.length = s;
          break;
        }
      }
    }

    // labels
    const labelRe = /\\label\{([^}]+)\}/g;
    let lm;
    while ((lm = labelRe.exec(line))) {
      const enclosing = stack.length ? stack[stack.length - 1] : null;
      labels.push({ name: lm[1].trim(), line: lineNo, env: enclosing ? enclosing.env : '', envLine: enclosing ? enclosing.line : 0 });
    }

    // refs
    const refRe = /\\(ref|eqref|autoref|cref|Cref|pageref|nameref|vref)\{([^}]+)\}/g;
    let rm;
    while ((rm = refRe.exec(line))) {
      rm[2].split(',').forEach((name) => refs.push({ cmd: rm[1], name: name.trim(), line: lineNo }));
    }

    // citations
    const citeRe = /\\(cite|citep|citet|citeauthor|citeyear|parencite|textcite|autocite|footcite|supercite|nocite)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^}]+)\}/g;
    let cm;
    while ((cm = citeRe.exec(line))) {
      cm[2].split(',').forEach((key) => cites.push({ cmd: cm[1], key: key.trim(), line: lineNo }));
    }
  }

  return {
    lines,
    outline,
    environments,
    mathEnvironments: environments.filter((e) => MATH_ENVS.has(e.env) || THEOREM_ENVS.has(e.env)),
    labels,
    refs,
    cites,
    packages,
    beginDocumentLine,
    endDocumentLine
  };
}

function cleanTitle(s) {
  return String(s || '')
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?/g, (m) => (m.startsWith('\\\\') ? ' ' : ''))
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

/** Detect top-level paragraph / environment blocks for Notion-like block editing. */
export function detectBlocks(text) {
  const lines = splitLines(text);
  const blocks = [];
  const stack = [];
  let cur = null;
  let verbatim = null;

  const transparent = (env) => env === 'document';
  const innerDepth = () => stack.reduce((n, e) => n + (transparent(e) ? 0 : 1), 0);
  const flush = () => {
    if (cur && cur.endLine >= cur.startLine) {
      cur.text = lines.slice(cur.startLine, cur.endLine + 1).join('\n');
      blocks.push(cur);
    }
    cur = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i];
    const trimmed = stripComment(raw).trim();

    if (verbatim) {
      if (trimmed.includes(`\\end{${verbatim}}`)) verbatim = null;
      if (cur) cur.endLine = lineNo;
      continue;
    }
    const vb = trimmed.match(/^\\begin\{(verbatim\*?|lstlisting|minted|Verbatim|comment|alltt)\}/);
    if (vb) verbatim = vb[1];

    const beginMatch = trimmed.match(/^\\begin\{([^}]+)\}/);
    const endMatch = trimmed.match(/^\\end\{([^}]+)\}/);
    const headingMatch = trimmed.match(/^\\(part|chapter|section|subsection|subsubsection)\*?\s*(\[[^\]]*\])?\s*\{/);
    const depth = innerDepth();

    if (depth === 0) {
      if (!trimmed) {
        flush();
      } else if (beginMatch) {
        flush();
        if (transparent(beginMatch[1])) {
          stack.push(beginMatch[1]);
          continue;
        }
        cur = { kind: 'env', env: beginMatch[1], startLine: lineNo, endLine: lineNo };
        stack.push(beginMatch[1]);
        continue;
      } else if (headingMatch) {
        flush();
        blocks.push({ kind: 'heading', env: headingMatch[1], startLine: lineNo, endLine: lineNo, text: raw });
        continue;
      } else {
        if (!cur) cur = { kind: 'paragraph', startLine: lineNo, endLine: lineNo };
        else cur.endLine = lineNo;
      }
    } else if (cur) {
      cur.endLine = lineNo;
    }

    if (beginMatch && !(depth === 0 && !transparent(beginMatch[1]))) {
      stack.push(beginMatch[1]);
      if (cur) cur.endLine = lineNo;
    }
    if (endMatch) {
      const idx = stack.lastIndexOf(endMatch[1]);
      if (idx >= 0) stack.length = idx;
      if (innerDepth() === 0 && cur && cur.kind === 'env') {
        cur.endLine = lineNo;
        flush();
      }
    }
  }
  flush();
  return blocks;
}

/** Environment stack at a given 1-based line. */
export function getEnvContext(text, lineNumber) {
  const lines = splitLines(text).slice(0, lineNumber);
  const stack = [];
  for (const raw of lines) {
    const line = stripComment(raw);
    const re = /\\(begin|end)\{([^}]+)\}/g;
    let m;
    while ((m = re.exec(line))) {
      if (m[1] === 'begin') stack.push(m[2]);
      else {
        const idx = stack.lastIndexOf(m[2]);
        if (idx >= 0) stack.length = idx;
      }
    }
  }
  return stack;
}

﻿/**
 * Two-way punctuation conversion for the whole document.
 * direction = 'half' 中文标点 → 英文标点，并在 , . ; : ! ? 后补一个英文空格
 *             'full' 英文标点 → 中文标点，同时移除紧随其后的空格
 * 顿号（、）与中英文引号（“ ” ‘ ’ " '）保持原样。
 */
export function normalizePunctuation(text, { direction = 'half' } = {}) {
  const lines = splitLines(text);
  let changes = 0;
  let verbatim = null;

  const halfMap = {
    '，': ',', '。': '.', '；': ';', '：': ':', '（': '(', '）': ')', '【': '[', '】': ']',
    '！': '!', '？': '?', '．': '.', '～': '~', '　': ' ', '－': '-'
  };
  const spaceAfter = new Set([',', '.', ';', ':', '!', '?']);

  const protectRe = /(https?:\/\/[^\s{}]+|mailto:[^\s{}]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

  const convertHalf = (segment) => {
    return segment
      .split(protectRe)
      .map((part, idx) => {
        if (idx % 2 === 1) return part; // protected URL / e-mail
        let out = '';
        for (let i = 0; i < part.length; i++) {
          const ch = part[i];
          if (halfMap[ch] === undefined) {
            out += ch;
            continue;
          }
          const mapped = halfMap[ch];
          changes++;
          out += mapped;
          if (!spaceAfter.has(mapped)) continue;
          const prev = part[i - 1] || '';
          const next = part[i + 1] || '';
          const tight = next === '' || /\s/.test(next) || /[)\]}.,;:!?'"$%]/.test(next);
          const decimal = mapped === '.' && /\d/.test(prev) && /\d/.test(next);
          if (!tight && !decimal) out += ' ';
        }
        return out;
      })
      .join('')
      .replace(/[ \t]+([,.;:!?])/g, '$1')
      .replace(/ {2,}/g, ' ');
  };

  const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]/;

  const convertFull = (segment) => {
    let out = '';
    for (let i = 0; i < segment.length; i++) {
      const ch = segment[i];
      if (!',.;:!?'.includes(ch)) {
        out += ch;
        continue;
      }
      const prev = segment[i - 1] || '';
      const rest = segment.slice(i + 1);
      const after = rest.replace(/^\s+/, '')[0] || '';
      const boundary = after === '' || CJK.test(after);
      const skipNumeric = (ch === '.' && (/\d/.test(prev) || /\d/.test(after))) || (ch === ',' && /\d/.test(prev) && /\d/.test(after));
      const map = { ',': '，', '.': '。', ';': '；', ':': '：', '!': '！', '?': '？' };
      if (boundary && !skipNumeric) {
        out += map[ch];
        changes++;
        while (/\s/.test(segment[i + 1] || '')) i++;
        continue;
      }
      out += ch;
    }
    return out
      .replace(/\(([^()]*[\u3400-\u4dbf\u4e00-\u9fff][^()]*)\)/g, (m, inner) => {
        changes += 2;
        return '（' + inner + '）';
      })
      .replace(/\s+([，。；：！？])/g, '$1')
      .replace(/([，。；：！？])\s+/g, '$1');
  };

  const convertLine = (code) => {
    let result = '';
    let i = 0;
    while (i < code.length) {
      const ch = code[i];
      if (ch === '\\' && (code[i + 1] === '[' || code[i + 1] === '(')) {
        const close = code[i + 1] === '[' ? '\\]' : '\\)';
        const end = code.indexOf(close, i + 2);
        if (end > 0) {
          result += code.slice(i, i + 2) + (direction === 'half' ? convertHalf(code.slice(i + 2, end)) : code.slice(i + 2, end)) + close;
          i = end + close.length;
          continue;
        }
        result += code.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (ch === '$') {
        const delim = code[i + 1] === '$' ? '$$' : '$';
        const end = code.indexOf(delim, i + delim.length);
        if (end > 0) {
          result += delim + (direction === 'half' ? convertHalf(code.slice(i + delim.length, end)) : code.slice(i + delim.length, end)) + delim;
          i = end + delim.length;
          continue;
        }
        result += delim;
        i += delim.length;
        continue;
      }
      if (ch === '\\' && i + 1 < code.length && /[a-zA-Z@]/.test(code[i + 1])) {
        let j = i + 1;
        while (j < code.length && /[a-zA-Z@]/.test(code[j])) j++;
        result += code.slice(i, j);
        i = j;
        continue;
      }
      let j = i;
      while (j < code.length && code[j] !== '$' && !(code[j] === '\\' && (code[j + 1] === '[' || code[j + 1] === '('))) j++;
      const run = code.slice(i, j);
      result += direction === 'half' ? convertHalf(run) : convertFull(run);
      i = j;
    }
    return result;
  };

  const out = lines.map((raw) => {
    const code = stripComment(raw);
    const comment = raw.slice(code.length);
    if (verbatim) {
      if (code.includes('\\end{' + verbatim + '}')) verbatim = null;
      return raw;
    }
    const vb = code.match(/\\begin\{(verbatim\*?|lstlisting|minted|Verbatim|comment|alltt)\}/);
    if (vb) {
      verbatim = vb[1];
      return raw;
    }
    return convertLine(code) + comment;
  });

  return { text: out.join('\n'), changes };
}

/** Insert a global \everymath{\displaystyle} + line-spacing compensation block. */
export function applyDisplayStyle(text) {
  const hasEvery = text.includes('\\everymath{\\displaystyle}');
  const hasSpacing = text.includes('\\lineskiplimit') && text.includes('\\lineskip');
  if (hasEvery && hasSpacing) return { text, changes: 0 };
  const block = [
    '% === 核心调整代码 ===',
    '% 行内公式全局采用行间样式，并补偿上下行间距，避免分式/求和拥挤',
    '\\everymath{\\displaystyle}',
    '\\setlength{\\lineskiplimit}{3pt} % 两行文字物理距离小于 3pt 时触发自动调整',
    '\\setlength{\\lineskip}{5pt}      % 触发调整时强制增加 5pt 额外行距'
  ].join('\n');
  const idx = text.indexOf('\\begin{document}');
  if (idx < 0) return { text, changes: 0 };
  const head = text.slice(0, idx).replace(/\s*$/, '');
  const tail = text.slice(idx);
  return { text: head + '\n\n' + block + '\n\n' + tail, changes: 1 };
}

/**
 * Beautify a LaTeX source file: environment indentation, paragraph unwrapping,
 * preamble/section banner comments.
 */
export function beautify(text, options = {}) {
  const {
    indentSize = 2,
    mergeParagraphLines = true,
    normalizeIndent = true,
    sectionBanners = true,
    preambleDivider = true,
    collapseBlankLines = true
  } = options;
  const lines = splitLines(text);
  let inVerbatim = null;
  let depth = 0;
  const unit = ' '.repeat(Math.max(1, indentSize));

  // ---- 1. merge wrapped paragraph lines inside the body
  let merged = [];
  if (mergeParagraphLines) {
    let inBody = false;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const code = stripComment(raw).trim();
      if (/\\begin\{document\}/.test(raw)) { inBody = true; merged.push(raw); continue; }
      if (!inBody || inVerbatim) { merged.push(raw); if (inVerbatim && raw.includes(`\\end{${inVerbatim}}`)) inVerbatim = null; continue; }
      const vb = code.match(/\\begin\{(verbatim\*?|lstlisting|minted|Verbatim|comment)\}/);
      if (vb) { inVerbatim = vb[1]; merged.push(raw); continue; }
      const prev = merged[merged.length - 1];
      const prevCode = prev == null ? '' : stripComment(prev).trim();
      const isStructural = /^\\(begin|end|item|section|subsection|subsubsection|chapter|part|label|caption|newcommand|def|input|include|bibliography|addbibresource|maketitle|tableofcontents|centering|hline|toprule|midrule|bottomrule|\\|\%|newline|par|noindent)\b/.test(code) || code.startsWith('\\[') || code.startsWith('\\]') || code.startsWith('$$') || code.startsWith('\\(') || code.startsWith('\\)');
      const prevStructural = /^\\(begin|end|item|section|subsection|subsubsection|chapter|part|label|caption|\\|\%|par|noindent)\b/.test(prevCode) || prevCode === '' || /\\(begin|end)\{[^}]+\}\s*$/.test(prevCode) || /\\\\$/.test(prevCode) || prevCode.startsWith('\\[') || prevCode.startsWith('$$');
      if (!isStructural && !prevStructural && code && prevCode && !/[{}]$/.test(prevCode)) {
        // unwrap: append to previous line
        merged[merged.length - 1] = prev.replace(/\s+$/, '') + (/[\u4e00-\u9fff]$/.test(prev.trim()) || /^[\u4e00-\u9fff]/.test(code) ? '' : ' ') + code;
        continue;
      }
      merged.push(raw);
    }
  } else {
    merged = lines.slice();
  }

  // ---- 2. normalise indentation
  let result = [];
  inVerbatim = null;
  depth = 0;
  for (const raw of merged) {
    const code = stripComment(raw);
    const trimmed = code.trim();
    if (inVerbatim) {
      result.push(raw);
      if (raw.includes(`\\end{${inVerbatim}}`)) inVerbatim = null;
      continue;
    }
    const vb = trimmed.match(/\\begin\{(verbatim\*?|lstlisting|minted|Verbatim|comment|alltt)\}/);
    if (vb) inVerbatim = vb[1];

    if (!trimmed) {
      result.push('');
      continue;
    }
    if (/^\\(end)\{/.test(trimmed)) depth = Math.max(0, depth - 1);
    const targetDepth = depth;
    if (!normalizeIndent || /^\s*%/.test(raw) || /^\s*(toprule|midrule|bottomrule|hline|centering|noindent|caption|label)\b/.test(trimmed)) {
      result.push(raw.replace(/\s+$/, ''));
    } else if (/^\\(documentclass|usepackage|RequirePackage|title|author|date|begin\{document\}|end\{document\}|newcommand|renewcommand|def|DeclareMathOperator|bibliography|bibliographystyle|addbibresource|printbibliography|maketitle|tableofcontents\}|input|include)/.test(trimmed) || depth === 0) {
      result.push(trimmed);
    } else {
      result.push(unit.repeat(targetDepth) + trimmed);
    }
    if (/\\begin\{/.test(trimmed) && !/\\begin\{[^}]*\}\s*$/.test(trimmed)) depth++;
    else if (/\\begin\{[^}]*\}/.test(trimmed) && !/\\end\{/.test(trimmed)) depth++;
    if (/^\\(end)\{/.test(trimmed)) {
      // already handled
    }
  }

  // ---- 3. collapse blank lines
  if (collapseBlankLines) {
    const collapsed = [];
    let blanks = 0;
    for (const line of result) {
      if (!line.trim()) {
        blanks++;
        if (blanks > 1) continue;
      } else blanks = 0;
      collapsed.push(line);
    }
    result = collapsed;
  }

  // ---- 4. banners
  if (preambleDivider) {
    const banner = '% ' + '='.repeat(74);
    const docIdx = result.findIndex((l) => /\\begin\{document\}/.test(l));
    if (docIdx >= 0 && !/Preamble|导言区/i.test(result.slice(0, docIdx).join('\n'))) {
      const before = result.slice(0, docIdx);
      const after = result.slice(docIdx);
      while (before.length && !before[before.length - 1].trim()) before.pop();
      result = [
        banner,
        '%  导言区 · Preamble',
        banner,
        ...before,
        '',
        banner,
        '%  正文 · Document body',
        banner,
        ...after
      ];
    }
  }

  if (sectionBanners) {
    const out = [];
    for (const line of result) {
      const m = line.match(/^\\(chapter|section|subsection|subsubsection)\*?\s*\{/);
      if (m) {
        const prev = out[out.length - 1] || '';
        if (!/^%\s*-{4,}/.test(prev)) {
          out.push('% ' + '-'.repeat(74));
        }
      }
      out.push(line);
    }
    result = out;
  }

  // tidy trailing whitespace
  result = result.map((l) => l.replace(/[ \t]+$/, ''));
  let text2 = result.join('\n');
  if (!/\n$/.test(text2)) text2 += '\n';
  return text2;
}

/** Track whether text changed and what kind of change happened. */
export function diffSummary(a, b) {
  const al = splitLines(a);
  const bl = splitLines(b);
  let added = 0;
  let removed = 0;
  const setA = new Set(al);
  const setB = new Set(bl);
  for (const l of bl) if (!setA.has(l)) added++;
  for (const l of al) if (!setB.has(l)) removed++;
  return { added, removed, linesA: al.length, linesB: bl.length };
}

/* ------------------------------------------------------------------ snippets */
export const SNIPPETS = [
  { prefix: 'mk', label: '行内公式 $…$', body: '$${1}$$', detail: 'Inline math' },
  { prefix: 'dm', label: '行间公式 \\[…\\]', body: '\\[\n\t${1}\n\\]', detail: 'Display math' },
  { prefix: 'ali', label: 'align 环境', body: '\\begin{align}\n\t${1}\n\\end{align}', detail: 'Aligned equations' },
  { prefix: 'eq', label: 'equation 环境', body: '\\begin{equation}\n\t${1}\n\\end{equation}' },
  { prefix: 'fra', label: '\\frac{}{}', body: '\\frac{${1}}{${2}}' },
  { prefix: 'sq', label: '\\sqrt{}', body: '\\sqrt{${1}}' },
  { prefix: 'sum', label: '求和', body: '\\sum_{${1}}^{${2}}' },
  { prefix: 'int', label: '积分', body: '\\int_{${1}}^{${2}}' },
  { prefix: 'thm', label: '定理环境', body: '\\begin{theorem}[${1}]\n\t${2}\n\\end{theorem}' },
  { prefix: 'lem', label: '引理环境', body: '\\begin{lemma}\n\t${1}\n\\end{lemma}' },
  { prefix: 'pf', label: '证明环境', body: '\\begin{proof}\n\t${1}\n\\end{proof}' },
  { prefix: 'ite', label: 'itemize', body: '\\begin{itemize}\n\t\\item ${1}\n\\end{itemize}' },
  { prefix: 'ena', label: 'enumerate', body: '\\begin{enumerate}\n\t\\item ${1}\n\\end{enumerate}' },
  { prefix: 'fig', label: 'figure 环境', body: '\\begin{figure}[htbp]\n\t\\centering\n\t\\includegraphics[width=0.8\\linewidth]{${1}}\n\t\\caption{${2}}\n\t\\label{fig:${3}}\n\\end{figure}' },
  { prefix: 'tab', label: '三线表', body: '\\begin{table}[htbp]\n\t\\centering\n\t\\caption{${1}}\n\t\\label{tab:${2}}\n\t\\begin{tabular}{lcc}\n\t\t\\toprule\n\t\t${3} & ${4} & ${5} \\\\\n\t\t\\midrule\n\t\t${6} & ${7} & ${8} \\\\\n\t\t\\bottomrule\n\t\\end{tabular}\n\\end{table}' },
  { prefix: 'se', label: '\\section{}', body: '\\section{${1}}\n\\label{sec:${2}}' },
  { prefix: 'sse', label: '\\subsection{}', body: '\\subsection{${1}}\n\\label{sec:${2}}' },
  { prefix: 'cit', label: '\\cite{}', body: '\\cite{${1}}' },
  { prefix: 'ref', label: '\\ref{}', body: '\\ref{${1}}' },
  { prefix: 'lb', label: '\\label{}', body: '\\label{${1}}' },
  { prefix: 'bf', label: '\\textbf{}', body: '\\textbf{${1}}' },
  { prefix: 'it', label: '\\textit{}', body: '\\textit{${1}}' },
  { prefix: 'em', label: '\\emph{}', body: '\\emph{${1}}' },
  { prefix: 'tikz', label: 'tikzpicture', body: '\\begin{tikzpicture}\n\t${1}\n\\end{tikzpicture}' },
  { prefix: 'cen', label: 'center 环境', body: '\\begin{center}\n\t${1}\n\\end{center}' },
  { prefix: 'doc', label: '完整文档骨架', body: '\\documentclass[11pt]{article}\n\\usepackage{amsmath,amssymb}\n\\usepackage{graphicx}\n\n\\begin{document}\n${1}\n\\end{document}' }
];

export const ENVIRONMENTS = [
  'document', 'abstract', 'itemize', 'enumerate', 'description', 'center', 'flushleft', 'flushright',
  'figure', 'figure*', 'table', 'table*', 'tabular', 'tabularx', 'tabularray', 'tblr', 'longtable',
  'equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'multline', 'multline*', 'split',
  'aligned', 'cases', 'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix', 'array', 'eqnarray',
  'theorem', 'lemma', 'proposition', 'corollary', 'definition', 'proof', 'remark', 'example',
  'conjecture', 'assumption', 'axiom', 'exercise', 'problem', 'solution', 'note',
  'tikzpicture', 'minipage', 'quote', 'quotation', 'verse', 'verbatim', 'lstlisting', 'minted',
  'thebibliography', 'appendices', 'subfigure', 'wrapfigure', 'frame', 'block', 'columns', 'column',
  'algorithm', 'algorithmic', 'algorithm2e', 'algorithmicx', 'enumerate*', 'itemize*', 'multicols'
];

export const COMMANDS = [
  ['\\documentclass', '\\documentclass[${1:11pt}]{${2:article}}', '文档类'],
  ['\\usepackage', '\\usepackage[${1:options}]{${2:package}}', '宏包'],
  ['\\title', '\\title{${1}}', '标题'],
  ['\\author', '\\author{${1}}', '作者'],
  ['\\date', '\\date{${1:\\today}}', '日期'],
  ['\\maketitle', '\\maketitle', '生成标题'],
  ['\\tableofcontents', '\\tableofcontents', '目录'],
  ['\\section', '\\section{${1}}', '章节'],
  ['\\subsection', '\\subsection{${1}}', '小节'],
  ['\\subsubsection', '\\subsubsection{${1}}', '小小节'],
  ['\\paragraph', '\\paragraph{${1}}', '段落标题'],
  ['\\label', '\\label{${1}}', '标签'],
  ['\\ref', '\\ref{${1}}', '引用'],
  ['\\eqref', '\\eqref{${1}}', '公式引用'],
  ['\\pageref', '\\pageref{${1}}', '页码引用'],
  ['\\cite', '\\cite{${1}}', '文献引用'],
  ['\\citep', '\\citep{${1}}', '括号引用'],
  ['\\citet', '\\citet{${1}}', '文本引用'],
  ['\\textbf', '\\textbf{${1}}', '加粗'],
  ['\\textit', '\\textit{${1}}', '斜体'],
  ['\\emph', '\\emph{${1}}', '强调'],
  ['\\underline', '\\underline{${1}}', '下划线'],
  ['\\texttt', '\\texttt{${1}}', '等宽'],
  ['\\textsc', '\\textsc{${1}}', '小型大写'],
  ['\\textsuperscript', '\\textsuperscript{${1}}', '上标'],
  ['\\textsubscript', '\\textsubscript{${1}}', '下标'],
  ['\\footnote', '\\footnote{${1}}', '脚注'],
  ['\\includegraphics', '\\includegraphics[width=${1:0.8}\\linewidth]{${2}}', '插入图片'],
  ['\\caption', '\\caption{${1}}', '图题'],
  ['\\begin', '\\begin{${1:equation}}', '环境开始'],
  ['\\end', '\\end{${1:equation}}', '环境结束'],
  ['\\item', '\\item ', '列表项'],
  ['\\input', '\\input{${1}}', '引入文件'],
  ['\\include', '\\include{${1}}', '包含文件'],
  ['\\bibliography', '\\bibliography{${1}}', '文献库'],
  ['\\bibliographystyle', '\\bibliographystyle{${1:plain}}', '文献样式'],
  ['\\addbibresource', '\\addbibresource{${1}}', 'biblatex 文献库'],
  ['\\printbibliography', '\\printbibliography', '打印文献'],
  ['\\frac', '\\frac{${1}}{${2}}', '分式'],
  ['\\dfrac', '\\dfrac{${1}}{${2}}', '显示分式'],
  ['\\sqrt', '\\sqrt{${1}}', '根式'],
  ['\\sum', '\\sum_{${1}}^{${2}}', '求和'],
  ['\\prod', '\\prod_{${1}}^{${2}}', '连乘'],
  ['\\int', '\\int_{${1}}^{${2}}', '积分'],
  ['\\lim', '\\lim_{${1:\\to 0}}', '极限'],
  ['\\infty', '\\infty', '无穷'],
  ['\\partial', '\\partial', '偏导'],
  ['\\nabla', '\\nabla', '梯度'],
  ['\\alpha', '\\alpha', '希腊字母'],
  ['\\beta', '\\beta', '希腊字母'],
  ['\\gamma', '\\gamma', '希腊字母'],
  ['\\delta', '\\delta', '希腊字母'],
  ['\\lambda', '\\lambda', '希腊字母'],
  ['\\mu', '\\mu', '希腊字母'],
  ['\\pi', '\\pi', '希腊字母'],
  ['\\sigma', '\\sigma', '希腊字母'],
  ['\\theta', '\\theta', '希腊字母'],
  ['\\omega', '\\omega', '希腊字母'],
  ['\\mathbf', '\\mathbf{${1}}', '数学粗体'],
  ['\\mathbb', '\\mathbb{${1}}', '黑板粗体'],
  ['\\mathcal', '\\mathcal{${1}}', '花体'],
  ['\\mathrm', '\\mathrm{${1}}', '直立体'],
  ['\\operatorname', '\\operatorname{${1}}', '自定义算子'],
  ['\\left', '\\left${1:(}', '自适应左定界'],
  ['\\right', '\\right${1:)}', '自适应右定界'],
  ['\\displaystyle', '\\displaystyle ', '行间样式'],
  ['\\text', '\\text{${1}}', '公式内文本'],
  ['\\quad', '\\quad', '数学空格'],
  ['\\hline', '\\hline', '表格横线'],
  ['\\toprule', '\\toprule', '三线表顶线'],
  ['\\midrule', '\\midrule', '三线表中线'],
  ['\\bottomrule', '\\bottomrule', '三线表底线'],
  ['\\newpage', '\\newpage', '分页'],
  ['\\clearpage', '\\clearpage', '清除浮动并分页'],
  ['\\vspace', '\\vspace{${1:1em}}', '垂直间距'],
  ['\\hspace', '\\hspace{${1:1em}}', '水平间距'],
  ['\\linebreak', '\\linebreak', '换行'],
  ['\\noindent', '\\noindent', '取消缩进'],
  ['\\centering', '\\centering', '居中'],
  ['\\begin{equation}', '\\begin{equation}\n\t${1}\n\\end{equation}', '公式环境'],
  ['\\begin{align}', '\\begin{align}\n\t${1}\n\\end{align}', '对齐环境'],
  ['\\begin{figure}', '\\begin{figure}[htbp]\n\t\\centering\n\t${1}\n\\end{figure}', '图片环境'],
  ['\\begin{table}', '\\begin{table}[htbp]\n\t\\centering\n\t${1}\n\\end{table}', '表格环境'],
  ['\\begin{itemize}', '\\begin{itemize}\n\t\\item ${1}\n\\end{itemize}', '无序列表'],
  ['\\begin{enumerate}', '\\begin{enumerate}\n\t\\item ${1}\n\\end{enumerate}', '有序列表']
];

export const ENUMITEM_OPTIONS = [
  ['label=(\\alph*)', '(a), (b), (c) 样式'],
  ['label=\\alph*)', 'a), b), c) 样式'],
  ['label=\\roman*)', 'i), ii), iii) 样式'],
  ['label=\\arabic*)', '1), 2), 3) 样式'],
  ['label=(\\arabic*)', '(1), (2), (3) 样式'],
  ['label=\\chinese*)', '一), 二), 三) 样式'],
  ['label=(\\chinese*)', '(一), (二) 样式'],
  ['nosep', '紧凑无间距'],
  ['noitemsep', '无项间距'],
  ['leftmargin=*', '自适应左缩进'],
  ['start=1', '从 1 开始'],
  ['resume', '继续之前的编号']
];

export const FONT_SIZES = ['tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize', 'large', 'Large', 'LARGE', 'huge', 'Huge'];

export function environmentAtCursor(text, lineNumber, column) {
  const lines = splitLines(text);
  const upto = lines.slice(0, lineNumber - 1).join('\n') + '\n' + (lines[lineNumber - 1] || '').slice(0, column);
  return getEnvContextFromText(upto);
}

export function getEnvContextFromText(text) {
  const stack = [];
  const re = /\\(begin|end)\{([^}]+)\}/g;
  let m;
  const clean = text.replace(/(?<!\\)%.*$/gm, '');
  while ((m = re.exec(clean))) {
    if (m[1] === 'begin') stack.push(m[2]);
    else {
      const idx = stack.lastIndexOf(m[2]);
      if (idx >= 0) stack.length = idx;
    }
  }
  return stack;
}

/** Choose the snippet wrapper for a formatting command based on context. */
export function wrapCommandFor(cmd, envStack) {
  const mathEnv = envStack.find((e) => MATH_ENVS.has(e) || e === 'math');
  switch (cmd) {
    case 'bold':
      return mathEnv ? '\\mathbf' : '\\textbf';
    case 'italic':
      return mathEnv ? '\\mathit' : '\\textit';
    case 'underline':
      return '\\underline';
    case 'strike':
      return '\\sout';
    case 'emph':
      return mathEnv ? '\\mathit' : '\\emph';
    case 'texttt':
      return mathEnv ? '\\mathtt' : '\\texttt';
    default:
      return '';
  }
}
