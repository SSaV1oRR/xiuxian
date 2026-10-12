// 护宗双龙：西侧寒玉台的冰龙、东侧赤岩台的火龙。
// 两条龙共用飞龙素材（assets/dragon/wyvern_animated，经 tools/convert_assets.py 转为 converted/dragon/dragon.glb）的网格、骨骼与动作，
// 但各自克隆骨骼（SkeletonUtils.clone），各自一套材质与贴图（冰 / 火两套底色与发光遮罩）、各自的动画混合器、发光强度与状态：
// 修改冰龙的材质、状态或动画不会影响火龙，反之亦然。
// 素材真实包含的动作：idle（待机，16.5 秒）、flap（振翅）、takeoff（起飞）、flying（飞行）、walk（行走）及几条旧版重复动作。
// 待机用 idle；转头由程序在颈椎与头骨上叠加（素材没有转头动作）；警戒时离台升空、以 flying 循环悬停注视来敌，警戒解除后落回台上转入 idle。
// （实测 flap 与 takeoff 是空中振翅：下扑时翼尖低于脚底约 10–12 米，在台上播放会扫进台面与山坡，故不用；flying 循环里身体整体抬高，翼尖不低于台面 1 米。）
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { ASSETS } from './assets.js';
import { injectFog, GLOBAL, FOGU, shaderMaterial } from './shaderlib.js';
import { Builder, C } from './arch/builder.js';
import { plaqueMesh } from './arch/arch.js';
import { PADS, DRAGON_SITES, SMALL_STEPS, PATHS } from './layout.js';
import { DRAGON_COMBAT } from '../game/combatConfig.js';
import { scannedRocks } from './models.js';
import { pavilion } from './arch/arch.js';
import { stoneLanternR, flameSprites, brazier } from './arch/ornaments.js';
import { waterfall } from './falls.js';
import { damp, clamp, wrapAngle, mulberry32 } from '../core/math.js';

const padOf = (id) => PADS.find((p) => p.id === id);
const LIFT = 5.14;              // 模型原点到待机姿态最低点的距离（素材试载时实测，缩放前）
const HOVER = 8.0;              // 警戒悬停时比待机抬高的距离（模型单位）：flying 循环的最深下扑为脚底以下 7.4

// 两种外观：底色、发光遮罩与颜色、眼睛、整体色调、待机动作快慢
export const LOOKS = {
  ice: { name: '冰龙', title: '护宗神龙 · 寒玉台', map: 'dragon_ice', glow: 'dragon_glow_ice', emissive: 0x6fd2ff, glowK: 0.55, eye: 0x9fe6ff, color: [0.97, 1.0, 1.05], rough: 0.82, timeScale: 0.82, idleAt: 3.1 },
  fire: { name: '火龙', title: '护宗神龙 · 赤岩台', map: 'dragon_fire', glow: 'dragon_glow_fire', emissive: 0xff6418, glowK: 0.42, eye: 0xffa22e, color: [0.95, 0.86, 0.82], rough: 0.9, timeScale: 1.0, idleAt: 9.4 },
};

function bodyMaterial(L, u) {
  const T = ASSETS.tex;
  const m = new THREE.MeshStandardMaterial({
    map: T[L.map], normalMap: T.dragon_n, roughnessMap: T.dragon_r, roughness: L.rough, metalness: 0.04,
    emissiveMap: T[L.glow], emissive: new THREE.Color(L.emissive), emissiveIntensity: L.glowK, side: THREE.DoubleSide,
  });
  m.color.setRGB(...L.color);
  m.name = 'dragon-body-' + L.name;
  m.onBeforeCompile = (sh) => {
    injectFog(sh);
    sh.uniforms.uGlow = u.uGlow;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= uGlow;');
  };
  m.customProgramCacheKey = () => 'dragon-body';
  return m;
}
function eyeMaterial(L, u) {
  const m = new THREE.MeshStandardMaterial({ map: ASSETS.tex.dragon_eye, roughness: 0.25, metalness: 0, emissive: new THREE.Color(L.eye), emissiveMap: ASSETS.tex.dragon_eye, emissiveIntensity: 0.9 });
  m.name = 'dragon-eye-' + L.name;
  m.onBeforeCompile = (sh) => {
    injectFog(sh);
    sh.uniforms.uGlow = u.uGlow;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= .6 + uGlow * .8;');
  };
  m.customProgramCacheKey = () => 'dragon-eye';
  return m;
}

