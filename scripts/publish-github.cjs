'use strict';
/** Publish reviewed source and Windows assets, preserving the remote tree/history.
 * GITHUB_TOKEN is read only from the environment and never written to disk.
 * GITHUB_DRY_RUN=1 lists source changes without publishing.
 * GITHUB_REPLACE_RELEASE=1 explicitly replaces a same-version published build.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const token=process.env.GITHUB_TOKEN;
const owner=process.env.GITHUB_OWNER || 'Derek-Y-JQ';
const repo=process.env.GITHUB_REPO || 'TeXora';
const version=require('../package.json').version;
const tag='v'+version;
const prefix=`https://api.github.com/repos/${owner}/${repo}`;
const dry=process.env.GITHUB_DRY_RUN==='1';
const replace=process.env.GITHUB_REPLACE_RELEASE==='1';
const roots=['src','electron','build','docs','skills'];
const releaseScripts=['scripts/publish-github.cjs','scripts/test-140.cjs','scripts/verify-140.mjs','scripts/run-verify-140.mjs','scripts/test-pdf-raster.cjs','scripts/test-cjk-preview.cjs','scripts/verify-141.mjs','scripts/test-overleaf.cjs','scripts/test-overleaf-session.cjs','scripts/verify-142.mjs','scripts/test-143.mjs','scripts/verify-143.mjs','scripts/run-verify-143.mjs','scripts/test-project-preview.cjs','scripts/test-143-diagnostics.cjs','scripts/verify-143-diagnostics.mjs'];
const rootFiles=['package.json','package-lock.json','vite.config.js','.gitignore','README.md','LICENSE','THIRD_PARTY_NOTICES.md'];
const textExt=/\.(?:js|cjs|mjs|json|html|css|md|tex|bib|sty|cls|yml|yaml|txt|nsh|svg)$/i;
async function request(url,method='GET',body,raw=false){
 const retrySafe=method==='GET'||method==='PATCH'||method==='DELETE'||url.endsWith('/git/blobs');
 for(let attempt=0;;attempt++){
 try{
 const response=await fetch(url,{method,headers:{Accept:'application/vnd.github+json','User-Agent':'TeXora-Publisher',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':raw?'application/octet-stream':'application/json'}:{})},body:body?(raw?body:JSON.stringify(body)):undefined,signal:AbortSignal.timeout(raw?600000:60000)});
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={message:text.slice(0,200)};}
 if(method==='DELETE'&&response.status===404)return {};
 if(!response.ok)throw Error(`GitHub ${response.status}: ${data.message || 'request failed'}`);
 return data;
 }catch(error){if(!retrySafe||attempt>=3)throw error;await new Promise(resolve=>setTimeout(resolve,1000*2**attempt));}
 }
}
async function filesIn(dir){
 const files=[];
 for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  if(entry.isSymbolicLink()||entry.name.startsWith('.')||entry.name.includes('Derek'))continue;
  const file=path.posix.join(dir,entry.name);
  if(entry.isDirectory()){if(!['node_modules','__pycache__'].includes(entry.name))files.push(...await filesIn(file));}
  else if(!/\.(?:pdf|aux|bbl|blg|toc|out|fls|fdb_latexmk|log|synctex\.gz|exe|zip|pyc)$/i.test(file))files.push(file);
 }
 return files;
}
async function uploadAsset(release,name,bytes,uploadName=name){
 const {execFileSync}=require('node:child_process');
 const config=`url = "${release.upload_url.replace(/\{.*$/,'')+'?name='+encodeURIComponent(uploadName)}"\nheader = "Authorization: Bearer ${token}"\nheader = "Content-Type: application/octet-stream"\nheader = "User-Agent: TeXora-Publisher"\n`;
 const output=execFileSync('curl.exe',['--config','-','--http1.1','--silent','--show-error','--fail-with-body','--connect-timeout','20','--max-time','300','--request','POST','--data-binary','@'+path.resolve('release',name)],{input:config,encoding:'utf8',timeout:310000,windowsHide:true,maxBuffer:1048576});
 const asset=JSON.parse(output);
 if(asset.size!==bytes.length||asset.digest!=='sha256:'+crypto.createHash('sha256').update(bytes).digest('hex'))throw Error('Uploaded asset verification failed: '+name);
 console.log('Uploaded',uploadName,asset.size,'bytes');return asset;
}
async function main(){
 if(!dry&&!token)throw Error('Set GITHUB_TOKEN before publishing.');
 const head=await request(prefix+'/git/ref/heads/main');
 const parent=await request(prefix+'/git/commits/'+head.object.sha);
 const tree=await request(prefix+'/git/trees/'+parent.tree.sha+'?recursive=1');
 if(tree.truncated)throw Error('Remote tree is truncated; refusing partial publication.');
 const remote=new Map(tree.tree.map(e=>[e.path,e.sha]));
 const files=[...rootFiles,...releaseScripts];for(const root of roots)files.push(...await filesIn(root));
 const changed=[];
 for(const file of files){
  let content;try{content=await fs.readFile(file);}catch(e){if(e.code==='ENOENT'&&file==='package-lock.json')continue;throw e;}
  const rawHash=crypto.createHash('sha1').update(Buffer.from(`blob ${content.length}\0`)).update(content).digest('hex');
  if(remote.get(file)===rawHash)continue;
  if(textExt.test(file)||rootFiles.includes(file)){
   const text=content.toString('utf8').replace(/\r\n/g,'\n');
   if(/github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]{25,}/.test(text)&&!file.endsWith('publish-github.cjs'))throw Error('Credential-like value detected in '+file);
   content=Buffer.from(text);
  }
  const hash=crypto.createHash('sha1').update(Buffer.from(`blob ${content.length}\0`)).update(content).digest('hex');
  if(remote.get(file)!==hash)changed.push({file,content});
 }
 console.log('Source changes:',changed.map(e=>e.file).join('\n'));
 if(dry){console.log('DRY RUN: '+changed.length+' files; remote HEAD '+head.object.sha);return;}
 const installer=`TeXora-Setup-${version}.exe`;
 const installerBytes=await fs.readFile(path.join('release',installer));
 const checksum=crypto.createHash('sha256').update(installerBytes).digest('hex')+'  '+installer+'\n';
 await fs.writeFile('release/SHA256SUMS.txt',checksum);
 const notes=await fs.readFile('docs/release-'+version+'.md','utf8');
 // Default releases are immutable; same-version replacement requires an explicit flag.
 const tags=await request(prefix+'/git/matching-refs/tags/'+tag);
 const oldTag=tags.find(t=>t.ref==='refs/tags/'+tag);
 if(oldTag&&!replace)throw Error('Version tag already exists; refusing to overwrite it.');
 if(replace&&!oldTag)throw Error('Same-version replacement requires an existing tag.');
 const prior=replace?await request(prefix+'/releases/tags/'+tag):null;
 if(prior?.immutable)throw Error('GitHub release is immutable; cannot replace its assets or tag.');
 const entries=[];let nextBlob=0;
 await Promise.all(Array.from({length:3},async()=>{while(nextBlob<changed.length){
  const {file,content}=changed[nextBlob++];
  const blob=await request(prefix+'/git/blobs','POST',{content:content.toString('base64'),encoding:'base64'});
  entries.push({path:file,mode:'100644',type:'blob',sha:blob.sha});
 }}));
 const nextTree=await request(prefix+'/git/trees','POST',{base_tree:parent.tree.sha,tree:entries});
 const commit=await request(prefix+'/git/commits','POST',{message:replace?`Fix TeXora ${version} without version bump: TeX distribution diagnostics, package management and Markdown contrast`:`Release TeXora ${version}: reliable file opening, original PDF reading, build diagnostics and reusable AI answers`,tree:nextTree.sha,parents:[head.object.sha]});
 if(replace){
  // Upload and verify both replacements before touching the current public downloads.
  const replacements=[];
  for(const [name,bytes] of [[installer,installerBytes],['SHA256SUMS.txt',Buffer.from(checksum)]]){
   const uploaded=await uploadAsset(prior,name,bytes,name+'.replacement-'+commit.sha.slice(0,8));
   replacements.push({name,uploaded});
  }
  const currentHead=await request(prefix+'/git/ref/heads/main'),currentTag=await request(prefix+'/git/ref/tags/'+tag);
  if(currentHead.object.sha!==head.object.sha||currentTag.object.sha!==oldTag.object.sha)throw Error('Main or version tag changed; uploaded replacements left intact for review.');
  await request(prefix+'/git/refs/heads/main','PATCH',{sha:commit.sha,force:false});
  await request(prefix+'/git/refs/tags/'+tag,'PATCH',{sha:commit.sha,force:true});
  const assets=await request(prefix+'/releases/'+prior.id+'/assets');
  for(const {name,uploaded}of replacements){
   for(const asset of assets.filter(a=>a.name===name))await request(prefix+'/releases/assets/'+asset.id,'DELETE');
   await request(prefix+'/releases/assets/'+uploaded.id,'PATCH',{name});
  }
  const published=await request(prefix+'/releases/'+prior.id,'PATCH',{body:notes,target_commitish:commit.sha});
  console.log('Replaced same-version release:',published.html_url,'commit:',commit.sha,'SHA256:',checksum.trim());return;
 }
 const latest=await request(prefix+'/git/ref/heads/main');
 if(latest.object.sha!==head.object.sha)throw Error('Remote main changed during preparation; retry after review.');
 await request(prefix+'/git/refs/heads/main','PATCH',{sha:commit.sha,force:false});
 const release=await request(prefix+'/releases','POST',{tag_name:tag,target_commitish:commit.sha,name:'TeXora '+version,body:notes,draft:true,prerelease:false});
 for(const [name,bytes]of [[installer,installerBytes],['SHA256SUMS.txt',Buffer.from(checksum)]]){
  await uploadAsset(release,name,bytes);
 }
 const published=await request(prefix+'/releases/'+release.id,'PATCH',{draft:false});
 console.log('Published:',published.html_url,'commit:',commit.sha,'SHA256:',checksum.trim());
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
