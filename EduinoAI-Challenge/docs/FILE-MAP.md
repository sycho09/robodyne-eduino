# 파일 지도와 옮길 계획 (57-E 3단계)

이 문서는 **조사 결과와 계획**이다. 이 차수에는 파일을 하나도 옮기지 않았다.
승인 뒤에 이 표대로 옮긴다.

56차에 봉인 원본 186개를 옮기려다 한 개도 못 옮겼다. 전부 경로에 묶여 있었기 때문이다.
그래서 이번에는 계획표마다 **경로에 묶여 있는가**를 먼저 적는다.

---

## 0. 먼저 알아야 할 것 — 챌린지 전용 코드는 없다

`src/` 아래 자바스크립트 68개를 전부 훑었다. **어느 챌린지 하나만 쓰는 .js 파일은 없다.**
전부 셸·엔진·런타임이고, 챌린지마다 다른 것은 매니페스트가 켜고 끈다.

| 화면 조각 | 실제로 켜지는 챌린지 | 무엇이 켜는가 |
| --- | --- | --- |
| `ui/panels/cityiso.js` | smartcity-drive 1종 | `scene.obstacles` |
| `ui/panels/train.js` · `engine/ml.js` | ml-sign-lab · smartcity-drive 2종 | `ml` |
| `ui/panels/camera.js` | color-follow-basic · color-follow-blue · webcam-drive-basic 3종 | `allowed_api` 의 `camera*` |
| `ui/panels/firstperson.js` · `eventlog.js` | dashboard 를 켠 챌린지 | `scene.ui.dashboard` |
| `ui/scout/*` (10개) | scout-lab 1종 | `mode: 3` |

그래서 "챌린지 폴더로 옮길 전용 화면" 은 **`ui/scout/` 열 개뿐**이고, 나머지는
한 종만 쓰더라도 공용 셸의 일부다. 챌린지 폴더로 내리면 그 순간 공용 셸이 챌린지를
알아야 해서 14차 원칙(엔진·셸·검사 한 벌)을 어긴다.

---

## 1. 지금 구조 — 파일마다 한 줄

경로 / 이 파일을 쓰는 챌린지 / 공용인가 전용인가 / 누가 불러 쓰는가

### 챌린지 데이터 (전용)

| 경로 | 쓰는 챌린지 | 갈래 | 누가 부르는가 |
| --- | --- | --- | --- |
| `src/challenges/esp32cam-2wd/<10종>.json` | 자기 1종 | 전용 | `loader.js` 가 주소로 fetch |
| `src/challenges/index.json` | 전 종 | 공용 | `loader.js` · 검사 `ids.js` |
| `src/challenges/challenge.schema.json` · `scout.schema.json` | 전 종 | 공용 | 사람이 읽는다(코드가 읽지 않음) |
| `src/challenges/loader.js` | 전 종 | 공용 | main · 페이지 4개 |
| `src/kits/esp32cam-2wd.json` · `index.json` | 전 종 | 공용 | `loader.js` 가 상대 주소로 fetch |

### 엔진 (공용 · 무수정 대상)

`src/engine/` 13개 — clock · sim · vehicle · track · decisions · obstacles · stop · signals ·
script · events · camera · ml · version. 전부 여러 곳에서 부른다. 챌린지별 갈래 없음.

### 런타임 (공용)

`src/runtime/` 9개 — api · lexer · parser · validate · transpile · sandbox · errors · codediff.
`sandbox.js` 만 화면이 직접 부르고 나머지는 그 아래에 매달려 있다.

### 셸·화면 (공용)

`src/ui/` — main · router · shell · storage · assets · words · audio,
`pages/` 4개(challenge · home · kit · scout), `panels/` 13개, `scout/` 10개, `styles/` 4개.
`ui/panels/overview.js` 와 `ui/audio.js` 는 지금 아무도 부르지 않는다(아래 4번).

### 검사 (공용 · 한 벌)

`tools/checks/` — 진입점 `run-all.mjs` + 검사 15종 + 공유 모듈 `ids.js` · `viewcolors.js` · `serve.js`
+ 기준값·예외 파일 5개(`laptime.baseline.json` · `ids.allow.json` · `catalog.allow.json` ·
`brightness.allow.json` · `.color-baseline.json`).

### 에셋 (615개)

`assets/` — `assets.manifest.json` 이 슬롯 이름을 파일로 잇는다. 매니페스트는 `slot:` 이름만 적는다.
슬롯 참조 47개 중 전 종 공용 2개(`car.2wd` · `track.square`), 나머지 45개는 1~3종 전용
(배경 7개 · 안내 그림 32개 · 마커 2개).

