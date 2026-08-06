// hub.js — Eduino AI : 미니게임천국 · 미니게임 광장(HUB) = 월드맵 레벨 셀렉트.
// 일러스트 카니발 배경(/brand/hub-bg.webp) 위를 EDDIE가 걸어다니며 무대(챕터)를 고른다.
// 진입 UI는 무대를 흉내내지 않고 '명백한 게임 UI'(레벨 노드 메달 + 리본 + 점선 길)로 둔다.
// 월드 크기를 뷰포트에 맞춰(=풀스크린) 채우고, 노드/배경 모두 같은 좌표계라 항상 정렬된다.

import { createWorld } from '../engine/topdown.js';
import { eddieRandom } from '../app/eddieSay.js';
import { sfx } from '../app/sfx.js';
import { mountCurriculumHeader } from '../app/curriculumHeader.js';
import { CHAPTERS, getChapter, chapterDone, chapterUnlocked, chapterClearedCount, chapterTotal } from '../content/curriculum.js';

// 노드 가로 위치(화면 폭 비율 — 배경 무대 4개와 균등 정렬)
const NODE_FX = [0.155, 0.385, 0.615, 0.845];
const NODE_FY = 0.6;     // 노드 중심 y(화면 높이 비율)
const TRIG_W = 150;

export function showHub(root, { onEnter, spawnAt } = {}) {
  root.innerHTML = `
    <div class="scene game-scene scene-fade escape-scene">
      <div class="world-host" id="world-host"></div>
      <div class="hud-hint" id="hud-hint"></div>
      <div class="hud-toast" id="hud-toast"></div>
      <div class="hub-banner" id="hub-banner"></div>
      <div class="hud-controls">⬅➡⬆⬇ 이동 · Space 입장 · EDDIE 클릭 · 상단에서 챕터 이동</div>
      <button class="snd-toggle" id="snd-toggle" title="소리 켜기/끄기">${sfx.muted ? '🔇' : '🔊'}</button>
    </div>`;

  const header = mountCurriculumHeader(root.querySelector('.escape-scene'), {
    active: null, crumb: '미니게임 광장',
    onChapter: (id) => tryEnter(id),
  });

  const host = root.querySelector('#world-host');
  const hintEl = root.querySelector('#hud-hint');
  const toastEl = root.querySelector('#hud-toast');
  const bannerEl = root.querySelector('#hub-banner');
  const sndEl = root.querySelector('#snd-toggle'); sndEl.onclick = () => { const m = sfx.toggle(); sndEl.textContent = m ? '🔇' : '🔊'; };
  // EDDIE 머리 위를 따라다니는 말풍선(가이드) — 하단 자막이 캐릭터를 가리던 문제 해결
  const bubble = document.createElement('div'); bubble.className = 'eddie-bubble'; host.appendChild(bubble);
  let bubbleT = null;
  function guide(text, ms = 5200) { bubble.innerHTML = `🤖 ${text}`; bubble.classList.add('show'); clearTimeout(bubbleT); if (ms) bubbleT = setTimeout(() => bubble.classList.remove('show'), ms); }

  // ----- 뷰포트 기반 레이아웃(풀스크린 채움) -----
  let VW = 1280, VH = 560, gates = [];
  function measure() {
    VW = Math.max(900, host.clientWidth || window.innerWidth);
    VH = Math.max(380, host.clientHeight || (window.innerHeight - 100));
  }
  function buildGates() { gates = CHAPTERS.map((c, i) => ({ ...c, gx: VW * NODE_FX[i], gy: VH * NODE_FY })); }
  const buildWalls = () => ([
    { x: 0, y: 0, w: VW, h: VH * 0.40 },                 // 위쪽 무대/하늘(배경) — 진입 불가
    { x: 0, y: VH * 0.93, w: VW, h: VH * 0.07 },         // 아래 가랜드/울타리
    { x: 0, y: 0, w: 16, h: VH }, { x: VW - 16, y: 0, w: 16, h: VH },
  ]);
  const buildTriggers = () => gates.map((g) => ({ id: g.id, x: g.gx - TRIG_W / 2, y: g.gy + 6, w: TRIG_W, h: 70 }));

  measure(); buildGates();
  let spawnPt = { x: VW * 0.5 - 14, y: VH * 0.84 };
  if (spawnAt) { const g = gates.find((x) => x.id === spawnAt); if (g) spawnPt = { x: g.gx - 14, y: g.gy + 80 }; }

  const map = {
    width: VW, height: VH, bg: '#e7dcc4', playerScale: 1.5,
    spawn: spawnPt,
    walls: buildWalls(),
    triggers: buildTriggers(),
    draw: (ctx, st) => drawHub(ctx, st, gates, VW, VH),
  };

  const world = createWorld(host, map, {
    onInteract: tryEnter,
    onFrame: updateHint,
    onEddieClick: () => guide(eddieRandom(), 3200),
    onDrawOverlay: drawVignette,
  });

  // 창 크기 변하면 월드/노드 위치 다시 맞춰 풀스크린 유지(엔진 캔버스는 자체 리사이즈)
  const onResize = () => { measure(); buildGates(); map.width = VW; map.height = VH; map.walls = buildWalls(); map.triggers = buildTriggers(); };
  window.addEventListener('resize', onResize);

  setTimeout(() => guide('길을 따라 무대로 가서 Space로 입장! 🎮'), 500);

  function destroyAll() { window.removeEventListener('resize', onResize); world.destroy(); header.destroy(); }

  function tryEnter(id) {
    const c = getChapter(id); if (!c) return;
    if (!chapterUnlocked(id)) { toast(`🔒 ${c.short} — 이전 무대를 먼저 클리어해야 열려요`); return; }
    destroyAll(); onEnter?.(id);
  }

  function updateHint(state) {
    // EDDIE 머리 위로 말풍선 따라가기(캔버스 좌표 = host 기준)
    const p = state.player, cam = state.cam;
    bubble.style.left = ((p.x + p.w / 2) - cam.x) + 'px';
    bubble.style.top = (p.y - cam.y - 128) + 'px';

    const tr = state.activeTrigger;
    if (!tr) { bannerEl.classList.remove('show'); return; }
    const c = getChapter(tr.id); if (!c) { bannerEl.classList.remove('show'); return; }
    const unlocked = chapterUnlocked(c.id), done = chapterDone(c.id);
    const i = CHAPTERS.findIndex((x) => x.id === c.id);
    const accent = ['#ffc84a', '#ff7ab8', '#5ac9ff', '#9b8cff'][i % 4];
    const status = done ? '클리어 완료 ✓' : unlocked ? `진척 ${chapterClearedCount(c.id)} / ${chapterTotal(c.id)}` : '잠김 · 이전 무대 먼저';
    bannerEl.innerHTML = `
      <span class="hb-no" style="background:${unlocked ? accent : '#9aa0ac'}">STAGE ${c.no}</span>
      <span class="hb-name">${c.label}</span>
      <span class="hb-status">${status}</span>
      <span class="hb-key">${unlocked ? 'Space 입장 ▸' : '🔒'}</span>`;
    bannerEl.classList.toggle('locked', !unlocked);
    bannerEl.classList.add('show');
  }

  let tT = null;
  function toast(m) { toastEl.textContent = m; toastEl.classList.add('show'); clearTimeout(tT); tT = setTimeout(() => toastEl.classList.remove('show'), 2400); }

  function drawVignette(ctx, st, canvas) {
    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.46, canvas.height * 0.42, canvas.width / 2, canvas.height / 2, canvas.height * 1.02);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(60,30,10,0.20)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

const hubImg = new Image(); hubImg.src = '/brand/hub-bg.webp';
const PAL = [['255,200,74', '255,170,40'], ['255,122,184', '233,80,150'], ['90,201,255', '40,160,235'], ['155,140,255', '120,100,235']];

function drawCover(ctx, img, W, H) {
  const ir = img.naturalWidth / img.naturalHeight, r = W / H;
  let dw, dh; if (ir > r) { dh = H; dw = H * ir; } else { dw = W; dh = W / ir; }
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

function drawHub(ctx, st, gates, VW, VH) {
  const t = st?.t || 0;
  const activeId = st?.activeTrigger?.id || null;
  const s = Math.max(0.9, Math.min(1.6, VH / 620));     // 화면 높이에 따른 노드 스케일
  if (hubImg.complete && hubImg.naturalWidth) {
    drawCover(ctx, hubImg, VW, VH);
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, VH * 0.4); sky.addColorStop(0, '#bfe6ff'); sky.addColorStop(1, '#ffe6f1');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, VW, VH * 0.4);
    const fl = ctx.createLinearGradient(0, VH * 0.4, 0, VH); fl.addColorStop(0, '#ffe7bd'); fl.addColorStop(1, '#f1c98c');
    ctx.fillStyle = fl; ctx.fillRect(0, VH * 0.4, VW, VH * 0.6);
  }
  drawPath(ctx, gates, t, s);
  for (let i = 0; i < gates.length; i++) drawNode(ctx, gates[i], i, gates[i].id === activeId, t, s);
  ctx.textAlign = 'start';
}

