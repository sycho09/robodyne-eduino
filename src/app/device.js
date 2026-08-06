// device.js — PC / 태블릿 모드 (조작·레이아웃 분기)
// 모드는 localStorage 에 저장. 터치 가능 기기는 'tablet' 을 기본 추천.
// <html data-mode="pc|tablet"> 로 반영되어 CSS 가 즉시 분기(토글 시 실시간 반영).

const KEY = 'eduino.mode';
const subs = new Set();

function detectDefault() {
  try {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const touch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
    return (coarse || touch) ? 'tablet' : 'pc';
  } catch (_) { return 'pc'; }
}

let _mode = null;
try { _mode = localStorage.getItem(KEY); } catch (_) {}

export function hasChosenMode() { return _mode === 'pc' || _mode === 'tablet'; }
export function recommendedMode() { return detectDefault(); }
export function getMode() { return (_mode === 'pc' || _mode === 'tablet') ? _mode : detectDefault(); }
export function isTablet() { return getMode() === 'tablet'; }

export function setMode(m) {
  _mode = m === 'tablet' ? 'tablet' : 'pc';
  try { localStorage.setItem(KEY, _mode); } catch (_) {}
  applyAttr();
  subs.forEach((f) => { try { f(_mode); } catch (e) { console.error(e); } });
}
export function onModeChange(fn) { subs.add(fn); return () => subs.delete(fn); }

function applyAttr() { try { document.documentElement.setAttribute('data-mode', getMode()); } catch (_) {} }
applyAttr();   // 부팅 시 즉시 반영(저장값/추천값)
