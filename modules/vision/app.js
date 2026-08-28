/* vision 코스 실습 로직 — 탭 1(객체 탐지 + 픽셀·필터) · 탭 전환과 카메라 수명주기.
   탭 2(전이학습 위저드)는 advanced.js, 탭 3(문제 해결 미션)은 mission.js 에 있고,
   둘 다 여기서 정의한 전역($ · setStatus · mkCam · donutSet)을 그대로 쓴다.

   탭 1 설계 — 필터와 탐지를 한 화면에 둔 이유:
   필터를 건 프레임을 그대로 탐지 입력으로 넘긴다. 그래서 흑백으로 바꿔도 인식되는 것을
   눈으로 확인할 수 있고("AI 는 색이 아니라 형태를 본다"), 픽셀을 만지는 일이 AI 인식과
   끊기지 않는다. 픽셀 전용 탭을 따로 두는 것보다 개념이 붙어 있다.

   미러링 규칙: 작업 캔버스에 좌우 반전해 그린 뒤 그것을 탐지에도 화면에도 쓴다.
   입력과 출력이 같은 좌표계라 상자 좌표를 따로 뒤집을 필요가 없고, 글자도 안 뒤집힌다. */

const $ = (id) => document.getElementById(id);
const DONUT_C = 251.3;

function setStatus(t, c) {
  const s = $('status');
  if (s) { s.textContent = t; s.className = 'status' + (c ? ' ' + c : ''); }
  document.querySelectorAll('.stage').forEach(stage => {
    if (stage.offsetParent !== null) {
      let loader = stage.querySelector('.stage-loader');
      if (!loader) {
        loader = document.createElement('div');
        loader.className = 'stage-loader';
        loader.style.cssText = 'position:absolute; inset:0; background:#0d1016; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; font-size:15px; font-weight:700; z-index:20;';
        stage.appendChild(loader);
      }
      if (c === 'busy') {
        loader.style.display = 'flex';
        loader.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite; margin-bottom:12px; color:var(--primary);"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>` + t;
        if (!document.getElementById('spin-anim')) {
          const style = document.createElement('style');
          style.id = 'spin-anim';
          style.textContent = '@keyframes spin { 100% { transform: rotate(360deg); } }';
          document.head.appendChild(style);
        }
      } else {
        loader.style.display = 'none';
      }
    }
  });
}
function donutSet(arc, pctEl, frac, color) {
  if (!arc) return;
  const f = Math.max(0, Math.min(1, frac || 0));
  arc.setAttribute('stroke-dasharray', (f * DONUT_C).toFixed(1) + ' ' + DONUT_C);
  if (color) arc.style.stroke = color;
  if (pctEl) pctEl.textContent = Math.round(f * 100) + '%';
}

/* 카메라 한 대를 감싼다. 탭을 떠날 때 반드시 stop() 해서 rAF 루프를 끊는다. */
function mkCam(video, canvas, ph) {
  const cam = {
    video, canvas,
    ctx: canvas.getContext('2d', { willReadFrequently: true }),
    stream: null, raf: null
  };
  cam.start = async function () {
    if (cam.stream) return;
    cam.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
    });
    video.srcObject = cam.stream;
    await video.play().catch(() => {});
    if (ph) ph.style.display = 'none';
  };
  cam.stop = function () {
    if (cam.raf) { cancelAnimationFrame(cam.raf); cam.raf = null; }
    if (cam.stream) { cam.stream.getTracks().forEach((t) => t.stop()); cam.stream = null; }
    video.srcObject = null;
    cam.ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (ph) ph.style.display = '';
  };
  cam.fit = function () {
    if (video.videoWidth && canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
  };
  return cam;
}
if (typeof window !== 'undefined') { window.$ = $; window.mkCam = mkCam; window.donutSet = donutSet; window.setStatus = setStatus; window.DONUT_C = DONUT_C; }

/* ══════════════════════════════════════════════════════════
   픽셀 연산 — AI 가 전혀 개입하지 않는다.
   getImageData 로 숫자를 꺼내 계산하고 putImageData 로 되돌려 놓는 것이 전부.
   (콘솔의 filter.html · colortrack.html 을 tf.js 없이 canvas 2D 로 옮긴 것)
   ══════════════════════════════════════════════════════════ */
let fxMode = 'none';

$('fx-row').addEventListener('click', (e) => {
  const btn = e.target.closest('.fx-btn');
  if (!btn) return;
  fxMode = btn.dataset.fx;
  $('fx-row').querySelectorAll('.fx-btn').forEach((b) => b.classList.toggle('on', b === btn));
});

