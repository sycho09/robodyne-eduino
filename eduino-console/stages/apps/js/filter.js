(function(){
  const $ = (id)=>document.getElementById(id);
  const els = { video:$('video'), overlay:$('overlay'), cover:$('cover'), start:$('start'), stop:$('stop'),
    status:$('status'), fps:$('fps'), modeName:$('modeName'), modes:$('modes'),
    motion:$('motion'), motionBar:$('motionBar'), motionRow:$('motionRow'), viewport:$('viewport') };
  const ff = { stream:null, raf:null, mode:'none', prev:null, lastT:0, params:{bright:100,contrast:100,blur:0} };
  const FF_CSS = { none:'', gray:'grayscale(1)', invert:'invert(1)', contrast:'grayscale(1) contrast(4) brightness(1.1)', blur:'blur(6px)' };
  const FF_LABEL = { none:'원본', gray:'흑백', invert:'색 반전', contrast:'고대비', blur:'블러', motion:'모션 감지' };
  const MODES = ['none','gray','invert','contrast','blur','motion'];

  function setStatus(t,cls){ els.status.textContent='● '+t; els.status.className='chip '+(cls||''); }
  function setAR(){ const vw=els.video.videoWidth, vh=els.video.videoHeight; if(vw&&vh) els.viewport.style.setProperty('--ar', vw+' / '+vh); }

  els.modes.innerHTML = MODES.map(m=>`<button class="modebtn${m==='none'?' active':''}" data-m="${m}">${FF_LABEL[m]}</button>`).join('');
  [...els.modes.children].forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.m)));

  function buildCSS(){ const p=ff.params; const preset=ff.mode==='motion'?'':(FF_CSS[ff.mode]||'');
    return `${preset} brightness(${p.bright}%) contrast(${p.contrast}%) blur(${p.blur}px)`.trim(); }
  function apply(){ if(ff.mode!=='motion') els.video.style.filter=buildCSS(); }
  function clearCanvas(){ const c=els.overlay.getContext('2d'); c.clearRect(0,0,els.overlay.width,els.overlay.height); }
  const TEL={bright:'tBright',contrast:'tContrast',blur:'tBlur'};
  const bind=(id,key,unit)=>{ const el=$(id), v=$(id+'v'); el.addEventListener('input',()=>{ ff.params[key]=+el.value; if(v) v.textContent=el.value+unit; if(TEL[key]) $(TEL[key]).textContent=el.value+unit; apply(); }); };
  bind('bright','bright','%'); bind('contrast','contrast','%'); bind('blur','blur','px');

  function setMode(m){
    if(!FF_LABEL[m]) return; ff.mode=m;
    [...els.modes.children].forEach(b=>b.classList.toggle('active',b.dataset.m===m));
    els.modeName.textContent=FF_LABEL[m]; $('tMode').textContent=FF_LABEL[m];
    els.motionRow.style.display = (m==='motion')?'':'none';
    if(m==='motion'){ els.video.style.filter=''; clearCanvas(); if(ff.stream){ if(ff.raf) cancelAnimationFrame(ff.raf); motionLoop(); } }
    else { if(ff.raf) cancelAnimationFrame(ff.raf); ff.raf=null; els.video.style.filter=buildCSS(); clearCanvas(); ff.prev=null;
      $('tFps').textContent='—'; $('tMove').textContent='—'; }
  }

  async function startCam(){
    if(ff.stream) return;
    els.start.classList.add('loading'); els.start.textContent='카메라 여는 중…'; setStatus('LOADING');
    try{
      ff.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}});
      els.video.srcObject=ff.stream; await els.video.play().catch(()=>{});
      setAR(); els.video.addEventListener('loadedmetadata', setAR, {once:true});
      els.cover.classList.add('hide'); setStatus('LIVE','live'); ff.lastT=performance.now(); setMode(ff.mode);
    }catch(e){ console.error('[ff]',e); setStatus('CAMERA DENIED','idle');
      els.start.classList.remove('loading'); els.start.textContent='▶ 다시 시도'; }
  }
  function stopCam(){
    if(ff.stream){ ff.stream.getTracks().forEach(t=>t.stop()); ff.stream=null; }
    els.video.srcObject=null; if(ff.raf) cancelAnimationFrame(ff.raf); ff.raf=null;
    els.video.style.filter=''; clearCanvas(); ff.prev=null;
    els.cover.classList.remove('hide'); els.start.classList.remove('loading'); els.start.textContent='▶ 카메라 켜기 · 효과 시작';
    setStatus('IDLE','idle'); els.fps.innerHTML='FPS <b>—</b>'; els.motion.textContent='0%'; els.motionBar.style.width='0%';
    $('tFps').textContent='—'; $('tMove').textContent='—';
  }
  async function motionLoop(){
    if(ff.mode!=='motion'||!ff.stream) return;
    if(els.video.readyState>=2 && window.tf){
      const W=160,H=120; setAR();
      try{
        const gray=tf.tidy(()=>tf.image.resizeBilinear(tf.browser.fromPixels(els.video),[H,W]).mean(2));
        const cur=await gray.data(); gray.dispose();
        if(ff.prev && ff.prev.length===cur.length){
          els.overlay.width=W; els.overlay.height=H;
          const ctx=els.overlay.getContext('2d'); const img=ctx.createImageData(W,H); let moved=0;
          for(let i=0;i<cur.length;i++){ const o=i*4; if(Math.abs(cur[i]-ff.prev[i])>22){ moved++;
            img.data[o]=255; img.data[o+1]=40; img.data[o+2]=70; img.data[o+3]=170; } }
          ctx.putImageData(img,0,0);
          const pct=moved*100/cur.length; els.motion.textContent=pct.toFixed(1)+'%'; els.motionBar.style.width=Math.min(100,pct*3).toFixed(0)+'%';
          $('tMove').textContent=pct.toFixed(1)+'%';
        }
        ff.prev=cur;
        const now=performance.now(), fps=1000/(now-ff.lastT); ff.lastT=now;
        els.fps.innerHTML='FPS <b>'+fps.toFixed(1)+'</b>'; $('tFps').textContent=fps.toFixed(1);
      }catch(e){ /* skip */ }
    }
    ff.raf=requestAnimationFrame(motionLoop);
  }

  els.start.addEventListener('click', startCam);
  els.stop.addEventListener('click', stopCam);

  /* 미션 제출 — 적용된 효과 그대로 스냅샷(미러+CSS필터 재현) */
  function captureFrame(){
    if(!ff.stream) return null;
    const vw=els.video.videoWidth||640, vh=els.video.videoHeight||480;
    const sc=Math.min(1,480/vw), W=Math.round(vw*sc), H=Math.round(vh*sc);
    const c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d');
    x.save(); x.filter = ff.mode==='motion'?'none':buildCSS(); x.translate(W,0); x.scale(-1,1); x.drawImage(els.video,0,0,W,H); x.restore();
    if(ff.mode==='motion'){ x.save(); x.translate(W,0); x.scale(-1,1); x.imageSmoothingEnabled=false; x.drawImage(els.overlay,0,0,W,H); x.restore(); }
    return c.toDataURL('image/jpeg',0.85);
  }
  function summary(){ const s=['효과 '+FF_LABEL[ff.mode]]; if(ff.mode==='motion') s.push('움직임 '+(els.motion.textContent||'0%')); return s; }
  if(window.Submit) Submit.init({ feature:'filter', label:'영상 효과', capture:captureFrame, summary });

  const codex=$('codex'); const openC=()=>codex.classList.add('on'), closeC=()=>codex.classList.remove('on');
  $('codexBtn').addEventListener('click',openC); $('codexX').addEventListener('click',closeC);
  codex.addEventListener('click',e=>{ if(e.target===codex) closeC(); });
  window.addEventListener('keydown',e=>{ if(e.key==='Escape'){ codex.classList.contains('on')?closeC():location.href='../../explore.html'; } });
  window.addEventListener('pagehide', stopCam);
  window.addEventListener('pageshow',()=>{ document.body.style.opacity='1'; });
})();
