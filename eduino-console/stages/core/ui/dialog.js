/* VISION AI 앱 알림창/확인창
   - 네이티브 창 대체 커스텀 모달 (테마 적용) */
(function () {
  /* esc 는 submit.core.js · studio-common.js 에도 같은 구현이 있다.
     세 파일의 로더(index.html · stages/apps/*.html)가 전부 수정 금지라
     공용 스크립트를 끼워 넣을 수 없어 부득이하게 복제.
     한 곳을 고치면 나머지 둘도 같이 고칠 것. */
  const esc = (s) =>
    String(s == null ? "" : s).replace(
      /[<>&"]/g,
      (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c],
    );

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
      /* 종류를 한 번만 정해 className·아이콘이 갈라짐 방지 */
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
