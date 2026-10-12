// 动作库（第十四轮）：Quaternius「Universal Animation Library 2」（CC0）重定向到程序化骨架后的动作数据
// （tools/convert_ual2.py 一次算好：每帧 15 根骨在角色空间里的世界旋转 + 骨盆位移，30 帧 / 秒，Int16 量化）。
// 运行时只做两件事：按时刻在两帧之间插值；按「动作权重 × 部位遮罩」与程序化姿势混合后写回关节——
//   本地旋转 = 父骨（混合后）世界旋转⁻¹ × 动作给出的世界旋转，再与程序化的本地旋转按权重球面插值。
// 修士（Character）与魔修（NPC，无腿关节）都用同一份数据，只是关节表不同（缺的关节为 null）。
// AnimPlayer：每个角色一份，一条当前动作 + 一条淡出中的上一个动作（交叉淡化），可只放一段（from–to）、变速、停在末帧。
import * as THREE from 'three';

export const BONE = { pelvis: 0, chest: 1, head: 2, sh_l: 3, el_l: 4, wr_l: 5, sh_r: 6, el_r: 7, wr_r: 8, hip_l: 9, knee_l: 10, ankle_l: 11, hip_r: 12, knee_r: 13, ankle_r: 14 };
const NB = 15;
// 部位遮罩：full 全身；upper 上身（腰以上，骨盆不动——边走边出手）；arms 只有双臂（与程序化躯干叠加）
export const MASKS = {
  full: new Float32Array(NB).fill(1),
  upper: Float32Array.from([0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]),
  arms: Float32Array.from([0, 0.35, 0.5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]),
};

export class AnimLib {
  static async load(url) {
    const [meta, buf] = await Promise.all([fetch(url + '.json').then((r) => r.json()), fetch(url + '.bin').then((r) => r.arrayBuffer())]);
    return new AnimLib(meta, new Int16Array(buf));
  }
  constructor(meta, data) {
    this.meta = meta; this.data = data;
    this.fps = meta.fps; this.stride = meta.stride;
    this.parents = meta.parents;
    this.pelvisRest = new THREE.Vector3(...meta.pelvisRest);
    this.blade = { l: new THREE.Vector3(...meta.blade.l), r: new THREE.Vector3(...meta.blade.r) };
  }
  has(name) { return !!this.meta.clips[name]; }
  dur(name) { return this.meta.clips[name]?.dur ?? 0; }
  peaks(name) { return this.meta.clips[name]?.peaks ?? []; }
  // 采样到 out：{ q: Quaternion[15]（角色空间世界旋转）, p: Vector3（骨盆相对静止的位移，米）}
  sample(name, t, out) {
    const c = this.meta.clips[name];
    const f = Math.max(0, Math.min(c.frames - 1, t * this.fps)), f0 = Math.floor(f), f1 = Math.min(c.frames - 1, f0 + 1), u = f - f0;
    const D = this.data, S = this.stride, a = (c.offset + f0) * S, b = (c.offset + f1) * S, k = 1 / 32767;
    for (let i = 0; i < NB; i++) {
      const o = i * 4;
      _qa.set(D[a + o] * k, D[a + o + 1] * k, D[a + o + 2] * k, D[a + o + 3] * k).normalize();
      _qb.set(D[b + o] * k, D[b + o + 1] * k, D[b + o + 2] * k, D[b + o + 3] * k).normalize();
      out.q[i].slerpQuaternions(_qa, _qb, u);
    }
    const o = NB * 4;
    out.p.set(D[a + o] + (D[b + o] - D[a + o]) * u, D[a + o + 1] + (D[b + o + 1] - D[a + o + 1]) * u, D[a + o + 2] + (D[b + o + 2] - D[a + o + 2]) * u).multiplyScalar(0.001);
    return out;
  }
}
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const pose = () => ({ q: Array.from({ length: NB }, () => new THREE.Quaternion()), p: new THREE.Vector3() });

