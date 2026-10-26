export default async function t({ evalJs, sleep }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  await evalJs("(async()=>{ await window.__texora.cmd('doc.open', window.__texora.state.project.root + '\\\\sections\\\\analysis.tex'); return true; })()");
  await sleep(2500);
  const hit=await evalJs(`(() => { const m=window.__texora.editor.model; for(let i=1;i<=m.getLineCount();i++){ const l=m.getLineContent(i); const x=l.match(/\\\\cite\\{([^}]*,[^}]*)\\}/); if(x) return {line:i,column:l.indexOf(x[0])+4,key:x[1]}; } return null; })()`);
  log('multi cite', hit);
  if(hit){ await evalJs(`window.__texora.editor.showHoverAt({lineNumber:${hit.line},column:${hit.column}})`); await sleep(1600); log('hover', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h?{t:h.textContent.slice(0,240),hrs:h.querySelectorAll('hr').length}:null; })()")); }
}
