/* ── 음성 녹음 관리 (스펙트로그램 썸네일 + 삭제) ─────────── */
/* speech-commands 녹음은 오디오가 아닌 스펙트로그램이라 재생은 불가하고,
   썸네일로 확인 + uid 기반 개별 삭제만 제공한다. */
function drawSpectrogram(canvas, spec) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#0a0e1a'; ctx.fillRect(0, 0, W, H);
  if (!spec || !spec.data || !spec.frameSize) return;
  const data = spec.data, fs = spec.frameSize;
  const frames = Math.floor(data.length / fs);
  if (frames <= 0) return;
  let mn = Infinity, mx = -Infinity;
  for (let k = 0; k < data.length; k++) { const v = data[k]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const range = (mx - mn) || 1;
  const img = ctx.createImageData(W, H);
  for (let px = 0; px < W; px++) {
    const f = Math.min(frames - 1, Math.floor(px / W * frames));
    for (let py = 0; py < H; py++) {
      const bin = Math.min(fs - 1, Math.floor((1 - py / H) * fs)); // 낮은 주파수를 아래로
      const v = (data[f * fs + bin] - mn) / range; // 0..1
      const idx = (py * W + px) * 4;
      img.data[idx] = 20; img.data[idx + 1] = Math.round(v * 200); img.data[idx + 2] = Math.round(60 + v * 195); img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function openAudioRec(classId) {
  const c = audio.classes.find(x => x.id === classId);
  if (!c) return;
  $('audio-rec-dot').style.background = c.color;
  $('audio-rec-name').textContent = c.name;
  const exs = audio.transfer ? audio.transfer.getExamples(String(c.id)) : [];
  $('audio-rec-count').textContent = exs.length + ' 개';
  const grid = $('audio-rec-grid');
  if (exs.length === 0) {
    grid.innerHTML = '<div class="gallery-empty" style="grid-column:1/-1">아직 녹음이 없습니다. 마이크를 켜고 [녹음]을 눌러 수집하세요.</div>';
  } else {
    grid.innerHTML = exs.map((ex, i) =>
      `<div class="gallery-item" data-uid="${ex.uid}" title="녹음 ${i + 1}">
        <canvas class="rec-spec" width="120" height="72"></canvas>
        <div class="del-mark">삭제</div>
      </div>`
    ).join('');
    grid.querySelectorAll('.rec-spec').forEach((cv, i) => drawSpectrogram(cv, exs[i].example.spectrogram));
    grid.querySelectorAll('.gallery-item').forEach(el => {
      el.addEventListener('click', () => {
        audio.transfer.removeExample(el.dataset.uid);
        c.count = audio.transfer.countExamples()[String(c.id)] || 0;
        openAudioRec(classId);
        audioRenderClasses(); audioRefresh();
      });
    });
  }
  $('audio-rec-overlay').classList.add('on');
}
function closeAudioRec() {
  document.getElementById('audio-rec-overlay').classList.remove('on');
}

