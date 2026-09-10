# Playground_AITraining-3 (Eduino AI Lab) 리팩토링 인계 문서

이 폴더를 **React 로 다시 빌드하기 전에** 해야 할 정리 작업의 지침서입니다.
두 가지를 다룹니다.

1. **경로 정리** — 지금 코드는 저장소 루트가 곧 웹 루트라는 전제로 짜여 있습니다.
   React 빌드에서는 이 전제가 무너지므로, 옮기기 전에 손봐야 합니다.
2. **파일 분리** — 비대해진 파일을 기능 단위로 쪼갭니다. 동작은 바꾸지 않습니다.

프로젝트가 무엇을 하는 앱이고 어떻게 실행하는지는 같은 폴더의 `README.md` 를,
결과물·제출 계층은 `docs/result-studio.md` 를, 편집 허용 범위는 `CLAUDE.md` 를 보세요.

작성 시점의 모든 줄 수·줄 범위는 **실측값**입니다. 작업을 시작하면 줄 번호가 밀리므로,
한 항목을 끝낼 때마다 다음 항목의 범위를 다시 확인하세요.

> ### 이 문서는 이전 `docs/refactoring.md`(72줄)를 대체합니다
>
> 이전 문서를 폐기하는 이유는 셋입니다.
>
> 1. **줄 수가 실측과 어긋났습니다.** `platform/index.html 749줄` → 실제 **303줄**,
>    `platform/course.html 757줄` → **429줄**, `course-dashboard.js 853줄` → **634줄**.
>    (`stages/apps/` 와 `trainer.labs.js` 관련 수치는 정확했고, 아래에 이어받았습니다.)
> 2. **한 항목도 실행되지 않았습니다.** `stages/apps/js/`, `platform/css/`, `console/js/`,
>    `test/no-inline.test.mjs` 가 모두 존재하지 않습니다.
> 3. **"번들러·프레임워크·`type="module"` 도입 금지" 조항이 React 계획과 충돌합니다.**
>    이 문서는 그 금지를 **작업 범위 안으로 한정**합니다 — 정리는 바닐라로 끝내되,
>    그 다음 단계가 React 임을 전제로 경로를 미리 정돈합니다. 1장을 보세요.
>
> 이전 문서의 살아있는 항목(파일 분리 Phase 1~5)은 실측값으로 갱신해 3장에 승계했습니다.

---

## 실행 지침 — Claude Code 로 이 문서를 돌릴 때

**이 문서 하나만 읽고 시작하면 됩니다.** 다른 문서가 필요한 지점은 본문이 그때그때
가리킵니다. (`CLAUDE.md` 와 `.agents/AGENTS.md` 는 Claude Code 가 자동으로 읽으므로
따로 열지 않아도 됩니다.)

1. **먼저 5장 「손대지 말 것」을 읽으세요.** `CLAUDE.md` 의 편집 허용 범위와 겹치지만,
   분리 작업 특유의 금지 항목(라우터 스텁 3개·CSS 2계열·html2canvas 대상 DOM)은
   5장에만 있습니다.
2. **Phase 0 은 바로 시작하세요.** 검증 장치를 만드는 단계라 결정이 필요 없습니다.
   끝나면 인라인 위반이 **HTML 25개 중 17개**로 잡혀야 합니다. 이 숫자가 이후 모든
   작업의 기준선입니다. Phase 0 에는 기존 테스트의 사각지대를 메우는 항목 2건
   (`models` skip 해제 · `modules/*` 스모크 커버리지)도 포함됩니다.
3. **Phase 0 이 끝나면 멈추고 보고하세요.** Phase 1 은 0장 **결정 1**(React 빌드
   배포 위치)의 답이 있어야 시작할 수 있습니다. **답을 받기 전에 경로를 임의로 바꾸지
   마세요** — 절대 194 : 상대 74 를 어느 쪽으로 통일할지가 여기서 갈리고, 잘못 고르면
   전부 되돌려야 합니다. 결정 2(`access.*` 중복)와 결정 3(ES 모듈 경계 시점)도 함께
   물으세요. **결정 3의 답에 따라 Phase 4 의 무게가 크게 달라집니다.**
4. 답을 받은 뒤 Phase 1 → 2 → 3 → 4 → 5 순서로 진행합니다. **한 항목마다 커밋**하고,
   4장 검증을 통과한 뒤 다음으로 넘어갑니다.

