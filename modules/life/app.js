const $ = (id) => document.getElementById(id);
function setStatus(t, c) { const s = $('status'); s.textContent = t; s.className = 'status' + (c ? ' ' + c : ''); }

/* ── URL 판별/이스케이프 ── */
function esc(s) { return s.replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }
function isUrl(s) { return /^https?:\/\/\S+$/i.test(s.trim()); }
function valHtml(v) { return isUrl(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>` : esc(v); }

/* ── 카메라 ── */
function mkCam(v, c, ph) {
  return {
    stream: null, raf: null, video: v, canvas: c, ph: ph,
    async start() {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } });
      this.video.srcObject = this.stream;
      await new Promise((res) => { if (this.video.videoWidth) return res(); this.video.onloadedmetadata = () => res(); });
      await this.video.play(); this.syncSize(); this.ph.style.display = 'none';
    },
    syncSize() { const w = this.video.videoWidth, h = this.video.videoHeight; if (w && (this.canvas.width !== w || this.canvas.height !== h)) { this.canvas.width = w; this.canvas.height = h; } },
    stop() {
      if (this.raf) cancelAnimationFrame(this.raf);
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());
      this.stream = null; this.raf = null;
      const x = this.canvas.getContext('2d'); x && x.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ph.style.display = 'grid';
    },
  };
}

/* ════════ 초급: QR·바코드 ════════ */
/* QR = jsQR(직접 루프, 매우 안정적) · 1D 바코드 = ZXing 코어 디코더 */
const scan = mkCam($('v-scan'), $('c-scan'), $('ph-scan'));
const scanStage = document.querySelector('#panel-scan .stage');
const sproc = document.createElement('canvas');
const sctx = sproc.getContext('2d', { willReadFrequently: true });
let lastCode = '', lastTime = 0, history = [], lastDetect = 0;

function flash() { scanStage.classList.add('flash'); setTimeout(() => scanStage.classList.remove('flash'), 320); }
function pushCode(value, format) {
  if (!value) return;
  const now = Date.now();
  if (value === lastCode && now - lastTime < 1500) { lastTime = now; return; }
  lastCode = value; lastTime = now;
  flash();
  history.unshift({ value, format, ts: new Date() });
  if (history.length > 30) history.pop();
  const sl = $('scan-latest'); sl.classList.remove('idle');
  sl.innerHTML = `<span class="fmt">${esc(format || 'code')}</span><div class="val">${valHtml(value)}</div>`;
  $('scan-count').textContent = history.length + '개';
  $('codes').innerHTML = history.map(h => `<div class="ci"><span class="t">${h.ts.toTimeString().slice(0, 8)}</span><span class="v">${valHtml(h.value)}</span></div>`).join('');
  setStatus('읽음! · ' + history.length, 'ready');
}

/* ZXing 코어로 1D 바코드 디코드 (브라우저 래퍼 API 미사용 → 버전 안정) */
let zxReader = null;
function zxDecode(canvas) {
  if (typeof ZXing === 'undefined' || !ZXing.MultiFormatReader) return null;
  try {
    if (!zxReader) {
      zxReader = new ZXing.MultiFormatReader();
      const h = new Map();
      h.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
        ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A,
        ZXing.BarcodeFormat.UPC_E, ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39, ZXing.BarcodeFormat.ITF,
      ]);
      h.set(ZXing.DecodeHintType.TRY_HARDER, true);
      zxReader.setHints(h);
    }
    const src = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
    const bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(src));
    const res = zxReader.decode(bmp);
    if (res) return { text: res.getText(), fmt: (ZXing.BarcodeFormat[res.getBarcodeFormat()] || 'barcode').toLowerCase().replace(/_/g, ' ') };
  } catch (e) { /* NotFoundException 등 → 무시 */ } finally { if (zxReader) { try { zxReader.reset(); } catch (e) {} } }
  return null;
}

function doDetect() {
  const vw = scan.video.videoWidth, vh = scan.video.videoHeight;
  if (!vw) return;
  const scale = Math.min(1, 900 / vw);
  sproc.width = Math.round(vw * scale); sproc.height = Math.round(vh * scale);
  sctx.drawImage(scan.video, 0, 0, sproc.width, sproc.height);
  const img = sctx.getImageData(0, 0, sproc.width, sproc.height);
  let got = null;
  if (window.jsQR) { const c = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' }); if (c && c.data) got = { text: c.data, fmt: 'QR code' }; }
  if (!got) { const b = zxDecode(sproc); if (b) got = b; }
  if (got) pushCode(got.text, got.fmt);
}
async function scanLoop() {
  if (!scan.stream) return;
  const now = performance.now();
  if (now - lastDetect > 90) { lastDetect = now; try { doDetect(); } catch (e) {} } // 초당 ~11회 검출
  scan.raf = requestAnimationFrame(scanLoop);
}
$('scan-cam').onclick = async () => {
  try {
    setStatus('카메라 시작…', 'busy'); await scan.start();
    $('scan-frame').style.display = 'block';
    $('scan-cam').disabled = true; $('scan-stop').disabled = false;
    $('scan-state').textContent = '스캔 중'; $('scan-state').classList.add('on');
    setStatus('스캔 중 · LIVE', 'live'); scanLoop();
  } catch (e) { setStatus('카메라 오류', 'busy'); alert('카메라를 시작할 수 없습니다: ' + e.message); }
};
$('scan-stop').onclick = () => { scan.stop(); $('scan-frame').style.display = 'none'; $('scan-cam').disabled = false; $('scan-stop').disabled = true; $('scan-state').textContent = '대기'; $('scan-state').classList.remove('on'); setStatus('대기 중'); };

/* ════════ 중급: OCR ════════ */
const ocr = mkCam($('v-ocr'), $('c-ocr'), $('ph-ocr'));
let ocrLang = 'kor+eng', ocrBusy = false;

$('lang-seg').addEventListener('click', (e) => {
  const l = e.target.dataset.lang; if (!l) return;
  ocrLang = l;
  $('lang-seg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.lang === l));
});

$('ocr-cam').onclick = async () => {
  try {
    setStatus('카메라 시작…', 'busy'); await ocr.start();
    $('c-ocr').style.display = 'none'; ocr.video.style.display = ''; $('ocr-frame').style.display = 'grid';
    $('ocr-cam').disabled = true; $('ocr-shot').disabled = false; $('ocr-retake').disabled = true;
    $('ocr-state').textContent = '준비됨'; $('ocr-state').classList.add('on');
    setStatus('촬영 가능 · LIVE', 'live');
  } catch (e) { setStatus('카메라 오류', 'busy'); alert('카메라를 시작할 수 없습니다: ' + e.message); }
};
$('ocr-retake').onclick = () => {
  if (ocrBusy) return;
  $('c-ocr').style.display = 'none'; ocr.video.style.display = ''; $('ocr-frame').style.display = 'grid';
  try { ocr.video.play(); } catch (e) {}
  $('ocr-shot').disabled = false; $('ocr-retake').disabled = true;
  setStatus('촬영 가능 · LIVE', 'live');
};
/* 캡처 전처리: 중앙 크롭 + 2배 업스케일 + Otsu 이진화 → 인쇄 글자 OCR 정확도 향상 */
function preprocessOCR() {
  const vw = ocr.video.videoWidth, vh = ocr.video.videoHeight;
  const cw = Math.round(vw * 0.90), ch = Math.round(vh * 0.62); // ocr-frame inset과 일치
  const sx = Math.round((vw - cw) / 2), sy = Math.round((vh - ch) / 2);
  const up = 2;
  const cnv = $('c-ocr'); cnv.width = Math.round(cw * up); cnv.height = Math.round(ch * up);
  const ctx = cnv.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(ocr.video, sx, sy, cw, ch, 0, 0, cnv.width, cnv.height);
  const img = ctx.getImageData(0, 0, cnv.width, cnv.height), d = img.data, n = d.length / 4;
  const gray = new Uint8Array(n), hist = new Array(256).fill(0);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { const g = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0; gray[j] = g; hist[g]++; }
  // Otsu 임계값
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, maxVar = 0, thr = 127;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = n - wB; if (!wF) break; sumB += t * hist[t]; const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) * (mB - mF); if (between > maxVar) { maxVar = between; thr = t; } }
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { const v = gray[j] > thr ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; }
  ctx.putImageData(img, 0, 0);
}

/* 파라미터 튜닝된 Tesseract 워커(언어별 캐시) */
let ocrWorker = null, ocrWorkerLang = null;
function ocrLog(m) {
  if (m.status === 'recognizing text') { const p = Math.round(m.progress * 100); $('ocr-fill').style.width = p + '%'; $('ocr-plab').textContent = '글자 인식 중… ' + p + '%'; }
  else { $('ocr-plab').textContent = (m.status || '') + (m.progress ? ' ' + Math.round(m.progress * 100) + '%' : ''); }
}
async function getWorker() {
  if (ocrWorker && ocrWorkerLang === ocrLang) return ocrWorker;
  if (ocrWorker) { try { await ocrWorker.terminate(); } catch (e) {} ocrWorker = null; }
  ocrWorker = await Tesseract.createWorker(ocrLang, 1, { logger: ocrLog });
  try { await ocrWorker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' }); } catch (e) {}
  ocrWorkerLang = ocrLang;
  return ocrWorker;
}
$('ocr-shot').onclick = async () => {
  if (!ocr.stream || ocrBusy) return;
  ocrBusy = true;
  preprocessOCR();
  $('c-ocr').style.display = ''; ocr.video.style.display = 'none'; $('ocr-frame').style.display = 'none';
  try { ocr.video.pause(); } catch (e) {}
  $('ocr-shot').disabled = true; $('ocr-retake').disabled = true;
  $('ocr-state').textContent = '인식 중'; setStatus('글자 인식 중…', 'busy');
  // 진행 표시
  $('ocr-progress').hidden = false; $('ocr-fill').style.width = '0%'; $('ocr-plab').textContent = '모델·언어 데이터 준비 중…';
  $('ocr-out').value = ''; $('ocr-learn').disabled = true;
  try {
    const worker = await getWorker();
    const res = await worker.recognize($('c-ocr'));
    const raw = (res.data.text || '').trim();
    const { text, count } = applyCorrections(raw);          // 학습된 교정 자동 적용
    $('ocr-out').value = text || '(글자를 찾지 못했어요. 더 또렷하게 가깝게 다시 찍어보세요.)';
    lastShown = $('ocr-out').value;
    updateLearnState();
    const conf = Math.round(res.data.confidence || 0);
    const chars = text.replace(/\s/g, '').length;
    $('ocr-meta').innerHTML = `<span>신뢰도 <b>${conf}%</b></span><span>글자 수 <b>${chars}</b></span><span>언어 <b>${ocrLang}</b></span>` + (count ? `<span class="applied">자동 교정 ${count}건</span>` : '');
    setStatus('인식 완료 · READY', 'ready');
  } catch (e) {
    $('ocr-out').value = '인식 중 오류가 발생했어요: ' + e.message;
    setStatus('오류', 'busy');
  }
  $('ocr-progress').hidden = true; $('ocr-state').textContent = '완료';
  $('ocr-retake').disabled = false; ocrBusy = false;
};

/* ── 교정으로 배우는 OCR ── */
let corrections = {}, lastShown = '';
try { corrections = JSON.parse(localStorage.getItem('eduino-ocr-corrections') || '{}'); } catch (e) { corrections = {}; }
function saveCorrections() { try { localStorage.setItem('eduino-ocr-corrections', JSON.stringify(corrections)); } catch (e) {} }
function applyCorrections(text) {
  let count = 0;
  for (const w in corrections) {
    if (!w) continue;
    const parts = text.split(w);
    if (parts.length > 1) { count += parts.length - 1; text = parts.join(corrections[w]); }
  }
  return { text, count };
}
function renderLearned() {
  const keys = Object.keys(corrections);
  $('ocr-count').textContent = keys.length;
  $('ocr-clearlearn').hidden = keys.length === 0;
  $('ocr-chips').innerHTML = keys.length
    ? keys.map(w => `<span class="chip"><s>${esc(w)}</s>→<b>${esc(corrections[w])}</b><span data-del="${esc(w)}" title="삭제">×</span></span>`).join('')
    : '<div class="chip-empty">아직 배운 교정이 없어요. 결과를 고치고 [교정 학습]을 눌러보세요.</div>';
}
/* 텍스트 수정 여부에 따라 학습 버튼/안내 상태 갱신 */
function updateLearnState() {
  const changed = $('ocr-out').value.trim() && $('ocr-out').value !== lastShown;
  $('ocr-learn').disabled = !changed;
  const h = $('ocr-learn-hint');
  if (changed) { h.textContent = '● 수정함 — 학습할 수 있어요'; h.className = 'learn-hint changed'; }
  else { h.textContent = lastShown ? '결과를 고치면 학습할 수 있어요' : '먼저 글자를 인식하세요'; h.className = 'learn-hint'; }
}
$('ocr-out').addEventListener('input', updateLearnState);
/* 토큰 단위 정렬로 치환쌍(틀림→고침) 추출 */
function tokenDiff(aStr, bStr) {
  const a = aStr.split(/\s+/).filter(Boolean), b = bStr.split(/\s+/).filter(Boolean);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i; for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) { const c = a[i - 1] === b[j - 1] ? 0 : 1; dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + c); }
  const subs = []; let i = n, j = m;
  while (i > 0 && j > 0) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    if (dp[i][j] === dp[i - 1][j - 1] + c) { if (c) subs.push([a[i - 1], b[j - 1]]); i--; j--; }
    else if (dp[i][j] === dp[i - 1][j] + 1) i--; else j--;
  }
  return subs.reverse();
}
$('ocr-learn').onclick = () => {
  const cur = $('ocr-out').value;
  const subs = tokenDiff(lastShown, cur);
  let added = 0;
  subs.forEach(([w, r]) => { if (w && r && w !== r) { corrections[w] = r; added++; } });
  saveCorrections(); renderLearned(); lastShown = cur;
  $('ocr-learn').disabled = true;
  const h = $('ocr-learn-hint');
  h.className = 'learn-hint ok';
  h.textContent = added ? `✓ 교정 ${added}개를 배웠어요! 다음 인식부터 자동 적용돼요.` : '✓ 반영했어요 (새로 배운 치환은 없음)';
  setStatus(added ? '교정 ' + added + '개 학습됨 · READY' : 'READY', 'ready');
};
$('ocr-clearlearn').onclick = () => { corrections = {}; saveCorrections(); renderLearned(); };
$('ocr-chips').addEventListener('click', (e) => { const w = e.target.dataset.del; if (w == null) return; delete corrections[w]; saveCorrections(); renderLearned(); });
renderLearned();

/* ── 단계 전환 ── */
document.querySelectorAll('.step').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.step').forEach(b => b.classList.toggle('active', b === btn));
    const s = btn.dataset.step;
    $('panel-scan').hidden = s !== 'scan';
    $('panel-ocr').hidden = s !== 'ocr';
    const pl = $('panel-limit'); if (pl) pl.hidden = s !== 'limit';
    // 반대편 카메라 정리
    if (s === 'scan') { ocr.stop(); $('ocr-cam').disabled = false; $('ocr-shot').disabled = true; $('ocr-retake').disabled = true; $('ocr-state').textContent = '대기'; $('ocr-state').classList.remove('on'); $('c-ocr').style.display = 'none'; $('ocr-frame').style.display = 'none'; ocr.video.style.display = ''; }
    else if (s === 'ocr') { scan.stop(); $('scan-frame').style.display = 'none'; $('scan-cam').disabled = false; $('scan-stop').disabled = true; $('scan-state').textContent = '대기'; $('scan-state').classList.remove('on'); }
    else if (s === 'limit') { 
      scan.stop(); ocr.stop(); 
      if (typeof goToLmStep === 'function') goToLmStep(1); 
    }
    setStatus('대기 중');
  };
});

setStatus('대기 중');
if (!window.isSecureContext) { const b = $('banner'); b.classList.add('on'); b.innerHTML = EduinoIcons.svg('alert') + ' 카메라는 <b>localhost</b> 또는 <b>https</b> 에서만 켜집니다. 배포된 https 주소로 접속해 주세요.'; }
