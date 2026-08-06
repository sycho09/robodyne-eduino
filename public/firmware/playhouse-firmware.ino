// playhouse-firmware.ino — 프로토콜 계약서 (부록 A)
// Playino · PlayHouse 거실 레슨용 참조 펌웨어.
// 별도 작업자(펌웨어 트랙)와 공유하는 계약. 이 동작을 그대로 구현하면
// 웹앱(시리얼 코어)과 핸드셰이크/명령이 호환된다.
//
// 테스트 HW: Arduino Uno + 5φ LED 5개 (D2~D6). 거실 = D2.
// 라인 단위 ASCII, '\n' 종결, 115200 baud.
//
// 명령(H -> B):
//   PING                 → "PLAYHOUSE v<n>"
//   L<pin>:<0|1>         digitalWrite        → "OK"
//   P<pin>:<0-255>       analogWrite(PWM)    → "OK"
//   U<trig>:<echo>       초음파(HC-SR04) 거리 → "US:<cm>"  (에코 없음/범위초과 = "US:-1")
//   N<pin>:<idx>,<r>,<g>,<b> / NA<pin>:<r>,<g>,<b> / NS<pin>  NeoPixel(WS2812, D6) → "OK"
//
// ⚠️ 이 .ino 는 계약 참조용(요약). 실제 빌드/플래싱되는 펌웨어는 playhouse-uno.c 이며
//    NeoPixel·DHT11·tone·analogRead 등 전체 구현은 그쪽에 있다. v5 기준.

const char* FW_ID = "PLAYHOUSE v5";

void setup() {
  Serial.begin(115200);
  for (int p = 2; p <= 6; p++) pinMode(p, OUTPUT);
  Serial.println("READY");
}

// HC-SR04: Trig 에 10µs 펄스 → Echo HIGH 폭(µs) 측정 → 거리(cm) = 폭 / 58
long readUltrasonicCm(int trig, int echo) {
  pinMode(trig, OUTPUT);
  pinMode(echo, INPUT);
  digitalWrite(trig, LOW);  delayMicroseconds(2);
  digitalWrite(trig, HIGH); delayMicroseconds(10);
  digitalWrite(trig, LOW);
  unsigned long dur = pulseIn(echo, HIGH, 30000UL);  // 30ms 타임아웃(≈5m)
  if (dur == 0) return -1;                            // 에코 없음
  long cm = (long)(dur / 58);
  if (cm <= 0 || cm > 400) return -1;                 // 유효범위 밖
  return cm;
}

void loop() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\n');
  line.trim();

  if (line == "PING") { Serial.println(FW_ID); return; }

  char type = line.charAt(0);
  int colon = line.indexOf(':');
  if (colon < 0) { Serial.println("ERR:format"); return; }

  int pin = line.substring(1, colon).toInt();
  int val = line.substring(colon + 1).toInt();

  if (type == 'L')      { digitalWrite(pin, val ? HIGH : LOW); Serial.println("OK"); }
  else if (type == 'P') { analogWrite(pin, constrain(val, 0, 255)); Serial.println("OK"); }
  else if (type == 'U') { long cm = readUltrasonicCm(pin, val); Serial.print("US:"); Serial.println(cm); }
  else                  { Serial.println("ERR:cmd"); }
}
