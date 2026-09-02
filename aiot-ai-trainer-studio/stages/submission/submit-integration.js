(function () {
  function activeCam() {
    const v = document.getElementById("webcam");
    if (v && v.videoWidth) return v;
    const p = document.getElementById("p-webcam");
    if (p && p.videoWidth) return p;
    return null;
  }
  function getTopClass() {
    const sels = [
      "#top-pred .tp-name",
      "#p-top-pred .tp-name",
      "#a-top-pred .tp-name",
    ];
    for (const s of sels) {
      const e = document.querySelector(s);
      if (e) {
        const t = e.textContent.trim();
        if (t && !/학습 전|무엇으로/.test(t)) return t;
      }
    }
    return "";
  }
  function getTopScore() {
    for (const id of ["top-donut-pct", "p-top-donut-pct", "a-top-donut-pct"]) {
      const e = document.getElementById(id);
      if (e && e.textContent.trim()) return e.textContent.trim();
    }
    return "";
  }
  // 결과 스냅샷: 현재 카메라 프레임과 예측 라벨을 합성하여 이미지 반환
  function captureResult() {
    const v = activeCam();
    const W = 640;
    let H = 480;
    if (v && v.videoWidth) H = Math.round((W * v.videoHeight) / v.videoWidth);
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#0a0b12";
    ctx.fillRect(0, 0, W, H);
    try {
      if (v && v.videoWidth) ctx.drawImage(v, 0, 0, W, H);
    } catch (e) {}
    const name = getTopClass(),
      pct = getTopScore();
    if (name) {
      ctx.fillStyle = "rgba(0,0,0,.62)";
      ctx.fillRect(0, H - 52, W, 52);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 23px Pretendard,system-ui,sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(name + (pct ? "  " + pct : ""), 16, H - 26);
    }
    if (!v || !v.videoWidth) {
      // 카메라 미사용 트랙(음성 등) 처리
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#1a1320");
      g.addColorStop(1, "#0a0b12");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center";
      ctx.fillStyle = "#ff8472";
      ctx.font = "bold 22px Pretendard,system-ui,sans-serif";
      ctx.fillText(label() || "직접 제작", W / 2, H / 2 - 46);
      ctx.fillStyle = "#f2f4fb";
      ctx.font = "bold 44px Pretendard,system-ui,sans-serif";
      ctx.fillText(name || "결과", W / 2, H / 2 + 8);
      if (pct) {
        ctx.fillStyle = "#aeb6cf";
        ctx.font = "20px JetBrains Mono, monospace";
        ctx.fillText(pct, W / 2, H / 2 + 52);
      }
    }
    return cv.toDataURL("image/jpeg", 0.86);
  }
  function getTrack() {
    const h = (location.hash || "").replace("#", "");
    return h || "image";
  }
  function label() {
    const fi = document.getElementById("fi-name");
    return fi ? fi.textContent.trim() : "직접 제작";
  }
  function getTags() {
    return [label(), getTopClass()].filter(Boolean);
  }
  function showHint() {
    const m = (window.Session && Session.getMode && Session.getMode()) || {
      mode: "free",
    };
    const el = document.getElementById("action-hint");
    if (!el) return;
    // 체험 모드는 사이드바에서 직접 안내하므로 중복 방지를 위해 문구 비움
    el.textContent =
      m.mode === "teach"
        ? "교사: 학생이 제출할 클래스 미션을 만들어요."
        : m.mode === "class"
          ? "학생: 학습한 결과를 캡처해 미션으로 제출하세요. (제출 필수)"
          : "";
    el.style.display = el.textContent ? "" : "none";
  }
  function syncTitle() {
    const h = document.getElementById("vTitle");
    if (!h) return;
    const k = getTrack();
    const ic = k === "audio" || k === "pose" ? k : "image";
    h.innerHTML = '<i data-ic="' + ic + '"></i> ' + label();
    if (window.paintIcons) paintIcons(h);
  }
  function initSubmit() {
    if (window.Submit)
      Submit.init({
        feature: getTrack(),
        label: label(),
        capture: captureResult,
        summary: getTags,
      });
    showHint();
    syncTitle();
  }
  if (document.readyState !== "loading") initSubmit();
  else document.addEventListener("DOMContentLoaded", initSubmit);
  window.addEventListener("hashchange", () => setTimeout(initSubmit, 80));
  const tg = document.getElementById("theoryToggle");
  if (tg)
    tg.addEventListener("click", () => {
      const fi = document.querySelector(".feature-info");
      if (fi) fi.classList.toggle("show-theory");
    });
})();
