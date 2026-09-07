/* 아이디어 이미지 업로드 및 파일 읽기 */
function syncIdea() {
  const t = $("idea").value.trim();
  if (genImgData && t) {
    $("bIdeaTxt").textContent = t;
    $("bIdea").style.display = "block";
  } else $("bIdea").style.display = "none";
}
$("btnGen").addEventListener("click", () =>
  SC.pickImage((img) => {
    SC.coverDraw($("bGen"), img);
    /* syncIdea 가 genImgData 를 보므로 UI 갱신 전에 먼저 채우기 */
    genImgData = $("bGen").toDataURL("image/jpeg", 0.8);
    applyGenUI();
    saveDraft();
  }),
);
$("idea").addEventListener("input", () => {
  syncIdea();
  saveDraft();
});
function syncPrompt() {
  const t = $("prompt").value.trim();
  if (t) {
    $("bPrompt").textContent = t;
    $("bPromptWrap").style.display = "block";
  } else $("bPromptWrap").style.display = "none";
}
$("prompt").addEventListener("input", () => {
  syncPrompt();
  saveDraft();
});
