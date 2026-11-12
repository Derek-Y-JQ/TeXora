export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(800);
  if(!(await evalJs("window.__texora.state.settings.editor.wordWrap"))) await evalJs("window.__texora.cmd('view.toggleWordWrap')");
  await sleep(600);
  console.log('class', await evalJs("document.getElementById('monaco').className"));
  console.log('setting/option', await evalJs("[window.__texora.state.settings.editor.wordWrap, window.__texora.editor.editor.getOption(window.__monaco.editor.EditorOption.wordWrap)]"));
}
