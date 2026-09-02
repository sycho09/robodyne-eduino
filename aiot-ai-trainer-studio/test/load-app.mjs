/* jsdom 기반 앱 로더 (DOM/상태 관리 로직 검증용) */
/* - CDN 모델은 스텁으로 대체 */
/* - 이벤트 루프가 남으므로 --test-force-exit 필요 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";
import { after } from "node:test";

/* 이 하니스로 연 창을 모아 두었다가 파일이 끝날 때 한 번에 닫는다.
   imagelab.js 가 1.3초 주기 타이머를 돌리므로, 닫지 않으면 테스트가 다 통과해도
   프로세스가 끝나지 않아 파일이 타임아웃으로 실패한다. */
const opened = [];
after(() => {
  for (const w of opened.splice(0)) {
    try { w.close(); } catch (e) {}
  }
});

const ROOT = join(import.meta.dirname, "..");
const HTML = readFileSync(join(ROOT, "index.html"), "utf8");

/* 로컬 스크립트를 인라인으로 치환 (CDN은 스텁 처리) */
const inlineLocalScripts = (html) =>
  html.replace(/<script\s+src="(\/[^"]+\.js)"\s*><\/script>/g, (_m, src) => {
    const code = readFileSync(join(ROOT, src), "utf8");
    /* 인라인 스크립트 파싱 오류 방지를 위한 이스케이프 처리 */
    return "<script>" + code.replace(/<\/script/gi, "<\\/script") + "</script>";
  });

/* opts.query : "?plan=paid" 처럼 URL 뒤에 붙일 문자열 (무료/유료 접근 제어 검증용)
   opts.seed  : 페이지가 뜨기 전에 심어 둘 localStorage 값 (새로고침 후 상태 유지 검증용) */
