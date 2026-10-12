// 第二十一轮：九霄凤焰的凤凰——模型、材质与动作层。
// 素材：assets/boss/phoenix-bird/source/fly.fbx（tools/r21_convert_phoenix.py 修正贴图路径、转成 assets/converted/phoenix/phoenix.glb；原文件不动）。
//   88 根骨骼（双翼各 10、尾 6、冠羽与背、尾羽 48、腿、颈、颌），一段动作「Take 001」（第 1–101 帧，每秒 30 帧，3.33 秒）。
//   逐帧渲染核对过：它是振翅飞行的循环（约 0.8 秒一扇，四扇一轮，翼、尾羽、冠羽随之摆动），没有展翼滑翔、俯冲、攻击、受击、消散。
// 这些都用真实骨骼在振翅之上叠加（不是移动静态模型）：
//   展翼 / 滑翔：振翅动作里翼展最宽最平的那一帧（glideFrame）的翼、尾骨姿势按权重混入；
//   俯冲：肩骨把整只翅往后、往下收，前臂再折一截；转向：身体侧倾（由逻辑给出朝向）、尾羽往弯的内侧扫；
//   攻击：颈、头前探下压，下颌张开，翅向前扑；受击：脊、颈一缩后仰；消散：着色器按噪声由翼尖向身体烧尽、边缘亮起。
// 颜色：原贴图是绿青与红橙的孔雀式凤凰，按 PHOENIX.colors 的深红、橙金、羽缘、核心、尾焰按亮度重映射（保留羽毛的明暗细节）；
//   D_A 的 alpha 作镂空（alphaTest，不做排序混合，羽毛前后不会错乱）；E 贴图作自发光，叠一层羽缘的金红边光
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { PHOENIX } from '../game/combatConfig.js';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const ID = new THREE.Quaternion();

