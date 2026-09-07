/* ============================================================
   ▌ 음성 학습 (Speech Commands · Transfer Learning)
   ============================================================ */
const AUDIO_PALETTE = ['#0066ff', '#d97706', '#06b6d4', '#059669'];
const AUDIO_MAX = 4;
const audio = {
  classes: [], selectedId: null,
  base: null, transfer: null,
  micStream: null, audioCtx: null, analyser: null,
  recording: false, inferring: false, trained: false,
  wfRaf: null,
};
let audioSeq = 0;

const aEls = {
  classList: $('a-class-list'), classCountMeta: $('a-class-count-meta'),
  addClass: $('a-add-class'),
  waveform: $('a-waveform'), micOverlay: $('a-mic-overlay'),
  capTargetName: $('a-cap-target-name'), liveDot: $('a-live-dot'),
  micToggle: $('a-mic-toggle'),
  epochs: $('a-epochs'), train: $('a-train'),
  trainBar: $('a-train-bar'), trainHint: $('a-train-hint'),
  mEpoch: $('a-m-epoch'), mLoss: $('a-m-loss'), mAcc: $('a-m-acc'),
  topPred: $('a-top-pred'), bars: $('a-bars'),
  inferToggle: $('a-infer-toggle'), inferMeta: $('a-infer-meta'),
};

async function audioInit() {
  aEls.addClass.addEventListener('click', () => audioAddClass());
  aEls.micToggle.addEventListener('click', audioToggleMic);
  aEls.train.addEventListener('click', audioTrain);
  aEls.inferToggle.addEventListener('click', () => audio.inferring ? audioStopInfer() : audioStartInfer());
  audioAddClass('클래스 1'); audioAddClass('클래스 2');

  if (!window.speechCommands) { console.error('[audio] speech-commands missing'); return; }
  try {
    audio.base = speechCommands.create('BROWSER_FFT');
    await audio.base.ensureModelLoaded();
    console.log('[audio] Speech Commands ready');
  } catch (e) { console.error('[audio] load fail:', e); }
}

function audioAddClass(name) {
  if (audio.classes.length >= AUDIO_MAX) return;
  const id = ++audioSeq;
  const color = AUDIO_PALETTE[(id - 1) % AUDIO_PALETTE.length];
  audio.classes.push({ id, name: name || ('클래스 ' + id), color, count: 0 });
  if (audio.selectedId == null) audio.selectedId = id;
  audioRenderClasses(); audioRefresh();
}
function audioRemoveClass(id) {
  audio.classes = audio.classes.filter(c => c.id !== id);
  if (audio.selectedId === id) audio.selectedId = audio.classes[0]?.id || null;
  audioRenderClasses(); audioRefresh();
}
function audioSelectClass(id) { audio.selectedId = id; setSelectedItem(aEls.classList, id); audioUpdateCapTarget(); }
function audioSetCapEnabled(on) {
  aEls.classList.querySelectorAll('.cap-btn').forEach(b => b.disabled = !on || audio.recording);
}

