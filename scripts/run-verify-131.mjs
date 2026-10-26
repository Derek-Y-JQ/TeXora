import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
const root=process.cwd(), fixture=path.join(root,'.capture','verify131-project');
fs.mkdirSync(fixture,{recursive:true});
fs.writeFileSync(path.join(fixture,'main.tex'), [String.raw`\documentclass{article}`, String.raw`\usepackage{amsmath}`, String.raw`\newcommand{\testcontext}{CURRENT_FILE_ONLY}`, String.raw`\begin{document}`, 'Original target.', '', String.raw`\[`, 'x=1 % equation comment stays', String.raw`\]`, 'Following text. % keep this comment', 'Another line.', String.raw`\end{document}`, ''].join('\n'));
for (const [name,content] of Object.entries({'helper-a.tex':'OTHER_A_ONLY','helper-b.md':'OTHER_B_ONLY','rule-a.md':'# Rule A\nSKILL_A_RULE','rule-b.md':'# Rule B\nSKILL_B_RULE'})) fs.writeFileSync(path.join(fixture,name),content);
const requests=[];
fs.writeFileSync(path.join(root,'.capture','verify131-http.json'),'[]');
const server=http.createServer((req,res)=>{
  if(req.method!=='POST'){res.writeHead(404);res.end();return;}
  let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
    const data=JSON.parse(body);requests.push(data);
    fs.writeFileSync(path.join(root,'.capture','verify131-http.json'),JSON.stringify(requests));
    const user=data.messages.filter(m=>m.role==='user').map(m=>typeof m.content==='string'?m.content:m.content.filter(p=>p.type==='text').map(p=>p.text).join('\n')).join('\n');
    const respond=()=>{
      if(res.destroyed)return;
      if(user.includes('[CASE:FAIL]')){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'Synthetic provider failure'}}));return;}
      const text=user.includes('[CASE:EMPTY]')?'':user.includes('[CASE:SELECT]')?String.raw`\textbf{Rewritten target.}`:user.includes('[CASE:SKILLS]')?'Context response.':user.includes('[CASE:STALE]')?'Never apply this stale replacement.':user.includes('[CASE:INSERT]')?'Inserted proposal.':'Block reply.';
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:text},finish_reason:user.includes('[CASE:TRUNC]')?'length':'stop'}]}));
    };
    if(user.includes('[CASE:SLOW]')) {const timer=setTimeout(respond,5000);res.on('close',()=>clearTimeout(timer));}else respond();
  });
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
fs.writeFileSync(path.join(root,'.capture','verify131-server.json'),JSON.stringify({port:server.address().port,fixture}));
const child=spawn(process.execPath,['scripts/cdp.mjs','--script','scripts/verify-131.mjs','--','--project='+fixture],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,TEXORA_ELECTRON:process.env.TEXORA_ELECTRON||path.join(root,'node_modules','electron','dist','electron.exe'),TEXORA_USER_DATA:process.env.TEXORA_USER_DATA||path.join(root,'.capture','verify131-profile')}});
const finish=code=>{server.closeAllConnections();server.close();process.exitCode=code??1;};
child.on('exit',finish);child.on('error',err=>{console.error(err);finish(1);});
