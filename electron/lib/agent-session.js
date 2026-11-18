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
  constructor(send, web, dir) {
    this.send = send;
    this.web = web;
    this.dir = path.join(dir, 'agent-chats');
    this.job = null;
  }
  list() { return providers.map(p => ({id:p.id, label:p.label, installed:!!launchSpec(p)})); }
  status(id) {
    if (id === 'dsh') return {web:true};
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
    let args, chat, prompt;
    if (kind === 'login' && id !== 'dsh') {
      args = id === 'codex' ? ['login'] : ['auth','login'];
    } else if (kind === 'web' && id === 'dsh') {
      if (!cwd) throw Error('请先打开项目文件夹');
      args = ['web','--no-open','--host','127.0.0.1','--port','0'];
    } else if (kind === 'message' && id !== 'dsh') {
      if (!cwd) throw Error('请先打开项目文件夹');
      prompt = String(request.text || '').trim();
      if (!prompt || prompt.length > 100000) throw Error('请输入 1 到 100000 个字符');
      if (request.chatId) {
        chat = this.history(id,cwd).find(c => c.id === request.chatId);
        if (!chat?.remote) throw Error('该会话尚未建立，请新建聊天');
      } else chat = {id:randomUUID(),title:prompt.slice(0,80),messages:[]};
      chat.updated = Date.now();
      chat.messages.push({role:'user',text:prompt});
      if (id === 'codex') {
        args = ['exec','--sandbox','workspace-write','--skip-git-repo-check','--json',...(chat.remote ? ['resume',chat.remote] : []),'-'];
      } else {
        args = ['-p','--output-format','stream-json','--verbose',...(chat.remote ? ['--resume',chat.remote] : [])];
      }
    } else throw Error('不支持此操作');
    const child = spawn(spec.exe,[...spec.args,...args],{...options(spec,cwd || os.homedir()),detached:process.platform!=='win32',stdio:'pipe'});
    const job = this.job = {id,cwd,kind,child,chat};
    const emit = payload => { if (this.job === job) this.send('agent:event',{provider:id, ...payload}); };
    let diagnostic = '', reply = '', activity = '', opened = false;
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
      if (!stdout) return;
      let e;
      try { e = JSON.parse(data); } catch { return; }
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
    const finish = (error, cancelled=false) => {
      if (this.job !== job) return;
      if (chat) {
        if (reply) chat.messages.push({role:'assistant',text:reply});
        if (error || cancelled) chat.messages.push({role:'status',text:error || '已停止'});
        try { this.save(job); } catch { error = '会话记录保存失败'; }
      }
      if (kind === 'web') this.web.close();
      emit({ended:true, kind, chatId:chat?.id, error});
      this.job = null;
    };
    job.cancel = () => { killTree(child.pid); finish('',true); };
    child.on('error',e=>finish(e.message));
    child.on('close',code=>finish(diagnostic || (code !== 0 ? '工具已退出（'+code+'），请检查账号状态和本机配置。' : '')));
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
