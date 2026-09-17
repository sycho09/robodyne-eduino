// tools/checks/serve.js — 검사용 정적 파일 서버.
// SPA 라 /kit/* 와 /challenge/* 는 index.html 로 보낸다. 캐시는 끈다.
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=process.argv[2],PORT=+process.argv[3];
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);
  if(/^\/(kit|challenge)\//.test(p)) p='/index.html';
  if(p==='/')p='/index.html';
  const f=path.join(ROOT,p);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end('nf');return;}
    res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream','cache-control':'no-store'});res.end(d);});
}).listen(PORT,()=>console.log('up',PORT));
