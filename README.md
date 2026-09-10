# robodyne-eduino

Eduino projects at Robodyne Systems (2026.06.25 - 2026.09.21)

교육용 AI 학습 도구 모음. 독립 프로젝트 5개가 한 저장소에 있고, 각 폴더가
`package.json`·`vercel.json`·배포 단위를 따로 가진다.

## 폴더

| 폴더 | 내용 | 스택 |
| --- | --- | --- |
| **`eduino-console`** | 비전 콘솔 — 게임기 톤 허브 · 비전 스테이지 5종 + 직접 제작 3트랙 | 바닐라 JS · Electron |
| **`eduino-normal`** | 일반모드 — 브라우저 완결형 AI 학습 코스 6종 | 바닐라 JS · Electron |
| `aiot-ai-trainer-studio` | 위 둘로 분리되기 전의 통합 원본 (참고용) | 바닐라 JS · Electron |
| `mini-game-heaven` | 미니게임천국 — 아두이노 제어 AIoT 플랫폼 (별개) | ES Modules SPA · Vite |
| `Playground_AITraining-3` | Eduino AI Lab — 브라우저 완결형 AI 학습·추론 + 영상처리 체험 (별개) | 바닐라 JS · Electron |

## 인계 대상

`docs/refactoring.md` 를 가진 폴더 **4개**가 인계 대상이다. 목표가 둘로 나뉜다.

| 폴더 | 목표 |
| --- | --- |
| **`eduino-console`** · **`eduino-normal`** | 웹사이트 이식 · 리팩토링 |
| **`mini-game-heaven`** · **`Playground_AITraining-3`** | **React 재빌드 대비 정리** (경로 → 파일 분리) |

`aiot-ai-trainer-studio` 만 무관하므로 건드리지 말 것.

읽는 순서 (해당 폴더 안):

1. `README.md` — 앱 소개 · 실행 · **빌드 절차와 걸림돌**
2. `docs/refactoring.md` — 현황 실측표 · Phase별 체크리스트

네 `refactoring.md` 는 각자 완결되어 있어 자기 폴더만 보면 된다.

**`mini-game-heaven` · `Playground_AITraining-3` 두 폴더는 `docs/refactoring.md` 하나가
진입점이다.** 해당 폴더에서 Claude Code 에 그 파일만 지정하면 된다 — 문서 맨 앞
「실행 지침」절이 시작 지점과 정지 지점을 지시한다. **Phase 0 까지 실행하고 멈춰
배포 위치를 물어보게 되어 있다.** 그 답을 주기 전에는 경로 작업이 진행되지 않는다.

## 시작 전 확인 — 저장소 관리자에게

코드로 판단할 수 없는 것들. **답을 받기 전에 시작하면 작업을 두 번 한다.**
폴더별 상세와 실측값은 각 `docs/refactoring.md` **0장**에 있다.

### 1. 배포 위치 · 순서가 걸린 문제

네 폴더 모두 **루트 기준 절대경로**(`/stages/core/ui/icons.js` 식)에 의존한다.
`vercel.json` 의 `"outputDirectory": "."` 도 도메인 루트 배포 전제다.

| 이식 위치 | 조치 |
| --- | --- |
| 도메인 루트 | 절대경로 그대로 |
| 하위 경로 (`/console/` 등) · **React 빌드** | **경로 전환이 리팩토링보다 먼저.** 나중에 하면 새로 만든 파일까지 다시 고쳐야 함 |

> 다만 **폴더마다 실태가 다르다.** `Playground_AITraining-3` 은 `modules/` 하위만
> 상대경로(절대 41 : 상대 74)이고 나머지 네 디렉터리는 100% 절대경로다.
> `mini-game-heaven` 은 반대로 모듈 `import` 193개가 전부 상대경로라 손댈 것이 없고,
> 자산 경로 82개만 절대경로다. "전부 절대경로"로 뭉뚱그리지 말 것.

### 2. `shared/access.*` 중복 처리

`access.js`(515줄) · `access.css`(527줄)가 두 폴더에 **바이트 단위로 동일**하게 있다.
독립 배포 단위라 공유할 상위 지점이 없다.

| 선택 | 대가 |
| --- | --- |
| 중복 수용 (현행) | 고칠 때 두 곳을 함께 |
| 빌드 단계 복사 | 빌드 스텝 추가 |
| 모노레포화 | 두 프로젝트 구조를 함께 손봐야 함 |

## 빌드 주의

- `eduino-console` · `eduino-normal` 은 Electron 앱 — `npm run dist` 로 포터블 실행파일 생성
- **Windows 개발자 모드가 꺼져 있으면 빌드 실패.** 저장소가 아닌 PC 설정 문제다.
  원인과 해결법은 각 폴더 `README.md` 의 "배포본 만들기" 절
- `dist/` 는 `.gitignore` — 저장소에 없다. 클론 후 각자 빌드할 것
