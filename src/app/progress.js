// progress.js — 학습 진척도 저장(localStorage). 부스 클리어 여부만 기록.
// 무대/전체 집계는 curriculum.js(overallCleared/overallTotal)가 챕터 구성으로 계산한다.
const KEY = 'eduino.progress.v1';

function load() { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); } }
let cleared = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify([...cleared])); } catch {} }

export const progress = {
  isCleared: (id) => cleared.has(id),
  mark: (id) => { cleared.add(id); save(); },
  unmark: (id) => { cleared.delete(id); save(); },
  reset: () => { cleared = new Set(); save(); },
};
