export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for (let i=0;i<50;i++) { if ((await evalJs("document.querySelectorAll('.pdf-page').length"))>0) break; await sleep(700); }
  await sleep(1500);
  log('brand img', await evalJs("(() => { const i=document.querySelector('.brand-mark img'); return i?{loaded:i.complete&&i.naturalWidth>0,w:i.naturalWidth}:null; })()"));
  log('beta', await evalJs("document.querySelector('.brand-beta')?.textContent"));
  log('wrap group', await evalJs("(() => { const b=document.querySelector('#wrapBtn'); const g=b?.closest('.ribbon-group'); return g?{label:g.querySelector('.ribbon-label')?.textContent, inTail:!!b.closest('.ribbon-tail')}:null; })()"));
  log('wrap active', await evalJs("document.querySelector('#wrapBtn')?.classList.contains('active')"));
  log('pages', await evalJs("document.querySelectorAll('.pdf-page').length"));
  await shot('.capture/fix/ribbon-110.png');
  await evalJs("window.__texora.cmd('view.toggleTheme')");
  await sleep(700);
  await shot('.capture/fix/ribbon-110-light.png');
}
