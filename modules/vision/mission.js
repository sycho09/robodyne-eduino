/* vision 코스 3번째 탭(심화 · 응용 — 자동 판정 라인 도입 미션) 로직.
   app.js · advanced.js 뒤에 로드되며, 그들이 정의한 전역($ · setStatus)을 쓴다.

   이 탭이 앞의 두 탭과 다른 점: 새 기능을 배우지 않는다.
   ②단계에서 학생이 직접 학습시킨 분류기를 그대로 가져와, "현장에 내보낼 수 있는가"를
   실무 지표로 따진다. text·gesture·life 코스의 심화 미션과 같은 4단계 규격이다.

   ②단계 혼동행렬과 렌즈가 다르다는 점이 핵심이다.
     ②단계 : 확신이 부족하면 [보류] — 답을 미루는 모델
     ③단계 : 기준선을 넘으면 그 클래스로 판정 — 실제 운영 규칙 (보류 없음)

   그 저울질을 표가 아니라 공장 라인으로 보여 준다. 채점용으로 떼어 둔 검증 사진
   한 장이 벨트 위 제품 한 개가 되고, 스캐너를 지날 때 확신도가 기준선을 넘으면
   로봇 팔이 폐기함으로 쳐낸다. 기준선을 올리면 불량이 팔 밑을 지나 출하되고(놓침),
   내리면 멀쩡한 제품까지 튕겨 나간다(헛짚음).

   수치는 지어내지 않는다. 벨트에 오르는 건 학습에 쓰지 않은 검증 사진이고
   정답 라벨이 이미 있으므로, 재현율·정밀도는 전부 실측이다. */

const MS_TARGET_RECALL = 0.90;   // 미션 목표 — 놓치지 않는 비율
const msEsc = (v) => String(v).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

let msStep = 1;
let msKey = null;      // 놓치면 안 되는 클래스 인덱스 = 불량품
let msCut = 0.80;      // 판정 기준선 — ②단계에서 학습한 모델에 적용
let msEval = null;     // advanced.js 가 넘겨준 검증 세트 실측 결과
let msRan = false;     // ②단계 라인을 한 바퀴 돌렸는가

function msNames() { return msEval ? msEval.names : []; }

/* 중요 클래스 k 기준으로 TP/FP/FN/TN 을 센다. 학습에 쓰지 않은 검증 데이터라 실측이다. */
function prfAt(cut, k) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  msEval.probs.forEach((row, i) => {
    const flagged = row[k] >= cut;
    const actual = msEval.truth[i] === k;
    if (flagged && actual) tp++;
    else if (flagged) fp++;
    else if (actual) fn++;
    else tn++;
  });
  return {
    tp, fp, fn, tn,
    prec: (tp + fp) ? tp / (tp + fp) : null,   // 골라낸 것 중 진짜
    rec: (tp + fn) ? tp / (tp + fn) : null,    // 실제 중 잡아낸 것
    total: msEval.probs.length
  };
}
const pctText = (v) => (v == null ? '—' : Math.round(v * 100) + '%');

/* ══════════════════════════════════════════════════════════
   자동 판정 라인 — ②③④가 모두 이 한 벌의 규칙을 쓴다.
   판정 종류는 prfAt() 의 네 칸과 정확히 같고, 각각 갈 통이 정해져 있다.
     ok    tp  진짜 불량을 쳐냄   → 폐기함
     wrong fp  멀쩡한데 쳐냄     → 폐기함
     miss  fn  불량인데 통과     → 출하구 (리콜)
     pass  tn  정상 통과         → 출하구
   ══════════════════════════════════════════════════════════ */
const MS_BIN_OF = { ok: 'reject', wrong: 'reject', miss: 'ship', pass: 'ship' };
const MS_TRAVEL = 3200;   // 벨트 끝에서 끝까지 (ms)
const MS_GATE = 0.62;     // 스캐너 위치 (벨트 폭 비율)
const MS_PROD_W = 54;     // 제품 한 개의 폭 (px) — CSS 와 맞춘다
const MS_PILE_MAX = 24;   // 통에 쌓아 보여 줄 칩 수 상한
const MS_DROP = 280;      // 쳐낸 제품이 통으로 떨어지는 시간 (ms)

