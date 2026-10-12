// 第二十三轮：雷龙破虚的特效（逻辑在 thunderDragon.js；颜色、尺寸、时刻见 combatConfig.js 的 DRAGON）。都预先建好、循环取用：
//   AreaPreview  选点预览：贴地的 8 米圈（按地面起伏铺的极坐标网格）——合法时蓝白雷纹、无效时红色轮廓与斜纹；半径就是结算用的 DRAGON.radius
//   Rift         虚空裂隙：竖立的一道裂缝，先细裂（一道锯齿亮线由中间向两端长）、再撑开（里面是旋着暗纹的虚空），边缘一圈电光；后面再叠一层更暗、更宽的，看得出厚度
//   Clouds       雷云：十团（中央厚、外围错落），每团几片公告板（噪声成形、底暗顶亮），按离镜头远近每帧排序；云内按团各自闪光
//   Bolts        立体分叉雷柱：素材 lightning.glb 的五条雷枝（实例化，每种一个绘制），由云底长到落点、闪两下、淡去；电弧也用它（缩小）
//   Beams        雷柱的光芯：朝镜头的细长条（实例化），让雷柱在白天也读得出来
//   Rings        预兆（目标脚下的蓝白环，跟着目标走、锁定后收拢）与俯冲的冲击环；Scorch 焦痕（贴地，渐淡）
// 不为每道雷建光源：落雷时借 skillfx 的两盏共用点光闪一下（LightPool），不改场景里的灯数（不触发重新编译）。
import * as THREE from 'three';
import { DRAGON as DG } from './combatConfig.js';
import { NOISE_GLSL } from '../world/shaderlib.js';

const C = DG.colors;
const col = (h) => new THREE.Color(h);
const R = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const UPV = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

