export default async function t({ evalJs, sleep }) {
  for(let i=0;i<50;i++){ await sleep(1000); if(await evalJs("!!window.__texora")) { console.log('ready at',i+1); return; } }
  console.log('not ready after 50s');
  console.log('err?', await evalJs("(() => { try { return {sidebar:!!document.querySelector('.outline-file'), root:!!document.querySelector('#projectName')}; } catch(e){return e.message;} })()"));
}
