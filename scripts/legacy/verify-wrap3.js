export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(1500);
  if(!(await evalJs("window.__texora.state.settings.editor.wordWrap"))) await evalJs("window.__texora.cmd('view.toggleWordWrap')");
  await sleep(800);
  await evalJs("window.__texora.editor.editor.revealLineInCenter(21)"); await sleep(500);
  console.log('opt', await evalJs("window.__texora.editor.editor.getOption(window.__monaco.editor.EditorOption.wordWrap)"));
  console.log('line21', await evalJs("window.__texora.editor.editor.getModel().getLineContent(21).slice(0,80)"));
  console.log('widths', await evalJs("(() => { const ed=window.__texora.editor.editor; const w=ed.getLayoutInfo().width; const lines=[...document.querySelectorAll('.view-line')].map(x=>({t:x.textContent.slice(0,20),w:x.getBoundingClientRect().width,sw:x.scrollWidth})); return {editorW:w,max:Math.max(...lines.map(x=>x.w)),over:lines.filter(x=>x.w>w+2).slice(0,3)}; })()"));
  console.log('bar', await evalJs("(() => { const b=document.querySelector('.monaco-scrollable-element > .scrollbar.horizontal'); return {cls:b?.className, vis:getComputedStyle(b).visibility, opacity:getComputedStyle(b).opacity}; })()"));
}
