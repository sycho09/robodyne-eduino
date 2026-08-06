// house.js — LED 학습방(우리 집). 진짜 4칸 평면도: 벽으로 나뉜 4개의 방(거실·주방·욕실·침실)과
// 중앙 복도. EDDIE는 각 방의 '입구(문틈)'로만 들어갈 수 있고, 방 안에서 코딩 미션을 풀면 불이 켜진다.
// 4개 방이 모두 켜지면 그림자 없이 집 전체가 환해지고 "학습을 마쳤습니다" 폭죽 마무리가 뜬다.

import { createWorld } from '../engine/topdown.js';
import { openRoom } from './room.js';
import { mountQuest } from '../app/quest.js';
import { ROOMS, TOTAL_ROOMS, getRoom } from '../content/rooms.js';
import { progress } from '../app/progress.js';
import { mountSay, eddieRandom } from '../app/eddieSay.js';
import { celebrateRoom } from './celebrate.js';

const MAP_W = 1000, MAP_H = 660;

// 4칸 평면도: 좌(거실/욕실) · 우(주방/침실), 가운데 세로 복도(x 440~560).
// 각 방의 바닥 영역 / 천장등 위치 / 입구(문틈) / 미션 트리거.
const RM = {
  living:  { floor: { x: 24,  y: 24,  w: 416, h: 298 }, light: { x: 232, y: 168 }, door: { x: 344, y: 124, w: 96, h: 66 }, gap: { y0: 120, y1: 192, side: 'right' } },
  bath:    { floor: { x: 24,  y: 338, w: 416, h: 298 }, light: { x: 232, y: 488 }, door: { x: 344, y: 452, w: 96, h: 66 }, gap: { y0: 450, y1: 522, side: 'right' } },
  kitchen: { floor: { x: 560, y: 24,  w: 416, h: 298 }, light: { x: 768, y: 168 }, door: { x: 560, y: 124, w: 96, h: 66 }, gap: { y0: 120, y1: 192, side: 'left' } },
  bedroom: { floor: { x: 560, y: 338, w: 416, h: 298 }, light: { x: 768, y: 488 }, door: { x: 560, y: 452, w: 96, h: 66 }, gap: { y0: 450, y1: 522, side: 'left' } },
};
const EXIT = { x: 468, y: MAP_H - 58, w: 64, h: 38 };
const houseState = { lit: new Set(), cleared: 0 };