// =====================================================================================
// 选点预览
// =====================================================================================
const NR = 12, NS = 96, RMAX = 1.08;
const AREA_VS = 'attribute vec2 aP; varying vec2 vP; void main(){ vP = aP; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const AREA_FS = `${NOISE_GLSL}
  uniform float uTime, uValid, uA, uR; uniform vec3 uC1, uC2, uBad; varying vec2 vP;
  void main(){
    float r = vP.x, th = vP.y, m = 1. / uR;
    float a; vec3 c;
    if (uValid > .5) {
      float edge = smoothstep(.028 * m * 4., .0, abs(r - 1.));
      float band = smoothstep(.78, 1., r) * step(r, 1.) * .12;
      float seg = step(.45, fract(th * 18. / 6.2831853 - uTime * .12));
      float ring2 = smoothstep(.012, .0, abs(r - .93)) * seg * .55;
      float n = nzf(vec2(th * 3.2 + uTime * .25, r * 4.5 - uTime * .6));
      float crack = smoothstep(.028, .0, abs(n - .5)) * smoothstep(.12, .45, r) * smoothstep(1., .82, r) * (.4 + .6 * nzv(vec2(th * 11., uTime * 3.)));
      a = edge * .95 + ring2 + crack * .55 + band + .035 * step(r, 1.);
      c = mix(uC2, uC1, clamp(edge + crack * .7 + ring2, 0., 1.));
    } else {
      vec2 xy = vec2(cos(th), sin(th)) * r * uR;
      float hatch = step(.78, fract((xy.x + xy.y) * .55)) * .16 * step(r, 1.);
      a = smoothstep(.05, .0, abs(r - 1.)) * .95 + hatch + .05 * step(r, 1.);
      c = uBad;
    }
    a *= uA * step(r, 1.04);
    if (a < .004) discard;
    gl_FragColor = vec4(c, a);
  }`;
export class AreaPreview {
  constructor(scene) {
    const n = (NR + 1) * NS;
    this.pos = new Float32Array(n * 3);
    const ap = new Float32Array(n * 2), idx = [];
    for (let i = 0; i <= NR; i++) for (let j = 0; j < NS; j++) { const k = i * NS + j; ap[k * 2] = (i / NR) * RMAX; ap[k * 2 + 1] = (j / NS) * Math.PI * 2; }
    for (let i = 0; i < NR; i++) for (let j = 0; j < NS; j++) {
      const a = i * NS + j, b = i * NS + (j + 1) % NS, c = (i + 1) * NS + j, d = (i + 1) * NS + (j + 1) % NS;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aP', new THREE.BufferAttribute(ap, 2));
    g.setIndex(idx);
    this.U = { uTime: { value: 0 }, uValid: { value: 1 }, uA: { value: 0 }, uR: { value: DG.radius }, uC1: { value: col(C.core) }, uC2: { value: col(C.arc) }, uBad: { value: col(C.deny) } };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: AREA_VS, fragmentShader: AREA_FS, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.mesh.visible = false; this.mesh.name = 'dragon-area';
    scene.add(this.mesh);
    this.c = new THREE.Vector3(1e9, 0, 0); this.a = 0; this.want = 0;
  }
  // 摆到 center（地面起伏按 groundAt 逐点取，中心挪动超过 0.3 米才重铺）
  place(center, radius, groundAt) {
    this.U.uR.value = radius;
    if (center.distanceTo(this.c) < 0.3 && radius === this.r) return;
    this.c.copy(center); this.r = radius;
    const P = this.pos;
    for (let i = 0; i <= NR; i++) for (let j = 0; j < NS; j++) {
      const k = (i * NS + j) * 3, rr = (i / NR) * RMAX * radius, th = (j / NS) * Math.PI * 2;
      const x = center.x + Math.cos(th) * rr, z = center.z + Math.sin(th) * rr;
      let y = groundAt(x, z, center.y + 2.5);
      if (!(y > center.y - 6)) y = center.y;               // 圈外是悬崖、虚空：贴着中心的高度
      P[k] = x; P[k + 1] = y + 0.07; P[k + 2] = z;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
  show(valid, a = 1) { this.U.uValid.value = valid ? 1 : 0; this.want = a; }
  hide() { this.want = 0; }
  update(dt) {
    this.U.uTime.value += dt;
    this.a += (this.want - this.a) * Math.min(1, dt * (this.want > this.a ? 14 : 6));
    this.U.uA.value = this.a;
    this.mesh.visible = this.a > 0.01;
  }
  moveTo(scene) { scene.add(this.mesh); }
}

// =====================================================================================
// 虚空裂隙
// =====================================================================================
const RIFT_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const RIFT_FS = `${NOISE_GLSL}
  uniform float uTime, uCrack, uOpen, uFade, uW, uH, uSeed, uBack, uFlash; uniform vec3 uVoid, uEdge, uArc;
  varying vec2 vUv;
  float x0(float y) { return (nzv(vec2(y * .7 + uSeed, uSeed * 1.7)) - .5) * .55 + (abs(fract(y * 1.3 + uSeed) - .5) - .25) * .3; }
  void main(){
    float x = (vUv.x - .5) * uW, y = (vUv.y - .5) * uH, yn = y / (uH * .5);
    float ends = 1. - smoothstep(uCrack - .14, uCrack, abs(yn));
    float hw = (.03 + uOpen * uW * .42 * pow(max(0., 1. - yn * yn), .55) * (.75 + .5 * nzv(vec2(y * 1.1 + uTime * .4, uSeed * 3.)))) * (1. + uBack * .2);
    float d = abs(x - x0(y)) - hw * ends;
    d += (nzv(vec2(y * 5.5 + uTime * 2.1, x * 2.7 + uSeed)) - .5) * .14 * (.4 + uOpen);
    vec3 c; float a;
    if (d < 0. && ends > .01) {
      float sw = nzf(vec2(x * .7 + uTime * .18, y * .45 - uTime * .3) + uSeed);
      float sw2 = nzf(vec2(x * 1.9 - uTime * .4, y * 1.2 + uTime * .2) + uSeed * 2.);
      c = uVoid * (1. - uBack * .5) + uArc * (smoothstep(.55, .85, sw) * .28 + smoothstep(.62, .9, sw2) * .18) * (1. - uBack * .7);
      c += uEdge * smoothstep(-.3, 0., d) * .9 * (1. - uBack * .6);
      a = .97;
    } else {
      float core = smoothstep(.07, 0., d) * ends, glow = exp(-max(d, 0.) / (.26 + uFlash * .3)) * ends;
      c = mix(uArc, uEdge, core) * (1.3 + uFlash);
      a = max(core, glow * (.5 + uFlash * .4)) * (1. - uBack * .8);
    }
    a *= uFade;
    if (a < .01) discard;
    gl_FragColor = vec4(c, a);
  }`;
export class Rift {
  constructor(scene) {
    this.g = new THREE.Group(); this.g.name = 'dragon-rift'; this.g.visible = false;
    const mk = (back) => {
      const U = { uTime: { value: 0 }, uCrack: { value: 0 }, uOpen: { value: 0 }, uFade: { value: 0 }, uW: { value: 1 }, uH: { value: 1 }, uSeed: { value: 0 }, uBack: { value: back }, uFlash: { value: 0 },
        uVoid: { value: col(C.rift) }, uEdge: { value: col(C.core) }, uArc: { value: col(C.arc) } };
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: U, vertexShader: RIFT_VS, fragmentShader: RIFT_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.frustumCulled = false; m.renderOrder = back ? 6 : 7;
      this.g.add(m);
      return { m, U };
    };
    this.back = mk(1); this.front = mk(0);
    scene.add(this.g);
    this.k = { crack: 0, open: 0, fade: 0, flash: 0 };
  }
  // pos：裂缝中心；normal：朝外（朝施法者）的法线；w、tall：宽、高（米）；tilt：绕法线的倾斜（弧度）
  place(pos, normal, w, tall, tilt = 0) {
    const pad = 3.2;                               // 四周留出光晕
    for (const L of [this.front, this.back]) {
      L.U.uW.value = w * (L === this.back ? 1.25 : 1) + pad; L.U.uH.value = tall + pad;
      L.U.uSeed.value = Math.random() * 10;
      L.m.scale.set(L.U.uW.value, L.U.uH.value, 1);
    }
    this.g.position.copy(pos);
    this.g.quaternion.setFromUnitVectors(_v.set(0, 0, 1), normal);
    this.g.rotateZ(tilt);
    this.back.m.position.set(0, 0, -0.45);
    this.normal = normal.clone(); this.pos = pos.clone();
    this.g.visible = true;
  }
  set(o) { Object.assign(this.k, o); }
  update(dt) {
    if (!this.g.visible) return;
    const k = this.k;
    k.flash = Math.max(0, k.flash - dt * 4);
    for (const L of [this.front, this.back]) {
      L.U.uTime.value += dt; L.U.uCrack.value = k.crack; L.U.uOpen.value = k.open; L.U.uFade.value = k.fade; L.U.uFlash.value = k.flash;
    }
    if (k.fade <= 0.001 && k.crack <= 0.001) this.g.visible = false;
  }
  hide() { this.g.visible = false; this.k = { crack: 0, open: 0, fade: 0, flash: 0 }; }
  moveTo(scene) { scene.add(this.g); }
}

// =====================================================================================
// 雷云
// =====================================================================================
const CLOUD_VS = `attribute vec4 aInfo; attribute vec4 aSeed; uniform float uTime, uFade; varying vec2 vUv; varying float vS, vFl, vA, vUp;
  void main(){
    vUv = uv; vS = fract(aSeed.x); vUp = floor(aSeed.x) / 4. - 1.; vFl = aSeed.z; vA = aSeed.w * uFade;
    vec3 c = aInfo.xyz;
    c.x += sin(uTime * .32 + aSeed.x * 9.) * .3; c.z += cos(uTime * .27 + aSeed.x * 5.) * .3; c.y += sin(uTime * .4 + aSeed.x * 3.) * .12;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 p = c + right * position.x * aInfo.w + up * position.y * aInfo.w * aSeed.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
  }`;
const CLOUD_FS = `${NOISE_GLSL}
  uniform float uTime; uniform vec3 uBase, uTop, uLit, uCore; varying vec2 vUv; varying float vS, vFl, vA, vUp;
  void main(){
    vec2 q = vUv - .5;
    float n = nzf(vUv * vec2(2.6, 2.2) + vec2(uTime * .025 + vS * 11., vS * 5.));
    float n2 = nzf(vUv * vec2(6.5, 5.5) + vS * 3. - uTime * .04);
    // 圆团：边缘被噪声啃出云头；越往上的片越亮（云顶受光），云底压暗
    float d = length(q * vec2(1., 1.15)) + (n - .5) * .5 + (n2 - .5) * .18;
    float body = smoothstep(.5, .12, d);
    float a = body * vA;
    if (a < .01) discard;
    float top = smoothstep(.15, .95, vUv.y + (n - .5) * .4) * (.55 + .45 * clamp(vUp * .6 + .5, 0., 1.));
    vec3 c = mix(uBase * .8, uTop, top) * (.8 + .35 * n2);
    c += uLit * pow(smoothstep(.12, .48, d) * step(.45, vUv.y), 2.) * .22 * (.5 + .5 * clamp(vUp, 0., 1.));      // 云头的银边
    float inner = smoothstep(.55, .0, length(q)) * vFl;
    c = mix(c, uLit, clamp(inner, 0., 1.) * .75) + uCore * inner * inner * .7;
    gl_FragColor = vec4(c, a * .94);
  }`;
export class Clouds {
  constructor(scene, cap = 64) {
    this.cap = cap;
    const g = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
    g.instanceCount = 0;
    this.info = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.seed = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aInfo', this.info); g.setAttribute('aSeed', this.seed);
    this.U = { uTime: { value: 0 }, uFade: { value: 0 }, uBase: { value: col(C.cloud) }, uTop: { value: col(C.deep) }, uLit: { value: col(C.silver) }, uCore: { value: col(C.core) } };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 7; this.mesh.visible = false; this.mesh.name = 'dragon-clouds';
    scene.add(this.mesh);
    this.puffs = []; this.masses = [];
  }
  // 布云：center 地面中心；f 朝施法者的水平方向、r 右方；quality < 1 时每团少几片（伤害、目标、次数不变）
  build(center, f, r, quality = 1) {
    const D = DG.cloud, base = D.base, top = D.top;
    // 中央一团最厚，内圈三团，外圈六团（角度、半径、高度、大小都错开）
    const layout = [[0, 0, 0.62, 1.25], [2.9, 40, 0.35, 0.95], [3.1, 165, 0.55, 0.9], [2.6, 285, 0.3, 1.0],
      [6.6, 15, 0.2, 0.78], [7.4, 75, 0.7, 0.72], [6.2, 130, 0.42, 0.8], [7.8, 200, 0.15, 0.7], [6.8, 250, 0.82, 0.76], [7.2, 320, 0.5, 0.74]];
    this.masses = layout.slice(0, D.count).map(([rad, deg, hk, sk], i) => {
      const a = (deg * Math.PI) / 180;
      const p = new THREE.Vector3().copy(center).addScaledVector(f, Math.cos(a) * rad).addScaledVector(r, Math.sin(a) * rad);
      p.y = center.y + base + (top - base) * (0.35 + hk * 0.55);
      return { p, size: 4.4 * sk + 1.2, flash: 0, i };
    });
    const per = quality < 1 ? D.low : D.puffs;
    this.puffs.length = 0;
    for (const m of this.masses) {
      for (let j = 0; j < per; j++) {
        // 第一片最大、居中；其余围着它，越往上越小越亮（云顶），底下一两片压暗（云底）
        const big = j === 0, a = R(0, Math.PI * 2), rr = big ? 0 : m.size * R(0.2, 0.5), up = big ? 0.1 : R(-0.5, 0.9);
        this.puffs.push({ m, x: m.p.x + Math.cos(a) * rr, y: m.p.y + up * m.size * 0.28, z: m.p.z + Math.sin(a) * rr,
          s: m.size * (big ? 1.0 : R(0.5, 0.78) * (1 - Math.max(0, up) * 0.25)), seed: Math.random(), flat: R(0.62, 0.8), a: big ? 0.95 : R(0.72, 0.92), up });
      }
    }
    this.mesh.geometry.instanceCount = Math.min(this.cap, this.puffs.length);
    this.mesh.visible = true;
    return this.masses;
  }
  // 云底在 (x, z) 处的高度（落雷从这里起）：最近一团的底
  baseAt(x, z, fallback) {
    let best = null, bd = Infinity;
    for (const m of this.masses) { const d = Math.hypot(m.p.x - x, m.p.z - z); if (d < bd) { bd = d; best = m; } }
    return best ? best.p.y - best.size * 0.18 : fallback;
  }
  nearest(x, z) { let best = null, bd = Infinity; for (const m of this.masses) { const d = Math.hypot(m.p.x - x, m.p.z - z); if (d < bd) { bd = d; best = m; } } return best; }
  flash(m, k = 1) { if (m) m.flash = Math.max(m.flash, k); }
  update(dt, camera, fade) {
    if (!this.puffs.length) return;
    this.U.uTime.value += dt; this.U.uFade.value = fade;
    this.mesh.visible = fade > 0.001;
    for (const m of this.masses) m.flash = Math.max(0, m.flash - dt * 3.2);
    // 偶尔自己闪一下（云内间歇的闪光）
    if (fade > 0.3 && Math.random() < dt * 1.6) { const m = this.masses[Math.floor(Math.random() * this.masses.length)]; if (m) m.flash = Math.max(m.flash, R(0.35, 0.8)); }
    // 由远到近排序（透明的云片前后才对）
    const cp = camera.position, P = this.puffs;
    for (const p of P) p.d = (p.x - cp.x) ** 2 + (p.y - cp.y) ** 2 + (p.z - cp.z) ** 2;
    P.sort((a, b) => b.d - a.d);
    const I = this.info.array, S = this.seed.array, n = Math.min(this.cap, P.length);
    for (let i = 0; i < n; i++) {
      const p = P[i];
      I[i * 4] = p.x; I[i * 4 + 1] = p.y; I[i * 4 + 2] = p.z; I[i * 4 + 3] = p.s;
      S[i * 4] = p.seed + Math.round((p.up + 1) * 4); S[i * 4 + 1] = p.flat; S[i * 4 + 2] = p.m.flash; S[i * 4 + 3] = p.a;      // 整数部分带着「在云团里的高低」（顶亮底暗）
    }
    this.info.needsUpdate = true; this.seed.needsUpdate = true;
  }
  hide() { this.mesh.visible = false; this.masses = []; this.puffs = []; }
  moveTo(scene) { scene.add(this.mesh); }
}

// =====================================================================================
// 立体分叉雷柱（素材的五条雷枝，实例化）与光芯
// =====================================================================================
const BOLT_VS = `attribute vec4 aFx; attribute float aTh; uniform float uTime; varying float vA; varying vec3 vN, vV;
  void main(){
    float age = uTime - aFx.x, u = age / aFx.y, a = 0.;
    if (u >= 0. && u <= 1.) {
      float fl = step(.4, fract(age * 21. + aFx.z * 7.));
      a = (u < .14 ? 1. : (1. - smoothstep(.14, 1., u)) * (.5 + .5 * fl)) * aFx.w;
      float grow = clamp(u / .1, 0., 1.);
      if (position.y < -grow - .02) a = 0.;
    }
    vA = a;
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.);
    vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    // 素材的雷枝按长度归一之后管子极细：沿法线按世界尺寸加粗（每条雷各自的粗细），越往枝梢越细
    wp.xyz += vN * aTh * (.45 + .55 * clamp(1. + position.y * .8, 0., 1.));
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const BOLT_FS = `uniform vec3 uCore, uArc; varying float vA; varying vec3 vN, vV;
  void main(){
    if (vA < .01) discard;
    // 正对镜头的中线最亮（雷电核心 #EAF8FF），往两侧转成蓝紫电弧（#8FADFF）——不是一整根白柱
    float f = abs(dot(normalize(vN), vV));
    vec3 c = mix(uArc * 1.15, uCore * 2.1, smoothstep(.55, .97, f));
    gl_FragColor = vec4(c * vA * (.55 + .45 * f), 1.);
  }`;
