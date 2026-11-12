export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(2000);
  if(!(await evalJs("window.__texora.state.settings.editor.wordWrap"))) await evalJs("window.__texora.cmd('view.toggleWordWrap')");
  await sleep(800);
  console.log('opt', await evalJs("window.__texora.editor.editor.getOption(window.__monaco.editor.EditorOption.wordWrap)"));
  console.log('line', await evalJs("window.__texora.editor.editor.getModel().getLineContent(21)"));
  console.log('metrics', await evalJs("(() => { const ed=window.__texora.editor.editor; const info=ed.getLayoutInfo(); const vl=document.querySelector('.view-lines'); const sl=document.querySelector('.monaco-scrollable-element'); return {w:info.width, contentW:info.contentWidth, vlW:vl.getBoundingClientRect().width, vlSW:vl.scrollWidth, scrollW:sl?sl.scrollWidth:null, scrollCW:sl?sl.clientWidth:null, hbar:!!document.querySelector('.monaco-scrollable-element > .scrollbar.horizontal.visible')}; })()"));
  await evalJs("window.__texora.editor.editor.revealLineInCenter(21)");
  await sleep(400);
  console.log('after reveal', await evalJs("(() => { const vl=document.querySelector('.view-lines'); const bar=document.querySelector('.monaco-scrollable-element > .scrollbar.horizontal'); return {vlW:vl.getBoundingClientRect().width, vlSW:vl.scrollWidth, bar:bar?.className}; })()"));
}
