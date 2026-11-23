/**
 * LaTeX asset / figure path resolution supporting \graphicspath, \svgpath,
 * \DeclareGraphicsExtensions, omitted extensions, and project asset fallbacks.
 */

export const DEFAULT_IMAGE_EXTENSIONS = [
  '.pdf', '.png', '.jpg', '.jpeg', '.svg', '.eps', '.webp', '.gif', '.bmp'
];

/** Strip unescaped LaTeX % comments line-by-line. */
export function stripLatexComments(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '%') {
          let slashes = 0;
          for (let j = i - 1; j >= 0 && line[j] === '\\'; j--) slashes++;
          if (slashes % 2 === 0) return line.slice(0, i);
        }
      }
      return line;
    })
    .join('\n');
}

/** Read a balanced {...} group starting at openIndex (which must point to '{'). */
function readBraceGroup(text, openIndex) {
  if (text[openIndex] !== '{') return null;
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') { i++; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { content: text.slice(openIndex + 1, i), end: i + 1 };
    }
  }
  return null;
}

/**
 * Extract directory entries from \graphicspath{...} and \svgpath{...},
 * extension order from \DeclareGraphicsExtensions{...}, and preamble \input files.
 */
export function extractGraphicsConfig(text) {
  const clean = stripLatexComments(text);
  const paths = [];
  const extensions = [];
  const preambleInputs = [];

  const pathCmdRe = /\\(?:graphicspath|svgpath)\s*\{/g;
  let m;
  while ((m = pathCmdRe.exec(clean))) {
    const outer = readBraceGroup(clean, m.index + m[0].length - 1);
    if (!outer) continue;
    const body = outer.content;
    let i = 0;
    while (i < body.length) {
      if (body[i] === '{') {
        const inner = readBraceGroup(body, i);
        if (!inner) break;
        const dir = inner.content.trim();
        if (dir) paths.push(dir);
        i = inner.end;
      } else {
        i++;
      }
    }
    pathCmdRe.lastIndex = outer.end;
  }

  const extRe = /\\DeclareGraphicsExtensions\s*\{([^}]+)\}/g;
  while ((m = extRe.exec(clean))) {
    for (const part of m[1].split(',')) {
      const ext = part.trim();
      if (ext) extensions.push(ext.startsWith('.') ? ext : '.' + ext);
    }
  }

  const docStart = clean.search(/\\begin\s*\{document\}/);
  const preamble = docStart >= 0 ? clean.slice(0, docStart) : clean;
  const inputRe = /\\(?:input|include)\s*\{([^}]+)\}/g;
  while ((m = inputRe.exec(preamble))) {
    const target = m[1].trim();
    if (target) preambleInputs.push(target);
  }

  return {
    paths: [...new Set(paths)],
    extensions: [...new Set(extensions)],
    preambleInputs: [...new Set(preambleInputs)]
  };
}

