/**
 * ui/panels/track.js — 트랙 탑뷰 렌더러.
 *
 * 렌더러는 읽기 전용이다. 시뮬 상태를 그리기만 하고 절대 바꾸지 않는다.
 * 좌표 변환(mm → px, y 뒤집기)도 여기서만 한다. 엔진은 화면을 모른다.
 *
 * 에셋이 있으면 프리렌더 이미지를 쓰고, 없거나 로드에 실패하면 형상 플레이스홀더로 폴백한다.
 * 폴백 경로는 항상 살아 있어야 한다 — 에셋이 하나도 없어도 화면이 깨지지 않는다.
 *
 * 차량 스프라이트는 16방향 프리렌더다. 각도는 가장 가까운 프레임으로 스냅하며 보간하지 않는다.
 * 그림자는 별도 시트라 트랙 색이 바뀌어도 자연스럽게 얹힌다.
 */

// 라벨은 대역 바깥 halfWidth+46mm 지점에 놓인다. 여백이 그보다 좁으면 창이 낮을 때 잘린다.
import { distanceToCenterLine } from '../../engine/track.js';

const MARGIN_MM = 250;

/**
 * 캔버스를 화면 픽셀 밀도에 맞춰 그린다. 상한을 두는 이유는 3배 화면에서 픽셀 수가
 * 아홉 배가 되어 저사양 노트북의 fps 가 무너지기 때문이다. 2배까지면 눈으로는 충분하다.
 */
const MAX_DPR = 2;
function dprOf() {
  return Math.min(window.devicePixelRatio || 1, MAX_DPR);
}

/**
 * 55차 보강2·3 — 배경을 캔버스 밖 층으로 뺀다. `?layer=1` 일 때만 켠다.
 *
 * 지금은 배경 한 장을 매 프레임 drawImage 로 캔버스에 떠 넣는다. 그 일이 스마트시티에서
 * 한 프레임의 4~5ms 다(보강1 표1). 층을 나누면 배경은 한 번만 떠 넣고, 그 뒤로는 브라우저가
 * 합성으로 민다 — 캔버스는 RC카·주행선·이름표만 그린다.
 *
 * 기본값은 끔이다. 배포본에서 켜고 끄며 재 본 뒤에 정한다.
 */
function layerFlag() {
  try {
    const v = new URLSearchParams(globalThis.location.search).get('layer');
    return v === '1' ? true : (v === '0' ? false : null);   // 없으면 매니페스트가 정한다
  } catch (e) {
    return null;
  }
}
/**
 * 배경 층은 dpr 1 로 묶는다. dpr 2 로 두면 아래 층 하나가 스마트시티에서 90MB 가 되어
 * 학교 노트북에 실제 위험이다(보강2 표6). 배경은 사진이라 반 해상도로 티가 덜 난다.
 */
const BG_LAYER_DPR = 1;

/**
 * 물리는 10ms 마다 한 걸음이고 화면은 그보다 자주 그려진다. 그 사이를 채우지 않으면
 * 어떤 프레임은 두 걸음, 어떤 프레임은 한 걸음이 되어 덜컹거린다.
 *
 * 보간은 렌더 전용이다 — 여기서 만든 좌표는 화면에만 쓰이고 물리·판정·기록으로 돌아가지 않는다.
 * lerp 은 직전 tick 의 자세와 지금 tick 의 자세 사이를 alpha 로 가른다.
 */
function poseOf(sim, lerp) {
  const v = sim.vehicle;
  if (!lerp || !lerp.prev || !(lerp.alpha > 0)) return { x: v.x, y: v.y, heading_mdeg: v.heading_mdeg };
  const a = Math.max(0, Math.min(1, lerp.alpha));
  const p = lerp.prev;
  // 각도는 짧은 쪽으로 돈다. 359도 → 1도 를 그냥 섞으면 한 바퀴를 거꾸로 돈다.
  let dh = v.heading_mdeg - p.heading_mdeg;
  while (dh > 180000) dh -= 360000;
  while (dh < -180000) dh += 360000;
  return {
    x: p.x + (v.x - p.x) * a,
    y: p.y + (v.y - p.y) * a,
    heading_mdeg: p.heading_mdeg + dh * a,
  };
}

/** 화면이 그릴 시각. tick 사이의 소수점까지 낸다 — 장애물 자리는 tick 하나의 함수다. */
function renderTickOf(sim, lerp) {
  if (!lerp || !lerp.prev || !(lerp.alpha > 0)) return sim.tick;
  return sim.tick - 1 + Math.max(0, Math.min(1, lerp.alpha));
}
const TAPE_FALLBACK_MM = 3;   // 테이프 에셋이 없을 때 그리는 경계선 두께

// 주행 연출 상수. 모든 수명은 '틱'이라 재생 배속(2x/4x)에 자동으로 비례한다.
// 연출은 렌더 전용 상태만 쓴다 — 시뮬 상태는 읽기만 하고 절대 건드리지 않는다.
const FX = {
  wheelRadPerTick: 0.10,   // PWM 100% 일 때 틱당 회전각(rad)
  wheelR_mm: 30,
  skidDiff: 110,           // 좌우 PWM 차 — 급선회
  skidAccel: 90,           // 프레임 간 평균 PWM 급증
  skidEvery: 3,            // 최소 간격(tick)
  skidLife: 700,
  skidMax: 360,
  flashLife: 45,
  lapLife: 90,
  lapR_mm: 520,
};

function createFx() {
  return {
    tick: 0, wheel: [0, 0], lastAvg: 0, lastSkid: -999,
    skids: [], offCount: 0, lapCount: 0, flashAt: -9999, lapAt: -9999,
    view: null,   // 부드럽게 따라가는 화면 사각형(이미지 px). 렌더 전용이다.
  };
}

