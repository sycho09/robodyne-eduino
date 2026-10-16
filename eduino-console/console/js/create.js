/* 공통 셸을 통째로 불러올 필요 없이 선택된 안만 읽는다 */
(function () {
  var URLS = {
    map: 'console/map.html', cards: 'console/cards.html'
  };
  var v; try { v = localStorage.getItem('vision_ui_variant'); } catch (e) {}
  location.replace((URLS[v] || URLS.cards) + '#create');
})();
