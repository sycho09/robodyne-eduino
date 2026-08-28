/* Gesture 심화 미션 로직: 제스처 제어 데모 및 실제 모델 기반 혼동행렬 시뮬레이션. */
/* ════ 고급-응용: 제스처 제어 데모 ════ */
let dmStep = 1;
let dmFunc = 'vol';
const dmFuncNames = { ppt: '[다음 슬라이드]', vol: '[시스템 볼륨 조절]', zoom: '[화면 확대/축소]' };

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

function selectDemoFunc(el, func) {
  document.querySelectorAll('.dm-func-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  dmFunc = func;
}
if (typeof window !== 'undefined') window.selectDemoFunc = selectDemoFunc;

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
  
  // 최종 매핑(3단계)을 떠나면 데모 카메라를 끈다
  if (w !== 3 && typeof stopDemoCam !== 'undefined') {
    stopDemoCam();
  }
  
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
    const resFunc = $('dm-res-func');
    if (resFunc) resFunc.textContent = dmFuncNames[dmFunc];
    const resThres = $('dm-res-thres');
    if (resThres) resThres.textContent = $('dm-slider').value + '%';
    
    // Set target gesture name (class 0)
    const tgtGest = $('dm-res-target-gesture');
    if (tgtGest) {
      if (typeof classes !== 'undefined' && classes.length > 0) {
        tgtGest.textContent = classes[0].name;
      } else {
        tgtGest.textContent = '등록된 제스처';
      }
    }
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
  const per = m.names.map(() => ({ right: 0, wrong: 0, miss: 0 }));
  m.rows.forEach(r => {
    let top = 0;
    for (let i = 1; i < r.p.length; i++) if (r.p[i] > r.p[top]) top = i;
    if (r.p[top] < cut) per[r.truth].miss++;
    else if (top === r.truth) per[r.truth].right++;
    else per[r.truth].wrong++;
  });
  const wrong = per.reduce((s, x) => s + x.wrong, 0);
  const miss = per.reduce((s, x) => s + x.miss, 0);
  const verdict = miss > wrong * 1.8 ? 'miss' : wrong > miss * 1.8 ? 'wrong' : 'balanced';
  return { per, names: m.names, wrong, miss, total: m.rows.length, verdict };
}

/* 표의 라벨을 학생이 직접 만든 클래스 이름에 맞춰 동적으로 업데이트합니다. 기존 DOM 아이콘은 보존합니다. */
function dmSetLabel(el, name) {
  if (!el || !name) return;
  const ic = el.querySelector('.ic-inline');
  el.textContent = '';
  if (ic) { el.appendChild(ic); el.appendChild(document.createTextNode(' ' + name)); }
  else el.appendChild(document.createTextNode(name));
}

function paintConfusion() {
  const slider = $('dm-slider');
  if (!slider) return;
  const thres = +slider.value;
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  const cells = ['dm-cm-00', 'dm-cm-01', 'dm-cm-0n', 'dm-cm-10', 'dm-cm-11', 'dm-cm-1n'];
  const note = $('dm-cm-note');
  /* 표 위 안내문에는 id 가 없다 — 임계값 <b> 의 부모가 그 문단이다. */
  const lead = $('dm-cm-thres') ? $('dm-cm-thres').parentElement : null;
  const c = confusionAt(thres);

  if (!c) {
    cells.forEach(id => set(id, '—'));
    if (lead) lead.innerHTML = '<b>📊 테스트 샘플 <span id="dm-cm-total">0</span>개 적용 결과</b><br><span style="color:var(--ink-3); font-size:12.5px;">아직 잴 것이 없습니다.</span>';
    if (note) note.innerHTML = '이 표는 <b>[2. 중급 · 제작] 코스에서 직접 모은 데이터</b>로 채워집니다. 제스처 2가지를 각각 <b>8개 이상</b> 모아 학습을 마친 뒤 다시 오세요.';
    return;
  }

  const a = c.per[0], b = c.per[1];
  if (lead) {
    lead.innerHTML = '<b>📊 테스트 샘플 <span id="dm-cm-total">' + c.total + '</span>개 적용 결과</b><br><span style="color:var(--ink-3); font-size:12.5px;">슬라이더를 움직이면 결과가 실시간으로 바뀝니다.</span>';
  }
  set('dm-cm-00', a.right + ' (성공)');
  set('dm-cm-01', a.wrong + ' (오인)');
  set('dm-cm-0n', a.miss + ' (무시)');
  set('dm-cm-10', b.wrong + ' (오인)');
  set('dm-cm-11', b.right + ' (성공)');
  set('dm-cm-1n', b.miss + ' (무시)');

  const tbl = document.querySelector('.dm-cm-table');
  if (tbl) {
    const hs = tbl.querySelectorAll('thead th');
    dmSetLabel(hs[1], c.names[0]); dmSetLabel(hs[2], c.names[1]);
    const rs = tbl.querySelectorAll('tbody tr');
    if (rs[0]) dmSetLabel(rs[0].querySelector('th'), c.names[0]);
    if (rs[1]) dmSetLabel(rs[1].querySelector('th'), c.names[1]);
  }

  if (!note) return;
  const extra = c.names.length > 2 ? ' (클래스 ' + c.names.length + '개 중 앞의 2개만 표에 나옵니다)' : '';
  if (c.verdict === 'miss') {
    note.innerHTML = '임계값이 높아 <b>오인은 거의 없지만</b> ' + c.total + '개 중 ' + c.miss + '개가 아예 무시됐습니다. 안전하지만 답답한 설정입니다.' + extra;
  } else if (c.verdict === 'wrong') {
    note.innerHTML = '임계값이 낮아 <b>반응은 잘 하지만</b> ' + c.total + '개 중 ' + c.wrong + '개를 엉뚱한 동작으로 실행했습니다. 오작동이 잦은 설정입니다.' + extra;
  } else {
    note.innerHTML = '오인 ' + c.wrong + '개, 무시 ' + c.miss + '개로 균형이 잡힌 설정입니다. 어느 쪽 실수가 더 치명적인지에 따라 임계값을 옮기면 됩니다.' + extra;
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
let demoLastTriggerTime = 0;
let demoPptSlide = 1;
let demoVolLevel = 30;
let demoZoomLevel = 1.0;


function stopDemoCam() {
  if (typeof demoCam !== 'undefined' && demoCam && demoCam.stream) {
    demoCam.stop();
  }
  if (typeof demoRaf !== 'undefined' && demoRaf) {
    cancelAnimationFrame(demoRaf);
  }
  const state = $('demo-cam-state'); 
  if (state) state.textContent = '대기';
  
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
      demoLoop();
    } catch (e) {
      btnDemoCam.textContent = '카메라 오류';
    }
  };
}
if (btnDemoCamOff) {
  btnDemoCamOff.onclick = stopDemoCam;
}

