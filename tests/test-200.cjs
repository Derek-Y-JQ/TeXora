const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {Compiler}=require('../electron/lib/compiler');const {DEFAULT_SETTINGS}=require('../electron/lib/store');
(async()=>{
 const base=await fs.mkdtemp(path.resolve('.tmp/test200-'));
 const root=path.join(base,'第1题');await fs.mkdir(root);const file=path.join(root,'main.tex');await fs.writeFile(file,'\\documentclass{article}\n\\begin{document}Hello\\end{document}');
 const settings=structuredClone(DEFAULT_SETTINGS);settings.build.engine='xelatex';settings.build.autoInstallMissing='ask';
 const store={get:(k,f)=>k.split('.').reduce((v,p)=>v?.[p],settings)??f};const project={root,rootFile:file,revision:1};const logs=[],calls=[];
 const make=(execute)=>new Compiler({store,project,tex:{get:n=>['xelatex','latexmk'].includes(n)?n:'',env:{}},fallbackCacheRoot:path.join(base,'profile'),send:(e,p)=>logs.push({e,...p}),execute});
 const output=async(exe,args,opts)=>{
  const cache=args.find(a=>/^-output-directory=|^-outdir=/.test(a)).split('=').slice(1).join('=');calls.push({exe,args,cache,cwd:opts.cwd});
  if(cache.includes('第1题'))return {code:1,output:'xelatex.exe: fatal: putenv(TEXMF_OUTPUT_DIRECTORY='+cache+').'};
  await fs.writeFile(path.join(cache,'main.pdf'),'%PDF-1.4 test '+calls.length);
  await fs.writeFile(path.join(cache,'main.synctex.gz'),'trace');await fs.writeFile(path.join(cache,'main.log'),'Output written on main.pdf (1 page).');
  return {code:0,output:'Output written on main.pdf (1 page).'};
 };
 const c=make(output);const result=await c.build();if(!result.ok)console.error(result);assert.ok(result.ok,result.transcriptTail);assert.equal(calls.length,3);assert.ok(/^[\x20-\x7e]+$/.test(calls[1].cache));assert.equal(calls[1].cache,calls[2].cache);assert.equal(calls[1].cwd,root);assert.equal(result.pdf,path.join(calls[1].cache,'main.pdf'));assert.ok(logs.some(x=>x.chunk?.includes('已切换到英文缓存')));assert.equal(await fs.readFile(path.join(root,'main.pdf'),'utf8'),await fs.readFile(result.pdf,'utf8'));
 const reopened=make(output);const loaded=await reopened.loadExisting();assert.ok(loaded.ok);assert.equal(loaded.synctexPdf,result.pdf);assert.equal(reopened.cacheDir(),path.dirname(result.pdf));calls.length=0;assert.ok((await reopened.build()).ok);assert.equal(calls.length,2);assert.ok(calls.every(x=>!x.cache.includes('第1题')));
 calls.length=0;await c.build();assert.equal(calls.length,2);assert.ok(calls.every(x=>!x.cache.includes('第1题')),'later builds retain fallback');
 settings.build.cacheDir=path.join(base,'absolute-output');const absolute=make(output);const absResult=await absolute.build();assert.ok(absResult.ok);assert.equal(absolute.cacheDir(),settings.build.cacheDir);assert.ok((await make(output).loadExisting()).ok);
 settings.build.cacheDir='.latex_cache';const bibCalls=[];const bib=make(async(exe,args,opts)=>{
  if(exe==='biber'){bibCalls.push({args,cwd:opts.cwd});return {code:0,output:'Biber complete'};}
  const res=await output(exe,args,opts);if(res.code===0){const dir=args.find(a=>a.startsWith('-output-directory=')).slice(18);await fs.writeFile(path.join(dir,'main.bcf'),'bib fixture');}return res;
 });bib.tex={get:n=>['xelatex','biber'].includes(n)?n:'',env:{}};const bibResult=await bib.build();assert.ok(bibResult.ok);assert.equal(bibCalls.length,1);assert.equal(bibCalls[0].cwd,root);assert.ok(bibCalls[0].args.includes(path.dirname(bibResult.pdf)));
 settings.build.cacheDir='.latex_cache';let errors=0;const ordinary=make(async()=>{errors++;return {code:1,output:'! Undefined control sequence.'}});await ordinary.build();assert.equal(errors,2);assert.ok(ordinary.cacheDir().includes('第1题'),'ordinary TeX errors must not switch caches');
 let failures=0;const persistent=make(async()=>{failures++;return {code:1,output:'fatal: putenv(TEXMF_OUTPUT_DIRECTORY=bad)'}});await persistent.build();assert.equal(failures,2,'exactly one automatic retry');
 let cancelledCalls=0;const stopped=make(async()=>{cancelledCalls++;stopped._buildToken.cancelled=true;return {code:1,output:'fatal: putenv(TEXMF_OUTPUT_DIRECTORY=bad)'}});assert.ok((await stopped.build()).cancelled);assert.equal(cancelledCalls,1);
 settings.build.engine='latexmk';calls.length=0;const mk=make(output);assert.ok((await mk.build()).ok);assert.equal(calls.length,2);assert.ok(calls[1].cache.includes('build-cache'));
 await fs.writeFile(path.join(root,'latexmkrc'),'$biber = "biber-arm64 %O %S";');
 settings.build.engine='xelatex';settings.build.recipe='auto';calls.length=0;
 const projectRecipe=make(output);
 assert.ok((await projectRecipe.build({background:true})).needsProjectBuild);
 assert.equal(calls.length,0);
 assert.ok((await projectRecipe.build()).ok);
 assert.ok(calls.every(call=>call.exe==='latexmk' && call.args.includes('-xelatex') && !call.args.includes('-halt-on-error=0')));
 calls.length=0;
 assert.ok((await projectRecipe.build({live:true})).ok);
 assert.equal(calls[0].exe,'latexmk');
 await fs.writeFile(path.join(root,'latexmkrc'),'$biber = "another-biber %O %S";');
 assert.ok((await projectRecipe.build({background:true})).needsProjectBuild);
 let bibPasses=0;
 const badBib=make(async(exe,args,opts)=>{
   if(exe==='biber')return {code:255,output:'extracting arm64 binary with lipo failed'};
   bibPasses++;const response=await output(exe,args,opts);
   if(response.code===0)await fs.writeFile(path.join(calls.at(-1).cache,'main.bcf'),'fixture');
   return response;
 });
 badBib.tex={get:name=>name==='latexmk' ? '' : name,env:{}};
 const broken=await badBib.build();
 assert.equal(bibPasses,2,'one retry for the non-ASCII cache, then stop at Biber');
 assert.equal(broken.code,255);
 assert.match(broken.transcriptTail,/Biber 退出（255）[\s\S]*lipo failed[\s\S]*latexmkrc/);
 const {workspaceWidths}=await import('../src/js/workspace-layout.js');for(const width of [900,1100,1440,2000]){const v=workspaceWidths(width,{sidebar:520,preview:900});assert.ok(v.preview<=width*.4+1);assert.ok(width-49-v.sidebar-v.preview-2>=279);}
 assert.equal(workspaceWidths(900,{showPreview:false}).preview,0);assert.equal(workspaceWidths(900,{showSidebar:false}).sidebar,0);
 console.log('PASS 2.0: putenv single retry, cache reuse/reopen/trace, absolute cache, ordinary errors, cancellation, latexmk and viewport bounds');
})().catch(e=>{console.error(e);process.exitCode=1});
