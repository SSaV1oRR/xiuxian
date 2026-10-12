// 崖壁（第八轮建，第九轮重写剖面与材质）：沿 layout.CLIFF_RUNS 的崖线，从崖顶岩肩一直砌到谷底以下的独立岩壁网格，与高度场共同构成宗门的承托山体。
// 结构自上而下：挡土墙脚的岩盖（压进岩肩地面）→ 圆钝的崖口 → 折面崖壁（竖向节理分出的岩柱、水平岩层的檐口与凹槽、
// 突出的岩肩与凹进的岩湾、个别高段中部的一级岩台）→ 外撇的崖脚（埋入谷底 3 米，不露空心底）。
// 地形在崖线外 1 米内陡落（carveValleys），岩壁面始终在其外侧，挡住高度场的竖直断面。
// 材质：三向投影的实拍岩面（竖向节理 marble_cliff_01 与水平岩层 cliff_side，按世界坐标统一尺度，不随崖高拉长），
// 颜色统一成灰白、青灰、暖灰三种岩色成片过渡；凹处（裂隙、岩层下的凹槽）压暗；苔藓只长在背阴的凹缝、岩台面与瀑布冲刷的竖槽里。
import * as THREE from 'three';
import { CLIFF_RUNS, CLIFF_FEATURES, STAIRS, cliffLine } from './layout.js';
import { createNoise2D, hash2, smoothstep, clamp, lerp, mulberry32 } from '../core/math.js';
import { NOISE_GLSL, injectFog, FOGU, GLOBAL } from './shaderlib.js';
import { ASSETS } from './assets.js';

const DS = 0.7;                // 崖线方向的格距（米）
const ROW = 0.62;              // 竖向最大格距

// 一段崖线的岩壁剖面（第九轮重写）：返回离崖线的外推距离（指向谷），d 为崖顶以下的深度，y 为世界高度。
// 先有大山体：沿崖线与沿高度都缓缓起伏的岩肩、岩湾（波长十几到三十米，厚实，不出薄片）；
// 再分中等岩块：不规则的块状分区（错位的格点 + 扰动，取最近与次近的格心），每块是一个略带倾角的平面——受光各不相同的折面；
// 块与块之间多为浅缝，少数是深裂隙；最后是小尺度的破碎面。崖口不做圆鼓的檐，崖脚外撇埋入谷底
function profileFn(seed) {
  const N = createNoise2D(seed * 97 + 13), N2 = createNoise2D(seed * 131 + 7), N3 = createNoise2D(seed * 53 + 29);
  const ridge = (x, y) => 1 - Math.abs(N2(x, y));
  const CS = 5.2, CY = 4.3;                         // 岩块的平均尺寸（沿崖线、竖向）
  const cell = (ci, cj) => {
    const h = hash2(ci * 3 + 1, cj * 7 + seed), h2 = hash2(ci * 11 + 5, cj * 13 + seed * 2), h3 = hash2(ci * 5 + 9, cj * 3 + seed * 3);
    return { cs: (ci + 0.15 + 0.7 * h) * CS, cy: (cj + 0.15 + 0.7 * h2) * CY, off: (h3 - 0.5) * 1.3, ts: (hash2(ci + 31, cj + seed) - 0.5) * 0.34, ty: (hash2(ci + 17, cj + 2 * seed) - 0.5) * 0.3, deep: hash2(ci * 19 + 3, cj * 23 + seed) };
  };
  return (s, d, y, col) => {
    const { H } = col;
    // 大山体：岩肩、岩湾（沿崖线 + 沿高度）；崖口以下逐渐显出
    const ss = s / 26 + 0.37 * seed, dd = d / 15;
    const mass = 2.3 * N(ss, dd + 1.3) + 1.1 * N(s / 11 + seed, dd * 1.7 + 4.1) + 0.6 * N(s / 47, 9.1 + seed);
    // 岩块：扰动后的格点，取最近（F1）与次近（F2）格心
    const ws = s + 1.6 * N3(s / 9, y / 9), wy = y + 1.3 * N3(s / 9 + 7.7, y / 9);
    const ci0 = Math.floor(ws / CS), cj0 = Math.floor(wy / CY);
    let f1 = 1e9, f2 = 1e9, best = null, second = null;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const c = cell(ci0 + a, cj0 + b), dx = (ws - c.cs) / CS, dy = (wy - c.cy) / CY, dist = dx * dx + dy * dy;
      if (dist < f1) { f2 = f1; second = best; f1 = dist; best = c; } else if (dist < f2) { f2 = dist; second = c; }
    }
    const blockOff = best.off + best.ts * (ws - best.cs) + best.ty * (wy - best.cy);
    const edge = Math.sqrt(f2) - Math.sqrt(f1);                    // 0 在两块的分界上
    const deepCrack = best.deep > 0.78 || (second && second.deep > 0.78);
    const crackW = deepCrack ? 0.16 : 0.07, crackD = deepCrack ? 0.55 : 0.16;
    const crack = (1 - smoothstep(0, crackW, edge)) * crackD;
    const fine = 0.16 * (ridge(s / 2.3, y / 2.7) - 0.55) + 0.06 * N(s / 0.7, y / 0.7);
    const flare = smoothstep(H - 6, H + 1.5, d) * (1.5 + 1.0 * N(s / 8, 5.5));
    const din = smoothstep(0.2, 2.2, d);
    const off = 2.0 + 0.06 * d + mass * smoothstep(0.2, 4.0, d) + blockOff * din - crack * din + fine + flare;
    return { off, joint: Math.min(1, crack * 1.4), under: 0, deep: deepCrack ? 1 - smoothstep(0, crackW * 1.6, edge) : 0 };
  };
}

