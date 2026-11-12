import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PreviewState,hoverPlacement,formulaPlacement} from '../src/js/preview-state.js';
test('stationary pointer never steals caret ownership; actual motion does',()=>{
 const s=new PreviewState();assert.equal(s.takePointer(10,20),true);s.takeCaret();
 assert.equal(s.takePointer(10,20),false);assert.equal(s.source,'caret');
 assert.equal(s.takePointer(11,20),true);assert.equal(s.source,'pointer');
 s.leave();assert.equal(s.pointer,null);assert.equal(s.takePointer(11,20),true);
});
test('dismissal survives pointer/caret switches and clears after leaving formula',()=>{
 const s=new PreviewState();s.dismiss('file:1');s.takePointer(1,2);s.takeCaret();
 assert.equal(s.canShow('file:1'),false);assert.equal(s.canShow('other:1'),true);
 s.exitFormula();assert.equal(s.canShow('file:1'),true);
});
test('overlays clamp to viewport, formulas prefer usable space above',()=>{
 assert.deepEqual(hoverPlacement({width:500,height:400},{width:200,height:100},{left:490,top:390}),{left:290,top:290});
 assert.deepEqual(hoverPlacement({width:10,height:10},{width:200,height:100},{left:-1,top:-1}),{left:8,top:8});
 const p=formulaPlacement({width:500,height:400},200,{left:490,top:250,height:20},100);
 assert.equal(p.left,288);assert.equal(p.top,140);assert.equal(p.maxHeight,238);
 assert.equal(formulaPlacement({width:500,height:400},200,{left:10,top:20,height:20},100).top,50);
});
