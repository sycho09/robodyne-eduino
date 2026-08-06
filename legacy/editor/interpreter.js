// interpreter.js — "업로드" 프로토타입 (§6)
// 실제 컴파일 X. loop() 에서 digitalWrite(pin,HIGH|LOW)·analogWrite(pin,0-255)·
// delay(ms) 를 추출해 명령 시퀀스로 변환하고 목표(goal)를 판정한다.
// goal: 'on' | 'off' | 'blink' | 'pwm'

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** loop() 본문에서 토큰 추출 */
export function parseLoop(code) {
  const m = code.match(/void\s+loop\s*\(\s*\)\s*\{([\s\S]*)\}/);
  const body = m ? m[1] : code;
  const re = /digitalWrite\s*\(\s*(\d+)\s*,\s*(HIGH|LOW|1|0)\s*\)|analogWrite\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)|delay\s*\(\s*(\d+)\s*\)/g;
  const tokens = [];
  let t;
  while ((t = re.exec(body))) {
    if (t[1] !== undefined && t[2] !== undefined) {
      tokens.push({ type: 'write', pin: Number(t[1]), val: (t[2] === 'HIGH' || t[2] === '1') ? 1 : 0 });
    } else if (t[3] !== undefined && t[4] !== undefined) {
      tokens.push({ type: 'awrite', pin: Number(t[3]), val: Number(t[4]) });
    } else if (t[5] !== undefined) {
      tokens.push({ type: 'delay', ms: Number(t[5]) });
    }
  }
  return tokens;
}

export function analyze(tokens, pin) {
  const writes = tokens.filter((t) => t.type === 'write' && t.pin === pin);
  const awrites = tokens.filter((t) => t.type === 'awrite' && t.pin === pin);
  const delays = tokens.filter((t) => t.type === 'delay');
  const finalVal = writes.length ? writes[writes.length - 1].val : null;
  const hasHigh = writes.some((w) => w.val === 1);
  const hasLow = writes.some((w) => w.val === 0);
  const blink = hasHigh && hasLow && delays.length >= 2;
  const dim = awrites.some((a) => a.val > 0 && a.val < 255);
  const pwmVal = awrites.length ? awrites[awrites.length - 1].val : null;
  return { writes, awrites, delays, finalVal, hasHigh, hasLow, blink, dim, pwmVal };
}

export function judge(code, pin, goal, want = {}) {
  const tokens = parseLoop(code);
  const s = analyze(tokens, pin);

  if (goal === 'pwm') {
    if (!s.dim) return { ok: false, reason: `${pin}번 핀에 analogWrite(${pin}, 1~254) 로 밝기를 정해보세요.`, summary: s, tokens };
    if (want.maxPwm != null && !(s.pwmVal > 0 && s.pwmVal <= want.maxPwm)) {
      return { ok: false, reason: `아직 밝아요 (값 ${s.pwmVal}). ${want.maxPwm} 이하로 줄여보세요.`, summary: s, tokens };
    }
    return { ok: true, reason: `밝기 ${s.pwmVal} 로 은은하게! ✨`, summary: s, tokens };
  }

  if (s.writes.length === 0) {
    return { ok: false, reason: `${pin}번 핀을 제어하는 digitalWrite 가 안 보여요.`, summary: s, tokens };
  }
  if (goal === 'on') {
    return s.finalVal === 1
      ? { ok: true, reason: '불이 켜진 상태로 끝나요! 👍', summary: s, tokens }
      : { ok: false, reason: '마지막에 불이 꺼져 있어요. HIGH 로 끝나야 해요.', summary: s, tokens };
  }
  if (goal === 'off') {
    return s.finalVal === 0
      ? { ok: true, reason: '불이 꺼진 상태로 끝나요! 👍', summary: s, tokens }
      : { ok: false, reason: '마지막에 불이 켜져 있어요. LOW 로 끝나야 해요.', summary: s, tokens };
  }
  if (goal === 'blink') {
    if (!s.blink) return { ok: false, reason: 'HIGH·LOW 를 번갈아 쓰고 delay 를 2번 이상 넣어야 깜빡여요.', summary: s, tokens };
    if (want.maxDelay != null && !s.delays.every((d) => d.ms <= want.maxDelay)) {
      const slow = Math.max(...s.delays.map((d) => d.ms));
      return { ok: false, reason: `아직 느려요 (delay ${slow}). ${want.maxDelay} 이하로 줄여보세요.`, summary: s, tokens };
    }
    return { ok: true, reason: 'HIGH·LOW 와 delay 로 깜빡여요! ✨', summary: s, tokens };
  }
  return { ok: false, reason: '알 수 없는 목표', summary: s, tokens };
}

/** 토큰 시퀀스를 실물 보드로 실행 (board.digital / board.pwm). */
export async function execute(tokens, pin, board, { loops = 3, onStep } = {}) {
  const hasDelay = tokens.some((t) => t.type === 'delay');
  const passes = hasDelay ? loops : 1;
  for (let l = 0; l < passes; l++) {
    for (const t of tokens) {
      if (t.type === 'write' && t.pin === pin) {
        await board.digital(pin, t.val === 1);
        onStep?.(t.val === 1);
      } else if (t.type === 'awrite' && t.pin === pin) {
        await board.pwm(pin, t.val);
        onStep?.(t.val > 0, t.val);
      } else if (t.type === 'delay') {
        await delay(Math.min(t.ms, 1500));
      }
    }
  }
}
