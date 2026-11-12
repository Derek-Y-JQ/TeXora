export default async function t({ evalJs, sleep, send }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await evalJs("(async()=>{await window.__texora.cmd('doc.open', window.__texora.state.project.root+'\\\\chapters\\\\chapter2.tex');return true})()");
  await sleep(1500);
  await evalJs("window.__texora.state.settings.ai.apiKey='test'; window.__cap=null; window.__texora.api.ai.chat=async({messages})=>{window.__cap=messages; return {ok:true,text:'ok'}}; window.__texora.editor.editor.revealLineInCenter(82)");
  await sleep(500);
  const p=await evalJs("(() => { const ed=window.__texora.editor.editor; const p=ed.getScrolledVisiblePosition({lineNumber:82,column:8}); const r=document.querySelector('#monaco').getBoundingClientRect(); return {x:r.left+p.left+20,y:r.top+p.top+8}; })()");
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y}); await sleep(600);
  const b=await evalJs("(() => { const r=document.querySelector('.block-ai-bar').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()");
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:b.x,y:b.y}); await sleep(400);
  await evalJs("document.querySelector('.block-ai-bar button').click()"); await sleep(800);
  console.log('cap', await evalJs("window.__cap && window.__cap[0].content.slice(0,700)"));
  console.log('thread', await evalJs("window.__texora.sidebar.aiThread?.slice(-2).map(x=>x.text?.slice(0,100))"));
}
