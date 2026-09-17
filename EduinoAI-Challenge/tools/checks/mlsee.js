/**
 * tools/checks/mlsee.js — 학습한 것이 화면에 닿는가 (55차 보강4 4-4).
 *
 * 배포본에서 "지금 보는 것" 의 세 막대가 전부 0 이고 확신도가 0% 인 채로 있었다.
 * 학습을 안 눌러서인지, 분류가 도는데 화면에 안 닿는 것인지를 눈으로는 가릴 수 없다.
 * 그래서 카메라가 있어야 도는 이 경로를 검사로 박는다.
 *
 * 헤드리스에는 카메라가 없으므로 크롬의 가짜 카메라를 쓴다 —
 * 세 가지 단색 장면이 3초씩 도는 y4m 을 만들어 물린다. 만드는 것은 '입력 영상'뿐이고,
 * 판정 수치는 전부 페이지가 낸 값을 읽어 온다. 이 파일은 아무것도 세지 않는다.
 *
 * 기준
 *   가. 카메라 끔            → 라벨 '모름' · 확신도 0% · 막대 합 0
 *   나. 카메라 켬 · 학습 전    → 위와 같다. 아직 모델이 없으므로 0 이 맞다
 *   다. 카메라 켬 · 학습 후    → 막대 합이 0 이 아닐 것 · 라벨이 '모름' 이 아닐 것
 *   그리고 장면을 바꾸면 라벨도 바뀔 것 — 한 값에 붙어 있으면 이어진 것이 아니다
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = Number(process.env.PORT || 8123);
const { challengeUrl } = require('./ids.js');
const CID = 'smartcity-drive';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 단색 세 장면이 SEC 초씩 도는 y4m. 색은 여기서 정한 입력값이고 판정에 쓰이지 않는다. */
const SCENES = [[200, 40, 40], [40, 190, 70], [50, 80, 220]];
function makeFakeCam(file) {
  const W = 160; const H = 120; const FPS = 10; const SEC = 3; const CYCLES = 6;
  const fd = fs.openSync(file, 'w');
  fs.writeSync(fd, `YUV4MPEG2 W${W} H${H} F${FPS}:1 Ip A1:1 C420\n`);
  const head = Buffer.from('FRAME\n');
  for (let c = 0; c < CYCLES; c++) {
    for (const [r, g, b] of SCENES) {
      const y = Math.max(0, Math.min(255, Math.round(0.299 * r + 0.587 * g + 0.114 * b)));
      const u = Math.max(0, Math.min(255, Math.round(-0.169 * r - 0.331 * g + 0.5 * b + 128)));
      const v = Math.max(0, Math.min(255, Math.round(0.5 * r - 0.419 * g - 0.081 * b - 0 + 128)));
      const plane = Buffer.concat([
        Buffer.alloc(W * H, y), Buffer.alloc((W * H) / 4, u), Buffer.alloc((W * H) / 4, v),
      ]);
      for (let i = 0; i < FPS * SEC; i++) { fs.writeSync(fd, head); fs.writeSync(fd, plane); }
    }
  }
  fs.closeSync(fd);
}

const cam = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mlsee-')), 'cam.y4m');
makeFakeCam(cam);
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new', '--remote-debugging-port=9309',
  '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  `--use-file-for-fake-video-capture=${cam}`, '--autoplay-policy=no-user-gesture-required',
  'about:blank'], { stdio: 'ignore' });
const get = (p) => new Promise((r, j) => http.get({ host: '127.0.0.1', port: 9309, path: p },
  (s) => { let b = ''; s.on('data', (c) => { b += c; }); s.on('end', () => r(JSON.parse(b))); }).on('error', j));

