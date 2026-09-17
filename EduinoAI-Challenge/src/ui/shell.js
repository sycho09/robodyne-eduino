/**
 * ui/shell.js — 3분할 셸의 DOM 골격.
 * 색·타이포는 CSS 변수(tokens.css)가 소유한다. 여기서는 구조와 배치만 만든다.
 */

export function buildShell(root, { title, crumb, kitId, challengeId, kitName, soleKit = false }) {
  root.innerHTML = `
  <div class="shell" data-el="shell">
    <!-- 52차 — 위를 두 줄로 나눈다.
         1행(앱 바)은 어느 챌린지에서나 같다. 스크롤해도 따라온다.
         2행(챌린지 바)은 지금 보고 있는 챌린지의 것이다. 따라오지 않는다. -->
    <header class="appbar">
      <div class="brand">EduinoAI 챌린지 게시판</div>
      <div class="appbar__spacer"></div>
      <a class="btn btn--quiet" href="/" data-link="/">게시판 돌아가기</a>
    </header>

    <div class="chbar" data-el="chbar">
      <b class="chbar__title" data-el="header-title">${escapeHtml(title)}</b>
      <span class="badge" data-el="ch-tier" hidden></span>
      <span class="chbar__goal" data-el="ch-goal" hidden></span>
      <div class="chbar__spacer"></div>
      <span class="chip chip--busy" data-el="asset-chip" hidden></span>
      <button class="btn btn--quiet" data-el="rules-open">챌린지 규칙</button>
      <button class="btn btn--quiet" data-el="submit-open">종료 &amp; 제출하기</button>
    </div>

    <!-- 54차 3행 — 왼쪽은 코드 툴바, 오른쪽은 이 페이지의 주제 한 줄.
         둘이 같은 높이로 한 줄에 서야 "코드를 올려서 이 목표를 깬다" 가 한눈에 읽힌다.
         따라오지는 않는다 — 스크롤과 무관하게 늘 같은 자리다. -->
    <div class="topline">
      <div class="pane__title edtoolbar">
        <span class="panetabs" data-el="pane-tabs" hidden>
          <button class="panetab" type="button" data-el="tab-train">학습</button>
          <button class="panetab is-on" type="button" data-el="tab-code">코드</button>
        </span>
        <span data-el="pane-label">코드 에디터</span>
        <!-- 57-C 파트5 — 실물 아두이노 IDE 처럼 원형 아이콘 둘로. 하는 일은 52차 그대로다:
             컴파일(✓)은 코드만 보고, 업로드(→)는 통과하면 시뮬에 넣는다.
             이름은 툴팁으로만 남는다 — 툴바가 좁아 글자까지 넣으면 링크가 밀린다. -->
        <button class="edbtn edbtn--verify" type="button" data-el="verify"
                title="컴파일 (Ctrl+R)" aria-label="컴파일 (Ctrl+R)"><span aria-hidden="true">✓</span></button>
        <button class="edbtn edbtn--upload" type="button" data-el="apply"
                title="업로드 (Ctrl+U)" aria-label="업로드 (Ctrl+U)"><span aria-hidden="true">→</span></button>
        <span class="edtoolbar__spacer"></span>
        <span class="edlinks">
          <button class="edlink" type="button" data-el="solution" hidden>해답 보기</button>
          <button class="edlink" type="button" data-el="reset-code">코드 초기화</button>
          <button class="edlink" type="button" data-el="adopt-starter" hidden>새 코드로 바꾸기</button>
        </span>
      </div>
      <div class="goalbar" data-el="goalbar" hidden></div>
    </div>

    <div class="shell__body">
      <!-- 좌: 코드 -->
      <section class="pane">
        <div class="notice-bar" data-el="notice" hidden></div>
        <div class="camline" data-el="cam-line" hidden>
          <button class="btn btn--go" type="button" data-el="cam-start-main">카메라 켜기</button>
          <span class="camline__state" data-el="cam-line-state"></span>
        </div>
        <div class="pane__section pane__section--grow pane__content--flush" data-el="train-mount" hidden></div>
        <!-- 57-C 파트5 — 파일 탭 한 개. 실물 스케치는 파일 이름이 탭으로 선다.
             탭을 더 만들지 않는다(kit.h 열람은 이번 범위 밖). -->
        <div class="edtabs" data-el="ed-tabs"><span class="edtab is-on">drive.ino</span></div>
        <div class="pane__section pane__section--grow pane__content--flush" data-el="editor-mount"></div>
        <!-- 상태 띠 — 결과만 적는다. 진행바도, 스케치 바이트도, COM 포트도 두지 않는다:
             우리는 실제로 컴파일하지 않으므로 없는 수치를 화면에 만들지 않는다. -->
        <div class="edstat" data-el="ed-statbar">
          <span class="edstat__msg" data-el="ed-stat"></span>
          <span class="edstat__spacer"></span>
          <span class="edstat__board" data-el="ed-board"></span>
          <span class="edstat__pos" data-el="ed-pos">줄 1, 칸 1</span>
        </div>

        <details class="pane__section pane__fold" data-el="api-fold">
          <summary class="pane__title"><span>코드 설명</span><span class="chip" data-el="api-count"></span></summary>
          <div class="pane__content" data-el="api-mount"></div>
        </details>

        <!-- 52차 — 시리얼 모니터는 늘 열려 있다. 로그는 여기 한 곳에 모인다:
             [적용] [오류] [출력] [기록]. 오류 탭은 없앴다.
             시간은 시뮬 tick 기준 경과 시간이다 — 실제 시각을 찍지 않는다.
             같은 코드를 두 번 돌리면 로그가 글자까지 같아야 한다. -->
        <div class="pane__section serialbox" data-el="serial-fold">
          <div class="pane__title">
            <span>시리얼 모니터</span>
            <span class="chip" data-el="serial-count">0</span>
            <span class="chip" data-el="acc-chip" hidden>학습 정확도 —</span>
            <span class="btn-row">
              <!-- 57-C 파트5 — 실물 모니터의 머리 셋. 줄바꿈과 속도는 표시이자 설정이다. -->
              <select class="serial__sel" data-el="serial-eol" aria-label="줄 끝">
                <option value="none">새 줄 없음</option>
                <option value="nl" selected>새 줄</option>
              </select>
              <span class="serial__baud" data-el="serial-baud">115200 baud</span>
              <button class="btn btn--mini" type="button" data-el="serial-clear">지우기</button>
              <button class="btn btn--mini" type="button" data-el="serial-toggle" aria-expanded="true">접기</button>
            </span>
          </div>
          <div class="pane__content serial" data-el="serial-mount"></div>
          <!-- 보드로 보낼 값. 지금 판의 ino 서브셋에는 Serial.read 가 없어
               스케치가 이 값을 읽지 못한다 — 보낸 줄만 모니터에 남는다. -->
          <div class="serial__send">
            <input type="text" class="serial__in" data-el="serial-input" maxlength="80"
                   placeholder="보드로 보낼 값" aria-label="보드로 보낼 값">
            <button class="btn btn--mini" type="button" data-el="serial-send">보내기</button>
          </div>
        </div>

        <div class="pane__section trainresult" data-el="train-result" hidden>
          <div class="pane__title"><span>학습 결과</span><span class="chip" data-el="tr-acc">아직 없음</span></div>
          <div class="trainresult__body" data-el="tr-body"></div>
        </div>

        <div class="pane__section speedcard" data-el="speed-card" hidden>
          <div class="pane__title"><span data-el="speed-label">RC카 속도</span><span class="chip" data-el="speed-value">0</span></div>
          <div class="speedcard__row">
            <button class="btn btn--mini" type="button" data-el="speed-down" aria-label="속도 낮추기">−</button>
            <input type="range" data-el="speed-range" aria-label="RC카 속도">
            <button class="btn btn--mini" type="button" data-el="speed-up" aria-label="속도 올리기">+</button>
          </div>
          <p class="speedcard__note" data-el="speed-note"></p>
        </div>

      </section>

      <!-- 중앙: 트랙 -->
      <section class="pane">
        <div class="pane__title" data-el="view-head">
          <span data-el="view-title">트랙 — 비스듬히 본 화면</span>
          <span class="chip" data-el="scale-chip"></span>
        </div>
        <div class="viewhead" data-el="view-head-big" hidden>
          <h2 class="viewhead__title" data-el="view-head-title"></h2>
          <p class="viewhead__sub" data-el="view-head-sub"></p>
        </div>
        <div class="view">
          <canvas class="view__canvas" data-el="canvas"></canvas>
          <!-- 54차 파트G — 고정 확대로 트랙 밖 소품이 테두리에서 잘린다. 밀려나는 것은 의도지만
               잘린 단면이 그대로 드러난다. 안쪽으로 어둡게 번지는 띠를 얹어 끝을 흐린다.
               캔버스 위에 있어야 보인다 — inset 그림자는 자기 자식 뒤에 그려진다. -->
          <div class="view__vignette" aria-hidden="true"></div>
          <div class="view__overlay" data-el="view-overlay"></div>
          <!-- 54차 — 조작과 상태는 시뮬 안쪽 왼쪽 위에 얹힌다. 밖에 두면 그만큼 시뮬이 눌린다.
               자리만 여기서 잡고, 알약 안에 들어가는 버튼은 아래 .transport 를 그대로 옮겨 온다. -->
          <div class="simctl" data-el="simctl"></div>
          <div class="simsay" data-el="simsay">멈춰 있어요 · 0 mm/s</div>
          <!-- 54차 파트M — 주소에 ?fps=1 을 붙였을 때만 나온다. 일반 화면에는 절대 안 나온다.
               브라우저가 낸 값(rAF 간격)을 그대로 옮긴다. -->
          <div class="simfps" data-el="simfps" hidden>— fps</div>
          <!-- 54차 파트K — 중급·상급의 학습 목표가 좌우 편차 보정이다. 그 편차를 보는 그림이
               곧 문제이므로 오른쪽 칸이 아니라 트랙 옆에 둔다. 가운데 0선을 기준으로
               좌우로 뻗는 막대라 어느 쪽이 센지 숫자를 안 읽어도 보인다. -->
          <div class="simcard simmotor" data-el="simmotor" hidden>
            <div class="simcard__head"><span>모터 상태</span><b data-el="sm-speed">0 mm/s</b></div>
            <div class="simmotor__row">
              <span class="simmotor__n">왼쪽</span>
              <span class="simmotor__t"><i data-el="sm-l-bar"></i></span>
              <b data-el="sm-l">0</b>
            </div>
            <div class="simmotor__row">
              <span class="simmotor__n">오른쪽</span>
              <span class="simmotor__t"><i data-el="sm-r-bar"></i></span>
              <b data-el="sm-r">0</b>
            </div>
            <p class="simcard__say" data-el="sm-say"></p>
          </div>
          <!-- 54차 파트L — 지금 카메라가 무슨 색을 잡고 있는지. 값은 카메라에서 나온 것을
               옮기기만 한다. 카메라가 꺼져 있으면 전부 "—" 이고 막대는 비어 있다. -->
          <div class="simcard simcolor" data-el="simcolor" hidden>
            <div class="simcard__head"><span>지금 잡은 색</span><i class="simcolor__chip" data-el="sc-chip"></i></div>
            <div class="simcolor__row"><span>R</span><span class="simcolor__t"><i data-el="sc-r-bar"></i></span><b data-el="sc-r">—</b></div>
            <div class="simcolor__row"><span>G</span><span class="simcolor__t"><i data-el="sc-g-bar"></i></span><b data-el="sc-g">—</b></div>
            <div class="simcolor__row"><span>B</span><span class="simcolor__t"><i data-el="sc-b-bar"></i></span><b data-el="sc-b">—</b></div>
            <div class="simcolor__foot">
              <span>어긋남 <b data-el="sc-off">—</b></span>
              <span>크기 <b data-el="sc-area">—</b></span>
              <span>인식률 <b data-el="sc-rate">—</b></span>
            </div>
          </div>
          <!-- 54차 파트M — 이 챌린지의 계기는 바퀴 값이 아니라 모델의 판단이다.
               세 확률 막대와 확신도. 값은 추론기가 낸 것을 옮기기만 한다. -->
          <div class="simcard simsee" data-el="simsee" hidden>
            <div class="simcard__head"><span>지금 보는 것</span><b data-el="ss-label">모름</b></div>
            <div class="simsee__bars" data-el="ss-bars"></div>
            <div class="simsee__foot">확신도 <b data-el="ss-conf">0%</b></div>
          </div>
          <!-- 기록은 오른쪽 칸에서 내려와 트랙 옆에 붙는다. 관제 화면에서는 현황판이 먼저다. -->
          <div class="simsheet" data-el="simsheet" hidden>
            <b class="simsheet__big" data-el="sh-now">0.000초</b>
            <div class="simsheet__cap"><span data-el="sh-best">내 최고 기록 —</span><span data-el="sh-lap">1바퀴째</span></div>
            <div class="simsheet__line">
              <span data-el="sh-off-cap">길 벗어남 <b data-el="sh-off">—</b></span>
              <span data-el="sh-vio-cap" title="판단 지점 위반 + 장애물 충돌 + 막힌 채 지나감. 벌점이 붙는 수다.">규칙 위반 <b data-el="sh-vio">—</b></span>
              <span>지점 <b data-el="sh-pts">—</b></span>
            </div>
          </div>
          <div class="zonebar" data-el="zonebar" hidden>
            <span class="zonebar__tag" data-el="zone-tag"></span>
            <span class="zonebar__label" data-el="zone-label"></span>
            <span class="zonebar__dist" data-el="zone-dist"></span>
          </div>
          <div class="camview" data-el="camview" hidden>
            <button class="camview__head" type="button" data-el="camview-toggle" aria-expanded="true">
              <span>카메라 시점</span><span class="camview__mark" data-role="mark">접기</span>
            </button>
            <div class="camview__body" data-el="camview-body">
              <!-- 51차 — 두 화면을 위아래로 세운다. 1단이 원본, 2단이 인식 결과다.
                   "내가 든 물체가 어떻게 인식되는지" 를 보려면 둘이 같은 크기로 나란해야 한다.
                   1단에 무엇이 오는지는 매니페스트(camera_source)가 정한다 —
                   webcam 이면 실물 웹캠 영상, sim 이면 RC카가 보는 시뮬 화면이다. -->
              <!-- 54차 보강6-1 — 두 단을 한 묶음으로 감싼다. 세로로 쌓을지 가로로 세울지는
                   매니페스트(ui.camera_layout)가 고르고, 이 묶음의 방향만 바뀐다. -->
              <div class="camview__stages" data-el="camview-stages">
                <div class="camstage" data-el="camview-rawcell" hidden>
                  <span class="camview__cap">원본 화면</span>
                  <canvas class="camstage__canvas" data-el="camview-raw"></canvas>
                </div>
                <div class="camstage camfpv" data-el="camview-fpv" hidden>
                  <span class="camview__cap" data-el="fpv-cap">RC카가 보는 화면</span>
                  <canvas class="camstage__canvas" data-el="fpv-canvas"></canvas>
                  <div class="camfpv__read" data-el="fpv-read" hidden>
                    <b data-el="fpv-label">모름</b><span data-el="fpv-conf">0%</span>
                  </div>
                </div>
                <div class="camstage" data-el="camview-maskcell">
                  <span class="camview__cap" data-el="camview-maskcap">인식 결과</span>
                  <canvas class="camstage__canvas" data-el="camview-canvas"></canvas>
                </div>
              </div>
              <!-- 손의 움직임이 바퀴 값으로 바뀌는 경로. 카메라 바로 밑에 둔다. -->
              <div class="camsteer" data-el="camsteer" hidden>
                <span class="camsteer__k">어긋남</span>
                <b class="camsteer__v" data-el="camsteer-off">0</b>
                <span class="camsteer__bar"><i data-el="camsteer-fill"></i></span>
                <span class="camsteer__k">왼쪽</span><b class="camsteer__w" data-el="camsteer-l">0</b>
                <span class="camsteer__k">오른쪽</span><b class="camsteer__w" data-el="camsteer-r">0</b>
              </div>
              <div class="camview__read" data-el="camview-read"></div>
              <div class="mlread" data-el="mlread" hidden>
                <div class="mlread__top"><span data-el="ml-label">모름</span><b data-el="ml-conf">0%</b></div>
                <div class="mlread__bars" data-el="ml-bars"></div>
              </div>
              <div class="camstate" data-el="camstate" hidden>
                <button class="btn btn--go btn--cam" data-el="cam-start">카메라 켜기</button>
                <span class="camstate__label" data-el="cam-status">카메라 꺼짐</span>
              </div>
              <!-- 54차 파트L — 색 맞추기는 접어 둔다. 오른쪽 칸에서 자리를 가장 많이 먹는 칸인데
                   (187px) 늘 보고 있을 것은 아니다 — 처음 한 번 맞추고 나면 카메라 두 칸을 본다.
                   접으면 카메라 두 칸이 그만큼 커진다. -->
              <details class="camtune" data-el="camtune" hidden open>
                <summary class="camtune__head">색 맞추기</summary>
                <div class="camtune__rate">인식률 <b data-el="cam-rate">0%</b><span data-el="cam-mode"></span></div>
                <div class="camtune__active">
                  <span>적용 중</span><b data-el="cam-active">—</b>
                  <span class="camtune__diff" data-el="cam-diff" hidden>코드와 다름</span>
                </div>
                <label class="camtune__row"><span>R</span><input type="range" min="0" max="255" data-el="cam-r"><b data-el="cam-r-v"></b></label>
                <label class="camtune__row"><span>G</span><input type="range" min="0" max="255" data-el="cam-g"><b data-el="cam-g-v"></b></label>
                <label class="camtune__row"><span>B</span><input type="range" min="0" max="255" data-el="cam-b"><b data-el="cam-b-v"></b></label>
                <label class="camtune__row"><span>허용</span><input type="range" min="5" max="180" data-el="cam-tol"><b data-el="cam-tol-v"></b></label>
                <button class="btn btn--mini" data-el="cam-apply">이 값을 코드에 넣기</button>
              </details>
            </div>
          </div>
        </div>
        <div class="coursebar" data-el="coursebar" hidden>
          <span class="coursebar__cap" data-el="coursebar-cap"></span>
          <ol class="coursebar__steps" data-el="coursebar-steps"></ol>
        </div>
        <!-- 52차 — 시작과 정지 둘뿐이다. 정지는 멈추면서 처음 상태로 되돌린다.
             소리·가이드라인은 아이콘만 둔다. 잠깐 멈춤은 검수용(?dev=1)에서만 보인다.
             54차 — 이 줄은 시뮬 칸 안쪽 왼쪽 위로 들어간다(아래 .view 안으로 옮겨진다). -->
        <div class="transport">
          <button class="btn btn--go" data-el="go"><span aria-hidden="true">▶</span> 실행</button>
          <button class="btn btn--mini" data-el="reset-sim"><span aria-hidden="true">■</span> 정지</button>
          <!-- 54차 보강5 — 알약에는 [▶ 실행] [■ 정지] 둘뿐이다.
               📖 는 위 [챌린지 규칙] 이 같은 창을 열어 입구가 둘일 이유가 없고(파트 H 와 같은 이유),
               🔇 는 주행음 자체를 걷어내면서 함께 뺐다. 소리 파일과 재생 코드는 남아 있다. -->
          <div class="transport__adv" role="group" aria-label="세부 조작">
            <button class="btn btn--mini" data-el="pause" hidden>⏸ 잠깐 멈춤</button>
            <button class="btn btn--mini" data-el="play" hidden>재생</button>
            <button class="btn btn--mini" data-el="guide-again" hidden title="처음 안내 다시 보기">안내</button>
            <div class="speed" data-el="speed" role="group" aria-label="재생 속도">
              <button class="speed__btn" data-speed="1" aria-pressed="true">1x</button>
              <button class="speed__btn" data-speed="2" aria-pressed="false">2x</button>
              <button class="speed__btn" data-speed="4" aria-pressed="false">4x</button>
            </div>
          </div>
          <div class="transport__spacer"></div>
          <span class="transport__tick" data-el="tick">0.000초</span>
        </div>
      </section>

      <!-- 챌린지 규칙. 52차에는 틀만 세운다 — 내용은 다음 차수에 매니페스트에서 채운다. -->
      <!-- 54차 — 모달은 하나다. [챌린지 규칙] 과 📖 가 같은 창을 연다.
           52-1차에 "어떻게 조작하는가" 와 "무엇이 성공인가" 로 갈랐으나,
           규칙 창이 "이렇게 깹니다" 를 담게 되자 두 창의 내용이 겹쳤다.
           탭 없이 다섯 덩어리 한 장 스크롤이다. -->
      <div class="modal" data-el="rules-modal" hidden>
        <div class="modal__box modal__box--rules" role="dialog" aria-modal="true" aria-label="챌린지 규칙">
          <div class="modal__row">
            <b class="modal__title" data-el="rules-title">챌린지 규칙</b>
            <span class="modal__spacer"></span>
            <button class="modal__x" type="button" data-el="rules-close" aria-label="닫기">×</button>
          </div>
          <div class="rules__scroll" data-el="rules-body"></div>
          <div class="rules__foot">
            <label class="howto__skip">
              <input type="checkbox" data-el="howto-skip"><span>다음부터 열지 않기</span>
            </label>
            <span class="howto__gap"></span>
            <button class="btn btn--go" type="button" data-el="howto-start">시작하기</button>
          </div>
        </div>
      </div>

      <!-- 주행이 끝난 순간의 결과. 화면 한가운데 뜬다. -->
      <div class="modal outcome" data-el="outcome" hidden>
        <div class="modal__box outcome__box" role="dialog" aria-modal="true" aria-label="주행 결과">
          <button class="outcome__x" type="button" data-el="outcome-close" aria-label="결과 닫기">×</button>
          <div class="outcome__stamp" data-el="outcome-stamp"></div>
          <div class="outcome__big" data-el="outcome-big"></div>
          <div class="outcome__delta" data-el="outcome-delta"></div>
          <p class="outcome__why" data-el="outcome-why"></p>
          <dl class="outcome__stats" data-el="outcome-stats"></dl>
          <!-- 52차 — 구간 8칸 띠 대신 여기 표로 온다. 번호 · 종류 · 걸린 시간 세 칸. -->
          <table class="segtable" data-el="outcome-segs" hidden>
            <thead><tr><th>구간</th><th>종류</th><th>걸린 시간</th></tr></thead>
            <tbody data-el="outcome-segs-body"></tbody>
          </table>
          <!-- 54차 파트M — 판단 지점 표(52-1차에서 미룬 것). 구간 표와 자리를 나눠 쓴다:
               구간이 있는 챌린지는 위 표, 판단 지점이 있는 챌린지는 이 표가 나온다. -->
          <table class="segtable" data-el="outcome-points" hidden>
            <thead><tr><th>지점</th><th>상황</th><th>본 것</th><th>판정</th></tr></thead>
            <tbody data-el="outcome-points-body"></tbody>
          </table>
          <div class="outcome__advice" data-el="outcome-advice" hidden>
            <span class="outcome__advice-cap">이렇게 해 보세요</span>
            <span data-el="outcome-advice-text"></span>
          </div>
          <div class="outcome__actions" data-el="outcome-actions"></div>
        </div>
      </div>

      <!-- 우: 기록. 54차 — 오른쪽 칸 전체가 관제 한 벌이다(하이라이트 바와 같은 색). -->
      <section class="pane pane--scroll pane--board" data-el="board-pane">
        <details class="pane__section pane__fold" data-el="briefing-fold" open>
          <summary class="pane__title"><span>미션 브리핑</span></summary>
          <div class="pane__content" data-el="briefing-mount"></div>
        </details>

        <div class="pane__section">
          <div class="pane__title"><span>현재 시도</span></div>
          <div class="status-row">
            <span class="chip chip--status" data-el="status" data-status="idle">준비</span>
            <span class="notice" data-el="tab-notice" hidden>탭 전환으로 일시정지됨</span>
          </div>
          <div class="pane__content pane__content--fixed" data-el="gauge-mount"></div>
        </div>

        <div class="pane__section motor" data-el="motor-section" hidden>
          <div class="pane__title"><span>모터 상태</span><span class="chip" data-el="motor-speed">0 mm/s</span></div>
          <div class="motor__body">
            <div class="mbar"><span class="mbar__n">왼쪽</span><span class="mbar__t"><i data-el="motor-l-bar"></i></span><b data-el="motor-l">0</b></div>
            <div class="mbar"><span class="mbar__n">오른쪽</span><span class="mbar__t"><i data-el="motor-r-bar"></i></span><b data-el="motor-r">0</b></div>
            <p class="motor__say" data-el="motor-say"></p>
          </div>
        </div>

        <div class="pane__section" data-el="minimap-section">
          <div class="pane__title"><span>위에서 본 트랙</span><span class="chip" data-el="minimap-chip">지나간 길</span></div>
          <div class="minimap"><canvas class="minimap__canvas" data-el="minimap-canvas"></canvas></div>
        </div>

        <!-- 54차 파트M — 전체 뷰를 클리어 현황판으로 바꾼다. 이 챌린지에서 알고 싶은 것은
             "지금 어디쯤인가" 가 아니라 "여섯 지점을 지켰는가" 다. 결과 모달의 판단 지점 표와
             같은 자료(엔진의 판정 결과)를 쓴다 — 화면이 다시 세지 않는다. -->
        <div class="pane__section" data-el="clear-section" hidden>
          <div class="pane__title"><span>클리어 현황</span><span class="chip" data-el="clear-chip">—</span></div>
          <ol class="clear" data-el="clear-list"></ol>
          <div class="clear__sum" data-el="clear-sum">—</div>
        </div>

        <div class="pane__section" data-el="eventlog-section" hidden>
          <div class="pane__title"><span>이벤트 로그</span></div>
          <div class="pane__content pane__content--flush" data-el="eventlog-mount"></div>
        </div>

        <!-- 54차 — 세 덩어리로 줄인다: 내 최고 기록 · 지금 한 바퀴 · 최근 시도.
             안내 문구는 규칙 모달이 들고 있다. 여기서 같은 말을 또 하면 값이 묻힌다.
             최근 시도는 이 브라우저에 남은 것만 보여 준다 — 서버가 없고 지우지도 않는다. -->
        <div class="pane__section record" data-el="record-plain" hidden>
          <div class="pane__title"><span>기록</span><span class="record__slot" data-el="record-status"></span></div>
          <div class="record__best">
            <span class="record__cap">내 최고 기록</span>
            <b class="record__big" data-el="rec-best">아직 없음</b>
          </div>
          <div class="record__now">
            <span class="record__cap">지금 한 바퀴</span>
            <b data-el="rec-now">아직 없음</b>
          </div>
          <div class="record__recent">
            <span class="record__cap">최근 시도</span>
            <ul class="tries" data-el="rec-prev"></ul>
          </div>
        </div>

        <details class="pane__section pane__fold" data-el="best-fold">
          <summary class="pane__title"><span>최고 기록</span></summary>
          <div class="pane__content pane__content--fixed" data-el="best-mount"></div>
        </details>
        <details class="pane__section pane__fold" data-el="history-fold">
          <summary class="pane__title"><span>성장 이력</span></summary>
          <div class="pane__content pane__content--flush" data-el="history-mount"></div>
        </details>
      </section>
    </div>
  </div>`;

  const el = {};
  for (const node of root.querySelectorAll('[data-el]')) el[camel(node.dataset.el)] = node;
  return el;
}

function camel(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
