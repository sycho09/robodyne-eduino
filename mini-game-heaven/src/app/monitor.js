// monitor.js — 공유 시리얼 모니터 컴포넌트
// board.onLine 을 구독해 TX/RX/시스템 로그를 표시한다. 여러 씬에서 재사용.

import { board } from './board.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const now = () => new Date().toTimeString().slice(0, 8);

/**
 * container 안에 시리얼 모니터를 마운트한다.
 * @returns {() => void} 구독 해제 함수
 */
export function mountMonitor(container) {
  container.innerHTML = `
    <div class="monitor-tools">
      <span class="hint">TX 파랑 · RX 초록 · 오류 빨강</span>
      <button class="btn btn-sm" data-clear>지우기</button>
    </div>
    <div class="serial-monitor"><span class="mon-empty">— 로그 없음 —</span></div>
  `;
  const mon = container.querySelector('.serial-monitor');
  container.querySelector('[data-clear]').addEventListener('click', () => {
    mon.innerHTML = '<span class="mon-empty">— 로그 없음 —</span>';
  });

  const unsub = board.onLine((kind, text) => {
    if (!document.contains(mon)) { unsub(); return; }     // 씬 교체 시 자동 해제
    const empty = mon.querySelector('.mon-empty');
    if (empty) empty.remove();
    const cls = { tx: 'mon-tx', rx: 'mon-rx', 'rx-err': 'mon-rx err', sys: 'mon-sys' }[kind] || 'mon-sys';
    const tag = { tx: '→', rx: '←', 'rx-err': '←', sys: '·' }[kind] || '·';
    const row = document.createElement('div');
    row.className = 'mon-line';
    row.innerHTML = `<span class="mon-time">${now()}</span><span class="${cls}">${tag} ${esc(text)}</span>`;
    mon.appendChild(row);
    mon.scrollTop = mon.scrollHeight;
  });
  return unsub;
}