function audioRenderClasses() {
  aEls.classList.innerHTML = '';
  audio.classes.forEach(c => {
    const div = document.createElement('div');
    div.className = 'class-item' + (c.id === audio.selectedId ? ' selected' : '');
    div.dataset.id = c.id;
    div.onclick = () => audioSelectClass(c.id);
    const row = document.createElement('div');
    row.className = 'class-row';
    row.innerHTML = `<span class="class-dot" style="background:${c.color}"></span>`;
    const input = document.createElement('input');
    input.className = 'class-name'; input.value = c.name;
    input.onclick = (e) => { e.stopPropagation(); audioSelectClass(c.id); };
    input.oninput = () => { c.name = input.value || c.name; audioRenderBars(); audioUpdateCapTarget(); };
    row.appendChild(input);
    const count = document.createElement('span');
    count.className = 'class-count'; count.textContent = c.count;
    count.style.cursor = 'pointer';
    count.title = '녹음 보기·삭제';
    count.onclick = (e) => { e.stopPropagation(); audioSelectClass(c.id); openAudioRec(c.id); };
    row.appendChild(count);
    const del = document.createElement('button');
    del.className = 'class-del'; del.textContent = '✕'; del.title = '삭제';
    del.onclick = (e) => { e.stopPropagation(); audioRemoveClass(c.id); };
    row.appendChild(del);
    div.appendChild(row);

    const rec = document.createElement('button');
    rec.className = 'cap-btn'; rec.type = 'button';
    const isRec = audio.recording && audio.recordingId === c.id;
    rec.disabled = !audio.micStream || audio.recording;
    rec.innerHTML = isRec
      ? `<span class="ci">●</span><span class="cl">녹음 중…</span>`
      : `<span class="ci">🎤</span><span class="cl">녹음</span><span class="cap-count">${c.count}</span>`;
    rec.onclick = (e) => { e.stopPropagation(); audioCaptureFor(c.id); };
    div.appendChild(rec);

    aEls.classList.appendChild(div);
  });
  aEls.classCountMeta.textContent = audio.classes.length + ' / ' + AUDIO_MAX;
  aEls.addClass.disabled = audio.classes.length >= AUDIO_MAX;
  audioUpdateCapTarget();
}
function audioUpdateCapTarget() {
  const sel = audio.classes.find(c => c.id === audio.selectedId);
  aEls.capTargetName.textContent = sel ? sel.name : '—';
}

async function audioToggleMic() {
  if (audio.micStream) {
    audio.micStream.getTracks().forEach(t => t.stop());
    audio.micStream = null;
    if (audio.audioCtx) { audio.audioCtx.close(); audio.audioCtx = null; }
    if (audio.wfRaf) { cancelAnimationFrame(audio.wfRaf); audio.wfRaf = null; }
    aEls.micOverlay.style.display = 'grid';
    aEls.micToggle.textContent = '마이크 켜기';
    audioSetCapEnabled(false);
    aEls.liveDot.classList.remove('on');
    audioStopInfer();
    return;
  }
  try {
    audio.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audio.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audio.audioCtx.createMediaStreamSource(audio.micStream);
    audio.analyser = audio.audioCtx.createAnalyser();
    audio.analyser.fftSize = 2048;
    src.connect(audio.analyser);
    aEls.micOverlay.style.display = 'none';
    aEls.micToggle.textContent = '마이크 끄기';
    audioSetCapEnabled(true);
    aEls.liveDot.classList.add('on');
    audioWaveformLoop();
  } catch (e) {
    aEls.micOverlay.innerHTML = '<div><div class="ph" style="color:#ef4444">MIC DENIED</div><div class="ph-msg">마이크 권한을 확인하세요</div></div>';
  }
}

function audioWaveformLoop() {
  if (!audio.analyser) return;
  const cv = aEls.waveform;
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const buf = new Uint8Array(audio.analyser.fftSize);
  audio.analyser.getByteTimeDomainData(buf);
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 2; ctx.strokeStyle = '#06b6d4'; ctx.beginPath();
  const slice = w / buf.length;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i] / 128.0; const y = (v * h) / 2;
    if (i === 0) ctx.moveTo(i * slice, y); else ctx.lineTo(i * slice, y);
  }
  ctx.stroke();
  audio.wfRaf = requestAnimationFrame(audioWaveformLoop);
}

async function audioCaptureFor(id) {
  const sel = audio.classes.find(c => c.id === id);
  if (!sel || !audio.base || !audio.micStream || audio.recording) return;
  if (!audio.transfer) audio.transfer = audio.base.createTransfer('eddie-audio');
  audioSelectClass(id);
  audio.recording = true; audio.recordingId = id;
  audioRenderClasses(); // 버튼 비활성 + '녹음 중…' 표시
  try {
    await audio.transfer.collectExample(String(sel.id));
    sel.count++;
  } catch (e) { console.error('[audio] collect fail:', e); }
  audio.recording = false; audio.recordingId = null;
  audioRenderClasses(); audioRefresh();
}

