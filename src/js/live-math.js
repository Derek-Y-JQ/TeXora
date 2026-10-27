// Offset-preserving masks keep comments and literal code out of editor actions.
export function maskLatex(text) {
  return text.replace(/\\begin\{(verbatim\*?|Verbatim|lstlisting|minted)\}[\s\S]*?\\end\{\1\}|\\verb\*?([^a-zA-Z\s])[\s\S]*?\2|(?<!\\)(?:\\\\)*%[^\n]*/g,
    value => value.replace(/[^\n\r]/g, ' '));
}
const escaped = (text, index) => { let n=0; while(index>0 && text[--index]==='\\')n++; return n%2===1; };
const mathNames = 'equation\\*?|align\\*?|alignat\\*?|flalign\\*?|gather\\*?|multline\\*?|eqnarray\\*?|displaymath|math';
export function mathAtOffset(text, offset) {
  const clean = maskLatex(text);
  const tokens = new RegExp('\\\\(begin|end)\\{('+mathNames+')\\}|\\$\\$|\\\\[\\[\\]()]|\\$', 'g');
  let active=null, match;
  while((match=tokens.exec(clean))) {
    if(escaped(clean,match.index)) continue;
    const token=match[0];
    if(!active) {
      if(match[1]==='end' || ['\\]','\\)'].includes(token))continue;
      active={start:match.index,inner:tokens.lastIndex,env:match[2],close:match[2]?'\\end{'+match[2]+'}':token==='\\['?'\\]':token==='\\('?'\\)':token,display:!['$','\\('].includes(token) && match[2]!=='math'};
    } else if(token===active.close) {
      if(offset>=active.start && offset<=tokens.lastIndex) return finish(active,match.index,tokens.lastIndex);
      active=null;
    }
    if(active && offset<active.start)return null;
  }
  if(active && offset>=active.start) {
    // Keep an unfinished formula editable without consuming unrelated paragraphs.
    const end=active.close==='$' || active.close==='\\)' ? (clean.indexOf('\n',active.inner)<0?clean.length:clean.indexOf('\n',active.inner)) : clean.length;
    if(offset<=end)return finish(active,end,end);
  }
  return null;
  function finish(a,end,fullEnd) {
    let code=clean.slice(a.inner,end).trim();
    const env=(a.env||'').replace(/\*$/,'');
    if(['align','flalign','eqnarray','multline'].includes(env))code='\\begin{aligned}'+code+'\\end{aligned}';
    if(env==='alignat')code='\\begin{alignedat}'+code+'\\end{alignedat}';
    if(env==='gather')code='\\begin{gathered}'+code+'\\end{gathered}';
    return {code,display:a.display,start:a.start,end:fullEnd,kind:'math'};
  }
}
export function mathDefinitions(text) {
  const clean=maskLatex(text.split('\\begin{document}')[0]);
  const definitions=[];
  const re=/\\(?:newcommand|renewcommand|providecommand|DeclareMathOperator)\*?\s*(?:\{\\[a-zA-Z]+\}|\\[a-zA-Z]+)(?:\s*\[[^\]]*\]){0,2}\s*\{/g;
  let match;
  while((match=re.exec(clean))) {
    let end=re.lastIndex, depth=1;
    while(end<clean.length && depth) { if(!escaped(clean,end)){if(clean[end]==='{')depth++;if(clean[end]==='}')depth--;}end++; }
    if(!depth){definitions.push(clean.slice(match.index,end));re.lastIndex=end;}
  }
  return definitions.join('\n');
}
export function enumLabelEdit(text, offset, option) {
  const clean=maskLatex(text), stack=[];
  const re=/\\(begin|end)\{enumerate\}/g; let m, active;
  while((m=re.exec(clean)) && m.index<=offset) { if(m[1]==='begin')stack.push(m);else stack.pop(); }
  active=stack.at(-1);
  if(!active)return null;
  const start=active.index+active[0].length;
  let i=start;while(/\s/.test(clean[i]||'') && i<clean.length)i++;
  let end=start, previous='';
  if(clean[i]==='['){let braces=0;for(let j=i+1;j<clean.length;j++){if(clean[j]==='{')braces++;if(clean[j]==='}')braces--;if(clean[j]===']' && braces===0){previous=text.slice(i+1,j);end=j+1;break;}}}
  const items=previous.split(/,(?![^{}]*\})/).map(x=>x.trim()).filter(Boolean);
  const key=option.split('=')[0];
  const merged=items.filter(x=>x.split('=')[0].trim()!==key);merged.push(option);
  return {start,end,text:'['+merged.join(',')+']'};
}
