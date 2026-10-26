export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for (let i=0;i<70;i++) { if ((await evalJs("document.querySelectorAll('.pdf-page').length"))>0) break; await sleep(800); }
  for (let i=0;i<12;i++) { await sleep(1000); const z=await evalJs("document.querySelectorAll('.math-zone').length"); if (z>0) break; }
  log('zones after wait', await evalJs("document.querySelectorAll('.math-zone').length"));
  log('inline setting', await evalJs("window.__texora.state.settings.editor.inlineMathPreview"));
  log('snippet', await evalJs("(async()=>{ const r=await window.texora.tex.snippet({code:'\\\\frac{a}{b}',kind:'math'}); return {ok:r.ok,error:(r.error||'').slice(-80)}; })()"));
  log('zones after snippet', await evalJs("document.querySelectorAll('.math-zone').length"));
  await evalJs("window.__texora.editor.refreshMathZones?.()");
  await sleep(2500);
  log('zones after manual refresh', await evalJs("document.querySelectorAll('.math-zone').length"));
  await shot('.capture/fix/packaged-110b.png');
}
