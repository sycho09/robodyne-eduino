# 🎮 Eduino AI : 미니게임천국 — 프로젝트 인계 & 백업 문서

> **목적**: 담당자 인계 / 백업용 전체 정리
> **작성 기준 커밋**: `d810d91`
> **최종 업데이트**: 2026-08-06
> **배포 URL**: https://eduinoai-playino.vercel.app

---

## 1. 프로젝트 한눈에

**센서를 미니게임으로 배우는 AIoT 학습 플랫폼.**
브라우저에서 실물 아두이노를 직접 제어하며 4개 무대(챕터) · 10개 미니게임을 클리어해 👑 '천국의 왕관'(졸업 100%)을 모으는 웹 게임.

- **프레임워크 없는 순수 JavaScript(ES Modules) SPA** — React/Vue/Svelte 미사용
- UI/레이아웃은 **CSS**, 게임 그래픽은 **HTML Canvas 2D**
- **Web Serial API**로 실물 아두이노를 브라우저에서 직접 제어(설치 불필요)
- 진척 상태는 **localStorage**(서버·DB 없음, 100% 클라이언트)
- 빌드 **Vite 5**, 배포 **Vercel**

### 기술 스택
| 구분 | 사용 |
|---|---|
| 언어 | JavaScript (Vanilla, ES Modules), HTML, CSS |
| 렌더링 | HTML Canvas 2D (게임), CSS (UI) |
| 빌드/툴 | Vite 5, sharp(이미지 최적화) |
| 코드 에디터 | CodeMirror 6 (`@codemirror/lang-cpp`, one-dark) |
| 블록 코딩 | Blockly 11 |
| 하드웨어 | Web Serial API + 웹 플래싱(Intel HEX / STK500) |
| 폰트 | Google Fonts — Space Grotesk, Orbitron |
| 배포 | Vercel (GitHub 브랜치 연동) |
| 상태저장 | localStorage |

### 규모
- JS 약 **10,180줄** / CSS(`main.css`) 약 **2,490줄**
- 씬 33개 / `public/brand` 자산 61개

---

## 2. 실행 · 빌드 · 배포

```bash
npm install        # 의존성 설치
npm run dev        # 개발 서버 (Vite, http://localhost:5173)
npm run build      # 프로덕션 빌드 → dist/
npm run preview    # 빌드 결과 미리보기
npm run assets     # 이미지 최적화(scripts/optimize-assets.mjs)
```

- **하드웨어 연동은 HTTPS 또는 localhost + Chrome/Edge**(Web Serial 지원 브라우저)에서만 동작. 보드 없이도 화면(슬라이더·버튼)으로 전 게임 플레이 가능.
- 배포: `main`/작업 브랜치를 Vercel이 자동 빌드.

### Git 브랜치
| 브랜치 | 용도 |
|---|---|
| `claude/admiring-ptolemy-95vqog` | 개발 작업 브랜치 |
| `claude/compassionate-johnson-1md54` | 프로덕션(배포) 동기화 브랜치 |

> 두 브랜치는 현재 동일 커밋으로 동기화 유지 중.

---

## 3. 디렉터리 구조 (기능별)

