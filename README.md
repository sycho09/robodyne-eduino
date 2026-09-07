# robodyne-eduino

Eduino projects at Robodyne Systems (2026.06.25 - 2026.09.21)

교육용 AI 학습 도구 모음입니다. 한 저장소에 독립된 프로젝트 4개가 들어 있고,
각 폴더가 자기 `package.json`·`vercel.json`·배포 단위를 따로 가집니다.

## 폴더 안내

| 폴더 | 내용 | 스택 |
| --- | --- | --- |
| **`eduino-console`** | 비전 콘솔 — 게임기 톤 허브에서 AI 비전 스테이지 5종 + 직접 제작 3트랙 | 바닐라 JS · Electron |
| **`eduino-normal`** | 일반모드 — 브라우저 완결형 AI 학습 코스 6종 | 바닐라 JS · Electron |
| `aiot-ai-trainer-studio` | 위 둘로 분리되기 전의 통합 원본 (참고용) | 바닐라 JS · Electron |
| `mini-game-heaven` | 미니게임천국 — 실물 아두이노를 제어하는 AIoT 학습 플랫폼 (별개 프로젝트) | ES Modules SPA · Vite |

## 인계 대상 — `eduino-console` · `eduino-normal`

웹사이트 이식과 유지보수 리팩토링의 대상은 위 표에서 **굵게 표시한 두 폴더**입니다.
나머지 둘은 이 작업과 무관하니 건드리지 마세요.

읽는 순서:

1. 해당 폴더의 **`README.md`** — 앱 소개, 실행 방법, **배포본 빌드 절차와 걸림돌 2가지**
2. 해당 폴더의 **`docs/refactoring.md`** — 파일 정리 작업 지침서 (현황 실측표 + Phase별 체크리스트)

두 `refactoring.md` 는 각자 완결되어 있어, 자기 폴더만 보고 작업할 수 있습니다.

## 작업 시작 전 · 저장소 관리자에게 확인할 것

아래 두 가지는 **코드를 보고 판단할 수 없습니다.** 답을 받기 전에 리팩토링을
시작하면 작업을 두 번 하게 됩니다. 자세한 설명은 각 폴더 `docs/refactoring.md` 의
0장에 있습니다.

### 1. 절대경로를 유지할 것인가 — **순서가 걸린 문제**

모든 HTML 이 `/stages/core/ui/icons.js` 같은 **루트 기준 절대경로**로 리소스를
참조하고, `vercel.json` 이 `"outputDirectory": "."` 이라 폴더 전체가 도메인 루트에
배포되는 전제로 짜여 있습니다.

- 루트 배포 유지 → 절대경로 그대로 두고 작업
- 하위 경로(`/console/` 등)로 이식 → **상대경로 전환이 리팩토링보다 먼저** 와야
  합니다. 나중에 하면 새로 만든 파일까지 전부 다시 고쳐야 합니다

### 2. `shared/access.*` 중복을 어떻게 할 것인가

`shared/access.js`(515줄)와 `shared/access.css`(527줄)가 `eduino-console` 과
`eduino-normal` 양쪽에 **바이트 단위로 동일하게** 존재합니다. 두 폴더가 독립 배포
단위라 지금 구조에서는 공유할 상위 지점이 없습니다.

| 선택 | 대가 |
| --- | --- |
| 중복 수용 (현행) | 고칠 때 두 곳을 함께 고쳐야 함 |
| 빌드 단계 복사 | 빌드 스텝 추가 |
| 모노레포화 | 두 프로젝트 구조를 함께 손봐야 함 |

## 빌드에 관한 공통 주의

`eduino-console` · `eduino-normal` 은 Electron 앱이라 `npm run dist` 로 포터블
실행파일을 만듭니다. **Windows 개발자 모드를 켜지 않으면 빌드가 실패합니다** —
저장소를 고쳐서 될 문제가 아닌 PC 설정 문제입니다. 각 폴더 `README.md` 의
"배포본 만들기" 절에 원인과 해결법이 있습니다.

빌드 결과물(`dist/`)은 `.gitignore` 라 저장소에 없습니다. 클론 후 각자 빌드하세요.
