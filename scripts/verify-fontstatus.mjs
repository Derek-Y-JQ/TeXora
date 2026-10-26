export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  await sleep(25000);
  console.log('status', await evalJs("document.querySelector('#sbBuildText').textContent"));
  console.log('problems', await evalJs("window.__texora.state.problems?.length||0"));
}