const BEAM_VS = `attribute vec4 aA, aB, aC; uniform float uTime; varying float vA; varying float vX;
  void main(){
    float age = uTime - aB.w, u = age / aC.x, a = 0.;
    if (u >= 0. && u <= 1.) { float fl = step(.35, fract(age * 19. + aC.y * 5.)); a = (u < .12 ? 1. : (1. - smoothstep(.12, 1., u)) * (.55 + .45 * fl)) * aC.z; }
    vec3 top = aA.xyz, bot = aB.xyz, dir = bot - top;
    float h = clamp(-position.y, 0., 1.);
    float grow = clamp(u / .1, 0., 1.);
    if (h > grow + .02) a = 0.;
    vec3 p = top + dir * h;
    vec3 side = normalize(cross(normalize(dir), normalize(cameraPosition - p)));
    p += side * position.x * aA.w;
    vA = a; vX = position.x * 2.;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
  }`;
const BEAM_FS = `uniform vec3 uCore, uArc; varying float vA; varying float vX;
  void main(){ float k = exp(-vX * vX * 9.); if (vA * k < .01) discard; gl_FragColor = vec4(mix(uArc, uCore, k) * vA * (.4 + 1.6 * k), 1.); }`;
export class Bolts {
  // geos：五条雷枝的几何体（顶 y = 0、底 y = −1）；cap：每种最多同时几条
  constructor(scene, geos, cap = 24) {
    this.U = { uTime: { value: 0 }, uCore: { value: col(C.core) }, uArc: { value: col(C.arc) } };
    const mat = new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: BOLT_VS, fragmentShader: BOLT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.kinds = (geos || []).map((g, i) => {
      const fx = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4).fill(-1e9), 4).setUsage(THREE.DynamicDrawUsage);
      const th = new THREE.InstancedBufferAttribute(new Float32Array(cap).fill(0.04), 1).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aFx', fx); g.setAttribute('aTh', th);
      const m = new THREE.InstancedMesh(g, mat, cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; m.renderOrder = 9; m.count = cap; m.visible = false; m.name = 'dragon-bolt' + i;
      for (let k = 0; k < cap; k++) m.setMatrixAt(k, _m.makeScale(0, 0, 0));
      scene.add(m);
      return { m, fx, th, head: 0, until: 0 };
    });
    // 光芯（每道雷一条）
    const bc = cap * 2, g = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1, 1, 8).translate(0, -0.5, 0));
    this.bA = new THREE.InstancedBufferAttribute(new Float32Array(bc * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.bB = new THREE.InstancedBufferAttribute(new Float32Array(bc * 4).fill(-1e9), 4).setUsage(THREE.DynamicDrawUsage);
    this.bC = new THREE.InstancedBufferAttribute(new Float32Array(bc * 4).fill(1), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aA', this.bA); g.setAttribute('aB', this.bB); g.setAttribute('aC', this.bC); g.instanceCount = bc;
    this.beam = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
    this.beam.frustumCulled = false; this.beam.renderOrder = 9; this.beam.visible = false; this.beam.name = 'dragon-beam';
    scene.add(this.beam);
    this.bHead = 0; this.bCap = bc; this.bUntil = 0;
    this.now = 0; this.count = 0;
  }
  // 一道雷：top → bot；width：横向张开（相对长度）；life 秒；k 亮度；core：要不要光芯（宽 coreW 米）
  strike(top, bot, { width = 0.32, life = 0.3, k = 1, core = true, coreW = 0.5, kind = -1, delay = 0, thick = 0.05 } = {}) {
    if (!this.kinds.length) return;
    const K = this.kinds[kind >= 0 ? kind % this.kinds.length : Math.floor(Math.random() * this.kinds.length)];
    const i = K.head; K.head = (K.head + 1) % K.m.count;
    const d = _v.subVectors(bot, top), L = d.length();
    if (L < 0.05) return;
    _q.setFromUnitVectors(DOWN, d.divideScalar(L)).multiply(_q2.setFromAxisAngle(UPV, Math.random() * Math.PI * 2));      // 先绕自身轴随机转，再对准方向
    _m.compose(top, _q, _s.set(width * L, L, width * L));
    K.m.setMatrixAt(i, _m); K.m.instanceMatrix.needsUpdate = true;
    const t0 = this.now + delay;
    K.fx.array.set([t0, life, Math.random(), k], i * 4); K.fx.needsUpdate = true;
    K.th.array[i] = thick; K.th.needsUpdate = true;
    K.until = Math.max(K.until, t0 + life); K.m.visible = true;
    if (core) {
      const j = this.bHead; this.bHead = (this.bHead + 1) % this.bCap;
      this.bA.array.set([top.x, top.y, top.z, coreW], j * 4); this.bB.array.set([bot.x, bot.y, bot.z, t0], j * 4); this.bC.array.set([life * 0.8, Math.random(), k, 0], j * 4);
      this.bA.needsUpdate = this.bB.needsUpdate = this.bC.needsUpdate = true;
      this.bUntil = Math.max(this.bUntil, t0 + life); this.beam.visible = true;
    }
    this.count++;
  }
  update(dt) {
    this.now += dt; this.U.uTime.value = this.now;
    for (const K of this.kinds) K.m.visible = this.now < K.until;
    this.beam.visible = this.now < this.bUntil;
  }
  alive() { let n = 0; for (const K of this.kinds) for (let i = 0; i < K.m.count; i++) { const t0 = K.fx.array[i * 4], L = K.fx.array[i * 4 + 1]; if (this.now >= t0 && this.now <= t0 + L) n++; } return n; }
  clear() { for (const K of this.kinds) { K.until = 0; K.m.visible = false; K.fx.array.fill(-1e9); K.fx.needsUpdate = true; } this.bUntil = 0; this.beam.visible = false; this.bB.array.fill(-1e9); this.bB.needsUpdate = true; }
  moveTo(scene) { for (const K of this.kinds) scene.add(K.m); scene.add(this.beam); }
  meshes() { return [...this.kinds.map((K) => K.m), this.beam]; }
}

// =====================================================================================
// 贴地的环（预兆、冲击环）与焦痕
// =====================================================================================
const RING_VS = `attribute vec4 aP, aF; uniform float uTime; varying vec2 vUv; varying vec4 vF; varying float vAge;
  void main(){
    vUv = uv; vF = aF; vAge = uTime - aF.x;
    float s = aP.w;
    if (aF.w > 1.5 && aF.w < 2.5) s *= (.35 + .65 * clamp(vAge / aF.y, 0., 1.)) * 1.;   // 冲击环：张开
    else if (aF.w > 2.5 && aF.w < 3.5) { float k = clamp(vAge / aF.y, 0., 1.); s *= .12 + .88 * (1. - (1. - k) * (1. - k) * (1. - k)); }   // 第二十六轮：气浪（先快后慢地推开）
    vec3 p = aP.xyz + vec3(position.x, 0., -position.y) * s;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
  }`;
const RING_FS = `${NOISE_GLSL}
  uniform float uTime; uniform vec3 uCore, uArc, uDark; varying vec2 vUv; varying vec4 vF; varying float vAge;
  void main(){
    float u = vAge / vF.y; if (u < 0. || u > 1.) discard;
    vec2 q = vUv - .5; float r = length(q) * 2., th = atan(q.y, q.x);
    float a; vec3 c;
    if (vF.w < .5) {
      // 预兆：一道细亮环 + 环内跳动的电光（越临近落雷越亮、越收拢）
      float rr = mix(1., .55, u);
      float ring = smoothstep(.07, .0, abs(r - rr * .9));
      float spark = smoothstep(.03, .0, abs(nzv(vec2(th * 3. + uTime * 9., r * 4. - uTime * 6.)) - .5)) * step(r, rr) * .7;
      a = (ring + spark) * (.35 + .65 * u) * vF.z; c = mix(uArc, uCore, ring);
    } else if (vF.w < 1.5) {
      // 焦痕：暗色烧痕，边上几点蓝光，渐淡
      float n = nzf(q * 6. + vF.z * 9.);
      float burn = smoothstep(.9, .2, r + (n - .5) * .5);
      a = burn * .55 * (1. - smoothstep(.4, 1., u)); c = uDark;
      float ember = step(.82, nzv(q * 22. + vF.z * 3.)) * burn * (1. - smoothstep(0., .5, u));
      c = mix(c, uArc, ember); a = max(a, ember * .8);
    } else if (vF.w < 2.5) {
      // 冲击环
      float ring = smoothstep(.12, .0, abs(r - .85)) * (1. - u);
      a = ring * vF.z; c = mix(uArc, uCore, ring);
    } else if (vF.w < 3.5) {
      // 第二十六轮：气浪——一圈深色的浪往外推（白地面上也看得见），外缘一线电光，圈里一层薄暗
      float n = nzf(vec2(th * 4., u * 3.) + vF.z * 5.);
      float ring = smoothstep(mix(.16, .05, u), .0, abs(r - .9 + (n - .5) * .06));
      float rim = smoothstep(.025, .0, abs(r - .97)) * (1. - u);
      float inner = smoothstep(.95, .25, r) * .22 * (1. - u);
      a = (max(ring * .8, inner) + rim * .6) * (1. - smoothstep(.5, 1., u)) * vF.z;
      c = mix(uDark, uArc, clamp(rim * 1.5 - ring * .3, 0., 1.));
    } else {
      // 第二十六轮：电裂纹——落点放射出去的九道锯齿裂缝（深色的缝、缝芯一线蓝白电光、闪烁），由里往外裂开；前一半电光亮，之后只剩焦黑的缝、渐淡
      float N = 9.;
      float wob = (nzf(vec2(r * 3.2, vF.z * 13.)) - .5) * 1.1 + (nzv(vec2(r * 11., vF.z * 5.)) - .5) * .35;
      float k = th / 6.2831853 * N + wob, id = floor(k + .5), idm = mod(id, N);
      float L = .45 + .55 * fract(sin(idm * 12.9898 + vF.z * 78.233) * 43758.5453);
      float d = abs(k - id) / N * 6.2831853 * r;                                     // 到最近一道裂缝的距离（贴花半径为 1）
      float on = step(.05, r) * smoothstep(L, L - .1, r) * step(r, smoothstep(0., .12, u) * L + .02);
      float wid = mix(.045, .012, clamp(r / L, 0., 1.));
      float edge = smoothstep(wid, wid * .3, d) * on, core = smoothstep(wid * .45, .0, d) * on, glow = smoothstep(wid * 3., .0, d) * on;
      float hot = (1. - smoothstep(.0, .55, u)) * (.55 + .45 * nzv(vec2(idm * 3.1, uTime * 16.)));
      a = max(edge * .9, glow * .45 * hot) * (1. - smoothstep(.35, 1., u));
      c = mix(mix(uArc, uDark, edge), uCore, core * hot);
    }
    if (a < .01) discard;
    gl_FragColor = vec4(c, a);
  }`;
export class GroundMarks {
  constructor(scene, cap = 48) {
    this.cap = cap; this.head = 0;
    const g = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
    this.aP = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aF = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4).fill(-1e9), 4).setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < cap; i++) this.aF.array[i * 4 + 1] = 1;
    g.setAttribute('aP', this.aP); g.setAttribute('aF', this.aF); g.instanceCount = cap;
    this.U = { uTime: { value: 0 }, uCore: { value: col(C.core) }, uArc: { value: col(C.arc) }, uDark: { value: col(0x0b0d14) } };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, toneMapped: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 6; this.mesh.visible = false; this.mesh.name = 'dragon-marks';
    scene.add(this.mesh);
    this.now = 0; this.until = 0;
  }
  // kind：0 预兆 / 1 焦痕 / 2 冲击环 / 3 气浪 / 4 电裂纹（第二十六轮）；返回槽号（预兆跟着目标走时用 move）
  add(p, size, life, kind, k = 1) {
    const i = this.head; this.head = (this.head + 1) % this.cap;
    this.aP.array.set([p.x, p.y + 0.06, p.z, size], i * 4);
    this.aF.array.set([this.now, life, kind === 1 || kind === 4 ? Math.random() : k, kind], i * 4);
    this.aP.needsUpdate = this.aF.needsUpdate = true;
    this.until = Math.max(this.until, this.now + life); this.mesh.visible = true;
    return i;
  }
  move(i, p) { this.aP.array[i * 4] = p.x; this.aP.array[i * 4 + 1] = p.y + 0.06; this.aP.array[i * 4 + 2] = p.z; this.aP.needsUpdate = true; }
  end(i) { this.aF.array[i * 4] = -1e9; this.aF.needsUpdate = true; }
  update(dt) { this.now += dt; this.U.uTime.value = this.now; this.mesh.visible = this.now < this.until; }
  clear() { this.until = 0; this.mesh.visible = false; this.aF.array.fill(-1e9); for (let i = 0; i < this.cap; i++) this.aF.array[i * 4 + 1] = 1; this.aF.needsUpdate = true; }
  moveTo(scene) { scene.add(this.mesh); }
}

