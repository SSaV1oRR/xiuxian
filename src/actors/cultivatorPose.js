// 第十七轮：金白修士的姿势编排——与第十六轮龙君的 boss50Pose.js 同一思路，换成修士的 Mixamo 骨架：
// 按关键姿势在骨骼上解 IK，生成真实的骨骼动作（THREE.AnimationClip）。剑招、蓄力重击、格挡弹反、受击、闪身、施法都由它产出
// （动作数据见 cultivatorClips.js），载入时一次生成，之后与 glb 里的动作一样逐骨采样、混合。
//
// 坐标：模型空间（修士根节点之下，米），Y 朝上，人面朝 +Z，+X 是人的左手边；脚踝在地面上方约 0.105 米。
// 底姿势：动作库 Idle 的一帧（双肘、双膝微弯——IK 只改肢体走向，弯曲平面的扭转由它带出来）。
// 一个姿势（spec）由这些部分叠成：
//   root / rootX：根运动（米，沿 +Z / +X 的累计位移；游戏按它移动人物，见 clip.userData.root——动作本身不挪根节点，位移只有这一个来源）
//   hips：[x, y, z] 骨盆相对底姿势的位移（米）；pelvis / chest / head：{ t 向左转, b 前屈, s 向左侧弯 }（度）
//         chest 按 0.3 / 0.35 / 0.35 分到三节脊椎（相对骨盆），head 按 0.4 / 0.6 分到颈与头（相对胸）；
//         look（0–1）：头把骨盆与胸的转身抵消多少（眼睛盯着前方），缺省 0.65
//   R：右手握剑 { g: [x, y, z] 握持点（剑的原点，掌心）, d: [x, y, z] 剑尖方向, e: [x, y, z] 刃口朝向, el: [x, y, z] 肘尖的朝向提示 }
//   L：左手 { p: [x, y, z] 腕, f: 手指朝向, n: 掌心朝向, el }；缺省为底姿势。L2（0–1）：与「双手握剑、托在剑柄尾端」之间的混合，elL 双手时的肘向
//   shR / shL：锁骨额外的转动 { t, b, s }（度）；够不着时锁骨会自动前送
//   fL / fR：脚踝在地面参照里的位置 [x, y, z]（随根运动换回身体坐标：踩住的脚不滑），yawL / yawR 脚尖外撇（度，正为向左），
//   heelL / heelR 抬脚跟（度，绕前脚掌）；kL / kR：膝尖朝向提示；feet: 'model' 时脚跟着身体走（闪身、倒地等原地动作）
// clip(name, keys)：keys = [{ t, ease, ...spec }]；缺省项沿用上一键。相邻键之间：数值线性（按 ease 的进度）；
// 握剑点沿 Catmull-Rom 曲线（剑划出弧线而不是折线）；剑的朝向按四元数球面插值（一段别超过 120°，不然会抄近路从背后绕）；
// 脚换位时按步长自动抬起。每 1/30 秒取样一次。
import * as THREE from 'three';
import { EASE as BOSS_EASE, bodyRot } from './boss50Pose.js';

// 缓动：与龙君共用一套，唯 snap 仍按第十七轮调好的 5 次方（第十八轮为了龙君把共用的 snap 改成 3 次方，顺带让修士的格挡、弹反、
// 受击起势慢了半拍；第十九轮把修士这边改回来）
export const EASE = { ...BOSS_EASE, snap: (u) => 1 - Math.pow(1 - u, 5) };
// 第十九轮：拔刀斩蓄势时的鞘（骨盆本地，米）——左手把鞘压平（鞘口朝前、鞘尾朝后略低），各把剑都一样；
// 姿势里 R.sheath（剑从鞘口抽出了几米，0 即全在鞘中）与 L.sheath（左手握在鞘口往里几米处）都以它为准，
// 运行时 Cultivator.sheathTilt 把鞘转到同一个位置
// 第二十轮：分成两个——出刀时的鞘（IAI_SHEATH，即第十九轮的，剑顺着它抽出来）与蓄势时的鞘（IAI_SHEATH_HOLD：鞘口离胯再远一点、
// 鞘再横一点，侧身时剑柄伸出身形之外，背后看得见）。键里的 sh（0 蓄势的鞘 … 1 出刀的鞘，缺省 1）在两者之间插值，
// 动作里逐帧记下（clip.userData.sheathPose），运行时鞘也转到同一处（Cultivator.sheathPose）——出刀的前 0.045 秒左手把鞘由蓄势转到出刀的角度
export const IAI_SHEATH = { pos: [0.17, 0.06, 0.15], dir: [0.1, -0.3, -0.95], guard0: 0.055 };
export const IAI_SHEATH_HOLD = { pos: [0.22, 0.06, 0.17], dir: [-0.05, -0.3, -0.95] };
// 两个鞘之间：sh 处的鞘口位置与鞘的方向（骨盆本地）
export function iaiSheathAt(sh = 1, outPos = new THREE.Vector3(), outDir = new THREE.Vector3()) {
  const A = IAI_SHEATH_HOLD, B = IAI_SHEATH, k = Math.min(1, Math.max(0, sh));
  outPos.set(A.pos[0] + (B.pos[0] - A.pos[0]) * k, A.pos[1] + (B.pos[1] - A.pos[1]) * k, A.pos[2] + (B.pos[2] - A.pos[2]) * k);
  const a = _sd1.set(...A.dir).normalize(), b = _sd2.set(...B.dir).normalize();
  outDir.copy(a).lerp(b, k).normalize();
  return { pos: outPos, dir: outDir };
}
const _sd1 = new THREE.Vector3(), _sd2 = new THREE.Vector3();
const DEG = Math.PI / 180;
// 与 cultivator.js 同一顺序
export const BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
const BI = Object.fromEntries(BONES.map((n, i) => [n, i]));
const PARENT = {
  Hips: null, Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck',
  LeftShoulder: 'Spine2', LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm',
  RightShoulder: 'Spine2', RightArm: 'RightShoulder', RightForeArm: 'RightArm', RightHand: 'RightForeArm',
  LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg', LeftToeBase: 'LeftFoot',
  RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg', RightToeBase: 'RightFoot',
};
const PI_ = BONES.map((n) => (PARENT[n] ? BI[PARENT[n]] : -1));
const N = BONES.length;
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// 剑（或手）的朝向：本地 X 对到 x、Y 对到 y（x 先对 y 正交化）
function frameQ(x, y, out = new THREE.Quaternion()) {
  const yy = _v.copy(y).normalize();
  const xx = _v2.copy(x).addScaledVector(yy, -x.dot(yy));
  if (xx.lengthSq() < 1e-8) xx.set(1, 0, 0).addScaledVector(yy, -yy.x);
  xx.normalize();
  const zz = _v3.crossVectors(xx, yy);
  return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xx, yy, zz));
}

