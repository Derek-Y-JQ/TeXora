export default async function t({ evalJs, sleep }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for (let i=0;i<25;i++) { await sleep(1500); const n=await evalJs("Object.keys(window.__texora.state.envDefs||{}).length"); if(n>0) break; }
  log('envDefs', await evalJs("Object.keys(window.__texora.state.envDefs||{}).length"));
  log('envDefs local', await evalJs("Object.entries(window.__texora.state.envDefs||{}).filter(([k])=>['assumption','remark','example','theorem','lemma'].includes(k)).slice(0,8)"));
  log('snippet E', await evalJs("(async()=>{ const r=await window.texora.tex.snippet({code:'\\\\E[X\\\\mid\\\\cF_t]',kind:'math'}); return {ok:r.ok,error:(r.error||'').slice(-100)}; })()"));
  for (let i=0;i<20;i++) { await sleep(1500); if ((await evalJs("document.querySelectorAll('.math-zone').length"))>0) break; }
  log('zones', await evalJs("document.querySelectorAll('.math-zone').length"));
}
