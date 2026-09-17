/**
 * tools/checks/viewcolors.js — "시뮬 화면에 진짜 그림이 그려졌는가" 를 세는 한 가지 방법.
 *
 * 렌더 검증과 콜드 캐시 검증이 같은 것을 세야 한다. 두 곳에 같은 식을 적어 두었더니
 * 한쪽만 고쳐질 위험이 생겼다(55차 보강3). 식은 여기 하나뿐이다.
 *
 * 무엇을 훑는가 — 시뮬 화면을 이루는 캔버스 전부다. 지금은 둘일 수 있다:
 *   [data-el="canvas"]  RC카·주행선·이름표를 그리는 캔버스
 *   .view__bg           ?layer=1 일 때만 생기는 배경 층 (55차 보강2 마))
 * 배경이 캔버스 밖으로 나가면 앞의 하나만 읽어서는 "배경이 왔는가" 를 알 수 없다.
 * 카메라 두 칸(.camstage)은 시뮬 화면이 아니므로 세지 않는다 — 세면 배경이 안 와도
 * 카메라 그림만으로 색 수가 채워져 검사가 무력해진다.
 *
 * 캔버스마다 가운데 절반만 훑는다. 가장자리는 테두리·비네트라 색이 늘 있다.
 * 투명(알파 8 미만) 픽셀은 세지 않는다 — 위 층은 대부분 투명이다.
 */
const VIEW_COLORS = `(function(){
  var v = document.querySelector('.view');
  if (!v) return -1;
  var cs = v.querySelectorAll('[data-el="canvas"], .view__bg');
  if (!cs.length) return -1;
  var s = new Set();
  var any = false;
  for (var k = 0; k < cs.length; k++) {
    var c = cs[k], w = c.width, h = c.height;
    if (!w || !h) continue;
    var g = null;
    try { g = c.getContext('2d'); } catch (e) { g = null; }
    if (!g) continue;
    any = true;
    var d = g.getImageData(Math.round(w * 0.25), Math.round(h * 0.25),
                           Math.round(w * 0.5), Math.round(h * 0.5)).data;
    for (var i = 0; i < d.length; i += 4 * 37) {
      if (d[i + 3] < 8) continue;
      s.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
    }
  }
  return any ? s.size : -1;
})()`;

module.exports = { VIEW_COLORS };
