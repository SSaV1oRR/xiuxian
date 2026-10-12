// 技能特效（第十四轮）：一张灰度贴图集（Kenney「Particle Pack」，CC0；tools/make_vfx_atlas.py）+ 三类效果
//   · 粒子：实例化四边形。位置、大小、旋转、透明度全在着色器里按出生时刻推算（初速、重力、阻尼、由小到大、淡入淡出），
//     发射只写一次数据，之后不再上传。四种朝向：
//       0 面向镜头（光点、星芒、烟团）  1 沿速度拉长（火花、光痕、剑雨的流光）
//       2 自定平面（两根轴 U、V 张成：刀光弧、剑气月牙、竖立的光环）  3 贴地（冲击波、法阵、焦痕，绕竖轴自转）
//     加色（光）与普通混合（烟、尘、焦痕）各一个实例化网格、各一次绘制，环形缓冲。
//   · 剑光拖尾：剑尖、剑根两条轨迹之间的带子，按 Catmull-Rom 补点，越旧越淡越窄。
//   · 残影：把修士身体的两个蒙皮网格按某一刻的骨骼姿势定格成一层青光（边缘亮、中间透），渐隐。
// 颜色、大小、寿命由调用方（game/skillfx.js 的各招式）决定；这里只管画。不受场景雾影响，也不投影。
import * as THREE from 'three';

let ATLAS = null;            // { tex, cols, rows, tiles }
export async function loadVfxAtlas(base = './assets/converted/vfx/') {
  const [meta, tex] = await Promise.all([
    fetch(base + 'atlas.json').then((r) => r.json()),
    new THREE.TextureLoader().loadAsync(base + 'atlas.png'),
  ]);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  ATLAS = { tex, cols: meta.cols, rows: meta.rows, tiles: meta.tiles };
  return ATLAS;
}
export const tile = (name) => (typeof name === 'number' ? name : ATLAS?.tiles[name] ?? 0);
export const getAtlas = () => ATLAS;
function placeholderAtlas() {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  t.needsUpdate = true;
  return { tex: t, cols: 8, rows: 6, tiles: {} };
}

const VERT = /* glsl */`
  uniform float uTime;
  attribute vec4 iA, iB, iC, iD, iE, iF, iG;
  varying vec2 vUv; varying vec4 vCol;
  void main() {
    float age = uTime - iA.w, life = iB.w, u = age / life;
    if (u < 0. || u > 1.) { gl_Position = vec4(2., 2., 2., 1.); vCol = vec4(0.); vUv = vec2(0.); return; }
    float g = iG.x, drag = iG.y;
    float fv = drag > .001 ? (1. - exp(-drag * age)) / drag : age;
    vec3 p = iA.xyz + iB.xyz * fv - vec3(0., .5 * g * age * age, 0.);
    vec3 vel = iB.xyz * exp(-drag * age) - vec3(0., g * age, 0.);
    float e = 1. - (1. - u) * (1. - u);
    float size = mix(iC.w, iD.w, e);
    float rot = iF.z + iF.w * age;
    vec2 c = position.xy;
    float cs = cos(rot), sn = sin(rot);
    vec2 rc = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
    float mode = iF.y;
    vec3 wp;
    if (mode < .5) {
      vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      wp = p + (R * rc.x + U * rc.y) * size;
    } else if (mode < 1.5) {
      float sp = length(vel);
      vec3 dir = sp > 1e-4 ? vel / sp : vec3(0., 1., 0.);
      vec3 side = cross(dir, normalize(cameraPosition - p));
      side = length(side) > 1e-4 ? normalize(side) : vec3(1., 0., 0.);
      wp = p + side * c.x * size + dir * c.y * size * (1. + iG.w * sp);
    } else if (mode < 2.5) {
      wp = p + (iC.xyz * rc.x + iD.xyz * rc.y) * size;
    } else {
      wp = p + vec3(rc.x, 0., rc.y) * size;
    }
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
    float fin = iG.z > 0. ? smoothstep(0., iG.z, u) : 1.;
    float fout = 1. - smoothstep(iE.a < 0. ? .2 : .55, 1., u);
    vCol = vec4(iE.rgb, abs(iE.a) * fin * fout);
    float t = iF.x, col = mod(t, COLS), row = floor(t / COLS);
    vUv = vec2((col + c.x + .5) / COLS, (ROWS - row - 1. + c.y + .5) / ROWS);
  }`;

