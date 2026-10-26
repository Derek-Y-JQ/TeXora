export default async function t({ evalJs, sleep }) {
  await evalJs("(async()=>{ await window.texora.settings.set('ai.apiKey','sk-test'); return true; })()");
  await sleep(300);
  const res = await evalJs(`(async () => {
    const orig = window.texora.ai.chat;
    let captured = null;
    window.texora.ai.chat = async (payload) => { captured = payload; return { ok: false, error: 'test-stub' }; };
    let err = '';
    try { await window.__texora.cmd('ai.blockAction', { actionId: 'polish', block: { text: '测试句子。' } }); } catch (e) { err = e.message; }
    const polish = captured;
    captured = null;
    try { await window.__texora.cmd('ai.blockAction', { actionId: 'ask', block: { text: '测试句子。' } }); } catch (e) { err += e.message; }
    const ask = captured;
    window.texora.ai.chat = orig;
    return { polishSkillIds: polish && polish.skillIds, polishKeys: polish && Object.keys(polish), askSkillIds: ask && ask.skillIds, err };
  })()`);
  console.log(JSON.stringify(res, null, 1));
}
