// 建筑构造器（改编自 demo/src/world/structures/builder.js）：
// 所有构件按材质合并成少量网格并自动生成碰撞体。材质 = 顶点色（统一色板）× 实拍贴图细节（Poly Haven CC0：毛石墙、粉墙、红墙、
// 木纹、灰瓦、石材颗粒，三向投影取明暗与法线，颜色仍由色板决定）+ 程序化细节（瓦垄、檐口、风化斑）。
// 门窗格栅为带 mipmap 的格心贴图（常用距离清楚、远处不闪），夜里窗纸透出暖光。
// 每栋建筑可拥有独立的淡化 uniform，镜头被遮挡时整栋有序抖动淡化（阴影保留）。
import * as THREE from 'three';
import { NOISE_GLSL, applyFade, FOGU } from '../shaderlib.js';
import { ASSETS } from '../assets.js';

// aGrain：构件的长轴（木纹方向）。0–1 为水平方向角 / π，2 为竖直；箱体另加 4（用于棱边磨损）
const V_PARS = 'varying vec3 vBW; varying vec2 vRUv; varying vec3 vBN; attribute float aGrain; varying vec3 vGrainDir; varying float vGrainRaw;';
const V_BODY = `
  vec4 bwp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    bwp = instanceMatrix * bwp;
  #endif
  vBW = (modelMatrix * bwp).xyz; vRUv = uv; vBN = normalize(mat3(modelMatrix) * objectNormal);
  { float gr = aGrain, gb = step(3.5, gr), gg = gr - 4. * gb;
    vec3 ga = gg > 1.5 ? vec3(0., 1., 0.) : vec3(cos(gg * 3.14159265), 0., sin(gg * 3.14159265));
    vGrainDir = normalize(mat3(modelMatrix) * ga); vGrainRaw = gr; }`;
const F_PARS = 'varying vec3 vBW; varying vec2 vRUv; varying vec3 vBN; varying vec3 vGrainDir; varying float vGrainRaw;';

const BUMP_FN = /* glsl */ `
  vec3 archBump(vec3 sp, vec3 n, vec2 dh, float fd){
    vec3 sx = dFdx(sp), sy = dFdy(sp);
    vec3 R1 = cross(sy, n), R2 = cross(n, sx);
    float det = dot(sx, R1) * fd;
    vec3 r = abs(det) * n - sign(det) * (dh.x * R1 + dh.y * R2);
    float l = length(r);
    return l > 1e-8 ? r / l : n;
  }
  float lumA(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
  // 三向投影：贴图在世界坐标下按法线混合（s 为每米重复次数）
  vec3 triTex(sampler2D t, float s){
    vec3 w = pow(abs(vBN), vec3(4.)); w /= w.x + w.y + w.z;
    return texture2D(t, vBW.zy * s).rgb * w.x + texture2D(t, vBW.xz * s).rgb * w.y + texture2D(t, vBW.xy * s).rgb * w.z;
  }
  vec3 triNrm(sampler2D t, float s){
    vec3 w = pow(abs(vBN), vec3(4.)); w /= w.x + w.y + w.z;
    vec3 nx = texture2D(t, vBW.zy * s).xyz * 2. - 1., ny = texture2D(t, vBW.xz * s).xyz * 2. - 1., nz = texture2D(t, vBW.xy * s).xyz * 2. - 1.;
    nx = vec3(nx.xy + vBN.zy, abs(nx.z) * vBN.x); ny = vec3(ny.xy + vBN.xz, abs(ny.z) * vBN.y); nz = vec3(nz.xy + vBN.xy, abs(nz.z) * vBN.z);
    return normalize(nx.zyx * w.x + ny.xzy * w.y + nz.xyz * w.z);
  }`;

