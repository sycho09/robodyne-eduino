// sensorRoom.js — 박물관형 센서 전시관(탑다운). EDDIE가 걸어다니며
//   📖 이론관(자료 가로슬라이드 + 13번 핀 블록코딩 체험) / 🎮 체험관(미니게임) 입구로 입장.
//   밝은 카니발/박물관 톤. config 기반 확장형.
import { createWorld } from '../engine/topdown.js';
import { sfx } from '../app/sfx.js';
import { progress } from '../app/progress.js';
import { board } from '../app/board.js';
import { mountEddieRig } from '../app/eddieRig.js';
import { showLedGame } from './ledGame.js';
import { showBuzzerGame } from './buzzerGame.js';
import { showRgbGame } from './rgbGame.js';
import { showCdsGame } from './cdsGame.js';
import { showPotGame } from './potGame.js';
import { showJoystickGame } from './joystickGame.js';
import { showUltraGame } from './ultraGame.js';
import { showButtonGame } from './buttonGame.js';
import { showFlagGame } from './flagGame.js';
import { celebrateRoom } from './celebrate.js';
import { nav } from '../app/nav.js';

const roomCache = {};
function roomImgFor(name) { const key = name || 'room-bg'; if (!roomCache[key]) { const im = new Image(); let step = 0; im.onerror = () => { step++; if (step === 1) im.src = `/brand/${key}.png`; else if (step === 2 && key !== 'room-bg') im.src = '/brand/room-bg.webp'; }; im.src = `/brand/${key}.webp`; roomCache[key] = im; } return roomCache[key]; }

const ROOMS_CFG = {
  led: {
    name: '반짝반짝 라이트쇼', sensor: 'LED · 발광 다이오드', icon: '💡', accent: '255,200,74',
    room: 'room-led-bg', eddie: null, signL: '120,225,255', signR: '255,158,90', control: 'led', blockPin: 13,
    intro: '이론관에서 LED를 배우고, 체험관에서 직접 연주해보자! 🎶',
    animTheory: 'led',
    captions: [
      '전자(−)와 정공(+)이 ‘딱’ 만나면 빛이 짠! 하고 나와요 ✨',
      '디지털 출력 — 1(HIGH)이면 켜짐, 0(LOW)이면 꺼짐! 🔆',
      '색마다 빛 에너지(파장)가 달라요 — 초록·노랑·빨강! 🌈',
    ],
    play: (root, opt) => showLedGame(root, opt),
  },
  buzzer: {
    name: '멜로디 연주단', sensor: '수동 부저 · Passive Buzzer', icon: '🔊', accent: '150,210,120',
    room: 'room-buzzer-bg', eddie: '/brand/eddie-buzzer.webp', signL: '140,210,150', signR: '255,200,110', control: 'keys', blockPin: 5,
    intro: '이론관에서 부저를 배우고, 체험관에서 멜로디를 연주하자! 🎶',
    animTheory: 'buzzer',                                 // 정적 이미지 대신 코드 애니메이션 이론
    captions: [
      '전기가 들어오면 얇은 판이 빠르게 떨려요 → 그 떨림이 공기를 흔들어 소리가 나요! 🔊',
      '음 높이 = 주파수(Hz)! 빠르게 떨릴수록(높은 Hz) 높은 음 — 슬라이더로 바꿔 들어봐 🎵',
      '알람·초인종·멜로디… 부저는 소리로 우리에게 알려줘요 🔔',
    ],
    play: (root, opt) => showBuzzerGame(root, opt),
  },
  rgb: {
    name: '무지개 물감놀이', sensor: '네오픽셀(WS2812) 풀컬러', icon: '🌈', accent: '180,140,255',
    room: 'room-rgb-bg', eddie: null, signL: '120,200,255', signR: '255,150,200', control: 'rgb',
    pins: { neo: 6 }, blockPin: 6,
    intro: '이론관에서 빛의 삼원색을 배우고, 체험관에서 색을 섞어보자! 🌈',
    animTheory: 'rgb',
    captions: [
      '빨강·초록·파랑(RGB) 빛을 겹치면 새 색이 돼요 — 빛은 섞을수록 밝아져요! ✨',
      'PWM으로 각 색의 밝기(0~255)를 조절 → 원하는 색을 자유자재로! 🎚️',
      '폰·TV·무드등 화면이 전부 이 RGB로 모든 색을 만들어요 📺',
    ],
    play: (root, opt) => showRgbGame(root, opt),
  },
  cds: {
    name: '손그림자 마술', sensor: '조도센서(CDS) · 빛 감지', icon: '🔆', accent: '255,210,90',
    room: 'room-cds-bg', eddie: null, signL: '255,210,120', signR: '120,180,255', control: 'cds', adc: 0,
    intro: '이론관에서 빛 센서를 배우고, 체험관에서 손그림자로 빛을 다뤄보자! 🔆',
    animTheory: 'cds',
    captions: [
      'CDS는 빛을 받으면 저항이 작아져 전기가 잘 통하고, 어두우면 저항이 커져요! 🔆',
      '아날로그로 빛의 양을 0~1023 숫자로 읽어요 — 밝으면 큰 값, 어두우면 작은 값! 📈',
      '자동 가로등·화면 밝기 자동조절… 빛 센서가 똑똑하게 켜고 꺼줘요 💡',
    ],
    play: (root, opt) => showCdsGame(root, opt),
  },
  pot: {
    name: '볼륨 다이얼쇼', sensor: '가변저항(회전형) · 아날로그 입력', icon: '🎚️', accent: '180,150,255',
    room: 'room-pot-bg', eddie: null, signL: '180,150,255', signR: '120,230,160', control: 'pot', adc: 0,
    intro: '이론관에서 가변저항(아날로그 입력)을 배우고,<br>체험관에서 다이얼을 돌려 볼륨쇼를 펼쳐보자! 🎚️',
    animTheory: 'pot',
    captions: [
      '가변저항은 돌린 만큼 저항이 바뀌어 0~1023 값을 만들어요 — 아날로그 입력! 🎚️',
      '버튼(0/1)과 달리 가운데 값도 다 있어요 — 살살 돌리면 값도 살살 변해요 📈',
      '볼륨·밝기·선풍기 세기… 다이얼로 "얼마나"를 정하는 게 아날로그예요 🔊',
    ],
    play: (root, opt) => showPotGame(root, opt),
  },
  joystick: {
    name: '우주 조종 훈련소', sensor: '조이스틱 · X·Y·버튼', icon: '🕹️', accent: '150,120,255',
    room: 'room-joystick-bg', eddie: '/brand/eddie-pilot.webp', signL: '120,200,255', signR: '255,120,220',
    control: 'joystick', pins: { x: 5, y: 6, sw: 7 }, floor: 0.82,
    intro: '이론관에서 조종 원리를 배우고, 체험관에서 우주선으로 미로를 탈출하자! 🚀',
    animTheory: 'joystick',
    captions: [
      '조이스틱은 X(좌우)·Y(상하) 두 개의 아날로그 값을 한 번에 읽어요 — 2축! 🕹️',
      '안 움직이면 가운데(약 512), 끝까지 밀면 0 또는 1023 — 값의 변화가 곧 방향!',
      '스틱을 밀면 우주선이 그 방향으로 — 조종간이 되는 거예요 🚀',
    ],
    play: (root, opt) => showJoystickGame(root, opt),
  },
  ultra: {
    name: '무궁화 꽃이 피었습니다', sensor: '초음파 센서 · HC-SR04', icon: '🌸', accent: '255,150,190',
    room: 'room-ultra-bg', eddie: null, signL: '255,150,190', signR: '120,210,230',
    control: 'ultra', pins: { trig: 4, echo: 3 }, floor: 0.82,
    intro: '이론관에서 초음파(거리) 센서를 배우고,<br>체험관에서 술래(무궁화 꽃) 몰래 다가가자! 🌸',
    animTheory: 'ultra',
    captions: [
      '초음파 센서는 사람이 못 듣는 높은 소리를 쏘고, 부딪혀 돌아오는 메아리를 들어요 📡',
      '소리가 갔다 오는 시간 ÷ 2 로 거리를 계산! 가까우면 빨리, 멀면 늦게 돌아와요 ⏱️',
      '주차 센서·로봇 장애물 감지·자동문… 거리로 세상을 봐요 🤖',
    ],
    play: (root, opt) => showUltraGame(root, opt),
  },
  button: {
    name: '두더지 & 청기백기', sensor: '택트스위치 2개 · 디지털 입력', icon: '🔨', accent: '255,170,90',
    room: 'room-button-bg', eddie: null, signL: '255,170,90', signR: '90,150,255',
    control: 'button', pins: { b1: 4, b2: 5 }, floor: 0.82,
    intro: '이론관에서 버튼(디지털 입력)을 배우고,<br>체험관에서 두더지 잡기 → 청기백기 순서로 즐겨보자! 🔨🚩',
    animTheory: 'button',
    captions: [
      '버튼은 누름(1)/안 누름(0) 두 값만 있는 디지털 입력이에요 — 켜짐/꺼짐! 🔘',
      '버튼1=D4(포트3), 버튼2=D5(포트4) — 누르는 순간 0↔1로 또렷하게 바뀌어요 ⚡',
      '두더지 잡기(반응)·청기백기(명령 따라) — 한 방에서 두 게임! 🎮',
    ],
    // 택트 2개로 두 게임 순차 플레이: 두더지 → 청기백기 → 메달
    play: (root, opt) => showButtonGame(root, {
      onExit: opt.onExit,
      onComplete: () => showFlagGame(root, {
        onExit: opt.onExit, skipPrep: true,
        onComplete: () => { progress.mark('button'); celebrateRoom({ title: '택트스위치 마스터! 🔨🚩', message: '두더지 잡기와 청기백기를 모두 클리어 — 메달 획득!', exitLabel: '전시관으로 ▶', onExit: () => opt.onExit?.() }); },
      }),
    }),
  },
};