// 岩石材质（三向投影；aRock = 凹度、湿度、岩色种子）
export function cliffMaterial(quality = 'mid') {
  const T = ASSETS.tex, has = !!(T.cliff_d && T.strata_d), nrm = has && !!(T.cliff_n && T.strata_n) && quality !== 'low', MS = !!T.mside_d;
  // 双面：岩面个别翻折处（岩柱错落、转角）不至于露出背后的地形
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    injectFog(sh);
    // 第十轮：岩面改用扫描岩壁烘焙的四方连续贴图（与扫描岩体同一种岩面，7.5 米一幅）；缺失时退回原贴图
    if (has) for (const [u, k] of [['tCliff', T.mside_d ? 'mside_d' : 'cliff_d'], ['tStrata', 'strata_d'], ['tMoss', 'mossrock_d'], ['tCliffN', T.mside_n ? 'mside_n' : 'cliff_n'], ['tStrataN', 'strata_n']]) sh.uniforms[u] = { value: T[k] || null };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRock; varying vec3 vRock; varying vec3 vW; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRock = aRock; vW = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${has ? '#define HAS_TEX' : ''}
        ${nrm ? '#define HAS_NRM' : ''}
        varying vec3 vRock; varying vec3 vW; varying vec3 vWN;
        #ifdef HAS_TEX
          uniform sampler2D tCliff, tStrata, tMoss;
        #endif
        #ifdef HAS_NRM
          uniform sampler2D tCliffN, tStrataN;
        #endif
        ${NOISE_GLSL}
        vec3 cN; float cNw; float cRough;
        vec3 sRGB(vec3 c){ return pow(c, vec3(2.2)); }
        float lumc(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
        vec3 rockColor(){
          vec3 n = normalize(vWN);
          vec3 bw = pow(abs(n), vec3(4.)); bw /= bw.x + bw.y + bw.z;
          float dist = length(vViewPosition);
          vec2 pm = mod(vW.xz, 4096.);
          // 岩层占比：大尺度噪声决定哪一段以竖向节理为主、哪一段水平岩层更显
          float strat = .25 * smoothstep(.35, .7, nzf(pm * .012 + vec2(vW.y * .01, 3.1)));     // 水平岩层纹只作点缀
          #ifdef HAS_TEX
            vec2 ux = vW.zy / ${MS ? '7.5' : '4.3'}, uz = vW.xy / ${MS ? '7.5' : '4.3'}, uy = vW.xz / ${MS ? '7.5' : '4.3'};
            float lc = lumc(texture2D(tCliff, ux).rgb) * bw.x + lumc(texture2D(tCliff, uz).rgb) * bw.z + lumc(texture2D(tCliff, uy).rgb) * bw.y;
            // 第十轮：另取一层（尺度 1.63 倍、错位）按大尺度噪声成片替换，打散岩面的重复
            {
              vec3 w2 = vW + vec3(13.7, 5.3, 29.1); float s2 = ${MS ? '12.2' : '7.0'};
              float lc2 = lumc(texture2D(tCliff, w2.zy / s2).rgb) * bw.x + lumc(texture2D(tCliff, w2.xy / s2).rgb) * bw.z + lumc(texture2D(tCliff, w2.xz / s2).rgb) * bw.y;
              lc = mix(lc, lc2, smoothstep(.32, .68, nzf(pm * .011 + vec2(5.1, vW.y * .008))));
            }
            vec2 sx = vW.zy / vec2(3.4, 2.6), sz = vW.xy / vec2(3.4, 2.6);
            float ls = lumc(texture2D(tStrata, sx).rgb) * bw.x + lumc(texture2D(tStrata, sz).rgb) * bw.z + lc * bw.y;
            float L = mix(lc / ${MS ? '.49' : '.56'}, ls / .42, strat * ${MS ? '.25' : '.55'});
          #else
            float L = .8 + .4 * nzf(vec2((pm.x + pm.y) * .3, vW.y * .5));
          #endif
          // 岩色（第九轮按 material_palette.csv）：崖岩 #92968B 为主，成片地略偏暖灰或略偏青灰；岩缝 #606962
          float tA = nzf(pm * .018 + vec2(vW.y * .02, 0.)) * .8 + vRock.z * .4;
          vec3 cBase = sRGB(vec3(.573, .588, .545)), cCool = sRGB(vec3(.53, .565, .55)), cWarm = sRGB(vec3(.62, .61, .56));
          vec3 base = mix(cCool, cBase, smoothstep(.3, .55, tA));
          base = mix(base, cWarm, smoothstep(.62, .85, tA));
          vec3 cCrack = sRGB(vec3(.376, .412, .384));
          // 大尺度的风化斑：成片的深浅（远看也有层次）
          float wz = nzf(vec2((pm.x + pm.y) * .035, vW.y * .05) + 2.7);
          vec3 col = base * clamp(.45 + .65 * L, .35, 1.2) * (.86 + .24 * wz);
          // 凹处（裂隙、凹槽）偏向岩缝色；凸处略亮（风化面）
          float cav = vRock.x;
          col = mix(col, cCrack * (.75 + .3 * L), smoothstep(.15, .7, cav) * .85);
          col *= 1. + .07 * (1. - cav) * (1. - bw.y);
          // 竖向水痕：岩檐之下顺着岩面流下的深色条纹
          float st = nzv(vec2((pm.x - pm.y * .7) * .9, vW.y * .045)) * (.6 + .4 * nzv(vec2((pm.x + pm.y) * .21, vW.y * .3)));
          col *= 1. - .3 * smoothstep(.5, .85, st) * (1. - bw.y);
          // 苔藓：背阴（朝北）的凹缝、岩台与岩檐顶面、瀑布冲刷的湿槽
          float wet = vRock.y;
          float shade = smoothstep(.15, -.65, n.z);                  // 朝北背光
          float top = smoothstep(.45, .8, n.y);
          // 苔斑的噪声按崖面方向取二维坐标（水平面用 xz，竖直面用沿面方向与高度），不在竖直面上拉成竖条
          vec2 mp = bw.y > .5 ? pm : vec2(dot(pm, normalize(vec2(-n.z, n.x) + 1e-4)), vW.y);
          // 苔藓只在湿阴处：背阴面的裂隙、岩肩顶的凹处、落水与渗水的湿槽；石面大部分留白
          float moss = clamp(top * cav * .9 * (.55 + .45 * nzf(mp * .21)) + cav * shade * .55 * smoothstep(.5, .72, nzf(mp * .33 + 7.)) + wet * .8, 0., 1.);
          moss *= smoothstep(.3, .6, nzf(mp * .09 + 1.) + wet * .6 + top * .2);
          #ifdef HAS_TEX
            // 苔藓贴图也按三向投影取样（竖直岩缝里不会被拉成竖条）
            vec3 mt = texture2D(tMoss, vW.zy / 3.).rgb * bw.x + texture2D(tMoss, vW.xz / 3.).rgb * bw.y + texture2D(tMoss, vW.xy / 3.).rgb * bw.z;
            vec3 mossC = mix(sRGB(vec3(.30, .36, .24)), sRGB(vec3(.44, .50, .34)), smoothstep(.15, .5, lumc(mt)));     // 苔藓 #667650 上下
          #else
            vec3 mossC = sRGB(vec3(.30, .38, .22));
          #endif
          col = mix(col, mossC * (.85 + .3 * nzv(pm * 1.7)), moss * .85);
          col *= 1. - wet * .18;
          // 远处：降低细节对比，偏向雾中的青灰
          float far = smoothstep(160., 700., dist);
          col = mix(col, base * .78, far * .45);
          cRough = mix(.93, .6, wet);
          cN = n; cNw = 0.;
          #ifdef HAS_NRM
            if (dist < 140.) {
              vec3 nx = texture2D(tCliffN, ux).xyz * 2. - 1., nz = texture2D(tCliffN, uz).xyz * 2. - 1., ny = texture2D(tCliffN, uy).xyz * 2. - 1.;
              vec3 snx = texture2D(tStrataN, sx).xyz * 2. - 1., snz = texture2D(tStrataN, sz).xyz * 2. - 1.;
              nx = mix(nx, snx, strat * .5); nz = mix(nz, snz, strat * .5);
              nx = vec3(nx.xy + n.zy, abs(nx.z) * n.x); ny = vec3(ny.xy + n.xz, abs(ny.z) * n.y); nz = vec3(nz.xy + n.xy, abs(nz.z) * n.z);
              cN = normalize(nx.zyx * bw.x + ny.xzy * bw.y + nz.xyz * bw.z);
              cNw = (1. - smoothstep(70., 140., dist)) * (1. - moss * .5);
            }
          #endif
          return col;
        }`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= rockColor();')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = cRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (cNw > .001) normal = normalize(mix(normal, normalize((viewMatrix * vec4(cN, 0.)).xyz), cNw));`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= 1. - .45 * vRock.x;`);
  };
  mat.customProgramCacheKey = () => `cliff-${quality}-${has ? 't' : 'p'}${nrm ? 'n' : ''}${MS ? 'm' : ''}`;
  return mat;
}

// 落水潭水面：青玉色，中心（瀑布落点）一圈翻涌的白沫与涟漪
function poolMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x2f7d74, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.9 });
  mat.onBeforeCompile = (sh) => {
    injectFog(sh);
    sh.uniforms.uTime = GLOBAL.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
varying vec2 vP;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vP = position.xy;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime; varying vec2 vP;
${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float r = length(vP + vec2(1.2, 0.));
        float ring = .5 + .5 * sin(r * 6. - uTime * 3.);
        float foam = smoothstep(.45, .8, nzf(vP * 2.2 + vec2(uTime * .6, -uTime * .4))) * (1. - smoothstep(.6, 2.6, r));
        foam = max(foam, (1. - smoothstep(.2, 1.3, r)) * .9) * (.8 + .2 * ring);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.9, .94, .93), clamp(foam, 0., 1.));
        diffuseColor.a = mix(diffuseColor.a, 1., foam * .8);`);
  };
  mat.customProgramCacheKey = () => 'plunge-pool';
  return mat;
}