> 단, **Phase 1 의 첫 항목(런타임 조립 경로 3종의 헬퍼화)은 결정 1과 무관하게 지금
> 해도 됩니다.** 어느 쪽으로 결정되든 이득이므로, 대기 중에 할 일이 필요하면 이것을
> 하세요.

> 이 문서의 모든 줄 번호는 작성 시점 실측값입니다. 작업을 시작하면 밀리므로,
> 각 항목에 착수하기 전에 해당 범위를 다시 확인하세요.

---

## 0. 인계 전 결정이 필요한 사항 3건

**이 세 가지는 코드를 보고 판단할 수 없습니다. 작업 시작 전에 인계자에게 확인하세요.**

### 결정 1 · React 빌드 결과물이 어디에 배포되는가

지금 **194개의 절대경로가 동작하는 이유는 단 하나**, `vercel.json` 의 이 한 줄입니다.

```json
"outputDirectory": "."     ← 저장소 루트가 곧 웹 루트
```

React 로 빌드하는 순간 `outputDirectory` 는 `dist` 가 되고, 저장소 루트는 더 이상
웹 루트가 아닙니다. 데스크톱 쪽도 같은 전제 위에 있습니다 — `electron-main.js` 가
`app://` 커스텀 프로토콜을 등록해 `app://-/stages/foo.js` 를 `__dirname/stages/foo.js`
로 매핑하는 것이, 파일 시스템에서도 "루트"를 만들어 주기 위한 장치입니다.

```js
electron-main.js:7   // 사용자 정의 프로토콜을 등록하여 절대 경로가 프로젝트 폴더를 가리키게 함
electron-main.js:24  win.loadURL('app://-/platform/index.html');
electron-main.js:36  return net.fetch('file://' + path.join(__dirname, url));
```

- **도메인 루트(또는 서브도메인)를 그대로 쓴다** → `models/`·`platform/img/`·`favicon.png`
  를 React 의 `public/` 에 **그대로** 넣으면 URL 모양이 보존됩니다. 가장 싼 길입니다.
- **하위 경로(`/ailab/` 등)로 들어간다** → 절대경로 194개를 전부 base 기준으로 바꾸는
  작업이 **필수이며, 파일 분리보다 반드시 먼저**입니다.
- **아직 모른다** → Phase 1 을 그대로 수행하세요. 헬퍼 경유 방식은 어느 쪽이든
  대응되고 작업량이 같습니다. **권장.**

### 결정 2 · `shared/access.*` 중복을 어떻게 할 것인가

자매 프로젝트에 사실상 같은 사본이 있습니다. 줄바꿈(EOL)을 정규화하고 비교한 결과입니다.

| 파일 | 이 폴더 | 자매 폴더와의 차이 |
| --- | ---: | --- |
| `shared/access.css` | 527줄 | **0줄 차이 — 완전 동일** |
| `shared/access.js` | 516줄 | **`CTA_HREF` 상수 1개만 다름** (나머지 515줄 동일) |

`access.js` 의 유일한 차이는 이곳의 요금 섹션이 사라져 앵커가 죽었기 때문에 메일
링크로 바꾼 것입니다. 즉 **의도된 분기가 아니라 설정값 하나**입니다.

선택지는 셋입니다. **이 문서의 작업 범위 밖이며, 결정만 받아두면 됩니다.**

| 선택 | 내용 | 대가 |
| --- | --- | --- |
| 중복 수용 | 지금처럼 각자 사본 유지 | 고칠 때 4곳을 함께 고쳐야 함 |
| 빌드 단계 복사 | 한쪽을 원본으로 두고 배포 시 복사 + `CTA_HREF` 만 주입 | 빌드 스텝 추가 |
| 모노레포화 | 공통 패키지로 분리 | 네 프로젝트 구조를 함께 손봐야 함 |

### 결정 3 · ES 모듈 경계를 언제 만들 것인가

**이 폴더의 앱 코드에는 `import`/`export` 가 하나도 없습니다.** `type="module"` 도
0개입니다. 전부 클래식 `<script>` + `window` 전역이고, **로드 순서가 유일한 의존성
선언**입니다.

```html
index.html:1502   <script src="/stages/trainer/trainer.core.js"></script>
index.html:1503   <script src="/stages/trainer/trainer.labs.js"></script>
index.html:1504   <script src="/stages/trainer/trainer.init.js"></script>
```