// 아직 게임 미구현인 체험관 — 무대 배경 위에 '곧 공개' 안내
function soonPlay(root, { onExit } = {}, name, bg) {
  root.innerHTML = `<div class="led scene-fade"><div class="soon-bg" id="soon-bg"></div>
    <div class="soon-card"><div class="soon-emoji">🎵</div><h2>${name} — 곧 공개!</h2>
    <p>이 체험관 미니게임은 준비 중이에요. 이론관에서 먼저 배워볼까요?</p>
    <button class="cel-go" id="soon-back">전시관으로 ▶</button></div></div>`;
  const im = new Image(); im.onload = () => { const e = root.querySelector('#soon-bg'); if (e) { e.style.backgroundImage = `url(${im.src})`; } };
  im.src = `/brand/${bg}.webp`;
  root.querySelector('#soon-back').onclick = () => onExit?.();
}

export function showSensorRoom(root, { id, onExit } = {}) {
  const cfg = ROOMS_CFG[id]; if (!cfg) { onExit?.(); return; }
  const VW = Math.max(900, window.innerWidth), VH = Math.max(440, window.innerHeight);
  const FLOOR_Y = VH * (cfg.floor || 0.74);        // EDDIE가 걷는 바닥 라인(좌우 전용, 방별 조정)
  // 화살표 푯말 — 각 문을 가리킴(왼쪽=이론관/오른쪽=체험관)
  const stations = [
    { id: 'theory', icon: '📖', label: '이론관', sub: '자료 + 체험', dir: -1, cx: VW * 0.27, signY: VH * 0.50, postY: FLOOR_Y, color: cfg.signL },
    { id: 'play', icon: '🎮', label: '체험관', sub: '미니게임', dir: 1, cx: VW * 0.73, signY: VH * 0.50, postY: FLOOR_Y, color: cfg.signR },
  ];

  root.innerHTML = `
    <div class="scene game-scene scene-fade escape-scene sroom2">
      <div class="world-host" id="world-host"></div>
      <div class="sr-top"><span class="sr-chip">${cfg.icon}</span> <b>${cfg.name}</b> <span class="sr-sensor">· ${cfg.sensor}</span></div>
      <button class="bx-exit" id="sr-exit">✕ 무대로</button>
      <button class="snd-toggle" id="snd-toggle">${sfx.muted ? '🔇' : '🔊'}</button>
      <div class="hud-controls">⬅➡ 좌우 이동 · 문 끝까지 가면 입장 · ✕ 무대로</div>
      <div class="sr-fade" id="sr-fade"></div>
      <div class="sr-theory-view" id="sr-tview" hidden></div>
    </div>`;

  const host = root.querySelector('#world-host');
  const fade = root.querySelector('#sr-fade');
  const snd = root.querySelector('#snd-toggle'); snd.onclick = () => { const m = sfx.toggle(); snd.textContent = m ? '🔇' : '🔊'; };
  root.querySelector('#sr-exit').onclick = () => { sfx.pop(); destroyAll(); onExit?.(); };
  const bubble = document.createElement('div'); bubble.className = 'eddie-bubble'; host.appendChild(bubble);
  let bubbleT = null;
  function guide(t, ms = 4200) { bubble.innerHTML = `🤖 ${t}`; bubble.classList.add('show'); clearTimeout(bubbleT); if (ms) bubbleT = setTimeout(() => bubble.classList.remove('show'), ms); }

  const map = {
    width: VW, height: VH, bg: '#efe2c8', playerScale: 1.75, lockVertical: true, eddieSrc: cfg.eddie,
    spawn: { x: VW / 2 - 14, y: FLOOR_Y - 30 },
    walls: [{ x: 0, y: 0, w: 14, h: VH }, { x: VW - 14, y: 0, w: 14, h: VH }],
    // 문 끝(좌/우 가장자리)에 닿으면 자동 입장(페이드)
    triggers: [
      { id: 'theory', auto: true, x: 0, y: 0, w: VW * 0.13, h: VH },
      { id: 'play', auto: true, x: VW * 0.87, y: 0, w: VW * 0.13, h: VH },
    ],
    draw: (ctx, st) => drawRoom(ctx, st, stations, cfg, VW, VH, roomImgFor(cfg.room)),
  };

  const world = createWorld(host, map, {
    onAuto: enterDoor, onFrame: onFrame,
    onEddieClick: () => guide('왼쪽=이론관 📖 · 오른쪽=체험관 🎮 — 문 끝까지 걸어가!', 2800),
    onDrawOverlay: drawVignette,
  });
  setTimeout(() => guide(cfg.intro), 500);

  function destroyAll() { try { world.destroy(); } catch (_) {} }
  let entering = false;
  function enterDoor(idTrig) {
    if (entering) return; entering = true;
    sfx.start(); world.pause(); fade.classList.add('on');
    setTimeout(() => {
      if (idTrig === 'theory') { openTheory(); fade.classList.remove('on'); entering = false; }
      // 체험관(게임)은 nav 프레임으로 push → 게임에서 뒤로(기기/ESC/버튼) 시 복도로 복귀.
      else { destroyAll(); nav.push(() => cfg.play(root, { onExit: () => nav.back() })); }
    }, 480);
  }
  function onFrame(state) {
    const p = state.player, cam = state.cam;
    bubble.style.left = ((p.x + p.w / 2) - cam.x) + 'px'; bubble.style.top = (p.y - cam.y - 150) + 'px';
  }
  function drawVignette(ctx, st, canvas) {
    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.46, canvas.height * 0.42, canvas.width / 2, canvas.height / 2, canvas.height * 1.02);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(60,30,10,0.18)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // ───────── 이론관 오버레이 (자료 슬라이드 + 블록코딩) ─────────
  function openTheory() {
    world.pause();
    const v = root.querySelector('#sr-tview'); v.hidden = false;
    let tab = 'info', ci = 0, blink = null, ledOn = false, blinkOn = false, stateUnsub = null, theoryRaf = null, cdsTimer = null, joyTimer = null;
    function stopCdsPoll() { if (cdsTimer) { clearInterval(cdsTimer); cdsTimer = null; } }
    function stopJoyPoll() { if (joyTimer) { clearInterval(joyTimer); joyTimer = null; } }
    const INFO = (cfg.info || []).map((n) => `/brand/${n}.webp`), CAPS = cfg.captions || [];

    v.innerHTML = `
      <div class="prep-card tv-card">
        <div class="tv-tabs">
          <button class="tv-tab on" data-t="info">📚 자료</button>
          <button class="tv-tab" data-t="code">${cfg.control === 'keys' ? '🎹 연주판' : cfg.control === 'rgb' ? '🎨 색 섞기' : cfg.control === 'cds' ? '🔆 빛 측정' : cfg.control === 'joystick' ? '🕹️ 조종 모니터' : cfg.control === 'ultra' ? '📡 거리 측정' : cfg.control === 'button' ? '🔘 버튼 입력' : '🎛️ LED 제어'}</button>
          <button class="tv-x" id="tv-x">✕ 나가기</button>
        </div>
        <div class="tv-body" id="tv-body"></div>
      </div>
      <div class="tv-eddie-wrap" id="tv-ew" hidden>
        <div class="tv-bubble" id="tv-bubble"></div>
        <div class="tv-eddie" id="tv-eddie"></div>
      </div>`;
    const bodyEl = v.querySelector('#tv-body'), ew = v.querySelector('#tv-ew'), bub = v.querySelector('#tv-bubble');
    mountEddieRig(v.querySelector('#tv-eddie'), { hero: cfg.eddie });
    v.querySelectorAll('.tv-tab').forEach((b) => b.onclick = () => { if (tab === b.dataset.t) return; tab = b.dataset.t; if (tab !== 'code') stopBlink(); v.querySelectorAll('.tv-tab').forEach((x) => x.classList.toggle('on', x === b)); renderTab(); });
    v.querySelector('#tv-x').onclick = close;
    function close() {
      stopBlink(); stopRaf(); stopCdsPoll(); stopJoyPoll(); if (stateUnsub) { stateUnsub(); stateUnsub = null; }
      if (board.connected) {
        if (cfg.control === 'rgb') board.neoFill(cfg.pins.neo, 0, 0, 0).catch(() => {});
        else if (cfg.control === 'led') board.digital(cfg.blockPin, false).catch(() => {});
      }
      v.hidden = true; v.innerHTML = ''; world.teleport(VW * 0.5 - 14, FLOOR_Y - 30); world.resume();
    }
    function stopRaf() { if (theoryRaf) { cancelAnimationFrame(theoryRaf); theoryRaf = null; } }
    function renderTab() { stopRaf(); stopCdsPoll(); stopJoyPoll(); stopBlink(); tab === 'info' ? renderInfo() : (cfg.control === 'keys' ? renderKeys() : cfg.control === 'rgb' ? renderRgb() : cfg.control === 'cds' ? renderCds() : cfg.control === 'joystick' ? renderJoystick() : cfg.control === 'ultra' ? renderUltra() : cfg.control === 'button' ? renderButton() : renderControl()); }

    // 자료 — 코드 애니메이션 이론(부저 등). 정적 이미지 대신 직접 생동감 있게.
    function renderAnim() {
      ew.hidden = false;
      const ANIM = cfg.animTheory === 'led' ? ledTheory() : cfg.animTheory === 'rgb' ? rgbTheory() : cfg.animTheory === 'cds' ? cdsTheory() : cfg.animTheory === 'pot' ? potTheory() : cfg.animTheory === 'joystick' ? joystickTheory() : cfg.animTheory === 'ultra' ? ultraTheory() : cfg.animTheory === 'button' ? buttonTheory() : buzzerTheory();
      bodyEl.innerHTML = `
        <div class="tv-slider">
          <button class="tv-arrow" id="tv-prev">◀</button>
          <div class="tv-anim" id="tv-anim"></div>
          <button class="tv-arrow" id="tv-next">▶</button>
        </div>
        <div class="tv-dots">${ANIM.map((_, i) => `<i class="${i === ci ? 'on' : ''}" data-i="${i}"></i>`).join('')}</div>`;
      const stage = bodyEl.querySelector('#tv-anim');
      const show = () => {
        stopRaf();
        stage.innerHTML = ANIM[ci].html;
        if (ANIM[ci].init) ANIM[ci].init(stage, (id) => { theoryRaf = id; });
        bodyEl.querySelectorAll('.tv-dots i').forEach((d, i) => d.classList.toggle('on', i === ci));
        const cap = (cfg.captions || [])[ci] || '';
        bub.innerHTML = `🤖 ${cap}`; bub.classList.remove('pop'); void bub.offsetWidth; bub.classList.add('pop');
      };
      show();
      const go = (d) => {
        // 마지막 자료에서 ▶ → 실습 탭(제어/연주판/색섞기)으로 자동 이동 (롤링 방지)
        if (d > 0 && ci === ANIM.length - 1) { v.querySelector('.tv-tab[data-t="code"]')?.click(); return; }
        sfx.hover(); ci = (ci + d + ANIM.length) % ANIM.length; show();
      };
      bodyEl.querySelector('#tv-prev').onclick = () => go(-1);
      bodyEl.querySelector('#tv-next').onclick = () => go(1);
      bodyEl.querySelectorAll('.tv-dots i').forEach((d) => d.onclick = () => { ci = +d.dataset.i; show(); });
    }

    // 화면 어느 탭이든 EDDIE가 설명
    function showEddie(text) { ew.hidden = false; bub.innerHTML = `🤖 ${text}`; bub.classList.remove('pop'); void bub.offsetWidth; bub.classList.add('pop'); }

    // 부저 연주판: 계이름 버튼(음 재생) — 3×3 정사각 패드. 보드 연결 시 실제 부저음(tone)
    function renderKeys() {
      showEddie('계이름 버튼을 눌러 음을 들어봐! 위로 갈수록 높은 음이야 🎵');
      const NOTES = [['도', 262], ['레', 294], ['미', 330], ['파', 349], ['솔', 392], ['라', 440], ['시', 494], ['도↑', 523], ['레↑', 587]];
      bodyEl.innerHTML = `
        <div class="kb">
          <p class="kb-info">🎹 계이름을 눌러 연주! 음이 <b>높을수록 주파수(Hz)</b>가 커져. <span class="kb-pin">🔊 테스트: 부저를 <b>D5</b>에 연결</span></p>
          <div class="kb-keys sq">${NOTES.map((n, i) => `<button class="kb-key" data-i="${i}"><b>${n[0]}</b><span>${n[1]}Hz</span></button>`).join('')}</div>
          <button class="dbtn ghost dc-conn" id="dc-conn">${board.connected ? '🔌 보드 연결됨 ✓' : '🔌 보드 연결(실물 부저)'}</button>
          <div class="dc-status" id="dc-status">${board.connected ? '누르면 실제 부저가 소리나! 🔊' : '연결하면 실제 부저음이 나요. (안 해도 화면 소리로 체험)'}</div>
        </div>`;
      const status = bodyEl.querySelector('#dc-status'), connBtn = bodyEl.querySelector('#dc-conn');
      const play = (b) => {                                  // pointerdown 으로 즉시 반응(지연 최소화)
        const [, freq] = NOTES[+b.dataset.i]; sfx.note(freq, 300);
        if (board.connected) board.tone(cfg.blockPin, freq, 300).catch(() => {});
        b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 150);
      };
      bodyEl.querySelectorAll('.kb-key').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); play(b); }));
      connBtn.onclick = async () => {
        if (board.connected) return; status.textContent = '연결 중… 포트를 골라주세요 🔌';
        try { await board.connect(); connBtn.textContent = '🔌 보드 연결됨 ✓'; status.textContent = '누르면 실제 부저가 소리나! 🔊'; }
        catch (e) { status.textContent = board.classify(e).note; }
      };
      if (stateUnsub) stateUnsub();
      stateUnsub = board.onState(() => { const c = board.connected; connBtn.textContent = c ? '🔌 보드 연결됨 ✓' : '🔌 보드 연결(실물 부저)'; if (!c) status.textContent = '보드 연결이 끊겼어요 — 다시 [보드 연결]을 눌러줘'; });
    }

    // RGB 색 섞기 대시보드: R/G/B 슬라이더(0~255) → 실시간 색 미리보기 + 프리셋. 보드 연결 시 실제 RGB LED(PWM)
    function renderRgb() {
      showEddie('빨강·초록·파랑을 섞어 색을 만들어봐! 다 올리면 하양, 다 내리면 꺼짐 🎨');
      const P = cfg.pins;
      const h2 = (n) => (+n).toString(16).padStart(2, '0').toUpperCase();
      const PRESETS = [['하양', 255, 255, 255], ['빨강', 255, 0, 0], ['초록', 0, 255, 0], ['파랑', 0, 0, 255], ['노랑', 255, 255, 0], ['하늘', 0, 255, 255], ['분홍', 255, 0, 255], ['주황', 255, 110, 0], ['보라', 150, 0, 255]];
      bodyEl.innerHTML = `
        <div class="dash rgb-dash">
          <div class="dash-led">
            <div class="rgb-sw" id="rgb-sw"></div>
            <div class="rgb-read"><b id="rgb-hex">#FFFFFF</b><span id="rgb-rgb">R255 · G255 · B255</span></div>
            <div class="dl-pin">🎨 테스트: <b>네오픽셀 DIN→D6 · VCC→5V · GND→GND</b><br><span>(WS2812 풀컬러 LED · 데이터선 1가닥으로 모든 색)</span></div>
          </div>
          <div class="dash-cards">
            <div class="dcard">
              <div class="dc-h">🎚️ PWM 색 혼합 <span>각 채널 0~255</span></div>
              <div class="rt-sliders">
                <label class="rs r">R <input type="range" id="cr" min="0" max="255" value="255"><b id="cvr">255</b></label>
                <label class="rs g">G <input type="range" id="cg" min="0" max="255" value="255"><b id="cvg">255</b></label>
                <label class="rs b">B <input type="range" id="cb" min="0" max="255" value="255"><b id="cvb">255</b></label>
              </div>
            </div>
            <div class="dcard">
              <div class="dc-h">🎨 프리셋 색</div>
              <div class="rgb-presets">${PRESETS.map((p, i) => `<button class="rgb-chip" data-i="${i}" style="background:rgb(${p[1]},${p[2]},${p[3]})" title="${p[0]}"></button>`).join('')}</div>
            </div>
            <button class="dbtn ghost dc-conn" id="dc-conn">${board.connected ? '🔌 보드 연결됨 ✓' : '🔌 보드 연결(실물 RGB LED)'}</button>
            <div class="dc-status" id="dc-status">${board.connected ? '슬라이더로 실제 RGB LED 색을 바꿔봐! 🌈' : '연결하면 실제 RGB LED가 같은 색으로 빛나요. (안 해도 화면으로 체험)'}</div>
          </div>
        </div>`;
      const sw = bodyEl.querySelector('#rgb-sw'), hexEl = bodyEl.querySelector('#rgb-hex'), rgbEl = bodyEl.querySelector('#rgb-rgb');
      const cr = bodyEl.querySelector('#cr'), cg = bodyEl.querySelector('#cg'), cb = bodyEl.querySelector('#cb');
      const vr = bodyEl.querySelector('#cvr'), vg = bodyEl.querySelector('#cvg'), vb = bodyEl.querySelector('#cvb');
      const status = bodyEl.querySelector('#dc-status');
      function sendRGB(r, g, b) { if (board.connected) board.neoFill(P.neo, r, g, b).catch(() => {}); }
      function paint(send) {
        const r = +cr.value, g = +cg.value, b = +cb.value;
        sw.style.background = `rgb(${r},${g},${b})`;
        hexEl.textContent = '#' + h2(r) + h2(g) + h2(b);
        rgbEl.textContent = `R${r} · G${g} · B${b}`;
        vr.textContent = r; vg.textContent = g; vb.textContent = b;
        if (send) sendRGB(r, g, b);
      }
      [cr, cg, cb].forEach((s) => s.oninput = () => paint(true));
      bodyEl.querySelectorAll('.rgb-chip').forEach((c) => c.onclick = () => { const p = PRESETS[+c.dataset.i]; cr.value = p[1]; cg.value = p[2]; cb.value = p[3]; sfx.ok(); paint(true); });
      paint(false);
      const connBtn = bodyEl.querySelector('#dc-conn');
      connBtn.onclick = async () => {
        if (board.connected) return; status.textContent = '연결 중… 포트를 골라주세요 🔌';
        try { await board.connect(); connBtn.textContent = '🔌 보드 연결됨 ✓'; status.textContent = '슬라이더로 실제 RGB LED 색을 바꿔봐! 🌈'; paint(true); }
        catch (e) { status.textContent = board.classify(e).note; }
      };
      if (stateUnsub) stateUnsub();
      stateUnsub = board.onState(() => {
        const c = board.connected;
        connBtn.textContent = c ? '🔌 보드 연결됨 ✓' : '🔌 보드 연결(실물 RGB LED)';
        if (!c) status.textContent = '보드 연결이 끊겼어요 — 다시 [보드 연결]을 눌러줘';
      });
    }

    // 조도센서 빛 측정 대시보드: 실시간 빛 값(A0) 게이지. 보드 연결 시 실제 센서, 미연결 시 슬라이더 시뮬.
    function renderCds() {
      showEddie('센서 위에서 손을 움직여봐! 가리면 어두워지고 값이 뚝 떨어져 🔆');
      const CH = cfg.adc ?? 0;
      bodyEl.innerHTML = `
        <div class="dash cds-dash">
          <div class="dash-led">
            <div class="cds-gauge"><span class="cds-ico top">☀️</span><div class="cds-tube"><div class="cds-fill" id="cds-fill"></div></div><span class="cds-ico bot">🌑</span></div>
            <div class="dl-pin">🔆 테스트: <b>CDS → A0</b><br><span>(한쪽 5V · 다른쪽 10kΩ→GND · 가운데 A0)</span></div>
          </div>
          <div class="dash-cards">
            <div class="dcard">
              <div class="dc-h">📈 빛 센서 값 <span>아날로그 0~1023</span></div>
              <div class="cds-readout"><b id="cds-num">—</b><span class="cds-state" id="cds-state">연결 대기</span></div>
              <div class="cds-bar"><div class="cds-bar-fill" id="cds-bar"></div></div>
              <p class="cds-tip">손으로 센서를 가리면 값이 <b>뚝</b> 떨어져요! 🖐️</p>
            </div>
            <div class="dcard" id="cds-sim-card">
              <div class="dc-h">🔦 빛 시뮬 <span>연결 안 했을 때 체험</span></div>
              <input type="range" id="cds-sim" min="0" max="1023" value="760">
            </div>
            <button class="dbtn ghost dc-conn" id="dc-conn">${board.connected ? '🔌 보드 연결됨 ✓' : '🔌 보드 연결(실물 CDS)'}</button>
            <div class="dc-status" id="dc-status">${board.connected ? '센서 위에서 손을 움직여봐! 🖐️' : '연결하면 실제 빛 값이 실시간으로 보여요. (안 해도 슬라이더로 체험)'}</div>
          </div>
        </div>`;
      const fill = bodyEl.querySelector('#cds-fill'), num = bodyEl.querySelector('#cds-num'), stEl = bodyEl.querySelector('#cds-state');
      const bar = bodyEl.querySelector('#cds-bar'), sim = bodyEl.querySelector('#cds-sim'), simCard = bodyEl.querySelector('#cds-sim-card');
      const status = bodyEl.querySelector('#dc-status');
      function paint(v) {
        if (v == null) { num.textContent = '—'; stEl.textContent = '읽는 중…'; return; }
        const pct = Math.max(0, Math.min(100, Math.round(v / 1023 * 100)));
        num.textContent = v; fill.style.height = pct + '%'; bar.style.width = pct + '%';
        stEl.textContent = v < 300 ? '어두움 🌑' : v > 720 ? '밝음 ☀️' : '보통 🌤️';
        stEl.className = 'cds-state ' + (v < 300 ? 'dark' : v > 720 ? 'bright' : 'mid');
      }
      function startPoll() {
        stopCdsPoll(); simCard.hidden = board.connected;
        if (!board.connected) { paint(+sim.value); return; }
        cdsTimer = setInterval(async () => { const val = await board.analogRead(CH); if (val != null) paint(val); }, 240);
      }
      sim.oninput = () => { if (!board.connected) paint(+sim.value); };
      startPoll();
      const connBtn = bodyEl.querySelector('#dc-conn');
      connBtn.onclick = async () => {
        if (board.connected) return; status.textContent = '연결 중… 포트를 골라주세요 🔌';
        try { await board.connect(); connBtn.textContent = '🔌 보드 연결됨 ✓'; status.textContent = '센서 위에서 손을 움직여봐! 🖐️'; startPoll(); }
        catch (e) { status.textContent = board.classify(e).note; }
      };
      if (stateUnsub) stateUnsub();
      stateUnsub = board.onState(() => {
        const c = board.connected;
        connBtn.textContent = c ? '🔌 보드 연결됨 ✓' : '🔌 보드 연결(실물 CDS)';
        if (!c) { status.textContent = '보드 연결이 끊겼어요 — 슬라이더로 체험하거나 다시 연결!'; }
        startPoll();
      });
    }

    // 조이스틱 조종 모니터: 드래그(또는 실물)로 X·Y·방향 실시간 표시
    function renderJoystick() {
      showEddie('조이스틱을 드래그(또는 실물 연결)해봐! X·Y 값과 방향이 실시간으로 🕹️');
      const P = cfg.pins;
      bodyEl.innerHTML = `
        <div class="dash joy-dash">
          <div class="dash-led">
            <div class="joy-mon" id="joy-mon"><div class="joy-cx"></div><div class="joy-cy"></div><div class="joy-dot" id="joy-dot"></div></div>
            <div class="dl-pin">🕹️ 드래그해서 원리를 익히고, 실물을 연결해 꺾어봐<br><span>(디지털 포트 D5·D6 — 꺾은 방향을 또렷이 읽어요)</span></div>
          </div>
          <div class="dash-cards">
            <div class="dcard">
              <div class="dc-h">📈 조이스틱 값 <span>0~1023 · 중앙 512</span></div>
              <div class="joy-read"><span>X <b id="joy-x">512</b></span><span>Y <b id="joy-y">512</b></span><span class="joy-dir" id="joy-dir">● 중앙</span></div>
            </div>
            <button class="dbtn ghost dc-conn" id="dc-conn">${board.connected ? '🔌 보드 연결됨 ✓' : '🔌 보드 연결(실물 조이스틱)'}</button>
            <div class="dc-status" id="dc-status">${board.connected ? '실물 조이스틱을 움직여봐! 🕹️' : '드래그로 체험하거나, 연결하면 실물 값이 보여요.'}</div>
          </div>
        </div>`;
      const mon = bodyEl.querySelector('#joy-mon'), dot = bodyEl.querySelector('#joy-dot');
      const xEl = bodyEl.querySelector('#joy-x'), yEl = bodyEl.querySelector('#joy-y'), dirEl = bodyEl.querySelector('#joy-dir');
      const status = bodyEl.querySelector('#dc-status');
      function show(nx, ny) {
        xEl.textContent = Math.round(512 + nx * 511); yEl.textContent = Math.round(512 + ny * 511);
        dot.style.left = (50 + nx * 44) + '%'; dot.style.top = (50 + ny * 44) + '%';
        const mag = Math.hypot(nx, ny);
        if (mag <= 0.3) { dirEl.textContent = '● 중앙'; }
        else { const dirs = ['→ 오른쪽', '↘ 우하', '↓ 아래', '↙ 좌하', '← 왼쪽', '↖ 좌상', '↑ 위', '↗ 우상']; dirEl.textContent = dirs[(Math.round(Math.atan2(ny, nx) / (Math.PI / 4)) + 8) % 8]; }
      }
      show(0, 0);
      let dragId = null;
      const drag = (e) => { if (dragId !== e.pointerId) return; const r = mon.getBoundingClientRect(); let nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2); let ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2); const m = Math.hypot(nx, ny); if (m > 1) { nx /= m; ny /= m; } show(nx, ny); };
      mon.addEventListener('pointerdown', (e) => { e.preventDefault(); if (board.connected) return; dragId = e.pointerId; try { mon.setPointerCapture(e.pointerId); } catch (_) {} drag(e); });
      mon.addEventListener('pointermove', drag);
      const end = (e) => { if (dragId !== e.pointerId) return; dragId = null; if (!board.connected) show(0, 0); };
      mon.addEventListener('pointerup', end); mon.addEventListener('pointercancel', end);
      // 디지털 포트(D5·D6·D7) 폴링: 꺾은 방향만 또렷이 읽힌다(중앙은 떨림 → 다수결로 중립).
      // 중앙 보정: 쉬는 값(보통 한쪽으로 굳음)을 기준으로 잡고, 그와 다르게 꺾일 때만 방향 인정.
      const ringX = [], ringY = [], RING = 5; let xRest = null, yRest = null, hx = 0, hy = 0;
      const una = (ring) => { if (ring.length < RING) return null; const a = ring[0]; for (const v of ring) if (v !== a) return null; return a; };
      function startPoll() {
        stopJoyPoll(); if (!board.connected) return;
        ringX.length = 0; ringY.length = 0; xRest = null; yRest = null; hx = 0; hy = 0;
        joyTimer = setInterval(async () => {
          const [vx, vy] = await Promise.all([board.digitalRead(P.x), board.digitalRead(P.y)]);
          if (vx != null) { ringX.push(vx); if (ringX.length > RING) ringX.shift(); const s = una(ringX); if (s != null) { if (xRest === null) xRest = s; hx = s === xRest ? 0 : (xRest ? -1 : 1); } }
          if (vy != null) { ringY.push(vy); if (ringY.length > RING) ringY.shift(); const s = una(ringY); if (s != null) { if (yRest === null) yRest = s; hy = s === yRest ? 0 : (yRest ? -1 : 1); } }
          show(hx, -hy);   // 화면 Y 반전: 위로 꺾으면 위로
        }, 70);
      }
      startPoll();
      const connBtn = bodyEl.querySelector('#dc-conn');
      connBtn.onclick = async () => { if (board.connected) return; status.textContent = '연결 중… 포트를 골라주세요 🔌'; try { await board.connect(); connBtn.textContent = '🔌 보드 연결됨 ✓'; status.textContent = '실물 조이스틱을 움직여봐! 🕹️'; startPoll(); } catch (e) { status.textContent = board.classify(e).note; } };
      if (stateUnsub) stateUnsub();
      stateUnsub = board.onState(() => { const c = board.connected; connBtn.textContent = c ? '🔌 보드 연결됨 ✓' : '🔌 보드 연결(실물 조이스틱)'; startPoll(); if (!c) show(0, 0); });
    }

    // 초음파 거리 모니터: 손을 가까이/멀리 → 거리(cm) 실시간. 연결 전엔 마우스 상하로 체험.
    function renderUltra() {
      showEddie('센서 앞에 손을 가까이/멀리 해봐! 거리(cm)가 실시간으로 📡 (연결 안 하면 마우스로 체험)');
      const P = cfg.pins, NEAR = 5, FAR = 40, cl = (v) => Math.max(NEAR, Math.min(FAR, v));
      bodyEl.innerHTML = `
        <div class="dash joy-dash">
          <div class="dash-led">
            <div class="ult-mon" id="ult-mon"><div class="ult-fill" id="ult-fill"></div><div class="ult-hand" id="ult-hand">🖐️</div></div>
            <div class="dl-pin">📡 소리를 쏘고 메아리가 오는 시간으로 거리를 재요<br><span>(Trig=D4 펄스 → Echo=D3 폭 측정)</span></div>
          </div>
          <div class="dash-cards">
            <div class="dcard">
              <div class="dc-h">📏 거리 <span>가까울수록 작은 cm</span></div>
              <div class="joy-read"><span class="joy-dir" id="ult-cm">— cm</span></div>
            </div>
            <button class="dbtn ghost dc-conn" id="dc-conn">${board.connected ? '🔌 보드 연결됨 ✓' : '🔌 보드 연결(실물 센서)'}</button>
            <div class="dc-status" id="dc-status">${board.connected ? '센서 앞에 손을 움직여봐! 📡' : '마우스를 위/아래로 움직여 체험하거나, 연결하면 실제 거리가 보여요.'}</div>
          </div>
        </div>`;
      const mon = bodyEl.querySelector('#ult-mon'), fill = bodyEl.querySelector('#ult-fill'), hand = bodyEl.querySelector('#ult-hand'), cmEl = bodyEl.querySelector('#ult-cm'), status = bodyEl.querySelector('#dc-status');
      const show = (cm) => { const c = cl(cm), p = (c - NEAR) / (FAR - NEAR); fill.style.height = Math.round((1 - p) * 100) + '%'; hand.style.top = Math.round(p * 100) + '%'; cmEl.textContent = Math.round(cm) + ' cm'; };
      show(20);
      let dragId = null;
      const drag = (e) => { if (board.connected) return; const r = mon.getBoundingClientRect(); const p = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)); show(NEAR + p * (FAR - NEAR)); };
      mon.addEventListener('pointerdown', (e) => { e.preventDefault(); if (board.connected) return; dragId = e.pointerId; try { mon.setPointerCapture(e.pointerId); } catch (_) {} drag(e); });
      mon.addEventListener('pointermove', (e) => { if (dragId === e.pointerId || e.pointerType === 'mouse') drag(e); });
      function fwWarn() {
        if (!(board.connected && board.fwOutdated)) return false;
        status.innerHTML = `⚠️ 보드 펌웨어가 옛날 버전(v${board.version})이라 거리를 못 읽어요. 아래 버튼으로 업데이트하면 실제 거리가 보여요. (지금은 마우스로 체험)
          <div style="margin-top:6px"><button class="dbtn ghost" id="ult-flash">🔧 펌웨어 업데이트 (약 10초)</button> <b id="ult-fstat"></b></div>`;
        const fb = status.querySelector('#ult-flash'), fstat = status.querySelector('#ult-fstat');
        fb.onclick = async () => {
          fb.disabled = true; stopJoyPoll(); fstat.textContent = ' 시작…';
          try {
            const r = await board.flash({ onProgress: (d, t) => { fstat.textContent = ` 굽는 중… ${Math.round(d / t * 100)}%`; }, onLog: (m) => { fstat.textContent = ' ' + m; } });
            if (r.ok && !board.fwOutdated) { status.innerHTML = '✅ 펌웨어 업데이트 완료! 센서 앞에서 손을 움직여봐 📡'; startPoll(); }
            else { fstat.textContent = ' 다 구웠는데 응답 확인 필요 — 케이블 확인 후 다시.'; fb.disabled = false; }
          } catch (e) { fstat.textContent = ' 실패: ' + (e?.message ?? e); fb.disabled = false; }
        };
        return true;
      }
      function startPoll() { stopJoyPoll(); if (!board.connected) return; if (fwWarn()) return; joyTimer = setInterval(async () => { const cm = await board.readUltrasonic({ trig: P.trig, echo: P.echo }); if (cm != null && cm > 0) show(cm); }, 120); }
      startPoll();
      const connBtn = bodyEl.querySelector('#dc-conn');
      connBtn.onclick = async () => { if (board.connected) return; status.textContent = '연결 중… 포트를 골라주세요 🔌'; try { await board.connect(); connBtn.textContent = '🔌 보드 연결됨 ✓'; status.textContent = '센서 앞에 손을 움직여봐! 📡'; startPoll(); } catch (e) { status.textContent = board.classify(e).note; } };
      if (stateUnsub) stateUnsub();
      stateUnsub = board.onState(() => { const c = board.connected; connBtn.textContent = c ? '🔌 보드 연결됨 ✓' : '🔌 보드 연결(실물 센서)'; startPoll(); });
    }

    // 버튼 입력 모니터: 버튼을 누르면 램프 ON. 연결 전엔 화면 버튼을 눌러 체험.
    function renderButton() {
      showEddie('버튼을 눌러봐! 누름(1)/안 누름(0)이 또렷하게 바뀌어요 🔘 (보드 없으면 화면 버튼으로 체험)');
      const P = cfg.pins, pins = [P.b1, P.b2];
      bodyEl.innerHTML = `
        <div class="dash joy-dash">
          <div class="dash-led">
            <div class="btn-lamps" id="btn-lamps">${[1, 2].map((n) => `<button class="btn-lamp" data-i="${n - 1}"><span></span><em>${n}</em></button>`).join('')}</div>
            <div class="dl-pin">🔘 버튼을 누르면 그 핀이 <b>0 ↔ 1</b>로 바뀌어요<br><span>(버튼1=D4·포트3 · 버튼2=D5·포트4, 디지털 입력)</span></div>
          </div>
          <div class="dash-cards">
            <div class="dcard"><div class="dc-h">📟 입력 상태 <span>눌림 = 1(ON)</span></div>
              <div class="joy-read"><span>1 <b id="bs0">0</b></span><span>2 <b id="bs1">0</b></span></div></div>
            <button class="dbtn ghost dc-conn" id="dc-conn">${board.connected ? '🔌 보드 연결됨 ✓' : '🔌 보드 연결(실물 버튼)'}</button>
            <div class="dc-status" id="dc-status">${board.connected ? '버튼을 눌러봐! 🔘' : '화면 버튼을 누르거나, 연결하면 실물 버튼이 켜져요.'}</div>
          </div>
        </div>`;
      const lamps = [...bodyEl.querySelectorAll('.btn-lamp')], readEls = [0, 1].map((i) => bodyEl.querySelector('#bs' + i)), status = bodyEl.querySelector('#dc-status');
      const setLamp = (i, on) => { lamps[i].classList.toggle('on', on); readEls[i].textContent = on ? 1 : 0; };
      lamps.forEach((l, i) => { const d = (e) => { if (board.connected) return; e.preventDefault(); setLamp(i, true); }, u = () => { if (board.connected) return; setLamp(i, false); }; l.addEventListener('pointerdown', d); l.addEventListener('pointerup', u); l.addEventListener('pointerleave', u); });
      const rings = [[], []], rest = [null, null], RING = 4;
      const un = (r) => { if (r.length < RING) return null; const a = r[0]; for (const v of r) if (v !== a) return null; return a; };
      function startPoll() {
        stopJoyPoll(); if (!board.connected) return; for (let i = 0; i < 2; i++) { rings[i].length = 0; rest[i] = null; }
        joyTimer = setInterval(async () => {
          const vals = await Promise.all(pins.map((p) => board.digitalRead(p)));
          for (let i = 0; i < 2; i++) { const v = vals[i]; if (v == null) continue; const r = rings[i]; r.push(v); if (r.length > RING) r.shift(); const s = un(r); if (s == null) continue; if (rest[i] === null) rest[i] = s; setLamp(i, s !== rest[i]); }
        }, 60);
      }
      startPoll();
      const connBtn = bodyEl.querySelector('#dc-conn');
      connBtn.onclick = async () => { if (board.connected) return; status.textContent = '연결 중… 포트를 골라주세요 🔌'; try { await board.connect(); connBtn.textContent = '🔌 보드 연결됨 ✓'; status.textContent = '버튼을 눌러봐! 🔘'; startPoll(); } catch (e) { status.textContent = board.classify(e).note; } };
      if (stateUnsub) stateUnsub();
      stateUnsub = board.onState(() => { const c = board.connected; connBtn.textContent = c ? '🔌 보드 연결됨 ✓' : '🔌 보드 연결(실물 버튼)'; startPoll(); });
    }

    // 자료: 큰 슬라이드 + 흰 박스 밖(여백)의 EDDIE가 설명
    function renderInfo() {
      if (stateUnsub) { stateUnsub(); stateUnsub = null; }
      if (cfg.animTheory) { renderAnim(); return; }
      ew.hidden = false;
      if (!INFO.length) { ew.hidden = true; bodyEl.innerHTML = `<p class="sr-tbody" style="text-align:center;padding:50px">자료 이미지를 준비 중이에요.</p>`; return; }
      bodyEl.innerHTML = `
        <div class="tv-slider">
          <button class="tv-arrow" id="tv-prev">◀</button>
          <div class="tv-stage" id="tv-stage"></div>
          <button class="tv-arrow" id="tv-next">▶</button>
        </div>
        <div class="tv-dots">${INFO.map((_, i) => `<i class="${i === ci ? 'on' : ''}" data-i="${i}"></i>`).join('')}</div>`;
      const stage = bodyEl.querySelector('#tv-stage');
      const show = () => {
        stage.style.backgroundImage = `url(${INFO[ci]})`;
        bodyEl.querySelectorAll('.tv-dots i').forEach((d, i) => d.classList.toggle('on', i === ci));
        bub.innerHTML = `🤖 ${CAPS[ci] || '좌우로 넘겨봐!'}`; bub.classList.remove('pop'); void bub.offsetWidth; bub.classList.add('pop');
      };
      show();
      const go = (d) => { sfx.hover(); ci = (ci + d + INFO.length) % INFO.length; show(); };
      bodyEl.querySelector('#tv-prev').onclick = () => go(-1);
      bodyEl.querySelector('#tv-next').onclick = () => go(1);
      bodyEl.querySelectorAll('.tv-dots i').forEach((d) => d.onclick = () => { ci = +d.dataset.i; show(); });
    }

    // LED 제어 대시보드: 디지털(ON/OFF) + 깜빡임 (D13은 디지털 전용 — 아날로그 없음)
    function renderControl() {
      showEddie('버튼으로 LED를 켜고 꺼봐! 빠르게 깜빡이게도 할 수 있어 💡');
      bodyEl.innerHTML = `
        <div class="dash">
          <div class="dash-led">
            <div class="dl-bulb" id="dl-bulb"><span>LED</span></div>
            <div class="dl-state" id="dl-state">상태 · OFF (LOW)</div>
            <div class="dl-pin">💡 테스트: <b>13번 핀</b>에 LED 연결<br><span>(보드에도 13번 LED 내장 — 결선 없이 바로!)</span></div>
          </div>
          <div class="dash-cards">
            <div class="dcard">
              <div class="dc-h">🔌 디지털 제어 <span>HIGH / LOW</span></div>
              <div class="dc-btns"><button class="dbtn on" id="d-on">켜기 ON</button><button class="dbtn off" id="d-off">끄기 OFF</button></div>
            </div>
            <div class="dcard">
              <div class="dc-h">⏱️ 깜빡임 <span>속도 <b id="b-spd">0.4초</b></span></div>
              <div class="dc-row"><button class="dbtn ghost" id="b-toggle">▶ 깜빡이기</button><input type="range" id="b-range" min="120" max="1000" step="20" value="400"></div>
            </div>
            <button class="dbtn ghost dc-conn" id="dc-conn">${board.connected ? '🔌 보드 연결됨 ✓' : '🔌 보드 연결(실물 LED)'}</button>
            <div class="dc-status" id="dc-status">${board.connected ? '버튼으로 실제 13번 LED를 제어해봐!' : '연결하면 실제 LED도 제어돼요. (안 해도 화면으로 체험)'}</div>
          </div>
        </div>`;
      const bulb = bodyEl.querySelector('#dl-bulb'), stateEl = bodyEl.querySelector('#dl-state');
      const bRange = bodyEl.querySelector('#b-range'), bSpd = bodyEl.querySelector('#b-spd'), bTog = bodyEl.querySelector('#b-toggle');
      const status = bodyEl.querySelector('#dc-status');
      function send(o) { try { if (board.connected) board.digital(cfg.blockPin, o).catch(() => {}); } catch (_) {} }
      function paint(o) { bulb.classList.toggle('on', o); stateEl.textContent = o ? '상태 · ON (HIGH)' : '상태 · OFF (LOW)'; }
      const delayLabel = () => bSpd.textContent = (+bRange.value / 1000).toFixed(1) + '초';
      const dOn = bodyEl.querySelector('#d-on'), dOff = bodyEl.querySelector('#d-off');
      function setLed(o, doSend) { ledOn = o; paint(o); dOn.classList.toggle('active', o); dOff.classList.toggle('active', !o); if (doSend) send(o); }
      // 핸들러를 먼저 바인딩(혹시 paint/초기화가 실패해도 클릭은 살아있게)
      dOn.onclick = () => { try { sfx.ok(); } catch (_) {} stopBlink(); setLed(true, true); };
      dOff.onclick = () => { try { sfx.pop(); } catch (_) {} stopBlink(); setLed(false, true); };
      bRange.oninput = () => { delayLabel(); if (blinkOn) startBlink(); };
      bTog.onclick = () => { if (blinkOn) { try { sfx.pop(); } catch (_) {} stopBlink(); paint(ledOn); send(ledOn); } else { try { sfx.click(); } catch (_) {} startBlink(); } };
      setLed(ledOn, false); delayLabel();
      console.log('[Playino] LED 제어 준비 완료 ✓ (최신 코드)');
      function startBlink() {
        stopBlink(); blinkOn = true; bTog.textContent = '⏹ 멈추기';
        let o = true; paint(true); send(true);
        blink = setInterval(() => { o = !o; paint(o); send(o); }, +bRange.value);
        status.textContent = '깜빡이는 중! 속도 슬라이더를 바꿔봐 🎚️';
      }
      const connBtn = bodyEl.querySelector('#dc-conn');
      connBtn.onclick = async () => {
        if (board.connected) return; status.textContent = '연결 중… 포트를 골라주세요 🔌';
        try { await board.connect(); connBtn.textContent = '🔌 보드 연결됨 ✓'; status.textContent = '버튼으로 실제 13번 LED를 제어해봐!'; }
        catch (e) { status.textContent = board.classify(e).note; }
      };
      // 보드 상태 실시간 반영(케이블 분리 등) — 통일된 board 상태 구독
      if (stateUnsub) stateUnsub();
      stateUnsub = board.onState(() => {
        const c = board.connected;
        connBtn.textContent = c ? '🔌 보드 연결됨 ✓' : '🔌 보드 연결(실물 LED)';
        if (!c) { stopBlink(); setLed(false, false); status.textContent = '보드 연결이 끊겼어요 — 다시 [보드 연결]을 눌러줘'; }
      });
    }

    function stopBlink() { if (blink) { clearInterval(blink); blink = null; } blinkOn = false; const tg = bodyEl.querySelector('#b-toggle'); if (tg) tg.textContent = '▶ 깜빡이기'; }

    renderTab();
  }
}

