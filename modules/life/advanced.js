/* life 코스 3번째 탭(고급·응용 — 인식 한계와 자동화) 로직.
   app.js 뒤에 로드되며, app.js 가 정의한 전역($ · getWorker 등)을 그대로 쓴다.

   ── 실측으로 전환 ────────────────────────────────────────────────
   예전에는 조건별 OCR 결과가 문자열로 박혀 있었다('1C# AMFRICAMO 4,5G0@' 등).
   같은 페이지에 Tesseract 가 이미 올라와 있는데도 한 번도 돌리지 않았고,
   그래서 학생이 무엇을 하든 늘 같은 실패 문구가 나왔다.

   이제는 영수증을 오프스크린 캔버스에 그린 뒤(합성 데이터), 조건별로 실제
   픽셀을 훼손해 진짜 Tesseract 에 넣는다. 화면에 뜨는 글자·신뢰도는 전부
   그 자리에서 잰 값이다 — 조건을 만드는 쪽만 합성이고, 재는 쪽은 실측이다.

   캔버스는 DOM 에 붙이지 않는다. 화면 구성은 예전 그대로다. */

/* ════ 3. 고급-응용: 인식 한계 테스트 ════ */
let lmStep = 1;
let lmEnv = 'orig';
let lmBusy = false;
const lmLast = {};      // env → { text, conf, ok, truth } · ①단계에서 잰 결과
let lmBatch = [];       // ③단계에서 실제로 읽어 낸 영수증들

const lmEsc = (v) => String(v).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/* 합성 영수증 — 날짜·금액까지 이미지에 그려 넣으므로 ④단계 표를 지어내지 않고
   실제로 읽어 낸 값으로 채울 수 있다. */
const LM_RECEIPTS = [
  { store: 'CAFE EDUINO', date: '2024-05-12', item: 'ICE AMERICANO', qty: 4, amount: 18000 },
  { store: 'GOGI HOUSE', date: '2024-05-12', item: 'SAMGYEOPSAL SET', qty: 2, amount: 72000 },
  { store: 'KAKAO T', date: '2024-05-12', item: 'TAXI NIGHT', qty: 1, amount: 14500 },
];
const lmWon = (n) => n.toLocaleString('en-US');
const lmTruth = (r) => r.store + ' / ' + r.date + ' / ' + r.item + ' / QTY ' + r.qty + ' / TOTAL ' + lmWon(r.amount);

const LM_ENV_NAME = { orig: '원본', dark: '어두운 곳', hide: '일부 가림', crumple: '구겨진 종이' };

/* 조건별 설명 — 그 조건에서 무슨 일이 일어나는지(원리)만 담는다.
   "무엇으로 잘못 읽혔는가"는 매번 달라지므로 여기 쓰지 않고 실측값으로 채운다. */
