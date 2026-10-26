export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(2500);
  console.log('bib', await evalJs("(window.__texora.state.bibEntries||[]).length"));
  console.log('assets', await evalJs("window.__texora.state.assets.bib"));
}
