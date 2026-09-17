/**
 * tools/checks/render.js — 렌더 검증.
 *
 * 9종을 열어 시뮬 화면 캔버스 가운데 절반의 색 가짓수를 센다. 배경 사진이 안 오면 화면이 회색
 * 폴백으로 떨어지는데, 코드도 데이터도 멀쩡해 보여서 눈으로는 놓친다(37차에 놓쳤다).
 * 색이 몇 가지인지가 "진짜 배경이 그려졌는가" 를 가장 싸게 가른다.
 *
 * 통과하면 색 기준값을 .color-baseline.json 에 적는다 — 콜드 캐시 검증이 그것을 읽는다.
 * 깨진 화면이 기준이 되지 않도록 통과했을 때만 갱신한다.
 */
// 헤드리스 순회 + "시뮬 화면이 실제로 그려졌는가" 검사.
// 캔버스 가운데 절반을 훑어 서로 다른 색이 몇 가지인지 센다. 빈 화면·단색·투명이면 실패다.
// 기준은 모든 챌린지에 같다.
// 55차 보강3 — 무엇을 훑는지는 viewcolors.js 한 곳이 정한다. 배경이 캔버스 밖으로 나가는
// 경우(?layer=1)에도 같은 값을 세야 하므로 검사 두 곳에 식을 나눠 적지 않는다.
const { spawn } = require('child_process'); const http=require('http'); const fs=require('fs');
const PORT=Number(process.env.PORT||8123);
const MIN_COLORS = 24;
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new','--remote-debugging-port=9297','--no-sandbox','--disable-gpu','--window-size=1440,900','--hide-scrollbars','about:blank'],{stdio:'ignore'});
const get=(p)=>new Promise((r,j)=>http.get({host:'127.0.0.1',port:9297,path:p},(s)=>{let b='';s.on('data',c=>b+=c);s.on('end',()=>r(JSON.parse(b)));}).on('error',j));
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const { challengeIds, skipNote, challengeUrl, manifestUrl } = require('./ids.js');
const { VIEW_COLORS } = require('./viewcolors.js');   // 렌더·콜드 캐시가 같은 것을 센다
const IDS=challengeIds('렌더');
(async()=>{
 let l; for(let i=0;i<60;i++){try{l=await get('/json/list');if(l.length)break;}catch{} await sleep(300);}
 const ws=new WebSocket(l.find(x=>x.type==='page').webSocketDebuggerUrl);
 let id=0;const p=new Map(); let errs=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);
  if(m.method==='Runtime.exceptionThrown') errs.push('EXC '+String((m.params.exceptionDetails.exception||{}).description||'').slice(0,120));
  if(m.method==='Runtime.consoleAPICalled' && m.params.type==='error') errs.push('LOG '+m.params.args.map(a=>String(a.value||a.description||'')).join(' ').slice(0,120));
  if(m.id&&p.has(m.id)){p.get(m.id)(m);p.delete(m.id);}};
 await new Promise(r=>ws.onopen=r);
 const send=(m,q={})=>new Promise(r=>{const i=++id;p.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:q}));});
 const ev=async(x)=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});
  if(r.result.exceptionDetails) return 'THREW '+String((r.result.exceptionDetails.exception||{}).description||'').slice(0,160);
  return r.result.result.value;};
 await send('Page.enable');await send('Runtime.enable');
 await send('Network.enable'); await send('Network.setCacheDisabled',{cacheDisabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 let bad=0; const base={};
 // 55차 보강5 — 배경 층은 매니페스트가 켜고(scene.ui.bg_layer) 주소가 이긴다.
 // 길이 셋이라 기준값도 셋이다. 하나로 재면 다른 길이 90% 기준에 걸린다.
 const MODES=['', '&layer=0', '&layer=1'];
 console.log('챌린지              길      색 수  렌더 경로  오류  예외  판정');
 for(const cid of IDS){
  base[cid]={};
  for(const mode of MODES){
   errs=[];
   await send('Page.navigate',{url:challengeUrl(PORT, cid, `?x=1${mode}`)}); await sleep(1200);
   // 기준값이 되는 값이므로 '다 그려진 뒤' 를 기다린다. 고정 시간으로 끊으면 배경이 늦게 온 날
   // 낮은 값이 기준으로 굳어, 그 뒤로 콜드 캐시 검사가 무력해진다(실제로 196 이 잡혔다).
   // 색 수가 세 번 연속 늘지 않으면 다 그려진 것으로 본다.
   let colors = -1; let still = 0;
   for (let t = 0; t < 32; t++) {
     const now = await ev(VIEW_COLORS);
     still = (typeof now === 'number' && now <= colors) ? still + 1 : 0;
     if (typeof now === 'number' && now > colors) colors = now;
     if (still >= 3 && colors >= MIN_COLORS) break;
     await sleep(250);
   }
   // 이 챌린지가 배경 에셋을 쓰기로 되어 있는가 — 매니페스트가 답한다.
   const wantsBg = await ev(`fetch('${manifestUrl(cid)}').then(function(r){return r.json()}).then(function(j){return !!(j.scene.assets&&j.scene.assets.background)})`);
   // 52차 — 오류 탭을 없애고 로그를 시리얼 모니터로 모았다. 오류는 [오류] 줄 수로 센다.
   const codeErr = Number(await ev("document.querySelectorAll('.serial__line--오류').length")||0);
   const ok = colors >= MIN_COLORS && codeErr === 0 && errs.length === 0;
   base[cid][mode]=colors;
   if(!ok) bad++;
   console.log(cid.padEnd(19), (mode||'기본').padEnd(9), String(colors).padStart(5), (wantsBg?'   배경':'   기본').padStart(9), String(codeErr).padStart(6), String(errs.length).padStart(5), ' ', ok?'ok':'실패 '+(errs[0]||''));
  }
 }
 if(!bad) fs.writeFileSync(__dirname+'/.color-baseline.json', JSON.stringify(base));   // 통과했을 때만 기준을 갱신한다
 // 57차 — 이 검사가 건너뛴 챌린지와 그 사유. 조용히 빠지면 '통과' 로 읽힌다.
 { const sk = skipNote('렌더'); if (sk) console.log(`\n${sk}`); }
 console.log(`실패 ${bad}/${IDS.length*MODES.length} · 기준: 가운데 절반에 서로 다른 색 ${MIN_COLORS}가지 이상 · 오류 0 · 예외 0`);
 ws.close();chrome.kill();process.exit(bad?1:0);
})().catch(e=>{console.error(e.message);chrome.kill();process.exit(1);});
