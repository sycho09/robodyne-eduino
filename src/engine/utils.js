// utils.js — 공통 유틸리티 모음

// 난수 생성
export const rand = (a, b) => a + Math.random() * (b - a);

// 값 범위 제한
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 선형 보간 (Lerp)
export const lerp = (a, b, t) => a + (b - a) * t;

// 이미지 로드 완료 체크
export const ready = (im) => im.complete && im.naturalWidth > 0;

// 등급 산출 (type: 'normal' | 'strict')
// normal: S(95), A(85), B(70), C(50)
// strict: S(95), A(85), B(80), C(60)
export const gradeOf = (acc, type = 'normal') => {
  if (type === 'strict') {
    return acc >= 0.95 ? 'S' : acc >= 0.85 ? 'A' : acc >= 0.8 ? 'B' : acc >= 0.6 ? 'C' : 'D';
  }
  return acc >= 0.95 ? 'S' : acc >= 0.85 ? 'A' : acc >= 0.7 ? 'B' : acc >= 0.5 ? 'C' : 'D';
};
