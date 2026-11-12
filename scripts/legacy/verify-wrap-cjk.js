export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(800);
  await evalJs("(() => { const ed=window.__texora.editor.editor; if(!window.__texora.state.settings.editor.wordWrap) window.__texora.cmd('view.toggleWordWrap'); const long='这是一个没有标点也没有空格的很长中文段落'.repeat(20); ed.executeEdits('test',[{range:{startLineNumber:3,startColumn:1,endLineNumber:3,endColumn:1},text:long}]); ed.revealLineInCenter(3); return true; })()");
  await sleep(1000);
  console.log('metrics', await evalJs("(() => { const ed=window.__texora.editor.editor; const w=ed.getLayoutInfo().width; const lines=[...document.querySelectorAll('.view-line')].map(x=>({w:x.getBoundingClientRect().width,sw:x.scrollWidth,t:x.textContent.slice(0,15)})); const bar=document.querySelector('.monaco-scrollable-element > .scrollbar.horizontal'); return {editorW:w,lines:lines.filter(x=>x.w>w+2).slice(0,3),bar:bar?.className,opacity:bar?getComputedStyle(bar).opacity:null}; })()"));
}
