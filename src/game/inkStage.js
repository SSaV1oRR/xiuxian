// 第二十七轮：「墨里终焉」的画中世界——山水由玩家处向外铺开，原场景（宗门屋顶、Boss 场地的火墙、地纹、红光……）在墨雾幕后被逐步替换，退场时原样复原。
// 只是演出：不改碰撞、不改场景里任何物体的数据（只记下并切换显隐、灯光的颜色与强度；结束、跳过、作废都原样还回去，可重复调用）。
//   幕（curtain）：由玩家处向外推开的一圈墨雾（下部不透明、上部渐淡），幕内是纸与墨：原场景的物体在幕经过它最近的一点时隐去（有墨雾一团遮住那一下）；
//   地（ground）：宣纸色的地盘，演出处 40 米内按实际地面起伏（人、画卷不浮空、不穿地），再往外是平的；
//   天（dome）：宣纸色的天幕，随幕外推渐显；
//   山（land）：assets/converted/molizhongyan/land.glb 的四座山岛（Sketchfab「Mountain and River Scroll」黑白版，见 tools/r27_convert_land.py），
//         摆成近、中、远三圈（相对演出轴线的方位、距离、尺度、转角见 FINALE.land），幕经过时由地下升起、渗墨显现——真正的三维山体，镜头一动就有视差；
//         着色：贴图集的亮暗映射到墨色（近 #10151B、中 #414950、远 #858B8C）与纸色（#D8D0BE），按距离入雾（#BBBDB5）、山脚云气；
//   云气（mist）：几圈山脚的雾带；
//   灯：场景里的灯光颜色、强度渐渐换成中性的天光（Boss 场地的红光、火光压下去），退场时还原（只改数值，不增减灯——不触发着色器重编）。
import * as THREE from 'three';
import { FINALE as F } from './inkFinaleConfig.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const LC = Object.fromEntries(Object.entries(F.land_color).map(([k, v]) => [k, new THREE.Color(v)]));
const DEG = Math.PI / 180;
const _v = new THREE.Vector3(), _s = new THREE.Sphere(), _b = new THREE.Box3();
const HIDE_MASK = 1 << 30;                    // 被画中世界替换的原场景物体：挪到镜头不画的第 30 层（不改 visible——远近细节切换每帧会改它），阴影同样不画

// 把一组物体先在显卡上备好：只编着色器（renderer.compile）不够——第一次演出时才上传 4096 的山水图、十几万顶点的树（开演、山岛升起时
// 各卡 0.13 秒）；而且 Windows（ANGLE）上着色器要到第一次真正绘制时才最后编完。所以：贴图用 initTexture；几何体借 1×1 的离屏目标，
// 用不写颜色、不写深度的代用网格各画一次；再用原来的场景（灯、雾、色调映射都相同——着色器变体相同）真正画一次，只画屏幕左下角一个像素：
// 镜头临时只看第 29 层，这些物体（连同子物体，临时全显示）和镜头本来看得到的灯临时加上第 29 层，不更新阴影。下一帧照常整屏重画
const WARM_LAYER = 29;
export function gpuWarm(renderer, camera, scene, roots) {
  const texs = new Set(), geos = new Set();
  const KEYS = ['map', 'normalMap', 'alphaMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'bumpMap'];
  const scan = (m) => {
    if (!m) return;
    for (const k of KEYS) if (m[k]?.isTexture) texs.add(m[k]);
    if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u?.value?.isTexture) texs.add(u.value);
  };
  for (const r of roots) r?.traverse?.((o) => { if (o.geometry?.isBufferGeometry) geos.add(o.geometry); for (const m of [].concat(o.material || [])) scan(m); });
  let nt = 0;
  for (const t of texs) if (t.image && !t.isRenderTargetTexture && !t.isFramebufferTexture) { renderer.initTexture(t); nt++; }
  const sc = new THREE.Scene(), pm = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
  for (const g of geos) { const m = new THREE.Mesh(g, pm); m.frustumCulled = false; sc.add(m); }
  const rt = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false }), prev = renderer.getRenderTarget();
  try { renderer.setRenderTarget(rt); renderer.render(sc, camera); } finally { renderer.setRenderTarget(prev); rt.dispose(); pm.dispose(); }
  if (!scene) return { textures: nt, geometries: geos.size, drawn: 0 };
  const masks = [], vis = [], cam0 = camera.layers.mask, sm = renderer.shadowMap, au = sm.autoUpdate, nu = sm.needsUpdate;
  const sc0 = renderer.getScissorTest(), sv = renderer.getScissor(new THREE.Vector4());
  let drawn = 0;
  scene.traverse((o) => { if (o.isLight && o.layers.test(camera.layers)) { masks.push([o, o.layers.mask]); o.layers.enable(WARM_LAYER); } });
  for (const r of roots) r?.traverse?.((o) => { masks.push([o, o.layers.mask]); o.layers.enable(WARM_LAYER); vis.push([o, o.visible]); o.visible = true; if (o.isMesh) drawn++; });
  try {
    camera.layers.set(WARM_LAYER); sm.autoUpdate = false; sm.needsUpdate = false;
    renderer.setRenderTarget(null); renderer.setScissorTest(true); renderer.setScissor(0, 0, 1, 1);
    renderer.render(scene, camera);
  } finally {
    renderer.setScissor(sv); renderer.setScissorTest(sc0); renderer.setRenderTarget(prev);
    camera.layers.mask = cam0; sm.autoUpdate = au; sm.needsUpdate = nu;
    for (let i = masks.length - 1; i >= 0; i--) masks[i][0].layers.mask = masks[i][1];
    for (let i = vis.length - 1; i >= 0; i--) vis[i][0].visible = vis[i][1];
  }
  return { textures: nt, geometries: geos.size, drawn };
}

