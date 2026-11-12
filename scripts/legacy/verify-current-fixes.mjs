import assert from 'node:assert/strict';
export default async function ({ evalJs, sleep, shot }) {
  async function waitFor(expression) { for (let i=0;i<160;i++) { if(await evalJs(expression))return; await sleep(150); } throw Error('Timed out: '+expression); }
  await waitFor('!!window.__texora?.state.projectOutline?.length');
  await evalJs("window.__texora.state.settings.general.autoCheckUpdates=false;window.__texora.sidebar.show('outline')");
  const order = await evalJs("[...new Set(window.__texora.state.projectOutline.map(x=>x.rel))]");
  assert.ok(order.indexOf('sections/introduction.tex') < order.indexOf('sections/analysis.tex'));
  assert.ok(order.indexOf('sections/analysis.tex') < order.indexOf('sections/conclusion.tex'));
  assert.equal(await evalJs('window.__texora.state.settings.ai.maxTokens'),10000);
  await evalJs("window.__texora.editor.model.setValue(window.__texora.editor.model.getValue().replace('\\\\end{document}', '\\\\section{Live outline check}\\n\\\\end{document}'))");
  await waitFor("window.__texora.state.projectOutline.some(x=>x.title==='Live outline check')");
  assert.equal(await evalJs("window.__texora.state.projectOutline.at(-1).title"),'Live outline check');
  await evalJs("window.__texora.ai.showResult({id:'test-diff',title:'AI 建议',instruction:'Test',original:'same old text\\nunchanged',suggestion:'same new text\\nunchanged',sourcePath:window.__texora.state.activePath,snapshot:{range:{}}})");
  assert.equal(await evalJs("document.querySelector('.diff-delete').textContent"),'old');
  assert.equal(await evalJs("document.querySelector('.diff-insert').textContent"),'new');
  await shot('.capture/current-diff.png');
  await evalJs("document.querySelector('[data-btn=diffHighlight]').click()");
  assert.equal(await evalJs("getComputedStyle(document.querySelector('.diff-delete')).backgroundColor"),'rgba(0, 0, 0, 0)');
  await evalJs("document.querySelector('[data-btn=close]').click();window.__texora.dialogs.showDiff({left:'same old text\\nunchanged',right:'same new text\\nunchanged'})");
  await waitFor("!!document.querySelector('.monaco-diff-editor .char-insert')");
  assert.equal(await evalJs("getComputedStyle(document.querySelector('.monaco-diff-editor .line-insert')).backgroundColor"),'rgba(0, 0, 0, 0)');
  await evalJs("[...document.querySelectorAll('.modal-foot button')].find(b=>b.textContent.includes('关闭 Diff')).click()");
  assert.equal(await evalJs("getComputedStyle(document.querySelector('.monaco-diff-editor .char-insert')).backgroundColor"),'rgba(0, 0, 0, 0)');
  for (const request of [
    {kind:'math',code:String.raw`\E[X]+\norm{x}`},
    {kind:'tikz',code:String.raw`\begin{tikzpicture}\node[draw,fill=cStop!10] {$\E[X]$};\end{tikzpicture}`}
  ]) {
    const result = await evalJs(`window.texora.tex.snippet(${JSON.stringify({...request,scale:1})})`);
    assert.ok(result.ok, result.error);
    assert.ok(result.width > 0 && result.height > 0);
  }
  console.log('PASS: real paper outline order + live edits, 10000 token default, precise AI diff and both highlight toggles.');
}
