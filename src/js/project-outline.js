// Expand includes at their position in the document, rather than sorting files.
export async function projectOutline(rootFile, readFile) {
  const result = [], stack = new Set();
  const normalize = file => {
    const parts = [];
    for (const part of file.replace(/\\/g, '/').split('/')) {
      if (part === '..') parts.pop();
      else if (part !== '.') parts.push(part);
    }
    return parts.join('/');
  };
  const root = normalize(rootFile), base = root.slice(0, root.lastIndexOf('/') + 1);
  const levels = { part: 0, chapter: 1, section: 2, subsection: 3, subsubsection: 4 };
  async function walk(file, depth = 0) {
    file = normalize(file);
    const key = file.toLowerCase();
    if (stack.has(key) || depth > 40) return;
    stack.add(key);
    const text = await readFile(file);
    const lines = String(text || '').split(/\r?\n/);
    let verbatim = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].replace(/(?<!\\)(?:\\\\)*%.*/, '');
      if (/\\begin\{(?:verbatim\*?|lstlisting|minted)\}/.test(line)) verbatim = true;
      if (verbatim) { if (/\\end\{(?:verbatim\*?|lstlisting|minted)\}/.test(line)) verbatim = false; continue; }
      const re = /\\(part|chapter|section|subsection|subsubsection)\*?(?:\[[^\]]*\])?\{([^}]*)\}|\\(input|include|subfile)\s*(?:\{([^}]+)\}|([^\s%]+))/g;
      let m;
      while ((m = re.exec(line))) {
        if (m[1]) result.push({ file: rootFile.includes('\\') ? file.replace(/\//g, '\\') : file, rel: file.startsWith(base) ? file.slice(base.length) : file, line: i + 1, level: levels[m[1]], title: m[2].trim() });
        else {
          let rel = (m[4] || m[5]).trim();
          if (!/\.[a-z]+$/i.test(rel)) rel += '.tex';
          // TeX resolves ordinary inputs against the main document's working directory.
          await walk(/^(?:[a-z]:|\/)/i.test(rel) ? rel : base + rel, depth + 1);
        }
      }
    }
    stack.delete(key);
  }
  await walk(root);
  return result;
}
