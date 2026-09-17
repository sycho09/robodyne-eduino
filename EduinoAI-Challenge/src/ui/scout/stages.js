/**
 * ui/scout/stages.js — 세 단계 · 반응 표 · 표에서 나오는 코드.
 *
 *   ① 수동 탐사   사람이 몰고 관측을 쌓는다
 *   ② 반응 표     "무엇을 보면 무엇을 한다" 를 표로 정한다
 *   ③ 코드        그 표가 그대로 코드가 된다
 *
 * 열림 조건도, 행동 목록도, 행동마다의 코드 한 줄도 전부 매니페스트(stages)가 소유한다.
 * 이 파일은 표를 코드로 옮기는 규칙만 안다.
 *
 * "그 밖에" 줄은 표에 고정으로 있고 학생이 지울 수 없다. 그것이 ③에서 else 가 된다 —
 * 배운 것이 하나도 안 보일 때 무엇을 할지 정하지 않은 코드는 실물에서 그대로 멈춰 선다.
 *
 * ③에서 손으로 고친 코드를 표로 되돌리는 길은 없다. **표가 원본이다.**
 * 그래서 코드 칸은 읽기 전용이고, 화면이 그 사실을 적는다.
 */

export function createStages({ mount, challenge, classes, onStage }) {
  const conf = challenge.stages;
  const codeConf = conf.code;
  const actions = conf.actions;
  const byAction = new Map(actions.map((a) => [a.id, a]));
  /** 클래스 이름 → { action, speed, hold_s }. 이름을 바꿔도 값이 따라오도록 이름을 열쇠로 쓴다. */
  const rules = new Map();
  let stage = conf.order[0];

  mount.innerHTML = `
    <div class="stages" data-el="stage-tabs">
      ${conf.order.map((id) => `<button type="button" class="stages__b" data-stage="${id}">${conf.labels[id]}</button>`).join('')}
    </div>
    <div class="stage" data-el="stage-manual">
      <p class="stage__lead" data-el="manual-lead"></p>
      <!-- ①의 본문은 수집·학습·결과다. 페이지가 그 블록을 여기에 넣는다. -->
      <div data-el="manual-slot"></div>
    </div>
    <div class="stage" data-el="stage-table" hidden>
      <table class="rt">
        <thead><tr>${conf.table.columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody data-el="rt-body"></tbody>
      </table>
      <p class="stage__lead">${conf.table.note}</p>
    </div>
    <div class="stage" data-el="stage-code" hidden>
      <pre class="code" data-el="code"></pre>
      <p class="stage__lead">${codeConf.note}</p>
    </div>`;

  const el = (n) => mount.querySelector(`[data-el="${n}"]`);

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const ruleOf = (name) => {
    if (!rules.has(name)) {
      const d = conf.table.defaults;
      rules.set(name, { action: d.action, speed: d.speed, hold_s: d.hold_s });
    }
    return rules.get(name);
  };

  /** 살아 있는 클래스가 전부 표에 한 줄씩 채워졌는가. ③이 열리는 조건이다. */
  const tableFilled = () => {
    const L = classes.live();
    return L.length > 0 && L.every((c) => rules.has(c.name));
  };

  /* ---------- ② 반응 표 ---------- */
  function renderTable() {
    const body = el('rt-body');
    const L = classes.live();
    body.innerHTML = L.map((c, i) => {
      const r = ruleOf(c.name);
      const act = byAction.get(r.action) || actions[0];
      return `<tr data-i="${i}">
        <td><span class="rt__cn"><i style="background:${esc(c.color)}"></i>${esc(c.name)}</span></td>
        <td><select data-el="rt-act">${actions.map((a) => `<option value="${a.id}"${a.id === r.action ? ' selected' : ''}>${a.label}</option>`).join('')}</select></td>
        <td><input data-el="rt-spd" value="${r.speed}" inputmode="numeric"${act.uses_speed ? '' : ' disabled'}></td>
        <td><input data-el="rt-hold" value="${r.hold_s}" inputmode="decimal"${act.hold ? '' : ' disabled'}></td>
      </tr>`;
    }).join('') + `
      <tr class="rt__else">
        <td><span class="rt__cn"><i style="background:#c2c8d0"></i>${esc(conf.otherwise.label)}</span></td>
        <td>${esc(conf.otherwise.action_label)}</td>
        <td>${conf.otherwise.speed}</td>
        <td>—</td>
      </tr>`;

    body.querySelectorAll('tr[data-i]').forEach((tr) => {
      const c = L[Number(tr.dataset.i)];
      const r = ruleOf(c.name);
      tr.querySelector('[data-el="rt-act"]').addEventListener('change', (e) => {
        r.action = e.target.value;
        renderTable();
        renderCode();
        refresh();
      });
      tr.querySelector('[data-el="rt-spd"]').addEventListener('input', (e) => { r.speed = e.target.value; renderCode(); });
      tr.querySelector('[data-el="rt-hold"]').addEventListener('input', (e) => { r.hold_s = e.target.value; renderCode(); });
    });
  }

  /* ---------- ③ 코드 ---------- */
  /** 표를 코드 줄로 옮긴다. 부르는 API 는 전부 매니페스트가 준 것이고 로더가 문서와 대조한다. */
  function codeLines() {
    const L = classes.live();
    const v = codeConf.var;
    const lines = ['void setup() {', `  ${codeConf.begin_call};`, '}', '', 'void loop() {', `  int ${v} = ${codeConf.classify_call};`, ''];
    L.forEach((c, i) => {
      const r = ruleOf(c.name);
      const a = byAction.get(r.action) || actions[0];
      // 클래스 번호는 1부터다. 0 은 "모름" 이라 else 로 간다.
      lines.push(`  ${i ? 'else ' : ''}if (${v} == ${i + 1}) {   // ${c.name}`);
      lines.push(`    ${a.code.replace(/%s/g, String(r.speed))}`);
      const hold = parseFloat(r.hold_s);
      if (a.hold && hold > 0) lines.push(`    delay(${Math.round(hold * 1000)});`);
      lines.push('  }');
    });
    lines.push('  else {', `    ${conf.otherwise.code}`, '  }', '}');
    return lines;
  }

  function renderCode() {
    const lines = codeLines();
    el('code').innerHTML = lines.map((l) => esc(l)
      .replace(/\/\/.*$/, (m) => `<span class="code__cm">${m}</span>`)
      .replace(/\b(void|int|if|else|setup|loop)\b/g, '<span class="code__kw">$1</span>')
      .replace(/(-?\d+)/g, '<span class="code__n">$1</span>')).join('\n');
  }

  /* ---------- 열림 조건 ---------- */
  function openState(ctx) {
    const o = conf.open;
    const t = o.table || {};
    const canTable = (!t.needs_model || !!ctx.model) && classes.live().length > 0
      && ctx.observations >= (t.min_observations || 0);
    const canCode = canTable && (!o.code.table_filled || tableFilled());
    return { manual: true, table: canTable, code: canCode };
  }

  let ctx = { model: null, observations: 0 };

  function refresh() {
    const can = openState(ctx);
    mount.querySelectorAll('[data-stage]').forEach((b) => {
      const id = b.dataset.stage;
      b.disabled = !can[id];
      b.classList.toggle('is-on', id === stage);
      b.textContent = conf.labels[id] + (can[id] ? '' : ` ${conf.locked_mark}`);
    });
    const t = (conf.open.table || {});
    const need = [];
    if (t.needs_model && !ctx.model) need.push('모델을 적용해야');
    if (ctx.observations < (t.min_observations || 0)) need.push(`관측 ${t.min_observations - ctx.observations}건 더`);
    el('manual-lead').textContent = can.table
      ? '②가 열렸습니다. 무엇을 보면 무엇을 할지 표로 정해 보세요.'
      : `②를 열려면 — ${need.join(' · ')}`;
    if (onStage) onStage(stage, can);
  }

  function go(id) {
    const can = openState(ctx);
    if (!can[id]) return;
    stage = id;
    el('stage-manual').hidden = id !== 'manual';
    el('stage-table').hidden = id !== 'table';
    el('stage-code').hidden = id !== 'code';
    if (id === 'table') renderTable();
    if (id === 'code') renderCode();
    refresh();
  }

  mount.querySelectorAll('[data-stage]').forEach((b) => b.addEventListener('click', () => go(b.dataset.stage)));

  /** 바깥이 상태를 알려 준다 — 모델이 붙었는지, 관측이 몇 건인지. */
  function update(next) {
    ctx = { ...ctx, ...next };
    if (stage === 'table') renderTable();
    if (stage === 'code') renderCode();
    refresh();
  }

  go('manual');

  return {
    /** ①의 본문 자리. 페이지가 수집·학습·결과 블록을 여기에 넣는다. */
    manualSlot: () => el('manual-slot'),
    update,
    stage: () => stage,
    /** 지금 도달한 가장 높은 단계. 제출 보고서가 적는다. */
    reached: () => {
      const can = openState(ctx);
      if (can.code) return 'code';
      if (can.table) return 'table';
      return 'manual';
    },
    label: (id) => conf.labels[id],
    /** 제출 보고서가 그대로 싣는 표와 코드. */
    tableRows: () => classes.live().map((c) => {
      const r = ruleOf(c.name);
      const a = byAction.get(r.action) || actions[0];
      return { name: c.name, color: c.color, action: a.label, speed: a.uses_speed ? r.speed : '—', hold: a.hold ? r.hold_s : '—' };
    }).concat([{ name: conf.otherwise.label, color: '#c2c8d0', action: conf.otherwise.action_label, speed: conf.otherwise.speed, hold: '—' }]),
    codeText: () => codeLines().join('\n'),
  };
}
