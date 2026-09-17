/**
 * ui/scout/quad.js — 탐사 화면의 4분할.
 *
 * 칸 구성은 매니페스트(scene.ui.quad)가 소유한다. 이 파일은 "고른 화면을 어떻게 그리는가"
 * 만 안다. 어떤 화면이 있는지, 처음에 무엇이 켜져 있는지, 이름이 무엇인지는 전부 데이터다.
 *
 * 센서가 없는 화면(열화상 · 적외선):
 *   이 킷에는 아직 그 센서가 없다. 그래서 **그리지 않는다.** 밝기를 온도인 척 칠하면
 *   학생은 그것을 온도로 읽는다 — 없는 데이터를 있는 것처럼 보이게 하는 것이라 하지 않는다.
 *   대신 칸 자리 · 색맵 · 눈금 · 최고온 마커 자리까지만 잡아 두고 「센서 없음」이라고 적는다.
 *   센서가 붙는 날 이 자리에 실제 값이 들어오면 된다.
 *
 * 여기서 그리는 것은 전부 카메라 프레임에서 나온 실제 값이다(윤곽선 · 움직임 · 관심점 · 흐름).
 */

/** 아이언보우 색맵. 열화상의 표준 배색이라 센서가 붙어도 이 표가 그대로 쓰인다. */
const IRONBOW = [
  [0.00, 8, 10, 32], [0.22, 70, 18, 96], [0.44, 190, 42, 60],
  [0.66, 242, 120, 22], [0.85, 252, 214, 66], [1.00, 255, 255, 235],
];

export function ironbow(v) {
  const t = Math.max(0, Math.min(1, v));
  for (let i = 1; i < IRONBOW.length; i++) {
    if (t <= IRONBOW[i][0] || i === IRONBOW.length - 1) {
      const a = IRONBOW[i - 1];
      const b = IRONBOW[i];
      const k = (t - a[0]) / ((b[0] - a[0]) || 1);
      return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
    }
  }
  return [255, 255, 235];
}

const GRAY = (r, g, b) => (r * 299 + g * 587 + b * 114) / 1000;

/**
 * 4분할을 만든다.
 *   mount     이 요소 안에 칸 넷을 만든다
 *   ui        매니페스트의 scene.ui (quad · view_px · process_px · hud)
 *   heading   지금 추정 방위(rad)를 돌려주는 함수. 일반 칸의 방위 눈금이 읽는다
 */
