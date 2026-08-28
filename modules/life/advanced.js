/* Life 심화 미션 로직: 문서를 촬영하고 악조건(훼손/가림)을 합성한 후 오츠 이진화(Otsu) 전처리로 복원 및 OCR 텍스트를 추출합니다. */

let lmStep = 1;
let lmEnv = 'orig';
let lmBusy = false;
let lmCapturedCv = null;   // Step 1에서 촬영한 원본 캔버스
let lmDegradedCv = null;   // Step 2에서 조건(환경)이 적용된 캔버스
let lmFinalText = '';


const LM_ENV_NAME = { orig: '원본', hide: '일부 가림', crumple: '구겨진 종이' };

const LM_ENVS = {
  orig: {
    title: '또렷한 글자는 왜 안정적으로 읽힐까?',
    desc: '<p>글자의 획이 또렷하고 기울지 않으면 형태 정보가 손상 없이 남습니다.</p><p>OCR은 잘라낸 줄 전체 단어를 <b>순서가 있는 시퀀스로</b> 읽으면서 앞뒤 문맥을 함께 씁니다. 형태가 선명하면 문맥의 도움 없이도 판별이 끝나므로 가장 안정적인 조건입니다.</p>'
  },
  hide: {
    title: '가려진 글자는 왜 복원되지 않을까?',
    desc: '<p>QR 코드와 결정적으로 다른 지점입니다. QR은 <b>오류정정용 여유분</b>을 미리 담아 두기 때문에 일부가 가려져도 계산으로 복원됩니다.</p><p>하지만 종이에 인쇄된 글자에는 그런 여유분이 없습니다. 가려진 부분은 정보가 <b>그냥 사라진 것</b>이라 되살릴 방법이 없고, 남은 흔적만 읽어 냅니다.</p>'
  },
  crumple: {
    title: '구겨지면 어떤 글자부터 무너질까?',
    desc: '<p>0과 O, 1과 l 처럼 원래 형태가 거의 같은 글자들이 있습니다. 평소에는 폭 비율이나 획 두께 같은 미세한 차이와 문맥으로 구분합니다.</p><p>종이가 구겨지면 그 미세한 차이가 뒤틀려 사라집니다. 다른 글자는 멀쩡한데 <b>모양이 닮은 글자만 골라</b> 틀리는 것이 특징입니다.</p>'
  }
};

/* ── 1단계: 카메라 켜기 및 촬영 ── */
const limitCam = typeof mkCam === 'function' ? mkCam($('v-limit'), $('c-limit'), $('ph-limit')) : null;

if ($('limit-cam')) {
  $('limit-cam').onclick = async () => {
    $('limit-cam').disabled = true;
    try {
      await limitCam.start();
      $('limit-shot').disabled = false;
      $('limit-shot').classList.add('primary');
      $('limit-cam').classList.remove('primary');
    } catch (e) {
      alert(e.message);
      $('limit-cam').disabled = false;
    }
  };
}

if ($('limit-shot')) {
  $('limit-shot').onclick = () => {
    if (!limitCam.video.videoWidth) return;
    limitCam.syncSize();
    const ctx = limitCam.canvas.getContext('2d');
    ctx.drawImage(limitCam.video, 0, 0, limitCam.canvas.width, limitCam.canvas.height);
    
    // 원본 저장
    lmCapturedCv = document.createElement('canvas');
    lmCapturedCv.width = limitCam.canvas.width;
    lmCapturedCv.height = limitCam.canvas.height;
    lmCapturedCv.getContext('2d').drawImage(limitCam.canvas, 0, 0);

    limitCam.stop();
    
    goToLmStep(2);
    // 기본 조건 'orig'로 렌더링
    lmTest('orig');
  };
}

/* ── 조건별 훼손 (픽셀 연산) ── */
function lmDegrade(sourceCv, env) {
  const cv = document.createElement('canvas');
  cv.width = sourceCv.width;
  cv.height = sourceCv.height;
  const x = cv.getContext('2d');
  x.drawImage(sourceCv, 0, 0);
  const W = cv.width, H = cv.height;

  if (env === 'orig') return cv;

  if (env === 'hide') {
    x.fillStyle = '#0f172a';
    x.fillRect(W * 0.2, H * 0.4, W * 0.6, H * 0.2); // 중앙 일부를 가림
    return cv;
  }

  const img = x.getImageData(0, 0, W, H), d = img.data;

  if (env === 'crumple') {
    const src = new Uint8ClampedArray(d);
    for (let y = 0; y < H; y++) {
      const shift = Math.round(Math.sin(y / 7) * 4 + Math.sin(y / 23) * 6);
      for (let px = 0; px < W; px++) {
        const sx = px + shift < 0 ? 0 : px + shift > W - 1 ? W - 1 : px + shift;
        const to = (y * W + px) * 4, from = (y * W + sx) * 4;
        d[to] = src[from]; d[to + 1] = src[from + 1]; d[to + 2] = src[from + 2];
      }
    }
    x.putImageData(img, 0, 0);
    return cv;
  }
  return cv;
}

