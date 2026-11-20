'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const providers = [
  { id: 'codex', label: 'Codex', pkg: '@openai/codex', models: [] },
  { id: 'claude', label: 'Claude Code', pkg: '@anthropic-ai/claude-code', models: ['sonnet','opus','haiku'] },
  { id: 'dsh', label: 'DeepSeek Harness', pkg: '@deepseek-ai/dsh', models: ['deepseek-flash','deepseek-pro'] }
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
      if (manifest.name !== provider.pkg || !entry.startsWith(root + path.sep) || !fs.statSync(entry).isFile()) continue;
      if (/\.exe$/i.test(entry)) return {exe:entry, args:[], path:search.join(path.delimiter)};
      if (node) return {exe:node, args:[entry], path:search.join(path.delimiter)};
    } catch {}
  }
  return null;
}

const {spawn, execFile} = require('node:child_process');
const {createInterface} = require('node:readline');
const {randomUUID, createHash} = require('node:crypto');
const {killTree} = require('./run');
const {snapshotProject,compareProject} = require('./agent-changes');
const {listCodexModels} = require('./codex-models');
const {startCodexLogin,safeError} = require('./codex-login');

function command(id) {
  const provider = providers.find(p => p.id === id);
  const spec = provider && launchSpec(provider);
  if (!spec) throw Error('未找到本机工具，请安装后重新检测');
  return spec;
}
function options(spec, cwd) {
  return {cwd, windowsHide:true, env:{...process.env, PATH:spec.path}};
}

