'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {rasterPdf:rasterPdfNative,rasterIdentity,FONT_WARNING}=require('../electron/lib/pdf-raster');
const {Compiler}=require('../electron/lib/compiler');
const rasterPdf=options=>rasterPdfNative({...options,preflight:false});
(async()=>{
 for(const line of ["Syntax Error: Missing language pack for 'Adobe-GB1' mapping", "Syntax Error: Unknown font tag 'F11'", 'Syntax Error (16871): No font in show/space'])assert.equal(FONT_WARNING.test(line),true,line);
 const root=path.resolve('.tmp');await fs.mkdir(root,{recursive:true});const cwd=await fs.mkdtemp(path.join(root,'raster-test-'));
 await fs.writeFile(path.join(cwd,'document.pdf'),'fixture');
 const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(100,16);png.writeUInt32BE(200,20);
 const tex={get:name=>name,env:{}};
 let calls=[];
 const execute=async(exe,args,opts)=>{
  calls.push({exe,args,cwd:opts.cwd});assert.equal(args.at(-1),exe==='mgs'?'document.pdf':'page');
  await fs.writeFile(path.join(opts.cwd,'page-1.png'),png);
  if(exe==='pdftoppm'){await fs.writeFile(path.join(opts.cwd,'page-2.png'),png);return {code:0,output:"Syntax Error: Unknown character collection 'Adobe-GB1'"};}
  if(exe==='pdftocairo')return {code:0,output:"Syntax Error: Couldn't find a font for 'Adobe-GB1'"};
  return {code:0,output:''};
 };
 let result=await rasterPdf({tex,cwd,input:'document.pdf',execute});
 assert.equal(result.backend,'mgs');assert.equal(result.files.length,1);assert.equal(result.diagnostics.length,2);
 assert.equal(calls.length,3);assert.ok(calls[2].args.includes('-dSAFER'));
 await assert.rejects(fs.stat(calls[0].cwd),{code:'ENOENT'});
 // An exit code of 0 without valid output must still fall back.
 calls=[];result=await rasterPdf({tex,cwd,input:'document.pdf',execute:async(exe,args,opts)=>{calls.push(exe);await fs.writeFile(path.join(opts.cwd,'page-1.png'),exe==='pdftoppm'?Buffer.from('broken'):png);return {code:0,output:''};}});
 assert.equal(result.backend,'pdftocairo');assert.deepEqual(calls,['pdftoppm','pdftocairo']);
 result=await rasterPdf({tex,cwd,input:'document.pdf',execute:async()=>({code:0,output:'Missing font for CIDFont'})});
 assert.equal(result.ok,false);assert.equal(result.files.length,0);
 // Snippet renderers must use first-page flags and share the same fallback.
 result=await rasterPdf({tex:{get:n=>n==='mgs'?n:'',env:{}},cwd,input:'document.pdf',single:true,execute:async(exe,args,opts)=>{assert.ok(args.includes('-dLastPage=1'));await fs.writeFile(path.join(opts.cwd,'page.png'),png);return {code:0,output:''};}});
 assert.equal(result.ok,true);assert.equal(path.basename(result.files[0]),'page.png');
 const probeCalls=[];
 const probed=await rasterPdfNative({tex,cwd,input:'document.pdf',execute:async(exe,args,opts)=>{
   const single=args.includes('-singlefile')||args.includes('-dLastPage=1');probeCalls.push({exe,single});
   if(exe!=='mgs'){assert.ok(single,'Broken backend must only render one diagnostic page');return {code:0,output:"Missing language pack for 'Adobe-GB1' mapping"};}
   await fs.writeFile(path.join(opts.cwd,single?'page.png':'page-1.png'),png);return {code:0,output:''};
 }});
 assert.equal(probed.backend,'mgs');assert.equal(probeCalls.filter(c=>!c.single).length,1);
 const before=rasterIdentity(tex);tex.get=n=>n+'-updated';assert.notEqual(rasterIdentity(tex),before);
 // Identical PDF + changed renderer invalidates an existing immutable manifest.
 const compiler=new Compiler({store:{get:()=>''},project:{root:cwd},tex,fallbackCacheRoot:cwd});
 let renders=0;compiler.renderUncached=async(_pdf,dir,signature)=>{renders++;await fs.mkdir(dir,{recursive:true});const file=path.join(dir,'page-1.png');await fs.writeFile(file,png);const pages=[{file}];await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({signature,pages}));return pages;};
 await compiler.renderPages(path.join(cwd,'document.pdf'),path.join(cwd,'preview'));
 await compiler.renderPages(path.join(cwd,'document.pdf'),path.join(cwd,'preview'));assert.equal(renders,1);
 tex.get=n=>n+'-updated-again';await compiler.renderPages(path.join(cwd,'document.pdf'),path.join(cwd,'preview'));assert.equal(renders,2);
 console.log('PASS PDF raster: successful-exit font warnings, independent fallback, partial/corrupt output isolation, first-page snippets, renderer cache invalidation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
