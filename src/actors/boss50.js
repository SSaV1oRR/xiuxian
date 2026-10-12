// 第十六轮：镇塔龙君·烬霄（通天塔第五十层守关）的模型与动作运行层。
// 素材：assets/boss/boss50/source/Dragon Character 3d by Oscar Creativo.fbx（原件保留）→ tools/boss50_*.py、convert_boss50.mjs →
//   assets/converted/boss50/boss50.glb（16.7 万面，贴图集 4096 / 2048）与 boss50_lo.glb（7.5 万面，贴图集 2048 / 1024，流畅画质用）。
// 一只龙一个实例：自己的骨骼（SkeletonUtils.clone）、自己的材质（克隆后改着色器）、自己的 AnimationMixer；与宗门的护宗双龙不共用任何状态。
//
// 动作：编排动作（boss50Clips.js，按关键姿势解出的骨骼动作）+ 原 FBX 的 TempMotion + 重定向的动作（u_* 动作库、m_* Mixamo）。
// 播放由这里推进时间（动作本身的 timeScale 为 0，每帧直接写 time）：
//   · 速度 = 招式速度 × 全局速度（二阶段 1.25 倍）× 区段速度（如三段猎杀的停顿段在二阶段也保持原速）；
//   · 根运动：编排动作的 userData.root（地面位移、累计转身）逐帧取差值，交给战斗控制器（场地边界、封印光墙）后再落到龙身上；
//   · 动作之间淡入淡出（第十八轮起自己管权重：smoothstep、每帧归一、淡出的动作接着放）；同一段动作连放时用一份克隆的片段做交叉淡化。
// 运行时叠加在动作之上的层：尾巴的缓慢摆动、头颈看向玩家（限角、可调权重）、轻受击的局部后仰、手爪 / 胸口的蓄力光。
// 材质：保留原贴图的分层，只做局部着色——暗色鳞片略偏 #252830、金属甲片偏旧金 #B88A46；发光遮罩（眼、胸前符纹）用阶段灵光色
// （一阶段 #7C68E8、二阶段 #B65CFF，芯 #EEE5FF）；二阶段沿体表噪声等值线裂出紫焰纹、眼光转亮；受击闪白；击败后溶解（边缘发光）。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { PoseSpace } from './boss50Pose.js';
import { buildBossClips } from './boss50Clips.js';

export const BOSS50 = {
  name: '镇塔龙君·烬霄',
  hi: 'assets/converted/boss50/boss50.glb', lo: 'assets/converted/boss50/boss50_lo.glb',
  src: 'assets/boss/boss50/source/Dragon Character 3d by Oscar Creativo.fbx',
  scale: 2.8,                     // 模型（米）× 2.8：站姿头顶约 4.1 米、双翼半张约 4.5 米（玩家 1.72 米）
  colors: { scale: 0x252830, gold: 0xb88a46, p1: 0x7c68e8, p2: 0xb65cff, core: 0xeee5ff },
};
const DEG = Math.PI / 180;
// 嘴（吻端前沿）在头骨本地坐标里的位置（厘米）。第十八轮按绑定姿势重量：头骨权重 > 0.6 的蒙皮顶点里最靠前的一圈（吻端）的中点，
// 在头骨前方约 26 厘米（模型）。原先的 (-9.7, 1.6, 6.6) 偏到头的一侧——吐息、蓄息的特效因此从脸侧发出
const MOUTH_LOCAL = new THREE.Vector3(0, 8.2, 23.7);
// 受击 / 碰撞用的胶囊：[骨 A, 骨 B, 半径（模型米）, 部位]
const CAPS = [
  ['root_x', 'spine_03_x', 0.25, 'body'], ['spine_03_x', 'neck_x', 0.17, 'body'], ['neck_x', 'head_x', 0.12, 'neck'], ['head_x', 'head_x', 0.15, 'head'],
  ['c_tail_00_x', 'c_tail_03_x', 0.11, 'tail'], ['c_tail_03_x', 'c_tail_06_x', 0.07, 'tail'],
  ['arm_stretch_l', 'hand_l', 0.08, 'arm'], ['arm_stretch_r', 'hand_r', 0.08, 'arm'],
  ['thigh_stretch_l', 'foot_l', 0.11, 'leg'], ['thigh_stretch_r', 'foot_r', 0.11, 'leg'],
];
const TAIL = ['c_tail_00_x', 'c_tail_01_x', 'c_tail_02_x', 'c_tail_03_x', 'c_tail_04_x', 'c_tail_05_x', 'c_tail_06_x'];

