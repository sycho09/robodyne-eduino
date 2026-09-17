/**
 * ui/scout/control.js — 조종과 안전.
 *
 * 안전은 선택이 아니다. 넷 다 있어야 실물을 붙인다.
 *   데드맨      키를 놓으면 곧 선다. 누르고 있는 동안만 간다
 *   비상정지    ESC. 누르면 명령이 끊기고, 다시 풀기 전에는 아무 키도 듣지 않는다
 *   속도 상한   매니페스트가 정한 비율 위로는 못 간다
 *   통신 끊김   프레임이 그만큼 안 들어오면 스스로 선다
 * 값은 전부 매니페스트(safety)가 소유한다. 이 파일에 숫자를 두지 않는다.
 *
 * 키와 버튼은 한 벌이다 — 키를 누르면 화면의 그 버튼도 함께 켜진다. 그래야 학생이
 * "내가 누른 것" 과 "차가 받은 것" 을 같은 자리에서 본다.
 */

import { CMD } from './adapter.js';

/** 조종 방향과 화면 버튼의 대응. 이름은 매니페스트의 controls 키와 같다. */
const ACTIONS = ['forward', 'back', 'left', 'right'];
const CMD_OF = { forward: CMD.FORWARD, back: CMD.BACK, left: CMD.LEFT, right: CMD.RIGHT };

/**
 * getAdapter 는 어댑터 자체가 아니라 "지금 어댑터를 돌려주는 함수" 다.
 * 학생이 소스를 바꾸면 어댑터가 통째로 갈린다 — 객체를 붙잡아 두면 조종은 옛 어댑터에게
 * 명령을 보내고 옛 상태를 읽는다(57-B 에 실제로 그랬다: 기기로 바꿨는데 "연결 없음").
 */
