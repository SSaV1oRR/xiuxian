// 剑诀特效（第十四轮）：各招式在哪一刻放什么光、什么烟，都在这里编排（画法见 world/vfx.js）。
// 配色：寻常剑招青白（剑光 #8fe6ff、芯 #eaffff）；破岳、万剑归宗金白（#f5c86a、#fff1c8）；弹反金；魔修暗红；尘土灰黄。
//   slashArc  出剑那一刻身前一道月牙刀光（按招式的倾角斜劈、横扫、上撩），大招多一层旋风弧与地面光环
//   hit       命中：星芒、光环、四溅的火花（背向出剑者），重击多一团焦光与烟
//   slam      破岳末式：三层冲击波、焦痕、烟环、碎土、一道光柱
//   wave*     剑气·新月：随剑气飞行的月牙（两层）与沿途的流光
//   dash*     惊鸿掠影：起步扬尘、身后残影与风痕、收步光环
//   ult*      万剑归宗：地上剑阵（七芒阵、外环、罗盘纹）、升腾的灵光、天降飞剑（落地插入地面、片刻后化光散去）、末了的巨剑
//   parry / block / pill / death / marker / flash / deny
// 第十七轮：刀光一律是跟着真实剑刃的拖尾（不再在身前贴固定的月牙图）；火星迸在接触点；撞墙有火星；剑气是一道立体的月牙随剑气飞行；
//   缚灵锁的锁链、被缚住的金环、「危」字与金光提示、玩家范围招式的地面圈（外沿 = 伤害半径）、几盏短命的点光都在 combatFx.js。
// 第十九轮：蓄力重击的特效换成拔刀斩（iai*：灵光向鞘口汇聚、每过一档鞘口一圈光、出鞘一点寒芒、前冲的残影）；回血葫芦（gourd）。
// 第二十轮：普攻四式与拔刀斩改成水墨（game/inkFx.js：沿剑的真实轨迹铺开的墨弧、命中处的墨溅、拔刀斩蓄力时向剑柄汇聚的墨点墨雾、出刀时扫开到判定距离的月牙墨）；
//   这几招不再用青色的剑光拖尾。水墨素材没载入时照旧用第十七轮的拖尾与火星。
// 第二十二轮：万剑归宗的飞剑与巨剑用施法时手中的那把剑（UltKit：实例化、共用几何体与贴图、材质副本叠金色边光与溶解）——
//   聚剑成阵（剑阵上空 4 米两圈，刀尖朝下）→ 飞剑按原来的时刻、落点刀尖朝前落下插地 → 同一把剑放大成巨剑悬于阵心上空、落下镇阵；
//   九霄凤焰的舞刀拖金红刀光（沿用原来的拖尾，只换颜色与亮的时段）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LightPool, Crescents, Chains, Binds, Tells, GroundRings } from './combatFx.js';
import { INK } from './combatConfig.js';

const CY = { glow: 0x8fe6ff, core: 0xeaffff, deep: 0x4fb8e8 };
const GD = { glow: 0xf5c86a, core: 0xfff1c8, deep: 0xe09a3a };
const PX = { glow: 0xe9762f, core: 0xffe0a0 };          // 第二十二轮：九霄凤焰的舞刀——金红刀光
const R = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3();

// 柔光贴图（「危」字旁的金光用）
let GLOW_TEX = null;
function glowTex() {
  if (GLOW_TEX) return GLOW_TEX;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  GLOW_TEX = new THREE.CanvasTexture(cv);
  return GLOW_TEX;
}

// 飞剑（光剑）：剑身、剑尖、剑格合成一个几何；芯与外晕两层加色
let SWORD_GEO = null, SWORD_GLOW_GEO = null;
function swordGeo() {
  if (SWORD_GEO) return SWORD_GEO;
  const blade = new THREE.BoxGeometry(0.075, 1.25, 0.018); blade.translate(0, 0.725, 0);
  const tip = new THREE.ConeGeometry(0.053, 0.2, 4); tip.scale(1, 1, 0.25); tip.rotateY(Math.PI / 4); tip.translate(0, 1.45, 0);
  const guard = new THREE.BoxGeometry(0.22, 0.04, 0.06); guard.translate(0, 0.08, 0);
  const grip = new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6); grip.translate(0, -0.05, 0);
  SWORD_GEO = mergeGeometries([blade.toNonIndexed(), tip.toNonIndexed(), guard.toNonIndexed(), grip.toNonIndexed()]);
  SWORD_GLOW_GEO = new THREE.BoxGeometry(0.3, 1.7, 0.12); SWORD_GLOW_GEO.translate(0, 0.72, 0);
  return SWORD_GEO;
}

// ---------- 第二十二轮：万剑归宗用当前佩剑 ----------
// 施法那一刻记下手中这把剑（id、模型、材质、贴图）：飞剑与巨剑都用它（不另载 FBX、不用通用的光剑）；中途换剑不改已放出的剑，下一次才换。
// 「剑阵套件」按剑的 id 缓存（最多 ULT.keep 份）：剑的每个网格一个 InstancedMesh（26 柄飞剑 + 1 柄巨剑，巨剑只是放大）——
//   几何体另包一层、共用顶点与索引缓冲（不复制、不改手中剑的几何体），材质各复制一份（贴图共用，不动手中剑的材质），
//   多一个逐实例属性 aFx（x 金色边光、y 溶解）；着色器里在原材质上叠一层金色边光与溶解的亮边，不把整把剑涂成一根发光条。
// 剑的朝向按模型自己的几何量出：剑首（最低点）→ 剑尖（最高点）的连线是真实的剑尖方向（弯刀的剑尖不在 +Y 轴上），飞剑刀尖朝前落下、插进地里。
// 引用计数：施法开始 armory.acquire，最后一柄化光散去 armory.release——这期间换剑不会把这把剑的显存释放掉。
// len / giantLen：飞剑、巨剑的长度（米，按模型的剑首到剑尖量出的长度缩放——细长的太刀与宽大的巨剑在常规镜头里一样看得清）；
// formH：剑阵里剑尖离地的高度（常规的背后视角里整圈剑都在画面里）；rings：[柄数, 半径, 高出]
const ULT = { n: 27, giant: 26, len: 2.3, giantLen: 9, stick: 0.2, formH: 3.2, rings: [[10, 2.2, 0.45], [16, 4.0, 0]], show: [0.03, 0.24], fadeIn: 0.16,
  giantShow: 1.45, giantH: 9.5, fall: 0.42, giantFall: 0.5, keep: 4 };