/** Normalize path segments (resolving '.' and '..') while preserving separator style. */
export function resolveRelativePath(baseDir, rel) {
  const rawRel = String(rel || '').trim();
  if (!rawRel) return '';
  const useBackslash = String(baseDir || '').includes('\\') && !String(baseDir || '').includes('/');
  const relSlash = rawRel.replace(/\\/g, '/');
  const isAbsRel = /^(?:[a-zA-Z]:\/|\/)/.test(relSlash);
  const combined = isAbsRel
    ? relSlash
    : (baseDir ? String(baseDir).replace(/\\/g, '/').replace(/\/+$/, '') + '/' + relSlash : relSlash);

  let prefix = '';
  let rest = combined;
  const drive = rest.match(/^([a-zA-Z]:)\//);
  if (drive) {
    prefix = drive[1] + '/';
    rest = rest.slice(prefix.length);
  } else if (rest.startsWith('//')) {
    prefix = '//';
    rest = rest.slice(2);
  } else if (rest.startsWith('/')) {
    prefix = '/';
    rest = rest.slice(1);
  }

  const stack = [];
  for (const seg of rest.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (stack.length && stack[stack.length - 1] !== '..') stack.pop();
      else if (!prefix) stack.push('..');
    } else {
      stack.push(seg);
    }
  }
  const normalized = prefix + stack.join('/');
  return useBackslash ? normalized.replace(/\//g, '\\') : normalized;
}

/** Clean a LaTeX graphics reference (e.g. `{my.fig}.pdf` -> `my.fig.pdf`). */
export function cleanGraphicsRef(ref) {
  let s = String(ref || '').trim();
  if (!s) return '';
  // LaTeX allows {{name.with.dots}.pdf} or {name.with.dots}.pdf
  s = s.replace(/^\{([^{}]+)\}(\.[a-zA-Z0-9]+)?$/, '$1$2');
  return s.replace(/\\/g, '/');
}

/**
 * Build ordered, deduplicated candidate absolute paths for a graphics reference.
 */
export function buildAssetCandidates(ref, options = {}) {
  const clean = cleanGraphicsRef(ref);
  if (!clean) return [];

  const {
    projectRoot = '',
    rootDir = '',
    activeDir = '',
    graphicsPaths = [],
    extensions = [],
    projectAssets = []
  } = options;

  const exts = [...new Set([...extensions, ...DEFAULT_IMAGE_EXTENSIONS])];
  const hasKnownExt = /\.(?:pdf|png|jpe?g|svg|eps|webp|gif|bmp)$/i.test(clean);
  const nameVariants = hasKnownExt ? [clean] : [clean, ...exts.map((e) => clean + e)];

  const candidates = [];
  const seen = new Set();
  const push = (p) => {
    if (!p) return;
    const key = p.replace(/\\/g, '/').toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(p);
  };

  if (/^(?:[a-zA-Z]:\/|\/)/.test(clean)) {
    for (const v of nameVariants) push(resolveRelativePath('', v));
    return candidates;
  }

  const searchDirs = [];
  const seenDirs = new Set();
  const pushDir = (d) => {
    if (!d) return;
    const norm = d.replace(/\\/g, '/').replace(/\/+$/, '');
    const key = norm.toLowerCase();
    if (seenDirs.has(key)) return;
    seenDirs.add(key);
    searchDirs.push(d);
  };

  const anchors = [rootDir, projectRoot, activeDir].filter(Boolean);

  // 1. Explicit \graphicspath / \svgpath directories resolved against rootDir, projectRoot, activeDir
  for (const gp of graphicsPaths) {
    const trimmed = String(gp || '').trim();
    if (!trimmed) continue;
    if (/^(?:[a-zA-Z]:[\\/]|[\\/])/.test(trimmed)) {
      pushDir(resolveRelativePath('', trimmed));
    } else {
      for (const anchor of anchors) {
        pushDir(resolveRelativePath(anchor, trimmed));
      }
    }
  }

  // 2. Direct anchor directories (rootDir, projectRoot, activeDir)
  for (const anchor of anchors) pushDir(anchor);

  for (const dir of searchDirs) {
    for (const v of nameVariants) {
      push(resolveRelativePath(dir, v));
    }
  }

  // 3. Fallback: match against indexed project assets (handles paths declared in .cls/.sty)
  if (projectRoot && Array.isArray(projectAssets) && projectAssets.length) {
    const cleanRel = clean.replace(/^\.\//, '');
    const targetLower = cleanRel.toLowerCase();
    const variantLowers = nameVariants.map((v) => v.replace(/^\.\//, '').toLowerCase());
    for (const assetRel of projectAssets) {
      const normAsset = String(assetRel || '').replace(/\\/g, '/').replace(/^\.\//, '');
      const lower = normAsset.toLowerCase();
      const matched = variantLowers.some((v) => lower === v || lower.endsWith('/' + v))
        || (!hasKnownExt && (lower === targetLower || lower.endsWith('/' + targetLower)));
      if (matched) push(resolveRelativePath(projectRoot, normAsset));
    }
  }

  return candidates;
}

/**
 * Find the \includegraphics / \includesvg command covering `offset` in `text`.
 * Works for single-line, multiple-per-line, and multi-line invocations.
 */
export function matchGraphicsAtOffset(text, offset) {
  const re = /\\(?:includegraphics|includesvg)\*?\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index;
    const end = start + m[0].length;
    if (offset >= start && offset <= end) {
      return { file: m[1].trim(), start, end, raw: m[0] };
    }
  }
  return null;
}

/**
 * Resolve a graphics reference to the first existing non-directory file on disk.
 */
export async function resolveAssetPath(ref, options, statFile) {
  const candidates = buildAssetCandidates(ref, options);
  for (const abs of candidates) {
    const stat = await statFile(abs);
    if (stat?.ok && !stat.dir) {
      return { abs, stat };
    }
  }
  return null;
}
