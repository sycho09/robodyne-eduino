# eduino-normal 리팩토링 인계 문서

이 폴더(`eduino-normal`)를 웹사이트에 이식하기 전에 해야 할 **파일 정리 작업**의
지침서입니다. 기존 코드의 동작을 바꾸지 않고, 비대해진 파일을 기능 단위로 쪼개는
것만 다룹니다.

프로젝트가 무엇을 하는 앱이고 어떻게 실행하는지는 같은 폴더의 `README.md` 를 보세요.

**작업 규모는 작습니다.** 문제가 `platform/` 3개 파일에 집중되어 있고, 학습 코스
6개는 이미 정리가 끝나 있습니다. 아래 Phase 1~4 를 다 해도 손대는 파일은 4개입니다.

작성 시점의 모든 줄 수·줄 범위는 **실측값**입니다. 작업을 시작하면 줄 번호가 밀리므로,
한 항목을 끝낼 때마다 다음 항목의 범위를 다시 확인하세요.

---

## 0. 인계 전 결정이 필요한 사항 2건

**이 두 가지는 코드를 보고 판단할 수 없습니다. 작업 시작 전에 인계자에게 확인하세요.**

### 결정 1 · 절대경로를 유지할 것인가

`vercel.json` 이 `"outputDirectory": "."` 이라 **폴더 전체가 도메인 루트에 배포되는
전제**로 짜여 있습니다. 이식 대상 웹사이트가 이 폴더를 하위 경로(`/normal/` 등)에
둔다면 루트 기준 절대경로 참조가 깨집니다.

- **루트 배포가 유지된다** → 지금 방식 그대로, 새로 만드는 파일도 같은 규칙으로 참조.
- **하위 경로로 들어간다** → 상대경로 전환이 **선행되어야** 합니다. 이 문서의 분리
  작업보다 먼저 하세요. 나중에 하면 새로 만든 파일까지 전부 다시 고쳐야 합니다.

### 결정 2 · `shared/access.*` 중복을 어떻게 할 것인가

`shared/access.js`(515줄)와 `shared/access.css`(527줄)는 **자매 프로젝트에 바이트
단위로 동일한 사본이 존재합니다.** 두 프로젝트는 각자 `package.json`·`vercel.json`·
Electron 빌드를 가진 독립 배포 단위라, 지금 구조에서는 공유할 상위 지점이 없습니다.

| 선택 | 내용 | 대가 |
| --- | --- | --- |
| 중복 수용 | 지금처럼 양쪽에 복사본 유지 | 고칠 때 두 곳을 함께 고쳐야 함 |
| 빌드 단계 복사 | 한쪽을 원본으로 두고 배포 시 복사 | 빌드 스텝 추가 |
| 모노레포화 | 공통 패키지로 분리 | 두 프로젝트 구조를 함께 손봐야 함 |

**이 문서의 작업 범위 밖이며, 결정만 받아두면 됩니다.**

---

## 1. 절대 원칙

이 작업은 **정리**이지 **개선**이 아닙니다. 아래는 예외 없습니다.

- **로직 수정 금지.** 알고리즘·동작 방식·함수 이름을 바꾸지 않습니다. 파일 이동과
  분리만 합니다. 눈에 띄는 버그가 있어도 이 작업에서는 건드리지 말고 따로 보고하세요.
- **URL 유지.** HTML 파일의 경로를 바꾸지 않습니다. 외부 링크와 북마크가 걸려 있습니다.
  (단, 위 결정 1에서 상대경로 전환이 결정된 경우는 예외)
- **바닐라 JS 유지.** 번들러·프레임워크·`type="module"` 을 도입하지 않습니다. 빌드
  없이 파일을 열면 그대로 돌아가는 상태를 유지합니다.
- **전역 스코프 유지.** 분리한 JS 는 IIFE 로 감싸고, 기존 전역 변수는
  `window.X = X;` 로 명시적으로 내보냅니다. HTML 에 `<script src>` 를 추가할 때
  **원본의 의존성 순서를 그대로 지킵니다.**

### 분리 기준

| 단계 | 내용 |
| --- | --- |
| **L1 · 타입 분리** | HTML 안의 `<style>`·`<script>` 본문을 외부 파일로 뺍니다. JS 안의 CSS 템플릿 문자열도 마찬가지입니다. |
| **L2 · 기능 분리** | 비대한 파일은 아키텍처 패턴을 억지로 끼워맞추지 말고, 연관된 기능 단위로 하위 폴더에 나눕니다. |
| **L3 · 경계 분리** | 여러 파일이 복붙하고 있는 코드는 공통 파일로 올립니다. |