export class CultivatorPose {
  // char：Cultivator（取骨骼的骨长、静止姿势、动作库 Idle 与握剑参数）
  constructor(char, { baseClip = 'Idle', baseT = 0.5 } = {}) {
    this.meta = char.meta;
    // 骨长：各骨相对父骨的位置（不随动作变；骨盆另算）
    this.off = BONES.map((n, i) => char.bones[i].position.clone());
    // 底姿势（本地）：动作库 Idle 的一帧
    const q = new Float32Array(N * 4), p = new Float32Array(3);
    char.clips[baseClip].sample(baseT, q, p, char.rest, char.restP);
    this.base = BONES.map((n, i) => new THREE.Quaternion().fromArray(q, i * 4));
    this.baseP = new THREE.Vector3().fromArray(p);
    this.baseW = this.fk(this.base, this.baseP);
    // 静止姿势（绑定姿势：双脚踩平、脚尖朝前）的世界朝向——踩地时脚掌以它为准
    const rq = BONES.map((n, i) => new THREE.Quaternion().fromArray(char.rest, i * 4));
    this.restL = rq;
    this.restW = this.fk(rq, new THREE.Vector3().fromArray(char.restP));
    // 肢长
    const L = (a, b) => this.baseW.p[BI[a]].distanceTo(this.baseW.p[BI[b]]);
    this.len = {
      armR: [L('RightArm', 'RightForeArm'), L('RightForeArm', 'RightHand')], armL: [L('LeftArm', 'LeftForeArm'), L('LeftForeArm', 'LeftHand')],
      legR: [L('RightUpLeg', 'RightLeg'), L('RightLeg', 'RightFoot')], legL: [L('LeftUpLeg', 'LeftLeg'), L('LeftLeg', 'LeftFoot')],
    };
    // 握剑挂点（手骨本地）：与 Cultivator.setSword 相同的算法（各剑的微调参数不计）
    this.sock = {};
    for (const s of ['r', 'l']) {
      const H = this.meta.hands[s];
      const b = V(H.blade).normalize();
      const f = V(H.fingers); f.addScaledVector(b, -f.dot(b)).normalize();
      const z = new THREE.Vector3().crossVectors(f, b);
      const sq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f, b, z));
      const sp = V(H.fingers).multiplyScalar(0.075).addScaledVector(V(H.palm), 0.022);
      this.sock[s] = { q: sq, p: sp, qi: sq.clone().invert(), fingers: V(H.fingers).normalize(), palm: V(H.palm).normalize() };
    }
    this.stats = null;
  }

  // 正向运动：本地旋转 + 骨盆位置 → 模型空间的 { q[], p[] }
  fk(loc, hipP, out = null) {
    const W = out || { q: BONES.map(() => new THREE.Quaternion()), p: BONES.map(() => new THREE.Vector3()) };
    for (let i = 0; i < N; i++) {
      const pi = PI_[i];
      if (pi < 0) { W.q[i].copy(loc[i]); W.p[i].copy(hipP); continue; }
      W.q[i].copy(W.q[pi]).multiply(loc[i]);
      W.p[i].copy(this.off[i]).applyQuaternion(W.q[pi]).add(W.p[pi]);
    }
    return W;
  }

  // 在骨的底姿势世界朝向下施加一个模型空间的转动（相对父骨：父骨转了它跟着转）
  turn(loc, i, r, k = 1) {
    if (!r) return;
    const D = bodyRot({ t: (r.t || 0) * k, b: (r.b || 0) * k, s: (r.s || 0) * k }, _q2);
    const Wq = this.baseW.q[i];
    _q3.copy(Wq).invert().multiply(D).multiply(Wq);
    loc[i].multiply(_q3);
  }

  // 一个姿势 → 各骨本地旋转与骨盆位置
  solve(spec = {}) {
    const loc = this.base.map((q) => q.clone());
    const hipP = this.baseP.clone();
    if (spec.hips) hipP.add(_v.set(spec.hips[0], spec.hips[1], spec.hips[2]));
    // 骨盆、脊椎、颈与头
    if (spec.pelvis) { const D = bodyRot(spec.pelvis, _q2); loc[0].premultiply(D); }
    const ch = spec.chest;
    if (ch) { this.turn(loc, BI.Spine, ch, 0.3); this.turn(loc, BI.Spine1, ch, 0.35); this.turn(loc, BI.Spine2, ch, 0.35); }
    const look = spec.look ?? 0.65, pv = spec.pelvis || {}, c = ch || {};
    const hd = { t: (spec.head?.t || 0) - ((pv.t || 0) + (c.t || 0)) * look, b: (spec.head?.b || 0) - ((pv.b || 0) + (c.b || 0)) * look * 0.6, s: (spec.head?.s || 0) - ((pv.s || 0) + (c.s || 0)) * look * 0.5 };
    this.turn(loc, BI.Neck, hd, 0.4); this.turn(loc, BI.Head, hd, 0.6);
    if (spec.shR) this.turn(loc, BI.RightShoulder, spec.shR);
    if (spec.shL) this.turn(loc, BI.LeftShoulder, spec.shL);
    let W = this.fk(loc, hipP);
    const st = this.stats;
    // 右手握剑：剑尖方向 d、握持点 g 给定；刃口 e 与肘向 el 是「希望」——在刃口左右 75°、肘绕肩腕连线 ±100° 内
    // 挑前臂扭转与腕屈最小的一组（手腕自然），并与上一帧选的接近（不跳）。R.fix 时完全按给定
    let swordQ = null, grip = null;
    if (spec.R) {
      const R = spec.R;
      grip = V(R.g);
      const q0 = frameQ(V(R.e || [0, 0, 1]), V(R.d || [0, 1, 0]), new THREE.Quaternion());
      const pole0 = V(R.el || [-0.55, -0.8, -0.15]).normalize();
      this.reach(loc, hipP, W, 'Right', grip);
      W = this.fk(loc, hipP, W);
      const pick = R.fix ? { q: q0, pole: pole0 } : this.armSearch(W, 'R', grip, q0, pole0, R.roll ?? 75, R.swing ?? 100);
      swordQ = pick.q;
      const handQ = swordQ.clone().multiply(this.sock.r.qi);
      const wrist = grip.clone().sub(this.sock.r.p.clone().applyQuaternion(handQ));
      const err = this.ik2(loc, W, BI.RightArm, BI.RightForeArm, BI.RightHand, wrist, pick.pole);
      W = this.fk(loc, hipP, W);
      this.setHand(loc, W, BI.RightForeArm, BI.RightHand, handQ, st, 'R');
      W = this.fk(loc, hipP, W);
      if (st) note(st, 'reach', err, 'R');
    }
    // 左手：自由（p 腕、f 手指、n 掌心）与双手握剑（托在剑柄尾端）之间按 L2 混合（0 自由 … 1 双手）
    const two = swordQ ? Math.min(1, Math.max(0, spec.L2 || 0)) : 0;
    if (two > 0 || (spec.L && spec.L.p)) {
      const Lh = spec.L && spec.L.p ? spec.L : null, S = this.sock.l;
      let wrist = Lh ? V(Lh.p) : null, handQ = null;
      if (Lh && Lh.f) handQ = frameQ(V(Lh.n || [0, -1, 0]), V(Lh.f), new THREE.Quaternion()).multiply(frameQ(S.palm, S.fingers, new THREE.Quaternion()).invert());
      if (two > 0) {
        const d = _v.set(0, 1, 0).applyQuaternion(swordQ).clone();
        const q2 = swordQ.clone().multiply(S.qi);
        const w2 = grip.clone().addScaledVector(d, -(spec.twoAt ?? 0.095)).sub(S.p.clone().applyQuaternion(q2));
        wrist = wrist ? wrist.lerp(w2, two) : w2;
        handQ = handQ ? handQ.slerp(q2, two) : q2;
      }
      this.reach(loc, hipP, W, 'Left', wrist);
      W = this.fk(loc, hipP, W);
      let el = V(two >= 0.5 ? spec.elL || [0.55, -0.8, -0.15] : (Lh && Lh.el) || [0.6, -0.75, -0.2]).normalize();
      if (handQ && two >= 0.5) el = this.armSearch(W, 'L', wrist, handQ, el, 0, 100, true).pole;     // 双手握剑：左肘也挑自然的方向
      const err = this.ik2(loc, W, BI.LeftArm, BI.LeftForeArm, BI.LeftHand, wrist, el);
      W = this.fk(loc, hipP, W);
      if (handQ) { this.setHand(loc, W, BI.LeftForeArm, BI.LeftHand, handQ, st, two > 0 ? 'L2' : 'L'); W = this.fk(loc, hipP, W); }
      if (st) note(st, 'reach', err, two > 0 ? 'L2' : 'L');
    }
    // 双腿：脚踝踩到目标（地面参照时按根运动换回身体坐标），脚掌踩平、外撇、抬脚跟
    const root = spec.feet === 'model' ? 0 : spec.root || 0, rootX = spec.feet === 'model' ? 0 : spec.rootX || 0;
    for (const s of ['L', 'R']) {
      const side = s === 'L' ? 'Left' : 'Right', up = BI[side + 'UpLeg'], kn = BI[side + 'Leg'], ft = BI[side + 'Foot'], toe = BI[side + 'ToeBase'];
      const f = spec['f' + s];
      const heel = (spec['heel' + s] || 0) * DEG, yaw = (spec['yaw' + s] || 0) * DEG;
      const ankle = f ? V(f) : this.baseW.p[ft].clone();
      if (f) { ankle.z -= root; ankle.x -= rootX; }
      // 抬脚跟：脚掌绕前脚掌转，脚踝随之升高
      const ball = this.restW.p[toe].clone().sub(this.restW.p[ft]);
      const footLen = Math.hypot(ball.z, ball.x);
      if (heel > 0) ankle.y += footLen * Math.sin(heel) * 0.92;
      const yawQ = _q.setFromAxisAngle(Y, yaw).clone();
      const pole = V(spec['k' + s] || [s === 'L' ? 0.22 : -0.22, 0, 1]).applyQuaternion(yawQ).normalize();
      const err = this.ik2(loc, W, up, kn, ft, ankle, pole);
      W = this.fk(loc, hipP, W);
      // 脚掌：静止姿势的世界朝向（踩平、朝前）→ 外撇 → 抬脚跟（绕脚的横轴）
      const want = this.restW.q[ft].clone().premultiply(yawQ);
      if (heel > 0) { const ax = X.clone().applyQuaternion(yawQ); want.premultiply(_q2.setFromAxisAngle(ax, heel)); }
      loc[ft].copy(W.q[kn]).invert().multiply(want);
      W = this.fk(loc, hipP, W);
      // 脚趾：抬脚跟时压回地面
      const toeWant = this.restW.q[toe].clone().premultiply(yawQ);
      loc[toe].copy(W.q[ft]).invert().multiply(toeWant);
      W = this.fk(loc, hipP, W);
      if (st) { note(st, 'reach', err, 'f' + s); st.toeY = Math.min(st.toeY, W.p[toe].y); }
    }
    return { loc, hipP, W, swordQ, grip };
  }

  // 挑握法与肘向：绕剑身转 roll（±rollRange°，15° 一档）× 肘绕肩腕连线转 swing（±swingRange°，20° 一档），
  // 每组解一遍手臂 IK，看前臂扭转、腕屈、够不够得着、偏离希望的程度与上一帧的差。
  // side 'R'：q0 为剑的朝向（握持点 at = 剑的原点）；side 'L'（handOnly）：q0 直接是手的朝向、at 是腕位，只挑肘向
  // 手腕是否自然看三样（前臂坐标）：剑身与前臂的夹角（锤握时中立约 90°；尺偏把剑往前臂方向压，最多约 40° → 夹角 50°，桡偏约 15° → 105°）、
  // 屈伸（手指绕剑身方向的转角，约 ±70°）、相对中立腕位的扭转（旋前旋后，约 ±100°）
  armSearch(W, side, at, q0, pole0, rollRange, swingRange, handOnly = false) {
    const isR = side === 'R', S = isR ? this.sock.r : this.sock.l;
    const a = BI[isR ? 'RightArm' : 'LeftArm'], b = BI[isR ? 'RightForeArm' : 'LeftForeArm'], c = BI[isR ? 'RightHand' : 'LeftHand'];
    const N0 = this.restL[c], N0i = N0.clone().invert();
    const axis = this.off[c].clone().normalize();
    const bladeH = V(this.meta.hands[isR ? 'r' : 'l'].blade).normalize(), fingH = new THREE.Vector3(0, 1, 0);
    const d = new THREE.Vector3(0, 1, 0).applyQuaternion(q0);
    const prev = (this.armPrev ||= {})[side] || { roll: 0, swing: 0 };
    const sh = W.p[a];
    let best = null, bc = Infinity;
    const q = new THREE.Quaternion(), handQ = new THREE.Quaternion(), wrist = new THREE.Vector3(), pole = new THREE.Vector3(), ax = new THREE.Vector3();
    for (let r = -rollRange; r <= rollRange + 1e-6; r += 15) {
      q.setFromAxisAngle(d, r * DEG).multiply(q0);
      if (handOnly) { handQ.copy(q); wrist.copy(at); } else { handQ.copy(q).multiply(S.qi); wrist.copy(at).sub(_v.copy(S.p).applyQuaternion(handQ)); }
      ax.copy(wrist).sub(sh).normalize();
      for (let s = -swingRange; s <= swingRange + 1e-6; s += 20) {
        pole.copy(pole0).applyAxisAngle(ax, s * DEG);
        const { qb, err } = this.ik2Q(W, a, b, c, wrist, pole);
        const rel = qb.invert().multiply(handQ);
        const Rr = rel.clone().multiply(N0i);
        let tw = 2 * Math.atan2(Rr.x * axis.x + Rr.y * axis.y + Rr.z * axis.z, Rr.w);
        if (tw > Math.PI) tw -= Math.PI * 2; else if (tw < -Math.PI) tw += Math.PI * 2;
        const hl = _q3.setFromAxisAngle(axis, -tw * 0.6).multiply(rel);
        const { ba, fl } = wristAngles(hl, bladeH, fingH, axis);
        const cost = exc(ba, 50, 105) * 3 + exc(fl, 0, 70) * 1.5 + exc(Math.abs(tw), 0, 100) * 1.2 + Math.abs(tw) * 0.12 + err * 12
          + (Math.abs(r) * 0.3 + Math.abs(s) * 0.22 + Math.abs(r - prev.roll) * 0.5 + Math.abs(s - prev.swing) * 0.6) * DEG;
        if (this.trace) this.trace.push({ side, r, s, tw: Math.round(tw / DEG), ba: Math.round(ba / DEG), fl: Math.round(fl / DEG), err: +err.toFixed(3), cost: +cost.toFixed(2) });
        if (cost < bc) { bc = cost; best = { roll: r, swing: s, q: q.clone(), pole: pole.clone() }; }
      }
    }
    this.armPrev[side] = { roll: best.roll, swing: best.swing };
    return best;
  }

  // 够不着时把锁骨往目标方向送一点（至多 22°）
  reach(loc, hipP, W, side, wrist) {
    const sh = BI[side + 'Shoulder'], arm = BI[side + 'Arm'];
    const [l1, l2] = this.len[side === 'Right' ? 'armR' : 'armL'];
    const S = W.p[arm], d = S.distanceTo(wrist), max = (l1 + l2) * 0.97;
    if (d <= max) return;
    const C = W.p[sh];
    const a = _v.copy(S).sub(C).normalize(), b = _v2.copy(wrist).sub(C).normalize();
    const ang = Math.min(22 * DEG, Math.acos(Math.max(-1, Math.min(1, a.dot(b)))), (d - max) / Math.max(0.05, C.distanceTo(S)) * 1.2);
    const axis = _v3.crossVectors(a, b);
    if (axis.lengthSq() < 1e-10) return;
    axis.normalize();
    const R = _q2.setFromAxisAngle(axis, ang);
    const newW = R.multiply(W.q[sh].clone());
    loc[sh].copy(W.q[PI_[sh]]).invert().multiply(newW);
  }

  // 两节 IK：a → b → c，把 c 送到 target，弯向 pole；弯曲平面由现有姿势的平面转过去（保住关节的铰链方向）。返回够不着的距离（米）
  ik2(loc, W, a, b, c, target, pole) {
    const r = this.ik2Q(W, a, b, c, target, pole);
    loc[a].copy(W.q[PI_[a]]).invert().multiply(r.qa);
    loc[b].copy(r.qa).invert().multiply(r.qb);
    return r.err;
  }
  // 同上，只算不写：返回 a、b 新的世界朝向
  ik2Q(W, a, b, c, target, pole) {
    const A = W.p[a], Bp = W.p[b], C = W.p[c];
    const la = A.distanceTo(Bp), lb = Bp.distanceTo(C);
    const d0 = target.clone().sub(A);
    const dReal = d0.length();
    const dmin = Math.abs(la - lb) + 0.01, dmax = la + lb - 0.0015;
    const dir = d0.normalize();
    const d = Math.min(dmax, Math.max(dmin, dReal));
    const cosA = (la * la + d * d - lb * lb) / (2 * la * d);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const side = pole.clone().addScaledVector(dir, -pole.dot(dir));
    if (side.lengthSq() < 1e-8) side.set(0, -1, 0).addScaledVector(dir, dir.y);
    side.normalize();
    const upperDir = dir.clone().multiplyScalar(cosA).addScaledVector(side, sinA);
    const elbow = A.clone().addScaledVector(upperDir, la);
    const end = A.clone().addScaledVector(dir, d);
    const lowerDir = end.clone().sub(elbow).normalize();
    const curU = Bp.clone().sub(A).normalize(), curL = C.clone().sub(Bp).normalize();
    // 底姿势的弯曲平面法线；目标近乎伸直时用 pole 定平面
    const nCur = new THREE.Vector3().crossVectors(curU, curL);
    let nNew = new THREE.Vector3().crossVectors(upperDir, lowerDir);
    if (nNew.lengthSq() < 1e-8) nNew.crossVectors(side, dir).negate();
    if (nCur.lengthSq() < 1e-8) nCur.copy(nNew);
    const rotU = alignFrames(curU, nCur, upperDir, nNew);
    const newWa = rotU.clone().multiply(W.q[a]);
    const Wb = rotU.clone().multiply(W.q[b]);
    const curL2 = curL.clone().applyQuaternion(rotU);
    const rotL = alignFrames(curL2, nNew, lowerDir, nNew);
    const newWb = rotL.multiply(Wb);
    return { qa: newWa, qb: newWb, err: Math.max(0, dReal - dmax, dmin - dReal) };
  }

  // 手的世界朝向设为 handQ：相对中立腕位（绑定姿势）绕前臂轴的扭转六成给前臂（旋前 / 旋后——整个手的世界朝向不变），
  // 其余与腕的屈伸留在手上；屈伸（手指方向偏离中立腕位）超过 80° 截住（剑的朝向会因此偏一点，统计里记下）
  setHand(loc, W, fore, hand, handQ, st, tag) {
    const rel = W.q[fore].clone().invert().multiply(handQ);            // 手的本地旋转（前臂坐标）
    const N0 = this.restL[hand];
    const axis = this.off[hand].clone().normalize();                     // 前臂本地的骨轴
    const R = rel.clone().multiply(N0.clone().invert());                 // 中立腕位 → 现在（前臂坐标）
    const dp = R.x * axis.x + R.y * axis.y + R.z * axis.z;
    let tw = 2 * Math.atan2(dp, R.w);
    if (tw > Math.PI) tw -= Math.PI * 2; else if (tw < -Math.PI) tw += Math.PI * 2;
    const T = new THREE.Quaternion().setFromAxisAngle(axis, tw * 0.6);
    loc[fore].multiply(T);
    let hl = T.invert().multiply(rel);
    // 屈伸（手指方向与前臂的夹角）超过 100° 才截住（再弯就是折断的样子）；剑身与前臂的夹角超出常态记下来
    const fa = Math.acos(Math.max(-1, Math.min(1, _v.set(0, 1, 0).applyQuaternion(hl).dot(axis))));
    const lim = 100 * DEG;
    if (fa > lim) { const fa0 = Math.acos(Math.max(-1, Math.min(1, _v.set(0, 1, 0).applyQuaternion(N0).dot(axis)))); hl = N0.clone().slerp(hl, Math.max(0, (lim - fa0) / Math.max(1e-3, fa - fa0))); }
    loc[hand].copy(hl);
    if (st) {
      const isR = hand === BI.RightHand, bH = V(this.meta.hands[isR ? 'r' : 'l'].blade).normalize();
      const { ba, fl } = wristAngles(hl, bH, new THREE.Vector3(0, 1, 0), axis);
      note(st, 'wrist', fl / DEG, tag); note(st, 'twist', Math.abs(tw) / DEG, tag); note(st, 'bladeOff', exc(ba, 50, 105) / DEG, tag);
      if (fa > lim) st.wristClamp.add(tag);
    }
  }

  // 生成一段动作。keys：[{ t, ease, ...spec }]；o.loop 循环；o.marks 各时刻（出剑、收势……）；o.check 记下穿模与够不着的统计
  // 键之间逐项继承：缺省的项沿用上一键；刃口：键里直接给了 e 就用它（并停用沿用下来的转轴），否则有挥剑转轴 n 时取 n × d
  prepare(keys) {
    keys = keys.slice().sort((a, b) => a.t - b.t);
    const full = []; let prev = {};
    for (const k of keys) {
      const f = { ...prev, ...k, R: k.R ? { ...(prev.R || {}), ...k.R } : prev.R };
      // 第十九轮：这一键直接给了握剑点 / 左腕，就不再沿用前面「按着鞘」的写法
      if (k.R && k.R.g && f.R) delete f.R.sheath;
      if (k.L && k.L.p && f.L) { f.L = { ...f.L }; delete f.L.sheath; }
      if (f.R) {
        if (k.R && k.R.e && !k.R.n) delete f.R.n;
        if (f.R.n && f.R.d && f.R.sheath == null) { const e = _v.crossVectors(V(f.R.n).normalize(), V(f.R.d).normalize()); if (e.lengthSq() > 1e-6) f.R.e = e.normalize().toArray(); }
      }
      if ((f.R && f.R.sheath != null) || (f.L && f.L.sheath != null)) this.resolveSheath(f);
      full.push(f); prev = f;
    }
    return full;
  }

  // 第十九轮：「按着鞘」的手换成模型空间的目标——先按这一键的身体（骨盆、脊椎、腿）解出骨盆的位置朝向，
  // 再把蓄势时的鞘（IAI_SHEATH，骨盆本地）换过来：R.sheath = 剑从鞘口抽出了几米（握剑点、剑尖方向、刃口都与鞘中的剑一致），
  // L.sheath = 左手握在鞘口往里几米处（L.off 腕离鞘轴的偏移、L.fl 手指、L.nl 掌心，都是骨盆本地）。每一键各自换算，跟着骨盆走。
  // pull（键的顶层项）：出刀时左手把鞘顺着鞘的轴往后拉了几米（鞘引き）——两只手都按拉过以后的鞘换算，运行时鞘也拉同样多（Cultivator.sheathPull）
  resolveSheath(f) {
    const body = this.solve({ ...f, R: undefined, L: undefined, L2: 0 });
    const hq = body.W.q[0], hp = body.W.p[0];
    const S = IAI_SHEATH, sp = iaiSheathAt(f.sh ?? 1), dir = sp.dir.clone(), pos = sp.pos.clone().addScaledVector(dir, f.pull || 0);
    const out = new THREE.Vector3(1, 0, 0); out.addScaledVector(dir, -out.dot(dir)).normalize();
    const ex = new THREE.Vector3().crossVectors(dir, out);                 // 鞘中剑的本地 X（刃口），与 Cultivator.setSword 的算法相同
    const P = (v) => v.applyQuaternion(hq).add(hp), D = (v) => v.applyQuaternion(hq);
    if (f.R && f.R.sheath != null) {
      const grip = pos.clone().addScaledVector(dir, -(S.guard0 + 0.01) - f.R.sheath);
      f.R = { ...f.R, g: P(grip).toArray(), d: D(dir.clone()).toArray(), e: D(ex.clone()).toArray() };
      delete f.R.n;
    }
    if (f.L && f.L.sheath != null) {
      const at = pos.clone().addScaledVector(dir, f.L.sheath).add(V(f.L.off || [0.05, 0.03, 0]));
      f.L = { ...f.L, p: P(at).toArray(), f: D(V(f.L.fl || [-0.5, -0.8, 0.2]).normalize()).toArray(), n: D(V(f.L.nl || [-0.85, 0.1, -0.2]).normalize()).toArray() };
    }
  }

  clip(name, keys, { fps = 30, loop = false, marks = {}, phases = null } = {}) {
    const full = this.prepare(keys);
    const dur = full[full.length - 1].t;
    const n = Math.max(2, Math.round(dur * fps) + 1);
    const times = new Float32Array(n), rootZ = new Float32Array(n), rootX = new Float32Array(n), hip = new Float32Array(n * 3), pull = new Float32Array(n), shp = new Float32Array(n);
    const track = BONES.map(() => new Float32Array(n * 4));
    this.stats = { t: 0, reach: 0, wrist: 0, twist: 0, bladeOff: 0, toeY: 9, wristClamp: new Set(), clear: 9, clearAt: -1, blade: [] };
    this.armPrev = {};
    const frames = [];
    for (let i = 0; i < n; i++) {
      const t = Math.min(dur, i / fps); times[i] = t;
      this.stats.t = t;
      const spec = this.specAt(full, t);
      rootZ[i] = spec.feet === 'model' ? 0 : spec.root || 0;
      rootX[i] = spec.feet === 'model' ? 0 : spec.rootX || 0;
      pull[i] = spec.pull || 0;
      shp[i] = spec.sh ?? 1;
      const r = this.solve(spec);
      for (let b = 0; b < N; b++) {
        const q = r.loc[b], arr = track[b];
        if (i > 0 && arr[(i - 1) * 4] * q.x + arr[(i - 1) * 4 + 1] * q.y + arr[(i - 1) * 4 + 2] * q.z + arr[(i - 1) * 4 + 3] * q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
        arr.set([q.x, q.y, q.z, q.w], i * 4);
      }
      hip.set([r.hipP.x, r.hipP.y, r.hipP.z], i * 3);
      if (r.swordQ) { const c = this.clearance(r.W, r.grip, r.swordQ); if (c < this.stats.clear) { this.stats.clear = c; this.stats.clearAt = t; } this.stats.blade.push(c); }
      frames.push(r);
    }
    const tracks = BONES.map((b, i) => new THREE.QuaternionKeyframeTrack(`mixamorig${b}.quaternion`, times, track[i]));
    tracks.push(new THREE.VectorKeyframeTrack('mixamorigHips.position', times, hip));
    const c = new THREE.AnimationClip(name, dur, tracks);
    let moved = false; for (let i = 0; i < n; i++) if (Math.abs(rootZ[i]) > 1e-5 || Math.abs(rootX[i]) > 1e-5) { moved = true; break; }
    const S = this.stats;
    c.userData = { loop, authored: true, marks, phases, root: moved ? { times, z: rootZ, x: rootX } : null, pull: pull.some((v) => v !== 0) ? { times, v: pull } : null, sheathPose: shp.some((v) => v !== 1) ? { times, v: shp } : null,
      check: { reach: +S.reach.toFixed(3), reachAt: S.reachAt, wrist: Math.round(S.wrist), wristAt: S.wristAt, twist: Math.round(S.twist), twistAt: S.twistAt, bladeOff: Math.round(S.bladeOff), bladeOffAt: S.bladeOffAt,
        toeY: +S.toeY.toFixed(3), wristClamp: [...S.wristClamp], clear: +S.clear.toFixed(3), clearAt: +S.clearAt.toFixed(2) } };
    this.stats = null;
    return c;
  }

  // t 时刻的姿势：在相邻两键之间插值（握剑点走曲线、剑的朝向球面插值、脚换位时抬起）
  specAt(full, t) {
    let j = 0; while (j < full.length - 2 && full[j + 1].t <= t) j++;
    const k0 = full[j], k1 = full[Math.min(j + 1, full.length - 1)];
    const span = Math.max(1e-6, k1.t - k0.t);
    const u = (EASE[k1.ease || 'inout'] || EASE.inout)(Math.min(1, Math.max(0, (t - k0.t) / span)));
    const out = lerpSpec(k0, k1, u);
    if (k0.R && k1.R) {
      const km = full[Math.max(0, j - 1)], kp = full[Math.min(full.length - 1, j + 2)];
      const g = (k) => (k.R ? k.R.g : k0.R.g);
      const R = { ...out.R };
      R.g = catmull(g(km), g(k0), g(k1), g(kp), u);
      const q0 = frameQ(V(k0.R.e || [0, 0, 1]), V(k0.R.d || [0, 1, 0]), new THREE.Quaternion());
      const q1 = frameQ(V(k1.R.e || [0, 0, 1]), V(k1.R.d || [0, 1, 0]), new THREE.Quaternion());
      q0.slerp(q1, u);
      R.d = _v.set(0, 1, 0).applyQuaternion(q0).toArray();
      R.e = _v.set(1, 0, 0).applyQuaternion(q0).toArray();
      out.R = R;
    }
    // 第十九轮：两键都「按着鞘」的一段，抽出的长度（左手：握在鞘上的位置）按插值，在这一刻的身体上重新换算——握剑点沿鞘的轴直线走、
    // 左手跟着鞘走（不走握剑点的样条：它会朝下一键鼓出去，剑就从鞘壁斜穿出来）。只有一键按着鞘的，按着鞘的那一项不沿用
    const rs = k0.R?.sheath != null && k1.R?.sheath != null, ls = k0.L?.sheath != null && k1.L?.sheath != null;
    if (out.R?.sheath != null && !rs) { out.R = { ...out.R }; delete out.R.sheath; }      // 先复制：可能直接引用着键里的对象
    if (out.L?.sheath != null && !ls) { out.L = { ...out.L }; delete out.L.sheath; }
    if (rs || ls) this.resolveSheath(out);
    // 第十九轮：lift: false 的键不自动抬脚（以身体为参照的走步循环里，着地的脚本来就在往后移，抬脚由键自己写）
    for (const s of k1.lift === false ? [] : ['L', 'R']) {
      const a = k0['f' + s], b = k1['f' + s];
      if (a && b) {
        const step = Math.hypot(b[0] - a[0], b[2] - a[2]);
        if (step > 0.04) out['f' + s] = [out['f' + s][0], out['f' + s][1] + Math.sin(Math.PI * u) * Math.min(0.13, 0.05 + step * 0.22), out['f' + s][2]];
      }
    }
    return out;
  }

  // 剑身与身体的最小间隙（米，负为穿进身体）：剑身取护手上沿到剑尖一段，身体按几段胶囊近似
  clearance(W, grip, swordQ) {
    const d = _v.set(0, 1, 0).applyQuaternion(swordQ).clone();
    const a = grip.clone().addScaledVector(d, 0.16), b = grip.clone().addScaledVector(d, 0.93);
    const P = (n) => W.p[BI[n]];
    const knees = P('LeftLeg').clone().add(P('RightLeg')).multiplyScalar(0.5);
    const caps = [
      [P('Hips'), P('Spine2'), 0.15], [P('Spine2'), P('Neck'), 0.14], [P('Neck'), P('Head').clone().add(new THREE.Vector3(0, 0.13, 0)), 0.11],
      [P('Hips'), knees, 0.17],                                                                       // 长袍下摆

      [P('LeftUpLeg'), P('LeftLeg'), 0.1], [P('RightUpLeg'), P('RightLeg'), 0.1], [P('LeftLeg'), P('LeftFoot'), 0.065], [P('RightLeg'), P('RightFoot'), 0.065],
      [P('LeftArm'), P('LeftForeArm'), 0.055], [P('LeftForeArm'), P('LeftHand'), 0.045],
    ];
    let m = 9;
    for (const [p0, p1, r] of caps) m = Math.min(m, segSeg(a, b, p0, p1) - r - 0.012);
    return m;
  }
}

