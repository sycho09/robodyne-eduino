const $ = (id) => document.getElementById(id);
function setStatus(t, c) { const s = $('status'); s.textContent = t; s.className = 'status' + (c ? ' ' + c : ''); }
const PALETTE = ['#f0473a', '#4d8dff', '#11a06f', '#d98a1f', '#7c6cff'];

/* ── 토큰화: 단어 + 글자 2-gram (한국어 대응) ── */
function tokens(s) {
  s = (s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
  const words = s.split(/\s+/).filter(Boolean), out = [];
  words.forEach(w => { out.push(w); if (w.length >= 2) for (let i = 0; i < w.length - 1; i++) out.push(w.slice(i, i + 2)); });
  return out;
}
function vecFrom(toks, idx) { const v = new Array(idx.size).fill(0); toks.forEach(t => { const i = idx.get(t); if (i != null) v[i]++; }); let n = Math.hypot(...v) || 1; return v.map(x => x / n); }
function cosine(a, b) {
  const ta = tokens(a), tb = tokens(b); if (!ta.length || !tb.length) return 0;
  const idx = new Map(); [...ta, ...tb].forEach(t => { if (!idx.has(t)) idx.set(t, idx.size); });
  const va = vecFrom(ta, idx), vb = vecFrom(tb, idx);
  let d = 0; for (let i = 0; i < va.length; i++) d += va[i] * vb[i]; return d;
}

/* ════ 초급: 비슷한 말 찾기 ════ */
const REFS = [
  '강아지가 정말 귀엽고 예뻐요', '고양이가 야옹하고 울어요', '오늘 점심으로 피자를 먹었어요',
  '비가 와서 우산을 챙겼어요', '수학 시험 공부를 열심히 했어요', '친구랑 축구를 하며 놀았어요',
];
$('sim-refs').innerHTML = REFS.map((r, i) => `<div class="ex-s"><span class="tag">${i + 1}</span>${r}</div>`).join('');
/* 막대 그리기는 네 상태(빈 입력 · 한 글자 · 전부 0% · 정상)가 함께 쓴다.
   어느 경우에도 보기 여섯 줄을 세워 둔다 — 오른쪽 칸이 비지 않고
   "여기에 결과가 나오겠구나"가 먼저 보여야 하기 때문이다. */
function renderBars(scored, note, ranked) {
  $('sim-bars').innerHTML = (note ? `<div class="empty">${note}</div>` : '') + scored.map((o, i) => {
    // 1등은 막대 색으로만 구분한다 (전부 0% 인 상태에서는 그 색도 붙이지 않는다).
    const pct = Math.round(o.s * 100), lead = ranked && i === 0;
    return `<div class="bar"><div class="top"><span class="nm">${o.r}</span><span class="pc">${pct}%</span></div><div class="track"><div class="fill" style="width:${pct}%;background:${lead ? '#f0473a' : '#4d8dff'}"></div></div></div>`;
  }).join('');
}
const zeroBars = () => REFS.map(r => ({ r, s: 0 }));

function runSimilar() {
  const q = $('sim-input').value.trim();
  if (!q) { renderBars(zeroBars(), '왼쪽에 문장을 쓰고 [비슷한 말 찾기]를 눌러보세요.', false); return; }
  /* 글자 2-gram 으로 견주므로(tokens 참고) 한 글자는 어느 보기와도 겹칠 조각이 없다.
     그대로 두면 전부 0% 만 뜨고 왜 그런지 알 수 없으므로, 이유를 말해 준다. */
  if (q.length < 2) { renderBars(zeroBars(), '한 글자로는 견줄 수 없어요. 두 글자 이상 써보세요.', false); return; }

  const scored = REFS.map(r => ({ r, s: cosine(q, r) })).sort((a, b) => b.s - a.s);
  /* 겹치는 조각이 하나도 없으면 여섯 줄이 모두 0% 다. 그대로 두면 고장처럼 보이므로 이유를 위에 적어
     결과와 까닭을 함께 읽게 한다 — "뜻이 아니라 글자를 센다"가 바로 여기서 드러난다. */
  const allZero = scored[0].s === 0;
  renderBars(scored, allZero ? '보기 문장과 겹치는 글자가 하나도 없어서 전부 0%입니다. 보기에 나온 낱말을 섞어 보세요.' : '', !allZero);
  setStatus(allZero ? '겹치는 글자 없음' : '가장 비슷: ' + Math.round(scored[0].s * 100) + '%', 'ready');
  window.CourseDashboard && CourseDashboard.markDone('similar');
}
$('sim-go').onclick = runSimilar;
$('sim-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') runSimilar(); });

