/* 코스 "동작 미리보기" 캔버스 애니메이션 — 단일 소스.
   platform/course.html 의 코스 상세와 modules/ 학습 대시보드 1단계
   (학습 미리보기) 가 이 파일 하나를 함께 쓴다.
   CDN·카메라 권한 0. 코스마다 장면 몇 개를 3.6초씩 자동 순환한다.

   사용법:
     CoursePreview.markup()            → .demo 블록 HTML 문자열
     CoursePreview.mount(root, key)    → 그 블록 안에서 애니메이션 시작
   root 안에 .demo-feats / canvas.demo-canvas 가 있어야 한다. */
(function (global) {
const PAL = { bg:'#0f1320', grid:'rgba(255,255,255,.05)', red:'#f0473a', green:'#11a06f', blue:'#4d8dff', amber:'#ff8a3d', dim:'rgba(255,255,255,.5)' };
const ease = (t) => t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
function rr(ctx,x,y,w,h,r){ ctx.beginPath();
  if(ctx.roundRect){ ctx.roundRect(x,y,w,h,r); }
  else { ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); } }
function chip(ctx,x,y,txt,col){ ctx.font='600 12px Pretendard,sans-serif'; ctx.textBaseline='middle'; ctx.textAlign='left';
  const tw=ctx.measureText(txt).width, pad=9, bh=22;
  ctx.fillStyle=col; rr(ctx,x,y,tw+pad*2,bh,6); ctx.fill();
  ctx.fillStyle='#fff'; ctx.fillText(txt,x+pad,y+bh/2+.5); }
function bar(ctx,x,y,w,frac,col){ ctx.fillStyle='rgba(255,255,255,.14)'; rr(ctx,x,y,w,8,4); ctx.fill();
  ctx.fillStyle=col; rr(ctx,x,y,clamp(frac,0,1)*w,8,4); ctx.fill(); }
function screen(ctx,w,h){ ctx.clearRect(0,0,w,h); ctx.fillStyle=PAL.bg; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle=PAL.grid; ctx.lineWidth=1;
  for(let x=24;x<w;x+=26){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
  for(let y=24;y<h;y+=26){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); } }
function coverImg(ctx,im,w,h){ const ir=im.width/im.height, sr=w/h; let dw,dh;
  if(ir>sr){ dh=h; dw=h*ir; } else { dw=w; dh=w/ir; }
  ctx.drawImage(im,(w-dw)/2,(h-dh)/2,dw,dh); }
function scrim(ctx,w,h){ ctx.fillStyle='rgba(15,19,32,.30)'; ctx.fillRect(0,0,w,h); }

/* 실사 배경 (선택적) — 있으면 도식 대신 사진 위에 오버레이, 없으면 도식 폴백.
   확장자(png/jpg/webp) 자동 감지. */
const DEMO_IMG = { v_detect:'vision-detect', v_face:'vision-face', v_pose:'vision-pose', v_classify:'vision-classify', l_qr:'life-qr', l_ocr:'life-ocr', g_track:'gesture-hand', g_rps:'gesture-hand' };
const IMGS = {};
if(typeof Image !== 'undefined'){
  Object.keys(DEMO_IMG).forEach(id=>{ const name=DEMO_IMG[id];
    const rec={img:new Image(), ok:false}; IMGS[id]=rec;
    rec.img.onload=()=>{ if(rec.img.width>0) rec.ok=true; };
    rec.img.src='/platform/img/demo/'+name+'.webp'; });
}

const DATA_PTS = Array.from({length:14}, (_,i)=>{ const x=i/13; return [x, clamp(0.14+x*0.72+Math.sin(i*9.73)*0.11, 0.05, 0.95)]; });
const CPTS = Array.from({length:30}, (_,i)=>{ const a=(Math.sin(i*12.9)*0.5+0.5), b=(Math.cos(i*7.31)*0.5+0.5); return [a*0.9+0.05, b*0.86+0.05, (a+b)>1 ? 1 : 0]; });
const QR = (()=>{ const n=11, g=[]; for(let r=0;r<n;r++){ const row=[]; for(let cc=0;cc<n;cc++){ row.push((Math.sin(r*3.1+cc*1.73)*Math.cos(cc*2.29-r*0.91))>0 ? 1:0); } g.push(row); } return g; })();
const CLC = [[.26,.32],[.7,.36],[.46,.76]];
const CL_PTS = (()=>{ const a=[]; CLC.forEach((c,ci)=>{ for(let i=0;i<8;i++){ a.push([clamp(c[0]+Math.sin(ci*9+i*2.1)*0.1,.04,.96), clamp(c[1]+Math.cos(ci*5+i*1.7)*0.12,.04,.96), ci]); } }); return a; })();

function drawPill(ctx,cx,y,txt){ ctx.font='600 14px Pretendard,sans-serif'; ctx.textBaseline='middle'; ctx.textAlign='left';
  const tw=ctx.measureText(txt).width, pad=12, bh=30, x=cx-(tw+pad*2)/2;
  ctx.fillStyle='rgba(255,255,255,.1)'; ctx.strokeStyle='rgba(255,255,255,.25)'; ctx.lineWidth=1.5; rr(ctx,x,y-bh/2,tw+pad*2,bh,8); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#fff'; ctx.fillText(txt,x+pad,y); }
function drawHand(ctx,px,py,pr,pose){
  ctx.fillStyle='rgba(240,71,58,.16)'; ctx.strokeStyle=PAL.red; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(px,py,pr,0,7); ctx.fill(); ctx.stroke();
  for(let f=0;f<5;f++){ const ang=-Math.PI/2+(f-2)*0.46, len=pr*(0.5+pose[f]*1.9);
    const jx=px+Math.cos(ang)*pr, jy=py+Math.sin(ang)*pr, tx=px+Math.cos(ang)*(pr+len), ty=py+Math.sin(ang)*(pr+len), mx=(jx+tx)/2, my=(jy+ty)/2;
    ctx.strokeStyle=PAL.red; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(jx,jy); ctx.lineTo(mx,my); ctx.lineTo(tx,ty); ctx.stroke();
    [[jx,jy],[mx,my],[tx,ty]].forEach(p=>{ ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(p[0],p[1],3,0,7); ctx.fill(); }); } }

const RPS = [[.15,.1,.1,.1,.1],[1,1,1,1,1],[.15,1,1,.15,.15]];
// 실사 손 사진 위에 얹는 21-포인트 손 랜드마크 템플릿(엄지 오른쪽·손바닥 정면 기준, gesture-hand 사진에 정합)
const HAND21 = [
  [.50,.96],
  [.67,.80],[.77,.70],[.84,.61],[.90,.54],        // thumb (오른쪽)
  [.59,.58],[.61,.43],[.62,.31],[.63,.21],        // index
  [.49,.55],[.49,.38],[.49,.25],[.49,.13],        // middle
  [.39,.58],[.37,.43],[.36,.31],[.35,.22],        // ring
  [.29,.63],[.25,.51],[.22,.41],[.20,.33],        // pinky (왼쪽)
];
const HAND_CONN = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20]];
// 사진 속 손 영역(정규: x,y,w,h)에 랜드마크를 그림
function drawHandLM(ctx, rx, ry, rw, rh) {
  const P = HAND21.map(p => [rx + p[0]*rw, ry + p[1]*rh]);
  ctx.strokeStyle = PAL.red; ctx.lineWidth = 2.5;
  HAND_CONN.forEach(([a,b]) => { ctx.beginPath(); ctx.moveTo(P[a][0],P[a][1]); ctx.lineTo(P[b][0],P[b][1]); ctx.stroke(); });
  ctx.fillStyle = '#fff';
  P.forEach(p => { ctx.beginPath(); ctx.arc(p[0],p[1],3.2,0,7); ctx.fill(); });
}
const SCENES = {};

