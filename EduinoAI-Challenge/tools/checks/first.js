/**
 * tools/checks/first.js — 첫 진입 상태.
 *
 * 나머지 검사는 전부 레이아웃이 자리를 잡은 뒤에 잰다. 55차 보강7 의 회귀는 그 앞에서 났다 —
 * 화면을 세우는 동안 카메라 창은 잠깐 시뮬 위에 떠 있는 158px 짜리 절대 위치 창이고,
 * 그때 잰 값이 그대로 굳어 두 칸이 절반 크기(76 x 57)로 남았다.
 *
 * 그래서 이 검사는 **resize 를 한 번도 주지 않은 채로** 연다.
 * 창 크기는 페이지를 열기 전에 정한다 — 연 뒤에 바꾸면 그것이 곧 resize 라 회귀를 덮는다.
 *
 * 3초에 한 번만 재지 않는다. 잘못 잰 값이 들어갔다가 관찰자가 뒤늦게 고치면
 * 3초 뒤에는 멀쩡해 보이기 때문이다(실제로 로컬에서 그렇게 스스로 고쳐졌다).
 * 여는 도중부터 여러 번 재서 한 번이라도 어긋나면 실패로 본다 —
 * 배포본에서 굳어 버린 그 값이 로컬에서는 잠깐 스쳐 갈 뿐이고, 잡아야 할 것은 그 순간이다.
 *
 * 판정 (모든 표본에서)
 *   · 카메라 두 칸의 크기가 서로 같다 (0.05px 이내 — 배포본 실측 0.02px 차를 담는다)
 *   · 칸 폭이 열 폭에서 계산한 기대값(floor(열 폭 / 2))과 1px 이내
 * 규칙 모달이 자동으로 열린 상태와 닫은 직후를 모두 잰다 — 실사용자는 이 경로를 지난다.
 */
const { spawn } = require('child_process'); const http = require('http');
const PORT = Number(process.env.PORT || 8123);
const { challengeIds, skipNote, challengeUrl } = require('./ids.js');
const IDS = challengeIds('첫 진입 상태');
// 55차 — 이 검사가 잡으려는 것은 첫 렌더 레이스이고, 레이스는 창 크기와 무관하다.
// 크기를 넷으로 두는 일은 세로 넘침 검사가 이미 한다. 여기서는 양 끝 둘만 본다.
// 모달 열림·닫음 두 경우는 줄이지 않는다 — 실사용자가 반드시 지나는 경로다.
const SIZES = [[1280, 720], [1920, 1080]];
// 두 칸이 "같다" 고 볼 폭. 로컬은 소수점이 딱 떨어지지만 배포본 실측은 0.02px 차가 났다.
// 화면으로는 무의미한 차이라 검사만 빨개진다. 기준은 배포본 실측으로 정한다(55차).
const SAME = 0.05;
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9314', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const get = (p) => new Promise((r, j) => http.get({ host: '127.0.0.1', port: 9314, path: p }, (s) => { let b = ''; s.on('data', (c) => { b += c; }); s.on('end', () => r(JSON.parse(b))); }).on('error', j));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let l; for (let i = 0; i < 60; i++) { try { l = await get('/json/list'); if (l.length) break; } catch { /* 아직 */ } await sleep(300); }
  const ws = new WebSocket(l.find((x) => x.type === 'page').webSocketDebuggerUrl); let id = 0; const p = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } };
  await new Promise((r) => { ws.onopen = r; });
  const send = (m, q = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: q })); });
  const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r.result.exceptionDetails ? 'THREW' : r.result.result.value; };
  await send('Page.enable'); await send('Runtime.enable');

  // 카메라 두 칸의 크기와 기대값. 값이 아니라 사실만 낸다 — 판정은 아래에서 한다.
  const READ = `(function(){
    var st=[].slice.call(document.querySelectorAll('.camstage')).filter(function(n){return !n.hidden;});
    if (st.length < 2) return 'none';
    var box=document.querySelector('[data-el="camview-stages"]');
    var w=box?box.clientWidth:0;
    var r=st.map(function(n){var b=n.getBoundingClientRect();return [b.width,b.height];});
    var cellSet=box?getComputedStyle(box).getPropertyValue('--camcell').trim():'';
    return JSON.stringify({w:w, cells:r, sized:!!cellSet});
  })()`;

  let bad = 0;
  let rows = 0;
  console.log('첫 진입 (resize 없음) — 카메라 두 칸');
  console.log('챌린지              창          모달       두 칸                기대     판정');
  for (const cid of IDS) {
    for (const [w, h] of SIZES) {
      // 창 크기는 열기 전에 정한다. 연 뒤에 바꾸면 그것이 resize 라 이 검사의 뜻이 사라진다.
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await send('Page.navigate', { url: challengeUrl(PORT, cid) });
      // 여는 도중부터 3초까지 여러 번 잰다. 어긋난 순간이 하나라도 있으면 그것이 결함이다.
      const AT = [700, 1200, 1800, 3000];
      for (const phase of ['모달 열림', '모달 닫음']) {
        if (phase === '모달 닫음') {
          await ev('(document.querySelector(\'[data-el="rules-close"]\')||{click:function(){}}).click()');
        }
        let seen = null;
        let worst = null;
        let t0 = 0;
        for (const at of AT) {
          await sleep(at - t0); t0 = at;
          const raw = await ev(READ);
          if (raw === 'none') break;
          const d = JSON.parse(raw);
          const want = Math.floor(d.w / 2);
          const dw = Math.abs(d.cells[0][0] - d.cells[1][0]);
          const dh = Math.abs(d.cells[0][1] - d.cells[1][1]);
          const off = d.sized ? Math.abs(d.cells[0][0] - want) : 0;
          const score = Math.max(dw, dh, off);
          seen = d;
          if (!worst || score > worst.score) worst = { d, want, dw, dh, off, score, at };
        }
        if (!seen || !worst) continue;
        rows += 1;
        const ok = worst.dw <= SAME && worst.dh <= SAME && worst.off <= 1;
        if (!ok) bad += 1;
        const c = worst.d.cells;
        console.log(cid.padEnd(19), `${w}x${h}`.padEnd(11), phase.padEnd(10),
          `${c[0][0].toFixed(2)}x${c[0][1].toFixed(2)} vs ${c[1][0].toFixed(2)}x${c[1][1].toFixed(2)}`.padEnd(20),
          String(worst.d.sized ? worst.want : '—').padStart(6), '  ',
          ok ? 'ok' : `실패(${worst.at}ms · 폭차 ${worst.dw.toFixed(2)} 높이차 ${worst.dh.toFixed(2)} 기대차 ${worst.off.toFixed(2)})`);
      }
    }
  }
  if (!rows) {
    console.log('\n잴 대상 0종 — 카메라 두 칸을 쓰는 챌린지가 목록에 없습니다.');
    ws.close(); chrome.kill(); process.exit(2);
  }
  // 57차 — 이 검사가 건너뛴 챌린지와 그 사유. 조용히 빠지면 '통과' 로 읽힌다.
  { const sk = skipNote('첫 진입 상태'); if (sk) console.log(`\n${sk}`); }
  console.log(`\n실패 ${bad}/${rows} · 기준: 두 칸의 크기가 같고(${SAME}px) 열 폭에서 계산한 기대값과 1px 이내`);
  ws.close(); chrome.kill(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e.message); chrome.kill(); process.exit(1); });
