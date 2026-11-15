// 演示视频: 进入视口才加载并播放, 离开即暂停; 偏好减少动效时不自动播放, 改为显示播放控件.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const videos = document.querySelectorAll('video[data-auto]');
  if (reduce || !('IntersectionObserver' in window)) {
    videos.forEach((v) => { v.controls = true; v.preload = 'metadata'; });
  } else {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const v = e.target;
        if (e.isIntersecting) { if (v.preload === 'none') v.preload = 'auto'; v.play().catch(() => { v.controls = true; }); }
        else v.pause();
      }
    }, { threshold: 0.35 });
    videos.forEach((v) => io.observe(v));
  }

  // 外观切换: 明暗 × 四种主题色
  const img = document.getElementById('lookImg');
  if (!img) return;
  const state = { theme: 'light', color: 'ice' };
  const names = { light: '白天', dark: '夜间', ice: '冰蓝', yellow: '标准黄', lime: '青柠', amber: '琥珀' };
  document.querySelectorAll('.seg').forEach((seg) => {
    seg.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      state[seg.dataset.group] = b.dataset.v;
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      img.src = `assets/img/g1-${state.theme}-${state.color}.webp`;
      img.alt = `TeXora ${names[state.theme]}主题，${names[state.color]}主题色`;
    });
  });
  // 预取其余主题图, 切换时不闪
  addEventListener('load', () => {
    for (const t of ['light', 'dark']) for (const c of ['ice', 'yellow', 'lime', 'amber']) { const i = new Image(); i.src = `assets/img/g1-${t}-${c}.webp`; }
  });
})();