// ---------- 模板：载入一次（按画质选高 / 低模），编排动作只算一次，各实例共用片段 ----------
let TPL = null, TPL_P = null;
export function boss50Loaded(lo) { return !!TPL && TPL.url === (lo ? BOSS50.lo : BOSS50.hi); }
export function loadBoss50(lo = false) {
  const url = lo ? BOSS50.lo : BOSS50.hi;
  if (TPL && TPL.url === url) return Promise.resolve(TPL);
  if (TPL_P && TPL_P.url === url) return TPL_P.p;
  const p = (async () => {
    const g = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    const scene = g.scene;
    const rest = [];
    scene.traverse((o) => { if (o.isBone) rest.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); });
    const temp = g.animations.find((c) => c.name === 'TempMotion');
    if (!temp) throw new Error('镇塔龙君缺少原动作 TempMotion');
    const t0 = performance.now();
    const ps = new PoseSpace(scene, temp);
    const authored = buildBossClips(ps);
    const ms = Math.round(performance.now() - t0);
    for (const [o, p2, q, s] of rest) { o.position.copy(p2); o.quaternion.copy(q); o.scale.copy(s); }
    const clips = {};
    for (const c of g.animations) clips[c.name] = c;
    Object.assign(clips, authored);
    // 各骨在底姿势下「骨架空间的 X / Y 轴」换到骨的本地（尾摆、看向、受击后仰这些运行时的层按骨架空间的轴转）
    const axes = {}, X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
    for (const n of ps.order) { const qi = ps.baseW[n].q.clone().invert(); axes[n] = { x: X.clone().applyQuaternion(qi), y: Y.clone().applyQuaternion(qi) }; }
    TPL = { url, gltf: g, scene, clips, axes, buildMs: ms, authored: Object.keys(authored), retargeted: g.animations.map((c) => c.name) };
    return TPL;
  })();
  TPL_P = { url, p };
  p.catch(() => { if (TPL_P?.p === p) TPL_P = null; });
  return p;
}
// 离开第五十层：模板的显存（几何、贴图）放掉，模板留在内存，下次进场重新上传
export function freeBoss50Gpu() {
  if (!TPL) return;
  TPL.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) o.material[k]?.dispose();
  });
}