이 셋(409 + 1240 + 340 = **1989줄**)은 전역 스코프를 공유하는 **사실상 하나의 모듈**
입니다. `trainer.core.js` 의 `state`·`els`·`PALETTE` 를 `labs.js` 가 직접 읽습니다.
IIFE 로 감싸지 않은 파일이 15개 있고, 서로의 최상위 `const`/`function` 에 의존합니다.

**모듈 경계 만들기는 React 포팅의 선행 조건이지 부수 효과가 아닙니다.** 이걸 언제
할지가 일정을 가릅니다.

- **이 문서의 파일 분리 안에서 함께 한다** → Phase 4 가 크게 무거워집니다. 대신
  React 착수 시점에 준비가 끝나 있습니다.
- **React 착수 후에 한다** → 이 문서는 가벼워지지만, 포팅 첫 주가 통째로 여기에 갑니다.

어느 쪽이든 **트리오는 셋을 함께 다시 써야 합니다.** 하나만 떼어낼 수 없습니다.

---

## 1. 절대 원칙

이 작업은 **정리**이지 **개선**이 아닙니다. 아래는 예외 없습니다.

- **로직 수정 금지.** 알고리즘·동작 방식·함수 이름을 바꾸지 않습니다. 파일 이동과
  분리, 그리고 경로 문자열 치환만 합니다. 눈에 띄는 버그가 있어도 이 작업에서는
  건드리지 말고 따로 보고하세요. (이미 알려진 것은 아래 "함께 아는 결함" 참고)
- **URL 유지.** HTML 파일의 경로를 바꾸지 않습니다. `CLAUDE.md` 가 "URL 전부 유지"를
  명시하고 있고, 라우터 스텁 3개가 그 목적으로 남아 있습니다.
  (단, 결정 1에서 하위 경로 배포가 정해진 경우 base 접두만 예외)
- **바닐라 유지 — 단, 이 문서의 작업 범위 안에서만.** 경로 정리와 파일 분리는
  React 없이 끝냅니다. **React 전환은 이 작업이 끝난 뒤의 별도 단계이고, 이 문서는
  그 단계에서 경로가 깨지지 않도록 미리 정리하는 것이 목적입니다.** 여기서 프레임워크를
  먼저 들이면 두 가지 변경이 한 커밋에 섞여 회귀를 추적할 수 없게 됩니다.
- **전역 스코프 유지.** 분리한 JS 는 IIFE 로 감싸고, 기존 전역은 `window.X = X;` 로
  명시적으로 내보냅니다. HTML 에 `<script src>` 를 추가할 때 **원본의 의존성 순서를
  그대로 지킵니다.** (결정 3이 "함께 한다"로 나기 전까지)

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

### 경로 — 규칙이 하나가 아니다

**이 폴더의 가장 중요한 사실입니다.** 자매 폴더 문서는 "모든 HTML 이 절대경로"라고
적고 있지만, **여기서는 사실이 아닙니다.**

HTML 의 로컬 `src`/`href` 참조 (외부 CDN 제외):

| 디렉터리 | 절대 | 상대 |
| --- | ---: | ---: |
| 루트 (`*.html`) | 43 | 0 |
| `console/` | 15 | 0 |
| `platform/` | 20 | 0 |
| `stages/` | 75 | 0 |
| **`modules/`** | **41** | **74** |
| **합계** | **194** | **74** |

`modules/` 하나만 두 규칙이 섞여 있고, **나머지 네 디렉터리는 100% 절대경로**입니다.
게다가 혼재가 **한 `<script>` 블록 안에서** 일어납니다.

```html
modules/vision/index.html:349   <script src="../shared/icons.js"></script>
modules/vision/index.html:350   <script src="/shared/access.js"></script>     ← 바로 옆줄
modules/vision/index.html:351   <script src="./app.js"></script>
```

다만 `modules/` 의 절대경로 41개는 자의적이지 않습니다. 전부 **교차 관심사**입니다.

```
8 /favicon.png            8 /apple-touch-icon.png     ← 사이트 크롬
6 /shared/access.js       6 /shared/access.css        ← 게이팅 계층
6 /platform/img/logo-mark.webp                        ← 브랜드 자산
6 /platform/index.html    1 /modules/life/index.html  ← 페이지 이동
```

