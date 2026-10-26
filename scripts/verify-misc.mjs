export default async function t({ evalJs, sleep, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  // env markers on paper section
  await evalJs("(async()=>{ await window.__texora.cmd('doc.open', window.__texora.state.project.root + '\\\\sections\\\\analysis.tex'); return true; })()");
  await sleep(4000);
  log('squiggles', await evalJs("({info:document.querySelectorAll('.squiggly-info').length,warn:document.querySelectorAll('.squiggly-warning').length,err:document.querySelectorAll('.squiggly-error').length})"));
  // global replace IPC on demo copy (separate project requires reopen, do via direct API on replacedemo path)
  log('replace', await evalJs("(async()=>{ const r=await window.texora.search.replace({query:'对流扩散',replacement:'对流-扩散',include:'*.tex'}); return r; })()"));
  // font insert on paper? use fontdemo project via api fs read/write + app? reopen project fontdemo
  await evalJs("(async()=>{ const p=await window.texora.project.open(window.__texora.state.project.root.replace('samples\\\\paper','.tmp\\\\fontdemo')); return {ok:p.ok}; })()");
  await sleep(4000);
  await evalJs("window.__texora.app.applyLocalFont('cjk','Microsoft YaHei')");
  await sleep(800);
  log('font position', await evalJs("(() => { const t=window.__texora.editor.model.getValue(); const b=t.indexOf('\\\\begin{document}'); const i=t.indexOf('\\\\setCJKmainfont'); const d=t.indexOf('\\\\documentclass'); return {doc:d,font:i,begin:b,ok:i>d&&i<b,head:t.slice(Math.max(0,i-80),i+60)}; })()"));
  await shot('.capture/fix/font-insert.png');
  // ignore warnings toggle
  await evalJs("(async()=>{ await window.texora.settings.set('editor.ignoreWarnings',true); return true; })()");
  await sleep(600);
  log('ignore setting', await evalJs("window.__texora.state.settings.editor.ignoreWarnings"));
  await evalJs("(async()=>{ await window.texora.settings.set('editor.ignoreWarnings',false); return true; })()");
}
