// basics.js — 시작의 천막 · 피지컬 코딩 기초 미니게임.
// 보드 연결(사전 준비)과 분리된, '기초 이론 → 퀴즈 → 분류 미션 → 수료' 학습 부스.
// 하드웨어 없이 진행되는 개념 학습(밝은 카드형). 완료 시 progress.mark('basics').
import { mountEddieRig } from '../app/eddieRig.js';
import { sfx } from '../app/sfx.js';
import { progress } from '../app/progress.js';
import { celebrateRoom } from './celebrate.js';
import { icon, iconOrb } from '../app/icons.js';
import { results } from '../app/results.js';

// body 는 '한 줄 = 한 생각' 단위로 끊는다.
// 원거리(빔프로젝터 3~5m)에서는 문단이 글자가 아니라 '모양'으로 먼저 읽힌다. 줄바꿈이 의미와
// 어긋나면 바로 위 viz 의 구조(2단 대비·3단 체인)와 문장이 연결되지 않는다 — 그래서 흘림 대신 끊는다.
// k: 강조색 키. 같은 슬라이드 viz 의 색면과 '같은 색'을 써서 문장과 그림을 눈으로 잇는다.
//    in·ana = 파랑 / out·dig = 분홍 / key = 마무리 한 줄(앞의 대비와 선으로 분리).
//    색은 이 두 가지만 쓴다 — 원거리에서는 색이 늘수록 판독이 느려진다.
const THEORY = [
  {
    icon: 'book', title: '피지컬 컴퓨팅이란?',
    body: [
      { t: '현실 세계를 <b>프로그래밍으로 다루는 것</b>이야' },
      { t: '센서로 주변을 <b>읽고</b>, 부품을 <b>움직여</b> 현실과 소통해!' },
      { t: '게임 속 미니게임도 전부 이 원리야' },
    ],
    viz: `<div class="bx-viz">
      <span class="viz-node beat" style="animation-delay:0s">${iconOrb('eye', 'read')}읽기</span>
      <span class="viz-arrow" style="animation-delay:.2s">➜</span>
      <span class="viz-node beat" style="animation-delay:.6s">${iconOrb('robot', 'think')}생각</span>
      <span class="viz-arrow" style="animation-delay:.8s">➜</span>
      <span class="viz-node beat" style="animation-delay:1.2s">${iconOrb('bulb', 'act')}동작</span>
    </div>`,
  },
  {
    icon: 'brain', title: '아두이노 = 작은 두뇌',
    body: [
      { t: '아두이노 보드가 우리의 <b>두뇌</b>야' },
      { t: '<b>입력</b>을 받아 → <b>생각(처리)</b>하고 → <b>출력</b>으로 행동해' },
      { t: '모든 작품이 이 3단계로 움직여' },
    ],
    viz: `<div class="bx-viz viz-wire">
      <span class="viz-node">${iconOrb('press', 'in', 36)}입력</span>
      <span class="viz-track"><i class="viz-dot"></i></span>
      <span class="viz-node">${iconOrb('board', 'think', 36)}보드</span>
      <span class="viz-track"><i class="viz-dot" style="animation-delay:.9s"></i></span>
      <span class="viz-node">${iconOrb('bulb', 'act', 36)}출력</span>
    </div>`,
  },
  {
    icon: 'wave', title: '입력 vs 출력',
    body: [
      { k: 'in', t: '<b>입력(센서)</b>은 정보를 <b>받아</b> — 버튼·온도·빛' },
      { k: 'out', t: '<b>출력(액추에이터)</b>은 동작을 <b>만들어</b> — LED·부저·모터' },
      { k: 'key', t: '둘을 구분하는 게 <b>기초의 핵심</b>!' },
    ],
    viz: `<div class="bx-viz viz-io">
      <div class="io-col in">
        <div class="io-h">${icon('arrow-in', 21)}입력</div>
        <div class="io-row"><span>${icon('press', 36)}</span><span>${icon('thermometer', 36)}</span><span>${icon('sun', 36)}</span></div>
      </div>
      <div class="io-col out">
        <div class="io-h">${icon('arrow-out', 21)}출력</div>
        <div class="io-row"><span>${icon('bulb', 36)}</span><span>${icon('speaker', 36)}</span><span>${icon('motor', 36)}</span></div>
      </div>
    </div>`,
  },
  {
    icon: 'digital', title: '디지털 vs 아날로그',
    // 예시(밝기·소리 크기)는 마무리 줄로 올렸다 — 원문 그대로 두면 아날로그 줄만 두 줄로 접혀
    // 두 줄의 대비가 1:2 로 깨진다. 슬라이드 ③ 과 같은 3줄 구조로 맞춘다.
    body: [
      { k: 'dig', t: '<b>디지털</b>은 0/1 두 값(켜짐·꺼짐) — 계단처럼 딱딱' },
      { k: 'ana', t: '<b>아날로그</b>는 0~1023처럼 <b>연속된 값</b> — 물결처럼 부드러워' },
      { k: 'key', t: '밝기·소리 크기처럼 <b>중간 값</b>이 있으면 아날로그!' },
    ],
    viz: `<div class="bx-viz"><svg viewBox="0 0 240 80" width="240" height="80">
      <path class="viz-line dig" d="M5,60 H40 V20 H80 V60 H120 V20 H160 V60 H200 V20 H235"/>
      <path class="viz-line ana" d="M5,50 Q35,5 65,50 T125,50 T185,50 T235,50"/>
    </svg></div>`,
  },
  {
    icon: 'pin', title: '핀(Pin)으로 연결해',
    // D/A 도 대비쌍이라 ④ 와 같은 색으로 나눈다 — 4줄이 되지만, 붙여 두면 어차피 접혀서 줄 수는 같다.
    body: [
      { t: '부품은 아두이노의 <b>핀</b>에 꽂아 연결해' },
      { k: 'dig', t: '<b>디지털 핀(D)</b> — 0/1 신호' },
      { k: 'ana', t: '<b>아날로그 핀(A)</b> — 연속된 값' },
      { k: 'key', t: '<b>전원(VCC)·접지(GND)</b>는 꼭 맞게!' },
    ],
    viz: `<div class="bx-viz viz-pins">
      ${['D13', 'D9', 'A0', 'GND', '5V'].map((p, i) => `<span class="pin" style="animation-delay:${i * 0.25}s">${p}</span>`).join('')}
    </div>`,
  },
  {
    icon: 'code', title: '코드 한 줄의 힘',
    body: [
      { t: '코드 <b>한 줄</b>이 부품을 움직여!' },
      { t: '예를 들어 <b>digitalWrite(13, HIGH)</b> 한 줄이면' },
      { t: '13번 핀의 LED가 <b>반짝</b> 켜져 — 이제 직접 해보자!' },
    ],
    viz: `<div class="bx-viz viz-code"><code>digitalWrite(13, <b>HIGH</b>);<span class="cur">▍</span></code><span class="viz-led">${icon('bulb', 44)}</span></div>`,
  },
];