/* ── 비전 ── */
SCENES.v_detect = (ctx,w,h,t)=>{
  const im=IMGS.v_detect;
  if(im && im.ok){ coverImg(ctx,im.img,w,h); scrim(ctx,w,h);
    const objs=[{x:.33,y:.36,w:.33,h:.42,c:PAL.blue,l:'노트북 94%'},{x:.13,y:.60,w:.15,h:.26,c:PAL.amber,l:'컵 88%'},{x:.70,y:.69,w:.25,h:.19,c:PAL.green,l:'책 81%'}];
    objs.forEach((o,i)=>{ const ap=clamp((t-300-i*450)/500,0,1); if(ap<=0) return;
      ctx.save(); ctx.globalAlpha=ap; ctx.strokeStyle=o.c; ctx.lineWidth=2.5; rr(ctx,o.x*w,o.y*h,o.w*w,o.h*h,8); ctx.stroke(); chip(ctx,o.x*w,o.y*h-24,o.l,o.c); ctx.restore(); });
    chip(ctx,12,12,'객체 탐지 · COCO-SSD',PAL.dim); return; }
  screen(ctx,w,h);
  const objs=[{x:.14,y:.46,w:.3,h:.38,c:PAL.blue,l:'노트북 94%'},{x:.56,y:.26,w:.18,h:.24,c:PAL.amber,l:'컵 88%'},{x:.62,y:.6,w:.24,h:.28,c:PAL.green,l:'책 81%'}];
  objs.forEach((o,i)=>{ const X=o.x*w,Y=o.y*h,W=o.w*w,H=o.h*h;
    ctx.fillStyle='rgba(255,255,255,.09)'; rr(ctx,X,Y,W,H,8); ctx.fill();
    const ap=clamp((t-300-i*450)/500,0,1); if(ap<=0) return;
    ctx.save(); ctx.globalAlpha=ap; ctx.strokeStyle=o.c; ctx.lineWidth=2.5; rr(ctx,X,Y,W,H,8); ctx.stroke(); chip(ctx,X,Y-24,o.l,o.c); ctx.restore(); });
  chip(ctx,12,12,'객체 탐지 · COCO-SSD',PAL.dim);
};
SCENES.v_face = (ctx,w,h,t)=>{
  const im=IMGS.v_face;
  if(im && im.ok){ coverImg(ctx,im.img,w,h); scrim(ctx,w,h);
    const bx=w*0.415, by=h*0.11, bw=w*0.155, bh=h*0.34;
    ctx.strokeStyle=PAL.green; ctx.lineWidth=2.5; rr(ctx,bx,by,bw,bh,8); ctx.stroke();
    chip(ctx,bx,by-24,'얼굴 1명',PAL.green);
    ctx.fillStyle=PAL.red; [[.26,.32],[.74,.32],[.5,.55],[.32,.78],[.68,.78]].forEach(p=>{ ctx.beginPath(); ctx.arc(bx+p[0]*bw,by+p[1]*bh,2.6,0,7); ctx.fill(); });
    chip(ctx,12,12,'얼굴 검출 · BlazeFace',PAL.dim); return; }
  screen(ctx,w,h);
  const cx=w*0.5+Math.sin(t/1400)*w*0.05, cy=h*0.52, R=h*0.24;
  ctx.fillStyle='rgba(255,255,255,.9)'; ctx.beginPath(); ctx.ellipse(cx,cy,R*0.78,R,0,0,7); ctx.fill();
  ctx.strokeStyle=PAL.green; ctx.lineWidth=2.5; rr(ctx,cx-R*0.98,cy-R*1.18,R*1.96,R*2.36,10); ctx.stroke();
  chip(ctx,cx-R*0.98,cy-R*1.18-24,'얼굴 1명',PAL.green);
  ctx.fillStyle=PAL.red; [[-.34,-.22],[.34,-.22],[0,.06],[-.22,.42],[.22,.42],[0,.48]].forEach(p=>{ ctx.beginPath(); ctx.arc(cx+p[0]*R*1.5,cy+p[1]*R,3,0,7); ctx.fill(); });
  chip(ctx,12,12,'얼굴 검출 · BlazeFace',PAL.dim);
};
SCENES.v_pose = (ctx,w,h,t)=>{
  const im=IMGS.v_pose;
  if(im && im.ok){ coverImg(ctx,im.img,w,h); scrim(ctx,w,h);
    const P={head:[.5,.155],neck:[.5,.25],sl:[.455,.28],sr:[.545,.28],el:[.43,.16],er:[.57,.16],hl:[.43,.075],hr:[.57,.075],hip:[.5,.52],kl:[.47,.70],kr:[.53,.70],fl:[.47,.88],fr2:[.53,.88]};
    const bones=[['head','neck'],['neck','sl'],['neck','sr'],['sl','el'],['el','hl'],['sr','er'],['er','hr'],['neck','hip'],['hip','kl'],['kl','fl'],['hip','kr'],['kr','fr2']];
    ctx.strokeStyle=PAL.blue; ctx.lineWidth=3; bones.forEach(b=>{ ctx.beginPath(); ctx.moveTo(P[b[0]][0]*w,P[b[0]][1]*h); ctx.lineTo(P[b[1]][0]*w,P[b[1]][1]*h); ctx.stroke(); });
    ctx.fillStyle='#fff'; Object.keys(P).forEach(k=>{ ctx.beginPath(); ctx.arc(P[k][0]*w,P[k][1]*h,4,0,7); ctx.fill(); });
    chip(ctx,12,12,'자세 추정 · MoveNet',PAL.dim); return; }
  screen(ctx,w,h);
  const cx=w*0.5, top=h*0.18, u=h*0.12, sw=Math.sin(t/700)*0.5;
  const J={head:[cx,top],neck:[cx,top+u],sl:[cx-u*0.95,top+u*1.1],sr:[cx+u*0.95,top+u*1.1],
    el:[cx-u*1.4,top+u*2+sw*u],er:[cx+u*1.4,top+u*2-sw*u],hip:[cx,top+u*3.1],
    kl:[cx-u*0.55,top+u*4.1],kr:[cx+u*0.55,top+u*4.1],fl:[cx-u*0.65,top+u*5.1],fr2:[cx+u*0.65,top+u*5.1]};
  const bones=[['head','neck'],['neck','sl'],['neck','sr'],['sl','el'],['sr','er'],['neck','hip'],['hip','kl'],['hip','kr'],['kl','fl'],['kr','fr2']];
  ctx.strokeStyle=PAL.blue; ctx.lineWidth=3; bones.forEach(b=>{ ctx.beginPath(); ctx.moveTo(J[b[0]][0],J[b[0]][1]); ctx.lineTo(J[b[1]][0],J[b[1]][1]); ctx.stroke(); });
  ctx.fillStyle='#fff'; Object.values(J).forEach(p=>{ ctx.beginPath(); ctx.arc(p[0],p[1],4,0,7); ctx.fill(); });
  chip(ctx,12,12,'자세 추정 · MoveNet',PAL.dim);
};
SCENES.v_classify = (ctx,w,h,t)=>{
  const im=IMGS.v_classify;
  if(im && im.ok){ coverImg(ctx,im.img,w,h); scrim(ctx,w,h);
    const cats=[['고양이',.92,PAL.green],['강아지',.05,PAL.blue],['토끼',.03,PAL.blue]];
    const e=ease(clamp((t-300)/800,0,1)), pw=w*0.36, px=w-pw-14, py=h*0.18, ph=h*0.5, bw=pw-28;
    ctx.fillStyle='rgba(15,19,32,.62)'; ctx.strokeStyle='rgba(255,255,255,.14)'; ctx.lineWidth=1; rr(ctx,px,py,pw,ph,12); ctx.fill(); ctx.stroke();
    ctx.font='600 12px Pretendard,sans-serif'; ctx.textBaseline='alphabetic';
    cats.forEach((ct,i)=>{ const y=py+34+i*((ph-44)/3); const bx=px+14;
      ctx.textAlign='left'; ctx.fillStyle='#fff'; ctx.fillText(ct[0],bx,y-6);
      ctx.textAlign='right'; ctx.fillStyle=PAL.dim; ctx.fillText(Math.round(ct[1]*e*100)+'%',bx+bw,y-6);
      bar(ctx,bx,y,bw,ct[1]*e,ct[2]); });
    ctx.textAlign='left'; chip(ctx,12,12,'이미지 분류 · MobileNet',PAL.dim); return; }
  screen(ctx,w,h);
  const is=Math.min(w*0.3,h*0.5), ix=w*0.08, iy=h*0.5-is/2;
  ctx.fillStyle='rgba(255,255,255,.1)'; ctx.strokeStyle='rgba(255,255,255,.3)'; ctx.lineWidth=2; rr(ctx,ix,iy,is,is,12); ctx.fill(); ctx.stroke();
  const fc=ix+is/2, fcy=iy+is*0.54, fr=is*0.26;
  ctx.fillStyle='rgba(255,255,255,.88)';
  ctx.beginPath(); ctx.moveTo(fc-fr,fcy-fr*0.5); ctx.lineTo(fc-fr*0.6,fcy-fr*1.5); ctx.lineTo(fc-fr*0.1,fcy-fr*0.7); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(fc+fr,fcy-fr*0.5); ctx.lineTo(fc+fr*0.6,fcy-fr*1.5); ctx.lineTo(fc+fr*0.1,fcy-fr*0.7); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(fc,fcy,fr,0,7); ctx.fill();
  const cats=[['고양이',.92,PAL.green],['강아지',.05,PAL.blue],['토끼',.03,PAL.blue]];
  const bx=ix+is+w*0.09, bw=w*0.32, e=ease(clamp((t-300)/800,0,1));
  ctx.font='600 12px Pretendard,sans-serif'; ctx.textBaseline='alphabetic';
  cats.forEach((ct,i)=>{ const y=iy+14+i*h*0.18;
    ctx.textAlign='left'; ctx.fillStyle='#fff'; ctx.fillText(ct[0],bx,y-6);
    ctx.textAlign='right'; ctx.fillStyle=PAL.dim; ctx.fillText(Math.round(ct[1]*e*100)+'%',bx+bw,y-6);
    bar(ctx,bx,y,bw,ct[1]*e,ct[2]); });
  ctx.textAlign='left'; chip(ctx,12,12,'이미지 분류 · MobileNet',PAL.dim);
};

