/* ── 히어로 라이브 데모 — 실사 사진 + 캔버스 오버레이 ────────────────────
   콘솔이 실제로 제공하는 체험 스테이지만 보여준다(표정 인식 같은 없는 기능 금지).
   좌표는 "사진 기준 0~1" 이다. 캔버스 비율이 사진과 달라도 cover 변환(rect)을 통과시켜
   그리므로, 창을 줄여 잘려도 박스가 피사체에서 떨어지지 않는다.
   사진 로드에 실패하면 같은 좌표를 캔버스 전체에 매핑해 도식으로 그린다. */
(function(){
  const cv = document.getElementById('demo-canvas');
  const arc = document.getElementById('m-arc'), pct = document.getElementById('m-pct'), rowsEl = document.getElementById('m-rows');
  if (!cv || !cv.getContext) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;                       // 캔버스 미지원 환경 가드

  const DC = 251.3;                       // 2πr (r=40) — 도넛 둘레
  const BLUE = '#6aa6ff', GREEN = '#42e29b', AMBER = '#ffd36a', LABEL = 'rgba(11,16,32,.74)';
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));

  const IMGS = {};
  ['vision-face','vision-pose','vision-detect'].forEach(name => {
    const rec = { img: new Image(), ok: false }; IMGS[name] = rec;
    rec.img.onload = () => { if (rec.img.width > 0) { rec.ok = true; refreshStatic(); } };
    rec.img.src = 'img/demo/' + name + '.webp';
  });

  function rr(x,y,w,h,r){
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x,y,w,h,r);
    else { ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
  }
  /* 칩은 피사체 기준으로 배치하지만, 캔버스 밖으로 나가면 잘리므로 항상 안쪽으로 되민다 */
  function chip(x,y,txt,col){
    ctx.font = '600 11px Pretendard,sans-serif'; ctx.textBaseline='middle'; ctx.textAlign='left';
    const tw = ctx.measureText(txt).width, pad = 8, bh = 20, bw = tw+pad*2;
    x = clamp(x, 6, Math.max(6, cv.clientWidth - bw - 6));
    y = clamp(y, 6, Math.max(6, cv.clientHeight - bh - 6));
    ctx.fillStyle = col; rr(x, y, bw, bh, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(txt, x+pad, y+bh/2+.5);
  }
  /* 사진을 cover 로 깔고, 사진이 캔버스 어디에 놓였는지(rect)를 돌려준다 */
  function cover(im,w,h){
    const ir = im.width/im.height, sr = w/h; let dw, dh;
    if (ir > sr) { dh = h; dw = h*ir; } else { dw = w; dh = w/ir; }
    const dx = (w-dw)/2, dy = (h-dh)/2;
    ctx.drawImage(im, dx, dy, dw, dh);
    ctx.fillStyle = 'rgba(10,13,26,.26)'; ctx.fillRect(0,0,w,h);   // 오버레이 가독용 스크림
    return { dx, dy, dw, dh };
  }
  function fallback(w,h){                 // 사진이 없을 때의 도식 배경
    ctx.fillStyle = '#0f1320'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
    for (let x=24; x<w; x+=26){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    for (let y=24; y<h; y+=26){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    return { dx:0, dy:0, dw:w, dh:h };
  }
  function base(name,w,h){ const im = IMGS[name]; return (im && im.ok) ? cover(im.img,w,h) : fallback(w,h); }

  /* 사진 기준 좌표(0~1) — 위 3장의 실제 피사체 위치에 맞춰 측정한 값 */
  const FACE_BOX = [.434,.042,.144,.333];
  const FACE_PTS = [[.482,.229],[.539,.222],[.512,.285],[.494,.333],[.534,.329]];
  const POSE = { nose:[.504,.257], sl:[.469,.333], sr:[.543,.333], el:[.435,.208], er:[.577,.208],
                 wl:[.410,.118], wr:[.600,.118], hl:[.477,.569], hr:[.531,.569],
                 kl:[.478,.722], kr:[.525,.722], al:[.477,.889], ar:[.525,.889] };
  const BONES = [['nose','sl'],['nose','sr'],['sl','sr'],['sl','el'],['el','wl'],['sr','er'],['er','wr'],
                 ['sl','hl'],['sr','hr'],['hl','hr'],['hl','kl'],['kl','al'],['hr','kr'],['kr','ar']];
  const OBJS = [ { box:[.332,.358,.336,.524], label:'노트북 94%', col:BLUE },
                 { box:[.152,.611,.121,.208], label:'컵 88%',    col:AMBER },
                 { box:[.706,.667,.238,.222], label:'책 81%',    col:GREEN } ];

  const SCENES = {};
  SCENES.face = (w,h,t) => {
    const r = base('vision-face',w,h), X = nx => r.dx+nx*r.dw, Y = ny => r.dy+ny*r.dh;
    const ap = clamp((t-260)/460, 0, 1); if (ap <= 0) { chip(12,12,'얼굴 검출 · BlazeFace',LABEL); return; }
    ctx.save(); ctx.globalAlpha = ap;
    const bx = X(FACE_BOX[0]), by = Y(FACE_BOX[1]), bw = FACE_BOX[2]*r.dw, bh = FACE_BOX[3]*r.dh;
    ctx.strokeStyle = BLUE; ctx.lineWidth = 2.5; rr(bx,by,bw,bh,8); ctx.stroke();
    chip(bx, by-25, '얼굴 1명 96%', BLUE);
    if (t > 620) { ctx.fillStyle = GREEN; FACE_PTS.forEach(p => { ctx.beginPath(); ctx.arc(X(p[0]),Y(p[1]),3,0,7); ctx.fill(); }); }
    ctx.restore();
    chip(12,12,'얼굴 검출 · BlazeFace',LABEL);
  };
  SCENES.pose = (w,h,t) => {
    const r = base('vision-pose',w,h), X = nx => r.dx+nx*r.dw, Y = ny => r.dy+ny*r.dh;
    const ap = clamp((t-260)/460, 0, 1); if (ap <= 0) { chip(12,12,'뼈대 검출 · MoveNet',LABEL); return; }
    ctx.save(); ctx.globalAlpha = ap;
    ctx.strokeStyle = BLUE; ctx.lineWidth = 3; ctx.lineCap = 'round';
    BONES.forEach(b => { const a = POSE[b[0]], c = POSE[b[1]];
      ctx.beginPath(); ctx.moveTo(X(a[0]),Y(a[1])); ctx.lineTo(X(c[0]),Y(c[1])); ctx.stroke(); });
    ctx.fillStyle = '#fff'; Object.keys(POSE).forEach(k => { ctx.beginPath(); ctx.arc(X(POSE[k][0]),Y(POSE[k][1]),3.4,0,7); ctx.fill(); });
    chip(X(POSE.wl[0]), Y(POSE.wl[1])-28, '사람 1명 94%', BLUE);
    ctx.restore();
    chip(12,12,'뼈대 검출 · MoveNet',LABEL);
  };
  SCENES.detect = (w,h,t) => {
    const r = base('vision-detect',w,h), X = nx => r.dx+nx*r.dw, Y = ny => r.dy+ny*r.dh;
    OBJS.forEach((o,i) => {
      const ap = clamp((t-260-i*380)/460, 0, 1); if (ap <= 0) return;
      ctx.save(); ctx.globalAlpha = ap;
      ctx.strokeStyle = o.col; ctx.lineWidth = 2.5;
      rr(X(o.box[0]), Y(o.box[1]), o.box[2]*r.dw, o.box[3]*r.dh, 8); ctx.stroke();
      chip(X(o.box[0]), Y(o.box[1])-25, o.label, o.col);
      ctx.restore();
    });
    chip(12,12,'객체 탐지 · COCO-SSD',LABEL);
  };

  const STAGES = [
    { id:'face',   conf:96, rows:[['검출된 얼굴','1명'],['랜드마크','5점'],['처리','브라우저 온디바이스']] },
    { id:'pose',   conf:94, rows:[['검출된 사람','1명'],['관절','17점'],['처리','브라우저 온디바이스']] },
    { id:'detect', conf:94, rows:[['검출된 사물','3개'],['인식 범위','90종'],['처리','브라우저 온디바이스']] },
  ];

  function size(){
    const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.max(1, w*dpr); cv.height = Math.max(1, h*dpr); ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function panel(s){
    if (arc) arc.setAttribute('stroke-dasharray', (s.conf/100*DC).toFixed(1)+' '+DC);
    if (pct) pct.textContent = s.conf+'%';
    if (rowsEl) rowsEl.innerHTML = s.rows.map(r => `<div class="row"><span>${r[0]}</span><span class="val">${r[1]}</span></div>`).join('');
  }

  const now0 = () => (window.performance && performance.now) ? performance.now() : Date.now();
  let cur = 0, tBase = now0();
  function draw(t){ SCENES[STAGES[cur].id](cv.clientWidth, cv.clientHeight, t); }
  /* 애니메이션을 끈 상태에서는 rAF 가 없으므로, 사진이 늦게 도착하거나 창이 바뀌면 직접 다시 그린다 */
  function refreshStatic(){ if (reduce) draw(2000); }
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  size(); window.addEventListener('resize', () => { size(); refreshStatic(); });
  panel(STAGES[0]);

  if (reduce) { draw(2000); return; }
  requestAnimationFrame(function frame(now){ draw(Math.max(0, now-tBase)); requestAnimationFrame(frame); });
  setInterval(() => { cur = (cur+1) % STAGES.length; tBase = now0(); panel(STAGES[cur]); }, 2800);
})();
