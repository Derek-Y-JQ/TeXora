export default async function t({ evalJs, sleep }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ await sleep(1200); const d=await evalJs("window.__envDefsDebug"); if(d&&d.defs) break; }
  log('debug', await evalJs("window.__envDefsDebug"));
  log('state', await evalJs("Object.keys(window.__texora.state.envDefs||{}).length"));
  log('local', await evalJs("Object.entries(window.__texora.state.envDefs||{}).filter(([k])=>['assumption','remark','example','theorem'].includes(k))"));
  for(let i=0;i<20;i++){ if((await evalJs("document.querySelectorAll('.math-zone').length"))>0) break; await sleep(1500); }
  log('zones', await evalJs("document.querySelectorAll('.math-zone').length"));
  log('env markers', await evalJs("(window.__texora.editor.editor.getModel()?1:0)"));
}
