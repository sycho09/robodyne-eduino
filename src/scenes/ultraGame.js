// ultraGame.js — 무궁화 꽃이 피었습니다 (초음파 거리 센서 · GO존 방식)
// 손을 센서 앞 'GO존'(약 8~35cm)에 두면 EDDIE가 걷고, 손을 치우면(멀리/없음) 멈춘다.
//  · 🟢 초록불: GO존에 손을 두고 다가가기
//  · 🔴 빨간불: 손을 치워 '멈춰!' — 빨간불에 걷고 있으면(GO존) 술래에게 딱 걸린다 😱
// 거리를 '구간 안/밖(임계값+히스테리시스)'으로만 보므로 값이 튀어도 게임이 안정적이다.
// 보드/펌웨어가 없으면 마우스/스페이스/↑ '꾹 누르면 걷기'로 체험.
import { sfx } from '../app/sfx.js';
import { bgm } from '../app/bgm.js';
import { progress } from '../app/progress.js';
import { celebrateRoom } from './celebrate.js';
import { board } from '../app/board.js';

const PINS = { trig: 4, echo: 3 };
const GO_LO = 8, GO_HI = 35;     // GO존(cm): 이 안이면 걷기, 밖이면(너무 가깝거나 멀거나/없음) 멈춤
const TOP = 70;
const GAMES = [
  { key: 'easy', no: 1, name: '무궁화 꽃이 피었습니다', speed: 0.21, greenMin: 1.9, greenMax: 3.4, redMin: 1.3, redMax: 2.2, turn: 0.6, lives: 3 },
  { key: 'hard', no: 2, name: '두근두근 무궁화',        speed: 0.28, greenMin: 1.1, greenMax: 2.3, redMin: 1.3, redMax: 2.9, turn: 0.34, lives: 3 },
];

const bgImg = new Image(); bgImg.onerror = () => { if (!bgImg._p) { bgImg._p = 1; bgImg.src = '/brand/stage-ultra-bg.png'; } }; bgImg.src = '/brand/stage-ultra-bg.webp';
const heroImg = new Image(); heroImg.src = '/brand/eddie/eddie-hero.webp';
[bgImg, heroImg].forEach((im) => { im.decode && im.addEventListener('load', () => im.decode().catch(() => {})); });
const ready = (im) => im.complete && im.naturalWidth > 0;
const gradeOf = (a) => a >= 0.95 ? 'S' : a >= 0.85 ? 'A' : a >= 0.7 ? 'B' : a >= 0.5 ? 'C' : 'D';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

