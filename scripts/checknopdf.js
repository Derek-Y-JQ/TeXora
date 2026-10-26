export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(500); }
  await sleep(3000);
  console.log('status1', await evalJs("document.querySelector('#sbBuildText').textContent"));
  for(let i=0;i<20;i++){ await sleep(1000); const s=await evalJs("document.querySelector('#sbBuildText').textContent"); if(/成功|失败/.test(s)){ console.log('status2',s); break; } }
  console.log('pages', await evalJs("document.querySelectorAll('.pdf-page').length"));
}
