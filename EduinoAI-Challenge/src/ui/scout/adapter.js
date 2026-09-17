/**
 * ui/scout/adapter.js — 탐사 챌린지의 카메라·조종 어댑터.
 *
 * 왜 있는가:
 *   화면 코드가 "지금 프레임이 웹캠에서 오는지 실물 RC카에서 오는지" 를 알면, 실물을 붙이는
 *   날 화면을 통째로 고쳐야 한다. 그래서 화면은 어댑터가 내놓는 셋만 본다.
 *     frame()   지금 프레임 (ImageBitmap 또는 Canvas)
 *     send(cmd) 조종 명령
 *     status()  링크 · fps · 지연
 *
 * 소스는 매니페스트(camera_source)가 고른다. 이 파일에 기본값을 두지 않는다 —
 * 매니페스트가 말하지 않으면 화면이 뜨지 않아야지, 몰래 웹캠으로 도는 일은 없어야 한다.
 *
 * 개인정보(원칙 7): 프레임은 브라우저 안에서만 돈다. 저장하지도 보내지도 않는다.
 * 이 파일에는 업로드·다운로드·저장 경로가 존재하지 않는다.
 *
 * 결정론: 이 경로는 결정론이 성립하지 않는다. 실물 카메라가 입력이기 때문이며 그것이
 * 이 챌린지의 목적이다. 다른 챌린지는 이 파일을 거치지 않는다.
 */

/** 조종 명령. 화면과 어댑터가 같은 낱말을 쓴다. */
export const CMD = Object.freeze({
  FORWARD: 'forward', BACK: 'back', LEFT: 'left', RIGHT: 'right', STOP: 'stop',
});

/** 링크 상태. status().link 가 이 셋 중 하나다. */
export const LINK = Object.freeze({ OFF: 'off', OPENING: 'opening', ON: 'on', LOST: 'lost', UNSUPPORTED: 'unsupported' });

/**
 * 연결이 안 될 때 학생이 무엇을 해야 하는지는 네 가지로 갈린다. 뭉뚱그려 "연결 실패" 라고 하면
 * 주소를 고쳐야 하는지, 브라우저 설정을 바꿔야 하는지, 펌웨어를 고쳐야 하는지 알 수가 없다.
 * 문장은 매니페스트(device.errors)가 갖고, 여기서는 어느 갈래인지만 정한다.
 */
export const FAIL = Object.freeze({
  MIXED: 'mixed_content',   // https 페이지에서 http 기기를 부름 — 브라우저가 막는다
  NETWORK: 'network',       // 그 주소에 닿지 않음 — 주소나 망 문제
  CORS: 'cors',             // 기기는 응답하는데 브라우저가 읽지 못하게 막음 — 펌웨어가 열어야 한다
  NO_FRAME: 'no_frame',     // 연결은 됐는데 영상이 안 옴 — 카메라·전원 문제
});

const FPS_WINDOW = 30;

/**
 * 웹캠 어댑터. 학생 노트북의 카메라가 곧 RC카의 눈이다.
 * 조종 명령은 갈 데가 없으므로 받아서 마지막 명령으로만 들고 있는다 —
 * 화면(추정 경로)이 그 값을 적분한다. 실물이 붙는 날 여기만 device 로 바뀐다.
 */
