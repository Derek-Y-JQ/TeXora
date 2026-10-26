export default async function t({ evalJs, sleep }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  await sleep(2500);
  log('envDefs', await evalJs("Object.keys(window.__texora.state.envDefs||{}).length"));
  log('snippet E', await evalJs("(async()=>{ const r=await window.texora.tex.snippet({code:'\\\\E[X\\\\mid\\\\cF_t]',kind:'math'}); return {ok:r.ok,error:(r.error||'').slice(-180)}; })()"));
  log('snippet plain', await evalJs("(async()=>{ const r=await window.texora.tex.snippet({code:'\\\\frac{a}{b}',kind:'math'}); return {ok:r.ok,error:(r.error||'').slice(-120)}; })()"));
}
