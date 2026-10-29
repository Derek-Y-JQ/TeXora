import { mathAtOffset, maskLatex } from './live-math.js';
const inLiteral=(text,offset)=>/\\begin\{(?:verbatim\*?|Verbatim|lstlisting|minted)\}/.test(maskLatex(text.slice(0,offset)));
export function displayMathEnter(text, offset, indentSize=2) {
  if(inLiteral(text,offset))return null;
  const start=text.lastIndexOf('\n',offset-1)+1,end=text.indexOf('\n',offset),lineEnd=end<0?text.length:end;
  const before=text.slice(start,offset),clean=maskLatex(text).slice(start,offset);
  const match=clean.match(/^(\s*)(\\\[|\$\$)\s*$/);
  if(!match)return null;
  const math=mathAtOffset(text,offset);
  if(!math?.display || math.start!==start+match[1].length)return null;
  const close=match[2]==='\\['?'\\]':'$$',after=text.slice(offset,lineEnd);
  if(after.trim() && ![close,match[2]==='\\['?']':close].includes(after.trim()))return null;
  const next=text.slice(lineEnd+1).match(/^\s*(\\\]|\$\$)/);
  const existing=next?.[1]===close;
  const indent=before.match(/^\s*/)[0],inner=indent+' '.repeat(indentSize);
  return {start:offset,end:lineEnd,text:'\n'+inner+(existing?'':'\n'+indent+close),cursorDelta:1+inner.length};
}
export function inlineDollarGhost(text,offset) {
  if(inLiteral(text,offset))return null;
  const math=mathAtOffset(text,offset);
  if(!math || math.display || text[math.start]!=='$' || text.slice(math.start,math.start+2)==='$$')return null;
  if(math.end>math.start+1 && text[math.end-1]==='$')return null;
  if(text.slice(math.start,offset).includes('\n'))return null;
  return {start:math.start,offset};
}
