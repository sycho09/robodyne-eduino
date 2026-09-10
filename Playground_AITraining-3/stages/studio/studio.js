(function () {
  const APPS = {
    idea: { url: "/stages/apps/idea-board.html", title: "AI 상상 보드" },
    character: { url: "/stages/apps/character-card.html", title: "내 AI 캐릭터" },
  };

  /* 부모 화면의 활성 탭을 트랙 키로 옮긴다.
     어떤 탭이 있는지는 index.html 의 nav 가 정하므로 여기서 직접 본다.
     ※ 트랙을 늘릴 때는 여기와 studio-common.js 의 TRACKS 를 함께 고칠 것 */
  const getTrack = () => {
    const n = document.querySelector(".nav-item.active");
    const k = n && n.dataset.feature;
    return k === "audio" || k === "pose" ? k : "image";
  };

  const buildQuery = () => {
    const t = getTrack();
    let q = "?track=" + t;
    if (t === "image") {
      try {
        const k = sessionStorage.getItem("vision_imagelab_mission");
        if (k) q += "&mission=" + encodeURIComponent(k);
      } catch (e) {}
    }
    return q;
  };

  const css = `
  .st-ov{position:fixed;inset:0;z-index:97;display:none;background:rgba(6,7,12,.92);}
  .st-ov.on{display:block;}
  .st-ov iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:#0a0b12;}`;

  let backdrop = null,
    iframe = null;

  function build() {
    if (backdrop) return;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
    backdrop = document.createElement("div");
    backdrop.className = "st-ov";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    iframe = document.createElement("iframe");
    iframe.setAttribute("allow", "camera;microphone");
    iframe.setAttribute("title", "결과물 스튜디오");
    backdrop.appendChild(iframe);
    document.body.appendChild(backdrop);
  }

  function show(key) {
    const app = APPS[key];
    if (!app) return;
    build();
    iframe.src = app.url + buildQuery();
    backdrop.classList.add("on");
    document.body.style.overflow = "hidden";
  }
  function hide() {
    if (!backdrop) return;
    backdrop.classList.remove("on");
    iframe.src = "about:blank";
    document.body.style.overflow = "";
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && backdrop && backdrop.classList.contains("on"))
      hide();
  });

  window.Studio = { open: show, close: hide };
})();
