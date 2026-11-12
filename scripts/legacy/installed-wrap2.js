export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(1000);
  console.log('setting', await evalJs("window.__texora.state.settings.editor.wordWrap"));
  console.log('option', await evalJs("window.__texora.editor.editor.getOption(window.__monaco.editor.EditorOption.wordWrap)"));
  console.log('item', await evalJs("document.querySelector('#sbWrap')?.textContent.trim()"));
}