// ---------- 粒子：冰龙的霜雾与细雪、火龙的火星与烟 ----------
function particles(kind, center, rand) {
  const ice = kind === 'ice';
  const n = ice ? 150 : 140, pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2, r = (ice ? 3 : 1.5) + Math.sqrt(rand()) * (ice ? 13 : 9);
    pos.set([Math.cos(a) * r, 0, Math.sin(a) * r], i * 3);
    // x：种子；y：类别（冰：0 霜雾 / 1 细雪；火：0 火星 / 1 烟）；z、w：随机
    seed.set([rand(), ice ? (i < 70 ? 0 : 1) : (i < 110 ? 0 : 1), rand(), rand()], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const u = { uTime: GLOBAL.uTime, uLevel: { value: 1 } };
  const mat = shaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: ice ? THREE.NormalBlending : THREE.AdditiveBlending,
    vertexPars: 'attribute vec4 aSeed; uniform float uTime, uLevel; varying float vA; varying float vK; varying float vS;',
    vertex: ice ? `
      float k = aSeed.y; vK = k; vS = aSeed.x;
      vec3 p = position;
      float t = uTime * (k < .5 ? .025 : .09) + aSeed.x * 7.;
      if (k < .5) {      // 霜雾：贴台面缓缓绕行、起伏
        float a = t * (.6 + aSeed.z * .5);
        p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
        p.y = .6 + 1.6 * aSeed.w + .5 * sin(t * 3. + aSeed.z * 6.);
        vA = (.10 + .08 * aSeed.z) * uLevel;
      } else {           // 细雪：自高处飘落
        float f = fract(t);
        p.y = 18. * (1. - f); p.x += sin(t * 9. + aSeed.z * 6.) * .8;
        vA = smoothstep(0., .1, f) * smoothstep(1., .85, f) * .75;
      }
      vec4 mvPosition = modelViewMatrix * vec4(p, 1.);
      gl_PointSize = (k < .5 ? 520. + 380. * aSeed.w : 14. + 10. * aSeed.w) / -mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;` : `
      float k = aSeed.y; vK = k; vS = aSeed.x;
      vec3 p = position;
      float f = fract(uTime * (k < .5 ? .16 + .1 * aSeed.z : .045) + aSeed.x);
      p.y = (k < .5 ? 14. : 9.) * f;
      p.x += sin(uTime * 2.3 + aSeed.z * 9.) * (k < .5 ? .6 : 1.5) * f;
      p.z += cos(uTime * 1.7 + aSeed.w * 9.) * (k < .5 ? .6 : 1.5) * f;
      vA = (k < .5 ? smoothstep(0., .08, f) * (1. - f) * (.6 + .4 * sin(uTime * 23. + aSeed.z * 40.)) : smoothstep(0., .2, f) * (1. - f) * .16) * uLevel;
      vec4 mvPosition = modelViewMatrix * vec4(p, 1.);
      gl_PointSize = (k < .5 ? 26. + 30. * aSeed.w : 900. + 600. * aSeed.w * f) / -mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;`,
    fragmentPars: 'varying float vA; varying float vK; varying float vS;',
    fragment: ice ? `
      vec2 q = gl_PointCoord - .5; float d = length(q);
      float a = vK < .5 ? smoothstep(.5, .0, d) * (.6 + .4 * nzv(q * 3. + vS * 9.)) : smoothstep(.5, .15, d);
      gl_FragColor = vec4(vK < .5 ? vec3(.86, .93, 1.) : vec3(.95, .98, 1.), a * vA);` : `
      vec2 q = gl_PointCoord - .5; float d = length(q);
      float a = vK < .5 ? smoothstep(.5, .05, d) : smoothstep(.5, .0, d) * (.6 + .4 * nzv(q * 3. + vS * 9.));
      vec3 c = vK < .5 ? mix(vec3(1., .82, .45), vec3(1., .35, .08), vS) * 1.6 : vec3(.18, .14, .12);
      gl_FragColor = vec4(c * a * vA, vK < .5 ? 0. : a * vA);       // 预乘透明：火星为纯叠加，烟为半透明覆盖`,
  });
  if (!ice) { mat.blending = THREE.CustomBlending; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor; }
  const pts = new THREE.Points(g, mat);
  pts.position.copy(center);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  pts.userData.u = u;
  return pts;
}

