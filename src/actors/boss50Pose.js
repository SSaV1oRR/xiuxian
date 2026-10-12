// 第十六轮：镇塔龙君的姿势编排核心——在骨骼上按关键姿势生成真实的骨骼动作（AnimationClip），游戏与试载页（tools/boss50_viewer.html）共用。
//
// 坐标：骨架空间（glTF 的 Armature 节点之下，单位厘米，Y 朝上，龙面朝 +Z，+X 是龙的左手边）。对外的长度一律用米（×100 换算）。
// 底姿势：原动作 TempMotion 在 9.3 秒的正面戒备站姿（身体、尾、手指、扭转骨、双翼半张）；翼的预设另取 14.0 秒（收在背后）、8.8 秒（大张）等时刻。
// 一个姿势（spec）由这些部分叠成（都相对底姿势）：
//   hips: [x, y, z]（米，骨架空间的位移）；body / spine1..3 / neck / head：{ b 前屈, t 向左转, s 向左侧弯 }（度，按骨架空间的轴转）；
//   handL / handR：手的 IK 目标（米，骨架空间）与 elbowL / elbowR 肘的朝向提示；wristL / wristR：手腕在 IK 之后再转的 { b, t, s }；
//   footL / footR：脚的 IK 目标（缺省为底姿势的脚位——骨盆下蹲、转身时脚踩在原地，膝自然弯）；plant: false 时腿跟着身体走（FK）；
//   tail：{ yaw 向右扫, lift 抬起, curl 卷曲, wave 波动相位 }（度，沿 7 节分配）；wing：'fold' | 'half' | 'spread' | 'up' | 'down' 或 { 名称: 权重 }；
//   wingOpen：0–1 额外展开；clawL / clawR：'relax' | 'spread' | 'curl' | 'grip' 或 0–1 的握紧程度。
// 动作 clip(name, keys)：keys 为 [{ t, ...spec, ease }]，相邻两键之间按 ease 插值（数值线性、手脚目标沿折线），每 1/60 秒取样一次解 IK，
// 再做一遍短的高斯平滑（第十八轮），写成各骨的四元数轨道与骨盆的位移轨道。
// 根运动：root: [x, z]（米，相对动作开始时的地面位移）与 yaw（度，累计转身，正为向左转）——动作本身不含这部分位移，
// 由游戏按 clip.userData.root 移动整只龙；双脚目标缺省以地面为参照（footFrame: 'model' 时以身体为参照），
// 所以踏步前冲、原地转身时踩着的脚不会在地上滑。clip.userData.marks 记着各个时刻（出爪、落地、收势……），招式的判定与特效都对齐它。
import * as THREE from 'three';

const DEG = Math.PI / 180;
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
// 肘的备用朝向（骨架空间）：朝下、略偏后，见 ik2 的 alt
const ELBOW_ALT = new THREE.Vector3(0, -1, -0.4).normalize();

export const EASE = {
  linear: (u) => u,
  in: (u) => u * u * u,                                         // 加速（出爪、下砸）
  out: (u) => 1 - Math.pow(1 - u, 3),                           // 减速（蓄力、收势）
  inout: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  snap: (u) => 1 - Math.pow(1 - u, 3),                          // 快速到位、慢慢停稳（命中瞬间）。第十八轮由 5 次方改为 3 次方：起步速度由平均的 5 倍降到 3 倍，出爪不再一帧闪过
  hold: () => 0,                                                // 保持上一键
  smooth: (u) => u * u * (3 - 2 * u),
};
// 取样与平滑（第十八轮）：每秒 60 帧；smooth 为平滑的标准差（秒），见 clip()
export const BAKE = { fps: 60, smooth: 0.035, elbowRate: 1500 };      // elbowRate：肘绕臂转动的上限（度/秒），见 ik2