function advanceFx(fx, sim) {
  if (sim.tick < fx.tick) {                       // 리셋/재시작
    fx.skids.length = 0;
    fx.wheel = [0, 0];
    fx.offCount = 0; fx.lapCount = 0;
    fx.flashAt = -9999; fx.lapAt = -9999; fx.lastSkid = -999;
    fx.trailDist = null;
  }
  const dt = Math.max(0, Math.min(sim.tick - fx.tick, 400));
  fx.tick = sim.tick;

  const v = sim.vehicle;
  const pwmMax = (sim.steps && sim.steps.pwmMax) || 255;
  fx.wheel[0] += (v.pwmL / pwmMax) * FX.wheelRadPerTick * dt;
  fx.wheel[1] += (v.pwmR / pwmMax) * FX.wheelRadPerTick * dt;

  const avg = (Math.abs(v.pwmL) + Math.abs(v.pwmR)) / 2;
  const hard = Math.abs(v.pwmL - v.pwmR) >= FX.skidDiff || avg - fx.lastAvg >= FX.skidAccel;
  if (dt > 0 && hard && avg > 0 && sim.tick - fx.lastSkid >= FX.skidEvery) {
    fx.lastSkid = sim.tick;
    const wb = (sim.kit.body && sim.kit.body.wheel_base_mm) || 96;
    for (const side of [-1, 1]) {
      const p = wheelPoint(v, wb, side);
      fx.skids.push({ x: p[0], y: p[1], t: sim.tick });
    }
  }
  fx.lastAvg = avg;

  while (fx.skids.length && sim.tick - fx.skids[0].t > FX.skidLife) fx.skids.shift();
  while (fx.skids.length > FX.skidMax) fx.skids.shift();

  if (sim.offtrack.count > fx.offCount) { fx.offCount = sim.offtrack.count; fx.flashAt = sim.tick; }
  if (sim.lap.count > fx.lapCount) { fx.lapCount = sim.lap.count; fx.lapAt = sim.tick; }
}

/** 좌(-1)/우(+1) 바퀴의 접지점(mm). 차체 좌표계에서 횡방향으로 wheel_base/2 만큼 떨어져 있다. */
function wheelPoint(v, wheelBase, side) {
  const rad = (v.heading_mdeg / 1000) * Math.PI / 180;
  const half = wheelBase / 2;
  return [v.x - Math.sin(rad) * half * side, v.y + Math.cos(rad) * half * side];
}

export function createTrackView({ canvas, assets, cityIso, dev, overlays }) {
  const ctx = canvas.getContext('2d');
  
  const viewApi = {
    draw,
    invalidateAssets() { patterns.floor = undefined; patterns.tape = undefined; },
    carScreenPos: null,
  };
  /**
   * 아래 층. 봉인된 배경은 sha256 을 맞춰 본 뒤 createImageBitmap 으로 만든다 —
   * ImageBitmap 은 DOM 요소가 아니라 <img> 로 넣을 수 없다. 그래서 캔버스다.
   * 새로 받는 것이 없으므로 39차의 콜드 캐시 레이스가 여기서 되살아나지 않는다.
   */
  const bgLayer = {
    node: null,
    ctx: null,
    key: '',
    place(image, w, h, ox, oy) {
      const host = canvas.parentElement;
      if (!host) return;
      if (!this.node) {
        this.node = document.createElement('canvas');
        this.node.className = 'view__bg';
        this.node.setAttribute('aria-hidden', 'true');
        this.ctx = this.node.getContext('2d');
        host.classList.add('view--layered');
        host.insertBefore(this.node, canvas);
      }
      const n = this.node;
      const key = `${w}x${h}`;
      if (this.key !== key) {
        this.key = key;
        n.width = Math.ceil(w * BG_LAYER_DPR);
        n.height = Math.ceil(h * BG_LAYER_DPR);
        // CSS 크기를 backing store 나누기 dpr 로 딱 맞춘다. 어긋나면 브라우저가 층 전체를
        // 다시 표본화해 배경의 모든 모서리에 1px 띠가 생긴다(보강2 에서 실제로 났다).
        // 그림 내용은 w x h 자리에 그대로 두고 상자만 정수 배로 키운다.
        n.style.width = `${Math.ceil(w * BG_LAYER_DPR) / BG_LAYER_DPR}px`;
        n.style.height = `${Math.ceil(h * BG_LAYER_DPR) / BG_LAYER_DPR}px`;
        this.ctx.setTransform(BG_LAYER_DPR, 0, 0, BG_LAYER_DPR, 0, 0);
        this.ctx.drawImage(image, 0, 0, w, h);
      }
      const t = `translate(${ox}px, ${oy}px)`;
      if (n.style.transform !== t) n.style.transform = t;
    },
  };
  const patterns = { floor: undefined, tape: undefined };
  const fx = createFx();

  function floorPattern(ref) {
    if (patterns.floor !== undefined) return patterns.floor;
    const img = assets.resolve(ref);
    const meta = assets.meta(ref);
    if (!img || !img.width) { patterns.floor = null; return null; }
    const tileMm = (meta && meta.tile_mm) || 600;
    const p = ctx.createPattern(img, 'repeat');
    // 패턴 좌표계는 현재 사용자 좌표계(mm) 위에 놓인다.
    p.setTransform(new DOMMatrix().scaleSelf(tileMm / img.width, tileMm / img.height));
    patterns.floor = p;
    return p;
  }

  function tapePattern() {
    if (patterns.tape !== undefined) return patterns.tape;
    const img = assets.resolve('slot:track.tape');
    const meta = assets.meta('slot:track.tape');
    if (!img || !img.width) { patterns.tape = null; return null; }
    patterns.tape = {
      pattern: ctx.createPattern(img, 'repeat'),
      sx: (meta.length_mm || 200) / img.width,
      sy: (meta.width_mm || 25) / img.height,
      widthMm: meta.width_mm || 25,
      height: img.height,
    };
    return patterns.tape;
  }

  function draw(sim, lerp) {
    const dpr = dprOf();
    const cssW = canvas.clientWidth || 1;
    const cssH = canvas.clientHeight || 1;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }

    advanceFx(fx, sim);

    // 아이소메트릭 배경이 있으면 그쪽으로. 로딩 중이면 2D로 폴백하지 않고 대기 화면을 그린다.
    const bgRef = sim.challenge.scene.assets && sim.challenge.scene.assets.background;
    if (bgRef) {
      const background = assets.resolve(bgRef);
      if (background && background.kind === 'background') {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // 켤지는 매니페스트가 챌린지별로 소유한다(scene.ui.bg_layer). ?layer=1 / ?layer=0 이
        // 붙으면 그것이 이긴다 — 배포본에서 A/B 로 재기 위한 문이다.
        const flag = layerFlag();
        const want = flag === null
          ? !!((sim.challenge.scene.ui || {}).bg_layer)
          : flag;
        viewApi.carScreenPos = drawIsometric(ctx, sim, background, assets, cssW, cssH, fx, cityIso, dev, lerp,
          overlays ? overlays() : [], want ? bgLayer : null);
      } else {
        // 에셋 로딩 중
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = css('--c-view-bg');
        ctx.fillRect(0, 0, cssW, cssH);
        ctx.fillStyle = css('--c-text-dim');
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('맵 로딩 중...', cssW / 2, cssH / 2);
      }
      return;
    }

    const track = sim.track;
    const ext = track.outerHalf + MARGIN_MM;
    const scale = Math.min(cssW / (2 * ext), cssH / (2 * ext));
    const cx = cssW / 2;
    const cy = cssH / 2;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = css('--c-view-bg');
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, -scale); // y 위쪽(+)
    const px = 1 / scale;     // 1 화면 픽셀에 해당하는 mm

    drawTrack(ctx, track, px, sim.challenge.scene.assets, floorPattern,
              { x: cssW / (2 * scale), y: cssH / (2 * scale) });
    drawBoundaries(ctx, track, px, tapePattern());
    drawCheckpointLines(ctx, track, px);
    drawTrail(ctx, sim, px);
    drawCar(ctx, sim, px, assets);

    const pose = poseOf(sim, lerp);
    viewApi.carScreenPos = [cx + pose.x * scale, cy - pose.y * scale];

    ctx.restore();

    // 조명 오버레이 — 씬 위에 얹는 별도 레이어
    const overlay = assets.resolve('slot:overlay.light');
    if (overlay && overlay.width) ctx.drawImage(overlay, 0, 0, cssW, cssH);

    // 라벨은 화면 좌표계에서 그린다(y 뒤집기 영향을 받지 않도록).
    drawLabels(ctx, track, (x, y) => [cx + x * scale, cy - y * scale]);
  }

  return viewApi;
}

