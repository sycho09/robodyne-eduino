// sfx.js — 가벼운 효과음(WebAudio, 에셋 불필요). 음소거는 localStorage에 저장.
let muted = (typeof localStorage !== 'undefined' && localStorage.getItem('eduino.muted') === '1');
let ac = null;
function ctx() {
  try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; }
  catch (_) { return null; }
}
function blip(freq = 520, ms = 70, type = 'sine', vol = 0.12) {
  if (muted) return; const a = ctx(); if (!a) return;
  try {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq; o.connect(g); g.connect(a.destination);
    g.gain.setValueAtTime(0.0001, a.currentTime);
    g.gain.exponentialRampToValueAtTime(vol, a.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + ms / 1000);
    o.start(); o.stop(a.currentTime + ms / 1000 + 0.02);
  } catch (_) {}
}
export const sfx = {
  get muted() { return muted; },
  toggle() { muted = !muted; try { localStorage.setItem('eduino.muted', muted ? '1' : '0'); } catch (_) {} return muted; },
  hover() { blip(440, 38, 'sine', 0.05); },
  click() { blip(680, 80, 'triangle', 0.12); },
  start() { blip(523, 90, 'triangle', 0.13); setTimeout(() => blip(784, 150, 'triangle', 0.13), 95); },
  pop() { blip(360, 60, 'triangle', 0.08); },
  // 리듬 게임 판정음 — 맞을 때(밝은 딩-딩) / 틀릴 때(낮은 버즈)
  ok() { blip(880, 70, 'triangle', 0.16); setTimeout(() => blip(1320, 95, 'triangle', 0.14), 55); },
  perfect() { blip(988, 60, 'triangle', 0.16); setTimeout(() => blip(1480, 110, 'triangle', 0.15), 50); },
  no() { blip(150, 200, 'sawtooth', 0.16); },
  // 멜로디 연주용 — 지정한 음정을 또렷한 음색으로
  note(freq, ms = 300, vol = 0.2) { blip(freq, ms, 'triangle', vol); },
};
