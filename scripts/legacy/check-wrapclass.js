export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(1000);
  console.log('class', await evalJs("document.getElementById('monaco').className"));
  console.log('setting', await evalJs("window.__texora.state.settings.editor.wordWrap"));
}