// 呼气：冰龙吐出一团霜雾，火龙鼻端喷出火舌与烟（待机时偶尔一次，警戒时更频繁）
function breathPuff(kind) {
  const n = 46, pos = new Float32Array(n * 3), seed = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) seed.set([Math.random(), Math.random()], i * 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
  const u = { uT: { value: 9 }, uDir: { value: new THREE.Vector3(0, 0, 1) } };
  const ice = kind === 'ice';
  const mat = shaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: ice ? THREE.NormalBlending : THREE.AdditiveBlending,
    vertexPars: 'attribute vec2 aSeed; uniform float uT; uniform vec3 uDir; varying float vA; varying float vS;',
    vertex: `
      float t = uT - aSeed.x * .35; vS = aSeed.y;
      vec3 side = normalize(cross(uDir, vec3(0., 1., 0.)) + 1e-4);
      vec3 p = uDir * t * (5. + 4. * aSeed.y) + side * (aSeed.y - .5) * t * 3. + vec3(0., 1., 0.) * (aSeed.x - .4) * t * 2.5;
      vA = t > 0. ? smoothstep(0., .08, t) * smoothstep(1.4, .3, t) : 0.;
      vec4 mvPosition = modelViewMatrix * vec4(p, 1.);
      gl_PointSize = (180. + 520. * t) / -mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;`,
    fragmentPars: 'varying float vA; varying float vS;',
    fragment: ice ? `float d = length(gl_PointCoord - .5); gl_FragColor = vec4(vec3(.88, .95, 1.), smoothstep(.5, .0, d) * vA * .5);`
      : `float d = length(gl_PointCoord - .5); vec3 c = mix(vec3(1., .85, .4), vec3(1., .3, .05), vS) * 1.4; gl_FragColor = vec4(c * smoothstep(.5, .0, d) * vA, 1.);`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 4;
  pts.userData.u = u;
  return pts;
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _side = new THREE.Vector3();
const _qw = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _ql = new THREE.Quaternion();

export class Dragon {
  constructor(ctx, kind) {
    const S = DRAGON_SITES[kind], L = LOOKS[kind], pad = padOf(S.plat);
    this.kind = kind; this.look = L; this.cfg = DRAGON_COMBAT[kind]; this.site = S;
    this.name = L.name;
    this.base = new THREE.Vector3(S.x, pad.y + S.top, S.z);
    this.yaw0 = Math.atan2(S.face[0] - S.x, S.face[1] - S.z);
    const src = ASSETS.models.dragon;
    const root = this.root = cloneSkinned(src.scene);
    root.name = 'dragon-' + kind;
    this.u = { uGlow: { value: 1 } };
    this.bodyMat = bodyMaterial(L, this.u);
    this.eyeMat = eyeMaterial(L, this.u);
    this.meshes = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      const eye = /^Material\.(005|011|003)$/.test(o.material.name);
      o.material = eye ? this.eyeMat : this.bodyMat;
      o.castShadow = true; o.receiveShadow = !eye;
      this.meshes.push(o);
    });
    root.scale.setScalar(S.scale);
    root.position.set(this.base.x, this.base.y + LIFT * S.scale, this.base.z);
    root.rotation.y = this.yaw0;
    ctx.scene.add(root);
    // 动作：各自的混合器
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = Object.fromEntries(src.animations.map((a) => [a.name, a]));
    this.act = {};
    for (const n of ['idle', 'flap', 'takeoff', 'flying']) if (this.clips[n]) this.act[n] = this.mixer.clipAction(this.clips[n]);
    this.act.idle.play();
    this.act.idle.time = L.idleAt;
    this.act.idle.timeScale = L.timeScale;
    this.current = 'idle';
    // 颈椎与头骨（转头叠加）
    const bones = {};
    root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    this.bones = bones;
    this.neck = ['spine009', 'spine018', 'spine010', 'spine017', 'head'].map((n) => bones[n]).filter(Boolean);
    this.neckW = [0.12, 0.16, 0.2, 0.24, 0.28];
    this.head = bones.head; this.jaw = bones.jaw;
    this.ly = 0; this.lp = 0;
    this.hover = 0;             // 0 驻守（落在台上）→ 1 警戒悬停
    this.target = null;
    this.lookT = 4 + Math.random() * 4; this.lookPoint = null;
    // 姿态包围球（蒙皮网格）：以待机姿态计算并放大，供视锥剔除
    this.mixer.update(0.01);
    root.updateMatrixWorld(true);
    for (const m of this.meshes) if (m.isSkinnedMesh) { m.computeBoundingSphere(); m.boundingSphere.radius *= 1.7; }
    // 状态：guard 驻守 / watch 注视来人 / alert 警戒（协助防御）
    this.state = 'guard';
    this.alertT = 0;
    this.hits = new Map();      // 冰龙：记录每个目标的命中次数（每两次冻结一次）
    this.cool = 1.5;
    const rand = mulberry32(kind === 'ice' ? 11 : 23);
    this.fx = particles(kind, new THREE.Vector3(this.base.x, this.base.y, this.base.z), rand);
    ctx.scene.add(this.fx);
    this.puff = breathPuff(kind);
    ctx.scene.add(this.puff);
    this.puffT = 6 + Math.random() * 10;
    // 身体碰撞（以待机姿态的脊椎位置为准）：玩家可以绕龙走动，不能穿过身体
    for (const [n, r, h] of [['spine004', 3.4, 7], ['spine007', 3.0, 8], ['spine019', 1.9, 9]]) {
      const b = bones[n]; if (!b) continue;
      const p = b.getWorldPosition(_v1);
      ctx.cw.addCyl({ x: p.x, z: p.z, y0: this.base.y - 0.2, y1: this.base.y + h, r, walk: false });
    }
  }

  // 嘴部（喷吐起点）的世界坐标与朝向
  mouth(out = new THREE.Vector3()) {
    const h = this.head.getWorldPosition(out);
    const f = _v2.set(Math.sin(this.root.rotation.y + this.ly), 0, Math.cos(this.root.rotation.y + this.ly));
    return h.addScaledVector(f, 1.6 * this.site.scale);
  }

  play(name, fade = 0.6) {
    if (this.current === name || !this.act[name]) return;
    const a = this.act[name], b = this.act[this.current];
    a.reset(); a.timeScale = name === 'idle' ? this.look.timeScale : 1; a.play();
    if (b) b.crossFadeTo(a, fade, false);
    this.current = name;
  }

  // 世界空间里，把注视方向的偏航与俯仰按权重分配到颈椎与头骨上，叠加在动作姿态之上
  applyLook(dt) {
    let wy = 0, wp = 0.05;
    if (this.target) {
      const hp = this.head.getWorldPosition(_v1);
      const dx = this.target.x - hp.x, dy = this.target.y - hp.y, dz = this.target.z - hp.z;
      wy = clamp(wrapAngle(Math.atan2(dx, dz) - this.root.rotation.y), -1.2, 1.2);
      wp = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.45, 0.4);
    }
    const k = damp(this.state === 'alert' ? 3.2 : 1.4, dt);
    this.ly += (wy - this.ly) * k; this.lp += (wp - this.lp) * k;
    const ry = this.root.rotation.y;
    _side.set(Math.cos(ry), 0, -Math.sin(ry));
    for (let i = 0; i < this.neck.length; i++) {
      const b = this.neck[i], w = this.neckW[i];
      _qw.setFromAxisAngle(_up, this.ly * w).multiply(_q2.setFromAxisAngle(_side, -this.lp * w));
      b.parent.updateWorldMatrix(true, false);
      b.parent.getWorldQuaternion(_qp);
      _ql.copy(_qp).invert().multiply(_qw).multiply(_qp);
      b.quaternion.premultiply(_ql);
    }
  }

  // world：{ player, camera, threat（最近的敌对单位，可为空）, alert（宗门遭入侵）, combat }
  update(dt, world) {
    const cam = world.camera.position;
    const far = cam.distanceTo(this.base) > 420;
    this.skip = far ? (this.skip || 0) + 1 : 0;
    if (far && this.skip % 4) return;            // 很远时每 4 帧更新一次动作
    const step = far ? dt * 4 : dt;
    // 状态与注视目标
    const p = world.player.pos;
    const threat = world.threat || null;
    if (threat || world.alert) { this.state = 'alert'; this.alertT = DRAGON_COMBAT.calmDelay; }
    else if (this.alertT > 0) { this.alertT -= step; if (this.alertT <= 0) this.state = 'guard'; }
    else this.state = Math.hypot(p.x - this.base.x, p.z - this.base.z) < 38 && Math.abs(p.y - this.base.y) < 20 ? 'watch' : 'guard';
    if (this.state === 'alert') {
      // 无具体目标时（入侵刚开始、来敌尚远）昂首望向宗门外的山口
      this.target = threat ? _v2.copy(threat.pos).setY(threat.pos.y + 1.2).clone()
        : (this.target || new THREE.Vector3(this.base.x + Math.sin(this.yaw0) * 60, this.base.y + 12, this.base.z + Math.cos(this.yaw0) * 60));
      if (this.current !== 'flying' && this.act.flying) this.play('flying', 0.9);       // 振翅离台，悬停警戒
    } else if (this.state === 'watch') {
      this.target = new THREE.Vector3(p.x, p.y + 1.5, p.z);
    } else {
      this.lookT -= step;
      if (this.lookT <= 0) {
        this.lookT = 8 + Math.random() * 8;
        const r = Math.random();
        this.lookPoint = r < 0.35 ? null : r < 0.6 ? new THREE.Vector3(0, 30, -60) : r < 0.8 ? new THREE.Vector3(0, 8, 100)
          : new THREE.Vector3(this.base.x + Math.sin(this.yaw0 + (Math.random() - 0.5) * 2) * 60, this.base.y + 25, this.base.z + Math.cos(this.yaw0 + (Math.random() - 0.5) * 2) * 60);
      }
      this.target = this.lookPoint;
    }
    // 警戒解除：等 flying 循环避开 5.4 秒处的深下扑，再交叉淡入 idle；淡入完成后才降回台面
    if (this.state !== 'alert' && this.current === 'flying') {
      const ft = this.act.flying.time % this.act.flying.getClip().duration;
      if (ft < 4.4 || ft > 6.6) this.play('idle', 1.4);
    }
    // 悬停高度：flying 循环里翼尖最深下扑到脚底以下 7.4 米（实测），悬停抬高 8 米（模型单位），翼尖不触台面与山坡
    const up = this.current === 'flying' || (this.act.flying && this.act.flying.getEffectiveWeight() > 0.03) ? 1 : 0;
    this.hover += (up - this.hover) * damp(up ? 1.3 : 0.9, step);
    this.root.position.y = this.base.y + (LIFT + this.hover * HOVER) * this.site.scale;
    // 警戒时身体略向来敌转动（转角按台面大小限定，免得尾翼扫出台外、扫进山坡）；平时回到驻守朝向
    const tl = this.site.turn ?? 0.3;
    const want = this.state === 'alert' && threat ? clamp(wrapAngle(Math.atan2(threat.pos.x - this.base.x, threat.pos.z - this.base.z) - this.yaw0), -tl, tl) : 0;
    this.root.rotation.y = this.yaw0 + wrapAngle(this.root.rotation.y - this.yaw0) + (want - wrapAngle(this.root.rotation.y - this.yaw0)) * damp(0.8, step);
    this.mixer.update(step);
    this.applyLook(step);
    // 出手：警戒中、目标进入攻击范围、冷却结束——冰龙吐寒息，火龙吐火球（数值见 combatConfig.js）
    this.cool -= step;
    if (threat && threat.alive && world.combat && this.cool <= 0) {
      const hp = this.head.getWorldPosition(_v1);
      if (hp.distanceTo(threat.pos) < this.cfg.range) {
        world.combat.dragonAttack(this, threat);
        this.cool = this.cfg.cooldown * (0.9 + Math.random() * 0.2);
        this.castT = 0.6;
        this.puffT = 0.01;
      }
    }
    if (this.castT > 0) this.castT -= step;
    // 发光：缓慢呼吸；警戒时更亮；入夜更显
    const t = GLOBAL.uTime.value;
    this.u.uGlow.value = (0.85 + 0.15 * Math.sin(t * (this.kind === 'ice' ? 0.9 : 1.6))) * (this.state === 'alert' ? 1.9 : this.state === 'watch' ? 1.15 : 1) * (1 + FOGU.uNight.value * 0.5) * (1 + Math.max(0, this.castT || 0) * 1.6);
    this.fx.userData.u.uLevel.value = this.state === 'alert' ? 1.6 : 1;
    // 偶尔呼气
    this.puffT -= step;
    const pu = this.puff.userData.u;
    if (this.puffT <= 0) {
      this.puffT = this.state === 'alert' ? 4 + Math.random() * 3 : 18 + Math.random() * 16;
      this.mouth(this.puff.position);
      pu.uDir.value.set(Math.sin(this.root.rotation.y + this.ly), Math.sin(this.lp) * 0.5 - 0.1, Math.cos(this.root.rotation.y + this.ly)).normalize();
      pu.uT.value = 0;
    }
    pu.uT.value += step;
  }
}

