/**
 * ui/panels/quest.js — 첫 진입 가이드 퀘스트.
 *
 * 화면을 모달로 막지 않는다. 가리키는 대상만 남기고 나머지를 어둡게 덮는다
 * (구멍 요소에 아주 큰 box-shadow 를 둘러 바깥을 덮는 방식이라 대상은 그대로 보인다).
 *
 * 단계 목록과 문구는 매니페스트가 소유한다. 이 파일은 "무엇을 가리킬지"를 모른다 —
 * 대상 해석은 만드는 쪽이 넘겨주는 resolve() 가 한다.
 */

const BUBBLE_W = 300;
const GAP = 12;

/** 조건을 얼마나 자주 확인하는가. 학생이 버튼을 누른 직후 넘어간 것처럼 보이면 된다. */
const CHECK_MS = 300;

export function createQuest({ steps, resolve, onClose, check }) {
  const root = document.createElement('div');
  root.className = 'quest';
  root.hidden = true;
  root.innerHTML = `
    <div class="quest__hole" data-el="hole"></div>
    <div class="quest__bubble" data-el="bubble">
      <p class="quest__text" data-el="text"></p>
      <div class="quest__foot">
        <span class="quest__count" data-el="count"></span>
        <button class="btn btn--mini" type="button" data-el="skip">건너뛰기</button>
        <button class="btn btn--primary btn--mini" type="button" data-el="next">다음</button>
      </div>
    </div>`;
  document.body.append(root);
  const q = (n) => root.querySelector(`[data-el="${n}"]`);
  const hole = q('hole');
  const bubble = q('bubble');

  let order = [];
  let at = 0;
  let timer = null;

  function place(rect) {
    const pad = 6;
    hole.style.top = `${rect.top - pad}px`;
    hole.style.left = `${rect.left - pad}px`;
    hole.style.width = `${rect.width + pad * 2}px`;
    hole.style.height = `${rect.height + pad * 2}px`;

    const bh = bubble.offsetHeight || 120;
    let top = rect.top + rect.height + GAP + pad;
    if (top + bh > window.innerHeight - 8) top = Math.max(8, rect.top - bh - GAP - pad);
    let left = rect.left + rect.width / 2 - BUBBLE_W / 2;
    left = Math.max(8, Math.min(window.innerWidth - BUBBLE_W - 8, left));
    bubble.style.top = `${top}px`;
    bubble.style.left = `${left}px`;
  }

  /** 대상이 없는 단계(예: 카메라가 없는 챌린지)는 건너뛴다. */
  function show() {
    while (at < order.length && !resolve(order[at].target)) at += 1;
    if (at >= order.length) { stop(); return; }
    const step = order[at];
    q('text').textContent = step.text;
    q('count').textContent = `${at + 1} / ${order.length}`;
    q('next').textContent = at === order.length - 1 ? '끝내기' : '다음';
    root.hidden = false;
    // 말풍선 높이를 재려면 먼저 보여야 한다. 위치는 그 다음 프레임에 잡는다.
    const rect = resolve(step.target);
    place(rect);
    requestAnimationFrame(() => { const r = resolve(step.target); if (r) place(r); });
  }

  function stop() {
    root.hidden = true;
    if (timer) { clearInterval(timer); timer = null; }
    if (onClose) onClose();
  }

  /**
   * 조건이 붙은 단계는 스스로 넘어간다. 학생이 [다음] 을 눌러 진도를 관리할 필요가 없다.
   * 판단은 만드는 쪽이 넘겨주는 check() 가 한다 — 이 파일은 무엇이 조건인지 모른다.
   */
  function watch() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (root.hidden) return;
      const step = order[at];
      if (!step || !step.when || !check) return;
      if (!check(step.when)) return;
      at += 1;
      if (at >= order.length) stop(); else show();
    }, CHECK_MS);
  }

  function start() {
    order = (steps || []).filter((s) => s && s.text);
    if (!order.length) return false;
    at = 0;
    show();
    if (!root.hidden) watch();
    return !root.hidden;
  }

  q('next').addEventListener('click', () => { at += 1; if (at >= order.length) stop(); else show(); });
  q('skip').addEventListener('click', stop);
  const onResize = () => { if (!root.hidden && order[at]) { const r = resolve(order[at].target); if (r) place(r); } };
  window.addEventListener('resize', onResize);

  return {
    start,
    stop,
    get running() { return !root.hidden; },
    dispose() {
      if (timer) clearInterval(timer);
      window.removeEventListener('resize', onResize);
      root.remove();
    },
  };
}
