export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(5000);
  console.log('status', await evalJs("document.querySelector('#sbBuildText').textContent"));
  console.log('pages', await evalJs("document.querySelectorAll('.pdf-page').length"));
  console.log('cachedPdf', await evalJs("window.__texora.state.build.result?.cachedPdf"));
}
