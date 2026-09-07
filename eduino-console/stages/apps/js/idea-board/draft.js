/* 입력 상태 로컬스토리지 보관 (임시 저장) */
const DKEY = "vision_draft_idea:" + M.key;
let ready = false;
let keeper; /* 보관·종료 흐름 (아래에서 SC.keeper 로 만든다) */
let capImgData = null; /* 웹캠 캡처 이미지 데이터 */
let capData = null; /* 캡처 시점의 메타데이터 (이름, 정확도) */
let genImgData = null; /* 첨부한 생성 AI 이미지 데이터 */

function applyCapUI(name, acc) {
  $("dataPh").style.display = "none";
  $("dataClsName").textContent = name;
  $("dataCls").style.display = "block";
  $("accVal").textContent = acc + "%";
  $("accBadge").style.display = "inline-block";
  $("bPhotoPh").style.display = "none";
  $("bClsName").textContent = name;
  $("bCls").style.display = "block";
  $("bAcc").textContent = acc + "%";
  $("bAcc").style.display = "block";
}

function applyGenUI() {
  $("bGenPh").style.display = "none";
  syncIdea();
  $("btnGen").textContent = "이미지 다시 선택";
}

/* 실제 쓰기 · 타자마다 돌면 밀리므로 묶어서 실행
   이미지는 아직 보관소에서 오는 중일 수 있으니 다 온 뒤에만 건드림 */
let imgsRestored = false;
const writeDraft = SC.debounce(
  () =>
    SC.draftKeep(
      DKEY,
      {
        title: $("title").value,
        name: $("name").value,
        klass: $("klass").value,
        idea: $("idea").value,
        prompt: $("prompt").value,
        capData: capData,
      },
      imgsRestored
        ? { capImg: capImgData, genImg: genImgData }
        : null,
    ),
  400,
);
function saveDraft() {
  if (!ready) return;
  keeper.markDirty(); /* 닫기 확인에 쓰이므로 즉시 표시 */
  writeDraft();
}
function restoreDraft() {
  const d = SC.draftLoad(DKEY);
  if (d) {
    if (d.title) $("title").value = d.title;
    if (d.name) $("name").value = d.name;
    if (d.klass) $("klass").value = d.klass;
    if (d.idea) $("idea").value = d.idea;
    if (d.prompt) $("prompt").value = d.prompt;
    if (d.capData) capData = d.capData;
  }

  /* 이미지는 보관소(IndexedDB)에서 따로·늦게 온다
     다 그려질 때까지 기다려야 imgsRestored 가 참이 된다 */
  const draw = (field, onReady) =>
    SC.draftImage(DKEY, field).then(
      (src) =>
        new Promise((done) => {
          if (!src) return done();
          const im = new Image();
          im.onload = () => {
            onReady(im, src);
            done();
          };
          im.onerror = () => done();
          im.src = src;
        }),
    );

  return Promise.all([
    draw("capImg", (im, src) => {
      if (!capData) return; /* 캡처 메타가 없으면 되살릴 게 없다 */
      capImgData = src;
      [$("dataPhoto"), $("bPhoto")].forEach((cv) =>
        SC.coverDraw(cv, im),
      );
      applyCapUI(capData.name, capData.acc);
    }),
    draw("genImg", (im, src) => {
      genImgData = src; /* syncIdea 가 보므로 UI 갱신 전에 채우기 */
      SC.coverDraw($("bGen"), im);
      applyGenUI();
    }),
  ]).then(() => {
    imgsRestored = true;
  });
}
