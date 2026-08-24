/* VISION AI 이미지 분류 콘텐츠 레이어
   - 시나리오 카드, 데이터 코치, 배지
   - DOM 조작 및 관찰 */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    (s || "").replace(
      /[<>&"]/g,
      (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c],
    );

  // 이미지 분류 활성화 시 동작
  function isImage() {
    const h = (location.hash || "").replace("#", "");
    return !h || h === "image" || h === "create";
  }

  const SCEN = [
    {
      key: "recycle",
      emoji: "♻️",
      name: "분리수거 분류기",
      classes: ["캔", "페트병", "종이"],
      tip: "쓰레기를 각도·거리를 바꿔가며 20장씩. 배경이 섞이지 않게!",
    },
    {
      key: "rps",
      emoji: "✌️",
      name: "가위바위보",
      classes: ["가위", "바위", "보"],
      tip: "손을 화면 가운데에 크게. 배경은 단순하게.",
    },
    {
      key: "mask",
      emoji: "😷",
      name: "마스크 썼나요?",
      classes: ["썼음", "안 썼음"],
      tip: "얼굴이 잘 보이게, 밝은 곳에서 다양한 표정으로.",
    },
    {
      key: "thumb",
      emoji: "👍",
      name: "엄지 척 / 아래",
      classes: ["엄지 척", "엄지 아래"],
      tip: "손 모양을 또렷하게, 손 위치를 조금씩 바꿔가며.",
    },
    {
      key: "custom",
      emoji: "✨",
      name: "자유 주제",
      classes: ["클래스 1", "클래스 2"],
      tip: "내가 원하는 종류로 직접 만들어 보세요!",
    },
  ];
  const BADGES = [
    {
      key: "classes3",
      emoji: "🎯",
      label: "3종 분류기",
      test: (s) => s.classCount >= 3,
    },
    {
      key: "samples20",
      emoji: "📸",
      label: "사진 부자(20+)",
      test: (s) => s.maxCount >= 20,
    },
    {
      key: "trained",
      emoji: "🧠",
      label: "첫 학습 완료",
      test: (s) => s.trained,
    },
    {
      key: "acc90",
      emoji: "🏆",
      label: "정확도 90%+",
      test: (s) => s.acc >= 90,
    },
  ];

  const css = `
  #lab-scenarios{display:flex;gap:9px;flex-wrap:wrap;margin:4px 0 6px;}
  .lab-sc{display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--border);border-radius:12px;
    padding:9px 13px;cursor:pointer;transition:.15s;color:var(--ink-2);font-weight:700;font-size:13px;}
  .lab-sc:hover{border-color:var(--accent);color:var(--ink);transform:translateY(-1px);}
  /* 현재 미션 활성화 스타일 (테두리 두께 변경으로 인한 UI 흔들림 방지 위해 inset 그림자 사용) */
  .lab-sc.on{color:var(--ink);border-color:var(--accent);background:var(--accent-soft);
    box-shadow:inset 0 0 0 1px var(--accent), 0 4px 14px rgba(255,87,71,.18);}
  .lab-sc.on:hover{transform:none;}
  .lab-sc.on small{color:var(--accent-ink);}
  .lab-sc .e{font-size:17px;}
  .lab-sc small{display:block;font-weight:500;font-size:11px;color:var(--ink-3);}
  .lab-sctip{font-size:12px;color:var(--accent-ink);background:var(--accent-soft);border-radius:10px;padding:8px 12px;margin-bottom:8px;display:none;}
  .lab-sctip.on{display:block;}
  .lab-coach{margin-top:12px;border-top:1px solid var(--border);padding-top:11px;}
  .lab-coach h4{margin:0 0 8px;font-size:11px;font-family:var(--mono);letter-spacing:.05em;color:var(--ink-3);text-transform:uppercase;}
  .lab-ck{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink-2);margin-bottom:6px;}
  .lab-ck .b{width:17px;height:17px;border-radius:6px;display:grid;place-items:center;font-size:11px;flex:none;
    background:rgba(255,255,255,.07);color:var(--ink-3);}
  .lab-ck.ok .b{background:var(--green);color:#04140c;}
  .lab-ck.ok{color:var(--ink);}
  .lab-tipline{font-size:11.5px;color:var(--ink-3);margin-top:8px;line-height:1.55;}
  #lab-badges{display:inline-flex;gap:5px;vertical-align:middle;}
  .lab-badge{font-size:14px;filter:grayscale(1) opacity(.35);transition:.2s;}
  .lab-badge.on{filter:none;transform:scale(1.05);}
  .lab-toast{position:fixed;left:50%;bottom:30px;transform:translateX(-50%) translateY(18px);z-index:140;font-size:13.5px;font-weight:700;
    color:#1a0a08;background:var(--amber);border-radius:12px;padding:11px 17px;box-shadow:0 14px 40px rgba(0,0,0,.5);opacity:0;transition:.25s;pointer-events:none;}
  .lab-toast.on{opacity:1;transform:translateX(-50%) translateY(0);}`;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  let toastEl = null,
    toastT = null;
  function toast(m) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "lab-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = m;
    toastEl.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove("on"), 2000);
  }

  // DOM 헬퍼
  const items = () => [...document.querySelectorAll("#class-list .class-item")];
  const counts = () =>
    items().map((it) => ({
      name: (it.querySelector(".class-name")?.value || "").trim(),
      n: parseInt(it.querySelector(".class-count")?.textContent || "0") || 0,
    }));
  const hasData = () => counts().some((c) => c.n > 0);
  const trained = () => {
    const t = $("infer-toggle");
    return !!(t && !t.disabled);
  };
  const savedAcc = () => {
    try {
      return parseInt(localStorage.getItem("vision_imagelab_acc") || "0") || 0;
    } catch (e) {
      return 0;
    }
  };

  // 알림/확인창 UI는 dialog.js 공통 사용

  // 선택된 미션 상태 유지 (sessionStorage 사용)
  const curScen = () => {
    try {
      return sessionStorage.getItem("vision_imagelab_mission") || "";
    } catch (e) {
      return "";
    }
  };
  function markScenario(key) {
    document.querySelectorAll("#lab-scenarios .lab-sc").forEach((b) => {
      const on = b.dataset.k === key;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  // 미션 시나리오 UI 적용
  async function applyScenario(s) {
    // 클래스 구성이 변경되므로 데이터 존재 시 경고 표시
    if (hasData()) {
      const now = counts().filter((c) => c.n > 0);
      const ok = await VisionDialog.confirm({
        danger: true,
        title: `'${s.name}' 주제로 새로 시작할까요?`,
        body: "지금까지 모은 사진이 모두 지워지고, 클래스가 이 주제로 새로 만들어져요.",
        list: now.map((c) => `${c.name} ${c.n}장`),
        note: "남기려면 먼저 학습을 끝내고 결과물을 만들어 두세요.",
        ok: "새로 시작",
        cancel: "취소",
      });
      if (!ok) return;
    }
    // 현재 미션 상태 저장 (studio.js에서 참조)
    try {
      sessionStorage.setItem("vision_imagelab_mission", s.key);
    } catch (e) {}
    markScenario(s.key);
    // 기존 클래스 삭제 처리 (학습 상태 초기화 위해 내부 닫기 버튼 트리거)
    let guard = 0;
    while (items().length && guard++ < 12) {
      const del = items()[0].querySelector(".class-del");
      if (!del) break;
      del.click();
    }
    guard = 0;
    const add = $("add-class");
    while (items().length < s.classes.length && guard++ < 12 && add) {
      add.click();
    }
    items().forEach((it, i) => {
      const inp = it.querySelector(".class-name");
      if (inp && s.classes[i] !== undefined) {
        inp.value = s.classes[i];
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    const tip = $("lab-sctip");
    if (tip) {
      tip.innerHTML = "💡 " + esc(s.tip);
      tip.classList.add("on");
    }
    update();
  }

  function renderScenarios() {
    const box = $("lab-scenarios");
    if (!box) return;
    if (!isImage()) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML =
      '<div class="lab-sctip" id="lab-sctip"></div>' +
      '<div style="display:flex;gap:9px;flex-wrap:wrap;width:100%">' +
      SCEN.map(
        (s) =>
          `<button class="lab-sc" data-k="${s.key}" aria-pressed="false"><span class="e">${s.emoji}</span><span>${esc(s.name)}<small>${s.classes.join(" · ")}</small></span></button>`,
      ).join("") +
      "</div>";
    box.querySelectorAll(".lab-sc").forEach((b) =>
      b.addEventListener("click", () => {
        const s = SCEN.find((x) => x.key === b.dataset.k);
        if (s) applyScenario(s);
      }),
    );

    const key = curScen();
    if (!key) return;
    markScenario(key);
    const s = SCEN.find((x) => x.key === key),
      tip = $("lab-sctip");
    if (s && tip) {
      tip.innerHTML = "💡 " + esc(s.tip);
      tip.classList.add("on");
    }
  }

  // 데이터 코치
  function renderCoach() {
    const box = $("lab-coach");
    if (!box) return;
    if (!isImage()) {
      box.innerHTML = "";
      return;
    }
    const cs = counts();
    const total = cs.reduce((a, c) => a + c.n, 0);
    const mn = cs.length ? Math.min(...cs.map((c) => c.n)) : 0,
      mx = cs.length ? Math.max(...cs.map((c) => c.n)) : 0;
    const checks = [
      { ok: cs.length >= 2, t: "분류할 클래스 2개 이상 만들기" },
      {
        ok: cs.length >= 2 && cs.every((c) => c.n >= 10),
        t: "각 클래스 사진 10장 이상 모으기",
      },
      {
        ok: cs.length >= 2 && mx - mn <= Math.max(5, mx * 0.4),
        t: "클래스별 장수 균형 맞추기",
      },
      { ok: total >= 30, t: `전체 30장 이상 모으기 (현재 ${total}장)` },
    ];
    box.innerHTML =
      '<div class="lab-coach"><h4>데이터 코치</h4>' +
      checks
        .map(
          (c) =>
            `<div class="lab-ck${c.ok ? " ok" : ""}"><span class="b">${c.ok ? "✓" : " "}</span>${esc(c.t)}</div>`,
        )
        .join("") +
      '<div class="lab-tipline">📷 같은 물체라도 <b>각도·거리·배경·밝기</b>를 바꿔 다양하게 찍을수록 똑똑해져요.</div></div>';
  }

  // 배지
  function awarded() {
    try {
      return JSON.parse(localStorage.getItem("vision_imagelab_badges") || "[]");
    } catch (e) {
      return [];
    }
  }
  function renderBadges() {
    const box = $("lab-badges");
    if (!box) return;
    if (!isImage()) {
      box.innerHTML = "";
      return;
    }
    const got = awarded();
    box.innerHTML = BADGES.map(
      (b) =>
        `<span class="lab-badge${got.includes(b.key) ? " on" : ""}" title="${esc(b.label)}${got.includes(b.key) ? " · 획득!" : " (잠김)"}">${b.emoji}</span>`,
    ).join("");
  }
  function checkBadges() {
    const cs = counts();
    const snap = {
      classCount: cs.length,
      maxCount: cs.length ? Math.max(...cs.map((c) => c.n)) : 0,
      trained: trained(),
      acc: savedAcc(),
    };
    const got = awarded();
    let changed = false;
    BADGES.forEach((b) => {
      if (!got.includes(b.key) && b.test(snap)) {
        got.push(b.key);
        changed = true;
        toast(b.emoji + " 배지 획득 · " + b.label);
      }
    });
    if (changed) {
      try {
        localStorage.setItem("vision_imagelab_badges", JSON.stringify(got));
      } catch (e) {}
      renderBadges();
    }
  }

  // 정확도 챌린지
  const ROUNDS = 6;
  const ccss = `
  .lc-ov{position:fixed;inset:0;z-index:99;display:none;background:rgba(6,7,12,.95);backdrop-filter:blur(9px);color:#f2f4fb;font-family:'Pretendard',system-ui,sans-serif;}
  .lc-ov.on{display:flex;align-items:center;justify-content:center;padding:22px;}
  .lc-card{width:min(560px,100%);background:rgba(255,255,255,.04);border-radius:20px;padding:26px;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 30px 70px rgba(0,0,0,.55);}
  .lc-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
  .lc-top h3{margin:0;font-size:18px;font-weight:800;}
  .lc-x{width:34px;height:34px;border-radius:10px;border:0;background:rgba(255,255,255,.06);color:#aeb6cf;font-size:14px;cursor:pointer;}
  .lc-prog{font-family:'JetBrains Mono',monospace;font-size:12px;color:#737c9c;}
  .lc-prompt{font-size:14px;color:#aeb6cf;margin:18px 0 6px;}
  .lc-big{font-size:42px;font-weight:800;letter-spacing:-.02em;margin:0 0 4px;}
  .lc-count{font-family:'JetBrains Mono',monospace;font-size:60px;font-weight:800;color:var(--accent-ink,#ff8472);margin:6px 0;line-height:1;}
  .lc-live{font-size:13px;color:#737c9c;min-height:20px;}
  .lc-flash{font-size:54px;margin:8px 0;}
  .lc-result .acc{font-size:64px;font-weight:800;letter-spacing:-.02em;}
  .lc-result .lbl{font-size:13px;color:#aeb6cf;margin-bottom:14px;}
  .lc-btn{font-size:15px;font-weight:800;color:#fff;border:0;border-radius:12px;padding:13px 18px;cursor:pointer;
    background:linear-gradient(135deg,#ff8472,#e8392b);}
  .lc-btn.ghost{color:#aeb6cf;background:rgba(255,255,255,.06);}
  .lc-row{display:flex;gap:9px;justify-content:center;margin-top:8px;}
  .lc-hint{font-size:12px;color:#737c9c;margin-top:12px;line-height:1.5;}`;
  const cst = document.createElement("style");
  cst.textContent = ccss;
  document.head.appendChild(cst);
  const cOv = document.createElement("div");
  cOv.className = "lc-ov";
  cOv.innerHTML = `<div class="lc-card">
    <div class="lc-top"><h3>🎯 정확도 챌린지</h3><span class="lc-prog" id="lcProg"></span><button class="lc-x" id="lcX">✕</button></div>
    <div id="lcBody"></div></div>`;
  function cEnsure() {
    if (!document.body.contains(cOv)) document.body.appendChild(cOv);
  }
  function curPred() {
    const el = document.querySelector("#top-pred .tp-name");
    const t = el ? el.textContent.trim() : "";
    return t && t !== "아직 학습 전" && t !== "지금 무엇으로 보이나요?"
      ? t
      : "";
  }
  let cIdx = 0,
    cCorrect = 0,
    cTarget = "",
    cTimer = null,
    cNames = [];
  const cBody = () => cOv.querySelector("#lcBody");
  const cProg = () => cOv.querySelector("#lcProg");
  function cClose() {
    clearInterval(cTimer);
    cOv.classList.remove("on");
  }
  function startScreen() {
    cProg().textContent = "";
    cBody().innerHTML = `<div class="lc-prompt">학습한 AI가 얼마나 똑똑한지 시험해요!</div>
      <div class="lc-big">${ROUNDS}문제 도전</div>
      <div class="lc-hint">화면에 나오는 클래스를 카메라에 보여주면 AI가 맞히는지 확인해요.<br>추론이 꺼져 있으면 자동으로 켭니다.</div>
      <div class="lc-row"><button class="lc-btn" id="lcStart">시작하기 ▶</button></div>`;
    cOv.querySelector("#lcStart").onclick = run;
  }
  function ensureInfer() {
    const t = $("infer-toggle");
    if (t && /시작/.test(t.textContent)) t.click();
  }
  function run() {
    cIdx = 0;
    cCorrect = 0;
    ensureInfer();
    setTimeout(nextRound, 500);
  }
  function nextRound() {
    cTarget = cNames[Math.floor(Math.random() * cNames.length)];
    cProg().textContent = cIdx + 1 + " / " + ROUNDS + " · 점수 " + cCorrect;
    let n = 4;
    const draw = () => {
      cBody().innerHTML = `<div class="lc-prompt">이것을 카메라에 보여주세요</div>
      <div class="lc-big">${esc(cTarget)}</div><div class="lc-count">${n}</div>
      <div class="lc-live">지금 AI는… <b style="color:#cdb6bd">${esc(curPred() || "—")}</b></div>`;
    };
    draw();
    clearInterval(cTimer);
    cTimer = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(cTimer);
        evaluate();
      } else draw();
    }, 1000);
  }
  function evaluate() {
    const pred = curPred();
    const ok = pred === cTarget;
    if (ok) cCorrect++;
    cBody().innerHTML = `<div class="lc-flash">${ok ? "✅" : "❌"}</div>
      <div class="lc-big" style="font-size:24px">${ok ? "정답!" : "아쉬워요"}</div>
      <div class="lc-live">정답: <b>${esc(cTarget)}</b> · AI 예측: <b style="color:${ok ? "#42e29b" : "#ff7a90"}">${esc(pred || "없음")}</b></div>`;
    cIdx++;
    setTimeout(() => {
      if (cIdx < ROUNDS) nextRound();
      else finish();
    }, 1100);
  }
  function finish() {
    const acc = Math.round((cCorrect / ROUNDS) * 100);
    try {
      localStorage.setItem("vision_imagelab_acc", String(acc));
    } catch (e) {}
    const grade =
      acc >= 90
        ? "🏆 완벽해요!"
        : acc >= 70
          ? "👍 훌륭해요"
          : acc >= 50
            ? "🙂 좋아요"
            : "💪 더 학습해봐요";
    cProg().textContent = "완료";
    cBody().innerHTML = `<div class="lc-result"><div class="acc" style="color:${acc >= 70 ? "#42e29b" : acc >= 50 ? "#ffd36a" : "#ff7a90"}">${acc}%</div>
      <div class="lbl">${ROUNDS}문제 중 ${cCorrect}개 정답 · ${grade}</div>
      <div class="lc-hint">정확도가 낮다면 사진을 더 다양하게 모아 다시 학습해보세요!</div>
      <div class="lc-row"><button class="lc-btn ghost" id="lcAgain">다시 도전</button><button class="lc-btn" id="lcDone">확인</button></div></div>`;
    cOv.querySelector("#lcAgain").onclick = run;
    cOv.querySelector("#lcDone").onclick = cClose;
    update();
  }
  function openChallenge() {
    cNames = counts()
      .filter((c) => c.n > 0)
      .map((c) => c.name);
    if (!trained()) {
      VisionDialog.alert({
        title: "아직 도전할 수 없어요",
        body: "먼저 모델 학습을 끝낸 뒤에 도전할 수 있어요.",
      });
      return;
    }
    if (cNames.length < 2) {
      VisionDialog.alert({
        title: "아직 도전할 수 없어요",
        body: "사진을 모은 클래스가 2개 이상 있어야 해요.",
      });
      return;
    }
    cEnsure();
    startScreen();
    cOv.classList.add("on");
  }
  cOv.querySelector("#lcX").onclick = cClose;
  cOv.addEventListener("click", (e) => {
    if (e.target === cOv) cClose();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && cOv.classList.contains("on")) cClose();
  });

  function update() {
    renderCoach();
    renderBadges();
    checkBadges();
    const cb = $("challengeBtn");
    if (cb) {
      const show = isImage() && trained();
      cb.style.display = show ? "" : "none";
      if (show && !cb._wired) {
        cb._wired = true;
        cb.addEventListener("click", openChallenge);
      }
    }
  }

  function init() {
    renderScenarios();
    update();
    setInterval(update, 1300);
    window.addEventListener("hashchange", () => {
      renderScenarios();
      update();
    });
  }
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
  // 미션 표시명 조회 (submit.js 전달용)
  const missionName = (k) => {
    const s = SCEN.find((x) => x.key === k);
    return s ? s.name : "";
  };
  window.ImageLab = { applyScenario, update, missionName };
})();
