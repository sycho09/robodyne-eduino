# 프로젝트 파일 최적화 리포트

> 작업지시 ①~⑤ 실행 기록 · 2026-08-06
> 기준 커밋 `bd1f426` · 되돌림 태그 `pre-optimize` · 작업 브랜치 `optimize/cleanup`

---

## 결과 요약

| 항목 | Before | After | 변화 |
|---|---|---|---|
| **초기 로드 JS** | 1,526.59 kB | **53.33 kB** | **−96.5%** |
| 초기 로드 JS (gzip) | 462.40 kB | **20.61 kB** | −95.5% |
| CSS | 137.56 kB | 138.00 kB | +0.4 kB (로딩 인디케이터) |
| 500 kB 청크 경고 | ⚠️ 있음 | **없음** | 해소 |
| JS 청크 수 | 1 | 16 (진입 시 로드) | 코드 스플리팅 |
| `dist/` 전체 | 5.6 MB | **4.2 MB** | −1.4 MB |
| src JS | 10,180줄 / 44파일 | **7,200줄 / 41파일** | −2,980줄 |
| 씬 | 33개 | **23개** | −10 |
| npm dependencies | 4개 | **0개** | blockly·codemirror 계열 제거 |
| `node_modules` 중량 | +18 MB | — | blockly 15M · @codemirror 2.9M |

첫 화면까지 받는 양이 **1,665 kB → 193 kB**(gzip 492 kB → 50 kB)로 줄었다.
지시서의 "②로 초기 로딩 40%↓" 목표는 ①만으로 이미 초과 달성했고, ②가 나머지를 더 줄였다.

### Before (Phase 0 실측)
```
dist/index.html                1.31 kB │ gzip:   0.78 kB
dist/assets/index-*.css      137.56 kB │ gzip:  28.50 kB
dist/assets/index-*.js     1,526.59 kB │ gzip: 462.40 kB   ⚠️ >500kB 경고
(89 modules transformed)
```

### After
```
dist/index.html                1.31 kB │ gzip:  0.79 kB
dist/assets/index-*.css      138.00 kB │ gzip: 28.62 kB
dist/assets/index-*.js        53.33 kB │ gzip: 20.61 kB   ← 초기 로드는 여기까지
─── 이하 진입 시점에 로드 ───
sensorRoom  59.13 · lampGame  19.55 · buttonGame 15.24 · joystickGame 14.20
ultraGame   14.03 · bombGame  13.74 · flagGame   13.70 · finaleShow   13.08
potGame     12.63 · ledGame   12.41 · cdsGame    12.33 · buzzerGame    9.53
basics       8.66 · rgbGame    7.34 · celebrate   1.56 (공용)
(46 modules transformed)
```

---

## ① 데드코드 제거

`src/main.js` 엔트리에서 import 그래프를 완전 추적해 도달 불가 파일을 전수 판정했다.
단순 grep 이 아니라 그래프 기준이라, 지시서가 지목한 5개 외에 **18개를 더 찾았다**.

| 그룹 | 파일 | 판정 근거 |
|---|---|---|
| scenes | `chapter` `house` `hub` `kits` | import 0회 |
| scenes | `room` | `house`(데드)·`relay`(미연결)만 참조 |
| scenes | `dhtCoding` `dht11room` `dht11` `relay` | `main.js` 에 라우팅은 있으나 `ROOMS` 에 방이 없음 |
| scenes | `escapeRoom` | `scene:'game'` 을 쓰는 방이 커리큘럼에 없음 |
| editor | `blockEditor` `codeEditor` `interpreter` | `dhtCoding`·`room` 전용 |
| games | `index` `buzzer` `rgb` `keypad` `seg` | `escapeRoom` 전용 |
| content | `rooms` `sensors` | `house` 전용 / 참조 0회 |
| app·engine | `eddieSay` `quest` `style` | 위 씬들 전용 |

**핵심 발견**: `editor/`(Blockly·CodeMirror)를 import 하는 파일은 `dhtCoding.js` 와 `room.js`
둘뿐이었고 **둘 다 도달 불가 경로**였다. 즉 Blockly·CodeMirror 는 현행 커리큘럼에
한 번도 연결된 적이 없다 — 폐기된 PlayHouse/`room.js` 설계의 잔재다.
(`sensorRoom` 이론관의 "블록코딩"은 실제로는 `board` API 를 직접 호출하는 제어 대시보드다.)

이 23개 파일이 빠지면서 번들이 **1,526 → 277 kB** 로 줄고 500 kB 경고가 사라졌다.
파일은 커밋 `436a8dd` 에 기록돼 있고, 워킹 트리에서는 삭제했다(태그 `pre-optimize` 로도 복원 가능).

**남긴 것**: `joystickGame.js` `ultraGame.js` — `ROOMS` 에 방이 없어 실행되지 않지만
`sensorRoom` 설정과 자산이 갖춰져 있어 향후 부품 확장 시 방만 추가하면 붙는다.
`sensorRoom.js` 의 해당 설정에 `[보류]` 주석을 달았다.

