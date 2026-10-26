export default async function t({ evalJs, sleep, send, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  await evalJs("(async()=>{ await window.__texora.cmd('doc.open', window.__texora.state.project.root + '\\\\sections\\\\analysis.tex'); return true; })()");
  await sleep(4000);
  const info = await evalJs(`(() => {
    const m=window.__texora.editor.model;
    let eq={line:0,col:0}, cite={line:0,col:0};
    for(let i=1;i<=m.getLineCount();i++){ const l=m.getLineContent(i); const e=l.indexOf('\\\\eqref{'); if(e>=0&&!eq.line) eq={line:i,col:e+2}; const c=l.indexOf('\\\\cite'); if(c>=0&&!cite.line) cite={line:i,col:c+2}; }
    return {eq,cite};
  })()`);
  log('targets', info);
  async function hoverAt(line,col){
    await evalJs(`window.__texora.editor.editor.revealLineInCenter(${line})`);
    await sleep(300);
    const p=await evalJs(`(() => { const ed=window.__texora.editor; const p=ed.editor.getScrolledVisiblePosition({lineNumber:${line},column:${col}}); const r=document.querySelector('#monaco').getBoundingClientRect(); return {x:r.left+p.left+2,y:r.top+p.top+9}; })()`);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});
    await sleep(120);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+1,y:p.y});
    await sleep(2600);
    return await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h?{text:h.textContent.slice(0,110),imgs:h.querySelectorAll('img').length}:null; })()");
  }
  if(info.eq.line) log('eqref hover', await hoverAt(info.eq.line, info.eq.col));
  if(info.cite.line) log('cite hover', await hoverAt(info.cite.line, info.cite.col));
  await shot('.capture/fix/hover-eq.png');

  // find bar
  await evalJs("window.__texora.editor.editor.focus()");
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'f',code:'KeyF',windowsVirtualKeyCode:70,modifiers:2});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'f',code:'KeyF',windowsVirtualKeyCode:70,modifiers:2});
  await sleep(500);
  log('find open', await evalJs("document.querySelector('#findBar').classList.contains('open')"));
  await send('Input.insertText',{text:'equation'});
  await sleep(700);
  log('find count', await evalJs("document.querySelector('#findCount').textContent"));
  await shot('.capture/fix/findbar.png');

  // table hover
  await evalJs("(async()=>{ await window.__texora.cmd('doc.open', window.__texora.state.project.root + '\\\\sections\\\\experiments.tex'); return true; })()");
  await sleep(3500);
  const tbl = await evalJs("(() => { const p=window.__texora.state.parsed; const e=p.environments.find(x=>x.env==='table'); return e?{line:e.line,col:3}:null; })()");
  if(tbl) log('table hover', await hoverAt(tbl.line, tbl.col));
  await shot('.capture/fix/hover-table.png');

  // appearance settings
  await evalJs("(async()=>{ await window.texora.settings.set('appearance.codeTheme','one-dark'); await window.texora.settings.set('editor.editorFont','Consolas'); await window.texora.settings.set('appearance.customCss','.monaco-editor{--x:1}'); return true; })()");
  await sleep(800);
  log('custom css', await evalJs("document.querySelector('#texora-custom-css')?.textContent"));
  log('theme', await evalJs("window.__texora.state.settings.appearance.codeTheme"));
  await evalJs("(async()=>{ await window.texora.settings.set('appearance.codeTheme','auto'); await window.texora.settings.set('appearance.customCss',''); return true; })()");
}
