export default async function t({ evalJs, sleep }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  log('pos', await evalJs("(() => { const t=window.__texora.editor.model.getValue(); const d=t.indexOf('\\\\documentclass'); const x=t.indexOf('\\\\usepackage{xeCJK}'); const f=t.indexOf('\\\\setCJKmainfont'); const b=t.indexOf('\\\\begin{document}'); return {d,x,f,b}; })()"));
  log('status', await evalJs("document.querySelector('#sbBuildText').textContent"));
  log('err', await evalJs("(window.__texora.state.problems||[]).filter(p=>p.severity==='error').slice(0,3).map(p=>p.raw||p.message)"));
}
