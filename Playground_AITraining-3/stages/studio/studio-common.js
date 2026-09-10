/* VISION AI 결과물 스튜디오 공통 유틸
   - stages/character-card.html, stages/idea-board.html 에서 공통 사용
   - 트랙 구분은 TRACKS 속성을 통해 처리 */
window.StudioCommon = {
  $: function (id) {
    return document.getElementById(id);
  },

  /* 미션 키 및 표시명 매핑 */
  MISSION_NAMES: {
    rps: "가위바위보",
    recycle: "분리수거 분류기",
    mask: "마스크 썼나요?",
    thumb: "엄지 척 / 아래",
    custom: "자유 주제",
  },
  /* 파라미터나 해시를 통한 미션 확인 */
  mission: function (fallback) {
    const raw =
      new URLSearchParams(location.search).get("mission") ||
      location.hash.replace("#", "");
    const key = this.MISSION_NAMES[raw] ? raw : fallback;
    return { key: key, name: this.MISSION_NAMES[key] };
  },

  /* 공통 UI 알림창 사용 (iframe 상위의 dialog 참조) */
  dialog: function () {
    try {
      if (window.parent !== window && window.parent.VisionDialog)
        return window.parent.VisionDialog;
    } catch (e) {}
    return window.VisionDialog || null;
  },
  /* 단순 알림 메시지 */
  say: function (o) {
    const D = this.dialog();
    o = o || {};
    if (D) return D.alert(o);
    alert(
      [o.title, o.body]
        .concat(o.list || [])
        .filter(Boolean)
        .join("\n"),
    );
    return Promise.resolve();
  },
  /* 확인 메시지 (Promise<boolean>) */
  ask: function (o) {
    const D = this.dialog();
    o = o || {};
    if (D) return D.confirm(o);
    return Promise.resolve(
      confirm([o.title, o.body].filter(Boolean).join("\n")),
    );
  },

  /* 트랙마다 달라지는 것의 단일 소스 (부모 DOM 선택자·문구·입력원)
     ※ 트랙을 늘릴 때는 여기와 studio.js 의 getTrack() 을 함께 고칠 것 */
  TRACKS: {
    image: {
      name: "이미지 분류",
      pitch: "AI VISION IDEA PITCH",
      list: "#class-list",
      pred: "#top-pred .tp-name",
      pct: "top-donut-pct",
      conf: "#top-pred .tp-conf",
      cam: "webcam",
      overlay: null,
      wave: null,
      boardPh: "웹캠 인식 데이터",
      rawTag: "Raw Data",
      turnOn: "카메라 켜기 → 추론 시작",
      offMsg: "이전 페이지 카메라 꺼짐",
      srcName: "카메라",
      sample: { label: "모은 사진", unit: "장", ph: "예: 41" },
    },
    pose: {
      name: "동작 분류",
      pitch: "AI MOTION IDEA PITCH",
      list: "#p-class-list",
      pred: "#p-top-pred .tp-name",
      pct: "p-top-donut-pct",
      conf: "#p-top-pred .tp-conf",
      /* 오버레이 캔버스 사용 (trainer.labs.js 참조) */
      cam: "p-webcam",
      overlay: "p-pose-overlay",
      wave: null,
      boardPh: "자세 인식 데이터",
      rawTag: "Raw Pose",
      turnOn: "카메라 켜기 → 추론 시작",
      offMsg: "이전 페이지 카메라 꺼짐",
      srcName: "카메라",
      sample: { label: "모은 자세", unit: "개", ph: "예: 32" },
    },
    audio: {
      name: "음성 분류",
      pitch: "AI VOICE IDEA PITCH",
      /* 음성 패널 도넛 게이지 없음 (.tp-conf 참조) */
      list: "#a-class-list",
      pred: "#a-top-pred .tp-name",
      pct: null,
      conf: "#a-top-pred .tp-conf",
      /* 오디오 파형 사용 (카메라 미사용) */
      cam: null,
      overlay: null,
      wave: "a-waveform",
      standby: "a-mic-overlay",
      boardPh: "마이크 인식 데이터",
      rawTag: "Raw Audio",
      turnOn: "마이크 켜기 → 추론 시작",
      offMsg: "이전 페이지 마이크 꺼짐",
      srcName: "마이크",
      sample: { label: "모은 녹음", unit: "개", ph: "예: 24" },
    },
  },
  track: function () {
    const raw = new URLSearchParams(location.search).get("track");
    return this.TRACKS[raw] ? raw : "image";
  },
  /* 결과물 임시 저장 및 배지 키 범위 결정 */
  scope: function (imageFallback) {
    const t = this.track();
    if (t !== "image") return { key: t, name: this.TRACKS[t].name };
    const m = this.mission(imageFallback);
    return { key: m.key, name: m.name };
  },

  /* 부모 창의 보관함 (학습 화면 안에서 열렸을 때만 있다) */
  locker: function () {
    try {
      return (window.parent !== window && window.parent.Locker) || null;
    } catch (e) {
      return null;
    }
  },
  /* 부모 창의 스튜디오 모달 닫기 · 단독 창으로 열렸으면 뒤로 가기 */
  closeStudio: function () {
    try {
      const p = window.parent;
      if (p !== window && p.Studio && p.Studio.close) return p.Studio.close();
    } catch (e) {}
    if (history.length > 1) history.back();
  },

  /* 부모 페이지 데이터 참조 (비침습적 방식) */
  parentDoc: function () {
    try {
      return window.parent && window.parent !== window
        ? window.parent.document
        : null;
    } catch (e) {
      return null;
    }
  },
  /* 부모 문서 참조 실패 시 fallback */
  readParent: function (fallback, fn) {
    const pd = this.parentDoc();
    if (!pd) return fallback;
    try {
      const v = fn(pd);
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  },
  /* 부모 창의 클래스 이름 목록 */
  parentClasses: function (tr) {
    return this.readParent([], (pd) =>
      [...pd.querySelectorAll(tr.list + " .class-item .class-name")]
        .map((i) => (i.value || "").trim())
        .filter(Boolean),
    );
  },
  /* 클래스별 수집 개수 총합 */
  parentCount: function (tr) {
    return this.readParent(null, (pd) => {
      const els = [
        ...pd.querySelectorAll(tr.list + " .class-item .class-count"),
      ];
      return els.length
        ? els.reduce((a, e) => a + (parseInt(e.textContent, 10) || 0), 0)
        : null;
    });
  },
  /* 최상위 예측 이름 필터링 */
  parentPred: function (tr) {
    return this.readParent("", (pd) => {
      const el = pd.querySelector(tr.pred),
        t = el ? el.textContent.trim() : "";
      return t && !/학습 전|대기 중|무엇으로|어떤 동작/.test(t) ? t : "";
    });
  },
  /* 확신도 %값 필터링 */
  parentConf: function (tr) {
    return this.readParent(0, (pd) => {
      const donut = tr.pct ? pd.getElementById(tr.pct) : null;
      const v = donut ? parseInt(donut.textContent, 10) : 0;
      if (v) return v;
      const c = pd.querySelector(tr.conf),
        m = c ? c.textContent.match(/(\d+)\s*%/) : null;
      return m ? parseInt(m[1], 10) : 0;
    });
  },

  /* 작성 내용 로컬 저장 (임시 저장 기능) */
  draftSave: function (key, obj) {
    try {
      localStorage.setItem(key, JSON.stringify(obj));
      return true;
    } catch (e) {
      return false;
    }
  },
  draftLoad: function (key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (e) {
      return null;
    }
  },
  /* 잦은 입력마다 무거운 작업이 돌지 않도록 묶어서 실행한다
     (임시저장은 base64 이미지까지 통째로 직렬화하는 동기 작업이라 타자가 밀린다)
     나가기 직전에는 .flush() 로 밀린 작업을 마저 처리한다 */
  debounce: function (fn, ms) {
    let timer = null;
    const run = () => {
      clearTimeout(timer);
      timer = null;
      fn();
    };
    const queue = function () {
      clearTimeout(timer);
      timer = setTimeout(run, ms);
    };
    queue.flush = () => {
      if (timer) run();
    };
    return queue;
  },

  /* 임시저장 · 텍스트는 localStorage, 이미지는 ImageStore(IndexedDB) 로 나눠 담는다
     localStorage 는 제출물 PNG 와 한 쿼터를 나눠 쓰기 때문에 이미지까지 넣으면 금방 넘치고,
     넘치는 순간 학생이 캡처해 둔 이미지가 조용히 사라졌다.
       data   : 텍스트 등 가벼운 값
       images : { 필드명: dataURL|null } · null 이면 지운다
                (아직 복원 중이라 값을 못 믿을 때는 통째로 넘기지 않는다) */
  draftKeep: function (key, data, images) {
    const ok = this.draftSave(key, data);
    const store = window.ImageStore;
    if (store && images)
      Object.keys(images).forEach((field) => {
        const id = key + ":" + field;
        if (images[field]) store.put(id, images[field]);
        else store.del(id);
      });
    return ok;
  },
  /* 임시저장해 둔 이미지 하나를 꺼낸다 (없으면 null) */
  draftImage: function (key, field) {
    const store = window.ImageStore;
    return store ? store.get(key + ":" + field) : Promise.resolve(null);
  },

  todayKo: function () {
    return new Date().toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  },
  /* dialog.js · submit.core.js 에도 같은 구현이 있다 (로더가 수정 금지라 공용화 불가).
     큰따옴표를 빠뜨리면 esc() 결과를 속성값에 넣는 곳에서 따옴표가 깨진다. */
  esc: function (s) {
    return String(s == null ? "" : s).replace(
      /[<>&"]/g,
      (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c],
    );
  },

  /* 결과물 비율 조정 (가변폭 지원) */
  autoFit: function (selector, ratio) {
    const fit = () =>
      document.querySelectorAll(selector).forEach((el) => {
        const w = el.clientWidth;
        if (w) el.style.height = Math.round(w * ratio) + "px";
      });
    let t = null;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(fit, 120);
    });
    fit();
    return fit;
  },

  /* 외부 이미지 파일 선택 처리 */
  pickImage: function (onLoad) {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => onLoad(img);
        img.onerror = () =>
          this.say({
            danger: true,
            title: "이미지를 불러오지 못했어요",
            body: "다른 이미지 파일로 다시 시도해 주세요.",
          });
        img.src = r.result;
      };
      r.readAsDataURL(f);
    };
    inp.click();
  },
  /* 캔버스 중앙 채우기 (cover-fit) */
  coverDraw: function (cv, img) {
    const g = cv.getContext("2d"),
      W = cv.width,
      H = cv.height;
    const ar = (img.width || 1) / (img.height || 1);
    let dw, dh;
    if (ar > W / H) {
      dh = H;
      dw = H * ar;
    } else {
      dw = W;
      dh = W / ar;
    }
    g.clearRect(0, 0, W, H);
    g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    cv.style.display = "block";
  },

  /* 복제본 DOM 스타일 조회 (html2canvas) */
  styleOf: function (el) {
    return (el.ownerDocument.defaultView || window).getComputedStyle(el);
  },
  fontOf: function (el) {
    const s = this.styleOf(el);
    return (
      s.fontStyle + " " + s.fontWeight + " " + s.fontSize + " " + s.fontFamily
    );
  },
  /* html2canvas 한글 줄바꿈 버그 방지 (<br> 수동 삽입) */
  prewrap: function (el) {
    if (!el || this.styleOf(el).display === "none") return;
    const w = el.clientWidth;
    if (!w) return;
    const raw = el.textContent,
      cs = this.styleOf(el);
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = this.fontOf(el);
    const padL = parseFloat(cs.paddingLeft) || 0,
      padR = parseFloat(cs.paddingRight) || 0;
    const maxW = (w - padL - padR) * 0.98;
    const measure = (s) => ctx.measureText(s).width;
    const fitWord = (wd) => {
      /* 한 줄을 초과하는 단어 분리 */
      const o = [];
      let c = "";
      for (const ch of wd) {
        if (measure(c + ch) <= maxW || !c) c += ch;
        else {
          o.push(c);
          c = ch;
        }
      }
      if (c) o.push(c);
      return o;
    };
    const lines = [];
    let cur = "";
    for (const word of raw.split(" ")) {
      const parts = measure(word) > maxW ? fitWord(word) : [word];
      for (let k = 0; k < parts.length; k++) {
        const wd = parts[k],
          t = cur ? cur + (k === 0 ? " " : "") + wd : wd;
        if (measure(t) <= maxW || !cur) cur = t;
        else {
          lines.push(cur);
          cur = wd;
        }
      }
    }
    if (cur) lines.push(cur);
    el.innerHTML = lines.map((s) => this.esc(s)).join("<br>");
  },

  /* 결과물을 캔버스로 캡처 (html2canvas)
     폰트가 다 뜨기 전에 그리면 글자가 밀리므로 로드를 먼저 기다린다
       fonts        : 캡처 전에 로드를 확인할 폰트 (예: '13px "Pretendard"')
       beforeCapture: 캡처 직전 정리 (예: 박스 높이 확정)
       onclone      : 복제본 후처리 (줄바꿈 보정 등) */
  capture: async function (el, opt) {
    opt = opt || {};
    try {
      await document.fonts.ready;
    } catch (e) {}
    try {
      await Promise.all(
        (opt.fonts || []).map((f) => document.fonts.load(f, el.innerText)),
      );
    } catch (e) {}
    if (opt.beforeCapture) opt.beforeCapture();
    return await html2canvas(el, {
      scale: 2,
      useCORS: true,
      /* 둥근 모서리가 투명하게 뚫리는 것을 막으려고 단색 배경을 깐다 */
      backgroundColor: "#0b0c14",
      logging: false,
      onclone: (doc, root) => {
        root.style.boxShadow = "none"; /* 캡처본에서는 그림자가 테두리처럼 찍힌다 */
        if (opt.onclone) opt.onclone(doc, root);
      },
    });
  },

  /* 캡처한 캔버스를 PNG 로 내려받기 (버튼 로딩 상태까지 포함)
     filename 은 누른 시점의 입력값을 쓰도록 함수로 받는다 */
  savePng: async function (btn, render, filename) {
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = "이미지 만드는 중…";
    try {
      const cv = await render();
      const a = document.createElement("a");
      a.href = cv.toDataURL("image/png");
      a.download = filename();
      a.click();
    } catch (e) {
      console.error("[save]", e);
      this.say({
        danger: true,
        title: "이미지를 저장하지 못했어요",
        body: e?.message || String(e),
      });
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  },

  /* 보관함에 담기 + 나가기 전 확인 흐름
     상상보드와 캐릭터 카드가 글자까지 같던 부분을 여기 하나로 모았다.
     버튼(btnKeep/btnBack/btnClose)과 Esc 처리까지 여기서 건다.
       kind·title  : 보관함에 담길 결과물 종류와 이름
       render      : 결과물 캔버스를 만드는 함수
       complete    : 담을 준비가 됐는지 판정
       meta        : 함께 저장할 값
       hints       : 아직 못 담을 때 보여줄 안내 항목
       isReady     : 첫 화면 구성이 끝났는지 (그 전 변경은 '고침'으로 치지 않는다)
       beforeLeave : 나가기 직전 정리 (예: 프레임 루프 정지)
       canClose    : 지금 Esc 로 닫아도 되는지 (예: 캡처 모달이 떠 있으면 안 된다)
     반환: { markDirty } — 입력이 바뀔 때 호출하면 '담은 뒤 고쳤다'로 표시된다 */
  keeper: function (o) {
    const SC = this;
    const btn = this.$("btnKeep");
    let kept = false,
      dirty = false,
      keeping = false,
      closing = false;

    const canKeep = () => !!SC.locker();

    async function keep() {
      const lk = SC.locker();
      if (!lk) {
        SC.say({
          title: "여기서는 담을 수 없어요",
          body: "학습 화면에서 열어야 보관함에 담을 수 있어요.",
        });
        return false;
      }
      if (!o.complete()) {
        SC.say({
          title: "아직 담을 수 없어요",
          body: "두 가지를 채우면 담을 수 있어요.",
          list: o.hints,
        });
        return false;
      }
      if (keeping) return false;
      keeping = true;
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = "담는 중…";
      try {
        const cv = await o.render();
        const ok = await lk.add(o.kind, {
          title: o.title,
          img: cv.toDataURL("image/png"),
          meta: o.meta(),
        });
        if (ok) {
          kept = true;
          dirty = false;
          btn.textContent = "✓ 담았어요";
          setTimeout(() => {
            btn.textContent = old;
          }, 1600);
        } else btn.textContent = old;
        return ok;
      } catch (e) {
        console.error("[keep]", e);
        SC.say({
          danger: true,
          title: "담지 못했어요",
          body: e?.message || String(e),
        });
        btn.textContent = old;
        return false;
      } finally {
        keeping = false;
        btn.disabled = false;
      }
    }

    /* 담지 않은 채로 나가려 하면 한 번 물어본다 */
    async function closeSelf() {
      if (closing) return;
      closing = true;
      try {
        if (canKeep() && o.complete() && (!kept || dirty)) {
          const ask = await SC.ask({
            title: kept
              ? "고친 내용을 담을까요?"
              : "보관함에 담지 않고 나갈까요?",
            body: kept
              ? "담은 뒤에 고친 내용이 있어요. 담지 않으면 고치기 전 것이 남아요."
              : "담아야 미션으로 낼 수 있어요.",
            ok: "담고 나가기",
            cancel: "그냥 나가기",
          });
          if (ask) await keep();
        }
      } catch (e) {}
      if (o.beforeLeave) o.beforeLeave();
      SC.closeStudio();
      closing = false;
    }

    /* 학습 화면 밖(단독 창)에서는 담을 곳이 없으므로 버튼을 숨긴다 */
    if (!canKeep()) btn.style.display = "none";
    btn.addEventListener("click", keep);
    this.$("btnBack").addEventListener("click", () => closeSelf());
    this.$("btnClose").addEventListener("click", () => closeSelf());
    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (o.canClose && !o.canClose()) return;
      closeSelf();
    });

    return {
      markDirty: function () {
        if (o.isReady()) dirty = true;
      },
    };
  },
};
