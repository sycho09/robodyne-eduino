// chapter.js — 무대 안(부스 목록). 부스로 입장해 미니게임을 클리어하면 ✓, 모두 클리어하면 다음 무대 개방.
// 밝은 미니게임천국 톤: 따뜻한 부스 내부(스테이지별 배경 슬롯) + 글로시 스톨 카드(메달 컬러).

import { createWorld } from '../engine/topdown.js';
import { eddieRandom } from '../app/eddieSay.js';
import { sfx } from '../app/sfx.js';
import { mountCurriculumHeader } from '../app/curriculumHeader.js';
import { getChapter, chapterRooms, isRoomCleared } from '../content/curriculum.js';

let CARD_W = 184, CARD_H = 128;          // 단일 부스면 더 크게(showChapter에서 조정)
const COL_W = 344, ROW_H = 312, MARGIN = 80;
const PAL = [['255,200,74', '255,170,40'], ['255,122,184', '233,80,150'], ['90,201,255', '40,160,235'], ['155,140,255', '120,100,235'], ['120,220,150', '60,185,110']];

// 스테이지별 배경(있으면 사용): /brand/stage-{chapterId}-bg.webp (없으면 .png 도 시도)
const STAGE_IMG = {};
function stageImg(id) { if (!STAGE_IMG[id]) { const im = new Image(); im.onerror = () => { if (!im._p) { im._p = 1; im.src = `/brand/stage-${id}-bg.png`; } }; im.src = `/brand/stage-${id}-bg.webp`; STAGE_IMG[id] = im; } return STAGE_IMG[id]; }
// 부스 대표 썸네일(있으면 사용): /brand/game-{roomId}-cover.webp (없으면 .png 도 시도)
const COVER_IMG = {};
function coverImg(id) { if (!COVER_IMG[id]) { const im = new Image(); im.onerror = () => { if (!im._p) { im._p = 1; im.src = `/brand/game-${id}-cover.png`; } }; im.src = `/brand/game-${id}-cover.webp`; COVER_IMG[id] = im; } return COVER_IMG[id]; }
function drawCoverInto(ctx, img, x, y, w, h) {
  const ir = img.naturalWidth / img.naturalHeight, r = w / h;
  let dw, dh; if (ir > r) { dh = h; dw = h * ir; } else { dw = w; dh = w / ir; }
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
// 썸네일 전체가 보이도록(잘림 없이) 안에 맞춰 그림
function drawContainInto(ctx, img, x, y, w, h) {
  const ir = img.naturalWidth / img.naturalHeight, r = w / h;
  let dw, dh; if (ir > r) { dw = w; dh = w / ir; } else { dh = h; dw = h * ir; }
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

export function showChapter(root, { chapter, onRoom, onExit, onChapter, spawnAt } = {}) {
  const ch = getChapter(chapter);
  const rooms = chapterRooms(chapter);
  // 부스가 하나뿐이면 크게(휑함 방지). 여러 개면 표준 크기.
  CARD_W = rooms.length <= 1 ? 340 : 268;
  CARD_H = rooms.length <= 1 ? 222 : 214;
  // 6개 부스 = 3개씩 두 줄(3×2). 4~6개는 3열, 7~8개는 4열.
  const cols = rooms.length <= 1 ? 1 : rooms.length <= 3 ? rooms.length : rooms.length <= 6 ? 3 : rooms.length <= 8 ? 4 : 5;
  const rowsN = Math.ceil(rooms.length / cols);

  // 뷰포트에 맞춰 월드를 채우고(작아 보이던 문제), 부스 격자를 '가운데' 정렬
  const VW = Math.max(900, window.innerWidth);
  const VH = Math.max(420, window.innerHeight - 96);
  const gridW = cols * COL_W, gridH = rowsN * ROW_H;
  const MAP_W = Math.max(VW, gridW + MARGIN * 2);
  const MAP_H = Math.max(VH, gridH + 220);
  const offX = (MAP_W - gridW) / 2;
  const offY = Math.max(96, (MAP_H - gridH - 90) / 2);

  const cells = rooms.map((r, i) => {
    const col = i % cols, row = (i / cols) | 0;
    const x = offX + col * COL_W + (COL_W - CARD_W) / 2;
    const y = offY + row * ROW_H;
    return { ...r, idx: i, cx: x, cy: y };
  });
  const EXIT = { x: MAP_W / 2 - 40, y: MAP_H - 60, w: 80, h: 42 };

  const firstReady = cells.find((c) => c.status === 'ready') || cells[0];
  let spawnPt = firstReady
    ? { x: firstReady.cx + CARD_W / 2 - 14, y: firstReady.cy + CARD_H + 16 }
    : { x: MAP_W / 2 - 14, y: MAP_H - 120 };
  if (spawnAt) { const c = cells.find((x) => x.id === spawnAt); if (c) spawnPt = { x: c.cx + CARD_W / 2 - 14, y: c.cy + CARD_H + 16 }; }

  // 소품(풍선·장애물 등)은 제거 — 새 배경이 장식을 담당, 부스 카드만 깔끔히 중앙 배치
  const props = [];

  root.innerHTML = `
    <div class="scene game-scene scene-fade escape-scene">
      <div class="world-host" id="world-host"></div>
      <div class="medal-shelf" id="medal-shelf"></div>
      <div class="hud-hint" id="hud-hint"></div>
      <div class="hud-toast" id="hud-toast"></div>
      <div class="hud-controls">⬆⬇⬅➡ 이동 · Space 입장/조작 · 🎪 광장으로 · EDDIE 클릭</div>
      <button class="snd-toggle" id="snd-toggle" title="소리 켜기/끄기">${sfx.muted ? '🔇' : '🔊'}</button>
    </div>`;

  const header = mountCurriculumHeader(root.querySelector('.escape-scene'), {
    active: chapter, crumb: `${ch.short} · ${ch.act}`,
    onChapter: (id) => { if (id !== chapter) { destroyAll(); (onChapter || (() => onExit?.()))(id); } },
  });

  renderMedals(root.querySelector('#medal-shelf'), cells);

  const host = root.querySelector('#world-host');
  const hintEl = root.querySelector('#hud-hint');
  const toastEl = root.querySelector('#hud-toast');
  const sndEl = root.querySelector('#snd-toggle'); sndEl.onclick = () => { const m = sfx.toggle(); sndEl.textContent = m ? '🔇' : '🔊'; };
  // EDDIE 머리 위 말풍선(가이드)
  const bubble = document.createElement('div'); bubble.className = 'eddie-bubble'; host.appendChild(bubble);
  let bubbleT = null;
  function guide(text, ms = 5000) { bubble.innerHTML = `🤖 ${text}`; bubble.classList.add('show'); clearTimeout(bubbleT); if (ms) bubbleT = setTimeout(() => bubble.classList.remove('show'), ms); }

  const map = {
    width: MAP_W, height: MAP_H, bg: '#e7dcc4', playerScale: 1.3,
    spawn: spawnPt,
    walls: [
      { x: 0, y: 0, w: MAP_W, h: 24 }, { x: 0, y: MAP_H - 24, w: MAP_W, h: 24 },
      { x: 0, y: 0, w: 24, h: MAP_H }, { x: MAP_W - 24, y: 0, w: 24, h: MAP_H },
      ...cells.map((c) => ({ x: c.cx, y: c.cy, w: CARD_W, h: CARD_H })),
      ...props.filter((p) => p.solid).map((p) => ({ x: p.x + 6, y: p.y + p.h * 0.4, w: p.w - 12, h: p.h * 0.55 })),
    ],
    triggers: [
      ...cells.map((c) => ({ id: c.id, x: c.cx, y: c.cy + CARD_H, w: CARD_W, h: 48 })),
      ...props.filter((p) => p.act).map((p) => ({ id: 'prop_' + p.i, x: p.x - 8, y: p.y + p.h - 6, w: p.w + 16, h: 44 })),
      { id: '__exit', ...EXIT },
    ],
    draw: (ctx, st) => drawChapter(ctx, st, cells, props, MAP_W, MAP_H, EXIT, ch),
  };

  const world = createWorld(host, map, {
    onInteract: handle,
    onFrame: updateHint,
    onEddieClick: () => guide(eddieRandom(), 3200),
    onDrawOverlay: drawVignette,
  });

  setTimeout(() => guide(`${ch.short} 입장! 부스에서 Space로 메달 획득 🎖️`), 500);

  function destroyAll() { try { world.destroy(); } catch (_) {} header.destroy(); }

  const POP_LINES = { balloon: ['펑! 🎈', '풍선 터졌다! 🎉', '하나 더 터뜨려봐!'], popcorn: ['팝콘 튀어나온다! 🍿', '고소해~ 🍿', '와그작 🍿'] };
  function handle(id) {
    if (id === '__exit') { destroyAll(); onExit?.(); return; }
    if (id.startsWith('prop_')) {                 // 인터랙션 소품(Space로 변함)
      const p = props.find((x) => 'prop_' + x.i === id); if (!p) return;
      p.state = (p.state + 1) % 2; p.anim = 0;
      sfx.pop(); const lines = POP_LINES[p.type] || ['짠! ✨']; guide(lines[Math.floor(Math.random() * lines.length)], 1800);
      if (p.type === 'balloon') { setTimeout(() => { p.state = 0; }, 2600); }   // 풍선은 다시 차오름
      return;
    }
    const r = cells.find((c) => c.id === id); if (!r) return;
    if (r.status !== 'ready') { soonModal(r); return; }
    if (isRoomCleared(r.id)) { world.pause(); confirmReenter(r, () => { destroyAll(); onRoom?.(id); }, () => world.resume()); return; }
    destroyAll(); onRoom?.(id);
  }

  function confirmReenter(r, yes, no) {
    const m = document.createElement('div'); m.className = 'modal-backdrop';
    m.innerHTML = `<div class="modal"><h3>✅ ${r.icon} ${r.name} — 클리어한 부스</h3>
      <p>이미 메달을 받은 부스예요. <b>다시 플레이할까요?</b></p>
      <div class="modal-actions"><button class="btn" id="re-no">아니오</button><button class="btn primary" id="re-yes">예, 다시 ▶</button></div></div>`;
    document.body.appendChild(m);
    m.querySelector('#re-no').onclick = () => { m.remove(); no(); };
    m.querySelector('#re-yes').onclick = () => { m.remove(); yes(); };
  }

  function soonModal(r) {
    world.pause();
    const m = document.createElement('div'); m.className = 'modal-backdrop';
    m.innerHTML = `<div class="modal"><h3>${r.icon} ${r.name} · ${r.mission}</h3>
      <p><b>준비중인 부스</b>예요. 곧 미니게임으로 만나요!<br/>
      <span class="muted">개념: ${r.concept} · 보상: ${r.reward}</span></p>
      <div class="modal-actions"><button class="btn primary" id="soon-ok">알겠어요 ▶</button></div></div>`;
    document.body.appendChild(m);
    m.querySelector('#soon-ok').onclick = () => { m.remove(); world.resume(); };
  }

  function updateHint(state) {
    const p = state.player, cam = state.cam;
    bubble.style.left = ((p.x + p.w / 2) - cam.x) + 'px';
    bubble.style.top = (p.y - cam.y - 120) + 'px';

    const tr = state.activeTrigger;
    if (!tr) { hintEl.classList.remove('show'); return; }
    if (tr.id === '__exit') { hintEl.innerHTML = '🎪 Space · 광장으로 나가기'; hintEl.classList.add('show'); return; }
    if (tr.id.startsWith('prop_')) { hintEl.innerHTML = '✨ Space · 만져보기'; hintEl.classList.add('show'); return; }
    const r = cells.find((c) => c.id === tr.id); if (!r) { hintEl.classList.remove('show'); return; }
    const clr = isRoomCleared(r.id);
    hintEl.innerHTML = r.status === 'ready'
      ? (clr ? `${r.icon} ${r.name} · 클리어 ✓ (다시 플레이)` : `▶ Space · <b>${r.icon} ${r.name}</b> — ${r.mission}`)
      : `🔒 ${r.icon} ${r.name} (준비중)`;
    hintEl.classList.add('show');
  }

  let tT = null;
  function toast(m) { toastEl.textContent = m; toastEl.classList.add('show'); clearTimeout(tT); tT = setTimeout(() => toastEl.classList.remove('show'), 2400); }

  // 밝은 톤: 은은한 따뜻한 비네트만
  function drawVignette(ctx, st, canvas) {
    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.46, canvas.height * 0.42, canvas.width / 2, canvas.height / 2, canvas.height * 1.02);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(60,30,10,0.22)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawCover(ctx, img, W, H) {
  const ir = img.naturalWidth / img.naturalHeight, r = W / H;
  let dw, dh; if (ir > r) { dh = H; dw = H * ir; } else { dw = W; dh = W / ir; }
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

function drawChapter(ctx, st, cells, props, MAP_W, MAP_H, EXIT, ch) {
  const t = st?.t || 0;
  const img = stageImg(ch.id);
  if (img.complete && img.naturalWidth) {
    drawCover(ctx, img, MAP_W, MAP_H);
    ctx.fillStyle = 'rgba(30,18,40,0.22)'; ctx.fillRect(0, 0, MAP_W, MAP_H);   // 카드가 뜨도록 살짝 가라앉힘
  } else {
    // 따뜻한 부스 내부(폴백): 위쪽 천막 줄무늬 띠 + 나무 바닥
    const top = ctx.createLinearGradient(0, 0, 0, 150); top.addColorStop(0, '#f3e6d2'); top.addColorStop(1, '#e9d2bf');
    ctx.fillStyle = top; ctx.fillRect(0, 0, MAP_W, 150);
    ctx.fillStyle = 'rgba(220,120,120,0.16)';
    for (let x = 0; x < MAP_W; x += 64) ctx.fillRect(x, 0, 32, 150);
    const fl = ctx.createLinearGradient(0, 150, 0, MAP_H); fl.addColorStop(0, '#e7cfa6'); fl.addColorStop(1, '#d8b889');
    ctx.fillStyle = fl; ctx.fillRect(0, 150, MAP_W, MAP_H - 150);
    ctx.strokeStyle = 'rgba(120,90,50,0.18)'; ctx.lineWidth = 2;
    for (let y = 188; y < MAP_H; y += 46) { ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(MAP_W - 24, y); ctx.stroke(); }
  }
  bunting(ctx, MAP_W, t);

  // 소품을 y 순으로(뒤→앞) 그려 겹침 자연스럽게
  ctx.textAlign = 'center';
  const drawList = [...cells.map((c) => ({ y: c.cy, kind: 'cell', o: c })), ...props.map((p) => ({ y: p.y, kind: 'prop', o: p }))]
    .sort((a, b) => a.y - b.y);
  for (const d of drawList) { if (d.kind === 'cell') drawStall(ctx, d.o, t); else drawProp(ctx, d.o, t); }

  // 나가기(광장으로)
  ctx.save();
  ctx.fillStyle = 'rgba(20,26,44,0.9)'; rr(ctx, EXIT.x - 10, EXIT.y, EXIT.w + 20, 28, 9); ctx.fill();
  ctx.strokeStyle = 'rgba(255,210,120,0.85)'; ctx.lineWidth = 2; rr(ctx, EXIT.x - 10, EXIT.y, EXIT.w + 20, 28, 9); ctx.stroke();
  ctx.fillStyle = '#ffe6b0'; ctx.font = '800 12px "Space Grotesk", sans-serif'; ctx.fillText('🎪 광장으로', EXIT.x + EXIT.w / 2, EXIT.y + 18);
  ctx.restore();
  ctx.textAlign = 'start';
}

// 밝은 글로시 스톨 카드(메달 컬러)
function drawStall(ctx, c, t) {
  const ready = c.status === 'ready', clr = isRoomCleared(c.id);
  const [c1, c2] = clr ? ['255,205,80', '245,170,40'] : ready ? PAL[c.idx % PAL.length] : ['175,180,190', '135,140,150'];
  const fx = c.cx, fy = c.cy, fw = CARD_W, fh = CARD_H, cx = fx + fw / 2;

  // 바닥 풋라이트 + 접지 그림자
  if (ready || clr) {
    const fg = ctx.createRadialGradient(cx, fy + fh + 14, 4, cx, fy + fh + 14, 76);
    fg.addColorStop(0, `rgba(${c1},0.32)`); fg.addColorStop(1, `rgba(${c1},0)`);
    ctx.fillStyle = fg; ctx.beginPath(); ctx.ellipse(cx, fy + fh + 14, 70, 18, 0, 0, 6.283); ctx.fill();
  }
  ctx.fillStyle = 'rgba(60,40,20,0.18)'; ctx.beginPath(); ctx.ellipse(cx, fy + fh + 12, 56, 9, 0, 0, 6.283); ctx.fill();

  // 카드 패널(밝은 글래스)
  ctx.save();
  ctx.shadowColor = 'rgba(40,24,10,0.3)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 8;
  const pf = ctx.createLinearGradient(fx, fy, fx, fy + fh);
  pf.addColorStop(0, 'rgba(255,255,255,0.97)'); pf.addColorStop(1, 'rgba(248,243,235,0.97)');
  ctx.fillStyle = pf; rr(ctx, fx, fy, fw, fh, 14); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = `rgba(${c1},0.95)`; ctx.lineWidth = 2.5; rr(ctx, fx, fy, fw, fh, 14); ctx.stroke();

  // 대표 썸네일(있으면) — 전체가 보이도록 contain / 없으면 차양+이모지
  const cov = coverImg(c.id);
  const hasCover = (ready || clr) && cov.complete && cov.naturalWidth;
  if (hasCover) {
    ctx.save();
    rr(ctx, fx + 5, fy + 5, fw - 10, fh - 34, 11); ctx.clip();
    ctx.fillStyle = 'rgba(18,14,26,0.06)'; ctx.fillRect(fx + 5, fy + 5, fw - 10, fh - 34);
    drawContainInto(ctx, cov, fx + 7, fy + 7, fw - 14, fh - 40);
    if (clr) { ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(fx + 5, fy + 5, fw - 10, fh - 34); }
    ctx.restore();
    ctx.fillStyle = `rgba(${c2},0.95)`; rr(ctx, fx + 6, fy + 6, fw - 12, 8, 4); ctx.fill();   // 상단 얇은 컬러 바
  } else {
    ctx.fillStyle = `rgba(${c2},0.95)`; rr(ctx, fx + 6, fy + 6, fw - 12, 22, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let x = fx + 10; x < fx + fw - 12; x += 20) ctx.fillRect(x, fy + 6, 10, 22);
    ctx.font = '36px sans-serif'; ctx.fillStyle = ready || clr ? '#1a1f2e' : '#8a8f9c'; ctx.textAlign = 'center';
    ctx.fillText(clr ? '✅' : ready ? c.icon : '🔒', cx, fy + fh / 2 + 8);
  }

  // 센서 힌트 칩(좌상단) — 어떤 부품을 쓰는지 암시
  ctx.fillStyle = 'rgba(255,255,255,0.96)'; rr(ctx, fx + 8, fy + 8, 32, 28, 9); ctx.fill();
  ctx.strokeStyle = `rgba(${c2},0.9)`; ctx.lineWidth = 1.5; rr(ctx, fx + 8, fy + 8, 32, 28, 9); ctx.stroke();
  ctx.font = '17px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(c.icon, fx + 24, fy + 28);
  if (clr && hasCover) { ctx.font = '26px sans-serif'; ctx.fillText('✅', cx, fy + fh / 2 + 2); }

  // 이름 + 상태(하단 흰 바)
  ctx.fillStyle = 'rgba(255,255,255,0.94)'; rr(ctx, fx + 4, fy + fh - 34, fw - 8, 30, 8); ctx.fill();
  ctx.font = '800 12.5px "Space Grotesk", sans-serif'; ctx.fillStyle = '#23283a';
  ctx.fillText(c.name, cx, fy + fh - 22);
  if (clr) { ctx.font = '10px "Space Grotesk", sans-serif'; ctx.fillStyle = 'rgba(210,150,20,1)'; ctx.fillText('클리어 ✓', cx, fy + fh - 8); }
  else if (ready) { ctx.font = '10px "Space Grotesk", sans-serif'; ctx.fillStyle = `rgba(${c2},1)`; ctx.fillText('▶ 입장하기', cx, fy + fh - 8); }
  else { ctx.font = '700 10px "Space Grotesk", sans-serif'; ctx.fillStyle = 'rgba(150,120,60,0.95)'; ctx.fillText('준비중 · 곧 공개', cx, fy + fh - 8); }

  // PLAY 핀(플레이 가능 + 미클리어): 살짝 둥실
  if (ready && !clr) {
    const py = fy - 12 + Math.sin(t * 0.14 + c.idx) * 2;
    ctx.fillStyle = `rgb(${c1})`; rr(ctx, fx + fw - 46, py, 40, 18, 9); ctx.fill();
    ctx.fillStyle = '#2a1500'; ctx.font = '800 9.5px "Space Grotesk", sans-serif'; ctx.fillText('PLAY', fx + fw - 26, py + 12);
  }
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ── 소품(장식/장애물/인터랙션) ──
const PKIND = {
  crate: { w: 58, h: 54, solid: true }, barrel: { w: 50, h: 60, solid: true },
  hay: { w: 66, h: 46, solid: true }, speaker: { w: 50, h: 62, solid: true },
  balloon: { w: 46, h: 66, act: true }, popcorn: { w: 54, h: 66, act: true },
  flag: { w: 32, h: 72 }, lamp: { w: 30, h: 80 }, plant: { w: 50, h: 54 },
};

function rectsOverlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

// 유기적 배치: 부스 영역 밖에 풍선 위주로 자연스럽게 흩뿌리고, 아래일수록 크게(공간감).
function buildProps(cells, EXIT, spawn, MAP_W, MAP_H, offY) {
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (const c of cells) { minx = Math.min(minx, c.cx); miny = Math.min(miny, c.cy); maxx = Math.max(maxx, c.cx + CARD_W); maxy = Math.max(maxy, c.cy + CARD_H); }
  const avoid = [
    { x: minx - 60, y: miny - 44, w: (maxx - minx) + 120, h: (maxy - miny) + 150 },   // 부스 영역
    { x: EXIT.x - 70, y: EXIT.y - 70, w: EXIT.w + 140, h: EXIT.h + 110 },
    { x: spawn.x - 80, y: spawn.y - 70, w: 170, h: 180 },
  ];
  const TYPES = ['balloon', 'speaker', 'flag', 'balloon', 'lamp', 'hay', 'balloon', 'speaker', 'flag', 'balloon', 'popcorn', 'lamp', 'balloon', 'plant'];
  let seed = 9; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const out = []; let tries = 0;
  while (out.length < 16 && tries < 600) {
    tries++;
    const type = TYPES[(out.length * 5 + tries) % TYPES.length], base = PKIND[type];
    const x = 36 + rnd() * (MAP_W - 72);
    const y = (offY - 76) + rnd() * (MAP_H - 70 - (offY - 76));
    const scale = 0.78 + (y / MAP_H) * 0.7;                  // 아래일수록 큼 = 원근감
    const w = base.w * scale, h = base.h * scale, box = { x, y, w, h };
    if (x < 32 || x + w > MAP_W - 32 || y + h > MAP_H - 58) continue;
    if (avoid.some((a) => rectsOverlap(box, a))) continue;
    if (out.some((p) => rectsOverlap({ x: x - 36, y: y - 36, w: w + 72, h: h + 72 }, p))) continue;
    out.push({ i: out.length, type, x, y, w, h, solid: !!base.solid, act: !!base.act, state: 0 });
  }
  return out;
}

function renderMedals(el, cells) {
  const total = cells.length, got = cells.filter((c) => isRoomCleared(c.id)).length;
  el.innerHTML = `<div class="ms-title">🎖️ 메달 <b>${got}</b> <span>/ ${total}</span></div>
    <div class="ms-row">${cells.map((c) => {
      const clr = isRoomCleared(c.id); const em = (c.reward || '🏅').split(' ')[0];
      return `<span class="ms-slot ${clr ? 'got' : ''}" title="${c.name}${clr ? ' · 획득' : ''}">${clr ? em : '·'}</span>`;
    }).join('')}</div>`;
}

function drawProp(ctx, p, t) {
  const x = p.x, y = p.y, w = p.w, h = p.h, cx = x + w / 2, by = y + h;
  // 접지 그림자
  ctx.fillStyle = 'rgba(50,32,16,0.2)'; ctx.beginPath(); ctx.ellipse(cx, by - 2, w * 0.46, 7, 0, 0, 6.283); ctx.fill();
  ctx.textAlign = 'center'; ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(40,26,14,0.55)';
  if (p.type === 'crate') {
    ctx.fillStyle = '#c08a4e'; rr(ctx, x, y, w, h, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(90,58,28,0.7)'; ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + w - 4, y + h - 4); ctx.moveTo(x + w - 4, y + 4); ctx.lineTo(x + 4, y + h - 4); ctx.stroke();
  } else if (p.type === 'barrel') {
    ctx.fillStyle = '#b6803f'; rr(ctx, x + 3, y, w - 6, h, 12); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(80,50,22,0.7)'; for (const yy of [y + h * 0.28, y + h * 0.62]) { ctx.beginPath(); ctx.moveTo(x + 3, yy); ctx.lineTo(x + w - 3, yy); ctx.stroke(); }
  } else if (p.type === 'hay') {
    ctx.fillStyle = '#e3c466'; rr(ctx, x, y, w, h, 12); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(150,110,40,0.5)'; for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x + 5, y + h * i / 5); ctx.lineTo(x + w - 5, y + h * i / 5); ctx.stroke(); }
  } else if (p.type === 'speaker') {
    ctx.fillStyle = '#2c3040'; rr(ctx, x, y, w, h, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#11141d'; ctx.beginPath(); ctx.arc(cx, y + h * 0.34, w * 0.28, 0, 6.283); ctx.arc(cx, y + h * 0.72, w * 0.18, 0, 6.283); ctx.fill();
  } else if (p.type === 'flag') {
    ctx.strokeStyle = '#8a6a44'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx, by); ctx.stroke();
    const wv = Math.sin(t * 0.12) * 5; ctx.fillStyle = ['#ff6b6b', '#ffd24a', '#6fb7ff'][p.i % 3];
    ctx.beginPath(); ctx.moveTo(cx, y + 4); ctx.lineTo(cx + 30 + wv, y + 16); ctx.lineTo(cx, y + 30); ctx.closePath(); ctx.fill();
  } else if (p.type === 'lamp') {
    ctx.strokeStyle = '#6f5238'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, y + 16); ctx.lineTo(cx, by); ctx.stroke();
    const glow = 0.5 + 0.4 * Math.sin(t * 0.09 + p.i);
    ctx.fillStyle = `rgba(255,220,120,${glow * 0.5})`; ctx.beginPath(); ctx.arc(cx, y + 14, 20, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#ffe07a'; ctx.beginPath(); ctx.arc(cx, y + 14, 10, 0, 6.283); ctx.fill(); ctx.strokeStyle = 'rgba(120,90,40,0.6)'; ctx.stroke();
  } else if (p.type === 'plant') {
    ctx.fillStyle = '#b9743f'; rr(ctx, x + w * 0.18, y + h * 0.5, w * 0.64, h * 0.5, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5cae5a'; for (const dx of [-12, 0, 12]) { ctx.beginPath(); ctx.ellipse(cx + dx, y + h * 0.42, 9, 18, dx * 0.04, 0, 6.283); ctx.fill(); }
  } else if (p.type === 'balloon') {
    ctx.strokeStyle = 'rgba(120,120,140,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, by); ctx.lineTo(cx, y + h * 0.55); ctx.stroke();
    if (p.state === 0) {
      const fly = Math.sin(t * 0.1 + p.i) * 3;
      ctx.fillStyle = ['#ff6b6b', '#6fb7ff', '#ffd24a', '#b18bff'][p.i % 4];
      ctx.beginPath(); ctx.ellipse(cx, y + h * 0.32 + fly, w * 0.42, h * 0.34, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(cx - 6, y + h * 0.24 + fly, 5, 8, -0.4, 0, 6.283); ctx.fill();
    } else { ctx.fillStyle = '#ffd24a'; ctx.font = '20px sans-serif'; ctx.fillText('💥', cx, y + h * 0.4); }
  } else if (p.type === 'popcorn') {
    ctx.fillStyle = '#e85a5a'; rr(ctx, x, y + h * 0.4, w, h * 0.6, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < 5; i++) ctx.fillRect(x + 4 + i * 10, y + h * 0.4, 5, h * 0.6);
    ctx.font = '16px sans-serif'; const pop = p.state ? '🍿🍿🍿' : '🍿';
    ctx.fillText(pop, cx, y + h * 0.34);
  }
  ctx.lineWidth = 1;
}

function bunting(ctx, W, t) {
  ctx.save();
  ctx.strokeStyle = 'rgba(90,60,40,0.45)'; ctx.lineWidth = 2;
  ctx.beginPath(); for (let x = 0; x <= W; x += 8) ctx.lineTo(x, 16 + Math.sin(x / 90) * 10); ctx.stroke();
  const cols = ['#ff6b6b', '#ffd24a', '#5ad17a', '#6fb7ff', '#b18bff'];
  for (let i = 0, x = 34; x < W; x += 64, i++) {
    const y = 24 + Math.sin(x / 90) * 10, tw = 0.45 + 0.35 * Math.sin(t * 0.1 + i);
    ctx.fillStyle = `rgba(255,240,180,${tw})`; ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.283); ctx.fill();
    ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 6.283); ctx.fill();
  }
  ctx.restore();
}
