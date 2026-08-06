// relay.js — 릴레이 학습방(지하실). 정전된 지하실에서 내려간 차단기 옆,
// 릴레이로 '발전기'를 돌려 집에 전기를 보낸다. 코딩 → 미션 클리어 시
// 지하실에 불이 들어오고 발전기 로터가 돌아가며 폭죽 마무리가 뜬다.
// room.js 패널(버튼/블록/코드)을 재사용한다.

import { createWorld } from '../engine/topdown.js';
import { openRoom } from './room.js';
import { mountQuest } from '../app/quest.js';
import { progress } from '../app/progress.js';
import { mountSay, eddieRandom } from '../app/eddieSay.js';
import { vignette, roundRect } from '../engine/style.js';
import { celebrateRoom } from './celebrate.js';

const MAP_W = 820, MAP_H = 560;
const GEN = { x: 360, y: 150, w: 110, h: 96 };       // 발전기 본체
const BREAKER = { x: 150, y: 70, w: 70, h: 96 };      // 벽 차단기 패널
const LIGHT = { x: GEN.x + GEN.w / 2, y: GEN.y + GEN.h / 2 };
const EXIT = { x: 378, y: MAP_H - 56, w: 64, h: 38 };

const RELAY_ROOM = {
  id: 'relay', name: '릴레이', pin: 7, concept: '디지털 출력(릴레이 스위치)', blockSet: 'relay',
  intro: '정전이야! 지하실 차단기가 내려갔어. 릴레이는 작은 신호로 큰 전원을 켜는 스위치 — 릴레이로 발전기를 돌려 집에 전기를 보내자!',
  missions: [
    {
      id: 'on', type: 'play', title: '릴레이로 발전기 켜기', goal: 'on', concept: 'digitalWrite',
      story: '버튼/코드로 릴레이를 ON 하면 발전기가 돌며 지하실에 전기가 들어와요.',
      hint: 'digitalWrite(7, HIGH) 로 릴레이 ON → 발전기 가동.',
      base: 'void setup() {\n  pinMode(7, OUTPUT);   // 릴레이 IN\n}\n\nvoid loop() {\n  digitalWrite(7, HIGH);   // 릴레이 ON → 발전기 가동\n}\n',
    },
    {
      id: 'cycle', type: 'challenge', title: '발전기 점검 경고등 만들기', goal: 'blink', want: { maxDelay: 500 },
      concept: 'delay', challenge: 'delay 를 500 이하로 줄여 점검 경고등을 깜빡여줘!',
      story: '릴레이를 주기적으로 ON/OFF 해 점검용 경고등을 만들자.',
      hint: 'ON → delay → OFF → delay 반복. delay 숫자를 500 이하로.',
      base: 'void setup() {\n  pinMode(7, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(7, HIGH);   // ON\n  delay(800);\n  digitalWrite(7, LOW);    // OFF\n  delay(800);\n}\n',
    },
  ],
};