const LM_ENVS = {
  orig: {
    cap: 'AI 시점: 획이 또렷해 형태가 그대로 살아 있음',
    title: '또렷한 글자는 왜 안정적으로 읽힐까?',
    desc: '<p>글자의 획이 또렷하고 기울지 않으면 형태 정보가 손상 없이 남습니다.</p><p>OCR은 잘라낸 줄 전체를 <b>순서가 있는 시퀀스로</b> 읽으면서 앞뒤 문맥을 함께 씁니다. 형태가 선명하면 문맥의 도움 없이도 판별이 끝나므로 가장 안정적인 조건입니다.</p>'
  },
  dark: {
    cap: 'AI 시점: 밝기 차이가 줄고 잡티가 얹힘',
    title: '어두우면 글자에 무슨 일이 생길까?',
    desc: '<p>어두운 곳에서는 글자와 배경의 <b>밝기 차이(대비)</b>가 줄어듭니다. 여기에 센서 잡음까지 얹히면, 검출 단계에서 글자 영역을 잡는 것부터 흔들리고 인식 단계에서는 획의 경계가 뭉개집니다.</p><p><b>여러 글자가 동시에</b> 무너지는 것이 이 조건의 특징입니다. 한두 글자만 틀리는 게 아니라 줄 전체가 흔들리므로 문맥으로도 복구가 안 됩니다.</p><p>참고: 밝기만 낮추는 것으로는 잘 무너지지 않습니다. OCR이 내부에서 스스로 이진화하기 때문입니다. 실제로 무너뜨리는 것은 <b>좁아진 대비 위에 얹힌 잡음</b>입니다.</p>'
  },
  hide: {
    cap: 'AI 시점: 가려진 영역은 애초에 검출되지 않음',
    title: '가려진 글자는 왜 복원되지 않을까?',
    desc: '<p>QR 코드와 결정적으로 다른 지점입니다. QR은 <b>오류정정용 여유분</b>을 미리 담아 두기 때문에 일부가 가려져도 계산으로 복원됩니다.</p><p>하지만 종이에 인쇄된 글자에는 그런 여유분이 없습니다. 가려진 부분은 정보가 <b>그냥 사라진 것</b>이라 되살릴 방법이 없고, AI는 남은 글자만 읽어 냅니다.</p>'
  },
  crumple: {
    cap: 'AI 시점: 획 두께·비율이 미세하게 뒤틀림',
    title: '구겨지면 어떤 글자부터 무너질까?',
    desc: '<p>0과 O, 1과 l 처럼 원래 형태가 거의 같은 글자들이 있습니다. 평소에는 폭 비율이나 획 두께 같은 <b>미세한 차이</b>와 "주변이 숫자인지"라는 문맥으로 구분합니다.</p><p>종이가 구겨지면 그 미세한 차이가 뒤틀려 사라집니다. 다른 글자는 멀쩡한데 <b>모양이 닮은 글자만 골라</b> 틀리는 것이 이 조건의 특징입니다. 실무에서는 "금액 칸에는 숫자만 온다"는 후처리 규칙으로 마지막에 잡아냅니다.</p>'
  }
};

/* ── 합성 영수증을 캔버스에 그린다 (DOM 에 붙이지 않음) ── */
function lmDrawReceipt(r) {
  const W = 640, H = 230;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#000000'; x.textBaseline = 'top';
  x.font = 'bold 32px "Courier New", monospace'; x.fillText(r.store, 24, 16);
  x.font = '26px "Courier New", monospace'; x.fillText(r.date, 24, 58);
  x.font = '30px "Courier New", monospace'; x.fillText(r.item, 24, 96);
  x.font = '28px "Courier New", monospace'; x.fillText('QTY ' + r.qty, 24, 138);
  x.font = 'bold 34px "Courier New", monospace'; x.fillText('TOTAL ' + lmWon(r.amount), 24, 180);
  return cv;
}

