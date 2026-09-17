/**
 * ui/panels/train.js — [학습] 탭.
 *
 * 순서가 보이는 화면이다. 1 카메라 켜기 → 2 칸 고르기 → 3 담기 → 4 학습하기.
 * 지금 할 일이 강조되고 끝난 단계에는 체크가 붙는다.
 *
 * 화면에 나오는 수치(개수·정확도·클래스별 정답률)는 전부 engine/ml.js 가 낸 값을 그대로 쓴다.
 * 그래프도 그 점들을 잇기만 한다 — 추정도 보간도 하지 않는다.
 *
 * 사진은 저장하지 않는다. 담는 순간 특징값 35개만 남기고 원본은 버린다.
 * 카드 안 미리보기는 이번 접속 동안만 메모리에 있고, 새로 고치면 특징값으로 그린 색 조각이 된다.
 */

import { ML, extractFeature, featureSwatch, trainModel } from '../../engine/ml.js';

const CARD_THUMBS = 3;   // 카드 하나에 보여 줄 미리보기 수

export function createTrain({ mount, classNames, store, webcam, onModel, onNotice }) {
  const root = document.createElement('div');
  root.className = 'train';
  root.innerHTML = `
    <ol class="steps" data-el="steps">
      <li class="step" data-step="0"><b>1</b><span>카메라 켜기</span></li>
      <li class="step" data-step="1"><b>2</b><span>담을 칸 고르기</span></li>
      <li class="step" data-step="2"><b>3</b><span>장면 담기</span></li>
      <li class="step" data-step="3"><b>4</b><span>학습하기</span></li>
    </ol>
    <div class="train__cards" data-el="cards"></div>
    <div class="train__row">
      <button class="btn btn--primary" type="button" data-el="grab">이 장면 담기</button>
      <button class="btn" type="button" data-el="learn">학습하기</button>
      <span class="train__lock" data-el="lock"></span>
    </div>
    <div class="train__result" data-el="result" hidden></div>`;
  mount.append(root);
  const q = (n) => root.querySelector(`[data-el="${n}"]`);

  let samples = store.mlSamples.slice();
  const thumbs = new Map();     // at → dataURL. 이번 접속 동안만 산다(저장하지 않는다).
  let active = 0;
  let model = null;
  let seq = samples.reduce((m, s) => Math.max(m, s.at || 0), 0);

  const countOf = (c) => samples.filter((s) => s.label === c).length;
  const cameraOn = () => !!(webcam && webcam.running);
  const enough = () => classNames.every((_, i) => countOf(i) >= ML.min_samples);

  /**
   * 55차 보강5 5-1 — 담아 둔 장면이 있으면 화면을 열 때 모델을 되살린다.
   * kNN 이라 표본이 같으면 모델도 같다(결정론) — 새로 만드는 것이 아니라 같은 것을 다시 세운다.
   * 학습을 누른 기록(mlTrend)에는 점을 찍지 않는다. 되살리기는 학습이 아니다.
   *
   * 처음 만들 때는 자동으로 하지 않는다. 표본을 담고 [학습하기] 를 눌러야 첫 모델이 생긴다 —
   * 학습 단계는 거기서 겪는다. 되살리기는 이미 겪은 것을 다시 시키지 않는 것뿐이다.
   * (표본이 최소 장수를 넘겼다는 것이 곧 '한 번은 담아 봤다' 는 뜻이다.)
   */
  let restored = false;
  if (enough()) {
    const back = trainModel(samples);
    if (back.ready) { model = back; restored = true; }
  }

  /** 지금 해야 할 단계. 앞 단계가 끝나야 다음이 현재가 된다. */
  function stepIndex() {
    if (!cameraOn()) return 0;
    if (!samples.length) return 1;
    if (!enough()) return 2;
    return 3;
  }

  function renderSteps() {
    const cur = stepIndex();
    const done = model && model.ready ? 4 : cur;
    for (const li of q('steps').children) {
      const i = Number(li.dataset.step);
      li.classList.toggle('is-now', i === cur && done < 4);
      li.classList.toggle('is-done', i < done || (i === 3 && done === 4));
    }
  }

  /** 미리보기: 이번 접속에 담은 것은 실제 화면, 아니면 특징값 3x3 색 조각. */
  function thumbNode(sample) {
    const url = thumbs.get(sample.at);
    if (url) {
      const img = new Image();
      img.src = url;
      img.alt = '';
      return img;
    }
    const mosaic = document.createElement('div');
    mosaic.className = 'train__mosaic';
    for (const [r, g, b] of featureSwatch(sample.f)) {
      const cell = document.createElement('i');
      cell.style.background = `rgb(${r}, ${g}, ${b})`;
      mosaic.append(cell);
    }
    return mosaic;
  }

  function commit() {
    store.setMlSamples(samples);
    model = null;
    q('result').hidden = true;
    if (onModel) onModel(null);
    render();
  }

  function renderCards() {
    q('cards').replaceChildren(...classNames.map((name, i) => {
      const n = countOf(i);
      const card = document.createElement('div');
      card.className = `traincard${i === active ? ' is-on' : ''}${n >= ML.min_samples ? ' is-ready' : ''}`;

      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'traincard__head';
      head.innerHTML = `<span class="traincard__name">${name}</span><b class="traincard__count">${n}</b><span class="traincard__need">/ ${ML.min_samples}장</span>`;
      head.addEventListener('click', () => { active = i; render(); });

      const bar = document.createElement('div');
      bar.className = 'traincard__bar';
      const fill = document.createElement('i');
      fill.style.width = `${Math.min(100, Math.round((n * 100) / ML.min_samples))}%`;
      bar.append(fill);

      const strip = document.createElement('div');
      strip.className = 'traincard__strip';
      const mine = samples.map((s, idx) => ({ s, idx })).filter((x) => x.s.label === i).slice(-CARD_THUMBS);
      // 55차 파트E — 머리의 숫자는 담은 총 장수이고, 미리보기는 최근 CARD_THUMBS 장뿐이다.
      // 둘이 어긋나 보이지 않도록 접힌 장수를 칸 앞에 적는다("정지 9" 인데 칸은 셋).
      const folded = n - mine.length;
      if (folded > 0) {
        const more = document.createElement('span');
        more.className = 'traincard__more';
        more.textContent = `+${folded}`;
        more.title = `먼저 담은 ${folded}장은 접혀 있습니다. 미리보기는 최근 ${CARD_THUMBS}장만 보여 줍니다.`;
        strip.append(more);
      }
      for (const { s, idx } of mine) {
        const cell = document.createElement('div');
        cell.className = 'traincard__thumb';
        cell.append(thumbNode(s));
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'traincard__del';
        del.title = '이 샘플 지우기';
        del.textContent = '×';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          thumbs.delete(samples[idx].at);
          samples.splice(idx, 1);
          commit();
        });
        cell.append(del);
        strip.append(cell);
      }
      if (!mine.length) {
        const empty = document.createElement('span');
        empty.className = 'traincard__empty';
        empty.textContent = '아직 없음';
        strip.append(empty);
      }
      // 아직 채우지 않은 자리. 몇 장을 더 담아야 하는지가 숫자를 읽지 않아도 보인다.
      // 55차 파트E — 기준은 담은 총 장수(n)다. 미리보기 수로 세면 다 채운 뒤에도 빈 자리가 남았다.
      // 기본 화면에서는 CSS 가 숨긴다 — 다른 챌린지의 학습 패널은 그대로다.
      for (let k = n; k < ML.min_samples; k++) {
        const slot = document.createElement('span');
        slot.className = 'traincard__slot';
        strip.append(slot);
      }

      const foot = document.createElement('div');
      foot.className = 'traincard__foot';
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'btn btn--mini';
      clear.textContent = '이 칸 비우기';
      clear.disabled = n === 0;
      clear.addEventListener('click', (e) => {
        e.stopPropagation();
        for (const s of samples.filter((x) => x.label === i)) thumbs.delete(s.at);
        samples = samples.filter((s) => s.label !== i);
        commit();
      });
      foot.append(clear);

      card.append(head, bar, strip, foot);
      return card;
    }));
  }

  /** 왜 잠겨 있는지는 버튼 바로 옆에 둔다. */
  function renderLock() {
    if (!cameraOn()) {
      q('grab').disabled = true;
      q('learn').disabled = true;
      q('lock').textContent = '먼저 [카메라 켜기] 를 눌러 주세요.';
      return;
    }
    q('grab').disabled = false;
    const short = classNames.map((n, i) => ({ n, c: countOf(i) })).filter((x) => x.c < ML.min_samples);
    q('learn').disabled = short.length > 0;
    if (short.length) {
      q('lock').textContent = `${short.map((x) => `${x.n} ${ML.min_samples - x.c}장`).join(' · ') } 더 담으면 학습할 수 있어요.`;
    } else {
      const thin = classNames.filter((_, i) => countOf(i) < ML.recommend_samples);
      q('lock').textContent = thin.length
        ? `학습할 수 있어요. ${ML.recommend_samples}장씩 모으면 더 잘 맞아요.`
        : '충분히 모았어요.';
    }
  }

  function render() {
    renderCards(); renderLock(); renderSteps();
    // 이미 모델이 있으면 [다시 학습하기] 다. 흐름의 4번 단계가 화면에서 사라지지 않게 남긴다.
    q('learn').textContent = model && model.ready ? '다시 학습하기' : '학습하기';
  }

  // ── 그래프 ──────────────────────────────────────────────────
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };

  /** 학습을 누를 때마다 찍힌 점을 잇는다. 점은 엔진이 낸 (총 샘플 수, 정확도) 그대로다. */
  function trendChart(points) {
    const W = 260;
    const H = 120;
    const PAD = { l: 30, r: 8, t: 10, b: 22 };
    const svg = svgEl('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img' });
    const maxX = Math.max(ML.min_samples * ML.classes, ...points.map((p) => p.total));
    const px = (v) => PAD.l + ((v - 0) / (maxX || 1)) * (W - PAD.l - PAD.r);
    const py = (v) => H - PAD.b - (v / 100) * (H - PAD.t - PAD.b);
    for (const g of [0, 50, 100]) {
      svg.append(svgEl('line', { class: 'chart__grid', x1: PAD.l, y1: py(g), x2: W - PAD.r, y2: py(g) }));
      const t = svgEl('text', { class: 'chart__tick', x: PAD.l - 5, y: py(g) + 3.5, 'text-anchor': 'end' });
      t.textContent = String(g);
      svg.append(t);
    }
    if (points.length) {
      const d = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.total).toFixed(1)},${py(p.accuracy).toFixed(1)}`).join(' ');
      if (points.length > 1) svg.append(svgEl('path', { class: 'chart__line', d }));
      points.forEach((p, i) => {
        svg.append(svgEl('circle', { class: `chart__dot${i === points.length - 1 ? ' is-last' : ''}`, cx: px(p.total), cy: py(p.accuracy), r: i === points.length - 1 ? 4 : 2.6 }));
      });
      const last = points[points.length - 1];
      const lab = svgEl('text', { class: 'chart__last', x: Math.min(W - PAD.r, px(last.total) + 6), y: Math.max(12, py(last.accuracy) - 7), 'text-anchor': px(last.total) > W - 60 ? 'end' : 'start' });
      lab.textContent = `${last.accuracy}%`;
      svg.append(lab);
    }
    const xl = svgEl('text', { class: 'chart__tick', x: W - PAD.r, y: H - 6, 'text-anchor': 'end' });
    xl.textContent = `샘플 ${maxX}장`;
    svg.append(xl);
    return svg;
  }

  function barRow(label, value, unit, ratio) {
    const row = document.createElement('div');
    row.className = 'trainbar';
    const name = document.createElement('span');
    name.textContent = label;
    const track = document.createElement('i');
    const fill = document.createElement('b');
    fill.style.width = `${Math.max(0, Math.min(100, ratio))}%`;
    track.append(fill);
    const num = document.createElement('em');
    num.textContent = `${value}${unit}`;
    row.append(name, track, num);
    return row;
  }

  function renderResult() {
    const box = q('result');
    box.hidden = false;
    box.replaceChildren();
    if (!model || !model.ready) {
      const p = document.createElement('div');
      p.className = 'train__meta';
      p.textContent = `클래스마다 ${ML.min_samples}장 이상 필요합니다.`;
      box.append(p);
      return;
    }

    // 55차 보강5 5-1 — 되살렸다는 사실을 화면이 말한다. 학생이 무엇을 안 눌러도 되는지 알아야 한다.
    if (restored) {
      const back = document.createElement('div');
      back.className = 'train__meta train__meta--back';
      back.textContent = '담아 둔 장면으로 모델을 되살렸습니다. 장면을 더 담고 [다시 학습하기] 를 누르면 바뀝니다.';
      box.append(back);
    }

    const acc = document.createElement('div');
    acc.className = 'train__acc';
    acc.innerHTML = `<span>자체 검증 정확도</span><b>${model.accuracy}%</b><span class="train__hash">모델 <code>${model.hash}</code></span>`;
    box.append(acc);

    const trend = document.createElement('div');
    trend.className = 'trainchart';
    trend.innerHTML = '<div class="trainchart__title">정확도 추이 — 샘플을 늘릴수록</div>';
    trend.append(trendChart(store.mlTrend));
    box.append(trend);

    const bars = document.createElement('div');
    bars.className = 'trainchart';
    bars.innerHTML = '<div class="trainchart__title">칸별 샘플 수</div>';
    const maxN = Math.max(ML.recommend_samples, ...model.counts);
    classNames.forEach((n, i) => bars.append(barRow(n, model.counts[i], '장', (model.counts[i] * 100) / maxN)));
    box.append(bars);

    const per = document.createElement('div');
    per.className = 'trainchart';
    per.innerHTML = '<div class="trainchart__title">칸별 정답률 — 어디서 헷갈리는지</div>';
    classNames.forEach((n, i) => per.append(barRow(n, model.perClass[i], '%', model.perClass[i])));
    box.append(per);

    const hint = document.createElement('div');
    hint.className = 'train__meta train__meta--hint';
    const worst = model.perClass.indexOf(Math.min(...model.perClass));
    hint.textContent = model.perClass[worst] < 100
      ? `${classNames[worst]} 가 가장 자주 틀립니다. 그 칸에 다른 각도·밝기로 더 담아 보세요.`
      : '모든 칸을 잘 구분합니다. 실제 주행에서도 맞는지 확인해 보세요.';
    box.append(hint);
  }

  q('grab').addEventListener('click', () => {
    if (!cameraOn()) {
      if (onNotice) onNotice('먼저 [카메라 켜기] 를 눌러 주세요. 이 챌린지는 카메라가 있어야 합니다.', 'warn');
      return;
    }
    if (countOf(active) >= ML.max_samples) {
      if (onNotice) onNotice(`한 칸에 ${ML.max_samples}장까지만 담을 수 있어요.`, 'warn');
      return;
    }
    const frame = webcam.frame();
    if (!frame) {
      if (onNotice) onNotice('카메라 화면을 아직 읽지 못했어요. 잠시 뒤 다시 눌러 주세요.', 'warn');
      return;
    }
    seq += 1;
    samples.push({ label: active, f: extractFeature(frame.data, frame.width, frame.height), at: seq });
    const url = webcam.snapshotUrl && webcam.snapshotUrl();
    if (url) thumbs.set(seq, url);               // 메모리에만 둔다
    commit();
  });

  q('learn').addEventListener('click', () => {
    restored = false;                 // 이제 학생이 직접 누른 모델이다
    model = trainModel(samples);
    if (model.ready) store.pushMlTrend({ total: model.total, accuracy: model.accuracy, hash: model.hash });
    renderResult();
    renderSteps();
    if (onModel) onModel(model.ready ? model : null);
  });

  render();
  // 되살린 모델은 화면에도 바로 보여 준다 — 결과 칸이 비어 있으면 되살아난 줄 모른다.
  if (restored) { renderResult(); renderSteps(); if (onModel) onModel(model); }

  return {
    get model() { return model; },
    get samples() { return samples; },
    /** 제출물에 들어가는 지표. 사진도 특징값도 아닌 요약만 나간다. */
    summary() {
      if (!model || !model.ready) return null;
      return {
        hash: model.hash, accuracy: model.accuracy, counts: model.counts.slice(),
        total: model.total, per_class: model.perClass.slice(),
        trend: store.mlTrend.map((p) => ({ total: p.total, accuracy: p.accuracy })),
      };
    },
    refresh: render,
    dispose() { thumbs.clear(); root.remove(); },
  };
}
