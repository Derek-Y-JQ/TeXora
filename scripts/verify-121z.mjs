export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  for(let i=0;i<30;i++){ await sleep(1000); if((await evalJs("document.querySelectorAll('.math-zone').length"))>0) break; }
  console.log('zones', await evalJs("document.querySelectorAll('.math-zone').length"));
  console.log('debug', await evalJs("window.__zoneDebug"));
}
