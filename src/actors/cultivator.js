// 第十五轮：玩家（与演武场的对手）的外观——金白修士（assets/figure/gold_cultivator_v1_model_only/gold_cultivator.glb，
// 由 tools/convert_cultivator.py 转成 assets/converted/figure/cultivator.glb：网格与贴图保留原样，补上动作库重定向来的剑招等动作）。
// 与程序化的 Character（character.js）同一套接口：root、update、setVisible、moveTo、anim、handSword、bladeEnds、scabTop、scabbardMatrix、
// shield、ghostSources——player.js、moves.js、flight.js、skillfx.js 调用方式不变。
//
// 动作：逐骨采样、混合（three 的 AnimationMixer 不能按骨骼遮罩）。
//   底层：待机 / 走 / 跑按速度混合——走与跑共用一个步伐相位，相位推进 = 速度 ÷ 每个步伐周期走过的距离（取自动作本身：
//         脚着地时相对骨盆后滑的速度，见 cultivator.json 的 speeds），所以脚底基本不滑；腾空、打坐、御剑、采药各自淡入淡出。
//   出招层：剑诀（moves.js）通过 anim.play / stop 播放的动作，全身或上身遮罩（格挡时下半身照常走）。
//   程序化修正：疾行前倾、御剑随速度俯仰与随转弯侧倾、出招时夹住大腿外展（长袍下摆少被撑开）。
// 剑：右手手骨上的握剑挂点（握持方向取自动作库：剑从拇指一侧伸出、剑面法线朝掌心），每把剑另有自己的挂接参数（swords.json）；
//     收剑时剑插在左腰的剑鞘里——素材里没有剑鞘，剑鞘按这把剑的剑身截面逐段生成（弯刀的鞘也随之弯）。
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { IAI_SHEATH, IAI_SHEATH_HOLD } from './cultivatorPose.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (r, dt) => 1 - Math.exp(-r * dt);

// 骨骼（GLTFLoader 会去掉名字里的冒号：mixamorig:Hips → mixamorigHips）
const B = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
const BI = Object.fromEntries(B.map((n, i) => [n, i]));
const N = B.length;
const ARM_R = ['Hips', 'Spine', 'Spine1', 'Spine2', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'].map((n) => BI[n]);     // 骨盆 → 右手（第二十轮：bladeLocalAt）
// 遮罩：全身 / 上身（格挡边走边挡）/ 双臂
const MASKS = {
  full: new Float32Array(N).fill(1),
  upper: Float32Array.from(B, (n) => (n === 'Hips' || /Leg|Foot|Toe/.test(n) ? 0 : n === 'Spine' ? 0.55 : n === 'Spine1' ? 0.85 : 1)),
  arms: Float32Array.from(B, (n) => (/Shoulder|Arm|Hand/.test(n) ? 1 : 0)),
  armR: Float32Array.from(B, (n) => (/^Right(Shoulder|Arm|ForeArm|Hand)$/.test(n) ? 1 : 0)),     // 第十七轮：拔剑走跑时只盖持剑的右臂
  // 第十九轮：喝葫芦——只盖左臂、头颈与上半截脊椎（右手照旧：拔剑时持剑戒备、收剑时垂手；下身照常走）
  drink: Float32Array.from(B, (n) => (/^Left(Shoulder|Arm|ForeArm|Hand)$/.test(n) || n === 'Neck' || n === 'Head' ? 1 : n === 'Spine2' ? 0.7 : n === 'Spine1' ? 0.45 : n === 'Spine' ? 0.2 : 0)),
};

// ---------- 动作数据：从 AnimationClip 取出各骨的四元数轨道（与骨盆位移）----------
class ClipData {
  constructor(clip) {
    this.name = clip.name; this.dur = clip.duration;
    this.rot = new Array(N).fill(null); this.pos = null;
    this.data = clip.userData || {};                // 第十七轮：编排的动作带着根运动（root）与各时刻（marks）
    for (const tr of clip.tracks) {
      const dot = tr.name.lastIndexOf('.');
      const node = tr.name.slice(0, dot).replace(/^mixamorig/, ''), prop = tr.name.slice(dot + 1);
      const i = BI[node];
      if (i == null) continue;
      if (prop === 'quaternion') this.rot[i] = { t: tr.times, v: tr.values };
      else if (prop === 'position' && i === 0) this.pos = { t: tr.times, v: tr.values };
    }
  }
  static seek(t, times) {
    const n = times.length;
    if (t <= times[0]) return [0, 0, 0];
    if (t >= times[n - 1]) return [n - 1, n - 1, 0];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= t) lo = m; else hi = m; }
    return [lo, hi, (t - times[lo]) / (times[hi] - times[lo])];
  }
  // 把 t 秒时的姿势写进 q（N×4）与 p（3）；没有轨道的骨取 rest
  sample(t, q, p, rest, restP) {
    for (let i = 0; i < N; i++) {
      const tr = this.rot[i];
      if (!tr) { q[i * 4] = rest[i * 4]; q[i * 4 + 1] = rest[i * 4 + 1]; q[i * 4 + 2] = rest[i * 4 + 2]; q[i * 4 + 3] = rest[i * 4 + 3]; continue; }
      const [a, b, u] = ClipData.seek(t, tr.t), v = tr.v;
      slerpFlat(q, i * 4, v, a * 4, v, b * 4, u);
    }
    if (this.pos) {
      const [a, b, u] = ClipData.seek(t, this.pos.t), v = this.pos.v;
      p[0] = lerp(v[a * 3], v[b * 3], u); p[1] = lerp(v[a * 3 + 1], v[b * 3 + 1], u); p[2] = lerp(v[a * 3 + 2], v[b * 3 + 2], u);
    } else { p[0] = restP[0]; p[1] = restP[1]; p[2] = restP[2]; }
  }
}

function slerpFlat(out, o, a, ao, b, bo, t) {
  let x0 = a[ao], y0 = a[ao + 1], z0 = a[ao + 2], w0 = a[ao + 3];
  let x1 = b[bo], y1 = b[bo + 1], z1 = b[bo + 2], w1 = b[bo + 3];
  let d = x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1;
  if (d < 0) { x1 = -x1; y1 = -y1; z1 = -z1; w1 = -w1; d = -d; }
  let k0 = 1 - t, k1 = t;
  if (d < 0.9995) { const th = Math.acos(d), s = Math.sin(th); k0 = Math.sin(k0 * th) / s; k1 = Math.sin(t * th) / s; }
  let x = x0 * k0 + x1 * k1, y = y0 * k0 + y1 * k1, z = z0 * k0 + z1 * k1, w = w0 * k0 + w1 * k1;
  const l = Math.hypot(x, y, z, w) || 1;
  out[o] = x / l; out[o + 1] = y / l; out[o + 2] = z / l; out[o + 3] = w / l;
}

