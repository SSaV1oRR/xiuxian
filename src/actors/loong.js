// 第二十三轮：雷龙破虚的龙——模型、材质与骨骼。
// 素材：assets/boss/chinese_dragon_loong/source/RYUISM/8030/8030.fbx（游戏坐骑「金龙」，无翼）→ tools/r23_convert_loong.py → assets/converted/loong/loong.glb（原文件不动）。
//   10138 顶点、173 根骨骼；脊柱一条链 31 节：头骨 Bone318 ← 颈 Skinbone049…044 ← 枢纽 Bone308 → 身尾 Skinbone018…042；四肢各一条腿链（带爪），头上有长须（各 15 节）、鬃毛与角。
//   自带动作 idle / idle_UI / rest / run（逐帧渲染核对过：run 是身体伸直、四肢划动、须鬃飘动；没有游动、俯冲、张口）。
// 游动：脊柱不取动作——头走过的路径记成一条轨迹（Trail），每节脊骨按它在静止姿势里离头骨的弧长，摆到轨迹上同样弧长处，
//   朝向取那里的切线（朝头）与上方向（世界上方正交化；竖直时沿身体平行移动），再按那一段的水平弯曲侧倾——身体连续弯曲、尾巴延迟跟随；
//   每帧都由静止姿势重算（世界目标 → 本地），不在上一帧的基础上累加旋转。四肢、须、鬃、下颌照放 run 动作（去掉脊柱、枢纽的轨道），俯冲时前爪往前探。
// 材质：保留原贴图的金鳞、白鬃、红鳍与眼睛（底色、法线、金属遮罩），加一层冷银蓝的边光、沿鳞片走的细电弧（受击、落雷时一闪）；
//   鬃毛用 alpha 镂空（alphaTest，不做排序混合）；裂隙穿出用裁切平面（龙在裂隙平面背后的部分不画，逐段露出）；消散时由头向尾烧成电光。
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { DRAGON } from '../game/combatConfig.js';

const CHAIN = ['Bone318', 'Skinbone049', 'Skinbone048', 'Skinbone047', 'Skinbone046', 'Skinbone045', 'Skinbone044', 'Bone308',
  'Skinbone018', 'Skinbone019', 'Skinbone020', 'Skinbone021', 'Skinbone022', 'Skinbone023', 'Skinbone024', 'Skinbone025', 'Skinbone026', 'Skinbone027',
  'Skinbone028', 'Skinbone029', 'Skinbone030', 'Skinbone031', 'Skinbone032', 'Skinbone033', 'Skinbone034', 'Skinbone035', 'Skinbone036', 'Skinbone037',
  'Skinbone038', 'Skinbone039', 'Skinbone040', 'Skinbone041', 'Skinbone042'];