// 各类材质的片元细节（HAS_DET：有实拍细节贴图 tDet；HAS_DETN：有法线 tDetN；aNw 为法线贴图强度）
const KIND = {
  // 粉墙、红墙、彩画梁枋：抹灰的颗粒与水渍（红色系混入风化红墙的斑驳）
  std: `
    vec2 q = mod(vBW.xz + vBW.y * vec2(.71, .37), 2048.);
    float nA = nzf(q * .45), nB = nzv(q * 3.3);
    #ifdef HAS_DET
      float red = smoothstep(.12, .3, diffuseColor.r - diffuseColor.g);
      float dl = mix(lumA(triTex(tDet, .5)) / .62, lumA(triTex(tDet2, .5)) / .5, red);
      diffuseColor.rgb *= mix(1., clamp(dl, .6, 1.3), .55) * (.94 + .1 * nA);
      aNw = .35;
    #else
      diffuseColor.rgb *= .9 + .14 * nA + .05 * nB;
    #endif`,
  // 木作：木纹沿构件长轴（柱竖纹、梁枋横纹、斜撑顺斜向）；端面年轮；箱体棱边的漆面有少量磨损（露出浅色底）
  wood: `
    vec3 gdir = normalize(vGrainDir), wn = normalize(vBN);
    vec3 acr = cross(wn, gdir); float acl = length(acr);
    vec3 acn = acl > .25 ? acr / acl : normalize(cross(wn, abs(wn.y) < .9 ? vec3(0., 1., 0.) : vec3(1., 0., 0.)));
    float along = dot(vBW, gdir), across = dot(vBW, acn), endG = smoothstep(.8, .95, abs(dot(wn, gdir)));
    float g = nzv(vec2(across * 9., along * .9)) * .6 + nzv(vec2(across * 31., along * 3.)) * .4;
    float ring = .5 + .5 * sin(length(vec2(across, dot(vBW, cross(gdir, acn)))) * 60. + nzv(vBW.xz * 3.) * 4.);
    #ifdef HAS_DET
      float wl = lumA(texture2D(tDet, vec2(across * .7, along * .16) + floor(vec2(along * .05, 0.)) * .37).rgb) / .3;
      diffuseColor.rgb *= mix(1., clamp(wl, .55, 1.4), .5 * (1. - endG)) * (.9 + .14 * g) * mix(1., .82 + .22 * ring, endG);
      aNw = .45 * (1. - endG);
    #else
      diffuseColor.rgb *= (.84 + .24 * g) * mix(1., .82 + .22 * ring, endG);
      aBump = g * .012;
    #endif
    {
      float isBox = step(3.5, vGrainRaw);
      vec2 e2 = min(vRUv, 1. - vRUv);
      float edge = mix(min(vRUv.y, 1. - vRUv.y), min(e2.x, e2.y), isBox);
      float wn2 = nzv(vec2(along * 6.5 + 3.1, across * 6.5));
      float wear = (1. - smoothstep(.0, .028, edge)) * smoothstep(.5, .78, wn2) * step(.3, max(diffuseColor.r - diffuseColor.b, 0.) + .3);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.92, .86, .8) + vec3(.035, .025, .015), wear * .7);
    }`,
  // 石作：毛石墙 / 条石（实拍贴图的块石与灰缝），石色由色板决定；表面风化斑与底部苔痕
  stone: `
    vec2 q = mod(vBW.xz + vBW.y * vec2(.71, .37), 2048.);
    float nA = nzf(q * .3), nB = nzv(q * 2.7);
    float side = 1. - abs(vBN.y);
    #ifdef HAS_DET
      vec3 st = triTex(tDet, uDetS);
      float sl = lumA(st) / uDetMean;
      diffuseColor.rgb *= mix(1., clamp(sl, .45, 1.45), uDetK) * (.9 + .16 * nA);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.82, .92, .74), smoothstep(.6, .88, nA) * side * .4 * uDetK);
      aNw = uDetK * .8;
      if (uSeam > 0.) {
        // 暖白石的板缝：顶面 1.2 × 0.8 米错缝，侧面 0.6 米一层；缝色偏向石缝暗色，远处按像素尺寸淡出
        vec3 an = abs(vBN);
        vec2 sp = an.y > .7 ? vBW.xz / vec2(1.2, .8) : vec2((an.x > an.z ? vBW.z : vBW.x) / 1.1, vBW.y / .6);
        sp.x += mod(floor(sp.y), 2.) * .5;
        vec2 sf = fract(sp), sfw = max(fwidth(sp), vec2(1e-4));
        float seam = (1. - smoothstep(0., 1.5, min(sf.x, 1. - sf.x) / sfw.x)) + (1. - smoothstep(0., 1.5, min(sf.y, 1. - sf.y) / sfw.y));
        seam = clamp(seam, 0., 1.) * (1. - smoothstep(.06, .2, max(sfw.x, sfw.y)));
        float tone = nzh(floor(sp) + 5.3);
        diffuseColor.rgb *= .95 + .08 * tone;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.78, .81, .78), seam * uSeam);
        aBump -= seam * .01 * uSeam;
      }
    #else
      vec2 bq = vec2((abs(vBN.x) > abs(vBN.z) ? vBW.z : vBW.x) / 1.1, vBW.y / .48);
      bq.x += mod(floor(bq.y), 2.) * .5;
      vec2 bf = fract(bq);
      float jt = (1. - smoothstep(.0, .045, min(bf.x, 1. - bf.x) * 1.1)) + (1. - smoothstep(.0, .06, min(bf.y, 1. - bf.y) * .48 * 2.));
      jt = clamp(jt, 0., 1.) * side * uJoint * smoothstep(.7, .25, max(fwidth(bq.x), fwidth(bq.y)));
      float tint = nzh(floor(bq) + 3.1);
      diffuseColor.rgb *= (.8 + .26 * nA + .07 * nB) * (.93 + .1 * tint * side) * (1. - jt * .42);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.78, .9, .7), smoothstep(.55, .85, nA) * side * .5);
      aBump = nB * .035 + nA * .05 - jt * .05;
    #endif`,
  // 瓦：沿 uv.x 的筒瓦垄、沿 uv.y 的瓦行（程序化，保证中式筒瓦的轮廓），叠加实拍灰瓦的风化与法线；远处以平均色代替防闪
  roof: `
    float g = abs(fract(vRUv.x / .3) - .5) * 2.;
    float rib = smoothstep(.42, .95, g);
    float course = smoothstep(.82, 1., fract(vRUv.y / .26));
    float rfw = max(fwidth(vRUv.x / .3), fwidth(vRUv.y / .26));
    float raa = smoothstep(.25, .7, rfw);
    rib = mix(rib, .45, raa); course = mix(course, .1, raa);
    vec2 q = mod(vBW.xz, 2048.);
    float dirt = nzf(q * .35);
    diffuseColor.rgb *= (.62 + .46 * (1. - rib)) * (1. - .18 * course) * (.9 + .16 * nzv(q * 1.7)) * (.92 + .12 * dirt);
    {
      // 瓦片变化：按单块瓦（垄 × 行）取值，约一成是后来换上的新瓦（偏向 #526774），成行成片而非噪点
      vec2 tid = floor(vec2(vRUv.x / .3, vRUv.y / .26));
      float h1 = nzh(tid + 7.1), h2 = nzh(floor(tid / vec2(3., 4.)) + 2.9);
      float newTile = step(.9, h1) + step(.86, h2) * step(.55, h1);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.19, 1.17, 1.13), clamp(newTile, 0., 1.) * (1. - raa) * .85);
    }
    #ifdef HAS_DET
      float rl = lumA(texture2D(tDet, vRUv / 3.).rgb) / .32;
      diffuseColor.rgb *= mix(1., clamp(rl, .6, 1.35), .4 * (1. - raa));
      aNw = .45 * (1. - raa);
    #endif
    aBump = (1. - rib) * .07 - course * .018;`,
  // 窗：格心贴图（米为单位 uv，0.5 米一个图案单元）；夜里窗纸透光
  window: `
    #ifdef HAS_LAT
      vec4 lat = texture2D(tLat, vRUv * 2.);
      vec3 paper = diffuseColor.rgb * (.92 + .08 * nzv(vRUv * 9.));
      diffuseColor.rgb = mix(paper, uFrame, lat.r);
      aBump = lat.r * .02;
      // 夜里窗纸透光：每间屋（约 2 米一格）明暗不一，棂条始终压暗（窗格不被光吞掉）
      float room = nzh(floor(vBW.xz * .5) + floor(vBW.y * .35) * 7.1);
      aGlow = (1. - lat.r) * (1. - lat.r) * uNight * uNightK * (.6 + .5 * room);
      aDay = (1. - lat.r) * (1. - lat.r) * uDayLit;          // 室内一侧：白天窗纸透进天光（只有问道殿室内的材质设了 uDayLit）
    #else
      vec2 wg = vRUv / .25, wfw = max(fwidth(wg), vec2(1e-4));
      vec2 c = fract(wg), bb = smoothstep(.1 - wfw, .1 + wfw, c);
      float bar = mix(1. - bb.x * bb.y, .19, smoothstep(.3, .8, max(wfw.x, wfw.y)));
      diffuseColor.rgb = mix(diffuseColor.rgb, uFrame, bar);
      aGlow = (1. - bar) * uNight * uNightK;
      aDay = (1. - bar) * uDayLit;
    #endif`,
  // 藻井 / 彩画格
  coffer: `
    vec2 c = fract(vRUv / 2.2), d = abs(c - .5);
    float line = 1. - step(max(d.x, d.y), .43);
    float ring = smoothstep(.04, 0., abs(length(c - .5) - .26));
    vec3 col = mix(vec3(.10, .22, .26), vec3(.12, .26, .2), step(.5, fract((floor(vRUv.x / 2.2) + floor(vRUv.y / 2.2)) * .5)));
    col = mix(col, vec3(.7, .55, .25), max(line, ring));
    diffuseColor.rgb = col;`,
  // 茅草
  thatch: `
    vec2 q = mod(vBW.xz, 2048.);
    float s = nzv(vec2(vRUv.x * 30., vRUv.y * 3.)) * .6 + nzv(q * 4.) * .4;
    diffuseColor.rgb *= .72 + .4 * s;
    aBump = s * .05;`,
  glow: '',
  // 彩画（额枋、平板枋上的旋子彩画）：贴图一个单元 2.4 米，uv.x 以米计、uv.y 为 0–1；顶点色作整体色调
  caihua: `
    #ifdef HAS_CAI
      vec3 ct = texture2D(tCai, vec2(vRUv.x / 2.4, vRUv.y)).rgb;
      float cfw = fwidth(vRUv.x / 2.4) * 256.;
      ct = mix(ct, vec3(.11, .19, .2), smoothstep(1.5, 5., cfw) * .5);
      diffuseColor.rgb = ct * diffuseColor.rgb * 1.25;
    #endif`,
};

const EMIT = {
  glow: 'totalEmissiveRadiance += vColor * (.55 + uNight * 1.6);',
  jade: 'totalEmissiveRadiance += vColor * (.04 + uNight * .3);',          // 第九轮：白天只留一点玉质透光（不再整片发青光），入夜微亮
  window: 'totalEmissiveRadiance += vec3(1., .72, .42) * aGlow * .3 + vec3(.95, .94, .88) * aDay;',
  trim: 'totalEmissiveRadiance += vec3(1., .72, .42) * aGlow * .3;',
};