const MS_REDUCE = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function msKindOf(p, actual, cut) {
  const flagged = p >= cut;
  return flagged ? (actual ? 'ok' : 'wrong') : (actual ? 'miss' : 'pass');
}
/* 검증 사진을 벨트에 올릴 형태로 바꾼다. 판정은 그때그때의 기준선으로 하므로 여기서 하지 않는다. */
function msProducts() {
  return msEval.probs.map((row, i) => ({
    p: row[msKey],
    actual: msEval.truth[i] === msKey,
    thumb: (msEval.thumbs || [])[i] || ''
  }));
}

/* ── 소리 — 새 파일 없이 WebAudio 로 만든다 ──
   AudioContext 는 [라인 가동] 을 누른 뒤에야 생긴다(사용자 제스처). 로드 시 자동 재생 없음. */
let msMuted = false;
let msAC = null;
function msBeep(kind) {
  if (msMuted || MS_REDUCE) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!msAC) msAC = new AC();
    if (msAC.state === 'suspended') msAC.resume();
    const t0 = msAC.currentTime;
    if (kind === 'clank') {
      // 로봇 팔이 제품을 쳐낼 때 — 짧고 낮게 "깡"
      const o = msAC.createOscillator(), g = msAC.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(190, t0);
      o.frequency.exponentialRampToValueAtTime(85, t0 + 0.09);
      g.gain.setValueAtTime(0.16, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1);
      o.connect(g); g.connect(msAC.destination);
      o.start(t0); o.stop(t0 + 0.11);
    } else {
      // 불량이 그냥 출하될 때만 울리는 경고 — "삐빅". 정상 통과는 무음이어야 이 소리가 들린다.
      [0, 0.16].forEach((d) => {
        const o = msAC.createOscillator(), g = msAC.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(880, t0 + d);
        g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.linearRampToValueAtTime(0.12, t0 + d + 0.01);
        g.gain.setValueAtTime(0.12, t0 + d + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.11);
        o.connect(g); g.connect(msAC.destination);
        o.start(t0 + d); o.stop(t0 + d + 0.12);
      });
    }
  } catch (e) { /* 오디오를 못 쓰는 환경 — 조용히 넘어간다 */ }
}

const msFace = (thumb) => (thumb ? '<img src="' + thumb + '" alt="">' : '<span class="ms-noimg">?</span>');

/* 통 두 개의 마크업. ①④의 정지 그림도 같은 구조를 쓴다. */
function msBinsHTML(fill) {
  const b = (side, name, note, aK, aLab, bK, bLab) => {
    const g = fill ? fill[side] : null;
    const pile = g ? g.chips.slice(0, MS_PILE_MAX).map((c) =>
      '<i class="ms-chip ' + c.kind + '"' + (c.thumb ? ' style="background-image:url(' + c.thumb + ')"' : '') + '></i>').join('') +
      (g.chips.length > MS_PILE_MAX ? '<span class="ms-pile-more">+' + (g.chips.length - MS_PILE_MAX) + '</span>' : '') : '';
    return '<div class="ms-bin ' + side + '" data-bin="' + side + '">' +
      '<div class="ms-bin-head"><b>' + name + '</b><em>' + note + '</em>' +
        '<span class="ms-bin-n">' + (g ? g.chips.length : 0) + '</span></div>' +
      '<div class="ms-bin-pile">' + pile + '</div>' +
      '<div class="ms-bin-split">' +
        '<em class="' + aK + '">' + aLab + ' <b>' + (g ? g.n[aK] : 0) + '</b></em>' +
        '<em class="' + bK + '">' + bLab + ' <b>' + (g ? g.n[bK] : 0) + '</b></em>' +
      '</div></div>';
  };
  return '<div class="ms-bins' + (fill ? ' snap' : '') + '">' +
    b('reject', '폐기함', '로봇 팔이 쳐냄', 'ok', '진짜 불량', 'wrong', '헛짚음') +
    b('ship', '출하구', '그냥 통과', 'miss', '불량 출하', 'pass', '정상') +
    '</div>';
}

