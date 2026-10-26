export default async function t({ evalJs, sleep, send }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(4000);
  console.log('version', await evalJs("window.__texora.state.capture?.version"));
  console.log('engine', await evalJs("window.__texora.state.settings.build.engine"));
  console.log('colors', await evalJs(`(() => { const s=[...document.querySelectorAll('.view-line span')].find(x=>x.textContent.includes('Hello world')); return s?getComputedStyle(s).color:null; })()`));
  // context menu position
  await evalJs("(() => { const ed=window.__texora.editor; ed.editor.setSelection({startLineNumber:4,startColumn:1,endLineNumber:4,endColumn:20}); ed.editor.revealLineInCenter(4); return true; })()");
  await sleep(300);
  const p=await evalJs("(() => { const ed=window.__texora.editor; const p=ed.editor.getScrolledVisiblePosition({lineNumber:4,column:5}); const r=document.querySelector('#monaco').getBoundingClientRect(); return {x:r.left+p.left+30,y:r.top+p.top+8}; })()");
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'right',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'right',clickCount:1});
  await sleep(400);
  console.log('menu', await evalJs("(() => { const m=document.querySelector('#menuLayer .menu'); if(!m)return null; const r=m.getBoundingClientRect(); return {left:r.left,top:r.top}; })()"));
  console.log('click',p);
}
