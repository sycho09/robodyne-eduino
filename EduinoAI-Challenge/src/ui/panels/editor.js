/**
 * ui/panels/editor.js — 코드 에디터 (외부 라이브러리 없음).
 *
 * 구간 표시(23차): 스타터 코드에 `// [설정]` 같은 마커 주석을 두면, 마커부터 다음 마커
 * 직전까지를 한 구간으로 보고 왼쪽 레일에 색 띠와 구간 이름을 그린다.
 * 줄 번호가 아니라 마커를 기준으로 삼으므로 학생이 코드를 늘리거나 줄여도 어긋나지 않는다.
 * 마커를 지우면 그 구간 표시도 사라진다 — 정상 동작이다.
 *
 * 자동 줄바꿈을 켜서 가로 스크롤을 없앴다. 대신 줄번호가 어긋나면 안 되므로,
 * 숨겨진 미러 요소로 각 논리 줄이 실제로 차지한 높이를 재서 줄번호 칸 높이를 맞춘다.
 * 바깥에는 getValue/setValue/setErrorLines/focusLine 만 노출한다(나중에 교체 가능).
 */

/**
 * 45차 ino 테마: 아두이노 IDE 를 그대로 옮긴 어두운 배색. 켜고 끄는 것은 매니페스트가 정한다
 * (`scene.ui.editor_theme`). 색 값은 CSS 가 갖고, 여기서는 무엇이 무슨 갈래인지만 가른다.
 *
 * 갈래를 목록으로 박아 두지 않는다 — 함수는 "이름 뒤에 여는 괄호", 상수는 "모두 대문자" 로
 * 가른다. 그래야 챌린지마다 쓰는 API 가 달라져도 에디터를 고칠 일이 없다.
 */
const TOKEN_RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(#[ \t]*[A-Za-z_]\w*)|(0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?)|([A-Za-z_]\w*)/g;
/** 자료형과 흐름 제어. 아두이노 IDE 에서 올리브색으로 칠하는 것들이다. */
const KW_TYPE = new Set([
  'void', 'int', 'long', 'short', 'char', 'byte', 'bool', 'boolean', 'float', 'double',
  'unsigned', 'signed', 'const', 'static', 'struct', 'sizeof',
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return',
]);

/** 코드 한 덩어리를 색 있는 조각으로 나눈다. innerHTML 을 쓰지 않아 코드가 마크업이 되지 않는다. */
function paintCode(text) {
  const frag = document.createDocumentFragment();
  const push = (str, cls) => {
    if (!str) return;
    if (!cls) { frag.append(document.createTextNode(str)); return; }
    const el = document.createElement('span');
    el.className = cls;
    el.textContent = str;
    frag.append(el);
  };
  let last = 0;
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    push(text.slice(last, m.index), null);
    last = m.index + m[0].length;
    if (m[1]) push(m[0], 'tk-cm');
    else if (m[2]) push(m[0], 'tk-st');
    else if (m[3]) push(m[0], 'tk-pp');
    else if (m[4]) push(m[0], 'tk-nu');
    else if (KW_TYPE.has(m[0])) push(m[0], 'tk-ty');
    else if (m[0] === 'true' || m[0] === 'false' || /^[A-Z][A-Z0-9_]*$/.test(m[0])) push(m[0], 'tk-cn');
    else if (/^[ \t]*\(/.test(text.slice(last))) push(m[0], 'tk-fn');
    // Serial 처럼 대문자로 시작하고 뒤에 점이 오는 이름은 보드가 주는 객체다.
    // 목록으로 박지 않는다 — 모양으로 가른다.
    else if (/^[A-Z]/.test(m[0]) && /^[ \t]*\./.test(text.slice(last))) push(m[0], 'tk-cn');
    else push(m[0], null);
  }
  push(text.slice(last), null);
  // 마지막 줄이 개행으로 끝나면 브라우저가 그 빈 줄을 접는다. textarea 는 접지 않으므로 한 줄 더 둔다.
  frag.append(document.createTextNode('\n'));
  return frag;
}

/**
 * 57-E — 안내가 짚을 자리를 코드 문자열로 찾는다.
 *
 * 예전에는 `// [설정]` 같은 마커 주석을 기준으로 삼았는데, 54차에 스타터에서 주석을
 * 전부 없애면서 마커가 사라졌고 짚기가 조용히 죽어 있었다. 주석을 되살리는 대신
 * 코드에 실제로 있는 문자열을 앵커로 쓴다 — 주석이 없어도 코드는 있다.
 *
 * `nth` 는 그 문자열을 담은 줄 가운데 몇 번째인지다(1부터). setup 의 delay 와
 * loop 의 delay 를 가르는 데 쓴다. 못 찾으면 -1 이고, 부르는 쪽이 짚기를 건너뛴다 —
 * 학생이 코드를 고쳐 앵커가 사라지는 것은 정상이라 오류로 막지 않는다.
 */
export function anchorLine(text, anchor) {
  if (!anchor || !anchor.find) return -1;
  const want = Math.max(1, anchor.nth | 0 || 1);
  const lines = String(text).split('\n');
  let seen = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(anchor.find)) continue;
    seen += 1;
    if (seen === want) return i;
  }
  return -1;
}

