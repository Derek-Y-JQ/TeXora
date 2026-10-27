'use strict';
/**
 * LaTeX build pipeline: multi-engine recipes, bibliography passes,
 * log parsing, PDF preview rasterization, SyncTeX queries and
 * isolated snippet compilation (math / TikZ / tables).
 */
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const { run, killTree } = require('./run');
const { codeEnvironment, mintedEnabled } = require('./code-tools');

const AUX_EXT = new Set([
  '.aux', '.log', '.out', '.toc', '.lof', '.lot', '.synctex.gz', '.synctex', '.bbl', '.blg',
  '.fls', '.fdb_latexmk', '.xdv', '.bcf', '.run.xml', '.nav', '.snm', '.vrb', '.idx', '.ind',
  '.ilg', '.glo', '.gls', '.glg', '.loa', '.lol', '.thm', '.brf', '.spl', '.acn', '.acr', '.alg'
]);

const PDF_RENDER_DPI = 128;

function splitArgs(str) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(str || ''))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function pngSize(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(24);
    fs.readSync(fd, buf, 0, 24, 0);
    fs.closeSync(fd);
    if (buf.toString('ascii', 1, 4) !== 'PNG') return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } catch {
    return null;
  }
}

function countPagesFromPngs(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => /^page-\d+\.png$/.test(f)).length;
  } catch {
    return 0;
  }
}

/** Parse a LaTeX log / transcript into structured problems. */
function parseLatexLog(text, opts = {}) {
  const rootFile = opts.rootFile || '';
  const problems = [];
  if (!text) return problems;
  const lines = text.replace(/\r/g, '').split('\n');
  const push = (p) => {
    if (!p.message) return;
    const key = `${p.severity}|${p.file || ''}|${p.line || 0}|${p.message}`;
    if (problems.some((x) => x._key === key)) return;
    p._key = key;
    problems.push(p);
  };
  let pendingPackage = '';
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // file:line: message   (with -file-line-error)
    let m = line.match(/^(.+?\.(?:tex|sty|cls|def|bib|ltx)):(\d+):\s*(.+)$/);
    if (m && !/^(Package|LaTeX|Overfull|Underfull|Class)\b/.test(line)) {
      const msg = m[3].trim();
      const sev = /^(warning|Warning)/i.test(msg) ? 'warning' : 'error';
      push({ severity: sev, file: m[1], line: Number(m[2]), message: msg, raw: line, source: 'latex' });
      continue;
    }

    m = line.match(/^!\s+(.+)$/);
    if (m) {
      let msg = m[1].trim();
      let file = rootFile;
      let lineno = 0;
      // LaTeX reports "! LaTeX Error: File `x.sty' not found." plus the next help lines
      for (let j = i + 1; j < Math.min(i + 30, lines.length); j++) {
        const nxt = lines[j];
        const lm = nxt.match(/^l\.(\d+)\s?(.*)$/);
        if (lm) {
          lineno = Number(lm[1]);
          break;
        }
        const fm = nxt.match(/^\\\.\.\.|\s*$/);
        if (fm) continue;
        if (/^\(\/|^l\./.test(nxt)) break;
      }
      const missing = msg.match(/File [`']([^'`]+)' not found/);
      if (missing) {
        push({
          severity: 'error',
          file,
          line: lineno,
          message: `缺少宏包或文件：${missing[1]}`,
          detail: msg,
          missingFile: missing[1],
          source: 'latex'
        });
        continue;
      }
      if (/^Undefined control sequence/.test(msg)) {
        const ctx = lines[i + 1] && lines[i + 1].trim().startsWith('l.') ? lines[i + 1].trim() : '';
        push({ severity: 'error', file, line: lineno, message: msg + (ctx ? ` (${ctx})` : ''), source: 'latex' });
        continue;
      }
      push({ severity: 'error', file, line: lineno, message: msg, source: 'latex' });
      continue;
    }

    // Overfull / Underfull boxes
    m = line.match(/^(Overfull|Underfull) \\([hv])box \(([\d.]+)pt too (?:wide|high|short)\)[^]*?lines? (\d+)(?:--(\d+))?/);
    if (!m) {
      m = line.match(/^(Overfull|Underfull) \\([hv])box.*?(?:at lines? (\d+)(?:--(\d+))?|detected at line (\d+))/);
    }
    if (m) {
      const ln = Number(m[3] || m[5] || 0);
      push({
        severity: 'warning',
        file: rootFile,
        line: ln,
        message: `${m[1]} \\${m[2]}box` + (m[3] ? `（约 ${m[3]}pt）` : ''),
        detail: line,
        source: 'latex',
        kind: 'badbox'
      });
      continue;
    }

    if (/^LaTeX Warning:\s+/.test(line)) {
      let msg = line.replace(/^LaTeX Warning:\s+/, '');
      let ln = 0;
      const lm = line.match(/on input line (\d+)/);
      if (lm) ln = Number(lm[1]);
      // continuation lines belong to the warning
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (/^\(|^\s*$|^!{1}|^LaTeX Warning|^Package/.test(lines[j])) break;
        msg += ' ' + lines[j].trim();
      }
      push({ severity: 'warning', file: rootFile, line: ln, message: msg, source: 'latex' });
      continue;
    }

    m = line.match(/^Package ([^\s]+) Warning:\s+(.+)$/);
    if (m) {
      pendingPackage = m[1];
      let msg = m[2];
      const lm = line.match(/on input line (\d+)/);
      let ln = lm ? Number(lm[1]) : 0;
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const nxt = lines[j];
        if (/^[A-Z(]|^\s*$|^!{1}/.test(nxt)) break;
        msg += ' ' + nxt.trim();
        const l2 = nxt.match(/on input line (\d+)/);
        if (l2) ln = Number(l2[1]);
      }
      if (/Please \(re\)run|Rerun to get|rerunfilecheck/i.test(msg)) {
        push({ severity: 'info', file: rootFile, line: ln, message: `${m[1]}: ${msg}`, source: 'latex' });
      } else {
        push({ severity: 'warning', file: rootFile, line: ln, message: `${m[1]}: ${msg}`, source: 'latex' });
      }
      continue;
    }

    if (/^Class ([^\s]+) Warning:/.test(line)) {
      push({ severity: 'warning', file: rootFile, line: 0, message: line, source: 'latex' });
      continue;
    }

    if (/^!{1,2}\s*Run number|^Rerun to get cross-references/.test(line)) {
      push({ severity: 'info', file: rootFile, line: 0, message: '需要再次编译以更新交叉引用', source: 'latex' });
    }
  }
  return problems.map(({ _key, ...p }) => p);
}

