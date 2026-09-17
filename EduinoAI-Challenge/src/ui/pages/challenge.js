/**
 * main.js — 앱 조립 + 재생 루프.
 *
 * 재생 루프 규칙 (2차에서 수정한 핵심):
 *   시뮬 진행량은 "프레임 수"가 아니라 "실제 경과 시간"이 정한다.
 *   프레임당 몇 tick 까지만 돌린다는 상한을 두면(이전 구현) 프레임레이트가 떨어질수록
 *   시뮬이 정비례해 느려진다. 실측에서 7.6fps 환경이 목표의 15% 밖에 못 냈다.
 *   그래서 max_catchup_ms 를 "프레임당 시뮬 계산에 쓸 수 있는 실제 작업시간"으로 쓴다.
 *   1 tick 계산은 수 마이크로초라 20ms 예산이면 수천 tick 을 따라잡을 수 있고,
 *   저프레임 환경에서도 초당 100 tick 을 유지한다.
 *
 *   배속(1x/2x/4x)은 소비하는 시뮬 시간을 배로 늘릴 뿐이다. tick 수열은 그대로이므로
 *   랩타임(=tick 계측)은 배속과 무관하게 항상 같다.
 *
 *   숨겨진 탭에서는 브라우저가 rAF 를 강제로 멈춘다(우회 불가). 그래서 탭이 숨겨지면
 *   자동으로 일시정지하고, 돌아오면 그 지점에서 이어서 재생한다.
 */

import { TICK_MS, formatTicks } from '../../engine/clock.js';
// 자취는 엔진이 이 간격(tick)으로 남긴다. 구간 시간을 되짚을 때 쓴다.
const TRAIL_EVERY = 2;
/** 57-C 파트3 — 저장할 주행 자취의 표본 간격(tick). 5 tick = 50ms 고정. */
const PATH_EVERY = 5;
import { SIM_STATUS, createSim, currentLapTicks, resetSim, scoreRun, stepSim } from '../../engine/sim.js';
import { EVENT } from '../../engine/events.js';
import { API_REGISTRY } from '../../runtime/api.js';
import { compileProgram } from '../../runtime/sandbox.js';
import { loadCatalog, loadChallenge, loadKitCatalog } from '../../challenges/loader.js';
import { loadAssets } from '../assets.js';
import { buildShell, escapeHtml } from '../shell.js';
import { wordsOf, formatGoal } from '../words.js';
import { createStore, codeHash } from '../storage.js';
import { diffCode, formatDiff } from '../../runtime/codediff.js';
import { ENGINE_VERSION, ENGINE_SEED, SCORING_VERSION } from '../../engine/version.js';
import { createEditor } from '../panels/editor.js';
import { createTrackView } from '../panels/track.js';
import { createCameraView } from '../panels/camera.js';
import { createWebcamVision } from '../webcam.js';
import { readCamera, setExternalCamera } from '../../engine/camera.js';
import { ML, classifyFeature, extractFeature, setMlReading } from '../../engine/ml.js';
import { decisionState, decisionSummary, judgedPointsOf } from '../../engine/decisions.js';
import { nearestOnPath } from '../../engine/autopilot.js';
import { createTrain } from '../panels/train.js';
import { createFirstPerson } from '../panels/firstperson.js';
import { createCityIso } from '../panels/cityiso.js';
import { createEventLog } from '../panels/eventlog.js';
import { obstacleSummary, obstacleState, obstacleAt, OBSTACLE } from '../../engine/obstacles.js';
import { signalColorOf } from '../../engine/decisions.js';
import { createRecordPanel } from '../panels/hud.js';
import { createMinimap } from '../panels/minimap.js';
import { createSubmit } from '../panels/submit.js';
import { createQuest } from '../panels/quest.js';

const STATUS_LABEL = {
  [SIM_STATUS.IDLE]: '준비',
  [SIM_STATUS.RUNNING]: '주행 중',
  [SIM_STATUS.ERROR]: '실행 오류',
  [SIM_STATUS.TIMEOUT]: '시간 초과',
  [SIM_STATUS.ENDED]: '달리기 끝',
  [SIM_STATUS.FINISHED]: '종료',
};

/** 밀린 시뮬 시간의 상한(ms). 여기 걸릴 만큼 밀리면 따라잡기를 포기하고 현재부터 진행한다. */
const MAX_BACKLOG_MS = 1000;
/** 난이도 이름. 값은 카탈로그의 difficulty 가 소유하고 여기서는 한국어 이름만 붙인다. */
const DIFF_LABEL = { basic: '초급', intermediate: '중급', advanced: '상급', expert: '심화' };
const CODE_SAVE_DEBOUNCE_MS = 400;

/**
 * 챌린지 화면. 라우터가 kitId/challengeId 를 넘겨준다.
 * 반환하는 dispose() 로 재생 루프와 리스너를 정리한다 — 화면을 떠나도 루프가 남으면 안 된다.
 */
