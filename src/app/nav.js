// nav.js — 전역 뒤로가기 시스템
// 함수 호출식 라우팅 위에 '히스토리 스택'을 입혀, 기기/브라우저 뒤로 버튼·ESC·통일된
// '← 뒤로' 버튼이 모두 한 단계씩 이전 화면으로 돌아가게 한다. (스택의 각 항목 = 화면 렌더 함수)
//  - push(fn): 앞으로(새 화면) · back(n): 뒤로 n단계 · start(fn): 첫 화면(루트)
//  - 기기/브라우저 back → popstate → 스택 되감기 → 이전 화면 재렌더
//  - 루트(스택 1개)에선 뒤로 버튼 숨김(기기 back은 페이지를 떠남)

let stack = [];
let btn = null;

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
function render() { const top = stack[stack.length - 1]; if (top) top(); syncUI(); }

export const nav = {
  start(fn) { stack = [fn]; try { history.replaceState({ d: 1 }, ''); } catch (_) {} render(); },
  push(fn) { stack.push(fn); try { history.pushState({ d: stack.length }, ''); } catch (_) {} render(); },
  back(n = 1) {
    const steps = Math.min(n, stack.length - 1);
    if (steps <= 0) return;
    try { history.go(-steps); } catch (_) { stack.length -= steps; render(); }
  },
  canBack() { return stack.length > 1; },
  depth() { return stack.length; },
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