즉 **"자기 하위 트리는 상대, 트리 밖은 절대"** 라는 일관된 규칙으로 작성됐습니다.
경로 전략을 세울 때 이 의도를 무시하지 마세요.

### 번들러가 볼 수 없는 런타임 조립 경로 — 최대 위험

정적 분석이 불가능해 어떤 번들러도 재작성하지 못하고, 자산 포함도 하지 않습니다.

**① 썸네일 확장자 탐색** — 템플릿으로 조립한 뒤 `.webp→.jpg→.png→.jpeg` 순으로
`img.src` 를 갈아끼우며 존재하는 것을 찾습니다.

```html
console/cards.html:184   <img class="pack-thumb" data-base="/platform/img/${t.thumb}-${s.key}" … />
console/map.html:214     <img data-base="/platform/img/${t.thumb}-${s.key}" … />
entry.html:178           <img class="pthumb" data-base="/platform/img/entry-${r.key}" … />
```
```js
console/shared.js:536    const base = img.dataset.base, exts = ['webp', 'jpg', 'png', 'jpeg'];
console/shared.js:538    const next = () => { … img.src = base + '.' + exts[i++]; };
```

**② 데모 이미지**
```js
modules/shared/course-preview.js:40   rec.img.src='/platform/img/demo/'+name+'.webp';
```

**③ `console/shared.js` 의 `TRACKS`·`VARIANTS` 테이블 안 `href` 문자열** — 스테이지
진입 링크가 데이터로 들어 있습니다. `console/shared.js:29~70`, `HOME`(63행) 포함.

### MoveNet 은 `import` 할 수 없습니다

```js
stages/apps/skeleton.html:127        modelUrl: '/models/movenet/singlepose-lightning/model.json'
stages/trainer/trainer.labs.js:116   modelUrl: '/models/movenet/singlepose-lightning/model.json'
```

TF.js 가 `group1-shard1of2.bin`·`group1-shard2of2.bin`(합 4.6MB)을 **`model.json` 의
URL 기준 상대경로로** 해석합니다. 따라서 이 디렉터리는 **해시 없는 파일명 그대로,
같은 URL 모양으로** 서빙돼야 합니다. `import` 로 바꾸면 파일명이 해시로 바뀌어
샤드를 못 찾습니다. React 의 `public/` 에 통째로 넣는 것이 정답입니다.

> `stages/trainer/trainer.core.js:46` 의 MobileNet 은 원격 CDN(`storage.googleapis.com`)
> 이라 이 문제와 무관합니다.

### 기존 테스트가 두 규칙을 이미 성문화하고 있다

`test/asset-refs.test.mjs` 는 이 작업의 안전망이자, **동시에 함정**입니다.

```js
test/asset-refs.test.mjs:13   const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "models"]);
test/asset-refs.test.mjs:40   const resolveRef = (htmlPath, ref) => { …
                              clean.startsWith("/") ? join(ROOT, clean)          ← 절대: 저장소 루트 기준
                                                    : resolve(dirname(htmlPath), clean); ← 상대: 자기 위치 기준
test/asset-refs.test.mjs:80   const JS_REF = /['"](\/(?:stages|console|platform|modules)\/…)['"]/g;
```

- `resolveRef()` 가 **절대·상대 양쪽을 합법으로 인정**합니다. 위 41:74 혼재가 테스트를
  통과하는 이유입니다.
- `SKIP_DIRS` 에 `models` 가 있어 **MoveNet 경로는 아무도 검증하지 않습니다.**
- `JS_REF` 는 **절대경로 문자열만** 봅니다. JS 안의 상대경로는 미검증입니다.
- `test/load-app.mjs:24` 의 인라인 치환 정규식이 `src="/…"` 만 매칭하므로,
  **`modules/*` 페이지는 jsdom 스모크 테스트 커버리지가 0입니다.**

### 파일 크기 — 400줄 초과 21개

