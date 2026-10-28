import katex from 'katex';
// Tolerant rendering preserves valid terms and marks unsupported commands red.
// Malformed syntax is shown as red source rather than a stale previous frame.
export function renderLiveFormula(code, displayMode, definitions = '') {
  const macros={};
  if(definitions){try{katex.renderToString(definitions,{macros,globalGroup:true,throwOnError:true,trust:false,maxExpand:1000});}catch{}}
  const options={displayMode,trust:false,macros,maxExpand:1000,strict:'ignore',errorColor:'#ff626f'};
  const source=code.replace(/\\label\s*\{[^}]*\}/g,'');
  try { return {html:katex.renderToString(source,{...options,throwOnError:true}),needsNative:false,error:''}; }
  catch(error) {
    try { return {html:katex.renderToString(source,{...options,throwOnError:false}),needsNative:true,error:error.rawMessage || error.message}; }
    catch {return {html:'',needsNative:true,error:error.rawMessage || error.message,source};}
  }
}
