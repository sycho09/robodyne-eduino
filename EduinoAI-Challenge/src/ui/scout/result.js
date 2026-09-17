/**
 * ui/scout/result.js — 학습 결과 네 탭.
 *
 *   학습 곡선   표본 1장·2장… 각각 LOOCV 를 실제로 다시 돌린 값이다. 에폭 곡선이 아니다 —
 *               kNN 에는 반복 학습이 없으므로 그런 곡선은 존재하지 않는다.
 *   혼동 행렬   무엇을 무엇으로 잘못 봤는지. 대각선이 맞힌 것이다.
 *   지문        지금 보는 것의 35값과 배운 클래스들의 평균을 나란히 견준다.
 *   성분 지도   35차원을 두 축으로 눌러 본다(PCA). 고정 시작 벡터라 난수가 없다.
 *
 * 여기서 그리는 수치는 전부 ml.js 가 낸 것이다. 이 파일은 세지 않는다.
 */

import { classMeans, distance } from './ml.js';

const TABS = [
  { id: 'curve', label: '학습 곡선' },
  { id: 'cm', label: '혼동 행렬' },
  { id: 'print', label: '지문' },
  { id: 'pca', label: '성분 지도' },
];

const W = 320;
const H = 240;

export function createResultPanel({ mount, challenge }) {
  const spec = challenge.scout;
  let tab = 'curve';
  let train = null;
  let model = null;
  let scan = 0;

  mount.innerHTML = `
    <p class="res__empty" data-el="res-empty">클래스를 두 종 만들고 각각 ${spec.classes.min_samples}장씩 담은 뒤
      [학습하기] 를 누르면 여기에 맞힘 · 틀림 · 표본 수와 네 가지 그림이 뜹니다.</p>
    <div class="res" data-el="res" hidden>
      <div class="res__kpis">
        <span><b data-el="k-acc">—</b>맞힘</span>
        <span><b data-el="k-err">—</b>틀림</span>
        <span><b data-el="k-n">—</b>표본</span>
        <span class="res__hash" data-el="k-hash"></span>
      </div>
      <div class="res__tabs" data-el="res-tabs">
        ${TABS.map((t) => `<button type="button" class="res__tab${t.id === tab ? ' is-on' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
      </div>
      <canvas class="res__canvas" width="${W}" height="${H}" data-el="res-canvas"></canvas>
      <table class="cmx" data-el="cmx" hidden></table>
      <p class="res__stale" data-el="res-stale" hidden>표본이나 이름이 바뀌었습니다. 다시 [학습하기] 를 누르세요.</p>
      <p class="res__note">사진은 남지 않습니다. 담기는 것은 숫자 ${spec.feature_len}개뿐입니다.</p>
    </div>`;

  const el = (n) => mount.querySelector(`[data-el="${n}"]`);
  const canvas = el('res-canvas');

  mount.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    mount.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('is-on', x.dataset.tab === tab));
    canvas.hidden = tab === 'cm';
    el('cmx').hidden = tab !== 'cm';
    paint(null);
  }));

  /* ---------- 학습 곡선 ---------- */
  function drawCurve(g) {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#0f1218';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#8d97a6';
    g.font = '700 10px -apple-system, sans-serif';
    g.fillText('표본을 한 장씩 늘리며 다시 재 본 정확도', 12, 14);
    if (!train) return;
    const top = 26;
    const bot = H - 26;
    g.strokeStyle = 'rgba(255,255,255,.08)';
    g.lineWidth = 1;
    [0, 0.25, 0.5, 0.75, 1].forEach((v) => {
      const y = top + (1 - v) * (bot - top);
      g.beginPath(); g.moveTo(34, y + 0.5); g.lineTo(W - 10, y + 0.5); g.stroke();
    });
    g.fillStyle = '#5d6673';
    g.font = '9px ui-monospace, monospace';
    g.fillText('100%', 6, top + 4);
    g.fillText('50%', 12, top + (bot - top) / 2 + 3);
    g.fillText('0%', 18, bot + 4);
    const pts = train.curve.map((p, i) => {
      const x = 34 + (train.curve.length < 2 ? 0.5 : i / (train.curve.length - 1)) * (W - 46);
      return [x, top + (1 - p.acc) * (bot - top), p];
    });
    g.strokeStyle = '#3b82f6';
    g.lineWidth = 2;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    g.fillStyle = '#3b82f6';
    pts.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); });
    g.fillStyle = '#7b8391';
    g.font = '9px -apple-system, sans-serif';
    g.fillText('표본 1장', 34, H - 8);
    g.fillText(`${train.curve.length}장`, W - 44, H - 8);
  }

  /* ---------- 혼동 행렬 ---------- */
  function drawConfusion() {
    const t = el('cmx');
    if (!train) { t.innerHTML = ''; return; }
    const L = train.sets;
    const short = (s) => (s.length > 4 ? `${s.slice(0, 4)}…` : s);
    let html = `<tr><th></th>${L.map((c) => `<th>${short(c.name)}</th>`).join('')}</tr>`;
    train.cm.forEach((row, i) => {
      const tot = row.reduce((a, b) => a + b, 0) || 1;
      html += `<tr><th>${short(L[i].name)}</th>${row.map((v, j) => {
        const p = v / tot;
        const bg = i === j ? `rgba(63,185,80,${0.16 + p * 0.62})` : (v ? `rgba(229,72,77,${0.14 + p * 0.55})` : 'transparent');
        return `<td style="background:${bg}">${v || ''}</td>`;
      }).join('')}</tr>`;
    });
    t.innerHTML = html;
  }

  /* ---------- 지문 ---------- */
  function fingerBar(g, f, x, y, w, h, dim) {
    const bw = w / f.length;
    const colorCount = spec.grid * spec.grid * 3;
    for (let i = 0; i < f.length; i++) {
      let col;
      if (i < colorCount) {
        const ch = i % 3;
        col = ch === 0 ? `rgb(${f[i]},40,40)` : ch === 1 ? `rgb(40,${f[i]},40)` : `rgb(40,40,${f[i]})`;
      } else col = `hsl(210,10%,${22 + (f[i] / 255) * 58}%)`;
      const bh = Math.max(1.5, (f[i] / 255) * h);
      g.globalAlpha = dim ? 0.45 : 1;
      g.fillStyle = col;
      g.fillRect(x + i * bw, y + h - bh, Math.max(1, bw - 0.8), bh);
    }
    g.globalAlpha = 1;
  }

  function drawPrint(g, now) {
    g.fillStyle = '#0f1218';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#8d97a6';
    g.font = '700 10px -apple-system, sans-serif';
    g.fillText('지금 보는 것의 지문', 12, 14);
    g.fillStyle = '#5d6673';
    g.font = '9px ui-monospace, monospace';
    const colorCount = spec.grid * spec.grid * 3;
    g.fillText(`${colorCount} 색 + ${spec.hist_bins} 밝기 = ${spec.feature_len}`, W - 92, 14);
    if (!now) {
      g.fillStyle = '#5d6673';
      g.font = '11px -apple-system, sans-serif';
      g.fillText('카메라를 켜면 지금 보는 것의 지문이 뜹니다.', 12, 60);
      return;
    }
    g.strokeStyle = 'rgba(255,255,255,.08)';
    g.strokeRect(11.5, 19.5, W - 23, 50);
    fingerBar(g, now, 14, 21, W - 28, 46, false);
    // 훑는 띠 — 지금 값이 살아 있다는 표시일 뿐 계산과 무관하다.
    scan = (scan + 2.6) % W;
    const grd = g.createLinearGradient(scan - 26, 0, scan + 8, 0);
    grd.addColorStop(0, 'rgba(120,220,255,0)');
    grd.addColorStop(1, 'rgba(120,220,255,.34)');
    g.fillStyle = grd;
    g.fillRect(Math.max(12, scan - 26), 21, Math.min(34, scan), 46);

    if (!model) {
      g.fillStyle = '#5d6673';
      g.font = '11px -apple-system, sans-serif';
      g.fillText('학습하고 [적용하기] 를 누르면', 12, 106);
      g.fillText('배운 지문과 나란히 견줍니다.', 12, 124);
      return;
    }
    const ds = classMeans(model.sets).map((o) => ({ ...o, d: distance(now, o.mean) }));
    const dmax = Math.max(...ds.map((o) => o.d)) || 1;
    const best = ds.reduce((a, b) => (a.d < b.d ? a : b));
    g.fillStyle = '#8d97a6';
    g.font = '700 10px -apple-system, sans-serif';
    g.fillText('배운 지문과 견주기', 12, 88);
    ds.forEach((o, i) => {
      const y = 96 + i * 33;
      const hit = o === best;
      const m = Math.max(0, 1 - o.d / (dmax * 1.12));
      if (hit) { g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(10, y - 4, W - 20, 30); }
      g.fillStyle = o.c.color;
      g.fillRect(12, y + 3, 7, 7);
      g.fillStyle = hit ? '#fff' : '#a7b0bd';
      g.font = `${hit ? '800 ' : '600 '}11px -apple-system, sans-serif`;
      g.fillText(o.c.name.slice(0, 6), 24, y + 11);
      fingerBar(g, o.mean, 86, y - 1, 120, 20, !hit);
      g.fillStyle = 'rgba(255,255,255,.10)';
      g.fillRect(214, y + 2, 70, 9);
      g.fillStyle = o.c.color;
      g.fillRect(214, y + 2, 70 * m, 9);
      g.fillStyle = hit ? '#fff' : '#8d97a6';
      g.font = '700 10px ui-monospace, monospace';
      g.fillText(`${Math.round(m * 100)}%`, 290, y + 11);
    });
  }

  /* ---------- 성분 지도 ---------- */
  function drawPca(g, now) {
    g.fillStyle = '#0f1218';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#8d97a6';
    g.font = '700 10px -apple-system, sans-serif';
    g.fillText('성분 지도 — 배운 것들이 어떻게 흩어져 있나', 12, 14);
    if (!model || !model.pca) {
      g.fillStyle = '#5d6673';
      g.font = '11px -apple-system, sans-serif';
      g.fillText('학습하고 [적용하기] 를 누르면', 12, 112);
      g.fillText('표본이 점으로 흩어집니다.', 12, 130);
      return;
    }
    const P = model.pca;
    const cx = W / 2;
    const cy = 126;
    const R = 88;
    g.strokeStyle = 'rgba(255,255,255,.06)';
    g.lineWidth = 1;
    for (let k = -2; k <= 2; k++) {
      g.beginPath(); g.moveTo(cx + (k * R) / 2, 26); g.lineTo(cx + (k * R) / 2, cy + R + 6); g.stroke();
      g.beginPath(); g.moveTo(cx - R - 8, cy + (k * R) / 2); g.lineTo(cx + R + 8, cy + (k * R) / 2); g.stroke();
    }
    const T = (a, b) => [cx + (a / P.ax) * R, cy + (b / P.bx) * R * 0.72];
    P.pts.forEach((p) => {
      const [x, y] = T(p.a, p.b);
      g.fillStyle = model.sets[p.ci].color;
      g.globalAlpha = 0.85;
      g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
      g.globalAlpha = 1;
    });
    if (now) {
      let a = 0;
      let b = 0;
      for (let i = 0; i < now.length; i++) { const d = now[i] - P.mean[i]; a += d * P.p1[i]; b += d * P.p2[i]; }
      const [nx, ny] = T(a, b);
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.beginPath(); g.arc(nx, ny, 7.5, 0, 7); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.beginPath(); g.arc(nx, ny, 2.5, 0, 7); g.fill();
      g.fillStyle = '#fff';
      g.font = '700 9.5px -apple-system, sans-serif';
      g.fillText('지금', nx + 11, ny + 3);
    }
    let lx = 12;
    model.sets.forEach((c) => {
      g.fillStyle = c.color;
      g.fillRect(lx, H - 14, 7, 7);
      g.fillStyle = '#a7b0bd';
      g.font = '9.5px -apple-system, sans-serif';
      const t = c.name.slice(0, 5);
      g.fillText(t, lx + 11, H - 7);
      lx += 11 + g.measureText(t).width + 12;
    });
  }

  /** 한 프레임 그린다. now 는 지금 보는 것의 지문(없으면 null). */
  function paint(now) {
    if (!train && !model) return;
    const g = canvas.getContext('2d');
    if (tab === 'curve') drawCurve(g);
    else if (tab === 'print') drawPrint(g, now);
    else if (tab === 'pca') drawPca(g, now);
  }

  /** 학습이 끝났을 때 · 적용했을 때 부른다. */
  function setTrain(t, m, staleHash) {
    train = t;
    model = m;
    el('res').hidden = !t;
    el('res-empty').hidden = !!t;
    if (!t) return;
    el('k-acc').textContent = `${Math.round(t.acc * 100)}%`;
    el('k-err').textContent = `${Math.round((1 - t.acc) * 100)}%`;
    el('k-n').textContent = `${t.n}장`;
    el('k-hash').textContent = `지문 ${t.hash}`;
    el('res-stale').hidden = !staleHash || staleHash === t.hash;
    drawConfusion();
    paint(null);
  }

  return { paint, setTrain, tab: () => tab };
}