// 把 src 按权重 w 混进 dst（dst 已是归一化的姿势；逐骨球面插值，m 为遮罩）
function blendInto(dst, dp, src, sp, w, m = null) {
  if (w <= 0) return;
  for (let i = 0; i < N; i++) {
    const k = m ? w * m[i] : w;
    if (k <= 0) continue;
    slerpFlat(dst, i * 4, dst, i * 4, src, i * 4, Math.min(1, k));
  }
  const kp = m ? w * m[0] : w;
  if (kp > 0) for (let j = 0; j < 3; j++) dp[j] = lerp(dp[j], sp[j], Math.min(1, kp));
}

// ---------- 出招层：与第十四轮 AnimPlayer 相同的接口（moves.js 直接调用）----------
class ActionLayer {
  constructor(clips) {
    this.clips = clips; this.cur = null; this.prev = null;
    this.lib = { dur: (n) => clips[n]?.dur ?? 0 };
    // 第二十二轮：free（0 … 1）——全身的出招动作把下身让给底层（走、跑）的程度：0 全身照动作，1 只盖上身（与 upper 遮罩相同）。
    // 九霄凤焰的舞刀边走边舞时由 moves.js 每帧给出（平滑过渡）；收招时归零
    this.free = 0; this._fm = new Float32Array(N);
  }
  // 这一段动作此刻实际用的遮罩：全身的动作按 free 在全身与上身之间插值
  maskOf(e) {
    if (!e || e.mask !== MASKS.full || this.free <= 0.001) return e?.mask;
    const f = Math.min(1, this.free), U = MASKS.upper, m = this._fm;
    for (let i = 0; i < N; i++) m[i] = 1 + (U[i] - 1) * f;
    return m;
  }
  get active() { return !!(this.cur || this.prev); }
  get name() { return this.cur?.name ?? null; }
  get time() { return this.cur ? this.cur.t : 0; }
  // o：{ speed, from, to, loop（true 或 [起, 止] 循环段）, hold（放完停在末帧）, fade（淡入秒数）, mask: full | upper | arms | armR, weight,
  //      manual（第十七轮：时刻由调用方每帧 seek 给定——招式的判定与画面同一时刻）}
  play(name, o = {}) {
    const c = this.clips[name];
    if (!c) return false;
    if (this.cur) { this.prev = this.cur; this.prev.fadeOut = o.fade ?? 0.12; }
    const from = o.from ?? 0, to = Math.min(o.to ?? c.dur, c.dur);
    const lp = Array.isArray(o.loop) ? o.loop : o.loop ? [from, to] : null;
    this.cur = { name, c, t: from, from, to, speed: o.speed ?? 1, loop: lp, hold: !!o.hold, fade: o.fade ?? 0.12, manual: !!o.manual,
      w: o.fade === 0 ? 1 : 0, wMax: o.weight ?? 1, mask: MASKS[o.mask || 'full'], done: false, fadeOut: 0 };
    return true;
  }
  seek(t) { if (this.cur) this.cur.t = Math.min(this.cur.to, Math.max(0, t)); }
  stop(fade = 0.18) { if (this.cur) { this.prev = this.cur; this.prev.fadeOut = fade; this.cur = null; } }
  clear() { this.cur = this.prev = null; }
  update(dt) {
    const c = this.cur;
    if (c) {
      if (!c.manual) c.t += dt * c.speed;
      if (c.loop && c.t >= c.loop[1]) c.t = c.loop[0] + ((c.t - c.loop[0]) % Math.max(1e-3, c.loop[1] - c.loop[0]));
      else if (c.t >= c.to) { c.t = c.to; c.done = true; if (!c.hold) this.stop(0.2); }
      if (this.cur) c.w = Math.min(c.wMax, c.w + (c.fade > 0 ? dt / c.fade : 1));
    }
    const p = this.prev;
    if (p) {
      if (!p.done) p.t = Math.min(p.to, p.t + dt * p.speed);
      p.w -= p.fadeOut > 0 ? (dt / p.fadeOut) * Math.max(p.wMax, 0.01) : 1;
      if (p.w <= 0) this.prev = null;
    }
  }
  // 某根骨当前被动作盖住的程度（0 … 1）
  weight(bone = 'LeftUpLeg') {
    const i = typeof bone === 'number' ? bone : BI[bone] ?? 0;
    let w = 0;
    if (this.prev) w = Math.max(w, this.prev.w * this.prev.mask[i]);
    if (this.cur) w = Math.max(w, this.cur.w * this.maskOf(this.cur)[i]);
    return w;
  }
}

// ---------- 剑鞘：按剑身截面逐段生成（剑的本地坐标：+Y 剑尖，+X 刃口，+Z 剑面法线）----------
export function sheathGeometry(swordScene, info) {
  const pts = [];
  swordScene.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(swordScene.matrixWorld).invert();
  const v = new THREE.Vector3(), m = new THREE.Matrix4();
  swordScene.traverse((o) => {
    if (!o.isMesh) return;
    m.multiplyMatrices(inv, o.matrixWorld);
    const a = o.geometry.attributes.position;
    for (let i = 0; i < a.count; i += 1) { v.fromBufferAttribute(a, i).applyMatrix4(m); pts.push(v.x, v.y, v.z); }
  });
  const y0 = info.guard[1] - 0.004, y1 = info.tip;
  const S = 14, slices = [];
  for (let k = 0; k <= S; k++) {
    const y = lerp(y0, y1, k / S), h = (y1 - y0) / S * 0.6;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < pts.length; i += 3) {
      if (Math.abs(pts[i + 1] - y) > h) continue;
      x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); z0 = Math.min(z0, pts[i + 2]); z1 = Math.max(z1, pts[i + 2]);
    }
    if (x0 === Infinity) { const p = slices[slices.length - 1]; if (p) slices.push({ ...p, y }); continue; }
    slices.push({ y, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2 });
  }
  // 鞘比剑身各向大 5 毫米；靠剑尖一段收成圆头
  const R = 10, pos = [], idx = [];
  const ring = (s, k) => {
    const tip = k / S > 0.86 ? 1 - (k / S - 0.86) / 0.14 * 0.55 : 1;
    const hx = Math.max(0.012, s.hx * tip + 0.005), hz = Math.max(0.009, Math.min(s.hz, 0.03) + 0.006);
    for (let j = 0; j < R; j++) {
      const a = (j / R) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      // 圆角矩形截面
      const ex = Math.sign(c) * Math.pow(Math.abs(c), 0.55), ez = Math.sign(sn) * Math.pow(Math.abs(sn), 0.55);
      pos.push(s.cx + ex * hx, s.y, s.cz + ez * hz);
    }
  };
  slices.forEach((s, k) => ring(s, k));
  for (let k = 0; k < slices.length - 1; k++) for (let j = 0; j < R; j++) {
    const a = k * R + j, b = k * R + (j + 1) % R, c = (k + 1) * R + j, d = (k + 1) * R + (j + 1) % R;
    idx.push(a, c, b, b, c, d);
  }
  // 封住鞘尾
  const last = slices[slices.length - 1], ci = pos.length / 3;
  pos.push(last.cx, last.y + 0.012, last.cz);
  for (let j = 0; j < R; j++) idx.push((slices.length - 1) * R + j, ci, (slices.length - 1) * R + (j + 1) % R);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, top: slices[0], end: last };
}

