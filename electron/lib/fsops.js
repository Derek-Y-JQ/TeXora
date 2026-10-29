'use strict';
/**
 * File system operations, project discovery and file watching.
 */
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { EventEmitter } = require('node:events');

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'release', '.latex_cache', '.build',
  '.texora', '.vscode', '.idea', '__pycache__', '.cache', '.tmp', 'out'
]);
const TEXT_EXT = new Set([
  '.tex', '.bib', '.sty', '.cls', '.bst', '.md', '.txt', '.latexmkrc', '.cfg', '.def',
  '.json', '.yaml', '.yml', '.toml', '.csv', '.sty', '.dtx', '.ins', '.Rnw', '.ltx',
  '.html', '.css', '.js', '.ts', '.sh', '.bat', '.gitignore', '.gitattributes', ''
]);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.pdf', '.eps', '.svg', '.gif', '.webp', '.bmp']);

function isTextFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (TEXT_EXT.has(ext)) return true;
  const base = path.basename(file).toLowerCase();
  return ['latexmkrc', 'makefile', '.gitignore', '.gitattributes', '.latexmkrc'].includes(base);
}

function isImageFile(file) {
  return IMAGE_EXT.has(path.extname(file).toLowerCase());
}

function childPath(dir, name) {
  if (typeof name !== 'string' || !name.trim() || path.isAbsolute(name)) throw new Error('请输入有效的相对文件名');
  const full = path.resolve(dir, name);
  const rel = path.relative(path.resolve(dir), full);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw new Error('文件名不能超出目标目录');
  return full;
}

class ProjectService extends EventEmitter {
  constructor(store, appDir) {
    super();
    this.store = store;
    this.appDir = appDir;
    this.root = '';
    this.rootFile = '';
    this.watcher = null;
    this._pending = null;
  }

  recent() {
    return this.store.get('ui.recent', []);
  }

  pushRecent(root) {
    const list = this.recent().filter((r) => r.path !== root);
    list.unshift({ path: root, name: path.basename(root), at: Date.now() });
    this.store.set('ui.recent', list.slice(0, this.store.get('general.recentLimit', 12)));
    this.store.set('ui.lastProject', root);
  }

  async open(rootPath) {
    const revision = this.revision = (this.revision || 0) + 1;
    rootPath = path.resolve(rootPath);
    const stat = await fsp.stat(rootPath).catch(() => null);
    if (!stat) throw new Error('目录不存在：' + rootPath);
    const root = stat.isDirectory() ? rootPath : path.dirname(rootPath);
    const rootFile = await this.detectRootFile(root);
    if (this.revision !== revision) return { cancelled: true };
    this.root = root;
    this.rootFile = rootFile;
    this.pushRecent(this.root);
    this.startWatch();
    this.emit('opened', { root: this.root, rootFile: this.rootFile });
    return this.info();
  }

  close() {
    this.revision = (this.revision || 0) + 1;
    this.stopWatch();
    this.root = '';
    this.rootFile = '';
  }

  info() {
    return {
      revision: this.revision,
      root: this.root,
      name: this.root ? path.basename(this.root) : '',
      rootFile: this.rootFile,
      recent: this.recent()
    };
  }

