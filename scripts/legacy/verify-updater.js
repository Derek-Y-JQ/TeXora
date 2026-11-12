export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(2000);
  console.log('version', await evalJs("window.__texora.state.capture?.version"));
  console.log('check', await evalJs("(async()=>{const r=await window.texora.update.check();return {ok:r.ok,latest:r.latest,has:r.hasUpdate,url:r.url};})()"));
  await evalJs("window.__texora.app.checkUpdates(true)");
  await sleep(1500);
  console.log('toast', await evalJs("document.querySelector('.toast-title')?.textContent"));
  console.log('switch', await evalJs("!!document.querySelector('[data-setting=\"general.autoCheckUpdates\"]')"));
}
