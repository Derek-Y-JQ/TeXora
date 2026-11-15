import assert from 'node:assert/strict';
import fs from 'node:fs';
const data = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const latex=data(fs.readFileSync('src/js/latex.js','utf8').replace("export { normalizePunctuation } from './punctuation.js';",''));
const {definedEnvironmentNames,environmentOpening,matchingEnvironmentEnd}=await import(data(fs.readFileSync('src/js/environment-input.js','utf8').replace("'./latex.js'",JSON.stringify(latex))));
assert.deepEqual(definedEnvironmentNames(String.raw`
% \newenvironment{commented}{}{}
\newtheorem* {claim2}{Claim} \NewDocumentEnvironment
  {custombox}{O{}}{}{}
\RenewDocumentEnvironment{renewed}{}{}{}
\ProvideDocumentEnvironment{provided}{}{}{}
\renewenvironment{changed}{}{} \DeclareDocumentEnvironment{declared}{}{}{}
`),['claim2','custombox','renewed','provided','changed','declared']);
assert.deepEqual(environmentOpening('  \\begin{custom2*}[Title] % comment'),{indent:'  ',env:'custom2*'});
assert.deepEqual(environmentOpening('\\begin{自定义}'),{indent:'',env:'自定义'});
assert.equal(environmentOpening('\\begin{equation}',10),null,'mid-name caret is not a completed environment');
assert.equal(environmentOpening('\\begin{equation} text'),null,'inline content is not rearranged');
assert.equal(environmentOpening('% \\begin{equation}'),null);
assert.equal(environmentOpening('\\begin{unfinished'),null);
assert.equal(matchingEnvironmentEnd(['\\begin{x}','\\begin{x}','\\end{x}','\\end{x}'],1,'x'),4);
assert.equal(matchingEnvironmentEnd(['\\begin{x}','\\begin{x}','\\end{x}'],1,'x'),0,'nested end cannot close outer environment');
assert.equal(matchingEnvironmentEnd(['\\begin{x}','% \\end{x}','\\end{y}'],1,'x'),0);
console.log('PASS custom declarations, environment arguments/caret boundaries, comments and nested end matching');