export function showUltraGame(root, { onExit } = {}) {
  root.innerHTML = `
    <div class="led scene-fade joygame ultragame">
      <div class="joy-stage-bg" id="ug-bg"></div>
      <div class="brand-badge"><span class="brand-dot"></span>Eduino&nbsp;<b>AI</b></div>
      <button class="snd-toggle" id="snd-toggle">${sfx.muted ? '🔇' : '🔊'}</button>
      <button class="bx-exit" id="ug-exit">✕ 전시관으로</button>
      <button class="bx-exit led-skip" id="ug-skip" hidden>⏭ 건너뛰기(테스트)</button>
      <div class="world-host" id="ug-host"></div>
      <div class="led-hud" id="ug-hud" hidden>
        <span class="lh-item" id="ug-stage">1단계</span>
        <span class="lh-item" id="ug-light">🟢 초록불</span>
        <span class="lh-item">❤️ <b id="ug-hp">3</b></span>
        <span class="lh-item" id="ug-dist">📡 —</span>
      </div>
      <div class="led-prep" id="ug-prep">
        <div class="prep-card" style="max-width:720px">
          <h2>🌸 무궁화 꽃이 피었습니다</h2>
          <p class="prep-sub">손을 센서 앞 <b>GO존(약 ${GO_LO}~${GO_HI}cm)</b>에 두면 EDDIE가 <b>걸어요</b>. 손을 치우면(멀리/없음) <b>멈춰요</b>. <b>🟢 초록불</b>엔 걷고, <b>🔴 빨간불</b>엔 손을 치워 멈춰요! 빨간불에 걷고 있으면 딱 걸려요 😱 (보드 없으면 마우스·스페이스 꾹 = 걷기)</p>
          <div class="prep-grid">
            <div class="prep-img" id="ug-wimg"><span class="prep-img-ph">📡 결선 사진</span></div>
            <div class="prep-side">
              <table class="prep-table">
                <thead><tr><th>HC-SR04</th><th>아두이노 (12번 포트)</th></tr></thead>
                <tbody>
                  <tr><td>Gnd</td><td>GND</td></tr>
                  <tr><td>Trig</td><td>D4</td></tr>
                  <tr><td>Echo</td><td>D3</td></tr>
                  <tr><td>Vcc</td><td>VCC(5V)</td></tr>
                </tbody>
              </table>
              <div class="prep-status" id="ug-pstat">손을 센서 앞 <b>${GO_LO}~${GO_HI}cm</b>에 대면 걷고, <b>치우면 멈춰요</b>! 빨간불엔 재빨리 손을 치우세요 📡</div>
            </div>
          </div>
          <div class="prep-actions" style="justify-content:center">
            <button class="prep-btn" id="ug-connect">🔌 보드 연결(선택)</button>
            <button class="cel-go" id="ug-start">결선 완료 · 시작 ▶</button>
          </div>
        </div>
      </div>
    </div>`;

  const scene = root.querySelector('.led');
  const bg = root.querySelector('#ug-bg');
  bgImg.onload = () => { bg.style.backgroundImage = `url(${bgImg.src})`; };
  if (ready(bgImg)) bg.style.backgroundImage = `url(${bgImg.src})`;
  const wImg = new Image();
  wImg.onload = () => { const e = root.querySelector('#ug-wimg'); if (e) { e.style.backgroundImage = `url(${wImg.src})`; e.classList.add('has-img'); } };
  wImg.onerror = () => { if (!wImg._p) { wImg._p = 1; wImg.src = '/brand/wiring-sr04.png'; } };
  wImg.src = '/brand/wiring-sr04.webp';
  const host = root.querySelector('#ug-host');
  const canvas = document.createElement('canvas'); canvas.className = 'world-canvas'; host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const snd = root.querySelector('#snd-toggle'); snd.onclick = () => { const m = sfx.toggle(); snd.textContent = m ? '🔇' : '🔊'; };
  root.querySelector('#ug-exit').onclick = () => { cleanup(); onExit?.(); };
  const elHp = root.querySelector('#ug-hp'), elStage = root.querySelector('#ug-stage'), elDist = root.querySelector('#ug-dist'), elLight = root.querySelector('#ug-light');
  const hud = root.querySelector('#ug-hud'), skipBtn = root.querySelector('#ug-skip');

  let W = 0, H = 0, bgGrad = null;
  function resize() {
    W = canvas.width = host.clientWidth || window.innerWidth; H = canvas.height = host.clientHeight || 600;
    bgGrad = ctx.createLinearGradient(0, 0, 0, H); bgGrad.addColorStop(0, '#aee3ff'); bgGrad.addColorStop(0.62, '#cdeeff'); bgGrad.addColorStop(0.63, '#cdeba0'); bgGrad.addColorStop(1, '#9fd277');
  }
  resize(); window.addEventListener('resize', resize);

  // ── 입력 ──
  const keys = new Set();
  const moveKeys = ['arrowup', 'w', ' '];
  const onKeyDown = (e) => { const k = e.key.toLowerCase(); if (moveKeys.includes(k)) { e.preventDefault(); keys.add(k); } };
  const onKeyUp = (e) => keys.delete(e.key.toLowerCase());
  window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp);
  let pointerDown = false;
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); pointerDown = true; });
  window.addEventListener('pointerup', () => { pointerDown = false; });
  const manualMoving = () => pointerDown || moveKeys.some((k) => keys.has(k));

  // 실물 초음파 폴링
  let hwTimer = null, hwCm = null, hwSmooth = null, hwAt = 0;
  function startHw() {
    stopHw(); if (!board.connected || board.fwOutdated) return;
    hwTimer = setInterval(async () => {
      const cm = await board.readUltrasonic({ trig: PINS.trig, echo: PINS.echo });
      if (cm != null && cm > 0) { hwSmooth = hwSmooth == null ? cm : hwSmooth + (cm - hwSmooth) * 0.45; hwCm = hwSmooth; hwAt = performance.now(); }
      else { hwCm = 999; hwAt = performance.now(); }   // 에코 없음 = 손 없음(멀리) → 멈춤
    }, 80);
  }
  function stopHw() { if (hwTimer) { clearInterval(hwTimer); hwTimer = null; } hwCm = null; hwSmooth = null; }
  const hwActive = () => hwCm != null && (performance.now() - hwAt) < 900;
  // GO존 판정(히스테리시스로 경계 떨림 방지)
  let inZone = false;
  function updateZone(cm) { if (inZone) { if (cm < GO_LO - 2 || cm > GO_HI + 3) inZone = false; } else { if (cm >= GO_LO && cm <= GO_HI) inZone = true; } }

  const pstat = root.querySelector('#ug-pstat');
  function fwCheck() {
    if (!(board.connected && board.fwOutdated)) return false;
    pstat.innerHTML = `⚠️ 보드 펌웨어가 옛날 버전(v${board.version})이라 초음파를 못 읽어요. 아래 버튼으로 업데이트하면 실제 거리로 동작! (지금도 마우스로 체험 가능)
      <div style="margin-top:8px"><button class="prep-btn" id="ug-flash">🔧 펌웨어 업데이트 (약 10초)</button> <b id="ug-fstat"></b></div>`;
    const fb = pstat.querySelector('#ug-flash'), fstat = pstat.querySelector('#ug-fstat');
    fb.onclick = async () => {
      fb.disabled = true; stopHw(); fstat.textContent = ' 시작…';
      try {
        const r = await board.flash({ onProgress: (d, t) => { fstat.textContent = ` 굽는 중… ${Math.round(d / t * 100)}%`; }, onLog: (m) => { fstat.textContent = ' ' + m; } });
        if (r.ok && !board.fwOutdated) { pstat.innerHTML = '✅ 펌웨어 업데이트 완료! 이제 센서 앞에 손을 두면 EDDIE가 걸어요 📡'; startHw(); }
        else { fstat.textContent = ' 다 구웠는데 응답 확인이 필요해요 — 케이블을 확인하고 다시.'; fb.disabled = false; }
      } catch (e) { fstat.textContent = ' 실패: ' + (e?.message ?? e); fb.disabled = false; }
    };
    return true;
  }
  root.querySelector('#ug-connect').onclick = async () => { const b = root.querySelector('#ug-connect'); try { await board.connect(); b.textContent = '🔌 연결됨 ✓'; startHw(); fwCheck(); } catch (e) { b.textContent = board.classify(e).note.slice(0, 16) + '…'; } };
  board.connectAuto().then(() => { startHw(); fwCheck(); }).catch(() => {});
  root.querySelector('#ug-start').onclick = () => { root.querySelector('#ug-prep').classList.add('hide'); skipBtn.hidden = false; startFlow(); };

  // ── 플로우 ──
  const cleared = { easy: false, hard: false };
  let gi = 0, game = GAMES[0];
  const state = { phase: 'prep', countT: 0, hp: 3, ended: false,
    progress: 0, moving: false, walkBob: 0,
    light: 'green', lightUntil: 0, caughtFrames: 0, graceUntil: 0,
    flash: 0, suleFace: 0, bubble: '' };
  const parts = [];
  let bubbleStr = '', bubbleW = 0;   // 말풍선 폭 캐시(매 프레임 measureText 회피)

  function panel(html) { const el = document.createElement('div'); el.className = 'led-panel'; el.innerHTML = `<div class="prep-card led-pcard">${html}</div>`; scene.appendChild(el); return el; }
  function startFlow() { gi = 0; nextGame(); }
  function nextGame() { if (gi >= GAMES.length) { finishAll(); return; } game = GAMES[gi]; showIntro(); }
  function showIntro() {
    bgm.setDuck(1); hud.hidden = true;
    const el = panel(`<div class="lp-no">${game.no} / ${GAMES.length} 단계</div><h2>🌸 ${game.name}</h2>
      <p class="prep-sub">손을 <b>GO존(${GO_LO}~${GO_HI}cm)</b>에 두면 걷고, 치우면 멈춰요. <b>🟢 초록불</b>엔 걸어 다가가고, <b>🔴 빨간불</b>엔 <b>손을 치워 멈춰요!</b> 걷다 들키면 ❤️ 하나 잃어요 😱<br>❤️ ${game.lives}개 — 술래(무궁화 꽃) 앞까지 가면 성공!</p>
      <p class="lp-cond">${game.no === 2 ? '빨간불이 더 자주·갑자기 와요. 손을 재빨리! ' : ''}끝까지 도착하면 통과 🏅</p><button class="cel-go" id="lp-go">시작 ▶</button>`);
    el.querySelector('#lp-go').onclick = () => { el.remove(); beginPlay(); };
  }
  function beginPlay() {
    bgm.setDuck(0); parts.length = 0; inZone = false;
    Object.assign(state, { phase: 'count', countT: performance.now(), hp: game.lives, ended: false,
      progress: 0, moving: false, walkBob: 0,
      light: 'green', lightUntil: performance.now() + rand(game.greenMin, game.greenMax) * 1000,
      caughtFrames: 0, graceUntil: 0, flash: 0, suleFace: 0, bubble: '무궁화 꽃이…' });
    elStage.textContent = `${game.no}단계 · ${game.name}`; elHp.textContent = state.hp;
    hud.hidden = false;
  }
  function showResult(grade, pass) {
    bgm.setDuck(1); const last = gi === GAMES.length - 1;
    const el = panel(`<div class="lp-grade lp-${grade}">${grade}<span>등급</span></div><h2>${pass ? '술래 앞 도착! 🎉' : '다 들켰다! 😵'}</h2>
      <p class="prep-sub">${game.name} · ❤️ ${state.hp} 남음</p>
      <p class="lp-cond">${pass ? (last ? '두 판 모두 클리어! 메달을 받자 🏅' : '다음 판으로 ▶') : '❤️를 다 잃었어요 — 다시 도전!'}</p>
      <button class="cel-go" id="lp-next">${pass ? (last ? '메달 받기 🏅' : '다음 판 ▶') : '다시 도전 ▶'}</button>`);
    el.querySelector('#lp-next').onclick = () => { el.remove(); if (pass) { cleared[game.key] = true; gi++; nextGame(); } else beginPlay(); };
  }
  function finishAll() {
    cleanup();
    if (cleared.easy && cleared.hard) { progress.mark('ultra'); celebrateRoom({ title: '무궁화 달인! 🌸', message: '초음파(거리)로 걷고 멈추며 술래를 따돌리고 도착했어요 — 🌸 무궁화 메달 획득!', exitLabel: '전시관으로 ▶', onExit: () => onExit?.() }); }
    else onExit?.();
  }
  skipBtn.onclick = () => { document.querySelectorAll('.led-panel').forEach((e) => e.remove()); cleared[game.key] = true; state.ended = true; state.phase = 'result'; bgm.setDuck(1); gi++; nextGame(); };
  function burst(x, y, c, n = 14) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = 1 + Math.random() * 4; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 36, color: c }); } }
  function endPlay(win) { if (state.ended) return; state.ended = true; state.phase = 'result'; showResult(win ? gradeOf(0.55 + state.hp / game.lives * 0.45) : 'D', win); }
  function caught() {
    state.hp--; elHp.textContent = state.hp; state.flash = 1; state.graceUntil = performance.now() + 1200; state.caughtFrames = 0;
    state.progress = Math.max(0, state.progress - 0.08); state.bubble = '딱 걸렸어! 😠'; state.suleFace = 2; sfx.no();
    burst(W * 0.5, H * 0.5, '255,120,120', 20);
    if (state.hp <= 0) endPlay(false);
  }
  function tickLight(now) {
    if (now < state.lightUntil) return;
    if (state.light === 'green') { state.light = 'turning'; state.lightUntil = now + game.turn * 1000; state.bubble = '…피었습니다'; }
    else if (state.light === 'turning') { state.light = 'red'; state.lightUntil = now + rand(game.redMin, game.redMax) * 1000; state.caughtFrames = 0; state.suleFace = 1; state.bubble = '꼼짝 마! 👀'; sfx.note(300, 130); }
    else { state.light = 'green'; state.lightUntil = now + rand(game.greenMin, game.greenMax) * 1000; state.suleFace = 0; state.bubble = '무궁화 꽃이…'; }
  }

  let lastT = performance.now();
  function update(dt) {
    const now = performance.now();
    if (state.phase === 'count') { if ((now - state.countT) / 1000 >= 3) state.phase = 'play'; }
    if (state.phase !== 'play' || state.ended) { if (state.flash > 0) state.flash = Math.max(0, state.flash - 0.05 * dt); return; }
    // moving 판정
    let moving;
    if (hwActive()) { updateZone(hwCm); moving = inZone; } else moving = manualMoving();
    state.moving = moving;
    tickLight(now);
    if (state.light !== 'red') { if (moving) { state.progress = Math.min(1, state.progress + game.speed * dt / 60); state.walkBob += dt; } }
    else if (now > state.graceUntil) { if (moving) { state.caughtFrames += dt; if (state.caughtFrames > 3) caught(); } else state.caughtFrames = 0; }
    if (state.flash > 0) state.flash = Math.max(0, state.flash - 0.05 * dt);
    if (state.progress >= 1) { burst(W * 0.78, H * 0.62, '120,230,160', 22); endPlay(true); return; }
  }

  function drawSule(x, y, s, now) {
    const facing = state.light === 'red' || state.light === 'turning';
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = '#3f9d52'; ctx.lineWidth = s * 0.12; ctx.beginPath(); ctx.moveTo(0, s * 0.9); ctx.lineTo(0, s * 0.2); ctx.stroke();
    ctx.fillStyle = facing ? '#ff7eb6' : '#e98bb6';
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * (Math.PI * 2 / 5); ctx.beginPath(); ctx.ellipse(Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.42, s * 0.3, s * 0.22, a, 0, 6.283); ctx.fill(); }
    ctx.fillStyle = facing ? '#ffd24a' : '#caa0c0'; ctx.beginPath(); ctx.arc(0, 0, s * 0.34, 0, 6.283); ctx.fill();
    if (facing) {
      ctx.fillStyle = '#222'; const eo = s * 0.12, er = s * 0.06 + (state.suleFace === 2 ? s * 0.02 : 0);
      ctx.beginPath(); ctx.arc(-eo, -s * 0.04, er, 0, 6.283); ctx.arc(eo, -s * 0.04, er, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#7a3'; ctx.lineWidth = s * 0.04; ctx.beginPath();
      if (state.suleFace === 2) ctx.arc(0, s * 0.16, s * 0.1, Math.PI, 0); else { ctx.moveTo(-s * 0.1, s * 0.12); ctx.lineTo(s * 0.1, s * 0.12); }
      ctx.stroke();
    } else { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = `${s * 0.4}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('🎵', 0, 0); }
    ctx.restore();
  }

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    if (!ready(bgImg)) { ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H); }
    else { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(0, 0, W, H); }
    const groundY = H * 0.74, startX = W * 0.12, finishX = W * 0.8;
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.setLineDash([10, 8]); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(finishX, groundY - 90); ctx.lineTo(finishX, groundY + 20); ctx.stroke(); ctx.setLineDash([]);
    if (state.phase !== 'prep') drawSule(finishX + W * 0.06, groundY - 60, Math.min(120, H * 0.18), now);
    ctx.fillStyle = 'rgba(0,0,0,.10)'; ctx.fillRect(startX, groundY + 30, finishX - startX, 6);
    // EDDIE
    const px = startX + state.progress * (finishX - startX);
    const bob = state.moving && state.phase === 'play' ? Math.sin(state.walkBob * 0.5) * 5 : 0;
    const blink = state.flash > 0 && Math.floor(now * 0.02) % 2 === 0;
    if (!blink) {
      const img = ready(heroImg) ? heroImg : null, hgt = Math.min(150, H * 0.26);
      if (img) { const w = hgt * (img.naturalWidth / img.naturalHeight); ctx.drawImage(img, px - w / 2, groundY - hgt + bob, w, hgt); }
      else { ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(px, groundY - 40 + bob, 30, 0, 6.283); ctx.fill(); }
    }
    // 신호등
    if (state.phase !== 'prep') {
      const lx = W / 2, ly = TOP + 16, on = state.light;
      ctx.fillStyle = 'rgba(20,24,34,.78)'; roundRect(ctx, lx - 96, ly - 14, 192, 40, 12); ctx.fill();
      ctx.fillStyle = on === 'red' ? '#ff5a5a' : 'rgba(120,40,40,.4)'; ctx.beginPath(); ctx.arc(lx - 68, ly + 6, 11, 0, 6.283); ctx.fill();
      ctx.fillStyle = on === 'turning' ? '#ffd24a' : 'rgba(120,100,40,.4)'; ctx.beginPath(); ctx.arc(lx - 40, ly + 6, 11, 0, 6.283); ctx.fill();
      ctx.fillStyle = on === 'green' ? '#5ade7a' : 'rgba(40,120,60,.4)'; ctx.beginPath(); ctx.arc(lx - 12, ly + 6, 11, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '700 14px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(on === 'red' ? '멈춰! 손 치워!' : on === 'turning' ? '돌아본다…' : '걸어! 다가가!', lx + 8, ly + 11);
    }
    // 말풍선
    if (state.phase === 'play' && state.bubble) {
      ctx.font = '700 18px sans-serif'; ctx.textAlign = 'center';
      if (state.bubble !== bubbleStr) { bubbleStr = state.bubble; bubbleW = ctx.measureText(state.bubble).width + 28; }
      const bw = bubbleW, bx = finishX + W * 0.06, by = groundY - 60 - Math.min(120, H * 0.18) - 18;
      ctx.fillStyle = 'rgba(20,24,34,.82)'; roundRect(ctx, bx - bw / 2, by - 22, bw, 32, 10); ctx.fill();
      ctx.fillStyle = state.light === 'red' ? '#ff9a9a' : '#fff'; ctx.fillText(state.bubble, bx, by);
    }
    if (state.light === 'red' && state.phase === 'play') { ctx.fillStyle = `rgba(255,40,40,${0.06 + (state.flash > 0 ? 0.18 * state.flash : 0)})`; ctx.fillRect(0, 0, W, H); }
    // 하단: 거리/GO존 인디케이터
    if (state.phase !== 'prep') drawZoneBar(startX, finishX);
    // 파티클
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--; ctx.globalAlpha = Math.max(0, p.life / 36); ctx.fillStyle = `rgb(${p.color})`; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1; if (p.life <= 0) parts.splice(i, 1); }
    if (state.phase === 'count') { const el = (now - state.countT) / 1000, n = 3 - Math.floor(el); ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 6; ctx.font = '900 90px "Space Grotesk",sans-serif'; ctx.textAlign = 'center'; const txt = n > 0 ? String(n) : '출발!'; ctx.strokeText(txt, W / 2, H * 0.5); ctx.fillText(txt, W / 2, H * 0.5); }
    if (!hud.hidden) { elDist.textContent = hwActive() ? (hwCm >= 999 ? '📡 없음' : `📡 ${Math.round(hwCm)}cm`) : (manualMoving() ? '🖱️ 걷기' : '🖱️ 멈춤'); elLight.textContent = state.light === 'red' ? '🔴 빨간불' : state.light === 'turning' ? '🟡 돌아본다' : '🟢 초록불'; }
  }

  // 거리 0~50cm 스케일 + GO존(초록 띠) + 현재 거리 마커. 손 안에 있으면 '걷는 중'.
  function drawZoneBar(startX, finishX) {
    const gx = startX, gw = finishX - startX, gy = H - 24, SC = 50;
    ctx.fillStyle = 'rgba(0,0,0,.16)'; roundRect(ctx, gx, gy, gw, 10, 5); ctx.fill();
    const zl = gx + GO_LO / SC * gw, zr = gx + GO_HI / SC * gw;
    ctx.fillStyle = state.light === 'red' ? 'rgba(255,90,90,.55)' : 'rgba(90,222,122,.6)'; roundRect(ctx, zl, gy, zr - zl, 10, 5); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.font = '700 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`GO존 ${GO_LO}~${GO_HI}cm (이 안=걷기)`, (zl + zr) / 2, gy - 6);
    if (hwActive() && hwCm < 999) { const mx = gx + clamp(hwCm, 0, SC) / SC * gw; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1a2330'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mx, gy + 5, 8, 0, 6.283); ctx.fill(); ctx.stroke(); }
    else if (!hwActive()) { ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillText(manualMoving() ? '🖱️/스페이스 꾹 = 걷는 중' : '떼면 멈춤', gx + gw, gy - 6); }
  }

  function loop(now) { const dt = Math.min(2.4, (now - lastT) / 16.67); lastT = now; update(dt); draw(now); raf = requestAnimationFrame(loop); }
  let raf = requestAnimationFrame(loop);
  function cleanup() { bgm.setDuck(1); cancelAnimationFrame(raf); stopHw(); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('resize', resize); }
}

function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
