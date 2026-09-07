# eduino-console 리팩토링 인계 문서

이 폴더(`eduino-console`)를 웹사이트에 이식하기 전에 해야 할 **파일 정리 작업**의
지침서입니다. 기존 코드의 동작을 바꾸지 않고, 비대해진 파일을 기능 단위로 쪼개는
것만 다룹니다.

프로젝트가 무엇을 하는 앱이고 어떻게 실행하는지는 같은 폴더의 `README.md` 를 보세요.
아래는 리팩토링에 필요한 내용만 적습니다.

작성 시점의 모든 줄 수·줄 범위는 **실측값**입니다. 작업을 시작하면 줄 번호가 밀리므로,
한 항목을 끝낼 때마다 다음 항목의 범위를 다시 확인하세요.

---

## 0. 인계 전 결정이 필요한 사항 2건

**이 두 가지는 코드를 보고 판단할 수 없습니다. 작업 시작 전에 인계자에게 확인하세요.**

### 결정 1 · 절대경로를 유지할 것인가

현재 모든 HTML 이 리소스를 **루트 기준 절대경로**로 참조합니다.

```html
<script src="/stages/core/ui/icons.js"></script>
<link rel="stylesheet" href="/stages/styles/tokens.css" />
```

`vercel.json` 이 `"outputDirectory": "."` 이라 **폴더 전체가 도메인 루트에 배포되는
전제**로 짜여 있습니다. 이식 대상 웹사이트가 이 폴더를 하위 경로(`/console/` 등)에
둔다면 절대경로가 전부 깨집니다.

- **루트 배포가 유지된다** → 절대경로 그대로 두고, 아래 작업에서 새로 만드는 파일도
  절대경로로 참조합니다.
- **하위 경로로 들어간다** → 상대경로 전환이 **선행되어야** 합니다. 이 문서의 분리
  작업보다 먼저 하세요. 나중에 하면 새로 만든 파일들까지 전부 다시 고쳐야 합니다.

### 결정 2 · `shared/access.*` 중복을 어떻게 할 것인가

`shared/access.js`(515줄)와 `shared/access.css` 는 **자매 프로젝트에 바이트 단위로
동일한 사본이 존재합니다.** 두 프로젝트는 각자 `package.json`·`vercel.json`·Electron
빌드를 가진 독립 배포 단위라, 지금 구조에서는 공유할 상위 지점이 없습니다.

선택지는 셋입니다. **이 문서의 작업 범위 밖이며, 결정만 받아두면 됩니다.**

| 선택 | 내용 | 대가 |
| --- | --- | --- |
| 중복 수용 | 지금처럼 양쪽에 복사본 유지 | 고칠 때 두 곳을 함께 고쳐야 함 |
| 빌드 단계 복사 | 한쪽을 원본으로 두고 배포 시 복사 | 빌드 스텝 추가 |
| 모노레포화 | 공통 패키지로 분리 | 두 프로젝트 구조를 함께 손봐야 함 |

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

### HTML 16개 — 15개가 L1 위반

| 파일 | 총 줄수 | 인라인 `<style>` | 인라인 `<script>` |
| --- | ---: | --- | --- |
| `index.html` | 1509 | **없음** | **없음** |
| `stages/apps/character-card.html` | 1256 | 17–421 (405줄) | 593–1254 (662줄) |
| `stages/apps/idea-board.html` | 1065 | 17–267 (251줄) | 625–1063 (439줄) |
| `platform/index.html` | 705 | 22–350 (329줄) | 454–703 (250줄) |
| `entry.html` | 315 | 20–116 (97줄) | 160–313 (154줄) |
| `console/map.html` | 304 | 21–127 (107줄) | 173–302 (130줄) |
| `console/cards.html` | 279 | 21–113 (93줄) | 150–277 (128줄) |
| `stages/apps/detect.html` | 230 | 없음 | 110–228 (119줄) |
| `stages/apps/filter.html` | 216 | 없음 | 115–214 (100줄) |
| `platform/pricing.html` | 213 | 11–120 (110줄) | 177–211 (35줄) |
| `stages/apps/face.html` | 208 | 없음 | 108–206 (99줄) |
| `stages/apps/colortrack.html` | 205 | 없음 | 111–203 (93줄) |
| `stages/apps/skeleton.html` | 194 | 없음 | 109–192 (84줄) |
| `studio.html` | 36 | 17–21 (5줄) | 22–31 (10줄) |
| `explore.html` | 32 | 13–17 (5줄) | 18–27 (10줄) |
| `create.html` | 32 | 13–17 (5줄) | 18–27 (10줄) |

