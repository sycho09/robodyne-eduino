(function () {
  VStudio.claim('cards');   /* 실습 화면에서 /studio.html 로 돌아와도 이 안으로 온다 */
  VStudio.guard();
  VStudio.hud();

  const { TRACKS, progress, sound } = VStudio;
  const packsEl = document.getElementById('packs');
  const dotsEl  = document.getElementById('dots');
  const tabsEl  = VStudio.tabs(document.getElementById('tabs'));
  let track = VStudio.initTrack(), cur = 0, packs = [], dots = [];

  function items() { return TRACKS[track].items; }
  /* 좁은 화면에서는 중앙 카드만 — 양옆 카드가 화면 밖으로 새는 것을 원천 차단 */
  function solo() { return window.innerWidth < 640; }
  /* 양옆 카드(0.82배로 축소됨)의 바깥 끝이 화면 안에 들어오는 최대 간격 */
  function gap() {
    const pw = (packs[0] && packs[0].offsetWidth) || 300;
    const fit = (window.innerWidth / 2 - (pw * 0.82) / 2 - 8) / 2;
    return Math.max(60, Math.min(pw * 0.95, fit));
  }

  function build(snd) {
    const t = TRACKS[track];
    VStudio.paintTrack(t);
    VStudio.syncTabs(tabsEl, track);
    document.getElementById('title').innerHTML = track === 'explore'
      ? '스테이지를 <b>골라 입장</b>하세요'
      : '만들 <b>미션</b>을 골라 시작하세요';

    packsEl.innerHTML = t.items.map((s, i) => `
      <button class="pack" data-i="${i}" data-thumbhost style="--c1:${s.c1};--c2:${s.c2}">
        <div class="pack-inner">
          <div class="pack-art"></div>
          <img class="pack-thumb" data-base="../platform/img/${t.thumb}-${s.key}" alt="" decoding="async" />
          <div class="pack-scrim"></div>
          <span class="pack-stamp" aria-label="체험 완료">✓</span>
          <div class="pack-body">
            <div class="pack-no">${t.unit} ${String(i + 1).padStart(2, '0')}</div>
            <div class="pack-ic"><i data-ic="${s.ic}"></i></div>
            <div class="pack-name">${s.name}</div>
            <div class="pack-badge">${s.badge}</div>
          </div>
        </div>
      </button>`).join('');

    packs = [...packsEl.querySelectorAll('.pack')];
    packs.forEach((p, i) => {
      p.classList.toggle('done', progress.has(t.items[i].key));
      p.addEventListener('click', () => { i === cur ? enter() : to(i); });
    });
    if (window.paintIcons) window.paintIcons(packsEl);
    VStudio.thumbs(packsEl, 'has-thumb');

    dotsEl.innerHTML = t.items.map((s, i) => `<i data-i="${i}"${progress.has(s.key) ? ' class="done"' : ''}></i>`).join('');
    dots = [...dotsEl.querySelectorAll('i')];
    dots.forEach((d, i) => d.addEventListener('click', () => to(i)));

    cur = Math.min(cur, t.items.length - 1);
    render();
    VStudio.showProgress();
    if (snd) sound.tab();
  }

  function render() {
    const t = TRACKS[track], g = gap(), one = solo();
    packs.forEach((p, i) => {
      const off = i - cur, a = Math.abs(off);
      const shown = one ? 0 : Math.max(-2, Math.min(2, off));  /* 화면 밖 카드는 겹쳐 숨긴다 */
      p.style.setProperty('--gap', g + 'px');
      p.style.setProperty('--off', a > 2 || one ? shown : off);
      p.style.setProperty('--sc', off === 0 ? 1 : (a === 1 ? 0.82 : 0.66));
      p.style.setProperty('--op', (one || a > 2) ? (off === 0 ? 1 : 0) : (off === 0 ? 1 : 0.48));
      p.style.setProperty('--z', 10 - a);
      p.style.setProperty('--pe', (off === 0 || (!one && a <= 2)) ? 'auto' : 'none');
      p.classList.toggle('center', off === 0);
    });
    dots.forEach((d, i) => d.classList.toggle('on', i === cur));
    const s = t.items[cur];
    document.getElementById('infobar').innerHTML =
      `<span class="ib-tag">${t.unit} ${String(cur + 1).padStart(2, '0')}</span>` +
      `<span class="nm">${s.name}</span><span class="tg">${s.badge}</span>`;
    document.getElementById('enter').innerHTML =
      (track === 'explore' ? '입장하기' : '미션 시작') + ' <span class="ar">→</span>';
  }

  function move(d) { cur = (cur + d + items().length) % items().length; render(); sound.move(); }
  function to(i) { if (i === cur) return; cur = i; render(); sound.move(); }
  function enter() { const s = items()[cur]; VStudio.launch(s.href, s.key); }

  function setTrack(key, snd) {
    if (!TRACKS[key] || key === track) return;
    track = key; cur = 0;
    VStudio.rememberTrack(key);
    build(snd !== false);
  }

  VStudio.wireTabs(tabsEl, setTrack);
  document.getElementById('prev').addEventListener('click', () => move(-1));
  document.getElementById('next').addEventListener('click', () => move(1));
  document.getElementById('enter').addEventListener('click', enter);

  VStudio.keys({
    next:  () => move(1),
    prev:  () => move(-1),
    enter: enter,
    track: () => setTrack(VStudio.nextTrackKey(track)),
    jump:  (i) => { if (i < items().length) to(i); },
  });

  /* 스와이프 */
  let sx = null;
  packsEl.addEventListener('touchstart', e => sx = e.touches[0].clientX, { passive: true });
  packsEl.addEventListener('touchend', e => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 40) move(dx < 0 ? 1 : -1);
    sx = null;
  });

  window.addEventListener('resize', render);
  VStudio.onHashTrack((h) => setTrack(h, false));

  build(false);
  VStudio.boot();
})();
