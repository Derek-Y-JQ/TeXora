export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await evalJs("window.__texora.settingsUI.open('editor')");
  await sleep(600);
  console.log('before', await evalJs("[window.__texora.state.settings.editor.wordWrap, window.__texora.editor.editor.getOption(window.__monaco.editor.EditorOption.wordWrap)]"));
  await evalJs("document.querySelector('[data-setting=\"editor.wordWrap\"]').click()");
  await sleep(1000);
  console.log('after', await evalJs("[window.__texora.state.settings.editor.wordWrap, window.__texora.editor.editor.getOption(window.__monaco.editor.EditorOption.wordWrap)]"));
}