// ───────── LED 이론 애니메이션(코드로 직접) ─────────
function ledTheory() {
  return [
    { // ① 원리: 전자(−)+정공(+) 만나 빛
      html: `<div class="ba la1">
        <div class="la-field">
          <div class="la-p e">e⁻<em>전자</em></div>
          <div class="la-center"><div class="la-flash"></div><div class="la-bulb on"></div></div>
          <div class="la-p h">h⁺<em>정공</em></div>
        </div>
        <div class="ba-flow">전자(−)와 정공(+)이 <b>만나면</b> → 빛이 ‘짠!’ 하고 나와요 ✨</div>
      </div>` },
    { // ② 디지털 출력 HIGH/LOW
      html: `<div class="ba la2">
        <div class="la-sig"><span class="la-high">1 · HIGH</span><span class="la-low">0 · LOW</span></div>
        <div class="la-bulb la-blink"></div>
        <div class="ba-flow"><b>디지털 출력</b> — 1(HIGH)이면 켜지고, 0(LOW)이면 꺼져요!</div>
      </div>` },
    { // ③ 색 = 빛 에너지(파장)
      html: `<div class="ba la3">
        <div class="la-bulbs"><span class="la-cb g"></span><span class="la-cb y"></span><span class="la-cb r"></span></div>
        <div class="la-names"><i>초록</i><i>노랑</i><i>빨강</i></div>
        <div class="ba-flow">색마다 <b>빛 에너지(파장)</b>가 달라서 다른 색으로 빛나요! 🌈</div>
      </div>` },
  ];
}