---

## ② 코드 스플리팅

첫 화면까지의 경로(인트로 → 모드 → 상품 → 로그인 → 보드 연결 → 허브)만 즉시 로드하고,
게임 씬은 진입 시점에 받는다.

- **라우트 레벨** (`main.js`) — `basics` `sensorRoom` `lamp` `bomb` `final`
- **서브게임 레벨** (`sensorRoom.js`) — 미니게임 9종. 전시관에 들어섰다고 9개를 다 받을 이유가 없다

체감 지연을 없애려고 두 단계로 미리 받는다:
1. 허브 진입 시 `requestIdleCallback` 으로 게임 씬 전체 프리페치
2. 전시관 마운트 시 해당 미니게임만 프리페치 (EDDIE 가 체험관 입구까지 걷는 동안 끝난다)

`mountLazy()` 는 로딩이 220ms 를 넘길 때만 인디케이터를 띄워 깜빡임을 만들지 않고,
실패 시 `nav.back()` 으로 빈 화면에 갇히지 않게 한다.

---

## ③ 자산 파이프라인

- **preload 404 제거** — `main.js` preload 목록의 `basics-bg` 는 파일이 없어 매 실행 404 를 냈다.
  `preloadAssets` 는 폴백 없이 즉시 요청하는 경로라 실존 파일만 넣어야 한다.
- **고아 자산 209.8 KB 를 `art/unused/` 로 이동**(배포 제외) — `kits/` 4장, `intro-logo/` PNG 2장,
  `game-ultra-cover`, `room-flag-bg`
- **원본 PNG 커밋 차단** — `.gitignore` 에 `public/brand/**/*.png`. `public/` 에서 PNG 가 완전히 사라졌다
- **`png2webp.mjs` 를 보조 도구로 명시** — 표준은 `npm run assets`(리사이즈 + 원본 삭제)
- **README 갱신** — 폴더 구조가 `editor/`·`house.js`·`room.js`·`content/rooms.js` 를 현행으로
  설명하고 있었다(전부 제거된 파일). 실제 구조·자산 절차·확장된 시리얼 프로토콜로 맞췄다

> **판정 주의**: 코드가 `game-${id}-cover` 처럼 템플릿으로 경로를 만들기 때문에
> 단순 문자열 grep 은 살아있는 자산을 고아로 오판한다. `ROOMS`/`CHAPTERS` ID 와 대조해야 한다.

### 미제작 자산 9건 (버그 아님)
`basics-bg` `intro-bg` `stage-bomb-bg` `eddie-director` `eddie-eod` `eddie-mage`
`wiring-lamp` `sign-theory` `sign-play` — 전부 `onload`/`onerror` 가드가 걸린 선택 자산이라
없으면 CSS·캔버스로 폴백된다. 규칙에 맞는 파일을 넣으면 코드 수정 없이 나타난다.
용도·폴백 동작은 `README.md` 의 표 참조.

---

## ④ CSS 모듈화

`main.css` 는 도메인별로 설계된 게 아니라 **시간순으로 누적**된 스타일시트다.
"메인 완성도 패스"(L1434), "전역 완성도 폴리시"(L1611) 같은 뒤쪽 섹션이 앞쪽 규칙을
의도적으로 덮어쓴다 — **의미 단위로 재그룹핑하면 캐스케이드가 깨진다.**

그래서 재배치 없이 연속 줄 범위로만 잘라 `src/styles/parts/` 로 옮기고,
`main.css` 는 원래 순서 그대로의 `@import` 인덱스만 남겼다.

| 파트 | 원본 범위 | 내용 |
|---|---|---|
| `01-base.css` | 1–374 | 토큰·리셋·헤더·레이아웃·스테이지·연습 패널 |
| `02-components.css` | 375–1004 | 인트로 연출·게임 HUD·미션 룸·타이포·커리큘럼 헤더 |
| `03-onboarding.css` | 1005–1637 | 제품 표지·플랫폼 인트로·상품 메인·로그인·사용환경 준비 |
| `04-games.css` | 1638–2288 | basics·LED·sensorRoom·이론관·부저·RGB·CDS·EDDIE 리깅 |
| `05-device-final.css` | 2289–2487 | 기기 모드·터치 조작·CDS 게임·ch4 인터랙티브 쇼 |

**검증**: 분할 직후 빌드 산출 CSS 해시가 분할 전과 **동일**했다(`index-hvhkg06U.css`, 137.56 kB).
최종 CSS 가 바이트 단위로 같다는 뜻이다.

### 남은 잔여 CSS (후속 과제)
제거한 씬의 스타일 일부가 남아 있다(DHT · escapeRoom · kits · 부스형 games 블록).
**통째로 지우면 안 된다** — `.world-host` `.escape-scene` 처럼 현행 게임 씬 10곳이 쓰는
클래스가 같은 블록에 섞여 있다. 각 블록에 `[잔여]` 주석으로 표시해 뒀다.
정리하려면 선택자별로 확인하고 화면을 눈으로 봐야 한다. 예상 회수량은 100줄 남짓이라 우선순위는 낮다.

