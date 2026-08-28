/* Gesture 심화 미션 로직: 학습한 모델로 하는 가위바위보 대결 및 실제 모델 기반 혼동행렬 시뮬레이션. */
/* ════ 고급-응용: 가위바위보 대결 ════ */
let dmStep = 1;

/* 학습시킨 클래스를 순서대로 여기에 잇는다 (0=바위, 1=보, 2=가위).
   초급의 classifyRPS() 는 펴진 손가락 개수를 세는 규칙이고, 여기서는 학생이 학습시킨
   모델이 판정한다 — 같은 손을 두 방식이 어떻게 다르게 읽는지가 이 단계의 핵심이다. */
const RPS_MOVES = [
  { name: '바위', ic: 'fist' },
  { name: '보', ic: 'palm' },
  { name: '가위', ic: 'victory' }
];
/* a 가 b 를 이기면 1. 바위>가위, 보>바위, 가위>보 가 모두 (a-b+3)%3===1 로 떨어진다. */
function rpsBeats(a, b) { return (a - b + 3) % 3 === 1; }

function dmEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
/* 학습에 실제로 쓰인 클래스만 — trainHead 와 같은 기준(8장 이상)이라 인덱스가 어긋나지 않는다. */
function dmUsable() {
  if (typeof classes === 'undefined') return [];
  return classes.filter(c => c.samples.length >= 8);
}

/* 1단계: 내 제스처가 무엇에 연결되는지 보여준다. */
function renderRpsMap() {
  const box = $('dm-map');
  if (!box) return;
  const usable = dmUsable();
  box.innerHTML = RPS_MOVES.map((mv, i) => {
    /* 학습에 쓰인 클래스가 모자라면 그 자리의 원래 클래스를 보여 주고 왜 빠졌는지 알린다. */
    const c = usable[i];
    const raw = (typeof classes !== 'undefined') ? classes[i] : null;
    const name = c ? c.name : (raw ? raw.name : '아직 없음');
    const sub = c ? c.samples.length + '장 학습됨'
      : raw ? '데이터 ' + raw.samples.length + '장 — 8장 이상 모아야 합니다'
        : '중급에서 제스처를 하나 더 만들어 주세요';
    return '<div class="dm-map-row' + (c ? '' : ' missing') + '">' +
      '<span class="dm-map-cls">' + dmEsc(name) + '<small>' + sub + '</small></span>' +
      '<span class="dm-map-arrow">→</span>' +
      '<span class="dm-map-mv"><span class="ic-inline" data-ic="' + mv.ic + '"></span>' + mv.name + '</span>' +
      '</div>';
  }).join('');
  if (window.EduinoIcons) EduinoIcons.mount(box);
}

function demoEnter() {
  const ready = !!(typeof head !== 'undefined' && head);
  
  const gate = $('dm-gate');
  if (gate) gate.hidden = ready;
  
  document.querySelectorAll('#flow-demo .fstep').forEach(el => {
    el.disabled = !ready;
  });

  if (!ready) {
    document.querySelectorAll('#panel-demo .dstep').forEach(el => {
      el.hidden = true;
    });
    return;
  }
  
  goToDmStep(dmStep);
}
if (typeof window !== 'undefined') window.gestureDemoEnter = demoEnter;

const btnDmToTrain = $('dm-to-train');
if (btnDmToTrain) {
  btnDmToTrain.onclick = () => {
    document.querySelector('.step[data-step="train"]').click();
  };
}