/* 확정된 기준선에서 두 통이 어떻게 채워졌는지 — ④ 리포트의 정지 스냅샷. */
function msSnapshotHTML(cut) {
  const fill = {
    reject: { chips: [], n: { ok: 0, wrong: 0 } },
    ship: { chips: [], n: { miss: 0, pass: 0 } }
  };
  msProducts().forEach((d) => {
    const kind = msKindOf(d.p, d.actual, cut);
    const g = fill[MS_BIN_OF[kind]];
    g.chips.push({ kind, thumb: d.thumb });
    g.n[kind]++;
  });
  return msBinsHTML(fill);
}

/* ── 라인 한 대 ──
   opts.loop    : 한 바퀴가 끝나면 통을 비우고 다시 돈다 (③)
   opts.control : [라인 가동] 버튼을 단다 (②)
   opts.onEnd   : 한 바퀴가 끝났을 때 (loop 가 아닐 때만) */
function msMakeLine(host, opts) {
  opts = opts || {};
  host.classList.add('ms-line');
  host.classList.toggle('noanim', MS_REDUCE);
  host.innerHTML =
    '<div class="ms-line-top">' +
      '<span class="ms-line-tag">LINE 01 · 자동 판정</span>' +
      '<span class="ms-line-cut">기준선 <b>80%</b></span>' +
      '<button class="ms-mute" type="button" aria-pressed="false">소리 켬</button>' +
    '</div>' +
    '<div class="ms-belt stopped">' +
      '<div class="ms-scan"><i class="ms-scan-beam"></i><span class="ms-scan-lab">스캐너</span></div>' +
      '<div class="ms-arm"><i></i></div>' +
      '<div class="ms-track"></div>' +
    '</div>' +
    msBinsHTML(null) +
    (opts.control ? '<div class="ms-line-ctrl"><button class="btn primary block lg ms-run">▶ 라인 가동</button></div>' : '');

  const belt = host.querySelector('.ms-belt');
  const track = host.querySelector('.ms-track');
  const arm = host.querySelector('.ms-arm');
  const cutEl = host.querySelector('.ms-line-cut b');
  const runBtn = host.querySelector('.ms-run');
  const muteBtn = host.querySelector('.ms-mute');

  const bins = {};
  host.querySelectorAll('.ms-bin').forEach((el) => {
    const vals = {};
    el.querySelectorAll('.ms-bin-split em').forEach((em) => { vals[em.className] = em.querySelector('b'); });
    bins[el.dataset.bin] = { n: el.querySelector('.ms-bin-n'), pile: el.querySelector('.ms-bin-pile'), vals, more: null, count: 0 };
  });

  /* clock 은 프레임 간격을 상한 걸어 누적한 라인 자체의 시계다.
     투입·이동·낙하·팔을 전부 여기에 맞춘다. 실제 시각(ts)으로 투입하고 상한 건 dt 로
     이동하면, 프레임이 끊긴 순간 투입만 앞서 나가 제품이 한 덩어리로 뭉친다. */
  let raf = null, running = false, prev = 0, clock = 0, lastSpawn = 0, cursor = 0, armUntil = 0;
  let W = 0, interval = 400, items = [], data = [], cut = 0.80;
  let tally = { ok: 0, wrong: 0, miss: 0, pass: 0 };

  function resetBins() {
    tally = { ok: 0, wrong: 0, miss: 0, pass: 0 };
    Object.keys(bins).forEach((k) => {
      const b = bins[k];
      b.pile.innerHTML = ''; b.more = null; b.count = 0; b.n.textContent = '0';
      Object.keys(b.vals).forEach((v) => { b.vals[v].textContent = '0'; });
    });
  }

  function land(kind, thumb) {
    const b = bins[MS_BIN_OF[kind]];
    tally[kind]++;
    b.count++;
    b.n.textContent = b.count;
    b.vals[kind].textContent = tally[kind];
    if (b.count <= MS_PILE_MAX) {
      const chip = document.createElement('i');
      chip.className = 'ms-chip ' + kind;
      if (thumb) chip.style.backgroundImage = 'url(' + thumb + ')';
      b.pile.appendChild(chip);
    } else {
      if (!b.more) {
        b.more = document.createElement('span');
        b.more.className = 'ms-pile-more';
        b.pile.appendChild(b.more);
      }
      b.more.textContent = '+' + (b.count - MS_PILE_MAX);
    }
  }

  function spawn(d) {
    const el = document.createElement('figure');
    el.className = 'ms-prod';
    el.innerHTML = msFace(d.thumb) + '<span class="ms-prod-p"></span>';
    el.style.transform = 'translateX(0px)';
    track.appendChild(el);
    items.push({ el, x: 0, p: d.p, actual: d.actual, thumb: d.thumb, decided: false, kind: null, dropAt: 0 });
  }

  /* 스캐너를 지나는 순간의 기준선으로 판정한다 — 이미 지나간 제품의 운명은 바뀌지 않는다. */
  function decide(it, now) {
    it.decided = true;
    it.kind = msKindOf(it.p, it.actual, cut);
    it.el.classList.add(it.kind);
    it.el.querySelector('.ms-prod-p').textContent = Math.round(it.p * 100) + '%';
    if (it.kind === 'ok' || it.kind === 'wrong') {
      arm.classList.add('hit');
      armUntil = now + 150;
      msBeep('clank');
      it.dropAt = now;
      it.el.classList.add('dropping');
      it.el.style.transform = 'translateX(' + (it.x * W) + 'px) translateY(64px)';
    } else if (it.kind === 'miss') {
      msBeep('alarm');
    }
  }

  function frame(ts) {
    if (!running) return;
    // 탭이나 단계를 떠나면 화면에서 사라진다 — 그때 rAF 를 끊는다(app.js 무수정).
    if (!belt.offsetParent) { stop(); return; }

    const dt = prev ? Math.min(80, ts - prev) : 16;
    prev = ts;
    clock += dt;
    if (armUntil && clock > armUntil) { arm.classList.remove('hit'); armUntil = 0; }
    if (cursor < data.length && clock - lastSpawn >= interval) { spawn(data[cursor++]); lastSpawn = clock; }

    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.dropAt) {
        if (clock - it.dropAt >= MS_DROP) { land(it.kind, it.thumb); it.el.remove(); items.splice(i, 1); }
        continue;
      }
      it.x += dt / MS_TRAVEL;
      if (!it.decided && it.x >= MS_GATE) {
        decide(it, clock);
        if (it.dropAt) continue;      // 쳐냈다 — 이번 프레임의 이동은 여기서 끝
      }
      if (it.x >= 1) { land(it.kind || 'pass', it.thumb); it.el.remove(); items.splice(i, 1); continue; }
      it.el.style.transform = 'translateX(' + (it.x * W) + 'px)';
    }

    if (cursor >= data.length && !items.length) {
      if (opts.loop) { cursor = 0; lastSpawn = clock; resetBins(); }
      else {
        running = false; raf = null;
        belt.classList.add('stopped');
        if (opts.onEnd) opts.onEnd(tally);
        return;
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    items.forEach((it) => it.el.remove());
    items = [];
    arm.classList.remove('hit');
    armUntil = 0;
    belt.classList.add('stopped');
  }

  /* 동작 줄이기 — 벨트를 돌리지 않고 결과만 통에 담는다. 판정도 수치도 동일하다. */
  function fillAtOnce() {
    resetBins();
    data.forEach((d) => land(msKindOf(d.p, d.actual, cut), d.thumb));
    if (opts.onEnd) opts.onEnd(tally);
  }

  function start() {
    stop();
    data = msProducts();
    if (!data.length) return;
    resetBins();
    interval = Math.max(200, Math.min(520, 11000 / data.length));
    if (MS_REDUCE) { fillAtOnce(); return; }
    W = Math.max(80, belt.clientWidth - MS_PROD_W - 10);
    // lastSpawn 을 한 간격 뒤로 밀어 두면 첫 프레임에 한 개가 바로 올라간다
    cursor = 0; prev = 0; clock = 0; lastSpawn = -interval; running = true;
    belt.classList.remove('stopped');
    raf = requestAnimationFrame(frame);
  }

  function setCut(c) {
    cut = c;
    if (cutEl) cutEl.textContent = Math.round(c * 100) + '%';
    if (MS_REDUCE && data.length) fillAtOnce();
  }

  if (muteBtn) {
    if (MS_REDUCE) muteBtn.hidden = true;
    muteBtn.setAttribute('aria-pressed', msMuted ? 'true' : 'false');
    muteBtn.textContent = msMuted ? '소리 끔' : '소리 켬';
    muteBtn.onclick = () => {
      msMuted = !msMuted;
      document.querySelectorAll('#panel-mission .ms-mute').forEach((b) => {
        b.setAttribute('aria-pressed', msMuted ? 'true' : 'false');
        b.textContent = msMuted ? '소리 끔' : '소리 켬';
      });
    };
  }

  const api = { start, stop, setCut, runBtn, isRunning: () => running };
  if (runBtn) runBtn.onclick = () => start();
  return api;
}