// ───────── RGB 이론 애니메이션(코드로 직접) ─────────
function rgbTheory() {
  return [
    { // ① 빛의 삼원색 — 겹치면 밝아짐(가산혼합)
      html: `<div class="ba rt1">
        <div class="rt-venn"><span class="rc r"></span><span class="rc g"></span><span class="rc b"></span></div>
        <div class="ba-flow">빨강·초록·파랑 <b>빛</b>을 겹치면 → 가운데는 <b>하양</b>! 빛은 섞을수록 <b>밝아져요</b> ✨</div>
      </div>` },
    { // ② PWM 색 혼합 — 인터랙티브 슬라이더
      html: `<div class="ba rt2">
        <div class="rt-mix"><div class="rt-sw" id="rsw"></div><div class="rt-val"><b id="rhex">#FFFFFF</b><span id="rrgb">R255 · G255 · B255</span></div></div>
        <div class="rt-sliders">
          <label class="rs r">R <input type="range" id="sr" min="0" max="255" value="255"><b id="vr">255</b></label>
          <label class="rs g">G <input type="range" id="sg" min="0" max="255" value="200"><b id="vg">200</b></label>
          <label class="rs b">B <input type="range" id="sb" min="0" max="255" value="60"><b id="vb">60</b></label>
        </div>
        <div class="ba-flow"><b>PWM</b>으로 각 색 밝기(0~255)를 조절 → 슬라이더를 움직여 색을 만들어봐! 🎚️</div>
      </div>`,
      init: (stage) => {
        const sr = stage.querySelector('#sr'), sg = stage.querySelector('#sg'), sb = stage.querySelector('#sb');
        const sw = stage.querySelector('#rsw'), hex = stage.querySelector('#rhex'), rgb = stage.querySelector('#rrgb');
        const vr = stage.querySelector('#vr'), vg = stage.querySelector('#vg'), vb = stage.querySelector('#vb');
        const h = (n) => (+n).toString(16).padStart(2, '0').toUpperCase();
        const upd = () => {
          const r = +sr.value, g = +sg.value, b = +sb.value;
          sw.style.background = `rgb(${r},${g},${b})`; hex.textContent = '#' + h(r) + h(g) + h(b);
          rgb.textContent = `R${r} · G${g} · B${b}`; vr.textContent = r; vg.textContent = g; vb.textContent = b;
        };
        [sr, sg, sb].forEach((s) => s.oninput = upd); upd();
      } },
    { // ③ 활용 — 화면·조명
      html: `<div class="ba rt3"><div class="rt-uses">
        <div class="rt-use u-shake"><span>📱</span>폰 화면</div>
        <div class="rt-use u-swing"><span>📺</span>TV·모니터</div>
        <div class="rt-use u-bounce"><span>💡</span>무드등</div>
        <div class="rt-use u-beep"><span>🎮</span>게임 조명</div>
      </div>
      <div class="ba-flow">화면 속 모든 색은 <b>작은 RGB 픽셀</b>들이 만들어요 — 우리 눈엔 하나의 색으로 보여요! 🌈</div></div>` },
  ];
}

