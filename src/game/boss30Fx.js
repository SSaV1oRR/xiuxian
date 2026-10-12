// 第二十四轮：烬狱剑尊的火焰特效与地面预警（素材：assets/special effects/fire 两个 unitypackage 里的贴图，tools/r24_build_fire.py 转成单通道强度、
// 拼成两张贴图集；颜色统一在着色器里按火焰配色上：核心 #FFF1C1、金橙 #FFB247、主火 #F05A28、深红 #8D241D、炭黑 #171416）。
//   · 火焰粒子池（实例化四边形，加色与普通混合各一套、两张贴图集各一套）：火舌序列帧、火星、光晕、浓烟、地上的焦痕；
//     位置、大小、转动、序列帧、热度（决定颜色：热 → 核心白金，冷 → 深红）都在着色器里按出生时刻推算，发射只写一次；
//   · 地面预警（以图案、边线、亮度与音效区分，不只靠颜色）：圆（踏火震、火柱、重坠的落点）、环（焚环裂地：内外安全区另画平静的虚线环）、
//     火浪的通道（向外推的箭纹）、焚天断界的大阵（火纹法阵、越来越亮的边、外圈安全区的流光）；
//   · 剑上的火（拖尾 + 沿剑身的火舌）、火浪、火柱、环爆、落地冲击、残留的地火、焚天断界的爆发、火盆的火、二阶段身上的余烬。
// 点光源只用一个固定的小池（4 盏，按需亮灭）。震屏、闪光统一经 shake / flash（乘设置里的强度）。流畅画质只减粒子数（视觉密度），不改判定。
import * as THREE from 'three';
import { Trail } from '../world/vfx.js';
import { BOSS30 } from './boss30Config.js';

const C30 = BOSS30.colors;
const R = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3(), _u = new THREE.Vector3();
const RAMP = /* glsl */`
  uniform vec3 uCore, uGold, uMain, uDeep, uChar;
  vec3 ramp(float k){ k = clamp(k, 0., 1.); return k < .3 ? mix(uDeep, uMain, k / .3) : k < .68 ? mix(uMain, uGold, (k - .3) / .38) : mix(uGold, uCore, (k - .68) / .32); }`;
const palette = () => ({ uCore: { value: new THREE.Color(C30.core) }, uGold: { value: new THREE.Color(C30.gold) }, uMain: { value: new THREE.Color(C30.main) }, uDeep: { value: new THREE.Color(C30.deep) }, uChar: { value: new THREE.Color(C30.char) } });

// ---------- 粒子池 ----------
const PVERT = /* glsl */`
  uniform float uTime;
  attribute vec4 iA, iB, iC, iD, iE, iF, iG, iH;
  varying vec2 vUv; varying vec3 vE; varying float vU;
  void main() {
    float age = uTime - iA.w, life = iB.w, u = age / life;
    if (u < 0. || u > 1.) { gl_Position = vec4(2., 2., 2., 1.); vE = vec3(0.); vUv = vec2(0.); vU = 1.; return; }
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
      vec3 Rv = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), Uv = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      wp = p + (Rv * rc.x + Uv * rc.y) * size;
    } else if (mode < 1.5) {
      float sp = length(vel);
      vec3 dir = sp > 1e-4 ? vel / sp : vec3(0., 1., 0.);
      vec3 side = cross(dir, normalize(cameraPosition - p));
      side = length(side) > 1e-4 ? normalize(side) : vec3(1., 0., 0.);
      wp = p + side * c.x * size + dir * c.y * size * (1. + iG.w * sp);
    } else if (mode < 2.5) {
      wp = p + (iC.xyz * rc.x + iD.xyz * rc.y) * size;
    } else if (mode < 3.5) {
      wp = p + vec3(rc.x, 0., rc.y) * size;
    } else {
      // 竖立、绕竖轴朝镜头（火苗、火柱的火舌：只转不倾）
      vec3 toC = cameraPosition - p; toC.y = 0.; toC = length(toC) > 1e-4 ? normalize(toC) : vec3(0., 0., 1.);
      vec3 sd = vec3(toC.z, 0., -toC.x);
      wp = p + sd * c.x * size + vec3(0., 1., 0.) * (c.y + .5) * size * (1. + iG.w);
    }
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
    float fin = iG.z > 0. ? smoothstep(0., iG.z, u) : 1.;
    float fout = 1. - smoothstep(.55, 1., u);
    vE = vec3(mix(iE.x, iE.y, u), iE.z * fin * fout, iE.w);
    vU = u;
    // 序列帧：iH.x 帧数（≤1 为单张），iH.y 每秒帧数（0：整个寿命放完一遍）
    float frames = max(1., iH.x);
    float fr = iH.y > 0. ? mod(floor(age * iH.y), frames) : min(frames - 1., floor(u * frames));
    float t = iF.x + fr, col = mod(t, GRID), row = floor(t / GRID);
    vUv = vec2((col + c.x + .5) / GRID, (GRID - row - 1. + c.y + .5) / GRID);
  }`;