/* ── 오츠 이진화(Otsu) 전처리 함수 ── */
function lmApplyPreprocess(sourceCv) {
  const cv = document.createElement('canvas');
  cv.width = sourceCv.width;
  cv.height = sourceCv.height;
  const ctx = cv.getContext('2d');
  ctx.drawImage(sourceCv, 0, 0);

  const img = ctx.getImageData(0, 0, cv.width, cv.height);
  const d = img.data, n = d.length / 4;
  const gray = new Uint8Array(n), hist = new Array(256).fill(0);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { 
    const g = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0; 
    gray[j] = g; hist[g]++; 
  }
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, maxVar = 0, thr = 127;
  for (let t = 0; t < 256; t++) { 
    wB += hist[t]; if (!wB) continue; 
    const wF = n - wB; if (!wF) break; 
    sumB += t * hist[t]; 
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF); 
    if (between > maxVar) { maxVar = between; thr = t; } 
  }
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { 
    const v = gray[j] > thr ? 255 : 0; 
    d[i] = d[i + 1] = d[i + 2] = v; 
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/* ── 실제 OCR 실행 ── */
async function lmRecognize(cv) {
  if (typeof Tesseract === 'undefined') throw new Error('Tesseract 라이브러리를 불러오지 못했습니다');
  if (typeof getWorker !== 'function') throw new Error('OCR 워커를 찾지 못했습니다');
  const worker = await getWorker();
  const res = await worker.recognize(cv);
  return {
    text: (res.data.text || '').replace(/\s+/g, ' ').trim(),
    conf: Math.round(res.data.confidence || 0),
  };
}

/* ── ②단계: 조건 하나를 실제로 테스트한다 ── */
async function lmTest(env) {
  if (lmBusy || !lmCapturedCv) return;
  lmBusy = true;
  lmEnv = env;
  
  const msg = $('lm-res-msg');
  const sub = $('lm-res-sub');
  const cap = $('lm-img-cap');
  const title = $('lm-reason-title');
  const desc = $('lm-reason-desc');
  
  if (msg) { msg.className = 'lm-res-msg'; msg.textContent = '인식 중…'; }
  if (sub) sub.textContent = (LM_ENV_NAME[env] || env) + ' 조건으로 만들어 Tesseract 에 넣는 중입니다.';
  
  // 조건 적용
  lmDegradedCv = lmDegrade(lmCapturedCv, env);
  
  // 화면에 그리기
  const testCv = $('lm-test-cv');
  if (testCv) {
    testCv.width = lmDegradedCv.width;
    testCv.height = lmDegradedCv.height;
    const ctx = testCv.getContext('2d');
    ctx.drawImage(lmDegradedCv, 0, 0);
  }

  // 설명 업데이트
  const cfg = LM_ENVS[env] || LM_ENVS.orig;
  if (title) title.textContent = cfg.title;
  if (desc) desc.innerHTML = cfg.desc;
  if (cap) cap.textContent = (LM_ENV_NAME[env] || env) + ' 적용됨';

  try {
    const out = await lmRecognize(lmDegradedCv);
    if (msg) {
      const isGood = out.conf > 70;
      msg.className = 'lm-res-msg ' + (isGood ? 'succ' : 'fail');
      msg.textContent = (isGood ? '✓ 인식 성공' : '✕ 인식 실패 (불안정)') + ' (신뢰도 ' + out.conf + '%)';
    }
    if (sub) sub.textContent = out.text ? '결과: ' + out.text : '(아무것도 읽지 못했습니다)';
  } catch (e) {
    if (msg) { msg.className = 'lm-res-msg fail'; msg.textContent = '✕ OCR 실패'; }
    if (sub) sub.textContent = e.message;
  }
  lmBusy = false;
}

const lmTabs = document.getElementById('lm-tabs');
if (lmTabs) {
  lmTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.lm-tab');
    if (!tab || lmBusy) return;

    document.querySelectorAll('.lm-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    lmTest(tab.dataset.env);
  });
}

