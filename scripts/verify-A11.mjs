export default async function t({ evalJs, sleep }) {
  await sleep(2500);
  console.log('read', await evalJs("(async()=>{ const rf=window.__texora.state.project.rootFile; const r=await window.texora.fs.read(rf); return {ok:r.ok,keys:Object.keys(r),len:(r.text||'').length,has:(r.text||'').includes('usepackage')}; })()"));
  console.log('defs direct', await evalJs("(async()=>{ const r=await window.texora.tex.envDefs({cls:'siamart220329',packages:['amsmath','amsthm']}); return {ok:r.ok,n:Object.keys(r.defs||{}).length,err:r.error,local:Object.entries(r.defs||{}).filter(([k])=>['assumption','remark','example'].includes(k))}; })()"));
}
