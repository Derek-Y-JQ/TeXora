export default async function t({ evalJs, sleep, send }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; ed.editor.setPosition({lineNumber:m.getLineCount(),column:1}); ed.editor.focus(); ed.editor.trigger('texora','editor.action.insertLineAfter'); return true; })()");
  await send('Input.insertText',{text:'\\cite'});
  await sleep(300);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await sleep(800);
  console.log('line', await evalJs("window.__texora.editor.model.getLineContent(window.__texora.editor.editor.getPosition().lineNumber)"));
  console.log('rows', await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length"));
  console.log('first', await evalJs("[...document.querySelectorAll('.suggest-widget .monaco-list-row')].slice(0,3).map(x=>x.textContent.trim().slice(0,30))"));
}