// 一个角色的动作播放器。rig：{ joints: Object3D[15]（缺的为 null）, pelvis: Object3D, pelvisRest: Vector3, pelvisScale: Vector3（骨盆位移各轴缩放）}
export class AnimPlayer {
  constructor(lib, rig) {
    this.lib = lib; this.rig = rig;
    this.cur = null; this.prev = null;
    this.A = pose(); this.B = pose();
    this.R = Array.from({ length: NB }, () => new THREE.Quaternion());
    this.saved = rig.joints.map(() => new THREE.Euler());
    this.savedP = new THREE.Vector3();
    this.applied = false;
  }
  get active() { return !!(this.cur || this.prev); }
  get name() { return this.cur?.name ?? null; }
  get time() { return this.cur ? this.cur.t : 0; }
  // name：动作名；o：{ speed, from, to, loop, hold（放完停在末帧）, fade（淡入秒数）, mask, weight }
  play(name, o = {}) {
    if (!this.lib.has(name)) return null;
    const dur = this.lib.dur(name);
    if (this.cur) { this.prev = this.cur; this.prev.fadeOut = o.fade ?? 0.12; }
    this.cur = { name, t: o.from ?? 0, from: o.from ?? 0, to: Math.min(dur, o.to ?? dur), speed: o.speed ?? 1, loop: !!o.loop, hold: !!o.hold,
      fade: o.fade ?? 0.12, w: o.fade === 0 ? 1 : 0, wMax: o.weight ?? 1, mask: MASKS[o.mask || 'full'], done: false, fadeOut: 0 };
    return this.cur;
  }
  // 淡出回到程序化姿势
  stop(fade = 0.18) { if (this.cur) { this.prev = this.cur; this.prev.fadeOut = fade; this.cur = null; } }
  // 当前动作已放到的时刻（秒，按原动作时间轴）
  at(t) { return this.cur && this.cur.t >= t; }
  update(dt) {
    const c = this.cur;
    if (c) {
      c.t += dt * c.speed;
      if (c.t >= c.to) {
        if (c.loop) c.t = c.from + ((c.t - c.from) % Math.max(1e-3, c.to - c.from));
        else { c.t = c.to; c.done = true; if (!c.hold) this.stop(0.2); }
      }
      if (this.cur) c.w = Math.min(c.wMax, c.w + (c.fade > 0 ? dt / c.fade : 1));
    }
    const p = this.prev;
    if (p) {
      if (!p.done) { p.t = Math.min(p.to, p.t + dt * p.speed); }
      p.w -= p.fadeOut > 0 ? (dt / p.fadeOut) * Math.max(p.wMax, 0.01) : 1;
      if (p.w <= 0) this.prev = null;
    }
  }
  // 每帧程序化姿势算完之后调用：混合写回关节
  apply() {
    const rig = this.rig, J = rig.joints, lib = this.lib, c = this.cur, p = this.prev;
    if (!c && !p) return;
    // 记下程序化姿势（下一帧开头还原，程序化动作照常从自己的状态继续插值）
    J.forEach((j, i) => { if (j) this.saved[i].copy(j.rotation); });
    this.savedP.copy(rig.pelvis.position);
    this.applied = true;
    if (c) lib.sample(c.name, c.t, this.A);
    if (p) lib.sample(p.name, p.t, this.B);
    const wc = c ? c.w : 0, wp = p ? p.w : 0, W = Math.max(wc, wp);
    const mix = c && p ? wc / Math.max(1e-4, wc + wp) : c ? 1 : 0;
    const P = lib.parents, R = this.R;
    for (let i = 0; i < NB; i++) {
      const j = J[i];
      const parentQ = P[i] < 0 ? IDENT : R[P[i]];
      if (!j) { R[i].copy(parentQ); continue; }
      const mc = c ? c.mask[i] : 0, mp = p ? p.mask[i] : 0;
      const w = c && p ? (wc * mc + wp * mp) / Math.max(1e-4, wc + wp) * W : c ? wc * mc : wp * mp;
      if (w <= 1e-4) { R[i].multiplyQuaternions(parentQ, j.quaternion); continue; }
      // 动作给出的世界旋转（两条交叉淡化），换成相对父骨的本地旋转，再与程序化的本地旋转混合
      const target = c && p ? _t.slerpQuaternions(this.B.q[i], this.A.q[i], mix) : (c ? this.A.q[i] : this.B.q[i]);
      _l.copy(parentQ).invert().multiply(target);
      j.quaternion.slerp(_l, Math.min(1, w));
      R[i].multiplyQuaternions(parentQ, j.quaternion);
    }
    // 骨盆位移
    const mc0 = c ? c.mask[0] : 0, mp0 = p ? p.mask[0] : 0;
    const wP = c && p ? (wc * mc0 + wp * mp0) / Math.max(1e-4, wc + wp) * W : c ? wc * mc0 : wp * mp0;
    if (wP > 1e-4) {
      const dp = c && p ? _v.lerpVectors(this.B.p, this.A.p, mix) : (c ? this.A.p : this.B.p);
      const s = rig.pelvisScale;
      _v2.set(rig.pelvisRest.x + dp.x * s.x, rig.pelvisRest.y + dp.y * s.y, rig.pelvisRest.z + dp.z * s.z);
      rig.pelvis.position.lerp(_v2, Math.min(1, wP));
    }
  }
  // 下一帧开头：还原成程序化姿势
  restore() {
    if (!this.applied) return;
    this.rig.joints.forEach((j, i) => { if (j) j.rotation.copy(this.saved[i]); });
    this.rig.pelvis.position.copy(this.savedP);
    this.applied = false;
  }
  // 当前混合后的整体权重（0 程序化 … 1 完全按动作）
  weight(bone = BONE.chest) {
    const c = this.cur, p = this.prev;
    return Math.max(c ? c.w * c.mask[bone] : 0, p ? p.w * p.mask[bone] : 0);
  }
}
const IDENT = new THREE.Quaternion(), _t = new THREE.Quaternion(), _l = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
