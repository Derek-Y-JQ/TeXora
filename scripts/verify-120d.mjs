export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  for(let i=0;i<30;i++){ await sleep(1000); if((await evalJs("document.querySelectorAll('.math-zone').length"))>0) break; }
  console.log('zones', await evalJs("document.querySelectorAll('.math-zone').length"));
  await evalJs("document.querySelector('#findBtn').click()");
  await sleep(300);
  console.log('find', await evalJs("(() => { const b=document.querySelector('#findBar'); return {open:b.classList.contains('open'),replace:!b.querySelector('.find-replace-line').classList.contains('hidden'),top:b.getBoundingClientRect().top}; })()"));
}
