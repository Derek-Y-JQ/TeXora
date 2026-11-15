import assert from 'node:assert/strict';

/** Endfield accents (fills only). Ink text on each must reach 7:1. */
const SIGNALS = { yellow: [255, 250, 0], lime: [184, 255, 61], ice: [125, 230, 255], amber: [255, 179, 31] };
const INK = [22, 22, 22];
const luminance = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

export default async function ({ evalJs, sleep, send, press, shot }) {
  for (let i = 0; i < 100 && !await evalJs('!!window.__texora?.editor?.editor'); i++) await sleep(50);
  assert.ok(await evalJs('!!window.__texora?.editor?.editor'));
  await evalJs('Promise.all([window.__texora.api.settings.set("editor.autosave",false),window.__texora.api.settings.set("build.livePreview",false)])');
  for (const [name, rgb] of Object.entries(SIGNALS)) assert.ok(contrast(INK, rgb) >= 7, name + ' carries ink text at 7:1 or better');
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
    const headers=await evalJs('({source:document.querySelector(".tabstrip").getBoundingClientRect().bottom,pdf:document.querySelector(".preview-toolbar").getBoundingClientRect().bottom})');
    assert.ok(Math.abs(headers.source-headers.pdf)<=1,'PDF toolbar rule aligns with the source tabstrip rule');
    const a = await audit();
    assert.deepEqual(a.rounded, [], 'Endfield visible UI has square corners');
    assert.deepEqual(a.shadows, [], 'Endfield has no soft shadows');
    assert.deepEqual(a.gradients, [], 'Endfield has no decorative gradients');
  };
  const fingerprint = () => evalJs(`(() => {
    const s=getComputedStyle(document.documentElement);
    return ['--bg','--surface-1','--surface-2','--text','--accent','--accent-2','--border','--border-strong','--success','--warn'].map(k=>s.getPropertyValue(k).trim());
  })()`);
  async function colorAt(selector, property='backgroundColor', pseudo=null) {
    return evalJs(`(() => {
      const e=document.querySelector(${JSON.stringify(selector)}),c=document.createElement('canvas');c.width=c.height=1;
      const p=c.getContext('2d');p.fillStyle=getComputedStyle(e,${JSON.stringify(pseudo)})[${JSON.stringify(property)}];p.fillRect(0,0,1,1);
      return [...p.getImageData(0,0,1,1).data].slice(0,3);
    })()`);
  }
  for (const theme of ['light','dark']) for (const color of Object.keys(SIGNALS)) {
    const signal = SIGNALS[color];
    await apply(theme,color);
    assert.equal(await evalJs('document.documentElement.dataset.efAccent'),color);
    const reference = await fingerprint();
    for (const accent of ['violet','blue','emerald','amber','rose','tea','sky','solar']) {
      await apply(theme,color,accent);
      assert.equal(await evalJs('document.documentElement.getAttribute("data-accent")'),null);
      assert.deepEqual(await fingerprint(),reference,'Studio '+accent+' cannot bleed into Endfield');
    }
    await assertGeometry();
    // Where you are: the current side-rail cell is filled with the accent and carries ink.
    assert.deepEqual(await colorAt('.act-btn.active'),signal,color+' marks the current panel');
    assert.deepEqual(await colorAt('.act-btn.active','color'),INK);
    // Compile rests in the theme's ink; pointing at it wipes the chosen accent across.
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:400});await sleep(350);
    const restingInk=theme==='light'?INK:[237,237,237];
    const restingText=theme==='light'?[255,255,255]:[34,34,34];
    assert.deepEqual(await colorAt('#btnBuild'),restingInk,'compile rests in neutral ink');
    assert.deepEqual(await colorAt('.split-btn .btn-caret'),restingInk,'compile options use neutral ink');
    assert.deepEqual(await colorAt('#btnBuild','color'),restingText);
    assert.notEqual(await evalJs('getComputedStyle(document.querySelector("#btnBuild"),"::before").transform'),'none','wipe is parked off the button at rest');
    const p=await evalJs('(()=>{const r=document.querySelector("#btnBuild").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await sleep(400);
    const wipe=await colorAt('#btnBuild','backgroundColor','::before');
    assert.deepEqual(wipe,signal,color+' wipes across the compile button');
    assert.equal(await evalJs('getComputedStyle(document.querySelector("#btnBuild"),"::before").transform'),'none');
    assert.deepEqual(await colorAt('#btnBuild','color'),INK,'text on the accent is ink');
    await shot('.capture/202-'+theme+'-'+color+'-hover.png');
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:10,y:400});
    await evalJs('window.__texora.settingsUI.open("appearance")');await sleep(320);
    assert.equal(await evalJs('getComputedStyle(document.querySelector(".studio-accent-settings")).display'),'none');
    assert.notEqual(await evalJs('getComputedStyle(document.querySelector(".ef-accent-settings")).display'),'none');
    assert.deepEqual(await evalJs('[...document.querySelectorAll("[data-ef-accent-choice]")].map(b=>b.dataset.efAccentChoice)'),Object.keys(SIGNALS));
    assert.deepEqual(await evalJs('[...document.querySelectorAll("[data-ef-accent-choice][aria-pressed=true]")].map(b=>b.dataset.efAccentChoice)'),[color],'the picker marks the accent in use');
    for (const [name,rgb] of Object.entries(SIGNALS)) assert.deepEqual(await colorAt('[data-ef-accent-choice="'+name+'"] .ef-accent-swatch'),rgb);
    assert.deepEqual(await colorAt('.settings-nav-item.active'),signal);
    await assertGeometry();
    assert.deepEqual(await colorAt('.theme-swatch.light span:nth-child(2)'),signal);
    assert.deepEqual(await colorAt('.theme-swatch.dark span:nth-child(2)'),signal);
    const neutral=await colorAt('.theme-swatch.system span:nth-child(1)');
    assert.ok(Math.max(...neutral)-Math.min(...neutral)<=8,'system preview stays neutral');
    assert.ok(await evalJs('getComputedStyle(document.querySelector(".settings-section-title")).fontFamily.includes("Saira")'));
    await press('Tab','Tab',9);
    assert.ok(await evalJs('document.querySelector(".settings-modal").contains(document.activeElement)'),'settings retains keyboard focus');
    assert.ok(await evalJs('getComputedStyle(document.activeElement).outlineStyle!=="none"'),'keyboard focus remains visible');
    await shot('.capture/202-'+theme+'-'+color+'-settings.png');
    await evalJs('window.__texora.settingsUI.close()');
  }
  // Picking an accent in settings applies and stores it at once.
  await apply('dark','yellow');
  await evalJs('window.__texora.settingsUI.open("appearance")');await sleep(320);
  await evalJs('document.querySelector("[data-ef-accent-choice=amber]").click()');await sleep(300);
  assert.equal(await evalJs('document.documentElement.dataset.efAccent'),'amber');
  assert.equal(await evalJs('window.__texora.state.settings.appearance.endfieldColor'),'amber');
  assert.equal(await evalJs('document.querySelector("[data-ef-accent-choice=amber]").getAttribute("aria-pressed")'),'true');
  assert.deepEqual(await colorAt('.settings-nav-item.active'),SIGNALS.amber);
  await evalJs('window.__texora.settingsUI.close()');
  // A profile saved by 2.0.1 with the old cyan lands on ice.
  await apply('dark','cyan');
  assert.equal(await evalJs('document.documentElement.dataset.efAccent'),'ice');
  // Common dialogs and dense controls must inherit the same geometry.
  for (const method of ['openTemplates','openEnvironmentPicker','openSymbols','openTableWizard','openAbout']) {
    await evalJs('window.__texora.dialogs.'+method+'()');await sleep(320);await assertGeometry();
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
  await shot('.capture/202-ice-completions.png');
  await evalJs('window.__texora.editor.editor.trigger("test","hideSuggestWidget",{})');
  await evalJs('window.__texora.settingsUI.open("appearance")');
  await send('Emulation.setDeviceMetricsOverride',{width:900,height:800,deviceScaleFactor:1,mobile:false});
  await sleep(320);await assertGeometry();
  assert.ok(await evalJs('document.documentElement.scrollWidth<=innerWidth'),'narrow window does not overflow');
  await shot('.capture/202-narrow-settings.png');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await evalJs('window.__texora.api.window.setZoom(2)');await sleep(350);await assertGeometry();
  assert.ok(await evalJs('document.documentElement.scrollWidth<=innerWidth'),'200% zoom does not overflow');
  await shot('.capture/202-zoom-settings.png');
  await evalJs('window.__texora.api.window.setZoom(1);window.__texora.state.settings.appearance.reduceMotion=true;window.__texora.app.applyAppearance()');
  assert.equal(await evalJs('getComputedStyle(document.querySelector(".modal")).animationName'),'none');
  assert.equal(await evalJs('getComputedStyle(document.querySelector("#btnBuild"),"::before").transitionDuration'),'0s','the wipe is off under reduced motion');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await evalJs('window.__texora.state.settings.appearance.reduceMotion=false;window.__texora.app.applyAppearance()');
  assert.equal(await evalJs('getComputedStyle(document.querySelector(".modal")).animationName'),'none');
  await send('Emulation.setEmulatedMedia',{features:[]});
  await evalJs('window.__texora.settingsUI.close()');
  await apply('dark','ice','blue','studio');
  assert.equal(await evalJs('document.documentElement.dataset.accent'),'blue');
  assert.notEqual(await evalJs('getComputedStyle(document.querySelector(".cmdk")).borderRadius'),'0px','Studio geometry is restored');
  await evalJs('window.__texora.settingsUI.open("appearance")');await sleep(320);
  assert.equal(await evalJs('getComputedStyle(document.querySelector(".ef-accent-settings")).display'),'none','the Endfield accent picker is hidden in Studio');
  await evalJs('window.__texora.settingsUI.close()');
  console.log('PASS Endfield light/dark × yellow/lime/ice/amber, ink-on-accent contrast, 8 Studio presets, accent compile button and wipe, accent picker, legacy cyan, settings/dialog geometry, keyboard focus, 900px/200%, motion preferences and Studio restore');
}
