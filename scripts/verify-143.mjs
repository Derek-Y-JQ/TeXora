import assert from 'node:assert/strict';
import path from 'node:path';
import {spawn} from 'node:child_process';
export default async function({evalJs:runJs,sleep,send,shot}){
 const evalJs=async expression=>{try{return await runJs(expression);}catch(e){throw Error(e.message+' EXPRESSION: '+expression);}};
 const wait=async expr=>{for(let i=0;i<450;i++){if(await evalJs(expr))return;await sleep(100);}throw Error('Timed out '+expr);};
 await wait('!!window.__texora?.editor.model');
 assert.equal(await evalJs('(async()=>(await window.texora.info()).version)()'),'1.4.3');
 await send('Emulation.setDeviceMetricsOverride',{width:1500,height:980,deviceScaleFactor:1,mobile:false});
 await evalJs('window.__texora.state.settings.editor.autosave=false;window.__texora.state.settings.build.livePreview=false');
 // Cold shell open must select the requested child rather than the restored root.
 assert.equal(await evalJs('window.__texora.state.activePath.replace(/\\\\/g,"/").endsWith("chapters/中文 chapter.tex")'),true);
 await evalJs(`window.__texora.editor.model.setValue('format me');window.__texora.editor.editor.setSelection({startLineNumber:1,startColumn:1,endLineNumber:1,endColumn:10});window.__texora.editor.wrapSelection('bold');true`);
 assert.equal(await evalJs('window.__texora.editor.model.getValue()'),String.raw`\textbf{format me}`);
 await evalJs('window.__texora.editor.wrapSelection("bold");true');assert.equal(await evalJs('window.__texora.editor.model.getValue()'),'format me');
 await evalJs('window.__texora.editor.editor.trigger("test","undo",{});true');assert.equal(await evalJs('window.__texora.editor.model.getValue()'),String.raw`\textbf{format me}`);
 // Independent PDF reading never replaces the editable project.
 const pdf=path.resolve('.capture/verify143-project/main.pdf');
 await evalJs(`window.__savedRoot143=window.__texora.state.project.root;window.__texora.app.openPdf(${JSON.stringify(pdf)});true`);
 await wait('window.__texora.preview.pages.length===4 && !!document.querySelector(".textLayer span")');
 assert.equal(await evalJs('window.__texora.preview.standalone'),true);
 assert.equal(await evalJs('window.__texora.state.project.root===window.__savedRoot143'),true);
 assert.ok(await evalJs('document.querySelector(".textLayer").textContent.includes("Vector page")'));
 assert.equal(await evalJs('document.querySelectorAll(".vector-page img").length'),0);
 await evalJs('window.__texora.preview.scrollToPage(3);true');await sleep(700);
 await evalJs('window.__texora.preview.stage.scrollTop+=120;true');await sleep(200);
 const before=await evalJs('window.__texora.preview.capturePosition()');
 const oldWidth=await evalJs('document.querySelector("canvas").width');
 await evalJs('window.__texora.preview.setZoom(1.7);true');await sleep(600);
 assert.equal((await evalJs('window.__texora.preview.capturePosition()')).page,before.page);
 await wait('window.__texora.preview.pageEls[2]?._paintedWidth>0');
 assert.ok(await evalJs('window.__texora.preview.pageEls[2]?.querySelector("canvas").width')>oldWidth);
 await evalJs(`window.__texora.preview.openPdf(${JSON.stringify(pdf)},{identity:${JSON.stringify(pdf)},standalone:true});true`);
 await wait('window.__texora.preview.pages.length===4 && !!window.__texora.preview.pageEls[2]?.querySelector("canvas")');
 const after=await evalJs('window.__texora.preview.capturePosition()');assert.equal(after.page,before.page);assert.ok(Math.abs(after.ratio-before.ratio)<0.05);
 await shot('.capture/143-pdf.png');
 // Verify a real XeLaTeX build, then rebuild while reading page 3.
 await evalJs('for(const doc of window.__texora.state.docs.values())doc.dirty=false;window.__texora.app.openDocument(window.__texora.state.project.rootFile);true');
 await sleep(200);
 await evalJs('(async()=>{await window.texora.settings.set("build.engine","xelatex");await window.__texora.app.runBuild();return true})()');
 await wait('window.__texora.state.build.state==="ok" && !window.__texora.preview.standalone && window.__texora.preview.pages.length===4');
 await evalJs('window.__texora.preview.scrollToPage(3);true');await sleep(700);
 await evalJs('window.__texora.preview.stage.scrollTop+=100;true');await sleep(200);
 const readPosition=await evalJs('window.__texora.preview.capturePosition()');
 await evalJs('(async()=>{await window.__texora.app.runBuild();return true})()');
 await wait('window.__texora.state.build.state==="ok" && window.__texora.preview.pages.length===4');
 const rebuilt=await evalJs('window.__texora.preview.capturePosition()');assert.equal(rebuilt.page,readPosition.page);assert.ok(Math.abs(rebuilt.ratio-readPosition.ratio)<0.03);
 // Real error must have actionable diagnostics and label the retained preview.
 await evalJs('window.__texora.editor.model.setValue("\\\\documentclass{article}\\n\\\\begin{document}\\n\\\\invalidcommand143\\n\\\\end{document}");true');
 await evalJs('(async()=>{await window.__texora.app.runBuild();return true})()');
 await wait('window.__texora.state.build.state==="error"');
 assert.ok(await evalJs('window.__texora.state.problems.some(p=>p.severity==="error")'));
 assert.ok(await evalJs('document.querySelector("#problemsBody").textContent.length>100'));
 assert.ok(await evalJs('document.querySelector("#pdfDocumentStatus").textContent.includes("上次成功")'));
 await shot('.capture/143-build-error.png');
 await evalJs(`window.__texora.editor.model.setValue('\\\\begin{itemize}\\n\\\\item test\\n\\\\end{itemize}');window.__beforeFormat143=window.__texora.editor.model.getValue();window.__texora.editor.editor.setPosition({lineNumber:1,column:1});window.__texora.app.beautify();true`);
 await wait('!!document.querySelector("#dlgRestore")');
 assert.equal(await evalJs('window.__texora.editor.model.getValue()===window.__beforeFormat143'),true,'format changes wait for confirmation');
 await evalJs('document.querySelector("#dlgRestore").click();true');await sleep(250);
 assert.equal(await evalJs('window.__texora.editor.model.getValue()===window.__beforeFormat143'),false);
 await evalJs('window.__texora.editor.editor.trigger("test","undo",{});true');
 assert.equal(await evalJs('window.__texora.editor.model.getValue()===window.__beforeFormat143'),true);
 await evalJs('window.__texora.app.cleanBuild(false);true');await wait('document.querySelector(".modal-title")?.textContent.includes("清理编译产物")');
 assert.ok(await evalJs('document.querySelector(".modal-body").textContent.includes(".aux")'));
 await evalJs('document.querySelector(".modal-close").click();true');
 // History restores the full Markdown answer, and follow-up includes it in context.
 await evalJs(`(async()=>{const c=window.__texora;await c.api.ai.historySave({id:'verify143-answer',projectRoot:c.state.project.root,sourcePath:c.state.activePath,instruction:'说明',title:'历史回答',original:'',suggestion:'## 完整回答\\n'+'这是一段长回答。'.repeat(100)+'\\nEND-OF-ANSWER-143',snapshot:{},responseMode:'answer',incomplete:true});await c.ai.loadHistory();c.sidebar.show('ai');c.ai.resultAction({id:'verify143-answer'});return true})()`);
 assert.ok(await evalJs('document.querySelector(".ai-answer h2")?.textContent.includes("完整回答")'));
 assert.ok(await evalJs('document.querySelector(".ai-answer").textContent.endsWith("END-OF-ANSWER-143"+"\\n") || document.querySelector(".ai-answer").textContent.trim().endsWith("END-OF-ANSWER-143")'));
 await evalJs(`window.__api143=window.__texora.api;window.__texora.api={...window.__api143,ai:{...window.__api143.ai,chat:async payload=>{window.__followup143=payload;return {ok:true,text:'## 接续回答\\n没有丢失上一段。'}}}};window.__texora.state.settings.ai.apiKey='fixture-only';document.querySelector('[data-answer-continue]').click();true`);
 await wait('!!window.__followup143 && !window.__texora.state.aiBusy');
 assert.ok(await evalJs('window.__followup143.messages.some(m=>m.role==="assistant"&&m.content.includes("END-OF-ANSWER-143"))'));
 await shot('.capture/143-ai-history.png');
 await evalJs('document.querySelector(".modal-close")?.click();window.__texora.api=window.__api143;for(const d of window.__texora.state.docs.values())d.dirty=false;true');
 const launch=file=>{const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const child=spawn(process.env.TEXORA_APP||process.env.TEXORA_ELECTRON,[...(process.env.TEXORA_APP?[]:[process.cwd()]),'--disable-gpu','--no-sandbox',file],{env,stdio:'ignore',windowsHide:true});return new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Second instance exit '+code)));});};
 const other=path.resolve('.capture/verify143-other/另一个文件.tex');await launch(other);
 await wait('window.__texora.state.activePath==='+JSON.stringify(other));
 await sleep(800);assert.equal(await evalJs('window.__texora.state.activePath'),other,'warm open must remain on the requested file');
 assert.equal(await evalJs('window.__texora.state.problems.length'),0,'new projects must not inherit old diagnostics');
 assert.equal(await evalJs('window.__texora.state.build.state'), 'idle');
 assert.equal(await evalJs('window.__texora.state.docs.size'),1);
 await launch(pdf);await wait('window.__texora.preview.standalone && window.__texora.preview.pages.length===4');
 await sleep(800);assert.equal(await evalJs('window.__texora.state.activePath'),other,'opening PDF must not switch the project');
 if(process.env.TEXORA_CJK_PDF){
  await evalJs(`window.__texora.app.openPdf(${JSON.stringify(process.env.TEXORA_CJK_PDF)});true`);
  await wait('window.__texora.preview.pages.length===10 && document.querySelector(".textLayer")?.textContent.includes("TeXora")');
  assert.ok(await evalJs('/[\\u4e00-\\u9fff]/.test(document.querySelector(".textLayer").textContent)'));
  await shot('.capture/143-chinese-pdf.png');
 }
 if(process.env.TEXORA_LONG_PDF){
  await evalJs(`window.__texora.app.openPdf(${JSON.stringify(process.env.TEXORA_LONG_PDF)});true`);
  await wait('window.__texora.preview.pages.length>400 && !!document.querySelector(".textLayer span")');
  await evalJs('window.__texora.preview.scrollToPage(237);true');await sleep(800);
  await wait('window.__texora.preview.pageEls[236]?._paintedWidth>0');
  assert.ok(await evalJs('/[\\u4e00-\\u9fff]/.test(window.__texora.preview.pageEls[236].querySelector(".textLayer").textContent)'));
  assert.ok(await evalJs('document.querySelectorAll(".pdf-page canvas").length')<15,'long PDFs keep only nearby canvases');
  await shot('.capture/143-long-pdf.png');
 }
 console.log('PASS 1.4.3 UI: cold/warm shell-selected files and PDF, toggle/undo, PDF text/scale redraw, rebuild page retention, real error diagnostics, complete Markdown history and follow-up context.');
}
