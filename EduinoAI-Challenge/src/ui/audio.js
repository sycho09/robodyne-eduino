/**
 * ui/audio.js — 주행 사운드(WebAudio).
 *
 * 결정론 불변: 오디오는 시뮬 상태를 '읽기만' 한다. 틱 진행·랩 계측·물리 어디에도 관여하지 않고,
 * 오디오 컨텍스트가 없거나 실패해도 화면과 기록은 그대로 돌아간다. 소리를 켜고 끈 결과가
 * 랩타임을 바꾸는 경로는 존재하지 않는다.
 *
 * 좌/우 모터를 각각 좌/우 채널에 놓는다. 음높이는 그 모터의 PWM 에서만 나온다.
 * 기본값은 음소거다. 켠 상태는 브라우저(localStorage)에 남는다.
 */

const KEY = 'dtc:v1:sound';

function readPref() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

function writePref(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* 저장 실패는 무시 */ }
}

export function createMotorAudio() {
  let ctx = null;
  let nodes = null;
  let enabled = false;               // 실제 소리 출력 여부
  let wanted = readPref();           // 사용자가 켜 둔 상태
  let seenOff = 0;
  let seenLap = 0;
  let primed = false;

  function build() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
    } catch { ctx = null; return false; }

    const master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);

    const motor = (pan) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 60;
      const sub = ctx.createOscillator();       // 한 옥타브 아래를 겹쳐 모터 특유의 두께를 만든다
      sub.type = 'square';
      sub.frequency.value = 30;
      const subGain = ctx.createGain();
      subGain.gain.value = 0.35;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.Q.value = 0.7;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      osc.connect(filter);
      sub.connect(subGain).connect(filter);
      filter.connect(gain);
      if (panner) { panner.pan.value = pan; gain.connect(panner).connect(master); }
      else gain.connect(master);
      osc.start();
      sub.start();
      return { osc, sub, filter, gain };
    };

    nodes = { master, left: motor(-0.85), right: motor(0.85) };
    return true;
  }

  /** 짧은 피드백 톤. 주행음과 독립적인 일회성 노드라 서로 간섭하지 않는다. */
  function blip(freqFrom, freqTo, seconds, type, peak) {
    if (!ctx || !nodes) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(g).connect(nodes.master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  function applyMotor(side, pwm, pwmMax) {
    const n = nodes[side];
    const duty = Math.min(1, Math.abs(pwm) / (pwmMax || 255));
    const t = ctx.currentTime;
    // 음높이는 PWM 만으로 정한다. 정지(0)면 완전히 닫는다.
    n.osc.frequency.setTargetAtTime(58 + duty * 240, t, 0.03);
    n.sub.frequency.setTargetAtTime(29 + duty * 120, t, 0.03);
    n.filter.frequency.setTargetAtTime(420 + duty * 1700, t, 0.05);
    n.gain.gain.setTargetAtTime(duty > 0 ? 0.030 + 0.055 * duty : 0, t, 0.04);
  }

  const api = {
    get enabled() { return wanted; },
    get available() { return !!(window.AudioContext || window.webkitAudioContext); },

    /** 토글은 사용자 제스처에서 불린다 — 여기서 컨텍스트를 만들고 재개한다. */
    setEnabled(on) {
      wanted = !!on;
      writePref(wanted);
      if (wanted) {
        enabled = build();
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      } else if (nodes) {
        const t = ctx.currentTime;
        nodes.left.gain.gain.setTargetAtTime(0, t, 0.02);
        nodes.right.gain.gain.setTargetAtTime(0, t, 0.02);
        enabled = false;
      }
      return wanted;
    },

    /** 렌더 루프에서 매 프레임 호출. 시뮬을 읽기만 한다. */
    update(sim, playing) {
      if (!wanted) return;
      if (!enabled) enabled = build();
      if (!enabled || !ctx || !nodes) return;
      if (!primed) { seenOff = sim.offtrack.count; seenLap = sim.lap.count; primed = true; }

      const pwmMax = (sim.steps && sim.steps.pwmMax) || 255;
      const run = playing && !sim.ended;
      applyMotor('left', run ? sim.vehicle.pwmL : 0, pwmMax);
      applyMotor('right', run ? sim.vehicle.pwmR : 0, pwmMax);

      if (sim.offtrack.count > seenOff) { seenOff = sim.offtrack.count; blip(320, 90, 0.28, 'square', 0.16); }
      if (sim.lap.count > seenLap) { seenLap = sim.lap.count; blip(880, 1660, 0.34, 'triangle', 0.14); }
      if (sim.offtrack.count < seenOff) seenOff = sim.offtrack.count;   // 리셋
      if (sim.lap.count < seenLap) seenLap = sim.lap.count;
    },

    /** 시뮬 리셋 시 카운터만 맞춘다. 소리 상태는 유지한다. */
    sync(sim) { seenOff = sim.offtrack.count; seenLap = sim.lap.count; primed = true; },

    dispose() {
      if (ctx) { try { ctx.close(); } catch { /* 이미 닫힘 */ } }
      ctx = null; nodes = null; enabled = false;
    },
  };
  return api;
}