export function showRelay(root, { onExit } = {}) {
  let cleared = progress.isCleared('relay');

  root.innerHTML = `
    <div class="scene game-scene scene-fade">
      <div class="world-host" id="world-host"></div>
      <div class="hud-top">
        <div class="brand"><span class="brand-dot"></span><strong>Eduino AI</strong><span class="brand-sep">:</span><b class="brand-sub">릴레이</b><span class="crumb">지하실 · 발전기</span></div>
        <button class="btn btn-sm" id="rl-exit">🚪 복도로</button>
      </div>
      <div class="hud-hint" id="hud-hint"></div>
      <div class="hud-toast" id="hud-toast"></div>
      <div class="hud-narrate" id="hud-narrate"></div>
      <div class="hud-controls">⬆⬇⬅➡ 이동 · Space · 발전기 앞에서 학습 · EDDIE 클릭</div>
    </div>`;
  const hintEl = root.querySelector('#hud-hint');
  const toastEl = root.querySelector('#hud-toast');
  const narrateEl = root.querySelector('#hud-narrate');
  const say = mountSay(root.querySelector('.game-scene'));
  mountQuest(root.querySelector('.game-scene'), { title: '지하실 발전기', subtitle: '릴레이로 발전기를 돌리자!', objectives: [{ text: '릴레이로 발전기 켜기', done: cleared }, { text: '점검 경고등 만들기', done: cleared }] });
  root.querySelector('#rl-exit').onclick = () => { world.destroy(); onExit?.(); };

  const dark = document.createElement('canvas');
  const dctx = dark.getContext('2d');

  const map = {
    width: MAP_W, height: MAP_H, bg: '#0a0e16',
    spawn: { x: 400, y: 380 },
    walls: [{ x: 0, y: 0, w: MAP_W, h: 24 }, { x: 0, y: MAP_H - 24, w: MAP_W, h: 24 }, { x: 0, y: 0, w: 24, h: MAP_H }, { x: MAP_W - 24, y: 0, w: 24, h: MAP_H }, { ...GEN }],
    triggers: [{ id: 'device', x: GEN.x, y: GEN.y + GEN.h, w: GEN.w, h: 40 }, { id: 'exit', ...EXIT }],
    draw: (ctx, st) => drawRelay(ctx, st, cleared),
  };

  const world = createWorld(root.querySelector('#world-host'), map, {
    onEddieClick: (x, y) => say(eddieRandom(), x, y),
    onInteract: (id) => {
      if (id === 'exit') { world.destroy(); onExit?.(); return; }
      if (id === 'device') {
        world.pause();
        openRoom(RELAY_ROOM, {
          onComplete: () => {
            cleared = true; progress.mark('relay');
            toast('발전기 가동! 지하실에 불이 들어왔어요 ⚡');
            narrate('차단기 복구 완료! 발전기가 돌아가며 집에 전기가 흐른다 ⚙️✨');
            setTimeout(() => celebrateRoom({
              message: '릴레이로 발전기를 돌려 정전을 해결했어요! ⚙️⚡<br/>지하실이 환하게 살아났습니다.',
              onExit: () => { world.destroy(); onExit?.(); },
            }), 700);
          },
          onClose: () => world.resume(),
        });
      }
    },
    onFrame: (st) => {
      const tr = st.activeTrigger;
      if (!tr) { hintEl.classList.remove('show'); return; }
      hintEl.innerHTML = tr.id === 'device' ? '⚙️ Space · 릴레이로 발전기 제어 학습' : '🚪 Space · 복도로';
      hintEl.classList.add('show');
    },
    onDrawOverlay: (ctx, st, canvas) => {
      if (cleared) { vignette(ctx, canvas, 0.42); return; }
      // 정전된 지하실: 손전등 + 발전기 주변만 희미하게
      if (dark.width !== canvas.width || dark.height !== canvas.height) { dark.width = canvas.width; dark.height = canvas.height; }
      const cam = st.cam, p = st.player;
      dctx.clearRect(0, 0, dark.width, dark.height);
      dctx.fillStyle = 'rgba(2,4,10,0.9)'; dctx.fillRect(0, 0, dark.width, dark.height);
      dctx.globalCompositeOperation = 'destination-out';
      hole(dctx, p.x + p.w / 2 - cam.x, p.y + p.h / 2 - cam.y, 160);
      hole(dctx, LIGHT.x - cam.x, LIGHT.y - cam.y, 110);
      dctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(dark, 0, 0);
    },
  });

  if (!cleared) setTimeout(() => narrate('깜깜한 지하실… 발전기 앞에서 Space 로 릴레이 코딩을 시작하자! 🔌'), 400);

  let tT = null, nT = null;
  function toast(m) { toastEl.textContent = m; toastEl.classList.add('show'); clearTimeout(tT); tT = setTimeout(() => toastEl.classList.remove('show'), 2400); }
  function narrate(t) { narrateEl.innerHTML = `<span>🤖 ${t}</span>`; narrateEl.classList.add('show'); clearTimeout(nT); nT = setTimeout(() => narrateEl.classList.remove('show'), 4400); }
}

function hole(c, x, y, r) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.62, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}

function drawRelay(ctx, st, cleared) {
  const t = st?.t || 0;
  // 콘크리트 바닥(지하실)
  const fg = ctx.createLinearGradient(0, 0, 0, MAP_H);
  fg.addColorStop(0, cleared ? '#2a2f3a' : '#161b25'); fg.addColorStop(1, cleared ? '#1c2129' : '#0d1118');
  ctx.fillStyle = fg; ctx.fillRect(0, 0, MAP_W, MAP_H);
  // 콘크리트 줄눈
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
  for (let x = 80; x < MAP_W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 24); ctx.lineTo(x, MAP_H - 24); ctx.stroke(); }
  for (let y = 80; y < MAP_H; y += 80) { ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(MAP_W - 24, y); ctx.stroke(); }
  // 벽(콘크리트) + 천장 배관
  ctx.fillStyle = '#1b2230'; ctx.fillRect(0, 0, MAP_W, 24); ctx.fillRect(0, MAP_H - 24, MAP_W, 24); ctx.fillRect(0, 0, 24, MAP_H); ctx.fillRect(MAP_W - 24, 0, 24, MAP_H);
  ctx.strokeStyle = '#3a4252'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(24, 44); ctx.lineTo(MAP_W - 24, 44); ctx.stroke();
  ctx.strokeStyle = '#2a3140'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(560, 24); ctx.lineTo(560, 130); ctx.stroke();

  // 차단기 패널 (벽) — 미해결: 레버 내려감 / 해결: 올라감 + 초록불
  drawBreaker(ctx, cleared);
  // 발전기
  drawGenerator(ctx, t, cleared);

  // 나가기
  const eg = ctx.createLinearGradient(EXIT.x, MAP_H - 30, EXIT.x, MAP_H - 6); eg.addColorStop(0, '#2c3c68'); eg.addColorStop(1, '#1b2740');
  ctx.fillStyle = eg; roundRect(ctx, EXIT.x - 6, MAP_H - 30, EXIT.w + 12, 26, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(111,183,255,0.6)'; ctx.lineWidth = 1.5; roundRect(ctx, EXIT.x - 6, MAP_H - 30, EXIT.w + 12, 26, 8); ctx.stroke();
  ctx.fillStyle = '#cfe0ff'; ctx.font = 'bold 12px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🚪 복도로', EXIT.x + EXIT.w / 2, MAP_H - 13);
  ctx.textAlign = 'start';
}