/* ── 조건별 훼손 — 전부 실제 픽셀 연산이다 ── */
function lmDegrade(cv, env) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height;
  if (env === 'orig') return cv;

  if (env === 'hide') {
    x.fillStyle = '#0f172a';
    x.fillRect(168, 176, 210, 48);   // 합계 금액의 앞자리를 덮는다
    return cv;
  }

  const img = x.getImageData(0, 0, W, H), d = img.data;

  if (env === 'dark') {
    /* 밝기만 낮추면 Tesseract 내부 이진화가 그대로 복구한다.
       실제로 무너지는 건 대비가 좁아진 상태에 잡음이 얹힐 때다. */
    for (let i = 0; i < d.length; i += 4) {
      const v = 96 + (d[i] - 128) * 0.16 + (Math.random() - 0.5) * 78;
      d[i] = d[i + 1] = d[i + 2] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
    x.putImageData(img, 0, 0);
    return cv;
  }

  if (env === 'crumple') {
    /* 행마다 가로로 밀어 획 두께·비율을 뒤튼다 — 닮은 글자가 먼저 무너진다. */
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

/* ── 진짜 OCR — app.js 의 언어별 캐시 워커를 그대로 쓴다 ── */
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

/* 읽어 낸 글자에서 합계 금액을 뽑는다.
   날짜(2024-05-12)를 먼저 걷어내지 않으면 '2024' 가 금액으로 잡힌다 —
   실무의 후처리 규칙("금액 칸에는 숫자만 온다")과 같은 종류의 처리다. */
function lmReadAmount(text) {
  const cleaned = text.replace(/\d{4}\s*-\s*\d{2}\s*-\s*\d{2}/g, ' ');
  const m = cleaned.match(/TOTAL\s*([\d][\d,]*)/i);
  if (m) {
    const v = +m[1].replace(/,/g, '');
    if (isFinite(v) && v > 0) return v;
  }
  const nums = (cleaned.match(/[\d][\d,]{2,}/g) || [])
    .map((s) => +s.replace(/,/g, ''))
    .filter((n) => isFinite(n) && n > 0);
  return nums.length ? Math.max.apply(null, nums) : null;
}
function lmReadDate(text) {
  const m = text.match(/\d{4}\s*-\s*\d{2}\s*-\s*\d{2}/);
  return m ? m[0].replace(/\s+/g, '') : null;
}

/* ── ①단계: 조건 하나를 실제로 테스트한다 ── */
async function lmTest(env) {
  if (lmBusy) return;
  lmBusy = true;
  const msg = document.querySelector('.lm-res-msg');
  const sub = document.querySelector('.lm-res-sub');
  if (msg) { msg.className = 'lm-res-msg'; msg.textContent = '인식 중…'; }
  if (sub) sub.textContent = '영수증을 ' + (LM_ENV_NAME[env] || env) + ' 조건으로 만들어 Tesseract 에 넣는 중입니다.';
  try {
    const r = LM_RECEIPTS[0];
    const out = await lmRecognize(lmDegrade(lmDrawReceipt(r), env));
    const read = lmReadAmount(out.text);
    const ok = read === r.amount;
    lmLast[env] = { text: out.text, conf: out.conf, ok, read, truth: lmTruth(r), receipt: r };
    if (msg) {
      msg.className = 'lm-res-msg ' + (ok ? 'succ' : 'fail');
      msg.textContent = (ok ? '✓ 합계 금액 인식 성공' : '✕ 합계 금액 인식 실패') + ' (신뢰도 ' + out.conf + '%)';
    }
    if (sub) sub.textContent = '읽은 글자: ' + (out.text || '(아무것도 읽지 못했습니다)');
  } catch (e) {
    delete lmLast[env];
    if (msg) { msg.className = 'lm-res-msg fail'; msg.textContent = '✕ OCR 을 실행하지 못했습니다'; }
    if (sub) sub.textContent = e.message + ' — 언어 데이터를 내려받지 못하면 이 실습은 동작하지 않습니다.';
  }
  lmBusy = false;
}

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

  if (w === 2) {
    paintLmReason();
  } else if (w === 3) {
    // 프로그레스 및 영수증 상태 초기화
    document.querySelectorAll('.lm-receipt').forEach(r => r.classList.remove('done'));
    $('lm-prog-bar').style.width = '0%';
    $('lm-prog-text').textContent = '대기 중...';
    $('lm-batch-btn').disabled = false;
    $('lm-batch-btn').textContent = '일괄 스캔 시작';
    $('lm-batch-btn').onclick = startLmBatch;
  } else if (w === 4) {
    paintLmReport();
  }
}
if (typeof window !== 'undefined') window.goToLmStep = goToLmStep;

// Step 2: 마지막으로 테스트한 조건의 원인 분석 — 실측값을 먼저 보여 준 뒤 원리를 설명한다.
function paintLmReason() {
  const cfg = LM_ENVS[lmEnv] || LM_ENVS.orig;
  const r = lmLast[lmEnv];
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  set('lm-reason-title', cfg.title);
  set('lm-img-cap', r ? cfg.cap + ' · 신뢰도 ' + r.conf + '%' : cfg.cap);

  const mock = document.getElementById('lm-img-mock');
  if (mock) mock.innerHTML = lmEsc(lmMisread(r)) + '<div class="lm-bbox"></div>';

  const desc = document.getElementById('lm-reason-desc');
  if (!desc) return;
  const head = r
    ? '<p><b>방금 잰 결과</b> — 정답 <b>' + lmEsc(String(r.receipt.amount)) + '</b> 원 / 읽어 낸 금액 <b>' +
      lmEsc(r.read == null ? '없음' : String(r.read)) + '</b><br>읽은 글자 전체: ' +
      lmEsc(r.text || '(없음)') + '</p>'
    : '<p><b>①단계에서 이 조건을 먼저 테스트해 주세요.</b> 실제로 읽어 본 결과가 있어야 원인을 따질 수 있습니다.</p>';
  desc.innerHTML = head + cfg.desc;
}
if (typeof window !== 'undefined') window.paintLmReason = paintLmReason;

/* 합계 줄에서 실제로 읽힌 조각을 뽑아 보여 준다(예전의 고정 문자열 자리). */
function lmMisread(r) {
  if (!r) return '—';
  if (!r.text) return '(없음)';
  const m = r.text.match(/TOTAL\s*([^\s]{1,12})/i);
  return (m && m[1]) ? m[1] : r.text.slice(0, 10);
}

const lmTabs = document.getElementById('lm-tabs');
if (lmTabs) {
  lmTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.lm-tab');
    if (!tab || lmBusy) return;

    document.querySelectorAll('.lm-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    lmEnv = tab.dataset.env;
    lmTest(lmEnv);
  });
}