// 第十二轮：素材古建贴图（assets/buildings/01.fbx 的手绘贴图，随 buildings.glb 载入）里的横条（瓦垄、封檐板、椽头、
// 栏板、彩画额枋、隔扇门窗……）。trim 参数：tex 贴图名；R 循环取样的像素框 [x0, y0, x1, y1]（自左上起）；
// B（可选）底边一行（如檐口带瓦当的一行），自 uv.y = 0 起 bh 米只取一次，其上才按 R 循环；
// u 横向每多少米一个循环；v 纵向每多少米一个循环（0：整面按 uv.y 0–1 铺满一次，配合 uvScale 的纵向 1）；glow：夜里亮处透灯光；
// k 亮度倍数（缺省 1.16）；far 远看时夜里墙面的均匀暖光（缺省 0，第十三轮通天塔用）
let TRIM_TEX = null;
function trimTexture(name) {
  if (!TRIM_TEX) {
    const src = ASSETS.models.buildings?.scene;
    if (!src) return null;
    TRIM_TEX = {};
    src.traverse((o) => { if (o.isMesh) for (const mm of [].concat(o.material)) if (mm.map?.name) TRIM_TEX[mm.map.name] = mm.map; });
  }
  return TRIM_TEX[name] || null;
}
const TRIM_GLSL = /* glsl */ `
  #ifdef HAS_TRIM
  {
    float ty = vRUv.y, bh = uTrimP.z, fv, sv;
    vec4 R;
    if (ty < bh) { R = uTrimB; fv = ty / bh; sv = bh; }
    else if (uTrimP.y > 0.) { R = uTrimR; fv = fract((ty - bh) / uTrimP.y); sv = uTrimP.y; }
    else { R = uTrimR; fv = clamp(ty, 0., 1.); sv = 1.; }
    float fu = fract(vRUv.x / uTrimP.x);
    // glTF 贴图 v 自上而下：条带下沿（fv = 0）对应 R.w
    vec2 tuv = vec2(mix(R.x, R.z, fu), mix(R.w, R.y, fv));
    vec2 k = vec2((R.z - R.x) / uTrimP.x, (R.y - R.w) / sv);
    vec3 tc = textureGrad(tTrim, tuv, dFdx(vRUv) * k, dFdy(vRUv) * k).rgb * uTrimK;    // 手绘贴图自带暗部，与第十轮素材建筑同样提亮
    diffuseColor.rgb = tc;
    #ifdef TRIM_GLOW
      aGlow = smoothstep(.42, .72, dot(tc, vec3(.299, .587, .114))) * uNight * uNightK;
      // 远看（贴图的 mip 把窗纸的亮处平均掉了）：按距离补一层均匀的暖光，夜里整层墙身像点着灯（只有设了 far 的材质）
      aGlow = max(aGlow, uTrimFar * uNight * uNightK * smoothstep(50., 240., length(vViewPosition)));
    #endif
  }
  #endif`;

// 细节贴图：名称 → [漫反射, 法线, 每米重复, 亮度均值, 强度]
const DET = {
  plaster: ['plaster_d', 'plaster_n', 0.5, 0.62, 1], wood: ['wood_d', 'wood_n', 0.7, 0.3, 1], wallstone: ['wallstone_d', 'wallstone_n', 1 / 1.9, 0.42, 0.9],
  grain: ['rock_d', 'rock_n', 0.3, 0.42, 0.45], patina: ['mossrock_d', null, 0.6, 0.42, 0.55], roof: ['roof_d', 'roof_n', 1 / 3, 0.32, 1],
};
function archMaterial(kind, params = {}, emitKind = null, fade = null, det = null) {
  const { joint = 1, seam = 0, trim = null, ...rest } = params;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, ...rest });
  const frag = (KIND[kind] ?? '') + (trim ? TRIM_GLSL : '');
  const emit = (EMIT[emitKind || kind] || '');
  // 着色器变体的标识：编译前（customProgramCacheKey）与编译时（onBeforeCompile）按同一份现状算——
  // 以前只在 onBeforeCompile 里赋值，第一次编译用的是空标识，之后每逢要换着色器（如入夜多了点光）都对不上缓存、白编一遍
  const keyOf = () => {
    const T = ASSETS.tex, d = det && DET[det], lowQ = ASSETS.lo;
    const hasDet = !!(d && T[d[0]]), hasN = !!(hasDet && d[1] && T[d[1]] && !lowQ);
    const hasLat = kind === 'window' && !!latticeTexture();
    const hasCai = kind === 'caihua' && !!caihuaTexture();
    const tt = trim ? trimTexture(trim.tex) : null;
    return `${hasDet ? 'd' : ''}${hasN ? 'n' : ''}${hasLat ? 'l' : ''}${hasCai ? 'c' : ''}${tt ? 't' + (trim.glow ? 'g' : '') : ''}`;
  };
  m.onBeforeCompile = (sh) => {
    const T = ASSETS.tex, d = det && DET[det], lowQ = ASSETS.lo;
    const hasDet = !!(d && T[d[0]]), hasN = !!(hasDet && d[1] && T[d[1]] && !lowQ);
    const hasLat = kind === 'window' && !!latticeTexture();
    const hasCai = kind === 'caihua' && !!caihuaTexture();
    const tt = trim ? trimTexture(trim.tex) : null;
    if (tt) {
      // 像素框向内收 2 像素，免得取样渗到图集里相邻的块
      const W = tt.image.width, H = tt.image.height, box = (q) => new THREE.Vector4((q[0] + 2) / W, (q[1] + 2) / H, (q[2] - 2) / W, (q[3] - 2) / H);
      sh.uniforms.tTrim = { value: tt };
      sh.uniforms.uTrimR = { value: box(trim.R) };
      sh.uniforms.uTrimB = { value: box(trim.B || trim.R) };
      sh.uniforms.uTrimP = { value: new THREE.Vector3(trim.u, trim.v || 0, trim.B ? trim.bh : 0) };
      sh.uniforms.uTrimK = { value: trim.k ?? 1.16 };
      sh.uniforms.uTrimFar = { value: trim.far ?? 0 };
    }
    sh.uniforms.uFrame = { value: new THREE.Color(0x4e2b21) };
    sh.uniforms.uJoint = { value: joint };
    sh.uniforms.uSeam = { value: seam };
    sh.uniforms.uNight = FOGU.uNight;
    sh.uniforms.uDayLit = (m.userData.dayLit ||= { value: 0 });     // 窗纸白天透光（宗门里为 0；问道殿室内按天色设）
    sh.uniforms.uNightK = (m.userData.nightK ||= { value: 1 });     // 夜里窗纸透出的灯光（宗门里为 1；殿内看外墙的窗纸，外面是黑夜，取小值）
    if (hasDet) {
      sh.uniforms.tDet = { value: T[d[0]] };
      sh.uniforms.tDet2 = { value: T.redplaster_d || T[d[0]] };
      sh.uniforms.uDetS = { value: d[2] }; sh.uniforms.uDetMean = { value: d[3] }; sh.uniforms.uDetK = { value: d[4] };
    }
    if (hasN) sh.uniforms.tDetN = { value: T[d[1]] };
    if (hasLat) sh.uniforms.tLat = { value: latticeTexture() };
    if (hasCai) sh.uniforms.tCai = { value: caihuaTexture() };
    const defs = `${hasDet ? '#define HAS_DET\n' : ''}${hasN ? '#define HAS_DETN\n' : ''}${hasLat ? '#define HAS_LAT\n' : ''}${hasCai ? '#define HAS_CAI\n' : ''}${tt ? '#define HAS_TRIM\n' : ''}${tt && trim.glow ? '#define TRIM_GLOW\n' : ''}`;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${V_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${V_BODY}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${defs}uniform vec3 uFrame; uniform float uJoint; uniform float uSeam; uniform float uNight; uniform float uDayLit; uniform float uNightK;
        #ifdef HAS_DET
          uniform sampler2D tDet, tDet2; uniform float uDetS, uDetMean, uDetK;
        #endif
        #ifdef HAS_DETN
          uniform sampler2D tDetN;
        #endif
        #ifdef HAS_LAT
          uniform sampler2D tLat;
        #endif
        #ifdef HAS_CAI
          uniform sampler2D tCai;
        #endif
        #ifdef HAS_TRIM
          uniform sampler2D tTrim; uniform vec4 uTrimR, uTrimB; uniform vec3 uTrimP; uniform float uTrimK, uTrimFar;
        #endif
        ${F_PARS}\n${NOISE_GLSL}\n${BUMP_FN}\nfloat aBump; float aNw; float aGlow; float aDay;`)
      .replace('#include <color_fragment>', `#include <color_fragment>\naBump = 0.; aNw = 0.; aGlow = 0.; aDay = 0.;\n${frag}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = archBump(-vViewPosition, normal, vec2(dFdx(aBump), dFdy(aBump)), faceDirection);
        #ifdef HAS_DETN
          if (aNw > .01) {
            ${kind === 'roof' ? `vec3 rn = texture2D(tDetN, vRUv / 3.).xyz * 2. - 1.; rn.xy *= .7;
            vec3 dp1 = dFdx(-vViewPosition), dp2 = dFdy(-vViewPosition); vec2 du1 = dFdx(vRUv), du2 = dFdy(vRUv);
            vec3 p2 = cross(dp2, normal), p1 = cross(normal, dp1);
            vec3 Tt = p2 * du1.x + p1 * du2.x, Bt = p2 * du1.y + p1 * du2.y;
            float im = inversesqrt(max(max(dot(Tt, Tt), dot(Bt, Bt)), 1e-12));
            normal = normalize(mix(normal, normalize(mat3(Tt * im, Bt * im, normal) * rn), clamp(aNw, 0., 1.)));` :
            `vec3 tn = normalize((viewMatrix * vec4(triNrm(tDetN, ${kind === 'stone' ? 'uDetS' : kind === 'wood' ? '.7' : '.5'}), 0.)).xyz);
            normal = normalize(mix(normal, tn * faceDirection, clamp(aNw, 0., 1.)));`}
          }
        #endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${emit}`);
    if (fade === 'batch') applyFade(sh, { fadeArr: FADE_V });
    else applyFade(sh, { fade });
  };
  m.customProgramCacheKey = () => `arch-${kind}-${emitKind || ''}-${det || ''}-${fade === 'batch' ? 'b' : fade ? 'f' : 'n'}-${keyOf()}`;
  return m;
}

