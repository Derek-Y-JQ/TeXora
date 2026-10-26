export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for (let i=0;i<70;i++) { if ((await evalJs("document.querySelectorAll('.pdf-page').length"))>0) break; await sleep(800); }
  await sleep(6000);
  log('version', await evalJs("window.__texora.state.capture?.version"));
  log('brand', await evalJs("(() => { const i=document.querySelector('.brand-mark img'); return i?{w:i.naturalWidth,src:i.src.split('/').pop()}:null; })()"));
  log('wrap group', await evalJs("document.querySelector('#wrapBtn')?.closest('.ribbon-group')?.querySelector('.ribbon-label')?.textContent"));
  log('zones', await evalJs("document.querySelectorAll('.math-zone').length"));
  await shot('.capture/fix/packaged-110-icon.png');
}