/* ── ③단계: 영수증 3장을 실제로 읽어 리포트 데이터를 만든다 ── */
async function startLmBatch() {
  if (lmBusy) return;
  lmBusy = true;
  const btn = $('lm-batch-btn');
  const bar = $('lm-prog-bar');
  const txt = $('lm-prog-text');
  const receipts = document.querySelectorAll('.lm-receipt');

  btn.disabled = true;
  btn.textContent = '처리 중...';
  lmBatch = [];

  try {
    for (let i = 0; i < LM_RECEIPTS.length; i++) {
      txt.textContent = LM_RECEIPTS.length + '장 중 ' + (i + 1) + '번째 인식 중…';
      const r = LM_RECEIPTS[i];
      const out = await lmRecognize(lmDrawReceipt(r));   // 전처리를 마친 깨끗한 이미지
      lmBatch.push({ r, text: out.text, conf: out.conf, amount: lmReadAmount(out.text), date: lmReadDate(out.text) });
      if (receipts[i]) receipts[i].classList.add('done');
      bar.style.width = Math.round(((i + 1) / LM_RECEIPTS.length) * 100) + '%';
    }
    txt.textContent = '추출 완료 — 실제로 읽어 낸 값으로 리포트를 만듭니다.';
    setTimeout(() => goToLmStep(4), 700);
  } catch (e) {
    txt.textContent = 'OCR 을 실행하지 못했습니다: ' + e.message;
    btn.disabled = false;
    btn.textContent = '다시 시도';
  }
  lmBusy = false;
}
if (typeof window !== 'undefined') window.startLmBatch = startLmBatch;

/* ── ④단계: 표를 ③단계에서 실제로 읽어 낸 값으로 채운다 ── */
function paintLmReport() {
  const tbody = document.querySelector('.lm-table tbody');
  if (!tbody || !lmBatch.length) return;   // 아직 안 돌렸으면 표를 건드리지 않는다
  let sum = 0, missed = 0;
  const rows = lmBatch.map((b) => {
    const amt = b.amount;
    if (amt == null) missed++; else sum += amt;
    return '<tr><td>' + lmEsc(b.date || '—') + '</td><td>' + lmEsc(b.r.item) +
      '</td><td>' + lmEsc(String(b.r.qty)) + '</td><td class="num">' +
      (amt == null ? '읽지 못함' : lmEsc(lmWon(amt))) + '</td></tr>';
  });
  rows.push('<tr class="total-row"><td colspan="3" style="text-align:right">총 합계' +
    (missed ? ' (읽지 못한 ' + missed + '장 제외)' : '') +
    '</td><td class="num">' + lmEsc(lmWon(sum)) + '</td></tr>');
  tbody.innerHTML = rows.join('');
}

document.querySelectorAll('#flow-limit .fstep').forEach(el => {
  el.onclick = () => { if (typeof goToLmStep === 'function') goToLmStep(+el.dataset.lw); };
});
