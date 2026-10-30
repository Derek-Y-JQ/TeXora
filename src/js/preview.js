/**
 * PDF preview pane: rasterized pages from pdftocairo, zoom / fit-width,
 * night inversion, page tracking and SyncTeX reverse search.
 */
import { ctx } from './ctx.js';
import { $, clamp, escapeHtml } from './util.js';
import {openVectorPdf,disposeVectorPdf} from './pdf-viewer.js';

export class PreviewController {
  constructor() {
    this.pages = [];
    this.zoom = 1;
    this.current = 1;
    this.stage = null;
    this.pageEls = [];
    this.invert = false;
    this.renderToken = 0;
  }

  init() {
    this.stage = $('#previewStage');
    this.zoomLabel = $('#zoomLabel');
    this.pageCurrent = $('#pageCurrent');
    this.pageTotal = $('#pageTotal');
    this.progress = $('#previewProgress');
    this.placeholder = $('#previewPlaceholder');
    this.invert = this.defaultInvert();
    this.applyInvert();

    this.stage.addEventListener('scroll', () => this.onScroll(), { passive: true });
    this.stage.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    window.addEventListener('resize', () => this.relayout());

    ctx.on('settings:changed', () => {
      const next = this.defaultInvert();
      if (next !== this.invert) {
        this.invert = next;
        this.applyInvert();
      }
    });
  }

  defaultInvert() {
    const s = ctx.state.settings;
    if (!s) return ctx.state.theme === 'dark';
    return !!(s.appearance?.pdfInvertInDark && ctx.state.theme === 'dark');
  }

  applyInvert() {
    if (!this.stage) return;
    this.stage.closest('.preview')?.setAttribute('data-pdf-invert', this.invert ? '1' : '0');
    $('#invertBtn')?.classList.toggle('active', this.invert);
  }

  toggleInvert() {
    this.invert = !this.invert;
    this.applyInvert();
    ctx.state.settings.appearance.pdfInvertInDark = this.invert;
    ctx.api.settings.set('appearance.pdfInvertInDark', this.invert);
  }

  showPlaceholder(text) {
    if (!this.placeholder) return;
    this.placeholder.classList.remove('hidden');
    const hint = $('#previewHint');
    if (hint && text) hint.textContent = text;
    this.placeholder.style.display = 'flex';
  }

  hidePlaceholder() {
    if (this.placeholder) this.placeholder.style.display = 'none';
  }

  setBusy(busy) {
    this.progress?.classList.toggle('active', !!busy);
  }

