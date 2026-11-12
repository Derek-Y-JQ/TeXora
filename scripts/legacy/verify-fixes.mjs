/** Verifies the 12 reported fixes. */
export default async function verifyFixes({ evalJs, shot, click, sleep, send }) {
  const out = [];
  const log = (k, v) => { const line = k + ': ' + JSON.stringify(v); out.push(line); console.log(line); };
  await evalJs("(async () => { await window.texora.settings.reset(null); return true; })()");
  await sleep(700);
  await evalJs("window.__texora.cmd('build.run')");
  for (let i = 0; i < 60; i++) {
    if ((await evalJs("document.querySelectorAll('.pdf-page').length")) > 0) break;
    await sleep(800);
  }
  await sleep(2500);

  // 1. menu toggle
  await click('#engineBtn');
  log('menu open #1', await evalJs("document.querySelectorAll('#menuLayer .menu').length"));
  await click('#engineBtn');
  log('menu open #2 (should be 0)', await evalJs("document.querySelectorAll('#menuLayer .menu').length"));

  // 2. AI bar reachable
  const pos = await evalJs(`(() => { const ed = window.__texora.editor; ed.editor.revealLineInCenter(74); const p = ed.editor.getScrolledVisiblePosition({lineNumber:74,column:10}); const r=document.querySelector('#monaco').getBoundingClientRect(); return {x:r.left+p.left+60,y:r.top+p.top+8}; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y });
  await sleep(700);
  log('ai bar visible', await evalJs("document.querySelectorAll('.block-ai-bar.visible').length"));
  const bar = await evalJs("(() => { const b=document.querySelector('.block-ai-bar.visible'); if(!b) return null; const r=b.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()");
  if (bar) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bar.x, y: bar.y });
    await sleep(600);
    log('ai bar visible after move', await evalJs("document.querySelectorAll('.block-ai-bar.visible').length"));
    await shot('.capture/fix/ai-bar.png');
  }

  // 3. completion behaviour
  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; ed.editor.setPosition({lineNumber:m.getLineCount()-2,column:1}); ed.editor.focus(); ed.editor.trigger('texora','editor.action.insertLineAfter'); return true; })()");
  await send('Input.insertText', { text: 'hello world' });
  await sleep(700);
  log('english suggest rows (want 0)', await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length"));
  await evalJs("(() => { const ed=window.__texora.editor; ed.editor.trigger('texora','undo'); return true; })()");

  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; ed.editor.setPosition({lineNumber:m.getLineCount()-2,column:1}); ed.editor.focus(); return true; })()");
  await send('Input.insertText', { text: '\\begin' });
  await sleep(150);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(900);
  log('after begin+enter line', await evalJs("window.__texora.editor.model.getLineContent(window.__texora.editor.editor.getPosition().lineNumber)"));
  log('begin suggest rows', await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length"));
  await send('Input.insertText', { text: 'equ' });
  await sleep(700);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(1000);
  const envLine = await evalJs("(() => { const m=window.__texora.editor.model; const p=window.__texora.editor.editor.getPosition(); const a=[]; for(let i=Math.max(1,p.lineNumber-2);i<=Math.min(m.getLineCount(),p.lineNumber+3);i++) a.push(i+': '+m.getLineContent(i)); return a; })()");
  log('env block', envLine);
  await shot('.capture/fix/completion.png');

  // \end + Enter matches the open environment
  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; const p=ed.editor.getPosition(); ed.editor.setPosition({lineNumber:p.lineNumber,column:1}); ed.editor.trigger('texora','editor.action.insertLineAfter'); return true; })()");
  await send('Input.insertText', { text: '\\end' });
  await sleep(120);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(500);
  log('end+enter line', await evalJs("window.__texora.editor.model.getLineContent(window.__texora.editor.editor.getPosition().lineNumber)"));

  // 4. section menu anchored to button
  const sectBtn = '[data-format="section"]';
  await click(sectBtn);
  const anchorInfo = await evalJs(`(() => { const b=document.querySelector(${JSON.stringify(sectBtn)}).getBoundingClientRect(); const m=document.querySelector('#menuLayer .menu'); if(!m) return null; const r=m.getBoundingClientRect(); return {btnLeft:Math.round(b.left), menuLeft:Math.round(r.left), menuTop:Math.round(r.top), btnBottom:Math.round(b.bottom)}; })()`);
  log('section menu anchor', anchorInfo);
  await click(sectBtn);
  log('section menu closed', await evalJs("document.querySelectorAll('#menuLayer .menu').length"));

  // 5. word wrap toggle
  await click('#wrapBtn');
  await sleep(300);
  log('wrap on', await evalJs("({setting: window.__texora.state.settings.editor.wordWrap, label: document.querySelector('#sbWrap').textContent, raw: window.__texora.editor.editor.getRawOptions().wordWrap})"));
  await click('#sbWrap');
  await sleep(300);
  log('wrap off', await evalJs("({setting: window.__texora.state.settings.editor.wordWrap, label: document.querySelector('#sbWrap').textContent})"));

  // 6. beautify
  await evalJs("window.__texora.cmd('editor.format')");
  await sleep(1200);
  log('beautify banners', await evalJs("window.__texora.editor.model.getValue().includes('导言区 · Preamble')"));
  log('beautify toast', await evalJs("(document.querySelector('.toast-title')?.textContent || '')"));
  await evalJs("(async () => { const d=window.__texora.state.docs.get(window.__texora.state.activePath); if (d) d.dirty=false; await window.__texora.app.reloadDocument(); return true; })()");
  await sleep(600);

  // 7. displaystyle preamble
  await evalJs("window.__texora.cmd('format.displaystyle')");
  await sleep(600);
  log('displaystyle block', await evalJs("(() => { const v=window.__texora.editor.model.getValue(); return {every: v.includes('\\\\everymath{\\\\displaystyle}'), limit: v.includes('\\\\lineskiplimit'), skip: v.includes('\\\\lineskip')}; })()"));
  await evalJs("(async () => { const d=window.__texora.state.docs.get(window.__texora.state.activePath); if (d) d.dirty=false; await window.__texora.app.reloadDocument(); return true; })()");
  await sleep(600);

  // 8. PDF links
  const linkCount = await evalJs("document.querySelectorAll('.pdf-link').length");
  log('pdf links', linkCount);
  if (linkCount) {
    await evalJs("document.querySelector('.pdf-link').click()");
    await sleep(700);
    log('page after link click', await evalJs("document.querySelector('#pageCurrent').textContent"));
    await shot('.capture/fix/pdf-link.png');
  }

  // 9. live preview toggle
  await click('#sbLive');
  await sleep(900);
  log('live after off', await evalJs("window.__texora.state.settings.build.livePreview"));
  await click('#sbLive');
  await sleep(900);
  log('live after on', await evalJs("window.__texora.state.settings.build.livePreview"));

  // 10. punctuation both directions
  await evalJs("(() => { const ed=window.__texora.editor; const m=ed.model; ed.editor.setPosition({lineNumber:m.getLineCount()-2,column:1}); ed.editor.trigger('texora','editor.action.insertLineAfter'); return true; })()");
  await send('Input.insertText', { text: '测试，句子（括号）。结束。' });
  await sleep(300);
  await evalJs("window.__texora.cmd('format.punctHalf')");
  await sleep(500);
  log('punct half', await evalJs("(() => { const m=window.__texora.editor.model; const p=window.__texora.editor.editor.getPosition(); return m.getLineContent(p.lineNumber-1); })()"));
  await evalJs("window.__texora.cmd('format.punctFull')");
  await sleep(500);
  log('punct full', await evalJs("(() => { const m=window.__texora.editor.model; const p=window.__texora.editor.editor.getPosition(); return m.getLineContent(p.lineNumber-1); })()"));
  await evalJs("(async () => { const d=window.__texora.state.docs.get(window.__texora.state.activePath); if (d) d.dirty=false; await window.__texora.app.reloadDocument(); return true; })()");
  await sleep(500);

  // 11. fold keeps \end (fold equation at line 43 then inspect visible text)
  await evalJs("(() => { const ed=window.__texora.editor; ed.editor.setPosition({lineNumber:43,column:1}); ed.editor.trigger('texora','editor.action.fold'); return true; })()");
  await sleep(500);
  log('folded visible lines', await evalJs("(() => { const lines=[...document.querySelectorAll('.view-line')].map(l=>l.textContent); return lines.filter(t=>t.includes('\\\\begin{equation}')||t.includes('\\\\end{equation}')).slice(0,4); })()"));
  await evalJs("(() => { const ed=window.__texora.editor; ed.editor.trigger('texora','editor.action.unfoldAll'); return true; })()");

  // 12. SUB badges in file tree
  await click('[data-panel="files"]');
  await sleep(500);
  log('SUB badges', await evalJs("document.querySelectorAll('.tree-tag.sub').length"));
  log('root badges', await evalJs("document.querySelectorAll('.tree-tag:not(.sub)').length"));
  await shot('.capture/fix/sub-badges.png');

  console.log(out.join('\n'));
}