export async function loadApp(opts = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e));

  const dom = new JSDOM(inlineLocalScripts(HTML), {
    /* localStorage 접근 허용을 위한 URL 세팅 */
    url: "http://localhost/" + (opts.query || ""),
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      if (opts.seed)
        for (const [k, v] of Object.entries(opts.seed))
          window.localStorage.setItem(k, v);
      /* RAF 스텁 (테스트 결정성 확보) */
      window.requestAnimationFrame = () => 0;
      window.cancelAnimationFrame = () => {};

      /* TensorFlow.js API 스텁 (DOM/상태 로직 검증용) */
      const flat = (a) =>
        Array.isArray(a) && Array.isArray(a[0]) ? a.flat() : a;
      /* 메모리 해제 후 접근 예외 발생 처리 (use-after-dispose 검증) */
      const fakeTensor = (data) => {
        let disposed = false;
        const guard = () => {
          if (disposed) throw new Error("Tensor is disposed.");
        };
        return {
          _data: data,
          array: async () => {
            guard();
            return data;
          },
          data: async () => {
            guard();
            return Float32Array.from(flat(data));
          },
          dataSync: () => {
            guard();
            return Float32Array.from(flat(data));
          },
          flatten() {
            return fakeTensor(flat(data));
          },
          dispose() {
            disposed = true;
          },
        };
      };
      const fakeModel = () => {
        let outUnits = 2;
        const m = {
          _classNames: null,
          add(layer) {
            if (layer && layer.units != null) outUnits = layer.units;
            return m;
          },
          compile() {},
          async fit(xs, ys, opts = {}) {
            const epochs = opts.epochs || 1;
            for (let e = 0; e < epochs; e++) {
              const logs = {
                loss: 1 / (e + 1),
                acc: Math.min(1, 0.5 + e * 0.05),
              };
              if (opts.callbacks && opts.callbacks.onEpochEnd)
                await opts.callbacks.onEpochEnd(e, logs);
            }
            return { history: {} };
          },
          predict(x) {
            const rows =
              Array.isArray(x._data) && Array.isArray(x._data[0])
                ? x._data.length
                : 1;
            const out = Array.from({ length: rows }, () =>
              new Array(outUnits).fill(1 / outUnits),
            );
            return fakeTensor(out);
          },
          dispose() {},
        };
        return m;
      };
      window.tf = {
        tidy: (fn) => fn(),
        tensor2d: (arr) => fakeTensor(arr),
        sequential: () => fakeModel(),
        layers: {
          dense: (cfg) => ({ units: cfg.units }),
          dropout: () => ({}),
        },
        train: { adam: () => ({}) },
        ready: async () => {},
        setBackend: async () => true,
        getBackend: () => "cpu",
      };
      /* MobileNet 스텁 */
      window.mobilenet = {
        load: async () => ({
          infer: () => fakeTensor(new Array(1024).fill(0.1)),
        }),
      };
      /* MoveNet 스텁 */
      window.poseDetection = {
        SupportedModels: { MoveNet: "MoveNet" },
        movenet: { modelType: { SINGLEPOSE_LIGHTNING: "lightning" } },
        createDetector: async () => ({
          estimatePoses: async () => [
            {
              keypoints: Array.from({ length: 17 }, (_, i) => ({
                x: i + 1,
                y: i + 2,
                score: 0.9,
              })),
            },
          ],
        }),
      };

      /* Speech Commands 스텁 */
      window.speechCommands = {
        create: () => {
          const examples = {};
          let uidSeq = 0;
          const transfer = {
            collectExample: async (word) => {
              (examples[word] = examples[word] || []).push({
                uid: "u" + ++uidSeq,
                example: {
                  spectrogram: {
                    data: new Float32Array(43 * 232),
                    frameSize: 232,
                  },
                },
              });
            },
            countExamples: () =>
              Object.fromEntries(
                Object.entries(examples).map(([w, a]) => [w, a.length]),
              ),
            getExamples: (word) => examples[word] || [],
            removeExample: (uid) => {
              for (const w in examples)
                examples[w] = examples[w].filter((e) => e.uid !== uid);
            },
            train: async (opts) => {
              const ep = opts.epochs || 1;
              for (let i = 0; i < ep; i++)
                opts.callback &&
                  opts.callback.onEpochEnd &&
                  (await opts.callback.onEpochEnd(i, {
                    loss: 1 / (i + 1),
                    acc: 0.6,
                  }));
            },
            listen: async () => {},
            stopListening: async () => {},
            isListening: () => false,
            wordLabels: () => Object.keys(examples),
          };
          return {
            ensureModelLoaded: async () => {},
            createTransfer: () => transfer,
          };
        },
      };

      /* jsdom Canvas 2D 컨텍스트 스텁 */
      const ctx2d = {
        clearRect() {},
        drawImage() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        arc() {},
        fill() {},
        fillRect() {},
        strokeRect() {},
        fillText() {},
        save() {},
        restore() {},
        translate() {},
        scale() {},
        /* captureResult() 대응용 */
        createLinearGradient: () => ({ addColorStop() {} }),
        measureText: () => ({ width: 0 }),
        getImageData: () => ({ data: new Uint8ClampedArray(0) }),
        createImageData: (w, h) => ({
          data: new Uint8ClampedArray((w | 0) * (h | 0) * 4),
        }),
        putImageData() {},
      };
      window.HTMLCanvasElement.prototype.getContext = () => ctx2d;
      window.HTMLCanvasElement.prototype.toDataURL = () => "data:,";

      /* getUserMedia 스텁 (stop 호출 추적 지원) */
      const streams = [];
      Object.defineProperty(window.navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => {
            const track = {
              kind: "media",
              _stopped: false,
              stop() {
                this._stopped = true;
              },
            };
            const stream = {
              _track: track,
              getTracks: () => [track],
              getVideoTracks: () => [track],
              getAudioTracks: () => [track],
            };
            streams.push(stream);
            return stream;
          },
        },
      });
      window.__streams = streams;

      /* AudioContext 스텁 */
      window.AudioContext = class {
        createMediaStreamSource() {
          return { connect() {} };
        }
        createAnalyser() {
          return { fftSize: 2048, getByteTimeDomainData() {} };
        }
        close() {}
      };

      window.addEventListener("error", (e) =>
        errors.push(e.error || e.message),
      );
    },
  });

  opened.push(dom.window);

  /* 초기화 태스크 완료 대기 */
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  return { dom, window: dom.window, doc: dom.window.document, errors };
}
