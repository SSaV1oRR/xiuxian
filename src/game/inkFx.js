// 第二十轮：水墨特效——项目里的 Unity 素材包 FX_Ink slash（assets/special effects/FX_Ink_slash）在 three.js 里的重建。
// 第二十三轮：普攻四式的水墨重做，合用两组素材（拔刀斩的月牙、蓄力、剑气照旧，不改它的配色与时序）：
//   第一组 FX_Ink slash（第二十轮已转换）：展开墨弧六帧（笔头、枯笔尾）、墨溅、墨点、墨雾、白光；
//   第二组 assets/special effects/ink（《只狼》水墨模组的 DCX 封包，tools/r23_extract_ink.py 解出贴图集 assets/converted/fx/ink2）：
//     宽墨刷（毛边、溅点）、淡墨刷、干笔飞白、墨团由聚到散 / 浓墨团序列帧、甩墨细丝、笔锋、晕墨、墨雾序列帧、笔刷圆环。
//   主墨带：沿剑的真实轨迹铺，判定段里把外沿沿剑身伸到这一式的判定距离（主核心的外缘 = 有效攻击范围）；内沿在剑身外段，靠剑一侧淡墨过渡；
//     笔触 = 展开墨弧 × 宽墨刷，外侧干笔飞白挖出空白；配色 主墨 #15191F、深核心 #080B10、灰墨 #46505A、飞白 #D8D1C4，外沿只一线细亮刀锋。
//   外层：沿判定段的外沿撒墨雾、飞白、笔锋、墨点，低透明、随挥剑的走向带出去、0.2–0.4 秒散尽，前后错层、疏密不一（不连成一道边）。
//   命中：只在真实命中的接触点——斜斩横斩中小型飞溅、突刺向前穿出的笔锋、重劈厚重并向下与两侧展开、暴击适度放大。
// 素材：tools/r20_unpack_unitypackage.py 解包（原包不动）→ tools/r20_build_ink.py 把包里的 PNG 做成三张灰度图（粒子贴图集、展开的墨弧长条、溶解噪声），
//       tools/r20_convert_ink_meshes.py 把包里两个 FBX（月牙带 Eric_Cylinder002、弯带子 Ink_Plane001）转成 glb；
//       预制体里粒子系统的参数（寿命、大小、透明度曲线、序列帧、发射时刻）由 tools/r20_ink_parse.py 读出，取用处注在 combatConfig.js 的 INK。
//       Unity 的粒子系统、Animator、ShaderForge 溶解着色器在网页里都没有——下面各按其效果重写（材质、粒子、动画、时序）。
// 五样东西，都预先建好、循环取用：
//   Sprites  墨粒子：墨溅、受击墨花、拉长的墨滴、墨雾、白光小点 / 细条 / 月牙光。实例化四边形（浓墨、灰雾用普通混合；白光用加色），
//            出生时写一次，之后位置、大小、序列帧、溶解全在着色器里按年龄推算（与 world/vfx.js 同一思路）
//   Ribbons  刀光带子：沿剑的真实轨迹铺开（剑身中段 → 剑尖外伸），轨迹按动作本身在两帧之间补点（Cultivator.bladeLocalAt），帧率低时也是圆弧、与画面上的剑一致；
//            贴展开的墨弧（ink_all 六帧）：笔头跟着剑刃、枯笔的尾巴拖在后面；收剑后六帧依次碎开、再以噪声溶解淡出；外沿一线白光只跟着剑尖一小段。
//            侧对镜头时朝镜头补一点宽度；突刺是剑尖划过处一笔朝镜头的墨痕
//   Bands    月牙带：拔刀斩出刀时放平在身周，外沿 = 判定距离、张开 = 判定弧，自左向右扫开、随后碎开；拔刀斩的剑气也用它（缩小、随剑气飞）
//   Charge   蓄力：墨点、墨雾、细小光粒按螺旋从身边收向剑柄与鞘口（目标每帧取鞘中那把剑的实际位置），越近越小、到了即没；停下时原地散开
//   Swirls / Glint  蓄力时扫进剑柄的弯带子（一笔墨沿带子滑过去）、鞘口一道细亮边
import * as THREE from 'three';
import { INK } from './combatConfig.js';

const R = (a, b) => a + Math.random() * (b - a);
const pick = (v, k) => (Array.isArray(v) ? v[0] + (v[1] - v[0]) * k : v);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _tip = new THREE.Vector3(), _base = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _c = new THREE.Color();

// ---------- 载入：灰度 PNG → 单通道纹理（显存只占四分之一）----------
async function grayTexture(url, repeat = false) {
  const img = await new THREE.ImageLoader().loadAsync(url);
  const w = img.width, h = img.height;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const src = g.getImageData(0, 0, w, h).data, out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = src[i * 4];
  const t = new THREE.DataTexture(out, w, h, THREE.RedFormat, THREE.UnsignedByteType);
  t.unpackAlignment = 1;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 4; t.needsUpdate = true;
  return t;
}
export async function loadInkAssets(base, gltfLoader) {
  const [meta, sprites, strips, noise, gl, ink2, ink3] = await Promise.all([
    fetch(base + 'ink_atlas.json').then((r) => r.json()),
    grayTexture(base + 'ink_sprites.png'), grayTexture(base + 'ink_strips.png'), grayTexture(base + 'ink_noise.png', true),
    gltfLoader.loadAsync(base + 'ink_meshes.glb'),
    // 第二十三轮：第二组水墨（没载入时普攻退回第二十轮的样子）
    Promise.all([fetch(base + '../ink2/ink2.json').then((r) => r.json()), grayTexture(base + '../ink2/ink2.png')]).then(([m, t]) => ({ meta: m, tex: t })).catch((err) => { console.info('第二组水墨素材没载入', err); return null; }),
    // 第二十六轮：第三组水墨（太极、喷墨、竹叶、裂纹、刺线；没载入时普攻照第二十六轮前半的样子）
    Promise.all([fetch(base + '../ink3/ink3.json').then((r) => r.json()), grayTexture(base + '../ink3/ink3.png')]).then(([m, t]) => ({ meta: m, tex: t })).catch((err) => { console.info('第三组水墨素材没载入', err); return null; }),
  ]);
  const geo = {};
  gl.scene.traverse((o) => { if (o.isMesh) geo[o.name] = o.geometry; });
  if (!geo.inkBand || !geo.inkSwirl) throw new Error('ink_meshes.glb 缺少 inkBand / inkSwirl');
  // 顶点色（弯带子两端透明）改个名字：ShaderMaterial 里自己声明
  if (geo.inkSwirl.attributes.color) geo.inkSwirl.setAttribute('aCol', geo.inkSwirl.attributes.color);
  return { meta, sprites, strips, noise, band: geo.inkBand, swirl: geo.inkSwirl, ink2, ink3 };
}
// 第二十三轮：第二组贴图集的取样范围（归一化）：sprites 一组小图 / 序列帧（grid 列 × 行），strips 长条
export function rects2(M) {
  if (!M) return null;
  const W = M.size[0], H = M.size[1], tile = {}, strip = {};
  for (const [k, t] of Object.entries(M.sprites)) tile[k] = { r: [t.rect[0] / W, t.rect[1] / H, t.rect[2] / W, t.rect[3] / H], g: t.grid };
  for (const [k, t] of Object.entries(M.strips || {})) { strip[k] = new THREE.Vector4(t.rect[0] / W, t.rect[1] / H, t.rect[2] / W, t.rect[3] / H); tile[k] = { r: [t.rect[0] / W, t.rect[1] / H, t.rect[2] / W, t.rect[3] / H], g: [1, 1] }; }
  return { tile, strip };
}
// 网格里的第 i 格（一张静止的小图）
export function cellRect(tl, i) { const [x, y, w, h] = tl.r, [c, r] = tl.g, cx = i % c, cy = Math.floor(i / c) % r; return [x + (cx / c) * w, y + (cy / r) * h, w / c, h / r]; }

// 贴图集里一格的取样范围（归一化，图像坐标：y 向下）
export function rects(meta) {
  const S = meta.sprites, W = S.size[0], H = S.size[1], out = {};
  for (const [k, t] of Object.entries(S.tiles)) out[k] = { r: [t.rect[0] / W, t.rect[1] / H, t.rect[2] / W, t.rect[3] / H], g: t.grid };
  // 墨溅四帧是同一行相邻的四格：当作一张 4 × 1 的序列帧
  const s0 = S.tiles.splash0.rect;
  out.splash = { r: [s0[0] / W, s0[1] / H, (s0[2] * 4) / W, s0[3] / H], g: [4, 1] };
  const T = meta.strips, w2 = T.size[0], h2 = T.size[1], strip = {};
  for (const [k, t] of Object.entries(T.rows)) strip[k] = new THREE.Vector4(t.rect[0] / w2, t.rect[1] / h2, t.rect[2] / w2, t.rect[3] / h2);
  return { tile: out, strip };
}

// =====================================================================================
// 墨粒子
// =====================================================================================
const SPR_VS = /* glsl */`
  uniform float uTime;
  attribute vec4 iA, iB, iC, iD, iE, iF, iG, iH, iI;
  varying vec2 vUv, vL; varying vec4 vCol; varying vec2 vX;
  void main() {
    float age = uTime - iA.w, life = iB.w, u = age / life;
    vCol = vec4(0.); vUv = vL = vec2(0.); vX = vec2(0.);
    if (u < 0. || u > 1.) { gl_Position = vec4(2., 2., 2., 1.); return; }
    float g = iG.x, drag = iG.y;
    float fv = drag > .001 ? (1. - exp(-drag * age)) / drag : age;
    vec3 p = iA.xyz + iB.xyz * fv - vec3(0., .5 * g * age * age, 0.);
    vec3 vel = iB.xyz * exp(-drag * age) - vec3(0., g * age, 0.);
    float size = mix(iC.w, iD.w, 1. - (1. - u) * (1. - u));
    float rot = iI.y + iI.z * age, cs = cos(rot), sn = sin(rot);
    vec2 c = position.xy, rc = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
    float mode = iI.x;
    vec3 wp;
    if (mode < .5) {
      vec3 Rv = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), Uv = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      wp = p + (Rv * rc.x + Uv * rc.y) * size;
    } else if (mode < 1.5) {
      float sp = length(vel);
      vec3 dir = sp > 1e-4 ? vel / sp : vec3(0., 1., 0.);
      vec3 side = cross(dir, normalize(cameraPosition - p));
      side = length(side) > 1e-4 ? normalize(side) : vec3(1., 0., 0.);
      wp = p + side * c.x * size + dir * c.y * size * (1. + iI.w * sp);
    } else if (mode < 2.5) {
      wp = p + (iC.xyz * rc.x + iD.xyz * rc.y) * size;
    } else {
      wp = p + vec3(rc.x, 0., rc.y) * size;
    }
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
    float fin = iG.z > 0. ? smoothstep(0., iG.z, u) : 1.;
    float fout = 1. - smoothstep(iG.w, 1., u);
    vCol = vec4(iE.rgb, iE.a * fin * fout);
    // 序列帧：iH = (列, 行, 放完占寿命的比例（0 = 停在第 0 帧）, 溶解强度（+10 = 柔边，墨雾、光）)
    float n = iH.x * iH.y, fr = iH.z > 0. ? min(n - 1., floor(clamp(u / iH.z, 0., 1.) * n)) : 0.;
    vec2 cell = vec2(mod(fr, iH.x), floor(fr / iH.x)), l = c + .5;
    vUv = vec2(iF.x + (cell.x + l.x) / iH.x * iF.z, iF.y + (cell.y + 1. - l.y) / iH.y * iF.w);
    vL = l * .55 + fract(iA.w * 7.31);
    vX = vec2(u, iH.w);
  }`;
const SPR_FS = (additive) => /* glsl */`
  uniform sampler2D uTex, uNoise;
  varying vec2 vUv, vL; varying vec4 vCol; varying vec2 vX;
  void main() {
    float c = texture2D(uTex, vUv).r;
    float soft = step(5., vX.y), er = vX.y - 10. * soft;
    float th = er * smoothstep(.3, 1., vX.x) * (.3 + .7 * texture2D(uNoise, vL).r);
    float a = soft > .5 ? c * (1. - th) : smoothstep(th + .06, th + .4, c);
    a *= vCol.a;
    if (a < .006) discard;
    ${additive ? 'gl_FragColor = vec4(vCol.rgb * a, 1.);' : 'gl_FragColor = vec4(vCol.rgb, a);'}
  }`;

export class Sprites {
  constructor(scene, A, cap, additive) {
    this.cap = cap; this.head = 0; this.lo = Infinity; this.hi = -1; this.wrapped = false; this.born = new Float32Array(cap).fill(-1e9); this.die = new Float32Array(cap).fill(-1e9);
    const g = new THREE.InstancedBufferGeometry(), q = new THREE.PlaneGeometry(1, 1);
    g.index = q.index; g.setAttribute('position', q.attributes.position);
    this.attr = {};
    for (const k of ['iA', 'iB', 'iC', 'iD', 'iE', 'iF', 'iG', 'iH', 'iI']) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); this.attr[k] = a;
    }
    for (let i = 0; i < cap; i++) { this.attr.iA.array[i * 4 + 3] = -1e9; this.attr.iB.array[i * 4 + 3] = 1; this.attr.iH.array[i * 4] = 1; this.attr.iH.array[i * 4 + 1] = 1; }
    g.instanceCount = cap;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uTex: { value: A.sprites }, uNoise: { value: A.noise } },
      vertexShader: SPR_VS, fragmentShader: SPR_FS(additive),
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 10 : 9; this.mesh.name = additive ? 'ink-light' : 'ink-sprites';
    scene.add(this.mesh);
  }
  write(o, now, T) {
    const i = this.head, k = i * 4, A = this.attr;
    this.head = (i + 1) % this.cap;
    if (this.head === 0) this.wrapped = true;
    this.lo = Math.min(this.lo, i); this.hi = Math.max(this.hi, i);
    const p = o.p, v = o.v, s = o.size, c = o.color, t0 = now + (o.delay || 0), life = o.life || 0.5;
    const tl = T[o.tile] || T.dot || Object.values(T)[0];
    A.iA.array.set([p.x, p.y, p.z, t0], k);
    A.iB.array.set([v ? v.x : 0, v ? v.y : 0, v ? v.z : 0, life], k);
    const s0 = Array.isArray(s) ? s[0] : s ?? 1, s1 = Array.isArray(s) ? s[1] : s0;
    A.iC.array.set([o.u ? o.u.x : 1, o.u ? o.u.y : 0, o.u ? o.u.z : 0, s0], k);
    A.iD.array.set([o.w ? o.w.x : 0, o.w ? o.w.y : 1, o.w ? o.w.z : 0, s1], k);
    A.iE.array.set([c.r, c.g, c.b, o.alpha ?? 1], k);
    A.iF.array.set(o.rect || tl.r, k);
    A.iG.array.set([o.gravity || 0, o.drag || 0, o.fadeIn || 0, o.fadeOut ?? 0.55], k);
    A.iH.array.set([o.grid ? o.grid[0] : o.rect ? 1 : tl.g[0], o.grid ? o.grid[1] : o.rect ? 1 : tl.g[1], o.span ?? 0, (o.erode || 0) + (o.soft ? 10 : 0)], k);
    A.iI.array.set([o.mode || 0, o.rot || 0, o.spin || 0, o.stretch || 0], k);
    this.born[i] = t0; this.die[i] = t0 + life;
    this.until = Math.max(this.until || 0, t0 + life);
  }
  flush(now) {
    this.mat.uniforms.uTime.value = now;
    this.mesh.visible = now < (this.until || 0);           // 一颗都没有的时候不画（省一次绘制）
    if (this.hi < 0) return;
    for (const a of Object.values(this.attr)) {
      if (this.wrapped) a.addUpdateRange(0, this.cap * 4);
      else a.addUpdateRange(this.lo * 4, (this.hi - this.lo + 1) * 4);
      a.needsUpdate = true;
    }
    this.lo = Infinity; this.hi = -1; this.wrapped = false;
  }
  alive(now) { let n = 0; for (let i = 0; i < this.cap; i++) if (this.die[i] > now && this.born[i] <= now + 1) n++; return n; }
  // 全部收掉：把寿命改成已过
  kill() { this.until = 0; this.mesh.visible = false; this.born.fill(-1e9); this.die.fill(-1e9); this.attr.iA.array.fill(0); for (let i = 0; i < this.cap; i++) this.attr.iA.array[i * 4 + 3] = -1e9; this.lo = 0; this.hi = this.cap - 1; }
  moveTo(scene) { scene.add(this.mesh); }
}