// 格心贴图（步步锦）：0.5 米一个单元，R = 棂条；绘于画布，带 mipmap，远处自然平均，不闪
let LAT = null;
function latticeTexture() {
  if (LAT) return LAT;
  if (typeof document === 'undefined') return null;
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#fff';
  const bar = (x, y, w, h) => g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  const t = 12;                                 // 棂条宽（像素）：加粗，中景（三四十米）夜里也看得出窗格
  bar(0, 0, S, t / 2); bar(0, S - t / 2, S, t / 2); bar(0, 0, t / 2, S); bar(S - t / 2, 0, t / 2, S);
  // 步步锦：外框内两重回字，四角以短棂相接
  const ring = (m) => { bar(m, m, S - 2 * m, t); bar(m, S - m - t, S - 2 * m, t); bar(m, m, t, S - 2 * m); bar(S - m - t, m, t, S - 2 * m); };
  ring(S * 0.18); ring(S * 0.36);
  bar(S / 2 - t / 2, 0, t, S * 0.18); bar(S / 2 - t / 2, S * 0.82, t, S * 0.18);
  bar(0, S / 2 - t / 2, S * 0.18, t); bar(S * 0.82, S / 2 - t / 2, S * 0.18, t);
  for (const [x, y] of [[0.18, 0.18], [0.82, 0.18], [0.18, 0.82], [0.82, 0.82]]) { bar(S * x - t / 2, S * y - S * 0.18 * (y < 0.5 ? 1 : 0), t, S * 0.18); }
  LAT = new THREE.CanvasTexture(cv);
  LAT.wrapS = LAT.wrapT = THREE.RepeatWrapping;
  LAT.colorSpace = THREE.NoColorSpace;
  LAT.anisotropy = 4;
  return LAT;
}

