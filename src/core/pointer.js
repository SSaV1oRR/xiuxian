// 鼠标锁定（Pointer Lock）：点击画面进入锁定，直接移动鼠标转动视角；锁定时左键攻击（按住连续出手）、右键按住防御、中键按住蓄力重击（与 Z 相同）。
// Esc（浏览器自带）或打开对话、行囊、舆图、设置时释放鼠标，视角控制暂停、可以正常点击界面；
// 关闭界面后需再次点击画面才重新锁定——这次点击只用于锁定，不会触发攻击（按键事件只在已锁定时处理）。
// 失去焦点、切换窗口、释放锁定时一律松开左、中、右键（不会卡在持续攻击、持续防御、持续蓄力）。
export class PointerControl {
  constructor(dom, { cam, canLock, onAttack, onGuard, onHeavy, onRelease, onChange }) {
    this.dom = dom; this.cam = cam;
    this.canLock = canLock; this.onAttack = onAttack; this.onGuard = onGuard; this.onHeavy = onHeavy; this.onRelease = onRelease; this.onChange = onChange;
    this.locked = false;
    this.guarding = false; this.attacking = false; this.heavy = false;
    this.unlockT = -1e9;
    this.skip = 0;
    this.avg = 8;                     // 近来鼠标位移的平均量（识别偶发的跳变）
    this.supported = 'requestPointerLock' in dom;
    dom.addEventListener('click', () => { if (!this.locked && this.canLock()) this.lock(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      if (this.locked) this.skip = 2;
      else { this.unlockT = performance.now(); this.releaseAll(); }
      document.body.classList.toggle('mouse-locked', this.locked);
      this.onChange?.(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; document.body.classList.remove('mouse-locked'); });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      if (this.skip > 0) { this.skip--; return; }          // 刚锁定时的头一两个事件常带一次性的大位移
      // 浏览器偶尔会报一次远超平常的位移（窗口失焦、光标回绕）：比近来平均大很多倍的单次事件丢弃，不让镜头猛地翻转
      const m = Math.hypot(e.movementX, e.movementY);
      if (m > 140 && m > this.avg * 7) return;
      this.avg = this.avg * 0.9 + Math.min(m, 160) * 0.1;
      this.cam.look(e.movementX, e.movementY);
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      e.preventDefault();
      if (e.button === 0) this.setAttack(true);
      else if (e.button === 2) this.setGuard(true);
      else if (e.button === 1) this.setHeavy(true);
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.setAttack(false);
      else if (e.button === 2) this.setGuard(false);
      else if (e.button === 1) this.setHeavy(false);
    });
    // 右键不弹出浏览器菜单（锁定时，或在画面上）；中键不触发自动滚动
    document.addEventListener('contextmenu', (e) => { if (this.locked || e.target === dom) e.preventDefault(); });
    document.addEventListener('auxclick', (e) => { if (this.locked && e.button === 1) e.preventDefault(); });
    addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
  }
  lock() {
    if (!this.supported) return;
    const plain = () => { try { const q = this.dom.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (e) { /* 浏览器拒绝锁定（窗口未激活等），点击画面可重试 */ } };
    try {
      // 原始输入（不受系统鼠标加速影响）；不支持时退回普通锁定
      const p = this.dom.requestPointerLock({ unadjustedMovement: true });
      if (p && typeof p.catch === 'function') p.catch((e) => { if (e && e.name === 'NotSupportedError') plain(); });
    } catch (e) {
      plain();
    }
  }
  unlock() {
    this.releaseAll();
    if (this.locked) document.exitPointerLock();
  }
  setAttack(v) { if (this.attacking === v) return; this.attacking = v; this.onAttack?.(v); }
  setGuard(v) { if (this.guarding === v) return; this.guarding = v; this.onGuard?.(v); }
  setHeavy(v) { if (this.heavy === v) return; this.heavy = v; this.onHeavy?.(v); }
  // 松开一切（失焦、释放锁定、打开界面、过场）
  releaseAll() { this.setAttack(false); this.setGuard(false); this.setHeavy(false); this.onRelease?.(); }
  // 刚刚因 Esc 释放了锁定（这次 Esc 不再打开设置）
  justUnlocked(ms = 350) { return performance.now() - this.unlockT < ms; }
}
