export default async function t({ evalJs, sleep }) {
  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; const ln=m.getLineCount(); ed.editor.setPosition({lineNumber:ln,column:1}); ed.editor.trigger('texora','editor.action.insertLineAfter'); return true; })()");
  await evalJs("(() => { const ed=window.__texora.editor; ed.editor.executeEdits('t',[{range:{startLineNumber:ed.editor.getPosition().lineNumber,startColumn:1,endLineNumber:ed.editor.getPosition().lineNumber,endColumn:1},text:'\\\\begin{equ'}],()=>null); ed.editor.setPosition({lineNumber:ed.editor.getPosition().lineNumber,column:11}); ed.editor.focus(); return true; })()");
  await sleep(200);
  await evalJs("window.__texora.editor.editor.trigger('texora','editor.action.triggerSuggest',{})");
  await sleep(900);
  console.log('rows', await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length"));
  console.log('labels', await evalJs("[...document.querySelectorAll('.suggest-widget .monaco-list-row')].map(e=>e.textContent.trim().slice(0,30)).slice(0,5)"));
}
