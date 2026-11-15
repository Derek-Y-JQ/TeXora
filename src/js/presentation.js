/**
 * PDF full-screen reading and presentation.
 *
 * Full screen: the PDF pane fills the screen and keeps its toolbar; the
 * continuous view, zoom and SyncTeX all keep working. Esc leaves.
 *
 * Presentation: one page at a time on black, fitted to the screen.
 *   next      → ↓ PageDown Space Enter, click, wheel down
 *   previous  ← ↑ PageUp Backspace, right-click, wheel up
 *   Home / End first / last page, digits + Enter jump to a page
 *   Esc leaves and puts the pane back on the page you stopped at.
 * Pages come from the open PDF (pdf.js) when there is one, otherwise from the
 * raster pages the build produced.
 */
import { ctx } from './ctx.js';

let show = null;

export function togglePdfFullscreen() {
  const pane = document.getElementById('previewPane');
  if (!pane) return;
  if (!ctx.preview?.pageEls?.length) { ctx.emit('toast', { type: 'info', title: '还没有可显示的 PDF', body: '编译或打开 PDF 后再全屏阅读。', timeout: 2400 }); return; }
  if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
  if (pane.classList.contains('collapsed')) ctx.cmd('view.togglePreview');
  pane.requestFullscreen?.().catch(() => {});
}

export function startPresentation(fromPage) {
  const view = ctx.preview;
  const total = view?.pageEls?.length || 0;
  if (!total) { ctx.emit('toast', { type: 'info', title: '还没有可演示的 PDF', body: '编译或打开 PDF 后再开始演示。', timeout: 2400 }); return; }
  if (show) return;
  const root = document.createElement('div');
  root.className = 'pdf-present';
  root.tabIndex = -1;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'PDF 演示');
  root.innerHTML = '<div class="pp-slide" aria-live="polite"></div><div class="pp-bar"><span class="pp-count"></span><span class="pp-jump"></span><span class="pp-hint">← → 翻页 · Esc 退出</span></div><div class="pp-progress"><span></span></div>';
  document.body.append(root);
  show = { root, view, total, page: clamp(fromPage || view.current || 1, 1, total), cache: new Map(), jump: '', token: 0, idle: 0 };
  const slide = root.querySelector('.pp-slide');

  const paint = async () => {
    const s = show; if (!s) return;
    const token = ++s.token;
    root.querySelector('.pp-count').textContent = s.page + ' / ' + s.total;
    root.querySelector('.pp-progress span').style.transform = `scaleX(${s.page / s.total})`;
    const node = await pageNode(s, s.page);
    if (!show || token !== s.token || !node) return;
    slide.replaceChildren(node);
    // Warm the neighbours so the next key press is instant.
    for (const n of [s.page + 1, s.page - 1]) if (n >= 1 && n <= s.total) pageNode(s, n);
    for (const key of s.cache.keys()) if (Math.abs(key - s.page) > 2) s.cache.delete(key);
  };
  const go = (page) => { if (!show) return; const next = clamp(page, 1, show.total); if (next === show.page) return; show.page = next; paint(); };
  const wake = () => {
    root.classList.add('awake');
    clearTimeout(show?.idle);
    if (show) show.idle = setTimeout(() => root.classList.remove('awake'), 1800);
  };

  const onKey = (e) => {
    if (!show) return;
    const k = e.key;
    let handled = true;
    if (/^\d$/.test(k)) { show.jump = (show.jump + k).slice(-4); root.querySelector('.pp-jump').textContent = '→ ' + show.jump; wake(); }
    else if (k === 'Enter' && show.jump) { const n = Number(show.jump); show.jump = ''; root.querySelector('.pp-jump').textContent = ''; go(n); }
    else if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'N'].includes(k)) go(show.page + 1);
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P'].includes(k)) go(show.page - 1);
    else if (k === 'Home') go(1);
    else if (k === 'End') go(show.total);
    else if (k === 'Escape') stop();
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  };
  let wheelAt = 0;
  const onWheel = (e) => {
    e.preventDefault();
    const now = performance.now();
    if (now - wheelAt < 280 || Math.abs(e.deltaY) < 4) return;
    wheelAt = now; go(show.page + (e.deltaY > 0 ? 1 : -1));
  };
  const onClick = (e) => { if (e.button === 0) go(show.page + 1); };
  const onContext = (e) => { e.preventDefault(); go(show.page - 1); };
  const onFullscreen = () => { if (show && document.fullscreenElement !== root) stop(); };
  let resizeFrame = 0;
  const onResize = () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => { if (!show) return; show.cache.clear(); paint(); }); };

  window.addEventListener('keydown', onKey, true);
  root.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('click', onClick);
  root.addEventListener('contextmenu', onContext);
  root.addEventListener('mousemove', wake);
  document.addEventListener('fullscreenchange', onFullscreen);
  window.addEventListener('resize', onResize);

  function stop() {
    if (!show) return;
    const page = show.page;
    clearTimeout(show.idle);
    show.token++;
    show = null;
    window.removeEventListener('keydown', onKey, true);
    document.removeEventListener('fullscreenchange', onFullscreen);
    window.removeEventListener('resize', onResize);
    if (document.fullscreenElement === root) document.exitFullscreen?.().catch(() => {});
    root.remove();
    view.scrollToPage(page);
  }

  const begin = () => { root.focus(); wake(); paint(); };
  const request = root.requestFullscreen?.();
  if (request?.then) request.then(begin, begin); else begin();
  return stop;
}

export function presentationActive() { return !!show; }

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

/** Build (or reuse) the element for one page, sized to fit the screen. */
function pageNode(s, page) {
  if (s.cache.has(page)) return s.cache.get(page);
  const promise = buildPage(s, page).catch(() => null);
  s.cache.set(page, promise);
  return promise;
}

async function buildPage(s, page) {
  const view = s.view;
  const box = s.root.getBoundingClientRect();
  const maxW = Math.max(200, box.width), maxH = Math.max(200, box.height);
  if (view.pdfDocument) {
    const pdfPage = await view.pdfDocument.getPage(page);
    const base = pdfPage.getViewport({ scale: 1 });
    const scale = Math.min(maxW / base.width, maxH / base.height);
    const viewport = pdfPage.getViewport({ scale });
    const ratio = Math.min(window.devicePixelRatio || 1, 3, Math.sqrt(16000000 / (viewport.width * viewport.height)));
    const canvas = document.createElement('canvas');
    canvas.className = 'pp-page';
    canvas.width = Math.ceil(viewport.width * ratio);
    canvas.height = Math.ceil(viewport.height * ratio);
    canvas.style.width = Math.floor(viewport.width) + 'px';
    canvas.style.height = Math.floor(viewport.height) + 'px';
    canvas.setAttribute('aria-label', '第 ' + page + ' 页');
    await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport, transform: [ratio, 0, 0, ratio, 0, 0], background: 'white' }).promise;
    return canvas;
  }
  const info = view.pages?.[page - 1];
  const source = info?.file ? ctx.api.assetUrl(info.file) : view.pageEls[page - 1]?.querySelector('img')?.src;
  if (!source) return null;
  const img = new Image();
  img.className = 'pp-page';
  img.alt = '第 ' + page + ' 页';
  img.draggable = false;
  img.src = source;
  await img.decode().catch(() => {});
  const w = img.naturalWidth || info?.width || 1, h = img.naturalHeight || info?.height || 1;
  const scale = Math.min(maxW / w, maxH / h);
  img.style.width = Math.floor(w * scale) + 'px';
  img.style.height = Math.floor(h * scale) + 'px';
  return img;
}
