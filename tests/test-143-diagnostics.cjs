'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),Module=require('node:module');
const {run,commandFor}=require('../electron/lib/run');
(async()=>{
 const source=fs.readFileSync('src/js/tex-health.js');
 const {texHealth}=await import('data:text/javascript;base64,'+source.toString('base64'));
 const helpers={synctex:'yes',chktex:'yes',latexdiff:'yes',kpsewhich:'yes',pdftoppm:'yes'};
 for(const distro of ['texlive','tinytex','miktex']){
  const manager=distro==='miktex'?'mpm':'tlmgr',other=manager==='mpm'?'tlmgr':'mpm';
  const health=texHealth({distro,engines:{xelatex:true},tools:{...helpers,[manager]:'yes',[other]:''}});
  assert.equal(health.canCompile,true);assert.equal(health.manager,manager);assert.deepEqual(health.optional,[]);
  const partial=texHealth({distro,engines:{pdflatex:true},tools:{}});assert.equal(partial.type,'success');assert.ok(partial.optional.some(s=>s.startsWith(manager)));assert.ok(!partial.optional.some(s=>s.startsWith(other)));
 }
 assert.equal(texHealth({engines:{latexmk:true},tools:helpers}).canCompile,false);
 assert.deepEqual(texHealth({distro:'unknown',engines:{lualatex:true},tools:{...helpers,pdftoppm:'',mgs:'yes'}}).optional,[]);
 const dir=await fsp.mkdtemp(path.resolve('.tmp/diagnostics143-'));
 const tl=path.join(dir,'TeX Live & 中文 (test)'),mk=path.join(dir,'MiKTeX'),tiny=path.join(dir,'TinyTeX');
 for(const root of [tl,mk,tiny]){fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,'xelatex.exe'),'fixture');}
 fs.writeFileSync(path.join(tl,'tlmgr.bat'),'@echo off\r\necho tlmgr-fixture\r\nexit /b 0\r\n');fs.writeFileSync(path.join(tiny,'tlmgr.bat'),'');fs.writeFileSync(path.join(mk,'mpm.exe'),'fixture');
 const calls=[];let listCode=0,listOutput='amsmath\nctex\n';
 const load=Module._load;
 Module._load=function(name,parent,...rest){if(name==='./run'&&parent?.filename.endsWith(path.join('lib','texenv.js')))return {run:async(exe,args)=>{calls.push({exe,args});return {code:args[0]==='info'?listCode:0,output:listOutput};},capture:async()=>''};return load.call(this,name,parent,...rest);};
 let TexEnv;try{delete require.cache[require.resolve('../electron/lib/texenv')];({TexEnv}=require('../electron/lib/texenv'));}finally{Module._load=load;}
 let configured=tl,policy='ask';
 const env=new TexEnv({get:(key,fallback)=>key==='tex.binPath'?configured:key==='build.autoInstallMissing'?policy:fallback},dir);
 env.detect();assert.equal(env.distro,'texlive');assert.equal(env.packageManager().name,'tlmgr');assert.equal(env.get('mpm'),'','never borrow a manager from PATH');
 assert.deepEqual(await env.packages(),['amsmath','ctex']);
 env.cache.sty=['old'];env.cache.styAt=Date.now();env.cache.version='Old version';
 configured=mk;env.detect();assert.equal(env.distro,'miktex');assert.equal(env.cache.version,undefined);assert.equal(env.cache.packages,undefined);assert.equal(env.cache.sty,undefined);
 // Even unexpected extra manager files cannot override the identified distro.
 env.tools.tlmgr='wrong-tlmgr';await env.installPackage('amsmath');assert.equal(calls.at(-1).exe,path.join(mk,'mpm.exe'));
 listOutput='Warning: deprecated\nfalse 5 406261 12many\ntrue 8 211297 ctex\ni 4 123 amsmath\n';assert.deepEqual(await env.packages(true),['amsmath','ctex']);
 configured=tl;env.detect();env.tools.mpm='wrong-mpm';await env.installPackage('ctex');assert.equal(calls.at(-1).exe,path.join(tl,'tlmgr.bat'));
 env.cache.packages=['cached'];env.cache.packagesAt=Date.now();await env.installPackage('ctex');assert.equal(env.cache.packages,undefined,'successful installation invalidates completion data');
 policy='never';let count=calls.length;assert.equal((await env.installPackage('ctex')).ok,false);assert.equal(calls.length,count);
 configured=mk;env.detect();assert.equal((await env.installPackage('ctex')).ok,false);assert.equal(calls.length,count);
 assert.equal((await env.installPackage('--help')).ok,false);policy='ask';
 configured=tiny;env.detect();assert.equal(env.distro,'tinytex');assert.equal(env.packageManager().name,'tlmgr');
 listCode=1;const warn=console.warn;console.warn=()=>{};try{assert.deepEqual(await env.packages(true),[]);}finally{console.warn=warn;}assert.equal(env.cache.packagesAt,undefined,'failed queries must not be cached as a successful empty list');
 const bat=path.join(tl,'tlmgr.bat');
 if(process.platform==='win32'){
  assert.equal(commandFor(bat,['info']).exe.toLowerCase().endsWith('cmd.exe'),true);
  const result=await run(bat,['info','argument & value'],{timeout:10000});assert.equal(result.code,0,result.output);assert.ok(result.output.includes('tlmgr-fixture'));
  for(const arg of ['bad" & echo unsafe','%PATH%','bad\nvalue'])assert.throws(()=>commandFor(bat,[arg]),/不支持/);
 }
 console.log('PASS 1.4.3 diagnostics: distro-specific health/managers, optional vs compiler availability, TeX Live/TinyTeX/MiKTeX isolation, cache invalidation, install policy, real Windows batch path with spaces/Chinese/& and unsafe argument rejection.');
})().catch(error=>{console.error(error);process.exitCode=1});
