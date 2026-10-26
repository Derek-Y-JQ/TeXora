export default async function t({ evalJs, sleep }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  await sleep(3000);
  log('manual2', await evalJs(`(async()=>{
    const rf=window.__texora.state.project.rootFile;
    const res=await window.texora.fs.read(rf);
    const t=res.text||'';
    const lines=t.split(/\\r?\\n/); const pk=[];
    for(const l of lines){ const i=l.indexOf('usepackage'); if(i>=0){ const m=l.match(/\\{([^}]+)\\}/); if(m) m[1].split(',').forEach(p=>pk.push(p.trim())); } }
    const out=await window.texora.tex.envDefs({cls:'siamart220329',packages:pk});
    return {npk:pk.length, n:Object.keys(out.defs||{}).length, local:Object.entries(out.defs||{}).filter(([k])=>['assumption','remark','example'].includes(k))};
  })()`));
  log('state', await evalJs("Object.keys(window.__texora.state.envDefs||{}).length"));
}
