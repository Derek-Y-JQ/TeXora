'use strict';
/**
 * Local history snapshots ("timeline") kept outside the project folder.
 */
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');

function hash(str) {
  return crypto.createHash('sha1').update(str).digest('hex').slice(0, 16);
}

class History {
  constructor(root, baseDir) {
    this.baseDir = baseDir;
    this.root = root || '';
    this.dir = '';
    this.indexFile = '';
    this.items = [];
    this.maxDays = 14;
  }

  setRoot(root, maxDays = 14) {
    this.root = root || '';
    this.maxDays = maxDays;
    this.dir = path.join(this.baseDir, hash(this.root));
    this.indexFile = path.join(this.dir, 'index.json');
    this.items = [];
    this._load();
  }

  _load() {
    try {
      this.items = JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
    } catch {
      this.items = [];
    }
  }

  _save() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(this.indexFile, JSON.stringify(this.items, null, 1));
    } catch (err) {
      console.warn('[history] save failed', err.message);
    }
  }

  prune() {
    const cutoff = Date.now() - this.maxDays * 86400000;
    const keep = [];
    for (const it of this.items) {
      if (it.at < cutoff) {
        try { fs.rmSync(path.join(this.dir, it.id), { force: true }); } catch {}
      } else keep.push(it);
    }
    if (keep.length > 400) {
      for (const it of keep.splice(400)) {
        try { fs.rmSync(path.join(this.dir, it.id), { force: true }); } catch {}
      }
    }
    this.items = keep;
    this._save();
  }

  snapshot(file, content, reason = 'save') {
    if (!this.root || !file) return null;
    if (typeof content !== 'string') return null;
    const rel = path.relative(this.root, file).split(path.sep).join('/');
    const last = this.items.find((i) => i.file === rel);
    if (last) {
      try {
        const prev = fs.readFileSync(path.join(this.dir, last.id), 'utf8');
        if (prev === content) return null;
      } catch {}
    }
    const id = `${Date.now()}-${hash(rel + content)}`;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(path.join(this.dir, id), content, 'utf8');
      this.items.unshift({
        id,
        file: rel,
        abs: file,
        reason,
        at: Date.now(),
        size: Buffer.byteLength(content)
      });
      this.prune();
      return id;
    } catch (err) {
      console.warn('[history] snapshot failed', err.message);
      return null;
    }
  }

  list(file) {
    if (!this.root) return [];
    const rel = file ? path.relative(this.root, file).split(path.sep).join('/') : '';
    return this.items
      .filter((i) => !rel || i.file === rel)
      .slice(0, 200)
      .map(({ abs, ...rest }) => ({ ...rest, abs }));
  }

  read(id) {
    try {
      return { ok: true, content: fs.readFileSync(path.join(this.dir, id), 'utf8') };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async restore(id) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return { ok: false, error: '快照不存在' };
    try {
      const content = fs.readFileSync(path.join(this.dir, id), 'utf8');
      // snapshot the current state first so restore is undoable
      const cur = await fsp.readFile(item.abs, 'utf8').catch(() => '');
      this.snapshot(item.abs, cur, 'before-restore');
      await fsp.writeFile(item.abs, content, 'utf8');
      return { ok: true, file: item.abs, content };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}

module.exports = { History };