// ---------- 停驻台 ----------
// 寒玉台：依山凿出的八角玉白台，台面刻霜纹，前有石阶；台下一方寒潭（冰面、石沿、寒雾）
// 赤岩台：红岩堆叠的平台，岩缝透出暗红火光，西侧石阶接观云台
export function buildDragonTerraces(ctx) {
  const out = {};
  {
    const S = DRAGON_SITES.ice, pad = padOf(S.plat), y = pad.y, top = y + S.top, pc = padOf(S.pool);
    const st = SMALL_STEPS.find((s) => s.id === 'iceSteps').from;
    const front = Math.atan2(st[1] - pad.cz, st[0] - pad.cx);          // 朝向石阶顶端：台前踏步与望柱缺口
    const b = new Builder();
    b.push(pad.cx, y, pad.cz);
    b.cyl(pad.r + 0.6, pad.r + 1.0, 0.5, 0x87918f, 0, 0.25 - 0.2, 0, { seg: 8, mat: 'stone', col: false });
    b.cyl(pad.r, pad.r + 0.3, S.top - 0.3, 0xaeb9b5, 0, 0.3 + (S.top - 0.3) / 2, 0, { seg: 8, mat: 'stoneSmooth', col: false });
    b.cyl(pad.r - 0.2, pad.r, 0.3, 0xc3ccc8, 0, S.top - 0.15, 0, { seg: 8, mat: 'stoneSmooth', col: false });
    b.cylCollider(0, -0.5, S.top, 0, pad.r - 0.1, { walk: true });
    // 八角望柱，柱头覆霜
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) / 8 * Math.PI * 2, r = pad.r - 0.45;
      if (Math.abs(wrapAngle(a - front)) < 0.45) continue;                 // 踏步一侧不立柱
      b.cyl(0.26, 0.3, 1.25, 0xb9c4c0, Math.cos(a) * r, S.top + 0.62, Math.sin(a) * r, { seg: 6, mat: 'stoneSmooth' });
      b.sphere(0.3, 0xe8f0f2, Math.cos(a) * r, S.top + 1.35, Math.sin(a) * r, { mat: 'stoneSmooth', sy: 0.7 });
    }
    // 台前踏步（自石阶顶端的平地登台）：每级不超过 0.34 米，最上一级压进台沿
    // 踏步自台前地面起步（台前地面比台基低一点时多加一级），每级不超过 0.34 米
    const sa = front, foot = Math.min(0, ctx.ground(pad.cx + Math.cos(sa) * (pad.r + 2.4), pad.cz + Math.sin(sa) * (pad.r + 2.4)) - y - 0.02);
    const rise = S.top - foot, n = Math.ceil(rise / 0.34);
    b.push(Math.cos(sa) * (pad.r + 0.6), 0, Math.sin(sa) * (pad.r + 0.6), Math.PI / 2 - sa);
    for (let k = 0; k < n; k++) b.slab(4.2, rise * (k + 1) / n + 0.4, 0.5, 0xa9b4b0, 0, foot - 0.4, (n - 1 - k) * 0.5 - 0.45, { mat: 'stoneSmooth' });
    b.pop();
    b.pop();
    // 寒潭：石沿与冰面
    b.push(pc.cx, pc.y, pc.cz);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, r = pc.r - 0.1;
      b.add(new THREE.DodecahedronGeometry(1, 0), 0x8d9798, 'stone', { x: Math.cos(a) * r, y: 0.15, z: Math.sin(a) * r, sx: 0.75, sy: 0.38, sz: 0.55, ry: a, col: false });
    }
    b.cylCollider(0, -1, 0.35, 0, pc.r - 0.6, { walk: false });
    b.pop();
    const g = ctx.place(b, { name: '寒玉台', foot: { w: pad.r * 2, d: pad.r * 2, kind: 'terrace', name: '寒玉台' } });
    // 台面霜纹（发冷光的阵纹）与寒潭冰面：自定义着色
    const frost = new THREE.Mesh(new THREE.CircleGeometry(pad.r - 0.6, 48), runeMaterial('ice'));
    frost.rotation.x = -Math.PI / 2; frost.position.set(pad.cx, top + 0.02, pad.cz); frost.renderOrder = 2;
    ctx.scene.add(frost);
    const ice = new THREE.Mesh(new THREE.CircleGeometry(pc.r - 0.5, 40), iceMaterial());
    ice.rotation.x = -Math.PI / 2; ice.position.set(pc.cx, pc.y + 0.06, pc.cz);
    ice.receiveShadow = true;
    ctx.scene.add(ice);
    // 题刻
    const pl = plaqueMesh('寒玉台', 1.6, 0.6, { bg: '#d8e2e0', fg: '#4a6a78', frame: '#b8c6c6', w: 420, h: 160 });
    pl.position.set(pc.cx + 3.2, pc.y + 1.1, pc.cz + 2.6); pl.rotation.y = 2.4;
    ctx.scene.add(pl);
    // 冰晶簇：台后岩壁下与寒潭边
    const crystals = [];
    for (let i = 0; i < 9; i++) {
      const a = front + Math.PI + (i - 4) * 0.22, r = pad.r - 0.4 + (i % 3) * 0.5;
      crystals.push([pad.cx + Math.cos(a) * r, top - 0.1, pad.cz + Math.sin(a) * r, 0.5 + (i * 37 % 10) / 14, a]);
    }
    for (let i = 0; i < 5; i++) { const a = i * 1.3 + 0.4; crystals.push([pc.cx + Math.cos(a) * (pc.r + 0.3), pc.y, pc.cz + Math.sin(a) * (pc.r + 0.3), 0.35 + i * 0.07, a]); }
    ctx.scene.add(iceCrystals(crystals));
    out.ice = { group: g, top };
    ctx.anchors.dragonIce = { x: pad.cx + Math.cos(front) * (pad.r - 3.2), y: top, z: pad.cz + Math.sin(front) * (pad.r - 3.2) };
    // ---------- 寒潭圣地：观冰亭、潭水溢出成瀑（落进下方溪谷）、潭边冰灯 ----------
    {
      const sb = new Builder();
      const ax = pc.cx + Math.cos(2.1) * 8.4, az = pc.cz + Math.sin(2.1) * 8.4, ay = ctx.ground(ax, az);
      sb.push(ax, ay - 0.15, az, 0.3);
      pavilion(sb, { n: 6, r: 2.1, h: 3.1, base: 0.45, benches: true, entrance: 4, glaze: true, roofColor: 0x5d7c8c, pillar: 0xdfe8ea, beam: 0x6e8f9c, finial: 0xe8f4f8 });
      sb.pop();
      // 潭口石唇（溢水处）：潭东南侧
      const la = 0.82, lx = pc.cx + Math.cos(la) * (pc.r - 0.2), lz = pc.cz + Math.sin(la) * (pc.r - 0.2);
      sb.slab(2.4, 0.3, 1.0, 0x9fb0b2, lx, pc.y - 0.12, lz, { ry: -la + Math.PI / 2, mat: 'stoneSmooth', col: false });
      for (const da of [0.75, 1.5]) stoneLanternR(sb, pc.cx + Math.cos(la + da) * (pc.r + 0.9), pc.y, pc.cz + Math.sin(la + da) * (pc.r + 0.9), 0.85, 0);   // 潭南侧（不挡登台的石阶口）
      ctx.place(sb, { name: '寒潭圣地', id: 'icePavilion', fade: true, foot: { w: 5.4, d: 5.4, kind: 'small' } });
      ctx.footprints[ctx.footprints.length - 1].x = ax; ctx.footprints[ctx.footprints.length - 1].z = az;
      const fy = pc.y + 0.12, fx = pc.cx + Math.cos(la) * (pc.r + 0.15), fz = pc.cz + Math.sin(la) * (pc.r + 0.15);
      const drop = fy - ctx.ground(pc.cx + Math.cos(la) * (pc.r + 5.5), pc.cz + Math.sin(la) * (pc.r + 5.5));
      waterfall(ctx.scene, { x: fx, y: fy, z: fz, ry: Math.atan2(Math.cos(la), Math.sin(la)), len: Math.max(3, drop + 0.6), w: 1.6, spread: 0.8, out: 1.6, lit: ctx.skyU?.uCloudLit, shade: ctx.skyU?.uCloudShade });
      ctx.emitters.push({ kind: 'mist', x: pc.cx + Math.cos(la) * (pc.r + 4.5), y: fy - drop + 0.4, z: pc.cz + Math.sin(la) * (pc.r + 4.5), rate: 1.4 });
    }
  }
  {
    const S = DRAGON_SITES.fire, pad = padOf(S.plat), y = pad.y, top = y + S.top;
    const pe = PATHS.find((p) => p.id === 'firePath').pts.at(-1);
    const sa = Math.atan2(pe[1] - pad.cz, pe[0] - pad.cx);             // 朝向石径尽头：登台石阶
    const b = new Builder(), rand = mulberry32(77);
    b.push(pad.cx, y, pad.cz);
    b.cyl(pad.r - 0.3, pad.r + 0.8, S.top, 0x5a2b22, 0, S.top / 2 - 0.1, 0, { seg: 13, mat: 'stone', col: false });
    b.cylCollider(0, -0.5, S.top, 0, pad.r - 0.4, { walk: true });
    // 台缘堆叠的红岩（实拍扫描山石着赤褐色）
    const rim = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + rand() * 0.2, r = pad.r - 0.1 + rand() * 1.1;
      if (Math.abs(wrapAngle(a - sa)) < 0.36) continue;                 // 石阶一侧留出登台口
      const s = 1.0 + rand() * 1.4;
      rim.push([pad.cx + Math.cos(a) * r, y + S.top * 0.35, pad.cz + Math.sin(a) * r, s, rand() * 6]);
      b.cylCollider(Math.cos(a) * r, 0, S.top + s * 0.7, Math.sin(a) * r, s * 0.85);
    }
    ctx.scene.add(scannedRocks(rim, [0.62, 0.34, 0.27]));
    // 登台石阶
    // 登台石阶从石径尽头的标高起步（比台基低），每级不超过 0.34 米
    const base = Math.min(0, pe[2] - y), rise = S.top - base, n = Math.ceil(rise / 0.34);
    b.push(Math.cos(sa) * (pad.r + 0.5), 0, Math.sin(sa) * (pad.r + 0.5), Math.PI / 2 - sa);
    for (let k = 0; k < n; k++) b.slab(3.6, rise * (k + 1) / n, 0.5, 0x5e3026, 0, base, (n - 1 - k) * 0.5 - 0.65, { mat: 'stone' });
    b.pop();
    b.pop();
    const g = ctx.place(b, { name: '赤岩台', foot: { w: pad.r * 2, d: pad.r * 2, kind: 'terrace', name: '赤岩台' } });
    const lava = new THREE.Mesh(new THREE.CircleGeometry(pad.r - 0.7, 48), runeMaterial('fire'));
    lava.rotation.x = -Math.PI / 2; lava.position.set(pad.cx, top + 0.02, pad.cz); lava.renderOrder = 2;
    ctx.scene.add(lava);
    const pl = plaqueMesh('赤岩台', 1.6, 0.6, { bg: '#3a1c16', fg: '#e09a52', frame: '#5a2b22', w: 420, h: 160 });
    pl.position.set(pad.cx + Math.cos(sa) * (pad.r + 2.6) + 1.6, y + 1.2, pad.cz + Math.sin(sa) * (pad.r + 2.6) - 1.2); pl.rotation.y = -0.8;
    ctx.scene.add(pl);
    out.fire = { group: g, top };
    ctx.anchors.dragonFire = { x: pad.cx + Math.cos(sa) * (pad.r - 3.0), y: top, z: pad.cz + Math.sin(sa) * (pad.r - 3.0) };
    // ---------- 赤岩圣地：登台口一对赤岩门柱（鎏金火焰顶）、两只火盆，台周一圈红枫；东侧临东谷之崖 ----------
    {
      const fb = new Builder(), flames = [];
      for (const s of [-1, 1]) {
        const a = sa + s * 0.36, r = pad.r + 2.4, x = pad.cx + Math.cos(a) * r, z = pad.cz + Math.sin(a) * r, gy = ctx.ground(x, z);
        flames.push(brazier(fb, x, gy, z, 1.0));
        const a2 = sa + s * 0.5, r2 = pad.r + 5.2, x2 = pad.cx + Math.cos(a2) * r2, z2 = pad.cz + Math.sin(a2) * r2, g2 = ctx.ground(x2, z2);
        fb.slab(1.0, 0.4, 1.0, 0x4a241c, x2, g2 - 0.1, z2, { mat: 'stone' });
        fb.cyl(0.36, 0.42, 4.2, 0x7a2f22, x2, g2 + 0.3 + 2.1, z2, { seg: 8, mat: 'stone' });
        fb.add(new THREE.TorusGeometry(0.44, 0.06, 5, 14), C.gold, 'gold', { x: x2, y: g2 + 3.9, z: z2, rx: Math.PI / 2, col: false });
        fb.add(new THREE.ConeGeometry(0.28, 0.9, 7), C.gold, 'gold', { x: x2, y: g2 + 4.95, z: z2, col: false });
        fb.sphere(0.24, 0xff7a30, x2, g2 + 4.62, z2, { mat: 'glow', seg: 10, seg2: 8 });
      }
      ctx.place(fb, { name: '赤岩圣地' });
      ctx.scene.add(flameSprites(flames));
      for (const [da, rr, s] of [[0.95, 6.0, 0.95], [1.55, 7.2, 1.05], [2.25, 6.4, 0.9], [-0.95, 6.2, 1.0], [-1.6, 7.0, 0.95], [-2.3, 6.0, 1.05], [3.0, 7.5, 0.9]]) {
        const a = sa + da, x = pad.cx + Math.cos(a) * (pad.r + rr), z = pad.cz + Math.sin(a) * (pad.r + rr);
        (ctx.extraVeg ||= []).push(['maple', x, z, s]);
      }
    }
  }
  return out;
}

