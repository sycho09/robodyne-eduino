/* VISION AI 제출 게시판
   - 오버레이 형식 (페이지 이동 없음)
   - Board.open() 호출 시 현재 화면 위에 표시됨 */
(function () {
  const KEY = "vision_submissions";
  const load = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch (e) {
      return [];
    }
  };
  const saveAll = (l) => localStorage.setItem(KEY, JSON.stringify(l));
  const esc = (s) =>
    (s || "").replace(
      /[<>&"]/g,
      (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c],
    );
  const fmt = (iso) => {
    try {
      const d = new Date(iso);
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    } catch (e) {
      return "";
    }
  };

  const css = `
  .bd-ov{position:fixed;inset:0;z-index:95;display:none;background:rgba(7,8,14,.92);backdrop-filter:blur(8px);
    font-family:'Pretendard',system-ui,sans-serif;color:#f2f4fb;overflow:auto;}
  .bd-ov.on{display:block;}
  .bd-wrap{max-width:1120px;margin:0 auto;padding:20px 22px 40px;}
  .bd-bar{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
    padding:14px 0;margin-bottom:8px;background:linear-gradient(180deg,rgba(7,8,14,.96),rgba(7,8,14,.6));}
  .bd-title{display:flex;align-items:center;gap:12px;}
  .bd-title h2{margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em;}
  .bd-stats{display:flex;gap:8px;}
  .bd-stat{font-family:'JetBrains Mono',monospace;font-size:12px;color:#aeb6cf;background:rgba(255,255,255,.05);
    border:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.06);border-radius:9px;padding:6px 11px;}
  .bd-stat b{color:#6aa6ff;font-size:14px;}
  .bd-tools{display:flex;gap:8px;flex-wrap:wrap;}
  .bd-back{font-size:13px;font-weight:700;color:#aeb6cf;background:rgba(255,255,255,.06);border:0;border-radius:11px;
    padding:9px 14px;cursor:pointer;transition:.15s;box-shadow:inset 0 1px 0 rgba(255,255,255,.06);}
  .bd-back:hover{color:#fff;background:rgba(255,255,255,.1);}
  .bd-b{font-size:12.5px;font-weight:700;color:#aeb6cf;background:rgba(255,255,255,.05);border:0;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.06);border-radius:10px;padding:8px 12px;cursor:pointer;transition:.15s;}
  .bd-b:hover{color:#fff;box-shadow:inset 0 0 0 1px #6aa6ff;}
  .bd-close{font-size:15px;color:#fff;background:rgba(255,255,255,.06);border:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.08);
    width:38px;height:38px;border-radius:11px;cursor:pointer;}
  .bd-banner{background:rgba(255,180,60,.08);border:1px solid rgba(255,180,60,.22);border-radius:11px;padding:10px 14px;
    font-size:12px;color:#ffd36a;margin-bottom:16px;line-height:1.55;}
  .bd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px;}
  .bd-empty{grid-column:1/-1;text-align:center;color:#737c9c;padding:64px 0;font-size:14px;line-height:1.8;}
  .bd-card{background:rgba(255,255,255,.045);border:0;border-radius:16px;overflow:hidden;display:flex;flex-direction:column;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 10px 26px rgba(0,0,0,.32);}
  .bd-card.done{box-shadow:inset 0 0 0 1px rgba(66,226,155,.45),0 10px 26px rgba(0,0,0,.32);}
  .bd-card.mine{box-shadow:inset 0 0 0 1px rgba(106,166,255,.5),0 10px 26px rgba(0,0,0,.32);}
  .bd-img{width:100%;aspect-ratio:4/3;object-fit:cover;background:#05060c;}
  .bd-noimg{width:100%;aspect-ratio:4/3;display:grid;place-items:center;background:#05060c;color:#737c9c;font-size:13px;}
  .bd-bd{padding:14px 15px;display:flex;flex-direction:column;gap:8px;flex:1;}
  .bd-top{display:flex;align-items:center;justify-content:space-between;gap:8px;}
  .bd-name{font-size:15px;font-weight:800;}
  .bd-feat{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:#6aa6ff;background:rgba(59,134,255,.16);
    border:1px solid rgba(59,134,255,.3);border-radius:7px;padding:3px 7px;}
  .bd-meta{font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#737c9c;}
  .bd-chips{display:flex;flex-wrap:wrap;gap:5px;}
  .bd-chips span{font-size:11px;color:#aeb6cf;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:3px 8px;}
  .bd-note{font-size:12.5px;color:#aeb6cf;line-height:1.5;background:rgba(255,255,255,.03);border-radius:9px;padding:8px 10px;}
  .bd-note.em{color:#737c9c;font-style:italic;}
  .bd-eval{border-top:1px solid rgba(255,255,255,.1);padding:12px 15px;display:flex;flex-direction:column;gap:8px;background:rgba(255,255,255,.02);}
  .bd-er{display:flex;gap:7px;}
  .bd-ev{flex:1;font-size:12.5px;font-weight:700;border:1px solid rgba(255,255,255,.16);border-radius:9px;padding:8px;color:#aeb6cf;background:rgba(255,255,255,.04);cursor:pointer;transition:.15s;}
  .bd-ev.pass.on{color:#04140c;background:#42e29b;border-color:#42e29b;}
  .bd-ev.redo.on{color:#1a0a08;background:#ffd36a;border-color:#ffd36a;}
  .bd-fb{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.16);border-radius:9px;color:#f2f4fb;font-size:12.5px;font-family:inherit;padding:8px 10px;}
  .bd-fb:focus{outline:none;border-color:#6aa6ff;}
  .bd-erow2{display:flex;justify-content:space-between;align-items:center;}
  .bd-del{font-size:11px;color:#737c9c;background:none;border:0;text-decoration:underline;cursor:pointer;}
  .bd-save{font-size:12px;font-weight:700;color:#fff;background:linear-gradient(135deg,#6aa6ff,#3b86ff);border:0;border-radius:9px;padding:8px 13px;cursor:pointer;}
  .bd-missions{margin-bottom:18px;}
  .bd-mtitle{font-size:13px;font-weight:800;color:#aeb6cf;margin-bottom:10px;}
  .bd-mcard{background:rgba(59,134,255,.08);border-radius:12px;padding:13px 15px;margin-bottom:9px;}
  .bd-mh{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:14.5px;font-weight:800;color:#f2f4fb;}
  .bd-mcnt{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:#6aa6ff;background:rgba(59,134,255,.15);border-radius:7px;padding:3px 9px;}
  .bd-mcard p{margin:6px 0 0;font-size:12.5px;color:#aeb6cf;line-height:1.5;}
  .bd-mempty{color:#737c9c;font-size:12.5px;padding:6px 2px;}
  /* 학생 읽기 전용 상태 */
  .bd-status{display:flex;flex-direction:column;gap:9px;border-top:1px solid rgba(255,255,255,.08);padding:13px 15px;background:rgba(255,255,255,.02);}
  .bd-srow{display:flex;align-items:center;justify-content:space-between;gap:8px;}
  .bd-slabel{font-size:12px;color:#8b93ad;font-weight:600;}
  .bd-badge{font-size:12.5px;font-weight:800;border-radius:9px;padding:6px 12px;}
  .bd-badge.pass{color:#04140c;background:#42e29b;}
  .bd-badge.redo{color:#1a0a08;background:#ffd36a;}
  .bd-badge.wait{color:#aeb6cf;background:rgba(255,255,255,.08);}
  .bd-fbview{font-size:12.5px;color:#aeb6cf;line-height:1.55;background:rgba(255,255,255,.04);border-radius:9px;padding:9px 11px;}
  .bd-fbview.em{color:#6b7390;font-style:italic;}
  .bd-mine-tag{font-size:10px;font-weight:800;color:#6aa6ff;background:rgba(59,134,255,.16);border-radius:6px;padding:3px 7px;}
  .bd-toast{position:fixed;left:50%;bottom:34px;transform:translateX(-50%) translateY(20px);z-index:120;
    display:flex;align-items:center;gap:9px;font-size:13.5px;font-weight:700;color:#04140c;background:#42e29b;
    border-radius:12px;padding:12px 18px;box-shadow:0 14px 40px rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:.25s;}
  .bd-toast.on{opacity:1;transform:translateX(-50%) translateY(0);}`;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  const ov = document.createElement("div");
  ov.className = "bd-ov";
  ov.innerHTML = `<div class="bd-wrap">
    <div class="bd-bar">
      <div class="bd-title"><button class="bd-back" id="bdBack">← 뒤로</button>
        <h2 id="bdTitle">제출 게시판</h2>
        <div class="bd-stats"><span class="bd-stat">전체 <b id="bdTotal">0</b></span><span class="bd-stat" id="bdWaitWrap">미평가 <b id="bdWait">0</b></span></div>
      </div>
      <div class="bd-tools">
        <button class="bd-b" id="bdEnd" style="display:none">수업 종료 · 종합 PDF</button>
        <button class="bd-b" id="bdRoster" style="display:none">명단 PDF</button>
        <button class="bd-b" id="bdAll" style="display:none">전체 보기</button>
        <button class="bd-b" id="bdImport">가져오기</button>
        <input type="file" id="bdFile" accept="application/json" multiple style="display:none" />
        <button class="bd-b" id="bdExport">결과 내보내기</button>
        <button class="bd-b" id="bdClear">비우기</button>
        <button class="bd-close" id="bdClose">✕</button>
      </div>
    </div>
    <div class="bd-banner" id="bdBanner">ℹ️ 제출물은 이 브라우저에 저장돼요. 다른 기기 제출물은 <b>가져오기</b>로 모아보세요. (실시간 연동은 백엔드 단계)</div>
    <div class="bd-missions" id="bdMissions"></div>
    <div class="bd-grid" id="bdGrid"></div>
  </div>`;

  function ensure() {
    if (!document.body.contains(ov)) document.body.appendChild(ov);
  }
  let toastEl = null,
    toastT = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "bd-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = "✓ " + msg;
    toastEl.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove("on"), 1700);
  }
  function roleNow() {
    return (
      (window.Session && Session.getMode && Session.getMode()) || {
        mode: "free",
      }
    );
  }
  function myName() {
    try {
      return (localStorage.getItem("vision_student_name") || "").trim();
    } catch (e) {
      return "";
    }
  }
  const badge = (s) =>
    s.result === "pass"
      ? '<span class="bd-badge pass">✓ 통과</span>'
      : s.result === "redo"
        ? '<span class="bd-badge redo">↻ 재도전</span>'
        : '<span class="bd-badge wait">평가 대기중</span>';
  let filterCode = null;
  function render() {
    const all = load();
    const role = roleNow();
    const isTeacher = role.mode === "teach";
    // 교사: 평가 가능 / 학생, 일반 사용자: 읽기 전용
    const isStudent = !isTeacher;
    const mine = myName();
    // 학생: 본인 제출물 / 교사: 수업 전체 제출물
    let list = filterCode ? all.filter((s) => s.classCode === filterCode) : all;
    // 수업 참여 학생: 이름으로 필터링 / 일반 사용자: 전체 표시
    if (role.mode === "class")
      list = list.filter((s) => (s.name || "").trim() === mine && mine);
    const cls =
      filterCode && window.Session ? Session.getClass(filterCode) : null;
    ov.querySelector("#bdTitle").innerHTML = isStudent
      ? "내 제출 현황" +
        (cls
          ? " <span style=\"font-family:'JetBrains Mono',monospace;color:#6aa6ff;font-size:14px\">" +
            esc(cls.name) +
            "</span>"
          : "")
      : filterCode
        ? "" +
          esc(cls ? cls.name : "수업") +
          " <span style=\"font-family:'JetBrains Mono',monospace;color:#6aa6ff;font-size:14px\">[" +
          esc(filterCode) +
          "]</span>"
        : "제출 게시판";
    // 교사 전용 도구 (학생/체험 모드 숨김)
    const teacherTools = isTeacher;
    ov.querySelector("#bdRoster").style.display =
      teacherTools && filterCode ? "" : "none";
    ov.querySelector("#bdEnd").style.display =
      teacherTools && filterCode ? "" : "none";
    ov.querySelector("#bdExport").style.display = teacherTools ? "" : "none";
    ov.querySelector("#bdAll").style.display = "none";
    ov.querySelector("#bdImport").style.display = "none";
    ov.querySelector("#bdClear").style.display = "none";
    ov.querySelector("#bdWaitWrap").style.display = isStudent ? "none" : "";
    ov.querySelector("#bdTotal").textContent = list.length;
    ov.querySelector("#bdWait").textContent = list.filter(
      (s) => s.status !== "평가완료",
    ).length;
    // 안내 배너 (역할별)
    const banner = ov.querySelector("#bdBanner");
    if (banner)
      banner.innerHTML = isTeacher
        ? "ℹ️ 선생님 화면이에요. 제출물을 평가(통과·재도전)하고 피드백을 남길 수 있어요. <b>결과 내보내기</b>로 이 수업 결과를 백업할 수 있어요."
        : role.mode === "class"
          ? "ℹ️ 여기에서는 <b>내가 제출한 결과와 평가 점수만</b> 확인할 수 있어요. 평가는 선생님이 진행해요."
          : "ℹ️ 내가 만들어 낸 결과물이에요. 제출물은 <b>이 브라우저에 저장</b>돼요. (실시간 연동은 백엔드 단계)";
    // 미션 섹션 (교사 전용)
    const mEl = ov.querySelector("#bdMissions");
    const missions =
      filterCode && window.Session ? Session.missionsFor(filterCode) || [] : [];
    if (isTeacher && filterCode) {
      mEl.style.display = "";
      mEl.innerHTML =
        '<div class="bd-mtitle">클래스 미션 ' +
        missions.length +
        "개</div>" +
        (missions.length
          ? missions
              .map((mi) => {
                const cnt = all.filter((s) => s.missionId === mi.id).length;
                return `<div class="bd-mcard"><div class="bd-mh"><span>${esc(mi.title)}</span><span class="bd-mcnt">${cnt} 제출</span></div>${mi.content ? `<p>${esc(mi.content)}</p>` : ""}</div>`;
              })
              .join("")
          : '<div class="bd-mempty">아직 만든 미션이 없어요. 스테이지에서 ‘클래스 미션 생성’으로 추가하세요.</div>');
    } else {
      mEl.style.display = "none";
      mEl.innerHTML = "";
    }
    const grid = ov.querySelector("#bdGrid");
    if (!list.length) {
      grid.innerHTML = isStudent
        ? '<div class="bd-empty">아직 제출한 결과가 없어요.<br>스테이지에서 <b>미션 제출</b>을 하면 여기에서 현황과 점수를 볼 수 있어요.<br><span style="font-size:12px">(같은 이름으로 제출해야 내 현황으로 모여요)</span></div>'
        : '<div class="bd-empty">아직 제출물이 없어요.<br>스테이지에서 <b>미션 제출</b>을 하면 여기에 올라와요.</div>';
      return;
    }

    if (isStudent) {
      // 학생: 읽기 전용 현황 및 확인서 저장
      grid.innerHTML = list
        .map(
          (s) => `
        <div class="bd-card mine${s.status === "평가완료" ? " done" : ""}" data-id="${s.id}">
          ${s.img ? `<img class="bd-img" src="${s.img}" alt="제출 스냅샷" />` : '<div class="bd-noimg">스냅샷 없음</div>'}
          <div class="bd-bd">
            <div class="bd-top"><span class="bd-name">${esc(s.missionTitle || s.label) || "제출"}</span><span class="bd-feat">${esc(s.label)}</span></div>
            <div class="bd-meta">${esc(s.name) || "이름없음"} · ${fmt(s.time)}</div>
            <div class="bd-chips">${(s.summary || []).map((c) => `<span>${esc(c)}</span>`).join("")}</div>
          </div>
          <div class="bd-status">
            <div class="bd-srow"><span class="bd-slabel">평가 결과</span>${badge(s)}</div>
            <div class="bd-srow"><span class="bd-slabel">선생님 피드백</span></div>
            <div class="bd-fbview${s.feedback ? "" : " em"}">${s.feedback ? esc(s.feedback) : "아직 피드백이 없어요"}</div>
            <button class="bd-save bd-pdf" style="width:100%">내 확인서 저장 (PDF)</button>
          </div>
        </div>`,
        )
        .join("");
      grid.querySelectorAll(".bd-card").forEach((c) => {
        const id = c.dataset.id;
        const pdf = c.querySelector(".bd-pdf");
        if (pdf)
          pdf.addEventListener("click", () => {
            const r = load().find((x) => x.id === id);
            if (r && window.Cert) Cert.print(r);
          });
      });
      return;
    }

    // 교사: 제출물 평가 가능
    grid.innerHTML = list
      .map(
        (s) => `
      <div class="bd-card${s.status === "평가완료" ? " done" : ""}" data-id="${s.id}">
        ${s.img ? `<img class="bd-img" src="${s.img}" alt="제출 스냅샷" />` : '<div class="bd-noimg">스냅샷 없음</div>'}
        <div class="bd-bd">
          <div class="bd-top"><span class="bd-name">${esc(s.name) || "이름없음"}</span><span class="bd-feat">${esc(s.label)}</span></div>
          <div class="bd-meta">${s.klass ? esc(s.klass) + " · " : ""}${fmt(s.time)} · ${s.status === "평가완료" ? "평가완료" : "미평가"}</div>
          <div class="bd-chips">${(s.summary || []).map((c) => `<span>${esc(c)}</span>`).join("")}</div>
          <div class="bd-note${s.note ? "" : " em"}">${s.note ? esc(s.note) : "소감 없음"}</div>
        </div>
        <div class="bd-eval">
          <div class="bd-er">
            <button class="bd-ev pass${s.result === "pass" ? " on" : ""}" data-r="pass">✓ 통과</button>
            <button class="bd-ev redo${s.result === "redo" ? " on" : ""}" data-r="redo">↻ 재도전</button>
          </div>
          <input class="bd-fb" placeholder="한 줄 피드백…" value="${esc(s.feedback)}" />
          <div class="bd-erow2"><button class="bd-del">삭제</button>
            <div style="display:flex;gap:7px">
              <button class="bd-b bd-pdf" style="padding:8px 11px">PDF</button>
              <button class="bd-save">평가 저장</button>
            </div>
          </div>
        </div>
      </div>`,
      )
      .join("");
    grid.querySelectorAll(".bd-card").forEach((c) => {
      const id = c.dataset.id;
      c.querySelectorAll(".bd-ev").forEach((b) =>
        b.addEventListener("click", () => {
          c.querySelectorAll(".bd-ev").forEach((x) => x.classList.remove("on"));
          b.classList.add("on");
        }),
      );
      c.querySelector(".bd-save").addEventListener("click", () => {
        const l = load(),
          r = l.find((x) => x.id === id);
        if (!r) return;
        const sel = c.querySelector(".bd-ev.on");
        r.result = sel ? sel.dataset.r : r.result || null;
        r.feedback = c.querySelector(".bd-fb").value.trim();
        r.status = r.result ? "평가완료" : "제출됨";
        saveAll(l);
        const who = r.name || "학생";
        const res =
          r.result === "pass"
            ? "통과"
            : r.result === "redo"
              ? "재도전"
              : "저장";
        render();
        toast(`${who} · ${res} 저장됨`);
      });
      c.querySelector(".bd-del").addEventListener("click", () => {
        if (confirm("이 제출물을 삭제할까요?")) {
          saveAll(load().filter((x) => x.id !== id));
          render();
        }
      });
      const pdf = c.querySelector(".bd-pdf");
      if (pdf)
        pdf.addEventListener("click", () => {
          const r = load().find((x) => x.id === id);
          if (r && window.Cert) Cert.print(r);
        });
    });
  }

  ov.querySelector("#bdClose").addEventListener("click", () =>
    ov.classList.remove("on"),
  );
  ov.querySelector("#bdBack").addEventListener("click", () =>
    ov.classList.remove("on"),
  );
  ov.querySelector("#bdImport").addEventListener("click", () =>
    ov.querySelector("#bdFile").click(),
  );
  ov.querySelector("#bdFile").addEventListener("change", async (e) => {
    const files = [...e.target.files];
    const l = load();
    let n = 0;
    for (const f of files) {
      try {
        const o = JSON.parse(await f.text());
        (Array.isArray(o) ? o : [o]).forEach((r) => {
          if (r && r.id && !l.some((x) => x.id === r.id)) {
            l.unshift(r);
            n++;
          }
        });
      } catch (err) {}
    }
    saveAll(l);
    render();
    alert(n + "건 가져왔어요.");
    e.target.value = "";
  });
  ov.querySelector("#bdExport").addEventListener("click", () => {
    const data = filterCode
      ? load().filter((s) => s.classCode === filterCode)
      : load();
    const cls = window.Session && filterCode && Session.getClass(filterCode);
    const fname = cls ? `${cls.name}_결과.json` : "제출물_전체.json";
    const b = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = fname;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  ov.querySelector("#bdClear").addEventListener("click", () => {
    if (confirm("모든 제출물을 비울까요?")) {
      saveAll([]);
      render();
    }
  });
  ov.addEventListener("click", (e) => {
    if (e.target === ov) ov.classList.remove("on");
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && ov.classList.contains("on"))
      ov.classList.remove("on");
  });

  ov.querySelector("#bdRoster").addEventListener("click", () => {
    if (!window.Cert) return;
    const cls = (window.Session && Session.getClass(filterCode)) || {
      name: "수업",
      code: filterCode,
    };
    Cert.roster(
      cls,
      load().filter((s) => s.classCode === filterCode),
    );
  });
  ov.querySelector("#bdAll").addEventListener("click", () => {
    filterCode = null;
    render();
  });
  ov.querySelector("#bdEnd").addEventListener("click", () => {
    if (!window.Cert) return;
    const cls = (window.Session && Session.getClass(filterCode)) || {
      name: "수업",
      code: filterCode,
    };
    const missions = (window.Session && Session.missionsFor(filterCode)) || [];
    if (
      !confirm(
        "수업을 종료하고 종합 결과 PDF를 생성할까요?\n(평가한 미션·제출물이 PDF로 저장됩니다)",
      )
    )
      return;
    Cert.summary(
      cls,
      missions,
      load().filter((s) => s.classCode === filterCode),
    );
  });

  window.Board = {
    open(opts) {
      filterCode =
        (opts && opts.code) ||
        (window.Session && Session.getMode && (Session.getMode() || {}).code) ||
        null;
      ensure();
      render();
      ov.classList.add("on");
    },
    close() {
      ov.classList.remove("on");
    },
  };
  // [data-board] 속성 요소 클릭 시 게시판 호출
  document.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("[data-board]");
    if (t) {
      e.preventDefault();
      Board.open();
    }
  });
})();
