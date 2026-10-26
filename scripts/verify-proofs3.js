export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await evalJs("(async()=>{ await window.__texora.cmd('doc.open', window.__texora.state.project.root + '\\\\appendix\\\\proofs.tex'); return true; })()");
  await sleep(2500);
  await evalJs("window.__texora.editor.hideHover(); window.__texora.editor.hoverState=null; window.__texora.editor.showHoverAt({lineNumber:26,column:5})");
  await sleep(3000);
  console.log('align hover', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h&&h.style.display!=='none'?{img:h.querySelectorAll('img').length,t:h.textContent.slice(0,90)}:null; })()"));
  await evalJs("window.__texora.editor.hideHover(); window.__texora.editor.hoverState=null; window.__texora.editor.showHoverAt({lineNumber:108,column:10})");
  await sleep(3000);
  console.log('108 hover', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h&&h.style.display!=='none'?{img:h.querySelectorAll('img').length,t:h.textContent.slice(0,90)}:null; })()"));
}
