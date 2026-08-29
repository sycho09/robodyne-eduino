/* Gesture 심화 미션 로직: 학습한 모델로 하는 가위바위보 대결 및 실제 모델 기반 혼동행렬 시뮬레이션. */
/* ════ 고급-응용: 가위바위보 대결 ════ */
let dmStep = 1;

/* 학습시킨 클래스를 순서대로 여기에 잇는다 (0=가위, 1=바위, 2=보).
   초급의 classifyRPS() 는 펴진 손가락 개수를 세는 규칙이고, 여기서는 학생이 학습시킨
   모델이 판정한다 — 같은 손을 두 방식이 어떻게 다르게 읽는지가 이 단계의 핵심이다. */
const RPS_MOVES = [
  { name: '가위', ic: 'victory' },
  { name: '바위', ic: 'fist' },
  { name: '보', ic: 'palm' }
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
    const nameColorStyle = c ? ' style="color:' + c.color + '"' : '';
    return '<div class="dm-map-row' + (c ? '' : ' missing') + '">' +
      '<span class="dm-map-cls"' + nameColorStyle + '>' + dmEsc(name) + '<small>' + sub + '</small></span>' +
      '<span class="dm-map-arrow">→</span>' +
      '<span class="dm-map-mv"><span class="ic-inline" data-ic="' + mv.ic + '"></span></span>' +
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
  
  // 대결(3단계)을 떠나면 데모 카메라를 끄고 진행 중인 카운트다운도 접는다
  if (w !== 3) {
    rpsAbort();
    if (typeof stopDemoCam !== 'undefined') stopDemoCam();
  }

  if (w === 1) renderRpsMap();

  /* 라이브 손 피드백은 3단계(대결)가 진짜 카메라로 맡는다. 2단계는 코스에서 유일하게
     카메라를 끄고 숫자만 보는 화면 — 커트라인을 옮기면 무엇을 잃는지는 표본 하나가 아니라
     모아 놓은 결과에서만 보인다. 새로 학습했을 수 있으니 진입할 때 다시 잰다. */
  if (w === 2) { dmMeasure(true); paintThres(); }

  if (w === 3) {
    window.CourseDashboard && CourseDashboard.markDone('demo');
    const resThres = $('dm-res-thres');
    if (resThres) resThres.textContent = $('dm-slider').value + '%';
    rpsReset();
  }
}

/* 학습한 모델에 데이터를 넣어 실제 확신도를 잰다.
   [2. 중급]이 학습에서 떼어 둔 홀드아웃(window.gestureHoldout)이 있으면 그것을 쓴다 —
   학습에 쓴 데이터로 재면 확신도가 전부 높게 나와 커트라인을 내려도 오인이 생기지 않는다.
   홀드아웃이 없을 때만(옛 세션 등) 학습 데이터로 되돌아간다. */
let dmRows = null;   // { names, rows:[{ truth, p }], held } — 임계값과 무관하므로 단계 진입 때 한 번만 잰다
function dmMeasure(force) {
  if (dmRows && !force) return dmRows;
  dmRows = null;
  if (typeof tf === 'undefined' || typeof head === 'undefined' || typeof classes === 'undefined') return null;
  if (!head) return null;
  const usable = classes.filter(c => c.samples.length >= 8);
  if (usable.length < 2) return null;

  const held = (typeof window !== 'undefined' && window.gestureHoldout) || null;
  if (held && held.rows.length >= 4) {
    const feats = held.rows.map(r => r.feat);
    const probs = tf.tidy(() => head.predict(tf.tensor2d(feats)).arraySync());
    dmRows = { names: held.names, rows: probs.map((p, i) => ({ truth: held.rows[i].truth, p })), held: true };
    return dmRows;
  }

  const rows = [];
  usable.forEach((c, idx) => {
    const valid = c.samples.filter(s => s.length === 42 && s.every(v => isFinite(v)));
    if (!valid.length) return;
    const probs = tf.tidy(() => head.predict(tf.tensor2d(valid)).arraySync());
    probs.forEach(p => rows.push({ truth: idx, p }));
  });
  if (rows.length < 2) return null;
  dmRows = { names: usable.map(c => c.name), rows, held: false };
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
  /* 둘 다 0 이면 '균형'이 아니라 실수가 아예 없는 것이다 — 따로 가른다. */
  const verdict = (wrong === 0 && miss === 0) ? 'clean'
    : miss > wrong * 1.8 ? 'miss' : wrong > miss * 1.8 ? 'wrong' : 'balanced';
  return { per, mat, missPer, names: m.names, wrong, miss, total: m.rows.length, verdict, held: !!m.held };
}

/* 혼동행렬 하나만 둔다 — 성공·오인·무반응 합계는 모두 이 표에서 나오는 값이라
   따로 뽑아 두면 같은 숫자를 한 화면에 두 번 두는 셈이 된다.
   [2. 중급] 학습 화면에서 본 그 표에 '미반응' 열이 붙은 형태이고,
   커트라인을 올릴수록 성공이 그 열로 옮겨 가는 것이 이 화면이 가르치는 전부다. */