// 旋子彩画（一个单元 2.4 米）：两端青绿箍头（白线、金线），找头为白蓝旋花，正中枋心深青、金线勾边、两端尖角；
// 画于画布（带 mipmap，远处平均成青绿），uv.y 为梁高方向 0–1
let CAI = null;
function caihuaTexture() {
  if (CAI) return CAI;
  if (typeof document === 'undefined') return null;
  const W = 256, H = 64, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const blue = '#2c5a72', green = '#3e7360', deep = '#1d3d4f', white = '#e9e6dc', gold = '#d8b25a';
  g.fillStyle = blue; g.fillRect(0, 0, W, H);
  // 上下压边（金线 + 白线）
  g.fillStyle = gold; g.fillRect(0, 0, W, 3); g.fillRect(0, H - 3, W, 3);
  g.fillStyle = white; g.fillRect(0, 4, W, 2); g.fillRect(0, H - 6, W, 2);
  // 箍头：两端各一道青绿宽带，中夹白线
  for (const x0 of [0, W - 22]) {
    g.fillStyle = green; g.fillRect(x0, 6, 22, H - 12);
    g.fillStyle = white; g.fillRect(x0 + 9, 6, 3, H - 12);
    g.fillStyle = gold; g.fillRect(x0 + (x0 ? 0 : 19), 6, 3, H - 12);
  }
  // 找头：白蓝旋花（两组，同心花瓣）
  const rosette = (cx) => {
    const cy = H / 2;
    g.fillStyle = white; g.beginPath(); g.ellipse(cx, cy, 22, 22, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = blue;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.beginPath(); g.ellipse(cx + Math.cos(a) * 13, cy + Math.sin(a) * 13, 7, 4, a, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = green; g.beginPath(); g.ellipse(cx, cy, 7, 7, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = gold; g.beginPath(); g.ellipse(cx, cy, 3, 3, 0, 0, Math.PI * 2); g.fill();
  };
  rosette(52); rosette(W - 52);
  // 枋心：深青底、金线勾边、两端尖角
  const x0 = 82, x1 = W - 82, y0 = 13, y1 = H - 13, tip = 12;
  g.fillStyle = gold;
  g.beginPath(); g.moveTo(x0 - tip - 3, H / 2); g.lineTo(x0, y0 - 3); g.lineTo(x1, y0 - 3); g.lineTo(x1 + tip + 3, H / 2); g.lineTo(x1, y1 + 3); g.lineTo(x0, y1 + 3); g.closePath(); g.fill();
  g.fillStyle = deep;
  g.beginPath(); g.moveTo(x0 - tip, H / 2); g.lineTo(x0, y0); g.lineTo(x1, y0); g.lineTo(x1 + tip, H / 2); g.lineTo(x1, y1); g.lineTo(x0, y1); g.closePath(); g.fill();
  // 枋心里的卷云（金）
  g.strokeStyle = gold; g.lineWidth = 2;
  for (const [cx, r] of [[W / 2 - 16, 7], [W / 2 + 4, 9], [W / 2 + 22, 6]]) { g.beginPath(); g.arc(cx, H / 2 + 2, r, Math.PI, Math.PI * 2.6); g.stroke(); }
  CAI = new THREE.CanvasTexture(cv);
  CAI.wrapS = THREE.RepeatWrapping; CAI.wrapT = THREE.ClampToEdgeWrapping;
  CAI.colorSpace = THREE.SRGBColorSpace;
  CAI.anisotropy = 4;
  return CAI;
}

// 粗糙度、金属度按 material_palette.csv 起步（瓦 0.65、朱红木 0.58、暖白石 0.82、淡玉 0.38、旧金 0.38 / 金属、古铜 0.55 / 金属），
// 再按实际光照微调（琉璃瓦略亮于素瓦）
const MAT_DEFS = {
  std: ['std', {}, null, 'plaster'],
  wood: ['wood', { roughness: 0.58 }, null, 'wood'],
  cloth: ['std', { roughness: 0.95, side: THREE.DoubleSide }],
  stone: ['stone', { roughness: 0.92 }, null, 'wallstone'],
  stoneSmooth: ['stone', { roughness: 0.82, joint: 0, seam: 1 }, null, 'grain'],
  roof: ['roof', { roughness: 0.7, side: THREE.DoubleSide }, null, 'roof'],
  glaze: ['roof', { roughness: 0.55, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.55 }, null, 'roof'],
  window: ['window', { roughness: 0.88, side: THREE.DoubleSide }],
  windowLit: ['window', { roughness: 0.88, side: THREE.DoubleSide }],      // 外墙上的窗纸（问道殿室内：白天透进天光，见 uDayLit）
  coffer: ['coffer', { roughness: 0.7, side: THREE.DoubleSide }],
  caihua: ['caihua', { roughness: 0.75, side: THREE.DoubleSide }],
  gold: ['std', { metalness: 1, roughness: 0.38 }],
  bronze: ['stone', { metalness: 1, roughness: 0.55, joint: 0 }, null, 'patina'],
  glow: ['glow', { roughness: 0.6 }],
  jade: ['std', { roughness: 0.38, envMapIntensity: 0.6 }, 'jade'],
  leaf: ['std', { roughness: 0.92, side: THREE.DoubleSide }],
  thatch: ['thatch', { roughness: 0.98, side: THREE.DoubleSide }],
  under: ['wood', { roughness: 0.92, side: THREE.BackSide }, null, 'wood'],
  // 第十二轮：问道殿外观改用素材古建的手绘贴图横条（贴图名、像素框见 TRIM_GLSL 的说明；1024 图集，003 为 2048）
  trTile: ['trim', { roughness: 0.6, side: THREE.DoubleSide, trim: { tex: '017', R: [0, 6, 1024, 206], B: [0, 292, 1024, 556], bh: 0.82, u: 3.2, v: 0.62 } }],     // 筒瓦（檐口一行带瓦当，其上瓦垄）
  trRafter: ['trim', { roughness: 0.82, side: THREE.BackSide, trim: { tex: '016', R: [0, 380, 1024, 432], u: 3.9, v: 0.6 } }],   // 檐下椽子
  trFascia: ['trim', { roughness: 0.7, trim: { tex: '016', R: [0, 2, 1024, 46], u: 3.6 } }],                                 // 封檐板（浅木色）
  trSill: ['trim', { roughness: 0.78, trim: { tex: '013', R: [0, 598, 1024, 868], u: 3.8 } }],                               // 槛墙（铜饰木板）
  trPlank: ['trim', { roughness: 0.78, trim: { tex: '013', R: [0, 748, 1024, 860], u: 2.6 } }],                              // 竖板壁
  trHead: ['trim', { roughness: 0.75, trim: { tex: '016', R: [0, 652, 1024, 784], u: 4.6 } }],                               // 窗上回纹带 + 额枋
  trBeam: ['trim', { roughness: 0.72, trim: { tex: '016', R: [0, 708, 1024, 782], u: 4.2 } }],                               // 朱漆额枋（描金）
  trFrieze: ['trim', { roughness: 0.78, trim: { tex: '017', R: [0, 562, 1024, 790], u: 7.0 } }],                             // 斗拱垫板（彩画云头）
  trDoors: ['trim', { roughness: 0.78, trim: { tex: '011', R: [2, 542, 272, 778], u: 3.9, glow: true } }],                   // 隔扇门（拱形棂窗）
  trWin: ['trim', { roughness: 0.8, side: THREE.DoubleSide, trim: { tex: '003', R: [1140, 88, 1570, 535], u: 1, glow: true } }],   // 雕花槛窗
  trRail: ['trim', { roughness: 0.78, side: THREE.DoubleSide, trim: { tex: '016', R: [0, 466, 1024, 646], u: 4.8 } }],     // 平座栏板
  trLat: ['trim', { roughness: 0.8, side: THREE.DoubleSide, trim: { tex: '013', R: [545, 66, 825, 262], u: 1, k: 1.24, glow: true } }],   // 菱花槛窗（米黄窗纸）
  trPlaster: ['trim', { roughness: 0.92, trim: { tex: '003', R: [418, 84, 700, 580], u: 2.4, k: 1.6 } }],                   // 灰泥粉墙
  trGable: ['trim', { roughness: 0.75, side: THREE.DoubleSide, trim: { tex: '002', R: [215, 15, 455, 200], u: 1, k: 1.2 } }],  // 山花（朱红底、鎏金卷云，整幅一张）
  // 第十三轮：通天塔的墙身（同一张隔扇门图，压暗成深色木构；入夜窗纸透出灯光）
  trDoorsDk: ['trim', { roughness: 0.82, trim: { tex: '011', R: [2, 542, 272, 778], u: 3.9, k: 0.95, glow: true, far: 0.55 } }],
};

// 给外挂网格（匾额、画布贴图件）的材质接上建筑淡化
export function attachFade(mesh, fadeU) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const m of mats) {
    m.onBeforeCompile = (sh) => applyFade(sh, { fade: fadeU });
    m.customProgramCacheKey = () => `extra-fade-${m.map ? 'map' : 'nomap'}`;
  }
}

// 阴影代理：只在绘制阴影时显示（main.js 包装 shadowMap.render 时统一打开、画完关闭）
export const SHADOW_PROXIES = [];
const PROXY_MAT = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })];
export function installShadowProxies(renderer) {
  const sm = renderer.shadowMap, render = sm.render;
  sm.render = function (...args) {
    for (const p of SHADOW_PROXIES) p.visible = true;
    render.apply(this, args);
    for (const p of SHADOW_PROXIES) p.visible = false;
  };
}

const ENV = { map: null, mats: [] };
export function makeMaterials(fade = null) {
  const out = {};
  for (const [k, [kind, p, e, det]] of Object.entries(MAT_DEFS)) out[k] = archMaterial(kind, p, e, fade, det);
  for (const k of ['glaze', 'gold', 'bronze']) ENV.mats.push(out[k]);
  return out;
}
export const AM = makeMaterials(null);
// 环境反光贴图随时辰更新：替换所有琉璃、金、铜材质的 envMap
// 其他模块的金属 / 釉面材质也登记进来（如聚灵阵的铜嵌线），随时辰一并更新反光
export function registerEnvMat(m) { ENV.mats.push(m); if (ENV.map) { m.envMap = ENV.map; m.needsUpdate = true; } }
export function setEnvMap(env) {
  const first = !ENV.map;
  ENV.map = env;
  for (const m of ENV.mats) { m.envMap = env; if (first) m.needsUpdate = true; }
}

// 调色板（sRGB）：青灰瓦、米白墙、深色木构、低饱和植被；朱红与暖金只用于重要建筑
// 调色板（sRGB）：第九轮按参考包 material_palette.csv 起步——青灰瓦 #354957（变化 #526774）、朱红木 #7E342D、深木 #49342D、
// 暖白石 #D8D5C9（石缝 #A7ADA5）、淡玉 #89B5AB、旧金 #B99A61、古铜 #70694B；其余为同一色系的派生色
export const C = {
  red: 0x74302a, redDark: 0x4f2019, vermilion: 0x7e342d, pillar: 0x7e342d,
  wood: 0x5a4332, woodDark: 0x49342d, woodLight: 0x8a6c50, woodRed: 0x6c2e28, woodGrey: 0x6b6259,
  plaster: 0xe2ddd1, plasterWarm: 0xd8d0bf, plasterGrey: 0xc7c2b6,
  brick: 0x6f6e6a, brickWarm: 0x7b746a, brickDark: 0x56544f,
  stone: 0xaaa69c, stoneDark: 0x7d7a72, stoneWarm: 0xb3aa98, marble: 0xd8d5c9, marbleWarm: 0xcdc8ba, marbleShade: 0xa7ada5, stoneGrey: 0x97958c, pave: 0x8e8a82,
  tile: 0x445664, tileDark: 0x354957, tileVar: 0x526774, tileWarm: 0x575049, ridge: 0x2e3d48, woodUnder: 0x6e5644,
  paintBlue: 0x2f566e, paintGreen: 0x4c7d70, paintTeal: 0x3f7a74,
  gold: 0xb99a61, bronze: 0x70694b, jade: 0x89b5ab,
  paper: 0xdccdb0, lantern: 0xd25a36, lanternGold: 0xe8a84a,
  cloth: 0x8c3a2e, clothBlue: 0x3e5a72, clothYellow: 0xc9a24e, clothGreen: 0x5c7650, clothWhite: 0xe6e1d4, clothTeal: 0x4c7a78,
  leaf: 0x5a7448, leafDark: 0x3f5638, earth: 0x7a6650, water: 0x3e5e62, black: 0x1f1d1b,
  straw: 0xb79f6c, strawDark: 0x8e7a52, bamboo: 0x9c9a62, bambooDry: 0xb3a676,
};

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
const _col = new THREE.Color();

