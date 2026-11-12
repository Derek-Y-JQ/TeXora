import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const url=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
const {extractReplacement,EDIT_OUTPUT_CONTRACT}=await import(url(fs.readFileSync('src/js/edit-output.js','utf8')));
const latexUrl=url(fs.readFileSync('src/js/latex.js','utf8').replace("export { normalizePunctuation } from './punctuation.js';",''));
const {buildStructureIndex,readStructureDocuments,sameSource}=await import(url(fs.readFileSync('src/js/structure-index.js','utf8').replace("'./latex.js'",JSON.stringify(latexUrl))));
assert.ok(EDIT_OUTPUT_CONTRACT.includes('replacement'));
const replacement=String.raw`\section{A} Text with $x^2$.`;
assert.equal(extractReplacement(JSON.stringify({replacement,notes:'Unwanted explanation'})),replacement);
assert.equal(extractReplacement('```json\n'+JSON.stringify({replacement})+'\n```'),replacement);
assert.equal(extractReplacement('下面是润色版本：\n```latex\n'+replacement+'\n```\n修改说明：调整语言'),replacement);
assert.equal(extractReplacement(replacement),replacement);
assert.equal(extractReplacement('Ordinary prose is valid LaTeX.'),'Ordinary prose is valid LaTeX.');
for(const text of ['以下是润色后的文本：\nChanged.', 'Text.\n修改说明：improved.', '```latex\na\n```\n```latex\nb\n```','{"replacement":"unfinished',JSON.stringify({replacement:'Text\n说明：edited'})])assert.throws(()=>extractReplacement(text));
assert.throws(()=>extractReplacement(JSON.stringify({replacement:null,error:'请明确目标语言'})),/目标语言/);
assert.equal(extractReplacement('说明：这是原文讨论的标题','说明：这是原文讨论的标题'),'说明：这是原文讨论的标题');
const texts={
 'C:/p/main.tex':String.raw`\documentclass{article}
\newtheorem{claimx}{Claim}
\begin{document}
\ref{eq:child}
\begin{equation}\label{eq:main}x=1\end{equation}
\end{document}`,
 'C:/p/child.tex':String.raw`\begin{claimx}[Custom theorem]
Statement.\label{thm:child}
\end{claimx}
\[
x=2\label{eq:child}
\]
\ref{eq:main}\cite{somepaper}
\begin{lstlisting}
\label{not-a-real-label}
\begin{equation}not-a-real-equation\end{equation}
\end{lstlisting}`
};
const docs=new Map([['C:\\p\\child.tex',{model:{getValue:()=>texts['C:/p/child.tex']+'\n\\label{unsaved}'}}]]);
const loaded=await readStructureDocuments({root:'C:/p',rootFile:'C:/p/main.tex',activePath:'C:\\p\\child.tex',assets:['child.tex','main.tex','ignored.cls','ignored.sty'],outline:[],docs,readFile:async file=>({ok:!!texts[file],text:texts[file]})});
assert.equal(loaded.documents.length,2);assert.equal(loaded.errors.length,0);
const index=buildStructureIndex(loaded.documents);
assert.equal(index.math.length,3);assert.ok(index.math.some(item=>item.env==='claimx'&&item.theorem));
assert.ok(index.labels.some(item=>item.name==='unsaved'));assert.ok(!index.labels.some(item=>item.name==='not-a-real-label'));
assert.ok(index.labels.some(item=>item.name==='eq:child'));assert.ok(index.refs.some(item=>item.name==='eq:child'&&sameSource(item.file,'C:/p/main.tex')));
assert.equal(index.cites[0].key,'somepaper');
const breaks=buildStructureIndex([{file:'breaks.tex',rel:'breaks.tex',text:String.raw`\begin{align}
a &= b \\[4pt]
c &= d
\end{align}
\[
x=1
\]`}]);
assert.equal(breaks.math.length,2);assert.equal(breaks.math[1].line,5,'line-break spacing does not open a display');
const large=await readStructureDocuments({root:'C:/p',rootFile:'C:/p/main.tex',activePath:'',assets:Array.from({length:90},(_,i)=>'part'+i+'.tex'),docs:new Map(),readFile:async file=>({ok:true,text:file})});
assert.equal(large.documents.length,91,'whole project is not limited to the first 60 files');
const missing=await readStructureDocuments({root:'C:/p',rootFile:'C:/p/missing.tex',assets:[],docs:new Map(),readFile:async()=>({ok:false,error:'deleted'})});assert.equal(missing.errors.length,1);
const {migrateEditPrompts,BLOCK_ACTIONS}=require('../electron/lib/ai-defaults');
const custom={blockActions:[{id:'polish',prompt:'My custom prompt'}]};migrateEditPrompts(custom);assert.equal(custom.blockActions[0].prompt,'My custom prompt');assert.ok(!BLOCK_ACTIONS[0].prompt.includes('应另行简要指出'));
console.log('PASS 1.3.4: edit envelope/fence compatibility/commentary rejection, unsaved project indexing, cross-file targets, custom theorems, displays, verbatim exclusion and >60 files.');
