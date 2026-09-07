(function(){
  const $ = (id)=>document.getElementById(id);
  const els = { video:$('video'), overlay:$('overlay'), cover:$('cover'), start:$('start'), stop:$('stop'),
    status:$('status'), fps:$('fps'), count:$('count'), bar:$('bar'), min:$('min'), minv:$('minv'), viewport:$('viewport') };
  const skel = { detector:null, stream:null, raf:null, lastT:0, minScore:0.3 };
  const EDGES = [[5,7],[7,9],[6,8],[8,10],[5,6],[5,11],[6,12],[11,12],[11,13],[13,15],[12,14],[14,16],[0,5],[0,6]];

  function setStatus(t,cls){ els.status.textContent='● '+t; els.status.className='chip '+(cls||''); }
  function setAR(){ const vw=els.video.videoWidth, vh=els.video.videoHeight; if(vw&&vh) els.viewport.style.setProperty('--ar', vw+' / '+vh); }
  els.min.addEventListener('input', ()=>{ skel.minScore=(+els.min.value)/100; els.minv.textContent=els.min.value+'%'; });

  async function startCam(){
    if(skel.stream) return;
    els.start.classList.add('loading'); els.start.textContent='모델 불러오는 중…'; setStatus('LOADING');
    try{
      /* 저장소에 번들한 모델 — 기본값(tfhub.dev)은 데스크톱 앱에서 403 (근거: docs/result-studio.md) */
      if(!skel.detector) skel.detector=await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet, { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
          modelUrl: '../../models/movenet/singlepose-lightning/model.json' });
      skel.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}});
      els.video.srcObject=skel.stream; await els.video.play().catch(()=>{});
      setAR(); els.video.addEventListener('loadedmetadata', setAR, {once:true});
      els.cover.classList.add('hide'); setStatus('LIVE','live'); skel.lastT=performance.now(); loop();
    }catch(e){ console.error('[skel]',e); setStatus('ERROR','idle');
      els.start.classList.remove('loading'); els.start.textContent='▶ 다시 시도'; }
  }
  function stopCam(){
    if(skel.stream){ skel.stream.getTracks().forEach(t=>t.stop()); skel.stream=null; }
    els.video.srcObject=null; if(skel.raf) cancelAnimationFrame(skel.raf);
    const ctx=els.overlay.getContext('2d'); ctx.clearRect(0,0,els.overlay.width,els.overlay.height);
    els.cover.classList.remove('hide'); els.start.classList.remove('loading'); els.start.textContent='▶ 카메라 켜기 · 뼈대 시작';
    setStatus('IDLE','idle'); els.fps.innerHTML='FPS <b>—</b>'; els.count.textContent='0 / 17'; els.bar.style.width='0%';
    skel.frames=0; ['tFps','tAvg','tRes'].forEach(id=>$(id).textContent='—');
    $('tInfer').innerHTML='— <small>ms</small>'; $('tJoints').textContent='0/17'; $('tFrames').textContent='0';
  }
  async function loop(){
    if(!skel.stream) return;
    if(skel.detector && els.video.readyState>=2){
      const vw=els.video.videoWidth, vh=els.video.videoHeight; els.overlay.width=vw; els.overlay.height=vh; setAR();
      try{
        const t0=performance.now();
        const poses=await skel.detector.estimatePoses(els.video);
        const inferMs=performance.now()-t0; skel.frames=(skel.frames||0)+1;
        const ctx=els.overlay.getContext('2d'); ctx.clearRect(0,0,vw,vh); let good=0, sum=0;
        if(poses[0]){ const kp=poses[0].keypoints;
          ctx.strokeStyle='#3b86ff'; ctx.lineWidth=4; ctx.lineCap='round';
          EDGES.forEach(([a,b])=>{ if(kp[a].score>skel.minScore&&kp[b].score>skel.minScore){
            ctx.beginPath(); ctx.moveTo(kp[a].x,kp[a].y); ctx.lineTo(kp[b].x,kp[b].y); ctx.stroke(); } });
          ctx.fillStyle='#6aa6ff';
          kp.forEach(p=>{ if(p.score>skel.minScore){ good++; sum+=p.score; ctx.beginPath(); ctx.arc(p.x,p.y,5,0,Math.PI*2); ctx.fill(); } });
        }
        els.count.textContent=good+' / 17'; els.bar.style.width=Math.round(good/17*100)+'%';
        const now=performance.now(), fps=1000/(now-skel.lastT); skel.lastT=now;
        els.fps.innerHTML='FPS <b>'+fps.toFixed(1)+'</b>';
        $('tInfer').innerHTML=inferMs.toFixed(0)+' <small>ms</small>'; $('tFps').textContent=fps.toFixed(1);
        $('tJoints').textContent=good+'/17'; $('tAvg').textContent=good?Math.round(sum/good*100)+'%':'—';
        $('tRes').textContent=vw+'×'+vh; $('tFrames').textContent=skel.frames;
      }catch(e){ /* skip */ }
    }
    skel.raf=requestAnimationFrame(loop);
  }

  els.start.addEventListener('click', startCam);
  els.stop.addEventListener('click', stopCam);

  /* 미션 제출 — 영상+뼈대 스냅샷(둘 다 미러) */
  function captureFrame(){
    if(!skel.stream) return null;
    const vw=els.video.videoWidth||640, vh=els.video.videoHeight||480;
    const sc=Math.min(1,480/vw), W=Math.round(vw*sc), H=Math.round(vh*sc);
    const c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d');
    x.save(); x.translate(W,0); x.scale(-1,1); x.drawImage(els.video,0,0,W,H); x.drawImage(els.overlay,0,0,W,H); x.restore();
    return c.toDataURL('image/jpeg',0.8);
  }
  function summary(){ return ['관절 '+(els.count.textContent||'0/17')]; }
  if(window.Submit) Submit.init({ feature:'skeleton', label:'뼈대 검출', capture:captureFrame, summary });

  const codex=$('codex'); const openC=()=>codex.classList.add('on'), closeC=()=>codex.classList.remove('on');
  $('codexBtn').addEventListener('click',openC); $('codexX').addEventListener('click',closeC);
  codex.addEventListener('click',e=>{ if(e.target===codex) closeC(); });
  window.addEventListener('keydown',e=>{ if(e.key==='Escape'){ codex.classList.contains('on')?closeC():location.href='../../explore.html'; } });
  window.addEventListener('pagehide', stopCam);
  window.addEventListener('pageshow',()=>{ document.body.style.opacity='1'; });
})();