class Pool {
  constructor(scene, tex, grid, cap, additive, name) {
    this.cap = cap; this.head = 0; this.lo = Infinity; this.hi = -1; this.wrapped = false;
    const g = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1);
    g.index = q.index; g.setAttribute('position', q.attributes.position);
    this.attr = {};
    for (const k of ['iA', 'iB', 'iC', 'iD', 'iE', 'iF', 'iG', 'iH']) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); this.attr[k] = a;
    }
    for (let i = 0; i < cap; i++) { this.attr.iA.array[i * 4 + 3] = -1e9; this.attr.iB.array[i * 4 + 3] = 1; }
    g.instanceCount = cap;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAtlas: { value: tex }, ...palette() },
      defines: { GRID: grid.toFixed(1) },
      vertexShader: PVERT,
      // vE：x 热度（0 冷 … 1 白热）、y 透明度、z 着色方式（0 火：按热度上色，强度越高越热；1 烟：炭黑到深红；2 原色白光）
      fragmentShader: `${RAMP}
        uniform sampler2D uAtlas; varying vec2 vUv; varying vec3 vE; varying float vU;
        void main(){
          float a = texture2D(uAtlas, vUv).r;
          ${additive ? `
          vec3 c = vE.z < .5 ? ramp(vE.x * (.55 + .6 * a)) : vE.z < 1.5 ? mix(uChar, uDeep, vE.x) : mix(uGold, uCore, a);
          gl_FragColor = vec4(c * a * vE.y * 1.35, 1.);` : `
          float al = a * vE.y; if (al < .004) discard;
          vec3 c = vE.z < 1.5 ? mix(uChar, uDeep * .8, vE.x) : vec3(.05, .04, .04);
          gl_FragColor = vec4(c, al);`}
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 9 : 8; this.mesh.name = 'b30fx-' + name;
    scene.add(this.mesh);
  }
  write(o, now) {
    const i = this.head, k = i * 4, A = this.attr;
    this.head = (i + 1) % this.cap;
    if (this.head === 0) this.wrapped = true;
    this.lo = Math.min(this.lo, i); this.hi = Math.max(this.hi, i);
    const p = o.p, v = o.v, s = o.size;
    A.iA.array[k] = p.x; A.iA.array[k + 1] = p.y; A.iA.array[k + 2] = p.z; A.iA.array[k + 3] = now + (o.delay || 0);
    A.iB.array[k] = v ? v.x : 0; A.iB.array[k + 1] = v ? v.y : 0; A.iB.array[k + 2] = v ? v.z : 0; A.iB.array[k + 3] = o.life || 0.5;
    const s0 = Array.isArray(s) ? s[0] : s ?? 1, s1 = Array.isArray(s) ? s[1] : s0;
    A.iC.array[k] = o.u ? o.u.x : 1; A.iC.array[k + 1] = o.u ? o.u.y : 0; A.iC.array[k + 2] = o.u ? o.u.z : 0; A.iC.array[k + 3] = s0;
    A.iD.array[k] = o.w ? o.w.x : 0; A.iD.array[k + 1] = o.w ? o.w.y : 1; A.iD.array[k + 2] = o.w ? o.w.z : 0; A.iD.array[k + 3] = s1;
    const h = o.heat ?? [0.9, 0.3];
    A.iE.array[k] = Array.isArray(h) ? h[0] : h; A.iE.array[k + 1] = Array.isArray(h) ? h[1] : h; A.iE.array[k + 2] = o.alpha ?? 1; A.iE.array[k + 3] = o.shade ?? 0;
    A.iF.array[k] = o.tile; A.iF.array[k + 1] = o.mode || 0; A.iF.array[k + 2] = o.rot || 0; A.iF.array[k + 3] = o.spin || 0;
    A.iG.array[k] = o.gravity || 0; A.iG.array[k + 1] = o.drag || 0; A.iG.array[k + 2] = o.fadeIn || 0; A.iG.array[k + 3] = o.stretch || 0;
    A.iH.array[k] = o.frames || 1; A.iH.array[k + 1] = o.fps || 0; A.iH.array[k + 2] = 0; A.iH.array[k + 3] = 0;
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
  clear() { for (let i = 0; i < this.cap; i++) this.attr.iA.array[i * 4 + 3] = -1e9; this.attr.iA.needsUpdate = true; this.attr.iA.addUpdateRange(0, this.cap * 4); }
  live(now) { let n = 0; const A = this.attr.iA.array, B = this.attr.iB.array; for (let i = 0; i < this.cap; i++) { const t0 = A[i * 4 + 3]; if (t0 <= now && now < t0 + B[i * 4 + 3]) n++; } return n; }
  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

// ---------- 地面预警 ----------
// shape：0 圆（r）；1 环（r0..r，内外两侧画平静的安全纹）；2 通道（自锚点沿 +y 长 len、宽 w，向外推的箭纹）；3 大阵（r，火纹法阵 + 外圈安全区）
const TVERT = 'varying vec2 vL; void main(){ vL = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const TFRAG = /* glsl */`
  ${RAMP}
  uniform float uShape, uR, uR0, uLen, uW, uP, uA, uT, uHit, uSpin, uSafeR;
  uniform sampler2D uCircle, uNoise;
  varying vec2 vL;
  float band(float x, float w){ return 1. - smoothstep(w * .5, w * .5 + .05, abs(x)); }
  void main(){
    vec2 p = vL; float d = length(p), a = atan(p.x, p.y);
    float inside = 0., edge = 0., prog = 0., pat = 0., safe = 0.;
    float pulse = .75 + .25 * sin(uT * (6. + 14. * uP));
    if (uShape < .5 || uShape > 2.5) {
      inside = 1. - smoothstep(uR - .04, uR + .04, d);
      edge = band(d - (uR - .12), .2 + .08 * uP);
      prog = d / max(uR, .01);
      // 火纹法阵：慢慢转（大阵转得更慢），纹理只取亮线
      float ca = a + uT * uSpin, cr = d / max(uR, .01) * .5;
      vec2 cu = vec2(.5 + sin(ca) * cr, .5 + cos(ca) * cr);
      pat = smoothstep(.35, .8, texture2D(uCircle, cu).r);
      if (uShape > 2.5) {
        // 大阵：外圈（uR … uSafeR）是安全区——平静的流光虚线，不填色
        float ring = step(uR + .1, d) * step(d, uSafeR - .2);
        float dash = step(.5, fract(a * 9.5492 * 2. - uT * .4));
        safe = ring * (band(d - (uR + .8), .14) * dash * .9 + band(d - (uSafeR - .5), .1) * .5);
      }
    } else if (uShape < 1.5) {
      float inR = smoothstep(uR0 - .04, uR0 + .04, d) * (1. - smoothstep(uR - .04, uR + .04, d));
      inside = inR;
      edge = max(band(d - (uR - .12), .2), band(d - (uR0 + .12), .2));
      prog = (d - uR0) / max(uR - uR0, .01);
      float crk = texture2D(uNoise, p * .16 + vec2(0., uT * .05)).r;
      pat = smoothstep(.55, .8, crk) * inR;
      // 内外安全区：一圈细虚线（不填色）
      float dash = step(.5, fract(a * 9.5492 - uT * .3));
      safe = (band(d - (uR0 - .6), .1) * step(.6, uR0) + band(d - (uR + .7), .1)) * dash;
    } else {
      float hw = uW * .5;
      inside = step(abs(p.x), hw) * smoothstep(-.05, .05, p.y) * (1. - smoothstep(uLen - .05, uLen + .05, p.y));
      edge = (band(abs(p.x) - (hw - .1), .16) * step(0., p.y) * step(p.y, uLen) + band(p.y - (uLen - .08), .14) * step(abs(p.x), hw));
      prog = p.y / max(uLen, .01);
      // 向外推的箭纹（人字纹沿通道往外走）
      float chev = fract((p.y - abs(p.x) * .8) * .45 - uT * 1.6);
      pat = smoothstep(.0, .12, chev) * (1. - smoothstep(.22, .34, chev)) * inside;
    }
    edge = clamp(edge, 0., 1.);
    float fill = inside * step(prog, uP);
    float front = inside * (1. - smoothstep(0., .04, abs(prog - uP))) * step(.01, uP) * step(uP, .995);
    vec3 col = ramp(.35 + .5 * edge + .3 * front) ;
    float al = (edge * (.85 + .3 * pulse) + pat * (.35 + .4 * uP) + fill * .18 + inside * .06 + front * .7) * uA;
    al = max(al, inside * uHit * .7);
    col += vec3(1., .9, .7) * uHit;
    vec3 safeC = mix(uGold, uCore, .4);
    gl_FragColor = vec4(col * al + safeC * safe * uA * .8, 1.);
  }`;

export class Tele30 {
  // o：{ shape: 'circle' | 'ring' | 'lane' | 'zone', pos, yaw, r, r0, len, w, dur（填满的秒数）, safeR（大阵外沿）, spin }
  constructor(fx, o) {
    this.fx = fx;
    const shape = { circle: 0, ring: 1, lane: 2, zone: 3 }[o.shape] ?? 0;
    const size = shape === 2 ? Math.max(o.len, o.w) * 2 + 1 : ((o.safeR ?? o.r) + 1.6) * 2;
    this.U = {
      uShape: { value: shape }, uR: { value: o.r ?? 1 }, uR0: { value: o.r0 ?? 0 }, uLen: { value: o.len ?? 1 }, uW: { value: o.w ?? 1 }, uSafeR: { value: o.safeR ?? 0 },
      uP: { value: 0 }, uA: { value: 0 }, uT: { value: 0 }, uHit: { value: 0 }, uSpin: { value: o.spin ?? (shape === 3 ? 0.12 : 0.5) },
      uCircle: { value: fx.tex.circle }, uNoise: { value: fx.tex.lava }, ...palette(),
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: TVERT, fragmentShader: TFRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const m = this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.renderOrder = 5; m.frustumCulled = false;
    this.place(o.pos, o.yaw ?? 0);
    fx.scene.add(m);
    this.dur = o.dur ?? 1; this.t = 0; this.alive = true; this.hitT = 0; this.fadeOut = 0; this.follow = o.follow || null;
    fx.teles.add(this);
  }
  place(pos, yaw = this.yaw) { this.yaw = yaw; this.mesh.position.set(pos.x, (pos.y ?? 0) + 0.04, pos.z); this.mesh.rotation.set(-Math.PI / 2, yaw + Math.PI, 0, 'YXZ'); }
  set(k, v) { this.U[k].value = v; }
  hit() { this.hitT = 0.25; this.U.uP.value = 1; }
  remove(fade = 0.2) { if (this.fadeOut === 0) this.fadeOut = fade; }
  update(dt) {
    this.t += dt;
    const U = this.U;
    U.uT.value += dt;
    if (this.follow) this.follow(this);
    if (this.fadeOut > 0) {
      this.fadeLeft = (this.fadeLeft ?? this.fadeOut) - dt;
      U.uA.value = Math.max(0, this.fadeLeft / this.fadeOut) * (this.a0 ?? 1);
      if (this.fadeLeft <= 0) { this.dispose(); return false; }
    } else {
      U.uA.value = Math.min(1, this.t / 0.15); this.a0 = U.uA.value;
      U.uP.value = Math.min(1, this.t / Math.max(0.01, this.dur));
    }
    if (this.hitT > 0) { this.hitT -= dt; U.uHit.value = Math.max(0, this.hitT / 0.25); if (this.hitT <= 0 && this.fadeOut === 0) this.remove(0.25); }
    return true;
  }
  dispose() { this.alive = false; this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.fx.teles.delete(this); }
}

// ---------- 火柱、火浪的网格：滚动的火焰（噪声 + 配色）----------
const FLAME_VS = 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }';
function flameMat(k = 1, scroll = 3.2) {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 0 }, uK: { value: k }, uNoise: { value: null }, ...palette() },
    vertexShader: FLAME_VS,
    fragmentShader: `${RAMP}
      uniform float uT, uA, uK; uniform sampler2D uNoise; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float y = vUv.y;
        float n = texture2D(uNoise, vec2(vUv.x * 2., y * .8 - uT * ${(scroll * 0.25).toFixed(2)})).r * .6 + texture2D(uNoise, vec2(vUv.x * 4.1 + .3, y * 1.6 - uT * ${(scroll * 0.4).toFixed(2)})).r * .4;
        float body = smoothstep(.3, .85, n + (1. - y) * .35 - y * .25);
        float fade = (1. - smoothstep(.5, 1., y)) * smoothstep(0., .06, y);
        float heat = body * fade;
        gl_FragColor = vec4(ramp(heat * 1.1) * heat * pow(facing, .7) * uA * uK * 1.6, 1.);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

