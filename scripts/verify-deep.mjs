/**
 * Deep interaction checks (run after building).
 */
export default async function verifyDeep({ evalJs, shot, click, sleep, send }) {
  const out = [];
  for (let i = 0; i < 40; i++) {
    if ((await evalJs("document.querySelectorAll('.pdf-page').length")) > 0) break;
    await sleep(750);
  }

  // focus editor and place caret at end of file
  await evalJs("(() => { const ed = window.__texora.editor; ed.editor.setPosition({lineNumber: 30, column: 1}); ed.editor.focus(); return true; })()");
  await sleep(200);

  // type a begin environment and open the suggestion list
  for (const ch of ['\\', 'b', 'e', 'g', 'i', 'n', '{']) {
    await send('Input.dispatchKeyEvent', { type: 'char', text: ch, key: ch });
    await sleep(60);
  }
  await sleep(1400);
  out.push('suggestions: ' + (await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length")));
  await shot('.capture/ui/40-completion.png');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(600);
  out.push('after accept: ' + (await evalJs("(() => { const m = window.__texora.editor.model; const a = m.getLineContent(30); const b = m.getLineContent(31); const c = m.getLineContent(32); return JSON.stringify([a,b,c]); })()")));
  await shot('.capture/ui/41-env-autoclose.png');
  await evalJs("window.__texora.editor.editor.trigger('texora','undo')");
  await evalJs("window.__texora.editor.editor.trigger('texora','undo')");

  // math hover: place mouse over a formula inside the cases environment (line 46)
  const pos = await evalJs(`(() => {
    const ed = window.__texora.editor;
    ed.editor.revealLineInCenter(46);
    const p = ed.editor.getScrolledVisiblePosition({ lineNumber: 46, column: 12 });
    if (!p) return null;
    const r = document.querySelector('#monaco').getBoundingClientRect();
    return { x: r.left + p.left + 60, y: r.top + p.top + 8 };
  })()`);
  if (pos) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y });
    await sleep(120);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x + 2, y: pos.y });
    await sleep(2600);
    out.push('hover visible: ' + (await evalJs("!!document.querySelector('.monaco-hover')")));
    out.push('hover math img: ' + (await evalJs("document.querySelectorAll('.monaco-hover .hc-math img').length")));
    await shot('.capture/ui/42-math-hover.png');
  } else out.push('hover: no position');

  // block handle + drag reorder (programmatic move, then undo)
  const before = await evalJs("(() => { const m = window.__texora.editor.model; return m.getLineContent(41).slice(0,40); })()");
  await evalJs("window.__texora.editor.moveBlock(41, 41, 44)");
  await sleep(300);
  const after = await evalJs("(() => { const m = window.__texora.editor.model; return [41,42,43,44].map(n => m.getLineContent(n).slice(0,30)); })()");
  out.push('drag before: ' + before + ' | after: ' + JSON.stringify(after));
  await shot('.capture/ui/43-block-drag.png');
  await evalJs("window.__texora.editor.editor.trigger('texora','undo')");

  // block handle hover on a text line
  await evalJs("(() => { const ed = window.__texora.editor; ed.editor.revealLineInCenter(41); return true; })()");
  await sleep(400);
  const pos2 = await evalJs(`(() => {
    const ed = window.__texora.editor;
    const p = ed.editor.getScrolledVisiblePosition({ lineNumber: 41, column: 4 });
    const r = document.querySelector('#monaco').getBoundingClientRect();
    return { x: r.left + p.left + 20, y: r.top + p.top + 8 };
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos2.x, y: pos2.y });
  await sleep(700);
  out.push('block handles: ' + (await evalJs("document.querySelectorAll('.block-handle').length")) + ' / visible ' + (await evalJs("document.querySelectorAll('.block-handle.visible').length")));
  await shot('.capture/ui/44-block-handle.png');

  // settings persistence: toggle block mode off and back on via UI switch
  await click('#settingsBtn');
  await sleep(500);
  const switchSel = '[data-setting="editor.blockMode"]';
  await click(switchSel);
  const off = await evalJs("window.__texora.state.settings.editor.blockMode");
  await click(switchSel);
  const on = await evalJs("window.__texora.state.settings.editor.blockMode");
  out.push('blockMode toggle: ' + off + ' -> ' + on);
  const stored = await evalJs("(async () => (await window.texora.settings.all()).editor.blockMode)()");
  out.push('persisted: ' + stored);
  // accent + zoom
  await click('.settings-nav-item[data-section="appearance"]');
  await click('[data-accent-choice="emerald"]');
  await sleep(300);
  out.push('accent: ' + (await evalJs("document.documentElement.dataset.accent")));
  await shot('.capture/ui/45-settings-accent.png');
  await evalJs("document.querySelector('.settings-modal .modal-close').click()");
  await click('[data-accent-choice="violet"]').catch(() => {});

  // theme switch → pdf invert state
  await evalJs("window.__texora.cmd('view.toggleTheme')");
  await sleep(700);
  out.push('theme: ' + (await evalJs("document.documentElement.dataset.theme")) + ' invert: ' + (await evalJs("document.querySelector('.preview').getAttribute('data-pdf-invert')")));
  await shot('.capture/ui/46-light-with-pdf.png');
  await evalJs("window.__texora.cmd('view.toggleTheme')");
  await sleep(500);

  // preview double-click reverse search (simulate on page 2)
  await evalJs("window.__texora.preview.scrollToPage(2)");
  await sleep(800);
  const pt = await evalJs(`(() => { const p = document.querySelector('.pdf-page[data-page="2"]'); const r = p.getBoundingClientRect(); return { x: r.left + r.width * 0.4, y: r.top + Math.min(300, r.height * 0.35) }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 2 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 2 });
  await sleep(2500);
  out.push('reverse sync cursor: ' + (await evalJs("document.querySelector('#sbCursor').textContent")));
  await shot('.capture/ui/47-reverse-sync.png');

  console.log(out.join('\n'));
}
