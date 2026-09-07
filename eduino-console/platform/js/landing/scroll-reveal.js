/* ── 마감: 헤더 스크롤 상태 + 스크롤 등장(스태거) ── */
(function(){
  const bar = document.querySelector('.topbar');
  const onScroll = () => bar.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 등장 대상: 섹션 헤더 + 카드 그룹들
  const groups = [
    ['.head'], ['.fcar'], ['.trk-h'],
    ['#tracks .mod'], ['#guide-grid .gcard'],
    ['.mock-wrap'],
  ];
  const targets = [];
  groups.forEach(([sel]) => {
    const els = [...document.querySelectorAll(sel)];
    els.forEach((el, i) => { el.classList.add('reveal'); el.style.transitionDelay = (Math.min(i, 4) * 55) + 'ms'; targets.push(el); });
  });
  if (reduce || !('IntersectionObserver' in window)) {
    targets.forEach(el => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  targets.forEach(el => io.observe(el));
})();
