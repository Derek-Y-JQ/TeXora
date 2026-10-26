export default async function t({ evalJs, sleep, send }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; ed.editor.setPosition({lineNumber:m.getLineCount(),column:1}); ed.editor.focus(); return true; })()");
  await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await sleep(150);
  for (const ch of ['\\','b','e','g','i','n']) { await send('Input.dispatchKeyEvent', { type:'keyDown', key:ch, text:ch, windowsVirtualKeyCode:ch.charCodeAt(0) }); await send('Input.dispatchKeyEvent', { type:'keyUp', key:ch, windowsVirtualKeyCode:ch.charCodeAt(0) }); await sleep(40); }
  await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await sleep(700);
  for (const ch of ['e','q','u','a','t','i','o','n']) {
    await send('Input.dispatchKeyEvent', { type:'keyDown', key:ch, text:ch, windowsVirtualKeyCode:ch.charCodeAt(0) });
    await send('Input.dispatchKeyEvent', { type:'keyUp', key:ch, windowsVirtualKeyCode:ch.charCodeAt(0) });
    await sleep(180);
    log(ch, await evalJs("({rows:document.querySelectorAll('.suggest-widget .monaco-list-row').length, line:window.__texora.editor.model.getLineContent(window.__texora.editor.editor.getPosition().lineNumber), pos:window.__texora.editor.editor.getPosition().column})"));
  }
  await sleep(400);
  log('end', await evalJs("({rows:document.querySelectorAll('.suggest-widget .monaco-list-row').length, content:window.__texora.editor.model.getValue().slice(-80)})"));
}
