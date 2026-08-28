# 리팩토링 실행 프롬프트

[refactoring-guide.md](refactoring-guide.md)를 실제로 돌릴 때 쓰는 프롬프트 모음.

**한 번에 한 Phase씩** 새 세션에서 돌린다. 한 세션에 여러 Phase를 몰면 컨텍스트가 넘쳐
뒤쪽 파일에서 판단이 흐려진다. Phase 1은 파일이 많아 1a·1b로 나눠 뒀다.

각 블록을 그대로 복사해서 붙여넣으면 된다.

---

## 공통 전제 (모든 프롬프트에 이미 포함돼 있음)

```
- 무빌드 바닐라 프로젝트다. 번들러·프레임워크·type="module"·새 라이브러리 도입 금지.
- 이미 배포된 사이트다. URL·파일 경로·DOM id/class 이름을 바꾸지 마라.
- 리팩토링은 이동만이다. 로직 수정·리네임·리포맷·"이왕 여는 김에" 정리 전부 금지.
- 전역 결합 규칙: 뽑아낸 파일은 IIFE로 감싸고, 기존 전역 이름은 그대로 두되
  window.X = X 로 명시적으로 재노출한다. 파일 상단에 /* @requires ... */ 주석을 단다.
- HTML의 <script src> 순서 = 의존 순서. 뽑아낸 파일은 원본 파일 앞에 넣는다.
- 파일 1개 = 1커밋. 커밋 메시지: refactor(scope): <파일> css/js 분리
- 지시된 파일 외에는 열지 마라.
```

---

## Phase 0 · 준비

```
docs/refactoring-guide.md 의 1~6절을 읽어라.

할 일:
1. node --test 를 돌리고 현재 통과 상태를 기록해라.
2. test/no-inline.test.mjs 를 새로 만들어라.
   - 저장소의 모든 .html 을 훑어 <style>…</style> 와 <script>…</script> 본문이 있으면 실패시킨다.
     (<script src="..."></script> 처럼 본문이 빈 태그는 통과)
   - dist/, node_modules/ 는 제외한다.
   - 아직 정리되지 않은 파일은 WHITELIST 배열에 넣어 통과시킨다.
     초기 WHITELIST = guide 7절의 Phase 1~3 대상 전부 + 8절 제외 대상 전부.
   - 기존 test/asset-refs.test.mjs 의 파일 순회 패턴을 그대로 따라라.
3. node --test 가 통과하는지 확인하고 커밋해라.

새 라이브러리를 쓰지 마라. node 내장 test 러너와 fs 만 쓴다.
```

---

## Phase 1a · stages/apps 소형 5개

```
docs/refactoring-guide.md 의 1~6절과 "Phase 1" 절을 읽어라.
공통 전제(위)를 지켜라.

대상 (이 5개만, 하나씩 순서대로):
  stages/apps/detect.html      <script> 본문 110–228 → stages/apps/js/detect.js
  stages/apps/filter.html      115–214 → js/filter.js
  stages/apps/face.html        108–206 → js/face.js
  stages/apps/colortrack.html  111–203 → js/colortrack.js
  stages/apps/skeleton.html    109–192 → js/skeleton.js

각 파일마다:
  1. 해당 <script> 본문을 새 .js 파일로 그대로 옮긴다 (한 글자도 바꾸지 않는다)
  2. HTML에는 <script src="/stages/apps/js/<이름>.js"></script> 를 같은 자리에 남긴다
  3. test/no-inline.test.mjs 의 WHITELIST 에서 그 파일을 지운다
  4. node --test 통과 확인 → 커밋

이 5개는 head의 <script src> 7줄이 동일하지만, 이번에는 중복 제거를 하지 마라 (Phase 5에서 한다).

끝나면 보고: 생성된 파일 목록 / node --test 결과 / WHITELIST 에 남은 줄 수
```

---

## Phase 1b · character-card.html + idea-board.html

