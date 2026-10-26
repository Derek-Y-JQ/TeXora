export default async function t({ evalJs, sleep, send }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await evalJs("(() => { const ed=window.__texora.editor; ed.editor.setSelection({startLineNumber:25,startColumn:1,endLineNumber:25,endColumn:30}); ed.editor.revealLineInCenter(25); return true; })()");
  await sleep(400);
  const p=await evalJs("(() => { const ed=window.__texora.editor; const p=ed.editor.getScrolledVisiblePosition({lineNumber:25,column:10}); const r=document.querySelector('#monaco').getBoundingClientRect(); return {x:r.left+p.left+20,y:r.top+p.top+8}; })()");
  const { send } = arguments[0];
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'right',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'right',clickCount:1});
  await sleep(500);
  console.log('menus', await evalJs("[...document.querySelectorAll('.monaco-menu,.monaco-menu-container,.context-view')].map(x=>({cls:x.className,display:getComputedStyle(x).display,vis:x.offsetParent!==null})).slice(0,6)"));
  console.log('opt', await evalJs("window.__texora.editor.editor.getOption(window.__monaco.editor.EditorOption.contextmenu)"));
}
