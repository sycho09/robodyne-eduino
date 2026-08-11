# 파일 최적화 리포트

> 작업지시 ①~⑤ 실행 기록 · 2026-08-06
> 기준 커밋 `bd1f426` · 되돌림 태그 `pre-optimize` · 작업 브랜치 `optimize/cleanup`
>
> ⚠️ 아래 수치는 **이 작업의 Before/After 기록**이다. 이후 이론관 시인성 패스·크리에이터 아케이드가
> 얹혀 현재 값은 다르다 — §현재 참조.

---

## 결과

| 항목 | Before | After | 변화 |
|---|---|---|---|
| **초기 로드 JS** | 1,526.59 kB | **53.33 kB** | **−96.5%** |
| 초기 로드 JS (gzip) | 462.40 kB | 20.61 kB | −95.5% |
| CSS | 137.56 kB | 138.00 kB | +0.4 kB (로딩 인디케이터) |
| 500 kB 청크 경고 | 있음 | **없음** | 해소 |
| JS 청크 | 1 | 16 | 코드 스플리팅 |
| `dist/` | 5.6 MB | 4.2 MB | −1.4 MB |
| src JS | 10,180줄 / 44파일 | 7,200줄 / 41파일 | −2,980줄 |
| 씬 | 33 | 23 | −10 |
| npm dependencies | 4 | **0** | blockly·codemirror 제거 |

첫 화면까지 받는 양 **1,665 → 193 kB**(gzip 492 → 50 kB).

---

## ① 데드코드 제거

`main.js` 에서 import 그래프를 추적해 도달 불가 파일을 전수 판정(grep 아님). 지시서가 지목한 5개 외 **18개를 더 발견**, 총 23개 제거.

| 그룹 | 파일 | 근거 |
|---|---|---|
| scenes | `chapter` `house` `hub` `kits` | import 0회 |
| scenes | `room` | 데드 파일만 참조 |
| scenes | `dhtCoding` `dht11room` `dht11` `relay` | 라우팅은 있으나 `ROOMS` 에 방 없음 |
| scenes | `escapeRoom` | `scene:'game'` 쓰는 방이 커리큘럼에 없음 |
| editor | `blockEditor` `codeEditor` `interpreter` | `dhtCoding`·`room` 전용 |
| games | `index` `buzzer` `rgb` `keypad` `seg` | `escapeRoom` 전용 |
| content | `rooms` `sensors` | `house` 전용 / 참조 0회 |
| app·engine | `eddieSay` `quest` `style` | 위 씬 전용 |

**핵심** — Blockly·CodeMirror 를 import 하는 건 `dhtCoding.js`·`room.js` 둘뿐이고 **둘 다 도달 불가**였다. 현행 커리큘럼에 한 번도 연결된 적 없는 폐기 설계(PlayHouse)의 잔재다. 번들 1,526 → 277 kB.

**남긴 것** — `joystickGame.js` `ultraGame.js`. 방이 없어 실행되진 않지만 설정·자산이 갖춰져 있어 부품 확장 시 방만 추가하면 붙는다(`sensorRoom.js` 에 `[보류]` 주석).

복원 — `git show 436a8dd^:src/scenes/room.js`

---

## ② 코드 스플리팅

첫 화면 경로(인트로→모드→상품→로그인→보드연결→허브)만 즉시 로드, 게임 씬은 진입 시 로드.

- 라우트 레벨(`main.js`) — `basics` `sensorRoom` `lamp` `bomb` `final`
- 서브게임 레벨(`sensorRoom.js`) — 미니게임 9종

체감 지연 제거 — ① 허브 진입 시 `requestIdleCallback` 으로 전체 프리페치 ② 전시관 마운트 시 해당 게임만 프리페치.
`mountLazy()` 는 220ms 초과 시에만 인디케이터를 띄우고, 실패 시 `nav.back()` 으로 빈 화면 방지.

---

## ③ 자산 파이프라인

- **preload 404 제거** — `basics-bg` 가 없는데 `preloadAssets` 에 있었다. 이 경로는 폴백 없이 즉시 요청하므로 실존 파일만 넣어야 한다
- 고아 자산 209.8 kB → `art/unused/`(배포 제외)
- `.gitignore` 에 `public/brand/**/*.png` — 원본 PNG 커밋 차단
- 표준 도구는 `npm run assets`, `png2webp.mjs` 는 보조
- README 폴더 구조를 현행으로 교정(제거된 파일을 설명하고 있었다)

> **판정 주의** — 코드가 `game-${id}-cover` 처럼 경로를 조립하므로 문자열 grep 은 살아있는 자산을 고아로 오판한다. `ROOMS`/`CHAPTERS` ID 와 대조할 것.

**미제작 자산 9건은 버그가 아니다** — `basics-bg` `intro-bg` `stage-bomb-bg` `eddie-director` `eddie-eod` `eddie-mage` `wiring-lamp` `sign-theory` `sign-play`. 전부 `onload`/`onerror` 가드가 걸린 선택 자산. 넣으면 코드 수정 없이 나타난다(용도·폴백은 README 표).

---

## ④ CSS 모듈화

`main.css` 는 도메인이 아니라 **시간순으로 누적**된 파일이다. 뒤쪽 섹션이 앞쪽을 의도적으로 덮으므로 **의미 단위로 재그룹핑하면 캐스케이드가 깨진다.**

재배치 없이 연속 줄 범위로만 잘라 `src/styles/parts/` 로 옮기고, `main.css` 는 원래 순서의 `@import` 인덱스만 남겼다.

