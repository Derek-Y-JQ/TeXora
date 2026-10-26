export default async function t({ evalJs, sleep }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  await evalJs("window.__texora.app.applyLocalFont('cjk','Microsoft YaHei')");
  await sleep(800);
  log('pos', await evalJs("(() => { const t=window.__texora.editor.model.getValue(); const d=t.indexOf('\\\\documentclass'); const x=t.indexOf('\\\\usepackage{xeCJK}'); const f=t.indexOf('\\\\setCJKmainfont'); const b=t.indexOf('\\\\begin{document}'); return {d,x,f,b,ok:x>d&&f>b}; })()"));
  for(let i=0;i<30;i++){ await sleep(1000); const s=await evalJs("document.querySelector('#sbBuildText').textContent"); if(/成功|失败/.test(s)){ console.log('status',s); break; } }
  console.log('problems', await evalJs("(window.__texora.state.problems||[]).filter(p=>p.severity==='error').slice(0,2)"));
}
