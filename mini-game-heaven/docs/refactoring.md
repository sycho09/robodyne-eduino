# mini-game-heaven 리팩토링 인계 문서

이 폴더(`mini-game-heaven`)를 **React 로 다시 빌드하기 전에** 해야 할 정리 작업의
지침서입니다. 두 가지를 다룹니다.

1. **경로 정리** — 지금 코드는 폴더가 도메인 루트에 배포되는 전제로 짜여 있습니다.
   React 빌드에서는 이 전제가 무너지므로, 옮기기 전에 손봐야 합니다.
2. **파일 분리** — 비대해진 파일을 기능 단위로 쪼갭니다. 동작은 바꾸지 않습니다.

프로젝트가 무엇을 하는 앱이고 어떻게 실행하는지는 같은 폴더의 `README.md` 를,
커리큘럼·씬 구성은 `HANDOFF.md` 를 보세요. 아래는 리팩토링에 필요한 내용만 적습니다.

작성 시점의 모든 줄 수·줄 범위는 **실측값**입니다. 작업을 시작하면 줄 번호가 밀리므로,
한 항목을 끝낼 때마다 다음 항목의 범위를 다시 확인하세요.

> **이 폴더는 Electron 이 아닙니다.** `electron-main.js` 도 `electron` 의존성도 없습니다.
> 순수 Vite SPA 이고 Vercel 로 배포됩니다. 자매 폴더(`eduino-console`·`eduino-normal`·
> `Playground_AITraining-3`)와 달리 데스크톱 빌드가 없으므로, 그쪽 문서의 Electron 관련
> 내용은 여기에 적용되지 않습니다.

---

## 실행 지침 — Claude Code 로 이 문서를 돌릴 때

**이 문서 하나만 읽고 시작하면 됩니다.** 다른 문서가 필요한 지점은 본문이 그때그때
가리킵니다.

1. **먼저 5장 「손대지 말 것」을 읽으세요.** 이 폴더에는 `CLAUDE.md` 외에 별도의
   가드레일이 없습니다. 5장이 곧 금지 목록입니다.
2. **Phase 0 은 바로 시작하세요.** 검증 장치를 만드는 단계라 결정이 필요 없습니다.
   끝나면 절대경로 위반이 **82건**으로 잡혀야 합니다. 이 숫자가 이후 모든 작업의
   기준선입니다.
3. **Phase 0 이 끝나면 멈추고 보고하세요.** Phase 1 은 0장 **결정 1**(React 빌드
   배포 위치)의 답이 있어야 시작할 수 있습니다. **답을 받기 전에 경로를 임의로 바꾸지
   마세요** — 도메인 루트냐 하위 경로냐에 따라 82곳의 처리가 달라지고, 잘못 고르면
   전부 되돌려야 합니다. 결정 2(자산 위치)도 함께 물으세요.
4. 답을 받은 뒤 Phase 1 → 2 → 3 순서로 진행합니다. **한 항목마다 커밋**하고,
   4장 검증을 통과한 뒤 다음으로 넘어갑니다. Phase 4 는 지금 하지 마세요(본문 참고).

> 이 문서의 모든 줄 번호는 작성 시점 실측값입니다. 작업을 시작하면 밀리므로,
> 각 항목에 착수하기 전에 해당 범위를 다시 확인하세요.

---

## 0. 인계 전 결정이 필요한 사항 2건

**이 두 가지는 코드를 보고 판단할 수 없습니다. 작업 시작 전에 인계자에게 확인하세요.**

### 결정 1 · React 빌드 결과물이 어디에 배포되는가

현재 `vite.config.js` 에 `base` 가 **설정돼 있지 않습니다.** 기본값 `'/'` 이고,
`vercel.json` 이 도메인 루트에 catch-all 로 배포합니다. 코드 전체가 이 전제 위에 있습니다.

```js
// vite.config.js — base 항목 자체가 없음
export default defineConfig({
  root: '.', publicDir: 'public',
  build: { target: 'es2020', outDir: 'dist' },
});
```

- **도메인 루트(또는 서브도메인)를 그대로 쓴다** → 절대경로를 유지해도 됩니다. 다만
  아래 Phase 1 의 개별 4건은 그래도 고쳐야 합니다.
- **하위 경로(`/playhouse/` 등)로 들어간다** → **Phase 1 이 필수이며 다른 모든 작업보다
  먼저입니다.** 나중에 하면 분리하며 새로 만든 파일까지 전부 다시 고쳐야 합니다.
