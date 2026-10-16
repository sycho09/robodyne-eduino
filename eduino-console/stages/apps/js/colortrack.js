(function(){
  const $ = (id)=>document.getElementById(id);
  const els = { video:$('video'), overlay:$('overlay'), cover:$('cover'), start:$('start'), stop:$('stop'),
    status:$('status'), fps:$('fps'), match:$('match'), bar:$('bar'), tol:$('tol'), tolv:$('tolv'),
    pick:$('pick'), swatches:$('swatches'), viewport:$('viewport') };
  const ct = { stream:null, raf:null, lastT:0, target:{r:220,g:50,b:50}, tol:140 };
  const PRESETS = [
    {n:'빨강', r:220,g:50,b:50}, {n:'주황', r:235,g:140,b:40}, {n:'노랑', r:235,g:205,b:40},
    {n:'초록', r:60,g:180,b:75}, {n:'파랑', r:50,g:90,b:220}, {n:'보라', r:150,g:70,b:200},
  ];

  function setStatus(t,cls){ els.status.textContent='● '+t; els.status.className='chip '+(cls||''); }
  function setAR(){ const vw=els.video.videoWidth, vh=els.video.videoHeight; if(vw&&vh) els.viewport.style.setProperty('--ar', vw+' / '+vh); }

  // 스와치
  els.swatches.innerHTML = PRESETS.map((p,i)=>`<div class="sw${i===0?' active':''}" data-i="${i}" title="${p.n}" style="background:rgb(${p.r},${p.g},${p.b})"></div>`).join('');
  [...els.swatches.children].forEach(sw=>sw.addEventListener('click',()=>{
    const p=PRESETS[+sw.dataset.i]; ct.target={r:p.r,g:p.g,b:p.b};
    [...els.swatches.children].forEach(x=>x.classList.toggle('active',x===sw));
    els.pick.value='#'+[p.r,p.g,p.b].map(v=>v.toString(16).padStart(2,'0')).join('');
  }));
  els.pick.addEventListener('input',()=>{ const h=els.pick.value;
    ct.target={r:parseInt(h.slice(1,3),16),g:parseInt(h.slice(3,5),16),b:parseInt(h.slice(5,7),16)};
    [...els.swatches.children].forEach(x=>x.classList.remove('active')); });
  els.tol.addEventListener('input',()=>{ ct.tol=+els.tol.value; els.tolv.textContent=els.tol.value; $('tTol').textContent=els.tol.value; });

  async function startCam(){
    if(ct.stream) return;
    if(!window.tf){ setStatus('ERROR','idle'); return; }
    els.start.classList.add('loading'); els.start.textContent='카메라 여는 중…'; setStatus('LOADING');
    try{
      ct.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}});
      els.video.srcObject=ct.stream; await els.video.play().catch(()=>{});
      setAR(); els.video.addEventListener('loadedmetadata', setAR, {once:true});
      els.cover.classList.add('hide'); setStatus('LIVE','live'); ct.lastT=performance.now(); loop();
    }catch(e){ console.error('[ct]',e); setStatus('CAMERA DENIED','idle');
      els.start.classList.remove('loading'); els.start.textContent='▶ 다시 시도'; }
  }
  function stopCam(){
    if(ct.stream){ ct.stream.getTracks().forEach(t=>t.stop()); ct.stream=null; }
    els.video.srcObject=null; if(ct.raf) cancelAnimationFrame(ct.raf);
    const ctx=els.overlay.getContext('2d'); ctx.clearRect(0,0,els.overlay.width,els.overlay.height);
    els.cover.classList.remove('hide'); els.start.classList.remove('loading'); els.start.textContent='▶ 카메라 켜기 · 추적 시작';
    setStatus('IDLE','idle'); els.fps.innerHTML='FPS <b>—</b>'; els.match.textContent='0%'; els.bar.style.width='0%';
    ct.frames=0; $('tInfer').innerHTML='— <small>ms</small>'; $('tFps').textContent='—'; $('tPx').textContent='0'; $('tFrames').textContent='0';
  }
  async function loop(){
    if(!ct.stream) return;
    if(els.video.readyState>=2 && window.tf){
      const W=160,H=120; setAR();
      try{
        const t0=performance.now();
        const t=tf.tidy(()=>tf.image.resizeBilinear(tf.browser.fromPixels(els.video),[H,W]));
        const d=await t.data(); t.dispose();
        els.overlay.width=W; els.overlay.height=H;
        const ctx=els.overlay.getContext('2d'); const img=ctx.createImageData(W,H); const tg=ct.target; let matched=0;
        for(let i=0;i<W*H;i++){ const dist=Math.abs(d[i*3]-tg.r)+Math.abs(d[i*3+1]-tg.g)+Math.abs(d[i*3+2]-tg.b); const o=i*4;
          if(dist<ct.tol){ matched++; } else { img.data[o]=8; img.data[o+1]=10; img.data[o+2]=16; img.data[o+3]=205; } }
        ctx.putImageData(img,0,0);
        const inferMs=performance.now()-t0; ct.frames=(ct.frames||0)+1; ct.lastMatch=matched;
        const pct=matched*100/(W*H); els.match.textContent=pct.toFixed(1)+'%'; els.bar.style.width=Math.min(100,pct*4).toFixed(0)+'%';
        const now=performance.now(), fps=1000/(now-ct.lastT); ct.lastT=now;
        els.fps.innerHTML='FPS <b>'+fps.toFixed(1)+'</b>';
        $('tInfer').innerHTML=inferMs.toFixed(0)+' <small>ms</small>'; $('tFps').textContent=fps.toFixed(1);
        $('tPx').textContent=matched; $('tFrames').textContent=ct.frames;
      }catch(e){ /* skip */ }
    }
    ct.raf=requestAnimationFrame(loop);
  }

  els.start.addEventListener('click', startCam);
  els.stop.addEventListener('click', stopCam);

  /* 미션 제출 — 영상+색상 마스크 스냅샷(둘 다 미러) */
  function captureFrame(){
    if(!ct.stream) return null;
    const vw=els.video.videoWidth||640, vh=els.video.videoHeight||480;
    const sc=Math.min(1,480/vw), W=Math.round(vw*sc), H=Math.round(vh*sc);
    const c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d');
    x.save(); x.translate(W,0); x.scale(-1,1); x.drawImage(els.video,0,0,W,H);
    x.imageSmoothingEnabled=false; x.drawImage(els.overlay,0,0,W,H); x.restore();
    return c.toDataURL('image/jpeg',0.8);
  }
  function summary(){ return ['일치 색 '+(els.match.textContent||'0%')]; }
  if(window.Submit) Submit.init({ feature:'colortrack', label:'색상 추적', capture:captureFrame, summary });

  const codex=$('codex'); const openC=()=>codex.classList.add('on'), closeC=()=>codex.classList.remove('on');
  $('codexBtn').addEventListener('click',openC); $('codexX').addEventListener('click',closeC);
  codex.addEventListener('click',e=>{ if(e.target===codex) closeC(); });
  window.addEventListener('keydown',e=>{ if(e.key==='Escape'){ codex.classList.contains('on')?closeC():location.href='../../explore.html'; } });
  window.addEventListener('pagehide', stopCam);
  window.addEventListener('pageshow',()=>{ document.body.style.opacity='1'; });
})();