// ───────── 조도센서(CDS) 이론 애니메이션(코드로 직접) ─────────
function cdsTheory() {
  return [
    { // ① 빛 ↔ 저항
      html: `<div class="ba ct1">
        <div class="ct-scene">
          <div class="ct-sun">☀️</div>
          <div class="ct-beam"></div>
          <div class="ct-cds"><span class="ct-cell"></span><em>CDS</em></div>
          <div class="ct-hand">🖐️</div>
        </div>
        <div class="ba-flow">빛이 많으면 <b>저항↓</b> (전기 쑥쑥) · 손으로 가리면 <b>저항↑</b> (전기 막힘)</div>
      </div>` },
    { // ② 아날로그 0~1023 (인터랙티브)
      html: `<div class="ba ct2">
        <div class="ct-meter"><div class="ct-meter-fill" id="ctf"></div></div>
        <div class="ct-read"><b id="ctv">760</b> <span id="cts">밝음 ☀️</span></div>
        <div class="ct-slider"><span>🌑</span><input type="range" id="ctl" min="0" max="1023" value="760"><span>☀️</span></div>
        <div class="ba-flow">빛의 양을 <b>0~1023</b> 숫자로 읽어요 — 밝으면 큰 값, 어두우면 작은 값! 📈</div>
      </div>`,
      init: (stage) => {
        const l = stage.querySelector('#ctl'), f = stage.querySelector('#ctf'), v = stage.querySelector('#ctv'), s = stage.querySelector('#cts');
        const upd = () => { const n = +l.value, pct = Math.round(n / 1023 * 100); f.style.width = pct + '%'; v.textContent = n; s.textContent = n < 300 ? '어두움 🌑' : n > 720 ? '밝음 ☀️' : '보통 🌤️'; };
        l.oninput = upd; upd();
      } },
    { // ③ 활용
      html: `<div class="ba ct3"><div class="rt-uses">
        <div class="rt-use u-shake"><span>🌃</span>자동 가로등</div>
        <div class="rt-use u-bounce"><span>📱</span>화면 밝기</div>
        <div class="rt-use u-swing"><span>🌅</span>스마트 커튼</div>
        <div class="rt-use u-beep"><span>🚨</span>침입 감지</div>
      </div><div class="ba-flow">어두워지면 <b>자동으로</b> 켜고, 밝아지면 꺼요 💡</div></div>` },
  ];
}

