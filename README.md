# 🎮 Eduino AI : 미니게임천국

> 센서를 미니게임으로 배우는 AIoT 학습 플랫폼. 브라우저에서 실물 아두이노를 직접 제어하며
> 4개 무대 · 10개 미니게임을 클리어해 👑 '천국의 왕관'(졸업 100%)을 모은다.

**프레임워크 없는 순수 JavaScript(ES Modules) SPA** — 빌드 Vite 5, 배포 Vercel, 상태는 localStorage.

- 📘 **전체 인계 문서: [`HANDOFF.md`](HANDOFF.md)** — 커리큘럼·씬 구성·시스템 요약은 여기가 기준
- 🔧 배선/하드웨어: [`docs/HARDWARE.md`](docs/HARDWARE.md)
- 👁 이론관 시인성 패스: [`docs/THEORY-LEGIBILITY-PASS.md`](docs/THEORY-LEGIBILITY-PASS.md) — 원거리 타이포 2티어·SVG 아이콘·대비 기준
- 📉 최적화 작업 기록: [`docs/OPTIMIZE-REPORT.md`](docs/OPTIMIZE-REPORT.md)

## 실행 방법

```bash
npm install
npm run dev        # 개발 서버 http://localhost:5173
npm run build      # 프로덕션 빌드 → dist/
npm run preview    # 빌드 결과 미리보기
npm run assets     # 이미지 최적화 (아래 §자산 파이프라인)
```

**하드웨어 연동은 HTTPS 또는 localhost + Chrome/Edge**(Web Serial 지원 브라우저)에서만 동작한다.
보드 없이도 화면 슬라이더·버튼으로 전 게임을 플레이할 수 있다.

### 개발용 플래그

개발 서버에서는 무대 순차 잠금이 해제되고 게임마다 `⏭ 건너뛰기(테스트)` 버튼이 나온다.
**프로덕션 빌드에서는 둘 다 자동으로 꺼진다.** 배포본에서 임시로 켜려면 환경변수를 쓴다 —
[`.env.example`](.env.example)과 [`src/app/flags.js`](src/app/flags.js) 참조.

## 폴더 구조

```
├── index.html              # 단일 엔트리 (#app 컨테이너)
├── scripts/                # 자산 최적화 도구
├── public/
│   ├── brand/              # 게임 이미지(전부 WebP) — 아래 §자산 파이프라인
│   └── firmware/           # 펌웨어 산출물 + 참조 .ino
├── art/                    # 원본 아트 보관(배포 대상 아님)
│   └── unused/             #   현재 미사용 자산
├── legacy/                 # 보관용 아카이브(빌드 제외) — legacy/README.md 참조
└── src/
    ├── main.js             # ★ 라우팅 진입점 — 씬 전환 + 게임 씬 동적 import
    ├── styles/
    │   ├── main.css        #   @import 인덱스 (순서 = 캐스케이드 순서, 변경 금지)
    │   └── parts/          #   01-base · 02-components · 03-onboarding · 04-games · 05-device-final
    ├── app/                # 공용 시스템 — board · nav · progress · flags · sfx · bgm · device …
    ├── content/curriculum.js  # ★ 챕터/방/진척 집계의 단일 공급원
    ├── serial/             # Web Serial 연결 · 프로토콜 · 웹 플래싱(STK500)
    ├── engine/topdown.js   # 탑다운 월드(전시관 이동)
    └── scenes/             # 화면 23개 — 온보딩 · 허브 · 미니게임
```

> 새 미니게임 추가 절차는 [`HANDOFF.md`](HANDOFF.md) §7의 레시피를 따른다.

## 자산 파이프라인

이미지는 코드가 **파일명 규칙**으로 자동 로드한다(없으면 CSS/캔버스 폴백). 전부 **WebP**로 최적화한다.

| 용도 | 파일명 규칙 | 크기 |
|---|---|---|
| 게임 커버(캐러셀 포스터) | `game-{방id}-cover.webp` | 840×1200 (7:10) |
| 게임 플레이 배경 | `stage-{방id}-bg.webp` | 1920×1080 |
| 챕터 셀렉트 배경 | `stage-{챕터id}-bg.webp` | 1920×1080 |
| 허브 배경 | `hub-bg.webp` | 1920×1080 |
| 에디 컷 | `eddie/eddie-*.webp` | 투명 |

### 표준 작업 절차

```bash
# 1. Blender 등에서 렌더한 PNG 를 public/brand/ 에 그냥 넣는다
# 2. 변환 — 리사이즈 + WebP 변환 후 원본 PNG 는 삭제된다
npm run assets
```

