/* 진입점 — 기능(서비스) 탭 인터랙션과 동작 미리보기 캔버스 루프 시작 */
(function () {
  const dkey = window.dkey;
  const FEATS = window.FEATS;
  const SCENES = window.SCENES;

    /* ───────────── 기능(서비스) 단위 렌더 ─────────────
       버튼을 누르면 아래 동작 화면(GIF 또는 캔버스)이 그 기능으로 바뀐다.
       자동 순환은 두지 않는다 — 글을 읽는 중에 내용이 바뀌면 안 되고,
       "각 서비스 버튼 클릭 시" 가 이 화면의 조작 규약이다. */
    (function startDemo() {
      const feats = FEATS[dkey] || FEATS.vision;
      const DATA = window.FEATURE_DATA || {};
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
      let cur = 0;

      const chipsEl = document.getElementById('demo-feats');
      const gif = document.getElementById('demo-gif');
      const live = document.getElementById('demo-live');

      /* ③ 동작화면 — GIF 가 있으면 GIF, 없으면 캔버스 폴백.
         GIF 는 선택 자산이라 없어도 완전히 동작해야 한다. */
      const gifState = {};                   // id -> 'ok' | 'no' | undefined(확인 전)
      let usingGif = false;
      function showMedia(id) {
        const st = gifState[id];
        if (st === 'ok') {
          usingGif = true;
          if (gif) { gif.src = './img/demo/' + id + '.gif'; gif.hidden = false; gif.alt = (DATA[id] ? DATA[id].label : '') + ' 동작 화면'; }
          if (cv) cv.style.visibility = 'hidden';
          if (live) live.hidden = true;
          return;
        }
        usingGif = false;
        if (gif) gif.hidden = true;
        if (cv) cv.style.visibility = '';
        if (live) live.hidden = false;
        if (st === undefined && typeof Image !== 'undefined') {
          gifState[id] = 'pending';
          const probe = new Image();
          probe.onload = () => { gifState[id] = probe.width > 0 ? 'ok' : 'no'; if (feats[cur].id === id) showMedia(id); };
          probe.onerror = () => { gifState[id] = 'no'; };
          probe.src = './img/demo/' + id + '.gif';
        }
      }

      function hi() { if (!chipsEl) return; const k = chipsEl.children; for (let i = 0; i < k.length; i++) k[i].classList.toggle('on', i === cur); }
      function select(i) { cur = i; tBase = now0(); hi(); showMedia(feats[i].id); window.refreshStatic(); }

      const now0 = () => (window.performance && performance.now) ? performance.now() : Date.now();
      let tBase = now0();

      if (chipsEl) {
        chipsEl.innerHTML = feats.map((f, i) => {
          const d = DATA[f.id];
          return `<button type="button" class="dfeat${i === 0 ? ' on' : ''}" data-i="${i}">${esc(d ? d.label : f.label)}</button>`;
        }).join('');
        chipsEl.querySelectorAll('.dfeat').forEach(b => b.addEventListener('click', () => select(+b.dataset.i)));
      }

      const cv = document.getElementById('demo-canvas');
      showMedia(feats[0].id);

      if (!cv || !cv.getContext) return;
      const ctx = cv.getContext('2d');
      if (!ctx) return;                       // jsdom 등 캔버스 미지원 환경 가드 (탭·텍스트는 위에서 이미 렌더)
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      function size() {
        const r = cv.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
        cv.width = Math.max(1, r.width * dpr); cv.height = Math.max(1, r.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      size(); window.addEventListener('resize', () => { size(); window.refreshStatic(); });
      function draw(localT) { const r = cv.getBoundingClientRect(); (SCENES[feats[cur].id] || SCENES.v_detect)(ctx, r.width, r.height, localT); }
      window.refreshStatic = () => { if (reduce) draw(2000); };   // 애니메이션이 꺼진 상태에서만 의미가 있다
      /* localT 는 반드시 0 이상이어야 한다. rAF 가 넘겨주는 now 는 "프레임 시작 시각" 이라
         같은 프레임에서 먼저 처리된 클릭 핸들러가 찍은 performance.now() 보다 이를 수 있고,
         그러면 now-tBase 가 음수가 된다. 장면들이 t 로 Math.floor(t/seg)%n 인덱스를 만들기
         때문에(예: RPS[-1]) 음수가 그대로 들어가면 undefined 를 참조하게 된다. */
      function frame(now) {
        if (!usingGif) draw(Math.max(0, now - tBase));
        if (window.requestAnimationFrame) requestAnimationFrame(frame);
      }
      if (reduce) draw(2000);
      else if (window.requestAnimationFrame) requestAnimationFrame(frame);
      else draw(2000);
    })();
})();