// 冰晶簇：细长的八面体，冰蓝透光、边缘发白，入夜微亮
function iceCrystals(list) {
  const geo = new THREE.OctahedronGeometry(1, 0);
  geo.scale(0.35, 1.6, 0.35);
  const mat = new THREE.MeshStandardMaterial({ color: 0xbfe6f5, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.82, emissive: 0x5fb8e0, emissiveIntensity: 0.25 });
  mat.onBeforeCompile = (sh) => {
    injectFog(sh);
    sh.uniforms.uNight = FOGU.uNight;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1. + uNight * 2.5;');
  };
  mat.customProgramCacheKey = () => 'ice-crystal';
  const n = list.length * 3, im = new THREE.InstancedMesh(geo, mat, n);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), Sv = new THREE.Vector3();
  let k = 0;
  for (const [x, y, z, s, a] of list) for (let j = 0; j < 3; j++) {
    const tilt = (j - 1) * 0.35;
    Q.setFromEuler(E.set(tilt * Math.cos(a), a + j, tilt * Math.sin(a)));
    const ss = s * (j === 1 ? 1 : 0.65);
    im.setMatrixAt(k++, M4.compose(V.set(x + (j - 1) * 0.35 * s, y + 1.3 * ss, z + (j - 1) * 0.2 * s), Q, Sv.set(ss, ss, ss)));
  }
  im.castShadow = true;
  im.computeBoundingSphere();
  return im;
}

