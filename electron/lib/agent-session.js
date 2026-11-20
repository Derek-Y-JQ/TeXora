'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { stripVTControlCharacters } = require('node:util');
const { spawn, execFile, execFileSync } = require('node:child_process');
const { createInterface } = require('node:readline');
const { randomUUID, createHash } = require('node:crypto');
const { killTree } = require('./run');
const { snapshotProject, compareProject } = require('./agent-changes');
const { listCodexModels } = require('./codex-models');
const { listClaudeModels, DEFAULT_CLAUDE_MODELS } = require('./claude-models');
const { startCodexLogin, safeError } = require('./codex-login');

const providers = [
  { id: 'codex', label: 'Codex', pkg: '@openai/codex', models: [] },
  { id: 'claude', label: 'Claude Code', pkg: '@anthropic-ai/claude-code', models: ['sonnet', 'opus', 'haiku'] },
  { id: 'agy', label: 'Google Antigravity', models: [] }
];

let cachedLoginShellDirs = null;
function loginShellDirs() {
  if (process.platform === 'win32') return [];
  if (cachedLoginShellDirs) return cachedLoginShellDirs;
  const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh');
  try {
    const out = execFileSync(shell, ['-lc', 'printf "%s" "$PATH"'], {
      timeout: 2500,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    cachedLoginShellDirs = String(out || '')
      .split(path.delimiter)
      .map(d => d.trim())
      .filter(d => path.isAbsolute(d));
  } catch {
    cachedLoginShellDirs = [];
  }
  return cachedLoginShellDirs;
}

function collectSearchDirs(provider, { includeShell = false, env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  const win = platform === 'win32';
  const sep = win ? ';' : ':';
  const join = win ? path.win32.join : path.join;
  const isAbs = win ? path.win32.isAbsolute : path.isAbsolute;
  const dirs = String(env.PATH || '').split(sep);

  if (includeShell && !win) dirs.push(...loginShellDirs());

  dirs.push(
    join(home, '.local', 'bin'),
    join(home, '.volta', 'bin'),
    join(home, '.bun', 'bin'),
    join(home, '.cargo', 'bin'),
    join(home, '.npm-global', 'bin'),
    join(home, '.codex', 'bin'),
    join(home, '.claude', 'local'),
    join(home, '.claude', 'bin')
  );

  if (win) {
    if (env.APPDATA) {
      dirs.push(join(env.APPDATA, 'npm'));
      const nvmWin = join(env.APPDATA, 'nvm');
      try {
        for (const entry of fs.readdirSync(nvmWin).reverse()) {
          if (/^v?\d/.test(entry)) dirs.push(join(nvmWin, entry));
        }
      } catch {}
    }
    if (env.NVM_SYMLINK) dirs.push(env.NVM_SYMLINK);
    if (env.LOCALAPPDATA) {
      dirs.push(
        join(env.LOCALAPPDATA, 'pnpm'),
        join(env.LOCALAPPDATA, 'Yarn', 'bin'),
        join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'),
        join(env.LOCALAPPDATA, 'Programs', 'nodejs'),
        join(env.LOCALAPPDATA, 'Programs', 'codex'),
        join(env.LOCALAPPDATA, 'Programs', 'claude')
      );
      if (provider.id === 'agy') {
        dirs.push(
          join(env.LOCALAPPDATA, 'agy', 'bin'),
          join(env.LOCALAPPDATA, 'Programs', 'agy'),
          join(env.LOCALAPPDATA, 'Programs', 'Antigravity', 'bin')
        );
      }
    }
    if (env.ProgramFiles) dirs.push(join(env.ProgramFiles, 'nodejs'));
    dirs.push(join(home, 'scoop', 'shims'));
  } else {
    dirs.push(
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/usr/local/bin',
      join(home, '.fnm', 'current', 'bin'),
      join(home, '.local', 'share', 'mise', 'shims'),
      join(home, '.asdf', 'shims'),
      join(home, '.local', 'share', 'pnpm'),
      join(home, '.yarn', 'bin'),
      join(home, '.config', 'yarn', 'global', 'node_modules', '.bin'),
      join(home, '.antigravity', 'bin')
    );
    if (platform === 'darwin') {
      dirs.push(
        join(home, 'Library', 'pnpm'),
        join(home, 'Library', 'Application Support', 'fnm', 'aliases', 'default', 'bin')
      );
      if (provider.id === 'codex') {
        dirs.push(
          '/Applications/Codex.app/Contents/Resources',
          '/Applications/ChatGPT.app/Contents/Resources'
        );
      }
      if (provider.id === 'agy') {
        dirs.push('/Applications/Antigravity.app/Contents/Resources/app/bin');
      }
    } else {
      dirs.push(join(home, '.local', 'share', 'fnm', 'aliases', 'default', 'bin'));
    }
    const versions = join(home, '.nvm', 'versions', 'node');
    try {
      for (const version of fs.readdirSync(versions).reverse()) dirs.push(join(versions, version, 'bin'));
    } catch {}
  }

  return [...new Set(dirs.filter(dir => dir && isAbs(dir)))];
}

function findInDirs(provider, search, win) {
  const pathStr = search.join(path.delimiter);
  for (const dir of search) {
    const exe = path.join(dir, provider.id + (win ? '.exe' : ''));
    try {
      fs.accessSync(exe, fs.constants.X_OK);
      if (fs.statSync(exe).isFile()) return { exe, args: [], path: pathStr };
    } catch {}
    if (!win || !provider.pkg) continue;
    // Invoke npm/pnpm's declared bin with node, bypassing cmd.exe shell parsing.
    const roots = [
      path.join(dir, 'node_modules', provider.pkg),
      path.join(dir, 'global', '5', 'node_modules', provider.pkg)
    ];
    for (const root of roots) {
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        const binField = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[provider.id];
        if (!binField) continue;
        const entry = path.resolve(root, binField);
        const node = search.map(d => path.join(d, 'node.exe')).find(f => fs.existsSync(f));
        if (manifest.name !== provider.pkg || !entry.startsWith(root + path.sep) || !fs.statSync(entry).isFile()) continue;
        if (/\.exe$/i.test(entry)) return { exe: entry, args: [], path: pathStr };
        if (node) return { exe: node, args: [entry], path: pathStr };
      } catch {}
    }
  }
  return null;
}

function launchSpec(provider, opts = {}) {
  const win = (opts.platform || process.platform) === 'win32';
  const primary = collectSearchDirs(provider, { ...opts, includeShell: false });
  const found = findInDirs(provider, primary, win);
  if (found) return found;
  if (!win && opts.probeShell !== false) {
    const extended = collectSearchDirs(provider, { ...opts, includeShell: true });
    if (extended.length > primary.length) return findInDirs(provider, extended, win);
  }
  return null;
}

function parseAntigravityModels(rawOutput) {
  const clean = stripVTControlCharacters(String(rawOutput || ''));
  const lines = clean.split(/\r?\n/);
  const models = new Map();
  const displayCandidates = [];

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;
    if (/^[-=─━]{3,}$/.test(line)) continue;
    if (/^(?:model(?:\s+id|\s+slug)?(?:\s+name|\s+display|\s+label)?|available\s+models:?|usage:|tip:|run\s+agy|note:)/i.test(line)) continue;

    let isDefault = false;
    if (/^\*\s+/.test(line)) {
      isDefault = true;
      line = line.replace(/^\*\s+/, '').trim();
    } else {
      line = line.replace(/^(?:[-•▸>])\s+/, '').trim();
    }
    if (/\(default\)$/i.test(line) || /\bdefault\s*$/i.test(line) && /\s{2,}default$/i.test(line)) {
      isDefault = true;
      line = line.replace(/\s*\(default\)$/i, '').replace(/\s{2,}default$/i, '').trim();
    }

    // 1. Two columns separated by tab or 2+ spaces: "gemini-4-neon-high   Gemini 4 Neon (High)"
    let match = line.match(/^([a-z0-9][a-z0-9._:/-]*)(?:\t+|[ ]{2,})(\S.*)$/i);
    if (match) {
      const id = match[1];
      const label = match[2].trim();
      if (!/^(?:id|slug|model|name)$/i.test(id)) {
        models.set(id, { id, label, isDefault });
      }
      continue;
    }

    // 2. Single-space separated where first token is clearly a slug (contains -, _, ., :, or /)
    match = line.match(/^([a-z0-9][a-z0-9._:/-]*(?:[-._:/][a-z0-9._:/-]+)+)[ ]+(\S.*)$/);
    if (match) {
      const id = match[1];
      const label = match[2].trim();
      models.set(id, { id, label, isDefault });
      continue;
    }

    // 3. Single-column model slug: "gemini-3.8-flash-high"
    match = line.match(/^([a-z0-9][a-z0-9._:/-]*(?:[-._:/][a-z0-9._:/-]+)+)$/);
    if (match) {
      const id = match[1];
      models.set(id, { id, label: id, isDefault });
      continue;
    }

    // 4. Collect display-name-only lines (e.g. "Gemini 3.5 Flash (High)") as fallback
    if (/^[A-Za-z][A-Za-z0-9 .()/_-]{2,80}$/.test(line) && !/^(?:error|warning|failed|sign in|authentication)/i.test(line)) {
      displayCandidates.push({ label: line, isDefault });
    }
  }

  if (!models.size && displayCandidates.length) {
    for (const item of displayCandidates) {
      const slug = item.label.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');
      if (slug && /^[a-z0-9][a-z0-9._:/-]{0,119}$/i.test(slug)) {
        models.set(slug, { id: slug, label: item.label, isDefault: item.isDefault });
      }
    }
  }

  return [...models.values()];
}

function command(id) {
  const provider = providers.find(p => p.id === id);
  const spec = provider && launchSpec(provider);
  if (!spec) throw Error('未找到本机工具，请安装后重新检测');
  return spec;
}
function options(spec, cwd) {
  return { cwd, windowsHide: true, env: { ...process.env, PATH: spec.path } };
}

class AgentSession {
  constructor(send, dir, openBrowser) {
    this.openBrowser = openBrowser;
    this.send = send;
    this.dir = path.join(dir, 'agent-chats');
    // This overlay was generated by old TeXora releases.
    try { fs.rmSync(path.join(this.dir, 'dsh-credentials.yml'), { force: true }); } catch {}
    this.job = null;
    this.modelCatalog = null;
    this.claudeCatalog = null;
    this.agyCatalog = null;
  }
  list() { return providers.map(p => ({ id: p.id, label: p.label, models: p.models, installed: !!launchSpec(p) })); }
  async models(id, cwd, refresh = false) {
    const provider = this.list().find(item => item.id === id);
    if (!provider?.installed) return { models: [], error: '未检测到本机工具' };
    if (id === 'agy') return this.antigravityModels(refresh);
    if (id === 'claude') return this.claudeModels(cwd, refresh);
    const spec = command(id);
    const directory = cwd || os.homedir();
    const cached = this.modelCatalog;
    if (cached?.directory === directory && cached.exe === spec.exe && (!cached.expires || (!refresh && cached.expires > Date.now()))) {
      return cached.result;
    }
    const entry = { directory, exe: spec.exe };
    this.modelCatalog = entry;
    entry.result = listCodexModels(spec, options(spec, directory)).then(models => {
      entry.expires = Date.now() + 60000;
      return { models, source: 'codex' };
    }, error => {
      if (this.modelCatalog === entry) this.modelCatalog = null;
      return { models: [], error: safeError(error.message) };
    });
    return entry.result;
  }
  claudeModels(cwd, refresh = false) {
    const spec = command('claude');
    const directory = cwd || os.homedir();
    const cached = this.claudeCatalog;
    if (cached?.directory === directory && cached.exe === spec.exe && (!cached.expires || (!refresh && cached.expires > Date.now()))) {
      return cached.result;
    }
    const entry = { directory, exe: spec.exe };
    this.claudeCatalog = entry;
    entry.result = listClaudeModels(spec, options(spec, directory)).then(models => {
      entry.expires = Date.now() + 60000;
      return { models, source: 'claude' };
    }, () => {
      if (this.claudeCatalog === entry) this.claudeCatalog = null;
      return { models: DEFAULT_CLAUDE_MODELS, source: 'suggested' };
    });
    return entry.result;
  }
  antigravityModels(refresh = false) {
    const spec = command('agy');
    const cached = this.agyCatalog;
    if (!refresh && cached?.exe === spec.exe && (!cached.expires || cached.expires > Date.now())) return cached.result;
    const entry = { exe: spec.exe };
    this.agyCatalog = entry;
    entry.result = new Promise(resolve => {
      execFile(spec.exe, [...spec.args, 'models'], { ...options(spec, os.homedir()), timeout: 20000, maxBuffer: 256 * 1024 }, (error, out, stderr) => {
        const models = parseAntigravityModels(out);
        const detail = safeError(stderr || out);
        if (!error) {
          if (models.length) {
            entry.expires = Date.now() + 60000;
            return resolve({ models, source: 'agy', authenticated: true });
          }
          if (this.agyCatalog === entry) this.agyCatalog = null;
          if (/sign in|authentication required|log in/i.test(detail)) {
            return resolve({ models: [], authenticated: false });
          }
          return resolve({ models: [], source: 'agy', authenticated: true, error: '未解析到 Antigravity 模型列表，请检查 agy CLI 版本或登录状态' });
        }
        if (this.agyCatalog === entry) this.agyCatalog = null;
        if (/sign in|authentication required|log in/i.test(detail)) {
          return resolve({ models: [], authenticated: false });
        }
        resolve({ models: [], error: error.killed ? 'Antigravity 模型查询超时' : detail || '无法读取 Antigravity 模型列表' });
      });
    });
    return entry.result;
  }
  async environment() {
    cachedLoginShellDirs = null;
    return Promise.all(providers.map(async p => {
      const spec = launchSpec(p);
      const base = { id: p.id, label: p.label, models: p.models, installed: !!spec, platform: process.platform };
      if (!spec) {
        const searchedDirs = collectSearchDirs(p, { includeShell: process.platform !== 'win32' }).slice(0, 8);
        return { ...base, binPath: '', searchedDirs };
      }
      const version = new Promise(resolve => execFile(spec.exe, [...spec.args, '--version'],
        { ...options(spec, os.homedir()), timeout: 5000, maxBuffer: 32768 }, (error, out) => {
          resolve(error ? '' : stripVTControlCharacters(String(out)).trim().split(/\r?\n/)[0].slice(0, 120));
        }));
      const [account, details] = await Promise.all([
        Promise.resolve().then(() => this.status(p.id)).catch(() => ({})),
        version
      ]);
      return { ...base, ...account, version: details, binPath: spec.exe };
    }));
  }
  status(id) {
    if (id === 'agy') return this.antigravityModels().then(({ authenticated, error }) => ({ authenticated, error }));
    const spec = command(id);
    const args = id === 'codex' ? ['login', 'status'] : ['auth', 'status', '--json'];
    return new Promise(resolve => execFile(spec.exe, [...spec.args, ...args], { ...options(spec, os.homedir()), timeout: 12000 }, (error, out) => {
      if (error?.killed) return resolve({ error: '账号检测超时，请重新检测' });
      if (id === 'codex') return resolve({ authenticated: !error });
      try { resolve({ authenticated: JSON.parse(out).loggedIn === true }); }
      catch { resolve({ authenticated: false }); }
    }));
  }
  historyFile(id,cwd) {
    return path.join(this.dir, createHash('sha256').update(JSON.stringify([id,cwd])).digest('hex')+'.json');
  }
  history(id,cwd) {
    if (!cwd || !providers.some(provider=>provider.id===id)) return [];
    try { return JSON.parse(fs.readFileSync(this.historyFile(id,cwd),'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  save(job) {
    const file = this.historyFile(job.id,job.cwd);
    const history = this.history(job.id,job.cwd).filter(c => c.id !== job.chat.id);
    fs.mkdirSync(this.dir,{recursive:true});
    fs.writeFileSync(file+'.tmp', JSON.stringify([job.chat,...history]),{mode:0o600});
    fs.renameSync(file+'.tmp', file);
  }
  start(id,cwd,kind,request={}) {
    if (this.job) throw Error('请先结束当前操作');
    const spec = command(id);
    if (kind === 'login' && id === 'codex') {
      const emit = payload => this.send('agent:event',{provider:id,...payload});
      this.job = startCodexLogin(spec,options(spec,os.homedir()),emit,this.openBrowser,error=>{
        this.job=null;
        this.modelCatalog=null;
        emit({ended:true,kind,error});
      });
      return {ok:true};
    }
    let args, chat, prompt, before;
    const cacheDir = request.cacheDir;
    if (kind === 'login' && id === 'claude') {
      args = ['auth','login'];
    } else if (kind === 'message') {
      if (!cwd) throw Error('请先打开项目文件夹');
      prompt = String(request.text || '').trim();
      if (!prompt || prompt.length > 100000) throw Error('请输入 1 到 100000 个字符');
      if (request.chatId) {
        chat = this.history(id,cwd).find(c => c.id === request.chatId);
        if (!chat?.remote) throw Error('该会话尚未建立，请新建聊天');
      } else chat = {id:randomUUID(),title:prompt.slice(0,80),messages:[]};
      const model = String(request.model || '').trim();
      if (model && (!/^[a-z0-9][a-z0-9._:/\[\]-]{0,119}$/i.test(model))) throw Error('模型 ID 格式无效');
      const modelArgs = model ? ['--model',model] : [];
      chat.updated = Date.now();
      chat.messages.push({role:'user',text:prompt});
      if (id === 'codex') {
        args = ['exec','--sandbox','workspace-write','--skip-git-repo-check','--json',...modelArgs,...(chat.remote ? ['resume',chat.remote] : []),'-'];
      } else if (id === 'agy') {
        args = ['--input-format','stream-json','--output-format','stream-json',...modelArgs,
          ...(chat.remote ? ['--conversation',chat.remote] : [])];
        prompt = JSON.stringify({event:'user',message:{content:prompt}})+'\n';
      } else {
        args = ['-p','--output-format','stream-json','--verbose',...modelArgs,...(chat.remote ? ['--resume',chat.remote] : [])];
      }
      before = snapshotProject(cwd,cacheDir);
    } else throw Error('不支持此操作');
    const child = spawn(spec.exe,[...spec.args,...args],{...options(spec,kind === 'login' ? os.homedir() : cwd || os.homedir()),detached:process.platform!=='win32',stdio:'pipe'});
    const job = this.job = {id,cwd,kind,child,chat};
    const emit = payload => { if (this.job === job) this.send('agent:event',{provider:id, projectRoot:cwd, ...payload}); };
    let stderrHint = '', diagnostic = '', reply = '', activity = '';
    const read = (data,stdout) => {
      if (this.job !== job) return;
      if (kind === 'login') {
        // Only the provider-owned browser sign-in URL is passed to the UI.
        const link = data.match(/https:\/\/[^\s\x1b<>"]+/)?.[0];
        if (link) {
          try {
            const url = new URL(link);
            if (['auth.openai.com','claude.com','claude.ai','platform.claude.com','console.anthropic.com'].includes(url.hostname))
              emit({loginUrl:url.href});
          } catch {}
        }
        return;
      }
      if (!stdout) {
        if (id === 'agy' && /^(?:error|warning):/i.test(data)) stderrHint ||= safeError(data);
        return;
      }
      let e;
      try { e = JSON.parse(data); } catch { return; }
      if (id === 'agy') {
        if (e.event === 'init' && typeof e.conversation_id === 'string') chat.remote = e.conversation_id;
        if (e.event === 'step_update' && e.step_update?.state === 'ACTIVE' && /tool|command/.test(e.step_update.step_type || ''))
          emit({activity:e.step_update.step_type});
        if (e.event === 'result') {
          const result = e.result;
          if (typeof result?.conversation_id === 'string' && result.conversation_id) chat.remote = result.conversation_id;
          reply = typeof result?.response === 'string' ? result.response : '';
          if (reply) emit({message:reply});
          if (result?.status !== 'SUCCESS') diagnostic = stderrHint || safeError(result?.error) || 'Antigravity 未完成本次回答';
        }
        return;
      }
      if (e.type === 'thread.started') chat.remote = e.thread_id;
      if (e.type === 'system' && e.subtype === 'init') chat.remote = e.session_id;
      let message = '';
      if (e.type === 'item.completed' && e.item?.type === 'agent_message') message = e.item.text;
      if (e.type === 'assistant') message = (e.message?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
      if (e.type === 'result' && !e.is_error && !reply) message = e.result;
      if (message) {
        reply += (reply ? '\n\n' : '') + message;
        emit({message});
      }
      if (e.type === 'item.started' || e.message?.content?.some(c=>c.type==='tool_use')) {
        activity = e.item?.type || e.message.content.find(c=>c.type==='tool_use').name;
        emit({activity});
      }
      if (e.type === 'turn.failed' || e.type === 'error' || e.is_error) diagnostic = e.error?.message || e.message?.message || (typeof e.message === 'string' && e.message) || e.result || '请求失败';
    };
    if (kind === 'login' && id === 'claude') {
      let tail = '';
      const promptForCode = chunk => {
        tail = (tail + chunk.toString()).slice(-512);
        if (/paste (?:the )?code/i.test(tail)) { emit({codePrompt:true}); tail = ''; }
      };
      child.stdout.on('data',promptForCode);
      child.stderr.on('data',promptForCode);
    }
    for (const [stream,stdout] of [[child.stdout,true],[child.stderr,false]]) {
      createInterface({input:stream, crlfDelay:Infinity}).on('line',line=>read(line,stdout));
    }
    let cancelled = false;
    const finish = error => {
      if (this.job !== job) return;
      if (chat && id === 'agy' && !error && !cancelled && !reply) error = 'Antigravity 未返回回答，请检查 CLI 版本与登录状态。';
      if (chat) {
        chat.updated = Date.now();
        if (reply) chat.messages.push({role:'assistant',text:reply,completedAt:error || cancelled ? undefined : chat.updated});
        const {changes,limited} = compareProject(before,snapshotProject(cwd,cacheDir));
        if (changes.length || limited) chat.messages.push({role:'changes',changes,limited});
        if (error || cancelled) chat.messages.push({role:'status',text:error || '已停止'});
        try { this.save(job); } catch { error = '会话记录保存失败'; }
      }
      if (kind === 'login' && id === 'claude') this.claudeCatalog = null;
      emit({ended:true, kind, chatId:chat?.id, error});
      this.job = null;
    };
    job.cancel = () => { cancelled = true; killTree(child.pid); };
    child.on('error',e=>finish(e.message));
    child.on('close',code=>finish(cancelled ? '' : diagnostic || (code !== 0 ? stderrHint || '工具已退出（'+code+'），请检查账号状态和本机配置。' : '')));
    child.stdin.on('error',()=>{});
    if (kind !== 'login') child.stdin.end(prompt);
    return {ok:true, chatId:chat?.id};
  }
  loginCode(code) {
    if (this.job?.kind !== 'login' || this.job.id !== 'claude' || typeof code !== 'string' || !code.trim() || /[\r\n]/.test(code) || code.length > 8192)
      throw Error('无效的登录回调');
    this.job.child.stdin.write(code.trim()+'\n');
    return {ok:true};
  }
  stop() { this.job?.cancel(); }
}
module.exports = { AgentSession, launchSpec, parseAntigravityModels, collectSearchDirs };
