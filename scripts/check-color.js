export default async function t({ evalJs, sleep, shot }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await evalJs("(async()=>{ await window.texora.settings.set('appearance.codeTheme','one-light'); return true; })()");
  await sleep(800);
  console.log('engine', await evalJs("window.__texora.state.settings.build.engine"));
  console.log('theme', await evalJs("window.__texora.state.settings.appearance.codeTheme"));
  console.log('colors', await evalJs(`(() => {
    const spans=[...document.querySelectorAll('.view-line span')].filter(s=>s.textContent.trim().length>2);
    return spans.slice(0,10).map(s=>({t:s.textContent.trim().slice(0,18),c:getComputedStyle(s).color}));
  })()`));
  await shot('.capture/fix/eng-light.png');
}
