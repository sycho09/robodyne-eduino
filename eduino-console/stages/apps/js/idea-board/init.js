/* html2canvas 캡처 렌더링 */
const renderBoard = () =>
  SC.capture($("board"), {
    fonts: [
      '24px "Pretendard"',
      '13.5px "Pretendard"',
      '13.5px "JetBrains Mono"',
      '11px "JetBrains Mono"',
    ],
    beforeCapture: sizeFrames, /* 박스 높이 확정 (내보낸 PNG 배치 어긋남 방지) */
    onclone: (doc) => {
      const st = doc.createElement("style");
      st.textContent =
        "#board .lbl,#board .fl{letter-spacing:normal !important}#board .fl{display:block !important}#board .pline{color:var(--bd-ink2) !important}";
      doc.head.appendChild(st);
      SC.prewrap(doc.getElementById("bPromptWrap")); /* 줄바꿈 보정 */
    },
  });

/* 캡처 이미지 로컬 다운로드 */
$("btnSave").addEventListener("click", () =>
  SC.savePng(
    $("btnSave"),
    renderBoard,
    () =>
      `상상보드_${$("title").value.trim() || MISSION}_${Date.now()}.png`,
  ),
);

/* 결과물 미션함 보관 처리 (담기·종료 확인 흐름은 studio-common 이 맡는다) */
keeper = SC.keeper({
  kind: "idea",
  title: "상상보드",
  render: renderBoard,
  /* 담으려면 인식 결과 캡처 + 아이디어·설명·이미지 중 하나 필수 */
  complete: () =>
    !!capImgData &&
    !!($("idea").value.trim() || $("prompt").value.trim() || genImgData),
  hints: [
    "AI 인식 결과를 캡처하기",
    "아이디어 · 설명 · AI 이미지 중 하나 채우기",
  ],
  meta: () => ({
    title: $("title").value.trim(),
    name: $("name").value.trim(),
    klass: $("klass").value.trim(),
    idea: $("idea").value.trim(),
    prompt: $("prompt").value.trim(),
    className: (capData && capData.name) || "",
    acc: (capData && capData.acc) || 0,
    track: TR.name,
    mission: MISSION,
  }),
  isReady: () => ready,
  beforeLeave: () => {
    S.loopOn = false; /* 프레임 루프 정지 */
    writeDraft.flush(); /* 밀린 임시저장 마무리 */
  },
  canClose: () => $("camOv").style.display !== "flex", /* 캡처 모달이 먼저다 */
});

/* ══ 첫 화면 구성 ══ (보관해 둔 내용을 먼저 되살린 뒤 그린다 · ready 전에는 담지 않는다) */
restoreDraft();
syncBoard();
syncIdea();
syncPrompt();
ready = true;

window.addEventListener("pagehide", () => {
  S.loopOn = false;
  writeDraft.flush(); /* 창이 닫혀도 마지막 입력은 남긴다 */
});
