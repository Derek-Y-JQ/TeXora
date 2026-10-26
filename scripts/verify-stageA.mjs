export default async function t({ evalJs, sleep, shot, send }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for (let i=0;i<80;i++) { if ((await evalJs("document.querySelectorAll('.pdf-page').length"))>0) break; await sleep(900); }
  await sleep(9000);
  log('status', await evalJs("document.querySelector('#sbBuildText').textContent"));
  log('envDefs', await evalJs("Object.keys(window.__texora.state.envDefs||{}).length"));
  log('envDefs sample', await evalJs("Object.entries(window.__texora.state.envDefs||{}).slice(0,12)"));
  log('zones', await evalJs("document.querySelectorAll('.math-zone').length"));
  log('markers', await evalJs("monaco.editor.getModelMarkers({owner:'texora-env'}).map(m=>m.message).slice(0,6)"));
  log('snippet table', await evalJs("(async()=>{ const r=await window.texora.tex.snippet({code:'\\\\begin{tabular}{lc} \\\\toprule a & b \\\\\\\\ \\\\bottomrule \\\\end{tabular}',kind:'table'}); return {ok:r.ok,error:(r.error||'').slice(-100)}; })()"));
  log('snippet tikz', await evalJs("(async()=>{ const r=await window.texora.tex.snippet({code:'\\\\begin{tikzpicture}\\\\draw (0,0)--(1,1);\\\\end{tikzpicture}',kind:'tikz'}); return {ok:r.ok,error:(r.error||'').slice(-100)}; })()"));
  await shot('.capture/fix/paper-zones.png');
}
