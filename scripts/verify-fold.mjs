export default async function t({ evalJs, shot, sleep, send }) {
  const out=[]; const log=(k,v)=>{console.log(k+': '+JSON.stringify(v));};
  await evalJs("(async () => { const d=window.__texora.state.docs.get(window.__texora.state.activePath); if(d) d.dirty=false; await window.__texora.app.reloadDocument(); return true; })()");
  await sleep(800);
  // unfold everything via command palette-free action
  await evalJs("(() => { const ed=window.__texora.editor; ed.editor.setPosition({lineNumber:1,column:1}); ed.editor.getAction('editor.unfoldAll')?.run(); return true; })()");
  await sleep(300);
  // accept first env suggestion
  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; ed.editor.setPosition({lineNumber:m.getLineCount(),column:1}); ed.editor.focus(); return true; })()");
  await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await sleep(200);
  await send('Input.insertText', { text:'\\begin' });
  await sleep(150);
  await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await sleep(800);
  log('popup rows', await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length"));
  await send('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await send('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
  await sleep(1200);
  log('accepted lines', await evalJs("(() => { const m=window.__texora.editor.model; const p=window.__texora.editor.editor.getPosition(); const r=[]; for(let i=p.lineNumber-2;i<=p.lineNumber+3&&i<=m.getLineCount();i++) if(i>0) r.push(i+':'+m.getLineContent(i)); return r; })()"));
  await shot('.capture/fix/accept-env.png');
  // env fold: locate table env and fold it
  const tableLine = await evalJs("(() => { const p=window.__texora.state.parsed; const e=p.environments.find(x=>x.env==='table'); return e?e.line:0; })()");
  log('table line', tableLine);
  await evalJs(`(() => { const ed=window.__texora.editor; ed.editor.setPosition({lineNumber:${tableLine},column:1}); ed.editor.focus(); return true; })()`);
  await sleep(300);
  await send('Input.dispatchKeyEvent', { type:'keyDown', key:'[', code:'BracketLeft', windowsVirtualKeyCode:219, modifiers: 2|8 });
  await send('Input.dispatchKeyEvent', { type:'keyUp', key:'[', code:'BracketLeft', windowsVirtualKeyCode:219, modifiers: 2|8 });
  await sleep(700);
  log('visible table lines', await evalJs("(() => { const lines=[...document.querySelectorAll('.view-line')].map(l=>l.textContent.trim()); return lines.filter(t=>t.includes('begin{table}')||t.includes('end{table}')||t.includes('begin{tabular}')||t.includes('end{tabular}')); })()"));
  await shot('.capture/fix/fold-env.png');
}
