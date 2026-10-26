export default async function t({ evalJs, sleep }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  await sleep(5000);
  log('rootFile', await evalJs("window.__texora.state.project.rootFile"));
  log('envDefs state', await evalJs("Object.keys(window.__texora.state.envDefs||{}).length"));
  log('manual', await evalJs(`(async()=>{
    const rf=window.__texora.state.project.rootFile;
    const res=await window.texora.fs.read(rf);
    const t=res.text||'';
    const cls=(t.match(/\\\\documentclass(?:\\[[^\\]]*\\])?\\{([^}]+)\\}/)||[])[1]||'';
    const pk=[]; for(const m of t.matchAll(/\\\\usepackage(?:\\[[^\\]]*\\])?\\{([^}]+)\\}/g)) m[1].split(',').forEach(p=>pk.push(p.trim()));
    const st=Date.now(); const out=await window.texora.tex.envDefs({cls,packages:pk});
    return {cls, npk:pk.length, ok:out.ok, n:Object.keys(out.defs||{}).length, ms:Date.now()-st, local:Object.entries(out.defs||{}).filter(([k])=>['assumption','remark','example'].includes(k))};
  })()`));
  log('snippet E', await evalJs("(async()=>{ const r=await window.texora.tex.snippet({code:'\\\\E[X\\\\mid\\\\cF_t]',kind:'math'}); return {ok:r.ok,error:(r.error||'').slice(-90)}; })()"));
}
