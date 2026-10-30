import assert from 'node:assert/strict';
import path from 'node:path';
export default async function({evalJs,sleep,shot,send}) {
  async function waitFor(expr){for(let i=0;i<150;i++){if(await evalJs(expr))return;await sleep(100);}throw Error('Timed out: '+expr);}
  await waitFor('!!window.__texora?.editor.model');
  assert.equal(await evalJs('(async()=>(await window.texora.info()).version)()'),'1.4.2');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:950,deviceScaleFactor:1,mobile:false});
  await evalJs('window.__texora.state.settings.editor.autosave=false;window.__texora.state.settings.build.livePreview=false');
  // Replacing a promise dialog must settle the old operation and release resources.
  await evalJs(`window.__settled='pending';window.__texora.dialogs.prompt({title:'旧操作'}).then(value=>window.__settled=value);window.__texora.dialogs.modal({title:'键盘操作',body:'<input id="first140"><button id="last140">完成</button>'});true`);
  assert.equal(await evalJs('window.__settled'),null);
  assert.equal(await evalJs('document.querySelector(".modal").getAttribute("role")'),'dialog');
  await evalJs('document.querySelector("#last140").focus()');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.equal(await evalJs('document.activeElement.classList.contains("modal-close")'),true);
  await shot('.capture/142-dialog.png');
  await evalJs('document.querySelector(".modal-close").click()');
  // A clean active tab must not hide unsaved changes in another tab.
  await evalJs(`(async()=>{const c=window.__texora;await c.app.openDocument(${JSON.stringify(path.resolve('.capture/verify140-project/child.tex'))});c.editor.model.setValue('unsaved child');await c.app.openDocument(c.state.project.rootFile);c.app.closeProject();return true;})()`);
  await waitFor('!!document.querySelector(".modal")');
  assert.equal(await evalJs('document.querySelector(".modal-title").textContent.trim()'),'关闭项目');
  await evalJs('document.querySelector(".modal-foot [data-dialog-btn]").click()');
  await evalJs('window.__texora.sidebar.show("search")');
  await evalJs('document.querySelector("#searchQuery").value="cat";window.__texora.sidebar.runSearch()');
  await waitFor('!window.__texora.sidebar.searchState.busy');
  assert.ok(await evalJs('document.querySelector("#searchResults").textContent.includes("cat")'));
  await shot('.capture/142-workspace.png');
  await evalJs('document.querySelector("#searchQuery").value="";window.__texora.sidebar.runSearch()');
  assert.equal(await evalJs('document.querySelector("#searchResults").textContent'),'');
  await evalJs("(async()=>{await window.texora.settings.set('build.engine','xelatex');return true})()");
  const payload = {rootText:String.raw`\documentclass[UTF8,fontset=windows]{ctexart}`,kind:"table",code:String.raw`\begin{tabular}{ll}中文 & 测试 \\ 字体 & 正常\end{tabular}`,scale:1};
  const result = await evalJs("(async()=>await window.texora.tex.snippet("+JSON.stringify(payload)+"))()");
  assert.ok(result.ok, JSON.stringify(result));
  assert.ok(result.width > 0 && result.height > 0);
  // Stub the cloud boundary: verify permission messaging without touching user projects.
  await evalJs(`window.__originalApi142=window.__texora.api;window.__originalSave142=window.__texora.app.saveAll;window.__texora.app.saveAll=async()=>{for(const d of window.__texora.state.docs.values())d.dirty=false};window.__role142='owner';window.__texora.api={...window.__originalApi142,overleaf:{binding:async()=>({binding:{name:'权限测试'}}),projects:async()=>({ok:true,projects:[{id:'fixture',name:'权限测试',access:window.__role142}]}),plan:async()=>({ok:true,access:window.__role142,writable:window.__role142==='owner',canApply:window.__role142==='owner',rows:[{name:'chapter.tex',action:'upload'}]}),onLoadProgress:()=>()=>{},apply:async()=>{throw Error('Test must never upload')}}};true`);
  for(const role of ['owner','unknown','readOnly']){
    await evalJs(`window.__role142=${JSON.stringify(role)};document.querySelector('#overleafBtn').click();true`);
    await waitFor('!!document.querySelector("[data-sync]") && !!document.querySelector("[data-list] strong")');
    if(role==='unknown')assert.ok(await evalJs('document.querySelector("[data-list]").textContent.includes("权限未识别")'));
    await evalJs('document.querySelector("[data-sync]").click()');
    await waitFor('!!document.querySelector("[data-apply]")');
    assert.equal(await evalJs('document.querySelector("[data-apply]").disabled'),role!=='owner');
    if(role==='unknown')assert.ok(await evalJs('document.querySelector(".modal").textContent.includes("未能识别当前账号的编辑权限")'));
    if(role==='readOnly')assert.ok(await evalJs('document.querySelector(".modal").textContent.includes("只有读取权限")'));
    await shot('.capture/142-permission-'+role+'.png');
    await evalJs('document.querySelector("[data-cancel]").click()');
  }
  await evalJs('window.__texora.api=window.__originalApi142;window.__texora.app.saveAll=window.__originalSave142;true');
  console.log('PASS 1.4.2 packaged UI: startup, dialogs, unsaved tab guard, search, Chinese snippet rendering, owner upload enabled, unknown/read-only upload disabled. No cloud writes.');
}