/* ── 제스처 ── */
SCENES.g_track = (ctx,w,h,t)=>{
  const im=IMGS.g_track;
  if(im && im.ok){ coverImg(ctx,im.img,w,h); scrim(ctx,w,h);
    drawHandLM(ctx, w*0.15, h*0.03, w*0.69, h*0.93); // 사진 속 손에 정합된 21점 오버레이
    chip(ctx,12,12,'손 관절 21점 추적',PAL.dim); return; }
  screen(ctx,w,h);
  const seg=1500, i=Math.floor(t/seg)%3, nx=(i+1)%3, k=ease(clamp(((t%seg)/seg-0.6)/0.4,0,1));
  const pose=RPS[i].map((v,f)=>v*(1-k)+RPS[nx][f]*k);
  drawHand(ctx,w*0.5,h*0.78,h*0.11,pose);
  chip(ctx,12,12,'손 관절 21점 추적',PAL.dim);
};
SCENES.g_rps = (ctx,w,h,t)=>{
  const im=IMGS.g_rps;
  if(im && im.ok){ coverImg(ctx,im.img,w,h); scrim(ctx,w,h);
    drawHandLM(ctx, w*0.15, h*0.03, w*0.69, h*0.93);
    chip(ctx,12,12,'가위바위보 인식',PAL.dim);
    chip(ctx,w-118,12,'✋ 보  92%',PAL.green); return; }
  screen(ctx,w,h);
  const names=['바위','보','가위'], ic=['✊','✋','✌'], i=Math.floor(t/1500)%3;
  drawHand(ctx,w*0.3,h*0.74,h*0.11,RPS[i]);
  ctx.fillStyle='#fff'; ctx.font='800 30px Pretendard,sans-serif'; ctx.textBaseline='middle'; ctx.textAlign='center';
  ctx.fillText(ic[i]+' '+names[i], w*0.66, h*0.44); ctx.textAlign='left';
  chip(ctx,w*0.66-46,h*0.44+26,'확신도 '+(90+i*2)+'%',PAL.green);
  chip(ctx,12,12,'가위바위보 인식',PAL.dim);
};

