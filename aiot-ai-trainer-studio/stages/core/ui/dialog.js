/* VISION AI 앱 알림창/확인창
   - 네이티브 창 대체 커스텀 모달 (테마 적용) */
(function () {
  /* esc 는 submit.core.js · studio-common.js 에도 같은 구현이 있다.
     세 파일의 로더(index.html · stages/apps/*.html)가 전부 수정 금지라
     공용 스크립트를 끼워 넣을 수 없어 부득이하게 복제한다.
     한 곳을 고치면 나머지 둘도 같이 고칠 것. */
  const esc = (s) =>
    String(s == null ? "" : s).replace(
      /[<>&"]/g,
      (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c],
    );

  const css = `
  /* z-index 설정 (결과물 화면, 제출 모달 위 노출) */
  .vd-ov{position:fixed;inset:0;z-index:130;display:none;align-items:center;justify-content:center;padding:22px;
    background:rgba(5,6,11,.78);backdrop-filter:blur(6px);font-family:var(--sans,'Pretendard',system-ui,sans-serif);}
  .vd-ov.on{display:flex;}
  .vd-card{width:min(420px,100%);max-height:90vh;overflow:auto;color:var(--ink,#f2f4fb);
    background:linear-gradient(180deg,#171119,#100d15);border:1px solid var(--border,rgba(255,255,255,.10));
    border-radius:18px;padding:22px;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 30px 70px rgba(0,0,0,.55);}
  .vd-h{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:800;letter-spacing:-.01em;margin:0 0 8px;}
  .vd-h .ic{width:32px;height:32px;flex:none;display:grid;place-items:center;border-radius:9px;}
  .vd-h .ic svg{width:18px;height:18px;}
  .vd-card.ask .vd-h .ic{background:var(--accent-soft,rgba(255,87,71,.16));color:var(--accent-ink,#ff8472);}
  .vd-card.danger .vd-h .ic{background:rgba(255,211,106,.14);color:var(--amber,#ffd36a);}
  .vd-card.info .vd-h .ic{background:rgba(90,169,255,.14);color:var(--blue,#5aa9ff);}
  .vd-body{font-size:13px;color:var(--ink-2,#cdb6bd);line-height:1.65;margin:0 0 14px;white-space:pre-line;}
  .vd-list{list-style:none;margin:0 0 14px;padding:11px 13px;border-radius:10px;
    background:rgba(255,255,255,.04);border:1px solid var(--border,rgba(255,255,255,.10));}
  .vd-list li{font-size:13px;font-weight:700;color:var(--ink,#f2f4fb);padding:3px 0;display:flex;gap:8px;}
  .vd-list li::before{content:'·';color:var(--accent-ink,#ff8472);font-weight:800;}
  .vd-note{font-size:11.5px;line-height:1.55;border-left:3px solid var(--amber,#ffd36a);border-radius:8px;
    padding:9px 11px;margin:0 0 15px;color:var(--amber,#ffd36a);background:rgba(255,211,106,.09);}
  .vd-row{display:flex;gap:9px;}
  .vd-b{flex:1;font-size:13.5px;font-weight:800;font-family:inherit;border:0;border-radius:12px;padding:12px;
    cursor:pointer;transition:.15s;}
  .vd-b.ghost{color:var(--ink-2,#cdb6bd);background:rgba(255,255,255,.06);}
  .vd-b.ghost:hover{color:#fff;background:rgba(255,255,255,.12);}
  .vd-b.go{color:#fff;background:linear-gradient(135deg,var(--accent-ink,#ff8472),var(--accent,#ff5747));
    box-shadow:0 8px 22px rgba(255,87,71,.28);}
  .vd-b.go:hover{filter:brightness(1.07);}
  .vd-b:focus-visible{outline:2px solid var(--accent-ink,#ff8472);outline-offset:2px;}`;
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  const IC = {
    ask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.2 2.7c-.5.2-.8.7-.8 1.2v.5M12 16.6h.01"/></svg>',
    danger:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10.3 4.3 2.6 18a1.8 1.8 0 0 0 1.6 2.7h15.6A1.8 1.8 0 0 0 21.4 18L13.7 4.3a1.9 1.9 0 0 0-3.4 0Z"/><path d="M12 9.5v4.2M12 17.2h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11.2v5M12 7.9h.01"/></svg>',
  };

  const backdrop = document.createElement("div");
  backdrop.className = "vd-ov";
  backdrop.innerHTML = '<div class="vd-card" id="vdCard"></div>';
  let resolveModal = null; /* 활성 상태 응답 함수 */
  function settle(isOk) {
    const resolve = resolveModal;
    resolveModal = null;
    backdrop.classList.remove("on");
    if (resolve) resolve(isOk);
  }

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) settle(false);
  }); /* 배경 클릭 시 취소 */
  document.addEventListener("keydown", (e) => {
    if (!resolveModal) return;
    if (e.key === "Escape") {
      e.preventDefault();
      settle(false);
    } else if (
      e.key === "Enter" &&
      e.target &&
      e.target.classList &&
      !e.target.classList.contains("vd-b")
    ) {
      e.preventDefault();
      settle(true);
    }
  });

  /* 모달 콘텐츠 렌더링 */
  function show(options, twoButtons) {
    return new Promise((resolve) => {
      if (resolveModal) settle(false); /* 중복 호출 시 이전 창 취소 처리 */
      if (!document.body.contains(backdrop))
        document.body.appendChild(backdrop);
      const danger = !!options.danger;
      /* 종류를 한 번만 정해 className·아이콘이 갈라지지 않게 한다 */
      const kind = danger ? "danger" : twoButtons ? "ask" : "info";
      const card = backdrop.querySelector("#vdCard");
      card.className = "vd-card " + kind;
      card.innerHTML = `
        <h2 class="vd-h"><span class="ic">${IC[kind]}</span>${esc(options.title || (twoButtons ? "확인" : "알려드려요"))}</h2>
        ${options.body ? `<p class="vd-body">${esc(options.body)}</p>` : ""}
        ${Array.isArray(options.list) && options.list.length ? `<ul class="vd-list">${options.list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${options.note ? `<p class="vd-note">${esc(options.note)}</p>` : ""}
        <div class="vd-row">
          ${twoButtons ? `<button class="vd-b ghost" data-v="0">${esc(options.cancel || "취소")}</button>` : ""}
          <button class="vd-b go" data-v="1">${esc(options.ok || "확인")}</button>
        </div>`;
      card
        .querySelectorAll("[data-v]")
        .forEach((b) => (b.onclick = () => settle(b.dataset.v === "1")));
      resolveModal = resolve;
      backdrop.classList.add("on");
      /* danger 모드일 경우 엔터 키 오동작 방지 위해 취소 버튼에 포커스 */
      const first = card.querySelector(
        twoButtons && danger ? '[data-v="0"]' : '[data-v="1"]',
      );
      setTimeout(() => {
        try {
          first.focus();
        } catch (e) {}
      }, 30);
    });
  }

  window.VisionDialog = {
    confirm: (options) => show(options || {}, true),
    alert: (options) =>
      show(
        typeof options === "string" ? { body: options } : options || {},
        false,
      ),
  };
})();