| 파트 | 원본 범위 | 내용 |
|---|---|---|
| `01-base` | 1–374 | 토큰·리셋·헤더·레이아웃 |
| `02-components` | 375–1004 | 인트로 연출·게임 HUD·타이포·커리큘럼 헤더 |
| `03-onboarding` | 1005–1637 | 제품 표지·인트로·상품·로그인·사용환경 |
| `04-games` | 1638–2288 | basics·LED·sensorRoom·이론관·EDDIE 리깅 |
| `05-device-final` | 2289–2487 | 기기 모드·터치·CDS·ch4 쇼 |

**검증** — 분할 직후 빌드 CSS 해시가 분할 전과 동일(`index-hvhkg06U.css`, 137.56 kB). 바이트 단위로 같다.

**잔여 CSS(후속)** — 제거한 씬의 스타일 일부가 남아 있다(DHT·escapeRoom·kits·부스형 games). **통째로 지우면 안 된다** — `.world-host` `.escape-scene` 처럼 현행 씬 10곳이 쓰는 클래스가 같은 블록에 섞여 있다. `[잔여]` 주석 표시됨. 회수량 100줄 남짓이라 우선순위 낮음.

---

## ⑤ 출시 플래그

`UNLOCK_ALL` 보다 급한 문제가 있었다 — **`⏭ 건너뛰기(테스트)` 가 라이브 게임 씬 12개에 무조건 노출**되어 배포본에서 학생이 전 게임을 건너뛸 수 있었다.

`src/app/flags.js` 가 둘을 함께 관리한다.

| 플래그 | `npm run dev` | `npm run build` |
|---|---|---|
| `UNLOCK_ALL` 무대 잠금 해제 | ON | **OFF** |
| `DEV_TOOLS` 건너뛰기·`window.__dev` | ON | **OFF(번들에서 제거)** |

빌드 모드가 결정하므로 출시 때 코드를 안 고쳐도 된다. 검수용은 `VITE_UNLOCK_ALL`/`VITE_DEV_TOOLS`(→ `.env.example`).

> **주의** — Vite 가 `import.meta.env.*` 를 리터럴로 정적 치환해 프로덕션에서 상수 `false` 로 접히고 코드가 사라진다. 이 성질을 지키려면 `=== 'true'` 비교를 **헬퍼 함수로 감싸면 안 된다.** 런타임 계산이 되어 상수 폴딩이 깨진다(첫 구현에서 실제 발생).

`setup.js` 의 `건너뛰기 ▶ (장비 준비 생략)` 은 보드 없이 플레이하는 정식 기능이라 유지.

---

## 검증

**자동 — 전부 통과**

| 검사 | 결과 |
|---|---|
| `npm run build` | 성공 · 500 kB 경고 없음 |
| 엔트리 도달성 (`src` 41개 `.js`) | 고아 0 |
| 동적 import 14건 · 정적 import 130건 | 실패 0 |
| 자산 고아 (커리큘럼 ID 대조) | 0 |
| CSS 분할 무결성 (해시 비교) | 분할 전과 동일 |
| 프로덕션 번들 `window.__dev` | 0건 |
| 프로덕션 스킵 버튼 차단 | 12/12 |

**수동 — 미완료(브라우저 필요).** 자동 검사는 정적 무결성·번들 내용까지만 보증한다.

전 경로: 인트로 → 모드 → 상품 → 로그인 → 보드 연결 → 허브 → ch1 → ch2 6종 → ch3 2종 → ch4 → 졸업

확인 항목 — 배경·커버 로드 / 뒤로가기 3종(버튼·ESC·브라우저) / 게임 전환 시 인디케이터가 안 보이거나 짧게만 / Console 에러 0 · 404 0 / **`npm run preview` 에서만**: 건너뛰기 버튼 없음 · ch1 미클리어 시 ch2 잠김 · `window.__dev` 가 `undefined`

---

## 커밋

```
cf4b075  ⑤ 출시 플래그
c7cf591  ③ 자산 파이프라인
dc3a707  ② 코드 스플리팅 — 초기 청크 277 → 53 kB
b1e5ee4  ④ CSS 모듈화 — 2,487줄을 순서 보존 5파트로
436a8dd  ① 데드코드 제거 — 이 커밋에 원본 보존
bd1f426  initial
```

---

## 현재 (2026-08-11)

이 리포트 이후 **이론관 시인성 패스**(`icons.js` 47종 + `06-legibility.css`)와 **크리에이터 아케이드**(5단계, `07-maker.css` + 씬 4개)가 추가됐다.

| 항목 | 리포트 시점 | 현재 |
|---|---|---|
| 초기 로드 JS | 53.33 kB (gzip 20.61) | **64.25 kB** (gzip 25.05) |
| CSS | 138.00 kB | **158.74 kB** (gzip 32.81) |
| JS 청크 | 16 | 23 |
| 씬 | 23 | 27 |
| CSS 파트 | 5 | 7 (`06-legibility` `07-maker` 추가) |
| src JS | 7,200줄 / 41파일 | 9,405줄 / 52파일 |
| `dist/` | 4.2 MB | 4.3 MB |

**초기 JS 증가는 회귀가 아니다** — 초기 화면 5개가 `icons.js` 를 import 하면서 늘었다. 근거와 "쪼개면 안 되는 이유"는 [`THEORY-LEGIBILITY-PASS.md`](THEORY-LEGIBILITY-PASS.md) §6.

**여전히 유효한 것** — 데드코드 판정 기준, 코드 스플리팅 구조, `@import` 순서 규약, 플래그 설계, 자산 파이프라인 규칙.
