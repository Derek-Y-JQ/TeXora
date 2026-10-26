export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  await evalJs("window.__texora.app.openFind(true)");
  await evalJs("document.querySelector('#findInput').value='对流-扩散'; document.querySelector('#findReplace').value='对流扩散'; document.querySelector('#findInput').dispatchEvent(new Event('input',{bubbles:true}))");
  await sleep(500);
  log('count', await evalJs("document.querySelector('#findCount').textContent"));
  await evalJs("document.querySelector('#findReplaceAll').click()");
  await sleep(500);
  log('replaced', await evalJs("window.__texora.editor.model.getValue().includes('对流扩散')"));
  await evalJs("document.querySelector('#findClose').click()");
}
