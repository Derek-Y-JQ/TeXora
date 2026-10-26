export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  log('doc', await evalJs("window.__texora.state.activePath"));
  await evalJs("window.__texora.app.applyLocalFont('cjk','Microsoft YaHei')");
  await sleep(800);
  log('font position', await evalJs("(() => { const t=window.__texora.editor.model.getValue(); const b=t.indexOf('\\\\begin{document}'); const i=t.indexOf('\\\\setCJKmainfont'); const d=t.indexOf('\\\\documentclass'); const x=t.indexOf('\\\\usepackage{xeCJK}'); return {doc:d,font:i,begin:b,xe:x,ok:i>d&&i<b,head:t.slice(Math.max(0,i-120),i+50)}; })()"));
  log('compile', await evalJs("(async()=>{ const r=await window.__texora.cmd('build.run'); return true; })()"));
  await sleep(12000);
  log('status', await evalJs("document.querySelector('#sbBuildText').textContent"));
  await shot('.capture/fix/font2.png');
}
