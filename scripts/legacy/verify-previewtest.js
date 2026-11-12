export default async function t({ evalJs, sleep, shot }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  for(let i=0;i<40;i++){ await sleep(1000); const d=await evalJs("window.__zoneDebug"); if(d) break; }
  console.log('zones', await evalJs("document.querySelectorAll('.math-zone').length"));
  console.log('imgs', await evalJs("document.querySelectorAll('.math-zone img').length"));
  console.log('failed', await evalJs("[...document.querySelectorAll('.math-zone.failed')].slice(0,3).map(z=>z.dataset.line+':'+z.textContent.slice(0,100))"));
  console.log('debug', await evalJs("window.__zoneDebug"));
  await shot('.capture/fix/previewtest.png');
}