```
docs/refactoring-guide.md 의 1~6절과 "Phase 1" 절을 읽어라.
공통 전제(위)를 지켜라.

대상은 2개다. character-card 를 완전히 끝내고 커밋한 뒤에 idea-board 로 넘어가라.

이 두 파일은 타입 분리(css/js)만으로는 부족하다. guide 2절 L2 의 판정 3문항으로
JS를 config / logic / view / 엔트리로 나눠라. 분할 대상과 줄 기준점은 guide 의
"character-card.html (1256줄)" 및 "idea-board.html (1065줄)" 표에 있다.

줄 번호는 기준점일 뿐이다. 실제 경계는 표에 함께 적힌 함수·상수 이름으로 확인하고 조정해라.

주의:
- 두 파일 모두 /stages/studio/studio-common.js 에 의존한다(담기·종료 확인 흐름).
  StudioCommon 호출부는 엔트리 파일에 남긴다.
- 이미지는 IndexedDB(imagestore.js)에서 늦게 온다. 그 비동기 흐름을 건드리지 마라.
- 결과 목표: HTML 400줄 이하, 각 JS 300줄 이하.

각 파일 완료 시: WHITELIST 에서 지우고 → node --test → 커밋
끝나면 보고: 생성된 파일과 각 줄 수 / node --test 결과 / 상한 초과 파일이 있으면 명시
```

---

## Phase 2 · platform/ 3개

```
docs/refactoring-guide.md 의 1~6절과 "Phase 2" 절을 읽어라.
공통 전제(위)를 지켜라.

대상 (하나씩, 각각 커밋):
  platform/index.html  (749줄)  → css/landing.css · js/landing.data.js · js/landing.hero.js · js/landing.js
  platform/course.html (757줄)  → css/course.css · js/course.data.js · js/course.draw.js · js/course.scenes.js · js/course.js
  platform/sample.html (589줄)  → css/sample.css · js/sample.logic.js · js/sample.js · js/sample.onboarding.js

분할 내용과 줄 기준점은 guide 의 해당 표를 따른다.

주의:
- sample.html 은 <script> 블록이 2개다 (284–429 본체, 454–587 온보딩). 두 번째 블록은
  완전히 독립이므로 통째로 sample.onboarding.js 로 간다.
- course.html 의 SCENES(510–754)는 6개 코스 씬이다. 뽑은 뒤 300줄을 넘으면 코스별로 다시 나눠라.
- landing.data.js / course.data.js / course.draw.js 는 DOM을 참조하지 않아야 한다.
  참조하는 코드가 섞여 있으면 그건 data가 아니라 view다 — 옮기지 말고 엔트리에 남겨라.

각 파일 완료 시: WHITELIST 에서 지우고 → node --test → 커밋
끝나면 보고: 생성 파일과 줄 수 / node --test 결과
```

---

## Phase 3 · console/ + entry.html

```
docs/refactoring-guide.md 의 1~6절과 "Phase 3" 절, 그리고 CLAUDE.md 의 "비전 콘솔 작업 규칙" 을 읽어라.
공통 전제(위)를 지켜라.

대상 (하나씩, 각각 커밋):
  console/map.html    <style> 21–127 → console/css/map.css   · <script> 173–302 → console/js/map.js
  console/cards.html  21–113 → console/css/cards.css          · 150–277 → console/js/cards.js
  entry.html          20–116 → console/css/entry.css          · 160–313 → console/js/entry.js

반드시 지킬 것:
- console/shared.js 는 열지도 고치지도 마라. 이 파일이 주입하는 공통 CSS와 VStudio.* 는
  CLAUDE.md 가 단일 소스로 못박은 곳이다. 각 안 전용 인라인 스타일만 뽑는다.
- entry.html:18 의 <script src="/console/shared.js" data-intro="always"> — 이 속성이
  인트로 재생 정책의 판단 근거다(head 시점 결정). 태그와 속성을 그대로 둬라.
- 공통 CSS 클래스의 v- 접두사 규칙을 유지해라.
- 뽑아낸 <link> 는 shared.js 가 주입하는 스타일보다 뒤에 와야 한다 (우선순위 유지).

검증에 추가할 것: 플랫폼 홈 → 비전 콘솔 진입 시 인트로가 재생되는지, 콘솔 내부 이동 시
재생되지 않는지 직접 확인해라. 이 동작이 깨지면 되돌려라.

각 파일 완료 시: WHITELIST 에서 지우고 → node --test → 커밋
```

---

## Phase 4 · 이미 .js인데 뭉친 파일