function drawPath(ctx, gates, t, s) {
  const R = 30 * s;
  ctx.save();
  ctx.lineWidth = 8 * s; ctx.lineCap = 'round';
  ctx.setLineDash([2, 20 * s]); ctx.lineDashOffset = -(t * 0.6) % (22 * s);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  for (let i = 0; i < gates.length; i++) {
    const x = gates[i].gx, y = gates[i].gy;   // 노드 원 중앙을 통과
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

// 레벨 노드 메달: 바닥 풋라이트 + 글로시 디스크(번호/자물쇠/✓) + 리본 이름표
function drawNode(ctx, g, i, active, t, s) {
  const R = 34 * s, cx = g.gx;
  const unlocked = chapterUnlocked(g.id), done = chapterDone(g.id);
  const [c1, c2] = unlocked ? PAL[i % PAL.length] : ['170,176,186', '120,126,138'];
  const bounce = active && unlocked ? Math.abs(Math.sin(t * 0.16)) * 7 * s : 0;
  const cy = g.gy - bounce;
  const groundY = g.gy + R + 6 * s;

  ctx.textAlign = 'center';

  if (unlocked) {
    const fg = ctx.createRadialGradient(cx, groundY, 4, cx, groundY, 74 * s);
    fg.addColorStop(0, `rgba(${c1},${active ? 0.55 : 0.36})`); fg.addColorStop(1, `rgba(${c1},0)`);
    ctx.fillStyle = fg; ctx.beginPath(); ctx.ellipse(cx, groundY, (active ? 66 : 54) * s, (active ? 20 : 16) * s, 0, 0, 6.283); ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(cx, groundY, 26 * s, 8 * s, 0, 0, 6.283); ctx.fill();

  if (active && unlocked) {
    const p = (t % 60) / 60;
    ctx.strokeStyle = `rgba(${c1},${(1 - p) * 0.7})`; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.arc(cx, cy, R + (4 + p * 14) * s, 0, 6.283); ctx.stroke();
  }

  ctx.save();
  ctx.shadowColor = `rgba(${c1},${active ? 0.85 : 0.6})`; ctx.shadowBlur = (active ? 28 : 18) * s; ctx.shadowOffsetY = 5 * s;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, R + 7 * s, 0, 6.283); ctx.fill();
  ctx.restore();
  // 컬러 림(테두리) — 밝은 배경에서 또렷하게 분리
  ctx.lineWidth = 4 * s; ctx.strokeStyle = `rgb(${c1})`;
  ctx.beginPath(); ctx.arc(cx, cy, R + 5 * s, 0, 6.283); ctx.stroke();
  const disc = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
  disc.addColorStop(0, `rgb(${c1})`); disc.addColorStop(1, `rgb(${c2})`);
  ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();
  const gloss = ctx.createLinearGradient(cx, cy - R, cx, cy);
  gloss.addColorStop(0, 'rgba(255,255,255,0.6)'); gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss; ctx.beginPath(); ctx.ellipse(cx, cy - R * 0.32, R * 0.74, R * 0.5, 0, 0, 6.283); ctx.fill();

  if (!unlocked) {
    ctx.font = `${26 * s}px sans-serif`; ctx.fillStyle = '#eef0f4'; ctx.fillText('🔒', cx, cy + 9 * s);
  } else {
    // 번호 — 크고 굵게 + 어두운 외곽선으로 팝
    ctx.font = `900 ${32 * s}px "Space Grotesk", sans-serif`;
    ctx.lineWidth = 5 * s; ctx.lineJoin = 'round'; ctx.strokeStyle = `rgba(${c2},0.85)`;
    ctx.strokeText(String(g.no), cx, cy + 11 * s);
    ctx.fillStyle = '#fff'; ctx.fillText(String(g.no), cx, cy + 11 * s);
    if (done) {
      const bx = cx + R - 4 * s, by = cy - R + 6 * s, br = 11 * s;
      ctx.fillStyle = '#3ad07a'; ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.283); ctx.stroke();
      ctx.font = `700 ${13 * s}px sans-serif`; ctx.fillStyle = '#fff'; ctx.fillText('✓', bx, by + 5 * s);
    }
  }

  const label = g.short || g.label;
  ctx.font = `700 ${12 * s}px "Space Grotesk", sans-serif`;
  const rw = Math.max(64 * s, ctx.measureText(label).width + 22 * s), rh = 22 * s;
  const ry = cy + R + 12 * s, rx = cx - rw / 2;
  ctx.fillStyle = unlocked ? `rgb(${c2})` : 'rgba(130,135,148,0.95)';
  ribbon(ctx, rx, ry, rw, rh);
  ctx.fillStyle = '#fff'; ctx.fillText(label, cx, ry + 15 * s);

  if (active && unlocked) {
    const ky = cy - R - 14 * s + Math.sin(t * 0.16) * 2;
    ctx.font = `800 ${12 * s}px "Space Grotesk", sans-serif`; ctx.fillStyle = `rgb(${c1})`;
    ctx.fillText('▼ Space', cx, ky);
  }
}

function ribbon(ctx, x, y, w, h) {
  const notch = h * 0.32;
  ctx.beginPath();
  ctx.moveTo(x + notch, y); ctx.lineTo(x + w - notch, y);
  ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w - notch, y + h);
  ctx.lineTo(x + notch, y + h); ctx.lineTo(x, y + h / 2);
  ctx.closePath(); ctx.fill();
}
