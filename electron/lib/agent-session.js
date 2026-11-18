'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const providers = [
  { id: 'codex', label: 'Codex', pkg: '@openai/codex' },
  { id: 'claude', label: 'Claude Code', pkg: '@anthropic-ai/claude-code' },
  { id: 'dsh', label: 'DeepSeek Harness', pkg: '@deepseek-ai/dsh' }
];

function launchSpec(provider) {
  const home = os.homedir(), win = process.platform === 'win32';
  const dirs = (process.env.PATH || '').split(path.delimiter);
  dirs.push(path.join(home, '.local', 'bin'), path.join(home, '.volta', 'bin'));
  if (win && process.env.APPDATA) dirs.push(path.join(process.env.APPDATA, 'npm'));
  if (!win) {
    const versions = path.join(home, '.nvm', 'versions', 'node');
    try { for (const version of fs.readdirSync(versions).reverse()) dirs.push(path.join(versions, version, 'bin')); } catch {}
  }
  const search = [...new Set(dirs.filter(dir => path.isAbsolute(dir)))];
  for (const dir of search) {
    const exe = path.join(dir, provider.id + (win ? '.exe' : ''));
    try {
      fs.accessSync(exe, fs.constants.X_OK);
      if (fs.statSync(exe).isFile()) return { exe, args: [], path: search.join(path.delimiter) };
    } catch {}
    if (!win) continue;
    // Invoke npm's declared bin with node, bypassing cmd.exe shell parsing.
    const root = path.join(dir, 'node_modules', provider.pkg);
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      const entry = path.resolve(root, typeof manifest.bin === 'string' ? manifest.bin : manifest.bin[provider.id]);
      const node = search.map(d => path.join(d, 'node.exe')).find(f => fs.existsSync(f));
      if (node && manifest.name === provider.pkg && entry.startsWith(root + path.sep) && fs.statSync(entry).isFile())
        return { exe: node, args: [entry], path: search.join(path.delimiter) };
    } catch {}
  }
  return null;
}

class AgentSession {
  constructor(send, web = null) { this.send = send; this.web = web; this.process = null; }
  list() { return providers.map(p => ({ id:p.id, label:p.label, installed:!!launchSpec(p) })); }
  start(id, cwd) {
    if (this.process) throw Error('请先结束当前会话');
    if (!cwd) throw Error('请先打开项目文件夹');
    const provider = providers.find(p => p.id === id);
    const spec = provider && launchSpec(provider);
    if (!spec) throw Error('未找到所选工具，请安装后重新检测');
    const args = id === 'dsh' ? [...spec.args, 'web', '--no-open', '--host', '127.0.0.1', '--port', '0'] : spec.args;
    // ConPTY spawns a worker thread which requires a real filesystem path.
    const modulePath = require.resolve('node-pty').replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
    const proc = require(modulePath).spawn(spec.exe, args, {
      name:'xterm-256color', cols:80, rows:24, cwd, env:{...process.env, PATH:spec.path, TERM:'xterm-256color'}
    });
    this.process = proc;
    let startup = '', opened = false;
    proc.onData(data => {
      if (this.process !== proc) return;
      if (id === 'dsh' && this.web && !opened) {
        startup = (startup + data).slice(-8192);
        const entry = startup.match(/http:\/\/127\.0\.0\.1:\d+\/[^\s\x1b]*(?=[\s\x1b])/);
        if (entry) {
          opened = true;
          this.web.open(entry[0]);
          startup = '';
          return;
        }
      }
      this.send('agent:event', { data });
    });
    proc.onExit(({exitCode}) => {
      if (this.process !== proc) return;
      this.process = null;
      this.web?.close();
      this.send('agent:event', { ended:true, exitCode });
    });
    return {ok:true};
  }
  write(data) { if (typeof data === 'string' && data.length <= 1e6) this.process?.write(data); }
  resize(cols,rows) {
    if (Number.isInteger(cols) && Number.isInteger(rows) && cols>1 && rows>0 && cols<=1000 && rows<=500)
      this.process?.resize(cols,rows);
  }
  stop() {
    const proc = this.process;
    if (!proc) return;
    this.process = null;
    this.web?.close();
    try { proc.kill(); } finally { this.send('agent:event', {ended:true}); }
  }
}
module.exports = { AgentSession };
