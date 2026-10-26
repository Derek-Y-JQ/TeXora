export default async function t({ evalJs, sleep, send, click, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  // real mouse click helper
  async function realClick(sel) {
    const p = await evalJs(`(() => { const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
    if (!p) return 'missing';
    await send('Input.dispatchMouseEvent', { type:'mousePressed', x:p.x, y:p.y, button:'left', clickCount:1 });
    await send('Input.dispatchMouseEvent', { type:'mouseReleased', x:p.x, y:p.y, button:'left', clickCount:1 });
    await sleep(400);
    return 'ok';
  }
  // menu toggle with real clicks
  await realClick('#engineBtn');
  log('engine menu after 1st real click', await evalJs("document.querySelectorAll('#menuLayer .menu').length"));
  await realClick('#engineBtn');
  log('engine menu after 2nd real click', await evalJs("document.querySelectorAll('#menuLayer .menu').length"));
  await realClick('#sizeBtn');
  log('size menu open', await evalJs("document.querySelectorAll('#menuLayer .menu').length"));
  await realClick('#engineBtn');
  log('menu after switching to engine', await evalJs("(document.querySelector('#menuLayer .menu')?.textContent||'').slice(0,30)"));
  await realClick('#engineBtn');
  log('engine closed again', await evalJs("document.querySelectorAll('#menuLayer .menu').length"));

  // backslash popup
  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; ed.editor.setPosition({lineNumber:m.getLineCount(),column:1}); ed.editor.focus(); return true; })()");
  await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await sleep(150);
  await send('Input.dispatchKeyEvent', { type:'keyDown', key:'\\', text:'\\', windowsVirtualKeyCode:220 });
  await send('Input.dispatchKeyEvent', { type:'keyUp', key:'\\', windowsVirtualKeyCode:220 });
  await sleep(900);
  log('rows after backslash', await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length"));
  log('labels after backslash', await evalJs("[...document.querySelectorAll('.suggest-widget .monaco-list-row')].slice(0,5).map(e=>e.textContent.trim().slice(0,18))"));
  for (const ch of ['b','e','g']) { await send('Input.dispatchKeyEvent', { type:'keyDown', key:ch, text:ch, windowsVirtualKeyCode:ch.charCodeAt(0) }); await send('Input.dispatchKeyEvent', { type:'keyUp', key:ch, windowsVirtualKeyCode:ch.charCodeAt(0) }); await sleep(150); }
  await sleep(500);
  log('rows after \\beg', await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length"));
  await shot('.capture/fix/backslash.png');

  // begin{a} + select align via arrows + Enter
  await evalJs("(async () => { const d=window.__texora.state.docs.get(window.__texora.state.activePath); if(d) d.dirty=false; await window.__texora.app.reloadDocument(); return true; })()");
  await sleep(600);
  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; ed.editor.setPosition({lineNumber:m.getLineCount(),column:1}); ed.editor.focus(); return true; })()");
  await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await sleep(150);
  for (const ch of ['\\','b','e','g','i','n','{','a']) {
    await send('Input.dispatchKeyEvent', { type:'keyDown', key:ch, text:ch, windowsVirtualKeyCode: ch === '{' ? 219 : ch.charCodeAt(0) });
    await send('Input.dispatchKeyEvent', { type:'keyUp', key:ch, windowsVirtualKeyCode: ch === '{' ? 219 : ch.charCodeAt(0) });
    await sleep(120);
  }
  await sleep(900);
  log('line before select', await evalJs("window.__texora.editor.model.getLineContent(window.__texora.editor.editor.getPosition().lineNumber)"));
  log('rows begin{a}', await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length"));
  log('focused before', await evalJs("(document.querySelector('.suggest-widget .monaco-list-row.focused')?.textContent||'').slice(0,20)"));
  for (let i=0;i<4;i++) { await send('Input.dispatchKeyEvent', { type:'keyDown', key:'ArrowDown', code:'ArrowDown', windowsVirtualKeyCode:40 }); await send('Input.dispatchKeyEvent', { type:'keyUp', key:'ArrowDown', code:'ArrowDown', windowsVirtualKeyCode:40 }); await sleep(200); }
  log('focused after 4 down', await evalJs("(document.querySelector('.suggest-widget .monaco-list-row.focused')?.textContent||'').slice(0,30)"));
  await shot('.capture/fix/begin-select.png');
  await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await sleep(900);
  log('accepted lines', await evalJs("(() => { const m=window.__texora.editor.model; const p=window.__texora.editor.editor.getPosition(); const r=[]; for(let i=p.lineNumber-2;i<=p.lineNumber+3&&i<=m.getLineCount();i++) if(i>0) r.push(i+':'+m.getLineContent(i)); return r; })()"));
  // skill registered + label
  log('skills', await evalJs("(window.__texora.state.settings.ai.skills||[]).map(s=>({name:s.name,builtin:!!s.builtin,enabled:s.enabled,scope:s.scope}))"));
  log('ask label', await evalJs("(window.__texora.state.settings.ai.blockActions||[]).map(a=>a.label)"));
}
