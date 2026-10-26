export default async function t({ evalJs, sleep, send, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await evalJs("(async()=>{ await window.__texora.cmd('doc.open', window.__texora.state.project.root + '\\\\sections\\\\analysis.tex'); return true; })()");
  await sleep(1500);
  // select text
  await evalJs("(() => { const ed=window.__texora.editor; ed.editor.setSelection({startLineNumber:25,startColumn:1,endLineNumber:25,endColumn:60}); ed.editor.revealLineInCenter(25); return true; })()");
  await sleep(500);
  const p=await evalJs("(() => { const ed=window.__texora.editor; const p=ed.editor.getScrolledVisiblePosition({lineNumber:25,column:10}); const r=document.querySelector('#monaco').getBoundingClientRect(); return {x:r.left+p.left+20,y:r.top+p.top+8}; })()");
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'right',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'right',clickCount:1});
  await sleep(600);
  log('menu', await evalJs("(() => { const m=document.querySelector('#menuLayer .menu'); return m?[...m.querySelectorAll('.menu-item')].map(x=>x.textContent.trim()):null; })()"));
  await shot('.capture/fix/contextmenu.png');
  // find case
  await evalJs("window.__texora.app.openFind(false)");
  await evalJs("document.querySelector('#findInput').value='The'; document.querySelector('#findInput').dispatchEvent(new Event('input',{bubbles:true}))");
  await sleep(500);
  log('case off', await evalJs("document.querySelector('#findCount').textContent"));
  await evalJs("document.querySelector('#findCase').click()");
  await sleep(500);
  log('case on', await evalJs("document.querySelector('#findCount').textContent"));
  log('replace buttons', await evalJs("[document.querySelector('#findReplaceOne').textContent,document.querySelector('#findReplaceAll').textContent]"));
  await shot('.capture/fix/findcase.png');
}