let dmAnimTimer = null;
function goToDmStep(w) {
  dmStep = w;
  document.querySelectorAll('#flow-demo .fstep').forEach(el => {
    const sw = +el.dataset.dw;
    el.classList.toggle('active', sw === w);
    el.classList.toggle('done', sw < w);
    const fn = el.querySelector('.fn');
    if (fn) fn.textContent = sw < w ? '✓' : sw;
  });
  document.querySelectorAll('#panel-demo .dstep').forEach(el => {
    el.hidden = (+el.dataset.dw !== w);
  });
  
  /* 최종 매핑 단계는 이 카드 바깥에 있으므로(index.html 에서 카드가 먼저 닫힌다)
     그 단계에서는 빈 카드가 남지 않게 통째로 숨긴다. 단계 병합으로 4 → 3 이 되었다. */
  const mainCard = $('dm-main-card');
  if (mainCard) mainCard.hidden = (w === 3);
  
  if (dmAnimTimer) { clearInterval(dmAnimTimer); dmAnimTimer = null; }

  // 대결(3단계)을 떠나면 데모 카메라를 끄고 진행 중인 카운트다운도 접는다
  if (w !== 3) {
    rpsAbort();
    if (typeof stopDemoCam !== 'undefined') stopDemoCam();
  }

  if (w === 1) renderRpsMap();

  if (w === 2) {
    const hand = $('dm-cam-hand');
    const bar = $('dm-cam-bar');
    const txt = $('dm-cam-text');
    const m = dmMeasure(true);
    if (!m) {
      if (bar) { bar.style.width = '0%'; bar.style.background = 'var(--amber)'; }
      if (hand) hand.classList.remove('pulse');
      if (txt) { txt.style.color = 'var(--amber)'; txt.textContent = '[2. 중급 · 제작] 코스에서 학습을 먼저 마쳐 주세요'; }
    } else {
      /* 지어낸 sin 파형 대신, [2. 중급 · 제작] 코스에서 모은 샘플의 실제 확신도를 차례로 재생한다.
         자기 데이터가 애매하면 막대도 실제로 낮게 흔들린다. */
      const conf = m.rows.map(r => Math.max.apply(null, r.p) * 100);
      let i = 0;
      dmAnimTimer = setInterval(() => {
        const val = conf[i++ % conf.length];
        const thres = +$('dm-slider').value;
        const marker = $('dm-cam-thres-marker');
        if (marker) marker.style.left = thres + '%';
        
        if (bar) bar.style.width = val.toFixed(1) + '%';
        if (val >= thres) {
          if (bar) bar.style.background = 'var(--green)';
          if (txt) { txt.style.color = 'var(--green)'; txt.textContent = 'AI 확신도: ' + Math.round(val) + '% (작동)'; }
          if (hand) hand.classList.add('pulse');
        } else {
          if (bar) bar.style.background = 'var(--amber)';
          if (txt) { txt.style.color = 'var(--amber)'; txt.textContent = 'AI 확신도: ' + Math.round(val) + '% (미반응)'; }
          if (hand) hand.classList.remove('pulse');
        }
      }, 150);
    }
  }

  /* 표를 슬라이더와 같은 화면에 두었으므로 진입 시 한 번 그려 둔다.
     dmMeasure(true) 는 위 w === 2 블록이 이미 호출했다. */
  if (w === 2) paintConfusion();

  if (w === 3) {
    window.CourseDashboard && CourseDashboard.markDone('demo');
    const resThres = $('dm-res-thres');
    if (resThres) resThres.textContent = $('dm-slider').value + '%';
    rpsReset();
  }
}

/* 학습된 모델에 학생이 수집한 원본 데이터를 다시 넣어 실제 확신도를 측정합니다 (Self-prediction 방식). */
let dmRows = null;   // { names, rows:[{ truth, p }] } — 임계값과 무관하므로 단계 진입 때 한 번만 잰다
function dmMeasure(force) {
  if (dmRows && !force) return dmRows;
  dmRows = null;
  if (typeof tf === 'undefined' || typeof head === 'undefined' || typeof classes === 'undefined') return null;
  if (!head) return null;
  const usable = classes.filter(c => c.samples.length >= 8);
  if (usable.length < 2) return null;
  const rows = [];
  usable.forEach((c, idx) => {
    const valid = c.samples.filter(s => s.length === 42 && s.every(v => isFinite(v)));
    if (!valid.length) return;
    const probs = tf.tidy(() => head.predict(tf.tensor2d(valid)).arraySync());
    probs.forEach(p => rows.push({ truth: idx, p }));
  });
  if (rows.length < 2) return null;
  dmRows = { names: usable.map(c => c.name), rows };
  return dmRows;
}
/* 다시 학습하면 앞서 잰 값은 버린다(새 head 로 다시 재야 한다). */
(function () {
  const bt = $('btn-train');
  if (bt) bt.addEventListener('click', () => { dmRows = null; });
})();

/* 기준선을 못 넘으면 '무시', 넘었는데 다른 클래스면 '오인'.
   임계값만 바꿔 다시 세는 것이므로 예측은 다시 돌리지 않는다. */