export async function mountChallenge(root, { kitId, challengeId }) {
  const dev = new URLSearchParams(location.search).get('dev') === '1';
  // 54차 파트M — fps 계기. 주소에 ?fps=1 이 붙었을 때만 켠다.
  const showFps = new URLSearchParams(location.search).get('fps') === '1';
  let everRan = false;

  const [catalog, kitCatalog] = await Promise.all([loadCatalog(), loadKitCatalog()]);
  // 킷이 하나뿐이면 허브와 킷 화면이 같은 화면이다. 같은 곳을 가리키는 조각을 둘 두지 않는다.
  const soleKit = (kitCatalog.kits || []).length === 1;
  const entry = catalog.challenges.find((c) => c.kit_id === kitId && c.challenge_id === challengeId);
  if (!entry) throw new Error(`챌린지를 찾을 수 없습니다: ${kitId}/${challengeId}`);
  const { challenge, kit } = await loadChallenge(entry);
  const store = createStore(challenge.kit_id, challenge.challenge_id);

  // 에셋(수 MB)은 기다리지 않는다. 빈 슬롯으로 UI 를 먼저 띄우고 뒤에서 채운다.
  // 렌더러는 슬롯이 비면 형상 플레이스홀더로 그리므로 첫 화면부터 정상 동작한다.
  const assetHolder = { current: { resolve: () => null, meta: () => null, missing: [] } };
  const assets = {
    resolve: (ref) => assetHolder.current.resolve(ref),
    meta: (ref) => assetHolder.current.meta(ref),
    get missing() { return assetHolder.current.missing; },
  };

  // 탭 제목은 챌린지 제목을 따라간다. 전 챌린지가 같은 제목을 쓰면 여러 탭을 구분할 수 없다.
  document.title = `${challenge.title} — Challenge Digital Twin`;

  const el = buildShell(root, {
    title: challenge.title,
    // 브레드크럼 마지막 조각은 짧은 이름을 쓴다. 긴 제목은 헤더 가운데에 이미 크게 나와
    // 있어서, 여기에 또 적으면 자리도 없고 말줄임으로 끊겨 읽힌다(47차-4).
    crumb: (entry && entry.track_label) || challenge.title,
    kitId: challenge.kit_id, challengeId: challenge.challenge_id,
    kitName: kit.name,
    soleKit,
  });

  // 레이아웃도 매니페스트가 고른다. 관제 대시보드는 스마트시티에서만 켜진다.
  const dashboard = challenge.scene.layout === 'dashboard';

  const sim = createSim({ challenge, kit });
  // 살아 있는 도시 레이어는 아이소 배경 위에 얹힌다. 스마트시티에서만 붙는다.
  const cityIso = challenge.scene.obstacles ? createCityIso(assets) : null;
  const view = createTrackView({
    canvas: el.canvas,
    assets,
    cityIso,
    dev,
    // 시뮬 위에 얹힌 계기 카드가 차지한 자리. 캔버스 좌표로 바꿔서 넘긴다 —
    // 도시 이름표가 그 위에 겹쳐 쓰지 않게 한다(54차 보강6-4).
    overlays: () => {
      const base = el.canvas.getBoundingClientRect();
      const boxes = [];
      for (const node of [el.simctl, el.simsay, el.simmotor, el.simcolor, el.simsee, el.simsheet]) {
        if (!node || node.hidden || !node.isConnected) continue;
        const r = node.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        boxes.push([r.left - base.left, r.top - base.top, r.right - base.left, r.bottom - base.top]);
      }
      return boxes;
    },
  });
  // 51차 — 1단(원본 화면)에 무엇이 오는지는 매니페스트가 정한다.
  //   webcam → 실물 웹캠 영상 (색으로 조종하기)
  //   sim    → RC카가 보는 시뮬 화면 (코스 위 마커가 보이는 시점)
  // 관제 대시보드는 예전부터 1인칭을 썼고 그것이 곧 sim 이다.
  const camSource = challenge.camera_source || null;
  const simCamera = camSource === 'sim';
  const fpv = (dashboard || simCamera) ? createFirstPerson({ canvas: el.fpvCanvas, challenge }) : null;
  const eventLog = dashboard ? createEventLog({ mount: el.eventlogMount }) : null;
  if (dashboard) {
    el.shell.classList.add('shell--dashboard');
    // 메인은 RC카를 따라가는 아이소메트릭 화면이다. 1인칭은 오른쪽 카메라 패널로 간다.
    el.viewTitle.textContent = '트랙 — RC카를 따라가는 화면';
    el.camviewFpv.hidden = false;
    el.fpvRead.hidden = false;
    // 54차 파트M — 전체 뷰 자리에 클리어 현황판이 온다.
    el.clearSection.hidden = false;
    el.eventlogSection.hidden = false;
    // 탑뷰는 현황판이 대신한다 — 숨기지 말고 DOM 에서 들어낸다.
    el.minimapSection.remove();
    // 미션 브리핑은 기본 접힘 — 살아 있는 계기가 먼저 보여야 한다.
    el.briefingFold.open = false;
    // 54차 파트M — 오른쪽 칸은 현황판 · 카메라 2단 · 이벤트 순이다.
    // 기록은 시뮬 옆 시트로 내려가고, 계기판 카드는 그 시트와 같은 값을 두 번 적어 들어낸다.
    const rail = el.clearSection.parentElement;
    const head = rail.firstElementChild;
    const attempt = el.gaugeMount.closest('.pane__section');
    if (attempt) attempt.remove();
    el.simsheet.hidden = false;
    el.simsee.hidden = false;
    for (const node of [el.clearSection, el.camview, el.eventlogSection]) {
      if (node) rail.insertBefore(node, head);
    }
  }

  // ── 화면 구성은 매니페스트가 정한다(scene.ui). 필드가 없으면 지금까지의 화면 그대로다.
  // 다른 챌린지의 매니페스트에는 이 절이 없으므로 한 줄도 달라지지 않는다.
  const ui = challenge.scene.ui || {};
  // 목표 배너의 네 칸. 매니페스트에 없으면 배너 자체를 세우지 않는다.
  const GOAL_KEYS = ['goal', 'limit', 'fail', 'record'];
  const goalCells = GOAL_KEYS
    .map((k) => [k, (ui.goal_banner || {})[k]])
    .filter(([, cell]) => cell && cell.label && cell.text);
  const word = wordsOf(challenge);
  /**
   * 55차 보강8 E — 지점 앞에서 '무엇을 해야 하는지' 를 미리 보여 줄지. 매니페스트가 소유한다.
   * 판단 지점이 없는 계열에는 이 키가 아예 없다 — 가릴 정답이 없기 때문이다.
   * 지나간 뒤에는 현황판이 요구와 실제를 나란히 보여 준다(D). 가리는 것은 '앞' 뿐이다.
   */
  const revealExpect = !!ui.reveal_expect;
  const hideCode = ui.code_panel === false;
  const hiddenCards = new Set(ui.hide_cards || []);

  // ── RC카 킷 스펙 툴팁 ──
  const carTooltip = document.createElement('div');
  carTooltip.className = 'car-tooltip';
  carTooltip.hidden = true;
  carTooltip.innerHTML = `
    <div class="car-tooltip__head">🤖 킷 스펙 — ${kit.name}</div>
    <ul>
      <li>바퀴 속도: ${kit.drive.max_speed_mm_s} mm/s</li>
      <li>차폭: ${kit.body.width_mm}mm</li>
    </ul>
  `;
  el.canvas.parentElement.append(carTooltip);

  el.canvas.addEventListener('click', (e) => {
    if (!view.carScreenPos) return;
    const rect = el.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const [cx, cy] = view.carScreenPos;
    if (Math.hypot(x - cx, y - cy) < 40) {
      e.stopPropagation();
      carTooltip.hidden = !carTooltip.hidden;
    }
  });

  document.addEventListener('click', (e) => {
    if (!carTooltip.hidden && !carTooltip.contains(e.target) && e.target !== el.canvas) {
      carTooltip.hidden = true;
    }
  });

  // 미니 탑뷰를 띄울지는 매니페스트가 정한다(scene.minimap: false 면 이 챌린지에서만 내린다).
  const showMinimap = challenge.scene.minimap !== false;
  const minimap = showMinimap ? createMinimap({ canvas: el.minimapCanvas, assets }) : null;
  // 탑뷰를 쓰지 않는 챌린지에서는 칸을 숨기지 말고 DOM 에서 들어낸다 — 숨겨 두면
  // 크기를 준 적이 없는 캔버스가 기본값으로 자리만 차지한다(53차와 같은 이유).
  if (!showMinimap && el.minimapSection) el.minimapSection.remove();
  // 첫 그리기를 재생 루프에 맡기지 않는다. 진입·리셋·전환·크기 변경 어느 시점에도 코스가 먼저 보여야 한다.
  const paintMinimap = () => { if (!minimap) return; try { minimap.draw(sim); } catch (_) { /* 그리기 실패가 화면을 멈추지 않게 */ } };
  /**
   * 메인 화면을 그 자리에서 다시 그린다. 에셋이 도착한 순간에도 부른다 —
   * 프레임 루프가 어떤 이유로 멈춰 있어도 폴백이 그대로 굳지 않게 하기 위해서다.
   * 그리기가 실패하면 캔버스에는 직전 프레임이 그대로 남는다. 그 상태를 조용히 두면
   * "오류 0인데 화면만 폴백"이 되므로 오류 채널에 한 건 남긴다(37차 파트2 채널).
   */
  // 물리 tick 사이를 화면에서 채운다. prev 는 마지막으로 밟은 tick 직전의 자세,
  // alpha 는 그 tick 을 넘어선 정도다. 렌더 전용이라 물리·판정·기록에 닿지 않는다.
  const lerp = { prev: null, alpha: 0 };
  const repaintView = () => {
    try {
      view.draw(sim, lerp);
      if (!carTooltip.hidden && view.carScreenPos) {
        carTooltip.style.left = `${view.carScreenPos[0]}px`;
        carTooltip.style.top = `${view.carScreenPos[1]}px`;
      }
    } catch (err) {
      noteRenderFault('view-draw', `메인 화면을 그리지 못했습니다: ${err && err.message ? err.message : err}`);
    }
  };
  let briefThumb = null;
  const paintBriefThumb = () => { try { if (briefThumb) briefThumb.draw(sim); } catch (_) { /* 무시 */ } };
  const onResize = () => { paintMinimap(); paintBriefThumb(); };
  // 1인칭·전체뷰 캔버스는 열 폭이 바뀌면 그 자리에서 다시 그린다 — 멈춰 있을 때도 비지 않는다.
  const viewSizer = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      repaintView();
      if (fpv) { try { fpv.draw(sim); } catch (_) { /* 같음 */ } }
    })
    : null;
  if (viewSizer && dashboard) {
    viewSizer.observe(el.canvas.parentElement);
    viewSizer.observe(el.fpvCanvas);
  } else if (viewSizer && simCamera) {
    viewSizer.observe(el.fpvCanvas);
  }
  window.addEventListener('resize', onResize);

  // 모드2 카메라 미니창. 카메라 API 를 여는 챌린지에서만 나온다 — 매니페스트가 결정한다.
  let onCodeApplied = null;   // 코드가 적용될 때 카메라 임계값을 코드값으로 되돌린다
  // ML 챌린지도 카메라 시점 창을 쓴다(추론 결과가 거기에 붙는다).
  const usesCamera = challenge.allowed_api.some((n) => n.startsWith('camera')) || !!challenge.ml;
  const wantsWebcam = challenge.camera_source === 'webcam';
  // 55차 보강4 4-3 — 분류로 판단하는 챌린지의 카메라 두 칸은 '같은 그림 두 장' 이어야 한다.
  // 1단 웹캠 원본, 2단 같은 그림 위에 판단. 색 마스크와 어긋남은 색 추종에서만 뜻이 있다.
  const camClassify = !!challenge.ml && wantsWebcam;
  // 추론기가 낸 값. 화면은 옮기기만 한다 — 특징 벡터도 extractFeature 가 낸 것 그대로다.
  let mlFeature = null;
  // 웹캠 챌린지에서만 실제 카메라를 연다. 카메라가 없으면 '안 보임' 으로 굴러간다(54차).
  const webcam = wantsWebcam ? createWebcamVision() : null;
  // 54차 — 연습 모드는 없앴다. 기록의 키는 남기되 늘 false 다(옛 기록과 모양을 맞춘다).
  const practiceMode = false;

  // 카메라를 열지 않는 챌린지에서는 미니창을 아예 DOM 에서 들어낸다.
  const camView = usesCamera ? createCameraView({
    root: el.camview, canvas: el.camviewCanvas, readout: el.camviewRead,
    toggle: el.camviewToggle, body: el.camviewBody,
    raw: el.camviewRaw, rawCell: el.camviewRawcell, webcam,
    // 2단이 1단의 투영을 따라가게 한다(53차). 시뮬 1단이 없는 챌린지에서는 null 이다.
    plates: () => (fpv ? fpv.plates() : []),
    // 분류 챌린지에서만 넘어간다. 넘어가면 2단이 색 마스크 대신 판단을 그린다.
    classNames: camClassify ? challenge.ml.classes : null,
    reading: () => ({ ...mlLast, feature: mlFeature }),
  }) : null;
  if (camView) camView.show(true); else el.camview.remove();
  if (camView && simCamera) {
    // RC카가 보는 화면이 1단이다. 웹캠 원본 칸은 쓰지 않는다.
    el.camviewFpv.hidden = false;
    el.fpvCap.textContent = 'RC카가 보는 화면';
  }
  // 어긋남 → 조향 → 바퀴 줄은 카메라를 쓰는 챌린지에만 둔다.
  if (camView && !challenge.ml) el.camsteer.hidden = false;
  // 54차 파트L — 웹캠으로 조종하는 챌린지에는 '지금 잡은 색' 계기를 트랙 옆에 둔다.
  // 같은 값(어긋남 · 크기 · 인식률)을 오른쪽 칸에서 또 적지 않는다 — 두 번 적으면
  // 그만큼 카메라 두 칸이 작아지고 오른쪽 칸이 세로로 넘친다.
  if (wantsWebcam && !challenge.ml) {
    el.simcolor.hidden = false;
    el.camsteer.remove();
    el.camviewRead.remove();
  }
  // 54차 보강6-1 — 두 단을 가로로 세울지 세로로 쌓을지는 매니페스트가 고른다.
  // 웹캠 원본은 4:3 이라 세로로 쌓으면 열 폭에 맞춰 납작해진다(실측 300x95 · 3.16:1).
  if (camView && ui.camera_layout === 'row') el.camview.classList.add('camview--row');
  // 54차 보강6-2 — 오른쪽 칸에 남는 자리를 어느 칸이 가져갈지는 매니페스트가 고른다.
  // 넘침을 없애고 나니 이번엔 아래가 비었다(실측 189 · 374px). 챌린지마다 가져갈 칸이 다르다.
  if (ui.right_grow) {
    const grow = {
      minimap: el.minimapSection, record: el.recordPlain, camera: el.camview, clear: el.clearSection,
    }[ui.right_grow];
    if (grow && grow.isConnected) grow.dataset.grow = ui.right_grow;
  }
  // 53차 — 안 쓰는 단은 숨기지 말고 DOM 에서 들어낸다.
  // 숨겨 두면 크기를 준 적이 없는 캔버스가 기본값 300x150 으로 남는다(그려지는 것은 없다).
  if (camView) {
    // 분류 챌린지에서는 1인칭 시뮬 칸을 들어내고 웹캠 원본 칸을 세운다(55차 보강4 4-3).
    if (!fpv || camClassify) el.camviewFpv.remove();
    if (!wantsWebcam || (dashboard && !camClassify)) el.camviewRawcell.remove();
    // 2단 이름표. 색 추종은 '인식 결과'(색 마스크), 분류는 '판단 결과'다.
    if (camClassify && el.camviewMaskcap) el.camviewMaskcap.textContent = '판단 결과';
  }
  // 전체 뷰는 스마트시티 한 종만 쓴다. 나머지에서는 같은 이유로 들어낸다.
  if (!dashboard) el.clearSection.remove();

  // ── ML 학습 챌린지 ──────────────────────────────────────────
  // 학습은 코드가 아니라 워크플로우 단계다. 코드 탭에는 추론 API 만 열려 있다.
  const usesMl = !!challenge.ml;
  const mlClassNames = usesMl ? challenge.ml.classes : [];
  let train = null;            // [학습] 탭
  let mlModel = null;          // 학습된 모델 (없으면 추론은 0=모름)
  let mlLast = { label: 0, confidence: 0, scores: [0, 0, 0] };

  // 슬라이더는 탐색 도구이고, 원본은 언제나 코드다.
  const TARGET_RE = /cameraSetTarget\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*(?:,\s*(-?\d+)\s*)?\)/;
  function targetFromCode() {
    const m = TARGET_RE.exec(editor.getValue());
    if (!m) return null;
    return {
      r: Number(m[1]), g: Number(m[2]), b: Number(m[3]),
      tolerance: m[4] === undefined ? webcam.threshold.tolerance : Number(m[4]),
    };
  }

  if (wantsWebcam) {
    el.camview.classList.add('camview--wide');
    // 관제 대시보드의 1단은 RC카 1인칭이었다. 웹캠 원본 칸을 함께 두면 3단이 된다.
    // 분류 챌린지에서는 1인칭 칸을 들어냈으므로 원본 칸이 1단이다(55차 보강4 4-3).
    el.camviewRawcell.hidden = dashboard && !camClassify;
    el.camtune.hidden = !!challenge.ml;   // ML 챌린지는 색 임계값 대신 학습 결과를 본다
    el.camstate.hidden = false;
    const sliders = { r: el.camR, g: el.camG, b: el.camB, tolerance: el.camTol };
    const readouts = { r: el.camRV, g: el.camGV, b: el.camBV, tolerance: el.camTolV };
    let codeTarget = null;          // 코드에 적힌 값 = 원본

    function paintSliders() {
      const t = webcam.threshold;
      for (const [key, input] of Object.entries(sliders)) {
        input.value = String(t[key]);
        readouts[key].textContent = String(t[key]);
      }
      el.camActive.textContent = `R${t.r} G${t.g} B${t.b} ±${t.tolerance}`;
      const same = codeTarget && ['r', 'g', 'b', 'tolerance'].every((k) => codeTarget[k] === t[k]);
      el.camDiff.hidden = !!same || !codeTarget;
    }

    /** 코드값을 슬라이더와 인식 파이프라인에 그대로 내린다. */
    function adoptCodeTarget() {
      const t = targetFromCode();
      if (!t) return;
      codeTarget = t;
      webcam.setThreshold(t);
      paintSliders();
    }

    for (const [key, input] of Object.entries(sliders)) {
      input.addEventListener('input', () => {
        webcam.setThreshold({ [key]: Number(input.value) });
        paintSliders();
      });
    }
    // 실물 워크플로우: 슬라이더로 찾은 값을 코드에 적어 넣는다.
    el.camApply.addEventListener('click', () => {
      const v = webcam.threshold;
      const next = editor.getValue().replace(
        TARGET_RE,
        `cameraSetTarget(${v.r}, ${v.g}, ${v.b}, ${v.tolerance})`,
      );
      editor.setValue(next);
      store.saveCode(next, starter, starterVersion);
      codeTarget = { ...v };
      paintSliders();
      showNotice('슬라이더 값을 코드에 넣었습니다. [→ 업로드] 를 눌러 보세요.');
    });
    onCodeApplied = adoptCodeTarget;   // [→ 업로드] → 코드값이 다시 원본이 된다

    // ── 카메라 상태: 꺼짐 / 켜는 중 / 켜짐 / 거부됨 ──
    function setCamState(state, reason) {
      const label = { off: '카메라 꺼짐', starting: '카메라 켜는 중…', on: '카메라 켜짐', denied: '카메라 거부됨' }[state];
      el.camStatus.textContent = state === 'denied' && reason ? `${label} — ${reason}` : label;
      el.camStatus.dataset.state = state;
      el.camStart.hidden = state === 'on';
      el.camStart.disabled = state === 'starting';
      // 51차 — 칸은 늘 남긴다. 꺼져 있으면 "카메라를 켜면 여기에 보입니다" 가 그려진다.
      el.camviewRawcell.hidden = dashboard && !camClassify;
      el.camMode.textContent = state === 'on' ? '' : ' · 카메라 필요';
      el.camMode.classList.toggle('chip--warn', state !== 'on');
      // 학습 패널의 잠금 문구는 카메라 상태를 보고 정해진다 — 켜진 순간 다시 그려야 열린다.
      if (train) train.refresh();
    }
    setCamState('off');

    el.camStart.addEventListener('click', async () => {
      setCamState('starting');
      const res = await webcam.start();
      if (res.ok) {
        setCamState('on');
        adoptCodeTarget();
        showNotice('');
      } else {
        setCamState('denied', res.reason);
        showNotice(`${res.reason} 이 챌린지는 카메라에 비친 색으로 조종합니다. 카메라를 허용한 뒤 다시 눌러 주세요.`, 'warn');
      }
    });
  }

  const hud = createRecordPanel({
    mounts: { gauge: el.gaugeMount, best: el.bestMount, history: el.historyMount, briefing: el.briefingMount },
    challenge,
    store,
    onLoadCode: (code) => {
      editor.setValue(code);
      store.saveCode(code, starter, starterVersion);
      applyCode({ autoplay: false });
    },
    onSaveNote: (snapshot, text) => { const ok = store.setNote(snapshot, text); syncStorageChip(); return ok; },
    // 상황판의 코스 썸네일은 미니 탑뷰를 그대로 다시 그린다(형상 정보의 출처를 하나로 둔다).
    onThumb: (canvas) => { briefThumb = createMinimap({ canvas, assets }); paintBriefThumb(); },
  });

  /*
   * 저장된 코드가 옛 판일 때 어떻게 할지 (52-1차 파트A).
   *
   * 손대지 않은 코드는 학생이 만든 것이 아니라 시스템이 넣어 둔 것이다 — 바꿔도 잃는 것이
   * 없고, 그대로 두면 학생 잘못이 아닌 이유로 넘치는 화면을 보게 된다. 조용히 새 판으로 바꾼다.
   * 한 글자라도 손댔으면 그것은 학생의 작업이라 절대 덮지 않는다. 대신 사실을 알리고
   * [새 코드로 바꾸기] 를 옆에 둔다.
   *
   * 손댔는지는 두 가지로 본다 — 저장할 때 함께 적어 둔 스타터 원문과 판 번호다.
   * 글자 비교만으로는 52차 이전에 저장돼 원문이 없는 경우를 가릴 수 없다.
   */
  const starter = challenge.starter_code.source;
  const starterVersion = challenge.starter_code.version;
  let initialCode = store.code === null || store.code === undefined ? starter : store.code;
  let starterNotice = null;
  if (store.code && store.code !== starter) {
    const untouched = store.starterAtSave !== null && store.code === store.starterAtSave;
    if (untouched) {
      initialCode = starter;
      store.saveCode(starter, starter, starterVersion);
    } else {
      starterNotice = '스타터 코드가 새 판으로 바뀌었습니다. 고치신 코드는 그대로 두었습니다.';
    }
  } else if (store.code === starter && store.starterVersion !== starterVersion) {
    // 글자는 같은데 판 번호만 없던 경우. 조용히 판 번호만 적어 둔다.
    store.saveCode(starter, starter, starterVersion);
  }

  let saveTimer = null;
  /**
   * 57-C 파트5 — 상태 띠. 결과만 적는다.
   * 스케치 바이트·퍼센트, COM 포트, 컴파일 진행바는 두지 않는다 —
   * 우리는 실제로 컴파일하지도, 포트를 열지도 않는다. 없는 것을 화면에 만들지 않는다.
   */
  function setEdStat(text, kind = '') {
    el.edStat.textContent = text;
    el.edStat.dataset.kind = kind;
  }

  const editor = createEditor({
    mount: el.editorMount,
    value: initialCode,
    theme: ui.editor_theme,
    onCursor: (line, col) => { el.edPos.textContent = `줄 ${line}, 칸 ${col}`; },
    onChange: (code) => {
      hideResult();   // 코드를 고치는 순간 결과 카드는 물러난다
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => store.saveCode(code, starter, starterVersion), CODE_SAVE_DEBOUNCE_MS);
    },
  });

  // 진입 시 슬라이더 = 코드값. 에디터가 만들어진 다음이어야 한다.
  if (onCodeApplied) onCodeApplied();

  renderApiList(el.apiMount, challenge.allowed_api, ui.api_doc);
  el.apiCount.textContent = `${challenge.allowed_api.length}개`;
  el.assetChip.textContent = '에셋 불러오는 중…';
  el.assetChip.hidden = !dev;   // 학생 화면에는 에셋 상태를 노출하지 않는다
  // 슬롯이 도착하는 대로 화면에 얹는다. 전부 모일 때까지 기다리면 그동안 폴백이 보이고,
  // 콜드 캐시에서는 그 시간이 길다 — 배경 한 장이 왔는데 스프라이트 서른세 장을 기다릴 이유가 없다.
  // 규칙 모달 그림은 이 챌린지 것 넉 장만 받는다. 어느 슬롯인지는 매니페스트가 소유한다.
  const guideSlots = ((challenge.scene.rules || {}).steps || [])
    .map((st) => (typeof st.image === 'string' && st.image.startsWith('slot:') ? st.image.slice(5) : null))
    .filter(Boolean);
  loadAssets({
    include: guideSlots,
    onSlot: (id, api) => {
      assetHolder.current = api;
      view.invalidateAssets();
      repaintView();
      if (id === 'track.square' || id === 'track.tape') paintMinimap();
      // 규칙 창은 첫 진입에 이미 열려 있을 수 있다. 그림이 늦게 오면 점선 자리로 굳는다 —
      // 39차의 그 레이스와 같은 모양이라, 도착하는 대로 다시 그린다.
      if (id.startsWith('guide.') && el.rulesModal && !el.rulesModal.hidden) paintRules();
    },
  }).then((loaded) => {
    assetHolder.current = loaded;
    view.invalidateAssets();
    repaintView();
    renderAssetSlots(el.viewOverlay, loaded, dev);
    paintMinimap();                     // 에셋이 들어온 다음
    paintBriefThumb();
    const failed = loaded.missing.filter((id) => id !== 'ui.gauge');
    el.assetChip.hidden = !dev || failed.length === 0;
    if (failed.length) el.assetChip.textContent = `[dev] 에셋 일부 없음 — 기본 도형으로 표시 (${failed.length}종)`;
    // 조용히 폴백하지 않는다. 슬롯이 비면 화면은 폴백을 그리되 오류 채널에 한 건 남긴다.
    if (failed.length) {
      noteRenderFault('assets', `에셋 슬롯 ${failed.length}종을 불러오지 못했습니다: ${failed.join(', ')}`);
    }
    const bgRef = challenge.scene.assets && challenge.scene.assets.background;
    if (bgRef) {
      const bg = loaded.resolve(bgRef);
      if (!bg || bg.kind !== 'background') {
        noteRenderFault('background',
          `배경(${bgRef})을 불러오지 못해 기본 화면으로 그렸습니다. 새로고침해도 같으면 에셋 배포를 확인해 주세요.`);
      }
    }
  }).catch((e) => {
    el.assetChip.hidden = !dev;
    el.assetChip.textContent = '[dev] 에셋을 불러오지 못함 — 기본 도형으로 표시';
    noteRenderFault('assets', `에셋을 불러오지 못했습니다: ${e && e.message ? e.message : e}`);
  });
  const trackSpec = challenge.scene.track;
  el.scaleChip.textContent = trackSpec.shape === 'polyline'
    ? `${trackSpec.points.length}구간 · 폭 ${trackSpec.width_mm}mm (차폭 ${kit.body.width_mm}mm × 3)`
    : `한 변 ${trackSpec.center_side_mm}mm · 폭 ${trackSpec.width_mm}mm (차폭 ${kit.body.width_mm}mm × 3)`;
  // 52차 — "브라우저 저장 켜짐" 칩을 없앴다. 기록 저장은 늘 켜진 것으로 다룬다.
  // 다만 정말로 저장이 막힌 때(사생활 보호 모드·용량 초과)는 학생이 알아야 한다.
  // 칩 대신 시리얼 모니터에 [기록] 줄로 한 번 남긴다 — 사실을 지우지는 않는다.
  let storageWarned = false;
  function syncStorageChip() {
    if (store.usable || storageWarned) return;
    storageWarned = true;
    pushSerial('기록', '이 브라우저에서는 기록을 저장할 수 없습니다. 창을 닫으면 사라집니다.');
  }
  paintMinimap();                       // 진입 직후
  paintBriefThumb();
  requestAnimationFrame(paintMinimap);  // 레이아웃이 잡힌 다음 한 번 더

  let playing = false;
  let autoPaused = false;   // 탭 전환으로 자동 일시정지된 상태인지
  let speed = 1;
  let acc = 0;              // 아직 시뮬에 반영하지 못한 시간(ms)
  let lastFrame = null;
  let lapSeen = 0;
  let compiled = null;
  let attemptNo = store.attempt;
  let attemptRow = null;      // 이번 시도의 이력 행
  let attemptCode = '';       // 이번 시도에 실제로 돌린 코드
  let attemptChanges = [];    // 직전 시도 대비 변경점
  let attemptPrevTicks = null;

  /** 알림은 오류가 아니다. 오류 카운터와 오류 패널에 섞지 않는다. */
  function showNotice(text, level = 'info') {
    el.notice.hidden = !text;
    el.notice.textContent = text || '';
    el.notice.classList.toggle('notice-bar--warn', level === 'warn');
  }

  const STAMP = { offtrack: '코스 이탈', no_progress: '앞으로 못 감', timeout: '시간 초과' };

  function showEnded(sim) {
    const reason = (sim.ended && sim.ended.reason) || 'timeout';
    const np = challenge.rules.no_progress;
    let why;
    if (reason === 'offtrack') {
      // 왜 나갔는지는 챌린지마다 다르다. 안내 문구는 매니페스트가 들고 있다.
      why = `코스를 ${challenge.rules.offtrack.max_events}번 벗어나 달리기가 끝났습니다.`;
    } else if (reason === 'no_progress' && np) {
      why = np.message || '앞으로 나아가지 못하고 있습니다.';
    } else {
      why = `제한 시간 ${Math.round(challenge.rules.timeout.sim_ticks / 100)}초가 다 되어 달리기가 끝났습니다.`;
    }
    const segs = sim.decisions ? [] : segmentsOf();
    const here = sim.decisions ? -1 : segIndexAt(sim.vehicle.x, sim.vehicle.y);
    const stats = [
      ['달린 시간', `${formatTicks(sim.tick)}초`],
      [word('offtrack'), `${sim.offtrack.count}회`],
    ];
    if (segs.length) {
      const done = segs.filter((_, i) => segRun.at[i] !== undefined).length;
      stats.push(['지나온 구간', `${done} / ${segs.length}`]);
      if (here >= 0 && segs[here]) stats.push(['멈춘 자리', `${here + 1}. ${segs[here].name}`]);
    }
    showOutcome({
      ok: false,
      stamp: STAMP[reason] || '달리기 끝',
      big: '—',
      bigNote: '기록이 남지 않았어요',
      why,
      stats,
      advice: adviceFor({ ok: false, reason, here, segs }),
      segRows: segmentRows(),
    });
  }

  /**
   * 주행 결과 모달. 기록이 나온 순간이 저장 의욕이 가장 높은 순간이라, 그 자리에 저장 버튼을
   * 같이 둔다. 화면 한가운데 뜨고 [닫기]·바깥 클릭·Esc 로 닫히며, 닫으면 화면은 그대로 남는다.
   *
   * 문구 틀은 매니페스트가 소유하고 숫자는 엔진이 채운다. 화면이 지어내는 값은 하나도 없다.
   */
  /**
   * 구간 표를 채운다(52차). 값은 segmentRows() 가 엔진 자취에서 뽑은 것이다.
   * 가장 오래 걸린 구간에 표시를 남긴다 — 어디를 줄일지가 한눈에 보여야 한다.
   */
  function paintSegTable(rows, done) {
    const table = el.outcomeSegs;
    if (!table) return;
    const usable = (rows || []).filter((r) => r.ticks !== null);
    table.hidden = usable.length === 0;
    if (table.hidden) { el.outcomeSegsBody.replaceChildren(); return; }
    // 가장 오래 걸린 구간 강조는 완주했을 때만. 도중에 끝났으면 지나온 칸끼리만 견주는 셈이라
    // "여기가 제일 느리다" 가 사실이 아니다.
    const slowest = done ? usable.reduce((a, b) => (a.ticks >= b.ticks ? a : b)).n : -1;
    el.outcomeSegsBody.replaceChildren(...rows.map((r) => {
      const tr = document.createElement('tr');
      if (r.n === slowest) tr.className = 'is-slowest';
      for (const v of [String(r.n), r.kind, r.ticks === null ? '—' : `${formatTicks(r.ticks)}초`]) {
        const td = document.createElement('td');
        td.textContent = v;
        tr.append(td);
      }
      return tr;
    }));
  }

  /**
   * 판단 지점 표 (54차 파트M). 현황판과 같은 자료다 — 엔진이 낸 판정을 옮기기만 한다.
   * 완주 전에는 여섯 줄 모두 "—" 이고, 강조는 완주했을 때만 붙인다.
   */
  function paintPointTable(done) {
    const table = el.outcomePoints;
    if (!table) return;
    const cfg = sim.decisions;
    table.hidden = !cfg;
    if (!cfg) { el.outcomePointsBody.replaceChildren(); return; }
    const st = sim.decisionRun;
    const byId = new Map((st ? st.results : []).map((r) => [r.id, r]));
    const SEEN = { 1: '정지', 2: '서행', 3: '진행' };
    el.outcomePointsBody.replaceChildren(...cfg.list.map((d, i) => {
      const r = byId.get(d.id);
      const tr = document.createElement('tr');
      if (done && r && !r.ok) tr.className = 'is-slowest';
      const cells = [
        String(i + 1),
        d.label,
        r && r.seen ? (SEEN[r.seen] || '모름') : '—',
        r ? (r.ok ? '통과' : '위반') : '—',
      ];
      for (const v of cells) {
        const td = document.createElement('td');
        td.textContent = v;
        tr.append(td);
      }
      return tr;
    }));
  }

  function showOutcome({ ok, stamp, big, bigNote, delta, why, stats, advice, segRows }) {
    paintSegTable(segRows, ok);
    paintPointTable(ok);
    el.outcomeStamp.textContent = stamp;
    el.outcomeStamp.className = `outcome__stamp${ok ? ' is-ok' : ' is-bad'}`;
    el.outcomeBig.textContent = big;
    el.outcomeBig.classList.toggle('is-plain', !ok);
    el.outcomeDelta.textContent = delta || bigNote || '';
    el.outcomeDelta.hidden = !(delta || bigNote);
    el.outcomeWhy.textContent = why || '';
    el.outcomeWhy.hidden = !why;
    el.outcomeStats.replaceChildren(...(stats || []).flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      return [dt, dd];
    }));
    el.outcomeStats.hidden = !(stats && stats.length);
    // 해당하는 값이 없으면 칸을 통째로 감춘다. 빈말을 넣지 않는다.
    el.outcomeAdvice.hidden = !advice;
    el.outcomeAdviceText.textContent = advice || '';

    const actions = [['닫기', 'btn', hideResult]];
    if (ok) {
      actions.push(['↺ 다시 달리기', 'btn', () => { hideResult(); setPlaying(false); resetRun(); }]);
      actions.push([`💾 ${ui.submit_label || '과제물 만들기'}`, 'btn btn--primary',
        () => { hideResult(); el.submitOpen.click(); }]);
    } else {
      // 실패했을 때는 저장할 것이 없다. 고치러 가는 길이 주버튼이다.
      actions.push(['✎ 코드 고치러 가기', 'btn btn--primary', () => { hideResult(); goFixCode(); }]);
      actions.push(['↺ 다시 달리기', 'btn', () => { hideResult(); setPlaying(false); resetRun(); }]);
    }
    el.outcomeActions.replaceChildren(...actions.map(([label, cls, fn]) => {
      const b = document.createElement('button');
      b.className = cls;
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', fn);
      return b;
    }));
    el.outcome.hidden = false;
  }

  function hideResult() {
    el.outcome.hidden = true;
  }

  /** 모달을 닫고 커서를 고칠 줄에 놓는다. 어느 줄인지는 매니페스트가 정한다. */
  function goFixCode() {
    if (hideCode) return;
    if (el.tabCode && !el.paneTabs.hidden) el.tabCode.click();
    const target = ui.fix_target;
    let line = -1;
    if (target && (target.section || target.match)) {
      line = editor.findLine({ section: target.section, match: target.match });
    }
    // 매니페스트가 자리를 정해 두지 않았으면 마지막 구간(대개 [주행])의 첫 줄로 간다.
    // 코드 맨 위는 대개 설명 주석이라, 거기에 커서를 놓으면 고칠 자리를 다시 찾아야 한다.
    if (line < 0) {
      const marks = editor.sections();
      const last = marks.length ? marks[marks.length - 1].name : null;
      line = last ? editor.findLine({ section: last }) : 0;
    }
    editor.focusLine(Math.max(1, line + 1), 1);
  }

  /**
   * 조언 한 줄. 엔진이 이미 낸 값에서만 뽑는다 — 구간별 소요 시간, 킷의 좌우 모터 특성,
   * 이탈 지점, 규칙 위반 종류. 해당하는 값이 하나도 없으면 null 을 돌려주고 칸을 감춘다.
   * 문장 틀은 매니페스트(scene.ui.advice)가 소유한다.
   */
  function adviceFor({ ok, reason, here, segs }) {
    const tpl = ui.advice || {};
    const fill = (t, vars) => t.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? '' : String(vars[k])));
    const nameOf = (i) => (segs && segs[i] ? `${i + 1}. ${segs[i].name}` : null);

    if (!ok && reason === 'offtrack' && tpl.offtrack) {
      // 이탈 지점은 엔진이 이벤트로 남긴 좌표다.
      const hits = sim.events.filter((e) => e.type === EVENT.OFFTRACK_ENTER);
      const last = hits.length ? hits[hits.length - 1] : null;
      const at = last && !sim.decisions ? segIndexAt(last.x, last.y) : -1;
      const where = nameOf(at);
      if (where) return fill(tpl.offtrack, { where });
    }
    if (!ok && reason === 'no_progress' && tpl.stuck) {
      const where = nameOf(here);
      if (where) return fill(tpl.stuck, { where, deadzone: (kit.drive && kit.drive.deadzone_pwm) || '' });
    }
    // 규칙 위반은 종류를 엔진이 세어 둔다. 가장 많이 어긴 종류 하나만 말한다.
    const kinds = (scoreRun(sim, sim.tick).violation_kinds || []).slice()
      .sort((a, b) => b.count - a.count);
    if (kinds.length && tpl.violation) {
      return fill(tpl.violation, { kind: kinds[0].label, count: kinds[0].count });
    }
    // 좌우 모터 특성 차이는 킷 스펙이다. 같은 값을 줘도 휘는 이유가 여기에 있다.
    const trim = challenge.motor_trim;
    if (trim && tpl.drift) {
      const mid = (trim.left + trim.right) / 2;
      const gap = mid > 0 ? Math.round((Math.abs(trim.left - trim.right) / mid) * 100) : 0;
      if (gap >= 1) return fill(tpl.drift, { gap });
    }
    // 마지막으로 가장 오래 걸린 구간. 구간을 재지 않는 챌린지에서는 값이 없다.
    if (segs && segs.length && tpl.slowest) {
      let worst = -1;
      let worstTicks = -1;
      for (let i = 0; i < segs.length; i++) {
        const a = segRun.at[i];
        const b = segRun.to[i];
        if (a === undefined || b === undefined || b < a) continue;
        if (b - a > worstTicks) { worstTicks = b - a; worst = i; }
      }
      if (worst >= 0) return fill(tpl.slowest, { segment: nameOf(worst), time: formatTicks(worstTicks) });
    }
    return null;
  }

  // 화면이 의도한 대로 그려지지 못한 일. 코드 오류와 같은 채널에 남기되
  // 다음 컴파일 결과에 지워지지 않도록 따로 들고 있다가 항상 함께 보여 준다.
  const renderFaults = new Map();
  let lastIssues = [];
  // 마지막으로 시뮬에 넣은 코드. [▶ 실행] 이 옛 코드로 달리지 않게 하기 위한 것이다.
  let appliedCode = null;
  function noteRenderFault(key, message) {
    if (renderFaults.has(key)) return;
    renderFaults.set(key, message);
    // eslint-disable-next-line no-console
    console.error(`[render] ${message}`);
    showIssues(lastIssues);
  }

  /**
   * 오류는 52차부터 시리얼 모니터 한 곳으로 간다. 오류 탭은 없앴다.
   * 줄 번호가 있는 오류는 눌러서 그 줄로 갈 수 있다 — 옛 오류 목록과 같은 동작이다.
   */
  function showIssues(issues, kind = 'error') {
    lastIssues = issues;
    const faults = [...renderFaults.values()].map((message) => ({ message, render: true }));
    const all = [...issues, ...faults];
    editor.setErrorLines(issues.filter((i) => i.line).map((i) => i.line));
    if (kind !== 'info' && issues.length) setEdStat(`오류 ${issues.length}건`, 'bad');
    if (all.length === 0) return;
    for (const issue of all) {
      // 54차 — 자리를 '3:1' 이 아니라 '3번째 줄' 로 적는다. 실물 IDE 를 처음 보는 학생에게
      // 콜론 두 숫자는 읽히지 않는다. 눌러서 그 줄로 가는 동작은 그대로다.
      const where = issue.render ? '화면' : (issue.line ? `${issue.line}번째 줄` : '실행');
      pushSerial(kind === 'info' ? '컴파일' : '오류', `${where} — ${issue.message}`,
        { line: issue.line, col: issue.col });
    }
  }

  /**
   * 속도 조절 카드가 정한 값을 코드에 반영한다.
   * 새 API 를 만들지 않는다 — 학생이 고치던 그 변수를 화면이 대신 고칠 뿐이라
   * 같은 속도 + 같은 모델이면 언제나 똑같은 코드가 돌고 기록도 같다.
   * 어느 변수를 건드릴지는 매니페스트(scene.speed_control.var)가 정한다.
   */
  function withSpeed(source) {
    const spec = challenge.scene.speed_control;
    if (!spec || speedNow === null) return source;
    const re = new RegExp(`(int\\s+${spec.var}\\s*=\\s*)(-?\\d+)(\\s*;)`);
    return re.test(source) ? source.replace(re, `$1${speedNow}$3`) : source;
  }

  /**
   * 코드만 검사한다([✓ 컴파일]). 시뮬에는 손대지 않고 결과만 시리얼에 찍는다.
   * 학생이 "지금 코드가 문법상 되는지" 만 보고 싶을 때 쓴다.
   */
  function verifyCode() {
    const result = compileProgram(withSpeed(editor.getValue()), {
      allowedApi: challenge.allowed_api,
      limits: challenge.limits,
      kit,
    });
    if (!result.ok) { showIssues(result.errors); return null; }
    showIssues([]);
    pushSerial('컴파일', `문제 없습니다 (${editor.getValue().split('\n').length}줄).`);
    setEdStat('컴파일 완료 · 오류 0', 'ok');
    return result;
  }

  function applyCode({ autoplay = true } = {}) {
    const result = compileProgram(withSpeed(editor.getValue()), {
      allowedApi: challenge.allowed_api,
      limits: challenge.limits,
      kit,
    });
    if (!result.ok) {
      showIssues(result.errors);
      setPlaying(false);
      return false;
    }
    compiled = result;
    setEdStat('업로드 완료 · 오류 0', 'ok');
    showIssues([]);
    appliedCode = editor.getValue();
    // 54차 보강4 — 대괄호와 ▶ 를 문장 안에 쓰지 않는다. 코드 칸이 380px 로 좁아지면서
    // 줄이 끊길 때 마지막 줄에 ']' 한 글자만 남았다. 기호가 없으면 끊겨도 읽힌다.
    pushSerial('업로드', '올렸습니다. 실행 버튼을 눌러 주세요.');
    if (onCodeApplied) onCodeApplied();
    store.saveCode(editor.getValue(), starter, starterVersion);
    resetRun();
    setPlaying(autoplay);
    return true;
  }

  /**
   * 57-C 파트3 — 저장할 주행 자취.
   * 담는 것은 [t, x, y, heading] 넷뿐이다. 그림이 아니라 좌표라서 가볍고, 다시 그릴 때는
   * 지금 화면이 쓰는 그 함수(drawMinimap)를 그대로 쓴다 — 그리는 코드를 두 벌 두지 않는다.
   * 같은 배열이면 같은 그림이 나온다(tick 으로만 표본을 뜨므로 벽시계가 끼어들지 않는다).
   */
  let pathSamples = [];

  /**
   * 기록에 함께 남길 것. **무엇을 남길지는 매니페스트(record.fields)가 정한다.**
   * 코드에 기본값을 두지 않는다 — 목록이 없으면 조용히 넘기지 않고 그 자리에서 터진다.
   * 그래야 새 챌린지를 만들 때 "무엇을 기록할지" 를 반드시 정하고 지나간다.
   */
  function recordExtras(lapTicks, scoredTicks) {
    const fields = (challenge.record && challenge.record.fields) || null;
    if (!Array.isArray(fields)) {
      throw new Error(`매니페스트 오류 [${challenge.challenge_id}]: record.fields 가 없습니다. `
        + '무엇을 기록할지는 매니페스트가 정합니다.');
    }
    const out = {};
    for (const f of fields) {
      if (f === 'lap_total') out.lap_total_ticks = lapTicks === null ? null : lapTicks;
      else if (f === 'lap_splits') out.lap_splits = segmentRows().map((r) => ({ n: r.n, kind: r.kind, ticks: r.ticks }));
      else if (f === 'path_image') {
        out.path = {
          course: challenge.challenge_id,
          attempt: attemptNo,
          every_ticks: PATH_EVERY,
          samples: pathSamples.slice(),
          end: { x: Math.round(sim.vehicle.x), y: Math.round(sim.vehicle.y), ok: lapTicks !== null },
        };
      } else throw new Error(`매니페스트 오류 [${challenge.challenge_id}]: 모르는 record.fields 항목입니다: ${f}`);
    }
    return out;
  }

  function pushPathSample() {
    const v = sim.vehicle;
    // 방향은 엔진이 쓰는 그대로(milli-degree 정수)를 담는다. 여기서 각도를 바꾸면
    // 반올림이 한 번 더 끼어들어 같은 배열이 같은 그림을 내지 못한다.
    pathSamples.push([sim.tick, Math.round(v.x), Math.round(v.y), v.heading_mdeg]);
  }

  function resetRun() {
    hideResult();
    // 로그를 지우지 않은 채 처음으로 돌아가면 시각이 0 으로 되감긴다. 구분선을 넣어
    // 어디서부터 새 주행인지 알 수 있게 한다(순번은 이어서 붙는다).
    if (lastTick > 0) pushSerialBreak();
    lerp.prev = null; lerp.alpha = 0;      // 되돌린 자리에서 이전 자세로 끌려가지 않게
    resetSim(sim, compiled ? (s) => compiled.makeProgram(s) : null);
    lastTick = 0;
    pathSamples = [];
    pushPathSample();                   // 출발점 한 개는 늘 있어야 선이 그려진다

    paintMinimap();                     // 리셋 직후
    resetEvents();
    attemptNo += 1;
    store.setAttempt(attemptNo);
    syncSolutionBtn();
    attemptRow = null;
    attemptCode = editor.getValue();

    // 변경점은 직전 시도의 코드와 비교해 뽑는다. 자연어를 만들지 않고 사실만 남긴다.
    const prev = lastRecordedRow();
    const prevCode = prev && store.snapshots[prev.snapshot] ? store.snapshots[prev.snapshot].code : null;
    attemptChanges = prevCode ? formatDiff(diffCode(prevCode, attemptCode)) : [];
    attemptPrevTicks = prev && typeof prev.ticks === 'number' ? prev.ticks : null;

    lapSeen = 0;
    acc = 0;
    lastFrame = null;
  }

  function lastRecordedRow() {
    for (let i = store.history.length - 1; i >= 0; i--) {
      if (store.history[i].snapshot) return store.history[i];
    }
    return null;
  }

  /** 웹캠 챌린지의 기록에 함께 남기는 값. 영상이 아니라 수치만 남는다. */
  function cameraMeta() {
    if (!wantsWebcam) return {};
    return {
      practice_mode: practiceMode,
      threshold: webcam ? webcam.threshold : null,
      detection_rate: webcam ? webcam.detectionRate : null,
    };
  }

  /**
   * 기록에 함께 남는 값. 최종 기록 = 주행 시간 + 페널티이고, 페널티 폭은 전부 매니페스트가 정한다.
   * 셈은 엔진(scoreRun)이 한다 — 여기서는 그 결과를 옮겨 적기만 한다.
   */
  function runMeta(lapTicks) {
    const sc = scoreRun(sim, lapTicks);
    const d = decisionSummary(sim);
    const o = obstacleSummary(sim);
    const meta = {
      drive_ticks: sc.drive_ticks,
      penalty_ticks: sc.penalty_ticks,
      offtrack_penalty_ticks: sc.offtrack_ticks,
      violation_penalty_ticks: sc.violation_ticks,
      violations: sc.violations,
      violation_kinds: sc.violation_kinds,
    };
    if (d) {
      meta.decisions_ok = d.correct;
      meta.decisions_total = d.total;
      meta.decision_violations = d.violations;
      meta.judged_points = judgedPointsOf(challenge);
      meta.perfect = d.violations === 0 && (!o || o.violations === 0);
      meta.classify_rate = d.classify_rate;
    }
    if (o) {
      meta.obstacle_violations = o.violations;
      meta.obstacle_passes = o.passes;
      meta.obstacle_total = o.total;
      meta.obstacle_judged = o.judged;
      meta.blocked_passes = o.blocked_passes;
    }
    return { score: sc, meta };
  }

  /** 파트5 피드백. 판정은 수치로 하고 문구는 매니페스트에서 고른다. */
  function mlFeedback(d) {
    const phrases = challenge.ml && challenge.ml.feedback;
    if (!phrases || !d || !d.total) return '';
    if (!mlModel) return phrases.none;
    const run = d.classify_rate;
    if (run >= 80) return phrases.good;
    if (mlModel.accuracy - run >= 30) return phrases.overfit;
    return phrases.weak;
  }

  function recordLap(ticks) {
    const snapshot = codeHash(attemptCode);
    const rm = runMeta(ticks);
    const scored = rm.score.total_ticks;
    // 이 주행을 넣기 전의 최고 기록. 넣은 뒤에 물으면 자기 자신이 답이 되어
    // "이전보다 얼마나 빨라졌는가" 를 영원히 0 으로 만든다.
    const prevBest = hud.bestTicks();
    if (!attemptRow) {
      attemptRow = store.pushRecord({
        attempt: attemptNo,
        ticks: scored,
        lap_ticks: ticks,
        offtrack: sim.offtrack.count,
        ...recordExtras(ticks, scored),
        at: Date.now(),
        snapshot,
        changes: attemptChanges,
        delta: attemptPrevTicks === null ? undefined : scored - attemptPrevTicks,
        engine_version: ENGINE_VERSION,
        challenge_version: challenge.version,
        scoring_version: SCORING_VERSION,
        seed: ENGINE_SEED,
        ...cameraMeta(),
        ...rm.meta,
      }, attemptCode);
    } else if (scored < attemptRow.ticks) {
      attemptRow.ticks = scored;
      attemptRow.lap_ticks = ticks;
      attemptRow.offtrack = sim.offtrack.count;
      if (attemptPrevTicks !== null) attemptRow.delta = scored - attemptPrevTicks;
      store.touch();
    }
    syncStorageChip();
    const bestBefore = prevBest;
    // 자격이 없는 주행은 아무리 빨라도 최고 기록이 아니다 — 카드와 배지가 서로 다른 말을 하면 안 된다.
    const ok = !hud.isEligible || hud.isEligible(attemptRow || { offtrack: sim.offtrack.count });
    hud.afterRecord({
      isBest: ok && (bestBefore === null || scored <= bestBefore),
      snapshot,
      changes: attemptChanges,
    });
    reflectRecords();
    const delta = attemptPrevTicks === null ? null : scored - attemptPrevTicks;
    const d = decisionSummary(sim);
    const o = obstacleSummary(sim);
    const sc = rm.score;
    // 시간이 어디서 늘었는지 한 줄씩 보여 준다 — 주행 시간과 페널티를 섞지 않는다.
    const stats = [
      ['주행 시간', `${formatTicks(sc.drive_ticks)}초`],
      ['페널티', penaltyText(sc)],
      ['최종 기록', `${formatTicks(sc.total_ticks)}초`],
      [word('offtrack'), `${sim.offtrack.count}회`],
    ];
    if (d) stats.push([word('violations'), `${sc.violations}회`]);
    // 55차 보강5 5-4 — 부딪혀 서 있던 시간. 페널티가 아니라 주행 시간 안에 이미 흐른 값이라
    // 따로 적어 주지 않으면 학생은 왜 늦었는지 알 수 없다. 값은 엔진이 센 tick 그대로다.
    if (sc.collision_stop_ticks) {
      stats.push(['부딪혀 서 있던 시간', `${formatTicks(sc.collision_stop_ticks)}초`]);
    }
    // 종류별 내역은 주행이 끝난 뒤에만 보여 준다. 계기에는 합 하나만 나간다.
    for (const k of sc.violation_kinds) {
      stats.push([k.label, `${k.count}회 · +${(k.ticks / 100).toFixed(2)}초`]);
    }
    if (o && o.judged) stats.push(['장애물 위반', `${o.violations}/${o.passes}`]);

    // 목표 시간은 매니페스트가 소유한다. 없는 챌린지는 도장이 '완주' 로 나온다.
    const goal = challenge.scoring.goal_ticks;
    const hitGoal = typeof goal === 'number' && scored <= goal;
    // 기록 인정 조건을 채웠는가 — 자격 규칙은 hud 한 곳에만 있다.
    const eligible = !hud.isEligible || hud.isEligible({ offtrack: sim.offtrack.count, violations: sc.violations });
    const best = eligible && (bestBefore === null || scored <= bestBefore);
    const delta2 = bestBefore === null ? null : scored - bestBefore;
    const deltaLine = bestBefore === null
      ? '첫 기록이에요'
      : (delta2 < 0 ? `이전보다 ${((-delta2) * TICK_MS / 1000).toFixed(2)}초 빨라짐` : '최고 기록은 그대로');
    const why = [];
    if (hitGoal) why.push(`목표 ${formatGoal(formatTicks(goal))}초 안에 들어왔어요.`);
    else if (typeof goal === 'number') why.push(`목표 ${formatGoal(formatTicks(goal))}초까지 ${formatTicks(scored - goal)}초 남았어요.`);
    if (!eligible) why.push(`${word('offtrack')}이 있어 최고 기록 후보는 아니에요.`);
    else if (best && bestBefore !== null) why.push('지금까지 중 가장 빠릅니다.');
    const ml = mlFeedback(d);
    if (ml) why.push(ml);

    const segs = sim.decisions ? [] : segmentsOf();
    showOutcome({
      ok: true,
      stamp: hitGoal ? '✓ 목표 달성' : '완주',
      big: `${formatTicks(scored)}초`,
      delta: deltaLine,
      why: why.join(' '),
      stats,
      advice: adviceFor({ ok: true, reason: null, here: -1, segs }),
      segRows: segmentRows(),
    });
  }

  /**
   * 카메라 밑 한 줄 — 어긋남 → 조향 막대 → 바퀴 값(51차).
   * 손을 옮기면 어긋남이 움직이고, 그것이 바퀴 값으로 바뀌는 경로가 한 줄에 보여야 한다.
   * 값은 전부 엔진이 낸 것이다. 이 함수는 잇기만 한다.
   */
  function paintCamSteer() {
    if (!camView || el.camsteer.hidden) return;
    const cam = readCamera(sim);
    const off = cam.found ? cam.offset : 0;
    el.camsteerOff.textContent = cam.found ? `${off > 0 ? '+' : ''}${off}` : '—';
    // 막대는 가운데가 0 이다. 부호가 그대로 방향이 된다.
    const half = Math.min(50, Math.abs(off) / 2);
    el.camsteerFill.style.width = `${half}%`;
    el.camsteerFill.style.left = off >= 0 ? '50%' : `${50 - half}%`;
    const v = sim.vehicle;
    el.camsteerL.textContent = String(Math.round(v.pwmL));
    el.camsteerR.textContent = String(Math.round(v.pwmR));
  }

  /**
   * 지금 잡은 색 (54차 파트L). 값은 카메라에서 나온 것을 옮기기만 한다 — 지어내지 않는다.
   * 카메라가 꺼져 있으면 전부 "—" 이고 막대는 비운다. 없는 값을 0 으로 적으면
   * "검은색을 잡고 있다" 로 읽힌다.
   */
  function paintSimColor() {
    if (el.simcolor.hidden) return;
    const on = !!(webcam && webcam.running);
    const t = on && webcam.threshold ? webcam.threshold : null;
    const cam = on ? readCamera(sim) : null;
    const bar = (barEl, v) => { barEl.style.width = on && t ? `${(v * 100) / 255}%` : '0%'; };
    const num = (numEl, v) => { numEl.textContent = on && t ? String(v) : '—'; };
    bar(el.scRBar, t ? t.r : 0); num(el.scR, t ? t.r : 0);
    bar(el.scGBar, t ? t.g : 0); num(el.scG, t ? t.g : 0);
    bar(el.scBBar, t ? t.b : 0); num(el.scB, t ? t.b : 0);
    el.scChip.style.background = on && t ? `rgb(${t.r}, ${t.g}, ${t.b})` : 'transparent';
    el.scOff.textContent = cam && cam.found ? `${cam.offset > 0 ? '+' : ''}${cam.offset}` : '—';
    el.scArea.textContent = cam && cam.found ? String(cam.area) : '—';
    el.scRate.textContent = on ? `${webcam.detectionRate}%` : '—';
  }

  /** 페널티 한 줄. 무엇 때문에 붙었는지 괄호로 밝힌다 — 수치는 엔진이 낸 값 그대로다. */
  function penaltyText(sc) {
    if (!sc.penalty_ticks) return '없음';
    const why = [];
    if (sc.offtrack_ticks) why.push(`${word('offtrack')} ${sc.offtrack_count}회`);
    if (sc.violation_ticks) why.push(`규칙 위반 ${sc.violations}회`);
    return `+${(sc.penalty_ticks * TICK_MS / 1000).toFixed(2)}초 (${why.join(' · ')})`;
  }

  function recordEnd(reason) {
    if (attemptRow) {
      attemptRow.end_reason = reason;           // 랩은 남기고 종료 사유만 덧붙인다
      store.touch();
    } else {
      store.pushRecord({
        attempt: attemptNo,
        ended: reason,
        offtrack: sim.offtrack.count,
        at: Date.now(),
        snapshot: codeHash(attemptCode),
        changes: attemptChanges,
        engine_version: ENGINE_VERSION,
        challenge_version: challenge.version,
        scoring_version: SCORING_VERSION,
        seed: ENGINE_SEED,
        ...cameraMeta(),
        ...runMeta(sim.tick).meta,
      }, attemptCode);
    }
    syncStorageChip();
    hud.render();
  }

  function setPlaying(next) {
    playing = next;
    if (!next) lastFrame = null;
    if (!next) { autoPaused = false; el.tabNotice.hidden = true; }
    // 달리는 도중에 속도가 바뀌면 그 기록이 무엇의 기록인지 알 수 없다 — 시작 전에만 바꾼다.
    lockSpeed(next || sim.tick > 0);
  }

  let submitPanel = null;   // 결과 카드의 [화면 저장] 이 쓴다

  // ── 큰 주버튼: 적용 → 리셋 → 재생을 한 번에 ───────────────
  // 52차 — 주버튼 둘.
  //   [✓ 컴파일]  코드만 검사한다. 시뮬은 그대로다.
  //   [→ 업로드]  검사에 통과하면 시뮬에 넣고 처음 자리로 돌린다.
  // [▶ 실행] 은 달리기만 한다. 다만 올린 뒤로 코드를 고쳤다면 먼저 올린다 —
  // 고친 코드를 두고 옛 코드가 달리면 학생이 무엇을 본 것인지 알 수 없다.
  el.verify.addEventListener('click', () => verifyCode());
  el.apply.addEventListener('click', () => applyCode({ autoplay: false }));
  el.go.addEventListener('click', () => {
    if (appliedCode === null || editor.getValue() !== appliedCode) applyCode({ autoplay: true });
    else setPlaying(true);
  });

  // ── 가이드 퀘스트 (사용자 단위로 한 번만, [안내] 로 다시 볼 수 있다) ──
  // 단계와 문구는 매니페스트가 들고 있다. 여기는 "대상을 어떻게 찾는가"만 안다.
  const GUIDE_KEY = 'dtc:v1:guideSeen';
  const guideSeen = () => { try { return localStorage.getItem(GUIDE_KEY) === '1'; } catch (_) { return false; } };
  const markGuideSeen = () => { try { localStorage.setItem(GUIDE_KEY, '1'); } catch (_) { /* 저장 실패는 무시 */ } };
  // 학습 탭처럼 나중에 그려지는 패널 안의 요소는 셸의 el 맵에 없다 — 그때는 살아 있는 DOM 에서 찾는다.
  const camelEl = (name) => el[String(name).replace(/-([a-z])/g, (_, c) => c.toUpperCase())]
    || root.querySelector(`[data-el="${name}"]`);

  function resolveTarget(target) {
    if (!target) return null;
    if (target.el) {
      const node = camelEl(target.el);
      if (!node || node.hidden || !node.isConnected || node.offsetParent === null) return null;
      const r = node.getBoundingClientRect();
      return r.width && r.height ? r : null;
    }
    if (target.anchor) {
      // 줄 번호를 박아두면 학생이 편집하는 순간 엉뚱한 줄을 가리킨다. 코드 문자열로 찾는다.
      const i = editor.findAnchor(target.anchor);
      if (i < 0) {
        // 조용히 넘어가면 짚기가 죽은 줄도 모르고 지나간다(54차에 실제로 그랬다).
        // 학생이 고쳐서 사라진 것일 수도 있으니 막지는 않고, 자국만 남긴다.
        console.warn(`짚을 자리를 못 찾음: ${target.anchor.find}`);
        return null;
      }
      return editor.lineRect(i);
    }
    return null;
  }

  el.outcomeClose.addEventListener('click', hideResult);
  // 바깥을 눌러도 닫힌다. 닫으면 화면은 그대로 남는다.
  el.outcome.addEventListener('click', (e) => { if (e.target === el.outcome) hideResult(); });
  const onEsc = (e) => { if (e.key === 'Escape' && !el.outcome.hidden) hideResult(); };
  document.addEventListener('keydown', onEsc);

  /**
   * 가이드 단계가 스스로 넘어가는 조건. 조건 이름은 매니페스트가 고르고,
   * "그 조건이 채워졌는지" 는 여기서 실제 상태를 보고 답한다 — 문구도 순서도 모른다.
   */
  function questDone(when) {
    if (when === 'camera_on') return !!(webcam && webcam.active);
    if (when === 'samples_ready') {
      if (!train) return false;
      // 학습 패널이 쓰는 칸 번호 그대로다(0·1·2). 추론이 쓰는 1·2·3 과 다르다.
      const counts = mlClassNames.map((_, i) => train.samples.filter((smp) => smp.label === i).length);
      return counts.length > 0 && counts.every((n) => n >= ML.min_samples);
    }
    if (when === 'model_ready') return !!(mlModel && mlModel.ready);
    if (when === 'running') return sim.status === SIM_STATUS.RUNNING && sim.tick > 0;
    return false;
  }

  const quest = createQuest({
    steps: challenge.guide || [],
    resolve: resolveTarget,
    onClose: markGuideSeen,
    check: questDone,
  });
  // 52차 — [안내] 는 조작 줄에서 뺐다. 가이드라인 아이콘이 같은 일을 한다.
  el.guideAgain.addEventListener('click', () => quest.start());

  // ── 우측 패널 접힘 상태 (브라우저 저장, 사용자 단위) ────────
  const FOLD_KEY = 'dtc:v1:panes';
  const folds = { best: el.bestFold, history: el.historyFold };
  let foldState = {};
  try { foldState = JSON.parse(localStorage.getItem(FOLD_KEY) || '{}') || {}; } catch (_) { foldState = {}; }
  const saveFolds = () => {
    try { localStorage.setItem(FOLD_KEY, JSON.stringify(foldState)); } catch (_) { /* 저장 실패는 무시 */ }
  };
  for (const [name, node] of Object.entries(folds)) {
    node.open = foldState[name] === true;
    node.addEventListener('toggle', () => { foldState[name] = node.open; saveFolds(); });
  }


  // ── 40차 : 스마트시티 화면 ────────────────────────────────
  // 무엇을 감추고 무엇을 띄울지는 전부 매니페스트가 정한다. 화면 코드는 문구를 모른다.
  let speedNow = null;
  let showTrainResult = false;

  if (ui.columns) {
    el.shell.classList.add('shell--v2');
    el.shell.style.setProperty('--v2-col', `${ui.columns}px`);
    if (ui.columns_min) el.shell.style.setProperty('--v2-min', `${ui.columns_min}px`);
    // 54차 — 코드 칸만 따로 정한다. 없으면 지금까지처럼 좌우가 같은 폭이다.
    // 좁은 화면에서도 이 폭을 지킨다 — 3행 툴바가 여기에 맞춰 서 있어서, 좁아지면
    // [✓ 컴파일] [→ 업로드] 와 오른쪽 링크가 한 줄에 안 들어간다.
    if (ui.code_columns) {
      el.shell.style.setProperty('--v2-left', `${ui.code_columns}px`);
      el.shell.style.setProperty('--v2-left-min', `${ui.code_columns}px`);
    }
  }

  if (hideCode) {
    // 코드는 그대로 돌지만 학생은 고치지 않는다. 파일을 지우지 않고 화면에서만 내린다.
    el.editorMount.hidden = true;
    el.edTabs.hidden = true;
    el.edStatbar.hidden = true;
    el.apiFold.hidden = true;
    el.serialFold.hidden = true;
    el.paneTabs.hidden = true;
    el.paneLabel.hidden = true;
    el.resetCode.hidden = true;
    el.solution.hidden = true;
    el.shell.classList.add('shell--nocode');
    // 열이 좁아지면 단계 문구가 잘린다. 짧은 말은 매니페스트가 소유한다 —
    // 학습 패널은 다른 챌린지도 쓰므로 그쪽 문구는 건드리지 않는다.
    if (ui.step_labels) {
      queueMicrotask(() => {
        const spans = el.trainMount.querySelectorAll('.steps .step span');
        ui.step_labels.forEach((t, i) => { if (spans[i]) spans[i].textContent = t; });
      });
    }
    el.camLine.hidden = false;
    el.camstate.hidden = true;          // 카메라 켜기는 왼쪽 열 주버튼 하나로 모은다
    el.accChip.hidden = false;
    el.camStartMain.addEventListener('click', () => el.camStart.click());
    el.trainResult.hidden = false;
    showTrainResult = true;
    // 속도 조절은 담을 칸 바로 아래에 붙는다. 화면 맨 밑에 있으면 한 화면에서 안 보인다.
    el.trainMount.after(el.speedCard, el.trainResult);
  }

  /**
   * 코스 진행바. 판단 지점을 지나온 순서대로 늘어놓는다.
   * 칸 수는 매니페스트의 지점 수를 그대로 따른다 — 개수를 코드가 알고 있지 않다.
   * 지금 향하는 곳은 엔진이 낸 '다음 지점'이다. 화면이 따로 세지 않는다.
   */
  function paintCourseBar() {
    if (!el.coursebar.isConnected || el.coursebar.hidden) return;
    const cfg = sim.decisions;
    if (!cfg) return;
    const run = sim.decisionRun;
    const nextId = run && run.next ? run.next.id : (run && run.active ? run.active.id : null);
    const nextAt = cfg.list.findIndex((d) => d.id === nextId);
    // 어디서 걸렸는지. 판정이 끝난 지점만 표시한다 — 달리는 중에 미리 붉히지 않는다.
    const bad = new Set();
    for (const r of (run ? run.results : [])) if (!r.ok) bad.add(r.id);
    const obs = obstacleSummary(sim);
    if (obs) {
      for (const h of obs.hits) {
        const owner = cfg.list.find((x) => (x.watch || []).includes(h.id));
        if (owner) bad.add(owner.id);
      }
    }
    const html = cfg.list.map((d, i) => {
      const state = nextAt < 0 ? '' : (i < nextAt ? ' is-done' : (i === nextAt ? ' is-now' : ''));
      return `<li class="cstep${state}${bad.has(d.id) ? ' is-bad' : ''}"><b class="cstep__n">${i + 1}</b>`
        + `<span class="cstep__t">${escapeHtml(d.label)}</span></li>`;
    }).join('');
    if (el.coursebarSteps.innerHTML !== html) el.coursebarSteps.innerHTML = html;
  }

  /**
   * 구간 진행바. 코스 형상(직선·코너)으로 구간을 나누고 지나온 시간을 잰다.
   *
   * 시간은 sim.trail(엔진이 tick 간격으로 남긴 자취)에서 되짚어 낸다 —
   * 프레임 수와 무관하므로 화면이 느려도 같은 값이 나오고, 엔진에는 손대지 않는다.
   * 칸 수는 코스의 꼭짓점 수에서 나온다. 코드에 개수를 박지 않았다.
   */
  const segRun = { seen: 0, at: [], to: [], last: -1 };
  // 마커를 매 프레임 다시 훑지 않도록 코드 원문으로 캐시한다.
  let segNames = { src: null, names: [] };
  /**
   * 45차 파트6 — loop() 안에 놓인 구간 마커 이름. 학생이 마커를 고치면 진행바 이름도 따라 바뀐다.
   * loop() 밖([설정]·[준비])의 마커는 주행 구간이 아니므로 세지 않는다.
   * 마커가 없으면 빈 배열을 돌려주고, 부르는 쪽이 코스 형상으로 폴백한다.
   */
  function loopSectionNames() {
    const src = editor.getValue();
    if (src === segNames.src) return segNames.names;
    const lines = src.split('\n');
    const head = lines.findIndex((l) => /void\s+loop\s*\(/.test(l));
    const names = [];
    if (head >= 0) {
      let depth = 0;
      let open = false;
      for (let i = head; i < lines.length; i++) {
        for (const ch of lines[i]) {
          if (ch === '{') { depth++; open = true; }
          else if (ch === '}') depth--;
        }
        if (i > head || open) {
          const m = /^\s*\/\/\s*\[([^\]\n]{1,12})\]/.exec(lines[i]);
          if (m) names.push(m[1].trim());
        }
        if (open && depth <= 0) break;
      }
    }
    segNames = { src, names };
    return names;
  }

  function segmentsOf() {
    const pts = sim.track.centerline || [];
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      out.push({ name: '직선', kind: 'run' });
      out.push({ name: '코너', kind: 'turn' });
    }
    // 칸 수는 코스가 정한다(8자는 12칸). 이름만 코드가 정하고, 코드가 짧으면 돌려 쓴다.
    const names = loopSectionNames();
    if (names.length) out.forEach((sg, i) => { sg.name = names[i % names.length]; });
    return out;
  }
  /** 자취의 한 점이 몇 번째 구간에 있는가. 직선 구간과 그 끝의 코너를 번갈아 센다. */
  function segIndexAt(x, y) {
    const pts = sim.track.centerline || [];
    if (!pts.length) return -1;
    const near = nearestOnPath(pts, x, y);
    if (!near) return -1;
    // 구간 끝 한 뼘(코너 반경)은 코너로 본다.
    const a = pts[near.i];
    const b = pts[(near.i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const corner = Math.min(0.35, (sim.track.halfWidth * 1.6) / len);
    return near.i * 2 + (near.t >= 1 - corner ? 1 : 0);
  }
  /**
   * 구간별 시간을 모은다. 52차에 구간 8칸 띠를 없앴지만 재는 일은 그대로다 —
   * 값은 결과 모달의 표로 간다. 재는 것과 그리는 것을 갈라 두어야 띠가 없어도 값이 남는다.
   */
  function trackSegments() {
    if (sim.decisions) return;                              // 판단 지점이 있는 챌린지는 그쪽 바를 쓴다
    if (segRun.seen > sim.trail.length) { segRun.seen = 0; segRun.at = []; segRun.to = []; segRun.last = -1; }
    for (let i = segRun.seen; i < sim.trail.length; i++) {
      const p = sim.trail[i];
      const idx = segIndexAt(p.x, p.y);
      if (idx >= 0 && idx !== segRun.last) {
        const at = i * TRAIL_EVERY;
        if (segRun.last >= 0 && segRun.to[segRun.last] === undefined) segRun.to[segRun.last] = at;
        if (segRun.at[idx] === undefined) segRun.at[idx] = at;
        segRun.last = idx;
      }
    }
    segRun.seen = sim.trail.length;
  }

  /** 한 구간에 머문 tick 수. 아직 안 지났거나 끝나지 않았으면 null. */
  function segSpan(i, now) {
    const a = segRun.at[i];
    if (a === undefined) return null;
    const b = i === now ? sim.tick : segRun.to[i];
    return b === undefined || b < a ? null : b - a;
  }

  /**
   * 결과 모달에 넣을 구간 표. 세 칸이다 — 구간 번호 · 종류 · 걸린 시간.
   * 값은 전부 엔진의 자취에서 나온다. 이 함수는 세지 않는다.
   */
  function segmentRows() {
    if (sim.decisions) return [];
    trackSegments();
    const now = segIndexAt(sim.vehicle.x, sim.vehicle.y);
    return segmentsOf().map((sg, i) => ({ n: i + 1, kind: sg.name, ticks: segSpan(i, now) }));
  }

  function paintSegmentBar() {
    trackSegments();
    if (!el.coursebar.isConnected || el.coursebar.hidden || sim.decisions) return;
    const segs = segmentsOf();
    const now = segIndexAt(sim.vehicle.x, sim.vehicle.y);
    // 가장 오래 걸린 구간은 주행이 끝난 뒤에만 표시한다.
    const done = sim.status !== SIM_STATUS.RUNNING || sim.lap.count > 0;
    let slow = -1;
    let slowMs = -1;
    const span = (i) => segSpan(i, now);
    if (done) {
      for (let i = 0; i < segs.length; i++) {
        const t = span(i);
        if (t !== null && t > slowMs) { slowMs = t; slow = i; }
      }
    }
    const html = segs.map((sg, i) => {
      const t = span(i);
      const state = i === now ? ' is-now' : (segRun.at[i] !== undefined ? ' is-done' : '');
      // 칸이 여덟이면 한 줄에 이름과 시간이 같이 안 들어간다. 두 줄로 쌓는다.
      return `<li class="cstep${state}${i === slow ? ' is-slowest' : ''}"><b class="cstep__n">${i + 1}</b>`
        + '<span class="cstep__box">'
        + `<span class="cstep__t">${escapeHtml(sg.name)}</span>`
        + `<span class="cstep__ms">${t === null ? '—' : `${formatTicks(t)}초`}</span></span></li>`;
    }).join('');
    if (el.coursebarSteps.innerHTML !== html) el.coursebarSteps.innerHTML = html;
    // 번호·이름·시간을 세로로 쌓는다. 사각 코스는 여덟 칸, 8자는 열두 칸이라
    // 한 줄로는 어느 쪽도 '2.340초' 가 안 들어간다. 판단 지점 진행바는 칸이 적어 한 줄 그대로다.
    el.coursebarSteps.classList.add('is-stack');
  }

  /**
   * 모터 상태. 두 바퀴에 실제로 간 PWM 과 그 결과 속도를 그대로 옮긴다.
   * 진단 한 줄도 엔진이 낸 값에서만 나온다 — 화면이 문장을 지어내지 않는다.
   */
  /**
   * 시뮬 안쪽 상태 한 줄(54차). 7종 전부에 있다.
   * 초급에는 모터 상태 칸이 없으므로, 차가 왜 안 움직이는지 볼 곳이 여기뿐이다.
   * 문장은 엔진이 낸 값에서만 나온다 — 지어내지 않는다.
   */
  /** 위반 종류의 이름. 매니페스트가 소유한다 — 화면 코드에 종류 이름을 적지 않는다. */
  function vioLabel(kind) {
    const spec = ((challenge.rules || {}).violations || {})[kind];
    return (spec && spec.label) || '규칙 위반';
  }

  function paintSimSay() {
    const v = sim.vehicle;
    const pwmMax = (sim.steps && sim.steps.pwmMax) || 255;
    const speed = Math.round(Math.abs(((v.pwmL + v.pwmR) / 2) / pwmMax) * (sim.kitSpeed || 0));
    let text;
    if (v.pwmL === 0 && v.pwmR === 0) text = '멈춰 있어요';
    else if (v.pwmL > v.pwmR) text = '오른쪽으로 도는 중';
    else if (v.pwmR > v.pwmL) text = '왼쪽으로 도는 중';
    else text = '곧게 가는 중';
    let line = speed > 0 ? `${text} · ${speed} mm/s` : `${text} · 0 mm/s`;
    // 55차 마감 D' — 규칙을 어겨 서 있는 동안은 왜 섰는지를 말한다.
    // 페널티는 끝난 뒤 숫자로만 보이지만 멈춤은 지금 보인다 — 그것이 이 규칙의 값어치다.
    // 값은 엔진이 적어 둔 것을 옮기기만 한다.
    const stop = sim.stopRun;
    const stopping = !!(stop && stop.until > sim.tick && stop.last);
    if (stopping) {
      const left = Math.max(0, stop.until - sim.tick);
      const where = stop.last.label ? `${stop.last.label} — ` : '';
      line = `${where}${vioLabel(stop.last.kind)} · ${(left / 100).toFixed(1)}초 멈춤`;
    }
    el.simsay.classList.toggle('simsay--stop', stopping);
    if (el.simsay.textContent !== line) el.simsay.textContent = line;
  }

  function paintMotor() {
    const overlay = !el.simmotor.hidden;
    if (el.motorSection.hidden && !overlay) return;
    const v = sim.vehicle;
    const pwmMax = (sim.steps && sim.steps.pwmMax) || 255;
    const set = (barEl, numEl, pwm) => {
      barEl.style.width = `${Math.min(100, (Math.abs(pwm) * 100) / pwmMax)}%`;
      barEl.classList.toggle('is-back', pwm < 0);
      numEl.textContent = String(Math.round(pwm));
    };
    // 같은 값을 줬는데 좌우 바퀴가 실제로 다른 속도로 도는가 — 그 차이는 킷 특성(motor_trim)에서 온다.
    const trim = sim.challenge.motor_trim || { left: 1, right: 1 };
    const wl = v.pwmL * trim.left;
    const wr = v.pwmR * trim.right;
    const same = v.pwmL === v.pwmR && v.pwmL !== 0;
    const bent = Math.abs(wl - wr) > 0.5;
    const warn = same && bent;
    const speed = `${Math.round(Math.abs(((v.pwmL + v.pwmR) / 2) / pwmMax) * (sim.kitSpeed || 0))} mm/s`;
    const say = v.pwmL === 0 && v.pwmR === 0
      ? '멈춰 있어요'
      : (warn ? '같은 값을 줬는데 한쪽으로 휘고 있어요' : '곧게 잘 가고 있어요');
    if (!el.motorSection.hidden) {
      set(el.motorLBar, el.motorL, v.pwmL);
      set(el.motorRBar, el.motorR, v.pwmR);
      el.motorSpeed.textContent = speed;
      el.motorSay.textContent = say;
      el.motorSay.classList.toggle('is-warn', warn);
    }
    if (overlay) {
      // 가운데 0선에서 좌우로 뻗는다. 앞으로 돌면 오른쪽, 뒤로 돌면 왼쪽이다.
      const half = (barEl, pwm) => {
        const w = Math.min(50, (Math.abs(pwm) * 50) / pwmMax);
        barEl.style.width = `${w}%`;
        barEl.style.left = pwm < 0 ? `${50 - w}%` : '50%';
        barEl.classList.toggle('is-back', pwm < 0);
      };
      half(el.smLBar, v.pwmL);
      half(el.smRBar, v.pwmR);
      el.smL.textContent = String(Math.round(v.pwmL));
      el.smR.textContent = String(Math.round(v.pwmR));
      el.smSpeed.textContent = speed;
      // 진단 한 줄. 얼마나·어느 쪽인지는 킷 특성에서 계산해 옮길 뿐이다 — 문장을 지어내지 않는다.
      const gap = Math.round(Math.abs(wl - wr));
      el.smSay.textContent = warn && gap > 0
        ? `${wl > wr ? '오른쪽' : '왼쪽'}이 ${gap} 만큼 약해 ${wl > wr ? '오른쪽' : '왼쪽'}으로 휩니다`
        : say;
      el.smSay.classList.toggle('is-warn', warn);
    }
  }

  /** 카메라 줄의 상태 문구. 버튼만 있으면 지금 켜져 있는지 알 수 없다. */
  function paintCamLine() {
    if (el.camLine.hidden) return;
    const on = !!(webcam && webcam.active);
    el.camLineState.textContent = on ? '카메라 켜짐' : '지금 꺼져 있어요 — 눌러서 켜 주세요';
    el.camLineState.classList.toggle('is-on', on);
    el.camStartMain.hidden = on;
  }

  /**
   * 학습 결과. 세 칸의 정확도는 학습 패널이 LOOCV 로 낸 값을 그대로 옮긴다 —
   * 화면에서 만들어내지 않는다.
   */
  function paintTrainResult() {
    if (!showTrainResult) return;
    const m = mlModel;
    // 학습이 끝나면 학습 패널이 같은 자리에 칸별 정답률을 펼친다.
    // 그때는 이 카드를 내린다 — 같은 값을 두 번 보여 주지 않는다.
    const ready = !!(m && m.ready);
    el.trainResult.hidden = ready;
    if (ready) return;
    el.trAcc.textContent = '아직 없음';
    const html = '<p class="trainresult__empty">학습하면 여기에 결과가 나와요</p>';
    if (el.trBody.innerHTML !== html) el.trBody.innerHTML = html;
  }

  /** 학습 정확도 칩. 수치는 학습 패널(엔진)이 낸 값을 그대로 옮긴다. */
  function paintAccuracy() {
    if (el.accChip.hidden) return;
    const m = mlModel;
    el.accChip.textContent = m && m.ready ? `학습 정확도 ${m.accuracy}%` : '학습 정확도 —';
  }

  // ── 속도 조절 ───────────────────────────────────────────
  const speedSpec = challenge.scene.speed_control || null;
  if (speedSpec) {
    speedNow = store.readSpeed ? store.readSpeed(speedSpec.default) : speedSpec.default;
    if (!(speedNow >= speedSpec.min && speedNow <= speedSpec.max)) speedNow = speedSpec.default;
    el.speedCard.hidden = false;
    el.speedLabel.textContent = speedSpec.label;
    el.speedNote.textContent = speedSpec.note;
    el.speedRange.min = String(speedSpec.min);
    el.speedRange.max = String(speedSpec.max);
    el.speedRange.step = String(speedSpec.step);
    const paintSpeed = () => {
      el.speedRange.value = String(speedNow);
      el.speedValue.textContent = String(speedNow);
    };
    const setSpeed = (v) => {
      const step = speedSpec.step;
      const snapped = Math.round((v - speedSpec.min) / step) * step + speedSpec.min;
      speedNow = Math.max(speedSpec.min, Math.min(speedSpec.max, snapped));
      paintSpeed();
      if (store.writeSpeed) store.writeSpeed(speedNow);
    };
    el.speedRange.addEventListener('input', () => setSpeed(Number(el.speedRange.value)));
    el.speedDown.addEventListener('click', () => setSpeed(speedNow - speedSpec.step));
    el.speedUp.addEventListener('click', () => setSpeed(speedNow + speedSpec.step));
    paintSpeed();
  }
  /** 주행 중에는 잠근다. 달리는 도중에 속도가 바뀌면 그 기록이 무엇의 기록인지 알 수 없다. */
  function lockSpeed(locked) {
    if (!speedSpec) return;
    el.speedCard.classList.toggle('is-locked', locked);
    for (const node of [el.speedRange, el.speedDown, el.speedUp]) node.disabled = locked;
  }

  // ── 챌린지 바 · 조작 줄 · 배속 ─────────────────────────
  // 52차 — 2행에는 지금 보고 있는 챌린지의 것만 둔다: 이름 · 난이도 · 목표 기록.
  // 값은 전부 카탈로그와 매니페스트에서 나온다.
  if (challenge.scene.summary) el.viewHead.hidden = true;
  el.headerTitle.textContent = challenge.title;
  {
    const tier = (entry && entry.difficulty) || null;
    if (tier && DIFF_LABEL[tier]) {
      el.chTier.hidden = false;
      el.chTier.textContent = DIFF_LABEL[tier];
      el.chTier.dataset.tier = tier;
    }
    const goal = challenge.scoring && challenge.scoring.goal_ticks;
    if (typeof goal === 'number') {
      el.chGoal.hidden = false;
      el.chGoal.textContent = `목표 ${formatGoal(formatTicks(goal))}초`;
    }
  }
  if (ui.playback_speed === false) el.speed.remove();
  // 54차 — 조작 줄은 7종 모두 시뮬 칸 안쪽 왼쪽 위 알약으로 들어간다.
  // 밖에 두면 그 높이만큼 시뮬이 눌리고, 챌린지마다 위/아래로 갈려 자리가 흔들렸다.
  el.simctl.append(el.tick.closest('.transport'));
  if (ui.transport === 'top' && el.coursebar.isConnected) el.canvas.closest('.view').after(el.coursebar);
  if (ui.submit_label) el.submitOpen.textContent = ui.submit_label;
  // 52차 — 조작 줄 라벨은 셸이 정한다(시작 · 정지). 챌린지마다 덮어쓰지 않는다.
  // 52차 — 코드 설명은 기본 접힘이다. 매니페스트가 다른 이름을 쓰면 그것을 따른다.
  if (ui.api_title) {
    const head = el.apiFold.querySelector('summary span');
    if (head) head.textContent = ui.api_title;
  }
  // 54차 — 모터 상태를 어디에 둘지는 매니페스트가 정한다.
  //   false      아무 데도 두지 않는다(초급). 시뮬 안 상태 한 줄이 그 일을 맡는다.
  //   'overlay'  시뮬 오른쪽 위 계기 카드(중급·상급). 편차 보정이 학습 목표라 트랙 옆에 있어야 한다.
  //   true       오른쪽 칸(옛 자리)
  if (ui.motor_panel === 'overlay') el.simmotor.hidden = false;
  else if (ui.motor_panel) el.motorSection.hidden = false;
  // 54차 보강6-3 — 판단 지점이 있는 챌린지에서는 하단 띠를 세우지 않는다.
  // 오른쪽 [클리어 현황] 이 같은 여섯 곳을 지점 번호·상황 이름·통과/위반까지 다 보여 준다.
  // 같은 값을 두 곳에 적지 않는다(계기판 카드를 뺀 것과 같은 이유).
  if (ui.coursebar_label && sim.decisions) el.coursebar.remove();
  // 52차 — 구간 8칸 띠는 없앴다. 구간별 기록은 결과 모달의 표로 옮겼다.
  // 판단 지점 바(스마트시티)는 성격이 달라 그대로 둔다.
  if (ui.columns) {
    el.shell.classList.add('shell--v2');
    el.shell.style.setProperty('--v2-col', `${ui.columns}px`);
    if (ui.columns_min) el.shell.style.setProperty('--v2-min', `${ui.columns_min}px`);
    // 54차 — 코드 칸만 따로 정한다. 없으면 지금까지처럼 좌우가 같은 폭이다.
    // 좁은 화면에서도 이 폭을 지킨다 — 3행 툴바가 여기에 맞춰 서 있어서, 좁아지면
    // [✓ 컴파일] [→ 업로드] 와 오른쪽 링크가 한 줄에 안 들어간다.
    if (ui.code_columns) {
      el.shell.style.setProperty('--v2-left', `${ui.code_columns}px`);
      el.shell.style.setProperty('--v2-left-min', `${ui.code_columns}px`);
    }
  }

  // 코드가 없는 챌린지는 [→ 업로드] 가 할 일이 없다. 실행 버튼만 남는다.
  if (hideCode) el.verify.hidden = true;

  /**
   * 챌린지 규칙 모달(52-1차 파트B).
   *
   * 📖 가이드라인은 "어떻게 조작하는가" 를 맡는다. 여기는 "무엇이 성공이고 무엇이 실패인가" 다.
   * 입구가 둘인데 같은 모달이 열리면 학생은 둘 중 하나를 안 누른다.
   *
   * 값은 전부 매니페스트에서 온다 — 목표·규칙은 챌린지 매니페스트가, 킷 스펙은 킷 매니페스트가.
   * 52차에 스타터 주석에서 뺀 수치가 여기로 왔다. 코드에 기본값을 두지 않는다.
   */
  function paintRules() {
    const rulesSpec = challenge.scene.rules || {};
    const rows = [];
    const goal = challenge.scoring && challenge.scoring.goal_ticks;
    if (typeof goal === 'number') rows.push(['목표 기록', `${formatGoal(formatTicks(goal))}초 안에 완주`]);
    const gb = ui.goal_banner || {};
    if (gb.record && gb.record.text) rows.push(['합격 조건', gb.record.text]);
    if (gb.fail && gb.fail.text) rows.push(['실패 조건', gb.fail.text]);
    if (gb.limit && gb.limit.text) rows.push(['제한 시간', gb.limit.text]);
    const pen = (challenge.scoring && challenge.scoring.penalty) || {};
    if (pen.offtrack_ticks) {
      rows.push(['페널티', `${word('offtrack')} 한 번마다 +${formatGoal(formatTicks(pen.offtrack_ticks))}초`]);
    }
    if (pen.violation_ticks) rows.push(['페널티', `규칙 위반 한 번마다 +${formatGoal(formatTicks(pen.violation_ticks))}초`]);
    // 53차 — 오른쪽 '이 챌린지 규칙' 칸을 없애면서 그 칸에만 있던 줄을 이리로 옮겼다.
    // 같은 말을 두 곳에 두지 않기 위한 삭제이므로, 없어지는 말이 있으면 안 된다.
    rows.push(['돌아야 할 바퀴', `${challenge.mission.laps}바퀴`]);
    if (challenge.rules.no_progress) {
      rows.push(['멈춤 종료', `${Math.round(challenge.rules.no_progress.sim_ticks / 100)}초 동안 앞으로 못 가면 끝`]);
    }
    const decisionKinds = new Set((challenge.scene.decisions || []).map((x) => x.expect));
    if (decisionKinds.has('signal')) {
      rows.push(['신호등 지점', '구역에 들어가는 순간의 신호가 정답이에요. 들어간 뒤에 색이 바뀌어도 채점은 그대로예요']);
    }
    if (decisionKinds.has('situation')) {
      rows.push(['횡단보도 · 건널목', '구역 안에서 계속 다시 봐요. 뒤늦게 보행자가 들어오면 그때부터 정지가 정답이에요']);
      rows.push(['정지 판정', '보행자·차단기 앞에서는 시간을 세지 않아요. 막혀 있는 동안 지나가지만 않으면 지킨 거예요']);
      // 55차 마감 F' — 상황 지점의 정답은 '기다리기' 다. 그 말이 지금까지 흐리게만 적혀 있었다.
      rows.push(['그래서 할 일', '비킬 때까지 정지 판을 들고 기다리세요. 길이 열리면 그때 진행 판으로 바꿉니다']);
    }
    // 55차 보강8 F — 무엇을 해야 하는지를 화면이 알려 주지 않는다는 사실 자체를 말해 둔다.
    // 알려 주지 않는 것이 고장이 아니라 이 챌린지가 가르치려는 것이다.
    if (decisionKinds.size && !revealExpect) {
      rows.push(['정답은 안 알려 줘요', '지점 앞에서 무엇을 해야 하는지는 화면이 말해 주지 않습니다. 학습한 모델이 판단합니다. 지나간 뒤 오른쪽 현황에서 요구와 내 판단을 나란히 볼 수 있어요']);
    }
    // 규칙을 어기면 그 자리에 선다. 페널티가 아니라 실제로 늦어지는 것이 벌이다(55차 마감 D').
    const stopMs = (challenge.rules || {}).violation_stop_ms;
    const stopDefault = typeof stopMs === 'number' ? stopMs : (stopMs && stopMs.default);
    if (stopDefault) {
      rows.push(['규칙을 어기면', `그 자리에 ${(stopDefault / 1000).toFixed(0)}초 멈춥니다. 멈춘 시간은 기록에 그대로 들어가요`]);
    }
    // 계층 이름('기본 + 카메라')은 학생이 읽어도 할 일이 바뀌지 않는 내부 분류어다.
    // 쓸 수 있는 함수는 화면에 상시 떠 있는 코드 설명 패널이 서명까지 들고 있다(renderApiList).
    const apiLayers = new Set(challenge.allowed_api.map((n) => (API_REGISTRY[n] ? API_REGISTRY[n].layer : 'basic')));

    const d = kit.drive;
    const pins = kit.pins || {};
    const spec = [
      ['바퀴 속도', `PWM ${d.pwm_max} 에서 ${d.max_speed_mm_s} mm/s`],
      ['안 움직이는 구간', `PWM ${d.deadzone_pwm} 미만`],
      ['기본 PWM', String(d.default_pwm)],
      // 52차에 스타터에서 지운 주석 가운데, 값 표에도 규칙에도 들어가지 않는 사실 하나.
      ['delay 단위', `${TICK_MS}ms (그보다 잘게 주면 반올림돼요)`],
    ];
    // 핀 번호는 핀 제어 API 를 연 챌린지에서만 쓸 수 있다. 못 쓰는 곳에는 적지 않는다.
    if (apiLayers.has('pin')) {
      spec.push(['실물 배선', `R ${pins.MOTOR_R_PIN_1}·${pins.MOTOR_R_PIN_2} / L ${pins.MOTOR_L_PIN_1}·${pins.MOTOR_L_PIN_2}번 핀`]);
    }

    // 둘 다 시뮬레이터 화면에 이미 떠 있는 값이라 접어 둔다. 필요할 때만 펴서 본다.
    const fold = (title, pairs) => {
      const box = document.createElement('details');
      box.className = 'rfold';
      const cap = document.createElement('summary');
      cap.className = 'rfold__sum';
      cap.textContent = title;
      const list = document.createElement('dl');
      list.className = 'rfold__dl';
      for (const [k, v] of pairs) {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        list.append(dt, dd);
      }
      box.append(cap, list);
      return box;
    };
    // ── 1 이번 챌린지 ─────────────────────────────────────
    const head = document.createElement('div');
    head.className = 'rbox';
    const headL = document.createElement('div');
    const goalLine = document.createElement('b');
    goalLine.className = 'rbox__goal';
    goalLine.textContent = (gb.goal && gb.goal.text) || (typeof goal === 'number' ? `${formatGoal(formatTicks(goal))}초 안에 완주` : '');
    const sum = document.createElement('p');
    sum.className = 'rbox__sum';
    sum.textContent = rulesSpec.summary || '';
    headL.append(goalLine, sum);
    const headR = document.createElement('div');
    headR.className = 'rbox__best';
    const bestTicks = hud.bestTicks();
    headR.innerHTML = `<span>내 최고 기록</span><b>${bestTicks === null ? '아직 없음' : `${formatTicks(bestTicks)}초`}</b>`;
    head.append(headL, headR);

    const parts = [head];

    // ── 2 이렇게 깹니다 ───────────────────────────────────
    // 그림은 에셋 슬롯이다. 코드로 그리지 않는다 — 파일이 없으면 점선 자리로 비워 둔다.
    const steps = rulesSpec.steps || [];
    if (steps.length) {
      const h = document.createElement('div');
      h.className = 'rules__h';
      h.textContent = '이렇게 깹니다';
      const strip = document.createElement('div');
      strip.className = 'rsteps';
      steps.forEach((st, i) => {
        const cell = document.createElement('figure');
        cell.className = 'rstep';
        const art = assets.resolve(st.image);
        const frame = document.createElement('div');
        frame.className = art ? 'rstep__art' : 'rstep__art rstep__art--empty';
        if (art && art.kind !== 'frames') {
          const img = document.createElement('img');
          img.src = art.image ? art.image.src : art.src;
          img.alt = '';
          frame.append(img);
        } else if (!art) {
          frame.textContent = `${i + 1}`;
        }
        const cap = document.createElement('figcaption');
        cap.textContent = st.text || '';
        cell.append(frame, cap);
        strip.append(cell);
      });
      parts.push(h, strip);
    }

    // ── 3 이 값을 바꿔 보세요 ─────────────────────────────
    // '지금 값' 은 학생이 지금 들고 있는 코드에서 읽는다. 화면에 기본값을 박지 않는다.
    const tune = rulesSpec.tune || [];
    if (tune.length) {
      const h = document.createElement('div');
      h.className = 'rules__h';
      h.textContent = '이 값을 바꿔 보세요';
      const tbl = document.createElement('div');
      tbl.className = 'rtune';
      tbl.innerHTML = '<span class="rtune__k">이름</span><span class="rtune__k">지금 값</span>'
        + '<span class="rtune__k">바꾸면 어떻게 되나</span>';
      const src = editor.getValue();
      for (const t of tune) {
        const m = new RegExp(`\\b${t.name}\\s*=\\s*(-?\\d+)`).exec(src);
        const name = document.createElement('code');
        name.textContent = t.name;
        const val = document.createElement('b');
        val.className = 'rtune__v';
        val.textContent = m ? m[1] : '—';
        const eff = document.createElement('span');
        eff.textContent = t.effect || '';
        tbl.append(name, val, eff);
      }
      parts.push(h, tbl);
    }

    // ── 4·5 합격과 실패 · 킷 스펙 ─────────────────────────
    if (rows.length) parts.push(fold('합격과 실패', rows));
    parts.push(fold(`킷 스펙 — ${kit.name}`, spec));

    el.rulesBody.replaceChildren(...parts);
    el.rulesBody.scrollTop = 0;
  }

  /** 규칙 창을 연다. 입구는 둘이지만([챌린지 규칙] · 📖) 창은 하나다. */
  function openRules() {
    paintRules();
    el.howtoSkip.checked = store.howtoSkipped();
    el.rulesModal.hidden = false;
  }

  el.rulesOpen.addEventListener('click', () => openRules());
  el.rulesClose.addEventListener('click', () => { el.rulesModal.hidden = true; });
  el.rulesModal.addEventListener('click', (e) => { if (e.target === el.rulesModal) el.rulesModal.hidden = true; });

  // ── 목표 배너 ───────────────────────────────────────────
  // "17초가 잘한 것인가" 를 알 방법이 없어서 둔다. 네 칸의 이름도 값도 매니페스트가 소유하고,
  // 화면 코드는 칸이 무슨 뜻인지 모른다 — 문구를 여기에 박으면 챌린지마다 못 바꾼다.
  if (goalCells.length) {
    el.goalbar.hidden = false;
    el.goalbar.replaceChildren(...goalCells.map(([key, cell]) => {
      const d = document.createElement('div');
      d.className = `goalbar__cell goalbar__cell--${key}`;
      const k = document.createElement('span');
      k.className = 'goalbar__key';
      k.textContent = cell.label;
      const v = document.createElement('b');
      v.className = 'goalbar__val';
      v.textContent = cell.text;
      d.append(k, v);
      return d;
    }));
  }

  // ── 오른쪽 열 ───────────────────────────────────────────
  for (const [name, node] of [['briefing', el.briefingFold], ['eventlog', el.eventlogSection],
    ['history', el.historyFold], ['best', el.bestFold]]) {
    if (hiddenCards.has(name) && node) node.remove();
  }
  // 54차 파트M — 관제 화면에서는 기록이 시뮬 옆 시트로 내려간다. 오른쪽 칸에 또 두면
  // 같은 값을 두 번 적고 그만큼 현황판과 카메라가 밀린다.
  if (dashboard) el.recordPlain.remove();
  if (ui.record_panel === 'plain' && !dashboard) {
    el.recordPlain.hidden = false;
    if (el.bestFold) el.bestFold.remove();
    // '현재 시도' 카드는 기록 카드와 같은 값을 두 번 보여 준다. 계기를 기록 안으로 합친다.
    const attemptCard = el.gaugeMount.closest('.pane__section');
    el.recordStatus.append(el.status);
    if (attemptCard) attemptCard.remove();
    // 53차 — 계열이 무엇을 위에 두는지 정한다.
    //   이동제어  모터 상태 → 기록 → 위에서 본 트랙
    //   색상제어  카메라 시점(2단) → 기록 → 위에서 본 트랙
    // 계열마다 다른 것은 맨 위 한 칸뿐이고, 기록과 탑뷰는 어느 계열에나 같은 자리에 있다.
    // 쓰지 않는 칸은 이미 DOM 에서 빠져 있으므로 이 순서만으로 두 모양이 다 나온다.
    const rail = el.recordPlain.parentElement;
    for (const node of [el.simcolor, el.motorSection, el.recordPlain, el.minimapSection]) {
      if (node && node.isConnected) rail.append(node);
    }
  }
  // 오른쪽 열이 자리를 잡은 뒤에 카메라 칸 폭을 잰다(관제 화면은 위 dashboard 절에서 이미 옮겼다).
  setupCamCells();

  /**
   * 최근 시도에 들어갈 줄 수. 카드가 자란 만큼 채우되 넘기지 않는다(55차).
   * 줄 높이는 이미 그려진 줄에서 재고, 잴 것이 없으면 다섯 줄로 시작한다.
   */
  // 자리가 없으면 줄여서라도 넘치지 않는다 — 1280x720 에서는 다섯 줄도 23px 넘쳤다.
  const RECENT_MIN = 1;
  const RECENT_MAX = 20;
  function recentRoom() {
    const box = el.recPrev;
    if (!box || !box.isConnected) return RECENT_MIN;
    const one = box.querySelector('.try:not(.try--none)');
    const card = box.closest('.record__recent');
    if (!one || !card) return RECENT_MIN;
    const step = one.getBoundingClientRect().height + 4;   // 줄 높이 + gap
    if (!(step > 0)) return RECENT_MIN;
    const avail = card.getBoundingClientRect().bottom - box.getBoundingClientRect().top;
    return Math.max(RECENT_MIN, Math.min(RECENT_MAX, Math.floor((avail + 4) / step)));
  }

  /*
   * 카메라 두 칸의 폭 (55차 보강7).
   *
   * 두 칸은 1px 도 달라서는 안 된다 — 인식 결과 박스가 원본과 어긋난다.
   * 1fr 로 나누면 열 폭이 홀수일 때 149.5 가 149/150 으로 갈리므로 정수 폭을 재서 넣는다.
   *
   * 재는 시점이 핵심이다. 화면을 세우는 동안 .camview 는 잠깐 시뮬 위에 떠 있는
   * 절대 위치 158px 창이다(옛 미니창 자리). 그때 재면 156px 을 읽어 칸이 77px 로 굳는다 —
   * 보강7 에서 배포본이 76 x 57 로 남은 것이 이것이다.
   * 그래서 두 가지를 지킨다.
   *   · 오른쪽 열에 자리를 잡은 뒤(아래 호출 지점)에 처음 잰다.
   *   · 아직 떠 있는 상태(position: absolute)면 값을 쓰지 않는다 —
   *     한 번 잘못 쓰면 그 값이 그대로 굳기 때문이다.
   * resize 를 흉내 내 부르지 않는다. 폭이 바뀌는 것은 ResizeObserver 가 알려 준다.
   */
  function setupCamCells() {
    if (!camView || !el.camview.classList.contains('camview--row')) return;
    const box = el.camviewStages;
    const fit = () => {
      // 아직 시뮬 위에 떠 있는 동안은 재지 않는다. 그때 폭은 이 칸의 폭이 아니다.
      if (!box.isConnected || getComputedStyle(el.camview).position !== 'static') return;
      const w = box.clientWidth;
      if (!w) return;
      // 칸 사이 선은 자리를 차지하지 않는다(가상 요소). 그래서 폭을 그냥 반으로 나눈다.
      const cell = Math.floor(w / 2);
      if (cell > 0) box.style.setProperty('--camcell', `${cell}px`);
    };
    fit();
    if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(box);
  }

  /** 기록 패널. 값은 전부 hud(엔진 집계)에서 온다 — 여기서 다시 세지 않는다. */
  function paintRecord() {
    if (el.recordPlain.hidden || !el.recordPlain.isConnected) return;
    const best = hud.bestTicks();
    const needs = (challenge.scoring && challenge.scoring.best_requires) || null;
    el.recBest.textContent = best === null
      ? ((needs && needs.empty_text) || '아직 없음')
      : `${formatTicks(best)}초`;
    el.recBest.classList.toggle('is-hint', best === null && !!(needs && needs.empty_text));
    const now = currentLapTicks(sim);
    el.recNow.textContent = now === null ? '아직 없음' : `${formatTicks(now)}초`;
    // 54차 — 최근 시도 다섯 줄. [회차] [배지] [기록].
    // 배지는 셋뿐이다: 최고 · 완주 · 이탈 n. 값은 저장된 행에 적힌 그대로다.
    // 55차 — 다섯 줄로 고정하면 큰 화면에서는 자란 카드가 안 차고(실측 194px),
    // 720p 에서는 오히려 23px 넘쳤다. 줄 수를 자리에 맞춘다 —
    // 줄 높이는 이미 그려진 줄에서 재고, 넘치게도 모자라게도 두지 않는다.
    const prev = hud.recentRuns ? hud.recentRuns(recentRoom()) : [];
    // 54차 보강6-6 — 0건이면 라벨만 뜨고 아래가 비어 있었다. 한 줄로 사실을 적는다.
    el.recPrev.classList.toggle('tries--none', prev.length === 0);
    if (!prev.length) {
      if (el.recPrev.innerHTML !== '<li class="try try--none">아직 없어요</li>') {
        el.recPrev.innerHTML = '<li class="try try--none">아직 없어요</li>';
      }
      return;
    }
    const html = prev.map((r) => {
      const badge = r.isBest
        ? '<span class="try__badge try__badge--best">최고</span>'
        : (r.offtrack > 0
          ? `<span class="try__badge try__badge--off">${word('offtrack')} ${r.offtrack}</span>`
          : '<span class="try__badge">완주</span>');
      return `<li class="try"><span class="try__no">${r.no}회</span>${badge}`
        + `<b class="try__t">${formatTicks(r.ticks)}초</b></li>`;
    }).join('');
    if (el.recPrev.innerHTML !== html) el.recPrev.innerHTML = html;
  }

  // ── 규칙 · 사용법 (54차: 창 하나) ────────────────────────
  // [챌린지 규칙] 과 📖 가 같은 창을 연다. 첫 방문에 한 번 저절로 열리고,
  // "다음부터 열지 않기" 를 켜면 그 뒤로는 눌러야 열린다. 이 상태는 브라우저에만 남는다.
  el.howtoSkip.checked = store.howtoSkipped();
  el.howtoSkip.addEventListener('change', () => store.setHowtoSkipped(el.howtoSkip.checked));
  // 규칙 창과 첫 안내(말풍선)가 겹쳐 뜨면 둘 다 못 읽는다. 창을 닫은 뒤에 안내가 시작된다.
  const closeRules = () => {
    el.rulesModal.hidden = true;
    if (!guideSeen()) requestAnimationFrame(() => quest.start());
  };
  el.howtoStart.addEventListener('click', closeRules);
  // 기존의 초기 자동 팝업을 제거하고 튜토리얼 퀘스트로 유도하기 위해 false로 설정
  const rulesAutoOpen = false;
  if (rulesAutoOpen) requestAnimationFrame(() => openRules());

  /** 완주 기록이 생기면 최고 기록을 자동으로 펼치고 제출 버튼을 눈에 띄게 한다. */
  function reflectRecords() {
    const has = hud.bestTicks() !== null;
    el.submitOpen.classList.toggle('btn--ready', has);
    el.submitOpen.classList.toggle('btn--quiet', !has);
    if (has && !folds.best.open) { folds.best.open = true; foldState.best = true; saveFolds(); }
  }
  reflectRecords();
  // ── [학습] / [코드] 탭 ───────────────────────────────────
  // 코드 에디터는 그대로 두고 탭으로만 나눈다. 학습 탭은 ml 설정이 있는 챌린지에서만 나온다.
  if (usesMl) {
    // 코드를 감춘 챌린지에서는 탭 자체가 없다 — 학습 화면 하나뿐이다.
    el.paneTabs.hidden = hideCode;
    el.paneLabel.hidden = true;
    train = createTrain({
      mount: el.trainMount,
      classNames: mlClassNames,
      store,
      webcam,
      onNotice: (text, level) => showNotice(text, level),
      onModel: (model) => {
        mlModel = model;
        mlLast = { label: 0, confidence: 0, scores: [0, 0, 0] };
        paintMlRead();
      },
    });
    // 저장해 둔 샘플이 있으면 바로 학습된 상태로 시작한다(수치는 엔진이 다시 낸다).
    const showTab = (which) => {
      const onTrain = which === 'train';
      el.trainMount.hidden = !onTrain;
      el.editorMount.hidden = onTrain || hideCode;
      el.edTabs.hidden = onTrain || hideCode;
      el.edStatbar.hidden = onTrain || hideCode;
      el.tabTrain.classList.toggle('is-on', onTrain);
      el.tabCode.classList.toggle('is-on', !onTrain);
      if (!onTrain && !hideCode) editor.setValue(editor.getValue());   // 숨김 중에 어긋난 줄 높이를 다시 잰다
    };
    el.tabTrain.addEventListener('click', () => showTab('train'));
    el.tabCode.addEventListener('click', () => showTab('code'));
    showTab('train');
    el.mlread.hidden = false;
  }

  /** 추론 결과 표시. 오분류가 눈에 보여야 데이터를 더 모을 이유를 안다. */
  function paintMlRead() {
    if (!usesMl) return;
    const name = mlLast.label === 0 ? '모름' : (mlClassNames[mlLast.label - 1] || '?');
    el.mlLabel.textContent = name;
    el.mlConf.textContent = `${mlLast.confidence}%`;
    // RC카가 보는 화면 위에도 같은 결과를 얹는다 — 무엇을 보고 그렇게 달리는지가 붙어 있어야 한다.
    if (el.fpvLabel) {
      el.fpvLabel.textContent = name;
      el.fpvConf.textContent = `${mlLast.confidence}%`;
      el.fpvRead.dataset.label = String(mlLast.label);
    }
    el.mlBars.replaceChildren(...mlClassNames.map((name, i) => {
      const row = document.createElement('div');
      row.className = `mlread__bar${mlLast.label === i + 1 ? ' is-on' : ''}`;
      const label = document.createElement('span');
      label.textContent = name;
      const track = document.createElement('i');
      const fill = document.createElement('b');
      fill.style.width = `${mlLast.scores[i] || 0}%`;
      track.append(fill);
      const num = document.createElement('em');
      num.textContent = `${mlLast.scores[i] || 0}`;
      row.append(label, track, num);
      return row;
    }));
  }

  const EXPECT_TAG = { stop: '정지', slow: '서행', go: '진행' };
  const COLOR_TAG = { red: '빨강', yellow: '노랑', green: '초록' };

  // ── 이벤트 로그 ──────────────────────────────────────────
  // 엔진 상태가 바뀐 순간만 한 줄씩 남긴다. 문장을 지어내지 않는다.
  let evSignal = null;
  let evActive = null;
  let evResults = 0;
  let evOff = 0;
  let evLap = 0;
  let evObs = 0;
  let evBlock = null;
  function resetEvents() {
    if (eventLog) eventLog.clear();
    evSignal = null; evActive = null; evResults = 0; evOff = 0; evLap = 0;
    evObs = 0; evBlock = null;
  }
  /** 움직이는 장애물 — 다가오는 것이 길을 막는 순간과, 막힌 채로 지나간 순간을 남긴다. */
  function pumpObstacleEvents() {
    const ost = obstacleState(sim);
    if (!ost) return;
    if (ost.near) {
      const key = `${ost.near.id}:${ost.near.blocking ? 'block' : 'clear'}`;
      if (evBlock !== key) {
        if (evBlock !== null) {
          eventLog.push(sim.tick, `${ost.near.label} ${ost.near.blocking ? '막힘' : '열림'}`, 'signal');
        }
        evBlock = key;
      }
    }
    while (evObs < ost.results.length) {
      const r = ost.results[evObs];
      eventLog.push(sim.tick, `${r.label} 막힌 채로 지나감 · 위반`, 'miss');
      evObs += 1;
    }
  }

  function pumpEvents() {
    if (!eventLog) return;
    const st = decisionState(sim);
    const cfg = sim.decisions;
    if (!st) { pumpObstacleEvents(); return; }
    // 다가오는 지점의 신호만 따라간다 — 여섯 개를 다 적으면 로그가 신호로 덮인다.
    if (st.next) {
      const d = cfg.list.find((x) => x.id === st.next.id);
      const color = d ? signalColorOf(sim, d, sim.tick) : null;
      if (color) {
        const key = `${st.next.id}:${color}`;
        if (evSignal !== key) {
          if (evSignal !== null) eventLog.push(sim.tick, `${st.next.label} 신호 ${COLOR_TAG[color]}`, 'signal');
          evSignal = key;
        }
      }
    }
    const activeId = st.active ? st.active.id : null;
    if (activeId !== evActive) {
      // 55차 보강9 — 진입 줄에서 '무엇을 해야 함' 을 뗀다. 배지·이름표와 같은 값에서 나온
      // 같은 낱말이라, 여기만 남겨 두면 로그를 보고 알 수 있다. 어디에 들어갔는지는 위치이지
      // 정답이 아니므로 진입 줄 자체는 남긴다. 판정이 끝난 뒤 찍히는 줄은 그대로다.
      if (activeId) {
        eventLog.push(sim.tick, revealExpect
          ? `${st.active.label} 진입 — ${EXPECT_TAG[st.active.expect]} 해야 함`
          : `${st.active.label} 진입`);
      }
      evActive = activeId;
    }
    while (evResults < st.results.length) {
      const r = st.results[evResults];
      const seen = r.seen ? EXPECT_TAG[{ 1: 'stop', 2: 'slow', 3: 'go' }[r.seen]] : '모름';
      eventLog.push(sim.tick, `${r.id} ${seen} 인식 · ${r.ok ? '준수' : '위반'}`, r.ok ? 'hit' : 'miss');
      evResults += 1;
    }
    pumpObstacleEvents();
    if (sim.offtrack.count > evOff) { evOff = sim.offtrack.count; eventLog.push(sim.tick, `코스를 벗어남 (${evOff}회)`, 'miss'); }
    if (sim.lap.count > evLap) { evLap = sim.lap.count; eventLog.push(sim.tick, `한 바퀴 완주 — ${formatTicks(sim.lap.lastTicks)}초`, 'hit'); }
    // 55차 파트D — st.next.remain_mm 는 '중심선 위에서 그 지점의 중심까지 남은 거리'다.
    // 구간 안에 이미 들어와 있어도 중심을 아직 안 지났으면 그 지점이 next 로 잡혀 0.0m 로 읽혔다.
    // 엔진은 그대로 두고, 판정 중인 지점(st.active)이 있으면 화면이 그쪽을 먼저 말한다.
    if (el.clearChip) {
      el.clearChip.textContent = st.active
        ? `지금 ${st.active.label} 판정 중`
        : (st.next ? `다음 ${st.next.label} ${(st.next.remain_mm / 1000).toFixed(1)}m` : '—');
    }
  }

  // ── 54차 파트M — 클리어 현황판 · 지금 보는 것 · 기록 시트 ──────
  const CLEAR_STATE = {
    ok: ['통과', 'is-ok'],
    bad: ['위반', 'is-bad'],
    now: ['앞두고 있음', 'is-now'],
    none: ['—', ''],
  };

  /**
   * 여섯 줄 현황판. 판정은 엔진(decisionState)이 한 것을 옮기기만 한다 —
   * 결과 모달의 판단 지점 표와 같은 자료다. 화면이 다시 세지 않는다.
   */
  function clearRows() {
    const cfg = sim.decisions;
    if (!cfg) return [];
    const st = sim.decisionRun;
    const done = new Map((st ? st.results : []).map((r) => [r.id, r]));
    const nextId = st && st.next ? st.next.id : (st && st.active ? st.active.id : null);
    const SEEN_ACT = { 1: 'stop', 2: 'slow', 3: 'go' };
    return cfg.list.map((d, i) => {
      const r = done.get(d.id);
      const key = r ? (r.ok ? 'ok' : 'bad') : (d.id === nextId ? 'now' : 'none');
      // 55차 보강8 D — 지나간 지점에만 요구와 실제를 붙인다. 앞둔 지점에는 붙이지 않는다 —
      // 붙이면 B·C 로 가린 것을 여기서 도로 알려 주는 셈이 된다.
      // 두 값 다 엔진이 채점할 때 이미 적어 둔 것이다. 여기서 다시 판단하지 않는다.
      const why = r
        ? `요구 ${EXPECT_TAG[r.expect] || '—'} · 한 것 ${EXPECT_TAG[SEEN_ACT[r.seen]] || '모름'}`
        : '';
      return { no: i + 1, name: d.label, key, why };
    });
  }

  function paintClearBoard() {
    if (!el.clearSection || el.clearSection.hidden) return;
    const rows = clearRows();
    const html = rows.map((r) => {
      const [text, cls] = CLEAR_STATE[r.key];
      return `<li class="clear__row ${cls}"><b class="clear__n">${r.no}</b>`
        + `<span class="clear__t">${escapeHtml(r.name)}</span>`
        + `<span class="clear__s">${text}</span>`
        + (r.why ? `<span class="clear__why">${escapeHtml(r.why)}</span>` : '')
        + '</li>';
    }).join('');
    if (el.clearList.innerHTML !== html) el.clearList.innerHTML = html;
    const ok = rows.filter((r) => r.key === 'ok').length;
    const bad = rows.filter((r) => r.key === 'bad').length;
    const left = rows.length - ok - bad;
    // 55차 파트C — 이 숫자는 판단 지점 여섯 곳만 센다. 기록 시트의 '규칙 위반'(장애물까지 합한 값)과
    // 다른 것을 세므로 같은 이름을 쓰지 않는다.
    const sum = `지점 통과 ${ok} · 지점 위반 ${bad} · 남음 ${left}`;
    if (el.clearSum.textContent !== sum) el.clearSum.textContent = sum;
  }

  /** 지금 보는 것. 값은 추론기가 낸 것을 옮기기만 한다. */
  function paintSimSee() {
    if (el.simsee.hidden) return;
    const name = mlLast.label === 0 ? '모름' : (mlClassNames[mlLast.label - 1] || '?');
    el.ssLabel.textContent = name;
    el.ssConf.textContent = `${mlLast.confidence}%`;
    el.ssBars.replaceChildren(...mlClassNames.map((cls, i) => {
      const row = document.createElement('div');
      row.className = `simsee__bar${mlLast.label === i + 1 ? ' is-on' : ''}`;
      const k = document.createElement('span');
      k.textContent = cls;
      const t = document.createElement('i');
      const f = document.createElement('b');
      f.style.width = `${mlLast.scores[i] || 0}%`;
      t.append(f);
      const n = document.createElement('em');
      n.textContent = String(mlLast.scores[i] || 0);
      row.append(k, t, n);
      return row;
    }));
  }

  /** 시뮬 옆 기록 시트. 값은 전부 엔진 집계에서 온다. */
  function paintSimSheet() {
    if (el.simsheet.hidden) return;
    const now = currentLapTicks(sim);
    el.shNow.textContent = now === null ? '0.000초' : `${formatTicks(now)}초`;
    const best = hud.bestTicks();
    el.shBest.textContent = `내 최고 기록 ${best === null ? '—' : `${formatTicks(best)}초`}`;
    el.shLap.textContent = `${sim.lap.count + 1}바퀴째`;
    const started = sim.tick > 0;
    el.shOff.textContent = started ? String(sim.offtrack.count) : '—';
    el.shVio.textContent = started ? String(scoreRun(sim, sim.tick).violations) : '—';
    const rows = clearRows();
    const judged = rows.filter((r) => r.key === 'ok' || r.key === 'bad').length;
    el.shPts.textContent = rows.length ? `${judged}/${rows.length}` : '—';
    el.shOffCap.firstChild.textContent = `${word('offtrack')} `;
    // 이 칸의 이름도 매니페스트가 소유한다. 현황판의 '지점 위반' 과 겹치면 안 된다.
    el.shVioCap.firstChild.textContent = `${word('violations')} `;
  }

  // ── 시리얼 모니터 ────────────────────────────────────────
  // 출력은 tick 을 소비하지 않는다. 여기 무엇이 쌓이든 랩타임과 물리는 그대로다.
  //
  // 52차 — 로그가 여기 한 곳에 모인다. 줄 앞에 종류를 붙인다:
  //   [컴파일] 코드만 검사했을 때   [업로드] 검사에 통과해 시뮬에 넣었을 때
  //   [오류]   검사·실행에서 난 것   [출력] Serial.print 가 찍은 것
  //   [기록]   랩·저장처럼 기록에 관한 것
  // 54차 — 이름을 실물 아두이노 IDE 와 맞췄다([적용] → [업로드], [컴파일] 신설).
  // 시간은 시뮬 tick 기준 경과 시간이다. 실제 시각을 찍지 않는다 —
  // 그래야 같은 코드를 두 번 돌렸을 때 로그가 글자까지 같다.
  const UI_LOG_MAX = 300;
  const uiLog = [];          // 화면이 만든 줄. 프로그램 출력은 sim.serial 이 들고 있다.
  let uiLogSeq = 0;
  // 시뮬이 돌기 전에 찍은 줄의 순번(#1, #2, …). 정지해서 tick 이 0 으로 돌아가도
  // 이어서 붙인다 — 다시 #1 부터 붙이면 로그를 안 지웠을 때 #1 이 두 번 나온다.
  let preSeq = 0;
  let lastTick = 0;

  /** 처음 자리로 돌아갔음을 로그에 남기는 구분선. 순번은 이어서 붙는다. */
  function pushSerialBreak() {
    uiLog.push({ divider: true, text: '— 처음부터 —', tick: 0, seq: uiLogSeq++ });
    while (uiLog.length > UI_LOG_MAX) uiLog.shift();
    serialSeen = -1;
    paintSerial();
  }

  function pushSerial(kind, text, at = null) {
    // 52-1차 — 시뮬이 안 도는 동안은 시각 대신 순번을 찍는다.
    // tick 이 0 에 머물러 있어 전부 0.000 으로 찍히면 순서를 알 수 없다.
    // 도는 동안은 tick 경과 시간 그대로다. 어느 쪽이든 두 번 돌리면 글자까지 같다.
    const before = sim.tick === 0;
    uiLog.push({
      kind, text, tick: sim.tick, seq: uiLogSeq++,
      pre: before ? ++preSeq : null,
      line: at && at.line, col: at && at.col,
    });
    lastTick = sim.tick;
    while (uiLog.length > UI_LOG_MAX) uiLog.shift();
    serialSeen = -1;
    paintSerial();
  }

  let serialSeen = -1;
  let serialOpen = true;
  function paintSerial() {
    const log = sim.serial;
    const out = log ? log.lines : [];
    const dropped = log ? log.dropped : 0;
    const n = out.length + dropped + uiLog.length;
    if (n === serialSeen) return;
    serialSeen = n;
    el.serialCount.textContent = String(n);
    if (!serialOpen) return;
    // 두 줄기를 tick 으로 섞는다. 같은 tick 이면 프로그램 출력이 먼저다 —
    // 화면이 붙이는 줄(적용·기록)은 그 tick 에서 벌어진 일의 요약이기 때문이다.
    const merged = [
      ...out.map((r, i) => ({ kind: '출력', text: r.text, tick: r.tick, seq: i, out: true })),
      ...uiLog,
    ].sort((a, b) => (a.tick - b.tick) || ((a.out ? 0 : 1) - (b.out ? 0 : 1)) || (a.seq - b.seq));

    const rows = [];
    if (dropped) {
      const d = document.createElement('div');
      d.className = 'serial__skip';
      d.textContent = `${dropped}줄 생략`;
      rows.push(d);
    }
    for (const line of merged) {
      if (line.divider) {
        const d = document.createElement('div');
        d.className = 'serial__divider';
        d.textContent = line.text;
        rows.push(d);
        continue;
      }
      const jump = !line.out && line.line;
      const d = document.createElement(jump ? 'button' : 'div');
      d.className = `serial__line serial__line--${line.out ? 'out' : line.kind}`;
      if (jump) {
        d.type = 'button';
        d.addEventListener('click', () => editor.focusLine(line.line, line.col));
      }
      const t = document.createElement('span');
      t.className = 'serial__t';
      // 시뮬이 돌기 전이면 순번, 도는 동안이면 tick 경과 시간.
      t.textContent = line.pre ? `#${line.pre}` : formatTicks(line.tick);
      const k = document.createElement('span');
      k.className = 'serial__k';
      k.textContent = `[${line.kind}]`;
      const m = document.createElement('span');
      m.className = 'serial__m';
      m.textContent = line.text;
      d.append(t, k, m);
      rows.push(d);
    }
    // 자동 스크롤은 맨 아래에 있을 때만 따라간다. 위를 읽고 있는데 끌려가면 안 된다.
    const mount = el.serialMount;
    const atBottom = mount.scrollHeight - mount.scrollTop - mount.clientHeight < 24;
    mount.replaceChildren(...rows);
    if (atBottom) mount.scrollTop = mount.scrollHeight;
  }

  el.serialToggle.addEventListener('click', () => {
    serialOpen = !serialOpen;
    el.serialMount.hidden = !serialOpen;
    el.serialToggle.setAttribute('aria-expanded', String(serialOpen));
    el.serialToggle.textContent = serialOpen ? '접기' : '펼치기';
    if (serialOpen) { serialSeen = -1; paintSerial(); }
  });

  // ── 57-C 파트5 — 보드 칸 · 단축키 · 보낼 값 ──────────────
  // 보드 칸에는 실제로 아는 것만 적는다. 웹에는 COM 포트가 없으므로 포트를 적지 않는다.
  // 이름은 킷이 소유한다 — 코드가 보드 이름을 알고 있지 않다.
  el.edBoard.textContent = `${kit.name} · 시뮬레이터`;
  setEdStat('아직 올리지 않았습니다.');

  // 툴팁에 적은 단축키는 실제로 들어야 한다. 아두이노 IDE 와 같은 두 개만 잡는다.
  const onEdKeys = (e) => {
    if (!e.ctrlKey || e.altKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === 'r') { e.preventDefault(); verifyCode(); }
    else if (k === 'u') { e.preventDefault(); applyCode({ autoplay: false }); }
  };
  document.addEventListener('keydown', onEdKeys);

  /**
   * 보드로 보낼 값. 지금 판의 ino 서브셋에는 Serial.read 가 없어 스케치가 이 값을 읽지 못한다.
   * 그래서 모니터에 보낸 줄만 남기고, 처음 한 번 그 사실을 적는다 —
   * 받는 쪽이 없는데 있는 것처럼 보이게 두지 않는다.
   */
  let sendNoted = false;
  function sendSerial() {
    const text = el.serialInput.value;
    if (!text.trim()) return;
    // 줄 끝 설정은 보낸 줄에 그대로 보인다. ⏎ 가 붙으면 새 줄까지 함께 보낸 것이다.
    const eol = el.serialEol.value === 'nl' ? ' ⏎' : '';
    pushSerial('보냄', `${text}${eol}`);
    if (!sendNoted) {
      sendNoted = true;
      pushSerial('보냄', '지금 판의 스케치는 받은 값을 읽지 않습니다.');
    }
    el.serialInput.value = '';
  }
  el.serialSend.addEventListener('click', sendSerial);
  el.serialInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendSerial(); } });

  el.serialClear.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (sim.serial) sim.serial.clear();
    uiLog.length = 0;
    preSeq = 0;
    serialSeen = -1;
    paintSerial();
  });

  /** 다음 판단 지점과 남은 거리. 학생이 물건을 준비할 시간을 벌어 준다. */
  function paintZoneBar() {
    const st = decisionState(sim);
    const ost = obstacleState(sim);
    const active = st ? st.active : null;
    const next = st ? st.next : null;
    // 막고 있는 장애물이 다음 판단 지점보다 가까우면 그쪽을 먼저 알린다.
    const blocker = ost && ost.near && ost.near.blocking ? ost.near : null;
    if (blocker && (!active) && (!next || blocker.remain_mm < next.remain_mm)) {
      el.zonebar.hidden = false;
      el.zonebar.dataset.expect = 'stop';
      el.zonebar.classList.remove('is-active');
      el.zoneTag.textContent = blocker.kind === OBSTACLE.GATE ? '차단' : '보행자';
      el.zoneLabel.textContent = blocker.label || '';
      el.zoneDist.textContent = `${(blocker.remain_mm / 1000).toFixed(1)}m 앞`;
      return;
    }
    const cur = active || next;
    if (!cur) { el.zonebar.hidden = true; return; }
    el.zonebar.hidden = false;
    // 55차 보강8 B — 지점 앞에서는 무엇을 해야 하는지 알려 주지 않는다. 그것을 판단하는 것이
    // 이 챌린지가 가르치려는 것이다. 이름·거리·'판정 중' 은 남긴다 — 어디인지는 눈에도 보인다.
    // 색도 함께 지운다. 태그 글자만 지우고 띠 색을 정지·서행·진행으로 두면 같은 것을 색으로
    // 알려 주는 셈이 된다.
    el.zonebar.dataset.expect = revealExpect ? cur.expect : '';
    el.zonebar.classList.toggle('is-active', !!active);
    el.zoneTag.textContent = revealExpect ? (EXPECT_TAG[cur.expect] || '') : '';
    el.zoneLabel.textContent = cur.label || '';
    el.zoneDist.textContent = active ? '판정 중' : `${(next.remain_mm / 1000).toFixed(1)}m 앞`;
  }

  /** 프레임마다 한 장 분류해 시뮬에 얹는다. 사진은 여기서 특징값이 되고 바로 버려진다. */
  function stepMl() {
    if (!usesMl || !webcam || !webcam.running) return;
    if (!mlModel) { setMlReading(sim, null); return; }
    const frame = webcam.frame();
    if (!frame) return;
    const f = extractFeature(frame.data, frame.width, frame.height);
    mlFeature = f;
    mlLast = classifyFeature(mlModel, f);
    setMlReading(sim, mlLast);
    paintMlRead();
  }

  // ── 해답 보기 ────────────────────────────────────────────
  // 매니페스트가 해답을 소유한다. 세 번 달려 본 뒤에 열리고, 열어본 사실은 기록에 남는다.
  // 코드에 덮어쓰지 않는다 — 보고 직접 옮겨 써야 남는 것이 있다.
  const SOLUTION_UNLOCK_RUNS = 3;
  let solutionOverlay = null;

  function syncSolutionBtn() {
    if (!challenge.solution_code) { el.solution.hidden = true; return; }
    el.solution.hidden = false;
    const runs = store.attempt;
    if (store.solutionSeenAt) {
      el.solution.disabled = false;
      el.solution.textContent = '해답 다시 보기';
      el.solution.classList.add('btn--seen');
      el.solution.title = '이미 열어본 해답입니다. 과제물에 표시됩니다.';
    } else if (runs < SOLUTION_UNLOCK_RUNS) {
      el.solution.disabled = true;
      el.solution.textContent = `해답 잠김 (${runs}/${SOLUTION_UNLOCK_RUNS})`;
      el.solution.title = `${SOLUTION_UNLOCK_RUNS}번 달려보면 열려요`;
    } else {
      el.solution.disabled = false;
      el.solution.textContent = '해답 보기';
      el.solution.title = '열어보면 과제물에 표시됩니다.';
    }
  }

  function buildSolutionOverlay() {
    const wrap = document.createElement('div');
    wrap.className = 'solution';
    wrap.hidden = true;
    wrap.innerHTML = `
      <div class="solution__box">
        <div class="solution__head">
          <b>해답 코드</b>
          <span>보고 직접 옮겨 쓰세요. 코드에 자동으로 들어가지 않습니다.</span>
        </div>
        <pre class="solution__code" data-el="sol-code"></pre>
        <div class="solution__foot">
          <span class="solution__mark">해답을 열어본 사실은 기록과 과제물에 남습니다.</span>
          <button class="btn" data-el="sol-close">닫기</button>
        </div>
      </div>`;
    document.body.append(wrap);
    wrap.querySelector('[data-el="sol-close"]').addEventListener('click', () => { wrap.hidden = true; });
    wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.hidden = true; });
    return wrap;
  }

  function openSolution() {
    if (!solutionOverlay) solutionOverlay = buildSolutionOverlay();
    solutionOverlay.querySelector('[data-el="sol-code"]').textContent = challenge.solution_code.source;
    solutionOverlay.hidden = false;
  }

  el.solution.addEventListener('click', () => {
    if (!challenge.solution_code) return;
    if (store.solutionSeenAt) { openSolution(); return; }
    const ok = window.confirm('해답을 열어볼까요?\n\n열어보면 "해답을 봤다"는 표시가 기록과 과제물에 남습니다.\n먼저 스스로 한 번 더 고쳐 보는 편이 좋습니다.');
    if (!ok) return;
    store.markSolutionSeen(Date.now());
    syncStorageChip();
    syncSolutionBtn();
    hud.render();
    openSolution();
  });
  syncSolutionBtn();

  el.resetCode.addEventListener('click', () => {
    // 코드만 스타터로 되돌린다. 시도 이력은 건드리지 않는다(하드삭제 금지).
    editor.setValue(starter);
    store.saveCode(starter, starter, starterVersion);
    showIssues([]);
  });
  el.play.addEventListener('click', () => {
    if (!compiled) { applyCode(); return; }
    if (sim.status !== SIM_STATUS.RUNNING) resetRun();
    setPlaying(true);
  });
  // 검수용. 주소에 ?dev=1 이 붙었을 때만 보인다 — 일반 화면에는 나오지 않는다.
  if (dev) el.pause.hidden = false;
  el.pause.addEventListener('click', () => setPlaying(false));
  el.resetSim.addEventListener('click', () => { setPlaying(false); resetRun(); });

  for (const btn of el.speed.querySelectorAll('.speed__btn')) {
    btn.addEventListener('click', () => {
      speed = Number(btn.dataset.speed);
      acc = 0;
      lastFrame = null;
      for (const b of el.speed.querySelectorAll('.speed__btn')) {
        b.setAttribute('aria-pressed', String(b === btn));
      }
    });
  }

  // 제출물. 리포트·이미지·영상·JSON 을 만들고, 저장된 스냅샷에서만 수치를 읽는다.
  submitPanel = createSubmit({
    root: el.submitOpen, challenge, kit, entry, store, sim, assets,
    viewCanvas: el.canvas,
    getCode: () => editor.getValue(),
    mlSummary: () => (train ? train.summary() : null),
    decisionSummary: () => decisionSummary(sim),
    dev,
    hooks: {
      // 결과 요약의 구간 표. 값은 엔진 자취에서 나온다.
      segmentRows: () => segmentRows(),
      // 판단 지점 표(54차). 현황판·결과 모달과 같은 자료다 — 여기서 다시 세지 않는다.
      pointRows: () => {
        const cfg = sim.decisions;
        if (!cfg) return [];
        const st = sim.decisionRun;
        const byId = new Map((st ? st.results : []).map((r) => [r.id, r]));
        const SEEN = { 1: '정지', 2: '서행', 3: '진행' };
        return cfg.list.map((d, i) => {
          const r = byId.get(d.id);
          return {
            no: i + 1,
            name: d.label,
            seen: r && r.seen ? (SEEN[r.seen] || '모름') : '—',
            verdict: r ? (r.ok ? '통과' : '위반') : '—',
          };
        });
      },
      // 55차 보강5 5-3 — 판단 결과 화면 한 장. 분류로 판단하는 챌린지에서만, 카메라가 켜져
      // 그림이 실제로 그려져 있을 때만 넘어간다. 과제물 파일에만 담기고 게시판 카드에는 안 나간다.
      judgeShot: () => {
        if (!camClassify) return null;
        const c = el.camviewCanvas;
        if (!c || !c.isConnected || !c.width || !c.height) return null;
        if (!(webcam && webcam.active)) return null;
        return c;
      },
      // 모달을 열 때 주행을 먼저 멈춘다. 뒤에서 계속 달리면 요약이 무엇의 요약인지 흐려진다.
      stopRun: () => setPlaying(false),
      // 한 번이라도 달렸는가. 완주 여부와는 다르다 — 못 완주한 주행도 과제물이 된다.
      ranOnce: () => everRan,
      restartForRecording() {
        const btn = el.speed.querySelector('.speed__btn[data-speed="4"]');
        if (btn) btn.click();
        setPlaying(false);
        resetRun();
        setPlaying(true);
      },
      isRunning: () => playing && sim.status === SIM_STATUS.RUNNING,
    },
  });

  // 같은 시리즈 안에서 맵만 갈아타는 바. 이동만 시켜 주고, 코드·이력은 챌린지별로 그대로 분리된다.
  const series = entry.series;
  // 숨김 챌린지는 전환 바에도 나오지 않는다. 목록에서 내린 것은 어디에서도 보이지 않아야 한다.
  const siblings = series ? catalog.challenges.filter((c) => c.kit_id === kitId && c.series === series && !c.hidden) : [];
  // 52차 — 난이도 3단 전환 탭을 없앴다. 챌린지 이동은 게시판에서만 한다.
  // 지금 보고 있는 챌린지의 난이도는 2행 배지가 알려 준다.

  // 54차 보강5 — 주행음을 걷어냈다. 켜고 끄는 버튼이 없어졌으므로 켤 길도 없다.
  // 교실에서 여러 대가 동시에 돌면 시끄럽다는 이유로 52-1차부터 기본 꺼짐이었고,
  // 실제로 켜 본 적이 없는 기능이다. 재생 코드(src/ui/audio.js)와 소리 파일,
  // 매니페스트의 소리 필드는 지우지 않았다 — 되살리려면 이 절만 되돌리면 된다.

  // 숨겨진 탭에서는 브라우저가 rAF 를 멈춘다 → 자동 일시정지 후 복귀 시 이어서 재생.
  /*
   * 탭을 벗어났을 때 (52-1차 파트F).
   *
   * 예전에는 멈췄다가 돌아오면 이어서 달렸다. 그러면 시계가 멈춘 동안의 시간이 기록에서
   * 빠져, 그 기록이 "몇 초에 돈 것" 인지 "몇 초 동안 화면을 보고 있었나" 인지 흐려진다.
   * 그래서 아예 멈추고 처음 자리로 돌린다. 사실은 시리얼에 [기록] 줄로 남긴다.
   */
  function onVisibility() {
    if (!document.hidden || !playing) return;
    setPlaying(false);
    el.tabNotice.hidden = true;
    autoPaused = false;
    pushSerial('기록', '다른 탭으로 가서 주행을 멈췄습니다. 다시 시작해 주세요.');
    resetRun();
  }
  document.addEventListener('visibilitychange', onVisibility);

  // 첫 진입: 저장된(또는 스타터) 코드를 컴파일해 두되 자동 재생은 하지 않는다.
  applyCode({ autoplay: false });
  hideResult();
  // 가이드 퀘스트는 코드가 그려진 뒤에 띄운다 — 코드 줄을 가리키는 단계가 있다.
  // 54차 — 규칙 창이 먼저 뜨는 첫 방문에는 창을 닫은 뒤로 미룬다(closeRules 가 부른다).
  if (!guideSeen() && !rulesAutoOpen) requestAnimationFrame(() => quest.start());
  if (starterNotice) {
    el.adoptStarter.hidden = false;
    el.adoptStarter.addEventListener('click', () => {
      editor.setValue(starter);
      store.saveCode(starter, starter, starterVersion);
      el.adoptStarter.hidden = true;
      showNotice('');
      applyCode({ autoplay: false });
    });
    // 넘치면 그 사실을 함께 적는다. "그대로 두었습니다" 만으로는 왜 화면이 이상한지 모른다.
    // 재는 것은 화면이 한 번 그려진 뒤여야 값이 나온다.
    requestAnimationFrame(() => {
      const area = el.editorMount.querySelector('textarea.editor__area');
      const over = area ? Math.max(0, area.scrollWidth - area.clientWidth) : 0;
      showNotice(over > 0
        ? `${starterNotice} 지금 코드는 줄이 길어 오른쪽 ${over}px 이 화면 밖에 있습니다 — [새 코드로 바꾸기] 를 누르면 새 판으로 바뀝니다.`
        : starterNotice, over > 0 ? 'warn' : 'info');
    });
  }

  // 55차 보강3 3-2 — 카메라 두 칸의 갱신 주기.
  //
  // 이 그림은 사람이 보라고 있는 것이다. 판정은 전부 tick 이 한다 — 고정 대본(43차)도,
  // mlClassify 가 읽는 프레임(webcam.frame())도 tick 기준이고, 여기서 무엇을 그리든
  // 그 값에 닿지 않는다. 296x233 두 칸을 60Hz 로 다시 그리는 것은 시뮬을 한 번 더 그리는 셈이다.
  //
  // 실제 웹캠 화면까지 늦출지는 매니페스트가 챌린지별로 소유한다(scene.ui.camera_hz).
  // 색으로 조종하기는 학생이 손을 움직여 보며 맞추는 챌린지라 늦추면 손과 그림이 어긋난다 —
  // 그 매니페스트에는 이 값이 없고, 그래서 웹캠 화면은 매 프레임 그대로 그린다.
  // 스마트시티는 판단을 tick 이 하므로 웹캠 화면도 함께 늦춘다(55차 보강4 4-2).
  const CAM_HZ = ui.camera_hz || 20;
  const CAM_MS = 1000 / CAM_HZ;
  const liveCamThrottled = !!ui.camera_hz;
  let camPaintedAt = -Infinity;
  let camDue = true;

  // 하나가 던져도 나머지가 멈추지 않게 렌더러를 나눠 둔다.
  const framePainters = [
    () => repaintView(),
    () => { if (fpv && camDue && el.fpvCanvas.isConnected) fpv.draw(sim); },
    () => paintClearBoard(),
    () => paintSimSee(),
    () => paintSimSheet(),
    () => pumpEvents(),
    () => { if (minimap) minimap.draw(sim); },
    () => { if (usesCamera && camDue) camView.update(sim); },
    () => paintCamSteer(),
    () => paintSimColor(),
    () => stepMl(),
    () => paintZoneBar(),
    () => paintSerial(),
    () => paintAccuracy(),
    () => paintCamLine(),
    () => paintCourseBar(),
    () => paintMotor(),
    () => paintSimSay(),
    () => paintSegmentBar(),
    // 지금 실행 중인 줄. 값은 런타임(sandbox)이 적고 화면은 옮기기만 한다.
    () => editor.setRunLine(playing && sim.program && sim.program.cursor ? sim.program.cursor.line : 0),
    () => paintTrainResult(),
    () => paintRecord(),
    () => hud.update(sim),
  ];

  let rafId = null;
  let disposed = false;
  // 이 화면에서 한 번이라도 달렸는가(54차 보강6-5). 정지하면 tick 은 0 으로 돌아가지만
  // "달린 적이 있다" 는 사실은 남는다 — 완주하지 못한 주행도 과제물이 되기 때문이다.
  // 최근 3초. 브라우저가 준 rAF 타임스탬프를 그대로 담는다. 여기서 값을 만들지 않는다.
  const fpsMarks = [];
  let fpsShownAt = 0;
  if (showFps) el.simfps.hidden = false;
  rafId = requestAnimationFrame(function frame(now) {
    if (disposed) return;
    rafId = requestAnimationFrame(frame);
    if (sim.tick > 0) everRan = true;
    if (showFps) {
      fpsMarks.push(now);
      while (fpsMarks.length && now - fpsMarks[0] > 3000) fpsMarks.shift();
      // 55차 보강1 — fps 는 60 이나 30 에 물려 차이를 감춘다. ms 는 안 감춘다.
      // 그래서 한 프레임이 실제로 몇 ms 였는지를 맨 앞에 적는다. 60Hz 화면의 예산은 16.7ms 다.
      // 값은 브라우저가 준 rAF 타임스탬프의 차이고, 그리는 양도 전부 브라우저가 낸 값이다 —
      // 여기서 만드는 수치는 하나도 없다.
      // 계기를 셈하는 일 자체가 프레임에 얹히지 않도록 0.25초에 한 번만 낸다.
      if (now - fpsShownAt >= 250) {
        fpsShownAt = now;
        const gaps = [];
        for (let i = 1; i < fpsMarks.length; i++) gaps.push(fpsMarks[i] - fpsMarks[i - 1]);
        gaps.sort((a, b) => a - b);
        // 가끔 튀는 프레임이 60 에 물릴지 30 에 물릴지를 정한다. 중앙값만 보면 그것을 놓친다.
        const nth = (q) => (gaps.length ? gaps[Math.max(0, Math.ceil(q * gaps.length) - 1)] : null);
        const mid = nth(0.5);
        const p95 = nth(0.95);
        const span = fpsMarks.length > 1 ? now - fpsMarks[0] : 0;
        const fps = span > 0 ? Math.round(((fpsMarks.length - 1) * 1000) / span) : null;
        const cv = el.canvas;
        const r = cv.getBoundingClientRect();
        const bgRef = challenge.scene.assets && challenge.scene.assets.background;
        const bg = bgRef ? assets.resolve(bgRef) : null;
        const bgImg = bg && bg.image ? bg.image : null;
        el.simfps.textContent = `${mid === null ? '—' : mid.toFixed(1)} ms (p95 ${p95 === null ? '—' : p95.toFixed(1)})`
          + ` · ${fps === null ? '—' : fps} fps · dpr ${window.devicePixelRatio}`
          + ` · 캔버스 ${Math.round(r.width)}x${Math.round(r.height)} → ${cv.width}x${cv.height}`
          + ` · 배경 ${bgImg ? `${bgImg.naturalWidth || bgImg.width}x${bgImg.naturalHeight || bgImg.height}` : '—'}`;
      }
    }

    // 54차 파트L — 연습 모드를 걷어냈다. 웹캠 챌린지에서는 카메라가 곧 입력이고,
    // 카메라가 꺼져 있으면 "안 보임" 이다. 예전에는 값을 얹지 않아 엔진이 맵 위 마커를
    // 대신 읽었는데(연습 모드), 그 마커가 맵에서 사라지므로 보이지 않는 판을 보고 도는 셈이 된다.
    if (webcam) {
      setExternalCamera(sim, webcam.active ? webcam.reading : { found: false, offset: 0, area: 0 });
      el.camRate.textContent = webcam.active ? `${webcam.detectionRate}%` : '—';
    }

    if (playing && sim.status === SIM_STATUS.RUNNING) {
      if (lastFrame === null) lastFrame = now;
      acc += (now - lastFrame) * speed;
      lastFrame = now;
      if (acc > MAX_BACKLOG_MS) acc = MAX_BACKLOG_MS;

      // 이번 프레임에서 시뮬 계산에 쓸 수 있는 실제 시간. 화면이 멈춘 것처럼 보이지 않게 하는 상한일 뿐,
      // tick 수열 자체는 예산과 무관하게 언제나 같다(= 결정론 유지).
      const deadline = performance.now() + challenge.limits.max_catchup_ms;
      let n = 0;
      while (acc >= TICK_MS && sim.status === SIM_STATUS.RUNNING) {
        const v = sim.vehicle;
        lerp.prev = { x: v.x, y: v.y, heading_mdeg: v.heading_mdeg };
        stepSim(sim);
        // 57-C 파트3 — 다시 그릴 자취를 50ms(5 tick) 마다 담는다. 10ms 를 전부 담으면 저장소가
        // 감당하지 못하고, 벽시계로 재면 같은 코드가 다른 배열을 남긴다. tick 으로만 잰다.
        if (sim.tick % PATH_EVERY === 0) pushPathSample();
        acc -= TICK_MS;
        if ((++n & 15) === 0 && performance.now() >= deadline) break;
      }

      if (sim.lap.count > lapSeen) {
        lapSeen = sim.lap.count;
        recordLap(sim.lap.lastTicks);
      }
      if (sim.status === SIM_STATUS.ERROR) {
        setPlaying(false);
        showIssues([{ line: sim.error.line, col: sim.error.col, message: sim.error.message }]);
      } else if (sim.status === SIM_STATUS.ENDED) {
        setPlaying(false);
        showEnded(sim);
        recordEnd(sim.ended.reason);
      } else if (sim.status === SIM_STATUS.TIMEOUT) {
        setPlaying(false);
        showNotice(`제한 시간 ${formatTicks(challenge.limits.max_sim_ticks)}초가 다 되어 멈췄습니다.`, 'warn');
      }
    } else {
      lastFrame = null;
    }
    // 남은 시간이 한 tick 의 몇 할인지. 배속을 없앴으므로 언제나 0 이상 1 미만이다.
    lerp.alpha = Math.max(0, Math.min(1, acc / TICK_MS));

    // 카메라 두 칸을 이번 프레임에 다시 그릴 차례인가. 실제 웹캠이면 언제나 그린다.
    camDue = (webcam && webcam.active && !liveCamThrottled)
      || (now - camPaintedAt) >= CAM_MS - 1;
    if (camDue) camPaintedAt = now;

    for (const paint of framePainters) {
      try { paint(); } catch (err) {
        if (dev) console.error('[dev] 렌더 오류', err);   // eslint-disable-line no-console
      }
    }
    const paused = !playing && sim.status === SIM_STATUS.RUNNING;
    el.status.dataset.status = paused ? 'idle' : sim.status;
    el.status.textContent = paused
      ? (sim.tick === 0 ? '준비' : (autoPaused ? '잠시 멈춤 (다른 탭)' : '잠시 멈춤'))
      : STATUS_LABEL[sim.status];
    el.tick.textContent = `${formatTicks(sim.tick)}초${speed > 1 ? ` · ${speed}배속` : ''}`;
  });

  return function dispose() {
    disposed = true;
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (saveTimer) clearTimeout(saveTimer);
    submitPanel.dispose();
    if (train) train.dispose();
    quest.dispose();
    if (webcam) webcam.stop();
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('keydown', onEsc);
    document.removeEventListener('keydown', onEdKeys);
    window.removeEventListener('resize', onResize);
    if (viewSizer) viewSizer.disconnect();
  };
}

