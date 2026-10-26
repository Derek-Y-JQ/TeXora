export default async function t({ evalJs, sleep }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  for(let i=0;i<40;i++){ await sleep(1000); const s=await evalJs("document.querySelector('#sbBuildText').textContent"); if(/成功|失败/.test(s)) break; }
  log('markers before', await evalJs("window.__monaco.editor.getModelMarkers({owner:'texora'}).reduce((a,m)=>(a[m.severity]=(a[m.severity]||0)+1,a),{})"));
  log('problems', await evalJs("(window.__texora.state.problems||[]).reduce((a,p)=>(a[p.severity]=(a[p.severity]||0)+1,a),{})"));
  await evalJs("(async()=>{ await window.texora.settings.set('editor.ignoreWarnings',true); return true; })()");
  await sleep(800);
  log('markers after', await evalJs("window.__monaco.editor.getModelMarkers({owner:'texora'}).reduce((a,m)=>(a[m.severity]=(a[m.severity]||0)+1,a),{})"));
  log('problems after', await evalJs("(window.__texora.state.problems||[]).reduce((a,p)=>(a[p.severity]=(a[p.severity]||0)+1,a),{})"));
  await evalJs("(async()=>{ await window.texora.settings.set('editor.ignoreWarnings',false); return true; })()");
}
