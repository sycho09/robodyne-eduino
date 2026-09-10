/* ╔══════════════════════════════════════════════════════════╗
   ║  VISION AI · 제출 확인서 PDF 출력 (브라우저 인쇄 → PDF)   ║
   ║  Cert.print(rec) : 확인서 창을 열고 인쇄(PDF 저장) 다이얼로그 호출 ║
   ║  jsPDF 등 외부 라이브러리 없이 한글 100% 정상 출력         ║
   ╚══════════════════════════════════════════════════════════╝ */
(function(){
  const esc=(s)=>(s||'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
  const fmt=(iso)=>{ try{ const d=new Date(iso);
    return `${d.getFullYear()}. ${d.getMonth()+1}. ${d.getDate()}. ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }catch(e){ return ''; } };

  function html(rec){
    const origin=location.origin;
    const evalDone = rec.status==='평가완료' && rec.result;
    const resultTxt = rec.result==='pass' ? '✓ 통과' : (rec.result==='redo' ? '↻ 재도전' : '미평가');
    const resultColor = rec.result==='pass' ? '#11a06f' : (rec.result==='redo' ? '#d97a16' : '#9aa1b3');
    return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8" />
<title>제출 확인서 · ${esc(rec.name)||'학생'}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
<style>
  @page { size:A4; margin:16mm 18mm; }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Pretendard',system-ui,sans-serif;color:#14161f;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .cert{max-width:720px;margin:0 auto;padding:8px;}
  .top{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #f0473a;padding-bottom:14px;margin-bottom:22px;}
  .brand{display:flex;align-items:center;gap:10px;}
  .brand img{height:30px;}
  .brand .nm{font-size:17px;font-weight:800;} .brand .nm span{color:#f0473a;}
  .brand .sub{font-size:11px;color:#6c7488;letter-spacing:.08em;}
  .doc{font-family:'JetBrains Mono',monospace;font-size:11px;color:#9aa1b3;text-align:right;}
  h1{font-size:25px;font-weight:800;letter-spacing:-.02em;margin-bottom:4px;}
  .h-sub{font-size:13px;color:#6c7488;margin-bottom:20px;}
  .info{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;margin-bottom:20px;}
  .info .row{display:flex;gap:10px;font-size:14px;border-bottom:1px solid #eef0f5;padding-bottom:9px;}
  .info .k{color:#9aa1b3;font-weight:600;min-width:64px;} .info .v{font-weight:700;color:#14161f;}
  .snap{width:100%;border:1px solid #e3e7f0;border-radius:12px;overflow:hidden;margin-bottom:18px;}
  .snap img{width:100%;display:block;}
  .sec{margin-bottom:16px;}
  .sec h2{font-size:13px;font-weight:800;color:#2453c4;margin-bottom:8px;}
  .chips{display:flex;flex-wrap:wrap;gap:6px;}
  .chips span{font-size:12.5px;font-weight:600;color:#39414f;background:#f3f5fa;border:1px solid #e6eaf3;border-radius:999px;padding:5px 11px;}
  .note{font-size:14px;line-height:1.7;color:#39414f;background:#f7f9fc;border:1px solid #eef0f5;border-radius:12px;padding:14px 16px;min-height:48px;}
  .eval{border:2px solid ${resultColor};border-radius:14px;padding:16px 18px;margin-top:6px;}
  .eval .res{font-size:18px;font-weight:800;color:${resultColor};margin-bottom:6px;}
  .eval .fb{font-size:14px;color:#39414f;line-height:1.6;}
  .foot{margin-top:26px;padding-top:14px;border-top:1px solid #eef0f5;display:flex;justify-content:space-between;font-size:11px;color:#9aa1b3;}
  @media print{ .no-print{display:none;} }
  .no-print{position:fixed;top:14px;right:14px;display:flex;gap:8px;}
  .no-print button{font-family:'Pretendard',sans-serif;font-size:13px;font-weight:700;padding:9px 16px;border-radius:9px;border:0;cursor:pointer;}
  .pp{background:#f0473a;color:#fff;} .pc{background:#eef0f5;color:#3b4254;}
</style></head><body>
<div class="no-print">
  <button class="pp" onclick="window.print()">PDF로 저장 / 인쇄</button>
  <button class="pc" onclick="window.close()">닫기</button>
</div>
<div class="cert">
  <div class="top">
    <div class="brand">
      <img src="${origin}/platform/img/logo-mark.webp" alt="" />
      <div><div class="nm">Eduino <span>AI</span></div><div class="sub">VISION AI · 학습 확인서</div></div>
    </div>
    <div class="doc">DOC ${esc((rec.id||'').slice(0,12))}<br/>${fmt(rec.time)}</div>
  </div>

  <h1>AI 미션 제출 확인서</h1>
  <div class="h-sub">학생이 직접 체험·제작한 결과를 기록한 문서입니다.</div>

  <div class="info">
    <div class="row"><span class="k">이름</span><span class="v">${esc(rec.name)||'-'}</span></div>
    <div class="row"><span class="k">반</span><span class="v">${esc(rec.klass)||'-'}</span></div>
    <div class="row"><span class="k">미션</span><span class="v">${esc(rec.label)||'-'}</span></div>
    <div class="row"><span class="k">제출일</span><span class="v">${fmt(rec.time)}</span></div>
  </div>

  ${rec.img?`<div class="snap"><img src="${rec.img}" alt="제출 스냅샷" /></div>`:''}

  ${(rec.summary&&rec.summary.length)?`<div class="sec"><h2>결과 요약</h2><div class="chips">${rec.summary.map(s=>`<span>${esc(s)}</span>`).join('')}</div></div>`:''}

  <div class="sec"><h2>학생 소감</h2><div class="note">${rec.note?esc(rec.note):'(작성한 소감이 없습니다)'}</div></div>

  ${evalDone?`<div class="sec"><h2>교사 평가</h2><div class="eval"><div class="res">${resultTxt}</div><div class="fb">${rec.feedback?esc(rec.feedback):'(피드백 없음)'}</div></div></div>`:''}

  <div class="foot"><span>© Eduino AI · 브라우저로 직접 배우는 AI 학습 플랫폼</span><span>발급: ${fmt(new Date().toISOString())}</span></div>
</div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},350);});window.onafterprint=function(){};</script>
</body></html>`;
  }

  function rosterHtml(cls, subs){
    const origin=location.origin;
    const pass=subs.filter(s=>s.result==='pass').length, redo=subs.filter(s=>s.result==='redo').length, wait=subs.filter(s=>s.status!=='평가완료').length;
    const rows=subs.map((s,i)=>{
      const res = s.result==='pass'?'<b style="color:#11a06f">통과</b>':(s.result==='redo'?'<b style="color:#d97a16">재도전</b>':'<span style="color:#9aa1b3">미평가</span>');
      return `<tr><td>${i+1}</td><td class="nm">${esc(s.name)||'-'}</td><td>${esc(s.label)||'-'}</td><td>${fmt(s.time)}</td><td>${res}</td><td class="fb">${s.feedback?esc(s.feedback):'-'}</td></tr>`;
    }).join('');
    return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8" /><title>제출 명단 · ${esc(cls.name)||''}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
<style>
  @page{size:A4;margin:15mm 18mm;} *{box-sizing:border-box;margin:0;padding:0;}
  @media screen{ body{padding:30px 38px;} }
  body{font-family:'Pretendard',system-ui,sans-serif;color:#14161f;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .top{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #f0473a;padding-bottom:12px;margin-bottom:18px;}
  .brand{display:flex;align-items:center;gap:10px;} .brand img{height:28px;}
  .brand .nm{font-size:16px;font-weight:800;} .brand .nm span{color:#f0473a;}
  .brand .sub{font-size:11px;color:#6c7488;}
  h1{font-size:22px;font-weight:800;margin-bottom:3px;} .meta{font-size:12.5px;color:#6c7488;margin-bottom:14px;}
  .meta b{color:#14161f;} .code{font-family:'JetBrains Mono',monospace;color:#2453c4;font-weight:700;}
  .sum{display:flex;gap:10px;margin-bottom:16px;}
  .sc{flex:1;background:#f5f7fc;border:1px solid #e6eaf3;border-radius:10px;padding:10px 14px;text-align:center;}
  .sc .n{font-size:22px;font-weight:800;} .sc .l{font-size:11px;color:#6c7488;}
  table{width:100%;border-collapse:collapse;font-size:13px;}
  th,td{border-bottom:1px solid #eef0f5;padding:9px 8px;text-align:left;vertical-align:top;}
  th{font-size:11px;color:#9aa1b3;font-weight:700;text-transform:uppercase;letter-spacing:.03em;}
  td.nm{font-weight:700;} td.fb{color:#39414f;}
  .foot{margin-top:20px;font-size:11px;color:#9aa1b3;text-align:right;}
  .no-print{position:fixed;top:14px;right:14px;} .no-print button{font-family:'Pretendard',sans-serif;font-size:13px;font-weight:700;padding:9px 16px;border-radius:9px;border:0;cursor:pointer;background:#f0473a;color:#fff;}
  @media print{.no-print{display:none;}}
</style></head><body>
<div class="no-print"><button onclick="window.print()">PDF로 저장 / 인쇄</button></div>
<div class="top"><div class="brand"><img src="${origin}/platform/img/logo-mark.webp" alt="" /><div><div class="nm">Eduino <span>AI</span></div><div class="sub">VISION AI · 수업 제출 명단</div></div></div>
  <div style="text-align:right;font-size:11px;color:#9aa1b3">발급 ${fmt(new Date().toISOString())}</div></div>
<h1>${esc(cls.name)||'수업'} 제출 명단</h1>
<div class="meta">수업 코드 <span class="code">${esc(cls.code)||'-'}</span> · 총 제출 <b>${subs.length}</b>명</div>
<div class="sum">
  <div class="sc"><div class="n">${subs.length}</div><div class="l">제출</div></div>
  <div class="sc"><div class="n" style="color:#11a06f">${pass}</div><div class="l">통과</div></div>
  <div class="sc"><div class="n" style="color:#d97a16">${redo}</div><div class="l">재도전</div></div>
  <div class="sc"><div class="n" style="color:#9aa1b3">${wait}</div><div class="l">미평가</div></div>
</div>
<table><thead><tr><th>#</th><th>이름</th><th>미션</th><th>제출 시각</th><th>평가</th><th>피드백</th></tr></thead>
<tbody>${rows||'<tr><td colspan="6" style="text-align:center;color:#9aa1b3;padding:30px">제출물이 없습니다.</td></tr>'}</tbody></table>
<div class="foot">© Eduino AI · 브라우저로 직접 배우는 AI 학습 플랫폼</div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},350);});</script>
</body></html>`;
  }

  const fmtDate=(iso)=>{ try{ const d=new Date(iso); return `${d.getFullYear()}. ${d.getMonth()+1}. ${d.getDate()}.`; }catch(e){ return '-'; } };

  function summaryHtml(cls, missions, subs){
    const origin=location.origin;
    const pass=subs.filter(s=>s.result==='pass').length, redo=subs.filter(s=>s.result==='redo').length, wait=subs.filter(s=>s.status!=='평가완료').length;
    const students=new Set(subs.map(s=>(s.name||'').trim()).filter(Boolean)).size;
    const cap=+cls.capacity||0;
    const capTxt = cap ? `${students} / ${cap}명` : `${students}명`;
    const evaluated = subs.filter(s=>s.status==='평가완료').length;
    const passRate = subs.length ? Math.round(pass/subs.length*100) : 0;
    const byMission=(mid)=>subs.filter(s=>s.missionId===mid);
    const noMission=subs.filter(s=>!s.missionId);
    const rowsFor=(arr)=>arr.map((s,i)=>{
      const res=s.result==='pass'?'<b style="color:#11a06f">통과</b>':(s.result==='redo'?'<b style="color:#d97a16">재도전</b>':'<span style="color:#9aa1b3">미평가</span>');
      return `<tr><td>${i+1}</td><td class="nm">${esc(s.name)||'-'}</td><td>${esc(s.label)||'-'}</td><td>${fmt(s.time)}</td><td>${res}</td><td class="fb">${s.feedback?esc(s.feedback):'-'}</td></tr>`;
    }).join('');
    const section=(title, content, arr)=>`<div class="ms"><div class="ms-h">${esc(title)} <span>${arr.length}건</span></div>${content?`<div class="ms-d">${esc(content)}</div>`:''}
      <table><thead><tr><th>#</th><th>이름</th><th>기능</th><th>제출</th><th>평가</th><th>피드백</th></tr></thead>
      <tbody>${rowsFor(arr)||'<tr><td colspan="6" style="text-align:center;color:#9aa1b3;padding:18px">제출 없음</td></tr>'}</tbody></table></div>`;
    return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8" /><title>수업 종합 · ${esc(cls.name)||''}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
<style>
  @page{size:A4;margin:15mm 18mm;} *{box-sizing:border-box;margin:0;padding:0;}
  @media screen{ body{padding:30px 38px;} }
  body{font-family:'Pretendard',system-ui,sans-serif;color:#14161f;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .top{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #f0473a;padding-bottom:12px;margin-bottom:16px;}
  .brand{display:flex;align-items:center;gap:10px;} .brand img{height:28px;}
  .brand .nm{font-size:16px;font-weight:800;} .brand .nm span{color:#f0473a;} .brand .sub{font-size:11px;color:#6c7488;}
  h1{font-size:23px;font-weight:800;margin-bottom:3px;} .meta{font-size:12.5px;color:#6c7488;margin-bottom:16px;} .code{font-family:'JetBrains Mono',monospace;color:#2453c4;font-weight:700;}
  .info{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#e6eaf3;border:1px solid #e6eaf3;border-radius:12px;overflow:hidden;margin-bottom:16px;}
  .info .cell{background:#fbfcfe;padding:11px 14px;}
  .info .k{font-size:11px;color:#9aa1b3;font-weight:700;margin-bottom:3px;}
  .info .v{font-size:14.5px;font-weight:800;color:#14161f;} .info .v .code{font-size:14px;}
  .sum{display:flex;gap:10px;margin-bottom:18px;}
  .sc{flex:1;background:#f5f7fc;border:1px solid #e6eaf3;border-radius:10px;padding:10px 14px;text-align:center;}
  .sc .n{font-size:22px;font-weight:800;} .sc .l{font-size:11px;color:#6c7488;}
  .ms{margin-bottom:18px;break-inside:avoid;} .ms-h{font-size:15px;font-weight:800;color:#2453c4;margin-bottom:4px;} .ms-h span{font-size:11px;color:#9aa1b3;font-weight:700;}
  .ms-d{font-size:12.5px;color:#6c7488;margin-bottom:8px;}
  table{width:100%;border-collapse:collapse;font-size:12.5px;} th,td{border-bottom:1px solid #eef0f5;padding:8px;text-align:left;vertical-align:top;}
  th{font-size:10.5px;color:#9aa1b3;font-weight:700;text-transform:uppercase;} td.nm{font-weight:700;} td.fb{color:#39414f;}
  .foot{margin-top:18px;font-size:11px;color:#9aa1b3;text-align:right;}
  .no-print{position:fixed;top:14px;right:14px;} .no-print button{font-family:'Pretendard',sans-serif;font-size:13px;font-weight:700;padding:9px 16px;border-radius:9px;border:0;cursor:pointer;background:#f0473a;color:#fff;}
  @media print{.no-print{display:none;}}
</style></head><body>
<div class="no-print"><button onclick="window.print()">PDF로 저장 / 인쇄</button></div>
<div class="top"><div class="brand"><img src="${origin}/platform/img/logo-mark.webp" alt="" /><div><div class="nm">Eduino <span>AI</span></div><div class="sub">VISION AI · 수업 종합 결과</div></div></div>
  <div style="text-align:right;font-size:11px;color:#9aa1b3">발급 ${fmt(new Date().toISOString())}</div></div>
<h1>${esc(cls.name)||'수업'} 종합 결과 보고서</h1>
<div class="meta">브라우저로 직접 체험·제작한 AI 학습 수업의 진행 결과를 정리한 문서입니다.</div>
<div class="info">
  <div class="cell"><div class="k">수업명</div><div class="v">${esc(cls.name)||'수업'}</div></div>
  <div class="cell"><div class="k">수업 코드</div><div class="v"><span class="code">${esc(cls.code)||'-'}</span></div></div>
  <div class="cell"><div class="k">수업 인원 (제출/정원)</div><div class="v">${capTxt}</div></div>
  <div class="cell"><div class="k">개설일</div><div class="v">${cls.createdAt?fmtDate(cls.createdAt):'-'}</div></div>
  <div class="cell"><div class="k">미션 수</div><div class="v">${missions.length}개</div></div>
  <div class="cell"><div class="k">총 제출</div><div class="v">${subs.length}건</div></div>
  <div class="cell"><div class="k">평가 완료</div><div class="v">${evaluated} / ${subs.length}건</div></div>
  <div class="cell"><div class="k">통과율</div><div class="v">${passRate}%</div></div>
  <div class="cell"><div class="k">발급일</div><div class="v">${fmtDate(new Date().toISOString())}</div></div>
</div>
<div class="sum">
  <div class="sc"><div class="n">${subs.length}</div><div class="l">제출</div></div>
  <div class="sc"><div class="n" style="color:#11a06f">${pass}</div><div class="l">통과</div></div>
  <div class="sc"><div class="n" style="color:#d97a16">${redo}</div><div class="l">재도전</div></div>
  <div class="sc"><div class="n" style="color:#9aa1b3">${wait}</div><div class="l">미평가</div></div>
</div>
${missions.map(mi=>section(mi.title, mi.content, byMission(mi.id))).join('')}
${noMission.length?section('미션 미지정 제출', '', noMission):''}
<div class="foot">© Eduino AI · 브라우저로 직접 배우는 AI 학습 플랫폼</div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},350);});</script>
</body></html>`;
  }

  window.Cert={
    print(rec){
      const w=window.open('','vision_cert','width=840,height=1080');
      if(!w){ alert('PDF 저장을 위해 팝업을 허용해 주세요.'); return; }
      w.document.open(); w.document.write(html(rec)); w.document.close();
    },
    roster(cls, subs){
      const w=window.open('','vision_roster','width=900,height=1100');
      if(!w){ alert('PDF 저장을 위해 팝업을 허용해 주세요.'); return; }
      w.document.open(); w.document.write(rosterHtml(cls, subs||[])); w.document.close();
    },
    summary(cls, missions, subs){
      const w=window.open('','vision_summary','width=900,height=1100');
      if(!w){ alert('PDF 저장을 위해 팝업을 허용해 주세요.'); return; }
      w.document.open(); w.document.write(summaryHtml(cls, missions||[], subs||[])); w.document.close();
    }
  };
})();
