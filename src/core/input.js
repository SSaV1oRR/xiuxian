// 键盘输入：按住状态 + 本帧按下；界面打开时可整体屏蔽移动
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.moveLocked = false;
    this.touch = { x: 0, y: 0, active: false };
    window.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      const k = e.code;
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.touch.active = false; });
  }
  has(k) { return this.keys.has(k); }
  take(k) { const v = this.pressed.has(k); this.pressed.delete(k); return v; }
  endFrame() { this.pressed.clear(); }
  move() {
    if (this.moveLocked) return { x: 0, y: 0, run: false };
    const h = (k) => (this.keys.has(k) ? 1 : 0);
    let x = Math.max(h('KeyD'), h('ArrowRight')) - Math.max(h('KeyA'), h('ArrowLeft'));
    let y = Math.max(h('KeyW'), h('ArrowUp')) - Math.max(h('KeyS'), h('ArrowDown'));
    if (this.touch.active) { x = this.touch.x; y = this.touch.y; }
    return { x, y, run: h('ShiftLeft') || h('ShiftRight') || (this.touch.active && Math.hypot(this.touch.x, this.touch.y) > 0.92) };
  }
}