```
Playino/
├─ index.html              # 단일 엔트리 (#app 컨테이너, main.css/main.js 로드)
├─ package.json            # 의존성/스크립트
├─ vite.config.js          # Vite 설정
├─ scripts/                # 빌드 외 유틸
│   ├─ optimize-assets.mjs #   이미지 일괄 최적화
│   └─ png2webp.mjs        #   PNG→WebP 변환
├─ public/brand/           # 정적 자산(이미지 61개) — 아래 §6
│   └─ eddie/              #   에디 캐릭터 컷
└─ src/
    ├─ main.js             # ★ 라우팅 진입점 (씬 전환 스위치)
    ├─ styles/main.css     # ★ 전역 스타일(단일 파일)
    ├─ assets/eddie.svg    # 에디 벡터
    │
    ├─ app/                # 공용 시스템 모듈
    │   ├─ board.js        #   ★ 보드 컨트롤러(고수준 API: digital/pwm/tone/analogRead/neoFill…)
    │   ├─ nav.js          #   ★ 씬 스택 라우터(push/back/start)
    │   ├─ progress.js     #   ★ 진척 저장(localStorage: mark/isCleared)
    │   ├─ sfx.js          #   효과음(WebAudio)
    │   ├─ bgm.js          #   배경음/덕킹
    │   ├─ device.js       #   기기 모드/권장 설정
    │   ├─ eddieRig.js     #   에디 캐릭터 리깅/애니메이션
    │   ├─ eddieSay.js     #   에디 말풍선
    │   ├─ curriculumHeader.js # 상단 진척 헤더
    │   ├─ quest.js        #   퀘스트/미션 헬퍼
    │   └─ monitor.js      #   시리얼 모니터 패널
    │
    ├─ content/            # 데이터(단일 공급원)
    │   ├─ curriculum.js   #   ★ 챕터/방/진척 집계 규칙(SSOT)
    │   ├─ rooms.js        #   방 메타(레거시/보조)
    │   └─ sensors.js      #   센서 정의
    │
    ├─ serial/             # 하드웨어 통신
    │   ├─ webserial.js    #   Web Serial 포트 연결/입출력
    │   ├─ protocol.js     #   ★ 커스텀 시리얼 프로토콜(명령 인코딩)
    │   ├─ flasher.js      #   웹 플래싱(STK500)
    │   ├─ intelhex.js     #   Intel HEX 파서
    │   └─ provisioning.js #   펌웨어 굽기 플로우
    │
    ├─ engine/             # 게임 엔진
    │   ├─ topdown.js      #   탑다운 월드(부스 이동형 씬)
    │   └─ style.js        #   엔진 스타일 상수
    │
    ├─ editor/             # 코드/블록 에디터
    │   ├─ blockEditor.js  #   Blockly 래퍼
    │   ├─ codeEditor.js   #   CodeMirror 래퍼(C++)
    │   └─ interpreter.js  #   블록→동작 해석
    │
    ├─ games/              # 부스형 장치 미니게임(엔진용)
    │   ├─ index.js  buzzer.js  rgb.js  keypad.js  seg.js
    │
    └─ scenes/             # ★ 화면 33개 (아래 §4)
```

---

## 4. 씬(scenes) 분류 — 활성 / 레거시

### 🟢 활성 씬 (현재 플로우에서 사용)

**온보딩 (앱 진입 순서)**
`platformIntro.js`(로고 인트로) → `modeSelect.js`(기기 모드) → `productMain.js`(상품 메인) → `login.js` → `setup.js`(보드 연결) → 허브

**내비게이션 허브**
- `hubSelect.js` — 스테이지(챕터) 선택 캐러셀
- `chapterSelect.js` — 챕터 내 미니게임 선택 캐러셀

**학습/게임**
- `basics.js` — ch1 피지컬 코딩 기초(이론+퀴즈)
- `sensorRoom.js` — ch2 센서 부스(탑다운) → 개별 게임 진입 허브
- `ledGame.js` `buzzerGame.js` `rgbGame.js` `cdsGame.js` `potGame.js` `buttonGame.js` `flagGame.js` — ch2 개별 센서 게임(`sensorRoom`이 로드)
- `lampGame.js` — ch3 빛 마법 램프(조도+RGB)
- `bombGame.js` — ch3 폭탄 해체반(가변저항+LED)
- `finaleShow.js` — ch4 나만의 인터랙티브 쇼(종합 캡스톤) ← **최신 구현**

**공용 연출**
- `celebrate.js` — 방 클리어 축하 모달(18곳에서 사용)
- `finale.js` — 전체 100% 완료 컨페티(졸업, `finaleShow`가 호출)

### 🟡 보조/레거시 씬 (import는 되나 커리큘럼 미연결)
- `joystickGame.js` `ultraGame.js` — `sensorRoom`에 import돼 있으나 현재 커리큘럼(ROOMS)에 방 없음 → 정규 플로우에서 미노출
- `dhtCoding.js` `dht11room.js` `dht11.js` `relay.js` — `main.js`에 라우팅 케이스는 있으나 이를 가리키는 방이 커리큘럼에 없음(DHT/릴레이 확장 잔재)
- `escapeRoom.js` — `scene:'game'` 방의 기본 처리기(현재 해당 방 없음)