/** 마커 주석. 줄 앞머리가 `// [이름]` 이면 구간이 시작한다. 뒤에는 설명을 이어 써도 된다. */
const SECTION_RE = /^\s*\/\/\s*\[([^\]\n]{1,12})\]/;
/** 띠 색은 22차 토큰에서만 가져온다. 세 가지를 돌려 쓴다. */
const BAND_TOKENS = [
  ['var(--c-accent-strong)', 'var(--c-accent-dim)'],
  ['var(--c-ok)', 'var(--c-ok-bg)'],
  ['var(--c-warn)', 'var(--c-warn-bg)'],
];

export function createEditor({ mount, value, onChange, theme, onSections, onCursor }) {
  const ino = theme === 'ino';
  const wrap = document.createElement('div');
  wrap.className = ino ? 'editor editor--ino' : 'editor';
  wrap.style.position = 'relative';

  const rail = document.createElement('div');
  rail.className = 'editor__rail';
  const railInner = document.createElement('div');
  railInner.className = 'editor__rail-inner';
  rail.append(railInner);

  // 코드 칸 뒤에 아주 옅게 깔리는 구간 배경. 글자 뒤라 가독성을 해치지 않는다.
  const zones = document.createElement('div');
  zones.className = 'editor__zones';
  const zonesInner = document.createElement('div');
  zones.append(zonesInner);

  const gutter = document.createElement('div');
  gutter.className = 'editor__gutter';

  const area = document.createElement('textarea');
  area.className = 'editor__area';
  area.spellcheck = false;
  area.autocapitalize = 'off';
  area.autocomplete = 'off';
  area.value = value || '';

  // 줄 높이 측정용 미러. 화면에는 보이지 않는다.
  const mirror = document.createElement('div');
  mirror.className = 'editor__area editor__mirror';
  mirror.setAttribute('aria-hidden', 'true');
  // .editor__area 규칙이 뒤에서 position 을 덮어써도 미러가 그리드 칸을 차지하면 안 된다.
  mirror.style.position = 'absolute';

  // 색칠 층. textarea 는 글자가 투명해지고, 같은 자리에 같은 글꼴·같은 줄바꿈으로 이 층이 깔린다.
  // textarea 안의 글자를 직접 칠할 방법은 없어서, 겹쳐 그리는 것이 유일한 길이다.
  const hl = ino ? document.createElement('div') : null;
  if (hl) {
    hl.className = 'editor__area editor__hl';
    hl.setAttribute('aria-hidden', 'true');
  }
  // 지금 커서가 놓인 줄. 코드 칸 뒤에 얕은 띠 하나로 깔린다.
  const cur = ino ? document.createElement('div') : null;
  if (cur) cur.className = 'editor__curline';
  // 지금 실행 중인 줄. 값은 런타임(sandbox 의 __at)이 적고 화면은 읽기만 한다.
  const run = ino ? document.createElement('div') : null;
  if (run) { run.className = 'editor__runline'; run.hidden = true; }

  wrap.append(rail, gutter, zones, area, mirror);
  if (hl) wrap.insertBefore(hl, area);
  if (cur) zonesInner.append(cur);
  if (run) zonesInner.append(run);
  mount.append(wrap);

  let errorLines = new Set();
  let runLine = 0;                 // 0 이면 멈춘 상태 — 아무 줄도 짚지 않는다
  // 마지막 렌더에서 잰 줄 위치. 가이드 퀘스트가 특정 줄을 가리킬 때 쓴다.
  let layout = { lines: [], heights: [], offsets: [], padTop: 0, marks: [] };

  function renderGutter() {
    const lines = area.value.split('\n');

    // 접지 않으므로 줄 높이는 폭과 무관하다. 그래도 글꼴·행간은 같아야 하므로 미러로 잰다.
    mirror.style.width = `${area.clientWidth}px`;
    mirror.replaceChildren(...lines.map((line) => {
      const d = document.createElement('div');
      d.textContent = line === '' ? ' ' : line;
      return d;
    }));

    const heights = Array.from(mirror.children, (c) => c.offsetHeight);

    gutter.replaceChildren(...lines.map((_, i) => {
      const n = document.createElement('span');
      n.className = 'editor__num' + (errorLines.has(i + 1) ? ' is-error' : '');
      n.textContent = String(i + 1);
      if (heights[i]) n.style.height = `${heights[i]}px`;
      return n;
    }));
    renderBands(lines, heights);
    if (hl) {
      hl.style.left = `${area.offsetLeft}px`;
      hl.style.width = `${area.clientWidth}px`;
      hl.replaceChildren(paintCode(area.value));
    }
    syncScroll();
    paintCursor();
    paintRunLine();
  }

  /** 커서가 놓인 논리 줄 번호(0부터). 자동 줄바꿈과 무관하게 개행만 센다. */
  function curLine() {
    let n = 0;
    const end = area.selectionStart;
    for (let i = 0; i < end && i < area.value.length; i++) if (area.value[i] === '\n') n++;
    return n;
  }

  /**
   * 지금 줄을 줄번호 칸과 코드 칸 양쪽에 표시한다. 아두이노 IDE 처럼 포커스가 떠나도 남긴다 —
   * 여기까지 고쳤다는 표시라, 결과 카드를 보고 돌아왔을 때 자리를 다시 찾지 않아도 된다.
   * 값은 건드리지 않으므로 물리에 닿지 않는다.
   */
  /** 커서가 놓인 칸 번호(1부터). 줄 첫머리가 1 칸이다 — 실물 IDE 와 같게 센다. */
  function curCol() {
    const end = area.selectionStart;
    const nl = area.value.lastIndexOf('\n', end - 1);
    return end - nl;
  }

  function paintCursor() {
    const i = curLine();
    // 상태 띠의 "줄 N, 칸 M". 값은 여기서만 나온다 — 밖에서 다시 세지 않는다.
    if (onCursor) onCursor(i + 1, curCol());
    if (!cur) return;
    const { offsets, heights } = layout;
    const on = offsets[i] !== undefined;
    cur.hidden = !on;
    if (on) {
      cur.style.top = `${offsets[i]}px`;
      cur.style.height = `${heights[i] || 0}px`;
    }
    gutter.querySelectorAll('.editor__num.is-cur').forEach((n) => n.classList.remove('is-cur'));
    if (on) gutter.children[i]?.classList.add('is-cur');
  }

  /** 실행 중인 줄 띠. 커서 띠와 달리 주행 중에만 보인다. */
  function paintRunLine() {
    if (!run) return;
    const i = runLine - 1;
    const { offsets, heights } = layout;
    const on = i >= 0 && offsets[i] !== undefined;
    run.hidden = !on;
    if (on) {
      run.style.top = `${offsets[i]}px`;
      run.style.height = `${heights[i] || 0}px`;
    }
    gutter.querySelectorAll('.editor__num.is-run').forEach((n) => n.classList.remove('is-run'));
    if (on) gutter.children[i]?.classList.add('is-run');
  }

  /** 그 줄이 화면 밖이면 가운데로 끌어온다. 이미 보이면 아무것도 하지 않는다. */
  function scrollLineIntoView(i) {
    const { offsets, heights, total } = layout;
    const top = offsets[i];
    if (top === undefined) return;
    const h = heights[i] || 0;
    const view = area.clientHeight;
    if (top >= area.scrollTop && top + h <= area.scrollTop + view) return;
    area.scrollTop = Math.max(0, Math.min((total || 0) - view, top - view / 2 + h / 2));
    syncScroll();
  }

  function syncScroll() {
    gutter.scrollTop = area.scrollTop;
    rail.scrollTop = area.scrollTop;
    zones.scrollTop = area.scrollTop;
    if (hl) { hl.scrollTop = area.scrollTop; hl.scrollLeft = area.scrollLeft; }
  }

  /** 마커 줄을 찾아 구간마다 띠 하나를 만든다. 높이는 줄 높이를 그대로 더한 값이다. */
  function renderBands(lines, heights) {
    const padTop = parseFloat(getComputedStyle(area).paddingTop) || 0;
    const offsets = [];
    let acc = padTop;
    for (let i = 0; i < lines.length; i++) { offsets.push(acc); acc += heights[i] || 0; }
    railInner.style.height = `${acc + padTop}px`;
    zonesInner.style.height = `${acc + padTop}px`;

    const marks = [];
    lines.forEach((line, i) => {
      const m = SECTION_RE.exec(line);
      if (m) marks.push({ line: i, name: m[1].trim() });
    });
    layout = { lines, heights, offsets, padTop, marks, total: acc };

    const spans = marks.map((mk, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].line : lines.length;
      const top = offsets[mk.line];
      const bottom = end < lines.length ? offsets[end] : acc;
      const [fg, bg] = BAND_TOKENS[i % BAND_TOKENS.length];
      return { top, height: Math.max(0, bottom - top), name: mk.name, fg, bg };
    });

    railInner.replaceChildren(...spans.map((sp) => {
      const d = document.createElement('div');
      d.className = 'editor__band';
      d.style.setProperty('--band', sp.fg);
      d.style.setProperty('--band-bg', sp.bg);
      d.style.top = `${sp.top}px`;
      d.style.height = `${sp.height}px`;
      // 51차 — 이름은 에디터 위 범례가 맡는다. 여기는 색 띠만 남긴다.
      return d;
    }));
    if (onSections) onSections(spans.map((sp) => ({ name: sp.name, fg: sp.fg })));
    // 45차: ino 테마에서는 구간을 코드 뒤 색조가 아니라 왼쪽 세로 막대로만 알린다.
    const tints = ino ? [] : spans;
    zonesInner.replaceChildren(...(cur ? [cur, run] : []), ...tints.map((sp) => {
      const d = document.createElement('div');
      d.className = 'editor__zone';
      d.style.background = sp.bg;
      d.style.top = `${sp.top}px`;
      d.style.height = `${sp.height}px`;
      return d;
    }));
    zones.style.left = `${area.offsetLeft}px`;
    zones.style.width = `${area.offsetWidth}px`;
  }

  area.addEventListener('input', () => { renderGutter(); if (onChange) onChange(area.value); });
  area.addEventListener('scroll', syncScroll);
  for (const ev of ['keyup', 'click', 'select']) area.addEventListener(ev, paintCursor);
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = area.selectionStart;
      const t = area.selectionEnd;
      area.value = `${area.value.slice(0, s)}  ${area.value.slice(t)}`;
      area.selectionStart = area.selectionEnd = s + 2;
      renderGutter();
      if (onChange) onChange(area.value);
    }
  });

  if (window.ResizeObserver) new ResizeObserver(() => renderGutter()).observe(area);
  requestAnimationFrame(renderGutter);
  renderGutter();

  return {
    getValue: () => area.value,
    setValue(v) { area.value = v; renderGutter(); },
    setErrorLines(lines) { errorLines = new Set(lines); renderGutter(); },
    /** 지금 실행 중인 줄(1부터). 0 이면 표시를 끈다. 값은 런타임이 낸 것만 쓴다. */
    setRunLine(n) {
      const next = Number(n) || 0;
      if (next === runLine) return;
      runLine = next;
      paintRunLine();
      // 짚어 놓고 화면 밖이면 아무 소용이 없다. 다만 학생이 고치는 중이면 건드리지 않는다.
      if (next > 0 && document.activeElement !== area) scrollLineIntoView(next - 1);
    },
    /** 지금 코드에 있는 구간 마커. 45차 구간 진행바가 이름을 여기서 가져간다. */
    sections: () => layout.marks.map((m) => ({ name: m.name, line: m.line })),
    /** `[설정]` 같은 구간 안에서 특정 글자가 든 첫 줄을 찾는다. 줄 번호를 박아두지 않기 위한 것. */
    /** 57-E — 코드 문자열로 짚을 줄을 찾는다. 화면과 검사가 같은 함수를 쓴다. */
    findAnchor(anchor) { return anchorLine(area.value, anchor); },
    findLine({ section, match }) {
      const { lines, marks } = layout;
      let from = 0;
      let to = lines.length;
      if (section) {
        const i = marks.findIndex((m) => m.name === section);
        if (i < 0) return -1;
        from = marks[i].line;
        to = i + 1 < marks.length ? marks[i + 1].line : lines.length;
      }
      for (let i = from; i < to; i++) {
        if (!match || lines[i].includes(match)) {
          if (match || !SECTION_RE.test(lines[i])) return i;
        }
      }
      return -1;
    },
    /** 화면 좌표로 본 줄의 사각형. 스크롤로 가려져 있으면 먼저 보이게 한 뒤 잰다. */
    lineRect(i) {
      const { offsets, heights, total } = layout;
      if (i < 0 || i >= offsets.length) return null;
      const top = offsets[i];
      const h = heights[i] || 0;
      const view = area.clientHeight;
      if (top < area.scrollTop || top + h > area.scrollTop + view) {
        area.scrollTop = Math.max(0, Math.min(total - view, top - view / 2 + h / 2));
        gutter.scrollTop = area.scrollTop;
        rail.scrollTop = area.scrollTop;
        zones.scrollTop = area.scrollTop;
      }
      const box = area.getBoundingClientRect();
      const padLeft = parseFloat(getComputedStyle(area).paddingLeft) || 0;
      return {
        top: box.top + top - area.scrollTop,
        left: box.left + padLeft * 0.5,
        width: Math.max(40, area.clientWidth - padLeft),
        height: h,
      };
    },
    focusLine(line, col) {
      const lines = area.value.split('\n');
      let pos = 0;
      for (let i = 0; i < Math.min(line - 1, lines.length); i++) pos += lines[i].length + 1;
      pos += Math.max(0, (col || 1) - 1);
      area.focus();
      area.setSelectionRange(pos, pos);
    },
  };
}
