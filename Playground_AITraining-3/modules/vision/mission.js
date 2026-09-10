/* vision 코스 3번째 탭(심화 · 응용 — 자동 판정 라인 도입 미션) 로직. */

const msEsc = (v) => String(v).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

let msStep = 1;
let msKey = null;      // 불량품으로 선택된 클래스 인덱스
let msCut = 0.80;      // 판정 기준선 (예민도)
let msCam = null;
let msLiveTimer = null;
let msLiveLastTime = 0;

// advanced.js에서 학습된 클래스 정보를 가져온다.
function msNames() { 
  const ev = typeof window.visionGetEval === 'function' ? window.visionGetEval() : null;
  return ev ? ev.names : []; 
}

const MS_BIN_OF = { ok: 'reject', pass: 'ship' };
const MS_TRAVEL = 3200;   // 벨트 끝에서 끝까지 (ms)
const MS_GATE = 0.62;     // 스캐너 위치
const MS_PROD_W = 54;
const MS_PILE_MAX = 24;
const MS_DROP = 280;

const MS_REDUCE = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

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
      const o = msAC.createOscillator(), g = msAC.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(190, t0);
      o.frequency.exponentialRampToValueAtTime(85, t0 + 0.09);
      g.gain.setValueAtTime(0.16, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1);
      o.connect(g); g.connect(msAC.destination);
      o.start(t0); o.stop(t0 + 0.11);
    }
  } catch (e) { }
}

const msFace = (thumb) => (thumb ? '<img src="' + thumb + '" alt="">' : '<span class="ms-noimg">?</span>');

function msBinsHTML() {
  const b = (side, name, note) => {
    return '<div class="ms-bin ' + side + '" data-bin="' + side + '">' +
      '<div class="ms-bin-head"><b>' + name + '</b><em>' + note + '</em>' +
        '<span class="ms-bin-n">0</span></div>' +
      '<div class="ms-bin-pile"></div></div>';
  };
  return '<div class="ms-bins">' +
    b('reject', '폐기함', '로봇 팔이 쳐냄 (예측 ≥ 예민도)') +
    b('ship', '출하구', '그냥 통과 (예측 &lt; 예민도)') +
    '</div>';
}