// =====================================================================================
// 刀光带子
// =====================================================================================
const RIB_VS = /* glsl */`
  attribute vec4 aD, aN; attribute float aV;
  uniform float uNow, uThick, uNew;
  varying vec2 vUv; varying float vAge, vFace, vNy;
  void main() {
    vec3 p = position, V = normalize(cameraPosition - p);
    float nl = length(aN.xyz), face = nl > .01 ? abs(dot(aN.xyz / nl, V)) : 0.;
    vec3 side = cross(aD.xyz, V); float sl = length(side);
    // 侧对镜头时朝镜头补宽度（第二十三轮的普攻墨带本身够宽，只补三成半：侧看是一缕碎墨，不是一块板）
    if (sl > 1e-4) p += side / sl * (aV - .5) * 2. * uThick * (uNew > .5 ? .35 : 1.) * (1. - face);
    vUv = vec2(aN.w, aV); vAge = uNow - aD.w; vFace = nl > .01 ? face : 1.; vNy = nl > .01 ? abs(aN.y / nl) : 1.;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
  }`;
const RIB_FS = /* glsl */`
  uniform sampler2D uStrips, uNoise, uInk2;
  uniform vec4 uRectA, uRectB, uBrush, uWash, uDry; uniform float uMix, uAlpha, uErode, uWhite, uWhiteLen, uSeed, uNew, uWashV, uWashA, uDryK, uEdge, uEdgeOn; uniform vec3 uInk, uMist, uDeep, uWhiteC, uEdgeC;
  varying vec2 vUv; varying float vAge, vFace, vNy;
  float cov(vec4 r, vec2 uv) { return texture2D(uStrips, vec2(r.x + uv.x * r.z, r.y + (1. - uv.y) * r.w)).r; }
  float cov2(vec4 r, vec2 uv) { return texture2D(uInk2, vec2(r.x + uv.x * r.z, r.y + (1. - uv.y) * r.w)).r; }
  void main() {
    if (vUv.x < 0. || vUv.x > 1.) discard;
    vec2 uv = vec2(vUv.x, clamp(vUv.y, .015, .985));
    float c = mix(cov(uRectA, uv), cov(uRectB, uv), uMix);
    if (uNew > .5) {
      // 第二十三轮（普攻）：展开墨弧（笔头、枯笔尾）× 宽墨刷（毛边、溅点）；外侧干笔飞白挖出空白；靠剑一侧（v 小）淡墨过渡；深核心偏外侧
      float v = uv.y;
      float b = cov2(uBrush, vec2(uv.x * .9 + .05, v)), w = cov2(uWash, vec2(uv.x, v));
      float dry = cov2(uDry, vec2(fract(uv.x * 2.2 + uSeed), v * .9 + .05));
      float nz = texture2D(uNoise, vec2(uv.x * 3.1 + uSeed, v * 1.3)).r;
      float core = max(c * .9, b * smoothstep(1., .55, uv.x) * (.75 + .25 * c)) * (.72 + .38 * nz);       // 疏密：同一笔里浓淡不匀
      // 竖着的墨弧（重劈、上挑）从背后、斜后方几乎侧对着看时：投影只剩一条竖带——更碎、更淡，不成一块齐边的黑板。
      // 平着、斜着的（横斩、斜斩）不减：常规镜头略高于人，看它们本来就斜着
      float edgeOn = (1. - smoothstep(.2, .9, vFace)) * (1. - smoothstep(.35, .8, vNy)) * uEdgeOn;
      float th = uErode * (.25 + .75 * texture2D(uNoise, vec2(vUv.x * 2.3, vUv.y * .6) + uSeed).r) + edgeOn * .45 * (.5 + nz);
      float ink = smoothstep(th + .1, th + .42, core), mist = smoothstep(th, th + .3, max(core, w * .7)) * .42;
      float gap = mix(1., .12 + .88 * dry, uDryK * smoothstep(.2, .7, v));                                   // 干笔飞白：外侧七八成里按干刷的条纹挖出空白
      ink *= gap;
      float wash = smoothstep(0., uWashV, v);
      float a = max(ink * mix(uWashA, uAlpha, wash), mist * uAlpha * (.5 + .5 * wash)) * (1. - .92 * edgeOn);
      float e = smoothstep(.9, .985, v) * (1. - smoothstep(0., uWhiteLen, vAge)) * uWhite * uEdge;
      a = max(a, e);
      if (a < .01) discard;
      vec3 col = mix(uMist, uInk, ink / max(.001, max(ink, mist)));
      col = mix(col, uDeep, smoothstep(.45, .85, v) * ink);
      col = mix(col, uMist, (1. - wash) * .55);
      col = mix(col, uWhiteC, (1. - gap) * smoothstep(.5, .9, v) * .3);
      col = mix(col, uEdgeC, clamp(e / a, 0., 1.));
      gl_FragColor = vec4(col, a);
      return;
    }
    float th = uErode * (.25 + .75 * texture2D(uNoise, vec2(vUv.x * 2.3, vUv.y * .6) + uSeed).r);
    float ink = smoothstep(th + .1, th + .42, c), mist = smoothstep(th, th + .3, c) * .5;
    float w = smoothstep(.86, .985, vUv.y) * (1. - smoothstep(0., uWhiteLen, vAge)) * uWhite;     // 外沿一线白光，只在剑尖刚扫过的一小段
    float a = max(max(ink, mist) * uAlpha, w);
    if (a < .01) discard;
    vec3 col = mix(uMist, uInk, ink / max(.001, max(ink, mist)));
    col = mix(col, vec3(1.), clamp(w / a, 0., 1.));
    gl_FragColor = vec4(col, a);
  }`;

class Ribbon {
  constructor(scene, A, max) {
    this.max = max;
    const n = max * 2;
    this.pos = new Float32Array(n * 3); this.d = new Float32Array(n * 4); this.nrm = new Float32Array(n * 4); this.L = new Float32Array(max);
    const v = new Float32Array(n);
    for (let i = 0; i < max; i++) { v[i * 2] = 0; v[i * 2 + 1] = 1; }
    const idx = [];
    for (let i = 0; i < max - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aD', new THREE.BufferAttribute(this.d, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aN', new THREE.BufferAttribute(this.nrm, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aV', new THREE.BufferAttribute(v, 1));
    g.setIndex(idx); g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uStrips: { value: A.strips }, uNoise: { value: A.noise }, uRectA: { value: new THREE.Vector4() }, uRectB: { value: new THREE.Vector4() }, uMix: { value: 0 },
        uAlpha: { value: 1 }, uErode: { value: 0 }, uWhite: { value: 1 }, uWhiteLen: { value: 0.07 }, uSeed: { value: 0 }, uNow: { value: 0 }, uThick: { value: 0.1 },
        uInk: { value: new THREE.Color(INK.color.ink) }, uMist: { value: new THREE.Color(INK.color.mist) },
        // 第二十三轮：普攻用的第二组素材与色板（uNew 为 1 时）
        uInk2: { value: A.ink2?.tex || A.strips }, uBrush: { value: new THREE.Vector4() }, uWash: { value: new THREE.Vector4() }, uDry: { value: new THREE.Vector4() },
        uNew: { value: 0 }, uWashV: { value: 0.3 }, uWashA: { value: 0.34 }, uDryK: { value: 0.55 }, uEdge: { value: 0.75 }, uEdgeOn: { value: 1 },
        uDeep: { value: new THREE.Color(INK.light.color.deep) }, uWhiteC: { value: new THREE.Color(INK.light.color.white) }, uEdgeC: { value: new THREE.Color(INK.light.color.edge) } },
      vertexShader: RIB_VS, fragmentShader: RIB_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 8; this.mesh.visible = false; this.mesh.name = 'ink-ribbon';
    scene.add(this.mesh);
    this.state = 'off'; this.n = 0;
  }
}

// =====================================================================================
// 月牙带（拔刀斩的刀光、剑气）
// =====================================================================================
const BAND_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const BAND_FS = /* glsl */`
  uniform sampler2D uStrips, uNoise;
  uniform vec4 uRectA, uRectB; uniform float uMix, uAlpha, uErode, uReveal, uU0, uU1, uWhite, uSeed; uniform vec3 uInk, uMist;
  varying vec2 vUv;
  float cov(vec4 r, vec2 uv) { return texture2D(uStrips, vec2(r.x + uv.x * r.z, r.y + (1. - uv.y) * r.w)).r; }
  void main() {
    float u = vUv.x;
    if (u < uU0 || u > uReveal) discard;
    float su = (uReveal - u) / max(.001, uU1 - uU0);            // 笔头在扫开的前沿，笔尾拖在后面
    float sv = 1. - abs(vUv.y - .5) * 2.;                       // 0 内沿 … 1 外沿（网格上下两面都是）
    vec2 uv = vec2(su, clamp(sv, .015, .985));
    float c = mix(cov(uRectA, uv), cov(uRectB, uv), uMix);
    float th = uErode * (.25 + .75 * texture2D(uNoise, vec2(u * 3.1, sv * .7) + uSeed).r);
    float ink = smoothstep(th + .1, th + .42, c), mist = smoothstep(th, th + .3, c) * .5;
    float ends = smoothstep(uU0, uU0 + .025, u) * smoothstep(uU1, uU1 - .025, u);
    float front = (1. - smoothstep(0., .045, uReveal - u)) * smoothstep(.5, .95, sv) * uWhite;    // 扫开的前沿一道白光
    float a = max(max(ink, mist) * uAlpha * ends, front);
    if (a < .01) discard;
    vec3 col = mix(uMist, uInk, ink / max(.001, max(ink, mist)));
    col = mix(col, vec3(1.), clamp(front / a, 0., 1.));
    gl_FragColor = vec4(col, a);
  }`;
// 第二十六轮：突刺的螺旋墨带——一条绕 +Z 轴盘旋的扁带（径向有宽度：顺着刺的方向看是一圈圈的螺旋），墨刷 × 干笔飞白，笔头一线银白
const HX_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const HX_FS = /* glsl */`
  uniform sampler2D uInk2, uNoise; uniform vec4 uBrush, uDry; uniform float uHead, uTail, uAlpha, uSeed, uWhite; uniform vec3 uInk, uMist, uEdgeC;
  varying vec2 vUv;
  float cov2(vec4 r, vec2 uv) { return texture2D(uInk2, vec2(r.x + uv.x * r.z, r.y + (1. - uv.y) * r.w)).r; }
  void main() {
    float u = vUv.x;
    if (u > uHead || u < uTail) discard;
    float k = (u - uTail) / max(1e-3, uHead - uTail);
    float b = cov2(uBrush, vec2(k * .9 + .05, vUv.y)), d = cov2(uDry, vec2(fract(u * 1.7 + uSeed), vUv.y * .9 + .05));
    float n = texture2D(uNoise, vec2(u * 2.7 + uSeed, vUv.y * .8)).r;
    float ink = smoothstep(.28, .62, b * (.7 + .5 * n)) * mix(.3, 1., d);
    float head = smoothstep(.82, 1., k) * uWhite;
    float a = max(ink * uAlpha * smoothstep(0., .22, k), head * smoothstep(.3, .7, b) * uAlpha);
    if (a < .01) discard;
    vec3 col = mix(uMist, uInk, smoothstep(.2, .7, ink));
    col = mix(col, uEdgeC, clamp(head * 1.25, 0., 1.));
    gl_FragColor = vec4(col, a);
  }`;
class Helix {
  constructor(scene, A, S2, lc, n = 64) {
    const pos = new Float32Array((n + 1) * 2 * 3), uv = new Float32Array((n + 1) * 2 * 2), idx = [];
    for (let i = 0; i <= n; i++) { uv.set([i / n, 0, i / n, 1], i * 4); if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    this.n = n; this.geo = g; this.pos = pos; this.q0 = new THREE.Quaternion();
    this.U = { uInk2: { value: A.ink2?.tex || A.strips }, uNoise: { value: A.noise }, uBrush: { value: S2.brush.clone() }, uDry: { value: S2.dry0.clone() },
      uHead: { value: 0 }, uTail: { value: 0 }, uAlpha: { value: 0.92 }, uSeed: { value: 0 }, uWhite: { value: 1 }, uInk: { value: lc.ink }, uMist: { value: lc.gray }, uEdgeC: { value: lc.edge } };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: HX_VS, fragmentShader: HX_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 9; this.mesh.visible = false; this.mesh.name = 'ink-helix';
    scene.add(this.mesh);
    this.state = 'off'; this.t = 0; this.life = 1; this.spin = 0; this.rate = 0; this.key = '';
  }
  // 螺旋：沿 +Z 长 len，turns 圈，半径 r0 → r1，径向带宽 w（两头收窄）
  build(len, turns, r0, r1, w) {
    const key = `${len}|${turns}|${r0}|${r1}|${w}`;
    if (key === this.key) return;
    this.key = key;
    const P = this.pos, n = this.n;
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = u * turns * Math.PI * 2, r = r0 + (r1 - r0) * u, c = Math.cos(a), s = Math.sin(a), z = u * len, hw = w * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, u * 1.1)));
      P.set([c * (r - hw), s * (r - hw), z - hw * 0.4, c * (r + hw), s * (r + hw), z + hw * 0.4], i * 6);
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

class Band {
  constructor(scene, A) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uStrips: { value: A.strips }, uNoise: { value: A.noise }, uRectA: { value: new THREE.Vector4() }, uRectB: { value: new THREE.Vector4() }, uMix: { value: 0 },
        uAlpha: { value: 1 }, uErode: { value: 0 }, uReveal: { value: 1 }, uU0: { value: 0 }, uU1: { value: 1 }, uWhite: { value: 1 }, uSeed: { value: 0 },
        uInk: { value: new THREE.Color(INK.color.ink) }, uMist: { value: new THREE.Color(INK.color.mist) } },
      vertexShader: BAND_VS, fragmentShader: BAND_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(A.band, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 8; this.mesh.visible = false; this.mesh.name = 'ink-band';
    scene.add(this.mesh);
    this.state = 'off';
  }
}