- **아직 모른다** → Phase 1 을 그대로 수행하세요. `asset()` 헬퍼 방식은 어느 쪽이든
  `base` 한 줄로 대응되고, 작업량은 한쪽을 미리 고르는 것과 같습니다. **권장.**

### 결정 2 · `public/brand/` 자산을 `src/assets/` 로 옮길 것인가

56개 이미지가 `public/brand/` 에 있고, `public/` 은 Vite 가 **내용을 그대로 복사만**
하는 곳입니다. 번들러가 경로를 재작성하지 않으므로 `/brand/...` 문자열이 그대로 남습니다.

| 선택 | 내용 | 대가 |
| --- | --- | --- |
| `public/` 유지 + 헬퍼 | `asset('logo.webp')` 로 base 를 앞에 붙임 | 헬퍼를 거치는 규율이 필요 |
| `src/assets/` 이전 | `import` 로 바꿔 번들러가 해시 파일명까지 처리 | **파일명 규칙 기반 자동 로딩이 깨짐** |

두 번째 선택의 대가가 작지 않습니다. 이 프로젝트는 파일명 규칙으로 자산을 찾는 것을
`README.md` 가 **기능으로 문서화**하고 있습니다.

```js
src/scenes/chapterSelect.js:59:  im.src = `/brand/game-${id}-cover.webp`;
src/scenes/modeSelect.js:36:    im.src = `/brand/ms-${id}.webp`;
src/main.js:116:                .forEach((n) => { const im = new Image(); im.src = `/brand/${n}.webp`; });
```

`import` 는 정적 분석이 되는 경로만 처리하므로, 이런 런타임 조립은 전부 명시적 import
목록으로 바꿔야 합니다. 자산이 늘 때마다 코드를 고쳐야 한다는 뜻입니다.
**결정만 받아두면 되고, 이 문서의 작업 범위는 첫 번째 선택을 전제로 씁니다.**

---

## 1. 절대 원칙

이 작업은 **정리**이지 **개선**이 아닙니다. 아래는 예외 없습니다.

- **로직 수정 금지.** 알고리즘·동작 방식·함수 이름을 바꾸지 않습니다. 파일 이동과
  분리, 그리고 경로 문자열 치환만 합니다. 눈에 띄는 버그가 있어도 이 작업에서는
  건드리지 말고 따로 보고하세요.
- **바닐라 유지 — 단, 이 문서의 작업 범위 안에서만.** 경로 정리와 파일 분리는
  React 없이 끝냅니다. **React 전환은 이 작업이 끝난 뒤의 별도 단계이고, 이 문서는
  그 단계에서 경로가 깨지지 않도록 미리 정리하는 것이 목적입니다.** 여기서 프레임워크를
  먼저 들이면 두 가지 변경이 한 커밋에 섞여 회귀를 추적할 수 없게 됩니다.
- **모듈 그래프는 건드리지 않습니다.** 아래 2장에서 보듯 `import` 경로는 이미 전부
  상대경로라 손댈 것이 없습니다.
- **씬의 `cleanup()` 대칭 구조를 유지합니다.** 모든 씬이 등록한 이벤트·타이머·rAF 를
  대칭으로 해제하고 있습니다. 이 규율이 React 이식의 최대 자산이므로(5장 참고)
  분리하면서 깨뜨리지 마세요.

### 분리 기준

| 단계 | 내용 |
| --- | --- |
| **L1 · 타입 분리** | JS 안에 있는 CSS 템플릿 문자열을 `.css` 파일로 뺍니다. (이 프로젝트는 HTML 이 19줄 1개뿐이라 HTML 인라인 문제는 없습니다) |
| **L2 · 기능 분리** | 비대한 파일은 아키텍처 패턴을 억지로 끼워맞추지 말고, 연관된 기능 단위로 나눕니다. |
| **L3 · 경계 분리** | 여러 파일이 복붙하고 있는 코드는 공통 파일로 올립니다. |

크기 상한(CSS 400줄, JS 300줄)은 **가이드일 뿐입니다.** 역할이 명확한 파일은 길어도
그대로 둡니다. "의미와 책임" 단위 분리가 우선입니다.

---

## 2. 현황 (실측)

### 경로 — 모듈은 완벽, 자산은 전부 절대경로

이 프로젝트의 경로 상태는 **깨끗하게 둘로 갈립니다.**

