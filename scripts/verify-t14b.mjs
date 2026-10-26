export default async function t({ evalJs, sleep, send, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(2000);
  log('sysfonts ipc', await evalJs("(async()=>{ const r=await window.texora.systemFonts(); return {ok:r.ok,n:(r.fonts||[]).length,err:r.error,first:(r.fonts||[]).slice(0,5)}; })()"));
  log('outline', await evalJs("({n:window.__texora.state.projectOutline?.length,files:[...new Set((window.__texora.state.projectOutline||[]).map(x=>x.rel))].slice(0,6)})"));
  await evalJs("window.__texora.cmd('view.sidebar','outline')");
  await sleep(500);
  log('outline dom', await evalJs("({files:document.querySelectorAll('.outline-file').length,rows:document.querySelectorAll('.outline-row').length})"));
  await evalJs("(async()=>{ await window.__texora.cmd('doc.open', window.__texora.state.project.root + '\\\\sections\\\\analysis.tex'); return true; })()");
  await sleep(2500);
  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; ed.editor.setPosition({lineNumber:m.getLineCount(),column:1}); ed.editor.focus(); return true; })()");
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await sleep(150);
  for(const ch of ['\\','c','r','e','f']){ await send('Input.dispatchKeyEvent',{type:'keyDown',key:ch,text:ch,windowsVirtualKeyCode:ch.charCodeAt(0)}); await send('Input.dispatchKeyEvent',{type:'keyUp',key:ch,windowsVirtualKeyCode:ch.charCodeAt(0)}); await sleep(50); }
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await sleep(900);
  log('line', await evalJs("window.__texora.editor.model.getLineContent(window.__texora.editor.editor.getPosition().lineNumber)"));
  log('rows', await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length"));
  log('labels', await evalJs("[...document.querySelectorAll('.suggest-widget .monaco-list-row')].slice(0,4).map(x=>x.textContent.trim().slice(0,28))"));
  await shot('.capture/fix/cref-popup2.png');
  await evalJs("window.__texora.cmd('settings.open','appearance')");
  await sleep(800);
  log('themes', await evalJs("[...document.querySelectorAll('[data-setting=\"appearance.codeTheme\"] option')].map(o=>o.textContent)"));
  log('font opts', await evalJs("document.querySelectorAll('[data-setting=\"editor.editorFont\"] option').length"));
  await evalJs("(async()=>{ await window.texora.settings.set('appearance.codeTheme','github-light'); return true; })()");
  await sleep(700);
  log('bg', await evalJs("getComputedStyle(document.querySelector('.monaco-editor')).backgroundColor"));
  await shot('.capture/fix/light2.png');
}