가장 위험한 구간이다. 아래 5개를 **각각 다른 세션**에서 돌린다.

### 4a · trainer.labs.js (가성비 최상 — 여기부터)

```
docs/refactoring-guide.md 의 1~6절과 "Phase 4 · stages/trainer/trainer.labs.js" 를 읽어라.
공통 전제(위)를 지켜라.

stages/trainer/trainer.labs.js (1240줄) 하나만 대상이다.
독립된 랩 6개 + 모달 하나가 쌓여 있을 뿐이라 줄 범위로 갈린다. guide 의 표대로 7개 파일로 나눠라.

절차:
  1. 먼저 index.html 을 열어 trainer.labs.js <script src> 위치를 확인한다 (index.html 은 이 한 줄만 고친다)
  2. 7개 파일을 만들고 코드를 그대로 옮긴다
  3. <script src> 한 줄을 7줄로 교체한다 — 순서는 guide 표 순서 그대로 (의존 순서다)
  4. node --test → 커밋

주의:
- 이 파일의 함수들은 trainer.core.js 의 전역($, els, state, setStatus, setSelectedItem,
  renderClassList, trainHead, drawChart 등)에 의존한다. 각 새 파일 상단에
  /* @requires trainer.core.js (...) */ 로 실제 쓰는 것만 적어라.
- labs/pose.js 는 650줄로 상한 초과다. 1차에는 그대로 두고, 커밋한 뒤 2차로
  pose.js(상태·카메라·학습) + pose.view.js(클래스 렌더·키포인트 그리기)로 다시 나눠라.

검증: index.html 을 열어 직접학습 / 지도학습(포즈·음성) / 사전학습 추론(객체탐지·인물분리·
필터·뼈대·얼굴·색상추적) 탭을 전부 눌러보고 콘솔 에러 0 을 확인해라.
```

### 4b · course-dashboard.js (가장 위험 — 마지막에 해도 된다)

```
docs/refactoring-guide.md 의 1~6절과 "Phase 4 · modules/shared/course-dashboard.js" 를 읽어라.
공통 전제(위)를 지켜라.

modules/shared/course-dashboard.js (853줄) 하나만 대상이다.

이 파일은 init(config) 하나에 전 로직이 클로저로 묶여 있다. 그냥 자르면 state 참조가 깨진다.
해법: init() 이 만든 ctx(state + config + 헬퍼)를 각 파트 함수에 인자로 넘긴다.
  CourseDashboard.Parts.PreCheck(ctx) 형태.

분할 대상은 guide 의 표를 따른다.

반드시 지킬 것:
- 5개 학습 모듈(text·concept·data·gesture·life·vision)이 전부 이 파일을 물고 있다.
  분리 전에 6개 모듈 페이지를 모두 열어 4단계(진단→이론→실습→평가)를 눌러보고 상태를 기록해라.
- state.progress 스키마와 progressPayload() 출력을 절대 바꾸지 마라 (서버 DB 연동 페이로드다).
- Access 연동(paid()·잠금 표시)의 호출 시점을 바꾸지 마라.
- 각 모듈 index.html 의 <script src> 를 늘려야 한다. course-config.js 보다 앞에 와야 한다.

검증: 6개 모듈 페이지 전부에서 4단계를 처음부터 끝까지 진행하고, 진행률이 유지되는지 확인해라.
이 중 하나라도 깨지면 커밋하지 말고 되돌려라.
```

### 4c · CSS-in-JS 제거

```
docs/refactoring-guide.md 의 1~6절과 "Phase 4 · CSS-in-JS 제거" 를 읽어라.
공통 전제(위)를 지켜라.

대상 (하나씩, 각각 커밋) — guide 표의 5개 파일:
  stages/studio/maker.js · stages/studio/imagelab.js
  stages/submission/ui/submit.ui.js · stages/submission/board.js · stages/core/ui/dialog.js

각 파일마다:
  1. const css = `…` 템플릿 문자열 전체를 stages/styles/<이름>.css 로 옮긴다
  2. document.createElement("style") 주입부를 지운다
  3. grep -rn "<js파일명>" --include=*.html 로 이 스크립트를 쓰는 HTML을 전부 찾는다
  4. 찾은 HTML 전부에 <link rel="stylesheet" href="/stages/styles/<이름>.css"> 를 넣는다
  5. node --test → 커밋

주의:
- 주입 시점이 늦어 다른 스타일을 덮고 있었을 수 있다. <link> 위치는 기존 스타일시트보다
  뒤에 둬서 우선순위를 맞춰라. 어긋나면 화면이 미묘하게 틀어진다 — 육안 비교를 반드시 해라.
- maker.js 는 EMOJIS·ACTIONS(11–60)도 maker.config.js 로 뺀다.

검증: 3번에서 찾은 HTML 페이지를 전부 열어 해당 UI(빌더·이미지랩·제출 모달·게시판·다이얼로그)를
띄워보고 스타일이 그대로인지 확인해라.
```

