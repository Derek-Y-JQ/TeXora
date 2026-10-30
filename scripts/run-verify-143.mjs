import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{Store}=require('../electron/lib/store');
const root=path.resolve('.capture/verify143-project');fs.mkdirSync(path.join(root,'chapters'),{recursive:true});
fs.writeFileSync(path.join(root,'main.tex'),String.raw`\documentclass{article}
\begin{document}
Vector page one\newpage
Vector page two\newpage
Vector page three\newpage
Vector page four
\end{document}
`);
fs.writeFileSync(path.join(root,'chapters','中文 chapter.tex'),'Shell-opened child file\n');
// Minimal standard-font PDF fixture: original vector lines and selectable text.
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R 10 0 R] /Count 4 >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
for(let i=0;i<4;i++){
 objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`);
 const content=`BT /F1 18 Tf 72 750 Td (Vector page ${i+1} - selectable text) Tj ET 72 720 m 500 320 l S\n`;
 objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`);
}
let pdf='%PDF-1.7\n',offsets=[0];objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;});
const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
fs.writeFileSync(path.join(root,'main.pdf'),pdf);
const other=path.resolve('.capture/verify143-other');fs.mkdirSync(other,{recursive:true});fs.writeFileSync(path.join(other,'另一个文件.tex'),String.raw`\documentclass{article}\begin{document}Other project\end{document}`);
const profile=path.resolve('.capture/profile143-'+Date.now()),store=new Store(profile);
store.set('ui.lastProject',path.resolve('samples/demo'));store.set('general.autoCheckUpdates',false);store.set('build.livePreview',false);store.set('editor.autosave',false);store.set('build.engine','xelatex');
const env={...process.env,TEXORA_USER_DATA:profile,TEXORA_ELECTRON:process.env.TEXORA_ELECTRON||path.resolve('node_modules/electron/dist/electron.exe'),TEMP:path.resolve('.tmp'),TMP:path.resolve('.tmp'),CDP_PORT:process.env.CDP_PORT||'9348'};
if(fs.existsSync('.capture/miktex141-data'))env.MIKTEX_USERDATA=path.resolve('.capture/miktex141-data');
const child=spawn(process.execPath,['scripts/cdp.mjs','--script',process.env.TEXORA_VERIFY_SCRIPT||'scripts/verify-143.mjs','--','--disable-gpu','--no-sandbox',path.join(root,'chapters','中文 chapter.tex')],{env,stdio:'inherit',windowsHide:true});
child.on('error',e=>{console.error(e.message);process.exitCode=1;});child.on('exit',code=>process.exitCode=code??1);
