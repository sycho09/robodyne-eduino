/**
 * ui/panels/hud.js — 기록 패널 (현재 시도 / 베스트 / 성장 이력 / 챌린지 규칙).
 *
 * 표시되는 수치는 전부 엔진이 만든 값이다. 여기서 시간을 계산하지 않는다.
 * 변경점 문구도 코드에서 기계적으로 뽑은 것만 쓴다(자연어 생성 금지).
 * 이력을 지우는 경로는 없다. 비교 불가능한 구버전 기록은 지우지 않고 표시만 구분한다.
 */

import { SIM_STATUS, currentLapTicks } from '../../engine/sim.js';
import { formatTicks } from '../../engine/clock.js';
import { ENGINE_VERSION, SCORING_VERSION } from '../../engine/version.js';
import { wordsOf } from '../words.js';
import { isComparable } from '../storage.js';
import { judgedPointsOf } from '../../engine/decisions.js';
import { API_REGISTRY } from '../../runtime/api.js';

const METRIC_LABEL = { best_lap_time: '최고 기록', lap_time: '한 바퀴 기록', offtrack_count: '코스 벗어남', lap_count: '돈 바퀴' };

const END_LABEL = { offtrack: '코스 벗어남 초과', timeout: '시간 초과', no_progress: '앞으로 못 감' };

const SIM_STATUS_RUNNING = SIM_STATUS.RUNNING;

