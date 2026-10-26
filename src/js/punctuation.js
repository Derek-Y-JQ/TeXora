/** Convert prose punctuation while preserving LaTeX syntax and literal data. */
export function normalizePunctuation(text, { direction = 'half' } = {}) {
  if (!['half', 'full'].includes(direction)) throw new RangeError('Unknown punctuation direction');
  const cjk = /[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]/;
  const half = { '，': ',', '。': '.', '；': ';', '：': ':', '！': '!', '？': '?', '（': '(', '）': ')', '【': '[', '】': ']', '．': '.', '　': ' ', '－': '-' };
  // A literal ~ would become a nonbreaking space in TeX. Leave ～ untouched.
  const full = { ',': '，', '.': '。', ';': '；', ':': '：', '!': '！', '?': '？' };
  const textCommands = new Set(['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'caption', 'title', 'author', 'thanks', 'footnote', 'footnotetext', 'textbf', 'textit', 'textnormal', 'textrm', 'textsf', 'texttt', 'textup', 'textsl', 'textsc', 'emph', 'underline', 'sout', 'mbox', 'fbox', 'quote', 'enquote', 'item']);
  const literalEnvs = /^(?:verbatim\*?|Verbatim|BVerbatim|LVerbatim|lstlisting|minted|comment|alltt|equation\*?|align\*?|alignat\*?|flalign\*?|gather\*?|multline\*?|displaymath|math|eqnarray\*?|tikzpicture|picture)$/;
  let changes = 0;

  function plain(segment, following = '') {
    // Exclude Chinese sentence punctuation from URL tails; preserve URL syntax,
    // email, file names and English abbreviations in either direction.
    const protectedText = /(https?:\/\/[^\s{}<>，。；：！？（）【】]+|mailto:[^\s{}，。；：！？]+|[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}|\b(?:[A-Za-z]\.){2,}|\b(?:Mr|Mrs|Dr|Prof|Fig|Eq|Sec)\.|\b[\w-]+\.(?:tex|bib|sty|cls|png|jpg|pdf|csv|json)\b)/g;
    return segment.split(protectedText).map((part, index, parts) => {
      if (index % 2) return part;
      if (direction === 'half') {
        let out = '';
        for (let i = 0; i < part.length; i++) {
          const ch = part[i], mapped = half[ch];
          if (mapped === undefined) { out += ch; continue; }
          changes++;
          if (',.;:!?'.includes(mapped)) out = out.replace(/[ \t]+$/, '');
          out += mapped;
          const next = part[i + 1] || parts[index + 1]?.[0] || following;
          const decimal = mapped === '.' && /\d/.test(part[i - 1] || '') && /\d/.test(next);
          if (',.;:!?'.includes(mapped) && next && !/[\s)\]}.,;:!?，。；：！？）】'"”’%]/.test(next) && !decimal) out += ' ';
        }
        return out;
      }
      let out = '';
      for (let i = 0; i < part.length; i++) {
        const ch = part[i];
        const prev = part.slice(0, i).trimEnd().replace(/[”’"')\]]+$/, '').slice(-1);
        const next = part.slice(i + 1).trimStart().replace(/^[“‘"'(\[]+/, '')[0] || '';
        const numeric = (ch === '.' && /\d/.test(prev + next)) || (',:'.includes(ch) && /\d/.test(prev) && /\d/.test(next));
        const ellipsis = ch === '.' && (part[i - 1] === '.' || part[i + 1] === '.');
        if (full[ch] && (cjk.test(prev) || cjk.test(next)) && !numeric && !ellipsis) {
          out = out.replace(/[ \t]+$/, '') + full[ch];
          while (/[ \t]/.test(part[i + 1] || '')) i++;
          changes++;
        } else out += ch;
      }
      return out.replace(/\(([^()]*[\u3400-\u4dbf\u4e00-\u9fff][^()]*)\)/g, (_, inner) => {
        changes += 2;
        return '（' + inner + '）';
      });
    }).join('');
  }

  function balanced(start, close) {
    const open = text[start];
    let depth = 1;
    for (let i = start + 1; i < text.length; i++) {
      if (text[i] === '\\') { i++; continue; }
      if (text[i] === '%') {
        const newline = text.indexOf('\n', i);
        if (newline < 0) return text.length;
        i = newline;
        continue;
      }
      if (text[i] === open) depth++;
      if (text[i] === close && --depth === 0) return i + 1;
    }
    return text.length;
  }

  function closing(delimiter, start) {
    for (let i = start; i < text.length; i++) {
      if (text.startsWith(delimiter, i)) return i + delimiter.length;
      if (text[i] === '\\') i++;
    }
    return text.length;
  }

  function scan(start, end) {
    let out = '', i = start;
    while (i < end) {
      if (text[i] === '%') {
        const stop = text.indexOf('\n', i);
        const j = stop < 0 ? end : Math.min(stop, end);
        out += text.slice(i, j); i = j; continue;
      }
      if (text[i] === '$') {
        const delim = text[i + 1] === '$' ? '$$' : '$';
        const j = Math.min(end, closing(delim, i + delim.length));
        out += text.slice(i, j); i = j; continue;
      }
      if (text[i] === '\\') {
        const match = text.slice(i).match(/^\\([A-Za-z@]+\*?|[^])/);
        if (!match) { out += text[i++]; continue; }
        const name = match[1].replace(/\*$/, '');
        let j = i + match[0].length;
        if (name === '(' || name === '[') {
          j = Math.min(end, closing(name === '(' ? '\\)' : '\\]', j));
          out += text.slice(i, j); i = j; continue;
        }
        if (name === 'verb' || name === 'lstinline') {
          if (text[j] === '[') j = balanced(j, ']');
          const delimiter = text[j];
          const stop = delimiter ? text.indexOf(delimiter, j + 1) : -1;
          j = stop < 0 ? end : stop + 1;
          out += text.slice(i, j); i = j; continue;
        }
        if (name === 'begin') {
          const env = text.slice(j).match(/^\s*\{([^}]+)\}/);
          if (env && literalEnvs.test(env[1])) {
            const stop = text.indexOf('\\end{' + env[1] + '}', j + env[0].length);
            j = stop < 0 ? end : stop + env[1].length + 6;
            out += text.slice(i, j); i = j; continue;
          }
        }
        out += text.slice(i, j);
        i = j;
        let argument = 0;
        // Unknown commands are conservative: their arguments may be identifiers,
        // paths or macro definitions. Known prose arguments are scanned recursively.
        while (i < end) {
          const whitespace = text.slice(i, end).match(/^(?:\s|%[^\r\n]*(?:\r\n|\r|\n|$))*/)[0];
          const groupStart = i + whitespace.length;
          const open = text[groupStart];
          if (open !== '{' && open !== '[') break;
          const groupEnd = Math.min(end, balanced(groupStart, open === '{' ? '}' : ']'));
          const closed = text[groupEnd - 1] === (open === '{' ? '}' : ']');
          const isProse = open === '{' && (textCommands.has(name) || (name === 'href' && argument === 1));
          out += whitespace + open;
          out += isProse ? scan(groupStart + 1, groupEnd - (closed ? 1 : 0)) : text.slice(groupStart + 1, groupEnd - (closed ? 1 : 0));
          if (closed) out += text[groupEnd - 1];
          if (open === '{') argument++;
          i = groupEnd;
        }
        continue;
      }
      if (text[i] === '{') {
        const j = Math.min(end, balanced(i, '}'));
        const closed = text[j - 1] === '}';
        out += '{' + scan(i + 1, j - (closed ? 1 : 0)) + (closed ? '}' : '');
        i = j; continue;
      }
      let j = i + 1;
      while (j < end && !'\\$%{'.includes(text[j])) j++;
      out += plain(text.slice(i, j), text[j] || '');
      i = j;
    }
    return out;
  }
  return { text: scan(0, text.length), changes };
}
