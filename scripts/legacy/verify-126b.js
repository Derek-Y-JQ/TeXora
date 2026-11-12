export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(3000);
  console.log('version', await evalJs("window.__texora.state.capture?.version"));
  for(let i=0;i<30;i++){ await sleep(1000); const d=await evalJs("window.__zoneDebug"); if(d) break; }
  console.log('zones', await evalJs("document.querySelectorAll('.math-zone').length"), 'imgs', await evalJs("document.querySelectorAll('.math-zone img').length"), 'failed', await evalJs("document.querySelectorAll('.math-zone.failed').length"));
  console.log('debug', await evalJs("window.__zoneDebug"));
  await evalJs("window.__texora.cmd('view.sidebar','labels')");
  await sleep(500);
  console.log('long label', await evalJs("(() => { const r=[...document.querySelectorAll('.label-row')].find(x=>x.textContent.includes('very-long')); if(!r)return null; return {h:r.getBoundingClientRect().height,nameH:r.querySelector('.l-name').getBoundingClientRect().height,sw:r.querySelector('.l-name').scrollWidth,cw:r.querySelector('.l-name').clientWidth}; })()"));
  console.log('update', await evalJs("(async()=>{const r=await window.texora.update.check();return {latest:r.latest,has:r.hasUpdate};})()"));
}