| 분류 | 절대경로 | 상대경로 | 판정 |
| --- | ---: | ---: | --- |
| ES 모듈 `import` (정적+동적) | **0** | **193** | **손댈 것 없음** |
| CSS `@import` | 0 | 6 | 손댈 것 없음 |
| 런타임 자산 경로 (JS+HTML) | **82** | **0** | **전량 교체 대상** |
| CSS `url(...)` | 1 | 0 | Vite 가 자동 처리 |

**모듈 그래프는 React 로 그대로 옮겨집니다.** 193개 import 가 전부 `./` · `../` 이고
절대경로나 별칭(`@/`)이 하나도 없습니다. 반면 **자산 경로는 100% 절대경로이고, 상대경로
자산 참조가 단 하나도 없습니다.** 즉 고칠 대상이 명확하고 예외가 없습니다.

82개가 **27개 파일**에 흩어져 있고, 전부 `src/` 안입니다 (`index.html` 에는 없습니다).

```
10 src/scenes/flagGame.js      6 src/scenes/lampGame.js     4 src/scenes/joystickGame.js
 9 src/scenes/sensorRoom.js    6 src/scenes/buttonGame.js    4 src/scenes/buzzerGame.js
 5 src/scenes/ultraGame.js     4 src/scenes/bombGame.js      3 src/scenes/potGame.js
 (이하 3~1개씩 17개 파일)
```

### 왜 번들러가 못 잡는가

`public/` 안의 파일은 Vite 가 **복사만** 합니다. 게다가 상당수가 템플릿 문자열로
**런타임에 조립**되므로 어떤 번들러도 정적 분석할 수 없습니다.

```js
src/scenes/sensorRoom.js:41    im.src = `/brand/${key}.webp`;   // .webp→.png→room-bg 폴백 캐스케이드
src/engine/topdown.js:33       for (const d in DIR_IMG) DIR_IMG[d].src = `/brand/eddie/dir/${d}.webp`;
src/scenes/chapterSelect.js:59 im.src = `/brand/game-${id}-cover.webp`;
```

`.webp → .png → 폴백` 캐스케이드 패턴이 약 15곳에서 반복되고, 한 줄에 절대경로가
둘씩 들어 있습니다.

```js
src/scenes/bombGame.js:28  const bgImg = new Image();
                           bgImg.onerror = () => { … bgImg.src = '/brand/stage-bomb-bg.png'; };
                           bgImg.src = '/brand/stage-bomb-bg.webp';
```

설정 데이터 **안에** 박힌 것도 있습니다(코드가 아니라 데이터라 더 놓치기 쉽습니다).

```js
src/scenes/sensorRoom.js:58   room: 'room-buzzer-bg',   eddie: '/brand/eddie-buzzer.webp', …
src/scenes/sensorRoom.js:109  room: 'room-joystick-bg', eddie: '/brand/eddie-pilot.webp', …
```

### 개별 지목이 필요한 4건

기계적 치환으로 끝나지 않거나, 반대로 공짜인 것들입니다.

| 위치 | 내용 | 처리 |
| --- | --- | --- |
| `src/serial/provisioning.js:68` | `fetch('/firmware/playhouse-uno.hex')` | **깨지면 펌웨어 굽기가 죽습니다.** 프로젝트의 유일한 `fetch` |
| `src/app/eddieRig.js:25` | `if (himg.src !== location.origin + FALLBACK)` | `himg.src` 는 해석된 절대 URL. base 가 `/` 가 아니면 **비교가 영원히 불일치**해 폴백이 계속 재시도됩니다 |
| `src/styles/parts/03-onboarding.css:229` | `url(/brand/logo.webp)` | Vite 가 CSS `url()` 은 재작성합니다 — **공짜** |
| `index.html:13,17` | `/src/styles/main.css`, `/src/main.js` | Vite 가 진입점은 재작성합니다 — **공짜** |

### 파일 크기 — 380줄 초과 7개

| 줄 수 | 파일 | 판정 |
| ---: | --- | --- |
| **1122** | `src/scenes/sensorRoom.js` | **분리 필수.** 책임 5개가 한 파일에 |
| 669 | `src/styles/parts/04-games.css` | 아래 CSS 경고 참고 |
| 637 | `src/styles/parts/03-onboarding.css` | 〃 |
| 632 | `src/styles/parts/02-components.css` | 〃 |
| **423** | `src/scenes/records.js` | **분리.** 끝 180줄이 JS 안의 CSS |
| 393 | `src/styles/parts/01-base.css` | 경계선 |
| 391 | `src/scenes/lampGame.js` | 경계선 · 내부 응집도 높음, 그대로 두어도 무방 |

