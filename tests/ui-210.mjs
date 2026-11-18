import assert from 'node:assert/strict';

export default async function ({evalJs, click, sleep}) {
  async function until(expression) {
    for (let attempt=0; attempt<100; attempt++) {
      if (await evalJs(expression)) return;
      await sleep(100);
    }
    throw Error('Timed out waiting for ' + expression + ': ' + await evalJs("document.querySelector('.agent-panel [role=status]')?.textContent"));
  }
  await until('!!window.__texora');
  assert.equal(await evalJs('document.documentElement.dataset.theme'), 'light');
  await click('#toastLayer [role=button]');
  assert.equal(await evalJs('document.activeElement.dataset.setting'), 'appearance.uiStyle');
  await click('#settingsClose');
  await evalJs("window.__texora.sidebar.show('ai')");
  await click('[data-ai-mode=agent]');
  await until("document.querySelector('.agent-panel select').value === 'codex'");
  for (const id of ['codex','claude']) {
    await evalJs(`(()=>{const sel=document.querySelector('.agent-panel select'); sel.value='${id}'; sel.dispatchEvent(new Event('change'));})()`);
    await until("!document.querySelector('.agent-panel [data-login]').hidden && !document.querySelector('.agent-panel textarea').value");
    await click('.agent-panel [data-login]');
    await until("!document.querySelector('.agent-panel textarea').disabled");
    async function send(text) {
      await evalJs(`(()=>{const input=document.querySelector('.agent-panel textarea');input.value=${JSON.stringify(text)};input.dispatchEvent(new Event('input'));input.form.requestSubmit()})()`);
      await until("document.querySelector('.agent-panel [data-stop]').hidden");
    }
    await send('你好');
    await until("document.querySelector('.agent-messages').textContent.includes('收到 你好')");
    await click('.agent-panel [data-new]');
    await click('.agent-panel [data-history]');
    await click('.agent-recent button');
    await send('再问一次');
    await until("document.querySelector('.agent-messages').textContent.includes('继续 再问一次')");
    assert.equal(await evalJs("document.querySelectorAll('.agent-messages .agent-assistant').length"),2);
  }
  await evalJs("(()=>{const sel=document.querySelector('.agent-panel select');sel.value='dsh';sel.dispatchEvent(new Event('change'))})()");
  await until("document.querySelector('.agent-panel [data-login]').textContent==='打开 DeepSeek'");
  await click('.agent-panel [data-login]');
  await until("!document.querySelector('.agent-web').hidden");
  const marker = await evalJs("window.texora.fs.read(window.__texora.state.project.root + '/agent-web-authenticated.txt')");
  assert.equal(marker.text, 'authenticated', 'local provider view completes the first-party cookie exchange');
  await click('.agent-panel [data-stop]');
  await click('[data-ai-mode=ask]');
  assert.ok(await evalJs("document.querySelector('#aiPrompt').getClientRects().length > 0"));
}
