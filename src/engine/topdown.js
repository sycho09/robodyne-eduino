// topdown.js — 2D 탑다운 엔진 (포켓몬 골드 스타일)
// Canvas 기반. 방향키/WASD 자유 이동 + AABB 충돌 + 접촉 트리거(Space 상호작용).
// EDDIE 는 벡터(SVG)를 래스터화해 아바타로 그린다.
//
// map: {
//   width, height,            // 월드 픽셀 크기
//   bg,                       // 뷰 배경색
//   spawn:{x,y},
//   walls:[{x,y,w,h}],        // 충돌
//   triggers:[{id,x,y,w,h,auto?}],  // 접촉 영역 (auto=진입 시 자동 발동)
//   draw(ctx, state),         // 환경 렌더 (월드 좌표)
// }
// handlers: { onInteract(id,tr), onAuto(id,tr), onFrame(state), onDrawOverlay(ctx,state,canvas) }

import eddieSvg from '../assets/eddie.svg?raw';
import { isTablet, setMode, onModeChange } from '../app/device.js';

const eddieImg = new Image();
eddieImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(eddieSvg);

// EDDIE 탑다운 4방향 스프라이트(있으면 사용): /brand/eddie/dir/{down,up,left,right}.webp
const DIR_IMG = { down: new Image(), up: new Image(), left: new Image(), right: new Image() };
for (const d in DIR_IMG) DIR_IMG[d].src = `/brand/eddie/dir/${d}.webp`;
const dirLoaded = (d) => DIR_IMG[d] && DIR_IMG[d].complete && DIR_IMG[d].naturalWidth > 0;

// EDDIE 히어로 한 장(좌우 반전으로 방향 표현). map.eddieSrc 로 방별 코스튬 교체 가능.
const DEFAULT_HERO = '/brand/eddie/eddie-hero.webp';
const heroCache = {};
function heroFor(src) { const key = src || DEFAULT_HERO; if (!heroCache[key]) { const im = new Image(); im.src = key; heroCache[key] = im; } return heroCache[key]; }

const MOVE_KEYS = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'];