#### `sensorRoom.js` 1122줄의 내부 구조 (실측 경계)

| 줄 범위 | 내용 | 제안 |
| --- | --- | --- |
| 14–39 | `CONTROL_TAB`, `GAMES` 지연 import 레지스트리 | 그대로 |
| 40–42 | `roomImgFor()` — 이미지 폴백 캐시 | 공용 자산 헬퍼로 |
| **43–166** | `ROOMS_CFG` — 센서별 순수 설정 **124줄** | `content/rooms.js` |
| 167–176 | `soonPlay()` | — |
| 177–273 | `showSensorRoom()` 본체 — 캔버스 월드·이동·문 진입 | 씬 컴포넌트 |
| **274–721** | **`openTheory()` — 이론관 오버레이 448줄** | 아래 참고 |
| 722–993 | 이론 애니메이션 생성기 **8개** (`ledTheory`…`buzzerTheory`) | `content/theoryAnimations/` |
| 995–1122 | 캔버스 드로잉 프리미티브 (`drawRoom`·`drawSign`·`rr`·`drawCover` 등) | `engine/draw.js` |

`openTheory()` 안에는 **서로 배타적인 독립 위젯 9개**가 들어 있습니다. 각각 자체 이벤트
배선·폴링 타이머·보드 I/O 를 가집니다. React 에서는 이것만으로 컴포넌트 9개입니다.

```
308 renderTab (디스패처)   311 renderAnim      345 renderKeys    372 renderRgb
432 renderCds             489 renderJoystick   546 renderUltra   595 renderButton
631 renderInfo            657 renderControl
```

#### `records.js` 423줄

`ensureStyles()` 가 **243–423줄, 약 180줄의 CSS 를 JS 안에서** `<style>` 로 주입합니다.
같은 패턴이 `src/app/reportCard.js:115` 에도 있습니다.

### ⚠️ CSS 는 기계적으로 쪼개지 마세요

`src/styles/main.css:3-7` 에 원저자의 경고가 있습니다.

> ⚠️ @import 순서 = 캐스케이드 순서다. 절대 바꾸지 말 것.
>    이 스타일시트는 도메인별로 설계된 게 아니라 시간순으로 누적됐다.
>    뒤쪽 파트가 앞쪽 규칙을 의도적으로 덮어쓰므로, 파트를 재배치하거나 규칙을 다른
>    파트로 옮기면 화면이 깨진다.

특히 `06-legibility.css` 는 순수 덮어쓰기 계층입니다(`main.css:20` — "이 줄만 빼면 전부 원복").
**주제별 분할을 하려면 먼저 평탄화하고 특이도 충돌을 해소해야 합니다.** 이것이
React 에서 CSS Modules 를 도입할 근거이지, 지금 당장 할 일이 아닙니다.

### 기타 현황

- HTML 진입점 **1개** (`index.html`, 19줄). 완전 SPA.
- **URL 라우팅이 없습니다.** `src/app/nav.js` 가 `pushState({d}, '')` 로 깊이만 기록하고
  URL 인자를 주지 않아 주소창이 변하지 않습니다. 새로고침 복원은 `sessionStorage`
  (`src/main.js:127-162`, 키 `eduino.route.v1`)로 합니다. **React Router 도입 시 보존할
  URL 이 없으므로 자유롭게 설계할 수 있습니다.**
- `test/` 디렉터리 없음. `package.json` 에 `test` 스크립트 없음.
- `README.md:41` 이 언급하는 `legacy/` 폴더는 **디스크에 없습니다.** 문서가 낡았습니다.

---

## 3. 작업 체크리스트

효과가 큰 순서가 아니라 **안전한 순서**로 배열했습니다. 각 항목을 끝낼 때마다 커밋하세요.

커밋 메시지: `refactor(scope): <내용>`

### Phase 0 · 검증 장치 만들기

지금 이 프로젝트에는 `test/` 디렉터리가 없습니다. 회귀를 잡을 장치부터 만듭니다.

- [ ] `test/no-abs-path.test.mjs` 신설. `src/` 와 `index.html` 을 훑어 `/brand/` ·
      `/firmware/` 로 시작하는 문자열 리터럴이 있으면 실패시킵니다. Node 내장
      `node:test` 만 쓰고 의존성은 추가하지 않습니다.