---

## ⑤ 출시 플래그

`UNLOCK_ALL` 보다 급한 문제가 있었다. **`⏭ 건너뛰기(테스트)` 버튼이 라이브 게임 씬 12개에
있고 게임 시작 시 무조건 노출**되어, 배포본에서 학생이 전 미니게임을 건너뛸 수 있었다.

`src/app/flags.js` 를 만들어 둘을 함께 관리한다.

| 플래그 | `npm run dev` | `npm run build` (Vercel) |
|---|---|---|
| `UNLOCK_ALL` — 무대 순차 잠금 해제 | ON | **OFF (순차 잠금)** |
| `DEV_TOOLS` — 건너뛰기 버튼 13곳 · `window.__dev` | ON | **OFF (번들에서 제거)** |

빌드 모드가 결정하므로 출시 때 코드를 고칠 필요가 없다.
검수용으로 켜려면 `VITE_UNLOCK_ALL` / `VITE_DEV_TOOLS` 환경변수를 쓴다 → `.env.example`.

> **주의**: Vite 가 `import.meta.env.*` 를 리터럴로 정적 치환하는 덕에 프로덕션에서 상수 `false` 로
> 접히고 해당 코드가 번들에서 사라진다. 이 성질을 지키려면 `=== 'true'` 비교를 **헬퍼 함수로
> 감싸면 안 된다** — 런타임 계산이 되어 상수 폴딩이 깨지고 죽은 코드가 그대로 남는다.
> (실제로 첫 구현에서 이 문제가 발생해 바로잡았다. `flags.js` 주석 참조.)

`setup.js` 의 `건너뛰기 ▶ (장비 준비 생략)` 은 보드 없이 플레이하기 위한 정식 기능이라 유지했다.

---

## 검증 방법

### 자동 (전부 통과)
| 검사 | 결과 |
|---|---|
| `npm run build` | 성공 · 500 kB 경고 없음 |
| 엔트리 도달성 — `src` 41개 `.js` 전부 도달 가능 | 고아 0 |
| 동적 import 14건 — 대상 파일·named export 존재 | 실패 0 |
| 정적 import 130건 — 경로 유효성 | 실패 0 |
| 자산 고아 (커리큘럼 ID 대조) | 고아 0 |
| CSS 분할 무결성 — 빌드 해시 비교 | 분할 전과 동일 |
| 프로덕션 번들에 `window.__dev` | 전 청크 0건 |
| 프로덕션 번들 스킵 버튼 노출 | 12/12 차단 |
| `VITE_DEV_TOOLS=true` 빌드 시 재활성화 | 확인 |

### 수동 (미완료 — 브라우저 필요)
자동 검사는 정적 무결성과 번들 내용까지만 보증한다. **아래는 사람이 확인해야 한다.**

```bash
npm run dev        # 개발 빌드
npm run preview    # 프로덕션 빌드 (플래그 OFF 상태)
```

전 경로: 플랫폼 인트로 → 모드 선택 → 상품 메인 → 로그인 → 보드 연결(건너뛰기) → 허브
→ ch1 `basics` → ch2 6종(`led` `buzzer` `rgb` `cds` `pot` `button`+청기백기)
→ ch3 `lamp` `bomb` → ch4 `final` → 컨페티 졸업

각 씬에서 확인할 것:
- 배경·커버 이미지가 뜨는가 (CSS 분할 후 스타일 회귀 여부)
- 뒤로가기 3종(화면 버튼 · ESC · 브라우저 back)이 한 단계씩 동작하는가
- 게임 씬 전환 시 로딩 인디케이터가 안 보이거나 짧게만 보이는가 (프리페치 동작)
- DevTools Console 에러 0건 / Network 404 0건
- **`npm run preview` 에서만**: 건너뛰기 버튼이 안 보이고, ch1 미클리어 시 ch2 가 잠겨 있고,
  `window.__dev` 가 `undefined` 인가

---

## 커밋

```
cf4b075  ⑤ 출시 플래그: 개발 편의 기능을 프로덕션 번들에서 제거
c7cf591  ③ 자산 파이프라인: 고아 자산 정리 · preload 404 제거 · 절차 문서화
dc3a707  ② 코드 스플리팅: 게임 씬 동적 import — 초기 청크 277 → 53 kB
b1e5ee4  ④ CSS 모듈화: main.css 2,487줄을 순서 보존 5파트로 분할
436a8dd  ① 데드코드 제거: 미도달 씬 23개 파일 (이 커밋에 원본 보존)
bd1f426  initial
```

Phase 별로 나눠 커밋했으므로 되돌릴 지점이 6개 있다.
제거한 코드를 다시 봐야 하면 `git show 436a8dd^:src/scenes/room.js` 처럼 꺼낼 수 있다.
