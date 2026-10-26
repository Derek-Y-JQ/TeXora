export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  log('blocks', await evalJs("window.__texora.state.blocks.slice(0,3).map(b=>({s:b.startLine,e:b.endLine}))"));
  const ln=await evalJs("window.__texora.state.blocks[0]?.startLine||93");
  await evalJs(`window.__texora.editor.editor.revealLineInCenter(${ln})`);
  await sleep(400);
  const p=await evalJs(`(() => { const ed=window.__texora.editor; const p=ed.editor.getScrolledVisiblePosition({lineNumber:${ln},column:5}); const r=document.querySelector('#monaco').getBoundingClientRect(); return {x:r.left+p.left+120,y:r.top+p.top+10,lineTop:r.top+p.top}; })()`);
  const { send } = arguments[0];
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});
  await sleep(1200);
  log('ai', await evalJs("(() => { const b=document.querySelector('.block-ai-bar.visible'); if(!b) return null; const r=b.getBoundingClientRect(); return {h:r.height,labels:[...b.querySelectorAll('.ai-label')].map(x=>getComputedStyle(x).display),top:r.top}; })()"));
  log('lineTop', p.lineTop);
  await shot('.capture/fix/aibar-final.png');
}
