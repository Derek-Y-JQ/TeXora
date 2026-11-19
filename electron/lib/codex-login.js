'use strict';
const {spawn} = require('node:child_process');
const {createInterface} = require('node:readline');
const {stripVTControlCharacters} = require('node:util');
const {killTree} = require('./run');
const {version} = require('../../package.json');

function safeError(value) {
  return stripVTControlCharacters(String(value || ''))
    .replace(/https?:\/\/\S+/gi, '[网址]')
    .replace(/\b(?:Bearer\s+\S+|sk-[\w-]+|eyJ[\w.-]+)/gi, '[已隐藏]')
    .replace(/((?:token|password|secret|api[_-]?key|state|code_verifier)\s*[:=]\s*)[^\s,}]+/gi, '$1[已隐藏]')
    .trim().slice(-500);
}

// Codex's app-server owns the OAuth callback and credential store. Its
// structured login response gives the host the URL it must open itself.
function startCodexLogin(spec, options, emit, openBrowser, onEnd) {
  const child = spawn(spec.exe,[...spec.args,'app-server'],{
    ...options, detached:process.platform !== 'win32', stdio:'pipe'
  });
  let ended=false, loginId, stderr='', stage=1;
  const timer=setTimeout(()=>finish('Codex 没有返回登录地址，请检查本机 Codex 版本及网络。'),45000);
  function finish(error='') {
    if (ended) return;
    ended=true;
    clearTimeout(timer);
    if (child.exitCode===null && child.signalCode===null) killTree(child.pid);
    onEnd(error);
  }
  function write(message) { child.stdin.write(JSON.stringify(message)+'\n'); }
  child.on('error',error=>finish(safeError(error.message)));
  child.stdin.on('error',error=>{ if (!ended) stderr ||= safeError(error.message); });
  child.on('close',code=>finish('Codex 登录进程退出（'+code+'）。'+(stderr || '请确认所安装的 Codex 支持 app-server。')));
  createInterface({input:child.stderr,crlfDelay:Infinity}).on('line',line=>{
    if (line.trim()) stderr=safeError(line);
  });
  createInterface({input:child.stdout,crlfDelay:Infinity}).on('line',line=>{
    if (ended) return;
    let msg;
    try { msg=JSON.parse(line); } catch { return; }
    if (msg.method==='account/login/completed') {
      if (loginId && msg.params?.loginId===loginId)
        finish(msg.params.success ? '' : safeError(msg.params.error) || 'Codex 授权未完成');
      return;
    }
    if (msg.id!==stage) return;
    if (msg.error) {
      const reason=safeError(msg.error.message);
      if (stage===2 && /address already in use|port.*in use|failed to bind|cannot bind|10048|os error 48/i.test(reason)) {
        stage=3;
        write({id:3,method:'account/login/start',params:{type:'chatgptDeviceCode'}});
      } else finish((stage===3 ? '本地登录端口被占用，设备码登录也未能启动。' : 'Codex 登录失败。')+reason);
      return;
    }
    if (stage===1) {
      write({method:'initialized'});
      stage=2;
      write({id:2,method:'account/login/start',params:{type:'chatgpt'}});
      return;
    }
    if (stage>3) return;
    const result=msg.result || {};
    const device=stage===3;
    let url;
    try { url=new URL(device ? result.verificationUrl : result.authUrl); } catch {}
    if (url?.origin!=='https://auth.openai.com' || url.username || url.password || !result.loginId || (device && !result.userCode))
      return finish('Codex 未返回有效的 OpenAI 登录地址，请更新本机 Codex。');
    clearTimeout(timer);
    stage=4;
    loginId=result.loginId;
    emit({loginUrl:url.href,deviceCode:device ? result.userCode : undefined});
    Promise.resolve().then(()=>!ended && openBrowser(url.href)).catch(()=>{
      if (!ended) emit({browserError:'系统未能打开默认浏览器，请点击「打开登录页面」或复制链接。'});
    });
  });
  write({id:1,method:'initialize',params:{clientInfo:{name:'texora',title:'TeXora',version},capabilities:null}});
  return {cancel:()=>finish()};
}
module.exports={startCodexLogin};