export class Boss30Fx {
  constructor(scene, { quality = 1 } = {}) {
    this.scene = scene; this.q = quality;
    this.now = 0; this.t = 0;
    this.teles = new Set();
    this.items = [];
    this.fxk = +(localStorage.getItem('qinglan.fxk') ?? 1);
    this.ready = false;
    this.shakeHook = null; this.flashHook = null;
    this.lights = [];
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(C30.main, 0, 18, 1.8); l.name = 'boss30-light'; scene.add(l); this.lights.push({ l, t: 0, life: 0, k: 0, follow: null }); }
  }
  async load() {
    const base = BOSS30.fx;
    const L = new THREE.TextureLoader();
    const lin = (t, rep = false) => { t.colorSpace = THREE.NoColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
    const [meta, flip, tiles, circle, lava] = await Promise.all([
      fetch(base + 'fire.json').then((r) => r.json()), L.loadAsync(base + 'fire_flip.png'), L.loadAsync(base + 'fire_tiles.png'),
      L.loadAsync(base + 'fire_circle1.png'), L.loadAsync(base + 'lava.png')]);
    this.meta = meta;
    this.tex = { flip: lin(flip), tiles: lin(tiles), circle: lin(circle), lava: lin(lava, true) };
    const big = this.q >= 1;
    this.addF = new Pool(this.scene, this.tex.flip, meta.flip.grid, big ? 3072 : 1536, true, 'addF');
    this.addT = new Pool(this.scene, this.tex.tiles, meta.tiles.grid, big ? 2048 : 1024, true, 'addT');
    this.alphaF = new Pool(this.scene, this.tex.flip, meta.flip.grid, big ? 768 : 384, false, 'alphaF');
    this.alphaT = new Pool(this.scene, this.tex.tiles, meta.tiles.grid, big ? 512 : 256, false, 'alphaT');
    this.trail = new Trail(this.scene, 40);
    this.trail.span = 0.2; this.trail.color.set(C30.main); this.trail.core.set(C30.core); this.trail.k = 1.3; this.trail.on = false;
    this.trail.mesh.name = 'boss30-trail';
    this.ready = true;
    return this;
  }
  // ---------- 小工具 ----------
  n(k) { return Math.max(1, Math.round(k * this.q)); }
  seq(name) { const s = this.meta.flip.seq[name]; return { tile: s.start, frames: s.frames }; }
  tileOf(name) { return this.meta.tiles.names[name]; }
  shake(v) { if (this.fxk > 0.01) this.shakeHook?.(v * this.fxk); }
  flash(color, k) { if (this.fxk > 0.01) this.flashHook?.(color, k * this.fxk); }
  light(pos, { color = C30.main, k = 30, life = 0.3, dist = 16, follow = null } = {}) {
    const L = this.lights.reduce((a, b) => (a.k * Math.max(0, 1 - a.t / a.life) < b.k * Math.max(0, 1 - b.t / b.life) ? a : b));
    L.l.color.set(color); L.l.distance = dist; L.l.position.copy(pos); L.t = 0; L.life = life; L.k = k; L.follow = follow;
    return L;
  }
  // 火舌（序列帧，竖立朝镜头）：seqName flameA / flameB / flameUp / ember / blast / burst / flare
  flame(p, { seqName = 'flameB', v = null, size = [0.8, 1.4], life = 0.7, heat = [1, 0.25], alpha = 1, mode = 4, rot = 0, spin = 0, gravity = -1.5, drag = 1.2, stretch = 0, fadeIn = 0.08, fps = 0, delay = 0 } = {}) {
    if (!this.ready) return;
    const s = this.seq(seqName);
    this.addF.write({ p, v, size, life, heat, alpha, mode, rot, spin, gravity, drag, stretch, fadeIn, tile: s.tile, frames: s.frames, fps, delay }, this.now);
  }
  glow(p, { tile = 'glowFire', size = 1.4, life = 0.25, heat = [0.95, 0.6], alpha = 0.8, mode = 0, v = null, rot = 0, spin = 0, u = null, w = null, delay = 0, fadeIn = 0, gravity = 0, drag = 0, stretch = 0, shade = 0 } = {}) {
    if (!this.ready) return;
    this.addT.write({ p, v, size, life, heat, alpha, mode, rot, spin, u, w, delay, fadeIn, gravity, drag, stretch, shade, tile: this.tileOf(tile) }, this.now);
  }
  smoke(p, { v = null, size = [1.2, 3.2], life = 1.4, alpha = 0.45, heat = 0.15, drag = 1.6, rot = R(0, 6), spin = R(-0.6, 0.6), flip = true, delay = 0, mode = 0 } = {}) {
    if (!this.ready) return;
    if (flip) { const s = this.seq('smoke'); this.alphaF.write({ p, v, size, life, heat, alpha, drag, rot, spin, tile: s.tile, frames: s.frames, delay, mode }, this.now); }
    else this.alphaT.write({ p, v, size, life, heat, alpha, drag, rot, spin, tile: this.tileOf(Math.random() < 0.5 ? 'smokeA' : 'smokeB'), delay, mode }, this.now);
  }
  scorch(p, r, life = 6) {
    if (!this.ready) return;
    this.alphaT.write({ p: _v.set(p.x, 0.035, p.z).clone(), size: [r * 1.7, r * 1.9], life, alpha: 0.65, heat: 0.05, mode: 3, rot: R(0, 6), shade: 1, tile: this.tileOf(Math.random() < 0.5 ? 'scorch' : 'scorch2') }, this.now);
  }

  // ---------- 预警 ----------
  tele(o) { return new Tele30(this, o); }

  // ---------- 命中与格挡的反馈（只在真实接触点）----------
  sparks(p, { n = 12, big = false, away = null, kind = 'hit' } = {}) {
    const hot = kind === 'parry' ? [1, 0.8] : kind === 'block' ? [0.9, 0.5] : [1, 0.4];
    this.glow(p, { tile: 'star', size: big ? 2.6 : 1.7, life: 0.14, heat: [1, 1], alpha: 1, rot: R(0, 3) });
    this.glow(p, { tile: 'glowHot', size: big ? 3.2 : 2.2, life: 0.12, heat: hot, alpha: 0.75 });
    if (kind === 'parry') this.glow(p, { tile: 'ring', size: [0.3, 2.6], life: 0.28, heat: [1, 0.7], alpha: 0.9 });
    for (let i = 0; i < this.n(n); i++) {
      const d = new THREE.Vector3(R(-1, 1), R(-0.2, 1), R(-1, 1)); if (away) d.addScaledVector(away, 1.3); d.normalize();
      this.glow(p, { tile: 'spark', mode: 1, v: d.multiplyScalar(R(5, 13)), size: R(0.08, 0.16), stretch: 0.05, gravity: 10, drag: 2, life: R(0.2, 0.42), heat: hot, alpha: 1 });
    }
    if (kind !== 'block') this.light(p, { k: big ? 40 : 22, life: 0.18, dist: 9, color: kind === 'parry' ? C30.core : C30.gold });
  }
  postureBreak(p) {
    this.glow(p, { tile: 'shock', size: [0.5, 5], life: 0.45, heat: [1, 0.6], alpha: 1 });
    this.glow(p, { tile: 'rays', size: [1, 4], life: 0.35, heat: [1, 0.8], alpha: 0.8, rot: R(0, 6) });
    for (let i = 0; i < this.n(22); i++) this.glow(p, { tile: 'spark', mode: 1, v: new THREE.Vector3(R(-1, 1), R(0, 1.2), R(-1, 1)).normalize().multiplyScalar(R(4, 10)), size: R(0.1, 0.18), stretch: 0.05, gravity: 8, drag: 1.6, life: R(0.3, 0.6), heat: [1, 0.5] });
    this.light(p, { k: 60, life: 0.3, dist: 14, color: C30.core });
  }
  // 出手前的提示：快刀——剑上一闪金光；慢刀——剑上的火越聚越亮（每帧调）
  bladeGlint(tip, grip, k = 1) {
    const sz = this.sz ?? 1;
    for (let i = 0; i < 3; i++) { const u = 0.3 + 0.7 * Math.random(); this.glow(_v.lerpVectors(grip, tip, u).clone(), { tile: 'star', size: 0.9 * k * sz, life: 0.16, heat: [1, 0.9], alpha: 0.9, rot: R(0, 3) }); }
  }
  bladeCharge(tip, grip, k) {
    if (Math.random() > 0.35 + 0.6 * k) return;
    const u = Math.random(), p = _v.lerpVectors(grip, tip, u).clone(), sz = this.sz ?? 1;
    this.flame(p, { seqName: 'flameUp', size: [(0.35 + 0.4 * k) * sz, 0.15], life: 0.35, heat: [0.85 + 0.15 * k, 0.4], alpha: 0.9, gravity: -3, v: new THREE.Vector3(R(-0.3, 0.3), R(0.6, 1.4), R(-0.3, 0.3)) });
    if (Math.random() < 0.4 * k) this.glow(p.clone().add(_u.set(R(-0.6, 0.6), R(-0.4, 0.6), R(-0.6, 0.6))), { tile: 'dot', size: 0.09, life: 0.35, heat: [1, 0.7], v: _u.clone().multiplyScalar(-2.2), alpha: 0.9 });
  }
  // 剑在出手段里扫过：沿剑身的火舌（二阶段 / 燃刃时更旺）
  bladeFire(tip, grip, k = 1) {
    for (let i = 0; i < this.n(2 + Math.round(2 * k)); i++) {
      const p = _v.lerpVectors(grip, tip, 0.25 + 0.75 * Math.random()).clone();
      this.flame(p, { seqName: Math.random() < 0.5 ? 'ember' : 'flameA', mode: 0, size: [(0.45 * k + 0.15) * (this.sz ?? 1), 0.12], life: R(0.18, 0.32), heat: [1, 0.35], alpha: 0.8, rot: R(0, 6), gravity: -2 });
    }
  }

  // ---------- 火浪：沿地面推进的一段火墙（视觉与判定同一个位置，由控制器每帧给）----------
  wave({ w = 2.4 } = {}) {
    const geo = new THREE.PlaneGeometry(w, 2.2, 8, 4); geo.translate(0, 1.1, 0);
    const m = new THREE.Mesh(geo, flameMat(1.2, 3.6)); m.material.uniforms.uNoise.value = this.tex.lava;
    m.frustumCulled = false; m.renderOrder = 7; this.scene.add(m);
    const h = { m, t: 0, done: false, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1),
      set: (pos, dir, a = 1) => {
        h.pos.copy(pos); h.dir.copy(dir);
        m.position.set(pos.x, 0, pos.z); m.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
        m.material.uniforms.uA.value = a;
      },
      update: (dt) => {
        h.t += dt; m.material.uniforms.uT.value = h.t;
        if (!h.done && Math.random() < 0.9) {
          const side = _v.set(h.dir.z, 0, -h.dir.x);
          for (let i = 0; i < this.n(3); i++) {
            const o = R(-w / 2, w / 2);
            this.flame(h.pos.clone().addScaledVector(side, o).setY(0.05), { seqName: i % 2 ? 'flameB' : 'flameA', size: [1.1, 1.8], life: R(0.35, 0.55), heat: [1, 0.3], gravity: -2.5, v: h.dir.clone().multiplyScalar(R(2, 5)).setY(R(1, 2.5)) });
          }
          if (Math.random() < 0.3) this.scorch(h.pos, 0.9, 3);
        }
        return !h.done;
      },
      end: () => { h.done = true; },
      dispose: () => { m.parent?.remove(m); m.geometry.dispose(); m.material.dispose(); } };
    this.items.push(h);
    return h;
  }
  // ---------- 火柱 ----------
  pillar(pos, { r = 2.2, h = 8, life = 1.0 } = {}) {
    const geo = new THREE.CylinderGeometry(r * 0.7, r, h, 32, 6, true); geo.translate(0, h / 2, 0);
    const m = new THREE.Mesh(geo, flameMat(1.3, 3.0)); m.material.uniforms.uNoise.value = this.tex.lava;
    const geo2 = new THREE.CylinderGeometry(r * 0.3, r * 0.5, h * 0.85, 20, 4, true); geo2.translate(0, h * 0.42, 0);
    const m2 = new THREE.Mesh(geo2, flameMat(1.0, 4.2)); m2.material.uniforms.uNoise.value = this.tex.lava;
    const g = new THREE.Group(); g.add(m, m2); g.position.set(pos.x, 0, pos.z); g.renderOrder = 7;
    for (const x of [m, m2]) x.frustumCulled = false;
    this.scene.add(g);
    this.light(new THREE.Vector3(pos.x, 2.5, pos.z), { k: 70, life, dist: 18 });
    this.glow(new THREE.Vector3(pos.x, 0.06, pos.z), { tile: 'ringFire', mode: 3, size: [r * 0.6, r * 2.6], life: 0.5, heat: [1, 0.6], alpha: 0.9 });
    this.scorch(pos, r, 6);
    const hh = { t: 0,
      update: (dt) => {
        hh.t += dt;
        const u = hh.t / life, rise = Math.min(1, hh.t / 0.12), a = u < 0.7 ? 1 : Math.max(0, 1 - (u - 0.7) / 0.3);
        g.scale.set(0.6 + 0.4 * rise, rise, 0.6 + 0.4 * rise);
        for (const x of [m, m2]) { x.material.uniforms.uT.value = hh.t; x.material.uniforms.uA.value = a; }
        if (u < 0.75) for (let i = 0; i < this.n(3); i++) { const a2 = Math.random() * Math.PI * 2, rr = r * Math.sqrt(Math.random()); this.flame(new THREE.Vector3(pos.x + Math.cos(a2) * rr, R(0, 1), pos.z + Math.sin(a2) * rr), { seqName: i % 2 ? 'burst' : 'flameB', v: new THREE.Vector3(0, R(6, 11), 0), size: [1.2, 2.6], life: R(0.4, 0.7), heat: [1, 0.3], drag: 0.6, gravity: -1 }); }
        return hh.t < life;
      },
      dispose: () => { g.parent?.remove(g); for (const x of [m, m2]) { x.geometry.dispose(); x.material.dispose(); } } };
    this.items.push(hh);
  }
  // ---------- 地面爆发：圆（踏火震、落地冲击）或环带（焚环裂地）----------
  eruption(c, { r = 4, r0 = 0, n = 26, big = false } = {}) {
    const area = Math.PI * (r * r - r0 * r0), cnt = this.n(Math.min(80, Math.round(n * Math.max(1, area / 50))));
    for (let i = 0; i < cnt; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(R((r0 / r) ** 2, 1)) * r;
      const p = new THREE.Vector3(c.x + Math.cos(a) * rr, 0.05, c.z + Math.sin(a) * rr);
      this.flame(p, { seqName: i % 3 === 0 ? 'blast' : i % 3 === 1 ? 'flameB' : 'burst', size: [big ? 2.2 : 1.6, big ? 3.6 : 2.8], life: R(0.45, 0.8), heat: [1, 0.25], v: new THREE.Vector3(0, R(3, 8), 0), drag: 1.2, gravity: -1, delay: R(0, 0.08) });
    }
    for (let i = 0; i < this.n(10); i++) { const a = Math.random() * Math.PI * 2, rr = Math.sqrt(R((r0 / r) ** 2, 1)) * r; this.smoke(new THREE.Vector3(c.x + Math.cos(a) * rr, 0.5, c.z + Math.sin(a) * rr), { v: new THREE.Vector3(0, R(1, 2.4), 0), size: [1.4, 3.6], life: R(1.2, 1.8), alpha: 0.4, delay: 0.15 }); }
    this.glow(new THREE.Vector3(c.x, 0.07, c.z), { tile: r0 > 0 ? 'ringFire' : 'shock', mode: 3, size: [r * 0.6, r * 2.4], life: 0.5, heat: [1, 0.5], alpha: 0.9 });
    if (r0 > 0) this.glow(new THREE.Vector3(c.x, 0.06, c.z), { tile: 'ring', mode: 3, size: [r0 * 2, r * 2.2], life: 0.45, heat: [1, 0.6], alpha: 0.7 });
    this.scorch(c, r * (r0 > 0 ? 1 : 0.8), 7);
    this.light(new THREE.Vector3(c.x, 2, c.z), { k: big ? 120 : 70, life: 0.4, dist: r * 3 + 8 });
    this.shake(big ? 0.4 : 0.22);
  }
  // ---------- 第二十六轮：剑尊的刀劈到地上 ----------
  // 落点一圈冲击亮环、发光的裂纹（顺着刀势拉长）、焦痕，贴地往外推的尘浪，崩起的火星与几团爆火，一闪光
  groundImpact(p, { heavy = false, dir = null } = {}) {
    const c = new THREE.Vector3(p.x, 0.06, p.z), k = heavy ? 1.35 : 1;
    this.glow(c, { tile: 'shock', mode: 3, size: [0.6, 4.4 * k], life: 0.34, heat: [1, 0.55], alpha: 0.95 });
    const rot = dir ? Math.atan2(dir.x, dir.z) : R(0, 6);
    this.glow(c.clone().setY(0.05), { tile: Math.random() < 0.5 ? 'crack' : 'crack2', mode: 3, size: [2.2 * k, 3.2 * k], life: 1.8, heat: [0.95, 0.3], alpha: 0.95, rot });
    this.scorch(c, 1.3 * k, 6);
    for (let i = 0; i < this.n(heavy ? 9 : 6); i++) {
      const a = R(0, 6.28);
      this.smoke(c.clone().add(_v.set(Math.cos(a) * 0.5, 0.35, Math.sin(a) * 0.5)), { v: new THREE.Vector3(Math.cos(a) * R(2.6, 4.6), R(0.4, 1.3), Math.sin(a) * R(2.6, 4.6)), size: [1.0, 2.8 * k], life: R(0.8, 1.2), alpha: 0.42, drag: 2.2 });
    }
    for (let i = 0; i < this.n(heavy ? 16 : 10); i++) this.glow(c.clone().setY(0.2), { tile: 'spark', mode: 1, v: new THREE.Vector3(R(-1, 1), R(0.7, 1.7), R(-1, 1)).normalize().multiplyScalar(R(4, 10)), size: R(0.09, 0.17), stretch: 0.05, gravity: 11, drag: 1.5, life: R(0.3, 0.62), heat: [1, 0.45], alpha: 1 });
    for (let i = 0; i < this.n(heavy ? 3 : 2); i++) this.flame(c.clone().add(_v.set(R(-0.5, 0.5), 0, R(-0.5, 0.5))), { seqName: 'blast', size: [0.8 * k, 1.6 * k], life: R(0.32, 0.45), heat: [1, 0.3], alpha: 0.85, v: new THREE.Vector3(0, R(1.5, 3.2), 0) });
    this.light(c.clone().setY(1.2), { k: heavy ? 55 : 32, life: 0.24, dist: 11 });
  }
  // ---------- 残留的地火（燃刃留痕、突刺火迹）：一小块持续燃烧的火（视觉；判定由控制器按区域算）----------
  groundFire(p, life = 4, w = 1.3) {
    const h = { t: 0, p: p.clone().setY(0.05), done: false, life,
      update: (dt) => {
        h.t += dt;
        const u = h.t / life, k = u < 0.85 ? 1 : Math.max(0, 1 - (u - 0.85) / 0.15);
        if (!h.done && Math.random() < 0.55 * k) this.flame(h.p.clone().add(_v.set(R(-w / 2, w / 2), 0, R(-w / 2, w / 2))), { seqName: 'flameUp', size: [0.6, 0.9], life: R(0.4, 0.6), heat: [0.95, 0.3], gravity: -1.2, v: new THREE.Vector3(0, R(0.6, 1.4), 0), alpha: 0.85 * k });
        return h.t < life && !h.done;
      },
      end: () => { h.done = true; }, dispose: () => {} };
    this.items.push(h);
    this.scorch(p, w * 0.7, life + 1.5);
    return h;
  }
  // ---------- 焚天断界：爆发填满整个危险区（火海一闪）----------
  ultBurst(c, r) {
    for (let k = 0; k < 3; k++) this.eruption(c, { r: r * (0.45 + 0.27 * k), r0: k ? r * (0.2 + 0.27 * (k - 1)) : 0, n: 22, big: true });
    this.glow(new THREE.Vector3(c.x, 0.1, c.z), { tile: 'shock', mode: 3, size: [2, r * 2.4], life: 0.7, heat: [1, 0.7], alpha: 1 });
    this.glow(new THREE.Vector3(c.x, 3, c.z), { tile: 'glowHot', size: r * 1.6, life: 0.35, heat: [1, 1], alpha: 0.7 });
    this.light(new THREE.Vector3(c.x, 5, c.z), { k: 260, life: 0.7, dist: 50, color: C30.gold });
    this.shake(0.6); this.flash(0xffd2a0, 0.55);
  }
  // 蓄力：向剑尖汇聚的火点
  converge(p, { n = 3, r = 2.4, life = 0.5, size = 0.12 } = {}) {
    for (let i = 0; i < this.n(n); i++) {
      const d = _v.set(R(-1, 1), R(-0.4, 1), R(-1, 1)).normalize();
      const s = p.clone().addScaledVector(d, r * R(0.7, 1.1));
      this.glow(s, { tile: i % 2 ? 'dot' : 'spark', mode: i % 2 ? 0 : 1, v: d.clone().multiplyScalar(-r / life * 1.05), stretch: 0.05, size, life, heat: [0.8, 1], alpha: 0.95, fadeIn: 0.3 });
    }
  }
  // 二阶段：身上（胸口、肩、背）升起的余烬与火苗
  bodyEmbers(points, k = 1) {
    for (let i = 0; i < this.n(Math.round(2 * k)); i++) {
      const p = points[Math.floor(Math.random() * points.length)].clone().add(_v.set(R(-0.25, 0.25), R(-0.2, 0.3), R(-0.25, 0.25)));
      if (i % 2) this.flame(p, { seqName: 'ember', mode: 0, size: [0.32, 0.08], life: R(0.5, 0.9), heat: [1, 0.3], v: new THREE.Vector3(R(-0.2, 0.2), R(0.8, 1.8), R(-0.2, 0.2)), gravity: -0.5, rot: R(0, 6), alpha: 0.85 });
      else this.glow(p, { tile: 'dot', size: R(0.05, 0.09), life: R(0.8, 1.4), heat: [1, 0.4], v: new THREE.Vector3(R(-0.3, 0.3), R(1, 2.2), R(-0.3, 0.3)), drag: 0.4, alpha: 0.95 });
    }
  }
  // 碎烬：身体化去时升起的余烬（向上飘散）；凝形时由四周向身上汇聚
  ashes(points, n = 6, inward = false) {
    for (let i = 0; i < this.n(n); i++) {
      const p = points[Math.floor(Math.random() * points.length)].clone().add(_v.set(R(-0.4, 0.4), R(-0.3, 0.3), R(-0.4, 0.4)));
      if (inward) { const off = _u.set(R(-1, 1), R(-0.2, 0.8), R(-1, 1)).normalize().multiplyScalar(R(1.2, 2.4)); this.glow(p.clone().add(off), { tile: 'dot', size: R(0.06, 0.12), life: 0.6, heat: [0.7, 1], v: off.clone().multiplyScalar(-1 / 0.6), alpha: 1, fadeIn: 0.3 }); }
      else this.glow(p, { tile: Math.random() < 0.3 ? 'spark' : 'dot', mode: 0, size: R(0.06, 0.14), life: R(1.0, 1.8), heat: [1, 0.2], v: new THREE.Vector3(R(-0.6, 0.6), R(0.8, 2.6), R(-0.6, 0.6)), drag: 0.5, alpha: 1 });
    }
  }
  // 火盆的火（每帧，按火势 k）
  brazier(p, k) {
    if (k < 0.03) return;
    if (Math.random() < 0.7 * k) this.flame(p.clone().add(_v.set(R(-0.3, 0.3), 0, R(-0.3, 0.3))), { seqName: 'flameUp', size: [0.9 * (0.6 + 0.6 * k), 0.4], life: R(0.45, 0.7), heat: [1, 0.35], gravity: -1.5, v: new THREE.Vector3(0, R(0.8, 1.6), 0), alpha: Math.min(1, k) });
    if (Math.random() < 0.12 * k) this.glow(p.clone().add(_v.set(R(-0.2, 0.2), R(0.4, 0.8), R(-0.2, 0.2))), { tile: 'dot', size: 0.06, life: R(1, 1.6), heat: [1, 0.5], v: new THREE.Vector3(R(-0.3, 0.3), R(1, 2), R(-0.3, 0.3)), drag: 0.3 });
  }
  // 熄灭：一股烟
  brazierOut(p) { for (let i = 0; i < 3; i++) this.smoke(p.clone().add(_v.set(0, 0.3, 0)), { v: new THREE.Vector3(R(-0.2, 0.2), R(0.8, 1.4), R(-0.2, 0.2)), size: [0.5, 1.8], life: 1.6, alpha: 0.4 }); }

  // ---------- 每帧 ----------
  update(dt) {
    if (!this.ready) return;
    this.now += dt; this.t += dt;
    for (const t of [...this.teles]) t.update(dt);
    for (let i = this.items.length - 1; i >= 0; i--) { const it = this.items[i]; if (!it.update(dt)) { it.dispose(); this.items.splice(i, 1); } }
    this.addF.flush(this.now); this.addT.flush(this.now); this.alphaF.flush(this.now); this.alphaT.flush(this.now);
    this.trail.update(this.now);
    for (const L of this.lights) {
      if (L.k <= 0) { L.l.intensity = 0; continue; }
      L.t += dt;
      if (L.follow) L.l.position.copy(L.follow());
      const u = L.t / L.life;
      L.l.intensity = u >= 1 ? 0 : L.k * (L.life > 50 ? 1 : (1 - u) * (1 - u));
      if (u >= 1) L.k = 0;
    }
  }
  trailPush(tip, base) { this.trail.push(tip, base, this.now); }
  // 自检用：场上还活着的粒子、地面预警、特效件、亮着的灯
  stats() {
    const pools = this.ready ? [this.addF, this.addT, this.alphaF, this.alphaT] : [];
    return { particles: pools.reduce((s, p) => s + p.live(this.now), 0), cap: pools.reduce((s, p) => s + p.cap, 0), teles: this.teles.size, items: this.items.length, lights: this.lights.filter((L) => L.k > 0).length };
  }
  // 清场（换阶段、重试、离开）
  clear() {
    for (const t of [...this.teles]) t.dispose();
    for (const it of this.items) it.dispose();
    this.items.length = 0;
    for (const L of this.lights) { L.k = 0; L.l.intensity = 0; L.follow = null; }
    if (this.ready) { this.addF.clear(); this.addT.clear(); this.alphaF.clear(); this.alphaT.clear(); this.trail.clear(); }
  }
  dispose() {
    this.clear();
    if (this.ready) { for (const p of [this.addF, this.addT, this.alphaF, this.alphaT]) p.dispose(); this.trail.mesh.parent?.remove(this.trail.mesh); this.trail.geo.dispose(); this.trail.mat.dispose(); }
    for (const L of this.lights) L.l.parent?.remove(L.l);
    for (const t of Object.values(this.tex || {})) t.dispose();
  }
}