const NOANIM = new Set([...CHAIN, 'GameObject', 'Bone256']);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 头走过的路径：按弧长取点（新的在末尾）。点距 step 米；超出 maxLen 的旧点丢掉（够整条龙用）
export class Trail {
  constructor(maxLen, step = 0.05) {
    this.maxLen = maxLen; this.step = step;
    this.x = []; this.y = []; this.z = []; this.c = [];       // 坐标与「从最旧的点起累计的弧长」
  }
  // 由一串点（旧 → 新）重置
  reset(pts) {
    this.x.length = this.y.length = this.z.length = this.c.length = 0;
    let acc = 0;
    pts.forEach((p, i) => {
      if (i) acc += Math.hypot(p.x - this.x[i - 1], p.y - this.y[i - 1], p.z - this.z[i - 1]);
      this.x.push(p.x); this.y.push(p.y); this.z.push(p.z); this.c.push(acc);
    });
  }
  get length() { const n = this.c.length; return n ? this.c[n - 1] - this.c[0] : 0; }
  head(out) { const n = this.x.length - 1; return out.set(this.x[n], this.y[n], this.z[n]); }
  // 头移到 p：离上一个点不足 step 时只挪动末点（头一直在最新的位置）
  push(p) {
    const n = this.x.length;
    if (!n) { this.reset([p]); return; }
    const d = Math.hypot(p.x - this.x[n - 1], p.y - this.y[n - 1], p.z - this.z[n - 1]);
    const d2 = n > 1 ? Math.hypot(p.x - this.x[n - 2], p.y - this.y[n - 2], p.z - this.z[n - 2]) : Infinity;
    if (n > 1 && d2 < this.step) { this.x[n - 1] = p.x; this.y[n - 1] = p.y; this.z[n - 1] = p.z; this.c[n - 1] = this.c[n - 2] + d2; }
    else { this.x.push(p.x); this.y.push(p.y); this.z.push(p.z); this.c.push(this.c[n - 1] + d); }
    // 丢掉用不到的尾巴
    const L = this.c[this.c.length - 1];
    let k = 0;
    while (k < this.c.length - 2 && L - this.c[k + 1] > this.maxLen) k++;
    if (k > 64) { for (const a of [this.x, this.y, this.z, this.c]) a.splice(0, k); }
  }
  // 头后方弧长 s 处的点（超出最旧的点时沿最后一段外推）
  at(s, out) {
    const c = this.c, n = c.length;
    if (n === 1) return out.set(this.x[0], this.y[0], this.z[0]);
    const want = c[n - 1] - s;
    let i;
    if (want <= c[0]) i = 0;
    else { let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= want) lo = m; else hi = m; } i = lo; }
    const seg = Math.max(1e-6, c[i + 1] - c[i]), u = (want - c[i]) / seg;
    return out.set(this.x[i] + (this.x[i + 1] - this.x[i]) * u, this.y[i] + (this.y[i + 1] - this.y[i]) * u, this.z[i] + (this.z[i + 1] - this.z[i]) * u);
  }
}