`index.html` 은 **이미 완전히 분리되어 있습니다.** 1509줄이지만 전부 마크업이고
`<style>` 0개, 모든 `<script>` 가 `src=` 외부 참조입니다. **손대지 마세요.**

### JS 300줄 초과 10개

| 파일 | 줄수 | 분리 대상? |
| --- | ---: | --- |
| `stages/trainer/trainer.labs.js` | 1240 | **예 — 9개 랩이 한 파일에 (최우선)** |
| `stages/studio/maker.js` | 765 | 아니오 (단일 책임) |
| `stages/submission/ui/submit.ui.js` | 755 | 아니오 (단일 책임) |
| `console/shared.js` | 668 | 아니오 (콘솔 공통 셸 · 단일 소스) |
| `stages/studio/imagelab.js` | 593 | 아니오 (단일 책임) |
| `stages/studio/studio-common.js` | 564 | 아니오 (단일 책임) |
| `shared/access.js` | 515 | 아니오 (위 결정 2 참고) |
| `stages/submission/board.js` | 466 | 아니오 (단일 책임) |
| `stages/trainer/trainer.core.js` | 409 | 아니오 (단일 책임) |
| `stages/trainer/trainer.init.js` | 340 | 아니오 (단일 책임) |

**`trainer.labs.js` 외 9개는 줄 수만 넘을 뿐 파일당 역할이 하나입니다. 쪼개지 마세요.**
줄 수를 맞추려고 억지로 나누면 오히려 추적이 어려워집니다.

### CSS

| 파일 | 줄수 | 비고 |
| --- | ---: | --- |
| `stages/styles/trainer.css` | 922 | 400줄 가이드 초과 — Phase 6 대상 |
| `stages/styles/studio.css` | 210 | 정상 |
| `stages/styles/stage.css` | 193 | 정상 |
| `stages/styles/tokens.css` | 38 | 정상 |

### CSS-in-JS 8개 파일

`const css = \`...\`` + `document.createElement('style')` 패턴이 산발적 실수가 아니라
**오버레이 UI 의 공통 관례로 굳어져 있습니다.**

| 파일 | 위치 |
| --- | --- |
| `stages/core/ui/dialog.js` | 14 (css), 44 (주입) |
| `stages/admin/admin.js` | 14 (css), 74 (주입) |
| `stages/studio/studio.js` | 28 (css), 38 (주입) |
| `stages/submission/board.js` | 28 (css), 102 (주입) |
| `stages/studio/maker.js` | 61 (css), 130 (주입) |
| `stages/submission/ui/submit.ui.js` | 92 (css), 202 (주입) |
| `stages/studio/imagelab.js` | 133 (css), 161 · 425 (주입) |
| `console/shared.js` | 247 · 262 (주입 · 문자열 상수 형태가 다름) |

---

## 3. 작업 체크리스트

효과가 큰 순서가 아니라 **안전한 순서**로 배열했습니다. 작은 파일로 감을 잡고
큰 파일로 갑니다. 각 항목을 끝낼 때마다 커밋하세요.

커밋 메시지: `refactor(scope): <파일> css/js 분리`

### Phase 0 · 검증 장치 만들기

지금 이 프로젝트에는 `test/` 디렉터리가 없습니다. 회귀를 잡을 장치부터 만듭니다.

- [ ] `test/no-inline.test.mjs` 신설. 모든 `.html` 을 훑어 인라인 `<style>` 또는
      `src` 없는 `<script>` 본문이 있으면 실패시킵니다. Node 내장 `node:test` 만
      쓰고 의존성은 추가하지 않습니다.
