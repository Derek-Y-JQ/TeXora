export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(2000);
  console.log('debug', await evalJs("window.__cachedDebug"));
  console.log('existing', await evalJs("(async()=>{const r=await window.texora.build.existing();return {ok:r.ok,error:r.error,pages:r.pages?.length,cached:r.cached,pdf:r.cachedPdf};})()"));
  console.log('root', await evalJs("window.__texora.state.project.root"));
}