async function demoLoop() {
  if (!demoCam || !demoCam.stream) return;
  const kp = await estimate(demoCam);
  if (kp) {
    drawHand(demoCam.canvas.getContext('2d'), kp, '#7c6cff');
    if (typeof head !== 'undefined' && typeof classes !== 'undefined' && head) {
      const usable = classes.filter(c => c.samples.length >= 8);
      if (usable.length >= 2) {
        const feat = handFeature(kp);
        const probs = tf.tidy(() => head.predict(tf.tensor2d([feat])).arraySync()[0]);
        const prob0 = probs[0] * 100;
        const thres = +$('dm-slider').value;
        if (prob0 >= thres) {
          const now = Date.now();
          if (now - demoLastTriggerTime > 1500) {
            demoLastTriggerTime = now;
            triggerDemoAction();
          }
        }
      }
    }
  }
  demoRaf = requestAnimationFrame(demoLoop);
}

function triggerDemoAction() {
  const idle = $('dm-feedback-idle');
  const active = $('dm-feedback-active');
  if (!idle || !active) return;
  
  idle.hidden = true;
  active.hidden = false;
  
  if (dmFunc === 'ppt') {
    demoPptSlide++;
    if (demoPptSlide > 5) demoPptSlide = 1;
    active.innerHTML = `
      <div class="demo-ppt-wrap">
        <div class="demo-ppt-slide">슬라이드 ${demoPptSlide} ➔</div>
      </div>
      <div class="dm-feedback-text" style="margin-top:16px;">슬라이드 넘김! (${demoPptSlide}페이지)</div>
    `;
  } else if (dmFunc === 'vol') {
    let prevVol = demoVolLevel;
    demoVolLevel += 15;
    if (demoVolLevel > 100) { demoVolLevel = 30; prevVol = 15; }
    active.innerHTML = `
      <style>
        @keyframes volFillDyn { 0% { width: ${prevVol}%; } 100% { width: ${demoVolLevel}%; } }
        .demo-vol-bar-fg-dyn { height:100%; background:var(--primary); width:${demoVolLevel}%; animation: volFillDyn 0.5s ease-out forwards; }
      </style>
      <div class="demo-vol-wrap">
        <span class="ic-inline" style="font-size:24px; color:var(--ink-2)">${EduinoIcons.svg('trending-up')}</span>
        <div class="demo-vol-bar-bg">
          <div class="demo-vol-bar-fg-dyn"></div>
        </div>
      </div>
      <div class="dm-feedback-text" style="margin-top:16px;">시스템 볼륨 조절! (${demoVolLevel}%)</div>
    `;
  } else if (dmFunc === 'zoom') {
    let prevZoom = demoZoomLevel;
    demoZoomLevel += 0.3;
    if (demoZoomLevel > 2.5) { demoZoomLevel = 1.0; prevZoom = 0.7; }
    active.innerHTML = `
      <style>
        @keyframes zoomPopDyn { 0% { transform: scale(${prevZoom}); } 100% { transform: scale(${demoZoomLevel}); box-shadow:var(--shadow); border-color:var(--primary-line); } }
        .demo-zoom-target-dyn { display:flex; align-items:center; justify-content:center; width:120px; height:120px; background:#fff; border-radius:12px; border:1px solid var(--line); box-shadow:var(--shadow-sm); animation: zoomPopDyn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
      </style>
      <div class="demo-zoom-wrap">
        <div class="demo-zoom-target-dyn">
          <span class="ic-inline" style="font-size:48px; color:var(--ink-3)">${EduinoIcons.svg('search')}</span>
        </div>
      </div>
      <div class="dm-feedback-text" style="margin-top:16px;">화면 확대! (${Math.round(demoZoomLevel * 100)}%)</div>
    `;
  }
  
  setTimeout(() => {
    idle.hidden = false;
    active.hidden = true;
  }, 1200); // 1.2s to let animation finish before hiding
}
