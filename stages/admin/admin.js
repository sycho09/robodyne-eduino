/* ╔══════════════════════════════════════════════════════════╗
   ║  VISION AI · 관리자 모드 (현황 보기 · 수업/제출 정리)      ║
   ║  사용: <script src="/stages/admin.js"></script>            ║
   ║        Admin.open()  또는  [data-admin] 요소 클릭          ║
   ║  (현재 단일 브라우저 가정 · 추후 AWS 관리자 API로 이전)    ║
   ╚══════════════════════════════════════════════════════════╝ */
(function(){
  const SKEY='vision_submissions', CKEY='vision_classes', MKEY='vision_missions';
  const ld=(k)=>{ try{ return JSON.parse(localStorage.getItem(k)||'[]'); }catch(e){ return []; } };
  const sv=(k,v)=>localStorage.setItem(k, JSON.stringify(v));
  const esc=(s)=>(s||'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
  const fmtD=(iso)=>{ try{ const d=new Date(iso); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; }catch(e){ return '-'; } };

  const css=`
  .ad-ov{position:fixed;inset:0;z-index:97;display:none;background:rgba(6,7,12,.94);backdrop-filter:blur(9px);
    font-family:'Pretendard',system-ui,sans-serif;color:#f2f4fb;overflow:auto;}
  .ad-ov.on{display:block;}
  .ad-wrap{max-width:1080px;margin:0 auto;padding:20px 22px 48px;}
  .ad-bar{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
    padding:14px 0 12px;margin-bottom:6px;background:linear-gradient(180deg,rgba(6,7,12,.97),rgba(6,7,12,.6));}
  .ad-ttl{display:flex;align-items:center;gap:12px;}
  .ad-back{font-size:13px;font-weight:700;color:#aeb6cf;background:rgba(255,255,255,.06);border:0;border-radius:11px;
    padding:9px 14px;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.06);transition:.15s;}
  .ad-back:hover{color:#fff;background:rgba(255,255,255,.1);}
  .ad-ttl h2{margin:0;font-size:21px;font-weight:800;letter-spacing:-.02em;}
  .ad-ttl .tag{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:#ffb36a;background:rgba(255,180,60,.14);border-radius:7px;padding:4px 8px;letter-spacing:.06em;}
  .ad-tools{display:flex;gap:8px;flex-wrap:wrap;}
  .ad-b{font-size:12.5px;font-weight:700;color:#aeb6cf;background:rgba(255,255,255,.05);border:0;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.06);border-radius:10px;padding:8px 12px;cursor:pointer;transition:.15s;}
  .ad-b:hover{color:#fff;box-shadow:inset 0 0 0 1px #6aa6ff;}
  .ad-b.danger:hover{box-shadow:inset 0 0 0 1px #f0473a;color:#ff8472;}
  .ad-close{font-size:15px;color:#fff;background:rgba(255,255,255,.06);border:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.08);width:38px;height:38px;border-radius:11px;cursor:pointer;}
  .ad-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:6px 0 20px;}
  .ad-kpi{background:rgba(255,255,255,.04);border-radius:14px;padding:14px 16px;box-shadow:inset 0 1px 0 rgba(255,255,255,.05);}
  .ad-kpi .n{font-size:26px;font-weight:800;letter-spacing:-.02em;} .ad-kpi .l{font-size:11.5px;color:#8b93ad;margin-top:2px;}
  .ad-empty{text-align:center;color:#737c9c;padding:60px 0;font-size:14px;line-height:1.8;}
  .ad-card{background:rgba(255,255,255,.04);border-radius:16px;margin-bottom:14px;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 10px 26px rgba(0,0,0,.3);}
  .ad-ch{display:flex;align-items:center;gap:14px;padding:15px 17px;cursor:pointer;}
  .ad-ch:hover{background:rgba(255,255,255,.02);}
  .ad-cname{font-size:16px;font-weight:800;} .ad-ccode{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:#6aa6ff;background:rgba(59,134,255,.15);border-radius:7px;padding:3px 8px;}
  .ad-cmeta{font-size:11.5px;color:#737c9c;margin-top:3px;}
  .ad-cspacer{flex:1;}
  .ad-pill{font-size:11px;font-weight:700;border-radius:999px;padding:4px 10px;}
  .ad-pill.act{color:#04140c;background:#42e29b;} .ad-pill.end{color:#aeb6cf;background:rgba(255,255,255,.1);}
  .ad-mini{display:flex;gap:7px;flex-wrap:wrap;margin-top:5px;}
  .ad-mini span{font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#aeb6cf;background:rgba(255,255,255,.05);border-radius:7px;padding:3px 8px;}
  .ad-mini b{color:#6aa6ff;} .ad-mini .ok{color:#42e29b;} .ad-mini .warn{color:#ffd36a;}
  .ad-caret{font-size:13px;color:#737c9c;transition:.2s;} .ad-card.open .ad-caret{transform:rotate(90deg);}
  .ad-body{display:none;border-top:1px solid rgba(255,255,255,.07);padding:14px 17px 17px;}
  .ad-card.open .ad-body{display:block;}
  .ad-acts{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;}
  table.ad-t{width:100%;border-collapse:collapse;font-size:13px;}
  .ad-t th,.ad-t td{text-align:left;padding:9px 8px;border-bottom:1px solid rgba(255,255,255,.06);}
  .ad-t th{font-size:10.5px;color:#8b93ad;font-weight:700;text-transform:uppercase;letter-spacing:.04em;}
  .ad-t td.nm{font-weight:700;}
  .ad-st{font-size:11.5px;font-weight:800;border-radius:7px;padding:3px 9px;}
  .ad-st.done{color:#04140c;background:#42e29b;} .ad-st.ing{color:#1a0a08;background:#ffd36a;} .ad-st.none{color:#aeb6cf;background:rgba(255,255,255,.08);}
  .ad-rosterempty{color:#737c9c;font-size:12.5px;padding:10px 2px;}
  .ad-note{font-size:11.5px;color:#737c9c;margin-top:10px;line-height:1.6;}
  /* 관리자 인증 게이트 */
  .ad-gate{display:none;max-width:380px;margin:56px auto 0;text-align:center;background:rgba(255,255,255,.04);
    border-radius:18px;padding:32px 28px;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 14px 36px rgba(0,0,0,.35);}
  .ad-ov.locked .ad-gate{display:block;}
  .ad-ov.locked #adKpis,.ad-ov.locked #adList,.ad-ov.locked .ad-note,.ad-ov.locked #adExport,.ad-ov.locked #adWipe{display:none!important;}
  .ad-gate .lk{font-size:30px;line-height:1;color:#6aa6ff;}
  .ad-gate h3{margin:12px 0 4px;font-size:18px;font-weight:800;}
  .ad-gate p{margin:0 0 18px;font-size:12.5px;color:#8b93ad;}
  .ad-gin{width:100%;background:rgba(255,255,255,.05);border:0;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);
    border-radius:11px;color:#f2f4fb;font-size:15px;font-family:inherit;padding:12px 13px;text-align:center;letter-spacing:.1em;}
  .ad-gin:focus{outline:none;box-shadow:inset 0 0 0 2px #6aa6ff;}
  .ad-gerr{min-height:18px;font-size:12px;color:#ff8472;margin:9px 0 4px;}
  .ad-gbtn{width:100%;font-size:14.5px;font-weight:800;color:#fff;border:0;border-radius:12px;padding:12px;cursor:pointer;
    background:linear-gradient(135deg,#6aa6ff,#3b86ff);box-shadow:0 8px 22px rgba(59,134,255,.34);}`;
  const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);

  const ov=document.createElement('div'); ov.className='ad-ov';
  ov.innerHTML=`<div class="ad-wrap">
    <div class="ad-bar">
      <div class="ad-ttl"><button class="ad-back" id="adBack">← 뒤로</button><h2>관리자 모드</h2><span class="tag">ADMIN</span></div>
      <div class="ad-tools">
        <button class="ad-b" id="adExport">전체 백업(JSON)</button>
        <button class="ad-b danger" id="adWipe">전체 초기화</button>
        <button class="ad-close" id="adClose">✕</button>
      </div>
    </div>
    <div class="ad-gate" id="adGate">
      <div class="lk">🔒</div>
      <h3>관리자 인증</h3>
      <p>관리자 비밀번호를 입력하세요.</p>
      <input class="ad-gin" id="adPw" type="password" placeholder="비밀번호" autocomplete="off" />
      <div class="ad-gerr" id="adErr"></div>
      <button class="ad-gbtn" id="adEnter">입장</button>
    </div>
    <div class="ad-kpis" id="adKpis"></div>
    <div id="adList"></div>
    <div class="ad-note">ℹ️ 모든 데이터는 현재 이 브라우저에 저장됩니다. 수업을 삭제하면 해당 수업의 미션·제출물도 함께 정리돼요. (추후 AWS 관리자 기능으로 이전 예정)</div>
  </div>`;

  function ensure(){ if(!document.body.contains(ov)) document.body.appendChild(ov); }

  function studentRows(code){
    const subs=ld(SKEY).filter(s=>s.classCode===code);
    const missions=ld(MKEY).filter(m=>m.classCode===code);
    const names=[...new Set(subs.map(s=>(s.name||'').trim()).filter(Boolean))];
    return names.map(nm=>{
      const ms=subs.filter(s=>(s.name||'').trim()===nm);
      const pass=ms.filter(s=>s.result==='pass').length;
      const redo=ms.filter(s=>s.result==='redo').length;
      const wait=ms.filter(s=>s.status!=='평가완료').length;
      const passedMissions=new Set(ms.filter(s=>s.result==='pass'&&s.missionId).map(s=>s.missionId)).size;
      let state;
      if(missions.length>0) state = passedMissions>=missions.length ? 'done' : (pass>0||ms.length>0?'ing':'none');
      else state = (ms.length>0 && ms.every(s=>s.result==='pass')) ? 'done' : (ms.length>0?'ing':'none');
      return { nm, total:ms.length, pass, redo, wait, state };
    }).sort((a,b)=> (a.state===b.state? a.nm.localeCompare(b.nm) : (a.state==='done'?-1:1)) );
  }

  function classCard(c){
    const subs=ld(SKEY).filter(s=>s.classCode===c.code);
    const missions=ld(MKEY).filter(m=>m.classCode===c.code);
    const rows=studentRows(c.code);
    const students=rows.length, doneN=rows.filter(r=>r.state==='done').length;
    const pass=subs.filter(s=>s.result==='pass').length;
    const passRate=subs.length?Math.round(pass/subs.length*100):0;
    const cap=+c.capacity||0;
    const tableRows = rows.length ? rows.map((r,i)=>{
      const lbl=r.state==='done'?'완료':(r.state==='ing'?'진행중':'미시작');
      return `<tr><td>${i+1}</td><td class="nm">${esc(r.nm)}</td><td>${r.total}</td>
        <td style="color:#42e29b">${r.pass}</td><td style="color:#ffd36a">${r.redo}</td><td style="color:#aeb6cf">${r.wait}</td>
        <td><span class="ad-st ${r.state}">${lbl}</span></td></tr>`; }).join('')
      : '';
    return `<div class="ad-card" data-code="${c.code}">
      <div class="ad-ch" data-toggle>
        <div>
          <div style="display:flex;align-items:center;gap:9px"><span class="ad-cname">${esc(c.name)}</span><span class="ad-ccode">${esc(c.code)}</span></div>
          <div class="ad-cmeta">개설 ${fmtD(c.createdAt)} · 정원 ${cap?cap+'명':'미정'}</div>
          <div class="ad-mini"><span>학생 <b>${students}</b>${cap?('/'+cap):''}</span><span>완료 <b class="ok">${doneN}</b></span><span>미션 <b>${missions.length}</b></span><span>제출 <b>${subs.length}</b></span><span>통과율 <b>${passRate}%</b></span></div>
        </div>
        <div class="ad-cspacer"></div>
        <span class="ad-pill act">운영중</span>
        <span class="ad-caret">▶</span>
      </div>
      <div class="ad-body">
        <div class="ad-acts">
          <button class="ad-b" data-board="${c.code}">게시판 열기</button>
          <button class="ad-b" data-pdf="${c.code}">종합 PDF</button>
          <button class="ad-b danger" data-clearsub="${c.code}">제출만 비우기</button>
          <button class="ad-b danger" data-del="${c.code}">수업 삭제</button>
        </div>
        ${ tableRows ? `<table class="ad-t"><thead><tr><th>#</th><th>이름</th><th>제출</th><th>통과</th><th>재도전</th><th>미평가</th><th>상태</th></tr></thead><tbody>${tableRows}</tbody></table>`
          : '<div class="ad-rosterempty">아직 제출한 학생이 없어요.</div>' }
      </div>
    </div>`;
  }

  function render(){
    const classes=ld(CKEY), subs=ld(SKEY), missions=ld(MKEY);
    const students=new Set(subs.map(s=>(s.name||'').trim()).filter(Boolean)).size;
    ov.querySelector('#adKpis').innerHTML=`
      <div class="ad-kpi"><div class="n">${classes.length}</div><div class="l">개설된 수업</div></div>
      <div class="ad-kpi"><div class="n">${students}</div><div class="l">참여 학생(이름 기준)</div></div>
      <div class="ad-kpi"><div class="n">${missions.length}</div><div class="l">미션</div></div>
      <div class="ad-kpi"><div class="n">${subs.length}</div><div class="l">총 제출</div></div>`;
    const listEl=ov.querySelector('#adList');
    if(!classes.length){ listEl.innerHTML='<div class="ad-empty">아직 개설된 수업이 없어요.<br>입장 화면의 <b>수업 개설</b>에서 수업을 만들면 여기에서 현황을 관리할 수 있어요.</div>'; return; }
    listEl.innerHTML=classes.map(classCard).join('');
    listEl.querySelectorAll('.ad-card').forEach(card=>{
      const code=card.dataset.code;
      card.querySelector('[data-toggle]').addEventListener('click',()=>card.classList.toggle('open'));
      const board=card.querySelector('[data-board]'); if(board) board.addEventListener('click',(e)=>{ e.stopPropagation();
        if(window.Board) Board.open({code}); });
      const pdf=card.querySelector('[data-pdf]'); if(pdf) pdf.addEventListener('click',(e)=>{ e.stopPropagation();
        if(!window.Cert) return; const cls=ld(CKEY).find(c=>c.code===code)||{name:'수업',code};
        Cert.summary(cls, ld(MKEY).filter(m=>m.classCode===code), ld(SKEY).filter(s=>s.classCode===code)); });
      const clr=card.querySelector('[data-clearsub]'); if(clr) clr.addEventListener('click',(e)=>{ e.stopPropagation();
        if(confirm('이 수업의 제출물을 모두 비울까요?\n(수업·미션은 유지됩니다)')){ sv(SKEY, ld(SKEY).filter(s=>s.classCode!==code)); render(); } });
      const del=card.querySelector('[data-del]'); if(del) del.addEventListener('click',(e)=>{ e.stopPropagation();
        if(confirm('이 수업을 완전히 삭제할까요?\n수업 · 미션 · 제출물이 모두 정리되어 코드를 재사용할 수 있어요.')){
          sv(CKEY, ld(CKEY).filter(c=>c.code!==code));
          sv(MKEY, ld(MKEY).filter(m=>m.classCode!==code));
          sv(SKEY, ld(SKEY).filter(s=>s.classCode!==code));
          if(window.Session&&Session.removeRecentJoin) Session.removeRecentJoin(code);
          render();
        } });
    });
  }

  ov.querySelector('#adClose').addEventListener('click',()=>ov.classList.remove('on'));
  ov.querySelector('#adBack').addEventListener('click',()=>ov.classList.remove('on'));
  ov.addEventListener('click',e=>{ if(e.target===ov) ov.classList.remove('on'); });
  window.addEventListener('keydown',e=>{ if(e.key==='Escape'&&ov.classList.contains('on')) ov.classList.remove('on'); });
  ov.querySelector('#adExport').addEventListener('click',()=>{
    const dump={ classes:ld(CKEY), missions:ld(MKEY), submissions:ld(SKEY), exportedAt:new Date().toISOString() };
    const b=new Blob([JSON.stringify(dump,null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='vision_admin_backup.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  });
  ov.querySelector('#adWipe').addEventListener('click',()=>{
    if(confirm('모든 수업 · 미션 · 제출물을 삭제할까요?\n되돌릴 수 없어요. (먼저 백업을 권장합니다)')){
      sv(CKEY,[]); sv(MKEY,[]); sv(SKEY,[]); try{ localStorage.removeItem('vision_recent_joins'); }catch(e){} render();
    }
  });

  /* 관리자 인증 (세션 단위) */
  const PW='robodyne';
  const authed=()=>{ try{ return sessionStorage.getItem('vision_admin_ok')==='1'; }catch(e){ return false; } };
  function tryAuth(){ const inp=ov.querySelector('#adPw'), err=ov.querySelector('#adErr');
    if((inp.value||'')===PW){ try{ sessionStorage.setItem('vision_admin_ok','1'); }catch(e){} inp.value=''; err.textContent='';
      ov.classList.remove('locked'); render(); }
    else { err.textContent='비밀번호가 올바르지 않습니다.'; inp.select(); } }
  ov.querySelector('#adEnter').addEventListener('click',tryAuth);
  ov.querySelector('#adPw').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); tryAuth(); } });

  window.Admin={
    open(){ ensure();
      if(authed()){ ov.classList.remove('locked'); render(); }
      else { ov.classList.add('locked'); ov.querySelector('#adErr').textContent=''; ov.querySelector('#adPw').value=''; }
      ov.classList.add('on');
      setTimeout(()=>{ if(!authed()){ const i=ov.querySelector('#adPw'); if(i) i.focus(); } },60);
    },
    close(){ ov.classList.remove('on'); }
  };
  document.addEventListener('click',(e)=>{ const t=e.target.closest&&e.target.closest('[data-admin]'); if(t){ e.preventDefault(); Admin.open(); } });
})();
