export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) { console.log('ready',i+1); break; } await sleep(500); }
  console.log('tx', await evalJs("!!window.__texora"));
  await sleep(3000);
  console.log('env', await evalJs("Object.keys(window.__texora.state.envDefs||{}).length"));
  console.log('outline', await evalJs("window.__texora.state.projectOutline?.length"));
}
