/* 목업 아이콘 헬퍼 — window.LandingIcons 로 다른 분리 파일에 노출 */
(function () {
const IC = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const CK = IC('<path d="M20 6 9 17l-5-5"/>');

/* 목업 사이드바 아이콘 */
const SIDE = [
  IC('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.5"/>'),
  IC('<circle cx="12" cy="4" r="2"/><path d="M12 6v6m0 0l-4 6m4-6l4 6M6 9l6 1 6-1"/>'),
  IC('<path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 4-5"/>'),
  IC('<path d="M4 6h16M4 12h16M4 18h10"/>'),
];
document.getElementById('mock-side').innerHTML = SIDE.map((s,i)=>`<b class="${i===0?'act':''}">${s}</b>`).join('');
window.LandingIcons = { IC: IC, CK: CK };
})();
