export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(1500);
  console.log('debug', await evalJs("(() => { const d=window.__cachedDebug; return d?{ok:d.ok,cached:d.cached,pages:d.pages?.length,error:d.error}:null; })()"));
  console.log('status', await evalJs("document.querySelector('#sbBuildText').textContent"));
  console.log('pages', await evalJs("document.querySelectorAll('.pdf-page').length"));
  await sleep(4000);
  console.log('later', await evalJs("({status:document.querySelector('#sbBuildText').textContent,pages:document.querySelectorAll('.pdf-page').length})"));
}