export function createRecordPanel({ mounts, challenge, store, onLoadCode, onSaveNote, onThumb }) {
  let briefTiles = null;
  let briefStatic = { laps: 1, timeoutS: 0, off: 0 };
  const challengeVersion = challenge.version;
  // 채점되는 자리의 수. 세는 규칙은 엔진이 하나로 들고 있다.
  const judgedTotal = judgedPointsOf(challenge);
  // 같은 값을 두 곳에서 다르게 부르지 않는다. 말은 매니페스트가 고른다.
  const word = wordsOf(challenge);

  // 세로로 쌓으면 계기판만으로 열이 다 찬다. 큰 시계 하나 + 작은 칸 셋을 2열로 앉힌다.
  mounts.gauge.innerHTML = `
    <div class="gauges gauges--grid">
      <div class="gauge gauge--accent gauge--wide">
        <div class="gauge__label">지금 한 바퀴</div>
        <div class="gauge__value" data-field="current">0.000<span class="gauge__unit">초</span></div>
        <div class="gauge__label" data-field="lap-state">출발 대기</div>
      </div>
      <div class="gauge" data-el="offtrack-gauge">
        <div class="gauge__label">코스 벗어남</div>
        <div class="gauge__value gauge__value--sm" data-field="offtrack">0<span class="gauge__unit">회</span></div>
      </div>
      <div class="gauge">
        <div class="gauge__label">돈 바퀴</div>
        <div class="gauge__value gauge__value--sm" data-field="laps">0<span class="gauge__unit">바퀴</span></div>
      </div>
      <div class="gauge${judgedTotal ? '' : ' gauge--wide'}" data-el="violation-gauge"${judgedTotal ? '' : ' hidden'}>
        <div class="gauge__label">규칙 위반</div>
        <div class="gauge__value gauge__value--sm" data-field="violations">0<span class="gauge__unit">/ ${judgedTotal}</span></div>
      </div>
    </div>`;

  const f = (name) => mounts.gauge.querySelector(`[data-field="${name}"]`);
  const fields = {
    current: f('current'), offtrack: f('offtrack'), laps: f('laps'),
    lapState: f('lap-state'), violations: f('violations'),
  };
  const offtrackGauge = mounts.gauge.querySelector('[data-el="offtrack-gauge"]');
  const violationGauge = mounts.gauge.querySelector('[data-el="violation-gauge"]');

  /**
   * 최고 기록 자격. "규칙을 어기지 않고 가장 빠르게" 가 목표인데 위반이 있는 주행이 1등이면
   * 목표와 순위가 어긋난다. 조건은 매니페스트(scoring.best_requires)가 소유하고,
   * 그 절이 없는 챌린지는 지금까지처럼 모든 완주 기록이 후보다.
   */
  const bestNeeds = (challenge.scoring && challenge.scoring.best_requires) || null;
  // 첫 render() 보다 먼저 있어야 한다. 뒤에 두면 기록이 있는 학생 화면에서만 터진다 —
  // 기록이 없으면 filter 가 eligible 을 한 번도 부르지 않아 그냥 지나간다.

  // 접어 둔 구버전 묶음의 펼침 상태. 첫 렌더보다 먼저 만들어져 있어야 한다.
  const foldOpen = new Set();

  renderBriefing();
  render();

  function comparableRows() {
    return store.history.filter((r) => isComparable(r, ENGINE_VERSION, challengeVersion, SCORING_VERSION));
  }

  function eligible(r) {
    if (!bestNeeds) return true;
    if (bestNeeds.violations !== undefined && (r.violations || 0) > bestNeeds.violations) return false;
    // 이동제어 4종은 규칙 위반 대신 코스 이탈이 자격을 가른다. 어느 쪽을 볼지는 매니페스트가 정한다.
    if (bestNeeds.offtrack !== undefined && (r.offtrack || 0) > bestNeeds.offtrack) return false;
    return true;
  }
  function bestRow() {
    const rows = comparableRows().filter(eligible);
    return rows.length ? rows.reduce((a, b) => (a.ticks <= b.ticks ? a : b)) : null;
  }

  function setValue(el, text, unit) {
    if (el) el.innerHTML = `${text}<span class="gauge__unit">${unit}</span>`;
  }

  function update(sim) {
    updateBoard(sim);
    setValue(fields.current, formatTicks(currentLapTicks(sim)), '초');
    setValue(fields.offtrack, String(sim.offtrack.count), '회');
    setValue(fields.laps, String(sim.lap.count), '바퀴');
    if (offtrackGauge) offtrackGauge.classList.toggle('gauge--danger', sim.offtrack.count > 0);
    if (judgedTotal) {
      const bad = violationsOf(sim);
      setValue(fields.violations, String(bad), `/ ${judgedTotal}`);
      if (violationGauge) violationGauge.classList.toggle('gauge--danger', bad > 0);
    }
    if (fields.lapState) {
      fields.lapState.textContent = sim.lap.started
        ? `${sim.lap.count + 1}바퀴째 달리는 중`
        : '출발 준비 — 결승선을 처음 지나면 기록 시작';
    }
  }

  // ── 베스트 ────────────────────────────────────────────────
  function renderBest(pendingNote) {
    const best = bestRow();
    const box = document.createElement('div');
    box.className = 'best';

    if (!best) {
      const older = store.history.some((r) => !r.ended && typeof r.ticks === 'number');
      box.innerHTML = older
        ? '<div class="best__none">아직 없음 — 지금 규칙으로 완주한 기록이 없어요. 이전 규칙 기록은 아래 성장 이력에 남아 있어요.</div>'
        : '<div class="best__none">아직 기록이 없어요. 코드를 고치고 한 바퀴 돌아 보세요.</div>';
      mounts.best.replaceChildren(box);
      return;
    }

    const note = store.notes[best.snapshot];
    box.innerHTML = `
      <div class="best__row">
        <span class="best__time">${formatTicks(best.ticks)}<span>초</span></span>
        <span class="log__meta">${word('offtrack')} ${best.offtrack}회</span>
      </div>
      ${note ? `<div class="best__note">${esc(note)}</div>` : ''}
      ${sparkline(comparableRows())}
      <div class="btn-row"><button class="btn" data-el="load-best">코드 불러오기</button></div>`;

    const loadBtn = box.querySelector('[data-el="load-best"]');
    if (loadBtn) loadBtn.addEventListener('click', () => requestLoad(best));

    if (pendingNote) box.append(noteForm(pendingNote));
    mounts.best.replaceChildren(box);
  }

  /** 베스트를 갱신했을 때만 뜨는 한 줄 회고. 건너뛸 수 있고 강제하지 않는다. */
  function noteForm({ snapshot, changes }) {
    const form = document.createElement('form');
    form.className = 'note-form';
    form.innerHTML = `
      <div class="note-form__diff">${changes.length ? esc(changes.join(' · ')) : '변경점 없음'}</div>
      <label class="gauge__label">무엇을 왜 바꿨나요? (선택)</label>
      <input type="text" maxlength="100" placeholder="예: 코너에서 밀려서 회전 delay 를 늘림" data-el="note-input" />
      <div class="note-form__row">
        <button class="btn btn--primary" type="submit">저장</button>
        <button class="btn" type="button" data-el="skip">건너뛰기</button>
      </div>`;
    const input = form.querySelector('[data-el="note-input"]');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (text) onSaveNote(snapshot, text);
      render();
    });
    form.querySelector('[data-el="skip"]').addEventListener('click', () => render());
    return form;
  }

  /** 베스트 추이. 엔진이 준 tick 값만 쓴다. */
  function sparkline(rows) {
    if (rows.length < 2) return '';
    let best = Infinity;
    const series = rows.map((r) => { best = Math.min(best, r.ticks); return best; });
    const max = Math.max(...series);
    const min = Math.min(...series);
    const span = Math.max(1, max - min);
    const w = 100;
    const h = 30;
    const pts = series.map((v, i) => {
      const x = series.length === 1 ? 0 : (i / (series.length - 1)) * w;
      const y = h - ((max - v) / span) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const last = pts[pts.length - 1].split(',');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <path d="M${pts.join(' L')}" vector-effect="non-scaling-stroke"></path>
      <circle cx="${last[0]}" cy="${last[1]}" r="1.8"></circle></svg>`;
  }

  // ── 성장 이력 ─────────────────────────────────────────────
  function renderHistory() {
    const rows = store.history;
    if (rows.length === 0) {
      mounts.history.innerHTML = store.solutionSeenAt
        ? '<div class="log__solution">해답을 열어봤습니다.</div><div class="log__empty">아직 달린 적이 없어요. 코드를 적용하면 여기에 쌓입니다.</div>'
        : '<div class="log__empty">아직 달린 적이 없어요. 코드를 적용하면 여기에 쌓입니다.</div>';
      return;
    }
    const list = document.createElement('div');
    list.className = 'log';

    // 미완주(ended) 기록은 애초에 비교 대상이 아니다 — 구버전이 아니므로 접지 않는다.
    const isLegacy = (row) => !row.ended && !isComparable(row, ENGINE_VERSION, challengeVersion, undefined);
    // 채점 규칙이 바뀌기 전 기록. 지우지도 고치지도 않고 어느 규칙으로 잰 것인지만 밝힌다.
    const isOldRule = (row) => !row.ended && row.scoring_version !== SCORING_VERSION;

    function makeItem(row) {
      const legacy = isLegacy(row);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `log__item${row.ended ? ' log__item--incomplete' : ''}`;
      const changes = Array.isArray(row.changes) && row.changes.length ? row.changes.join(' · ') : '바꾼 것 없음';
      const meta = row.ended
        ? `미완주 · ${END_LABEL[row.ended] || '시간 초과'}`
        : `${row.attempt}번째 · ${word('offtrack')} ${row.offtrack}회${legacy ? ' · 옛 기록' : ''}${isOldRule(row) ? ' · 이전 규칙' : ''}`;
      item.innerHTML = `
        <span>
          <span class="log__change">${esc(changes)}</span><br>
          <span class="log__meta">${esc(meta)}</span>
        </span>
        <span class="log__delta ${deltaClass(row)}">${deltaText(row)}</span>`;
      item.addEventListener('click', () => requestLoad(row));
      return item;
    }

    // 구버전 기록은 지우지 않는다. 연속 구간을 접어 'N건' 한 줄로만 보여주고, 누르면 펼친다.
    function appendFold(group) {
      const key = group[0].hash + ':' + group.length;
      const box = document.createElement('div');
      box.className = 'log__fold';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'log__foldtoggle';
      const body = document.createElement('div');
      body.className = 'log__foldbody';
      group.forEach((row) => body.append(makeItem(row)));
      const sync = () => {
        const open = foldOpen.has(key);
        body.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        toggle.innerHTML = `<span>옛 기록 ${group.length}건</span><span class="log__foldmark">${open ? '접기' : '펼치기'}</span>`;
      };
      toggle.addEventListener('click', () => {
        if (foldOpen.has(key)) foldOpen.delete(key); else foldOpen.add(key);
        sync();
      });
      sync();
      box.append(toggle, body);
      list.append(box);
    }

    let pending = [];
    const flush = () => { if (pending.length) { appendFold(pending); pending = []; } };
    rows.slice().reverse().forEach((row) => {
      if (isLegacy(row)) { pending.push(row); return; }
      flush();
      list.append(makeItem(row));
    });
    flush();

    // 해답을 열어본 사실은 기록 맨 위에 남는다. 되돌릴 수 없다 — 채점이 정직해야 한다.
    if (store.solutionSeenAt) {
      const seen = document.createElement('div');
      seen.className = 'log__solution';
      seen.textContent = `해답을 열어봤습니다 · ${new Date(store.solutionSeenAt).toLocaleDateString('ko-KR')}`;
      list.prepend(seen);
    }

    mounts.history.replaceChildren(list);
  }

  function deltaText(row) {
    if (row.ended || typeof row.ticks !== 'number') return '—';
    if (typeof row.delta !== 'number') return `${formatTicks(row.ticks)}s`;
    const sign = row.delta < 0 ? '−' : '+';
    return `${formatTicks(row.ticks)}s ${sign}${formatTicks(Math.abs(row.delta))}`;
  }

  function deltaClass(row) {
    if (row.ended || typeof row.delta !== 'number' || row.delta === 0) return 'log__delta--flat';
    return row.delta < 0 ? 'log__delta--down' : 'log__delta--up';
  }

  function requestLoad(row) {
    const snap = row.snapshot && store.snapshots[row.snapshot];
    if (!snap) return;
    if (!window.confirm('이 시도의 코드를 에디터로 불러옵니다. 지금 코드는 사라집니다. 계속할까요?')) return;
    onLoadCode(snap.code);
  }

  // ── 미션 브리핑 (매니페스트에서 자동 생성 — 손으로 쓴 문장을 두지 않는다) ──
  function renderBriefing() {
    const t = challenge.scene.track;
    const trim = challenge.motor_trim;
    const markers = challenge.scene.markers || [];
    const uneven = !!trim && (trim.left !== trim.right);

    const shape = t.shape === 'polyline'
      ? `${t.points.length}구간 직각 코스 · 중심선 ${polylineLength(t.points)}mm`
      : `정사각 코스 · 한 변 ${t.center_side_mm}mm`;
    // 상황은 한 줄이다. 긴 설명은 힌트(접힘)로 내린다 — 상황판이 계기판으로 읽혀야 한다.
    const situation = `${shape} · 폭 ${t.width_mm}mm`;
    const extra = [];
    if (uneven) extra.push('이 킷은 좌우 모터 특성이 조금 다르다. 그대로 달리면 휜다.');
    if (challenge.ml) {
      extra.push(`카메라로 담은 장면으로 ${challenge.ml.classes.join(' · ')} 를 구분한다. 학습은 [학습] 탭에서 하고, 코드에는 추론만 나온다.`);
      extra.push('샘플이 적으면 틀린다 — 골고루 많이 담을수록 정확해진다.');
    } else if (challenge.camera_source === 'webcam') {
      extra.push('웹캠에 비친 색 물체가 조종기다. 모둠이 함께 하는 활동이다 — 한 사람은 물체, 한 사람은 코드.');
      extra.push('코스 옆 표지판은 카메라를 못 쓸 때 대신 쓰는 것이다.');
    } else if (markers.length) {
      extra.push(`코너마다 색 마커가 ${markers.length}개 놓여 있다.`);
    }

    const goal = [`${challenge.mission.laps}바퀴 완주 · ${METRIC_LABEL[challenge.scoring.primary] || challenge.scoring.primary} 줄이기`];
    goal.push(`${word('offtrack')} ${challenge.rules.offtrack.max_events}회 또는 ${Math.round(challenge.rules.timeout.sim_ticks / 100)}초를 넘기면 끝`);
    if (challenge.rules.no_progress) {
      goal.push(`${Math.round(challenge.rules.no_progress.sim_ticks / 100)}초 동안 앞으로 못 가도 끝`);
    }

    const baseHint = challenge.ml
      ? '[학습] 탭에서 [카메라 켜기] 를 누르고, 담을 칸을 고른 뒤 [이 장면 담기] 를 누른다. 세 칸을 모두 모으면 [학습하기] 가 열린다.'
      : challenge.camera_source === 'webcam'
      ? '먼저 [카메라 켜기] 를 누른다. 그다음 슬라이더로 색을 맞추고 [이 값을 코드에 넣기] 를 누른다. GAIN 은 꺾는 크기, DEAD 는 무시할 흔들림이다.'
      : uneven
      ? 'setMotor(왼쪽, 오른쪽) 으로 좌우 PWM 을 따로 줄 수 있다. 직진을 맞춘 뒤 회전 시간을 다시 잡는다.'
      : markers.length
        ? 'cameraArea() 가 커지면 코너가 가깝다는 뜻이다. cameraOffset() 부호로 돌 방향을 정한다.'
        : '속도를 올리면 같은 거리를 가는 시간이 줄어든다. 직진 delay 도 함께 줄여야 한다.';
    const hint = [...extra, baseHint].join(' ');

    // 상황판 — 텍스트 대신 타일. 주행 중에는 같은 타일이 실시간으로 바뀐다.
    const timeoutS = Math.round(challenge.rules.timeout.sim_ticks / 100);
    const tiles = [
      { key: 'laps', icon: '🏁', label: '완주 목표', value: String(challenge.mission.laps), unit: '바퀴' },
      { key: 'time', icon: '⏱', label: '제한 시간', value: String(timeoutS), unit: '초' },
      { key: 'off', icon: '⚠', label: '허용 이탈', value: String(challenge.rules.offtrack.max_events), unit: '회' },
    ];
    const zoneTotal = judgedTotal;
    if (zoneTotal) {
      tiles.push({ key: 'zones', icon: '🚦', label: '판단 지점', value: String(zoneTotal), unit: '곳' });
    }
    mounts.briefing.innerHTML = `
      <div class="hudboard">
        <div class="hudboard__top">
          <canvas class="hudboard__thumb" data-el="brief-thumb" width="132" height="92"></canvas>
          <p class="hudboard__lede">${esc(situation)}</p>
        </div>
        <div class="hudboard__tiles">
          ${tiles.map((t) => `
            <div class="hudtile" data-tile="${t.key}">
              <span class="hudtile__icon">${t.icon}</span>
              <span class="hudtile__label">${esc(t.label)}</span>
              <b class="hudtile__value" data-el="tile-${t.key}">${t.value}</b>
              <span class="hudtile__unit" data-el="unit-${t.key}">${t.unit}</span>
            </div>`).join('')}
        </div>
        <div class="hudboard__goal">${esc(goal.join(' · '))}</div>
        <details class="hudboard__hint"><summary>힌트</summary><p>${esc(hint)}</p></details>
      </div>`;
    briefTiles = {
      laps: mounts.briefing.querySelector('[data-el="tile-laps"]'),
      time: mounts.briefing.querySelector('[data-el="tile-time"]'),
      off: mounts.briefing.querySelector('[data-el="tile-off"]'),
      unitLaps: mounts.briefing.querySelector('[data-el="unit-laps"]'),
      unitTime: mounts.briefing.querySelector('[data-el="unit-time"]'),
      unitOff: mounts.briefing.querySelector('[data-el="unit-off"]'),
      zones: mounts.briefing.querySelector('[data-el="tile-zones"]'),
      unitZones: mounts.briefing.querySelector('[data-el="unit-zones"]'),
      labelZones: mounts.briefing.querySelector('[data-tile="zones"] .hudtile__label'),
      root: mounts.briefing.querySelector('.hudboard'),
      thumb: mounts.briefing.querySelector('[data-el="brief-thumb"]'),
    };
    briefStatic = { laps: challenge.mission.laps, timeoutS, off: challenge.rules.offtrack.max_events, zones: zoneTotal };
    if (onThumb && briefTiles.thumb) onThumb(briefTiles.thumb);
  }

  /**
   * 주행 중에는 상황판이 계기판이 된다 — 남은 시간·현재 바퀴·이탈 횟수가 그 자리에서 바뀐다.
   * 값은 전부 sim 에서 읽는다.
   */
  /** 지금까지의 위반 횟수. 판단 지점과 장애물을 합쳐 센다 — 학생이 보는 것은 하나의 숫자다. */
  function violationsOf(sim) {
    const d = sim.decisionRun ? sim.decisionRun.violations : 0;
    const o = sim.obstacleRun ? sim.obstacleRun.violations : 0;
    return d + o;
  }

  function updateBoard(sim) {
    if (!briefTiles || !briefTiles.root) return;
    const running = sim.status === SIM_STATUS_RUNNING && sim.tick > 0;
    briefTiles.root.classList.toggle('is-live', running);
    if (!running) {
      briefTiles.laps.textContent = String(briefStatic.laps);
      briefTiles.unitLaps.textContent = '바퀴';
      briefTiles.time.textContent = String(briefStatic.timeoutS);
      briefTiles.unitTime.textContent = '초';
      briefTiles.off.textContent = String(briefStatic.off);
      briefTiles.unitOff.textContent = '회';
      if (briefTiles.zones) {
        briefTiles.labelZones.textContent = '판단 지점';
        briefTiles.zones.textContent = String(briefStatic.zones);
        briefTiles.unitZones.textContent = '곳';
        briefTiles.zones.classList.remove('is-warn');
      }
      return;
    }
    const left = Math.max(0, challenge.rules.timeout.sim_ticks - sim.tick);
    briefTiles.laps.textContent = `${sim.lap.count}/${briefStatic.laps}`;
    briefTiles.unitLaps.textContent = '바퀴';
    briefTiles.time.textContent = (left / 100).toFixed(1);
    briefTiles.unitTime.textContent = '초 남음';
    briefTiles.off.textContent = `${sim.offtrack.count}/${briefStatic.off}`;
    briefTiles.unitOff.textContent = '회';
    briefTiles.time.classList.toggle('is-warn', left <= 500);
    briefTiles.off.classList.toggle('is-warn', sim.offtrack.count > 0);
    if (briefTiles.zones) {
      // 몇 곳을 맞혔는지가 아니라 몇 번 어겼는지를 센다. 목표는 0 이다.
      const bad = violationsOf(sim);
      briefTiles.labelZones.textContent = '규칙 위반';
      briefTiles.zones.textContent = `${bad}/${briefStatic.zones}`;
      briefTiles.unitZones.textContent = '회';
      briefTiles.zones.classList.toggle('is-warn', bad > 0);
    }
  }

  // ── 챌린지 규칙 카드 (매니페스트에서 자동 생성) ──────────────

  function render(pendingNote) {
    renderBest(pendingNote);
    renderHistory();
  }

  return {
    update,
    render,
    /** 베스트를 갱신했으면 회고 입력을 함께 띄운다. */
    afterRecord({ isBest, snapshot, changes }) {
      render(isBest ? { snapshot, changes } : undefined);
    },
    bestTicks: () => (bestRow() ? bestRow().ticks : null),
    /** 이 주행이 최고 기록 후보가 되는가. 자격 규칙은 한 군데(매니페스트)에만 둔다. */
    isEligible: (row) => eligible(row || {}),
    /**
     * 최근 완주 기록 몇 건. 지금 채점 규칙으로 비교할 수 있는 것만 낸다(34차 확정).
     * 54차 — 회차와 이탈 수, 최고 여부를 함께 낸다. 화면이 배지를 붙이려면 필요한 값이고,
     * 어느 것도 여기서 새로 세지 않는다 — 저장된 행에 적힌 그대로다.
     */
    recentRuns(n) {
      const rows = comparableRows().filter((r) => r.ticks > 0);
      const best = bestRow();
      return rows.slice(-n).reverse().map((r) => ({
        ticks: r.ticks,
        offtrack: r.offtrack || 0,
        violations: r.violations || 0,
        no: rows.indexOf(r) + 1,
        isBest: !!best && r.snapshot === best.snapshot && r.ticks === best.ticks,
      }));
    },
  };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}


function polylineLength(points) {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return Math.round(total);
}
