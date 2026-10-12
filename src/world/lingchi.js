// 灵池（第九轮依参考包 G 区效果图、D04 荷花、D05 水景、D08-03 石桥、D08-04 修炼岛重做）：
//   池盆约占池台 36%（谐波轮廓的椭圆，半轴 19.5 × 14 米）；池外环池主通道 2.4–3 米宽，花坛、石灯都在通道之外；
//   池壁（水线上一道湿痕、水下偏青苔色）、池底（近岸一圈卵石浅滩 → 池心深处，水深 0.32 → 1.5 米）、压顶（约 0.6 米宽、圆角挑出、青玉嵌线）、水面分开做；
//   水位比压顶低 0.37 米。水面：浅处 #8CC8BC、深处 #417F83，按水深混合透明度（浅处看得见卵石与焦散），小幅波纹、菲涅尔反光；
//   修炼岛（D08-04）：直径 7.2 米，两层石台出水，台面为与演武场同一套的石、玉、铜镶嵌阵面，外缘汉白玉栏杆（古铜莲苞望柱头），南北桥口留空，不加亭盖；
//   南北石桥（D08-03）：桥面高出水面 1.25 米，两端按真实高差做踏步（岸侧 6 级、岛侧 3 级），弧券桥身，栏杆顺踏步斜下，桥头抱鼓石；
//   水链：东北假山顶岩缝出泉 → 石面短水道 → 两叠园林瀑布 → 池中落点（白沫、涟漪、水雾）→ 东缘压顶的溢流缺口 → 石渠 → 螭首吐水 → 东崖瀑布 → 谷底落水潭；
//   荷花（D04）：盛花（三轮花瓣、黄蕊、莲蓬）、花苞、浮叶与立叶（叶柄连到池底）、莲蓬，沿浅水岸成簇，大部分水面留空；
//   南侧原三间门楼换成通透的三间牌坊，从观云台望得见池心岛。
// 修炼（灵池静修）：待机时池面有灵光浮起；修炼时阵面的卦与符文依次转亮，灵光自池面盘旋汇向打坐的人，池面自台缘荡开一圈圈光纹。
import * as THREE from 'three';
import { Builder, C, registerEnvMat } from './arch/builder.js';
import { rail, beam, roofAssembly, dougong, plaqueMesh } from './arch/arch.js';
import { paintedBeam } from './arch/gate8.js';
import { stoneLanternR, censerR, jadePillar } from './arch/ornaments.js';
import { columnBase } from './arch/stone9.js';
import { BASINS, basinShape, basinRim, PADS } from './layout.js';
import { GLOBAL, FOGU, injectFog, shaderMaterial, NOISE_GLSL } from './shaderlib.js';
import { waterfall } from './falls.js';
import { cliffMaterial } from './cliffs.js';
import { arrayTextures } from './qi.js';
import * as P8 from './arch/props.js';
import { mulberry32 } from '../core/math.js';

const TAU = Math.PI * 2;
const B = BASINS.find((q) => q.id === 'lingchi');
const SP = BASINS.find((q) => q.id === 'spill');
const PAD = PADS.find((p) => p.id === 'lingchi');
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const LC = {
  cx: B.x, cz: B.z, water: B.y, top: PAD.y,
  deep: 1.5, shallow: 0.32, shelf0: 0.5, shelf1: 0.86,     // 水深：池心 1.5 米 → 近岸浅滩 0.32 米（按归一化半径 t）
  plat: { r: 3.6, y: PAD.y + 0.42 },                      // 修炼岛：半径 3.6 米（直径 7.2）
  deckY: B.y + 1.25,                                      // 桥面
  westZ: 25.5, northX: B.x,
};
LC.floor = B.y - LC.deep;
const depthAt = (t) => LC.deep + (LC.shallow - LC.deep) * sm(LC.shelf0, LC.shelf1, t);
const SPZ = (SP.rect[2] + SP.rect[3]) / 2;

// ---------- 池岸轮廓 ----------
const rimAt = (a, off = 0) => basinRim(B, a, off);
function rimNormal(a) {
  const [x0, z0] = rimAt(a - 0.01), [x1, z1] = rimAt(a + 0.01);
  const tx = x1 - x0, tz = z1 - z0, l = Math.hypot(tx, tz) || 1;
  return [tz / l, -tx / l];
}
function angleTo(x, z) { return Math.atan2((z - B.z) / B.rz, (x - B.x) / B.rx); }
function basinT(x, z) { const ex = (x - B.x) / B.rx, ez = (z - B.z) / B.rz; return Math.hypot(ex, ez) / basinShape(B, Math.atan2(ez, ex)); }
const floorY = (x, z) => B.y - depthAt(Math.min(1, basinT(x, z)));
// 东缘溢流缺口：压顶与池壁顶在此降到水面
const inNotch = (x, z) => x > B.x + 10 && Math.abs(z - SPZ) < 0.95;
const SHAPE_GLSL = `1.${B.shape.map(([n, amp, ph]) => ` + ${amp.toFixed(4)} * sin(${n.toFixed(1)} * a + ${ph.toFixed(4)})`).join('')}`;