// 骨架空间里绕轴 { b 前屈（绕 +X）, t 向左转（绕 +Y）, s 向左侧弯（绕 -Z）} 的旋转
export function bodyRot(r, out = new THREE.Quaternion()) {
  out.identity();
  if (!r) return out;
  if (r.t) out.multiply(_q.setFromAxisAngle(Y, r.t * DEG));
  if (r.b) out.multiply(_q.setFromAxisAngle(X, r.b * DEG));
  if (r.s) out.multiply(_q.setFromAxisAngle(Z, -r.s * DEG));
  return out;
}

const SPINE = ['root_x', 'spine_01_x', 'spine_02_x', 'spine_03_x', 'neck_x', 'head_x'];
const SPINE_KEY = { root_x: 'body', spine_01_x: 'spine1', spine_02_x: 'spine2', spine_03_x: 'spine3', neck_x: 'neck', head_x: 'head' };
const TAIL = ['c_tail_00_x', 'c_tail_01_x', 'c_tail_02_x', 'c_tail_03_x', 'c_tail_04_x', 'c_tail_05_x', 'c_tail_06_x'];
const FINGERS = ['index', 'middle', 'ring', 'pinky'];

export class PoseSpace {
  // root：模型（含 Armature 节点）；temp：TempMotion 片段
  constructor(root, temp) {
    this.root = root;
    this.bones = {}; this.parent = {}; this.order = [];
    root.traverse((o) => { if (o.isBone) { this.bones[o.name] = o; this.order.push(o.name); this.parent[o.name] = o.parent && o.parent.isBone ? o.parent.name : null; } });
    // 第十八轮：头骨的底姿势取绑定姿势（吻端朝正前、略低 5°）。原动作 9.3 秒的站姿里头向左扭了约 60°，
    // 以它为底，所有编排动作的头都偏向一侧——看向玩家的层只有 ±40°，扳不回来
    const restHead = this.bones.head_x ? this.bones.head_x.quaternion.clone() : null;
    this.children = {};
    for (const n of this.order) { const p = this.parent[n]; if (p) (this.children[p] ||= []).push(n); }
    // 原动作取样：用一个临时的 mixer
    const mixer = new THREE.AnimationMixer(root);
    const act = mixer.clipAction(temp); act.play();
    const sample = (t) => { mixer.setTime(t); const o = {}; for (const n of this.order) { const b = this.bones[n]; o[n] = { q: b.quaternion.clone(), p: b.position.clone() }; } return o; };
    this.temp = { stance: sample(9.3), fold: sample(14.0), half: sample(9.3), spread: sample(8.8), up: sample(0.05), mid: sample(2.3), wide: sample(0.5) };
    act.stop(); mixer.uncacheRoot(root);
    // 双翼骨（翼根以下）
    this.wingBones = []; for (const s of ['l', 'r']) this.wingBones.push(...this.sub(`shoulder_dupli_001_${s}`));
    // 底姿势：原动作 9.3 秒的正面戒备站姿（两脚分开、双臂微张、双翼半张）
    this.base = {};
    for (const n of this.order) this.base[n] = { q: this.temp.stance[n].q.clone(), p: this.temp.stance[n].p.clone() };
    if (restHead) this.base.head_x.q.copy(restHead);
    this.baseW = this.fk(this.base);
    // 各项的「不设」值（第十八轮）：某一键才第一次出现的项，从这里插值过去——原先这一段一开始就跳到新值（脚一帧挪到落点、上身一帧前倾 22°）
    const bp = (n) => this.baseW[n].p.toArray().map((v) => v / 100);
    this.neutral = { hips: [0, 0, 0], root: [0, 0], yaw: 0, wingOpen: 0, wing: 'half', clawL: 0, clawR: 0,
      footL: bp('foot_l'), footR: bp('foot_r'), handL: bp('hand_l'), handR: bp('hand_r'),
      elbowL: [0.9, -0.6, -0.5], elbowR: [-0.9, -0.6, -0.5], kneeL: [0.25, 0, 1], kneeR: [-0.25, 0, 1] };
    // 骨长（厘米）与常用关节
    this.len = {};
    const L = (a, b) => this.baseW[a].p.distanceTo(this.baseW[b].p);
    for (const s of ['l', 'r']) {
      this.len[`armU_${s}`] = L(`arm_stretch_${s}`, `forearm_stretch_${s}`);
      this.len[`armL_${s}`] = L(`forearm_stretch_${s}`, `hand_${s}`);
      this.len[`legU_${s}`] = L(`thigh_stretch_${s}`, `leg_stretch_${s}`);
      this.len[`legL_${s}`] = L(`leg_stretch_${s}`, `foot_${s}`);
    }
    // 手指弯曲轴：各指在底姿势下的走向 × 掌面法线（世界），存成相对各指骨的本地轴
    this.curlAxis = {};
    for (const s of ['l', 'r']) {
      const hand = this.baseW[`hand_${s}`];
      const idx = this.baseW[`index1_${s}`].p.clone().sub(hand.p), pk = this.baseW[`pinky1_${s}`].p.clone().sub(hand.p);
      const palm = new THREE.Vector3().crossVectors(idx, pk).normalize().multiplyScalar(s === 'l' ? 1 : -1);   // 掌心朝向
      this.palm = this.palm || {}; this.palm[s] = palm.clone();
      for (const f of [...FINGERS, 'thumb']) {
        const chain = f === 'thumb' ? [`thumb1_${s}`, `thumb2_${s}`, `thumb3_${s}`] : [`${f}1_${s}`, `${f}2_${s}`, `${f}3_${s}`];
        for (let k = 0; k < chain.length; k++) {
          const n = chain[k], nx = chain[k + 1];
          const dir = nx ? this.baseW[nx].p.clone().sub(this.baseW[n].p) : this.baseW[n].p.clone().sub(this.baseW[chain[k - 1]].p);
          const axisW = new THREE.Vector3().crossVectors(dir.normalize(), palm).normalize();
          // 世界轴 → 该骨底姿势的本地轴
          this.curlAxis[n] = axisW.applyQuaternion(this.baseW[n].q.clone().invert());
        }
      }
    }
  }