class Compiler {
  constructor({ store, project, tex, history, send, fallbackCacheRoot }) {
    this.store = store;
    this.project = project;
    this.tex = tex;
    this.history = history;
    this.send = send || (() => {});
    this.fallbackCacheRoot = fallbackCacheRoot || require('node:os').tmpdir();
    this.activeCache = '';
    this.running = false;
    this.childPid = 0;
    this.lastResult = null;
    this._queue = [];
    this.startedAt = 0;
    this.logFile = '';
  }

  get root() {
    return this.project.root;
  }

  cacheDir() {
    if (this.activeCache && this.activeCacheRoot === this.root) return this.activeCache;
    const name = this.store.get('build.cacheDir', '.latex_cache') || '.latex_cache';
    return path.join(this.root, name);
  }

  /**
   * Use <project>/.latex_cache when it is writable; otherwise fall back to the
   * user data directory (e.g. when the project lives inside a read-only
   * installation folder such as Program Files).
   */
  async resolveCacheDir(root = this.root) {
    const name = this.store.get('build.cacheDir', '.latex_cache') || '.latex_cache';
    const primary = path.join(root, name);
    const probe = async (dir) => {
      try {
        await fsp.mkdir(dir, { recursive: true });
        // Inline previews run concurrently. A shared probe name caused another
        // task's unlink to masquerade as a permissions failure and switch caches.
        const test = path.join(dir, '.texora-write-test-' + process.pid + '-' + crypto.randomBytes(6).toString('hex'));
        await fsp.writeFile(test, 'ok');
        await fsp.unlink(test);
        return true;
      } catch {
        return false;
      }
    };
    let target = primary;
    if (!(await probe(primary))) {
      const hash = crypto.createHash('sha1').update(root || '').digest('hex').slice(0, 12);
      target = path.join(this.fallbackCacheRoot, 'build-cache', hash);
      await fsp.mkdir(target, { recursive: true }).catch(() => {});
      this.send('build:log', { chunk: `\n[cache] 项目目录不可写，改用用户缓存：${target}\n` });
    }
    if (this.root === root) { this.activeCache = target; this.activeCacheRoot = root; }
    return target;
  }

  jobnameFor(rootFile) {
    return path.basename(rootFile || 'main.tex', path.extname(rootFile || 'main.tex'));
  }

  resolveRootFile(file) {
    const preferred = file && /\.tex$/i.test(file) ? file : '';
    const rootFile = this.project.rootFile || preferred;
    if (rootFile && fs.existsSync(rootFile)) return rootFile;
    if (preferred && fs.existsSync(preferred)) return preferred;
    return rootFile;
  }

