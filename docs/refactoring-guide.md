# 리팩토링 기준서

한 파일에 HTML·CSS·JS·비즈니스 로직이 섞인 곳을 걷어내기 위한 기준과 파일별 작업 지시서.
실행 프롬프트는 [refactoring-prompt.md](refactoring-prompt.md), 기존 모듈 구조 규칙은
[module-architecture.md](module-architecture.md)를 따른다(여기서 다시 서술하지 않는다).

---

## 1. 전제 — 바꾸지 않는 것

- **무빌드 바닐라 유지.** 번들러·프레임워크·`type="module"` 도입 금지
- **배포 중.** URL, 파일 경로, DOM `id`/`class` 이름 변경 금지
- **리팩토링은 이동만.** 동작 변경은 별도 커밋으로 분리한다

---

## 2. 기준 — 3층

파일 타입(css/js/html) 분리는 1층일 뿐이다. 그것만 하면 `character-card.html` 1256줄이
`character-card.js` 1000줄로 옮겨갈 뿐이고, 이미 `.js`인 `trainer.labs.js`(1240줄)는 손도 못 댄다.

### L1 · 타입 분리 — 한 파일은 한 언어

- HTML에 `<style>`·`<script>` **본문** 금지 (`<script src>`는 허용)
- JS 안에 CSS 템플릿 문자열(`const css = ` + 백틱) 금지 → `.css` 파일 + `<link>`

### L2 · 책임 분리 — JS 내부를 5역할로

| 접미사 | 역할 | 판정 기준 |
| --- | --- | --- |
| `*.config.js` | 상수 · 문구 · 데이터 테이블 | 브라우저 없이 읽힌다 |
| `*.logic.js` | 순수 계산 (입력 → 출력) | DOM·`window`·전역상태 미참조 → **유닛테스트 대상** |
| `*.state.js` | 런타임 상태 + 변경 함수 | 값은 갖되 DOM은 안 만진다 |
| `*.view.js` | DOM 생성 · 갱신만 | 상태를 인자로 받고 스스로 판단하지 않는다 |
| `*.js` (엔트리) | 이벤트 바인딩 + 수명주기(카메라·rAF) + 배선 | 위 넷을 잇기만 한다 |

**판정 3문항** — 모든 코드 줄을 이걸로 분류한다.

1. 브라우저 없이 실행되나? → `config` / `logic`
2. DOM을 만지나? → `view`
3. 사용자 입력·타이머·카메라에 반응하나? → 엔트리

한 함수가 두 가지를 하면(예: 계산하고 바로 `innerHTML`에 꽂는다) 계산부를 `logic`으로 떼고
엔트리가 `view`에 넘기게 바꾼다. 이때도 **계산식 자체는 손대지 않는다.**

### L3 · 경계 분리

폴더 하나 = 기능 하나. 같은 코드가 두 곳 이상에 있으면 상위 `shared/`로 올린다.

---

## 3. 크기 상한

판단 논쟁을 없애기 위한 기계적 기준.

| 대상 | 상한 |
| --- | --- |
| HTML | 400줄 |
| CSS | 400줄 |
| JS | 300줄 |
| 함수 | 50줄 |
| 중첩 | 3단 |

넘으면 무조건 쪼갠다. **이미 상한 이하인 파일은 건드리지 않는다** — `studio.html`(36줄),
`create.html`·`explore.html`(32줄), `stages/studio/studio.js`(73줄)는 쪼개면 오히려 나빠진다.

---

## 4. 전역 결합 처리 — 이 프로젝트 고유 규칙

현재 파일들은 전역 스코프를 공유한다. `modules/vision/advanced.js`는 `app.js`가 정의한 `mkCam`·`$`를
선언 없이 그대로 쓰고, `<script src>` 순서가 곧 의존 관계다. 파일을 쪼갤 때 이게 가장 잘 깨진다.

