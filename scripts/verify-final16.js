export default async function t({ evalJs, sleep, send, shot }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(5000);
  console.log('pdf status', await evalJs("document.querySelector('#sbBuildText').textContent"));
  console.log('pdf pages', await evalJs("document.querySelectorAll('.pdf-page').length"));
  await evalJs("(async()=>{ await window.__texora.cmd('doc.open', window.__texora.state.project.root + '\\\\sections\\\\analysis.tex'); return true; })()");
  await sleep(1500);
  await evalJs("(() => { const ed=window.__texora.editor; ed.editor.setSelection({startLineNumber:25,startColumn:1,endLineNumber:25,endColumn:30}); ed.editor.revealLineInCenter(25); return true; })()");
  await sleep(400);
  const p=await evalJs("(() => { const ed=window.__texora.editor; const p=ed.editor.getScrolledVisiblePosition({lineNumber:25,column:10}); const r=document.querySelector('#monaco').getBoundingClientRect(); return {x:r.left+p.left+20,y:r.top+p.top+8}; })()");
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'right',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'right',clickCount:1});
  await sleep(400);
  console.log('native menus', await evalJs("document.querySelectorAll('.monaco-menu-container').length"));
  await shot('.capture/fix/ctx-final.png');
  await evalJs("(async()=>{ await window.texora.settings.set('appearance.codeTheme','one-light'); return true; })()");
  await sleep(600);
  await shot('.capture/fix/one-light.png');
}
