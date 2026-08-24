/* 5개 학습 모듈이 공유하는 인라인 SVG 아이콘 세트.

   왜 이모지를 쓰지 않는가: 같은 이모지도 Windows·macOS·Android가 서로 다른 그림으로 그린다.
   교재 화면이 기기마다 달라 보이면 플랫폼의 통일감이 깨지므로, 어느 환경에서도 같게 나오는
   인라인 SVG로 통일한다(대시보드 셸이 이미 쓰는 방식과 같은 규격).

   색은 잃지 않는다 — stroke 을 currentColor 로 두어 감싼 요소의 색을 그대로 상속하므로,
   .tc-ic 처럼 soft 배경을 가진 컨테이너 안에서는 배경색과 짝을 이룬 듀오톤이 된다.
   테마 토큰(--primary, --green …)을 바꾸면 아이콘 색도 함께 따라온다.

   사용법
     HTML : <span class="tc-ic" data-ic="scissors"></span>
            → DOMContentLoaded 때 EduinoIcons.mount() 가 SVG 를 채워 넣는다.
     JS   : el.innerHTML = EduinoIcons.svg('camera');
            동적으로 그린 영역에 data-ic 을 썼다면 EduinoIcons.mount(container) 를 호출한다. */
(function () {
  var P = {
    /* 공통 UI */
    lightbulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z"/>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    bot: '<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    'arrow-up': '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',

    /* 개념 · 데이터 */
    map: '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
    scale: '<path d="M12 3v18M7 21h10"/><path d="M5 7h14"/><path d="M5 7l-3 6a3 3 0 0 0 6 0z"/><path d="M19 7l3 6a3 3 0 0 1-6 0z"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
    puzzle: '<path d="M4 7h3a2 2 0 0 0 2-2V4a2 2 0 1 1 4 0v1a2 2 0 0 0 2 2h3a1 1 0 0 1 1 1v3a2 2 0 0 0 2 2h1a2 2 0 1 1 0 4h-1a2 2 0 0 0-2 2v3a1 1 0 0 1-1 1h-3.5a1 1 0 0 1-1-1v-.5a2 2 0 1 0-4 0v.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3.5a1 1 0 0 1 1-1h.5a2 2 0 1 0 0-4H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/>',
    folders: '<path d="M3 7V5a2 2 0 0 1 2-2h3l2 2h6a2 2 0 0 1 2 2v1"/><rect x="1" y="7" width="20" height="13" rx="2"/>',
    palette: '<circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="9.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="15.5" cy="9.5" r="1"/><path d="M12 21a3 3 0 0 1 0-6 2 2 0 0 0 0-4"/>',
    'trending-up': '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    'trending-down': '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
    'bar-chart': '<line x1="3" y1="21" x2="21" y2="21"/><rect x="5" y="11" width="3" height="8"/><rect x="10.5" y="6" width="3" height="13"/><rect x="16" y="14" width="3" height="5"/>',
    repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><line x1="8" y1="6" x2="8" y2="6"/><line x1="12" y1="6" x2="12" y2="6"/><line x1="16" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10"/><line x1="12" y1="10" x2="12" y2="10"/><line x1="16" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="8" y2="14"/><line x1="12" y1="14" x2="12" y2="14"/><line x1="16" y1="14" x2="16" y2="14"/>',
    satellite: '<path d="M13 7l4-4 4 4-4 4z"/><path d="M7 13l-4 4 4 4 4-4z"/><path d="M11 9l4 4"/><path d="M9.5 6.5L6 3"/><path d="M14 18a4 4 0 0 0 4-4"/><path d="M14 22a8 8 0 0 0 8-8"/>',

    /* 제스처 — 가위바위보는 수업 내용 자체라 손 모양을 그대로 그린다 */
    fist: '<path d="M5 11V9a2 2 0 0 1 2-2h9a4 4 0 0 1 4 4v3a6 6 0 0 1-6 6h-3a6 6 0 0 1-6-6v-3z"/><path d="M9 11h7M9 14.5h6"/>',
    palm: '<path d="M8 13V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 11V3.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14 11V4.5a1.5 1.5 0 0 1 3 0V13"/><path d="M17 8.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2a6 6 0 0 1-5.2-3L4 13.5a1.5 1.5 0 0 1 2.6-1.5L8 14"/>',
    victory: '<path d="M9.5 12L7 5a1.6 1.6 0 0 1 3-1l2.5 6.5"/><path d="M13 10.5L15 4a1.6 1.6 0 0 1 3 1l-1.5 8"/><path d="M18.5 11.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2a6 6 0 0 1-5.1-2.9L5 13.5a1.5 1.5 0 0 1 2.6-1.5l1.6 2.5"/>',
    'hand-raised': '<path d="M18 11V6a1.5 1.5 0 0 0-3 0M15 6V4.5a1.5 1.5 0 0 0-3 0V6M12 6V5a1.5 1.5 0 0 0-3 0v7"/><path d="M9 12V8.5a1.5 1.5 0 0 0-3 0V15a6 6 0 0 0 6 6h1a6 6 0 0 0 6-6v-4"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.5"/>',
    ruler: '<path d="M2.5 15.5L15.5 2.5a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L8.5 21.5a2 2 0 0 1-2.8 0l-3.2-3.2a2 2 0 0 1 0-2.8z"/><path d="M6 12l2 2M9.5 8.5l2 2M13 5l2 2"/>',
    gamepad: '<rect x="2" y="7" width="20" height="12" rx="4"/><line x1="7" y1="11" x2="7" y2="15"/><line x1="5" y1="13" x2="9" y2="13"/><circle cx="16" cy="12" r="1"/><circle cx="18.5" cy="14.5" r="1"/>',
    package: '<path d="M21 8v8a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.7l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z"/><polyline points="3.3 7 12 12 20.7 7"/><line x1="12" y1="22" x2="12" y2="12"/>',
    brain: '<path d="M9.5 3A2.5 2.5 0 0 0 7 5.5v.2A3 3 0 0 0 5 8.5a3 3 0 0 0 .5 1.7A3 3 0 0 0 5 12a3 3 0 0 0 1 2.2V15a3 3 0 0 0 3 3h.5V3z"/><path d="M14.5 3A2.5 2.5 0 0 1 17 5.5v.2a3 3 0 0 1 2 2.8 3 3 0 0 1-.5 1.7A3 3 0 0 1 19 12a3 3 0 0 1-1 2.2V15a3 3 0 0 1-3 3h-.5V3z"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
    printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',

    /* 텍스트 · 생활 */
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
    hash: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
    triangle: '<path d="M4 20L20 4"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M4 20h16"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    message: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
    type: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>',
    newspaper: '<path d="M4 22h14a2 2 0 0 0 2-2V4a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v16a2 2 0 0 1-2 2h2z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M1 2h3.2l2.6 12.4a2 2 0 0 0 2 1.6h8.5a2 2 0 0 0 2-1.6L21 6H5"/>',
    medal: '<circle cx="12" cy="15" r="6"/><path d="M12 12.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2L8.8 14.8l2.2-.3z"/><path d="M8.5 3l1.5 5M15.5 3L14 8"/>'
  };

  function svg(name, cls) {
    var d = P[name];
    if (!d) { console.warn('[EduinoIcons] 알 수 없는 아이콘:', name); return ''; }
    return '<svg class="eic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true" focusable="false">' + d + '</svg>';
  }

  // data-ic 를 실제 SVG 로 채운다. 이미 채운 요소는 건너뛰므로 여러 번 불러도 안전하다.
  function mount(root) {
    (root || document).querySelectorAll('[data-ic]').forEach(function (el) {
      if (el.firstElementChild && el.firstElementChild.tagName.toLowerCase() === 'svg') return;
      var html = svg(el.dataset.ic);
      if (html) el.innerHTML = html;
    });
  }

  window.EduinoIcons = { svg: svg, mount: mount, has: function (n) { return !!P[n]; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mount(); });
  else mount();
})();
