# public/firmware/

보드용 펌웨어 산출물 (§0 / 부록 A·B).

- `playhouse-uno.hex` — Arduino Uno 용. **앱이 WebSerial(STK500)로 직접 굽는다** (IDE 불필요).
- `playhouse-uno.c` — 위 .hex 의 빌드 소스(ATmega328P 베어메탈). 부록 A 와 와이어 동작 동일.
- `playhouse-firmware.ino` — 부록 A 참조 스케치(사람용 프로토콜 계약서).

## .hex 재빌드

```bash
avr-gcc -mmcu=atmega328p -DF_CPU=16000000UL -Os -o /tmp/fw.elf playhouse-uno.c
avr-objcopy -O ihex -R .eeprom /tmp/fw.elf playhouse-uno.hex
```

> 굽기는 `src/serial/flasher.js`(STK500v1) + `src/serial/intelhex.js` 가 처리.
> ESP 계열은 추후 esptool-js 트랙(부록 B).
