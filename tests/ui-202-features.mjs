import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/** 2.0.2 features: ribbon engine removal, rendered symbol palette, PDF full screen and
 *  presentation, removable recent projects and starting on the welcome page. */
export default async function ({ evalJs, sleep, send, press, shot }) {
  async function until(expr, label = expr) { for (let i = 0; i < 150; i++) { if (await evalJs(expr)) return; await sleep(40); } throw Error('Timed out: ' + label); }
  const gesture = (expression) => send('Runtime.evaluate', { expression, userGesture: true, awaitPromise: true, returnByValue: true });

  // The ribbon keeps one place to choose the engine: the compile options menu.
  assert.equal(await evalJs('!!document.querySelector("#engineBtn,.ribbon .engine-btn")'), false, 'duplicate engine selector removed');
  assert.ok(await evalJs('!!document.querySelector(".split-btn [data-menu=build]")'));

  // Symbols are typeset by KaTeX on one sheet; hovering shows the LaTeX code.
  await evalJs('window.__texora.dialogs.openSymbols("greek")');
  await until('document.querySelectorAll(".symbol-math .symbol-btn .katex").length>=30');
  for (const group of ['operators', 'relations', 'arrows', 'calculus', 'structures', 'spacing']) {
    await evalJs(`document.querySelector('.symbol-tabs [data-group="${group}"]').click()`);
    await until('!!document.querySelector(".symbol-math .symbol-btn")');
    assert.equal(await evalJs('document.querySelectorAll(".symbol-math .symbol-fallback").length'), 0, group + ' renders with KaTeX');
    assert.equal(await evalJs('[...document.querySelectorAll(".symbol-btn")].filter(b=>!b.querySelector(".katex")).length'), 0);
  }
  assert.equal(await evalJs('getComputedStyle(document.querySelector(".symbol-math .symbol-btn")).borderTopWidth'), '0px', 'cells are not boxed');
  await evalJs(`document.querySelector('.symbol-tabs [data-group="structures"]').click()`);await sleep(200);
  const target = await evalJs('(()=>{const r=document.querySelector(".symbol-math .symbol-btn").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...target }); await sleep(450);
  const readout = await evalJs('({code:document.querySelector(".symbol-readout .sr-tex").textContent,tip:document.querySelector(".symbol-math .symbol-btn").dataset.tip||document.querySelector(".symbol-math .symbol-btn").title})');
  assert.equal(readout.code, '\\frac{}{}', 'hover shows the LaTeX code without placeholders');
  assert.equal(readout.tip, '\\frac{}{}', 'tooltip carries the same code');
  await shot('.capture/202-symbols.png');
  await evalJs('window.__texora.dialogs.close()');

  // PDF full screen and presentation.
  const pdf = path.resolve('samples/demo/main.pdf');
  if (fs.existsSync(pdf)) {
    await evalJs(`window.__texora.preview.openPdf(${JSON.stringify(pdf)},{standalone:true})`);
    await until('window.__texora.preview.pageEls.length>1 && !!window.__texora.preview.pdfDocument', 'pdf open');
    const total = await evalJs('window.__texora.preview.pageEls.length');
    await gesture('document.querySelector("[data-cmd=\\"preview.fullscreen\\"]").click()');
    await until('document.fullscreenElement?.id==="previewPane"', 'pane full screen');
    await sleep(400); await shot('.capture/202-pdf-fullscreen.png');
    await gesture('document.exitFullscreen()');
    await until('!document.fullscreenElement', 'leave full screen');

    await evalJs('window.__texora.preview.scrollToPage(1)'); await sleep(300);
    await gesture('document.querySelector("[data-cmd=\\"preview.present\\"]").click()');
    await until('!!document.querySelector(".pdf-present .pp-page")', 'first slide');
    assert.equal(await evalJs('document.querySelector(".pp-count").textContent'), '1 / ' + total);
    const size = await evalJs('(()=>{const p=document.querySelector(".pp-page").getBoundingClientRect();return {w:p.width,h:p.height,vw:innerWidth,vh:innerHeight}})()');
    assert.ok(size.w <= size.vw + 1 && size.h <= size.vh + 1 && (Math.abs(size.h - size.vh) <= 2 || Math.abs(size.w - size.vw) <= 2), 'slide fits the screen: ' + JSON.stringify(size));
    await sleep(300); await shot('.capture/202-present.png');
    await press('ArrowRight', 'ArrowRight', 39);
    await until(`document.querySelector(".pp-count").textContent==="2 / ${total}"`, 'next slide');
    await press('End', 'End', 35);
    await until(`document.querySelector(".pp-count").textContent==="${total} / ${total}"`, 'last slide');
    await press('ArrowRight', 'ArrowRight', 39); await sleep(150);
    assert.equal(await evalJs('document.querySelector(".pp-count").textContent'), total + ' / ' + total, 'stops at the last page');
    await press('Escape', 'Escape', 27);
    await until('!document.querySelector(".pdf-present") && !document.fullscreenElement', 'leave presentation');
  } else console.log('skip PDF full screen / presentation: samples/demo/main.pdf not found');

  // Recent projects can be removed from the welcome page; nothing on disk changes.
  const recent = ['C:/texora-test/alpha', 'C:/texora-test/beta', 'C:/texora-test/gamma'].map((p, i) => ({ path: p, name: p.split('/').pop(), at: 1 + i }));
  await evalJs(`window.__texora.api.settings.set('ui.recent',${JSON.stringify(recent)})`);
  // Earlier steps leave edited buffers; close without the unsaved-changes prompt.
  await evalJs('(()=>{for(const d of window.__texora.state.docs.values())d.dirty=false;window.__texora.cmd("project.close");return true})()');
  await until('!!document.querySelector("#editorEmpty:not(.hidden)")', 'welcome page');
  await until('document.querySelectorAll("#emptyRecent .empty-recent-row").length===3', 'three recent rows');
  await shot('.capture/202-welcome-recent.png');
  await evalJs('document.querySelector("#emptyRecent [data-remove=\\"C:/texora-test/beta\\"]").click()');
  await until('document.querySelectorAll("#emptyRecent .empty-recent-row").length===2', 'row removed');
  const stored = await evalJs('window.__texora.api.project.info().then(i=>i.recent.map(r=>r.path))');
  assert.deepEqual(stored, ['C:/texora-test/alpha', 'C:/texora-test/gamma'], 'removal is saved');

  // Launch lands on the welcome page unless the user turns reopening back on.
  assert.equal(await evalJs('window.__texora.api.info().then(i=>i.settings.general.reopenLastProject)'), false);
  console.log('PASS ribbon engine removal, KaTeX symbol palette with code readout, PDF full screen and presentation, removable recent projects, welcome page on launch');
}