  sub(n) { const out = [n]; for (const c of this.children[n] || []) out.push(...this.sub(c)); return out; }

  // 正向运动：本地姿势 → 骨架空间的世界姿势 { q, p }
  fk(local) {
    const W = {};
    for (const n of this.order) {
      const L = local[n] || this.base[n];
      const p = this.parent[n];
      if (!p) W[n] = { q: L.q.clone(), p: L.p.clone() };
      else { const P = W[p]; W[n] = { q: P.q.clone().multiply(L.q), p: L.p.clone().applyQuaternion(P.q).add(P.p) }; }
    }
    return W;
  }

  // 把一个姿势 spec 解成各骨的本地姿势
  solve(spec = {}) {
    const B = this.base, loc = {};
    for (const n of this.order) loc[n] = { q: B[n].q.clone(), p: B[n].p.clone() };
    // 双翼：预设混合
    if (spec.wing) {
      const mix = typeof spec.wing === 'string' ? { [spec.wing]: 1 } : spec.wing;
      const names = Object.keys(mix); let wsum = 0;
      for (const n of this.wingBones) {
        let q = null; wsum = 0;
        for (const k of names) {
          const w = mix[k]; if (w <= 0) continue;
          const src = this.temp[k][n].q;
          if (!q) { q = src.clone(); wsum = w; } else { wsum += w; q.slerp(src, w / wsum); }
        }
        if (q) loc[n].q.copy(q);
      }
      for (const s of ['l', 'r']) {
        const n = `shoulder_dupli_001_${s}`;
        let p = new THREE.Vector3(), w0 = 0;
        for (const k of names) { const w = mix[k]; if (w <= 0) continue; p.addScaledVector(this.temp[k][n].p, w); w0 += w; }
        if (w0 > 0) loc[n].p.copy(p.multiplyScalar(1 / w0));
      }
    }
    // 骨盆位移（米 → 厘米，骨架空间）：root_x 的父骨 root 带着旋转（骨架空间的「上」是它本地的 Z），换到父骨本地再加
    if (spec.hips) loc.root_x.p.add(_v.set(spec.hips[0], spec.hips[1], spec.hips[2]).multiplyScalar(100).applyQuaternion(_q.copy(this.baseW[this.parent.root_x].q).invert()));
    // 躯干、颈、头：骨架空间的转动，按底姿势世界朝向换到本地 L' = L · (W⁻¹ D W)
    const W0 = this.baseW;
    for (const n of SPINE) {
      const r = spec[SPINE_KEY[n]];
      if (!r) continue;
      const D = bodyRot(r, _q2);
      _q3.copy(W0[n].q).invert().multiply(D).multiply(W0[n].q);
      loc[n].q.multiply(_q3);
    }
    // 尾：yaw / lift 沿 7 节分配（越往尾尖越多），curl 卷曲，wave 是一条沿尾传的正弦相位
    if (spec.tail) {
      const T = spec.tail;
      TAIL.forEach((n, i) => {
        const k = (i + 1) / TAIL.length;
        const wv = T.wave ? Math.sin(T.wave * Math.PI * 2 - i * 0.9) * (T.waveAmp ?? 10) * k : 0;
        const r = { t: (T.yaw || 0) * (0.35 + 0.65 * k) / 3.2 + wv, b: (T.lift || 0) * (0.5 + 0.5 * k) / 3.5 + (T.curl || 0) * k * k / 2.2 };
        const D = bodyRot(r, _q2);
        _q3.copy(W0[n].q).invert().multiply(D).multiply(W0[n].q);
        loc[n].q.multiply(_q3);
      });
    }
    // 手指：relax 为底姿势；spread 张开（各指往手背方向翻、指间分开）；curl / grip 握紧
    for (const s of ['l', 'r']) {
      let c = spec[s === 'l' ? 'clawL' : 'clawR'];
      if (c == null) continue;
      if (typeof c === 'string') c = { relax: 0, spread: -0.55, curl: 1, grip: 0.7, half: 0.45 }[c] ?? 0;
      for (const f of [...FINGERS, 'thumb']) {
        const chain = f === 'thumb' ? [`thumb1_${s}`, `thumb2_${s}`, `thumb3_${s}`] : [`${f}1_${s}`, `${f}2_${s}`, `${f}3_${s}`];
        chain.forEach((n, k) => {
          const ang = c * (f === 'thumb' ? [0.35, 0.45, 0.4][k] : [0.75, 0.95, 0.7][k]) * (c < 0 ? 0.6 : 1);
          loc[n].q.multiply(_q2.setFromAxisAngle(this.curlAxis[n], ang));
        });
      }
    }
    // 正向求一遍世界姿势（IK 要用肩、髋现在的位置）
    let W = this.fk(loc);
    // 手腕在 IK 之后再转；双臂 IK
    for (const s of ['l', 'r']) {
      const S = s === 'l' ? 'L' : 'R';
      const tgt = spec['hand' + S];
      if (tgt) {
        const pole = spec['elbow' + S] || [s === 'l' ? 0.9 : -0.9, -0.6, -0.5];
        this.ik2(loc, W, `arm_stretch_${s}`, `forearm_stretch_${s}`, `hand_${s}`, _v.set(tgt[0], tgt[1], tgt[2]).multiplyScalar(100), _v2.set(pole[0], pole[1], pole[2]).normalize(), ELBOW_ALT);
        W = this.fk(loc);
      }
      const wr = spec['wrist' + S];
      if (wr) {
        const n = `hand_${s}`;
        const D = bodyRot(wr, _q2);
        _q3.copy(W[n].q).invert().multiply(D).multiply(W[n].q);
        loc[n].q.multiply(_q3);
        W = this.fk(loc);
      }
    }
    // 双腿 IK：缺省踩在底姿势的脚位（plant: false 时不管）。地面参照时，按根运动把地面上的脚位换回身体坐标
    if (spec.plant !== false) {
      const ground = spec.footFrame !== 'model';
      const yaw = ground ? (spec.yaw || 0) * DEG : 0, rx = ground && spec.root ? spec.root[0] * 100 : 0, rz = ground && spec.root ? spec.root[1] * 100 : 0;
      const cy = Math.cos(-yaw), sy = Math.sin(-yaw);
      const toModel = (v) => { const x = v.x - rx, z = v.z - rz; return v.set(x * cy + z * sy, v.y, -x * sy + z * cy); };
      const yawQ = new THREE.Quaternion().setFromAxisAngle(Y, -yaw);
      for (const s of ['l', 'r']) {
        const S = s === 'l' ? 'L' : 'R';
        const f = spec['foot' + S];
        const target = toModel(f ? _v.set(f[0], f[1], f[2]).multiplyScalar(100) : _v.copy(this.baseW[`foot_${s}`].p));
        const pole = spec['knee' + S] || [s === 'l' ? 0.25 : -0.25, 0, 1];
        this.ik2(loc, W, `thigh_stretch_${s}`, `leg_stretch_${s}`, `foot_${s}`, target, _v2.set(pole[0], pole[1], pole[2]).normalize());
        W = this.fk(loc);
        // 脚掌：保持底姿势的世界朝向（踩平），再叠 spec.footRot
        const n = `foot_${s}`;
        const want = this.baseW[n].q.clone();
        const fr = spec['footRot' + S]; if (fr) want.premultiply(bodyRot(fr, _q2));
        want.premultiply(yawQ);
        const pw = W[this.parent[n]].q;
        loc[n].q.copy(pw.clone().invert().multiply(want));
        W = this.fk(loc);
      }
    }
    return { loc, W };
  }

