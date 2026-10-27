import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export default async function verify({evalJs,click,sleep,shot,send}) {
  const {port,fixture}=JSON.parse(fs.readFileSync('.capture/verify131-server.json'));
  const calls=()=>JSON.parse(fs.readFileSync('.capture/verify131-http.json','utf8'));
  async function waitFor(expression,label){for(let i=0;i<160;i++){if(await evalJs(expression))return;await sleep(150);}throw new Error('Timed out: '+label);}
  await waitFor('!!window.__texora?.ai','app startup');
  assert.equal(await evalJs('(async()=>(await window.texora.info()).version)()'),JSON.parse(fs.readFileSync('package.json','utf8')).version);
  assert.equal(await evalJs('window.__texora.state.settings.ai.model'),'deepseek-flash');
  assert.ok((await evalJs('window.__texora.state.project.root')).replaceAll('\\','/').endsWith('/.capture/verify131-project'));
  const skills=[{id:'rule-a',name:'Rule A',enabled:true,path:path.join(fixture,'rule-a.md')},{id:'rule-b',name:'Rule B',enabled:false,path:path.join(fixture,'rule-b.md')}];
  await evalJs(`(async()=>{const c=window.__texora;for(const [key,value] of Object.entries(${JSON.stringify({'ai.apiKey':'mock-only','ai.baseUrl':`http://127.0.0.1:${port}/v1`,'ai.provider':'deepseek','ai.model':'deepseek-flash','ai.skills':skills,'ai.contextScope':'selection','ai.includePreamble':true,'ai.crossFile':false,'build.livePreview':false,'general.autoCheckUpdates':false})}))await c.api.settings.set(key,value);c.ai.openAssistant();})()`);
  assert.equal(await evalJs("document.querySelectorAll('.ai-quick button').length"),0);
  assert.equal(await evalJs("document.querySelectorAll('#aiContextControls button').length"),4);
  assert.equal(await evalJs("getComputedStyle(document.querySelector('#aiContextControls')).gridTemplateColumns.split(' ').length"),2);
  assert.equal(await evalJs("document.querySelector('[data-ctx=files]').disabled"),true);
  await evalJs('window.__texora.app.beautify()');
  const formatted=await evalJs('window.__texora.editor.model.getValue()');
  assert.ok(formatted.includes('\\]\n')&&formatted.includes('% keep this comment')&&formatted.includes('% equation comment stays'));
  await evalJs('window.__texora.app.runBuild()');
  await waitFor("!window.__texora.state.build.running && ['ok','error'].includes(window.__texora.state.build.state)",'formatted document compilation');
  assert.equal(await evalJs('window.__texora.state.build.state'),'ok','formatted display math compiles');

  async function select(text){await evalJs(`(()=>{const e=window.__texora.editor,m=e.model,v=m.getValue(),i=v.indexOf(${JSON.stringify(text)});if(i<0)throw new Error('selection missing');const a=m.getPositionAt(i),b=m.getPositionAt(i+${text.length});e.editor.setSelection({startLineNumber:a.lineNumber,startColumn:a.column,endLineNumber:b.lineNumber,endColumn:b.column});})()`);}
  async function ask(prompt){await evalJs(`(async()=>{const input=document.querySelector('#aiPrompt');input.value=${JSON.stringify(prompt)};await window.__texora.sidebar.aiSend();})()`);}
  async function close(){await evalJs("document.querySelector('.modal [data-btn=close],.modal [data-answer-close]')?.click()");}
  await select('Original target.');
  await ask('[CASE:SELECT] rewrite selected text');
  const firstId=await evalJs("document.querySelector('.ai-result').dataset.resultId");
  assert.ok(await evalJs("!!document.querySelector('.ai-result .diff-delete') && !!document.querySelector('.ai-result .diff-insert')"));
  await evalJs("document.querySelector('[data-btn=diffHighlight]').click()");
  assert.equal(await evalJs("document.querySelector('.modal').classList.contains('diff-highlights-off')"),true);
  await evalJs("document.querySelector('[data-btn=diffHighlight]').click()");
  assert.equal(await evalJs("document.querySelector('.modal').classList.contains('diff-highlights-off')"),false);
  assert.ok(!calls().at(-1).messages.at(-1).content.includes('CURRENT_FILE_ONLY'),'selection scope never sends full file');
  assert.equal(calls().at(-1).model,'deepseek-flash');
  assert.equal(await evalJs("document.querySelectorAll('.diff-pane').length"),2);
  await evalJs(`(async()=>{await window.__texora.app.openDocument(${JSON.stringify(path.join(fixture,'helper-a.tex'))});return true;})()`);
  await evalJs("document.querySelector('[data-btn=replace]').click()");
  await waitFor("!!document.querySelector('.diff-grid.applied')",'applied result');
  assert.equal(await evalJs("document.querySelectorAll('.diff-pane').length"),1);
  assert.equal(await evalJs("!!document.querySelector('[data-btn=replace]')"),false);
  assert.ok((await evalJs('window.__texora.state.activePath')).replaceAll('\\','/').endsWith('/main.tex'),'apply is bound to original file');
  assert.ok((await evalJs('window.__texora.editor.model.getValue()')).includes('\\textbf{Rewritten target.}'));
  assert.equal(fs.readFileSync(path.join(fixture,'helper-a.tex'),'utf8'),'OTHER_A_ONLY');
  await sleep(250);await shot('.capture/131-applied.png');
  await close();
  await evalJs(`window.__texora.ai.resultAction({id:${JSON.stringify(firstId)}})`);
  assert.ok(await evalJs("document.querySelector('.ai-result-note').textContent.includes('已修改')"));
  await close();
  await evalJs('window.__texora.app.saveAll()');
  await send('Page.reload');await sleep(1500);await waitFor('!!window.__texora?.ai','reload');
  await waitFor(`window.__texora.sidebar.aiThread.some(m=>m.resultId===${JSON.stringify(firstId)}&&m.applied)`,'persisted applied history');
  await evalJs(`window.__texora.ai.openAssistant();window.__texora.ai.resultAction({id:${JSON.stringify(firstId)}})`);
  assert.equal(await evalJs("document.querySelectorAll('.diff-pane').length"),1);await close();

  await evalJs("(async()=>{await window.texora.settings.set('ai.contextScope','project');await window.texora.settings.set('ai.crossFile',true);})()");
  await click('[data-ctx=skills]');
  await waitFor("document.querySelectorAll('.ai-picker-option').length===2",'skill picker');
  await evalJs("[...document.querySelectorAll('.ai-picker-option')].find(x=>x.textContent.includes('Rule A')).querySelector('input').click();[...document.querySelectorAll('.ai-picker-option')].find(x=>x.textContent.includes('Rule B')).querySelector('input').click()");
  assert.equal(await evalJs("document.querySelectorAll('.ai-picker-option input:checked').length"),1);
  await evalJs("document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))");
  assert.equal(await evalJs("document.querySelector('#menuLayer').classList.contains('open')"),false,'multiselect closes on outside click');
  await click('[data-ctx=files]');
  await evalJs("for(const name of ['helper-a.tex','helper-b.md'])[...document.querySelectorAll('.ai-picker-option')].find(x=>x.textContent.includes(name)).querySelector('input').click();document.querySelector('[data-done]').click()");
  await select('Rewritten target.');await ask('[CASE:SKILLS] rewrite using selected context');
  const secondId=await evalJs("document.querySelector('.ai-result').dataset.resultId");
  const body=calls().at(-1),user=body.messages.find(m=>m.role==='user').content,system=body.messages.find(m=>m.role==='system').content;
  assert.ok(user.includes('OTHER_A_ONLY')&&user.includes('OTHER_B_ONLY')&&user.includes('CURRENT_FILE_ONLY'));
  assert.ok(user.indexOf('OTHER_B_ONLY')<user.indexOf('任务（用户指令）'));
  assert.ok(system.includes('SKILL_B_RULE')&&!system.includes('SKILL_A_RULE'));
  await close();await evalJs(`window.__texora.ai.resultAction({id:${JSON.stringify(secondId)}})`);
  assert.equal(await evalJs("document.querySelectorAll('.diff-pane').length"),2,'unapplied history retains Diff');
  await sleep(250);await shot('.capture/131-context.png');await close();

  await ask('[CASE:INSERT] add a paragraph');
  await evalJs("document.querySelector('[data-btn=insert]').click()");
  await waitFor("!!document.querySelector('.diff-grid.applied')",'inserted result');
  assert.ok((await evalJs('window.__texora.editor.model.getValue()')).includes('Inserted proposal.'));
  assert.equal(await evalJs("document.querySelectorAll('.diff-pane').length"),1,'inserted suggestion also becomes applied-only history');
  await close();

  await evalJs("window.texora.settings.set('ai.contextScope','file')");
  await evalJs("window.__texora.ai.runBlockAction({actionId:'ask'})");
  assert.ok(calls().at(-1).messages.find(m=>m.role==='user').content.includes('CURRENT_FILE_ONLY'),'block uses same file scope policy');await close();
  await select('Following text.');await ask('[CASE:STALE] modify');
  await evalJs("(()=>{const e=window.__texora.editor;e.model.setValue(e.model.getValue().replace('Following text.','Changed while AI was running.'));})()");
  const before=await evalJs('window.__texora.editor.model.getValue()');
  await evalJs("document.querySelector('[data-btn=replace]').click()");await sleep(300);
  assert.equal(await evalJs('window.__texora.editor.model.getValue()'),before,'stale source is not overwritten');await close();
  await ask('[CASE:EMPTY] empty');assert.equal(await evalJs('window.__texora.state.aiBusy'),false);
  assert.ok(await evalJs("window.__texora.sidebar.aiThread.at(-1).error"));
  assert.equal(await evalJs("document.querySelector('#aiPrompt').value"),'[CASE:EMPTY] empty','failed prompt is retained');
  await ask('[CASE:FAIL] fail');assert.ok(await evalJs("window.__texora.sidebar.aiThread.at(-1).error"));
  await ask('[CASE:TRUNC] rewrite partial');
  assert.ok(await evalJs("!!document.querySelector('.ai-result-warning')"));
  assert.ok(await evalJs("[...document.querySelectorAll('[data-btn=insert],[data-btn=replace]')].every(b=>b.disabled)"));await close();
  const count=calls().length;
  await evalJs("document.querySelector('#aiPrompt').value='[CASE:SLOW] delay';void window.__texora.sidebar.aiSend()");
  await waitFor('window.__texora.state.aiBusy','pending request');
  for(let i=0;i<40&&calls().length===count;i++)await sleep(100);
  await evalJs("window.__texora.ai.runBlockAction({actionId:'ask'});window.__texora.ai.cancel()");
  await waitFor('!window.__texora.state.aiBusy','cancellation cleanup');
  assert.equal(calls().length,count+1,'duplicate request is suppressed');
  assert.equal(await evalJs('window.__texora.sidebar.aiThread.some(m=>m.pending)'),false);
  await evalJs(`window.__texora.ai.resultAction({id:${JSON.stringify(secondId)}})`);
  await evalJs("document.querySelector('[data-btn=regen]').click()");
  await waitFor('!window.__texora.state.aiBusy','regeneration');
  assert.ok(calls().at(-1).messages.at(-1).content.includes('[CASE:SKILLS]'),'history regenerates its own request');
  await close();
  console.log('PASS 1.3.1: formatted math compiles; 2x2 controls; selective files/Skills; context limits; history/reload/applied views; origin binding; stale rejection; empty/error/truncated/cancel/duplicate cleanup');
}
