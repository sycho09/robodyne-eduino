/* 진단 허브(modules/index.html) 전용 수집 스텁 — course-config.js 6종이 로드 즉시
   호출하는 CourseDashboard.init() 을 가로채 문항 데이터만 모은다.
   진짜 셸(course-dashboard.js)은 수집이 끝난 뒤 로드되어 이 스텁을 덮어쓴다. */
window.__PRECHECK_CONFIGS = [];
window.CourseDashboard = { init: function (cfg) { window.__PRECHECK_CONFIGS.push(cfg); } };
