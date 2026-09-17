/**
 * tools/checks/screen.js — 화면 회귀.
 *
 * 9종의 화면 구성을 한 표로 낸다. 코드 칸·API·시리얼·배속·속도 카드·사용법·헤더 제목·
 * 조작 줄 위치·제출 버튼 이름이 차수마다 그대로인지 눈으로 대조하기 위한 것이다.
 * 판정은 콘솔 오류 0 하나였는데, 52차에 조건 둘이 붙었다.
 *   · 스타터 코드 가로 넘침 0 — 첫 렌더 직후 editor__area 의 scrollWidth <= clientWidth
 *   · 없애기로 한 것이 화면에 없음 — 난이도 탭 · 구간 8칸 · 오류 탭 · 저장 토글 ·
 *     잠깐 멈춤 · 처음부터. 지운 줄 알았는데 남아 있는 일이 반복돼서 검사로 박는다.
 * 나머지 칸은 눈으로 대조하기 위한 것이고 판정에 넣지 않는다 — 구성은 차수마다 바뀐다.
 */
// 40차 파트7 — 다른 8개 챌린지의 화면이 그대로인지 본다.
const { spawn } = require('child_process'); const http=require('http');
const PORT=Number(process.env.PORT||8123);
const { challengeIds, skipNote, ROOT, challengeUrl, manifestPath } = require('./ids.js');
const IDS=challengeIds('화면');
const chrome = spawn('/opt/pw-browsers/chromium', ['--headless=new','--remote-debugging-port=9306','--no-sandbox','--disable-gpu','--window-size=1440,900','--hide-scrollbars','about:blank'],{stdio:'ignore'});
const get=(p)=>new Promise((r,j)=>http.get({host:'127.0.0.1',port:9306,path:p},(s)=>{let b='';s.on('data',c=>b+=c);s.on('end',()=>r(JSON.parse(b)));}).on('error',j));
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{ let l; for(let i=0;i<60;i++){try{l=await get('/json/list');if(l.length)break;}catch{} await sleep(300);}
 const ws=new WebSocket(l.find(x=>x.type==='page').webSocketDebuggerUrl); let id=0;const p=new Map(); let errs=[]; let bad=0;
 ws.onmessage=e=>{const m=JSON.parse(e.data);
  if(m.method==='Runtime.exceptionThrown') errs.push('EXC');
  if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error') errs.push('LOG');
  if(m.id&&p.has(m.id)){p.get(m.id)(m);p.delete(m.id);}};
 await new Promise(r=>ws.onopen=r);
 const send=(m,q={})=>new Promise(r=>{const i=++id;p.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:q}));});
 const ev=async(x)=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});
  return r.result.exceptionDetails?'THREW':r.result.result.value;};
 await send('Page.enable');await send('Runtime.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:`http://127.0.0.1:${PORT}/`}); await sleep(700);
 await ev("try{localStorage.clear();localStorage.setItem('dtc:v1:guideSeen','1')}catch(e){}");
 // 52차에 없앤 것들. 하나라도 화면에 남아 있으면 실패다.
 const GONE = [
   ['난이도 탭', '.mapbar__item'],
   // 구간 진행바만 is-stack 을 붙였다. 판단 지점 바(스마트시티)는 그대로 둔다.
   ['구간 8칸', '.coursebar__steps.is-stack .cstep'],
   ['오류 탭', '[data-el="error-count"]'],
   ['저장 토글', '[data-el="storage-chip"]'],
   ['처음부터', '[data-el="reset-sim"][data-legacy]'],
   // 53차에 없앤 것. 같은 내용이 규칙 모달에 있으므로 오른쪽 칸은 지웠다.
   ['오른쪽 이 챌린지 규칙 칸', '[data-el="rules-fold"]'],
   // 그려지는 것이 없는데 자리만 잡고 있던 캔버스. 숨기지 않고 DOM 에서 들어냈다.
   ['빈 카메라 단', '.camstage[hidden]'],
   // 54차 — 조작 줄은 시뮬 안쪽 알약 하나뿐이다. 밖에 남아 있으면 시뮬이 그만큼 눌린다.
   ['시뮬 밖 조작 줄', '.shell__body > .pane > .transport'],
   // 54차 보강5 — 알약에는 [▶ 실행] [■ 정지] 둘뿐이다.
   ['시뮬 위 소리 아이콘', '[data-el="sound"]'],
   ['시뮬 위 가이드라인 아이콘', '[data-el="howto-open"]'],
   // 54차 파트H — 규칙 창은 하나다. 가이드라인 모달이 따로 있으면 안 된다.
   ['가이드라인 모달', '[data-el="howto"]'],
   // 54차 보강6-3 — 스마트시티 하단 코스 상황 띠. 오른쪽 클리어 현황판이 같은 여섯 곳을 적는다.
   ['스마트시티 하단 코스 상황 띠', '[data-el="coursebar"]:not([hidden])'],
 ];
 console.log('챌린지              코드탭 에디터 API 시리얼 배속 속도카드 사용법 제목 조작줄위치 제출버튼      넘침 남은것  오류');
 for(const cid of IDS){
   errs=[];
   await send('Page.navigate',{url:challengeUrl(PORT, cid)}); await sleep(2600);
   const vis=(sel)=>ev(`(function(){var e=document.querySelector('${sel}');if(!e)return '없음';return (e.offsetParent!==null||e.getClientRects().length>0)?'있음':'감춤'})()`);
   const row=[
     await vis('[data-el="tab-code"]'), await vis('[data-el="editor-mount"]'),
     await vis('[data-el="api-fold"]'), await vis('[data-el="serial-fold"]'),
     await vis('[data-el="speed"]'), await vis('[data-el="speed-card"]'),
     await vis('[data-el="howto-open"]'), await vis('[data-el="header-title"]'),
     await ev(`(function(){var t=document.querySelector('.transport'),v=document.querySelector('.view');if(!t||!v)return '?';return t.compareDocumentPosition(v)&Node.DOCUMENT_POSITION_FOLLOWING?'위':'아래'})()`),
     await ev(`document.querySelector('[data-el="submit-open"]').textContent`),
   ];
   // 스타터 코드가 첫 렌더에서 가로로 넘치는가. 넘치면 학생이 오른쪽 끝을 못 본다.
   const over = await ev(`(function(){var a=document.querySelector('textarea.editor__area');
     if(!a) return 0; return Math.max(0, a.scrollWidth - a.clientWidth);})()`);
   // 없애기로 한 것이 남아 있는가.
   const left = [];
   for(const [name, sel] of GONE){
     const n = await ev(`document.querySelectorAll('${sel}').length`);
     if(n) left.push(`${name}:${n}`);
   }
   // 잠깐 멈춤은 ?dev=1 에서만 보여야 한다.
   const pauseShown = await vis('[data-el="pause"]');
   if(pauseShown === '있음') left.push('잠깐 멈춤');
   // 54차 보강6-1 — 카메라 두 칸의 가로세로비. 세로로 눌리면 원본과 인식 결과의 대응이 흐려진다.
   const camAspect = await ev(`(function(){
     var bad=[];
     for (var st of document.querySelectorAll('.camstage')) {
       if (st.hidden) continue;
       var r = st.getBoundingClientRect();
       if (!r.width || !r.height) continue;
       var a = r.width / r.height;
       if (a < 1.2 || a > 1.5) bad.push((st.dataset.el||'?') + ' ' + a.toFixed(2));
     }
     return bad.join(',');
   })()`);
   if (camAspect) left.push(`카메라 비율(${camAspect})`);
   // 55차 — 두 칸의 폭·높이가 같아야 한다. 1px 이 달라도 인식 결과 박스가
   // 원본과 어긋난다. 1fr 로 나누면 열 폭이 홀수일 때 149/150 으로 갈렸다.
   const camPair = await ev(`(function(){
     var st=[...document.querySelectorAll('.camstage')].filter(function(n){return !n.hidden;});
     if (st.length < 2) return '';
     var r=st.map(function(n){var b=n.getBoundingClientRect();return [b.width,b.height];});
     var w=r.map(function(x){return x[0];}), h=r.map(function(x){return x[1];});
     var dw=Math.max.apply(null,w)-Math.min.apply(null,w);
     var dh=Math.max.apply(null,h)-Math.min.apply(null,h);
     // 55차 — 배포본 실측에서 0.02px 차가 났다. 화면으로는 무의미하므로 0.05px 까지는 같다고 본다.
     return (dw>0.05||dh>0.05) ? ('폭차 '+dw.toFixed(2)+' 높이차 '+dh.toFixed(2)) : '';
   })()`);
   if (camPair) left.push(`카메라 두 칸 크기(${camPair})`);
   // 54차 보강4 — 시리얼 줄이 끊길 때 마지막 줄에 한두 글자만 남으면 안 된다.
   // 380px 코드 칸에서 "…[▶ 실행] 을 눌러 주세요." 가 끊기며 ']' 한 글자만 남았다.
   const orphan = await ev(`(function(){
     var bad=[];
     for (var m of document.querySelectorAll('.serial__m')) {
       var r = m.getClientRects();
       if (r.length < 2) continue;
       // 마지막 줄에 놓인 글자 수를 센다: 끝에서부터 한 글자씩 잘라 보며 줄 수가 줄어드는 지점을 찾는다.
       var t = m.textContent, keep = document.createRange(), n = 0;
       for (var i = t.length; i > 0; i--) {
         keep.setStart(m.firstChild, i - 1); keep.setEnd(m.firstChild, t.length);
         if (keep.getClientRects().length > 1) break;
         n = t.length - i + 1;
       }
       if (n > 0 && n < 3) bad.push(t.slice(-6) + '→' + n);
     }
     return bad.join(',');
   })()`);
   if (orphan) left.push(`시리얼 끊김(${orphan})`);
   // 55차 파트C — 다른 것을 세는 두 숫자가 같은 이름을 달고 있으면 안 된다.
   // 현황판의 '위반' 은 판단 지점만, 기록 시트의 '규칙 위반' 은 장애물까지 합한 값이다.
   const sameName = await ev(`(function(){
     var b=document.querySelector('[data-el="clear-sum"]');
     var c=document.querySelector('[data-el="sh-vio-cap"]');
     if(!b||!c) return '';
     var sheet=(c.firstChild&&c.firstChild.textContent||'').trim();
     if(!sheet) return '';
     return b.textContent.indexOf(sheet) >= 0 ? sheet : '';
   })()`);
   if (sameName) left.push(`같은 이름 두 곳(${sameName})`);
   const ok = errs.length === 0 && over === 0 && left.length === 0;
   if(!ok) bad++;
   console.log(cid.padEnd(19), row.map((v,i)=>String(v).padEnd([6,6,4,6,4,7,6,6,10,12][i])).join(' '),
     String(over).padStart(4), String(left.join(' ')||'없음').padEnd(8), String(errs.length).padStart(4));
 }
 // 55차 보강8 G — 지점 앞에서는 무엇을 해야 하는지를 알려 주지 않는다. 그것을 판단하는 것이
 // 이 챌린지가 가르치려는 것이라, 화면이 미리 적어 두면 학습이 장식이 된다.
 // 세워 둔 화면에서는 배지도 이름표도 로그도 안 뜨므로 실제로 달려서 본다.
 // 보는 곳 셋 — 시뮬 위 배지(글자와 띠 색) · 시뮬 안 이름표 · 이벤트 로그의 '진입' 줄.
 // 이름표는 캔버스에 그려져 글자를 읽을 수 없다 — cityiso 가 그린 글을 canvas 의
 // data-chips 에 그대로 적어 둔다. 지나간 지점의 '요구 · 한 것' 은 봐도 된다(D).
 {
   const fs0 = require('fs');
   const path0 = require('path');
   const withDecisions = IDS.filter((cid) => {
     const ch = JSON.parse(fs0.readFileSync(manifestPath(cid), 'utf8'));
     return ((ch.scene.decisions || []).length > 0) && !((ch.scene.ui || {}).reveal_expect);
   });
   const WORDS = ['진행', '정지', '서행'];
   for (const cid of withDecisions) {
     await send('Page.navigate',{url:challengeUrl(PORT, cid)}); await sleep(2600);
     await ev(`(document.querySelector('[data-el="rules-close"]')||{click:function(){}}).click()`);
     await ev(`(document.querySelector('[data-el="go"]')||{click:function(){}}).click()`);
     const saw3 = { 배지: 0, 이름표: 0, 로그: 0 }; const found = [];
     for (let k = 0; k < 90; k++) {
       await sleep(200);
       const seen = await ev(`(function(){
         var zb=document.querySelector('[data-el="zonebar"]');
         var tag=(document.querySelector('[data-el="zone-tag"]')||{}).textContent||'';
         var cv=document.querySelector('[data-el="canvas"]');
         // 판정이 끝난 뒤 찍히는 줄(통과/위반·인식)은 봐도 된다. 진입 줄만 본다.
         var log=[].slice.call(document.querySelectorAll('.evlog__text'))
           .map(function(n){return n.textContent||'';})
           .filter(function(t){return t.indexOf('진입')>=0;}).join(' | ');
         return JSON.stringify({
           bar: (zb && !zb.hidden) ? tag : null,
           expect: (zb && !zb.hidden) ? (zb.dataset.expect||'') : null,
           chips: (cv && cv.dataset.chips) || '',
           log: log
         });
       })()`);
       const v = JSON.parse(seen || '{}');
       if (v.bar !== null) saw3['배지'] += 1;
       if (v.chips) saw3['이름표'] += 1;
       if (v.log) saw3['로그'] += 1;
       for (const w of WORDS) {
         if (v.bar && v.bar.indexOf(w) >= 0) found.push(`배지 "${v.bar}"`);
         if (v.chips && v.chips.indexOf(w) >= 0) found.push(`이름표 "${v.chips}"`);
         if (v.log && v.log.indexOf(w) >= 0) found.push(`이벤트 로그 "${v.log}"`);
       }
       if (found.length) break;
     }
     // 한 번도 못 본 자리는 '통과' 가 아니라 '못 쟀다' 다. 그것을 통과로 세면 검사가
     // 무력해진 것을 통과로 읽는다 — 이벤트 로그는 지금 hide_cards 가 빼서 화면에 없다.
     const seenAny = Object.values(saw3).some((n) => n > 0);
     const missed = Object.keys(saw3).filter((k) => saw3[k] === 0);
     const ok = seenAny && found.length === 0;
     if (!ok) bad++;
     console.log(`\n판정 전 정답 누설  ${cid} — 본 프레임 `
       + Object.keys(saw3).map((k) => `${k} ${saw3[k]}`).join(' · ')
       + `${found.length ? ` · 새어 나감 ${found[0]}` : ' · 새어 나감 없음'} → ${ok ? 'ok' : '실패'}`
       + (missed.length ? `  (못 잰 자리: ${missed.join(' · ')} — 화면에 안 떴다)` : ''));
   }
 }

 // 54차 파트O — 색으로 조종하는 챌린지의 맵에 색 마커가 굽혀 있으면 안 된다.
 // 마커는 배경 이미지에 구워지므로 화면(DOM)으로는 볼 수 없다 — 매니페스트로 본다.
 // 조종하는 것은 웹캠에 비친 물체이지 맵 위의 판이 아니다(54차 파트L).
 const fs = require('fs');
 const path = require('path');
 const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/challenges/index.json'), 'utf8'));
 const marked = idx.challenges.filter((c) => !c.hidden).filter((c) => {
   const ch = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/challenges', c.path), 'utf8'));
   return ch.camera_source === 'webcam' && (ch.scene.markers || []).length
     && ch.scene.markers_baked !== false;
 }).map((c) => c.challenge_id);
 if (marked.length) bad++;
 console.log(`\n맵의 색 마커  웹캠으로 조종하는 챌린지 가운데 마커를 구운 것 ${marked.length}종`
   + `${marked.length ? ` (${marked.join(' · ')})` : ''} → ${marked.length ? '실패' : 'ok'}`);

 // 54차 보강3 — 허브와 챌린지 화면의 1행 브랜드 글자가 같아야 한다.
 // 두 곳이 다르면 같은 서비스로 안 읽힌다("CHALLENGE DIGITAL TWIN" 대 "EduinoAI 챌린지 게시판").
 await send('Page.navigate',{url:`http://127.0.0.1:${PORT}/`}); await sleep(900);
 const hubBrand = await ev(`(document.querySelector('.brand')||{}).textContent || '(없음)'`);
 const hubBack = await ev(`document.querySelectorAll('.page > .shell__header [data-link="/"]').length`);
 await send('Page.navigate',{url:challengeUrl(PORT, IDS[0])}); await sleep(2200);
 const chBrand = await ev(`(document.querySelector('.brand')||{}).textContent || '(없음)'`);
 const brandOk = hubBrand === chBrand && Number(hubBack) === 0;
 if (!brandOk) bad++;
 console.log(`\n1행 브랜드  허브 "${hubBrand}" · 챌린지 "${chBrand}" · 허브의 [게시판 돌아가기] ${hubBack}개 → ${brandOk ? 'ok' : '실패'}`);
 // 57차 — 이 검사가 건너뛴 챌린지와 그 사유. 조용히 빠지면 '통과' 로 읽힌다.
 { const sk = skipNote('화면'); if (sk) console.log(`\n${sk}`); }
 console.log(`\n실패 ${bad}/${IDS.length} · 기준: 콘솔 오류 0 · 스타터 가로 넘침 0 · 없앤 것이 남아 있지 않을 것 · 1행 브랜드가 같을 것 · 다른 것을 세는 두 숫자가 같은 이름을 쓰지 않을 것 · 판정 전 지점의 정답을 적지 않을 것`);

 ws.close();chrome.kill();process.exit(bad?1:0);
})().catch(e=>{console.error(e.message);chrome.kill();process.exit(1);});
