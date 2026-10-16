/* 앱 루트 경로 헬퍼 — 하위 경로 배포·도메인 루트 배포·file:// 실행 모두 지원 대상.
   modules/ 아래 문서는 깊이가 제각각이라 절대경로 문자열 그대로는 하위 경로
   배포 시 파손 위험. 이 파일은 course-dashboard.js 등 여러 깊이에서 로드되는
   스크립트보다 먼저 로드해서 window.AppBase 로 앱 루트 기준 URL 구성용. */
(function () {
  'use strict';

  /* 이 파일 자신의 로드 경로 접미사(선행 슬래시 제외) — 항상 <앱루트>/shared/base-path.js
     위치 고정. 선행 슬래시를 리터럴에 포함하지 않는 이유는 no-abs-path 검사가 "/"로
     시작하는 문자열 리터럴을 도메인 루트 절대경로로 오인하기 때문 — 아래에서 별도 확인 */
  var HELPER_SUFFIX = 'shared/base-path.js';

  /* 폴백 전용: normal 안에서 최상위 폴더로 쓰이는 이름 — 새 최상위 폴더 추가 시 갱신.
     배포 프리픽스가 이 이름과 겹칠 수 있어 마지막 등장 위치를 앱 루트 경계로 사용.
     인접 세그먼트(예: platform/platform/)가 슬래시를 공유하는 경우까지 잡으려면
     정규식 비중첩 매치로는 부족해 한 칸씩 미는 방식으로 직접 탐색 */
  var TOP_SEGMENT_NAMES = ['modules', 'platform'];

  /* classic script 동기 로드 시 document.currentScript 로 자기 <script> 태그 획득,
     .src 는 절대 URL로 해석된 값 — 배포 프리픽스·중첩 깊이·file:// 무관하게 정확 */
  function fromCurrentScript() {
    var script = document.currentScript;
    var src = script && script.src;
    if (!src) return null;
    var clean = src.split('#')[0].split('?')[0];
    var sepLen = HELPER_SUFFIX.length + 1;
    var tail = clean.length > sepLen ? clean.slice(-sepLen) : '';
    if (tail.charAt(0) !== '/' || tail.slice(1) !== HELPER_SUFFIX) return null;
    return clean.slice(0, clean.length - HELPER_SUFFIX.length);
  }

  /* currentScript 획득 실패 시 폴백 — 세그먼트 이름 등장 중 마지막 위치를 경계로 사용
     (첫 매치 사용은 배포 프리픽스가 세그먼트 이름과 겹칠 때 오산출하는 원인이었음) */
  function fromPathSegment() {
    var pathname = window.location.pathname;
    var lastIndex = -1;
    TOP_SEGMENT_NAMES.forEach(function (name) {
      var needle = '/' + name;
      var pos = pathname.indexOf(needle);
      while (pos !== -1) {
        var afterIdx = pos + needle.length;
        var boundaryOk = afterIdx === pathname.length || pathname.charAt(afterIdx) === '/';
        if (boundaryOk && pos > lastIndex) lastIndex = pos;
        pos = pathname.indexOf(needle, pos + 1);
      }
    });
    return lastIndex === -1 ? pathname.slice(0, pathname.lastIndexOf('/') + 1) : pathname.slice(0, lastIndex + 1);
  }

  var appRoot = fromCurrentScript() || fromPathSegment();

  window.AppBase = {
    /* 앱 루트 기준 상대 경로(선행 슬래시 없이)를 받아 절대 URL 문자열로 변환 */
    resolve: function (relativePath) {
      return appRoot + relativePath;
    },
  };
})();
