import assert from 'node:assert/strict';
import path from 'node:path';
export default async function({evalJs,click,sleep,shot,send}) {
  const root=path.resolve('.capture/verify135-project');
  async function waitFor(expr, count=200){for(let i=0;i<count;i++){if(await evalJs(expr))return;await sleep(100);}throw Error('Timed out '+expr);}
  await waitFor('!!window.__texora?.editor.model');
  assert.equal(await evalJs('(async()=>(await window.texora.info()).version)()'),'1.3.5');
  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await evalJs("(()=>{const c=window.__texora;c.state.settings.build.livePreview=false;c.state.settings.files.autoSave=false;const e=c.editor,m=e.model,p=m.getPositionAt(m.getValue().indexOf('x^2')+3);e.editor.revealLineInCenter(p.lineNumber);e.editor.setPosition(p);e.editor.focus();window.__scroll=e.editor.getScrollTop();return true;})()");
  await waitFor('!!document.querySelector(".live-math-body .katex")');
  await sleep(250);
  await evalJs('window.__scroll=window.__texora.editor.editor.getScrollTop()');
  assert.equal(await evalJs('window.__texora.editor.mathZones.length'),0);
  await evalJs("(()=>{window.__liveHidden=false;const el=document.querySelector('.live-math');window.__observer=new MutationObserver(()=>{if(el.style.display==='none')window.__liveHidden=true;});window.__observer.observe(el,{attributes:true,attributeFilter:['style']});return true;})()");
  for(const ch of '+12345') {
    await evalJs(`window.__texora.editor.editor.trigger('keyboard','type',{text:${JSON.stringify(ch)}})`);
    await sleep(130);
    assert.equal(await evalJs('document.querySelector(".live-math").style.display'),'block');
    assert.ok(await evalJs('document.querySelector(".live-math-body").textContent.includes('+JSON.stringify(ch)+')'));
  }
  assert.equal(await evalJs('window.__liveHidden'),false);
  assert.ok(await evalJs('Math.abs(window.__texora.editor.editor.getScrollTop()-window.__scroll)<2'));
  assert.ok(await evalJs("(()=>{const e=window.__texora.editor,p=e.editor.getScrolledVisiblePosition(e.editor.getPosition()),host=document.querySelector('#editorHost').getBoundingClientRect(),r=document.querySelector('.live-math').getBoundingClientRect();return r.bottom<=host.top+p.top-3 || r.top>=host.top+p.top+p.height+3;})()"));
  await shot('docs/screenshots/135-live-math.png');
  await waitFor('document.querySelector(".live-math-status")?.textContent==="本地 TeX 预览"',300);
  // Unfinished formula retains the previous preview rather than removing the card.
  await evalJs("window.__texora.editor.editor.trigger('keyboard','type',{text:'+'+String.fromCharCode(92)+'frac{'})");
  await sleep(150); assert.equal(await evalJs('document.querySelector(".live-math").style.display'),'block');
  assert.ok(await evalJs('!!document.querySelector(".live-math-body img, .live-math-body .katex")'));
  await evalJs("window.__texora.editor.editor.trigger('keyboard','undo',null)");
  // Scroll: overlay tracks the formula; no view zones are inserted.
  await evalJs('window.__texora.editor.editor.setScrollTop(window.__scroll+30)');
  await sleep(200);assert.equal(await evalJs('window.__texora.editor.mathZones.length'),0);
  await evalJs(`(async()=>{await window.__texora.app.openDocument(${JSON.stringify(path.join(root,'child.tex'))});return true;})()`);
  await evalJs("(()=>{const e=window.__texora.editor,m=e.model;e.editor.setPosition(m.getPositionAt(m.getValue().indexOf('Inner target')+4));return true;})()");
  for(const option of ['label=\\roman*.','nosep','label=(\\arabic*)'])await evalJs(`(async()=>{await window.__texora.app.setEnumLabel(${JSON.stringify(option)});return true;})()`);
  assert.ok(await evalJs('window.__texora.editor.model.getValue().includes("[nosep,label=("+String.fromCharCode(92)+"arabic*)]")'));
  assert.equal(await evalJs("window.__texora.state.docs.get(window.__texora.state.project.rootFile).model.getValue().split('\\\\usepackage{enumitem}').length-1"),1);
  await evalJs("(async()=>{await window.__texora.app.setEnumLabel('label=（'+String.fromCharCode(92)+'chinese*）');return true;})()");
  // Font choice from a child must update only the root and replace existing commands.
  await evalJs("(async()=>{await window.__texora.app.applyLocalFont('latin','Arial');await window.__texora.app.applyLocalFont('latin','Times New Roman');return true;})()");
  assert.ok(await evalJs("window.__texora.state.docs.get(window.__texora.state.project.rootFile).model.getValue().includes('\\\\setmainfont{Times New Roman}')"));
  assert.equal(await evalJs("window.__texora.state.docs.get(window.__texora.state.project.rootFile).model.getValue().split('\\\\setmainfont').length-1"),1);
  assert.equal(await evalJs("window.__texora.editor.model.getValue().includes('setmainfont')"),false);
  await evalJs("(async()=>{await window.__texora.cmd('build.run');return true;})()");
  await waitFor('!!window.__texora.state.build.result?.ok',600);
  await shot('docs/screenshots/135-enumerate.png');
  await evalJs('(async()=>{await window.__texora.dialogs.openAbout();return true;})()');
  await waitFor('document.querySelector(".about-mark img")?.naturalWidth>0');
  await shot('docs/screenshots/135-about.png');
  await evalJs("document.querySelector('.modal-layer .modal-close, .modal-layer [data-dialog-btn]')?.click()");
  assert.ok(await evalJs('document.querySelector("#updateBtn").getBoundingClientRect().left<document.querySelector("#settingsBtn").getBoundingClientRect().left'));
  await click('#updateBtn'); await waitFor('!document.querySelector("#updateBtn").disabled',400);
  console.log('PASS 1.3.5 UI: continuous floating math, stable scroll, caret avoidance, native TeX, unfinished formula persistence, zero view zones, nested enumeration + packages, Chinese labels compilation, root font replacement, About icon and update button.');
}
