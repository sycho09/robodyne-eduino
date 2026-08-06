# legacy/ — 보관용 아카이브 (빌드 제외)

> 정리일: **2026-08-06** · 기준 커밋 `bd1f426` · 되돌림 태그 `pre-optimize`

이 폴더의 파일은 **빌드에 포함되지 않습니다.** Vite는 `index.html → src/main.js` 엔트리 그래프에 닿는 모듈만 번들하고, `legacy/`는 `src/`·`public/` 밖이라 `dist/`에도 복사되지 않습니다. 즉 번들 기여는 **0바이트**입니다.

**왜 지우지 않고 남겼나**: 이 저장소는 remote가 없고 커밋이 `bd1f426 initial` 하나뿐이라, git 히스토리가 인계 과정에서 유실될 수 있습니다(`.git` 없이 폴더만 압축하는 경우). 코드를 폴더째 남겨 어떤 방식으로 인계해도 보존되게 했습니다.

---

## 무엇을 왜 뺐나

정리 전 프로젝트에는 **커리큘럼(`src/content/curriculum.js`의 `ROOMS`)에 대응하는 방이 없어 실행 경로가 존재하지 않는** 씬이 다수 있었습니다. 라우팅 케이스만 남아 있고 진입할 수 없는 상태였습니다.

### `scenes/` — 미사용 씬 (10개)

| 파일 | 제거 사유 |
|---|---|
| `chapter.js` `house.js` `hub.js` `kits.js` | 어디에서도 import되지 않음 (0 refs). `hubSelect.js`/`chapterSelect.js`로 대체된 구버전 |
| `room.js` | `house.js`(미사용)와 `relay.js`(미연결)만 참조. 블록/코드 에디터 패널을 띄우던 구버전 방 셸 |
| `dhtCoding.js` `dht11room.js` `dht11.js` | `main.js`에 `case 'dht11'` 라우팅은 있었으나 `ROOMS`에 `dht11` 방이 없어 진입 불가 (DHT-11 온습도 센서 확장 잔재) |
| `relay.js` | 같은 이유 — `case 'relay'`는 있었으나 `ROOMS`에 `relay` 방 없음 |
| `escapeRoom.js` | `scene:'game'`인 방의 기본 처리기였으나 해당 `scene` 값을 쓰는 방이 커리큘럼에 없음 |

### `content/` (2개)
- `rooms.js` — `house.js` 전용 방 정의. 현재 단일 공급원은 `src/content/curriculum.js`입니다.
- `sensors.js` — 스타터 키트 구성품 22종 목록. **어디에서도 import되지 않았습니다**(0 refs).

### `app/` (2개) · `engine/` (1개) — 위 씬들의 전용 헬퍼
`eddieSay.js`(에디 말풍선) · `quest.js`(퀘스트/미션 패널) · `engine/style.js`(엔진 스타일 상수).
`house.js` `hub.js` `chapter.js` `relay.js` `escapeRoom.js` `dht11room.js`가 쓰던 모듈로, 해당 씬이 빠지면서 소비자가 사라졌습니다. 현행 씬들은 `app/eddieRig.js`(에디 리깅)와 각 씬 내부 HUD를 씁니다.

> 판정 방법: `src/main.js`에서 import 그래프를 완전 추적해 도달 불가 파일을 뽑았습니다. 정리 후 `src/` 40개 `.js` 전부가 엔트리에서 도달 가능합니다(고아 0).

### `editor/` (3개) — Blockly / CodeMirror 래퍼
`blockEditor.js`(Blockly 11 래퍼) · `codeEditor.js`(CodeMirror 6 + C++ 문법) · `interpreter.js`(블록→동작 해석).
**`dhtCoding.js`와 `room.js` 딱 두 곳에서만 쓰였고 둘 다 위 미연결 경로**였습니다. 이 폴더가 빠지면서 Blockly·CodeMirror가 번들에서 완전히 사라졌습니다 (초기 청크 1,526kB → 대폭 감소).

### `games/` (5개) — 부스형 장치 미니게임
`index.js`(roomId→mountGame 매핑) · `buzzer.js` · `rgb.js` · `keypad.js` · `seg.js`.
`escapeRoom.js` 전용이었습니다. 현행 ch2 미니게임은 `src/scenes/*Game.js`가 담당합니다(별개 구현).

---

## 되살리는 방법

### 1. npm 패키지 재설치 (`editor/`를 되살릴 때만 필요)

`package.json`의 `dependencies`에서 아래 4개를 제거했습니다. **정확한 버전 그대로** 복원하세요.

```json
"dependencies": {
  "@codemirror/lang-cpp": "^6.0.0",
  "@codemirror/theme-one-dark": "^6.0.0",
  "blockly": "^11.2.2",
  "codemirror": "^6.0.0"
}
```
```bash
npm install @codemirror/lang-cpp@^6.0.0 @codemirror/theme-one-dark@^6.0.0 blockly@^11.2.2 codemirror@^6.0.0
```

### 2. 파일을 `src/` 아래 원위치로 이동

```
legacy/scenes/*.js   →  src/scenes/
legacy/content/*.js  →  src/content/
legacy/editor/*.js   →  src/editor/     (폴더 생성 필요)
legacy/games/*.js    →  src/games/      (폴더 생성 필요)
```
파일 안의 상대 경로 import(`../app/…`, `../engine/…`)는 원위치 기준으로 작성돼 있어 **이동만 하면 그대로 맞습니다.**

### 3. 라우팅 재연결 (씬을 되살릴 때)

씬은 커리큘럼에 방이 있어야 도달할 수 있습니다. `HANDOFF.md` §7의 "새 미니게임 추가 순서"를 따르세요:
1. `src/content/curriculum.js`의 `ROOMS`에 `R(...)`로 방 추가 + 챕터 `rooms` 배열에 방ID 등록
2. `src/main.js`에 import 추가 + `enterRoom` 스위치에 `case` 추가
3. 자산 `game-{방id}-cover.webp` / `stage-{방id}-bg.webp` 준비

### 4. CSS

해당 씬들의 스타일은 **`src/styles/parts/` 안에 그대로 남아 있습니다**(캐스케이드 순서를 깨지 않기 위해 옮기지 않음). `/* [LEGACY] … */` 주석으로 표시해 두었으니 검색해서 찾으세요.

---

## 함께 알아둘 것

`src/scenes/joystickGame.js`와 `ultraGame.js`는 **`src/`에 그대로 남아 있습니다.** `sensorRoom.js`가 import하고 있어 번들에는 들어가지만, `ROOMS`에 `joystick`/`ultra` 방이 없어 실행되지는 않습니다. 향후 확장 가능성을 위해 보존하기로 한 항목입니다.
