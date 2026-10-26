export default async function t({ evalJs, sleep }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  log('cfg', await evalJs("({m:window.__texora.state.settings.editor.inlineMathPreview,t:window.__texora.state.settings.editor.tablePreview,k:window.__texora.state.settings.editor.tikzPreview})"));
  await evalJs("window.__texora.editor.refreshMathZones()");
  await sleep(8000);
  log('zones after refresh', await evalJs("document.querySelectorAll('.math-zone').length"));
  log('snippet eq', await evalJs("(async()=>{ const r=await window.texora.tex.snippet({code:'\\\\max_j\\\\sup_t\\\\E\\\\abs{Y_{j,t}-\\\\hY_{j,t}}^2\\\\le 2K\\\\cL(\\\\theta)',kind:'math',displayMode:true}); return {ok:r.ok,error:(r.error||'').slice(-150)}; })()"));
}