  /** Render a build result's page list. */
  render(pages, options = {}) {
    if (!this.stage) return;
    const position=options.keepZoom?this.capturePosition():null;
    disposeVectorPdf(this);
    this.pages = Array.isArray(pages) ? pages : [];
    this.pageEls = [];
    this.renderToken++;
    if (!this.pages.length) {
      this.stage.querySelectorAll('.pdf-page').forEach((n) => n.remove());
      this.showPlaceholder(options.hint || '编译后在此显示 PDF 预览');
      this.pageCurrent.textContent = '–';
      this.pageTotal.textContent = '–';
      return;
    }
    this.hidePlaceholder();
    this.stage.querySelectorAll('.pdf-page').forEach((n) => n.remove());
    const token = this.renderToken;
    const frag = document.createDocumentFragment();
    for (const page of this.pages) {
      const pageEl = document.createElement('div');
      pageEl.className = 'pdf-page';
      pageEl.dataset.page = String(page.index);
      pageEl.dataset.widthPt = String(page.widthPt);
      pageEl.dataset.heightPt = String(page.heightPt);
      pageEl.style.aspectRatio = `${page.width} / ${page.height}`;
      const img = document.createElement('img');
      img.src = ctx.api.assetUrl(page.file);
      img.alt = `第 ${page.index} 页`;
      img.loading = page.index <= 3 ? 'eager' : 'lazy';
      img.draggable = false;
      pageEl.appendChild(img);
      const badge = document.createElement('span');
      badge.className = 'page-no';
      badge.textContent = `${page.index}`;
      pageEl.appendChild(badge);
      for (const link of page.links || []) {
        const anchor = document.createElement('a');
        anchor.className = 'pdf-link';
        anchor.href = '#';
        anchor.style.left = (link.x * 100).toFixed(3) + '%';
        anchor.style.top = (link.y * 100).toFixed(3) + '%';
        anchor.style.width = Math.max(0.8, link.w * 100).toFixed(3) + '%';
        anchor.style.height = Math.max(0.8, link.h * 100).toFixed(3) + '%';
        anchor.title = link.url ? link.url : `跳转到第 ${link.page} 页`;
        anchor.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (link.url) ctx.api.openExternal(link.url);
          else if (link.page) this.scrollToPage(link.page);
        });
        anchor.addEventListener('dblclick', (e) => e.stopPropagation());
        pageEl.appendChild(anchor);
      }
      frag.appendChild(pageEl);
      this.pageEls.push(pageEl);
    }
    this.stage.appendChild(frag);
    this.pageTotal.textContent = String(this.pages.length);
    this.zoom = options.keepZoom ? this.zoom : 1;
    this.relayout();
    if (options.scrollToPage) this.scrollToPage(options.scrollToPage);
    else this.restorePosition(position);
  }

  relayout() {
    if (!this.stage || !this.pageEls.length) return;
    const style = getComputedStyle(this.stage);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const gutter = 0;
    const fitWidth = Math.max(120, this.stage.clientWidth - padding - gutter);
    const pageWidth = clamp(fitWidth * this.zoom, 120, 4000);
    const position=this.capturePosition();
    let changed=false;
    for (const el of this.pageEls) {if(el.style.width!==pageWidth+'px')changed=true;el.style.width = pageWidth + 'px';}
    if(position)this.restorePosition(position);
    if(changed)this.drawVector?.();
    this.zoomLabel.textContent = Math.round(this.zoom * 100) + '%';
    this.onScroll();
  }

  setZoom(z) {
    this.zoom = clamp(z, 0.35, 3);
    this.relayout();
  }

  zoomIn() {
    this.setZoom(this.zoom * 1.15);
  }
  zoomOut() {
    this.setZoom(this.zoom / 1.15);
  }
  fitWidth() {
    this.setZoom(1);
  }

  onScroll() {
    if (!this.pageEls.length) return;
    const scrollTop = this.stage.scrollTop + 80;
    let current = 1;
    for (const el of this.pageEls) {
      if (el.offsetTop <= scrollTop) current = Number(el.dataset.page);
      else break;
    }
    if (current !== this.current) {
      this.current = current;
      this.pageCurrent.textContent = String(current);
    }
  }

  scrollToPage(page) {
    const el = this.pageEls.find((p) => Number(p.dataset.page) === page);
    if (el) {
      this.stage.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' });
      el.classList.add('synctex-target');
      setTimeout(() => el.classList.remove('synctex-target'), 1500);
    }
  }

  nextPage() {
    this.scrollToPage(Math.min(this.pages.length, this.current + 1));
  }
  prevPage() {
    this.scrollToPage(Math.max(1, this.current - 1));
  }

  /** Flash a box at PDF coordinates (TeX points) for forward SyncTeX. */
  flashAt(page, x, y, height = 12, width = 0) {
    const el = this.pageEls.find((p) => Number(p.dataset.page) === page);
    if (!el) return;
    this.scrollToPage(page);
    const widthPt = Number(el.dataset.widthPt) || 1;
    const heightPt = Number(el.dataset.heightPt) || 1;
    const rect = el.getBoundingClientRect();
    const scale = rect.width / widthPt;
    const box = document.createElement('div');
    box.className = 'synctex-flash';
    box.style.left = Math.max(0, x * scale - 2) + 'px';
    box.style.top = Math.max(0, y * scale - 1) + 'px';
    box.style.width = Math.max(24, (width || 160) * scale) + 'px';
    box.style.height = Math.max(6, (height || 12) * scale) + 'px';
    el.appendChild(box);
    setTimeout(() => box.remove(), 1700);
    // vertical center for tall pages
    const stageRect = this.stage.getBoundingClientRect();
    const targetTop = rect.top - stageRect.top + this.stage.scrollTop + y * scale - this.stage.clientHeight / 3;
    this.stage.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  }

  async onDoubleClick(event) {
    if(this.standalone)return;
    const pageEl = event.target.closest('.pdf-page');
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const widthPt = Number(pageEl.dataset.widthPt) || 1;
    const heightPt = Number(pageEl.dataset.heightPt) || 1;
    const xPt = (px / rect.width) * widthPt;
    const yPt = (py / rect.height) * heightPt;
    const page = Number(pageEl.dataset.page);
    const token = this.renderToken;
    const res = await ctx.api.tex.synctexInverse(page, xPt, yPt);
    if (token !== this.renderToken) return;
    if (!res || !res.ok) {
      ctx.emit('toast', { type: 'warn', title: '反向定位未命中', body: (res && res.error) || '请确认已使用 -synctex=1 编译' });
      return;
    }
    ctx.cmd('editor.goto', { file: res.file, line: res.line, column: Math.max(1, res.column || 1), flash: true });
  }

  showFailure(message) {
    this.showPlaceholder(message || '编译失败，请查看问题面板');
  }

  clear() {
    this.renderToken++;
    disposeVectorPdf(this);
    this.pdfFile='';this.pdfIdentity='';this.standalone=false;
    this.documentAt=0;
    this.pages = [];
    this.pageEls = [];
    this.stage?.querySelectorAll('.pdf-page').forEach((n) => n.remove());
    this.stage?.querySelectorAll('.md-preview').forEach(n=>n.remove());
    this.showPlaceholder('编译后在此显示 PDF 预览');
    this.pageCurrent.textContent = '–';
    this.pageTotal.textContent = '–';
    this.updateDocumentStatus('');
  }

  capturePosition(){
    if(!this.pageEls.length)return null;
    const top=this.stage.scrollTop;
    let el=this.pageEls[0];for(const item of this.pageEls){if(item.offsetTop<=top+8)el=item;else break;}
    return {page:Number(el.dataset.page),ratio:(top-el.offsetTop)/Math.max(1,el.offsetHeight),left:this.stage.scrollLeft};
  }
  restorePosition(position){
    const page=position?Math.min(position.page,this.pageEls.length):1;
    const el=this.pageEls[page-1];
    this.stage.scrollTo({top:position&&el?Math.max(0,el.offsetTop+position.ratio*el.offsetHeight):0,left:position?.left||0,behavior:'instant'});
    this.current=page;this.pageCurrent.textContent=String(page);this.onScroll();
  }
  openPdf(file,options={}){return openVectorPdf(this,file,options);}
  updateDocumentStatus(text,at){
    const status=$('#pdfDocumentStatus');if(!status)return;
    if(at!==undefined)this.documentAt=at;
    status.textContent=text+(this.documentAt?' · '+new Date(this.documentAt).toLocaleTimeString(): '');status.title=this.pdfFile||'';status.hidden=!text;
  }

  /** Point the preview at an arbitrary PDF (kept for future pdf.js integration). */
  currentPdf() {
    return this.pdfFile || ctx.state.build.result?.pdf || '';
  }
}
