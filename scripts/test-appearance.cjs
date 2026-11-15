'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const fixture=path.resolve('.tmp/appearance-project');fs.mkdirSync(fixture,{recursive:true});
fs.writeFileSync(path.join(fixture,'main.tex'),'\\documentclass{article}\n\\begin{document}\n\\section{Writing}\nSource and PDF workspace.\n\\end{document}\n');
const temp=path.resolve('.tmp/appearance-temp');fs.mkdirSync(temp,{recursive:true});
const env={...process.env,TEMP:temp,TMP:temp,TEXORA_ELECTRON:require('electron'),TEXORA_USER_DATA:path.resolve('.tmp/appearance-profile'),CDP_PORT:'9464'};
delete env.ELECTRON_RUN_AS_NODE;
const suite=process.argv[2]||'tests/ui-201.mjs';
if(!['tests/ui-201.mjs','tests/ui-202.mjs'].includes(suite))throw Error('Unknown UI regression suite');
const args=['scripts/cdp.mjs','--script',suite,'--',...(env.TEXORA_TEST_NO_SANDBOX==='1'?['--no-sandbox']:[]),'--project='+fixture];
const r=spawnSync(process.execPath,args,{env,stdio:'inherit',windowsHide:true,timeout:180000});
if(r.error||r.status!==0){console.error('Appearance regression failed:',r.error?.message||r.status);process.exit(1);}