/* ── 데이터 ── */
SCENES.d_reg = (ctx,w,h,t)=>{ screen(ctx,w,h);
  const ox=w*0.12, oy=h*0.84, ax=w*0.78, ah=oy-h*0.14;
  ctx.strokeStyle='rgba(255,255,255,.25)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(ox,oy-ah); ctx.lineTo(ox,oy); ctx.lineTo(ox+ax,oy); ctx.stroke();
  ctx.fillStyle=PAL.blue; DATA_PTS.forEach(p=>{ ctx.beginPath(); ctx.arc(ox+p[0]*ax, oy-p[1]*ah, 4, 0, 7); ctx.fill(); });
  const e=ease(clamp((t-300)/2000,0,1)), m=0.18+(0.74-0.18)*e, b=0.4-0.1*e;
  ctx.strokeStyle=PAL.red; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(ox, oy-clamp(b,0,1)*ah); ctx.lineTo(ox+ax, oy-clamp(b+m,0,1)*ah); ctx.stroke();
  chip(ctx,12,12,'회귀 예측  학습 '+Math.round(e*100)+'%',PAL.red);
};
SCENES.d_cluster = (ctx,w,h,t)=>{ screen(ctx,w,h);
  const cols=[PAL.red,PAL.blue,PAL.green], e=clamp((t-400)/1100,0,1);
  CL_PTS.forEach(p=>{ ctx.fillStyle = e<=0 ? 'rgba(255,255,255,.5)' : cols[p[2]];
    ctx.beginPath(); ctx.arc(w*0.1+p[0]*w*0.8, h*0.12+p[1]*h*0.74, 4, 0, 7); ctx.fill(); });
  if(e>0){ CLC.forEach((cc,i)=>{ const x=w*0.1+cc[0]*w*0.8, y=h*0.12+cc[1]*h*0.74; ctx.strokeStyle=cols[i]; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(x-7,y); ctx.lineTo(x+7,y); ctx.moveTo(x,y-7); ctx.lineTo(x,y+7); ctx.stroke(); }); }
  chip(ctx,12,12,'군집 · K-means (k=3)',PAL.dim);
};

