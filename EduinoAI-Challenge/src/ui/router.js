/**
 * ui/router.js — 실제 경로 기반 라우터.
 *
 *   /                                  허브 홈
 *   /kit/:kitId                        킷 상세
 *   /challenge/:kitId/:challengeId     챌린지 화면
 *
 * 정적 배포라 새로고침·직접 접속은 vercel.json 의 rewrite 가 index.html 로 넘겨준다.
 * 화면 전환 때는 이전 화면의 dispose() 를 반드시 부른다. 재생 루프가 남으면 안 된다.
 */

export function parseRoute(pathname) {
  const parts = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  if (parts[0] === 'kit' && parts[1]) return { name: 'kit', kitId: parts[1] };
  if (parts[0] === 'challenge' && parts[1] && parts[2]) {
    return { name: 'challenge', kitId: parts[1], challengeId: parts[2] };
  }
  return { name: 'notfound', path: pathname };
}

export function routePath(route) {
  if (route.name === 'kit') return `/kit/${route.kitId}`;
  if (route.name === 'challenge') return `/challenge/${route.kitId}/${route.challengeId}`;
  return '/';
}

export function createRouter({ onRoute }) {
  let dispose = null;

  async function render() {
    if (dispose) { try { dispose(); } catch (_) { /* 정리 실패가 다음 화면을 막지 않게 */ } }
    dispose = null;
    dispose = await onRoute(parseRoute(location.pathname));
  }

  function navigate(path) {
    if (path === location.pathname) return;
    // ?dev=1 같은 진단 플래그는 화면을 옮겨도 그대로 따라가야 한다.
    history.pushState({}, '', path + location.search);
    render();
  }

  window.addEventListener('popstate', render);

  // 화면마다 링크를 따로 다루지 않도록 클릭을 한 곳에서 가로챈다.
  document.addEventListener('click', (e) => {
    const link = e.target.closest && e.target.closest('[data-link]');
    if (!link) return;
    const path = link.getAttribute('data-link');
    if (!path) return;
    e.preventDefault();
    navigate(path);
  });

  return { render, navigate };
}
