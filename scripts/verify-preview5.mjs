export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for (let i=0;i<60;i++) { if ((await evalJs("document.querySelectorAll('.pdf-page').length"))>0) break; await sleep(800); }
  await sleep(8000);
  log('pages', await evalJs("document.querySelectorAll('.pdf-page').length"));
  log('zones', await evalJs("document.querySelectorAll('.math-zone').length"));
  log('inline setting', await evalJs("window.__texora.state.settings.editor.inlineMathPreview"));
  log('snippet direct', await evalJs("(async()=>{ const r = await window.texora.tex.snippet({code:'\\\\frac{a}{b}',kind:'math'}); return {ok:r.ok, png:(r.png||'').slice(-40), w:r.width, error:(r.error||'').slice(-200)}; })()"));
  // hover formula line
  const ln = await evalJs("(() => { const p=window.__texora.state.parsed; const e=p.environments.find(x=>x.env==='equation'); return e?e.line+3:0; })()");
  await evalJs(`window.__texora.editor.editor.revealLineInCenter(${ln})`);
  await sleep(500);
  const pt = await evalJs(`(() => { const ed=window.__texora.editor; const p=ed.editor.getScrolledVisiblePosition({lineNumber:${ln},column:12}); const r=document.querySelector('#monaco').getBoundingClientRect(); return {x:r.left+p.left+3,y:r.top+p.top+8}; })()`);
  const { send } = arguments[0];
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x,y:pt.y});
  await sleep(150);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x+2,y:pt.y});
  await sleep(3500);
  log('hover display', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h ? {display:h.style.display, imgs:h.querySelectorAll('img').length, text:h.textContent.slice(0,40)} : null; })()"));
  log('page errors?', await evalJs("window.__texora.state.build.result?.ok"));
  await shot('.capture/fix/math-preview-5.png');
}