// =====================================================================================
// 蓄力：向刀汇聚的墨点、墨雾、光粒
// =====================================================================================
const CH_VS = /* glsl */`
  uniform float uTime, uStopT, uStopGen, uFade; uniform vec3 uHilt, uMouth;
  attribute vec4 iA, iB, iC, iD, iE, iF;
  // iA: 起始半径、起始方位角、起始高低（相对汇聚点）、出生时刻；iB: 绕几圈、寿命、大小、汇聚到剑柄（0）… 鞘口（1）之间哪里；
  // iC: 贴图范围；iD: 颜色、透明度；iE: 第几轮蓄力、柔边（1 墨雾 / 光，0 墨点）、自转、转速；iF.x: 顺着来路拉长多少（墨点、光粒拉成细痕，墨雾不拉）
  varying vec2 vUv, vL; varying vec4 vCol; varying float vSoft;
  // 螺旋收向汇聚点：e 越近越快（被吸进去）；停下之后（ks）原地向外散开
  vec3 posAt(float uc, float ks) {
    float e = uc * uc * (1.6 - .6 * uc);
    float r = iA.x * (1. - e) * (1. + .7 * ks), th = iA.y + iB.x * 6.2831853 * e, h = iA.z * (1. - e) * (1. - e) + .25 * ks * iA.x;
    return mix(uHilt, uMouth, iB.w) + vec3(cos(th) * r, h, sin(th) * r);
  }
  void main() {
    float age = uTime - iA.w, life = iB.y, u = age / life;
    vCol = vec4(0.); vUv = vL = vec2(0.); vSoft = 0.;
    float stopped = iE.x <= uStopGen ? 1. : 0.;
    float ks = stopped * clamp((uTime - uStopT) / uFade, 0., 1.);
    if (u < 0. || u > 1. || ks >= 1.) { gl_Position = vec4(2., 2., 2., 1.); return; }
    float uc = stopped > .5 ? min(u, max(0., (uStopT - iA.w) / life)) : u;     // 停下之后不再往里收，原地散开
    float e = uc * uc * (1.6 - .6 * uc);
    vec3 p = posAt(uc, ks);
    float size = iB.z * pow(max(0., 1. - e), .65) * (1. + .5 * ks);             // 越近越小
    vec2 c = position.xy;
    vec3 wp;
    float st = iF.x * (1. - ks);
    if (st > 0.) {
      // 顺着来路拉长：头朝汇聚点，越快越长
      vec3 d = posAt(min(1., uc + .03), ks) - p; float dl = length(d), sp = dl / (.03 * life);
      d = dl > 1e-5 ? d / dl : vec3(0., 1., 0.);
      vec3 side = cross(d, normalize(cameraPosition - p)); side = length(side) > 1e-5 ? normalize(side) : vec3(1., 0., 0.);
      wp = p + side * c.x * size + d * c.y * size * (1. + st * sp);
    } else {
      float rot = iE.z + iE.w * age, cs = cos(rot), sn = sin(rot);
      vec2 rc = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
      vec3 Rv = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), Uv = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      wp = p + (Rv * rc.x + Uv * rc.y) * size;
    }
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
    float a = smoothstep(0., .15, u) * (1. - smoothstep(.8, 1., uc)) * (1. - ks);
    vCol = vec4(iD.rgb, iD.a * a);
    vec2 l = c + .5;
    vUv = vec2(iC.x + l.x * iC.z, iC.y + (1. - l.y) * iC.w);
    vL = l * .5 + fract(iA.w * 3.7);
    vSoft = iE.y;
  }`;
const CH_FS = (additive) => /* glsl */`
  uniform sampler2D uTex, uNoise;
  varying vec2 vUv, vL; varying vec4 vCol; varying float vSoft;
  void main() {
    float c = texture2D(uTex, vUv).r;
    float a = (vSoft > .5 ? c : smoothstep(.12, .5, c)) * vCol.a;
    if (a < .006) discard;
    ${additive ? 'gl_FragColor = vec4(vCol.rgb * a, 1.);' : 'gl_FragColor = vec4(vCol.rgb, a);'}
  }`;
class ChargePool {
  constructor(scene, A, cap, additive, shared) {
    this.cap = cap; this.head = 0; this.lo = Infinity; this.hi = -1; this.wrapped = false; this.die = new Float32Array(cap).fill(-1e9);
    const g = new THREE.InstancedBufferGeometry(), q = new THREE.PlaneGeometry(1, 1);
    g.index = q.index; g.setAttribute('position', q.attributes.position);
    this.attr = {};
    for (const k of ['iA', 'iB', 'iC', 'iD', 'iE', 'iF']) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); this.attr[k] = a;
    }
    for (let i = 0; i < cap; i++) { this.attr.iA.array[i * 4 + 3] = -1e9; this.attr.iB.array[i * 4 + 1] = 1; }
    g.instanceCount = cap;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uTex: { value: A.sprites }, uNoise: { value: A.noise } },
      vertexShader: CH_VS, fragmentShader: CH_FS(additive),
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 10 : 9; this.mesh.name = additive ? 'ink-charge-light' : 'ink-charge';
    scene.add(this.mesh);
  }
  write(o, now) {
    const i = this.head, k = i * 4, A = this.attr;
    this.head = (i + 1) % this.cap;
    if (this.head === 0) this.wrapped = true;
    this.lo = Math.min(this.lo, i); this.hi = Math.max(this.hi, i);
    A.iA.array.set([o.r, o.th, o.h, now], k);
    A.iB.array.set([o.turns, o.life, o.size, o.along], k);
    A.iC.array.set(o.rect, k);
    A.iD.array.set([o.color.r, o.color.g, o.color.b, o.alpha], k);
    A.iE.array.set([o.gen, o.soft ? 1 : 0, o.rot, o.spin], k);
    A.iF.array.set([o.stretch || 0, 0, 0, 0], k);
    this.die[i] = now + o.life;
    this.until = Math.max(this.until || 0, now + o.life);
  }
  flush(now) {
    const U = this.mat.uniforms;
    this.mesh.visible = now < Math.min(this.until || 0, U.uStopGen.value >= this.gen ? U.uStopT.value + U.uFade.value : Infinity);
    if (this.hi < 0) return;
    for (const a of Object.values(this.attr)) {
      if (this.wrapped) a.addUpdateRange(0, this.cap * 4);
      else a.addUpdateRange(this.lo * 4, (this.hi - this.lo + 1) * 4);
      a.needsUpdate = true;
    }
    this.lo = Infinity; this.hi = -1; this.wrapped = false;
  }
  // 还看得见的：没到寿命；停下的那一轮在散完（uFade 秒）之后就看不见了
  alive(now) {
    const U = this.mat.uniforms, A = this.attr.iE.array;
    let n = 0;
    for (let i = 0; i < this.cap; i++) if (this.die[i] > now && !(A[i * 4] <= U.uStopGen.value && now - U.uStopT.value >= U.uFade.value)) n++;
    return n;
  }
  moveTo(scene) { scene.add(this.mesh); }
}

