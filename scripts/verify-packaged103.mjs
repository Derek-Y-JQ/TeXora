export default async function t({ evalJs, sleep, send, shot }) {
  const log=(k,v)=>console.log(k+': '+JSON.stringify(v));
  for (let i=0;i<80;i++) { await sleep(800); const s=await evalJs("document.querySelector('#sbBuildText').textContent"); if (/成功|失败/.test(s)) break; }
  log('status', await evalJs("document.querySelector('#sbBuildText').textContent"));
  log('pages', await evalJs("document.querySelectorAll('.pdf-page').length"));
  log('links', await evalJs("document.querySelectorAll('.pdf-link').length"));
  log('skills', await evalJs("(window.__texora.state.settings.ai.skills||[]).map(s=>({name:s.name,builtin:!!s.builtin,enabled:s.enabled,scope:s.scope,path:s.path.slice(-40)}))"));
  log('actions', await evalJs("(window.__texora.state.settings.ai.blockActions||[]).map(a=>a.label)"));
  // real click menu toggle
  async function realClick(sel) { const p=await evalJs(`(() => { const e=document.querySelector(${JSON.stringify(sel)}); const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`); await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1}); await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1}); await sleep(350); }
  await realClick('#engineBtn'); log('menu open', await evalJs("document.querySelectorAll('#menuLayer .menu').length"));
  await realClick('#engineBtn'); log('menu close', await evalJs("document.querySelectorAll('#menuLayer .menu').length"));
  // key persistence over reset
  await evalJs("(async()=>{ await window.texora.settings.set('ai.apiKey','sk-test-103'); return true; })()");
  await evalJs("(async()=>{ await window.texora.settings.reset(null); return true; })()");
  await sleep(400);
  log('key after reset', await evalJs("(window.__texora.state.settings.ai.apiKey||'').slice(0,10)"));
  log('theme after reset', await evalJs("window.__texora.state.settings.appearance.theme"));
  await shot('.capture/fix/packaged-103.png');
}
