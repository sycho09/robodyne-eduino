# 결과물 스튜디오 개발 가이드 (인수인계서)

Eduino AI Lab — 브라우저 기반 AI 학습·추론 및 영상처리 체험 도구.
카메라·마이크 데이터는 서버 전송 없이 브라우저 내에서만 처리.

---

## 1. 실행

| 명령 | 동작 |
| --- | --- |
| `npm run test` | 테스트 (`node --test test/*.test.mjs`) |
| `npm run app` | Electron 개발 실행 |
| `npm run dist` | 포터블 `.exe` 빌드 → **4.2 확인 필수** |

---

## 2. 구조 개편 요약

| 항목 | 현재 상태 |
| --- | --- |
| 사이드바 | **제작 트랙 1그룹만** (이미지·음성·동작) — `stages/trainer/trainer.init.js` 의 `NAV_GROUPS` |
| 영상처리 체험 | 사이드바에서 제외 → `explore.html` → `stages/apps/*.html` 로 분리 |
| `FEATURES` | 영상처리 항목 잔존. `NAV_GROUPS` 미등록이라 렌더 안 됨 (삭제 아님) |
| 테마 | 다크 (`--bg:#0a0b12`) + 코랄 포인트 (`--accent:#ff5747`) |
| StepNav | 수집 → 학습 → 추론 진행 단계를 번호 칩으로 표시 |
| 레거시 제거 | 텍스트 분류 · 구 상상보드 html · 잔여 테스트 코드 |

---

## 3. 결과물 제출 (Submit)

기존 4단계(저장 → 탐색 → 첨부 → 제출) → **미션함(장바구니) 2단계**로 간소화.

### 3.1. 파일 구성

| 경로 | 역할 |
| --- | --- |
| `stages/submission/data/submit.store.js` | **Data** — `vision_locker` · `vision_submissions` localStorage 제어. 이미지는 `ImageStore` 에 위임 |
| `stages/core/data/imagestore.js` | **Data** — IndexedDB(`vision_media`) 구현. `window.ImageStore` |
| `stages/submission/submit.core.js` | **Core** — 트랙 판별(`trackKey`) · 예측 상태 조회(`predName`·`predPct`·`phase`) · 이미지 변환(`shrink`·`toPNG`) |
| `stages/submission/ui/submit.ui.js` | **UI** — 클릭·모달 렌더링. 결과물 종류 목록(`KINDS`) 보유 |
| `stages/submission/submit-integration.js` | **연결부** — 트레이너 화면에서 카메라·예측 라벨 수집 |
| `stages/studio/studio-common.js` | **브리지 + 유틸** — iframe → 부모 창 접근, 담기 흐름(`keeper`), 캡처(`html2canvas`). `window.StudioCommon` |

> ⚠️ **`submit.core.js` 는 DOM 의존.** 이름과 달리 순수 로직 아님.
> `querySelector('.nav-item.active')` · `getElementById('panel-direct')` · 예측 라벨 조회 · `createElement('canvas')` · `location.hash` 사용.
> → 부모 화면(트레이너) 전제. 단위 테스트 시 DOM 스텁 필요.

### 3.2. 저장소 스키마

| 키 | 위치 | 내용 |
| --- | --- | --- |
| `vision_locker` | localStorage | 제출 전 임시 미션함 (장바구니) |
| `vision_media` | IndexedDB | 결과물 이미지 원본. localStorage 5MB 한도 회피용 |
| `vision_submissions` | localStorage | 최종 제출 레코드. '내 현황'·게시판이 읽음 |

- 미션함 키 형식: `<종류>@<출처>` (예: `idea@rps`) — 같은 미션 내 중복 생성 방지
- `<출처>`: 이미지 트랙 = 미션 키, 음성·동작 트랙 = 트랙명 (`SubmitCore.originKey()`)
- localStorage 에는 이미지 대신 식별자 `imgId` 만 보관

### 3.3. 트랙별 미션함 분리

저장소는 1개, **읽을 때 트랙으로 필터**. 이미지 트랙 결과물이 음성 트랙에 섞이지 않게 하고 트랙별 개별 제출을 지원.

- 담을 때 — 각 아이템에 `track` 필드(`image`·`audio`·`pose`) 기록
- 읽을 때 — `Locker.list(track)` · `count(track)` · `clear(track)`
- 구버전 데이터 — `track` 없으면 키 뒷부분이 `audio`·`pose` 면 해당 트랙, 아니면 `image`

> ⚠️ **인자 생략 시 전체가 대상.** 특히 `clear()` 는 인자 없이 호출하면 미션함 전체 삭제.

