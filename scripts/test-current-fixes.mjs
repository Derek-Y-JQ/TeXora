import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const load = file => import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync('src/js/' + file)).toString('base64'));
const { projectOutline } = await load('project-outline.js');
const { textDiff, diffHtml } = await load('text-diff.js');
const files = {
  'C:/p/main.tex': String.raw`\section{Opening}
\input{z}
\section{Middle}
% \input{unused}
\include{a}
\section{End}`,
  'C:/p/z.tex': String.raw`\section{First included}\input{nested}`,
  'C:/p/nested.tex': String.raw`\subsection{Nested}\input{main}`,
  'C:/p/a.tex': String.raw`\section{Last included}`,
  'C:/p/unused.tex': String.raw`\section{Not in document}`
};
const ordered = await projectOutline('C:\\p\\main.tex', async file => files[file]);
assert.deepEqual(ordered.map(item => item.title), ['Opening', 'First included', 'Nested', 'Middle', 'Last included', 'End']);
assert.equal(ordered[1].file, 'C:\\p\\z.tex');
const paper = await projectOutline(path.resolve('samples/paper/main.tex'), async file => fs.promises.readFile(file, 'utf8').catch(() => ''));
const rel = [...new Set(paper.map(item => item.rel))];
assert.ok(rel.indexOf('sections/introduction.tex') < rel.indexOf('sections/analysis.tex'));
assert.ok(rel.indexOf('sections/analysis.tex') < rel.indexOf('sections/conclusion.tex'));
for (const [before, after] of [['one old word\nunchanged line','one new word\nunchanged line'], ['中文旧内容','中文新内容'], ['<script>','<safe>'], ['', 'added'], ['removed',''], ['same','same'], ['a\n'.repeat(3000)+'old','a\n'.repeat(3000)+'new']]) {
  const pieces = textDiff(before, after);
  assert.equal(pieces.filter(p => p.type !== 'insert').map(p => p.text).join(''), before);
  assert.equal(pieces.filter(p => p.type !== 'delete').map(p => p.text).join(''), after);
}
const html = diffHtml('same old tail', 'same new tail', s => s.replaceAll('<','&lt;'));
assert.equal(html.left, 'same <span class="diff-delete">old</span> tail');
assert.equal(html.right, 'same <span class="diff-insert">new</span> tail');
const { Store, DEFAULT_SETTINGS } = require('../electron/lib/store');
assert.equal(DEFAULT_SETTINGS.ai.maxTokens, 10000);
for (const [value, expected] of [[2048,10000],[4096,4096]]) {
  const dir = path.resolve('.capture/tokens-' + value + '-' + Date.now()); fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'settings.json'), JSON.stringify({ ai: { maxTokens:value } }));
  const store = new Store(dir); assert.equal(store.get('ai.maxTokens'),expected);
  store.set('ai.maxTokens',2048); assert.equal(new Store(dir).get('ai.maxTokens'),2048);
}
console.log('PASS: document-order outline, nested inputs/cycles, real paper order, precise diff and token defaults/migration.');