### 🔴 미사용(데드) 씬 — 정리 후보
- `chapter.js` `house.js` `hub.js` `kits.js` — 어디서도 import 안 됨(0 refs). **삭제/아카이브 대상**
- `room.js` — 레거시 내부 참조만

> ⚠️ 인계 팁: 위 🟡🔴 파일은 **건드리지 말고 그대로 두거나** 별도 커밋으로 정리. 활성 플로우와 무관.

---

## 5. 전체 기능 진척도 (커리큘럼)

**진행 규칙**: `progress.mark(id)`로 클리어 저장 → `curriculum.js`가 무대/전체 집계.
**테스트 플래그**: `curriculum.js`의 `UNLOCK_ALL = true` (출시 시 `false`로 바꾸면 순차 잠금).

| 무대(챕터) | 코드ID | 미니게임 | 방ID | 학습 개념 | 부품 | 상태 |
|---|---|---|---|---|---|---|
| 🎪 **스타트 게이트** | ch1 | 피지컬 코딩 기초 | `basics` | 피지컬 컴퓨팅 개념 | — | ✅ 구현 |
| 🕹️ **비기너 아케이드** | ch2 | 반짝반짝 라이트쇼 | `led` | 디지털 출력·타이밍 | LED | ✅ 구현 |
| | ch2 | 멜로디 연주단 | `buzzer` | tone·주파수 | 부저 | ✅ 구현 |
| | ch2 | 무지개 물감놀이 | `rgb` | PWM 색 혼합 | RGB LED | ✅ 구현 |
| | ch2 | 손그림자 마술 | `cds` | 아날로그 입력(빛) | 조도센서 | ✅ 구현 |
| | ch2 | 볼륨 다이얼쇼 | `pot` | 아날로그 입력 | 가변저항 | ✅ 구현 |
| | ch2 | 두더지 & 청기백기 | `button` | 디지털 입력(버튼2) | 택트2 | ✅ 구현 |
| 🎯 **마스터 아케이드** | ch3 | 빛 마법 램프 | `lamp` | 조도+RGB(입력→출력) | 조도+RGB | ✅ 구현 |
| | ch3 | 폭탄 해체반 | `bomb` | 가변저항+LED(정밀) | 가변저항+LED | ✅ 구현 |
| 🏆 **챔피언 홀** | ch4 | 나만의 인터랙티브 쇼 | `final` | 종합(다이얼·RGB·부저·버튼) | 4종 종합 | ✅ 구현 |
| (사전) | — | 보드 연결 | `setup` | 사용환경 준비 | — | ✅ 구현 |

### 📊 구현 진척: **10 / 10 미니게임 = 100% 구현 완료** 🎉
- ch1 (1/1) ✅ · ch2 (6/6) ✅ · ch3 (2/2) ✅ · ch4 (1/1) ✅
- 온보딩(인트로→모드→상품→로그인→보드연결) ✅
- 전체 100% 클리어 시 컨페티 졸업 연출(`finale.js`) 연결 ✅

### ch4 캡스톤 구조 (`finaleShow.js`) — 3막
1. 🌈 **컬러 스테이지** — 다이얼(A0)→색, 목표 무대색 맞춰 유지 + 네오픽셀(D6) 출력
2. 🎵 **멜로디 무대** — 부저(D5) Simon 따라치기(길이 5 도달=성공, 실수 2회 허용)
3. 🔘 **피날레 큐** — 마커가 존에 올 때 버튼(D4)/SPACE 타이밍 누르기

각 막 80%↑ 통과 → 👑 천국의 왕관 → (전체 완료 시) 컨페티 피날레.