  // 两节 IK：a（上节）→ b（下节）→ c（末端），把 c 送到 target（骨架空间，厘米），弯向 pole；改写 a、b 的本地旋转
  // alt（第十八轮）：朝向提示 pole 与臂的走向夹角小于约 37° 时，它的垂直分量又短又敏感——手一扫过那个方向，肘就一帧甩到另一边。
  // 这时按短缺的程度连续地混进备用朝向 alt（手臂：肘朝下偏后），肘平顺地转过去，不再翻
  ik2(loc, W, a, b, c, target, pole, alt = null) {
    const A = W[a].p, Bp = W[b].p, C = W[c].p;
    const la = A.distanceTo(Bp), lb = Bp.distanceTo(C);
    const d0 = _v3.copy(target).sub(A);
    let d = d0.length();
    const want = d;
    const dmin = Math.abs(la - lb) + 0.5, dmax = la + lb - 0.05;
    const dir = d0.normalize();
    d = Math.min(dmax, Math.max(dmin, d));
    const cosA = (la * la + d * d - lb * lb) / (2 * la * d);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const side = pole.clone().addScaledVector(dir, -pole.dot(dir));
    const pp = side.length();
    if (alt && pp < 0.6) side.addScaledVector(_v4.copy(alt).addScaledVector(dir, -alt.dot(dir)), (0.6 - pp) / 0.6);
    if (side.lengthSq() < 1e-8) side.set(0, 1, 0).addScaledVector(dir, -dir.y);
    side.normalize();
    // 逐帧解动作时（clip 里），肘绕着臂转的快慢有上限：上一帧的肘朝向投到这一帧、超过上限就只转到上限——
    // 朝向提示与备用朝向互相抵消、提示扫过臂的方向时，肘不再一帧翻过去，而是在几帧里转过去；手照样到位（肘只管弯向哪边）
    const memo = alt && this.elbowMemo;
    if (memo) {
      const prev = memo[a];
      if (prev) {
        const pv = _v4.copy(prev).addScaledVector(dir, -prev.dot(dir));
        if (pv.lengthSq() > 1e-6) {
          pv.normalize();
          const ang = pv.angleTo(side);
          if (ang > memo.step) side.copy(pv).applyAxisAngle(dir, (_v5.crossVectors(pv, side).dot(dir) < 0 ? -1 : 1) * memo.step);
        }
      }
      (memo[a] ||= new THREE.Vector3()).copy(side);
    }
    if (this.dbg) this.dbg.push({ a, want: want / 100, reach: (la + lb) / 100, pp, dir: dir.toArray(), side: side.toArray() });      // 自检用（tools/r18_boss_motion.js 的 ikScan）
    const upperDir = dir.clone().multiplyScalar(cosA).addScaledVector(side, sinA);
    const elbow = A.clone().addScaledVector(upperDir, la);
    const end = A.clone().addScaledVector(dir, d);
    const lowerDir = end.clone().sub(elbow).normalize();
    // 上节：把现在的走向（a→b）转到 upperDir；弯曲平面用 (a→b)×(b→c) 对到 upperDir×lowerDir
    const curU = Bp.clone().sub(A).normalize(), curL = C.clone().sub(Bp).normalize();
    const nCur = new THREE.Vector3().crossVectors(curU, curL), nNew = new THREE.Vector3().crossVectors(upperDir, lowerDir);
    const rotU = alignFrames(curU, nCur, upperDir, nNew);
    const newWa = rotU.clone().multiply(W[a].q);
    const pa = this.parent[a] ? W[this.parent[a]].q : new THREE.Quaternion();
    loc[a].q.copy(pa.clone().invert().multiply(newWa));
    // 下节：在新的上节下，把 b→c 转到 lowerDir
    const Wb_after = newWa.clone().multiply(loc[b].q);
    const curL2 = curL.clone().applyQuaternion(rotU);
    const rotL = alignFrames(curL2, nNew, lowerDir, nNew);
    const newWb = rotL.clone().multiply(Wb_after);
    loc[b].q.copy(newWa.clone().invert().multiply(newWb));
  }