const SHEATH_MAT = new THREE.MeshStandardMaterial({ color: 0x2b1d18, roughness: 0.42, metalness: 0.05 });
const FITTING_MAT = new THREE.MeshStandardMaterial({ color: 0xc9a45a, roughness: 0.32, metalness: 0.9 });
const FLIP = new THREE.Matrix4().makeRotationZ(Math.PI);

// 鞘（与鞘中的剑）在骨盆本地的位置朝向：剑尖方向 dir、剑面法线朝外（+X）；pos 是护手所在处，剑的原点（握持处）沿剑身退回去
export function sheathPose(pos, dir, guard0) {
  const d = new THREE.Vector3(...dir).normalize();
  const out = new THREE.Vector3(1, 0, 0); out.addScaledVector(d, -out.dot(d)).normalize();
  const ex = new THREE.Vector3().crossVectors(d, out);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, d, out));
  const p = new THREE.Vector3(...pos).addScaledVector(d, -(guard0 + 0.01));
  return { q, p };
}

// ---------- 第十九轮：回血葫芦。用项目作者提供的模型（assets/converted/figure/gourd.glb：原点在葫芦口，+Y 由葫芦底指向葫芦口，葫芦身高 0.19 米）；
// 模型没有载入时用下面程序生成的：车出的双肚葫芦、木塞、腰间与颈上各一道红绳，同样的原点与朝向 ----------
let GOURD = null;
function gourdParts() {
  if (GOURD) return GOURD;
  const prof = [[0.0, -0.215], [0.03, -0.21], [0.048, -0.197], [0.057, -0.176], [0.058, -0.155], [0.054, -0.133], [0.044, -0.115], [0.031, -0.101],
    [0.025, -0.092], [0.03, -0.082], [0.039, -0.069], [0.043, -0.055], [0.04, -0.04], [0.031, -0.028], [0.019, -0.018], [0.014, -0.01], [0.0135, -0.002], [0.012, 0]];
  const body = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  const cork = new THREE.CylinderGeometry(0.0105, 0.0128, 0.024, 12); cork.translate(0, 0.008, 0);
  const waist = new THREE.TorusGeometry(0.0262, 0.0036, 6, 24); waist.rotateX(Math.PI / 2); waist.translate(0, -0.092, 0);
  const neck = new THREE.TorusGeometry(0.0148, 0.0028, 6, 18); neck.rotateX(Math.PI / 2); neck.translate(0, -0.011, 0);
  const tassel = new THREE.ConeGeometry(0.009, 0.05, 8); tassel.translate(0.024, -0.122, 0.0);
  GOURD = {
    body, cork, waist, neck, tassel,
    bodyMat: new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.42, metalness: 0.0 }),       // 盘久了的老葫芦：深琥珀色
    corkMat: new THREE.MeshStandardMaterial({ color: 0x5c3420, roughness: 0.7, metalness: 0.0 }),
    cordMat: new THREE.MeshStandardMaterial({ color: 0x9e2228, roughness: 0.6, metalness: 0.0 }),
  };
  return GOURD;
}
function makeGourd(model = null) {
  if (model) {
    const g = model.clone(true);
    g.traverse((x) => { if (x.isMesh) { x.castShadow = true; x.receiveShadow = true; x.frustumCulled = false; } });
    return g;
  }
  const G = gourdParts(), g = new THREE.Group();
  for (const [geo, mat] of [[G.body, G.bodyMat], [G.cork, G.corkMat], [G.waist, G.cordMat], [G.neck, G.cordMat], [G.tassel, G.cordMat]]) {
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; g.add(m);
  }
  g.scale.setScalar(0.9);                     // 通高约 19 厘米
  return g;
}