function makeUniforms() {
  const C = DRAGON.colors, c = (h) => new THREE.Color(h);
  return {
    uSilver: { value: c(C.silver) }, uArcC: { value: c(C.arc) }, uCore: { value: c(C.core) },
    uRim: { value: 0.55 }, uArc: { value: 0.25 }, uFlash: { value: 0 }, uDissolve: { value: 0 }, uTime: { value: 0 }, uFade: { value: 1 },
    uZ: { value: new THREE.Vector2(-1, 1) },          // 静止姿势里网格的 z 范围（头 +z，尾 −z）：消散由头向尾
  };
}
function loongMaterial(src, U) {
  const m = new THREE.MeshStandardMaterial({ map: src.map, normalMap: src.normalMap, roughnessMap: src.roughnessMap, metalnessMap: src.metalnessMap,
    roughness: 1, metalness: 1, side: THREE.DoubleSide, alphaTest: 0.45, transparent: false, envMapIntensity: 1.2 });
  if (m.normalMap) m.normalScale.set(1, 1);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLb;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vLb = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uSilver, uArcC, uCore; uniform float uRim, uArc, uFlash, uDissolve, uTime, uFade; uniform vec2 uZ; varying vec3 vLb;
        float lgH(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float lgN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
          return mix(mix(mix(lgH(i), lgH(i + vec3(1, 0, 0)), f.x), mix(lgH(i + vec3(0, 1, 0)), lgH(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(lgH(i + vec3(0, 0, 1)), lgH(i + vec3(1, 0, 1)), f.x), mix(lgH(i + vec3(0, 1, 1)), lgH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`)
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
        float lgEdge = 0.;
        {
          // 消散：由头（静止姿势 z 大）向尾烧尽，烧到的边缘亮起电光
          if (uDissolve > 0.) {
            float zn = clamp((vLb.z - uZ.x) / (uZ.y - uZ.x), 0., 1.);
            float n = lgN(vLb * 260. + vec3(0., uTime * 2., 0.));
            float th = uDissolve * 1.35 - (1. - zn) * 1.05 + (n - .5) * .3;
            if (th > 0. && n < th * 2.) discard;
            lgEdge = smoothstep(.16, 0., abs(n - th * 2.)) * step(.01, uDissolve);
          }
          if (uFade < .999) { float d = fract(dot(gl_FragCoord.xy, vec2(.0671, .5831)) * 52.98); if (d > uFade) discard; }
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float rim = pow(1. - abs(dot(normal, normalize(vViewPosition))), 2.4);
          // 细电弧：沿鳞片走的噪声细线（静止姿势坐标里），随时间游走；uArc 平时很弱，落雷、俯冲时一闪
          vec3 q = vLb * 180. + vec3(uTime * 1.7, -uTime * 2.3, uTime * .9);
          float a1 = abs(lgN(q) - .5), a2 = abs(lgN(q * 2.1 + 7.3) - .5);
          float vein = smoothstep(.035, .0, a1) * (.6 + .4 * smoothstep(.06, .0, a2));
          totalEmissiveRadiance += uSilver * rim * uRim + mix(uArcC, uCore, vein * .6) * vein * uArc * 2.2 + uCore * (uFlash * (.25 + rim) + lgEdge * 3.);
        }`);
  };
  m.customProgramCacheKey = () => 'loong-r23';
  return m;
}

export class LoongRig {
  // gltf：assets/converted/loong/loong.glb；length：整条龙（吻尖到尾梢）的长度（米）
  constructor(gltf, { length = DRAGON.model.length } = {}) {
    this.root = new THREE.Group();
    this.root.name = 'loong';
    this.model = cloneSkinned(gltf.scene);
    this.root.add(this.model);
    this.U = makeUniforms();
    this.meshes = []; this.materials = [];
    const mats = new Map();
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      const src = o.material;
      if (!mats.has(src)) mats.set(src, loongMaterial(src, this.U));
      o.material = mats.get(src);
      o.frustumCulled = false;                 // 蒙皮网格的包围盒不随骨骼更新
      o.castShadow = true; o.receiveShadow = false;
      this.meshes.push(o);
    });
    this.materials = [...mats.values()];
    this.bones = {};
    this.model.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });
    const miss = CHAIN.filter((n) => !this.bones[n]);
    if (miss.length) throw new Error('雷龙骨骼缺少：' + miss.join(','));
    // ---------- 静止姿势（根节点在原点、尺度 1）：每节脊骨的位置、世界朝向、世界尺度、离头骨的弧长 ----------
    this.model.updateMatrixWorld(true);
    this.chain = CHAIN.map((n) => this.bones[n]);
    this.rest = this.chain.map((b) => {
      b.matrixWorld.decompose(_v, _q, _s);
      return { p: _v.clone(), q: _q.clone(), s: _s.clone() };
    });
    let acc = 0;
    this.arc = this.rest.map((r, i) => { if (i) acc += r.p.distanceTo(this.rest[i - 1].p); return acc; });
    // 网格的 z 范围（吻尖 → 尾梢）与吻尖离头骨多远；整条龙的长度 → 尺度
    const geo = this.meshes[0].geometry;
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    // 网格顶点在网格自己的坐标里；换到模型（根）坐标量吻尖：取静止姿势下的蒙皮位置
    const sm = this.meshes[0], pos = geo.attributes.position, wv = new THREE.Vector3();
    let zmin = Infinity, zmax = -Infinity, snout = null;
    for (let i = 0; i < pos.count; i += 3) {
      sm.getVertexPosition(i, wv); wv.applyMatrix4(sm.matrixWorld);
      if (wv.z > zmax) { zmax = wv.z; snout = wv.clone(); }
      if (wv.z < zmin) zmin = wv.z;
    }
    this.U.uZ.value.set(bb.min.z, bb.max.z);
    this.restLen = zmax - zmin;
    this.k = length / this.restLen;                              // 模型 → 米
    this.snoutLen = (snout.z - this.rest[0].p.z) * this.k;       // 吻尖在头骨前方多远（米）
    this.bodyLen = this.arc[this.arc.length - 1] * this.k;       // 头骨到尾梢骨（米）
    this.model.scale.setScalar(this.k);
    this.restY = this.rest[0].p.y * this.k;                      // 脊柱离模型原点的高度（米）
    // ---------- 动作：四肢、须鬃、下颌（去掉脊柱、枢纽的轨道，脊柱由轨迹摆）----------
    this.mixer = new THREE.AnimationMixer(this.model);
    const pick = (name) => {
      const c = gltf.animations.find((a) => a.name === name);
      if (!c) return null;
      const cc = c.clone();
      cc.tracks = cc.tracks.filter((t) => !NOANIM.has(t.name.split('.')[0]) && !t.name.endsWith('.scale'));
      return cc;
    };
    this.clips = { run: pick('run'), idle: pick('idle') };
    this.act = {};
    for (const [k, c] of Object.entries(this.clips)) if (c) { this.act[k] = this.mixer.clipAction(c); this.act[k].play(); this.act[k].setEffectiveWeight(k === 'run' ? 1 : 0); }
    // 下颌、前后腿的根（俯冲时前爪往前探；张口）：静止的本地朝向
    this.jaw = this.bones.Bone192 || null;
    this.legs = ['Bone128', 'Bone258', 'Bone113', 'Bone362'].map((n) => this.bones[n]).filter(Boolean);
    this.legRest = this.legs.map((b) => b.quaternion.clone());
    // 头的「前、上」在头骨本地的方向（由静止姿势求：前 = 模型 +Z、上 = 模型 +Y）
    const qi = this.rest[0].q.clone().invert();
    this.headFwdL = new THREE.Vector3(0, 0, 1).applyQuaternion(qi).normalize();
    this.headUpL = new THREE.Vector3(0, 1, 0).applyQuaternion(qi).normalize();
    this.trail = new Trail(this.bodyLen + 8);
    this.ups = this.chain.map(() => new THREE.Vector3(0, 1, 0));
    this.headUp = new THREE.Vector3(0, 1, 0);
    this.look = { dir: null, w: 0 };            // 头额外看向（世界方向），权重
    this.st = { jaw: 0, claw: 0, swim: 1, bank: 0 };
    this.clip = new THREE.Plane(new THREE.Vector3(0, 0, 1), 1e5);
    for (const m of this.materials) m.clippingPlanes = [this.clip];
    this.root.visible = false;
  }
  // 吻尖（世界坐标，按此刻的头骨）
  snout(out) {
    this.chain[0].getWorldPosition(out);
    return out.addScaledVector(this.headDir(_w), this.snoutLen);
  }
  headDir(out) { return out.copy(this.headFwdL).applyQuaternion(this.chain[0].getWorldQuaternion(_q2)).normalize(); }
  // 裁切：plane 为 null 时不裁（平面移到极远处——不改着色器的裁切面个数，免得重新编译）
  setClip(normal = null, point = null) {
    if (!normal) { this.clip.normal.set(0, 0, 1); this.clip.constant = 1e5; return; }
    this.clip.setFromNormalAndCoplanarPoint(normal, point);
  }

  // =====================================================================================
  // 摆姿势：脊柱按轨迹；dt 推进动作；o：{ swim 划动快慢, jaw 张口 0…1, claw 前爪前探 0…1, look { dir, w }, arc, flash, dissolve, fade }
  // =====================================================================================
  pose(dt, o = {}) {
    const S = this.st;
    if (o.jaw != null) S.jaw += (o.jaw - S.jaw) * Math.min(1, dt * 10);
    if (o.claw != null) S.claw += (o.claw - S.claw) * Math.min(1, dt * 8);
    this.mixer.timeScale = o.swim ?? 1;
    this.mixer.update(dt);
    // 前爪前探（俯冲）：腿根绕身体的横轴往前转；张口：下颌往下转——都在动作给出的本地朝向之上叠加，每帧重算
    this.legs.forEach((b, i) => { if (S.claw > 0.01) { _q.setFromAxisAngle(_r.set(1, 0, 0), (i < 2 ? -1.0 : -0.5) * S.claw); b.quaternion.multiply(_q); } });
    if (this.jaw && S.jaw > 0.01) { _q.setFromAxisAngle(_r.set(1, 0, 0), 0.55 * S.jaw); this.jaw.quaternion.multiply(_q); }
    this.root.updateMatrixWorld(true);
    this.spine(o.look);
    // 材质
    const U = this.U;
    U.uTime.value += dt;
    if (o.arc != null) U.uArc.value = o.arc;
    U.uFlash.value = Math.max(o.flash ?? 0, U.uFlash.value - dt * 3);
    U.uDissolve.value = o.dissolve ?? 0;
    U.uFade.value = o.fade ?? 1;
  }
  // 每节脊骨：位置 = 轨迹上同样弧长处；朝向 = 那里的切线（朝头）、上方向、侧倾；世界目标 → 本地（父骨先算）
  spine(look) {
    const T = this.trail, k = this.k, n = this.chain.length, d = 0.35;
    const P = this._P ||= this.chain.map(() => new THREE.Vector3()), F = this._F ||= this.chain.map(() => new THREE.Vector3());
    for (let i = 0; i < n; i++) {
      const s = this.arc[i] * k;
      T.at(s, P[i]);
      T.at(Math.max(0, s - d), _v); T.at(s + d, _w);
      F[i].subVectors(_v, _w);
      if (F[i].lengthSq() < 1e-8) F[i].copy(i ? F[i - 1] : _f.set(0, 0, 1)); else F[i].normalize();
    }
    // 头额外看向（蓄势、俯冲时看着落点）：头与颈逐节过渡
    // 目标在身后（与头的去向夹角大）时不硬扭头：按夹角减弱，免得颈子折过来
    if (look?.dir && look.w > 0) {
      const al = clamp((F[0].dot(look.dir) + 0.3) / 1.3, 0, 1);
      for (let i = 0; i < 7; i++) { const w = look.w * al * (1 - i / 7); if (w > 1e-3) F[i].lerp(look.dir, w).normalize(); }
    }
    for (let i = 0; i < n; i++) {
      // 上方向：世界上方对切线正交化；切线几乎竖直时沿身体平行移动上一节的
      const f = F[i], up = this.ups[i];
      const prev = i ? this.ups[i - 1] : this.headUp;
      if (Math.abs(f.dot(Y)) < 0.94) up.copy(Y).addScaledVector(f, -f.dot(Y)).normalize();
      else up.copy(prev).addScaledVector(f, -f.dot(prev)).normalize();
      // 侧倾：这一段水平弯向哪边就往哪边倒（游动的蛇身）
      const fa = F[Math.max(0, i - 2)], fb = F[Math.min(n - 1, i + 2)];
      const turn = Math.atan2(fa.x * fb.z - fa.z * fb.x, fa.x * fb.x + fa.z * fb.z);       // 水平转角（朝头一侧相对朝尾一侧）
      const bank = clamp(turn * 1.6, -0.7, 0.7);
      if (Math.abs(bank) > 1e-3) up.applyAxisAngle(f, bank).normalize();
      if (i === 0) this.headUp.copy(up);
      // 基 [右, 上, 前] → 四元数；世界朝向 = 基 × 静止的世界朝向
      _r.crossVectors(up, f).normalize();
      _u.crossVectors(f, _r);
      _m.makeBasis(_r, _u, f);
      _q.setFromRotationMatrix(_m).multiply(this.rest[i].q);
      _s.copy(this.rest[i].s).multiplyScalar(k);
      (this._W ||= this.chain.map(() => new THREE.Matrix4()))[i].compose(P[i], _q, _s);
    }
    // 世界目标 → 本地：链的顺序是头 → 颈 → 枢纽 → 身尾，颈骨的父是离枢纽近的那一节——按「父先于子」的顺序换算
    for (const i of (this._order ||= this.orderChain())) {
      const b = this.chain[i], W = this._W[i];
      _m2.copy(b.parent.matrixWorld).invert().multiply(W);
      _m2.decompose(b.position, b.quaternion, b.scale);
      b.matrix.copy(_m2);
      b.matrixWorld.copy(W);
    }
    // 链外的骨（腿、须、鬃、下颌）跟着各自的父骨
    for (const b of this.chain) for (const c of b.children) if (!this._inChain(c)) c.updateMatrixWorld(true);
  }
  _inChain(o) { return (this._set ||= new Set(this.chain)).has(o); }
  // 父骨先于子骨的计算顺序（链里的下标）：Bone308（枢纽）→ 044…049 → Bone318（头）；Bone308 → 018 … 042
  orderChain() {
    const set = new Set(this.chain), order = [], seen = new Set();
    const visit = (b) => { if (seen.has(b)) return; if (set.has(b.parent)) visit(b.parent); seen.add(b); order.push(b); };
    for (const b of this.chain) visit(b);
    return order.map((b) => this.chain.indexOf(b));
  }
}
