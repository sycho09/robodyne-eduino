// results.js — 미니게임 결과 보관소(localStorage). 기록실·기록증이 여기서 읽는다.

const KEY = 'eduino.results.v1';
const EVT = 'eduino:results-change';

const CUTS = [['S', 95], ['A', 85], ['B', 70], ['C', 50], ['D', 0]];
const GRADES = CUTS.map(([g]) => g);
export const PASS_GRADE = 'A';

const clampPct = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const gradeOf = (accuracy) => (CUTS.find(([, min]) => clampPct(accuracy) >= min) || ['D'])[0];
const gradeRank = (g) => { const i = GRADES.indexOf(g); return i < 0 ? GRADES.length : i; };
const isPassing = (g) => gradeRank(g) <= gradeRank(PASS_GRADE);
const floorOf = (g) => (CUTS.find(([c]) => c === g) || [, 0])[1];

function load() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; }
  catch { return {}; }
}
let store = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {}
  try { window.dispatchEvent(new CustomEvent(EVT)); } catch {}
}

// 지표는 [{label, value}] 로만 받는다 — 읽는 쪽이 게임 종류를 몰라도 그릴 수 있게.
function normalizeMetrics(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => m && m.label != null && m.value != null)
    .slice(0, 6)
    .map((m) => ({ label: String(m.label), value: String(m.value) }));
}

// 정확도를 주면 등급을 계산하고, 등급만 주면 정확도를 그 등급 하한으로 채운다.
function entryOf(payload = {}) {
  const hasAcc = payload.accuracy != null && payload.accuracy !== '';
  const grade = payload.grade || gradeOf(payload.accuracy);
  return {
    grade,
    accuracy: hasAcc ? clampPct(payload.accuracy) : floorOf(grade),
    passed: payload.passed != null ? !!payload.passed : isPassing(grade),
    summary: payload.summary ? String(payload.summary) : '',
    metrics: normalizeMetrics(payload.metrics),
    durationMs: Number(payload.durationMs) || 0,
    at: Date.now(),
  };
}

// 정확도가 높으면 등급도 같거나 높으므로, 이 기준이 곧 '최고 등급 판'을 남긴다.
function isBetter(next, prev) {
  if (!prev) return true;
  if (next.accuracy !== prev.accuracy) return next.accuracy > prev.accuracy;
  return gradeRank(next.grade) < gradeRank(prev.grade);
}

// 단계별 최고 기록 — best 는 제일 잘한 판 하나라 '어느 단계가 남았나' 에 답하지 못한다.
function mergeStages(prev, entry) {
  if (!entry.summary) return prev;             // 이름이 없으면 단계를 가를 수 없다
  const out = { ...(prev || {}) };
  if (isBetter(entry, out[entry.summary])) out[entry.summary] = entry;
  return out;
}

export const results = {
  // 판이 끝날 때마다 부른다(통과 여부와 무관). 클리어 도장은 각 게임의 finishAll() 이 찍는다.
  // 반환 improved 가 true 면 '신기록!' 을 띄우면 된다.
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

  // 방 대표 = 가장 낮은 단계. best 를 쓰면 쉬운 단계가 뽑혀 클리어 여부와 어긋난다.
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

  // 기록실이 열려 있는 동안 결과가 들어와도 반영되게.
  subscribe(fn) {
    const h = () => fn(store);
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  },
};
