import assert from 'node:assert/strict';
export default async function({evalJs,sleep,shot}) {
  async function waitFor(expr,limit=300){for(let i=0;i<limit;i++){if(await evalJs(expr))return;await sleep(100);}throw Error('Timed out: '+expr);}
  await waitFor('!!window.__texora?.editor.model');
  await evalJs("(()=>{const c=window.__texora;c.state.settings.build.livePreview=false;c.state.settings.files.autoSave=false;window.__previewCalls=[];window.__originalPreviewApi=c.api;c.api={...c.api,tex:{...c.api.tex,snippet:request=>{window.__previewCalls.push(request);return window.__originalPreviewApi.tex.snippet(request);}}};return true;})()");
  const focus=async marker=>evalJs(`(()=>{const e=window.__texora.editor,p=e.model.getPositionAt(e.model.getValue().indexOf(${JSON.stringify(marker)})+2);e.editor.revealLineInCenter(p.lineNumber);e.editor.setPosition(p);e.editor.focus();return true;})()`);
  await focus('x^2');
  await waitFor('document.querySelector(".live-math-status")?.textContent==="实时预览"');
  await sleep(1100);assert.equal(await evalJs('window.__previewCalls.length'),0,'valid instant formula must never invoke native TeX');
  // Moving the cursor in an unchanged formula must not restart or report editing.
  await evalJs('(()=>{const e=window.__texora.editor,p=e.editor.getPosition();e.editor.setPosition({lineNumber:p.lineNumber,column:p.column+1});return true;})()');
  await sleep(850);assert.equal(await evalJs('window.__previewCalls.length'),0);
  assert.equal(await evalJs('document.querySelector(".live-math-status").textContent'),'实时预览');
  // Unsupported document command is red, with surrounding terms still typeset.
  await focus('x+\\norm');
  await waitFor('document.querySelector(".live-math-body")?.innerHTML.includes("#ff626f")');
  assert.ok(await evalJs('!!document.querySelector(".live-math-body .katex msup, .live-math-body .msupsub")'));
  assert.equal(await evalJs('document.querySelector(".live-math-status").textContent.includes("编辑")'),false);
  await shot('.capture/preview-refresh/unknown-command.png');
  await waitFor('document.querySelector(".live-math-status")?.textContent==="本地 TeX 预览"',450);
  const nativeCount=await evalJs('window.__previewCalls.filter(x=>x.kind==="math").length');assert.equal(nativeCount,1);
  await evalJs('(()=>{const e=window.__texora.editor,p=e.editor.getPosition();e.editor.setPosition({lineNumber:p.lineNumber,column:p.column+1});return true;})()');
  await sleep(850);assert.equal(await evalJs('document.querySelector(".live-math-status").textContent'),'本地 TeX 预览');
  assert.equal(await evalJs('window.__previewCalls.filter(x=>x.kind==="math").length'),nativeCount,'cursor-only movement must preserve a completed native preview');
  // Plain tabular body supports pointer preview even with the caret still in math.
  await evalJs("(()=>{const e=window.__texora.editor,p=e.model.getPositionAt(e.model.getValue().indexOf('Cell target')+2);window.__tableHover=e.showHoverAt(p);return true;})()");
  await waitFor('document.querySelector(".texora-hover")?.textContent.includes("tabular 预览") && !!document.querySelector(".texora-hover img")',450);
  await shot('.capture/preview-refresh/tabular.png');
  // A pending table response must not re-open a hidden card.
  await evalJs('(async()=>{await window.__tableHover;return true;})()');
  for(const marker of ['Long target','Draw target']) {
    await focus(marker);
    await waitFor('!!document.querySelector(".texora-hover img") && document.querySelector(".texora-hover").style.display==="block"',450);
    const expected=marker==='Draw target'?'tikzpicture':'longtable';
    await waitFor(`document.querySelector('.texora-hover')?.textContent.includes(${JSON.stringify(expected+' 预览')}) && !!document.querySelector('.texora-hover img')`,450);
  }
  await shot('.capture/preview-refresh/tikz.png');
  assert.equal(await evalJs('window.__texora.editor.mathZones.length'),0);
  await focus('x^2');await waitFor('document.querySelector(".live-math-status")?.textContent==="实时预览"');
  await evalJs("window.__texora.editor.editor.trigger('keyboard','type',{text:'+'+String.fromCharCode(92)+'frac{'})");
  await waitFor('!!document.querySelector(".live-math-body .katex-error")');
  assert.equal(await evalJs('document.querySelector(".live-math").style.display'),'block');
  console.log('PASS: no native work for valid math; red unknown commands and malformed syntax; native fallback after idle; unchanged cursor preserves preview; tabular/longtable/TikZ body previews; no view zones.');
}