class AgentSession {
  constructor(send, web, dir, openBrowser) {
    this.openBrowser = openBrowser;
    this.send = send;
    this.web = web;
    this.dir = path.join(dir, 'agent-chats');
    this.job = null;
    this.modelCatalog = null;
  }
  list() { return providers.map(p => ({id:p.id, label:p.label, models:p.models, installed:!!launchSpec(p)})); }
  async models(id,cwd,refresh=false) {
    const provider = this.list().find(item=>item.id===id);
    if (!provider?.installed) return {models:[],error:'未检测到本机工具'};
    if (id !== 'codex') return {models:provider.models.map(id=>({id,label:id})),source:'suggested'};
    const spec = command(id);
    const directory = cwd || os.homedir();
    const cached = this.modelCatalog;
    if (cached?.directory === directory && cached.exe === spec.exe && (!cached.expires || (!refresh && cached.expires > Date.now()))) {
      return cached.result;
    }
    const entry = {directory,exe:spec.exe};
    this.modelCatalog = entry;
    entry.result = listCodexModels(spec,options(spec,directory)).then(models=>{
      entry.expires = Date.now()+60000;
      return {models,source:'codex'};
    }, error=>{
      if (this.modelCatalog === entry) this.modelCatalog = null;
      return {models:[],error:safeError(error.message)};
    });
    return entry.result;
  }
  async environment() {
    return Promise.all(this.list().map(async provider => {
      if (!provider.installed) return provider;
      const spec = launchSpec(providers.find(p=>p.id===provider.id));
      if (!spec) return {...provider,installed:false};
      const version = new Promise(resolve => execFile(spec.exe, [...spec.args,'--version'],
        {...options(spec,os.homedir()),timeout:5000,maxBuffer:32768}, (error,out) => {
          resolve(error ? '' : String(out).trim().split(/\r?\n/)[0].slice(0,120));
        }));
      const [account,details] = await Promise.all([Promise.resolve().then(()=>this.status(provider.id)).catch(()=>({})),version]);
      return {...provider,...account,version:details};
    }));
  }
  status(id) {
    if (id === 'dsh') return {local:true};
    const spec = command(id);
    const args = id === 'codex' ? ['login','status'] : ['auth','status','--json'];
    return new Promise(resolve => execFile(spec.exe, [...spec.args,...args], {...options(spec,os.homedir()),timeout:12000}, (error,out) => {
      if (error?.killed) return resolve({error:'账号检测超时，请重新检测'});
      if (id === 'codex') return resolve({authenticated:!error});
      try { resolve({authenticated:JSON.parse(out).loggedIn === true}); }
      catch { resolve({authenticated:false}); }
    }));
  }
  historyFile(id,cwd) {
    return path.join(this.dir, createHash('sha256').update(JSON.stringify([id,cwd])).digest('hex')+'.json');
  }
  history(id,cwd) {
    if (!cwd) return [];
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
    if (kind === 'login' && id !== 'dsh') {
      args = ['auth','login'];
    } else if (kind === 'web' && id === 'dsh') {
      if (!cwd) throw Error('请先打开项目文件夹');
      args = ['web','--no-open','--host','127.0.0.1','--port','0'];
    } else if (kind === 'message') {
      if (!cwd) throw Error('请先打开项目文件夹');
      prompt = String(request.text || '').trim();
      if (!prompt || prompt.length > 100000) throw Error('请输入 1 到 100000 个字符');
      if (request.chatId) {
        chat = this.history(id,cwd).find(c => c.id === request.chatId);
        if (!chat?.remote) throw Error('该会话尚未建立，请新建聊天');
      } else chat = {id:randomUUID(),title:prompt.slice(0,80),messages:[]};
      const model = String(request.model || '').trim();
      if (model && (!/^[a-z0-9][a-z0-9._:/-]{0,119}$/i.test(model))) throw Error('模型 ID 格式无效');
      const modelArgs = model ? ['--model',model] : [];
      chat.updated = Date.now();
      chat.messages.push({role:'user',text:prompt});
      if (id === 'codex') {
        args = ['exec','--sandbox','workspace-write','--skip-git-repo-check','--json',...modelArgs,...(chat.remote ? ['resume',chat.remote] : []),'-'];
      } else if (id === 'dsh') {
        // DSH's shipped headless profile needs its official credential-store overlay
        // to reuse accounts configured in its Web app. Keep the user's profiles intact.
        fs.mkdirSync(this.dir,{recursive:true});
        const overlay = path.join(this.dir,'dsh-credentials.yml');
        const account = '- id: credentials\n  disabled: false\n- id: authorization\n  disabled: false\n- id: deepseek-account\n  disabled: false\n';
        const selection = model ? `- id: agent-default-model\n  config:\n    provider: deepseek-official\n    model: ${JSON.stringify(model)}\n` : '';
        fs.writeFileSync(overlay,account + selection);
        args = ['--profile','headless','--patch',overlay,'--json',...(chat.remote ? ['--session-id',chat.remote] : []),'-'];
      } else {
        args = ['-p','--output-format','stream-json','--verbose',...modelArgs,...(chat.remote ? ['--resume',chat.remote] : [])];
      }
      before = snapshotProject(cwd,cacheDir);
    } else throw Error('不支持此操作');
    const child = spawn(spec.exe,[...spec.args,...args],{...options(spec,kind === 'login' ? os.homedir() : cwd || os.homedir()),detached:process.platform!=='win32',stdio:'pipe'});
    const job = this.job = {id,cwd,kind,child,chat};
    const emit = payload => { if (this.job === job) this.send('agent:event',{provider:id, projectRoot:cwd, ...payload}); };
    let stderrHint = '', diagnostic = '', reply = '', activity = '', opened = false;
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
      if (kind === 'web') {
        const entry = data.match(/http:\/\/127\.0\.0\.1:\d+\/[^\s\x1b]*/);
        if (entry && !opened) { opened = true; this.web.open(entry[0]); }
        return;
      }
      if (!stdout) {
        if (id === 'dsh' && /^(?:dsh:|error:)/i.test(data)) stderrHint = safeError(data);
        return;
      }
      let e;
      try { e = JSON.parse(data); } catch { return; }
      if (id === 'dsh') {
        if (e.type === 'session') chat.remote = e.sessionId;
        if (e.type === 'tool_call') emit({activity:e.name || '工具'});
        if (e.type === 'final') {
          reply = String(e.text || '');
          if (reply) emit({message:reply});
          if (e.reason?.kind !== 'completed') diagnostic = safeError(e.reason?.error?.message) || 'DeepSeek 未完成本次回答';
        }
        if (e.type === 'error') diagnostic = safeError(e.message) || 'DeepSeek 请求失败';
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
      if (chat && id === 'dsh' && !error && !cancelled && !reply) error = '未收到 DeepSeek 回答，请检查 Harness 版本及账号配置。';
      if (chat) {
        chat.updated = Date.now();
        if (reply) chat.messages.push({role:'assistant',text:reply,completedAt:error || cancelled ? undefined : chat.updated});
        const {changes,limited} = compareProject(before,snapshotProject(cwd,cacheDir));
        if (changes.length || limited) chat.messages.push({role:'changes',changes,limited});
        if (error || cancelled) chat.messages.push({role:'status',text:error || '已停止'});
        try { this.save(job); } catch { error = '会话记录保存失败'; }
      }
      if (kind === 'web') this.web.close();
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
module.exports = { AgentSession };
