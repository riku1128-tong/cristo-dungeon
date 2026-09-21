// キー入力: 押下中の状態と「今フレーム押された」キューを持つ
export class Input {
  constructor(target = window) {
    this.down = new Set();
    this.pressed = [];
    this.repeatAt = new Map();
    target.addEventListener('keydown', e => {
      if (e.repeat) { e.preventDefault(); return; }
      this.down.add(e.code);
      this.pressed.push(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    target.addEventListener('keyup', e => { this.down.delete(e.code); });
    window.addEventListener('blur', () => this.down.clear());
  }
  // 今フレームに押されたキーを消費
  consume() { const p = this.pressed; this.pressed = []; return p; }
  isDown(...codes) { return codes.some(c => this.down.has(c)); }
  get shift() { return this.down.has('ShiftLeft') || this.down.has('ShiftRight'); }

  // 押下中の移動方向 (8方向)。斜めはテンキー 7/9/1/3、YUBN、矢印同時押し
  heldDir() {
    const u = this.isDown('ArrowUp', 'KeyW', 'Numpad8', 'KeyK');
    const d = this.isDown('ArrowDown', 'KeyS', 'Numpad2', 'KeyJ');
    const l = this.isDown('ArrowLeft', 'KeyA', 'Numpad4', 'KeyH');
    const r = this.isDown('ArrowRight', 'KeyD', 'Numpad6', 'KeyL');
    if (this.isDown('Numpad7', 'KeyY') || (u && l)) return 'ul';
    if (this.isDown('Numpad9', 'KeyU') || (u && r)) return 'ur';
    if (this.isDown('Numpad1', 'KeyB') || (d && l)) return 'dl';
    if (this.isDown('Numpad3', 'KeyN') || (d && r)) return 'dr';
    if (u) return 'up';
    if (d) return 'down';
    if (l) return 'left';
    if (r) return 'right';
    return null;
  }
}

// 単発押しの方向キー判定（短いタップでも 1 歩動けるように）
const DIR_KEYS = {
  ArrowUp: 'up', KeyW: 'up', Numpad8: 'up', KeyK: 'up',
  ArrowDown: 'down', KeyS: 'down', Numpad2: 'down', KeyJ: 'down',
  ArrowLeft: 'left', KeyA: 'left', Numpad4: 'left', KeyH: 'left',
  ArrowRight: 'right', KeyD: 'right', Numpad6: 'right', KeyL: 'right',
  Numpad7: 'ul', KeyY: 'ul', Numpad9: 'ur', KeyU: 'ur', Numpad1: 'dl', KeyB: 'dl', Numpad3: 'dr', KeyN: 'dr',
};
export function dirFromCode(code) { return DIR_KEYS[code] || null; }

export const KEY = {
  ok: ['Enter', 'Space', 'KeyZ'],
  cancel: ['Escape', 'KeyX', 'Backspace'],
  inventory: ['KeyI'],
  spells: ['KeyM'],
  rest: ['KeyR', 'Period', 'Numpad5'],
  stairs: ['KeyF'],
  map: ['Tab'],
};
export function is(code, name) { return KEY[name].includes(code); }
