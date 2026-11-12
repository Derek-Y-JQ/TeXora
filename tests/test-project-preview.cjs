const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const assert = require('node:assert/strict');
const { Compiler } = require('../electron/lib/compiler');
const { TexEnv } = require('../electron/lib/texenv');
const { ProjectService } = require('../electron/lib/fsops');
const { DEFAULT_SETTINGS } = require('../electron/lib/store');
const settings = structuredClone(DEFAULT_SETTINGS);
settings.build.engine = 'pdflatex';
settings.build.recipe = 'single';
const store = { get: (key, fallback) => key.split('.').reduce((v,k)=>v?.[k], settings) ?? fallback, set() {} };
const root = path.resolve('.capture/project-preview-regression');
const make = (project, tex) => new Compiler({store, project, tex, fallbackCacheRoot: path.join(root, 'fallback')});
(async () => {
  await fsp.mkdir(root, {recursive:true});
  const tex = new TexEnv(store, root); tex.detect();
  const dir = path.join(root, '中文项目', 'source');
  await fsp.mkdir(dir, {recursive:true});
  const rootFile = path.join(dir, 'main.tex');
  await fsp.writeFile(rootFile, String.raw`\documentclass{article}
\begin{document}
First paragraph with a forward and inverse SyncTeX target.

Second paragraph with enough text for a useful source location.
\end{document}`);
  const project = {root:path.dirname(dir), rootFile, revision:1};
  const built = await make(project, tex).build();
  assert.ok(built.ok, built.transcriptTail);
  assert.ok(built.previewPdf);assert.deepEqual(built.pages,[],'document previews must not rasterize');
  const reopened = make(project, tex);
  const start = performance.now();
  const result = await reopened.loadExisting();
  const elapsed = Math.round(performance.now()-start);
  assert.ok(result.ok);
  assert.equal(result.synctexPdf, built.pdf, 'root copy must reconnect to matching trace');
  assert.equal(result.previewPdf, built.previewPdf, 'reopen must reuse immutable PDF bytes');
  reopened.renderUncached = () => { throw new Error('cached reopen must not rasterize'); };
  assert.ok((await reopened.loadExisting()).ok);
  const forward = await reopened.synctexForward(rootFile, 3, 1);
  assert.ok(forward.ok, JSON.stringify(forward));
  const inverse = await reopened.synctexInverse(forward.page, forward.x, forward.y);
  assert.ok(inverse.ok, JSON.stringify(inverse));
  assert.equal(path.resolve(inverse.file), rootFile);
  // A PDF next to sources, outside the build cache, must also render correctly.
  const externalDir = path.join(root, 'external'); await fsp.mkdir(externalDir, {recursive:true});
  await fsp.copyFile(built.pdf, path.join(externalDir, 'main.pdf'));
  await fsp.copyFile(rootFile, path.join(externalDir, 'main.tex'));
  const external = make({root:externalDir,rootFile:path.join(externalDir,'main.tex'),revision:2},tex);
  const plain = await external.loadExisting();
  assert.ok(plain.ok); assert.equal(plain.synctexPdf, '', 'do not bind another project trace');
  assert.ok(fs.existsSync(plain.previewPdf));
  // Hold a PDF snapshot while switching projects: it must never replace lastResult.
  let release;
  const delayed = make({...project},tex);
  delayed.snapshotPdf = () => new Promise(r => {release = r;});
  const pending = delayed.loadExisting();
  while (!release) await new Promise(r=>setTimeout(r,5));
  delayed.project.root = externalDir; delayed.project.rootFile = external.project.rootFile; delayed.project.revision++;
  release(built.previewPdf);
  assert.ok((await pending).cancelled); assert.equal(delayed.lastResult,null);
  const service = new ProjectService(store,root);
  let finish;
  service.detectRootFile = dir => dir === project.root ? new Promise(r => {finish=r;}) : Promise.resolve(external.project.rootFile);
  const first = service.open(project.root);
  while(!finish) await new Promise(r=>setTimeout(r,5));
  await service.open(externalDir); finish(rootFile);
  assert.ok((await first).cancelled); assert.equal(service.root,externalDir); service.close();
  console.log(JSON.stringify({ok:true,reopenMs:elapsed,pages:result.pages.length,forward,inverse,external:true,stalePreviewRejected:true,staleProjectRejected:true}));
})().catch(e=>{console.error(e);process.exitCode=1;});
