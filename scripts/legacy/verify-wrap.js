export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(2000);
  console.log('setting', await evalJs("window.__texora.state.settings.editor.wordWrap"));
  console.log('option', await evalJs("window.__texora.editor.editor.getOption(window.__monaco.editor.EditorOption.wordWrap)"));
  console.log('layout', await evalJs("window.__texora.editor.editor.getLayoutInfo().width"));
  console.log('dom', await evalJs("(() => { const c=document.querySelector('.monaco-editor .scroll-decoration')?.parentElement; const vl=document.querySelector('.view-lines'); return {vlW:vl.getBoundingClientRect().width, vlSW:vl.scrollWidth, hostW:document.querySelector('#monaco').getBoundingClientRect().width, edW:document.querySelector('.monaco-editor').getBoundingClientRect().width}; })()"));
  await evalJs("window.__texora.cmd('view.toggleWordWrap')");
  await sleep(1000);
  console.log('after', await evalJs("window.__texora.editor.editor.getOption(window.__monaco.editor.EditorOption.wordWrap)"));
  console.log('afterdom', await evalJs("(() => { const vl=document.querySelector('.view-lines'); return {vlW:vl.getBoundingClientRect().width, vlSW:vl.scrollWidth, hostW:document.querySelector('#monaco').getBoundingClientRect().width}; })()"));
}
