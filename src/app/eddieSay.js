// eddieSay.js — EDDIE 클릭 시 랜덤 대사 + 말풍선 헬퍼.
const LINES = [
  '삐빅! 오늘도 코딩 가보자! 🤖',
  '배터리가 부족해… 같이 채워줘!',
  '센서는 내 친구야. 잘 부탁해!',
  'VCC랑 GND 바꾸면 큰일 나! 조심 ⚡',
  '온도는 딱 적당한 게 좋아~ 🌡️',
  '클리어하면 진짜 신나! ✨',
  '코드 한 줄이 세상을 움직여!',
  '나를 눌러줘서 고마워 ☺️',
  '다음 방엔 뭐가 있을까? 두근두근',
  '천천히 해도 괜찮아, 차근차근!',
];
export const eddieRandom = () => LINES[Math.floor(Math.random() * LINES.length)];

/** container 에 말풍선을 만들고, say(text) 로 잠깐 보여준다. */
export function mountSay(container) {
  const el = document.createElement('div');
  el.className = 'eddie-say';
  container.appendChild(el);
  let t = null;
  return (text, x, y) => {
    el.textContent = text;
    if (x != null && y != null) {
      el.style.left = x + 'px'; el.style.top = y + 'px';
      el.style.transform = 'translate(-50%, -115%)';
    }
    el.classList.add('show');
    clearTimeout(t);
    t = setTimeout(() => el.classList.remove('show'), 2600);
  };
}
