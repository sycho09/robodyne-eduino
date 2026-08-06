// rooms.js — PlayHouse 방 & 미션 정의 (콘텐츠)
// 학습 순서: [체험(버튼)] → [코드 도전(숫자 수정 + 힌트)] → 업로드로 동작 확인 → 완료
// 실물 배선: 단색 LED = D5(현관)/D9(거실)/D10(주방)/D11(욕실). 침실=DHT11(곧).
//
// mission.type : 'play'(버튼 체험) | 'challenge'(코드 도전)
// mission.goal : 'on' | 'off' | 'blink' | 'pwm'
// mission.want : 도전 판정 조건 { maxPwm } | { maxDelay }

const setup = (pin) => `void setup() {\n  pinMode(${pin}, OUTPUT);\n}\n\n`;

const playOn = (pin) => ({
  id: 'play-on', type: 'play', title: '불 켜보기', goal: 'on', concept: 'digitalWrite',
  story: '먼저 버튼으로 직접 불을 켜고 꺼보자. 익숙해지면 코드에 도전!',
  hint: 'digitalWrite(핀, HIGH) = 켜기, LOW = 끄기.',
  base: setup(pin) + `void loop() {\n  digitalWrite(${pin}, HIGH);\n}\n`,
});
const playPwm = (pin) => ({
  id: 'play-pwm', type: 'play', title: '밝기 맞춰보기', goal: 'pwm', concept: 'analogWrite',
  story: '슬라이더로 밝기를 바꿔보자. 0~255 사이로 은은하게! 익숙해지면 코드 도전!',
  hint: 'analogWrite(핀, 0~255) — 숫자가 클수록 밝아요.',
  base: setup(pin) + `void loop() {\n  analogWrite(${pin}, 128);\n}\n`,
});

const challDim = (pin, maxPwm) => ({
  id: 'ch-dim', type: 'challenge', title: '더 은은하게 (밝기 줄이기)', goal: 'pwm', want: { maxPwm },
  concept: 'analogWrite', challenge: `코드로 밝기를 ${maxPwm} 이하로 줄여 더 은은하게 만들어줘!`,
  story: '아래 코드의 숫자를 직접 바꿔 밝기를 낮춰보자.',
  hint: `analogWrite(${pin}, 숫자) 의 숫자를 ${maxPwm} 이하로 줄여보세요. (예: ${Math.round(maxPwm * 0.6)})`,
  base: setup(pin) + `void loop() {\n  analogWrite(${pin}, 220);   // 너무 밝아요! 숫자를 줄여보세요\n}\n`,
});
const challFast = (pin, maxDelay) => ({
  id: 'ch-fast', type: 'challenge', title: '더 빠르게 깜빡이기', goal: 'blink', want: { maxDelay },
  concept: 'delay', challenge: `delay 를 ${maxDelay} 이하로 줄여 더 빠르게 깜빡여줘!`,
  story: 'delay 숫자가 작을수록 빨리 깜빡여요. 직접 바꿔보자.',
  hint: `delay(숫자) 의 숫자를 ${maxDelay} 이하로 줄여보세요. (예: ${Math.round(maxDelay * 0.7)})`,
  base: setup(pin) + `void loop() {\n  digitalWrite(${pin}, HIGH);\n  delay(800);   // 느려요! 숫자를 줄여보세요\n  digitalWrite(${pin}, LOW);\n  delay(800);\n}\n`,
});
// 침실 = 또 다른 LED. '다중 LED 제어' 개념으로 다룬다(대표 핀으로 학습).
const playMulti = (pin) => ({
  id: 'play-multi', type: 'play', title: '침실 등 켜기 (다중 LED)', goal: 'on', concept: '다중 LED 제어',
  story: '침실엔 천장등·무드등 등 LED가 여러 개! 먼저 대표 등을 켜보자. (다중 LED 제어 개념)',
  hint: '여러 LED도 각 핀에 digitalWrite(핀, HIGH). 여기선 대표로 D6 천장등을 켜요.',
  base: setup(pin) + `void loop() {\n  digitalWrite(${pin}, HIGH);\n}\n`,
});
const challMulti = (pin, maxDelay) => ({
  id: 'ch-multi', type: 'challenge', title: '여러 등 번갈아 점멸 (다중 제어)', goal: 'blink', want: { maxDelay },
  concept: '다중 LED 제어', challenge: `여러 LED를 다루듯 delay 를 ${maxDelay} 이하로 줄여 빠르게 번갈아 점멸!`,
  story: '다중 LED 제어 개념: 핀을 바꿔가며 제어해요. 여기선 대표 등을 빠르게 점멸시켜보자.',
  hint: `delay(숫자) 의 숫자를 ${maxDelay} 이하로 줄여보세요. (예: ${Math.round(maxDelay * 0.7)})`,
  base: setup(pin) + `void loop() {\n  digitalWrite(${pin}, HIGH);\n  delay(800);   // 느려요! 숫자를 줄여보세요\n  digitalWrite(${pin}, LOW);\n  delay(800);\n}\n`,
});

export const ROOMS = [
  { id: 'living', name: '거실', pin: 9, concept: '밝기(PWM)',
    intro: '거실은 분위기가 중요해. 밝기를 다뤄보자.',
    missions: [playPwm(9), challDim(9, 80)] },
  { id: 'kitchen', name: '주방', pin: 10, concept: '깜빡임/신호',
    intro: '요리 중 알림등! 켜고, 빠르게 깜빡이는 신호를 만들자.',
    missions: [playOn(10), challFast(10, 200)] },
  { id: 'bath', name: '욕실', pin: 11, concept: '은은한 빛(PWM)',
    intro: '욕실엔 눈부시지 않은 아주 은은한 빛이 좋아.',
    missions: [playPwm(11), challDim(11, 40)] },
  { id: 'bedroom', name: '침실', pin: 6, concept: '다중 LED 제어',
    intro: '침실엔 LED가 여러 개! 다중 LED 제어를 배워보자.',
    missions: [playMulti(6), challMulti(6, 250)] },
];

export const LOCKED_ROOMS = [];

export const TOTAL_ROOMS = ROOMS.length; // 4
export const getRoom = (id) => ROOMS.find((r) => r.id === id);
