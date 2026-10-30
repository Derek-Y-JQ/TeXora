'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const EXT=/\.(tex|ltx|sty|cls|bib|md|txt|pdf)$/i;
function launchTargets(args,cwd=process.cwd()){
 const targets=[];
 for(let i=0;i<args.length;i++){
  const a=args[i];
  if(a==='--project'||a==='--open'){if(args[i+1])targets.push(path.resolve(cwd,args[++i]));}
  else if(a.startsWith('--project=')||a.startsWith('--open='))targets.push(path.resolve(cwd,a.slice(a.indexOf('=')+1)));
  else if(!a.startsWith('-')&&a!=='open'&&(EXT.test(a)||path.isAbsolute(a)&&! /\.(exe|js|mjs|cjs)$/i.test(a)))targets.push(path.resolve(cwd,a));
 }
 return [...new Set(targets)];
}
async function resolveOpenTarget(target){
 const full=path.resolve(target),stat=await fs.stat(full);
 if(stat.isDirectory())return {kind:'project',root:full,file:''};
 if(/\.pdf$/i.test(full))return {kind:'pdf',file:full};
 if(!EXT.test(full))throw Error('暂不支持此文件类型');
 let root=path.dirname(full);
 // Honor explicit TeX root directives, then find the nearest ancestor entry point.
 if(/\.(tex|ltx)$/i.test(full)){
  const head=(await fs.readFile(full,'utf8')).slice(0,16384);
  const magic=head.match(/^\s*%\s*!\s*TeX\s+root\s*=\s*(.+)$/im);
  if(magic){const main=path.resolve(root,magic[1].trim());if(await fs.stat(main).then(s=>s.isFile()).catch(()=>false))return {kind:'source',root:path.dirname(main),file:full,rootFile:main};}
  if(/^[^%\n]*\\documentclass\b/m.test(head))return {kind:'source',root,file:full,rootFile:full};
  for(let dir=root,depth=0;depth<6;depth++,dir=path.dirname(dir)){
   for(const name of ['main.tex','root.tex','thesis.tex','paper.tex','document.tex','master.tex','book.tex']){
    const main=path.join(dir,name),text=await fs.readFile(main,'utf8').catch(()=>'');
    if(/^[^%\n]*\\documentclass\b/m.test(text))return {kind:'source',root:dir,file:full,rootFile:main};
   }
   if(path.dirname(dir)===dir)break;
  }
 }
 return {kind:'source',root,file:full};
}
module.exports={launchTargets,resolveOpenTarget};
