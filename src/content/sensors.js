// sensors.js — 스타터 키트(종합편) 구성품 = 연구소 복도의 학습방 목록
// 지금은 LED 만 개방(unlocked), 나머지는 잠금(곧).

export const SENSORS = [
  { id: 'led', name: 'LED', icon: '💡', unlocked: true },
  { id: 'sound', name: '소리 감지', icon: '🎤' },
  { id: 'relay', name: '릴레이', icon: '🔌', unlocked: true },
  { id: 'dht11', name: 'DHT-11 온습도', icon: '🌡️', unlocked: true },
  { id: 'matrix', name: '8×8 매트릭스', icon: '🟥' },
  { id: 'step', name: '스텝 모터', icon: '⚙️' },
  { id: 'keypad', name: '키패드', icon: '🔢' },
  { id: 'rgb', name: 'RGB LED', icon: '🌈' },
  { id: 'water', name: '수위 센서', icon: '💧' },
  { id: 'servo', name: 'SG-90 서보', icon: '🤖' },
  { id: 'joystick', name: '조이스틱', icon: '🕹️' },
  { id: 'rtc', name: 'RTC 시계', icon: '⏰' },
  { id: 'cds', name: '조도 센서', icon: '🔆' },
  { id: 'pot', name: '가변저항', icon: '🎚️' },
  { id: 'flame', name: '불꽃 감지', icon: '🔥' },
  { id: 'ir', name: '적외선 수신', icon: '📡' },
  { id: 'remote', name: '적외선 리모컨', icon: '🎛️' },
  { id: 'buzzer', name: '부저', icon: '🔊' },
  { id: 'seg', name: '7 세그먼트', icon: '🔢' },
  { id: 'seg4', name: '7세그 4칸', icon: '🕗' },
  { id: 'tilt', name: '기울기 센서', icon: '📐' },
  { id: 'rfid', name: 'RFID-RC522', icon: '💳' },
];