// 幕的半径随时间（秒，演出时刻）：分段线性（近处慢、远处快）
const WAVE = [[0.6, 0], [0.75, 7], [0.95, 16], [1.2, 32], [1.45, 60], [1.75, 105], [2.1, 170], [2.4, 240]];
export function waveRadius(t) {
  if (t <= WAVE[0][0]) return 0;
  for (let i = 1; i < WAVE.length; i++) if (t <= WAVE[i][0]) { const [t0, r0] = WAVE[i - 1], [t1, r1] = WAVE[i]; return r0 + (r1 - r0) * (t - t0) / (t1 - t0); }
  return WAVE[WAVE.length - 1][1];
}

// 宣纸的纸纹（程序绘制，平铺）
function paperTex(seed = 7, W = 512) {
  const c = document.createElement('canvas'); c.width = c.height = W;
  const g = c.getContext('2d'), img = g.createImageData(W, W), d = img.data;
  let s = seed >>> 0; const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < W * W; i++) { const v = 228 + rnd() * 18; d[i * 4] = v; d[i * 4 + 1] = v - 6; d[i * 4 + 2] = v - 16; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  // 纸里的纤维：几百根细短的淡线
  g.globalAlpha = 0.09; g.strokeStyle = '#6e6a60';
  for (let i = 0; i < 700; i++) { const x = rnd() * W, y = rnd() * W, a = rnd() * 6.28, l = 4 + rnd() * 18; g.lineWidth = 0.4 + rnd() * 0.8; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.5) * l * 0.5, y + Math.sin(a + 0.5) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

const COMMON = /* glsl */`
  uniform vec3 uNear, uMid, uFar, uPaper, uMist, uC; uniform float uGround, uReveal, uAlpha, uFoot, uAir, uTopH;
  uniform sampler2D uNoise;
  vec3 inkAt(float d) { return d < 45. ? mix(uNear, uMid, smoothstep(12., 45., d)) : mix(uMid, uFar, smoothstep(45., 135., d)); }
  vec3 shadeInk(float L, vec3 W, vec3 N) {
    float d = length(W.xz - uC.xz);
    float hk = clamp((W.y - uGround) / max(1., uTopH), 0., 1.);
    // 浓墨山水（第二十七轮按反馈加浓）：贴图的明暗压成以墨为主——中间调都落进墨里，只有亮处留纸白；
    // 峰顶、脊线再压一层浓墨，山脚略淡（入云）；墨色按远近取色板（近 #10151B、中 #414950、远 #858B8C），不再淡成纸色
    float tone = pow(smoothstep(.02, .95, L), 1.7);
    float t = 1. - tone;                                              // 贴图里的墨（皴笔、山石的暗面）
    float w = mix(.22, .78, smoothstep(.04, .72, hk));                // 山体的一层墨晕：山脚淡（入云）、山腰以上浓
    float ink = 1. - (1. - w) * (1. - t * .88);                       // 墨晕与皴笔叠在一起（两层墨的叠加）
    ink = mix(ink, 1., smoothstep(.62, 1., hk) * .3);                 // 峰顶、脊线再压一层浓墨
    vec3 col = mix(uPaper, inkAt(d), clamp(ink, 0., 1.));
    col *= .86 + .2 * clamp(N.y * .5 + .5, 0., 1.);
    float air = smoothstep(25., 210., d) * uAir;
    float foot = 1. - smoothstep(0., uFoot, W.y - uGround);
    return mix(col, uMist, clamp(air + foot * .55, 0., .8));
  }
  // 渗墨显现：噪声阈值（显现前沿一线浓墨）
  float reveal(vec3 W, out float edge) {
    float n = texture2D(uNoise, W.xz * .021 + W.y * .013).r * .7 + texture2D(uNoise, W.xz * .09).r * .3;
    float th = 1. - uReveal * 1.08;
    edge = smoothstep(th + .09, th, n) * step(.001, uReveal) * step(uReveal, .999);
    return n - th;
  }`;
const VS = /* glsl */`
  varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying vec3 vCol;
  // 顶点色：转出来的描边、伞松是 RGBA（three 这时声明 vec4 color，只取 rgb）；没开顶点色的材质自己声明一个（不绑定时为 0）
  #ifdef USE_COLOR
  #else
  attribute vec3 color;
  #endif
  void main() { vUv = uv; vCol = color.rgb; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;

// 量化过的几何（KHR_mesh_quantization：归一化的 Int16 / Int8 / Uint8 …）展开成浮点的副本
function floatGeo(src) {
  const g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(src.attributes)) {
    if (a.isInterleavedBufferAttribute || !(a.array instanceof Float32Array) || a.normalized) {
      const n = a.count, k = a.itemSize, out = new Float32Array(n * k);
      for (let i = 0; i < n; i++) { out[i * k] = a.getX(i); if (k > 1) out[i * k + 1] = a.getY(i); if (k > 2) out[i * k + 2] = a.getZ(i); if (k > 3) out[i * k + 3] = a.getW(i); }
      g.setAttribute(name, new THREE.BufferAttribute(out, k));
    } else g.setAttribute(name, a.clone());
  }
  if (src.index) g.setIndex(src.index.clone());
  return g;
}

export class InkStage {
  // scene：当前场景；assets：{ land: gltf, bw: Texture, brush: Texture, noise: Texture }；quality：粒子画质（< 0.75 为流畅）；hooks：{ ground(x, z, yRef), onHide(center, radius) }
  constructor(scene, { assets = {}, quality = 1 } = {}) {
    this.scene = scene; this.A = assets; this.q = quality;
    this.ready = false; this.active = false;
    this.hidden = []; this.hiddenL = []; this.lights = []; this.cands = [];
    this.stat = { begins: 0, hiddenMax: 0, restored: 0 };
    try { this.build(); this.ready = true; } catch (e) { console.warn('[墨里终焉] 画中世界没能建好（只少了山水与原场景的替换，演出照常）', e); }
  }
  // ---------- 一次建好 ----------
  build() {
    const A = this.A;
    if (!A.land || !A.noise) throw new Error('山水素材没载入');
    this.paper = paperTex(11);
    this.root = new THREE.Group(); this.root.name = 'ink-stage'; this.root.visible = false;
    const base = () => ({ uNear: { value: LC.near }, uMid: { value: LC.mid }, uFar: { value: LC.far }, uPaper: { value: LC.paper }, uMist: { value: LC.mist }, uC: { value: new THREE.Vector3() },
      uGround: { value: 0 }, uReveal: { value: 0 }, uAlpha: { value: 1 }, uFoot: { value: 3 }, uAir: { value: 0.55 }, uTopH: { value: 10 }, uNoise: { value: A.noise } });
    this.base = base;
    // 三种山体材质的「原型」（每个摆放各克隆一份，各自的显现进度；同一个着色器程序）
    const mk = (kind) => {
      const U = base();
      if (kind === 'tex') U.uTex = { value: A.bw };
      if (kind === 'brush') U.uTex = { value: A.brush };
      const frag = kind === 'tex' ? `uniform sampler2D uTex; ${COMMON}
          varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying vec3 vCol;
          void main() { float e; if (reveal(vW, e) < 0.) discard; float L = texture2D(uTex, vUv).r; vec3 c = shadeInk(L, vW, vN); c = mix(c, uNear, e * .85); gl_FragColor = vec4(c, 1.);
          #include <colorspace_fragment>
 }`
        : kind === 'brush' ? `uniform sampler2D uTex; ${COMMON}
          varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying vec3 vCol;
          void main() { float e; if (reveal(vW, e) < 0.) discard; vec4 t = texture2D(uTex, vUv); if (t.a < .45) discard; float L = dot(t.rgb, vec3(.3, .59, .11)); vec3 c = shadeInk(L * .8, vW, vec3(0., 1., 0.)); gl_FragColor = vec4(c, 1.);
          #include <colorspace_fragment>
 }`
        : `${COMMON}
          varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying vec3 vCol;
          void main() { float e; if (reveal(vW, e) < 0.) discard; float L = dot(vCol, vec3(.3, .59, .11)); vec3 c = shadeInk(L, vW, vN); c = mix(c, uNear, e * .85); gl_FragColor = vec4(c, 1.);
          #include <colorspace_fragment>
 }`;
      const m = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS, fragmentShader: frag, vertexColors: kind === 'col', side: kind === 'brush' ? THREE.DoubleSide : THREE.FrontSide });
      m.customProgramCacheKey = () => 'ink-stage-' + kind;
      return m;
    };
    this.protoMat = { tex: mk('tex'), col: mk('col'), brush: mk('brush') };
    // 山岛的几何（各岛：mtn / rest 用贴图集；line / tree 用顶点色；brush 用笔触贴图）
    const isl = {};
    A.land.scene.traverse((o) => {
      if (!o.isMesh) return;
      const m = /^isl(\d+)_(\w+)/.exec(o.name) || /^isl(\d+)_(\w+)/.exec(o.parent?.name || '');
      if (!m) return;
      const k = +m[1], part = m[2];
      o.updateWorldMatrix(true, false);
      const g = floatGeo(o.geometry); g.applyMatrix4(o.matrixWorld);         // 量化（归一化的整数）先展开成浮点，再把节点变换（含反量化的缩放）烘进几何
      if (!g.attributes.normal) g.computeVertexNormals();
      g.computeBoundingBox(); g.computeBoundingSphere();
      (isl[k] ||= {})[part] = g;
    });
    this.islands = Object.keys(isl).sort().map((k) => {
      const parts = isl[k], box = new THREE.Box3();
      for (const g of Object.values(parts)) box.union(g.boundingBox);
      return { parts, box, size: box.getSize(new THREE.Vector3()) };
    });
    if (this.islands.length < 4) throw new Error('山岛不足 4 座');
    // 摆放：近、中、远各若干（每个一组网格，材质各自一份）
    const low = this.q < 0.75;
    this.places = [];
    for (const [layer, list] of [['near', F.land.near], ['mid', F.land.mid], ['far', F.land.far]]) {
      for (const [k, az, dist, sc, rot] of list) {
        const I = this.islands[k]; if (!I) continue;
        const grp = new THREE.Group(); grp.name = `ink-land-${layer}-${k}`;
        const mats = [];
        for (const [part, g] of Object.entries(I.parts)) {
          if (part === 'brush') continue;                                                                     // 地面笔触：贴图是整张笔触点阵，远看成一排排虚线，不用
          if (layer === 'far' && (part === 'tree' || part === 'rest')) continue;                             // 远山：树、屋舍看不见，不画
          if (low && ((!F.low.trees && part === 'tree') || (F.low.restNear && layer !== 'near' && part === 'rest'))) continue;   // 流畅画质先减次要层（FINALE.low）
          const kind = part === 'line' || part === 'tree' ? 'col' : part === 'brush' ? 'brush' : 'tex';
          const mat = this.protoMat[kind].clone(); mat.customProgramCacheKey = this.protoMat[kind].customProgramCacheKey;
          mat.uniforms.uNoise.value = A.noise; if (mat.uniforms.uTex) mat.uniforms.uTex.value = kind === 'brush' ? A.brush : A.bw;
          const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = true; mesh.name = `ink-land-${part}`;
          grp.add(mesh); mats.push(mat);
        }
        grp.visible = false;
        this.root.add(grp);
        this.places.push({ layer, k, az, dist, sc, rot, grp, mats, I, t0: 0, dur: layer === 'near' ? 0.8 : layer === 'mid' ? 0.9 : 0.85 });
      }
    }
    // ---- 地：极坐标网格（半径分段由密到疏），顶点高度在 begin 时按实际地面填 ----
    const RINGS = [0, 0.8, 1.7, 2.7, 3.9, 5.2, 6.7, 8.4, 10.3, 12.5, 15, 18, 21.5, 25.5, 30, 35, 40, 50, 64, 82, 105, 135, 175, F.land.ground];
    const NA = 96;
    this.rings = RINGS; this.na = NA;
    const pos = new Float32Array(RINGS.length * NA * 3), idx = [];
    for (let i = 0; i < RINGS.length - 1; i++) for (let j = 0; j < NA; j++) {
      const a = i * NA + j, b = i * NA + (j + 1) % NA, c = (i + 1) * NA + j, d = (i + 1) * NA + (j + 1) % NA;
      idx.push(a, b, c, b, d, c);                 // 朝上（俯视逆时针）：角度沿 +x → +z 增加，(a, b, c) 的法线向上
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    gg.setIndex(idx);
    const UG = { ...base(), uPaperTex: { value: this.paper }, uR: { value: 0 }, uO: { value: new THREE.Vector3() } };
    const gm = new THREE.ShaderMaterial({ uniforms: UG, transparent: true, depthWrite: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform sampler2D uPaperTex, uNoise; uniform vec3 uPaper, uMist, uMid, uNear, uC, uO; uniform float uR, uAlpha; varying vec3 vW;
        void main() {
          float r = length(vW.xz - uO.xz);
          float n = texture2D(uNoise, vW.xz * .035).r, n2 = texture2D(uNoise, vW.xz * .006 + .3).r;
          float rr = uR * (.94 + .1 * n);
          if (r > rr) discard;
          vec3 p = texture2D(uPaperTex, vW.xz * .16).rgb;
          vec3 col = mix(uPaper, vec3(.93, .91, .87), .35) * (p / vec3(.9, .88, .84));
          // 极淡的大片墨晕（像纸上洇开的淡墨）；远处入雾
          float n3 = texture2D(uNoise, vW.xz * .0021 + .7).r;
          col = mix(col, uMid, smoothstep(.55, .92, n2) * .12 + smoothstep(.6, .95, n3) * .08);
          float d = length(vW.xz - uC.xz);
          col = mix(col, uMist, smoothstep(30., 200., d) * .65);
          // 铺开的前沿：一线墨
          float edge = 1. - smoothstep(0., 1.4 + uR * .012, rr - r);
          col = mix(col, uNear, edge * .55 * step(r, rr));
          gl_FragColor = vec4(col, uAlpha);
          #include <colorspace_fragment>

        }` });
    gm.customProgramCacheKey = () => 'ink-stage-ground';
    this.ground = new THREE.Mesh(gg, gm); this.ground.name = 'ink-ground'; this.ground.frustumCulled = false; this.ground.renderOrder = 1; this.ground.receiveShadow = false;
    this.root.add(this.ground);
    // ---- 天幕 ----
    const dm = new THREE.ShaderMaterial({ uniforms: { uK: { value: 0 }, uPaper: { value: LC.paper }, uMist: { value: LC.mist }, uFar: { value: LC.far }, uNoise: { value: A.noise }, uPaperTex: { value: this.paper } },
      vertexShader: 'varying vec3 vD; varying vec2 vUv; void main(){ vD = normalize(position); vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform float uK; uniform vec3 uPaper, uMist, uFar; uniform sampler2D uNoise, uPaperTex; varying vec3 vD; varying vec2 vUv;
        void main() {
          float h = vD.y;
          vec3 c = mix(uMist, uPaper, smoothstep(-.02, .45, h));
          float cl = texture2D(uNoise, vec2(vUv.x * 6., h * 3.)).r;
          c = mix(c, uFar, smoothstep(.55, .9, cl) * (1. - smoothstep(.0, .35, abs(h - .12))) * .22);
          c *= texture2D(uPaperTex, vUv * vec2(10., 5.)).rgb / vec3(.9, .88, .84) * .25 + .75;
          gl_FragColor = vec4(c, uK);
          #include <colorspace_fragment>

        }`, transparent: true, depthWrite: false, side: THREE.BackSide });
    dm.customProgramCacheKey = () => 'ink-stage-dome';
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(F.land.dome, 48, 24), dm); this.dome.name = 'ink-dome'; this.dome.frustumCulled = false; this.dome.renderOrder = -5;
    this.root.add(this.dome);
    // ---- 幕：向外推开的墨雾（下部不透明，挡住幕外正在被替换的原场景）----
    const cm = new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uR: { value: 1 }, uIn: { value: 0 }, uMist: { value: LC.mist }, uPaper: { value: LC.paper }, uMid: { value: LC.mid }, uFar: { value: LC.far }, uNoise: { value: A.noise }, uT: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uA, uR, uT, uIn; uniform vec3 uMist, uPaper, uMid, uFar; uniform sampler2D uNoise; varying vec2 vUv; varying vec3 vW;
        void main() {
          float v = vUv.y, u = vUv.x;
          float n = texture2D(uNoise, vec2(u * 9. + uT * .05, v * 1.3 - uT * .1)).r, n2 = texture2D(uNoise, vec2(u * 31., v * 4.)).r;
          float top = .62 + .22 * n;
          float a = 1. - smoothstep(top - .18, top + .12, v);
          // 从幕外看（正面）：一圈半透明的墨雾（看得见幕里的人）；从幕里看（背面）：下部不透明，挡住幕外正被替换的原场景
          a *= gl_FrontFacing || uIn < .5 ? .42 : 1.;
          vec3 c = mix(uMist, uPaper, smoothstep(.0, .8, v) * .7);
          // 下部几道横向的淡墨（雾里的山影）、底边一线墨（地上铺开的前沿）
          c = mix(c, uFar, smoothstep(.62, .9, n2) * (1. - smoothstep(.05, .35, v)) * .28);
          c = mix(c, uMid, (1. - smoothstep(.0, .05, v)) * .6);
          gl_FragColor = vec4(c, a * uA);
          #include <colorspace_fragment>

        }`, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    cm.customProgramCacheKey = () => 'ink-stage-curtain';
    this.curtain = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 128, 6, true).translate(0, 0.5, 0), cm); this.curtain.name = 'ink-curtain'; this.curtain.frustumCulled = false; this.curtain.renderOrder = 6;
    this.root.add(this.curtain);
    // ---- 山脚云气 ----
    this.mists = (low ? F.land.mist.slice(0, F.low.mist) : F.land.mist).map(([r, h, k], i) => {
      const m = new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uK: { value: k }, uMist: { value: LC.mist }, uPaper: { value: LC.paper }, uNoise: { value: A.noise }, uT: { value: 0 }, uSeed: { value: i * 0.37 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
        fragmentShader: `uniform float uA, uK, uT, uSeed; uniform vec3 uMist, uPaper; uniform sampler2D uNoise; varying vec2 vUv;
          void main() {
            float n = texture2D(uNoise, vec2(vUv.x * 7. + uT * .01 + uSeed, vUv.y * .8)).r, n2 = texture2D(uNoise, vec2(vUv.x * 19. - uT * .02, vUv.y * 2.)).r;
            float a = (1. - smoothstep(.15 + .35 * n, .85, vUv.y)) * smoothstep(.0, .12, vUv.y) * (.55 + .45 * n2);
            gl_FragColor = vec4(mix(uMist, uPaper, .3 + .3 * n), a * uK * uA);
          #include <colorspace_fragment>

          }`, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      m.customProgramCacheKey = () => 'ink-stage-mist';
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 96, 1, true).translate(0, h / 2 - 1, 0), m);
      mesh.name = 'ink-mist'; mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.visible = false;
      this.root.add(mesh);
      return { mesh, r, h };
    });
    this.scene.add(this.root);
  }
  moveTo(scene) { this.restore(); this.scene = scene; if (this.root) scene.add(this.root); }
  objects() { return this.root ? [this.root] : []; }

  // =====================================================================================
  // 开演：演出中心 E、轴线（u：起点 B 指向敌人的反方向——即玩家走向、拔刀穿行的方向）、幕的起点 O（玩家凝聚处）、地面高度；场景隔离的候选
  // =====================================================================================
  begin(S, { center, fwd, origin, y0, ground, keep = [], onHide = null, camR = 14 }) {
    if (!this.ready) return;
    this.stat.begins++;
    this.restore();
    this.active = true; this.exiting = false;
    this.S = S; this.C = center.clone(); this.fwd = fwd.clone().setY(0).normalize(); this.O = origin.clone(); this.y0 = y0; this.onHide = onHide;
    this.left = new THREE.Vector3(this.fwd.z, 0, -this.fwd.x);
    this.camR = camR;
    this.root.visible = true; this.root.position.set(0, 0, 0);
    // 地：演出处 40 米内按实际地面（相对 y0 限制在 ±1.4 米、轻微平滑），往外平的
    const R = this.rings, NA = this.na, pa = this.ground.geometry.attributes.position.array;
    const hs = new Float32Array(R.length * NA);
    for (let i = 0; i < R.length; i++) for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2, x = this.C.x + Math.cos(a) * R[i], z = this.C.z + Math.sin(a) * R[i];
      let y = y0;
      if (R[i] <= 40) { const g = ground(x, z, y0); if (g != null && Math.abs(g - y0) < 1.4) y = g; else if (g != null) y = y0 + Math.sign(g - y0) * 1.4; }
      const k = smooth(30, 40, R[i]);
      hs[i * NA + j] = y * (1 - k) + y0 * k;
    }
    for (let i = 0; i < R.length; i++) for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2, p = (i * NA + j) * 3;
      // 相邻平均一次（地面采样里偶尔的台阶、栏杆顶不带进来）
      const jp = (j + 1) % NA, jm = (j + NA - 1) % NA, h = hs[i * NA + j];
      const hn = (hs[i * NA + jp] + hs[i * NA + jm] + h * 2) / 4;
      pa[p] = this.C.x + Math.cos(a) * R[i]; pa[p + 1] = (Math.abs(hn - h) > 0.25 ? h : hn) + 0.025; pa[p + 2] = this.C.z + Math.sin(a) * R[i];
    }
    this.ground.geometry.attributes.position.needsUpdate = true;
    this.ground.geometry.computeBoundingSphere();
    const GU = this.ground.material.uniforms;
    GU.uR.value = 0; GU.uO.value.copy(this.O); GU.uC.value.copy(this.C); GU.uAlpha.value = 1;
    this.dome.position.set(this.C.x, y0, this.C.z); this.dome.material.uniforms.uK.value = 0;
    this.curtain.position.set(this.O.x, y0 - 2, this.O.z); this.curtain.material.uniforms.uA.value = 0;
    for (const m of this.mists) { m.mesh.position.set(this.C.x, y0, this.C.z); m.mesh.visible = false; m.mesh.material.uniforms.uA.value = 0; }
    // 山岛：方位角 0 = 演出前方（fwd），顺时针为正（俯视）；底边沉到地下
    const clearR = { near: 12.5, mid: 24, far: 60 };
    for (const p of this.places) {
      const a = p.az * DEG, dir = new THREE.Vector3().addScaledVector(this.fwd, Math.cos(a)).addScaledVector(this.left, -Math.sin(a));
      const foot = 0.5 * Math.hypot(p.I.size.x, p.I.size.z) * p.sc;
      const dist = Math.max(p.dist, clearR[p.layer] + foot * 0.62);
      p.pos = new THREE.Vector3(this.C.x + dir.x * dist, y0, this.C.z + dir.z * dist);
      p.d = dist; p.foot = foot; p.h = p.I.size.y * p.sc;
      p.grp.scale.setScalar(p.sc);
      p.grp.rotation.set(0, Math.atan2(this.fwd.x, this.fwd.z) + p.rot * DEG, 0);
      p.grp.position.copy(p.pos).setY(y0 - p.h);
      p.grp.visible = false; p.t0 = null;
      for (const m of p.mats) { const U = m.uniforms; U.uC.value.copy(this.C); U.uGround.value = y0; U.uReveal.value = 0; U.uFoot.value = p.layer === 'near' ? 1.2 : p.layer === 'mid' ? 4 : 10; U.uAir.value = this.q < 0.75 ? 0.28 : 0.32; U.uTopH.value = p.h; }
    }
    // 场景隔离：候选物体（逐层往下找；含要保留的物体的那一支往下拆；大件按更细的子物体；灯不动）
    this.keep = new Set(keep.filter(Boolean)); this.keep.add(this.root);
    this.cands = []; this.hidden = []; this.hiddenL = [];
    const keepAnc = new Set();
    for (const k of this.keep) { let o = k; while (o) { keepAnc.add(o); o = o.parent; } }
    const sphereOf = (o) => {
      _b.makeEmpty();
      o.traverse((c) => {
        if (!(c.isMesh || c.isLine || c.isPoints || c.isSprite)) return;
        const g = c.geometry; if (!g) return;
        if (c.isInstancedMesh) { if (!c.boundingSphere) c.computeBoundingSphere?.(); if (c.boundingSphere) { _s.copy(c.boundingSphere).applyMatrix4(c.matrixWorld); _b.expandByPoint(_v.copy(_s.center).addScalar(_s.radius)); _b.expandByPoint(_v.copy(_s.center).addScalar(-_s.radius)); } return; }
        if (!g.boundingSphere) g.computeBoundingSphere();
        if (!g.boundingSphere || !Number.isFinite(g.boundingSphere.radius)) return;
        _s.copy(g.boundingSphere).applyMatrix4(c.matrixWorld);
        _b.expandByPoint(_v.copy(_s.center).addScalar(_s.radius)); _b.expandByPoint(_v.copy(_s.center).addScalar(-_s.radius));
      });
      if (_b.isEmpty()) return null;
      return _b.getBoundingSphere(new THREE.Sphere());
    };
    const visit = (node, depth) => {
      for (const c of node.children) {
        if (this.keep.has(c) || c.isLight || c.isCamera) continue;
        if (keepAnc.has(c)) { visit(c, depth + 1); continue; }
        c.updateWorldMatrix(true, true);
        const sp = sphereOf(c);
        if (!sp) continue;
        const big = sp.radius > 26 && c.children.length > 0 && !c.isMesh && depth < 5;
        if (big) { visit(c, depth + 1); continue; }
        const dO = sp.center.distanceTo(this.O), inside = Math.min(40, Math.max(14, this.camR + 3));
        // 含着幕的起点（地形、地板、天空）：幕推过镜头之后才隐去（那时镜头已在幕内、近处已是纸地，幕外的被幕挡着）；
        // 很大的一件（半径 > 20 米，近缘离得近、整体却铺得很远）：同样等镜头进了幕再隐去，免得远处的部分在幕外整块消失；其余按幕经过它最近的一点
        const near = dO - sp.radius + 0.5;
        const at = dO <= sp.radius ? inside : sp.radius > 20 ? Math.max(near, Math.min(dO, inside)) : near;
        this.cands.push({ o: c, at, c: sp.center, r: sp.radius });
      }
    };
    this.scene.updateMatrixWorld(true);
    visit(this.scene, 0);
    this.cands.sort((a, b) => a.at - b.at);
    this.ci = 0;
    // 灯：记下原值
    this.lights = [];
    this.scene.traverse((o) => { if (o.isLight) this.lights.push({ o, c: o.color.clone(), i: o.intensity, g: o.groundColor?.clone() ?? null }); });
    this.lightK = 0;
    this.R = 0;
  }

  // =====================================================================================
  // 每帧：t 演出时刻
  // =====================================================================================
  tick(t, dt, camera = null) {
    if (!this.active) return;
    const T = F.show, R = this.exiting ? this.R : waveRadius(t);
    this.R = R;
    // 幕（镜头进了幕：从里往外看的那一面下部不透明）
    const CU = this.curtain.material.uniforms;
    CU.uT.value += dt;
    CU.uIn.value = camera && Math.hypot(camera.position.x - this.O.x, camera.position.z - this.O.z) < R - 0.5 ? 1 : 0;
    const ca = this.exiting ? 0 : smooth(T.land.wave[0], T.land.wave[0] + 0.08, t) * (1 - smooth(T.land.wave[1] - 0.12, T.land.wave[1] + 0.06, t));     // 幕推完才淡去（幕后正在替换的原场景一直挡着）
    CU.uA.value = ca;
    this.curtain.visible = ca > 0.002 && R > 0.05;
    const hC = Math.max(30, F.land.wall * R);
    this.curtain.scale.set(Math.max(0.05, R), hC + 2, Math.max(0.05, R));
    // 地、天、云气
    this.ground.material.uniforms.uR.value = R;
    this.ground.visible = R > 0.05;
    const dk = smooth(T.land.dome[0], T.land.dome[1], t);
    this.dome.material.uniforms.uK.value = this.exiting ? this.dome.material.uniforms.uK.value : dk;
    this.dome.visible = this.dome.material.uniforms.uK.value > 0.002;
    for (const m of this.mists) { const k = smooth(m.r * 0.8, m.r * 1.3 + 10, R); m.mesh.material.uniforms.uA.value = this.exiting ? m.mesh.material.uniforms.uA.value : k; m.mesh.material.uniforms.uT.value += dt; m.mesh.visible = m.mesh.material.uniforms.uA.value > 0.002; }
    // 山岛：幕经过它的近缘时由地下升起、渗墨显现
    for (const p of this.places) {
      if (p.t0 == null && R >= p.d - p.foot * 0.7) p.t0 = t;
      if (p.t0 == null) { p.grp.visible = false; continue; }
      const u = clamp01((t - p.t0) / p.dur), e = 1 - Math.pow(1 - u, 3);
      p.grp.visible = true;
      p.grp.position.y = this.y0 - p.h * 0.75 * (1 - e) - F.land.sink * p.sc;
      for (const m of p.mats) m.uniforms.uReveal.value = this.exiting ? m.uniforms.uReveal.value : smooth(0, 0.7, u);
    }
    // 原场景：幕经过即隐去（大件有墨雾遮一下）
    // 幕推到头（2.4 秒）：还没隐去的原场景（幕外更远处）一并隐去——天幕之外的本来就被挡着，天幕之内的不留
    const done = !this.exiting && t >= T.land.wave[1];
    while (this.ci < this.cands.length && (this.cands[this.ci].at <= R || done)) {
      const c = this.cands[this.ci++];
      const was = c.o.visible;
      c.o.traverse((x) => { if (x.isLight || x.isCamera) return; this.hiddenL.push([x, x.layers.mask]); x.layers.mask = HIDE_MASK; });
      this.hidden.push(c.o);
      if (was && c.r > 1.5 && c.at > 0.6) this.onHide?.(c.c, c.r);
    }
    this.stat.hiddenMax = Math.max(this.stat.hiddenMax, this.hidden.length);
    // 灯：换成中性的天光（Boss 场地的红光、火光压下去）——真正套上在 lateLights（这一帧天空、场地都更新完之后）
    this.lightK = this.exiting ? 0 : smooth(0.7, 1.7, t);
  }
  // 每帧最后（main.js 在绘制之前调）：别的系统这一帧改过的灯先记作新的原值，再按 lightK 换成中性的天光
  lateLights() {
    if (!this.active || !this.lights.length) return;
    const k = this.lightK;
    for (const L of this.lights) {
      const o = L.o;
      if (L.set && (o.intensity !== L.set.i || !o.color.equals(L.set.c) || (L.g && !o.groundColor.equals(L.set.g)))) { L.c.copy(o.color); L.i = o.intensity; if (L.g) L.g.copy(o.groundColor); }
    }
    this.applyLights(k);
    for (const L of this.lights) L.set = { i: L.o.intensity, c: L.o.color.clone(), g: L.g ? L.o.groundColor.clone() : null };
  }
  applyLights(k) {
    const W = new THREE.Color(0xfff6ea), SK = new THREE.Color(0xf2efe8), GR = new THREE.Color(0x8c8a84);
    for (const L of this.lights) {
      const o = L.o;
      if (o.isDirectionalLight) { o.color.copy(L.c).lerp(W, k); o.intensity = L.i + (Math.max(L.i, 2.6) - L.i) * k; }
      else if (o.isHemisphereLight) { o.color.copy(L.c).lerp(SK, k); if (L.g) o.groundColor.copy(L.g).lerp(GR, k); o.intensity = L.i + (Math.max(L.i, 1.1) - L.i) * k; }
      else if (o.isAmbientLight) { o.color.copy(L.c).lerp(W, k); o.intensity = L.i + (Math.max(L.i, 0.5) - L.i) * k; }
      else { o.color.copy(L.c).lerp(W, k * 0.6); o.intensity = L.i * (1 - 0.85 * k); }
    }
  }
  // 退场开始：原场景、灯光立刻还原；画中世界——有后期叠化时立刻收（叠化由后期做），没有时 fadeOut 秒里淡去
  exitStart(crossfade) {
    if (!this.active) return;
    this.restoreScene();
    this.exiting = true; this.crossfade = crossfade;
    if (crossfade) this.hideAll();
  }
  exitTick(k) {
    if (!this.active || !this.exiting || this.crossfade) return;
    const a = 1 - k;
    this.ground.material.uniforms.uAlpha.value = a;
    this.dome.material.uniforms.uK.value = Math.min(this.dome.material.uniforms.uK.value, a);
    for (const m of this.mists) m.mesh.material.uniforms.uA.value = Math.min(m.mesh.material.uniforms.uA.value, a);
    for (const p of this.places) for (const m of p.mats) m.uniforms.uReveal.value = Math.min(m.uniforms.uReveal.value, a);
  }
  hideAll() {
    if (!this.root) return;
    this.root.visible = false;
    for (const p of this.places) p.grp.visible = false;
  }
  restoreScene() {
    for (let i = this.hiddenL.length - 1; i >= 0; i--) { const [x, m] = this.hiddenL[i]; x.layers.mask = m; }
    if (this.hidden.length) this.stat.restored++;
    this.hidden = []; this.hiddenL = []; this.cands = []; this.ci = 0;
    for (const L of this.lights) { L.o.color.copy(L.c); L.o.intensity = L.i; if (L.g) L.o.groundColor.copy(L.g); }
    this.lights = []; this.lightK = 0;
  }
  // 结束、跳过、作废：全部还原（可重复调用）
  restore() {
    this.restoreScene();
    this.hideAll();
    this.active = false; this.exiting = false; this.S = null;
  }
  // 着色器预编译：全部临时摆出来编一次；贴图、几何体也先传上显卡
  prewarm(renderer, camera) {
    if (!this.ready) return;
    const keep = this.root.visible;
    const vis = this.places.map((p) => p.grp.visible);
    const p0 = camera.position.clone().add(new THREE.Vector3(0, 0, -30).applyQuaternion(camera.quaternion));
    const pos = this.places.map((p) => p.grp.position.clone());
    this.root.visible = true;
    for (const p of this.places) { p.grp.visible = true; p.grp.position.copy(p0); }
    for (const o of [this.ground, this.dome, this.curtain, ...this.mists.map((m) => m.mesh)]) o.visible = true;
    try { renderer.compile(this.scene, camera); this.gpu = gpuWarm(renderer, camera, this.scene, [this.root, ...this.places.map((p) => p.grp)]); } finally {
      this.root.visible = keep;
      this.places.forEach((p, i) => { p.grp.visible = vis[i]; p.grp.position.copy(pos[i]); });
    }
  }
  census() {
    return { active: this.active, R: +this.R?.toFixed?.(2) || 0, hidden: this.hidden.length, cands: this.cands.length, islands: this.places.filter((p) => p.grp.visible).length,
      ground: !!this.ground?.visible && this.root?.visible, dome: +(this.dome?.material.uniforms.uK.value ?? 0).toFixed(2), curtain: !!this.curtain?.visible && this.root?.visible, lightK: +this.lightK.toFixed(2) };
  }
}