function paintConfusion() {
  const slider = $('dm-slider');
  const tbl = $('dm-cm-table');
  const lead = $('dm-cm-lead');
  const note = $('dm-cm-note');
  if (!slider || !tbl) return;
  const c = confusionAt(+slider.value);

  if (!c) {
    tbl.innerHTML = '';
    if (lead) lead.innerHTML = '';
    if (note) note.innerHTML = '이 표는 <b>[2. 중급 · 제작]에서 직접 모은 데이터</b>로 채워집니다. 제스처를 각각 <b>8장 이상</b> 모아 학습을 마친 뒤 다시 오세요.';
    return;
  }

  if (lead) {
    lead.innerHTML = c.held
      ? '학습에 쓰지 않고 남겨 둔 <b>' + c.total + '개</b>로 확인했습니다.'
      : '내가 모은 <b>' + c.total + '개</b>로 확인했습니다.';
  }

  /* 표는 학습시킨 클래스 수를 그대로 따른다 — 2개든 4개든 빠지는 클래스가 없다. */
  const ic = (i) => (RPS_MOVES[i] ? '<span class="ic-inline" data-ic="' + RPS_MOVES[i].ic + '"></span> ' : '');
  /* 역슬래시는 문자열 escape 로 먹히므로 전각 ＼ 를 쓴다 ([2. 중급]의 표와 같은 표기). */
  let html = '<thead><tr><th>실제 동작 ＼ AI 예측</th>';
  c.names.forEach((n, i) => { html += '<th>' + ic(i) + dmEsc(n) + '</th>'; });
  html += '<th>미반응</th></tr></thead><tbody>';
  c.names.forEach((n, r) => {
    html += '<tr><th>' + ic(r) + dmEsc(n) + '</th>';
    c.names.forEach((_, p) => {
      const v = c.mat[r][p];
      const cls = r === p ? ' class="succ"' : (v ? ' class="err"' : '');
      html += '<td' + cls + '>' + v + (r === p ? ' (성공)' : v ? ' (오인)' : '') + '</td>';
    });
    html += '<td' + (c.missPer[r] ? ' class="dim"' : '') + '>' + c.missPer[r] + (c.missPer[r] ? ' (무반응)' : '') + '</td></tr>';
  });
  tbl.innerHTML = html + '</tbody>';
  if (window.EduinoIcons) EduinoIcons.mount(tbl);

  if (!note) return;
  if (c.verdict === 'clean') {
    note.innerHTML = '<b>전부 제대로 인식했습니다.</b> 커트라인을 올리면 무시되는 동작이 생깁니다.';
  } else if (c.verdict === 'miss') {
    note.innerHTML = '커트라인이 높아 <b>' + c.miss + '개를 놓쳤습니다.</b> 잘못 반응하진 않지만 답답합니다.';
  } else if (c.verdict === 'wrong') {
    note.innerHTML = '커트라인이 낮아 <b>' + c.wrong + '개를 엉뚱하게 읽었습니다.</b> 잘 반응하지만 오작동이 잦습니다.';
  } else {
    note.innerHTML = '오인 <b>' + c.wrong + '개</b>, 무반응 <b>' + c.miss + '개</b>입니다.';
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
/* 스스로 멈추지 않는 데모 카메라 루프 — 실습을 떠날 때 끈다. */
(window.CoursePracticeLeave = window.CoursePracticeLeave || []).push(() => {
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
let rpsScore = { win: 0, draw: 0, lose: 0, invalid: 0 };

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
    (s.invalid ? '<span class="rps-sc void">무효 ' + s.invalid + '</span>' : '');
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
  rpsScore = { win: 0, draw: 0, lose: 0, invalid: 0 };
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
      '<div class="rps-line void"><b>무효</b> · 가위바위보에 연결되지 않은 제스처입니다</div>';
    rpsPaintScore();
    return;
  }
  if (pct < thres) {
    rpsScore.invalid++;
    rpsSetHands(null, ai);
    if (res) res.innerHTML =
      '<div class="rps-line void"><b>무효</b> · 확신도 ' + pct + '% 가 커트라인 ' + thres + '% 에 못 미쳤습니다</div>';
    rpsPaintScore();
    return;
  }

  let cls, verdict;
  if (shot.mv === ai) { cls = 'draw'; verdict = '비김'; rpsScore.draw++; }
  else if (rpsBeats(shot.mv, ai)) { cls = 'win'; verdict = '이김'; rpsScore.win++; }
  else { cls = 'lose'; verdict = '짐'; rpsScore.lose++; }

  rpsSetHands(shot.mv, ai);
  
  if (res) res.innerHTML =
    '<div class="rps-line model">학습 모델 <b>' + RPS_MOVES[shot.mv].name +
    '</b> · 확신도 ' + pct + '%</div>' +
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
