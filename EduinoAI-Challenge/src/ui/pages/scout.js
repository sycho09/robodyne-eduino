/**
 * ui/pages/scout.js — 스마트탐사 챌린지 화면 (57차 · 묶음1).
 *
 * 왜 별도 화면인가:
 *   달리기 챌린지의 화면은 트랙 · 랩타임 · 채점을 전제로 짜여 있다. 탐사에는 그 셋이
 *   전부 없고 대신 4분할과 조종이 있다. 같은 화면에 얹으면 다섯 챌린지가 이 변경을 함께
 *   맞는다 — 그래서 갈랐다. 중복은 감수한다. 합치는 것은 나중 차수의 일이다.
 *
 * 결정론: 이 화면은 결정론이 성립하지 않는다. 사람이 조종하고 실물 카메라가 입력이다.
 *   랩타임도 순위도 만들지 않는다. 다른 챌린지의 결정론은 이 예외와 무관하다.
 *
 * 원칙 7: 프레임은 화면 안에서만 돈다. 저장·전송 경로가 이 파일에 존재하지 않는다.
 *
 * 묶음1 — 카메라 어댑터 · 4분할 · 조종과 안전.
 * 묶음2 — 수집 → 학습 → 적용 · 다중 인식.
 * 묶음3 — 탐사 일지 · 추정 경로 · 세 단계 · 제출.
 */

import { loadCatalog, loadChallenge } from '../../challenges/loader.js';
import { escapeHtml } from '../shell.js';
import { createCameraAdapter, FAIL, LINK, CMD } from '../scout/adapter.js';
import { createQuad } from '../scout/quad.js';
import { createControl } from '../scout/control.js';
import { createClassPanel } from '../scout/classes.js';
import { createResultPanel } from '../scout/result.js';
import { computePca, detect, extractFeature, fingerprint, learningCurve, loocv, sharpness } from '../scout/ml.js';
import { createLogPanel } from '../scout/log.js';
import { createStages } from '../scout/stages.js';
import { createSubmitPanel } from '../scout/submit.js';

const LINK_WORD = {
  [LINK.OFF]: '꺼짐',
  [LINK.OPENING]: '여는 중',
  [LINK.ON]: '연결됨',
  [LINK.LOST]: '끊김',
  [LINK.UNSUPPORTED]: '쓸 수 없음',
};

