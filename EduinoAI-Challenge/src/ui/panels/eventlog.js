/**
 * ui/panels/eventlog.js — 관제 이벤트 로그.
 *
 * 언제 무엇이 일어났는지 시뮬 시간과 함께 쌓는다. 최신이 위다.
 * 주행이 끝나도 지우지 않는다 — 되짚어 보는 것이 이 패널의 쓸모다.
 * 시각과 내용은 전부 엔진 상태에서 나온다. 문장을 지어내지 않는다.
 */

const MAX_ROWS = 60;

export function createEventLog({ mount }) {
  const rows = [];
  const list = document.createElement('div');
  list.className = 'evlog';
  mount.append(list);

  const stamp = (tick) => {
    const s = Math.floor(tick / 100);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  function render() {
    list.replaceChildren(...rows.map((r) => {
      const row = document.createElement('div');
      row.className = `evlog__row${r.kind ? ` is-${r.kind}` : ''}`;
      const t = document.createElement('span');
      t.className = 'evlog__time';
      t.textContent = stamp(r.tick);
      const b = document.createElement('span');
      b.className = 'evlog__text';
      b.textContent = r.text;
      row.append(t, b);
      return row;
    }));
  }

  return {
    push(tick, text, kind) {
      rows.unshift({ tick, text, kind });
      if (rows.length > MAX_ROWS) rows.length = MAX_ROWS;
      render();
    },
    clear() { rows.length = 0; render(); },
    get count() { return rows.length; },
  };
}