  async build(options = {}) {
    if (this.running) {
      this._queue.push(options);
      return { ok: false, queued: true };
    }
    if (!this.root) return { ok: false, error: '尚未打开项目' };
    const rootFile = this.resolveRootFile(options.file);
    if (!rootFile || !fs.existsSync(rootFile)) return { ok: false, error: '未找到主文档（含 \\documentclass 的 .tex 文件）' };
    const projectRoot = this.root;
    const revision = this.project.revision;
    this._artifactGeneration = (this._artifactGeneration || 0) + 1;
    const send = (event, payload) => { if (this.root === projectRoot && this.project.revision === revision) this.send(event, { ...payload, projectRoot, revision }); };
    const engine = options.engine || this.store.get('build.engine', 'xelatex');
    const token = { cancelled: false };
    this._buildToken = token;
    const checkCancelled = () => {
      if (token.cancelled || this.root !== projectRoot || this.project.revision !== revision) throw Object.assign(new Error('编译已停止'), { code: 'TEXORA_CANCELLED' });
    };
    this._preCache = null;
    this._snippetTier = null;
    const cache = await this.resolveCacheDir();
    await fsp.mkdir(cache, { recursive: true });
    const previewDir = path.join(cache, 'preview');
    await fsp.mkdir(previewDir, { recursive: true });
    const jobname = this.jobnameFor(rootFile);
    const rootDir = path.dirname(rootFile);
    const relRoot = path.relative(this.root, rootFile) || path.basename(rootFile);
    // TeX must run from the directory that contains the root document so that
    // \input{sections/...}, \includegraphics{figures/...} and relative .bib
    // paths resolve exactly as they do on the command line. This also makes
    // projects whose main.tex lives in a subdirectory (samples/demo) work.
    const docArg = path.basename(rootFile);
    const runCwd = rootDir;
    const pdfPath = path.join(cache, jobname + '.pdf');
    const started = Date.now();
    if (token.cancelled) return { ok: false, cancelled: true };
    this.running = true;
    this.startedAt = started;
    const before = fs.existsSync(pdfPath) ? fs.statSync(pdfPath).mtimeMs : 0;

    send('build:status', { state: 'running', engine, rootFile, jobname, pass: 0 });
    send('build:log', { chunk: `\n€ TeXora 编译开始 · ${engine} · ${path.basename(rootFile)}\n`, reset: true });

    const env = codeEnvironment(this.store, this.tex.env || {});
    if (this.store.get('build.autoInstallMissing', 'ask') === 'auto') env.MIKTEX_AUTOINSTALL = '1';
    const extra = splitArgs(this.store.get('build.extraArgs', ''));
    if (mintedEnabled(this.store, this.root) && !extra.includes('-shell-escape')) extra.push('-shell-escape');
    const maxRuns = Math.max(1, Number(this.store.get('build.maxRuns', 3)) || 3);
    const timeout = Math.max(20, Number(this.store.get('build.timeout', 180)) || 180) * 1000;
    const recipe = this.store.get('build.recipe', 'auto');
    const actualRecipe = recipe === 'auto' ? engine : recipe;

    const results = [];
    let code = 0;
    let timedOut = false;
    let transcript = '';

    const exec = async (exe, args, cwd = this.root, passLabel = '') => {
      checkCancelled();
      const outFile = path.join(cache, 'compile-console.log');
      const res = await run(exe, args, {
        cwd,
        env,
        timeout,
        outFile,
        onSpawn: (child) => { this.childPid = child.pid; },
        onChunk: (chunk) => send('build:log', { chunk })
      });
      transcript += res.output;
      code = res.code;
      timedOut = res.timedOut;
      results.push({ exe: path.basename(exe), args, code: res.code, pass: passLabel });
      this.childPid = 0;
      checkCancelled();
      return res;
    };

    try {
      if (actualRecipe === 'latexmk' && this.tex.get('latexmk')) {
        const args = [
          engine === 'pdflatex' ? '-pdf' : engine === 'lualatex' ? '-lualatex' : '-xelatex',
          '-synctex=1', '-interaction=nonstopmode', '-file-line-error', '-halt-on-error=0',
          `-outdir=${cache}`, docArg
        ].concat(extra);
        await exec(this.tex.get('latexmk'), args, runCwd, 'latexmk');
      } else {
        const engineName = engine === 'latexmk' ? 'xelatex' : engine;
        const exe = this.tex.get(engineName) || this.tex.get('xelatex') || this.tex.get('pdflatex');
        if (!exe) throw new Error('未找到可用的 LaTeX 引擎，请在设置中配置 TeX 发行版路径');
        const baseArgs = [
          '-synctex=1',
          '-interaction=nonstopmode',
          '-file-line-error',
          `-output-directory=${cache}`,
          docArg
        ].concat(extra);
        const sourceText = await fsp.readFile(rootFile, 'utf8').catch(() => '');
        const needsRerun = /\\(ref|eqref|pageref|autoref|cref|Cref|cite[a-zA-Z]*|tableofcontents|listoffigures|listoftables|bibliography|addbibresource|printbibliography|footnote)\b/.test(sourceText);
        const runs = needsRerun ? Math.min(maxRuns, 3) : 2;
        for (let pass = 1; pass <= runs; pass++) {
          send('build:status', { state: 'running', engine: engineName, rootFile, jobname, pass, total: runs, runs });
          send('build:log', { chunk: `\n— 第 ${pass}/${runs} 遍（${engineName}）—\n` });
          await exec(exe, baseArgs, runCwd, `pass${pass}`);
          const auxPath = path.join(cache, jobname + '.aux');
          const bcfPath = path.join(cache, jobname + '.bcf');
          if (pass === 1) {
            const bibEngine = this.store.get('build.bibliography', 'biber');
            const auxText = fs.existsSync(auxPath) ? await fsp.readFile(auxPath, 'utf8').catch(() => '') : '';
            if ((bibEngine === 'biber' || fs.existsSync(bcfPath)) && fs.existsSync(bcfPath) && this.tex.get('biber')) {
              send('build:log', { chunk: '\n— 参考文献（Biber）—\n' });
              await exec(this.tex.get('biber'), ['--input-directory', rootDir, '--output-directory', cache, bcfPath], cache, 'biber');
            } else if (/\\bibdata|\\citation/.test(auxText) && this.tex.get('bibtex')) {
              send('build:log', { chunk: '\n— 参考文献（BibTeX）—\n' });
              const bibEnv = { ...env, BIBINPUTS: [rootDir, this.root, cache].join(path.delimiter), BSTINPUTS: [rootDir, this.root, cache].join(path.delimiter) };
              await run(this.tex.get('bibtex'), [jobname], {
                cwd: cache,
                env: bibEnv,
                timeout,
                onSpawn: (child) => { this.childPid = child.pid; },
                onChunk: (chunk) => send('build:log', { chunk })
              }).then((r) => { transcript += r.output; results.push({ exe: 'bibtex', code: r.code }); this.childPid = 0; });
            }
          }
          if (timedOut) break;
        }
      }

      const pdfFresh = fs.existsSync(pdfPath) && fs.statSync(pdfPath).mtimeMs > started - 1500;
      const pdfStat = fs.existsSync(pdfPath) ? fs.statSync(pdfPath) : null;
      let logText = '';
      const logPath = path.join(cache, jobname + '.log');
      if (fs.existsSync(logPath)) logText = await fsp.readFile(logPath, 'utf8').catch(() => '');
      if (!logText || logText.trim().length < 20) logText = transcript;
      const problems = parseLatexLog(logText, { rootFile });
      if (!/Output written on/.test(transcript) && /I can't find file|not found\.|Emergency stop/.test(transcript) && /main\.tex|.tex/.test(transcript)) {
        problems.unshift({
          severity: 'error',
          file: rootFile,
          line: 0,
          message: `无法启动排版：TeX 找不到主文档 ${path.basename(rootFile)}。请打开直接包含该文件的文件夹，或在状态栏切换主文档。`,
          detail: transcript.slice(-800),
          source: 'texora'
        });
      }
      const errors = problems.filter((p) => p.severity === 'error');
      const ok = (pdfFresh && pdfStat && pdfStat.size > 0) && (code === 0 || errors.length === 0 || /Output written on/.test(transcript));

      // copy PDF next to sources
      let rootPdf = '';
      if (ok && this.store.get('build.pdfInRoot', true) && pdfStat) {
        rootPdf = path.join(rootDir, jobname + '.pdf');
        try { await fsp.copyFile(pdfPath, rootPdf); } catch (err) { console.warn('copy pdf failed', err.message); }
      }

      const missing = errors.find((p) => p.missingFile && /\.sty$/.test(p.missingFile));
      let autoInstalled = null;
      if (!ok && missing && this.store.get('build.autoInstallMissing', 'ask') === 'auto') {
        const pkgName = missing.missingFile.replace(/\.sty$/, '');
        send('build:log', { chunk: `\n— 自动安装缺失宏包 ${pkgName} —\n` });
        autoInstalled = await this.tex.installPackage(pkgName);
        if (autoInstalled.ok) {
          this.running = false;
          const retry = await this.build({ ...options, retried: true });
          return retry;
        }
      }

      const pages = ok ? await this.renderPages(pdfPath, previewDir) : await this.readExistingPages(previewDir);
      checkCancelled();
      const duration = Date.now() - started;
      const result = {
        ok,
        engine: actualRecipe === 'latexmk' ? 'latexmk' : engine,
        code,
        timedOut,
        duration,
        rootFile,
        projectRoot, revision,
        jobname,
        pdf: ok ? pdfPath : '',
        rootPdf,
        pages,
        problems,
        errorCount: errors.length,
        warningCount: problems.filter((p) => p.severity === 'warning').length,
        transcriptTail: transcript.slice(-4000),
        autoInstalled
      };
      checkCancelled();
      this.lastResult = result;
      if (ok && this.history) {
        this.history.snapshot(rootFile, await fsp.readFile(rootFile, 'utf8').catch(() => ''), 'build');
      }
      checkCancelled();
      send('build:done', result);
      return result;
    } catch (err) {
      if (token.cancelled || this.root !== projectRoot || this.project.revision !== revision || err.code === 'TEXORA_CANCELLED') return { ok: false, cancelled: true };
      const result = {
        ok: false,
        engine,
        error: err.message,
        projectRoot, revision,
        duration: Date.now() - started,
        rootFile,
        pages: await this.readExistingPages(previewDir),
        problems: [{ severity: 'error', file: rootFile, line: 0, message: err.message, source: 'texora' }],
        errorCount: 1,
        warningCount: 0,
        transcriptTail: transcript.slice(-4000)
      };
      this.lastResult = result;
      send('build:done', result);
      return result;
    } finally {
      this.running = false;
      send('build:status', { state: 'idle' });
      if (this._queue.length) {
        const next = this._queue.shift();
        setTimeout(() => this.build(next), 40);
      }
    }
  }