function confusionAt(thres) {
  const m = dmMeasure();
  if (!m) return null;
  const cut = thres / 100;
  const n = m.names.length;
  const per = m.names.map(() => ({ right: 0, wrong: 0, miss: 0 }));
  /* mat[실제][예측] · missPer[실제] — 합계만으로는 표를 클래스 수만큼 그릴 수 없다. */
  const mat = m.names.map(() => new Array(n).fill(0));
  const missPer = m.names.map(() => 0);
  m.rows.forEach(r => {
    let top = 0;
    for (let i = 1; i < r.p.length; i++) if (r.p[i] > r.p[top]) top = i;
    if (r.p[top] < cut) { per[r.truth].miss++; missPer[r.truth]++; }
    else {
      mat[r.truth][top]++;
      if (top === r.truth) per[r.truth].right++;
      else per[r.truth].wrong++;
    }
  });
  const wrong = per.reduce((s, x) => s + x.wrong, 0);
  const miss = per.reduce((s, x) => s + x.miss, 0);
  const verdict = miss > wrong * 1.8 ? 'miss' : wrong > miss * 1.8 ? 'wrong' : 'balanced';
  return { per, mat, missPer, names: m.names, wrong, miss, total: m.rows.length, verdict };
}

function paintConfusion() {
  const slider = $('dm-slider');
  const tbl = $('dm-cm-table');
  const lead = $('dm-cm-lead');
  const note = $('dm-cm-note');
  if (!slider || !tbl) return;
  const c = confusionAt(+slider.value);

  if (!c) {
    tbl.innerHTML = '';
    if (lead) lead.innerHTML = '<b>테스트 샘플 적용 결과</b>';
    if (note) note.innerHTML = '이 표는 <b>[2. 중급 · 제작] 코스에서 직접 모은 데이터</b>로 채워집니다. 제스처를 각각 <b>8장 이상</b> 모아 학습을 마친 뒤 다시 오세요.';
    return;
  }

  /* 표는 학습시킨 클래스 수를 그대로 따른다 — 2개든 4개든 빠지는 클래스가 없다. */
  const ic = (i) => (RPS_MOVES[i] ? '<span class="ic-inline" data-ic="' + RPS_MOVES[i].ic + '"></span> ' : '');
  let html = '<thead><tr><th>실제 동작 \ AI 예측</th>';
  c.names.forEach((n, i) => { html += '<th>' + ic(i) + dmEsc(n) + '</th>'; });
  html += '<th>미반응</th></tr></thead><tbody>';
  c.names.forEach((n, r) => {
    html += '<tr><th>' + ic(r) + dmEsc(n) + '</th>';
    c.names.forEach((_, p) => {
      const v = c.mat[r][p];
      const cls = r === p ? ' class="succ"' : (v ? ' class="err"' : '');
      html += '<td' + cls + '>' + v + (r === p ? ' (성공)' : v ? ' (오인)' : '') + '</td>';
    });
    html += '<td>' + c.missPer[r] + (c.missPer[r] ? ' (무시)' : '') + '</td></tr>';
  });
  tbl.innerHTML = html + '</tbody>';
  if (window.EduinoIcons) EduinoIcons.mount(tbl);

  if (lead) lead.innerHTML = '<b>테스트 샘플 ' + c.total + '개 적용 결과</b><br><span class="dm-cm-sub">슬라이더를 움직이면 결과가 실시간으로 바뀝니다.</span>';
  if (!note) return;
  if (c.verdict === 'miss') {
    note.innerHTML = '임계값이 높아 <b>오인은 거의 없지만</b> ' + c.total + '개 중 ' + c.miss + '개가 아예 무시됐습니다. 안전하지만 답답한 설정입니다.';
  } else if (c.verdict === 'wrong') {
    note.innerHTML = '임계값이 낮아 <b>반응은 잘 하지만</b> ' + c.total + '개 중 ' + c.wrong + '개를 엉뚱한 동작으로 읽었습니다. 오작동이 잦은 설정입니다.';
  } else {
    note.innerHTML = '오인 ' + c.wrong + '개, 무시 ' + c.miss + '개로 균형이 잡힌 설정입니다. 어느 쪽 실수가 더 치명적인지에 따라 임계값을 옮기면 됩니다.';
  }
}
if (typeof window !== 'undefined') window.paintConfusion = paintConfusion;
if (typeof window !== 'undefined') window.goToDmStep = goToDmStep;

document.querySelectorAll('#flow-demo .fstep').forEach(el => {
  el.onclick = () => goToDmStep(+el.dataset.dw);
});