let msLine2 = null, msLine3 = null;
function msStopLines() {
  if (msLine2) msLine2.stop();
  if (msLine3) msLine3.stop();
}

/* ── ① 미션 수령 ── */
function paintBrief() {
  $('ms-pick').innerHTML = msNames().map((c, i) =>
    '<button class="ms-pick-btn' + (msKey === i ? ' on' : '') + '" data-k="' + i + '">' +
      '<span class="ms-pick-sw" style="background:' + c.color + '"></span>' +
      '<b>' + msEsc(c.name) + '</b>' +
      '<em>이 쪽을 놓치면 곤란하다</em>' +
    '</button>').join('');

  if (msKey != null) paintGoal();
}
function paintGoal() {
  const K = msEsc(msNames()[msKey].name);
  $('ms-goal').hidden = false;
  $('ms-goal').innerHTML =
    '<b>목표</b> — <b>' + K + '</b> 을(를) 놓치지 않는 비율(<b>재현율</b>)을 ' +
    Math.round(MS_TARGET_RECALL * 100) + '% 이상으로 지키면서, 헛짚는 일을 최대한 줄이세요.';
  $('ms-go2').disabled = false;
}
$('ms-pick').addEventListener('click', (e) => {
  const btn = e.target.closest('.ms-pick-btn');
  if (!btn) return;
  const k = +btn.dataset.k;
  if (k !== msKey) msRan = false;      // 불량품이 바뀌었다 — 시운전을 다시 해야 한다
  msKey = k;
  $('ms-pick').querySelectorAll('.ms-pick-btn').forEach((b) => b.classList.toggle('on', b === btn));
  paintGoal();
});

