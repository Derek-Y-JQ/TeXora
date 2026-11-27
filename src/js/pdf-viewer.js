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
  const sameDoc=view.pdfIdentity===(options.identity||file)&&view.pageEls.length>0&&view.pdfDocument;
  const position=sameDoc?view.capturePosition():null;
  const zoom=view.zoom;
  const token=++view.renderToken;
  if(!sameDoc){
    view.clear();
    view.renderToken=token;
    view.zoom=1;
    view.showPlaceholder('正在读取 PDF…');
  } else {
    view.zoom=zoom;
  }
  view.pdfIdentity=options.identity||file;view.pdfFile=file;view.standalone=!!options.standalone;
  view.setBusy(true);
  const prevLoading=view.loadingTask;
  const prevDoc=view.pdfDocument;
  try{
    const pdf=await pdfLibrary();if(token!==view.renderToken)return;
    const base=new URL('pdfjs/',document.baseURI).href;
    const loadingTask=pdf.getDocument({url:ctx.api.assetUrl(file),cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',isEvalSupported:false,enableXfa:false});
    view.loadingTask=loadingTask;
    const documentPdf=await loadingTask.promise;
    if(token!==view.renderToken){await documentPdf.destroy().catch(()=>{});return;}
    // Tear down old observer & document cleanly after new document is ready (zero blank flash)
    view.pageObserver?.disconnect();view.pageObserver=null;
    view._paintQueue=Promise.resolve();
    view.pdfDocument=documentPdf;
    if(prevDoc&&prevDoc!==documentPdf)void prevDoc.destroy().catch(()=>{});
    if(prevLoading&&prevLoading!==loadingTask)void prevLoading.destroy().catch(()=>{});

    const newPages=[];
    const nextEls=[];
    const fragment=document.createDocumentFragment();
    for(let index=1;index<=documentPdf.numPages;index++){
      const page=await documentPdf.getPage(index);if(token!==view.renderToken)return;
      const viewport=page.getViewport({scale:1});
      let el=sameDoc?view.pageEls[index-1]:null;
      if(el){
        // Keep existing canvas visible as a backdrop while offscreen repaint runs
        el.dataset.widthPt=viewport.width;el.dataset.heightPt=viewport.height;
        el.style.aspectRatio=`${viewport.width} / ${viewport.height}`;
        el._paintedWidth=0;
        el._stale=true;
      } else {
        el=document.createElement('div');el.className='pdf-page vector-page';
        el.dataset.page=index;el.dataset.widthPt=viewport.width;el.dataset.heightPt=viewport.height;
        el.style.aspectRatio=`${viewport.width} / ${viewport.height}`;
        const label=document.createElement('span');label.className='page-no';label.textContent=index;el.append(label);
        fragment.append(el);
      }
      newPages.push({index,widthPt:viewport.width,heightPt:viewport.height});
      nextEls.push(el);
    }
    if(sameDoc){
      // Remove excess pages if document shrank
      for(let i=documentPdf.numPages;i<view.pageEls.length;i++){
        releasePage(view.pageEls[i]);
        view.pageEls[i].remove();
      }
    }
    if(fragment.childNodes.length)view.stage.append(fragment);
    view.pages=newPages;
    view.pageEls=nextEls;
    view.pageTotal.textContent=documentPdf.numPages;view.hidePlaceholder();
    view.relayout();
    if(position)view.restorePosition(position);

    view.pageObserver=new IntersectionObserver(entries=>{
      for(const entry of entries){
        const el=entry.target;el._visible=entry.isIntersecting;
        if(entry.isIntersecting)queuePaint(view,el,pdf,token);
        else releasePage(el);
      }
    },{root:view.stage,rootMargin:'700px 0px'});
    for(const el of view.pageEls)view.pageObserver.observe(el);
    view.drawVector=()=>{for(const el of view.pageEls){el._paintedWidth=0;if(el._visible)queuePaint(view,el,pdf,token);else releasePage(el);}};
    view.updateDocumentStatus(options.standalone?'只读 PDF · '+file.split(/[\\/]/).pop():'当前编译 PDF',options.at);
    return true;
  }catch(error){
    if(token!==view.renderToken)return;
    if(!sameDoc)view.showPlaceholder(error.name==='PasswordException'?'此 PDF 需要密码，请使用外部阅读器打开':'PDF 读取失败：'+error.message);
    ctx.emit('toast',{type:'error',title:'PDF 预览失败',body:error.message});return false;
  }finally{if(token===view.renderToken)view.setBusy(false);}
}
function releasePage(el){
  el._drawVersion=(el._drawVersion||0)+1;
  el._task?.cancel();el._task=null;el._textLayer?.cancel();el._textLayer=null;el._paintedWidth=0;el._stale=false;
  for(const child of el.querySelectorAll('canvas,.textLayer,.pdf-link')){if(child.tagName==='CANVAS'){child.width=0;child.height=0;}child.remove();}
}
function queuePaint(view,el,pdf,token){
  view._paintQueue=(view._paintQueue||Promise.resolve()).catch(()=>{}).then(async()=>{
    if(token!==view.renderToken||!el.isConnected||!el._visible)return;
    const width=el.clientWidth;if(!width||(el._paintedWidth===width&&!el._stale))return;
    el._drawVersion=(el._drawVersion||0)+1;
    el._task?.cancel();el._task=null;el._textLayer?.cancel();el._textLayer=null;
    const version=el._drawVersion;
    const current=()=>token===view.renderToken&&version===el._drawVersion&&el.isConnected;
    try{
      const page=await view.pdfDocument.getPage(Number(el.dataset.page));if(!current())return;
      const scale=width/Number(el.dataset.widthPt),viewport=page.getViewport({scale});
      const ratio=Math.min(window.devicePixelRatio||1,3,Math.sqrt(8000000/(viewport.width*viewport.height)));
      // Render offscreen first so the previous canvas stays visible until the new frame is ready
      const canvas=document.createElement('canvas');canvas.setAttribute('aria-label','第 '+el.dataset.page+' 页');
      canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);
      canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
      const task=el._task=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0],background:'white'});
      await task.promise;if(!current()){canvas.width=0;canvas.height=0;return;}

      // Atomic swap: replace old canvas / textLayer / links with freshly painted frame
      for(const old of el.querySelectorAll('canvas,.textLayer,.pdf-link')){if(old.tagName==='CANVAS'){old.width=0;old.height=0;}old.remove();}
      el.prepend(canvas);

      const text=document.createElement('div');text.className='textLayer';text.style.setProperty('--total-scale-factor',scale);
      text.addEventListener('mousedown',()=>{text.classList.add('selecting');});
      text.addEventListener('mouseup',()=>{text.classList.remove('selecting');});
      text.addEventListener('mouseleave',()=>{text.classList.remove('selecting');});
      el.append(text);
      const textLayer=el._textLayer=new pdf.TextLayer({textContentSource:page.streamTextContent(),container:text,viewport});
      await textLayer.render();if(!current())return;
      for(const annotation of await page.getAnnotations({intent:'display'})){
        if(!current())return;if(annotation.subtype!=='Link')continue;
        const rect=viewport.convertToViewportRectangle(annotation.rect),link=document.createElement('a');
        link.className='pdf-link';link.href='#';link.style.zIndex='3';link.style.left=Math.min(rect[0],rect[2])+'px';link.style.top=Math.min(rect[1],rect[3])+'px';link.style.width=Math.abs(rect[2]-rect[0])+'px';link.style.height=Math.abs(rect[3]-rect[1])+'px';
        link.title=annotation.url||'跳转到引用位置';
        link.onclick=async event=>{event.preventDefault();event.stopPropagation();
          if(annotation.url){if(/^(https?:|mailto:)/i.test(annotation.url))await ctx.api.openExternal(annotation.url);}
          else if(annotation.dest){const dest=typeof annotation.dest==='string'?await view.pdfDocument.getDestination(annotation.dest):annotation.dest;if(!dest||!current())return;const index=typeof dest[0]==='number'?dest[0]:await view.pdfDocument.getPageIndex(dest[0]);view.scrollToPage(index+1);}
        };link.ondblclick=e=>e.stopPropagation();el.append(link);
      }
      if(current()){el._paintedWidth=width;el._stale=false;el.dataset.rendered='true';}
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

const pdfThumbCache = new Map();
/** Render the first page of a PDF figure to a cached PNG data URL for hover previews. */
export async function renderPdfThumbnail(file, cacheKey = '') {
  const key = cacheKey || file;
  if (pdfThumbCache.has(key)) return pdfThumbCache.get(key);
  const pdf = await pdfLibrary();
  const base = new URL('pdfjs/', document.baseURI).href;
  const task = pdf.getDocument({
    url: ctx.api.assetUrl(file),
    cMapUrl: base + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: base + 'standard_fonts/',
    wasmUrl: base + 'wasm/',
    isEvalSupported: false,
    enableXfa: false
  });
  let doc = null;
  try {
    doc = await task.promise;
    const page = await doc.getPage(1);
    const baseVp = page.getViewport({ scale: 1 });
    const maxDim = 640;
    const scale = Math.min(2, maxDim / Math.max(baseVp.width || 1, baseVp.height || 1));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: 'white' }).promise;
    const url = canvas.toDataURL('image/png');
    canvas.width = 0;
    canvas.height = 0;
    if (pdfThumbCache.size > 60) pdfThumbCache.delete(pdfThumbCache.keys().next().value);
    pdfThumbCache.set(key, url);
    return url;
  } finally {
    await doc?.destroy().catch(() => {});
    await task?.destroy().catch(() => {});
  }
}