`scripts/optimize-assets.mjs`(sharp 기반)가 표준 도구다. 파일명으로 규칙을 판단한다 —
`*-bg`는 최대 2048px, `eddie-*`는 1024px(품질 86), 나머지는 1280px, 품질 82, 알파는 자동 보존.

- **원본 PNG 는 커밋하지 않는다.** `.gitignore` 가 `public/brand/**/*.png` 를 막고 있고,
  `npm run assets` 가 변환 후 원본을 지우므로 정상 흐름에서는 남을 일이 없다.
- 보관해야 할 원본 아트는 `art/` 에 둔다(빌드·배포 대상이 아니다).
- `scripts/png2webp.mjs` 는 리사이즈 없이 변환만 하는 보조 도구다. 일반 작업엔 `npm run assets` 를 쓴다.

### 미제작 자산 (넣으면 자동 반영됨)

아래는 코드가 찾지만 아직 없는 파일이다. **버그가 아니다** — 각 참조는 `onload`/`onerror` 가드가
걸려 있어 없으면 CSS·캔버스 폴백으로 렌더된다. 규칙에 맞는 파일을 넣으면 코드 수정 없이 나타난다.

| 파일 | 쓰이는 곳 | 없을 때 |
|---|---|---|
| `basics-bg.webp` | 피지컬 코딩 기초 배경 | CSS 그라디언트 |
| `intro-bg.webp` | 플랫폼 인트로 배경 | CSS 그라디언트 |
| `stage-bomb-bg.webp` | 폭탄 해체반 배경 | 캔버스 폴백 |
| `eddie-director.webp` | ch4 무대 좌하단 디렉터 에디 | `eddie/eddie-hero.webp` |
| `eddie-eod.webp` | 폭탄 해체반 에디 | `eddie/eddie-hero.webp` |
| `eddie-mage.webp` | 빛 마법 램프 에디 | `eddie/eddie-hero.webp` |
| `wiring-lamp.webp` | 빛 마법 램프 결선 안내 | 안내 이미지 숨김 |
| `sign-theory.webp` `sign-play.webp` | 전시관 이론관/체험관 간판 | 캔버스 마퀴 |

## 시리얼 프로토콜

라인 단위 ASCII, `\n` 종결, **115200 baud**. 구현은 [`src/serial/protocol.js`](src/serial/protocol.js),
게임은 이 위에 얹힌 고수준 API([`src/app/board.js`](src/app/board.js))만 쓴다.

| 방향 | 명령 | 의미 |
|---|---|---|
| H→B | `PING` | 핸드셰이크 |
| H→B | `L<pin>:<0\|1>` | digitalWrite (예 `L2:1`) |
| H→B | `P<pin>:<0-255>` | analogWrite(PWM) |
| H→B | `T<pin>:<freq>,<ms>` | tone(부저) |
| H→B | `A<ch>` | analogRead (A0~) |
| H→B | `R<pin>` | digitalRead |
| H→B | `U<trig>:<echo>` | 초음파 거리 측정 |
| H→B | `N<pin>:<i>,<r>,<g>,<b>` / `NA<pin>:<r>,<g>,<b>` / `NS<pin>` | NeoPixel 개별/전체/출력 |
| B→H | `READY` / `PLAYHOUSE v<n>` / `OK` / `ERR:<msg>` | 부팅·식별·ACK·오류 |

현재 펌웨어 계약 버전: `FIRMWARE_VERSION = 5`.
핸드셰이크는 연결 직후 `PING` → 1.5초 내 `PLAYHOUSE v*` 수신 시 통과.

### 펌웨어: IDE 없이 브라우저에서 굽기 (Web Serial · STK500)

보드에 펌웨어가 없으면 보드 준비 모달의 **[웹으로 펌웨어 굽기]** 가
`public/firmware/playhouse-uno.hex` 를 STK500v1 부트로더 프로토콜로 직접 굽는다(Arduino IDE 불필요).
**최초 1회만** 굽고 이후엔 명령만 주고받는다.

```bash
# .hex 재빌드
avr-gcc -mmcu=atmega328p -DF_CPU=16000000UL -Os -o fw.elf public/firmware/playhouse-uno.c
avr-objcopy -O ihex -R .eeprom fw.elf public/firmware/playhouse-uno.hex
```

구현: [`src/serial/flasher.js`](src/serial/flasher.js)(STK500v1) + [`src/serial/intelhex.js`](src/serial/intelhex.js)(HEX 파서).

## 배포

Vercel이 `main` 브랜치를 자동 빌드한다(`vercel.json`, `framework: vite`).
프로덕션 빌드이므로 개발용 플래그는 자동으로 꺼진 상태로 배포된다.