/* ── ② 라인 시운전 (기본 기준선 80% · 전량 1회 가동) ── */
function paintRunVerdict() {
  const r = prfAt(0.80, msKey);
  const K = msEsc(msNames()[msKey].name);
  const el = $('ms-alert-2');
  if (r.rec == null) {
    el.className = 'ms-alert fail';
    el.innerHTML = '<b>판정 불가</b>채점용 사진에 <b>' + K + '</b> 가 한 장도 없습니다. <b>중급 · 제작</b> 탭으로 돌아가 데이터를 더 모아 주세요.';
  } else if (r.rec < MS_TARGET_RECALL) {
    el.className = 'ms-alert fail';
    el.innerHTML = '<b>불량 ' + r.fn + '개가 출하됐습니다 — 재현율 ' + pctText(r.rec) + '</b>' +
      '출하구에 섞인 <b>불량 출하</b>가 그것입니다. 기준선 80% 를 넘길 만큼 확신하지 못해 로봇 팔이 그냥 보냈어요.';
  } else {
    el.className = 'ms-alert pass';
    el.innerHTML = '<b>목표 달성 — 재현율 ' + pctText(r.rec) + '</b>' +
      '기본 설정만으로 불량을 전부 걸러 냈습니다. 기준선을 <b>더 올려도</b> 지킬 수 있을까요?';
  }
}
function paintRun() {
  msCut = 0.80;
  msStopLines();
  msLine2 = msMakeLine($('ms-line-2'), {
    control: true,
    onEnd: () => {
      msRan = true;
      $('ms-go3').disabled = false;
      if (msLine2.runBtn) msLine2.runBtn.textContent = '↻ 다시 가동';
      paintRunVerdict();
    }
  });
  msLine2.setCut(0.80);
  $('ms-go3').disabled = !msRan;
  if (msRan) {
    if (msLine2.runBtn) msLine2.runBtn.textContent = '↻ 다시 가동';
    paintRunVerdict();
  } else {
    $('ms-alert-2').className = 'ms-alert idle';
    $('ms-alert-2').innerHTML = '<b>라인 대기 중</b>[▶ 라인 가동]을 누르면 채점용으로 남겨 둔 사진 <b>' +
      msEval.probs.length + '장</b>이 제품이 되어 흐릅니다.';
  }
}

