const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const resultFile=path.resolve('.tmp/electron-window-200-result.json');fs.mkdirSync(path.dirname(resultFile),{recursive:true});if(fs.existsSync(resultFile))fs.unlinkSync(resultFile);
const temp=path.resolve('.tmp/window-temp');fs.mkdirSync(temp,{recursive:true});const env={...process.env,TEMP:temp,TMP:temp};delete env.ELECTRON_RUN_AS_NODE;
const args=['tests/electron-window-200.cjs',...(env.TEXORA_TEST_NO_SANDBOX==='1'?['--no-sandbox']:[])];
const r=spawnSync(require('electron'),args,{env,stdio:'inherit',windowsHide:true,timeout:90000});
if(r.error||r.status!==0||!fs.existsSync(resultFile)){console.error('Window regression failed:',r.error?.message||r.status);process.exit(1)}
if(!JSON.parse(fs.readFileSync(resultFile)).ok)process.exit(1);
