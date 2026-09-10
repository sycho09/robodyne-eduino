## 리팩토링 작업 지침

**리팩토링·React 전환 준비 작업이라면 `docs/refactoring.md` 를 읽고 그 문서의
「실행 지침」절을 따를 것.** 현황 실측표·Phase 체크리스트·금지 목록이 전부 거기 있다.

`README.md` = 앱 소개·실행·자산 파이프라인 · `HANDOFF.md` = 커리큘럼·씬 구성의 기준.

## 이 프로젝트에 대해

프레임워크 없는 **Vite 바닐라 ES Modules SPA**. Electron 아님 — 데스크톱 빌드가 없다.
`npm run dev` 로 띄우고, 배포는 Vercel(`dist`). HTML 진입점은 `index.html` 하나뿐이고
씬 전환은 `src/app/nav.js` 의 함수 호출 라우팅이다(URL 은 변하지 않는다).

## 손대지 말 것

- **`src/serial/*`** — STK500v1 부트로더·Intel-HEX 파서. DOM 의존 없는 순수 로직이고,
  잘못 건드리면 보드를 못 쓰게 만들 수 있다.
- **`src/content/curriculum.js`** — 챕터·룸 구성의 단일 소스. 17개 파일이 참조한다.
- **`src/engine/topdown.js`** — 368줄이지만 단일 책임(캔버스 월드)이다. 쪼개지 말 것.
- **`src/app/flags.js`** — `import.meta.env.VITE_* === 'true'` 를 함수로 감싸면 상수
  폴딩이 깨져 번들에 죽은 코드가 남는다.
- **각 씬의 `cleanup()` 대칭 구조** — rAF·이벤트·보드 정리를 짝 맞춰 해제한다.
  React 이식 시 `useEffect` 정리 함수에 1:1 대응되는 자산이므로 깨뜨리지 말 것.
- **`src/styles/parts/*.css` 의 `@import` 순서** — 캐스케이드 순서다. 재배치하거나
  규칙을 다른 파트로 옮기면 화면이 깨진다. `src/styles/main.css:3-7` 에 경고가 있다.
- **`public/brand/` 의 파일명** — 파일명 규칙으로 자산을 찾는 코드가 있다
  (`/brand/game-${id}-cover.webp` 등). 이름을 바꾸면 이미지가 사라진다.

## 경로 주의

자산 경로 **82곳이 루트 기준 절대경로**(`/brand/...`)이고 `vite.config.js` 에 `base` 가
없다. 새 코드에서 자산을 참조할 때 절대경로를 **추가하지 말 것** — 이유와 대안은
`docs/refactoring.md` 2장·Phase 1 참고.
