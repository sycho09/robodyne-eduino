/* 이미지 박스 1:1 비율 유지 */
const sizeFrames = SC.autoFit("#board .imgbox", 1);

/* 데이터 인식 캡처 모달 동작 (부모 화면 상태 복사) */
const pEl = (id) => (SC.parentDoc() || document).getElementById(id);
function pCam() {
  if (!TR.cam) return null;
  const v = pEl(TR.cam);
  return v && v.videoWidth ? v : null;
}
function pWave() {
  if (!TR.wave) return null; /* 영상 트랙 판단 */
  const c = pEl(TR.wave);
  if (!c || !c.width) return null;
  const ov = pEl(TR.standby); /* 대기 상태 확인 */
  return ov && (ov.style.display || "") !== "none" ? null : c;
}
/* 지금 보고 있는 입력원 (카메라 우선 · 없으면 파형)
   프레임마다 부모 문서를 두 번 뒤지지 않도록 한 번 찾아 돌려 쓴다 */
function pLive() {
  const cam = pCam();
  if (cam) return { el: cam, isCam: true };
  const wv = pWave();
  return wv ? { el: wv, isCam: false } : null;
}
const pPred = () => SC.parentPred(TR);
const pConf = () => SC.parentConf(TR);

/* 부모 비디오/캔버스 화면 복제 그리기 (거울반전/비율 적용)
   src 를 넘기면 그것을 쓰고, 없으면 그때 찾는다 */
function drawSource(cv, src) {
  if (src === undefined) src = pLive();
  const g = cv.getContext("2d"),
    W = cv.width,
    H = cv.height;
  g.clearRect(0, 0, W, H);
  if (!src) return false;
  if (src.isCam) {
    const cam = src.el;
    const s = Math.min(cam.videoWidth, cam.videoHeight);
    const sx = (cam.videoWidth - s) / 2,
      sy = (cam.videoHeight - s) / 2;
    g.save();
    g.translate(W, 0);
    g.scale(-1, 1);
    try {
      g.drawImage(cam, sx, sy, s, s, 0, 0, W, H);
      const ov = TR.overlay ? pEl(TR.overlay) : null; /* 오버레이 복사 */
      if (ov && ov.width) g.drawImage(ov, sx, sy, s, s, 0, 0, W, H);
    } catch (e) {}
    g.restore();
    return true;
  }
  const wv = src.el;
  g.fillStyle = "#0a0e1a";
  g.fillRect(0, 0, W, H);
  const r = Math.min(W / wv.width, H / wv.height),
    dw = wv.width * r,
    dh = wv.height * r;
  try {
    g.drawImage(wv, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } catch (e) {}
  return true;
}

/* 캡처 모달에서 초당 60회 갱신되는 자리 (프레임마다 다시 찾지 않는다) */
const mEl = {
  hint: $("mHint"),
  view: $("mView"),
  pred: $("mPredName"),
  pct: $("mPredPct"),
  model: $("mModel"),
  capture: $("mCapture"),
};
/* 값이 그대로면 DOM 을 건드리지 않는다 */
const setText = (el, v) => {
  if (el.textContent !== v) el.textContent = v;
};

function mLoop() {
  if (!S.loopOn) return;
  const live = pLive(),
    name = pPred(),
    pct = pConf();
  const hint = live ? "none" : "grid";
  if (mEl.hint.style.display !== hint) mEl.hint.style.display = hint;
  drawSource(mEl.view, live);
  setText(mEl.pred, name || "—");
  setText(mEl.pct, (name ? pct : 0) + "%");
  setText(
    mEl.model,
    live ? (name ? "인식 중" : "인식 대기") : TR.offMsg,
  );
  mEl.capture.disabled = !(live && name);
  S.lastName = name;
  S.lastPct = pct;
  requestAnimationFrame(mLoop);
}
function mCapture() {
  const name = S.lastName || pPred(),
    acc = S.lastPct || pConf();
  if (!pLive() || !name) {
    SC.say({
      title: "아직 캡처할 수 없어요",
      body:
        "학습 화면에서 " +
        TR.turnOn +
        "을 누르고, AI가 클래스를 알아본 상태에서 캡처해 주세요.",
    });
    return;
  }
  /* 캡처 화면 렌더링 */
  [$("dataPhoto"), $("bPhoto")].forEach((cv) => {
    if (drawSource(cv)) cv.style.display = "block";
  });
  applyCapUI(name, acc);
  closeCam();
  capData = { name: name, acc: acc };
  /* 캡처 이미지 데이터 생성 */
  capImgData = $("bPhoto").toDataURL("image/jpeg", 0.8);
  saveDraft();
}
function openCam() {
  $("camOv").style.display = "flex";
  S.loopOn = true;
  mLoop();
}
function closeCam() {
  S.loopOn = false;
  $("camOv").style.display = "none";
}
$("btnData").addEventListener("click", openCam);
$("mClose").addEventListener("click", closeCam);
$("mCapture").addEventListener("click", mCapture);
$("camOv").addEventListener("click", (e) => {
  if (e.target === $("camOv")) closeCam();
});
