export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  await evalJs("(async()=>{ await window.__texora.cmd('doc.open', window.__texora.state.project.root + '\\\\sections\\\\analysis.tex'); return true; })()");
  await sleep(4000);
  console.log('line7', await evalJs("window.__texora.editor.model.getLineContent(7).slice(80,150)"));
  console.log('labelIndex', await evalJs("Object.keys(window.__texora.state.labelIndex||{}).filter(k=>k.includes('cbsde')||k.includes('aposteriori')).map(k=>[k,window.__texora.state.labelIndex[k]])"));
  await evalJs("window.__texora.editor.showHoverAt({lineNumber:7,column:113})");
  await sleep(8000);
  console.log('hover', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h?{disp:h.style.display,text:h.textContent.slice(0,160)}:null; })()"));
}
