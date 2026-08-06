// flags.js — 빌드 타임 플래그. 개발 편의 기능을 프로덕션 빌드에서 차단한다.
//
// Vite 가 빌드 시점에 import.meta.env.* 를 리터럴로 정적 치환한다
// (DEV → false, 미설정 VITE_* → undefined). 그 결과 아래 식이 상수 false 로 접히고,
// 이 값으로 감싼 코드는 번들에서 통째로 사라진다 — 배포본엔 흔적조차 남지 않는다.
//
// ⚠️ 그래서 === 'true' 비교를 헬퍼 함수로 감싸면 안 된다. 함수 호출은 런타임 계산이라
//    상수 폴딩이 깨지고, 죽은 코드가 번들에 그대로 남는다. 아래 형태를 유지할 것.
//    (그 대가로 값은 정확히 소문자 'true' 여야 한다. 'TRUE'·'1' 은 인식하지 않는다.)
//
// 배포본에서 임시로 켜야 할 때만 환경변수를 쓴다(Vercel 대시보드 → Environment Variables).
// 빌드 시점에 읽히므로 값을 바꾸면 재배포가 필요하다. .env.example 참조.

/** 무대(챕터) 순차 잠금 해제. false 면 직전 무대를 모두 클리어해야 다음 무대가 열린다. */
export const UNLOCK_ALL = import.meta.env.DEV || import.meta.env.VITE_UNLOCK_ALL === 'true';

/** 게임 내 '⏭ 건너뛰기(테스트)' 버튼과 window.__dev 디버그 훅. */
export const DEV_TOOLS = import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === 'true';