- 새로 뽑는 파일은 IIFE로 감싸고 `window.<Ns>` **하나만** 노출한다
- **기존 전역 이름은 바꾸지 않는다.** 옮길 때 `window.X = X;`로 명시적으로 재노출한다
  (암묵적 전역 → 명시적 전역. 이름이 그대로라 호출부는 무수정)
- 파일 상단에 의존을 주석으로 적는다 — `/* @requires app.js ($, mkCam, setStatus) */`
- HTML의 `<script src>` 순서는 의존 순서대로. 뽑아낸 파일은 원본 파일 **앞**에 넣는다

---

## 5. 작업 절차 — 파일 1개 = 1커밋

```
1. 스냅샷   node --test 통과 확인 · 대상 페이지를 열어 화면과 콘솔 상태를 기록
2. 이동     코드를 그대로 옮긴다 (리네임 · 리포맷 · 정리 금지)
3. 검증     node --test · 브라우저 콘솔 에러 0 · 육안 비교
4. 커밋     refactor(scope): <파일> css/js 분리
```

2번에서 "이왕 여는 김에" 정리하고 싶어지는데, 하지 않는다. 그 순간 회귀가 이동 때문인지
정리 때문인지 구분할 수 없게 된다.

---

## 6. 진척도 자동 측정

Phase 0에서 `test/no-inline.test.mjs`를 만든다. 모든 HTML을 훑어 `<style>`/`<script>` 본문이
없는지 검사하고, 아직 정리 안 된 파일은 화이트리스트에 둔다. 파일을 하나 정리할 때마다
화이트리스트에서 한 줄씩 지운다 — **남은 줄 수가 곧 남은 작업량**이다.

기존 `test/asset-refs.test.mjs`가 같은 방식으로 파일을 훑고 있으니 그 패턴을 그대로 따른다.

---

## 7. 파일별 작업 지시서

> 줄 번호는 **기준점**이다. 실제 경계는 함께 적은 함수·상수 이름으로 확인하고 조정한다.

### Phase 0 · 준비

- `test/no-inline.test.mjs` 신설 (6절)
- 현재 `node --test` 전체 통과 기록

### Phase 1 · `stages/apps/` — 인라인 JS·CSS

작은 것부터. 구조가 같아서 첫 파일에서 잡은 방식을 나머지에 그대로 적용할 수 있다.

| 파일 | 총줄 | `<script>` 본문 | → |
| --- | --- | --- | --- |
| `detect.html` | 230 | 110–228 | `stages/apps/js/detect.js` |
| `filter.html` | 216 | 115–214 | `js/filter.js` |
| `face.html` | 208 | 108–206 | `js/face.js` |
| `colortrack.html` | 205 | 111–203 | `js/colortrack.js` |
| `skeleton.html` | 194 | 109–192 | `js/skeleton.js` |

이 5개는 head의 `<script src>` 7줄이 완전히 동일하다. **1차에는 이동만** 하고 중복 제거는 Phase 5.

#### `character-card.html` (1256줄) — 최우선

`<style>` 17–421, `<script>` 593–1254.

| → 파일 | 내용 (줄 기준점) |
| --- | --- |
| `stages/apps/css/character-card.css` | `<style>` 전체 17–421 |
| `js/character-card.config.js` | 힌트 텍스트 614, 단위 문구 633, 아이콘 646, 특성 템플릿 661, 트랙별 예시 칩 692–806 |
| `js/character-card.logic.js` | 학습 클래스 기반 예시 문구 생성 807, contenteditable 길이 제한 882, 카드 텍스트 조립 1012 — 순수 |
| `js/character-card.view.js` | 카드 텍스트 렌더 1012–1049, 클래스 색상 오버레이 1050, 카드 비율 유지 1154 |
| `js/character-card.js` | 트랙 조회 599–613, 부모 학습 데이터 640, 편집기 동기화 867, 임시저장 1068, 묶어쓰기 1072, 이미지 업로드 1157, 초기화 1172, 캡처·다운로드 1183–1208, 미션함 담기 1209–1253 |

