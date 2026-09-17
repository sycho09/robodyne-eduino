/**
 * ui/scout/ml.js — 탐사 챌린지의 학습 계산.
 *
 * 여기 있는 것은 전부 계산이다. DOM 을 만지지 않고 화면을 모른다.
 * 상수(클래스 수 · 최소 표본 · 확신도 문턱 · 퍼짐 배수 · 격자 · 빈 수)는 하나도 여기에 없다 —
 * 매니페스트(scout)가 소유하고 부르는 쪽이 넘겨준다.
 *
 * 원칙 7 — 프레임 원본을 담지 않는다. 촬영이 남기는 것은 숫자 35개짜리 배열 하나뿐이고,
 * 그 배열에서 원래 그림을 되살릴 수 없다. 이 파일에 이미지를 들고 있는 자리가 없다.
 *
 * 난수 없음 — PCA 의 시작 벡터는 고정이다. 같은 표본에서는 늘 같은 성분 지도가 나온다.
 */

/**
 * 특징 35 = 3x3 칸 평균 RGB 27 + 밝기 히스토그램 8빈.
 * 작게 줄인 그림에서 뽑으므로 물체가 조금 움직여도 값이 크게 흔들리지 않는다.
 *
 *   src   그림이 담긴 캔버스
 *   ctx   30x30 짜리 작업용 2D 컨텍스트 (부르는 쪽이 한 번 만들어 돌려 쓴다)
 *   spec  { grid, hist_bins, feature_len } — 매니페스트가 준다
 *   crop  잘라 볼 자리 [x, y, w, h]. 없으면 전체.
 */
export function extractFeature(src, ctx, spec, crop) {
  const S = ctx.canvas.width;                       // 30
  const { grid, hist_bins: bins, feature_len: len } = spec;
  if (crop) ctx.drawImage(src, crop[0], crop[1], crop[2], crop[3], 0, 0, S, S);
  else ctx.drawImage(src, 0, 0, S, S);
  const d = ctx.getImageData(0, 0, S, S).data;
  const f = new Float32Array(len);
  const cells = new Array(grid * grid).fill(0).map(() => [0, 0, 0, 0]);
  const hist = new Array(bins).fill(0);
  const step = S / grid;
  // 히스토그램 빈 나누기. 밝기 0~255 를 bins 개로 고르게 자른다.
  const shift = Math.round(Math.log2(256 / bins));
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const ci = Math.min(grid - 1, Math.floor(y / step)) * grid + Math.min(grid - 1, Math.floor(x / step));
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      cells[ci][0] += r; cells[ci][1] += g; cells[ci][2] += b; cells[ci][3]++;
      hist[Math.min(bins - 1, ((r * 299 + g * 587 + b * 114) / 1000 | 0) >> shift)]++;
    }
  }
  for (let c = 0; c < cells.length; c++) {
    const n = cells[c][3] || 1;
    f[c * 3] = Math.round(cells[c][0] / n);
    f[c * 3 + 1] = Math.round(cells[c][1] / n);
    f[c * 3 + 2] = Math.round(cells[c][2] / n);
  }
  // 빈 개수를 전체 픽셀 수로 나눠 0~255 로 편다. 한 빈에 다 몰리면 255 다.
  // 색 27개와 같은 눈금이라야 거리 계산에서 한쪽이 다른 쪽을 눌러 버리지 않는다.
  const norm = 255 / (S * S);
  for (let h = 0; h < bins; h++) f[cells.length * 3 + h] = Math.round(hist[h] * norm);
  return f;
}

/** 두 지문 사이의 거리. 35차원 유클리드. */
export function distance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

/** 지문에서 아홉 칸 색만 뽑아 CSS 색으로. 일지가 이 값을 남긴다. */
export function cellColors(f, grid) {
  const out = [];
  for (let c = 0; c < grid * grid; c++) out.push(`rgb(${f[c * 3]},${f[c * 3 + 1]},${f[c * 3 + 2]})`);
  return out;
}

/**
 * kNN. 가장 가까운 k 개가 투표한다.
 *   sets  [{ name, color, feats: Float32Array[] }]
 *   ex    빼고 셀 표본 { c, s } — LOOCV 가 자기 자신을 빼는 데 쓴다
 */
export function knn(sets, f, k, ex) {
  const pool = [];
  sets.forEach((c, ci) => c.feats.forEach((s, si) => {
    if (ex && ex.c === ci && ex.s === si) return;
    pool.push({ d: distance(f, s), ci });
  }));
  if (!pool.length) return null;
  pool.sort((a, b) => a.d - b.d);
  const kk = Math.min(k, pool.length);
  const votes = {};
  for (let i = 0; i < kk; i++) votes[pool[i].ci] = (votes[pool[i].ci] || 0) + 1;
  let best = -1;
  let bv = -1;
  for (const ci of Object.keys(votes)) if (votes[ci] > bv) { bv = votes[ci]; best = +ci; }
  return { ci: best, conf: bv / kk, scores: sets.map((_, i) => (votes[i] || 0) / kk) };
}

