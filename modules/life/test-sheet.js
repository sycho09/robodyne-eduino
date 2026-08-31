const QRS = [
  { text: 'https://www.eduino.kr', cap: '링크 열기', desc: 'eduino.kr' },
  { text: 'Eduino AI — 안녕하세요! 🤖', cap: '인사 메시지', desc: '텍스트' },
  { text: '가위바위보를 해볼까요?', cap: '한글 텍스트', desc: '한글' },
  { text: '20240617-EDU-001', cap: '출석 번호 예시', desc: '20240617-EDU-001' },
  { text: 'WIFI:T:WPA;S:Eduino;P:eduino1234;;', cap: '와이파이 정보', desc: 'SSID: Eduino' },
  { text: '3.14159265358979', cap: '원주율 숫자', desc: '3.14159…' },
];
const qg = document.getElementById('qr-grid');
QRS.forEach((q) => {
  const d = document.createElement('div'); d.className = 'item';
  // 1순위: 이미지 API(즉시 렌더) · 실패 시 JS 라이브러리로 대체
  const img = document.createElement('img');
  img.width = 180; img.height = 180; img.alt = q.cap;
  img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=' + encodeURIComponent(q.text);
  img.onerror = () => { // 폴백: qrcode 라이브러리
    const c = document.createElement('canvas'); img.replaceWith(c);
    if (window.QRCode) QRCode.toCanvas(c, q.text, { width: 180, margin: 1 }, () => {});
  };
  d.appendChild(img);
  d.insertAdjacentHTML('beforeend', `<div class="cap">${q.cap}</div><div class="desc">${q.desc}</div>`);
  qg.appendChild(d);
});

const BCS = [
  { val: '880123456789', fmt: 'EAN13', cap: '제품 바코드 (EAN-13)' },
  { val: 'EDUINO-AI', fmt: 'CODE128', cap: '코드128 (문자)' },
  { val: '12345678', fmt: 'CODE128', cap: '코드128 (숫자)' },
  { val: '4006381333931', fmt: 'EAN13', cap: '제품 바코드 (EAN-13)' },
];
const bg = document.getElementById('bc-grid');
BCS.forEach((b) => {
  const d = document.createElement('div'); d.className = 'item';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  d.appendChild(svg);
  d.insertAdjacentHTML('beforeend', `<div class="cap">${b.cap}</div>`);
  bg.appendChild(d);
  try { JsBarcode(svg, b.val, { format: b.fmt, width: 2, height: 70, fontSize: 15, margin: 6 }); } catch (e) {}
});