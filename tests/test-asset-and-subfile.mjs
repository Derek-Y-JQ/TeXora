import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  extractGraphicsConfig,
  buildAssetCandidates,
  matchGraphicsAtOffset,
  resolveAssetPath
} from '../src/js/asset-resolver.js';
import { isPathInside } from '../src/js/util.js';

const require = createRequire(import.meta.url);
const { resolveOpenTarget } = require('../electron/lib/open-target');

// 1. \graphicspath / \svgpath / \DeclareGraphicsExtensions / preamble \input extraction
{
  const tex = String.raw`
\documentclass{acmart}
% \graphicspath{{ignored/}}
\graphicspath{{figures/}{./}}
\graphicspath{
  {assets/img/}
  {../shared/figs/}
}
\svgpath{{diagrams/}}
\DeclareGraphicsExtensions{.pdf,.png,.jpg}
\input{preamble}
\begin{document}
\input{chapter/ch1}
\end{document}
`;
  const cfg = extractGraphicsConfig(tex);
  assert.deepEqual(cfg.paths, ['figures/', './', 'assets/img/', '../shared/figs/', 'diagrams/']);
  assert.deepEqual(cfg.extensions, ['.pdf', '.png', '.jpg']);
  assert.deepEqual(cfg.preambleInputs, ['preamble']);
}

// 2. Asset resolution with \graphicspath, omitted extensions, braced filenames, and fallback
{
  const existing = new Set([
    '/proj/figures/design.pdf',
    '/proj/figures/my.fig.pdf',
    '/proj/chapter/local.png',
    '/proj/nested/deep/chart.png'
  ]);
  const statFile = async (p) => existing.has(p) ? { ok: true, size: 4096, mtime: 100, dir: false } : { ok: false };

  const r1 = await resolveAssetPath('design.pdf', {
    projectRoot: '/proj',
    rootDir: '/proj',
    activeDir: '/proj/chapter',
    graphicsPaths: ['figures/', './']
  }, statFile);
  assert.equal(r1?.abs, '/proj/figures/design.pdf');

  // Omitted extension
  const r2 = await resolveAssetPath('design', {
    projectRoot: '/proj',
    rootDir: '/proj',
    activeDir: '/proj/chapter',
    graphicsPaths: ['figures/', './']
  }, statFile);
  assert.equal(r2?.abs, '/proj/figures/design.pdf');

  // Braced filename with dots
  const r3 = await resolveAssetPath('{my.fig}.pdf', {
    projectRoot: '/proj',
    rootDir: '/proj',
    graphicsPaths: ['figures/']
  }, statFile);
  assert.equal(r3?.abs, '/proj/figures/my.fig.pdf');

  // Relative to active chapter directory
  const r4 = await resolveAssetPath('local.png', {
    projectRoot: '/proj',
    rootDir: '/proj',
    activeDir: '/proj/chapter',
    graphicsPaths: []
  }, statFile);
  assert.equal(r4?.abs, '/proj/chapter/local.png');

  // Fallback via indexed projectAssets when path is declared in an external .cls/.sty
  const r5 = await resolveAssetPath('chart', {
    projectRoot: '/proj',
    rootDir: '/proj',
    graphicsPaths: [],
    projectAssets: ['nested/deep/chart.png']
  }, statFile);
  assert.equal(r5?.abs, '/proj/nested/deep/chart.png');

  // Windows path preservation
  const winCands = buildAssetCandidates('design.pdf', {
    projectRoot: 'C:\\Work\\Paper',
    rootDir: 'C:\\Work\\Paper',
    graphicsPaths: ['figures/', './']
  });
  assert.equal(winCands[0], 'C:\\Work\\Paper\\figures\\design.pdf');
}

// 3. Matching \includegraphics / \includesvg (single-line, multi-line, multiple per line)
{
  const single = String.raw`\centering\includegraphics[width=\textwidth]{design.pdf}`;
  assert.equal(matchGraphicsAtOffset(single, single.indexOf('design.pdf'))?.file, 'design.pdf');

  const multi = String.raw`\centering\includegraphics[width=\textwidth]` + '\n' + String.raw`{design.pdf}`;
  assert.equal(matchGraphicsAtOffset(multi, multi.indexOf('textwidth'))?.file, 'design.pdf');
  assert.equal(matchGraphicsAtOffset(multi, multi.indexOf('design.pdf'))?.file, 'design.pdf');

  const two = String.raw`\includegraphics{a.png} \includegraphics*{b.pdf}`;
  assert.equal(matchGraphicsAtOffset(two, two.indexOf('a.png'))?.file, 'a.png');
  assert.equal(matchGraphicsAtOffset(two, two.indexOf('b.pdf'))?.file, 'b.pdf');

  const svg = String.raw`\includesvg[width=0.8\linewidth]{arch}`;
  assert.equal(matchGraphicsAtOffset(svg, svg.indexOf('arch'))?.file, 'arch');
}

