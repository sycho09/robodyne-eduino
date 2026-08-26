const $ = (id) => document.getElementById(id);
function setStatus(t, c) { const s = $('status'); s.textContent = t; s.className = 'status' + (c ? ' ' + c : ''); }
const CW = 600, CH = 430, PAD = 28, DOM = 10;
const CCLR = ['#f0473a', '#4d8dff', '#11a06f'];
const CNAME = ['빨강', '파랑', '초록'];
function toPx(x, y) { return [PAD + (x / DOM) * (CW - 2 * PAD), CH - PAD - (y / DOM) * (CH - 2 * PAD)]; }
function toData(px, py) { return [(px - PAD) / (CW - 2 * PAD) * DOM, (CH - PAD - py) / (CH - 2 * PAD) * DOM]; }
function clamp(v) { return Math.max(0, Math.min(DOM, v)); }
function evtData(e) { const r = e.target.getBoundingClientRect(); return toData((e.clientX - r.left) / r.width * CW, (e.clientY - r.top) / r.height * CH); }
function frame(ctx) { ctx.strokeStyle = '#c9cedb'; ctx.lineWidth = 1.5; ctx.strokeRect(PAD, PAD, CW - 2 * PAD, CH - 2 * PAD); }
function dot(ctx, x, y, r, fill) { const [px, py] = toPx(x, y); ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.stroke(); }
function blob(cx, cy, n, cls, spread) { const a = []; for (let i = 0; i < n; i++) a.push({ x: +clamp(cx + (Math.random() - 0.5) * (spread || 3)).toFixed(2), y: +clamp(cy + (Math.random() - 0.5) * (spread || 3)).toFixed(2), c: cls }); return a; }
function procState(el, s) { el.className = 'p' + (s ? ' ' + s : ''); }

