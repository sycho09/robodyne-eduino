(function(){
  const $ = (id)=>document.getElementById(id);
  const els = { video:$('video'), boxes:$('boxes'), cover:$('cover'), start:$('start'), stop:$('stop'),
    status:$('status'), fps:$('fps'), count:$('count'), bar:$('bar'), viewport:$('viewport') };
  const face = { model:null, stream:null, raf:null, lastT:0 };

  function setStatus(t,cls){ els.status.textContent='● '+t; els.status.className='chip '+(cls||''); }
  function setAR(){ const vw=els.video.videoWidth, vh=els.video.videoHeight; if(vw&&vh) els.viewport.style.setProperty('--ar', vw+' / '+vh); }

  function faceBox(p){
    const flat=(v)=>{ if(v==null) return []; if(typeof v.arraySync==='function'){ try{v=v.arraySync();}catch(e){return [];} }
      const out=[]; (function rec(a){ if(Array.isArray(a)) a.forEach(rec); else if(typeof a==='number'&&Number.isFinite(a)) out.push(a); })(v); return out; };
    const nums=flat(p.topLeft).concat(flat(p.bottomRight));
    if(nums.length>=4){ const [x1,y1,x2,y2]=nums, w=x2-x1, h=y2-y1; if(w>0&&h>0) return {x:x1,y:y1,w,h}; }
    let lm=p.landmarks; if(lm&&typeof lm.arraySync==='function'){ try{lm=lm.arraySync();}catch(e){lm=null;} }
    if(Array.isArray(lm)&&lm.length){ const xs=lm.map(q=>q[0]).filter(Number.isFinite), ys=lm.map(q=>q[1]).filter(Number.isFinite);
      if(xs.length&&ys.length){ const x0=Math.min(...xs),y0=Math.min(...ys),x1=Math.max(...xs),y1=Math.max(...ys);
        return {x:x0-25,y:y0-45,w:(x1-x0)+50,h:(y1-y0)+75}; } }
    return null;
  }

  async function startCam(){
    if(face.stream) return;
    els.start.classList.add('loading'); els.start.textContent='카메라 여는 중…'; setStatus('LOADING');
    try{
      face.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}});
      els.video.srcObject=face.stream; await els.video.play().catch(()=>{});
      setAR(); els.video.addEventListener('loadedmetadata', setAR, {once:true});
      els.cover.classList.add('hide'); face.lastT=performance.now(); loop();
    }catch(e){ console.error('[face cam]',e); setStatus('CAMERA DENIED','idle');
      els.start.classList.remove('loading'); els.start.textContent='▶ 다시 시도'; return; }
    try{
      if(!window.blazeface){ setStatus('모델 없음','idle'); return; }
      if(!face.model) face.model=await blazeface.load();
      setStatus('LIVE','live');
    }catch(e){ console.error('[face model]',e); setStatus('MODEL ERROR','idle'); }
  }
  function stopCam(){
    if(face.stream){ face.stream.getTracks().forEach(t=>t.stop()); face.stream=null; }
    els.video.srcObject=null; if(face.raf) cancelAnimationFrame(face.raf);
    els.boxes.innerHTML=''; els.cover.classList.remove('hide');
    els.start.classList.remove('loading'); els.start.textContent='▶ 카메라 켜기 · 검출 시작';
    setStatus('IDLE','idle'); els.fps.innerHTML='FPS <b>—</b>'; els.count.textContent='0'; els.bar.style.width='0%';
    face.frames=0; ['tFps','tMax','tAvg','tRes'].forEach(id=>$(id).textContent='—');
    $('tInfer').innerHTML='— <small>ms</small>'; $('tFrames').textContent='0';
  }
  async function loop(){
    if(!face.stream){ return; }
    if(face.model && els.video.readyState>=2){
      const vw=els.video.videoWidth, vh=els.video.videoHeight; setAR();
      const W=els.boxes.clientWidth||vw, H=els.boxes.clientHeight||vh, sx=W/vw, sy=H/vh;
      try{
        const t0=performance.now();
        const preds=await face.model.estimateFaces(els.video,false,false,true);
        const inferMs=performance.now()-t0;
        face.lastPreds=preds; face.frames=(face.frames||0)+1;
        let html='', probs=[];
        preds.forEach(p=>{ const box=faceBox(p); if(!box||!Number.isFinite(box.w)||box.w<=0) return;
          const dw=box.w*sx, dh=box.h*sy, dx=box.x*sx, dy=box.y*sy, left=W-dx-dw;
          const prob=Array.isArray(p.probability)?p.probability[0]:(typeof p.probability==='number'?p.probability:1); probs.push(prob);
          html+=`<div class="det-box" style="left:${left.toFixed(1)}px;top:${dy.toFixed(1)}px;width:${dw.toFixed(1)}px;height:${dh.toFixed(1)}px"><span>FACE ${Math.round(prob*100)}%</span></div>`; });
        els.boxes.innerHTML=html;
        els.count.textContent=preds.length; els.bar.style.width=Math.min(100,preds.length*25)+'%';
        const now=performance.now(), fps=1000/(now-face.lastT); face.lastT=now;
        els.fps.innerHTML='FPS <b>'+fps.toFixed(1)+'</b>';
        $('tInfer').innerHTML=inferMs.toFixed(0)+' <small>ms</small>'; $('tFps').textContent=fps.toFixed(1);
        $('tMax').textContent=probs.length?Math.round(Math.max(...probs)*100)+'%':'—';
        $('tAvg').textContent=probs.length?Math.round(probs.reduce((a,b)=>a+b,0)/probs.length*100)+'%':'—';
        $('tRes').textContent=vw+'×'+vh; $('tFrames').textContent=face.frames;
      }catch(e){ /* skip */ }
    }
    face.raf=requestAnimationFrame(loop);
  }

  els.start.addEventListener('click', startCam);
  els.stop.addEventListener('click', stopCam);

  /* 미션 제출 — 영상+얼굴 박스 스냅샷 */
  function captureFrame(){
    if(!face.stream) return null;
    const vw=els.video.videoWidth||640, vh=els.video.videoHeight||480;
    const sc=Math.min(1,480/vw), W=Math.round(vw*sc), H=Math.round(vh*sc);
    const c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d');
    x.save(); x.translate(W,0); x.scale(-1,1); x.drawImage(els.video,0,0,W,H); x.restore();
    x.strokeStyle='#00e0a4'; x.lineWidth=Math.max(2,W/170);
    (face.lastPreds||[]).forEach(p=>{ const b=faceBox(p); if(!b||b.w<=0) return;
      const dw=b.w*sc, dh=b.h*sc, dx=b.x*sc, dy=b.y*sc, left=W-dx-dw; x.strokeRect(left,dy,dw,dh); });
    return c.toDataURL('image/jpeg',0.8);
  }
  function summary(){ return ['얼굴 '+(els.count.textContent||'0')+'명']; }
  if(window.Submit) Submit.init({ feature:'face', label:'얼굴 검출', capture:captureFrame, summary });

  const codex=$('codex'); const openC=()=>codex.classList.add('on'), closeC=()=>codex.classList.remove('on');
  $('codexBtn').addEventListener('click',openC); $('codexX').addEventListener('click',closeC);
  codex.addEventListener('click',e=>{ if(e.target===codex) closeC(); });
  window.addEventListener('keydown',e=>{ if(e.key==='Escape'){ codex.classList.contains('on')?closeC():location.href='../../explore.html'; } });
  window.addEventListener('pagehide', stopCam);
  window.addEventListener('pageshow',()=>{ document.body.style.opacity='1'; });
})();
