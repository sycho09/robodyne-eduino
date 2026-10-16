/* 아이콘 인라인 정의 (DOM 렌더링 및 캡처용) */
const ICP = {
  look: '<circle cx="10.6" cy="10.6" r="6.4"/><path d="m15.4 15.4 5 5"/>',
  again:
    '<path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.9 1 6.7 2.7L21 8"/><path d="M21 3v5h-5"/>',
  write:
    '<path d="M16.6 3.4a2.1 2.1 0 0 1 3 3L7.4 18.6 3 20l1.4-4.4Z"/><path d="m14.3 5.7 3 3"/>',
  blank:
    '<path d="M12.5 20H21"/><path d="M16.6 3.4a2.1 2.1 0 0 1 3 3L7.4 18.6 3 20l1.4-4.4Z"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
};
const ic = (n, size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"` +
  ` stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICP[n]}</svg>`;