/* ════ 1. 분류 경계 (지도학습 + 과적합) ════ */
let bdPts = [], selClass = 0, bdModel = null, bdUsed = [], bdGrid = null, bdTrained = false, bdTraining = false;
const bdCtx = $('c-bd').getContext('2d');
const CXLABEL = { 1: '낮음 (단순)', 2: '보통', 3: '높음 (복잡)' };
$('classpick').innerHTML = CCLR.map((c, i) => `<button data-c="${i}" class="${i === 0 ? 'on' : ''}" style="color:${c}"><span class="d" style="background:${c}"></span>${CNAME[i]}</button>`).join('');
function renderBd() {
  bdCtx.clearRect(0, 0, CW, CH);
  if (bdTrained && bdGrid) {
    const gw = bdGrid.gw, gh = bdGrid.gh, cwp = (CW - 2 * PAD) / gw, chp = (CH - 2 * PAD) / gh;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const cls = bdUsed[bdGrid.pred[j * gw + i]];
      bdCtx.fillStyle = CCLR[cls] + '2e';
      bdCtx.fillRect(PAD + i * cwp, PAD + j * chp, cwp + 1, chp + 1);
    }
  }
  frame(bdCtx);
  bdPts.forEach(p => dot(bdCtx, p.x, p.y, 5.5, CCLR[p.c]));
  const counts = {}; bdPts.forEach(p => counts[p.c] = (counts[p.c] || 0) + 1);
  const ready = Object.values(counts).filter(n => n >= 2).length >= 2;
  $('bd-train').disabled = !ready || bdTraining;
  updateBdProc(ready);
}
function updateBdProc(ready) {
  const ps = [...$('bd-proc').children];
  const active = bdTraining ? 1 : bdTrained ? 2 : ready ? 1 : 0;
  ps.forEach((el, i) => procState(el, i < active ? 'done' : i === active ? 'on' : ''));
}
$('classpick').addEventListener('click', (e) => { const c = e.target.closest('[data-c]'); if (!c) return; selClass = +c.dataset.c; $('classpick').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.c === selClass)); });
$('c-bd').addEventListener('pointerdown', (e) => { if (bdTraining) return; const [x, y] = evtData(e); if (x < 0 || x > DOM || y < 0 || y > DOM) return; bdPts.push({ x: +x.toFixed(2), y: +y.toFixed(2), c: selClass }); bdTrained = false; $('bd-say').textContent = '좋아요! 다른 색도 찍은 뒤 [경계 학습하기]를 눌러요.'; renderBd(); });
$('bd-sample').onclick = () => { bdPts = [...blob(3, 7, 8, 0), ...blob(7, 3.5, 8, 1)]; bdTrained = false; $('bd-say').textContent = '예시를 채웠어요. [경계 학습하기]를 눌러보세요.'; renderBd(); };
$('bd-clear').onclick = () => { bdPts = []; bdTrained = false; $('bd-epoch').textContent = '—'; $('bd-acc').textContent = '—'; $('bd-say').textContent = '두 가지 색 점을 각각 몇 개씩 찍어 주세요.'; renderBd(); };
$('bd-cx').oninput = (e) => { $('bd-cxv').textContent = CXLABEL[e.target.value]; };
$('bd-train').onclick = async () => {
  const counts = {}; bdPts.forEach(p => counts[p.c] = (counts[p.c] || 0) + 1);
  bdUsed = Object.keys(counts).filter(c => counts[c] >= 2).map(Number).sort();
  if (bdUsed.length < 2) return;
  const pos = {}; bdUsed.forEach((c, i) => pos[c] = i);
  const data = bdPts.filter(p => bdUsed.includes(p.c));
  bdTraining = true; bdTrained = false; setStatus('경계 학습 중…', 'busy'); $('bd-train').disabled = true;
  $('bd-say').innerHTML = 'AI가 색을 나누는 <b>경계</b>를 조금씩 다듬는 중이에요…'; updateBdProc(true);
  const xs = tf.tensor2d(data.map(p => [p.x / DOM, p.y / DOM]));
  const ys = tf.tensor2d(data.map(p => { const o = new Array(bdUsed.length).fill(0); o[pos[p.c]] = 1; return o; }));
  if (bdModel) bdModel.dispose();
  const cx = +$('bd-cx').value, units = cx === 1 ? 4 : cx === 2 ? 12 : 40;
  bdModel = tf.sequential();
  bdModel.add(tf.layers.dense({ inputShape: [2], units, activation: 'relu' }));
  if (cx === 3) bdModel.add(tf.layers.dense({ units: 40, activation: 'relu' }));
  bdModel.add(tf.layers.dense({ units: bdUsed.length, activation: 'softmax' }));
  bdModel.compile({ optimizer: tf.train.adam(0.06), loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
  const epochs = cx === 3 ? 160 : 100;
  await bdModel.fit(xs, ys, { epochs, shuffle: true, batchSize: Math.min(16, data.length), callbacks: { onEpochEnd: (ep, logs) => { if (ep % 5 === 0 || ep === epochs - 1) { $('bd-epoch').textContent = (ep + 1) + ' / ' + epochs; const a = logs.acc ?? logs.accuracy; $('bd-acc').textContent = a != null ? Math.round(a * 100) + '%' : '—'; } } } });
  // 결정 경계 그리드 예측
  const gw = 60, gh = 43, cells = [];
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { const x = (i + 0.5) / gw, y = 1 - (j + 0.5) / gh; cells.push([x, y]); }
  const pred = tf.tidy(() => bdModel.predict(tf.tensor2d(cells)).argMax(1).dataSync());
  bdGrid = { gw, gh, pred };
  const accT = tf.tidy(() => { const p = bdModel.predict(xs).argMax(1).dataSync(); const t = ys.argMax(1).dataSync(); let ok = 0; for (let i = 0; i < p.length; i++) if (p[i] === t[i]) ok++; return ok / p.length; });
  $('bd-acc').textContent = Math.round(accT * 100) + '%';
  xs.dispose(); ys.dispose();
  bdTrained = true; bdTraining = false; renderBd();
  window.CourseDashboard && CourseDashboard.markDone('boundary');
  const cxName = CXLABEL[$('bd-cx').value];
  $('bd-say').innerHTML = `✓ 완성! 복잡도 <b>${cxName}</b>로 경계를 그렸어요. 복잡도를 바꿔 다시 학습하면 경계 모양이 달라져요.`;
  setStatus('학습 완료 · READY', 'ready');
};

/* ════ 2. 지도 vs 비지도 ════ */
let cmpPts = [], cmpMode = 'sup', cmpAssign = [], cmpCents = [];
const cmpCtx = $('c-cmp').getContext('2d');
function makeCmp() { cmpPts = [...blob(3.2, 7, 10, 0, 3.2), ...blob(7, 3.6, 10, 1, 3.2)]; cmpMode = 'sup'; $('cmp-seg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === 'sup')); renderCmp(); }
function kmeans2(pts, K, cents, assign) {
  let changed = 0;
  pts.forEach((p, i) => { let b = 0, bd = Infinity; cents.forEach((c, k) => { const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2; if (d < bd) { bd = d; b = k; } }); if (assign[i] !== b) { assign[i] = b; changed++; } });
  const s = cents.map(() => ({ x: 0, y: 0, n: 0 })); pts.forEach((p, i) => { const t = s[assign[i]]; t.x += p.x; t.y += p.y; t.n++; });
  cents.forEach((c, k) => { if (s[k].n) { c.x = s[k].x / s[k].n; c.y = s[k].y / s[k].n; } });
  return changed;
}
function runUnsup() {
  const idx = [0, cmpPts.length - 1]; cmpCents = idx.map(i => ({ x: cmpPts[i].x, y: cmpPts[i].y })); cmpAssign = new Array(cmpPts.length).fill(-1);
  for (let it = 0; it < 12; it++) if (kmeans2(cmpPts, 2, cmpCents, cmpAssign) === 0) break;
}
function drawStar(ctx, x, y, color) {
  const [px, py] = toPx(x, y), R = 11, r = 4.6; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const ang = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R; const sx = px + Math.cos(ang) * rad, sy = py + Math.sin(ang) * rad; i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
}
function renderCmp() {
  cmpCtx.clearRect(0, 0, CW, CH); frame(cmpCtx);
  if (cmpMode === 'sup') { cmpPts.forEach(p => dot(cmpCtx, p.x, p.y, 5.5, CCLR[p.c])); }
  else { cmpPts.forEach((p, i) => dot(cmpCtx, p.x, p.y, 5.5, CCLR[cmpAssign[i]] || '#8c97a7')); cmpCents.forEach((c, k) => drawStar(cmpCtx, c.x, c.y, CCLR[k])); }
  $('cmp-tip').innerHTML = cmpMode === 'sup'
    ? EduinoIcons.svg('target') + ' 정답(색)이 정해진 점들이에요'
    : EduinoIcons.svg('puzzle') + ' 정답을 무시하고 위치만 보고 다시 묶었어요 (★=무리 중심)';
}
/* makeCmp() 는 로드 시점 초기화에도 쓰인다. 완료 신호를 그 안에 두면 화면을 열자마자
   완료로 찍히므로, 사용자가 실제로 누른 자리에만 건다. */
$('cmp-sample').onclick = () => { makeCmp(); window.CourseDashboard && CourseDashboard.markDone('compare'); };
/* 이 탭의 핵심은 지도/비지도를 바꿔 보는 것이다 — 그 전환을 완료로 본다. */
$('cmp-seg').addEventListener('click', (e) => { const m = e.target.dataset.m; if (!m) return;
  window.CourseDashboard && CourseDashboard.markDone('compare'); cmpMode = m; $('cmp-seg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === m)); if (m === 'unsup') runUnsup(); renderCmp(); setStatus(m === 'sup' ? '지도학습 보기' : '비지도학습 보기', 'ready'); });

/* ── 단계 전환 ── */
document.querySelectorAll('.step').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.step').forEach(b => b.classList.toggle('active', b === btn));
    const s = btn.dataset.step;
    $('panel-boundary').hidden = s !== 'boundary'; $('panel-compare').hidden = s !== 'compare';
    const pv = $('panel-valid'); if (pv) pv.hidden = s !== 'valid';
    if (s === 'boundary') renderBd(); else if (s === 'compare') renderCmp(); else if (s === 'valid' && typeof renderVl === 'function') renderVl();
    setStatus('준비됨');
  };
});

/* 초기화 */
bdPts = [...blob(3, 7, 8, 0), ...blob(7, 3.5, 8, 1)]; renderBd();
makeCmp();
