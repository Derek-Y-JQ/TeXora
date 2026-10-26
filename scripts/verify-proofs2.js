export default async function t({ evalJs, sleep }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await evalJs("(async()=>{ await window.__texora.cmd('doc.open', window.__texora.state.project.root + '\\\\appendix\\\\proofs.tex'); return true; })()");
  for(let i=0;i<70;i++){ await sleep(1000); const d=await evalJs("window.__zoneDebug"); if(d) break; }
  log('zones', await evalJs("document.querySelectorAll('.math-zone').length"));
  log('images', await evalJs("document.querySelectorAll('.math-zone img').length"));
  log('failed', await evalJs("[...document.querySelectorAll('.math-zone.failed')].slice(0,10).map(z=>({line:z.dataset.line,msg:z.textContent.slice(0,90)}))"));
  log('debug', await evalJs("window.__zoneDebug"));
  // hover align 26
  await evalJs("window.__texora.editor.hideHover(); window.__texora.editor.showHoverAt({lineNumber:26,column:5})");
  await sleep(3000);
  log('align hover', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h&&h.style.display!=='none'?{img:h.querySelectorAll('img').length,t:h.textContent.slice(0,100)}:null; })()"));
  // hover line 108 body
  await evalJs("window.__texora.editor.hideHover(); window.__texora.editor.showHoverAt({lineNumber:108,column:10})");
  await sleep(3000);
  log('108 hover', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h&&h.style.display!=='none'?{img:h.querySelectorAll('img').length,t:h.textContent.slice(0,100)}:null; })()"));
}