크기 상한(HTML/CSS 400줄, JS 300줄)은 **가이드일 뿐입니다.** 역할이 명확한 파일은
길어도 그대로 둡니다. "의미와 책임" 단위 분리가 우선입니다.

---

## 2. 현황 (실측)

### HTML 10개 — 3개만 L1 위반

| 파일 | 총 줄수 | 인라인 `<style>` | 인라인 `<script>` |
| --- | ---: | --- | --- |
| `platform/course.html` | 1484 | 15–730 (716줄) | 816–1482 (667줄) |
| `platform/index.html` | 1223 | 25–978 (954줄) | 1095–1221 (127줄) |
| `platform/pricing.html` | 202 | 13–114 (102줄) | 169–200 (32줄) |
| `modules/data/index.html` | 424 | 없음 | 없음 |
| `modules/vision/index.html` | 358 | 없음 | 없음 |
| `modules/gesture/index.html` | 326 | 없음 | 없음 |
| `modules/life/index.html` | 247 | 없음 | 없음 |
| `modules/text/index.html` | 240 | 없음 | 없음 |
| `modules/concept/index.html` | 215 | 없음 | 없음 |
| `modules/life/test-sheet.html` | 34 | 없음 | 없음 |

**`modules/` 아래 7개 HTML 은 이미 완전히 외부 분리가 끝나 있습니다. 손대지 마세요.**
`platform/course.html` 과 `index.html` 은 본문 마크업이 100줄 남짓이고 나머지가 전부
`<style>`·`<script>` 입니다.

### JS 300줄 초과 13개 — 전부 이미 외부 파일

| 파일 | 줄수 |
| --- | ---: |
| `modules/shared/course-dashboard.js` | 751 |
| `modules/data/app.js` | 589 |
| `shared/access.js` | 515 |
| `modules/gesture/advanced.js` | 509 |
| `modules/vision/advanced.js` | 451 |
| `platform/feature-data.js` | 440 |
| `modules/vision/mission.js` | 398 |
| `modules/gesture/app.js` | 391 |
| `modules/concept/advanced.js` | 387 |
| `modules/text/advanced.js` | 381 |
| `modules/life/advanced.js` | 329 |
| `modules/vision/app.js` | 320 |
| `modules/life/app.js` | 319 |

**전부 이미 HTML 밖으로 분리되어 있고 파일당 역할이 하나입니다.** 줄 수 가이드는
넘지만 **분리는 선택 사항입니다.** 굳이 한다면 `course-dashboard.js`(751줄)가
후보이나, 상태 객체를 여러 함수가 공유하고 있어 쪼개다 참조가 깨지기 쉽습니다.
**이식이 목적이라면 건드리지 않는 편을 권합니다.**

각 코스 폴더는 `index.html` · `style.css` · `app.js` · `course-config.js` ·
`advanced.js` (+ 일부 `mission.js`) 로 구성이 통일되어 있습니다. 이 규칙을 깨지 마세요.

### CSS

`shared/access.css`(527줄)만 400줄 가이드를 넘습니다. 위 결정 2의 대상이므로
여기서는 건드리지 않습니다. 나머지는 전부 정상입니다.

### 중복 코드 1건

`@keyframes spin` 주입 코드가 3개 파일에 동일하게 복붙되어 있습니다.

| 파일 | 위치 |
| --- | --- |
| `modules/gesture/app.js` | 24–29 |
| `modules/life/app.js` | 17–22 |
| `modules/vision/app.js` | 31–36 |

로딩 스피너를 처음 그릴 때 `<style id="spin-anim">` 을 동적으로 만들어 붙이는
블록입니다. 세 파일 모두 아래와 똑같습니다 (들여쓰기까지 동일).

```js
if (!document.getElementById('spin-anim')) {
  const style = document.createElement('style');
  style.id = 'spin-anim';
  style.textContent = '@keyframes spin { 100% { transform: rotate(360deg); } }';
  document.head.appendChild(style);
}
```

---

## 3. 작업 체크리스트

작은 것부터 큰 것 순입니다. 각 항목을 끝낼 때마다 커밋하세요.

커밋 메시지: `refactor(scope): <파일> css/js 분리`

