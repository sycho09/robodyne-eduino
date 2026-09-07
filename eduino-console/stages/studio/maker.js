/* VISION AI AI 인터랙션 빌더
   - 클래스 인식 시 반응하는 '작품' 제작 기능
   - DOM 예측 결과만 참조하여 동작 */
(function () {
  const esc = (s) =>
    (s || "").replace(
      /[<>&"]/g,
      (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c],
    );
  // 선택형 이모지 팔레트
  const EMOJIS = [
    "🎉",
    "✨",
    "👍",
    "❤️",
    "🔥",
    "⭐",
    "😀",
    "😎",
    "😮",
    "🥳",
    "🐱",
    "🐶",
    "🍎",
    "🍕",
    "🚀",
    "🌈",
    "👏",
    "💯",
    "🎈",
    "✌️",
    "🙌",
    "👀",
    "💥",
    "🎵",
  ];
  // 액션 카탈로그 (추가 시 확장 가능)
  const ACTIONS = {
    emoji: { label: "이모지 표시", kind: "hold", def: "🎉" },
    text: { label: "글자 표시", kind: "hold", def: "정답!" },
    confetti: { label: "축하 효과 🎉", kind: "hold", def: "" },
    bg: { label: "배경색 전환", kind: "hold", def: "#3b86ff" },
    tone: {
      label: "소리 재생",
      kind: "fire",
      def: "659",
      opts: [
        ["523", "도"],
        ["587", "레"],
        ["659", "미"],
        ["698", "파"],
        ["784", "솔"],
        ["880", "라"],
        ["988", "시"],
      ],
    },
    score: { label: "점수 +1", kind: "fire", def: "1" },
    none: { label: "반응 없음", kind: "none", def: "" },
  };

  const ov = document.createElement("div");
  ov.className = "mk-ov";
  ov.innerHTML = `<div class="mk-wrap">
    <div class="mk-bar">
      <div class="mk-ttl"><button class="mk-back" id="mkBack">← 뒤로</button><h2>AI 인터랙션 빌더</h2><span class="tag">CREATE</span></div>
      <div class="mk-tools">
        <button class="mk-b play" id="mkPlay">▶ 플레이</button>
        <button class="mk-b keep" id="mkKeep">📥 내 보관함에 담기</button>
        <button class="mk-b" id="mkSave">내 컴퓨터에 저장</button>
        <button class="mk-close" id="mkClose">✕</button>
      </div>
    </div>
    <p class="mk-sub">방금 <b>학습시킨 클래스</b>를 카메라로 보여주면, 내가 정한 <b>반응(소리·이모지·점수…)</b>이 나오는 나만의 작품을 만들어요. 예: “가위→✌️, 바위→점수+1, 보→배경 파랑”.</p>
    <div class="mk-grid">
      <div class="mk-panel">
        <p class="mk-h">규칙 · 클래스를 보면 →</p>
        <div id="mkRules"></div>
        <div class="mk-warn" id="mkWarn">먼저 페이지에서 <b>카메라 켜기 → 추론 시작</b>을 누르면, 보이는 클래스에 따라 작품이 반응해요.</div>
        <p class="mk-note">학습한 클래스마다 반응(액션)을 골라 나만의 작품을 만들어요. 같은 방식으로 게임·장면 전환도 만들 수 있어요.</p>
      </div>
      <div class="mk-panel mk-stagewrap">
        <div class="mk-h mk-stagehead">무대 · 미리보기
          <span class="mk-stat"><span class="mk-chip" id="mkTime" style="display:none">⏱ —</span><span class="mk-chip" id="mkCur">대기중</span><span class="mk-chip" id="mkScore">SCORE <b>0</b></span></span>
        </div>
        <canvas class="mk-stage" id="mkStage" width="640" height="480"></canvas>
        <div class="mk-result" id="mkResult"></div>
      </div>
    </div>
  </div>`;

  function ensure() {
    if (!document.body.contains(ov)) document.body.appendChild(ov);
  }
  let toastEl = null,
    toastT = null;
  function toast(m) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "mk-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = "✓ " + m;
    toastEl.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove("on"), 1600);
  }
  // dialog.js 공통 알림창 사용

  // 학습된 클래스 파싱
  function readClasses() {
    let rows = [...document.querySelectorAll("#class-list .class-name")];
    let names = rows
      .map((e) => (e.value || e.textContent || "").trim())
      .filter(Boolean);
    if (!names.length)
      names = [...document.querySelectorAll("#bars .bar-name")]
        .map((e) => e.textContent.trim())
        .filter(Boolean);
    // class-list 내 색상 스와치 확인 후 사용
    const cols = [
      ...document.querySelectorAll('#class-list [style*="background"]'),
    ]
      .map((e) => e.style.backgroundColor)
      .filter(Boolean);
    const palette = [
      "#6aa6ff",
      "#ffb84d",
      "#42e29b",
      "#ff7a90",
      "#b98cff",
      "#4dd0e1",
    ];
    return names.map((n, i) => ({
      name: n,
      color: cols[i] || palette[i % palette.length],
    }));
  }
  function curPred() {
    const el = document.querySelector("#top-pred .tp-name");
    const t = el ? el.textContent.trim() : "";
    return t && t !== "아직 학습 전" && t !== "지금 무엇으로 보이나요?"
      ? t
      : "";
  }
  function curConf() {
    const el = document.getElementById("top-donut-pct");
    const v = el ? parseInt(el.textContent) : 0;
    return isNaN(v) ? 0 : v;
  }
  function activeCam() {
    const v = document.getElementById("webcam");
    return v && v.videoWidth ? v : null;
  }

  let rules = {}; // name -> [ {type,value,color}, ... ]
  let game = { time: 0, target: 0 };
  function ensureRule(name) {
    if (!rules[name] || !rules[name].length)
      rules[name] = [{ type: "emoji", value: "🎉", color: "#ffffff" }];
    return rules[name];
  }
  const typeOpts = () =>
    Object.entries(ACTIONS)
      .map(([k, a]) => `<option value="${k}">${a.label}</option>`)
      .join("");

  function gameHtml() {
    const tOpt = [
      [0, "없음"],
      [30, "30초"],
      [60, "60초"],
      [90, "90초"],
    ]
      .map(
        (o) =>
          `<option value="${o[0]}"${game.time === o[0] ? " selected" : ""}>${o[1]}</option>`,
      )
      .join("");
    return `<div class="mk-game"><div class="gh">🎯 게임 규칙 (선택)</div>
      <div class="mk-grow"><label>제한 시간</label><select class="mk-sel" id="gTime">${tOpt}</select></div>
      <div class="mk-grow"><label>목표 점수 <small style="color:var(--ink-3)">(0=없음)</small></label><input class="mk-val" id="gTarget" type="number" min="0" max="99" value="${game.target}" style="width:70px"></div></div>`;
  }
  function buildVal(w, a) {
    const t = a.type;
    if (t === "emoji") {
      w.innerHTML = `<select class="mk-sel mk-emoji" data-role="val">${EMOJIS.map((e) => `<option${e === a.value ? " selected" : ""}>${e}</option>`).join("")}</select>`;
      w.querySelector("[data-role=val]").onchange = (e) =>
        (a.value = e.target.value);
    } else if (t === "text") {
      w.innerHTML = `<input class="mk-val" type="text" data-role="val" value="${esc(a.value)}" placeholder="정답!" style="width:88px"><input class="mk-val" type="color" data-role="col" value="${a.color || "#ffffff"}" title="글자색">`;
      w.querySelector("[data-role=val]").oninput = (e) =>
        (a.value = e.target.value);
      w.querySelector("[data-role=col]").oninput = (e) =>
        (a.color = e.target.value);
    } else if (t === "bg") {
      w.innerHTML = `<input class="mk-val" type="color" data-role="val" value="${a.value || "#3b86ff"}">`;
      w.querySelector("[data-role=val]").oninput = (e) =>
        (a.value = e.target.value);
    } else if (t === "tone") {
      w.innerHTML = `<select class="mk-sel" data-role="val">${ACTIONS.tone.opts.map((o) => `<option value="${o[0]}"${o[0] === a.value ? " selected" : ""}>${o[1]}</option>`).join("")}</select>`;
      w.querySelector("[data-role=val]").onchange = (e) =>
        (a.value = e.target.value);
    } else {
      w.innerHTML = "";
    }
  }
  function renderRules() {
    const cs = readClasses();
    const box = ov.querySelector("#mkRules");
    if (!cs.length) {
      box.innerHTML =
        '<div class="mk-empty">아직 학습한 클래스가 없어요.<br>페이지에서 클래스를 만들고 사진을 모아 <b>모델 학습</b>을 한 뒤 다시 열어주세요.</div>';
      return;
    }
    box.innerHTML =
      gameHtml() +
      cs
        .map((c) => {
          const arr = ensureRule(c.name);
          return `<div class="mk-blk" data-name="${esc(c.name)}">
        <div class="mk-blk-h"><span class="mk-dot" style="background:${c.color}"></span><span class="mk-cn" title="${esc(c.name)}">${esc(c.name)}</span><span class="mk-arrow">→</span></div>
        <div data-role="acts">${arr.map((a, i) => `<div class="mk-actrow" data-i="${i}"><select class="mk-sel" data-role="type">${typeOpts()}</select><span data-role="valwrap"></span><button class="mk-del" data-del title="삭제">✕</button></div>`).join("")}</div>
        <button class="mk-addact" data-add>＋ 액션 추가</button></div>`;
        })
        .join("");
    const gT = box.querySelector("#gTime");
    if (gT) gT.onchange = () => (game.time = +gT.value);
    const gG = box.querySelector("#gTarget");
    if (gG) gG.oninput = () => (game.target = Math.max(0, +gG.value || 0));
    box.querySelectorAll(".mk-blk").forEach((blk) => {
      const name = blk.dataset.name;
      const arr = rules[name];
      blk.querySelector("[data-add]").addEventListener("click", () => {
        if (arr.length < 4) {
          arr.push({ type: "emoji", value: "🎉", color: "#ffffff" });
          renderRules();
        }
      });
      blk.querySelectorAll(".mk-actrow").forEach((row) => {
        const i = +row.dataset.i;
        const a = arr[i];
        if (!a) return;
        const sel = row.querySelector("[data-role=type]");
        sel.value = a.type;
        const w = row.querySelector("[data-role=valwrap]");
        sel.addEventListener("change", () => {
          a.type = sel.value;
          a.value = ACTIONS[sel.value] ? ACTIONS[sel.value].def : "";
          if (sel.value === "text") a.color = "#ffffff";
          buildVal(w, a);
        });
        row.querySelector("[data-del]").addEventListener("click", () => {
          arr.splice(i, 1);
          ensureRule(name);
          renderRules();
        });
        buildVal(w, a);
      });
    });
  }

  // 무대 렌더 및 플레이 루프
  let playing = false,
    raf = 0,
    score = 0,
    lastFired = "",
    frame = 0,
    confetti = [],
    remaining = 0,
    gTimer = null;
  const cv = () => ov.querySelector("#mkStage");
  const CCOL = [
    "#ff5747",
    "#ffb84d",
    "#42e29b",
    "#6aa6ff",
    "#b98cff",
    "#ff7a90",
  ];
  function spawnConfetti(W) {
    return {
      x: Math.random() * W,
      y: -12,
      vx: (Math.random() - 0.5) * 2.4,
      vy: 2 + Math.random() * 3,
      s: 7 + Math.random() * 7,
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.32,
      col: CCOL[Math.floor(Math.random() * CCOL.length)],
    };
  }
  function drawConfetti(ctx, W, H) {
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.col;
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.62);
      ctx.restore();
      if (p.y > H + 24) confetti.splice(i, 1);
    }
    if (confetti.length > 420) confetti.splice(0, confetti.length - 420);
  }

  function drawStage() {
    const c = cv(),
      ctx = c.getContext("2d"),
      W = c.width,
      H = c.height;
    frame++;
    ctx.clearRect(0, 0, W, H);
    const grd = ctx.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, "#101526");
    grd.addColorStop(1, "#070a12");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
    const cam = activeCam();
    // 카메라 좌우 반전 적용
    if (cam) {
      try {
        ctx.save();
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
        ctx.globalAlpha = 0.95;
        ctx.drawImage(cam, 0, 0, W, H);
        ctx.restore();
      } catch (e) {}
    }
    const name = playing ? curPred() : "";
    const acts = name ? rules[name] || [] : [];
    const bg = acts.find((a) => a.type === "bg");
    if (bg) {
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = bg.value || "#3b86ff";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    const emos = acts
      .filter((a) => a.type === "emoji")
      .map((a) => a.value || "🎉");
    const txts = acts.filter((a) => a.type === "text");
    const emojiY = txts.length ? H * 0.4 : H / 2;
    const textY = emos.length ? H * 0.7 : H / 2;
    if (emos.length) {
      const bob = Math.sin(frame / 8) * 8;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,.5)";
      ctx.shadowBlur = 20;
      const fs = emos.length >= 3 ? 108 : emos.length === 2 ? 132 : 160;
      ctx.font = fs + "px serif";
      emos.forEach((e, i) => {
        const x = emos.length === 1 ? W / 2 : (W * (i + 1)) / (emos.length + 1);
        ctx.fillText(e, x, emojiY + bob);
      });
      ctx.restore();
    }
    if (txts.length) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 64px Pretendard,system-ui,sans-serif";
      ctx.lineJoin = "round";
      ctx.lineWidth = 12;
      txts.forEach((a, i) => {
        const y = textY + i * 70;
        const t = a.value || "정답!";
        ctx.strokeStyle = "rgba(0,0,0,.82)";
        ctx.strokeText(t, W / 2, y);
        ctx.fillStyle = a.color || "#ffffff";
        ctx.fillText(t, W / 2, y);
      });
      ctx.restore();
    }
    if (acts.some((a) => a.type === "confetti")) {
      for (let i = 0; i < 5; i++) confetti.push(spawnConfetti(W));
    }
    drawConfetti(ctx, W, H);
    if (!cam) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.globalAlpha = 0.5;
      ctx.font = "64px serif";
      ctx.fillText("🎮", W / 2, H / 2 - 14);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#9aa3bf";
      ctx.font = "bold 16px Pretendard,system-ui,sans-serif";
      ctx.fillText(
        playing
          ? "카메라를 켜고 추론을 시작하면 여기서 반응해요"
          : "미리보기 — ▶ 플레이를 누르면 시작",
        W / 2,
        H / 2 + 44,
      );
      ctx.restore();
    }
    const sc = ov.querySelector("#mkScore");
    if (sc) sc.innerHTML = "SCORE <b>" + score + "</b>";
    const cu = ov.querySelector("#mkCur");
    if (cu)
      cu.textContent = playing
        ? name
          ? name + " · " + curConf() + "%"
          : "인식 대기"
        : "대기중";
    keepMoment(c, !!name); // 반응 시점 이미지 캡처
  }

  /* 반응 시점 캡처 보관
     (플레이 중 정지 시 반응 없는 화면 저장 방지) */
  let shot = null,
    shotAt = 0;
  function keepMoment(c, live) {
    if (!playing || !live) return;
    const now = Date.now();
    if (now - shotAt < 250) return;
    try {
      if (!shot) {
        shot = document.createElement("canvas");
      }
      if (shot.width !== c.width || shot.height !== c.height) {
        shot.width = c.width;
        shot.height = c.height;
      }
      shot.getContext("2d").drawImage(c, 0, 0);
      shotAt = now;
    } catch (e) {}
  }
  const hasMoment = () => !!shot;
  function tickFire() {
    if (!playing) return;
    const name = curPred();
    if (name && name !== lastFired) {
      // 클래스 변경 시 1회성 액션 발동
      lastFired = name;
      (rules[name] || []).forEach((a) => {
        if (a.type === "score") score++;
        else if (a.type === "tone") beep(parseInt(a.value) || 660);
      });
      if (game.target > 0 && score >= game.target) {
        endGame("win");
      }
    }
    if (!name) lastFired = "";
  }
  function loop() {
    if (!playing) return;
    drawStage();
    raf = requestAnimationFrame(loop);
  }
  let fireTimer = null;
  function updateTimeChip() {
    const c = ov.querySelector("#mkTime");
    if (!c) return;
    if (playing && game.time > 0) {
      c.style.display = "";
      c.textContent = "⏱ " + Math.max(0, remaining);
    } else c.style.display = "none";
  }
  function hideResult() {
    const r = ov.querySelector("#mkResult");
    if (r) r.classList.remove("on");
  }
  function showResult(reason) {
    const r = ov.querySelector("#mkResult");
    if (!r) return;
    const win = reason === "win";
    r.innerHTML = `<div class="rt">${win ? "🏆 승리!" : "⏱ 시간 종료"}</div>
      <div class="rs">최종 점수 <b style="color:#42e29b">${score}</b>점${game.target ? " / 목표 " + game.target : ""}</div>
      <div class="rrow"><button class="mk-rbtn ghost" id="mkRsave">보관함에 담기</button><button class="mk-rbtn" id="mkRagain">다시 플레이</button></div>`;
    r.classList.add("on");
    r.querySelector("#mkRagain").onclick = () => {
      hideResult();
      play(true);
    };
    r.querySelector("#mkRsave").onclick = () => keep();
  }
  function endGame(reason) {
    if (!playing) return;
    playing = false;
    clearInterval(fireTimer);
    clearInterval(gTimer);
    cancelAnimationFrame(raf);
    const btn = ov.querySelector("#mkPlay");
    btn.classList.remove("on");
    btn.textContent = "▶ 플레이";
    drawStage();
    updateTimeChip();
    showResult(reason);
  }
  function play(on) {
    playing = on;
    const btn = ov.querySelector("#mkPlay");
    btn.classList.toggle("on", on);
    btn.textContent = on ? "⏸ 정지" : "▶ 플레이";
    ov.querySelector("#mkWarn").classList.toggle("on", on && !curPred());
    if (on) {
      hideResult();
      score = 0;
      lastFired = "";
      frame = 0;
      confetti = [];
      remaining = game.time || 0;
      updateTimeChip();
      clearInterval(fireTimer);
      fireTimer = setInterval(tickFire, 160);
      clearInterval(gTimer);
      if (game.time > 0) {
        gTimer = setInterval(() => {
          remaining--;
          updateTimeChip();
          if (remaining <= 0) endGame("time");
        }, 1000);
      }
      cancelAnimationFrame(raf);
      loop();
    } else {
      clearInterval(fireTimer);
      clearInterval(gTimer);
      cancelAnimationFrame(raf);
      confetti = [];
      updateTimeChip();
      drawStage();
    }
  }

  // 효과음 재생
  let actx = null;
  function beep(f) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(),
        g = actx.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      g.gain.value = 0.06;
      o.connect(g);
      g.connect(actx.destination);
      const t = actx.currentTime;
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.start(t);
      o.stop(t + 0.18);
    } catch (e) {}
  }

  /* 이미지 캡처 (보관함용 JPEG, 파일 저장용 PNG) */
  function snapshot(mime) {
    // 반응 캡처 이미지 또는 현재 무대 사용
    const c = shot || cv(),
      out = document.createElement("canvas");
    out.width = c.width;
    out.height = c.height;
    const ctx = out.getContext("2d");
    ctx.drawImage(c, 0, 0);
    ctx.fillStyle = "rgba(0,0,0,.5)";
    ctx.fillRect(0, out.height - 40, out.width, 40);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px Pretendard,system-ui,sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("AI 인터랙션 · SCORE " + score, 14, out.height - 20);
    return mime === "image/png"
      ? out.toDataURL("image/png")
      : out.toDataURL("image/jpeg", 0.86);
  }
  function saveImage() {
    if (!hasMoment()) {
      toast("▶ 플레이한 뒤, 학습한 것을 카메라에 보여 주면 저장할 수 있어요");
      return;
    }
    const a = document.createElement("a");
    a.href = snapshot("image/png");
    a.download = "ai_interaction_" + Date.now() + ".png";
    a.click();
    toast("작품 이미지를 저장했어요");
  }

  // 수동 담기 처리 (버튼 클릭 시)
  function meta() {
    const out = [];
    Object.keys(rules || {}).forEach((cls) => {
      (rules[cls] || []).forEach((a) =>
        out.push({
          class: cls,
          action: (ACTIONS[a.type] || {}).label || a.type,
          value: a.value || "",
        }),
      );
    });
    return {
      score: score,
      target: game.target || 0,
      time: game.time || 0,
      rules: out,
    };
  }
  async function keep() {
    if (!window.Locker) {
      VisionDialog.alert({
        title: "여기서는 담을 수 없어요",
        body: "학습 화면에서 열어야 보관함에 담을 수 있어요.",
      });
      return false;
    }
    if (!hasMoment()) {
      toast("▶ 플레이한 뒤, 학습한 것을 카메라에 보여 주면 담을 수 있어요");
      return false;
    }
    const btn = ov.querySelector("#mkKeep"),
      old = btn.textContent;
    btn.disabled = true;
    btn.textContent = "담는 중…";
    try {
      const ok = await Locker.add("maker", {
        title: "작품",
        img: snapshot(),
        meta: meta(),
      });
      if (ok) {
        kept = true;
        btn.textContent = "✓ 담았어요";
        setTimeout(() => {
          btn.textContent = old;
        }, 1600);
      } else btn.textContent = old;
      return ok;
    } catch (e) {
      console.error("[maker keep]", e);
      btn.textContent = old;
      return false;
    } finally {
      btn.disabled = false;
    }
  }
  let kept = false;
  async function closeSelf() {
    play(false);
    // 보관 전 종료 시 확인 알림
    if (canKeep() && hasMoment() && !kept) {
      const go = await VisionDialog.confirm({
        title: "보관함에 담지 않고 나갈까요?",
        body: "담아야 미션으로 낼 수 있어요.",
        ok: "담고 나가기",
        cancel: "그냥 나가기",
      });
      if (go) {
        await keep();
      }
    }
    ov.classList.remove("on");
  }

  ov.querySelector("#mkClose").addEventListener("click", closeSelf);
  ov.querySelector("#mkBack").addEventListener("click", closeSelf);
  ov.querySelector("#mkPlay").addEventListener("click", () => {
    if (!playing) played = true;
    play(!playing);
  });
  // 제출 항목 확인
  const canKeep = () => !!window.Locker;
  ov.querySelector("#mkKeep").addEventListener("click", keep);
  ov.querySelector("#mkSave").addEventListener("click", saveImage);
  ov.addEventListener("click", (e) => {
    if (e.target === ov) closeSelf();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && ov.classList.contains("on")) closeSelf();
  });

  window.Maker = {
    open() {
      ensure();
      renderRules();
      play(false);
      drawStage();
      const kb = ov.querySelector("#mkKeep");
      if (kb) kb.style.display = canKeep() ? "" : "none";
      ov.classList.add("on");
    },
    close() {
      closeSelf();
    },
    snapshot,
  };
})();
