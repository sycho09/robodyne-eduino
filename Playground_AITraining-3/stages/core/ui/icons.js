/* ╔══════════════════════════════════════════════════════════╗
   ║  VISION AI · 공용 라인 아이콘 세트 (이모지 대체, OTT 톤)   ║
   ║  사용: <i data-ic="detect"></i>  → 로드 시 SVG로 치환      ║
   ╚══════════════════════════════════════════════════════════╝ */
(function(){
  const S=(p,extra)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"${extra||''}>${p}</svg>`;
  const IC={
    detect:   S('<path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M21 8V5.5A2.5 2.5 0 0 0 18.5 3H16M3 16v2.5A2.5 2.5 0 0 0 5.5 21H8M21 16v2.5A2.5 2.5 0 0 1 18.5 21H16"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.2"/>'),
    face:     S('<circle cx="12" cy="12" r="9"/><path d="M8.5 10h.01M15.5 10h.01M8.8 14.5c.9 1 2 1.4 3.2 1.4s2.3-.4 3.2-1.4"/>'),
    skeleton: S('<circle cx="12" cy="4.6" r="2.1"/><path d="M12 6.7v6.1m0 0-3.8 4.9m3.8-4.9 3.8 4.9M7.4 9.2l4.6 1 4.6-1"/>'),
    color:    S('<path d="M12 3.2c4.4 4 6.8 6.5 6.8 10A6.8 6.8 0 0 1 5.2 13.2c0-3.5 2.4-6 6.8-10Z"/>'),
    filter:   S('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor" stroke="none"/>'),
    book:     S('<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v14H6.5A1.5 1.5 0 0 0 5 18.5Z"/><path d="M5 18.5A1.5 1.5 0 0 0 6.5 20H19"/>'),
    board:    S('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>'),
    home:     S('<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.8V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.8"/>'),
    submit:   S('<path d="M12 15.5V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>'),
    camera:   S('<rect x="3" y="6.5" width="18" height="12.5" rx="2.2"/><circle cx="12" cy="12.7" r="3.4"/><path d="M8.5 6.5 9.8 4.4h4.4L15.5 6.5"/>'),
    image:    S('<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m4 17 5-4.5 4 3.2L17 11l3 3"/>'),
    audio:    S('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'),
    pose:     S('<circle cx="12" cy="4.6" r="2.1"/><path d="M12 6.7v6.1m0 0-3.8 4.9m3.8-4.9 3.8 4.9M7.4 9.2l4.6 1 4.6-1"/>'),
    play:     S('<path d="M7 4.5 19 12 7 19.5Z" fill="currentColor" stroke="none"/>'),
    user:     S('<circle cx="12" cy="8" r="3.4"/><path d="M5.5 20c.6-3.6 3.3-5.6 6.5-5.6s5.9 2 6.5 5.6"/>'),
    settings: S('<circle cx="12" cy="12" r="3.1"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V20a2 2 0 1 1-4 0v-.07a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H4a2 2 0 1 1 0-4h.07a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H10a1.7 1.7 0 0 0 1-1.56V4a2 2 0 1 1 4 0v.07a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V10a1.7 1.7 0 0 0 1.56 1H20a2 2 0 1 1 0 4h-.07a1.7 1.7 0 0 0-1.53 1.03Z"/>'),
  };
  function paint(root){ (root||document).querySelectorAll('[data-ic]').forEach(el=>{ const n=el.getAttribute('data-ic'); if(IC[n]&&!el.dataset.painted){ el.innerHTML=IC[n]; el.dataset.painted='1'; } }); }
  window.IC=IC; window.paintIcons=paint;
  if(document.readyState!=='loading') paint(); else document.addEventListener('DOMContentLoaded',()=>paint());
})();
