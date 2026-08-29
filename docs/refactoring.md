# AI 자율 리팩토링 체크리스트

이 문서는 기존 코드의 로직을 단 한 줄도 수정하지 않고, 비대해진 파일을 기능(Feature) 단위로 쪼개어 정리하는 "유지보수용 파일 분리" 지침서입니다. 에이전트는 아래 규칙을 엄수하여 0단계부터 순차적으로 자율 실행하십시오.

## 1. 절대 원칙
- **배포 URL 유지:** 기존 HTML 파일의 경로는 절대 변경하지 않습니다. (URL 변경 금지)
- **로직 수정 금지:** 알고리즘, 동작 방식, 함수 이름의 변경을 엄격히 금지합니다. 오직 파일 이동 및 분리만 수행합니다.
- **바닐라 JS 유지:** 번들러, 프레임워크, `type="module"` 등 새로운 빌드 도구를 도입하지 않습니다.
- **전역 스코프 유지:** 분리된 JS 파일은 IIFE로 감싸고, 기존 전역 변수명은 `window.X = X;` 형태로 명시적으로 유지합니다. HTML의 `<script src>` 추가 시 원본 의존성 순서를 준수합니다.

## 2. 분리 기준
1. **L1 (타입 분리):** HTML 내 `<style>`, `<script>` 본문을 금지하고 외부 파일로 분리합니다. JS 내 CSS 템플릿 문자열 금지.
2. **L2 (로컬 기능별 분리):** 비대해진 파일은 억지로 아키텍처 패턴을 끼워맞추지 않고, 연관된 '기능(Feature)' 단위로 자연스럽게 분리하여 하위 폴더에 담습니다. (예: `modules/vision/advanced.js` → `modules/vision/advanced/ui.js`, `model.js` 등)
3. **L3 (경계 분리):** 중복 코드는 `shared/` 폴더로 올립니다.

> **참고 (크기 상한 가이드):** 기계적인 줄 수(HTML/CSS 400줄, JS 300줄)보다 "의미와 책임" 단위 분리가 우선입니다. 역할이 명확한 코드는 상한선에 구애받지 않습니다.

## 3. 실행 체크리스트
에이전트는 각 항목 완료 시 `node --test`를 수행하고 `refactor(scope): <파일> css/js 분리` 메시지로 커밋하십시오.

### Phase 0 · 준비
- [ ] `test/no-inline.test.mjs` 신설: 모든 `.html`을 훑어 `<style>`, `<script>` 본문이 있으면 실패시키는 테스트 코드 작성.
- [ ] 대상 제외 파일(`index.html`, `shared/access.js`, `console/shared.js` 등) 화이트리스트 처리.

### Phase 1 · `stages/apps/` 및 소형 HTML 분리
- [ ] `stages/apps/detect.html`: `<script>` 본문(110–228) → `stages/apps/js/detect.js`로 이동. HTML엔 `<script src>`만 남김.
- [ ] `stages/apps/filter.html`: `<script>` 본문(115–214) → `stages/apps/js/filter.js`
- [ ] `stages/apps/face.html`: `<script>` 본문(108–206) → `stages/apps/js/face.js`
- [ ] `stages/apps/colortrack.html`: `<script>` 본문(111–203) → `stages/apps/js/colortrack.js`
- [ ] `stages/apps/skeleton.html`: `<script>` 본문(109–192) → `stages/apps/js/skeleton.js`
- [ ] `character-card.html` (1256줄): 
  - CSS(17–421) → `stages/apps/css/character-card.css`
  - JS(593–1254) → `stages/apps/js/character-card/` 하위 폴더 생성 후 로컬 기능별로 쪼개어 분리.
- [ ] `idea-board.html` (1065줄): 
  - CSS(17–267) → `stages/apps/css/idea-board.css`
  - JS(625–1063) → `stages/apps/js/idea-board/` 하위 폴더 생성 후 로컬 기능별 분리.

### Phase 2 · `platform/` HTML 분리
- [ ] `platform/index.html` (749줄): 
  - CSS → `platform/css/landing.css`
  - JS → `platform/js/landing/` 폴더에 기능별(data, hero, main 등) 분리.
- [ ] `platform/course.html` (757줄): 
  - CSS → `platform/css/course.css`
  - JS → `platform/js/course/` 폴더에 기능별(data, draw, scenes, main 등) 분리.
- [ ] `platform/sample.html` (589줄): 
  - CSS → `platform/css/sample.css`
  - JS → `platform/js/sample/` 폴더에 기능별(logic, onboarding, main 등) 분리.

### Phase 3 · `console/` + `entry.html` 분리
- [ ] `console/map.html`: CSS → `console/css/map.css`, JS → `console/js/map.js`
- [ ] `console/cards.html`: CSS → `console/css/cards.css`, JS → `console/js/cards.js`
- [ ] `entry.html`: CSS → `console/css/entry.css`, JS → `console/js/entry.js`
> *주의: console/shared.js 및 인트로 재생 정책 속성은 절대 건드리지 마십시오.*

### Phase 4 · 거대 JS 파일 및 CSS-in-JS 분할
- [ ] `stages/trainer/trainer.labs.js` (1240줄): 
  - 내부에 묶여있는 7개 랩(audio-rec, pose, segment, filter, skeleton, face, colortrack)을 각각 `stages/trainer/labs/*.js`로 파일 분리 후 `index.html`에 스크립트 순서대로 반영.
- [ ] CSS-in-JS 제거: `stages/studio/maker.js`, `stages/studio/imagelab.js`, `stages/submission/ui/submit.ui.js`, `stages/submission/board.js`, `stages/core/ui/dialog.js` 내부에 하드코딩된 템플릿 CSS(`const css = ...`)를 `.css` 파일로 추출하고, 이를 참조하는 HTML에 `<link>` 태그 추가.
- [ ] `stages/styles/trainer.css` (922줄): `layout.css`, `panels.css`, `results.css` 3개 파일로 분리.
- [ ] 모듈별 `advanced.js` 로컬 기능 분리:
  - `modules/concept/advanced.js`, `modules/text/advanced.js`, `modules/gesture/advanced.js`, `modules/vision/advanced.js` 의 비대해진 로직을 각각의 `advanced/` 하위 폴더에 기능별로 쪼개어 정리.
- [ ] `modules/data/app.js` (589줄): `modules/data/` 하위 폴더에 차트, 로직, 메인 등 기능별 분리.
- [ ] `modules/shared/course-dashboard.js` (853줄): `modules/shared/course-dashboard/` 폴더를 만들어 기능별(상태, 사이드바, 진단, 평가 등)로 분리 (상태 객체 참조 주의).

### Phase 5 · 중복 제거 및 완료 검증
- [ ] `stages/apps/` 5개 HTML의 동일한 `<script src>` 부트스트랩 코드 중복 제거.
- [ ] 전체 완료 후 `node --test` 통과 및 각 페이지 브라우저 콘솔 에러 0건 확인.

---

**[에이전트 실행 명령]**
에이전트는 이 파일을 읽은 즉시 Phase 0부터 자율적으로 작업을 시작하십시오.