const flowLimit = document.getElementById('flow-limit');
if (flowLimit) {
  flowLimit.addEventListener('click', (e) => {
    const btn = e.target.closest('.fstep');
    if (!btn || lmBusy) return;
    const w = +btn.dataset.lw;
    
    if (w >= 2 && !lmCapturedCv) {
      alert('먼저 1단계에서 문서를 촬영해주세요.');
      return;
    }
    
    // 만약 1단계로 돌아가면, 다시 촬영할 수 있도록 준비
    if (w === 1 && lmStep !== 1) {
       // Stop previous camera if any
       if (limitCam && limitCam.stream) limitCam.stop();
       $('limit-cam').disabled = false;
       $('limit-shot').disabled = true;
       $('limit-shot').classList.remove('primary');
       $('limit-cam').classList.add('primary');
       $('ph-limit').style.display = 'grid';
       $('c-limit').style.display = 'none';
       if (limitCam.video) limitCam.video.style.display = '';
       lmCapturedCv = null;
    }

    goToLmStep(w);
    if (w === 2) {
      lmTest(lmEnv); // Refresh 2nd step with current environment
    }
  });
}

/* ── UI 흐름 제어 ── */
function goToLmStep(w) {
  lmStep = w;
  document.querySelectorAll('#flow-limit .fstep').forEach(el => {
    const sw = +el.dataset.lw;
    el.classList.toggle('active', sw === w);
    el.classList.toggle('done', sw < w);
    const fn = el.querySelector('.fn');
    if (fn) fn.textContent = sw < w ? '✓' : sw;
  });

  document.querySelectorAll('#panel-limit .lstep').forEach(el => {
    el.hidden = (+el.dataset.lw !== w);
  });

  if (w === 3) {
    if (lmDegradedCv) {
      const badCv = $('lm-bad-cv');
      const goodCv = $('lm-good-cv');
      if (badCv) {
        badCv.width = lmDegradedCv.width;
        badCv.height = lmDegradedCv.height;
        badCv.getContext('2d').drawImage(lmDegradedCv, 0, 0);
      }
      const prepCv = lmApplyPreprocess(lmDegradedCv);
      if (goodCv) {
        goodCv.width = prepCv.width;
        goodCv.height = prepCv.height;
        goodCv.getContext('2d').drawImage(prepCv, 0, 0);
      }
    }
    $('lm-prog-bar').style.width = '0%';
    $('lm-prog-text').textContent = '대기 중...';
    $('lm-batch-btn').disabled = false;
    $('lm-batch-btn').textContent = '보정 후 다시 읽기';
  } else if (w === 4) {
    window.CourseDashboard && CourseDashboard.markDone('limit');
    $('lm-final-text').value = lmFinalText;
    
    // 4단계 좌측에 전처리된 이미지 표시
    if (lmDegradedCv) {
      const prepCv = lmApplyPreprocess(lmDegradedCv);
      const goodCv2 = $('lm-good-cv-2');
      if (goodCv2) {
        goodCv2.width = prepCv.width;
        goodCv2.height = prepCv.height;
        goodCv2.getContext('2d').drawImage(prepCv, 0, 0);
      }
    }
  }
}
if (typeof window !== 'undefined') window.goToLmStep = goToLmStep;

/* ── ③단계: 전처리 후 다시 읽기 (결과 추출) ── */
async function startLmBatch() {
  if (lmBusy || !lmDegradedCv) return;
  lmBusy = true;
  const btn = $('lm-batch-btn');
  const bar = $('lm-prog-bar');
  const txt = $('lm-prog-text');

  btn.disabled = true;
  btn.textContent = '처리 중...';

  try {
    txt.textContent = '전처리(오류 보정) 적용 및 텍스트 추출 중...';
    bar.style.width = '30%';
    
    // 오츠 이진화 적용
    const prepCv = lmApplyPreprocess(lmDegradedCv);
    bar.style.width = '60%';

    // OCR 실행
    const out = await lmRecognize(prepCv);
    lmFinalText = out.text || '(인식된 텍스트가 없습니다)';
    
    bar.style.width = '100%';
    txt.textContent = '추출 완료!';
    
    setTimeout(() => {
      goToLmStep(4);
    }, 600);
  } catch(e) {
    txt.textContent = '오류 발생: ' + e.message;
    btn.disabled = false;
    btn.textContent = '다시 시도';
  }
  lmBusy = false;
}
