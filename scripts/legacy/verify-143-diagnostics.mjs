import assert from 'node:assert/strict';
export default async function({evalJs,sleep,shot,send}){
 const wait=async expression=>{for(let n=0;n<150;n++){if(await evalJs(expression))return;await sleep(100);}throw Error('Timed out '+expression);};
 await wait('!!window.__texora?.editor.model');
 assert.equal(await evalJs('(async()=>(await window.texora.info()).version)()'),'1.4.3');
 await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1000,deviceScaleFactor:1,mobile:false});
 const markdown='# 一级标题\n\n## 二级标题\n\n### 三级标题\n\n#### 四级标题\n\n##### 五级标题\n\n###### 六级标题\n\n这是正文与 `inline code`，以及 [链接](https://example.org)。\n\n> 引用也应清晰可读。\n\n```latex\n\\documentclass{article}\n```\n\n| 项目 | 结果 |\n| --- | --- |\n| 中文 | 可读 |\n';
 await evalJs(`(async()=>{const c=window.__texora;const file=await c.api.fs.createFile(c.state.project.root,'diagnostic.md',${JSON.stringify(markdown)});if(!file.ok)throw Error(file.error);await c.app.openDocument(file.path);return true;})()`);
 await wait('!!document.querySelector(".md-in-pane h6")');
 let minimum=Infinity;
 for(const theme of ['dark','light'])for(const accent of ['blue','green','sky','solarized']){
  await evalJs(`(async()=>{await window.texora.settings.set('appearance.theme',${JSON.stringify(theme)});await window.texora.settings.set('appearance.accent',${JSON.stringify(accent)});return true})()`);
  await wait('document.documentElement.dataset.theme==='+JSON.stringify(theme));
  const rows=await evalJs(`(()=>{const root=document.querySelector('.md-in-pane');return [...root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,blockquote,code,th,td,a')].map(el=>{let bg=el;while(bg&&getComputedStyle(bg).backgroundColor==='rgba(0, 0, 0, 0)')bg=bg.parentElement;return {tag:el.tagName,color:getComputedStyle(el).color,background:getComputedStyle(bg||root).backgroundColor};});})()`);
  const luminance=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(v=>Number(v)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;};
  for(const row of rows){const a=luminance(row.color),b=luminance(row.background),contrast=(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);minimum=Math.min(minimum,contrast);assert.ok(contrast>=4.5,`${theme}/${accent} ${row.tag} contrast ${contrast} ${row.color}/${row.background}`);}
  if(accent==='blue')await shot('.capture/143-diagnostics-markdown-'+theme+'.png');
 }
 // The paper-specific palette must not override normal dark UI Markdown.
 await evalJs('(async()=>{await window.texora.settings.set("appearance.theme","dark");return true})()');
 assert.equal(await evalJs('(()=>{const box=document.createElement("div");box.className="md-preview";box.innerHTML="<h2>UI title</h2>";document.body.append(box);const same=getComputedStyle(box).color===getComputedStyle(box.firstChild).color;box.remove();return same;})()'),true);
 await evalJs(`window.__originalTexInfo=window.__texora.state.texInfo;window.__texora.state.texInfo={distro:'texlive',version:'TeX Live fixture',engines:{xelatex:true},tools:{tlmgr:'fixture-tlmgr',synctex:'yes',chktex:'yes',latexdiff:'yes',kpsewhich:'yes',mgs:'yes'}};window.__texora.settingsUI.open('tex');true`);
 await wait('!!document.querySelector("#setDetectTex")');
 assert.ok(await evalJs('document.querySelector("#setDetectTex").closest(".settings-content").textContent.includes("tlmgr（可用）")'));
 assert.ok(await evalJs('document.querySelector("#setDetectTex").closest(".settings-content").textContent.includes("编译与辅助功能均已就绪")'));
 await shot('.capture/143-diagnostics-texlive.png');
 await evalJs('(async()=>{window.__texora.settingsUI.close();window.__texora.state.texInfo=window.__originalTexInfo;await window.__texora.app.checkTexEnvironment();return true})()');
 await wait('[...document.querySelectorAll(".toast-title")].some(el=>el.textContent.includes("TeX 编译环境可用"))');
 console.log('PASS diagnostic UI: six heading levels, text/quotes/code/tables/links at minimum contrast '+minimum.toFixed(2)+':1 in day/night and four accents, paper/UI isolation, TeX Live manager explanation, actual environment check; version remains 1.4.3.');
}
