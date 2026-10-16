$("name").addEventListener("input", () => {
  syncName();
  saveDraft();
});
$("classes").addEventListener("input", () => {
  syncClassesStat();
  syncNamePh();
  saveDraft();
});
$("photos").addEventListener("input", () => {
  syncPhotos();
  saveDraft();
});
$("maker").addEventListener("input", () => {
  syncMade();
  saveDraft();
});

/* 카드 영역 비율 유지 (10:7) */
const sizeFrames = SC.autoFit("#card .imgbox", 0.7);

/* 캐릭터 이미지 파일 업로드 처리 */
let imgData = null;
function showImg() {
  $("cImgPh").style.display = "none";
  $("btnImg").textContent = "이미지 다시 불러오기";
}
$("btnImg").addEventListener("click", () =>
  SC.pickImage((img) => {
    SC.coverDraw($("cImg"), img);
    imgData = $("cImg").toDataURL("image/jpeg", 0.8);
    showImg();
    saveDraft();
  }),
);

/* 첫 화면 초기화 렌더링 */
restoreDraft();
syncName();
syncClassesStat();
syncNamePh();
syncPhotos();
syncMade();
if (!blocks.length) blocks.push({ id: ++uid, t: 0, v: {}, free: "" }); /* 기본 틀 활성화 */
build();
ready = true;

/* 카드 이미지 캡처 (html2canvas) */
const renderCard = () =>
  SC.capture($("card"), {
    fonts: [
      '13px "Pretendard"',
      '11px "JetBrains Mono"',
      '11px "Pretendard"',
    ],
    beforeCapture: sizeFrames, /* 박스 높이 확정 (내보낸 PNG 배치 어긋남 방지) */
    onclone: (doc) => {
      doc
        .querySelectorAll("#card .tline .tx")
        .forEach((tx) => SC.prewrap(tx)); /* 명시적 줄바꿈 처리 */
    },
  });

/* 카드 이미지 파일 다운로드 */
$("btnSave").addEventListener("click", () =>
  SC.savePng(
    $("btnSave"),
    renderCard,
    () =>
      `AI캐릭터카드_${$("name").value.trim() || MISSION}_${Date.now()}.png`,
  ),
);

/* 미션함에 저장 (담기·종료 확인 흐름은 studio-common 이 맡는다) */
keeper = SC.keeper({
  kind: "character",
  title: "캐릭터 카드",
  render: renderCard,
  /* 담으려면 이름 + 특성 한 줄이나 이미지 중 하나 필수 */
  complete: () =>
    !!$("name").value.trim() &&
    ($("cTraits").querySelectorAll(".tline:not(.empty)").length > 0 ||
      !!imgData),
  hints: [
    "캐릭터 이름 적기",
    "특성 한 줄 또는 캐릭터 이미지 중 하나 채우기",
  ],
  meta: () => {
    syncBlocks();
    const traits = [];
    blocks.forEach((bk) => {
      const blk = $("tEditor").querySelector(`.blk[data-id="${bk.id}"]`);
      if (!blk) return;
      const line = sentence(blk, bk);
      if (!line) return;
      traits.push({
        type: T[bk.t].name,
        text: line.replace(/<[^>]+>/g, ""),
        values: bk.v || {},
        free: bk.free || "",
      });
    });
    return {
      name: $("name").value.trim(),
      classes: $("classes").value.trim(),
      photos: $("photos").value.trim(),
      maker: $("maker").value.trim(),
      traits: traits,
      track: TR.name,
      mission: MISSION,
    };
  },
  isReady: () => ready,
  beforeLeave: () => writeDraft.flush(), /* 밀린 임시저장 마무리 */
});

window.addEventListener("pagehide", () => writeDraft.flush());