/* ── 텍스트 ── */
SCENES.t_sim = (ctx,w,h,t)=>{ screen(ctx,w,h);
  drawPill(ctx,w*0.5,h*0.18,'“고양이가 귀여워”');
  const n=7, gap=w*0.52/n, bx=w*0.24, base=h*0.72;
  for(let i=0;i<n;i++){ const bh=(0.28+0.6*Math.abs(Math.sin(t/620+i*1.1)))*h*0.34; ctx.fillStyle=PAL.blue; rr(ctx,bx+i*gap,base-bh,gap*0.6,bh,3); ctx.fill(); }
  const sim=0.62+0.33*Math.abs(Math.sin(t/1900));
  ctx.fillStyle=PAL.dim; ctx.font='600 11px Pretendard,sans-serif'; ctx.textBaseline='alphabetic'; ctx.textAlign='right'; ctx.fillText('유사도 '+sim.toFixed(2),w-12,h-26); ctx.textAlign='left';
  bar(ctx,12,h-20,w-24,sim,PAL.green);
  chip(ctx,12,12,'문장 → 벡터',PAL.dim);
};
SCENES.t_classify = (ctx,w,h,t)=>{ screen(ctx,w,h);
  drawPill(ctx,w*0.5,h*0.2,'“정말 마음에 들어요”');
  const e=ease(clamp((t-300)/800,0,1)), cats=[['긍정',.91,PAL.green],['부정',.09,PAL.red]], bw=w*0.6, bx=w*0.2;
  ctx.font='600 13px Pretendard,sans-serif'; ctx.textBaseline='alphabetic';
  cats.forEach((ct,i)=>{ const y=h*0.52+i*h*0.22;
    ctx.textAlign='left'; ctx.fillStyle='#fff'; ctx.fillText(ct[0],bx,y-7);
    ctx.textAlign='right'; ctx.fillStyle=PAL.dim; ctx.fillText(Math.round(ct[1]*e*100)+'%',bx+bw,y-7);
    bar(ctx,bx,y,bw,ct[1]*e,ct[2]); });
  ctx.textAlign='left'; chip(ctx,12,12,'문장 분류 · 감정',PAL.dim);
};

