/** Focused re-tests for AI bar, auto-end, punctuation, fold, SUB. */
export default async function focused({ evalJs, shot, click, sleep, send }) {
  const out = [];
  const log = (k, v) => { console.log(k + ': ' + JSON.stringify(v)); out.push(k); };
  await evalJs("(async () => { await window.texora.settings.reset(null); return true; })()");
  await sleep(600);
  await evalJs("window.__texora.cmd('build.run')");
  for (let i = 0; i < 50; i++) { if ((await evalJs("document.querySelectorAll('.pdf-page').length")) > 0) break; await sleep(700); }
  await sleep(1200);

  // ---- AI bar reachable + clickable
  await evalJs("window.__texora.editor.editor.revealLineInCenter(93)");
  await sleep(500);
  const pt = await evalJs("(() => { const ed=window.__texora.editor; const p=ed.editor.getScrolledVisiblePosition({lineNumber:93,column:6}); const r=document.querySelector('#monaco').getBoundingClientRect(); return {x:r.left+p.left+80,y:r.top+p.top+8}; })()");
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
  await sleep(800);
  log('ai bar visible', await evalJs("document.querySelectorAll('.block-ai-bar.visible').length"));
  const bar = await evalJs("(() => { const b=document.querySelector('.block-ai-bar.visible'); if(!b) return null; const r=b.getBoundingClientRect(); return {x:r.left+r.width*0.3,y:r.top+r.height/2}; })()");
  if (bar) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bar.x, y: bar.y });
    await sleep(800);
    log('ai bar after move', await evalJs("document.querySelectorAll('.block-ai-bar.visible').length"));
    await evalJs("(() => { const b=document.querySelector('.block-ai-bar.visible button'); if (b) b.click(); return !!b; })()");
    await sleep(900);
    log('ai action modal', await evalJs("(document.querySelector('.modal-title')?.textContent||'').trim()"));
    await evalJs("(document.querySelector('.modal-close')||{}).click?.()");
    await sleep(300);
  }
  await shot('.capture/fix/ai-bar2.png');

  // ---- clean \begin + Enter + accept
  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; ed.editor.setPosition({lineNumber:m.getLineCount(),column:1}); ed.editor.focus(); return true; })()");
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(200);
  await send('Input.insertText', { text: '\\begin' });
  await sleep(120);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(800);
  log('line after begin+enter', await evalJs("window.__texora.editor.model.getLineContent(window.__texora.editor.editor.getPosition().lineNumber)"));
  await send('Input.insertText', { text: 'equ' });
  await sleep(700);
  log('rows filtered', await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length"));
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(1200);
  log('env lines', await evalJs("(() => { const m=window.__texora.editor.model; const p=window.__texora.editor.editor.getPosition(); const r=[]; for(let i=p.lineNumber-2;i<=p.lineNumber+3 && i<=m.getLineCount();i++) if(i>0) r.push(i+':'+m.getLineContent(i)); return r; })()"));
  await shot('.capture/fix/autoend.png');

  // ---- punctuation on a clean line
  await evalJs("(() => { const ed=window.__texora.editor; ed.editor.setPosition({lineNumber:ed.model.getLineCount(),column:1}); ed.editor.trigger('texora','editor.action.insertLineAfter'); return true; })()");
  await send('Input.insertText', { text: '测试，句子（括号）。结束。' });
  await sleep(300);
  await evalJs("window.__texora.cmd('format.punctHalf')");
  await sleep(600);
  log('punct half', await evalJs("(() => { const m=window.__texora.editor.model; for(let i=1;i<=m.getLineCount();i++){ const l=m.getLineContent(i); if(l.includes('测试')) return l; } return ''; })()"));
  await evalJs("window.__texora.cmd('format.punctFull')");
  await sleep(600);
  log('punct full', await evalJs("(() => { const m=window.__texora.editor.model; for(let i=1;i<=m.getLineCount();i++){ const l=m.getLineContent(i); if(l.includes('测试')) return l; } return ''; })()"));

  // ---- SUB badge after expanding sections
  await click('[data-panel="files"]');
  await sleep(300);
  await evalJs("(() => { const rows=[...document.querySelectorAll('.tree-row')]; const r=rows.find(x=>x.textContent.includes('sections')); if(r) r.click(); return !!r; })()");
  await sleep(500);
  log('SUB badges', await evalJs("document.querySelectorAll('.tree-tag.sub').length"));
  log('SUB texts', await evalJs("[...document.querySelectorAll('.tree-tag.sub')].map(e=>e.parentElement.textContent.trim().slice(0,40))"));
  await shot('.capture/fix/sub2.png');

  // ---- fold via keyboard and check \end remains
  await evalJs("(() => { const ed=window.__texora.editor; ed.editor.setPosition({lineNumber:43,column:1}); ed.editor.focus(); return true; })()");
  await sleep(200);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '[', code: 'BracketLeft', windowsVirtualKeyCode: 219, modifiers: 2 | 8 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '[', code: 'BracketLeft', windowsVirtualKeyCode: 219, modifiers: 2 | 8 });
  await sleep(600);
  log('folded geometry', await evalJs("(() => { const lines=[...document.querySelectorAll('.view-line')].map(l=>l.textContent.trim()); return lines.filter(t=>t.includes('begin{equation}')||t.includes('end{equation}')||t.includes('cases')); })()"));
  await shot('.capture/fix/fold.png');
  console.log('focused done');
}
