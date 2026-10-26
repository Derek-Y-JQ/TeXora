export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  await evalJs("(async()=>{ await window.__texora.cmd('doc.open', window.__texora.state.project.root + '\\\\sections\\\\analysis.tex'); return true; })()");
  await sleep(3000);
  const pos=await evalJs(`(() => { const m=window.__texora.editor.model; for(let i=1;i<=m.getLineCount();i++){ const l=m.getLineContent(i); if(l.includes('\\\\eqref{')) return {line:i,column:l.indexOf('\\\\eqref{')+4}; } return null; })()`);
  log('eqpos',pos);
  await evalJs(`window.__texora.editor.showHoverAt({lineNumber:${pos.line},column:${pos.column}})`);
  await sleep(6000);
  log('eq hover', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h?{t:h.textContent.slice(0,100),img:h.querySelectorAll('img').length}:null; })()"));
  const cref=await evalJs(`(() => { const m=window.__texora.editor.model; for(let i=1;i<=m.getLineCount();i++){ const l=m.getLineContent(i); const j=l.indexOf('\\\\Cref{'); if(j>=0) return {line:i,column:j+3}; } return null; })()`);
  log('cref pos', cref);
  await evalJs(`window.__texora.editor.showHoverAt({lineNumber:${cref.line},column:${cref.column}})`);
  await sleep(6000);
  log('cref hover', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h?{t:h.textContent.slice(0,200),img:h.querySelectorAll('img').length}:null; })()"));
  const cite=await evalJs(`(() => { const m=window.__texora.editor.model; for(let i=1;i<=m.getLineCount();i++){ const l=m.getLineContent(i); const j=l.indexOf('\\\\cite{'); if(j>=0) return {line:i,column:j+3,key:l.slice(j,j+40)}; } return null; })()`);
  log('cite pos',cite);
  await evalJs(`window.__texora.editor.showHoverAt({lineNumber:${cite.line},column:${cite.column}})`);
  await sleep(2500);
  log('cite hover', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h?{t:h.textContent.slice(0,200)}:null; })()"));
  await shot('.capture/fix/hover3.png');
}
