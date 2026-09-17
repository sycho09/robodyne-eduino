/**
 * ui/scout/classes.js — 무엇을 배울지 고르고, 표본을 담는 칸.
 *
 * 담기는 것은 **지문 35개짜리 숫자 배열 하나**뿐이다(원칙 7).
 * 프레임도, 줄인 그림도, 썸네일도 남기지 않는다. 이 파일에 이미지를 들고 있는 자리가 없다.
 *
 * 클래스 최대 개수와 클래스당 최소 표본 수는 매니페스트(scout.classes)가 소유한다.
 * 지우기는 소프트삭제다 — 표시만 하고 표본은 그대로 두며, 되돌리기를 한 번 준다.
 */

export function createClassPanel({ mount, challenge, capture, onChange }) {
  const spec = challenge.scout;
  const MAXC = spec.classes.max;
  const MINS = spec.classes.min_samples;
  const PALETTE = spec.palette;

  /** 지운 것까지 전부. live() 가 살아 있는 것만 고른다 — 하드삭제를 하지 않는다. */
  const all = [];
  let sel = 0;
  let undoTarget = null;          // 되돌리기는 마지막 하나에만 준다

  const live = () => all.filter((c) => !c.deleted);
  const readyToTrain = () => { const L = live(); return L.length >= 2 && L.every((c) => c.feats.length >= MINS); };

  mount.innerHTML = `
    <div class="cls__head">
      <span data-el="cls-count">0 / ${MAXC}</span>
      <button class="btn btn--mini" type="button" data-el="cls-add">+ 클래스</button>
    </div>
    <div class="cls__list" data-el="cls-list"></div>
    <!-- 57차 묶음3 — 두 줄이다. 위는 "할 일"(되돌리기 같은 것), 아래는 "지금 상태"(몇 장 더).
         상태는 늘 보여야 한다 — 할 일 안내가 상태를 가리면 학생은 무엇이 모자란지 잊는다. -->
    <p class="cls__hint" data-el="cls-hint" hidden></p>
    <p class="cls__state" data-el="cls-state" hidden></p>
    <!-- 좌측 열 순서가 목업 그대로다 — 수집 → 학습하기 → 학습 결과 → 적용하기.
         그래서 두 버튼이 한 줄에 있지 않고, 사이에 결과 칸이 들어간다. -->
    <div class="cls__acts" data-el="acts-train">
      <button class="bigbtn" type="button" data-el="btn-train" disabled>학습하기</button>
    </div>
    <div class="cls__acts" data-el="acts-apply">
      <button class="bigbtn bigbtn--out" type="button" data-el="btn-apply" disabled>적용하기</button>
    </div>`;

  const el = (n) => mount.querySelector(`[data-el="${n}"]`);
  const hint = el('cls-hint');
  const stateLine = el('cls-state');

  /** 위 줄 — 방금 무슨 일이 있었고 무엇을 할 수 있는가. */
  function say(html, kind) {
    hint.hidden = false;
    hint.innerHTML = html;
    hint.className = `cls__hint${kind ? ` cls__hint--${kind}` : ''}`;
  }
  function quiet() { hint.hidden = true; hint.innerHTML = ''; }

  /** 아래 줄 — 지금 상태. 위 줄이 무엇으로 차 있든 늘 보인다. */
  function paintState() {
    const L = live();
    if (readyToTrain()) {
      stateLine.hidden = false;
      stateLine.textContent = `${L.length}종 · 표본 ${L.reduce((a, c) => a + c.feats.length, 0)}장 — 학습할 수 있습니다.`;
      return;
    }
    stateLine.hidden = false;
    if (L.length < 2) { stateLine.textContent = `${L.length}종 — 클래스가 최소 두 종이어야 가릅니다.`; return; }
    const need = L.filter((c) => c.feats.length < MINS).map((c) => `${c.name} ${MINS - c.feats.length}장`).join(' · ');
    stateLine.textContent = `더 필요합니다 — ${need}`;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function render() {
    const L = live();
    el('cls-list').innerHTML = L.map((c, i) => `
      <div class="cls${i === sel ? ' is-sel' : ''}" data-el="cls" data-i="${i}">
        <div class="cls__top">
          <span class="cls__dot" style="background:${esc(c.color)}"></span>
          <input class="cls__name" data-el="cls-name" value="${esc(c.name)}" aria-label="클래스 이름">
          <button class="cls__x" type="button" data-el="cls-del" aria-label="지우기">✕</button>
        </div>
        <button class="cls__shoot" type="button" data-el="cls-shoot">촬영</button>
        <div class="cls__bar"><i style="width:${Math.min(100, (c.feats.length * 100) / MINS)}%"></i></div>
        <span class="cls__cnt">${c.feats.length} / ${MINS}장</span>
      </div>`).join('');

    el('cls-list').querySelectorAll('[data-el="cls"]').forEach((node) => {
      const i = Number(node.dataset.i);
      node.addEventListener('click', (e) => { if (e.target.tagName !== 'INPUT') { sel = i; render(); } });
      node.querySelector('[data-el="cls-name"]').addEventListener('input', (e) => {
        live()[i].name = e.target.value || '이름 없음';
        onChange();
      });
      node.querySelector('[data-el="cls-del"]').addEventListener('click', (e) => { e.stopPropagation(); softDelete(live()[i]); });
      node.querySelector('[data-el="cls-shoot"]').addEventListener('click', (e) => { e.stopPropagation(); sel = i; shoot(); });
    });

    el('cls-count').textContent = `${L.length} / ${MAXC}`;
    el('cls-add').disabled = L.length >= MAXC;
    el('btn-train').disabled = !readyToTrain();
    // 상태 줄은 언제나 다시 그린다. 되돌리기 안내가 떠 있어도 가려지지 않는다.
    paintState();
    if (!undoTarget) quiet();
    onChange();
  }

  function add() {
    if (live().length >= MAXC) return;
    const used = all.map((c) => c.color);
    all.push({
      name: `클래스 ${live().length + 1}`,
      color: PALETTE.find((p) => !used.includes(p)) || PALETTE[0],
      feats: [],
      deleted: false,
    });
    undoTarget = null;
    sel = live().length - 1;
    render();
  }

  /**
   * 소프트삭제. 표본은 그대로 두고 표시만 한다 — 되돌리면 그대로 돌아온다.
   * 되돌리기는 마지막 하나에만 준다. 여러 개를 쌓아 두면 무엇이 돌아오는지 알 수 없다.
   */
  function softDelete(c) {
    c.deleted = true;
    undoTarget = c;
    sel = 0;
    render();
    say(`"${esc(c.name)}" 을 지웠습니다. <button type="button" class="cls__undo" data-el="cls-undo">되돌리기</button>`
      + ' <span class="cls__soft">표본은 지워지지 않았습니다</span>', 'soft');
    hint.querySelector('[data-el="cls-undo"]').addEventListener('click', () => {
      c.deleted = false;
      undoTarget = null;
      sel = 0;
      render();
    });
  }

  /**
   * 촬영. 흐린 표본을 받으면 학습이 망가지므로, 선명도가 문턱 아래면 **담지 않고** 이유를 말한다.
   * 받아들일 때 남는 것은 지문 하나뿐이다.
   */
  function shoot() {
    const c = live()[sel];
    if (!c) return;
    const shot = capture();
    if (!shot.ok) { say(shot.reason, 'bad'); return; }
    if (shot.sharp < spec.sharpness_min) {
      say(`<b>흔들렸습니다.</b> 선명도 ${shot.sharp} — 흐린 표본을 담으면 학습이 망가집니다.`
        + ` 로버를 멈추고 다시 찍으세요. (문턱 ${spec.sharpness_min})`, 'bad');
      return;
    }
    c.feats.push(shot.feature);
    delete c._spread;              // 표본이 늘면 퍼짐을 다시 잰다
    undoTarget = null;
    render();
  }

  el('cls-add').addEventListener('click', add);
  render();

  return {
    /** 좌측 열에서 결과 칸 뒤로 옮겨 놓을 [적용하기] 줄. */
    applyRow: () => el('acts-apply'),
    live,
    /** 학습에 넘길 사본. 표본 배열까지 복사해 학습 뒤 편집이 모델을 흔들지 않게 한다. */
    snapshot: () => live().map((c) => ({ name: c.name, color: c.color, feats: c.feats.slice() })),
    readyToTrain,
    selected: () => live()[sel] || null,
    trainButton: () => el('btn-train'),
    applyButton: () => el('btn-apply'),
    say,
    render,
  };
}