/* ── 생활 ── */
SCENES.l_qr = (ctx,w,h,t)=>{
  const im=IMGS.l_qr;
  if(im && im.ok){ coverImg(ctx,im.img,w,h); scrim(ctx,w,h);
    const p=(t%3600)/3600;
    if(p<0.6){ const y=h*(p/0.6); ctx.strokeStyle=PAL.red; ctx.lineWidth=2; ctx.shadowColor=PAL.red; ctx.shadowBlur=10;
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); ctx.shadowBlur=0; chip(ctx,12,12,'스캔 중…',PAL.dim);
    } else { chip(ctx,12,12,'✓ 해독 완료',PAL.green);
      ctx.font='600 14px Pretendard,sans-serif'; ctx.fillStyle='#fff'; ctx.textBaseline='middle'; ctx.textAlign='center';
      ctx.fillText('https://eduino.kr', w*0.5, h*0.9); ctx.textAlign='left'; }
    return; }
  screen(ctx,w,h);
  const s=Math.min(w,h)*0.5, qx=w*0.5-s/2, qy=h*0.4-s/2, cs=s/11;
  ctx.fillStyle='#fff'; QR.forEach((row,r)=>row.forEach((v,cc)=>{ if(v) ctx.fillRect(qx+cc*cs, qy+r*cs, cs+0.5, cs+0.5); }));
  const fnd=(x,y)=>{ ctx.fillStyle='#fff'; ctx.fillRect(x,y,cs*3,cs*3); ctx.fillStyle=PAL.bg; ctx.fillRect(x+cs*0.5,y+cs*0.5,cs*2,cs*2); ctx.fillStyle='#fff'; ctx.fillRect(x+cs,y+cs,cs,cs); };
  fnd(qx,qy); fnd(qx+s-cs*3,qy); fnd(qx,qy+s-cs*3);
  const p=(t%3600)/3600;
  if(p<0.6){ const y=qy+s*(p/0.6); ctx.strokeStyle=PAL.red; ctx.lineWidth=2; ctx.shadowColor=PAL.red; ctx.shadowBlur=10;
    ctx.beginPath(); ctx.moveTo(qx,y); ctx.lineTo(qx+s,y); ctx.stroke(); ctx.shadowBlur=0; chip(ctx,12,12,'스캔 중…',PAL.dim);
  } else { chip(ctx,12,12,'✓ 해독 완료',PAL.green);
    ctx.font='600 14px Pretendard,sans-serif'; ctx.fillStyle='#fff'; ctx.textBaseline='middle'; ctx.textAlign='center';
    ctx.fillText('https://eduino.kr', w*0.5, h*0.9); ctx.textAlign='left'; }
};
SCENES.l_ocr = (ctx,w,h,t)=>{
  const im=IMGS.l_ocr;
  if(im && im.ok){ coverImg(ctx,im.img,w,h); scrim(ctx,w,h);
    const p=(t%3400)/3400;
    if(p<0.62){ const y=h*(p/0.62); ctx.fillStyle='rgba(240,71,58,.16)'; ctx.fillRect(0,y-12,w,24);
      ctx.strokeStyle=PAL.red; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
      chip(ctx,12,12,'글자 인식 중…',PAL.dim);
    } else { chip(ctx,12,12,'✓ 텍스트 변환 완료',PAL.green);
      ctx.font='700 15px Pretendard,sans-serif'; ctx.textBaseline='middle'; ctx.textAlign='center';
      const txt='“오늘 급식: 카레라이스”', tw=ctx.measureText(txt).width;
      ctx.fillStyle='rgba(15,19,32,.66)'; rr(ctx, w*0.5-tw/2-10, h*0.86-15, tw+20, 30, 8); ctx.fill();
      ctx.fillStyle='#fff'; ctx.fillText(txt, w*0.5, h*0.86); ctx.textAlign='left'; }
    return; }
  screen(ctx,w,h);
  const dx=w*0.22, dy=h*0.16, dw=w*0.56, dh=h*0.58;
  ctx.fillStyle='rgba(255,255,255,.93)'; rr(ctx,dx,dy,dw,dh,10); ctx.fill();
  ctx.fillStyle='rgba(20,22,31,.18)'; for(let i=0;i<5;i++){ rr(ctx,dx+18,dy+22+i*dh*0.16,dw-36-(i===4?dw*0.32:0),8,4); ctx.fill(); }
  const p=(t%3400)/3400;
  if(p<0.62){ const y=dy+dh*(p/0.62); ctx.fillStyle='rgba(240,71,58,.16)'; ctx.fillRect(dx,y-9,dw,18);
    ctx.strokeStyle=PAL.red; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(dx,y); ctx.lineTo(dx+dw,y); ctx.stroke();
    chip(ctx,12,12,'글자 인식 중…',PAL.dim);
  } else { ctx.fillStyle=PAL.green; ctx.font='600 14px Pretendard,sans-serif'; ctx.textBaseline='middle'; ctx.textAlign='center';
    ctx.fillText('“오늘 급식: 카레라이스”', w*0.5, dy+dh+22); ctx.textAlign='left'; chip(ctx,12,12,'✓ 텍스트 변환 완료',PAL.green); }
};

