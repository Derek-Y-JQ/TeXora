/**
 * Full-screen transition overlay when entering Overleaf Live Collaboration mode.
 * Adapts automatically to Studio and Endfield themes, and respects reduced motion.
 */
import { escapeHtml as esc } from './util.js';

let activeOverlay = null;

export function playOverleafTransition({ projectName = 'Overleaf', compiler = 'pdflatex', writable = true } = {}) {
  if (activeOverlay) {
    try { activeOverlay.remove(); } catch {}
    activeOverlay = null;
  }

  const reduced =
    document.documentElement.getAttribute('data-reduce-motion') === '1' ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const isEndfield = document.documentElement.dataset.style === 'endfield';
  const compilerLabel = String(compiler || 'pdflatex').toUpperCase();
  const accessLabel = writable ? 'OT 实时协作 · 云端编译' : '只读实时查看 · 云端编译';

  const overlay = document.createElement('div');
  overlay.className = `ol-transition ${isEndfield ? 'ol-transition-ef' : 'ol-transition-studio'}`;
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');

  if (isEndfield) {
    overlay.innerHTML = `
      <div class="ol-tr-shutter ol-tr-shutter-top"></div>
      <div class="ol-tr-shutter ol-tr-shutter-bot"></div>
      <div class="ol-tr-plate">
        <div class="ol-tr-hatch"></div>
        <div class="ol-tr-head">
          <span class="ol-tr-code">// UPLINK :: OVERLEAF REALTIME</span>
          <span class="ol-tr-badge">${writable ? 'ONLINE' : 'READ-ONLY'}</span>
        </div>
        <div class="ol-tr-title">${esc(projectName)}</div>
        <div class="ol-tr-meta">
          <span>MODE: ${esc(accessLabel)}</span>
          <span>ENGINE: ${esc(compilerLabel)}</span>
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
        <div class="ol-tr-title">${esc(projectName)}</div>
        <div class="ol-tr-sub">${esc(accessLabel)} · ${esc(compilerLabel)}</div>
        <div class="ol-tr-bar"><span class="ol-tr-bar-fill"></span></div>
      </div>`;
  }

  document.body.appendChild(overlay);
  activeOverlay = overlay;

  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    overlay.classList.add('leaving');
    setTimeout(() => {
      if (activeOverlay === overlay) activeOverlay = null;
      overlay.remove();
    }, reduced ? 80 : 280);
  };

  overlay.addEventListener('click', finish, { once: true });
  const onKey = (e) => {
    if (e.key === 'Escape') {
      window.removeEventListener('keydown', onKey);
      finish();
    }
  };
  window.addEventListener('keydown', onKey);

  requestAnimationFrame(() => overlay.classList.add('entering'));
  setTimeout(() => {
    window.removeEventListener('keydown', onKey);
    finish();
  }, reduced ? 320 : 1050);
}
