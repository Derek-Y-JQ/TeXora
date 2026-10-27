import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {SYSTEM_PROMPT,BLOCK_ACTIONS,migratePrompts}=require('../electron/lib/ai-defaults');
const {Store}=require('../electron/lib/store');
const module=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('src/js/code-blocks.js')).toString('base64'));
const {blockSource,packageInsertion,ALGORITHM_PARTS}=module;
assert.equal(BLOCK_ACTIONS.length,4);assert.equal(BLOCK_ACTIONS.find(a=>a.id==='ask').label,'检查');
assert.equal(BLOCK_ACTIONS.find(a=>a.id==='ask').mode,'answer');assert.equal(BLOCK_ACTIONS.find(a=>a.id==='explain').mode,'answer');
assert.ok(!SYSTEM_PROMPT.includes('绝不改动公式'));assert.ok(BLOCK_ACTIONS.find(a=>a.id==='translate').prompt.includes('英文译为中文'));
const custom={systemPrompt:'My system',blockActions:[{id:'polish',label:'Mine',prompt:'My prompt',mode:'answer'}]};migratePrompts(custom);
assert.equal(custom.systemPrompt,'My system');assert.equal(custom.blockActions[0].prompt,'My prompt');assert.ok(custom.blockActions.some(a=>a.id==='explain'));
const legacy={systemPrompt:'你是资深学术写作与 LaTeX 排版专家。保持学术语气，绝不改动公式符号定义、\\cite/\\ref 标签与命令语义。默认只输出 LaTeX 源码，不要使用 Markdown 代码围栏。',blockActions:[{id:'ask',label:'解释',prompt:'请解释下面这段 LaTeX 源码 / 公式的含义与作用，并指出潜在问题。'}]};migratePrompts(legacy);
assert.equal(legacy.systemPrompt,SYSTEM_PROMPT);assert.equal(legacy.blockActions[0].label,'检查');
const root=String.raw`\documentclass{article}
% \usepackage{minted}
\begin{document}
Text.
\end{document}`;
assert.equal(packageInsertion(root,['minted']).text,'\\usepackage{minted}\n');
assert.equal(packageInsertion(root,['listings'],'\\usepackage{foo,listings}').text,'');
assert.throws(()=>packageInsertion(root,['algpseudocode'],'\\usepackage{algorithm2e}'));
assert.throws(()=>packageInsertion('fragment',['listings']));
const listing=blockSource({code:'print("a")',caption:'A_100%',label:'lst:sample'});assert.ok(listing.source.includes('caption={A\\_100\\%}'));assert.deepEqual(listing.packages,['listings']);
assert.ok(blockSource({backend:'minted',code:'print(1)',label:'lst:minted'}).source.includes('\\begin{listing}'));
assert.ok(blockSource({kind:'algorithm',code:ALGORITHM_PARTS[3][1]}).source.includes('\\EndFor'));
assert.ok(ALGORITHM_PARTS.some(([name])=>name==='If / Else'));
assert.throws(()=>blockSource({code:'\\end{lstlisting}'}));assert.throws(()=>blockSource({code:'a',label:'{bad}'}));
const dir=path.resolve('.capture/unit133-'+Date.now());const store=new Store(dir);assert.equal(store.get('appearance.accent'),'blue');assert.equal(store.get('appearance.theme'),'dark');
const partial=path.join(dir,'partial');fs.mkdirSync(partial,{recursive:true});fs.writeFileSync(path.join(partial,'settings.json'),JSON.stringify({general:{autoCheckUpdates:false}}));
const partialStore=new Store(partial);partialStore.set('ai.systemPrompt','custom');assert.equal(require('../electron/lib/store').DEFAULT_SETTINGS.ai.systemPrompt,SYSTEM_PROMPT,'editing loaded settings cannot mutate reset defaults');
console.log('PASS 1.3.3: prompt migration/custom preservation, four task modes, code/algorithm generation, dependency injection/dedup/conflicts, dark/blue defaults.');
const {Compiler}=require('../electron/lib/compiler');
const probeRoot=path.join(dir,'project');fs.mkdirSync(probeRoot,{recursive:true});
const compiler=new Compiler({store,project:{root:probeRoot},fallbackCacheRoot:path.join(dir,'fallback')});
const caches=await Promise.all(Array.from({length:20},()=>compiler.resolveCacheDir()));
assert.ok(caches.every(folder=>folder===path.join(probeRoot,'.latex_cache')),'concurrent probes do not create false permission failures');
const {responseModeFor}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('src/js/ai-context.js')).toString('base64'));
assert.equal(responseModeFor('为什么不能翻译？'),'answer');assert.equal(responseModeFor('请检查公式并给出修正'),'answer');assert.equal(responseModeFor('请翻译成中文'),'edit');
