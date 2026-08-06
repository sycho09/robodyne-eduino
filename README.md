# Playino · PlayHouse — 거실 레슨

> 층위: `Playino(제품군) › PlayHouse(스마트홈 1호) › 거실(검증 레슨)`

웹 게임(EDDIE 아바타) ↔ 실물 보드(LED) 연동 학습 1레슨(거실)을 만드는
재사용 템플릿. 통과하면 나머지 4방·다른 테마로 복제한다.

## 현재 진행 상태

- [x] **시리얼 코어** + **WebSerial 펌웨어 굽기**(Uno STK500, IDE 불필요)
- [x] **프리미엄 인트로** (Eduino AI 플랫폼 → PlayHouse → EDDIE 스토리)
- [x] **사용환경 준비**: 보드 연결 · 체크리스트(자동 완료표시) · **내장 LED(D13) 테스트**
- [x] **2D 탑다운 게임**: 앞마당(이동→현관문) → 집 내부(깜깜, 손전등)
- [x] **현관 미션룸**: 버튼 모드 + **코드 에디터(CodeMirror)** · 미션 1~2(불 켜기/깜빡이기)
      · 코드 판정(interpreter) → 실물 LED 실시간 연동 → 현관 점등(1/5)
- [ ] 다음: 나머지 방(거실 NeoPixel · 주방/욕실/침실) 잠금 해제 · LCD/DHT11 · Wokwi 폴백

> 실물 배선은 [`docs/HARDWARE.md`](docs/HARDWARE.md) 기준 (D2=DHT11 이므로 거실 조명=D5).

## 실행 방법

```bash
npm install
npm run dev      # http://localhost:5173 (Chrome/Edge 데스크톱)
```

화면 흐름:
1. **인트로** — Eduino AI 소개 → PlayHouse 진입 → EDDIE 스토리.
2. **사용환경 준비** — [보드 연결] → 체크리스트가 자동 완료표시
   (브라우저/연결/펌웨어). 펌웨어 없으면 **[펌웨어 굽기(웹)]** 진행.
   마지막으로 **[13번 LED 깜빡이기]**(보드 내장 LED, 외부 배선 불필요) 확인.
3. **거실 레슨** — [불 켜기 · L5:1]/[불 끄기 · L5:0] → 실물 **D5 LED** 토글,
   불이 켜지면 EDDIE success 글로우 + 미션 완료(1/5).

> WebSerial 은 Chrome/Edge 데스크톱 전용. 미지원/HW 없음 → 추후 Wokwi 폴백.

### 펌웨어: IDE 없이 브라우저에서 굽기 (WebSerial · STK500)

보드에 펌웨어가 없으면 "보드 준비" 모달의 **[웹으로 펌웨어 굽기]** 버튼이
`public/firmware/playhouse-uno.hex` 를 STK500v1 부트로더 프로토콜로 직접
굽는다 (Arduino IDE 불필요). **최초 1회만** 굽고, 이후엔 명령만 주고받는다.

- 굽기 대상 `.hex` 빌드 소스: `public/firmware/playhouse-uno.c` (베어메탈, 부록 A 와 동작 동일).
  재빌드:
  ```bash
  avr-gcc -mmcu=atmega328p -DF_CPU=16000000UL -Os -o fw.elf public/firmware/playhouse-uno.c
  avr-objcopy -O ihex -R .eeprom fw.elf public/firmware/playhouse-uno.hex
  ```
- 구현: `src/serial/flasher.js` (STK500v1) + `src/serial/intelhex.js` (HEX 파서).
- ESP 계열은 추후 `esptool-js` 트랙(부록 B).

## 시리얼 프로토콜 (§3)

라인 단위 ASCII, `\n` 종결, **115200 baud**.

| 방향 | 명령 | 의미 |
|---|---|---|
| H→B | `PING` | 핸드셰이크 |
| H→B | `L<pin>:<0\|1>` | digitalWrite (예 `L2:1`) |
| H→B | `P<pin>:<0-255>` | analogWrite(PWM) |
| B→H | `READY` / `PLAYHOUSE v<n>` / `OK` / `ERR:<msg>` | 부팅·식별·ACK·오류 |

핸드셰이크: 연결 직후 `PING` → 1.5초 내 `PLAYHOUSE v*` 수신 시 통과.

## 폴더 구조

```
playino-playhouse/
├── index.html
├── package.json
├── vite.config.js
├── public/firmware/        # 펌웨어 산출물 + 참조 .ino (별도 작업자)
└── src/
    ├── main.js             # 씬 매니저 (인트로 → 사용환경 준비 → 거실 레슨)
    ├── styles/main.css
    ├── assets/eddie.svg    # ★ EDDIE 주인공 (#eddie/#eddie-eyes/#eddie-glow/#eddie-screen)
    ├── app/
    │   ├── board.js        # 공유 보드 컨트롤러(연결·핸드셰이크·웹굽기·핀제어)
    │   └── monitor.js      # 공유 시리얼 모니터 컴포넌트
    ├── engine/
    │   └── topdown.js      # 2D 탑다운 엔진(이동·충돌·트리거·EDDIE 스프라이트)
    ├── scenes/
    │   ├── intro.js        # Eduino AI → PlayHouse → EDDIE 스토리
    │   ├── setup.js        # 사용환경 준비(체크리스트 + 내장 LED 테스트)
    │   ├── yard.js         # 앞마당(현관문까지 이동)
    │   ├── house.js        # 집 내부(깜깜) + 현관 스위치
    │   └── room.js         # 미션룸(버튼 + 코드 에디터)
    ├── editor/
    │   ├── codeEditor.js   # CodeMirror 6 (Arduino C++)
    │   └── interpreter.js  # 코드→명령 변환 + 목표 판정(§6)
    ├── content/
    │   └── rooms.js        # 방·미션 정의(현관 등)
    └── serial/
        ├── webserial.js    # 포트 연결·VID/PID·라인 read/write·attach(재사용)
        ├── protocol.js     # 명령 인코딩/디코딩 (L5:1 등)
        ├── provisioning.js # PING 핸드셰이크(재시도) + flashFirmware(웹 굽기)
        ├── flasher.js      # Uno STK500v1 WebSerial 플래셔
        └── intelhex.js     # Intel HEX(.hex) 파서
```

> 다음 단계에서 `themes/`(테마팩 JSON), 방향키 이동, 코드 에디터 등이 추가된다.

## HW

Arduino Uno + 5φ LED 5개(`D2~D6`). 거실 = **`D2`**.
펌웨어는 `public/firmware/playhouse-firmware.ino`(부록 A) 계약을 준수.
