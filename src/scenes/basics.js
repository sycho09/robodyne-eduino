// basics.js — 시작의 천막 · 피지컬 코딩 기초 미니게임.
// 보드 연결(사전 준비)과 분리된, '기초 이론 → 퀴즈 → 분류 미션 → 수료' 학습 부스.
// 하드웨어 없이 진행되는 개념 학습(밝은 카드형). 완료 시 progress.mark('basics').
import { mountEddieRig } from '../app/eddieRig.js';
import { sfx } from '../app/sfx.js';
import { progress } from '../app/progress.js';
import { celebrateRoom } from './celebrate.js';

const THEORY = [
  {
    icon: '📘', title: '피지컬 컴퓨팅이란?',
    body: '현실 세계를 <b>프로그래밍으로 다루는 것</b>이야. 센서로 주변을 <b>읽고</b>, 부품을 <b>움직여</b> 현실과 소통해! 게임 속 미니게임도 전부 이 원리야.',
    viz: `<div class="bx-viz">
      <span class="viz-node beat" style="animation-delay:0s"><span class="ic">👀</span>읽기</span>
      <span class="viz-arrow" style="animation-delay:.2s">➜</span>
      <span class="viz-node beat" style="animation-delay:.6s"><span class="ic">🤖</span>생각</span>
      <span class="viz-arrow" style="animation-delay:.8s">➜</span>
      <span class="viz-node beat" style="animation-delay:1.2s"><span class="ic">💡</span>동작</span>
    </div>`,
  },
  {
    icon: '🧠', title: '아두이노 = 작은 두뇌',
    body: '아두이노 보드가 우리의 <b>두뇌</b>야. <b>입력</b>을 받아 → <b>생각(처리)</b>하고 → <b>출력</b>으로 행동해. 모든 작품이 이 3단계로 움직여.',
    viz: `<div class="bx-viz viz-wire">
      <span class="viz-node"><span class="ic">🔘</span>입력</span>
      <span class="viz-track"><i class="viz-dot"></i></span>
      <span class="viz-node"><span class="ic">🧠</span>보드</span>
      <span class="viz-track"><i class="viz-dot" style="animation-delay:.9s"></i></span>
      <span class="viz-node"><span class="ic">💡</span>출력</span>
    </div>`,
  },
  {
    icon: '🔁', title: '입력 ⬇️ vs 출력 ⬆️',
    body: '<b>입력(센서)</b>은 정보를 <b>받아</b> — 버튼·온도·빛. <b>출력(액추에이터)</b>은 동작을 <b>만들어</b> — LED·부저·모터. 둘을 구분하는 게 기초의 핵심!',
    viz: `<div class="bx-viz viz-io">
      <div class="io-col in"><div class="io-h">입력 ⬇️</div><span>🔘</span><span>🌡️</span><span>🔆</span></div>
      <div class="io-col out"><div class="io-h">출력 ⬆️</div><span>💡</span><span>🔊</span><span>⚙️</span></div>
    </div>`,
  },
  {
    icon: '🔢', title: '디지털 vs 아날로그',
    body: '<b>디지털</b>은 0/1 두 값(켜짐·꺼짐) — 계단처럼 딱딱. <b>아날로그</b>는 0~1023처럼 <b>연속된 값</b>(밝기·소리 크기) — 물결처럼 부드러워.',
    viz: `<div class="bx-viz"><svg viewBox="0 0 240 80" width="240" height="80">
      <path class="viz-line dig" d="M5,60 H40 V20 H80 V60 H120 V20 H160 V60 H200 V20 H235"/>
      <path class="viz-line ana" d="M5,50 Q35,5 65,50 T125,50 T185,50 T235,50"/>
    </svg></div>`,
  },
  {
    icon: '🔌', title: '핀(Pin)으로 연결해',
    body: '부품은 아두이노의 <b>핀</b>에 꽂아 연결해. <b>디지털 핀(D)</b>은 0/1 신호, <b>아날로그 핀(A)</b>은 연속 값을 읽어. 그리고 <b>전원(VCC)·접지(GND)</b>는 꼭 맞게!',
    viz: `<div class="bx-viz viz-pins">
      ${['D13', 'D9', 'A0', 'GND', '5V'].map((p, i) => `<span class="pin" style="animation-delay:${i * 0.25}s">${p}</span>`).join('')}
    </div>`,
  },
  {
    icon: '⌨️', title: '코드 한 줄의 힘',
    body: '코드 <b>한 줄</b>이 부품을 움직여! 예를 들어 <b>digitalWrite(13, HIGH)</b> 한 줄이면 13번 핀의 LED가 <b>반짝</b> 켜져. 이제 직접 해보자!',
    viz: `<div class="bx-viz viz-code"><code>digitalWrite(13, <b>HIGH</b>);<span class="cur">▍</span></code><span class="viz-led">💡</span></div>`,
  },
];

