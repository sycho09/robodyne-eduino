let blocks = [],
  uid = 0,
  stash = {};

$("tpls").innerHTML = T.map(
  (t, i) =>
    `<button class="tpl" data-t="${i}"><span class="n">✓</span><b>${ic(t.ic, 14)}${t.name}</b>${t.sub}</button>`,
).join("");
$("tpls")
  .querySelectorAll(".tpl")
  .forEach((btn) =>
    btn.addEventListener("click", () => {
      const ti = +btn.dataset.t;
      syncBlocks();
      const cur = blocks.find((x) => x.t === ti);
      if (cur) {
        stash[ti] = cur;
        blocks = blocks.filter((x) => x.t !== ti);
      } else
        blocks.push(stash[ti] || { id: ++uid, t: ti, v: {}, free: "" });
      blocks.sort((a, b) => a.t - b.t);
      build();
    }),
  );

function syncBlocks() {
  /* 편집기 상태 동기화 */
  document.querySelectorAll("#tEditor .blk").forEach((blk) => {
    const bk = blocks.find((x) => x.id == blk.dataset.id);
    if (!bk) return;
    if (T[bk.t].free) bk.free = blk.querySelector(".free").value;
    else {
      bk.v = {};
      blk
        .querySelectorAll(".bl")
        .forEach((b) => (bk.v[b.dataset.k] = b.textContent.trim()));
    }
  });
}

function cap(b) {
  /* contenteditable 길이 제한 */
  const t = b.textContent;
  if (t.length <= CAP) return;
  b.textContent = t.slice(0, CAP);
  const r = document.createRange(),
    s = getSelection();
  r.selectNodeContents(b);
  r.collapse(false);
  s.removeAllRanges();
  s.addRange(r);
}

function build() {
  const box = $("tEditor");
  if (!blocks.length) {
    box.innerHTML =
      '<div class="blk-empty">위에서 쓰고 싶은 틀을 눌러 켜세요</div>';
    paintTraits();
    return;
  }
  box.innerHTML = blocks
    .map((bk) => {
      const t = T[bk.t],
        v = bk.v || {};
      const inner = t.free
        ? `<textarea class="free" maxlength="120" placeholder="${esc(egFree())}">${esc(bk.free || "")}</textarea>`
        : '<div class="fill">' +
          t.parts
            .map((p) =>
              typeof p === "string"
                ? p
                : p.jo
                  ? `<span data-jo="${p.jo}">를</span>`
                  : `<span class="bl" contenteditable="true" data-k="${p.k}" data-ph="${esc(p.ph)}">${esc(v[p.k] || "")}</span>`,
            )
            .join("") +
          "</div>";
      return `<div class="blk" data-id="${bk.id}">
  <div class="blk-h">${ic(t.ic, 13)}<span>${t.name}</span><button class="del" data-id="${bk.id}" title="이 틀 끄기" aria-label="이 틀 끄기">${ic("close", 13)}</button></div>
  ${inner}<div class="sug"></div>
</div>`;
    })
    .join("");
  box.querySelectorAll(".del").forEach((b) =>
    b.addEventListener("click", () => {
      syncBlocks();
      blocks = blocks.filter((x) => x.id != b.dataset.id);
      build();
    }),
  );
  box
    .querySelectorAll(".free")
    .forEach((f) => f.addEventListener("input", paintTraits));
  box.querySelectorAll(".bl").forEach((b) => {
    b.addEventListener("input", () => {
      if (!b.textContent && b.innerHTML) b.innerHTML = ""; /* 내부 br 태그 정리 */
      cap(b);
      paintTraits();
    });
    b.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        b.blur();
      }
    });
    b.addEventListener("paste", (ev) => {
      ev.preventDefault();
      const t = (
        (ev.clipboardData || window.clipboardData).getData("text") || ""
      ).replace(/\s+/g, " ");
      document.execCommand("insertText", false, t);
    });
    b.addEventListener("focus", () => showSug(b));
    b.addEventListener("blur", () =>
      setTimeout(() => {
        const blk = b.closest(".blk");
        if (blk && !blk.querySelector(".bl:focus"))
          blk.querySelector(".sug").classList.remove("on");
      }, 150),
    );
  });
  paintTraits();
}

function showSug(b) {
  const blk = b.closest(".blk"),
    bk = blocks.find((x) => x.id == blk.dataset.id),
    s = blk.querySelector(".sug");
  const list = bk ? sugFor(bk.t, b.dataset.k) : [];
  s.innerHTML =
    `<div class="sh">「${esc(b.dataset.ph)}」 예시 — 눌러서 넣기</div>` +
    list.map((x) => `<button class="sgc">${esc(x)}</button>`).join("");
  s.classList.toggle("on", list.length > 0);
  s.querySelectorAll(".sgc").forEach((c) =>
    c.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      b.textContent = c.textContent;
      cap(b);
      paintTraits();
    }),
  );
}

function sentence(blk, bk) {
  const t = T[bk.t];
  if (t.free) {
    const v = (blk.querySelector(".free")?.value || "")
      .trim()
      .replace(/\s+/g, " ");
    return v ? esc(v) : null;
  }
  const bl = [...blk.querySelectorAll(".bl")];
  const val = (k) =>
    (bl.find((x) => x.dataset.k === k)?.textContent || "").trim();
  blk.querySelectorAll("[data-jo]").forEach((j) => {
    j.textContent = eul(val(j.dataset.jo));
  }); /* 조사 처리 */
  if (!bl.some((x) => x.textContent.trim())) return null; /* 내용이 없을 경우 제외 */
  return t.parts
    .map((p) =>
      typeof p === "string"
        ? p
        : p.jo
          ? eul(val(p.jo))
          : esc(val(p.k)) || "___",
    )
    .join("") /* 카드는 강조 없이 본문 톤 (강조는 왼쪽 빈칸에서만) */
    .replace(/([.!?])\s*\./g, "$1"); /* 중복 마침표 제거 */
}
