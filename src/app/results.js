// results.js — 미니게임 결과 기록 (localStorage)
// 게임 결과(등급, 정확도 등)를 저장하고 기록실(records.js)에 제공.

const KEY = 'eduino.results.v1';
const EVT = 'eduino:results-change';

// 등급 컷 (A등급 통과)
const CUTS = [['S', 95], ['A', 85], ['B', 70], ['C', 50], ['D', 0]];
export const GRADES = ['S', 'A', 'B', 'C', 'D'];
export const PASS_GRADE = 'A';

export function gradeOf(accuracy) {
  const a = clampPct(accuracy);
  for (const [g, min] of CUTS) if (a >= min) return g;
  return 'D';
}
export const gradeRank = (g) => { const i = GRADES.indexOf(g); return i < 0 ? GRADES.length : i; };
export const isPassing = (g) => gradeRank(g) <= gradeRank(PASS_GRADE);

const clampPct = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

function load() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; }
  catch { return {}; }
}
let store = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {}
  try { window.dispatchEvent(new CustomEvent(EVT)); } catch {}
}

// 지표는 [{ label, value }] 형태로만 받는다 — 기록실과 기록증이 게임 종류를 몰라도 그릴 수 있게.
function normalizeMetrics(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => m && m.label != null && m.value != null)
    .slice(0, 6)
    .map((m) => ({ label: String(m.label), value: String(m.value) }));
}

// 게임이 정확도를 주면 그걸로 등급을 계산하고, 알파벳 등급만 주면 그대로 쓴다.
// (등급만 온 경우 정확도는 해당 등급의 하한값으로 채워 평균 계산이 깨지지 않게 한다.)
const floorOf = (g) => (CUTS.find(([c]) => c === g) || [, 0])[1];

function entryOf(payload = {}) {
  const hasAcc = payload.accuracy != null && payload.accuracy !== '';
  const grade = payload.grade || gradeOf(payload.accuracy);
  const accuracy = hasAcc ? clampPct(payload.accuracy) : floorOf(grade);
  return {
    grade,
    accuracy,
    passed: payload.passed != null ? !!payload.passed : isPassing(grade),
    summary: payload.summary ? String(payload.summary) : '',
    metrics: normalizeMetrics(payload.metrics),
    durationMs: Number(payload.durationMs) || 0,
    at: Date.now(),
  };
}

// 기록실 갱신 규칙: 정확도가 더 높으면 갱신한다.
// 등급은 정확도에서 나오므로(정확도가 높으면 등급도 같거나 높다) 이 기준이 곧 '최고 등급 판'을 남긴다.
// 나중에 등급 컷을 다시 나눠도 남아 있는 판이 여전히 최고 등급이라는 게 이 방식의 이점이다.
// 정확도 없이 등급만 넘어온 게임은 등급으로 비교한다.
function isBetter(next, prev) {
  if (!prev) return true;
  if (next.accuracy !== prev.accuracy) return next.accuracy > prev.accuracy;
  return gradeRank(next.grade) < gradeRank(prev.grade);   // S > A > B > C > D
}

// 단계별 최고 기록 — best 는 제일 잘한 판 한 건이라 '어느 단계가 남았나' 에 답하지 못한다.
// 게임이 매판 보내는 단계 이름(summary)을 키로 모은다. 갱신 기준은 방 단위와 같은 isBetter.
// 예전 기록에는 이 칸이 없으니 읽는 쪽은 없을 수 있다고 보고 다뤄야 한다.
function mergeStages(prev, entry) {
  if (!entry.summary) return prev;             // 이름이 없으면 단계를 가를 수 없다
  const out = { ...(prev || {}) };
  if (isBetter(entry, out[entry.summary])) out[entry.summary] = entry;
  return out;
}

export const results = {
  // 게임 1판이 끝날 때마다 부른다(통과 여부와 무관하게 매판 기록한다).
  // 도전 횟수는 항상 오르고, 기록실에 보이는 등급은 더 높은 등급이 나왔을 때만 바뀐다.
  // 클리어(메달) 처리는 여기서 하지 않는다 — 방마다 '전 단계 통과' 같은 고유 조건이 있어서
  // 각 게임의 finishAll() 이 판단하고 progress.mark() 를 찍는다. 이 모듈은 기록만 맡는다.
  // 반환: { entry, best, improved } — improved 가 true 면 게임 쪽에서 '신기록!' 을 띄우면 된다.
  record(roomId, payload) {
    if (!roomId) return null;
    const entry = entryOf(payload);
    const prev = store[roomId];
    const improved = isBetter(entry, prev?.best);

    store[roomId] = {
      id: roomId,
      attempts: (prev?.attempts || 0) + 1,
      firstAt: prev?.firstAt || entry.at,
      lastPlayedAt: entry.at,
      last: entry,
      best: improved ? entry : prev.best,
      stages: mergeStages(prev?.stages, entry),
    };
    save();
    return { entry, best: store[roomId].best, improved };
  },

  // 방을 대표하는 기록 — 단계 중 '가장 낮은' 판. best 를 쓰면 안 된다: 여러 방이 단계를
  // easy/hard 로 나눠 놔서 최고 판은 거의 늘 쉬운 단계고, 클리어는 발목 잡는 단계가 정한다.
  roomRecord(roomId) {
    const rec = store[roomId];
    if (!rec) return null;
    const list = Object.values(rec.stages || {});
    if (!list.length) return rec.best || null;
    return list.reduce((low, s) => (s.accuracy < low.accuracy ? s : low));
  },

  get: (roomId) => store[roomId] || null,
  has: (roomId) => !!store[roomId],
  all: () => ({ ...store }),
  playedIds: () => Object.keys(store),
  clear(roomId) { delete store[roomId]; save(); },
  reset() { store = {}; save(); },

  // 화면이 스스로 갱신되게 — 기록실이 열려 있는 동안 결과가 들어와도 반영된다.
  subscribe(fn) {
    const h = () => fn(store);
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  },
};

