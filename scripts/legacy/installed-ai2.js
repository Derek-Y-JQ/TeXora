export default async function t({ evalJs, sleep, send }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await evalJs("(async()=>{await window.__texora.cmd('doc.open', window.__texora.state.project.root+'\\\\chapters\\\\chapter2.tex');return true})()");
  await sleep(1200); await evalJs("window.__texora.editor.editor.revealLineInCenter(82)"); await sleep(500);
  const p=await evalJs("(() => { const ed=window.__texora.editor.editor; const p=ed.getScrolledVisiblePosition({lineNumber:82,column:8}); const r=document.querySelector('#monaco').getBoundingClientRect(); return {x:r.left+p.left+20,y:r.top+p.top+8}; })()");
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y}); await sleep(700);
  console.log('visible1', await evalJs("({v:document.querySelector('.block-ai-bar').classList.contains('visible'),pe:getComputedStyle(document.querySelector('.block-ai-bar')).pointerEvents,btn:document.querySelectorAll('.block-ai-bar button').length})"));
  const b=await evalJs("(() => { const r=document.querySelector('.block-ai-bar').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()");
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:b.x,y:b.y}); await sleep(400);
  console.log('visible2', await evalJs("({v:document.querySelector('.block-ai-bar').classList.contains('visible'),pe:getComputedStyle(document.querySelector('.block-ai-bar')).pointerEvents,btn:document.querySelectorAll('.block-ai-bar button').length})"));
  await evalJs("window.__x=null; const o=window.__texora.ai.runBlockAction; window.__texora.ai.runBlockAction=(opts)=>{window.__x=opts; return Promise.resolve()}; document.querySelector('.block-ai-bar button').click()");
  await sleep(400);
  console.log('x', await evalJs("window.__x && window.__x.block?.startLine"));
}