export function createControl({ padMount, barMount, challenge, getAdapter, onObserve, onState }) {
  const safety = challenge.safety;
  const keys = challenge.controls;
  const labels = safety.labels;

  // 어느 키가 어느 동작인지. 매니페스트가 준 목록을 뒤집어 표로 만든다.
  const keyMap = new Map();
  for (const act of Object.keys(keys)) for (const code of keys[act]) keyMap.set(code, act);

  const held = new Set();
  // 손가락으로 누르고 있는 버튼. 키와 달리 되풀이 신호가 없으므로 데드맨이 이쪽은 세지 않는다
  // (pointerup·pointerleave·pointercancel·blur 가 반드시 와서 풀린다).
  const pointerHeld = new Set();
  let estop = false;
  let lastPressAt = 0;
  let speedPct = safety.max_speed_pct;
  let lastCmd = CMD.STOP;
  let disposed = false;

  // 리모컨은 우측 열 맨 아래, 안전 상태는 4분할 아래 한 줄에 선다(목업 구조).
  padMount.innerHTML = `
    <div class="rmt">
      <div class="rmt__head"><span>ROBOT CONTROL</span><b data-el="rmt-cmd">정지</b></div>
      <div class="pad">
        <button class="pad__key" type="button" data-act="forward" aria-label="앞으로">▲</button>
        <button class="pad__key" type="button" data-act="left" aria-label="왼쪽">◀</button>
        <button class="pad__key pad__key--stop" type="button" data-act="stop" aria-label="정지">STOP</button>
        <button class="pad__key" type="button" data-act="right" aria-label="오른쪽">▶</button>
        <button class="pad__key" type="button" data-act="back" aria-label="뒤로">▼</button>
      </div>
      <p class="rmt__foot">키보드 <b>↑ ↓ ← →</b> 또는 <b>W A S D</b> · 누르는 동안만 이동</p>
    </div>`;

  barMount.innerHTML = `
    <span>명령 <b data-el="s-cmd">정지</b></span>
    <span>${labels.speed_cap} <b data-el="s-speed">${safety.max_speed_pct}%</b></span>
    <span>${labels.deadman} <b data-el="s-deadman">켬</b></span>
    <span>${labels.link_loss} <b data-el="s-link">—</b></span>
    <span class="cbar__estop" data-el="estop-bar">ESC ${labels.estop}</span>
    <button class="cbar__obs" type="button" data-act="observe">◉ 관측 (스페이스)</button>`;

  const el = (n) => padMount.querySelector(`[data-el="${n}"]`) || barMount.querySelector(`[data-el="${n}"]`);
  const keyBtn = (act) => padMount.querySelector(`.pad__key[data-act="${act}"]`);

  function paintKeys() {
    for (const act of ACTIONS) {
      const b = keyBtn(act);
      if (b) b.classList.toggle('is-on', held.has(act) && !estop);
    }
  }

  function setEstop(on) {
    estop = on;
    held.clear();
    // 비상정지는 한 자리에서만 말한다 — 4분할 아래 줄의 그 칸이 빨갛게 켜진다.
    el('estop-bar').classList.toggle('is-on', on);
    el('estop-bar').textContent = on ? `${labels.estop} 걸림 — ESC 로 풀기` : `ESC ${labels.estop}`;
    padMount.querySelector('.pad').classList.toggle('is-estop', on);
    paintKeys();
    send(CMD.STOP);
  }

  const CMD_WORD = { forward: '앞으로', back: '뒤로', left: '왼쪽', right: '오른쪽', stop: '정지' };

  function send(cmd) {
    lastCmd = cmd;
    getAdapter().send(cmd);
    const word = CMD_WORD[cmd] || '정지';
    el('s-cmd').textContent = word;
    el('rmt-cmd').textContent = word;
  }

  /** 지금 눌린 것들에서 명령 하나를 고른다. 앞뒤가 회전보다 앞선다. */
  function commandNow() {
    if (estop) return CMD.STOP;
    for (const act of ACTIONS) if (held.has(act)) return CMD_OF[act];
    return CMD.STOP;
  }

  function press(act, byPointer) {
    if (estop) return;
    if (act === 'stop') { setEstop(true); return; }
    if (act === 'observe') { onObserve(); return; }
    held.add(act);
    if (byPointer) pointerHeld.add(act);
    lastPressAt = performance.now();
    paintKeys();
    send(commandNow());
  }

  function release(act) {
    pointerHeld.delete(act);
    if (!held.delete(act)) return;
    paintKeys();
    send(commandNow());
  }

  function onKeyDown(e) {
    const act = keyMap.get(e.code);
    if (!act) return;
    // 스페이스는 브라우저가 스크롤·버튼 재클릭에 쓴다. 반드시 막는다 —
    // 안 막으면 관측 한 번에 화면이 아래로 튀고, 마지막에 누른 버튼이 다시 눌린다.
    e.preventDefault();
    if (e.repeat) { if (act !== 'observe' && act !== 'stop') lastPressAt = performance.now(); return; }
    if (act === 'stop') { setEstop(!estop); return; }
    press(act);
  }

  function onKeyUp(e) {
    const act = keyMap.get(e.code);
    if (!act) return;
    e.preventDefault();
    if (act === 'observe' || act === 'stop') return;
    release(act);
  }

  function onBlur() {
    // 창이 포커스를 잃으면 keyup 이 오지 않는다. 놓친 채로 계속 가는 일이 없게 여기서 세운다.
    pointerHeld.clear();
    held.clear();
    paintKeys();
    send(CMD.STOP);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  [padMount, barMount].forEach((m) => m.querySelectorAll('[data-act]').forEach((b) => {
    const act = b.dataset.act;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); press(act, true); });
    b.addEventListener('pointerup', () => release(act));
    b.addEventListener('pointerleave', () => release(act));
    b.addEventListener('pointercancel', () => release(act));
  }));

  /**
   * 매 프레임 안전을 다시 본다. 화면이 도는 한 이 함수가 돈다.
   * 여기가 안전의 유일한 자리다 — 조종 코드 여기저기에 흩어 두면 하나가 빠져도 모른다.
   */
  function tick(now) {
    if (disposed) return { cmd: CMD.STOP, estop, held: [] };
    const st = getAdapter().status();
    // 통신 끊김 — 프레임이 그만큼 안 들어오면 스스로 선다.
    const lost = st.link === 'on' && st.latency_ms > safety.link_loss_ms;
    el('s-link').textContent = st.link === 'on' ? (lost ? '끊김 — 자동정지' : '감시 중') : '연결 없음';
    el('s-link').classList.toggle('is-bad', lost || st.link !== 'on');
    // 데드맨 — 키를 계속 누르고 있으면 브라우저가 keydown 을 되풀이해 보내 이 시각이 갱신된다.
    // 갱신이 끊기면(창이 뒤로 가서 keyup 을 놓쳤거나, 키가 물린 채 신호만 멎었거나) 스스로 선다.
    // 손가락으로 누른 버튼은 되풀이 신호가 없으므로 여기서 세지 않는다 — 뗄 때 반드시 풀린다.
    const keyHeld = [...held].some((a) => !pointerHeld.has(a));
    const stale = keyHeld && now - lastPressAt > safety.deadman_ms;
    if (stale) { held.clear(); pointerHeld.clear(); paintKeys(); }
    el('s-deadman').textContent = held.size ? '누르는 중' : '켬';
    const cmd = (lost || estop || st.link !== 'on') ? CMD.STOP : commandNow();
    if (cmd !== lastCmd) send(cmd);
    if (onState) onState({ cmd, estop, stopped: cmd === CMD.STOP, link: st.link, lost });
    return { cmd, estop, held: [...held], speedPct, lost };
  }

  function dispose() {
    disposed = true;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    send(CMD.STOP);
  }

  return { tick, dispose, isEstop: () => estop, speedPct: () => speedPct, lastCmd: () => lastCmd };
}