- [ ] 화이트리스트에 `src/app/assets.js`(Phase 1 에서 만들 헬퍼) 등록.
- [ ] `package.json` 에 `"test": "node --test test/*.test.mjs"` 추가.
- [ ] 지금 실행하면 **82건**이 잡히는 것을 확인. 이 숫자가 0이 되면 Phase 1 완료입니다.

### Phase 1 · 경로 통일 (최우선 · 다른 작업보다 먼저)

> **이 Phase 를 파일 분리보다 먼저 끝내세요.** 순서를 바꾸면 분리하며 새로 만든 파일에도
> 절대경로가 복사되어 두 번 일하게 됩니다. 루트 `README.md` 가 규정한 원칙입니다.

- [ ] `src/app/assets.js` 신설 — 헬퍼 하나로 수렴시킵니다.

      ```js
      const BASE = import.meta.env.BASE_URL;          // '/' 또는 '/playhouse/'
      export const asset    = (p) => BASE + 'brand/' + p;
      export const firmware = (p) => BASE + 'firmware/' + p;
      ```

- [ ] `src/app/eddieRig.js` — `RIG_BASE`(7행) · `FALLBACK`(15행) 을 헬퍼 경유로 바꾸고,
      **25행의 `location.origin + FALLBACK` 비교를 함께 고칩니다.** 이 줄은 치환만으로는
      해결되지 않습니다.
- [ ] `src/serial/provisioning.js:68` — `fetch(firmware('playhouse-uno.hex'))`
- [ ] `src/engine/topdown.js` — `DEFAULT_HERO`(37행), `DIR_IMG` 루프(33행)
- [ ] `src/app/bgm.js:6` — `FILE`
- [ ] `src/main.js:116` — 프리페치 루프
- [ ] `src/scenes/sensorRoom.js` — `roomImgFor()`(41행) 와 `ROOMS_CFG`(43–166행) 안의
      `eddie:` 값들
- [ ] 나머지 씬 20여 개의 `new Image()` · 폴백 캐스케이드 일괄 치환
- [ ] `vite.config.js` 에 `base` 를 명시합니다(결정 1의 답을 그대로). 미정이면 `'/'` 로
      **명시적으로** 적어 두세요 — 기본값 의존이 문제의 뿌리였습니다.
- [ ] `npm test` 로 0건 확인 → **`npm run build && npm run preview` 로 실제 화면 확인.**
      이미지가 하나라도 깨지면 놓친 곳이 있습니다.
- [ ] 하위 경로 배포가 결정됐다면, `base` 를 그 값으로 두고 위 검증을 **한 번 더**
      수행합니다. 여기서 통과해야 진짜 끝입니다.

### Phase 2 · JS 안의 CSS 빼내기 (L1)

- [ ] `src/scenes/records.js` — `ensureStyles()`(243–423행, 약 180줄) → `src/styles/parts/`
      에 새 파트로 추가하거나 `records.css` 신설 후 `main.css` 에 `@import`.
      **파트로 넣는다면 반드시 맨 뒤에 붙입니다**(캐스케이드 순서).
- [ ] `src/app/reportCard.js` — `ensureStyles()`(115행~) 동일 처리.
- [ ] 두 파일에서 `let styled = false` 래치와 `<style>` 주입 코드를 제거.

### Phase 3 · `sensorRoom.js` 1122줄 분해 (L2)

2장의 구조표를 따릅니다. **위에서부터 순서대로, 한 덩어리씩 커밋하세요.**

- [ ] `ROOMS_CFG`(43–166) → `src/content/rooms.js`. 순수 데이터라 가장 안전합니다.
- [ ] 드로잉 프리미티브(995–1122) → `src/engine/draw.js`.
      `rr()` · `drawCover()` 는 다른 게임 씬에도 복붙돼 있으므로 **L3 경계 분리**로
      함께 정리합니다.
- [ ] 이론 애니메이션 8개(722–993) → `src/content/theoryAnimations/`.
      순수 템플릿 문자열 팩토리라 의존성이 없습니다.
- [ ] `openTheory()`(274–721) → `src/scenes/theory/` 하위로. 위젯 9개를
      `renderKeys.js` · `renderRgb.js` … 로 나눕니다. **폴링 타이머
      (`stopCdsPoll`·`stopJoyPoll`)의 시작·정지 짝이 깨지지 않는지 확인하세요.**
- [ ] 남은 `showSensorRoom()` 본체가 200줄 안쪽인지 확인.

### Phase 4 · CSS 평탄화 (선택 · 조건부)

> **이 Phase 는 React 전환을 실제로 시작할 때 함께 하는 편이 낫습니다.** 지금 하면
> 이득 없이 회귀 위험만 집니다. 조사만 해 두세요.