- `clear()` 가 IndexedDB 이미지를 남기는 것은 **의도된 동작** — 제출 레코드가 같은 `imgId` 참조 중
- 잔여량 상한: 종류 4 × 트랙 3 = 12개 (`maker` 는 이미지 전용이라 실제 최대 10개)

### 3.4. 담기 경로

| 종류 | `Locker.add()` 호출 지점 | 트랙 |
| --- | --- | --- |
| `maker` | `stages/studio/maker.js` | 이미지 전용 |
| `capture` | `stages/submission/ui/submit.ui.js` | 전체 |
| `idea` · `character` | `stages/studio/studio-common.js` 의 `keeper()` | 전체 · **iframe 내부** |

상상보드·캐릭터 카드는 `stages/studio/studio.js` 가 만든 iframe 안에서 실행 → 자기 창에 `Locker` 없음.

```
idea-board.html / character-card.html   (iframe)
  └ SC.keeper({ kind, title, render, complete, meta … })
      └ SC.locker()  →  window.parent.Locker.add(kind, …)
          └ 부모 창 submit.store.js (vision_locker + ImageStore)
```

- 단독 창 실행 시 — `SC.locker()` 가 `null` → 담기 버튼(`#btnKeep`) `display:none` 처리. PNG 내려받기(`SC.savePng`)만 가능
- `VisionDialog` · 부모 DOM 조회(`parentDoc`·`parentPred`)도 동일 방식

---

## 4. 주의사항 · 알려진 버그

### 4.1. html2canvas (`@1.4.1` 고정)

- 텍스트 줄바꿈 등 DOM 조작은 **반드시 `onclone` 안에서** 복제본 대상으로 수행 — 원본 조작 시 화면 깜빡임
- 캡처 직전 `document.fonts.load()` 강제 로드 + 자간 보정 적용 — 미적용 시 자간 깨짐

### 4.2. Electron 빌드 누락 🔴 **미해결**

- `package.json` 의 `build.files` 에 `index.html`·`electron-main.js` 만 등록
- `platform/` · `stages/` · `models/` 누락 → `npm run dist` 결과물이 **빈 화면**
- 릴리스 전 `build.files` 배열 수정 필수

### 4.3. MoveNet 403 (Electron)

- 브라우저 정상 / 데스크톱(`app://-`) 에서 간혹 403 — Origin 민감
- 모델 로컬 번들링(`models/movenet/`) 전환 완료
- 잔여 과제: URL 라우팅 정리, 로드 실패 시 UI 멈춤 방지

---

## 5. 화면 계열과 스타일 구조

`stages/apps/` 에 두 계열 혼재. **CSS 수정 전 계열 확인 필수.**

| | 스테이지 계열 | 스튜디오 계열 |
| --- | --- | --- |
| 파일 | `face` · `detect` · `filter` · `skeleton` · `colortrack` | `idea-board` · `character-card` |
| CSS | `stages/styles/stage.css` 1개 (`:root` 자체 보유) | `stages/styles/tokens.css` + `studio.css` + HTML 인라인 `<style>` |
| 팔레트 | 블루 `--acc` `#3b86ff` | 에듀이노 레드 `--accent` `#ff5747` |
| body | `height:100vh; overflow:hidden` | `min-height:100vh` · flex column |
| 본문 | `body` 가 직접 flex column | `main` 이 2열 grid `minmax(300px,400px) 1fr` (1000px 이하 1열) |

> body 높이와 팔레트가 정반대 → **두 계열 통합 불가.** 의도된 분리.

### 5.1. 스튜디오 CSS 3층

```
tokens.css      :root 변수만
 └ studio.css    공통 셸 (header.top · main grid · .sec · input · button)
    └ 각 HTML <style>   결과물 전용 (#board / #card)
```

### 5.2. 건드리지 말 것

| 대상 | 이유 |
| --- | --- |
| `#board` · `#card` 를 외부 CSS 로 분리 | html2canvas 캡처 대상 디자인. 재사용처 없고 렌더링 리스크만 발생 |
| `tokens.css` 로드 순서 | `studio.css` 뒤에 오지만 CSS 변수는 계산 시점 해석 → 정상 |
| 두 HTML 포매팅 압축 | 1,000줄 초과는 Prettier 포맷(약 32자/줄) 탓. 압축 시 git diff 추적 불가 |

- 참고 — `idea-board.html` 총 1,065줄 중 최대 덩어리는 CSS(251줄)가 아니라 `<script>`(442줄)
