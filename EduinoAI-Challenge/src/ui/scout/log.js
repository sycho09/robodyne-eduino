/**
 * ui/scout/log.js — 탐사 일지와 추정 경로.
 *
 * 일지 한 줄에 남는 것 — 경과 · 알아본 클래스(복수) · 확신도 · 아홉 칸 평균색 · 그때의 명령.
 * **이미지는 남지 않는다.** 소스가 웹캠이든 실물이든 예외가 없다(원칙 7).
 * 아홉 칸 색은 지문에서 뽑은 평균값 아홉 개일 뿐이라 그것으로 원래 그림을 되살릴 수 없다.
 *
 * 경로는 조종 명령을 적분한 **추정값**이다. 측정한 위치가 아니고 지도를 만든 것도 아니다.
 * SLAM 이 아니다 — 그렇게 부르면 학생은 이 선을 믿을 수 있는 지도로 읽는다.
 * 화면이 스스로 "추정" 이라고 적는다.
 */

import { cellColors } from './ml.js';

export function createLogPanel({ mount, challenge, pose, trail }) {
  const conf = challenge.log;
  const pathConf = challenge.path;
  const grid = challenge.scout.grid;
  const rows = [];
  const marks = [];

  mount.innerHTML = `
    <div class="log">
      <div class="log__head">
        <b data-el="log-n">0건</b>
        <span data-el="log-sub"></span>
      </div>
      <div class="log__rows" data-el="log-rows"></div>
      <p class="log__note">${conf.no_image}</p>
      <div class="path">
        <div class="path__head">
          <b>${pathConf.title}</b><span class="path__tag">${pathConf.note}</span>
        </div>
        <canvas class="path__c" width="316" height="156" data-el="path-c"></canvas>
        <p class="path__note">${pathConf.explain}</p>
      </div>
    </div>`;

  const el = (n) => mount.querySelector(`[data-el="${n}"]`);
  const canvas = el('path-c');

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /**
   * 관측 한 줄을 남긴다.
   *   feature  지금 지문 — 아홉 칸 색만 꺼내 쓰고 지문 자체는 보관하지 않는다
   *   found    [{ name, color, conf, n }]
   *   cmd      그때의 명령 (사람이 읽는 말)
   *   elapsed  시작부터 흐른 초
   */
  function add({ feature, found, cmd, elapsed }) {
    rows.push({
      t: elapsed,
      found: found.slice(),
      conf: found.length ? found[0].conf : 0,
      cells: cellColors(feature, grid),
      cmd,
    });
    // 관측 지점을 클래스 색으로 찍는다. 알아본 것이 없으면 흐린 점 하나.
    if (found.length) found.forEach((o, i) => marks.push({ x: pose.x + i * 4, y: pose.y, color: o.color }));
    else marks.push({ x: pose.x, y: pose.y, color: pathConf.mark_unknown_color });
    render();
  }

  function render() {
    const box = el('log-rows');
    if (!rows.length) {
      box.innerHTML = `<p class="log__empty">${conf.empty}</p>`;
    } else {
      box.innerHTML = rows.slice().reverse().map((o) => `
        <div class="logrow">
          <div class="logrow__tile">${o.cells.map((c) => `<i style="background:${esc(c)}"></i>`).join('')}</div>
          <div class="logrow__body">
            <div class="logrow__name">${o.found.length
              ? o.found.map((x) => `<span style="color:${esc(x.color)}">■</span> ${esc(x.name)}`).join(' ')
              : `<span style="color:${esc(pathConf.mark_unknown_color)}">■</span> ${esc(conf.unknown)}`}</div>
            <div class="logrow__meta">${o.t.toFixed(1)}초 · ${o.found.length ? `${o.found.length}개 · ` : ''}${o.conf}% · ${esc(o.cmd)}</div>
          </div>
        </div>`).join('');
    }
    el('log-n').textContent = `${rows.length}건`;
  }

  /** 자취와 관측 지점을 다시 그린다. 매 프레임 부른다. */
  function paintPath() {
    const g = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    g.fillStyle = '#1a1e25';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.05)';
    g.lineWidth = 1;
    for (let x = 0; x < W; x += 22) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
    for (let y = 0; y < H; y += 22) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
    let mnx = 0;
    let mxx = 0;
    let mny = 0;
    let mxy = 0;
    trail.forEach((p) => { mnx = Math.min(mnx, p.x); mxx = Math.max(mxx, p.x); mny = Math.min(mny, p.y); mxy = Math.max(mxy, p.y); });
    const pad = 20;
    const s = Math.min((W - pad * 2) / Math.max(60, mxx - mnx), (H - pad * 2) / Math.max(60, mxy - mny), 1.6);
    const ox = W / 2 - ((mnx + mxx) / 2) * s;
    const oy = H / 2 - ((mny + mxy) / 2) * s;
    const T = (p) => [ox + p.x * s, oy + p.y * s];
    g.strokeStyle = '#5a93ff';
    g.lineWidth = 2;
    g.lineJoin = 'round';
    g.beginPath();
    trail.forEach((p, i) => { const [a, b] = T(p); if (i) g.lineTo(a, b); else g.moveTo(a, b); });
    g.stroke();
    const [sx, sy] = T(trail[0]);
    g.fillStyle = '#7ee2a8';
    g.beginPath(); g.arc(sx, sy, 3.5, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.font = '9px -apple-system, sans-serif';
    g.fillText(pathConf.start_label, sx + 6, sy + 3);
    marks.forEach((m) => {
      const [a, b] = T(m);
      g.fillStyle = m.color;
      g.save(); g.translate(a, b); g.rotate(Math.PI / 4);
      g.fillRect(-3.2, -3.2, 6.4, 6.4);
      g.restore();
    });
    const [px, py] = T(pose);
    g.save();
    g.translate(px, py);
    g.rotate(pose.h);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -5); g.lineTo(-5, 5); g.closePath(); g.fill();
    g.restore();
  }

  render();

  return { add, paintPath, rows: () => rows.slice(), count: () => rows.length, setSub: (t) => { el('log-sub').textContent = t; } };
}
