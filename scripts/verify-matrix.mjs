export default async function t({ evalJs, sleep, send }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  async function flow(label) {
    await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; ed.editor.setPosition({lineNumber:m.getLineCount(),column:1}); ed.editor.focus(); return true; })()");
    await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
    await send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
    await sleep(150);
    for (const ch of ['\\','b','e','g','i','n']) { await send('Input.dispatchKeyEvent', { type:'keyDown', key:ch, text:ch, windowsVirtualKeyCode:ch.charCodeAt(0) }); await send('Input.dispatchKeyEvent', { type:'keyUp', key:ch, windowsVirtualKeyCode:ch.charCodeAt(0) }); await sleep(40); }
    await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
    await send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
    await sleep(700);
    log(label+' rows after enter', await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length"));
    for (const ch of ['e','q']) { await send('Input.dispatchKeyEvent', { type:'keyDown', key:ch, text:ch, windowsVirtualKeyCode:ch.charCodeAt(0) }); await send('Input.dispatchKeyEvent', { type:'keyUp', key:ch, windowsVirtualKeyCode:ch.charCodeAt(0) }); await sleep(250); }
    await sleep(400);
    log(label+' rows after eq', await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length"));
    log(label+' line', await evalJs("window.__texora.editor.model.getLineContent(window.__texora.editor.editor.getPosition().lineNumber)"));
    await evalJs("(async () => { const d=window.__texora.state.docs.get(window.__texora.state.activePath); if(d) d.dirty=false; await window.__texora.app.reloadDocument(); return true; })()");
    await sleep(500);
  }
  await flow('baseline');
  await evalJs("(async () => { await window.texora.settings.set('editor.blockMode', false); return true; })()");
  await sleep(500);
  await flow('block-off');
  await evalJs("(async () => { await window.texora.settings.set('editor.blockMode', true); await window.texora.settings.set('editor.autoCloseEnd', false); return true; })()");
  await sleep(500);
  await flow('autoclose-off');
  await evalJs("(async () => { await window.texora.settings.set('editor.autoCloseEnd', true); return true; })()");
}
