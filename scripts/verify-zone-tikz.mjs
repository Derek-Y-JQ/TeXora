export default async function t({ evalJs, sleep, shot }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  await sleep(6000);
  const ln=await evalJs("(() => { const e=window.__texora.state.parsed.environments.find(x=>x.env==='tikzpicture'); return e?e.line:0; })()");
  await evalJs(`window.__texora.editor.editor.revealLineInCenter(${ln})`);
  await sleep(800);
  console.log('zone visible', await evalJs("(() => { const z=document.querySelector('.math-zone'); if(!z) return null; const r=z.getBoundingClientRect(); return {h:r.height,img:!!z.querySelector('img'),src:(z.querySelector('img')||{}).src?.slice(-20)}; })()"));
  await shot('.capture/fix/zone-tikz.png');
  await evalJs("window.__texora.app.openFind(false)");
  await sleep(300);
  console.log('find top', await evalJs("document.querySelector('#findBar').getBoundingClientRect().top"));
  await shot('.capture/fix/find-top2.png');
}
