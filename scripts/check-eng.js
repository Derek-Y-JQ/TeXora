export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(5000);
  console.log('engine', await evalJs("window.__texora.state.settings.build.engine"));
  console.log('status', await evalJs("document.querySelector('#sbBuildText').textContent"));
}