/**
 * LOOCV — 표본 하나를 빼고 나머지로 그것을 맞혀 보기를 전부 반복한다.
 * 표본이 적을 때 정확도를 재는 정직한 방법이다. 따로 시험 표본을 떼면 그마저 몇 장 안 된다.
 */
export function loocv(sets, k) {
  const L = sets.length;
  const cm = Array.from({ length: L }, () => new Array(L).fill(0));
  let ok = 0;
  let n = 0;
  sets.forEach((c, ci) => c.feats.forEach((s, si) => {
    const r = knn(sets, s, k, { c: ci, s: si });
    n++;
    if (r) { cm[ci][r.ci]++; if (r.ci === ci) ok++; }
  }));
  return { acc: n ? ok / n : 0, n, cm };
}

/**
 * 학습 곡선. 표본 1장일 때, 2장일 때… 각각 **LOOCV 를 실제로 다시 돌린 값**이다.
 * kNN 에는 반복 학습이 없으므로 에폭 곡선이란 것이 존재하지 않는다.
 * 그럴듯한 곡선을 그려 두면 그것은 지어낸 그림이지 측정값이 아니다.
 */
export function learningCurve(sets, k) {
  const maxN = Math.min(...sets.map((c) => c.feats.length));
  const curve = [];
  for (let n = 1; n <= maxN; n++) {
    const cut = sets.map((c) => ({ name: c.name, color: c.color, feats: c.feats.slice(0, n) }));
    curve.push({ n, acc: loocv(cut, k).acc });
  }
  return curve;
}

/** 모델 지문. 표본과 이름이 하나라도 다르면 값이 달라진다 — 화면이 "고친 뒤 다시 학습" 을 안다. */
export function fingerprint(sets) {
  let h = 2166136261;
  const eat = (str) => { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } };
  sets.forEach((c) => {
    c.feats.map((f) => Array.from(f).join(',')).sort().forEach(eat);
    eat(c.name);
  });
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 한 클래스의 표본이 얼마나 흩어져 있는가. 중심까지의 평균 거리다. */
export function classSpread(c) {
  if (c._spread !== undefined) return c._spread;
  const m = new Float32Array(c.feats[0].length);
  c.feats.forEach((s) => { for (let i = 0; i < m.length; i++) m[i] += s[i]; });
  for (let i = 0; i < m.length; i++) m[i] /= c.feats.length;
  c._spread = Math.max(20, c.feats.reduce((a, s) => a + distance(s, m), 0) / c.feats.length);
  return c._spread;
}

/** 클래스별 지문 평균. 지문 탭이 견주는 대상이다. */
export function classMeans(sets) {
  return sets.map((c) => {
    const mean = new Float32Array(c.feats[0].length);
    c.feats.forEach((s) => { for (let i = 0; i < mean.length; i++) mean[i] += s[i]; });
    for (let i = 0; i < mean.length; i++) mean[i] /= c.feats.length;
    return { c, mean };
  });
}

/**
 * 성분 지도(PCA) — 35차원을 두 축으로 눌러 본다.
 * 거듭제곱법으로 제1·제2 성분을 뽑는다. 시작 벡터가 고정(전부 1/√35)이고 반복 횟수도 고정이라
 * 같은 표본에서는 늘 같은 그림이 나온다. 난수를 쓰지 않는다.
 */