const _m4 = new THREE.Matrix4(), _m5 = new THREE.Matrix4(), _s3 = new THREE.Vector3(), _q4 = new THREE.Quaternion(), _q5 = new THREE.Quaternion(), _p4 = new THREE.Vector3(), _c4 = new THREE.Vector3();
function ultMaterial(src) {
  const m = src.clone();                                   // 贴图、法线图共用（clone 只复制引用）
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aFx; varying vec2 vUltFx; varying vec3 vUltP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUltFx = aFx; vUltP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vUltFx; varying vec3 vUltP;
        float ultHash(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float ultN = ultHash(floor(vUltP * 70.)), ultEdge = 0.;
        if (vUltFx.y > 0.001) { if (ultN < vUltFx.y) discard; ultEdge = smoothstep(vUltFx.y + .14, vUltFx.y, ultN); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float rim = pow(1. - abs(dot(normal, normalize(vViewPosition))), 2.2);
          totalEmissiveRadiance += vec3(1., .74, .34) * (vUltFx.x * (.08 + rim * 1.05)) + vec3(1., .9, .62) * ultEdge * 2.4; }`);
  };
  m.customProgramCacheKey = () => 'ultsword-r22';
  return m;
}
class UltKit {
  // root：手中那把剑的克隆（与剑器模板共用几何体与材质）
  constructor(id, def, root) {
    this.id = id; this.def = def; this.parts = []; this.users = 0;
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), v = new THREE.Vector3();
    let hi = null, lo = null;
    root.traverse((o) => {
      if (!o.isMesh) return;
      const local = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), src = o.geometry;
      const g = new THREE.BufferGeometry();
      if (src.index) g.setIndex(src.index);
      const shared = Object.keys(src.attributes);
      for (const k of shared) g.setAttribute(k, src.attributes[k]);
      for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
      const fx = new THREE.InstancedBufferAttribute(new Float32Array(ULT.n * 2), 2).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aFx', fx);
      const mats = [].concat(o.material).map(ultMaterial);
      const mesh = new THREE.InstancedMesh(g, Array.isArray(o.material) ? mats : mats[0], ULT.n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = false; mesh.count = 0; mesh.name = `ult-${id}`;
      this.parts.push({ mesh, local, fx, shared, mats });
      const pos = src.attributes.position;
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(local); if (!hi || v.y > hi.y) hi = v.clone(); if (!lo || v.y < lo.y) lo = v.clone(); }
    });
    this.tipL = hi; this.endL = lo;
    this.axis = hi.clone().sub(lo).normalize();            // 剑首 → 剑尖
    this.len = hi.distanceTo(lo);
  }
  // 第 i 个实例：剑尖在世界的 tip，朝向 q，尺度 s；glow 边光，dis 溶解（≥ 1 时整柄收起，连影子也不投）
  set(i, tip, q, s, glow, dis) {
    if (dis >= 0.999) { _m4.makeScale(0, 0, 0); for (const p of this.parts) { p.mesh.setMatrixAt(i, _m4); p.fx.setXY(i, 0, 1); } return; }
    _m4.compose(_p4.set(0, 0, 0), q, _s3.set(s, s, s));
    const off = _s3.copy(this.tipL).multiplyScalar(-s).applyQuaternion(q);
    _m4.setPosition(tip.x + off.x, tip.y + off.y, tip.z + off.z);
    for (const p of this.parts) { _m5.multiplyMatrices(_m4, p.local); p.mesh.setMatrixAt(i, _m5); p.fx.setXY(i, glow, dis); }
  }
  flush(n) { for (const p of this.parts) { p.mesh.count = n; p.mesh.instanceMatrix.needsUpdate = true; p.fx.needsUpdate = true; } }
  addTo(scene) { for (const p of this.parts) if (p.mesh.parent !== scene) scene.add(p.mesh); }
  // 剑尖朝 d（剑首 → 剑尖对准 d），再绕 d 转到剑面法线（剑的本地 +Z）尽量朝着 face（水平）
  orient(d, face, out) {
    out.setFromUnitVectors(this.axis, d);
    const n = _s3.set(0, 0, 1).applyQuaternion(out), f = _p4.copy(face).addScaledVector(d, -face.dot(d));
    n.addScaledVector(d, -n.dot(d));
    if (n.lengthSq() > 1e-8 && f.lengthSq() > 1e-8) {
      n.normalize(); f.normalize();
      const ang = Math.atan2(_c4.crossVectors(n, f).dot(d), n.dot(f));
      out.premultiply(_q5.setFromAxisAngle(d, ang));
    }
    return out;
  }
  // 拆掉：先把共用的顶点缓冲从包装几何体上摘下来（不然 dispose 会连手中剑的缓冲一起从显卡上删掉），再释放包装、材质副本、实例缓冲
  dispose() {
    for (const p of this.parts) {
      p.mesh.parent?.remove(p.mesh);
      const g = p.mesh.geometry;
      for (const k of p.shared) g.deleteAttribute(k);
      g.setIndex(null);
      g.dispose();
      for (const m of p.mats) m.dispose();
      p.mesh.dispose?.();
    }
    this.parts.length = 0;
  }
}

export class SkillFx {
  // vfx：world/vfx.js；player：修士；hud：战斗界面（deny 提示）；groundAt(x, z, y)：地面高度
  constructor(vfx, { player, hud = null, groundAt, scene, ink = null }) {
    this.vfx = vfx; this.player = player; this.hud = hud; this.groundAt = groundAt; this.scene = scene;
    this.ink = ink;              // 第二十轮：水墨特效（InkFx；没载入时为 null）
    this.trailOn = false; this.gold = false;
    this.tip = new THREE.Vector3(); this.base = new THREE.Vector3();
    this.swords = [];            // 万剑归宗的飞剑（没有佩剑模型时的通用光剑）
    this.ult = null;
    this.armory = null;          // 第二十二轮：剑器（引用计数）；main.js 接上
    this.kits = new Map();       // 剑的 id → 剑阵套件（最近用过的几把）
    this.uc = null;              // 这一次万剑归宗的飞剑（用佩剑）
    this.waves = [];
    this.marker = this.buildMarker();
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'fx-flash';
    document.querySelector('#hud')?.appendChild(this.flashEl);
    // 第十七轮：立体特效（预先建好、循环取用）
    this.lights = new LightPool(scene, 2);
    this.crescents = new Crescents(scene, 6);
    this.chains = new Chains(scene);
    this.binds = new Binds(scene, 6);
    this.tells = new Tells(scene, glowTex(), 8);
    this.rings = new GroundRings(scene, 4);
    this.iai = null;
  }
  moveTo(scene) {
    this.scene = scene;
    scene.add(this.marker.ring); scene.add(this.marker.pin);
    for (const s of this.swords) scene.add(s.g);
    for (const k of this.kits.values()) k.addTo(scene);
    for (const k of ['lights', 'crescents', 'chains', 'binds', 'tells', 'rings']) { this[k].moveTo(scene); this[k].clear(); }
    this.ink?.moveTo(scene);
  }
  get V() { return this.vfx; }
  fwd(P) { return _f.set(Math.sin(P.heading), 0, Math.cos(P.heading)); }

  // ---------- 招式起止：剑光拖尾（跟着真实剑刃；出手段亮、前摇与收势暗）----------
  moveStart(key, a) {
    this.trailOn = !['dodge', 'pill', 'gourd', 'knockdown', 'guard', 'react', 'iai', 'seal'].includes(key);
    // 第二十轮：普攻与拔刀斩——水墨刀光沿剑的真实轨迹铺（不再拖青色的剑光）
    if (this.ink && INK.slash[key] && this.ink.swingStart(a)) this.trailOn = false;
    this.gold = key === 'heavy' || key === 'ult' || key === 'iai_slash' || (key === 'light4');
    const T = this.V.trail;
    if (!(a?.def?.next && key.startsWith('light'))) T.clear();
    T.color.set(this.gold ? GD.glow : CY.glow); T.core.set(this.gold ? GD.core : CY.core);
    T.span = key === 'iai_slash' ? 0.28 : key === 'light4' ? 0.24 : key === 'heavy' ? 0.2 : 0.16;
    if (key === 'phoenix') { T.color.set(PX.glow); T.core.set(PX.core); T.span = 0.22; }
    this.act = a || null;
  }
  moveEnd(key, a, reason) { this.trailOn = false; this.act = null; if (a) this.ink?.swingEnd(a, reason); }
  // 发力的一瞬：重招在剑尖处卷起一阵气浪
  swing(a) {
    if (!(a.key === 'light4' || a.key === 'iai_slash') || this.ink) return;
    const P = this.player;
    P.char.bladeEnds(this.tip, this.base);
    this.V.spawn({ p: this.tip.clone(), tile: 'twirl', size: [0.4, 1.6], life: 0.25, color: GD.glow, alpha: 0.35, spin: 4, rot: R(0, 6) });
  }

  // ---------- 刀光 ----------
  slashArc(P, a, def) {
    const gold = !!def.gold, C = gold ? GD : CY, s = a.size, big = !!a.big;
    const f = this.fwd(P), right = _u.set(-Math.cos(P.heading), 0, Math.sin(P.heading));
    // 刀光平面：以朝向为轴把「右」转过倾角；月牙的弧顶朝前
    const ct = Math.cos(a.tilt), st = Math.sin(a.tilt);
    const U = new THREE.Vector3(right.x * ct, st, right.z * ct), W = f.clone();
    const c = _v.set(P.pos.x + f.x * 0.55, P.pos.y + (a.lift ?? 1), P.pos.z + f.z * 0.55);
    const V = this.V;
    V.spawn({ p: c, tile: 'slashH', mode: 2, u: U, w: W, size: [s * 0.82, s * 1.12], life: 0.24, color: C.glow, alpha: 1, fadeIn: 0.08, early: true });
    V.spawn({ p: c, tile: 'slashH', mode: 2, u: U, w: W, size: [s * 0.78, s * 0.98], life: 0.15, color: C.core, alpha: 0.9, fadeIn: 0.05, early: true });
    V.spawn({ p: c, tile: 'slashLow', mode: 2, u: U, w: W.clone().negate(), size: [s * 1.05, s * 1.35], life: 0.3, color: C.deep, alpha: 0.55, fadeIn: 0.1 });
    // 沿刀弧甩出的光屑
    for (let i = 0; i < V.n(big ? 12 : 6); i++) {
      const k = R(-0.9, 0.9), r = s * 0.42;
      const p = c.clone().addScaledVector(U, Math.sin(k) * r).addScaledVector(W, Math.cos(k) * r * 0.55);
      const v = U.clone().multiplyScalar(Math.sin(k) * R(4, 8)).addScaledVector(W, R(3, 7)).add(_w.set(0, R(-1, 2), 0));
      V.spawn({ p, v, tile: 'trace', mode: 1, size: R(0.07, 0.12), stretch: 0.05, life: R(0.18, 0.32), drag: 3, color: C.core, alpha: 0.9 });
    }
    if (big) {
      V.spawn({ p: c, tile: 'twirl', mode: 2, u: U, w: W, size: [s * 0.9, s * 1.5], life: 0.38, spin: 2.5, color: C.glow, alpha: 0.7, fadeIn: 0.1 });
      const g = this.groundAt(P.pos.x, P.pos.z, P.pos.y + 1);
      V.spawn({ p: _w.set(P.pos.x + f.x, g + 0.06, P.pos.z + f.z), tile: 'ringSoft', mode: 3, size: [1.2, 6.5], life: 0.45, color: C.glow, alpha: 0.65 });
      this.dust(P.pos.x + f.x * 0.6, g, P.pos.z + f.z * 0.6, 7, 4.5);
    }
  }

  // ---------- 第十七轮：命中——火星迸在接触点，顺着剑的去向飞；轻 / 重 / 突刺 / 被挡 / 免疫各不相同 ----------
  // ink（第二十轮）：普攻、拔刀斩、拔刀斩的剑气——命中处一团墨（墨溅、墨花、墨点、一点白光），不迸青色火星；ik：拔刀斩的蓄力
  hitFx(e, at, { kind = 'light', result = 'hit', gold = false, counter = false, dir = null, ink = false, ik = 0, key = null } = {}) {
    const V = this.V, p = at.clone(), C = gold || counter ? GD : CY;
    const d = (dir ? dir.clone() : new THREE.Vector3(0, 0, 1)).normalize();
    if (ink && this.ink && result !== 'immune' && result !== 'block') { this.ink.hit(p, d, { heavy: kind === 'heavy', thrust: kind === 'thrust', k: ik, key, crit: counter }); return; }
    if (result === 'immune') {
      V.spawn({ p, tile: 'ringSoft', size: [0.3, 1.0], life: 0.2, color: 0x9aa4ad, alpha: 0.45 });
      return;
    }
    if (result === 'block') {
      // 对手举剑挡住：白色的小火星、一圈青光，没有血雾
      V.spawn({ p, tile: 'starSharp', size: [0.25, 0.9], life: 0.12, color: 0xffffff, alpha: 1, rot: R(0, 3) });
      for (let i = 0; i < V.n(8); i++) V.spawn({ p, v: new THREE.Vector3(-d.x + R(-1, 1), R(0, 1.2), -d.z + R(-1, 1)).normalize().multiplyScalar(R(4, 8)), tile: 'trace', mode: 1, size: R(0.05, 0.09), stretch: 0.04, gravity: 9, life: R(0.15, 0.28), color: 0xf2fbff, alpha: 1 });
      this.lights.pulse(p, 0xcff2ff, 2.5, 0.12);
      return;
    }
    const heavy = kind === 'heavy', k = heavy ? 1.55 : kind === 'thrust' ? 1.15 : 1;
    V.spawn({ p, tile: 'starSharp2', size: [0.4 * k, 1.25 * k], life: 0.13, color: C.core, rot: R(0, 3), alpha: 1 });
    V.spawn({ p, tile: 'flare', size: 1.0 * k, life: 0.09, color: C.glow, alpha: 0.42 });
    // 火星顺着剑的去向（与身体表面的法线一起）甩出去
    const nrm = new THREE.Vector3(p.x - e.pos.x, 0, p.z - e.pos.z).normalize();
    for (let i = 0; i < V.n(heavy ? 14 : 8); i++) {
      const v = d.clone().multiplyScalar(R(0.6, 1.2)).addScaledVector(nrm, R(0.2, 0.9)).add(_v.set(R(-0.4, 0.4), R(-0.1, 0.9), R(-0.4, 0.4))).normalize().multiplyScalar(R(5, 12));
      V.spawn({ p, v, tile: 'trace', mode: 1, size: R(0.06, 0.13), stretch: 0.045, gravity: 9, drag: 2.2, life: R(0.16, 0.32), color: i % 3 ? C.core : C.glow, alpha: 1 });
    }
    // 受击者身上一道斩痕（贴着剑的去向）
    V.spawn({ p, tile: kind === 'thrust' ? 'starCross' : 'slashH', mode: kind === 'thrust' ? 0 : 2, u: d.clone(), w: _w.set(0, 1, 0), size: [0.5 * k, 1.1 * k], life: 0.16, color: C.glow, alpha: 0.7, fadeIn: 0.02 });
    if (heavy) {
      V.spawn({ p, tile: 'scorch', size: [1.0, 2.6], life: 0.16, color: C.glow, alpha: 0.7, rot: R(0, 6) });
      for (let i = 0; i < 2; i++) V.spawn({ p: p.clone().add(_v.set(R(-0.3, 0.3), R(-0.3, 0.2), R(-0.3, 0.3))), v: _v.set(R(-1, 1), R(0.5, 1.5), R(-1, 1)), tile: 'smoke', blend: 'alpha', size: [0.5, 1.4], life: 0.7, drag: 2, color: 0xd8dde0, alpha: 0.3, rot: R(0, 6), spin: R(-1, 1) });
      this.lights.pulse(p, C.glow, 3, 0.16);
    }
  }
  // 剑身扫进墙里：石屑火星、一点灰
  wallHit(p, d) {
    const V = this.V;
    V.spawn({ p, tile: 'starSharp', size: [0.2, 0.8], life: 0.1, color: 0xfff2d8, alpha: 1, rot: R(0, 3) });
    for (let i = 0; i < V.n(9); i++) V.spawn({ p, v: new THREE.Vector3(-d.x + R(-0.8, 0.8), R(0, 1), -d.z + R(-0.8, 0.8)).normalize().multiplyScalar(R(3, 8)), tile: 'trace', mode: 1, size: R(0.04, 0.08), stretch: 0.04, gravity: 12, life: R(0.18, 0.35), color: 0xffd9a0, alpha: 1 });
    for (let i = 0; i < V.n(3); i++) V.spawn({ p, v: _v.set(R(-0.6, 0.6), R(0.2, 0.8), R(-0.6, 0.6)), tile: 'smoke2', blend: 'alpha', size: [0.3, 0.9], life: 0.6, drag: 2, color: 0xbab2a4, alpha: 0.35, rot: R(0, 6) });
  }

  hit(e, { big = false, gold = false } = {}) {
    const P = this.player, V = this.V, C = gold ? GD : CY;
    const h = (e.cfg?.scale ?? 1) * (e.dummy ? 1.25 : 1.15);
    const p = new THREE.Vector3(e.pos.x, e.pos.y + h, e.pos.z);
    const away = _w.set(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z).normalize();
    p.addScaledVector(away, -0.25);
    const k = big ? 1.6 : 1;
    V.spawn({ p, tile: 'starSharp2', size: [0.5 * k, 1.5 * k], life: 0.16, color: C.core, rot: R(0, 3), alpha: 1 });
    V.spawn({ p, tile: 'flare', size: 2.4 * k, life: 0.12, color: C.glow, alpha: 0.8 });
    V.spawn({ p, tile: 'ring', size: [0.3, 1.7 * k], life: 0.22, color: C.glow, alpha: 0.7 });
    for (let i = 0; i < V.n(big ? 16 : 9); i++) {
      const v = new THREE.Vector3(away.x + R(-0.8, 0.8), R(-0.2, 1.0), away.z + R(-0.8, 0.8)).normalize().multiplyScalar(R(6, 14));
      V.spawn({ p, v, tile: 'trace', mode: 1, size: R(0.08, 0.16), stretch: 0.045, gravity: 9, drag: 2.2, life: R(0.2, 0.36), color: i % 3 ? C.core : C.glow, alpha: 1 });
    }
    if (big) {
      V.spawn({ p, tile: 'scorch', size: [1.2, 3.2], life: 0.18, color: C.glow, alpha: 0.85, rot: R(0, 6) });
      for (let i = 0; i < 3; i++) V.spawn({ p: p.clone().add(_v.set(R(-0.3, 0.3), R(-0.4, 0.2), R(-0.3, 0.3))), v: _v.set(R(-1, 1), R(0.5, 1.5), R(-1, 1)), tile: 'smoke', blend: 'alpha', size: [0.6, 1.6], life: 0.8, drag: 2, color: 0xd8dde0, alpha: 0.35, rot: R(0, 6), spin: R(-1, 1) });
    }
  }
  // 地面扬尘
  dust(x, y, z, n, speed = 3, color = 0xcfc3aa) {
    const V = this.V;
    for (let i = 0; i < V.n(n); i++) {
      const a = Math.random() * Math.PI * 2, v = new THREE.Vector3(Math.cos(a) * R(0.4, 1) * speed, R(0.3, 1.2), Math.sin(a) * R(0.4, 1) * speed);
      V.spawn({ p: new THREE.Vector3(x + Math.cos(a) * 0.3, y + 0.25, z + Math.sin(a) * 0.3), v, tile: i % 2 ? 'smoke' : 'smoke2', blend: 'alpha', size: [0.6, R(1.6, 2.6)], life: R(0.7, 1.1), drag: 2.5, color, alpha: 0.42, rot: R(0, 6), spin: R(-0.8, 0.8) });
    }
  }

  // 破岳末式破地：冲击波在伤害圆心（center）、外沿与伤害半径 r 一致
  slam(P, center = null, r = 4.8) {
    const V = this.V, f = this.fwd(P), C = GD;
    const x = center ? center.x : P.pos.x + f.x * 1.0, z = center ? center.z : P.pos.z + f.z * 1.0, y = this.groundAt(x, z, P.pos.y + 1.5);
    const p = new THREE.Vector3(x, y + 0.07, z);
    // 环形贴图的亮环约在贴图半径的 0.9 处：直径取 2r / 0.9，外沿落在 r
    V.spawn({ p, tile: 'ring', mode: 3, size: [0.6, (r * 2) / 0.9], life: 0.42, color: C.core, alpha: 1 });
    V.spawn({ p, tile: 'ringSoft', mode: 3, size: [0.8, r * 1.5], life: 0.6, color: C.glow, alpha: 0.75, delay: 0.04 });
    V.spawn({ p, tile: 'ringWide', mode: 3, size: [1, r * 2.2], life: 0.5, color: C.deep, alpha: 0.35 });
    this.lights.pulse(p.clone().setY(y + 1.2), C.glow, 8, 0.35);
    V.spawn({ p, tile: 'scorch2', mode: 3, blend: 'alpha', size: [3.2, 4.4], life: 3.5, color: 0x1c1610, alpha: 0.7, rot: R(0, 6), fadeIn: 0.02 });
    V.spawn({ p: p.clone().setY(y + 1.2), tile: 'starGlow', size: [2, 5.5], life: 0.16, color: C.core, alpha: 1 });
    V.spawn({ p: p.clone().setY(y + 3.2), tile: 'trace3', size: [3, 8], life: 0.26, color: C.glow, alpha: 0.75 });
    for (let i = 0; i < V.n(14); i++) {
      const a = (i / 14) * Math.PI * 2 + R(-0.15, 0.15);
      V.spawn({ p: new THREE.Vector3(x + Math.cos(a) * 0.5, y + 0.3, z + Math.sin(a) * 0.5), v: new THREE.Vector3(Math.cos(a) * R(6, 9), R(0.2, 1), Math.sin(a) * R(6, 9)),
        tile: i % 2 ? 'smoke' : 'smoke3', blend: 'alpha', size: [0.9, R(2.4, 3.4)], life: R(0.9, 1.3), drag: 3, color: 0xcbbda4, alpha: 0.45, rot: R(0, 6), spin: R(-1, 1) });
    }
    for (let i = 0; i < V.n(12); i++) {
      const a = Math.random() * Math.PI * 2;
      V.spawn({ p: new THREE.Vector3(x, y + 0.3, z), v: new THREE.Vector3(Math.cos(a) * R(2, 6), R(3, 7), Math.sin(a) * R(2, 6)), tile: i % 2 ? 'dirt' : 'dirt2', blend: 'alpha', size: R(0.3, 0.55), life: R(0.7, 1.0), gravity: 16, color: 0x4a3d30, alpha: 0.9, rot: R(0, 6), spin: R(-6, 6) });
    }
    for (let i = 0; i < V.n(22); i++) {
      const a = Math.random() * Math.PI * 2;
      V.spawn({ p: new THREE.Vector3(x, y + 0.4, z), v: new THREE.Vector3(Math.cos(a) * R(4, 11), R(3, 10), Math.sin(a) * R(4, 11)), tile: 'trace', mode: 1, size: R(0.08, 0.15), stretch: 0.04, gravity: 12, drag: 1.5, life: R(0.3, 0.55), color: i % 2 ? C.core : C.glow, alpha: 1 });
    }
  }

  // ---------- 剑气·新月：一道立体的月牙（combatFx.Crescents）随剑气飞行，身后拖着流光；撞墙碎开、飞尽化开 ----------
  waveSpawn(pr) {
    if (pr.short && this.ink) { this.ink.waveSpawn(pr); this.waves.push({ pr, ink: true }); return; }     // 第二十轮：拔刀斩的剑气是墨色月牙
    const gold = !!pr.short;
    this.crescents.spawn(pr, { size: pr.radius * (gold ? 1.25 : 1.35), gold });
    this.waves.push({ pr, acc: 0, gold });
  }
  waveTick(pr, dt) {
    const V = this.V, w = this.waves.find((x) => x.pr === pr);
    if (!w) return;
    if (w.ink) { this.ink.waveTick(pr, dt); return; }
    const C = w.gold ? GD : CY;
    w.acc += dt * 40;
    while (w.acc >= 1) {
      w.acc -= 1;
      const side = _u.set(-pr.dir.z, 0, pr.dir.x);
      const p = pr.pos.clone().addScaledVector(side, R(-1.0, 1.0) * pr.radius).add(_v.set(0, R(-0.15, 0.15), 0)).addScaledVector(pr.dir, -R(0.1, 0.5));
      V.spawn({ p, v: pr.dir.clone().multiplyScalar(-R(1, 4)).add(_v.set(0, R(0, 0.5), 0)), tile: 'trace2', mode: 1, size: R(0.06, 0.11), stretch: 0.22, life: R(0.18, 0.3), drag: 2, color: C.glow, alpha: 0.7 });
    }
  }
  waveEnd(pr) {
    const w = this.waves.find((x) => x.pr === pr);
    this.waves = this.waves.filter((x) => x.pr !== pr);
    if (w?.ink) { this.ink.waveEnd(pr); return; }
    this.crescents.end(pr);
    this.V.spawn({ p: pr.pos, tile: 'ringSoft', size: [0.5, 1.8], life: 0.22, color: w?.gold ? GD.glow : CY.glow, alpha: 0.45 });
  }
  waveWall(pr) {
    if (this.waves.find((x) => x.pr === pr)?.ink) { this.ink.waveEnd(pr, true); return; }
    const V = this.V, C = this.waves.find((x) => x.pr === pr)?.gold ? GD : CY;
    V.spawn({ p: pr.pos, tile: 'starSharp2', size: [0.5, 2.2], life: 0.16, color: C.core, alpha: 1, rot: R(0, 3) });
    for (let i = 0; i < V.n(14); i++) V.spawn({ p: pr.pos, v: new THREE.Vector3(-pr.dir.x + R(-1, 1), R(-0.2, 1), -pr.dir.z + R(-1, 1)).normalize().multiplyScalar(R(4, 9)), tile: 'trace', mode: 1, size: R(0.06, 0.12), stretch: 0.04, gravity: 8, life: R(0.2, 0.36), color: C.glow, alpha: 1 });
    this.lights.pulse(pr.pos, C.glow, 3, 0.15);
  }
  // 弹回魔弹：一团金色火花
  deflect(p) {
    const V = this.V;
    V.spawn({ p, tile: 'starCross', size: [0.4, 2.0], life: 0.22, color: GD.core, alpha: 1, rot: R(0, 1) });
    for (let i = 0; i < V.n(12); i++) V.spawn({ p, v: new THREE.Vector3(R(-1, 1), R(-0.3, 1), R(-1, 1)).normalize().multiplyScalar(R(5, 10)), tile: 'trace', mode: 1, size: R(0.06, 0.12), stretch: 0.05, gravity: 8, life: R(0.2, 0.35), color: GD.core, alpha: 1 });
    this.lights.pulse(p, GD.glow, 4, 0.2);
  }

  // ---------- 惊鸿掠影、闪身 ----------
  dashStart(P) {
    const g = this.groundAt(P.pos.x, P.pos.z, P.pos.y + 1);
    this.dust(P.pos.x, g, P.pos.z, 6, 3);
    this.V.spawn({ p: _v.set(P.pos.x, g + 0.06, P.pos.z), tile: 'ringSoft', mode: 3, size: [0.5, 3.2], life: 0.35, color: CY.glow, alpha: 0.7 });
  }
  dashTick(P) {
    const V = this.V, f = this.fwd(P);
    for (let i = 0; i < 2; i++) {
      const p = new THREE.Vector3(P.pos.x + R(-0.5, 0.5), P.pos.y + R(0.2, 1.7), P.pos.z + R(-0.5, 0.5));
      V.spawn({ p, v: f.clone().multiplyScalar(-R(8, 14)), tile: 'trace', mode: 1, size: R(0.05, 0.1), stretch: 0.03, life: R(0.12, 0.2), color: CY.core, alpha: 0.7 });
    }
  }
  dashEnd(P) {
    const g = this.groundAt(P.pos.x, P.pos.z, P.pos.y + 1);
    this.V.spawn({ p: _v.set(P.pos.x, g + 0.06, P.pos.z), tile: 'ring', mode: 3, size: [0.6, 3.6], life: 0.32, color: CY.core, alpha: 0.7 });
    this.dust(P.pos.x, g, P.pos.z, 5, 2.5);
  }
  ghost(color = 0x8fe6ff) { this.V.ghosts?.spawn({ color, life: 0.34, alpha: 0.75 }); }
  dodge(P, dir) {
    const g = this.groundAt(P.pos.x, P.pos.z, P.pos.y + 1);
    this.dust(P.pos.x, g, P.pos.z, 4, 2);
    for (let i = 0; i < this.V.n(8); i++) {
      const p = new THREE.Vector3(P.pos.x + R(-0.4, 0.4), P.pos.y + R(0.3, 1.6), P.pos.z + R(-0.4, 0.4));
      this.V.spawn({ p, v: dir.clone().multiplyScalar(-R(6, 11)), tile: 'trace', mode: 1, size: R(0.05, 0.09), stretch: 0.03, life: R(0.14, 0.22), color: CY.core, alpha: 0.6 });
    }
    this.ghost();
  }

  // ---------- 格挡、弹反、破防（第十七轮：都在实际的接触点——来招与剑身相交处）----------
  // 接触点：来招的位置朝人物收到身前剑身的高度（约胸口、身前 0.55 米）
  guardPoint(P, at) {
    const f = this.fwd(P);
    const p = new THREE.Vector3(P.pos.x + f.x * 0.55, P.pos.y + 1.2, P.pos.z + f.z * 0.55);
    if (at) {
      const dx = at.x - P.pos.x, dz = at.z - P.pos.z, l = Math.hypot(dx, dz) || 1;
      p.set(P.pos.x + (dx / l) * 0.6, P.pos.y + Math.max(0.8, Math.min(1.6, at.y - P.pos.y || 1.2)), P.pos.z + (dz / l) * 0.6);
    }
    return p;
  }
  // 弹反窗口开了：剑上一点金光（很轻，不挡视线）
  parryReady(P) {
    P.char.bladeEnds(this.tip, this.base);
    this.V.spawn({ p: this.base.clone().lerp(this.tip, 0.55), tile: 'starSharp', size: [0.15, 0.7], life: 0.14, color: GD.core, alpha: 0.75, rot: R(0, 3) });
  }
  parry(P, at) {
    const V = this.V, p = this.guardPoint(P, at), f = this.fwd(P);
    V.spawn({ p, tile: 'starCross', size: [0.4, 2.6], life: 0.3, color: GD.core, alpha: 1, rot: R(0, 1) });
    V.spawn({ p, tile: 'starSharp', size: [0.25, 1.2], life: 0.14, color: 0xffffff, alpha: 0.85 });
    V.spawn({ p, tile: 'ring2', size: [0.3, 2.8], life: 0.32, color: GD.glow, alpha: 0.75 });
    for (let i = 0; i < V.n(20); i++) {
      const v = new THREE.Vector3(f.x * 0.6 + R(-1, 1), R(-0.4, 1.2), f.z * 0.6 + R(-1, 1)).normalize().multiplyScalar(R(6, 13));
      V.spawn({ p, v, tile: 'trace', mode: 1, size: R(0.08, 0.15), stretch: 0.05, gravity: 8, drag: 2, life: R(0.25, 0.4), color: i % 2 ? GD.core : GD.glow, alpha: 1 });
    }
    this.lights.pulse(p, 0xffd890, 4.5, 0.26);
  }
  block(P, at, hard = false) {
    const V = this.V, p = this.guardPoint(P, at), f = this.fwd(P);
    V.spawn({ p, tile: 'starSharp', size: [0.25, hard ? 1.4 : 0.95], life: 0.12, color: CY.core, alpha: 1 });
    for (let i = 0; i < V.n(hard ? 11 : 6); i++) {
      const v = new THREE.Vector3(f.x * 0.5 + R(-1, 1), R(-0.2, 1), f.z * 0.5 + R(-1, 1)).normalize().multiplyScalar(R(4, 8));
      V.spawn({ p, v, tile: 'trace', mode: 1, size: R(0.05, 0.1), stretch: 0.04, gravity: 8, life: R(0.16, 0.28), color: CY.core, alpha: 1 });
    }
    if (hard) this.lights.pulse(p, 0xcff2ff, 2.5, 0.12);
  }
  // 破防：护体剑罡碎成青色碎片四散，一道红光；soft（连续受击的护体）只亮一圈金光
  guardBreak(P, soft = false) {
    const V = this.V, f = this.fwd(P), p = new THREE.Vector3(P.pos.x + f.x * 0.5, P.pos.y + 1.15, P.pos.z + f.z * 0.5);
    if (soft) { V.spawn({ p: P.pos.clone().setY(P.pos.y + 1), tile: 'ring2', size: [0.5, 2.6], life: 0.4, color: GD.glow, alpha: 0.6 }); return; }
    V.spawn({ p, tile: 'starSharp2', size: [0.5, 2.0], life: 0.16, color: 0xffd2c0, alpha: 1, rot: R(0, 3) });
    for (let i = 0; i < V.n(16); i++) {
      const v = new THREE.Vector3(f.x * 0.4 + R(-1, 1), R(-0.3, 1), f.z * 0.4 + R(-1, 1)).normalize().multiplyScalar(R(3, 7));
      V.spawn({ p: p.clone().add(_v.set(R(-0.3, 0.3), R(-0.4, 0.4), R(-0.3, 0.3))), v, tile: i % 2 ? 'scratch' : 'starSharp', size: R(0.12, 0.26), life: R(0.35, 0.55), gravity: 6, drag: 1.5, color: i % 3 ? 0x9fe8ff : 0xff8a70, alpha: 0.95, rot: R(0, 6), spin: R(-8, 8) });
    }
    this.lights.pulse(p, 0xff6a50, 5, 0.25);
  }
  react(kind, P) {
    if (kind === 'knockback' || kind === 'guardbreak') { const g = this.groundAt(P.pos.x, P.pos.z, P.pos.y + 1); this.dust(P.pos.x, g, P.pos.z, 4, 2.2); }
  }

  // ---------- 第十九轮：拔刀斩——蓄势时灵光向鞘口（剑柄）汇聚，越蓄越密、过了剑气那一档转金；每过一档鞘口亮一圈光，蓄满一闪 ----------
  // 第二十轮：有水墨特效时改由 inkFx 画——墨点、墨雾、细小光粒沿螺旋收向剑柄与鞘口，弯带子扫进剑柄，鞘口一道细亮边；
  //   每过一档几条弯带子一齐扫进来、鞘口一闪；蓄满脚下一圈墨。取消、受击、力竭时不再生，已有的原地散开；出刀时很快收掉
  hilt(P, out) { const S = P.char.scabTop; if (S) S.getWorldPosition(out); else out.set(P.pos.x, P.pos.y + 1, P.pos.z); return out; }
  iaiBegin(P) {
    if (this.ink) { this.iai = { ink: true }; this.ink.chargeBegin(); return; }
    this.iai = { acc: 0, glowT: 0 }; this.V.spawn({ p: this.hilt(P, new THREE.Vector3()), tile: 'starSharp', size: [0.1, 0.45], life: 0.18, color: CY.core, alpha: 0.6 });
  }
  iaiTick(P, k, dt) {
    const I = this.iai;
    if (!I) return;
    if (I.ink) { this.ink.chargeTick(k, dt); return; }
    const V = this.V, h = this.hilt(P, new THREE.Vector3()), gold = k >= 0.6, C = gold ? GD : CY;
    I.acc += dt * (5 + 22 * k);
    while (I.acc >= 1) {
      I.acc -= 1;
      const p = h.clone().add(_v.set(R(-1, 1), R(-0.5, 1), R(-1, 1)).normalize().multiplyScalar(R(0.7, 1.2)));
      V.spawn({ p, v: h.clone().sub(p).multiplyScalar(4.2), tile: 'trace', mode: 1, size: R(0.035, 0.07), stretch: 0.06, life: 0.22, color: C.glow, alpha: 0.8 });
    }
    // 鞘口一点灵光，随蓄力变亮
    I.glowT -= dt;
    if (I.glowT <= 0) { I.glowT = 0.06; V.spawn({ p: h, tile: 'glow', size: 0.18 + 0.32 * k, life: 0.09, color: C.core, alpha: 0.25 + 0.5 * k }); }
  }
  iaiLevel(P, lv, full) {
    if (this.ink) { this.ink.chargeLevel(lv, full); return; }
    const V = this.V, h = this.hilt(P, new THREE.Vector3()), C = lv >= 2 ? GD : CY;
    V.spawn({ p: h, tile: 'ring2', size: [0.2, 0.6 + lv * 0.25], life: 0.28, color: C.core, alpha: 0.6 });
    if (lv >= 2) this.lights.pulse(h, C.glow, 1 + lv * 0.7, 0.22);
    if (full) {
      V.spawn({ p: h, tile: 'starCross', size: [0.3, 1.5], life: 0.3, color: GD.core, alpha: 1, rot: R(0, 1) });
      const g = this.groundAt(P.pos.x, P.pos.z, P.pos.y + 1);
      V.spawn({ p: new THREE.Vector3(P.pos.x, g + 0.06, P.pos.z), tile: 'ringSoft', mode: 3, size: [0.6, 3.2], life: 0.5, color: GD.glow, alpha: 0.55 });
    }
  }
  iaiEnd(P, released = false) { this.iai = null; this.ink?.chargeEnd(released); }
  // 出鞘：鞘口一点寒芒（蓄得久的转金、多一道光）；脚下扬尘（第二十轮水墨：只留扬尘，刀光在 iaiSlash）
  iaiDraw(P, k) {
    if (this.ink) { const g = this.groundAt(P.pos.x, P.pos.z, P.pos.y + 1); this.dust(P.pos.x, g, P.pos.z, 3 + Math.round(4 * k), 2 + 3 * k); return; }
    const V = this.V, h = this.hilt(P, new THREE.Vector3()), C = k >= 0.6 ? GD : CY;
    V.spawn({ p: h, tile: 'starSharp', size: [0.2, 0.9 + 0.8 * k], life: 0.14, color: C.core, alpha: 1, rot: R(0, 3) });
    if (k >= 0.3) this.lights.pulse(h, C.glow, 2 + 4 * k, 0.2);
    const g = this.groundAt(P.pos.x, P.pos.z, P.pos.y + 1);
    this.dust(P.pos.x, g, P.pos.z, 3 + Math.round(4 * k), 2 + 3 * k);
  }
  // 第二十轮：拔刀斩剑身离开鞘口的那一刻——月牙墨扫开到这一刀的判定距离与判定弧（moves.js 在动作时刻 INK.iai.at 调用）
  iaiSlash(P, a, { range, arc, hitT }) { this.ink?.iaiSlash(a, { range, arc, hitT }); }
  // 第二十轮：守关龙君身上的命中（龙君自己迸火星、出声音，这里只补一团墨）
  inkHit(at, dir, o = {}) { this.ink?.hit(at.clone(), dir, o); }
  // 玩家自己的范围招式：地面金圈（外沿 = 伤害半径），dur 秒后填满出手
  slamRing(center, r, dur) {
    const c = center.clone(); c.y = this.groundAt(c.x, c.z, c.y + 1.5);
    this.rings.show(c, r, dur);
  }

  // ---------- 缚灵锁：锁链自左手射向各个目标，缠上之后收回；被缚住的身上三道金环、脚下符阵 ----------
  sealCast(P, hand, targets, B) {
    const V = this.V;
    V.spawn({ p: hand.clone(), tile: 'starCross', size: [0.3, 1.4], life: 0.25, color: GD.core, alpha: 1 });
    this.lights.pulse(hand, GD.glow, 4, 0.25);
    if (!targets.length) {
      // 落空：锁链向前甩出、散开
      const f = this.fwd(P), to = hand.clone().addScaledVector(f, B.range * 0.85);
      this.chains.shoot(hand, to, { grow: 0.16, hold: 0.06, out: 0.2 });
      return;
    }
    for (const e of targets) {
      const tgt = () => (e.boss && e.hitPoint ? e.hitPoint.clone() : new THREE.Vector3(e.pos.x, e.pos.y + ((e.headY ?? e.pos.y + 1.8) - e.pos.y) * 0.55, e.pos.z));
      this.chains.shoot(hand, tgt, { grow: 0.13, hold: 0.32, out: 0.2 });
    }
  }
  bindMark(e, time) {
    this.binds.add(e, time);
    const g = this.groundAt(e.pos.x, e.pos.z, e.pos.y + 1), s = e.boss ? 2.4 : 1;
    this.V.spawn({ p: new THREE.Vector3(e.pos.x, g + 0.06, e.pos.z), tile: 'magic7', mode: 3, size: [1.6 * s, 2.4 * s], life: time + 0.2, spin: 1.2, color: GD.glow, alpha: 0.55, fadeIn: 0.1 });
  }
  bindEnd() { }
  // 锁定 / 解除锁定（标记本身在 update 里按 locked 换样子）
  lockOn() { }
  // 出手提示（combatFx.Tells）
  tellBegin(unit, kind, dur) { return this.tells.begin(unit, kind, dur); }
  tellEnd(h) { this.tells.end(h); }
  // 预编译：把各个池子里的网格先亮一下、编好着色器再藏起来（第一次弹反、放剑气、缚灵锁时不卡）
  prewarm(renderer, camera) {
    // 第二十二轮：当前佩剑的剑阵套件（一柄实例）一起编好，第一次万剑归宗不卡
    // （真画一帧：实例化的影子深度着色器要画影子时才编；放在人物脚下 3 米的地里，看不见）
    const kit = this.kitFor(), kp = kit ? kit.parts.map((p) => [p.mesh, p.mesh.count]) : [];
    if (kit && !this.uc) { kit.addTo(this.scene); kit.set(0, _p4.set(this.player.pos.x, this.player.pos.y - 3, this.player.pos.z), _q4.identity(), 1, 1, 0); kit.flush(1); }
    try { this.prewarm0(renderer, camera); if (kit && !this.uc) renderer.render(this.scene, camera); } finally { if (kit && !this.uc) for (const [m, n] of kp) { m.count = n; } }
  }
  prewarm0(renderer, camera) {
    const list = [...this.crescents.pool.map((c) => c.m), this.chains.mesh, ...this.binds.pool.map((b) => b.g), ...this.tells.pool.flatMap((x) => [x.s, x.gl]), ...this.rings.pool.map((x) => x.m), this.V.trail.mesh, ...(this.ink?.meshes() || [])];
    const keep = list.map((o) => o.visible);
    list.forEach((o) => { o.visible = true; });
    const cnt = this.chains.mesh.count; this.chains.mesh.count = 1;
    try { renderer.compile(this.scene, camera); } finally { list.forEach((o, i) => { o.visible = keep[i]; }); this.chains.mesh.count = cnt; }
  }
  // 换场景、重试、过场：特效全部收掉
  clearCombat() {
    for (const k of ['lights', 'crescents', 'chains', 'binds', 'tells', 'rings']) this[k].clear();
    this.ultStop();
    this.waves.length = 0; this.iai = null;
    this.V.trail.clear();
    this.ink?.clear(false);                        // 第二十轮：水墨刀光快速碎开，蓄力的墨原地散开
  }

  // ---------- 万剑归宗 ----------
  // 第二十二轮：手中这把剑的剑阵套件（没有就建；最多留 ULT.keep 份，最久没用的拆掉）；没有佩剑模型时为 null
  kitFor() {
    const ch = this.player.char, root = ch?.handSword?.children[0], id = ch?.swordId;
    if (!root || !id) return null;
    let k = this.kits.get(id);
    if (k && k.root !== root) { if (k.users) k = null; else { k.dispose(); this.kits.delete(id); k = null; } }
    if (!k) {
      k = new UltKit(id, ch.sword, root); k.root = root;
      this.kits.set(id, k);
      for (const [kid, kk] of this.kits) { if (this.kits.size <= ULT.keep) break; if (kk !== k && !kk.users) { kk.dispose(); this.kits.delete(kid); } }
    } else { this.kits.delete(id); this.kits.set(id, k); }      // 最近用过的排到后面
    return k;
  }
  // swords：这一次的飞剑（落点、落地时刻；moves.beginUlt 给出，s.i 是序号）
  ultBegin(center, D, swords = null) {
    const V = this.V, p = new THREE.Vector3(center.x, center.y + 0.07, center.z), d = D.circle * 2 + 1.2, life = D.final.t + 0.9;
    if (swords) this.ultCastBegin(center, D, swords);
    // 阵纹用普通混合的金线（亮的铺地上加色会冲成一片白，看不出纹样），上面再铺一层淡淡的辉光
    V.spawn({ p, tile: 'magic7', mode: 3, blend: 'alpha', size: [2, d], life, spin: 0.45, color: 0xb8801e, alpha: 0.95, fadeIn: 0.08 });
    V.spawn({ p, tile: 'ring2', mode: 3, blend: 'alpha', size: [2, d * 1.08], life, spin: -0.3, color: 0xc99a3a, alpha: 0.85, fadeIn: 0.1 });
    V.spawn({ p, tile: 'magicCompass', mode: 3, blend: 'alpha', size: [1, d * 0.42], life: life - 0.2, spin: 1.1, color: 0xd8a640, alpha: 0.9, fadeIn: 0.15 });
    p.y += 0.02;
    V.spawn({ p, tile: 'magic7', mode: 3, size: [2, d], life, spin: 0.45, color: GD.glow, alpha: 0.32, fadeIn: 0.08 });
    V.spawn({ p, tile: 'ring2', mode: 3, size: [2, d * 1.08], life, spin: -0.3, color: GD.glow, alpha: 0.25, fadeIn: 0.1 });
    V.spawn({ p, tile: 'ringSoft', mode: 3, size: [d * 0.6, d * 1.15], life, color: CY.glow, alpha: 0.16, fadeIn: 0.2 });
    // 阵心升腾的光柱：第二十二轮起在巨剑显出之前收住（不然巨剑悬在光柱里看不清是哪把剑）
    V.spawn({ p: p.clone().setY(center.y + 9), tile: 'trace3', size: [6, 22], life: swords ? D.final.t - ULT.giantShow : life, color: GD.glow, alpha: 0.22, fadeIn: 0.25 });
    // 起手：剑身金光一闪
    const P = this.player;
    V.spawn({ p: new THREE.Vector3(P.pos.x, P.pos.y + 1.9, P.pos.z), tile: 'starGlow', size: [0.5, 3], life: 0.4, color: GD.core, alpha: 1 });
    this.ult = { center: center.clone(), r: D.circle, t: 0, life };
    return this.ult;
  }
  ultSword(s) {
    if (this.uc) { const o = this.uc.sw[s.i]; if (o && o.phase === 'form') { o.phase = 'fall'; o.t0 = this.uc.t; } return o; }
    const g = new THREE.Group();
    const core = new THREE.Mesh(swordGeo(), new THREE.MeshBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    const glow = new THREE.Mesh(SWORD_GLOW_GEO, new THREE.MeshBasicMaterial({ color: GD.glow, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(core, glow);
    g.rotation.set(Math.PI + R(-0.12, 0.12), R(0, Math.PI * 2), R(-0.12, 0.12));     // 剑尖朝下
    g.renderOrder = 9;
    this.scene.add(g);
    const o = { g, core, glow, x: s.x, z: s.z, y: s.y, top: s.y + R(14, 18), t: 0, fall: 0.42, stuck: 0, scale: 1.35, s };
    this.swords.push(o);
    return o;
  }
  ultLand(s) {
    if (this.uc) { const o = this.uc.sw[s.i]; if (o) { o.phase = 'stuck'; o.st = 0; } }
    const V = this.V, p = new THREE.Vector3(s.x, s.y + 0.1, s.z);
    V.spawn({ p: p.clone().setY(s.y + 0.6), tile: 'starSharp2', size: [0.6, 2.0], life: 0.18, color: GD.core, alpha: 1, rot: R(0, 3) });
    V.spawn({ p, tile: 'ring', mode: 3, size: [0.3, 3.4], life: 0.35, color: GD.glow, alpha: 0.85 });
    for (let i = 0; i < V.n(7); i++) {
      const a = Math.random() * Math.PI * 2;
      V.spawn({ p: p.clone().setY(s.y + 0.3), v: new THREE.Vector3(Math.cos(a) * R(2, 6), R(2, 6), Math.sin(a) * R(2, 6)), tile: 'trace', mode: 1, size: R(0.06, 0.12), stretch: 0.04, gravity: 10, life: R(0.25, 0.4), color: GD.core, alpha: 1 });
    }
    if (Math.random() < 0.5) this.dust(s.x, s.y, s.z, 2, 1.5);
  }
  ultFinalSword(center) {
    if (this.uc) { const G = this.uc.giant; if (G.phase !== 'fall' && G.phase !== 'stuck') { G.phase = 'fall'; G.t0 = this.uc.t; G.from = G.tip.clone(); } return G; }
    const o = this.ultSword({ x: center.x, z: center.z, y: center.y });
    o.top = center.y + 38; o.fall = 0.5; o.scale = 5.2; o.final = true;
    o.g.rotation.set(Math.PI, 0, 0);
    o.g.scale.setScalar(o.scale);
  }
  ultFinal(center, r = 6.2) {
    if (this.uc) { const G = this.uc.giant; G.phase = 'stuck'; G.st = 0; }
    const V = this.V, p = new THREE.Vector3(center.x, center.y + 0.08, center.z);
    // 末了巨剑镇地：最亮的一圈外沿与伤害半径 r 一致，余波稍大
    V.spawn({ p, tile: 'ring', mode: 3, size: [1, (r * 2) / 0.9], life: 0.6, color: GD.core, alpha: 1 });
    V.spawn({ p, tile: 'ringWide', mode: 3, size: [2, r * 2.6], life: 0.8, color: GD.glow, alpha: 0.45 });
    V.spawn({ p, tile: 'ringSoft', mode: 3, size: [1.5, r * 1.9], life: 1.0, color: CY.glow, alpha: 0.4, delay: 0.06 });
    this.lights.pulse(p.clone().setY(center.y + 2), GD.core, 6, 0.45);
    V.spawn({ p, tile: 'scorch', mode: 3, blend: 'alpha', size: [7, 9], life: 4.5, color: 0x1a140e, alpha: 0.65, rot: R(0, 6) });
    V.spawn({ p: p.clone().setY(center.y + 2), tile: 'starGlow', size: [3, 7], life: 0.2, color: 0xfff0d0, alpha: 0.7 });
    V.spawn({ p: p.clone().setY(center.y + 2), tile: 'light2', size: [5, 10], life: 0.4, color: GD.glow, alpha: 0.42 });
    V.spawn({ p: p.clone().setY(center.y + 8), tile: 'trace3', size: [4, 20], life: 0.36, color: GD.core, alpha: 0.6 });
    for (let i = 0; i < V.n(20); i++) {
      const a = (i / 20) * Math.PI * 2 + R(-0.1, 0.1);
      V.spawn({ p: new THREE.Vector3(center.x + Math.cos(a), center.y + 0.4, center.z + Math.sin(a)), v: new THREE.Vector3(Math.cos(a) * R(8, 13), R(0.2, 1.2), Math.sin(a) * R(8, 13)),
        tile: i % 2 ? 'smoke' : 'smoke3', blend: 'alpha', size: [1.2, R(3, 4.5)], life: R(1.1, 1.6), drag: 2.6, color: 0xd2c6ae, alpha: 0.45, rot: R(0, 6), spin: R(-1, 1) });
    }
    for (let i = 0; i < V.n(34); i++) {
      const a = Math.random() * Math.PI * 2;
      V.spawn({ p: new THREE.Vector3(center.x, center.y + 0.6, center.z), v: new THREE.Vector3(Math.cos(a) * R(5, 15), R(4, 14), Math.sin(a) * R(5, 15)), tile: 'trace', mode: 1, size: R(0.1, 0.18), stretch: 0.04, gravity: 12, drag: 1.2, life: R(0.4, 0.8), color: i % 2 ? GD.core : GD.glow, alpha: 1 });
    }
    for (let i = 0; i < V.n(14); i++) {
      const a = Math.random() * Math.PI * 2;
      V.spawn({ p: new THREE.Vector3(center.x, center.y + 0.4, center.z), v: new THREE.Vector3(Math.cos(a) * R(3, 8), R(4, 9), Math.sin(a) * R(3, 8)), tile: i % 2 ? 'dirt' : 'dirt2', blend: 'alpha', size: R(0.35, 0.7), life: R(0.8, 1.2), gravity: 16, color: 0x4a3d30, alpha: 0.9, rot: R(0, 6), spin: R(-6, 6) });
    }
    this.flash(0xfff3d8, 0.28);
  }
  // 逻辑结束：飞剑各自按计时化光散去；abort（倒下、重试、换场景）立刻收掉
  ultEnd(handle = null, abort = false) { void handle; if (this.uc) { this.uc.logicDone = true; if (abort) this.ultStop(); } }
  // moves.updateUlt 每帧给出这一次万剑归宗的逻辑时刻（飞剑的阵位、落下、插地都按它，与伤害同一时刻）
  ultTick(t) { if (this.uc) this.uc.t = t; }

  // ---------- 第二十二轮：佩剑的剑阵 ----------
  ultCastBegin(center, D, swords) {
    if (this.uc) this.ultStop();
    const kit = this.kitFor();
    if (!kit) { console.warn('[万剑归宗] 手中没有剑的模型，飞剑改用通用光剑'); return; }
    kit.users++; this.armory?.acquire(kit.id);
    kit.addTo(this.scene);
    const P = this.player, s1 = ULT.len / kit.len, sG = ULT.giantLen / kit.len;
    // 阵位：落点离阵心近的 10 柄在内圈、其余外圈；同一圈按落点的方位排开（飞剑基本竖直落下，不横穿剑阵）
    const order = swords.map((s, i) => ({ s, i, r: Math.hypot(s.x - center.x, s.z - center.z), a: Math.atan2(s.z - center.z, s.x - center.x) }));
    order.sort((x, y) => x.r - y.r);
    const sw = new Array(swords.length);
    let k0 = 0;
    for (const [n, rad, dy] of ULT.rings) {
      const ring = order.slice(k0, k0 + n).sort((x, y) => x.a - y.a);
      const a0 = ring.length ? ring[0].a : 0;
      ring.forEach((o, j) => {
        const a = a0 + (j / Math.max(1, ring.length)) * Math.PI * 2;
        const slot = new THREE.Vector3(center.x + Math.cos(a) * rad, center.y + ULT.formH + dy, center.z + Math.sin(a) * rad);
        sw[o.i] = { i: o.i, s: o.s, phase: 'form', slot, a, t0: 0, st: 0, q: new THREE.Quaternion(), tip: slot.clone(), show: 0, scale: s1 };
      });
      k0 += n;
    }
    // 显出的先后：先落的先显（从 show[0] 到 show[1] 依次）
    const byT = sw.slice().sort((x, y) => x.s.t - y.s.t);
    byT.forEach((o, j) => { o.show = ULT.show[0] + (ULT.show[1] - ULT.show[0]) * (j / Math.max(1, byT.length - 1)); });
    const toC = (o) => new THREE.Vector3(center.x - o.slot.x, 0, center.z - o.slot.z);
    for (const o of sw) kit.orient(_p4.set(0, -1, 0).clone(), toC(o), o.q);
    const giant = { phase: 'wait', tip: new THREE.Vector3(center.x, center.y + ULT.giantH, center.z), q: new THREE.Quaternion(), scale: sG, st: 0, t0: 0 };
    kit.orient(new THREE.Vector3(0, -1, 0), new THREE.Vector3(P.pos.x - center.x, 0, P.pos.z - center.z), giant.q);
    this.uc = { kit, center: center.clone(), D, sw, giant, t: 0, own: 0, logicDone: false, id: kit.id, name: kit.def?.name, s1, sG, landed: 0 };
  }
  ultStop() {
    const U = this.uc;
    if (!U) return;
    U.kit.flush(0);
    U.kit.users = Math.max(0, U.kit.users - 1);
    this.armory?.release(U.kit.id);
    // 施法中换剑又换回同一把（手里是新的克隆）时套件已换成新的一份：旧的这份用完就拆掉
    if (this.kits.get(U.kit.id) !== U.kit && !U.kit.users) U.kit.dispose();
    this.uc = null;
  }
  ultUpdate(dt) {
    const U = this.uc;
    if (!U) return;
    if (U.logicDone) U.t += dt;                              // 逻辑结束之后按自己的时钟把余下的化光散去走完
    const K = U.kit, t = U.t, V = this.V;
    let alive = 0;
    for (const o of U.sw) {
      if (!o) continue;
      let glow = 1, dis = 0;
      if (o.phase === 'form') {
        // 阵中：刀尖朝下悬着，轻轻起伏；按先后显出
        const k = (t - o.show) / ULT.fadeIn;
        dis = k <= 0 ? 1 : 1 - Math.min(1, k);
        o.tip.copy(o.slot); o.tip.y += Math.sin(t * 3 + o.a * 2) * 0.06;
        glow = 0.85 + 0.35 * Math.max(0, 1 - Math.abs(k - 1));
        K.set(o.i, o.tip, o.q, o.scale, glow, dis);
        // 剑气：沿剑身偶尔亮起一点淡金的灵光（叠在模型外，不改剑本身的颜色）
        if (dis < 0.5 && Math.random() < 0.12) V.spawn({ p: _s3.copy(o.tip).addScaledVector(_c4.set(0, 1, 0), K.len * o.scale * R(0.15, 0.85)).clone(), tile: 'glow', size: R(0.35, 0.6), life: R(0.18, 0.3), color: GD.glow, alpha: 0.32 });
      } else if (o.phase === 'fall') {
        // 落下：刀尖朝前、对准落点（刀尖插入地下 stick 的深度），u² 加速；开头四分之一由竖直转到下落方向
        if (!o.d) {
          const s = o.s, land = new THREE.Vector3(s.x, s.y ?? U.center.y, s.z);
          o.from = o.tip.clone(); o.d = land.clone().sub(o.from).normalize(); o.q0 = o.q.clone();
          o.q1 = K.orient(o.d, new THREE.Vector3(U.center.x - o.slot.x, 0, U.center.z - o.slot.z), new THREE.Quaternion());
          o.to = land.addScaledVector(o.d, ULT.stick * K.len * o.scale);
        }
        const u = Math.min(1, (t - o.t0) / ULT.fall), e = u * u;
        o.tip.lerpVectors(o.from, o.to, e);
        o.q.copy(o.q0).slerp(o.q1, Math.min(1, u / 0.25));
        glow = 1.0;
        K.set(o.i, o.tip, o.q, o.scale, glow, 0);
        const mid = _s3.copy(o.tip).addScaledVector(o.d, -K.len * o.scale * 0.45);
        V.spawn({ p: mid.clone(), v: o.d.clone().multiplyScalar(-6), tile: 'trace', mode: 1, size: 0.12 * o.scale, stretch: 0.03, life: 0.14, color: GD.glow, alpha: 0.7 });
      } else if (o.phase === 'stuck') {
        // 插在地里：亮一下，片刻后化光散去（1.3 秒）
        o.st += dt;
        if (o.to) o.tip.copy(o.to);
        const fade = 1.3, a = Math.max(0, o.st - fade * 0.55) / (fade * 0.45);
        glow = 0.45 + 0.8 * Math.max(0, 1 - o.st * 3);
        dis = Math.min(1, a);
        K.set(o.i, o.tip, o.q, o.scale, glow, dis);
        if (o.st > fade) { o.phase = 'gone'; K.set(o.i, o.tip, o.q, 0, 0, 1); for (let k = 0; k < V.n(4); k++) V.spawn({ p: o.tip.clone().add(_s3.set(R(-0.1, 0.1), R(0.2, 1.3), R(-0.1, 0.1))), v: _s3.set(R(-0.4, 0.4), R(0.6, 1.8), R(-0.4, 0.4)).clone(), tile: 'glow', size: R(0.08, 0.16), life: R(0.6, 1), color: GD.glow, alpha: 0.9 }); }
      } else K.set(o.i, o.tip, o.q, 0, 0, 1);
      if (o.phase !== 'gone') alive++;
    }
    // 巨剑：同一把剑放大，悬于阵心上空显出 → 落下（与镇阵的伤害、声音同一刻落地）→ 插地，化光散去（2.2 秒）
    const G = U.giant;
    if (G.phase === 'wait' && t >= U.D.final.t - ULT.giantShow) { G.phase = 'hover'; G.h0 = t; }
    if (G.phase === 'hover') {
      const k = (t - G.h0) / 0.3;
      G.tip.y = U.center.y + ULT.giantH - Math.min(1, (t - G.h0) / ULT.giantShow) * 1.2;
      K.set(ULT.giant, G.tip, G.q, G.scale, 0.8, 1 - Math.min(1, k));
    } else if (G.phase === 'fall') {
      const u = Math.min(1, (t - G.t0) / ULT.giantFall), e = u * u;
      const to = _p4.set(U.center.x, U.center.y - ULT.stick * U.kit.len * G.scale, U.center.z);
      G.tip.lerpVectors(G.from, to, e);
      K.set(ULT.giant, G.tip, G.q, G.scale, 1.0, 0);
      V.spawn({ p: G.tip.clone().setY(G.tip.y + K.len * G.scale * 0.5), v: new THREE.Vector3(0, -24, 0), tile: 'trace', mode: 1, size: 0.5 * G.scale / 4, stretch: 0.02, life: 0.16, color: GD.glow, alpha: 0.75 });
    } else if (G.phase === 'stuck') {
      G.st += dt;
      G.tip.set(U.center.x, U.center.y - ULT.stick * U.kit.len * G.scale, U.center.z);
      const fade = 2.2, a = Math.max(0, G.st - fade * 0.55) / (fade * 0.45);
      K.set(ULT.giant, G.tip, G.q, G.scale, 0.45 + 0.9 * Math.max(0, 1 - G.st * 2.5), Math.min(1, a));
      if (G.st > fade) { G.phase = 'gone'; K.set(ULT.giant, G.tip, G.q, 0, 0, 1); }
    } else K.set(ULT.giant, G.tip, G.q, 0, 0, 1);
    if (G.phase !== 'gone') alive++;
    K.flush(ULT.n);
    if (!alive || (U.logicDone && t > U.D.final.t + 3)) this.ultStop();
  }
  // 自检：这一次剑阵用的哪把剑、各柄飞剑的状态、套件（几何体是否与手中剑共用、材质是否另一份）
  ultInfo() {
    const U = this.uc, ch = this.player.char;
    const kitInfo = (k) => ({ id: k.id, users: k.users, len: +k.len.toFixed(3), axis: k.axis.toArray().map((x) => +x.toFixed(3)), parts: k.parts.length,
      sharedGeo: k.parts.every((p) => { let hand = null; k.root.traverse((o) => { if (o.isMesh && !hand) hand = o; }); return hand && p.mesh.geometry.attributes.position === hand.geometry.attributes.position; }),
      ownMat: k.parts.every((p) => { let hand = null; k.root.traverse((o) => { if (o.isMesh && !hand) hand = o; }); return [].concat(p.mesh.material).every((m) => m !== hand.material && m.map === hand.material.map); }) });
    return { active: !!U, sword: U ? { id: U.id, name: U.name, t: +U.t.toFixed(3), phases: U.sw.map((o) => o?.phase[0]).join(''), giant: U.giant.phase, s1: +U.s1.toFixed(3), sG: +U.sG.toFixed(3) } : null,
      hand: ch?.swordId || null, kits: [...this.kits.values()].map(kitInfo) };
  }

  // ---------- 其他 ----------
  // 第十九轮：回血葫芦——一圈淡金的光自脚下升起，几点灵光绕身
  gourd(P) {
    const V = this.V, g = this.groundAt(P.pos.x, P.pos.z, P.pos.y + 1);
    V.spawn({ p: new THREE.Vector3(P.pos.x, g + 0.06, P.pos.z), tile: 'ringSoft', mode: 3, size: [0.5, 2.2], life: 0.7, color: 0xf3d58a, alpha: 0.6 });
    for (let i = 0; i < V.n(16); i++) {
      const a = Math.random() * Math.PI * 2, r = R(0.25, 0.6);
      V.spawn({ p: new THREE.Vector3(P.pos.x + Math.cos(a) * r, g + R(0.2, 1.2), P.pos.z + Math.sin(a) * r), v: new THREE.Vector3(0, R(0.5, 1.4), 0), tile: i % 3 ? 'glow' : 'star', size: R(0.1, 0.2), life: R(0.7, 1.1), delay: R(0, 0.3), color: i % 2 ? 0xf6e2a8 : 0xa8f0c0, alpha: 0.85, fadeIn: 0.12, rot: R(0, 3) });
    }
  }
  pill(P) {
    const V = this.V, g = this.groundAt(P.pos.x, P.pos.z, P.pos.y + 1);
    V.spawn({ p: new THREE.Vector3(P.pos.x, g + 0.06, P.pos.z), tile: 'ringSoft', mode: 3, size: [0.5, 2.6], life: 0.9, color: 0x9ff0c8, alpha: 0.7 });
    for (let i = 0; i < V.n(26); i++) {
      const a = Math.random() * Math.PI * 2, r = R(0.3, 0.75);
      V.spawn({ p: new THREE.Vector3(P.pos.x + Math.cos(a) * r, g + R(0.1, 0.6), P.pos.z + Math.sin(a) * r), v: new THREE.Vector3(0, R(0.6, 1.8), 0), tile: i % 3 ? 'glow' : 'star', size: R(0.12, 0.26), life: R(1, 1.6), delay: R(0, 0.5), color: i % 2 ? 0xa8f0c0 : 0xf3f7d0, alpha: 0.9, fadeIn: 0.15, rot: R(0, 3) });
    }
  }
  death(e) {
    const V = this.V, s = e.cfg?.scale ?? 1;
    const p = new THREE.Vector3(e.pos.x, e.pos.y + 0.9 * s, e.pos.z);
    V.spawn({ p, tile: 'sparkBall', size: [1, 2.8 * s], life: 0.3, color: 0xff3a24, alpha: 0.8, rot: R(0, 6) });
    V.spawn({ p: p.clone().setY(e.pos.y + 0.06), tile: 'ringSoft', mode: 3, size: [0.6, 3.2 * s], life: 0.6, color: 0xc0201c, alpha: 0.7 });
    for (let i = 0; i < V.n(10); i++) {
      V.spawn({ p: p.clone().add(_v.set(R(-0.35, 0.35), R(-0.6, 0.6), R(-0.35, 0.35))), v: new THREE.Vector3(R(-0.6, 0.6), R(0.8, 2.2), R(-0.6, 0.6)), tile: i % 2 ? 'smoke' : 'smoke2', blend: 'alpha', size: [0.6 * s, 1.8 * s], life: R(1, 1.6), drag: 1.5, color: 0x2a1418, alpha: 0.55, rot: R(0, 6), spin: R(-1, 1) });
    }
    for (let i = 0; i < V.n(14); i++) {
      V.spawn({ p: p.clone().add(_v.set(R(-0.4, 0.4), R(-0.6, 0.6), R(-0.4, 0.4))), v: new THREE.Vector3(R(-1, 1), R(1, 3), R(-1, 1)), tile: 'glow', size: R(0.08, 0.16), life: R(0.8, 1.4), color: 0xff4a2a, alpha: 0.9 });
    }
  }
  // 玩家受击：血红的一道抓痕，落在来招那一侧的身上
  playerHurt(P, src = null) {
    const p = new THREE.Vector3(P.pos.x, P.pos.y + 1.2, P.pos.z);
    if (src) { const dx = src.x - P.pos.x, dz = src.z - P.pos.z, l = Math.hypot(dx, dz) || 1; p.x += (dx / l) * 0.3; p.z += (dz / l) * 0.3; }
    this.V.spawn({ p, tile: 'scratch', size: [0.6, 1.2], life: 0.18, color: 0xff4030, alpha: 0.85, rot: R(-0.4, 0.4) });
    for (let i = 0; i < this.V.n(5); i++) this.V.spawn({ p, v: _v.set(R(-1, 1), R(0, 1.2), R(-1, 1)).normalize().multiplyScalar(R(2, 5)), tile: 'glow', size: R(0.05, 0.1), gravity: 9, life: R(0.2, 0.35), color: 0xc8241c, alpha: 0.9 });
  }
  // 第十六轮：雷击麻痹时身上跳动的电光
  stun(P) {
    const V = this.V, p = new THREE.Vector3(P.pos.x, P.pos.y + 1.1, P.pos.z);
    for (let i = 0; i < V.n(2); i++) V.spawn({ p: p.clone().add(_v.set(R(-0.35, 0.35), R(-0.7, 0.7), R(-0.35, 0.35))), tile: i % 2 ? 'bolt' : 'bolt2', size: R(0.35, 0.7), life: 0.09, color: i % 2 ? 0xeee5ff : 0x9a7cff, alpha: 1, rot: R(0, 6) });
  }
  enemyStrike(e) {
    const f = _f.set(Math.sin(e.yaw), 0, Math.cos(e.yaw)), s = e.cfg?.scale ?? 1;
    this.V.spawn({ p: new THREE.Vector3(e.pos.x + f.x * 1.1 * s, e.pos.y + 1.1 * s, e.pos.z + f.z * 1.1 * s), tile: e.kind === 'elite' ? 'slashH' : 'scratch', mode: e.kind === 'elite' ? 2 : 0,
      u: _u.set(-Math.cos(e.yaw), 0.3, Math.sin(e.yaw)).normalize(), w: f.clone(), size: [1.2 * s, 2.4 * s], life: 0.2, color: 0xff3a24, alpha: 0.9, fadeIn: 0.1, rot: R(-0.3, 0.3) });
  }

  // 锁定标记：目标脚下一圈缓转的暗红环、头顶一点星芒
  buildMarker() {
    const mk = (tileName, size, color) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uAtlas: { value: null }, uTile: { value: 0 }, uColor: { value: new THREE.Color(color) }, uA: { value: 0 }, uCR: { value: new THREE.Vector2(8, 6) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
        fragmentShader: 'uniform sampler2D uAtlas; uniform float uTile, uA; uniform vec3 uColor; uniform vec2 uCR; varying vec2 vUv; void main(){ float c = mod(uTile, uCR.x), r = floor(uTile / uCR.x); vec2 uv = vec2((c + vUv.x) / uCR.x, (uCR.y - r - 1. + vUv.y) / uCR.y); float a = texture2D(uAtlas, uv).r; gl_FragColor = vec4(uColor * a * uA, 1.); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      m.userData.tile = tileName; m.renderOrder = 9; m.frustumCulled = false; m.visible = false;
      this.scene.add(m);
      return m;
    };
    const ring = mk('ring2', 1.7, 0xff5a3c), pin = mk('starCross', 0.34, 0xffc070);
    ring.rotation.x = -Math.PI / 2;
    return { ring, pin, a: 0, target: null };
  }
  setAtlas(atlas) {
    for (const m of [this.marker.ring, this.marker.pin]) {
      m.material.uniforms.uAtlas.value = atlas.tex;
      m.material.uniforms.uTile.value = atlas.tiles[m.userData.tile] ?? 0;
      m.material.uniforms.uCR.value.set(atlas.cols, atlas.rows);
    }
  }

  // 屏幕闪光（大招落地、弹反）
  flash(color = 0xffffff, k = 0.4) {
    const el = this.flashEl;
    if (!el) return;
    el.style.background = `radial-gradient(ellipse at 50% 55%, #${new THREE.Color(color).getHexString()} 0%, rgba(255,255,255,0) 70%)`;
    el.animate([{ opacity: k }, { opacity: 0 }], { duration: 420, easing: 'ease-out' });
  }
  deny(kind, why, text = null) { this.hud?.deny(kind, why, text); }

  // ---------- 每帧 ----------
  update(dt, { target = null, locked = false, camera = null } = {}) {
    const P = this.player;
    const A = this.act;
    if (A?.key === 'iai_slash' && (A.iaiK ?? 0) >= 0.3 && A.t >= 0.08 && A.t <= 0.3) {
      A.ghostT = (A.ghostT ?? 0) - dt;
      if (A.ghostT <= 0) { A.ghostT = 0.06 - 0.025 * A.iaiK; this.ghost(this.ink ? INK.iai.ghost : A.iaiK >= 0.6 ? GD.glow : CY.glow); }
    }
    this.ink?.update(dt, camera);
    if (this.trailOn && P.char.handSword?.visible) {
      P.char.bladeEnds(this.tip, this.base);
      this.base.lerp(this.tip, 0.4);                  // 拖尾只铺剑身外侧六成（剑尖一段），不从剑柄扇开
      this.vfx.trail.push(this.tip, this.base, this.vfx.now);
      // 出手段最亮；前摇、收势淡（有拖尾但不刺眼，不盖住对手的预警）
      const a = this.act, D = a?.def;
      const on = D?.active ? a.t >= D.active[0] - 0.03 && a.t <= D.active[1] + 0.06 : D?.release != null ? a.t >= D.release - 0.05 && a.t <= D.release + 0.12 : true;
      this.vfx.trail.k = (on ? 1 : 0.32) * (this.gold ? 1.15 : 0.9);
      // 第二十二轮：舞刀——云剑一周一直亮着（偏淡），最后一刀最亮，离刀之后收
      if (a?.key === 'phoenix') this.vfx.trail.k = a.t < 0.1 ? 0.3 : a.t < 0.85 ? 0.75 : a.t <= D.release + 0.04 ? 1.1 : 0.3;
    }
    this.lights.update(dt); this.crescents.update(dt); this.chains.update(dt); this.binds.update(dt); this.tells.update(dt); this.rings.update(dt);
    this.ultUpdate(dt);                                // 第二十二轮：佩剑的剑阵
    // 剑阵：升腾的灵光
    if (this.ult) {
      const U = this.ult;
      U.t += dt;
      if (U.t < U.life - 0.5) {
        for (let i = 0; i < this.vfx.n(3); i++) {
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * U.r;
          this.vfx.spawn({ p: new THREE.Vector3(U.center.x + Math.cos(a) * r, U.center.y + 0.1, U.center.z + Math.sin(a) * r), v: new THREE.Vector3(0, R(1, 3.2), 0), tile: i % 2 ? 'glow' : 'star', size: R(0.08, 0.2), life: R(0.8, 1.4), color: i % 2 ? GD.glow : GD.core, alpha: 0.9, fadeIn: 0.2, rot: R(0, 3) });
        }
      } else if (U.t > U.life) this.ult = null;
    }
    // 飞剑：下落 → 插入地面 → 化光散去
    for (let i = this.swords.length - 1; i >= 0; i--) {
      const o = this.swords[i];
      o.t += dt;
      if (o.t < o.fall) {
        const u = o.t / o.fall, k = u * u;
        o.g.position.set(o.x, o.top + (o.y + 0.75 * o.scale - o.top) * k, o.z);
        o.g.scale.setScalar(o.scale);
        const mid = o.g.position.clone().add(_v.set(0, -0.6 * o.scale, 0));
        this.vfx.spawn({ p: mid, v: _w.set(0, -24, 0), tile: 'trace', mode: 1, size: 0.16 * o.scale, stretch: 0.02, life: 0.16, color: GD.glow, alpha: 0.85 });
        this.vfx.spawn({ p: mid, tile: 'glow', size: 1.1 * o.scale, life: 0.07, color: GD.core, alpha: 0.5 });
      } else {
        o.stuck += dt;
        o.g.position.set(o.x, o.y + 0.75 * o.scale, o.z);       // 剑身一半插进地里
        const fade = o.final ? 2.2 : 1.3;
        const a = Math.max(0, 1 - Math.max(0, o.stuck - fade * 0.55) / (fade * 0.45));
        o.core.material.opacity = 0.95 * a; o.glow.material.opacity = 0.22 * a + 0.25 * Math.max(0, 1 - o.stuck * 4);
        if (o.stuck > fade) {
          for (let k = 0; k < this.vfx.n(o.final ? 20 : 5); k++) this.vfx.spawn({ p: o.g.position.clone().add(_v.set(R(-0.1, 0.1) * o.scale, R(0, 1.4) * o.scale, R(-0.1, 0.1) * o.scale)), v: _v.set(R(-0.4, 0.4), R(0.6, 1.8), R(-0.4, 0.4)), tile: 'glow', size: R(0.08, 0.16) * (o.final ? 2 : 1), life: R(0.6, 1), color: GD.glow, alpha: 0.9 });
          o.g.parent?.remove(o.g);
          o.core.material.dispose(); o.glow.material.dispose();
          this.swords.splice(i, 1);
        }
      }
    }
    // 锁定标记：辅助目标为暗红的细环；Tab 锁定时换成金色、头顶星芒更亮（守关龙君标在离你最近的那段身体上）
    const M = this.marker;
    M.a += ((target ? 1 : 0) - M.a) * Math.min(1, dt * 10);
    M.lk = (M.lk ?? 0) + ((locked ? 1 : 0) - (M.lk ?? 0)) * Math.min(1, dt * 12);
    const vis = M.a > 0.02 && (target || M.target);
    if (target) M.target = target;
    M.ring.visible = M.pin.visible = !!vis;
    if (vis) {
      const e = M.target, s = e.boss ? 1.6 : e.cfg?.scale ?? 1, at = e.boss && e.hitPoint ? e.hitPoint : e.pos, gy = e.boss ? 0 : e.pos.y;
      M.ring.position.set(at.x, gy + 0.08, at.z);
      M.ring.rotation.z += dt * (0.9 + M.lk * 1.6);
      M.ring.scale.setScalar(s * (1 + (e.boss ? 0.6 : e.radius) * 0.6) * (1 + 0.06 * Math.sin(this.vfx.now * 6)) * (1 - 0.12 * M.lk));
      M.ring.material.uniforms.uColor.value.setRGB(1, 0.35 + 0.45 * M.lk, 0.24 + 0.1 * M.lk);
      M.ring.material.uniforms.uA.value = M.a * (0.7 + 0.3 * M.lk);
      M.pin.position.set(at.x, e.boss ? (e.headY ?? at.y + 1.5) + 0.4 : gy + (e.dummy ? 2.2 : 2.05 * s), at.z);
      if (camera) M.pin.quaternion.copy(camera.quaternion);
      M.pin.scale.setScalar(1 + 0.3 * M.lk);
      M.pin.material.uniforms.uA.value = M.a * (0.6 + 0.2 * Math.sin(this.vfx.now * 8)) * (1 + 0.25 * M.lk);
      if (!target && M.a < 0.05) M.target = null;
    }
  }
}
