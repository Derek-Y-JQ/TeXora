import {ctx} from './ctx.js';
import {escapeHtml as esc,toast} from './util.js';
const api=()=>ctx.api.overleaf;
const check=res=>{if(!res?.ok)throw Error(res?.error||'Overleaf 操作失败');return res;};
const labels={upload:'上传',download:'下载',deleteRemote:'删除云端文件',deleteLocal:'删除本地文件',conflict:'冲突：本地和云端均已修改'};
function error(e){toast({type:'error',title:'Overleaf',body:e.message});}
async function refreshProject(root,rows){
  if(ctx.state.project.root!==root)return;
  for(const row of rows.filter(r=>r.action==='deleteLocal')){
    const full=(root+'/'+row.name).replace(/\\/g,'/');
    const opened=[...ctx.state.docs.keys()].find(p=>p.replace(/\\/g,'/')===full);
    if(opened){const stat=await ctx.api.fs.stat(opened);if(!stat.ok||stat.exists===false)await ctx.app.closeDocument(opened);}
  }
  await ctx.app.reloadOpenDocuments();await ctx.sidebar.refreshFiles();await ctx.app.refreshAssets();await ctx.app.refreshBibEntries();
}
export async function openOverleaf(){
  const binding=await api().binding();
  const m=ctx.dialogs.modal({title:'Overleaf 项目',width:720,subtitle:'网页登录 · 本地编辑 · 确认后同步原项目',body:`
    <p>首次使用请在独立窗口登录 Overleaf，完成后关闭登录窗口并点击“刷新项目”。登录状态保存在本机，密码由 Overleaf 网页处理。</p>
    <div class="overleaf-actions"><button class="btn btn-primary" data-login>登录账号</button><button class="btn btn-outline" data-refresh>刷新项目</button><button class="btn btn-outline" data-logout>退出账号</button></div>
    ${binding.binding?`<div class="overleaf-binding">当前连接：${esc(binding.binding.name)} <button class="btn btn-primary" data-sync>检查并同步</button></div>`:''}
    <input class="input" data-filter placeholder="筛选云端项目…" aria-label="筛选 Overleaf 项目"><div data-list class="overleaf-projects">正在读取项目…</div>
    <p class="field-hint">保存仅写入本地。同步会列出上传、下载和删除；有冲突时停止。首次加载后可离线编辑，再次加载会打开已有本地副本。</p>`});
  const list=m.root.querySelector('[data-list]');let projects=[],busy=false;
  const run=async fn=>{if(busy)return;busy=true;m.root.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){error(e);}finally{busy=false;m.root.querySelectorAll('button').forEach(b=>b.disabled=false);}};
  const render=()=>{
    const q=m.root.querySelector('[data-filter]').value.toLowerCase();
    list.innerHTML=projects.filter(p=>p.name.toLowerCase().includes(q)).map(p=>`<div class="overleaf-project"><div><strong>${esc(p.name)}</strong><div class="field-hint">${esc(p.id)} · ${['owner','readAndWrite','read-write'].includes(p.access)?'可编辑同步':'云端只读'}</div></div><button class="btn btn-outline" data-load="${esc(p.id)}">加载本地编辑</button></div>`).join('')||'<p>没有匹配的项目。</p>';
    list.querySelectorAll('[data-load]').forEach(b=>b.onclick=()=>run(async()=>{const result=check(await api().load(b.dataset.load));m.close();await ctx.app.openProject(result.root);toast({type:'success',title:result.cached?'已打开本地副本':'项目已加载',body:'编辑后点击 Overleaf → 检查并同步，确认回传。'});}));
  };
  const refresh=async()=>{try{projects=check(await api().projects()).projects;render();}catch(e){list.textContent=e.message;}};
  m.root.querySelector('[data-login]').onclick=()=>run(async()=>check(await api().login()));
  m.root.querySelector('[data-refresh]').onclick=()=>run(refresh);
  m.root.querySelector('[data-logout]').onclick=()=>run(async()=>{check(await api().logout());projects=[];list.textContent='已退出登录。本地副本仍可编辑。';});
  m.root.querySelector('[data-sync]')?.addEventListener('click',()=>run(async()=>{await ctx.app.saveAll();if([...ctx.state.docs.values()].some(d=>d.dirty))throw Error('有文件保存失败，请保存后重试');const root=ctx.state.project.root;const plan=check(await api().plan());if(root!==ctx.state.project.root)throw Error('项目已切换，请重新检查');m.close();showPlan(plan,root);}));
  m.root.querySelector('[data-filter]').oninput=render;
  await run(refresh);
}
function showPlan(plan,root){
  const conflicts=plan.rows.filter(r=>r.action==='conflict');
  const m=ctx.dialogs.modal({title:'确认同步原 Overleaf 项目',width:720,body:`
    <p>${conflicts.length?'下列冲突文件未上传。请先在本地或 Overleaf 中合并，再重新检查。':plan.rows.length?'请检查本次文件变更；确认后才会写入云端和本地。':'本地与云端内容一致。'}</p>
    ${!plan.writable?'<p>当前账号对云端项目只有读取权限。</p>':''}
    <div class="overleaf-projects">${plan.rows.map(r=>`<div class="overleaf-project ${r.action==='conflict'?'overleaf-conflict':''}"><code>${esc(r.name)}</code><span>${labels[r.action]}</span></div>`).join('')}</div>
    <p class="field-hint">同步前会再次检查变更。请让协作者在回传期间暂缓编辑同一文件；此功能采用手动文件同步。替换或删除的本地内容会先备份。</p>`,foot:`<button class="btn btn-outline" data-cancel>取消</button><button class="btn btn-primary" data-apply ${!plan.canApply||!plan.rows.length?'disabled':''}>确认同步 ${plan.rows.length} 个文件</button>`});
  m.root.querySelector('[data-cancel]').onclick=m.close;
  m.root.querySelector('[data-apply]').onclick=async()=>{
    if(ctx.state.project.root!==root)return error(Error('项目已切换，请重新检查'));
    if([...ctx.state.docs.values()].some(d=>d.dirty)){m.close();return error(Error('确认期间又有编辑，请保存后重新检查'));}
    m.close();const progress=ctx.dialogs.modal({title:'正在同步 Overleaf',dismissable:false,body:'正在逐个校验并同步文件，请稍候…'});
    const readOnly=ctx.editor.editor.getRawOptions().readOnly;
    ctx.editor.editor.updateOptions({readOnly:true});
    try{const result=check(await api().apply(plan.token));await refreshProject(root,plan.rows);progress.close();toast({type:'success',title:'同步完成',body:`已同步 ${result.completed.length} 个文件。`});}
    catch(e){progress.close();error(e);await refreshProject(root,plan.rows);}
    finally{ctx.editor.editor.updateOptions({readOnly:!!readOnly});}
  };
}

