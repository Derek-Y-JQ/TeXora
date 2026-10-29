const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const Module=require('node:module');
const original=Module._load;Module._load=function(n,...args){return n==='electron'?{}:original.call(this,n,...args);};const {OverleafSession,TREE_SCRIPT}=require('../electron/lib/overleaf-session');Module._load=original;
(async()=>{
 const id='123456789012345678901234';
 for(const legacy of [false,true]){
  const events={},project={rootFolder:[{_id:id,docs:[],fileRefs:[],folders:[]}]};let disconnected=false;
  const socket={on:(k,fn)=>events[k]=fn,disconnect:()=>{disconnected=true;},emit:(k,body,cb)=>{assert.equal(k,'joinProject');cb(null,project);}};
  const io={connect:(origin,opts)=>{assert.equal(origin,'https://www.overleaf.com');assert.equal(opts.query,'projectId='+id);setTimeout(()=>legacy?events.connect():events.joinProjectResponse({project}),1);return socket;}};if(legacy)io.version='0.9';
  const result=await vm.runInNewContext(TREE_SCRIPT,{window:{io},document:{querySelector:s=>({content:s.includes('project_id')?id:s.includes('csrfToken')?'csrf-value':'/socket.io'})},location:{origin:'https://www.overleaf.com'},URL,setTimeout,clearTimeout,setInterval,clearInterval,Error});
  assert.equal(result.project.rootFolder[0]._id,id);assert.equal(result.csrf,'csrf-value');assert.equal(disconnected,true);
 }
 const service=new OverleafSession(()=>null,'C:/test');let observed;
 service.request=async(route,options)=>{observed={route,options};return {json:async()=>({success:true})};};
 const tree={csrf:'csrf-token',project:{rootFolder:[{_id:id,folders:[{name:'sub',docs:[{_id:id,name:'a.tex'}]}]}]}};
 await service.upload(id,tree,'sub/a.tex',Buffer.from('content'));
 assert.ok(observed.route.endsWith('/upload?folder_id='+id));assert.equal(observed.options.headers['X-CSRF-Token'],'csrf-token');assert.equal(observed.options.body.get('relativePath'),'sub/a.tex');assert.equal(await observed.options.body.get('qqfile').text(),'content');assert.equal(observed.options.body.has('_csrf'),false);
 await service.remove(id,tree,'sub/a.tex');assert.equal(observed.route,`/project/${id}/doc/${id}`);assert.equal(observed.options.method,'DELETE');
 console.log('PASS Overleaf protocol: modern/legacy join response, socket teardown, multipart field contract, CSRF header, nested file deletion.');
})().catch(e=>{console.error(e);process.exitCode=1;});
