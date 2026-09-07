/* 앱 루트 경로 헬퍼 — 하위 경로 배포·도메인 루트 배포·file:// 실행 모두 지원 대상.
   modules/ 아래 문서는 깊이가 제각각이라 절대경로 문자열 그대로는 하위 경로
   배포 시 파손 위험. 이 파일은 course-dashboard.js 등 여러 깊이에서 로드되는
   스크립트보다 먼저 로드해서 window.AppBase 로 앱 루트 기준 URL 구성용. */
(function () {
  'use strict';

  /* normal 안에서 최상위 폴더로 쓰이는 이름 — 새 최상위 폴더가 생기면 갱신 */
  var TOP_SEGMENT_RE = /\/(modules|platform)(?:\/|$)/;

  var pathname = window.location.pathname;
  var found = TOP_SEGMENT_RE.exec(pathname);
  /* 세그먼트를 찾으면 그 앞까지가 앱 루트, 못 찾으면 현재 문서가 있는 디렉터리가
     곧 앱 루트 */
  var appRoot = found ? pathname.slice(0, found.index + 1) : pathname.slice(0, pathname.lastIndexOf('/') + 1);

  window.AppBase = {
    /* 앱 루트 기준 상대 경로(선행 슬래시 없이)를 받아 절대 URL 문자열로 변환 */
    resolve: function (relativePath) {
      return appRoot + relativePath;
    },
  };
})();
