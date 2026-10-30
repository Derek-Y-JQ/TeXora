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