function applyFilter(ctx, W, H) {
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;

  if (fxMode === 'gray') {
    // 흑백 = 세 숫자의 평균 하나로 합치기
    for (let i = 0; i < d.length; i += 4) {
      const m = (d[i] + d[i + 1] + d[i + 2]) / 3;
      d[i] = d[i + 1] = d[i + 2] = m;
    }
  } else if (fxMode === 'invert') {
    // 색 반전 = 255 − 값
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2];
    }
  } else if (fxMode === 'edge') {
    // 윤곽선 = 오른쪽·아래 이웃과의 밝기 차. 계산 중에 원본이 덮이지 않도록 따로 떠 둔다.
    const src = new Uint8ClampedArray(d);
    const lum = (i) => (src[i] + src[i + 1] + src[i + 2]) / 3;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const gx = x < W - 1 ? Math.abs(lum(i) - lum(i + 4)) : 0;
        const gy = y < H - 1 ? Math.abs(lum(i) - lum(i + W * 4)) : 0;
        const e = Math.min(255, (gx + gy) * 3);
        d[i] = d[i + 1] = d[i + 2] = e;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

/* ══════════════════════════════════════════════════════════
   탭 1 · 객체 탐지 + 픽셀·필터
   임계값 실험이 성립하려면 걸러진 후보의 개수까지 보여 줘야 한다.
   그래서 모델에는 아주 낮은 점수(0.02)까지 받아 오게 하고, 자르는 일은 여기서 한다.
   ══════════════════════════════════════════════════════════ */
const detectCam = mkCam($('v-detect'), $('c-detect'), $('ph-detect'));
const work = document.createElement('canvas');           // 필터를 건 프레임 = 탐지 입력 = 화면 출력
const wctx = work.getContext('2d', { willReadFrequently: true });
let cocoModel = null;
let detectSeen = false;          // 상자를 한 번이라도 그렸는지 — 실습 ① 완료 신호
let thres = 0.5;

async function loadCoco() {
  if (cocoModel) return cocoModel;
  setStatus('탐지 모델 불러오는 중…', 'busy');
  cocoModel = await cocoSsd.load();
  return cocoModel;
}

function paintThresNote() {
  const el = $('thres-note');
  if (!el) return;
  if (thres >= 0.8) {
    el.className = 'thres-note strict';
    el.innerHTML = '<b>매우 엄격</b> — 확실한 것만 통과합니다. 눈앞에 있는 물건도 놓치기 시작합니다.';
  } else if (thres <= 0.3) {
    el.className = 'thres-note loose';
    el.innerHTML = '<b>매우 느슨</b> — 웬만하면 통과시킵니다. 벽이나 그림자에도 엉뚱한 이름이 붙습니다.';
  } else {
    el.className = 'thres-note balanced';
    el.innerHTML = '<b>균형</b> — 흔히 쓰는 구간입니다. 여기서 위아래로 움직여 보며 무엇이 바뀌는지 보세요.';
  }
}
$('thres').addEventListener('input', () => {
  thres = +$('thres').value / 100;
  $('thres-val').textContent = $('thres').value + '%';
  paintThresNote();
});
paintThresNote();

// 작업 캔버스가 이미 좌우 반전돼 있으므로 상자 좌표를 따로 뒤집지 않는다.
function drawBox(ctx, p) {
  const x = p.bbox[0], y = p.bbox[1], w = p.bbox[2], h = p.bbox[3];
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#f0473a';
  ctx.strokeRect(x, y, w, h);

  const label = p.class + '  ' + Math.round(p.score * 100) + '%';
  ctx.font = '700 16px Pretendard, system-ui, sans-serif';
  ctx.textBaseline = 'alphabetic';
  const tw = ctx.measureText(label).width;
  const ly = y > 24 ? y - 22 : y + 2;
  ctx.fillStyle = '#f0473a';
  ctx.fillRect(x, ly, tw + 14, 22);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, x + 7, ly + 16);
}

function paintDetectPanel(shown, dropped) {
  $('det-shown').textContent = shown.length;
  $('det-hidden').textContent = dropped;

  // 왜 안 나오는지는 위의 [표시] / [걸러짐] 숫자가 이미 말해 준다. 여기서 또 설명하지 않는다.
  if (!shown.length) {
    donutSet($('det-arc'), $('det-pct'), 0);
    $('det-top').textContent = '없음';
    $('det-list').innerHTML = '<div class="empty">표시할 대상이 없어요.</div>';
    return;
  }
  const top = shown[0];
  donutSet($('det-arc'), $('det-pct'), top.score);
  $('det-top').textContent = top.class;
  $('det-list').innerHTML = shown.slice(0, 6).map((p) =>
    '<div class="det-row"><span class="det-name">' + p.class + '</span>' +
    '<span class="det-bar"><i style="width:' + Math.round(p.score * 100) + '%"></i></span>' +
    '<span class="det-pct">' + Math.round(p.score * 100) + '%</span></div>').join('');
}

