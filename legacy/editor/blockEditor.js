// blockEditor.js — Blockly 블록코딩 (어린 학생용)
// 블록 → Arduino 코드(digitalWrite/analogWrite/delay)로 변환 → 기존 interpreter 로 판정.

import * as Blockly from 'blockly';

// 핀 드롭다운(룸마다 갱신)
let CUR_PINS = [['5', '5']];

Blockly.Blocks['led_state'] = {
  init() {
    this.appendDummyInput()
      .appendField('LED 핀').appendField(new Blockly.FieldDropdown(() => CUR_PINS), 'PIN')
      .appendField(new Blockly.FieldDropdown([['켜기 (HIGH)', 'HIGH'], ['끄기 (LOW)', 'LOW']]), 'STATE');
    this.setPreviousStatement(true); this.setNextStatement(true);
    this.setColour(45); this.setTooltip('LED 를 켜거나 끕니다');
  },
};
Blockly.Blocks['led_pwm'] = {
  init() {
    this.appendDummyInput()
      .appendField('LED 핀').appendField(new Blockly.FieldDropdown(() => CUR_PINS), 'PIN')
      .appendField('밝기').appendField(new Blockly.FieldNumber(128, 0, 255, 1), 'VAL');
    this.setPreviousStatement(true); this.setNextStatement(true);
    this.setColour(210); this.setTooltip('밝기를 0~255 로 정합니다');
  },
};
Blockly.Blocks['wait'] = {
  init() {
    this.appendDummyInput().appendField(new Blockly.FieldNumber(500, 0, 10000, 10), 'MS').appendField('ms 기다리기');
    this.setPreviousStatement(true); this.setNextStatement(true);
    this.setColour(120); this.setTooltip('잠시 기다립니다');
  },
};

Blockly.Blocks['relay_state'] = {
  init() {
    this.appendDummyInput()
      .appendField('릴레이').appendField(new Blockly.FieldDropdown(() => CUR_PINS), 'PIN')
      .appendField(new Blockly.FieldDropdown([['켜기 (ON)', 'HIGH'], ['끄기 (OFF)', 'LOW']]), 'STATE');
    this.setPreviousStatement(true); this.setNextStatement(true);
    this.setColour(160); this.setTooltip('릴레이를 켜거나 끕니다');
  },
};

// DHT 블록
Blockly.Blocks['dht_read'] = {
  init() { this.appendDummyInput().appendField('🌡️ 온습도 읽기'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(20); },
};
Blockly.Blocks['dht_temp'] = {
  init() { this.appendDummyInput().appendField('온도 출력 🌡️'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(0); },
};
Blockly.Blocks['dht_hum'] = {
  init() { this.appendDummyInput().appendField('습도 출력 💧'); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(200); },
};

const gen = new Blockly.Generator('ARD');
gen.forBlock = {
  led_state: (b) => `  digitalWrite(${b.getFieldValue('PIN')}, ${b.getFieldValue('STATE')});\n`,
  relay_state: (b) => `  digitalWrite(${b.getFieldValue('PIN')}, ${b.getFieldValue('STATE')});\n`,
  led_pwm: (b) => `  analogWrite(${b.getFieldValue('PIN')}, ${b.getFieldValue('VAL')});\n`,
  wait: (b) => `  delay(${b.getFieldValue('MS')});\n`,
  dht_read: () => `  dht.read();\n`,
  dht_temp: () => `  Serial.println(dht.temperature);\n`,
  dht_hum: () => `  Serial.println(dht.humidity);\n`,
};
gen.scrub_ = function (block, code, thisOnly) {
  const next = block.nextConnection && block.nextConnection.targetBlock();
  return next && !thisOnly ? code + this.blockToCode(next) : code;
};

const THEME = Blockly.Theme.defineTheme('eduino', {
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: '#0e1726',
    toolboxBackgroundColour: '#131d31',
    toolboxForegroundColour: '#e8eef9',
    flyoutBackgroundColour: '#1b2840',
    flyoutForegroundColour: '#cfe0ff',
    scrollbarColour: '#26344f',
    insertionMarkerColour: '#6fb7ff',
  },
});

export const TOOLBOX_LED = ['led_state', 'led_pwm', 'wait'];
export const TOOLBOX_DHT = ['dht_read', 'dht_temp', 'dht_hum', 'wait'];
export const TOOLBOX_RELAY = ['relay_state', 'wait'];

/**
 * @param {HTMLElement} host
 * @param {{ pin:number, preset?:Array, onChange?:Function, toolbox?:string[], setup?:string }} opts
 */
export function createBlockEditor(host, { pin, preset = [], onChange, toolbox = TOOLBOX_LED, setup } = {}) {
  CUR_PINS = [[String(pin), String(pin)]];
  const toolboxDef = { kind: 'flyoutToolbox', contents: toolbox.map((t) => ({ kind: 'block', type: t })) };
  const setupBody = setup != null ? setup : `  pinMode(${pin}, OUTPUT);`;
  const ws = Blockly.inject(host, {
    toolbox: toolboxDef, theme: THEME, renderer: 'zelos',
    trashcan: true, scrollbars: true, sounds: false,
    zoom: { controls: false, wheel: false, startScale: 0.95 },
    move: { scrollbars: true, drag: true, wheel: false },
  });

  // 시작 블록 미리 배치
  let prev = null;
  preset.forEach((spec, i) => {
    const b = ws.newBlock(spec.type);
    Object.entries(spec.fields || {}).forEach(([k, v]) => b.setFieldValue(String(v), k));
    b.initSvg(); b.render();
    if (i === 0) b.moveBy(24, 24);
    if (prev && prev.nextConnection && b.previousConnection) prev.nextConnection.connect(b.previousConnection);
    prev = b;
  });

  if (onChange) ws.addChangeListener(() => { if (!ws.isDragging()) onChange(getCode()); });
  setTimeout(() => Blockly.svgResize(ws), 30);

  function getCode() {
    const body = gen.workspaceToCode(ws);
    return `void setup() {\n${setupBody}\n}\n\nvoid loop() {\n${body}}\n`;
  }

  return { getCode, ws, destroy() { try { ws.dispose(); } catch (_) {} } };
}