const dSlider = $('dm-slider');
// Step 2의 경고도 Step 3 혼동행렬과 같은 모델(confusionAt)에서 뽑아, 두 화면이 어긋나지 않게 한다.
function paintThresWarn() {
  if (!dSlider) return;
  const v = +dSlider.value;
  const valEl = $('dm-slider-val');
  if (valEl) valEl.textContent = v + '%';
  dSlider.style.setProperty('--p', v + '%');
}
/* 경고 박스와 혼동행렬은 같은 confusionAt() 결과의 두 얼굴이라 항상 함께 갱신한다.
   confusionAt() 은 미리 잰 예측을 재집계만 하므로 드래그 중 매 입력마다 불러도 싸다. */
function paintThres() { paintThresWarn(); paintConfusion(); }
if (dSlider) {
  dSlider.oninput = paintThres;
  paintThres(); // 초기 표시가 슬라이더 기본값과 어긋나지 않도록 한 번 그려 둔다
}
/* 분석 퀴즈 코드는 사용자 피드백에 따라 해설 박스로 대체되어 제거되었습니다. */
/* goToDmStep 으로 넘어갈 때 말고는 스스로 멈추지 않는 데모 타이머 — 실습을 떠날 때 끈다. */
(window.CoursePracticeLeave = window.CoursePracticeLeave || []).push(() => {
  if (dmAnimTimer) { clearInterval(dmAnimTimer); dmAnimTimer = null; }
  if (typeof demoCam !== 'undefined' && demoCam && demoCam.stream) demoCam.stop();
  if (typeof demoRaf !== 'undefined' && demoRaf) cancelAnimationFrame(demoRaf);
});

/* 데모 카메라 및 실시간 예측 루프 */
let demoCam = null;
let demoRaf = null;
/* 매 프레임의 최신 판정을 담아 둔다 — 카운트다운이 끝나는 순간 이 값을 집는다.
   { mv, conf, ruleMv } · 손이 없으면 null */
let rpsLatest = null;

function stopDemoCam() {
  if (typeof demoCam !== 'undefined' && demoCam && demoCam.stream) {
    demoCam.stop();
  }
  if (typeof demoRaf !== 'undefined' && demoRaf) {
    cancelAnimationFrame(demoRaf);
  }
  const state = $('demo-cam-state');
  if (state) state.textContent = '대기';

  /* 카메라가 없으면 낼 손도 없다 — 진행 중인 카운트다운을 접고 버튼을 잠근다. */
  rpsAbort();
  rpsLatest = null;
  rpsPaintLive(null);
  rpsSetGo(false);

  const btn = $('btn-demo-cam');
  const btnOff = $('btn-demo-cam-off');
  if (btn) {
    btn.style.display = 'block';
    btn.disabled = false;
    btn.textContent = '데모 카메라 켜기';
  }
  if (btnOff) {
    btnOff.style.display = 'none';
  }
}

if ($('v-demo')) {
  demoCam = mkCam($('v-demo'), $('c-demo'), $('ph-demo'));
}

const btnDemoCam = $('btn-demo-cam');
const btnDemoCamOff = $('btn-demo-cam-off');

if (btnDemoCam) {
  btnDemoCam.onclick = async () => {
    btnDemoCam.disabled = true; btnDemoCam.textContent = '연결 중…';
    try {
      await demoCam.start();
      $('demo-cam-state').textContent = '활성';
      btnDemoCam.style.display = 'none';
      if (btnDemoCamOff) btnDemoCamOff.style.display = 'block';
      rpsSetGo(true);
      demoLoop();
    } catch (e) {
      btnDemoCam.textContent = '카메라 오류';
    }
  };
}
if (btnDemoCamOff) {
  btnDemoCamOff.onclick = stopDemoCam;
}


/* ── 매 프레임 판정 ────────────────────────────────────────────────────
   승부는 학습 모델로 내고, 초급의 규칙 기반 판정(classifyRPS)을 같이 실어 둔다.
   손을 눕히거나 반쯤 접으면 규칙 쪽이 먼저 무너지는데, 그 대비가 이 단계의 볼거리다. */