// 粒子池：一个实例化网格（加色或普通混合）
class Pool {
  constructor(scene, cap, additive) {
    this.cap = cap; this.head = 0; this.lo = Infinity; this.hi = -1; this.wrapped = false;
    const g = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1);
    g.index = q.index; g.setAttribute('position', q.attributes.position);
    this.attr = {};
    for (const k of ['iA', 'iB', 'iC', 'iD', 'iE', 'iF', 'iG']) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(k, a); this.attr[k] = a;
    }
    this.attr.iB.array.fill(0);
    for (let i = 0; i < cap; i++) { this.attr.iA.array[i * 4 + 3] = -1e9; this.attr.iB.array[i * 4 + 3] = 1; }
    g.instanceCount = cap;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAtlas: { value: ATLAS.tex } },
      defines: { COLS: ATLAS.cols.toFixed(1), ROWS: ATLAS.rows.toFixed(1) },
      vertexShader: VERT,
      fragmentShader: additive
        ? 'uniform sampler2D uAtlas; varying vec2 vUv; varying vec4 vCol; void main(){ float a = texture2D(uAtlas, vUv).r; gl_FragColor = vec4(vCol.rgb * a * vCol.a, 1.); }'
        : 'uniform sampler2D uAtlas; varying vec2 vUv; varying vec4 vCol; void main(){ float a = texture2D(uAtlas, vUv).r * vCol.a; if (a < .004) discard; gl_FragColor = vec4(vCol.rgb, a); }',
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 9 : 8;
    this.mesh.name = additive ? 'vfx-add' : 'vfx-alpha';
    scene.add(this.mesh);
  }
  write(o, now) {
    const i = this.head, k = i * 4, A = this.attr;
    this.head = (i + 1) % this.cap;
    if (this.head === 0) this.wrapped = true;
    this.lo = Math.min(this.lo, i); this.hi = Math.max(this.hi, i);
    const p = o.p, v = o.v, s = o.size, c = o.color;
    A.iA.array.set([p.x, p.y, p.z, now + (o.delay || 0)], k);
    A.iB.array.set([v ? v.x : 0, v ? v.y : 0, v ? v.z : 0, o.life || 0.5], k);
    const s0 = Array.isArray(s) ? s[0] : s ?? 1, s1 = Array.isArray(s) ? s[1] : s0;
    A.iC.array.set([o.u ? o.u.x : 1, o.u ? o.u.y : 0, o.u ? o.u.z : 0, s0], k);
    A.iD.array.set([o.w ? o.w.x : 0, o.w ? o.w.y : 1, o.w ? o.w.z : 0, s1], k);
    A.iE.array.set([c.r, c.g, c.b, (o.alpha ?? 1) * (o.early ? -1 : 1)], k);
    A.iF.array.set([tile(o.tile), o.mode || 0, o.rot || 0, o.spin || 0], k);
    A.iG.array.set([o.gravity || 0, o.drag || 0, o.fadeIn || 0, o.stretch || 0], k);
  }
  flush(now) {
    this.mat.uniforms.uTime.value = now;
    if (this.hi < 0) return;
    for (const a of Object.values(this.attr)) {
      if (this.wrapped) a.addUpdateRange(0, this.cap * 4);
      else a.addUpdateRange(this.lo * 4, (this.hi - this.lo + 1) * 4);
      a.needsUpdate = true;
    }
    this.lo = Infinity; this.hi = -1; this.wrapped = false;
  }
  moveTo(scene) { scene.add(this.mesh); }
}

