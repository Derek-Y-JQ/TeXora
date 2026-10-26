export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await evalJs("(async()=>{ await window.__texora.cmd('doc.open', window.__texora.state.project.root + '\\\\appendix\\\\proofs.tex'); return true; })()");
  for(let i=0;i<70;i++){ await sleep(1000); const d=await evalJs("window.__zoneDebug"); if(d) break; }
  console.log('zones', await evalJs("document.querySelectorAll('.math-zone').length"));
  console.log('imgs', await evalJs("document.querySelectorAll('.math-zone img').length"));
  console.log('failed', await evalJs("document.querySelectorAll('.math-zone.failed').length"));
  console.log('debug', await evalJs("window.__zoneDebug"));
}