function webcamAdapter() {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.setAttribute('aria-hidden', 'true');
  video.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;';

  let stream = null;
  let link = LINK.OFF;
  let reason = '';
  let lastFrameAt = 0;
  const stamps = [];
  let lastCmd = CMD.STOP;
  let sentAt = 0;

  async function start() {
    if (link === LINK.ON) return { ok: true };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      link = LINK.UNSUPPORTED;
      reason = '이 브라우저는 카메라를 지원하지 않습니다.';
      return { ok: false, reason };
    }
    link = LINK.OPENING;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'environment' },
        audio: false,
      });
    } catch (e) {
      link = LINK.OFF;
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      reason = denied ? '카메라 사용을 허용하지 않았습니다.' : '카메라를 열 수 없습니다.';
      return { ok: false, reason };
    }
    document.body.append(video);
    video.srcObject = stream;
    try { await video.play(); } catch (_) { /* 자동재생 차단은 무시 — 프레임은 들어온다 */ }
    link = LINK.ON;
    reason = '';
    return { ok: true };
  }

  function stop() {
    link = LINK.OFF;
    if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
    video.srcObject = null;
    video.remove();
    stamps.length = 0;
  }

  /**
   * 지금 프레임. 없으면 null 이다 — 화면은 null 을 "아직 안 들어옴" 으로 그린다.
   * 프레임을 복사해 주지 않고 video 요소 자체를 넘긴다. drawImage 가 그대로 받는다.
   */
  function frame() {
    if (link !== LINK.ON || !video.videoWidth) return null;
    const now = performance.now();
    // 같은 프레임을 두 번 세지 않도록 시간으로만 센다. 정확한 프레임 번호는 알 수 없다.
    if (now - lastFrameAt > 4) {
      lastFrameAt = now;
      stamps.push(now);
      if (stamps.length > FPS_WINDOW) stamps.shift();
    }
    return video;
  }

  function send(cmd) {
    lastCmd = cmd;
    sentAt = performance.now();
    // 웹캠 소스에는 보낼 데가 없다. 명령은 화면이 추정 경로를 적분하는 데 쓴다.
    return { ok: true, delivered: false };
  }

  function status() {
    const n = stamps.length;
    const span = n > 1 ? stamps[n - 1] - stamps[0] : 0;
    const fps = span > 0 ? Math.round(((n - 1) * 1000) / span) : 0;
    // 지연은 마지막 프레임이 들어온 뒤 흐른 시간이다. 링크가 끊기면 이 값이 자란다.
    const age = link === LINK.ON && lastFrameAt ? Math.round(performance.now() - lastFrameAt) : 0;
    return { source: 'webcam', link, reason, fps, latency_ms: age, last_cmd: lastCmd, cmd_age_ms: sentAt ? Math.round(performance.now() - sentAt) : 0 };
  }

  return { start, stop, frame, send, status };
}

/**
 * 실물 RC카(ESP32-CAM) 어댑터.
 *
 * 주소는 매니페스트가 갖지 않는다 — 공유기마다 IP 가 달라지므로 학생이 화면에서 적는다.
 * 경로와 포트, 되풀이 간격 같은 규격만 매니페스트(device)가 갖는다.
 *
 *   영상   http://<IP>:81/stream   MJPEG 를 <img> 로 받는다. 캔버스에 그대로 그릴 수 있다.
 *   프레임 http://<IP>/capture     스트림이 안 열릴 때의 대체 경로
 *   제어   http://<IP>/cmd?dir=F&speed=180
 *   상태   http://<IP>/status
 *
 * 펌웨어 데드맨이 500ms 라, 누르고 있는 동안 100ms 간격으로 같은 명령을 다시 보낸다.
 * 그 되풀이를 여기서 한다 — 조종 코드는 "지금 무슨 명령인가" 만 알면 되고,
 * 기기가 얼마나 자주 들어야 하는지는 기기 쪽 사정이다.
 *
 * 프레임은 캔버스에 그려 기존 특징값 경로가 그대로 돈다. 새 계산식을 만들지 않는다.
 * 캔버스를 더럽히지 않으려면 네 주소 모두 CORS 가 열려 있어야 한다 —
 * 막히면 픽셀을 읽는 순간 터지므로, 그것을 CORS 갈래로 잡아 화면에 말한다.
 *
 * 원칙 7 — 프레임은 화면 안에서만 돈다. 저장·전송 경로가 이 파일에 없다.
 */
