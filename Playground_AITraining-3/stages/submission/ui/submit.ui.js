/* VISION AI 결과물 Presentation Layer */
(function() {
  const { load, saveAll, Locker, genId, studentName, setStudentName } = window.SubmitStore;
  const { esc, modeNow, trackKey, tr, useBag, isTeach, currentUser, originKey, phase, toPNG } = window.SubmitCore;
  /* 트랙별 결과물 설정 */
  const IC = {
    maker:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="2.5" y="7.5" width="19" height="10.5" rx="4"/><path d="M7 11v3M5.5 12.5h3M15.4 12.2h.01M17.8 14.2h.01"/></svg>',
    idea: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M9.2 17.5h5.6M10 20.5h4"/><path d="M12 3.5a6 6 0 0 1 3.6 10.8v1.2H8.4v-1.2A6 6 0 0 1 12 3.5Z"/></svg>',
    character:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="3" y="4.5" width="18" height="15" rx="2.4"/><circle cx="9.4" cy="10.4" r="2.1"/><path d="M5.8 16.4c.6-1.9 1.9-2.9 3.6-2.9s3 1 3.6 2.9M15.5 9.6h3M15.5 13h3"/></svg>',
    capture:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m4 17 5-4.5 4 3.2L17 11l3 3"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 4v10.5M8 11l4 4 4-4"/><path d="M5 17.5v1A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-1"/></svg>',
    submit:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M13.8 3.6V8h4.5M9 13h6M9 16.5h4"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M3 7.5h18v11.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19V7.5Z"/><path d="M2 4.2h20v3.3H2zM9.6 12h4.8"/></svg>',
  };
  /* 결과물 표시 라벨 및 동작 함수 매핑 */
  const KINDS = [
    {
      k: "maker",
      title: "작품",
      btn: "작품 만들기",
      sub: "AI 인터랙션",
      tracks: ["image"],
      go: () => {
        if (window.Maker) Maker.open();
      },
    },
    {
      k: "idea",
      title: "상상보드",
      btn: "AI 상상보드 만들기",
      tracks: ["image", "audio", "pose"],
      go: () => {
        if (window.Studio) Studio.open("idea");
      },
    },
    {
      k: "character",
      title: "캐릭터 카드",
      btn: "내 AI 캐릭터 카드 만들기",
      tracks: ["image", "audio", "pose"],
      go: () => {
        if (window.Studio) Studio.open("character");
      },
    },
    {
      k: "capture",
      title: "화면 캡처",
      btn: "이미지 저장하기",
      tracks: ["image", "audio", "pose"],
      /* 산출물을 0으로 만들면 성취감이 사라져 전환 동인이 약해진다 — 추론 결과 화면
         원본 캡처만 무료로 연다 (기준서 2-1 정책 근거). */
      free: true,
      grab: true,
    },
  ];
  const kindsFor = (t) => KINDS.filter((x) => x.tracks.indexOf(t) >= 0);

  /* 시점 상대시간 표기 변환 */
  function ago(iso) {
    try {
      const d = new Date(iso),
        now = new Date();
      const s = Math.floor((now - d) / 1000);
      const midnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      ).getTime();
      const hhmm =
        String(d.getHours()).padStart(2, "0") +
        ":" +
        String(d.getMinutes()).padStart(2, "0");
      if (d.getTime() >= midnight) {
        /* 오늘 */
        if (s < 60) return "방금";
        if (s < 3600) return Math.floor(s / 60) + "분 전";
        return Math.floor(s / 3600) + "시간 전";
      }
      if (d.getTime() >= midnight - 86400000) return "어제 " + hhmm;
      return d.getMonth() + 1 + "월 " + d.getDate() + "일";
    } catch (e) {
      return "";
    }
  }

  /* 스타일 설정 */
  const css = `
  .sub-ov{position:fixed;inset:0;z-index:120;display:none;align-items:center;justify-content:center;padding:22px;background:rgba(5,6,11,.78);backdrop-filter:blur(6px);font-family:var(--sans,'Pretendard',system-ui,sans-serif);}
  .sub-ov.on{display:flex;}
  .sub-card{position:relative;width:min(460px,100%);max-height:90vh;overflow:auto;
    background:linear-gradient(180deg,#171119,#100d15);border:1px solid var(--border);
    border-radius:18px;padding:24px;color:var(--ink);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 30px 70px rgba(0,0,0,.55);}
  .sub-h{font-size:19px;font-weight:800;margin:0 0 4px;letter-spacing:-.01em;}
  .sub-sub{font-size:12.5px;color:var(--ink-3);margin:0 0 16px;line-height:1.5;}
  .sub-sub b{color:var(--accent-ink);}
  .sub-prev{width:100%;border-radius:var(--radius);display:block;margin-bottom:13px;background:#05060b;}
  .sub-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;}
  .sub-chips span{font-size:12px;font-weight:600;color:var(--accent-ink);background:var(--accent-soft);border-radius:999px;padding:4px 10px;}
  .sub-l{display:block;font-size:12.5px;color:var(--ink-3);margin:0 0 6px;font-weight:700;}
  .sub-in,.sub-ta{width:100%;background:rgba(255,255,255,.05);border:1px solid var(--border);
    border-radius:var(--radius);color:var(--ink);font-size:14px;font-family:inherit;padding:11px 12px;margin-bottom:13px;transition:.15s;}
  .sub-ta{resize:vertical;min-height:62px;}
  .sub-in:focus,.sub-ta:focus{outline:none;border-color:var(--accent-ink);background:rgba(255,255,255,.07);}
  .sub-in::placeholder,.sub-ta::placeholder{color:var(--ink-4);}
  .sub-row{display:flex;gap:9px;margin-top:4px;}
  .sub-btn{flex:1;font-size:14px;font-weight:800;border:0;border-radius:var(--radius);padding:13px;cursor:pointer;transition:.15s;}
  .sub-go{color:#fff;background:linear-gradient(135deg,var(--accent-ink),var(--accent));box-shadow:0 8px 22px rgba(255,87,71,.28);}
  .sub-go:hover{filter:brightness(1.07);}
  .sub-ghost{color:var(--ink-2);background:rgba(255,255,255,.06);}
  .sub-ghost:hover{color:#fff;background:rgba(255,255,255,.1);}
  .sub-x{position:absolute;top:14px;right:14px;width:32px;height:32px;border-radius:9px;background:rgba(255,255,255,.06);
    border:0;color:var(--ink-2);font-size:14px;cursor:pointer;transition:.15s;}
  .sub-x:hover{color:#fff;background:rgba(255,255,255,.1);}
  .sub-done{text-align:center;padding:8px 0;}
  .sub-done .ic{font-size:46px;}
  .sub-done h3{margin:8px 0 4px;font-size:18px;font-weight:800;}
  .sub-done p{margin:0 0 16px;font-size:13px;color:var(--ink-2);line-height:1.6;}
  .sub-badge{font-size:11px;font-weight:700;border-radius:6px;padding:3px 8px;margin-left:4px;vertical-align:middle;}
  .sub-up{border:1.5px dashed rgba(255,87,71,.42);border-radius:var(--radius);background:var(--accent-soft);cursor:pointer;margin-bottom:13px;overflow:hidden;transition:.15s;}
  .sub-up:hover{background:rgba(255,87,71,.24);}
  .sub-up-in{padding:26px 14px;text-align:center;font-size:14px;font-weight:700;color:var(--ink-2);display:flex;flex-direction:column;gap:6px;}
  .sub-up-in small{font-size:11.5px;color:var(--ink-4);font-weight:500;}

  /* 사이드바: 결과물 생성 및 제출 버튼 */
  .act-area.sb-1{flex-direction:column;gap:0;}
  .sb-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;margin-bottom:9px;}
  .sb-b{display:flex;align-items:center;gap:8px;text-align:left;font-size:12.5px;font-weight:700;line-height:1.3;
    color:var(--ink-2);background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);
    padding:11px 12px;cursor:pointer;transition:.15s;position:relative;word-break:keep-all;}
  .sb-b:hover{color:var(--ink);border-color:var(--accent);background:var(--accent-soft);}
  .sb-b .i{flex:none;display:grid;place-items:center;color:var(--accent-ink);}
  .sb-b .i svg{width:18px;height:18px;}
  .sb-b .t{flex:1;min-width:0;}
  .sb-b .t small{display:block;font-size:10.5px;font-weight:500;color:var(--ink-4);margin-top:1px;}
  /* 임시 보관된 결과물 테두리 표시 (활성 시 코랄, 비활성 시 초록 방지) */
  .sb-b.off{opacity:.5;}
  .sb-b.off:hover{border-color:var(--border);background:var(--panel);color:var(--ink-2);}
  .sb-b:disabled{cursor:wait;}

  .sb-open{width:100%;display:flex;align-items:center;gap:9px;text-align:left;font-size:13.5px;font-weight:800;
    color:#fff;background:linear-gradient(135deg,#ff6a52,var(--accent));border:1px solid transparent;
    border-radius:var(--radius);padding:12px 13px;cursor:pointer;transition:.15s;box-shadow:0 6px 18px rgba(255,87,71,.26);}
  .sb-open:hover{filter:brightness(1.07);}
  /* 제출 항목 없음 시 라벨 유지 및 비활성화 처리 */
  .sb-open.off{background:var(--panel);color:var(--ink-4);border-color:var(--border);
    box-shadow:none;cursor:not-allowed;}
  .sb-open.off:hover{filter:none;}
  /* 교사 모드 수업 개설 추가 버튼 */
  .sb-alt{width:100%;margin-top:8px;font-size:13px;font-weight:800;font-family:inherit;
    color:var(--ink-2);background:rgba(255,255,255,.06);border:1px solid var(--border);
    border-radius:var(--radius);padding:11px;cursor:pointer;transition:.15s;}
  .sb-alt:hover{color:#fff;background:rgba(255,255,255,.12);border-color:var(--ink-4);}
  .sb-open .i{flex:none;display:grid;place-items:center;}
  .sb-open .i svg{width:19px;height:19px;}
  .sb-open .t{flex:1;min-width:0;line-height:1.3;font-size:14.5px;}
  .sb-open .n{flex:none;font-family:var(--mono);font-size:12.5px;font-weight:700;
    background:rgba(0,0,0,.24);border-radius:7px;padding:3px 8px;}
  .sb-open-note{font-size:11px;color:var(--ink-4);text-align:center;line-height:1.55;margin-top:7px;}
  .sb-open-note b.w{color:var(--amber);}
  .sb-open-note b.i{color:var(--blue);}
  .sb-open-note b.g{color:var(--green);}
  .sb-open-note.shake{animation:sbShake .42s;}
  @keyframes sbShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}

  /* 모달 체크리스트 (구역 제목) */
  .sb-cap{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.02em;
    color:var(--ink-3);margin:2px 0 7px;}
  .sb-cap::after{content:'';flex:1;height:1px;background:var(--border);}
  .sb-cap.bag{margin-top:14px;color:var(--ink-2);}
  .sb-cap .n{flex:none;order:2;font-family:var(--mono);font-size:10.5px;font-weight:700;
    color:#04140c;background:var(--green);border-radius:6px;padding:2px 7px;}

  /* 내 미션함 (목록 뷰 고정) */
  .sb-bag{border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;
    background:rgba(255,255,255,.03);margin-bottom:10px;}
  .sb-i{display:flex;align-items:center;gap:9px;padding:9px 10px;border-top:1px solid var(--border);}
  .sb-i:first-child{border-top:0;}
  .sb-i .i{width:26px;height:26px;flex:none;display:grid;place-items:center;border-radius:var(--radius-sm);
    background:rgba(66,226,155,.14);color:var(--green);}
  .sb-i .i svg{width:15px;height:15px;}
  .sb-i .t{flex:1;min-width:0;font-size:12.5px;font-weight:700;color:var(--ink);line-height:1.3;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  /* 결과물 생성 출처 표기 (종류 중복 구별용) */
  /* 구분자는 CSS 로 넣는다 — <small> 의 글자는 출처 이름 그 자체여야 한다.
     구분자를 마크업에 넣으면 출처를 읽어 가는 쪽(테스트·스크린리더)이 " · 가위바위보" 를 이름으로 본다. */
  .sb-i .t small::before{content:" · ";}
  .sb-i .t small{font-size:10.5px;font-weight:600;color:var(--ink-4);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .sb-i .at{flex:none;font-size:10.5px;font-weight:600;color:var(--ink-4);}
  .sb-i .op{width:24px;height:24px;flex:none;display:grid;place-items:center;border:0;border-radius:7px;
    color:var(--ink-3);background:rgba(255,255,255,.06);cursor:pointer;transition:.15s;}
  .sb-i .op svg{width:13px;height:13px;}
  .sb-i .op:hover{color:#fff;background:var(--accent);}
  .sb-i .op:disabled{opacity:.5;cursor:wait;}
  .sb-empty{padding:16px 12px;text-align:center;font-size:11.5px;color:var(--ink-4);line-height:1.6;}`;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  const ov = document.createElement("div");
  ov.className = "sub-ov";
  ov.innerHTML = `<div class="sub-card" id="subCard"></div>`;
  document.addEventListener("DOMContentLoaded", () =>
    document.body.appendChild(ov),
  );
  const card = () => ov.querySelector("#subCard");
  const open = () => {
    if (!document.body.contains(ov)) document.body.appendChild(ov);
    ov.classList.add("on");
  };
  function close() {
    ov.classList.remove("on");
  }
  /* 모달 닫기 배선 (✕ + 취소 버튼) */
  function wireClose(cancelSel) {
    const c = card();
    c.querySelector("#subX").onclick = close;
    const cancel = cancelSel && c.querySelector(cancelSel);
    if (cancel) cancel.onclick = close;
  }

  /* 안내창 — 사전학습 체험 스테이지(stages/apps/*.html)는 dialog.js 를 싣지 않아
     VisionDialog 가 없다. 그쪽에서는 네이티브 alert 로 물러난다. */
  function notify(title, body) {
    if (window.VisionDialog) VisionDialog.alert({ title, body });
    else alert(body ? title + "\n" + body : title);
  }

  let cfg = null;
  const cap = () => {
    try {
      return cfg && cfg.capture ? cfg.capture() : null;
    } catch (e) {
      return null;
    }
  };

  /* 이미지 다운로드 처리 (체험 모드 및 백업용) */
  function download(dataURL, fname) {
    const a = document.createElement("a");
    a.href = dataURL;
    a.download = fname;
    a.click();
  }
  /* 사전학습 체험 스테이지 (학습 과정 없음)
     화면 캡처 파일 저장 및 수동 첨부 방식 사용 */
  function saveShot() {
    const c = cap();
    if (!c) {
      notify("먼저 카메라를 켜고 결과를 만들어 주세요.");
      return;
    }
    download(c, `vision_${(cfg && cfg.feature) || "result"}_${Date.now()}.jpg`);
  }
  function openAttachSubmit() {
    const m = modeNow();
    const missions = (window.Session && Session.missionsFor(m.code)) || [];
    let imgData = null;
    card().innerHTML = `
      <button class="sub-x" id="subX">✕</button>
      <h2 class="sub-h">미션 제출</h2>
      <p class="sub-sub"><b>${esc(m.name || "수업")}</b> 수업에 제출해요. <b>저장해 둔 이미지</b>를 첨부하세요.</p>
      <div class="sub-up" id="sUp">
        <div class="sub-up-in" id="sUpIn">＋ 저장한 이미지 선택<small>클릭해서 파일 추가 (png · jpg)</small></div>
        <input type="file" id="sFileInput" accept="image/*" style="display:none" />
      </div>
      <label class="sub-l">미션 선택</label>
      ${
        missions.length
          ? `<select class="sub-in" id="sMission">${missions.map((mi) => `<option value="${mi.id}">${esc(mi.title)}</option>`).join("")}</select>`
          : '<div class="sub-sub" style="color:var(--amber)">아직 선생님이 만든 미션이 없어요. 선생님이 ‘클래스 미션 생성’을 하면 선택할 수 있어요.</div>'
      }
      <label class="sub-l">이름 / 번호</label>
      <input class="sub-in" id="sName" value="${esc(m.student || "")}" placeholder="예: 김에듀" />
      <div class="sub-row"><button class="sub-btn sub-ghost" id="sCancel">취소</button><button class="sub-btn sub-go" id="sGo">제출하기</button></div>`;
    open();
    const fileInput = card().querySelector("#sFileInput"),
      up = card().querySelector("#sUp");
    up.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const f = fileInput.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        imgData = r.result;
        card().querySelector("#sUpIn").outerHTML =
          `<img class="sub-prev" id="sUpIn" src="${imgData}" alt="첨부 이미지" style="margin:0" />`;
      };
      r.readAsDataURL(f);
    };
    wireClose("#sCancel");
    card().querySelector("#sGo").onclick = () => {
      const name = (card().querySelector("#sName").value || "").trim();
      if (!imgData) {
        notify(
          "제출할 이미지를 먼저 첨부하세요.",
          "이미지 저장 → 그 파일을 선택하세요.",
        );
        return;
      }
      if (!name) {
        card().querySelector("#sName").focus();
        card().querySelector("#sName").style.borderColor = "var(--accent)";
        return;
      }
      const sel = card().querySelector("#sMission");
      const missionId = sel ? sel.value : "";
      const mission = missions.find((x) => x.id === missionId);
      setStudentName(name);
      const rec = {
        id: genId(),
        feature: (cfg && cfg.feature) || "",
        label: (cfg && cfg.label) || "",
        name,
        klass: m.name || "",
        classCode: m.code || "",
        className: m.name || "",
        missionId: missionId || "",
        missionTitle: mission ? mission.title : "",
        note: "",
        summary: [],
        img: imgData,
        time: new Date().toISOString(),
        status: "제출됨",
        score: null,
        feedback: "",
      };
      const list = load();
      list.unshift(rec);
      saveAll(list);
      const cnt = list.filter((s) => s.classCode === m.code).length;
      card().innerHTML = `<div class="sub-done"><div class="ic">✅</div><h3>제출 완료!</h3>
        <p>${mission ? "“" + esc(mission.title) + "” 미션에 " : ""}제출했어요. 이 수업 게시판에 ${cnt}건.</p>
        <div class="sub-row"><button class="sub-btn sub-go" id="sClose">확인</button></div></div>`;
      card().querySelector("#sClose").onclick = close;
    };
  }

  /* 교사 모드: 클래스 미션 생성 */
  function openMissionCreate() {
    const m = modeNow();
    card().innerHTML = `
      <button class="sub-x" id="subX">✕</button>
      <h2 class="sub-h">클래스 미션 생성 <span class="sub-badge" style="color:#ff8472;background:rgba(240,71,58,.16)">교사용</span></h2>
      <p class="sub-sub">수업 <b>${esc(m.name || "")}</b> <span style="font-family:var(--mono);color:var(--blue)">[${esc(m.code || "")}]</span> 에 미션을 추가해요</p>
      <label class="sub-l">미션 제목</label>
      <input class="sub-in" id="mTitle" placeholder="예: 우리 교실 사물 5가지 찾기" />
      <label class="sub-l">미션 내용 (간단히)</label>
      <textarea class="sub-ta" id="mContent" placeholder="학생들이 무엇을 하면 되는지 한두 줄로 적어주세요"></textarea>
      <div class="sub-row"><button class="sub-btn sub-ghost" id="mCancel">취소</button><button class="sub-btn sub-go" id="mGo">미션 생성</button></div>`;
    open();
    setTimeout(() => card().querySelector("#mTitle").focus(), 50);
    wireClose("#mCancel");
    card().querySelector("#mGo").onclick = () => {
      const title = (card().querySelector("#mTitle").value || "").trim();
      const content = (card().querySelector("#mContent").value || "").trim();
      if (!title) {
        card().querySelector("#mTitle").focus();
        card().querySelector("#mTitle").style.borderColor = "#ff6a52";
        return;
      }
      Session.createMission({
        classCode: m.code,
        className: m.name,
        title,
        content,
      });
      const n = (Session.missionsFor(m.code) || []).length;
      card().innerHTML = `<div class="sub-done"><div class="ic">✅</div><h3>미션이 생성됐어요</h3>
        <p>“${esc(title)}” · 현재 이 수업 미션 ${n}개. 학생들은 ‘결과물 만들기’에서 만든 결과물을 이 미션으로 제출해요.</p>
        <div class="sub-row"><button class="sub-btn sub-ghost" id="mMore">미션 더 만들기</button><button class="sub-btn sub-go" id="mClose">확인</button></div></div>`;
      card().querySelector("#mClose").onclick = close;
      card().querySelector("#mMore").onclick = openMissionCreate;
    };
  }

  /* 화면 캡처 및 이미지 다운로드 처리 */
  async function grabHere(btn) {
    const c = cap();
    if (!c) {
      notify(
        "아직 저장할 화면이 없어요",
        "카메라를 켜고 추론을 시작한 뒤에 저장할 수 있어요.",
      );
      return;
    }
    const lbl = btn.querySelector(".t"),
      old = lbl ? lbl.innerHTML : "";
    btn.disabled = true;
    if (lbl) lbl.innerHTML = "저장하는 중…";
    const ok = await Locker.add("capture", { title: "화면 캡처", img: c });
    download(await toPNG(c), `vision_${trackKey()}_${Date.now()}.png`);
    btn.disabled = false;
    if (lbl && !ok) lbl.innerHTML = old;
    syncAll();
  }

  /* 미션함 개별 항목 이미지 다운로드 */
  async function downloadItem(key, btn) {
    const it = Locker.get(key);
    if (!it) return;
    if (btn) btn.disabled = true;
    const img = await Locker.image(key);
    if (img)
      download(
        await toPNG(img),
        `${it.title}_${it.from || ""}_${Date.now()}.png`.replace(/__+/g, "_"),
      );
    if (btn) btn.disabled = false;
  }

  /* 비활성 버튼 클릭 시 제자리 안내 애니메이션 표시 */
  function nudge(note, phaseState) {
    if (!note) return;
    note.innerHTML =
      phaseState === "trained"
        ? '<b class="i">추론 시작</b>을 먼저 눌러 주세요.'
        : '<b class="w">먼저 AI를 학습시켜 주세요.</b>';
    note.classList.remove("shake");
    void note.offsetWidth;
    note.classList.add("shake");
  }

  const areaTrack = (el) => {
    if (el.closest && el.closest("#sub-pose")) return "pose";
    if (el.closest && el.closest("#sub-audio")) return "audio";
    return "image";
  };

  function submitNow(btn) {
    const t = btn && btn.closest ? areaTrack(btn) : undefined;
    if (!Locker.count(t)) return;
    openSubmitSheet(t);
  }

  /* 제출 처리 -> vision_submissions
     - 모든 모드 공통 뷰
     - 결과물을 하나의 제출 레코드로 묶어 등록 (게시판 노출용 정보 추가) */
  function openSubmitSheet(track) {
    const m = modeNow(),
      missions = (window.Session && Session.missionsFor(m.code)) || [];
    const items = Locker.list(track);
    const saved = studentName();
    card().innerHTML = `
      <button class="sub-x" id="subX">✕</button>
      <h2 class="sub-h">미션 제출</h2>
      <p class="sub-sub">${m.name ? `<b>${esc(m.name)}</b> 수업에 ` : ""}아래 <b>${items.length}개</b>를 한 번에 내요.</p>
      <div class="sub-chips">${items.map((i) => `<span>${esc(i.title)}${i.from ? " · " + esc(i.from) : ""}</span>`).join("")}</div>
      ${
        missions.length
          ? `<label class="sub-l">미션 선택</label>
        <select class="sub-in" id="sMission">${missions.map((mi) => `<option value="${esc(mi.id)}">${esc(mi.title)}</option>`).join("")}</select>`
          : ""
      }
      <label class="sub-l">이름 / 번호</label>
      <input class="sub-in" id="sName" value="${esc(m.student || saved)}" placeholder="예: 김에듀" />
      <div class="sub-row"><button class="sub-btn sub-ghost" id="sCancel">취소</button><button class="sub-btn sub-go" id="sGo">제출하기</button></div>`;
    open();
    wireClose("#sCancel");
    card().querySelector("#sGo").onclick = async (e) => {
      const nameEl = card().querySelector("#sName"),
        name = (nameEl.value || "").trim();
      if (!name) {
        nameEl.focus();
        nameEl.style.borderColor = "var(--accent)";
        return;
      }
      const go = e.currentTarget;
      go.disabled = true;
      go.textContent = "제출하는 중…";
      const sel = card().querySelector("#sMission"),
        missionId = sel ? sel.value : "";
      const mission = missions.find((x) => x.id === missionId);
      setStudentName(name);
      try {
        /* 대표 이미지 추출 (용량 한도 방지 위해 1장 제한) */
        const img = await Locker.image(items[0].key);
        const rec = {
          id: genId(),
          user: currentUser(), /* 로그인이 붙으면 자동으로 채워진다 */
          feature: (cfg && cfg.feature) || trackKey(),
          label: (cfg && cfg.label) || tr().name,
          name,
          klass: m.name || "",
          classCode: m.code || "",
          className: m.name || "",
          missionId: missionId || "",
          missionTitle: mission ? mission.title : "",
          note: "",
          summary: items.map((i) => i.title + (i.from ? " · " + i.from : "")),
          img: img || null,
          /* imgId 는 게시판(board.js)이 읽지 않지만 submit-locker.test.mjs 가
             "그림 참조가 함께 남는다"로 못 박아 둔 계약이라 그대로 둔다.
             ※ ImageStore 키가 bag/{kind}@{originKey} 로 결정적이라, 같은 결과물을
                다시 만들면 과거 제출 기록의 imgId 가 새 그림을 가리키게 된다.
                지금은 아무도 안 읽어 드러나지 않을 뿐이니, 읽기 시작할 때
                제출 시점에 별도 키로 복사하는 처리가 먼저 필요하다. */
          items: items.map((i) => ({
            kind: i.kind,
            title: i.title,
            from: i.from || "",
            imgId: i.imgId || null,
            meta: i.meta || null,
          })),
          time: new Date().toISOString(),
          status: "제출됨",
          score: null,
          feedback: "",
        };
        const list = load();
        list.unshift(rec);
        saveAll(list);
        /* 제출 후 동일 트랙의 내 미션함 비우기 */
        Locker.clear(track);
        syncAll();
        const cnt = list.filter((s) => (s.name || "").trim() === name).length;
        card().innerHTML = `<div class="sub-done"><div class="ic">✅</div><h3>제출 완료!</h3>
          <p>${mission ? "“" + esc(mission.title) + "” 미션에 " : ""}결과물 <b>${items.length}개</b>를 냈어요.<br>
<span style="color:var(--ink-4)">상단 <b>내 현황</b>에서 볼 수 있어요 · 지금까지 ${cnt}건</span></p>
          <div class="sub-row"><button class="sub-btn sub-ghost" id="sClose">확인</button><button class="sub-btn sub-go" id="sBoard">내 현황 보기</button></div></div>`;
        card().querySelector("#sClose").onclick = close;
        card().querySelector("#sBoard").onclick = () => {
          close();
          if (window.Board) Board.open();
        };
      } catch (err) {
        go.disabled = false;
        go.textContent = "제출하기";
        VisionDialog.alert({
          danger: true,
          title: "제출을 저장하지 못했어요",
          body:
            "저장 공간이 부족할 수 있어요.\n(" +
            ((err && err.message) || err) +
            ")",
        });
      }
    };
  }

  /* 사전학습 체험 스테이지 사이드바 (모드별 버튼 · 동작) */
  const BASIC_HTML = {
    teach:
      '<button class="act act-primary" data-a="create">＋ 클래스 미션 생성</button>',
    class:
      '<button class="act act-ghost" data-a="save">🖼 이미지 저장</button><button class="act act-primary" data-a="attach">📤 미션 제출</button>',
  };
  const BASIC_HTML_DEFAULT =
    '<button class="act act-primary" data-a="save">🖼 이미지 저장하기</button>';
  const BASIC_ACT = {
    create: () => openMissionCreate(),
    attach: () => openAttachSubmit(),
    save: () => saveShot(),
  };

  /* 결과물 만들기 안내 문구 (추론 상태별) */
  const PHASE_NOTE = {
    live: '만든 결과물은 아래 <b class="g">내 미션함</b>에 담겨요.',
    trained: '<b class="i">추론 시작</b>을 누르면 결과물을 만들 수 있어요.',
    untrained: '<b class="w">AI를 학습시킨 뒤에</b> 결과물을 만들 수 있어요.',
  };

  /* 미션 제출 트리거 (사이드바 버튼) */
  function renderActions() {
    const bb = document.getElementById("boardBtn");
    const m = modeNow();
    const bagUI = useBag();
    /* '내 현황' 및 '게시판' 분기 처리 */
    if (bb) {
      bb.style.display =
        m.mode === "teach" || m.mode === "class" || bagUI ? "" : "none";
      const teach = m.mode === "teach";
      bb.title = teach ? "제출 게시판 (평가)" : "내 제출 현황";
      /* 내 현황 대시보드는 관리 기능이라 잠근다 (기준서 2-1). */
      if (window.Access) window.Access.setLocked(bb, "mission", !window.Access.isPaid());
      if (bb.lastChild && bb.lastChild.nodeType === 3)
        bb.lastChild.textContent = teach ? " 게시판" : " 내 현황";
    }
    const areas = [...document.querySelectorAll("#actionArea, [data-actions]")];
    if (!areas.length) return;

    /* 사전학습 체험 스테이지 처리 (수동 저장 및 첨부) */
    if (!bagUI) {
      const html = BASIC_HTML[m.mode] || BASIC_HTML_DEFAULT;
      areas.forEach((area) => {
        area.classList.remove("sb-1");
        area.innerHTML = html;
        area.querySelectorAll("[data-a]").forEach((btn) => {
          btn.onclick = BASIC_ACT[btn.dataset.a] || BASIC_ACT.save;
        });
      });
      return;
    }

    /* 직접 제작 트랙 결과물 UI 구성 */
    const currentPhase = phase();
    /* 미션함 목록 렌더링 (현재 트랙 항목만 표시되도록 수정) */
    const teach = isTeach();
    areas.forEach((area) => {
      const t = areaTrack(area),
        ks = kindsFor(t);
      const items = Locker.list(t),
        itemCount = items.length;
      area.classList.add("sb-1");
      area.innerHTML = `
        <div class="sb-cap">결과물 만들기</div>
        <div class="sb-grid">${ks
          .map(
            (itemDef) =>
              `<button class="sb-b${currentPhase === "live" ? "" : " off"}" data-a="mk" data-k="${itemDef.k}">
             <span class="i">${IC[itemDef.k]}</span><span class="t">${esc(itemDef.btn || itemDef.title)}${itemDef.sub ? `<small>${esc(itemDef.sub)}</small>` : ""}</span>
           </button>`,
          )
          .join("")}</div>
        <div class="sb-open-note">${PHASE_NOTE[currentPhase] || PHASE_NOTE.untrained}</div>

        <div class="sb-cap bag">내 미션함${itemCount ? `<span class="n">${itemCount}개</span>` : ""}</div>
        <div class="sb-bag">${
          itemCount
            ? /* 결과물 식별용 출처 표기 추가 */
              items
                .map(
                  (
                    it,
                  ) => `<div class="sb-i" data-key="${esc(it.key)}" data-k="${esc(it.kind)}">
              <span class="i">${IC[it.kind] || IC.box}</span>
              <span class="t">${esc(it.title)}${it.from ? `<small>${esc(it.from)}</small>` : ""}</span>
              <span class="at">${ago(it.at)}</span>
              <button class="op" data-a="dl" data-key="${esc(it.key)}" title="이미지로 저장">${IC.down}</button>
              <button class="op" data-a="rm" data-key="${esc(it.key)}" title="미션함에서 삭제">${IC.x}</button>
            </div>`,
                )
                .join("")
            : '<div class="sb-empty">만든 결과물을 여기에 담아요</div>'
        }
        </div>

        <button class="sb-open${itemCount ? "" : " off"}" data-a="send"${itemCount ? "" : " disabled"}>
          <span class="i">${IC.submit}</span>
          <span class="t">미션 제출하기</span>
          ${itemCount ? `<span class="n">${itemCount}</span>` : ""}
        </button>
        ${
          teach
            ? /* 교사 모드 전용 버튼 노출 */
              '<button class="sb-alt teach" data-a="create">＋ 클래스 미션 생성</button>'
            : ""
        }`;
      /* 결과물 · 평가 · 관리 기능 잠금 (기준서 2-1).
         3개 버튼 순서는 그대로 두고 이미지 저장하기만 활성으로 남긴다 (기준서 2-5). */
      if (window.Access) {
        const locked = !window.Access.isPaid();
        area.querySelectorAll('[data-a="mk"]').forEach((b) => {
          const def = KINDS.find((x) => x.k === b.dataset.k);
          window.Access.setLocked(b, "output", locked && !(def && def.free));
        });
        window.Access.setLocked(area.querySelector(".sb-cap.bag"), "mission", locked);
        window.Access.setLocked(area.querySelector('.sb-open[data-a="send"]'), "mission", locked);
      }

      const note = area.querySelector(".sb-open-note");
      /* data-a 별 동작 (기본값 mk: 결과물 만들기) */
      const OPS = {
        send: (btn) => submitNow(btn),
        create: () => openMissionCreate(),
        dl: (btn) => downloadItem(btn.dataset.key, btn),
        rm: (btn) => removeItem(btn.dataset.key),
        mk: (btn) => {
          if (currentPhase !== "live") {
            nudge(note, currentPhase); /* 비활성 사유 안내 애니메이션 표시 */
            return;
          }
          const itemDef = KINDS.find((x) => x.k === btn.dataset.k);
          if (!itemDef) return;
          if (itemDef.grab) return grabHere(btn); /* 캡처 후 자동 다운로드 */
          if (itemDef.go) itemDef.go();
        },
      };
      area.querySelectorAll("[data-a]").forEach((btn) => {
        const op = OPS[btn.dataset.a] || OPS.mk;
        btn.onclick = () => op(btn);
      });
    });
  }

  /* 삭제 재확인 후 제거 */
  async function removeItem(key) {
    const it = Locker.get(key);
    if (!it) return;
    const ok = await VisionDialog.confirm({
      danger: true,
      title: "미션함에서 삭제할까요?",
      body:
        '"' +
        it.title +
        (it.from ? " · " + it.from : "") +
        '" 을(를) 지워요. 다시 만들어야 해요.',
      ok: "삭제",
      cancel: "그대로 두기",
    });
    if (ok) Locker.remove(key);
  }

  /* 추론 상태(DOM 변화) 감지 기반 조건부 렌더링 */
  let lastState = "";
  const stateNow = () => originKey() + "|" + phase() + "|" + modeNow().mode;
  /* 사이드바 UI 동기화 갱신 */
  function syncAll() {
    renderActions();
    lastState = stateNow();
  }
  const tick = () => {
    if (cfg && stateNow() !== lastState) syncAll();
  };
  setInterval(tick, 400);
  /* 상태 토글 시 즉각적 DOM 감지 루프 실행 */
  document.addEventListener("click", (e) => {
    const t =
      e.target.closest &&
      e.target.closest("#infer-toggle,#p-infer-toggle,#a-infer-toggle");
    if (!t) return;
    let n = 0;
    const id = setInterval(() => {
      tick();
      if (++n > 12) clearInterval(id);
    }, 250);
  });

  ov.addEventListener("click", (e) => {
    if (e.target === ov) close();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && ov.classList.contains("on")) close();
  });
  /* 탭(트랙) 전환 이벤트 수신에 따른 화면 갱신 */
  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest(".nav-item"))
      setTimeout(syncAll, 60);
  });

  window.Submit = {
    init(c) {
      cfg = c;
      if (document.readyState !== "loading") syncAll();
      else document.addEventListener("DOMContentLoaded", syncAll);
    },
    refresh: syncAll,
  };
})();