/* ── ③ 기준선 조정 (라인은 연속 순환 · 게이지는 검증 전량 실측) ── */
function paintTune() {
  const r = prfAt(msCut, msKey);
  const recPct = r.rec == null ? 0 : r.rec * 100;
  const precPct = r.prec == null ? 0 : r.prec * 100;

  $('ms-rec-bar').style.width = recPct + '%';
  $('ms-rec-bar').className = r.rec != null && r.rec >= MS_TARGET_RECALL ? 'pass' : '';
  $('ms-rec-val').textContent = pctText(r.rec);
  $('ms-prec-bar').style.width = precPct + '%';
  $('ms-prec-val').textContent = pctText(r.prec);
  if (msLine3) msLine3.setCut(msCut);

  const K = msEsc(msNames()[msKey].name);
  const el = $('ms-alert-3');
  if (r.rec == null || r.prec == null) {
    el.className = 'ms-alert fail';
    el.innerHTML = '<b>기준선이 너무 높습니다</b>로봇 팔이 한 개도 쳐내지 못했어요 — <b>' + K + '</b> 로 판정된 제품이 없습니다. 슬라이더를 내려 보세요.';
  } else if (r.rec >= MS_TARGET_RECALL) {
    el.className = 'ms-alert pass';
    el.innerHTML = '<b>목표 충족 — 재현율 ' + pctText(r.rec) + ' · 정밀도 ' + pctText(r.prec) + '</b>' +
      '기준선을 <b>조금씩 올려</b> 재현율이 목표 아래로 떨어지기 직전까지 가면 폐기함의 <b>헛짚음</b>을 가장 많이 줄일 수 있어요.';
  } else {
    el.className = 'ms-alert fail';
    el.innerHTML = '<b>재현율 ' + pctText(r.rec) + ' — 목표 ' + Math.round(MS_TARGET_RECALL * 100) + '% 미달</b>' +
      '기준선을 <b>더 내리면</b> 출하구로 새던 불량이 폐기함으로 옮겨 갑니다. 대신 멀쩡한 제품을 쳐내는 <b>헛짚음</b>도 함께 늘어나는 걸 같이 보세요.';
  }
}
function buildTune() {
  msStopLines();
  msLine3 = msMakeLine($('ms-line-3'), { loop: true });
  msLine3.setCut(msCut);
  msLine3.start();
}
$('ms-thres').addEventListener('input', () => {
  msCut = +$('ms-thres').value / 100;
  $('ms-thres-val').textContent = $('ms-thres').value + '%';
  paintTune();
});

/* ── ④ 도입 리포트 ── */
function paintReport() {
  const r = prfAt(msCut, msKey);
  const K = msEsc(msNames()[msKey].name);
  const pass = r.rec != null && r.rec >= MS_TARGET_RECALL;

  $('ms-report').innerHTML =
    '<div class="ms-verdict ' + (pass ? 'pass' : 'fail') + '">' +
      '<span class="ms-v-ic">' + (pass ? '✓' : '!') + '</span>' +
      '<div><b>' + (pass ? '도입 권고' : '도입 보류') + '</b>' +
      '<span>' + (pass
        ? '목표 재현율을 지켰습니다. 헛짚어 폐기함으로 보낸 ' + r.fp + '개는 사람이 재확인하는 절차로 흡수할 수 있습니다.'
        : '재현율이 목표에 미달합니다. 기준선을 더 내리거나, 중급 · 제작 탭으로 돌아가 데이터를 보강해야 합니다.') +
      '</span></div>' +
    '</div>' +
    // 확정한 기준선으로 라인을 돌렸을 때 두 통이 이렇게 찬다 — 숫자 나열 대신 그림으로
    msSnapshotHTML(msCut) +
    '<div class="ms-kpis">' +
      '<div class="ms-kpi"><span>지킨 대상</span><b>' + K + '</b></div>' +
      '<div class="ms-kpi"><span>판정 기준선</span><b>' + Math.round(msCut * 100) + '%</b></div>' +
      '<div class="ms-kpi ' + (pass ? 'good' : 'bad') + '"><span>재현율 · 놓치지 않은 비율</span><b>' + pctText(r.rec) + '</b></div>' +
      '<div class="ms-kpi"><span>정밀도 · 골라낸 것 중 진짜</span><b>' + pctText(r.prec) + '</b></div>' +
    '</div>' +
    '<div class="ms-summary">학습에 쓰지 않고 남겨 둔 <b>' + r.total + '장</b>을 라인에 흘려 잰 실측값입니다.</div>';
}

