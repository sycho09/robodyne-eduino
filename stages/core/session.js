/* ╔══════════════════════════════════════════════════════════╗
   ║  VISION AI · 세션/수업 관리 (백엔드 전 단계, localStorage) ║
   ║  - 수업(클래스) 개설/조회: localStorage 'vision_classes'   ║
   ║  - 현재 진입 모드: sessionStorage 'vision_session'         ║
   ║    { mode:'free' | 'teach' | 'class', code, name, student }║
   ╚══════════════════════════════════════════════════════════╝ */
(function(){
  const CKEY='vision_classes', MKEY='vision_session';
  const loadC=()=>{ try{ return JSON.parse(localStorage.getItem(CKEY)||'[]'); }catch(e){ return []; } };
  const saveC=(l)=>localStorage.setItem(CKEY, JSON.stringify(l));
  function gencode(){ const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<6;i++) s+=c[Math.floor(Math.random()*c.length)]; return s; }

  window.Session = {
    createClass({name, capacity}){
      const list=loadC(); let code; do{ code=gencode(); }while(list.some(c=>c.code===code));
      const rec={ code, name:(name||'새 수업').trim(), capacity:+capacity||0, createdAt:new Date().toISOString() };
      list.unshift(rec); saveC(list); return rec;
    },
    listClasses(){ return loadC(); },
    getClass(code){ return loadC().find(c=>c.code===(code||'').trim().toUpperCase()); },
    removeClass(code){ saveC(loadC().filter(c=>c.code!==code)); },
    setMode(m){ try{ sessionStorage.setItem(MKEY, JSON.stringify(m)); }catch(e){} },
    getMode(){ try{ return JSON.parse(sessionStorage.getItem(MKEY)||'null'); }catch(e){ return null; } },
    clearMode(){ try{ sessionStorage.removeItem(MKEY); }catch(e){} },
    /* 진입 토큰 — 역할 선택을 거쳐 콘솔로 들어올 때만 1회 통과(새로고침 시 소진→재선택) */
    arm(){ try{ sessionStorage.setItem('vos_pass','1'); }catch(e){} },
    pass(){ try{ const ok=sessionStorage.getItem('vos_pass')==='1'; sessionStorage.removeItem('vos_pass'); return ok; }catch(e){ return true; } },
    /* 수업별 제출물 집계 */
    submissionsFor(code){ try{ return JSON.parse(localStorage.getItem('vision_submissions')||'[]').filter(s=>s.classCode===code); }catch(e){ return []; } },
    /* 클래스 미션(교사가 생성, 학생이 선택해 제출) */
    createMission({classCode, className, title, content}){
      let list; try{ list=JSON.parse(localStorage.getItem('vision_missions')||'[]'); }catch(e){ list=[]; }
      const rec={ id:'m'+Date.now()+'_'+Math.floor(Math.random()*1e4), classCode, className:className||'', title:(title||'미션').trim(), content:(content||'').trim(), createdAt:new Date().toISOString() };
      list.unshift(rec); localStorage.setItem('vision_missions', JSON.stringify(list)); return rec;
    },
    missionsFor(code){ try{ return JSON.parse(localStorage.getItem('vision_missions')||'[]').filter(m=>m.classCode===code); }catch(e){ return []; } },
    /* 최근 참여 기억 — 학생이 재접속할 때 코드/이름 재입력 없이 다시 들어가도록 */
    recentJoins(){ try{ return JSON.parse(localStorage.getItem('vision_recent_joins')||'[]'); }catch(e){ return []; } },
    addRecentJoin({code, name, className}){
      try{ let l=this.recentJoins().filter(r=>r.code!==code);
        l.unshift({ code, name:name||'', className:className||'', at:new Date().toISOString() });
        localStorage.setItem('vision_recent_joins', JSON.stringify(l.slice(0,8)));
      }catch(e){}
    },
    removeRecentJoin(code){ try{ localStorage.setItem('vision_recent_joins', JSON.stringify(this.recentJoins().filter(r=>r.code!==code))); }catch(e){} },
  };
})();
