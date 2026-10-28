import assert from 'node:assert/strict';
export default async function({evalJs,sleep,send,shot}) {
 async function waitFor(expr,count=100){for(let i=0;i<count;i++){if(await evalJs(expr))return;await sleep(30);}throw Error('Timed out: '+expr);}
 await waitFor('!!window.__texora?.editor.model');
 await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
 await evalJs("(()=>{const c=window.__texora,e=c.editor;c.state.settings.build.livePreview=false;c.state.settings.files.autoSave=false;const p=e.model.getPositionAt(e.model.getValue().indexOf('x^2')+2);e.editor.revealLineInCenter(p.lineNumber);e.editor.setPosition(p);e.editor.focus();window.__caretLine=p.lineNumber;return true;})()");
 await sleep(300);
 async function move(marker){const p=await evalJs(`(()=>{const e=window.__texora.editor,p=e.model.getPositionAt(e.model.getValue().indexOf(${JSON.stringify(marker)})+1),v=e.editor.getScrolledVisiblePosition(p),r=e.editor.getDomNode().getBoundingClientRect();return {x:r.left+v.left+2,y:r.top+v.top+v.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});}
 await move('x^2');await waitFor('window.__texora.editor.liveMath?.math.code==="x^2+1"');
 await move('x+\\norm');await waitFor('window.__texora.editor.liveMath?.math.code.includes("norm")');
 assert.equal(await evalJs('window.__texora.editor.editor.getPosition().lineNumber'),await evalJs('window.__caretLine'),'pointer switching requires no click/caret move');
 await move('a+2');await waitFor('window.__texora.editor.liveMath?.math.code==="a+2"');
 await move('$ trailing');await waitFor('document.querySelector(".texora-hover").style.display==="none"');
 await sleep(400);assert.equal(await evalJs('document.querySelector(".texora-hover").style.display'),'none');
 await move('Cell target');await waitFor('document.querySelector(".texora-hover").style.display==="none"');
 await sleep(160);assert.equal(await evalJs('document.querySelector(".texora-hover").style.display'),'none','pending caret callback must not reopen the old formula');
 await move('x^2');await waitFor('!!window.__texora.editor.liveMath');
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:800,y:20});
 await waitFor('document.querySelector(".texora-hover").style.display==="none"');
 await move('x^2');await waitFor('!!window.__texora.editor.liveMath');
 await evalJs("window.__texora.editor.editor.trigger('keyboard','type',{text:'+7'})");
 await waitFor('window.__texora.editor.liveMath?.math.code.includes("7")');
 assert.equal(await evalJs('document.querySelector(".live-math").style.display'),'block');
 // Pointer movement wins over a pending debounce from typing at the caret.
 await evalJs("window.__texora.editor.editor.trigger('keyboard','type',{text:'+8'})");
 await move('x+\\norm');await waitFor('window.__texora.editor.liveMath?.math.code.includes("norm")');
 await sleep(180);assert.ok(await evalJs('window.__texora.editor.liveMath.math.code.includes("norm")'));
 await shot('.capture/preview-pointer/switched-without-click.png');
 await move('Cell target');
 await evalJs("(()=>{const c=window.__texora;c.api={...c.api,tex:{...c.api.tex,snippet:()=>new Promise(resolve=>{window.__finishOldPreview=resolve;})}};return true;})()");
 await evalJs("(()=>{const e=window.__texora.editor,m=e.model,a=m.getValue().indexOf('norm{v}')+5,p=m.getPositionAt(a);m.applyEdits([{range:{startLineNumber:p.lineNumber,startColumn:p.column,endLineNumber:p.lineNumber,endColumn:p.column},text:'987654321+'}]);return true;})()");
 await move('x+\\norm');
 await waitFor('!!window.__finishOldPreview');
 await move('Cell target');await waitFor('document.querySelector(".texora-hover").style.display==="none"');
 await evalJs("window.__finishOldPreview({ok:false,error:'obsolete'});true");await sleep(150);
 assert.equal(await evalJs('document.querySelector(".texora-hover").style.display'),'none');
 console.log('PASS: real mouse A/B formula switching without clicks, leave formula/editor hides, stationary-pointer typing stays live, pointer supersedes caret debounce, delayed native result cannot reopen dismissed hover.');
}
