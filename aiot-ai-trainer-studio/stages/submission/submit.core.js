/* VISION AI 결과물 Business Logic Layer */
(function() {
  const missionKey = (...args) => window.SubmitStore.missionKey(...args);
  /* dialog.js · studio-common.js 에도 같은 구현이 있다.
     세 파일의 로더(index.html · stages/apps/*.html)가 전부 수정 금지라
     공용 스크립트를 끼워 넣을 수 없어 부득이하게 복제한다. */
  const esc = (s) =>
    String(s == null ? "" : s).replace(
      /[<>&"]/g,
      (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c],
    );
  const modeNow = () =>
    (window.Session && Session.getMode && Session.getMode()) || {
      mode: "free",
    };

  /* 현재 트랙 판별 (사이드바 활성 항목 또는 해시 참조) */
  function trackKey() {
    const n = document.querySelector(".nav-item.active"),
      k = n && n.dataset.feature;
    if (k === "image" || k === "audio" || k === "pose") return k;
    const h = (location.hash || "").replace("#", "");
    return h === "audio" || h === "pose" ? h : "image";
  }
  /* 부모 화면의 추론 상태 참조 객체
     ※ 비전 콘솔의 console/shared.js `TRACKS` 와 트랙 키(image·pose·audio)를 공유한다.
        한쪽 트랙을 늘리거나 이름을 바꾸면 다른 쪽도 같이 확인할 것. */
  const TR = {
    image: {
      name: "이미지 분류",
      pred: "#top-pred .tp-name",
      pct: "top-donut-pct",
      conf: "#top-pred .tp-conf",
      toggle: "infer-toggle",
    },
    pose: {
      name: "동작 분류",
      pred: "#p-top-pred .tp-name",
      pct: "p-top-donut-pct",
      conf: "#p-top-pred .tp-conf",
      toggle: "p-infer-toggle",
    },
    audio: {
      name: "음성 분류",
      pred: "#a-top-pred .tp-name",
      pct: null,
      conf: "#a-top-pred .tp-conf",
      toggle: "a-infer-toggle",
    },
  };
  const tr = () => TR[trackKey()];

  /* 학습 패널 유무 확인 (사전학습 체험 스테이지 등) */
  const useBag = () => !!document.getElementById("panel-direct");
  const isTeach = () => modeNow().mode === "teach";

  /* 사용자 정보 확인용 (임시) */
  function currentUser() {
    return null;
  }

  const originKey = (track) => {
    const t = track || trackKey();
    return t === "image" ? missionKey() || "custom" : t;
  };
  /* 미션 표시명 조회 */
  const originName = (track) => {
    const t = track || trackKey();
    if (t !== "image") return TR[t].name;
    return (
      (window.ImageLab && ImageLab.missionName(missionKey())) || "자유 주제"
    );
  };
  const itemKey = (kind, track) => kind + "@" + originKey(track);

  /* 상단 예측 라벨 원문 (안내 문구 포함) */
  function predText() {
    const el = document.querySelector(tr().pred);
    return el ? el.textContent.trim() : "";
  }
  /* 안내 문구를 걸러낸 클래스 이름 */
  const nameOf = (t) =>
    t && !/학습 전|대기 중|무엇으로|어떤 동작/.test(t) ? t : "";
  /* 현재 인식된 클래스 이름 (안내 문구 제외) */
  const predName = () => nameOf(predText());
  function predPct() {
    const t = tr(),
      d = t.pct ? document.getElementById(t.pct) : null;
    const v = d ? parseInt(d.textContent, 10) : 0;
    if (v) return v;
    const c = document.querySelector(t.conf),
      m = c ? c.textContent.match(/(\d+)\s*%/) : null;
    return m ? parseInt(m[1], 10) : 0;
  }
  /* 결과물 생성 가능 여부 확인 (추론 및 클래스 인식 상태)
     400ms 폴링에서 상시 호출되므로 라벨을 한 번만 읽는다 */
  function phase() {
    const t = predText();
    if (!t || /학습 전/.test(t)) return "untrained";
    return nameOf(t) ? "live" : "trained";
  }

  /* 이미지 디코드 공통 골격
     - 디코드 지연(1.2초)·실패 시 원본 dataURL 그대로 진행
     - draw(im) 가 돌려준 dataURL 을 결과로 쓴다 */
  function decode(dataURL, draw) {
    return new Promise((res) => {
      if (!dataURL) return res(null);
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        res(v);
      };
      setTimeout(() => finish(dataURL), 1200);
      const im = new Image();
      im.onload = () => {
        try {
          finish(draw(im));
        } catch (e) {
          finish(dataURL);
        }
      };
      im.onerror = () => finish(dataURL);
      im.src = dataURL;
    });
  }

  /* 보관 이미지 리사이징 (용량 한도 방지) */
  const shrink = (dataURL, maxW) =>
    decode(dataURL, (im) => {
      const r = Math.min(1, (maxW || 1400) / (im.naturalWidth || 1));
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round((im.naturalWidth || 1) * r));
      cv.height = Math.max(1, Math.round((im.naturalHeight || 1) * r));
      const g = cv.getContext("2d");
      g.fillStyle = "#0b0c14";
      g.fillRect(0, 0, cv.width, cv.height); /* JPEG 는 투명을 못 담는다 */
      g.drawImage(im, 0, 0, cv.width, cv.height);
      return cv.toDataURL("image/jpeg", 0.8);
    });

  /* 결과물 파일 포맷 통일 (저장 시 PNG 변환) */
  const toPNG = (dataURL) =>
    decode(dataURL, (im) => {
      const cv = document.createElement("canvas");
      cv.width = im.naturalWidth || 640;
      cv.height = im.naturalHeight || 480;
      cv.getContext("2d").drawImage(im, 0, 0);
      return cv.toDataURL("image/png");
    });

  window.SubmitCore = { esc, modeNow, trackKey, tr, TR, useBag, isTeach, currentUser, originKey, originName, itemKey, predName, predPct, phase, shrink, toPNG, syncAll: () => window.Submit && window.Submit.refresh() };
})();
