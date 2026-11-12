export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await evalJs("(async()=>{await window.__texora.cmd('doc.open', window.__texora.state.project.root+'\\\\chapters\\\\chapter2.tex');return true})()");
  await sleep(1000);
  console.log('block78', await evalJs("(() => { const b=window.__texora.state.blocks.find(x=>x.startLine===78); return b?{start:b.startLine,end:b.endLine,text:b.text.slice(0,80)}:null; })()"));
  console.log('line78', await evalJs("window.__texora.editor.model.getLineContent(78)"));
}
