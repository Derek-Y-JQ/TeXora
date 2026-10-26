export default async function t({ evalJs, sleep }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  log('version', await evalJs("window.__texora.state.capture?.version"));
  await sleep(2500);
  log('outline', await evalJs("({n:window.__texora.state.projectOutline?.length,files:[...new Set((window.__texora.state.projectOutline||[]).map(x=>x.rel))].length})"));
  log('fonts', await evalJs("(async()=>{const r=await window.texora.systemFonts();return (r.fonts||[]).length;})()"));
  log('themes', await evalJs("window.__texora.state.settings.appearance.codeTheme"));
  for(let i=0;i<25;i++){ await sleep(1000); if((await evalJs("document.querySelectorAll('.math-zone').length"))>0) break; }
  log('zones', await evalJs("document.querySelectorAll('.math-zone').length"));
}