async function audioTrain() {
  if (!audio.transfer) return;
  const counts = audio.classes.filter(c => c.count > 0);
  if (counts.length < 2) return;
  aEls.train.disabled = true; aEls.inferToggle.disabled = true;
  const epochs = Math.max(5, Math.min(100, +aEls.epochs.value || 25));
  try {
    await audio.transfer.train({
      epochs,
      callback: {
        onEpochEnd: async (ep, logs) => {
          const p = Math.round(((ep + 1) / epochs) * 100);
          aEls.trainBar.style.width = p + '%';
          aEls.mEpoch.textContent = (ep + 1) + ' / ' + epochs;
          aEls.mLoss.textContent = logs.loss.toFixed(3);
          const acc = logs.acc ?? logs.accuracy;
          aEls.mAcc.textContent = acc != null ? Math.round(acc * 100) + '%' : '—';
        },
      },
    });
    audio.trained = true;
    aEls.train.disabled = false;
    aEls.inferToggle.disabled = !audio.micStream;
    aEls.trainHint.textContent = '학습 완료. 우측 [추론 시작]을 누르세요.';
    audioRenderBars();
  } catch (e) {
    console.error('[audio] train fail:', e);
    aEls.trainHint.textContent = '학습 실패: 각 단어당 최소 8회 녹음이 필요합니다.';
    aEls.train.disabled = false;
  }
}

function audioRenderBars() {
  renderProbBars(aEls.bars, audio.classes, (i) => `a-pct-${i}`, (i) => `a-fill-${i}`);
}

async function audioStartInfer() {
  if (!audio.trained || !audio.transfer) return;
  audio.inferring = true;
  aEls.inferToggle.textContent = '추론 중지';
  aEls.inferMeta.textContent = 'LIVE';
  const labels = audio.transfer.wordLabels();
  await audio.transfer.listen(result => {
    const scores = Array.from(result.scores);
    const idToIdx = {};
    audio.classes.forEach((c, i) => { idToIdx[String(c.id)] = i; });
    audio.classes.forEach((c, i) => {
      const li = labels.indexOf(String(c.id));
      const pct = li >= 0 ? Math.round(scores[li] * 100) : 0;
      const pctEl = $('a-pct-'+i); const fillEl = $('a-fill-'+i);
      if (pctEl) pctEl.textContent = pct + '%';
      if (fillEl) fillEl.style.width = pct + '%';
    });
    let topI = 0, topV = 0;
    audio.classes.forEach((c, i) => {
      const li = labels.indexOf(String(c.id));
      if (li >= 0 && scores[li] > topV) { topV = scores[li]; topI = i; }
    });
    if (topV > 0.5) {
      aEls.topPred.className = 'top-pred active';
      aEls.topPred.querySelector('.tp-name').textContent = audio.classes[topI].name;
      aEls.topPred.querySelector('.tp-conf').textContent = Math.round(topV*100) + '%';
    }
  }, { probabilityThreshold: 0.5, overlapFactor: 0.5 });
}
async function audioStopInfer() {
  audio.inferring = false;
  aEls.inferToggle.textContent = '추론 시작';
  aEls.inferMeta.textContent = 'IDLE';
  if (audio.transfer && audio.transfer.isListening()) {
    try { await audio.transfer.stopListening(); } catch {}
  }
  aEls.topPred.className = 'top-pred idle';
  aEls.topPred.querySelector('.tp-name').textContent = audio.trained ? '대기 중' : '아직 학습 전';
  aEls.topPred.querySelector('.tp-conf').textContent = '';
}

function audioRefresh() {
  const counts = audio.classes.filter(c => c.count > 0);
  aEls.train.disabled = counts.length < 2 || counts.some(c => c.count < 3);
  audioRenderBars();
  syncStepNav();
}