// 입력/출력 선택지 — 퀴즈와 미션이 같은 라벨을 쓰므로 한 곳에서 만든다.
const OPT_IN = `${icon('arrow-in', 20)}입력`;
const OPT_OUT = `${icon('arrow-out', 20)}출력`;

const QUIZ = [
  { q: '온도 센서로 온도를 "읽는" 것은?', opts: [OPT_IN, OPT_OUT], answer: 0, ex: '센서로 정보를 받으니 입력이야!' },
  { q: '버튼처럼 눌림/안눌림 두 값만 있는 신호는?', opts: ['디지털', '아날로그'], answer: 0, ex: '두 값(0/1)뿐이라 디지털!' },
  { q: 'LED를 켜서 빛을 "내는" 것은?', opts: [OPT_IN, OPT_OUT], answer: 1, ex: '동작을 만들어내니 출력이야!' },
  { q: '아두이노가 일하는 순서로 맞는 것은?', opts: ['입력 → 처리 → 출력', '출력 → 입력 → 처리'], answer: 0, ex: '받고(입력) → 생각하고(처리) → 행동해(출력).' },
];

const PARTS = [
  { icon: 'press', name: '버튼', cat: 'in' }, { icon: 'thermometer', name: '온도 센서', cat: 'in' }, { icon: 'sun', name: '조도 센서', cat: 'in' },
  { icon: 'bulb', name: 'LED', cat: 'out' }, { icon: 'speaker', name: '부저', cat: 'out' }, { icon: 'motor', name: '모터', cat: 'out' },
];

export function showBasics(root, { onExit, onComplete } = {}) {
  root.innerHTML = `
    <div class="bx scene-fade">
      <div class="pm-bg" id="bx-bg"></div>
      <div class="pm-blobs"><span></span><span></span><span></span><span></span></div>
      <button class="snd-toggle" id="snd-toggle" title="소리 켜기/끄기">${sfx.muted ? icon('volume-off', 18) : icon('speaker', 18)}</button>
      <div class="brand-badge"><span class="brand-dot"></span>Eduino&nbsp;<b>AI</b></div>
      <button class="bx-exit" id="bx-exit">✕ 나가기</button>

      <div class="bx-inner">
        <div class="bx-hero" id="bx-hero"><div class="bx-speech" id="bx-speech"></div></div>
        <div class="bx-card">
          <div class="bx-steps" id="bx-steps">
            <span class="bx-step" data-s="theory">${icon('book', 21)} 이론</span>
            <span class="bx-step" data-s="quiz">${icon('question', 21)} 퀴즈</span>
            <span class="bx-step" data-s="mission">${icon('flag', 21)} 미션</span>
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
  snd.onclick = () => { const m = sfx.toggle(); snd.innerHTML = m ? icon('volume-off', 18) : icon('speaker', 18); };
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
    // 문자열도 받아 준다 — 줄 나눌 게 없는 본문은 굳이 배열로 감싸지 않는다.
    const lines = Array.isArray(c.body) ? c.body : [{ t: c.body }];
    bodyEl.innerHTML = `
      <div class="bx-theory">
        <h3><span class="bx-ic-sm">${icon(c.icon, 29)}</span> ${c.title}</h3>
        ${c.viz || ''}
        <div class="bx-lines">${lines.map((l) => `<p class="bx-line${l.k ? ` k-${l.k}` : ''}">${l.t}</p>`).join('')}</div>
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
        fb.innerHTML = `<span class="${ok ? 'good' : 'bad'}">${icon(ok ? 'check' : 'x-mark', 20)} ${ok ? '정답' : '오답'}</span> · ${q.ex}`;
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
              <span class="bx-part">${icon(p.icon, 26)} ${p.name}</span>
              <span class="bx-choice">
                <button class="bx-pick" data-i="${i}" data-c="in">${OPT_IN}</button>
                <button class="bx-pick" data-i="${i}" data-c="out">${OPT_OUT}</button>
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
    // 이론 과정이라 등급을 매기지 않는다 — 마쳤다는 것 자체가 통과다.
    // 퀴즈 성적은 기록으로만 남겨 어디가 약했는지 나중에 돌아볼 수 있게 한다.
    results.record('basics', {
      accuracy: 100, passed: true, summary: '피지컬 코딩 기초',
      metrics: [
        { label: '퀴즈', value: `${st.quizDone}/${QUIZ.length}` },
        { label: '부품 분류', value: '완료' },
      ],
    });
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