// ---------- 修士 ----------
export class Cultivator {
  // 第十七轮：载入时编排的动作（AnimationClip），所有修士共用；addClips 挂进已有的修士，之后新建的修士自动带上
  static extra = [];
  static addClips(list, ...chars) {
    for (const c of list) { const i = Cultivator.extra.findIndex((x) => x.name === c.name); if (i >= 0) Cultivator.extra[i] = c; else Cultivator.extra.push(c); }
    for (const ch of chars) if (ch?.clips) for (const c of list) ch.clips[c.name] = new ClipData(c);
  }
  // gltf：GLTFLoader 的结果；meta：cultivator.json；opts.clone：克隆一份独立骨架（演武场的对手）；opts.tint：换色（对手）
  constructor(scene, gltf, meta, { clone = false, tint = null, name = 'cultivator' } = {}) {
    this.scene = scene; this.meta = meta;
    this.root = new THREE.Group(); this.root.name = name;
    this.cloned = clone;
    this.model = clone ? cloneSkinned(gltf.scene) : gltf.scene;
    this.root.add(this.model);
    scene.add(this.root);
    this.bones = new Array(N).fill(null);
    this.ghostSources = [];
    this.model.traverse((o) => {
      if (o.isBone) { const i = BI[o.name.replace(/^mixamorig/, '')]; if (i != null) this.bones[i] = o; }
      if (o.isSkinnedMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        if (clone || tint) { o.material = o.material.clone(); this.ownMaterial = true; }
        this.mesh = o; this.ghostSources.push(o);
      }
    });
    this.material = this.mesh.material;
    this.material.envMapIntensity = 0.85;
    if (tint) this.setTint(tint);
    this.enableFlash();
    // 静止姿势（没有轨道的骨取它）
    this.rest = new Float32Array(N * 4); this.restP = new Float32Array(3);
    this.bones.forEach((b, i) => b.quaternion.toArray(this.rest, i * 4));
    this.bones[0].position.toArray(this.restP);
    // 动作（glb 自带的 + 第十七轮载入时编排的，见 cultivatorClips.js）
    this.clips = {};
    for (const c of gltf.animations) this.clips[c.name] = new ClipData(c);
    for (const c of Cultivator.extra) this.clips[c.name] = new ClipData(c);
    this.anim = new ActionLayer(this.clips);
    // 临时姿势缓冲
    const buf = () => ({ q: new Float32Array(N * 4), p: new Float32Array(3) });
    this.P = buf(); this.T = buf(); this.T2 = buf();
    // 底层状态
    this.phase = 0; this.idleT = 0; this.airT = 0;
    this.w = { idle: 1, walk: 0, run: 0, air: 0, med: 0, fly: 0, gather: 0 };
    this.lean = 0; this.bank = 0; this.pitch = 0;
    const sp = meta.speeds || {};
    this.cycle = { walk: (sp.Walking || 1.53) * this.clips.Walking.dur, run: (sp.Running || 4.93) * this.clips.Running.dur };
    this.phaseOff = { walk: this.footPhase('Walking'), run: this.footPhase('Running') };
    // 剑：右手挂点、左腰剑鞘挂点
    this.handBone = this.bones[BI.RightHand];
    this.handSocket = new THREE.Group(); this.handSocket.name = 'hand-socket';
    this.handBone.add(this.handSocket);
    this.hipSocket = new THREE.Group(); this.hipSocket.name = 'hip-socket';
    this.bones[0].add(this.hipSocket);
    this.handSword = new THREE.Group(); this.handSword.visible = false; this.handSocket.add(this.handSword);
    this.scabTop = new THREE.Group(); this.hipSocket.add(this.scabTop);     // 鞘中的剑（剑柄露在鞘口外）
    this.sheath = new THREE.Group(); this.hipSocket.add(this.sheath);
    this.sword = null;
    this.drawn = 0;
    this.buildShield();
    this.time = 0;
    this.visible = true;
  }

  // 走、跑动作里「左脚在前最远」的时刻（占周期的比例），两段动作的相位据此对齐
  footPhase(name) {
    const c = this.clips[name], L = this.bones[BI.LeftFoot], R = this.bones[BI.RightFoot];
    const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
    let best = -Infinity, at = 0;
    for (let k = 0; k < 24; k++) {
      const t = (k / 24) * c.dur;
      c.sample(t, this.P?.q || new Float32Array(N * 4), this.P?.p || new Float32Array(3), this.rest, this.restP);
      this.writePose(this.P || { q: new Float32Array(N * 4), p: new Float32Array(3) });
      this.model.updateMatrixWorld(true);
      L.getWorldPosition(v1); R.getWorldPosition(v2);
      const d = v1.z - v2.z;
      if (d > best) { best = d; at = k / 24; }
    }
    return at;
  }

  writePose(P) {
    for (let i = 0; i < N; i++) this.bones[i].quaternion.fromArray(P.q, i * 4);
    this.bones[0].position.fromArray(P.p);
  }

