export default async function t({ evalJs, sleep }) {
  for(let i=0;i<20;i++){ if(await evalJs("!!window.__texora")) break; await sleep(1000); }
  await evalJs("document.querySelector('#findBtn').click()");
  await sleep(400);
  console.log('bar', await evalJs("(() => { const b=document.querySelector('#findBar'); return {open:b.classList.contains('open'),replace:!b.querySelector('.find-replace-line').classList.contains('hidden'),top:b.getBoundingClientRect().top}; })()"));
  await evalJs("document.querySelector('#findClose').click()");
  await evalJs("window.__texora.app.findInFile()");
  await sleep(300);
  console.log('find only', await evalJs("(() => { const b=document.querySelector('#findBar'); return {open:b.classList.contains('open'),replace:!b.querySelector('.find-replace-line').classList.contains('hidden')}; })()"));
}
