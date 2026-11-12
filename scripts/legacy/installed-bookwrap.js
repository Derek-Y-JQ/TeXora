export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(1500);
  console.log('setting/option', await evalJs("[window.__texora.state.settings.editor.wordWrap, window.__texora.editor.editor.getOption(window.__monaco.editor.EditorOption.wordWrap)]"));
  await evalJs("(async()=>{await window.__texora.cmd('doc.open', window.__texora.state.project.root+'\\\\chapters\\\\chapter2.tex');return true})()");
  await sleep(2500);
  console.log('after', await evalJs("[window.__texora.state.settings.editor.wordWrap, window.__texora.editor.editor.getOption(window.__monaco.editor.EditorOption.wordWrap)]"));
  console.log('bar', await evalJs("(() => { const b=document.querySelector('.monaco-scrollable-element > .scrollbar.horizontal'); return {cls:b?.className,op:getComputedStyle(b).opacity}; })()"));
}
