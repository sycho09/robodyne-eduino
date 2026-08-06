// dht11.js — DHT-11 온습도 학습 + 미니게임 "EDDIE의 쾌적 지키기"
// 메인: 온도/습도 확인. 더울 때/추울 때 이벤트가 터지고, 알맞은 행동으로 쾌적 구간을 유지.
// (실물 DHT11 읽기는 펌웨어 확장 예정 — 현재 값은 시뮬레이션)

import eddieSvg from '../assets/eddie.svg?raw';

const T_LO = 18, T_HI = 26, H_LO = 40, H_HI = 60;   // 쾌적 구간
const GAME_SEC = 45;

const EVENTS = [
  { msg: '☀️ 한낮 햇볕이 들어와요! 더워져요', t: 2.2, h: -0.6 },
  { msg: '❄️ 창문이 열렸어요. 추워져요', t: -2.2, h: 0.2 },
  { msg: '🌧️ 비가 내려 습해져요', t: -0.8, h: 2.6 },
  { msg: '🔥 난로 과열! 온도 급상승', t: 3.0, h: -1.4 },
  { msg: '🏜️ 건조 주의보, 습도가 떨어져요', t: 0.8, h: -2.6 },
];

export function showDht11(root, { onQuit } = {}) {
  const st = { temp: 24, hum: 50, score: 0, time: GAME_SEC, ev: null, evLeft: 0, running: false };
  let timer = null;

  root.innerHTML = `
    <div class="dht scene-fade">
      <header class="app-header">
        <div class="brand"><span class="brand-dot"></span><strong>Eduino AI</strong><span class="brand-sep">:</span><b class="brand-sub">DHT-11 온습도</b><span class="crumb">미니게임</span></div>
        <button class="btn btn-sm" id="dht-exit">⏹ 그만두기</button>
      </header>
      <div class="dht-wrap" id="wrap"></div>
      <div class="dht-sim">※ 미니게임 값은 조작용 시뮬레이션 (모니터링 방은 실물 연동)</div>
    </div>`;

  root.querySelector('#dht-exit').onclick = () => { clearInterval(timer); onQuit?.(); };
  const wrap = root.querySelector('#wrap');

  intro();

  function intro() {
    wrap.innerHTML = `
      <div class="dht-eddie">${eddieSvg}</div>
      <div class="room-card" style="max-width:520px;text-align:center">
        <h2>🌡️ EDDIE의 쾌적 지키기</h2>
        <p>DHT-11 로 <b>온도·습도</b>를 확인해요. 햇볕·비·한파 같은 사건이 터지면
           <b>난방/냉방/환기/가습</b>으로 <b>쾌적 구간</b>(온도 ${T_LO}~${T_HI}℃, 습도 ${H_LO}~${H_HI}%)을 ${GAME_SEC}초간 지켜줘!</p>
      </div>
      <button class="btn primary lg" id="dht-start">게임 시작 ▶</button>`;
    root.querySelector('#dht-start').onclick = start;
  }

  function start() {
    st.running = true;
    wrap.innerHTML = `
      <div class="dht-eddie">${eddieSvg}</div>
      <div class="dht-status" id="dht-status">😀</div>
      <div class="dht-meta">
        <div>남은 시간 <b id="dht-time">${GAME_SEC}</b>s</div>
        <div>쾌적 점수 <b id="dht-score">0</b></div>
        <div id="dht-comfort" class="dht-comfort ok">쾌적 😊</div>
      </div>
      <div class="dht-gauges">
        <div class="dht-gauge"><div class="g-label">온도</div><div class="g-val"><span id="g-temp">24</span>℃</div>
          <div class="dht-bar"><div id="bar-temp"></div></div><div class="dht-zone">쾌적 ${T_LO}~${T_HI}℃</div></div>
        <div class="dht-gauge"><div class="g-label">습도</div><div class="g-val"><span id="g-hum">50</span>%</div>
          <div class="dht-bar"><div id="bar-hum"></div></div><div class="dht-zone">쾌적 ${H_LO}~${H_HI}%</div></div>
      </div>
      <div class="dht-event" id="dht-event">버튼으로 환경을 조절해 쾌적하게!</div>
      <div class="dht-actions">
        <button class="btn dht-act" id="a-heat">🔥 난방</button>
        <button class="btn dht-act" id="a-cool">❄️ 냉방</button>
        <button class="btn dht-act" id="a-vent">💨 환기</button>
        <button class="btn dht-act" id="a-humid">💧 가습</button>
      </div>`;
    root.querySelector('#a-heat').onclick = () => act(3, 0);
    root.querySelector('#a-cool').onclick = () => act(-3, 0);
    root.querySelector('#a-vent').onclick = () => act(-1, -4);
    root.querySelector('#a-humid').onclick = () => act(0, 4);
    render();
    timer = setInterval(tick, 1000);
  }

  function act(dt, dh) { if (!st.running) return; st.temp = clamp(st.temp + dt, 0, 45); st.hum = clamp(st.hum + dh, 0, 100); render(); }

  function tick() {
    // 이벤트 발생/지속
    if (st.evLeft > 0) { st.temp += st.ev.t; st.hum += st.ev.h; st.evLeft--; }
    else if (Math.random() < 0.45) { st.ev = EVENTS[Math.floor(Math.random() * EVENTS.length)]; st.evLeft = 4; evMsg(st.ev.msg); }
    // 미세 드리프트
    st.temp += (Math.random() - 0.5) * 0.6;
    st.hum += (Math.random() - 0.5) * 1.0;
    st.temp = clamp(st.temp, 0, 45); st.hum = clamp(st.hum, 0, 100);

    if (comfy()) st.score += 1;
    st.time -= 1;
    render();
    if (st.time <= 0) end();
  }

  const comfy = () => st.temp >= T_LO && st.temp <= T_HI && st.hum >= H_LO && st.hum <= H_HI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function statusFace() {
    if (comfy()) return '😀';
    if (st.temp > T_HI) return '🥵';
    if (st.temp < T_LO) return '🥶';
    if (st.hum > H_HI) return '💦';
    return '🏜️';
  }

  function render() {
    set('#g-temp', Math.round(st.temp)); set('#g-hum', Math.round(st.hum));
    set('#dht-time', st.time); set('#dht-score', st.score); set('#dht-status', statusFace());
    bar('#bar-temp', st.temp / 45, st.temp > T_HI ? '#ff6b6b' : st.temp < T_LO ? '#6fb7ff' : '#3ddc91');
    bar('#bar-hum', st.hum / 100, st.hum > H_HI ? '#6fb7ff' : st.hum < H_LO ? '#ffb020' : '#3ddc91');
    const c = root.querySelector('#dht-comfort');
    if (c) { c.className = 'dht-comfort ' + (comfy() ? 'ok' : 'bad'); c.textContent = comfy() ? '쾌적 😊' : '불쾌 😣'; }
  }
  function bar(sel, ratio, color) { const el = root.querySelector(sel); if (el) { el.style.width = clamp(ratio * 100, 0, 100) + '%'; el.style.background = color; } }
  function set(sel, v) { const el = root.querySelector(sel); if (el) el.textContent = v; }
  let evT = null;
  function evMsg(m) { const el = root.querySelector('#dht-event'); if (!el) return; el.textContent = m; el.style.color = 'var(--accent-2)'; clearTimeout(evT); evT = setTimeout(() => { if (root.querySelector('#dht-event')) root.querySelector('#dht-event').textContent = '버튼으로 환경을 조절해 쾌적하게!'; }, 2600); }

  function end() {
    clearInterval(timer); st.running = false;
    const pct = Math.round((st.score / GAME_SEC) * 100);
    const grade = pct >= 85 ? 'S' : pct >= 70 ? 'A' : pct >= 50 ? 'B' : 'C';
    wrap.innerHTML = `
      <div class="dht-eddie">${eddieSvg}</div>
      <div class="room-card" style="max-width:480px;text-align:center">
        <h2>결과 · 등급 ${grade} 🎉</h2>
        <p>쾌적 점수 <b style="color:var(--accent-2)">${st.score} / ${GAME_SEC}</b> (${pct}%)<br/>
           온습도 변화에 맞춰 환경을 조절했어요! 이게 바로 센서 값에 따라 반응하는 <b>스마트홈</b>의 원리예요.</p>
        <div class="btn-row" style="justify-content:center">
          <button class="btn primary" id="dht-again">다시 도전 ▶</button>
          <button class="btn" id="dht-out">모니터링 방으로 ▶</button>
        </div>
      </div>`;
    root.querySelector('#dht-again').onclick = () => { st.temp = 24; st.hum = 50; st.score = 0; st.time = GAME_SEC; st.ev = null; st.evLeft = 0; start(); };
    root.querySelector('#dht-out').onclick = () => onQuit?.();
  }
}
