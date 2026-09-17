/**
 * ui/scout/submit.js — 탐사 보고서 (탐사 전용).
 *
 * 왜 따로인가:
 *   달리기 챌린지의 제출 화면(ui/panels/submit.js)은 기록 · 목표 달성 · 이탈 · 규칙 위반을
 *   전제로 짜여 있다. 탐사에는 그 넷이 전부 없다. 공통 함수로 뽑으면 다섯 챌린지가 이 경로를
 *   타게 되므로 뽑지 않는다. **중복은 감수한다.** 합치는 것은 나중 차수의 일이다.
 *
 * 사진은 어디에도 넣지 않는다(원칙 7). 보고서에 들어가는 것은 숫자와 글자뿐이다.
 * 실명을 유도하지 않는다 — 받는 것은 표시 이름 하나이고 브라우저에만 남는다.
 * 채점이 없으므로 점수도 순위도 목표치도 적지 않는다. 있는 그대로의 수치만 싣는다.
 */

const KEY = 'dtc:v1:scout:report';

export function createSubmitPanel({ mount, challenge, gather }) {
  const conf = challenge.submit;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // 사람이 쓴 것만 브라우저에 남긴다. 서버로 가는 길이 이 파일에 없다.
  let human = {};
  try { human = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { human = {}; }

  mount.innerHTML = `
    <div class="rep" data-el="rep" hidden>
      <div class="rep__box">
        <div class="rep__head">
          <b>${esc(conf.title)}</b>
          <button class="rep__x" type="button" data-el="rep-close" aria-label="닫기">✕</button>
        </div>
        <div class="rep__body">
          <div class="rep__badge" data-el="rep-badge"></div>

          <div class="rep__sec">
            <div class="rep__sectitle">${esc(conf.engine_title)}</div>
            <div data-el="rep-engine"></div>
          </div>

          <div class="rep__sec">
            <div class="rep__sectitle">${esc(conf.human_title)}</div>
            <p class="rep__note">${esc(conf.name_note)}</p>
            ${conf.fields.map((f) => {
              if (f.kind === 'check') {
                return `<label class="rep__check"><input type="checkbox" data-field="${f.id}"> ${esc(f.label)}</label>`;
              }
              const tag = f.kind === 'textarea'
                ? `<textarea data-field="${f.id}" rows="3" placeholder="${esc(f.placeholder || '')}"></textarea>`
                : `<input type="text" data-field="${f.id}" placeholder="${esc(f.placeholder || '')}">`;
              return `<label class="rep__field"><span>${esc(f.label)}</span>${tag}</label>`;
            }).join('')}
          </div>

          <p class="rep__note rep__note--strong">${esc(conf.no_photo)}</p>
        </div>
      </div>
    </div>`;

  const el = (n) => mount.querySelector(`[data-el="${n}"]`);

  mount.querySelectorAll('[data-field]').forEach((node) => {
    const id = node.dataset.field;
    if (node.type === 'checkbox') node.checked = !!human[id];
    else node.value = human[id] || '';
    node.addEventListener('input', () => {
      human[id] = node.type === 'checkbox' ? node.checked : node.value;
      try { localStorage.setItem(KEY, JSON.stringify(human)); } catch (_) { /* 저장 못 해도 화면은 돈다 */ }
    });
  });

  /** 엔진이 채우는 다섯. 사람이 손댈 수 없고 수치는 전부 엔진·계산이 낸 값이다. */
  function renderEngine(d) {
    const rows = [];
    rows.push(`<div class="rep__block"><b>탐사 일지</b>
      <table class="rep__t"><thead><tr>${challenge.log.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>
      ${d.log.length ? d.log.slice().reverse().map((o) => `<tr>
        <td>${o.t.toFixed(1)}초</td>
        <td>${o.found.length ? o.found.map((x) => esc(x.name)).join(' · ') : esc(challenge.log.unknown)}</td>
        <td>${o.conf}%</td>
        <td><span class="rep__tile">${o.cells.map((c) => `<i style="background:${esc(c)}"></i>`).join('')}</span></td>
        <td>${esc(o.cmd)}</td></tr>`).join('') : `<tr><td colspan="5">${esc(challenge.log.empty)}</td></tr>`}
      </tbody></table></div>`);

    rows.push(`<div class="rep__block"><b>학습 지표</b>
      <div class="rep__kv">${d.train
        ? `<span>맞힘 <b>${Math.round(d.train.acc * 100)}%</b></span>
           <span>표본 <b>${d.train.n}장</b></span>
           <span>클래스 <b>${d.train.sets.length}종</b></span>
           <span>지문 <b>${esc(d.train.hash)}</b></span>
           <span>적용 <b>${d.applied ? '함' : '안 함'}</b></span>`
        : '<span>아직 학습하지 않았습니다.</span>'}</div></div>`);

    rows.push(`<div class="rep__block"><b>도달 단계</b>
      <div class="rep__kv"><span>${esc(d.stageLabel)}</span></div></div>`);

    rows.push(`<div class="rep__block"><b>반응 표</b>
      <table class="rep__t"><thead><tr>${challenge.stages.table.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>
      ${d.table.map((r) => `<tr>
        <td><span class="rep__cn"><i style="background:${esc(r.color)}"></i>${esc(r.name)}</span></td>
        <td>${esc(r.action)}</td><td>${esc(String(r.speed))}</td><td>${esc(String(r.hold))}</td></tr>`).join('')}
      </tbody></table></div>`);

    rows.push(`<div class="rep__block"><b>코드 전문</b><pre class="rep__code">${esc(d.code)}</pre></div>`);
    el('rep-engine').innerHTML = rows.join('');
  }

  function open() {
    const d = gather();
    const nick = (human.nickname || '').trim() || conf.nickname_default;
    el('rep-badge').innerHTML = `<b>${esc(nick)}</b> · ${esc(conf.badge
      .replace('{{obs}}', d.log.length)
      .replace('{{cls}}', d.train ? d.train.sets.length : d.classCount)
      .replace('{{stage}}', d.stageLabel.replace(/\s.*$/, '')))}`;
    renderEngine(d);
    el('rep').hidden = false;
  }

  function close() { el('rep').hidden = true; }

  el('rep-close').addEventListener('click', close);
  el('rep').addEventListener('click', (e) => { if (e.target === el('rep')) close(); });

  return { open, close };
}
