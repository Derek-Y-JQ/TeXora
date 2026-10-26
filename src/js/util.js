/** Small DOM / formatting helpers shared by the renderer. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class' || k === 'className') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') node.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') node[k] = !!v;
    else node.setAttribute(k, v);
  }
  for (const child of children.flat(9)) {
    if (child == null || child === false) continue;
    node.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  return node;
}

export function icon(name, cls = '') {
  return `<svg class="ico ${cls}"><use href="#i-${name}"/></svg>`;
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function debounce(fn, ms = 200) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  wrapped.flush = (...args) => {
    clearTimeout(t);
    fn(...args);
  };
  return wrapped;
}
export function throttle(fn, ms = 100) {
  let last = 0;
  let timer;
  return (...args) => {
    const now = Date.now();
    const wait = ms - (now - last);
    if (wait <= 0) {
      last = now;
      fn(...args);
    } else {
      clearTimeout(timer);
      timer = setTimeout(() => {
        last = Date.now();
        fn(...args);
      }, wait);
    }
  };
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function formatBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)} 天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function timeOfDay(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function baseName(p) {
  if (!p) return '';
  const parts = String(p).split(/[\\/]/);
  return parts[parts.length - 1] || p;
}
export function dirName(p) {
  if (!p) return '';
  const parts = String(p).split(/[\\/]/);
  parts.pop();
  return parts.join('\\');
}
export function relPath(root, full) {
  if (!root || !full) return full || '';
  const a = String(root).replace(/\\/g, '/').replace(/\/$/, '');
  const b = String(full).replace(/\\/g, '/');
  return b.startsWith(a + '/') ? b.slice(a.length + 1) : b;
}
export function normalizeRel(p) {
  return String(p || '').replace(/\\/g, '/');
}
export function extOf(p) {
  const m = String(p || '').match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}

export function fileIcon(ext) {
  const map = {
    tex: 'paper', ltx: 'paper', sty: 'code', cls: 'code', bib: 'book', md: 'file',
    png: 'image', jpg: 'image', jpeg: 'image', pdf: 'paper', svg: 'image', eps: 'image'
  };
  return map[ext] || 'file';
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      await window.texora.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}

/* ------------------------------------------------------------------ toasts */
export function toast({ type = 'info', title = '', body = '', timeout = 3800 } = {}) {
  const layer = document.getElementById('toastLayer');
  if (!layer) return;
  const iconName = type === 'success' ? 'check' : type === 'error' ? 'error' : type === 'warn' ? 'alert' : 'info';
  const node = el('div', { class: `toast ${type}`, html: `${icon(iconName)}<div><div class="toast-title">${escapeHtml(title)}</div>${body ? `<div class="toast-body">${escapeHtml(body)}</div>` : ''}</div>` });
  layer.appendChild(node);
  const kill = () => {
    node.style.transition = 'opacity .18s ease, transform .18s ease';
    node.style.opacity = '0';
    node.style.transform = 'translateY(6px)';
    setTimeout(() => node.remove(), 200);
  };
  const timer = setTimeout(kill, timeout);
  node.addEventListener('click', () => {
    clearTimeout(timer);
    kill();
  });
  while (layer.children.length > 4) layer.firstElementChild.remove();
}

/* ------------------------------------------------------------------- menus */
let menuOpen = null;
let menuAnchor = null;
export function closeMenu() {
  const layer = document.getElementById('menuLayer');
  if (!layer) return;
  layer.innerHTML = '';
  layer.classList.remove('open');
  menuOpen = null;
  menuAnchor = null;
}
export function isMenuOpen() {
  return !!menuOpen;
}

/**
 * items: [{label, icon, key, onClick, checked, disabled, danger, separator, group, swatch, active}]
 */
