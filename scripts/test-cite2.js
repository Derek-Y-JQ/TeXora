export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; ed.editor.setPosition({lineNumber:m.getLineCount(),column:1}); ed.editor.focus(); ed.editor.trigger('texora','editor.action.insertLineAfter'); return true; })()");
  await evalJs("window.__texora.editor.editor.executeEdits('t',[{range:{startLineNumber:window.__texora.editor.editor.getPosition().lineNumber,startColumn:1,endLineNumber:window.__texora.editor.editor.getPosition().lineNumber,endColumn:1},text:'\\\\cite{}'}],()=>null); window.__texora.editor.editor.setPosition({lineNumber:window.__texora.editor.editor.getPosition().lineNumber,column:7});");
  await sleep(200);
  await evalJs("window.__texora.editor.editor.trigger('texora','editor.action.triggerSuggest',{})");
  await sleep(900);
  console.log('rows', await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length"));
  console.log('labels', await evalJs("[...document.querySelectorAll('.suggest-widget .monaco-list-row')].map(x=>x.textContent.trim().slice(0,30))"));
}
