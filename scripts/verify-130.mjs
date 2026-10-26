import assert from 'node:assert/strict';

export default async function verify130({ evalJs, click, sleep, shot }) {
  for (let i = 0; i < 80; i++) {
    if (await evalJs('!!window.__texora?.ribbon')) break;
    await sleep(250);
  }
  assert.equal(await evalJs('(async () => (await window.texora.info()).version)()'), '1.3.0');
  assert.ok(await evalJs("window.__texora.state.project.root.split(String.fromCharCode(92)).join('/').endsWith('/.capture/verify130-project')"), 'only mutate the isolated verification fixture');
  await evalJs(`(async () => {
    const c=window.__texora;
    await c.api.settings.set('build.livePreview', false);
    await c.api.settings.set('general.checkUpdates', false);
    c.sidebar.show('files');
  })()`);
  await click('.act-btn[data-panel="files"]');
  assert.equal(await evalJs("document.querySelector('#sidebar').classList.contains('collapsed')"), true);
  assert.equal(await evalJs("document.querySelectorAll('.act-btn.active').length"), 0);
  await click('.act-btn[data-panel="files"]');
  assert.equal(await evalJs("document.querySelector('#sidebar').classList.contains('collapsed')"), false);
  await click('.act-btn[data-panel="outline"]');
  assert.equal(await evalJs("window.__texora.sidebar.panel"), 'outline');
  assert.equal(await evalJs("document.querySelector('#sidebar').classList.contains('collapsed')"), false);
  await click('.act-btn[data-panel="outline"]');
  assert.equal(await evalJs("document.querySelector('#sidebar').classList.contains('collapsed')"), true);
  await click('.act-btn[data-panel="files"]');

  const appTheme = await evalJs('window.__texora.state.settings.appearance.theme');
  await click('#codeThemeBtn');
  assert.equal(await evalJs("document.querySelectorAll('.menu-item').length"), 8);
  await evalJs("[...document.querySelectorAll('.menu-item')].find(b=>b.textContent.includes('GitHub Light')).click()");
  await sleep(450);
  assert.equal(await evalJs('window.__texora.state.settings.appearance.codeTheme'), 'github-light');
  assert.equal(await evalJs('(async () => (await window.texora.settings.all()).appearance.codeTheme)()'), 'github-light');
  assert.equal(await evalJs('window.__texora.state.settings.appearance.theme'), appTheme, 'code theme does not change application theme');
  assert.equal(await evalJs("document.querySelector('#codeThemeLabel').textContent"), 'GitHub Light');
  await click('#codeThemeBtn');
  await evalJs("[...document.querySelectorAll('.menu-item')].find(b=>b.textContent.includes('One Dark')).click()");
  await sleep(350);

  const icons = await evalJs(`(() => {
    const selectors=['[data-format="section"]','[data-menu="spacing"]','[data-menu="math"]','[data-format="displaystyle"]','[data-menu="env"]','#liveBtn'];
    return selectors.map(s=>document.querySelector(s+' use').getAttribute('href'));
  })()`);
  assert.equal(new Set(icons).size, icons.length, 'different actions use distinct icons');
  assert.ok(await evalJs("parseFloat(getComputedStyle(document.querySelector('.act-btn .ico')).strokeWidth) >= 1.9"));
  assert.equal(await evalJs("document.querySelector('#btnBuild').dataset.cmd"), 'build.run');

  // Drive real compiler IPC on an isolated fixture, while leaving enough work to
  // inspect the running state and exercise the stop action on the same button.
  assert.ok(await evalJs('!!window.__texora.state.project.root'), 'verification fixture must be open');
  const slowSource = [String.raw`\documentclass{article}`, String.raw`\begin{document}`, 'Fresh edits compiled by TeXora 1.3.0.', String.raw`\newcount\slow \slow=0 \loop\advance\slow by 1 \ifnum\slow<30000000 \repeat`, String.raw`\end{document}`].join('\n');
  await evalJs(`window.__texora.editor.model.setValue(${JSON.stringify(slowSource)})`);
  await evalJs("document.querySelector('#btnBuild').click()");
  let running = false;
  for (let i = 0; i < 100; i++) {
    running = await evalJs("document.querySelector('#btnBuild').dataset.cmd === 'build.stop'");
    if (running) break;
    await sleep(150);
  }
  assert.ok(running, 'compiler start updates primary button');
  assert.equal(await evalJs("document.querySelector('#sbBuild').classList.contains('building')"), true);
  assert.equal(await evalJs('window.__texora.state.docs.get(window.__texora.state.activePath).dirty'), false, 'compile saves edits');
  await shot('.capture/130-compiling.png');
  await evalJs("document.querySelector('#btnBuild').click()");
  for (let i = 0; i < 80; i++) {
    if (await evalJs("document.querySelector('#btnBuild').dataset.cmd === 'build.run'")) break;
    await sleep(150);
  }
  assert.equal(await evalJs("document.querySelector('#btnBuild').dataset.cmd"), 'build.run');
  // The stopped process may still be returning its final IPC result.
  await sleep(1500);
  assert.equal(await evalJs("window.__texora.state.log.includes('第 2/')"), false, 'stop must prevent subsequent compilation passes');
  const simpleSource = [String.raw`\documentclass{article}`, String.raw`\begin{document}`, 'TeXora 1.3.0 verified compilation.', String.raw`\end{document}`].join('\n');
  await evalJs(`window.__texora.editor.model.setValue(${JSON.stringify(simpleSource)})`);
  await evalJs("document.querySelector('#btnBuild').click()");
  await sleep(600);
  for (let i = 0; i < 160; i++) {
    if (await evalJs("['ok','error'].includes(window.__texora.state.build.state)")) break;
    await sleep(250);
  }
  console.log('build result:', await evalJs('JSON.stringify(window.__texora.state.build.result)'));
  assert.equal(await evalJs('window.__texora.state.build.state'), 'ok', 'real LaTeX compilation succeeds');
  await shot('.capture/130-ui.png');
  console.log('PASS 1.3.0: sidebar toggle, distinct icons, code theme/persistence, real compile/save/stop/retry');
}
