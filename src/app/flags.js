// flags.js — 빌드 타임 플래그. Vite 가 import.meta.env.* 를 리터럴로 접어 개발용 코드가 배포본에서 사라진다.
// 주의: === 'true' 비교를 함수로 감싸면 상수 폴딩이 깨져 죽은 코드가 번들에 남는다. 이 형태를 유지할 것.
// 배포본에서 임시로 켤 때만 VITE_* 환경변수를 쓴다(빌드 시점에 읽히므로 재배포 필요 · .env.example).

/** 무대(챕터) 순차 잠금 해제. false 면 직전 무대를 모두 클리어해야 다음 무대가 열린다. */
export const UNLOCK_ALL = import.meta.env.DEV || import.meta.env.VITE_UNLOCK_ALL === 'true';

/** 게임 내 '⏭ 건너뛰기(테스트)' 버튼과 window.__dev 디버그 훅. */
export const DEV_TOOLS = import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === 'true';
