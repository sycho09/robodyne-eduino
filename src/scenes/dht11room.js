// dht11room.js — DHT-11 학습방(컨텐츠 + 미션). 실시간 온습도 모니터링(반응형 배경)
// + 방 미션: 동그란 3개 구역(더움/추움/불쾌)에서 배터리 3개를 모으면 방 클리어.
// 게임(쾌적 지키기)은 가운데 [게임하기]로 별도 진행. ✎코드 수정 / 복도 나가기.

import { createWorld } from '../engine/topdown.js';
import { board } from '../app/board.js';
import { progress } from '../app/progress.js';
import { mountSay, eddieRandom } from '../app/eddieSay.js';
import { mountQuest } from '../app/quest.js';
import { celebrateRoom } from './celebrate.js';

const MAP_W = 960, MAP_H = 620;
// 실물 센서값을 직접 바꿔(따뜻하게/입김 등) 목표 달성 → 배터리 획득
const ZONES = {
  bat0: { x: 120, y: 224, w: 150, h: 150, cx: 195, cy: 299, name: '더움', icon: '🔥', color: '255,120,60', metric: 'temp', op: 'gte', target: 28, action: '센서를 손으로 감싸 따뜻하게 🤲' },
  bat1: { x: 405, y: 120, w: 150, h: 150, cx: 480, cy: 195, name: '시원', icon: '❄️', color: '90,160,255', metric: 'temp', op: 'lte', target: 23, action: '센서를 부채질해 시원하게 🌬️' },
  bat2: { x: 690, y: 224, w: 150, h: 150, cx: 765, cy: 299, name: '습함', icon: '💧', color: '120,110,235', metric: 'hum', op: 'gte', target: 68, action: '센서에 입김을 후~ 불기 😮‍💨' },
};
const PLAY = { x: 80, y: 446, w: 84, h: 84 };
const EXIT = { x: 448, y: MAP_H - 56, w: 64, h: 38 };

