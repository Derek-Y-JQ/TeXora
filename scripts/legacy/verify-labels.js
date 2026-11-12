export default async function t({ evalJs, sleep, shot }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(2000);
  await evalJs("window.__texora.cmd('view.sidebar','labels')");
  await sleep(800);
  console.log('rows', await evalJs("document.querySelectorAll('.label-row').length"));
  console.log('metrics', await evalJs("(() => { const r=[...document.querySelectorAll('.label-row')].find(x=>x.textContent.includes('very-long')); if(!r) return null; const n=r.querySelector('.l-name'); return {rowH:r.getBoundingClientRect().height,nameH:n.getBoundingClientRect().height,sw:n.scrollWidth,cw:n.clientWidth}; })()"));
  await shot('.capture/fix/labels-long.png');
}
