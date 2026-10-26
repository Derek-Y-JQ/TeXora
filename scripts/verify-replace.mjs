export default async function t({ evalJs, sleep }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  log('root', await evalJs("window.__texora.state.project.root"));
  const before=await evalJs("window.__texora.editor.model.getValue().includes('对流扩散')");
  log('before', before);
  log('replace', await evalJs("(async()=>{ const r=await window.texora.search.replace({query:'对流扩散',replacement:'对流-扩散',include:'*.tex'}); return r; })()"));
  await evalJs("window.__texora.app.reloadOpenDocuments()");
  await sleep(500);
  log('after', await evalJs("window.__texora.editor.model.getValue().includes('对流-扩散')"));
  // find bar replace current
  await evalJs("window.__texora.app.openFind(true)");
  await evalJs("document.querySelector('#findInput').value='对流-扩散'; document.querySelector('#findReplace').value='对流扩散'; document.querySelector('#findInput').dispatchEvent(new Event('input',{bubbles:true}))");
  await sleep(600);
  log('count', await evalJs("document.querySelector('#findCount').textContent"));
  await evalJs("document.querySelector('#findReplaceAll').click()");
  await sleep(600);
  log('local after', await evalJs("window.__texora.editor.model.getValue().includes('对流扩散')"));
}
