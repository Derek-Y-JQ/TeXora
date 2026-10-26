export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  console.log('root', await evalJs("window.__texora.state.project.root"));
  console.log('doc', await evalJs("window.__texora.state.activePath"));
  console.log('status', await evalJs("document.querySelector('#sbBuildText')?.textContent"));
  console.log('settings', await evalJs("({m:window.__texora.state.settings.editor.inlineMathPreview,t:window.__texora.state.settings.editor.tablePreview,k:window.__texora.state.settings.editor.tikzPreview})"));
  await evalJs("window.__texora.editor.refreshMathZones()");
  await sleep(5000);
  console.log('after manual', await evalJs("({z:document.querySelectorAll('.math-zone').length,d:window.__zoneDebug,l:document.querySelectorAll('.math-zone.loading').length})"));
}