function msMakeLine(host) {
  host.classList.add('ms-line');
  host.classList.toggle('noanim', MS_REDUCE);
  host.innerHTML =
    '<div class="ms-line-top">' +
      '<span class="ms-line-tag">LINE 01 · 실시간 판정</span>' +
      '<span class="ms-line-cut">예민도 <b>80%</b></span>' +
    '</div>' +
    '<div class="ms-belt stopped">' +
      '<div class="ms-scan"><i class="ms-scan-beam"></i><span class="ms-scan-lab">스캐너</span></div>' +
      '<div class="ms-arm"><i></i></div>' +
      '<div class="ms-track"></div>' +
    '</div>' +
    msBinsHTML();

  const belt = host.querySelector('.ms-belt');
  const track = host.querySelector('.ms-track');
  const arm = host.querySelector('.ms-arm');
  const cutEl = host.querySelector('.ms-line-cut b');

  const bins = {};
  host.querySelectorAll('.ms-bin').forEach((el) => {
    bins[el.dataset.bin] = { n: el.querySelector('.ms-bin-n'), pile: el.querySelector('.ms-bin-pile'), more: null, count: 0 };
  });

  let raf = null, running = false, prev = 0, clock = 0, armUntil = 0;
  let W = 0, items = [], cut = 0.80;

  function resetBins() {
    Object.keys(bins).forEach((k) => {
      const b = bins[k];
      b.pile.innerHTML = ''; b.more = null; b.count = 0; b.n.textContent = '0';
    });
  }

  function land(kind, thumb) {
    const b = bins[MS_BIN_OF[kind]];
    b.count++;
    b.n.textContent = b.count;
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

  function spawnLive(prob, thumb) {
    if (!running) return;
    const el = document.createElement('figure');
    el.className = 'ms-prod';
    el.innerHTML = msFace(thumb) + '<span class="ms-prod-p"></span>';
    el.style.transform = 'translateX(0px)';
    track.appendChild(el);
    items.push({ el, x: 0, p: prob, thumb: thumb, decided: false, kind: null, dropAt: 0 });
  }

  function decide(it, now) {
    it.decided = true;
    it.kind = (it.p >= cut) ? 'ok' : 'pass';
    it.el.classList.add(it.kind);
    it.el.querySelector('.ms-prod-p').textContent = Math.round(it.p * 100) + '%';
    if (it.kind === 'ok') {
      arm.classList.add('hit');
      armUntil = now + 150;
      msBeep('clank');
      it.dropAt = now;
      it.el.classList.add('dropping');
      it.el.style.transform = 'translateX(' + (it.x * W) + 'px) translateY(64px)';
    }
  }

  function frame(ts) {
    if (!running) return;
    if (!belt.offsetParent) { stop(); return; }

    const dt = prev ? Math.min(80, ts - prev) : 16;
    prev = ts;
    clock += dt;
    if (armUntil && clock > armUntil) { arm.classList.remove('hit'); armUntil = 0; }

    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.dropAt) {
        if (clock - it.dropAt >= MS_DROP) { land(it.kind, it.thumb); it.el.remove(); items.splice(i, 1); }
        continue;
      }
      it.x += dt / MS_TRAVEL;
      if (!it.decided && it.x >= MS_GATE) {
        decide(it, clock);
        if (it.dropAt) continue;
      }
      if (it.x >= 1) { land(it.kind || 'pass', it.thumb); it.el.remove(); items.splice(i, 1); continue; }
      it.el.style.transform = 'translateX(' + (it.x * W) + 'px)';
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

  function start() {
    stop();
    resetBins();
    W = Math.max(80, belt.clientWidth - MS_PROD_W - 10);
    prev = 0; clock = 0; running = true;
    belt.classList.remove('stopped');
    raf = requestAnimationFrame(frame);
  }

  function setCut(c) {
    cut = c;
    if (cutEl) cutEl.textContent = Math.round(c * 100) + '%';
  }

  return { start, stop, setCut, spawnLive, isRunning: () => running };
}

let msLine3 = null;
function msStopLines() {
  if (msLine3) msLine3.stop();
  if (msLiveTimer) { cancelAnimationFrame(msLiveTimer); msLiveTimer = null; }
  if (msCam) { msCam.stop(); msCam = null; }
}

/* ── ① 미션 수령 ── */
function paintBrief() {
  $('ms-pick').innerHTML = msNames().map((c, i) =>
    '<button class="ms-pick-btn' + (msKey === i ? ' on' : '') + '" data-k="' + i + '">' +
      '<span class="ms-pick-sw" style="background:' + c.color + '"></span>' +
      '<b>' + msEsc(c.name) + '</b>' +
    '</button>').join('');

  if (msKey != null) paintGoal();
}
function paintGoal() {
  const K = msEsc(msNames()[msKey].name);
  $('ms-goal').hidden = false;
  $('ms-goal').innerHTML =
    '<b>목표</b> — 불량품인 <b>' + K + '</b> 을(를) 놓치지 않으면서(재현율 유지), 억울하게 버려지는 정상품(정밀도 하락)을 최소화하는 최적의 예민도를 눈으로 직접 찾아보세요.';
  $('ms-go2').disabled = false;
}
$('ms-pick').addEventListener('click', (e) => {
  const btn = e.target.closest('.ms-pick-btn');
  if (!btn) return;
  const k = +btn.dataset.k;
  msKey = k;
  $('ms-pick').querySelectorAll('.ms-pick-btn').forEach((b) => b.classList.toggle('on', b === btn));
  paintGoal();
});

/* ── ② 실시간 라인 가동 ── */
function liveLoop(ts) {
  if (!msCam || !msLine3) return;
  if (msCam.video.readyState >= 2 && typeof mnet !== 'undefined' && typeof head !== 'undefined' && head) {
    if (ts - msLiveLastTime > 1500) { 
      msLiveLastTime = ts;
      // 캡처 및 추론
      const sz = Math.min(msCam.video.videoWidth, msCam.video.videoHeight);
      const cx = (msCam.video.videoWidth - sz) / 2;
      const cy = (msCam.video.videoHeight - sz) / 2;
      msCam.ctx.drawImage(msCam.video, cx, cy, sz, sz, 0, 0, 224, 224);
      const thumb = msCam.canvas.toDataURL('image/jpeg', 0.6);
      
      let p = 0;
      if (typeof tf !== 'undefined') {
        const probs = tf.tidy(() => head.predict(tf.tensor2d([embed(msCam.video)])).dataSync());
        p = probs[msKey];
      }
      
      msLine3.spawnLive(p, thumb);
    }
  }
  msLiveTimer = requestAnimationFrame(liveLoop);
}

function buildLiveLine() {
  msStopLines();
  if (!msCam && typeof mkCam === 'function') {
    msCam = mkCam($('v-mission'), $('c-mission'), $('ph-mission'));
    msCam.start();
  }
  msLine3 = msMakeLine($('ms-line-3'));
  msLine3.setCut(msCut);
  msLine3.start();
  msLiveLastTime = performance.now();
  msLiveTimer = requestAnimationFrame(liveLoop);
}

$('ms-thres').addEventListener('input', () => {
  msCut = +$('ms-thres').value / 100;
  $('ms-thres-val').textContent = $('ms-thres').value + '%';
  if (msLine3) msLine3.setCut(msCut);
});

function prfAt(cut, k) {
  const ev = typeof window.visionGetEval === 'function' ? window.visionGetEval() : null;
  if (!ev || !ev.probs) return { tp:0, fp:0, fn:0, tn:0, prec:0, rec:0, total:0 };
  let tp = 0, fp = 0, fn = 0, tn = 0;
  ev.probs.forEach((row, i) => {
    const flagged = row[k] >= cut;
    const actual = ev.truth[i] === k;
    if (flagged && actual) tp++;
    else if (flagged) fp++;
    else if (actual) fn++;
    else tn++;
  });
  return {
    tp, fp, fn, tn,
    prec: (tp + fp) ? tp / (tp + fp) : 0,
    rec: (tp + fn) ? tp / (tp + fn) : 0,
    total: ev.probs.length
  };
}

const pctText = (v) => (v == null ? '—' : Math.round(v * 100) + '%');

/* ── ③ 도입 리포트 ── */
function paintReport() {
  const r = prfAt(msCut, msKey);

  let verdictClass, verdictTitle, verdictDesc;
  if (r.rec < 0.7) {
    verdictClass = 'fail';
    verdictTitle = '도입 보류';
    verdictDesc = '재현율이 너무 낮습니다. 실무에 투입하면 불량품을 다 놓칩니다.';
  } else if (r.prec < 0.3) {
    verdictClass = 'fail';
    verdictTitle = '도입 보류';
    verdictDesc = '정밀도가 너무 낮습니다. 정상품을 억울하게 폐기하는 비율이 너무 높습니다.';
  } else {
    verdictClass = 'pass';
    verdictTitle = '도입 성공';
    verdictDesc = '훌륭합니다! 불량품도 잘 잡아내고 억울한 폐기도 최소화했습니다.';
  }

  $('ms-report').innerHTML =
    '<div class="ms-verdict ' + verdictClass + '" style="margin-bottom:24px; padding:16px 20px;">' +
      '<b style="font-size:14px; display:block; margin-bottom:4px;">' + verdictTitle + '</b>' +
      '<span style="font-size:13px;">' + verdictDesc + '</span>' +
    '</div>' +

    '<div class="ms-kpis" style="grid-template-columns:1fr 1fr;">' +
      '<div class="ms-kpi" style="padding:12px 16px; border:1px solid var(--primary); display:flex; flex-direction:column; justify-content:center;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center;">' +
          '<span style="font-size:13px; margin:0;">달성한 재현율</span>' +
          '<b style="font-size:24px; color:' + (r.rec >= 0.7 ? 'var(--green)' : 'var(--primary-ink)') + ';">' + pctText(r.rec) + '</b>' +
        '</div>' +
        '<div style="font-size:11px; color:var(--ink-3); text-align:right; margin-top:4px;">(놓친 불량: ' + r.fn + '개)</div>' +
      '</div>' +
      '<div class="ms-kpi" style="padding:12px 16px; border:1px solid var(--primary); display:flex; flex-direction:column; justify-content:center;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center;">' +
          '<span style="font-size:13px; margin:0;">달성한 정밀도</span>' +
          '<b style="font-size:24px; color:' + (r.prec >= 0.3 ? 'var(--ink)' : 'var(--primary-ink)') + ';">' + pctText(r.prec) + '</b>' +
        '</div>' +
        '<div style="font-size:11px; color:var(--ink-3); text-align:right; margin-top:4px;">(억울한 폐기: ' + r.fp + '개)</div>' +
      '</div>' +
    '</div>' +

    /* 지킨 대상·예민도는 학생이 1·2단계에서 직접 정한 값이라 여기서 되풀이하지 않는다.
       표본 수만 남긴다 — 위 두 숫자를 얼마나 믿을지 판단하는 데 필요하다. */
    '<p style="font-size:12px; color:var(--ink-3); margin:10px 0 0; text-align:right;">2단계에서 모은 ' + r.total + '장으로 확인했습니다.</p>';
}

/* ── 단계 이동 ── */
function msSetStep(n) {
  msStep = n;
  if (n !== 2) {
    if (msLiveTimer) { cancelAnimationFrame(msLiveTimer); msLiveTimer = null; }
    if (msCam) { msCam.stop(); msCam = null; }
  }
  
  if (n === 3) CourseDashboard.markDone('mission');
  
  document.querySelectorAll('#flow-ms .fstep').forEach((el) => {
    const sw = +el.dataset.m;
    el.classList.toggle('active', sw === n);
    el.classList.toggle('done', sw < n);
    const fn = el.querySelector('.fn');
    if (fn) fn.textContent = sw < n ? '✓' : sw;
  });
  document.querySelectorAll('#panel-mission .msstep').forEach((el) => { el.hidden = +el.dataset.m !== n; });

  if (n === 1) paintBrief();
  if (n === 2) {
    $('ms-thres').value = String(Math.round(msCut * 100));
    $('ms-thres-val').textContent = Math.round(msCut * 100) + '%';
    buildLiveLine();
  }
  if (n === 3) paintReport();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function missionEnter() {
  const names = msNames();
  const ready = names && names.length >= 2 && typeof head !== 'undefined' && head;

  $('ms-gate').hidden = !!ready;
  document.querySelectorAll('#flow-ms .fstep').forEach((el) => { el.disabled = !ready; });

  if (!ready) {
    msStopLines();
    document.querySelectorAll('#panel-mission .msstep').forEach((el) => { el.hidden = true; });
    return;
  }
  
  msSetStep(msStep);
}
if (typeof window !== 'undefined') window.visionMissionEnter = missionEnter;

document.querySelectorAll('#flow-ms .fstep').forEach((el) => {
  el.onclick = () => { if (msKey != null) msSetStep(+el.dataset.m); };
});
$('ms-to-train').onclick = () => window.visionShowTab('train');
if($('ms-go2')) $('ms-go2').onclick = () => msSetStep(2);
if($('ms-go3')) $('ms-go3').onclick = () => msSetStep(3);
if($('ms-back2')) $('ms-back2').onclick = () => msSetStep(2);

(window.CoursePracticeLeave = window.CoursePracticeLeave || []).push(msStopLines);
