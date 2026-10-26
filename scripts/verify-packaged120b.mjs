export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<25;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  log('version', await evalJs("window.__texora.state.capture?.version"));
  log('findbar', await evalJs("!!document.querySelector('#findBar')"));
  log('wrap', await evalJs("document.querySelector('#wrapBtn')?.closest('.ribbon-group')?.querySelector('.ribbon-label')?.textContent"));
  for(let i=0;i<20;i++){ await sleep(1000); if((await evalJs("Object.keys(window.__texora.state.envDefs||{}).length"))>0) break; }
  log('envDefs', await evalJs("Object.keys(window.__texora.state.envDefs||{}).length"));
  await evalJs("(async()=>{ await window.__texora.cmd('doc.open', window.__texora.state.project.root + '\\\\sections\\\\experiments.tex'); return true; })()");
  for(let i=0;i<20;i++){ await sleep(1200); if((await evalJs("document.querySelectorAll('.math-zone').length"))>0) break; }
  log('zones', await evalJs("document.querySelectorAll('.math-zone').length"));
  const tbl=await evalJs("(() => { const e=window.__texora.state.parsed.environments.find(x=>x.env==='table'); return e?e.line:0; })()");
  await evalJs(`window.__texora.editor.showHoverAt({lineNumber:${tbl},column:4})`);
  await sleep(3500);
  log('table', await evalJs("(() => { const h=document.querySelector('.texora-hover'); return h?{img:h.querySelectorAll('img').length}:null; })()"));
  await shot('.capture/fix/packaged120b.png');
}
