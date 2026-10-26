export default async function t({ evalJs, sleep, send }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  log('version', await evalJs("window.__texora.state.capture?.version"));
  await sleep(2500);
  log('outline', await evalJs("({n:window.__texora.state.projectOutline?.length,files:[...new Set((window.__texora.state.projectOutline||[]).map(x=>x.rel))].length})"));
  log('fonts', await evalJs("(async()=>{const r=await window.texora.systemFonts();return (r.fonts||[]).length;})()"));
  await evalJs("window.__texora.cmd('view.sidebar','outline')");
  await sleep(400);
  log('outline dom', await evalJs("({f:document.querySelectorAll('.outline-file').length,r:document.querySelectorAll('.outline-row').length})"));
  await evalJs("(async()=>{ await window.__texora.cmd('doc.open', window.__texora.state.project.root + '\\\\sections\\\\analysis.tex'); return true; })()");
  await sleep(2500);
  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; ed.editor.setPosition({lineNumber:m.getLineCount(),column:1}); ed.editor.focus(); ed.editor.trigger('texora','editor.action.insertLineAfter'); return true; })()");
  await send('Input.insertText',{text:'\\cite'});
  await sleep(300);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await sleep(900);
  log('cite', await evalJs("({line:window.__texora.editor.model.getLineContent(window.__texora.editor.editor.getPosition().lineNumber),rows:document.querySelectorAll('.suggest-widget .monaco-list-row').length})"));
}