  // 生成一段动作：keys = [{ t, ...spec, ease }]
  // 第十八轮：取样由每秒 30 帧改为 60 帧（均匀铺满全段，末帧正好落在 dur 上），解完再做一遍高斯平滑（smooth 为标准差，秒）：
  // 每段关键姿势各自缓动，段与段的接缝处速度会突变（出爪一帧挪两米多、收势猛地起步），平滑把这些突变摊到前后几十毫秒里；
  // 慢的动作几乎不受影响。非循环动作在两端收窄窗口，首末帧原样保留（起止姿势仍与站姿严丝合缝）；循环动作首尾相接着平滑
  clip(name, keys, { fps = BAKE.fps, loop = false, marks = {}, smooth = BAKE.smooth } = {}) {
    keys = keys.slice().sort((a, b) => a.t - b.t);
    const dur = keys[keys.length - 1].t;
    const n = Math.max(2, Math.ceil(dur * fps - 1e-6) + 1), h = dur / (n - 1);
    const times = new Float32Array(n);
    const track = {}; const hip = new Float32Array(n * 3);
    const full = inheritKeys(keys);
    const touched = new Set();
    const rootT = new Float32Array(n * 3);
    this.elbowMemo = { step: BAKE.elbowRate * DEG * h };
    for (let i = 0; i < n; i++) {
      const t = i === n - 1 ? dur : i * h; times[i] = t;
      const spec = this.specAt(full, t);
      rootT.set([spec.root ? spec.root[0] : 0, spec.root ? spec.root[1] : 0, spec.yaw || 0], i * 3);
      const { loc } = this.solve(spec);
      for (const b of this.order) {
        const q = loc[b].q;
        if (!track[b]) track[b] = new Float32Array(n * 4);
        const arr = track[b];
        // 与上一帧同半球
        if (i > 0 && arr[(i - 1) * 4] * q.x + arr[(i - 1) * 4 + 1] * q.y + arr[(i - 1) * 4 + 2] * q.z + arr[(i - 1) * 4 + 3] * q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
        arr.set([q.x, q.y, q.z, q.w], i * 4);
        if (!q.equals(this.base[b].q)) touched.add(b);
      }
      hip.set([loc.root_x.p.x, loc.root_x.p.y, loc.root_x.p.z], i * 3);
    }
    this.elbowMemo = null;
    if (smooth > 0 && n > 4) {
      const sig = smooth / h, R = Math.max(1, Math.ceil(sig * 2.5));
      const w = []; for (let k = 0; k <= R; k++) w.push(Math.exp(-0.5 * (k / sig) * (k / sig)));
      for (const b of touched) smoothTrack(track[b], 4, n, w, loop, true);
      smoothTrack(hip, 3, n, w, loop, false);
      if (!loop) smoothTrack(rootT, 3, n, w, false, false);
    }
    const tracks = [];
    for (const b of this.order) {
      // 全段都等于底姿势的骨也写进去（换动作时才会回到站姿），但只写首末两帧
      if (!touched.has(b)) { const q = this.base[b].q; tracks.push(new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, [0, dur], [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w])); continue; }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, track[b]));
    }
    tracks.push(new THREE.VectorKeyframeTrack('root_x.position', times, hip));
    for (const s of ['l', 'r']) { const nm = `shoulder_dupli_001_${s}`; const p = this.base[nm].p; tracks.push(new THREE.VectorKeyframeTrack(`${nm}.position`, [0, dur], [p.x, p.y, p.z, p.x, p.y, p.z])); }
    const c = new THREE.AnimationClip(name, dur, tracks);
    let moved = false; for (let i = 0; i < rootT.length; i++) if (Math.abs(rootT[i]) > 1e-6) { moved = true; break; }
    c.userData = { loop, authored: true, marks, root: moved ? { times, v: rootT } : null, keys };
    return c;
  }
  // 第 t 秒的姿势 spec（full：inheritKeys 之后的关键姿势）；查问题时也可以直接拿来 solve
  specAt(full, t) {
    let j = 0; while (j < full.length - 2 && full[j + 1].t <= t) j++;
    const k0 = full[j], k1 = full[Math.min(j + 1, full.length - 1)];
    const span = Math.max(1e-6, k1.t - k0.t);
    const u = (EASE[k1.ease || 'inout'] || EASE.inout)(Math.min(1, Math.max(0, (t - k0.t) / span)));
    return lerpSpec(k0, k1, u, this.neutral);
  }
}

