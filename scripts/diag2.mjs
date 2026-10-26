export default async function diag2({ evalJs, shot, click, sleep, send }) {
  for (let i = 0; i < 40; i++) { if ((await evalJs("document.querySelectorAll('.pdf-page').length")) > 0) break; await sleep(700); }
  const incLine = await evalJs("(() => { const m = window.__texora.editor.model; for (let i=1;i<=m.getLineCount();i++) if (m.getLineContent(i).includes('includegraphics')) return i; return 0; })()");
  await evalJs(`window.__texora.editor.editor.revealLineInCenter(${incLine})`);
  await sleep(600);
  const pos = await evalJs(`(() => { const ed = window.__texora.editor; const p = ed.editor.getScrolledVisiblePosition({lineNumber: ${incLine}, column: 22}); const r = document.querySelector('#monaco').getBoundingClientRect(); return { x: r.left + p.left + 30, y: r.top + p.top + 8 }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y });
  await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x + 4, y: pos.y });
  await sleep(2500);
  console.log('hoverHTML:', (await evalJs("(document.querySelector('.monaco-hover')?.innerHTML || 'NONE').slice(0, 900)")));
  console.log('img:', JSON.stringify(await evalJs("(() => { const i = document.querySelector('.monaco-hover img'); return i ? {src:i.src.slice(0,60), complete:i.complete, w:i.naturalWidth, h:i.naturalHeight, css:getComputedStyle(i).maxHeight} : null; })()")));
  console.log('fetch asset:', JSON.stringify(await evalJs("(async () => { const url = window.texora.assetUrl(window.__texora.state.project.root + '\\\\figures\\\\spectrum.png'); const r = await fetch(url); return {ok:r.ok, status:r.status, type:r.headers.get('content-type'), size:(await r.arrayBuffer()).byteLength}; })()")));
  console.log('stat:', JSON.stringify(await evalJs("(async () => await window.texora.fs.stat(window.__texora.state.project.root + '\\\\figures\\\\spectrum.png'))()")));
  await shot('.capture/ui/70-hover-diag.png');
}
