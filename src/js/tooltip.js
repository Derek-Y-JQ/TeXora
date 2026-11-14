/** App tooltips: replaces native `title` bubbles with a fast, themed tip that shows the shortcut,
 *  and gives icon-only controls an accessible name. */
const SHOW_DELAY = 350;
const WARM_WINDOW = 400;
const SHORTCUT = /\s*[（(]((?:Ctrl|Alt|Shift|Esc|Enter|F\d{1,2})[^）)]*)[）)]\s*$/;

let layer = null;
let tip = null;
let anchor = null;
let timer = 0;
let lastHidden = 0;

function hasVisibleText(el) {
  for (const node of el.childNodes) {
    if (node.nodeType === 3 && node.textContent.trim()) return true;
    if (node.nodeType === 1 && node.tagName !== 'svg' && node.textContent.trim()) return true;
  }
  return false;
}

/** Move `title` into `data-tip` so the native bubble never appears; keep an accessible name. */
function adopt(el) {
  const title = el.getAttribute('title');
  if (title == null) return;
  el.removeAttribute('title');
  if (!title.trim()) return;
  el.dataset.tip = title;
  if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby') && !hasVisibleText(el)) {
    el.setAttribute('aria-label', title.replace(SHORTCUT, '').trim());
  }
}

function findAnchor(target) {
  if (!(target instanceof Element)) return null;
  if (target.closest('.monaco-editor, .textLayer, .annotationLayer')) return null;
  const el = target.closest('[title], [data-tip]');
  if (!el) return null;
  adopt(el);
  return el.dataset.tip ? el : null;
}

function hide() {
  clearTimeout(timer);
  timer = 0;
  if (tip) {
    tip.remove();
    tip = null;
    lastHidden = performance.now();
  }
  anchor = null;
}

function show(el) {
  if (!el.isConnected || !layer) return;
  const text = el.dataset.tip || '';
  const match = text.match(SHORTCUT);
  const label = match ? text.slice(0, match.index) : text;
  tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  const span = document.createElement('span');
  span.textContent = label;
  tip.appendChild(span);
  if (match) {
    const keys = document.createElement('span');
    keys.className = 'tip-keys';
    for (const combo of match[1].split(/\s*\/\s*/)) {
      const kbd = document.createElement('kbd');
      kbd.textContent = combo;
      keys.appendChild(kbd);
    }
    tip.appendChild(keys);
  }
  layer.appendChild(tip);
  const r = el.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const gap = 7;
  let top = r.bottom + gap;
  if (top + t.height > window.innerHeight - 6) top = r.top - gap - t.height;
  let left = r.left + r.width / 2 - t.width / 2;
  left = Math.max(6, Math.min(left, window.innerWidth - t.width - 6));
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(Math.max(6, top))}px`;
}

function schedule(el, immediate) {
  if (el === anchor) return;
  hide();
  anchor = el;
  const warm = performance.now() - lastHidden < WARM_WINDOW;
  if (immediate || warm) show(el);
  else timer = setTimeout(() => { timer = 0; if (anchor === el) show(el); }, SHOW_DELAY);
}

export function initTooltips() {
  layer = document.getElementById('tooltipLayer');
  if (!layer) return;
  // Static chrome: adopt up-front so assistive tech has names before the first hover.
  for (const el of document.querySelectorAll('.app [title], .find-bar [title]')) adopt(el);
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = findAnchor(e.target);
    if (el) schedule(el, false);
    else if (anchor && !(e.target instanceof Element && anchor.contains(e.target))) hide();
  });
  document.addEventListener('pointerout', (e) => {
    if (anchor && !(e.relatedTarget instanceof Element && anchor.contains(e.relatedTarget))) hide();
  });
  document.addEventListener('focusin', (e) => {
    const el = findAnchor(e.target);
    if (el && e.target instanceof Element && e.target.matches(':focus-visible')) schedule(el, true);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' || anchor) hide(); }, true);
  document.addEventListener('wheel', hide, { capture: true, passive: true });
  window.addEventListener('blur', hide);
}