export function createQuad({ mount, ui, heading }) {
  const quad = ui.quad;
  const [VW, VH] = ui.view_px;
  const [PW, PH] = ui.process_px;
  const byId = new Map((quad.options || []).map((o) => [o.id, o]));
  // 학생이 고른 칸 구성. 처음 값은 매니페스트가 준다.
  const slots = quad.slots.slice();

  // 프레임을 한 번만 옮겨 담는 작업용 캔버스. 칸마다 video 를 다시 읽지 않는다.
  const work = document.createElement('canvas');
  work.width = VW; work.height = VH;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  const proc = document.createElement('canvas');
  proc.width = PW; proc.height = PH;
  const pctx = proc.getContext('2d', { willReadFrequently: true });
  let prevGray = null;
  let points = [];
  let gcur = null;
  let gprev = null;
  let reseed = 0;
  const flow = { yaw: 0, fwd: 0 };
  let moving = false;
  let hasFrame = false;

  const optionsHtml = (on) => (quad.options || [])
    .map((o) => `<option value="${o.id}"${o.id === on ? ' selected' : ''}>${o.label}</option>`).join('');

  function build() {
    mount.innerHTML = slots.map((fx, i) => `
      <div class="qcell" data-el="qcell" data-slot="${i}">
        <canvas width="${VW}" height="${VH}" data-el="qcanvas"></canvas>
        <span class="qcell__name" data-el="qname"></span>
        <select class="qcell__pick" data-el="qpick" aria-label="${i + 1}번 칸 화면">${optionsHtml(fx)}</select>
        <span class="qcell__sub" data-el="qsub"></span>
      </div>`).join('');
    mount.querySelectorAll('[data-el="qpick"]').forEach((sel, i) => {
      sel.addEventListener('change', () => { slots[i] = sel.value; paintNames(); });
    });
    paintNames();
  }

  const cellOf = (i) => mount.querySelectorAll('[data-el="qcell"]')[i];
  const canvasOf = (i) => cellOf(i).querySelector('[data-el="qcanvas"]');
  const subOf = (i) => cellOf(i).querySelector('[data-el="qsub"]');

  function paintNames() {
    slots.forEach((fx, i) => {
      const o = byId.get(fx);
      cellOf(i).querySelector('[data-el="qname"]').textContent = o ? o.label : fx;
      cellOf(i).dataset.fx = fx;
      cellOf(i).dataset.sensor = o ? o.sensor : '';
    });
  }

  /** 이 화면이 카메라만으로 되는가. 아니면 아직 없는 센서가 필요한가. */
  const needsSensor = (fx) => {
    const o = byId.get(fx);
    return !!o && o.sensor !== 'camera';
  };

  /* ---------- 일반 칸 HUD ---------- */
  function hud(g) {
    const cx = VW / 2;
    const cy = VH / 2;
    g.strokeStyle = 'rgba(255,255,255,.34)';
    g.lineWidth = 1;
    if (ui.hud.crosshair) {
      g.beginPath();
      g.moveTo(cx, cy - 16); g.lineTo(cx, cy - 4);
      g.moveTo(cx, cy + 4); g.lineTo(cx, cy + 16);
      g.moveTo(cx - 16, cy); g.lineTo(cx - 4, cy);
      g.moveTo(cx + 4, cy); g.lineTo(cx + 16, cy);
      g.stroke();
    }
    if (ui.hud.corners) {
      g.strokeStyle = 'rgba(255,255,255,.22)';
      [[14, 14, 1, 1], [VW - 14, 14, -1, 1], [14, VH - 14, 1, -1], [VW - 14, VH - 14, -1, -1]]
        .forEach(([x, y, dx, dy]) => {
          g.beginPath(); g.moveTo(x + 16 * dx, y); g.lineTo(x, y); g.lineTo(x, y + 16 * dy); g.stroke();
        });
    }
    if (!ui.hud.heading_ticks) return;
    // 방위는 조종 명령을 적분한 추정 헤딩이다 — 나침반이 아니다. 그래서 이름표에 그렇게 적는다.
    const deg = (((heading() * 180) / Math.PI + 90) % 360 + 360) % 360;
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.font = '9px ui-monospace, monospace';
    for (let d = -40; d <= 40; d += 10) {
      const a = Math.round((deg + d) / 10) * 10;
      const x = cx + d * 2.6;
      g.fillRect(x, VH - 18, 1, d % 20 ? 3 : 6);
      if (!(d % 20)) g.fillText(String(((a % 360) + 360) % 360), x - 8, VH - 6);
    }
    g.fillStyle = 'rgba(255,255,255,.38)';
    g.fillText(ui.hud.heading_note, 12, VH - 6);
  }

  /* ---------- 센서가 없는 칸 ---------- */
  const PAD = 20;

  /** 주어진 너비 안에서 끊은 줄 목록. 캔버스에는 자동 줄바꿈이 없어 여기서 직접 끊는다. */
  function wrapLines(g, text, maxWidth) {
    const out = [];
    let line = '';
    for (const ch of String(text)) {
      const next = line + ch;
      if (g.measureText(next).width > maxWidth && line) {
        out.push(line);
        line = ch === ' ' ? '' : ch;
      } else line = next;
    }
    if (line) out.push(line);
    return out;
  }

  /** 칸 안쪽 여백 안에서 줄을 바꿔 적는다. */
  function wrapText(g, text, x, y, maxWidth, lineHeight) {
    let ty = y;
    for (const t of wrapLines(g, text, maxWidth)) { g.fillText(t, x, ty); ty += lineHeight; }
    return ty;
  }

  function plate(g, label, note) {
    g.fillStyle = '#0d1117';
    g.fillRect(0, 0, VW, VH);
    g.strokeStyle = 'rgba(255,255,255,.10)';
    g.setLineDash([5, 5]);
    g.strokeRect(10.5, 10.5, VW - 21, VH - 21);
    g.setLineDash([]);
    g.fillStyle = '#e7edf6';
    g.font = '700 13px -apple-system, sans-serif';
    g.fillText(label, PAD, 34);
    g.fillStyle = '#8a99ad';
    g.font = '10.5px -apple-system, sans-serif';
    // 여백 안에서 끊는다 — 예전에는 한 줄로 그려 오른쪽 경계에서 잘렸다.
    wrapText(g, note, PAD, 52, VW - PAD * 2, 14);
  }

  /** 열화상 자리. 색맵과 눈금과 최고온 마커 자리만 그린다. 온도값은 없다. */
  function thermalPlaceholder(g, opt) {
    plate(g, quad.no_sensor_label, quad.no_sensor_note);
    const [gx, gy] = opt.grid || [32, 24];
    // 격자 자리 — 센서가 붙으면 이 칸마다 한 값이 들어온다.
    g.strokeStyle = 'rgba(255,255,255,.045)';
    const cw = VW / gx;
    const chh = VH / gy;
    for (let x = 1; x < gx; x++) { g.beginPath(); g.moveTo(x * cw, 78); g.lineTo(x * cw, VH - 40); g.stroke(); }
    for (let y = 5; y < gy - 3; y++) { g.beginPath(); g.moveTo(0, y * chh); g.lineTo(VW, y * chh); g.stroke(); }
    // 최고온 마커는 센서가 붙은 뒤에 그린다. 값이 없는데 표적과 "--.- °C" 를 띄워 두면
    // 잴 수 있는데 못 재는 중인 것처럼 보인다 — 없는 것은 없는 대로 비워 둔다.
    // 색맵 눈금 — 센서가 붙어도 이 배색 그대로 쓴다.
    g.fillStyle = 'rgba(10,12,16,.72)';
    g.fillRect(8, VH - 34, 150, 26);
    for (let i = 0; i <= 28; i++) {
      const [r, gg, b] = ironbow(i / 28);
      g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
      g.fillRect(14 + i * 4.6, VH - 28, 5, 8);
    }
    g.fillStyle = 'rgba(255,255,255,.75)';
    g.font = '9px -apple-system, sans-serif';
    g.fillText('차갑다', 14, VH - 10);
    g.fillText('뜨겁다', 120, VH - 10);
    return `${gx}x${gy} 자리`;
  }

  /* ---------- 카메라로 되는 칸 ---------- */
  function grayOf() {
    pctx.drawImage(work, 0, 0, PW, PH);
    const src = pctx.getImageData(0, 0, PW, PH);
    const gray = new Float32Array(PW * PH);
    for (let p = 0, k = 0; p < src.data.length; p += 4, k++) {
      gray[k] = GRAY(src.data[p], src.data[p + 1], src.data[p + 2]);
    }
    return { src, gray };
  }

  function edgeOrMotion(g, fx) {
    const { gray } = grayOf();
    const out = pctx.createImageData(PW, PH);
    let sub = '';
    if (fx === 'night') {
      // 어두운 그림의 밝기를 끌어올린다. 가장 어두운 값과 가장 밝은 값 사이를 0~255 로 편다.
      // IR 조명이 아니다 — 없는 빛을 만들어 내는 것이 아니라 있는 빛을 늘려 보는 것이다.
      let mn = 255;
      let mx = 0;
      for (let k = 0; k < gray.length; k++) { if (gray[k] < mn) mn = gray[k]; if (gray[k] > mx) mx = gray[k]; }
      const sp = Math.max(1, mx - mn);
      for (let k = 0; k < gray.length; k++) {
        const v = Math.min(255, ((gray[k] - mn) / sp) * 255 * 1.15);
        const o = k * 4;
        out.data[o] = v * 0.20;
        out.data[o + 1] = v;
        out.data[o + 2] = v * 0.30;
        out.data[o + 3] = 255;
        if (((k / PW) | 0) % 3 === 0) out.data[o + 1] *= 0.86;   // 주사선 — 야간 장비처럼 읽히게
      }
      sub = `증폭 ×${(255 / sp).toFixed(1)}`;
    } else if (fx === 'edge') {
      for (let y = 1; y < PH - 1; y++) {
        for (let x = 1; x < PW - 1; x++) {
          const k = y * PW + x;
          const gxv = -gray[k - PW - 1] - 2 * gray[k - 1] - gray[k + PW - 1]
                      + gray[k - PW + 1] + 2 * gray[k + 1] + gray[k + PW + 1];
          const gyv = -gray[k - PW - 1] - 2 * gray[k - PW] - gray[k - PW + 1]
                      + gray[k + PW - 1] + 2 * gray[k + PW] + gray[k + PW + 1];
          const m = Math.min(255, Math.hypot(gxv, gyv));
          const o = k * 4;
          const base = gray[k] * 0.13;
          out.data[o] = base + m * 0.28;
          out.data[o + 1] = base + m * 0.92;
          out.data[o + 2] = base + m * 0.72;
          out.data[o + 3] = 255;
        }
      }
      sub = 'Sobel';
    } else {
      let moved = 0;
      for (let k = 0; k < gray.length; k++) {
        const diff = prevGray ? Math.abs(gray[k] - prevGray[k]) : 0;
        const on = diff > 16;
        if (on) moved++;
        const o = k * 4;
        const base = gray[k] * 0.26;
        out.data[o] = on ? 245 : base;
        out.data[o + 1] = on ? 60 : base;
        out.data[o + 2] = on ? 64 : base;
        out.data[o + 3] = 255;
      }
      sub = `${Math.round((moved * 100) / gray.length)}%`;
    }
    pctx.putImageData(out, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(proc, 0, 0, VW, VH);
    // 이 그림이 무엇인지 칸이 스스로 밝힌다. 야간 보정을 적외선으로 읽으면 안 된다.
    const note = (byId.get(fx) || {}).note;
    if (note) {
      g.font = '9px -apple-system, sans-serif';
      const lines = wrapLines(g, note, VW - 16);
      const h = lines.length * 12 + 6;
      g.fillStyle = 'rgba(10,13,17,.70)';
      g.fillRect(0, VH - h, VW, h);
      g.fillStyle = 'rgba(255,255,255,.62)';
      lines.forEach((t, i) => g.fillText(t, 8, VH - h + 12 + i * 12));
    }
    if (!prevGray) prevGray = new Float32Array(PW * PH);
    prevGray.set(gray);
    return sub;
  }

  /** 관심점을 다시 뿌린다. 밝기가 양쪽으로 꺾이는 자리를 고른다(코너 비슷한 곳). */
  function seedPoints() {
    const cand = [];
    for (let y = 8; y < PH - 8; y += 4) {
      for (let x = 8; x < PW - 8; x += 4) {
        const k = y * PW + x;
        const r = Math.abs(2 * gcur[k] - gcur[k - 2] - gcur[k + 2])
                + Math.abs(2 * gcur[k] - gcur[k - 2 * PW] - gcur[k + 2 * PW]);
        if (r > 14) cand.push({ x, y, r });
      }
    }
    cand.sort((a, b) => b.r - a.r);
    const out = [];
    for (const c of cand) {
      if (out.length >= 95) break;
      let ok = true;
      for (const o of out) if (Math.abs(o.x - c.x) < 7 && Math.abs(o.y - c.y) < 7) { ok = false; break; }
      if (ok) out.push({ x: c.x, y: c.y, dx: 0, dy: 0, age: 0, tr: [] });
    }
    points = out;
  }

  /** 관심점을 한 걸음 따라간다. 블록 매칭(SAD) 이라 카메라가 실제로 잰 움직임이다. */
  function trackPoints() {
    const g = grayOf().gray;
    gcur = g;
    if (!gprev) { gprev = new Float32Array(PW * PH); gprev.set(gcur); seedPoints(); return; }
    const R = 5;
    const keep = [];
    const dxs = [];
    const rad = [];
    for (const p of points) {
      let best = Infinity;
      let bx = 0;
      let by = 0;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const nx = p.x + dx;
          const ny = p.y + dy;
          if (nx < 3 || ny < 3 || nx >= PW - 3 || ny >= PH - 3) continue;
          let sad = 0;
          for (let y = -2; y <= 2; y += 2) {
            for (let x = -2; x <= 2; x += 2) {
              sad += Math.abs(gcur[(ny + y) * PW + nx + x] - gprev[(p.y + y) * PW + p.x + x]);
            }
          }
          if (sad < best) { best = sad; bx = dx; by = dy; }
        }
      }
      if (best > 190) continue;
      p.dx = bx; p.dy = by; p.x += bx; p.y += by; p.age++;
      p.tr.push({ x: p.x, y: p.y });
      if (p.tr.length > 9) p.tr.shift();
      if (p.x < 4 || p.y < 4 || p.x >= PW - 4 || p.y >= PH - 4) continue;
      keep.push(p);
      dxs.push(bx);
      const ux = p.x - PW / 2;
      const uy = p.y - PH / 2;
      const len = Math.hypot(ux, uy) || 1;
      rad.push((bx * ux + by * uy) / len);
    }
    points = keep;
    const med = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
    flow.yaw = flow.yaw * 0.6 + med(dxs) * 0.4;
    flow.fwd = flow.fwd * 0.6 + med(rad) * 0.4;
    gprev.set(gcur);
    if (++reseed % 20 === 0 || points.length < 45) seedPoints();
  }

  function drawTrack(g) {
    const S = VW / PW;
    g.drawImage(work, 0, 0, VW, VH);
    g.fillStyle = 'rgba(8,11,16,.52)';
    g.fillRect(0, 0, VW, VH);
    points.forEach((p) => {
      const m = Math.hypot(p.dx, p.dy);
      const hue = Math.max(0, 190 - m * 34);
      if (p.tr.length > 1) {
        g.strokeStyle = `hsla(${hue},85%,62%,.55)`;
        g.lineWidth = 1.4;
        g.beginPath();
        p.tr.forEach((t, i) => { const X = t.x * S; const Y = t.y * S; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
        g.stroke();
      }
      g.fillStyle = `hsla(${hue},92%,68%,.95)`;
      g.beginPath();
      g.arc(p.x * S, p.y * S, m > 0.6 ? 2.6 : 1.7, 0, 7);
      g.fill();
    });
    // 카메라가 잰 움직임. 바퀴가 아니라 그림이 흐른 양이라 미끄러져도 드러난다.
    g.fillStyle = 'rgba(12,15,20,.74)';
    g.fillRect(8, VH - 58, 150, 50);
    g.strokeStyle = 'rgba(255,255,255,.12)';
    g.strokeRect(8.5, VH - 57.5, 149, 49);
    g.fillStyle = '#8d97a6';
    g.font = '700 9.5px -apple-system, sans-serif';
    g.fillText('카메라가 잰 움직임', 15, VH - 44);
    const bar = (y, v, label) => {
      g.fillStyle = '#7d8794';
      g.font = '9.5px -apple-system, sans-serif';
      g.fillText(label, 15, y + 7);
      g.fillStyle = 'rgba(255,255,255,.10)';
      g.fillRect(52, y, 92, 7);
      const w = Math.max(-46, Math.min(46, v * 13));
      g.fillStyle = w < 0 ? '#f59e0b' : '#5a93ff';
      g.fillRect(98, y, w, 7);
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.fillRect(97.5, y - 1, 1, 9);
    };
    bar(VH - 36, -flow.yaw, '회전');
    bar(VH - 22, flow.fwd, '전진');
    return `${points.length}점`;
  }

  function drawDepth(g) {
    g.fillStyle = '#0b0e13';
    g.fillRect(0, 0, VW, VH);
    const S = VW / PW;
    let mx = 0.35;
    points.forEach((p) => { mx = Math.max(mx, Math.hypot(p.dx, p.dy)); });
    g.globalCompositeOperation = 'lighter';
    points.forEach((p) => {
      const m = Math.min(1, Math.hypot(p.dx, p.dy) / mx);
      const hue = 210 - m * 210;
      const X = p.x * S;
      const Y = p.y * S;
      const R = 26 + m * 16;
      const grd = g.createRadialGradient(X, Y, 0, X, Y, R);
      grd.addColorStop(0, `hsla(${hue},90%,${26 + m * 26}%,.95)`);
      grd.addColorStop(1, `hsla(${hue},90%,20%,0)`);
      g.fillStyle = grd;
      g.beginPath(); g.arc(X, Y, R, 0, 7); g.fill();
    });
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i <= 4; i++) {
      g.fillStyle = `hsl(${210 - i * 52.5},88%,44%)`;
      g.fillRect(12 + i * 15, VH - 16, 15, 7);
    }
    g.fillStyle = 'rgba(255,255,255,.72)';
    g.font = '9.5px -apple-system, sans-serif';
    g.fillText('멀다', 12, VH - 20);
    g.fillText('가깝다', 60, VH - 20);
    if (!moving) {
      g.fillStyle = 'rgba(11,14,19,.74)';
      g.fillRect(0, VH / 2 - 22, VW, 46);
      g.fillStyle = '#fff';
      g.font = '700 12px -apple-system, sans-serif';
      g.fillText('움직여야 깊이가 보입니다', 78, VH / 2);
      g.fillStyle = '#9aa6b6';
      g.font = '10px -apple-system, sans-serif';
      g.fillText('거리계가 아니라, 빨리 흐르는 점이 가깝다는 원리입니다', 34, VH / 2 + 16);
    }
    return moving ? '흐름 계측' : '움직여야 보임';
  }

  /**
   * 객체 인식 칸.
   *
   * [적용하기] 를 누르기 전에는 아무것도 알아보지 않는다 — "모델 미적용" 이라고 적는다.
   * 학습만 하고 적용하지 않았는데 화면이 알아보기 시작하면, 학생은 무엇이 언제 켜졌는지 모른다.
   *
   * 네모는 격자 칸을 이어 붙인 어림이지 물체의 윤곽이 아니다. 그 사실을 칸 안에 적는다.
   */
  function drawAi(g, state) {
    g.drawImage(work, 0, 0, VW, VH);
    g.fillStyle = 'rgba(10,13,17,.30)';
    g.fillRect(0, 0, VW, VH);
    const n = (state.grid || 3);
    g.strokeStyle = 'rgba(255,255,255,.07)';
    g.lineWidth = 1;
    for (let i = 1; i < n; i++) {
      g.beginPath(); g.moveTo((i * VW) / n, 0); g.lineTo((i * VW) / n, VH); g.stroke();
      g.beginPath(); g.moveTo(0, (i * VH) / n); g.lineTo(VW, (i * VH) / n); g.stroke();
    }
    if (!state.model) {
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.font = '11px -apple-system, sans-serif';
      g.fillText(state.aiHint || '학습하고 [적용하기] 를 누르세요', 12, VH - 8);
      return '모델 미적용';
    }
    const cw = VW / n;
    const chh = VH / n;
    (state.dets || []).forEach((d) => {
      const c = state.model.sets[d.ci];
      const x = d.x0 * cw + 3;
      const y = d.y0 * chh + 3;
      const w = (d.x1 - d.x0 + 1) * cw - 6;
      const h = (d.y1 - d.y0 + 1) * chh - 6;
      g.strokeStyle = c.color;
      g.lineWidth = 2;
      g.strokeRect(x, y, w, h);
      g.lineWidth = 3;
      [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(([px, py, dx, dy]) => {
        g.beginPath(); g.moveTo(px + 12 * dx, py); g.lineTo(px, py); g.lineTo(px, py + 12 * dy); g.stroke();
      });
      const t = `${c.name} ${Math.round(d.conf * 100)}%`;
      g.font = '700 11px -apple-system, sans-serif';
      g.fillStyle = c.color;
      g.fillRect(x, Math.max(0, y - 17), g.measureText(t).width + 12, 16);
      g.fillStyle = '#0d1014';
      g.fillText(t, x + 6, Math.max(11, y - 5));
    });
    // 네모가 무엇인지 화면이 스스로 밝힌다. 한 줄로 그리면 칸 오른쪽에서 잘리므로 끊어 적는다.
    if (state.boxNote) {
      g.font = '9px -apple-system, sans-serif';
      const lines = wrapLines(g, state.boxNote, VW - 16);
      const h = lines.length * 12 + 6;
      g.fillStyle = 'rgba(10,13,17,.70)';
      g.fillRect(0, VH - h, VW, h);
      g.fillStyle = 'rgba(255,255,255,.62)';
      lines.forEach((t, i) => g.fillText(t, 8, VH - h + 12 + i * 12));
    }
    const k = (state.dets || []).length;
    return k ? `${k}개 잡힘` : '없음';
  }

  function waiting(g, text) {
    g.fillStyle = '#0d1117';
    g.fillRect(0, 0, VW, VH);
    g.fillStyle = '#8a99ad';
    g.font = '12px -apple-system, sans-serif';
    g.fillText(text, 20, VH / 2);
  }

  /**
   * 한 프레임 그린다.
   *   src     어댑터가 준 프레임(video/canvas/ImageBitmap) 또는 null
   *   ctx     지금 상태 { waiting, moving, ai }
   */
  function paint(src, state = {}) {
    moving = !!state.moving;
    hasFrame = !!src;
    if (hasFrame) wctx.drawImage(src, 0, 0, VW, VH);
    // 관심점은 두 칸(추적 · 깊이)이 함께 쓰므로 한 번만 돌린다.
    const wantsFlow = hasFrame && slots.some((fx) => fx === 'track' || fx === 'depth');
    if (wantsFlow) trackPoints();

    slots.forEach((fx, i) => {
      const g = canvasOf(i).getContext('2d');
      const opt = byId.get(fx);
      let sub = '';
      if (needsSensor(fx)) {
        sub = thermalPlaceholder(g, opt);
      } else if (!hasFrame) {
        waiting(g, state.waiting || '카메라를 켜면 여기에 보입니다.');
      } else if (fx === 'raw') {
        g.drawImage(work, 0, 0, VW, VH);
        hud(g);
      } else if (fx === 'ai') {
        sub = drawAi(g, state);
      } else if (fx === 'track') {
        sub = drawTrack(g);
      } else if (fx === 'depth') {
        sub = drawDepth(g);
      } else {
        sub = edgeOrMotion(g, fx);
      }
      subOf(i).textContent = sub;
    });
  }

  build();

  return {
    paint,
    slots: () => slots.slice(),
    /** 지금 프레임이 담긴 캔버스. 표본 추출과 다중 인식이 이것을 읽는다. */
    workCanvas: () => work,
    hasFrame: () => hasFrame,
    /** 지금 프레임의 회색조(작업 해상도). 선명도 계산이 읽는다. */
    grayNow: () => (hasFrame ? grayOf().gray : null),
    graySize: () => [PW, PH],
    flow: () => ({ ...flow }),
    points: () => points.length,
  };
}