async function demoLoop() {
  if (!demoCam || !demoCam.stream) return;
  const kp = await estimate(demoCam);
  if (!kp) {
    rpsLatest = null;
    rpsPaintLive(null);
  } else {
    drawHand(demoCam.canvas.getContext('2d'), kp, '#7c6cff');
    if (typeof head !== 'undefined' && head && dmUsable().length >= 2) {
      const probs = tf.tidy(() => head.predict(tf.tensor2d([handFeature(kp)])).arraySync()[0]);
      let top = 0;
      for (let i = 1; i < probs.length; i++) if (probs[i] > probs[top]) top = i;
      const rule = classifyRPS(kp);
      const ri = RPS_MOVES.findIndex(m => m.name === rule.label);
      rpsLatest = {
        /* 4번째 이후 클래스는 가위바위보에 연결되지 않는다 — null 로 두고 무효 처리한다. */
        mv: top < RPS_MOVES.length ? top : null,
        conf: probs[top],
        ruleMv: ri < 0 ? null : ri
      };
      rpsPaintLive(rpsLatest);
    }
  }
  demoRaf = requestAnimationFrame(demoLoop);
}

/* ── 가위바위보 대결 ──────────────────────────────────────────────── */
let rpsTimer = null;
let rpsScore = { win: 0, draw: 0, lose: 0, invalid: 0, disagree: 0 };

const rpsIc = (n) => (window.EduinoIcons ? EduinoIcons.svg(n) : '');
const rpsIcon = (i) => (RPS_MOVES[i] ? rpsIc(RPS_MOVES[i].ic) : rpsIc('hand-raised'));
const rpsThres = () => (+($('dm-slider') || { value: 0 }).value);

/* 카운트다운 중에도 계속 갱신된다 — 막대가 흔들리는 걸 봐야 "AI가 지금 나를 이렇게
   보고 있다"가 전달된다. 지금까지 이 피드백은 2단계에만 있었다. */
function rpsPaintLive(s) {
  const bar = $('rps-live-bar'), t = $('rps-live-t'), cut = $('rps-live-cut');
  const thres = rpsThres();
  if (cut) cut.style.left = thres + '%';
  if (!bar || !t) return;
  if (!s) {
    bar.style.width = '0%';
    bar.className = 'rps-live-bar';
    t.className = 'rps-live-t off';
    t.textContent = '손이 보이지 않습니다';
    return;
  }
  const pct = s.conf * 100;
  const ok = pct >= thres && s.mv != null;
  bar.style.width = pct.toFixed(1) + '%';
  bar.className = 'rps-live-bar' + (ok ? ' ok' : '');
  t.className = 'rps-live-t' + (ok ? ' ok' : '');
  t.textContent = s.mv == null
    ? '가위바위보에 연결되지 않은 제스처'
    : RPS_MOVES[s.mv].name + ' · ' + Math.round(pct) + '%' + (ok ? '' : ' · 커트라인 미달');
}

function rpsPaintScore() {
  const el = $('rps-score');
  if (!el) return;
  const s = rpsScore;
  el.innerHTML =
    '<span class="rps-sc win">' + s.win + '승</span>' +
    '<span class="rps-sc draw">' + s.draw + '무</span>' +
    '<span class="rps-sc lose">' + s.lose + '패</span>' +
    (s.invalid ? '<span class="rps-sc void">무효 ' + s.invalid + '</span>' : '') +
    (s.disagree ? '<span class="rps-sc dis">규칙과 엇갈림 ' + s.disagree + '</span>' : '');
}

function rpsSetHands(me, ai) {
  const m = $('rps-me'), a = $('rps-ai'), mn = $('rps-me-n'), an = $('rps-ai-n');
  if (m) m.innerHTML = rpsIcon(me == null ? -1 : me);
  if (a) a.innerHTML = rpsIcon(ai == null ? -1 : ai);
  if (mn) mn.textContent = me == null ? '—' : RPS_MOVES[me].name;
  if (an) an.textContent = ai == null ? '—' : RPS_MOVES[ai].name;
}

function rpsSetGo(on, label) {
  const b = $('rps-go');
  if (!b) return;
  b.disabled = !on;
  b.textContent = label || '대결 시작';
}

function rpsAbort() {
  if (rpsTimer) { clearInterval(rpsTimer); rpsTimer = null; }
  const vs = $('rps-vs');
  if (vs) { vs.textContent = 'VS'; vs.classList.remove('count'); }
}

function rpsReset() {
  rpsAbort();
  rpsScore = { win: 0, draw: 0, lose: 0, invalid: 0, disagree: 0 };
  rpsPaintScore();
  rpsSetHands(null, null);
  const res = $('rps-result');
  if (res) res.innerHTML = '';
  rpsPaintLive(null);
  rpsSetGo(!!(demoCam && demoCam.stream));
}

