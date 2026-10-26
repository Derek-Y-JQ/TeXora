export default async function t({ evalJs, sleep, send, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; ed.editor.setPosition({lineNumber:m.getLineCount(),column:1}); ed.editor.focus(); return true; })()");
  for (const ch of ['\\','b','e','g','i','n']) {
    await send('Input.dispatchKeyEvent', { type:'keyDown', key:ch, text:ch, windowsVirtualKeyCode:ch.charCodeAt(0) });
    await send('Input.dispatchKeyEvent', { type:'keyUp', key:ch, windowsVirtualKeyCode:ch.charCodeAt(0) });
    await sleep(60);
  }
  await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await sleep(900);
  log('after enter line', await evalJs("window.__texora.editor.model.getLineContent(window.__texora.editor.editor.getPosition().lineNumber)"));
  log('rows after enter', await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length"));
  for (const ch of ['e','q','u']) {
    await send('Input.dispatchKeyEvent', { type:'keyDown', key:ch, text:ch, windowsVirtualKeyCode:ch.charCodeAt(0) });
    await send('Input.dispatchKeyEvent', { type:'keyUp', key:ch, windowsVirtualKeyCode:ch.charCodeAt(0) });
    await sleep(250);
  }
  await sleep(600);
  log('rows after equ', await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length"));
  log('labels', await evalJs("[...document.querySelectorAll('.suggest-widget .monaco-list-row')].slice(0,5).map(e=>e.textContent.trim().slice(0,20))"));
  await shot('.capture/fix/filter-typing2.png');
}
