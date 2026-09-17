/**
 * engine/signals.js — 신호등 (자율주행 챌린지 전용).
 *
 * 주기는 매니페스트가 소유하고 전부 tick 으로 센다. 벽시계도 난수도 쓰지 않으므로
 * 같은 코드는 언제나 같은 tick 에서 같은 신호를 만난다 — 결정론이 유지된다.
 *
 * 지점마다 시작 위상(offset)을 다르게 줄 수 있어, 한 바퀴 도는 동안 서로 다른 신호를 만난다.
 */

export const SIGNAL = Object.freeze({ GREEN: 'green', YELLOW: 'yellow', RED: 'red' });

/** 신호 색 → 지켜야 할 행동. 판단 지점의 정답이 여기서 나온다. */
export const SIGNAL_EXPECT = Object.freeze({ green: 'go', yellow: 'slow', red: 'stop' });

export function createSignals(challenge) {
  const cfg = challenge.scene && challenge.scene.signals;
  if (!cfg || !cfg.cycle) return null;
  const green = cfg.cycle.green_ticks | 0;
  const yellow = cfg.cycle.yellow_ticks | 0;
  const red = cfg.cycle.red_ticks | 0;
  const period = green + yellow + red;
  if (period <= 0) return null;
  return { green, yellow, red, period };
}

/** tick 하나만 있으면 색이 정해진다. 상태를 들고 있지 않으므로 되감아도 같은 값이 나온다. */
export function signalAt(cfg, offsetTicks, tick) {
  if (!cfg) return null;
  const t = (((tick + (offsetTicks | 0)) % cfg.period) + cfg.period) % cfg.period;
  if (t < cfg.green) return SIGNAL.GREEN;
  if (t < cfg.green + cfg.yellow) return SIGNAL.YELLOW;
  return SIGNAL.RED;
}

/** 다음 색으로 바뀌기까지 남은 tick. 화면에서 "곧 바뀐다"를 보여 줄 때 쓴다. */
export function ticksToChange(cfg, offsetTicks, tick) {
  if (!cfg) return 0;
  const t = (((tick + (offsetTicks | 0)) % cfg.period) + cfg.period) % cfg.period;
  if (t < cfg.green) return cfg.green - t;
  if (t < cfg.green + cfg.yellow) return cfg.green + cfg.yellow - t;
  return cfg.period - t;
}
