export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  await evalJs("window.__texora.editor.refreshMathZones()");
  for(let i=0;i<25;i++){ await sleep(2000); const z=await evalJs("document.querySelectorAll('.math-zone').length"); if(z>0){ console.log('zones',z,'after',i*2,'s'); return; } }
  console.log('zones 0 after 50s');
  console.log('zones array', await evalJs("window.__texora.editor.mathZones.length"));
  console.log('last render', await evalJs("window.__lastRender"));
}
