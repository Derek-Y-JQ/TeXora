export default async function verifyCompile({ evalJs, sleep }) {
  await evalJs("window.__texora.cmd('build.run')");
  for (let i = 0; i < 80; i++) {
    await sleep(700);
    const st = await evalJs("document.querySelector('#sbBuildText').textContent");
    if (/成功|失败/.test(st) && !(await evalJs("window.__texora.state.build.running"))) break;
  }
  const info = await evalJs("(async () => { const st = window.__texora.state; const root = st.project.root; const rf = st.project.rootFile; const fwd = await window.texora.tex.synctexForward(rf, 80, 1); const inv = fwd.ok ? await window.texora.tex.synctexInverse(fwd.page, fwd.x + 2, fwd.y + 2) : null; return { root, rootFile: rf, status: document.querySelector('#sbBuildText').textContent, pages: document.querySelectorAll('.pdf-page').length, errs: st.problems.filter(p=>p.severity==='error').length, warns: st.problems.filter(p=>p.severity==='warning').length, pdf: st.build.result?.rootPdf, fwd: {ok:fwd.ok,page:fwd.page,err:fwd.error&&fwd.error.slice(0,80)}, inv: inv && {ok:inv.ok,line:inv.line} }; })()");
  console.log(JSON.stringify(info, null, 2));
  const fsCheck = await evalJs("(async () => { const r = await window.texora.fs.stat(window.__texora.state.build.result?.rootPdf || ''); return r; })()");
  console.log('rootPdf stat:', JSON.stringify(fsCheck));
}