// 源几何的非索引顶点数据（按几何对象缓存，避免每个构件都复制一次）
const flatCache = new WeakMap();
function flat(geo) {
  let f = flatCache.get(geo);
  if (f) return f;
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  f = { n, pos: g.attributes.position.array, nrm: g.attributes.normal.array, uv: g.attributes.uv ? g.attributes.uv.array : new Float32Array(n * 2), col: g.attributes.color ? g.attributes.color.array : null };
  flatCache.set(geo, f);
  return f;
}

// 可增长的顶点缓冲（每种材质一个）
class Acc {
  constructor() { this.n = 0; this.cap = 1024; this.pos = new Float32Array(this.cap * 3); this.nrm = new Float32Array(this.cap * 3); this.col = new Float32Array(this.cap * 3); this.uv = new Float32Array(this.cap * 2); this.grain = new Float32Array(this.cap); }
  reserve(k) {
    if (this.n + k <= this.cap) return;
    while (this.n + k > this.cap) this.cap *= 2;
    const g = (a, s) => { const b = new Float32Array(this.cap * s); b.set(a); return b; };
    this.pos = g(this.pos, 3); this.nrm = g(this.nrm, 3); this.col = g(this.col, 3); this.uv = g(this.uv, 2); this.grain = g(this.grain, 1);
  }
}
// 构件长轴 → aGrain 编码（世界方向 dir；box 是否为箱体）
const _ga = new THREE.Vector3();
function grainCode(W, geo, sx, sy, sz) {
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox, dx = (bb.max.x - bb.min.x) * Math.abs(sx), dy = (bb.max.y - bb.min.y) * Math.abs(sy), dz = (bb.max.z - bb.min.z) * Math.abs(sz);
  if (dy >= dx && dy >= dz) _ga.set(0, 1, 0); else if (dx >= dz) _ga.set(1, 0, 0); else _ga.set(0, 0, 1);
  const e = W.elements;
  const x = e[0] * _ga.x + e[4] * _ga.y + e[8] * _ga.z, y = e[1] * _ga.x + e[5] * _ga.y + e[9] * _ga.z, z = e[2] * _ga.x + e[6] * _ga.y + e[10] * _ga.z;
  const l = Math.hypot(x, y, z) || 1, box = geo.type === 'BoxGeometry' ? 4 : 0;
  if (Math.abs(y) / l > 0.7) return 2 + box;
  let a = Math.atan2(z, x); if (a < 0) a += Math.PI; if (a >= Math.PI) a -= Math.PI;
  return a / Math.PI + box;
}
const _nm = new THREE.Matrix3();
export function mergeColored(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

const boxCache = new Map();
function boxGeo(w, h, d) {
  const k = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  let g = boxCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); boxCache.set(k, g); if (boxCache.size > 6000) boxCache.clear(); }
  return g;
}
const cylCache = new Map();
function cylGeo(rt, rb, h, seg, open) {
  const k = `${rt.toFixed(3)}|${rb.toFixed(3)}|${h.toFixed(3)}|${seg}|${open}`;
  let g = cylCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open); cylCache.set(k, g); if (cylCache.size > 3000) cylCache.clear(); }
  return g;
}

const sphCache = new Map();
function sphGeo(r, a, b) {
  const k = r.toFixed(3) + '|' + a + '|' + b;
  let g = sphCache.get(k);
  if (!g) { g = new THREE.SphereGeometry(r, a, b); sphCache.set(k, g); }
  return g;
}
const PLANE = new THREE.PlaneGeometry(1, 1);

// 共享缓冲上的一段（drawRange），包围盒按本段顶点计算；full = false 时只带位置（阴影代理）
function rangeGeo(attr, start, count, full) {
  const geo = new THREE.BufferGeometry(), pos = attr.position.array;
  if (full) for (const [n, a] of Object.entries(attr)) geo.setAttribute(n, a);
  else geo.setAttribute('position', attr.position);
  geo.setDrawRange(start, count);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = start * 3, e = (start + count) * 3; i < e; i += 3) for (let j = 0; j < 3; j++) { const v = pos[i + j]; if (v < lo[j]) lo[j] = v; if (v > hi[j]) hi[j] = v; }
  geo.boundingBox = new THREE.Box3(new THREE.Vector3(...lo), new THREE.Vector3(...hi));
  geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
  return geo;
}
// c = 0：单面材质（阴影画背面）；c = 1：双面材质
function shadowProxy(attr, start, count, c) {
  const px = new THREE.Mesh(rangeGeo(attr, start, count, false), PROXY_MAT[c]);
  px.castShadow = true;
  px.visible = false;
  px.name = 'shadow-proxy';
  SHADOW_PROXIES.push(px);
  return px;
}

