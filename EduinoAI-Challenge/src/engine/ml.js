/**
 * engine/ml.js — 이미지 분류 학습·추론 (전부 결정론).
 *
 * 실물은 학습된 TFLite 모델로 추론한다. 시뮬은 같은 API 모양을 유지하되,
 * 브라우저 안에서 도는 경량 결정론 분류기로 대신한다.
 *   난수 없음 · 신경망 없음 · 외부 라이브러리 없음 · 부동소수 누적 없음(거리는 정수).
 *
 * 특징 35개 = 3x3 칸의 RGB 평균 27개 + 밝기 히스토그램 8구간.
 * 전부 0~255 정수로 맞춰 한 축이 거리를 독차지하지 않게 한다.
 * 분류는 가장 가까운 샘플 3개(k=3)의 다수결. 같은 표면 클래스 번호가 작은 쪽이 이긴다.
 *
 * 같은 샘플셋이면 담은 순서가 달라도 같은 모델이 되도록, 학습 전에 표준 순서로 정렬한다.
 * 모델 해시는 그 정렬된 샘플만으로 만든다 — 시간·난수·화면 크기가 섞이지 않는다.
 */

export const ML = Object.freeze({
  grid: 3,                  // 3x3 칸
  bins: 8,                  // 밝기 히스토그램 구간
  k: 3,                     // 최근접 이웃 수
  classes: 3,               // 정지 · 서행 · 진행
  feature_len: 3 * 3 * 3 + 8,
  min_samples: 5,           // 클래스당 최소 (이보다 적으면 학습 불가)
  recommend_samples: 10,    // 클래스당 권장
  max_samples: 30,          // 클래스당 최대 (브라우저 저장 용량 보호)
});

/**
 * 픽셀에서 특징을 뽑는다. 원본 이미지는 여기서 끝이고 밖으로 나가지 않는다.
 * data 는 RGBA 배열(ImageData.data 와 같은 모양).
 */
export function extractFeature(data, width, height) {
  const g = ML.grid;
  const sums = new Array(g * g * 3).fill(0);
  const counts = new Array(g * g).fill(0);
  const hist = new Array(ML.bins).fill(0);
  let total = 0;

  for (let y = 0; y < height; y++) {
    const gy = Math.min(g - 1, Math.floor((y * g) / height));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(g - 1, Math.floor((x * g) / width));
      const i = (y * width + x) * 4;
      const r = data[i];
      const gc = data[i + 1];
      const b = data[i + 2];
      const cell = gy * g + gx;
      sums[cell * 3] += r;
      sums[cell * 3 + 1] += gc;
      sums[cell * 3 + 2] += b;
      counts[cell] += 1;
      // 밝기는 정수 근사(무게 계수를 1024 기준으로 고정) — 브라우저마다 값이 달라지지 않게.
      const lum = (r * 306 + gc * 601 + b * 117) >> 10;
      hist[Math.min(ML.bins - 1, (lum * ML.bins) >> 8)] += 1;
      total += 1;
    }
  }

  const out = new Array(ML.feature_len);
  for (let c = 0; c < g * g; c++) {
    const n = counts[c] || 1;
    out[c * 3] = Math.round(sums[c * 3] / n);
    out[c * 3 + 1] = Math.round(sums[c * 3 + 1] / n);
    out[c * 3 + 2] = Math.round(sums[c * 3 + 2] / n);
  }
  const base = g * g * 3;
  for (let i = 0; i < ML.bins; i++) {
    // 색 축과 같은 0~255 눈금으로 맞춘다.
    out[base + i] = Math.round((hist[i] * 255) / (total || 1));
  }
  return out;
}

/** 3x3 칸 색만 뽑아낸다. 샘플 미리보기를 원본 사진 없이 그릴 때 쓴다. */
export function featureSwatch(feature) {
  const out = [];
  for (let c = 0; c < ML.grid * ML.grid; c++) {
    out.push([feature[c * 3], feature[c * 3 + 1], feature[c * 3 + 2]]);
  }
  return out;
}

function distance(a, b) {
  let d = 0;
  for (let i = 0; i < ML.feature_len; i++) {
    const t = a[i] - b[i];
    d += t * t;
  }
  return d;
}

/** 담은 순서와 무관하게 같은 샘플셋이 같은 모델이 되도록 표준 순서로 정렬한다. */
function canonical(samples) {
  return samples
    .filter((s) => s && Array.isArray(s.f) && s.f.length === ML.feature_len)
    .map((s) => ({ label: s.label | 0, f: s.f.map((v) => v | 0) }))
    .sort((a, b) => {
      if (a.label !== b.label) return a.label - b.label;
      for (let i = 0; i < ML.feature_len; i++) if (a.f[i] !== b.f[i]) return a.f[i] - b.f[i];
      return 0;
    });
}

