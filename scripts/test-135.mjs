import assert from 'node:assert/strict';
import fs from 'node:fs';
const {mathAtOffset,mathDefinitions,enumLabelEdit,previewEnvironmentAt}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('src/js/live-math.js')).toString('base64')); 
for(const [source,word,body] of [
 ['$x+1$','x','x+1'],[String.raw`\(a^2\)`,'a','a^2'],[String.raw`\[x+1\]`,'x','x+1'],['$$a+b$$','a','a+b'],
 [String.raw`\begin{equation}x+1\end{equation}`,'x','x+1'],['\\[\nx+1\n\\]','x','x+1'],['$\\frac{1}{','1','\\frac{1}{'],
 [String.raw`\begin{align}a&=b\\c&=d\end{align}`,'a&','\\begin{aligned}a&=b\\\\c&=d\\end{aligned}']
]) {const result=mathAtOffset(source,source.indexOf(word));assert.ok(result,source);assert.equal(result.code,body,source);}
assert.equal(mathAtOffset('% $x$\ntext',3),null);
assert.equal(mathAtOffset(String.raw`\begin{lstlisting}$x$\end{lstlisting}`,26),null);
const macro=String.raw`\newcommand{\norm}[1]{\left\lVert#1\right\rVert} \begin{document}`;
assert.equal(mathDefinitions(macro),macro.split(' \\begin')[0]);
const source=String.raw`\begin{enumerate}[leftmargin=*,label=\roman*.]
\item Outer
\begin{enumerate}
\item Inner
\end{enumerate}
\item Last
\end{enumerate}`;
const inner=enumLabelEdit(source,source.indexOf('Inner'),'label=\\alph*)');assert.equal(inner.text,'[label=\\alph*)]');
const outer=enumLabelEdit(source,source.indexOf('Last'),'nosep');assert.equal(outer.text,'[leftmargin=*,label=\\roman*.,nosep]');
const relabel=enumLabelEdit(source,source.indexOf('Outer'),'label=(\\arabic*)');assert.equal(relabel.text,'[leftmargin=*,label=(\\arabic*)]');
assert.equal(enumLabelEdit(source,source.length,'nosep'),null);
console.log('PASS 1.3.5: inline/display/multiline/unfinished math, comments/literals, macro extraction, nested lists and option merging.');

const formulaSource=fs.readFileSync('src/js/live-formula.js','utf8').replace("'katex'",JSON.stringify(import.meta.resolve('katex')));
const {renderLiveFormula}=await import('data:text/javascript;base64,'+Buffer.from(formulaSource).toString('base64'));
assert.equal(renderLiveFormula('x^2+1',true).needsNative,false);
const unknown=renderLiveFormula(String.raw`x+\documentonly{a}+y^2`,true);
assert.equal(unknown.needsNative,true);assert.ok(unknown.html.includes('#ff626f'));assert.ok(unknown.html.includes('msup'));assert.ok(unknown.html.includes('documentonly'));
const invalid=renderLiveFormula(String.raw`x+\frac{1}{`,true);assert.ok(invalid.html.includes('katex-error'));assert.ok(invalid.html.includes('#ff626f'));
for(const env of ['table','table*','tabular','tabular*','tabularx','tblr','longtblr','longtable','tikzpicture']) {
 const text='\\begin{'+env+'}\nBody target\n\\end{'+env+'}';const result=previewEnvironmentAt(text,text.indexOf('target'));
 assert.equal(result.env,env);assert.equal(result.kind,env==='tikzpicture'?'tikz':'table');assert.equal(result.code,text);
}
assert.equal(previewEnvironmentAt('% \\begin{tabular}x\\end{tabular}',24),null);
console.log('PASS preview refresh: valid math skips native, unknown commands preserve surrounding math in red, malformed syntax red, full-body table/TikZ detection.');
