/**
 * tools/checks/oldcode.js — 옛 코드가 저장된 상태 검증.
 *
 * 52차에 스타터 코드에서 주석을 걷어내고 긴 줄을 나눴는데, 배포본에서는 옛 코드가
 * 그대로 보였다. 브라우저에 저장된 코드가 새 스타터를 밀어내기 때문이다.
 * 깨끗한 브라우저에서만 재면 이 상태가 보이지 않는다 — 46차의 "기록 있는 상태" 검사가
 * 같은 이유로 생겼다.
 *
 * 그래서 옛 스타터를 localStorage 에 심어 둔 브라우저로 8종을 연다. 두 경우를 나눠 본다.
 *   손대지 않은 옛 코드 — 조용히 새 판으로 바뀌어야 한다(넘침 0)
 *   손댄 옛 코드        — 그대로 남되 [새 코드로 바꾸기] 가 나오고, 넘치면 배너가 그 사실을 적어야 한다
 */
const { spawn } = require('child_process'); const http = require('http');
const fs = require('node:fs'); const path = require('node:path');
const PORT = Number(process.env.PORT || 8123);
const { ROOT, challengeIds, skipNote, challengeUrl, manifestPath, storageKey } = require('./ids.js');
const IDS = challengeIds('옛 코드 있는 상태');

/** 52차 이전 스타터를 흉내 낸다 — 주석이 붙고 한 줄이 긴 코드. 실제 옛 판과 같은 성질만 있으면 된다. */
function oldStarterOf(cid) {
  const p = manifestPath(cid);
  const src = JSON.parse(fs.readFileSync(p, 'utf8')).starter_code.source;
  return [
    '// [설정] 여기 숫자를 바꾸면 빨라지고 느려진다 — 52차 이전 판을 흉내 낸 줄이다',
    '//   PWM 255 에서 바퀴 속도 450 mm/s / PWM 60 미만은 안 움직인다',
    src,
    '// [주행] 이 안이 계속 반복된다. 한 변 + 90도 회전이면 사각형이 된다',
  ].join('\n');
}

(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9413', '--no-sandbox', '--disable-gpu', '--window-size=1440,900', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  const get = (p) => new Promise((r, j) => http.get({ host: '127.0.0.1', port: 9413, path: p }, (s) => { let b = ''; s.on('data', (c) => { b += c; }); s.on('end', () => r(JSON.parse(b))); }).on('error', j));
  let l; for (let i = 0; i < 80; i++) { try { l = await get('/json/list'); if (l.length) break; } catch { /* 아직 안 뜸 */ } await sleep(300); }
  const ws = new WebSocket(l.find((x) => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const p = new Map(); let errs = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errs.push('EXC');
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('LOG');
    if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); }
  };
  await new Promise((r) => { ws.onopen = r; });
  const send = (m, q = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: q })); });
  const ev = async (x) => {
    const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
    return r.result.exceptionDetails ? 'THREW' : r.result.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }); await sleep(700);

  console.log('챌린지              손댐  넘침  잘림  새코드버튼  배너가 넘침을 적나  오류  판정');
  let bad = 0;
  for (const cid of IDS) {
    for (const touched of [false, true]) {
      errs = [];
      const old = oldStarterOf(cid) + (touched ? '\n// 학생이 덧붙인 줄' : '');
      // 손대지 않은 경우는 저장본과 starterAtSave 가 같다. 손댄 경우는 다르다.
      await ev(`(function(){try{
        var k='${storageKey(cid)}';
        localStorage.setItem('dtc:v1:guideSeen','1');
        localStorage.setItem(k, JSON.stringify({v:2, code:${JSON.stringify(old)},
          starterAtSave:${JSON.stringify(touched ? oldStarterOf(cid) : old)},
          attempt:0, history:[], snapshots:{}, notes:{}, solutionSeenAt:null, mlSamples:[], mlTrend:[]}));
      }catch(e){}})()`);
      await send('Page.navigate', { url: challengeUrl(PORT, cid) });
      await sleep(2600);
      const r = await ev(`(function(){
        var a=document.querySelector('textarea.editor__area');
        var hl=document.querySelector('.editor__hl');
        var n=document.querySelector('[data-el="notice"]');
        var b=document.querySelector('[data-el="adopt-starter"]');
        var over=a?Math.max(0,a.scrollWidth-a.clientWidth):0;
        var clip=hl?Math.max(0,hl.scrollWidth-a.scrollWidth):0;
        return {over:over, clip:clip,
          adopt: b ? (b.offsetParent!==null?'있음':'감춤') : '없음',
          says: n && !n.hidden ? /px/.test(n.textContent) : false};
      })()`);
      if (r === 'THREW') { console.log(cid.padEnd(19), '측정 실패'); bad++; continue; }
      // 손대지 않았으면 새 판으로 바뀌어 넘치지 않아야 한다.
      // 손댔으면 남기되, 넘칠 때는 배너가 그 사실을 적어야 한다.
      const ok = errs.length === 0 && r.clip === 0
        && (touched ? (r.adopt === '있음' && (r.over === 0 || r.says)) : r.over === 0);
      if (!ok) bad++;
      console.log(cid.padEnd(19), (touched ? '손댐' : '그대로').padEnd(5),
        String(r.over).padStart(4), String(r.clip).padStart(5), String(r.adopt).padStart(9),
        String(r.says ? '예' : '아니오').padStart(14), String(errs.length).padStart(5), '  ', ok ? 'ok' : '실패');
    }
  }
  // 57차 — 이 검사가 건너뛴 챌린지와 그 사유. 조용히 빠지면 '통과' 로 읽힌다.
  { const sk = skipNote('옛 코드 있는 상태'); if (sk) console.log(`\n${sk}`); }
  console.log(`\n실패 ${bad}/${IDS.length * 2} · 기준: 손대지 않은 옛 코드는 새 판으로 바뀌어 넘침 0 ·`
    + ' 손댄 옛 코드는 남되 [새 코드로 바꾸기] 가 나오고 넘치면 배너가 그 사실을 적을 것');
  ws.close(); chrome.kill(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(1); });