function deviceAdapter(spec) {
  const img = new Image();
  img.crossOrigin = 'anonymous';       // 이것이 없으면 캔버스가 더러워져 픽셀을 못 읽는다
  img.decoding = 'async';
  img.setAttribute('aria-hidden', 'true');
  // 문서에 붙지 않은 <img> 는 MJPEG 의 두 번째 프레임부터를 받아 오지 않는다(브라우저가 아낀다).
  // 그래서 화면 밖에 1px 로 붙여 둔다 — 보이지는 않고 스트림만 계속 흐른다.
  img.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;';

  let host = '';
  let link = LINK.OFF;
  let reason = '';
  let fail = null;
  let lastFrameAt = 0;
  let seenFrame = false;
  const stamps = [];
  let lastCmd = CMD.STOP;
  let sentAt = 0;
  let resend = null;
  let poll = null;
  let device = null;                    // /status 가 준 마지막 값
  let statusOkAt = 0;                   // 마지막으로 기기가 답한 시각
  let live = null;                      // 그림이 바뀌는지 지켜보는 타이머
  let lastSig = '';                     // 마지막으로 본 그림의 지문(8x8)
  let frozen = false;                   // 보드는 답하는데 그림만 멎었는가

  // 그림이 실제로 바뀌는지 보는 8x8 표본. 크롬은 MJPEG 의 매 프레임마다 load 를 쏘지 않아
  // (실측: 3초에 1번) 이벤트로는 프레임을 셀 수 없다. 그림 자체를 아주 작게 떠서 비교한다.
  const tiny = document.createElement('canvas');
  tiny.width = 8;
  tiny.height = 8;
  const tinyCtx = tiny.getContext('2d', { willReadFrequently: true });

  const base = () => `http://${host}`;
  const streamUrl = () => `http://${host}:${spec.stream_port}${spec.stream_path}`;
  const url = (path, q) => `${base()}${path}${q || ''}`;

  /** https 페이지에서 http 기기를 부르면 브라우저가 막는다. 부르기 전에 먼저 안다. */
  const mixedContent = () => location.protocol === 'https:';

  /**
   * 왜 안 되는지 갈라낸다.
   * 보통 fetch 가 막히면 CORS 인지 망 문제인지 브라우저가 알려 주지 않는다.
   * no-cors 로 한 번 더 던져 보아, 그때는 되면 "기기는 살아 있고 CORS 만 막힌 것" 이다.
   */
  async function classify(target) {
    if (mixedContent()) return FAIL.MIXED;
    // no-cors 요청은 막힌 응답도 "성공" 으로 돌아온다(opaque). 그러니 성공했다고 바로
    // CORS 라고 단정하면 안 된다 — 닿지 못한 경우와 가르려면 시간을 재야 한다.
    // 닿지 않는 주소는 끝까지 기다리다 시간 초과로 끝나고, 살아 있는 기기는 곧바로 답한다.
    const probe = new AbortController();
    const t = setTimeout(() => probe.abort(), Math.min(2500, spec.connect_timeout_ms));
    const t0 = performance.now();
    try {
      await fetch(target, { mode: 'no-cors', cache: 'no-store', signal: probe.signal });
      clearTimeout(t);
      // 곧바로 답이 왔다 → 기기는 살아 있고 브라우저가 읽지 못하게 막은 것이다.
      return performance.now() - t0 < 1500 ? FAIL.CORS : FAIL.NETWORK;
    } catch (_) {
      clearTimeout(t);
      return FAIL.NETWORK;              // 닿지도 않는다 → 주소나 망
    }
  }

  function onFrame() {
    const now = performance.now();
    seenFrame = true;
    lastFrameAt = now;
    stamps.push(now);
    if (stamps.length > FPS_WINDOW) stamps.shift();
    if (link === LINK.OPENING) { link = LINK.ON; reason = ''; fail = null; }
  }

  async function start(nextHost) {
    if (nextHost) host = String(nextHost).trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!host) { link = LINK.OFF; fail = FAIL.NETWORK; reason = ''; return { ok: false, fail, reason }; }
    if (mixedContent()) { link = LINK.OFF; fail = FAIL.MIXED; return { ok: false, fail }; }

    link = LINK.OPENING;
    fail = null;
    seenFrame = false;
    stamps.length = 0;

    // 먼저 상태를 물어 기기가 살아 있는지 본다. 여기서 걸리면 영상까지 갈 것도 없다.
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), spec.connect_timeout_ms);
      const r = await fetch(url(spec.status_path), { cache: 'no-store', signal: ctl.signal });
      clearTimeout(t);
      device = await r.json();
    } catch (_) {
      fail = await classify(url(spec.status_path));
      link = LINK.OFF;
      return { ok: false, fail };
    }

    statusOkAt = performance.now();
    lastSig = '';
    frozen = false;
    // 영상은 MJPEG 를 <img> 로 받는다.
    if (!img.isConnected) document.body.append(img);
    img.onload = onFrame;
    img.onerror = () => { if (link === LINK.OPENING) { fail = FAIL.NO_FRAME; link = LINK.OFF; } };
    img.src = `${streamUrl()}?t=${Date.now()}`;

    // 프레임이 정말 오는지 기다려 본다.
    // MJPEG 를 <img> 로 받을 때 load 가 언제 오는지는 브라우저마다 다르다. 그림이 실제로
    // 들어왔는지는 naturalWidth 로 보는 것이 확실하므로 둘 다 본다.
    const ok = await new Promise((res) => {
      const t0 = performance.now();
      const tick = () => {
        if (img.naturalWidth > 0) { onFrame(); return res(true); }
        if (seenFrame) return res(true);
        if (performance.now() - t0 > spec.frame_timeout_ms) return res(false);
        requestAnimationFrame(tick);
      };
      tick();
    });
    if (!ok) {
      // 스트림이 안 열리면 단일 프레임 주소로 한 번 더 본다. 여기까지 안 되면 영상 문제다.
      img.src = `${url(spec.capture_path)}?t=${Date.now()}`;
      await new Promise((r) => setTimeout(r, 1500));
      if (img.naturalWidth > 0) onFrame();
    }
    if (!seenFrame) { fail = FAIL.NO_FRAME; link = LINK.OFF; return { ok: false, fail }; }

    link = LINK.ON;
    // 그림이 바뀌는지 지켜본다. 보드는 답하는데 그림만 멎는 경우(카메라·전원)를 이것으로 잡는다.
    live = setInterval(() => {
      if (link !== LINK.ON || !img.naturalWidth) return;
      try {
        tinyCtx.drawImage(img, 0, 0, 8, 8);
        const d = tinyCtx.getImageData(0, 0, 8, 8).data;
        let sig = '';
        for (let i = 0; i < d.length; i += 16) sig += d[i].toString(16);
        if (sig !== lastSig) { lastSig = sig; onFrame(); frozen = false; }
        else if (performance.now() - lastFrameAt > spec.frame_timeout_ms) frozen = true;
      } catch (_) {
        // 픽셀을 못 읽는다 = 캔버스가 더러워졌다 = CORS 가 막힌 것이다.
        fail = FAIL.CORS;
      }
    }, 200);
    // 데드맨이 500ms 라 누르고 있는 동안 계속 알려야 한다. 정지는 되풀이할 필요가 없다.
    resend = setInterval(() => { if (link === LINK.ON && lastCmd !== CMD.STOP) push(lastCmd); }, spec.resend_ms);
    poll = setInterval(async () => {
      try {
        const r = await fetch(url(spec.status_path), { cache: 'no-store' });
        device = await r.json();
        statusOkAt = performance.now();
      } catch (_) { /* 한 번 못 받았다고 끊긴 것은 아니다. 지연으로 드러난다 */ }
    }, 1000);
    return { ok: true };
  }

  function stop() {
    link = LINK.OFF;
    if (resend !== null) { clearInterval(resend); resend = null; }
    if (poll !== null) { clearInterval(poll); poll = null; }
    if (live !== null) { clearInterval(live); live = null; }
    push(CMD.STOP);
    img.onload = null;
    img.onerror = null;
    img.removeAttribute('src');
    img.remove();
    stamps.length = 0;
  }

  const DIR = { forward: 'F', back: 'B', left: 'L', right: 'R', stop: 'S' };

  function push(cmd) {
    if (!host) return;
    const q = `?dir=${DIR[cmd] || 'S'}&speed=${spec.speed_pwm}`;
    // 보내고 답은 기다리지 않는다. 답을 기다리면 100ms 간격이 지켜지지 않는다.
    fetch(url(spec.cmd_path, q), { cache: 'no-store' }).catch(() => { /* 지연으로 드러난다 */ });
  }

  function frame() {
    if (link !== LINK.ON || !img.naturalWidth) return null;
    return img;
  }

  function send(cmd) {
    lastCmd = cmd;
    sentAt = performance.now();
    push(cmd);
    return { ok: link === LINK.ON, delivered: link === LINK.ON };
  }

  function status() {
    // 프레임 수를 200ms 마다 표본으로 세므로 초당 다섯을 넘겨 셀 수 없다. 그 수를 fps 라고
    // 적으면 거짓이 된다 — 그래서 fps 는 내지 않고(null), 그림이 살아 있는지와 지연만 낸다.
    const n = stamps.length;
    const span = n > 1 ? stamps[n - 1] - stamps[0] : 0;
    const changes = span > 0 ? Math.round(((n - 1) * 1000) / span) : 0;
    // 끊겼는지는 "그림이 바뀌는가" 와 "보드가 답하는가" 둘 다로 본다.
    // 보드만 답하고 그림이 멎은 경우는 따로 잡아 카메라 문제라고 말한다.
    const alive = Math.max(lastFrameAt, statusOkAt);
    const age = link === LINK.ON && alive ? Math.round(performance.now() - alive) : 0;
    return {
      source: 'device', link, reason,
      fail: fail || (frozen ? FAIL.NO_FRAME : null),
      fps: null, change_hz: changes, frozen, latency_ms: age,
      last_cmd: lastCmd, cmd_age_ms: sentAt ? Math.round(performance.now() - sentAt) : 0,
      host, device,
    };
  }

  return { start, stop, frame, send, status, needsHost: true };
}

