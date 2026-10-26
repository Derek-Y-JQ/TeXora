export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  // global search UI
  await evalJs("window.__texora.cmd('view.sidebar','search')");
  await sleep(500);
  await evalJs("window.confirm=()=>true");
  await evalJs("document.querySelector('#searchQuery').value='对流扩散'; document.querySelector('#searchReplace').value='对流-扩散'; document.querySelector('#searchQuery').dispatchEvent(new Event('input',{bubbles:true}))");
  await sleep(900);
  await evalJs("document.querySelector('#searchReplaceBtn').click()");
  await sleep(2500);
  log('toast', await evalJs("document.querySelector('.toast-title')?.textContent"));
  log('file changed', await evalJs("window.__texora.editor.model.getValue().includes('对流-扩散')"));
  // appearance
  await evalJs("(async()=>{ await window.texora.settings.set('editor.editorFont','JetBrains Mono'); await window.texora.settings.set('appearance.codeTheme','monokai'); await window.texora.settings.set('appearance.customCss','.monaco-editor .margin{opacity:.98}'); return true; })()");
  await sleep(900);
  log('font opt', await evalJs("window.__texora.editor.editor.getRawOptions().fontFamily"));
  log('theme opt', await evalJs("getComputedStyle(document.querySelector('.monaco-editor')).backgroundColor"));
  log('css applied', await evalJs("document.querySelector('#texora-custom-css')?.textContent"));
  // ai bar
  await evalJs("window.__texora.editor.editor.revealLineInCenter(92)");
  await sleep(300);
  const p=await evalJs("(() => { const ed=window.__texora.editor; const p=ed.editor.getScrolledVisiblePosition({lineNumber:92,column:4}); const r=document.querySelector('#monaco').getBoundingClientRect(); return {x:r.left+p.left+100,y:r.top+p.top+9,lineTop:r.top+p.top}; })()");
  const { send } = arguments[0];
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});
  await sleep(900);
  log('ai bar', await evalJs("(() => { const b=document.querySelector('.block-ai-bar.visible'); if(!b) return null; const r=b.getBoundingClientRect(); return {h:r.height,labels:[...b.querySelectorAll('.ai-label')].map(x=>getComputedStyle(x).display)}; })()"));
  log('bar vs line', p.lineTop);
  await shot('.capture/fix/final-ui.png');
}
