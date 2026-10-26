export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  await sleep(3000);
  const ln=await evalJs("(() => { const e=window.__texora.state.parsed.environments.find(x=>x.env==='tikzpicture'); return e?e.line:0; })()");
  log('tikz line', ln);
  await evalJs(`window.__texora.editor.showHoverAt({lineNumber:${ln},column:4})`);
  await sleep(4000);
  log('hover', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h?{img:h.querySelectorAll('img').length,text:h.textContent.slice(0,80)}:null; })()"));
  log('zones', await evalJs("document.querySelectorAll('.math-zone').length"));
  await shot('.capture/fix/tikz-hover.png');
}