export function showHouse(root, { onExit } = {}) {
  // 이전에 다 깬 상태로 다시 들어왔다면 초기화(다시 학습)
  if (houseState.cleared >= TOTAL_ROOMS) { houseState.lit = new Set(); houseState.cleared = 0; }

  root.innerHTML = `
    <div class="scene game-scene scene-fade">
      <div class="world-host" id="world-host"></div>
      <div class="hud-top">
        <div class="brand"><span class="brand-dot"></span><strong>Eduino AI</strong><span class="brand-sep">:</span><b class="brand-sub">LED 학습방</b><span class="crumb">우리 집</span></div>
        <div class="phase-badge"><span id="prog">${houseState.cleared}</span> / ${TOTAL_ROOMS} 점등</div>
      </div>
      <div class="hud-hint" id="hud-hint"></div>
      <div class="hud-toast" id="hud-toast"></div>
      <div class="hud-narrate" id="hud-narrate"></div>
      <div class="hud-controls">⬆⬇⬅➡ 이동 · 입구로 들어가 Space · EDDIE 클릭</div>
    </div>
  `;
  const hintEl = root.querySelector('#hud-hint');
  const toastEl = root.querySelector('#hud-toast');
  const narrateEl = root.querySelector('#hud-narrate');
  const progEl = root.querySelector('#prog');

  const quest = mountQuest(root.querySelector('.game-scene'), {
    title: 'LED로 집 밝히기',
    subtitle: `점등 ${houseState.cleared} / ${TOTAL_ROOMS}`,
    objectives: ROOMS.map((r) => ({ text: `${r.name} (${r.concept})`, done: houseState.lit.has(r.id) })),
  });

  const map = {
    width: MAP_W, height: MAP_H, bg: '#05080f',
    spawn: { x: 492, y: 556 },
    walls: buildWalls(),
    triggers: [
      ...ROOMS.map((r) => ({ id: r.id, ...RM[r.id].door })),
      { id: 'exit', ...EXIT },
    ],
    draw: (ctx) => drawHouse(ctx, houseState.lit),
  };

  const dark = document.createElement('canvas');
  const dctx = dark.getContext('2d');

  const say = mountSay(root.querySelector('.game-scene'));
  const world = createWorld(root.querySelector('#world-host'), map, {
    onInteract: handle, onFrame: updateHint, onDrawOverlay: drawDarkness,
    onEddieClick: (x, y) => say(eddieRandom(), x, y),
  });

  if (houseState.cleared < ROOMS.length) setTimeout(() => narrate('깜깜한 집… 가운데 복도에서 각 방 입구로 들어가 Space 로 불을 켜자!'), 400);

  function handle(id) {
    if (id === 'exit') { world.destroy(); onExit?.(); return; }
    if (houseState.lit.has(id)) { toast(`${nameOf(id)}은 이미 환해요 ✨`); return; }
    const content = getRoom(id);
    if (content) { world.pause(); openRoom(content, { onComplete: () => done(id), onClose: () => world.resume() }); }
  }

  function done(id) {
    if (houseState.lit.has(id)) return;
    houseState.lit.add(id); houseState.cleared += 1; progEl.textContent = String(houseState.cleared);
    const idx = ROOMS.findIndex((r) => r.id === id); if (idx >= 0) quest.setObjective(idx, true);
    quest.setSubtitle(`점등 ${houseState.cleared} / ${TOTAL_ROOMS}`);

    if (houseState.cleared >= ROOMS.length) {
      progress.mark('led');
      toast('온 집에 불이 들어왔어요! 🎉');
      narrate('그림자 하나 없이 집 전체가 환해졌다! 학습을 마쳤어요 ✨');
      world.pause();
      setTimeout(() => celebrateRoom({
        message: '거실·주방·욕실·침실 4개의 LED를 모두 켰어요! 💡<br/>그림자 없이 온 집이 환해졌습니다.',
        onExit: () => { world.destroy(); onExit?.(); },
      }), 800);
    } else {
      toast(`${nameOf(id)}에 불이 들어왔어요! 🎉 (${houseState.cleared}/${TOTAL_ROOMS})`);
      const left = ROOMS.filter((r) => !houseState.lit.has(r.id)).map((r) => r.name);
      narrate(`좋아! 이제 ${left.join(' · ')} 이(가) 남았어. 다음 방으로 가자! 🤖`);
    }
  }
  const nameOf = (id) => getRoom(id)?.name || id;

  function updateHint(state) {
    const tr = state.activeTrigger;
    if (!tr) { hintEl.classList.remove('show'); return; }
    if (tr.id === 'exit') hintEl.innerHTML = '🚪 Space · 복도로 나가기';
    else if (houseState.lit.has(tr.id)) hintEl.innerHTML = `${nameOf(tr.id)} · 점등됨 ✨`;
    else hintEl.innerHTML = `💡 Space · <b>${nameOf(tr.id)}</b> 불 켜기`;
    hintEl.classList.add('show');
  }
  let tT = null, nT = null;
  function toast(m) { toastEl.textContent = m; toastEl.classList.add('show'); clearTimeout(tT); tT = setTimeout(() => toastEl.classList.remove('show'), 2400); }
  function narrate(t) { narrateEl.innerHTML = `<span>🤖 ${t}</span>`; narrateEl.classList.add('show'); clearTimeout(nT); nT = setTimeout(() => narrateEl.classList.remove('show'), 4400); }

  function drawDarkness(ctx, state, canvas) {
    // 4방 모두 점등 → 그림자 없이 전체 환하게 (어둠 오버레이 생략)
    if (houseState.cleared >= ROOMS.length) return;
    if (dark.width !== canvas.width || dark.height !== canvas.height) { dark.width = canvas.width; dark.height = canvas.height; }
    const cam = state.cam, p = state.player;
    dctx.clearRect(0, 0, dark.width, dark.height);
    dctx.fillStyle = 'rgba(3,7,16,0.9)'; dctx.fillRect(0, 0, dark.width, dark.height);
    dctx.globalCompositeOperation = 'destination-out';
    hole(dctx, p.x + p.w / 2 - cam.x, p.y + p.h / 2 - cam.y, 150);
    for (const id of houseState.lit) { const s = RM[id]; hole(dctx, s.light.x - cam.x, s.light.y - cam.y, 250); }
    dctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(dark, 0, 0);
  }
}

// 벽(충돌): 외벽 + 좌/우 내벽(문틈 gap) + 좌/우 방 사이 가로 칸막이
function buildWalls() {
  const T = 24, IW = 16;
  const W = [
    { x: 0, y: 0, w: MAP_W, h: T }, { x: 0, y: MAP_H - T, w: MAP_W, h: T },
    { x: 0, y: 0, w: T, h: MAP_H }, { x: MAP_W - T, y: 0, w: T, h: MAP_H },
  ];
  // 좌측 내벽 (x=440), 거실/욕실 입구 gap
  W.push(...vWallWithGaps(440, IW, [RM.living.gap, RM.bath.gap]));
  // 우측 내벽 (x=544), 주방/침실 입구 gap
  W.push(...vWallWithGaps(544, IW, [RM.kitchen.gap, RM.bedroom.gap]));
  // 좌측 가로 칸막이 (거실|욕실 사이)
  W.push({ x: 24, y: 322, w: 416, h: IW });
  // 우측 가로 칸막이 (주방|침실 사이)
  W.push({ x: 560, y: 322, w: 416, h: IW });
  return W;
}
function vWallWithGaps(x, w, gaps) {
  // 세로벽 y[24,636]에서 gap 들을 비워 문틈을 만든다
  const segs = [];
  let cur = 24; const end = MAP_H - 24;
  const sorted = gaps.map((g) => [g.y0, g.y1]).sort((a, b) => a[0] - b[0]);
  for (const [g0, g1] of sorted) { if (g0 > cur) segs.push({ x, y: cur, w, h: g0 - cur }); cur = Math.max(cur, g1); }
  if (cur < end) segs.push({ x, y: cur, w, h: end - cur });
  return segs;
}

