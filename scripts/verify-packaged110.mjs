export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for (let i=0;i<70;i++) { if ((await evalJs("document.querySelectorAll('.pdf-page').length"))>0) break; await sleep(800); }
  await sleep(1500);
  log('version', await evalJs("window.__texora.state.capture?.version"));
  log('wrap group', await evalJs("(() => { const b=document.querySelector('#wrapBtn'); const g=b?.closest('.ribbon-group'); return g?g.querySelector('.ribbon-label')?.textContent:null; })()"));
  log('brand img', await evalJs("(() => { const i=document.querySelector('.brand-mark img'); return i?{loaded:i.complete&&i.naturalWidth>0,w:i.naturalWidth}:null; })()"));
  log('beta', await evalJs("document.querySelector('.brand-beta')?.textContent"));
  log('pages', await evalJs("document.querySelectorAll('.pdf-page').length"));
  log('zones', await evalJs("document.querySelectorAll('.math-zone').length"));
  log('status', await evalJs("document.querySelector('#sbBuildText').textContent"));
  await shot('.capture/fix/packaged-110.png');
}
