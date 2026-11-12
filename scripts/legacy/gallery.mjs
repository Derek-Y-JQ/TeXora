/** Produces the documentation screenshot set in .capture/gallery. */
export default async function gallery({ evalJs, shot, click, sleep, send }) {
  const out = [];
  const clean = async () => {
    await evalJs("(() => { document.querySelectorAll('.toast').forEach(t => t.remove()); window.__texora.editor?.hideHover(); window.__texora.editor?.hideAiBar(); return true; })()");
    await sleep(200);
  };
  const snap = async (name) => {
    await clean();
    await shot('.capture/gallery/' + name);
  };
  await evalJs("(async () => { await window.texora.settings.reset(null); return true; })()");
  await sleep(800);
  await evalJs("window.__texora.cmd('build.run')");
  for (let i = 0; i < 60; i++) {
    if ((await evalJs("document.querySelectorAll('.pdf-page').length")) > 0) break;
    await sleep(800);
  }
  await sleep(8000);
  await evalJs("window.__texora.editor.revealLine(31, 1)");
  await sleep(400);
  await snap('dark-main.png');

  // figure / preview zones
  const figLine = await evalJs("(() => { const m = window.__texora.editor.model; for (let i=1;i<=m.getLineCount();i++) if (m.getLineContent(i).includes('includegraphics')) return i; return 1; })()");
  await evalJs(`window.__texora.editor.revealLine(${figLine}, 1)`);
  await sleep(3000);
  await snap('dark-previews.png');

  // image hover
  await evalJs(`window.__texora.editor.editor.revealLineInCenter(${figLine})`);
  await sleep(400);
  const p1 = await evalJs(`(() => { const ed = window.__texora.editor; const p = ed.editor.getScrolledVisiblePosition({lineNumber: ${figLine}, column: 22}); const r = document.querySelector('#monaco').getBoundingClientRect(); return { x: r.left + p.left + 30, y: r.top + p.top + 8 }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p1.x, y: p1.y });
  await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p1.x + 3, y: p1.y });
  await sleep(1400);
  await snap('dark-image-hover.png');
  await evalJs("window.__texora.editor.hideHover()");

  // math hover
  const mathLine = await evalJs("(() => { const m = window.__texora.editor.model; for (let i=1;i<=m.getLineCount();i++) if (m.getLineContent(i).includes('frac{\\\\partial u}')) return i; return 1; })()");
  await evalJs(`window.__texora.editor.editor.revealLineInCenter(${mathLine})`);
  await sleep(500);
  const p2 = await evalJs(`(() => { const ed = window.__texora.editor; const p = ed.editor.getScrolledVisiblePosition({lineNumber: ${mathLine}, column: 24}); const r = document.querySelector('#monaco').getBoundingClientRect(); return { x: r.left + p.left + 26, y: r.top + p.top + 8 }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p2.x, y: p2.y });
  await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p2.x + 3, y: p2.y });
  await sleep(3000);
  await snap('dark-math-hover.png');
  await evalJs("window.__texora.editor.hideHover()");

  // panels
  await click('[data-panel="outline"]');
  await sleep(400);
  await snap('dark-outline.png');
  await click('[data-panel="math"]');
  await sleep(400);
  await snap('dark-math-panel.png');
  await click('[data-panel="ai"]');
  await sleep(300);
  await snap('dark-ai.png');
  await click('[data-panel="files"]');

  // problems panel with successful log
  await click('[data-cmd="build.toggleProblems"]');
  await click('.ptab[data-problems="log"]');
  await sleep(300);
  await snap('dark-problems.png');
  await click('[data-cmd="build.toggleProblems"]');

  // settings dark
  await click('#settingsBtn');
  await sleep(600);
  await click('.settings-nav-item[data-section="appearance"]');
  await sleep(300);
  await snap('dark-settings.png');
  await evalJs("document.querySelector('.settings-modal .modal-close').click()");
  await sleep(300);

  // light theme
  await evalJs("window.__texora.cmd('view.toggleTheme')");
  await sleep(900);
  await evalJs("window.__texora.editor.revealLine(1, 1)");
  await snap('light-main.png');
  await click('[data-cmd="templates.open"]');
  await sleep(700);
  await snap('light-templates.png');
  await evalJs("document.querySelector('.modal-close').click()");
  await sleep(300);
  await click('[data-cmd="insert.table"]');
  await sleep(500);
  await snap('light-table.png');
  await evalJs("document.querySelector('.modal-close').click()");
  await sleep(300);
  await click('#settingsBtn');
  await sleep(500);
  await click('.settings-nav-item[data-section="ai"]');
  await sleep(300);
  await snap('light-settings-ai.png');
  await evalJs("document.querySelector('.settings-modal .modal-close').click()");
  await sleep(300);

  // markdown
  await evalJs("(async () => { await window.__texora.app.openDocument(window.__texora.state.project.root + '\\\\notes.md'); return true; })()");
  await sleep(900);
  await snap('light-markdown.png');

  // empty state
  await evalJs("(async () => { await window.__texora.app.closeProject(); return true; })()");
  await sleep(700);
  await snap('empty-state.png');
  out.push('gallery done');
  console.log(out.join('\n'));
}