- [ ] 화이트리스트에 `index.html` 등록 (이미 분리 완료 · 위반 아님).
- [ ] `package.json` 에 `"test": "node --test"` 스크립트 추가.
- [ ] 지금 실행하면 15개 파일이 실패하는 것을 확인. 이 숫자가 0이 되면 L1 완료입니다.

### Phase 1 · 스텁 3개 (연습용)

가장 작습니다. 분리 절차와 IIFE·전역 노출 규칙을 여기서 익히세요.

- [ ] `create.html` — style(13–17) → `console/css/create.css`, script(18–27) → `console/js/create.js`
- [ ] `explore.html` — style(13–17) → `console/css/explore.css`, script(18–27) → `console/js/explore.js`
- [ ] `studio.html` — style(17–21) → `console/css/studio-stub.css`, script(22–31) → `console/js/studio-stub.js`

> `studio.html` 은 A/C 안으로 보내는 **라우터 스텁입니다. 삭제하지 마세요.**

### Phase 2 · 콘솔 진입·허브 3개

- [ ] `entry.html` — style(20–116) → `console/css/entry.css`, script(160–313) → `console/js/entry.js`
- [ ] `console/map.html` — style(21–127) → `console/css/map.css`, script(173–302) → `console/js/map.js`
- [ ] `console/cards.html` — style(21–113) → `console/css/cards.css`, script(150–277) → `console/js/cards.js`

> **주의:** `console/shared.js` 와 인트로 재생 정책(`data-intro` 속성)은 건드리지
> 마세요. 인트로 재생 여부를 `<head>` 시점에 판단하는 코드가 있어, 스크립트를 파일
> 밖으로 빼면서 실행 시점이 밀리면 깜빡임이 생깁니다. 분리 후 반드시
> 플랫폼 홈 → 콘솔 진입 → 허브 이동 순서로 인트로가 의도대로 재생되는지 확인하세요.

### Phase 3 · 플랫폼 페이지 2개

- [ ] `platform/pricing.html` — style(11–120) → `platform/css/pricing.css`, script(177–211) → `platform/js/pricing.js`
- [ ] `platform/index.html` — style(22–350) → `platform/css/landing.css`,
      script(454–703) → `platform/js/landing/` 아래 기능별로 분리 (데이터 · 히어로 ·
      메인 등 자연스러운 경계를 따를 것)

### Phase 4 · `stages/apps/` 5개 + 중복 제거

이 5개는 이미 CSS 가 `stages/styles/stage.css` 로 분리돼 있어 script 만 빼면 됩니다.

- [ ] `detect.html` script(110–228) → `stages/apps/js/detect.js`
- [ ] `filter.html` script(115–214) → `stages/apps/js/filter.js`
- [ ] `face.html` script(108–206) → `stages/apps/js/face.js`
- [ ] `colortrack.html` script(111–203) → `stages/apps/js/colortrack.js`
- [ ] `skeleton.html` script(109–192) → `stages/apps/js/skeleton.js`
- [ ] 5개 HTML 의 `<head>` 폰트·preconnect 링크와 본문 하단 부트스트랩
      `<script src>` 목록(`icons.js`·`session.js`·`cert.js`·`board.js`·
      `submit.store.js`·`submit.core.js`·`submit.ui.js`)이 거의 동일하게 복붙되어
      있습니다. 모델별 CDN 한 줄만 다릅니다 — 공통부를 하나로 모으세요.

### Phase 5 · 대형 HTML 2개

여기부터 실제로 어렵습니다. 앞 단계에서 감을 잡은 뒤 하세요.

- [ ] `stages/apps/character-card.html` (1256줄)
  - style(17–421) → `stages/apps/css/character-card.css`
  - script(593–1254, 662줄) → `stages/apps/js/character-card/` 폴더를 만들어
    기능별로 분리. 이 스크립트는 `window.StudioCommon`(`stages/studio/studio-common.js`)
    에 의존하므로 로드 순서를 반드시 유지하세요.
- [ ] `stages/apps/idea-board.html` (1065줄)
  - style(17–267) → `stages/apps/css/idea-board.css`
  - script(625–1063, 439줄) → `stages/apps/js/idea-board/` 폴더에 기능별 분리.
    `character-card` 와 `StudioCommon` 유틸을 공유합니다.

