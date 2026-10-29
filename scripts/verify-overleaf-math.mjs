import assert from 'node:assert/strict';
export default async function({evalJs,sleep,send,click,shot}){
 for(let i=0;i<100;i++){if(await evalJs('!!window.__texora?.editor.model'))break;await sleep(50);}
 await evalJs(`(()=>{const c=window.__texora;c.state.settings.build.livePreview=false;c.state.settings.files.autoSave=false;c.state.settings.editor.autoCloseBrackets=true;c.editor.editor.updateOptions({quickSuggestions:false,suggestOnTriggerCharacters:false});return true;})()`);
 const set=async text=>{await evalJs(`(()=>{const e=window.__texora.editor;e.model.setValue(${JSON.stringify(text)});e.editor.setPosition(e.model.getPositionAt(e.model.getValueLength()));e.editor.editor; e.editor.focus();return true;})()`);await sleep(80);};
 const key=async(key,code,vk)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk});await sleep(80);};
 const value=async()=> (await evalJs('window.__texora.editor.model.getValue()')).replace(/\r\n/g,'\n');
 for(const eol of [0,1]){await set('\\[');await evalJs('window.__texora.editor.model.setEOL('+eol+');true');await key('Enter','Enter',13);assert.equal(await value(),'\\[\n  \n\\]');assert.equal(await evalJs('window.__texora.editor.editor.getPosition().column'),3);}
 await set('$$');await key('Enter','Enter',13);assert.equal(await value(),'$$\n  \n$$');
 for(const [k,c,v]of [['Tab','Tab',9],['ArrowRight','ArrowRight',39],['$','Digit4',52]]){
  await set('$a+1');assert.ok(await evalJs('!!window.__texora.editor.dollarGhost'));
  assert.ok(await evalJs('!!document.querySelector(".texora-dollar-ghost")'));
  await key(k,c,v);assert.equal(await value(),'$a+1$');assert.equal(await evalJs('window.__texora.editor.dollarGhost'),null);
 }
 await set('');await send('Input.insertText',{text:'$'});await sleep(80);assert.equal(await value(),'$');assert.ok(await evalJs('!!window.__texora.editor.dollarGhost'));
 await shot('.capture/overleaf-math/inline-ghost.png');
 await set('');await send('Input.insertText',{text:'$'});await sleep(50);await key('$','Digit4',52);await key('Enter','Enter',13);assert.equal(await value(),'$$\n  \n$$');
 await set('');await send('Input.insertText',{text:'\\'});await send('Input.insertText',{text:'['});await sleep(50);await key('Enter','Enter',13);assert.equal(await value(),'\\[\n  \n\\]');

 // Mock the application bridge for UI-only coverage; backend sync has separate tests.
 await evalJs(`(()=>{const c=window.__texora;c.api={...c.api,overleaf:{binding:async()=>({ok:true,binding:{id:'123456789012345678901234',name:'中文论文'}}),projects:async()=>({ok:true,projects:[{id:'123456789012345678901234',name:'中文论文 <test>',access:'owner'}]}),load:async()=>({ok:false,error:'fixture import error'}),login:async()=>({ok:true}),logout:async()=>({ok:true}),plan:async()=>({ok:true,token:'plan-token',rows:[{name:'main.tex',action:window.__conflict?'conflict':'upload'}],writable:true,canApply:!window.__conflict}),apply:async()=>{window.__applies=(window.__applies||0)+1;return {ok:true,completed:['main.tex']};}}};return true;})()`);
 await click('#overleafBtn');await sleep(180);assert.equal(await evalJs('document.querySelectorAll("[data-load]").length'),1);assert.equal(await evalJs('document.querySelector(".overleaf-project strong").textContent'),'中文论文 <test>');
 await shot('.capture/overleaf-math/projects.png');
 await click('[data-sync]');await sleep(240);assert.ok(await evalJs('!!document.querySelector("[data-apply]")'));assert.equal(await evalJs('window.__applies||0'),0);
 await click('[data-apply]');await sleep(250);assert.equal(await evalJs('window.__applies'),1);
 await evalJs('window.__conflict=true;true');await click('#overleafBtn');await sleep(100);await click('[data-sync]');await sleep(240);assert.equal(await evalJs('document.querySelector("[data-apply]").disabled'),true);
 console.log('PASS UI: actual Enter display pairs; gray inline ghost; $, Right, Tab accept; Overleaf button/project listing.');
}

