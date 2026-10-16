(function(){
  const $ = (id)=>document.getElementById(id);
  const els = { video:$('video'), overlay:$('overlay'), cover:$('cover'), start:$('start'), stop:$('stop'),
    status:$('status'), fps:$('fps'), count:$('count'), list:$('list'), thr:$('thr'), thrv:$('thrv'), viewport:$('viewport') };
  const detect = { model:null, stream:null, raf:null, lastT:0, threshold:0.5 };

  els.thr.addEventListener('input', ()=>{ detect.threshold=(+els.thr.value)/100; els.thrv.textContent=els.thr.value+'%'; });
  els.start.addEventListener('click', startCam);
  els.stop.addEventListener('click', stopCam);

  function setStatus(t, cls){ els.status.textContent='● '+t; els.status.className='chip '+(cls||''); }
  function setAR(){ const vw=els.video.videoWidth, vh=els.video.videoHeight;
    if (vw && vh) els.viewport.style.setProperty('--ar', vw + ' / ' + vh); }

  async function startCam(){
    if (detect.stream) return;
    if (!window.cocoSsd){ setStatus('ERROR','idle'); return; }
    els.start.classList.add('loading'); els.start.textContent='모델 불러오는 중…'; setStatus('LOADING');
    try {
      if (!detect.model) detect.model = await cocoSsd.load();
      detect.stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user' } });
      els.video.srcObject = detect.stream;
      await els.video.play().catch(()=>{});
      setAR(); els.video.addEventListener('loadedmetadata', setAR, { once:true });
      els.cover.classList.add('hide');
      setStatus('LIVE','live');
      detect.lastT = performance.now();
      loop();
    } catch(e){ console.error('[detect]', e); setStatus('ERROR','idle');
      els.start.classList.remove('loading'); els.start.textContent='▶ 다시 시도'; }
  }

  function stopCam(){
    if (detect.stream){ detect.stream.getTracks().forEach(t=>t.stop()); detect.stream=null; }
    els.video.srcObject=null;
    if (detect.raf) cancelAnimationFrame(detect.raf);
    const ctx=els.overlay.getContext('2d'); ctx.clearRect(0,0,els.overlay.width,els.overlay.height);
    els.cover.classList.remove('hide');
    els.start.classList.remove('loading'); els.start.textContent='▶ 카메라 켜기 · 탐지 시작';
    setStatus('IDLE','idle'); els.fps.innerHTML='FPS <b>—</b>';
    els.count.textContent='0'; els.list.innerHTML='<div class="empty">아직 없어요 — 카메라를 켜보세요</div>';
    detect.frames=0;
    ['tFps','tMax','tAvg','tRes'].forEach(id=>$(id).textContent='—');
    $('tInfer').innerHTML='— <small>ms</small>'; $('tFrames').textContent='0';
  }

  async function loop(){
    if (!detect.stream || !detect.model) return;
    if (els.video.readyState >= 2){
      const vw=els.video.videoWidth, vh=els.video.videoHeight;
      els.overlay.width=vw; els.overlay.height=vh; setAR();
      try {
        const t0=performance.now();
        const preds = (await detect.model.detect(els.video)).filter(p=>p.score>=detect.threshold);
        const inferMs=performance.now()-t0;
        detect.lastPreds = preds; detect.frames=(detect.frames||0)+1;
        const ctx=els.overlay.getContext('2d'); ctx.clearRect(0,0,vw,vh);
        ctx.font='600 16px JetBrains Mono';
        const rr=(x,y,w,h,r)=>{ if(ctx.roundRect){ctx.beginPath();ctx.roundRect(x,y,w,h,r);} else {ctx.beginPath();ctx.rect(x,y,w,h);} };
        preds.forEach(p=>{
          const [x,y,w,h]=p.bbox, mx=vw-x-w; // 비디오가 좌우 반전 표시되므로 박스 X만 반전
          ctx.strokeStyle='rgba(106,166,255,.95)'; ctx.lineWidth=2.5; ctx.shadowColor='rgba(59,134,255,.6)'; ctx.shadowBlur=10;
          rr(mx, y, w, h, 10); ctx.stroke(); ctx.shadowBlur=0;
          const label=`${p.class} ${Math.round(p.score*100)}%`, tw=ctx.measureText(label).width;
          ctx.fillStyle='rgba(10,12,20,.82)'; rr(mx, y-24, tw+16, 21, 6); ctx.fill();
          ctx.fillStyle='#9cc1ff'; ctx.fillText(label, mx+8, y-8);
        });
        els.count.textContent=preds.length;
        els.list.innerHTML = preds.length ? preds.slice(0,8).map(p=>{
          const pct=Math.round(p.score*100);
          return `<div class="det-row"><div class="det-head"><span>${p.class}</span><span class="det-pct">${pct}%</span></div>
            <div class="gauge"><div class="gauge-fill" style="width:${pct}%"></div></div></div>`;
        }).join('') : '<div class="empty">사물이 안 보여요 — 카메라 앞에 물건을 비춰보세요</div>';
        const now=performance.now(), fps=1000/(now-detect.lastT); detect.lastT=now;
        els.fps.innerHTML='FPS <b>'+fps.toFixed(1)+'</b>';
        /* 실시간 수치 텔레메트리 */
        const sc=preds.map(p=>p.score);
        $('tInfer').innerHTML=inferMs.toFixed(0)+' <small>ms</small>';
        $('tFps').textContent=fps.toFixed(1);
        $('tMax').textContent=sc.length?Math.round(Math.max(...sc)*100)+'%':'—';
        $('tAvg').textContent=sc.length?Math.round(sc.reduce((a,b)=>a+b,0)/sc.length*100)+'%':'—';
        $('tRes').textContent=vw+'×'+vh;
        $('tFrames').textContent=detect.frames;
      } catch(e){ /* skip frame */ }
    }
    detect.raf=requestAnimationFrame(loop);
  }

  /* 미션 제출 — 현재 화면(영상+탐지박스)을 스냅샷으로 캡처 */
  function captureFrame(){
    if(!detect.stream) return null;
    const vw=els.video.videoWidth||640, vh=els.video.videoHeight||480;
    const sc=Math.min(1,480/vw), W=Math.round(vw*sc), H=Math.round(vh*sc);
    const c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d');
    x.save(); x.translate(W,0); x.scale(-1,1); x.drawImage(els.video,0,0,W,H); x.restore();
    x.drawImage(els.overlay,0,0,W,H);
    return c.toDataURL('image/jpeg',0.8);
  }
  function summary(){
    const n=els.count.textContent||'0';
    const cls=[...new Set((detect.lastPreds||[]).map(p=>p.class))].slice(0,3);
    return [`탐지 ${n}개`, ...cls];
  }
  if(window.Submit) Submit.init({ feature:'detect', label:'객체 탐지', capture:captureFrame, summary });

  /* 개념 도감 */
  const codex = $('codex');
  const openCodex = ()=>{ codex.classList.add('on'); codex.setAttribute('aria-hidden','false'); };
  const closeCodex = ()=>{ codex.classList.remove('on'); codex.setAttribute('aria-hidden','true'); };
  $('codexBtn').addEventListener('click', openCodex);
  $('codexX').addEventListener('click', closeCodex);
  codex.addEventListener('click', (e)=>{ if(e.target===codex) closeCodex(); });

  window.addEventListener('keydown',(e)=>{
    if(e.key==='Escape'){ if(codex.classList.contains('on')) closeCodex(); else location.href='../../explore.html'; }
  });
  window.addEventListener('pagehide', stopCam);
  window.addEventListener('pageshow',()=>{ document.body.style.opacity='1'; });
})();
