export default async function t({ evalJs, sleep }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(5000);
  log('status', await evalJs("document.querySelector('#sbBuildText').textContent"));
  log('pages', await evalJs("document.querySelectorAll('.pdf-page').length"));
  log('cached', await evalJs("window.__texora.state.build.result?.cached"));
  log('existing', await evalJs("(async()=>{const r=await window.texora.build.existing();return {ok:r.ok,cached:r.cached,pages:r.pages?.length};})()"));
}