// ───────── 가변저항 이론 애니메이션(코드로 직접) ─────────
function potTheory() {
  return [
    { // ① 원리: 돌린 만큼 저항이 변함
      html: `<div class="ba">
        <div style="font-size:46px;letter-spacing:8px;margin:8px 0 4px">🎚️ ⟳ 〜 📈</div>
        <div class="ba-flow">가변저항은 다이얼을 <b>돌린 만큼 저항</b>이 바뀌어요 — 그래서 값이 <b>조금씩</b> 변해요. 버튼(0/1)과 달리 <b>중간 값</b>도 다 있어요! 🎚️</div>
      </div>` },
    { // ② 아날로그 0~1023 (인터랙티브 볼륨)
      html: `<div class="ba">
        <div class="ct-meter"><div class="ct-meter-fill" id="ptf"></div></div>
        <div class="ct-read">볼륨 <b id="ptv">500</b> <span id="pts">🔉 보통</span></div>
        <div class="ct-slider"><span>🔈 0</span><input type="range" id="ptl" min="0" max="1023" value="500"><span>1023 🔊</span></div>
        <div class="ba-flow">다이얼을 돌리면 <b>0~1023</b> 숫자가 부드럽게 변해요 — 작게 돌리면 작은 값, 끝까지 돌리면 큰 값! 📈</div>
      </div>`,
      init: (stage) => {
        const l = stage.querySelector('#ptl'), f = stage.querySelector('#ptf'), v = stage.querySelector('#ptv'), s = stage.querySelector('#pts');
        const upd = () => { const n = +l.value, pct = Math.round(n / 1023 * 100); f.style.width = pct + '%'; v.textContent = n; s.textContent = n < 300 ? '🔈 작게' : n > 720 ? '🔊 크게' : '🔉 보통'; };
        l.oninput = upd; upd();
      } },
    { // ③ 활용
      html: `<div class="ba"><div class="rt-uses">
        <div class="rt-use u-bounce"><span>🔊</span>볼륨 조절</div>
        <div class="rt-use u-shake"><span>💡</span>밝기 다이얼</div>
        <div class="rt-use u-swing"><span>🌀</span>선풍기 세기</div>
        <div class="rt-use u-beep"><span>🎛️</span>믹서·이퀄라이저</div>
      </div><div class="ba-flow">"얼마나?"를 정하는 건 모두 아날로그! 다이얼로 <b>세기를 조절</b>해요 🎚️</div></div>` },
  ];
}

