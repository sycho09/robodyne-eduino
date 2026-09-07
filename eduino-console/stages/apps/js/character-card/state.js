const SC = window.StudioCommon; /* 미션·이미지·줄바꿈 등 공통 유틸 (idea-board 와 공유) */
const $ = SC.$;
const esc = (s) => SC.esc(s);

/* 현재 트랙 정보 조회 */
const TRACK = SC.track(),
  TR = SC.TRACKS[TRACK];
/* 미션 및 트랙 표시명 조회 */
const M = SC.scope("custom"),
  MISSION = M.name;
const CHIP_COLORS = [
  "#6aa6ff",
  "#42e29b",
  "#ffd36a",
  "#42d6e0",
  "#ff7a90",
  "#c08cff",
];

/* 트랙별 힌트 텍스트 기본값 세팅 */
const EG = {
  image: {
    name: "예: 눈썰미 좋은 판별기",
    free: "예: 우리 AI는 밝은 곳에서는 잘 맞추는데, 어두우면 자꾸 틀려요.",
  },
  audio: {
    name: "예: 귀 밝은 소리 판별기",
    free: "예: 우리 AI는 또박또박 말하면 잘 알아듣는데, 빨리 말하면 자꾸 틀려요.",
  },
  pose: {
    name: "예: 동작 척척 판별기",
    free: "예: 우리 AI는 몸이 다 보이면 잘 맞추는데, 몸이 잘리면 자꾸 틀려요.",
  },
}[TRACK];

$("missionTag").textContent = MISSION;
$("cTrk").textContent = TR.name + " 트랙";

/* 단위 문구 적용 */
$("sampleLabel").textContent =
  TR.sample.label + " (" + TR.sample.unit + ")";
$("sampleQ").textContent = TR.sample.label + " 개수";
$("cSampleK").textContent = TR.sample.label;
$("photos").placeholder = TR.sample.ph;

/* 학습 데이터 정보 (부모 화면 참조) */
const pCls = SC.parentClasses(TR);
if (pCls.length) $("classes").value = pCls.join(", ");
const pCnt = SC.parentCount(TR);
if (pCnt) $("photos").value = pCnt;
