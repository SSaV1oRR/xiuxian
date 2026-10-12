// 第二十四轮：烬狱剑尊（通天塔第三十层守关）的模型与动作运行层。
// 素材：assets/boss/boss30（Tilt Brush「Soul of Cinder」笔画模型，原件保留）→ tools 外的绑定 / 导出脚本（见 docs/R24_REPORT.md）→
//   assets/converted/boss30/boss30.glb：UE5 Manny 骨架（按人物比例改骨长，只留 25 根变形骨）、蒙皮身体（双面笔画去重后 13.8 万顶点）、
//   右手骨上的剑（节点 boss30_sword）、55 段动作（单手剑动作包的实际动作 + 用它们拼出 / 摆出的几段）；
//   注意：压缩时顶点量化到 [-1, 1]——身体的还原缩放 / 平移进了反绑定矩阵，剑的进了节点本身，所以「本地坐标」已不是导出时的那一套：
//   剑的握点 / 剑尖 / 剑轴在载入时按剑的网格自己求（swordFrame），着色器里身体的模型空间坐标经 uDeq 还原成米；
//   boss30_anim.json：各段动作的时长、循环与根运动（RM 素材的根骨位移，每帧一点，模型本地：+Z 朝前）。
// 一场战斗一个实例：自己的骨骼（SkeletonUtils.clone）、自己的材质、自己的 AnimationMixer。
// 播放由这里推进时间（动作本身 timeScale 为 0，每帧直接写 time）——与第五十层同一套：
//   速度 = 段速度 × 区段速度（ranges：举剑停顿处按极慢的速度过）；根运动逐帧取差值交给战斗控制器（场地边界）再落到 Boss 身上；
//   动作之间自己管权重（smoothstep、每帧归一、淡出的动作接着放）。
// 运行时叠在动作之上的层：头颈看向玩家（限角）、受击的上身后仰（弹簧）、蓄势时的颤动、被弹反时的一顿（时间轴暂停，由控制器给 0 时间步）。
// 材质：笔画保留原顶点色与笔刷贴图（双面、0.2 镂空）；火、光两种笔刷按顶点色自发光（二阶段、蓄力时更亮），
// 二阶段胸口与甲缝里透出火光（模型空间噪声等值线，只在暗色的甲片上）；剑刃另有一道沿剑身燃起的火（uBlade）；受击闪白；
// 出场自脚下由余烬凝成（uForm）、击败后自上而下碎成余烬（uAsh）。
// 第二十六轮：整体放大到 BOSS30.scale（约 4 米）；笔刷贴图换成原素材的 1024 像素（boss30_hd.glb），各向异性过滤 8；
//   手里换成荆棘剑（BOSS30.swordModel，swapSword：握点、剑轴对齐原装的剑，剑面对齐原装剑身的宽面）；
//   新增一层俯身（lean：出招时把上身往前压，见 CONFIG30.lean——动作包按同身量的对手做，放大后不压就从玩家头顶扫过）。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { BOSS30, CONFIG30 } from '../game/boss30Config.js';

const DEG = Math.PI / 180;
// 受击 / 碰撞用的胶囊：[骨 A, 骨 B, 半径（米）, 部位]
const CAPS = [
  ['pelvis', 'spine_05', 0.34, 'body'], ['spine_05', 'head', 0.24, 'body'], ['head', 'head', 0.2, 'head'],
  ['thigh_l', 'calf_l', 0.15, 'leg'], ['calf_l', 'foot_l', 0.12, 'leg'], ['thigh_r', 'calf_r', 0.15, 'leg'], ['calf_r', 'foot_r', 0.12, 'leg'],
  ['upperarm_l', 'hand_l', 0.12, 'arm'], ['upperarm_r', 'hand_r', 0.12, 'arm'],
];
const LAYER_BONES = ['spine_01', 'spine_02', 'spine_03', 'spine_05', 'neck_01', 'head', 'upperarm_r', 'lowerarm_r', 'clavicle_r'];

