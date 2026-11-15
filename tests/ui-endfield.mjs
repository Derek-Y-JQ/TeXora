import assert from 'node:assert/strict';

export default async function ({ evalJs, sleep, send, press, shot }) {
  for (let i = 0; i < 100 && !await evalJs('!!window.__texora?.editor?.editor'); i++) await sleep(50);
  assert.ok(await evalJs('!!window.__texora?.editor?.editor'));
  await evalJs('Promise.all([window.__texora.api.settings.set("editor.autosave",false),window.__texora.api.settings.set("build.livePreview",false)])');
  const apply = async (theme, color, accent = 'solar', style = 'endfield') => {
    await evalJs(`(async () => {
      const c = window.__texora;
      const appearance={...c.state.settings.appearance,uiStyle:${JSON.stringify(style)},theme:${JSON.stringify(theme)},endfieldColor:${JSON.stringify(color)},accent:${JSON.stringify(accent)},codeTheme:'auto',uiScale:100,customCss:'',reduceMotion:false};
      await c.api.settings.set('appearance',appearance);
      c.state.settings.appearance=appearance;
      c.state.settings.editor.autosave=false;
      c.state.settings.build.livePreview=false;
      c.app.applyAppearance();
      return true;
    })()`);
    await sleep(180);
  };
  const audit = () => evalJs(`(() => {
    const visible = [...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().width && e.getBoundingClientRect().height && getComputedStyle(e).visibility!=='hidden');
    const label=e=>e.tagName+'.'+String(e.className).slice(0,80);
    return {
      rounded:visible.filter(e=>{const s=getComputedStyle(e);return ['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'].some(k=>parseFloat(s[k])>0)}).map(label),
      shadows:visible.filter(e=>getComputedStyle(e).boxShadow!=='none').map(label),
      gradients:visible.filter(e=>/gradient/.test(getComputedStyle(e).backgroundImage)&&!e.matches('.compile-btn.busy')).map(label)
    };
  })()`);
  const assertGeometry = async () => {
    const a = await audit();
    assert.deepEqual(a.rounded, [], 'Endfield visible UI has square corners');
    assert.deepEqual(a.shadows, [], 'Endfield has no soft shadows');
    assert.deepEqual(a.gradients, [], 'Endfield has no decorative gradients');
  };
  const fingerprint = () => evalJs(`(() => {
    const s=getComputedStyle(document.documentElement);
    return ['--bg','--surface-1','--surface-2','--text','--accent','--accent-2','--border','--border-strong','--success','--warn'].map(k=>s.getPropertyValue(k).trim());
  })()`);
  async function colorAt(selector, property='backgroundColor') {
    return evalJs(`(() => {
      const e=document.querySelector(${JSON.stringify(selector)}),c=document.createElement('canvas');c.width=c.height=1;
      const p=c.getContext('2d');p.fillStyle=getComputedStyle(e)[${JSON.stringify(property)}];p.fillRect(0,0,1,1);
      return [...p.getImageData(0,0,1,1).data].slice(0,3);
    })()`);
  }
  for (const theme of ['light','dark']) for (const color of ['yellow','cyan']) {
    await apply(theme,color);
    const reference = await fingerprint();
    for (const accent of ['violet','blue','emerald','amber','rose','tea','sky','solar']) {
      await apply(theme,color,accent);
      assert.equal(await evalJs('document.documentElement.getAttribute("data-accent")'),null);
      assert.deepEqual(await fingerprint(),reference,'Studio '+accent+' cannot bleed into Endfield');
    }
    await assertGeometry();
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:100});
    const p=await evalJs('(()=>{const r=document.querySelector("#btnBuild").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await sleep(200);
    const signal=color==='cyan'?[20,208,208]:[243,230,123];
    const expected=signal.map(v=>Math.round(v*.84+255*.16));
    const actual=await colorAt('#btnBuild');
    assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<=1),color+' compile hover follows chosen signal: '+actual);
    await shot('.capture/201-'+theme+'-'+color+'-hover.png');
    await evalJs('window.__texora.settingsUI.open("appearance")');await sleep(220);
    assert.equal(await evalJs('getComputedStyle(document.querySelector(".studio-accent-settings")).display'),'none');
    await assertGeometry();
    assert.deepEqual(await colorAt('.theme-swatch.light span:nth-child(2)'),signal);
    assert.deepEqual(await colorAt('.theme-swatch.dark span:nth-child(2)'),signal);
    const neutral=await colorAt('.theme-swatch.system span:nth-child(1)');
    assert.ok(Math.max(...neutral)-Math.min(...neutral)<=8,'system preview stays neutral');
    assert.ok(await evalJs('getComputedStyle(document.querySelector(".settings-section-title")).fontFamily.includes("Saira")'));
    await press('Tab','Tab',9);
    assert.ok(await evalJs('document.querySelector(".settings-modal").contains(document.activeElement)'),'settings retains keyboard focus');
    assert.ok(await evalJs('getComputedStyle(document.activeElement).outlineStyle!=="none"'),'keyboard focus remains visible');
    await shot('.capture/201-'+theme+'-'+color+'-settings.png');
    await evalJs('window.__texora.settingsUI.close()');
  }
  // Common dialogs and dense controls must inherit the same geometry.
  for (const method of ['openTemplates','openEnvironmentPicker','openSymbols','openTableWizard','openAbout']) {
    await evalJs('window.__texora.dialogs.'+method+'()');await sleep(180);await assertGeometry();
    await evalJs('window.__texora.dialogs.close()');
  }
  await evalJs(`(() => {
    const e=window.__texora.editor;
    e.model.setValue('\\\\begin{tikzp}');e.editor.setPosition({lineNumber:1,column:13});e.editor.focus();
    e.editor.trigger('test','editor.action.triggerSuggest',{});return true;
  })()`);
  for(let i=0;i<80&&!await evalJs('!!document.querySelector(".suggest-widget.visible")');i++)await sleep(30);
  assert.ok(await evalJs('!!document.querySelector(".suggest-widget.visible")'));
  await assertGeometry();
  assert.deepEqual(await colorAt('.suggest-widget.visible'),[34,34,34],'editor completion chrome follows Endfield');
  await shot('.capture/201-cyan-completions.png');
  await evalJs('window.__texora.editor.editor.trigger("test","hideSuggestWidget",{})');
  await evalJs('window.__texora.settingsUI.open("appearance")');
  await send('Emulation.setDeviceMetricsOverride',{width:900,height:800,deviceScaleFactor:1,mobile:false});
  await sleep(200);await assertGeometry();
  assert.ok(await evalJs('document.documentElement.scrollWidth<=innerWidth'),'narrow window does not overflow');
  await shot('.capture/201-narrow-settings.png');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await evalJs('window.__texora.api.window.setZoom(2)');await sleep(250);await assertGeometry();
  assert.ok(await evalJs('document.documentElement.scrollWidth<=innerWidth'),'200% zoom does not overflow');
  await shot('.capture/201-zoom-settings.png');
  await evalJs('window.__texora.api.window.setZoom(1);window.__texora.state.settings.appearance.reduceMotion=true;window.__texora.app.applyAppearance()');
  assert.equal(await evalJs('getComputedStyle(document.querySelector(".modal")).animationName'),'none');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await evalJs('window.__texora.state.settings.appearance.reduceMotion=false;window.__texora.app.applyAppearance()');
  assert.equal(await evalJs('getComputedStyle(document.querySelector(".modal")).animationName'),'none');
  await send('Emulation.setEmulatedMedia',{features:[]});
  await evalJs('window.__texora.settingsUI.close()');
  await apply('dark','cyan','blue','studio');
  assert.equal(await evalJs('document.documentElement.dataset.accent'),'blue');
  assert.notEqual(await evalJs('getComputedStyle(document.querySelector(".cmdk")).borderRadius'),'0px','Studio geometry is restored');
  console.log('PASS Endfield light/dark × yellow/cyan, 8 Studio presets, real compile hover, settings/dialog geometry, keyboard focus, 900px/200%, motion preferences and Studio restore');
}