async function detectLoop() {
  if (!detectCam.stream) return;
  const v = detectCam.video;
  if (v.readyState >= 2 && cocoModel) {
    const W = v.videoWidth, H = v.videoHeight;
    if (work.width !== W) { work.width = W; work.height = H; }

    // 1) 셀피 뷰로 뒤집어 그리고 2) 필터를 걸어 3) 그 결과를 탐지에 넘긴다.
    wctx.save();
    wctx.translate(W, 0); wctx.scale(-1, 1);
    wctx.drawImage(v, 0, 0, W, H);
    wctx.restore();
    if (fxMode !== 'none') applyFilter(wctx, W, H);

    let preds = [];
    try { preds = await cocoModel.detect(work, 20, 0.02); } catch (e) { /* 프레임 하나 건너뛴다 */ }
    if (!detectCam.stream) return;   // 기다리는 사이 카메라가 꺼졌을 수 있다

    detectCam.fit();
    const ctx = detectCam.ctx;
    ctx.drawImage(work, 0, 0);
    const shown = preds.filter((p) => p.score >= thres).sort((a, b) => b.score - a.score);
    shown.forEach((p) => drawBox(ctx, p));
    paintDetectPanel(shown, preds.length - shown.length);
    if (shown.length && !detectSeen) { detectSeen = true; window.CourseDashboard && CourseDashboard.markDone('detect'); }
  }
  detectCam.raf = requestAnimationFrame(detectLoop);
}

// 카메라를 끄면 직전 탐지 숫자가 남지 않도록 패널도 함께 비운다.
function resetDetectPanel() {
  $('det-shown').textContent = '0';
  $('det-hidden').textContent = '0';
  donutSet($('det-arc'), $('det-pct'), 0);
  $('det-top').textContent = '대기 중';
  $('det-list').innerHTML = '<div class="empty">카메라를 켜고 물건을 비춰 보세요.</div>';
}

$('detect-cam').onclick = async () => {
  if (detectCam.stream) {
    detectCam.stop();
    resetDetectPanel();
    $('detect-cam').textContent = '카메라 켜기';
    $('detect-state').textContent = '대기';
    $('detect-state').classList.remove('on');
    setStatus('대기 중');
    return;
  }
  try {
    await loadCoco();
    setStatus('카메라 시작…', 'busy');
    await detectCam.start();
    $('detect-cam').textContent = '카메라 끄기';
    $('detect-state').textContent = '탐지 중';
    $('detect-state').classList.add('on');
    setStatus('탐지 중 · LIVE', 'live');
    detectLoop();
  } catch (e) {
    setStatus('카메라 오류', 'busy');
    alert('카메라를 시작할 수 없습니다: ' + e.message);
  }
};

/* ══════════════════════════════════════════════════════════
   탭 전환 — 떠나는 탭의 카메라를 반드시 끈다.
   탭 2 는 advanced.js 가 window.visionTrainStop 으로,
   탭 3 은 mission.js 가 window.visionMissionEnter 로 각각 훅을 등록한다.
   ══════════════════════════════════════════════════════════ */
function showTab(s) {
  document.querySelectorAll('.step').forEach((b) => b.classList.toggle('active', b.dataset.step === s));

  if (s !== 'detect' && detectCam.stream) {
    detectCam.stop();
    $('detect-cam').textContent = '카메라 켜기';
    $('detect-state').textContent = '대기';
    $('detect-state').classList.remove('on');
  }
  if (s !== 'train' && typeof window.visionTrainStop === 'function') window.visionTrainStop();

  $('panel-detect').style.display = s === 'detect' ? 'grid' : 'none';
  $('panel-train').style.display = s === 'train' ? 'block' : 'none';
  $('panel-mission').style.display = s === 'mission' ? 'block' : 'none';

  if (s === 'mission' && typeof window.visionMissionEnter === 'function') window.visionMissionEnter();
  setStatus('대기 중');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
if (typeof window !== 'undefined') window.visionShowTab = showTab;

document.querySelectorAll('.step').forEach((btn) => {
  btn.onclick = () => showTab(btn.dataset.step);
});

setStatus('대기 중');
if (!window.isSecureContext) {
  const b = $('banner');
  b.classList.add('on');
  b.innerHTML = EduinoIcons.svg('alert') +
    ' 카메라는 <b>localhost</b> 또는 <b>https</b> 에서만 켜집니다. 배포된 https 주소로 접속해 주세요.';
}
/* 실습 단계를 떠날 때 켜 둔 카메라를 끈다 (course-dashboard.js 의 leaveStep 이 부른다).
   showTab 은 모듈 안 탭 버튼을 눌러야 돌므로 여기서 따로 꺼야 한다. 학습 결과는 그대로 둔다. */
(window.CoursePracticeLeave = window.CoursePracticeLeave || []).push(() => {
  if (detectCam.stream) {
    detectCam.stop();
    resetDetectPanel();
    $('detect-cam').textContent = '카메라 켜기';
    $('detect-state').textContent = '대기';
    $('detect-state').classList.remove('on');
  }
  if (typeof window.visionTrainStop === 'function') window.visionTrainStop();
  setStatus('대기 중');
});
