import assert from 'node:assert/strict';
import fs from 'node:fs';
const {mathAtOffset,mathDefinitions,enumLabelEdit}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('src/js/live-math.js')).toString('base64')); 
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