export function openMenu(anchor, items, options = {}) {
  const layer = document.getElementById('menuLayer');
  if (!layer) return;
  if (menuOpen && menuAnchor === anchor && layer.classList.contains('open')) {
    closeMenu();
    return null;
  }
  closeMenu();
  const menu = el('div', { class: 'menu' });
  if (options.minWidth) menu.style.minWidth = options.minWidth + 'px';
  for (const item of items) {
    if (!item) continue;
    if (item.separator) {
      menu.appendChild(el('div', { class: 'menu-sep' }));
      continue;
    }
    if (item.group) {
      menu.appendChild(el('div', { class: 'menu-label', text: item.group }));
      continue;
    }
    const btn = el('button', {
      class: `menu-item${item.active ? ' active' : ''}${item.danger ? ' danger' : ''}`,
      type: 'button',
      disabled: item.disabled
    });
    btn.innerHTML = `${item.swatch ? `<span class="menu-swatch" style="background:${item.swatch}"></span>` : item.icon ? icon(item.icon) : '<span style="width:15px"></span>'}<span>${escapeHtml(item.label)}</span>${item.checked ? icon('check', 'mi-check') : item.key ? `<span class="mi-key">${escapeHtml(item.key)}</span>` : ''}`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.disabled) return;
      closeMenu();
      item.onClick?.(e);
    });
    if (item.tooltip) btn.title = item.tooltip;
    menu.appendChild(btn);
  }
  layer.appendChild(menu);
  layer.classList.add('open');
  menuOpen = menu;
  menuAnchor = anchor;

  const rect = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  let left = options.align === 'left' ? rect.left : rect.right - mw;
  let top = rect.bottom + 6;
  if (left + mw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - mw - 8);
  if (left < 8) left = 8;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, rect.top - mh - 6);
  if (mh > window.innerHeight - 16) {
    menu.style.maxHeight = window.innerHeight - 24 + 'px';
    top = 12;
  }
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';

  const off = (e) => {
    if (e.target.closest && e.target.closest('[data-menu]')) return; // let the trigger toggle itself
    if (!layer.contains(e.target) && !anchor.contains(e.target)) closeMenu();
  };
  const key = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
    }
  };
  setTimeout(() => {
    document.addEventListener('mousedown', off, { once: true });
    document.addEventListener('keydown', key, { once: true });
  }, 0);
  return menu;
}

/** Convenience for a hover popover positioned at an element or point. */
export function openPopover(anchor, contentNode) {
  const layer = document.getElementById('menuLayer');
  closeMenu();
  const wrap = el('div', { class: 'menu popover' });
  wrap.appendChild(contentNode);
  layer.appendChild(wrap);
  layer.classList.add('open');
  menuOpen = wrap;
  const rect = anchor.getBoundingClientRect();
  const mw = wrap.offsetWidth;
  const mh = wrap.offsetHeight;
  let left = Math.min(Math.max(8, rect.left), window.innerWidth - mw - 8);
  let top = rect.bottom + 6;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, rect.top - mh - 6);
  wrap.style.left = left + 'px';
  wrap.style.top = top + 'px';
  const off = (e) => {
    if (e.target.closest && e.target.closest('[data-menu]')) return; // let the trigger toggle itself
    if (!layer.contains(e.target) && !anchor.contains(e.target)) closeMenu();
  };
  setTimeout(() => document.addEventListener('mousedown', off, { once: true }), 0);
  return wrap;
}

export function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) {
    btn.dataset.prevHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `${icon('loader', 'spin')}${label ? `<span>${escapeHtml(label)}</span>` : ''}`;
    btn.classList.add('busy');
  } else {
    btn.disabled = false;
    if (btn.dataset.prevHtml) btn.innerHTML = btn.dataset.prevHtml;
    btn.classList.remove('busy');
  }
}

/** Word / CJK aware text statistics. */
export function textStats(text) {
  const src = String(text || '');
  const cjkChars = (src.match(/[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const latinWords = (src.replace(/[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ').match(/[A-Za-z][A-Za-z'’-]*/g) || []).length;
  const chars = src.length;
  const formulas = (src.match(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin\{(equation|align|gather|multline|eqnarray)\*?\}[\s\S]*?\\end\{\2\*?\}/g) || []).length;
  return { chars, cjkChars, latinWords, words: cjkChars + latinWords, formulas, lines: src.split(/\r\n|\n|\r/).length };
}