/* ── 개념 ── */
function cpts(ctx,w,h){ CPTS.forEach(p=>{ ctx.fillStyle = p[2] ? 'rgba(240,71,58,.92)' : 'rgba(77,141,255,.92)';
  ctx.beginPath(); ctx.arc(w*0.1+p[0]*w*0.8, h*0.12+p[1]*h*0.74, 4, 0, 7); ctx.fill(); }); }
SCENES.c_boundary = (ctx,w,h,t)=>{ screen(ctx,w,h); cpts(ctx,w,h);
  const curv=Math.sin(t/1500), tilt=Math.sin(t/2100);
  ctx.strokeStyle=PAL.green; ctx.lineWidth=2.5; ctx.beginPath();
  for(let x=0;x<=w;x+=8){ const nx=x/w, y=h*0.5 + (nx-0.5)*h*0.42*tilt + Math.sin(nx*Math.PI*1.6)*h*0.14*curv; x===0?ctx.moveTo(x,y):ctx.lineTo(x,y); } ctx.stroke();
  chip(ctx,12,12,'결정 경계  정확도 '+Math.round(86+9*Math.abs(Math.sin(t/1700)))+'%',PAL.green);
};
SCENES.c_overfit = (ctx,w,h,t)=>{ screen(ctx,w,h); cpts(ctx,w,h);
  ctx.strokeStyle=PAL.amber; ctx.lineWidth=2.5; ctx.beginPath();
  for(let x=0;x<=w;x+=5){ const nx=x/w, y=h*0.5 + (nx-0.5)*h*0.28 + Math.sin(nx*Math.PI*8 + t/600)*h*0.16; x===0?ctx.moveTo(x,y):ctx.lineTo(x,y); } ctx.stroke();
  chip(ctx,12,12,'과적합 · 경계가 점에 달라붙음',PAL.amber);
};

const FEATS = {
  vision:[{id:'v_detect',label:'객체 탐지'},{id:'v_face',label:'얼굴 검출'},{id:'v_pose',label:'자세 추정'},{id:'v_classify',label:'이미지 분류'}],
  gesture:[{id:'g_track',label:'손 관절 추적'},{id:'g_rps',label:'가위바위보'}],
  data:[{id:'d_reg',label:'회귀 예측'},{id:'d_cluster',label:'군집 K-means'}],
  text:[{id:'t_sim',label:'문장 유사도'},{id:'t_classify',label:'문장 분류'}],
  life:[{id:'l_qr',label:'QR·바코드'},{id:'l_ocr',label:'글자 인식'}],
  concept:[{id:'c_boundary',label:'결정 경계'},{id:'c_overfit',label:'과적합 비교'}],
};

/* root 안의 .demo-feats / .demo-canvas 를 찾아 애니메이션을 건다.
   id 가 아니라 클래스로 찾으므로 한 페이지에 여러 번 붙여도 안전하다.
   이미 붙어 있으면 아무 것도 하지 않는다(탭을 오갈 때 rAF 루프 중복 방지). */