const QUIZ = [
  { q: '온도 센서로 온도를 "읽는" 것은?', opts: ['입력 ⬇️', '출력 ⬆️'], answer: 0, ex: '센서로 정보를 받으니 입력이야!' },
  { q: '버튼처럼 눌림/안눌림 두 값만 있는 신호는?', opts: ['디지털', '아날로그'], answer: 0, ex: '두 값(0/1)뿐이라 디지털!' },
  { q: 'LED를 켜서 빛을 "내는" 것은?', opts: ['입력 ⬇️', '출력 ⬆️'], answer: 1, ex: '동작을 만들어내니 출력이야!' },
  { q: '아두이노가 일하는 순서로 맞는 것은?', opts: ['입력 → 처리 → 출력', '출력 → 입력 → 처리'], answer: 0, ex: '받고(입력) → 생각하고(처리) → 행동해(출력).' },
];

const PARTS = [
  { icon: '🔘', name: '버튼', cat: 'in' }, { icon: '🌡️', name: '온도 센서', cat: 'in' }, { icon: '🔆', name: '조도 센서', cat: 'in' },
  { icon: '💡', name: 'LED', cat: 'out' }, { icon: '🔊', name: '부저', cat: 'out' }, { icon: '⚙️', name: '모터', cat: 'out' },
];

