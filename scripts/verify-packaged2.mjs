export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for (let i=0;i<80;i++) { await sleep(800); const s=await evalJs("document.querySelector('#sbBuildText').textContent"); if (/成功|失败/.test(s)) break; }
  await sleep(1200);
  log('punct buttons', await evalJs("document.querySelectorAll('[data-cmd=\"format.punctHalf\"],[data-cmd=\"format.punctFull\"]').length"));
  log('wrap button', await evalJs("!!document.querySelector('#wrapBtn')"));
  log('SUB badges', await evalJs("document.querySelectorAll('.tree-tag.sub').length"));
  log('autoInsertEndEnv', await evalJs("typeof window.__texora.editor.autoInsertEndEnv"));
  log('pdf link click', await evalJs("(() => { const a=document.querySelector('.pdf-link'); if(!a) return null; a.click(); return true; })()"));
  await sleep(600);
  log('page after click', await evalJs("document.querySelector('#pageCurrent').textContent"));
  await shot('.capture/fix/packaged-102.png');
}