export async function mountChallenge(root, { kitId, challengeId }) {
  const catalog = await loadCatalog();
  const entry = catalog.challenges.find((c) => c.kit_id === kitId && c.challenge_id === challengeId);
  if (!entry) throw new Error(`챌린지를 찾을 수 없습니다: ${kitId}/${challengeId}`);
  const { challenge } = await loadChallenge(entry);
  const ui = challenge.scene.ui;

  document.title = `${challenge.title} · Challenge Digital Twin`;

  // 화면 구조는 목업(scout-v8)을 그대로 따른다 — 3열 300 / 1fr / 320.
  //   좌  단계 탭 → (①수집 · 학습하기 · 학습 결과 · 적용하기 / ②반응 표 / ③코드)
  //   중앙 4분할 + 그 아래 한 줄 바
  //   우  탐사 일지 → 추정 경로 → 조종 리모컨
  root.innerHTML = `
  <div class="shell scout" data-el="shell">
    <header class="appbar">
      <div class="brand">EduinoAI 챌린지 게시판</div>
      <div class="appbar__spacer"></div>
      <a class="btn btn--quiet" href="/" data-link="/">게시판 돌아가기</a>
    </header>

    <div class="chbar">
      <b class="chbar__title">${escapeHtml(challenge.title)}</b>
      <span class="badge">탐사</span>
      <span class="chbar__goal">${escapeHtml(challenge.scene.summary)}</span>
      <div class="chbar__spacer"></div>
      <!-- 버튼이 아니다. 이 챌린지에 기록·순위가 없다는 안내 문구다. -->
      <span class="scout__nore">${escapeHtml(challenge.mission.no_score)}</span>
      <button class="btn btn--quiet" type="button" data-el="report-open">탐사 보고서</button>
    </div>

    <div class="scout__row3">
      <div class="scout__tool">
        <select class="tbtn" data-el="src-pick" aria-label="무엇으로 볼지">
          ${(challenge.camera_sources || [challenge.camera_source])
            .map((id) => `<option value="${id}"${id === challenge.camera_source ? ' selected' : ''}>${escapeHtml((challenge.source_labels || {})[id] || id)}</option>`).join('')}
        </select>
        <input class="tinput" type="text" inputmode="url" data-el="host"
               placeholder="${escapeHtml(challenge.device.host_placeholder)}"
               aria-label="${escapeHtml(challenge.device.host_label)}" hidden>
        <button class="tbtn" type="button" data-el="cam-start">카메라 연결</button>
      </div>
      <div class="scout__hl">
        <div class="seg"><span class="seg__k">링크</span><b class="seg__v" data-el="hl-link">—</b></div>
        <div class="seg"><span class="seg__k">스트림</span><b class="seg__v" data-el="hl-fps">— fps</b></div>
        <div class="seg"><span class="seg__k">센서</span><b class="seg__v is-hot" data-el="hl-sensor">—</b></div>
        <div class="seg"><span class="seg__k">선명도</span><b class="seg__v" data-el="hl-sharp">—</b></div>
        <div class="seg"><span class="seg__k">관측</span><b class="seg__v" data-el="hl-obs">0건</b></div>
        <div class="seg"><span class="seg__k">이동</span><b class="seg__v" data-el="hl-dist">0.0 m</b></div>
        <div class="seg"><span class="seg__k">단계</span><b class="seg__v" data-el="hl-stage">—</b></div>
      </div>
    </div>

    <div class="scout__grid">
      <div class="scout__colL" data-el="stages"></div>

      <div class="scout__colC">
        <div class="quad" data-el="quad"></div>
        <p class="camsay" data-el="cam-state">아직 켜지 않았습니다.</p>
        <div class="cbar" data-el="cbar"></div>
      </div>

      <div class="scout__colR">
        <div data-el="log"></div>
        <div class="scout__pad" data-el="pad"></div>
      </div>
    </div>
  </div>
  <div data-el="report"></div>`;

  const el = (n) => root.querySelector(`[data-el="${n}"]`);

  // 소스는 매니페스트가 처음 값을 주고, 그 뒤로는 학생이 고른다.
  // 코드에 기본값은 여전히 없다 — 매니페스트가 말하지 않으면 아무것도 고를 수 없다.
  let source = challenge.camera_source;
  let adapter = createCameraAdapter(source, challenge.device);

  // 추정 자세. 명령을 적분한 값이고 측정값이 아니다 — 화면 어디서도 "위치" 라고 부르지 않는다.
  const pose = { x: 0, y: 0, h: -Math.PI / 2 };
  const trail = [{ x: 0, y: 0 }];
  let dist = 0;
  const drive = challenge.drive;
  const startedAt = performance.now();
  let moving = false;

  const quad = createQuad({ mount: el('quad'), ui, heading: () => pose.h });

  /* ---------- 수집 → 학습 → 적용 ---------- */
  const spec = challenge.scout;
  // 지문을 뽑는 작업용 캔버스. 30x30 짜리 하나를 돌려 쓴다 — 촬영마다 만들면 쓰레기가 쌓인다.
  const [SW, SH] = ui.sample_px;
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = SW;
  sampleCanvas.height = SH;
  const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  const cellCanvas = document.createElement('canvas');
  cellCanvas.width = SW;
  cellCanvas.height = SH;
  const cellCtx = cellCanvas.getContext('2d', { willReadFrequently: true });

  // 단계 칸은 좌측 열 골격이라 클래스 칸보다 먼저 서야 한다. 그런데 클래스 목록을 읽어야 하므로
  // 자리만 먼저 잡아 두고, 클래스 칸이 만들어진 뒤 여기에 꽂는다.
  const classesRef = { live: () => [] };
  let lastTrain = null;      // 학습만 한 결과
  let model = null;          // [적용하기] 를 눌러 실제로 인식에 쓰는 것
  let dets = [];
  let nowFeature = null;
  // 기기 영상이 CORS 없이 들어오면 캔버스가 더러워져 픽셀을 읽는 순간 터진다.
  // 한 번 그렇게 되면 다시 시도해도 같으므로, 표시해 두고 픽셀을 읽는 세 곳이 모두 이것을 본다.
  let tainted = false;

  /**
   * 지금 보는 것의 지문. 프레임이 없으면 null 이다.
   * 기기 영상이 CORS 없이 들어오면 캔버스가 더러워져 픽셀을 읽는 순간 터진다.
   * 그때는 조용히 넘기지 않고 무엇이 막혔는지 화면에 말한다 — 펌웨어를 고쳐야 하는 경우다.
   */
  function featureNow() {
    if (!quad.hasFrame() || tainted) return null;
    try {
      return extractFeature(quad.workCanvas(), sampleCtx, spec);
    } catch (_) {
      tainted = true;
      el('cam-state').textContent = failLine(FAIL.CORS);
      el('cam-state').classList.add('is-bad');
      return null;
    }
  }

  // 단계 칸을 먼저 세운다 — 좌측 열 자체가 단계 칸이고, ①의 본문 자리에 수집·학습·결과가 들어간다.
  const stages = createStages({ mount: el('stages'), challenge, classes: { live: () => classesRef.live() } });
  const slot = stages.manualSlot();
  slot.innerHTML = `
    <div class="lsec"><div class="lsec__t">데이터 수집</div><div data-el="classes"></div></div>
    <div class="lsec"><div class="lsec__t">학습 결과</div><div data-el="result"></div></div>`;
  const sel = (n) => slot.querySelector(`[data-el="${n}"]`);

  // 결과 칸을 먼저 만든다. 클래스 칸은 만들어지는 도중에 이미 onChange 를 한 번 부르는데,
  // 그때 결과 칸이 없으면 아직 만들어지지 않은 이름을 건드리게 된다.
  const result = createResultPanel({ mount: sel('result'), challenge });
  // 같은 이유로 [적용하기] 버튼은 만들어진 뒤에 붙잡는다.
  let applyBtn = null;

  const classes = createClassPanel({
    mount: sel('classes'),
    challenge,
    capture: () => {
      if (!quad.hasFrame()) return { ok: false, reason: '카메라가 켜져 있어야 담을 수 있습니다.' };
      try {
        const gray = quad.grayNow();
        const [gw, gh] = quad.graySize();
        // 남기는 것은 지문 하나뿐이다. 프레임도 줄인 그림도 담지 않는다(원칙 7).
        return { ok: true, feature: extractFeature(quad.workCanvas(), sampleCtx, spec), sharp: sharpness(gray, gw, gh) };
      } catch (_) {
        // 기기 영상이 CORS 없이 들어오면 픽셀을 읽을 수 없다. 표본을 받지 않고 이유를 말한다.
        tainted = true;
        return { ok: false, reason: failLine(FAIL.CORS) };
      }
    },
    onChange: () => {
      // 표본이나 이름이 바뀌면 학습 결과가 낡는다. 화면이 그 사실을 말한다.
      result.setTrain(lastTrain, model, lastTrain ? fingerprint(classes.snapshot()) : null);
      if (applyBtn) applyBtn.disabled = !lastTrain;
    },
  });
  classesRef.live = () => classes.live();
  applyBtn = classes.applyButton();
  applyBtn.disabled = true;
  // 목업 순서대로 [적용하기] 는 학습 결과 뒤에 선다.
  slot.append(classes.applyRow());
  stages.update({ model: null, observations: 0 });

  classes.trainButton().addEventListener('click', () => {
    const sets = classes.snapshot();
    const full = loocv(sets, spec.knn_k);
    lastTrain = {
      acc: full.acc, n: full.n, cm: full.cm,
      // 학습 곡선은 표본 1장·2장… 각각 LOOCV 를 실제로 다시 돌린 값이다. 에폭 곡선이 아니다.
      curve: learningCurve(sets, spec.knn_k),
      hash: fingerprint(sets), sets,
    };
    result.setTrain(lastTrain, model, lastTrain.hash);
    applyBtn.disabled = false;
    classes.say(`학습했습니다 — 맞힘 ${Math.round(full.acc * 100)}% · 표본 ${full.n}장.`
      + ' [적용하기] 를 눌러야 인식이 돕니다.');
  });

  applyBtn.addEventListener('click', () => {
    if (!lastTrain) return;
    model = { sets: lastTrain.sets, hash: lastTrain.hash, pca: computePca(lastTrain.sets) };
    dets = [];
    result.setTrain(lastTrain, model, fingerprint(classes.snapshot()));
    classes.say(`적용했습니다 — 지문 ${model.hash}. 객체 인식 칸이 이제 알아봅니다.`);
    pushStageState();
  });

  const log = createLogPanel({ mount: el('log'), challenge, pose, trail });

  const report = createSubmitPanel({
    mount: el('report'),
    challenge,
    // 엔진이 채우는 다섯을 여기서 모은다. 사람이 손댈 수 없는 값들이다.
    gather: () => ({
      log: log.rows(),
      train: lastTrain,
      applied: !!model,
      classCount: classes.live().length,
      stageLabel: stages.label(stages.reached()),
      table: stages.tableRows(),
      code: stages.codeText(),
    }),
  });
  el('report-open').addEventListener('click', () => report.open());

  /** 단계가 읽는 상태 — 모델이 붙었는지, 관측이 몇 건인지. */
  function pushStageState() {
    stages.update({ model, observations: log.count() });
    el('hl-obs').textContent = `${log.count()}건`;
    el('hl-stage').textContent = stages.label(stages.reached());
  }

  // 센서 칸은 매니페스트가 "카메라가 아니라고" 적어 둔 화면들을 그대로 읽어 적는다.
  {
    const missing = (ui.quad.options || []).filter((o) => o.sensor !== 'camera').map((o) => o.label);
    el('hl-sensor').textContent = missing.length ? `${missing.join('·')} ${ui.quad.no_sensor_label}` : '전부 연결됨';
  }

  const control = createControl({
    padMount: el('pad'),
    barMount: el('cbar'),
    challenge,
    // 소스를 바꾸면 어댑터가 갈린다. 객체가 아니라 "지금 것" 을 돌려주는 함수를 준다.
    getAdapter: () => adapter,
    onObserve: () => {
      if (adapter.status().link !== LINK.ON || !quad.hasFrame()) {
        el('cam-state').textContent = '카메라가 켜져 있어야 관측할 수 있습니다.';
        return;
      }
      // 남기는 것은 지문에서 뽑은 아홉 칸 색과 숫자뿐이다. 사진은 남지 않는다(원칙 7).
      const feature = featureNow();
      if (!feature) { el('cam-state').classList.add('is-bad'); return; }
      const found = model
        ? dets.map((d) => ({
          name: model.sets[d.ci].name, color: model.sets[d.ci].color,
          conf: Math.round(d.conf * 100), n: d.n,
        }))
        : [];
      log.add({ feature, found, cmd: cmdWord(control.lastCmd()), elapsed: (performance.now() - startedAt) / 1000 });
      pushStageState();
      el('cam-state').textContent = found.length
        ? `관측 — ${found.map((o) => `${o.name} ${o.conf}%`).join(' · ')}`
        : `관측 — ${challenge.log.unknown}${model ? '' : ' (아직 모델을 적용하지 않았습니다)'}`;
    },
    // 명령 표시는 control 이 두 자리(아래 줄 · 리모컨 머리)에서 스스로 한다. 여기서 또 적지 않는다.
  });

  function cmdWord(cmd) {
    return { forward: '앞으로', back: '뒤로', left: '왼쪽', right: '오른쪽', stop: '정지' }[cmd] || '정지';
  }

  /** 왜 안 됐는지 한 줄. 문장은 매니페스트가 갖고 여기서는 갈래만 고른다. */
  function failLine(f) {
    const msg = (challenge.device.errors || {})[f];
    return msg || '연결하지 못했습니다.';
  }

  function paintSourceUi() {
    const isDevice = source === 'device';
    el('host').hidden = !isDevice;
    el('cam-start').textContent = isDevice ? challenge.device.connect_label : '카메라 연결';
    el('cam-state').textContent = isDevice ? challenge.device.hint : '아직 켜지 않았습니다.';
    el('cam-state').classList.remove('is-bad');
  }

  el('src-pick').addEventListener('change', (e) => {
    adapter.stop();
    source = e.target.value;
    adapter = createCameraAdapter(source, challenge.device);
    el('cam-start').hidden = false;
    paintSourceUi();
  });

  el('cam-start').addEventListener('click', async () => {
    el('cam-state').classList.remove('is-bad');
    el('cam-state').textContent = source === 'device' ? '연결하는 중입니다…' : '카메라를 여는 중입니다…';
    const r = await adapter.start(el('host').value);
    if (r.ok) {
      el('cam-state').textContent = source === 'device'
        ? `연결됐습니다. 영상은 이 화면 안에서만 돕니다 — ${adapter.status().host}`
        : '카메라가 켜졌습니다. 프레임은 이 화면 밖으로 나가지 않습니다.';
    } else {
      el('cam-state').textContent = r.fail ? failLine(r.fail) : (r.reason || '연결하지 못했습니다.');
      el('cam-state').classList.add('is-bad');
    }
    el('cam-start').hidden = !!r.ok;
    pushStageState();
  });

  paintSourceUi();

  /* ---------- 재생 루프 ---------- */
  // 시뮬 tick 이 아니다. 여기에는 고정 timestep 이 없다 — 실시간 카메라가 입력이기 때문이다.
  const CAM_MS = 1000 / challenge.limits.camera_hz;
  const DETECT_MS = 1000 / challenge.limits.detect_hz;
  let raf = null;
  let lastPaint = 0;
  let lastDetect = 0;
  let lastT = performance.now();
  let disposed = false;

  function loop(now) {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;

    const state = control.tick(now);
    // 추정 경로 — 명령을 적분한다. 매니페스트가 준 속도만 쓴다.
    const pct = state.speedPct / 100;
    if (state.cmd === CMD.LEFT) pose.h -= drive.turn_rad_s * pct * dt;
    if (state.cmd === CMD.RIGHT) pose.h += drive.turn_rad_s * pct * dt;
    const v = state.cmd === CMD.FORWARD ? drive.forward_mm_s * pct
      : state.cmd === CMD.BACK ? -drive.reverse_mm_s * pct : 0;
    if (v) {
      pose.x += Math.cos(pose.h) * v * dt;
      pose.y += Math.sin(pose.h) * v * dt;
      dist += Math.abs(v) * dt;
      const last = trail[trail.length - 1];
      if (Math.hypot(pose.x - last.x, pose.y - last.y) > 2) trail.push({ x: pose.x, y: pose.y });
    }
    moving = v !== 0 || state.cmd === CMD.LEFT || state.cmd === CMD.RIGHT;

    // 3행 상태 줄. 같은 값을 두 곳에 두지 않는다 — 링크·스트림은 여기 한 곳에만 있다.
    const st = adapter.status();
    el('hl-link').textContent = st.reason || LINK_WORD[st.link] || st.link;
    el('hl-link').classList.toggle('is-ok', st.link === LINK.ON);
    el('hl-link').classList.toggle('is-hot', st.link !== LINK.ON);
    // 기기 소스는 프레임 수를 셀 수 없다(크롬이 MJPEG 의 매 프레임마다 load 를 쏘지 않는다).
    // 없는 수를 지어내지 않는다 — 대신 그림이 바뀌고 있는지와 지연을 적는다.
    el('hl-fps').textContent = st.link !== LINK.ON ? '— fps'
      : (st.fps !== null && st.fps !== undefined ? `${st.fps} fps · ${st.latency_ms}ms`
        : `${st.frozen ? '영상 멎음' : '영상 옴'} · ${st.latency_ms}ms`);
    el('hl-fps').classList.toggle('is-hot', !!st.frozen);
    if (st.frozen && !el('cam-state').classList.contains('is-bad')) {
      el('cam-state').textContent = failLine(FAIL.NO_FRAME);
      el('cam-state').classList.add('is-bad');
    }
    el('hl-dist').textContent = `${(dist / 1000).toFixed(1)} m`;

    // 카메라 칸은 매니페스트가 정한 주기로만 다시 그린다. rAF 마다 그리면 화면이 프레임을
    // 따라잡느라 다른 일을 못 한다 — 55차에 색상제어 화면에서 겪은 것과 같은 자리다.
    if (now - lastPaint >= CAM_MS) {
      lastPaint = now;
      quad.paint(adapter.frame(), {
        moving,
        waiting: st.link === LINK.UNSUPPORTED ? st.reason : '카메라를 켜면 여기에 보입니다.',
        model, dets, grid: spec.grid, boxNote: spec.box_note,
      });
      nowFeature = featureNow();
      result.paint(nowFeature);
      log.paintPath();
      // 선명도는 표본을 받을지 정하는 값이라 늘 보이게 둔다.
      const gray = quad.grayNow();
      if (gray) {
        const [gw, gh] = quad.graySize();
        el('hl-sharp').textContent = String(sharpness(gray, gw, gh));
      }
    }

    // 다중 인식은 카메라보다 성기게 돈다 — 아홉 칸을 매번 다시 재면 화면이 그것만 한다.
    if (model && quad.hasFrame() && !tainted && now - lastDetect >= DETECT_MS) {
      lastDetect = now;
      try { dets = detect(model, quad.workCanvas(), cellCtx, spec); }
      catch (_) { tainted = true; dets = []; }
    }
  }
  raf = requestAnimationFrame(loop);

  return function dispose() {
    disposed = true;
    if (raf !== null) cancelAnimationFrame(raf);
    control.dispose();
    adapter.stop();
  };
}