- [ ] `02`·`03`·`04` 파트의 특이도 충돌을 조사해 표로 정리(작업 아님, 조사만).
- [ ] `06-legibility.css` 의 덮어쓰기 규칙이 어느 파트를 겨냥하는지 대응표 작성.

---

## 4. 검증

각 항목을 끝낼 때마다:

1. `npm test` — Phase 0 에서 만든 절대경로 검사 통과
2. `npm run dev` 로 열어 **브라우저 콘솔 에러 0건** 확인
3. **`npm run build && npm run preview`** — dev 에서만 되고 build 에서 깨지는 것이
   경로 문제의 전형입니다. 반드시 빌드 결과로 확인하세요.

전체 완료 후 최소한 아래 경로를 손으로 훑으세요.

- 인트로 → 모드선택 → 메인 → 로그인 → 보드연결 → 허브 → 챕터 → 룸 → 미니게임
- 각 룸에서 **이론관 진입** 후 위젯 9종 동작 (부저 건반·RGB 슬라이더·조도 폴링·
  조이스틱 드래그·초음파 모니터·버튼)
- 실제 보드를 꽂고 **펌웨어 굽기** — `provisioning.js:68` 변경의 유일한 검증 수단입니다
- 기록실(`records.js`) 진입 + 성적표 이미지 저장(`reportCard.js` · html2canvas)
- EDDIE 리깅 표시 — 코스튬 누락 시 폴백이 **한 번만** 일어나는지 (`eddieRig.js:25`)

실행 방법은 `README.md` 를 보세요 (`npm install && npm run dev`).

---

## 5. 손대지 말 것

- **`src/serial/*` (638줄)** — DOM 의존이 없는 순수 로직입니다. STK500v1 부트로더 구현과
  Intel-HEX 파서가 들어 있어 잘못 건드리면 보드를 못 쓰게 만들 수 있습니다. React 로
  **그대로** 옮겨집니다. `provisioning.js:68` 한 줄만 예외입니다.
- **`src/content/curriculum.js`** — 챕터·룸 구성의 단일 소스. 17개 파일이 참조합니다.
- **`src/engine/topdown.js` (368줄)** — 단일 책임(캔버스 월드)입니다. 길다고 쪼개지 마세요.
  React 에서는 **분리가 아니라 `useEffect` + `ref` 로 감싸는** 대상입니다.
- **`src/app/flags.js` (9줄)** — `import.meta.env.VITE_* === 'true'` 비교를 함수로 감싸면
  상수 폴딩이 깨져 번들에 죽은 코드가 남습니다. 파일 2행에 경고가 있습니다.
- **각 씬의 `cleanup()`** — 모든 씬이 `cancelAnimationFrame` · 이벤트 해제 · 보드 정리를
  대칭으로 하고 있습니다(예: `src/scenes/bombGame.js:329`). 이 구조가 React
  `useEffect` 정리 함수에 1:1로 대응되는, 이 프로젝트에서 가장 값진 자산입니다.
- **`src/app/board.js` 의 싱글턴** — 14개 파일이 공유하는 하드웨어 연결 객체입니다.
  React 에서도 싱글턴으로 남는 편이 맞습니다.
- **`public/brand/` 의 파일명 규칙** — 결정 2가 나기 전까지 자산 이름을 바꾸지 마세요.

---

## 부록 · React 전환 시 미리 알아둘 것

이 문서의 작업 범위 밖이지만, 인수자가 일정을 가늠하는 데 필요한 실측입니다.

| 항목 | 규모 | 성격 |
| --- | ---: | --- |
| `innerHTML` 대입 | **144곳 / 31개 파일** | 전부 JSX 로. 최대 기계적 비용 |
| 캔버스 + `requestAnimationFrame` 루프 | 14개 파일 | **다시 쓰지 말고 감쌀 것** |
| 모듈 최상위 `new Image()` 부수효과 | 40여 곳 | import 시점에 실행됨 — 마운트 시점으로 옮겨야 |
| `localStorage`/`sessionStorage` 상태 | 키 5종 | `src/app/results.js:24` 가 이미 `CustomEvent` 로 **직접 만든 pub/sub** 을 돌리고 있어 `useSyncExternalStore` 로 거의 그대로 전환됩니다 |
| 모듈 import 그래프 | 193개 | **변경 불필요** |
| 보존할 URL | **없음** | 라우팅을 자유 설계 가능 |
