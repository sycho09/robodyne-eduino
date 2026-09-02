@.agents/AGENTS.md

## 작업 범위 (공통 원칙)
**이미 배포된 사이트다.** 지시받은 범위 밖의 파일은 열지도 고치지도 말 것.
탐색을 최소화해 토큰을 아낀다 — 아래 표에서 해당 범위의 파일만 읽는다.

| 작업 주제 | 수정 가능 파일 | 세부 규칙 |
| --- | --- | --- |
| 학습 모듈 (4단계 대시보드) | `modules/` 내 지정 파일 | `modules/CLAUDE.md` |
| 비전 콘솔 (A·C 확정) | `console/{shared.js,map.html,cards.html}` · 입구·스텁 | 아래 참고 |

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