| 줄 수 | 파일 | 비고 |
| ---: | --- | --- |
| **1509** | `index.html` | 인라인 없음(분리 완료). 탭 패널 3개 |
| **1256** | `stages/apps/character-card.html` | style 17–421 · script 593–1254 |
| **1240** | `stages/trainer/trainer.labs.js` | **랩 7종이 한 파일에** |
| **1065** | `stages/apps/idea-board.html` | style 17–267 · script 625–1063 |
| 922 | `stages/styles/trainer.css` | 구획 주석조차 없음 |
| 765 | `stages/studio/maker.js` | CSS-in-JS 61행~ |
| 755 | `stages/submission/ui/submit.ui.js` | CSS-in-JS 92행~ |
| 668 | `console/shared.js` | **손대지 말 것** (5장) |
| 634 | `modules/shared/course-dashboard.js` | `init()` 하나가 대부분 |
| 593 | `stages/studio/imagelab.js` | CSS-in-JS **2곳** (133·405행) |
| 589 | `platform/sample.html` | style 13–197 · script 284–587 |
| 589 | `modules/data/app.js` | 번호 붙은 연습 절이 나열 |
| 564 | `stages/studio/studio-common.js` | 책임 6개 이상 잡탕 |
| 527 | `shared/access.css` | **손대지 말 것** (결정 2) |
| 516 | `shared/access.js` | **손대지 말 것** (결정 2) |
| 509 | `modules/gesture/advanced.js` | |
| 466 | `stages/submission/board.js` | CSS-in-JS 28행~ |
| 451 | `modules/vision/advanced.js` | |
| 429 | `platform/course.html` | style 13–197 · script 273–427 |
| 425 | `modules/data/index.html` | 인라인 없음 |
| 409 | `stages/trainer/trainer.core.js` | 트리오 (결정 3) |

### 인라인 위반 — HTML 25개 중 17개

`<style>` 또는 `src` 없는 `<script>` 를 가진 파일입니다. 범위는 실측입니다.

| 파일 | `<style>` | `<script>` |
| --- | --- | --- |
| `stages/apps/detect.html` | — | 110–228 |
| `stages/apps/filter.html` | — | 115–214 |
| `stages/apps/face.html` | — | 108–206 |
| `stages/apps/colortrack.html` | — | 111–203 |
| `stages/apps/skeleton.html` | — | 109–192 |
| `stages/apps/character-card.html` | 17–421 | 593–1254 |
| `stages/apps/idea-board.html` | 17–267 | 625–1063 |
| `platform/index.html` | 22–194 | 251–301 |
| `platform/course.html` | 13–197 | 273–427 |
| `platform/sample.html` | 13–197 | 284–587 (2개) |
| `console/cards.html` | 21–113 | 150–277 |
| `console/map.html` | 21–127 | 173–302 |
| `entry.html` | 20–116 | 160–313 |
| `studio.html` · `explore.html` · `create.html` | 소형 스텁 | 소형 스텁 |
| `modules/index.html` | — | 있음 (48줄 파일) |

### CSS-in-JS — 8곳 / 7개 파일

```
stages/admin/admin.js:14          stages/studio/maker.js:61
stages/core/ui/dialog.js:14       stages/studio/studio.js:28
stages/studio/imagelab.js:133     stages/submission/board.js:28
stages/studio/imagelab.js:405     stages/submission/ui/submit.ui.js:92
```

### 함께 아는 결함 (신규 회귀 아님 · 고치지 말고 인지만)

`package.json` 의 `build.files` 가 `["index.html", "electron-main.js"]` 뿐입니다.
`platform/`·`stages/`·`shared/`·`console/`·`modules/`·`models/` 가 전부 빠져 있어
`npm run dist` 결과물은 `app://-/platform/index.html` 에서 **빈 화면**이 됩니다.
`docs/result-studio.md:104-108` 에 🔴 미해결로 기록돼 있습니다. **이 문서의 작업 이전부터
있던 문제이므로, 분리 작업 후 데스크톱 빌드가 안 된다고 당황하지 마세요.**

---

## 3. 작업 체크리스트

효과가 큰 순서가 아니라 **안전한 순서**로 배열했습니다. 작은 파일로 감을 잡고
큰 파일로 갑니다. 각 항목을 끝낼 때마다 커밋하세요.

커밋 메시지: `refactor(scope): <파일> css/js 분리`

### Phase 0 · 검증 장치 만들기

- [ ] `test/no-inline.test.mjs` 신설. 모든 `.html` 을 훑어 인라인 `<style>` 또는
      `src` 없는 `<script>` 본문이 있으면 실패시킵니다. Node 내장 `node:test` 만
      쓰고 의존성은 추가하지 않습니다.
