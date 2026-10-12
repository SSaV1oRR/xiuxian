// 第二十四轮：第三十层的界面——顶部的剑尊血条（名号、阶段、气血与残影、架势、用时、当前招式）、焚天断界的倒计时、
// 屏中的短提示（弹反 · 一顿、失衡 · 破绽……）、过场的上下黑边、标题卡与「空格跳过」。只用实体元素，截图时也画得出来。
import { BOSS30 } from '../game/boss30Config.js';

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class Boss30Hud {
  constructor() { this.el = null; this.cineEl = null; this.hp = { cur: 1, lag: 1, hold: 0 }; this.cache = {}; this.moveT = 0; }
  mount() {
    if (this.el) return;
    const hud = document.querySelector('#hud');
    const el = this.el = document.createElement('div');
    el.id = 'b30-hud';
    el.innerHTML = `
      <div class="b30-top">
        <div class="b30-nm"><i class="seal">烬</i><b>${BOSS30.name}</b><em class="ph">一阶段</em></div>
        <div class="b30-track"><i class="lag"></i><i class="fill"></i><span class="num"></span></div>
        <div class="b30-post"><i class="fill"></i><span>架势</span></div>
        <div class="b30-sub"><span class="mv"></span><span class="tm">0:00</span></div>
      </div>
      <div class="b30-ult"><b>焚天断界</b><span class="cd">5.5</span><small>跑出亮边之外 · 或在爆发的一刻闪身</small></div>
      <div class="b30-pop"></div>
      <div class="b30-paused">暂停</div>
      <div class="b30-keys"><kbd>退格</kbd> 放弃挑战</div>`;
    hud.appendChild(el);
    const q = (s) => el.querySelector(s);
    this.fill = q('.b30-track .fill'); this.lag = q('.b30-track .lag'); this.num = q('.num'); this.ph = q('.ph');
    this.post = q('.b30-post .fill'); this.postBox = q('.b30-post'); this.mv = q('.mv'); this.tm = q('.tm');
    this.ultEl = q('.b30-ult'); this.ultCd = q('.b30-ult .cd'); this.popEl = q('.b30-pop'); this.pauseEl = q('.b30-paused');
    const c = this.cineEl = document.createElement('div');
    c.id = 'b30-cine';
    c.innerHTML = '<i class="bar top"></i><i class="bar bot"></i><div class="title"><b></b><span></span></div><div class="skip">空格 跳过</div>';
    document.body.appendChild(c);
    this.titleEl = c.querySelector('.title'); this.skipEl = c.querySelector('.skip');
  }
  unmount() {
    this.el?.remove(); this.cineEl?.remove(); this.el = this.cineEl = null;
    document.body.classList.remove('b30-cine', 'b30-on', 'b30-p2');
    this.cache = {};
  }
  put(k, el, prop, v) { if (this.cache[k] === v) return; this.cache[k] = v; if (prop === 'text') el.textContent = v; else if (prop === 'cls') el.className = v; else el.style.setProperty(prop, v); }
  show(on) { if (!this.el) return; this.el.classList.toggle('on', on); document.body.classList.toggle('b30-on', on); }
  setPhase(p, on = true, refill = false) {
    if (!this.el) return;
    this.ph.textContent = p === 2 ? '二阶段 · 烬火' : '一阶段';
    this.el.classList.toggle('p2', p === 2);
    document.body.classList.toggle('b30-p2', p === 2);
    if (refill || on) { this.hp.cur = this.hp.lag = 1; this.hp.hold = 0; this.cache.fill = this.cache.lag = null; }
    if (refill) { this.el.classList.remove('refill'); void this.el.offsetWidth; this.el.classList.add('refill'); }
  }
  move(text, danger = false) {
    if (!this.el) return;
    if (!text) { this.mv.textContent = ''; this.mv.classList.remove('on', 'danger'); return; }
    this.mv.textContent = text; this.mv.classList.add('on'); this.mv.classList.toggle('danger', danger);
    this.moveT = 2.4;
  }
  ult(left, total = 5.5) {
    if (!this.el) return;
    if (left == null) { this.ultEl.classList.remove('on'); return; }
    this.ultEl.classList.add('on');
    this.ultEl.style.setProperty('--k', String(1 - left / total));
    this.put('ultCd', this.ultCd, 'text', left.toFixed(1));
  }
  pause(on) { this.pauseEl?.classList.toggle('on', on && this.el?.classList.contains('on')); }
  toast30(text) {
    if (!this.popEl) return;
    this.popEl.textContent = text;
    this.popEl.classList.remove('on'); void this.popEl.offsetWidth; this.popEl.classList.add('on');
  }
  cine(on, skippable = true) {
    if (!this.cineEl) return;
    this.cineEl.classList.toggle('on', on);
    this.skipEl.classList.toggle('hidden', !skippable);
    document.body.classList.toggle('b30-cine', on);
  }
  title(t1, t2 = '', cls = '') {
    if (!this.titleEl) return;
    if (!t1) { this.titleEl.classList.remove('on'); return; }
    this.titleEl.querySelector('b').textContent = t1;
    this.titleEl.querySelector('span').textContent = t2;
    this.titleEl.className = 'title ' + cls;
    void this.titleEl.offsetWidth;
    this.titleEl.classList.add('on');
  }
  update(dt, F) {
    if (!this.el) return;
    const U = F.unit, H = this.hp;
    const f = Math.max(0, U.hp / Math.max(1, U.maxHp));
    if (f < H.cur - 1e-4) H.hold = 0.5;
    H.cur = f;
    if (H.hold > 0) H.hold -= dt; else H.lag += (H.cur - H.lag) * Math.min(1, dt * 2.6);
    if (H.lag < H.cur) H.lag = H.cur;
    this.put('fill', this.fill, 'width', `${(f * 100).toFixed(2)}%`);
    this.put('lag', this.lag, 'width', `${(H.lag * 100).toFixed(2)}%`);
    this.put('num', this.num, 'text', `${Math.ceil(U.hp)} / ${U.maxHp}`);
    const pf = Math.min(1, (F.posture || 0) / 100);
    this.put('post', this.post, 'width', `${(pf * 100).toFixed(1)}%`);
    this.put('postC', this.postBox, 'cls', 'b30-post' + (F.B?.mode === 'break' ? ' broken' : pf > 0.75 ? ' high' : ''));
    this.put('tm', this.tm, 'text', fmt(F.fightT || 0));
    if (this.moveT > 0) { this.moveT -= dt; if (this.moveT <= 0 && F.B?.mode !== 'guard') this.mv.classList.remove('on'); }
  }
}
