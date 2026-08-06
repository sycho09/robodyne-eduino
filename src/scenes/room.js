// room.js — 미션 룸 패널
// 학습 순서: 체험(버튼, play) → 코드 도전(challenge: 숫자 수정 + 힌트) → 정답 → 업로드로 확인 → 완료.
// 학습/판정은 보드 없이도 동작. 실물 반영은 best-effort.

import { board } from '../app/board.js';
import { createEditor } from '../editor/codeEditor.js';
import { createBlockEditor, TOOLBOX_LED, TOOLBOX_RELAY } from '../editor/blockEditor.js';
import { judge, parseLoop, execute } from '../editor/interpreter.js';
import eddieSvg from '../assets/eddie.svg?raw';

// 미션 goal → 블록 시작 배치 (방 종류에 맞는 블록셋)
function presetFor(m, pin, set) {
  const sb = set === 'relay' ? 'relay_state' : 'led_state';
  if (m.goal === 'pwm') return [{ type: 'led_pwm', fields: { PIN: pin, VAL: m.want ? 220 : 128 } }];
  if (m.goal === 'blink') return [
    { type: sb, fields: { PIN: pin, STATE: 'HIGH' } }, { type: 'wait', fields: { MS: 800 } },
    { type: sb, fields: { PIN: pin, STATE: 'LOW' } }, { type: 'wait', fields: { MS: 800 } },
  ];
  return [{ type: sb, fields: { PIN: pin, STATE: m.goal === 'off' ? 'LOW' : 'HIGH' } }];
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function openRoom(room, { onComplete, onClose }) {
  let mi = 0;
  let editor = null;
  let blockEd = null;
  let solved = false;
  let tab = 'button';

  const backdrop = document.createElement('div');
  backdrop.className = 'room-backdrop';
  backdrop.innerHTML = `
    <div class="room-panel">
      <header class="room-head">
        <div class="room-head-title">
          <span class="room-chip">Eduino AI : ${room.name}</span>
          <span id="room-mtitle"></span>
        </div>
        <div class="room-head-right">
          <span class="room-progress" id="room-mprog"></span>
          <button class="btn btn-sm room-skip" id="room-skip">건너뛰기 ⏭</button>
          <button class="room-x" id="room-x" title="닫기">✕</button>
        </div>
      </header>
      <div class="room-body">
        <div class="room-left">
          <div class="room-eddie">${eddieSvg}</div>
          <div class="room-lamp-big" id="room-lamp"><small>D${room.pin}</small></div>
          <div class="room-intro" id="room-intro"></div>
          <div class="room-story" id="room-story"></div>
        </div>
        <div class="room-right">
          <div class="room-tabs">
            <button class="room-tab" data-tab="button">🔘 버튼</button>
            <button class="room-tab" data-tab="block">🧩 블록</button>
            <button class="room-tab" data-tab="code">⌨️ 코드</button>
          </div>
          <div class="room-tabpane" id="room-pane"></div>
          <div class="room-feedback" id="room-fb"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const $ = (s) => backdrop.querySelector(s);
  const elMTitle = $('#room-mtitle'), elMProg = $('#room-mprog'), elIntro = $('#room-intro');
  const elStory = $('#room-story'), elPane = $('#room-pane'), elFb = $('#room-fb');
  const lamp = $('#room-lamp'), glow = $('#eddie-glow');

  $('#room-x').onclick = close;
  $('#room-skip').onclick = advance;
  backdrop.querySelectorAll('.room-tab').forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));

  const mission = () => room.missions[mi];

  function reflectLed(on) {
    lamp.style.boxShadow = ''; lamp.style.background = '';
    lamp.classList.toggle('on', on);
    if (glow) { glow.classList.remove('pulse'); if (on) { void glow.offsetWidth; glow.classList.add('pulse', 'held'); } else glow.classList.remove('held'); }
  }
  function reflectPwm(val) {
    const f = Math.max(0, Math.min(255, val)) / 255;
    lamp.classList.remove('on');
    if (f > 0.02) {
      lamp.style.background = `radial-gradient(circle, rgba(255,242,176,${0.35 + f * 0.6}), rgba(255,209,26,${0.3 + f * 0.7}) 70%)`;
      lamp.style.boxShadow = `0 0 ${8 + f * 34}px ${2 + f * 8}px rgba(255,209,26,${0.2 + f * 0.5})`;
    } else { lamp.style.background = ''; lamp.style.boxShadow = ''; }
    if (glow) { glow.classList.remove('pulse'); glow.classList.toggle('held', f > 0.4); }
  }

  function feedback(kind, html) { elFb.className = 'room-feedback ' + kind; elFb.innerHTML = html; }
  const hw = (fn) => { if (board.connected) { try { fn(); } catch (_) {} } else board.log('sys', '보드 미연결 — 화면으로만 반영'); };

  function pass() {
    if (solved) return;
    solved = true;
    const last = mi >= room.missions.length - 1;
    feedback('ok', `
      <div class="fb-title">성공! 🎉 ${mission().title} 완료</div>
      <button class="btn primary" id="fb-next">${last ? `${room.name} 완료하고 나가기 ▶` : '다음 미션 ▶'}</button>`);
    $('#fb-next').onclick = advance;
  }
  function advance() {
    const last = mi >= room.missions.length - 1;
    if (last) { close(); onComplete?.(); }
    else { mi += 1; solved = false; render(); }
  }

  function switchTab(t) {
    tab = t;
    backdrop.querySelectorAll('.room-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    renderPane();
  }
  function renderPane() {
    if (editor) { try { editor.destroy?.(); } catch (_) {} editor = null; }
    if (blockEd) { try { blockEd.destroy?.(); } catch (_) {} blockEd = null; }
    elPane.innerHTML = '';
    if (tab === 'button') renderButtonPane();
    else if (tab === 'block') renderBlockPane();
    else renderCodePane();
  }

  // ---- 블록(Blockly) 모드 ----
  function renderBlockPane() {
    const m = mission();
    elPane.innerHTML = `
      ${m.type === 'challenge' ? `<div class="challenge-banner">🎯 도전 · ${m.challenge}</div>` : ''}
      <div class="block-host" id="block-host"></div>
      <div class="code-actions">
        <button class="btn primary" id="b-run">⚡ 업로드</button>
        <span class="code-status" id="code-status"></span>
      </div>
      <div class="hint-box">💡 <b>힌트</b> · ${m.hint}</div>`;
    const statusEl = $('#code-status');
    const live = (code) => {
      const res = judge(code, room.pin, m.goal, m.want);
      statusEl.textContent = res.ok ? '✅ 정답! [업로드]로 동작을 확인하세요' : '';
      statusEl.classList.toggle('ok', res.ok);
    };
    const toolbox = room.blockSet === 'relay' ? TOOLBOX_RELAY : TOOLBOX_LED;
    blockEd = createBlockEditor($('#block-host'), { pin: room.pin, preset: presetFor(m, room.pin, room.blockSet), toolbox, onChange: live });
    setTimeout(() => live(blockEd.getCode()), 60);
    $('#b-run').onclick = () => runCode(blockEd.getCode(), m);
  }

  // ---- 버튼(체험) 모드 ----
  function renderButtonPane() {
    const m = mission();
    if (m.goal === 'pwm') {
      elPane.innerHTML = `
        <p class="pane-help">슬라이더로 <b>밝기</b>를 바꿔보세요. (0~255)</p>
        <div class="pwm-row"><input type="range" min="0" max="255" value="128" id="pwm"/><span class="pwm-val" id="pwm-val">128</span></div>
        <div class="btn-row"><button class="btn primary" id="b-apply">적용 ▶</button></div>`;
      const range = $('#pwm'), valEl = $('#pwm-val');
      range.oninput = () => { valEl.textContent = range.value; reflectPwm(+range.value); feedback('', '슬라이더를 움직여 밝기를 정하고 <b>적용</b>을 눌러요.'); };
      reflectPwm(128);
      feedback('', '슬라이더를 움직여 밝기를 정하고 <b>적용</b>을 눌러요.');
      $('#b-apply').onclick = () => {
        const v = +range.value;
        reflectPwm(v); hw(() => board.pwm(room.pin, v));
        if (v >= 1 && v <= 254) pass();
        else feedback('warn', '0이나 255 말고 그 사이 값으로 은은하게 만들어보세요!');
      };
    } else if (m.goal === 'blink') {
      elPane.innerHTML = `<p class="pane-help">버튼으로 불을 <b>깜빡여</b> 보세요.</p><div class="btn-row"><button class="btn primary" id="b-blink">불 깜빡이기 ▶</button></div>`;
      $('#b-blink').onclick = async () => {
        feedback('', '깜빡이는 중…');
        for (let i = 0; i < 3; i++) { reflectLed(true); hw(() => board.digital(room.pin, true)); await wait(350); reflectLed(false); hw(() => board.digital(room.pin, false)); await wait(350); }
        pass();
      };
    } else {
      const wantOn = m.goal !== 'off';
      elPane.innerHTML = `
        <p class="pane-help">스위치로 불을 ${wantOn ? '<b>켜</b>' : '<b>꺼</b>'} 보세요.</p>
        <div class="btn-row"><button class="btn" id="b-on">불 켜기 · L${room.pin}:1</button><button class="btn" id="b-off">불 끄기 · L${room.pin}:0</button></div>`;
      const set = (on) => {
        reflectLed(on); hw(() => board.digital(room.pin, on));
        $('#b-on').classList.toggle('on', on); $('#b-off').classList.toggle('on', !on);
        if (on === wantOn) pass();
      };
      $('#b-on').onclick = () => set(true);
      $('#b-off').onclick = () => set(false);
    }
  }

  // ---- 코드(도전) 모드 ----
  function renderCodePane() {
    const m = mission();
    elPane.innerHTML = `
      ${m.type === 'challenge' ? `<div class="challenge-banner">🎯 도전 · ${m.challenge}</div>` : ''}
      <div class="editor-host" id="editor-host"></div>
      <div class="code-actions">
        <button class="btn primary" id="b-upload">⚡ 업로드</button>
        <span class="code-status" id="code-status"></span>
      </div>
      <div class="hint-box">💡 <b>힌트</b> · ${m.hint}</div>`;
    const statusEl = $('#code-status');

    const live = (code) => {
      const res = judge(code, room.pin, m.goal, m.want);
      statusEl.textContent = res.ok ? '✅ 정답! [업로드]로 동작을 확인하세요' : '';
      statusEl.classList.toggle('ok', res.ok);
    };
    editor = createEditor($('#editor-host'), m.base, live);
    live(m.base);
    $('#b-upload').onclick = () => runCode(editor.getDoc(), m);
  }

  // 버튼/블록/코드 공통: 판정 → 화면 반영 → (연결 시)실물 반영 → 완료
  function runCode(code, m) {
    try {
      const res = judge(code, room.pin, m.goal, m.want);
      if (!res.ok) { feedback('warn', `아직이에요. ${res.reason}<br/><small>💡 ${m.hint}</small>`); return; }
      board.log('sys', `판정 통과 (${m.goal})`);
      if (m.goal === 'on') reflectLed(true);
      else if (m.goal === 'off') reflectLed(false);
      else if (m.goal === 'pwm') reflectPwm(res.summary.pwmVal ?? 128);
      if (board.connected) {
        feedback('', '업로드 중… 동작을 확인하세요!');
        execute(parseLoop(code), room.pin, board, { onStep: (on, v) => (v != null ? reflectPwm(v) : reflectLed(on)) })
          .then(() => { if (m.goal === 'on') reflectLed(true); if (m.goal === 'pwm') reflectPwm(res.summary.pwmVal ?? 128); pass(); })
          .catch((e) => { board.log('sys', '반영 실패(코드는 정답): ' + (e?.message ?? e)); pass(); });
      } else { board.log('sys', '보드 미연결 — 화면으로만 반영'); pass(); }
    } catch (e) { feedback('warn', '오류가 났어요: ' + (e?.message ?? e)); }
  }

  function render() {
    const m = mission();
    elMTitle.textContent = m.title;
    elMProg.textContent = `미션 ${mi + 1} / ${room.missions.length}`;
    elIntro.textContent = room.intro || '';
    elStory.innerHTML = `<b>${m.concept}</b> · ${m.story}`;
    feedback('', '');
    reflectLed(false);
    // play 미션은 버튼이 기본, challenge 미션은 블록이 기본(코드 탭도 제공)
    switchTab(m.type === 'challenge' ? 'block' : 'button');
  }

  function close() {
    try { editor?.destroy?.(); } catch (_) {}
    try { blockEd?.destroy?.(); } catch (_) {}
    backdrop.remove(); onClose?.();
  }

  render();
}
