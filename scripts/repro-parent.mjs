export default async function repro({ evalJs, sleep }) {
  await evalJs("window.__texora.cmd('build.run')");
  for (let i = 0; i < 40; i++) {
    await sleep(800);
    const status = await evalJs("document.querySelector('#sbBuildText').textContent");
    if (/成功|失败/.test(status)) break;
  }
  console.log('root:', await evalJs("window.__texora.state.project.root"));
  console.log('rootFile:', await evalJs("window.__texora.state.project.rootFile"));
  console.log('status:', await evalJs("document.querySelector('#sbBuildText').textContent"));
  console.log('problems:', await evalJs("JSON.stringify(window.__texora.state.problems.slice(0,4).map(p=>({sev:p.severity,msg:p.message,file:p.file})))"));
  console.log('logTail:', (await evalJs("window.__texora.state.log.slice(-1200)")).replace(/\n/g,' | ').slice(-1200));
}
