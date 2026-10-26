/** Final gallery shots: previews (figure/TikZ/table), image hover, markdown, light theme. */
export default async function demo({ evalJs, shot, click, sleep, send }) {
  const out = [];
  // reset persisted settings to defaults so screenshots show the shipping theme
  await evalJs("(async () => { await window.texora.settings.reset(null); return true; })()");
  await sleep(900);
  await evalJs("window.__texora.cmd('build.run')");
  for (let i = 0; i < 60; i++) {
    if ((await evalJs("document.querySelectorAll('.pdf-page').length")) > 0) break;
    await sleep(800);
  }
  await sleep(9000); // let inline zones finish rendering
  out.push('pages: ' + (await evalJs("document.querySelectorAll('.pdf-page').length")));
  out.push('zones: ' + (await evalJs("document.querySelectorAll('.math-zone').length")));
  await evalJs("window.__texora.editor.revealLine(1, 1)");
  await sleep(500);
  await shot('.capture/ui/60-dark-main.png');

  // figures area (image + tikz)
  const figLine = await evalJs("(() => { const p = window.__texora.state.parsed; const f = p.environments.filter(e => e.env === 'figure'); return f[f.length-1]?.line || 120; })()");
  await evalJs(`window.__texora.editor.revealLine(${figLine}, 1)`);
  await sleep(6000);
  await shot('.capture/ui/61-dark-previews.png');

  // hover over includegraphics
  const incLine = await evalJs("(() => { const m = window.__texora.editor.model; if (!m) return -1; const n = m.getLineCount(); for (let i = 1; i <= n; i++) { if (m.getLineContent(i).includes('includegraphics')) return i; } return 0; })()");
  out.push('incLine: ' + incLine);
  if (incLine <= 0) {
    out.push('model head: ' + (await evalJs("window.__texora.editor.model.getValue().slice(0, 120)")));
    console.log(out.join('\n'));
    return;
  }
  await evalJs(`window.__texora.editor.editor.revealLineInCenter(${incLine})`);
  await sleep(400);
  const pos = await evalJs(`(() => { const ed = window.__texora.editor; const p = ed.editor.getScrolledVisiblePosition({lineNumber: ${incLine}, column: 18}); const r = document.querySelector('#monaco').getBoundingClientRect(); return { x: r.left + p.left + 30, y: r.top + p.top + 8 }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y });
  await sleep(250);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x + 3, y: pos.y });
  await sleep(1200);
  out.push('image hover: ' + (await evalJs("document.querySelectorAll('.monaco-hover img.hc-image').length")));
  await shot('.capture/ui/62-image-hover.png');

  // markdown preview
  await evalJs("(async () => { await window.__texora.app.openDocument(window.__texora.state.project.root + '\\\\notes.md'); return true; })()");
  await sleep(900);
  out.push('md panes: ' + (await evalJs("document.querySelectorAll('.md-in-pane').length")));
  await shot('.capture/ui/63-markdown.png');

  // back to tex + light theme
  await evalJs("(async () => { await window.__texora.app.openDocument(window.__texora.state.project.rootFile); return true; })()");
  await sleep(600);
  await evalJs("window.__texora.cmd('view.toggleTheme')");
  await sleep(900);
  await shot('.capture/ui/64-light-main.png');
  out.push('theme: ' + (await evalJs("document.documentElement.dataset.theme")) + ' invert: ' + (await evalJs("document.querySelector('.preview').getAttribute('data-pdf-invert')")));

  // light settings
  await click('#settingsBtn');
  await sleep(600);
  await click('.settings-nav-item[data-section="appearance"]');
  await sleep(400);
  await shot('.capture/ui/65-light-settings.png');
  await evalJs("document.querySelector('.settings-modal .modal-close').click()");
  await sleep(300);
  // back to dark for the shipped default
  await evalJs("window.__texora.cmd('view.toggleTheme')");
  await sleep(600);
  await shot('.capture/ui/66-dark-final.png');
  console.log(out.join('\n'));
}