/* ════ 중급: 문장 분류 ════ */
let cats = [], nextId = 1, head = null, vocabIdx = null, trained = false, training = false;
const SAMPLE = { '칭찬': '정말 잘했어요\n최고예요 멋지다\n너무 훌륭해요\n대단해요 감동이에요', '불평': '너무 별로예요\n실망했어요\n진짜 느리고 답답해요\n별로 마음에 안 들어요' };
function addCat(name, ex) { const color = PALETTE[cats.length % PALETTE.length]; cats.push({ id: nextId++, name: name || ('분류 ' + (cats.length + 1)), color, ex: ex || '' }); renderCats(); }
function renderCats() {
  $('cats').innerHTML = cats.map(c => `
    <div class="cat" data-id="${c.id}">
      <div class="cat-head"><span class="swatch" style="background:${c.color}"></span>
        <input class="cat-name" value="${c.name.replace(/"/g, '&quot;')}" data-id="${c.id}">
        <button class="cat-del" data-del="${c.id}" title="삭제">×</button></div>
      <textarea data-ex="${c.id}" placeholder="예문을 한 줄에 하나씩">${c.ex.replace(/</g, '&lt;')}</textarea>
    </div>`).join('');
  updateClState();
}
function readCats() { cats.forEach(c => { const ta = document.querySelector(`[data-ex="${c.id}"]`); if (ta) c.ex = ta.value; const ni = document.querySelector(`input.cat-name[data-id="${c.id}"]`); if (ni) c.name = ni.value; }); }
function usableCats() { readCats(); return cats.map(c => ({ ...c, lines: c.ex.split('\n').map(s => s.trim()).filter(Boolean) })).filter(c => c.lines.length >= 1); }
function updateClState() {
  const u = cats.map(c => { const ta = document.querySelector(`[data-ex="${c.id}"]`); return (ta ? ta.value : c.ex).split('\n').map(s => s.trim()).filter(Boolean).length; });
  const ready = u.filter(n => n >= 2).length >= 2;
  $('cl-train').disabled = !ready || training;
  updateClProc();
}
function procState(el, s) { el.className = 'p' + (s ? ' ' + s : ''); }
function updateClProc() {
  const ps = [...$('cl-proc').children];
  const ready = !$('cl-train').disabled || training || trained;
  const active = training ? 1 : trained ? 2 : ready ? 1 : 0;
  ps.forEach((el, i) => procState(el, i < active ? 'done' : i === active ? 'on' : ''));
}
$('cats').addEventListener('input', updateClState);
$('cats').addEventListener('click', (e) => { const del = e.target.dataset.del; if (del) { readCats(); cats = cats.filter(c => c.id !== +del); renderCats(); } });
$('add-cat').onclick = () => { if (cats.length < 5) addCat(); };
$('cl-sample').onclick = () => { cats = []; nextId = 1; Object.entries(SAMPLE).forEach(([n, e]) => addCat(n, e)); trained = false; $('cl-say').textContent = '예문을 채웠어요. [문장 분류 AI 학습]을 눌러보세요.'; };
$('cl-clear').onclick = () => { cats.forEach(c => c.ex = ''); renderCats(); };

