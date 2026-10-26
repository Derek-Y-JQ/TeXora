'use strict';
/**
 * Optional Git integration. Everything degrades gracefully when git.exe is absent.
 */
const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./run');

function findGit() {
  const exe = 'git.exe';
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const full = path.join(dir, exe);
    try {
      if (fs.existsSync(full)) return full;
    } catch {}
  }
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'cmd', 'git.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'cmd', 'git.exe'),
    path.join(process.env.ProgramW6432 || 'C:\\Program Files', 'Git', 'cmd', 'git.exe')
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  return '';
}

class GitService {
  constructor(project) {
    this.project = project;
    this.exe = findGit();
    this.available = !!this.exe;
  }

  async exec(args, opts = {}) {
    if (!this.available) return { ok: false, error: '未检测到 Git（安装 Git for Windows 后重启应用）' };
    if (!this.project.root) return { ok: false, error: '尚未打开项目' };
    const res = await run(this.exe, args, { cwd: this.project.root, timeout: opts.timeout || 60000 });
    return { ok: res.code === 0, code: res.code, output: res.output, error: res.code === 0 ? '' : res.output.slice(-2000) };
  }

  async status() {
    if (!this.available) return { ok: true, available: false, branch: '', files: [], ahead: 0, behind: 0 };
    const repo = await this.exec(['rev-parse', '--is-inside-work-tree']);
    if (!repo.ok) return { ok: true, available: true, repo: false, branch: '', files: [] };
    const [status, branch] = await Promise.all([
      this.exec(['status', '--porcelain=v1', '-uall']),
      this.exec(['rev-parse', '--abbrev-ref', 'HEAD'])
    ]);
    const files = [];
    for (const line of (status.output || '').split(/\r?\n/)) {
      if (!line.trim()) continue;
      const x = line[0];
      const y = line[1];
      const file = line.slice(3).trim();
      files.push({ x, y, file, staged: x !== ' ' && x !== '?', untracked: x === '?' });
    }
    const st = branch.ok ? branch.output.trim() : '';
    return {
      ok: true,
      available: true,
      repo: true,
      branch: /fatal|not a git/i.test(st) ? '' : st,
      files,
      root: this.project.root
    };
  }

  async log(limit = 30) {
    const res = await this.exec(['log', `-${limit}`, '--pretty=format:%h%x1f%an%x1f%ar%x1f%s%x1f%ad', '--date=short']);
    if (!res.ok) return { ok: false, error: res.error, commits: [] };
    const commits = (res.output || '').split(/\r?\n/).filter(Boolean).map((line) => {
      const [hash, author, when, subject, date] = line.split('\x1f');
      return { hash, author, when, subject, date };
    });
    return { ok: true, commits };
  }

  async diff(file, staged = false) {
    const args = ['diff', '--no-color'];
    if (staged) args.push('--cached');
    if (file) args.push('--', file);
    const res = await this.exec(args);
    return { ok: res.ok, diff: res.output || '', error: res.error };
  }

  async stage(file) {
    return this.exec(file ? ['add', '--', file] : ['add', '-A']);
  }

  async commit(message, all = true) {
    if (all) await this.exec(['add', '-A']);
    const res = await this.exec(['commit', '-m', message], { timeout: 120000 });
    return { ok: res.ok, output: res.output, error: res.error };
  }

  async pull() {
    return this.exec(['pull', '--ff-only'], { timeout: 180000 });
  }

  async push() {
    return this.exec(['push'], { timeout: 180000 });
  }

  async branches() {
    const res = await this.exec(['branch', '--format=%(refname:short)']);
    return { ok: res.ok, branches: (res.output || '').split(/\r?\n/).filter(Boolean) };
  }

  async checkout(branch) {
    return this.exec(['checkout', branch], { timeout: 120000 });
  }

  async init() {
    return this.exec(['init']);
  }
}

module.exports = { GitService, findGit };