  // 护体剑罡（与 Character 相同）：防御时挡在身前的一道弧形青光（受击时一闪）
  buildShield() {
    const g = new THREE.CylinderGeometry(1.0, 1.0, 1.5, 28, 1, true, -0.85, 1.7);
    const m = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform float uA, uFlash, uTime; varying vec2 vUv;
        void main(){
          float edge = smoothstep(0., .18, vUv.x) * smoothstep(1., .82, vUv.x) * smoothstep(0., .2, vUv.y) * smoothstep(1., .75, vUv.y);
          float lines = .55 + .45 * sin(vUv.y * 40. - uTime * 6.) * sin(vUv.x * 9.);
          float rim = smoothstep(.22, .0, abs(vUv.x - .5) - .28);
          vec3 c = vec3(.45, .9, 1.) * (edge * (.07 + .06 * lines) + rim * .025) * (uA + uFlash * 1.5);
          gl_FragColor = vec4(c, 1.);
        }`,
    });
    this.shield = new THREE.Mesh(g, m);
    this.shield.position.set(0, 1.05, 0.05);
    this.shield.renderOrder = 6; this.shield.visible = false; this.shield.frustumCulled = false;
    this.root.add(this.shield);
  }

  // 换色（演武场的对手）：白色衣料换成 cloth，金饰换成 trim（色相、饱和度判别，肤色与黑色部分不动）
  setTint({ cloth = null, trim = null, dark = null } = {}) {
    const m = this.material;
    m.userData.tint = { cloth: new THREE.Color(cloth ?? 0xffffff), trim: new THREE.Color(trim ?? 0xffffff), dark: new THREE.Color(dark ?? 0xffffff),
      useCloth: cloth != null ? 1 : 0, useTrim: trim != null ? 1 : 0, useDark: dark != null ? 1 : 0 };
    m.onBeforeCompile = (sh) => {
      const t = m.userData.tint;
      sh.uniforms.uCloth = { value: t.cloth }; sh.uniforms.uTrim = { value: t.trim }; sh.uniforms.uDark = { value: t.dark };
      sh.uniforms.uUse = { value: new THREE.Vector3(t.useCloth, t.useTrim, t.useDark) };
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uCloth, uTrim, uDark, uUse;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            vec3 c = diffuseColor.rgb; float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), d = mx - mn;
            float s = d / max(mx, 1e-4);
            float h = 0.;
            if (d > 1e-4) { h = mx == c.r ? mod((c.g - c.b) / d, 6.) : mx == c.g ? (c.b - c.r) / d + 2. : (c.r - c.g) / d + 4.; h /= 6.; }
            float white = smoothstep(0.30, 0.62, mx) * (1. - smoothstep(0.10, 0.24, s));
            float gold = smoothstep(0.28, 0.45, s) * smoothstep(0.075, 0.095, h) * (1. - smoothstep(0.15, 0.19, h)) * smoothstep(0.10, 0.25, mx);
            float dark = 1. - smoothstep(0.05, 0.16, mx);
            vec3 lum = vec3(dot(c, vec3(.299, .587, .114)));
            c = mix(c, uCloth * mx * 1.02, white * uUse.x);
            c = mix(c, uTrim * (lum * 1.35 + .05), gold * uUse.y);
            c = mix(c, uDark * .16 + c * .4, dark * uUse.z);
            diffuseColor.rgb = c;
          }`);
    };
    m.customProgramCacheKey = () => 'cultivator-tint';
    m.needsUpdate = true;
  }

  // 第十七轮：受击 / 被弹开时身上一闪（自发光叠一层颜色，按秒衰减）。着色器在建人物时就带上，第一次受击不重编
  // 第二十五轮：化墨（「拔刀斩-终式」的墨痕移位）——uInkK 0 … 1：按噪声溶解、溶解边缘染成墨色；建人物时就编进着色器（平时为 0，不影响画面）
  enableFlash() {
    const m = this.material, prev = m.onBeforeCompile, key = m.customProgramCacheKey?.() ?? '';
    const U = this.flashU = { c: { value: new THREE.Color() }, k: { value: 0 } };
    this.mesh.updateWorldMatrix(true, false);
    const ws = new THREE.Vector3(); this.mesh.getWorldScale(ws);
    const I = this.inkU = { k: { value: 0 }, c: { value: new THREE.Color(0x15191f) }, f: { value: 7.5 * (ws.x || 1) } };
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      sh.uniforms.uFlashC = U.c; sh.uniforms.uFlashK = U.k;
      sh.uniforms.uInkK = I.k; sh.uniforms.uInkC = I.c; sh.uniforms.uInkF = I.f;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vInkP;')
        .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n  vInkP = transformed;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform vec3 uFlashC; uniform float uFlashK; uniform vec3 uInkC; uniform float uInkK, uInkF; varying vec3 vInkP;
        float inkH(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float inkN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
          return mix(mix(mix(inkH(i), inkH(i + vec3(1, 0, 0)), f.x), mix(inkH(i + vec3(0, 1, 0)), inkH(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(inkH(i + vec3(0, 0, 1)), inkH(i + vec3(1, 0, 1)), f.x), mix(inkH(i + vec3(0, 1, 1)), inkH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          if (uInkK > .001) {
            vec3 q = vInkP * uInkF;
            float n = inkN(q) * .62 + inkN(q * 2.7 + 3.1) * .38;
            float th = uInkK * 1.32 - .16;
            if (n < th) discard;
            float edge = 1. - smoothstep(th, th + .2, n);
            diffuseColor.rgb = mix(diffuseColor.rgb, uInkC, clamp(edge * 1.15 + uInkK * .45, 0., 1.));
          }`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += uFlashC * uFlashK;');
    };
    m.customProgramCacheKey = () => key + '|flash|ink';
    m.needsUpdate = true;
  }
  flash(color = 0xffffff, k = 0.5) { this.flashU.c.value.set(color); this.flashU.k.value = Math.max(this.flashU.k.value, k); }

  // ---------- 佩剑 ----------
  // def：swords.json 里的一项；scene：这把剑 glb 的场景（模板，克隆后挂上）；手中、鞘中各一份实例，换剑时先拆掉旧的；
  // sheathScene：这把剑原装的鞘（与剑同一套本地坐标，见 convert_swords.py），没有时按剑身截面生成
  setSword(def, scene, sheathScene = null) {
    this.clearSword();
    if (!def || !scene) return;
    this.sword = def;
    const hand = scene.clone(true), sheathed = scene.clone(true);
    for (const o of [hand, sheathed]) o.traverse((x) => { if (x.isMesh) { x.castShadow = true; x.receiveShadow = false; x.frustumCulled = false; } });
    this.handSword.add(hand);
    this.scabTop.add(sheathed);
    // 握持：剑身朝动作库的握剑方向（拇指一侧）、刃口朝指节、剑面法线朝掌心；原点（剑柄握持处）放在掌心；各剑再按自己的参数微调
    const H = this.meta.hands.r, g = def.grip || {};
    const b = new THREE.Vector3(...H.blade).normalize();
    const f = new THREE.Vector3(...H.fingers); f.addScaledVector(b, -f.dot(b)).normalize();
    const z = new THREE.Vector3().crossVectors(f, b);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f, b, z));
    if (g.roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), g.roll));
    this.handSocket.quaternion.copy(q);
    this.handSocket.position.set(...H.fingers).multiplyScalar(g.along ?? 0.075).addScaledVector(new THREE.Vector3(...H.palm), g.inward ?? 0.022).addScaledVector(b, g.dy ?? 0);
    this.handSocket.scale.setScalar(g.scale ?? 1);
    // 剑鞘：挂在骨盆左侧，鞘口朝前上、鞘尾朝后下；剑面贴着腿外侧。素材自带的鞘直接用（共用模板的几何体，拆时不释放）
    if (sheathScene) {
      const s = sheathScene.clone(true);
      s.traverse((x) => { if (x.isMesh) { x.castShadow = true; x.receiveShadow = true; x.frustumCulled = false; } });
      this.sheath.add(s);
    } else {
      const sh = sheathGeometry(scene, def);
      const sheathMesh = new THREE.Mesh(sh.geo, SHEATH_MAT); sheathMesh.castShadow = true; sheathMesh.userData.own = true;
      const ring = (s, k) => {
        const r = new THREE.Mesh(new THREE.BoxGeometry(s.hx * 2 + 0.024, 0.026, Math.min(s.hz, 0.03) * 2 + 0.026), FITTING_MAT);
        r.position.set(s.cx, s.y + k, s.cz); r.castShadow = true; r.userData.own = true; return r;
      };
      this.sheath.add(sheathMesh, ring(sh.top, 0.008), ring(sh.end, -0.03));
    }
    // 鞘挂在骨盆左侧，鞘口朝前上、鞘尾朝后下（各剑的 hip 参数）；让护手落在挂点：剑的原点（握持处）在护手下沿以下，沿剑身方向退回去。
    // 第十九轮：拔刀斩蓄势时左手把鞘压平到 IAI_SHEATH（各剑一样，动作按它编排），sheathTilt 0 … 1 在两者之间过渡
    const hip = def.hip || {};
    this.sheathRest = sheathPose(hip.pos || [0.19, 0.04, 0.1], hip.dir || [0.07, -0.62, -0.78], def.guard[0]);
    this.sheathIai = sheathPose(IAI_SHEATH.pos, IAI_SHEATH.dir, def.guard[0]);
    this.sheathHold = sheathPose(IAI_SHEATH_HOLD.pos, IAI_SHEATH_HOLD.dir, def.guard[0]);        // 第二十轮：蓄势时的鞘
    this.applySheath(this.sheathTilt || 0, this.sheathPull || 0, this.sheathPose ?? 1);
  }
  // k：鞘压平的程度（0 平常 … 1 拔刀斩）；pull：出刀时鞘顺着自己的轴往后拉了几米（鞘引き，与动作里左手拉的一样多）；
  // sp（第二十轮）：拔刀斩的鞘在蓄势的位置（0）与出刀的位置（1）之间（与动作里的 sh 一样）
  applySheath(k, pull = 0, sp = 1) {
    if (!this.sheathRest) return;
    const A = this.sheathRest, I = this.sheathIai, H = this.sheathHold || I;
    this._tilt = k; this._pull = pull; this._sp = sp;
    _sq.copy(H.q).slerp(I.q, sp); _sp3.copy(H.p).lerp(I.p, sp);
    for (const o of [this.scabTop, this.sheath]) {
      o.quaternion.copy(A.q).slerp(_sq, k); o.position.copy(A.p).lerp(_sp3, k);
      if (pull) o.position.addScaledVector(_ax.set(0, 1, 0).applyQuaternion(o.quaternion), pull);
    }
  }
  // 第十九轮：回血葫芦——平时系在右胯前（腰带），喝的时候左手握着；只有玩家带。
  // 葫芦只有一个，挂在人物根节点下，每帧放到「腰间」与「手中」两个挂点之间：gourdInHand 0 腰间 … 1 手中（取、放的那一小段渐变，不跳）
  // model：葫芦模型的场景（gltf.scene），没有时程序生成
  addGourd(model = null) {
    if (this.gourd) return;
    this.gourdHipAt = new THREE.Group();
    this.gourdHipAt.position.set(-0.17, 0.0, 0.075); this.gourdHipAt.rotation.set(0.12, 0, -0.14);
    this.hipSocket.add(this.gourdHipAt);
    // 左手：葫芦的轴沿手的「拇指一侧」（握剑时剑身的方向），握在葫芦腰上（口离掌心 9 厘米）
    const H = this.meta.hands.l;
    const b = new THREE.Vector3(...H.blade).normalize(), f = new THREE.Vector3(...H.fingers);
    f.addScaledVector(b, -f.dot(b)).normalize();
    const z = new THREE.Vector3().crossVectors(f, b);
    this.gourdHandAt = new THREE.Group();
    // 绕葫芦自身的轴再转 132°：取下的那一刻与腰间的葫芦同一个朝向（流苏不在手里甩半圈；在喝葫芦的取放姿势下量得）
    this.gourdHandAt.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f, b, z)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 132.4 * Math.PI / 180));
    this.gourdHandAt.position.set(...H.fingers).multiplyScalar(0.07).addScaledVector(new THREE.Vector3(...H.palm), 0.03).addScaledVector(b, 0.09);
    this.bones[BI.LeftHand].add(this.gourdHandAt);
    this.gourd = makeGourd(model);
    this.root.add(this.gourd);
    this.gourdInHand = 0;
  }
  placeGourd() {
    const k = Math.min(1, Math.max(0, +this.gourdInHand || 0)), G = this.gourd;
    const A = k < 1 ? this.gourdHipAt : this.gourdHandAt;
    A.updateWorldMatrix(true, false);
    A.matrixWorld.decompose(_gp, _gq, _gs);
    if (k > 0 && k < 1) {
      this.gourdHandAt.updateWorldMatrix(true, false);
      this.gourdHandAt.matrixWorld.decompose(_gp2, _gq2, _gs);
      _gp.lerp(_gp2, k); _gq.slerp(_gq2, k);
    }
    // 世界 → 人物根节点
    this.root.updateWorldMatrix(false, false);
    _gm.copy(this.root.matrixWorld).invert();
    _gp.applyMatrix4(_gm);
    _gq.premultiply(_gq3.setFromRotationMatrix(_gm));
    G.position.copy(_gp); G.quaternion.copy(_gq);
  }
  clearSword() {
    for (const holder of [this.handSword, this.scabTop, this.sheath]) {
      for (const c of [...holder.children]) {
        holder.remove(c);
        if (holder === this.sheath) c.traverse((x) => { if (x.isMesh && x.userData.own) x.geometry.dispose(); });      // 只释放生成的剑鞘
      }
    }
    this.sword = null;
  }
  // 剑尖与剑根（护手上沿）的世界坐标（剑光拖尾用）
  bladeEnds(tip, base) {
    const s = this.sword;
    this.handSword.updateWorldMatrix(true, false);
    tip.set(0, s ? s.tip : 0.95, 0).applyMatrix4(this.handSword.matrixWorld);
    base.set(0, s ? s.guard[1] : 0.12, 0).applyMatrix4(this.handSword.matrixWorld);
  }
  // 第二十轮：动作 name 在 t 秒时剑尖、剑根（护手上沿）在人物根节点坐标里的位置——只按这段动作本身（不含与别的动作的混合），
  // 水墨刀光沿它在两帧之间补点（出招的有效段里动作的权重已满，与画面上的剑一致）。没有这段动作、没佩剑时返回 false
  bladeLocalAt(name, t, tip, base) {
    const c = this.clips[name], s = this.sword;
    if (!c || !s) return false;
    const K = this._bk || (this._bk = { q: new Float32Array(N * 4), p: new Float32Array(3), m: new THREE.Matrix4(), l: new THREE.Matrix4(), q1: new THREE.Quaternion(), v: new THREE.Vector3(), pre: null });
    if (!K.pre) {                    // 根节点 → 骨盆的父节点（模型自己的层级，不随动作变）
      this.root.updateMatrixWorld(true);
      K.pre = new THREE.Matrix4().copy(this.root.matrixWorld).invert().multiply(this.bones[0].parent.matrixWorld);
    }
    c.sample(t, K.q, K.p, this.rest, this.restP);
    const M = K.m.copy(K.pre);
    for (const i of ARM_R) {
      const b = this.bones[i];
      K.q1.fromArray(K.q, i * 4);
      if (i === 0) K.v.fromArray(K.p); else K.v.copy(b.position);
      M.multiply(K.l.compose(K.v, K.q1, b.scale));
    }
    M.multiply(K.l.compose(this.handSocket.position, this.handSocket.quaternion, this.handSocket.scale));
    this.handSword.updateMatrix();
    M.multiply(this.handSword.matrix);
    tip.set(0, s.tip, 0).applyMatrix4(M);
    base.set(0, s.guard[1], 0).applyMatrix4(M);
    return true;
  }
  // 第二十轮：鞘中那把剑上沿剑身 y 米处的世界坐标（+Y 朝剑尖：负的是剑柄一侧，正的过了护手在鞘里）——拔刀斩蓄力时灵气汇聚的挂点
  scabbardPoint(y, out) {
    this.scabTop.updateWorldMatrix(true, false);
    return out.set(0, y, 0).applyMatrix4(this.scabTop.matrixWorld);
  }
  // 御剑起落时飞剑的起点：鞘中这把剑的世界变换（flight.js 会再乘一次绕 Z 半圈，这里先抵消）
  scabbardMatrix() {
    this.root.updateMatrixWorld(true);
    if (!this._sm) this._sm = new THREE.Matrix4();
    return this._sm.copy(this.scabTop.matrixWorld).multiply(FLIP);
  }

  setVisible(v) { this.visible = v; this.root.visible = v; }
  moveTo(scene) { scene.add(this.root); this.scene = scene; }
  setAnimLib() { /* 第十四轮的程序化骨架用；本角色的剑招动作已在 glb 里 */ }
  // 拆除（演武场对手用完即拆）：克隆出来的材质、骨骼矩阵贴图、护体剑罡、剑鞘几何体都释放；网格几何体与贴图是共用的，不释放
  dispose() {
    this.clearSword();
    this.root.parent?.remove(this.root);
    this.shield.geometry.dispose(); this.shield.material.dispose();
    if (this.ownMaterial) for (const m of this.ghostSources) m.material.dispose();
    if (this.cloned) for (const m of this.ghostSources) m.skeleton?.dispose();
  }

  // ---------- 每帧 ----------
  // s：{ mode: walk | fly, onGround, speed, vel, boost, meditate, sprint, turn, guard, drawn, gather }
  update(dt, pos, heading, s) {
    this.time += dt;
    if (this.flashU.k.value > 0) this.flashU.k.value = Math.max(0, this.flashU.k.value - dt * 5);
    this.root.position.copy(pos);
    this.root.rotation.y = heading;
    const flying = s.mode !== 'walk', v = s.speed || 0;
    const W = this.w;
    // 底层各状态的目标权重
    const air = !flying && !s.onGround && !s.meditate ? 1 : 0;
    this.airT = air ? this.airT + dt : 0;
    const tgt = { med: s.meditate ? 1 : 0, fly: flying ? 1 : 0, air: air && this.airT > 0.12 ? 1 : 0, gather: s.gather && !flying ? 1 : 0 };
    for (const k of ['med', 'fly', 'air', 'gather']) W[k] = lerp(W[k], tgt[k], damp(k === 'air' ? 10 : 5, dt));
    // 走跑：待机 ↔ 走 ↔ 跑
    const moving = !flying && !s.meditate && s.onGround !== false;
    const vEff = moving ? v : 0;
    const wIdle = 1 - smooth(0.12, 0.9, vEff), rRun = smooth(1.9, 3.3, vEff);
    W.idle = lerp(W.idle, wIdle, damp(10, dt));
    W.walk = lerp(W.walk, (1 - wIdle) * (1 - rRun), damp(10, dt));
    W.run = lerp(W.run, (1 - wIdle) * rRun, damp(10, dt));
    // 步伐相位：往后退（演武场的对手面朝你后撤）时倒着放走路动作
    if (vEff > 0.05) this.phase = (this.phase + (s.back ? -1 : 1) * dt * vEff / lerp(this.cycle.walk, this.cycle.run, rRun) + 1) % 1;
    this.idleT += dt;
    // ---- 合成底层姿势 ----
    const P = this.P, T = this.T, c = this.clips;
    const sum = W.idle + W.walk + W.run || 1;
    c.Idle.sample(this.idleT % c.Idle.dur, P.q, P.p, this.rest, this.restP);
    // 第十七轮：拔剑在手（交战、出招后）站着时换成战斗待机（中段架势、呼吸）；走、跑时右臂改为持剑（不随步甩剑）
    const wantDrawn = s.drawn && !flying && !s.meditate && !s.gather && s.onGround !== false && c.cb_idle ? 1 : 0;
    W.drawn = lerp(W.drawn ?? 0, wantDrawn, damp(wantDrawn ? 8 : 4, dt));
    if (W.drawn > 0.002) { c.cb_idle.sample(this.idleT % c.cb_idle.dur, T.q, T.p, this.rest, this.restP); blendInto(P.q, P.p, T.q, T.p, W.drawn); }
    const ph = (o) => ((this.phase + o) % 1);
    if (W.walk > 0.002) { c.Walking.sample(ph(this.phaseOff.walk) * c.Walking.dur, T.q, T.p, this.rest, this.restP); blendInto(P.q, P.p, T.q, T.p, W.walk / Math.max(1e-3, W.idle + W.walk)); }
    if (W.run > 0.002) { c.Running.sample(ph(this.phaseOff.run) * c.Running.dur, T.q, T.p, this.rest, this.restP); blendInto(P.q, P.p, T.q, T.p, W.run / sum); }
    const wMove = (W.walk + W.run) / sum;
    if (W.drawn > 0.002 && wMove > 0.002 && c.cb_armR_walk) {
      c.cb_armR_walk.sample(this.idleT % c.cb_armR_walk.dur, T.q, T.p, this.rest, this.restP);
      blendInto(P.q, P.p, T.q, T.p, W.drawn * wMove * (1 - rRun * 0.999), MASKS.armR);
      if (rRun > 0.002) { c.cb_armR_run.sample(this.phase * c.cb_armR_run.dur, T.q, T.p, this.rest, this.restP); blendInto(P.q, P.p, T.q, T.p, W.drawn * wMove * rRun, MASKS.armR); }
    }
    if (W.air > 0.002) { c.NinjaJump_Idle_Loop.sample(0.35 + (this.airT % 0.8) * 0.3, T.q, T.p, this.rest, this.restP); blendInto(P.q, P.p, T.q, T.p, W.air * 0.85); }
    if (W.gather > 0.002) { c.Farm_Harvest.sample(this.time % c.Farm_Harvest.dur, T.q, T.p, this.rest, this.restP); blendInto(P.q, P.p, T.q, T.p, W.gather); }
    if (W.med > 0.002) { c.Sit_Cross_Legged_on_Floor.sample(this.time % c.Sit_Cross_Legged_on_Floor.dur, T.q, T.p, this.rest, this.restP); blendInto(P.q, P.p, T.q, T.p, W.med); }
    if (W.fly > 0.002) { c.Fly.sample(0, T.q, T.p, this.rest, this.restP); blendInto(P.q, P.p, T.q, T.p, W.fly); }
    // ---- 出招层 ----
    // 第十七轮：两段动作交叉淡化时先在两段之间混（按各自权重的比例），再按两者合起来的权重盖到底层上——
    // 不能各自往底层上混：那样淡化的中途会漏进一成多的底层姿势（战斗待机），接招时脚被拖着滑
    const A = this.anim;
    A.update(dt);
    const pv = A.prev && A.prev.w > 0.001 ? A.prev : null, cu = A.cur && A.cur.w > 0.001 ? A.cur : null;
    if (pv && cu) {
      const T2 = this.T2;
      pv.c.sample(pv.t, T2.q, T2.p, this.rest, this.restP);
      cu.c.sample(cu.t, T.q, T.p, this.rest, this.restP);
      const pm = pv.mask, cm = A.maskOf(cu);                // 第二十二轮：走动施法时当前动作把下身让给走路
      for (let i = 0; i < N; i++) {
        const wp = pv.w * pm[i], wc = cu.w * cm[i], tot = Math.min(1, wp + wc);
        if (tot <= 1e-4) continue;
        slerpFlat(T2.q, i * 4, T2.q, i * 4, T.q, i * 4, wc / (wp + wc));
        slerpFlat(P.q, i * 4, P.q, i * 4, T2.q, i * 4, tot);
      }
      const wp0 = pv.w * pm[0], wc0 = cu.w * cm[0], tot0 = Math.min(1, wp0 + wc0);
      if (tot0 > 1e-4) { const u = wc0 / (wp0 + wc0); for (let j = 0; j < 3; j++) P.p[j] = lerp(P.p[j], lerp(T2.p[j], T.p[j], u), tot0); }
    } else if (pv || cu) {
      const a = pv || cu;
      a.c.sample(a.t, T.q, T.p, this.rest, this.restP);
      blendInto(P.q, P.p, T.q, T.p, a.w, a === cu ? A.maskOf(a) : a.mask);
    }
    // ---- 程序化修正 ----
    const sprint = s.sprint && !flying ? 1 : 0;
    this.lean = lerp(this.lean, sprint * 0.16, damp(6, dt));
    if (flying) {
      this.pitch = lerp(this.pitch, clamp((s.boost || 0) * 0.22 + clamp(-(s.vel?.y || 0) / 80, -0.25, 0.25), -0.3, 0.4), damp(5, dt));
      this.bank = lerp(this.bank, clamp(-(s.turn || 0) * 0.22, -0.3, 0.3), damp(5, dt));
    } else { this.pitch = lerp(this.pitch, 0, damp(6, dt)); this.bank = lerp(this.bank, 0, damp(6, dt)); }
    if (this.lean > 0.002) rotLocal(P.q, BI.Spine1, 1, 0, 0, this.lean);
    if (Math.abs(this.pitch) > 0.002) rotLocal(P.q, BI.Spine, 1, 0, 0, this.pitch);
    // （大腿外展不在这里夹：动作数据已逐帧做过着地校正，运行时再改腿会让脚陷进地里）
    this.writePose(P);
    // ---- 佩剑：在手 / 入鞘 ----（第十九轮：drawnSnap 时立刻换手——拔刀斩的出鞘、入鞘那一帧剑与鞘中的剑重合，不能拖着淡过去）
    this.drawn = this.drawnSnap ? (s.drawn ? 1 : 0) : lerp(this.drawn, s.drawn ? 1 : 0, damp(s.drawn ? 30 : 8, dt));
    this.handSword.visible = this.drawn > 0.5 && !flying && !!this.sword;
    this.scabTop.visible = !this.handSword.visible;
    // 第二十五轮：化墨——身子按噪声溶解（不投影）；化到一半时剑、鞘、葫芦一并隐去（重新凝聚时再现）
    const ik = this.inkK || 0;
    if (this.inkU) this.inkU.k.value = ik;
    if (this.mesh) this.mesh.castShadow = ik < 0.3;
    if (this.inkHide) { this.handSword.visible = false; this.scabTop.visible = false; }
    this.sheath.visible = !this.inkHide;
    if (this.gourd) this.gourd.visible = !this.inkHide;
    // 鞘的角度（拔刀斩蓄势时压平）与葫芦在腰间 / 手中
    const tilt = this.sheathTilt || 0, pull = this.sheathPull || 0, sp = this.sheathPose ?? 1;
    if (Math.abs(tilt - (this._tilt ?? 0)) > 1e-4 || Math.abs(pull - (this._pull ?? 0)) > 1e-4 || Math.abs(sp - (this._sp ?? 1)) > 1e-4) this.applySheath(tilt, pull, sp);
    if (this.gourd) this.placeGourd();
    // 护体剑罡
    const guard = !!(s.guard && !s.meditate && !flying);
    const su = this.shield.material.uniforms;
    su.uA.value += ((guard ? 1 : 0) - su.uA.value) * damp(10, dt);
    su.uFlash.value = Math.max(0, su.uFlash.value - dt * 3);
    su.uTime.value = this.time;
    this.shield.visible = su.uA.value > 0.02;
  }
}

const _sq = new THREE.Quaternion(), _sp3 = new THREE.Vector3();
const _gp = new THREE.Vector3(), _gp2 = new THREE.Vector3(), _gs = new THREE.Vector3(), _gq = new THREE.Quaternion(), _gq2 = new THREE.Quaternion(), _gq3 = new THREE.Quaternion(), _gm = new THREE.Matrix4();
// 在骨的本地坐标里绕轴转一个角（右乘）
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _ax = new THREE.Vector3();
function rotLocal(q, i, x, y, z, ang) {
  _q.fromArray(q, i * 4);
  _q2.setFromAxisAngle(_ax.set(x, y, z), ang);
  _q.multiply(_q2).toArray(q, i * 4);
}
// 大腿向外侧的外展超过 max（弧度）时把超出部分收回 65%（按出招层权重 k 生效）。
// 只看外展：大腿骨（本地 +Y 指向膝）转到骨盆坐标里，量它偏离竖直平面（矢状面）向外的角度；前后摆不管
const _v = new THREE.Vector3(), _v0 = new THREE.Vector3(), _axis = new THREE.Vector3();
function limitSpread(q, i, rest, max, k, side) {
  _q.fromArray(q, i * 4);
  _q2.fromArray(rest, i * 4);
  _v.set(0, 1, 0).applyQuaternion(_q);           // 当前大腿方向（骨盆本地）
  _v0.set(0, 1, 0).applyQuaternion(_q2);         // 静止时的方向
  const out = Math.atan2(_v.x * side, -_v.y) - Math.atan2(_v0.x * side, -_v0.y);   // 向外（+X 为左腿外侧）的偏角
  if (out <= max) return;
  const back = (out - max) * 0.65 * k;
  _axis.set(0, 0, 1);                              // 绕骨盆前后轴转回
  _q2.setFromAxisAngle(_axis, -back * side);
  _q.premultiply(_q2).toArray(q, i * 4);
}

// 演武场对手用：一副独立骨架与材质的克隆
export function makeCultivator(scene, gltf, meta, opts) { return new Cultivator(scene, gltf, meta, opts); }
