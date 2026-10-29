'use strict';
const {app}=require('electron');const path=require('node:path');const http=require('node:http');const assert=require('node:assert/strict');const {OverleafSession}=require('../electron/lib/overleaf-session');
app.whenReady().then(async()=>{
 let server,win;try{
  const transport=new OverleafSession(()=>null,path.resolve('.capture/native-overleaf-session-'+process.pid));
  win=transport.window(false);await win.loadURL('data:text/html,<html><body>fixture</body></html>');
  const prefs=win.webContents.getLastWebPreferences();assert.equal(prefs.sandbox,true);assert.equal(prefs.contextIsolation,true);assert.equal(prefs.nodeIntegration,false);assert.ok(!prefs.preload);
  assert.equal(await win.webContents.executeJavaScript('typeof window.texora+":"+typeof require+":"+typeof process'),'undefined:undefined:undefined');
  server=http.createServer((req,res)=>{let chunks=[];req.on('data',b=>chunks.push(b));req.on('end',()=>{const body=Buffer.concat(chunks).toString();assert.equal(req.headers['x-csrf-token'],'fixture-csrf');assert.ok(body.includes('name="qqfile"; filename="test.tex"'));assert.ok(body.includes('latex-fixture'));assert.ok(body.includes('name="relativePath"'));assert.ok(req.headers.cookie?.includes('texora-fixture=cookie'));res.setHeader('content-type','application/json');res.end('{"success":true}');});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  await transport.session.cookies.set({url:origin,name:'texora-fixture',value:'cookie'});
  transport.request=async(route,options)=>transport.session.fetch(origin+route,options);
  await transport.upload('123456789012345678901234',{csrf:'fixture-csrf',project:{rootFolder:[{_id:'123456789012345678901234'}]}},'sub/test.tex',Buffer.from('latex-fixture'));
  await transport.logout();assert.equal((await transport.session.cookies.get({url:origin})).length,0);
  console.log('PASS native Electron: isolated persistent session, sandbox/no preload or Node, Chromium multipart upload with session cookies, logout clears session.');
 }catch(e){console.error(e);process.exitCode=1;}finally{win?.destroy();server?.close();app.exit(process.exitCode||0);}
});
