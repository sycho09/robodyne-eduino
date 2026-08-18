// utils.js — 게임 씬 공통 유틸리티.

export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ready = (im) => im.complete && im.naturalWidth > 0;

// 0~1 정확도 → 등급. strict 는 B·C 컷이 높다(80/60) — 응용·종합 무대가 쓴다.
export const gradeOf = (acc, type = 'normal') => {
  if (type === 'strict') {
    return acc >= 0.95 ? 'S' : acc >= 0.85 ? 'A' : acc >= 0.8 ? 'B' : acc >= 0.6 ? 'C' : 'D';
  }
  return acc >= 0.95 ? 'S' : acc >= 0.85 ? 'A' : acc >= 0.7 ? 'B' : acc >= 0.5 ? 'C' : 'D';
};