export function showBasics(root, { onExit, onComplete } = {}) {
  root.innerHTML = `
    <div class="bx scene-fade">
      <div class="pm-bg" id="bx-bg"></div>
      <div class="pm-blobs"><span></span><span></span><span></span><span></span></div>
      <button class="snd-toggle" id="snd-toggle" title="소리 켜기/끄기">${sfx.muted ? '🔇' : '🔊'}</button>
      <div class="brand-badge"><span class="brand-dot"></span>Eduino&nbsp;<b>AI</b></div>
      <button class="bx-exit" id="bx-exit">✕ 나가기</button>

      <div class="bx-inner">
        <div class="bx-hero" id="bx-hero"><div class="bx-speech" id="bx-speech"></div></div>
        <div class="bx-card">
          <div class="bx-steps" id="bx-steps">
            <span class="bx-step" data-s="theory">📘 이론</span>
            <span class="bx-step" data-s="quiz">❓ 퀴즈</span>
            <span class="bx-step" data-s="mission">🎯 미션</span>
          </div>
          <div class="bx-body" id="bx-body"></div>
          <div class="bx-foot" id="bx-foot"></div>
        </div>
      </div>
    </div>`;

  const bgProbe = new Image();
  bgProbe.onload = () => { const b = root.querySelector('#bx-bg'); b.style.backgroundImage = `url(${bgProbe.src})`; b.classList.add('has-img'); };
  bgProbe.src = '/brand/basics-bg.webp';

  const rig = mountEddieRig(root.querySelector('#bx-hero'));
  const speech = root.querySelector('#bx-speech');
  const bodyEl = root.querySelector('#bx-body');
  const footEl = root.querySelector('#bx-foot');
  const stepEls = [...root.querySelectorAll('.bx-step')];

  const snd = root.querySelector('#snd-toggle');
  snd.onclick = () => { const m = sfx.toggle(); snd.textContent = m ? '🔇' : '🔊'; };
  root.querySelector('#bx-exit').onclick = () => onExit?.();

  function say(t) { speech.innerHTML = t; speech.classList.remove('pop'); void speech.offsetWidth; speech.classList.add('pop'); }
  rig.addEventListener('click', () => { sfx.pop(); say('천천히 따라와! 어렵지 않아 😎'); });

  const st = { phase: 'theory', ti: 0, qi: 0, quizDone: 0, picks: {} };

  function setStep() { stepEls.forEach((e) => e.classList.toggle('on', e.dataset.s === st.phase)); }

  function render() {
    setStep();
    if (st.phase === 'theory') renderTheory();
    else if (st.phase === 'quiz') renderQuiz();
    else renderMission();
  }

  // ── 이론 ──
  function renderTheory() {
    const c = THEORY[st.ti];
    say(`<b>${c.title}</b> 알려줄게!`);
    bodyEl.innerHTML = `
      <div class="bx-theory">
        <h3><span class="bx-ic-sm">${c.icon}</span> ${c.title}</h3>
        ${c.viz || ''}
        <p>${c.body}</p>
        <div class="bx-dots">${THEORY.map((_, i) => `<i class="${i === st.ti ? 'on' : ''}"></i>`).join('')}</div>
      </div>`;
    const last = st.ti === THEORY.length - 1;
    footEl.innerHTML = `
      ${st.ti > 0 ? '<button class="btn bx-ghost" id="bx-prev">◀ 이전</button>' : '<span></span>'}
      <button class="btn primary bx-next" id="bx-next">${last ? '퀴즈 풀기 ▶' : '다음 ▶'}</button>`;
    const prev = footEl.querySelector('#bx-prev'); if (prev) prev.onclick = () => { sfx.hover(); st.ti--; render(); };
    footEl.querySelector('#bx-next').onclick = () => {
      sfx.pop();
      if (last) { st.phase = 'quiz'; st.qi = 0; st.quizDone = 0; render(); }
      else { st.ti++; render(); }
    };
  }

  // ── 퀴즈 ──
  function renderQuiz() {
    const q = QUIZ[st.qi];
    say(`퀴즈 ${st.qi + 1} / ${QUIZ.length} — 골라봐!`);
    bodyEl.innerHTML = `
      <div class="bx-quiz">
        <div class="bx-qn">Q${st.qi + 1}. ${q.q}</div>
        <div class="bx-opts">${q.opts.map((o, i) => `<button class="bx-opt" data-i="${i}">${o}</button>`).join('')}</div>
        <div class="bx-fb" id="bx-fb"></div>
      </div>`;
    footEl.innerHTML = `<span class="bx-prog">맞힌 문제 ${st.quizDone} / ${QUIZ.length}</span>`;
    const fb = bodyEl.querySelector('#bx-fb');
    let answered = false;
    bodyEl.querySelectorAll('.bx-opt').forEach((b) => {
      b.onclick = () => {
        if (answered) return; answered = true;
        const i = +b.dataset.i, ok = i === q.answer;
        bodyEl.querySelectorAll('.bx-opt').forEach((x) => x.classList.add('locked'));
        b.classList.add(ok ? 'right' : 'wrong');
        if (!ok) bodyEl.querySelector(`.bx-opt[data-i="${q.answer}"]`).classList.add('right');
        if (ok) { sfx.start(); st.quizDone++; say('정답이야! 🎉'); }
        else { sfx.pop(); say('아쉬워! 정답을 같이 보자 👀'); }
        fb.innerHTML = `<span class="${ok ? 'good' : 'bad'}">${ok ? '⭕ 정답' : '❌ 오답'}</span> · ${q.ex}`;
        const last = st.qi === QUIZ.length - 1;
        footEl.innerHTML = `<span class="bx-prog">맞힌 문제 ${st.quizDone} / ${QUIZ.length}</span>
          <button class="btn primary bx-next" id="bx-qnext">${last ? '미션 도전 ▶' : '다음 문제 ▶'}</button>`;
        footEl.querySelector('#bx-qnext').onclick = () => {
          sfx.pop();
          if (last) { st.phase = 'mission'; render(); }
          else { st.qi++; render(); }
        };
      };
    });
  }

  // ── 미션: 부품을 입력/출력으로 분류 ──
  function renderMission() {
    say('마지막! 부품을 <b>입력</b>과 <b>출력</b>으로 나눠줘 🎯');
    st.picks = {};
    bodyEl.innerHTML = `
      <div class="bx-mission">
        <p class="bx-mtitle">각 부품이 <b>입력(센서)</b>인지 <b>출력(동작)</b>인지 골라봐!</p>
        <div class="bx-rows">
          ${PARTS.map((p, i) => `
            <div class="bx-row" data-i="${i}">
              <span class="bx-part">${p.icon} ${p.name}</span>
              <span class="bx-choice">
                <button class="bx-pick" data-i="${i}" data-c="in">입력 ⬇️</button>
                <button class="bx-pick" data-i="${i}" data-c="out">출력 ⬆️</button>
              </span>
            </div>`).join('')}
        </div>
      </div>`;
    footEl.innerHTML = `<span class="bx-prog" id="bx-mprog">0 / ${PARTS.length} 선택</span>
      <button class="btn primary bx-next" id="bx-check" disabled>정답 확인 ▶</button>`;
    const check = footEl.querySelector('#bx-check');
    const mprog = footEl.querySelector('#bx-mprog');
    bodyEl.querySelectorAll('.bx-pick').forEach((b) => {
      b.onclick = () => {
        const i = +b.dataset.i;
        st.picks[i] = b.dataset.c; sfx.hover();
        bodyEl.querySelectorAll(`.bx-pick[data-i="${i}"]`).forEach((x) => x.classList.toggle('sel', x === b));
        const n = Object.keys(st.picks).length;
        mprog.textContent = `${n} / ${PARTS.length} 선택`;
        check.disabled = n < PARTS.length;
      };
    });
    check.onclick = () => {
      let allOk = true;
      PARTS.forEach((p, i) => {
        const ok = st.picks[i] === p.cat;
        const row = bodyEl.querySelector(`.bx-row[data-i="${i}"]`);
        row.classList.remove('ok', 'no'); row.classList.add(ok ? 'ok' : 'no');
        if (!ok) allOk = false;
      });
      if (allOk) { sfx.start(); finish(); }
      else { sfx.pop(); say('거의 다 왔어! 빨간 줄을 다시 골라봐 💪'); check.textContent = '다시 확인 ▶'; }
    };
  }

  function finish() {
    progress.mark('basics');
    say('완벽해! 기초 졸업 🎓');
    setTimeout(() => celebrateRoom({
      title: '기초 수료! 🎓',
      message: '피지컬 코딩 기초를 마쳤어요 — <b>🎓 기초 수료증</b> 획득!<br/>이제 <b>기초의 전당</b>이 열렸어요.',
      exitLabel: '광장으로 ▶',
      onExit: () => (onComplete || onExit)?.(),
    }), 600);
  }

  setTimeout(() => render(), 120);
}