export function showDht11Room(root, { onPlay, onExit, onCode } = {}) {
  const cur = { temp: 24, hum: 50, real: false };
  const got = { bat0: false, bat1: false, bat2: false };
  let pollTimer = null, nullCount = 0, updating = false, simPhase = 0, cleared = progress.isCleared('dht11');

  root.innerHTML = `
    <div class="scene game-scene scene-fade">
      <div class="world-host" id="world-host"></div>
      <div class="hud-top">
        <div class="brand"><span class="brand-dot"></span><strong>Eduino AI</strong><span class="brand-sep">:</span><b class="brand-sub">DHT-11</b><span class="crumb">2. 모니터링 · 미션</span></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" id="rm-code">✎ 코드 수정</button>
          <button class="btn btn-sm" id="rm-exit">🚪 복도로</button>
        </div>
      </div>
      <div class="dht-hud" id="dht-hud">
        <div class="dh-item"><span class="dh-ic">🌡️</span><b id="dh-t">--</b>℃</div>
        <div class="dh-item"><span class="dh-ic">💧</span><b id="dh-h">--</b>%</div>
        <div class="dh-di" id="dh-di">불쾌지수 --</div>
        <div class="dh-mission" id="dh-mission">🔋 0 / 3</div>
        <div class="dh-src" id="dh-src">연결 확인 중…</div>
        <button class="btn btn-sm dh-update" id="dh-update" hidden>🔄 펌웨어 v2</button>
      </div>
      <div class="hud-hint" id="hud-hint"></div>
      <div class="hud-toast" id="hud-toast"></div>
      <div class="hud-narrate" id="hud-narrate"></div>
      <div class="hud-controls">⬆⬇⬅➡ 이동 · Space · 배터리 3개 모으기! · EDDIE 클릭</div>
    </div>`;

  const hintEl = root.querySelector('#hud-hint');
  const toastEl = root.querySelector('#hud-toast');
  const narrateEl = root.querySelector('#hud-narrate');
  const say = mountSay(root.querySelector('.game-scene'));
  root.querySelector('#rm-exit').onclick = () => { cleanup(); onExit?.(); };
  root.querySelector('#rm-code').onclick = () => { cleanup(); onCode?.(); };

  const map = {
    width: MAP_W, height: MAP_H, bg: '#0a1422',
    spawn: { x: 480, y: 540 },
    walls: [
      { x: 0, y: 0, w: MAP_W, h: 24 }, { x: 0, y: MAP_H - 24, w: MAP_W, h: 24 },
      { x: 0, y: 0, w: 24, h: MAP_H }, { x: MAP_W - 24, y: 0, w: 24, h: MAP_H },
      { x: 360, y: 40, w: 240, h: 34 },
    ],
    triggers: [
      ...Object.entries(ZONES).map(([id, z]) => ({ id, x: z.x, y: z.y, w: z.w, h: z.h })),
      { id: 'play', ...PLAY }, { id: 'exit', ...EXIT },
    ],
    draw: (ctx) => drawRoom(ctx, got, cleared),
  };

  const world = createWorld(root.querySelector('#world-host'), map, {
    onEddieClick: (x, y) => say(eddieRandom(), x, y),
    onInteract: (id) => {
      if (id === 'play') { cleanup(); onPlay?.(); }
      else if (id === 'exit') { cleanup(); onExit?.(); }
      else if (ZONES[id]) collect(id);
    },
    onFrame: (st) => {
      const tr = st.activeTrigger;
      if (!tr) { hintEl.classList.remove('show'); return; }
      if (tr.id === 'play') hintEl.innerHTML = '🎮 Space · 게임하기 (쾌적 지키기)';
      else if (tr.id === 'exit') hintEl.innerHTML = '🚪 Space · 복도로';
      else if (ZONES[tr.id]) hintEl.innerHTML = got[tr.id] ? `${ZONES[tr.id].name} 배터리 — 획득함 ✅` : `🔋 Space · ${ZONES[tr.id].icon} ${ZONES[tr.id].name} 구역 미션`;
      hintEl.classList.add('show');
    },
    onDrawOverlay: (ctx, st, canvas) => {  // 중립 비네트(깊이감) — 온도색 아님
      const g = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.46, canvas.height * 0.38, canvas.width / 2, canvas.height * 0.5, canvas.height * 0.92);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    },
  });

  setTimeout(() => narrate('동그란 3개 구역에서 배터리를 모아 미션을 클리어하자! 🔋'), 400);

  // 퀘스트 패널 + 입장 미션 안내(LED처럼 명확히)
  const quest = mountQuest(root.querySelector('.game-scene'), {
    title: 'DHT-11 방 미션', subtitle: `배터리 ${Object.values(got).filter(Boolean).length} / 3`,
    objectives: [
      { text: '🔥 더움 구역 (센서 온도↑)', done: false },
      { text: '❄️ 시원 구역 (센서 온도↓)', done: false },
      { text: '💧 습함 구역 (센서 습도↑)', done: false },
    ],
  });
  world.pause();
  {
    const m = document.createElement('div'); m.className = 'modal-backdrop';
    m.innerHTML = `<div class="modal"><h3>🔋 방 미션 안내</h3>
      <p>상단에서 <b>실시간 온습도</b>를 확인할 수 있어요.<br/>
      방 안 <b>3개 구역</b>(🔥더움·❄️시원·💧습함)에서 <b>실물 센서를 직접 조작</b>(손으로 따뜻하게·입김 등)해
      목표를 달성하면 <b>배터리</b>를 얻어요. 3개 모두 모으면 <b>방 클리어</b>!<br/>
      가운데 <b>[게임하기]</b>로 '쾌적 지키기' 게임도 따로 즐길 수 있어요.</p>
      <div class="modal-actions"><button class="btn primary" id="ms-go">미션 시작 ▶</button></div></div>`;
    document.body.appendChild(m);
    m.querySelector('#ms-go').onclick = () => { m.remove(); world.resume(); };
  }

  // 줍기 = 실물 센서값을 직접 바꿔 목표 달성해야 획득
  function collect(id) {
    if (got[id]) { toast(`${ZONES[id].name} 배터리는 이미 가졌어요`); return; }
    const z = ZONES[id];
    const unit = z.metric === 'temp' ? '℃' : '%';
    const opTxt = z.op === 'gte' ? '이상' : '이하';
    world.pause();
    const m = document.createElement('div'); m.className = 'modal-backdrop';
    m.innerHTML = `<div class="modal"><h3>${z.icon} ${z.name} 구역 미션</h3>
      <p>실물 센서를 직접 조작하는 미션! <b>${z.action}</b><br/>
      ${z.metric === 'temp' ? '온도' : '습도'}를 <b>${z.target}${unit} ${opTxt}</b>로 만들면 배터리를 줍습니다.</p>
      <div class="chal-temp">현재 <b id="chal-v">--</b>${unit} <span class="chal-target">목표 ${z.op === 'gte' ? '≥' : '≤'} ${z.target}${unit}</span></div>
      <div class="chal-bar"><div id="chal-fill"></div></div>
      <p class="muted" id="chal-note">센서값 읽는 중…</p>
      <div class="modal-actions"><button class="btn" id="chal-giveup">포기</button></div></div>`;
    document.body.appendChild(m);
    const vEl = m.querySelector('#chal-v'), fill = m.querySelector('#chal-fill'), note = m.querySelector('#chal-note');
    let done = false;
    const iv = setInterval(() => {
      const val = z.metric === 'temp' ? cur.temp : cur.hum;
      const max = z.metric === 'temp' ? 45 : 100;
      vEl.textContent = Math.round(val);
      const ok = z.op === 'gte' ? val >= z.target : val <= z.target;
      fill.style.width = clamp(val / max * 100, 0, 100) + '%';
      fill.style.background = ok ? '#3ddc91' : `rgba(${z.color},0.95)`;
      note.textContent = cur.real ? '● 실시간 센서값을 읽고 있어요' : '○ 시뮬레이션(센서 없이도 값이 변해요)';
      if (ok && !done) { done = true; clearInterval(iv); note.textContent = '성공! 🎉'; setTimeout(() => { m.remove(); world.resume(); doCollect(id); }, 350); }
    }, 300);
    m.querySelector('#chal-giveup').onclick = () => { clearInterval(iv); m.remove(); world.resume(); toast(`${z.name} 구역 미션 포기 — 다시 도전!`); };
  }

  function doCollect(id) {
    if (got[id]) return;
    got[id] = true; world.disableTrigger(id);
    const n = Object.values(got).filter(Boolean).length;
    set('#dh-mission', `🔋 ${n} / 3`);
    quest.setObjective(['bat0', 'bat1', 'bat2'].indexOf(id), true);
    quest.setSubtitle(`배터리 ${n} / 3`);
    toast(`${ZONES[id].icon} ${ZONES[id].name} 해소 & 배터리 획득! (${n}/3)`);
    // EDDIE 가이드 멘트 — 남은 미션을 짚어준다
    if (n < 3) {
      const left = ['bat0', 'bat1', 'bat2'].filter((k) => !got[k]).map((k) => `${ZONES[k].icon} ${ZONES[k].name}`);
      narrate(`좋아! 이제 ${left.join(' · ')} 구역이 남았어. 다음은 거기로 가보자! 🤖`);
    }
    if (n >= 3) {
      cleared = true; progress.mark('dht11');
      narrate('배터리 3개 모두 획득! DHT-11 방 미션 클리어 🎉');
      toast('🎉 방 미션 클리어! (배터리 3/3)');
      world.pause();
      setTimeout(() => celebrateRoom({
        message: '온도·습도 센서를 모두 다뤘어요! 🔋🔋🔋<br/>EDDIE와 함께 DHT-11 방을 깨웠습니다.',
        onExit: () => { cleanup(); onExit?.(); },
      }), 600);
    }
  }

  // ---- 센서 폴링 ----
  async function poll() {
    if (updating) return;
    if (board.connected) {
      const r = await board.readDht();
      if (r) { cur.temp = r.temp; cur.hum = r.hum; cur.real = true; nullCount = 0; root.querySelector('#dh-update').hidden = true; updateHud(); return; }
      if (++nullCount >= 2) root.querySelector('#dh-update').hidden = false;
    }
    cur.real = false; simPhase += 1;
    cur.temp = clamp(24 + Math.sin(simPhase / 8) * 9 + (Math.random() - 0.5), 0, 45);
    cur.hum = clamp(52 + Math.sin(simPhase / 6 + 1) * 22 + (Math.random() - 0.5), 0, 100);
    updateHud();
  }
  pollTimer = setInterval(poll, 1500); poll();

  root.querySelector('#dh-update').onclick = async () => {
    if (updating || !board.connected) { if (!board.connected) toast('먼저 사용환경 준비에서 보드를 연결하세요.'); return; }
    updating = true; const btn = root.querySelector('#dh-update'); btn.disabled = true;
    toast('펌웨어 v2 굽는 중… 케이블 뽑지 마세요!');
    try {
      const r = await board.flash({ onProgress: (d, t) => toast(`펌웨어 굽는 중… ${Math.round((d / t) * 100)}%`) });
      if (r && r.ok) { toast('업데이트 완료! 실시간 온습도가 읽힙니다 🎉'); nullCount = 0; btn.hidden = true; }
      else toast('업데이트 실패 — 케이블/포트를 확인하세요.');
    } catch (e) { toast('업데이트 실패: ' + (e?.message ?? e)); }
    updating = false; btn.disabled = false;
  };

  function updateHud() {
    set('#dh-t', Math.round(cur.temp)); set('#dh-h', Math.round(cur.hum));
    const di = discomfort(cur.temp, cur.hum);
    const diEl = root.querySelector('#dh-di');
    if (diEl) { diEl.textContent = `불쾌지수 ${Math.round(di)}`; diEl.className = 'dh-di' + (di >= 80 ? ' bad' : di >= 75 ? ' warn' : ''); }
    const src = root.querySelector('#dh-src');
    if (src) { src.textContent = cur.real ? '● 실시간(DHT11)' : '○ 시뮬레이션'; src.className = 'dh-src' + (cur.real ? ' live' : ''); }
  }

  function set(sel, v) { const el = root.querySelector(sel); if (el) el.textContent = v; }
  let tT = null, nT = null;
  function toast(m) { toastEl.textContent = m; toastEl.classList.add('show'); clearTimeout(tT); tT = setTimeout(() => toastEl.classList.remove('show'), 2400); }
  function narrate(t) { narrateEl.innerHTML = `<span>🤖 ${t}</span>`; narrateEl.classList.add('show'); clearTimeout(nT); nT = setTimeout(() => narrateEl.classList.remove('show'), 4200); }
  function cleanup() { clearInterval(pollTimer); try { world.destroy(); } catch (_) {} }

  function drawReactive(ctx, st, canvas) {
    const W = canvas.width, H = canvas.height, t = cur.temp, h = cur.hum;
    const heat = clamp((t - 25) / 9, 0, 1), cold = clamp((20 - t) / 9, 0, 1), damp = clamp((h - 55) / 25, 0, 1), dry = clamp((35 - h) / 22, 0, 1);
    const disc = clamp((discomfort(t, h) - 72) / 12, 0, 1);
    if (heat > 0) { ctx.fillStyle = `rgba(255,90,30,${0.10 + 0.30 * heat})`; ctx.fillRect(0, 0, W, H); ctx.fillStyle = `rgba(255,170,70,${0.10 * heat})`; for (let i = 0; i < 4; i++) { const y = H - (st.t * 0.6 + i * 90) % (H + 90); ctx.fillRect(0, y, W, 26); } }
    if (cold > 0) { ctx.fillStyle = `rgba(120,180,255,${0.10 + 0.26 * cold})`; ctx.fillRect(0, 0, W, H); }
    if (dry > 0) { ctx.fillStyle = `rgba(210,180,120,${0.16 * dry})`; ctx.fillRect(0, 0, W, H); }
    if (damp > 0) { ctx.fillStyle = `rgba(40,120,200,${0.10 + 0.24 * damp})`; ctx.fillRect(0, 0, W, H); ctx.fillStyle = `rgba(190,225,255,${0.5 * damp})`; for (let i = 0; i < 26; i++) { const x = (i * 73 + 30) % W; const y = ((st.t * 2.4) + i * 130) % (H + 60); ctx.fillRect(x, y, 2, 11); } }
    if (disc > 0.3) { const pulse = 0.16 + 0.12 * Math.sin(st.t * 0.12); const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(220,30,120,${pulse * disc})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function discomfort(t, h) { return 0.81 * t + 0.01 * h * (0.99 * t - 14.3) + 46.3; }

function drawRoom(ctx, got, cleared) {
  // 바닥: 깊이 그라데이션
  const fg = ctx.createLinearGradient(0, 0, 0, MAP_H);
  fg.addColorStop(0, '#142036'); fg.addColorStop(0.55, '#172642'); fg.addColorStop(1, '#0e1828');
  ctx.fillStyle = fg; ctx.fillRect(0, 0, MAP_W, MAP_H);
  // 미세 격자
  ctx.strokeStyle = 'rgba(130,170,255,0.045)'; ctx.lineWidth = 1;
  for (let x = 24; x < MAP_W; x += 44) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAP_H); ctx.stroke(); }
  for (let y = 24; y < MAP_H; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MAP_W, y); ctx.stroke(); }
  // 중앙 바닥 빛
  const fl = ctx.createRadialGradient(MAP_W / 2, MAP_H * 0.46, 30, MAP_W / 2, MAP_H * 0.46, MAP_W * 0.5);
  fl.addColorStop(0, 'rgba(120,170,255,0.06)'); fl.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fl; ctx.fillRect(0, 0, MAP_W, MAP_H);
  // 벽 (그라데이션 + 상단 하이라이트 + 발광 베이스보드)
  const wall = (x, y, w, h) => { const g = ctx.createLinearGradient(x, y, x, y + (h < 40 ? h : 40)); g.addColorStop(0, '#30406a'); g.addColorStop(1, '#1b2740'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h); };
  wall(0, 0, MAP_W, 24); wall(0, MAP_H - 24, MAP_W, 24); wall(0, 0, 24, MAP_H); wall(MAP_W - 24, 0, 24, MAP_H);
  ctx.fillStyle = 'rgba(120,180,255,0.18)'; ctx.fillRect(24, 22, MAP_W - 48, 2);
  // 센서 허브 책상
  ctx.fillStyle = '#2a3550'; rr(ctx, 356, 44, 248, 30, 10); ctx.fill();
  const sc = ctx.createLinearGradient(408, 26, 408, 46); sc.addColorStop(0, '#16384f'); sc.addColorStop(1, '#0a1c2c');
  ctx.fillStyle = sc; rr(ctx, 406, 26, 148, 20, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(127,214,255,0.4)'; ctx.lineWidth = 1; rr(ctx, 406, 26, 148, 20, 5); ctx.stroke();
  ctx.fillStyle = '#7fd6ff'; ctx.font = 'bold 11px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('SENSOR HUB', 480, 40);

  ctx.textAlign = 'center';
  // 배터리 구역 (글로우 + 글래스 디스크 + 림라이트 + 라벨칩)
  for (const [k, z] of Object.entries(ZONES)) {
    const has = !got[k];
    const base = has ? z.color : '61,220,145';
    const glow = ctx.createRadialGradient(z.cx, z.cy, 10, z.cx, z.cy, 96);
    glow.addColorStop(0, `rgba(${base},0.5)`); glow.addColorStop(0.6, `rgba(${base},0.15)`); glow.addColorStop(1, `rgba(${base},0)`);
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(z.cx, z.cy, 96, 0, 6.283); ctx.fill();
    const disc = ctx.createRadialGradient(z.cx, z.cy - 16, 4, z.cx, z.cy, 58);
    disc.addColorStop(0, `rgba(${base},0.30)`); disc.addColorStop(1, 'rgba(10,18,30,0.55)');
    ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(z.cx, z.cy, 58, 0, 6.283); ctx.fill();
    ctx.strokeStyle = `rgba(${base},0.85)`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(z.cx, z.cy, 58, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(z.cx, z.cy - 2, 53, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
    ctx.save(); ctx.shadowColor = `rgba(${base},0.9)`; ctx.shadowBlur = 18;
    ctx.font = '46px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(has ? '🔋' : '✅', z.cx, z.cy + 14); ctx.restore();
    const label = `${z.icon} ${z.name}`;
    ctx.font = '600 13px "Space Grotesk", sans-serif';
    const lw = ctx.measureText(label).width + 22;
    ctx.fillStyle = 'rgba(10,16,28,0.72)'; rr(ctx, z.cx - lw / 2, z.cy + 64, lw, 22, 11); ctx.fill();
    ctx.fillStyle = '#eaf2ff'; ctx.fillText(label, z.cx, z.cy + 79);
  }
  // 게임하기 받침대 (좌하단 — 아이콘 + 라벨을 한 카드 안에 담아 안정적으로)
  const px = PLAY.x + PLAY.w / 2, py = PLAY.y + PLAY.h / 2;
  const pg = ctx.createRadialGradient(px, py, 4, px, py, 86); pg.addColorStop(0, 'rgba(111,183,255,0.34)'); pg.addColorStop(1, 'rgba(111,183,255,0)');
  ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, 86, 0, 6.283); ctx.fill();
  const card = ctx.createLinearGradient(PLAY.x, PLAY.y, PLAY.x, PLAY.y + PLAY.h);
  card.addColorStop(0, '#243660'); card.addColorStop(1, '#18233f');
  ctx.fillStyle = card; rr(ctx, PLAY.x, PLAY.y, PLAY.w, PLAY.h, 14); ctx.fill();
  ctx.strokeStyle = 'rgba(111,183,255,0.9)'; ctx.lineWidth = 2; rr(ctx, PLAY.x, PLAY.y, PLAY.w, PLAY.h, 14); ctx.stroke();
  ctx.save(); ctx.shadowColor = 'rgba(111,183,255,0.8)'; ctx.shadowBlur = 12;
  ctx.fillStyle = '#fff'; ctx.font = '34px sans-serif'; ctx.fillText('🎮', px, py + 4); ctx.restore();
  ctx.fillStyle = 'rgba(111,183,255,0.18)'; rr(ctx, PLAY.x + 10, PLAY.y + PLAY.h - 28, PLAY.w - 20, 20, 10); ctx.fill();
  ctx.fillStyle = '#dbe9ff'; ctx.font = '700 12px "Space Grotesk", sans-serif'; ctx.fillText('게임하기 ▸', px, py + 30);
  // 나가기
  ctx.fillStyle = '#5a3a2a'; rr(ctx, EXIT.x - 6, MAP_H - 28, EXIT.w + 12, 24, 5); ctx.fill();
  ctx.fillStyle = '#caa15a'; rr(ctx, EXIT.x, MAP_H - 24, EXIT.w, 18, 4); ctx.fill();
  ctx.fillStyle = '#cfe0ff'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('🚪 복도로', EXIT.x + EXIT.w / 2, MAP_H - 36);
  ctx.textAlign = 'start';
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