- [ ] 화이트리스트에 `index.html`(이미 분리 완료 · 위반 아님) 등록.
- [ ] 지금 실행하면 **17개 파일**이 실패하는 것을 확인. 이 숫자가 0이 되면 L1 완료입니다.
- [ ] `test/asset-refs.test.mjs:13` 의 `SKIP_DIRS` 에서 **`models` 를 제거**하고,
      MoveNet `modelUrl` 이 검사 대상에 들어오는지 확인합니다. 지금은 이 4.6MB 자산이
      무검증 상태입니다.
- [ ] `test/load-app.mjs:24` 의 정규식을 상대경로 `src` 도 매칭하도록 넓혀
      **`modules/*` 페이지를 스모크 테스트 대상에 넣습니다.** (현재 커버리지 0)

### Phase 1 · 경로 규칙 단일화 (최우선 · 다른 작업보다 먼저)

> **이 Phase 를 파일 분리보다 먼저 끝내세요.** 순서를 바꾸면 분리하며 새로 만든 파일에도
> 지금의 경로 규칙이 복사되어 두 번 일하게 됩니다. 루트 `README.md` 가 규정한 원칙입니다.
>
> **194 대 74 를 어느 쪽으로 통일할지는 결정 1에 종속됩니다. 답을 받기 전에는
> 착수하지 마세요.** 다만 아래 첫 항목은 결정과 무관하게 지금 해도 됩니다.

- [ ] **런타임 조립 경로 3종을 헬퍼 함수 경유로 선(先)수렴.** 결정과 무관하게 이득입니다.
      나중에 base 를 붙이든 상대로 내리든, 고칠 지점이 코드 전체가 아니라 헬퍼 하나가
      됩니다.
      - `console/shared.js` 의 `thumbs()`(532–546행) — `data-base` 조립부
      - `modules/shared/course-preview.js:40` — 데모 이미지
      - `console/shared.js` 의 `TRACKS`·`VARIANTS` `href` 테이블
- [ ] (결정 1이 **하위 경로**인 경우) 절대경로 194개를 base 기준으로 전환.
      `stages/` 75 → `platform/` 20 → `console/` 15 → 루트 43 → `modules/` 41 순으로,
      디렉터리 하나씩 커밋합니다.
- [ ] (결정 1이 **루트 유지**인 경우) `models/`·`platform/img/`·`favicon.png`·
      `apple-touch-icon.png` 를 React `public/` 에 그대로 넣는 것으로 URL 모양을
      보존한다는 방침을 문서화하고, 절대경로는 그대로 둡니다.
- [ ] 어느 경우든 **`modules/` 의 혼재를 없앱니다.** 한 블록 안에서 `../shared/icons.js`
      와 `/shared/access.js` 가 섞이지 않도록 규칙을 하나로 맞춥니다.
- [ ] `npm test` 통과 확인 → **`start-app.bat` 으로 실제 서빙해 전 페이지 확인.**

### Phase 2 · `stages/apps/` 5개 (연습용)

가장 작고 구조가 같습니다. 분리 절차와 IIFE·전역 노출 규칙을 여기서 익히세요.

- [ ] `stages/apps/detect.html` — script(110–228) → `stages/apps/js/detect.js`
- [ ] `stages/apps/filter.html` — script(115–214) → `stages/apps/js/filter.js`
- [ ] `stages/apps/face.html` — script(108–206) → `stages/apps/js/face.js`
- [ ] `stages/apps/colortrack.html` — script(111–203) → `stages/apps/js/colortrack.js`
- [ ] `stages/apps/skeleton.html` — script(109–192) → `stages/apps/js/skeleton.js`
- [ ] 5개 HTML 에 반복되는 **7줄짜리 `<script src>` 부트스트랩 중복**을 확인해 둡니다
      (제거는 Phase 5).

### Phase 3 · `platform/` · `console/` · `entry.html`

- [ ] `platform/index.html` — style(22–194) → `platform/css/landing.css`,
      script(251–301) → `platform/js/landing.js`
- [ ] `platform/course.html` — style(13–197) → `platform/css/course.css`,
      script(273–427) → `platform/js/course/` 하위에 기능별 분리
- [ ] `platform/sample.html` — style(13–197) → `platform/css/sample.css`,
      script(284–587, **2개 블록**) → `platform/js/sample/` 하위에 기능별 분리
- [ ] `console/cards.html` — style(21–113) → `console/css/cards.css`,
      script(150–277) → `console/js/cards.js`