  /** Extract clickable link rectangles (internal page jumps + external URLs). */
  async extractLinks(pdfPath, pageCount) {
    const exe = this.tex.get('pdftohtml');
    if (!exe || !pageCount) return {};
    const dir = path.dirname(pdfPath);
    const outBase = 'links';
    await run(exe, ['-xml', '-i', '-q', '-f', '1', '-l', String(pageCount), path.basename(pdfPath), outBase], {
      cwd: dir,
      env: this.tex.env,
      timeout: 120000
    });
    let xml = '';
    try {
      xml = await fsp.readFile(path.join(dir, outBase + '.xml'), 'utf8');
    } catch {
      return {};
    }
    const map = {};
    for (const block of xml.split(/<page /).slice(1)) {
      const num = Number((block.match(/number="(\d+)"/) || [])[1] || 0);
      const pw = Number((block.match(/width="([\d.]+)"/) || [])[1] || 0);
      const ph = Number((block.match(/height="([\d.]+)"/) || [])[1] || 0);
      if (!num || !pw || !ph) continue;
      const links = [];
      const re = /<text\s+([^>]*)>([\s\S]*?)<\/text>/g;
      let m;
      while ((m = re.exec(block))) {
        const attrs = m[1];
        const content = m[2];
        const href = (content.match(/<a\s+href="([^"]+)"/) || [])[1];
        if (!href) continue;
        const top = Number((attrs.match(/top="(-?[\d.]+)"/) || [])[1] || 0);
        const left = Number((attrs.match(/left="(-?[\d.]+)"/) || [])[1] || 0);
        const width = Number((attrs.match(/width="([\d.]+)"/) || [])[1] || 0);
        const height = Number((attrs.match(/height="([\d.]+)"/) || [])[1] || 0);
        let page = 0;
        let url = '';
        const pm = href.match(/#(\d+)$/);
        if (pm) page = Number(pm[1]);
        else if (/^(https?:|mailto:)/i.test(href)) url = href;
        if (!page && !url) continue;
        links.push({ x: left / pw, y: top / ph, w: width / pw, h: height / ph, page, url });
      }
      if (links.length) map[num] = links;
    }
    return map;
  }

  /** Load an existing PDF (last build) without invoking TeX. */
  async loadExisting() {
    const projectRoot = this.root;
    const revision = this.project.revision;
    const rootFile = this.resolveRootFile();
    const artifactGeneration = this._artifactGeneration;
    const current = () => this._artifactGeneration === artifactGeneration && !this.running && this.root === projectRoot && this.project.rootFile === rootFile && this.project.revision === revision;
    if (!projectRoot || !rootFile) return { ok: false, noPdf: true };
    const jobname = this.jobnameFor(rootFile);
    const rootDir = path.dirname(rootFile);
    const primary = path.join(projectRoot, this.store.get('build.cacheDir', '.latex_cache'));
    const fallback = path.join(this.fallbackCacheRoot, 'build-cache', crypto.createHash('sha1').update(projectRoot).digest('hex').slice(0, 12));
    const dirs = [...new Set([primary, fallback, rootDir, projectRoot, path.join(rootDir, 'build'), path.join(rootDir, 'out')])];
    const candidates = await Promise.all(dirs.map(async dir => {
      const file = path.join(dir, jobname + '.pdf');
      const stat = await fsp.stat(file).catch(() => null);
      return stat?.isFile() && stat.size ? { file, stat } : null;
    }));
    const found = candidates.filter(Boolean).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    if (!current()) return { ok: false, cancelled: true };
    if (!found.length) return { ok: false, noPdf: true, projectRoot, rootFile };
    let { file: pdfPath, stat } = found[0];
    // Root copies and cache output may have different mtimes. Bind SyncTeX only
    // to the displayed bytes, never to an unrelated older build with the same name.
    const hasTrace = file => fs.existsSync(file.replace(/\.pdf$/i, '.synctex.gz')) || fs.existsSync(file.replace(/\.pdf$/i, '.synctex'));
    let tracePdf = hasTrace(pdfPath) ? pdfPath : '';
    if (!tracePdf) {
      let digest;
      for (const candidate of found) {
        if (!hasTrace(candidate.file) || candidate.stat.size !== stat.size) continue;
        digest ||= crypto.createHash('sha256').update(await fsp.readFile(pdfPath)).digest('hex');
        if (crypto.createHash('sha256').update(await fsp.readFile(candidate.file)).digest('hex') === digest) { tracePdf = candidate.file; break; }
      }
    }
    if (tracePdf && tracePdf !== pdfPath) { pdfPath = tracePdf; stat = await fsp.stat(pdfPath); }
    const cache = await this.resolveCacheDir(projectRoot);
    const pages = await this.renderPages(pdfPath, path.join(cache, 'preview')).catch(() => []);
    if (!current()) return { ok: false, cancelled: true };
    if (!pages.length) return { ok: false, error: '已有 PDF，但无法生成预览图片', projectRoot, rootFile };
    const result = { ok: true, cached: true, projectRoot, revision, rootFile,
      pdf: pdfPath, cachedPdf: pdfPath, synctexPdf: tracePdf,
      rootPdf: path.join(rootDir, jobname + '.pdf'), pages, problems: [],
      errorCount: 0, warningCount: 0, duration: 0, at: stat.mtimeMs };
    this.lastResult = result;
    return result;
  }

  async renderPages(pdfPath, previewDir) {
    const stat = await fsp.stat(pdfPath);
    const signature = JSON.stringify([path.resolve(pdfPath), stat.size, stat.mtimeMs, PDF_RENDER_DPI]);
    const key = crypto.createHash('sha256').update(signature).digest('hex').slice(0, 24);
    // Immutable per-PDF directories prevent concurrent projects/builds from
    // deleting pages that a currently displayed preview is still reading.
    previewDir = path.join(previewDir, key);
    const manifest = path.join(previewDir, 'manifest.json');
    const saved = await fsp.readFile(manifest, 'utf8').then(JSON.parse).catch(() => null);
    if (saved?.signature === signature && saved.pages?.length && saved.pages.every(p => fs.existsSync(p.file))) return saved.pages;
    this._renderJobs ||= new Map();
    if (this._renderJobs.has(manifest)) return this._renderJobs.get(manifest);
    const job = this.renderUncached(pdfPath, previewDir, signature);
    this._renderJobs.set(manifest, job);
    try { return await job; } finally { this._renderJobs.delete(manifest); }
  }

  async renderUncached(pdfPath, previewDir, signature) {
    const out = [];
    if (!this.tex.get('pdftoppm') && !this.tex.get('pdftocairo')) { try { this.tex.detect(); } catch {} }
    if (!this.tex.get('pdftoppm') && !this.tex.get('pdftocairo')) return out;
    await fsp.mkdir(previewDir, { recursive: true });
    // Poppler on Windows needs ASCII relative arguments even for Unicode projects.
    await fsp.copyFile(pdfPath, path.join(previewDir, 'document.pdf'));
    const options = { timeout: 120000, env: this.tex.env, cwd: previewDir };
    let res;
    if (this.tex.get('pdftoppm')) res = await run(this.tex.get('pdftoppm'), ['-png', '-r', String(PDF_RENDER_DPI), 'document.pdf', 'page'], options);
    if ((!res || res.code !== 0) && this.tex.get('pdftocairo')) res = await run(this.tex.get('pdftocairo'), ['-png', '-r', String(PDF_RENDER_DPI), 'document.pdf', 'page'], options);
    let files = [];
    try {
      files = (await fsp.readdir(previewDir)).filter((f) => /^page-\d+\.png$/.test(f));
    } catch {}
    files.sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    for (const f of files) {
      const full = path.join(previewDir, f);
      const size = pngSize(full);
      if (!size) continue;
      out.push({
        index: Number(f.match(/\d+/)[0]),
        file: full,
        width: size.width,
        height: size.height,
        widthPt: (size.width / PDF_RENDER_DPI) * 72,
        heightPt: (size.height / PDF_RENDER_DPI) * 72,
        dpi: PDF_RENDER_DPI
      });
    }
    if (!out.length) this.send('build:log', { chunk: `\n[pdftocairo] ${(res?.output || '').slice(-600)}\n` });
    if (out.length) {
      try {
        const links = await this.extractLinks(path.join(previewDir, 'document.pdf'), out.length);
        for (const page of out) page.links = links[page.index] || [];
      } catch {}
      await fsp.writeFile(path.join(previewDir, 'manifest.json'), JSON.stringify({ signature, pages: out }));
    }
    return out;
  }

  async readExistingPages(previewDir) {
    const out = [];
    try {
      const files = (await fsp.readdir(previewDir)).filter((f) => /^page-\d+\.png$/.test(f));
      files.sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
      for (const f of files) {
        const full = path.join(previewDir, f);
        const size = pngSize(full);
        if (!size) continue;
        out.push({
          index: Number(f.match(/\d+/)[0]),
          file: full,
          width: size.width,
          height: size.height,
          widthPt: (size.width / PDF_RENDER_DPI) * 72,
          heightPt: (size.height / PDF_RENDER_DPI) * 72,
          dpi: PDF_RENDER_DPI
        });
      }
    } catch {}
    return out;
  }

  stop() {
    if (this._buildToken) this._buildToken.cancelled = true;
    this._queue.length = 0;
    if (this.childPid) {
      killTree(this.childPid);
      this.childPid = 0;
      this.send('build:log', { chunk: '\n■ 已停止编译\n' });
    }
    // Keep the job busy until its child exits and build() reaches finally.
  }

  clean(includePdf = false) {
    const cache = this.cacheDir();
    let removed = 0;
    try {
      for (const f of fs.readdirSync(cache)) {
        const ext = path.extname(f);
        const hit = AUX_EXT.has(ext) || /\.(synctex\.gz|run\.xml)$/i.test(f) || includePdf;
        if (hit) {
          try {
            fs.rmSync(path.join(cache, f), { recursive: true, force: true });
            removed++;
          } catch {}
        }
      }
      const previewDir = path.join(cache, 'preview');
      if (includePdf && fs.existsSync(previewDir)) {
        fs.rmSync(previewDir, { recursive: true, force: true });
        removed++;
      }
      if (includePdf && this.project.rootFile) {
        const jobname = this.jobnameFor(this.project.rootFile);
        for (const ext of ['.pdf']) {
          const p = path.join(path.dirname(this.project.rootFile), jobname + ext);
          if (fs.existsSync(p)) { fs.rmSync(p, { force: true }); removed++; }
        }
      }
    } catch (err) {
      return { ok: false, error: err.message, removed };
    }
    return { ok: true, removed };
  }

  async synctexForward(file, line, column = 0) {
    const synctex = this.tex.get('synctex');
    if (!synctex || !this.project.rootFile) return { ok: false, error: 'SyncTeX 不可用' };
    const jobname = this.jobnameFor(this.project.rootFile);
    const pdf = this.synctexPdf(jobname);
    if (!fs.existsSync(pdf)) return { ok: false, error: '尚未生成 PDF' };
    let res = await run(synctex, ['view', '-i', `${line}:${column}:${path.resolve(file)}`, '-o', pdf], {
      cwd: path.dirname(this.project.rootFile), env: this.tex.env, timeout: 20000
    });
    let text = res.output || '';
    if (!/Page:\s*\d+/.test(text)) {
      const rel = path.relative(path.dirname(this.project.rootFile), file);
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
        const alt = await run(synctex, ['view', '-i', `${line}:${column}:${rel.split(path.sep).join('/')}`, '-o', pdf], {
          cwd: path.dirname(this.project.rootFile), env: this.tex.env, timeout: 20000
        });
        if (/Page:\s*\d+/.test(alt.output || '')) { res = alt; text = alt.output; }
      }
    }
    const page = Number((text.match(/Page:\s*(\d+)/) || [])[1] || 0);
    const x = Number((text.match(/x:\s*([\d.]+)/) || [])[1] || 0);
    const y = Number((text.match(/y:\s*([\d.]+)/) || [])[1] || 0);
    const h = Number((text.match(/^H:\s*([\d.]+)/m) || [])[1] || 0);
    const w = Number((text.match(/^W:\s*([\d.]+)/m) || [])[1] || 0);
    if (!page) return { ok: false, error: text.slice(0, 400) || '未找到对应位置' };
    return { ok: true, page, x, y, height: h, width: w };
  }

