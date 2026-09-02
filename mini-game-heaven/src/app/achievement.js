// achievement.js — 기록실(화면)과 기록증(인쇄)이 같은 규칙으로 성취를 읽도록 모아 둔 곳.
// 둘이 어긋나면 같은 기록이 다르게 보이므로 판정·표기를 여기 한 벌만 둔다.

import { roomStages, isRoomCleared } from '../content/curriculum.js';
import { results } from './results.js';

const NO_GRADE = new Set(['basics']);   // 이론관은 등급을 안 매기고 '수료'로 끝낸다

/** 방의 단계별 등급. grade 는 등급 문자 · 'done'(수료) · null(미도전). */
export function stageList(room) {
  if (NO_GRADE.has(room.id)) {
    return [{ no: null, name: '', grade: results.has(room.id) ? 'done' : null }];
  }
  return roomStages(room.id).map((s, i) => ({ no: i + 1, name: s?.name || '', grade: s?.grade || null }));
}

/** HTML 에 넣기 전 이스케이프. 두 화면 다 문자열로 마크업을 짠다. */
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 표시 글자. 미도전 기호는 화면 `-` · 기록증 `–` 로 달라 인자로 받는다. */
export const gradeText = (grade, dash) => (grade === 'done' ? '수료' : grade ?? dash);

/** CSS 키 — 화면 `[data-grade]` 와 기록증 `.g-*` 가 같은 값을 본다. */
export const gradeKey = (grade) => esc(grade ?? 'none');

export const hasMedal = (room) => isRoomCleared(room.id);