- [ ] `console/map.html` — style(21–127) → `console/css/map.css`,
      script(173–302) → `console/js/map.js`
- [ ] `entry.html` — style(20–116) → `console/css/entry.css`,
      script(160–313) → `console/js/entry.js`
- [ ] 스텁 3개(`studio`·`explore`·`create.html`)와 `modules/index.html` 소형 인라인 정리

> **`console/shared.js` 와 인트로 재생 정책(`data-intro`)은 절대 건드리지 마세요.**

### Phase 4 · 대형 HTML · 거대 JS · CSS-in-JS

- [ ] `stages/apps/character-card.html` — CSS(17–421) → `stages/apps/css/character-card.css`,
      JS(593–1254) → `stages/apps/js/character-card/` 하위에 기능별 분리
- [ ] `stages/apps/idea-board.html` — CSS(17–267) → `stages/apps/css/idea-board.css`,
      JS(625–1063) → `stages/apps/js/idea-board/` 하위에 기능별 분리
- [ ] `stages/trainer/trainer.labs.js`(1240줄) — 랩 7종을 `stages/trainer/labs/*.js` 로.
      **`index.html` 의 스크립트 순서를 원본 그대로 유지해야 합니다**(결정 3 참고).
- [ ] **CSS-in-JS 8곳 제거** → `.css` 파일로 추출하고 참조 HTML 에 `<link>` 추가.
      `admin.js:14` · `dialog.js:14` · `imagelab.js:133` · `imagelab.js:405` ·
      `maker.js:61` · `studio.js:28` · `board.js:28` · `submit.ui.js:92`
- [ ] `stages/styles/trainer.css`(922줄) → `layout.css`·`panels.css`·`results.css`.
      **로드 순서는 원본 선언 순서를 유지합니다**(뒤 규칙이 앞을 덮는 곳이 있을 수 있음).
- [ ] `modules/{concept,text,gesture,vision}/advanced.js` → 각 `advanced/` 하위로 기능별 분리
- [ ] `modules/data/app.js`(589줄) → 차트·로직·본문으로 분리
- [ ] `modules/shared/course-dashboard.js`(634줄) → `course-dashboard/` 하위로.
      **모듈 최상위 가변 상태(`activeFinish`·`activeProgress`·`activeMarkDone`, 19–21행)
      참조가 끊기지 않게 주의하세요.**
- [ ] `stages/studio/studio-common.js`(564줄) — 책임 6개 이상. 단 로더 제약이 있는
      `esc()` 는 그대로 둡니다(5장).

### Phase 5 · 중복 제거 및 완료 검증

- [ ] `stages/apps/` 5개 HTML 의 동일한 `<script src>` 부트스트랩 7줄 중복 제거
- [ ] `modules/*/index.html` 6개의 동일한 head/tail 스켈레톤 중복 제거
- [ ] `esc()` **14개 사본** 정리 — 단 `dialog.js`·`submit.core.js` 사본은
      `studio-common.js:271` 주석이 "로더가 수정 금지라 공용화 불가"라고 밝히고 있으므로
      **제외**합니다. 나머지만 `shared/` 로 올립니다.
- [ ] `node --test` 전부 통과 + 각 페이지 브라우저 콘솔 에러 0건

---

## 4. 검증

각 항목을 끝낼 때마다:

1. `npm test` — Phase 0 에서 만든 인라인 검사 + 기존 `asset-refs` 통과
2. 해당 페이지를 실제로 열어 **브라우저 콘솔 에러 0건** 확인
3. 카메라·마이크를 쓰는 페이지는 **실제로 켜서 동작까지** 확인 (스크립트 분리로
   초기화 순서가 밀리면 여기서 드러납니다)

전체 완료 후 최소한 아래 경로를 손으로 훑으세요.

- `/` → `platform/index.html` → 진입 버튼 **2개** 각각
- 일반 사용자모드 → `modules/index.html` → 코스 6종 각각 진입 → 4단계 셸 동작
- 수업전용 콘솔모드 → `entry.html` → 허브(`cards`/`map`) → 스테이지 5종 카메라 동작
- `/index.html#image` · `#audio` · `#pose` — 트레이너 탭 3종 학습·추론
  (**`trainer.core`→`labs`→`init` 로드 순서가 깨지면 여기서 즉시 드러납니다**)
