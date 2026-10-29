'use strict';
const {BrowserWindow,session}=require('electron');
const ORIGIN='https://www.overleaf.com';
// Only the site's own Socket.IO client runs in this remote, sandboxed window.
// Credentials and cookies never cross the application preload bridge.
const TREE_SCRIPT=`new Promise((resolve,reject)=>{
 let socket,done=false;
 const finish=(err,value)=>{if(done)return;done=true;clearTimeout(timeout);clearInterval(wait);try{socket?.disconnect();}catch{}err?reject(Error(err)):resolve(value);};
 const timeout=setTimeout(()=>finish('无法读取项目文件树，请重新登录后重试'),25000);
 const wait=setInterval(()=>{
  if(!window.io?.connect)return;clearInterval(wait);
  const meta=n=>document.querySelector('meta[name="'+n+'"]')?.content;
  const id=meta('ol-project_id'),url=new URL(meta('ol-wsUrl')||'/socket.io',location.origin);
  if(!/^[a-f0-9]{24}$/i.test(id||'')||url.protocol!=='https:')return finish('项目元数据不可用');
  const options={resource:url.pathname.slice(1),path:url.pathname,query:'projectId='+id,reconnection:false,reconnect:false,forceNew:true,'force new connection':true};
  socket=window.io.connect(url.origin,options);
  socket.on('joinProjectResponse',body=>finish(null,{project:body.project,csrf:meta('ol-csrfToken')}));
  socket.on('connectionRejected',()=>finish('Overleaf 拒绝访问此项目'));
  socket.on('connect_error',()=>finish('无法连接 Overleaf 项目服务'));
  if(window.io.version)socket.on('connect',()=>socket.emit('joinProject',{project_id:id},(err,project)=>finish(err?'无法访问项目':null,{project,csrf:meta('ol-csrfToken')})));
 },100);
})`;
class OverleafSession {
  constructor(parent,storagePath){this.parent=parent;this.storagePath=storagePath;this.loginWindow=null;this.worker=null;this.active=false;}
  get session(){return session.fromPath(this.storagePath);}
  window(show){
    const win=new BrowserWindow({parent:this.parent(),width:1100,height:800,show,title:'Overleaf — TeXora',autoHideMenuBar:true,webPreferences:{session:this.session,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
    win.webContents.setWindowOpenHandler(({url})=>{if(url.startsWith('https://'))void win.loadURL(url).catch(()=>{});return {action:'deny'};});
    win.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith('https://'))e.preventDefault();});
    return win;
  }
  async login(){
    if(this.loginWindow&&!this.loginWindow.isDestroyed()){this.loginWindow.show();this.loginWindow.focus();return;}
    const win=this.window(true);this.loginWindow=win;
    win.on('closed',()=>{this.loginWindow=null;});
    await win.loadURL(ORIGIN+'/login');
  }
  async logout(){if(this.active)throw Error('请等待当前 Overleaf 操作完成再退出');this.loginWindow?.close();this.worker?.close();await this.session.clearStorageData();await this.session.clearAuthCache();}
  async request(route,options={}){
    if(!/^\/(?:user\/projects$|project\/[a-f\d]{24}(?:\/|$))/.test(route))throw Error('无效的 Overleaf 请求');
    let url=new URL(route,ORIGIN);
    if(url.origin!==ORIGIN)throw Error('无效的 Overleaf 请求');
    const method=(options.method||'GET').toUpperCase();
    const loginRequired=()=>Error('Overleaf 登录已过期，请在登录窗口完成登录后刷新项目');
    // Electron Session.fetch can return a successful response with an empty URL.
    // Track redirects ourselves; Response.url is not an authentication signal.
    const signal=AbortSignal.timeout(90000);
    for(let redirects=0;redirects<=4;redirects++){
      let response;
      try{response=await this.session.fetch(url.href,{...options,credentials:'include',redirect:'manual',cache:'no-store',signal});}catch{throw Error('无法连接 Overleaf，请检查网络后重试');}
      if(response.url && new URL(response.url).origin!==ORIGIN)throw Error('Overleaf 返回了非预期的网站地址，请重新打开登录窗口');
      if([301,302,303,307,308].includes(response.status)){
        const location=response.headers.get('location');
        if(!location)throw Error('Overleaf 重定向缺少地址，请重试');
        const next=new URL(location,url);
        if(next.origin!==ORIGIN)throw Error('Overleaf 重定向到非预期网站，请在登录窗口检查');
        if(/^\/login(?:\/|$)/.test(next.pathname))throw loginRequired();
        // Never replay an upload or delete after a redirect.
        if(method!=='GET' && method!=='HEAD')throw Error('Overleaf 写入请求发生重定向，已停止同步，请重新检查');
        url=next;continue;
      }
      if(response.status===401)throw loginRequired();
      if(response.status===403){
        if(response.headers.get('cf-mitigated')==='challenge')throw Error('Overleaf 需要网页验证，请打开登录窗口完成验证后刷新');
        throw Error('Overleaf 拒绝访问，请在登录窗口确认账号、项目权限或网页验证状态');
      }
      if(!response.ok)throw Error('Overleaf 请求失败（'+response.status+'）');
      return response;
    }
    throw Error('Overleaf 重定向次数过多，请在登录窗口检查登录状态');
  }
  async json(route){const r=await this.request(route);if(!r.headers.get('content-type')?.includes('json'))throw Error('Overleaf 未返回项目数据，请打开登录窗口检查是否需要网页验证后刷新');return r.json();}
  async zip(route){const r=await this.request(route);if(r.headers.get('content-type')?.includes('text/html'))throw Error('登录已过期，请重新登录 Overleaf');const size=Number(r.headers.get('content-length'));if(size>256*1024*1024)throw Error('项目压缩包超过大小限制');const reader=r.body.getReader(),chunks=[];let total=0;for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>256*1024*1024){await reader.cancel();throw Error('项目压缩包超过大小限制');}chunks.push(Buffer.from(value));}return Buffer.concat(chunks);}
  async tree(id){
    if(this.worker&&!this.worker.isDestroyed())this.worker.close();
    const win=this.window(false);this.worker=win;this.active=true;
    try{await win.loadURL(ORIGIN+'/project/'+id);if(new URL(win.webContents.getURL()).pathname!=='/project/'+id)throw Error('请重新登录 Overleaf');const result=await win.webContents.executeJavaScript(TREE_SCRIPT);if(!result?.project?.rootFolder?.[0]?._id||!result.csrf)throw Error('Overleaf 文件树接口已变化，未上传任何文件');return result;}
    finally{this.active=false;if(!win.isDestroyed())win.close();if(this.worker===win)this.worker=null;}
  }
  async upload(id,tree,name,buffer){
    const form=new FormData();form.set('name',name.split('/').at(-1));form.set('relativePath',name);form.set('qqfile',new Blob([buffer]),name.split('/').at(-1));
    const r=await this.request(`/project/${id}/upload?folder_id=${encodeURIComponent(tree.project.rootFolder[0]._id)}`,{method:'POST',headers:{'X-CSRF-Token':tree.csrf},body:form});
    const result=await r.json();if(!result.success)throw Error('Overleaf 未确认上传成功');
  }
  async remove(id,tree,name){
    let folder=tree.project.rootFolder[0];const parts=name.split('/'),base=parts.pop();for(const part of parts)folder=folder?.folders?.find(f=>f.name===part);
    const doc=folder?.docs?.find(f=>f.name===base),file=folder?.fileRefs?.find(f=>f.name===base),entity=doc||file;
    if(!entity?._id)throw Error('未找到要删除的云端文件，请重新检查');
    await this.request(`/project/${id}/${doc?'doc':'file'}/${entity._id}`,{method:'DELETE',headers:{'X-CSRF-Token':tree.csrf}});
  }
}
module.exports={OverleafSession,TREE_SCRIPT};