// 池壁 + 压顶：沿轮廓的带状网格（行：[离轮廓外移, 高度, 颜色]）
function rimGeometry(N = 240) {
  const top = LC.top, wl = B.y, fl = B.y - LC.shallow - 0.1;
  const c = (h) => new THREE.Color(h);
  const cUnder = c(0x7d8b7f), cWet = c(0x99998b), cWall = c(0xd2ccbd), cNose = c(0xc8c1b1), cCap = c(0xdcd7ca), cJade = c(0x89b5ab), cEdge = c(0xbab3a3);
  const rows = (notch) => {
    const T = notch ? wl + 0.04 : top, cc = notch ? cWet : cCap;
    return [
      [0, fl, cUnder], [0, wl - 0.03, cUnder], [0, wl + 0.01, cWet], [0, wl + 0.11, cWet], [0, wl + 0.16, cWall], [0, T - 0.02, notch ? cWet : cWall],
      [-0.07, T - 0.02, cNose], [-0.085, T + 0.05, cNose], [-0.05, T + 0.12, cc], [0.18, T + 0.12, cc], [0.2, T + 0.125, notch ? cWet : cJade], [0.28, T + 0.125, notch ? cWet : cJade],
      [0.3, T + 0.12, cc], [0.56, T + 0.12, cc], [0.6, T + 0.06, cEdge], [0.68, T, cEdge],
    ];
  };
  const pos = [], col = [], idx = [];
  let R = 0;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU, [nx, nz] = rimNormal(a), [x, z] = rimAt(a);
    const rr = rows(inNotch(x, z));
    R = rr.length;
    for (const [o, y, cl] of rr) { pos.push(x + nx * o, y, z + nz * o); col.push(cl.r, cl.g, cl.b); }
  }
  for (let i = 0; i < N; i++) for (let r = 0; r < R - 1; r++) {
    const a = i * R + r, b = a + 1, c2 = a + R, d = c2 + 1;
    idx.push(a, c2, b, b, c2, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return ng;
}

// ---------- 池底：卵石浅滩 → 深处（贴图按世界坐标铺，越深越暗、越偏青；浅处有焦散）----------
function pebbleTexture() {
  const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), rand = mulberry32(77);
  g.fillStyle = '#8b897b'; g.fillRect(0, 0, S, S);
  const tones = [[190, 184, 170], [160, 156, 144], [204, 198, 186], [128, 130, 122], [176, 166, 148], [142, 150, 140], [168, 172, 160]];
  for (let i = 0; i < 1700; i++) {
    const x = rand() * S, y = rand() * S, rx = 9 + rand() * 24, ry = rx * (0.6 + rand() * 0.35), a = rand() * Math.PI;
    const [r0, g0, b0] = tones[Math.floor(rand() * tones.length)], v = 0.7 + rand() * 0.24;
    for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      const px = x + dx, py = y + dy;
      if (px < -40 || px > S + 40 || py < -40 || py > S + 40) continue;
      g.fillStyle = 'rgba(64,64,56,.5)'; g.beginPath(); g.ellipse(px + 1.5, py + 2, rx + 2.5, ry + 2.5, a, 0, TAU); g.fill();
      g.fillStyle = `rgb(${(r0 * v) | 0},${(g0 * v) | 0},${(b0 * v) | 0})`; g.beginPath(); g.ellipse(px, py, rx, ry, a, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,248,.09)'; g.beginPath(); g.ellipse(px - rx * 0.2, py - ry * 0.25, rx * 0.55, ry * 0.45, a, 0, TAU); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
function floorGeometry(N = 128) {
  const T = [0, 0.12, 0.25, 0.38, 0.5, 0.6, 0.7, 0.78, 0.86, 0.91, 0.95, 0.98, 1.0];
  const pos = [], idx = [];
  for (const t of T) for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU, f = basinShape(B, a);
    pos.push(B.x + Math.cos(a) * B.rx * f * t, B.y - depthAt(t), B.z + Math.sin(a) * B.rz * f * t);
  }
  for (let j = 0; j < T.length - 1; j++) for (let i = 0; i < N; i++) {
    const a = j * N + i, b = j * N + ((i + 1) % N), c = (j + 1) * N + i, d = (j + 1) * N + ((i + 1) % N);
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function floorMaterial() {
  const mat = new THREE.MeshStandardMaterial({ map: pebbleTexture(), roughness: 0.82 });
  mat.onBeforeCompile = (sh) => {
    injectFog(sh);
    sh.uniforms.uTime = GLOBAL.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFW = (modelMatrix * vec4(transformed, 1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; varying vec3 vFW;
        ${NOISE_GLSL}`)
      .replace('#include <map_fragment>', `diffuseColor *= texture2D(map, vFW.xz / 1.5);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float d = ${B.y.toFixed(3)} - vFW.y;
        // 水深吸收：越深越暗、越偏青（深处看不清卵石）
        diffuseColor.rgb = mix(diffuseColor.rgb * vec3(.6, .8, .76), vec3(.03, .12, .13), smoothstep(.25, 1.4, d) * .9);
        vec2 q = vFW.xz * .9;
        float c1 = abs(nzv(q + vec2(uTime * .22, uTime * .13)) - nzv(q * 1.3 - vec2(uTime * .17, -uTime * .2)));
        float caus = pow(smoothstep(.0, .12, .12 - c1), 2.) * (1. - smoothstep(.45, 1.2, d));
        diffuseColor.rgb += vec3(.42, .55, .5) * caus * .22;`);
  };
  mat.customProgramCacheKey = () => 'lingchi-floor9';
  return mat;
}

// ---------- 池水 ----------
function poolWaterMaterial(env, u) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, envMap: env, envMapIntensity: 1.0, depthWrite: false });
  mat.onBeforeCompile = (sh) => {
    injectFog(sh);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uPulse, uLevel; uniform vec2 uCenter, uFall; varying vec3 vLW;
        ${NOISE_GLSL}
        float shapeF(float a){ return ${SHAPE_GLSL}; }
        float basinT(vec2 p){ vec2 e = (p - uCenter) / vec2(${B.rx.toFixed(2)}, ${B.rz.toFixed(2)}); return length(e) / shapeF(atan(e.y, e.x)); }
        float rip(vec2 p){ return nzv(p * 1.6 + vec2(uTime * .11, uTime * .07)) * .55 + nzv(p * 3.7 - vec2(uTime * .17, -uTime * .05)) * .3 + nzv(p * 8.3 + uTime * .23) * .15; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float bt = min(basinT(vLW.xz), 1.);
        float dep = mix(${LC.deep.toFixed(2)}, ${LC.shallow.toFixed(2)}, smoothstep(${LC.shelf0.toFixed(2)}, ${LC.shelf1.toFixed(2)}, bt));
        float kd = smoothstep(.28, 1.35, dep);
        vec3 cS = vec3(.262, .578, .502), cD = vec3(.053, .212, .227);     // 浅 #8CC8BC、深 #417F83（线性值）
        diffuseColor.rgb = mix(cS, cD, kd) * (.94 + .12 * nzf(vLW.xz * .09 + 2.));
        float wa = mix(.22, .84, kd);
        // 落水处：翻涌的白沫，向外渐散
        float df = length(vLW.xz - uFall);
        float foam = smoothstep(.42, .75, nzf(vLW.xz * 2.6 + vec2(uTime * .9, -uTime * .7))) * (1. - smoothstep(.3, 2.1, df));
        foam = max(foam, (1. - smoothstep(.2, .95, df)) * .85);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.86, .9, .9), foam);
        diffuseColor.a = mix(wa, .96, foam);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 p = vLW.xz; float e = .07, h0 = rip(p);
          vec2 g = vec2(rip(p + vec2(e, 0.)) - h0, rip(p + vec2(0., e)) - h0) / e;
          float dc = length(vLW.xz - uCenter);
          float ring = sin(dc * 3.2 - uTime * 3.4) * exp(-max(dc - ${LC.plat.r.toFixed(2)}, 0.) * .22) * step(${(LC.plat.r + 0.4).toFixed(2)}, dc) * uPulse;
          g += normalize(vLW.xz - uCenter + 1e-4) * ring * .9;
          // 落水点的同心涟漪
          float df = length(vLW.xz - uFall);
          g += normalize(vLW.xz - uFall + 1e-4) * sin(df * 7. - uTime * 5.) * exp(-df * .5) * 1.7;
          vec3 wN = normalize(vec3(-g.x * .05, 1., -g.y * .05));
          normal = normalize((viewMatrix * vec4(wN, 0.)).xyz);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec2 cp = floor(vLW.xz * 2.2), cf = fract(vLW.xz * 2.2) - .5;
          float tw = fract(sin(dot(cp, vec2(12.9898, 78.233))) * 43758.5453);
          vec2 jo = vec2(fract(tw * 7.31), fract(tw * 13.7)) - .5;
          float spark = step(.988, tw) * pow(max(0., sin(uTime * (1.5 + tw * 3.) + tw * 40.)), 8.) * smoothstep(.09, .0, length(cf - jo * .6));
          float dc = length(vLW.xz - uCenter);
          float ring = max(0., sin(dc * 3.2 - uTime * 3.4)) * exp(-max(dc - ${LC.plat.r.toFixed(2)}, 0.) * .22) * step(${(LC.plat.r + 0.4).toFixed(2)}, dc) * uPulse;
          totalEmissiveRadiance += vec3(.55, 1., .9) * (spark * (.4 + uLevel) + ring * .22);
        }`)
      .replace('#include <opaque_fragment>', `
        // 菲涅尔：斜看时反光更多（不透明度随之升高），正看时透出池底
        float fr = pow(1. - clamp(dot(normal, normalize(vViewPosition)), 0., 1.), 4.);
        gl_FragColor = vec4(outgoingLight, clamp(diffuseColor.a + fr * .55, 0., 1.));`);
  };
  mat.customProgramCacheKey = () => 'lingchi-water9';
  return mat;
}

// 石面水道（假山顶的短水道、跌水台面）：顺流的细条纹、浅青透明
function streamMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide,
    uniforms: { uTime: GLOBAL.uTime, uNight: FOGU.uNight },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `${NOISE_GLSL}
      uniform float uTime, uNight; varying vec2 vUv;
      void main(){
        float s = nzv(vec2(vUv.x * 6., vUv.y * 4. - uTime * 1.8)) * .6 + nzv(vec2(vUv.x * 15., vUv.y * 9. - uTime * 2.9)) * .4;
        float edge = smoothstep(0., .2, vUv.x) * smoothstep(1., .8, vUv.x);
        float lip = smoothstep(.82, 1., vUv.y);
        vec3 c = mix(vec3(.5, .74, .7), vec3(.93, .96, .95), smoothstep(.55, .88, s) * .75 + lip * .45);
        gl_FragColor = vec4(c * (1. - uNight * .65), (.5 + .38 * s + lip * .2) * edge);
      }`,
  });
}

// ---------- 荷花（D04）----------
// 花瓣：自原点沿 +Y 伸出、宽沿 X、内面朝 +Z；横向内卷（cup）、尖端外翻（back）；顶点色自瓣基白绿到瓣尖粉
function petalGeo(len, wid, cup, back, cBase, cTip) {
  const SU = 4, SV = 6, pos = [], col = [], idx = [];
  const cb = new THREE.Color(cBase), ct = new THREE.Color(cTip), cc = new THREE.Color();
  for (let j = 0; j <= SV; j++) {
    const v = j / SV, w = wid * Math.pow(Math.sin(Math.PI * (0.1 + 0.9 * v)), 0.75) * (1 - 0.25 * v * v * v);
    for (let i = 0; i <= SU; i++) {
      const u = (i / SU) * 2 - 1;
      pos.push(u * w / 2, v * len, cup * u * u * w - back * v * v * len);
      cc.copy(cb).lerp(ct, Math.pow(v, 1.25) * (0.72 + 0.28 * Math.abs(u)));
      col.push(cc.r, cc.g, cc.b);
    }
  }
  for (let j = 0; j < SV; j++) for (let i = 0; i < SU; i++) { const a = j * (SU + 1) + i, b = a + 1, c = a + SU + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g.toNonIndexed();
}
function colored(g, hex) {
  const out = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex), n = out.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  out.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return out;
}
function mergeParts(parts) {
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeVertexNormals();
  return out;
}
// 盛花：外、中、内三轮花瓣（8、8、6），黄蕊一圈，中心莲蓬；花托底在原点（接花梗）
function bloomGeometry() {
  const parts = [];
  const whorl = (n, len, wid, tilt, r0, off, cB, cT, cup, back, y0) => {
    for (let i = 0; i < n; i++) {
      const g = petalGeo(len, wid, cup, back, cB, cT);
      g.rotateX(-tilt); g.translate(0, y0, -r0); g.rotateY((i / n) * TAU + off);
      parts.push(g);
    }
  };
  whorl(8, 0.125, 0.07, 1.08, 0.022, 0, 0xf5eee8, 0xdc9fb3, 0.22, 0.1, 0.0);
  whorl(8, 0.115, 0.064, 0.72, 0.02, Math.PI / 8, 0xf8f2ee, 0xe5b2c2, 0.26, 0.06, 0.008);
  whorl(6, 0.09, 0.054, 0.36, 0.016, 0.3, 0xfbf7f4, 0xf1d2db, 0.3, 0.02, 0.014);
  // 黄蕊：花托上一圈细丝
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * TAU, g = new THREE.BoxGeometry(0.004, 0.034, 0.004);
    g.translate(0, 0.017, 0); g.rotateX(-0.45); g.translate(0, 0.02, -0.03); g.rotateY(a);
    parts.push(colored(g, i % 3 ? 0xe9b53c : 0xf3d27a));
  }
  // 莲蓬（花心）：上平下收，顶面浅黄绿
  const pod = new THREE.CylinderGeometry(0.028, 0.017, 0.028, 12).translate(0, 0.034, 0);
  parts.push(colored(pod, 0xd2d47c));
  const base = new THREE.CylinderGeometry(0.02, 0.012, 0.03, 8).translate(0, 0.0, 0);
  parts.push(colored(base, 0x7f9a52));
  return mergeParts(parts);
}
// 花苞：五瓣合拢的桃形，基部白绿、尖端粉红
function budGeometry() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const g = petalGeo(0.15, 0.085, 0.55, -0.04, 0xe9eedb, 0xc96a8e);
    g.rotateX(0.22); g.translate(0, 0.005, -0.032); g.rotateY((i / 5) * TAU);
    parts.push(g);
  }
  parts.push(colored(new THREE.CylinderGeometry(0.018, 0.012, 0.03, 8), 0x7f9a52));
  return mergeParts(parts);
}
// 莲蓬（D04-04）：倒圆锥，顶面平、颜色由绿到褐
function podGeometry() {
  const g = new THREE.CylinderGeometry(0.055, 0.022, 0.07, 14, 1).translate(0, 0.035, 0);
  const P = g.attributes.position, col = new Float32Array(P.count * 3), c0 = new THREE.Color(0x8a9152), c1 = new THREE.Color(0xa59a62), cc = new THREE.Color();
  for (let i = 0; i < P.count; i++) { cc.copy(c0).lerp(c1, P.getY(i) / 0.07); col.set([cc.r, cc.g, cc.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return mergeParts([g.toNonIndexed()]);
}
// 荷叶：中央着生的圆叶（叶柄在叶心），边缘起伏；cupK 为整体内凹，wave 为叶缘起伏；uv 供叶脉贴图
function leafGeometry(cupK, wave) {
  const NA = 30, NR = 5, pos = [], uv = [], idx = [];
  pos.push(0, 0, 0); uv.push(0.5, 0.5);
  for (let r = 1; r <= NR; r++) for (let i = 0; i < NA; i++) {
    const a = (i / NA) * TAU, t = r / NR, R = 1 + 0.04 * Math.sin(5 * a) + 0.025 * Math.sin(9 * a + 1);
    const x = Math.cos(a) * R * t, z = Math.sin(a) * R * t;
    pos.push(x, cupK * t * t + wave * Math.sin(7 * a + 0.6) * t * t * t, z);
    uv.push(0.5 + x * 0.5, 0.5 + z * 0.5);
  }
  for (let i = 0; i < NA; i++) idx.push(0, 1 + ((i + 1) % NA), 1 + i);
  for (let r = 1; r < NR; r++) for (let i = 0; i < NA; i++) {
    const a = 1 + (r - 1) * NA + i, b = 1 + (r - 1) * NA + ((i + 1) % NA), c = 1 + r * NA + i, d = 1 + r * NA + ((i + 1) % NA);
    idx.push(a, d, c, a, b, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function leafTexture() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), c = S / 2;
  const gr = g.createRadialGradient(c, c, 4, c, c, c);
  gr.addColorStop(0, '#9cb862'); gr.addColorStop(0.25, '#7ea052'); gr.addColorStop(0.85, '#5d8646'); gr.addColorStop(0.97, '#557a40'); gr.addColorStop(1, '#8a6f45');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(196,214,150,.5)'; g.lineWidth = 2;
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU;
    g.beginPath(); g.moveTo(c, c);
    for (let t = 0.1; t <= 1.0; t += 0.1) g.lineTo(c + Math.cos(a + Math.sin(t * 3) * 0.04) * t * c * 0.97, c + Math.sin(a + Math.sin(t * 3) * 0.04) * t * c * 0.97);
    g.stroke();
  }
  g.fillStyle = '#b8c97a'; g.beginPath(); g.arc(c, c, 6, 0, TAU); g.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------- 假山（程序化岩块：圆角块体 + 三维噪声起伏，崖岩材质与苔藓、湿痕）----------
function noise3(seed) {
  const h = (x, y, z) => { let n = (x * 374761393 + y * 668265263 + z * 1274126177 + seed * 974711) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const f = (x) => x * x * (3 - 2 * x);
  return (x, y, z) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = f(x - ix), fy = f(y - iy), fz = f(z - iz);
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(h(ix, iy, iz), h(ix + 1, iy, iz), fx), l(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), fx), fy),
      l(l(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), fx), l(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), fx), fy), fz);
  };
}
// 一块岩体（叠石，D05-01）：由 2–4 层略错开、略扭转的厚岩板叠成，每层是轻微倒角的块体 + 小幅三维起伏，层间留出凹缝与岩台；
// 中心 (x, z)，底 y0、顶 y1，水平尺寸 w × d，转角 ry；wetAt(x, y, z) → 0–1（落水冲刷处，苔藓与湿痕）
function rockSlab(list, { x, z, y0, y1, w, d, ry, n3, vari, tilt }, wetAt) {
  const g = new THREE.BoxGeometry(1, 1, 1, 5, 3, 5);
  const P = g.attributes.position, n = P.count, h = y1 - y0;
  const pos = new Float32Array(n * 3), rock = new Float32Array(n * 3);
  const cr = Math.cos(ry), sr = Math.sin(ry), amp = Math.min(w, d, h) * 0.16;
  for (let i = 0; i < n; i++) {
    let vx = P.getX(i) * 2, vy = P.getY(i) * 2, vz = P.getZ(i) * 2;
    // 倒角：只削去棱角（块体感仍在）
    const k = 1 - 0.07 * (vx * vx * vz * vz) - 0.1 * (vy > 0 ? vy * vy * (vx * vx + vz * vz) : 0);
    vx *= k; vz *= k;
    const lx = vx * w / 2, lz = vz * d / 2, ly = (vy * 0.5 + 0.5) * h;
    const dn = (n3(lx * 0.8 + 11, ly * 0.6, lz * 0.8) - 0.5) * 2 + (n3(lx * 2.2, ly * 1.7 + 5, lz * 2.2) - 0.5) * 0.6;
    const side = Math.abs(vy) < 0.99 ? 1 : 0;
    const ox = lx + vx * dn * amp * side, oz = lz + vz * dn * amp * side;
    const oy = ly + (vy > 0.99 ? dn * amp * 0.25 + lx * tilt[0] + lz * tilt[1] : vy < -0.99 ? 0 : dn * amp * 0.3);
    const wx = x + ox * cr + oz * sr, wz = z - ox * sr + oz * cr, wy = y0 + oy;
    pos.set([wx, wy, wz], i * 3);
    rock.set([Math.min(1, Math.max(0, 0.42 - dn * 0.45 + (vy < -0.6 ? 0.25 : 0))), wetAt ? wetAt(wx, wy, wz) : 0, vari], i * 3);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('aRock', new THREE.BufferAttribute(rock, 3));
  out.setIndex(g.index);
  list.push(out.toNonIndexed());
}
function rockMass(list, { x, z, y0, y1, w, d, ry = 0, seed = 1 }, wetAt) {
  const rnd = mulberry32(seed * 7 + 3), n3 = noise3(seed), vari = rnd();
  const h = y1 - y0, nL = Math.max(1, Math.min(4, Math.round(h / 1.15)));
  let y = y0;
  for (let i = 0; i < nL; i++) {
    const last = i === nL - 1, hh = last ? y1 - y : (h / nL) * (0.85 + rnd() * 0.3);
    const sc = 1 - 0.1 * i, ww = w * sc * (0.92 + rnd() * 0.12), dd = d * sc * (0.92 + rnd() * 0.12);
    const ox = (rnd() - 0.5) * w * 0.14, oz = (rnd() - 0.5) * d * 0.14, cr = Math.cos(ry), sr = Math.sin(ry);
    rockSlab(list, { x: x + ox * cr + oz * sr, z: z - ox * sr + oz * cr, y0: y - (i ? 0.08 : 0), y1: y + hh, w: ww, d: dd, ry: ry + (rnd() - 0.5) * 0.3, n3, vari, tilt: last ? [(rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.12] : [0, 0] }, wetAt);
    y += hh;
  }
}

// ---------- 石桥（D08-03）：沿 x = X 的南北向桥；zI 岛侧端，zS 岸侧端（压顶外沿）----------
function bridge9(b, X, zI, zS) {
  const dir = Math.sign(zS - zI), W = 2.9, deck = LC.deckY, run = 0.33;
  const nS = Math.max(2, Math.round((deck - LC.top) / 0.17)), rS = (deck - LC.top) / nS;
  const nI = Math.max(2, Math.round((deck - LC.plat.y) / 0.19)), rI = (deck - LC.plat.y) / nI;
  const zD1 = zS - dir * (nS - 1) * run, zD0 = zI + dir * (nI - 1) * run;      // 桥面两端
  // 踏步：自桥面一级级下到岸面 / 岛面（实体落到池底，兼作桥台）
  const steps = (z0, n, rise, d) => {
    for (let k = 1; k < n; k++) {
      const y = deck - k * rise, za = z0 + d * (k - 1) * run, zb = z0 + d * k * run, zm = (za + zb) / 2;
      const base = floorY(X, zm) - 0.1;
      b.slab(W - 0.4, y - base, run + 0.02, C.marbleWarm, X, base, zm, { mat: 'stoneSmooth', jitter: 0.06 });
      b.box(W - 0.42, rise * 0.86, 0.014, C.marbleShade, X, y + rise * 0.5, za + d * 0.008, { mat: 'stoneSmooth', col: false });   // 踢面略暗
    }
  };
  steps(zD1, nS, rS, dir);
  steps(zD0, nI, rI, -dir);
  // 桥身：一道弧券（拉伸的侧面轮廓：桥面底、两端桥墩、弧形券底）
  const za = Math.min(zD0, zD1), zb = Math.max(zD0, zD1), L = zb - za, zm = (za + zb) / 2;
  const S = L - 1.4, crown = deck - 0.22 - 0.32, spring = B.y + 0.05, hA = crown - spring;
  const R = (S * S / 4 + hA * hA) / (2 * hA), yc = crown - R;
  const sh = new THREE.Shape(), lo = Math.min(floorY(X, za), floorY(X, zb)) - 0.1;
  sh.moveTo(-L / 2, lo); sh.lineTo(-L / 2, deck - 0.22); sh.lineTo(L / 2, deck - 0.22); sh.lineTo(L / 2, lo); sh.lineTo(S / 2, lo); sh.lineTo(S / 2, spring);
  const NA = 20;
  for (let i = 1; i < NA; i++) { const u = S / 2 - (i / NA) * S; sh.lineTo(u, yc + Math.sqrt(Math.max(0, R * R - u * u))); }
  sh.lineTo(-S / 2, spring); sh.lineTo(-S / 2, lo); sh.closePath();
  const ext = new THREE.ExtrudeGeometry(sh, { depth: W - 0.5, bevelEnabled: false, curveSegments: 8 });
  ext.rotateY(-Math.PI / 2); ext.translate((W - 0.5) / 2, 0, 0);
  b.add(ext, C.marbleShade, 'stone', { x: X, z: zm, col: false });
  // 券脸：两面一道弧形券石（略凸出），券顶一块青玉龙门石
  const arc = 2 * Math.asin(Math.min(1, S / 2 / R));
  for (const s of [-1, 1]) {
    b.add(new THREE.TorusGeometry(R + 0.12, 0.14, 4, 24, arc), C.marbleWarm, 'stoneSmooth', { x: X + s * ((W - 0.5) / 2 + 0.02), y: yc, z: zm, rz: Math.PI / 2 - arc / 2, ry: Math.PI / 2, col: false });
    b.box(0.08, 0.34, 0.5, C.jade, X + s * ((W - 0.5) / 2 + 0.06), crown + 0.1, zm, { mat: 'jade', col: false });
  }
  // 桥面（可走）、桥面两侧挑出的压边
  b.slab(W, 0.22, L + 0.02, C.marble, X, deck - 0.22, zm, { mat: 'stoneSmooth' });
  b.slab(W + 0.16, 0.08, L, C.marbleWarm, X, deck - 0.3, zm, { mat: 'stoneSmooth', col: false });
  // 栏杆：桥面段为 D02-01 石栏（古铜莲苞柱头），踏步段顺坡斜下
  const xr = W / 2 - 0.13;
  for (const s of [-1, 1]) {
    rail(b, [[X + s * xr, zD0], [X + s * xr, zD1]], deck, { h: 0.9, spacing: 1.6, post: 0.18, cap: 'bronze' });
    for (const [z0, y0, z1, y1] of [[zD1, deck, zS, LC.top], [zD0, deck, zI, LC.plat.y]]) {
      const xx = X + s * xr, h = 0.9;
      beam(b, xx, y0 + h - 0.045, z0, xx, y1 + h - 0.045, z1, 0.09, C.marble, 'stoneSmooth', false, 0.1);           // 寻杖
      beam(b, xx, y0 + 0.07, z0, xx, y1 + 0.07, z1, 0.14, C.marbleWarm, 'stoneSmooth', false, 0.18);             // 垂带上的地栿
      beam(b, xx, y0 + 0.42, z0, xx, y1 + 0.42, z1, 0.46, C.marble, 'stoneSmooth', false, 0.08);                 // 栏板
      for (const e of [-1, 1]) beam(b, xx + e * 0.046, y0 + 0.42, z0, xx + e * 0.046, y1 + 0.42, z1, 0.26, C.jade, 'jade', false, 0.012);
      b.collider(xx, Math.min(y0, y1), Math.max(y0, y1) + h, (z0 + z1) / 2, 0.12, Math.abs(z1 - z0) / 2, 0, { walk: false, cam: false });
    }
    // 岸侧桥头：方望柱（古铜帽、铜莲苞）+ 抱鼓石
    const xx = X + s * xr, ze = zS - dir * 0.12;
    b.slab(0.26, 1.2, 0.26, C.marble, xx, LC.top, ze, { mat: 'stoneSmooth', col: false });
    for (const e of [-1, 1]) b.box(0.012, 0.6, 0.14, C.jade, xx + e * 0.136, LC.top + 0.62, ze, { mat: 'jade', col: false });
    b.slab(0.34, 0.12, 0.34, C.bronze, xx, LC.top + 1.2, ze, { mat: 'bronze', col: false });
    b.sphere(0.12, C.bronze, xx, LC.top + 1.42, ze, { mat: 'bronze', sy: 1.3, seg: 10, seg2: 7 });
    b.slab(0.24, 0.42, 0.66, C.marbleWarm, xx + s * 0.02, LC.top, zS + dir * 0.36, { mat: 'stoneSmooth' });
    b.cyl(0.3, 0.3, 0.24, C.marbleWarm, xx + s * 0.02, LC.top + 0.62, zS + dir * 0.3, { rz: Math.PI / 2, seg: 16, mat: 'stoneSmooth', col: false });
  }
  return { zD0, zD1, zI, zS, W };
}

// ---------- 南侧牌坊（三间四柱，明间高、次间低；通透无门，望得见池心岛）----------
function paifang9(b, text) {
  const W1 = 3.8, W2 = 2.5, H1 = 5.1, H2 = 4.1;
  const xs = [-(W1 / 2 + W2), -W1 / 2, W1 / 2, W1 / 2 + W2];
  for (const x of xs) {
    const H = Math.abs(x) < W1 ? H1 : H2;
    // 夹杆石：四面青玉嵌板
    b.slab(0.82, 1.05, 0.82, C.marbleShade, x, 0, 0, { mat: 'stoneSmooth' });
    b.slab(0.9, 0.12, 0.9, C.marbleWarm, x, 1.05, 0, { mat: 'stoneSmooth', col: false });
    for (const [px, pz, ry] of [[0, 0.412, 0], [0, -0.412, Math.PI], [0.412, 0, Math.PI / 2], [-0.412, 0, -Math.PI / 2]]) b.box(0.46, 0.5, 0.02, C.jade, x + px, 0.55, pz, { ry, mat: 'jade', col: false });
    columnBase(b, x, 1.17, 0, 0.2);
    b.cyl(0.19, 0.21, H - 1.17, C.vermilion, x, 1.17 + (H - 1.17) / 2, 0, { seg: 14, mat: 'wood' });
  }
  // 明间：大额枋、小额枋（彩画）、其间的花板与匾；斗拱一排；单檐庑殿小顶
  paintedBeam(b, -W1 / 2 - 0.3, W1 / 2 + 0.3, H1 - 0.58, 0, 0.4, 0.3);
  paintedBeam(b, -W1 / 2, W1 / 2, H1 - 1.55, 0, 0.3, 0.26);
  b.slab(W1 - 0.4, 0.62, 0.12, C.woodRed, 0, H1 - 1.25, 0, { mat: 'wood', col: false });
  const pq = plaqueMesh(text, 1.7, 0.58, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
  pq.position.set(0, H1 - 0.95, 0.08); b.addMesh(pq);
  const pq2 = plaqueMesh(text, 1.7, 0.58, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
  pq2.position.set(0, H1 - 0.95, -0.08); pq2.rotation.y = Math.PI; b.addMesh(pq2);
  for (let i = 0; i <= 4; i++) dougong(b, -W1 / 2 + 0.2 + (i * (W1 - 0.4)) / 4, H1 - 0.18, 0, 0.32, 0, true);
  roofAssembly(b, 'hip', W1 + 1.8, 2.2, 0.85, H1 + 0.32, C.tileDark, 'glaze', { gold: true, goldK: 0.55 });
  // 次间：额枋（彩画）与小庑殿顶
  for (const s of [-1, 1]) {
    const xm = s * (W1 / 2 + W2 / 2);
    paintedBeam(b, xm - W2 / 2, xm + W2 / 2, H2 - 0.55, 0, 0.34, 0.26);
    for (let i = 0; i <= 2; i++) dougong(b, xm - W2 / 2 + 0.3 + (i * (W2 - 0.6)) / 2, H2 - 0.2, 0, 0.26, 0, true);
    b.push(xm, 0, 0, 0);
    roofAssembly(b, 'hip', W2 + 1.0, 1.9, 0.7, H2 + 0.24, C.tileDark, 'glaze', { gold: false });
    b.pop();
  }
}

export class Lingchi {
  constructor(ctx, { env, lit, shade, quality = 'mid' } = {}) {
    this.ctx = ctx;
    const scene = ctx.scene, T = ctx.terrain, y0 = LC.top, cx = LC.cx, cz = LC.cz, P = LC.plat, X = LC.northX;
    // 东北假山的落水点（池中）：岩缝 → 水道 → 两叠瀑布 → 此处
    const aNE = -0.75, [rx0, rz0] = rimAt(aNE), [nx0, nz0] = rimNormal(aNE);
    const F0 = [rx0 - nx0 * 1.4, rz0 - nz0 * 1.4];
    this.u = { uTime: GLOBAL.uTime, uPulse: { value: 0 }, uLevel: { value: 0.2 }, uCenter: { value: new THREE.Vector2(cx, cz) }, uFall: { value: new THREE.Vector2(F0[0], F0[1]) }, uSeq: { value: 0 }, uNight: FOGU.uNight };
    this.level = 0.2; this.target = 0.2; this.seq = 0; this.on = false;
    const b = new Builder();
    // ---------- 池壁、压顶 ----------
    b.add(rimGeometry(), 0xffffff, 'stoneSmooth', { col: false, vcol: true });
    // ---------- 池底、池水 ----------
    {
      const fl = new THREE.Mesh(floorGeometry(), floorMaterial());
      fl.receiveShadow = true; fl.name = 'lingchi-floor';
      scene.add(fl);
      const N = 160, pos = [B.x, B.y, B.z], idx = [];
      for (let i = 0; i <= N; i++) { const [x, z] = rimAt((i / N) * TAU, -0.05); pos.push(x, B.y, z); }
      for (let i = 1; i <= N; i++) idx.push(0, i + 1, i);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const nrm = new Float32Array(pos.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setIndex(idx);
      this.waterMat = poolWaterMaterial(env, this.u);
      const w = new THREE.Mesh(g, this.waterMat);
      w.renderOrder = 2; w.receiveShadow = true; w.name = 'lingchi-water';
      scene.add(w);
      this.water = w;
    }
    // ---------- 修炼岛（D08-04）：两层石台出水、镶嵌阵面、栏杆（南北桥口留空）、香炉 ----------
    {
      const lowTop = y0 + 0.02;
      b.cyl(P.r + 0.32, P.r + 0.42, lowTop - LC.floor + 0.1, C.marbleShade, cx, (LC.floor - 0.1 + lowTop) / 2, cz, { seg: 56, mat: 'stone', col: false });
      b.cyl(P.r + 0.38, P.r + 0.38, 0.08, C.marbleWarm, cx, lowTop - 0.04, cz, { seg: 56, mat: 'stoneSmooth', col: false });
      for (let k = 0; k < 16; k++) {                    // 下层台壁：水面以上一圈青玉嵌板
        const a = (k / 16) * TAU + TAU / 32;
        if (Math.abs(Math.cos(a)) < 0.25) continue;       // 南北桥下不做
        b.box(0.5, 0.16, 0.03, C.jade, cx + Math.cos(a) * (P.r + 0.36), y0 - 0.1, cz + Math.sin(a) * (P.r + 0.36), { ry: -a + Math.PI / 2, mat: 'jade', col: false });
      }
      b.cyl(P.r + 0.1, P.r + 0.16, P.y - 0.12 - lowTop, C.marble, cx, (lowTop + P.y - 0.12) / 2, cz, { seg: 56, mat: 'stoneSmooth', col: false });
      b.cyl(P.r + 0.06, P.r + 0.06, 0.12, C.marbleWarm, cx, P.y - 0.06, cz, { seg: 56, mat: 'stoneSmooth', col: false });
      b.cylCollider(cx, LC.floor, P.y, cz, P.r + 0.1, { walk: true });
      // 台面：与演武场聚灵阵同一套镶嵌（太极黑白石、卷云浮雕环、八卦青玉环、符文带、外圈青玉开光、铜线）
      const L2 = { core: 1.1, scroll: 1.5, gua0: 1.56, gua1: 2.1, rune0: 2.16, rune1: 2.68, flow0: 2.72, cart0: 2.76, node: 2.9, edge: 3.14, out: P.r + 0.02, nodes: 0, twist: 0 };
      const TX = arrayTextures(L2, { S: 1024, cart: 12, glyphs: 16, chans: false, glyphFont: 0.42, cartGap: 0.1 });
      const topMat = new THREE.MeshStandardMaterial({ map: TX.map, normalMap: TX.normal, normalScale: new THREE.Vector2(2.0, 2.0), roughnessMap: TX.orm, metalnessMap: TX.orm, roughness: 1, metalness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
      registerEnvMat(topMat);
      this.u.tGlow = { value: TX.glow };
      topMat.onBeforeCompile = (sh) => {
        injectFog(sh);
        Object.assign(sh.uniforms, this.u);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vP; varying vec2 vU0;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position.xy; vU0 = uv;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uTime, uLevel, uSeq, uNight; uniform sampler2D tGlow; varying vec2 vP; varying vec2 vU0;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            {
              float g2 = texture2D(tGlow, vU0).g, r = length(vP);
              float pulse = .7 + .3 * sin(uTime * 1.7 - r * 1.2);
              float glow = g2 * max(0., uLevel - .22) * 1.3 * smoothstep(.3, .8, uSeq) * pulse;
              totalEmissiveRadiance += vec3(.35, .9, .78) * glow * (.5 + uNight * .5);
            }`);
      };
      topMat.customProgramCacheKey = () => 'lingchi-isle9';
      const top = new THREE.Mesh(new THREE.CircleGeometry(L2.out, 96), topMat);
      top.rotation.x = -Math.PI / 2; top.position.set(cx, P.y + 0.006, cz); top.receiveShadow = true; top.name = 'lingchi-isle';
      scene.add(top);
      // 栏杆：南北桥口各留约 3 米
      const rr = P.r - 0.2, NR = 20, seg = [];
      for (let i = 0; i <= NR; i++) {
        const a = (i / NR) * TAU, gapN = Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))) < 0.44, gapS = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.44;
        seg.push(gapN || gapS ? null : [cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]);
      }
      let run = [];
      const flush = () => { if (run.length > 1) rail(b, run, P.y, { h: 0.85, spacing: 1.3, post: 0.17, cap: 'bronze' }); run = []; };
      for (const p of seg) { if (p) run.push(p); else flush(); }
      flush();
      censerR(b, cx + 2.2, P.y, cz - 1.25, 0.72, -Math.PI * 0.62);
    }
    // ---------- 南北石桥（D08-03）----------
    {
      const aS = angleTo(X, cz + 30), [, sz] = rimAt(aS, 0.68), aN = angleTo(X, cz - 30), [, nz] = rimAt(aN, 0.68);
      this.southBridge = bridge9(b, X, cz + P.r - 0.02, sz);
      this.northBridge = bridge9(b, X, cz - P.r + 0.02, nz);
    }
    // ---------- 东北假山：岩缝出泉 → 短水道 → 两叠瀑布 → 池中落点 ----------
    {
      const ux = nx0, uz = nz0, vx = -uz, vz = ux;                     // u：自落点指向岸外（假山深处），v：横向
      const Wp = (u, v) => [F0[0] + ux * u + vx * v, F0[1] + uz * u + vz * v];
      const yS = y0 + 4.3, yL = y0 + 2.55;                          // 泉眼水面、跌水台面
      const fallLine = (x, z) => { const du = (x - F0[0]) * ux + (z - F0[1]) * uz, dv = (x - F0[0]) * vx + (z - F0[1]) * vz; return Math.abs(dv) < 1.1 + Math.max(0, -du) * 0.2 && du < 4.0 ? 1 - Math.abs(dv) / 1.6 : 0; };
      const wetAt = (x, y, z) => Math.max(0, Math.min(1, fallLine(x, z) * 1.3)) * (y < yS + 0.3 ? 1 : 0.4);
      const geos = [];
      const M = (u, v, yb, yt, du, dv, ang, seed) => { const [x, z] = Wp(u, v); rockMass(geos, { x, z, y0: yb, y1: yt, w: du, d: dv, ry: Math.atan2(-uz, ux) + ang, seed }, wetAt); };
      const fl = LC.floor + 0.2, pad = y0 - 0.3;
      M(4.9, 0.1, pad, yS + 0.75, 3.2, 5.0, 0.05, 3);               // 后山石（泉眼所在）
      M(3.2, 1.55, pad, yS + 0.45, 2.2, 1.6, 0.3, 5);               // 泉眼两侧
      M(3.4, -1.6, pad, yS + 0.3, 2.3, 1.7, -0.25, 7);
      M(1.45, 0.0, fl, yL, 1.9, 2.5, 0.0, 9);                       // 跌水台（第一叠落在此）
      M(0.35, 1.75, fl, y0 + 1.75, 1.6, 1.5, 0.4, 11);              // 下叠两侧（立在池中）
      M(0.45, -1.85, fl, y0 + 2.05, 1.7, 1.6, -0.3, 13);
      M(2.4, 3.05, pad, y0 + 3.35, 2.8, 2.2, 0.2, 15);               // 两翼大石
      M(2.6, -3.25, pad, y0 + 2.95, 2.8, 2.4, -0.2, 17);
      M(-0.2, 2.9, fl, y0 + 0.35, 1.0, 0.9, 0.8, 19);               // 水边小石
      M(-0.5, -2.7, fl, y0 + 0.2, 0.9, 0.8, -0.6, 21);
      M(-1.6, 2.3, fl, B.y + 0.12, 0.8, 0.7, 1.2, 23);
      let n = 0;
      for (const g of geos) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), rk = new Float32Array(n * 3);
      let o = 0;
      for (const g of geos) { pos.set(g.attributes.position.array, o * 3); rk.set(g.attributes.aRock.array, o * 3); o += g.attributes.position.count; }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      rg.setAttribute('aRock', new THREE.BufferAttribute(rk, 3));
      rg.computeVertexNormals();
      const rm = new THREE.Mesh(rg, cliffMaterial(quality));
      rm.castShadow = rm.receiveShadow = true; rm.name = 'lingchi-rockery';
      scene.add(rm);
      // 碰撞：假山整体挡路（相机可穿）
      for (const [u, v, r, h] of [[4.9, 0.1, 2.6, 5], [3.3, 0, 2.2, 4.6], [1.45, 0, 1.3, 2.6], [2.5, 3.1, 1.5, 3.4], [2.7, -3.25, 1.5, 3]]) { const [x, z] = Wp(u, v); b.cylCollider(x, LC.floor, y0 + h, z, r); }
      this.rockery = { x: Wp(2.5, 0)[0], z: Wp(2.5, 0)[1] };
      // 岩缝（泉眼）：泉眼两侧的岩块之间留出的缝，泉水自缝中涌出（缝内深色由岩块的凹处着色表现）
      // 短水道：自岩缝到第一叠瀑布的唇口（顺坡略降）
      const sMat = streamMaterial();
      const chan = (u0, u1, yA, yB, w) => {
        const [x0, z0] = Wp(u0, 0), [x1, z1] = Wp(u1, 0), L = Math.hypot(x1 - x0, z1 - z0);
        const g = new THREE.PlaneGeometry(w, Math.hypot(L, yA - yB), 1, 6);
        const m = new THREE.Mesh(g, sMat);
        m.position.set((x0 + x1) / 2, (yA + yB) / 2 + 0.02, (z0 + z1) / 2);
        m.rotation.order = 'YXZ'; m.rotation.y = Math.atan2(x0 - x1, z0 - z1); m.rotation.x = -Math.PI / 2 - Math.atan2(yA - yB, L);
        m.renderOrder = 6; scene.add(m);
        // 水道底与两侧的石槽（湿石色）
        b.push((x0 + x1) / 2, (yA + yB) / 2 - 0.12, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2);
        b.box(L + 0.1, 0.18, w + 0.06, 0x6f746b, 0, 0, 0, { mat: 'stone', col: false });
        b.pop();
      };
      chan(3.6, 2.3, yS, yS - 0.12, 0.8);
      chan(1.95, 0.65, yL + 0.04, yL - 0.06, 1.0);
      // 两叠瀑布：唇口翻白，落到台面 / 池面（落到底不散掉，与落点白沫相接）
      const dirY = Math.atan2(-ux, -uz);
      const [f1x, f1z] = Wp(2.25, 0);
      waterfall(scene, { x: f1x, y: yS - 0.1, z: f1z, ry: dirY, len: yS - 0.1 - yL - 0.02, w: 0.82, spread: 0.35, out: 0.22, lit, shade, reach: true });
      const [f2x, f2z] = Wp(0.6, 0);
      waterfall(scene, { x: f2x, y: yL - 0.04, z: f2z, ry: dirY, len: yL - 0.04 - B.y + 0.04, w: 1.05, spread: 0.45, out: 0.3, lit, shade, reach: true });
      b.emitter('mist', F0[0], B.y + 0.3, F0[1], { rate: 1.8 });
      const [m1x, m1z] = Wp(1.8, 0);
      b.emitter('mist', m1x, yL + 0.2, m1z, { rate: 0.7 });
      // 石上小松、石缝蕨草与紫花灌木（只在湿阴处）
      const [p1x, p1z] = Wp(4.6, 1.6), [p2x, p2z] = Wp(2.6, -3.0), [p3x, p3z] = Wp(2.3, 3.2), [p4x, p4z] = Wp(0.5, -1.9);
      (ctx.extraVeg ||= []).push(['mPine03', p1x, p1z, 0.46, 0.6, yS + 0.65], ['mPine03', p2x, p2z, 0.34, 2.2, y0 + 2.9], ['shrub', p3x, p3z, 0.75, 0, y0 + 3.3], ['fern', p4x, p4z, 0.8, 1.0, y0 + 2.0]);
    }
    // ---------- 荷花（D04）：沿浅水岸成簇 ----------
    {
      const rand = mulberry32(318);
      const leafMat = new THREE.MeshStandardMaterial({ map: leafTexture(), roughness: 0.48, side: THREE.DoubleSide });
      const flowerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
      const flat = new THREE.InstancedMesh(leafGeometry(0.04, 0.015), leafMat, 80);
      const raised = new THREE.InstancedMesh(leafGeometry(0.16, 0.06), leafMat, 40);
      const blooms = new THREE.InstancedMesh(bloomGeometry(), flowerMat, 18);
      const buds = new THREE.InstancedMesh(budGeometry(), flowerMat, 16);
      const pods = new THREE.InstancedMesh(podGeometry(), flowerMat, 6);
      const stemG = new THREE.CylinderGeometry(0.008, 0.011, 1, 5).translate(0, 0.5, 0);
      const stems = new THREE.InstancedMesh(stemG, new THREE.MeshStandardMaterial({ color: 0x6b8a4a, roughness: 0.6 }), 90);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color(), V = new THREE.Vector3(), S = new THREE.Vector3();
      const cnt = { flat: 0, raised: 0, bloom: 0, bud: 0, pod: 0, stem: 0 };
      // 叶柄 / 花梗：自池底 (x0, z0) 连到叶心 / 花托 (x1, y1, z1)
      const UP = new THREE.Vector3(0, 1, 0), D = new THREE.Vector3();
      const stem = (x0, z0, x1, y1, z1) => {
        if (cnt.stem >= 90) return;
        const yb = floorY(x0, z0);
        D.set(x1 - x0, y1 - yb, z1 - z0);
        const L = D.length();
        q.setFromUnitVectors(UP, D.normalize());
        stems.setMatrixAt(cnt.stem++, m4.compose(V.set(x0, yb, z0), q, S.set(1, L, 1)));
      };
      const avoid = (x, z) => Math.abs(x - X) < 2.4 || Math.hypot(x - F0[0], z - F0[1]) < 3.2 || (x > B.x + 10 && Math.abs(z - SPZ) < 2.6) || Math.hypot(x - cx, z - cz) < P.r + 1.3;
      // 七簇：[轮廓角, 离岸（向内）, 簇半径, 浮叶, 立叶, 盛花, 花苞, 莲蓬]
      const CL = [[2.55, 1.3, 1.25, 8, 4, 2, 2, 1], [3.05, 1.6, 0.9, 5, 3, 1, 1, 0], [3.75, 1.2, 1.3, 9, 4, 3, 2, 1], [4.3, 1.5, 0.8, 4, 2, 1, 1, 0],
        [0.95, 1.3, 1.1, 7, 3, 2, 2, 1], [1.2, 1.5, 0.8, 4, 2, 1, 1, 0], [6.1, 1.4, 1.0, 6, 3, 2, 2, 1]];
      for (const [a, off, cr, nF, nR, nB, nBud, nPod] of CL) {
        const [gx, gz] = rimAt(a, -off);
        const pick = () => { for (let t = 0; t < 12; t++) { const r = Math.pow(rand(), 0.7) * cr, aa = rand() * TAU, x = gx + Math.cos(aa) * r, z = gz + Math.sin(aa) * r; if (!avoid(x, z) && basinT(x, z) < 0.985) return [x, z]; } return null; };
        for (let i = 0; i < nF && cnt.flat < 80; i++) {
          const p = pick(); if (!p) continue;
          const s = 0.14 + rand() * 0.13;
          flat.setMatrixAt(cnt.flat, m4.compose(V.set(p[0], B.y + 0.012, p[1]), q.setFromEuler(e.set((rand() - 0.5) * 0.06, rand() * TAU, (rand() - 0.5) * 0.06)), S.set(s, s, s)));
          flat.setColorAt(cnt.flat++, col.setHSL(0.22 + rand() * 0.05, 0.12 + rand() * 0.12, 0.5 + rand() * 0.12));
        }
        for (let i = 0; i < nR && cnt.raised < 40; i++) {
          const p = pick(); if (!p) continue;
          const s = 0.18 + rand() * 0.12, h = 0.25 + rand() * 0.5, lean = 0.05 + rand() * 0.18, la = rand() * TAU, tilt = 0.12 + rand() * 0.3;
          const lx = p[0] + Math.sin(lean) * Math.cos(la) * h, lz = p[1] + Math.sin(lean) * Math.sin(la) * h;
          raised.setMatrixAt(cnt.raised, m4.compose(V.set(lx, B.y + h, lz), q.setFromEuler(e.set(tilt * Math.sin(la), rand() * TAU, tilt * Math.cos(la))), S.set(s, s, s)));
          raised.setColorAt(cnt.raised++, col.setHSL(0.23 + rand() * 0.04, 0.14 + rand() * 0.12, 0.52 + rand() * 0.12));
          stem(p[0], p[1], lx, B.y + h, lz);
        }
        for (let i = 0; i < nB && cnt.bloom < 18; i++) {
          const p = pick(); if (!p) continue;
          const h = 0.45 + rand() * 0.4, lean = rand() * 0.12, la = rand() * TAU, s = 1.0 + rand() * 0.45;
          const tx = p[0] + Math.sin(lean) * Math.cos(la) * h, tz = p[1] + Math.sin(lean) * Math.sin(la) * h;
          blooms.setMatrixAt(cnt.bloom++, m4.compose(V.set(tx, B.y + h, tz), q.setFromEuler(e.set(lean * Math.sin(la), rand() * TAU, lean * Math.cos(la))), S.set(s, s, s)));
          stem(p[0], p[1], tx, B.y + h - 0.005, tz);
        }
        for (let i = 0; i < nBud && cnt.bud < 16; i++) {
          const p = pick(); if (!p) continue;
          const h = 0.55 + rand() * 0.45, lean = rand() * 0.1, la = rand() * TAU, s = 0.85 + rand() * 0.4;
          const tx = p[0] + Math.sin(lean) * Math.cos(la) * h, tz = p[1] + Math.sin(lean) * Math.sin(la) * h;
          buds.setMatrixAt(cnt.bud++, m4.compose(V.set(tx, B.y + h, tz), q.setFromEuler(e.set(lean, rand() * TAU, 0)), S.set(s, s, s)));
          stem(p[0], p[1], tx, B.y + h, tz);
        }
        for (let i = 0; i < nPod && cnt.pod < 6; i++) {
          const p = pick(); if (!p) continue;
          const h = 0.5 + rand() * 0.3, lean = 0.15 + rand() * 0.2, la = rand() * TAU;
          const tx = p[0] + Math.sin(lean) * Math.cos(la) * h, tz = p[1] + Math.sin(lean) * Math.sin(la) * h;
          pods.setMatrixAt(cnt.pod++, m4.compose(V.set(tx, B.y + h, tz), q.setFromEuler(e.set(lean * 1.5, rand() * TAU, 0)), S.set(1, 1, 1)));
          stem(p[0], p[1], tx, B.y + h, tz);
        }
      }
      flat.count = cnt.flat; raised.count = cnt.raised; blooms.count = cnt.bloom; buds.count = cnt.bud; pods.count = cnt.pod; stems.count = cnt.stem;
      for (const m of [flat, raised, blooms, buds, pods, stems]) { m.receiveShadow = true; m.castShadow = m !== flat; m.computeBoundingSphere(); m.name = 'lotus'; scene.add(m); }
      this.lotus = cnt;
    }
    // ---------- 池岸栏杆（D02-01，莲苞柱头）：沿压顶外侧，桥头、假山、溢流缺口处断开 ----------
    {
      // 桥头：栏杆一直接到桥的踏步栏杆（距桥中线 1.5 米处精确断开），不留可跌进池里的缺口
      const N = 84, HB = 1.5;
      const atBridge = (a) => Math.abs(rimAt(a, 0.46)[0] - X) < HB;
      const skipO = (a) => { const [x, z] = rimAt(a, 0.46); return Math.hypot(x - this.rockery.x, z - this.rockery.z) < 5.6 || (x > B.x + 10 && Math.abs(z - SPZ) < 1.6); };
      const cross = (a0, a1) => { for (let k = 0; k < 14; k++) { const m = (a0 + a1) / 2; if (atBridge(m) === atBridge(a0)) a0 = m; else a1 = m; } return rimAt(atBridge(a0) ? a1 : a0, 0.46); };
      let run = [];
      const flush = () => { if (run.length > 1) rail(b, run, y0 + 0.12, { h: 0.72, spacing: 1.7, post: 0.16 }); run = []; };
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * TAU, ap = ((i - 1) / N) * TAU;
        if (atBridge(a)) { if (run.length && i > 0 && !atBridge(ap)) run.push(cross(ap, a)); flush(); continue; }
        if (skipO(a)) { flush(); continue; }
        if (i > 0 && atBridge(ap)) run.push(cross(ap, a));
        run.push(rimAt(a, 0.46));
      }
      flush();
    }
    // ---------- 环池花坛（通道之外）----------
    {
      const beds = [[37.8, 6.0, 4.0, 2.0], [71.6, 4.6, 4.6, 2.0], [85.4, 22.0, 2.0, 4.0], [85.4, 39.0, 2.0, 4.0], [36.4, 39.6, 2.0, 4.0], [47.0, 44.4, 5.0, 2.0], [74.0, 44.4, 5.0, 2.0], [36.4, 11.4, 2.0, 4.0]];
      const rr = mulberry32(905);
      for (const [x, z, w, d] of beds) {
        b.slab(w + 0.3, 0.42, d + 0.3, C.marbleShade, x, y0, z, { mat: 'stoneSmooth' });
        b.slab(w + 0.42, 0.08, d + 0.42, C.marble, x, y0 + 0.42, z, { mat: 'stoneSmooth', col: false });
        b.slab(w - 0.1, 0.04, d - 0.1, 0x4a3a2a, x, y0 + 0.42, z, { col: false });
        const n = Math.round(w * d * 1.4);
        for (let k = 0; k < n; k++) {
          const px = x + (rr() - 0.5) * (w - 0.5), pz = z + (rr() - 0.5) * (d - 0.5), kk = rr();
          (ctx.extraVeg ||= []).push([kk < 0.55 ? 'flower' : kk < 0.85 ? 'shrub' : 'fern', px, pz, kk < 0.55 ? 1.3 : 0.7 + rr() * 0.3, rr() * 6.28, y0 + 0.44]);
        }
        if (w * d >= 9) ctx.extraVeg.push(['pine', x, z, 0.5, rr() * 6.28, y0 + 0.44]);
      }
    }
    // ---------- 西入口：团纹石、玉柱；池台石灯 ----------
    const med = new THREE.Mesh(new THREE.CircleGeometry(1.5, 40), new THREE.MeshStandardMaterial({ map: medallionTexture(), roughness: 0.7 }));
    med.rotation.x = -Math.PI / 2; med.position.set(PAD.x0 + 3.0, y0 + 0.02, LC.westZ); med.receiveShadow = true;
    scene.add(med);
    for (const s of [-1, 1]) jadePillar(ctx, b, PAD.x0 + 1.4, y0, LC.westZ + s * 3.6, 0.85, 0);
    for (const [x, z] of [[PAD.x0 + 1.2, PAD.z0 + 1.2], [PAD.x0 + 1.2, PAD.z1 - 1.2], [PAD.x1 - 1.2, PAD.z0 + 1.2], [PAD.x1 - 1.2, PAD.z1 - 1.2], [X + 9.6, PAD.z1 - 1.2], [X - 9.6, PAD.z1 - 1.2], [X - 9.6, PAD.z0 + 1.2], [PAD.x1 - 1.2, (PAD.z0 + PAD.z1) / 2 - 7]]) {
      if (x > 50 && x < 62 && z < 9) continue;                                     // 折返石阶
      stoneLanternR(b, x, y0, z, 0.95, 0);
    }
    // ---------- 南侧牌坊（通透，不挡池心岛），观云台上石灯、石凳 ----------
    {
      const gb = new Builder(), gz = PAD.z1 - 1.4;
      paifang9(gb, '灵池');
      ctx.place(gb, { x: X, y: y0, z: gz, id: 'lingchiGate', fade: true, name: '灵池牌坊', foot: { w: 9.6, d: 1.2, kind: 'gate' } });
      for (const s of [-1, 1]) jadePillar(ctx, b, X + s * 7.2, y0, PAD.z1 - 1.6, 1.15, 0);
      const look = PADS.find((p) => p.id === 'lingchiLook');
      for (const s of [-1, 1]) stoneLanternR(b, (look.x0 + look.x1) / 2 + s * 3.6, look.y, look.z1 - 1.2, 0.95, 0);
      P8.bench(b, (look.x0 + look.x1) / 2 - 3.6, look.y, look.z0 + 4.0, Math.PI / 2, 2.0);
      P8.bench(b, (look.x0 + look.x1) / 2 + 3.6, look.y, look.z0 + 4.0, -Math.PI / 2, 2.0);
      ctx.anchors.lookout = { x: (look.x0 + look.x1) / 2, y: look.y, z: look.z1 - 2.2 };
    }
    // ---------- 东缘溢流：压顶缺口 → 石渠（穿出台沿）→ 挑出崖口的石槽 → 螭首吐水 → 东崖瀑布 → 谷底落水潭 ----------
    {
      const z = SPZ, [ex] = rimAt(angleTo(B.x + 30, z), 0.0), x1 = PAD.x1;
      b.slab(x1 - ex, 0.25, 2.2, C.marbleShade, (ex + x1) / 2, B.y - 0.42, z, { mat: 'stone', col: false });
      // 渠壁：顶面与环池步道齐平（略高一线），渠上一道石板平桥让环池主通道连续（桥面高出步道 0.16 米，可直接迈上）
      for (const s of [-1, 1]) b.slab(x1 - ex - 0.6, y0 + 0.08 - (B.y - 0.38), 0.32, C.marble, (ex + 0.6 + x1) / 2, B.y - 0.38, z + s * 1.02, { mat: 'stoneSmooth' });
      const bx0 = Math.max(ex + 1.2, x1 - 5.4), bx1 = x1 - 1.6;
      b.slab(bx1 - bx0, 0.16, 3.2, C.marbleWarm, (bx0 + bx1) / 2, y0, z, { mat: 'stoneSmooth' });
      b.slab(bx1 - bx0 + 0.1, 0.05, 3.3, C.marble, (bx0 + bx1) / 2, y0 + 0.16, z, { mat: 'stoneSmooth', col: false });
      for (const e of [bx0, bx1]) b.slab(0.24, 0.42, 3.2, C.marbleShade, e, B.y - 0.42, z, { mat: 'stoneSmooth', col: false });
      const ledge = T.heightAt(PAD.x1 + 1.6, z);
      b.slab(1.06, B.y - 0.42 - (ledge - 0.9), 2.3, C.stoneGrey, PAD.x1 + 0.53, ledge - 0.9, z, { mat: 'stone' });
      const sx0 = PAD.x1, sx1 = PAD.x1 + 3.2, sb = B.y - 0.44;
      b.slab(sx1 - sx0, 0.32, 1.46, C.marbleShade, (sx0 + sx1) / 2, sb - 0.32, z, { mat: 'stoneSmooth', col: false });
      for (const s of [-1, 1]) b.slab(sx1 - sx0, 0.58, 0.24, C.marble, (sx0 + sx1) / 2, sb - 0.32, z + s * 0.62, { mat: 'stoneSmooth', col: false });
      for (let k = 0; k < 3; k++) b.slab(2.5 - k * 0.75, 0.36, 1.2 - k * 0.12, C.marbleShade, sx0 + (2.5 - k * 0.75) / 2, sb - 0.68 - k * 0.36, z, { mat: 'stoneSmooth', col: false });
      chiHead(b, sx1, sb, z);
      const sMat = streamMaterial();
      const ch = new THREE.Mesh(new THREE.PlaneGeometry(2.0, x1 - ex + 0.2, 1, 8), sMat);
      ch.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); ch.position.set((ex + x1) / 2, B.y + 0.03, z); ch.renderOrder = 6;
      scene.add(ch);
      const ch2 = new THREE.Mesh(new THREE.PlaneGeometry(0.98, sx1 - sx0 - 0.1, 1, 6), sMat);
      ch2.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); ch2.position.set((sx0 + sx1) / 2 - 0.05, sb + 0.1, z); ch2.renderOrder = 6;
      scene.add(ch2);
      const pool = (T.pools || []).find((p) => p.id === 'plungeE');
      const mx = sx1 + 0.55, my = sb - 0.05, bot = pool ? pool.level : T.heightAt(mx + 4, z);
      waterfall(scene, { x: mx, y: my, z, ry: Math.PI / 2, len: my - bot + 0.2, w: 1.15, spread: 1.15, out: 1.5, lit, shade });
      waterfall(scene, { x: sx1 + 0.2, y: sb + 0.12, z, ry: Math.PI / 2, len: 0.5, w: 0.7, spread: 0.4, out: 0.6, lit, shade, reach: true });
      if (pool) {
        b.emitter('mist', pool.x - 0.6, pool.level + 0.4, pool.z, { rate: 2.4 });
        b.emitter('mist', pool.x - 1.6, pool.level + 6, pool.z, { rate: 1.0 });
      }
      this.overflow = { x: mx, z };
    }
    const g = b.build({ shadows: true, name: 'lingchi' });
    scene.add(g);
    ctx.cw.addLocal(b.cols, 0, 0, 0, 0);
    for (const e of b.emitters) (e.kind === 'light' ? ctx.lights : ctx.emitters).push(e);
    ctx.footprints.push({ x: LC.cx, z: LC.cz, w: B.rx * 2.2, d: B.rz * 2.2, kind: 'water' });
    ctx.anchors.meditatePool = { x: LC.cx, y: P.y, z: LC.cz };
    this.buildMotes(scene);
  }

  // 灵光：池面浮起、修炼时盘旋汇向打坐的人（着色器按种子与时间计算位置）
  buildMotes(scene) {
    const n = 90, seed = new Float32Array(n * 2), pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) seed.set([Math.random() * TAU, Math.random()], i * 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
    this.motes = new THREE.Points(g, shaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexPars: 'attribute vec2 aSeed; uniform float uTime, uLevel, uSeq; varying float vA;',
      vertex: `
        float f = fract(aSeed.y + uTime * (.035 + uLevel * .12));
        float a0 = aSeed.x;
        // 待机：自池面（距台心 5–13 米）缓缓浮起；修炼：沿螺旋收向台心上方（打坐者的丹田）
        float r0 = 5. + 8. * fract(aSeed.x * 3.7);
        float conv = smoothstep(.3, 1., uSeq) * uLevel;
        float r = mix(r0, mix(r0, .25, f), conv);
        float a = a0 + f * mix(.6, 4.5, conv);
        float h = mix(f * 2.2, .2 + f * 1.15, conv);
        vec3 p = vec3(cos(a) * r, h, sin(a) * r);
        vA = (.1 + .9 * max(uLevel - .15, 0.)) * smoothstep(0., .1, f) * smoothstep(1., .82, f);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.);
        gl_PointSize = (2.5 + 3. * uLevel) * 18. / -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;`,
      fragmentPars: 'varying float vA;',
      fragment: 'float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(vec3(.5, 1., .88) * vA * pow(smoothstep(.5, .0, d), 1.5), 1.);',
    }));
    this.motes.position.set(LC.cx, LC.plat.y - 0.25, LC.cz);
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 4;
    scene.add(this.motes);
  }

  boost(v) { this.on = !!v; this.target = v ? 1 : 0.2; }
  update(dt) {
    this.seq = Math.min(1, Math.max(0, this.seq + (this.on ? dt / 1.8 : -dt / 1.0)));
    this.level += (this.target - this.level) * Math.min(1, dt * (this.on ? 2 : 1.2));
    this.u.uLevel.value = this.level;
    this.u.uSeq.value = this.seq;
    this.u.uPulse.value = Math.max(0, (this.level - 0.25) / 0.75) * this.seq;
  }
}

// 螭首（石槽出水口）：方头、长吻、双角、圆睛、张口；头朝 +X，口沿在 (x, y, z) 稍外
function chiHead(b, x, y, z) {
  const S = C.marbleWarm, D = C.marbleShade;
  b.slab(0.62, 0.58, 0.9, S, x + 0.16, y - 0.36, z, { mat: 'stoneSmooth', col: false });
  b.box(0.62, 0.22, 0.62, S, x + 0.52, y + 0.06, z, { mat: 'stoneSmooth', col: false });
  b.box(0.5, 0.16, 0.56, D, x + 0.46, y - 0.24, z, { mat: 'stoneSmooth', col: false });
  b.box(0.1, 0.12, 0.66, S, x + 0.84, y + 0.0, z, { mat: 'stoneSmooth', col: false });
  for (const s of [-1, 1]) {
    b.sphere(0.1, D, x + 0.36, y + 0.12, z + s * 0.3, { mat: 'stoneSmooth', seg: 8, seg2: 6 });
    b.add(new THREE.ConeGeometry(0.07, 0.5, 6), S, 'stoneSmooth', { x: x + 0.02, y: y + 0.18, z: z + s * 0.2, rz: 1.0, col: false });
    b.box(0.34, 0.08, 0.06, S, x + 0.18, y - 0.08, z + s * 0.47, { mat: 'stoneSmooth', col: false, ry: s * 0.25 });
  }
}

// 入口团纹石（圆形卷云纹）
function medallionTexture() {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), c = S / 2;
  g.fillStyle = '#d6cfbf'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(120,112,98,.75)'; g.lineWidth = 9;
  for (const r of [0.47, 0.4, 0.16]) { g.beginPath(); g.arc(c, c, r * S, 0, TAU); g.stroke(); }
  g.lineWidth = 6;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    g.save(); g.translate(c + Math.cos(a) * 0.28 * S, c + Math.sin(a) * 0.28 * S); g.rotate(a);
    g.beginPath(); g.arc(0, 0, 0.07 * S, Math.PI * 0.2, Math.PI * 1.9); g.stroke();
    g.beginPath(); g.arc(0.03 * S, 0, 0.035 * S, Math.PI, Math.PI * 2.6); g.stroke();
    g.restore();
  }
  g.fillStyle = 'rgba(110,160,148,.85)'; g.beginPath(); g.arc(c, c, 0.1 * S, 0, TAU); g.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
