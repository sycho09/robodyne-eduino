(function () {
  VStudio.claim('map');   /* 실습 화면에서 /studio.html 로 돌아와도 이 안으로 온다 */
  VStudio.guard();
  VStudio.hud();

  const { TRACKS, progress, sound } = VStudio;
  /* 노드 좌표(%) — 지그재그로 흐르는 코스 느낌 */
  const LAYOUT = {
    5: [[9,34],[30,66],[50,28],[71,64],[92,34]],
    3: [[16,38],[50,66],[84,34]],
  };

  const mapEl    = document.getElementById('map');
  const svgEl    = document.getElementById('path');
  const tabsEl   = VStudio.tabs(document.getElementById('tabs'));
  let track = VStudio.initTrack(), sel = 0, nodes = [];

  function items() { return TRACKS[track].items; }
  /* 다음 추천 = 현재 트랙에서 아직 안 한 첫 스테이지 (진행표시 꺼져 있으면 없음) */
  function recommendedIndex() {
    if (!progress.enabled()) return -1;
    const list = items();
    for (let k = 0; k < list.length; k++) if (!progress.has(list[k].key)) return k;
    return -1;   /* 트랙 전부 완료 */
  }

  function render(sound_, keepSel) {
    const t = TRACKS[track];
    VStudio.paintTrack(t);
    VStudio.syncTabs(tabsEl, track);
    document.getElementById('trackDesc').textContent = t.desc;

    const pos = LAYOUT[t.items.length] || LAYOUT[5];
    mapEl.querySelectorAll('.node').forEach(n => n.remove());
    mapEl.insertAdjacentHTML('beforeend', t.items.map((s, i) => `
      <button class="node" data-i="${i}" style="left:${pos[i][0]}%;top:${pos[i][1]}%;animation-delay:${i * 0.06}s">
        <span class="node-no">${t.unit} ${String(i + 1).padStart(2, '0')}</span>
        <span class="disc" data-thumbhost style="--c1:${s.c1};--c2:${s.c2}">
          <span class="disc-art"></span>
          <img data-base="../platform/img/${t.thumb}-${s.key}" alt="" decoding="async" />
          <i class="ic" data-ic="${s.ic}"></i>
        </span>
        <span class="node-name">${s.name}</span>
      </button>`).join(''));

    nodes = [...mapEl.querySelectorAll('.node')];
    const rec = recommendedIndex();
    nodes.forEach((n, i) => {
      n.classList.toggle('done', progress.has(t.items[i].key));
      n.classList.toggle('rec', i === rec);
      n.addEventListener('mouseenter', () => select(i, false));
      n.addEventListener('focus', () => select(i, false));
      n.addEventListener('click', () => { sel = i; select(i, false); go(); });
    });
    if (window.paintIcons) window.paintIcons(mapEl);
    VStudio.thumbs(mapEl, 'has-thumb');

    if (!keepSel) sel = rec >= 0 ? rec : 0;   /* 초기·트랙전환 시 추천 스테이지에 초점 */
    sel = Math.min(sel, t.items.length - 1);
    select(sel, false);
    drawPath();
    VStudio.showProgress();
    if (sound_) sound.tab();
  }

  /* 노드 중심을 이어 곡선 경로를 그린다 — 클리어한 구간은 실선+발광 */
  function drawPath() {
    const t = TRACKS[track];
    const r = mapEl.getBoundingClientRect();
    const pts = nodes.map(n => {
      const d = n.querySelector('.disc').getBoundingClientRect();
      return { x: d.left - r.left + d.width / 2, y: d.top - r.top + d.height / 2 };
    });
    svgEl.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
    svgEl.innerHTML = pts.slice(0, -1).map((p, i) => {
      const q = pts[i + 1], mx = (p.x + q.x) / 2;
      const done = progress.has(t.items[i].key) && progress.has(t.items[i + 1].key);
      return `<path class="seg ${done ? 'done' : 'todo'}" d="M${p.x},${p.y} C${mx},${p.y} ${mx},${q.y} ${q.x},${q.y}" />`;
    }).join('');
  }

  function select(i, snd) {
    const list = items();
    sel = (i + list.length) % list.length;
    nodes.forEach((n, k) => n.classList.toggle('sel', k === sel));
    const s = list[sel];
    document.getElementById('dKicker').textContent =
      `${TRACKS[track].unit} ${String(sel + 1).padStart(2, '0')} · ${s.badge}`;
    document.getElementById('dName').textContent = s.name;
    document.getElementById('dDesc').textContent = s.desc;
    /* CTA 문구 — 완료/추천 상태에 따라 학습 흐름을 안내 */
    let label = '시작';
    if (progress.enabled()) {
      if (progress.has(s.key)) label = '다시 하기';
      else if (sel === recommendedIndex()) label = list.some(x => progress.has(x.key)) ? '이어서 하기' : '여기서 시작';
    }
    document.getElementById('dGo').innerHTML = '▶ ' + label + ' <kbd>ENTER</kbd>';
    if (snd !== false) sound.move();
  }

  function go() { const s = items()[sel]; VStudio.launch(s.href, s.key); }

  function setTrack(key, snd) {
    if (!TRACKS[key] || key === track) return;
    track = key; sel = 0;
    VStudio.rememberTrack(key);
    render(snd !== false);
  }

  VStudio.wireTabs(tabsEl, setTrack);
  document.getElementById('dGo').addEventListener('click', go);

  VStudio.keys({
    next:  () => select(sel + 1),
    prev:  () => select(sel - 1),
    enter: go,
    track: () => setTrack(VStudio.nextTrackKey(track)),
    jump:  (i) => { if (i < items().length) select(i); },
  });

  window.addEventListener('resize', drawPath);
  VStudio.onHashTrack((h) => setTrack(h, false));

  render(false);
  VStudio.boot(() => drawPath());
})();
