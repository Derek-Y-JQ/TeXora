export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(1500);
  console.log('setting', await evalJs("window.__texora.state.settings.editor.wordWrap"));
  console.log('option before', await evalJs("window.__texora.editor.editor.getOption(window.__monaco.editor.EditorOption.wordWrap)"));
  await evalJs("if(!window.__texora.state.settings.editor.wordWrap) window.__texora.cmd('view.toggleWordWrap')");
  await sleep(800);
  console.log('option after', await evalJs("window.__texora.editor.editor.getOption(window.__monaco.editor.EditorOption.wordWrap)"));
  console.log('metrics', await evalJs("(() => { const ed=window.__texora.editor.editor; const w=ed.getLayoutInfo().width; const lines=[...document.querySelectorAll('.view-line')].map(x=>({w:x.getBoundingClientRect().width,t:x.textContent.slice(0,20)})); const bar=document.querySelector('.monaco-scrollable-element > .scrollbar.horizontal'); return {editorW:w,max:Math.max(...lines.map(x=>x.w)),over:lines.filter(x=>x.w>w+2).slice(0,2),bar:bar?.className,opacity:bar?getComputedStyle(bar).opacity:null}; })()"));
}
