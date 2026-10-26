export default async function t({ evalJs, sleep, send, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for (let i=0;i<70;i++) { if ((await evalJs("document.querySelectorAll('.pdf-page').length"))>0) break; await sleep(800); }
  await sleep(8000);
  log('status', await evalJs("document.querySelector('#sbBuildText').textContent"));
  log('zones', await evalJs("document.querySelectorAll('.math-zone').length"));
  log('snippet', await evalJs("(async()=>{ const r=await window.texora.tex.snippet({code:'\\\\sum_{i=1}^n x_i',kind:'math'}); return {ok:r.ok,error:(r.error||'').slice(-100)}; })()"));
  const ln = await evalJs("(() => { const p=window.__texora.state.parsed; const e=p.environments.find(x=>x.env==='equation'); return e?e.line+3:0; })()");
  await evalJs(`window.__texora.editor.editor.revealLineInCenter(${ln})`);
  await sleep(500);
  const pt = await evalJs(`(() => { const ed=window.__texora.editor; const p=ed.editor.getScrolledVisiblePosition({lineNumber:${ln},column:12}); const r=document.querySelector('#monaco').getBoundingClientRect(); return {x:r.left+p.left+3,y:r.top+p.top+8}; })()`);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x,y:pt.y});
  await sleep(150);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x+2,y:pt.y});
  await sleep(3000);
  log('hover', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h?{display:h.style.display,imgs:h.querySelectorAll('img').length}:null; })()"));
  await shot('.capture/fix/packaged-preview-fixed.png');
}
