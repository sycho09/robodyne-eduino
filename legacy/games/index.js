// games/index.js — roomId → mountGame(root, ctx) 매핑.
// 각 게임은 지침서 §4 계약(mountGame 반환 {destroy})을 따른다.
import { mountRgb } from './rgb.js';
import { mountBuzzer } from './buzzer.js';
import { mountKeypad } from './keypad.js';
import { mountSeg } from './seg.js';

export const GAMES = {
  rgb: mountRgb,
  buzzer: mountBuzzer,
  keypad: mountKeypad,
  seg: mountSeg,
};