// 超出 [lo, hi]（度）的量（弧度）
const exc = (v, lo, hi) => Math.max(0, lo * DEG - v, v - hi * DEG);
// 腕的两个角（前臂坐标，hl 为手相对前臂的旋转）：ba 剑身（拇指一侧）与前臂轴的夹角；fl 屈伸——手指方向绕剑身轴偏离前臂轴的角度
const _wa = new THREE.Vector3(), _wb = new THREE.Vector3(), _wc = new THREE.Vector3();
function wristAngles(hl, bladeH, fingH, axis) {
  const b = _wa.copy(bladeH).applyQuaternion(hl), f = _wb.copy(fingH).applyQuaternion(hl);
  const ba = Math.acos(Math.max(-1, Math.min(1, b.dot(axis))));
  const a2 = _wc.copy(axis).addScaledVector(b, -axis.dot(b));
  f.addScaledVector(b, -f.dot(b));
  const fl = a2.lengthSq() > 1e-8 && f.lengthSq() > 1e-8 ? Math.acos(Math.max(-1, Math.min(1, a2.normalize().dot(f.normalize())))) : 0;
  return { ba, fl };
}

// 统计：记下最大值与出现的时刻、部位
function note(st, k, v, tag) {
  if (v > st[k]) { st[k] = v; st[k + 'At'] = `${tag}@${st.t.toFixed(2)}`; }
}

