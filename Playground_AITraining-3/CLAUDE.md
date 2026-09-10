@.agents/AGENTS.md

## 작업 범위 (공통 원칙)
**이미 배포된 사이트다.** 지시받은 범위 밖의 파일은 열지도 고치지도 말 것.
탐색을 최소화해 토큰을 아낀다 — 아래 표에서 해당 범위의 파일만 읽는다.

| 작업 주제 | 수정 가능 파일 | 세부 규칙 |
| --- | --- | --- |
| 플랫폼 메인 (진입 2개) | `platform/index.html` | 아래 참고 |
| 일반모드 (사전진단 + 4단계 대시보드) | `modules/` 내 지정 파일 | 아래 참고 |
| 비전 콘솔 (A·C 확정) | `console/{shared.js,map.html,cards.html}` · 입구·스텁 | 아래 참고 |

## 플랫폼 메인 (`platform/index.html`)
히어로 **한 장으로 끝난다.** 스크롤되는 하위 섹션도, 푸터도, 상단 메뉴도 없다.

- 헤더: 로고 + `AIoT 교육플랫폼` 캡슐만. **네비 메뉴 추가 금지**
- 진입 루트는 **정확히 2개**. 그 외 버튼(무료 샘플 체험 등) 추가 금지
  - `일반 사용자모드` → `/modules/index.html` · `수업전용 콘솔모드` → `/entry.html`
  - 두 버튼은 `.hero-routes`(2열 그리드) + `.btn-route`(`min-height:70px`)로 **높이·너비가 항상 같다.** 라벨 길이를 바꿔도 이 규칙을 깨지 말 것
  - 버튼 안에 배지·이모지를 넣지 않는다 (BETA 칩 제거됨). 명칭만으로 구분
- 히어로 좌측은 `pill → h1 → lead → 진입 버튼 → 이런 분께` 5줄이 전부다.
  체크 배지 줄(`.trust`)은 삭제했으니 되살리지 말 것
- `.hero-band` 높이는 `min-height: min(calc(100vh - 128px), 760px)`.
  `min-height` 가 `max-height` 를 이기므로 둘로 쪼개면 1080p 이상에서 위아래가 텅 빈다
- `#features`·`#modules`·`#plans`·`#paths`·`#teach`·`#faq` 앵커는 **없다.**
  다른 페이지에서 "코스 목록"은 `/modules/index.html`, "도입 문의"는 메일 링크로 잇는다
- `platform/sample.html` 은 남겨 두되 메인에서 링크하지 않는다 (URL 유지)

## 일반모드 (`modules/`)
`일반 사용자모드` → `/modules/index.html`(사전진단) → 사이드바로 코스 이동.

| 파일 | 역할 |
| --- | --- |
| `modules/index.html` | 진입 화면 · 수집 스텁으로 6개 `course-config.js` 를 읽는다 |
| `modules/shared/precheck-hub.js` · `.css` | 사전진단 30문항 흐름 · 4단계 결과 |
| `modules/shared/course-preview.js` | 동작 미리보기 애니메이션 **단일 소스** |
| `modules/shared/course-dashboard.js` · `.css` | 4단계 셸 · 사이드바 |
| `modules/<course>/course-config.js` | 코스 콘텐츠 + `precheck` 문항 **단일 소스** |

- **사전진단은 `/modules/index.html` 한 곳뿐이다.** 코스별 개별 사전진단은 없앴고,
  4단계의 1단계는 **`학습 미리보기`** (동작 미리보기 데모)다
- 문항은 `course-config.js` 의 `precheck` 가 원본이다. **허브로 복붙 금지** —
  `precheck-hub.js` 의 `PICK` 이 코스마다 5문항씩 골라 30문항을 만든다
  - `PICK` 규칙: ① 그 코스의 모든 `concept` 을 최소 1회 덮는다 ② 정답 O/X 가 전체 15:15
  - `precheck` 배열 순서를 바꾸면 `PICK` 인덱스도 함께 고칠 것
- 등급 컷(30점 만점): 초보 `0–9` · 중급 `10–17` · 상급 `18–24` · 전문가 `25–30` (`TIERS`)
- 동작 미리보기는 `course-preview.js` 하나를 `platform/course.html` 과 1단계 패널이 **같이 쓴다.** 어느 한쪽에 복사하지 말 것
- 진행 상황·답안은 **어디에도 저장하지 않는다** (localStorage 금지). 화면에만 남는다
- 사이드바 마크업은 `CourseDashboard.precheckNavGroup()` / `.courseNavGroup()` 로만 만든다
- `modules/index.html` 의 본문은 `<main>` 이 아니라 `<div class="dash-main">` —
  `shared/base.css` 의 `main { max-width:1140px; margin:0 auto }` 가 그리드 칸을 좁힌다

