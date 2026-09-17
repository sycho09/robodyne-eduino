/**
 * tools/checks/guide.js — 안내(guide)가 실제로 무언가를 짚는가.
 *
 * 54차에 스타터에서 주석을 없애면서 `// [설정]` 마커가 사라졌고, 마커로 자리를 찾던
 * 안내 단계 넷이 조용히 아무 데도 못 짚게 됐다. 검사가 없어 두 차수를 지나갔다.
 * 그래서 짚는 자리를 코드 문자열 앵커로 바꾸고(57-E), 그 앵커가 정말 걸리는지를 잰다.
 *
 * 재는 것 둘 — 화면이 쓰는 그 함수(editor.js 의 anchorLine)와 그 매니페스트로 잰다.
 *   ① anchor 단계: 짚은 줄 번호가 1 이상인가
 *   ② el 단계: 그 data-el 이 이 챌린지 화면에 실제로 있는가
 * 잰 단계가 0 이면 통과가 아니라 실패다(57차 보강2 — 아무것도 재지 않은 검사).
 */
const { spawn } = require('child_process'); const http = require('http');
const PORT = Number(process.env.PORT || 8123);
const { challengeIds, skipNote, challengeUrl, manifestUrl } = require('./ids.js');
const IDS = challengeIds('안내 짚기');
(async () => {
 const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
 const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new','--remote-debugging-port=9433','--no-sandbox','--disable-gpu','--window-size=1440,900','--hide-scrollbars','about:blank'], {stdio:'ignore'});
 const get=(p)=>new Promise((r,j)=>http.get({host:'127.0.0.1',port:9433,path:p},(s)=>{let b='';s.on('data',c=>b+=c);s.on('end',()=>r(JSON.parse(b)));}).on('error',j));
 let l; for(let i=0;i<80;i++){try{l=await get('/json/list');if(l.length)break;}catch{} await sleep(300);}
 const ws=new WebSocket(l.find(x=>x.type==='page').webSocketDebuggerUrl); let id=0; const p=new Map(); let errs=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);
  if(m.method==='Runtime.exceptionThrown') errs.push('EXC '+String((m.params.exceptionDetails.exception||{}).description||'').split('\n')[0]);
  if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error') errs.push('LOG '+(m.params.args||[]).map(a=>String(a.description||a.value)).join(' ').split('\n')[0]);
  if(m.id&&p.has(m.id)){p.get(m.id)(m);p.delete(m.id);}};
 await new Promise(r=>ws.onopen=r);
 const send=(m,q={})=>new Promise(r=>{const i=++id;p.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:q}));});
 const ev=async(x)=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});
  if(r.result.exceptionDetails) return 'THREW '+String((r.result.exceptionDetails.exception||{}).description||'').slice(0,200);
  return r.result.result.value;};
 await send('Page.enable'); await send('Runtime.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});

 let bad = 0; let measured = 0;
 console.log('챌린지              단계  앵커  짚은 줄            el   없는 el  판정');
 for (const cid of IDS) {
  errs = [];
  await send('Page.navigate',{url:challengeUrl(PORT, cid)}); await sleep(2600);
  const m = await ev(`(async function(){
    var L = await import('/src/challenges/loader.js');
    var E = await import('/src/ui/panels/editor.js');
    var ch = await fetch('${manifestUrl(cid)}').then(function(r){return r.json()});
    var kit = await L.loadKit(ch.kit_id);
    L.applyTemplates(ch, kit);
    var src = (ch.starter_code && ch.starter_code.source) || '';
    var steps = ch.guide || [];
    var anchors = [], els = [], missEl = [];
    steps.forEach(function(g){
      var t = g.target || {};
      if (t.anchor) anchors.push({ find: t.anchor.find, line: E.anchorLine(src, t.anchor) + 1 });
      else if (t.el) { els.push(t.el); if (!document.querySelector('[data-el="' + t.el + '"]')) missEl.push(t.el); }
    });
    return { steps: steps.length, anchors: anchors, els: els.length, missEl: missEl };
  })()`);
  if (typeof m === 'string' || !m) { bad++; console.log(cid.padEnd(19), '  —     —   '+String(m).slice(0,40)); continue; }
  const lines = m.anchors.map((a) => `${a.find}#${a.line}`).join(' ');
  const badLine = m.anchors.filter((a) => a.line < 1);
  measured += m.anchors.length + m.els;
  const ok = badLine.length === 0 && m.missEl.length === 0 && errs.length === 0;
  if (!ok) bad++;
  console.log(cid.padEnd(19), String(m.steps).padStart(3), String(m.anchors.length).padStart(5),
    ' ', (lines||'—').padEnd(26), String(m.els).padStart(3), String(m.missEl.length).padStart(7), ' ',
    ok ? 'ok' : '실패 ' + (badLine.map((a)=>'짚을 자리를 못 찾음: '+a.find).join(' · ') || m.missEl.map((e)=>'없는 el: '+e).join(' · ') || errs[0]));
 }
 // 잰 단계가 하나도 없으면 통과가 아니다 — 그것이 54차에 이 짚기가 죽은 채 지나간 방식이다.
 if (measured === 0) { bad++; console.log('\n잰 단계 0개 — 안내 단계를 하나도 못 읽었습니다. 통과로 세지 않습니다.'); }
 { const sk = skipNote('안내 짚기'); if (sk) console.log(`\n${sk}`); }
 console.log(`\n실패 ${bad}/${IDS.length} · 잰 단계 ${measured}개 · 기준: anchor 단계는 짚은 줄이 1 이상 · el 단계는 그 요소가 화면에 있을 것 · 잰 단계가 0이면 실패`);
 ws.close(); chrome.kill(); process.exit(bad ? 1 : 0);
})().catch((e)=>{ console.error(e.message); process.exit(1); });
