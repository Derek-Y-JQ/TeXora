import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
const root=process.cwd(),fixture=path.join(root,'.capture/verify133-project'),profile=path.join(root,'.capture/verify133-profile-'+Date.now());
fs.mkdirSync(fixture,{recursive:true});fs.mkdirSync(profile,{recursive:true});
fs.writeFileSync(path.join(fixture,'main.tex'),String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
\section{Code and algorithm verification}
\input{fragment}
\end{document}`);
fs.writeFileSync(path.join(fixture,'fragment.tex'),'A fragment for code insertion.\n');
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({general:{autoCheckUpdates:false},build:{livePreview:false}}));
const child=spawn(process.execPath,['scripts/cdp.mjs','--script','scripts/verify-133.mjs','--','--project='+fixture],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,TEXORA_ELECTRON:process.env.TEXORA_ELECTRON||path.join(root,'node_modules/electron/dist/electron.exe'),TEXORA_USER_DATA:profile}});
child.on('exit',code=>{process.exitCode=code??1;});child.on('error',error=>{console.error(error);process.exitCode=1;});
