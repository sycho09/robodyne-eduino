# Eduino AI Lab: 모듈 폴더 아키텍처 설계

기존 프로젝트의 개발 컨벤션과 설계 사상을 일관되게 유지하기 위해 채택한 구조입니다.

## 1. 셸-콘텐츠 분리 (Shared Shell Pattern)
공통 UI 프레임워크와 도메인 실습 모듈을 명확히 분리했습니다.

- `modules/shared/`: 4단계 학습 라우터(`course-dashboard.js`), 공통 스타일, 아이콘 등 전역 UI 담당
- `modules/{과목명}/`: 개별 실습 환경 구성. 아래 표준 파일로 분리:
  - `index.html`: 실습 화면 DOM 레이아웃
  - `style.css`: 모듈 전용 스타일
  - `course-config.js`: 퀴즈, 이론, 진단 등 텍스트 콘텐츠 설정 데이터
  - `app.js`: 차트 렌더링, 사용자 입력, 모델 구동 등 핵심 로직
  - `advanced.js` 또는 `mission.js` (선택): 모듈의 심화 미션(3단계 구조) 전용 로직을 분리하여 `app.js`의 복잡도를 낮춥니다.

## 2. 아키텍처 디자인 규칙
기존 프로젝트 컨벤션에 맞춰 다음 세 가지 규칙을 적용했습니다.

### ① 무빌드 바닐라 스택 (Zero-Build Vanilla Stack)
- 복잡한 프레임워크 없이 **순수 HTML/CSS/JS** 사용
- 빌드 없이 즉각 실행 가능하도록 기존 코드 호환성 유지

### ② 데이터-로직 분리 (Data-Driven Configuration)
- 변동이 잦은 콘텐츠를 `course-config.js` 객체로 완전 분리
- 텍스트 수정 시 HTML DOM 조작 없이 설정 파일만 업데이트하도록 설계

### ③ 얕은 폴더 구조와 파일 분할 (Flat & Small Files)
- 깊은 중첩 트리 지양, 연관 파일을 동일 모듈 폴더에 평면적(Flat)으로 배치
- 단일 파일 길이를 제한(필요시 `advanced.js`로 분할)하여 유지보수성 향상