목표: HTML ~170줄, 각 JS 200–400줄.

#### `idea-board.html` (1065줄)

`<style>` 17–267, `<script>` 625–1063.

| → 파일 | 내용 (줄 기준점) |
| --- | --- |
| `css/idea-board.css` | 17–267 |
| `js/idea-board.config.js` | 미션별 예시 문구 633–681 |
| `js/idea-board.capture.js` | 인식 캡처 모달 822–956 — 부모 화면 복제·프레임 루프·이미지 생성. 독립 관심사라 통째로 뽑힌다 |
| `js/idea-board.view.js` | 문구 주입 685–702, 보드 정보 갱신 703, 렌더 746–818, 이미지 비율 819 |
| `js/idea-board.js` | 모달 상태 682, 로컬저장 719, 업로드 957, html2canvas 990, 담기 1019, 초기화 1051 |

### Phase 2 · `platform/`

#### `index.html` (749줄)

`<style>` 22–374, `<script>` 590–747.

| → 파일 | 내용 |
| --- | --- |
| `platform/css/landing.css` | 22–374 (섹션 주석대로 이미 잘 나뉨 · 353줄이라 한 파일 유지) |
| `platform/js/landing.data.js` | 아이콘 `IC`/`CK` 591, `SIDE` 600, `TIERS` 641, `MODULES` 651, `PLANS` 691, `PATHS` 710 — 순수 데이터 |
| `platform/js/landing.hero.js` | 히어로 라이브 데모 루프 608–639 |
| `platform/js/landing.js` | 각 섹션 렌더 + 헤더 스크롤 상태·등장 스태거 720–746 |

#### `course.html` (757줄)

`<style>` 13–197, `<script>` 272–755.

| → 파일 | 내용 |
| --- | --- |
| `platform/css/course.css` | 13–197 |
| `platform/js/course.data.js` | `ICONS`·`COURSES` 275–404, `ORDER`·`LIC` 405–413 — 6개 코스 콘텐츠 |
| `platform/js/course.draw.js` | `PAL`·`ease`·`clamp`·`rr`·`chip`·`bar`·`screen`·`coverImg`·`scrim`·`drawPill`·`drawHand`·`drawHandLM` 441–509 — 캔버스 프리미티브, 순수 |
| `platform/js/course.scenes.js` | `SCENES` 510–754 (비전 512 / 제스처 592 / 데이터 619 / 텍스트 637 / 생활 658 / 개념 706) |
| `platform/js/course.js` | 쿼리 파싱 414–416, 렌더, rAF 루프 |

`course.scenes.js`가 245줄로 상한 이하지만 6개 씬이 들어 있다. 상한을 넘으면 코스별로 다시 나눈다.

#### `sample.html` (589줄) — `<script>` 블록이 **2개**

`<style>` 13–197, `<script>` 284–429 · 454–587.

| → 파일 | 내용 |
| --- | --- |
| `platform/css/sample.css` | 13–197 |
| `platform/js/sample.logic.js` | `dist` 306, `meanVec` 307, `esc` 308, 정확도 곡선 계산 389–405 — 순수 |
| `platform/js/sample.js` | 상태·캔버스 285–296, `thumb`/`feat` 295–305(비디오 참조라 순수 아님), 카메라·학습·추론 310–428 |
| `platform/js/sample.onboarding.js` | 가이드 퀘스트 454–587 — 두 번째 블록 전체, 완전 독립 |

### Phase 3 · `console/` + `entry.html`

`console/shared.js`가 주입하는 공통 CSS는 **건드리지 않는다** (CLAUDE.md의 단일 소스 규칙).
각 안 전용 인라인 스타일만 뽑는다.

| 파일 | 총줄 | 분리 |
| --- | --- | --- |
| `console/map.html` | 304 | `<style>` 21–127 → `console/css/map.css` · `<script>` 173–302 → `console/js/map.js` |
| `console/cards.html` | 279 | 21–113 → `console/css/cards.css` · 150–277 → `console/js/cards.js` |
| `entry.html` | 315 | 20–116 → `console/css/entry.css` · 160–313 → `console/js/entry.js` |

