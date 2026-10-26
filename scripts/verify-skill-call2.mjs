export default async function t({ evalJs, sleep }) {
  await evalJs("(async()=>{ await window.texora.settings.set('ai.apiKey','sk-test'); return true; })()");
  await sleep(600);
  const key = await evalJs("window.__texora.state.settings.ai.apiKey");
  await evalJs("window.__lastAiRequest = null");
  await evalJs("(async()=>{ try { await window.__texora.cmd('ai.blockAction',{actionId:'polish',block:{text:'测试句子。'}}); } catch(e) { window.__aiErr = e.message; } return true; })()");
  await sleep(500);
  const polish = await evalJs("window.__lastAiRequest");
  await evalJs("window.__lastAiRequest = null");
  await evalJs("(async()=>{ try { await window.__texora.cmd('ai.blockAction',{actionId:'ask',block:{text:'测试句子。'}}); } catch(e) {} return true; })()");
  await sleep(500);
  const ask = await evalJs("window.__lastAiRequest");
  console.log(JSON.stringify({ key, polish, ask }, null, 1));
}