### Phase 6 · 거대 JS · CSS 분할

- [ ] **`stages/trainer/trainer.labs.js` (1240줄) → `stages/trainer/labs/*.js`**

  9개의 독립된 랩이 한 파일에 이어붙어 있습니다. 경계가 주석 구분선으로 뚜렷하니
  기계적으로 나눌 수 있습니다.

  | 범위 | 내용 | 제안 파일명 |
  | --- | --- | --- |
  | 1–60 | 음성 녹음 관리 유틸 (`drawSpectrogram` 등) | `labs/_audio-util.js` (랩 아님 · 공통) |
  | 61–368 | 포즈 인식 (지도학습 · MoveNet + Dense) | `labs/pose-train.js` |
  | 369–630 | 음성 학습 (Speech Commands 전이학습) | `labs/audio-train.js` |
  | 631–711 | 객체 탐지 (COCO-SSD) | `labs/detect.js` |
  | 712–797 | 인물 분리 (BodyPix) | `labs/segment.js` |
  | 798–937 | 영상 필터 + 모션 감지 | `labs/filter.js` |
  | 938–1005 | 뼈대 검출 (MoveNet 재사용) | `labs/skeleton.js` |
  | 1006–1102 | 얼굴 검출 (BlazeFace) | `labs/face.js` |
  | 1103–1178 | 색상 추적 (RGB 임계값) | `labs/colortrack.js` |
  | 1179–1240 | 깊이 추정 (AR Portrait Depth) | `labs/depth.js` |

  분리 후 `index.html` 의 `<script src>` 를 **위 순서 그대로** 넣으세요. 공통 유틸이
  먼저 와야 합니다.

- [ ] **CSS-in-JS 8개 파일 정리** — 위 2절 표의 위치에서 `const css` 템플릿 문자열을
      `.css` 파일로 빼고, 이를 쓰는 HTML 에 `<link>` 를 추가합니다.

  > **제외:** `stages/admin/cert.js` 는 인쇄용 HTML 문서를 문자열로 만들어 새 창에
  > 띄우는 코드라 그 안의 `<style>` 은 성격이 다릅니다. **건드리지 마세요.**

- [ ] `stages/styles/trainer.css` (922줄) → `layout.css` · `panels.css` ·
      `results.css` 3개로 분리. 로드 순서는 원본 선언 순서를 유지해야 합니다
      (뒤 규칙이 앞 규칙을 덮는 곳이 있을 수 있음).

---

## 4. 검증

각 항목을 끝낼 때마다:

1. `npm test` — Phase 0 에서 만든 인라인 검사 통과
2. 해당 페이지를 실제로 열어 **브라우저 콘솔 에러 0건** 확인
3. 카메라를 쓰는 스테이지는 실제로 카메라를 켜서 동작까지 확인 (스크립트 분리로
   초기화 순서가 밀리면 여기서 드러납니다)

전체 완료 후 최소한 아래 경로를 손으로 훑으세요.

- `platform/index.html` → 비전 콘솔 버튼 → `entry.html` → 모드 선택 → 허브(맵/카드)
- 허브에서 스테이지 5개 각각 진입 후 카메라 동작
- 직접 제작 3트랙(이미지·음성·동작) → 결과물 저장 → 캐릭터 카드 / 아이디어 보드

실행 방법은 `README.md` 를 보세요 (`npm install && npm run app`, 또는
`start-app.bat`).

---

## 5. 손대지 말 것

- `index.html` — 이미 완전히 분리 완료
- `console/shared.js` — 콘솔 공통 셸이자 항목 데이터(`TRACKS`)의 단일 소스
- 인트로 재생 정책 관련 속성(`data-intro`)과 그 판단 코드
- `studio.html` — 라우터 스텁 (삭제 금지)
- `stages/admin/cert.js` 안의 인쇄용 `<style>` 문자열
- `trainer.labs.js` 를 제외한 300줄 초과 JS 9개 — 단일 책임이라 분리 불필요
- 모델 파일(`models/`)과 신규 이미지 추가
