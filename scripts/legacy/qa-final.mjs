/** Final QA pass: hover overlays, env diagnostics, dialogs in both themes. */
export default async function qa({ evalJs, shot, click, sleep, send }) {
  const out = [];
  // ensure defaults
  await evalJs("(async () => { await window.texora.settings.reset(null); return true; })()");
  await sleep(700);
  await evalJs("window.__texora.cmd('build.run')");
  for (let i = 0; i < 60; i++) {
    if ((await evalJs("document.querySelectorAll('.pdf-page').length")) > 0) break;
    await sleep(800);
  }
  await sleep(6000);
  out.push('pages: ' + (await evalJs("document.querySelectorAll('.pdf-page').length")));

  // 1. math hover via custom overlay
  const mathLine = await evalJs("(() => { const m = window.__texora.editor.model; for (let i=1;i<=m.getLineCount();i++) if (m.getLineContent(i).includes('frac{\\\\partial u}')) return i; return 0; })()");
  await evalJs(`window.__texora.editor.editor.revealLineInCenter(${mathLine})`);
  await sleep(500);
  let pos = await evalJs(`(() => { const ed = window.__texora.editor; const p = ed.editor.getScrolledVisiblePosition({lineNumber: ${mathLine}, column: 24}); const r = document.querySelector('#monaco').getBoundingClientRect(); return { x: r.left + p.left + 26, y: r.top + p.top + 8 }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y });
  await sleep(200);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x + 3, y: pos.y });
  await sleep(3200);
  out.push('math hover shown: ' + (await evalJs("(() => { const h = document.querySelector('.texora-hover'); return h && h.style.display !== 'none' ? h.querySelectorAll('img').length : -1; })()")));
  await shot('.capture/final/01-math-hover-dark.png');
  await evalJs("window.__texora.editor.hideHover()");

  // 2. env diagnostics: inject an unmatched environment in a scratch line
  const original = await evalJs("window.__texora.editor.model.getValue()");
  await evalJs(`(() => { const m = window.__texora.editor.model; m.pushEditOperations([], [{range:{startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:1}, text: '\\\\begin{theroem}\\n\\\\end{document}\\n'}], () => null); return true; })()`);
  await sleep(900);
  out.push('env markers: ' + (await evalJs("JSON.stringify((window.__texora.editor.editor.getModel() ? [] : []))")));
  out.push('marker count: ' + (await evalJs("(() => { try { return monaco.editor.getModelMarkers({}).filter(m => m.source === 'TeXora').length; } catch(e) { return 'n/a'; } })()")));
  await shot('.capture/final/02-env-diagnostic.png');
  await evalJs("window.__texora.editor.editor.trigger('texora','undo')");
  await sleep(400);

  // 3. settings appearance (dark)
  await click('#settingsBtn');
  await sleep(500);
  await click('.settings-nav-item[data-section="appearance"]');
  await sleep(400);
  await shot('.capture/final/03-settings-dark.png');
  await click('.settings-nav-item[data-section="editor"]');
  await sleep(400);
  await shot('.capture/final/04-settings-editor.png');
  await evalJs("document.querySelector('.settings-modal .modal-close').click()");
  await sleep(300);

  // 4. light theme main + dialogs
  await evalJs("window.__texora.cmd('view.toggleTheme')");
  await sleep(800);
  await evalJs("window.__texora.editor.revealLine(1, 1)");
  await shot('.capture/final/05-light-main.png');
  await click('[data-cmd="templates.open"]');
  await sleep(700);
  await shot('.capture/final/06-light-templates.png');
  await evalJs("document.querySelector('.modal-close').click()");
  await sleep(300);
  await click('#settingsBtn');
  await sleep(500);
  await click('.settings-nav-item[data-section="tex"]');
  await sleep(400);
  await shot('.capture/final/07-light-settings-tex.png');
  await evalJs("document.querySelector('.settings-modal .modal-close').click()");
  await sleep(300);

  // 5. markdown preview in light theme
  await evalJs("(async () => { await window.__texora.app.openDocument(window.__texora.state.project.root + '\\\\notes.md'); return true; })()");
  await sleep(800);
  await shot('.capture/final/08-light-markdown.png');

  // 6. back to dark + math hover light version skipped, selection bar
  await evalJs("(async () => { await window.__texora.app.openDocument(window.__texora.state.project.rootFile); return true; })()");
  await sleep(500);
  await evalJs("window.__texora.cmd('view.toggleTheme')");
  await sleep(700);
  await evalJs("(() => { const ed = window.__texora.editor; ed.editor.setSelection({startLineNumber: 74, startColumn: 1, endLineNumber: 80, endColumn: 20}); ed.editor.revealLineInCenter(76); return true; })()");
  await sleep(700);
  await shot('.capture/final/09-selection-ai.png');

  console.log(out.join('\n'));
}