---

## 2. 옮길 계획표

목표는 셋뿐이다 — 챌린지 폴더 · 공용 폴더 · 챌린지 지도.

| # | 무엇을 | 어디로 | 경로에 묶여 있는가 | 함께 고쳐야 하는 것 |
| --- | --- | --- | --- | --- |
| A | 챌린지 10종 매니페스트 | `src/challenges/<kit>/<id>/challenge.json` | **풀렸다(57-F·G)** | 이제 `index.json` 의 `path` 한 줄뿐이다. 검사는 그 값을 읽으므로 한 줄도 안 고친다. **square-beginner 1종 이동 완료(57-G)** · 나머지 9종 대기 |
| B | ~~챌린지별 에셋~~ | — | — | **하지 않기로 함(57-G).** 2-B 참조 |
| C | ~~공용 에셋~~ | — | — | **하지 않기로 함(57-G).** 2-B 참조 |
| D | `src/ui/scout/` 10개 | `challenges/scout-lab/ui/` | 묶임(상대 import 10줄) | `pages/scout.js` 의 import 경로. 다만 0번 이유로 **보류 권장** |
| E | 엔진·런타임·셸·검사 | 지금 자리 유지 | — | 옮기지 않는다(14차) |
| F | 챌린지 지도 문서 10장 | `challenges/<id>/README.md` | 안 묶임 | 새로 쓴다. 쓰는 파일 / 무엇을 고치면 무엇이 바뀌나 / 건드리면 안 되는 것 |

### 경로에 묶인 자리 — 옮기기 전에 반드시 푸는 것

| 자리 | 무엇이 박혀 있나 |
| --- | --- |
| `src/challenges/loader.js:22·52` | `../kits/index.json` · `../kits/<id>.json` 을 자기 위치 기준으로 연다. loader 를 옮기면 킷을 못 찾는다 |
| `src/ui/assets.js:20` | `../../assets/assets.manifest.json` |
| `src/ui/panels/firstperson.js:22` | `../../../assets/sprites/city/city.sprites.json` |
| `index.html` · `404.html` | 스타일시트 4장의 경로. **두 장이 같아야 한다**(콜드 캐시 검사가 대조한다) |
| `vercel.json` · `tools/checks/serve.js` | `/kit/*` · `/challenge/*` 를 index.html 로 보내는 규칙 |
| 검사 6종 | `/src/challenges/esp32cam-2wd/<id>.json` 을 문자열로 적어 fetch 한다 |
| `tools/checks/ids.js` | `src/challenges/index.json` 을 루트 기준으로 읽는다 |

A 는 끝났다(57-H). 실제로 고친 것은 `index.json` 의 `path` 열 줄과, 폴더를 훑던 검사 셋
(`align.mjs` · `record.js` · `catalog.mjs`)뿐이다 — 폴더를 훑으면 옮긴 챌린지를
조용히 빠뜨리고 통과한다. 나머지 검사는 한 줄도 고치지 않았다.

### 권하는 순서

1. **F** 챌린지 지도 10장 (코드 0줄)
2. **B·C** 에셋을 챌린지별·공용으로 가른다 (매니페스트 한 줄씩, 코드 0줄)
3. **A** 매니페스트 이동 + 검사의 주소 리터럴을 한 곳(`ids.js`)으로 모은 뒤 이동
4. **D** 는 보류 — 0번 이유

---

## 2-B. 에셋 가르기 — **하지 않기로 했다** (57-G 확정 · 다시 꺼내지 않는다)

기획 판단으로 닫았다. 굽는 도구 네 줄을 고쳐서 **얻는 것이 없다.**

담당자가 알아야 할 것은 "이 챌린지가 어떤 에셋을 쓰는가" 이고, 그것은
챌린지 지도(`docs/challenges/<id>.md`)의 **이 챌린지가 쓰는 에셋** 목록이 이미 답한다.
폴더 위치가 답하는 것이 아니다.

반대로 잃는 것은 크다 — 굽는 경로 · 봉인 해시 · 파일명이 한꺼번에 흔들린다.
56차에 같은 판단을 했고, 아래 조사로 근거가 더 분명해졌다.

**이 항목은 닫혔다.** 계획표의 B·C 는 실행하지 않는다.

### 닫은 근거 (57-F 조사)

계획표 B·C 는 "코드 0줄" 이 조건이었다. 옮기기 전에 무엇이 무엇에 묶여 있는지부터 봤고,
**한 개도 옮기지 않았다.** 굽는 도구와 봉인 도구가 폴더를 이름으로 알고 있기 때문이다.

