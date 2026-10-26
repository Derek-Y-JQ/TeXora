export default async function t({ evalJs, sleep, send, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; ed.editor.setPosition({lineNumber:m.getLineCount(),column:1}); ed.editor.focus(); return true; })()");
  for (const ch of ['\\','b','e','g','i','n']) {
    await send('Input.dispatchKeyEvent', { type:'keyDown', key:ch, text:ch, windowsVirtualKeyCode:ch.charCodeAt(0) });
    await send('Input.dispatchKeyEvent', { type:'keyUp', key:ch, windowsVirtualKeyCode:ch.charCodeAt(0) });
    await sleep(70);
  }
  await sleep(500);
  log('rows after \\begin typed', await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length"));
  for (const ch of ['e','q','u']) {
    await send('Input.dispatchKeyEvent', { type:'keyDown', key:ch, text:ch, windowsVirtualKeyCode:ch.charCodeAt(0) });
    await send('Input.dispatchKeyEvent', { type:'keyUp', key:ch, windowsVirtualKeyCode:ch.charCodeAt(0) });
    await sleep(200);
  }
  await sleep(600);
  log('rows after equ', await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length"));
  log('line', await evalJs("window.__texora.editor.model.getLineContent(window.__texora.editor.editor.getPosition().lineNumber)"));
  await shot('.capture/fix/filter-typing.png');
}