function makeUniforms() {
  const C = PHOENIX.colors, c = (h) => new THREE.Color(h);
  return {
    uC0: { value: c(C.red) }, uC1: { value: c(C.gold) }, uC2: { value: c(C.edge) }, uC3: { value: c(C.core) }, uC4: { value: c(C.tail) },
    uRecolor: { value: 1 }, uGlow: { value: 0.9 }, uRim: { value: 0.8 }, uFlash: { value: 0 }, uDissolve: { value: 0 }, uTime: { value: 0 }, uSpan: { value: 400 },
  };
}
function phoenixMaterial(src, U) {
  const m = new THREE.MeshStandardMaterial({ map: src.map, emissiveMap: src.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.62, metalness: 0,
    side: THREE.DoubleSide, alphaTest: 0.42, transparent: false });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPh;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n vPh = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uC0, uC1, uC2, uC3, uC4; uniform float uRecolor, uGlow, uRim, uFlash, uDissolve, uTime, uSpan; varying vec3 vPh;
        float phHash(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float phNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
          return mix(mix(mix(phHash(i), phHash(i + vec3(1, 0, 0)), f.x), mix(phHash(i + vec3(0, 1, 0)), phHash(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(phHash(i + vec3(0, 0, 1)), phHash(i + vec3(1, 0, 1)), f.x), mix(phHash(i + vec3(0, 1, 1)), phHash(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float phEdge = 0.;
        {
          // 按亮度重映射到凤凰的色板（暗处深红 → 橙金 → 羽缘 → 核心），保留羽毛的明暗纹理
          float l = dot(diffuseColor.rgb, vec3(.299, .587, .114)); l = pow(clamp(l * 1.3, 0., 1.), .8);
          vec3 ramp = l < .3 ? mix(uC4 * .5, uC0, l / .3) : l < .6 ? mix(uC0, uC1, (l - .3) / .3) : l < .86 ? mix(uC1, uC2, (l - .6) / .26) : mix(uC2, uC3, (l - .86) / .14);
          diffuseColor.rgb = mix(diffuseColor.rgb, ramp, uRecolor);
          // 消散：离身体越远（翼尖、尾梢）越先烧尽，边缘亮起
          if (uDissolve > 0.) {
            float r = clamp(length(vPh) / uSpan, 0., 1.);
            float n = phNoise(vPh / uSpan * 9. + vec3(0., uTime * .6, 0.));
            float th = uDissolve * 1.45 - (1. - r) * .45;
            if (n < th) discard;
            phEdge = smoothstep(th + .14, th, n);
          }
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= mix(uC1, uC3, .35) * uGlow * 1.8;
        { float rim = pow(1. - abs(dot(normal, normalize(vViewPosition))), 2.2);
          totalEmissiveRadiance += mix(uC0, uC1, rim) * rim * uRim + uC3 * (uFlash * .8 + phEdge * 2.6); }`);
  };
  m.customProgramCacheKey = () => 'phoenix-r21';
  return m;
}

export class PhoenixRig {
  // gltf：assets/converted/phoenix/phoenix.glb
  constructor(gltf) {
    this.root = new THREE.Group();
    this.root.name = 'phoenix';
    this.model = cloneSkinned(gltf.scene);
    this.model.rotation.y = -Math.PI / 2;           // 素材的喙朝 +X；转成以 +Z 为前方
    this.root.add(this.model);
    this.U = makeUniforms();
    this.meshes = [];
    const mats = new Map();
    this.model.traverse((o) => {
      if (o.isMesh) {
        const src = Array.isArray(o.material) ? o.material : [o.material];
        const out = src.map((m) => { if (!mats.has(m)) mats.set(m, phoenixMaterial(m, this.U)); return mats.get(m); });
        o.material = Array.isArray(o.material) ? out : out[0];
        o.frustumCulled = false;                    // 蒙皮网格的包围盒不随动作更新
        o.castShadow = true;
        this.meshes.push(o);
      }
    });
    this.materials = [...mats.values()];
    this.bones = {};
    this.model.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });
    // 动作：振翅循环
    const clip = gltf.animations.find((a) => a.name === 'fly') || gltf.animations[0];
    this.mixer = new THREE.AnimationMixer(this.model);
    this.fly = this.mixer.clipAction(clip);
    this.fly.play();
    this.clipDur = clip.duration;
    // 参考姿势（逐骨的本地四元数）：展翼滑翔取 glideFrame
    this.wingBones = Object.keys(this.bones).filter((n) => /Wing|Tail_|Hair_(2[2-9]|3[0-9]|4[0-3])/.test(n));
    this.glide = this.sample(PHOENIX.model.glideFrame / 30, this.wingBones);
    // 本地坐标系里的几个方向（由骨骼实际位置求，不假设轴向）：前（颈 → 喙）、上、右
    this.mixer.setTime(PHOENIX.model.glideFrame / 30);
    this.model.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.model.matrixWorld).invert();
    const mp = (name) => this.bones[name].getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const head = mp('b_Head'), tail = mp('B_Tail_3'), L = mp('B_Left_Wing_8'), R = mp('B_Right_Wing_8');
    this.ax = { fwd: head.clone().sub(tail).setY(0).normalize(), up: new THREE.Vector3(0, 1, 0) };
    this.ax.right = new THREE.Vector3().crossVectors(this.ax.fwd, this.ax.up).normalize();
    // 哪只翅在右边（逻辑里按身体左右收翅）
    this.leftSign = Math.sign(L.clone().sub(R).dot(this.ax.right)) || -1;
    // 叠加层的本地增量（按参考姿势的父骨朝向求出，之后每帧按权重 slerp 上去）
    this.deltas = this.buildDeltas();
    // 消散的尺度（顶点在网格本地坐标里的半个翼展）
    const geo = this.meshes[0]?.geometry;
    if (geo) { geo.computeBoundingBox(); const s = new THREE.Vector3(); geo.boundingBox.getSize(s); this.U.uSpan.value = Math.max(s.x, s.y, s.z) * 0.5; }
    // 第二十二轮：尺寸（根节点本地、尺度 1；滑翔参考姿势下的蒙皮顶点）——绕身的半径按半翼展算，离刀时喙尖对准剑尖
    this.dims = this.measure();
    this.mixer.setTime(0);
    this.st = { glide: 0, fold: 0, attack: 0, hit: 0, turn: 0 };
    this.flash = 0;
  }
  // 动作在 t 秒时这些骨骼的本地四元数
  sample(t, names) {
    this.mixer.setTime(t);
    const out = {};
    for (const n of names) out[n] = this.bones[n].quaternion.clone();
    return out;
  }
  // 父骨在模型本地的朝向（参考姿势下）
  modelQuat(bone, out) {
    this.model.updateMatrixWorld(true);
    const qm = this.model.getWorldQuaternion(_q3).invert();
    return out.copy(qm).multiply(bone.getWorldQuaternion(_q2));
  }
  // 模型空间里绕 axis 转 ang 的旋转，换成骨骼本地的左乘增量：q_local' = inv(Qp) · R · Qp · q_local
  localDelta(bone, axis, ang) {
    const Qp = bone.parent?.isBone ? this.modelQuat(bone.parent, new THREE.Quaternion()) : new THREE.Quaternion();
    const R = new THREE.Quaternion().setFromAxisAngle(axis, ang);
    return Qp.clone().invert().multiply(R).multiply(Qp);
  }
  buildDeltas() {
    const B = this.bones, A = this.ax, D = {};
    // 先摆到滑翔参考姿势，增量都按它求
    for (const n of this.wingBones) B[n].quaternion.copy(this.glide[n]);
    const side = (name) => (/Left/.test(name) ? this.leftSign : -this.leftSign);       // +1 = 在身体右侧
    // 俯冲收翅：肩骨绕上轴往后掠、绕前轴往下压；前臂（Wing_2）再往后折
    D.fold = [];
    for (const s of ['Left', 'Right']) {
      const sg = side(`B_${s}_Wing_0`);
      const sh = B[`B_${s}_Wing_0`], fa = B[`B_${s}_Wing_2`];
      // 绕上轴转 +θ 会把右侧的翅转向前方，所以往后掠是 −sg；绕前轴转 +φ 会把右翅压低，左翅要 −φ
      if (sh) D.fold.push([sh, this.localDelta(sh, A.up, -sg * 1.05).multiply(this.localDelta(sh, A.fwd, sg * 0.35))]);
      if (fa) D.fold.push([fa, this.localDelta(fa, A.up, -sg * 0.75)]);
    }
    // 攻击：颈前探下压、头低、下颌张开；翅前扑（肩骨绕上轴往前）
    D.attack = [];
    // 绕右轴转 +a 是抬头，前探下压用 −a
    for (const [n, a] of [['b_Neck_0', -0.32], ['b_Neck_1', -0.22], ['b_Head', -0.18]]) if (B[n]) D.attack.push([B[n], this.localDelta(B[n], A.right, a)]);
    if (B.B_Jaw) D.attack.push([B.B_Jaw, this.localDelta(B.B_Jaw, A.right, -0.5)]);
    for (const s of ['Left', 'Right']) { const b = B[`B_${s}_Wing_0`]; if (b) D.attack.push([b, this.localDelta(b, A.up, side(`B_${s}_Wing_0`) * 0.45)]); }
    // 受击：脊后仰、颈一缩
    D.hit = [];
    for (const [n, a] of [['B_Spine', 0.3], ['b_Neck_0', 0.35], ['b_Head', 0.2]]) if (B[n]) D.hit.push([B[n], this.localDelta(B[n], A.right, a)]);
    // 转向：尾羽往弯的内侧扫（turn = +1 右转）
    D.turn = [];
    for (const [n, a] of [['B_Tail_0', 0.35], ['B_Tail_1', 0.2], ['B_Tail_2', 0.15]]) if (B[n]) D.turn.push([B[n], this.localDelta(B[n], A.up, a)]);
    return D;
  }
  // 根节点本地（尺度 1）的包围盒、身体中心（骨盆）、喙尖（头的高度、最前沿）：{ half 半翼展, len 身长, center, beak, box }
  measure() {
    for (const n of this.wingBones) this.bones[n].quaternion.copy(this.glide[n]);
    const r = this.root, keepP = r.position.clone(), keepQ = r.quaternion.clone(), keepS = r.scale.clone();
    r.position.set(0, 0, 0); r.quaternion.identity(); r.scale.setScalar(1);
    r.updateMatrixWorld(true);
    const box = new THREE.Box3(), v = new THREE.Vector3();
    for (const m of this.meshes) {
      const n = m.geometry.attributes.position.count;
      for (let i = 0; i < n; i += 3) { m.getVertexPosition(i, v); box.expandByPoint(v.applyMatrix4(m.matrixWorld)); }
    }
    const at = (name) => (this.bones[name] ? this.bones[name].getWorldPosition(new THREE.Vector3()) : new THREE.Vector3());
    const center = at('B_Pelvis'), head = at('b_Head');
    const out = { half: Math.max(-box.min.x, box.max.x), len: box.max.z - box.min.z, center, beak: new THREE.Vector3(head.x, head.y, box.max.z), box };
    r.position.copy(keepP); r.quaternion.copy(keepQ); r.scale.copy(keepS);
    r.updateMatrixWorld(true);
    return out;
  }
  // 根节点本地的一点（尺度 1 的坐标）按当前朝向与尺度换成相对根节点的世界偏移
  offset(local, out) { return out.copy(local).multiplyScalar(this.root.scale.x).applyQuaternion(this.root.quaternion); }
  setScale(s) { this.root.scale.setScalar(s); }
  // 放到世界里：pos 身体中心，dir 飞行方向（三维单位向量），bank 侧倾（弧度，正为向右倾）
  place(pos, dir, bank = 0) {
    this.root.position.copy(pos);
    const f = _v.copy(dir).normalize();
    const up0 = Math.abs(f.y) > 0.98 ? _w.set(0, 0, 1) : _w.set(0, 1, 0);
    const r = new THREE.Vector3().crossVectors(up0, f).normalize(), u = new THREE.Vector3().crossVectors(f, r).normalize();
    const m = new THREE.Matrix4().makeBasis(r, u, f);
    this.root.quaternion.setFromRotationMatrix(m);
    if (bank) this.root.quaternion.multiply(_q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -bank));
  }
  // st：{ flap 振翅倍速, glide / fold / attack / hit 0…1, turn −1…1, dissolve 0…1, glow, recolor }
  update(dt, st = {}) {
    const S = this.st, k = Math.min(1, dt * 7);
    for (const key of ['glide', 'fold', 'attack', 'hit', 'turn']) S[key] += ((st[key] ?? 0) - S[key]) * (key === 'hit' ? Math.min(1, dt * 14) : k);
    this.fly.timeScale = st.flap ?? 1;
    this.mixer.update(dt);
    const B = this.bones;
    if (S.glide > 0.001) for (const n of this.wingBones) B[n].quaternion.slerp(this.glide[n], S.glide);
    const apply = (list, w) => { if (Math.abs(w) < 0.001) return; for (const [b, d] of list) { _q.copy(ID).slerp(d, Math.min(1, Math.abs(w))); if (w < 0) _q.invert(); b.quaternion.premultiply(_q); } };
    apply(this.deltas.fold, S.fold);
    apply(this.deltas.attack, S.attack);
    apply(this.deltas.hit, S.hit);
    apply(this.deltas.turn, S.turn);
    this.flash = Math.max(0, this.flash - dt * 4);
    const U = this.U;
    U.uTime.value += dt;
    U.uDissolve.value = st.dissolve ?? 0;
    U.uGlow.value = st.glow ?? 0.9;
    U.uFlash.value = this.flash;
    if (st.recolor != null) U.uRecolor.value = st.recolor;
  }
  hitFlash(v = 1) { this.flash = Math.max(this.flash, v); }
  // 骨骼的世界位置（尾焰、翼尖拖尾、吐息的口部）
  bonePos(name, out) { const b = this.bones[name]; return b ? b.getWorldPosition(out) : out.copy(this.root.position); }
  dispose() {
    this.root.parent?.remove(this.root);
    for (const m of this.materials) m.dispose();
    this.mixer.stopAllAction();
  }
}

// 载入一次，之后每次召唤都复用同一只（同时最多一只凤凰）
export function makePhoenixRig(gltf) { return gltf ? new PhoenixRig(gltf) : null; }
