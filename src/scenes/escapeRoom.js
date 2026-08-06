// escapeRoom.js — 탑다운 탈출 방. EDDIE가 어두운 방을 돌아다니다 '장치 콘솔'에 다가가
// Space 로 미션(미니게임)을 시작한다. 클리어하면 방에 불이 들어오고 폭죽 마무리 → 복도(챕터)로.
// 미니게임은 지침서 mountGame(root, ctx) 계약으로 모달 패널에 올린다.

import { createWorld } from '../engine/topdown.js';
import { mountSay, eddieRandom } from '../app/eddieSay.js';
import { board } from '../app/board.js';
import { progress } from '../app/progress.js';
import { getRoom } from '../content/curriculum.js';
import { celebrateRoom } from './celebrate.js';
import { roundRect } from '../engine/style.js';
import { GAMES } from '../games/index.js';

const MAP_W = 820, MAP_H = 560;
const DEVICE = { x: 360, y: 120, w: 100, h: 92 };
const EXIT = { x: 378, y: MAP_H - 56, w: 64, h: 38 };

const THEME = {
  rgb:    { accent: '168,120,255', floor: ['#181226', '#1e1832', '#110c1d'], prompt: '색 패널 작동' },
  buzzer: { accent: '255,90,60',  floor: ['#241216', '#2a1519', '#160c0e'], prompt: '경보 콘솔 작동' },
  keypad: { accent: '90,160,255', floor: ['#101a2e', '#16233c', '#0c1422'], prompt: '키패드 작동' },
  seg:    { accent: '255,176,32', floor: ['#241d10', '#2a2212', '#16110a'], prompt: '봉인 콘솔 작동' },
  _def:   { accent: '111,183,255', floor: ['#101626', '#16213a', '#0b1120'], prompt: '장치 작동' },
};