function hole(c, x, y, r) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.65, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}

// ===== 인테리어 =====
function drawHouse(ctx, lit) {
  const allLit = lit.size >= ROOMS.length;
  // 복도 바닥(타일)
  ctx.fillStyle = '#1a2236'; ctx.fillRect(0, 0, MAP_W, MAP_H);
  // 각 방 바닥(원목) + 점등 시 따뜻한 빛
  for (const [id, r] of Object.entries(RM)) roomFloor(ctx, r.floor, lit.has(id) || allLit, r.light);
  // 복도 타일 결
  ctx.strokeStyle = 'rgba(150,180,255,0.06)'; ctx.lineWidth = 1;
  for (let y = 60; y < MAP_H; y += 60) { ctx.beginPath(); ctx.moveTo(440, y); ctx.lineTo(560, y); ctx.stroke(); }
  ctx.fillStyle = 'rgba(120,170,255,0.05)'; ctx.fillRect(440, 24, 120, MAP_H - 48);

  // 벽 그리기 (충돌과 동일 좌표)
  drawWalls(ctx, allLit);

  // 가구
  livingRoom(ctx, lit.has('living') || allLit);
  kitchen(ctx, lit.has('kitchen') || allLit);
  bathroom(ctx, lit.has('bath') || allLit);
  bedroom(ctx, lit.has('bedroom') || allLit);

  // 입구 명패(문틈 안쪽)
  ctx.textAlign = 'center';
  for (const id of Object.keys(RM)) {
    const r = RM[id], d = r.door, isLit = lit.has(id) || allLit, name = getRoom(id)?.name || id;
    ctx.fillStyle = isLit ? 'rgba(120,90,30,0.88)' : 'rgba(40,55,100,0.88)';
    rr(ctx, d.x + d.w / 2 - 44, d.y + d.h - 24, 88, 20, 6); ctx.fill();
    ctx.fillStyle = isLit ? '#ffe9b0' : '#dce8ff'; ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.fillText(`${name}${isLit ? ' ✨' : ' ▸'}`, d.x + d.w / 2, d.y + d.h - 10);
  }

  // 나가기(복도 하단)
  ctx.fillStyle = '#5a3a2a'; rr(ctx, EXIT.x - 6, MAP_H - 30, EXIT.w + 12, 26, 6); ctx.fill();
  ctx.fillStyle = '#caa15a'; rr(ctx, EXIT.x, MAP_H - 26, EXIT.w, 20, 4); ctx.fill();
  ctx.fillStyle = '#cfe0ff'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('🚪 복도로', EXIT.x + EXIT.w / 2, MAP_H - 38);
  ctx.textAlign = 'start';
}

function roomFloor(ctx, f, lit, light) {
  ctx.fillStyle = lit ? '#7a5a34' : '#3a3326';
  ctx.fillRect(f.x, f.y, f.w, f.h);
  // 나뭇결
  ctx.strokeStyle = lit ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.28)'; ctx.lineWidth = 2;
  for (let y = f.y + 30; y < f.y + f.h; y += 32) { ctx.beginPath(); ctx.moveTo(f.x, y); ctx.lineTo(f.x + f.w, y); ctx.stroke(); }
  if (lit) {
    const g = ctx.createRadialGradient(light.x, light.y, 8, light.x, light.y, 240);
    g.addColorStop(0, 'rgba(255,228,150,0.45)'); g.addColorStop(0.6, 'rgba(255,220,140,0.16)'); g.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.save(); ctx.beginPath(); ctx.rect(f.x, f.y, f.w, f.h); ctx.clip();
    ctx.fillStyle = g; ctx.fillRect(f.x, f.y, f.w, f.h); ctx.restore();
    // 천장등
    ctx.save(); ctx.shadowColor = 'rgba(255,228,150,0.9)'; ctx.shadowBlur = 22;
    ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(light.x, light.y, 9, 0, 6.283); ctx.fill(); ctx.restore();
  } else {
    // 꺼진 천장등
    ctx.fillStyle = '#2c3550'; ctx.beginPath(); ctx.arc(light.x, light.y, 7, 0, 6.283); ctx.fill();
  }
}

