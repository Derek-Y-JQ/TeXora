import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const moduleText = file => fs.readFileSync(new URL('../src/js/' + file, import.meta.url), 'utf8');
const asModule = code => import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const { beautify, stripComment } = await asModule(moduleText('latex.js').replace("export { normalizePunctuation } from './punctuation.js';", ''));
const { buildAIContext } = await asModule(moduleText('ai-context.js'));
let cases = 0;
const blocks = [String.raw`\[
  x = 1
\]`, String.raw`$$
 x=2
$$`, String.raw`\begin{align}
 a &= 1 \\


 b &= 2
\end{align}`, String.raw`\begin{verbatim}
\section{Do not add banners}


\end{verbatim}`];
for (const block of blocks) {
  const input = '\\begin{document}\nBefore.\n' + block + '\nFollowing text. % keep inline comment\nNext line.\n% Keep full comment\n\\end{document}\n';
  const formatted = beautify(input);
  assert.ok(formatted.includes(block + '\n'), 'preserve literal bytes and closing delimiter newline');
  assert.match(formatted, /Following text\. % keep inline comment\n/);
  assert.match(formatted, /% Keep full comment\n/);
  assert.equal(beautify(formatted), formatted, 'formatter is idempotent');
  cases++;
}
assert.equal(stripComment(String.raw`text \\% comment`), String.raw`text \\`);
assert.equal(stripComment(String.raw`text \% literal`), String.raw`text \% literal`);
const common = { fileName: 'main.tex', fileText: 'WHOLE_FILE', preamble: 'ROOT_PREAMBLE', targetText: 'TARGET', attachments: { files: ['a.tex'] }, readFile: async () => 'OTHER_FILE', skills: [{id:'general',name:'General',enabled:true},{id:'polish',name:'Polish',enabled:true,scope:'polish'}] };
for (const scope of ['selection', 'file', 'file-with-preamble', 'project']) {
  let reads = 0;
  const result = await buildAIContext({ ...common, ai: {contextScope:scope,includePreamble:true,crossFile:true}, readFile: async () => { reads++; return 'OTHER_FILE'; } });
  assert.ok(result.prompt.includes('TARGET'));
  assert.equal(result.prompt.includes('WHOLE_FILE'), scope !== 'selection');
  assert.equal(result.prompt.includes('ROOT_PREAMBLE'), ['file-with-preamble','project'].includes(scope));
  assert.equal(reads, scope === 'project' ? 1 : 0);
  assert.deepEqual(result.skillIds, ['general']);
  cases++;
}
const narrowed = await buildAIContext({ ...common, ai:{contextScope:'project',crossFile:false,includePreamble:true}, attachments:{file:false,skillIds:[],files:['a.tex']} });
assert.ok(!narrowed.prompt.includes('WHOLE_FILE') && !narrowed.prompt.includes('ROOT_PREAMBLE') && !narrowed.prompt.includes('OTHER_FILE'));
assert.deepEqual(narrowed.skillIds, []);
const polish = await buildAIContext({ ...common, ai:{contextScope:'selection'}, actionId:'polish' });
assert.deepEqual(polish.skillIds, ['general','polish']);
await assert.rejects(buildAIContext({...common, ai:{}, attachments:{skillIds:['deleted']}}));
const many = await buildAIContext({...common, fileText:'F'.repeat(16000), targetText:'T'.repeat(24000), ai:{contextScope:'project',crossFile:true}, attachments:{files:Array.from({length:8},(_,i)=>i+'.tex')}, readFile:async()=> 'X'.repeat(8000)});
for (let i=0;i<8;i++) assert.ok(many.prompt.includes('其他文件 '+i+'.tex'), 'all selected files receive a context budget');
const { Store } = require('../electron/lib/store.js');
const { AiHistory } = require('../electron/lib/ai-history.js');
const { AiService } = require('../electron/lib/ai.js');
const unitRoot=path.join(process.cwd(),'.capture','unit131-'+Date.now());
const store = new Store(path.join(unitRoot,'settings'));
assert.equal(store.get('ai.model'),'deepseek-flash');
const legacyDir=path.join(unitRoot,'legacy'); fs.mkdirSync(legacyDir,{recursive:true});
fs.writeFileSync(path.join(legacyDir,'settings.json'),JSON.stringify({ai:{provider:'deepseek',baseUrl:'https://api.deepseek.com/v1',model:'deepseek-chat'}}));
const migrated=new Store(legacyDir); assert.equal(migrated.get('ai.model'),'deepseek-flash');
migrated.set('ai.model','deepseek-chat'); assert.equal(new Store(legacyDir).get('ai.model'),'deepseek-chat','explicit later choice survives');
const history=new AiHistory(path.join(unitRoot,'history.json'));
const record={id:'one',projectRoot:'C:/projectA',sourcePath:'C:/projectA/main.tex',suggestion:'after',original:'before',snapshot:{range:{}},applied:true,appliedText:'after'};
assert.ok(history.save(record).ok);
history.save({...record,applied:false});
assert.equal(history.list('C:\\projectA')[0].applied,true);
assert.equal(history.list('C:/projectB').length,0);
assert.equal(new AiHistory(history.file).list('C:/projectA')[0].suggestion,'after');
store.set('ai.apiKey','mock-only');
const service=new AiService(store);
service._openai=async()=>({ok:true,text:''});
assert.equal((await service.chat({messages:[{role:'user',content:'test'}],skillIds:[]})).code,'EMPTY_RESPONSE');
service._openai=async(cfg,sys,messages,signal)=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})));});
const pending=service.chat({requestId:'cancel-test',messages:[{role:'user',content:'test'}],skillIds:[]});
await new Promise(r=>setTimeout(r,10)); service.cancel('cancel-test');
assert.equal((await pending).code,'CANCELLED'); assert.equal(service.controllers.size,0);
console.log(`PASS 1.3.1: ${cases} formatter/context scenarios; comments, skill selection, migration, history isolation/persistence, empty response and cancellation`);