// ───────── 조이스틱 이론 애니메이션(코드로 직접) ─────────
function joystickTheory() {
  return [
    { // ① 2축
      html: `<div class="ba jt1">
        <div class="jt-pad"><span class="jt-ax jt-ax-x"></span><span class="jt-ax jt-ax-y"></span><span class="jt-knob"></span></div>
        <div class="ba-flow">조이스틱은 <b>X(좌우)</b>와 <b>Y(상하)</b> 두 값을 <b>동시에</b> 읽어요 — 2축 입력! 🕹️</div>
      </div>` },
    { // ② 중심 512
      html: `<div class="ba jt2">
        <div class="jt-bar"><b class="jt-t0">0</b><b class="jt-tm">512</b><b class="jt-t1">1023</b><span class="jt-marker"></span></div>
        <div class="ba-flow">가만히 두면 <b>가운데(≈512)</b>, 밀면 <b>0 또는 1023</b> — 값의 변화가 곧 <b>방향</b>!</div>
      </div>` },
    { // ③ 활용
      html: `<div class="ba jt3"><div class="rt-uses">
        <div class="rt-use u-bounce"><span>🚀</span>우주선 조종</div>
        <div class="rt-use u-swing"><span>🤖</span>로봇 팔</div>
        <div class="rt-use u-shake"><span>🎮</span>게임 컨트롤</div>
        <div class="rt-use u-beep"><span>🚁</span>드론</div>
      </div><div class="ba-flow">스틱을 밀면 그 방향으로 — 무엇이든 <b>조종</b>할 수 있어요! 🚀</div></div>` },
  ];
}

// ───────── 초음파 이론 애니메이션(코드로 직접) ─────────
function ultraTheory() {
  return [
    { // ① 원리: 소리 쏘고 → 메아리 듣기
      html: `<div class="ba">
        <div style="font-size:46px;letter-spacing:10px;margin:8px 0 4px">📡 〰️〰️〰️ 🖐️</div>
        <div class="ba-flow">초음파 센서는 사람이 못 듣는 <b>높은 소리</b>를 쏘고, 손·벽에 부딪혀 <b>돌아오는 메아리</b>를 들어요 📡</div>
      </div>` },
    { // ② 시간 → 거리 (인터랙티브)
      html: `<div class="ba">
        <div class="ct-meter"><div class="ct-meter-fill" id="utf"></div></div>
        <div class="ct-read">거리 <b id="utv">20</b> cm</div>
        <div class="ct-slider"><span>가까이 🖐️</span><input type="range" id="utl" min="3" max="40" value="20"><span>멀리</span></div>
        <div class="ba-flow">소리가 <b>갔다 오는 시간 ÷ 2</b> 로 거리 계산! 가까우면 메아리가 <b>빨리</b>, 멀면 <b>늦게</b> 돌아와요 ⏱️</div>
      </div>`,
      init: (stage) => {
        const l = stage.querySelector('#utl'), f = stage.querySelector('#utf'), v = stage.querySelector('#utv');
        const upd = () => { const n = +l.value; v.textContent = n; f.style.width = Math.round((n - 3) / 37 * 100) + '%'; };
        l.oninput = upd; upd();
      } },
    { // ③ 활용
      html: `<div class="ba"><div class="rt-uses">
        <div class="rt-use u-bounce"><span>🚗</span>주차 센서</div>
        <div class="rt-use u-shake"><span>🤖</span>로봇 장애물</div>
        <div class="rt-use u-swing"><span>🚪</span>자동문</div>
        <div class="rt-use u-beep"><span>📏</span>키 재기</div>
      </div><div class="ba-flow">거리를 숫자로 아니까 <b>부딪히기 전에</b> 멈추고, 열고, 재요! 🤖</div></div>` },
  ];
}

// ───────── 버튼 이론 애니메이션(코드로 직접) ─────────
function buttonTheory() {
  return [
    { // ① 0/1 디지털
      html: `<div class="ba">
        <div style="font-size:44px;letter-spacing:6px;margin:6px 0">🔘 → <b style="color:#7fd6a0">1</b> / <b style="color:#ff9a9a">0</b></div>
        <div class="ba-flow">버튼은 <b>누름(1)</b> · <b>안 누름(0)</b> 두 값만 있는 <b>디지털 입력</b>이에요 — 켜짐/꺼짐! 🔘</div>
      </div>` },
    { // ② 눌러보기(인터랙티브)
      html: `<div class="ba">
        <button id="bth" class="bth-btn">여기를 꾹 눌러봐 🔘</button>
        <div class="ct-read">지금 상태 <b id="bthv">0</b></div>
        <div class="ba-flow">누르는 순간 또렷하게 <b>0 ↔ 1</b>로 바뀌어요 — 이 변화를 읽어 반응! ⚡</div>
      </div>`,
      init: (stage) => {
        const b = stage.querySelector('#bth'), v = stage.querySelector('#bthv');
        const set = (s) => { v.textContent = s; b.classList.toggle('on', !!s); };
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); set(1); sfx.note(560, 80); });
        b.addEventListener('pointerup', () => set(0)); b.addEventListener('pointerleave', () => set(0)); set(0);
      } },
    { // ③ 활용
      html: `<div class="ba"><div class="rt-uses">
        <div class="rt-use u-bounce"><span>⌨️</span>키보드</div>
        <div class="rt-use u-shake"><span>🎮</span>게임 패드</div>
        <div class="rt-use u-swing"><span>🛗</span>엘리베이터</div>
        <div class="rt-use u-beep"><span>🔔</span>초인종</div>
      </div><div class="ba-flow">누름 신호 하나로 <b>명령</b>을 전해요 — 세상은 버튼투성이! 🎮</div></div>` },
  ];
}