### 4d · trainer.css 분할

```
docs/refactoring-guide.md 의 "Phase 4 · stages/styles/trainer.css" 를 읽어라.
공통 전제(위)를 지켜라.

stages/styles/trainer.css (922줄) 하나만 대상이다. 섹션 주석 경계대로 3개로 나누고
index.html 의 <link> 한 줄을 세 줄로 교체해라. 순서는 layout → panels → results
(원본 순서 그대로여야 캐스케이드가 유지된다).

셀렉터를 한 글자도 바꾸지 마라. 순서도 바꾸지 마라. 자르기만 한다.

검증: index.html 의 모든 탭을 열어 레이아웃이 픽셀 단위로 동일한지 확인해라.
```

### 4e · modules 내부 정리

```
docs/refactoring-guide.md 의 1~6절과 "Phase 4 · modules/data/app.js", "modules/*/advanced.js" 를 읽어라.
공통 전제(위)를 지켜라. docs/module-architecture.md 의 기존 규칙도 따른다.

대상 (하나씩, 각각 커밋):
  modules/data/app.js (589줄)  → chart.js · logic.js · app.js
  modules/concept/advanced.js (439) → concept-mission.config.js 분리
  modules/text/advanced.js (397)    → text-mission.config.js 분리
  modules/gesture/advanced.js (396) → gesture-mission.config.js 분리
  modules/vision/advanced.js (448)  → 상수 분리 + renderClasses 계열을 vision-advanced.view.js 로

주의:
- advanced.js 는 같은 모듈 app.js 의 전역($, mkCam, setStatus, donutSet 등)을 쓴다.
  <script src> 순서에서 app.js 뒤에 와야 한다. config 파일은 advanced.js 앞이다.
- logic.js 에 넣은 함수는 DOM·window 를 참조하면 안 된다. 참조하면 그건 logic 이 아니다.
- data/logic.js 의 linreg·sample·particle 에는 test/ 에 유닛테스트를 추가해도 좋다
  (이 경우에만 새 테스트 파일 허용).

각 파일 완료 시: node --test → 커밋
```

---

## Phase 5 · 중복 제거 (선택)

```
docs/refactoring-guide.md 전체를 읽어라. 공통 전제(위)를 지켜라.

Phase 1~4 가 전부 끝난 뒤에만 실행한다.

할 일:
1. stages/apps/ 5개 페이지의 동일한 부트스트랩 <script src> 7줄을 공통화할 방법을 찾아라.
   무빌드라 HTML include 가 없다 — 실현 가능한 방법이 없으면 하지 말고 그렇게 보고해라.
2. Phase 1~4 에서 드러난 중복 코드를 정리해라.

이 Phase는 동작 변경 위험이 가장 크다. 확신이 없으면 하지 말고 발견한 중복만 보고해라.
```

---

## 마지막 · 완료 확인

```
docs/refactoring-guide.md 의 9절을 읽고 완료 기준을 하나씩 검증해라.

1. node --test 전체 통과
2. test/no-inline.test.mjs 의 WHITELIST 에 guide 8절 "제외 대상" 만 남았는지
3. 모든 대상 파일이 guide 3절 크기 상한을 지키는지 (find + wc -l 로 확인)
4. git diff main..HEAD 에 URL·파일 경로·DOM id/class 변경이 0건인지
5. 각 페이지 브라우저 콘솔 에러 0

기준을 못 채운 항목이 있으면 통과했다고 하지 말고 그대로 보고해라.
```
