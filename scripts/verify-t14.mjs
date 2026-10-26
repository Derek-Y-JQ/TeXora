export default async function t({ evalJs, sleep, send, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  await evalJs("(async()=>{ await window.__texora.cmd('doc.open', window.__texora.state.project.root + '\\\\sections\\\\analysis.tex'); return true; })()");
  await sleep(2500);
  // outline
  await evalJs("window.__texora.cmd('view.sidebar','outline')");
  await sleep(500);
  log('outline', await evalJs("({files:document.querySelectorAll('.outline-file').length,rows:document.querySelectorAll('.outline-row').length,first:[...document.querySelectorAll('.outline-file span')].slice(0,4).map(x=>x.textContent)})"));
  // cref enter
  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; ed.editor.setPosition({lineNumber:m.getLineCount(),column:1}); ed.editor.focus(); return true; })()");
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await sleep(150);
  for(const ch of ['\\','c','r','e','f']){ await send('Input.dispatchKeyEvent',{type:'keyDown',key:ch,text:ch,windowsVirtualKeyCode:ch.charCodeAt(0)}); await send('Input.dispatchKeyEvent',{type:'keyUp',key:ch,windowsVirtualKeyCode:ch.charCodeAt(0)}); await sleep(50); }
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await sleep(900);
  log('cref line', await evalJs("window.__texora.editor.model.getLineContent(window.__texora.editor.editor.getPosition().lineNumber)"));
  log('cref rows', await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length"));
  log('cref labels', await evalJs("[...document.querySelectorAll('.suggest-widget .monaco-list-row')].slice(0,5).map(x=>x.textContent.trim().slice(0,30))"));
  await shot('.capture/fix/cref-popup.png');
  // font/theme settings
  await evalJs("window.__texora.cmd('settings.open','appearance')");
  await sleep(800);
  log('theme opts', await evalJs("[...document.querySelectorAll('[data-setting=\"appearance.codeTheme\"] option')].map(o=>o.textContent)"));
  log('font opts', await evalJs("document.querySelectorAll('[data-setting=\"editor.editorFont\"] option').length"));
  await evalJs("(async()=>{ await window.texora.settings.set('appearance.codeTheme','github-light'); await window.texora.settings.set('editor.editorFont','Consolas'); return true; })()");
  await sleep(700);
  log('bg', await evalJs("getComputedStyle(document.querySelector('.monaco-editor')).backgroundColor"));
  log('fonts', await evalJs("(await window.texora.app.systemFonts()).fonts.slice(0,8)"));
  await shot('.capture/fix/light-theme.png');
}
