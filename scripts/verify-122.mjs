export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(5000);
  console.log('version', await evalJs("window.__texora.state.capture?.version"));
  console.log('pdf', await evalJs("({status:document.querySelector('#sbBuildText').textContent,pages:document.querySelectorAll('.pdf-page').length,cached:window.__texora.state.build.result?.cached})"));
  await evalJs("window.__texora.app.openFind(false)");
  await evalJs("document.querySelector('#findInput').value='The'; document.querySelector('#findInput').dispatchEvent(new Event('input',{bubbles:true}))");
  await sleep(500);
  console.log('case off', await evalJs("document.querySelector('#findCount').textContent"));
  await evalJs("document.querySelector('#findCase').click()");
  await sleep(400);
  console.log('case on', await evalJs("document.querySelector('#findCount').textContent"));
  console.log('buttons', await evalJs("[document.querySelector('#findReplaceOne').textContent,document.querySelector('#findReplaceAll').textContent]"));
}