// 是否落在某个建筑占地（外扩 m 米）之内
function nearFootprint(ctx, x, z, m) {
  for (const f of ctx.footprints) {
    const c = Math.cos(f.ry || 0), sn = Math.sin(f.ry || 0), dx = x - f.x, dz = z - f.z;
    const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
    if (Math.abs(lx) < (f.w || 0) / 2 + m && Math.abs(lz) < (f.d || 0) / 2 + m) return true;
  }
  return false;
}

// 生成全部崖壁：返回 { meshes, footMask, veg }。footMask：核心网格（1 米）上岩壁占地 2、崖脚缓冲 1（植被避让）
export function buildCliffs(ctx, { quality = 'mid' } = {}) {
  const T = ctx.terrain, scene = ctx.scene, mat = cliffMaterial(quality);
  const g = T.core, mask = new Uint8Array(g.nx * g.nz);
  const veg = [], meshes = [], rimTrees = [];
  T.cliffMask = mask;
  T.cliffMaskAt = (x, z) => { const i = Math.round(x - g.x0), j = Math.round(z - g.z0); return i < 0 || j < 0 || i >= g.nx || j >= g.nz ? 0 : mask[j * g.nx + i]; };
  const markMask = (x, z, v) => {
    const i = Math.round(x - g.x0), j = Math.round(z - g.z0);
    if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) return;
    const k = j * g.nx + i;
    if (mask[k] < v) mask[k] = v;
  };
  const near = (L, p) => { let bi = 0, bd = Infinity; for (let i = 0; i < L.N; i++) { const d = (L.x[i] - p[0]) ** 2 + (L.z[i] - p[1]) ** 2; if (d < bd) { bd = d; bi = i; } } return bi; };
  let tris = 0;
  for (const run of CLIFF_RUNS) {
    const L = cliffLine(run, DS), rand = mulberry32(run.seed * 977 + 3), prof = profileFn(run.seed);
    const feats = CLIFF_FEATURES.filter((f) => f.run === run.id).map((f) => ({ ...f, s: L.s[near(L, f.at)] }));
    // 每一列：崖顶、谷底、崖高
    const cols = [];
    for (let i = 0; i < L.N; i++) {
      const x = L.x[i], z = L.z[i], nx = L.nx[i], nz = L.nz[i];
      // 崖顶：取崖线内侧 1.5 米处（双线性取样不会混进崖线外已下挖的格子）；石柱取柱顶标高
      const top = T.heightAt(x - nx * 1.5, z - nz * 1.5);
      let foot = Infinity;
      for (const e of [2.5, 3.5, 5, 6.5, 8]) foot = Math.min(foot, T.heightAt(x + nx * e, z + nz * e));
      cols.push({ x, z, nx, nz, s: L.s[i], top, foot, H: Math.max(0.5, top - foot) });
    }
    // 崖顶、谷底沿线平滑
    for (const key of ['top', 'foot']) {
      const v = cols.map((c) => c[key]);
      for (let i = 0; i < cols.length; i++) { let a = 0, n = 0; for (let j = Math.max(0, i - 2); j <= Math.min(cols.length - 1, i + 2); j++) { a += v[j]; n++; } cols[i][key] = key === 'top' ? Math.min(v[i], a / n + 0.1) : a / n; }
    }
    for (const c of cols) c.H = Math.max(0.5, c.top - c.foot);
    const maxH = Math.max(...cols.map((c) => c.H));
    const NF = Math.max(6, Math.ceil((maxH + 3.2) / ROW));        // 崖面行数（全段一致，分块之间无缝）
    const NR = 3 + NF;                                              // 前三行为岩盖与崖口
    const NC = cols.length;
    const pos = new Float32Array(NC * NR * 3), rock = new Float32Array(NC * NR * 3), offs = new Float32Array(NC * NR), extra = new Float32Array(NC * NR * 2);
    for (let i = 0; i < NC; i++) {
      const c = cols[i], { x, z, nx, nz, s } = c;
      // 两端收进山坡（与原有陡壁、深涧相接）
      const tw = smoothstep(0, 9, s) * smoothstep(0, 9, L.L - s);
      // 溢水竖槽
      let chute = 0;
      for (const f of feats) if (f.kind === 'chute') chute = Math.max(chute, 1 - smoothstep(f.w * 0.45, f.w, Math.abs(s - f.s)));
      const tint = hash2(Math.floor(s / 7.3), run.seed) * 0.6 + hash2(Math.floor(s / 2.9), run.seed + 9) * 0.4;
      for (let r = 0; r < NR; r++) {
        let off, y, cav = 0, wet = chute * 0.9;
        if (r === 0) { off = -1.8; y = T.heightAt(x - nx * 2.0, z - nz * 2.0) - 0.45; }
        else if (r === 1) { off = -0.75; y = T.heightAt(x - nx * 1.3, z - nz * 1.3) + 0.06; }
        else if (r === 2) { off = 0.55 + 0.35 * hash2(Math.floor(s / 3.1), run.seed + 3) - chute * 0.3; y = c.top + 0.02 - chute * 0.35 - 0.2 * hash2(Math.floor(s / 2.3), run.seed); cav = 0.1; }
        else {
          const t = (r - 3) / (NF - 1), d = 0.5 + t * (c.H + 3.0 - 0.5);
          y = c.top - d;
          const p = prof(s, d, y, c);
          off = p.off;
          if (chute > 0) off = lerp(off, 1.15 + 0.03 * d, chute);
          // 岩面最内不进到崖线外 1.45 米以内：高度场的陡落面（崖线内外各一格）始终藏在岩壁之后
          const minOff = lerp(1.45, 1.2, chute);
          off = Math.max(off, minOff) * tw + (-2.2 - 0.05 * d) * (1 - tw);
          cav = clamp(p.joint * 0.75, 0, 1);
          wet = Math.max(wet, p.deep * 0.35 * smoothstep(0.3, 0.7, t));       // 深裂隙下段渗水、生苔
          extra[(i * NR + r) * 2] = 0; extra[(i * NR + r) * 2 + 1] = d;
        }
        const k = i * NR + r;
        offs[k] = off;
        pos[k * 3] = x + nx * off; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z + nz * off;
        rock[k * 3] = cav; rock[k * 3 + 1] = wet; rock[k * 3 + 2] = tint;
      }
    }
    // 限制向内的倒挂：自上而下，岩面每下降 1 米最多内收 0.4 米（岩肩可以外凸，但不出现大块鼓包下的深凹）
    for (let i = 0; i < NC; i++) for (let r = 4; r < NR; r++) {
      const k = i * NR + r, kp = k - 1, dy = Math.max(0.05, pos[kp * 3 + 1] - pos[k * 3 + 1]);
      const lim = offs[kp] - 0.4 * dy;
      if (offs[k] < lim) {
        const c = cols[i];
        offs[k] = lim;
        pos[k * 3] = c.x + c.nx * lim; pos[k * 3 + 2] = c.z + c.nz * lim;
      }
    }
    // 凹度：与邻近点相比凹进去的程度（裂隙、岩层凹槽、岩湾），并入 aRock.x
    for (let i = 0; i < NC; i++) for (let r = 3; r < NR; r++) {
      const k = i * NR + r;
      let a = 0, n = 0;
      for (const [di, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2]]) {
        const ii = i + di, rr = r + dr;
        if (ii < 0 || ii >= NC || rr < 3 || rr >= NR) continue;
        a += offs[ii * NR + rr]; n++;
      }
      if (n) rock[k * 3] = clamp(rock[k * 3] + (a / n - offs[k]) * 0.55, 0, 1);
    }
    // 索引（整段一次算法线，再按列分块：块与块之间共用一列，法线一致、无缝）
    const geoAll = new THREE.BufferGeometry();
    geoAll.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const idxAll = [];
    for (let i = 0; i < NC - 1; i++) for (let r = 0; r < NR - 1; r++) {
      const a = i * NR + r, b = a + 1, c2 = a + NR, d = c2 + 1;
      idxAll.push(a, d, b, a, c2, d);
    }
    geoAll.setIndex(idxAll);
    geoAll.computeVertexNormals();
    const nrmAll = geoAll.attributes.normal.array;
    const CH = 48;
    for (let c0 = 0; c0 < NC - 1; c0 += CH) {
      const c1 = Math.min(NC - 1, c0 + CH), nv = (c1 - c0 + 1) * NR, v0 = c0 * NR;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos.slice(v0 * 3, (v0 + nv) * 3), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrmAll.slice(v0 * 3, (v0 + nv) * 3), 3));
      geo.setAttribute('aRock', new THREE.BufferAttribute(rock.slice(v0 * 3, (v0 + nv) * 3), 3));
      const idx = [];
      for (let i = 0; i < c1 - c0; i++) for (let r = 0; r < NR - 1; r++) {
        const a = i * NR + r, b = a + 1, c2 = a + NR, d = c2 + 1;
        idx.push(a, d, b, a, c2, d);
      }
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      tris += idx.length / 3;
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true; m.receiveShadow = true;
      m.name = `cliff-${run.id}-${c0}`;
      scene.add(m);
      meshes.push(m);
    }
    // 占地遮罩：崖口到崖脚最外的一点（地面以上的部分），外加 3 米缓冲
    for (let i = 0; i < NC; i++) {
      const c = cols[i];
      let maxOff = 0;
      for (let r = 2; r < NR; r++) { const k = i * NR + r; if (pos[k * 3 + 1] > c.foot - 0.5) maxOff = Math.max(maxOff, offs[k]); }
      for (let e = -0.5; e <= maxOff + 3.5; e += 0.5) markMask(c.x + c.nx * e, c.z + c.nz * e, e <= maxOff + 0.6 ? 2 : 1);
      c.maxOff = maxOff;
    }
    // 崖脚：每隔 35–60 米一组岩堆（3–5 块，大小悬殊、贴着崖脚），其余崖脚只留土坡与灌丛
    for (let s = 12 + rand() * 20; s < L.L - 8; s += 35 + rand() * 25) {
      const i = Math.min(NC - 1, Math.round(s / L.ds)), c = cols[i];
      if (c.H < 5) continue;
      const n = 3 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        const along = (rand() - 0.5) * 5, e = c.maxOff + 0.2 + rand() * (k ? 3.5 : 1.2);
        const tx = -c.nz, tz = c.nx, x = c.x + c.nx * e + tx * along, z = c.z + c.nz * e + tz * along;
        const big = k === 0 ? 2.2 + rand() * 1.4 : 0.7 + rand() * 1.1;
        veg.push(['rock', x, z, big, rand() * 6.28, T.heightAt(x, z) - 0.3 * big]);
      }
      const fx = c.x + c.nx * (c.maxOff + 2.5), fz = c.z + c.nz * (c.maxOff + 2.5);
      veg.push(['shrub', fx, fz, 1.0 + rand() * 0.4, rand() * 6.28, T.heightAt(fx, fz) - 0.05], ['fern', fx + 1.2, fz - 0.8, 0.9, 1, T.heightAt(fx + 1.2, fz - 0.8) - 0.05]);
    }
    // 岩肩与裂隙里的草木：在岩面朝上的局部（岩肩顶）挂灌木、蕨，偶有小松；不铺满，石面大部分留白
    {
      const nr = geoAll.attributes.normal.array;
      let lastS = -1e9;
      for (let i = 2; i < NC - 2; i++) {
        const sAt = cols[i].s;
        if (sAt - lastS < 5.5) continue;
        for (let r = 5; r < NR - 4; r++) {
          const k = i * NR + r;
          if (nr[k * 3 + 1] < 0.6 || pos[k * 3 + 1] < cols[i].foot + 2) continue;
          if (rand() > 0.35) break;
          const x = pos[k * 3] - cols[i].nx * 0.35, z = pos[k * 3 + 2] - cols[i].nz * 0.35, y = pos[k * 3 + 1];
          const kk = rand();
          veg.push([kk < 0.22 ? 'pine' : kk < 0.65 ? 'shrub' : 'fern', x, z, kk < 0.22 ? 0.4 + rand() * 0.2 : 0.65 + rand() * 0.45, rand() * 6.28, y - 0.12]);
          lastS = sAt;
          break;
        }
      }
    }
    // 崖口的孤松：离建筑有空隙，且背后没有高墙（树冠不穿进台沿栏杆与墙顶）
    for (let s = 6 + rand() * 8; s < L.L - 6; s += 12 + rand() * 14) {
      const i = Math.min(NC - 1, Math.round(s / L.ds)), c = cols[i];
      if (c.H < 6) continue;
      const x = c.x + c.nx * 0.2, z = c.z + c.nz * 0.2;
      if (nearFootprint(ctx, x, z, 3.5)) continue;
      const tp = T.padAt(c.x - c.nx * 3.2, c.z - c.nz * 3.2);
      if (tp && tp.id === 'lingchiLook') continue;                                  // 观云台前不遮视线
      if (STAIRS.some((st) => Math.abs(x - st.x) < st.w / 2 + 3.5 && z < st.bottom[0] + 3.5 && z > st.top[0] - 3.5)) continue;   // 台阶口不挡
      if (T.heightAt(c.x - c.nx * 3.4, c.z - c.nz * 3.4) - c.top > 2.2) continue;
      rimTrees.push({ x, z, y: c.top - 0.1, run: run.id, s });
    }
    run._cols = cols;
  }
  // 谷底：少数几处成组的山石（每谷 5 组，每组 2–4 块），不在整片谷底均匀撒石
  for (const v of T.valleys || []) {
    const rr = mulberry32(v.id.length * 71 + 5);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of v.poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    let groups = 0;
    for (let tries = 0; tries < 400 && groups < 5; tries++) {
      const x = x0 + rr() * (x1 - x0), z = z0 + rr() * (z1 - z0);
      if (T.inValley(x, z) !== v || T.waterAt(x, z) != null || T.cliffMaskAt(x, z) > 1) continue;
      if (T.heightAt(x, z) > 0.5 || T.normalAt(x, z).y < 0.82) continue;
      const n = 2 + Math.floor(rr() * 3);
      for (let k = 0; k < n; k++) {
        const px = x + (rr() - 0.5) * 4, pz = z + (rr() - 0.5) * 4, sc = k === 0 ? 1.6 + rr() * 1.6 : 0.6 + rr() * 0.8;
        veg.push(['rock', px, pz, sc, rr() * 6.28, T.heightAt(px, pz) - 0.3 * sc]);
      }
      groups++;
    }
  }
  // 崖脚落水潭：青玉色水面，落点处翻白沫；潭沿几块卵石
  for (const P of T.pools || []) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(P.r + 0.35, 40), poolMaterial());
    m.rotation.x = -Math.PI / 2; m.position.set(P.x, P.level, P.z); m.receiveShadow = true;
    m.name = 'plunge-pool';
    scene.add(m);
    const rr = mulberry32(51);
    for (let a = 0.4; a < Math.PI * 2 - 0.4; a += 0.55 + rr() * 0.5) {
      const r = P.r + 0.5 + rr() * 0.8, x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
      if (Math.cos(a) < -0.55) continue;                  // 瀑布一侧留空
      veg.push(['rock', x, z, 0.55 + rr() * 0.8, rr() * 6.28, T.heightAt(x, z) - 0.2]);
    }
  }
  const kinds = ['mPine03', 'pineOld', 'mPine04', 'pine'];
  rimTrees.forEach((t, i) => veg.push([kinds[i % kinds.length], t.x, t.z, kinds[i % kinds.length].startsWith('m') ? 0.85 + (i % 3) * 0.12 : 0.8 + (i % 2) * 0.15, (i * 2.3) % 6.28, t.y]));
  ctx.cliffs = { meshes, mat, tris };
  return { meshes, veg, tris };
}
