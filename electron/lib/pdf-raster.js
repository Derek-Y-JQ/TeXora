'use strict';
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { run } = require('./run');
const RASTER_VERSION = 'pdf-raster-v3';
// Poppler may return 0 after silently omitting glyphs; do not cache such output.
const FONT_WARNING = /(?:could(?:n.t| not)|cannot|can.t|unable to|failed to)\s+(?:find|load|open|create|read|locate|use)[^\r\n]*(?:font|cmap|cid|character)|(?:missing|unknown|invalid|unsupported|no)\s+(?:font|cmap|cidfont|character collection|language pack)|(?:font|cmap|cidfont)[^\r\n]*(?:not found|not available|could not|cannot|failed|missing)|no display font|couldn.t find a font/i;
function stamp(file) {
  if (!file) return null;
  try { const s=fs.statSync(file);return [file,s.size,s.mtimeMs]; } catch { return [file]; }
}
function rasterIdentity(tex) {
  const env={...process.env,...tex.env};
  const dataDirs = [...new Set(['pdftoppm','pdftocairo'].flatMap(name => {
    const exe = tex.get(name); if (!exe) return [];
    const bin = path.dirname(exe);
    return [path.resolve(bin, '../../../poppler'), path.resolve(bin, '../share/poppler'), path.resolve(bin, 'share/poppler')];
  }))];
  return JSON.stringify([RASTER_VERSION,
    ...['pdftoppm','pdftocairo','mgs'].map(name=>stamp(tex.get(name))),
    ...dataDirs.flatMap(dir => [stamp(dir), stamp(path.join(dir, 'cidToUnicode', 'Adobe-GB1')), stamp(path.join(dir, 'cMap', 'Adobe-GB1'))]),
    ...['FONTCONFIG_FILE','FONTCONFIG_PATH','POPPLER_DATADIR','GS_LIB'].map(key=>[key,env[key]||'',stamp(env[key])]),
    stamp(path.join(env.WINDIR||'C:\\Windows','Fonts')),
    stamp(path.join(env.LOCALAPPDATA||'', 'Microsoft','Windows','Fonts'))]);
}
function validPng(file) {
  let fd;
  try {fd=fs.openSync(file,'r');const b=Buffer.alloc(24);if(fs.readSync(fd,b,0,24,0)!==24)return false;return b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&b.readUInt32BE(16)>0&&b.readUInt32BE(20)>0;}
  catch{return false;}finally{if(fd!==undefined)fs.closeSync(fd);}
}
async function rasterPdf({tex,cwd,input,dpi=128,single=false,timeout=120000,execute=run,preflight=true}) {
  const diagnostics=[];
  for(const backend of ['pdftoppm','pdftocairo','mgs']) {
    const exe=tex.get(backend);if(!exe)continue;
    if (preflight && !single) {
      // A missing CJK mapping is already visible on the first page. Avoid
      // rasterizing a long book with every known-broken backend first.
      const probe = await rasterPdf({tex:{get:name=>name===backend?exe:'',env:tex.env},cwd,input,dpi:72,single:true,timeout:Math.min(timeout,30000),execute});
      if (!probe.ok) { diagnostics.push(...probe.diagnostics); continue; }
      await fsp.rm(path.dirname(probe.files[0]),{recursive:true,force:true});
    }
    // Each attempt owns its files. A failed renderer's partial pages cannot leak
    // into another renderer's successful output or the preview manifest.
    const dir=await fsp.mkdtemp(path.join(cwd,'raster-'));
    await fsp.copyFile(path.join(cwd,input),path.join(dir,'document.pdf'));
    const args=backend==='mgs'
      ? ['-dSAFER','-dBATCH','-dNOPAUSE','-sDEVICE=png16m','-dTextAlphaBits=4','-dGraphicsAlphaBits=4',`-r${dpi}`,...(single?['-dFirstPage=1','-dLastPage=1']:[]),`-sOutputFile=${single?'page.png':'page-%d.png'}`,'document.pdf']
      : ['-png','-r',String(dpi),...(single?['-f','1','-l','1','-singlefile']:[]),'document.pdf','page'];
    let result;
    try { result=await execute(exe,args,{cwd:dir,env:tex.env,timeout}); }
    catch(error) { result={code:-1,output:error.message}; }
    const names=(await fsp.readdir(dir)).filter(name=>single?name==='page.png':/^page-\d+\.png$/.test(name)).sort((a,b)=>Number(a.match(/\d+/)?.[0]||0)-Number(b.match(/\d+/)?.[0]||0));
    const files=names.map(name=>path.join(dir,name));
    const contiguous=single||names.every((name,i)=>Number(name.match(/\d+/)[0])===i+1);
    if(result.code===0&&!FONT_WARNING.test(result.output||'')&&files.length&&contiguous&&files.every(validPng))return {ok:true,files,backend,diagnostics};
    diagnostics.push(`${backend}: ${(result.output||'未能生成完整预览图片').trim().slice(-1600)}`);
    await fsp.rm(dir,{recursive:true,force:true});
  }
  return {ok:false,files:[],diagnostics,error:'PDF 预览渲染失败（字体、字符映射或渲染工具异常）。请使用外部阅读器打开 PDF，并检查渲染日志。'};
}
module.exports={rasterPdf,rasterIdentity,FONT_WARNING,RASTER_VERSION};
