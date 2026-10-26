export default async function t({ evalJs, sleep, send, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<25;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  log('version', await evalJs("window.__texora.state.capture?.version"));
  log('find bar', await evalJs("!!document.querySelector('#findBar')"));
  log('wrap group', await evalJs("document.querySelector('#wrapBtn')?.closest('.ribbon-group')?.querySelector('.ribbon-label')?.textContent"));
  log('brand bg', await evalJs("getComputedStyle(document.querySelector('.brand-mark')).backgroundImage"));
  for(let i=0;i<20;i++){ await sleep(1000); if((await evalJs("Object.keys(window.__texora.state.envDefs||{}).length"))>0) break; }
  log('envDefs', await evalJs("Object.keys(window.__texora.state.envDefs||{}).length"));
  await evalJs("(async()=>{ await window.__texora.cmd('doc.open', window.__texora.state.project.root + '\\\\sections\\\\analysis.tex'); return true; })()");
  for(let i=0;i<20;i++){ await sleep(1500); if((await evalJs("document.querySelectorAll('.math-zone').length"))>0) break; }
  log('zones', await evalJs("document.querySelectorAll('.math-zone').length"));
  const pos=await evalJs(`(() => { const m=window.__texora.editor.model; for(let i=1;i<=m.getLineCount();i++){ const l=m.getLineContent(i); const j=l.indexOf('\\\\eqref{'); if(j>=0) return {line:i,column:j+4}; } return null; })()`);
  if(pos){ await evalJs(`window.__texora.editor.showHoverAt({lineNumber:${pos.line},column:${pos.column}})`); await sleep(5000); log('eqref', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h?{img:h.querySelectorAll('img').length,t:h.textContent.slice(0,80)}:null; })()")); }
  await shot('.capture/fix/packaged120.png');
}
