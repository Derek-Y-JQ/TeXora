export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  for(let i=0;i<30;i++){ await sleep(1000); if((await evalJs("document.querySelectorAll('.math-zone').length"))>0) break; }
  log('zones', await evalJs("document.querySelectorAll('.math-zone').length"));
  log('zone debug', await evalJs("window.__zoneDebug"));
  log('findBtn', await evalJs("document.querySelector('#findBtn')?.title"));
  await evalJs("document.querySelector('#findBtn').click()");
  await sleep(500);
  log('find', await evalJs("(() => { const b=document.querySelector('#findBar'); const r=b.getBoundingClientRect(); return {open:b.classList.contains('open'),top:r.top,replaceVisible:!b.querySelector('.find-replace-line').classList.contains('hidden')}; })()"));
  await shot('.capture/fix/packaged120c.png');
}
