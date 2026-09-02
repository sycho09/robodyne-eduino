// nav.js — 전역 뒤로가기 시스템
// 함수 호출식 라우팅 위에 '히스토리 스택'을 입혀, 기기/브라우저 뒤로 버튼·ESC·통일된
// '← 뒤로' 버튼이 모두 한 단계씩 이전 화면으로 돌아가게 한다. (스택의 각 항목 = 화면 렌더 함수)
//  - push(fn, route): 앞으로(새 화면) · back(n): 뒤로 n단계 · start(fn, route): 첫 화면(루트)
//  - 기기/브라우저 back → popstate → 스택 되감기 → 이전 화면 재렌더
//  - 루트(스택 1개)에선 뒤로 버튼 숨김(기기 back은 페이지를 떠남)
//
// route 는 새로고침 대비용 꼬리표다. 화면은 클로저(() => enterRoom('led'))라 그대로 저장할 수
// 없으므로, 대신 { name, params } 를 같이 받아 두고 onChange 로 흘려보낸다. 부팅 때 그 이름으로
// 화면을 다시 만들면 보던 자리로 돌아온다. route 없이 push 한 화면은 복원 대상이 아니다.

let stack = [];
let btn = null;
let changeHook = null;

function ensureBtn() {
  if (btn) return;
  btn = document.createElement('button');
  btn.className = 'nav-back';
  btn.type = 'button';
  btn.innerHTML = '<span class="nav-back-arrow">←</span> 뒤로';
  btn.setAttribute('aria-label', '뒤로 가기');
  btn.addEventListener('click', () => nav.back());
  document.body.appendChild(btn);
}
function syncUI() { ensureBtn(); document.body.dataset.canback = stack.length > 1 ? '1' : '0'; }
function render() {
  const top = stack[stack.length - 1];
  if (top) top.fn();
  syncUI();
  try { changeHook?.(nav.trail()); } catch (_) {}
}

export const nav = {
  start(fn, route) { stack = [{ fn, route }]; try { history.replaceState({ d: 1 }, ''); } catch (_) {} render(); },
  push(fn, route) { stack.push({ fn, route }); try { history.pushState({ d: stack.length }, ''); } catch (_) {} render(); },

  // 새로고침 복원 전용 — 스택을 통째로 세우고 맨 위 화면만 그린다.
  // start+push 를 반복하면 중간 화면들이 실제로 렌더된다(보드 연결이 잠깐 뜨고, 허브·챕터가
  // 순서대로 마운트됐다 버려진다). 스택에 있다는 것과 화면에 그린다는 건 다른 일이라 갈라 둔다.
  // 히스토리 모양은 start+push 를 반복한 것과 같게 맞춘다 — 기기 뒤로가 그대로 동작해야 한다.
  restore(entries) {
    if (!entries.length) return;
    stack = entries.map(({ fn, route }) => ({ fn, route }));
    try {
      history.replaceState({ d: 1 }, '');
      for (let d = 2; d <= stack.length; d++) history.pushState({ d }, '');
    } catch (_) {}
    render();
  },
  back(n = 1) {
    const steps = Math.min(n, stack.length - 1);
    if (steps <= 0) return;
    try { history.go(-steps); } catch (_) { stack.length -= steps; render(); }
  },
  canBack() { return stack.length > 1; },
  depth() { return stack.length; },

  // 되살릴 수 있는 구간의 꼬리표. 스택은 [온보딩…, 허브, 챕터, 방, 게임] 모양인데
  // 양 끝이 둘 다 꼬리표가 없다 — 앞의 온보딩은 건너뛰고(다시 겪을 이유가 없다),
  // 뒤의 게임은 거기서 끊는다(플레이 도중으로 되돌리기보다 그 방까지가 안전한 복귀점이다).
  trail() {
    const out = [];
    for (const s of stack) {
      if (s.route) { out.push(s.route); continue; }
      if (out.length) break;
    }
    return out;
  },
  // 화면이 바뀔 때마다 현재 꼬리표를 넘겨준다(저장은 부르는 쪽이 알아서).
  onChange(fn) { changeHook = fn; },
};

window.addEventListener('popstate', (e) => {
  const d = (e.state && e.state.d) || 1;
  if (d < stack.length) { stack.length = Math.max(1, d); render(); }   // 뒤로 → 이전 화면 재렌더
  else syncUI();                                                       // 앞으로/미지정 → 상태 유지
});

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !nav.canBack()) return;
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;  // 입력 중엔 무시
  e.preventDefault(); nav.back();
});
