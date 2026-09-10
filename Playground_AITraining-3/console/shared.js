/* ╔══════════════════════════════════════════════════════════════════╗
   ║  VISION AI · 콘솔 공통 셸 (UI 제안 2안이 함께 쓰는 단일 소스)      ║
   ║                                                                  ║
   ║   A 카드 캐러셀     → /console/cards.html   (기본)               ║
   ║   C 스테이지 맵     → /console/map.html                          ║
   ║                                                                  ║
   ║  레이아웃을 뺀 전부(항목 데이터·인트로·HUD·세션·사운드·진행)를    ║
   ║  여기 모아 둔다. 항목명이나 설명은 아래 TRACKS 한 곳만 고치면      ║
   ║  2안에 동시에 반영된다.                                          ║
   ║                                                                  ║
   ║  공용 CSS 클래스는 각 안의 스타일과 겹치지 않도록 v- 접두사 사용.  ║
   ║  (.track 같은 흔한 이름은 각 안의 레이아웃 CSS와 충돌한다)         ║
   ╚══════════════════════════════════════════════════════════════════╝ */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     1. 콘텐츠 — 체험 5종 / 제작 3종 단일 소스
     ══════════════════════════════════════════════════════════ */
  const TRACKS = {
    explore: {
      key: 'explore', no: 'TRACK 01', label: '기본기능 체험', unit: 'STAGE',
      thumb: 'stage', accent: '#6aa6ff', accent2: '#3b86ff',
      desc: '학습 없이 클릭 한 번으로 AI를 작동시켜, 컴퓨터가 화면 속 세상을 어떻게 인식하는지 바로 관찰해요.',
      glowA: 'rgba(59,134,255,.28)', glowB: 'rgba(59,134,255,.10)',
      items: [
        { key: 'detect', stars: 1, mins: 5, reward: '관찰자', ic: 'detect', emoji: '🎯', name: '객체 탐지', badge: 'COCO-SSD · 사전학습',
          desc: '카메라에 잡힌 90종의 사물을 실시간으로 찾아내고 이름표를 붙여요.',
          c1: 'rgba(59,134,255,.5)', c2: '#15233f', href: '/stages/apps/detect.html' },
        { key: 'face', stars: 1, mins: 5, reward: '얼굴 탐색가', ic: 'face', emoji: '🙂', name: '얼굴 검출', badge: 'BlazeFace · 알고리즘',
          desc: '사람 얼굴의 위치와 눈·코·입 지점을 실시간으로 잡아냅니다.',
          c1: 'rgba(120,180,255,.45)', c2: '#172a44', href: '/stages/apps/face.html' },
        { key: 'skeleton', stars: 2, mins: 8, reward: '동작 분석가', ic: 'skeleton', emoji: '🦴', name: '뼈대 검출', badge: 'MoveNet · 알고리즘',
          desc: '몸의 관절 17곳을 이어 사람의 자세를 뼈대로 그려냅니다.',
          c1: 'rgba(80,220,200,.4)', c2: '#123433', href: '/stages/apps/skeleton.html' },
        { key: 'colortrack', stars: 2, mins: 8, reward: '색채 연구원', ic: 'color', emoji: '🎨', name: '색상 추적', badge: 'RGB 임계값',
          desc: '고른 색만 남기고 지워, 컴퓨터가 색을 숫자로 다루는 방식을 봅니다.',
          c1: 'rgba(180,120,255,.45)', c2: '#241a3a', href: '/stages/apps/colortrack.html' },
        { key: 'filter', stars: 1, mins: 6, reward: '영상 편집자', ic: 'filter', emoji: '🌗', name: '영상 효과', badge: 'Canvas 필터',
          desc: '흑백·반전·엣지 같은 필터와 움직임 감지를 직접 걸어봅니다.',
          c1: 'rgba(255,140,90,.4)', c2: '#3a2516', href: '/stages/apps/filter.html' },
      ],
    },
    create: {
      key: 'create', no: 'TRACK 02', label: '직접 제작', unit: 'MISSION',
      thumb: 'make', accent: '#ff8472', accent2: '#ff5747',
      desc: '내가 직접 데이터를 모아 AI를 학습시키고 결과를 평가해요. 수집 → 학습 → 추론까지 나만의 AI를 완성합니다.',
      glowA: 'rgba(255,87,71,.26)', glowB: 'rgba(255,132,114,.12)',
      items: [
        { key: 'image', stars: 3, mins: 15, reward: 'AI 조련사', ic: 'image', emoji: '🖼️', name: '이미지 분류', badge: 'MobileNet · 전이학습',
          desc: '사진을 직접 모아 학습시키고, 새 사진을 알아맞히는 AI를 만듭니다.',
          c1: 'rgba(255,87,71,.5)', c2: '#3a1620', href: '/index.html#image' },
        { key: 'audio', stars: 3, mins: 15, reward: '소리 조련사', ic: 'audio', emoji: '🎙️', name: '음성 분류', badge: 'Speech Commands',
          desc: '소리와 단어를 녹음해 학습시키고, 목소리로 반응하는 AI를 만듭니다.',
          c1: 'rgba(255,150,90,.45)', c2: '#3a2516', href: '/index.html#audio' },
        { key: 'pose', stars: 3, mins: 15, reward: '동작 조련사', ic: 'pose', emoji: '🤸', name: '동작 분류', badge: 'MoveNet · 키포인트',
          desc: '몸 동작을 직접 보여주며 가르치고, 자세를 구분하는 AI를 만듭니다.',
          c1: 'rgba(255,110,150,.45)', c2: '#3a1626', href: '/index.html#pose' },
      ],
    },
  };
  const TRACK_KEYS = ['explore', 'create'];
  const HOME = '/platform/index.html';   /* 플랫폼 홈 — HUD 로고·홈 버튼·ESC 키가 함께 쓴다 */

  /* ══════════════════════════════════════════════════════════
     2. UI안 정의 — 데모 전환 바가 이 목록을 그린다
     ══════════════════════════════════════════════════════════ */
  const VARIANTS = [
    { key: 'cards',      tag: 'A', label: '카드 캐러셀',   url: '/console/cards.html' },
    { key: 'map',        tag: 'C', label: '스테이지 맵',   url: '/console/map.html' },
  ];
  const VKEY = 'vision_ui_variant';
  const BOOT_KEY = 'vision_boot_seen';
  const SKIP_KEY = 'vision_skip_intro';   /* 콘솔 안에서의 이동임을 알리는 1회용 표시 */
  const TRACK_MEM = 'vision_track';
  const VISIT_KEY = 'vision_visited';
  const PUI_KEY = 'vision_progress_ui';

  /* 이 스크립트를 부르는 쪽이 인트로 정책을 정한다.
       data-intro="always" → 그 화면에 들어올 때마다 재생 (콘솔 입구 entry.html)
       (기본)             → 세션당 1회만 재생 (허브 · 내부 이동에서는 대기 0) */
  const introMode = (document.currentScript && document.currentScript.dataset.intro) || 'once';

  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const ss = {
    get(k, d) { try { const v = sessionStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) {} },
  };

  function variantKey() {
    const v = ls.get(VKEY, 'cards');
    return VARIANTS.some(x => x.key === v) ? v : 'cards';
  }
  function studioURL(hash) {
    const v = VARIANTS.find(x => x.key === variantKey()) || VARIANTS[0];
    return v.url + (hash ? '#' + hash : '');
  }

  /* ══════════════════════════════════════════════════════════
     3. 공용 셸 CSS — head 에 동기 주입 (깜빡임 방지)
     ══════════════════════════════════════════════════════════ */
  const SHELL_CSS = `
  :root{
    --bg:#0a0b12; --bg-2:#0f1120;
    --ink:#f2f4fb; --ink-2:#aeb6cf; --ink-3:#737c9c;
    --line:rgba(255,255,255,.10); --line-2:rgba(255,255,255,.16);
    --panel:rgba(255,255,255,.045);
    --blue:#3b86ff; --blue-2:#6aa6ff;
    --red:#ff5747; --red-2:#ff8472;
    --green:#42e29b;
    --mono:'JetBrains Mono',ui-monospace,monospace;
  }
  *{box-sizing:border-box;}
  html,body{margin:0;height:100%;}
  body{font-family:'Pretendard',system-ui,sans-serif;background:var(--bg);color:var(--ink);
    min-height:100%;overflow-x:hidden;word-break:keep-all;-webkit-font-smoothing:antialiased;
    display:flex;flex-direction:column;}
  a{color:inherit;text-decoration:none;} button{font-family:inherit;cursor:pointer;}

  /* ── 부팅 인트로 (세션당 1회, 클릭 없이 자동) ── */
  .v-boot{position:fixed;inset:0;z-index:120;background:#06070d;display:grid;place-items:center;
    text-align:center;transition:opacity .4s ease;overflow:hidden;}
  .v-boot.hide{opacity:0;pointer-events:none;}
  .v-splash,.v-seq{grid-area:1/1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;}
  .v-splash{transition:opacity .4s ease,transform .5s ease;}
  .v-splash.v-out{opacity:0;transform:scale(1.08);pointer-events:none;}
  .v-splash img{height:108px;width:auto;filter:drop-shadow(0 0 34px rgba(255,87,71,.55));
    animation:vSplash .8s cubic-bezier(.2,.85,.25,1.1) both;}
  @keyframes vSplash{0%{opacity:0;transform:scale(.55) translateY(14px);}60%{opacity:1;}100%{opacity:1;transform:none;}}
  .v-splash .w{font-size:44px;font-weight:800;letter-spacing:-.01em;color:#fff;animation:vUp .6s .18s both;}
  .v-splash .w b{color:#f0473a;}
  .v-splash .s{font-family:var(--mono);font-size:13px;letter-spacing:.26em;color:var(--ink-3);animation:vUp .6s .3s both;}
  @keyframes vUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:none;}}
  .v-seq{opacity:0;transform:translateY(10px);pointer-events:none;transition:opacity .35s,transform .35s;}
  .v-seq.v-in{opacity:1;transform:none;}
  .v-seq .lg{display:flex;align-items:center;gap:13px;margin-bottom:4px;}
  .v-seq .lg img{height:42px;filter:drop-shadow(0 0 18px rgba(255,87,71,.6));animation:vPulse 2.4s ease-in-out infinite;}
  .v-seq .lgt{display:flex;flex-direction:column;align-items:flex-start;gap:1px;}
  .v-seq .lgt .bw{font-size:30px;font-weight:800;letter-spacing:.04em;}
  .v-seq .lgt .bw b{color:#f0473a;}
  .v-seq .lgt .sub{font-family:var(--mono);font-size:11px;letter-spacing:.16em;color:var(--ink-3);}
  @keyframes vPulse{0%,100%{filter:drop-shadow(0 0 12px rgba(255,87,71,.45));}50%{filter:drop-shadow(0 0 26px rgba(106,166,255,.7));}}
  .v-log{font-family:var(--mono);font-size:12.5px;line-height:1.7;color:var(--ink-2);
    min-height:108px;margin:6px 0 0;text-align:left;width:min(360px,86vw);}
  .v-log .ok{color:var(--green);}
  .v-bar{width:min(360px,86vw);height:6px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;}
  .v-bar i{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,var(--blue),var(--red));transition:width .18s ease;}
  .v-scan-in{position:absolute;inset:0;pointer-events:none;opacity:.5;
    background:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 1px,transparent 1px 3px);}
  .v-scan-in::after{content:'';position:absolute;left:0;right:0;height:140px;
    background:linear-gradient(180deg,transparent,rgba(106,166,255,.10),transparent);animation:vSweep 3.2s linear infinite;}
  @keyframes vSweep{0%{top:-140px;}100%{top:100%;}}

  /* ── 배경 ── */
  .v-amb{position:fixed;inset:0;z-index:0;pointer-events:none;transition:background .5s ease;
    background:radial-gradient(60% 55% at 28% 12%,rgba(59,134,255,.20),transparent 60%),
      radial-gradient(55% 50% at 80% 80%,rgba(255,87,71,.12),transparent 62%),
      linear-gradient(180deg,var(--bg-2),var(--bg));}
  .v-amb::after{content:'';position:absolute;inset:0;
    background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);
    background-size:44px 44px;opacity:.25;
    -webkit-mask-image:radial-gradient(circle at 50% 40%,#000 0%,transparent 75%);
            mask-image:radial-gradient(circle at 50% 40%,#000 0%,transparent 75%);}
  .v-scan{position:fixed;inset:0;z-index:40;pointer-events:none;opacity:.35;
    background:repeating-linear-gradient(0deg,rgba(0,0,0,.16) 0 1px,transparent 1px 3px);}

  /* ── HUD ── */
  .v-hud{position:relative;z-index:6;display:flex;align-items:center;justify-content:space-between;padding:16px 26px;gap:14px;flex:none;}
  .v-brand{display:flex;align-items:center;gap:11px;}
  .v-brand img{height:28px;display:block;filter:drop-shadow(0 2px 6px rgba(0,0,0,.4));}
  .v-brand .bt{font-size:14px;font-weight:800;letter-spacing:.02em;}
  .v-brand .bt span{color:#f0473a;}
  .v-brand .sep{width:1px;height:18px;background:var(--line-2);}
  .v-brand .sys{font-family:var(--mono);font-size:11.5px;font-weight:700;letter-spacing:.18em;color:var(--ink-3);}
  .v-hud-r{display:flex;align-items:center;gap:10px;}
  .v-clock{font-family:var(--mono);font-size:13px;font-weight:700;color:var(--ink-2);letter-spacing:.04em;}
  .v-btn{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;color:var(--ink-2);
    background:rgba(255,255,255,.05);border:0;border-radius:10px;padding:8px 12px;transition:.15s;}
  .v-btn:hover{color:var(--ink);background:rgba(255,255,255,.1);}
  [data-ic]{display:inline-flex;align-items:center;justify-content:center;line-height:0;}
  [data-ic] svg{width:1em;height:1em;display:block;}
  .v-btn [data-ic]{font-size:15px;}

  /* ── 트랙 탭 (2안 공용) ──
        색은 TRACKS 의 accent/accent2/glowA 가 --tacc/--tacc2/--tglow 로 실려 온다.
        크기·간격을 손보고 싶으면 각 안 HTML 에서 .v-tab 을 덮어쓴다. */
  .v-tabs{display:inline-flex;gap:6px;padding:5px;border-radius:14px;
    background:rgba(255,255,255,.045);box-shadow:inset 0 1px 0 rgba(255,255,255,.05);}
  .v-tab{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:10px;padding:10px 18px;
    font-size:13.5px;font-weight:700;color:var(--ink-3);background:none;transition:.18s;white-space:nowrap;}
  .v-tab:hover{color:var(--ink-2);}
  .v-tab .tno{font-family:var(--mono);font-size:11px;letter-spacing:.12em;opacity:.75;}
  .v-tab .cnt{font-family:var(--mono);font-size:11px;font-weight:700;border-radius:99px;padding:2px 7px;
    background:rgba(255,255,255,.07);color:var(--ink-3);}
  .v-tab.on{color:#fff;background:linear-gradient(135deg,var(--tacc),var(--tacc2));
    box-shadow:0 8px 22px var(--tglow);}
  .v-tab.on .cnt{background:rgba(0,0,0,.24);color:#fff;}
  /* 트랙 흐름 화살표 — 체험 → 제작 순서를 커리큘럼처럼 잇는다 (쓰는 안에서만 켠다) */
  .v-flow{align-self:center;font-family:var(--mono);font-size:14px;font-weight:700;color:var(--ink-3);opacity:.75;}

  /* ── 진행 게이지 (토글 시 표시) ── */
  .v-prog{display:inline-flex;align-items:center;gap:10px;font-size:12px;color:var(--ink-3);}
  /* 클래스명은 각 안의 레이아웃 CSS와 겹치지 않도록 v- 계열로 유지할 것 (.track 등 흔한 이름 금지) */
  .v-prog .pbar{width:104px;height:6px;border-radius:99px;background:rgba(255,255,255,.09);overflow:hidden;}
  .v-prog .pbar i{display:block;height:100%;width:0;border-radius:99px;transition:width .5s cubic-bezier(.2,.8,.3,1);}
  .v-prog b{font-family:var(--mono);font-weight:700;color:var(--ink-2);}

  /* ── 데모 전환 바 (제안용 · 안이 확정되면 variantBar() 호출만 지우면 사라짐)
        화면 콘텐츠를 가리지 않도록 하단에 도킹하고, body 에 그만큼 여백을 준다 ── */
  .v-demo{position:fixed;left:0;right:0;bottom:0;z-index:60;display:flex;align-items:center;justify-content:center;
    gap:8px 18px;flex-wrap:wrap;padding:10px 18px;background:rgba(9,11,20,.94);backdrop-filter:blur(12px);
    box-shadow:0 -1px 0 rgba(255,255,255,.09),0 -16px 40px rgba(0,0,0,.45);}
  .v-demo-h{display:inline-flex;align-items:center;gap:10px;
    font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.16em;color:var(--ink-3);text-transform:uppercase;}
  .v-demo-h button{border:0;background:rgba(255,255,255,.06);color:var(--ink-3);font-size:13px;line-height:1;
    width:22px;height:22px;border-radius:7px;}
  .v-demo-h button:hover{color:var(--ink);background:rgba(255,255,255,.14);}
  .v-demo-b{display:flex;align-items:center;gap:8px 18px;flex-wrap:wrap;justify-content:center;}
  .v-demo.folded .v-demo-b{display:none;}
  .v-vars{display:flex;gap:6px;}
  .v-var{display:flex;align-items:center;gap:7px;padding:8px 14px;border:0;border-radius:10px;
    background:rgba(255,255,255,.05);color:var(--ink-3);transition:.15s;}
  .v-var:hover{background:rgba(255,255,255,.1);color:var(--ink-2);}
  .v-var .tg{font-family:var(--mono);font-size:12px;font-weight:700;}
  .v-var .lb{font-size:11.5px;font-weight:700;white-space:nowrap;}
  .v-var.on{background:linear-gradient(135deg,var(--blue-2),var(--blue));color:#fff;box-shadow:0 6px 18px rgba(59,134,255,.35);}

  @media (max-width:560px){
    .v-tab .tno{display:none;}
    .v-hud{padding:12px 14px;gap:8px;flex-wrap:wrap;}
    .v-brand .bt{font-size:13px;white-space:nowrap;}
    .v-brand .sys,.v-brand .sep,.v-clock{display:none;}
    .v-hud-r{gap:6px;flex-wrap:wrap;justify-content:flex-end;}
    .v-btn{padding:7px 9px;font-size:11.5px;white-space:nowrap;}
    .v-demo{padding:8px 10px;gap:6px 10px;}
    .v-var{padding:7px 10px;} .v-var .lb{font-size:11px;}
  }
  @media (prefers-reduced-motion:reduce){
    .v-seq .lg img,.v-scan-in::after,.v-splash img,.v-splash .w,.v-splash .s{animation:none!important;}
  }`;

  const styleEl = document.createElement('style');
  styleEl.id = 'v-shell';
  styleEl.textContent = SHELL_CSS;
  (document.head || document.documentElement).appendChild(styleEl);

  /* ── 인트로를 재생할지 여기서 확정한다 ──
     "비전 콘솔"로 들어올 때마다 브랜드 연출을 보여주되(entry = always),
     콘솔 안에서의 이동(← 모드 선택 / 실습 ↔ 허브 / 새로고침)에는 대기가 없어야 한다.
     결정을 head 시점에 끝내야 인트로 자리가 깜빡이지 않는다. */
  const alreadyBooted = ss.get(BOOT_KEY, '') === '1';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  const internalMove = ss.get(SKIP_KEY, '') === '1';
  ss.del(SKIP_KEY);   /* 1회용 — 읽는 즉시 소진 */
  const willBoot = !reduceMotion && !internalMove && (introMode === 'always' || !alreadyBooted);
  if (!willBoot) {
    const s2 = document.createElement('style');
    s2.textContent = '.v-boot{display:none!important;}';
    (document.head || document.documentElement).appendChild(s2);
  }

  /* ══════════════════════════════════════════════════════════
     4. 사운드 (Web Audio 합성)
     ══════════════════════════════════════════════════════════ */
  let actx = null, soundOn = true;
  function beep(freq, dur, type, gain) {
    if (!soundOn) return;
    dur = dur || 0.07; type = type || 'sine'; gain = gain || 0.05;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = gain;
      o.connect(g); g.connect(actx.destination);
      const t = actx.currentTime;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur);
    } catch (e) {}
  }
  const sound = {
    move: () => beep(520, 0.06, 'triangle', 0.045),
    tab: () => beep(420, 0.07, 'triangle', 0.045),
    go: () => { beep(660, 0.09, 'square', 0.05); setTimeout(() => beep(990, 0.12, 'square', 0.05), 80); },
    power: () => { beep(180, 0.12, 'sawtooth', 0.05); setTimeout(() => beep(420, 0.1, 'triangle', 0.05), 90); setTimeout(() => beep(740, 0.16, 'sine', 0.06), 190); },
    beep: beep,
    get on() { return soundOn; },
    toggle() { soundOn = !soundOn; if (soundOn) beep(700, 0.08, 'triangle', 0.05); return soundOn; },
  };

  /* ══════════════════════════════════════════════════════════
     5. 진행 상태 — 허브가 직접 기록 (stages/ 파일 무수정)
     ══════════════════════════════════════════════════════════ */
  const progress = {
    all() { try { return JSON.parse(ls.get(VISIT_KEY, '{}')) || {}; } catch (e) { return {}; } },
    has(key) { return !!this.all()[key]; },
    get(key) { return this.all()[key] || null; },
    mark(key) {
      if (!key) return;
      const m = this.all(), now = new Date().toISOString();
      const prev = m[key];
      m[key] = { n: ((prev && prev.n) || 0) + 1, at: now, first: (prev && prev.first) || now };
      ls.set(VISIT_KEY, JSON.stringify(m));
    },
    clear() { ls.del(VISIT_KEY); },
    count(trackKey) {
      const t = TRACKS[trackKey]; if (!t) return { done: 0, total: 0 };
      const m = this.all();
      return { done: t.items.filter(i => m[i.key]).length, total: t.items.length };
    },
    enabled() { return true; },   /* 진행 완료 표시는 기본기능 — 토글 없이 항상 켜짐 */
  };

  /* ── 파생 지표 — 새로 수집하지 않고 위 방문 기록에서만 계산한다 ──
     (기록 지점은 launch() 한 곳뿐이라 stages/ 파일은 계속 무수정) */
  const TIERS = [
    { min: 0, key: 'bronze',   name: 'BRONZE',   color: '#c8874a', ic: '🥉' },
    { min: 2, key: 'silver',   name: 'SILVER',   color: '#b9c3d6', ic: '🥈' },
    { min: 4, key: 'gold',     name: 'GOLD',     color: '#ffc94d', ic: '🥇' },
    { min: 6, key: 'platinum', name: 'PLATINUM', color: '#6ee7d5', ic: '💠' },
    { min: 8, key: 'diamond',  name: 'DIAMOND',  color: '#8fb6ff', ic: '💎' },
  ];
  const XP_FIRST = 20, XP_REPEAT = 5, XP_PER_LEVEL = 100;

  function allItems() {
    return TRACK_KEYS.reduce((a, k) => a.concat(TRACKS[k].items.map(i => ({ item: i, track: k }))), []);
  }
  function stats() {
    const m = progress.all(), all = allItems();
    const done = all.filter(x => m[x.item.key]);
    /* XP — 처음 체험 20, 다시 볼 때마다 5 */
    const xp = done.reduce((a, x) => a + XP_FIRST + Math.max(0, (m[x.item.key].n || 1) - 1) * XP_REPEAT, 0);
    /* 학습한 날 — 기록된 날짜의 서로 다른 날 수 (임의 생성 없음) */
    const days = new Set(done.map(x => (m[x.item.key].at || '').slice(0, 10)).filter(Boolean));
    let tier = TIERS[0];
    TIERS.forEach(t => { if (done.length >= t.min) tier = t; });
    const nextTier = TIERS[TIERS.indexOf(tier) + 1] || null;
    const next = all.find(x => !m[x.item.key]) || null;   /* 아직 안 한 첫 항목 */
    return {
      done: done.length, total: all.length,
      xp, level: Math.floor(xp / XP_PER_LEVEL) + 1,
      levelPct: (xp % XP_PER_LEVEL) / XP_PER_LEVEL * 100,
      xpInLevel: xp % XP_PER_LEVEL, xpPerLevel: XP_PER_LEVEL,
      days: days.size,
      tier, nextTier, toNextTier: nextTier ? nextTier.min - done.length : 0,
      next, nextItem: next && next.item, nextTrack: next && next.track,
    };
  }
  /* 2026-07-21 → "7월 21일" */
  function shortDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }

  /* ══════════════════════════════════════════════════════════
     6. 인트로 — 콘솔 최초 진입 화면에서 1회
     ══════════════════════════════════════════════════════════ */
  const BOOT_LINES = [
    'VISION AI 부팅 중...',
    'TensorFlow.js 런타임 .......... <span class="ok">OK</span>',
    '카메라 모듈 .................. <span class="ok">READY</span>',
    '비전 모델 로드 (5) ........... <span class="ok">LOADED</span>',
    '학습 엔진 .................... <span class="ok">OK</span>',
    '시스템 준비 완료.',
  ];
  function boot(done) {
    const host = document.getElementById('vboot');
    const finish = () => { ss.set(BOOT_KEY, '1'); if (typeof done === 'function') done(); };
    if (!host) { finish(); return; }
    if (!willBoot) { host.remove(); finish(); return; }

    host.innerHTML =
      '<div class="v-scan-in"></div>' +
      '<div class="v-splash" id="vsplash">' +
        '<img src="/platform/img/logo-mark.webp" alt="Eduino AI" />' +
        '<div class="w">Eduino <b>AI</b></div>' +
        '<div class="s">VISION&nbsp;AI&nbsp;CONSOLE · v1.0</div>' +
      '</div>' +
      '<div class="v-seq" id="vseq">' +
        '<div class="lg"><img src="/platform/img/logo-mark.webp" alt="" />' +
          '<div class="lgt"><span class="bw">Eduino <b>AI</b></span>' +
          '<span class="sub">AIoT 학습 플랫폼</span></div></div>' +
        '<pre class="v-log" id="vlog"></pre>' +
        '<div class="v-bar"><i id="vbar"></i></div>' +
      '</div>';

    const splash = document.getElementById('vsplash');
    const seq = document.getElementById('vseq');
    const log = document.getElementById('vlog');
    const bar = document.getElementById('vbar');

    setTimeout(() => {
      splash.classList.add('v-out');
      seq.classList.add('v-in');
      let i = 0;
      const step = () => {
        if (i < BOOT_LINES.length) {
          log.innerHTML += (i ? '\n' : '') + BOOT_LINES[i];
          bar.style.width = Math.round(((i + 1) / BOOT_LINES.length) * 100) + '%';
          beep(300 + i * 70, 0.03, 'square', 0.025);
          i++; setTimeout(step, 170);
        } else {
          setTimeout(() => {
            sound.power();
            host.classList.add('hide');
            setTimeout(() => host.remove(), 500);
            finish();
          }, 420);
        }
      };
      setTimeout(step, 260);
    }, 1500);
  }

  /* ══════════════════════════════════════════════════════════
     7. 세션 가드 — 새로고침/직접 진입에도 튕기지 않는다
     ══════════════════════════════════════════════════════════ */
  function guard() {
    const m = window.Session && Session.getMode && Session.getMode();
    if (window.Session && Session.pass) Session.pass();   /* 남은 1회용 토큰만 소진 */
    if (!m && window.Session && Session.setMode) Session.setMode({ mode: 'free' });
  }

  /* ══════════════════════════════════════════════════════════
     8. HUD 주입
     ══════════════════════════════════════════════════════════ */
  function hud() {
    const host = document.getElementById('vhud');
    if (!host) return;
    host.className = 'v-hud';
    host.innerHTML =
      '<a class="v-brand" href="' + HOME + '">' +
        '<img src="/platform/img/logo-mark.webp" alt="Eduino AI" />' +
        '<span class="bt">Eduino <span>AI</span></span>' +
        '<span class="sep"></span><span class="sys">VISION&nbsp;AI</span>' +
      '</a>' +
      '<div class="v-hud-r">' +
        '<a class="v-btn" href="/entry.html" id="vback" title="모드 선택으로 돌아가기">← 모드 선택</a>' +
        '<span class="v-btn" id="vmode" style="cursor:default">체험 모드</span>' +
        '<span class="v-clock" id="vclock">--:--</span>' +
        '<button class="v-btn" id="vsound" title="효과음 켜기/끄기">🔊 사운드</button>' +
        '<button class="v-btn" id="vboard" title="제출 게시판"><i data-ic="board"></i> 게시판</button>' +
        '<a class="v-btn" href="' + HOME + '"><i data-ic="home"></i> 홈</a>' +
      '</div>';
    if (window.paintIcons) window.paintIcons(host);

    /* 콘솔 안에서 입구로 되돌아가는 이동 — 인트로를 다시 재생하지 않는다 */
    const back = document.getElementById('vback');
    if (back) back.addEventListener('click', () => ss.set(SKIP_KEY, '1'));

    /* 진입 모드 배너 */
    const m = (window.Session && Session.getMode && Session.getMode()) || { mode: 'free' };
    const chip = document.getElementById('vmode');
    if (chip) {
      if (m.mode === 'class') chip.textContent = (m.name || '수업') + ' 참여중';
      else if (m.mode === 'teach') chip.innerHTML = (m.name || '수업') + ' 운영 · <b style="color:#6aa6ff">' + (m.code || '') + '</b>';
      else chip.textContent = '체험 모드';
    }
    /* 제출 게시판 — 체험 모드에서는 숨김 */
    const bb = document.getElementById('vboard');
    if (bb) {
      if (m.mode === 'free') bb.style.display = 'none';
      else if (m.mode === 'class') { bb.title = '내 제출 현황'; if (bb.lastChild && bb.lastChild.nodeType === 3) bb.lastChild.textContent = ' 내 현황'; }
      else if (m.mode === 'teach') bb.title = '제출 게시판 (평가)';
      bb.addEventListener('click', () => { if (window.Board) Board.open(); });
    }
    /* 사운드 토글 */
    const sb = document.getElementById('vsound');
    if (sb) sb.addEventListener('click', () => { sb.textContent = sound.toggle() ? '🔊 사운드' : '🔇 사운드'; });
    /* 라이브 시계 */
    const ck = document.getElementById('vclock');
    if (ck) {
      const tick = () => {
        const d = new Date();
        ck.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      };
      tick(); setInterval(tick, 10000);
    }
  }

  /* ══════════════════════════════════════════════════════════
     9. 데모 전환 바 — 상사가 3안을 즉석에서 비교하는 패널
        (안이 확정되면 각 HTML 의 VStudio.variantBar() 호출만 지우면 사라짐)
     ══════════════════════════════════════════════════════════ */
  function variantBar(onProgressToggle) {
    const cur = variantKey();
    const el = document.createElement('div');
    el.className = 'v-demo';
    el.innerHTML =
      '<div class="v-demo-h"><span>UI 제안 · ' + VARIANTS.length + '안 비교</span>' +
        '<button id="vfold" title="접기/펴기">–</button></div>' +
      '<div class="v-demo-b">' +
        '<div class="v-vars">' +
          VARIANTS.map(v =>
            '<button class="v-var' + (v.key === cur ? ' on' : '') + '" data-v="' + v.key + '">' +
            '<span class="tg">' + v.tag + '</span><span class="lb">' + v.label + '</span></button>'
          ).join('') +
        '</div>' +
      '</div>';
    document.body.appendChild(el);

    /* 바 높이만큼 본문에 여백을 줘서 콘텐츠를 가리지 않게 한다 */
    const fitBody = () => { document.body.style.paddingBottom = el.offsetHeight + 'px'; };
    fitBody();
    window.addEventListener('resize', fitBody);

    el.querySelector('#vfold').addEventListener('click', () => {
      el.classList.toggle('folded');
      el.querySelector('#vfold').textContent = el.classList.contains('folded') ? '+' : '–';
      fitBody();
    });
    el.querySelectorAll('.v-var').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.v;
      ls.set(VKEY, k);
      if (k === cur) return;
      const v = VARIANTS.find(x => x.key === k);
      sound.tab();
      location.href = v.url + (location.hash || '');
    }));
    return el;
  }

  /* ══════════════════════════════════════════════════════════
     10. 유틸 — 썸네일 폴백 로더 / 트랙 / 이동
     ══════════════════════════════════════════════════════════ */
  /* webp→jpg→png→jpeg 순으로 시도, 다 없으면 그라데이션 폴백 */
  function thumbs(scope, markClass) {
    (scope || document).querySelectorAll('img[data-base]').forEach(img => {
      if (img.dataset.wired) return;
      img.dataset.wired = '1';
      const base = img.dataset.base, exts = ['webp', 'jpg', 'png', 'jpeg'];
      let i = 0;
      const next = () => { if (i >= exts.length) { img.remove(); return; } img.src = base + '.' + exts[i++]; };
      img.addEventListener('error', next);
      img.addEventListener('load', () => {
        const host = img.closest('[data-thumbhost]') || img.parentElement;
        if (host) host.classList.add(markClass || 'has-thumb');
      });
      next();
    });
  }

  /* ── 트랙 탭 — 두 안이 같은 마크업을 복붙하던 곳.
        라벨(label)·번호(no)·개수(items.length)는 TRACKS 에서만 온다. ── */
  function tabs(host, opt) {
    if (!host) return null;
    const flow = !!(opt && opt.flow);
    host.className = 'v-tabs';
    host.setAttribute('role', 'tablist');
    host.innerHTML = TRACK_KEYS.map((k, i) => {
      const t = TRACKS[k];
      return (i && flow ? '<span class="v-flow" aria-hidden="true">→</span>' : '') +
        '<button class="v-tab" role="tab" data-track="' + k + '"' +
        ' style="--tacc:' + t.accent + ';--tacc2:' + t.accent2 + ';--tglow:' + t.glowA + '">' +
        '<span class="tno">' + t.no + '</span> ' + t.label +
        ' <span class="cnt">' + t.items.length + '</span></button>';
    }).join('');
    return host;
  }
  /* 현재 트랙 표시 + 탭 클릭 배선 (한 번만 부르면 된다) */
  function wireTabs(host, onPick) {
    if (!host) return;
    host.querySelectorAll('.v-tab').forEach(b =>
      b.addEventListener('click', () => onPick(b.dataset.track)));
  }
  function syncTabs(host, key) {
    if (!host) return;
    host.querySelectorAll('.v-tab').forEach(b => b.classList.toggle('on', b.dataset.track === key));
  }
  /* 트랙 전환 키(↑↓[]) — 트랙이 늘어도 순환한다 */
  function nextTrackKey(key) {
    const i = TRACK_KEYS.indexOf(key);
    return TRACK_KEYS[(i + 1) % TRACK_KEYS.length];
  }

  /* ── 공용 키 조작 — 두 안이 같은 규칙을 따로 들고 있던 곳 ──
        ← → 이동 · ⏎/Space 시작 · ↑ ↓ [ ] 트랙 전환 · ESC 홈 · 1–9 바로 선택
        jump(i) 는 범위 검사를 하지 않는다 (안마다 항목 수가 달라 호출 쪽에서 거른다) */
  function keys(h) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); h.next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); h.prev(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); h.enter(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === '[' || e.key === ']') {
        e.preventDefault(); h.track();
      }
      else if (e.key === 'Escape') { location.href = HOME; }
      else if (/^[1-9]$/.test(e.key)) h.jump(+e.key - 1);
    });
  }

  /* 해시(#explore·#create)로 트랙을 바꾸는 뒤로가기 대응 */
  function onHashTrack(fn) {
    window.addEventListener('hashchange', () => {
      const h = (location.hash || '').replace('#', '');
      if (TRACK_KEYS.indexOf(h) >= 0) fn(h);
    });
  }

  /* 진행 완료 표시 스위치 — 두 안 모두 body 클래스로 켠다 */
  function showProgress() {
    document.body.classList.toggle('show-progress', progress.enabled());
  }

  function initTrack() {
    const hash = (location.hash || '').replace('#', '');
    let key = TRACK_KEYS.indexOf(hash) >= 0 ? hash : null;
    if (!key) { const last = ss.get(TRACK_MEM, ''); if (TRACK_KEYS.indexOf(last) >= 0) key = last; }
    key = key || 'explore';
    ss.set(TRACK_MEM, key);
    return key;
  }
  function rememberTrack(key) {
    ss.set(TRACK_MEM, key);
    try { history.replaceState(null, '', '#' + key); } catch (e) {}
  }

  function setAmbient(el, track) {
    if (!el) return;
    el.style.background =
      'radial-gradient(60% 55% at 28% 12%,' + track.glowA + ',transparent 60%),' +
      'radial-gradient(55% 50% at 80% 80%,' + track.glowB + ',transparent 62%),' +
      'linear-gradient(180deg,var(--bg-2),var(--bg))';
  }
  /* 트랙 색을 문서 전체(--acc/--acc2/--accGlow)와 배경에 한 번에 반영한다 */
  function paintTrack(track, ambEl) {
    const s = document.documentElement.style;
    s.setProperty('--acc', track.accent);
    s.setProperty('--acc2', track.accent2);
    s.setProperty('--accGlow', track.glowA);
    setAmbient(ambEl || document.getElementById('vamb'), track);
  }

  function launch(href, itemKey) {
    progress.mark(itemKey);
    sound.go();
    document.body.style.transition = 'opacity .22s';
    document.body.style.opacity = '0';
    setTimeout(() => { location.href = href; }, 200);
  }

  /* 뒤로가기(bfcache 복원) 시 페이드아웃 상태로 되살아나 검정화면이 되는 것 방지 */
  window.addEventListener('pageshow', () => {
    document.body.style.transition = 'none';
    document.body.style.opacity = '1';
  });

  /* 지금 열린 안을 '선택된 안'으로 저장한다.
     실습 화면의 콘솔 링크는 /studio.html 로 고정돼 있는데, 그 스텁이 이 값을 보고 되돌려 보낸다.
     (변형끼리 서로 리다이렉트하지 않으므로 루프가 생길 수 없다) */
  function claim(thisKey) {
    if (VARIANTS.some(v => v.key === thisKey)) ls.set(VKEY, thisKey);
  }

  window.VStudio = {
    TRACKS, TRACK_KEYS, VARIANTS, TIERS, HOME,
    boot, guard, hud, variantBar,
    progress, stats, shortDate, allItems, sound, thumbs,
    tabs, wireTabs, syncTabs, nextTrackKey, keys, onHashTrack, showProgress,
    initTrack, rememberTrack, setAmbient, paintTrack, launch,
    variantKey, studioURL, claim,
  };
})();