function drawWalls(ctx, allLit) {
  const seg = (x, y, w, h) => {
    ctx.fillStyle = allLit ? '#3a445f' : '#252e46'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x, y, w, Math.min(4, h));
  };
  for (const wseg of buildWalls()) seg(wseg.x, wseg.y, wseg.w, wseg.h);
}

function shadow(ctx, x, y, w) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(x, y, w / 2, 10, 0, 0, 6.283); ctx.fill(); }

function livingRoom(ctx, l) {
  // 소파 + TV + 화분 (거실: 좌상)
  shadow(ctx, 150, 250, 150);
  ctx.fillStyle = '#4f6aa8'; rr(ctx, 70, 200, 170, 54, 12); ctx.fill();
  ctx.fillStyle = '#5d7bc0'; rr(ctx, 78, 194, 154, 24, 10); ctx.fill();
  ctx.fillStyle = '#7a5230'; rr(ctx, 120, 262, 90, 22, 6); ctx.fill();
  ctx.fillStyle = '#0c1018'; rr(ctx, 96, 60, 130, 22, 4); ctx.fill();
  ctx.fillStyle = l ? '#7fd6ff' : '#26405a'; rr(ctx, 100, 62, 122, 16, 2); ctx.fill();
  ctx.fillStyle = '#2a6e3f'; ctx.beginPath(); ctx.arc(300, 250, 16, 0, 6.283); ctx.fill(); ctx.fillStyle = '#7a5230'; ctx.fillRect(292, 260, 16, 18);
}
function kitchen(ctx, l) {
  // 싱크/레인지 (주방: 우상)
  shadow(ctx, 768, 240, 200);
  ctx.fillStyle = '#9aa3bd'; rr(ctx, 660, 200, 220, 44, 6); ctx.fill(); ctx.fillStyle = '#7c849e'; ctx.fillRect(660, 238, 220, 8);
  ctx.fillStyle = '#2a3146'; rr(ctx, 690, 208, 56, 28, 4); ctx.fill();
  ctx.fillStyle = l ? '#ff7a4a' : '#444'; ctx.beginPath(); ctx.arc(704, 222, 5, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.arc(730, 222, 5, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#cdd4e6'; rr(ctx, 820, 60, 44, 96, 6); ctx.fill(); ctx.fillStyle = '#9aa3bd'; ctx.fillRect(826, 96, 32, 4);
}
function bathroom(ctx, l) {
  // 욕조 + 세면대 (욕실: 좌하)
  shadow(ctx, 150, 560, 150);
  ctx.fillStyle = '#dfe8f2'; rr(ctx, 70, 440, 150, 80, 20); ctx.fill();
  ctx.fillStyle = l ? '#bfe6ff' : '#7e98b6'; rr(ctx, 82, 452, 126, 56, 16); ctx.fill();
  ctx.fillStyle = '#cdd4e6'; rr(ctx, 90, 540, 64, 36, 8); ctx.fill(); ctx.fillStyle = '#9aa3bd'; ctx.beginPath(); ctx.arc(122, 558, 12, 0, 6.283); ctx.fill();
  ctx.fillStyle = l ? '#cfeefe' : '#3a4a60'; rr(ctx, 300, 470, 44, 30, 4); ctx.fill();
}
function bedroom(ctx, l) {
  // 침대 + 스탠드(무드등) — 다중 LED 느낌으로 등 2개 표현 (침실: 우하)
  shadow(ctx, 768, 560, 200);
  ctx.fillStyle = '#6b4e74'; rr(ctx, 660, 430, 180, 110, 12); ctx.fill();
  ctx.fillStyle = '#cdd4e6'; rr(ctx, 672, 440, 156, 40, 8); ctx.fill();
  ctx.fillStyle = '#8a6fb0'; rr(ctx, 672, 484, 156, 48, 8); ctx.fill();
  // 협탁 + 무드등
  ctx.fillStyle = '#7a5230'; rr(ctx, 858, 470, 40, 40, 4); ctx.fill();
  ctx.save(); if (l) { ctx.shadowColor = 'rgba(255,200,120,0.9)'; ctx.shadowBlur = 16; }
  ctx.fillStyle = l ? '#ffd27a' : '#5a5240'; ctx.beginPath(); ctx.arc(878, 466, 9, 0, 6.283); ctx.fill(); ctx.restore();
  // 천장 무드 스트립(다중 LED) 표현
  for (let i = 0; i < 3; i++) { ctx.fillStyle = l ? '#ffe14d' : '#4a4a38'; ctx.beginPath(); ctx.arc(700 + i * 24, 420, 5, 0, 6.283); ctx.fill(); }
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