/** 샘플만으로 정해지는 해시. 같은 샘플셋 = 같은 해시 = 같은 모델. */
export function modelHash(samples) {
  const rows = canonical(samples);
  let h = 0x811c9dc5;
  const push = (n) => {
    h ^= n & 0xff; h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (n >> 8) & 0xff; h = Math.imul(h, 0x01000193) >>> 0;
  };
  push(rows.length);
  for (const row of rows) {
    push(row.label);
    for (const v of row.f) push(v);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * 이웃을 골라 클래스별 점수를 낸다.
 * 거리는 정수이고 정렬 기준까지 고정이라 같은 입력이면 언제나 같은 결과가 나온다.
 */
function vote(rows, feature, excludeIndex, k0) {
  const near = [];
  for (let i = 0; i < rows.length; i++) {
    if (i === excludeIndex) continue;
    near.push({ d: distance(rows[i].f, feature), i, label: rows[i].label });
  }
  if (!near.length) return null;
  near.sort((a, b) => (a.d !== b.d ? a.d - b.d : a.i - b.i));
  const k = Math.max(1, Math.min(k0 || ML.k, near.length));

  // 가까울수록 크게 치는 가중치. 거리는 정수라 나눗셈 결과도 항상 같다.
  const weight = new Array(ML.classes).fill(0);
  let sum = 0;
  for (let i = 0; i < k; i++) {
    const w = 1 / (1 + near[i].d);
    weight[near[i].label] += w;
    sum += w;
  }
  const scores = weight.map((w) => Math.round((w / sum) * 100));
  let best = 0;
  for (let c = 1; c < ML.classes; c++) if (weight[c] > weight[best]) best = c;   // 동점은 번호가 작은 쪽
  return { label: best, scores, confidence: scores[best] };
}

/**
 * 이웃 수는 데이터 양에서 나온다. 샘플이 몇 장뿐인데 이웃 3개를 보면
 * 자기 자신을 뺀 순간 같은 반 표가 구조적으로 모자라 정확도가 낮게 고정된다.
 * 클래스당 5장에서 2, 9장 이상에서 3이 되도록 둔다.
 */
function neighborsFor(counts) {
  const min = Math.min(...counts);
  return Math.max(1, Math.min(ML.k, Math.ceil(min / 3)));
}

/**
 * 하나씩 빼고 맞히기(LOOCV). 샘플이 적으면 정직하게 낮게 나온다.
 * 전체 정확도와 함께 클래스별 정답률·혼동표를 낸다 — 어디서 헷갈리는지 화면이 그대로 보여 준다.
 */
function loocv(rows, k) {
  const per = new Array(ML.classes).fill(0);
  const seen = new Array(ML.classes).fill(0);
  const confusion = Array.from({ length: ML.classes }, () => new Array(ML.classes).fill(0));
  if (rows.length < 2) return { accuracy: 0, perClass: per, confusion };
  let hit = 0;
  for (let i = 0; i < rows.length; i++) {
    const truth = rows[i].label;
    seen[truth] += 1;
    const v = vote(rows, rows[i].f, i, k);
    if (!v) continue;
    confusion[truth][v.label] += 1;
    if (v.label === truth) { hit += 1; per[truth] += 1; }
  }
  return {
    accuracy: Math.round((hit * 100) / rows.length),
    perClass: per.map((n, c) => (seen[c] ? Math.round((n * 100) / seen[c]) : 0)),
    confusion,
  };
}

/**
 * 학습 = 샘플 정리 + 자체 검증. 가중치를 만드는 단계가 없다(최근접 이웃이라 샘플이 곧 모델).
 * 정확도는 여기서만 계산한다 — 화면이 임의로 만들어 쓰지 않는다.
 */
export function trainModel(samples) {
  const rows = canonical(samples);
  const counts = new Array(ML.classes).fill(0);
  for (const r of rows) if (r.label >= 0 && r.label < ML.classes) counts[r.label] += 1;
  const ready = counts.every((n) => n >= ML.min_samples);
  const k = neighborsFor(counts);
  const cv = ready ? loocv(rows, k) : { accuracy: 0, perClass: new Array(ML.classes).fill(0), confusion: [] };
  return {
    rows,
    counts,
    k,
    total: rows.length,
    ready,
    accuracy: cv.accuracy,
    perClass: cv.perClass,
    confusion: cv.confusion,
    hash: modelHash(rows),
  };
}

/** 추론. 학습 전이거나 샘플이 모자라면 0(모름)을 낸다. */
export function classifyFeature(model, feature) {
  const empty = { label: 0, confidence: 0, scores: new Array(ML.classes).fill(0) };
  if (!model || !model.ready || !feature || feature.length !== ML.feature_len) return empty;
  const v = vote(model.rows, feature, -1, model.k);
  if (!v) return empty;
  return { label: v.label + 1, confidence: v.confidence, scores: v.scores };   // API 는 1부터 센다
}

// ── 시뮬에 얹히는 추론 결과 ────────────────────────────────────
// 카메라와 같은 방식이다. 바깥(웹캠+모델)이 값을 얹고, 코드는 읽기만 한다.

export function mlState(sim) {
  if (!sim.ml) sim.ml = { begun: false, reading: null };
  return sim.ml;
}

export function resetMl(sim) {
  const m = mlState(sim);
  m.begun = false;   // reading 은 지우지 않는다 — 카메라 연결은 시도와 무관하다.
}

export function setMlReading(sim, reading) {
  const m = mlState(sim);
  m.reading = reading ? { label: reading.label | 0, confidence: reading.confidence | 0 } : null;
}

export function readMl(sim) {
  const m = mlState(sim);
  if (!m.begun || !m.reading) return { label: 0, confidence: 0 };
  return m.reading;
}

export function mlBegin(sim) {
  mlState(sim).begun = true;
}