  async synctexInverse(page, x, y) {
    const synctex = this.tex.get('synctex');
    if (!synctex || !this.project.rootFile) return { ok: false, error: 'SyncTeX 不可用' };
    const jobname = this.jobnameFor(this.project.rootFile);
    const pdf = this.synctexPdf(jobname);
    if (!fs.existsSync(pdf)) return { ok: false, error: '尚未生成 PDF' };
    const res = await run(synctex, ['edit', '-o', `${page}:${x}:${y}:${pdf}`], {
      cwd: path.dirname(this.project.rootFile), env: this.tex.env, timeout: 20000
    });
    const text = res.output || '';
    const input = (text.match(/Input:(.+)/) || [])[1];
    const line = Number((text.match(/Line:(\d+)/) || [])[1] || 0);
    const column = Number((text.match(/Column:(-?\d+)/) || [])[1] || 0);
    if (!input || !line) return { ok: false, error: text.slice(0, 400) || '未找到对应源码位置' };
    return { ok: true, file: path.resolve(path.dirname(this.project.rootFile), input.trim()), line, column };
  }

  /** Extract a portable preamble from the root document for snippet builds. */
  synctexPdf(jobname) {
    if (this.lastResult?.rootFile === this.project.rootFile && Object.hasOwn(this.lastResult, 'synctexPdf')) return this.lastResult.synctexPdf || '';
    const last = this.lastResult?.rootFile === this.project.rootFile ? this.lastResult.pdf : '';
    const candidates = [last, path.join(this.cacheDir(), jobname + '.pdf'), path.join(this.root, this.store.get('build.cacheDir', '.latex_cache'), jobname + '.pdf')].filter(Boolean);
    return candidates.find(file => fs.existsSync(file) && (fs.existsSync(file.replace(/\.pdf$/i,'.synctex.gz')) || fs.existsSync(file.replace(/\.pdf$/i,'.synctex')))) || candidates.find(file => fs.existsSync(file)) || candidates[0];
  }

