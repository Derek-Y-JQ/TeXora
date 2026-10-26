export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for (let i=0;i<80;i++) { await sleep(800); const s=await evalJs("document.querySelector('#sbBuildText').textContent"); if (/成功|失败/.test(s)) break; }
  await sleep(1500);
  log('status', await evalJs("document.querySelector('#sbBuildText').textContent"));
  log('pages', await evalJs("document.querySelectorAll('.pdf-page').length"));
  log('pdf links', await evalJs("document.querySelectorAll('.pdf-link').length"));
  log('caret buttons', await evalJs("document.querySelectorAll('.btn-caret').length"));
  log('punct buttons', await evalJs("document.querySelectorAll('[data-cmd^=format\\.punct]').length"));
  log('wrap button', await evalJs("!!document.querySelector('#wrapBtn')"));
  log('SUB badges', await evalJs("document.querySelectorAll('.tree-tag.sub').length"));
  log('block/ai js', await evalJs("typeof window.__texora.editor.autoInsertEndEnv"));
  await shot('.capture/fix/packaged-102.png');
}