**주의**: `entry.html:18`의 `<script src="/console/shared.js" data-intro="always">` — 이 속성이
인트로 재생 정책의 판단 근거다(`head` 시점에 결정). 태그와 속성을 그대로 둔다.

### Phase 4 · 이미 `.js`인데 뭉친 파일 (L2)

#### `stages/trainer/trainer.labs.js` (1240줄) — 가성비 최상

독립된 랩 6개 + 모달 하나가 한 파일에 쌓여 있을 뿐이라 줄 범위만으로 깨끗이 갈린다.

| 범위 | → 파일 |
| --- | --- |
| 1–60 | `stages/trainer/labs/audio-rec.js` — 스펙트로그램·녹음 관리 모달 |
| 61–711 | `labs/pose.js` — 포즈 학습 (상태·클래스·카메라·키포인트·학습·추론) |
| 712–797 | `labs/segment.js` — 인물 분리 |
| 798–937 | `labs/filter.js` — 영상 필터·모션 |
| 938–1005 | `labs/skeleton.js` — 뼈대 |
| 1006–1102 | `labs/face.js` — 얼굴 |
| 1103–1240 | `labs/colortrack.js` — 색상 추적 |

`index.html`의 `trainer.labs.js` `<script src>` 한 줄을 7줄로 교체한다(위 순서 그대로).
`pose.js`는 650줄로 상한 초과 → 2차로 `pose.js` + `pose.view.js`로 다시 나눈다.

#### `modules/shared/course-dashboard.js` (853줄)

`init(config)` 하나에 전 로직이 클로저로 묶여 있어 그냥 자르면 `state` 참조가 깨진다.
**해법**: `init()`이 만든 `ctx`(state + config + 헬퍼)를 각 파트에 인자로 넘긴다 —
`CourseDashboard.Parts.PreCheck(ctx)` 형태.

| → 파일 | 내용 |
| --- | --- |
| `course-dashboard.state.js` | state 스키마 57–102, `progressPayload` 94, `emitProgress` 103 |
| `course-dashboard.sidebar.js` | 사이드바 렌더·잠금·동기화 171–248 |
| `course-dashboard.precheck.js` | 사전 진단 OX/MCQ/피드백/결과 249–430 |
| `course-dashboard.quiz.js` | 최종 평가 |
| `course-dashboard.js` | 접근 제어 헬퍼 42–56, 단계 이동 152–170, 배선 |

5개 모듈이 모두 이 파일을 물고 있으므로 **가장 먼저 스냅샷을 뜨고 가장 마지막에 손댄다.**

#### `modules/data/app.js` (589줄)

| → 파일 | 내용 |
| --- | --- |
| `modules/data/chart.js` | `toPx`·`toData`·`clamp`·`evtData`·`drawAxes`·`dot`·`drawPoints`·`drawStar`·`drawFn` 6–34 |
| `modules/data/logic.js` | `linreg` 35–42, `sample` 43–48, 조사 처리 `particle` 60–64, `orderPair`/`trapPair` 56–72 — 순수 |
| `modules/data/app.js` | 탭 로직 (상관관계 실습 49–) |

#### `modules/*/advanced.js` — 상한 초과분

데이터 상수만 빼면 300줄 이하로 내려간다.

| 파일 | 총줄 | → `*-mission.config.js`로 뺄 것 |
| --- | --- | --- |
| `concept/advanced.js` | 439 | 학생 34명 데이터 4–17 |
| `text/advanced.js` | 397 | 판정 아이콘 3–36, 샘플 리뷰 37–44, 200건 코퍼스 45–84 |
| `gesture/advanced.js` | 396 | 데모 상수 (2–124 구간에서 확인) |
| `vision/advanced.js` | 448 | `PALETTE`·`VAL_RATIO`·`MAX_SAMPLES`·`MIN_USABLE` 4–8 (작다 — 남은 초과분은 `renderClasses` 계열을 `*.view.js`로) |

