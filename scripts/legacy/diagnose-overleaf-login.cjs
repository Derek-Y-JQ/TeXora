'use strict';
const {app,BrowserWindow,session}=require('electron');const path=require('node:path');
app.whenReady().then(async()=>{let win;try{
 const dir=path.join(app.getPath('appData'),'TeXora','overleaf','browser');const ses=session.fromPath(dir);
 const cookies=await ses.cookies.get({domain:'overleaf.com'});console.log(JSON.stringify({cookies:cookies.length,sameSite: [...new Set(cookies.map(c=>c.sameSite))]}));
 const describe=async r=>{const type=r.headers.get('content-type')||'';let count=null;if(type.includes('json')){const d=await r.json();count=Array.isArray(d.projects)?d.projects.length:null;}return {status:r.status,path:r.url?new URL(r.url).pathname:null,type:type.split(';')[0],projects:count};};
 try{console.log('main-fetch',JSON.stringify(await describe(await ses.fetch('https://www.overleaf.com/user/projects',{signal:AbortSignal.timeout(30000)}))));}catch(e){console.log('main-fetch-error',e.message);}
 win=new BrowserWindow({show:false,webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false}});await win.loadURL('https://www.overleaf.com/project');
 console.log('page',JSON.stringify(await win.webContents.executeJavaScript(`({path:location.pathname,csrf:!!document.querySelector('meta[name="ol-csrfToken"]'),user:!!document.querySelector('meta[name="ol-user"]'),challenge:!!document.querySelector('#challenge-running,iframe[src*="challenges.cloudflare"]')})`)));
 console.log('page-fetch',JSON.stringify(await win.webContents.executeJavaScript(`(async()=>{const r=await fetch('/user/projects',{credentials:'include',headers:{Accept:'application/json'},signal:AbortSignal.timeout(30000)});const type=r.headers.get('content-type')||'';let count=null;if(type.includes('json')){const d=await r.json();count=Array.isArray(d.projects)?d.projects.length:null;}return {status:r.status,path:r.url?new URL(r.url).pathname:null,type:type.split(';')[0],projects:count};})()`)));
 }catch(e){console.log('diagnostic-error',e.message);}finally{win?.destroy();app.quit();}});