// 台面纹样：冰龙台为发冷光的霜纹圈；火龙台为暗红岩缝（裂纹透出熔岩光，缓慢明灭）
function runeMaterial(kind) {
  const ice = kind === 'ice';
  return shaderMaterial({
    uniforms: { uTime: GLOBAL.uTime, uNight: FOGU.uNight },
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    blending: ice ? THREE.NormalBlending : THREE.AdditiveBlending,
    vertexPars: 'varying vec2 vP;',
    vertex: 'vP = position.xy; vec4 mvPosition = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mvPosition;',
    fragmentPars: 'uniform float uTime, uNight; varying vec2 vP;',
    fragment: ice ? `
      float r = length(vP), a = atan(vP.y, vP.x);
      float ring = smoothstep(.09, .0, abs(r - 9.6)) + smoothstep(.07, .0, abs(r - 6.2)) * .8;
      float spokes = smoothstep(.06, .0, abs(fract(a / 6.2832 * 12.) - .5) * r * .52) * step(6.2, r) * step(r, 9.6);
      float frost = smoothstep(.62, .9, nzf(vP * .55)) * smoothstep(11., 4., r);
      float k = clamp(ring + spokes * .7, 0., 1.);
      vec3 c = mix(vec3(.85, .93, .97), vec3(.55, .85, 1.), k);
      gl_FragColor = vec4(c * (1. + k * (.3 + uNight)), k * .55 + frost * .35);` : `
      // 扭曲的维诺图裂纹：主裂缝宽、支缝细，宽窄随噪声变化，只在台面中部成网
      vec2 w = vP + (vec2(nzv(vP * .21), nzv(vP * .21 + 5.2)) - .5) * 6.;
      float edge = 0.;
      for (int k = 0; k < 2; k++) {
        vec2 p = w * (k == 0 ? .2 : .55) + float(k) * 3.7;
        vec2 i = floor(p), f = fract(p); float d1 = 9., d2 = 9.;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(float(x), float(y)); vec2 o = vec2(nzh(i + g), nzh(i + g + 7.3));
          float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
        float wdt = (k == 0 ? .1 : .05) * (.4 + nzv(w * .6 + float(k) * 9.));
        edge = max(edge, smoothstep(wdt, .0, d2 - d1) * (k == 0 ? 1. : .55 * smoothstep(.45, .7, nzv(w * .3 + 2.))));
      }
      float pulse = .6 + .4 * sin(uTime * 1.1 + w.x * .35 + w.y * .25);
      float fade = smoothstep(10.6, 6.5, length(vP)) * (.55 + .45 * nzv(vP * .4));
      vec3 c = mix(vec3(.9, .22, .04), vec3(1., .62, .2), edge) * edge * pulse * fade * (1.1 + uNight * 1.5);
      gl_FragColor = vec4(c, 1.);`,
  });
}

function iceMaterial() {
  return shaderMaterial({
    uniforms: { uTime: GLOBAL.uTime },
    vertexPars: 'varying vec3 vW; varying vec2 vP;',
    vertex: 'vP = position.xy; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;',
    fragmentPars: 'uniform float uTime; varying vec3 vW; varying vec2 vP;',
    fragment: `
      vec3 V = normalize(cameraPosition - vW);
      float fr = pow(1. - max(V.y, 0.), 3.);
      float cr = smoothstep(.06, .0, abs(nzv(vP * 1.3) - .5)) * .6 + smoothstep(.04, .0, abs(nzv(vP * 3.1 + 4.) - .5)) * .35;
      float fro = smoothstep(.55, .85, nzf(vP * .9)) + smoothstep(2.2, 4.2, length(vP)) * .6;
      vec3 deep = vec3(.16, .32, .42), surf = vec3(.62, .80, .90);
      vec3 c = mix(deep, surf, .35 + fr * .55);
      c = mix(c, vec3(.9, .96, 1.), clamp(cr + fro * .7, 0., 1.));
      gl_FragColor = vec4(c, 1.);`,
  });
}
