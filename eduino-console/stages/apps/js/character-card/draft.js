/* 작성 내용 로컬 스토리지 임시 저장 */
const DKEY = "vision_draft_card:" + M.key;
let ready = false;
let keeper; /* 보관·종료 흐름 (아래에서 SC.keeper 로 만든다) */
/* 실제 쓰기 · 특성 빈칸을 채울 때마다 돌면 밀리므로 묶어서 실행
   이미지는 아직 보관소에서 오는 중일 수 있으니 다 온 뒤에만 건드림 */
let imgsRestored = false;
const writeDraft = SC.debounce(() => {
  syncBlocks(); /* 입력 내용 갱신 */
  SC.draftKeep(
    DKEY,
    {
      name: $("name").value,
      classes: $("classes").value,
      photos: $("photos").value,
      maker: $("maker").value,
      blocks: blocks,
      stash: stash,
    },
    imgsRestored ? { img: imgData } : null,
  );
}, 400);
function saveDraft() {
  if (!ready) return;
  keeper.markDirty(); /* 닫기 확인에 쓰이므로 즉시 표시 */
  writeDraft();
}
function restoreDraft() {
  const d = SC.draftLoad(DKEY);
  if (d) {
    $("name").value = d.name || "";
    /* 입력되지 않은 기본 정보는 부모 데이터 유지 */
    if (d.classes) $("classes").value = d.classes;
    if (d.photos) $("photos").value = d.photos;
    $("maker").value = d.maker || "";
    if (Array.isArray(d.blocks) && d.blocks.length) {
      blocks = d.blocks;
      stash = d.stash || {};
      uid = Math.max(
        0,
        ...blocks.map((b) => +b.id || 0),
        ...Object.keys(stash).map((k) => +(stash[k] || {}).id || 0),
      );
    }
  }
  /* 이미지는 보관소(IndexedDB)에서 따로·늦게 온다
     다 그려질 때까지 기다려야 imgsRestored 가 참이 된다 */
  return SC.draftImage(DKEY, "img")
    .then(
      (src) =>
        new Promise((done) => {
          if (!src) return done();
          const im = new Image();
          im.onload = () => {
            imgData = src;
            SC.coverDraw($("cImg"), im);
            showImg();
            done();
          };
          im.onerror = () => done();
          im.src = src;
        }),
    )
    .then(() => {
      imgsRestored = true;
    });
}
