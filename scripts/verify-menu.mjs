export default async function t({ evalJs, sleep, send }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  async function realClick(sel, label) {
    const p = await evalJs(`(() => { const e=document.querySelector(${JSON.stringify(sel)}); const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
    await send('Input.dispatchMouseEvent', { type:'mousePressed', x:p.x, y:p.y, button:'left', clickCount:1 });
    await sleep(60);
    const afterDown = await evalJs("document.querySelectorAll('#menuLayer .menu').length");
    await send('Input.dispatchMouseEvent', { type:'mouseReleased', x:p.x, y:p.y, button:'left', clickCount:1 });
    await sleep(350);
    const afterUp = await evalJs("document.querySelectorAll('#menuLayer .menu').length");
    log(label, {afterDown, afterUp});
  }
  await evalJs("window.__menuDebug = []");
  await realClick('#engineBtn','click1');
  await realClick('#engineBtn','click2');
  log('debug', await evalJs("window.__menuDebug.map(d=>({ev:d.ev,same:d.same,had:d.had,isOpen:d.isOpen,stack:(d.stack||'').slice(0,150)}))"));
}
