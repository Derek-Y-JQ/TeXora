/**
 * Interaction verification: math hover preview, SyncTeX forward/reverse,
 * block drag handle, selection AI bar, theme switching.
 */
export default async function verifyInteractions({ evalJs, shot, click, sleep, send }) {
  const out = [];
  for (let i = 0; i < 40; i++) {
    if ((await evalJs("document.querySelectorAll('.pdf-page').length")) > 0) break;
    await sleep(750);
  }
  const editorRect = await evalJs("(() => { const r = document.querySelector('#monaco').getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; })()");

  async function hoverLine(line, column = 8) {
    const pos = await evalJs(`(() => {
      const ed = window.__texora.editor;
      ed.editor.revealLineInCenter(${line});
      const p = ed.editor.getScrolledVisiblePosition({ lineNumber: ${line}, column: ${column} });
      if (!p) return null;
      const r = document.querySelector('#monaco').getBoundingClientRect();
      return { x: r.left + p.left + 30, y: r.top + p.top + 8 };
    })()`);
    if (!pos) return 'no position';
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y });
    await sleep(200);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x + 1, y: pos.y });
    return 'hovered';
  }

  // 1. math hover on the display formula (line 50 area)
  const displayLine = await evalJs("(() => { const p = window.__texora.state.parsed; const e = p.environments.find(x => x.env === 'equation'); return e ? e.line + 3 : 50; })()");
  out.push('hover ' + (await hoverLine(displayLine, 12)));
  await sleep(3200);
  out.push('hoverWidget: ' + (await evalJs("!!document.querySelector('.monaco-hover') || !!document.querySelector('.hc-math')")));
  await shot('.capture/ui/30-math-hover.png');
  await evalJs("document.querySelector('.monaco-editor').dispatchEvent(new MouseEvent('mousemove', {bubbles:true, clientX: 10, clientY: 10}))");

  // 2. SyncTeX forward via command
  const fwd = await evalJs("(async () => { const r = await window.texora.tex.synctexForward(window.__texora.state.project.rootFile, 92, 1); return r; })()");
  out.push('synctex fwd: ' + JSON.stringify(fwd));
  if (fwd && fwd.ok) {
    await evalJs(`window.__texora.preview.flashAt(${fwd.page}, ${fwd.x}, ${fwd.y}, ${fwd.height || 12}, ${fwd.width || 0})`);
    await sleep(700);
    await shot('.capture/ui/31-synctex-flash.png');
  }

  // 3. forward sync via gutter double-click simulation
  await evalJs("window.__texora.cmd('synctex.forward', " + displayLine + ")");
  await sleep(1200);
  out.push('flash boxes: ' + (await evalJs("document.querySelectorAll('.synctex-flash').length")));

  // 4. reverse search result (PDF double click is wired to the same IPC)
  const inv = await evalJs(`(async () => { const p = document.querySelector('.pdf-page'); if (!p) return null; const r = await window.texora.tex.synctexInverse(1, 300, 200); return r; })()`);
  out.push('synctex inv: ' + JSON.stringify(inv));

  // 5. block handle + drag indicator (hover a block)
  await hoverLine(displayLine + 4, 4);
  await sleep(600);
  out.push('block handle visible: ' + (await evalJs("document.querySelectorAll('.block-handle.visible').length")));
  await shot('.capture/ui/32-block-handle.png');

  // 6. selection AI bar
  await evalJs("(() => { const ed = window.__texora.editor; ed.editor.setSelection({startLineNumber: 28, startColumn: 1, endLineNumber: 30, endColumn: 20}); return true; })()");
  await sleep(500);
  out.push('selection bar: ' + (await evalJs("!!document.querySelector('.block-ai-bar.visible')")));
  await shot('.capture/ui/33-selection-bar.png');

  // 7. completion popup after typing \begin{
  await evalJs("(() => { const ed = window.__texora.editor; ed.editor.setPosition({lineNumber: 30, column: 1}); ed.editor.trigger('texora','editor.action.insertLineAfter'); return true; })()");
  await send('Input.insertText', { text: '\\begin{eq' });
  await sleep(1200);
  out.push('suggest: ' + (await evalJs("document.querySelectorAll('.suggest-widget .monaco-list-row').length")));
  await shot('.capture/ui/34-completion.png');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await evalJs("window.__texora.editor.editor.trigger('texora','undo')");

  // 8. command palette open + fuzzy search
  await evalJs("window.__texora.commands.openPalette('紧凑')");
  await sleep(600);
  await shot('.capture/ui/35-palette-search.png');
  await evalJs("window.__texora.commands.closePalette()");

  // 9. light theme main + math hover
  await click('#themeToggle');
  await sleep(800);
  await shot('.capture/ui/36-light-final.png');

  console.log(out.join('\n'));
}
