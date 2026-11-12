'use strict';
const fs=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');
const {Compiler}=require('../electron/lib/compiler');const {TexEnv}=require('../electron/lib/texenv');const {DEFAULT_SETTINGS}=require('../electron/lib/store');
(async()=>{
 const root=path.resolve('.capture/cjk-regression/中文项目');await fs.mkdir(root,{recursive:true});
 const settings=structuredClone(DEFAULT_SETTINGS);settings.build.engine='xelatex';settings.build.recipe='single';settings.build.runs=1;settings.build.autoInstallMissing='never';
 const store={get:(key,fallback)=>key.split('.').reduce((v,k)=>v?.[k],settings)??fallback,set(){}};
 const tex=new TexEnv(store,path.resolve('.capture/cjk-regression'));tex.detect();
 const rootFile=path.join(root,'main.tex');await fs.writeFile(rootFile,String.raw`\documentclass[UTF8,fontset=windows]{ctexart}
\usepackage{amsmath}
\begin{document}
\section{中文渲染回归测试}
这是一段中文：概率论、随机过程与矩阵世界。
English text and mathematics: $\int_0^1 x^2\,dx=\frac13$.
\newpage
\section{第二页中文}
中文标点：“字体映射”、字形与缓存，均应正常显示。
\end{document}`);
 const compiler=new Compiler({store,tex,project:{root,rootFile,revision:1},fallbackCacheRoot:root});
 const built=await compiler.build();assert.equal(built.ok,true,built.transcriptTail||built.error);assert.ok(built.previewPdf);
 // Native rasterization remains the local-snippet fallback, not the document viewer.
 built.pages=await compiler.renderPages(built.pdf,path.join(root,'poppler-preview'));assert.equal(built.pages.length,2);
 const ghosts={get:n=>n==='mgs'?tex.get(n):'',env:tex.env};
 const alternate=new Compiler({store,tex:ghosts,project:{root,rootFile,revision:1},fallbackCacheRoot:root});
 const pages=await alternate.renderPages(built.pdf,path.join(root,'gs-preview'));assert.equal(pages.length,2);
 for(let i=0;i<2;i++){assert.ok(Math.abs(pages[i].width-built.pages[i].width)<=2);assert.ok(Math.abs(pages[i].height-built.pages[i].height)<=2);}
 await fs.copyFile(built.pages[0].file,path.resolve('.capture/cjk-regression/poppler.png'));
 await fs.copyFile(pages[0].file,path.resolve('.capture/cjk-regression/ghostscript.png'));
 console.log(JSON.stringify({ok:true,poppler:built.pages.map(p=>p.file),ghostscript:pages.map(p=>p.file)}));
})().catch(e=>{console.error(e);process.exitCode=1;});
