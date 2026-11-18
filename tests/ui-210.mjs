import assert from 'node:assert/strict';

export default async function ({evalJs, click, sleep}) {
  async function until(expression) {
    for (let attempt=0; attempt<100; attempt++) {
      if (await evalJs(expression)) return;
      await sleep(100);
    }
    throw Error('Timed out waiting for ' + expression);
  }
  await until('!!window.__texora');
  assert.equal(await evalJs('document.documentElement.dataset.theme'), 'light');
  await click('#toastLayer [role=button]');
  assert.equal(await evalJs('document.activeElement.dataset.setting'), 'appearance.uiStyle');
  await click('#settingsClose');
  await evalJs("window.__texora.sidebar.show('ai')");
  await click('[data-ai-mode=agent]');
  await until("document.querySelector('.agent-panel select').value === 'codex'");
  await click('.agent-panel [data-start]');
  await until("document.querySelector('.agent-panel [role=status]').textContent === '会话已连接'");
  await until("document.querySelector('.xterm')");
  const response = await evalJs(`new Promise(resolve => {
    let output = '';
    const off = window.texora.agent.onEvent(e => {
      if (e.data) output += e.data;
      if (output.includes('TEXORA-' + 'READY-210')) { off(); resolve(true); }
    });
    window.texora.agent.write("console.log('TEXORA-' + 'READY-210')\\r");
    setTimeout(() => { off(); resolve(false); }, 10000);
  })`);
  assert.ok(response, 'packaged PTY must echo evaluated output through the renderer bridge');
  await click('.agent-panel [data-stop]');
  await until("document.querySelector('.agent-panel [role=status]').textContent.includes('已结束')");
  await click('[data-ai-mode=ask]');
  assert.ok(await evalJs("document.querySelector('#aiPrompt').getClientRects().length > 0"));
}