export function showEscapeRoom(root, { roomId, onExit } = {}) {
  const m = getRoom(roomId);
  const th = THEME[roomId] || THEME._def;
  let lit = progress.isCleared(roomId);
  let panelOpen = false;

  root.innerHTML = `
    <div class="scene game-scene scene-fade escape-stage">
      <div class="world-host" id="world-host"></div>
      <div class="hud-top">
        <div class="brand"><span class="brand-dot"></span><strong>Eduino AI</strong><span class="brand-sep">:</span><b class="brand-sub">${m.name}</b><span class="crumb">${m.mission}</span></div>
        <button class="btn btn-sm" id="er-exit">🚪 복도로</button>
      </div>
      <div class="hud-hint" id="hud-hint"></div>
      <div class="hud-toast" id="hud-toast"></div>
      <div class="hud-narrate" id="hud-narrate"></div>
      <div class="hud-controls">⬆⬇⬅➡ 이동 · Space 작동 · EDDIE 클릭</div>
    </div>`;

  const hintEl = root.querySelector('#hud-hint');
  const toastEl = root.querySelector('#hud-toast');
  const narrateEl = root.querySelector('#hud-narrate');
  const say = mountSay(root.querySelector('.game-scene'));
  root.querySelector('#er-exit').onclick = () => { cleanup(); onExit?.(); };

  const dark = document.createElement('canvas');
  const dctx = dark.getContext('2d');

  const map = {
    width: MAP_W, height: MAP_H, bg: '#04060c',
    spawn: { x: 400, y: 400 },
    walls: [
      { x: 0, y: 0, w: MAP_W, h: 24 }, { x: 0, y: MAP_H - 24, w: MAP_W, h: 24 },
      { x: 0, y: 0, w: 24, h: MAP_H }, { x: MAP_W - 24, y: 0, w: 24, h: MAP_H },
      { ...DEVICE },
    ],
    triggers: [{ id: 'device', x: DEVICE.x, y: DEVICE.y + DEVICE.h, w: DEVICE.w, h: 42 }, { id: 'exit', ...EXIT }],
    draw: (ctx, st) => drawRoom(ctx, st, th, m, lit),
  };

  const world = createWorld(root.querySelector('#world-host'), map, {
    onEddieClick: (x, y) => say(eddieRandom(), x, y),
    onInteract: (id) => {
      if (id === 'exit') { cleanup(); onExit?.(); return; }
      if (id === 'device') openGame();
    },
    onFrame: (st) => {
      const tr = st.activeTrigger;
      if (!tr || panelOpen) { hintEl.classList.remove('show'); return; }
      hintEl.innerHTML = tr.id === 'device'
        ? (lit ? `✅ ${m.name} · 복구됨 — Space로 다시 시도` : `🎮 Space · ${th.prompt} (미션 시작)`)
        : '🚪 Space · 복도로';
      hintEl.classList.add('show');
    },
    onDrawOverlay: drawDark,
  });

  // 입장 미션 안내(공간감) — 바로 게임이 아니라 상황 먼저
  world.pause();
  {
    const md = document.createElement('div'); md.className = 'modal-backdrop';
    md.innerHTML = `<div class="modal"><h3>${m.icon} ${m.name} · ${m.mission}</h3>
      <p>어두운 방 안에 <b>${th.prompt.replace(' 작동', '')}</b>가 있어요.<br/>
      EDDIE를 움직여 <b>장치 앞에서 Space</b> 를 눌러 미션을 시작하세요.<br/>
      <span class="muted">개념: ${m.concept} · 성공 보상: ${m.reward}</span></p>
      <div class="modal-actions"><button class="btn primary" id="er-start">들어가기 ▶</button></div></div>`;
    document.body.appendChild(md);
    md.querySelector('#er-start').onclick = () => { md.remove(); world.resume(); narrate('장치 앞으로 가서 Space! 🤖'); };
  }

  function openGame() {
    if (panelOpen) return;
    const mount = GAMES[roomId];
    if (!mount) { toast('준비중인 장치예요'); return; }
    panelOpen = true; world.pause();
    const bd = document.createElement('div'); bd.className = 'gm-backdrop';
    bd.innerHTML = `<div class="gm-panel">
      <div class="gm-head"><b>${m.icon} ${m.name}</b><span>${m.mission}</span><button class="gm-x" id="gm-x">✕</button></div>
      <div class="gm-stage" id="gm-stage"></div></div>`;
    document.body.appendChild(bd);
    const stage = bd.querySelector('#gm-stage');
    let game = null, done = false;
    const close = () => { try { game?.destroy?.(); } catch (_) {} bd.remove(); panelOpen = false; };
    bd.querySelector('#gm-x').onclick = () => { close(); world.resume(); };
    const ctx = {
      mission: m, board, progress,
      say: (t) => narrate(t),
      onProgress: () => {}, onFail: (r) => { if (r) toast(r); },
      onExit: () => { close(); world.resume(); },
      onComplete: () => {
        if (done) return; done = true;
        close(); lit = true; progress.mark(roomId);
        narrate('미니게임 클리어! 무대에 불이 켜진다 ✨');
        setTimeout(() => celebrateRoom({
          title: '클리어! 🎉',
          message: `${m.mission} 성공 — <b>${m.reward}</b> 획득!<br/>무대를 한 칸 더 밝혔어요.`,
          exitLabel: '무대로 ▶',
          onExit: () => { cleanup(); onExit?.(); },
        }), 500);
      },
    };
    game = mount(stage, ctx);
  }

  let tT = null, nT = null;
  function toast(t) { toastEl.textContent = t; toastEl.classList.add('show'); clearTimeout(tT); tT = setTimeout(() => toastEl.classList.remove('show'), 2200); }
  function narrate(t) { narrateEl.innerHTML = `<span>🤖 ${t}</span>`; narrateEl.classList.add('show'); clearTimeout(nT); nT = setTimeout(() => narrateEl.classList.remove('show'), 4200); }
  function cleanup() { try { world.destroy(); } catch (_) {} }

  function drawDark(ctx, st, canvas) {
    if (lit) { // 클리어 시 은은한 비네트만
      const g = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.46, canvas.height * 0.4, canvas.width / 2, canvas.height / 2, canvas.height);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)'); ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height); return;
    }
    if (dark.width !== canvas.width || dark.height !== canvas.height) { dark.width = canvas.width; dark.height = canvas.height; }
    const cam = st.cam, p = st.player;
    dctx.clearRect(0, 0, dark.width, dark.height);
    dctx.fillStyle = 'rgba(2,4,10,0.9)'; dctx.fillRect(0, 0, dark.width, dark.height);
    dctx.globalCompositeOperation = 'destination-out';
    hole(dctx, p.x + p.w / 2 - cam.x, p.y + p.h / 2 - cam.y, 165);
    hole(dctx, DEVICE.x + DEVICE.w / 2 - cam.x, DEVICE.y + DEVICE.h / 2 - cam.y, 110);
    dctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(dark, 0, 0);
  }
}

function hole(c, x, y, r) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.62, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}

