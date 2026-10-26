export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  for(let i=0;i<60;i++){ await sleep(1000); const z=await evalJs("document.querySelectorAll('.math-zone').length"); if(z>0){ console.log('zones',z,'at',i+1); return; } }
  console.log('zones 0; debug', await evalJs("window.__zoneDebug"));
  console.log('loading', await evalJs("document.querySelectorAll('.math-zone.loading').length"));
}