function rpsStart() {
  if (rpsTimer) return;
  const res = $('rps-result');
  if (res) res.innerHTML = '';
  rpsSetHands(null, null);
  rpsSetGo(false, '준비…');
  const vs = $('rps-vs');
  let n = 3;
  if (vs) { vs.classList.add('count'); vs.textContent = n; }
  rpsTimer = setInterval(() => {
    n--;
    if (n > 0) { if (vs) vs.textContent = n; return; }
    clearInterval(rpsTimer); rpsTimer = null;
    if (vs) vs.textContent = '냈!';
    rpsJudge();
    setTimeout(() => { if (vs) { vs.textContent = 'VS'; vs.classList.remove('count'); } }, 700);
  }, 800);
}

/* 규칙 기반(초급)이 같은 손을 뭐라고 읽었는지 — 표시만 한다. */
function rpsRuleLine(shot, modelMv) {
  if (shot.ruleMv == null) {
    return '<div class="rps-line rule diff">규칙 기반 <b>판정 실패</b> · 손가락 개수 규칙으로는 읽히지 않는 자세입니다</div>';
  }
  const diff = modelMv != null && shot.ruleMv !== modelMv;
  const tail = modelMv == null ? '' : (diff ? ' · 학습 모델과 엇갈렸습니다' : ' · 학습 모델과 같은 판정');
  return '<div class="rps-line rule' + (diff ? ' diff' : '') + '">규칙 기반 <b>' +
    RPS_MOVES[shot.ruleMv].name + '</b>' + tail + '</div>';
}

function rpsJudge() {
  const res = $('rps-result');
  const shot = rpsLatest;
  const thres = rpsThres();
  rpsSetGo(true, '다시 대결');

  if (!shot) {
    rpsScore.invalid++;
    if (res) res.innerHTML = '<div class="rps-line void"><b>무효</b> · 손이 보이지 않았습니다</div>';
    rpsPaintScore();
    return;
  }

  const ai = Math.floor(Math.random() * RPS_MOVES.length);
  const pct = Math.round(shot.conf * 100);

  if (shot.mv == null) {
    rpsScore.invalid++;
    rpsSetHands(null, ai);
    if (res) res.innerHTML =
      '<div class="rps-line void"><b>무효</b> · 가위바위보에 연결되지 않은 제스처입니다</div>' + rpsRuleLine(shot, null);
    rpsPaintScore();
    return;
  }
  if (pct < thres) {
    rpsScore.invalid++;
    rpsSetHands(null, ai);
    if (res) res.innerHTML =
      '<div class="rps-line void"><b>무효</b> · 확신도 ' + pct + '% 가 커트라인 ' + thres + '% 에 못 미쳤습니다</div>' +
      rpsRuleLine(shot, null);
    rpsPaintScore();
    return;
  }

  if (shot.ruleMv !== null && shot.ruleMv !== shot.mv) rpsScore.disagree++;
  let cls, verdict;
  if (shot.mv === ai) { cls = 'draw'; verdict = '비김'; rpsScore.draw++; }
  else if (rpsBeats(shot.mv, ai)) { cls = 'win'; verdict = '이김'; rpsScore.win++; }
  else { cls = 'lose'; verdict = '짐'; rpsScore.lose++; }

  rpsSetHands(shot.mv, ai);
  if (res) res.innerHTML =
    '<div class="rps-line model">학습 모델 <b>' + RPS_MOVES[shot.mv].name + '</b> · 확신도 ' + pct + '%</div>' +
    rpsRuleLine(shot, shot.mv) +
    '<div class="rps-line ' + cls + '">승부 <b>AI ' + RPS_MOVES[ai].name + ' → ' + verdict + '</b></div>';
  rpsPaintScore();
}

const btnRpsGo = $('rps-go');
if (btnRpsGo) btnRpsGo.onclick = rpsStart;

/* 슬라이더를 움직이면 3단계의 커트라인 표시도 같이 따라간다. */
if (dSlider) {
  dSlider.addEventListener('input', () => {
    const cut = $('rps-live-cut');
    if (cut) cut.style.left = dSlider.value + '%';
    const rt = $('dm-res-thres');
    if (rt) rt.textContent = dSlider.value + '%';
  });
}
