export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  await evalJs("(async()=>{ await window.__texora.cmd('doc.open', window.__texora.state.project.root + '\\\\sections\\\\analysis.tex'); return true; })()");
  await sleep(3500);
  await evalJs("window.__texora.editor.showHoverAt({lineNumber:7,column:113})");
  await sleep(3000);
  log('eqref hover', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h&&h.style.display!=='none'?{text:h.textContent.slice(0,140),imgs:h.querySelectorAll('img').length}:null; })()"));
  await evalJs("window.__texora.editor.showHoverAt({lineNumber:25,column:306})");
  await sleep(2500);
  log('cite hover', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h&&h.style.display!=='none'?{text:h.textContent.slice(0,140),imgs:h.querySelectorAll('img').length}:null; })()"));
  await evalJs("(async()=>{ await window.__texora.cmd('doc.open', window.__texora.state.project.root + '\\\\sections\\\\experiments.tex'); return true; })()");
  await sleep(3000);
  const tbl=await evalJs("(() => { const e=window.__texora.state.parsed.environments.find(x=>x.env==='table'); return e?e.line:0; })()");
  await evalJs(`window.__texora.editor.showHoverAt({lineNumber:${tbl},column:3})`);
  await sleep(4000);
  log('table hover', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h&&h.style.display!=='none'?{text:h.textContent.slice(0,120),imgs:h.querySelectorAll('img').length,html:h.innerHTML.includes('img')}:null; })()"));
  await shot('.capture/fix/hover2.png');
}