#### CSS-in-JS 제거

JS 안의 CSS 템플릿 문자열을 `.css` 파일 + `<link>`로 옮긴다.

| 파일 | 총줄 | CSS 시작 | → |
| --- | --- | --- | --- |
| `stages/studio/maker.js` | 765 | 61–129 | `stages/styles/maker.css` · 추가로 `EMOJIS`·`ACTIONS` 11–60 → `maker.config.js` |
| `stages/studio/imagelab.js` | 593 | 133– | `stages/styles/imagelab.css` |
| `stages/submission/ui/submit.ui.js` | 755 | 92– | `stages/styles/submit.css` |
| `stages/submission/board.js` | 466 | 28– | `stages/styles/board.css` |
| `stages/core/ui/dialog.js` | — | 14– | `stages/styles/dialog.css` |

각 파일의 `document.createElement("style")` 주입부를 지우고, 이 스크립트를 쓰는 HTML에 `<link>`를 넣는다.
어느 HTML이 쓰는지는 `grep -rn "<파일명>" --include=*.html`로 확인한다.

#### `stages/styles/trainer.css` (922줄)

섹션 주석 경계대로 셋으로. `index.html`의 `<link>` 한 줄을 세 줄로 교체.

| → 파일 | 범위 |
| --- | --- |
| `trainer.layout.css` | 헤더 20 · 학습 종류 탭 103 · 메인 탭 142 · 탭 패널 186 · 좌측 사이드바 190–400 |
| `trainer.panels.css` | 메인 401 · 클래스 패널 437 · 카메라 497 · 버튼 629 · 학습 영역 655 · 학습 곡선 689 · 혼동 행렬 725 · 갤러리 758–830 |
| `trainer.results.css` | 추론 결과 831 · 콘솔 HUD 885 · 카메라 뷰포트 904–922 |

### Phase 5 · 중복 제거 (선택)

- `stages/apps/` 5개 페이지의 동일한 부트스트랩 `<script src>` 7줄 → 공통화
- Phase 1~4에서 드러난 중복

---

## 8. 대상에서 제외 — 이유

| 파일 | 제외 이유 |
| --- | --- |
| `index.html` (1509줄) | CSS·JS 섞임이 **없다**(순수 마크업 + `<script src>`만). 무빌드라 HTML include 수단이 없다. `<template>` + JS 주입은 초기 렌더 방식을 바꾸는 **동작 변경**이라 리팩토링 범위 밖. Phase 4의 `trainer.css`·`trainer.labs.js` 분리로 체감 개선한다 |
| `shared/access.js` (515줄) | 섹션 경계는 뚜렷하지만(저장소·테마 1–98 / 잠금 모달 99–168 / 이벤트 위임 169–243 / 정책 엔진 244–415 / 비전 게이트 416–446 / QA 배지 447–515) 25개 이상 페이지가 `<script src="/shared/access.js">`로 직접 참조한다. 무빌드라 로더를 못 써서 참조 HTML 전부의 script 태그를 5줄로 늘려야 한다. **이득 대비 회귀 위험이 커서 후순위** |
| `console/shared.js` (668줄) | 위와 같은 이유 + CLAUDE.md가 "단일 소스"로 명시. 후순위 |
| `docs/system-overview.html` (741줄) | 배포 산출물이 아닌 문서 |
| `studio.html`·`create.html`·`explore.html`·`stages/studio/studio.js` | 상한 이하(32–73줄). 쪼개면 나빠진다 |

---

## 9. 완료 기준

- `node --test` 통과
- `test/no-inline.test.mjs` 화이트리스트에 8절의 "제외 대상"만 남음
- 모든 대상 파일이 3절 크기 상한 충족
- 각 페이지 브라우저 콘솔 에러 0 · 육안 비교 일치
- `git diff`에 URL·파일 경로·DOM `id`/`class` 변경 0건
