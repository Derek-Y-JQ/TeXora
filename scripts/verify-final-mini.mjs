export default async function t({ evalJs, sleep, send }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; ed.editor.setPosition({lineNumber:m.getLineCount(),column:1}); ed.editor.focus(); return true; })()");
  await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await sleep(150);
  for (const ch of ['h','e','l','l','o']) { await send('Input.dispatchKeyEvent', { type:'keyDown', key:ch, text:ch, windowsVirtualKeyCode:ch.charCodeAt(0) }); await send('Input.dispatchKeyEvent', { type:'keyUp', key:ch, windowsVirtualKeyCode:ch.charCodeAt(0) }); await sleep(180); }
  await sleep(500);
  log('english rows', await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length"));
  await evalJs("(async () => { const d=window.__texora.state.docs.get(window.__texora.state.activePath); if(d) d.dirty=false; await window.__texora.app.reloadDocument(); return true; })()");
  await sleep(500);
  // full env typed then pause
  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; ed.editor.setPosition({lineNumber:m.getLineCount(),column:1}); ed.editor.focus(); return true; })()");
  await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await sleep(150);
  for (const ch of ['\\','b','e','g','i','n']) { await send('Input.dispatchKeyEvent', { type:'keyDown', key:ch, text:ch, windowsVirtualKeyCode:ch.charCodeAt(0) }); await send('Input.dispatchKeyEvent', { type:'keyUp', key:ch, windowsVirtualKeyCode:ch.charCodeAt(0) }); await sleep(40); }
  await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await sleep(700);
  for (const ch of ['e','q','u','a','t','i','o','n']) { await send('Input.dispatchKeyEvent', { type:'keyDown', key:ch, text:ch, windowsVirtualKeyCode:ch.charCodeAt(0) }); await send('Input.dispatchKeyEvent', { type:'keyUp', key:ch, windowsVirtualKeyCode:ch.charCodeAt(0) }); await sleep(120); }
  await sleep(1400);
  log('auto end after pause', await evalJs("(() => { const m=window.__texora.editor.model; const p=window.__texora.editor.editor.getPosition(); const r=[]; for(let i=p.lineNumber-2;i<=p.lineNumber+3&&i<=m.getLineCount();i++) if(i>0) r.push(i+':'+m.getLineContent(i)); return r; })()"));
}