// ---------- 模板：载入一次，各实例共用几何、贴图与动作片段 ----------
let TPL = null, TPL_P = null;
export function boss30Loaded() { return !!TPL; }
export function loadBoss30() {
  if (TPL) return Promise.resolve(TPL);
  if (TPL_P) return TPL_P;
  const p = (async () => {
    const [g, meta, sw] = await Promise.all([
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(BOSS30.url),
      fetch(BOSS30.anim).then((r) => { if (!r.ok) throw new Error('boss30_anim.json ' + r.status); return r.json(); }),
      // 第二十六轮：荆棘剑（载入失败就还用原装的剑）
      BOSS30.swordModel ? new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(BOSS30.swordModel.file).catch((e) => { console.warn('烬狱剑尊的佩剑载入失败，改用原装的剑', e); return null; }) : null,
    ]);
    const clips = {};
    for (const c of g.animations) {
      // 导出时每根骨都按帧采了位移、转动、缩放：只留转动与骨盆的位移（其余是常量，留着只是让混合器多算）
      c.tracks = c.tracks.filter((t) => t.name.endsWith('.quaternion') || t.name === 'pelvis.position');
      const m = meta.clips[c.name] || {};
      c.userData = { loop: !!m.loop, src: m.src || '', root: !m.loop && m.root && m.root.length > 1 ? rootTable(m.root) : null };
      clips[c.name] = c;
    }
    TPL = { gltf: g, scene: g.scene, clips, meta, sword: sw?.scene || null };
    return TPL;
  })();
  TPL_P = p;
  p.catch(() => { if (TPL_P === p) TPL_P = null; });
  return p;
}
// 离开第三十层：放掉模板的显存（几何、贴图），模板留在内存，下次进场重新上传
export function freeBoss30Gpu() {
  if (!TPL) return;
  for (const S of [TPL.scene, TPL.sword]) S?.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const m of [].concat(o.material)) for (const k of ['map', 'emissiveMap', 'metalnessMap', 'roughnessMap', 'normalMap', 'aoMap']) m[k]?.dispose();
  });
}
// 根运动表：[[秒, x, z], …] → { times, v: [x, z] × n }
function rootTable(rows) {
  const times = new Float32Array(rows.length), v = new Float32Array(rows.length * 2);
  rows.forEach((r, i) => { times[i] = r[0]; v[i * 2] = r[1]; v[i * 2 + 1] = r[2]; });
  return { times, v };
}
function rootAt(R, t, out) {
  const T = R.times, n = T.length, v = R.v;
  if (t <= T[0]) { out[0] = v[0]; out[1] = v[1]; return out; }
  if (t >= T[n - 1]) { out[0] = v[(n - 1) * 2]; out[1] = v[(n - 1) * 2 + 1]; return out; }
  let j = Math.min(n - 2, Math.max(0, Math.floor(t / (T[1] - T[0]))));
  while (j < n - 2 && T[j + 1] < t) j++;
  while (j > 0 && T[j] > t) j--;
  const u = (t - T[j]) / Math.max(1e-6, T[j + 1] - T[j]);
  out[0] = v[j * 2] + (v[j * 2 + 2] - v[j * 2]) * u; out[1] = v[j * 2 + 1] + (v[j * 2 + 3] - v[j * 2 + 1]) * u;
  return out;
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _ax = new THREE.Vector3(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion();
const _r0 = [0, 0], _r1 = [0, 0];

// 笔画材质的着色补丁（所有身体 / 剑材质共用一份程序，按 #define 分火光笔刷与寻常笔刷）
const COMMON = /* glsl */`
  varying vec3 vBO; varying float vBY;
  uniform float uFlash, uIgnite, uAsh, uForm, uTime, uGlowK, uBlade, uSword;
  uniform vec3 uCore, uGold, uMain, uDeep;
  uniform vec4 uHot;
  float b30h(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float b30n(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
    return mix(mix(mix(b30h(i), b30h(i + vec3(1., 0., 0.)), f.x), mix(b30h(i + vec3(0., 1., 0.)), b30h(i + vec3(1., 1., 0.)), f.x), f.y),
               mix(mix(b30h(i + vec3(0., 0., 1.)), b30h(i + vec3(1., 0., 1.)), f.x), mix(b30h(i + vec3(0., 1., 1.)), b30h(i + vec3(1., 1., 1.)), f.x), f.y), f.z); }
  vec3 b30ramp(float k){ k = clamp(k, 0., 1.); return k < .33 ? mix(uDeep, uMain, k / .33) : k < .7 ? mix(uMain, uGold, (k - .33) / .37) : mix(uGold, uCore, (k - .7) / .3); }`;

export class Boss30Rig {
  constructor(T, scene) {
    this.T = T;
    this.root = new THREE.Group();
    this.root.name = 'boss30';
    this.model = cloneSkinned(T.scene);
    this.S = BOSS30.scale;
    this.model.scale.setScalar(this.S);
    this.root.add(this.model);
    this.bones = {}; this.meshes = []; this.mats = [];
    this.model.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.name === 'boss30_sword') this.sword = o;
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; this.meshes.push(o); }
    });
    const U = this.U = {
      uFlash: { value: 0 }, uIgnite: { value: 0 }, uAsh: { value: 0 }, uForm: { value: 1 }, uTime: { value: 0 }, uGlowK: { value: 1.6 }, uBlade: { value: 0 },
      uCore: { value: new THREE.Color(BOSS30.colors.core) }, uGold: { value: new THREE.Color(BOSS30.colors.gold) }, uMain: { value: new THREE.Color(BOSS30.colors.main) }, uDeep: { value: new THREE.Color(BOSS30.colors.deep) },
      uHot: { value: new THREE.Vector4(0, 0, 0, 0) }, uTop: { value: BOSS30.height + 0.3 },
    };
    // 骨架还在绑定姿势（混合器还没更新过）：求身体「量化坐标 → 模型本地（米）」的矩阵、剑的握点 / 剑尖 / 剑轴
    this.model.updateMatrixWorld(true);
    const toModel = new THREE.Matrix4().copy(this.model.matrixWorld).invert();
    for (const m of this.meshes) {
      if (!m.isSkinnedMesh) continue;
      const sk = m.skeleton;
      m.userData.deq = new THREE.Matrix4().multiplyMatrices(sk.bones[0].matrixWorld, sk.boneInverses[0]).multiply(m.bindMatrix).premultiply(toModel);
    }
    this.sw = this.swordFrame();
    if (T.sword) this.swapSword(T.sword);
    for (const m of this.meshes) {
      const inSword = this.isSword(m);
      m.material = this.makeMaterial(m.material, inSword, m, !!m.userData.sword3);
      this.mats.push(m.material);
    }
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = T.clips; this.alt = {};
    this.cur = null; this.blend = [];
    this.yaw = 0; this.frameYaw = 0;
    this.motion = { x: 0, z: 0 };
    this.look = { w: 0, yaw: 0, pitch: 0, maxYaw: 50 * DEG };
    this.flinch = { v: 0, vel: 0, side: 0 };
    this.lean = { v: 0, vel: 0, target: 0 };       // 第二十六轮：俯身（弧度；控制器每帧给 target）
    this.tremble = 0; this.tremT = 0;
    this.axes = this.boneAxes();
    this.caps = CAPS.map(([a, b, r, part]) => ({ A: this.bones[a], B: this.bones[b], r: r * this.S, part, a: new THREE.Vector3(), b: new THREE.Vector3() }));
    this.swordTip = new THREE.Vector3(); this.swordGrip = new THREE.Vector3(); this.swordPommel = new THREE.Vector3();
    this.swordAttached = true;
    scene.add(this.root);
    this.play('idle', { fade: 0 });
  }
  isSword(m) { let o = m; while (o) { if (o === this.sword) return true; o = o.parent; } return false; }
  // 剑在自己节点里的握点 / 剑尖 / 剑首与剑轴：按剑的顶点求主轴（剑身细长），两端里离右手骨近的是剑首；
  // 握点按导出时量的比例（剑首到握点 0.242、握点到剑尖 1.277）落在轴上
  swordFrame() {
    const S = this.sword;
    if (!S) return null;
    S.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(S.matrixWorld).invert(), pts = [], v = new THREE.Vector3();
    S.traverse((o) => {
      if (!o.isMesh) return;
      const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), pa = o.geometry.attributes.position;
      o.userData.deq = rel;                                           // 着色器：剑的网格坐标 → 剑节点坐标（剑身上的位置按它算）
      for (let i = 0; i < pa.count; i++) pts.push(v.fromBufferAttribute(pa, i).applyMatrix4(rel).clone());
    });
    const m = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length);
    const C = [0, 0, 0, 0, 0, 0];                                    // 协方差 xx xy xz yy yz zz
    for (const p of pts) { const x = p.x - m.x, y = p.y - m.y, z = p.z - m.z; C[0] += x * x; C[1] += x * y; C[2] += x * z; C[3] += y * y; C[4] += y * z; C[5] += z * z; }
    const d = new THREE.Vector3(0.3, 0.5, 0.8).normalize();
    for (let k = 0; k < 40; k++) d.set(C[0] * d.x + C[1] * d.y + C[2] * d.z, C[1] * d.x + C[3] * d.y + C[4] * d.z, C[2] * d.x + C[4] * d.y + C[5] * d.z).normalize();
    const hand = S.parent ? new THREE.Vector3().setFromMatrixPosition(S.parent.matrixWorld).applyMatrix4(inv) : new THREE.Vector3();
    if (hand.clone().sub(m).dot(d) > 0) d.negate();                 // d：剑首 → 剑尖
    let t0 = Infinity, t1 = -Infinity;
    for (const p of pts) { const t = p.clone().sub(m).dot(d); t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
    const W = BOSS30.sword, tg = t0 + (t1 - t0) * (-W.pommel) / (W.tip - W.pommel);
    // 第二十六轮：第二主轴（剑身的宽面方向：换剑时新剑的刃口按它摆）——去掉主轴之后再做一次幂迭代
    const l1 = d.x * (C[0] * d.x + C[1] * d.y + C[2] * d.z) + d.y * (C[1] * d.x + C[3] * d.y + C[4] * d.z) + d.z * (C[2] * d.x + C[4] * d.y + C[5] * d.z);
    const D2 = [C[0] - l1 * d.x * d.x, C[1] - l1 * d.x * d.y, C[2] - l1 * d.x * d.z, C[3] - l1 * d.y * d.y, C[4] - l1 * d.y * d.z, C[5] - l1 * d.z * d.z];
    const e = new THREE.Vector3(0.7, -0.2, 0.4).normalize();
    for (let k = 0; k < 40; k++) { e.set(D2[0] * e.x + D2[1] * e.y + D2[2] * e.z, D2[1] * e.x + D2[3] * e.y + D2[4] * e.z, D2[2] * e.x + D2[4] * e.y + D2[5] * e.z); e.addScaledVector(d, -e.dot(d)).normalize(); }
    return { grip: m.clone().addScaledVector(d, tg), tip: m.clone().addScaledVector(d, t1), pommel: m.clone().addScaledVector(d, t0), axis: d.clone(), len: t1 - tg, wide: e.clone() };
  }
  // 第二十六轮：手里换成荆棘剑（BOSS30.swordModel：本地 +Y 指剑尖、原点在握持处、+X 刃口、+Z 剑面法线）。
  //   挂在原装剑的父骨（右手）上：原点放到原装剑的握点、+Y 对齐原装的剑轴、+X 对齐原装剑身的宽面，按握点到剑尖的长度定缩放；原装的剑藏起来（不再判定、不再显示）
  swapSword(scene) {
    const old = this.sword, W0 = this.sw, D = BOSS30.swordModel;
    if (!old || !W0 || !scene || !D) return;
    const toHand = new THREE.Matrix4().compose(old.position, old.quaternion, old.scale);
    const grip = W0.grip.clone().applyMatrix4(toHand), tip = W0.tip.clone().applyMatrix4(toHand);
    const axis = tip.clone().sub(grip).normalize(), L0 = tip.distanceTo(grip);
    const x = W0.wide.clone().applyQuaternion(old.quaternion); x.addScaledVector(axis, -x.dot(axis)).normalize();
    const z = new THREE.Vector3().crossVectors(x, axis).normalize();
    const g = new THREE.Group(); g.name = 'boss30_sword3';
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, axis, z));
    if (D.roll) g.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), D.roll));
    g.position.copy(grip); g.scale.setScalar((L0 * (D.len ?? 1)) / D.tip);
    const s = scene.clone(true);
    g.add(s);
    old.parent.add(g);
    old.visible = false;
    this.oldSword = old; this.sword = g;
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    s.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      o.userData.deq = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld); o.userData.sword3 = true;
      this.meshes.push(o);
    });
    this.sw = { grip: new THREE.Vector3(0, 0, 0), tip: new THREE.Vector3(0, D.tip, 0), pommel: new THREE.Vector3(0, D.pommel, 0), axis: new THREE.Vector3(0, 1, 0), len: D.tip };
  }

  // ---------- 材质 ----------
  makeMaterial(src, inSword, mesh = null, pbr = false) {
    const glow = !pbr && /Fire|Light/.test(src.name);
    const m = src.clone();
    m.side = THREE.DoubleSide;
    m.emissive = new THREE.Color(0x000000); m.emissiveMap = null; m.emissiveIntensity = 1;
    // 第二十六轮：贴图各向异性过滤（剑尊放大之后，斜着看的笔触不再糊成一片）
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (m[k] && m[k].anisotropy < 8) { m[k].anisotropy = 8; m[k].needsUpdate = true; }
    // 荆棘剑（pbr）：保留它自己的金属、粗糙度、法线贴图
    if (pbr) { m.envMapIntensity = 1.0; }
    // 导出的油画笔刷金属度贴图是一张纯白（整片当成金属，没有环境光时发黑）：改成半金属的旧铁
    else if (m.metalnessMap || m.metalness > 0.5) { m.metalnessMap = null; m.roughnessMap = null; m.metalness = 0.32; m.roughness = 0.58; }
    else { m.metalness = 0.08; m.roughness = 0.8; }
    const U = this.U;
    const sw = this.sw, deq = mesh?.userData.deq || new THREE.Matrix4();
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.uniforms.uSword = { value: inSword ? 1 : 0 };
      sh.uniforms.uDeq = { value: deq };
      sh.uniforms.uSwA = { value: sw ? sw.grip.clone() : new THREE.Vector3() };
      sh.uniforms.uSwD = { value: sw ? sw.axis.clone().divideScalar(sw.len) : new THREE.Vector3(0, 1, 0) };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBO; varying float vBY; uniform float uSword; uniform mat4 uDeq; uniform vec3 uSwA, uSwD;')
        // 模型空间（蒙皮前，量化坐标经 uDeq 还原成米）：碎烬 / 凝形的噪声与高度都按它，不随动作漂；剑上取剑身上的位置（0 握点 … 1 剑尖）
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec3 b30p = (uDeq * vec4(position, 1.)).xyz; vBO = b30p; vBY = uSword > .5 ? dot(b30p - uSwA, uSwD) : b30p.y;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + COMMON + '\nuniform float uTop;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          {
            // 凝形（出场）：自下而上显出；碎烬（击败）：自上而下化去——边缘一线余烬亮光（在自发光里补）
            float h = uSword > .5 ? 1.0 : vBY;
            float nz = b30n(vBO * 7.) * .55 + b30n(vBO * 19.) * .45;
            if (uForm < .999 && h + (nz - .5) * .35 > uForm * (uTop + .4) - .2) discard;
            if (uAsh > .001 && (uTop - h) / uTop + (nz - .5) * .4 < uAsh * 1.3 - .15) discard;
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            float nz = b30n(vBO * 7.) * .55 + b30n(vBO * 19.) * .45;
            ${glow ? `
            // 火、光笔刷：按顶点色自发光（略带闪动），二阶段 / 蓄力更亮、偏向金橙
            float fl = .82 + .18 * sin(uTime * 7. + vBO.y * 13. + vBO.x * 5.);
            vec3 base = vColor.rgb;
            totalEmissiveRadiance += mix(base, b30ramp(.55 + .45 * nz), .35 * uIgnite) * uGlowK * fl * (1. + uIgnite * 1.4);
            ` : `
            // 二阶段：暗色甲片的缝里透出火（噪声等值线，片状分布，沿缝流动）；胸口一团更亮
            if (uIgnite > .001) {
              float lum = dot(diffuseColor.rgb, vec3(.299, .587, .114));
              float n2 = b30n(vBO * 9.) * .6 + b30n(vBO * 23.) * .4;
              float seam = 1. - smoothstep(.0, .045, abs(n2 - .5));
              float pch = smoothstep(.36, .62, b30n(vBO * 3.1 + 2.7));
              float flow = .65 + .35 * sin(uTime * 3.2 - n2 * 26.);
              totalEmissiveRadiance += b30ramp(.35 + .5 * seam * flow) * seam * pch * (1. - smoothstep(.12, .4, lum)) * uIgnite * 2.2;
            }`}
            // 蓄力点（胸口 / 剑）：世界距离的一团火光
            if (uHot.w > .001) { float d = distance(vBO, uHot.xyz); totalEmissiveRadiance += b30ramp(.6) * uHot.w * pow(1. - smoothstep(0., .9, d), 2.) * (.6 + .4 * nz); }
            // 剑刃燃火：沿剑身由握点烧向剑尖（uBlade 0–1：火燃到哪里），刃上一层流动的火光
            if (uSword > .5 && uBlade > .001) {
              float along = clamp(vBY, 0., 1.);
              float on = 1. - smoothstep(uBlade - .12, uBlade, along);
              float fl2 = .7 + .3 * sin(uTime * 11. - along * 18. + nz * 6.);
              totalEmissiveRadiance += b30ramp(.5 + .45 * fl2 * nz) * on * (1.2 + 1.6 * fl2) * step(.02, along);
            }
            // 碎烬 / 凝形的边：一线金橙
            float h = uSword > .5 ? 1.0 : vBY;
            if (uAsh > .001) { float e = (uTop - h) / uTop + (nz - .5) * .4 - (uAsh * 1.3 - .15); totalEmissiveRadiance += b30ramp(.8) * (1. - smoothstep(0., .08, e)) * 3.; }
            if (uForm < .999) { float e = uForm * (uTop + .4) - .2 - (h + (nz - .5) * .35); totalEmissiveRadiance += b30ramp(.75) * (1. - smoothstep(0., .12, e)) * 3.; }
            // 受击闪白（暖白、边缘更亮）；平时一道暗暖的轮廓光（暗场里看得清剪影）
            vec3 vd = normalize(vViewPosition);
            float fres = pow(1. - abs(dot(normal, vd)), 2.5);
            totalEmissiveRadiance += b30ramp(.3) * pow(fres, 1.6) * (.22 + .25 * uIgnite);
            totalEmissiveRadiance += vec3(1., .93, .82) * uFlash * (.08 + .5 * fres);
          }`);
    };
    m.customProgramCacheKey = () => 'boss30-' + (pbr ? 'sword3' : glow ? 'glow' : 'paint');
    return m;
  }

  // ---------- 动作 ----------
  has(name) { return !!this.clips[name]; }
  dur(name) { return this.clips[name]?.duration ?? 0; }
  // o：{ fade 淡入秒数, speed, from 起始时刻, loop, ranges: [[t0, t1, 速度]]（这一段改用固定速度）, root（false 时不取根运动）}
  play(name, o = {}) {
    let clip = this.clips[name];
    if (!clip) { console.warn('烬狱剑尊缺少动作', name); return null; }
    const fade = o.fade ?? 0.16, from = o.from ?? 0;
    const live = (c) => this.blend.some((L) => L.clip === c && L.w > 1e-3);
    if (live(clip)) { const alt = this.alt[name] || (this.alt[name] = clip.clone()); if (!live(alt)) clip = alt; }
    const a = this.mixer.clipAction(clip);
    const loop = o.loop ?? !!this.clips[name].userData?.loop;
    a.enabled = true; a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.timeScale = 0; a.time = from;
    a.play();
    const R = o.root === false ? null : this.clips[name].userData?.root || null;
    this.frameYaw = this.yaw;
    this.cur = { name, clip, action: a, t: from, prevT: from, speed: o.speed ?? 1, loop, R, ranges: o.ranges || null, dur: clip.duration, done: false };
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
  advanceBlend(dt) {
    const c = this.cur;
    for (let i = this.blend.length - 1; i >= 0; i--) {
      const L = this.blend[i];
      L.ft = Math.min(L.fd, L.ft + dt);
      const u = L.fd > 0 ? L.ft / L.fd : 1;
      L.w = L.w0 + (L.w1 - L.w0) * u * u * (3 - 2 * u);
      const r = L.rec;
      if (r && r !== c) { let t = this.stepTime(r, r.t, dt); t = r.loop ? t % r.dur : Math.min(t, r.dur); r.t = t; L.action.time = t; }
      if (L.w1 === 0 && u >= 1) { L.action.stop(); this.blend.splice(i, 1); }
    }
    this.applyWeights();
  }
  get t() { return this.cur ? this.cur.t : 0; }
  get name() { return this.cur?.name || null; }
  get done() { return !!this.cur?.done; }
  rateAt(c, t) {
    if (c.ranges) for (const [a, b, sp] of c.ranges) if (t >= a && t < b) return sp;
    return c.speed;
  }
  // 动作时间往前走 dt 秒（实际时间）：跨过区段边界时按段分开算（一帧跨进举剑停顿时，边界前按原速、边界后按停顿的慢速）——
  // 否则帧越长，跨边界那一帧按原速多走的那一截越大，30 帧时停顿会短 0.2 秒
  stepTime(c, t, dt) {
    if (!c.ranges) return t + dt * c.speed;
    let left = dt;
    for (let k = 0; k < 8 && left > 1e-9; k++) {
      const rate = this.rateAt(c, t);
      let nb = Infinity;
      for (const [a, b] of c.ranges) { if (a > t + 1e-9 && a < nb) nb = a; if (b > t + 1e-9 && b < nb) nb = b; }
      const need = rate > 1e-9 ? (nb - t) / rate : Infinity;
      if (need >= left) { t += left * rate; left = 0; } else { t = nb; left -= need; }
    }
    return t;
  }
  // 动作时间 t0 → t1 实际要多少秒（含区段速度）
  realSpan(t0, t1, c = this.cur) {
    if (!c || t1 <= t0) return 0;
    if (!c.ranges) return (t1 - t0) / c.speed;
    let s = 0;
    const N = 48, h = (t1 - t0) / N;
    for (let i = 0; i < N; i++) s += h / this.rateAt(c, t0 + (i + 0.5) * h);
    return s;
  }
  // 推进动作时间，算出本帧的根运动（不移动 Boss：交给控制器限制后再落位）
  advance(dt) {
    const c = this.cur;
    this.motion.x = this.motion.z = 0;
    this.advanceBlend(dt);
    if (!c) return this.motion;
    c.prevT = c.t;
    let t = this.stepTime(c, c.t, dt);
    if (c.loop) { if (t >= c.dur) t %= c.dur; }
    else if (t >= c.dur) { t = c.dur; c.done = true; }
    c.t = t;
    c.action.time = t;
    if (c.R && !c.loop) {
      rootAt(c.R, c.prevT, _r0); rootAt(c.R, t, _r1);
      const dx = (_r1[0] - _r0[0]) * this.S, dz = (_r1[1] - _r0[1]) * this.S, f = this.yaw;
      this.motion.x = dx * Math.cos(f) + dz * Math.sin(f);
      this.motion.z = -dx * Math.sin(f) + dz * Math.cos(f);
    }
    return this.motion;
  }
  crossed(m) { const c = this.cur; return !!c && c.prevT < m && c.t >= m; }
  turn(dyaw) { this.yaw += dyaw; }
  setYaw(y) { this.yaw = y; }
  get forward() { return _v2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  // ---------- 叠在动作上的层 ----------
  // 各骨在绑定姿势下「模型空间的 X（左）/ Y（上）/ Z（前）」换到骨的本地（看向、后仰、颤动这些层按模型空间的轴转）
  boneAxes() {
    this.model.updateMatrixWorld(true);
    const out = {}, X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1), qm = new THREE.Quaternion();
    this.model.getWorldQuaternion(qm);
    for (const n of LAYER_BONES) {
      const b = this.bones[n]; if (!b) continue;
      const qi = b.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(qm);
      out[n] = { x: X.clone().applyQuaternion(qi), y: Y.clone().applyQuaternion(qi), z: Z.clone().applyQuaternion(qi) };
    }
    return out;
  }
  pose(dt, { lookAt = null } = {}) {
    this.root.rotation.y = this.yaw;
    const B = this.bones, A = this.axes;
    // 每帧先把叠层的骨还原成上一帧混合器给出的姿势（混合器不重写常量轨道，层会一帧帧累积）
    const LB = this.layerBones || (this.layerBones = LAYER_BONES.filter((n) => B[n]).map((n) => [B[n], new THREE.Quaternion(), false]));
    for (const e of LB) if (e[2]) e[0].quaternion.copy(e[1]);
    this.mixer.update(dt);
    for (const e of LB) { e[1].copy(e[0].quaternion); e[2] = true; }
    // 第二十六轮：俯身——绕剑尊的左右轴（世界）把 spine_01、spine_02 往前转（弹簧跟随 target），腿脚不动；转轴换到各骨父节点的本地
    const Ln = this.lean, Lc = CONFIG30.lean, wq = Lc.freq;
    if (dt > 0) { Ln.vel += (wq * wq * (Ln.target - Ln.v) - 2 * wq * Ln.vel) * dt; Ln.v += Ln.vel * dt; }
    if (Math.abs(Ln.v) > 1e-4) {
      const a = _ax.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).applyQuaternion(B.pelvis.getWorldQuaternion(_q3).invert());
      for (const [n, k] of Lc.bones) {
        const b = B[n]; if (!b) continue;
        _q4.copy(b.quaternion);
        b.quaternion.premultiply(_q.setFromAxisAngle(a, Ln.v * k));
        a.applyQuaternion(_q4.invert());
      }
    }
    // 看向（头、颈各分一部分）
    const L = this.look;
    let wy = 0, wp = 0;
    if (lookAt && L.w > 0.01) {
      this.root.updateMatrixWorld(true);
      const head = B.head.getWorldPosition(_v);
      const f = this.yaw, dx = lookAt.x - head.x, dz = lookAt.z - head.z;
      const lx = dx * Math.cos(f) - dz * Math.sin(f), lz = dx * Math.sin(f) + dz * Math.cos(f);
      wy = THREE.MathUtils.clamp(Math.atan2(lx, lz), -L.maxYaw, L.maxYaw);
      wp = THREE.MathUtils.clamp(Math.atan2(head.y - lookAt.y, Math.max(1, Math.hypot(lx, lz))), -15 * DEG, 25 * DEG);
      if (lz < -0.5) wy *= 0.3;
    }
    const kk = 1 - Math.exp(-dt * 6);
    L.yaw += (wy * L.w - L.yaw) * kk; L.pitch += (wp * L.w - L.pitch) * kk;
    if (Math.abs(L.yaw) > 1e-4 || Math.abs(L.pitch) > 1e-4) {
      for (const [n, k] of [['neck_01', 0.4], ['head', 0.6]]) B[n].quaternion.multiply(_q.setFromAxisAngle(A[n].y, L.yaw * k)).multiply(_q2.setFromAxisAngle(A[n].x, L.pitch * k));
    }
    // 受击：上身后仰、向受击一侧扭（弹簧）
    const F = this.flinch;
    F.vel += (-95 * F.v - 14 * F.vel) * dt; F.v += F.vel * dt;
    if (Math.abs(F.v) > 1e-4) {
      for (const [n, k] of [['spine_02', 0.4], ['spine_03', 0.7], ['spine_05', 0.5]]) B[n].quaternion.multiply(_q.setFromAxisAngle(A[n].x, -F.v * k)).multiply(_q2.setFromAxisAngle(A[n].y, F.v * F.side * k * 0.5));
    }
    // 蓄势颤动（举剑停顿、焚天断界的蓄力）：右臂与上身细碎地抖
    if (this.tremble > 0.001) {
      this.tremT += dt;
      const t = this.tremT, k = this.tremble;
      const s1 = Math.sin(t * 37) * 0.6 + Math.sin(t * 53 + 1.3) * 0.4, s2 = Math.sin(t * 41 + 2.1) * 0.6 + Math.sin(t * 29 + 0.4) * 0.4;
      B.upperarm_r.quaternion.multiply(_q.setFromAxisAngle(A.upperarm_r.z, s1 * 0.018 * k));
      B.lowerarm_r.quaternion.multiply(_q.setFromAxisAngle(A.lowerarm_r.x, s2 * 0.022 * k));
      B.spine_03.quaternion.multiply(_q.setFromAxisAngle(A.spine_03.x, Math.sin(t * 3.1) * 0.012 * k));
    }
  }
  hitFlinch(side = 0, k = 1) { this.flinch.vel += 3.0 * k; this.flinch.side = side; }

  // 每帧收尾：世界矩阵、挂点、胶囊、材质时间
  finish(t, dt = 1 / 60) {
    this.root.updateMatrixWorld(true);
    const U = this.U;
    U.uTime.value = t;
    U.uFlash.value = Math.max(0, U.uFlash.value - dt * 5);
    for (const c of this.caps) { c.A.getWorldPosition(c.a); c.B.getWorldPosition(c.b); if (c.A === c.B) c.b.y += 0.28 * this.S; }
    const S = this.sword, W = this.sw;
    if (S && W) {
      S.localToWorld(this.swordGrip.copy(W.grip));
      S.localToWorld(this.swordTip.copy(W.tip));
      S.localToWorld(this.swordPommel.copy(W.pommel));
    }
  }
  // 剑身上的一点（0 握点 … 1 剑尖）
  bladeAt(u, out = new THREE.Vector3()) { return out.lerpVectors(this.swordGrip, this.swordTip, u); }
  bonePos(n, out = new THREE.Vector3()) { return this.bones[n].getWorldPosition(out); }
  chest(out = new THREE.Vector3()) { return this.bones.spine_05.getWorldPosition(out); }
  head(out = new THREE.Vector3()) { return this.bones.head.getWorldPosition(out); }
  // 胸口在模型空间（蒙皮前）的位置：蓄力光 uHot 按它
  hotAt(k) { const U = this.U.uHot.value; U.set(0, 1.85, 0.12, k); }

  // 离某条竖直线段（玩家：脚 y0 到可及高度 y1）最近的胶囊
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

  // ---------- 剑脱手（击败：剑从手里掉下）/ 复原 ----------
  dropSword(scene) {
    if (!this.sword || !this.swordAttached) return null;
    this.root.updateMatrixWorld(true);
    const S = this.sword, m = S.matrixWorld.clone();
    this.swordHome = { parent: S.parent, pos: S.position.clone(), quat: S.quaternion.clone(), scale: S.scale.clone() };
    scene.add(S);
    m.decompose(S.position, S.quaternion, S.scale);
    this.swordAttached = false;
    return S;
  }
  restoreSword() {
    if (this.swordAttached || !this.swordHome) return;
    const H = this.swordHome, S = this.sword;
    H.parent.add(S); S.position.copy(H.pos); S.quaternion.copy(H.quat); S.scale.copy(H.scale);
    this.swordAttached = true;
  }

  dispose() {
    this.restoreSword();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.root.parent?.remove(this.root);
    for (const m of this.mats) m.dispose();
    this.model.traverse((o) => { if (o.isSkinnedMesh) o.skeleton?.dispose(); });
  }
}

// 线段 AB 与竖直线段（x, z, y0..y1）的最近点（与第五十层同一算法）
export function closestSegVertical(A, B, x, z, y0, y1, out) {
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
// 两条线段之间的最近距离与参数（剑身对玩家身体：连续检测里每一小步用）
export function segSeg(p1, q1, p2, q2) {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z, d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) { s = t = 0; }
  else if (a <= 1e-9) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-9) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
      s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  const cx = p1.x + d1x * s - (p2.x + d2x * t), cy = p1.y + d1y * s - (p2.y + d2y * t), cz = p1.z + d1z * s - (p2.z + d2z * t);
  return { d: Math.hypot(cx, cy, cz), s, t };
}