/**
 * 아직 구현하지 않은 소스의 자리.
 * 빈 함수를 두는 대신 "왜 안 도는지" 를 화면에 말할 수 있는 상태를 내놓는다 —
 * 조용히 검은 화면이 뜨는 것보다 낫다.
 */
function placeholderAdapter(source, why) {
  return {
    async start() { return { ok: false, reason: why }; },
    stop() {},
    frame() { return null; },
    send() { return { ok: false, delivered: false }; },
    status() { return { source, link: LINK.UNSUPPORTED, reason: why, fps: 0, latency_ms: 0, last_cmd: CMD.STOP, cmd_age_ms: 0 }; },
  };
}

const BUILDERS = {
  webcam: webcamAdapter,
  device: deviceAdapter,
  // 시뮬 프레임을 소스로 쓰는 길. 탐사는 실제 교실이 무대라 아직 쓰지 않는다.
  sim: () => placeholderAdapter('sim', '시뮬 카메라 소스는 아직 없습니다. 이번 차수의 범위가 아닙니다.'),
};

/**
 * 매니페스트가 고른 소스로 어댑터를 만든다.
 * 모르는 소스면 만들지 않고 터진다 — 화면이 몰래 다른 소스로 도는 것보다 낫다.
 */
export function createCameraAdapter(source, spec) {
  const build = BUILDERS[source];
  if (!build) throw new Error(`알 수 없는 카메라 소스입니다: ${source}`);
  return build(spec);
}