export function createWorld(container, map, handlers = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'world-canvas';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const state = {
    player: { x: map.spawn.x, y: map.spawn.y, w: 28, h: 30, face: 1, dir: 'down', moving: false },
    keys: new Set(),
    joy: { x: 0, y: 0 },
    paused: false,
    t: 0,
    activeTrigger: null,
    firedAuto: new Set(),
    disabled: new Set(),
    cam: { x: 0, y: 0 },
    tint: null,
    raf: 0,
  };

  function resize() {
    canvas.width = container.clientWidth || window.innerWidth;
    canvas.height = container.clientHeight || window.innerHeight;
  }
  resize();
  const onResize = () => resize();
  window.addEventListener('resize', onResize);

  function onKey(e, down) {
    if (state.paused) return;             // 일시정지(룸 패널 등) 중엔 입력 가로채지 않음 → 에디터 타이핑 보호
    const k = e.key.toLowerCase();
    if (MOVE_KEYS.includes(k)) {
      e.preventDefault();
      if (down) state.keys.add(k); else state.keys.delete(k);
    }
    if (down && (k === ' ' || k === 'enter')) { e.preventDefault(); interact(); }
  }
  const kd = (e) => onKey(e, true);
  const ku = (e) => onKey(e, false);
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);

  // EDDIE 클릭 → 랜덤 대사 콜백
  const onPointer = (e) => {
    if (state.paused) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left + state.cam.x;
    const my = e.clientY - rect.top + state.cam.y;
    const p = state.player;
    if (mx >= p.x - 14 && mx <= p.x + p.w + 14 && my >= p.y - 46 && my <= p.y + p.h + 4) {
      handlers.onEddieClick?.(p.x + p.w / 2 - state.cam.x, p.y + p.h - 58 - state.cam.y);
    }
  };
  canvas.addEventListener('pointerdown', onPointer);

  // ── 터치 조작(태블릿 모드) — 아날로그 조이스틱 + 상호작용 버튼. CSS 가 data-mode 로 표시/숨김.
  const touch = document.createElement('div');
  touch.className = 'td-touch' + (map.lockVertical ? ' td-lockv' : '');
  touch.innerHTML =
    `<div class="td-joy" aria-label="이동 조이스틱"><div class="td-knob"></div></div>
     <button class="td-act" aria-label="확인">✔</button>
     <button class="td-modetoggle" aria-label="모드 전환">${isTablet() ? '📱 태블릿 모드' : '🖥️ PC 모드'}</button>`;
  container.appendChild(touch);
  // 조이스틱: 중심 기준 벡터를 state.joy(-1~1)로. setPointerCapture 로 밖으로 나가도 추적.
  const joy = touch.querySelector('.td-joy'), knob = touch.querySelector('.td-knob');
  const R = 50; let joyId = null, jcx = 0, jcy = 0;
  const joyMove = (e) => {
    if (joyId !== e.pointerId) return;
    let dx = e.clientX - jcx, dy = e.clientY - jcy; const d = Math.hypot(dx, dy);
    const m = d > 0 ? Math.min(1, d / R) / d : 0; dx *= m; dy *= m;
    state.joy.x = dx; state.joy.y = dy; knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
  };
  const joyEnd = (e) => { if (joyId !== e.pointerId) return; joyId = null; state.joy.x = 0; state.joy.y = 0; knob.style.transform = 'translate(0,0)'; };
  joy.addEventListener('pointerdown', (e) => {
    e.preventDefault(); if (state.paused) return;
    joyId = e.pointerId; const r = joy.getBoundingClientRect(); jcx = r.left + r.width / 2; jcy = r.top + r.height / 2;
    try { joy.setPointerCapture(e.pointerId); } catch (_) {}
    joyMove(e);
  });
  joy.addEventListener('pointermove', joyMove);
  joy.addEventListener('pointerup', joyEnd);
  joy.addEventListener('pointercancel', joyEnd);
  touch.querySelector('.td-act').addEventListener('pointerdown', (e) => { e.preventDefault(); interact(); });
  const mt = touch.querySelector('.td-modetoggle');
  mt.addEventListener('pointerdown', (e) => { e.preventDefault(); setMode(isTablet() ? 'pc' : 'tablet'); });
  const unsubMode = onModeChange((m) => { mt.textContent = m === 'tablet' ? '📱 태블릿 모드' : '🖥️ PC 모드'; state.keys.clear(); state.joy.x = 0; state.joy.y = 0; });

  function interact() {
    if (state.paused) return;
    const tr = state.activeTrigger;
    if (tr && !tr.auto && !state.disabled.has(tr.id)) handlers.onInteract?.(tr.id, tr);
  }

  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function moveAxis(dx, dy) {
    const p = state.player;
    const walls = map.walls || [];
    const bx = { x: p.x + dx, y: p.y, w: p.w, h: p.h };
    if (!walls.some((w) => overlap(bx, w))) p.x += dx;
    const by = { x: p.x, y: p.y + dy, w: p.w, h: p.h };
    if (!walls.some((w) => overlap(by, w))) p.y += dy;
    p.x = Math.max(0, Math.min((map.width || canvas.width) - p.w, p.x));
    p.y = Math.max(0, Math.min((map.height || canvas.height) - p.h, p.y));
  }

  function update(fs) {
    const p = state.player;
    if (!state.paused) {
      const sp = 3.1 * fs;                      // 60fps 기준 속도 × 경과배율 → 어떤 주사율/FPS 에서도 동일 속도
      let dx = 0, dy = 0;
      const j = state.joy;
      if (Math.abs(j.x) > 0.14 || Math.abs(j.y) > 0.14) {   // 아날로그 조이스틱(태블릿)
        dx = j.x * sp; dy = j.y * sp;
        if (map.lockVertical) dy = 0;
      } else {                                              // 키보드(PC)
        if (state.keys.has('arrowleft') || state.keys.has('a')) dx -= sp;
        if (state.keys.has('arrowright') || state.keys.has('d')) dx += sp;
        if (state.keys.has('arrowup') || state.keys.has('w')) dy -= sp;
        if (state.keys.has('arrowdown') || state.keys.has('s')) dy += sp;
        if (map.lockVertical) dy = 0;           // 좌우 전용 씬(전시관 복도 등)
        if (dx && dy) { dx *= 0.707; dy *= 0.707; }
      }
      p.moving = !!(dx || dy);
      if (dx < 0) p.face = -1; else if (dx > 0) p.face = 1;
      if (Math.abs(dy) > Math.abs(dx)) { if (dy) p.dir = dy > 0 ? 'down' : 'up'; }
      else if (dx) p.dir = dx > 0 ? 'right' : 'left';
      moveAxis(dx, dy);

      const pc = { x: p.x, y: p.y, w: p.w, h: p.h };
      let active = null;
      for (const tr of map.triggers || []) {
        if (state.disabled.has(tr.id)) continue;
        if (overlap(pc, tr)) {
          if (tr.auto) {
            if (!state.firedAuto.has(tr.id)) { state.firedAuto.add(tr.id); handlers.onAuto?.(tr.id, tr); }
          } else active = tr;
        } else if (tr.auto) {
          state.firedAuto.delete(tr.id);
        }
      }
      state.activeTrigger = active;
      state.t += fs;                            // 애니메이션 시계도 경과배율로 진행 → 숨쉬기/걷기 속도 일정
    }
  }

  function camera() {
    const vw = canvas.width, vh = canvas.height;
    const mw = map.width || vw, mh = map.height || vh;
    let cx = state.player.x + state.player.w / 2 - vw / 2;
    let cy = state.player.y + state.player.h / 2 - vh / 2;
    cx = mw <= vw ? (mw - vw) / 2 : Math.max(0, Math.min(mw - vw, cx));
    cy = mh <= vh ? (mh - vh) / 2 : Math.max(0, Math.min(mh - vh, cy));
    state.cam.x = cx; state.cam.y = cy;
  }

  function drawPlayer() {
    const p = state.player;
    const ps = map.playerScale || 1;                       // 씬별 EDDIE 크기 배율
    const t = state.t;
    const bob = p.moving ? Math.abs(Math.sin(t * 0.25)) * 5 * ps : Math.sin(t * 0.06) * 2.2 * ps;
    const breathe = 1 + Math.sin(t * 0.05) * 0.025;        // 숨쉬기(가만히 있어도 살아있게)
    const sway = p.moving ? Math.sin(t * 0.25) * 0.05 : Math.sin(t * 0.045) * 0.03;   // 살짝 갸웃
    const squash = p.moving ? 1 - Math.abs(Math.sin(t * 0.25)) * 0.05 : 1;            // 걸을 때 탱탱
    const dw = 44, dh = 58;
    const cx = p.x + p.w / 2, feet = p.y + p.h;
    // 접지 그림자(둥실 뜬 만큼 작아짐)
    const shScale = 1 - Math.min(0.35, bob / (60 * ps));
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.beginPath();
    ctx.ellipse(cx, feet - 2, 17 * ps * shScale, 6 * ps * shScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (dirLoaded(p.dir)) {
      const sw = 66 * ps, sh = 72 * ps;
      ctx.save(); ctx.translate(cx, feet - bob); ctx.rotate(sway); ctx.scale(breathe, breathe * squash);
      ctx.drawImage(DIR_IMG[p.dir], -sw / 2, -sh + 10, sw, sh); ctx.restore();
    } else if (heroFor(map.eddieSrc).complete && heroFor(map.eddieSrc).naturalWidth) {
      // EDDIE 히어로(방별 코스튬). 비율 유지 + 좌/우 반전 + 숨쉬기/갸웃으로 생동감.
      const hImg = heroFor(map.eddieSrc);
      const sh = 84 * ps, sw = sh * (hImg.naturalWidth / hImg.naturalHeight);
      ctx.save();
      ctx.translate(cx, feet - bob);
      ctx.rotate(sway);
      ctx.scale((p.face < 0 ? 1 : -1) * breathe, breathe * squash);
      ctx.drawImage(hImg, -sw / 2, -sh + 12, sw, sh);
      if (state.tint) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = state.tint; ctx.fillRect(-sw / 2, -sh + 12, sw, sh);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    } else if (eddieImg.complete && eddieImg.naturalWidth) {
      ctx.save();
      ctx.translate(cx, feet - dh * ps + bob);
      if (p.face >= 0) ctx.scale(-1, 1);
      ctx.drawImage(eddieImg, -dw * ps / 2, 0, dw * ps, dh * ps);
      if (state.tint) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = state.tint;
        ctx.fillRect(-dw * ps / 2, 0, dw * ps, dh * ps);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    } else {
      ctx.fillStyle = '#f7b125';
      ctx.fillRect(cx - 14, feet - 48, 28, 48);
    }
  }

  function draw() {
    const vw = canvas.width, vh = canvas.height;
    ctx.fillStyle = map.bg || '#0b1322';
    ctx.fillRect(0, 0, vw, vh);
    ctx.save();
    ctx.translate(-state.cam.x, -state.cam.y);
    map.draw?.(ctx, state);
    drawPlayer();
    ctx.restore();
    handlers.onDrawOverlay?.(ctx, state, canvas);
    handlers.onFrame?.(state);
  }

  // 프레임 기반(주사율 의존) → 시간 기반으로. 60fps 를 1.0 으로 정규화한 경과배율(fs)을 곱한다.
  let last = performance.now();
  function loop(now) {
    if (now == null) now = performance.now();
    let fs = (now - last) / (1000 / 60);
    last = now;
    if (!isFinite(fs) || fs <= 0) fs = 1;       // 첫 프레임/이상값 보호
    fs = Math.min(fs, 3);                        // 탭 복귀 등 긴 공백에 순간이동 방지(최대 3프레임치)
    update(fs);
    camera();
    draw();
    state.raf = requestAnimationFrame(loop);
  }
  state.raf = requestAnimationFrame(loop);

  return {
    state,
    get player() { return state.player; },
    get activeTrigger() { return state.activeTrigger; },
    pause() { state.paused = true; state.keys.clear(); },
    resume() { state.paused = false; },
    setTint(c) { state.tint = c; },
    disableTrigger(id) { state.disabled.add(id); },
    enableTrigger(id) { state.disabled.delete(id); },
    teleport(x, y) { state.player.x = x; state.player.y = y; },
    destroy() {
      cancelAnimationFrame(state.raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      canvas.removeEventListener('pointerdown', onPointer);
      unsubMode();
      touch.remove();
      canvas.remove();
    },
  };
}