### 남은 폴리시/백로그 (기능 아님, 다듬기)
- [ ] 흰색 모달 카드(prep/시작/축하) 다크 톤 전환 여부 — **현재 흰색 유지 결정됨**
- [ ] 디렉터 에디 이미지(`eddie-director.webp`) 추가 시 ch4 무대 좌하단 히어로 자동 등장(현재 미제작)
- [ ] `UNLOCK_ALL=false` 전환(출시용 순차 잠금)
- [ ] 데드 씬(`chapter/house/hub/kits.js`) 정리
- [ ] ch4 난이도 밸런스(2막 Simon 속도 / 3막 큐 존 폭) 실사용 튜닝

---

## 6. 정적 자산 규칙 (`public/brand/`)

이미지는 코드가 **파일명 규칙**으로 자동 로드(없으면 CSS 폴백). 전부 **WebP**로 최적화(장당 ≤ ~100KB 목표).

| 용도 | 파일명 규칙 | 크기 |
|---|---|---|
| 게임 커버(카러셀 포스터) | `game-{방id}-cover.webp` | 840×1200 (7:10) |
| 게임 플레이 배경 | `stage-{방id}-bg.webp` | 1920×1080 (16:9) |
| 챕터 셀렉트 배경 | `stage-{챕터id}-bg.webp` | 1920×1080 |
| 허브 배경 | `hub-bg.webp` | 1920×1080 |
| 에디 컷 | `eddie/eddie-*.webp` | 투명 |
| 디렉터 에디(ch4, 선택) | `eddie-director.webp` | 투명 세로 |

- 변환 도구: `scripts/png2webp.mjs`, `scripts/optimize-assets.mjs` (sharp 기반)
- 원본 PNG는 커밋하지 말 것(용량↑) — WebP만 유지.

---

## 7. 핵심 시스템 요약 (수정 시 참고)

| 시스템 | 파일 | 요점 |
|---|---|---|
| **라우팅** | `src/main.js`, `app/nav.js` | `nav.push(sceneFn)`로 스택 전환, `nav.back()`로 복귀. `enterRoom(roomId)` 스위치가 방→씬 매핑 |
| **커리큘럼** | `content/curriculum.js` | 챕터/방/보상/잠금/집계의 **단일 공급원**. 새 게임 추가 시 여기 먼저 |
| **진척** | `app/progress.js` | `progress.mark(id)` / `progress.isCleared(id)` (localStorage) |
| **보드 제어** | `app/board.js` + `serial/` | `board.connect()`, `analogRead(pin)`, `digital()`, `tone()`, `neoFill()` 등 고수준 API. 게임은 이 API만 사용 |
| **사운드** | `app/sfx.js`, `app/bgm.js` | `sfx.ok()/no()/note()`, `bgm.setDuck()` |
| **축하/졸업** | `scenes/celebrate.js`, `scenes/finale.js` | 방 클리어 모달 / 전체 완료 컨페티 |

### 새 미니게임 추가 순서 (레시피)
1. `content/curriculum.js` — `ROOMS`에 `R(...)` 추가, 챕터 `rooms` 배열에 방ID, `scene:'키'` 지정
2. `scenes/새게임.js` — `showXxx(root, { onExit })` 형태로 구현(기존 `bombGame.js`/`finaleShow.js` 패턴 참고)
3. `main.js` — import + `enterRoom` 스위치에 `case '방id': showXxx(app(), { onExit: back }); break;`
4. 클리어 시 `progress.mark('방id')` + `celebrateRoom(...)` 호출
5. 자산: `game-방id-cover.webp`, `stage-방id-bg.webp` 추가

---

## 8. 인계 체크리스트

- [x] 소스 전체 Git 백업 (`claude/admiring-ptolemy-95vqog`, `…johnson-1md54`)
- [x] 10/10 미니게임 구현 완료
- [x] 이미지 자산 WebP 최적화
- [x] 본 인계 문서(`HANDOFF.md`)
- [ ] 인수인계 후: Vercel 프로젝트 권한 이관
- [ ] 인수인계 후: `UNLOCK_ALL` 출시 설정 결정

---

*문의/맥락: 이 문서는 커밋 `d810d91` 기준. 최신 상태는 `git log`와 `content/curriculum.js`를 확인하세요.*

> 배포 파이프라인: `main` → Vercel Production 자동 배포 (검증 f71877c)
