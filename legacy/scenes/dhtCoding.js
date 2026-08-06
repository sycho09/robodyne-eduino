// dhtCoding.js — DHT-11 학습방 1단계: 코딩(블록/코드)으로 "온습도 읽어 출력" 업로드.
// 통과하면 모니터링 방으로 진입.

import { createEditor } from '../editor/codeEditor.js';
import { createBlockEditor, TOOLBOX_DHT } from '../editor/blockEditor.js';
import eddieSvg from '../assets/eddie.svg?raw';

const BASE =
  '#include <DHT.h>\n' +
  'DHT dht(2, DHT11);   // DATA = D2\n\n' +
  'void setup() {\n' +
  '  Serial.begin(115200);\n' +
  '  dht.begin();\n' +
  '}\n\n' +
  'void loop() {\n' +
  '  dht.read();\n' +
  '  Serial.println(dht.temperature);  // 온도 출력\n' +
  '  Serial.println(dht.humidity);     // 습도 출력\n' +
  '  delay(1000);\n' +
  '}\n';

const PRESET = [{ type: 'dht_read' }, { type: 'dht_temp' }, { type: 'dht_hum' }, { type: 'wait', fields: { MS: 1000 } }];
const SETUP_DHT = '  Serial.begin(115200);\n  dht.begin();';

function judgeDht(code) {
  const read = /\.\s*read\s*\(/.test(code) || /온습도\s*읽기/.test(code);
  const print = /Serial\s*\.\s*print/i.test(code) || /println/i.test(code) || /출력/.test(code);
  if (!read) return { ok: false, reason: '온습도를 읽는 부분(dht.read)이 필요해요.' };
  if (!print) return { ok: false, reason: '값을 출력하는 부분(Serial.println)이 필요해요.' };
  return { ok: true, reason: '센서 값을 읽고 출력해요! ✨' };
}

export function showDhtCoding(root, { onDone, onExit } = {}) {
  let tab = 'block', editor = null, blockEd = null;

  root.innerHTML = `
    <div class="scene coding-scene scene-fade">
      <header class="app-header">
        <div class="brand"><span class="brand-dot"></span><strong>Eduino AI</strong><span class="brand-sep">:</span><b class="brand-sub">DHT-11</b><span class="crumb">1. 코딩</span></div>
        <button class="btn btn-sm" id="cod-exit">🚪 복도로</button>
      </header>
      <div class="coding-body">
        <div class="coding-left">
          <div class="room-eddie">${eddieSvg}</div>
          <div class="room-intro">온습도 센서 값을 <b>읽어서 출력</b>하는 코드를 올려보자!<br/>업로드하면 실시간 모니터링 방으로 들어가요.</div>
        </div>
        <div class="coding-main">
          <div class="room-tabs">
            <button class="room-tab" data-tab="block">🧩 블록</button>
            <button class="room-tab" data-tab="code">⌨️ 코드</button>
          </div>
          <div class="room-tabpane" id="cod-pane"></div>
          <div class="room-feedback" id="cod-fb"></div>
        </div>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const pane = $('#cod-pane'), fb = $('#cod-fb');
  $('#cod-exit').onclick = () => { dispose(); onExit?.(); };
  root.querySelectorAll('.room-tab').forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));

  function dispose() { try { editor?.destroy?.(); } catch (_) {} try { blockEd?.destroy?.(); } catch (_) {} editor = null; blockEd = null; }
  function feedback(kind, html) { fb.className = 'room-feedback ' + kind; fb.innerHTML = html; }

  function pass() {
    feedback('ok', `<div class="fb-title">업로드 완료! 🎉 온습도 코드가 올라갔어요</div>
      <button class="btn primary" id="cod-next">모니터링 방으로 ▶</button>`);
    $('#cod-next').onclick = () => { dispose(); onDone?.(); };
  }
  function run(code) {
    const res = judgeDht(code);
    if (!res.ok) { feedback('warn', `아직이에요. ${res.reason}`); return; }
    pass();
  }

  function switchTab(t) {
    tab = t;
    root.querySelectorAll('.room-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    dispose();
    pane.innerHTML = '';
    if (t === 'block') renderBlock(); else renderCode();
  }
  function renderBlock() {
    pane.innerHTML = `
      <div class="challenge-banner">🎯 블록을 쌓아 "온습도 읽기 → 출력 → 기다리기"를 만들고 업로드!</div>
      <div class="block-host" id="cod-block"></div>
      <div class="code-actions"><button class="btn primary" id="cod-run">⚡ 업로드</button><span class="code-status" id="cod-st"></span></div>
      <div class="hint-box">💡 블록 서랍에서 🌡️온습도 읽기 · 온도/습도 출력 · 기다리기 블록을 끼워 넣어요.</div>`;
    blockEd = createBlockEditor($('#cod-block'), { pin: 2, preset: PRESET, toolbox: TOOLBOX_DHT, setup: SETUP_DHT, onChange: live });
    setTimeout(() => live(blockEd.getCode()), 60);
    $('#cod-run').onclick = () => run(blockEd.getCode());
  }
  function renderCode() {
    pane.innerHTML = `
      <div class="editor-host" id="cod-ed"></div>
      <div class="code-actions"><button class="btn primary" id="cod-run">⚡ 업로드</button><span class="code-status" id="cod-st"></span></div>
      <div class="hint-box">💡 <b>dht.read()</b> 로 읽고 <b>Serial.println(...)</b> 로 온도·습도를 출력해요.</div>`;
    editor = createEditor($('#cod-ed'), BASE, live);
    live(BASE);
    $('#cod-run').onclick = () => run(editor.getDoc());
  }
  function live(code) {
    const st = $('#cod-st'); if (!st) return;
    const ok = judgeDht(code).ok;
    st.textContent = ok ? '✅ 정답! [업로드]로 올려보세요' : '';
    st.classList.toggle('ok', ok);
  }

  switchTab('block');
}