export function computePca(sets, iterations = 40) {
  const X = [];
  sets.forEach((c, ci) => c.feats.forEach((s) => X.push({ v: s, ci })));
  const n = X.length;
  if (n < 2) return null;
  const dim = X[0].v.length;
  const mean = new Float32Array(dim);
  X.forEach((o) => { for (let i = 0; i < dim; i++) mean[i] += o.v[i]; });
  for (let i = 0; i < dim; i++) mean[i] /= n;
  const C = X.map((o) => {
    const d = new Float32Array(dim);
    for (let i = 0; i < dim; i++) d[i] = o.v[i] - mean[i];
    return { d, ci: o.ci };
  });
  const power = (exclude) => {
    const v = new Float32Array(dim).fill(1 / Math.sqrt(dim));
    for (let it = 0; it < iterations; it++) {
      const w = new Float32Array(dim);
      C.forEach((o) => {
        let dot = 0;
        for (let i = 0; i < dim; i++) dot += o.d[i] * v[i];
        for (let i = 0; i < dim; i++) w[i] += o.d[i] * dot;
      });
      if (exclude) {
        let dot = 0;
        for (let i = 0; i < dim; i++) dot += w[i] * exclude[i];
        for (let i = 0; i < dim; i++) w[i] -= dot * exclude[i];
      }
      let nm = 0;
      for (let i = 0; i < dim; i++) nm += w[i] * w[i];
      nm = Math.sqrt(nm) || 1;
      for (let i = 0; i < dim; i++) v[i] = w[i] / nm;
    }
    return v;
  };
  const p1 = power(null);
  const p2 = power(p1);
  const pts = C.map((o) => {
    let a = 0;
    let b = 0;
    for (let i = 0; i < dim; i++) { a += o.d[i] * p1[i]; b += o.d[i] * p2[i]; }
    return { a, b, ci: o.ci };
  });
  const ax = Math.max(...pts.map((p) => Math.abs(p.a))) || 1;
  const bx = Math.max(...pts.map((p) => Math.abs(p.b))) || 1;
  return { mean, p1, p2, pts, ax, bx };
}

/**
 * 다중 인식 — 화면을 격자로 잘라 칸마다 따로 분류하고, 붙어 있는 같은 클래스를 한 덩어리로 친다.
 * 통과 조건 둘 — 확신도가 문턱 이상이고, 가장 가까운 표본까지의 거리가 그 클래스 퍼짐의
 * spread_factor 배 안일 것. 두 번째가 "배운 것과 너무 멀면 버린다" 이다.
 *
 * 네모는 격자 단위 근사다. 물체의 실제 윤곽이 아니며 화면이 그 사실을 적는다.
 */
export function detect(model, src, cellCtx, spec) {
  if (!model) return [];
  const { grid, confidence_min: confMin, spread_factor: spread, knn_k: k } = spec;
  const cw = src.width / grid;
  const ch = src.height / grid;
  const n = grid * grid;
  const cellOf = new Array(n).fill(-1);
  const conf = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const gx = i % grid;
    const gy = (i / grid) | 0;
    const f = extractFeature(src, cellCtx, spec, [gx * cw, gy * ch, cw, ch]);
    const r = knn(model.sets, f, k);
    if (!r) continue;
    const c = model.sets[r.ci];
    let dmin = Infinity;
    c.feats.forEach((s) => { const d = distance(f, s); if (d < dmin) dmin = d; });
    if (r.conf >= confMin && dmin < classSpread(c) * spread) { cellOf[i] = r.ci; conf[i] = r.conf; }
  }
  const seen = new Array(n).fill(false);
  const out = [];
  for (let i = 0; i < n; i++) {
    if (cellOf[i] < 0 || seen[i]) continue;
    const ci = cellOf[i];
    const q = [i];
    const cells = [];
    seen[i] = true;
    while (q.length) {
      const j = q.pop();
      cells.push(j);
      const x = j % grid;
      const y = (j / grid) | 0;
      [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(([nx, ny]) => {
        if (nx < 0 || nx >= grid || ny < 0 || ny >= grid) return;
        const m = ny * grid + nx;
        if (!seen[m] && cellOf[m] === ci) { seen[m] = true; q.push(m); }
      });
    }
    const xs = cells.map((j) => j % grid);
    const ys = cells.map((j) => (j / grid) | 0);
    out.push({
      ci,
      x0: Math.min(...xs), x1: Math.max(...xs),
      y0: Math.min(...ys), y1: Math.max(...ys),
      conf: Math.max(...cells.map((j) => conf[j])),
      n: cells.length,
    });
  }
  out.sort((a, b) => b.conf - a.conf);
  return out;
}

/**
 * 선명도 = 라플라시안 분산. 흔들린 그림은 밝기 변화가 뭉개져 이 값이 작다.
 * 흐린 표본을 담으면 학습이 망가지므로, 문턱 아래면 표본을 받지 않고 이유를 말한다.
 */
export function sharpness(gray, w, h) {
  let m = 0;
  let m2 = 0;
  let n = 0;
  for (let y = 2; y < h - 2; y += 2) {
    for (let x = 2; x < w - 2; x += 2) {
      const k = y * w + x;
      const L = 4 * gray[k] - gray[k - 1] - gray[k + 1] - gray[k - w] - gray[k + w];
      m += L; m2 += L * L; n++;
    }
  }
  if (!n) return 0;
  const varL = m2 / n - (m / n) * (m / n);
  return Math.max(0, Math.min(100, Math.round(Math.sqrt(Math.max(0, varL)) * 7)));
}
