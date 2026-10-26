export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  await sleep(4000);
  log('zones initial', await evalJs("document.querySelectorAll('.math-zone').length"));
  log('debug1', await evalJs("window.__zoneDebug"));
  await evalJs("window.__texora.editor.refreshMathZones()");
  await sleep(6000);
  log('zones manual', await evalJs("document.querySelectorAll('.math-zone').length"));
  log('debug2', await evalJs("window.__zoneDebug"));
  // find bar position + toolbar button
  await evalJs("window.__texora.app.openFind(false)");
  await sleep(400);
  log('find rect', await evalJs("(() => { const r=document.querySelector('#findBar').getBoundingClientRect(); return {top:r.top,bottom:r.bottom,h:r.height,vh:innerHeight}; })()"));
  await shot('.capture/fix/find-top.png');
}
