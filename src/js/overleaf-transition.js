/**
 * Full-screen transition overlay when entering Overleaf Live Collaboration mode.
 * Adapts automatically to Studio and Endfield themes, supports live stage updates
 * while connecting & loading the main document, and respects reduced motion.
 */
import { escapeHtml as esc } from './util.js';

let activeOverlay = null;

export function playOverleafTransition({ projectName = 'Overleaf', compiler = '', writable = true, stage = '正在建立实时连接…' } = {}) {
  if (activeOverlay) {
    try { activeOverlay.remove(); } catch {}
    activeOverlay = null;
  }

  const reduced =
    document.documentElement.getAttribute('data-reduce-motion') === '1' ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const isEndfield = document.documentElement.dataset.style === 'endfield';
  const startedAt = Date.now();
  const minVisibleMs = reduced ? 160 : 620;

  const overlay = document.createElement('div');
  overlay.className = `ol-transition ${isEndfield ? 'ol-transition-ef' : 'ol-transition-studio'}`;
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');

  const formatEngine = (c) => (c ? String(c).toUpperCase() : 'CLOUD');

  if (isEndfield) {
    overlay.innerHTML = `
      <div class="ol-tr-shutter ol-tr-shutter-top"></div>
      <div class="ol-tr-shutter ol-tr-shutter-bot"></div>
      <div class="ol-tr-plate">
        <div class="ol-tr-hatch"></div>
        <div class="ol-tr-head">
          <span class="ol-tr-code">// UPLINK :: OVERLEAF REALTIME</span>
          <span class="ol-tr-badge" data-tr-badge>${writable ? 'ONLINE' : 'READ-ONLY'}</span>
        </div>
        <div class="ol-tr-title" data-tr-title>${esc(projectName)}</div>
        <div class="ol-tr-meta">
          <span data-tr-stage>${esc(stage)}</span>
          <span data-tr-engine>ENGINE: ${esc(formatEngine(compiler))}</span>
        </div>
        <div class="ol-tr-bar"><span class="ol-tr-bar-fill"></span></div>
      </div>`;
  } else {
    overlay.innerHTML = `
      <div class="ol-tr-card">
        <div class="ol-tr-ring" aria-hidden="true">
          <svg viewBox="0 0 44 44" width="44" height="44">
            <circle class="ol-tr-ring-track" cx="22" cy="22" r="18" fill="none" stroke-width="2.2" />
            <circle class="ol-tr-ring-arc" cx="22" cy="22" r="18" fill="none" stroke-width="2.4" stroke-linecap="round" />
          </svg>
        </div>
        <div class="ol-tr-kicker">Overleaf 实时协作模式</div>
        <div class="ol-tr-title" data-tr-title>${esc(projectName)}</div>
        <div class="ol-tr-sub" data-tr-stage>${esc(stage)}</div>
        <div class="ol-tr-bar"><span class="ol-tr-bar-fill"></span></div>
      </div>`;
  }

  document.body.appendChild(overlay);
  activeOverlay = overlay;

  let closed = false;
  const removeNow = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey);
    overlay.classList.add('leaving');
    return new Promise((resolve) => {
      setTimeout(() => {
        if (activeOverlay === overlay) activeOverlay = null;
        overlay.remove();
        resolve();
      }, reduced ? 60 : 240);
    });
  };

  const onKey = (e) => {
    if (e.key === 'Escape') void removeNow();
  };
  overlay.addEventListener('click', () => void removeNow(), { once: true });
  window.addEventListener('keydown', onKey);
  requestAnimationFrame(() => overlay.classList.add('entering'));

  // Safety auto-dismiss in case caller never finishes
  const safetyTimer = setTimeout(() => void removeNow(), 20000);

  return {
    update(patch = {}) {
      if (closed) return;
      if (patch.projectName) {
        const el = overlay.querySelector('[data-tr-title]');
        if (el) el.textContent = patch.projectName;
      }
      if (patch.stage) {
        const el = overlay.querySelector('[data-tr-stage]');
        if (el) el.textContent = patch.stage;
      }
      if (patch.compiler) {
        const el = overlay.querySelector('[data-tr-engine]');
        if (el) el.textContent = `ENGINE: ${formatEngine(patch.compiler)}`;
      }
      if (typeof patch.writable === 'boolean') {
        const el = overlay.querySelector('[data-tr-badge]');
        if (el) el.textContent = patch.writable ? 'ONLINE' : 'READ-ONLY';
      }
    },
    async finish(immediate = false) {
      clearTimeout(safetyTimer);
      if (closed) return;
      if (!immediate) {
        const wait = Math.max(0, minVisibleMs - (Date.now() - startedAt));
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
      await removeNow();
    }
  };
}