  async detectRootFile(root = this.root) {
    if (this.store.get('build.autoDetectRoot', true) === false) return root === this.root ? this.rootFile || '' : '';
    for (const name of ['main.tex', 'root.tex', 'thesis.tex', 'paper.tex', 'document.tex', 'master.tex', 'book.tex']) {
      const file = path.join(root, name);
      const head = await fsp.readFile(file, 'utf8').catch(() => '');
      if (/\\documentclass/.test(head)) return file;
    }
    const candidates = [];
    async function walk(dir, depth) {
      if (depth > 4) return;
      let entries = [];
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.name.startsWith('.') && e.name !== '.') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (IGNORED_DIRS.has(e.name)) continue;
          await walk(full, depth + 1);
        } else if (/\.(tex|ltx)$/i.test(e.name)) {
          candidates.push(full);
        }
      }
    }
    await walk(root, 0);
    const preferred = ['main.tex', 'root.tex', 'thesis.tex', 'paper.tex', 'document.tex', 'master.tex', 'book.tex'];
    const withDocClass = [];
    for (const file of candidates.slice(0, 80)) {
      let head = '';
      try {
        const fh = await fsp.open(file, 'r');
        const buf = Buffer.alloc(4096);
        const { bytesRead } = await fh.read(buf, 0, 4096, 0);
        await fh.close();
        head = buf.subarray(0, bytesRead).toString('utf8');
      } catch {
        continue;
      }
      if (/\\documentclass/.test(head)) {
        withDocClass.push({ file, head });
      }
    }
    if (!withDocClass.length) {
      const withSubfiles = candidates.find((c) => /subfiles/i.test(c));
      return withSubfiles || candidates[0] || '';
    }
    for (const p of preferred) {
      const hit = withDocClass.find((c) => path.basename(c.file).toLowerCase() === p);
      if (hit) return hit.file;
    }
    // prefer file containing \begin{document} and most \input
    withDocClass.sort((a, b) => {
      const score = (x) => (x.head.includes('\\begin{document}') ? 10 : 0) + (x.head.match(/\\input|\\include/g) || []).length;
      return score(b) - score(a);
    });
    return withDocClass[0].file;
  }

  startWatch() {
    this.stopWatch();
    if (!this.root) return;
    try {
      this.watcher = fs.watch(this.root, { recursive: true, persistent: false }, (_ev, filename) => {
        if (!filename) return;
        const name = String(filename);
        if (/(^|[\\/])(\.git|node_modules|\.latex_cache|\.build|dist|release)([\\/]|$)/.test(name)) return;
        clearTimeout(this._pending);
        this._pending = setTimeout(() => {
          this.emit('changed', { file: path.join(this.root, name) });
        }, 260);
      });
    } catch (err) {
      console.warn('[fs] watch failed', err.message);
    }
  }

  stopWatch() {
    clearTimeout(this._pending);
    this._pending = null;
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {}
      this.watcher = null;
    }
  }

  safePath(target) {
    if (!this.root) throw new Error('尚未打开项目');
    const resolved = path.resolve(this.root, target);
    const rel = path.relative(this.root, resolved);
    if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw new Error('路径超出项目范围');
    return resolved;
  }

  async tree(dir = this.root, depth = 0) {
    if (!this.root) return [];
    const target = dir || this.root;
    let entries = [];
    try {
      entries = await fsp.readdir(target, { withFileTypes: true });
    } catch {
      return [];
    }
    const nodes = [];
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh');
    });
    for (const e of entries) {
      if (IGNORED_DIRS.has(e.name)) continue;
      if (e.name.startsWith('.') && !['.latexmkrc', '.gitignore'].includes(e.name)) {
        if (e.isDirectory()) continue;
      }
      const full = path.join(target, e.name);
      if (e.isDirectory()) {
        nodes.push({
          type: 'dir',
          name: e.name,
          path: full,
          expanded: depth < 1,
          children: depth < 4 ? await this.tree(full, depth + 1) : []
        });
      } else {
        let size = 0;
        try {
          size = (await fsp.stat(full)).size;
        } catch {}
        nodes.push({ type: 'file', name: e.name, path: full, size, ext: path.extname(e.name).toLowerCase() });
      }
    }
    return nodes;
  }

  async read(file) {
    const full = path.isAbsolute(file) ? file : this.safePath(file);
    const buf = await fsp.readFile(full);
    if (buf.includes(0) && !isTextFile(full)) return { binary: true, size: buf.length, path: full };
    let text = buf.toString('utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return { text, path: full, mtime: (await fsp.stat(full)).mtimeMs };
  }

  async write(file, text) {
    const full = path.isAbsolute(file) ? file : this.safePath(file);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, text, 'utf8');
    return { path: full, mtime: (await fsp.stat(full)).mtimeMs };
  }

  async createFile(targetDir, name, content = '') {
    const dir = path.isAbsolute(targetDir) ? targetDir : this.safePath(targetDir);
    let full = childPath(dir, name);
    let i = 1;
    while (fs.existsSync(full)) {
      const ext = path.extname(name);
      const base = path.basename(name, ext);
      full = path.join(dir, `${base}-${i++}${ext}`);
    }
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, content, 'utf8');
    return full;
  }

  async createDir(targetDir, name) {
    const dir = path.isAbsolute(targetDir) ? targetDir : this.safePath(targetDir);
    const full = childPath(dir, name);
    await fsp.mkdir(full, { recursive: true });
    return full;
  }

  async rename(from, to) {
    const src = path.isAbsolute(from) ? from : this.safePath(from);
    const dst = childPath(path.dirname(src), to);
    await fsp.rename(src, dst);
    return dst;
  }

  /** Move a file or folder into another directory (drag & drop). */
  async moveInto(from, targetDir) {
    const src = path.isAbsolute(from) ? from : this.safePath(from);
    const dir = path.isAbsolute(targetDir) ? targetDir : this.safePath(targetDir);
    const dst = path.join(dir, path.basename(src));
    if (path.resolve(dst) === path.resolve(src)) return src;
    await fsp.rename(src, dst);
    return dst;
  }

  async remove(target) {
    const full = path.isAbsolute(target) ? target : this.safePath(target);
    const stat = await fsp.stat(full);
    if (stat.isDirectory()) await fsp.rm(full, { recursive: true, force: true });
    else await fsp.unlink(full);
    return true;
  }

  async saveImage(dir, filename, base64) {
    const full = path.isAbsolute(dir) ? dir : this.safePath(dir);
    await fsp.mkdir(full, { recursive: true });
    const data = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    let target = childPath(full, filename);
    let i = 1;
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    while (fs.existsSync(target)) target = path.join(full, `${base}-${i++}${ext}`);
    await fsp.writeFile(target, data);
    return { path: target, size: data.length };
  }

  /** Recursively collect assets useful for completion / thumbnails. */
  async assets() {
    if (!this.root) return { tex: [], images: [], bib: [], all: [] };
    const tex = [];
    const images = [];
    const bib = [];
    const all = [];
    const walk = async (dir, depth) => {
      if (depth > 5 || all.length > 4000) return;
      let entries = [];
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (IGNORED_DIRS.has(e.name)) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full, depth + 1);
        else {
          const rel = path.relative(this.root, full).split(path.sep).join('/');
          all.push(rel);
          if (/\.(tex|ltx|sty|cls)$/i.test(e.name)) tex.push(rel);
          else if (isImageFile(full)) images.push(rel);
          else if (/\.bib$/i.test(e.name)) bib.push(rel);
        }
      }
    };
    await walk(this.root, 0);
    return { tex, images, bib, all };
  }
}

module.exports = { ProjectService, isTextFile, isImageFile, IGNORED_DIRS };
