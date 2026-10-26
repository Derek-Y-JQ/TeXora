export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  for(let i=0;i<40;i++){ await sleep(1000); const z=await evalJs("document.querySelectorAll('.math-zone').length"); if(z>0){ console.log('zones',z,'after',i+1,'s'); break; } }
  log('final zones', await evalJs("document.querySelectorAll('.math-zone').length"));
  log('debug', await evalJs("window.__zoneDebug"));
  log('findBtn', await evalJs("!!document.querySelector('#findBtn')"));
  await shot('.capture/fix/zones-auto.png');
}
