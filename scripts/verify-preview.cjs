const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { TexEnv } = require('../electron/lib/texenv');
const { Compiler } = require('../electron/lib/compiler');
const { DEFAULT_SETTINGS } = require('../electron/lib/store');
const settings = structuredClone(DEFAULT_SETTINGS);
settings.build.previewNoCache = true;
const store = { get: (key, fallback) => key.split('.').reduce((v, k) => v?.[k], settings) ?? fallback };
const dir = path.resolve('.capture/preview-regression');
fs.mkdirSync(dir, { recursive: true });
const tex = new TexEnv(store, dir); tex.detect();
async function compiler(Type, name, rootFile) {
  const root = path.join(dir, name);
  if (!fs.existsSync(root)) fs.cpSync(path.resolve('samples/' + name), root, { recursive: true, filter: p => !p.includes('.latex_cache') });
  const compiler = new Type({ store, tex, project: { root, rootFile: path.join(root, rootFile) }, fallbackCacheRoot: dir });
  return compiler;
}
(async () => {
  const paper = await compiler(Compiler, 'paper', 'main.tex');
  const cases = [
    ['paper math', paper, { code: String.raw`\E[X]+\norm{x}`, kind: 'math' }],
    ['paper tikz', paper, { code: fs.readFileSync(path.join(paper.root, 'figures/fig_framework.tex'), 'utf8'), kind: 'tikz' }],
    ['paper plot', paper, { code: fs.readFileSync(path.join(paper.root, 'figures/fig_dim.tex'), 'utf8'), kind: 'tikz' }],
    ['paper table', paper, { code: String.raw`\begin{tabular}{lr}\toprule Item & Value \\\midrule A & 1 \\\bottomrule\end{tabular}`, kind: 'table' }],
    ['demo', await compiler(Compiler, 'demo', 'main.tex'), { code: String.raw`x^2+\frac{1}{2}`, kind: 'math' }],
    ['book', await compiler(Compiler, 'book', 'stochastic_analysis.tex'), { code: String.raw`\int_0^1 f(x)\,dx`, kind: 'math' }]
  ];
  const results = [];
  for (const [name, c, request] of cases) {
    settings.build.engine = name.startsWith('paper') ? 'pdflatex' : 'xelatex';
    const result = await c.snippet({ ...request, scale: 1 });
    results.push({ name, tier: c._snippetTier, ...result });
    console.log(name, result.ok, c._snippetTier, result.error || `${result.width}x${result.height}`);
  }
  fs.writeFileSync(path.join(dir, 'after.json'), JSON.stringify(results, null, 2));
  assert.ok(results.every(r => r.ok), 'Every real preview must compile and rasterize');
})().catch(error => { console.error(error); process.exitCode = 1; });
