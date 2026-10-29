'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const ID = /^[a-f\d]{24}$/i;
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const valueAt = (o,n) => Object.hasOwn(o,n)?o[n]:null;
const textFile = /\.(tex|ltx|bib|sty|cls|bst|txt|md|csv|json|yaml|yml|cfg|def|dtx|ins|tikz|pgf|asy|py|r|lua|sh)$/i;
const digest = (name, b) => b ? hash(textFile.test(name) ? b.toString('utf8').replace(/\r\n/g, '\n') : b) : null;
const ignored = /(^|\/)(\.git|\.texora|\.latex_cache|node_modules|\.cache)(\/|$)|\.(aux|log|out|toc|fls|fdb_latexmk|synctex(?:\.gz)?|nav|snm|vrb|bcf|blg|bbl|run\.xml)$/i;
function safeName(name) {
  if (typeof name !== 'string' || name.includes('\\') || name.length > 220 || name.split('/').some(p => !p || p === '.' || p === '..' || /[\x00-\x1f<>:"|?*]/.test(p) || /[ .]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw Error('项目含有 Windows 不支持或不安全的文件路径');
  return name;
}
function unzip(buffer) {
  const files = new Map(), seen = new Set(); let total = 0;
  for (const e of new AdmZip(buffer).getEntries()) {
    if (e.isDirectory) { safeName(e.entryName.replace(/\/$/, '')); continue; }
    const name = safeName(e.entryName), key = name.toLowerCase();
    if (seen.has(key) || ((e.attr >>> 16) & 0xf000) === 0xa000) throw Error('项目含有重复路径或符号链接');
    seen.add(key); total += e.header.size;
    if (total > 256 * 1024 * 1024 || seen.size > 10000 || e.header.size > 64 * 1024 * 1024) throw Error('项目超过导入大小限制（256 MB / 10000 个文件）');
    files.set(name, e.getData());
  }
  return files;
}
async function localFiles(root, known) {
  const files = new Map(); let total=0;
  async function walk(dir, prefix='') {
    for (const e of await fs.readdir(dir, {withFileTypes:true})) {
      const name = prefix + e.name;
      if (!known.has(name) && ignored.test(name)) continue;
      if(!known.has(name) && /\.pdf$/i.test(name) && known.has(name.replace(/\.pdf$/i,'.tex')))continue;
      safeName(name);
      const file = path.join(dir,e.name), stat=await fs.lstat(file);
      if(stat.isSymbolicLink()) throw Error('同步目录含有符号链接，请先移除该链接');
      if (stat.isDirectory()) await walk(file,name+'/');
      else if(stat.isFile()) {
        total+=stat.size;
        if(total>256*1024*1024 || files.size>=10000 || stat.size>64*1024*1024) throw Error('本地项目超过同步大小限制');
        files.set(name,await fs.readFile(file));
      }
    }
  }
  await walk(root); return files;
}
const hashes = files => Object.fromEntries([...files].map(([n,b])=>[n,digest(n,b)]));
function compare(base, local, remote) {
  const rows=[];
  for(const name of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])) {
    const b=valueAt(base,name),l=valueAt(local,name),r=valueAt(remote,name);
    if(l===r)continue;
    if(l!==b && r!==b) rows.push({name,action:'conflict'});
    else if(l!==b) rows.push({name,action:l?'upload':'deleteRemote'});
    else rows.push({name,action:r?'download':'deleteLocal'});
  }
  return rows;
}
class Overleaf {
  constructor({dir,transport}) { this.dir=dir;this.transport=transport;this.plans=new Map();this.busy=false; }
  async records() {try{return JSON.parse(await fs.readFile(path.join(this.dir,'projects.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;} }
  async save(records) {await fs.mkdir(this.dir,{recursive:true}); const file=path.join(this.dir,'projects.json');await fs.writeFile(file+'.tmp',JSON.stringify(records));await fs.rename(file+'.tmp',file);}
  async exclusive(fn) {if(this.busy)throw Error('另一个 Overleaf 操作正在进行');this.busy=true;try{return await fn();}finally{this.busy=false;} }
  async projects() {
    const data=await this.transport.json('/user/projects');
    if(!Array.isArray(data.projects))throw Error('Overleaf 项目列表格式已变化，请重新登录或更新 TeXora');
    return data.projects.map(p=>({id:p._id||p.id,name:String(p.name||'Untitled'),access:p.accessLevel})).filter(p=>ID.test(p.id));
  }
  async remote(id,onProgress) {if(!ID.test(id))throw Error('无效的项目编号');const data=await this.transport.zip(`/project/${id}/download/zip`,onProgress);onProgress?.({phase:'extracting',filesCompleted:0,totalFiles:null});return unzip(data);}
  async load(id,onProgress) {return this.exclusive(async()=>{
    const report=event=>{try{onProgress?.(event);}catch{}};
    report({phase:'checking'});
    const p=(await this.projects()).find(p=>p.id===id);if(!p)throw Error('项目不存在或账号无权访问');
    const records=await this.records(),root=path.join(this.dir,'projects',id);
    if(records[root]){report({phase:'cached'});return {root,name:p.name,cached:true};}
    const files=await this.remote(id,report);
    report({phase:'extracting',filesCompleted:0,totalFiles:files.size});
    await fs.mkdir(path.dirname(root),{recursive:true});
    // An interrupted import never becomes an implicit overwrite on retry.
    const staging=root+'-'+crypto.randomUUID();await fs.mkdir(staging);
    let completed=0;
    try {for(const [n,b]of files){await fs.mkdir(path.dirname(path.join(staging,n)),{recursive:true});await fs.writeFile(path.join(staging,n),b);completed++;if(completed%20===0||completed===files.size)report({phase:'extracting',filesCompleted:completed,totalFiles:files.size});}await fs.rename(staging,root);}
    catch(e){throw Error('导入未完成：'+e.message);}
    records[root]={id,name:p.name,base:hashes(files)};await this.save(records);
    report({phase:'ready',filesCompleted:completed,totalFiles:files.size});
    return {root,name:p.name,cached:false};
  });}
  async binding(root) {const r=(await this.records())[root];return r?{id:r.id,name:r.name}:null;}
  async plan(root) {return this.exclusive(async()=>{
    const records=await this.records(),record=records[root];if(!record)throw Error('当前目录不是已连接的 Overleaf 项目');
    const p=(await this.projects()).find(p=>p.id===record.id);if(!p)throw Error('当前账号无法访问此项目');
    const remote=await this.remote(record.id), local=await localFiles(root,new Set(Object.keys(record.base)));
    const lh=hashes(local),rh=hashes(remote);
    // Equal content is a new common ancestor even after an interrupted upload.
    for(const name of new Set([...Object.keys(record.base),...Object.keys(lh),...Object.keys(rh)]))if(valueAt(lh,name)===valueAt(rh,name)){if(valueAt(lh,name))record.base[name]=lh[name];else delete record.base[name];}
    await this.save(records);
    const rows=compare(record.base,lh,rh);
    const writable=['owner','readAndWrite','read-write'].includes(p.access);
    const token=crypto.randomUUID();this.plans.clear();this.plans.set(token,{root,record,lh,rh,rows,expires:Date.now()+10*60*1000});
    return {token,rows,writable,canApply:!rows.some(r=>r.action==='conflict')&&(writable||!rows.some(r=>['upload','deleteRemote'].includes(r.action)))};
  });}
  async apply(token) {return this.exclusive(async()=>{
    const p=this.plans.get(token);this.plans.delete(token);
    if(!p || Date.now()>p.expires)throw Error('同步确认已过期，请重新检查');
    const {root,record,rows}=p;
    if(rows.some(r=>r.action==='conflict'))throw Error('存在冲突，请先处理后重新检查');
    const projects=await this.projects(),access=projects.find(x=>x.id===record.id)?.access;
    if(!access)throw Error('账号无法访问此项目');
    if(rows.some(r=>['upload','deleteRemote'].includes(r.action))&&!['owner','readAndWrite','read-write'].includes(access))throw Error('当前项目为只读权限');
    const remote=await this.remote(record.id),local=await localFiles(root,new Set(Object.keys(record.base)));
    if(JSON.stringify(Object.entries(hashes(local)).sort())!==JSON.stringify(Object.entries(p.lh).sort()) || JSON.stringify(Object.entries(hashes(remote)).sort())!==JSON.stringify(Object.entries(p.rh).sort()))throw Error('确认期间本地或云端内容已变化，请重新检查');
    const tree=rows.some(r=>['upload','deleteRemote'].includes(r.action))?await this.transport.tree(record.id):null;
    const completed=[], records=await this.records();
    try {
      for(const row of rows) {
        const {name,action}=row,target=path.join(root,safeName(name));
        // Recheck local content immediately before touching that file.
        let current=null;try{if((await fs.lstat(target)).isSymbolicLink())throw Error('不允许符号链接');current=await fs.readFile(target);}catch(e){if(e.code!=='ENOENT')throw e;}
        if(digest(name,current)!==valueAt(p.lh,name))throw Error(name+' 在确认后被修改');
        if(action==='upload'||action==='deleteRemote') {
          // Check collaborators' changes once more, immediately before each upload.
          const latest=await this.remote(record.id);
          if(digest(name,latest.get(name))!==valueAt(p.rh,name))throw Error(name+' 云端内容已变化');
          if(action==='upload')await this.transport.upload(record.id,tree,name,local.get(name));
          else await this.transport.remove(record.id,tree,name);
          const verified=await this.remote(record.id);
          if(digest(name,verified.get(name))!==valueAt(p.lh,name))throw Error(name+' 上传后校验失败，请重新检查');
        } else {
          if(current){const backup=path.join(this.dir,'backups',crypto.randomUUID(),name);await fs.mkdir(path.dirname(backup),{recursive:true});await fs.writeFile(backup,current);}
          if(action==='download'){await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,remote.get(name));}
          else await fs.unlink(target);
        }
        const value=['upload','deleteRemote'].includes(action)?valueAt(p.lh,name):valueAt(p.rh,name);
        if(value)record.base[name]=value;else delete record.base[name];
        records[root]=record;await this.save(records);completed.push(name);
      }
      // Identical changes on both sides also advance the common baseline.
      for(const name of new Set([...Object.keys(record.base),...Object.keys(p.lh),...Object.keys(p.rh)]))if(valueAt(p.lh,name)===valueAt(p.rh,name)){if(valueAt(p.lh,name))record.base[name]=p.lh[name];else delete record.base[name];}
      records[root]=record;await this.save(records);
      return {completed};
    }catch(e){throw Error(`同步停止（已完成 ${completed.length} 个文件）：${e.message}。请重新检查后继续。`);}
  });}
}
module.exports={Overleaf,unzip,compare,safeName,digest};