// =====================================================================================
// 总管
// =====================================================================================
export class ThunderFx {
  // vfx：world/vfx.js（火星、光点）；lights：skillfx 的共用点光；boltGeos：lightning.glb 的五条雷枝；quality：0.5 … 1
  constructor(scene, { vfx, lights = null, boltGeos = [], quality = 1, flash = null } = {}) {
    this.scene = scene; this.vfx = vfx; this.lights = lights; this.q = quality; this.flashFn = flash;
    this.area = new AreaPreview(scene);
    this.rift = new Rift(scene);
    this.clouds = new Clouds(scene, 64);
    this.bolts = new Bolts(scene, boltGeos, 24);
    this.marks = new GroundMarks(scene, 64);
    this.cloudFade = 0;
  }
  n(k) { return Math.max(1, Math.round(k * this.q)); }
  // ---------- 起势：剑上聚雷（a 0 … 1）；提交：剑尖一道雷直上裂隙 ----------
  gather(tip, base, a) {
    const V = this.vfx;
    V.spawn({ p: tip.clone(), tile: 'glow', size: 0.35 + a * 0.55, life: 0.07, color: C.core, alpha: 0.5 + a * 0.4 });
    if (Math.random() < 0.35 + a * 0.5) {
      const p0 = _v.lerpVectors(base, tip, R(0.1, 0.9)), p1 = _w.lerpVectors(base, tip, R(0.2, 1)).add(_u.set(R(-0.25, 0.25), R(-0.15, 0.3), R(-0.25, 0.25)));
      this.bolts.strike(p0.clone(), p1.clone(), { width: 0.5, life: 0.09, k: 0.55 + a * 0.4, core: false, thick: 0.012 });
    }
    if (Math.random() < 0.5) V.spawn({ p: tip.clone(), v: _v.set(R(-1.2, 1.2), R(-0.5, 1.8), R(-1.2, 1.2)).clone(), tile: 'trace', mode: 1, size: R(0.03, 0.06), stretch: 0.05, life: R(0.12, 0.22), drag: 3, color: C.core, alpha: 0.9 });
  }
  commitBolt(tip, to) {
    this.bolts.strike(tip.clone(), to.clone(), { width: 0.18, life: 0.35, k: 1.1, coreW: 0.35, thick: 0.05 });
    this.vfx.spawn({ p: tip.clone(), tile: 'flare', size: 1.6, life: 0.16, color: C.core, alpha: 0.9 });
    this.lights?.pulse(tip, C.silver, 5, 0.25);
  }
  // ---------- 雷云、裂隙 ----------
  buildClouds(center, f, r) { return this.clouds.build(center, f, r, this.q); }
  // ---------- 预兆 / 落雷 ----------
  omen(p, size = 1.4) { return this.marks.add(p, size, DG.pulse.omen + 0.05, 0, 1); }
  omenMove(i, p) { this.marks.move(i, p); }
  omenEnd(i) { this.marks.end(i); }
  // 一道落雷：云底 top → 落点 bot（hit：打中了人——接触处爆闪更亮）
  strike(top, bot, hit = true) {
    this.bolts.strike(top, bot, { width: R(0.24, 0.36), life: R(0.26, 0.34), k: hit ? 1.1 : 0.8, coreW: hit ? 0.26 : 0.2, thick: hit ? 0.055 : 0.04 });
    const V = this.vfx, p = bot.clone();
    V.spawn({ p: p.clone().setY(p.y + 0.35), tile: 'flare', size: hit ? 2.6 : 1.8, life: 0.14, color: C.core, alpha: 0.95 });
    V.spawn({ p: p.clone().setY(p.y + 0.05), tile: 'ringSoft', mode: 3, size: [0.6, hit ? 3.2 : 2.4], life: 0.28, color: C.arc, alpha: 0.75 });
    for (let i = 0; i < this.n(hit ? 9 : 5); i++) {
      V.spawn({ p: p.clone().setY(p.y + 0.2), v: _v.set(R(-4, 4), R(1, 5.5), R(-4, 4)).clone(), tile: 'trace', mode: 1, size: R(0.04, 0.08), stretch: 0.05, gravity: 9, drag: 1.5, life: R(0.18, 0.36), color: i % 2 ? C.core : C.arc, alpha: 1 });
    }
    this.marks.add(p, R(1.6, 2.2), 1.8, 1);
  }
  // ---------- 俯冲爆雷 ----------
  blast(p, r) {
    const V = this.vfx;
    V.spawn({ p: p.clone().setY(p.y + 0.6), tile: 'flare', size: 6.5, life: 0.22, color: C.core, alpha: 1 });
    V.spawn({ p: p.clone().setY(p.y + 0.6), tile: 'glow', size: 9, life: 0.4, color: C.arc, alpha: 0.6 });
    this.marks.add(p, r * 2.1, 0.55, 2, 1);
    this.marks.add(p, r * 1.2, 0.4, 2, 0.8);
    this.marks.add(p, r * 1.1, 2.6, 1);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + R(-0.2, 0.2), L = r * R(0.6, 1.05);
      const q = p.clone().add(_v.set(Math.cos(a) * L, R(0, 0.6), Math.sin(a) * L));
      this.bolts.strike(p.clone().setY(p.y + 0.4), q, { width: 0.4, life: R(0.2, 0.32), k: 0.9, core: false, delay: R(0, 0.06), thick: 0.045 });
    }
    for (let i = 0; i < this.n(26); i++) V.spawn({ p: p.clone().setY(p.y + 0.3), v: _v.set(R(-9, 9), R(2, 10), R(-9, 9)).clone(), tile: 'trace', mode: 1, size: R(0.05, 0.1), stretch: 0.05, gravity: 9, drag: 1.2, life: R(0.25, 0.55), color: i % 3 ? C.core : C.arc, alpha: 1 });
    for (let i = 0; i < this.n(6); i++) V.spawn({ p: p.clone().add(_v.set(R(-1.5, 1.5), R(0.2, 1.2), R(-1.5, 1.5))), v: _v.set(R(-1, 1), R(0.5, 2), R(-1, 1)).clone(), tile: 'smoke', blend: 'alpha', size: [1.2, 3.2], life: R(0.8, 1.3), drag: 1.5, color: 0x3a4250, alpha: 0.35, rot: R(0, 6), spin: R(-1, 1) });
    this.lights?.pulse(p.clone().setY(p.y + 2), C.silver, 9, 0.35);
    this.flashFn?.(C.core, DG.quake.flash);
  }
  // ---------- 第二十六轮：俯冲撞上之后的压迫感（DRAGON.quake） ----------
  // 撞上的一刻：天上同时劈下几道雷柱、一圈深色气浪往外推、地上放射的电裂纹、尘环与贴地往外推的尘团、崩起的碎石、电球爆闪
  quake(p) {
    const Qk = DG.quake, V = this.vfx, top = DG.cloud.base;
    for (let i = 0; i < Qk.pillars; i++) {
      const a = p.clone().add(_v.set(R(-1.5, 1.5), top + R(1.5, 3.5), R(-1.5, 1.5)));
      this.bolts.strike(a, p.clone().add(_w.set(R(-0.35, 0.35), 0, R(-0.35, 0.35))), { width: R(0.2, 0.3), life: R(0.32, 0.45), k: 1.35, coreW: 0.7, thick: 0.075, delay: i * 0.05 });
    }
    this.marks.add(p, Qk.wave.r * 2, Qk.wave.life, 3, 1);
    this.marks.add(p, Qk.wave.r * 1.25, Qk.wave.life * 0.75, 3, 0.75);
    this.marks.add(p, Qk.cracks.r * 2, Qk.cracks.life, 4);
    V.spawn({ p: p.clone().setY(p.y + 0.12), tile: 'smokeRing', mode: 3, size: [2.5, Qk.wave.r * 1.7], life: 1.0, color: 0x59606e, alpha: 0.6, blend: 'alpha', rot: R(0, 6.28) });
    for (let i = 0; i < this.n(Qk.dust); i++) {
      const a = (i / Qk.dust) * Math.PI * 2 + R(-0.2, 0.2), d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      V.spawn({ p: p.clone().addScaledVector(d, R(0.6, 1.6)).setY(p.y + R(0.3, 0.8)), v: d.clone().multiplyScalar(R(7, 11)).setY(R(0.8, 2.2)), tile: i % 2 ? 'smoke' : 'smoke2', blend: 'alpha',
        size: [1.3, 3.8], life: R(0.9, 1.3), drag: 2.4, color: 0x4b5262, alpha: 0.5, rot: R(0, 6.28), spin: R(-1, 1) });
    }
    // 落点上方扬起的一柱烟尘（从低机位、远处也看得见撞得有多重）
    for (let i = 0; i < this.n(5); i++) V.spawn({ p: p.clone().add(_v.set(R(-0.8, 0.8), R(0.4, 1.4), R(-0.8, 0.8))), v: _v.set(R(-0.8, 0.8), R(2.5, 5), R(-0.8, 0.8)).clone(), tile: i % 2 ? 'smoke3' : 'smoke', blend: 'alpha',
      size: [2.2, 5.0], life: R(1.0, 1.5), drag: 1.6, color: 0x3d4350, alpha: 0.5, rot: R(0, 6.28), spin: R(-0.6, 0.6), delay: R(0, 0.06) });
    for (let i = 0; i < this.n(Qk.debris); i++) V.spawn({ p: p.clone().add(_v.set(R(-0.7, 0.7), 0.3, R(-0.7, 0.7))), v: _v.set(R(-6.5, 6.5), R(4.5, 12), R(-6.5, 6.5)).clone(), tile: i % 2 ? 'dirt' : 'dirt2', blend: 'alpha',
      size: R(0.35, 0.7), life: R(0.8, 1.2), gravity: 20, drag: 0.5, color: 0x24272e, alpha: 0.95, rot: R(0, 6.28), spin: R(-7, 7) });
    V.spawn({ p: p.clone().setY(p.y + 1.1), tile: 'sparkBall', size: [3.2, 6.5], life: 0.32, color: C.core, alpha: 0.95, rot: R(0, 6.28) });
    V.spawn({ p: p.clone().setY(p.y + 1.1), tile: 'sparkBall', size: [2.2, 5], life: 0.45, color: C.arc, alpha: 0.8, rot: R(0, 6.28), delay: 0.08 });
  }
  // 余震：由雷云底再劈下一道到 p（落雷的爆闪、电光环、焦痕、火星），再起一小团烟尘
  afterStrike(p) {
    this.strike(p.clone().add(_v.set(R(-1, 1), DG.cloud.base + R(1, 3), R(-1, 1))), p, true);
    this.marks.add(p, R(2.2, 3), 0.5, 2, 0.9);
    for (let i = 0; i < this.n(3); i++) this.vfx.spawn({ p: p.clone().add(_v.set(R(-0.4, 0.4), R(0.2, 0.6), R(-0.4, 0.4))), v: _v.set(R(-1.5, 1.5), R(0.6, 1.8), R(-1.5, 1.5)).clone(), tile: 'smoke', blend: 'alpha',
      size: [0.8, 2.0], life: R(0.6, 0.9), drag: 2, color: 0x4b5262, alpha: 0.35, rot: R(0, 6.28), spin: R(-1, 1) });
  }
  // 残留的电弧：落点 c 四周 r 米内贴地跳一道（偶尔一点爆闪）
  groundArc(c, r) {
    const a0 = R(0, 6.28), d0 = R(0.3, r), a1 = a0 + R(-0.9, 0.9), d1 = Math.max(0.2, d0 + R(-1.2, 1.2));
    const a = c.clone().add(_v.set(Math.cos(a0) * d0, R(0.05, 0.4), Math.sin(a0) * d0)), b = c.clone().add(_w.set(Math.cos(a1) * d1, R(0.05, 0.5), Math.sin(a1) * d1));
    this.arc(a, b, R(0.6, 1));
    if (Math.random() < 0.4) this.vfx.spawn({ p: b, tile: 'flare', size: R(0.5, 0.9), life: 0.08, color: C.core, alpha: 0.9 });
  }
  // 敌人身上缠着的电光：身侧两点之间一道细电弧、偶尔一团小电球，全身一闪蓝光
  unitArc(u) {
    const h = Math.max(1.2, (u.headY ?? u.pos.y + 1.8) - u.pos.y), rr = (u.radius ?? 0.45) + 0.12;
    const pt = (y) => { const a = R(0, 6.28); return u.pos.clone().add(_v.set(Math.cos(a) * rr, y, Math.sin(a) * rr)); };
    for (let i = 0; i < 2; i++) { const a = pt(R(0.1, 0.95) * h), b = pt(R(0.1, 0.95) * h); this.bolts.strike(a, b, { width: 0.7, life: 0.13, k: R(0.8, 1.1), core: false, thick: 0.035 }); }
    if (Math.random() < 0.5) this.vfx.spawn({ p: pt(R(0.3, 0.8) * h), tile: 'sparkBall', size: [0.7, 1.3], life: 0.14, color: C.core, alpha: 0.9, rot: R(0, 6.28) });
    u.char?.flash?.(C.arc, 0.45);
  }
  // 龙身上的一道电弧（a → b，细小）
  arc(a, b, k = 0.7) { this.bolts.strike(a, b, { width: 0.6, life: 0.12, k, core: false, thick: 0.025 }); }
  update(dt, camera) {
    this.area.update(dt); this.rift.update(dt); this.bolts.update(dt); this.marks.update(dt);
    if (camera) this.clouds.update(dt, camera, this.cloudFade);
  }
  clear() {
    this.area.hide(); this.area.a = 0; this.area.U.uA.value = 0; this.area.mesh.visible = false;
    this.rift.hide(); this.clouds.hide(); this.cloudFade = 0; this.bolts.clear(); this.marks.clear();
  }
  moveTo(scene) { this.scene = scene; for (const o of [this.area, this.rift, this.clouds, this.bolts, this.marks]) o.moveTo(scene); }
  meshes() { return [this.area.mesh, this.rift.front.m, this.rift.back.m, this.clouds.mesh, ...this.bolts.meshes(), this.marks.mesh]; }
}
