/**
 * tools/checks/cold.js — 콜드 캐시 검증.
 *
 * 에셋 로더에 일부러 지연을 넣어(짧게·길게) 도착한 뒤 첫 프레임을 본다.
 * 39차에 처음 여는 브라우저에서만 폴백 화면이 남는 레이스가 있었다. 네트워크를 조이지 않고
 * 로더 층에서 늦추는 이유는, 늦는 것이 원인이 아니라 "늦게 온 뒤 다시 그리지 않는 것" 이
 * 원인이었기 때문이다.
 *
 * 절대값 하한만 두면 폴백 화면이 우연히 그 선을 넘는 챌린지를 놓친다 — 실제로 놓쳤다.
 * 그래서 렌더 검증이 낸 워밍값의 90% 를 기준으로 삼는다.
 *
 * 55차 보강3 — 색을 세는 식은 viewcolors.js 하나가 소유한다(렌더 검증과 같은 것을 센다).
 * 화면을 찍어서(Page.captureScreenshot) 세지 않는 이유: 스크린샷은 다음 프레임을 기다리므로
 * '지연 중' 상태를 못 잡는다. 이 검사의 값어치가 바로 거기에 있다(39차) — 늦게 온 뒤 다시
 * 그리지 않는 것을 잡는 검사이므로, 늦는 동안의 화면을 볼 수 있어야 한다.
 * getImageData 는 그 순간의 캔버스를 그대로 읽으므로 기다리지 않는다.
 */