  async extractPreamble(rootText, rootFile = this.project.rootFile) {
    if (!rootFile) return { preamble: '', safePreamble: '', engine: this.store.get('build.engine', 'xelatex'), packages: [], usesCJK: false };
    const now = Date.now();
    const text = typeof rootText === 'string' ? rootText : await fsp.readFile(rootFile, 'utf8').catch(() => '');
    const beginIdx = text.indexOf('\\begin{document}');
    let pre = beginIdx > 0 ? text.slice(0, beginIdx) : text.slice(0, 6000);
    const originalPreamble = pre;
    const rootDir = path.dirname(rootFile);
    const seenInputs = new Set();
    const expandInputs = async (source, depth = 0) => {
      if (depth > 4) return source;
      const re = /\\(?:input|include)\{([^}]+)\}/g;
      let out = '';
      let last = 0;
      let m;
      while ((m = re.exec(source))) {
        out += source.slice(last, m.index);
        let rel = m[1].trim();
        if (!/\.tex$/i.test(rel)) rel += '.tex';
        const full = path.resolve(rootDir, rel);
        if (seenInputs.has(full)) { last = re.lastIndex; continue; }
        seenInputs.add(full);
        const body = await fsp.readFile(full, 'utf8').catch(() => '');
        out += body ? await expandInputs(body, depth + 1) : m[0];
        last = re.lastIndex;
      }
      out += source.slice(last);
      return out;
    };
    pre = await expandInputs(pre);
    const dependencies = [pre];
    for (const match of pre.matchAll(/\\(documentclass|usepackage|RequirePackage)(?:\[[^\]]*\])?\{([^}]+)\}/g)) {
      for (const name of match[2].split(',')) {
        const file = path.resolve(rootDir, name.trim() + (match[1] === 'documentclass' ? '.cls' : '.sty'));
        const content = await fsp.readFile(file, 'utf8').catch(() => '');
        if (content) dependencies.push(file, content);
      }
    }
    const dependencyPreamble = dependencies.join('\n');

    const braceBalance = (line) => {
      const plain = String(line).replace(/(?<!\\)(?:\\\\)*%.*/, '').replace(/\\[{}]/g, '');
      return (plain.match(/{/g) || []).length - (plain.match(/}/g) || []).length;
    };
    const collect = (source, re) => {
      const src = String(source).split(/\r?\n/);
      const out = [];
      let depth = 0;
      for (let i = 0; i < src.length; i++) {
        if (depth > 0 || !re.test(src[i])) { depth = Math.max(0, depth + braceBalance(src[i])); continue; }
        const block = [src[i]];
        let balance = braceBalance(src[i]);
        while (balance > 0 && i + 1 < src.length && block.length < 60) {
          i++;
          block.push(src[i]);
          balance += braceBalance(src[i]);
        }
        if (balance === 0) out.push(block.join('\n'));
      }
      return out;
    };

    const blockRe = /^\s*\\(usepackage|RequirePackage|usetikzlibrary|usepgfplotslibrary|graphicspath|linespread|setlength|setcounter|captionsetup|sisetup|lstset|setlist|newcommand|renewcommand|providecommand|DeclareMathOperator|DeclarePairedDelimiter|NewDocumentCommand|DeclareDocumentCommand|definecolor|colorlet|tikzset|pgfplotsset|newcolumntype|newenvironment|newtheorem|def)\b/;
    let blocks = collect(pre, blockRe);
    blocks = blocks.filter((l) => !/^\s*\\(usepackage\s*(\[[^\]]*\])?\{\s*(geometry|hyperref|ctex|xeCJK|fontspec|CJKutf8|luatexja)\s*\}|geometry\s*\{|hypersetup\s*\{)/.test(l));
    blocks = blocks.filter((l) => !/^\s*\\(setCJKmainfont|setCJKsansfont|setCJKmonofont|setCJKfamilyfont|setmainfont|setsansfont|setmonofont|setmathfont|newfontfamily|fontsize|selectfont|defaultfontfeatures|setmathrm|setmathsf|setmathtt)\b/.test(l));
    blocks = blocks.filter((l) => !/^\s*\\def\\.*@/.test(l));

    // Class/package internals must be loaded by TeX, never copied into another class.
    const styleDefs = [];
    const isPkg = (l) => /^\s*\\(usepackage|RequirePackage|usetikzlibrary|usepgfplotslibrary|graphicspath)\b/.test(l);
    const pkgs = blocks.filter(isPkg);
    const safePkgs = pkgs;
    const safeDefs = blocks.filter((l) => {
      if (/^\s*\\newtheorem\b/.test(l)) return false;
      if (/^\s*\\renewcommand\s*\{\\the/.test(l)) return false;
      if (/^\s*\\renewcommand\s*\{\\(chaptermark|sectionmark|subsectionmark|headrule|headrulewidth|chapter|section)\b/.test(l)) return false;
      if (/^\s*\\renewcommand\s*\{\\[a-zA-Z@]+mark\}/.test(l)) return false;
      return true;
    });
    const safeSet = new Set(safeDefs);
    const safeBlocks = blocks.filter((l) => isPkg(l) ? safePkgs.includes(l) : safeSet.has(l));

    const preamble = blocks.join('\n').trim();
    const safePreamble = [...safePkgs, ...styleDefs, ...safeBlocks.filter((l) => !isPkg(l))].join('\n').trim();
    const unicodeMath = /\\usepackage(?:\[[^\]]*\])?\{unicode-math\}/.test(pre) ? '\\usepackage{unicode-math}' : '';
    const essentialDefs = collect(pre, /^\s*\\(definecolor|colorlet|newcommand|providecommand|DeclareMathOperator|DeclarePairedDelimiter|NewDocumentCommand|DeclareDocumentCommand)\b/);
    const containerDefs = collect(pre, /^\s*\\(usetikzlibrary|usepgfplotslibrary|tikzset|pgfplotsset|newcolumntype)\b/);
    const mathBase = [unicodeMath, ...essentialDefs, ...styleDefs].filter(Boolean);
    const essentialMathPreamble = mathBase.join('\n').trim();
    const essentialTablePreamble = [...mathBase, ...collect(pre, /^\s*\\newcolumntype\b/)].filter(Boolean).join('\n').trim();
    const tikzBase = [];
    if (/\\usepackage(?:\[[^\]]*\])?\{pgfplots\}/.test(pre) || /\\pgfplotsset/.test(pre)) tikzBase.push('\\usepackage{pgfplots}');
    const essentialTikzPreamble = [...mathBase, ...tikzBase, ...containerDefs.filter((l) => !/^\s*\\newcolumntype\b/.test(l))].filter(Boolean).join('\n').trim();
    const essentialPreamble = essentialTikzPreamble;
    const packages = [];
    for (const l of pkgs) {
      const m = l.match(/\\usepackage\s*(?:\[[^\]]*\])?\{([^}]+)\}/);
      if (m) m[1].split(',').forEach((p) => { if (p.trim() && !packages.includes(p.trim())) packages.push(p.trim()); });
    }
    const usesCJK = /ctexart|ctex|xeCJK|CJKutf8|luatexja/.test(pre);
    const value = { originalPreamble, dependencyPreamble, preamble, safePreamble, essentialPreamble, essentialMathPreamble, essentialTablePreamble, essentialTikzPreamble, engine: usesCJK ? 'xelatex' : this.store.get('build.engine', 'xelatex'), packages, usesCJK, rootDir };
    this._preCache = { root: rootFile, at: now, value };
    return value;
  }

  /** Compile an isolated snippet and rasterize it (math / tikz / table previews). */
  async snippet({ code, kind = 'math', scale = 2, displayMode = false, rootText, rootFile: expectedRoot }) {
    const projectRoot=this.root, rootFile=this.project.rootFile;
    if(expectedRoot && expectedRoot!==rootFile)return {ok:false,cancelled:true,error:'项目已切换'};
    const configuredEngine = this.store.get('build.engine', 'xelatex');
    const engineName = ['pdflatex', 'xelatex', 'lualatex'].includes(configuredEngine) ? configuredEngine : 'xelatex';
    const exe = this.tex.get(engineName) || this.tex.get('xelatex') || this.tex.get('pdflatex');
    if (!exe) return { ok: false, error: '未检测到 LaTeX 引擎，无法渲染预览' };
    if (!this.tex.get('pdftoppm') && !this.tex.get('pdftocairo')) return { ok: false, error: '未检测到 pdftoppm / pdftocairo，无法渲染预览' };
    const body = String(code || '').trim().replace(/\\qedhere\b/g, '');
    if (!body) return { ok: false, error: '空内容' };
    const { originalPreamble, dependencyPreamble, preamble, safePreamble, essentialMathPreamble, essentialTablePreamble, essentialTikzPreamble } = await this.extractPreamble(rootText, rootFile);
    const hash = crypto.createHash('sha1').update('preview-v2|' + engineName + '|' + kind + '|' + body + '|' + originalPreamble + '|' + dependencyPreamble + '|' + scale + '|' + displayMode).digest('hex').slice(0, 16);
    const outDir = path.join(await this.resolveCacheDir(projectRoot), 'snippets');
    await fsp.mkdir(outDir, { recursive: true });
    const png = path.join(outDir, hash + '.png');
    if (fs.existsSync(png) && Date.now() - fs.statSync(png).mtimeMs < 1000 * 60 * 60 * 24 && !this.store.get('build.previewNoCache')) {
      const size = pngSize(png);
      return { ok: true, png, width: size?.width || 0, height: size?.height || 0, cached: true, dpi: 288 * scale };
    }
    const hasCJK = /[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]/.test(body);
    const docClass = hasCJK ? '\\documentclass[border=2pt]{standalone}\n\\usepackage{ctex}\n' : '\\documentclass[border=2pt]{standalone}\n';
    const needsTikz = kind === 'tikz' || /\\(?:begin\{tikzpicture\}|tikzset|pgfplotsset|begin\{axis\})/.test(body);
    const tikzPkg = needsTikz ? '\\usepackage{tikz}\n' : '';
    const base = '\\usepackage{amsmath,amssymb,amsthm,mathtools}\n\\usepackage{xcolor}\n\\usepackage{graphicx}\n\\usepackage{array}\n' + tikzPkg;
    const build = (pre, faithful = false) => {
      const docDir = path.dirname(rootFile || '').replace(/\\/g, '/');
      const projectDir = String(projectRoot || '').replace(/\\/g, '/');
      const graphics = '\\graphicspath{{' + docDir + '/}{' + projectDir + '/}}\n';
      const head = docClass + base + graphics + (kind === 'table' ? '\\usepackage{booktabs}\n\\usepackage{array}\n' : '');
      let bodyBlock;
      if (kind === 'math') bodyBlock = `\\ensuremath{${displayMode ? '\\displaystyle ' : ''}${body}}`;
      else if (kind === 'displayblock') bodyBlock = `\\[\n${body}\n\\]`;
      else bodyBlock = body;
      if (faithful && /\\documentclass\b/.test(pre)) {
        return `${pre}\n${graphics}\n\\usepackage[active,tightpage]{preview}\n\\setlength{\\PreviewBorder}{2pt}\n\\begin{document}\n\\begin{preview}\n${bodyBlock}\n\\end{preview}\n\\end{document}\n`;
      }
      return `${head}\\makeatletter\n${pre}\n\\makeatother\n\\begin{document}\n${bodyBlock}\n\\end{document}\n`;
    };
    const workDir = path.join(outDir, hash);
    await fsp.mkdir(workDir, { recursive: true });
    const texFile = path.join(workDir, 'snippet.tex');
    const pdf = path.join(workDir, 'snippet.pdf');

    const compileSnippet = async (source, first = false) => {
      await fsp.writeFile(texFile, source, 'utf8');
      // Auxiliary files from another class/fallback cannot be reused safely.
      for (const ext of ['pdf', 'aux', 'out', 'toc', 'lof', 'lot']) {
        try { await fsp.rm(path.join(workDir, 'snippet.' + ext), { force: true }); } catch {}
      }
      const snippetEnv = codeEnvironment(this.store, this.tex.env);
      const inherited = snippetEnv.TEXINPUTS ? String(snippetEnv.TEXINPUTS).split(path.delimiter) : [];
      snippetEnv.TEXINPUTS = [path.dirname(rootFile || ''), projectRoot, ...inherited, ''].filter((v, i, a) => v !== undefined && a.indexOf(v) === i).join(path.delimiter);
      const res = await run(exe, ['-interaction=nonstopmode', '-halt-on-error', ...(mintedEnabled(this.store, projectRoot) ? ['-shell-escape'] : []), '-output-directory=' + workDir, 'snippet.tex'], {
        cwd: workDir, env: snippetEnv, timeout: kind === 'tikz' ? 120000 : 60000
      });
      const ok = res.code === 0 && fs.existsSync(pdf);
      if (!ok && first) {
        try { await fsp.copyFile(texFile, path.join(workDir, 'snippet-first.tex')); } catch {}
        try { await fsp.copyFile(path.join(workDir, 'snippet.log'), path.join(workDir, 'snippet-first.log')); } catch {}
      }
      return { res, ok };
    };

    const tiers = [
      { name: 'project', pre: originalPreamble, faithful: true },
      { name: 'full', pre: preamble },
      { name: 'safe', pre: safePreamble },
      { name: 'essential', pre: kind === 'tikz' ? essentialTikzPreamble : kind === 'table' ? essentialTablePreamble : essentialMathPreamble },
      { name: 'minimal', pre: '' }
    ].filter((t) => t.pre !== undefined);
    // Always try the real project first; a math fallback must not downgrade later TikZ/table previews.
    const order = tiers;
    let res = null;
    let usedTier = '';
    for (const tier of order) {
      const source = build(tier.pre || '', tier.faithful);
      if (tier.name === 'essential') {
        try { await fsp.writeFile(path.join(workDir, 'snippet-essential.tex'), source, 'utf8'); } catch {}
      }
      res = await compileSnippet(source, tier.name === 'project');
      if (res.ok) { usedTier = tier.name; break; }
    }
    if (res && res.ok) this._snippetTier = usedTier;
    if (!res.ok) return { ok: false, error: res.res.output.slice(-1200) || '编译失败' };
    const renderer = this.tex.get('pdftoppm');
    const render = renderer
      ? await run(renderer, ['-png', '-r', String(288 * scale), '-singlefile', 'snippet.pdf', 'snippet'], { env: this.tex.env, timeout: 30000, cwd: workDir })
      : await run(this.tex.get('pdftocairo'), ['-png', '-r', String(288 * scale), '-singlefile', '-o', 'snippet', 'snippet.pdf'], { env: this.tex.env, timeout: 30000, cwd: workDir });
    const rendered = path.join(workDir, 'snippet.png');
    if (render.code === 0 && fs.existsSync(rendered)) {
      try { fs.copyFileSync(rendered, png); } catch {}
    }
    if (!fs.existsSync(png)) return { ok: false, error: render.output.slice(-800) || '光栅化失败' };
    const size = pngSize(png);
    return { ok: true, png, width: size?.width || 0, height: size?.height || 0, dpi: 288 * scale };
  }

  /** Run ChkTeX over a file and map findings into problems. */
  async lint(file) {
    const chktex = this.tex.get('chktex');
    if (!chktex) return { ok: false, error: '未安装 ChkTeX' };
    const target = file || this.project.rootFile;
    if (!target) return { ok: false, error: '没有可检查的文件' };
    const res = await run(chktex, ['-wall', '-n1', '-q', '-I0', '-f', '%f:%l:%c:%m', target], {
      cwd: this.root, env: this.tex.env, timeout: 60000
    });
    const problems = [];
    for (const line of (res.output || '').split(/\r?\n/)) {
      const m = line.match(/^(.+?):(\d+):(\d+):(.*)$/);
      if (!m) continue;
      problems.push({
        severity: /warning/i.test(m[4]) ? 'warning' : 'info',
        file: m[1],
        line: Number(m[2]),
        column: Number(m[3]),
        message: m[4].replace(/\s*\(Warning.*\)$/, '').trim(),
        source: 'chktex'
      });
    }
    return { ok: true, problems };
  }

  /** latexdiff between two files or snapshots → diff PDF. */
  async latexdiff(fileA, fileB, outName) {
    const latexdiff = this.tex.get('latexdiff');
    const latexmk = this.tex.get('latexmk');
    if (!latexdiff) return { ok: false, error: '未安装 latexdiff（MiKTeX 中为 latexdiff.exe）' };
    const cache = this.cacheDir();
    await fsp.mkdir(cache, { recursive: true });
    const diffTex = path.join(cache, (outName || 'diff') + '.tex');
    const res = await run(latexdiff, ['--flatten', fileA, fileB], {
      cwd: this.root, env: this.tex.env, timeout: 120000
    });
    // latexdiff writes to stdout, which our runner captured in its log file
    if (res.code !== 0 || !res.output.trim()) return { ok: false, error: res.output.slice(-1500) || 'latexdiff 执行失败' };
    await fsp.writeFile(diffTex, res.output, 'utf8');
    const engineName = this.store.get('build.engine', 'xelatex') === 'pdflatex' ? 'pdflatex' : this.store.get('build.engine', 'xelatex');
    const exe = this.tex.get(engineName) || this.tex.get('xelatex');
    const built = await run(exe, ['-interaction=nonstopmode', '-output-directory=' + cache, path.basename(diffTex)], {
      cwd: this.root, env: this.tex.env, timeout: 180000
    });
    const pdf = diffTex.replace(/\.tex$/, '.pdf');
    if (!fs.existsSync(pdf)) return { ok: false, error: built.output.slice(-1500) };
    return { ok: true, pdf, tex: diffTex };
  }
}

module.exports = { Compiler, parseLatexLog, splitArgs };
