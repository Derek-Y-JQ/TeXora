export default async function t({ evalJs, sleep, send }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await evalJs("(async()=>{await window.__texora.cmd('doc.open', window.__texora.state.project.root+'\\\\chapters\\\\chapter2.tex');return true})()");
  await sleep(1200); await evalJs("window.__texora.editor.editor.revealLineInCenter(82)"); await sleep(500);
  const p=await evalJs("(() => { const ed=window.__texora.editor.editor; const p=ed.getScrolledVisiblePosition({lineNumber:82,column:8}); const r=document.querySelector('#monaco').getBoundingClientRect(); return {x:r.left+p.left+20,y:r.top+p.top+8}; })()");
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y}); await sleep(600);
  console.log('pos', p);
  console.log('bar', await evalJs("(() => { const r=document.querySelector('.block-ai-bar').getBoundingClientRect(); return {r:r.toJSON(),pe:getComputedStyle(document.querySelector('.block-ai-bar')).pointerEvents,z:getComputedStyle(document.querySelector('.block-ai-bar')).zIndex}; })()"));
  console.log('linepos', await evalJs("(() => { const ed=window.__texora.editor.editor; const p=ed.getScrolledVisiblePosition({lineNumber:78,column:1}); const r=document.querySelector('#monaco').getBoundingClientRect(); return {x:r.left+p.left,y:r.top+p.top}; })()"));
}
