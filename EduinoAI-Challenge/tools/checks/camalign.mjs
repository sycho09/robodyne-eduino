/**
 * tools/checks/camalign.mjs — 카메라 2단의 세로 정렬.
 *
 * 51차에 두 단을 세운 뒤로 2단 검출 박스가 1단 마커보다 세로로 아래에 그려져 있었다.
 * 두 단은 화각(60도)은 같았지만 투영식이 달랐다 — 1단은 카메라 높이 90mm 와 지평선으로
 * 실제 자리를 투영하는데, 2단은 투영을 하지 않고 덩어리를 늘 프레임 세로 중앙에 놓았다.
 * 53차에 2단이 1단의 자리를 따라가게 고쳤다. 투영식은 1단 하나뿐이다.
 *
 * 판정: 1단 마커의 세로 중심과 2단 박스의 세로 중심 차이가 캔버스 높이의 2% 이내.
 * 두 종에서 각각 표본 3개 이상을 잡는다.
 *
 * 재는 법: 두 캔버스에서 채도가 높은 픽셀의 세로 범위를 뽑는다. 다만 2단은
 *   · 아래 18px 은 오프셋 눈금자다(화살표가 마커 색이라 덩어리로 오인된다)
 *   · 검출 중일 때 프레임 테두리도 마커 색이다
 * 그래서 가장자리 4px 과 눈금자를 빼고 잰다.
 */
import { challengeUrl } from './ids.js';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';

const PORT = Number(process.env.PORT || 8123);
// 54차 — 대상을 목록에서 고른다. 이름을 박아 두면 그 챌린지가 하차한 차수에
// 검사가 조용히 '두 화면에 다 안 잡힘' 만 내고 실패로 떨어진다(실제로 그랬다).
// 두 단이 성립하는 조건은 하나다: 1단이 시뮬 화면이고 코스 위에 마커가 있을 것.
const IDS = (() => {
  const idx = JSON.parse(fs.readFileSync(new URL('../../src/challenges/index.json', import.meta.url), 'utf8'));
  return idx.challenges.filter((c) => !c.hidden).map((c) => c.challenge_id).filter((cid) => {
    const entry = idx.challenges.find((c) => c.challenge_id === cid);
    const ch = JSON.parse(fs.readFileSync(new URL(`../../src/challenges/${entry.path}`, import.meta.url), 'utf8'));
    return ch.camera_source === 'sim' && (ch.scene.markers || []).length > 0;
  });
})();
// 마커가 두 화면에 다 잡히는 tick 이 매번은 아니다(코너를 돌 때는 시야 밖).
// 넉넉히 훑어 셋 이상 성립하면 통과로 본다.
const SAMPLES = 12;
const NEED = 3;
const TOL_PCT = 2;

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9419', '--no-sandbox', '--disable-gpu', '--window-size=1440,900', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const get = (p) => new Promise((r, j) => { http.get({ host: '127.0.0.1', port: 9419, path: p }, (s) => { let b = ''; s.on('data', (c) => { b += c; }); s.on('end', () => r(JSON.parse(b))); }).on('error', j); });

const PROBE = `(function(){
  var fpv=document.querySelector('[data-el="fpv-canvas"]');
  var mask=document.querySelector('[data-el="camview-canvas"]');
  if(!fpv||!mask) return null;
  function span(cv, padPx, cutBottomPx){
    var g=cv.getContext('2d'); var dpr=cv.width/(cv.clientWidth||1);
    var pad=Math.round(padPx*dpr), cut=Math.round(cutBottomPx*dpr);
    var w=cv.width, h=cv.height-cut, d=g.getImageData(0,0,cv.width,cv.height).data;
    var y0=1e9,y1=-1,n=0;
    for(var y=pad;y<h-pad;y++) for(var x=pad;x<w-pad;x++){
      var i=(y*w+x)*4; if(d[i+3]<8) continue;
      var mx=Math.max(d[i],d[i+1],d[i+2]), mn=Math.min(d[i],d[i+1],d[i+2]);
      if(mx<70 || (mx-mn)/mx < 0.45) continue;
      if(y<y0)y0=y; if(y>y1)y1=y; n++;
    }
    if(n<40) return null;
    return {cy:(y0+y1)/2/dpr, n:n};
  }
  var a=span(fpv,0,0), b=span(mask,4,18);
  if(!a||!b) return {none:true};
  return {a:Math.round(a.cy), b:Math.round(b.cy), h:Math.round(fpv.clientHeight),
          tick:(document.querySelector('[data-el="tick"]')||{}).textContent};
})()`;

(async () => {
  let l; for (let i = 0; i < 80; i++) { try { l = await get('/json/list'); if (l.length) break; } catch { /* 아직 */ } await sleep(300); }
  const ws = new WebSocket(l.find((x) => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const p = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } };
  await new Promise((r) => { ws.onopen = r; });
  const send = (m, q = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: q })); });
  const ev = async (x) => {
    const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
    return r.result.exceptionDetails ? null : r.result.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  console.log('챌린지               tick     1단 중심  2단 중심  세로차  캔버스h   비율   판정');
  let bad = 0;
  for (const cid of IDS) {
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` }); await sleep(600);
    await ev("try{localStorage.clear();localStorage.setItem('dtc:v1:guideSeen','1')}catch(e){}");
    await send('Page.navigate', { url: challengeUrl(PORT, cid) }); await sleep(2600);
    await ev('(function(){var b=document.querySelector(\'[data-el="howto-dismiss"]\'); if(b) b.click();})()');
    await sleep(300);
    await ev('document.querySelector(\'[data-el="go"]\').click()');
    let got = 0;
    for (let k = 0; k < SAMPLES; k++) {
      await sleep(650);
      const r = await ev(PROBE);
      if (!r || r.none) { console.log(cid.padEnd(20), '  (두 화면에 다 안 잡힘)'); continue; }
      const dy = r.b - r.a;
      const pct = (Math.abs(dy) / r.h) * 100;
      const ok = pct <= TOL_PCT;
      if (ok) got++;
      console.log(cid.padEnd(20), String(r.tick).padStart(7), String(r.a).padStart(9), String(r.b).padStart(9),
        String(dy).padStart(7), String(r.h).padStart(8), `${pct.toFixed(1)}%`.padStart(7), '  ', ok ? 'ok' : '실패');
    }
    if (got < NEED) { bad++; console.log(`${cid} — 성립한 표본 ${got}/${NEED} 부족`); }
  }
  if (!IDS.length) {
    console.log('\n잴 대상 0종 — 1단이 시뮬 화면인 챌린지가 목록에 없습니다.');
    console.log('두 단을 쓰는 챌린지가 다시 올라오면 이 검사가 저절로 다시 돕니다.');
    // 종료 코드 2 = skip. 0 으로 끝내면 요약표에 ok 로 적혀 깨져도 통과처럼 읽힌다(54차).
    ws.close(); chrome.kill(); process.exit(2);
  }
  console.log(`\n실패 ${bad}/${IDS.length} · 기준: 두 단의 세로 중심 차이가 캔버스 높이의 ${TOL_PCT}% 이내 · 표본 ${NEED}개 이상`);
  ws.close(); chrome.kill(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e.message); chrome.kill(); process.exit(1); });