// ───────── 부저 이론 애니메이션(코드로 직접) ─────────
function buzzerTheory() {
  return [
    { // ① 원리: 전기 → 판 떨림 → 음파 → 소리
      html: `<div class="ba ba1">
        <div class="ba-stage">
          <div class="ba-batt">🔋<em>전기</em></div>
          <div class="ba-wire"><i></i><i></i><i></i><i></i></div>
          <div class="ba-piezo"><div class="ba-disc"></div><span class="ba-ring"></span><span class="ba-ring r2"></span><span class="ba-ring r3"></span></div>
          <div class="ba-ear">👂<em>소리!</em></div>
        </div>
        <div class="ba-flow">전기 →&nbsp; <b>판이 빠르게 떨림(진동)</b> &nbsp;→ 공기 흔들림(음파) → 소리</div>
      </div>`,
    },
    { // ② 주파수 = 음 높이 (인터랙티브 파형 + 소리)
      html: `<div class="ba ba2">
        <canvas id="bw" width="680" height="210"></canvas>
        <div class="ba-freqrow"><span class="ba-note" id="bn">미</span> · <b id="bf">330</b> Hz</div>
        <div class="ba-ctrl"><span class="ba-lo">낮은 음</span><input type="range" id="bfreq" min="200" max="780" value="330"><span class="ba-hi">높은 음</span><button class="dbtn ghost" id="bplay">▶ 들어보기</button></div>
      </div>`,
      init: (stage, setRaf) => {
        const cv = stage.querySelector('#bw'), ctx = cv.getContext('2d');
        const range = stage.querySelector('#bfreq'), bf = stage.querySelector('#bf'), bn = stage.querySelector('#bn');
        const N = [[262, '도'], [294, '레'], [330, '미'], [349, '파'], [392, '솔'], [440, '라'], [494, '시'], [523, '도↑']];
        const nameOf = (f) => N.reduce((a, b) => Math.abs(b[0] - f) < Math.abs(a[0] - f) ? b : a)[1];
        let phase = 0;
        const upd = () => { bf.textContent = range.value; bn.textContent = nameOf(+range.value); };
        range.oninput = upd; upd();
        stage.querySelector('#bplay').onclick = () => sfx.note(+range.value, 520);
        const loop = () => {
          const f = +range.value, W = cv.width, H = cv.height;
          ctx.clearRect(0, 0, W, H);
          ctx.strokeStyle = 'rgba(120,190,140,.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
          const waves = f / 70, amp = H * 0.32;
          ctx.strokeStyle = '#36a96a'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.beginPath();
          for (let x = 0; x <= W; x += 3) { const y = H / 2 - Math.sin((x / W) * Math.PI * 2 * waves + phase) * amp; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
          ctx.stroke();
          phase += f * 0.00045;
          setRaf(requestAnimationFrame(loop));
        };
        loop();
      },
    },
    { // ③ 활용
      html: `<div class="ba ba3"><div class="ba-uses">
        <div class="ba-use u-shake"><span>⏰</span>알람 시계</div>
        <div class="ba-use u-swing"><span>🔔</span>초인종</div>
        <div class="ba-use u-bounce"><span>🎵</span>멜로디</div>
        <div class="ba-use u-beep"><span>📟</span>알림음</div>
      </div></div>`,
    },
  ];
}

// ───────── 그리기 ─────────
function drawRoom(ctx, st, stations, cfg, VW, VH, roomBg) {
  const t = st?.t || 0, activeId = st?.activeTrigger?.id;
  if (roomBg && roomBg.complete && roomBg.naturalWidth) {
    drawCover(ctx, roomBg, VW, VH);
    ctx.fillStyle = 'rgba(20,12,30,0.06)'; ctx.fillRect(0, 0, VW, VH);
  } else {
    const wall = ctx.createLinearGradient(0, 0, 0, VH * 0.4); wall.addColorStop(0, '#f6ead6'); wall.addColorStop(1, '#ecd8bf');
    ctx.fillStyle = wall; ctx.fillRect(0, 0, VW, VH * 0.4);
    const fl = ctx.createLinearGradient(0, VH * 0.4, 0, VH); fl.addColorStop(0, '#e7cfa6'); fl.addColorStop(1, '#d6b585');
    ctx.fillStyle = fl; ctx.fillRect(0, VH * 0.4, VW, VH * 0.6);
    ctx.strokeStyle = 'rgba(120,90,50,0.16)'; ctx.lineWidth = 2;
    for (let y = VH * 0.45; y < VH; y += 48) { ctx.beginPath(); ctx.moveTo(16, y); ctx.lineTo(VW - 16, y); ctx.stroke(); }
    bunting(ctx, VW, t);
  }
  // 문 쪽 빛 기둥(좌/우 끝) — 가까이 갈수록 환해지는 입구 연출
  const px = st?.player ? st.player.x : VW / 2;
  doorGlow(ctx, VW * 0.05, VH, cfg.signL, 1 - Math.min(1, px / (VW * 0.32)));
  doorGlow(ctx, VW * 0.95, VH, cfg.signR, 1 - Math.min(1, (VW - px) / (VW * 0.32)));
  for (const s of stations) drawSign(ctx, s, s.id === activeId, t);
}

function doorGlow(ctx, x, VH, acc, k) {
  if (k <= 0.02) return;
  const g = ctx.createLinearGradient(x, 0, x, VH); g.addColorStop(0, `rgba(${acc},${0.35 * k})`); g.addColorStop(1, `rgba(${acc},0)`);
  ctx.fillStyle = g; ctx.fillRect(x - 90, 0, 180, VH);
}

// 둥근 사각형 path
function signRR(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// 이론관/체험관 사인 이미지(있으면 사용). 없으면 아래 캔버스 마퀴로 폴백.
const SIGN_IMG = { theory: new Image(), play: new Image() };
SIGN_IMG.theory.src = '/brand/sign-theory.webp';
SIGN_IMG.play.src = '/brand/sign-play.webp';
function signArrow(ctx, cx, by, dir, acc, active, t, halfW) {
  const ax = cx + dir * (halfW + 6) + dir * Math.abs(Math.sin(t * 0.16)) * 6, ay = by;
  ctx.save(); if (active) { ctx.shadowColor = `rgba(${acc},0.95)`; ctx.shadowBlur = 20; }
  ctx.fillStyle = `rgb(${acc})`; ctx.beginPath(); ctx.arc(ax, ay, 20, 0, 6.283); ctx.fill(); ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(ax, ay, 20, 0, 6.283); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '900 22px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(dir > 0 ? '▶' : '◀', ax, ay + 1); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
}

// 입구 안내 — (이미지 있으면 이미지) / 없으면 아케이드 마퀴 캔버스 + 방향 뱃지. 역할 색 고정.
function drawSign(ctx, s, active, t) {
  const dir = s.dir, cx = s.cx;
  const acc = s.id === 'play' ? '80,205,140' : '90,180,255';   // 체험관=초록 / 이론관=파랑 (모든 방 동일)
  const bob = Math.sin(t * 0.1 + (dir > 0 ? 1 : 0)) * (active ? 5 : 2.5);
  const by = s.signY + bob, baseY = s.postY;
  const bw = 234, bh = 94, top = by - bh / 2, left = cx - bw / 2;

  // 바닥 소프트 그림자
  ctx.save();
  ctx.fillStyle = `rgba(40,28,52,${active ? 0.2 : 0.13})`;
  ctx.beginPath(); ctx.ellipse(cx, baseY, active ? 100 : 84, active ? 22 : 17, 0, 0, 6.283); ctx.fill();
  ctx.restore();

  // 이미지 사인(빈 마퀴 판)이 준비돼 있으면 그 위에 글자를 또렷하게 얹는다
  const im = SIGN_IMG[s.id];
  if (im && im.complete && im.naturalWidth) {
    const iw = 268, ih = iw * (im.naturalHeight / im.naturalWidth);
    ctx.save(); if (active) { ctx.shadowColor = `rgba(${acc},0.6)`; ctx.shadowBlur = 28; ctx.shadowOffsetY = 6; }
    ctx.drawImage(im, cx - iw / 2, by - ih / 2, iw, ih); ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#27233a'; ctx.font = '900 28px "Space Grotesk", sans-serif'; ctx.fillText(`${s.icon} ${s.label}`, cx, by + 4);
    ctx.fillStyle = 'rgba(35,31,52,0.78)'; ctx.font = '800 14px "Space Grotesk", sans-serif'; ctx.fillText(s.sub, cx, by + 26);
    ctx.textAlign = 'start';
    signArrow(ctx, cx, by, dir, acc, active, t, iw / 2);
    return;
  }

  // 본체(흰 카드) + 드롭섀도/글로우
  ctx.save();
  ctx.shadowColor = active ? `rgba(${acc},0.6)` : 'rgba(30,20,42,0.3)';
  ctx.shadowBlur = active ? 30 : 18; ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#fff'; signRR(ctx, left, top, bw, bh, 20); ctx.fill();
  ctx.restore();
  // 상단 컬러 밴드(아이콘+이름을 흰 글씨로 — 고대비) + 글로시
  const bandH = bh * 0.6;
  ctx.save(); signRR(ctx, left, top, bw, bh, 20); ctx.clip();
  ctx.fillStyle = `rgb(${acc})`; ctx.fillRect(left, top, bw, bandH);
  const gl = ctx.createLinearGradient(0, top, 0, top + bandH);
  gl.addColorStop(0, 'rgba(255,255,255,0.38)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl; ctx.fillRect(left, top, bw, bandH);
  ctx.restore();
  // 컬러 테두리
  ctx.strokeStyle = `rgb(${acc})`; ctx.lineWidth = 3; signRR(ctx, left + 1.5, top + 1.5, bw - 3, bh - 3, 18); ctx.stroke();

  // 텍스트: 밴드=흰 굵게(아이콘+이름) / 하단=진한 부제
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff'; ctx.font = '900 27px "Space Grotesk", sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
  ctx.fillText(`${s.icon} ${s.label}`, cx, top + bandH * 0.5 + 10); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#3a3450'; ctx.font = '800 14px "Space Grotesk", sans-serif';
  ctx.fillText(s.sub, cx, top + bandH + (bh - bandH) * 0.5 + 5);

  // 방향 뱃지(문 쪽 원형 + 셰브론, 통통 튐)
  const ax = cx + dir * (bw / 2 + 22) + dir * Math.abs(Math.sin(t * 0.16)) * 6, ay = by;
  ctx.save();
  if (active) { ctx.shadowColor = `rgba(${acc},0.95)`; ctx.shadowBlur = 20; }
  ctx.fillStyle = `rgb(${acc})`; ctx.beginPath(); ctx.arc(ax, ay, 20, 0, 6.283); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(ax, ay, 20, 0, 6.283); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '900 22px "Space Grotesk", sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillText(dir > 0 ? '▶' : '◀', ax, ay + 1);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
}
function arrowBoard(ctx, cx, cy, w, h, dir) {
  const x = cx - w / 2, y = cy - h / 2, n = 26;
  ctx.beginPath();
  if (dir > 0) { ctx.moveTo(x, y); ctx.lineTo(x + w - n, y); ctx.lineTo(x + w, cy); ctx.lineTo(x + w - n, y + h); ctx.lineTo(x, y + h); }
  else { ctx.moveTo(x + w, y); ctx.lineTo(x + n, y); ctx.lineTo(x, cy); ctx.lineTo(x + n, y + h); ctx.lineTo(x + w, y + h); }
  ctx.closePath();
}
function drawCover(ctx, img, W, H) { const ir = img.naturalWidth / img.naturalHeight, r = W / H; let dw, dh; if (ir > r) { dh = H; dw = H * ir; } else { dw = W; dh = W / ir; } ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh); }
function bunting(ctx, W, t) {
  ctx.save(); ctx.strokeStyle = 'rgba(90,60,40,0.4)'; ctx.lineWidth = 2;
  ctx.beginPath(); for (let x = 0; x <= W; x += 8) ctx.lineTo(x, 16 + Math.sin(x / 90) * 10); ctx.stroke();
  const cols = ['#ff6b6b', '#ffd24a', '#5ad17a', '#6fb7ff', '#b18bff'];
  for (let i = 0, x = 34; x < W; x += 64, i++) {
    const y = 24 + Math.sin(x / 90) * 10, tw = 0.45 + 0.35 * Math.sin(t * 0.1 + i);
    ctx.fillStyle = `rgba(255,240,180,${tw})`; ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.283); ctx.fill();
    ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 6.283); ctx.fill();
  }
  ctx.restore();
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
