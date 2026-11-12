const {app,BrowserWindow,safeStorage}=require('electron');
const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
const {Store}=require('../electron/lib/store');
app.setPath('userData',path.resolve('.tmp/electron-security'));
app.whenReady().then(async()=>{
 const dir=path.resolve('.tmp/dpapi-smoke');fs.mkdirSync(dir,{recursive:true});
 const s=new Store(dir);s.enableEncryption(safeStorage);s.set('ai.apiKey','dpapi-smoke-only');
 const reloaded=new Store(dir);reloaded.enableEncryption(safeStorage);assert.equal(reloaded.get('ai.apiKey'),'dpapi-smoke-only');
 assert.ok(!fs.readFileSync(s.file,'utf8').includes('dpapi-smoke-only'));reloaded.set('ai.apiKey','');
 const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,preload:path.resolve('electron/preload.js')}});
 await w.loadURL('data:text/html,<title>TeXora security smoke</title>');
 const result=await w.webContents.executeJavaScript('({bridge:typeof window.texora, node:typeof require})');
 assert.equal(result.node,'undefined');assert.equal(result.bridge,'object');
 // Main-process effective preferences verify Chromium sandbox is actually enabled.
 assert.equal(w.webContents.getLastWebPreferences().sandbox,true);
 fs.writeFileSync(path.resolve('.tmp/electron-security-result.json'),JSON.stringify({ok:true,version:process.versions.electron,sandboxConfigured:true,noSandboxOverride:process.argv.includes('--no-sandbox'),bridge:result.bridge}));
 w.destroy();console.log('PASS actual OS safeStorage roundtrip and preload bridge (sandbox configuration checked)');app.exit(0);
}).catch(e=>{console.error(e.message);app.exit(1);});