function outerPath(ctx, track) {
  const o = track.outerHalf;
  if (ctx.roundRect) ctx.roundRect(-o, -o, 2 * o, 2 * o, track.halfWidth);
  else ctx.rect(-o, -o, 2 * o, 2 * o);
}

function drawTrack(ctx, track, px, sceneAssets, floorPattern, viewHalf) {
  const i = track.innerHalf;

  // 바닥은 화면 전체에 깐다. 대역 안팎이 같은 교실 바닥으로 읽혀야 하기 때문이다.
  const floor = floorPattern(sceneAssets && sceneAssets.track);
  ctx.fillStyle = floor || css('--c-track-surface');
  ctx.fillRect(-viewHalf.x, -viewHalf.y, viewHalf.x * 2, viewHalf.y * 2);

  // 대역 밖(코스 안쪽 + 바깥)에만 어두운 스크림을 덮는다.
  // evenodd 로 화면 전체 - 주행 대역 = 대역 밖 영역만 칠해진다.
  ctx.beginPath();
  ctx.rect(-viewHalf.x, -viewHalf.y, viewHalf.x * 2, viewHalf.y * 2);
  outerPath(ctx, track);
  ctx.rect(-i, -i, 2 * i, 2 * i);
  ctx.fillStyle = css('--c-scrim');
  ctx.fill('evenodd');

  // 대역 중심선(이탈 판정의 기준선)
  ctx.save();
  ctx.setLineDash([26 * px, 18 * px]);
  ctx.lineWidth = 2 * px;
  ctx.strokeStyle = css('--c-track-center');
  ctx.beginPath();
  ctx.rect(-track.half, -track.half, 2 * track.half, 2 * track.half);
  ctx.stroke();
  ctx.restore();
}


/**
 * 주행 대역의 두 경계선을 테이프로 그린다.
 * 패턴은 직선 구간마다 그 선 위에 중심을 맞춰 다시 놓는다.
 * 그러지 않으면 패턴 원점이 (0,0)에 고정돼 테이프의 불투명 띠가 선 밖으로 밀린다.
 */
function drawBoundaries(ctx, track, px, tape) {
  const i = track.innerHalf;
  const o = track.outerHalf;
  const r = track.halfWidth;

  if (!tape) {
    ctx.lineWidth = TAPE_FALLBACK_MM;
    ctx.strokeStyle = css('--c-track-edge');
    ctx.beginPath();
    outerPath(ctx, track);
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(-i, -i, 2 * i, 2 * i);
    ctx.stroke();
    return;
  }

  const { pattern, sx, sy, widthMm, height } = tape;
  ctx.save();
  ctx.lineWidth = widthMm;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = pattern;

  const horizontal = (y, x0, x1) => {
    pattern.setTransform(new DOMMatrix().translateSelf(0, y).scaleSelf(sx, sy).translateSelf(0, -height / 2));
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  };
  const vertical = (x, y0, y1) => {
    pattern.setTransform(new DOMMatrix().translateSelf(x, 0).rotateSelf(90).scaleSelf(sx, sy).translateSelf(0, -height / 2));
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.stroke();
  };

  // 안쪽 경계 — 각진 정사각형
  horizontal(i, -i, i);
  horizontal(-i, -i, i);
  vertical(i, -i, i);
  vertical(-i, -i, i);

  // 바깥 경계 — 직선 구간
  horizontal(o, -o + r, o - r);
  horizontal(-o, -o + r, o - r);
  vertical(o, -o + r, o - r);
  vertical(-o, -o + r, o - r);

  // 바깥 경계 모서리 — 중심선 꼭짓점을 중심으로 한 사분원. 패턴 방향이 애매해 단색으로 잇는다.
  ctx.strokeStyle = css('--c-tape');
  const c = o - r;
  // 각 사분원의 시작점으로 정확히 이동한 뒤 그린다. moveTo 가 어긋나면 이어붙이는 직선이 남는다.
  const corners = [
    [c, c, 0, Math.PI / 2],
    [-c, c, Math.PI / 2, Math.PI],
    [-c, -c, Math.PI, Math.PI * 1.5],
    [c, -c, Math.PI * 1.5, Math.PI * 2],
  ];
  ctx.beginPath();
  for (const [ax, ay, a0, a1] of corners) {
    ctx.moveTo(ax + r * Math.cos(a0), ay + r * Math.sin(a0));
    ctx.arc(ax, ay, r, a0, a1);
  }
  ctx.stroke();
  ctx.restore();
  void px;
}