// 剑光拖尾：每帧记下剑尖、剑根；画最近 span 秒内的轨迹（补点后最多 n 段）
export class Trail {
  constructor(scene, n = 40) {
    this.n = n; this.samples = []; this.on = false; this.span = 0.16;
    this.color = new THREE.Color(0xbfefff); this.core = new THREE.Color(0xffffff); this.k = 1;
    const pos = new Float32Array(n * 2 * 3), aT = new Float32Array(n * 2), aS = new Float32Array(n * 2), idx = [];
    for (let i = 0; i < n; i++) { aS[i * 2] = 1; aS[i * 2 + 1] = 0; }
    for (let i = 0; i < n - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aT', new THREE.BufferAttribute(aT, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
    g.setIndex(idx);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: this.color }, uCore: { value: this.core }, uK: { value: 1 } },
      vertexShader: 'attribute float aT, aS; varying float vT, vS; void main(){ vT = aT; vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform vec3 uColor, uCore; uniform float uK; varying float vT, vS;
        void main(){
          float age = clamp(vT, 0., 1.);
          float body = pow(1. - age, 1.8) * smoothstep(0., .45, vS) * .55;      // 剑尖一侧亮，剑根一侧淡
          float edge = smoothstep(.7, 1., vS) * pow(1. - age, 2.6);            // 剑刃外沿一道亮线
          vec3 c = (uColor * body + mix(uColor, uCore, .55) * edge) * uK;
          gl_FragColor = vec4(c, 1.);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.mesh.visible = false;
    this.mesh.name = 'vfx-trail';
    scene.add(this.mesh);
  }
  push(tip, base, now) {
    this.samples.unshift({ tip: tip.clone(), base: base.clone(), t: now });
    while (this.samples.length > 16) this.samples.pop();
  }
  update(now) {
    const S = this.samples;
    while (S.length && now - S[S.length - 1].t > this.span) S.pop();
    if (S.length < 2) { this.mesh.visible = false; return; }
    const pos = this.geo.attributes.position.array, aT = this.geo.attributes.aT.array, n = this.n;
    // 沿采样补点（Catmull-Rom），从新到旧
    const pts = [];
    const sub = Math.max(1, Math.floor((n - 1) / (S.length - 1)));
    for (let i = 0; i < S.length - 1 && pts.length < n; i++) {
      const p0 = S[Math.max(0, i - 1)], p1 = S[i], p2 = S[i + 1], p3 = S[Math.min(S.length - 1, i + 2)];
      for (let j = 0; j < sub && pts.length < n; j++) {
        const u = j / sub;
        pts.push([cr(p0.tip, p1.tip, p2.tip, p3.tip, u), cr(p0.base, p1.base, p2.base, p3.base, u), (now - (p1.t + (p2.t - p1.t) * u)) / this.span]);
      }
    }
    const last = S[S.length - 1];
    while (pts.length < n) pts.push([last.tip.clone(), last.base.clone(), 1]);
    for (let i = 0; i < n; i++) {
      const [t, b, a] = pts[i];
      // 越旧越窄：剑根一侧向剑尖收拢
      const w = 0.25 + 0.75 * (1 - Math.min(1, a));
      const bx = t.x + (b.x - t.x) * w, by = t.y + (b.y - t.y) * w, bz = t.z + (b.z - t.z) * w;
      pos.set([t.x, t.y, t.z, bx, by, bz], i * 6);
      aT[i * 2] = aT[i * 2 + 1] = a;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aT.needsUpdate = true;
    this.mat.uniforms.uK.value = this.k;
    this.mesh.visible = true;
  }
  clear() { this.samples.length = 0; this.mesh.visible = false; }
  moveTo(scene) { scene.add(this.mesh); }
}
const cr = (p0, p1, p2, p3, u) => {
  const u2 = u * u, u3 = u2 * u;
  return new THREE.Vector3(
    0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
    0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
    0.5 * (2 * p1.z + (-p0.z + p2.z) * u + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * u2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * u3));
};

// 残影：定格修士身体（布料、肌肤两个蒙皮网格）某一刻的姿势
const GHOST_VERT = /* glsl */`
  #include <common>
  #include <skinning_pars_vertex>
  varying vec3 vN; varying vec3 vV;
  void main() {
    #include <skinbase_vertex>
    #include <beginnormal_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    vec4 mv = modelViewMatrix * vec4(transformed, 1.);
    vN = normalize(normalMatrix * objectNormal); vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;
class Ghosts {
  constructor(scene, char, max = 10) {
    this.scene = scene; this.list = [];
    this.src = [];
    if (char.ghostSources) this.src = [...char.ghostSources];      // 第十五轮：金白修士（glb）的蒙皮网格
    else char.root.traverse((o) => { if (o.isSkinnedMesh && (o.name === 'rig-cloth' || o.name === 'rig-body')) this.src.push(o); });
    this.pool = [];
    for (let k = 0; k < max && this.src.length; k++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0x8fe6ff) }, uA: { value: 0 } },
        vertexShader: GHOST_VERT,
        fragmentShader: 'uniform vec3 uColor; uniform float uA; varying vec3 vN; varying vec3 vV; void main(){ float f = 1. - abs(dot(normalize(vN), normalize(vV))); f = .18 + .82 * f * f; gl_FragColor = vec4(uColor * f * uA, 1.); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const meshes = this.src.map((s) => {
        const bones = s.skeleton.bones.map(() => { const b = new THREE.Object3D(); b.matrixAutoUpdate = false; return b; });
        const m = new THREE.SkinnedMesh(s.geometry, mat);
        m.bind(new THREE.Skeleton(bones, s.skeleton.boneInverses), s.bindMatrix);
        m.matrixAutoUpdate = false; m.frustumCulled = false; m.renderOrder = 7; m.visible = false; m.name = 'vfx-ghost';
        scene.add(m);
        return m;
      });
      this.pool.push({ mat, meshes, t: 0, life: 0, a: 0, busy: false });
    }
  }
  spawn({ color = 0x8fe6ff, life = 0.35, alpha = 0.9 } = {}) {
    const g = this.pool.find((x) => !x.busy) || this.pool.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    if (!g) return;
    this.src.forEach((s, i) => {
      const m = g.meshes[i];
      s.updateMatrixWorld(true);
      m.matrix.copy(s.matrixWorld); m.matrixWorld.copy(s.matrixWorld);
      s.skeleton.bones.forEach((b, k) => { const pb = m.skeleton.bones[k]; pb.matrixWorld.copy(b.matrixWorld); });
      m.visible = true;
    });
    g.mat.uniforms.uColor.value.set(color);
    g.t = 0; g.life = life; g.a = alpha; g.busy = true;
  }
  update(dt) {
    for (const g of this.pool) {
      if (!g.busy) continue;
      g.t += dt;
      const u = g.t / g.life;
      g.mat.uniforms.uA.value = g.a * Math.max(0, 1 - u) * Math.min(1, u * 8 + 0.4);
      if (u >= 1) { g.busy = false; for (const m of g.meshes) m.visible = false; }
    }
  }
  moveTo(scene) { for (const g of this.pool) for (const m of g.meshes) scene.add(m); }
}

export class Vfx {
  // quality：0.5（流畅）… 1；char：修士（残影用）
  constructor(scene, { quality = 1, char = null } = {}) {
    if (!ATLAS) ATLAS = placeholderAtlas();
    this.q = quality;
    this.now = 0;
    this.add = new Pool(scene, quality < 1 ? 2048 : 4096, true);
    this.alpha = new Pool(scene, quality < 1 ? 512 : 1024, false);
    this.trail = new Trail(scene);
    this.ghosts = char ? new Ghosts(scene, char) : null;
    this._c = new THREE.Color();
  }
  // o：{ p, v, life, size（数或 [起, 止]）, color, alpha, tile, mode, rot, spin, gravity, drag, fadeIn, stretch, u, w（平面两轴）, delay, blend: 'alpha', early }
  spawn(o) {
    if (typeof o.color === 'number' || typeof o.color === 'string') o.color = this._c.set(o.color);
    else if (!o.color) o.color = this._c.set(0xffffff);
    (o.blend === 'alpha' ? this.alpha : this.add).write(o, this.now);
  }
  // 按画质缩减的粒子数
  n(k) { return Math.max(1, Math.round(k * this.q)); }
  update(dt) {
    this.now += dt;
    this.add.flush(this.now); this.alpha.flush(this.now);
    this.trail.update(this.now);
    this.ghosts?.update(dt);
  }
  moveTo(scene) { this.add.moveTo(scene); this.alpha.moveTo(scene); this.trail.moveTo(scene); this.ghosts?.moveTo(scene); }
}