// 39차 파트2 — 콜드 캐시 순회.
// 에셋을 로더에서 일부러 늦춘 뒤(짧은 지연·긴 지연) 도착 후 첫 프레임을 검사한다.
// 기준: 지연 없이 잰 값(워밍)의 90% 이상까지 회복할 것 · 오류 0 · 예외 0.
// 절대값 하한만 두면 폴백 화면이 우연히 그 선을 넘는 챌린지를 놓친다 — 실제로 놓쳤다.
const { spawn } = require('child_process'); const http=require('http'); const fs=require('fs');
const PORT=Number(process.env.PORT||8123);
const MIN_COLORS=24;
// 지연 두 가지 x (기본 · 배경 층). 55차 보강3 — ?layer=1 은 배경을 캔버스 밖으로 뺀다.
// 그 길에도 "늦게 온 뒤 다시 그리는가" 가 성립해야 하므로 함께 훑는다.
// 55차 보강5 — 배경 층은 이제 매니페스트가 챌린지별로 켠다(scene.ui.bg_layer).
// '끔' 을 빈 문자열로 두면 스마트시티에서는 끈 것이 아니다. 두 길 다 훑도록 명시한다.
const CASES=[
  { d: 400, q: '&layer=0' }, { d: 2500, q: '&layer=0' },
  { d: 400, q: '&layer=1' }, { d: 2500, q: '&layer=1' },
];
/** 기준값은 길마다 다르다 — 배경이 캔버스 안에 있느냐 밖에 있느냐로 세는 자리가 달라진다. */
const warmOf = (w, cid, q) => {
  const v = w[cid];
  if (typeof v === 'number') return v;          // 옛 모양(길 하나)
  return (v && (v[q] !== undefined ? v[q] : v[''])) || 0;
};
const { challengeIds, skipNote, challengeUrl } = require('./ids.js');
const { VIEW_COLORS } = require('./viewcolors.js');   // 렌더 검증과 같은 것을 센다
const IDS=challengeIds('콜드 캐시');
const ALL_IDS=challengeIds();   // 딥링크는 건너뛴 것까지 전부 잰다
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new','--remote-debugging-port=9303','--no-sandbox','--disable-gpu','--window-size=1440,900','--hide-scrollbars','about:blank'],{stdio:'ignore'});
const get=(p)=>new Promise((r,j)=>http.get({host:'127.0.0.1',port:9303,path:p},(s)=>{let b='';s.on('data',c=>b+=c);s.on('end',()=>r(JSON.parse(b)));}).on('error',j));
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{ let l; for(let i=0;i<60;i++){try{l=await get('/json/list');if(l.length)break;}catch{} await sleep(300);}
 const ws=new WebSocket(l.find(x=>x.type==='page').webSocketDebuggerUrl); let id=0;const p=new Map(); let errs=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);
  if(m.method==='Runtime.exceptionThrown') errs.push('EXC '+String((m.params.exceptionDetails.exception||{}).description||'').slice(0,140));
  if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error') errs.push('LOG '+m.params.args.map(a=>String(a.value||a.description||'')).join(' ').slice(0,140));
  if(m.id&&p.has(m.id)){p.get(m.id)(m);p.delete(m.id);}};
 await new Promise(r=>ws.onopen=r);
 const send=(m,q={})=>new Promise(r=>{const i=++id;p.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:q}));});
 const ev=async(x)=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});
  if(r.result.exceptionDetails) return null; return r.result.result.value;};
 const colors=()=>ev(VIEW_COLORS);
 // 52차 — 오류는 시리얼 모니터의 [오류] 줄로 센다(오류 탭은 없앴다).
 const ecount=()=>ev(`document.querySelectorAll('.serial__line--오류').length`);
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 await send('Network.setCacheDisabled',{cacheDisabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 let bad=0;
 // 기준값은 앞서 돈 렌더 검증(정상 로드)이 남긴 값이다.
 // 같은 실행 안에서 재면 로드가 망가졌을 때 기준까지 같이 망가져 검사가 무력해진다.
 const warm=JSON.parse(fs.readFileSync(__dirname+'/.color-baseline.json','utf8'));
 console.log('챌린지              지연  배경층  지연중 색  도착후 색  워밍 색  오류  예외  판정');
 for(const cid of IDS){
   for(const C of CASES){
     errs=[];
     await send('Page.navigate',{url:challengeUrl(PORT, cid, `?assetdelay=${C.d}${C.q}`)});
     await sleep(Math.max(250, C.d-200));     // 아직 에셋이 오기 전
     const during = await colors();
     await sleep(C.d + 1800);                 // 도착하고도 남을 시간
     const after = await colors();
     const ce = await ecount();
     const want = warmOf(warm, cid, C.q);
     const ok = after >= MIN_COLORS && after >= want*0.9 && ce === 0 && errs.length === 0;
     if(!ok) bad++;
     console.log(cid.padEnd(19), String(C.d).padStart(5), (C.q.indexOf('layer=1')>=0?'  켬':'  끔').padStart(6),
       String(during).padStart(9), String(after).padStart(10),
       String(want).padStart(8), String(ce).padStart(6), String(errs.length).padStart(5), ' ', ok?'ok':'실패 '+(errs[0]||''));
   }
 }
 // ── 57차 보강3 — 딥링크로 직접 들어가는 길 ──────────────────────────────
 // SPA 안에서 눌러 들어가면 셸은 이미 떠 있다. 주소를 직접 치거나 새로고침하면 서버가
 // 그 주소에 무엇을 주느냐가 그대로 화면이 된다 — 그 길을 여태 아무도 재지 않았다.
 // 기준 셋: HTTP 200 · 앱 셸이 index 일 것 · 그 셸이 index.html 과 같은 자산을 물 것.
 let deepBad = 0;
 let deepSeen = 0;
 console.log('\n딥링크(주소 직접 진입)');
 console.log('챌린지              HTTP  셸           스타일시트  적용됨  오류  판정');
 // 셸 두 장의 자산 목록이 어긋나면 그 화면만 CSS 없이 뜬다(57차에 scout.css 가 그랬다).
 const assetsOf = (f) => (fs.readFileSync(`${__dirname}/../../${f}`, 'utf8')
   .match(/(?:href|src)="([^"]+)"/g) || []).filter((x) => !x.includes('data:')).sort().join(' ');
 const shellSame = assetsOf('index.html') === assetsOf('404.html');
 // 딥링크는 카메라도 색 기준값도 필요 없다. 주소가 열리는지만 본다 —
 // 그래서 색 검증에서 건너뛴 챌린지까지 여섯 종 전부 잰다.
 for (const cid of ALL_IDS) {
   errs = [];
   const url = challengeUrl(PORT, cid);
   const status = await new Promise((res) => {
     http.get(url, (r) => { r.resume(); res(r.statusCode); }).on('error', () => res(0));
   });
   await send('Page.navigate', { url });
   await sleep(2000);
   const shell = await ev(`(document.querySelector('meta[name="dtc-shell"]')||{}).content||'없음'`);
   const sheets = await ev(`document.querySelectorAll('link[rel="stylesheet"]').length`);
   // 스타일이 실제로 먹었는가 — 토큰 변수 하나가 살아 있으면 CSS 가 붙은 것이다.
   const styled = await ev(`getComputedStyle(document.documentElement).getPropertyValue('--c-bg').trim().length>0`);
   deepSeen++;
   const ok = status === 200 && shell === 'index' && !!styled && errs.length === 0 && shellSame;
   if (!ok) deepBad++;
   console.log(cid.padEnd(19), String(status).padStart(4), String(shell).padEnd(13),
     String(sheets).padStart(9), String(styled ? '예' : '아니오').padStart(7),
     String(errs.length).padStart(5), ' ', ok ? 'ok' : `실패 ${!shellSame ? '(셸 두 장의 자산 목록이 다름)' : (errs[0] || '')}`);
 }
 if (!deepSeen) { deepBad++; console.log('  잰 경로 0개 — 통과로 세지 않습니다.'); }
 // 57차 보강4 — 이 줄은 로컬 정적 서버(tools/checks/serve.js) 기준이다. 그 서버는 SPA 폴백을
 // 스스로 흉내 내므로 여기서 200 이 나와도 배포본이 같다는 뜻이 아니다. 배포본의 라우팅은
 // vercel.json 이 정하고, 그것이 실제로 먹는지는 배포본에서만 판정한다.
 console.log(`딥링크 ${deepSeen}개 · 실패 ${deepBad} · 기준: HTTP 200 · 셸 index · CSS 적용 · 셸 두 장의 자산 목록이 같을 것`);
 console.log('  ※ 로컬 서버 기준입니다. 배포본 라우팅(vercel.json)의 합격 판정은 배포본에서만 냅니다.');
 bad += deepBad;

 // 57차 — 이 검사가 건너뛴 챌린지와 그 사유. 조용히 빠지면 '통과' 로 읽힌다.
 { const sk = skipNote('콜드 캐시'); if (sk) console.log(`\n${sk}`); }
 console.log(`\n실패 ${bad}/${IDS.length*CASES.length + deepSeen} · 기준: 도착 후 색이 워밍값의 90% 이상 · 오류 0 · 예외 0 · 딥링크 ${deepSeen}개 전부 200/index/CSS`);
 ws.close();chrome.kill();process.exit(bad?1:0);
})().catch(e=>{console.error(e.message);chrome.kill();process.exit(1);});
