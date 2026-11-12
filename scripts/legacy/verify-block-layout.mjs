import assert from 'node:assert/strict';

export default async function verify({ evalJs, sleep, send, shot }) {
  for (let i = 0; i < 40; i++) {
    if (await evalJs('!!window.__texora?.editor?.editor')) break;
    await sleep(250);
  }
  const version = await evalJs('(async () => (await window.texora.info()).version)()');
  console.log('tested app version:', version);
  if (process.env.TEXORA_EXPECT_VERSION) assert.equal(version, process.env.TEXORA_EXPECT_VERSION, 'verify the delivered app version');
  assert.equal(await evalJs("typeof window.__texora.editor.refreshBlockHover"), 'function', 'delivered app contains hover fix');
  await evalJs(String.raw`(async () => {
    const c = window.__texora;
    await c.api.settings.set('editor.wordWrap', true);
    await c.api.settings.set('editor.blockMode', true);
    c.state.settings.editor.wordWrap = true;
    c.state.settings.editor.blockMode = true;
    c.state.settings.editor.inlineMathPreview = false;
    const e = c.editor;
    e.model = e.createModel('C:/texora-layout-test.tex', [
      '这是没有空格的中文长段落'.repeat(60), '',
      'LatinParagraphWithoutSpaces'.repeat(40), '',
      ...Array.from({length: 35}, (_, i) => 'Paragraph ' + i + ': ' + '测试 mixed text and commands \\textbf{example} '.repeat(4) + '\n')
    ].join('\n'));
    e.editor.setModel(e.model);
    document.querySelector('.editor-empty')?.classList.add('hidden');
    e.applySettings();
    e.doParse();
    e.editor.setPosition({lineNumber: 1, column: 1});
    e.editor.setScrollTop(0);
  })()`);
  await sleep(1000);
  const metrics = await evalJs(`(() => {
    const e = window.__texora.editor.editor;
    const info = e.getLayoutInfo();
    return {host: document.querySelector('#monaco').clientWidth, width: info.width,
      content: info.contentWidth, scroll: e.getScrollWidth(),
      lines: [...document.querySelectorAll('#monaco .view-line')].map(l => { const r=document.createRange(); r.selectNodeContents(l); return {w:l.getBoundingClientRect().width, textWidth:r.getBoundingClientRect().width, text:l.textContent.slice(0,16)}; }),
      wrapping: e.getOption(window.__monaco.editor.EditorOption.wrappingInfo)};
  })()`);
  console.log('wrap metrics:', JSON.stringify({ ...metrics, lines: metrics.lines.slice(0, 2) }));
  if (process.env.TEXORA_PROBE) return;
  assert.ok(metrics.scroll <= metrics.content + 2, 'wrapped text must fit content width');
  assert.ok(metrics.lines.every(l => l.textWidth <= metrics.content + 2), 'actual glyphs must fit, without CSS clipping');

  async function point(line) {
    await evalJs(`window.__texora.editor.editor.revealLine(${line})`);
    await sleep(300);
    return evalJs(`(() => {
      const e = window.__texora.editor.editor;
      const p = e.getScrolledVisiblePosition({lineNumber:${line}, column:2});
      const r = e.getDomNode().getBoundingClientRect();
      return {x:r.left+p.left+2,y:r.top+p.top+8};
    })()`);
  }
  const state = () => evalJs(`(() => { const e=window.__texora.editor;
    return {line:e.hoveredBlock?.startLine, visible:e.aiBar.classList.contains('visible'),
      decorations:e.hoverDecoration.length}; })()`);
  let p = await point(1);
  await send('Input.dispatchMouseEvent', {type:'mouseMoved', ...p});
  await sleep(450);
  assert.equal((await state()).line, 1, 'first mouse move highlights block');
  assert.equal((await state()).visible, true);
  // Re-enter another block while an old hide timer is pending.
  p = await point(3);
  await evalJs('window.__texora.editor.scheduleHideAiBar(160)');
  await send('Input.dispatchMouseEvent', {type:'mouseMoved', ...p});
  await sleep(450);
  assert.equal((await state()).line, 3, 'old hide timer must not clear new block');
  assert.equal((await state()).visible, true);
  await send('Input.dispatchMouseEvent', {type:'mouseWheel', ...p, deltaX:0, deltaY:100});
  await sleep(650);
  const afterScroll = await state();
  assert.ok(afterScroll.line && afterScroll.visible, 'stationary pointer keeps highlighting after scroll');

  const overlap = await evalJs(`(() => { const c=window.__texora.editor;
    const b=c.aiBar.getBoundingClientRect(), e=c.editor.getDomNode().getBoundingClientRect();
    return {barLeft:b.left, editorRight:e.right, barRight:b.right, hostRight:c.aiBar.parentElement.getBoundingClientRect().right}; })()`);
  assert.ok(overlap.barLeft >= overlap.editorRight, 'AI buttons must stay outside text area');
  assert.ok(overlap.barRight <= overlap.hostRight + 1);
  assert.equal(await evalJs("window.__texora.editor.editor.getOption(window.__monaco.editor.EditorOption.wordWrap)"), 'on');
  const button = await evalJs(`(() => { const r=document.querySelector('.block-ai-bar button').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
  await send('Input.dispatchMouseEvent', {type:'mouseMoved', ...button});
  await sleep(450);
  assert.equal((await state()).visible, true, 'toolbar remains accessible when pointer enters it');
  await shot('.capture/block-layout.png');
  // Exercise the actual command, including resetting a previous horizontal scroll.
  await evalJs("window.__texora.cmd('view.toggleWordWrap')");
  await sleep(350);
  assert.ok(await evalJs('window.__texora.editor.editor.getScrollWidth() > window.__texora.editor.editor.getLayoutInfo().contentWidth'));
  await evalJs('window.__texora.editor.editor.setScrollLeft(180)');
  await evalJs("window.__texora.cmd('view.toggleWordWrap')");
  await sleep(450);
  assert.equal(await evalJs('window.__texora.editor.editor.getScrollLeft()'), 0);
  await send('Emulation.setDeviceMetricsOverride', {width:1100, height:850, deviceScaleFactor:1, mobile:false});
  await sleep(650);
  const narrow = await evalJs(`(() => { const e=window.__texora.editor.editor, i=e.getLayoutInfo();
    return {width:i.width, host:e.getDomNode().parentElement.clientWidth, content:i.contentWidth,
      scroll:e.getScrollWidth(), maxText:Math.max(...[...document.querySelectorAll('#monaco .view-line')].map(l=>{const r=document.createRange();r.selectNodeContents(l);return r.getBoundingClientRect().width;}))}; })()`);
  assert.ok(Math.abs(narrow.width - narrow.host) <= 1, 'layout follows available host width');
  assert.ok(narrow.scroll <= narrow.content + 2 && narrow.maxText <= narrow.content + 2, 'narrow window wraps actual text');
  console.log('narrow metrics:', narrow);
  console.log('PASS: wrapping, first hover, stale timer, stationary scroll, toolbar clearance/access, wrap toggle, resize');
}
