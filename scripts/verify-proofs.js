export default async function t({ evalJs, sleep }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await evalJs("(async()=>{ await window.__texora.cmd('doc.open', window.__texora.state.project.root + '\\\\appendix\\\\proofs.tex'); return true; })()");
  for(let i=0;i<60;i++){ await sleep(1000); const d=await evalJs("window.__zoneDebug"); if(d && (document.querySelectorAll('.math-zone').length)) break; }
  log('zones', await evalJs("document.querySelectorAll('.math-zone').length"));
  log('failed', await evalJs("[...document.querySelectorAll('.math-zone.failed')].map(z=>z.textContent.slice(0,80)).slice(0,4)"));
  log('images', await evalJs("document.querySelectorAll('.math-zone img').length"));
  log('debug', await evalJs("window.__zoneDebug"));
  // hover align at 26
  await evalJs("window.__texora.editor.showHoverAt({lineNumber:26,column:4})");
  await sleep(2500);
  log('align hover', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h?{img:h.querySelectorAll('img').length,t:h.textContent.slice(0,80)}:null; })()"));
  // hover line 107 \[
  await evalJs("window.__texora.editor.showHoverAt({lineNumber:108,column:8})");
  await sleep(2500);
  log('line108 hover', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h?{img:h.querySelectorAll('img').length,t:h.textContent.slice(0,80)}:null; })()"));
}
