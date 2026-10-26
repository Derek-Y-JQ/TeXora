export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(3000);
  console.log(await evalJs("(async()=>{const r=await window.texora.build.existing();return r;})()"));
  console.log('root', await evalJs("window.__texora.state.project.rootFile"));
}