// 根运动取样：R = { times, v: [x, z, 转身度数] × n }
function rootAt(R, t, out) {
  const T = R.times, n = T.length, v = R.v;
  if (t <= T[0]) { out[0] = v[0]; out[1] = v[1]; out[2] = v[2]; return out; }
  if (t >= T[n - 1]) { const k = (n - 1) * 3; out[0] = v[k]; out[1] = v[k + 1]; out[2] = v[k + 2]; return out; }
  let j = Math.min(n - 2, Math.max(0, Math.floor(t / (T[1] - T[0]))));
  while (j < n - 2 && T[j + 1] < t) j++;
  while (j > 0 && T[j] > t) j--;
  const u = (t - T[j]) / Math.max(1e-6, T[j + 1] - T[j]), a = j * 3, b = a + 3;
  out[0] = v[a] + (v[b] - v[a]) * u; out[1] = v[a + 1] + (v[b + 1] - v[a + 1]) * u; out[2] = v[a + 2] + (v[b + 2] - v[a + 2]) * u;
  return out;
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _r0 = [0, 0, 0], _r1 = [0, 0, 0];

export class Boss50Rig {
  constructor(T, scene) {
    this.T = T;
    this.S = BOSS50.scale;
    this.root = new THREE.Group();
    this.root.name = 'boss50';
    this.model = cloneSkinned(T.scene);
    this.model.scale.setScalar(this.S);
    this.root.add(this.model);
    this.bones = {};
    this.model.traverse((o) => { if (o.isBone) this.bones[o.name] = o; if (o.isSkinnedMesh) this.mesh = o; });
    const m = this.mesh;
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    m.material = this.makeMaterial(m.material);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = T.clips; this.alt = {};
    this.cur = null; this.blend = [];
    this.speed = 1;                  // 全局速度（二阶段 1.25）
    this.yaw = 0; this.frameYaw = 0;
    this.motion = { x: 0, z: 0 };    // 本帧根运动（世界米）
    this.look = { w: 0, target: null, yaw: 0, pitch: 0, maxYaw: 40 * DEG };
    this.sway = { w: 1, t: Math.random() * 10, amp: 1 };
    this.flinch = { v: 0, vel: 0, side: 0 };
    this.flinchK = { k: 90, c: 13 };     // 轻受击弹簧（二阶段更硬：恢复更快）
    this.hot = [{ bone: 'hand_l', k: 0 }, { bone: 'hand_r', k: 0 }, { bone: 'spine_03_x', k: 0 }];
    this.caps = CAPS.map(([a, b, r, part]) => ({ A: this.bones[a], B: this.bones[b], r: r * this.S, part, a: new THREE.Vector3(), b: new THREE.Vector3() }));
    scene.add(this.root);
    this.play('idle', { fade: 0 });
  }

  // ---------- 材质 ----------
  makeMaterial(src) {
    const C = BOSS50.colors;
    const m = src.clone();
    const U = this.U = {
      uEnergy: { value: new THREE.Color(C.p1) }, uCore: { value: new THREE.Color(C.core) },
      uScaleTint: { value: new THREE.Color(C.scale) }, uGold: { value: new THREE.Color(C.gold) },
      uEmK: { value: 1.4 }, uPhase: { value: 0 }, uCrack: { value: 0 }, uCrackCol: { value: new THREE.Color(C.p2) },
      uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(0xf4ecff) }, uRim: { value: 0.18 }, uRimCol: { value: new THREE.Color(C.p1) },
      uDissolve: { value: 0 }, uTime: { value: 0 }, uTint: { value: 1 },
      uHot: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uHotCol: { value: new THREE.Color(C.p1) },
    };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBW; varying vec3 vBO;')
        .replace('#include <skinning_vertex>', '#include <skinning_vertex>\nvBO = position; vBW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vBW; varying vec3 vBO;
          uniform vec3 uEnergy, uCore, uScaleTint, uGold, uCrackCol, uFlashCol, uRimCol, uHotCol;
          uniform float uEmK, uPhase, uCrack, uFlash, uRim, uDissolve, uTime, uTint;
          uniform vec4 uHot[3];
          float bh(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
          float bn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
            return mix(mix(mix(bh(i), bh(i + vec3(1., 0., 0.)), f.x), mix(bh(i + vec3(0., 1., 0.)), bh(i + vec3(1., 1., 0.)), f.x), f.y),
                       mix(mix(bh(i + vec3(0., 0., 1.)), bh(i + vec3(1., 0., 1.)), f.x), mix(bh(i + vec3(0., 1., 1.)), bh(i + vec3(1., 1., 1.)), f.x), f.y), f.z); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec4 bossOrm = vec4(0., .7, 0., 1.);
          #ifdef USE_ROUGHNESSMAP
            bossOrm = texture2D(roughnessMap, vRoughnessMapUv);
          #endif
          if (uDissolve > .001) { float dn = bn(vBO * 9.) * .7 + bn(vBO * 23.) * .3; if (dn < uDissolve * 1.05) discard; }
          {
            // 局部着色：暗鳞偏向 #252830（保留明暗与纹理），金属甲片偏向旧金，原贴图的层次不动
            vec3 base = diffuseColor.rgb;
            float lum = dot(base, vec3(.299, .587, .114));
            float metal = smoothstep(.35, .8, bossOrm.b);
            vec3 scaleC = mix(base, uScaleTint * (.6 + lum * 3.0), .46 * uTint);
            vec3 goldC = mix(base, uGold * (.38 + lum * 2.0), .66 * uTint);
            diffuseColor.rgb = mix(scaleC, goldC, metal);
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            float em = smoothstep(.25, .7, bossOrm.r);
            float pulse = .85 + .15 * sin(uTime * 2.3 + vBO.y * 6.);
            vec3 eC = mix(uEnergy, uCore, .35 + .3 * uPhase);
            totalEmissiveRadiance += eC * em * uEmK * pulse * (1. + uPhase * 1.6);
            // 二阶段：体表裂纹（噪声等值线），片状分布，沿裂纹流动
            if (uCrack > .001) {
              float n = bn(vBO * 7.) * .65 + bn(vBO * 17.) * .35;
              float line = 1. - smoothstep(.0, .028 + .02 * uCrack, abs(n - .5));
              float crp = smoothstep(.38, .62, bn(vBO * 2.6 + 3.7));
              float flow = .7 + .3 * sin(uTime * 4. - n * 30.);
              totalEmissiveRadiance += mix(uCrackCol, uCore, line * line * .5) * line * crp * uCrack * flow * 2.6;
            }
            // 蓄力光：双爪、胸口附近一团（世界距离）
            for (int i = 0; i < 3; i++) {
              if (uHot[i].w > .001) {
                float d = distance(vBW, uHot[i].xyz), fall = pow(1. - smoothstep(0., i == 2 ? 1.3 : 0.85, d), 2.);
                // 能量脉络：噪声等值线，沿脉络流动（不是整片涂白）
                float vn = bn(vBO * 13. + vec3(0., uTime * 1.3, 0.)), vein = 1. - smoothstep(.0, .07, abs(vn - .5));
                totalEmissiveRadiance += mix(uHotCol, uCore, vein * .5) * uHot[i].w * fall * (.18 + 1.5 * vein) * (.8 + .2 * sin(uTime * 9.));
              }
            }
            vec3 vdir = normalize(vViewPosition);
            float fres = pow(1. - abs(dot(normal, vdir)), 3.);
            totalEmissiveRadiance += uRimCol * fres * uRim;
            totalEmissiveRadiance += uFlashCol * uFlash * (.05 + .45 * fres);
            if (uDissolve > .001) { float dn = bn(vBO * 9.) * .7 + bn(vBO * 23.) * .3; totalEmissiveRadiance += mix(uEnergy, uCore, .5) * smoothstep(uDissolve * 1.05 + .07, uDissolve * 1.05, dn) * 4.; }
          }`);
    };
    m.customProgramCacheKey = () => 'boss50-mat';
    return m;
  }

  // ---------- 动作 ----------
  has(name) { return !!this.clips[name]; }
  clip(name) { return this.clips[name] || null; }
  dur(name) { return this.clips[name]?.duration ?? 0; }
  marks(name = this.cur?.name) { return this.clips[name]?.userData?.marks || {}; }
  // o：{ fade 淡入秒数, speed 招式速度, from 起始时刻, loop, ranges: [[t0, t1, 速度]]（这一段改用固定速度，不乘全局速度）, yawK（转身动作的转角倍数）}
  // 第十八轮：淡入淡出不再用 three.js 的 crossFadeTo——它的权重按直线变（起止两头速度突变），打断一段还在淡入的动作时
  // 又会先把那段的权重跳回 1 再淡出（一顿），淡出的动作还定格在最后一帧。现在每段动作记着自己的权重（blend），新动作从它
  // 现在的权重沿 smoothstep 升到 1，其余各自从现在的权重降到 0，每帧归一（合计恰为 1，不会混进绑定姿势）；淡出中的动作照常往下放
  play(name, o = {}) {
    let clip = this.clips[name];
    if (!clip) { console.warn('镇塔龙君缺少动作', name); return null; }
    const fade = o.fade ?? 0.16, from = o.from ?? 0;
    // 这段动作还在混合里（同一段接着再放、刚淡出的又要放）：换用克隆片段，才能从头放并交叉淡化
    const live = (c) => this.blend.some((L) => L.clip === c && L.w > 1e-3);
    if (live(clip)) { const alt = this.alt[name] || (this.alt[name] = clip.clone()); if (!live(alt)) clip = alt; }
    const a = this.mixer.clipAction(clip);
    const loop = o.loop ?? !!this.clips[name].userData?.loop;
    a.enabled = true; a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.timeScale = 0; a.time = from;
    a.play();
    const R = this.clips[name].userData?.root || null;
    const y0 = R ? rootAt(R, from, _r0)[2] * DEG * (o.yawK ?? 1) : 0;
    this.frameYaw = this.yaw - y0;
    this.cur = { name, clip, action: a, t: from, prevT: from, speed: o.speed ?? 1, loop, R, ranges: o.ranges || null, dur: clip.duration, done: false, yawK: o.yawK ?? 1 };
    let E = this.blend.find((L) => L.action === a);
    for (const L of this.blend) { L.w0 = L.w; L.w1 = 0; L.ft = 0; L.fd = fade; }
    if (!E) this.blend.push(E = { action: a, clip, w: 0 });
    Object.assign(E, { rec: this.cur, w0: E.w, w1: 1, ft: 0, fd: fade });
    if (!(fade > 0)) { for (const L of this.blend) if (L !== E) L.action.stop(); this.blend = [E]; E.w = 1; }
    this.applyWeights();
    return this.cur;
  }
  applyWeights() {
    let s = 0;
    for (const L of this.blend) s += L.w;
    for (const L of this.blend) L.action.setEffectiveWeight(s > 1e-6 ? L.w / s : 0);
  }
  // 推进各段的权重；淡出中的动作按它自己的速度接着放（循环的绕回，非循环的停在末帧）
  advanceBlend(dt) {
    const c = this.cur;
    for (let i = this.blend.length - 1; i >= 0; i--) {
      const L = this.blend[i];
      L.ft = Math.min(L.fd, L.ft + dt);
      const u = L.fd > 0 ? L.ft / L.fd : 1;
      L.w = L.w0 + (L.w1 - L.w0) * u * u * (3 - 2 * u);
      const r = L.rec;
      if (r && r !== c) { let t = r.t + dt * this.rateAt(r, r.t); t = r.loop ? t % r.dur : Math.min(t, r.dur); r.t = t; L.action.time = t; }
      if (L.w1 === 0 && u >= 1) { L.action.stop(); this.blend.splice(i, 1); }
    }
    this.applyWeights();
  }
  get t() { return this.cur ? this.cur.t : 0; }
  get name() { return this.cur?.name || null; }
  get done() { return !!this.cur?.done; }
  // 实际时间（秒）换算：本段动作从 t0 到 t1 还要多久
  realSpan(t0, t1, c = this.cur) {
    if (!c) return 0;
    const k = c.speed * this.speed;
    if (!c.ranges) return Math.max(0, t1 - t0) / k;
    let s = 0;
    const N = 24, h = (t1 - t0) / N;
    for (let i = 0; i < N; i++) { const tm = t0 + (i + 0.5) * h; s += h / this.rateAt(c, tm); }
    return Math.max(0, s);
  }
  rateAt(c, t) {
    if (c.ranges) for (const [a, b, sp] of c.ranges) if (t >= a && t < b) return sp;
    return c.speed * this.speed;
  }
  // 推进动作时间，算出本帧的根运动（不移动龙：交给战斗控制器限制后再落位）
  advance(dt) {
    const c = this.cur;
    this.motion.x = this.motion.z = 0;
    this.advanceBlend(dt);
    if (!c) return this.motion;
    c.prevT = c.t;
    let t = c.t + dt * this.rateAt(c, c.t);
    if (c.loop) { if (t >= c.dur) t %= c.dur; }
    else if (t >= c.dur) { t = c.dur; c.done = true; }
    c.t = t;
    c.action.time = t;
    if (c.R && !c.loop) {
      rootAt(c.R, c.prevT, _r0); rootAt(c.R, t, _r1);
      const dx = (_r1[0] - _r0[0]) * this.S, dz = (_r1[1] - _r0[1]) * this.S, f = this.frameYaw;
      this.motion.x = dx * Math.cos(f) + dz * Math.sin(f);
      this.motion.z = -dx * Math.sin(f) + dz * Math.cos(f);
      this.yaw = f + _r1[2] * DEG * c.yawK;
    }
    return this.motion;
  }
  // 转身（AI 的追踪、走路时的转向）：根运动的参照系一起转
  turn(dyaw) { this.frameYaw += dyaw; this.yaw += dyaw; }
  setYaw(y) { const d = y - this.yaw; this.turn(d); }
  // 区段是否刚刚越过时刻 m（本帧之内）
  crossed(m) { const c = this.cur; return !!c && c.prevT < m && c.t >= m; }
  inRange(a, b) { const c = this.cur; return !!c && c.t >= a && c.t <= b; }

  // ---------- 每帧：摆姿势 + 运行时的层；之后由控制器 finish() 更新世界矩阵与挂点 ----------
  // 第十八轮：three.js 的 AnimationMixer 只在算出的值与上一帧不同时才写回骨骼。编排动作里不动的骨（待机时的头、尾、部分脊椎）
  // 是两帧的常量轨道，混合器之后不再写它们——而尾摆、看向、受击这些层每帧在骨上乘一次，于是转角一帧帧累积：头歪、越转越多，
  // 尾巴、上身也会跟着漂。现在每帧先把这些骨还原成上一帧混合器给出的姿势，再让混合器更新，层只叠在干净的姿势上。
  pose(dt, { lookAt = null } = {}) {
    this.root.rotation.y = this.yaw;
    const B = this.bones, A = this.T.axes;
    const LB = this.layerBones || (this.layerBones = [...TAIL, 'neck_x', 'head_x', 'spine_02_x', 'spine_03_x'].map((n) => [B[n], new THREE.Quaternion(), false]));
    for (const e of LB) if (e[2]) e[0].quaternion.copy(e[1]);
    this.mixer.update(dt);
    for (const e of LB) { e[1].copy(e[0].quaternion); e[2] = true; }
    // 尾巴：沿尾传的缓慢摆动（左右为主、略带起伏）
    const S = this.sway;
    S.t += dt;
    if (S.w > 0.002) {
      TAIL.forEach((n, i) => {
        const k = (i + 1) / TAIL.length, ph = S.t * 1.25 - i * 0.55;
        const yaw = Math.sin(ph) * 3.2 * k * S.w * S.amp * DEG, lift = Math.sin(ph * 0.7 + 1.3) * 1.2 * k * S.w * S.amp * DEG;
        B[n].quaternion.multiply(_q.setFromAxisAngle(A[n].y, yaw)).multiply(_q2.setFromAxisAngle(A[n].x, -lift));
      });
    }
    // 头颈看向玩家
    const L = this.look;
    let wantYaw = 0, wantPitch = 0;
    if (lookAt && L.w > 0.01) {
      this.root.updateMatrixWorld(true);
      const head = B.head_x.getWorldPosition(_v);
      const f = this.yaw, dx = lookAt.x - head.x, dz = lookAt.z - head.z;
      const lx = dx * Math.cos(f) - dz * Math.sin(f), lz = dx * Math.sin(f) + dz * Math.cos(f);
      wantYaw = THREE.MathUtils.clamp(Math.atan2(lx, lz), -L.maxYaw, L.maxYaw);
      const hd = Math.hypot(lx, lz);
      wantPitch = THREE.MathUtils.clamp(Math.atan2(head.y - lookAt.y, Math.max(1, hd)), -10 * DEG, 32 * DEG);
      if (lz < -1) wantYaw *= 0.4;                     // 在身后：头只偏一点（身后由转身处理）
    }
    const kk = 1 - Math.exp(-dt * 6);
    L.yaw += (wantYaw * L.w - L.yaw) * kk; L.pitch += (wantPitch * L.w - L.pitch) * kk;
    if (Math.abs(L.yaw) > 1e-4 || Math.abs(L.pitch) > 1e-4) {
      for (const [n, k] of [['neck_x', 0.45], ['head_x', 0.55]]) B[n].quaternion.multiply(_q.setFromAxisAngle(A[n].y, L.yaw * k)).multiply(_q2.setFromAxisAngle(A[n].x, L.pitch * k));
    }
    // 轻受击：上身短暂后仰、向受击一侧扭（弹簧）
    const F = this.flinch;
    F.vel += (-this.flinchK.k * F.v - this.flinchK.c * F.vel) * dt; F.v += F.vel * dt;
    if (Math.abs(F.v) > 1e-4) {
      for (const [n, k] of [['spine_02_x', 0.5], ['spine_03_x', 0.8], ['neck_x', 0.6]]) B[n].quaternion.multiply(_q.setFromAxisAngle(A[n].x, -F.v * k)).multiply(_q2.setFromAxisAngle(A[n].y, F.v * F.side * k * 0.6));
    }
  }
  hitFlinch(side = 0, k = 1) { this.flinch.vel += 3.4 * k; this.flinch.side = side; }

  finish(t, dt = 1 / 60) {
    this.root.updateMatrixWorld(true);
    const U = this.U;
    U.uTime.value = t;
    U.uFlash.value = Math.max(0, U.uFlash.value - dt * 5);
    for (let i = 0; i < 3; i++) {
      const h = this.hot[i], v = U.uHot.value[i];
      if (h.k > 0.001) { this.bones[h.bone].getWorldPosition(_v); v.set(_v.x, _v.y, _v.z, h.k); } else v.w = 0;
    }
    for (const c of this.caps) { c.A.getWorldPosition(c.a); c.B.getWorldPosition(c.b); }
  }

  // ---------- 挂点（世界坐标）----------
  bonePos(n, out = new THREE.Vector3()) { return this.bones[n].getWorldPosition(out); }
  claw(side, out = new THREE.Vector3()) {
    const b3 = this.bones[`middle3_${side}`], b2 = this.bones[`middle2_${side}`];
    b3.getWorldPosition(out); b2.getWorldPosition(_v3);
    return out.addScaledVector(_v3.sub(out).negate(), 0.9);
  }
  mouth(out = new THREE.Vector3()) { return this.bones.head_x.localToWorld(out.copy(MOUTH_LOCAL)); }
  // 头的朝向（自头骨指向嘴，水平分量为主）
  headDir(out = new THREE.Vector3()) { this.bones.head_x.getWorldPosition(_v2); return this.mouth(out).sub(_v2).normalize(); }
  chest(out = new THREE.Vector3()) { return this.bones.spine_03_x.getWorldPosition(out); }
  tailTip(out = new THREE.Vector3()) { return this.bones.c_tail_06_x.getWorldPosition(out); }
  get forward() { return _v3.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  // 离某条竖直线段（玩家：脚 y0 到可及高度 y1）最近的胶囊：{ part, r, p（轴上最近点）, d（到轴的三维距离）, gap（竖直方向够不着的距离）}
  nearest(x, z, y0, y1, filter = null) {
    let best = null;
    for (const c of this.caps) {
      if (filter && !filter(c.part)) continue;
      const q = closestSegVertical(c.a, c.b, x, z, y0, y1, _v);
      const d = q.d - c.r;
      if (!best || d < best.dd) best = { part: c.part, r: c.r, p: _v.clone(), d: q.d, dd: d, gap: q.gap };
    }
    return best;
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.root.parent?.remove(this.root);
    this.mesh.material.dispose();
    this.mesh.skeleton?.dispose();
  }
}

// 线段 AB 与竖直线段（x, z, y0..y1）的最近点：返回 AB 上的点（写入 out）、两者三维距离、竖直方向的差（点在竖直段高度范围外的部分）
function closestSegVertical(A, B, x, z, y0, y1, out) {
  // 在 AB 上按水平距离找最近（取样 + 一次细化，足够精确且稳定）
  let bu = 0, bd = Infinity;
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const u = i / N, px = A.x + (B.x - A.x) * u, pz = A.z + (B.z - A.z) * u, py = A.y + (B.y - A.y) * u;
    const h = Math.hypot(px - x, pz - z), vy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0;
    const d = Math.hypot(h, vy);
    if (d < bd) { bd = d; bu = u; }
  }
  const lo = Math.max(0, bu - 1 / N), hi = Math.min(1, bu + 1 / N);
  for (let i = 0; i <= 8; i++) {
    const u = lo + (hi - lo) * i / 8, px = A.x + (B.x - A.x) * u, pz = A.z + (B.z - A.z) * u, py = A.y + (B.y - A.y) * u;
    const h = Math.hypot(px - x, pz - z), vy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0;
    const d = Math.hypot(h, vy);
    if (d < bd) { bd = d; bu = u; }
  }
  out.set(A.x + (B.x - A.x) * bu, A.y + (B.y - A.y) * bu, A.z + (B.z - A.z) * bu);
  const gap = out.y < y0 ? y0 - out.y : out.y > y1 ? out.y - y1 : 0;
  return { d: bd, gap };
}
export { closestSegVertical };