$('cl-train').onclick = async () => {
  const u = usableCats().filter(c => c.lines.length >= 2);
  if (u.length < 2) return;
  training = true; trained = false; setStatus('AI 학습 중…', 'busy'); $('cl-train').disabled = true; $('cl-do').disabled = true; $('cl-test').disabled = true;
  $('cl-say').innerHTML = 'AI가 예문을 단어로 쪼개 <b>단어 사전</b>을 만들고, 분류별 단어 패턴을 배우는 중…'; updateClProc();
  // 단어 사전
  vocabIdx = new Map();
  u.forEach(c => c.lines.forEach(l => tokens(l).forEach(t => { if (!vocabIdx.has(t)) vocabIdx.set(t, vocabIdx.size); })));
  const xsArr = [], ysArr = [];
  u.forEach((c, ci) => c.lines.forEach(l => { xsArr.push(vecFrom(tokens(l), vocabIdx)); const oh = new Array(u.length).fill(0); oh[ci] = 1; ysArr.push(oh); }));
  $('m-vocab').textContent = vocabIdx.size;
  const xs = tf.tensor2d(xsArr), ys = tf.tensor2d(ysArr);
  if (head) head.dispose();
  head = tf.sequential();
  head.add(tf.layers.dense({ inputShape: [vocabIdx.size], units: 24, activation: 'relu' }));
  head.add(tf.layers.dense({ units: u.length, activation: 'softmax' }));
  head.compile({ optimizer: tf.train.adam(0.05), loss: 'categoricalCrossentropy' });
  head._cats = u.map(c => ({ name: c.name, color: c.color }));
  const epochs = 60;
  await head.fit(xs, ys, { epochs, shuffle: true, batchSize: Math.min(8, xsArr.length), callbacks: { onEpochEnd: (ep, logs) => { $('m-epoch').textContent = (ep + 1) + ' / ' + epochs; $('m-loss').textContent = logs.loss.toFixed(3); } } });
  xs.dispose(); ys.dispose();
  trained = true; training = false;
  $('cl-test').disabled = false; $('cl-do').disabled = false; $('cl-train').disabled = false;
  $('cl-say').innerHTML = '✓ 학습 완료! 아래에 문장을 써서 <b>[분류하기]</b>를 눌러보세요.'; updateClProc();
  setStatus('학습 완료 · READY', 'ready');
  window.CourseDashboard && CourseDashboard.markDone('classify');
  if ($('cl-test').value.trim()) classify();
};
function classify() {
  if (!trained || !head) return;
  const text = $('cl-test').value.trim();
  if (!text) { $('cl-bars').innerHTML = '<div class="empty">문장을 입력해 주세요.</div>'; return; }
  const probs = tf.tidy(() => head.predict(tf.tensor2d([vecFrom(tokens(text), vocabIdx)])).dataSync());
  const cats2 = head._cats;
  let top = 0; for (let i = 1; i < probs.length; i++) if (probs[i] > probs[top]) top = i;
  $('cl-bars').innerHTML = cats2.map((c, i) => { const pct = Math.round(probs[i] * 100); return `<div class="bar"><div class="top"><span class="nm" style="color:${c.color}">${i === top ? EduinoIcons.svg('tag') + ' ' : ''}${c.name}</span><span class="pc">${pct}%</span></div><div class="track"><div class="fill" style="width:${pct}%;background:${c.color}"></div></div></div>`; }).join('');
  const known = tokens(text).filter(t => vocabIdx.has(t));
  $('cl-bars').innerHTML += `<div class="toks">${known.length ? '알아본 단어: ' + known.slice(0, 12).map(t => `<span class="tok">${t}</span>`).join('') : '사전에 있는 단어가 없어 자신 없어요.'}</div>`;
}
$('cl-do').onclick = classify;
$('cl-test').addEventListener('keydown', (e) => { if (e.key === 'Enter') classify(); });

/* ── 단계 전환 ── */
document.querySelectorAll('.step').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.step').forEach(b => b.classList.toggle('active', b === btn));
    const s = btn.dataset.step;
    $('panel-similar').hidden = s !== 'similar'; $('panel-classify').hidden = s !== 'classify';
    const pr = $('panel-review'); if (pr) pr.hidden = s !== 'review';
    setStatus('준비됨');
  };
});

/* 초기화 */
addCat('칭찬', SAMPLE['칭찬']); addCat('불평', SAMPLE['불평']);
runSimilar(); setStatus('준비됨');