// 弯带子：一笔墨顺着带子扫到 u = 0 那一端（剑柄）——Unity 的 FX_InkSlash_04_Charge：贴图偏移 0.3 秒里由 -1 推到 1
const SW_VS = 'attribute vec4 aCol; varying vec2 vUv; varying float vA; void main(){ vUv = uv; vA = aCol.a; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const SW_FS = /* glsl */`
  uniform sampler2D uStrips; uniform vec4 uRect; uniform float uOff, uAlpha; uniform vec3 uInk, uMist;
  varying vec2 vUv; varying float vA;
  void main() {
    float tu = vUv.x + uOff, tv = (vUv.y - .33) / .34;               // 带子的 v 在 0.33 … 0.67
    if (tu < 0. || tu > 1.) discard;
    float c = texture2D(uStrips, vec2(uRect.x + tu * uRect.z, uRect.y + (1. - clamp(tv, .02, .98)) * uRect.w)).r;
    float ink = smoothstep(.12, .5, c), mist = smoothstep(.02, .3, c) * .45;
    float a = max(ink, mist) * uAlpha * vA;
    if (a < .01) discard;
    gl_FragColor = vec4(mix(uMist, uInk, ink / max(.001, max(ink, mist))), a);
  }`;
// 鞘口细亮边：顺着鞘的轴、绕轴转向镜头的一条白光（加色）
const GL_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const GL_FS = 'uniform sampler2D uTex; uniform vec4 uRect; uniform float uK; varying vec2 vUv; void main(){ float c = texture2D(uTex, vec2(uRect.x + vUv.x * uRect.z, uRect.y + (1. - vUv.y) * uRect.w)).r; gl_FragColor = vec4(vec3(c * uK), 1.); }';

// =====================================================================================
// 总管
// =====================================================================================
export class InkFx {
  // A：loadInkAssets 的结果；player：修士（取剑的轨迹、鞘中的剑）；groundAt(x, z, y)：地面高度；quality：0.5 … 1（粒子数按它缩减）
  constructor(scene, A, { player, groundAt = null, quality = 1 } = {}) {
    this.A = A; this.scene = scene; this.player = player; this.groundAt = groundAt || ((x, z, y) => y - 1);
    this.q = quality; this.now = 0;
    const T = rects(A.meta);
    this.T = T.tile; this.S = T.strip;
    this.crescent = [0, 1, 2, 3, 4, 5].map((i) => this.S['crescent' + i]);
    this.strokes = [4, 5, 6, 7, 8].map((i) => this.S['stroke' + i]);
    this.col = { ink: new THREE.Color(INK.color.ink), mist: new THREE.Color(INK.color.mist), light: new THREE.Color(INK.color.light) };
    this.ink = new Sprites(scene, A, INK.pools.ink, false);
    // 第二十三轮：第二组贴图集（普攻的外层、命中爆墨）与普攻的色板
    const T2 = rects2(A.ink2?.meta);
    this.T2 = T2?.tile || null; this.S2 = T2?.strip || null;
    this.ink2 = A.ink2 ? new Sprites(scene, { sprites: A.ink2.tex, noise: A.noise }, INK.pools.ink2, false) : null;
    if (this.ink2) this.ink2.mesh.name = 'ink2-sprites';
    // 第二十六轮：第三组贴图集（太极、喷墨、竹叶、裂纹、刺线）：墨（压在第二组的墨团上面画）与光两个池
    this.T3 = rects2(A.ink3?.meta)?.tile || null;
    this.ink3 = A.ink3 ? new Sprites(scene, { sprites: A.ink3.tex, noise: A.noise }, INK.pools.ink3, false) : null;
    this.light3 = A.ink3 ? new Sprites(scene, { sprites: A.ink3.tex, noise: A.noise }, INK.pools.light3, true) : null;
    if (this.ink3) { this.ink3.mesh.name = 'ink3-sprites'; this.ink3.mesh.renderOrder = 9.5; this.light3.mesh.name = 'ink3-light'; this.light3.mesh.renderOrder = 10.5; }
    const LC = INK.light.color;
    this.lc = { ink: new THREE.Color(LC.ink), deep: new THREE.Color(LC.deep), gray: new THREE.Color(LC.gray), white: new THREE.Color(LC.white), edge: new THREE.Color(LC.edge), leaf: new THREE.Color(INK.ink3.leaf.color) };
    this.light = new Sprites(scene, A, INK.pools.light, true);
    this.ribbons = Array.from({ length: INK.ribbon.pool }, () => new Ribbon(scene, A, INK.ribbon.max));
    this.bands = Array.from({ length: 3 }, () => new Band(scene, A));
    this.helices = this.S2 ? Array.from({ length: 2 }, () => new Helix(scene, A, this.S2, this.lc)) : [];      // 第二十六轮：突刺的螺旋墨带
    // 蓄力
    this.chU = { uTime: { value: 0 }, uStopT: { value: -1e9 }, uStopGen: { value: -1 }, uFade: { value: 0.28 }, uHilt: { value: new THREE.Vector3() }, uMouth: { value: new THREE.Vector3() } };
    this.chInk = new ChargePool(scene, A, INK.pools.charge, false, this.chU);
    this.chLight = new ChargePool(scene, A, Math.round(INK.pools.charge / 2), true, this.chU);
    this.charge = null; this.gen = 0;
    this.swirls = Array.from({ length: INK.charge.swirl.pool }, () => {
      const mat = new THREE.ShaderMaterial({ uniforms: { uStrips: { value: A.strips }, uRect: { value: this.S.stroke }, uOff: { value: -1 }, uAlpha: { value: 0 }, uInk: { value: this.col.ink }, uMist: { value: this.col.mist } },
        vertexShader: SW_VS, fragmentShader: SW_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(A.swirl, mat); m.frustumCulled = false; m.renderOrder = 8; m.visible = false; m.name = 'ink-swirl';
      scene.add(m);
      return { m, t: 0, life: 0, busy: false, q: new THREE.Quaternion(), s: 1 };
    });
    const gq = new THREE.PlaneGeometry(1, 1);
    gq.translate(0, 0, 0);
    this.glint = new THREE.Mesh(gq, new THREE.ShaderMaterial({ uniforms: { uTex: { value: A.sprites }, uRect: { value: new THREE.Vector4(...this.T.streak.r) }, uK: { value: 0 } },
      vertexShader: GL_VS, fragmentShader: GL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.glint.frustumCulled = false; this.glint.renderOrder = 10; this.glint.visible = false; this.glint.matrixAutoUpdate = false; this.glint.name = 'ink-glint';
    scene.add(this.glint);
    this.glintK = 0;
    this.stat = { ribbons: 0, hits: 0, bands: 0, swirls: 0, chargeSpawned: 0, dev: [] };
    this.debug = false;
  }
  n(k) { return Math.max(1, Math.round(k * this.q)); }

  // ---------- 粒子 ----------
  spr(o) {
    if (typeof o.color === 'number' || typeof o.color === 'string') o.color = _c.set(o.color);
    else if (!o.color) o.color = this.col.ink;
    (o.light ? this.light : this.ink).write(o, this.now, this.T);
  }
  // 第二十三轮：第二组贴图集上的粒子
  spr2(o) {
    if (!this.ink2) return;
    if (typeof o.color === 'number' || typeof o.color === 'string') o.color = _c.set(o.color);
    else if (!o.color) o.color = this.lc.ink;
    this.ink2.write(o, this.now, this.T2);
  }
  cell(name) { const t = this.T2?.[name]; return t ? cellRect(t, Math.floor(Math.random() * t.g[0] * t.g[1])) : null; }
  // 第二十六轮：第三组贴图集上的粒子（light：加色的光）
  spr3(o) {
    const pool = o.light ? this.light3 : this.ink3;
    if (!pool) return;
    if (typeof o.color === 'number' || typeof o.color === 'string') o.color = _c.set(o.color);
    else if (!o.color) o.color = this.lc.ink;
    if (!o.rect && o.tile3) { const t = this.T3[o.tile3]; o.rect = cellRect(t, o.cell ?? Math.floor(Math.random() * t.g[0] * t.g[1])); }
    pool.write(o, this.now, this.T3);
  }
  // 一面太极印：深的一半用墨色、浅的一半用纸白——两张同大小、同转角、同转速、同一刻生成（化开的噪声也对齐）；先画浅的、再画深的
  taiji(p, { mode = 2, u = null, w = null, size, life, spin = 0, rot = R(0, 6.28), alpha = 0.95, erode = 0.35, delay = 0, fadeIn = 0.04, paper = 0.92 } = {}) {
    if (!this.ink3) return false;
    const o = { p, mode, u, w, size, life, spin, rot, delay, fadeIn, erode, fadeOut: 0.45 };
    this.spr3({ ...o, tile3: 'taijiL', cell: 0, color: this.lc.white, alpha: alpha * paper });
    this.spr3({ ...o, tile3: 'taijiD', cell: 0, color: this.lc.deep, alpha });
    this.stat.taiji = (this.stat.taiji || 0) + 1;
    return true;
  }
  // 竹叶：从 p 飞出 n 片（dir：往哪边带；speed 水平速度、up 往上的速度），打着转、慢慢飘落
  leaves(p, n, { dir = null, speed = [2, 5], up = [0.5, 2.5], spread = 1, life = [0.6, 0.95] } = {}) {
    if (!this.ink3) return;
    const L = INK.ink3.leaf;
    for (let i = 0; i < this.n(n); i++) {
      const v = new THREE.Vector3(R(-1, 1) * spread, 0, R(-1, 1) * spread);
      if (dir) v.addScaledVector(dir, R(0.6, 1.4));
      if (v.lengthSq() < 1e-6) v.set(1, 0, 0);
      v.normalize().multiplyScalar(R(speed[0], speed[1])); v.y += R(up[0], up[1]);
      const s = R(L.size[0], L.size[1]);
      this.spr3({ p: p.clone(), v, tile3: 'leaf', size: [s * 0.8, s], life: R(life[0], life[1]), color: this.lc.leaf, alpha: 0.95, rot: R(0, 6.28), spin: R(-7, 7), drag: 2.2, gravity: 2.5, erode: 0.2, fadeOut: 0.4 });
    }
  }
  // 序列帧去掉开头几行（墨团最初几帧是实心圆团，看着像一颗黑球）：返回 { rect, grid }
  seq(name, skipRows = 2) { const t = this.T2?.[name]; if (!t) return null; const [x, y, w, h] = t.r, [c, r] = t.g; return { rect: [x, y + (skipRows / r) * h, w, h * (r - skipRows) / r], grid: [c, r - skipRows] }; }
  // 墨点（拉长的墨滴）：p 起点、v 速度
  drop(p, v, { size = R(0.025, 0.05), life = R(0.3, 0.5), gravity = 9, drag = 2.2, alpha = 0.95 } = {}) {
    this.spr({ p, v, tile: 'dot', mode: 1, size: [size, size * 0.6], stretch: 0.05, life, gravity, drag, color: this.col.ink, alpha, fadeOut: 0.6 });
  }
  mist(p, { size = R(0.6, 1.0), life = R(0.6, 0.9), alpha = 0.22, v = null } = {}) {
    this.spr({ p, v: v || _w.set(R(-0.3, 0.3), R(0.1, 0.45), R(-0.3, 0.3)).clone(), tile: 'mist', size: [size * 0.8, size * 1.25], life, drag: 1.5, color: this.col.mist, alpha, soft: true, rot: R(-0.4, 0.4), spin: R(-0.3, 0.3), fadeIn: 0.15, fadeOut: 0.4 });
  }

  // =====================================================================================
  // 刀光带子
  // =====================================================================================
  // 一招开始（moves.start → skillfx.moveStart）：普攻、拔刀斩。a：这一招（动作的时刻 a.t、动作名 a.clip）
  swingStart(a) {
    const cfg = INK.slash[a.key], P = this.player;
    if (!cfg || !P.char.bladeLocalAt) return null;
    const r = this.ribbons.find((x) => x.state === 'off') || this.ribbons.reduce((x, y) => (x.t0 < y.t0 ? x : y));
    Object.assign(r, { state: 'wait', act: a, cfg, clip: a.clip, k: 0, n: 0, tEmit: null, stopped: false, span: null, t: 0, t0: this.now, dropAcc: 0, mistLeft: 0, ringDone: false,
      prev: { t: a.t, x: P.pos.x, y: P.pos.y, z: P.pos.z, h: P.heading } });
    r.mesh.visible = false; r.geo.setDrawRange(0, 0);
    r.mat.uniforms.uSeed.value = Math.random();
    // 第二十三轮：普攻（cfg.ext）用新的笔触与色板；拔刀斩照旧
    const U = r.mat.uniforms, L = INK.light, nu = !!(cfg.ext && this.S2);
    U.uNew.value = nu ? 1 : 0;
    U.uInk.value.set(nu ? L.color.ink : INK.color.ink); U.uMist.value.set(nu ? L.color.gray : INK.color.mist);
    if (nu) { U.uBrush.value.copy(this.S2.brush); U.uWash.value.copy(this.S2.wash); U.uDry.value.copy(Math.random() < 0.5 ? this.S2.dry0 : this.S2.dry1); U.uWashV.value = cfg.wash ?? 0.3; U.uWashA.value = L.washA; U.uDryK.value = L.dry; U.uEdge.value = L.edge; }
    U.uEdgeOn.value = cfg.cleave ? INK.cleave.edgeOn : 1;
    r.slamDone = false; r.lightT = -1;
    r.outAcc = 0;
    if (nu) for (const o of this.ribbons) {
      if (o === r || o.state !== 'break') continue;
      const used = Math.max(0, o.t - o.hold);
      o.hold = Math.min(o.hold, o.t); o.life = Math.min(o.life, used + L.keep);
    }
    this.stat.ribbons++;
    return r;
  }
  // 一招收了（skillfx.moveEnd）：done / chain 照常铺完；cancel / react / blocked / move 被取消、打断——不再铺，已铺的快速碎开
  swingEnd(a, reason) {
    for (const r of this.ribbons) {
      if (r.act !== a || (r.state !== 'wait' && r.state !== 'grow')) continue;
      if (reason === 'done' || reason === 'chain') { r.stopped = true; r.tStop = a.t; r.cancel = false; }
      else { r.stopped = true; r.tStop = a.t; r.cancel = true; }
    }
  }
  // 两元数组按这一刀的蓄力取
  cv(r, key) { return pick(r.cfg[key], r.k); }
  // 预估这一刀外沿走过的长度（动作本身的轨迹 + 根运动 × 前冲倍数）：带子的贴图按它铺满
  pathLen(r) {
    const ch = this.player.char, cfg = r.cfg, step = INK.ribbon.step * 2, Rt = ch.clips[r.clip]?.data?.root, lk = r.act.lungeK ?? 1;
    let L = 0, px = null, py = 0, pz = 0;
    for (let t = cfg.from; t <= cfg.to + 1e-6; t += step) {
      if (!ch.bladeLocalAt(r.clip, t, _tip, _base)) return 1;
      const o = this.outer(r, _tip, _base, _v);
      const rz = Rt ? rootZ(Rt, t) * lk : 0;
      if (px != null) L += Math.hypot(o.x - px, o.y - py, o.z + rz - pz);
      px = o.x; py = o.y; pz = o.z + rz;
    }
    return Math.max(0.3, L);
  }
  outer(r, tip, base, out) {
    _u.subVectors(tip, base).normalize();
    return out.copy(tip).addScaledVector(_u, this.cv(r, 'reach'));
  }
  updateRibbon(r, dt, camera) {
    const P = this.player, ch = P.char, cfg = r.cfg, U = r.mat.uniforms;
    if (r.state === 'wait' || r.state === 'grow') {
      const tNow = r.stopped ? r.tStop : r.act.t;
      const cur = { t: tNow, x: P.pos.x, y: P.pos.y, z: P.pos.z, h: P.heading };
      if (r.act.iaiK != null) r.k = r.act.iaiK;
      const end = Math.min(cfg.to, tNow);
      if (end >= cfg.from && !(r.stopped && r.n === 0 && r.tEmit == null && tNow < cfg.from)) {
        if (r.span == null) r.span = this.pathLen(r);
        let t = r.tEmit == null ? cfg.from : r.tEmit + INK.ribbon.step;
        let emitted = false;
        while (t <= end + 1e-6 && r.n < r.max) { this.emit(r, t, r.prev, cur); r.tEmit = t; t += INK.ribbon.step; emitted = true; }
        // 最后一小段不足一步时补在 end 上（带子的头正对着此刻的剑）
        if (r.n < r.max && r.tEmit != null && end - r.tEmit > 1e-4) { this.emit(r, end, r.prev, cur); r.tEmit = end; emitted = true; }
        if (emitted) { r.state = 'grow'; this.writeU(r); }
      }
      r.prev = cur;
      if (r.state === 'grow') {
        r.mesh.visible = r.n >= 2;
        r.geo.setDrawRange(0, Math.max(0, r.n - 1) * 6);
        U.uRectA.value.copy(r.mode === 'stroke' ? this.strokes[0] : this.crescent[INK.ribbon.frame0]); U.uRectB.value.copy(U.uRectA.value); U.uMix.value = 0;
        U.uAlpha.value = r.cfg.ext ? INK.light.alpha : INK.ribbon.alpha; U.uErode.value = 0; U.uWhite.value = INK.ribbon.white * (r.cfg === INK.slash.iai_slash ? 1 : 0.9);
      }
      if (tNow >= cfg.to - 1e-6 || r.stopped) {
        if (r.n >= 2) { r.state = 'break'; r.t = 0; r.hold = r.cancel ? 0 : this.cv(r, 'hold'); r.life = r.cancel ? INK.ribbon.cancelLife : this.cv(r, 'life'); this.ribbonEndFx(r); }
        else { r.state = 'off'; r.mesh.visible = false; }
      }
    } else if (r.state === 'break') {
      r.t += dt;
      const x = Math.max(0, r.t - r.hold) / r.life;
      if (x >= 1) { r.state = 'off'; r.mesh.visible = false; return; }
      const seq = r.mode === 'stroke' ? this.strokes : this.crescent.slice(INK.ribbon.frame0), nf = seq.length - 1;
      const f = Math.min(nf, x * nf * 1.08), fa = Math.floor(f);
      U.uRectA.value.copy(seq[fa]); U.uRectB.value.copy(seq[Math.min(nf, fa + 1)]); U.uMix.value = f - fa;
      U.uAlpha.value = (r.cfg.ext ? INK.light.alpha : INK.ribbon.alpha) * (1 - smooth(0.5, 1, x));
      U.uErode.value = INK.ribbon.erode * smooth(0.12, 1, x);
      U.uWhite.value = Math.max(0, 1 - r.t / 0.08) * INK.ribbon.white;
    }
    U.uNow.value = this.now; U.uWhiteLen.value = INK.ribbon.whiteLen; U.uThick.value = this.cv(r, 'thick');
    void camera;
  }
  // 补一个采样点：动作时刻 t 的剑（按这段动作本身算）放到「上一帧 → 这一帧」之间插值的根节点下
  emit(r, t, a, b) {
    const ch = this.player.char, cfg = r.cfg, i = r.n;
    if (!ch.bladeLocalAt(r.clip, t, _tip, _base)) return;
    const s = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
    let dh = b.h - a.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const h = a.h + dh * s, cs = Math.cos(h), sn = Math.sin(h), ox = a.x + (b.x - a.x) * s, oy = a.y + (b.y - a.y) * s, oz = a.z + (b.z - a.z) * s;
    const W = (p) => p.set(p.x * cs + p.z * sn + ox, p.y + oy, -p.x * sn + p.z * cs + oz);
    W(_tip); W(_base);
    r.mode = cfg.stroke ? 'stroke' : 'sheet';
    const out = this.outer(r, _tip, _base, new THREE.Vector3());
    // 第二十三轮：判定段里沿剑身把外沿伸到这一式的判定距离（离人水平 range 米；剑身朝下时不低于脚下 floor 米）
    let ek = 0;
    if (cfg.ext) {
      const X = this.extend(r, t, _tip, _base, ox, oy, oz);
      if (X) { ek = X.k; const d = _u.subVectors(_tip, _base).normalize(); out.copy(_tip).addScaledVector(d, Math.max(this.cv(r, 'reach'), X.x)); }
    }
    const inn = cfg.stroke ? out.clone() : _base.clone().lerp(_tip, cfg.inner);
    const P = r.pos, k = i * 6;
    P[k] = inn.x; P[k + 1] = inn.y; P[k + 2] = inn.z; P[k + 3] = out.x; P[k + 4] = out.y; P[k + 5] = out.z;
    // 沿外沿累计长度（贴图按长度铺：剑走得快的地方不被拉稀）
    if (i > 0) { const j = (i - 1) * 6; r.L[i] = r.L[i - 1] + Math.hypot(out.x - P[j + 3], out.y - P[j + 4], out.z - P[j + 5]); } else r.L[i] = 0;
    // 切向（剑势的走向）与扫过的面的法线（突刺没有面：0）
    const tg = new THREE.Vector3();
    if (i > 0) tg.set(out.x - P[(i - 1) * 6 + 3], out.y - P[(i - 1) * 6 + 4], out.z - P[(i - 1) * 6 + 5]);
    if (tg.lengthSq() > 1e-10) tg.normalize();
    const along = new THREE.Vector3().subVectors(out, inn);
    const nm = cfg.stroke ? new THREE.Vector3() : new THREE.Vector3().crossVectors(tg, along);
    if (nm.lengthSq() > 1e-10) nm.normalize();
    if (along.lengthSq() > 1e-10) along.normalize(); else along.copy(tg);
    const born = this.now - Math.max(0, (b.t - t)) / (r.act.def?.speed ?? 1);
    for (const v of [0, 1]) {
      const d = (i * 2 + v) * 4;
      r.d[d] = tg.x; r.d[d + 1] = tg.y; r.d[d + 2] = tg.z; r.d[d + 3] = born;
      r.nrm[d] = nm.x; r.nrm[d + 1] = nm.y; r.nrm[d + 2] = nm.z;
    }
    if (i === 1) { for (const v of [0, 1]) { const d = v * 4; r.d[d] = tg.x; r.d[d + 1] = tg.y; r.d[d + 2] = tg.z; r.nrm[d] = nm.x; r.nrm[d + 1] = nm.y; r.nrm[d + 2] = nm.z; } }
    r.n = i + 1;
    // 突刺：剑尖刺到头（cfg.ring 时刻）时，剑尖处一圈墨环朝着刺的方向张开——从背后看刺的那一笔几乎是一个点，这一圈看得见
    if (cfg.ring && !r.ringDone && t >= cfg.ring && tg.lengthSq() > 0) { r.ringDone = true; this.pierce(_tip.clone(), out.clone(), _v.set(Math.sin(h), 0, Math.cos(h)).lerp(tg, 0.35).normalize().clone()); }
    // 第二十六轮：重劈——判定段前后剑尖扫过之处留一串白光（顺着剑势拉长、正对镜头：竖着劈从背后也看得见）；劈到底在地上炸开
    if (cfg.cleave && r.act.def?.active && i > 0 && tg.lengthSq() > 0) {
      const A2 = r.act.def.active, CL = INK.cleave.light;
      if (t >= A2[0] - 0.05 && t <= A2[1] + 0.03 && t - r.lightT >= 1 / 90) {
        r.lightT = t;
        this.spr({ p: _tip.clone(), v: tg.clone().multiplyScalar(1.5), tile: 'glow', light: true, mode: 1, size: [CL.w, CL.w * 0.6], stretch: CL.stretch, life: CL.life, color: this.lc.edge, alpha: 0.9, soft: true, fadeOut: 0.3 });
      }
      if (cfg.slam && !r.slamDone && t >= cfg.slam) { r.slamDone = true; this.cleaveSlam(_tip.clone(), h, out.clone()); }
    }
    // 沿刀势甩墨点（按铺过的长度均匀分配到这一刀的 drops 颗）
    if (i > 0 && tg.lengthSq() > 0) {
      const total = this.n(this.cv(r, 'drops'));
      r.dropAcc += total * (r.L[i] - r.L[i - 1]) / r.span;
      while (r.dropAcc >= 1) {
        r.dropAcc -= 1;
        const v = tg.clone().multiplyScalar(R(2.5, 5.5)).addScaledVector(along, R(0.3, 1.8)).add(new THREE.Vector3(R(-0.4, 0.4), R(0, 1.2), R(-0.4, 0.4)));
        this.drop(out.clone().lerp(inn, R(0, 0.35)), v);
      }
    }
    // 第二十三轮：外层（不伤人）——判定段的外沿每米撒几颗墨雾、飞白、笔锋，往外散、随剑势带出去
    if (cfg.outer && ek > 0.3 && i > 0 && tg.lengthSq() > 0 && this.ink2) {
      const Lseg = r.L[i] - r.L[i - 1];
      r.outAcc += Lseg * INK.outer.per * cfg.outer * this.q;
      while (r.outAcc >= 1) { r.outAcc -= 1; this.outerFx(out, tg, nm, _v.set(out.x - ox, 0, out.z - oz)); }
    }
    if (this.debug && Math.abs(t - b.t) < 1e-6) {
      // 自检：带子的头（此刻的采样）与画面上的剑相差多少——只在采样点正是这一帧的时刻时比
      const t2 = new THREE.Vector3(), b2 = new THREE.Vector3();
      ch.bladeEnds(t2, b2);
      this.stat.dev.push({ key: r.act.key, t: +t.toFixed(3), tipCm: +(t2.distanceTo(_tip) * 100).toFixed(2), baseCm: +(b2.distanceTo(_base) * 100).toFixed(2) });
    }
  }
  // 第二十三轮：外沿伸多长——判定段（这一式的 active）前 pre 秒起渐伸、后 post 秒收回；沿剑身方向，伸到离人（这一采样时刻的位置）水平 range 米处
  extend(r, t, tip, base, cx, cy, cz) {
    const L = INK.light.ext, D = r.act.def, act = D.active, range = D.hits?.[0]?.range;
    if (!act || !range) return null;
    const k = smooth(act[0] - L.pre, act[0], t) * (1 - smooth(act[1], act[1] + L.post, t));
    if (k <= 0) return null;
    const d = _w.subVectors(tip, base).normalize();
    const px = tip.x - cx, pz = tip.z - cz, A2 = d.x * d.x + d.z * d.z, B2 = px * d.x + pz * d.z, C2 = px * px + pz * pz - range * range;
    let x = L.max;
    if (A2 > 1e-4) { const disc = B2 * B2 - A2 * C2; x = disc > 0 ? (-B2 + Math.sqrt(disc)) / A2 : 0; }
    x = Math.min(L.max, Math.max(0, x));
    const minY = cy + L.floor, maxY = cy + L.top;
    if (d.y < -1e-3 && tip.y + d.y * x < minY) x = Math.max(0, (tip.y - minY) / -d.y);
    if (d.y > 1e-3 && tip.y + d.y * x > maxY) x = Math.max(0, (maxY - tip.y) / d.y);
    return { x: x * k, k };
  }
  // 外层的一颗：墨雾（序列帧）/ 飞白（干笔横刷，暖白低透明）/ 笔锋（一笔弧形的某一格）；p 外沿上的点，tg 剑势走向，nm 扫过的面的法线，rad 由人往外的水平方向
  outerFx(p, tg, nm, rad) {
    const O = INK.outer, lr = rad.lengthSq() > 1e-6 ? rad.clone().normalize() : tg.clone();
    const q = p.clone().addScaledVector(lr, R(O.spread[0], O.spread[1])).addScaledVector(nm.lengthSq() > 0 ? nm : _w.set(0, 1, 0), R(-0.35, 0.35)).add(_w.set(0, R(-0.15, 0.25), 0));
    const v = tg.clone().multiplyScalar(R(1.5, 4.5)).addScaledVector(lr, R(0.4, 1.8)).add(_w.set(0, R(-0.2, 0.6), 0));
    const life = R(O.life[0], O.life[1]), x = Math.random();
    if (x < 0.36) this.spr2({ p: q, v, tile: 'wisp', span: 1, size: [R(0.6, 0.9), R(1.0, 1.4)], life, color: this.lc.gray, alpha: R(O.mist[0], O.mist[1]), soft: true, rot: R(-0.5, 0.5), spin: R(-0.6, 0.6), drag: 2.5, fadeIn: 0.12, fadeOut: 0.45 });
    else if (x < 0.66) { const S = this.S2[Math.random() < 0.5 ? 'dry0' : 'dry1']; this.spr2({ p: q, v, rect: [S.x, S.y, S.z, S.w], mode: 2, u: tg.clone(), w: lr.clone(), size: [R(0.8, 1.5), R(0.14, 0.26)], life: life * 0.85, color: this.lc.white, alpha: R(O.white[0], O.white[1]), erode: 0.4, drag: 3, fadeIn: 0.05, fadeOut: 0.45 }); }
    else this.spr2({ p: q, v, rect: this.cell('flick'), mode: 2, u: tg.clone(), w: lr.clone(), size: [R(0.26, 0.46), R(0.26, 0.46)], life, color: this.lc.ink, alpha: R(O.flick[0], O.flick[1]), erode: 0.3, rot: R(-0.4, 0.4), drag: 2, gravity: 2, fadeOut: 0.5 });
  }
  // 按此刻的头重新算各点的 u（0 = 头：剑刃所在 … 1 = 尾：起手处）——带子长着的时候贴图随剑滑动，笔头始终在剑上
  writeU(r) {
    const head = r.L[r.n - 1], span = Math.max(r.span, head);
    for (let i = 0; i < r.n; i++) { const u = (head - r.L[i]) / span; r.nrm[(i * 2) * 4 + 3] = u; r.nrm[(i * 2 + 1) * 4 + 3] = u; }
    const g = r.geo.attributes;
    g.position.needsUpdate = true; g.aD.needsUpdate = true; g.aN.needsUpdate = true;
  }
  // 突刺的墨环（ink_06 一笔圆）：圆面垂直于刺的方向，由小张大、碎开；几颗墨点在圆面里四散
  thrustRing(p, dir) {
    const u = new THREE.Vector3().crossVectors(dir, _v.set(0, 1, 0));
    if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
    u.normalize();
    const w = new THREE.Vector3().crossVectors(u, dir).normalize();
    this.spr({ p, tile: 'enso', mode: 2, u, w, size: [0.3, 0.95], life: 0.3, color: this.col.ink, alpha: 0.85, erode: 0.55, rot: R(0, 6.28), fadeOut: 0.45 });
    for (let i = 0; i < this.n(6); i++) {
      const a = R(0, 6.28), v = u.clone().multiplyScalar(Math.cos(a) * R(2, 4)).addScaledVector(w, Math.sin(a) * R(2, 4)).addScaledVector(dir, R(1, 3));
      this.drop(p.clone(), v, { size: R(0.025, 0.045), life: R(0.25, 0.4) });
    }
  }
  // 第二十六轮：突刺刺到头——从剑尖起沿刺的方向一串墨环由近到远张开（从背后看是一圈圈往外推的墨浪）、剑尖白光、放射的墨锋、一支墨枪、往前射的细白光、绕剑往前钻的螺旋墨带
  //   tip：此刻的剑尖；out：带子的外沿（判定段里伸到这一式的判定距离）——墨环从剑尖排到外沿再往外一点
  pierce(tip, out, dir) {
    const C = INK.pierce, up = _w.set(0, 1, 0), p = tip;
    const u = new THREE.Vector3().crossVectors(dir, up); if (u.lengthSq() < 1e-6) u.set(1, 0, 0); u.normalize();
    const w = new THREE.Vector3().crossVectors(u, dir).normalize();
    const L = Math.max(1.2, _u.subVectors(out, tip).dot(dir) + C.over), nr = C.rings.length;
    const I3 = INK.ink3;
    C.rings.forEach(([s0, s1, life], i) => {
      const d = C.lead + (L - C.lead) * (i / (nr - 1));
      // 第二十六轮：第一圈换成一面太极印（第三组水墨），旋转着张开再化开
      if (i === 0 && this.taiji(p.clone().addScaledVector(dir, d), { u, w, size: [I3.pierceTaiji[0], I3.pierceTaiji[1]], life: I3.pierceTaiji[2], spin: I3.pierceTaiji[3] * (Math.random() < 0.5 ? 1 : -1), paper: I3.paper })) return;
      this.spr({ p: p.clone().addScaledVector(dir, d), tile: i === 0 ? 'inkRing' : 'enso', mode: 2, u, w, size: [s0, s1], life, delay: i * C.gap, color: i === 0 ? this.lc.deep : this.lc.ink, alpha: 0.95 - i * 0.1, erode: 0.4, rot: R(0, 6.28), fadeOut: 0.45 });
    });
    if (this.ink3) {
      // 顺着刺的方向从刺穿处喷出的一束墨（两片十字交叉：从侧面、上面都看得见）；一束收向前方的白色刺线
      const F = I3.fan, S = I3.stab;
      for (const ax of [w, u]) {
        this.spr3({ p: p.clone().addScaledVector(dir, C.lead + F[0] * 0.45), tile3: 'splatF', mode: 2, u: ax.clone().multiplyScalar(F[1] / F[0]), w: dir.clone(), size: [F[0] * 0.75, F[0]], life: F[2], color: this.lc.ink, alpha: 0.9, erode: 0.4, fadeOut: 0.5 });
        this.spr3({ p: p.clone().addScaledVector(dir, S[0] * 0.3), tile3: 'stab', light: true, mode: 2, u: dir.clone().multiplyScalar(S[0] / S[1]), w: ax.clone(), size: [S[1] * 0.8, S[1]], life: S[2], color: this.lc.edge, alpha: 0.9, soft: true, fadeOut: 0.45 });
      }
      this.leaves(p.clone(), I3.pierceLeaves, { dir, speed: [3, 6.5], up: [0.3, 1.6], spread: 0.6 });
    }
    const Wr = C.white;
    this.spr({ p: p.clone().addScaledVector(dir, 0.1), tile: 'enso', light: true, mode: 2, u, w, size: [Wr[0], Wr[1]], life: Wr[2], color: this.lc.edge, alpha: 0.95, rot: R(0, 6.28), fadeOut: 0.4 });
    this.spr({ p: p.clone().addScaledVector(dir, 0.6), tile: 'streak', light: true, mode: 2, u: dir.clone().multiplyScalar(4), w: w.clone(), size: [0.7, 0.35], life: 0.14, color: this.lc.edge, alpha: 0.9, soft: true, fadeOut: 0.5 });
    this.spr({ p, tile: 'star', light: true, size: C.flash, life: 0.13, color: this.col.light, alpha: 1, soft: true, rot: R(0, 6.28) });
    this.spr({ p, tile: 'glow', light: true, size: [0.35, 1.1], life: 0.18, color: this.lc.edge, alpha: 0.55, soft: true });
    if (this.ink2) {
      const ns = this.n(C.spikes);
      for (let i = 0; i < ns; i++) {
        const a = (i / ns) * Math.PI * 2 + R(-0.25, 0.25), rd = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)), tw = u.clone().multiplyScalar(-Math.sin(a)).addScaledVector(w, Math.cos(a));
        this.spr2({ p: p.clone().addScaledVector(rd, R(0.2, 0.35)).addScaledVector(dir, R(0, 0.5)), v: rd.clone().multiplyScalar(R(3, 6)).addScaledVector(dir, R(1, 3)), rect: this.cell('flick'), mode: 2, u: rd, w: tw,
          size: [R(0.4, 0.62), R(0.3, 0.5)], life: R(0.22, 0.32), color: this.lc.ink, alpha: 0.9, erode: 0.35, drag: 2.5, fadeOut: 0.5 });
      }
      const B = this.S2.brush, side = w.clone(), SL = L + 0.6;
      this.spr2({ p: p.clone().addScaledVector(dir, SL * 0.42), v: dir.clone().multiplyScalar(3.5), rect: [B.x, B.y, B.z, B.w], mode: 2, u: dir.clone().multiplyScalar(SL / C.spear), w: side,
        size: [C.spear, C.spear * 0.75], life: 0.24, color: this.lc.ink, alpha: 0.88, erode: 0.55, drag: 3, fadeOut: 0.5 });
    }
    // 往前射出的细白光（光晕顺着去向拉长）
    for (let i = 0; i < this.n(C.needles); i++) {
      const a = R(0, 6.28), rr = R(0.05, 0.3);
      this.spr({ p: p.clone().addScaledVector(u, Math.cos(a) * rr).addScaledVector(w, Math.sin(a) * rr), v: dir.clone().multiplyScalar(R(9, 15)).addScaledVector(u, Math.cos(a) * R(0.3, 1.2)).addScaledVector(w, Math.sin(a) * R(0.3, 1.2)),
        tile: 'glow', light: true, mode: 1, size: [0.11, 0.05], stretch: 0.32, life: R(0.14, 0.22), drag: 4, color: this.lc.edge, alpha: 0.95, soft: true, delay: R(0, 0.04), fadeOut: 0.4 });
    }
    for (let i = 0; i < this.n(C.drops); i++) {
      const a = R(0, 6.28), v = u.clone().multiplyScalar(Math.cos(a) * R(1.5, 4)).addScaledVector(w, Math.sin(a) * R(1.5, 4)).addScaledVector(dir, R(2, 6));
      this.drop(p.clone(), v, { size: R(0.025, 0.05), life: R(0.25, 0.45) });
    }
    // 螺旋墨带：从剑身中段起，绕着刺的方向往前钻
    const H = C.helix, hx = this.helices.find((x) => x.state === 'off') || this.helices.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    hx.build(Math.round((L + 0.55) * 10) / 10, H.turns, H.r[0], H.r[1], H.w);
    hx.mesh.position.copy(p).addScaledVector(dir, -0.55);
    hx.q0.setFromUnitVectors(_v.set(0, 0, 1), dir);
    Object.assign(hx, { state: 'on', t: 0, life: H.life, spin: R(0, 6.28), rate: H.spin * (Math.random() < 0.5 ? 1 : -1) });
    hx.U.uSeed.value = Math.random(); hx.U.uDry.value.copy(Math.random() < 0.5 ? this.S2.dry0 : this.S2.dry1);
    this.updateHelix(hx, 0);
    hx.mesh.visible = true;
  }
  updateHelix(hx, dt) {
    if (hx.state === 'off') return;
    hx.t += dt;
    const k = hx.t / hx.life;
    if (k >= 1) { hx.state = 'off'; hx.mesh.visible = false; return; }
    hx.spin += hx.rate * dt;
    hx.mesh.quaternion.copy(hx.q0).multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), hx.spin));
    const U = hx.U;
    U.uHead.value = Math.min(1.02, smooth(0, 0.32, k) * 1.02); U.uTail.value = smooth(0.25, 1, k); U.uAlpha.value = 0.92 * (1 - smooth(0.65, 1, k)); U.uWhite.value = 1 - smooth(0.25, 0.6, k);
  }
  // 第二十六轮：重劈劈到底——一道竖着的白光刀痕（衬着一小团墨）、地上一团晕墨、一圈墨浪、顺着劈的方向裂开的一路（地上一道墨裂、两侧依次翻起的墨锋）、
  //   放射的墨裂、白光、往上溅的光点、墨点、半空一道竖着的白色月牙（剑势的残影）
  cleaveSlam(tip, heading, out) {
    const C = INK.cleave, up = new THREE.Vector3(0, 1, 0);
    const fw = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)), side = new THREE.Vector3(fw.z, 0, -fw.x);
    const g = this.groundAt(tip.x, tip.z, tip.y + 0.5), base = new THREE.Vector3(tip.x, g + 0.04, tip.z);
    if (tip.y - g > 2.2) base.copy(tip).setY(tip.y - 0.4);                                        // 剑没劈到地（高台边、空中）：只在剑尖处爆开
    const onGround = tip.y - g <= 2.2;
    if (this.ink2) {
      if (onGround) {
        this.spr2({ p: base.clone().addScaledVector(fw, 0.35), rect: this.cell('blot'), mode: 3, size: C.blot, life: 0.8, color: this.lc.deep, alpha: 0.72 * (this.ink3 ? INK.ink3.blotK : 1), erode: 0.45, rot: R(0, 6.28), fadeIn: 0.03, fadeOut: 0.6 });
        const W = C.wave;
        let reach = 0;
        for (let i = 0; i < W.n; i++) {
          const d = 0.5 + i * W.step, q = base.clone().addScaledVector(fw, d), gq = this.groundAt(q.x, q.z, q.y + 0.6), k = 1 - i * 0.12;
          if (Math.abs(gq - g) > 0.8) break;                                                         // 前面是台阶、断崖：裂到此为止
          reach = d; q.y = gq;
          // 两侧翻起的墨锋：贴着裂缝往外上方甩开
          for (const sg of [-1, 1]) {
            const o = side.clone().multiplyScalar(sg), du = o.clone().multiplyScalar(0.55).addScaledVector(up, 0.85).normalize(), dw = new THREE.Vector3().crossVectors(du, fw).normalize();
            this.spr2({ p: q.clone().addScaledVector(o, R(0.12, 0.26)).addScaledVector(up, W.h * 0.3 * k), v: o.clone().multiplyScalar(R(0.8, 1.8)).addScaledVector(up, R(0.8, 2)), rect: this.cell('flick'), mode: 2,
              u: du.multiplyScalar(1.2), w: dw, size: [W.h * 0.4 * k, W.h * 0.62 * k], life: W.life, delay: i * W.delay, color: this.lc.ink, alpha: W.alpha, erode: 0.38, drag: 3, gravity: 3, fadeOut: 0.5 });
          }
          this.spr2({ p: q.clone().setY(gq + 0.03).addScaledVector(side, R(-0.1, 0.1)), rect: this.cell('blot'), mode: 3, size: [0.4, 0.8 * k], life: 0.75, delay: i * W.delay, color: this.lc.ink, alpha: 0.55, erode: 0.45, rot: R(0, 6.28), fadeOut: 0.6 });
        }
        // 地上一道墨裂：顺着劈的方向从落点裂到最远那一段
        if (reach > 0) this.spr2({ p: base.clone().addScaledVector(fw, reach * 0.5 + 0.25).setY(g + 0.035), rect: this.cell('tendril'), mode: 2, u: fw.clone().multiplyScalar((reach + 0.7) / 0.42), w: side.clone(),
          size: [0.42, 0.42], life: 0.85, color: this.lc.deep, alpha: 0.88, erode: 0.4, fadeIn: 0.02, fadeOut: 0.55 });
        for (let i = 0; i < this.n(C.cracks); i++) {
          const a = R(-1.5, 1.5) + (i % 3 === 2 ? Math.PI : 0), d = fw.clone().applyAxisAngle(up, a), dw = new THREE.Vector3(d.z, 0, -d.x), L = R(0.9, 1.6);
          this.spr2({ p: base.clone().addScaledVector(d, L * 0.55), rect: this.cell('tendril'), mode: 2, u: d.clone().multiplyScalar(L / 0.45), w: dw, size: [0.45, 0.42], life: R(0.55, 0.8), color: this.lc.deep, alpha: 0.8, erode: 0.4, fadeIn: 0.03, fadeOut: 0.55 });
        }
      }
      for (let i = 0; i < 3; i++) this.spr2({ p: base.clone().add(_v.set(R(-0.6, 0.6), R(0.1, 0.5), R(-0.6, 0.6))).addScaledVector(fw, 0.4), v: _v.set(R(-0.6, 0.6), R(0.2, 0.8), R(-0.6, 0.6)).clone(), tile: 'wisp', span: 1, size: [0.9, 1.7], life: R(0.5, 0.75), color: this.lc.gray, alpha: 0.18, soft: true, drag: 2, fadeIn: 0.08, fadeOut: 0.5 });
    }
    this.spr({ p: base.clone().add(_v.set(0, 0.25, 0)), tile: 'inkRing', mode: 3, size: C.ring, life: 0.42, color: this.lc.ink, alpha: onGround ? 0.72 : 0, erode: 0.5, rot: R(0, 6.28), fadeOut: 0.5 });
    // 刀痕后一小团墨（衬着白光；不高，很快散开：不把敌人盖住）
    if (this.ink2) this.spr2({ p: base.clone().add(_v.set(0, C.column[1] * 0.38, 0)), ...this.seq('burstD'), span: 0.7, size: [C.column[0], C.column[1]], life: C.column[2], color: this.lc.deep, alpha: 0.82, erode: 0.35, rot: R(-0.15, 0.15), fadeOut: 0.45 });
    // 一道竖着的白光刀痕（光条立起来，正对镜头）
    this.spr({ p: base.clone().addScaledVector(up, C.blade[0] * 0.4), tile: 'streak', light: true, size: [C.blade[0], C.blade[0] * 1.08], life: C.blade[1], color: this.lc.edge, alpha: 1, soft: true, rot: Math.PI / 2, fadeOut: 0.35 });
    this.spr({ p: base.clone().addScaledVector(up, C.blade[0] * 0.4), tile: 'streak', light: true, size: [C.blade[0] * 0.8, C.blade[0] * 0.9], life: C.blade[1] * 0.6, color: this.col.light, alpha: 1, soft: true, rot: Math.PI / 2, fadeOut: 0.3 });
    this.spr({ p: base.clone().add(_v.set(0, 0.35, 0)), tile: 'star', light: true, size: C.flash, life: 0.14, color: this.col.light, alpha: 1, soft: true, rot: R(0, 6.28) });
    this.spr({ p: base.clone().add(_v.set(0, 0.45, 0)), tile: 'glow', light: true, size: [1.2, 2.9], life: 0.22, color: this.lc.edge, alpha: 0.5, soft: true });
    // 往上溅的光点
    for (let i = 0; i < this.n(C.sparks); i++) this.spr({ p: base.clone().add(_v.set(R(-0.3, 0.3), 0.15, R(-0.3, 0.3))), v: side.clone().multiplyScalar(R(-3.2, 3.2)).addScaledVector(fw, R(-0.5, 2.5)).add(_v.set(0, R(3, 7.5), 0)),
      tile: 'glow', light: true, mode: 1, size: [0.1, 0.06], stretch: 0.3, life: R(0.28, 0.48), gravity: 7, drag: 1.4, color: this.lc.edge, alpha: 0.95, soft: true, fadeOut: 0.5 });
    // 第二十六轮：第三组水墨——地上盖一面太极印（旋转着张开再化开）、一片放射的墨裂，震起几片竹叶
    if (this.ink3 && onGround) {
      const I3 = INK.ink3, T = I3.cleaveTaiji;
      this.taiji(base.clone().addScaledVector(fw, I3.ahead).add(_v.set(0, 0.03, 0)), { mode: 3, size: [T[0], T[1]], life: T[2], spin: T[3] * (Math.random() < 0.5 ? 1 : -1), alpha: 0.92, erode: 0.4, delay: 0.03 });
      this.spr3({ p: base.clone().add(_v.set(0, 0.025, 0)), tile3: 'crack', mode: 3, size: I3.crack, life: 1.0, color: this.lc.deep, alpha: 0.85, erode: 0.4, rot: R(0, 6.28), fadeIn: 0.02, fadeOut: 0.5 });
      this.leaves(base.clone().add(_v.set(0, 0.4, 0)), I3.cleaveLeaves, { dir: fw, speed: [2.5, 6], up: [2, 5], spread: 1.2 });
    }
    this.onSlam?.(base.clone(), C.shake);
    // 半空一道竖着的白色月牙：在剑劈下的那个面上（人与剑尖之间、略高），正对镜头
    const mid = out.clone().lerp(base, 0.35).addScaledVector(up, 0.9);
    this.spr({ p: mid, tile: 'arcLight', light: true, span: 0, size: C.arc.size, life: C.arc.life, color: this.lc.edge, alpha: 0.9, soft: true, rot: -Math.PI / 2, fadeOut: 0.5 });
    for (let i = 0; i < this.n(C.drops); i++) this.drop(base.clone().add(_v.set(0, 0.2, 0)), side.clone().multiplyScalar(R(-4.5, 4.5)).addScaledVector(fw, R(0.5, 4)).add(_v.set(0, R(2, 6.5), 0)), { size: R(0.03, 0.06), life: R(0.35, 0.6) });
    this.stat.slams = (this.stat.slams || 0) + 1;
  }
  // 一刀铺完（或被打断）：散开几团灰色墨雾
  ribbonEndFx(r) {
    if (r.cancel || r.n < 3) return;
    const m = this.n(this.cv(r, 'mist'));
    for (let k = 0; k < m; k++) {
      const i = Math.floor(R(0.2, 0.9) * (r.n - 1)) * 6, P = r.pos;
      const p = new THREE.Vector3(P[i] + (P[i + 3] - P[i]) * 0.7, P[i + 1] + (P[i + 4] - P[i + 1]) * 0.7, P[i + 2] + (P[i + 5] - P[i + 2]) * 0.7);
      this.mist(p, { size: R(0.55, 0.9) * (r.cfg === INK.slash.iai_slash ? 1.4 : 1), alpha: 0.2 });
    }
  }

  // =====================================================================================
  // 命中：实际接触点上一团墨（未命中不放）
  // =====================================================================================
  // at：接触点；dir：剑的去向（水平）；heavy：重击；k：拔刀斩的蓄力（大小再放一点）
  hit(at, dir, { heavy = false, thrust = false, k = 0, key = null, crit = false } = {}) {
    // legacy：只给改前改后的对照录像用（同时把 INK.slash 的普攻四式换回第二十轮的参数），游戏里不开
    if (key && key.startsWith('light') && this.ink2 && !this.legacy) { this.hitLight(at, dir, heavy ? 'heavy' : thrust ? 'thrust' : 'slash', crit); return; }
    const H = INK.hit, s = (heavy ? H.heavy : 1) * (1 + 0.25 * k), p = at.clone();
    const d = _u.copy(dir || _v.set(0, 0, 1)); d.y = 0; if (d.lengthSq() < 1e-6) d.set(0, 0, 1); d.normalize();
    const up = _w.set(0, 1, 0);
    // 墨溅（ink_03_all 四帧，前 44% 放完）
    this.spr({ p, tile: 'splash', size: [R(H.size[0], H.size[1]) * s * 0.8, R(H.size[0], H.size[1]) * s], life: H.life * (heavy ? 1.15 : 1), span: H.span, rot: R(0, 6.28), color: this.col.ink, alpha: 0.95, erode: 0.45, fadeOut: 0.5 });
    // 受击墨花（Hit by flash-1，2×2 帧）：立在剑的去向上
    this.spr({ p: p.clone().addScaledVector(d, 0.08), tile: 'hit', mode: 2, u: d.clone(), w: up.clone(), size: [0.75 * s, 0.95 * s], life: 0.32, span: 1, color: this.col.ink, alpha: 0.9, erode: 0.3, fadeOut: 0.6 });
    // 墨点：顺着剑的去向甩出去
    const nd = this.n(Math.round(R(H.drops[0], H.drops[1]) * (heavy ? 1.4 : 1) * (1 + 0.5 * k)));
    for (let i = 0; i < nd; i++) {
      const v = d.clone().multiplyScalar(R(2.5, 6.5) * (thrust ? 1.2 : 1)).add(_v.set(R(-1.6, 1.6), R(-0.2, 2.2), R(-1.6, 1.6)));
      this.drop(p.clone(), v, { size: R(0.025, 0.055) * s });
    }
    // 一点白光（星芒 + 顺着剑势的细条）
    this.spr({ p, tile: 'star', light: true, size: [0.45 * s, 1.0 * s], life: 0.13, color: this.col.light, alpha: H.flash, soft: true, rot: R(0, 6.28) });
    this.spr({ p, tile: 'streak', light: true, mode: 2, u: d.clone(), w: _v.crossVectors(d, up).normalize().clone(), size: [1.2 * s, 0.35 * s], life: 0.09, color: this.col.light, alpha: H.flash * 0.8, soft: true });
    this.mist(p.clone().add(_v.set(0, 0.1, 0)), { size: R(0.5, 0.8) * s, alpha: 0.18, life: 0.6 });
    this.stat.hits++;
  }

  // 第二十三轮：普攻命中的爆墨（只在真实命中的接触点）：斜斩横斩中小型飞溅、突刺向前穿出的笔锋、重劈厚重并向下与两侧展开；crit（反击强化）放大一些
  hitLight(at, dir, kind, crit = false) {
    const H = INK.hit2, s = crit ? H.crit : 1, p = at.clone(), ink = this.lc.ink;
    const d = _u.copy(dir || _v.set(0, 0, 1)); d.y = 0; if (d.lengthSq() < 1e-6) d.set(0, 0, 1); d.normalize();
    const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3().crossVectors(d, up).normalize(), dd = d.clone();
    this.spr({ p, tile: 'star', light: true, size: [0.22 * s, 0.5 * s], life: 0.1, color: this.col.light, alpha: H.flash, soft: true, rot: R(0, 6.28) });
    const drops = (n, fn) => { for (let i = 0; i < this.n(Math.round(n * (crit ? 1.3 : 1))); i++) this.drop(p.clone(), fn(), { size: R(0.025, 0.055) * s }); };
    if (kind === 'thrust') {
      const C = H.thrust;
      this.spr2({ p, ...this.seq('burst'), span: 0.75, size: [C.burst[0] * s * 0.9, C.burst[1] * s], life: C.life, color: ink, alpha: 0.75, erode: 0.4, rot: R(0, 6.28), fadeOut: 0.45 });
      // 向前穿出的笔锋：甩墨细丝顺着刺的方向拉长，从接触点往前探出去
      this.spr2({ p: p.clone().addScaledVector(dd, 0.6 * s), v: dd.clone().multiplyScalar(2.2), rect: this.cell('tendril'), mode: 2, u: dd.clone(), w: up.clone().applyAxisAngle(dd, R(-0.6, 0.6)), size: [C.stab[0] * s, C.stab[1] * s], life: C.life, color: ink, alpha: 0.88, erode: 0.35, drag: 3, fadeOut: 0.5 });
      drops(R(C.drops[0], C.drops[1]), () => dd.clone().multiplyScalar(R(4.5, 8.5)).add(_v.set(R(-0.7, 0.7), R(-0.1, 1.0), R(-0.7, 0.7))));
    } else if (kind === 'heavy') {
      const C = H.heavy, g = this.groundAt(p.x, p.z, p.y);
      this.spr2({ p, ...this.seq('burstD'), span: 0.75, size: [C.burst[0] * s * 0.9, C.burst[1] * s], life: C.life, color: ink, alpha: 0.8, erode: 0.45, rot: R(0, 6.28), fadeOut: 0.45 });
      // 地上一大团晕墨（向下砸开），左右各一道甩墨
      if (p.y - g < 2.5) this.spr2({ p: new THREE.Vector3(p.x + dd.x * 0.3, g + 0.04, p.z + dd.z * 0.3), rect: this.cell('blot'), mode: 3, size: [C.splat[0] * s, C.splat[1] * s], life: C.life * 1.3, color: this.lc.deep, alpha: 0.72, erode: 0.45, rot: R(0, 6.28), fadeIn: 0.05, fadeOut: 0.55 });
      for (const sg of [-1, 1]) this.spr2({ p: p.clone().addScaledVector(side, sg * 0.55 * s), v: side.clone().multiplyScalar(sg * 2.5), rect: this.cell('tendril'), mode: 2, u: side.clone().multiplyScalar(sg), w: up.clone(), size: [C.tendril[0] * s, C.tendril[1] * s], life: C.life * 0.85, color: ink, alpha: 0.85, erode: 0.35, drag: 3, gravity: 3, fadeOut: 0.5 });
      drops(R(C.drops[0], C.drops[1]), () => side.clone().multiplyScalar(R(-5, 5)).addScaledVector(dd, R(0.5, 3)).add(_v.set(0, R(0.5, 3.5), 0)));
      for (let i = 0; i < 2; i++) this.spr2({ p: p.clone().add(_v.set(R(-0.4, 0.4), R(-0.3, 0.2), R(-0.4, 0.4))), v: _v.set(R(-0.4, 0.4), R(0.1, 0.5), R(-0.4, 0.4)).clone(), tile: 'wisp', span: 1, size: [1.0, 1.5], life: R(0.45, 0.6), color: this.lc.gray, alpha: 0.16, soft: true, drag: 2, fadeIn: 0.1, fadeOut: 0.5 });
    } else {
      const C = H.slash;
      this.spr2({ p, ...this.seq('burst'), span: 0.75, size: [C.burst[0] * s * 0.9, C.burst[1] * s], life: C.life, color: ink, alpha: 0.75, erode: 0.4, rot: R(0, 6.28), fadeOut: 0.45 });
      for (let i = 0; i < 2; i++) this.spr2({ p: p.clone().addScaledVector(dd, 0.25 + i * 0.25), v: dd.clone().multiplyScalar(R(1.5, 3)), rect: this.cell('tendril'), mode: 2, u: dd.clone(), w: up.clone().applyAxisAngle(dd, R(-1.2, 1.2)), size: [C.tendril[0] * s, C.tendril[1] * s], life: C.life * 0.9, color: ink, alpha: 0.82, erode: 0.35, drag: 3, fadeOut: 0.5 });
      drops(R(C.drops[0], C.drops[1]), () => dd.clone().multiplyScalar(R(2.5, 6)).add(_v.set(R(-1.4, 1.4), R(-0.2, 2.0), R(-1.4, 1.4))));
      this.spr2({ p: p.clone().add(_v.set(0, 0.1, 0)), v: _v.set(R(-0.3, 0.3), R(0.1, 0.4), R(-0.3, 0.3)).clone(), tile: 'wisp', span: 1, size: [0.8, 1.2], life: 0.38, color: this.lc.gray, alpha: 0.15, soft: true, drag: 2, fadeIn: 0.1, fadeOut: 0.5 });
    }
    if (crit) this.spr2({ p: p.clone(), tile: 'ring', size: [0.5, 1.5], life: 0.3, color: ink, alpha: 0.8, erode: 0.4, rot: R(0, 6.28), fadeOut: 0.5 });
    this.stat.hits++;
  }

  // =====================================================================================
  // 拔刀斩：出刀那一刻的月牙带（外沿 = 判定距离、张开 = 判定弧）+ 白光、墨溅、向外飞散的墨点
  // =====================================================================================
  // a：这一刀（a.iaiK 蓄力比例）；range：这一刀的判定距离；arc：判定弧（度）；hitT：判定的动作时刻
  iaiSlash(a, { range, arc = 200, hitT = 0.2 } = {}) {
    const P = this.player, k = a.iaiK ?? 0, C = INK.iai;
    const b = this.bands.find((x) => x.state === 'off') || this.bands[0];
    const half = Math.min(120, arc / 2);
    Object.assign(b, { state: 'sweep', kind: 'iai', act: a, k, range, t: 0, hitT, follow: true, cut: false, u0: (120 - half) / 240, u1: (120 + half) / 240, hold: C.hold, life: pick(C.life, k), white: pick(C.light, k), fxDone: false });
    const U = b.mat.uniforms;
    U.uU0.value = b.u0; U.uU1.value = b.u1; U.uReveal.value = b.u0; U.uAlpha.value = 1; U.uErode.value = 0; U.uWhite.value = b.white; U.uSeed.value = Math.random();
    U.uRectA.value.copy(this.crescent[0]); U.uRectB.value.copy(this.crescent[0]); U.uMix.value = 0;
    this.placeBand(b, P.pos, P.heading);
    b.mesh.visible = true;
    this.stat.bands++;
    return b;
  }
  placeBand(b, pos, heading) {
    const r = b.range;
    b.mesh.position.set(pos.x, pos.y + INK.iai.y, pos.z);
    b.mesh.rotation.set(0, heading, 0);
    b.mesh.scale.set(r, r * INK.iai.flat, r);
    b.heading = heading; b.center = b.mesh.position.clone();
  }
  // 扫开到判定弧的终点时：弧外沿上几团墨溅、向外飞散的墨点、前沿一道白光月牙
  bandFx(b) {
    const k = b.k, C = INK.iai, r = b.range, c = b.center, h = b.heading;
    const at = (deg, rr) => { const t = h + deg * Math.PI / 180; return new THREE.Vector3(c.x + Math.sin(t) * rr, c.y, c.z + Math.cos(t) * rr); };
    const half = (b.u1 - b.u0) * 120;
    const nd = this.n(Math.round(pick(C.drops, k)));
    for (let i = 0; i < nd; i++) {
      const deg = R(-half, half), rr = r * R(0.7, 1.0), p = at(deg, rr), t = h + deg * Math.PI / 180;
      this.drop(p, new THREE.Vector3(Math.sin(t) * R(3, 8), R(0.5, 3), Math.cos(t) * R(3, 8)), { size: R(0.035, 0.07), life: R(0.4, 0.65) });
    }
    const ns = this.n(Math.round(pick(C.splash, k)));
    for (let i = 0; i < ns; i++) {
      const deg = -half + (2 * half) * (i + R(0.2, 0.8)) / ns, p = at(deg, r * R(0.88, 1.0));
      this.spr({ p, tile: 'splash', size: [R(0.9, 1.4) * (1 + 0.4 * k), R(1.1, 1.7) * (1 + 0.4 * k)], life: 0.6, span: 0.44, rot: R(0, 6.28), color: this.col.ink, alpha: 0.9, erode: 0.45, fadeOut: 0.5, delay: R(0, 0.04) });
    }
    for (let i = 0; i < this.n(2 + Math.round(2 * k)); i++) this.mist(at(R(-half, half), r * R(0.55, 0.85)), { size: R(0.9, 1.4), alpha: 0.18, life: R(0.7, 1.0) });
    // 白光月牙（ring02_fire_03 2×2 帧）贴在判定弧的正前方
    const f = new THREE.Vector3(Math.sin(h), 0, Math.cos(h)), rt = new THREE.Vector3(-Math.cos(h), 0, Math.sin(h));
    this.spr({ p: at(0, r * 0.8), tile: 'arcLight', light: true, mode: 2, u: f.clone().negate(), w: rt, size: [r * 1.15, r * 1.6], life: 0.3, span: 1, color: this.col.light, alpha: b.white * 0.85, soft: true, fadeIn: 0.1 });
  }
  updateBand(b, dt) {
    const U = b.mat.uniforms, P = this.player;
    if (b.state === 'off') return;
    if (b.kind === 'iai') {
      const a = b.act, C = INK.iai, t = a.t;
      // 判定之前跟着人走（判定按那一刻人的位置、朝向算）
      if (b.follow) { this.placeBand(b, P.pos, P.heading); if (t >= b.hitT) b.follow = false; }
      if (b.state === 'sweep') {
        const x = smooth(0, 1, (t - C.sweep[0]) / (C.sweep[1] - C.sweep[0]));
        U.uReveal.value = b.u0 + (b.u1 - b.u0) * Math.max(0.04, x);
        if (x >= 1 || a.endReason) {
          if (x >= 1) U.uReveal.value = b.u1;
          else { b.life = INK.ribbon.cancelLife; b.hold = 0; b.cut = true; }       // 扫到一半被打断：已扫开的一段很快碎掉，不放墨溅、墨点
          b.state = 'break'; b.t = 0; b.follow = false;
          if (!b.fxDone && !b.cut) { b.fxDone = true; this.bandFx(b); }
        }
        return;
      }
    } else if (b.kind === 'wave') {
      if (b.state === 'fly') {
        const pr = b.pr;
        b.mesh.position.copy(pr.pos);
        b.mesh.quaternion.setFromUnitVectors(_v.set(0, 0, 1), _w.copy(pr.dir).normalize());
        b.t += dt;
        U.uWhite.value = 0.9 + 0.1 * Math.sin(b.t * 40);
        return;
      }
    }
    if (b.state === 'break') {
      b.t += dt;
      const x = Math.max(0, b.t - b.hold) / b.life;
      if (x >= 1) { b.state = 'off'; b.mesh.visible = false; return; }
      const nf = this.crescent.length - 1, f = Math.min(nf, x * nf * 1.08), fa = Math.floor(f);
      U.uRectA.value.copy(this.crescent[fa]); U.uRectB.value.copy(this.crescent[Math.min(nf, fa + 1)]); U.uMix.value = f - fa;
      U.uAlpha.value = 1 - smooth(0.45, 1, x);
      U.uErode.value = INK.ribbon.erode * smooth(0.1, 1, x);
      U.uWhite.value = b.white * Math.max(0, 1 - b.t / 0.1);
    }
  }
  // 拔刀斩的剑气：墨色月牙随剑气飞
  waveSpawn(pr) {
    const b = this.bands.find((x) => x.state === 'off') || this.bands[this.bands.length - 1];
    const half = INK.wave.arc / 2;
    Object.assign(b, { state: 'fly', kind: 'wave', pr, t: 0, hold: 0, life: 0.3, white: 1, u0: (120 - half) / 240, u1: (120 + half) / 240 });
    const U = b.mat.uniforms, s = pr.radius * INK.wave.scale;
    U.uU0.value = b.u0; U.uU1.value = b.u1; U.uReveal.value = b.u1; U.uAlpha.value = 1; U.uErode.value = 0; U.uWhite.value = 1; U.uSeed.value = Math.random();
    U.uRectA.value.copy(this.crescent[0]); U.uRectB.value.copy(this.crescent[0]); U.uMix.value = 0;
    b.mesh.scale.set(s, s * 0.25, s); b.mesh.visible = true;
    b.mesh.position.copy(pr.pos);
    b.dropAcc = 0;
    return b;
  }
  waveTick(pr, dt) {
    const b = this.bands.find((x) => x.kind === 'wave' && x.pr === pr && x.state === 'fly');
    if (!b) return;
    b.dropAcc += dt * INK.wave.drops * this.q;
    const side = _u.set(-pr.dir.z, 0, pr.dir.x);
    while (b.dropAcc >= 1) {
      b.dropAcc -= 1;
      const p = pr.pos.clone().addScaledVector(side, R(-0.9, 0.9) * pr.radius).add(_v.set(0, R(-0.1, 0.15), 0)).addScaledVector(pr.dir, -R(0.1, 0.5));
      this.drop(p, pr.dir.clone().multiplyScalar(-R(1, 3)).add(_v.set(R(-0.5, 0.5), R(0, 1), R(-0.5, 0.5))), { size: R(0.03, 0.06), life: R(0.3, 0.5), gravity: 6 });
    }
  }
  waveEnd(pr, wall = false) {
    const b = this.bands.find((x) => x.kind === 'wave' && x.pr === pr && x.state === 'fly');
    if (!b) return;
    b.state = 'break'; b.t = 0; b.hold = 0; b.life = wall ? 0.22 : 0.32; b.white = 0.8; b.pr = null;
    if (wall) {
      const p = b.mesh.position.clone();
      this.spr({ p, tile: 'splash', size: [1.0, 1.4], life: 0.5, span: 0.44, rot: R(0, 6.28), color: this.col.ink, alpha: 0.9, erode: 0.45 });
      for (let i = 0; i < this.n(10); i++) this.drop(p.clone(), new THREE.Vector3(R(-4, 4), R(0, 3), R(-4, 4)));
    }
  }

  // =====================================================================================
  // 蓄力
  // =====================================================================================
  // 汇聚的目标：鞘中那把剑的剑柄与鞘口（世界坐标，每帧取）
  targets() {
    const ch = this.player.char, T = INK.charge.target, U = this.chU;
    if (ch.scabbardPoint && ch.sword) { ch.scabbardPoint(T.hilt, U.uHilt.value); ch.scabbardPoint(T.mouth, U.uMouth.value); }
    else { const p = this.player.pos; U.uHilt.value.set(p.x, p.y + 1, p.z); U.uMouth.value.set(p.x, p.y + 1, p.z); }
  }
  chargeBegin() {
    this.gen++;
    this.charge = { gen: this.gen, k: 0, acc: { dot: 0, mist: 0, light: 0, near: 0 }, swirlT: 0.25, t: 0 };
    this.targets();
    // 起势：剑柄处一小团墨
    const p = this.chU.uHilt.value.clone();
    this.spr({ p, tile: 'splat', size: [0.15, 0.32], life: 0.3, color: this.col.ink, alpha: 0.7, erode: 0.4, rot: R(0, 6.28), fadeOut: 0.3 });
  }
  chargeTick(k, dt) {
    const C = this.charge, Q = INK.charge;
    if (!C) return;
    C.k = k; C.t += dt;
    const life = pick(Q.life, k);
    const spawn = (type, n) => {
      for (let i = 0; i < n; i++) {
        const near = type === 'near';
        const pool = type === 'light' ? this.chLight : this.chInk;
        const tile = type === 'dot' ? this.T.dot : type === 'light' ? this.T.soft : this.T.mist;
        const sz = near ? R(Q.near.size[0], Q.near.size[1]) : R(Q.size[type][0], Q.size[type][1]) * (type === 'mist' ? 1 : 1 + 0.4 * k);
        pool.write({
          r: near ? R(Q.near.radius[0], Q.near.radius[1]) : R(Q.radius[0], Q.radius[1]) * (type === 'mist' ? 0.85 : 1),
          th: R(0, Math.PI * 2), h: near ? R(-0.12, 0.2) : R(Q.height[0], Q.height[1]),
          turns: (near ? R(0.4, 0.9) : R(Q.turns[0], Q.turns[1])) * (Math.random() < 0.5 ? -1 : 1) * (1 + 0.5 * k),
          life: near ? Q.near.life : life * (type === 'mist' ? 1.25 : R(0.85, 1.15)),
          size: sz, along: R(0, 1), rect: tile.r,
          color: type === 'light' ? this.col.light : type === 'dot' ? this.col.ink : this.col.mist,
          alpha: type === 'light' ? R(0.6, 0.95) * (0.65 + 0.35 * k) : type === 'dot' ? R(0.8, 1) : near ? 0.3 : 0.24,
          gen: C.gen, soft: type !== 'dot', rot: R(0, 6.28), spin: R(-1.5, 1.5),
          stretch: type === 'dot' || type === 'light' ? Q.stretch : 0,
        }, this.now);
        this.stat.chargeSpawned++;
      }
    };
    for (const type of ['dot', 'mist', 'light']) {
      C.acc[type] += dt * pick(Q.rate[type], k) * this.q;
      const n = Math.floor(C.acc[type]); C.acc[type] -= n; spawn(type, n);
    }
    C.acc.near += dt * pick(Q.near.rate, k) * this.q;
    { const n = Math.floor(C.acc.near); C.acc.near -= n; spawn('near', n); }
    // 弯带子
    C.swirlT -= dt;
    if (C.swirlT <= 0) { C.swirlT = pick(Q.swirl.every, k) * R(0.8, 1.2); this.swirl(1); }
  }
  chargeLevel(lv, full) {
    this.swirl(INK.charge.swirl.burst + (full ? 1 : 0));
    const p = this.chU.uMouth.value.clone();
    this.spr({ p, tile: 'star', light: true, size: [0.2, 0.5 + 0.15 * lv], life: 0.22, color: this.col.light, alpha: 0.5 + 0.15 * lv, soft: true, rot: R(0, 6.28) });
    if (full) {
      // 蓄满：脚下一圈墨（ink_06 一笔圆）
      const P = this.player.pos, g = this.groundAt(P.x, P.z, P.y + 1);
      this.spr({ p: new THREE.Vector3(P.x, g + 0.05, P.z), tile: 'enso', mode: 3, size: [1.6, 2.3], life: 0.75, color: this.col.mist, alpha: 0.5, erode: 0.5, rot: R(0, 6.28), fadeIn: 0.12, fadeOut: 0.45 });
    }
  }
  // 停：released 出刀（快）/ 否则取消、受击打断、力竭（已有的原地散开）
  chargeEnd(released) {
    if (!this.charge) return;
    const U = this.chU;
    U.uStopGen.value = this.charge.gen; U.uStopT.value = this.now; U.uFade.value = released ? INK.charge.fadeRelease : INK.charge.fade;
    this.charge = null;
    for (const s of this.swirls) if (s.busy) s.fadeOut = released ? 0.06 : 0.15;
  }
  swirl(n) {
    const Q = INK.charge.swirl;
    for (let i = 0; i < n; i++) {
      const s = this.swirls.find((x) => !x.busy) || this.swirls.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
      s.busy = true; s.t = 0; s.life = Q.life * R(0.9, 1.15); s.fadeOut = 0; s.fo = 0;
      // 带子从剑柄（原点）伸向身边：方位随机、略朝上，绕自身轴随机翻
      s.q.setFromEuler(new THREE.Euler(R(-0.5, 0.9), R(0, Math.PI * 2), R(-0.6, 0.6), 'YXZ'));
      s.s = R(Q.len[0], Q.len[1]);
      s.m.visible = true;
      this.stat.swirls++;
    }
  }
  updateCharge(dt, camera) {
    const U = this.chU;
    U.uTime.value = this.now;
    this.targets();
    // 弯带子
    for (const s of this.swirls) {
      if (!s.busy) continue;
      s.t += dt;
      const x = s.t / s.life;
      let a = 1;
      if (s.fadeOut > 0) { s.fo = (s.fo ?? 0) + dt; a = Math.max(0, 1 - s.fo / s.fadeOut); }
      if (x >= 1 || a <= 0) { s.busy = false; s.m.visible = false; s.fo = 0; continue; }
      const mu = s.m.material.uniforms;
      mu.uOff.value = -1 + 2 * x;
      mu.uAlpha.value = a * 0.85;
      _v.lerpVectors(U.uHilt.value, U.uMouth.value, 0.5);
      s.m.position.copy(_v); s.m.quaternion.copy(s.q); s.m.scale.set(s.s, s.s * INK.charge.swirl.thin, s.s);
    }
    // 鞘口细亮边：顺着鞘的轴、绕轴转向镜头
    const C = this.charge, G = INK.charge.glint;
    const want = C ? pick(G.k, C.k) * (0.85 + 0.15 * Math.sin(this.now * 23) * Math.sin(this.now * 7.3)) : 0;
    this.glintK += (want - this.glintK) * Math.min(1, dt / (C ? 0.12 : 0.06));
    if (this.glintK > 0.01 && camera) {
      const a = U.uHilt.value, b = U.uMouth.value, ax = _u.subVectors(b, a).normalize(), mid = _v.copy(b).addScaledVector(ax, G.len * G.shift);
      const vd = _w.subVectors(camera.position, mid).normalize(), side = new THREE.Vector3().crossVectors(ax, vd).normalize();
      const nrm = new THREE.Vector3().crossVectors(ax, side);
      _m.makeBasis(ax.clone().multiplyScalar(G.len), side.multiplyScalar(G.width), nrm);
      _m.setPosition(mid);
      this.glint.matrix.copy(_m); this.glint.matrixWorldNeedsUpdate = true;
      this.glint.material.uniforms.uK.value = this.glintK * G.gain;
      this.glint.visible = true;
      // 蓄满：鞘口不时一闪
      if (C && C.k >= 1) { C.flashT = (C.flashT ?? 0) - dt; if (C.flashT <= 0) { C.flashT = G.pulse; this.spr({ p: b.clone(), tile: 'star', light: true, size: [0.12, 0.42], life: 0.16, color: this.col.light, alpha: 0.75, soft: true, rot: R(0, 6.28) }); } }
    } else this.glint.visible = false;
    this.chInk.gen = this.chLight.gen = this.gen; this.chInk.flush(this.now); this.chLight.flush(this.now);
  }

  // =====================================================================================
  // 每帧
  // =====================================================================================
  update(dt, camera) {
    this.now += dt;
    for (const r of this.ribbons) if (r.state !== 'off') this.updateRibbon(r, dt, camera);
    for (const b of this.bands) this.updateBand(b, dt);
    for (const hx of this.helices) this.updateHelix(hx, dt);
    this.updateCharge(dt, camera);
    this.ink.flush(this.now); this.light.flush(this.now); this.ink2?.flush(this.now); this.ink3?.flush(this.now); this.light3?.flush(this.now);
  }
  // 力竭、重试、过场：一切停下——带子与月牙带快速碎开，蓄力原地散开（fast：立刻全收，换场景用）
  clear(fast = false) {
    this.chargeEnd(false);
    for (const r of this.ribbons) {
      if (r.state === 'off') continue;
      if (fast || r.n < 2) { r.state = 'off'; r.mesh.visible = false; continue; }
      if (r.state !== 'break') { r.state = 'break'; r.t = 0; r.hold = 0; }
      r.life = Math.min(r.life ?? 1, INK.ribbon.cancelLife); r.t = Math.max(r.t, r.hold);
    }
    for (const b of this.bands) {
      if (b.state === 'off') continue;
      if (fast) { b.state = 'off'; b.mesh.visible = false; continue; }
      b.state = 'break'; b.t = 0; b.hold = 0; b.life = 0.18; b.follow = false; b.pr = null;
    }
    if (fast) {
      this.ink.kill(); this.light.kill(); this.ink2?.kill(); this.ink3?.kill(); this.light3?.kill();
      this.chU.uStopGen.value = this.gen; this.chU.uStopT.value = -1e9;
      for (const s of this.swirls) { s.busy = false; s.m.visible = false; }
      this.glintK = 0; this.glint.visible = false;
    }
    for (const hx of this.helices) { hx.state = 'off'; hx.mesh.visible = false; }
  }
  moveTo(scene) {
    this.scene = scene;
    for (const o of this.meshes()) scene.add(o);
    this.clear(true);
  }
  meshes() { return [this.ink.mesh, this.light.mesh, ...(this.ink2 ? [this.ink2.mesh] : []), ...(this.ink3 ? [this.ink3.mesh, this.light3.mesh] : []), ...this.ribbons.map((r) => r.mesh), ...this.bands.map((b) => b.mesh), this.chInk.mesh, this.chLight.mesh, ...this.swirls.map((s) => s.m), this.glint, ...this.helices.map((h) => h.mesh)]; }
  // 预编译：所有材质先在当前场景里编好（第一次挥剑、蓄力时不卡）
  prewarm(renderer, camera, scene) {
    const list = this.meshes(), keep = list.map((o) => o.visible);
    list.forEach((o) => { o.visible = true; });
    try { renderer.compile(scene || this.scene, camera); } finally { list.forEach((o, i) => { o.visible = keep[i]; }); }
  }
  // 自检：此刻还在的东西
  census() {
    return { ribbons: this.ribbons.filter((r) => r.state !== 'off').length, ribbonStates: this.ribbons.map((r) => r.state).join(','), bands: this.bands.filter((b) => b.state !== 'off').length,
      ink: this.ink.alive(this.now), light: this.light.alive(this.now), ink2: this.ink2 ? this.ink2.alive(this.now) : 0, ink3: this.ink3 ? this.ink3.alive(this.now) + this.light3.alive(this.now) : 0, charge: this.chInk.alive(this.now) + this.chLight.alive(this.now),
      chargeLive: this.chargeLive(), swirls: this.swirls.filter((s) => s.busy).length, glint: +this.glintK.toFixed(3), charging: !!this.charge, helices: this.helices.filter((h) => h.state !== 'off').length };
  }
  // 还在往里收的蓄力粒子（停下的那一轮在散，不算）
  chargeLive() {
    let n = 0;
    for (const P of [this.chInk, this.chLight]) for (let i = 0; i < P.cap; i++) {
      if (P.die[i] <= this.now) continue;
      if (P.attr.iE.array[i * 4] <= this.chU.uStopGen.value) continue;           // 停下的那一轮：在散，不算
      n++;
    }
    return n;
  }
}

// 根运动（clip.userData.root）在 t 时刻的前进量
function rootZ(R, t) {
  const T = R.times, n = T.length;
  if (t <= T[0]) return R.z[0];
  if (t >= T[n - 1]) return R.z[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
  return R.z[lo] + (R.z[hi] - R.z[lo]) * (t - T[lo]) / (T[hi] - T[lo]);
}
