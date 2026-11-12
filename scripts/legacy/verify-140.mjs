import assert from 'node:assert/strict';
import path from 'node:path';
export default async function({evalJs,sleep,shot,send}) {
  async function waitFor(expr){for(let i=0;i<150;i++){if(await evalJs(expr))return;await sleep(100);}throw Error('Timed out: '+expr);}
  await waitFor('!!window.__texora?.editor.model');
  assert.equal(await evalJs('(async()=>(await window.texora.info()).version)()'),'1.4.0');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:950,deviceScaleFactor:1,mobile:false});
  await evalJs('window.__texora.state.settings.editor.autosave=false;window.__texora.state.settings.build.livePreview=false');
  // Replacing a promise dialog must settle the old operation and release resources.
  await evalJs(`window.__settled='pending';window.__texora.dialogs.prompt({title:'旧操作'}).then(value=>window.__settled=value);window.__texora.dialogs.modal({title:'键盘操作',body:'<input id="first140"><button id="last140">完成</button>'});true`);
  assert.equal(await evalJs('window.__settled'),null);
  assert.equal(await evalJs('document.querySelector(".modal").getAttribute("role")'),'dialog');
  await evalJs('document.querySelector("#last140").focus()');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.equal(await evalJs('document.activeElement.classList.contains("modal-close")'),true);
  await shot('docs/screenshots/140-dialog.png');
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
  await shot('docs/screenshots/140-workspace.png');
  await evalJs('document.querySelector("#searchQuery").value="";window.__texora.sidebar.runSearch()');
  assert.equal(await evalJs('document.querySelector("#searchResults").textContent'),'');
  console.log('PASS 1.4.0 UI: startup, dialog replacement settlement, ARIA, Tab containment, unsaved inactive tab guard, project search and clearing.');
}