- 결과물 저장 → 캐릭터 카드 / 아이디어 보드 (iframe 오버레이 + html2canvas 캡처)
- **동작 분류(MoveNet)** — 로컬 모델 4.6MB 가 실제로 로드되는지. 경로 작업의 핵심 검증점

실행 방법은 `README.md` 를 보세요 (`start-app.bat` 또는 `python -m http.server 8000`).
**둘 다 저장소 루트를 서빙합니다** — 하위 경로 테스트가 필요하면 별도 설정이 필요합니다.

---

## 5. 손대지 말 것

- **`index.html`** — 이미 완전히 분리 완료(1509줄이지만 인라인 0)
- **`console/shared.js`** — 콘솔 공통 셸이자 항목 데이터(`TRACKS`)의 단일 소스.
  Phase 1 의 `thumbs()` 헬퍼화만 예외입니다.
- **인트로 재생 정책** — `data-intro` 속성과 그 판단 코드
- **라우터 스텁 3개** — `studio.html`·`explore.html`·`create.html`. URL 유지 목적이므로
  **삭제 금지**
- **`platform/index.html` 의 진입 버튼 2개 규칙** — `CLAUDE.md:13-27` 이 네비 메뉴·
  추가 버튼·배지·앵커 신설을 모두 금지합니다. 분리하면서 구조를 "정리"하지 마세요.
- **`models/`** — 파일명·경로 모두 그대로. TF.js 가 샤드를 상대경로로 찾습니다.
- **`stages/apps/` 의 CSS 2계열** — 스테이지 계열(`stage.css`, 파랑)과 스튜디오 계열
  (`tokens.css`+`studio.css`, 빨강)은 `docs/result-studio.md:118-130` 이 **통합 불가가
  설계 의도**라고 못박고 있습니다. 하나로 합치려 들지 마세요.
- **html2canvas 캡처 대상 `#board`·`#card` 의 DOM 구조** — 이미지 출력에 구조 자체가
  관여합니다. `docs/result-studio.md:140-146` 이 CSS 추출을 금지합니다.
- **`shared/access.js`·`access.css`** — 결정 2가 나기 전까지
- **`dialog.js`·`submit.core.js` 의 `esc()` 사본** — 로더 제약으로 공용화 불가
  (`studio-common.js:271` 주석)

---

## 부록 · React 전환 시 미리 알아둘 것

이 문서의 작업 범위 밖이지만, 인수자가 일정을 가늠하는 데 필요한 실측입니다.

| 항목 | 규모 | 성격 |
| --- | ---: | --- |
| `innerHTML` 대입 | **269곳** | 전부 JSX 로. 일부는 `<img src="/…">` 를 문자열 안에 품고 있어 경로가 숨습니다 |
| `getContext('2d')` | 68곳 | 비디오 오버레이·학습곡선·혼동행렬·산점도 |
| `requestAnimationFrame` | 35곳 | 랩별 추론 루프. 각자 `raf` 핸들과 수동 해제 |
| `getUserMedia` | 24곳 | 카메라/마이크 획득. 각각 별도 정지 로직 |
| `document.getElementById` | 128곳 | `els = {...}` 스냅샷이 **스크립트 평가 시점에** DOM 을 잡습니다 — 마운트 개념과 충돌 |
| `window.X =` 전역 | **39개 네임스페이스** | + IIFE 미적용 15개 파일의 암묵 전역 |
| `localStorage`/`sessionStorage` | 53 / 24곳 | 페이지 간 인계 수단. 페이지가 컴포넌트가 되면 의미가 사라집니다 |
| `iframe` + `window.parent` 브리지 | 11곳 | `studio.js` 오버레이 ↔ `studio-common.js:128-165`. **가장 어려운 부분** |
| ES 모듈 경계 | **0** | 결정 3 |
| 기존 테스트 (7파일 ~1750줄) | — | 클래식 스크립트 구조에 결합돼 있어 포팅 시 **전부 무효화**됩니다 |

특히 `stages/submission/submit.core.js` 는 이름과 달리 **부모 트레이너 페이지의 DOM 을
데이터 소스로 읽습니다**(`querySelector('.nav-item.active')`, `getElementById('panel-direct')`,
`location.hash`). `docs/result-studio.md:46-48` 에 지적돼 있습니다.
**React 에서는 이걸 props/context 로 뒤집는 것이 다른 무엇보다 먼저입니다.**