function drawRoom(ctx, st, th, m, lit) {
  const t = st?.t || 0;
  // 바닥
  const fg = ctx.createLinearGradient(0, 0, 0, MAP_H);
  fg.addColorStop(0, lit ? '#2a3450' : th.floor[0]); fg.addColorStop(0.5, lit ? '#30406a' : th.floor[1]); fg.addColorStop(1, lit ? '#1f2942' : th.floor[2]);
  ctx.fillStyle = fg; ctx.fillRect(0, 0, MAP_W, MAP_H);
  ctx.strokeStyle = 'rgba(150,180,255,0.05)'; ctx.lineWidth = 1;
  for (let x = 24; x < MAP_W; x += 52) { ctx.beginPath(); ctx.moveTo(x, 24); ctx.lineTo(x, MAP_H - 24); ctx.stroke(); }
  for (let y = 24; y < MAP_H; y += 52) { ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(MAP_W - 24, y); ctx.stroke(); }
  // 벽 + 경고 스트라이프
  ctx.fillStyle = '#0c111d'; ctx.fillRect(0, 0, MAP_W, 24); ctx.fillRect(0, MAP_H - 24, MAP_W, 24); ctx.fillRect(0, 0, 24, MAP_H); ctx.fillRect(MAP_W - 24, 0, 24, MAP_H);
  ctx.fillStyle = `rgba(${th.accent},0.5)`; ctx.fillRect(24, 22, MAP_W - 48, 2);
  // 데칼: 바닥 경고 박스
  ctx.strokeStyle = `rgba(${th.accent},0.18)`; ctx.lineWidth = 3; ctx.setLineDash([14, 10]);
  roundRect(ctx, DEVICE.x - 60, DEVICE.y + DEVICE.h - 6, DEVICE.w + 120, 150, 14); ctx.stroke(); ctx.setLineDash([]);

  // 장치 콘솔
  const cx = DEVICE.x + DEVICE.w / 2, cy = DEVICE.y + DEVICE.h / 2;
  const glowA = lit ? 0.5 : 0.25 + 0.18 * (0.5 + 0.5 * Math.sin(t * 0.08));
  const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, 120);
  g.addColorStop(0, `rgba(${th.accent},${glowA})`); g.addColorStop(1, `rgba(${th.accent},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 120, 0, 6.283); ctx.fill();
  const bg = ctx.createLinearGradient(DEVICE.x, DEVICE.y, DEVICE.x, DEVICE.y + DEVICE.h);
  bg.addColorStop(0, lit ? '#46527a' : '#2a3350'); bg.addColorStop(1, lit ? '#2c3658' : '#1a2238');
  ctx.fillStyle = bg; roundRect(ctx, DEVICE.x, DEVICE.y, DEVICE.w, DEVICE.h, 14); ctx.fill();
  ctx.strokeStyle = `rgba(${th.accent},0.9)`; ctx.lineWidth = 2; roundRect(ctx, DEVICE.x, DEVICE.y, DEVICE.w, DEVICE.h, 14); ctx.stroke();
  // 화면
  ctx.fillStyle = 'rgba(6,10,18,0.9)'; roundRect(ctx, DEVICE.x + 14, DEVICE.y + 14, DEVICE.w - 28, 40, 6); ctx.fill();
  ctx.save(); ctx.shadowColor = `rgba(${th.accent},0.9)`; ctx.shadowBlur = 14; ctx.font = '26px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(m.icon, cx, DEVICE.y + 42); ctx.restore();
  ctx.fillStyle = lit ? '#bfffd9' : `rgba(${th.accent},0.95)`; ctx.font = '700 11px "Space Grotesk", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(lit ? 'RESTORED ✓' : 'LOCKED', cx, DEVICE.y + DEVICE.h - 10);
  // 명패
  ctx.fillStyle = 'rgba(10,14,22,0.8)'; roundRect(ctx, cx - 70, DEVICE.y + DEVICE.h + 8, 140, 22, 11); ctx.fill();
  ctx.fillStyle = lit ? '#bfffd9' : '#dce8ff'; ctx.font = '600 12px "Space Grotesk", sans-serif'; ctx.fillText(`${m.mission}`, cx, DEVICE.y + DEVICE.h + 23);

  // 나가기
  const eg = ctx.createLinearGradient(EXIT.x, MAP_H - 30, EXIT.x, MAP_H - 6); eg.addColorStop(0, '#2c3c68'); eg.addColorStop(1, '#1b2740');
  ctx.fillStyle = eg; roundRect(ctx, EXIT.x - 6, MAP_H - 30, EXIT.w + 12, 26, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(111,183,255,0.6)'; ctx.lineWidth = 1.5; roundRect(ctx, EXIT.x - 6, MAP_H - 30, EXIT.w + 12, 26, 8); ctx.stroke();
  ctx.fillStyle = '#cfe0ff'; ctx.font = 'bold 12px "Space Grotesk", sans-serif'; ctx.fillText('🚪 복도로', EXIT.x + EXIT.w / 2, MAP_H - 13);
  ctx.textAlign = 'start';
}
