export default async function t({ evalJs, sleep, send, shot }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(2000);
  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; ed.editor.setPosition({lineNumber:31,column:1}); ed.editor.revealLineInCenter(30); ed.editor.setSelection({startLineNumber:31,startColumn:2,endLineNumber:31,endColumn:40}); ed.editor.focus(); return true; })()");
  await sleep(400);
  const p=await evalJs("(() => { const ed=window.__texora.editor; const p=ed.editor.getScrolledVisiblePosition({lineNumber:31,column:12}); const r=document.querySelector('#monaco').getBoundingClientRect(); return {x:r.left+p.left+40,y:r.top+p.top+8}; })()");
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'right',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'right',clickCount:1});
  await sleep(500);
  console.log('click',p);
  console.log('menu', await evalJs("(() => { const m=document.querySelector('#menuLayer .menu'); if(!m) return null; const r=m.getBoundingClientRect(); return {left:r.left,top:r.top,w:r.width}; })()"));
  console.log('aibar', await evalJs("document.querySelectorAll('.block-ai-bar.visible').length"));
  await shot('.capture/fix/menu-position.png');
}
