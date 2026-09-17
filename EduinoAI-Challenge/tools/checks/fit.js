/**
 * tools/checks/fit.js — 세로 넘침.
 *
 * 세 칸(코드 · 시뮬 · 관제) 어느 것도 스크롤이 생기면 안 된다. 오른쪽 칸이 넘치면
 * 기록이나 탑뷰가 화면 밖으로 밀린다 — 배포본에서 실제로 그랬다(173 · 212 · 501px).
 * 네 크기에서 잰다: 1280x720 · 1366x768 · 1440x900 · 1920x1080.
 *
 * 화면 검사에서 떼어냈다(54차). 한 검사가 네 크기 x 5종을 하나씩 다시 여느라
 * 20초 → 65초가 됐고, 구성이 그대로인지 보는 일과 자리가 모자라는지 보는 일은 성격이 다르다.
 */
const { spawn } = require('child_process'); const http=require('http');
const PORT=Number(process.env.PORT||8123);
const { challengeIds, skipNote, challengeUrl } = require('./ids.js');
const IDS=challengeIds('세로 넘침');
const SIZES=[[1280,720],[1366,768],[1440,900],[1920,1080]];
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new','--remote-debugging-port=9312','--no-sandbox','--disable-gpu','--hide-scrollbars','about:blank'],{stdio:'ignore'});
const get=(p)=>new Promise((r,j)=>http.get({host:'127.0.0.1',port:9312,path:p},(s)=>{let b='';s.on('data',c=>b+=c);s.on('end',()=>r(JSON.parse(b)));}).on('error',j));
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{ let l; for(let i=0;i<60;i++){try{l=await get('/json/list');if(l.length)break;}catch{} await sleep(300);}
 const ws=new WebSocket(l.find(x=>x.type==='page').webSocketDebuggerUrl); let id=0;const p=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&p.has(m.id)){p.get(m.id)(m);p.delete(m.id);}};
 await new Promise(r=>ws.onopen=r);
 const send=(m,q={})=>new Promise(r=>{const i=++id;p.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:q}));});
 const ev=async(x)=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});
  return r.result.exceptionDetails?'THREW':r.result.result.value;};
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.navigate',{url:`http://127.0.0.1:${PORT}/`}); await sleep(700);
 await ev("try{localStorage.clear();localStorage.setItem('dtc:v1:guideSeen','1')}catch(e){}");
 let over=0;
 console.log('세로 넘침 (scrollHeight - clientHeight · 왼쪽/가운데/오른쪽)');
 console.log('챌린지              ' + SIZES.map(([w,h])=>`${w}x${h}`.padStart(12)).join(''));
 for(const cid of IDS){
   const cells=[];
   for(const [w,h] of SIZES){
     await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});
     await send('Page.navigate',{url:challengeUrl(PORT, cid)}); await sleep(2200);
     // 규칙 창이 첫 방문에 뜬다. 칸 높이를 재는 데 방해되므로 닫고 잰다.
     await ev(`(document.querySelector('[data-el="rules-close"]')||{click(){}}).click()`);
     await sleep(300);
     // 57차 보강1 — 화면이 두 가지다. 달리기는 3분할(.pane), 탐사는 3열(.scout__col*).
     // 한쪽 선택자만 보면 다른 쪽에서 "칸을 못 찾아 0" 이 되어 통과한 것처럼 읽힌다.
     // 그래서 무엇을 몇 칸 쟀는지도 함께 받아, 0칸이면 실패로 센다.
     const r = await ev(`(function(){
       var panes=[].slice.call(document.querySelectorAll('.shell__body > .pane'));
       if(!panes.length) panes=[].slice.call(document.querySelectorAll('.scout__colL, .scout__colC, .scout__colR'));
       if(!panes.length) return 'NONE';
       return panes.map(function(p){return Math.max(0, p.scrollHeight - p.clientHeight);}).join('/');
     })()`);
     if(r==='NONE'){ over++; cells.push('칸없음'.padStart(12)); continue; }
     const worst = String(r).split('/').map(Number).reduce((a,b)=>Math.max(a,b),0);
     if(worst>0) over++;
     cells.push(String(r).padStart(12));
   }
   console.log(cid.padEnd(19), cells.join(''));
 }
 // 57차 — 이 검사가 건너뛴 챌린지와 그 사유. 조용히 빠지면 '통과' 로 읽힌다.
 { const sk = skipNote('세로 넘침'); if (sk) console.log(`\n${sk}`); }
 console.log(`\n실패 ${over}/${IDS.length*SIZES.length} · 기준: 세 칸 모두 넘침 0 · 잰 칸이 0개면 실패`);
 ws.close();chrome.kill();process.exit(over?1:0);
})().catch(e=>{console.error(e.message);chrome.kill();process.exit(1);});
