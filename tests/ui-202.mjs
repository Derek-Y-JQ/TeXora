import assert from 'node:assert/strict';

export default async function ({evalJs,sleep,send,press,shot}) {
  async function until(expr) { for(let i=0;i<120;i++){if(await evalJs(expr))return;await sleep(40);}throw Error('Timed out: '+expr); }
  await until('!!window.__texora?.editor?.model');
  await evalJs('Promise.all([window.__texora.api.settings.set("editor.autosave",false),window.__texora.api.settings.set("editor.autoCloseEnd",true),window.__texora.api.settings.set("build.livePreview",false)])');
  const value=()=>evalJs('window.__texora.editor.model.getValue().replace(/\\r\\n/g,"\\n")');
  async function reset(text,offset=text.length){
    await evalJs(`(()=>{const e=window.__texora.editor;clearTimeout(e._autoCloseTimer);e.editor.trigger('test','hideSuggestWidget',{});e.model.setValue(${JSON.stringify(text)});e.editor.setPosition(e.model.getPositionAt(${offset}));e.editor.focus();return true})()`);
  }
  async function shortcut(key,code,vk,modifiers=2){
    await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk,modifiers});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk,modifiers});
    await sleep(950);
  }
  // Complete the environment through the actual suggestion widget, then replay
  // history long enough to catch a delayed closure that would erase redo.
  await reset('\\begin{}',7);
  await send('Input.insertText',{text:'equ'});
  await evalJs('window.__texora.editor.editor.trigger("test","editor.action.triggerSuggest",{})');
  await until('!!document.querySelector(".suggest-widget.visible .monaco-list-row")');
  const before=await value();
  await press('Enter','Enter',13);
  await until('window.__texora.editor.model.getValue().includes("\\\\end{equation}")');
  const completed=await value();
  await shortcut('z','KeyZ',90);
  assert.equal(await value(),before,'one undo reverts the completion and generated end');
  await shortcut('y','KeyY',89);
  assert.equal(await value(),completed,'redo restores exactly one environment');
  await send('Input.insertText',{text:'x'});
  await shortcut('z','KeyZ',90);
  assert.equal(await value(),completed,'body typing is a separate undo step');
  await shortcut('z','KeyZ',90);
  assert.equal(await value(),before,'a second undo still reverts environment creation');
  await reset('');
  await evalJs('window.__texora.editor.editor.trigger("test","type",{text:"\\\\begin{equation}"});window.__texora.editor.editor.trigger("test","undo",{})');
  await sleep(950);assert.equal(await value(),'','undo cancels a pending closure');

  for(const [definition,name] of [
    ['\\newenvironment{mybox}{}{}','mybox'],
    ['\\NewDocumentEnvironment {custom2} {O{}} {} {}','custom2'],
    ['\\newtheorem*{claim2}{Claim}','claim2'],
    ['','unindexedbox']
  ]) {
    const opening=(definition?definition+'\n':'')+'\\begin{'+name+'}';
    await reset(opening);
    await press('Enter','Enter',13);
    assert.ok((await value()).endsWith('\\end{'+name+'}'),name+' closes on Enter');
    const done=await value();
    await shortcut('z','KeyZ',90);assert.equal(await value(),opening,name+' Enter undo');
    await shortcut('y','KeyY',89);assert.equal(await value(),done,name+' Enter redo');
  }
  const definition='\\NewDocumentEnvironment{mybox2}{}{}{}\n';
  await reset(definition+'\\begin{}',definition.length+7);
  await send('Input.insertText',{text:'myb'});
  await evalJs('window.__texora.editor.editor.trigger("test","editor.action.triggerSuggest",{})');
  await until('!!document.querySelector(".suggest-widget.visible .monaco-list-row")');
  await press('Enter','Enter',13);
  assert.ok((await value()).includes('\\end{mybox2}'),'custom environment also closes when accepted from suggestions');
  await reset(definition+'\\begin{}',definition.length+7);
  for(const char of 'mybox2') await send('Input.insertText',{text:char});
  await evalJs('window.__texora.editor.editor.trigger("test","editor.action.triggerSuggest",{})');
  await until('!!document.querySelector(".suggest-widget.visible .monaco-list-row")');
  await press('Enter','Enter',13);
  assert.ok((await value()).includes('\\end{mybox2}'),'exact-name candidate Enter closes a character-typed custom environment');
  await evalJs(`(()=>{const c=window.__texora;const model=c.editor.createModel('C:/defs202.tex','\\\\NewDocumentEnvironment {otherfile} {} {} {}');c.state.docs.set('C:/defs202.tex',{model});return true})()`);
  await reset('\\begin{}',7);await send('Input.insertText',{text:'otherf'});
  await evalJs('window.__texora.editor.editor.trigger("test","editor.action.triggerSuggest",{})');
  await until('!!document.querySelector(".suggest-widget.visible .monaco-list-row")');
  await press('Enter','Enter',13);
  assert.ok((await value()).includes('\\end{otherfile}'),'unsaved definition in another open document is available');
  await evalJs('window.__texora.state.docs.get("C:/defs202.tex").model.dispose();window.__texora.state.docs.delete("C:/defs202.tex")');
  const existing='\\begin{mybox}[Title]\n\\end{mybox}';
  await reset(existing,existing.indexOf('\n'));
  await press('Enter','Enter',13);
  assert.equal((await value()).match(/\\end\{mybox\}/g).length,1,'existing end is not duplicated');

  await evalJs('window.__texora.preview.updateDocumentStatus("当前编译 PDF",new Date(2026,10,15,9,34,56).getTime())');
  const status=await evalJs(`(()=>{const e=document.querySelector('#pdfDocumentStatus'),r=e.getBoundingClientRect();return {text:e.textContent,right:r.right,bottom:r.bottom,view:innerWidth,height:innerHeight,inFooter:!!e.closest('.sb-right'),old:!!document.querySelector('#sbGit,#sbTheme'),top:!!document.querySelector('.preview #pdfDocumentStatus')}})()`);
  assert.ok(status.inFooter&&!status.old&&!status.top);
  assert.match(status.text,/09:34$/);assert.doesNotMatch(status.text,/09:34:56/);
  assert.ok(status.right<=status.view&&status.bottom>=status.height-30,'PDF status is at bottom right');
  assert.ok(await evalJs('Math.abs(document.querySelector(".tabstrip").getBoundingClientRect().bottom-document.querySelector(".preview-toolbar").getBoundingClientRect().bottom)<=1'),'PDF toolbar rule aligns with the upper source rule');
  await shot('.capture/202-workspace.png');
  await send('Emulation.setDeviceMetricsOverride',{width:900,height:800,deviceScaleFactor:1,mobile:false});await sleep(250);
  assert.ok(await evalJs('document.querySelector(".statusbar").scrollWidth<=innerWidth'),'narrow footer fits');
  await shot('.capture/202-narrow-footer.png');
  await evalJs('window.__texora.preview.updateDocumentStatus("")');
  assert.equal(await evalJs('getComputedStyle(document.querySelector("#pdfDocumentStatus")).display'),'none');
  console.log('PASS environment completion/Enter undo and redo, pending undo, custom definitions/suggestions, existing end, footer PDF timestamp and removed status controls');
}
