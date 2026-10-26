export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  await evalJs("(async()=>{ await window.__texora.cmd('doc.open', window.__texora.state.project.root + '\\\\sections\\\\analysis.tex'); return true; })()");
  await sleep(3000);
  const cite=await evalJs(`(() => { const m=window.__texora.editor.model; for(let i=1;i<=m.getLineCount();i++){ const l=m.getLineContent(i); const re=/\\\\cite\\{[^}]+\\}/g; let x,last=null; while((x=re.exec(l))) last=x; if(last) return {line:i,column:last.index+4,key:last[0]}; } return null; })()`);
  log('cite',cite);
  if(cite){ await evalJs(`window.__texora.editor.showHoverAt({lineNumber:${cite.line},column:${cite.column}})`); await sleep(2200); log('cite hover', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h?{t:h.textContent.slice(0,150)}:null; })()")); }
  const env=await evalJs("(() => { const e=window.__texora.state.parsed.environments.find(x=>x.env==='assumption'); return e?{line:e.line,column:8}:null; })()");
  if(env){ await evalJs(`window.__texora.editor.showHoverAt({lineNumber:${env.line},column:${env.column}})`); await sleep(1200); log('env hover', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h?{t:h.textContent.slice(0,120)}:null; })()")); }
  await shot('.capture/fix/env-hover.png');
  // AI bar + brand in demo
  await evalJs("(async()=>{ await window.texora.project.open(window.__texora.state.project.root.replace('samples\\\\paper','samples\\\\demo')); return true; })()");
  await sleep(4000);
  await evalJs("window.__texora.editor.editor.revealLineInCenter(93)");
  await sleep(300);
  const p=await evalJs("(() => { const ed=window.__texora.editor; const p=ed.editor.getScrolledVisiblePosition({lineNumber:93,column:6}); const r=document.querySelector('#monaco').getBoundingClientRect(); return {x:r.left+p.left+90,y:r.top+p.top+9}; })()");
  const { send } = arguments[0];
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});
  await sleep(1200);
  log('ai bar', await evalJs("(() => { const b=document.querySelector('.block-ai-bar.visible'); return b?{labels:[...b.querySelectorAll('.ai-label')].map(x=>getComputedStyle(x).display),rect:b.getBoundingClientRect().height}:null; })()"));
  await shot('.capture/fix/aibar-new.png');
}
