export default async function t({ evalJs, sleep, send }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  async function realClick(sel) {
    const p = await evalJs(`(() => { const e=document.querySelector(${JSON.stringify(sel)}); const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
    await send('Input.dispatchMouseEvent', { type:'mousePressed', x:p.x, y:p.y, button:'left', clickCount:1 });
    await send('Input.dispatchMouseEvent', { type:'mouseReleased', x:p.x, y:p.y, button:'left', clickCount:1 });
    await sleep(350);
  }
  await realClick('#engineBtn');
  await realClick('#sizeBtn');
  log('switch menu title', await evalJs("(document.querySelector('#menuLayer .menu')?.textContent||'').slice(0,20)"));
  // click outside closes
  await send('Input.dispatchMouseEvent', { type:'mousePressed', x:800, y:600, button:'left', clickCount:1 });
  await send('Input.dispatchMouseEvent', { type:'mouseReleased', x:800, y:600, button:'left', clickCount:1 });
  await sleep(300);
  log('outside closes', await evalJs("document.querySelectorAll('#menuLayer .menu').length"));
  // begin{a} + Enter accept first (align)
  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; ed.editor.setPosition({lineNumber:m.getLineCount(),column:1}); ed.editor.focus(); return true; })()");
  await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await sleep(150);
  for (const ch of ['\\','b','e','g','i','n','{','a']) { await send('Input.dispatchKeyEvent', { type:'keyDown', key:ch, text:ch, windowsVirtualKeyCode: ch==='{'?219:ch.charCodeAt(0) }); await send('Input.dispatchKeyEvent', { type:'keyUp', key:ch, windowsVirtualKeyCode: ch==='{'?219:ch.charCodeAt(0) }); await sleep(120); }
  await sleep(800);
  log('focused', await evalJs("(document.querySelector('.suggest-widget .monaco-list-row.focused')?.textContent||'').slice(0,16)"));
  await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await sleep(900);
  log('accepted', await evalJs("(() => { const m=window.__texora.editor.model; const p=window.__texora.editor.editor.getPosition(); const r=[]; for(let i=p.lineNumber-2;i<=p.lineNumber+3&&i<=m.getLineCount();i++) if(i>0) r.push(i+':'+m.getLineContent(i)); return r; })()"));
  log('skill', await evalJs("(window.__texora.state.settings.ai.skills||[]).map(s=>s.name+'/'+(s.builtin?'builtin':'user')+'/'+s.enabled)"));
}
