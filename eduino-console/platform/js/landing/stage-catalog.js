/* 스테이지 카탈로그 */
(function () {
var IC = window.LandingIcons.IC;
/* ── 스테이지 카탈로그 ──────────────────────────────────────────────
   console/shared.js 의 TRACKS 와 동기화할 것 — 스테이지를 추가·수정하면 양쪽을 함께 고친다.
   shared.js 를 여기서 불러오지 않는 이유: 그 파일은 로드되는 순간 sessionStorage 의
   vision_skip_intro(1회용 인트로 제어 토큰)를 소진해 버려서, 시작페이지를 열었다는
   이유만으로 콘솔 인트로 동작이 어긋난다. 문구는 TRACKS[].desc 에서 그대로 옮겨 왔다.
   카드 클릭은 상세 페이지 없이 곧장 /entry.html(모드 선택)로 간다. */
const ENTRY = '../entry.html';
const TRACKS = [
  { no:'TRACK 01', label:'기본기능 체험', tag:'학습 없이 바로',
    desc:'클릭 한 번으로 AI를 작동시켜, 컴퓨터가 화면 속 세상을 어떻게 인식하는지 바로 관찰해요.',
    items:[
      { icon:IC('<path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16"/><rect x="8" y="8" width="8" height="8" rx="1"/>'), name:'객체 탐지', badge:'COCO-SSD', stars:1, mins:5,
        desc:'카메라에 잡힌 90종의 사물을 실시간으로 찾아내고 이름표를 붙여요.' },
      { icon:IC('<circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M8.5 14.5a5 5 0 0 0 7 0"/>'), name:'얼굴 검출', badge:'BlazeFace', stars:1, mins:5,
        desc:'사람 얼굴의 위치와 눈·코·입 지점을 실시간으로 잡아냅니다.' },
      { icon:IC('<circle cx="12" cy="4" r="2"/><path d="M12 6v6m0 0l-4 6m4-6l4 6M6 9l6 1 6-1"/>'), name:'뼈대 검출', badge:'MoveNet', stars:2, mins:8,
        desc:'몸의 관절 17곳을 이어 사람의 자세를 뼈대로 그려냅니다.' },
      { icon:IC('<path d="M12 3s6 6.2 6 10a6 6 0 0 1-12 0c0-3.8 6-10 6-10z"/><path d="M9 14a3 3 0 0 0 3 3"/>'), name:'색상 추적', badge:'RGB 임계값', stars:2, mins:8,
        desc:'고른 색만 남기고 지워, 컴퓨터가 색을 숫자로 다루는 방식을 봅니다.' },
      { icon:IC('<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none"/>'), name:'영상 효과', badge:'Canvas 필터', stars:1, mins:6,
        desc:'흑백·반전·엣지 같은 필터와 움직임 감지를 직접 걸어봅니다.' },
    ] },
  { no:'TRACK 02', label:'직접 제작', tag:'내 데이터로 학습',
    desc:'내가 직접 데이터를 모아 AI를 학습시키고 결과를 평가해요. 수집 → 학습 → 추론까지 나만의 AI를 완성합니다.',
    items:[
      { icon:IC('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>'), name:'이미지 분류', badge:'MobileNet', stars:3, mins:15,
        desc:'사진을 직접 모아 학습시키고, 새 사진을 알아맞히는 AI를 만듭니다.' },
      { icon:IC('<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 19v3M8.5 22h7"/>'), name:'음성 분류', badge:'Speech Commands', stars:3, mins:15,
        desc:'소리와 단어를 녹음해 학습시키고, 목소리로 반응하는 AI를 만듭니다.' },
      { icon:IC('<path d="M22 12h-4l-3 8-4-16-3 8H2"/>'), name:'동작 분류', badge:'MoveNet', stars:3, mins:15,
        desc:'몸 동작을 직접 보여주며 가르치고, 자세를 구분하는 AI를 만듭니다.' },
    ] },
];
document.getElementById('tracks').innerHTML = TRACKS.map(t => `
  <div class="trk">
    <div class="trk-h">
      <span class="trk-no">${t.no}</span><h3>${t.label}</h3><span class="tag on">${t.tag}</span>
      <p>${t.desc}</p>
    </div>
    <div class="cat">${t.items.map(s => `
      <div class="mod live">
        <div class="mod-top"><span class="emo">${s.icon}</span><span class="tag off">${s.badge}</span></div>
        <h3>${s.name}</h3>
        <p class="d">${s.desc}</p>
      </div>`).join('')}</div>
  </div>`).join('');
})();