/* ── 단계 이동 ── */
function msSetStep(n) {
  msStep = n;
  msStopLines();
  /* 완료 신호는 마지막 단계 도달에 건다 — 상단 단계 버튼으로 바로 올 수도 있으므로
     특정 버튼에 걸면 그 경로가 빠진다. (평가로 넘어가는 버튼은 하단 공통 컨트롤이 맡는다) */
  if (n === 4) CourseDashboard.markDone('mission');
  document.querySelectorAll('#flow-ms .fstep').forEach((el) => {
    const sw = +el.dataset.m;
    el.classList.toggle('active', sw === n);
    el.classList.toggle('done', sw < n);
    const fn = el.querySelector('.fn');
    if (fn) fn.textContent = sw < n ? '✓' : sw;
  });
  document.querySelectorAll('#panel-mission .msstep').forEach((el) => { el.hidden = +el.dataset.m !== n; });

  if (n === 1) paintBrief();
  if (n === 2) paintRun();
  if (n === 3) {
    $('ms-thres').value = String(Math.round(msCut * 100));
    $('ms-thres-val').textContent = Math.round(msCut * 100) + '%';
    buildTune();
    paintTune();
  }
  if (n === 4) paintReport();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* 탭에 들어올 때마다 학습 여부를 다시 확인한다.
   ②단계에서 다시 학습하면 검증 결과가 바뀌므로 미션도 처음부터 시작한다. */
function missionEnter() {
  const ev = typeof window.visionGetEval === 'function' ? window.visionGetEval() : null;
  const ready = ev && ev.probs && ev.probs.length && ev.names && ev.names.length >= 2;

  $('ms-gate').hidden = !!ready;
  document.querySelectorAll('#flow-ms .fstep').forEach((el) => { el.disabled = !ready; });

  if (!ready) {
    msEval = null;
    msStopLines();
    document.querySelectorAll('#panel-mission .msstep').forEach((el) => { el.hidden = true; });
    return;
  }
  if (msEval !== ev) {     // 새로 학습했다 → 미션 초기화
    msEval = ev;
    msKey = null; msCut = 0.80; msRan = false;
    $('ms-go2').disabled = true;
    $('ms-goal').hidden = true;
    msSetStep(1);
  } else {
    msSetStep(msStep);
  }
}
if (typeof window !== 'undefined') window.visionMissionEnter = missionEnter;

document.querySelectorAll('#flow-ms .fstep').forEach((el) => {
  el.onclick = () => { if (msEval && msKey != null) msSetStep(+el.dataset.m); };
});
$('ms-to-train').onclick = () => window.visionShowTab('train');
$('ms-go2').onclick = () => msSetStep(2);
$('ms-go3').onclick = () => msSetStep(3);
$('ms-go4').onclick = () => msSetStep(4);
$('ms-back3').onclick = () => msSetStep(3);

/* 실습 단계를 떠날 때 라인을 세운다 (course-dashboard.js 의 leaveStep 이 부른다).
   프레임 루프 안에서도 화면에서 사라지면 스스로 멈추지만, 나가는 즉시 끊는 편이 낫다. */
(window.CoursePracticeLeave = window.CoursePracticeLeave || []).push(msStopLines);