// 两个正交基之间的旋转：把 (d1, n1) 对到 (d2, n2)
function alignFrames(d1, n1, d2, n2) {
  const a = basis(d1, n1), b = basis(d2, n2);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().multiplyMatrices(b, a.clone().transpose()));
}
function basis(d, n) {
  const y = d.clone().normalize();
  let z = n.clone().addScaledVector(y, -n.dot(y));
  if (z.lengthSq() < 1e-10) z = new THREE.Vector3(0, 0, 1).addScaledVector(y, -y.z);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Matrix4().makeBasis(x, y, z);
}
function catmull(p0, p1, p2, p3, u) {
  const u2 = u * u, u3 = u2 * u;
  return [0, 1, 2].map((i) => 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * u + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * u2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * u3));
}
// 两线段间的最短距离
function segSeg(p1, q1, p2, q2) {
  const d1 = _v2.copy(q1).sub(p1), d2 = _v3.copy(q2).sub(p2), r = new THREE.Vector3().copy(p1).sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) return p1.distanceTo(p2);
  if (a <= 1e-9) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = d1.dot(r);
    if (e <= 1e-9) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  const c1 = p1.clone().addScaledVector(d1, s), c2 = p2.clone().addScaledVector(d2, t);
  return c1.distanceTo(c2);
}

// 两键之间插值：数值线性、数组逐项、对象递归
function lerpSpec(a, b, u) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === 't' || k === 'ease') continue;
    const x = a[k], y = b[k];
    if (y === undefined) { out[k] = x; continue; }
    if (x === undefined) { out[k] = y; continue; }
    out[k] = lerpVal(x, y, u);
  }
  return out;
}
function lerpVal(x, y, u) {
  if (typeof x === 'number' && typeof y === 'number') return x + (y - x) * u;
  if (Array.isArray(x) && Array.isArray(y)) return x.map((v, i) => v + (y[i] - v) * u);
  if (typeof x === 'object' && typeof y === 'object' && x && y) {
    const o = {};
    for (const n of new Set([...Object.keys(x), ...Object.keys(y)])) {
      const a = x[n], b = y[n];
      if (a === undefined) o[n] = b; else if (b === undefined) o[n] = a; else o[n] = lerpVal(a, b, u);
    }
    return o;
  }
  return u < 0.5 ? x : y;
}
