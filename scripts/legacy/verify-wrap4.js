export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await evalJs("(async()=>{await window.__texora.cmd('doc.open', window.__texora.state.project.root+'\\\\chapters\\\\chapter2.tex');return true})()");
  await sleep(1500);
  if(!(await evalJs("window.__texora.state.settings.editor.wordWrap"))) await evalJs("window.__texora.cmd('view.toggleWordWrap')");
  await sleep(500);
  await evalJs("window.__texora.editor.editor.revealLineInCenter(79)");
  await sleep(800);
  console.log('opt', await evalJs("window.__texora.editor.editor.getOption(window.__monaco.editor.EditorOption.wordWrap)"));
  console.log('metrics', await evalJs("(() => { const ed=window.__texora.editor.editor; const w=ed.getLayoutInfo().width; const lines=[...document.querySelectorAll('.view-line')].map(x=>({w:x.getBoundingClientRect().width,sw:x.scrollWidth,t:x.textContent.slice(0,25)})); return {editorW:w,max:Math.max(...lines.map(x=>x.w)),over:lines.filter(x=>x.w>w+2).slice(0,3), bar:document.querySelector('.monaco-scrollable-element > .scrollbar.horizontal')?.className}; })()"));
}