// 键之间逐项继承：缺省的项沿用上一键；途经点 viaL / viaR 只管它所在的那一段，不往后传
export function inheritKeys(keys) {
  const full = []; let prev = {};
  for (const k of keys) { const f = { ...prev, ...k }; if (!k.viaL) delete f.viaL; if (!k.viaR) delete f.viaR; full.push(f); prev = f; }
  return full;
}

// 逐帧数组的高斯平滑：每帧 m 个数、共 n 帧，w[k] 为相隔 k 帧的权重。四元数（quat）先把邻帧翻到同一半球再加权、之后归一化；
// 循环动作首尾相接（末帧与首帧是同一个姿势，周期 n - 1 帧）；非循环动作的窗口在两端对称收窄，首末帧不变
function smoothTrack(a, m, n, w, loop, quat) {
  const src = a.slice(), P = n - 1, R = w.length - 1;
  for (let i = 0; i < (loop ? P : n); i++) {
    const r = loop ? R : Math.min(R, i, P - i);
    if (r === 0) continue;
    const o = i * m;
    for (let c = 0; c < m; c++) a[o + c] = 0;
    let ws = 0;
    for (let k = -r; k <= r; k++) {
      const j = loop ? (((i + k) % P) + P) % P : i + k, s = j * m, wk = w[k < 0 ? -k : k];
      let sg = wk;
      if (quat && src[s] * src[o] + src[s + 1] * src[o + 1] + src[s + 2] * src[o + 2] + src[s + 3] * src[o + 3] < 0) sg = -wk;
      for (let c = 0; c < m; c++) a[o + c] += src[s + c] * sg;
      ws += wk;
    }
    if (quat) { const L = Math.hypot(a[o], a[o + 1], a[o + 2], a[o + 3]) || 1; for (let c = 0; c < 4; c++) a[o + c] /= L; }
    else for (let c = 0; c < m; c++) a[o + c] /= ws;
  }
  if (loop) {
    const e = P * m, p = (P - 1) * m;
    const sg = quat && a[0] * a[p] + a[1] * a[p + 1] + a[2] * a[p + 2] + a[3] * a[p + 3] < 0 ? -1 : 1;
    for (let c = 0; c < m; c++) a[e + c] = a[c] * sg;
  }
}