(async () => {
  let l; for (let i = 0; i < 80; i++) { try { l = await get('/json/list'); if (l.length) break; } catch (e) { /* 아직 */ } await sleep(300); }
  const ws = new WebSocket(l.find((x) => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const p = new Map(); let errs = 0;
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errs++;
    if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); }
  };
  await new Promise((r) => { ws.onopen = r; });
  const send = (m, q = {}) => new Promise((r) => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: q })); });
  const ev = async (x) => {
    const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
    return r.result.exceptionDetails ? null : r.result.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

  // 화면이 적어 둔 값을 읽는다. 이 검사는 세지 않는다.
  const see = () => ev(`(function(){
    var n=document.querySelector('[data-el="simsee"]');
    if(!n||n.hidden) return null;
    var bars=[].slice.call(document.querySelectorAll('[data-el="ss-bars"] .simsee__bar'))
      .map(function(b){ return Number((b.querySelector('em')||{}).textContent)||0; });
    return { label:(document.querySelector('[data-el="ss-label"]')||{}).textContent,
      conf: Number(String((document.querySelector('[data-el="ss-conf"]')||{}).textContent||'').replace('%',''))||0,
      sum: bars.reduce(function(a,v){return a+v;},0) };
  })()`);
  const scene = () => ev(`(function(){
    var c=document.querySelector('[data-el="camview-raw"]');
    if(!c||!c.width) return null;
    var d=c.getContext('2d').getImageData((c.width/2)|0,(c.height/2)|0,1,1).data;
    return [d[0],d[1],d[2]];
  })()`);
  const near = (c, w) => !!c && Math.abs(c[0] - w[0]) < 70 && Math.abs(c[1] - w[1]) < 70 && Math.abs(c[2] - w[2]) < 70;

  await send('Page.navigate', { url: challengeUrl(PORT, CID) });
  await sleep(3500);
  await ev(`(document.querySelector('[data-el="rules-close"]')||{click:function(){}}).click()`);
  await sleep(400);
  await ev('try{localStorage.clear()}catch(e){}');

  const rows = []; let bad = 0;
  const off = await see();
  const offOk = !!off && off.sum === 0 && off.label === '모름';
  if (!offOk) bad++;
  rows.push(['가. 카메라 끔', off, '막대 합 0 · 모름', offOk]);

  await ev(`(document.querySelector('[data-el="cam-start-main"]')||document.querySelector('[data-el="cam-start"]')||{click:function(){}}).click()`);
  await sleep(4000);
  const before = await see();
  const beforeOk = !!before && before.sum === 0;
  if (!beforeOk) bad++;
  rows.push(['나. 켬 · 학습 전', before, '막대 합 0 (모델이 없다)', beforeOk]);

  // 장면마다 최소 장수를 담는다. 지금 흐르는 장면을 보고 그 칸을 고른다.
  const got = [0, 0, 0];
  for (let k = 0; k < 400 && got.some((v) => v < 5); k++) {
    await sleep(250);
    const c = await scene();
    const idx = SCENES.findIndex((w) => near(c, w));
    if (idx < 0 || got[idx] >= 5) continue;
    await ev(`document.querySelectorAll('.traincard__head')[${idx}].click()`);
    await ev(`document.querySelector('[data-el="grab"]').click()`);
    got[idx]++;
  }
  const grabbed = got.every((v) => v >= 5);
  if (!grabbed) bad++;
  rows.push(['   장면 담기', { label: got.join('/'), conf: 0, sum: 0 }, '칸마다 5장', grabbed]);
  await ev(`document.querySelector('[data-el="learn"]').click()`);
  await sleep(1600);

  // 다·라 — 학습 뒤 두 장면에서 읽는다. 라벨이 장면을 따라 바뀌어야 한다.
  const seen = [];
  for (const t of [0, 2]) {
    let hit = null;
    for (let k = 0; k < 200 && !hit; k++) {
      await sleep(250);
      if (!near(await scene(), SCENES[t])) continue;
      await sleep(500);
      hit = await see();
    }
    const ok = !!hit && hit.sum > 0 && hit.label !== '모름';
    if (!ok) bad++;
    seen.push(hit ? hit.label : '(못 읽음)');
    rows.push([`${t === 0 ? '다' : '라'}. 켬 · 학습 후 · ${t === 0 ? '첫' : '셋째'} 장면`, hit, '막대 합 > 0 · 모름 아님', ok]);
  }
  const moved = seen[0] && seen[1] && seen[0] !== seen[1];
  if (!moved) bad++;
  rows.push(['   장면을 바꾸면', { label: seen.join(' → '), conf: 0, sum: 0 }, '라벨이 따라 바뀔 것', !!moved]);

  console.log('경우                              라벨      확신도  막대 합   기대                    판정');
  for (const [name, v, want, ok] of rows) {
    console.log(name.padEnd(33), String(v ? v.label : '—').padEnd(9),
      String(v ? `${v.conf}%` : '—').padStart(6), String(v ? v.sum : '—').padStart(8), '  ',
      want.padEnd(23), ok ? 'ok' : '실패');
  }
  if (errs) bad++;
  console.log(`\n실패 ${bad} · 콘솔 예외 ${errs} · 기준: 학습 전에는 0, 학습 뒤에는 0 이 아니고 장면을 따라 바뀔 것`);
  ws.close(); chrome.kill();
  try { fs.rmSync(path.dirname(cam), { recursive: true, force: true }); } catch (e) { /* 지워지면 그만 */ }
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error(e.message); chrome.kill();
  try { fs.rmSync(path.dirname(cam), { recursive: true, force: true }); } catch (e2) { /* 같음 */ }
  process.exit(1);
});
