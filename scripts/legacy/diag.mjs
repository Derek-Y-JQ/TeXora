/** Focused diagnostics for suggestions + hover previews. */
export default async function diag({ evalJs, shot, click, sleep, send }) {
  const out = [];
  if ((await evalJs("document.documentElement.dataset.theme")) !== 'dark') {
    await evalJs("window.__texora.cmd('view.toggleTheme')");
    await sleep(600);
  }
  for (let i = 0; i < 40; i++) {
    if ((await evalJs("document.querySelectorAll('.pdf-page').length")) > 0) break;
    await sleep(700);
  }

  out.push('parsed envs: ' + (await evalJs("JSON.stringify((window.__texora.state.parsed?.environments || []).filter(e=>e.env==='equation').map(e=>({line:e.line,end:e.endLine})))")));
  out.push('blocks: ' + (await evalJs("window.__texora.state.blocks.length")));

  // --- suggestions: place caret at a blank line then type
  const lastLine = await evalJs("window.__texora.editor.model.getLineCount()");
  await evalJs(`(() => { const ed = window.__texora.editor; ed.editor.setPosition({lineNumber: ${lastLine - 2}, column: 1}); ed.editor.focus(); return true; })()`);
  await sleep(300);
  const focusOk = await evalJs("document.activeElement?.tagName + '/' + document.activeElement?.className");
  out.push('focus: ' + focusOk);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(200);
  for (const ch of ['\\', 'b', 'e', 'g', 'i', 'n', '{']) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, windowsVirtualKeyCode: ch.charCodeAt(0) });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, windowsVirtualKeyCode: ch.charCodeAt(0) });
    await sleep(80);
  }
  await sleep(1500);
  out.push('typed line: ' + (await evalJs(`window.__texora.editor.model.getLineContent(window.__texora.editor.editor.getPosition().lineNumber)`)));
  out.push('suggest widgets: ' + (await evalJs("document.querySelectorAll('.suggest-widget').length")) + ' rows: ' + (await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length")));
  await shot('.capture/ui/50-diagnostic-suggest.png');
  // programmatic trigger for comparison
  await evalJs("window.__texora.editor.editor.trigger('texora','editor.action.triggerSuggest')");
  await sleep(1200);
  out.push('after trigger rows: ' + (await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length")));
  await shot('.capture/ui/51-diagnostic-trigger.png');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });

  // --- hover over line 46
  await evalJs("(() => { const ed = window.__texora.editor; ed.editor.revealLineInCenter(46); return true; })()");
  await sleep(500);
  const pos = await evalJs(`(() => {
    const ed = window.__texora.editor;
    ed.editor.revealLineInCenter(46);
    ed.editor.setPosition({ lineNumber: 46, column: 18 });
    const p = ed.editor.getScrolledVisiblePosition({ lineNumber: 46, column: 18 });
    const r = document.querySelector('#monaco').getBoundingClientRect();
    return { x: r.left + p.left + 3, y: r.top + p.top + p.height / 2 };
  })()`);
  out.push('hover point: ' + JSON.stringify(pos));
  for (let i = 0; i < 4; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x + i, y: pos.y });
    await sleep(220);
  }
  await sleep(4000);
  out.push('hover: ' + (await evalJs("document.querySelectorAll('.monaco-hover').length")) + ' math img: ' + (await evalJs("document.querySelectorAll('.monaco-hover img').length")));
  out.push('hover text: ' + (await evalJs("(document.querySelector('.monaco-hover')?.textContent || '').slice(0,60)")));
  await shot('.capture/ui/52-diagnostic-hover.png');

  // --- block handle at a text line
  const pos2 = await evalJs(`(() => {
    const ed = window.__texora.editor;
    ed.editor.revealLineInCenter(92);
    ed.editor.setPosition({lineNumber: 92, column: 10});
    const p = ed.editor.getScrolledVisiblePosition({ lineNumber: 92, column: 10 });
    const r = document.querySelector('#monaco').getBoundingClientRect();
    return { x: r.left + p.left + 40, y: r.top + p.top + p.height / 2 };
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos2.x, y: pos2.y });
  await sleep(800);
  out.push('handles: ' + (await evalJs("document.querySelectorAll('.block-handle').length")) + ' aiBar: ' + (await evalJs("document.querySelectorAll('.block-ai-bar.visible').length")));
  await shot('.capture/ui/53-diagnostic-block.png');

  console.log(out.join('\n'));
}