// 两个正交基之间的旋转：把 (d1, n1) 对到 (d2, n2)
function alignFrames(d1, n1, d2, n2) {
  const a = basis(d1, n1), b = basis(d2, n2);
  const m = new THREE.Matrix4().multiplyMatrices(b, a.clone().transpose());
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
function basis(d, n) {
  const y = d.clone().normalize();
  let z = n.clone().addScaledVector(y, -n.dot(y));
  if (z.lengthSq() < 1e-10) z = new THREE.Vector3(0, 0, 1).addScaledVector(y, -y.z);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Matrix4().makeBasis(x, y, z);
}

// 两键之间插值：数值线性、数组逐项、对象递归；字符串（翼、爪的预设名）换成权重混合。
// 第十八轮：后一键带 viaL / viaR（米，骨架空间）时，这一段的手目标不走直线，走过途经点的二次曲线（u = 0.5 时正在途经点）——
// 横扫、下砸的爪绕着肩前划弧，不再贴着肩膀直穿过去（手臂猛地折起又甩直，肘一帧甩出去）
// N：各项的「不设」值——前一键还没有这一项时从它插值（躯干、尾、脚掌这类 { b, t, s } 对象从 0 起），没有「不设」值的（字符串、开关）照旧直接换
function lerpSpec(a, b, u, N = null) {
  const out = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (k === 't' || k === 'ease' || k === 'viaL' || k === 'viaR') continue;
    let x = a[k];
    const y = b[k];
    if (y === undefined) { out[k] = x; continue; }
    if (x === undefined) {
      if (N && N[k] !== undefined) x = N[k];
      else if (N && y && typeof y === 'object' && !Array.isArray(y)) x = {};
      else { out[k] = y; continue; }
    }
    const via = k === 'handL' ? b.viaL : k === 'handR' ? b.viaR : null;
    if (via) { const c = (i) => 2 * via[i] - (x[i] + y[i]) / 2; out[k] = x.map((v, i) => (1 - u) * (1 - u) * v + 2 * u * (1 - u) * c(i) + u * u * y[i]); continue; }
    out[k] = lerpVal(x, y, u, k);
    // 第十八轮：以地面为参照的脚，两键之间挪了位置、却没写抬脚（高度不变）——自动在这一段中间抬起（最多 0.1 米，按步长），
    // 踏步前冲、收步不再贴着地面滑过去
    if ((k === 'footL' || k === 'footR') && b.footFrame !== 'model' && Math.abs(y[1] - x[1]) < 0.02) {
      const d = Math.hypot(y[0] - x[0], y[2] - x[2]);
      if (d > 0.03) out[k][1] += Math.min(0.1, 0.35 * d) * 4 * u * (1 - u);
    }
  }
  return out;
}
const CLAW = { relax: 0, spread: -0.55, curl: 1, grip: 0.7, half: 0.45 };
function lerpVal(x, y, u, k) {
  if (typeof x === 'number' && typeof y === 'number') return x + (y - x) * u;
  if (Array.isArray(x) && Array.isArray(y)) return x.map((v, i) => v + (y[i] - v) * u);
  if (k === 'wing') {
    const mx = typeof x === 'string' ? { [x]: 1 } : x, my = typeof y === 'string' ? { [y]: 1 } : y;
    const o = {}; for (const n of new Set([...Object.keys(mx), ...Object.keys(my)])) o[n] = (mx[n] || 0) * (1 - u) + (my[n] || 0) * u;
    return o;
  }
  if (k === 'clawL' || k === 'clawR') {
    const cx = typeof x === 'string' ? CLAW[x] : x, cy = typeof y === 'string' ? CLAW[y] : y;
    return cx + (cy - cx) * u;
  }
  if (typeof x === 'object' && typeof y === 'object' && x && y) {
    const o = {}; for (const n of new Set([...Object.keys(x), ...Object.keys(y)])) { const a = x[n] ?? 0, b = y[n] ?? 0; o[n] = typeof a === 'number' ? a + (b - a) * u : (u < 0.5 ? a : b); }
    return o;
  }
  return u < 0.5 ? x : y;
}
