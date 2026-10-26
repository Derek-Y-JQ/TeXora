export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(8000);
  console.log('status', await evalJs("document.querySelector('#sbBuildText').textContent"));
  console.log('pages', await evalJs("document.querySelectorAll('.pdf-page').length"));
  console.log('cached', await evalJs("window.__texora.state.build.result?.cached"));
  console.log('running', await evalJs("window.__texora.state.build.running"));
}