| 무엇 | 전용/공용 | 옮길 수 있나 | 묶여 있는 자리 |
| --- | --- | --- | --- |
| 안내 그림 20장 (`assets/guide/`) | 5종 전용 | **못 옮김** | `tools/bake/render_iso_scene.py:1254` 의 `OUT_GUIDE` 가 이 폴더에 굽는다. 옮기면 다시 구울 때 옛 자리에 다시 생긴다 |
| 배경 프리렌더 6종 (`assets/tracks/classroom/iso-*`) | 각 1~3종 | **못 옮김** | 같은 파일 `:84` 의 `OUT_TRACK` + 파일명에 내용 해시가 박혀 있다(`iso-smartcity.94229ca70b.json`) |
| 마커 2장 (`marker-red` · `marker-blue`) | 빨강 2종 · 파랑 1종 | **못 옮김** | 같은 `OUT_TRACK` 폴더다 |
| RC카 스프라이트 2종 | 킷 공용 | 옮길 이유 없음 | `:85` 의 `OUT_KIT`. 킷의 것이지 챌린지의 것이 아니다 |
| 바닥 텍스처 · 조명 오버레이 | 굽는 재료 | 옮길 이유 없음 | 배경을 구울 때 쓰는 재료다. 화면이 직접 쓰지 않는다 |
| 봉인된 파일 86개 | — | **못 옮김** | `tools/seal/seal_assets.py:31` 의 `ASSET_DIR` 가 `assets/` 전체를 훑어 제자리에서 이름을 바꾼다 |

즉 에셋을 챌린지별로 가르려면 **코드 0줄이 아니라 네 줄**(OUT_GUIDE · OUT_TRACK · OUT_KIT ·
ASSET_DIR)을 굽는 도구에서 고쳐야 한다. 그 네 줄을 고쳐서 얻는 것이 없다는 것이 57-G 의 판단이다.

56차에는 옮기려다 못 옮겼고, 57-F 에서는 옮기기 전에 알아냈고, 57-G 에서 아예 닫았다.

### 슬롯만 보고 "안 쓴다" 고 하면 또 틀린다

슬롯→챌린지만 훑으면 아래 여섯이 "어느 챌린지도 안 씀" 으로 나온다. **전부 살아 있다.**
매니페스트가 아니라 코드가 직접 부르기 때문이다.

| 슬롯 | 실제로 부르는 곳 |
| --- | --- |
| `city.iso` | `ui/panels/cityiso.js:47` |
| `track.tape` | `ui/panels/track.js:204` |
| `overlay.light` | `ui/panels/track.js:268` |
| `car.2wd.iso` | `src/kits/esp32cam-2wd.json:19` |
| `kit.esp32cam-2wd.thumb` | `src/kits/index.json:10` |
| `ui.gauge` | `path` 가 비어 있는 것이 정상. `challenge.js:490` 이 이 하나만 빠뜨려도 되는 것으로 센다 |

## 3. 지금 아무도 안 부르는 것 (지우지 않았다)

57-F 에서 확인했다. **지우지 않았다.**

확인한 방법 넷:
1. 정적 import — 두 파일을 `import` 하는 곳 0
2. 동적 import·문자열 조립 — `import(...)` · `new URL(...)` 로 이 두 파일을 만드는 곳 0
3. 내보내는 이름 — `createOverview` · `createMotorAudio` 를 부르는 곳 0
4. 네트워크 — 화면 6개(허브 · 킷 · 이동제어 · 스마트시티 · 탐사 · 색상제어)를 열고
   받아온 `.js` 54개를 다 봤다. 두 파일은 **0건**. 같은 방법으로 잰 대조군
   `shell.js` · `minimap.js` · `editor.js` 는 각 1건이라 재는 방법 자체는 맞다.

| 경로 | 판단 | 근거 |
| --- | --- | --- |
| `src/ui/panels/overview.js` | 안 쓰는 것으로 판단됨 | 위 네 가지 전부 0. `createOverview` 를 부르는 곳이 없다 |
| `src/ui/audio.js` | 안 쓰는 것으로 판단됨 | 위 네 가지 전부 0. `challenge.js:2620` 에 "실제로 켜 본 적이 없는 기능" 이라는 메모가 있다 |

그래도 **지우지 않는다.** 이 저장소에서 "안 쓰는 것 같다" 는 판단이 두 번 틀렸다 —
`gate-0~4.png` 는 살아 있는 폴백이었고, `sprites/city` 10장은 1인칭 화면이 슬롯을 거치지 않고
직접 fetch 하고 있었다. 하드삭제 API 를 만들지 않는 것과 같은 이유로 파일도 하드삭제하지 않는다.
지우려면 별도 승인을 받는다.
