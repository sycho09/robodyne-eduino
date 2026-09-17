/**
 * tools/checks/record.js — 기록이 있는 상태 검증.
 *
 * 45차에 고친 버그는 기록이 하나라도 있어야 드러났다. 기록이 없으면 그 줄을 지나가므로
 * 43차·44차의 모든 검사를 통과했고 학생 화면만 흰 화면이 됐다.
 *
 * 그래서 9종 각각에 가짜 기록 둘을 심고 연다 — 이탈 0 인 것 하나, 이탈이 있는데 더 빠른 것
 * 하나. 화면이 뜨는지, 그리고 최고 기록이 자격 있는 쪽으로 나오는지를 함께 본다.
 */
// 46차 파트5 — "저장된 기록이 있는 상태" 검증.
// 기록이 하나도 없으면 지나가는 코드가 있다. 45차 버그(자격 규칙 선언 전에 첫 렌더)가
// 두 차수를 통과한 이유다. 9개 챌린지 각각에 가짜 기록을 심고 화면이 정상으로 뜨는지 본다.
const { spawn } = require('child_process'); const http=require('http');
const PORT=Number(process.env.PORT||8123);
const { challengeIds, skipNote, challengeUrl, manifestUrl, kitUrl, manifestPath, storageKey } = require('./ids.js');
const IDS=challengeIds('기록 있는 상태');
// 자취 결정론은 자취를 남기는 챌린지 하나로 잰다. 어느 챌린지가 남기는지는 매니페스트가 정한다.
const DET_ID = (() => {
  const fs = require('fs');
  // 폴더를 훑지 않는다. 매니페스트가 어디 있는지는 목록이 안다(57-G).
  for (const id of IDS) {
    const c = JSON.parse(fs.readFileSync(manifestPath(id), 'utf8'));
    if (((c.record || {}).fields || []).includes('path_image')) return id;
  }
  throw new Error('자취(path_image)를 남기는 챌린지가 하나도 없습니다. 검사가 잴 것이 없습니다.');
})();
// 이탈 0 한 건 + 이탈 2 인데 더 빠른 것 한 건. 자격 규칙이 실제로 갈라내는지도 함께 본다.
const ROWS=[{ticks:1711,offtrack:0,violations:0},{ticks:1200,offtrack:2,violations:3}];
(async()=>{
 const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
 const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new','--remote-debugging-port=9401','--no-sandbox','--disable-gpu','--window-size=1440,900','--hide-scrollbars','about:blank'],{stdio:'ignore'});
 const get=(p)=>new Promise((r,j)=>http.get({host:'127.0.0.1',port:9401,path:p},(s)=>{let b='';s.on('data',c=>b+=c);s.on('end',()=>r(JSON.parse(b)));}).on('error',j));
 let l; for(let i=0;i<80;i++){try{l=await get('/json/list');if(l.length)break;}catch{} await sleep(300);}
 const ws=new WebSocket(l.find(x=>x.type==='page').webSocketDebuggerUrl); let id=0;const p=new Map(); let errs=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);
  if(m.method==='Runtime.exceptionThrown') errs.push('EXC '+String((m.params.exceptionDetails.exception||{}).description||m.params.exceptionDetails.text||'').split('\n')[0]);
  if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error') errs.push('LOG '+(m.params.args||[]).map(a=>String(a.description||a.value)).join(' ').split('\n')[0]);
  if(m.id&&p.has(m.id)){p.get(m.id)(m);p.delete(m.id);}};
 await new Promise(r=>ws.onopen=r);
 const send=(m,q={})=>new Promise(r=>{const i=++id;p.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:q}));});
 const ev=async(x)=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});
  return r.result.exceptionDetails?'THREW':r.result.result.value;};
 await send('Page.enable');await send('Runtime.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:`http://127.0.0.1:${PORT}/`}); await sleep(700);
 console.log('챌린지              화면  기록카드  최고기록                                 오류  판정');
 let bad=0;
 for(const cid of IDS){
  const hist=ROWS.map((r,i)=>({attempt:i+1,ticks:r.ticks,lap_ticks:r.ticks,offtrack:r.offtrack,violations:r.violations,
    at:1,snapshot:'s'+i,engine_version:2,challenge_version:null,scoring_version:2,seed:0}));
  await ev(`(async function(){
    localStorage.clear(); localStorage.setItem('dtc:v1:guideSeen','1');
    var ch=await fetch('${manifestUrl(cid)}').then(function(r){return r.json()});
    var h=${JSON.stringify(hist)}; h.forEach(function(r){r.challenge_version=ch.version;});
    localStorage.setItem('${storageKey(cid)}', JSON.stringify({history:h, howtoSkipped:true}));
  })()`);
  errs=[];
  await send('Page.navigate',{url:challengeUrl(PORT, cid)}); await sleep(3000);
  const m = await ev(`(function(){
    var shell=document.querySelector('.shell');
    var card=document.querySelector('[data-el="record-plain"]');
    var best=document.querySelector('[data-el="rec-best"]');
    var old=document.querySelector('[data-el="best-fold"]');
    return {shell:!!shell, card: card? (card.hidden?'감춤':'보임') : '없음',
            best: best? best.textContent.trim() : (old? old.textContent.replace(/\s+/g,' ').trim().slice(0,30) : '없음')};
  })()`);
  const ok = m && m.shell && errs.length===0;
  if(!ok) bad++;
  console.log(cid.padEnd(19), (m&&m.shell?'  ok':'  실패').padEnd(6), String(m&&m.card).padEnd(9),
    String(m&&m.best).padEnd(40), String(errs.length).padStart(4), '  ', ok?'ok':'실패');
  errs.slice(0,2).forEach(x=>console.log('      ', x.slice(0,140)));
 }
 // 57-C 파트3 — 저장한 좌표는 언제 그려도 같은 그림이 나와야 한다.
 // 같은 배열을 두 번 그려 픽셀이 한 바이트라도 다르면 실패다. 벽시계도 난수도 끼어들면 안 된다.
 const det = await ev(`(async function(){
   var mm = await import('/src/ui/panels/minimap.js');
   var tr = await import('/src/engine/track.js');
   var ch = await fetch('${manifestUrl(DET_ID)}').then(function(r){return r.json()});
   var kit = await fetch('${kitUrl()}').then(function(r){return r.json()});
   var track = tr.buildTrack(ch.scene);
   var samples = [];
   for (var t = 0; t <= 600; t += 5) samples.push([t, Math.round(Math.cos(t/95)*220), Math.round(Math.sin(t/95)*220), (t*137)%360000]);
   function simLike(){ return { challenge: ch, kit: kit, track: track,
     trail: samples.map(function(s){ return {x:s[1], y:s[2]}; }),
     vehicle: {x: samples[samples.length-1][1], y: samples[samples.length-1][2], heading_mdeg: samples[samples.length-1][3]},
     offtrack: {active:false} }; }
   function shot(){
     var c = document.createElement('canvas'); c.width = 320; c.height = 320;
     var g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0,0,320,320);
     mm.drawMinimap(g, simLike(), 320, 320, null, null);
     return g.getImageData(0,0,320,320).data;
   }
   var a = shot(); var b = shot();
   if (a.length !== b.length) return {ok:false, diff:-1, colors:0};
   var diff = 0; for (var i=0;i<a.length;i++) if (a[i]!==b[i]) diff++;
   // 바탕만 칠하고 끝나도 두 장은 같다. 그건 결정론이 아니라 아무것도 안 그린 것이다.
   // 그래서 색 가짓수도 함께 본다 — 코스와 자취와 차가 그려졌으면 여러 색이 나온다.
   var seen = {}; var colors = 0;
   for (var j=0;j<a.length;j+=4) { var k = a[j]+','+a[j+1]+','+a[j+2];
     if (!seen[k]) { seen[k] = 1; colors++; } }
   return {ok: diff===0 && colors >= 4, diff: diff, colors: colors};
 })()`);
 // 빈 그림이 두 번 같은 것은 결정론이 아니라 아무것도 안 그린 것이다. 색 가짓수도 함께 본다.
 const detOk = !!(det && det.ok);
 if (!detOk) bad++;
 console.log(`자취 결정론          ${detOk ? '  ok' : '  실패'}   같은 좌표 두 번 · 다른 화소 ${det ? det.diff : '측정 실패'} · 색 ${det ? det.colors : 0}가지(4 이상)`);

 // 57차 — 이 검사가 건너뛴 챌린지와 그 사유. 조용히 빠지면 '통과' 로 읽힌다.
 { const sk = skipNote('기록 있는 상태'); if (sk) console.log(`\n${sk}`); }
 console.log(`실패 ${bad}/${IDS.length + 1} · 기준: 기록이 있는 상태에서 화면이 뜨고 콘솔 오류 0 · 같은 좌표는 같은 그림`);
 ws.close(); chrome.kill(); process.exit(bad?1:0);
})();