function drawCheckpointLines(ctx, track, px) {
  for (const cp of track.checkpoints) {
    const tx = -cp.ny;
    const ty = cp.nx;
    const isFinish = cp.id === track.lap.finish;
    ctx.beginPath();
    ctx.moveTo(cp.x + tx * cp.halfSpan, cp.y + ty * cp.halfSpan);
    ctx.lineTo(cp.x - tx * cp.halfSpan, cp.y - ty * cp.halfSpan);
    ctx.lineWidth = (isFinish ? 6 : 3) * px;
    ctx.strokeStyle = isFinish ? css('--c-finish') : css('--c-checkpoint');
    ctx.setLineDash(isFinish ? [] : [14 * px, 10 * px]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** 정체불명 점선이 되지 않도록 각 판정선에 이름을 붙인다. */
function drawLabels(ctx, track, toScreen) {
  const family = css('--font-ui') || 'sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const order = track.lap.order || [];
  for (const cp of track.checkpoints) {
    const isFinish = cp.id === track.lap.finish;
    const len = Math.hypot(cp.x, cp.y) || 1;
    const off = track.halfWidth + 46;
    const [sx, sy] = toScreen(cp.x + (cp.x / len) * off, cp.y + (cp.y / len) * off);
    const idx = order.indexOf(cp.id);
    const text = isFinish ? '출발 · 도착' : `구간 ${idx > 0 ? idx : ''}`;
    ctx.font = `${isFinish ? '700' : '600'} ${isFinish ? 13 : 12}px ${family}`;
    ctx.fillStyle = isFinish ? css('--c-finish') : css('--c-checkpoint-label');
    ctx.fillText(text, sx, sy);
  }
}

function drawTrail(ctx, sim, px) {
  if (sim.trail.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(sim.trail[0].x, sim.trail[0].y);
  for (let i = 1; i < sim.trail.length; i++) ctx.lineTo(sim.trail[i].x, sim.trail[i].y);
  ctx.lineWidth = 3 * px;
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = css('--c-trail');
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** heading(milli-degree) → 가장 가까운 프리렌더 프레임. 보간하지 않고 스냅한다. */
export function frameIndexFor(headingMdeg, meta) {
  const step = meta.step_deg || 22.5;
  const count = meta.frames.length;
  const deg = ((headingMdeg / 1000) % 360 + 360) % 360;
  return Math.round(deg / step) % count;
}

function drawCar(ctx, sim, px, assets) {
  const v = sim.vehicle;
  const body = sim.kit.body;
  const carRef = sim.kit.assets && sim.kit.assets.car;
  const art = assets.resolve(carRef);

  if (art && art.kind === 'frames') {
    const idx = frameIndexFor(v.heading_mdeg, art.meta);
    const sizeMm = art.meta.frame_px * art.meta.mm_per_px;
    const shadow = art.shadows[idx];
    const frame = art.frames[idx];
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.scale(1, -1); // 이미지 좌표계(y 아래쪽)를 되돌린다. 회전은 프레임에 이미 구워져 있다.
    if (shadow) {
      ctx.globalAlpha = 0.30;   // 검정 차체가 검정 그림자에 묻히지 않게 약하게 깐다
      ctx.drawImage(shadow, -sizeMm / 2, -sizeMm / 2, sizeMm, sizeMm);
      ctx.globalAlpha = 1;
    }
    if (frame) ctx.drawImage(frame, -sizeMm / 2, -sizeMm / 2, sizeMm, sizeMm);
    ctx.restore();

    // 식별 오버레이 — 스프라이트는 그대로 두고 위에 얹는다.
    // 검정 차체가 노면에서 거의 안 읽히는 문제를 렌더 단계에서만 보정한다.
    const rad = (v.heading_mdeg / 1000) * Math.PI / 180;
    const ring = body.width_mm * 0.58;
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(rad);
    ctx.beginPath();
    ctx.arc(0, 0, ring, 0, Math.PI * 2);
    ctx.lineWidth = 2.5 * px;
    ctx.strokeStyle = sim.offtrack.active ? css('--c-car-off') : css('--c-car-ring');
    ctx.globalAlpha = sim.offtrack.active ? 1 : 0.85;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // 진행 방향 표시
    ctx.beginPath();
    ctx.moveTo(ring + 9, 0);
    ctx.lineTo(ring - 7, 9);
    ctx.lineTo(ring - 7, -9);
    ctx.closePath();
    ctx.fillStyle = sim.offtrack.active ? css('--c-car-off') : css('--c-car-ring');
    ctx.fill();
    ctx.restore();
    return;
  }

  // 폴백: 형상 플레이스홀더. 킷 스펙 실측(mm) 그대로 그린다.
  const rad = (v.heading_mdeg / 1000) * Math.PI / 180;
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.rotate(rad);
  if (art && art.width) {
    ctx.save();
    ctx.scale(1, -1);
    ctx.drawImage(art, -body.length_mm / 2, -body.width_mm / 2, body.length_mm, body.width_mm);
    ctx.restore();
  } else {
    ctx.fillStyle = css('--c-car');
    ctx.fillRect(-body.length_mm / 2, -body.width_mm / 2, body.length_mm, body.width_mm);
    ctx.fillStyle = css('--c-car-front');
    ctx.fillRect(body.length_mm / 2 - 16, -body.width_mm / 2, 16, body.width_mm);
  }
  ctx.lineWidth = (sim.offtrack.active ? 3 : 2) * px;
  ctx.strokeStyle = sim.offtrack.active ? css('--c-car-off') : css('--c-text');
  ctx.strokeRect(-body.length_mm / 2, -body.width_mm / 2, body.length_mm, body.width_mm);
  ctx.restore();
}

/**
 * 아이소메트릭 화면.
 *
 * 물리는 2D 그대로다. 여기서는 물리 좌표(mm)를 화면 픽셀로 옮기기만 한다.
 * 투영 축은 배경을 렌더한 Blender 가 실제로 계산해 사이드카 JSON 에 적어 둔 값을 그대로 쓴다.
 * 코드가 각도를 짐작하지 않으므로 배경과 오브젝트가 어긋날 여지가 없다.
 * 트랙 노면·테이프·중심선은 배경에 이미 구워져 있어 다시 그리지 않는다.
 */
function drawIsometric(ctx, sim, background, assets, cssW, cssH, fx, cityIso, dev, lerp, overlayBoxes, bgLayer) {
  const pose = poseOf(sim, lerp);
  const rtick = renderTickOf(sim, lerp);
  const { meta, image } = background;
  const proj = meta.projection;
  const [imgW, imgH] = meta.image_px;
  const groundZ = meta.ground_z_mm || 0;
  const track = sim.track;

  const imgPx = (x, y, z = groundZ) => [
    proj.origin_px[0] + x * proj.x_axis_px[0] + y * proj.y_axis_px[0] + z * proj.z_axis_px[0],
    proj.origin_px[1] + x * proj.x_axis_px[1] + y * proj.y_axis_px[1] + z * proj.z_axis_px[1],
  ];
  // 고정 확대. 담는 것은 트랙 외곽 네 모서리와 이름표가 놓이는 지점뿐이다.
  // 차가 어디에 있든 이 사각형은 변하지 않는다 — 화면이 흔들리지 않고, 같은 챌린지는 늘 같은 구도다.
  // 트랙 밖 소품이 화면 밖으로 밀리는 것은 의도한 결과다.
  // 각도는 손대지 않는다. 배경을 구운 정투영 축 그대로이고, 여기서 정하는 것은 배율과 중심뿐이다.
  const h = track.outerHalf;
  const labelR = track.half + track.halfWidth + 90;
  const marks = [[h, h], [h, -h], [-h, h], [-h, -h],
    [0, labelR], [0, -labelR], [labelR, 0], [-labelR, 0]].map(([x, y]) => imgPx(x, y));
  const chase = sim.challenge.scene.chase;
  const [bx0, by0, bx1, by1] = [
    Math.min(...marks.map((c) => c[0])), Math.min(...marks.map((c) => c[1])),
    Math.max(...marks.map((c) => c[0])), Math.max(...marks.map((c) => c[1])),
  ];
  // 라벨 여유는 화면 픽셀로 잡아 둔다. 이미지 픽셀로 잡으면 fit 이 작아질수록 여유도 같이
  // 줄어들어 'START / FINISH' 가 캔버스 밖으로 밀린다.
  const LABEL_PAD = [40, 14];
  let fit = Math.min(
    Math.max(cssW - LABEL_PAD[0] * 2, 1) / (bx1 - bx0),
    Math.max(cssH - LABEL_PAD[1] * 2, 1) / (by1 - by0),
  );
  let offX = cssW / 2 - ((bx0 + bx1) / 2) * fit;
  let offY = cssH / 2 - ((by0 + by1) / 2) * fit;

  // ── 추적 카메라 ────────────────────────────────────────────
  // 배율은 고정이고 카메라는 회전하지 않는다(정투영 축이 고정이라야 스프라이트가 성립한다).
  // 화면이 보는 폭·앞을 얼마나 미는지·차를 화면 어디에 둘지는 전부 매니페스트가 소유한다.
  if (chase) {
    fit = (cssW * proj.ortho_width_mm) / (chase.view_width_mm * imgW);
    const hd = (pose.heading_mdeg / 1000) * (Math.PI / 180);
    const carPx = imgPx(pose.x, pose.y);
    const aheadPx = imgPx(
      pose.x + Math.cos(hd) * chase.ahead_mm,
      pose.y + Math.sin(hd) * chase.ahead_mm,
    );
    // '앞'을 화면 벡터로 잡는다. 월드 방향으로 밀면 정투영 특성상 어떤 변에서는 차가 위로 올라간다.
    const lead = [(aheadPx[0] - carPx[0]) * fit, (aheadPx[1] - carPx[1]) * fit];
    if (!fx.lead) fx.lead = lead.slice();
    fx.lead[0] += (lead[0] - fx.lead[0]) * 0.12;
    fx.lead[1] += (lead[1] - fx.lead[1]) * 0.12;
    // RC카를 둘 화면 위치. 진행 방향 앞이 더 보이도록 밀되, 화면 안에서만 움직인다.
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const sx = clamp(cssW / 2 - fx.lead[0], cssW * 0.24, cssW * 0.76);
    const sy = clamp(cssH * chase.aim_y - fx.lead[1], cssH * 0.48, cssH * 0.74);
    offX = sx - carPx[0] * fit;
    offY = sy - carPx[1] * fit;
  }

  // 층을 나눌 때만 정수로 못박는다. 두 층이 같은 값을 써야 하고, 소수점 이동은 층 사이
  // 어긋남을 만든다. 층을 안 나누면 지금까지와 한 픽셀도 다르지 않다.
  if (bgLayer) {
    offX = Math.round(offX);
    offY = Math.round(offY);
  }

  const toScreen = (x, y, z = groundZ) => {
    const p = imgPx(x, y, z);
    return [offX + p[0] * fit, offY + p[1] * fit];
  };

  if (bgLayer) {
    // 위 층은 투명하다. 바탕색은 .view 가 이미 칠하고 있다.
    ctx.clearRect(0, 0, cssW, cssH);
    // 아래 층이 아직 없으면 위 층도 그리지 않는다 — 배경 없이 RC카만 뜨는 화면을 만들지 않는다.
    if (!image || !(image.width > 0)) return;
    bgLayer.place(image, imgW * fit, imgH * fit, offX, offY);
  } else {
    ctx.fillStyle = css('--c-view-bg');
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.drawImage(image, offX, offY, imgW * fit, imgH * fit);
  }
  fadeBackgroundEdges(ctx, offX, offY, imgW * fit, imgH * fit, cssW, cssH);

  // 체크포인트 이름표는 자리가 먼저 정해진다. 도시 이름표가 그 위에 겹치지 않도록
  // 자리만 미리 재서 넘겨 준다 — 겹쳐 쓴 이름표는 둘 다 못 읽는다.
  const cpLabels = checkpointLabels(ctx, track, toScreen, cssW, cssH);

  // 살아 있는 도시(신호 색·보행자·차단기)는 배경 바로 위에 얹는다.
  if (cityIso) {
    try {
      // 54차 보강6-4 — 시뮬 위 계기 카드도 이미 자리를 잡은 사각형이다.
      // 도시 이름표는 체크포인트 이름표를 피하던 그 장치로 카드도 함께 피한다 —
      // 둘 다 데이터 오버레이지만, 계기는 자리가 고정이고 이름표는 옮길 수 있다.
      cityIso.draw(ctx, sim, toScreen, fit, proj.ortho_width_mm / imgW, [cssW, cssH],
        cpLabels.map((l) => l.box).concat(overlayBoxes || []), rtick, pose);
    } catch (_) { /* 한 장이 없다고 멈추지 않는다 */ }
  }

  drawSkids(ctx, fx, toScreen);

  // 체크포인트 판정선
  for (const cp of track.checkpoints) {
    const tx = -cp.ny;
    const ty = cp.nx;
    const isFinish = cp.id === track.lap.finish;
    const a = toScreen(cp.x + tx * cp.halfSpan, cp.y + ty * cp.halfSpan);
    const b = toScreen(cp.x - tx * cp.halfSpan, cp.y - ty * cp.halfSpan);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineWidth = isFinish ? 5 : 3;
    ctx.strokeStyle = isFinish ? css('--c-finish') : css('--c-checkpoint');
    ctx.setLineDash(isFinish ? [] : [10, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 궤적. 얼마나 남길지는 매니페스트가 소유한다 — 렌더 전용이라 엔진의 기록은 그대로다.
  const keep = sim.challenge.scene.trail_points | 0;
  const trail = keep > 0 ? sim.trail.slice(-keep) : sim.trail;
  if (trail.length >= 2) {
    ctx.beginPath();
    const first = toScreen(trail[0].x, trail[0].y);
    ctx.moveTo(first[0], first[1]);
    for (let i = 1; i < trail.length; i++) {
      const p = toScreen(trail[i].x, trail[i].y);
      ctx.lineTo(p[0], p[1]);
    }
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = css('--c-trail');
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawTrailArrows(ctx, sim, fx, toScreen, sim.challenge.scene.trail_arrow_mm | 0, keep);
  }

  drawIsoCar(ctx, sim, assets, meta, fit, toScreen, fx, pose);
  drawLapBurst(ctx, sim, fx, toScreen);

  // 라벨은 배경 위에 직접 얹는다
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const l of cpLabels) {
    ctx.font = l.font;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(5,8,15,.65)';
    ctx.strokeText(l.text, l.x, l.y);
    ctx.fillStyle = l.isFinish ? css('--c-finish') : css('--c-checkpoint-label');
    ctx.fillText(l.text, l.x, l.y);
  }

  drawOfftrackFlash(ctx, sim, fx, cssW, cssH);

  // [dev] 월드 좌표를 배경 위에 그대로 겹쳐 본다. 학생 화면에는 나오지 않는다.
  if (dev) drawWorldOverlay(ctx, sim, toScreen);

  return toScreen(pose.x, pose.y);
}

/**
 * 지나간 길 위의 진행 방향 화살표.
 *
 * 간격은 거리(mm)다 — 시간이 아니다. 시간 기준으로 찍으면 빠른 코드와 느린 코드가
 * 같은 자리에서 다른 개수를 남겨 "같은 코드 = 같은 화면" 이 깨진다.
 * 거리는 출발점부터 누적한다. 화면에 보이는 창(trail_points)이 밀려도 이미 찍힌 화살표는
 * 제자리에 있어야 하기 때문이다.
 *
 * 자료는 [지나간 길](sim.trail)을 그대로 쓴다. 여기서 위치를 다시 재지 않는다.
 * 누적 거리는 프레임마다 다시 더하지 않고 자란 만큼만 이어 붙인다.
 */
function trailDistances(sim, fx) {
  const trail = sim.trail;
  let d = fx.trailDist;
  if (!d || d.length > trail.length) { d = [0]; fx.trailDist = d; }
  for (let i = d.length; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    d[i] = d[i - 1] + Math.hypot(b.x - a.x, b.y - a.y);
  }
  return d;
}

function drawTrailArrows(ctx, sim, fx, toScreen, stepMm, keep) {
  if (!(stepMm > 0)) return;
  const trail = sim.trail;
  const dist = trailDistances(sim, fx);
  const from = keep > 0 ? Math.max(0, trail.length - keep) : 0;
  const dStart = dist[from];
  const dEnd = dist[trail.length - 1];
  if (!(dEnd - dStart > stepMm)) return;
  ctx.fillStyle = css('--c-trail');
  ctx.globalAlpha = 0.95;
  let i = from + 1;
  for (let k = Math.ceil(dStart / stepMm); k * stepMm <= dEnd; k++) {
    const want = k * stepMm;
    while (i < trail.length - 1 && dist[i] < want) i++;
    const seg = dist[i] - dist[i - 1];
    const t = seg > 0 ? (want - dist[i - 1]) / seg : 0;
    const a = trail[i - 1];
    const b = trail[i];
    const p = toScreen(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    // 방향은 화면에서 잰다. 월드 각도를 그대로 쓰면 정투영에서 화살표만 다른 쪽을 가리킨다.
    const q = toScreen(b.x, b.y);
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dx, dy);
    if (len < 0.001) continue;
    const ux = dx / len;
    const uy = dy / len;
    const H = 7;
    const W = 4;
    ctx.beginPath();
    ctx.moveTo(p[0] + ux * H, p[1] + uy * H);
    ctx.lineTo(p[0] - ux * H * 0.4 - uy * W, p[1] - uy * H * 0.4 + ux * W);
    ctx.lineTo(p[0] - ux * H * 0.4 + uy * W, p[1] - uy * H * 0.4 - ux * W);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * 체크포인트 이름표의 글자·자리·차지하는 사각형. 그리기 전에 자리부터 정해 두면
 * 도시 이름표가 같은 자리를 피해 갈 수 있다.
 */
function checkpointLabels(ctx, track, toScreen, cssW, cssH) {
  const family = css('--font-ui') || 'sans-serif';
  const order = track.lap.order || [];
  const spots = placeLabels(track);
  const out = [];
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const cp of track.checkpoints) {
    const isFinish = cp.id === track.lap.finish;
    const [sx, sy] = toScreen(spots.get(cp.id)[0], spots.get(cp.id)[1]);
    const idx = order.indexOf(cp.id);
    const font = `${isFinish ? '700' : '600'} ${isFinish ? 13 : 12}px ${family}`;
    ctx.font = font;
    const text = isFinish ? '출발 · 도착' : `구간 ${idx > 0 ? idx : ''}`;
    // 그래도 남는 한 픽셀까지 캔버스 안으로 당긴다.
    const halfW = ctx.measureText(text).width / 2 + 4;
    const x = Math.min(Math.max(sx, halfW), cssW - halfW);
    const y = Math.min(Math.max(sy, 12), cssH - 12);
    out.push({ text, x, y, font, isFinish, box: [x - halfW, y - 10, x + halfW, y + 10] });
  }
  ctx.restore();
  return out;
}

/**
 * [dev] 정렬 확인용. 중심선·노면 폭·판단 지점·출발선을 월드 좌표 그대로 얹는다.
 * 배경이 맞게 구워졌는지, 사이드카 투영을 화면이 제대로 읽고 있는지 눈으로 본다.
 */
function drawWorldOverlay(ctx, sim, toScreen) {
  const track = sim.track;
  const pts = track.centerline || [];
  if (!pts.length) return;
  const half = track.width_mm ? track.width_mm / 2 : 180;
  const line = (a, b, color, w) => {
    const p = toScreen(a[0], a[1]);
    const q = toScreen(b[0], b[1]);
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.lineWidth = w;
    ctx.strokeStyle = color;
    ctx.stroke();
  };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    line(a, b, 'rgba(255,60,60,.95)', 2);
    for (const s of [1, -1]) {
      line([a[0] + nx * half * s, a[1] + ny * half * s],
        [b[0] + nx * half * s, b[1] + ny * half * s], 'rgba(60,200,255,.9)', 1.5);
    }
  }
  const cfg = sim.decisions;
  if (cfg) {
    for (const d of cfg.list) {
      const [px, py] = toScreen(d.x, d.y);
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,230,60,.95)';
      ctx.stroke();
    }
  }
  for (const cp of track.checkpoints) {
    const tx = -cp.ny;
    const ty = cp.nx;
    line([cp.x + tx * cp.halfSpan, cp.y + ty * cp.halfSpan],
      [cp.x - tx * cp.halfSpan, cp.y - ty * cp.halfSpan], 'rgba(255,0,255,.95)', 2);
  }
  const sp = sim.challenge.scene.spawn;
  const [sx, sy] = toScreen(sp.x, sp.y);
  ctx.beginPath();
  ctx.arc(sx, sy, 9, 0, Math.PI * 2);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255,0,255,.95)';
  ctx.stroke();
}

/** 급선회·급가속 구간에 남는 타이어 자국. 틱 수명이라 배속을 올리면 같은 속도로 옅어진다. */
function drawSkids(ctx, fx, toScreen) {
  if (fx.skids.length < 3) return;
  ctx.lineCap = 'round';
  for (let i = 2; i < fx.skids.length; i++) {
    const a = fx.skids[i - 2];
    const b = fx.skids[i];
    if (b.t - a.t > FX.skidEvery * 3) continue;      // 끊긴 구간은 잇지 않는다
    const age = (fx.tick - b.t) / FX.skidLife;
    if (age >= 1) continue;
    const p = toScreen(a.x, a.y);
    const q = toScreen(b.x, b.y);
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.55 * (1 - age);
    ctx.strokeStyle = '#0b0e14';
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
}

/** 랩 완주 순간 결승선에서 퍼지는 링. */
function drawLapBurst(ctx, sim, fx, toScreen) {
  const age = fx.tick - fx.lapAt;
  if (age < 0 || age >= FX.lapLife) return;
  const t = age / FX.lapLife;
  const cp = sim.track.checkpoints.find((c) => c.id === sim.track.lap.finish);
  if (!cp) return;
  const r = FX.lapR_mm * t;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const pt = toScreen(cp.x + Math.cos(a) * r, cp.y + Math.sin(a) * r);
    if (i === 0) ctx.moveTo(pt[0], pt[1]); else ctx.lineTo(pt[0], pt[1]);
  }
  ctx.closePath();
  ctx.lineWidth = 4 * (1 - t) + 1;
  ctx.globalAlpha = 0.85 * (1 - t);
  ctx.strokeStyle = css('--c-finish');
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** 코스 이탈 순간 화면 전체가 한 번 붉게 번쩍인다. */
function drawOfftrackFlash(ctx, sim, fx, cssW, cssH) {
  // 시도가 끝나면 tick 이 멈춰 섬광도 같이 멈춘다. 그대로 두면 화면이 계속 붉게 남는다.
  if (sim.ended) return;
  const age = fx.tick - fx.flashAt;
  if (age < 0 || age >= FX.flashLife) return;
  const t = age / FX.flashLife;
  ctx.globalAlpha = 0.34 * (1 - t);
  ctx.fillStyle = css('--c-car-off');
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.globalAlpha = 1;
}

function drawIsoCar(ctx, sim, assets, bgMeta, fit, toScreen, fx, pose) {
  const v = pose || sim.vehicle;
  const body = sim.kit.body;
  const art = assets.resolve(sim.kit.assets && sim.kit.assets.car_iso);
  const [cx, cy] = toScreen(v.x, v.y);
  // 그림만 키우는 배율. 물리 차폭은 그대로다 — 판정·충돌은 이 값을 보지 않는다.
  const show = (sim.challenge.scene.car_scale > 0) ? sim.challenge.scene.car_scale : 1;

  if (art && art.kind === 'frames') {
    const idx = frameIndexFor(v.heading_mdeg, art.meta);
    // 배경과 스프라이트는 카메라 각도가 같다. 픽셀당 mm 비율만 맞추면 크기가 일치한다.
    const bgMmPerPx = bgMeta.projection.ortho_width_mm / bgMeta.image_px[0];
    const drawW = art.meta.frame_px * (art.meta.mm_per_px / bgMmPerPx) * fit * show;
    const k = drawW / art.meta.frame_px;
    const px = cx - art.meta.pivot_px[0] * k;
    const py = cy - art.meta.pivot_px[1] * k;
    const shadow = art.shadows[idx];
    if (shadow) {
      ctx.globalAlpha = 0.32;
      ctx.drawImage(shadow, px, py, drawW, drawW);
      ctx.globalAlpha = 1;
    }
    if (art.frames[idx]) ctx.drawImage(art.frames[idx], px, py, drawW, drawW);
  }

  drawWheelSpin(ctx, sim, fx, toScreen, v);

  // 식별 표시 — 바닥에 놓인 원과 방향 쐐기를 그대로 투영한다(아이소에서는 타원으로 보인다).
  const ringR = body.width_mm * 0.62 * show;
  const rad = (v.heading_mdeg / 1000) * Math.PI / 180;
  const color = sim.offtrack.active ? css('--c-car-off') : css('--c-car-ring');
  ctx.beginPath();
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const p = toScreen(v.x + Math.cos(a) * ringR, v.y + Math.sin(a) * ringR);
    if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
  }
  ctx.closePath();
  ctx.lineWidth = 2;
  ctx.globalAlpha = sim.offtrack.active ? 1 : 0.85;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.globalAlpha = 1;

  const tip = toScreen(v.x + Math.cos(rad) * (ringR + 34), v.y + Math.sin(rad) * (ringR + 34));
  const left = toScreen(v.x + Math.cos(rad + 0.42) * (ringR - 4), v.y + Math.sin(rad + 0.42) * (ringR - 4));
  const right = toScreen(v.x + Math.cos(rad - 0.42) * (ringR - 4), v.y + Math.sin(rad - 0.42) * (ringR - 4));
  ctx.beginPath();
  ctx.moveTo(tip[0], tip[1]);
  ctx.lineTo(left[0], left[1]);
  ctx.lineTo(right[0], right[1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  // 위치 표시. 도시가 빽빽해 차가 건물·가로수에 묻히면 학생이 자기 차를 찾지 못한다.
  // 접지점에서 곧게 올라가는 막대 하나라 어느 방향으로 달려도 같은 자리를 가리킨다.
  const stemTop = toScreen(v.x, v.y, MARKER_MM * show);
  const stemFoot = toScreen(v.x, v.y);
  ctx.beginPath();
  ctx.moveTo(stemFoot[0], stemFoot[1]);
  ctx.lineTo(stemTop[0], stemTop[1]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(6, 10, 18, .75)';
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(stemTop[0], stemTop[1], 5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(6, 10, 18, .8)';
  ctx.stroke();

  // 핀 위 배지. 코스가 비어 있으면 차가 어디 있는지 한눈에 안 들어온다.
  // 문구는 매니페스트가 소유한다 — 없으면 배지를 붙이지 않는다.
  const badge = sim.challenge.scene.car_badge;
  if (badge) {
    ctx.save();
    ctx.font = `800 11px ${css('--font-ui') || 'sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(badge).width + 16;
    const by = stemTop[1] - 13;
    ctx.fillStyle = color;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(stemTop[0] - w / 2, by - 9, w, 18, 9);
      ctx.fill();
    } else {
      ctx.fillRect(stemTop[0] - w / 2, by - 9, w, 18);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillText(badge, stemTop[0], by);
    ctx.restore();
  }
}

/** 위치 표시 막대의 높이(mm). 신호등 함체(400mm)보다 낮게 두어 화면을 가리지 않는다. */
const MARKER_MM = 300;

const cssCache = new Map();
/**
 * 색 토큰. 값을 캐시하되 '빈 값'은 캐시하지 않는다 —
 * 스타일시트가 아직 붙지 않은 첫 프레임에 물어보면 빈 문자열이 오는데,
 * 그때의 폴백을 캐시해 버리면 스타일이 도착한 뒤에도 회색으로 굳는다.
 */
function css(name) {
  const hit = cssCache.get(name);
  if (hit) return hit;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (v) cssCache.set(name, v);
  return v || '#888';
}


/** 좌·우 바퀴 자리에 스포크를 얹어 모터별 PWM 만큼 돌린다. 스프라이트를 늘리지 않는 표시 방식이다. */
function drawWheelSpin(ctx, sim, fx, toScreen, pose) {
  const v = pose || sim.vehicle;
  const wb = (sim.kit.body && sim.kit.body.wheel_base_mm) || 96;
  const pwmMax = (sim.steps && sim.steps.pwmMax) || 255;
  const pwm = [v.pwmL, v.pwmR];
  [-1, 1].forEach((side, i) => {
    const [wx, wy] = wheelPoint(v, wb, side);
    const duty = Math.min(1, Math.abs(pwm[i]) / pwmMax);
    const r = FX.wheelR_mm;
    ctx.beginPath();
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const p = toScreen(wx + Math.cos(a) * r, wy + Math.sin(a) * r);
      if (k === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.35 + 0.35 * duty;
    ctx.strokeStyle = css('--c-wheel-spin');
    ctx.stroke();

    const phase = fx.wheel[i];
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = phase + (k / 3) * Math.PI * 2;
      const c = toScreen(wx, wy);
      const e = toScreen(wx + Math.cos(a) * r, wy + Math.sin(a) * r);
      ctx.moveTo(c[0], c[1]);
      ctx.lineTo(e[0], e[1]);
    }
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.45 + 0.45 * duty;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
}


/** 줌아웃으로 배경 바깥이 드러날 때, 배경 가장자리를 뷰 배경색으로 부드럽게 녹인다. */
function fadeBackgroundEdges(ctx, x, y, w, h, cssW, cssH) {
  const bg = css('--c-view-bg');
  const band = Math.max(12, Math.min(48, Math.min(w, h) * 0.06));
  const edges = [
    [x, y, x, y + band],                 // 위
    [x, y + h, x, y + h - band],         // 아래
    [x, y, x + band, y],                 // 왼쪽
    [x + w, y, x + w - band, y],         // 오른쪽
  ];
  const rects = [
    [x, y, w, band],
    [x, y + h - band, w, band],
    [x, y, band, h],
    [x + w - band, y, band, h],
  ];
  for (let i = 0; i < 4; i++) {
    const [gx0, gy0, gx1, gy1] = edges[i];
    const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
    g.addColorStop(0, bg);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(...rects[i]);
  }
  // 배경 밖은 이미 뷰 배경색으로 칠해져 있다 — 여기서는 경계만 지운다.
  void cssW; void cssH;
}


/**
 * 체크포인트 라벨 자리.
 *
 * 정사각 코스는 원점 기준 바깥쪽이면 충분하다. 스스로 교차하는 코스에는 '바깥'이 없어서,
 * 판정선 양쪽 후보 중 노면에서 멀고 다른 라벨과도 먼 쪽을 고른다(같은 트랙이면 항상 같은 결과다).
 */
function placeLabels(track) {
  const off = track.halfWidth + 90;
  const spots = new Map();
  if (track.shape !== 'polyline') {
    for (const cp of track.checkpoints) {
      const len = Math.hypot(cp.x, cp.y) || 1;
      spots.set(cp.id, [cp.x + (cp.x / len) * off, cp.y + (cp.y / len) * off]);
    }
    return spots;
  }
  const placed = [];
  for (const cp of track.checkpoints) {
    let best = null;
    for (const sign of [1, -1]) {
      const p = [cp.x - cp.ny * off * sign, cp.y + cp.nx * off * sign];
      let score = distanceToCenterLine(track, p[0], p[1]);
      for (const q of placed) score = Math.min(score, Math.hypot(p[0] - q[0], p[1] - q[1]));
      if (!best || score > best.score) best = { p, score };
    }
    placed.push(best.p);
    spots.set(cp.id, best.p);
  }
  return spots;
}
