/* 콘솔 공통 셸을 통째로 불러올 필요 없이 진입 모드만 세팅하고 선택된 안으로 보낸다
   (shared.js 의 VARIANTS 와 같은 목록) */
(function () {
  try { sessionStorage.setItem('vision_session', JSON.stringify({ mode: 'free' })); } catch (e) {}
  var URLS = {
    map: 'console/map.html', cards: 'console/cards.html'
  };
  var v; try { v = localStorage.getItem('vision_ui_variant'); } catch (e) {}
  location.replace(URLS[v] || URLS.cards);
})();