// 4. isPathInside boundary checks (Bug #2 guard)
{
  assert.equal(isPathInside('/proj/chapter/ch1.tex', '/proj'), true);
  assert.equal(isPathInside('/proj/chapter/ch1.tex', '/proj/'), true);
  assert.equal(isPathInside('/proj2/chapter/ch1.tex', '/proj'), false);
  assert.equal(isPathInside('/proj', '/proj'), false);
  assert.equal(isPathInside('/proj/chapter/../../outside.tex', '/proj'), false);
  assert.equal(isPathInside('/proj/chapter/../main.tex', '/proj'), true);
  assert.equal(isPathInside('C:\\Work\\Thesis\\chapter\\ch1.tex', 'C:\\Work\\Thesis'), true);
  assert.equal(isPathInside('C:\\Work\\Thesis2\\chapter\\ch1.tex', 'C:\\Work\\Thesis'), false);
}

// 5. resolveOpenTarget for chapter subfiles with custom-named root and subfiles class
{
  await fs.mkdir(path.resolve('.tmp'), { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.tmp/test-subfile-'));
  try {
    await fs.mkdir(path.join(root, 'chapter'), { recursive: true });
    const mainTex = path.join(root, 'dissertation.tex');
    await fs.writeFile(mainTex, '\\documentclass{book}\n\\begin{document}\n\\input{chapter/ch1}\n\\end{document}\n');
    const ch1 = path.join(root, 'chapter', 'ch1.tex');
    await fs.writeFile(ch1, '\\chapter{Intro}\nHello world.\n');
    const ch2 = path.join(root, 'chapter', 'ch2.tex');
    await fs.writeFile(ch2, '\\documentclass[../dissertation.tex]{subfiles}\n\\begin{document}\nSubfile content.\n\\end{document}\n');
    const ch3 = path.join(root, 'chapter', 'ch3.tex');
    await fs.writeFile(ch3, '\\chapter{Unreferenced}\nStill belongs to dissertation.\n');

    const t1 = await resolveOpenTarget(ch1);
    assert.equal(t1.root, root);
    assert.equal(t1.rootFile, mainTex);
    assert.equal(t1.file, ch1);

    const t2 = await resolveOpenTarget(ch2);
    assert.equal(t2.root, root);
    assert.equal(t2.rootFile, mainTex);
    assert.equal(t2.file, ch2);

    const t3 = await resolveOpenTarget(ch3);
    assert.equal(t3.root, root);
    assert.equal(t3.rootFile, mainTex);
    assert.equal(t3.file, ch3);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

// 6. Code highlight themes completeness and gutter background sync
{
  const { CODE_THEMES } = await import('../src/js/code-themes.js');
  const { CODE_THEME_SPECS, buildMonacoTheme } = await import('../src/js/editor-theme-data.js');
  const ids = new Set();
  for (const [id, label, swatch, mode] of CODE_THEMES) {
    assert.ok(id && label && /^#[0-9a-f]{6}$/i.test(swatch), `invalid theme entry: ${id}`);
    assert.equal(ids.has(id), false, `duplicate theme id: ${id}`);
    ids.add(id);
    if (id === 'auto') continue;
    const spec = CODE_THEME_SPECS[id];
    assert.ok(spec, `missing theme spec for ${id}`);
    assert.equal(spec.base, mode === 'dark' ? 'vs-dark' : 'vs', `wrong base for ${id}`);
    const built = buildMonacoTheme(spec);
    assert.equal(built.colors['editorGutter.background'], built.colors['editor.background'], `gutter mismatch for ${id}`);
    assert.equal(built.colors['editorStickyScroll.background'], built.colors['editor.background'], `sticky mismatch for ${id}`);
    assert.ok(built.rules.length >= 16, `incomplete token rules for ${id}`);
  }
  const layoutCss = await fs.readFile(path.resolve('src/styles/layout.css'), 'utf8');
  assert.ok(layoutCss.includes('.monaco-editor .margin { background: var(--editor-code-gutter, var(--editor-gutter)) !important; }'));
  assert.ok(layoutCss.includes('.project-pill[hidden], .act-btn[hidden] { display: none !important; }'));
}

// 7. Clean auxiliary files both inside .latex_cache and outside in project directories
{
  const { Compiler } = require('../electron/lib/compiler');
  await fs.mkdir(path.resolve('.tmp'), { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.tmp/test-clean-'));
  try {
    await fs.mkdir(path.join(root, '.latex_cache'), { recursive: true });
    await fs.mkdir(path.join(root, 'chapters'), { recursive: true });
    await fs.writeFile(path.join(root, 'main.tex'), '\\documentclass{article}\\begin{document}hi\\end{document}');
    await fs.writeFile(path.join(root, '.latex_cache', 'main.aux'), 'cache-aux');
    await fs.writeFile(path.join(root, 'main.log'), 'root-log');
    await fs.writeFile(path.join(root, 'main.synctex.gz'), 'root-synctex');
    await fs.writeFile(path.join(root, 'chapters', 'ch1.aux'), 'chapter-aux');
    const store = { get: (_k, d) => d };
    const project = { root, rootFile: path.join(root, 'main.tex') };
    const compiler = new Compiler({ store, tex: { get: () => '' }, project, send: () => {} });
    const plan = compiler.cleanPlan(false);
    const names = plan.files.map((f) => path.relative(root, f.file).replace(/\\/g, '/')).sort();
    assert.deepEqual(names, ['.latex_cache/main.aux', 'chapters/ch1.aux', 'main.log', 'main.synctex.gz']);
    const cleaned = compiler.clean(false);
    assert.equal(cleaned.ok, true);
    assert.equal(cleaned.removed, 4);
    assert.equal(await fs.stat(path.join(root, 'main.tex')).then(() => true).catch(() => false), true);
    assert.equal(await fs.stat(path.join(root, 'chapters', 'ch1.aux')).then(() => true).catch(() => false), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

// 8. ProjectService.tree showHidden option
{
  const { ProjectService } = require('../electron/lib/fsops');
  await fs.mkdir(path.resolve('.tmp'), { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.tmp/test-hidden-'));
  try {
    await fs.mkdir(path.join(root, '.latex_cache'), { recursive: true });
    await fs.mkdir(path.join(root, '.github'), { recursive: true });
    await fs.writeFile(path.join(root, 'main.tex'), 'hi');
    const svc = new ProjectService({ get: (_k, d) => d, set: () => {} }, root);
    svc.root = root;
    const defaultTree = await svc.tree(root, 0, { showHidden: false });
    assert.deepEqual(defaultTree.map((n) => n.name), ['main.tex']);
    const hiddenTree = await svc.tree(root, 0, { showHidden: true });
    const hiddenNames = hiddenTree.map((n) => n.name).sort();
    assert.deepEqual(hiddenNames, ['.github', '.latex_cache', 'main.tex']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

// 9. Overleaf real-time chat & comment event normalization
{
  const { OverleafLiveManager } = require('../electron/lib/overleaf-live');
  const events = [];
  const mgr = new OverleafLiveManager({ emitToRenderer: (e) => events.push(e) });
  mgr.handleBridgeEvent('chatMessage', { id: 'm1', content: 'Hello!', timestamp: 1700000000000, user: { id: 'u1', first_name: 'Alice', last_name: 'Wu' } });
  mgr.handleBridgeEvent('commentEvent', { kind: 'newComment', threadId: 't1', comment: { id: 'c1', content: 'Check eq. 2', timestamp: 1700000001000, user: { id: 'u2', email: 'bob@example.com' } } });
  assert.equal(events.length, 2);
  assert.equal(events[0].type, 'chatMessage');
  assert.equal(events[0].message.user.name, 'Alice Wu');
  assert.equal(events[1].type, 'commentEvent');
  assert.equal(events[1].threadId, 't1');
  assert.equal(events[1].comment.content, 'Check eq. 2');
}

console.log('PASS asset-and-subfile: all 9 suites passed.');