### Phase 0 · 검증 장치 만들기

지금 이 프로젝트에는 `test/` 디렉터리가 없습니다. 회귀를 잡을 장치부터 만듭니다.

- [ ] `test/no-inline.test.mjs` 신설. 모든 `.html` 을 훑어 인라인 `<style>` 또는
      `src` 없는 `<script>` 본문이 있으면 실패시킵니다. Node 내장 `node:test` 만
      쓰고 의존성은 추가하지 않습니다.
- [ ] `package.json` 에 `"test": "node --test"` 스크립트 추가.
- [ ] 지금 실행하면 `platform/` 3개 파일이 실패하는 것을 확인. 이 숫자가 0이 되면
      L1 완료입니다.

### Phase 1 · `platform/pricing.html` (가장 작음 · 연습용)

- [ ] style(13–114) → `platform/css/pricing.css`
- [ ] script(169–200) → `platform/js/pricing.js`

여기서 IIFE 로 감싸고 전역을 `window.X` 로 내보내는 절차를 익히세요.

### Phase 2 · `platform/course.html` (1484줄)

- [ ] style(15–730, 716줄) → `platform/css/course.css`
- [ ] script(816–1482, 667줄) → `platform/js/course/` 폴더를 만들어 기능별 분리.
      데이터 정의 · 그리기(캔버스/차트) · 화면 전환 · 진입점 정도의 자연스러운
      경계를 따르되, **억지로 나누지 말고 코드가 실제로 갈라지는 지점을 따르세요.**

### Phase 3 · `platform/index.html` (1223줄)

- [ ] style(25–978, 954줄) → `platform/css/landing.css`
      (이 파일 954줄은 400줄 가이드를 넘으므로, 섹션 경계가 뚜렷하면 히어로 ·
      기능소개 · 푸터 등으로 더 나눠도 됩니다. 무리하지는 마세요.)
- [ ] script(1095–1221, 127줄) → `platform/js/landing.js`
      (127줄이라 한 파일로 충분합니다. 폴더까지 만들 필요 없습니다.)

> `platform/feature-data.js`(440줄)는 이미 분리된 데이터 파일입니다. 위 작업에서
> 새로 만드는 파일과 헷갈리지 마세요.

### Phase 4 · spin keyframe 중복 제거 (선택)

- [ ] `modules/shared/base.css` 에 `@keyframes spin` 을 한 번만 선언
      (6개 코스 `index.html` 이 전부 이 파일을 로드하는 것을 확인했습니다)
- [ ] `modules/gesture/app.js`(24–29) · `modules/life/app.js`(17–22) ·
      `modules/vision/app.js`(31–36) 의 동적 주입 블록 삭제
      (위 2절에 옮겨 적은 6줄 블록 전체 — 가드 `if` 문부터 닫는 `}` 까지)

효과는 작지만 위험도 거의 없습니다. 시간이 남으면 하세요.

---

## 4. 검증

각 항목을 끝낼 때마다:

1. `npm test` — Phase 0 에서 만든 인라인 검사 통과
2. 해당 페이지를 실제로 열어 **브라우저 콘솔 에러 0건** 확인

전체 완료 후 최소한 아래를 손으로 훑으세요.

- `platform/index.html` (시작페이지) → 코스 목록 → `platform/course.html` 코스 상세
- `platform/pricing.html` 요금 페이지 — 좁은 폭(모바일)에서도 레이아웃 확인
- 학습 코스 6개 각각 진입 → 4단계 대시보드 동작 → 카메라·마이크를 쓰는 코스는
  실제로 켜서 확인

실행 방법은 `README.md` 를 보세요 (`npm install && npm run app`, 또는
`start-app.bat`).

---

## 5. 손대지 말 것

- `modules/` 아래 HTML 7개 — 이미 완전히 외부 분리 완료
- 각 코스 폴더의 구성 규칙(`index.html` · `style.css` · `app.js` ·
  `course-config.js` · `advanced.js`) — 통일되어 있으므로 깨지 말 것
- `modules/shared/course-dashboard.js` — 상태 객체를 여러 함수가 공유해 분리 위험.
  줄 수는 넘지만 그대로 두는 편이 안전
- `shared/access.js` · `shared/access.css` — 위 결정 2의 대상
- `modules/*/course-config.js` 6개 — 구조는 비슷하나 내용이 서로 다른 데이터 파일.
  중복이 아니므로 통합하지 말 것
