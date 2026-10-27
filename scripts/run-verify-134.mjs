import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
const root=process.cwd(),fixture=path.join(root,'.capture/verify134-project'),profile=process.env.TEXORA_USER_DATA || path.join(root,'.capture/verify134-profile-'+Date.now());
fs.mkdirSync(fixture,{recursive:true});fs.mkdirSync(profile,{recursive:true});
fs.writeFileSync(path.join(fixture,'main.tex'),String.raw`\documentclass{article}
\usepackage{amsmath,amsthm}
\newtheorem{claimx}{Claim}
\begin{document}
Original target.
\ref{eq:child}
\begin{equation}\label{eq:main}x=1\end{equation}
\input{child}
\end{document}`);
fs.writeFileSync(path.join(fixture,'child.tex'),String.raw`\begin{claimx}[A child theorem]
Statement.\label{thm:child}
\end{claimx}
\[
x=2\label{eq:child}
\]
\ref{eq:main}`);
fs.writeFileSync(path.join(fixture,'ignored.sty'),'\\begin{equation}not-a-document\\end{equation}');
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({general:{autoCheckUpdates:false},build:{livePreview:false},editor:{autosave:false}}));
const requests=[];fs.writeFileSync('.capture/verify134-http.json','[]');
const server=http.createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
  const data=JSON.parse(body);requests.push(data);fs.writeFileSync('.capture/verify134-http.json',JSON.stringify(requests));
  const user=data.messages.filter(message=>message.role==='user').map(message=>message.content).join('\n');const instruction=user.split('任务（用户指令）：\n').at(-1);
  const edit=data.messages.some(message=>message.role==='system' && message.content.includes('本次任务的结果将用于直接替换'));
  const text=instruction.includes('[CASE:BAD]')?'以下是修改后的内容：\nChanged text.\n修改说明：improved.':instruction.includes('[CASE:FENCED]')?'以下是润色结果：\n```latex\n\\textbf{Fenced replacement.}\n```\n修改说明：Only the code is the result.':edit?JSON.stringify({replacement:String.raw`\textbf{Polished target.}`,notes:'This must never enter the replacement.'}):'检查回答：需要结合条件判断公式是否成立。';
  setTimeout(()=>{if(res.destroyed)return;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:text},finish_reason:'stop'}]}));},edit?1500:150);
});});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));fs.writeFileSync('.capture/verify134-server.json',JSON.stringify({port:server.address().port,fixture}));
const child=spawn(process.execPath,['scripts/cdp.mjs','--script','scripts/verify-134.mjs','--','--project='+fixture],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,TEXORA_ELECTRON:process.env.TEXORA_ELECTRON || path.join(root,'node_modules/electron/dist/electron.exe'),TEXORA_USER_DATA:profile}});
const finish=code=>{server.closeAllConnections();server.close();process.exitCode=code??1;};child.on('exit',finish);child.on('error',error=>{console.error(error);finish(1);});
