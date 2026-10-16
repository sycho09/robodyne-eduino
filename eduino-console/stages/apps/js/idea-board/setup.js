const SC = window.StudioCommon; /* 미션·이미지·줄바꿈 등 공통 유틸 (character-card 와 공유) */
const $ = SC.$;

/* 현재 트랙 정보 확인 */
const TR = SC.TRACKS[SC.track()];

/* 미션별 예시 문구 정의 */
const COPY = {
  rps: {
    idea: "가위바위보를 해서 이기면 간식을 주는 자판기",
    prompt:
      "미래형 간식 자판기 앞에서 가위바위보를 하는 학생, 밝고 귀여운 3D 일러스트, 네온 조명, 흰 배경, 고화질",
    title: "가위바위보 간식 자판기 프로젝트",
  },
  recycle: {
    idea: "쓰레기를 비추면 어느 통에 넣을지 알려주는 안내판",
    prompt:
      "학교 복도에 놓인 스마트 분리수거함, 캔과 페트병을 자동으로 안내하는 화면, 밝고 깨끗한 3D 일러스트, 흰 배경, 고화질",
    title: "스마트 분리수거 안내판 프로젝트",
  },
  mask: {
    idea: "마스크를 안 쓰면 알려주는 교실 출입문 도우미",
    prompt:
      "교실 문 앞의 귀여운 로봇 도우미가 마스크 착용을 안내하는 장면, 밝고 친근한 3D 일러스트, 흰 배경, 고화질",
    title: "마스크 안내 도우미 프로젝트",
  },
  thumb: {
    idea: "엄지 척을 하면 좋아요가 올라가는 우리 반 투표기",
    prompt:
      "교실에서 손으로 투표하면 화면에 점수가 올라가는 재미있는 장치, 밝고 귀여운 3D 일러스트, 흰 배경, 고화질",
    title: "우리 반 손 투표기 프로젝트",
  },
  custom: {
    idea: "내가 만든 AI를 우리 생활 어디에 쓸 수 있을까?",
    prompt:
      "내가 상상한 장치가 실제로 동작하는 장면, 밝고 귀여운 3D 일러스트, 흰 배경, 고화질",
    title: "나의 AI 활용 프로젝트",
  },
  audio: {
    idea: '"불 켜"라고 말하면 불이 켜지는 교실 스위치',
    prompt:
      "교실에서 학생이 말하자 조명이 켜지는 장면, 목소리 파형이 빛으로 퍼지는 연출, 밝고 귀여운 3D 일러스트, 흰 배경, 고화질",
    title: "목소리로 켜는 교실 조명 프로젝트",
  },
  pose: {
    idea: "만세 자세를 하면 점수가 올라가는 체육 시간 게임",
    prompt:
      "체육관에서 학생이 동작을 취하자 화면 속 캐릭터가 따라 하며 점수가 오르는 장면, 밝고 활기찬 3D 일러스트, 흰 배경, 고화질",
    title: "동작으로 하는 체육 게임 프로젝트",
  },
};
const M0 = SC.scope("rps");
const M = Object.assign({}, M0, COPY[M0.key]);
const MISSION = M.name;

/* 모달 상태 (루프 여부, 마지막 추론 데이터) */
const S = { loopOn: false, lastName: "", lastPct: 0 };

/* 헤더 배지 · 입력칸 placeholder 에 미션 문구 주입 */
$("missionTag").textContent = MISSION;
$("idea").placeholder = "예: " + M.idea;
$("title").placeholder = "프로젝트 제목 (예: " + M.title + ")";

/* 트랙 문구 적용 */
$("bPitch").textContent = TR.pitch;
$("bRawTag").textContent = TR.rawTag;
$("bPhotoPh").textContent = TR.boardPh;
$("mHintTxt").innerHTML =
  "이전 페이지에서 <b>" +
  TR.turnOn +
  "</b>을 먼저 눌러 주세요.<br>여기서는 그 <b>AI 인식 결과</b>를 캡처해 보드에 담습니다.";
$("mNote").innerHTML =
  "내가 학습시킨 AI가 " +
  TR.srcName +
  ' 입력을 실시간으로 분류한 결과예요. 원하는 순간에 <b style="color:var(--ink-2)">캡처</b>하세요.';

/* 보드 정보 업데이트 */
function syncBoard() {
  $("bTitle").textContent =
    $("title").value.trim() || "프로젝트 제목을 입력하세요";
  const nm = $("name").value.trim() || "이름",
    kl = $("klass").value.trim() || "학년/반";
  $("bAuth").textContent =
    "작성자: " + nm + " · " + kl + " · " + SC.todayKo();
}
["title", "name", "klass"].forEach((id) =>
  $(id).addEventListener("input", () => {
    syncBoard();
    saveDraft();
  }),
);
