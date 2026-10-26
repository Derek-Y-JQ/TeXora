export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  log('boot', await evalJs("!!window.__texora"));
  for(let i=0;i<20;i++){ await sleep(1000); const f=await evalJs("document.querySelectorAll('.math-zone.failed').length"); if(f>0) break; }
  log('failed zones', await evalJs("[...document.querySelectorAll('.math-zone.failed')].map(z=>z.textContent.slice(0,100))"));
  log('loading', await evalJs("document.querySelectorAll('.math-zone.loading').length"));
  log('fonts', await evalJs("(async()=>{const r=await window.texora.systemFonts();return r.fonts.length;})()"));
  log('font sample', await evalJs("(async()=>{const r=await window.texora.systemFonts();return r.fonts.slice(0,8);})()"));
  await shot('.capture/fix/failzone.png');
}