// ---------- 建筑合批 ----------
// 世界装配完成后调用一次：所有建筑的材质网格按“100 米分块”写入每块一组共享缓冲（世界坐标），
// 块内按“投影类别 × 材质”分段——每块每种材质一次绘制，阴影每块一到两次绘制；
// 各建筑的淡化值按顶点上的建筑序号（aBid）在 FADE_V 中查表，序号 0 表示不淡化（每帧在 scene.onBeforeRender 里同步）
const FADE_N = 128;
export const FADE_V = { value: Array.from({ length: FADE_N / 4 }, () => new THREE.Vector4(1, 1, 1, 1)) };
// 细部构件（瓦当、栏杆净瓶与青玉嵌板、柱础莲瓣、器物小件……）：镜头离开所在合批单元一定距离后不画（不改变近景）。
// dist 随画质档：流畅 45 米、均衡 75 米、精致 110 米（main.js 设置）
export const DETAIL = { list: [], dist: 75 };
export function setDetailDistance(d) { DETAIL.dist = d; }
const _dbox = new THREE.Box3();
function updateDetail(cam) {
  const p = cam.position, D = DETAIL.dist;
  for (const m of DETAIL.list) {
    const bb = m.userData.dbox;
    if (bb) { m.visible = bb.distanceToPoint(p) < D; continue; }
    if (!m.parent) continue;
    // 未合批的单栋建筑：按其世界包围盒
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    _dbox.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
    m.visible = _dbox.distanceToPoint(p) < D;
  }
}
export function batchArchitecture(scene, cell = 100) {
  scene.updateMatrixWorld(true);
  const items = [];
  scene.traverse((o) => { if (o.isMesh && o.userData.arch) items.push(o); });
  if (!items.length) return null;
  const BM = makeMaterials('batch');
  if (ENV.map) for (const k of ['glaze', 'gold', 'bronze']) BM[k].envMap = ENV.map;
  const bids = new Map(), cells = new Map(), sp = new THREE.Sphere();
  for (const m of items) {
    const { k, cast, fadeU } = m.userData.arch;
    if (fadeU && !bids.has(fadeU)) { if (bids.size >= FADE_N - 1) continue; bids.set(fadeU, bids.size + 1); }
    sp.copy(m.geometry.boundingSphere).applyMatrix4(m.matrixWorld);
    const key = `${Math.floor(sp.center.x / cell)},${Math.floor(sp.center.z / cell)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push({ m, k, cast, bid: fadeU ? bids.get(fadeU) : 0 });
  }
  const root = new THREE.Group(), nm = new THREE.Matrix3(), done = new Set();
  root.name = 'arch-batch';
  for (const list of cells.values()) {
    list.sort((a, b) => a.cast - b.cast || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
    let total = 0;
    for (const it of list) total += it.m.geometry.drawRange.count;
    const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), col = new Float32Array(total * 3), uv = new Float32Array(total * 2), bid = new Float32Array(total), grn = new Float32Array(total);
    const segs = [], span = [0, 0, 0];
    let o = 0;
    for (const it of list) {
      const g = it.m.geometry, { start, count } = g.drawRange;
      const P = g.attributes.position.array, N = g.attributes.normal.array, Cl = g.attributes.color.array, U = g.attributes.uv.array, GR = g.attributes.aGrain?.array;
      const e = it.m.matrixWorld.elements, n = nm.getNormalMatrix(it.m.matrixWorld).elements;
      // 木纹方向随建筑的朝向转到世界坐标（合批后网格本身不再带变换）
      let lastG = NaN, lastOut = 0;
      const rotG = (gv) => {
        if (gv === lastG) return lastOut;
        const box = gv >= 3.5 ? 4 : 0, gg = gv - box;
        let out;
        if (gg > 1.5) out = 2 + box;
        else {
          const ax = Math.cos(gg * Math.PI), az = Math.sin(gg * Math.PI);
          let a = Math.atan2(e[2] * ax + e[10] * az, e[0] * ax + e[8] * az);
          if (a < 0) a += Math.PI; if (a >= Math.PI) a -= Math.PI;
          out = a / Math.PI + box;
        }
        lastG = gv; lastOut = out;
        return out;
      };
      for (let i = 0; i < count; i++) {
        const si = (start + i) * 3, di = (o + i) * 3, x = P[si], y = P[si + 1], z = P[si + 2], a = N[si], b = N[si + 1], c = N[si + 2];
        pos[di] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[di + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[di + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const nx = n[0] * a + n[3] * b + n[6] * c, ny = n[1] * a + n[4] * b + n[7] * c, nz = n[2] * a + n[5] * b + n[8] * c, l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nrm[di] = nx / l; nrm[di + 1] = ny / l; nrm[di + 2] = nz / l;
        col[di] = Cl[si]; col[di + 1] = Cl[si + 1]; col[di + 2] = Cl[si + 2];
        uv[(o + i) * 2] = U[(start + i) * 2]; uv[(o + i) * 2 + 1] = U[(start + i) * 2 + 1];
        bid[o + i] = it.bid;
        grn[o + i] = GR ? rotG(GR[start + i]) : 0;
      }
      const last = segs[segs.length - 1];
      if (last && last.k === it.k && last.cast === it.cast) last.count += count;
      else segs.push({ k: it.k, cast: it.cast, start: o, count });
      span[it.cast] += count;
      o += count;
      done.add(it.m);
    }
    // 显存：合批缓冲的法线用 16 位归一化整数（4 分量，SNORM 是各图形后端都直接支持的顶点格式；3 分量 16 位或非归一化整数会让 ANGLE/D3D 逐次转换、反而更慢），
    // 每顶点 52 → 48 字节；其余属性仍为 32 位浮点
    const nrm16 = new Int16Array(total * 4);
    for (let i = 0; i < total; i++) for (let c = 0; c < 3; c++) nrm16[i * 4 + c] = Math.round(Math.max(-1, Math.min(1, nrm[i * 3 + c])) * 32767);
    const attr = { position: new THREE.BufferAttribute(pos, 3), normal: new THREE.BufferAttribute(nrm16, 4, true), color: new THREE.BufferAttribute(col, 3), uv: new THREE.BufferAttribute(uv, 2), aBid: new THREE.BufferAttribute(bid, 1), aGrain: new THREE.BufferAttribute(grn, 1) };
    for (const sg of segs) {
      const mesh = new THREE.Mesh(rangeGeo(attr, sg.start, sg.count, true), BM[sg.k.split('~')[0]]);
      mesh.receiveShadow = true;
      mesh.name = 'arch-' + sg.k;
      if (sg.k.endsWith('~d')) {
        // 细部：记下这一段顶点的世界包围盒，按镜头距离显隐
        mesh.userData.detail = true; mesh.userData.dbox = mesh.geometry.boundingBox.clone();
        DETAIL.list.push(mesh);
      }
      root.add(mesh);
    }
    for (const c of [0, 1]) if (span[c]) root.add(shadowProxy(attr, c ? span[0] : 0, span[c], c));
  }
  // 拆下已合批的材质网格；构件已全部合批的建筑，其单栋阴影代理一并移除；已不在场景中的建筑（如被模型替换的藏经阁）的代理也移除
  const parents = new Set();
  for (const m of done) { parents.add(m.parent); m.parent.remove(m); }
  const inScene = (o) => { while (o) { if (o === scene) return true; o = o.parent; } return false; };
  for (let i = SHADOW_PROXIES.length - 1; i >= 0; i--) {
    const p = SHADOW_PROXIES[i];
    if (p.parent === root) continue;
    const drop = !inScene(p) || (parents.has(p.parent) && !p.parent.children.some((c) => c.userData.arch));
    if (drop) { p.parent?.remove(p); SHADOW_PROXIES.splice(i, 1); }
  }
  scene.add(root);
  const fades = [...bids];
  // 已拆下合批的细部网格不再参与显隐
  for (let i = DETAIL.list.length - 1; i >= 0; i--) if (!DETAIL.list[i].userData.dbox && done.has(DETAIL.list[i])) DETAIL.list.splice(i, 1);
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (...a) {
    for (const [u, i] of fades) FADE_V.value[i >> 2].setComponent(i & 3, u.value);
    updateDetail(a[2]);
    prev.apply(this, a);
  };
  return { cells: cells.size, meshes: root.children.length, buildings: bids.size, batched: done.size };
}

export class Builder {
  constructor() {
    this.parts = {};
    this.cols = [];
    this.extra = [];
    this.emitters = [];
    this.mstack = [new THREE.Matrix4()];
    this.ystack = [0];
  }
  get M() { return this.mstack[this.mstack.length - 1]; }
  get yaw() { return this.ystack[this.ystack.length - 1]; }

  push(x = 0, y = 0, z = 0, ry = 0) {
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    this.mstack.push(this.M.clone().multiply(m));
    this.ystack.push(this.yaw + ry);
    return this;
  }
  pop() { this.mstack.pop(); this.ystack.pop(); return this; }
  local(x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(this.M); }

  // o: { x,y,z, rx,ry,rz, sx,sy,sz, q, col:'box'|'cyl'|false, walk, cam, uvScale:[su,sv] }
  add(geo, color, mat = 'std', o = {}) {
    const sx = o.sx ?? o.s ?? 1, sy = o.sy ?? o.s ?? 1, sz = o.sz ?? o.s ?? 1;
    if (o.q) _q.copy(o.q); else _q.setFromEuler(_e.set(o.rx || 0, o.ry || 0, o.rz || 0));
    const T = new THREE.Matrix4().compose(_v.set(o.x || 0, o.y || 0, o.z || 0), _q, _s.set(sx, sy, sz));
    const W = this.M.clone().multiply(T);
    const F = flat(geo), n = F.n;
    const A = (this.parts[o.detail ? mat + '~d' : mat] ||= new Acc());
    A.reserve(n);
    const e = W.elements;
    _nm.getNormalMatrix(W);
    const m = _nm.elements;
    _col.set(color);
    const jit = o.jitter ?? 0;
    const jr = jit ? 1 + (Math.random() - 0.5) * jit : 1;
    const cr = _col.r * jr, cg = _col.g * jr, cb = _col.b * jr;
    const su = o.uvScale ? o.uvScale[0] : 1, sv = o.uvScale ? o.uvScale[1] : 1;
    const P = F.pos, N = F.nrm, U = F.uv, VC = o.vcol ? F.col : null;
    const gcode = grainCode(W, geo, sx, sy, sz), Gr = A.grain;
    Gr.fill(gcode, A.n, A.n + n);
    let o3 = A.n * 3, o2 = A.n * 2;
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      A.pos[o3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      A.pos[o3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      A.pos[o3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
      let ax = m[0] * nx + m[3] * ny + m[6] * nz, ay = m[1] * nx + m[4] * ny + m[7] * nz, az = m[2] * nx + m[5] * ny + m[8] * nz;
      const l = Math.hypot(ax, ay, az) || 1;
      A.nrm[o3] = ax / l; A.nrm[o3 + 1] = ay / l; A.nrm[o3 + 2] = az / l;
      if (VC) { A.col[o3] = cr * VC[i * 3]; A.col[o3 + 1] = cg * VC[i * 3 + 1]; A.col[o3 + 2] = cb * VC[i * 3 + 2]; } else { A.col[o3] = cr; A.col[o3 + 1] = cg; A.col[o3 + 2] = cb; }
      A.uv[o2] = U[i * 2] * su; A.uv[o2 + 1] = U[i * 2 + 1] * sv;
      o3 += 3; o2 += 2;
    }
    A.n += n;
    // 镜像变换（缩放为负）时翻转绕序
    if (W.determinant() < 0) {
      for (let i = A.n - n; i < A.n; i += 3) for (const [arr, s] of [[A.pos, 3], [A.nrm, 3], [A.col, 3], [A.uv, 2]]) {
        for (let c = 0; c < s; c++) { const t1 = arr[(i + 1) * s + c]; arr[(i + 1) * s + c] = arr[(i + 2) * s + c]; arr[(i + 2) * s + c] = t1; }
      }
    }
    let col = o.col;
    if (col === undefined) {
      const t = geo.type;
      if (t === 'BoxGeometry') col = 'box';
      else if (t === 'CylinderGeometry' && Math.max(geo.parameters.radiusTop, geo.parameters.radiusBottom) * Math.max(sx, sz) > 0.12) col = 'cyl';
      else col = false;
    }
    if (col && !o.q && Math.abs(o.rx || 0) < 0.03 && Math.abs(o.rz || 0) < 0.03) {
      if (!geo.boundingBox) geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const c = new THREE.Vector3().addVectors(bb.min, bb.max).multiplyScalar(0.5).applyMatrix4(W);
      const hx = ((bb.max.x - bb.min.x) / 2) * sx, hy = ((bb.max.y - bb.min.y) / 2) * sy, hz = ((bb.max.z - bb.min.z) / 2) * sz;
      if (col === 'cyl') this.cols.push({ type: 'cyl', x: c.x, z: c.z, y0: c.y - hy, y1: c.y + hy, r: Math.max(hx, hz), walk: o.walk ?? false, cam: o.cam ?? false });
      else this.cols.push({ type: 'box', x: c.x, z: c.z, y0: c.y - hy, y1: c.y + hy, hx, hz, ry: this.yaw + (o.ry || 0), walk: o.walk ?? true, cam: o.cam ?? true });
    }
    return this;
  }

  box(w, h, d, color, x = 0, y = 0, z = 0, o = {}) { return this.add(boxGeo(w, h, d), color, o.mat || 'std', { ...o, x, y, z }); }
  slab(w, h, d, color, x = 0, y = 0, z = 0, o = {}) { return this.box(w, h, d, color, x, y + h / 2, z, o); }
  cyl(rt, rb, h, color, x = 0, y = 0, z = 0, o = {}) {
    return this.add(cylGeo(rt, rb, h, o.seg || 10, !!o.open), color, o.mat || 'std', { ...o, x, y, z });
  }
  sphere(r, color, x = 0, y = 0, z = 0, o = {}) {
    return this.add(sphGeo(r, o.seg || 10, o.seg2 || 8), color, o.mat || 'std', { col: false, ...o, x, y, z });
  }
  // 竖直面板（窗、门、匾）：PlaneGeometry 法线朝本地 +Z，uv 以米计
  panel(w, h, color, x, y, z, o = {}) {
    return this.add(PLANE, color, o.mat || 'window', { col: false, uvScale: [w, h], ...o, x, y, z, sx: (o.sx ?? 1) * w, sy: (o.sy ?? 1) * h });
  }
  // 手动碰撞体（当前坐标系下的本地长方体）
  collider(cx, y0, y1, cz, hx, hz, ry = 0, o = {}) {
    const c = this.local(cx, y0, cz);
    this.cols.push({ type: 'box', x: c.x, z: c.z, y0: c.y, y1: c.y + (y1 - y0), hx, hz, ry: this.yaw + ry, walk: o.walk ?? true, cam: o.cam ?? true });
    return this;
  }
  cylCollider(cx, y0, y1, cz, r, o = {}) {
    const c = this.local(cx, y0, cz);
    this.cols.push({ type: 'cyl', x: c.x, z: c.z, y0: c.y, y1: c.y + (y1 - y0), r, walk: o.walk ?? false, cam: false });
    return this;
  }
  emitter(kind, x, y, z, o = {}) {
    const p = this.local(x, y, z);
    this.emitters.push({ kind, x: p.x, y: p.y, z: p.z, ...o });
    return this;
  }
  addMesh(mesh) {
    mesh.applyMatrix4(this.M);
    this.extra.push(mesh);
    return this;
  }

  // fade：为此建筑创建独立材质组与淡化 uniform
  // mats：另给一套材质（独立场景用，如问道殿室内——与宗门共用材质时，两场景灯光配置不同会让材质每帧切换着色器变体）
  build({ shadows = true, fade = false, name = '', mats: own = null } = {}) {
    const g = new THREE.Group();
    g.name = name;
    let mats = own || AM, fadeU = null;
    if (fade) {
      fadeU = { value: 1 };
      mats = makeMaterials(fadeU);
      if (ENV.map) for (const k of ['glaze', 'gold', 'bronze']) mats[k].envMap = ENV.map;
    }
    // 各材质的顶点写入同一组缓冲，依次为单面投影、双面投影、不投影的材质；材质网格各画自己的区段（本身不投影），
    // 阴影由共享这组缓冲的代理网格画出（单面、双面各一次绘制），代替逐材质投影
    const base = (k) => k.split('~')[0];
    const cls = (k) => (!shadows || k.endsWith('~d') || k === 'glow' || k === 'window' ? 2 : mats[base(k)].side === THREE.FrontSide ? 0 : 1);
    const list = Object.entries(this.parts).filter(([, A]) => A.n).sort((a, b) => cls(a[0]) - cls(b[0]));
    let total = 0;
    for (const [, A] of list) total += A.n;
    const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), col = new Float32Array(total * 3), uv = new Float32Array(total * 2), grain = new Float32Array(total);
    const span = [0, 0, 0];
    let o = 0;
    for (const [k, A] of list) {
      pos.set(A.pos.subarray(0, A.n * 3), o * 3); nrm.set(A.nrm.subarray(0, A.n * 3), o * 3);
      col.set(A.col.subarray(0, A.n * 3), o * 3); uv.set(A.uv.subarray(0, A.n * 2), o * 2); grain.set(A.grain.subarray(0, A.n), o);
      A.start = o; o += A.n; span[cls(k)] += A.n;
    }
    const attr = { position: new THREE.BufferAttribute(pos, 3), normal: new THREE.BufferAttribute(nrm, 3), color: new THREE.BufferAttribute(col, 3), uv: new THREE.BufferAttribute(uv, 2), aGrain: new THREE.BufferAttribute(grain, 1) };
    for (const [k, A] of list) {
      const m = new THREE.Mesh(rangeGeo(attr, A.start, A.n, true), mats[base(k)]);
      m.receiveShadow = true;
      m.userData.arch = { k, cast: cls(k), fadeU };       // 供 batchArchitecture 合批
      if (k.endsWith('~d')) { m.userData.detail = true; DETAIL.list.push(m); }
      g.add(m);
    }
    for (const c of [0, 1]) if (span[c]) g.add(shadowProxy(attr, c ? span[0] : 0, span[c], c));
    for (const e of this.extra) {
      if (fadeU) e.traverse((o) => { if (o.isMesh && o.userData.fadeable !== false) attachFade(o, fadeU); });
      g.add(e);
    }
    g.userData.colliders = this.cols;
    g.userData.emitters = this.emitters;
    g.userData.fade = fadeU;
    g.userData.mats = fade ? mats : null;
    // 世界包围盒（用于镜头遮挡判断）
    const bb = new THREE.Box3();
    for (const c of g.children) if (c.geometry) { if (!c.geometry.boundingBox) c.geometry.computeBoundingBox(); bb.union(c.geometry.boundingBox); }
    g.userData.bounds = bb;
    return g;
  }
}