function drawBreaker(ctx, on) {
  const b = BREAKER;
  ctx.fillStyle = '#39414f'; roundRect(ctx, b.x, b.y, b.w, b.h, 8); ctx.fill();
  ctx.strokeStyle = '#5a6577'; ctx.lineWidth = 2; roundRect(ctx, b.x, b.y, b.w, b.h, 8); ctx.stroke();
  // 메인 레버
  ctx.fillStyle = '#222732'; roundRect(ctx, b.x + 14, b.y + 16, 42, 36, 5); ctx.fill();
  ctx.fillStyle = on ? '#3ddc91' : '#c0392b';
  if (on) roundRect(ctx, b.x + 22, b.y + 18, 26, 16, 4); else roundRect(ctx, b.x + 22, b.y + 34, 26, 16, 4);
  ctx.fill();
  // 상태등
  ctx.save(); ctx.shadowColor = on ? 'rgba(61,220,145,0.9)' : 'rgba(255,80,60,0.7)'; ctx.shadowBlur = 12;
  ctx.fillStyle = on ? '#3ddc91' : '#ff5a3c'; ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + 70, 7, 0, 6.283); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#aab4c6'; ctx.font = 'bold 11px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('차단기', b.x + b.w / 2, b.y + b.h - 6);
  ctx.fillText(on ? 'ON' : 'OFF', b.x + b.w / 2, b.y + 14);
  ctx.textAlign = 'start';
}

function drawGenerator(ctx, t, on) {
  const cx = GEN.x + GEN.w / 2, cy = GEN.y + GEN.h / 2;
  if (on) {
    const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, 130);
    g.addColorStop(0, 'rgba(255,225,120,0.4)'); g.addColorStop(0.6, 'rgba(255,210,120,0.12)'); g.addColorStop(1, 'rgba(255,210,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 130, 0, 6.283); ctx.fill();
  }
  // 본체
  const bg = ctx.createLinearGradient(GEN.x, GEN.y, GEN.x, GEN.y + GEN.h);
  bg.addColorStop(0, on ? '#5a6376' : '#3a4150'); bg.addColorStop(1, on ? '#343b49' : '#222732');
  ctx.fillStyle = bg; roundRect(ctx, GEN.x, GEN.y, GEN.w, GEN.h, 12); ctx.fill();
  ctx.strokeStyle = on ? 'rgba(255,225,120,0.7)' : 'rgba(120,140,170,0.5)'; ctx.lineWidth = 2; roundRect(ctx, GEN.x, GEN.y, GEN.w, GEN.h, 12); ctx.stroke();
  // 로터(돌아감)
  const rx = cx, ry = GEN.y + 34, rr0 = 20;
  ctx.fillStyle = '#1a1f29'; ctx.beginPath(); ctx.arc(rx, ry, rr0 + 4, 0, 6.283); ctx.fill();
  ctx.save(); ctx.translate(rx, ry); ctx.rotate(on ? t * 0.18 : 0);
  ctx.strokeStyle = on ? '#ffd96a' : '#5a6577'; ctx.lineWidth = 4;
  for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(rr0, 0); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = on ? '#ffd96a' : '#39425e'; ctx.beginPath(); ctx.arc(rx, ry, 5, 0, 6.283); ctx.fill();
  // 계기판
  ctx.fillStyle = '#0d1420'; roundRect(ctx, GEN.x + 14, GEN.y + GEN.h - 30, GEN.w - 28, 18, 4); ctx.fill();
  ctx.fillStyle = on ? '#3ddc91' : '#3a4a60'; ctx.font = 'bold 11px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(on ? 'RUNNING ⚙' : 'STOPPED', cx, GEN.y + GEN.h - 17);
  // 라벨
  ctx.fillStyle = on ? '#ffe9b0' : '#9aaccb'; ctx.font = 'bold 12px "Space Grotesk", sans-serif';
  ctx.fillText('🔌 릴레이 → 발전기', cx, GEN.y + GEN.h + 26);
  ctx.textAlign = 'start';
}
