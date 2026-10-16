/* 카드 텍스트 렌더링 갱신 */
function syncName() {
  $("cName").textContent =
    $("name").value.trim() || "이름을 입력하세요";
}
function paintTraits() {
  const out = [];
  blocks.forEach((bk) => {
    const blk = $("tEditor").querySelector(`.blk[data-id="${bk.id}"]`);
    if (!blk) return;
    const s = sentence(blk, bk);
    if (s) out.push({ ic: T[bk.t].ic, s: s });
  });
  $("cTraits").innerHTML = out.length
    ? out
        .map(
          (o) =>
            `<div class="tline"><span class="ic">${ic(o.ic, 14)}</span><span class="tx">${o.s}</span></div>`,
        )
        .join("")
    : `<div class="tline empty"><span class="ic">${ic("blank", 14)}</span><span class="tx">내 AI의 특성이 여기에 들어가요</span></div>`;
  $("tpls")
    .querySelectorAll(".tpl")
    .forEach((b, i) =>
      b.classList.toggle(
        "on",
        blocks.some((x) => x.t === i),
      ),
    );
  $("tCnt").textContent = out.length + "개";
  saveDraft(); /* 내용 변경 시 자동 저장 */
}
function syncClassesStat() {
  const raw = $("classes")
    .value.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  $("cClasses").textContent = raw.length ? raw.join(" · ") : "—";
  /* 클래스 색상 오버레이 렌더링 */
  $("cChips").innerHTML = raw
    .map(
      (n, i) =>
        `<span class="chip"><i style="background:${CHIP_COLORS[i % CHIP_COLORS.length]}"></i>${n}</span>`,
    )
    .join("");
}
function syncPhotos() {
  const n = parseInt($("photos").value, 10);
  $("cPhotos").textContent =
    (isFinite(n) && n >= 0 ? n : "—") + " " + TR.sample.unit;
}
function syncMade() {
  const nm = $("maker").value.trim();
  $("cMade").innerHTML =
    (nm ? "<b>" + esc(nm) + "</b> · " : "") + SC.todayKo();
}
