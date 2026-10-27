import assert from 'node:assert/strict';
import path from 'node:path';
export default async function({evalJs,sleep,shot}) {
  const a=path.resolve('.capture/project-preview-regression/中文项目');
  const b=path.resolve('.capture/project-preview-regression/external');
  async function waitFor(expr){for(let i=0;i<160;i++){if(await evalJs(expr))return;await sleep(100);}throw Error(expr);}
  await waitFor('!!window.__texora?.app');
  await waitFor('!!window.__texora.state.build.result?.pages?.length');
  const initial=await evalJs('({root:window.__texora.state.project.root,pdf:window.__texora.state.build.result.pdf,pages:document.querySelectorAll(".pdf-page").length})');
  assert.equal(initial.root,a); assert.ok(initial.pages);
  // Force an old existing-PDF request to finish after a different project opens.
  await evalJs(`(()=>{const c=window.__texora,original=c.app.loadCachedPreview;window.__oldLoad=original();window.__switch=c.app.openProject(${JSON.stringify(b)});return true;})()`);
  await waitFor(`window.__texora.state.project.root===${JSON.stringify(b)} && !!window.__texora.state.build.result?.pdf`);
  await evalJs('(async()=>{await window.__oldLoad;await window.__switch;return true;})()');
  assert.ok(await evalJs(`window.__texora.state.build.result.pdf.startsWith(${JSON.stringify(b)})`));
  // Multiple rapidly queued switches: latest request owns the UI and preview.
  await evalJs(`(()=>{window.__switches=[window.__texora.app.openProject(${JSON.stringify(a)}),window.__texora.app.openProject(${JSON.stringify(b)}),window.__texora.app.openProject(${JSON.stringify(a)})];return true;})()`);
  await evalJs('(async()=>{await Promise.all(window.__switches);return true;})()');
  await waitFor(`window.__texora.state.project.root===${JSON.stringify(a)} && window.__texora.state.build.result?.pdf?.startsWith(${JSON.stringify(a)})`);
  const sync=await evalJs(`(async()=>await window.texora.tex.synctexForward(${JSON.stringify(path.join(a,'source/main.tex'))},3,1))()`);
  assert.ok(sync.ok,JSON.stringify(sync));
  await shot('.capture/project-preview-regression/ui-reopened.png');
  await evalJs('(async()=>{await window.__texora.app.closeProject();return true;})()');
  assert.equal(await evalJs('document.querySelectorAll(".pdf-page").length'),0);
  assert.equal(await evalJs('window.__texora.state.build.result'),null);
  console.log('PASS: startup existing PDF, stale request rejection, rapid A/B/A switching, reopened SyncTeX, close clears PDF.');
}
