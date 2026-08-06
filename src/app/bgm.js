// bgm.js — 배경음악(싱글턴). 우선 /brand/bgm.mp3 가 있으면 그걸 루프 재생,
// 없으면 WebAudio로 가벼운 칩튠을 생성해 루프. 음소거는 기존 sfx.muted 와 공유(사운드 토글 1개로 제어).
// 브라우저 자동재생 정책상 첫 사용자 제스처에서 시작(armAutostart).
import { sfx } from './sfx.js';

const FILE = '/brand/bgm.mp3';
const STEP_MS = 270, PROC_VOL = 0.05, FILE_VOL = 0.4;

// 밝은 16스텝 루프 (C → Am → F → G 진행 아르페지오)
const MELODY = [
  523.25, 659.25, 783.99, 1046.50,
  440.00, 523.25, 659.25, 880.00,
  349.23, 440.00, 523.25, 698.46,
  392.00, 493.88, 587.33, 783.99,
];
const BASS = [130.81, 0, 0, 0, 110.00, 0, 0, 0, 87.31, 0, 0, 0, 98.00, 0, 0, 0];

let started = false, el = null, ac = null, master = null, seqTimer = null, volTimer = null, i = 0;

function ctx() { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); return ac; }
function tone(freq, dur, vol, type) {
  const a = ctx(), o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = freq; o.connect(g); g.connect(master);
  const t = a.currentTime;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur + 0.04);
}
function step() {
  if (!master) return;
  if (!sfx.muted) { tone(MELODY[i], 0.5, PROC_VOL, 'triangle'); if (BASS[i]) tone(BASS[i], 0.55, PROC_VOL * 1.1, 'sine'); }
  i = (i + 1) % MELODY.length;
}
function startProcedural() {
  if (master || el) return;
  const a = ctx(); master = a.createGain(); master.gain.value = 1; master.connect(a.destination);
  if (a.state === 'suspended') a.resume();
  seqTimer = setInterval(step, STEP_MS); step();
}
let duckFactor = 1;   // 게임 연주 중 BGM을 줄이거나(0=무음) 복원(1)
function applyVol() { const m = sfx.muted ? 0 : duckFactor; if (el) el.volume = FILE_VOL * m; else if (master) master.gain.value = m; }

export const bgm = {
  // 게임(연주) 중 배경음악 덕킹: setDuck(0)=무음, setDuck(1)=복원
  setDuck(f) { duckFactor = f; applyVol(); },
  start() {
    if (started) return; started = true;
    const a = new Audio(FILE); a.loop = true; a.preload = 'auto';
    a.addEventListener('canplay', () => { if (el || master) return; el = a; el.volume = sfx.muted ? 0 : FILE_VOL; el.play().catch(() => { if (!master) startProcedural(); }); }, { once: true });
    a.addEventListener('error', () => { if (!el) startProcedural(); }, { once: true });
    setTimeout(() => { if (!el && !master) startProcedural(); }, 1500);
    volTimer = setInterval(applyVol, 250);
  },
  armAutostart() {
    const go = () => { this.start(); window.removeEventListener('pointerdown', go); window.removeEventListener('keydown', go); };
    window.addEventListener('pointerdown', go);
    window.addEventListener('keydown', go);
  },
};
