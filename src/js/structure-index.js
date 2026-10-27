import { parseDocument, stripComment } from './latex.js';

const mathNames = new Set(['equation','align','alignat','flalign','gather','multline','eqnarray','displaymath','math']);
const theoremNames = new Set(['theorem','lemma','proposition','corollary','definition','proof','remark','remarks','example','assumption','axiom','conjecture','claim','exercise','problem','solution','note','observation','property','fact']);
const codeNames = new Set(['verbatim','verbatim*','lstlisting','minted','Verbatim','comment','alltt']);
export const sameSource = (a,b) => String(a || '').replace(/\\/g,'/').toLowerCase() === String(b || '').replace(/\\/g,'/').toLowerCase();

export function buildStructureIndex(documents) {
  const theoremTypes = new Set(theoremNames);
  for (const doc of documents) {
    const text = doc.text.split(/\r?\n/).map(stripComment).join('\n');
    for (const match of text.matchAll(/\\(?:newtheorem|newsiamremark)\*?\s*\{([^}]+)\}/g)) theoremTypes.add(match[1]);
  }
  const result = { math:[], labels:[], refs:[], cites:[] };
  for (const doc of documents) {
    const parsed = doc.parsed || parseDocument(doc.text);
    const source = { file:doc.file, rel:doc.rel };
    for (const name of ['labels','refs','cites']) result[name].push(...parsed[name].map(item=>({...item,...source})));
    for (const env of parsed.environments) {
      const type = env.env.replace(/\*$/,'');
      if (!mathNames.has(type) && !theoremTypes.has(type)) continue;
      const body = parsed.lines.slice(env.line-1,env.endLine || env.line).join(' ').replace(/\\(?:begin|end)\{[^}]+\}(?:\[[^\]]*\])?/g,'').trim();
      result.math.push({...env,...source,body,theorem:theoremTypes.has(type)});
    }
    const code = parsed.environments.filter(env=>codeNames.has(env.env));
    let opened = null;
    for (let i=0;i<parsed.lines.length;i++) {
      const lineNumber=i+1;
      if (parsed.beginDocumentLine>0 && lineNumber<parsed.beginDocumentLine || code.some(env=>lineNumber>=env.line && lineNumber<=(env.endLine||parsed.lines.length))) continue;
      const line=stripComment(parsed.lines[i]);
      for(const match of line.matchAll(/\\\[|\\\]|\$\$/g)) {
        let escapes=0;
        for(let at=match.index-1;at>=0 && line[at]==='\\';at--)escapes++;
        if(escapes%2)continue; // \\[4pt] is a line break, not a display opener.
        if (!opened && match[0] !== '\\]') opened={line:lineNumber,token:match[0]};
        else if (opened && (opened.token === '$$' && match[0] === '$$' || opened.token === '\\[' && match[0] === '\\]')) {
          const body=parsed.lines.slice(opened.line-1,lineNumber).join(' ').replace(/^.*?(?:\\\[|\$\$)|(?:\\\]|\$\$).*$/g,'').trim();
          result.math.push({...source,env:opened.token==='$$'?'$$ … $$':'\\[ … \\]',line:opened.line,endLine:lineNumber,body,theorem:false});opened=null;
        }
      }
    }
  }
  const fileOrder = new Map(documents.map((doc,index)=>[doc.file,index]));
  result.math.sort((a,b)=>fileOrder.get(a.file)-fileOrder.get(b.file)||a.line-b.line);
  return result;
}

/** Unsaved open models take precedence over disk. No tree-order file limits. */
export async function readStructureDocuments({root,rootFile,activePath,assets=[],outline=[],docs,readFile,parseCache=new Map()}) {
  const files=[],seen=new Set(),errors=[];
  const add=file=>{const key=file.replace(/\\/g,'/').toLowerCase();if(!/\.(tex|ltx)$/i.test(file)||seen.has(key))return;seen.add(key);files.push(file);};
  if(rootFile)add(rootFile);
  for(const item of outline)if(item.file)add(item.file);
  for(const rel of assets) add(root+ (root.includes('\\')?'\\':'/') + rel.replace(/[\\/]/g,root.includes('\\')?'\\':'/'));
  for(const [file] of docs)if(file.replace(/\\/g,'/').toLowerCase().startsWith(root.replace(/\\/g,'/').toLowerCase()+'/'))add(file);
  if(activePath)add(activePath);
  const results=new Array(files.length);let next=0;
  const worker=async()=>{while(next<files.length){const index=next++,path=files[index];const open=[...docs].find(([file])=>sameSource(file,path));let text,file=open?.[0] || path;
    try { if(open?.[1]?.model)text=open[1].model.getValue();else{const result=await readFile(path);if(!result.ok)throw Error(result.error||'无法读取');text=result.text || '';}
      const key=file.replace(/\\/g,'/').toLowerCase(),cached=parseCache.get(key);const parsed=cached?.text===text?cached.parsed:parseDocument(text);parseCache.set(key,{text,parsed});
      const normalized=file.replace(/\\/g,'/'),base=root.replace(/\\/g,'/');
      const rel=normalized.toLowerCase().startsWith(base.toLowerCase()+'/')?normalized.slice(base.length+1):normalized;results[index]={file,rel,text,parsed};
    }catch(error){errors.push({file,error:error.message});}
  }};
  await Promise.all(Array.from({length:Math.min(4,files.length)},worker));
  for(const key of parseCache.keys())if(!seen.has(key))parseCache.delete(key);
  return {documents:results.filter(Boolean),errors};
}
