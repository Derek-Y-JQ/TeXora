export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for (let i=0;i<80;i++) { if ((await evalJs("document.querySelectorAll('.pdf-page').length"))>0) break; await sleep(900); }
  for (let i=0;i<20;i++) { await sleep(1500); if ((await evalJs("document.querySelectorAll('.math-zone').length"))>0) break; }
  log('zones', await evalJs("document.querySelectorAll('.math-zone').length"));
  log('envDefs ipc', await evalJs("(async()=>{ const r=await window.texora.tex.envDefs({cls:'siamart220329',packages:['amsmath','amsthm','algorithm2e']}); return {ok:r.ok,n:Object.keys(r.defs||{}).length,err:r.error,first:Object.entries(r.defs||{}).slice(0,6)}; })()"));
  log('snippet E', await evalJs("(async()=>{ const r=await window.texora.tex.snippet({code:'\\\\E[X\\\\mid\\\\cF_t]',kind:'math'}); return {ok:r.ok,error:(r.error||'').slice(-160)}; })()"));
  log('snippet table', await evalJs("(async()=>{ const r=await window.texora.tex.snippet({code:'\\\\begin{tabular}{lc} \\\\toprule a & b \\\\\\\\ \\\\bottomrule \\\\end{tabular}',kind:'table'}); return {ok:r.ok,error:(r.error||'').slice(-160)}; })()"));
  log('snippet tikz', await evalJs("(async()=>{ const r=await window.texora.tex.snippet({code:'\\\\begin{tikzpicture}\\\\draw (0,0)--(1,1);\\\\end{tikzpicture}',kind:'tikz'}); return {ok:r.ok,error:(r.error||'').slice(-160)}; })()"));
  await shot('.capture/fix/paper-zones2.png');
}