## 비전 콘솔 작업 규칙
플랫폼 홈 → "비전 콘솔" 로 시작하는 진입 흐름. 허브 UI는 A(맵)·C(카드) 2안 체제.

### 파일 구성
제안 코드는 전부 `console/` 안에 있다. 루트에는 입구 1개와 스텁 3개만 둔다.

| 파일 | 역할 | 상태 |
| --- | --- | --- |
| `console/shared.js` | 공통 셸: 항목 데이터(`TRACKS`)·인트로·HUD·세션·사운드·진행·CSS | 단일 소스 |
| `console/map.html` | A · 스테이지 맵 | **운영** |
| `console/cards.html` | C · 카드 캐러셀 · 완료표시: 체크배지(✓) + 도트진도 | **운영** |
| `entry.html` | 진입 선택 · 체험/수업개설/수업참여 | 공통 |
| `studio.html` | 라우터 스텁 → A/C로 이동 · **삭제 금지** | 공통 |
| `explore.html` / `create.html` | 라우터 스텁 + 해시 | 공통 |

- **절대 수정 금지**: `index.html`, `platform/`, `stages/*.html`, `stages/session.js`·`board.js`·`cert.js`·`admin.js`·`icons.js`
  (콘솔 작업 기준. 플랫폼 메인·일반모드 작업일 때만 위 표의 파일을 연다)
- **URL 전부 유지** (외부 링크·북마크)

### 고칠 때 어디를 보는가
| 대상 | 위치 | 규칙 |
| --- | --- | --- |
| 항목명·설명·배지·난이도·보상·포스터·색 | `shared.js` `TRACKS` | 단일 소스 · 각 HTML 복붙 금지 |
| HUD·인트로·사운드·진행·파생 지표 | `shared.js` | `VStudio.*` 호출만 |
| 레이아웃·연출·완료표시 | 해당 안 HTML | 한 파일만 |

### 진행 상태
- 기록 지점: `VStudio.launch()` 한 곳 → `localStorage.vision_visited` 에 `{ key: { n, at, first } }` 저장 · `stages/` 무수정
- XP·레벨·학습일·티어·추천항목: `VStudio.stats()` 에서 파생 · 지어낸 데이터 금지
- `stars`·`mins`·`reward`: 설계값 (측정값 아님)

### 인트로 정책
콘솔 진입 시마다 재생 · 콘솔 내부 이동 시 재생 금지

| 상황 | 인트로 |
| --- | --- |
| 플랫폼 홈 → 비전 콘솔 | **매번 재생** |
| `entry.html` 새로고침 | 재생 |
| entry → 허브 / 허브 안 이동 / 안 전환 | 없음 |
| 허브 URL 직접 진입 (북마크) | 세션당 1회 |

- 정책: `entry.html` 만 `data-intro="always"` · 나머지는 기본 (세션당 1회) · 판단: `head` 시점에 완료
- 내부 이동 표시: `sessionStorage.vision_skip_intro` (1회용) · HUD `← 모드 선택` 세움
- 자동 전환 (클릭 없음) · `prefers-reduced-motion` 시 건너뜀
- 진입 가드: 리다이렉트 금지 · 모드 없으면 체험 모드 기본 진입
- 라우팅: 단방향 · `studio.html` 스텁 → 저장된 안 · 각 안은 `VStudio.claim()` 로만 저장
- 마지막 트랙: `sessionStorage.vision_track` + URL 해시 복원
- 썸네일: `VStudio.thumbs()` 폴백 (`webp→jpg→png→jpeg`) · 신규 이미지 추가 금지
- 포스터 위 아이콘: 겹치지 않음 · `data-ic` 는 이미지 폴백 · `.has-thumb` 시 숨김
- 공통 CSS 클래스: **`v-` 접두사 필수** (`.track` 등 로컬 클래스와 충돌 방지)
- 수업 모달 / `Session`·`Board` 연동: 건드리지 않음

### 확정된 안
- **A (map.html)** + **C (cards.html)** 운영
- B·D·E·F·G 안 **삭제 완료** (hero.html·path.html·collection.html·quest.html·rank.html · `shared.js` VARIANTS 정리됨)
