import {ctx} from './ctx.js';
import {escapeHtml as esc,toast,formatBytes} from './util.js';
const api=()=>ctx.api.overleaf;
const check=res=>{if(!res?.ok)throw Error(res?.error||'Overleaf 操作失败');return res;};
const labels={upload:'上传',download:'下载',deleteRemote:'删除云端文件',deleteLocal:'删除本地文件',conflict:'冲突：本地和云端均已修改'};
let closeProgressListener=()=>{};
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
  closeProgressListener();
  const binding=await api().binding();
  const live=ctx.state.overleafLive||{};
  let unsubscribe=()=>{},unsubscribeLogin=()=>{},activeLoad=null,transfer={};
  const cleanup=()=>{unsubscribe();unsubscribeLogin();};
  const m=ctx.dialogs.modal({title:'Overleaf 项目',width:760,subtitle:'官方站点直连 · 实时协同编辑 · 云端编译',onClose:cleanup,body:`
    <p>首次使用请在独立窗口登录 Overleaf（<code>overleaf.com</code>），登录完成后窗口将自动关闭并刷新项目列表。</p>
    <div class="overleaf-actions"><button class="btn btn-primary" data-login>登录账号</button><button class="btn btn-outline" data-refresh>刷新项目</button><button class="btn btn-outline" data-logout>退出账号</button></div>
    ${live.active?`<div class="overleaf-binding">当前实时连接：<strong>${esc(live.name||live.projectId)}</strong>（${live.status==='connected'?'已连接':live.status==='reconnecting'?'重连中…':'已断开'}） <button class="btn btn-outline" data-live-disconnect>断开实时连接</button></div>`:''}
    ${!live.active&&binding.binding?`<div class="overleaf-binding">当前离线副本：${esc(binding.binding.name)} <button class="btn btn-primary" data-sync>检查并同步</button></div>`:''}
    <input class="input" data-filter placeholder="筛选云端项目…" aria-label="筛选 Overleaf 项目"><div data-list class="overleaf-projects">正在读取项目…</div>
    <section class="overleaf-transfer" data-transfer hidden>
      <div class="overleaf-transfer-line"><strong data-transfer-stage role="status" aria-live="polite"></strong><span data-transfer-percent></span></div>
      <progress data-transfer-bar max="100" aria-label="Overleaf 项目下载进度"></progress>
      <div class="overleaf-transfer-line"><span data-transfer-size>0 B</span><span data-transfer-speed>—</span></div>
      <div class="field-hint" data-transfer-elapsed></div>
    </section>
    <p class="field-hint">「实时直连」无需下载整包 ZIP，可与协作者实时同步编辑并使用 Overleaf 云端编译；如需完全离线编辑，可点击「离线副本」。</p>`});
  const list=m.root.querySelector('[data-list]');let projects=[],busy=false;
  const run=async fn=>{if(busy)return;busy=true;m.root.querySelectorAll('button:not(.modal-close)').forEach(b=>b.disabled=true);try{await fn();}catch(e){error(e);}finally{busy=false;m.root.querySelectorAll('button').forEach(b=>b.disabled=false);}};
  const updateTransfer=event=>{
    transfer={...transfer,...event};const t=transfer;
    const titles={checking:'正在检查项目…',waiting:'等待 Overleaf 打包并响应…',downloading:'正在下载项目…',downloaded:'下载完成，正在校验压缩包…',extracting:'正在解压并保存到本地…',ready:'项目已保存，正在打开…',cached:'已有本地副本，正在打开…',error:'项目加载失败'};
    m.root.querySelector('[data-transfer]').hidden=false;
    const stage=m.root.querySelector('[data-transfer-stage]'),title=titles[t.phase]||'正在加载项目…';if(stage.textContent!==title)stage.textContent=title;
    const received=Math.max(0,Number(t.receivedBytes)||0),size=Number(t.totalBytes)||0;
    const extracting=t.phase==='extracting',files=Number(t.totalFiles)||0;
    let percent=extracting?(files>0?100*(t.filesCompleted||0)/files:null):(size>0?100*received/size:null);
    if(['ready','cached'].includes(t.phase))percent=100;
    const bar=m.root.querySelector('[data-transfer-bar]');
    bar.hidden=t.phase==='error';
    if(percent===null||t.phase==='error')bar.removeAttribute('value');else bar.value=Math.min(100,Math.max(0,percent));
    m.root.querySelector('[data-transfer-percent]').textContent=extracting?(files>0?`${t.filesCompleted||0} / ${files} 文件`:''):percent===null?'总大小未知':`${Math.min(100,percent).toFixed(1)}%`;
    m.root.querySelector('[data-transfer-size]').textContent=size>0?`${formatBytes(received)} / ${formatBytes(size)}`:formatBytes(received);
    const speed=Math.max(0,Number(t.speedBytesPerSecond)||0);
    m.root.querySelector('[data-transfer-speed]').textContent=t.phase==='downloading'?(speed>0&&speed<1?`${speed.toFixed(1)} B/s`:`${formatBytes(speed)}/s`):'—';
    const seconds=Math.max(0,Math.floor(t.elapsedSeconds||0));
    m.root.querySelector('[data-transfer-elapsed]').textContent=t.phase==='error'?t.error:`已用时 ${Math.floor(seconds/60)} 分 ${seconds%60} 秒`;
  };
  unsubscribe=api().onLoadProgress?.(event=>{
    if(!m.root.isConnected){unsubscribe();return;}
    if(activeLoad&&event.requestId===activeLoad)updateTransfer(event);
  })||(()=>{});
  closeProgressListener=cleanup;
  const render=()=>{
    const q=m.root.querySelector('[data-filter]').value.toLowerCase();
    list.innerHTML=projects.filter(p=>p.name.toLowerCase().includes(q)).map(p=>`<div class="overleaf-project"><div><strong>${esc(p.name)}</strong><div class="field-hint">${esc(p.id)} · ${p.access==='unknown'?'权限未识别，请刷新项目':['owner','readAndWrite','read-write'].includes(p.access)?'可编辑协作':'云端只读'}</div></div><div style="display:flex;gap:6px;flex-shrink:0"><button class="btn btn-primary" data-live="${esc(p.id)}" data-name="${esc(p.name)}">实时直连</button><button class="btn btn-outline" data-load="${esc(p.id)}">离线副本</button></div></div>`).join('')||'<p>没有匹配的项目。</p>';
    list.querySelectorAll('[data-live]').forEach(b=>b.onclick=()=>run(async()=>{
      const ok=await ctx.dialogs.confirm({
        title:'切换到 Overleaf 实时协作模式',
        message:`即将直连「${b.dataset.name||'Overleaf 项目'}」：文档将与 Overleaf 云端及在线协作者实时同步（无需下载到本地），编译将使用 Overleaf 云端编译服务。是否继续？`,
        confirmText:'进入实时协作',
        cancelText:'取消'
      });
      if(!ok)return;
      m.close();
      await ctx.app.openOverleafLive(b.dataset.live, b.dataset.name);
    }));
    list.querySelectorAll('[data-load]').forEach(b=>b.onclick=()=>run(async()=>{
      activeLoad=crypto.randomUUID();transfer={receivedBytes:0,totalBytes:null,elapsedSeconds:0};updateTransfer({phase:'checking'});
      try{
        const result=check(await api().load(b.dataset.load,activeLoad));
        if(!m.root.isConnected){toast({type:'success',title:'项目已保存到本地',body:'可重新打开 Overleaf 窗口，选择此项目继续编辑。'});return;}
        m.close();await ctx.app.openProject(result.root);toast({type:'success',title:result.cached?'已打开本地副本':'项目已加载',body:'编辑后点击 Overleaf → 检查并同步，确认回传。'});
      }catch(e){if(m.root.isConnected)updateTransfer({phase:'error',error:e.message});throw e;}
      finally{activeLoad=null;}
    }));
  };
  const refresh=async()=>{try{projects=check(await api().projects()).projects;render();}catch(e){list.textContent=e.message;}};
  unsubscribeLogin=api().onLoginComplete?.(()=>{if(m.root.isConnected)void run(refresh);})||(()=>{});
  m.root.querySelector('[data-login]').onclick=()=>run(async()=>check(await api().login()));
  m.root.querySelector('[data-refresh]').onclick=()=>run(refresh);
  m.root.querySelector('[data-logout]').onclick=()=>run(async()=>{check(await api().logout());if(ctx.state.overleafLive?.active)await ctx.app.disconnectOverleafLive();projects=[];list.textContent='已退出登录。';});
  m.root.querySelector('[data-live-disconnect]')?.addEventListener('click',()=>run(async()=>{m.close();await ctx.app.disconnectOverleafLive();}));
  m.root.querySelector('[data-sync]')?.addEventListener('click',()=>run(async()=>{await ctx.app.saveAll();if([...ctx.state.docs.values()].some(d=>d.dirty))throw Error('有文件保存失败，请保存后重试');const root=ctx.state.project.root;const plan=check(await api().plan());if(root!==ctx.state.project.root)throw Error('项目已切换，请重新检查');m.close();showPlan(plan,root);}));
  m.root.querySelector('[data-filter]').oninput=render;
  await run(refresh);
}
function showPlan(plan,root){
  const conflicts=plan.rows.filter(r=>r.action==='conflict');
  const m=ctx.dialogs.modal({title:'确认同步原 Overleaf 项目',width:720,body:`
    <p>${conflicts.length?'下列冲突文件未上传。请先在本地或 Overleaf 中合并，再重新检查。':plan.rows.length?'请检查本次文件变更；确认后才会写入云端和本地。':'本地与云端内容一致。'}</p>
    ${!plan.writable?(plan.access==='unknown'?'<p>未能识别当前账号的编辑权限。请刷新项目或重新登录后重试；尚未确认前不会上传文件。</p>':'<p>当前账号对云端项目只有读取权限。</p>'):''}
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

const COMPILERS=[
  {value:'pdflatex',label:'pdfLaTeX'},
  {value:'xelatex',label:'XeLaTeX（推荐中文）'},
  {value:'lualatex',label:'LuaLaTeX'},
  {value:'latex',label:'LaTeX'}
];

export async function openOverleafSettings(){
  const live=ctx.state.overleafLive;
  if(!live?.active)return toast({type:'info',title:'尚未进入 Overleaf 实时模式'});
  const state=await api().liveState();
  const compiler=state?.compiler||live.compiler||'pdflatex';
  const imageName=state?.imageName||live.imageName||'';
  const rootFile=state?.rootFile||ctx.state.project.rootFile||'';
  const writable=Boolean(state?.writable??live.writable);
  const texFiles=(ctx.state.assets?.tex||[]).filter(f=>/\.(tex|ltx)$/i.test(f));
  const rootRel=rootFile.startsWith(ctx.state.project.root+'/')?rootFile.slice(ctx.state.project.root.length+1):'';
  const stopOnFirstError=Boolean(live.stopOnFirstError);
  const compileMode=live.compileMode==='local'?'local':'cloud';

  const m=ctx.dialogs.modal({
    title:'Overleaf 项目设置',
    width:560,
    subtitle:`${live.name||live.projectId} · ${writable?'可编辑':'云端只读'}`,
    body:`
      <div class="field-group" style="display:grid;gap:14px">
        <label class="field">
          <span>预览编译方式（Compile mode）</span>
          <select class="input" data-ol-compile-mode>
            <option value="local" ${compileMode==='local'?'selected':''}>本地极速预览（自动镜像到本地 · 免云端排队，支持自动编译）</option>
            <option value="cloud" ${compileMode!=='local'?'selected':''}>Overleaf 云端编译（与网页版终稿完全一致）</option>
          </select>
          <span class="field-hint">无论选择哪种编译方式，文档编辑都会实时 OT 同步到 Overleaf 云端。</span>
        </label>
        <label class="field">
          <span>编译器（Compiler）</span>
          <select class="input" data-ol-compiler ${writable?'':'disabled'}>
            ${COMPILERS.map(c=>`<option value="${c.value}" ${c.value===compiler?'selected':''}>${c.label}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span>主文档（Main document）</span>
          <select class="input" data-ol-root ${writable?'':'disabled'}>
            ${texFiles.length?texFiles.map(f=>`<option value="${esc(ctx.state.project.root+'/'+f)}" ${f===rootRel?'selected':''}>${esc(f)}</option>`).join(''):`<option value="">未找到 .tex 文件</option>`}
          </select>
        </label>
        <label class="field">
          <span>TeX Live 镜像版本（可选）</span>
          <input class="input" data-ol-image value="${esc(imageName)}" placeholder="保持 Overleaf 默认（如 texlive-full:2024.1）" ${writable?'':'disabled'} />
          <span class="field-hint">修改云端编译器或主文档会立即同步到 Overleaf 项目设置。</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" data-ol-stop-err ${stopOnFirstError?'checked':''} />
          <span>遇错即停（Stop on first error · 仅云端）</span>
        </label>
        <div style="display:flex;flex-wrap:wrap;gap:8px;padding-top:6px;border-top:1px solid var(--border)">
          <button class="btn btn-outline" data-ol-sync-mirror>重新同步本地镜像</button>
          <button class="btn btn-outline" data-ol-clear-cache ${writable||compileMode==='local'?'':'disabled'}>${compileMode==='local'?'清理本地镜像缓存并重编':'清除云端编译缓存并重编'}</button>
          <button class="btn btn-outline" data-ol-open-web>在浏览器中打开原项目</button>
          <button class="btn btn-outline" data-ol-disconnect>断开实时连接</button>
        </div>
      </div>`,
    foot:`<button class="btn btn-outline" data-cancel>关闭</button><button class="btn btn-primary" data-save>保存设置</button>`
  });

  m.root.querySelector('[data-cancel]').onclick=m.close;
  m.root.querySelector('[data-ol-sync-mirror]').onclick=async()=>{
    m.close();
    await ctx.app.syncOverleafMirror?.();
  };
  m.root.querySelector('[data-ol-open-web]').onclick=()=>{
    ctx.api.openExternal(`https://www.overleaf.com/project/${live.projectId}`);
  };
  m.root.querySelector('[data-ol-disconnect]').onclick=async()=>{
    m.close();
    await ctx.app.disconnectOverleafLive();
  };
  m.root.querySelector('[data-ol-clear-cache]').onclick=async()=>{
    try{
      if(ctx.state.overleafLive?.compileMode==='local'){
        m.close();
        await ctx.cmd('build.clean',false);
        return;
      }
      check(await api().liveClearCompileCache());
      m.close();
      toast({type:'success',title:'已清除 Overleaf 云端缓存',body:'正在从头重新编译…'});
      ctx.cmd('build.run');
    }catch(e){error(e);}
  };
  m.root.querySelector('[data-save]').onclick=async()=>{
    const nextMode=m.root.querySelector('[data-ol-compile-mode]').value;
    const nextCompiler=m.root.querySelector('[data-ol-compiler]').value;
    const nextRoot=m.root.querySelector('[data-ol-root]').value;
    const nextImage=m.root.querySelector('[data-ol-image]').value.trim();
    ctx.state.overleafLive.stopOnFirstError=m.root.querySelector('[data-ol-stop-err]').checked;
    try{
      if(writable){
        const patch={compiler:nextCompiler};
        if(nextRoot&&nextRoot!==rootFile)patch.rootFile=nextRoot;
        if(nextImage&&nextImage!==imageName)patch.imageName=nextImage;
        const res=check(await api().liveUpdateSettings(patch));
        ctx.state.overleafLive.compiler=res.compiler||nextCompiler;
        ctx.state.overleafLive.imageName=res.imageName||nextImage;
        if(res.rootFile)ctx.state.project.rootFile=res.rootFile;
      }
      if(nextMode!==compileMode){
        await ctx.app.setOverleafCompileMode?.(nextMode);
      }else{
        ctx.app.syncOverleafModeUi?.();
        toast({type:'success',title:'Overleaf 项目设置已更新',body:`编译器：${ctx.state.overleafLive.compiler}`});
      }
      m.close();
    }catch(e){error(e);}
  };
}