/**
 * 코드 활용 가이드. 서명은 레지스트리가, 한 줄 설명은 매니페스트(scene.ui.api_doc)가 소유한다.
 * 매니페스트에 없으면 레지스트리의 설명을 그대로 쓴다 — 다른 챌린지는 달라지지 않는다.
 */
function renderApiList(mount, allowedApi, docs) {
  const list = document.createElement('div');
  list.className = 'api-list';
  for (const name of allowedApi) {
    const info = API_REGISTRY[name];
    if (!info) continue;
    const row = document.createElement('div');
    row.className = 'api-item';
    const sig = document.createElement('code');
    sig.className = 'api-item__sig';
    sig.textContent = info.sig;
    const doc = document.createElement('span');
    doc.className = 'api-item__doc';
    doc.textContent = (docs && docs[name]) || info.doc;
    row.append(sig, doc);
    list.append(row);
  }
  const note = document.createElement('div');
  note.className = 'api-note';
  note.textContent = '이 목록 밖의 호출은 오류입니다. Wi-Fi·시리얼·파일 IO·millis()·random() 은 지원하지 않습니다. setup() 과 loop() 는 반드시 있어야 합니다.';
  mount.replaceChildren(list, note);
}

/** 에셋 슬롯 안내는 개발자용이다. 학생 화면(?dev=1 없음)에서는 표시하지 않는다. */
function renderAssetSlots(mount, assets, dev) {
  mount.replaceChildren();
  if (!dev || !assets.missing.length) return;
  const chip = document.createElement('span');
  chip.textContent = `[dev] 에셋 슬롯 비어 있음: ${assets.missing.join(', ')} — 형상 플레이스홀더로 표시 중`;
  mount.append(chip);
}