function startDemo(root, courseKey){
  if(!root || root.dataset.previewMounted === '1') return;
  root.dataset.previewMounted = '1';
  const feats = FEATS[courseKey] || FEATS.vision;
  const now0 = () => (window.performance && performance.now) ? performance.now() : Date.now();
  let cur = 0, tBase = now0();
  const chipsEl = root.querySelector('.demo-feats');
  function hi(){ if(!chipsEl) return; const k=chipsEl.children; for(let i=0;i<k.length;i++) k[i].classList.toggle('on', i===cur); }
  if(chipsEl){
    chipsEl.innerHTML = feats.map((f,i)=>`<button type="button" class="dfeat${i===0?' on':''}" data-i="${i}">${f.label}</button>`).join('');
    chipsEl.querySelectorAll('.dfeat').forEach(b=>b.addEventListener('click',()=>{ cur=+b.dataset.i; tBase=now0(); hi(); }));
  }
  const cv = root.querySelector('.demo-canvas');
  if(!cv || !cv.getContext) return;
  const ctx = cv.getContext('2d');
  if(!ctx) return;                       // jsdom 등 캔버스 미지원 환경 가드 (탭은 위에서 이미 렌더)
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function size(){ const r=cv.getBoundingClientRect(); const dpr=Math.min(window.devicePixelRatio||1,2);
    cv.width=Math.max(1,r.width*dpr); cv.height=Math.max(1,r.height*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); }
  size(); window.addEventListener('resize', size);
  function draw(localT){ const r=cv.getBoundingClientRect(); (SCENES[feats[cur].id]||SCENES.v_detect)(ctx, r.width, r.height, localT); }
  /* requestAnimationFrame 의 타임스탬프는 직전에 읽은 performance.now() 보다
     앞설 수 있다. 그대로 두면 t 가 음수가 되어 Math.floor(t/seg)%3 이 -1 이 되고
     RPS[-1] 처럼 배열을 벗어나 첫 프레임에서 터진다. 0 으로 눌러 준다. */
  function frame(now){ if(now-tBase>3600){ cur=(cur+1)%feats.length; tBase=now; hi(); } draw(Math.max(0, now-tBase));
    if(window.requestAnimationFrame) requestAnimationFrame(frame); }
  if(reduce) draw(2000);
  else if(window.requestAnimationFrame) requestAnimationFrame(frame);
  else draw(2000);
}

  /* 오른쪽 파이프라인(입력 → 학습·추론 → 출력)과 설명 문구.
     platform/course.html 의 COURSES[].demo 에 있던 것을 여기로 모았다. */
  var PIPE = {
    vision:  { in:'카메라 영상', proc:'인식 모델', out:'이름 · 확신도',
      cap:'카메라에 비친 대상을 <b>실시간으로 인식</b>해 위치(상자)·이름·확신도(%)를 표시합니다. 내 사진을 모으면 나만의 분류 AI도 만들 수 있어요.' },
    gesture: { in:'손 관절 추적', proc:'제스처 분류', out:'가위·바위·보',
      cap:'손의 <b>21개 관절</b>을 점·선으로 추적해 손 모양을 분류합니다. 가위·바위·보가 바뀌는 걸 그대로 따라 그려요.' },
    data:    { in:'데이터 점', proc:'회귀 학습', out:'예측 직선',
      cap:'흩어진 점에 <b>예측선이 스스로 맞춰지는</b> 과정을 보여줍니다. 경사하강법이 오차를 줄여 직선을 학습하는 원리예요.' },
    text:    { in:'문장 입력', proc:'벡터 변환', out:'유사도',
      cap:'문장을 <b>숫자 벡터</b>로 바꿔 두 문장이 얼마나 닮았는지 수치로 비교합니다. 막대는 벡터, 게이지는 유사도예요.' },
    life:    { in:'카메라 스캔', proc:'코드 해독', out:'복원된 정보',
      cap:'카메라가 코드를 <b>스캔</b>하면 숨어 있던 정보(링크·글자)가 복원됩니다. QR·바코드·OCR의 공통 원리예요.' },
    concept: { in:'라벨 데이터', proc:'경계 학습', out:'분류 정확도',
      cap:'두 색의 점을 가르는 <b>결정 경계</b>가 학습되는 모습을 보여줍니다. 경계가 변하며 정확도가 오르내려요.' }
  };

  /* 파이프라인 문구 채우기. 해당 요소가 없는 화면에서는 조용히 건너뛴다. */
  function fillPipe(root, courseKey) {
    var d = PIPE[courseKey]; if (!d || !root) return;
    var map = { '.demo-in': d.in, '.demo-proc': d.proc, '.demo-out': d.out };
    Object.keys(map).forEach(function (sel) {
      var el = root.querySelector(sel); if (el) el.textContent = map[sel];
    });
    var cap = root.querySelector('.demo-cap');
    if (cap) cap.innerHTML = '<p>' + d.cap + '</p>';
  }

  /* ── 공개 API ── */
  var MARKUP =
    '<div class="demo">' +
      '<div class="demo-feats"></div>' +
      '<div class="demo-stage"><span class="live">LIVE</span><canvas class="demo-canvas"></canvas></div>' +
      '<div class="demo-side">' +
        '<div class="pipe">' +
          '<div class="pnode in"><span class="pic">🎛️</span><span><b>입력</b><span class="pt demo-in">입력</span></span></div>' +
          '<div class="pconn"></div>' +
          '<div class="pnode proc"><span class="pic">🧠</span><span><b>학습 · 추론</b><span class="pt demo-proc">처리</span></span></div>' +
          '<div class="pconn"></div>' +
          '<div class="pnode out"><span class="pic">✅</span><span><b>출력</b><span class="pt demo-out">출력</span></span></div>' +
        '</div>' +
        '<div class="demo-cap"></div>' +
      '</div>' +
    '</div>';

  global.CoursePreview = {
    FEATS: FEATS,
    PIPE: PIPE,
    markup: function () { return MARKUP; },
    mount: function (root, courseKey) { fillPipe(root, courseKey); return startDemo(root, courseKey); }
  };
})(window);
