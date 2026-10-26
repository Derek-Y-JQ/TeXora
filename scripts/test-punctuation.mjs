import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../src/js/punctuation.js', import.meta.url), 'utf8');
const { normalizePunctuation: convert } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const cases = [
  ['half', '中文，测试。你好！', '中文, 测试. 你好!'],
  ['full', '中文, 测试. 你好! ', '中文，测试。你好！'],
  ['full', 'An English sentence. Another one, too!', 'An English sentence. Another one, too!'],
  ['full', '数值3.14, 比例12:30, 1,000, e.g. 中文。', '数值3.14，比例12:30, 1,000, e.g. 中文。'],
  ['full', '1. 中文列表\n2. 第二项', '1. 中文列表\n2. 第二项'],
  ['half', '“你好”、‘保留’、"quote"、～', '“你好”、‘保留’、"quote"、～'],
  ['half', '中文（说明），下一句。', '中文(说明), 下一句.'],
  ['full', '中文 (说明), 下一句.', '中文 （说明），下一句。'],
  ['half', String.raw`\section{标题，副标题。}\label{sec:中文，标签}`, String.raw`\section{标题, 副标题.}\label{sec:中文，标签}`],
  ['full', String.raw`\textbf{正文, 测试.}\cite{中文,key}\ref{sec:中文}`, String.raw`\textbf{正文，测试。}\cite{中文,key}\ref{sec:中文}`],
  ['half', String.raw`正文，\includegraphics[width=0.8\textwidth]{图，片.pdf}`, String.raw`正文, \includegraphics[width=0.8\textwidth]{图，片.pdf}`],
  ['half', String.raw`\href{https://example.com/a,b?q=1.2}{链接，说明。}`, String.raw`\href{https://example.com/a,b?q=1.2}{链接, 说明.}`],
  ['half', '正文，https://example.com/a?q=1.2，邮件a.b@example.com。', '正文, https://example.com/a?q=1.2, 邮件a.b@example.com.'],
  ['full', '网址: https://example.com/x,y?q=2.5 邮箱: a.b@example.com, 中文', '网址：https://example.com/x,y?q=2.5 邮箱：a.b@example.com，中文'],
  ['half', String.raw`正文，$x，y$ 后文。\(x，y\)\[x，y\]`, String.raw`正文, $x，y$ 后文. \(x，y\)\[x，y\]`],
  ['full', '正文, $x,\ny$ 后文.', '正文，$x,\ny$ 后文。'],
  ['half', '\\begin{align}\nx，y\n\\end{align}\n正文。', '\\begin{align}\nx，y\n\\end{align}\n正文.'],
  ['half', '\\begin{verbatim}\n中文，代码。\n\\end{verbatim}\n正文，', '\\begin{verbatim}\n中文，代码。\n\\end{verbatim}\n正文,'],
  ['half', String.raw`正文，\verb|中文，代码。| 后文。 % 注释，保留。`, String.raw`正文, \verb|中文，代码。| 后文. % 注释，保留。`],
  ['half', String.raw`\newcommand{\foo}[1]{代码，#1。}正文。`, String.raw`\newcommand{\foo}[1]{代码，#1。}正文.`],
  ['half', String.raw`正文\%比例，测试。`, String.raw`正文\%比例, 测试.`],
  ['half', '\\label % 注释，保留。\n {标签，测试}\n正文。', '\\label % 注释，保留。\n {标签，测试}\n正文.'],
  ['full', '\\section\n{标题, 测试.}\n\\label\n{sec:中文,key}', '\\section\n{标题，测试。}\n\\label\n{sec:中文,key}'],
  ['full', '中文... 后续, 中文\r\n新行.', '中文... 后续，中文\r\n新行。'],
];
for (const [direction, input, expected] of cases) {
  const result = convert(input, { direction });
  assert.equal(result.text, expected, direction + ': ' + input);
  assert.equal(convert(result.text, { direction }).text, result.text, 'conversion must be idempotent');
  if (result.text !== input) assert.ok(result.changes > 0);
}
console.log(`PASS: ${cases.length} punctuation cases, including idempotence`);
