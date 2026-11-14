// Offsets make nested/multiline wrappers independent of editor selection direction.
export function formatContext(text,start,end,command){
 const open=command+'{',stack=[],wrappers=[];
 for(let i=0;i<text.length;i++){
  if(text[i]==='%'&&(i===0||text[i-1]!=='\\')){const e=text.indexOf('\n',i);i=e<0?text.length:e;continue;}
  if(text[i]==='\\'){if(text.startsWith(open,i)){stack.push({start:i,body:i+open.length,format:true});i+=open.length-1;}else i++;continue;}
  if(text[i]==='{')stack.push({format:false});
  if(text[i]==='}'){
   const item=stack.pop();if(item?.format)wrappers.push({...item,end:i+1,bodyEnd:i});
  }
 }
 return wrappers.filter(w=>(start>=w.body&&end<=w.bodyEnd)||(start===w.start&&end===w.end)).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0]||null;
}
export function toggleFormat(text,start,end,command){
 const wrapper=formatContext(text,start,end,command);
 if(wrapper){
  const body=text.slice(wrapper.body,wrapper.bodyEnd),whole=start===wrapper.start&&end===wrapper.end;
  return {start:wrapper.start,end:wrapper.end,text:body,selectionStart:whole?wrapper.start:start-(wrapper.body-wrapper.start),selectionEnd:whole?wrapper.start+body.length:end-(wrapper.body-wrapper.start)};
 }
 const prefix=command+'{';
 return {start,end,text:prefix+text.slice(start,end)+'}',selectionStart:start+prefix.length,selectionEnd:end+prefix.length};
}
const SIZES='tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge';
function matchingClose(text,open){
 let depth=0;
 for(let i=open;i<text.length;i++){
  const c=text[i];
  if(c==='\\'){i++;continue;}
  if(c==='{')depth++;
  else if(c==='}'&&--depth===0)return i;
 }
 return -1;
}
// A `{\size body}` group counts as the context when the selection is the whole group or exactly its body.
export function sizeContext(text,start,end){
 if(text[start]==='{'){
  const head=new RegExp('^\\{\\\\('+SIZES+')(?![A-Za-z])[ \\t]?').exec(text.slice(start,end));
  if(head&&matchingClose(text,start)===end-1)return {start,end,size:head[1],body:start+head[0].length,bodyEnd:end-1};
 }
 const before=new RegExp('\\{\\\\('+SIZES+')[ \\t]?$').exec(text.slice(Math.max(0,start-20),start));
 if(before){
  const open=start-before[0].length;
  if(matchingClose(text,open)===end)return {start:open,end:end+1,size:before[1],body:start,bodyEnd:end};
 }
 return null;
}
export function toggleSize(text,start,end,size){
 const group=sizeContext(text,start,end);
 const from=group?group.start:start,to=group?group.end:end;
 const body=group?text.slice(group.body,group.bodyEnd):text.slice(start,end);
 if(group&&group.size===size)return {start:from,end:to,text:body,selectionStart:from,selectionEnd:from+body.length};
 const prefix='{\\'+size+' ';
 return {start:from,end:to,text:prefix+body+'}',selectionStart:from+prefix.length,selectionEnd:from+prefix.length+body.length};
}
