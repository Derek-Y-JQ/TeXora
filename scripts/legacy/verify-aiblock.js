export default async function t({ evalJs, sleep, send }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await evalJs("(async()=>{await window.__texora.cmd('doc.open', window.__texora.state.project.root+'\\\\chapters\\\\chapter2.tex');return true})()");
  await sleep(1500);
  if(!(await evalJs("window.__texora.state.settings.editor.wordWrap"))) await evalJs("window.__texora.cmd('view.toggleWordWrap')");
  await evalJs("window.__texora.editor.editor.revealLineInCenter(82)"); await sleep(600);
  const p=await evalJs("(() => { const ed=window.__texora.editor.editor; const p=ed.getScrolledVisiblePosition({lineNumber:82,column:8}); const r=document.querySelector('#monaco').getBoundingClientRect(); return {x:r.left+p.left+20,y:r.top+p.top+8}; })()");
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});
  await sleep(700);
  console.log('hover', await evalJs("window.__texora.editor.hoveredBlock && {start:window.__texora.editor.hoveredBlock.startLine,end:window.__texora.editor.hoveredBlock.endLine,text:window.__texora.editor.hoveredBlock.text.slice(0,60)}"));
  console.log('bar', await evalJs("({visible:document.querySelector('.block-ai-bar').classList.contains('visible'),buttons:[...document.querySelectorAll('.block-ai-bar button')].map(b=>b.dataset.action)})"));
  await evalJs("window.__aiOpts=null; const o=window.__texora.ai.runBlockAction; window.__texora.ai.runBlockAction=(opts)=>{window.__aiOpts=opts; return Promise.resolve();}");
  await evalJs("document.querySelector('.block-ai-bar button').click()");
  await sleep(700);
  console.log('opts', await evalJs("window.__aiOpts && {start:window.__aiOpts.block?.startLine,end:window.__aiOpts.block?.endLine,text:window.__aiOpts.block?.text?.slice(0,60)}"));
}
