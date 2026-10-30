// PDF.js reads the original PDF; pixels are redrawn at each zoom, with a text layer.
import {ctx} from './ctx.js';
let library;
async function pdfLibrary(){
  if(!library)library=import(/* @vite-ignore */ new URL('pdfjs/pdf.mjs',document.baseURI).href).then(pdf=>{
    pdf.GlobalWorkerOptions.workerSrc=new URL('pdfjs/pdf.worker.mjs',document.baseURI).href;return pdf;
  });
  return library;
}
export async function openVectorPdf(view,file,options={}){
  const position=view.pdfIdentity===options.identity?view.capturePosition():null;
  const zoom=view.zoom;
  view.clear();view.zoom=position?zoom:1;
  view.pdfIdentity=options.identity||file;view.pdfFile=file;view.standalone=!!options.standalone;
  const token=view.renderToken;
  view.showPlaceholder('正在读取 PDF…');view.setBusy(true);
  try{
    const pdf=await pdfLibrary();if(token!==view.renderToken)return;
    const base=new URL('pdfjs/',document.baseURI).href;
    view.loadingTask=pdf.getDocument({url:ctx.api.assetUrl(file),cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',isEvalSupported:false,enableXfa:false});
    const documentPdf=await view.loadingTask.promise;
    if(token!==view.renderToken){await documentPdf.destroy();return;}
    view.pdfDocument=documentPdf;
    const fragment=document.createDocumentFragment();
    for(let index=1;index<=documentPdf.numPages;index++){
      const page=await documentPdf.getPage(index);if(token!==view.renderToken)return;
      const viewport=page.getViewport({scale:1});
      const el=document.createElement('div');el.className='pdf-page vector-page';
      el.dataset.page=index;el.dataset.widthPt=viewport.width;el.dataset.heightPt=viewport.height;
      el.style.aspectRatio=`${viewport.width} / ${viewport.height}`;
      const label=document.createElement('span');label.className='page-no';label.textContent=index;el.append(label);
      view.pages.push({index,widthPt:viewport.width,heightPt:viewport.height});view.pageEls.push(el);fragment.append(el);
    }
    view.stage.append(fragment);view.pageTotal.textContent=documentPdf.numPages;view.hidePlaceholder();
    view.relayout();view.restorePosition(position);
    view.pageObserver=new IntersectionObserver(entries=>{
      for(const entry of entries){
        const el=entry.target;el._visible=entry.isIntersecting;
        if(entry.isIntersecting)queuePaint(view,el,pdf,token);
        else releasePage(el);
      }
    },{root:view.stage,rootMargin:'700px 0px'});
    for(const el of view.pageEls)view.pageObserver.observe(el);
    view.drawVector=()=>{for(const el of view.pageEls){releasePage(el);if(el._visible)queuePaint(view,el,pdf,token);}};
    view.updateDocumentStatus(options.standalone?'只读 PDF · '+file.split(/[\\/]/).pop():'当前编译 PDF',options.at);
    return true;
  }catch(error){
    if(token!==view.renderToken)return;
    view.showPlaceholder(error.name==='PasswordException'?'此 PDF 需要密码，请使用外部阅读器打开':'PDF 读取失败：'+error.message);
    ctx.emit('toast',{type:'error',title:'PDF 预览失败',body:error.message});return false;
  }finally{if(token===view.renderToken)view.setBusy(false);}
}
function releasePage(el){
  el._drawVersion=(el._drawVersion||0)+1;
  el._task?.cancel();el._task=null;el._textLayer?.cancel();el._textLayer=null;el._paintedWidth=0;
  for(const child of el.querySelectorAll('canvas,.textLayer,.pdf-link')){if(child.tagName==='CANVAS'){child.width=0;child.height=0;}child.remove();}
}
function queuePaint(view,el,pdf,token){
  view._paintQueue=(view._paintQueue||Promise.resolve()).catch(()=>{}).then(async()=>{
    if(token!==view.renderToken||!el.isConnected||!el._visible)return;
    const width=el.clientWidth;if(!width||el._paintedWidth===width)return;
    releasePage(el);const version=el._drawVersion;
    const current=()=>token===view.renderToken&&version===el._drawVersion&&el.isConnected;
    try{
      const page=await view.pdfDocument.getPage(Number(el.dataset.page));if(!current())return;
      const scale=width/Number(el.dataset.widthPt),viewport=page.getViewport({scale});
      const ratio=Math.min(window.devicePixelRatio||1,3,Math.sqrt(8000000/(viewport.width*viewport.height)));
      const canvas=document.createElement('canvas');canvas.setAttribute('aria-label','第 '+el.dataset.page+' 页');
      canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);
      canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';el.prepend(canvas);
      const task=el._task=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0],background:'white'});
      await task.promise;if(!current())return;
      const text=document.createElement('div');text.className='textLayer';text.style.setProperty('--total-scale-factor',scale);el.append(text);
      const textLayer=el._textLayer=new pdf.TextLayer({textContentSource:page.streamTextContent(),container:text,viewport});
      await textLayer.render();if(!current())return;
      for(const annotation of await page.getAnnotations({intent:'display'})){
        if(!current())return;if(annotation.subtype!=='Link')continue;
        const rect=viewport.convertToViewportRectangle(annotation.rect),link=document.createElement('a');
        link.className='pdf-link';link.href='#';link.style.left=Math.min(rect[0],rect[2])+'px';link.style.top=Math.min(rect[1],rect[3])+'px';link.style.width=Math.abs(rect[2]-rect[0])+'px';link.style.height=Math.abs(rect[3]-rect[1])+'px';
        link.title=annotation.url||'跳转到引用位置';
        link.onclick=async event=>{event.preventDefault();event.stopPropagation();
          if(annotation.url){if(/^(https?:|mailto:)/i.test(annotation.url))await ctx.api.openExternal(annotation.url);}
          else if(annotation.dest){const dest=typeof annotation.dest==='string'?await view.pdfDocument.getDestination(annotation.dest):annotation.dest;if(!dest||!current())return;const index=typeof dest[0]==='number'?dest[0]:await view.pdfDocument.getPageIndex(dest[0]);view.scrollToPage(index+1);}
        };link.ondblclick=e=>e.stopPropagation();el.append(link);
      }
      if(current()){el._paintedWidth=width;el.dataset.rendered='true';}
    }catch(error){if(current()&&error.name!=='RenderingCancelledException'&&error.name!=='AbortException'){el.dataset.error=error.message;view.updateDocumentStatus('页面渲染失败：'+error.message);}}
  });
}
export function disposeVectorPdf(view){
  view.pageObserver?.disconnect();view.pageObserver=null;
  for(const el of view.pageEls)releasePage(el);
  view.drawVector=null;view._paintQueue=Promise.resolve();
  const loading=view.loadingTask;view.loadingTask=null;view.pdfDocument=null;
  loading?.destroy().catch(()=>{});
}
