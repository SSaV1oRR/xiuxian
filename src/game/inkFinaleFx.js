// 第二十五轮起：拔刀斩升级形态的画面；第二十七轮重做为「墨里终焉」——只是演出：不伤人、不改碰撞，结束即收（对象都预先建好、循环取用）。
// 演出（game/inkFinale.js 的 Show）每帧调 tick(S, dt)：S.t 演出时刻（统一的 16 秒时间线 FINALE.show）、S.plan 站位、S.cams 各机位、S.e 目标；一次性的事件调 event(名, S)。
//   化墨移位：起点墨气散开、沿弧线绕到敌人身后的一笔墨痕、终点墨气聚拢（项目里两组水墨贴图集，tools/r20、r23 转换）；
//   山水与画中世界：game/inkStage.js（三维山岛、纸地、天幕、推开的墨雾幕、原场景的替换与复原）；
//   画卷：地上的长卷（长 ≥ 8 个人高、宽 2.5–3.5 个人高）——宣纸纸纹、绫边、卷边、画心里一行行小山水、书法「墨里终焉」（tools/r27_calligraphy.py 逐笔写出的贴图，
//         按笔顺一笔笔显现）；卷轴、上沿细杆、系卷的绳结用 assets/skill/molizhongyan 的画卷素材（tools/r27_convert_scroll.py；绳结解开的形态键逐帧插值），
//         绳结解开 → 卷轴由玩家脚下滚向敌人、纸逐段贴着地面铺开；
//   拔刀穿行：沿真实剑尖轨迹的一线银白与飞白、穿过敌人那一瞬的一点银光；
//   龙凤：九霄凤焰的凤凰、雷龙破虚的龙的模型各克隆一份独立的演出实例（几何与贴图共用，材质另做水墨版），凤自画面左后、龙自右后同时出现、
//         沿弧线汇向敌人（同框两秒多），撞入后化作墨流、流进脚下的八卦；爆墨之后由余墨在玩家身后重新凝成（凤左、龙右），正脸定格时都在；
//   八卦：阴阳鱼先现、再八卦与墨线，各自慢转（克制）；墨带：由腿 → 躯干 → 肩缠绕上升（粗细变化、飞白、碎开，保留敌人的轮廓）；
//   收刀合拢：横向银白刀光（贯穿切口、按距离、视角、画面宽高比算到画面宽度的 102%，0.18 秒）、切开墨带、爆墨（深墨核心收缩再爆开、
//         向两侧与斜后方的笔触墨浪、飞白、墨点、断带、山水碎片、几点朱红——不再有朱印与文字），定向在人物身后；最后正脸定格、书法「终焉」。
import * as THREE from 'three';
import { FINALE as F } from './inkFinaleConfig.js';
import { Sprites, rects, rects2, cellRect } from './inkFx.js';
import { PhoenixRig } from '../actors/phoenix.js';
import { LoongRig } from '../actors/loong.js';
import { gpuWarm } from './inkStage.js';

const R = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (u) => u * u * (3 - 2 * u);
const C = Object.fromEntries(Object.entries(F.color).map(([k, v]) => [k, new THREE.Color(v)]));
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

// =====================================================================================
// 程序绘制的贴图（载入时一次）
// =====================================================================================
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasTex(cv, { repeat = false, data = false } = {}) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}
// 宣纸：底色 #D8D1C4、细密的颗粒、纤维、淡淡的斑驳
function paintPaper(rnd, W = 512) {
  const cv = canvas(W, W), g = cv.getContext('2d');
  g.fillStyle = '#d8d1c4'; g.fillRect(0, 0, W, W);
  const img = g.getImageData(0, 0, W, W), d = img.data;
  for (let i = 0; i < W * W; i++) { const n = (rnd() - 0.5) * 12; d[i * 4] += n; d[i * 4 + 1] += n; d[i * 4 + 2] += n * 0.85; }
  g.putImageData(img, 0, 0);
  g.lineCap = 'round';
  for (let i = 0; i < 320; i++) {
    const x = rnd() * W, y = rnd() * W, a = rnd() * Math.PI * 2, l = 6 + rnd() * 30, dark = rnd() < 0.55;
    g.strokeStyle = dark ? `rgba(118,104,86,${0.05 + rnd() * 0.1})` : `rgba(246,241,232,${0.08 + rnd() * 0.14})`;
    g.lineWidth = 0.5 + rnd() * 0.9;
    for (const ox of [0, -W, W]) { g.beginPath(); g.moveTo(x + ox, y); g.quadraticCurveTo(x + ox + Math.cos(a) * l * 0.5 + (rnd() - 0.5) * 7, y + Math.sin(a) * l * 0.5 + (rnd() - 0.5) * 7, x + ox + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  }
  for (let i = 0; i < 46; i++) {
    const x = rnd() * W, y = rnd() * W, r = 18 + rnd() * 70, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(150,133,106,${0.025 + rnd() * 0.045})`); gr.addColorStop(1, 'rgba(150,133,106,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return cv;
}
// 山水一层（横向首尾相接，绕成一圈）：一组组山峰之间大段留白——峰顶墨色的脊线、向下很快淡开的墨晕（山腰以下入云）、披麻皴、苔点；近层山头几株松。
//   groups：一组宽多少（占全宽的比例）、组与组之间空多少；peak：峰高（占画高的比例，底边起算）；depth：墨晕向下淡开的深度；tone：墨色
const LAND = {
  far: { w: [0.1, 0.2], gap: [0.06, 0.16], peak: [0.42, 0.78], depth: 0.3, tone: [78, 88, 98], fill: 0.42, edge: 0.5, cun: 0.06, dots: 0.02, trees: 0 },
  mid: { w: [0.08, 0.17], gap: [0.08, 0.2], peak: [0.38, 0.7], depth: 0.32, tone: [50, 58, 66], fill: 0.62, edge: 0.72, cun: 0.12, dots: 0.04, trees: 0 },
  near: { w: [0.06, 0.13], gap: [0.12, 0.26], peak: [0.3, 0.56], depth: 0.36, tone: [22, 26, 32], fill: 0.82, edge: 0.92, cun: 0.2, dots: 0.08, trees: 3 },
};
function paintLand(kind, rnd, W = 2048, H = 512) {
  const P = LAND[kind], cv = canvas(W, H), g = cv.getContext('2d');
  const [r0, g0, b0] = P.tone, inkD = (a) => `rgba(${Math.max(8, r0 - 14)},${Math.max(11, g0 - 14)},${Math.max(16, b0 - 14)},${a})`;
  const wrapX = (x, f) => { f(x); if (x < 90) f(x + W); if (x > W - 90) f(x - W); };
  // 竖向的墨晕：一像素宽的渐变条（顶上浓、往下淡到没有），按每一列的脊线高度贴上去
  const ramp = canvas(1, 256), rg = ramp.getContext('2d'), gr = rg.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, `rgba(${r0},${g0},${b0},1)`); gr.addColorStop(0.18, `rgba(${r0},${g0},${b0},0.62)`); gr.addColorStop(0.55, `rgba(${r0},${g0},${b0},0.2)`); gr.addColorStop(1, `rgba(${r0},${g0},${b0},0)`);
  rg.fillStyle = gr; rg.fillRect(0, 0, 1, 256);
  // 山组：组里两到四座峰（尖一些的形状），各组之间留白
  const ys = new Float32Array(W).fill(H + 10);
  let x = rnd() * W * 0.1;
  const x0 = x;
  while (x < x0 + W * 0.97) {
    const w = W * (P.w[0] + rnd() * (P.w[1] - P.w[0])), n = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const pc = x + w * (0.15 + 0.7 * rnd()), pw = w * (0.32 + rnd() * 0.4), ph = H * (P.peak[0] + rnd() * (P.peak[1] - P.peak[0])) * (k === 0 ? 1 : 0.62 + 0.35 * rnd());
      for (let xx = Math.floor(pc - pw); xx <= Math.ceil(pc + pw); xx++) {
        const u = Math.abs(xx - pc) / pw; if (u >= 1) continue;
        const y = H - ph * Math.pow(1 - Math.pow(u, 1.35), 1.7) * (1 + 0.04 * Math.sin(xx * 0.11 + k));
        const xi = ((xx % W) + W) % W; if (y < ys[xi]) ys[xi] = y;
      }
    }
    x += w + W * (P.gap[0] + rnd() * (P.gap[1] - P.gap[0]));
  }
  // 墨晕
  g.globalAlpha = P.fill;
  for (let xi = 0; xi < W; xi++) if (ys[xi] < H) g.drawImage(ramp, 0, 0, 1, 256, xi, ys[xi], 1, H * P.depth);
  g.globalAlpha = 1;
  // 脊线：几遍不同粗细、略有抖动的墨线（只画有山的地方）
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let pass = 0; pass < 3; pass++) {
    let on = false;
    g.beginPath();
    for (let xi = 0; xi < W; xi += 2) {
      if (ys[xi] >= H) { on = false; continue; }
      const y = ys[xi] + (rnd() - 0.5) * 1.4 + pass * 1.1;
      if (!on) { g.moveTo(xi, y); on = true; } else g.lineTo(xi, y);
    }
    g.strokeStyle = inkD(P.edge * (pass === 0 ? 0.95 : 0.3)); g.lineWidth = pass === 0 ? 2.4 : 4 + pass * 3; g.stroke();
  }
  // 披麻皴：脊线下方一笔笔向下斜的短线；苔点
  for (let xi = 0; xi < W; xi += 1) {
    if (ys[xi] >= H) continue;
    if (rnd() < P.cun) {
      const y0 = ys[xi] + rnd() * H * P.depth * 0.45, len = 8 + rnd() * 34, a = Math.PI / 2 + (rnd() - 0.5) * 0.9;
      wrapX(xi, (xx) => { g.beginPath(); g.moveTo(xx, y0); g.quadraticCurveTo(xx + Math.cos(a) * len * 0.5 + (rnd() - 0.5) * 6, y0 + Math.sin(a) * len * 0.5, xx + Math.cos(a) * len, y0 + Math.sin(a) * len); g.strokeStyle = inkD(0.08 + rnd() * 0.24); g.lineWidth = 0.8 + rnd() * 2; g.stroke(); });
    }
    if (rnd() < P.dots) { const y = ys[xi] + (rnd() - 0.2) * 6, r = 1 + rnd() * 2.4; wrapX(xi, (xx) => { g.beginPath(); g.ellipse(xx, y, r * 1.4, r, rnd() * 3, 0, Math.PI * 2); g.fillStyle = inkD(0.4 + rnd() * 0.4); g.fill(); }); }
  }
  // 松：近层几处山头（树干一笔、几层横着的松针团）
  for (let i = 0, tries = 0; i < P.trees && tries < 400; tries++) {
    const xi = Math.floor(rnd() * W); if (ys[xi] >= H * 0.85) continue; i++;
    const y = ys[xi] + 3, h = 34 + rnd() * 40;
    wrapX(xi, (xx) => {
      g.strokeStyle = inkD(0.85); g.lineWidth = 2.4; g.beginPath(); g.moveTo(xx, y); g.quadraticCurveTo(xx + (rnd() - 0.5) * 12, y - h * 0.5, xx + (rnd() - 0.5) * 10, y - h); g.stroke();
      for (let j = 0; j < 4; j++) { const yy = y - h * (0.35 + j * 0.2), w = (1 - j * 0.18) * (13 + rnd() * 9); g.beginPath(); g.ellipse(xx + (rnd() - 0.5) * 7, yy, w, 3.4 + rnd() * 2, (rnd() - 0.5) * 0.3, 0, Math.PI * 2); g.fillStyle = inkD(0.65 + rnd() * 0.25); g.fill(); }
    });
  }
  // 干笔：脊线一带零星挖出飞白
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 700; i++) { const xi = Math.floor(rnd() * W); if (ys[xi] >= H) continue; const y = ys[xi] + rnd() * H * P.depth * 0.6; g.fillStyle = `rgba(0,0,0,${0.2 + rnd() * 0.45})`; g.fillRect(xi, y, 1 + rnd() * 7, 0.6 + rnd() * 1.1); }
  g.globalCompositeOperation = 'source-over';
  return cv;
}
// 八卦（三层分在三个通道：R 阴阳鱼、G 八卦、B 墨线），白墨画在黑底上；毛笔的粗细不匀、边缘飞白
function brushArc(g, cx, cy, r, a0, a1, w, rnd, passes = 3) {
  g.lineCap = 'round';
  for (let p = 0; p < passes; p++) {
    g.beginPath();
    const n = Math.max(12, Math.ceil(Math.abs(a1 - a0) * r / 6));
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n), rr = r + (rnd() - 0.5) * w * 0.25; const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.lineWidth = w * (p === 0 ? 1 : 0.55 + rnd() * 0.4); g.globalAlpha = p === 0 ? 1 : 0.35; g.stroke();
  }
  g.globalAlpha = 1;
}
function paintBagua(rnd, W = 1024) {
  const c = W / 2, layer = () => { const cv = canvas(W, W), g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, W); g.fillStyle = '#fff'; g.strokeStyle = '#fff'; return { cv, g }; };
  // R：阴阳鱼（阴为墨、阳留白）、外圈一笔
  const A = layer(), r1 = W * 0.19;
  { const g = A.g;
    g.beginPath(); g.arc(c, c, r1, Math.PI / 2, Math.PI * 1.5); g.arc(c, c - r1 / 2, r1 / 2, -Math.PI / 2, Math.PI / 2); g.arc(c, c + r1 / 2, r1 / 2, -Math.PI / 2, Math.PI / 2, true); g.closePath(); g.fill();
    g.globalAlpha = 0.16; g.beginPath(); g.arc(c, c, r1, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    g.fillStyle = '#000'; g.beginPath(); g.arc(c, c + r1 / 2, r1 * 0.13, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(c, c - r1 / 2, r1 * 0.13, 0, Math.PI * 2); g.fill();
    brushArc(g, c, c, r1 + W * 0.008, 0, Math.PI * 2.05, W * 0.012, rnd, 3); }
  // G：八卦（伏羲先天：乾、兑、离、震、坤、艮、坎、巽 的方位；每卦三爻，由内到外是初爻到上爻）
  const Bg = layer(), TRI = [[1, 1, 1], [1, 1, 0], [1, 0, 1], [1, 0, 0], [0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 1, 1]];
  { const g = Bg.g, len = W * 0.12, thick = W * 0.017, gap = W * 0.028;
    TRI.forEach((bits, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 4;
      bits.forEach((b, j) => {
        const rr = W * 0.27 + j * gap;
        g.save(); g.translate(c + Math.cos(a) * rr, c + Math.sin(a) * rr); g.rotate(a + Math.PI / 2);
        const segs = b ? [[-len / 2, len / 2]] : [[-len / 2, -len * 0.09], [len * 0.09, len / 2]];
        for (const [x0, x1] of segs) {
          g.beginPath(); g.moveTo(x0, -thick * (0.42 + rnd() * 0.1));
          for (let k = 1; k <= 6; k++) g.lineTo(x0 + (x1 - x0) * (k / 6), -thick * (0.42 + rnd() * 0.12));
          for (let k = 6; k >= 0; k--) g.lineTo(x0 + (x1 - x0) * (k / 6), thick * (0.42 + rnd() * 0.12));
          g.closePath(); g.fill();
        }
        g.restore();
      });
    });
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 380; i++) { const a = rnd() * Math.PI * 2, rr = W * (0.26 + rnd() * 0.1); g.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.5})`; g.fillRect(c + Math.cos(a) * rr, c + Math.sin(a) * rr, 1 + rnd() * 5, 1); }
    g.globalCompositeOperation = 'source-over'; }
  // B：墨线——内外几道圆、卦与卦之间的放射短线、外圈的点
  const Cc = layer();
  { const g = Cc.g;
    brushArc(g, c, c, W * 0.235, 0, Math.PI * 2.02, W * 0.007, rnd, 2);
    brushArc(g, c, c, W * 0.37, 0, Math.PI * 2.02, W * 0.009, rnd, 3);
    brushArc(g, c, c, W * 0.43, 0, Math.PI * 2.03, W * 0.014, rnd, 3);
    brushArc(g, c, c, W * 0.475, 0.2, Math.PI * 1.85, W * 0.006, rnd, 2);
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + Math.PI / 8 + (i * Math.PI) / 4;
      g.lineWidth = W * 0.006; g.beginPath(); g.moveTo(c + Math.cos(a) * W * 0.25, c + Math.sin(a) * W * 0.25); g.lineTo(c + Math.cos(a) * W * 0.36, c + Math.sin(a) * W * 0.36); g.stroke();
      g.beginPath(); g.arc(c + Math.cos(a) * W * 0.455, c + Math.sin(a) * W * 0.455, W * 0.008, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 24; i++) { const a = rnd() * Math.PI * 2, rr = W * (0.44 + rnd() * 0.04); g.lineWidth = 1 + rnd() * 3; g.beginPath(); g.moveTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr); g.lineTo(c + Math.cos(a + 0.05 + rnd() * 0.12) * (rr + W * 0.03), c + Math.sin(a + 0.05 + rnd() * 0.12) * (rr + W * 0.03)); g.stroke(); } }
  // 合成：三个通道
  const out = canvas(W, W), go = out.getContext('2d'), img = go.createImageData(W, W);
  const da = A.g.getImageData(0, 0, W, W).data, db = Bg.g.getImageData(0, 0, W, W).data, dc = Cc.g.getImageData(0, 0, W, W).data, d = img.data;
  for (let i = 0; i < W * W; i++) { d[i * 4] = da[i * 4]; d[i * 4 + 1] = db[i * 4]; d[i * 4 + 2] = dc[i * 4]; d[i * 4 + 3] = 255; }
  go.putImageData(img, 0, 0);
  return out;
}
// =====================================================================================
// 笔触带：沿一条三维曲线、朝着镜头展开的一条带子（宽墨刷 / 细线 / 干笔贴图集里的长条），按 head / tail 显现、按噪声碎开
// =====================================================================================
const ST_VS = /* glsl */`
  varying vec2 vUv; varying vec3 vP;
  void main() { vUv = uv; vP = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.); }`;
const ST_FS = /* glsl */`
  uniform sampler2D uTex, uNoise; uniform vec4 uRect, uDry; uniform vec3 uColor, uColor2;
  uniform float uAlpha, uHead, uTail, uErode, uDryK, uSeed, uAdd, uCutY, uCut, uBandY, uBandW, uSoft, uLit;
  varying vec2 vUv; varying vec3 vP;
  void main() {
    float u = vUv.x, v = vUv.y;
    if (u > uHead || u < uTail) discard;
    float c = texture2D(uTex, vec2(uRect.x + u * uRect.z, uRect.y + (1. - v) * uRect.w)).r;
    float n = texture2D(uNoise, vec2(u * 2.7 + uSeed, v * .8 + uSeed * .37)).r;
    float th = uErode * (.25 + .75 * n);
    float a = smoothstep(th, th + uSoft, c);
    a *= smoothstep(uTail, uTail + .1, u) * (1. - .5 * smoothstep(uHead - .05, uHead, u));
    if (uDryK > 0.) { float dry = texture2D(uTex, vec2(uDry.x + fract(u * 1.6 + uSeed) * uDry.z, uDry.y + (1. - v) * uDry.w)).r; a *= mix(1., .18 + .82 * dry, uDryK); }
    if (uCut > 0.) a *= 1. - uCut * (.55 + .45 * step(uCutY, vP.y));
    if (uBandW > 0.) a *= 1. - .88 * (1. - smoothstep(uBandW * .4, uBandW, abs(vP.y - uBandY)));
    a *= uAlpha;
    if (a < .008) discard;
    vec3 col = mix(uColor2, uColor, smoothstep(.15, .7, c)) * uLit;
    gl_FragColor = uAdd > .5 ? vec4(col * a, 1.) : vec4(col, a);
  }`;
class Stroke {
  constructor(scene, ctx, { n = 64, additive = false, order = 9, rect = null, dry = null } = {}) {
    this.n = n;
    const pos = new Float32Array((n + 1) * 2 * 3), uv = new Float32Array((n + 1) * 2 * 2), idx = [];
    for (let i = 0; i <= n; i++) { uv.set([i / n, 0, i / n, 1], i * 4); if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: ctx.stripTex }, uNoise: { value: ctx.noise }, uRect: { value: (rect || ctx.strip.brush).clone() }, uDry: { value: (dry || ctx.strip.dry).clone() },
        uColor: { value: C.ink.clone() }, uColor2: { value: C.gray.clone() }, uAlpha: { value: 1 }, uHead: { value: 1 }, uTail: { value: 0 }, uErode: { value: 0.1 }, uDryK: { value: 0.5 },
        uSeed: { value: Math.random() }, uAdd: { value: additive ? 1 : 0 }, uCutY: { value: 0 }, uCut: { value: 0 }, uBandY: { value: 0 }, uBandW: { value: 0 }, uSoft: { value: 0.32 }, uLit: { value: 1 } },
      vertexShader: ST_VS, fragmentShader: ST_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = order; this.mesh.visible = false; this.mesh.name = 'ink-finale-stroke';
    scene.add(this.mesh);
    this.pts = Array.from({ length: n + 1 }, () => new THREE.Vector3());
    this.w = new Float32Array(n + 1);
  }
  get U() { return this.mat.uniforms; }
  // 由 pts / w 建带子：face = 'camera'（朝镜头展开）或一个固定的法线（贴地的带子：向上）
  build(camera, face = 'camera') {
    const P = this.pts, n = this.n, pa = this.geo.attributes.position.array, cp = camera.position;
    for (let i = 0; i <= n; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n, i + 1)];
      _v.subVectors(b, a); if (_v.lengthSq() < 1e-10) _v.set(1, 0, 0);
      if (face === 'camera') _w.subVectors(cp, P[i]); else _w.copy(face);
      _u.crossVectors(_v, _w); if (_u.lengthSq() < 1e-10) _u.set(0, 1, 0);
      _u.normalize().multiplyScalar(this.w[i] * 0.5);
      pa[i * 6] = P[i].x - _u.x; pa[i * 6 + 1] = P[i].y - _u.y; pa[i * 6 + 2] = P[i].z - _u.z;
      pa[i * 6 + 3] = P[i].x + _u.x; pa[i * 6 + 4] = P[i].y + _u.y; pa[i * 6 + 5] = P[i].z + _u.z;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
  hide() { this.mesh.visible = false; }
}

// =====================================================================================
// 水墨版的凤凰、龙（演出实例自己的材质；贴图与几何共用，不碰原技能与守护雷龙的材质）
// =====================================================================================
const NOISE_GLSL = `
  float fiH(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float fiN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
    return mix(mix(mix(fiH(i), fiH(i + vec3(1, 0, 0)), f.x), mix(fiH(i + vec3(0, 1, 0)), fiH(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(fiH(i + vec3(0, 0, 1)), fiH(i + vec3(1, 0, 1)), f.x), mix(fiH(i + vec3(0, 1, 1)), fiH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`;
function inkUniforms() {
  return { uDeep: { value: C.deep.clone() }, uInk: { value: C.ink.clone() }, uGray: { value: C.gray.clone() }, uPaper: { value: C.paper.clone() }, uSilver: { value: C.silver.clone() }, uRed: { value: C.red.clone() },
    uFade: { value: 1 }, uLit: { value: 1 } };
}
// 凤凰：原贴图的亮暗映射到墨色（深墨 → 主墨 → 灰墨 → 纸白，羽面偏亮——一片片羽毛、翼羽的层次看得清，不是一团黑墨）；
// 原来红橙的羽毛只在羽缘（翼尖、长尾的末端）留一点朱红；翼尖、尾梢少量干笔破边；纸白的边光；化墨（溶解）由翼尖向身体
function inkPhoenixMaterial(src, U) {
  const m = new THREE.MeshStandardMaterial({ map: src.map, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.42, transparent: false });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPh;').replace('#include <skinning_vertex>', '#include <skinning_vertex>\n vPh = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uDeep, uInk, uGray, uPaper, uSilver, uRed; uniform float uDissolve, uTime, uSpan, uFade, uLit; varying vec3 vPh;
        ${NOISE_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float fiEdge = 0., fiRed = 0.;
        {
          vec3 c0 = diffuseColor.rgb; float l = dot(c0, vec3(.299, .587, .114)); l = pow(clamp(l * 1.6, 0., 1.), .8);
          float red = clamp((c0.r - max(c0.g, c0.b)) * 2.4, 0., 1.);
          vec3 ink = l < .22 ? mix(uDeep, uInk, l / .22) : l < .5 ? mix(uInk, uGray, (l - .22) / .28) : mix(uGray, uPaper, (l - .5) / .5);
          float r = clamp(length(vPh) / uSpan, 0., 1.);
          fiRed = red * smoothstep(.62, .92, r) * smoothstep(.45, .8, fiN(vPh / uSpan * 14.));
          ink = mix(ink, uRed, fiRed * .45);
          diffuseColor.rgb = ink;
          float br = fiN(vPh / uSpan * 9. + vec3(0., uTime * .3, 0.));
          if (r > .78 && br < (r - .78) * 1.6) discard;
          if (uDissolve > 0.) { float th = uDissolve * 1.45 - (1. - r) * .45; if (br < th) discard; fiEdge = smoothstep(th + .12, th, br); }
          if (uFade < .999) { float d = fract(dot(gl_FragCoord.xy, vec2(.0671, .5831)) * 52.98); if (d > uFade) discard; }
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float rim = pow(1. - abs(dot(normal, normalize(vViewPosition))), 2.4);
          totalEmissiveRadiance += (uPaper * rim * .42 + uGray * fiEdge * .35 + uRed * fiRed * .12) * uLit; }`);
  };
  m.customProgramCacheKey = () => 'phoenix-ink-r27';
  return m;
}
// 龙：金鳞映射成灰白的身子、墨色的鳞缝（鳞片、角、须、鬃都清楚）；沿鳞片走的几道银白细电弧；化墨由头向尾
function inkLoongMaterial(src, U) {
  const m = new THREE.MeshStandardMaterial({ map: src.map, normalMap: src.normalMap, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide, alphaTest: 0.45, transparent: false, envMapIntensity: 0.6 });
  if (m.normalMap) m.normalScale.set(1.2, 1.2);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLb;').replace('#include <begin_vertex>', '#include <begin_vertex>\n vLb = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uDeep, uInk, uGray, uPaper, uSilver, uRed; uniform float uDissolve, uTime, uArc, uFlash, uFade, uLit; uniform vec2 uZ; varying vec3 vLb;
        ${NOISE_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float lgEdge = 0.;
        {
          vec3 c0 = diffuseColor.rgb; float l = dot(c0, vec3(.299, .587, .114));
          float hi = smoothstep(.16, .6, l);
          vec3 body = mix(uGray, uPaper * .95, hi);
          float groove = 1. - smoothstep(.07, .28, l);
          diffuseColor.rgb = mix(body, uDeep, groove * .92);
          float nb = fiN(vLb * 140.);
          diffuseColor.rgb = mix(diffuseColor.rgb, uInk, smoothstep(.62, .9, nb) * .3);
          if (uDissolve > 0.) {
            float zn = clamp((vLb.z - uZ.x) / (uZ.y - uZ.x), 0., 1.);
            float n = fiN(vLb * 260. + vec3(0., uTime * 2., 0.));
            float th = uDissolve * 1.35 - (1. - zn) * 1.05 + (n - .5) * .3;
            if (th > 0. && n < th * 2.) discard;
            lgEdge = smoothstep(.16, 0., abs(n - th * 2.)) * step(.01, uDissolve);
          }
          if (uFade < .999) { float d = fract(dot(gl_FragCoord.xy, vec2(.0671, .5831)) * 52.98); if (d > uFade) discard; }
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float rim = pow(1. - abs(dot(normal, normalize(vViewPosition))), 2.4);
          vec3 q = vLb * 180. + vec3(uTime * 1.7, -uTime * 2.3, uTime * .9);
          float a1 = abs(fiN(q) - .5), a2 = abs(fiN(q * 2.1 + 7.3) - .5);
          float vein = smoothstep(.03, .0, a1) * (.6 + .4 * smoothstep(.05, .0, a2));
          totalEmissiveRadiance += (uSilver * (rim * .35 + vein * uArc * 1.5 + uFlash * .4) + uGray * lgEdge * .3) * uLit;
        }`);
  };
  m.customProgramCacheKey = () => 'loong-ink-r27';
  return m;
}

// =====================================================================================
// 画面
// =====================================================================================
export class InkFinaleFx {
  // scene：当前场景；ink：loadInkAssets 的结果（两组水墨贴图集）；models：{ phoenix, loong, scroll }（gltf）；calli：{ tex, meta }（书法贴图）；
  // stage：InkStage（山水与画中世界）；post：调色与退场叠化；lit()：天光（0 夜 … 1 昼）
  constructor(scene, { ink = null, models = {}, calli = null, stage = null, quality = 1, post = null, lit = () => 1 } = {}) {
    this.scene = scene; this.A = ink; this.q = quality; this.post = post; this.lit = lit; this.stage = stage;
    this.ready = false; this.now = 0; this.S = null; this.dark = 0;
    this.models = models; this.calli = calli;
    this.stat = { shows: 0, sprites: 0, built: 0 };
    try { this.build(); this.ready = true; } catch (e) { console.warn('[墨里终焉] 演出画面没能建好，处决会退回强化伤害', e); }
  }
  n(k) { return Math.max(1, Math.round(k * this.q)); }
  // ---------- 一次建好：贴图、粒子池、笔触带、画卷、八卦、刀光、龙凤、定格的书法 ----------
  build() {
    const A = this.A, sc = this.scene, rnd = rng(2027);
    if (!A) throw new Error('水墨贴图集没载入');
    const T1 = rects(A.meta), T2 = rects2(A.ink2?.meta);
    this.T1 = T1.tile; this.T2 = T2?.tile || null;
    const S2 = T2?.strip || null;
    this.ctx = { stripTex: S2 ? A.ink2.tex : A.strips, noise: A.noise,
      strip: S2 ? { brush: S2.brush, wash: S2.wash, dry: S2.dry0, dry1: S2.dry1, taper: S2.taper, line: S2.line } : { brush: T1.strip.stroke, wash: T1.strip.stroke, dry: T1.strip.stroke4, dry1: T1.strip.stroke5, taper: T1.strip.stroke6, line: T1.strip.stroke7 } };
    const cap = Math.round(this.q < 0.75 ? F.budget.sprites.low : F.budget.sprites.cap);
    this.sp = new Sprites(sc, A, cap, false); this.sp.mesh.name = 'finale-ink';
    this.sp2 = A.ink2 ? new Sprites(sc, { sprites: A.ink2.tex, noise: A.noise }, cap, false) : null; if (this.sp2) this.sp2.mesh.name = 'finale-ink2';
    this.spL = new Sprites(sc, A, Math.round(cap / 3), true); this.spL.mesh.name = 'finale-light';
    for (const s of [this.sp, this.sp2, this.spL]) if (s) s.mesh.renderOrder = 12;
    // 第二十八轮：第三组水墨（ink3：放射墨裂、上喷的墨丝、墨点、刺线）——龙凤撞入的墨震用
    this.T3 = rects2(A.ink3?.meta)?.tile || null;
    this.sp3 = A.ink3 ? new Sprites(sc, { sprites: A.ink3.tex, noise: A.noise }, Math.round(cap / 3), false) : null;
    if (this.sp3) { this.sp3.mesh.name = 'finale-ink3'; this.sp3.mesh.renderOrder = 12; }
    this.tex = {
      paper: canvasTex(paintPaper(rnd), { repeat: true }),
      land: canvasTex(paintLand('near', rng(91)), { repeat: true }),
      bagua: canvasTex(paintBagua(rnd), { data: true }),
    };
    // 笔触带：墨痕（化墨移位）、穿行的刀光（银白 + 飞白）、墨带、墨流（撞入后流进八卦）、横向刀光（银白芯、飞白、墨裂）
    this.trace = new Stroke(sc, this.ctx, { n: 64, rect: this.ctx.strip.brush });
    this.trail = [new Stroke(sc, this.ctx, { n: 32, additive: true, rect: this.ctx.strip.taper, order: 13 }), new Stroke(sc, this.ctx, { n: 32, rect: this.ctx.strip.dry, order: 12 })];
    const nr = this.q < 0.75 ? F.budget.ribbons.low : F.budget.ribbons.n;
    this.ribs = Array.from({ length: nr }, (_, i) => new Stroke(sc, this.ctx, { n: F.budget.ribbons.seg, rect: i % 3 === 2 ? this.ctx.strip.wash : this.ctx.strip.brush, dry: i % 2 ? this.ctx.strip.dry1 : this.ctx.strip.dry }));
    this.flows = Array.from({ length: 4 }, (_, i) => new Stroke(sc, this.ctx, { n: 40, rect: i % 2 ? this.ctx.strip.wash : this.ctx.strip.brush, dry: this.ctx.strip.dry }));
    this.slashS = [new Stroke(sc, this.ctx, { n: 24, rect: this.ctx.strip.line, order: 15 }), new Stroke(sc, this.ctx, { n: 24, rect: this.ctx.strip.dry, order: 14 }),
      ...Array.from({ length: 3 }, () => new Stroke(sc, this.ctx, { n: 10, rect: this.ctx.strip.line, order: 14 })), new Stroke(sc, this.ctx, { n: 24, rect: this.ctx.strip.taper, order: 14 })];
    // 第二十八轮：墨震的笔触——天上砸下的墨柱（朝镜头）、由落点裂开的墨裂（贴地）
    this.pillarS = Array.from({ length: F.quake.pillars.n }, (_, i) => new Stroke(sc, this.ctx, { n: 24, rect: i % 2 ? this.ctx.strip.wash : this.ctx.strip.brush, dry: this.ctx.strip.dry, order: 11 }));
    this.crackS = Array.from({ length: this.q < 0.75 ? F.quake.cracks.low : F.quake.cracks.n }, () => new Stroke(sc, this.ctx, { n: 12, rect: this.ctx.strip.line, dry: this.ctx.strip.dry1, order: 8 }));
    this.buildScroll(); this.buildBagua(); this.buildRing(); this.buildBirds(); this.buildTitle();
    this.all = [this.trace.mesh, ...this.trail.map((s) => s.mesh), ...this.ribs.map((s) => s.mesh), ...this.flows.map((s) => s.mesh), ...this.slashS.map((s) => s.mesh),
      ...this.pillarS.map((s) => s.mesh), ...this.crackS.map((s) => s.mesh),
      this.scroll.mesh, this.scroll.roll, ...this.scroll.props, this.bagua.mesh, this.title.mesh, this.ring.mesh,
      ...(this.phx ? [this.phx.root] : []), ...(this.loong ? [this.loong.root] : [])];
    for (const o of this.all) if (o.parent !== sc && o !== this.ring.mesh) sc.add(o);
  }
  // 演出里要保留（不被画中世界替换隐去）的全部物体
  keepList() { return [...this.all.filter((o) => o !== this.ring.mesh), ...this.pools.filter(Boolean).map((s) => s.mesh)]; }
  // 全部粒子池（第二十八轮加了第三组水墨 sp3）
  get pools() { return [this.sp, this.sp2, this.spL, this.sp3]; }

  // ---------- 画卷：宣纸长条（逐段贴地）+ 纸卷 + 素材的卷轴、上沿细杆、绳结 ----------
  buildScroll() {
    const B = F.scroll, nx = B.seg, ny = B.cols;
    const g = new THREE.PlaneGeometry(1, 1, nx, ny);
    const tear = new Float32Array((nx + 1) * (ny + 1));
    g.setAttribute('aTear', new THREE.BufferAttribute(tear, 1));
    const ct = this.calli?.tex || null;
    const U = { uFlow: { value: 0 }, uLen: { value: 1 }, uWid: { value: 1 }, uTime: { value: 0 }, uFade: { value: 0 }, uInk: { value: C.ink }, uDeep: { value: C.deep }, uGray: { value: C.gray }, uRed: { value: C.red },
      uNoise: { value: this.ctx.noise }, uLand: { value: this.tex.land }, uPaint: { value: 1 },
      uCalli: { value: ct || this.tex.paper }, uCR: { value: new THREE.Vector4(0, 0, 1, 1) }, uCP: { value: new THREE.Vector4() }, uCA: { value: 0 }, uHasC: { value: ct ? 1 : 0 },
      uBag: { value: new THREE.Vector3(0, 0, 0) } };
    const mat = new THREE.MeshStandardMaterial({ map: this.tex.paper, roughness: 0.95, metalness: 0, transparent: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aTear; varying float vTear; varying vec2 vSu;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n vTear = aTear; vSu = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          uniform float uFlow, uLen, uWid, uTime, uFade, uPaint, uCA, uHasC; uniform vec3 uInk, uDeep, uGray, uRed, uBag; uniform vec4 uCR, uCP; uniform sampler2D uNoise, uLand, uCalli; varying float vTear; varying vec2 vSu;`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          {
            float u = vSu.x, v = 1. - vSu.y, s = u * uLen, w = (v - .5) * uWid;
            float n = texture2D(uNoise, vec2(s, w) * .23).r;
            // 纸边：两侧与两端稍暗、边缘不齐
            float ed = min(min(v, 1. - v) * uWid, min(s, uLen - s));
            diffuseColor.rgb *= mix(.8, 1., smoothstep(0., .22, ed + n * .06));
            // 裱边：两侧一道灰青的绫，内沿一线细墨
            float bw = .3, dv = min(v, 1. - v) * uWid;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.27, .33, .37) * (.85 + .3 * n), 1. - step(bw, dv));
            diffuseColor.rgb = mix(diffuseColor.rgb, uInk, (1. - smoothstep(0., .014, abs(dv - bw))) * .85);
            // 画心：一行行小山水（峰顶朝向敌人一方）、随卷铺开显现；书法、八卦处让开
            float flow = smoothstep(uFlow + .02, uFlow - .05, u + n * .03);
            float row = floor(s / 1.7);
            vec4 land = texture2D(uLand, vec2((w / uWid + .5) * 1.15 + row * .37, clamp(fract(s / 1.7) * 1.08 - .04, 0., 1.)));
            float quiet = 1.;
            vec2 cq = vec2(s - uCR.x, w - uCR.y);
            if (cq.x > -.25 && cq.x < uCR.z * 4. + .25 && cq.y > -.25 && cq.y < uCR.w + .25) quiet = .25;
            quiet *= smoothstep(uBag.z * .85, uBag.z * 1.15, length(vec2(s - uBag.x, w - uBag.y)));
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(uGray, uInk, .35 + .3 * land.a), land.a * .62 * flow * step(bw + .12, dv) * uPaint * quiet);
            // 书法「墨里终焉」：竖排，自敌人一端起读（墨 在远端、焉 在近端），笔顺逐笔显现；写到的前沿是润墨（更浓）
            if (uHasC > .5) {
              float cx = (w - uCR.y) / uCR.w, sl = (s - uCR.x) / uCR.z;
              if (cx > 0. && cx < 1. && sl > 0. && sl < 4.) {
                float k = 3. - floor(sl), cy = 1. - fract(sl);
                vec4 cal = texture2D(uCalli, vec2(cx, 1. - (k + cy) * .25));
                float prog = k < .5 ? uCP.x : k < 1.5 ? uCP.y : k < 2.5 ? uCP.z : uCP.w;
                float shown = smoothstep(cal.g, cal.g + .012, prog);
                float dis = smoothstep(n * .7, n * .7 + .3, uCA);
                float a = cal.a * shown * dis;
                float front = (1. - smoothstep(0., .07, prog - cal.g)) * shown;
                vec3 ink = mix(uGray, uDeep, clamp(cal.r * 1.05, 0., 1.));
                ink = mix(ink, uDeep, front * .45 + cal.b * .15);
                diffuseColor.rgb = mix(diffuseColor.rgb, ink, a);
              }
            }
            diffuseColor.a *= (1. - vTear) * smoothstep(0., .06, ed + n * .05) * uFade;
            if (diffuseColor.a < .02) discard;
          }`);
    };
    mat.customProgramCacheKey = () => 'finale-scroll-r27';
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.renderOrder = 2; mesh.visible = false; mesh.name = 'finale-scroll';
    // 纸卷（外面一层纸，随展开变细、滚动）
    const rollMat = new THREE.MeshStandardMaterial({ map: this.tex.paper, roughness: 0.9, metalness: 0 });
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 28, 1, false), rollMat);
    roll.castShadow = true; roll.receiveShadow = true; roll.frustumCulled = false; roll.visible = false; roll.name = 'finale-roll';
    // 素材：卷轴（轴身与两端深色轴头）、上沿细杆、绳结（形态键）
    const props = [], parts = {};
    const M = this.models.scroll;
    if (M) M.scene.traverse((o) => { if (o.isMesh) parts[o.name] = o; });
    const wood = new THREE.MeshStandardMaterial({ color: 0x241a15, roughness: 0.48, metalness: 0.08 });
    const cord = new THREE.MeshStandardMaterial({ color: 0x6e2b24, roughness: 0.8, metalness: 0 });
    const prop = (name, mat) => {
      const src = parts[name]; if (!src) return null;
      const m = new THREE.Mesh(src.geometry, mat);
      if (src.morphTargetInfluences) { m.morphTargetInfluences = src.morphTargetInfluences.slice().fill(0); m.morphTargetDictionary = src.morphTargetDictionary; }
      m.castShadow = true; m.frustumCulled = false; m.visible = false; m.name = 'finale-' + name;
      // 素材的「轴沿 X、厚度朝 +Y、纸往 −Z」→ 游戏里按画卷的方向摆（见 placeProp）；几何的局部变换已烘在网格里（量化缩放在网格节点上）
      src.updateWorldMatrix(true, false); m.userData.base = src.matrixWorld.clone();
      props.push(m); return m;
    };
    const roller = prop('roller', wood), topRod = prop('topRod', wood), knot = prop('knot', cord);
    const meta = this.models.scrollMeta || { roller_r: 0.0485, roller_len: 1.79, knot_frames: [1, 22, 26, 30, 34, 38, 42, 46, 50, 56, 64, 74] };
    this.scroll = { mesh, U, roll, props, roller, topRod, knot, meta, geo: g, tear, nx, ny, spin: 0 };
  }
  // ---------- 八卦：贴地的一盘 ----------
  buildBagua() {
    const U = { uTex: { value: this.tex.bagua }, uNoise: { value: this.ctx.noise }, uK0: { value: 0 }, uK1: { value: 0 }, uK2: { value: 0 }, uA0: { value: 0 }, uA1: { value: 0 }, uA2: { value: 0 },
      uAlpha: { value: 1 }, uInk: { value: C.ink }, uDeep: { value: C.deep }, uGray: { value: C.gray }, uSilver: { value: C.silver }, uPaper: { value: C.paper }, uLit: { value: 1 }, uGlint: { value: 0 } };
    const mat = new THREE.ShaderMaterial({ uniforms: U,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform sampler2D uTex, uNoise; uniform float uK0, uK1, uK2, uA0, uA1, uA2, uAlpha, uLit, uGlint; uniform vec3 uInk, uDeep, uGray, uSilver, uPaper; varying vec2 vUv;
        vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
        void main() {
          vec2 p = vUv - .5; float r = length(p) * 2.; if (r > 1.) discard;
          float n = texture2D(uNoise, vUv * 2.3).r, ang = atan(p.y, p.x) / 6.2832 + .5;
          float t = texture2D(uTex, rot(p, uA0) + .5).r, g = texture2D(uTex, rot(p, uA1) + .5).g, b = texture2D(uTex, rot(p, uA2) + .5).b;
          // 显现：阴阳鱼由中心洇开；八卦按方位一卦卦扫开；墨线由内向外
          t *= smoothstep(r * .9 + n * .25, r * .9 + n * .25 + .08, uK0 * 1.4);
          g *= smoothstep(fract(ang + .25) * .8 + n * .2, fract(ang + .25) * .8 + n * .2 + .06, uK1 * 1.1);
          b *= smoothstep((r - .3) * 1.2 + n * .2, (r - .3) * 1.2 + n * .2 + .08, uK2 * 1.3);
          float d = max(t, max(g, b * .85));
          float a = d * uAlpha * (.55 + .45 * smoothstep(.0, .5, d));
          if (a < .01) discard;
          vec3 col = mix(uGray, mix(uInk, uDeep, smoothstep(.6, 1., d)), smoothstep(.2, .7, d));
          col += uSilver * uGlint * smoothstep(.3, .6, g) * (1. - smoothstep(.6, .95, g)) * .3;
          gl_FragColor = vec4(col * uLit, a);
        }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -10 });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 72), mat);
    mesh.rotation.x = -Math.PI / 2; mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 4; mesh.name = 'finale-bagua';
    this.bagua = { mesh, U };
  }
  // ---------- 墨势成势：鞘口一圈克制的墨色环纹 ----------
  buildRing() {
    const U = { uTex: { value: this.ctx.stripTex }, uRect: { value: this.ctx.strip.brush.clone() }, uNoise: { value: this.ctx.noise }, uTime: { value: 0 }, uK: { value: 0 }, uInk: { value: C.deep }, uGray: { value: C.gray }, uSilver: { value: C.silver } };
    const mat = new THREE.ShaderMaterial({ uniforms: U,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform sampler2D uTex, uNoise; uniform vec4 uRect; uniform float uTime, uK; uniform vec3 uInk, uGray, uSilver; varying vec2 vUv;
        void main() {
          float u = fract(vUv.x + uTime * .18), v = vUv.y;
          float c = texture2D(uTex, vec2(uRect.x + u * uRect.z, uRect.y + (1. - v) * uRect.w)).r;
          float n = texture2D(uNoise, vec2(u * 3. + uTime * .1, v)).r;
          float a = smoothstep(.32 + n * .36, .72, c) * uK * .92;
          if (a < .01) discard;
          float edge = smoothstep(.32 + n * .36, .55, c) * (1. - smoothstep(.6, .88, c));
          vec3 col = mix(mix(uGray, uInk, smoothstep(.4, .9, c)), uSilver, edge * .9);
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 28, 1, true), mat);
    mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 7; mesh.name = 'finale-ready-ring';
    this.ring = { mesh, U, k: 0, wisp: 0 };
  }
  // ---------- 龙凤：独立的演出实例（克隆骨架；材质换成水墨版，原技能的材质不动）----------
  buildBirds() {
    const M = this.models;
    this.phx = null; this.loong = null;
    if (M.phoenix) {
      try {
        const rig = new PhoenixRig(M.phoenix);
        const U = { ...rig.U, ...inkUniforms() };
        const made = new Map();
        for (const mesh of rig.meshes) {
          const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const out = src.map((m) => { if (!made.has(m)) made.set(m, inkPhoenixMaterial(m, U)); return made.get(m); });
          mesh.material = Array.isArray(mesh.material) ? out : out[0];
          mesh.castShadow = true;
        }
        for (const m of rig.materials) m.dispose();
        rig.materials = [...made.values()];
        rig.inkU = U;
        rig.root.visible = false; rig.root.name = 'finale-phoenix';
        this.phx = rig;
      } catch (e) { console.warn('[墨里终焉] 演出用的凤凰没建好', e); }
    }
    if (M.loong) {
      try {
        const rig = new LoongRig(M.loong, { length: F.birds.dragon.length });
        const U = { ...rig.U, ...inkUniforms() };
        const made = new Map();
        for (const mesh of rig.meshes) { const s = mesh.material; if (!made.has(s)) made.set(s, inkLoongMaterial(s, U)); mesh.material = made.get(s); }
        for (const m of rig.materials) m.dispose();
        rig.materials = [...made.values()];
        for (const m of rig.materials) m.clippingPlanes = [rig.clip];
        rig.inkU = U;
        rig.U.uArc.value = 0.45;
        rig.root.visible = false; rig.root.name = 'finale-loong';
        this.loong = rig;
      } catch (e) { console.warn('[墨里终焉] 演出用的龙没建好', e); }
    }
  }
  // ---------- 定格的书法「终焉」：画面上的一块（书法贴图的后两格），逐笔写出；不是界面字体 ----------
  buildTitle() {
    const ct = this.calli?.tex || null;
    const U = { uCalli: { value: ct || this.tex.paper }, uP: { value: new THREE.Vector2() }, uA: { value: 0 }, uDeep: { value: C.deep }, uGray: { value: C.gray }, uPaper: { value: C.paper }, uRed: { value: C.red }, uNoise: { value: this.ctx.noise } };
    const mat = new THREE.ShaderMaterial({ uniforms: U,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform sampler2D uCalli, uNoise; uniform vec2 uP; uniform float uA; uniform vec3 uDeep, uGray, uPaper, uRed; varying vec2 vUv;
        void main() {
          // 两格：上「终」（贴图第 3 格）、下「焉」（第 4 格）
          float k = vUv.y > .5 ? 0. : 1., cy = 1. - fract(vUv.y * 2.);
          vec4 cal = texture2D(uCalli, vec2(vUv.x, 1. - (2. + k + cy) * .25));
          float prog = k < .5 ? uP.x : uP.y;
          float shown = smoothstep(cal.g, cal.g + .015, prog);
          float a = cal.a * shown * uA;
          // 字后一层极淡的纸色晕（压在深色的龙身上也读得出）
          float halo = smoothstep(.0, .5, texture2D(uCalli, vec2(vUv.x, 1. - (2. + k + cy) * .25), 3.).a) * uA * .35 * max(uP.x, uP.y);
          if (a + halo < .01) discard;
          vec3 ink = mix(uGray, uDeep, clamp(cal.r * 1.05, 0., 1.));
          vec3 col = mix(uPaper, ink, a / max(a + halo * (1. - a), 1e-3));
          gl_FragColor = vec4(col, a + halo * (1. - a));
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, depthTest: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), mat);
    mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 30; mesh.name = 'finale-title';
    this.title = { mesh, U };
  }
  moveTo(scene) {
    this.scene = scene;
    for (const s of this.pools) s?.moveTo(scene);
    for (const o of this.all || []) if (o !== this.ring?.mesh) scene.add(o);
    this.clear();
  }
  // 着色器预编译（第一次处决不卡）：全部临时摆出来编一次；贴图、几何体也先传上显卡
  prewarm(renderer, camera) {
    if (!this.ready) return;
    this.renderer = renderer; this.camera = camera;
    this.warmRestore();
    const keep = this.all.map((o) => o.visible), parentRing = this.ring.mesh.parent;
    const p = camera.position.clone().add(new THREE.Vector3(0, 0, -6).applyQuaternion(camera.quaternion));
    if (!parentRing) this.scene.add(this.ring.mesh);
    for (const o of this.all) { o.visible = true; if (o === this.phx?.root || o === this.loong?.root) o.position.copy(p); }
    for (const s of this.pools) if (s) s.mesh.visible = true;
    try {
      renderer.compile(this.scene, camera);
      this.gpu = gpuWarm(renderer, camera, this.scene, [...this.all, ...this.pools.map((s) => s?.mesh)]);
      this.shadowWarm = { phase: 0 };
    } finally {
      this.all.forEach((o, i) => { o.visible = keep[i]; });
      for (const s of this.pools) if (s) s.mesh.visible = false;
      if (!parentRing) this.scene.remove(this.ring.mesh);
    }
  }

  // =====================================================================================
  // 粒子的小工具
  // =====================================================================================
  spr(o) { if (!o.color) o.color = C.ink; this.sp.write(o, this.now, this.T1); this.stat.sprites++; }
  spr2(o) { if (!this.sp2) return this.spr({ ...o, tile: 'splash', grid: null, rect: null }); if (!o.color) o.color = C.ink; this.sp2.write(o, this.now, this.T2); this.stat.sprites++; }
  light(o) { if (!o.color) o.color = C.silver; this.spL.write(o, this.now, this.T1); }
  seq(name, skip = 2) { const t = this.T2?.[name]; if (!t) return null; const [x, y, w, h] = t.r, [c, r] = t.g; return { rect: [x, y + (skip / r) * h, w, h * (r - skip) / r], grid: [c, r - skip] }; }
  cell(name) { const t = this.T2?.[name]; return t ? cellRect(t, Math.floor(Math.random() * t.g[0] * t.g[1])) : null; }
  splash(p, k = 1, { dark = true, up = 0.4 } = {}) {
    const s = this.seq('burst', 3) || this.seq('burstD', 2);
    if (s) this.spr2({ p: p.clone(), v: new THREE.Vector3(0, up * 0.3, 0), rect: s.rect, grid: s.grid, span: 0.8, size: [0.45 * k, 1.35 * k], life: 0.5, drag: 2, color: dark ? C.ink : C.gray, alpha: 0.78, fadeOut: 0.5, rot: R(0, 6.28) });
    for (let i = 0; i < this.n(10 * k); i++) {
      const v = new THREE.Vector3(R(-1, 1), R(0.1, 1), R(-1, 1)).normalize().multiplyScalar(R(2.5, 6.5) * Math.sqrt(k));
      this.spr({ p: p.clone(), v, tile: 'dot', mode: 1, size: [R(0.03, 0.06) * Math.sqrt(k), R(0.02, 0.04)], stretch: 0.05, life: R(0.35, 0.6), gravity: 9, drag: 2, alpha: 0.95, fadeOut: 0.6 });
    }
    for (let i = 0; i < this.n(3 * k); i++) this.spr({ p: p.clone().add(new THREE.Vector3(R(-0.3, 0.3), R(-0.1, 0.4), R(-0.3, 0.3))), v: new THREE.Vector3(R(-0.6, 0.6), R(0.2, 0.7), R(-0.6, 0.6)), tile: 'mist', size: [0.9 * k, 1.9 * k], life: R(0.7, 1.1), drag: 1.4, color: C.gray, alpha: 0.32, soft: true, fadeIn: 0.1, fadeOut: 0.45, rot: R(-0.5, 0.5), spin: R(-0.3, 0.3) });
  }
  // 画中世界替换原场景的物体时：那一处一团墨雾（遮住隐去的那一下）
  puff(c, r) {
    if (!this.ready || !this.S || (this.puffs = (this.puffs || 0) + 1) > F.budget.puffs) return;
    const k = Math.min(3.5, 0.6 + r * 0.25);
    for (let i = 0; i < 2; i++) this.spr({ p: c.clone().add(new THREE.Vector3(R(-0.4, 0.4) * k, R(-0.3, 0.5) * k, R(-0.4, 0.4) * k)), v: new THREE.Vector3(R(-0.5, 0.5), R(0.1, 0.6), R(-0.5, 0.5)), tile: 'mist', size: [1.4 * k, 3.0 * k], life: R(0.6, 0.9), drag: 1.2, color: C.paper, alpha: i ? 0.22 : 0.34, soft: true, fadeIn: 0.05, fadeOut: 0.5, rot: R(-1, 1), spin: R(-0.3, 0.3) });
  }

  // =====================================================================================
  // 墨势：鞘口的墨环（成势时）、成势的一下墨溅、满蓄力的提示
  // =====================================================================================
  readyRing(P, on, dt) {
    if (!this.ready) return;
    const R0 = this.ring, ch = P.char, mesh = R0.mesh;
    R0.k += ((on ? 1 : 0) - R0.k) * Math.min(1, dt * (on ? 3 : 6));
    const show = R0.k > 0.01 && ch?.sheath && ch.sword && !P.flying;
    if (show && mesh.parent !== ch.sheath) ch.sheath.add(mesh);
    mesh.visible = !!show;
    if (!show) return;
    const g = ch.sword.guard?.[1] ?? 0.12;
    mesh.position.set(0, g + 0.03, 0); mesh.scale.set(0.1, 0.07, 0.1);
    R0.U.uTime.value += dt; R0.U.uK.value = R0.k * (0.75 + 0.25 * Math.sin(R0.U.uTime.value * 2.2));
    if (on && (R0.wisp -= dt) <= 0) {
      R0.wisp = 0.5 + Math.random() * 0.4;
      mesh.updateWorldMatrix(true, false);
      const p = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
      this.spr({ p, v: new THREE.Vector3(R(-0.1, 0.1), R(0.25, 0.45), R(-0.1, 0.1)), tile: 'mist', size: [0.12, 0.34], life: 0.9, drag: 1, color: C.gray, alpha: 0.16, soft: true, fadeIn: 0.2, fadeOut: 0.5, spin: R(-0.6, 0.6) });
    }
  }
  readyBurst(P) {
    if (!this.ready) return;
    const ch = P.char; let p = null;
    if (ch?.sheath) { ch.sheath.updateWorldMatrix(true, false); p = new THREE.Vector3(0, (ch.sword?.guard?.[1] ?? 0.12) + 0.05, 0).applyMatrix4(ch.sheath.matrixWorld); }
    p ||= P.pos.clone().setY(P.pos.y + 1.0);
    for (let i = 0; i < this.n(8); i++) { const a = (i / 8) * Math.PI * 2; this.spr({ p: p.clone(), v: new THREE.Vector3(Math.cos(a) * 1.4, R(0.1, 0.6), Math.sin(a) * 1.4), tile: 'dot', mode: 1, size: [0.035, 0.02], stretch: 0.05, life: 0.45, drag: 3, gravity: 2, alpha: 0.9 }); }
    const s = this.seq('wisp', 0);
    if (s) this.spr2({ p: p.clone(), rect: s.rect, grid: s.grid, span: 0.9, size: [0.3, 0.75], life: 0.7, drag: 1, color: C.ink, alpha: 0.55, fadeOut: 0.5 });
  }
  chargeFull(P) {
    if (!this.ready) return;
    if (this.renderer && !this.S && !this.shadowWarm) this.shadowWarm = { phase: 0 };
    const ch = P.char; if (!ch?.scabTop) return;
    ch.scabTop.updateWorldMatrix(true, false);
    const p = new THREE.Vector3(0, (ch.sword?.guard?.[1] ?? 0.12), 0).applyMatrix4(ch.scabTop.matrixWorld);
    this.spr({ p, tile: 'enso', mode: 0, size: [0.2, 0.9], life: 0.45, color: C.ink, alpha: 0.7, fadeOut: 0.6, rot: R(0, 6) });
    this.light({ p, tile: 'glow', size: [0.1, 0.5], life: 0.3, alpha: 0.6, fadeOut: 0.7 });
  }

  // =====================================================================================
  // 演出
  // =====================================================================================
  begin(S) {
    this.warmRestore();
    this.clear();
    this.S = S; this.stat.shows++; this.puffs = 0;
    const E = S.E, sz = S.size, plan = S.plan, H = F.pos.height;
    this.cut = false; this.birdsOn = false; this.reformed = false; this.frozen = false;
    this.ground = (x, z, y) => S.fin.ground(x, z, y) ?? y;
    this.center = E.clone();
    this.k = plan.large ? Math.min(2.4, Math.max(1.3, sz.r / 0.75)) : Math.max(0.85, Math.min(1.5, sz.r / 0.45));
    this.waistY = E.y + sz.waist;
    this.topY = E.y + sz.h * 0.95;
    this.chestY = E.y + Math.min(sz.h * 0.62, sz.waist + 1.2);
    // 画卷：由玩家脚下（起点 B 后 back 米）铺向敌人并越过；长 ≥ 8 个人高、宽 2.5–3.5 个人高
    const W = Math.min(3.5 * H, Math.max(F.scroll.width * H, plan.large ? 3.5 * H : 0));
    this.rb = Math.min(F.budget.bagua.r * (plan.large ? Math.min(1.7, (sz.r + 1.3) / 1.75) : 1), W / 2 - 0.2);
    this.layScroll(S, W);
    // 八卦：敌人脚下
    const gy = this.ground(E.x, E.z, E.y + 0.5);
    this.bagua.mesh.position.set(E.x, gy + 0.06, E.z); this.bagua.mesh.scale.setScalar(this.rb);
    for (const k of ['uK0', 'uK1', 'uK2']) this.bagua.U[k].value = 0;
    this.trailPts = [];
    // 龙凤的路径（相对身前四分之三的机位）、定格时的位置（相对近景机位）
    this.planBirds(S);
    return { started: true };
  }
  // 画卷的几何：逐段采样地面高度（相邻高差超过 tear 的地方撕开）
  layScroll(S, W) {
    const Sx = this.scroll, P = F.scroll, nx = Sx.nx, ny = Sx.ny, H = F.pos.height;
    const d = S.u.clone().negate().setY(0).normalize();                 // 玩家走向敌人的方向
    const side = new THREE.Vector3(-d.z, 0, d.x);
    const start = S.B.clone().addScaledVector(d, -P.back);
    const need = start.distanceTo(S.Fp) + 2.5;
    const L = Math.max(P.len * H, need);
    Sx.d = d; Sx.side = side; Sx.start = start; Sx.L = L; Sx.W = W; Sx.ys = new Float32Array((nx + 1) * (ny + 1));
    const vi = (i, j) => j * (nx + 1) + i;
    Sx.vi = vi;
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
      const s = (i / nx) * L, w = (0.5 - j / ny) * W;
      const x = start.x + d.x * s + side.x * w, z = start.z + d.z * s + side.z * w;
      let y = this.ground(x, z, S.B.y + 0.5);
      if (!(Math.abs(y - S.B.y) < 1.4)) y = S.B.y;                       // 地面采样不到、或落在墙顶屋檐（画中世界已替换原场景）：按演出处的地面高
      Sx.ys[vi(i, j)] = y;
      Sx.tear[vi(i, j)] = 0;
    }
    for (let i = 1; i <= nx; i++) for (let j = 0; j <= ny; j++) if (Math.abs(Sx.ys[vi(i, j)] - Sx.ys[vi(i - 1, j)]) > P.tear) { Sx.tear[vi(i, j)] = 1; Sx.tear[vi(i - 1, j)] = 1; }
    Sx.geo.attributes.aTear.needsUpdate = true;
    Sx.U.uLen.value = L; Sx.U.uWid.value = W;
    Sx.front = 0; Sx.spin = 0;
    // 书法的一列：卷的一侧（自玩家起向敌人方向），避开人物与八卦（放不下时放到敌人身后那一段）
    const sB = P.back, sE = start.distanceTo(new THREE.Vector3(S.E.x, start.y, S.E.z));
    const cw = Math.min(F.calli.size, W * 0.24), w0 = Math.max(0.75, F.calli.side * W / 2 - cw / 2);
    const near = Math.max(0.25, sB - F.calli.from), bagEdge = sE - Math.sqrt(Math.max(0, this.rb * this.rb - w0 * w0)) - 0.25;
    let cs = Math.min(F.calli.size, (bagEdge - near) / 4), s0 = near;
    if (cs < 0.8) { cs = Math.min(F.calli.size, (L - 0.3 - (sE + Math.sqrt(Math.max(0, this.rb * this.rb - w0 * w0)) + 0.25)) / 4); s0 = sE + Math.sqrt(Math.max(0, this.rb * this.rb - w0 * w0)) + 0.25; }
    cs = Math.max(0.6, cs);
    Sx.U.uCR.value.set(s0, w0, cs, cw);
    Sx.calli = { s0, w0, cs, cw, sE, side: 'right' };
    Sx.U.uBag.value.set(sE, 0, this.rb);
    // 画卷素材的尺度：卷轴两端露出轴头；纸卷的半径（展开前最粗）
    const rodR = 0.07, rr0 = Math.max(rodR + 0.06, P.roll);
    Sx.rodR = rodR; Sx.rr0 = rr0;
  }
  // 画卷铺到 f（0 … 1）：铺开的部分贴地，前沿裹在纸卷上（纸卷向前滚、变细）
  updateScroll(f, fade, t, knotK) {
    const Sx = this.scroll, P = F.scroll, nx = Sx.nx, ny = Sx.ny, pa = Sx.geo.attributes.position.array;
    const L = Sx.L, W = Sx.W, front = f * L, vi = Sx.vi, fi = Math.min(nx, Math.round(f * nx));
    const Rr = Math.sqrt(Sx.rodR * Sx.rodR + (Sx.rr0 * Sx.rr0 - Sx.rodR * Sx.rodR) * (1 - f));
    Sx.spin += (front - (Sx.front ?? 0)) / Math.max(0.05, Rr);
    Sx.front = front;
    for (let i = 0; i <= nx; i++) {
      const s = (i / nx) * L;
      for (let j = 0; j <= ny; j++) {
        const w = (0.5 - j / ny) * W, k = vi(i, j) * 3, aw = Math.abs(w) / (W / 2);
        const curl = P.curl * Math.pow(smooth(0.86, 1, aw), 2) + P.curl * 0.8 * (1 - smooth(0, 0.35, s));       // 卷边：两侧微微翘起、上沿（细杆处）略高
        const y0 = Sx.ys[vi(i, j)] + P.lift + curl;
        let x = Sx.start.x + Sx.d.x * s + Sx.side.x * w, z = Sx.start.z + Sx.d.z * s + Sx.side.z * w, y = y0;
        if (s > front) {
          const fx = Sx.start.x + Sx.d.x * front, fz = Sx.start.z + Sx.d.z * front, phi = Math.min(Math.PI * 0.92, (s - front) / Rr), rr = Rr * 0.985;
          x = fx + Sx.side.x * w + Sx.d.x * rr * Math.sin(phi); z = fz + Sx.side.z * w + Sx.d.z * rr * Math.sin(phi); y = Sx.ys[vi(fi, j)] + P.lift + rr * (1 - Math.cos(phi));
        }
        pa[k] = x; pa[k + 1] = y; pa[k + 2] = z;
      }
    }
    Sx.geo.attributes.position.needsUpdate = true;
    Sx.geo.computeVertexNormals();
    Sx.U.uFlow.value = Math.min(1, f * 1.04); Sx.U.uTime.value = t; Sx.U.uFade.value = fade;
    // 纸卷、卷轴
    const cy = Sx.ys[vi(fi, ny >> 1)] + P.lift + Rr;
    const c = new THREE.Vector3(Sx.start.x + Sx.d.x * front, cy, Sx.start.z + Sx.d.z * front);
    _q.setFromUnitVectors(UP, Sx.side);
    const spinQ = new THREE.Quaternion().setFromAxisAngle(UP, Sx.spin);
    Sx.roll.position.copy(c); Sx.roll.scale.set(Rr, W + 0.02, Rr); Sx.roll.quaternion.copy(_q).multiply(spinQ);
    const vis = fade > 0.01, rolling = vis && f < 0.997;
    Sx.mesh.visible = vis; Sx.roll.visible = rolling;
    // 素材的轴：轴沿 X → 画卷的横向；厚度 +Y → 上；纸往 −Z → 玩家一侧（−d）……按「side, up, −d」的基摆
    const basis = new THREE.Matrix4().makeBasis(Sx.side, UP, Sx.d.clone().negate());
    const place = (m, pos, sx, syz, spin = 0) => {
      if (!m) return;
      const T = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromRotationMatrix(basis).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), spin)), new THREE.Vector3(sx, syz, syz));
      m.matrixAutoUpdate = false; m.matrix.copy(T).multiply(m.userData.base); m.matrixWorldNeedsUpdate = true;
    };
    const meta = Sx.meta;
    place(Sx.roller, c, (W + 0.22) / meta.roller_len, Sx.rodR / meta.roller_r, -Sx.spin);
    if (Sx.roller) Sx.roller.visible = vis;
    const top = new THREE.Vector3(Sx.start.x, Sx.ys[vi(0, ny >> 1)] + P.lift + 0.03, Sx.start.z);
    place(Sx.topRod, top, (W + 0.1) / (meta.roller_len * 0.954), 2.6);
    if (Sx.topRod) Sx.topRod.visible = vis;
    // 绳结：卷着时套在纸卷中间；解开（形态键逐帧插值）后松落在纸上，随后淡去
    if (Sx.knot) {
      const kk = knotK ?? 0;
      Sx.knot.visible = vis && kk < 0.999 && kk >= 0;
      if (Sx.knot.visible) {
        const n = Sx.knot.morphTargetInfluences?.length || 0;
        if (n) { Sx.knot.morphTargetInfluences.fill(0); const x = Math.min(n, kk * 1.15 * n), a = Math.floor(x), fr = x - a; if (a >= 1 && a <= n) Sx.knot.morphTargetInfluences[a - 1] = 1 - fr; if (a + 1 >= 1 && a + 1 <= n && fr > 0) Sx.knot.morphTargetInfluences[a] = fr; if (a === 0) Sx.knot.morphTargetInfluences[0] = fr; }
        const kc = new THREE.Vector3(Sx.start.x, Sx.ys[vi(0, ny >> 1)] + P.lift + Sx.rr0, Sx.start.z);
        place(Sx.knot, kc, Sx.rr0 / 0.0547, Sx.rr0 / 0.0547);
      }
    }
  }

  // ---------- 一次性的事件 ----------
  event(name, S, o = {}) {
    if (!this.ready || !this.S) return;
    const E = this.center;
    if (name === 'stagger') {
      this.splash(E.clone().setY(this.waistY + 0.2), 0.55 * this.k, { up: 0.6 });
    } else if (name === 'teleport') {
      // 化墨移位：起点墨气散开（不是一团实墨）、终点墨气聚拢
      const a = S.P0.clone().setY(S.P0.y + 1.0), b = S.B.clone().setY(S.B.y + 1.0);
      for (let i = 0; i < this.n(8); i++) this.spr({ p: a.clone().add(new THREE.Vector3(R(-0.3, 0.3), R(-0.5, 0.6), R(-0.3, 0.3))), v: new THREE.Vector3(R(-1.2, 1.2), R(0.2, 1.0), R(-1.2, 1.2)), tile: 'mist', size: [0.4, 1.2], life: R(0.45, 0.75), drag: 1.8, color: C.ink, alpha: 0.4, soft: true, fadeIn: 0.05, fadeOut: 0.5, rot: R(-1, 1), spin: R(-0.6, 0.6) });
      for (let i = 0; i < this.n(14); i++) this.spr({ p: a.clone().add(new THREE.Vector3(R(-0.2, 0.2), R(-0.6, 0.6), R(-0.2, 0.2))), v: new THREE.Vector3(R(-3, 3), R(0, 3), R(-3, 3)), tile: 'dot', mode: 1, size: [R(0.025, 0.05), 0.02], stretch: 0.06, life: R(0.3, 0.5), gravity: 6, drag: 2, alpha: 0.9, fadeOut: 0.6 });
      for (let i = 0; i < this.n(12); i++) { const p = b.clone().add(new THREE.Vector3(R(-1.3, 1.3), R(-0.7, 1.0), R(-1.3, 1.3))); this.spr({ p, v: b.clone().sub(p).multiplyScalar(2.4), tile: 'mist', size: [0.55, 0.15], life: 0.42, drag: 0.5, color: C.ink, alpha: 0.42, soft: true, fadeIn: 0.1, fadeOut: 0.6 }); }
    } else if (name === 'pass') {
      this.light({ p: E.clone().setY(this.waistY), tile: 'glow', size: [0.2, 1.4], life: 0.18, alpha: 0.75, fadeOut: 0.8 });
      for (let i = 0; i < this.n(12); i++) { const v = S.u.clone().multiplyScalar(R(5, 11)).add(new THREE.Vector3(R(-0.6, 0.6), R(-0.2, 0.5), R(-0.6, 0.6))); this.spr2({ p: E.clone().setY(this.waistY + R(-0.2, 0.3)), v: v.negate(), rect: this.cell('fine'), size: [0.25, 0.08], mode: 1, stretch: 0.12, life: 0.4, drag: 2.5, color: C.paper, alpha: 0.5, fadeOut: 0.5 }); }
    } else if (name === 'dash') {
      // 穿行的残影：沿路一串淡墨（人一闪而过）
      const a = S.D.clone(), b = S.Fp.clone();
      for (let i = 0; i < this.n(10); i++) { const p = a.clone().lerp(b, i / 9).setY(a.y + R(0.5, 1.5)); this.spr({ p, v: S.u.clone().multiplyScalar(-R(0.5, 1.5)), tile: 'mist', size: [0.5, 1.1], life: R(0.35, 0.55), drag: 2, color: C.ink, alpha: 0.28, soft: true, fadeIn: 0.02, fadeOut: 0.5, delay: i * 0.025, rot: R(-1, 1) }); }
    } else if (name === 'finish') {
      this.finish(S, o.skip);
    }
  }
  // 没有演出时：粒子照常推进（鞘口的墨气、成势的墨溅）
  idle(dt) {
    if (!this.ready) return;
    this.now += dt;
    this.warmShadows();
    for (const s of this.pools) s?.flush(this.now);
  }
  warmShadows() {
    const W = this.shadowWarm;
    if (!W || this.S) return;
    const list = [this.scroll.roll, ...this.scroll.props, ...(this.phx ? [this.phx.root] : []), ...(this.loong ? [this.loong.root] : [])];
    if (W.phase === 0) {
      W.keep = list.map((o) => ({ o, vis: o.visible, pos: o.position.clone(), mau: o.matrixAutoUpdate }));
      W.mats = new Map();
      const p = this.camera.position.clone(); p.y -= 200;
      for (const o of list) {
        o.visible = true; o.position.copy(p); o.matrixAutoUpdate = true;
        o.traverse((m) => { if (m.isMesh) for (const mt of [].concat(m.material)) if (!W.mats.has(mt)) { W.mats.set(mt, [mt.colorWrite, mt.depthWrite]); mt.colorWrite = false; mt.depthWrite = false; } });
      }
      W.phase = 1; W.frame = this.renderer.info.render.frame;
      return;
    }
    if (this.renderer.info.render.frame <= W.frame) return;
    this.warmRestore();
  }
  warmRestore() {
    const W = this.shadowWarm;
    if (!W) return;
    if (W.phase === 1) {
      for (const k of W.keep) { k.o.visible = k.vis; k.o.position.copy(k.pos); k.o.matrixAutoUpdate = k.mau; }
      for (const [mt, [c, d]] of W.mats) { mt.colorWrite = c; mt.depthWrite = d; }
    }
    this.shadowWarm = null;
  }

  // ---------- 每帧（演出时间 S.t）----------
  tick(S, dt) {
    if (!this.ready) return;
    // 定格时余墨慢慢飘（粒子的时钟放慢到两成），其余都停
    this.now += this.frozen ? dt * 0.2 : dt;
    const t = S.t, cam = S.fin.camera, T = F.show;
    const lit = this.lit?.() ?? 1, litK = 0.35 + 0.65 * Math.max(lit, S.inkK ?? 0);
    const ending = smooth(T.exit[0], T.exit[1], t);
    // 墨痕（化墨移位）
    this.updateTrace(S, t, cam);
    // 画卷：绳结解开 → 由玩家脚下展开；之后留着（退场时随画中世界一起收）
    const sk = smooth(T.scroll.unroll[0], T.scroll.unroll[1], t);
    const knotK = t < T.scroll.knot[0] ? 0 : t < T.scroll.knot[1] ? (t - T.scroll.knot[0]) / (T.scroll.knot[1] - T.scroll.knot[0]) * 0.72 : 0.72 + 0.28 * smooth(T.scroll.knot[1], T.scroll.unroll[1] + 0.2, t);
    const knotOn = t >= T.scroll.knot[0] - 0.25 && t < T.walk[0] + 0.3 ? knotK : 1;
    const fadeIn = smooth(T.scroll.knot[0] - 0.3, T.scroll.knot[0], t);
    this.updateScroll(ease(sk), fadeIn * (1 - (S.exitFade ?? 0)), t, knotOn);
    if (this.scroll.knot?.visible) this.scroll.knot.material.opacity = 1;
    // 书法：逐笔写出、墨带包围之前淡去
    const cm = this.calli?.meta, CW = T.calli.write;
    if (cm) {
      // 四字按笔画数分配书写时间（每字之间留一点空）
      const tot = cm.chars.reduce((a, c) => a + c.strokes, 0), span = CW[1] - CW[0], gap = 0.06;
      let t0 = CW[0]; const P4 = [0, 0, 0, 0];
      cm.chars.forEach((c, k) => { const d = (span - gap * 3) * (c.strokes / tot); P4[k] = clamp01((t - t0) / d); t0 += d + gap; });
      this.scroll.U.uCP.value.set(...P4);
      this.scroll.U.uCA.value = 1 - smooth(T.calli.fade[0], T.calli.fade[1], t);
    }
    this.scroll.U.uPaint.value = 1 - 0.5 * smooth(T.crash[0], T.ribbons[0], t);
    // 拔刀穿行的刀光
    this.updateTrail(S, t, T.draw[0] + 0.04, T.draw[0] + 0.33, cam);
    // 龙凤：汇向敌人 → 撞入化墨 → 爆墨之后在玩家身后重新凝成
    this.updateBirds(S, t, dt, cam);
    // 八卦、墨带、墨流
    const B = T.bagua;
    this.updateBagua(S, t, dt, B.taiji, B.trigram, B.lines, litK, ending);
    this.updateFlows(S, t, cam);
    this.updateQuake(S, t, dt, cam);
    this.updateRibbons(S, t, T.ribbons[0], S.finishT, cam, litK);
    this.updateFinish(S, t, dt, cam);
    this.updateTitle(S, t, cam);
    for (const s of this.pools) s?.flush(this.now);
  }
  // 墨痕：玩家 → 绕过敌人的一侧 → 身后起点（一笔宽墨刷，头先走、尾随后收）
  updateTrace(S, t, cam) {
    const T = F.show, st = this.trace;
    if (t < T.trace[0] || t > T.reform[1] + 0.2 || S.plan.level === 'local') { st.hide(); return; }
    const a = S.P0.clone().setY(S.P0.y + 1.05), b = S.B.clone().setY(S.B.y + 1.05), E = this.center;
    const side = S.plan.left, ctrl = E.clone().addScaledVector(side, S.size.r + 1.9).setY(E.y + 1.7);
    for (let i = 0; i <= st.n; i++) { const u = i / st.n, iu = 1 - u; st.pts[i].set(iu * iu * a.x + 2 * iu * u * ctrl.x + u * u * b.x, iu * iu * a.y + 2 * iu * u * ctrl.y + u * u * b.y, iu * iu * a.z + 2 * iu * u * ctrl.z + u * u * b.z); st.w[i] = 0.12 + 0.34 * Math.sin(Math.PI * u); }
    st.build(cam);
    const U = st.U;
    U.uHead.value = smooth(T.trace[0], T.trace[1], t) * 1.02; U.uTail.value = smooth(T.trace[0] + 0.08, T.reform[1], t);
    U.uErode.value = 0.1 + 0.5 * smooth(T.trace[1], T.reform[1] + 0.15, t); U.uDryK.value = 0.6; U.uAlpha.value = 0.9; U.uColor.value.copy(C.ink); U.uColor2.value.copy(C.gray);
    st.mesh.visible = true;
  }
  // 拔刀穿行的刀光：剑尖走过的路（最近 0.14 秒）一线银白 + 一缕飞白
  updateTrail(S, t, t0, t1, cam) {
    const [lite, dry] = this.trail;
    if (t < t0 || t > t1 + 0.25) { lite.hide(); dry.hide(); this.trailPts.length = 0; return; }
    const ch = S.player.char, tip = new THREE.Vector3(), base = new THREE.Vector3();
    if (t <= t1 && ch.handSword?.visible) { ch.bladeEnds(tip, base); this.trailPts.push({ t, p: tip.clone() }); }
    while (this.trailPts.length && this.trailPts[0].t < t - 0.14) this.trailPts.shift();
    const pts = this.trailPts;
    if (pts.length < 2) { lite.hide(); dry.hide(); return; }
    for (const [st, w, col, a] of [[lite, 0.05, C.silver, 0.95], [dry, 0.16, C.paper, 0.55]]) {
      for (let i = 0; i <= st.n; i++) { const f = (i / st.n) * (pts.length - 1), j = Math.min(pts.length - 2, Math.floor(f)), u = f - j; st.pts[i].lerpVectors(pts[j].p, pts[j + 1].p, u); st.w[i] = w * Math.sin(Math.PI * Math.min(1, (i / st.n) * 1.1)); }
      st.build(cam);
      const U = st.U; U.uHead.value = 1; U.uTail.value = 0; U.uErode.value = st === dry ? 0.35 : 0.05; U.uDryK.value = st === dry ? 0.9 : 0; U.uAlpha.value = a * (1 - smooth(t1, t1 + 0.25, t)); U.uColor.value.copy(col); U.uColor2.value.copy(col);
      st.mesh.visible = true;
    }
  }
  // ---------- 龙凤 ----------
  // 机位坐标：右（画面右）、前（水平、离镜头更远）、上
  camFrame(c) { const f = c.at.clone().sub(c.pos).setY(0).normalize(), r = new THREE.Vector3().crossVectors(f, UP).normalize(); return { o: c.pos.clone(), f, r }; }
  planBirds(S) {
    const cams = S.cams, E = this.center, gy = this.ground(E.x, E.z, E.y + 0.5);
    const fr = this.camFrame(cams.front), at = (o) => fr.o.clone().addScaledVector(fr.r, o.side).addScaledVector(fr.f, o.back).setY(gy + o.up * (S.plan.large ? 1.25 : 1));
    const PB = F.birds.phoenix, DB = F.birds.dragon, chest = E.clone().setY(this.chestY);
    this.phxPath = { a: at(PB.from), c: at(PB.ctrl), b: chest.clone() };
    this.dgPath = { a: at(DB.from), c: at(DB.ctrl), b: chest.clone().setY(Math.max(gy + 0.6, this.chestY - 0.25)) };
    const cl = this.camFrame(cams.close), st = F.birds.still, atC = (o) => cl.o.clone().addScaledVector(cl.r, o.side).addScaledVector(cl.f, o.back).setY(gy + o.up);
    this.still = { phx: atC(st.phoenix), dg: atC(st.dragon), fr: cl };
  }
  updateBirds(S, t, dt, cam) {
    const T = F.show, Bc = T.birds, E = this.center;
    if (!this.birdsOn && t >= Math.min(Bc.phoenix[0], Bc.dragon[0]) - 0.05) {
      this.birdsOn = true;
      if (this.phx) {
        const half = this.phx.dims?.half || 1;
        this.phx.setScale((F.birds.phoenix.span / 2) / half);
        this.phx.root.visible = true; this.phx.inkU.uLit.value = 1;
        if (this.phx.root.parent !== this.scene) this.scene.add(this.phx.root);
      }
      if (this.loong) {
        const L = this.loong, p = this.dgPath, back = p.a.clone().sub(p.c).normalize();
        const pts = []; for (let i = 24; i >= 0; i--) pts.push(p.a.clone().addScaledVector(back, (i / 24) * (L.bodyLen + 3)).add(new THREE.Vector3(0, Math.sin(i * 0.5) * 0.6, 0)));
        L.trail.reset(pts);
        L.root.visible = true;
        if (L.root.parent !== this.scene) this.scene.add(L.root);
      }
    }
    if (!this.birdsOn) return;
    const bez = (p, u, out) => { const iu = 1 - u; return out.set(iu * iu * p.a.x + 2 * iu * u * p.c.x + u * u * p.b.x, iu * iu * p.a.y + 2 * iu * u * p.c.y + u * u * p.b.y, iu * iu * p.a.z + 2 * iu * u * p.c.z + u * u * p.b.z); };
    const reform = T.regather;
    // 凤凰：振翅（真实的扇动）、展翼滑翔、近了收翼俯冲；撞入后化墨；爆墨之后在玩家身后（画面左）由余墨重新凝成、展翼悬停
    if (this.phx) {
      const X = this.phx;
      if (t < reform[0]) {
        const [p0, p1] = Bc.phoenix, u = clamp01((t - p0) / (p1 - p0)), uu = u * u * (1.5 - 0.5 * u);
        const pos = bez(this.phxPath, Math.min(1, uu), new THREE.Vector3()), nxt = bez(this.phxPath, Math.min(1, uu + 0.02), new THREE.Vector3());
        const dir = nxt.sub(pos); if (dir.lengthSq() < 1e-6) dir.set(0, -0.2, 1); dir.normalize();
        const hit = t >= p1, dk = hit ? smooth(p1, p1 + 0.4, t) : 0;
        if (hit && !this.phxHit) { this.phxHit = true; this.quakeHit(S, 'phoenix'); this.splash(this.phxPath.b.clone(), 1.0 * this.k, { up: 0.5 }); for (let i = 0; i < this.n(5); i++) this.spr({ p: this.phxPath.b.clone().add(new THREE.Vector3(R(-0.4, 0.4), R(-0.3, 0.5), R(-0.4, 0.4))), v: new THREE.Vector3(R(-2, 2), R(0, 2), R(-2, 2)), tile: 'dot', mode: 1, size: [0.035, 0.02], stretch: 0.05, life: 0.5, gravity: 5, drag: 2, color: C.red, alpha: 0.85, fadeOut: 0.5 }); }
        if (t < p0 || dk >= 0.999) X.root.visible = false;
        else {
          X.root.visible = true;
          X.place(pos, dir, (u - 0.5) * 0.5);
          X.update(dt, { flap: F.birds.phoenix.flap, glide: u < 0.45 ? 0.35 + 0.35 * Math.sin(u * 9) : 0, fold: smooth(0.6, 0.88, u), attack: smooth(0.82, 0.96, u), turn: Math.sin(u * 3) * 0.35, dissolve: dk, glow: 0.2, recolor: 1 });
          X.inkU.uFade.value = smooth(p0, p0 + 0.3, t);
        }
      } else {
        const k = smooth(reform[0], reform[1] - 0.2, t), fz = this.frozen;
        const p = this.still.phx, look = this.still.fr.o.clone().addScaledVector(this.still.fr.r, -2.5).setY(p.y + 0.4);
        X.root.visible = true;
        X.place(p.clone().add(new THREE.Vector3(0, Math.sin(this.now * 1.6) * 0.08, 0)), look.sub(p).normalize(), 0.12);
        X.update(fz ? dt * 0.2 : dt, { flap: 0.45, glide: 0.85, fold: 0, attack: 0, turn: -0.25, dissolve: 1 - k, glow: 0.2, recolor: 1 });
        X.inkU.uFade.value = 1 - (S.exitFade ?? 0);
      }
    }
    // 龙：头沿弧线游向敌人，身子顺着头走过的路（连续的长身游动、头尾跟随）；撞入后由头向尾化墨；爆墨之后在玩家身后（画面右）盘身凝成
    if (this.loong) {
      const L = this.loong;
      if (t < reform[0]) {
        const [d0, d1] = Bc.dragon, u = clamp01((t - d0) / (d1 - d0));
        const head = bez(this.dgPath, Math.min(1, u), new THREE.Vector3());
        if (u >= 1) { const ov = (t - d1) * 7; const dir = this.dgPath.b.clone().sub(this.dgPath.c).setY(0).normalize(); head.copy(this.dgPath.b).addScaledVector(dir, ov * 0.15).add(new THREE.Vector3(0, -ov, 0)); }
        L.trail.push(head);
        const hit = t >= d1, dk = hit ? smooth(d1, d1 + 0.6, t) : 0;
        if (hit && !this.dgHit) { this.dgHit = true; this.quakeHit(S, 'dragon'); this.splash(this.dgPath.b.clone(), 1.2 * this.k, { up: 0.4 }); for (let i = 0; i < this.n(6); i++) this.light({ p: this.dgPath.b.clone().add(new THREE.Vector3(R(-0.5, 0.5), R(-0.4, 0.6), R(-0.5, 0.5))), tile: 'star', size: [0.15, 0.4], life: 0.25, alpha: 0.7, fadeOut: 0.6, rot: R(0, 6) }); }
        if (t < d0 || dk >= 0.999) L.root.visible = false;
        else { L.root.visible = true; L.pose(dt, { swim: F.birds.dragon.swim, jaw: smooth(0.7, 0.95, u), claw: smooth(0.75, 1, u), arc: 0.45, dissolve: dk, fade: smooth(d0, d0 + 0.3, t) }); L.inkU.uFade.value = smooth(d0, d0 + 0.3, t); }
      } else {
        if (!this.reformed) {
          this.reformed = true;
          // 盘身：尾在下后方，身子 S 形升起，头在上方、朝向画面中间（看着玩家这边）
          const fr = this.still.fr, h = this.still.dg, P = (side, back, up) => fr.o.clone().addScaledVector(fr.r, side).addScaledVector(fr.f, back).setY(h.y + up);
          const ctl = [P(5.6, 13.0, -2.4), P(3.6, 12.0, -1.6), P(5.4, 11.0, -0.6), P(3.4, 10.2, 0.2), P(4.8, 9.4, 0.9), P(3.1, 8.6, 1.3)];
          const curve = new THREE.CatmullRomCurve3(ctl, false, 'centripetal');
          const pts = curve.getSpacedPoints(60);
          // 身长不够时沿尾端的方向补长
          let len = 0; for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
          if (len < L.bodyLen + 2) { const d = pts[0].clone().sub(pts[1]).normalize(); const need = L.bodyLen + 2 - len; for (let i = 1; i <= 10; i++) pts.unshift(pts[0].clone().addScaledVector(d, need / 10)); }
          L.trail.reset(pts);
        }
        const k = smooth(reform[0] + 0.1, reform[1] - 0.1, t);
        L.root.visible = true;
        L.pose(this.frozen ? dt * 0.2 : dt, { swim: 0.35, jaw: 0.25, claw: 0.3, arc: 0.35, dissolve: 1 - k, fade: 1 - (S.exitFade ?? 0) }); L.inkU.uFade.value = 1 - (S.exitFade ?? 0);
      }
    }
  }
  // =====================================================================================
  // 第二十八轮：龙凤撞入的墨震——照雷龙撞地（DRAGON.quake）的层次，全部换成水墨（只是表现，不改结算与时间线）
  //   撞上的一刻：天上砸下的墨柱、贴地推开的一圈墨浪、放射的墨裂、墨浪推过处喷起的墨、贴地的墨雾、墨烟、崩起的碎墨；镜头往下一顿、震屏、四角压暗（由演出统一封顶）
  //   龙撞之前：脚下一团墨影由大收小、刺线收向落点；龙撞上之后：几次余震、敌人身上渗出往上爬的墨丝
  // =====================================================================================
  spr3(o) { if (!this.sp3 || !this.T3) return false; if (!o.color) o.color = C.ink; this.sp3.write(o, this.now, this.T3); this.stat.sprites++; return true; }
  cell3(name) { const t = this.T3?.[name]; return t ? cellRect(t, Math.floor(Math.random() * t.g[0] * t.g[1])) : null; }
  quakeHit(S, who) {
    if (!this.ready || this.quiet) return;
    const Qk = F.quake, dragon = who === 'dragon', s = dragon ? Qk.dragon : Qk.phoenix, kq = Math.min(this.k, Qk.kMax), k = kq * s;
    const E = this.center, gy = this.ground(E.x, E.z, E.y + 0.5), g = new THREE.Vector3(E.x, gy + 0.07, E.z), t = S.t;
    const cam = S.fin.camera; cam.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
    const Z = this.quake ||= { hits: [], pillars: [], cracks: [], after: null, seep: null };
    Z.hits.push({ who, t: +t.toFixed(3) });
    this.stat.quakes = (this.stat.quakes || 0) + 1;
    // 1. 落点：一团浓墨炸开（深墨核心）、一圈压暗的墨晕
    const core = this.seq('burstD', 1);
    if (core) this.spr2({ p: g.clone().setY(g.y + 0.7 * kq), rect: core.rect, grid: core.grid, span: 0.85, size: [0.6 * k, 2.4 * k], life: 0.45, color: C.deep, alpha: 0.8, fadeOut: 0.4, rot: R(0, 6.28) });
    this.spr({ p: g.clone().setY(g.y + 0.9 * kq), tile: 'glow', size: [1.2 * k, 5 * k], life: 0.25, color: C.deep, alpha: 0.35, fadeOut: 0.3 });
    // 2. 墨浪：一圈浓墨的圆环贴地推到 wave.r 米，后面跟一圈淡的、一圈笔刷圆环
    const wr = Qk.wave.r * k;
    this.spr({ p: g.clone(), tile: 'enso', mode: 3, size: [1.2 * k, 2 * wr], life: Qk.wave.life, color: C.deep, alpha: 0.8, fadeOut: 0.45, rot: R(0, 6.28) });
    this.spr({ p: g.clone().setY(g.y + 0.005), tile: 'inkRing', mode: 3, size: [0.8 * k, 1.45 * wr], life: Qk.wave.life * 0.8, color: C.ink, alpha: 0.6, fadeOut: 0.5, rot: R(0, 6.28), delay: 0.05 });
    if (this.T2?.ring) this.spr2({ p: g.clone().setY(g.y + 0.01), tile: 'ring', mode: 3, size: [0.6 * k, wr], life: Qk.wave.life * 0.65, color: C.gray, alpha: 0.55, fadeOut: 0.5, rot: R(0, 6.28), delay: 0.03 });
    // 3. 墨裂：落点一张贴地的裂纹墨迹（ink3；八卦在同一处展开，只留 cracks.decal 秒）；龙的另有几道由八卦外沿往外裂开的笔触（留得久）
    const cr = Qk.cracks.r * k, dl = Qk.cracks.decal;
    this.spr3({ p: g.clone().setY(g.y + 0.012), tile: 'crack', mode: 3, size: [1.7 * cr, 2 * cr], life: dl, color: C.deep, alpha: 0.85, fadeIn: 0.04, fadeOut: 0.35, erode: 0.3, rot: R(0, 6.28) });
    if (dragon) {
      this.spr3({ p: g.clone().setY(g.y + 0.014), tile: 'crack', mode: 3, size: [1.0 * cr, 1.15 * cr], life: dl * 0.9, color: C.ink, alpha: 0.7, fadeIn: 0.04, fadeOut: 0.35, erode: 0.35, rot: R(0, 6.28), delay: 0.04 });
      const r0 = this.rb * 0.92;
      this.crackS.forEach((st, i) => {
        const L = cr * R(0.5, 0.9);
        let a = (i / this.crackS.length) * Math.PI * 2 + R(-0.25, 0.25), x = E.x + Math.cos(a) * r0, z = E.z + Math.sin(a) * r0;
        for (let j = 0; j <= st.n; j++) {
          if (j) { a += R(-0.22, 0.22); x += Math.cos(a) * (L / st.n); z += Math.sin(a) * (L / st.n); }
          st.pts[j].set(x, this.ground(x, z, gy + 0.5) + 0.085, z);
          st.w[j] = (0.12 - 0.09 * (j / st.n)) * kq;
        }
        st.build(cam, UP);
        Z.cracks.push({ st, t0: t + R(0, 0.04), grow: R(0.1, 0.2) });
      });
      // 墨柱：天上同时砸下几道（头 0.07 秒落地，尾随后收进地里）
      this.pillarS.forEach((st, i) => {
        // 三道分开落（落点绕着敌人、错开 0.05 秒），上端略往外斜；落地处溅开
        const a = (i / this.pillarS.length) * Math.PI * 2 + R(-0.4, 0.4), off = R(0.5, 1.1) * kq;
        const bot = new THREE.Vector3(E.x + Math.cos(a) * off, gy + 0.1, E.z + Math.sin(a) * off);
        const top = new THREE.Vector3(bot.x + Math.cos(a) * R(0.6, 1.4) * kq, gy + Qk.pillars.top * kq + R(-0.6, 0.8), bot.z + Math.sin(a) * R(0.6, 1.4) * kq);
        Z.pillars.push({ st, top, bot, t0: t + i * 0.05, bend: new THREE.Vector3(R(-0.35, 0.35), 0, R(-0.35, 0.35)), landed: false });
      });
      Z.after = { t0: t, next: 0 };
      Z.seep = { t0: t, acc: 0 };
    }
    // 4. 墨浪推过之处喷起的墨（ink3 上喷的墨丝），离落点越远越晚
    const ng = this.n(Qk.geysers * s);
    for (let i = 0; i < ng; i++) {
      const a = (i / ng) * Math.PI * 2 + R(-0.3, 0.3), d = R(1.4, 3.8) * k, x = E.x + Math.cos(a) * d, z = E.z + Math.sin(a) * d, h = R(1.5, 2.4) * k;
      this.spr3({ p: new THREE.Vector3(x, this.ground(x, z, gy + 0.5) + h * 0.45, z), v: new THREE.Vector3(0, 0.8, 0), tile: 'splatF', mode: 2, u: right.clone(), w: UP.clone(),
        size: [h * 0.25, h], life: R(0.45, 0.6), drag: 2, color: i % 3 ? C.ink : C.deep, alpha: 0.85, fadeOut: 0.5, erode: 0.25, delay: 0.35 * (d / wr) * Qk.wave.life });
    }
    // 5. 贴地往外推的墨雾、落点上方扬起的墨烟
    const nd = this.n(Qk.dust * s);
    for (let i = 0; i < nd; i++) {
      const a = (i / nd) * Math.PI * 2 + R(-0.2, 0.2), d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      this.spr({ p: g.clone().addScaledVector(d, R(0.8, 1.6) * kq).setY(g.y + R(0.15, 0.4) * kq), v: d.clone().multiplyScalar(R(7, 11) * k).setY(R(0.1, 0.4)), tile: 'mist',
        size: [0.8 * k, 2.2 * k], life: R(0.55, 0.8), drag: 3, color: C.gray, alpha: 0.22, fadeOut: 0.35, rot: R(0, 6.28), spin: R(-1, 1) });
    }
    for (let i = 0; i < this.n(Qk.column * s); i++) this.spr({ p: g.clone().add(new THREE.Vector3(R(-0.5, 0.5) * kq, R(0.3, 0.9) * kq, R(-0.5, 0.5) * kq)), v: new THREE.Vector3(R(-0.6, 0.6), R(1.6, 3.2), R(-0.6, 0.6)),
      tile: 'mist', size: [0.9 * k, 2.2 * k], life: R(0.5, 0.7), drag: 2, color: C.gray, alpha: 0.18, fadeOut: 0.3, rot: R(0, 6.28), spin: R(-0.6, 0.6), delay: R(0, 0.06) });
    // 6. 崩起的碎墨、墨滴（ink3 的墨点、墨迹碎片、细点）
    for (let i = 0; i < this.n(Qk.debris * s); i++) {
      const v = new THREE.Vector3(R(-6.5, 6.5), R(4.5, 11.5), R(-6.5, 6.5)).multiplyScalar(Math.sqrt(k)), p = g.clone().add(new THREE.Vector3(R(-0.6, 0.6) * kq, 0.3, R(-0.6, 0.6) * kq));
      if (i % 3 === 0 && this.sp3) this.spr3({ p, v, rect: this.cell3('smudge'), size: R(0.28, 0.6) * Math.sqrt(k), life: R(0.8, 1.2), gravity: 18, drag: 0.5, color: C.deep, alpha: 0.95, fadeOut: 0.7, rot: R(0, 6.28), spin: R(-7, 7) });
      else if (i % 3 === 1) this.spr2({ p, v, rect: this.cell('daub') || this.cell('blot'), size: [R(0.25, 0.5), R(0.18, 0.35)], life: R(0.8, 1.2), gravity: 16, drag: 0.6, color: i % 2 ? C.ink : C.gray, alpha: 0.9, fadeOut: 0.6, rot: R(0, 6.28), spin: R(-6, 6) });
      else this.spr({ p, v, tile: 'dot', mode: 1, size: [R(0.05, 0.1), R(0.03, 0.05)], stretch: 0.05, life: R(0.6, 1.0), gravity: 16, drag: 0.8, color: C.deep, alpha: 0.95, fadeOut: 0.65 });
    }
    // 7. 几点白（撞击的劲）
    for (let i = 0; i < this.n(4 * s); i++) this.light({ p: g.clone().add(new THREE.Vector3(R(-0.6, 0.6) * kq, R(0.3, 1.4) * kq, R(-0.6, 0.6) * kq)), tile: 'star', size: [0.2, 0.7 * k], life: 0.18, alpha: 0.65, fadeOut: 0.5, rot: R(0, 6) });
    // 镜头往下一顿、震屏、四角压暗（由演出统一封顶，不叠加）
    S.impulse?.({ who, kick: Qk.kick * s, shake: Qk.shake * s, vig: Qk.vig * s });
  }
  // 每帧：龙撞之前的墨影与刺线；墨柱、墨裂的生长与淡去；余震；敌人身上渗出的墨丝
  updateQuake(S, t, dt, cam) {
    const Qk = F.quake, E = this.center, kq = Math.min(this.k, Qk.kMax), d1 = F.show.birds.dragon[1];
    if (!this.preDone && t >= d1 - Qk.pre.secs && t < d1 && !this.quiet) {
      this.preDone = true;
      const gy = this.ground(E.x, E.z, E.y + 0.5), left = d1 - t;
      this.spr({ p: new THREE.Vector3(E.x, gy + 0.075, E.z), tile: 'glow', mode: 3, size: [4.8 * kq, 1.4 * kq], life: left + 0.04, color: C.deep, alpha: 0.45, fadeIn: 0.75, fadeOut: 0.92 });
      for (let i = 0; i < this.n(Qk.pre.stabs); i++) {
        const a = (i / Qk.pre.stabs) * Math.PI * 2 + R(-0.2, 0.2), r0 = R(2.6, 3.6) * kq, inward = new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a));
        const p = new THREE.Vector3(E.x + Math.cos(a) * r0, gy + R(0.25, 1.4) * kq, E.z + Math.sin(a) * r0);
        this.spr3({ p, v: inward.clone().multiplyScalar((r0 / Math.max(0.15, left)) * 0.8), tile: 'stab', mode: 2, u: inward.clone(), w: new THREE.Vector3(0, 0.28, 0), size: [1.6 * kq, 0.7 * kq], life: left, color: C.gray, alpha: 0.5, fadeIn: 0.2, fadeOut: 0.8, delay: R(0, 0.05) });
      }
    }
    const Z = this.quake;
    if (!Z) return;
    // 墨柱：头由天上砸到地面（0.07 秒）、尾随后收进地里，边缘渐干
    for (const P of Z.pillars) {
      const a = t - P.t0, st = P.st;
      if (a < 0 || a > 0.36 || this.quiet) { st.hide(); continue; }
      for (let j = 0; j <= st.n; j++) { const u = j / st.n; st.pts[j].lerpVectors(P.top, P.bot, u).addScaledVector(P.bend, Math.sin(Math.PI * u)); st.w[j] = Qk.pillars.width * kq * (0.2 + 0.8 * u) * (0.85 + 0.15 * Math.sin(u * 11 + P.t0)); }
      st.build(cam);
      if (!P.landed && a >= 0.06) {
        P.landed = true;
        const b = this.seq('burst', 2);
        if (b) this.spr2({ p: P.bot.clone().setY(P.bot.y + 0.35 * kq), rect: b.rect, grid: b.grid, span: 0.85, size: [0.3 * kq, 1.5 * kq], life: 0.45, color: C.deep, alpha: 0.85, fadeOut: 0.45, rot: R(0, 6.28) });
        this.spr({ p: P.bot.clone().setY(P.bot.y - 0.02), tile: 'splat', mode: 3, size: [0.6 * kq, 1.6 * kq], life: Qk.splat, color: C.deep, alpha: 0.75, fadeOut: 0.3, erode: 0.3, rot: R(0, 6.28) });
      }
      const U = st.U; U.uHead.value = smooth(0, 0.06, a) * 1.02; U.uTail.value = smooth(0.08, 0.32, a); U.uErode.value = 0.15 + 0.6 * smooth(0.1, 0.32, a); U.uDryK.value = 0.85; U.uAlpha.value = 0.88;
      U.uColor.value.copy(C.deep); U.uColor2.value.copy(C.ink);
      st.mesh.visible = true;
    }
    // 墨裂：由落点裂开（0.1–0.2 秒）、留着、慢慢干裂淡去
    const life = Qk.cracks.life;
    for (const K of Z.cracks) {
      const a = t - K.t0, st = K.st;
      if (a < 0 || a > life || this.quiet) { st.hide(); continue; }
      const U = st.U; U.uHead.value = smooth(0, K.grow, a) * 1.02; U.uTail.value = 0; U.uErode.value = 0.05 + 0.55 * smooth(life * 0.45, life, a); U.uDryK.value = 0.3;
      U.uAlpha.value = 0.9 * (1 - smooth(life * 0.6, life, a)); U.uColor.value.copy(C.deep); U.uColor2.value.copy(C.ink);
      st.mesh.visible = true;
    }
    // 余震：八卦外沿之外再炸几小团墨（一下小震、四角略暗；声音由演出按同一时刻放）
    const Af = Qk.after;
    if (Z.after && !this.quiet) {
      while (Z.after.next < Af.at.length && t >= Z.after.t0 + Af.at[Z.after.next]) {
        const i = Z.after.next++, ang = R(0, 6.28), d = this.rb + (i % 2 === 0 ? R(Af.r[0], Af.r[0] + 0.6) : R(Af.r[0], Af.r[1])) * kq;
        const x = E.x + Math.cos(ang) * d, z = E.z + Math.sin(ang) * d, p = new THREE.Vector3(x, this.ground(x, z, E.y + 0.5) + 0.07, z);
        const b = this.seq('burst', 2);
        if (b) this.spr2({ p: p.clone().setY(p.y + 0.5 * kq), rect: b.rect, grid: b.grid, span: 0.85, size: [0.3 * kq, 1.6 * kq], life: 0.5, color: C.ink, alpha: 0.8, fadeOut: 0.5, rot: R(0, 6.28) });
        this.spr({ p: p.clone(), tile: 'inkRing', mode: 3, size: [0.4 * kq, 2.8 * kq], life: 0.5, color: C.ink, alpha: 0.6, fadeOut: 0.5, rot: R(0, 6.28) });
        this.spr3({ p: p.clone().setY(p.y + 0.01), tile: 'crack', mode: 3, size: [1.4 * kq, 1.8 * kq], life: 1.1, color: C.deep, alpha: 0.7, fadeIn: 0.05, fadeOut: 0.55, erode: 0.35, rot: R(0, 6.28) });
        for (let j = 0; j < this.n(4); j++) this.spr({ p: p.clone().setY(p.y + 0.2), v: new THREE.Vector3(R(-2.5, 2.5), R(2, 5), R(-2.5, 2.5)), tile: 'dot', mode: 1, size: [R(0.04, 0.08), 0.03], stretch: 0.05, life: R(0.4, 0.7), gravity: 14, drag: 1, color: C.deep, alpha: 0.95, fadeOut: 0.6 });
        this.spr({ p: p.clone().setY(p.y + 0.3), v: new THREE.Vector3(R(-0.6, 0.6), R(0.4, 1.0), R(-0.6, 0.6)), tile: 'mist', size: [0.6 * kq, 1.4 * kq], life: R(0.45, 0.6), drag: 2, color: C.gray, alpha: 0.18, fadeOut: 0.35, rot: R(0, 6.28) });
        Z.afterN = (Z.afterN || 0) + 1;
        S.impulse?.({ who: 'after', shake: Af.shake, vig: Af.vig });
      }
    }
    // 敌人身上渗出、往上爬的墨丝
    const Sp = Qk.seep;
    if (Z.seep && t - Z.seep.t0 < Sp.secs && !this.quiet) {
      Z.seep.acc += Sp.rate * dt * this.q;
      const gy = this.ground(E.x, E.z, E.y + 0.5), h = Math.max(1, this.topY - gy), rr = S.size.r * 0.95 + 0.05;
      while (Z.seep.acc >= 1) {
        Z.seep.acc -= 1; Z.seepN = (Z.seepN || 0) + 1;
        const a = R(0, 6.28), p = new THREE.Vector3(E.x + Math.cos(a) * rr, gy + R(0.1, 0.92) * h, E.z + Math.sin(a) * rr), c = this.cell('tendril');
        if (c) this.spr2({ p, v: new THREE.Vector3(Math.cos(a) * 0.2, R(0.4, 0.9), Math.sin(a) * 0.2), rect: c, size: [0.22 * kq, 0.6 * kq], life: R(0.4, 0.6), drag: 1.5, color: C.deep, alpha: 0.75, fadeOut: 0.5, rot: R(-0.4, 0.4) });
        else this.spr({ p, v: new THREE.Vector3(0, R(0.4, 0.9), 0), tile: 'smear', size: [0.2 * kq, 0.5 * kq], life: 0.5, color: C.deep, alpha: 0.7, fadeOut: 0.5 });
      }
    }
  }
  // 撞入后的墨流：由撞入处流下，在敌人脚下散成八卦（10.5–11.5）
  updateFlows(S, t, cam) {
    const T = F.show, [f0, f1] = T.crash, E = this.center, gy = this.ground(E.x, E.z, E.y + 0.5) + 0.05;
    this.flows.forEach((st, i) => {
      if (t < f0 + i * 0.06 || t > f1 + 0.35) { st.hide(); return; }
      const a0 = (i / this.flows.length) * Math.PI * 2 + 0.4, from = E.clone().setY(this.chestY), to = E.clone().add(new THREE.Vector3(Math.cos(a0) * this.rb * 0.95, 0, Math.sin(a0) * this.rb * 0.95)).setY(gy);
      const mid = E.clone().add(new THREE.Vector3(Math.cos(a0 - 0.6) * this.rb * 0.45, 0, Math.sin(a0 - 0.6) * this.rb * 0.45)).setY(gy + 0.15);
      for (let j = 0; j <= st.n; j++) { const u = j / st.n, iu = 1 - u; st.pts[j].set(iu * iu * from.x + 2 * iu * u * mid.x + u * u * to.x, iu * iu * from.y + 2 * iu * u * mid.y + u * u * to.y, iu * iu * from.z + 2 * iu * u * mid.z + u * u * to.z); st.w[j] = (0.1 + 0.16 * Math.sin(Math.PI * u)) * this.k; }
      st.build(cam);
      const U = st.U, k = smooth(f0 + i * 0.06, f0 + 0.45 + i * 0.06, t);
      U.uHead.value = k * 1.02; U.uTail.value = smooth(f0 + 0.5, f1 + 0.3, t); U.uErode.value = 0.12 + 0.4 * smooth(f1 - 0.2, f1 + 0.35, t); U.uDryK.value = 0.55; U.uAlpha.value = 0.85;
      U.uColor.value.copy(C.ink); U.uColor2.value.copy(C.gray);
      st.mesh.visible = true;
    });
  }
  // 八卦：阴阳鱼 → 八卦 → 墨线逐层显现、各自慢转（克制）；爆墨后随墨浪淡去
  updateBagua(S, t, dt, t0, t1, t2, litK, ending) {
    const U = this.bagua.U, m = this.bagua.mesh;
    if (t < t0) { m.visible = false; return; }
    m.visible = true;
    U.uK0.value = smooth(t0, t0 + 0.35, t); U.uK1.value = smooth(t1, t1 + 0.35, t); U.uK2.value = smooth(t2, t2 + 0.32, t);
    const sp = this.frozen ? 0.2 : 1;
    U.uA0.value += dt * 0.32 * sp; U.uA1.value -= dt * 0.14 * sp; U.uA2.value += dt * 0.07 * sp;
    U.uAlpha.value = (1 - smooth(S.finishT + 0.2, S.finishT + 1.2, t) * 0.8) * (1 - ending);
    U.uLit.value = litK; U.uGlint.value = smooth(t1, t1 + 0.4, t) * (1 - smooth(S.finishT, S.finishT + 0.3, t));
  }
  // 墨带：沿阵纹向上涌出、绕着敌人缠绕上升（腿 → 躯干 → 肩），粗细变化、飞白、碎开；带与带之间留空（看得见敌人的轮廓）；腰间留出刀光；终结时被切开
  updateRibbons(S, t, t0, t1, cam, litK) {
    if (this.quiet) { for (const st of this.ribs) st.hide(); return; }
    const E = this.center, r0 = S.size.r + 0.28 * this.k, top = this.topY, y0 = this.ground(E.x, E.z, E.y + 0.5) + 0.05, n = this.ribs.length;
    const on = t >= t0;
    this.ribs.forEach((st, i) => {
      if (!on || (this.cut && t > S.finishT + 0.8)) { st.hide(); return; }
      const ph = (i / n) * Math.PI * 2, spin = 1.1 + (i % 3) * 0.28, turns = F.budget.ribbons.turns * (0.85 + (i % 4) * 0.08);
      // 由腿到肩：各带的上沿随时间往上爬
      const climb = smooth(t0 + i * 0.05, t1 - 0.15, t), hTop = y0 + (top - y0) * (0.3 + 0.7 * climb) * (0.62 + 0.38 * ((i * 37) % 10) / 10);
      const W = F.budget.ribbons.width, wk = W[0] + (W[1] - W[0]) * (((i * 53) % 10) / 10);
      const cutU = this.cut ? smooth(S.finishT, S.finishT + 0.5, t) : 0;
      const sp = this.frozen ? 0.2 : 1;
      for (let j = 0; j <= st.n; j++) {
        const u = j / st.n, y = y0 + (hTop - y0) * u;
        const a = ph + u * turns * Math.PI * 2 + t * spin * sp, rr = r0 * (1.08 - 0.22 * u) * (1 + 0.08 * Math.sin(u * 9 + i));
        st.pts[j].set(E.x + Math.cos(a) * rr, y, E.z + Math.sin(a) * rr);
        if (cutU > 0 && y > this.waistY) { st.pts[j].y += cutU * 0.45; st.pts[j].x += Math.cos(a) * cutU * 0.8; st.pts[j].z += Math.sin(a) * cutU * 0.8; }
        st.w[j] = wk * this.k * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 0.6) * (0.65 + 0.35 * Math.sin(u * 13 + i * 2));
      }
      st.build(cam);
      const U = st.U;
      U.uHead.value = Math.min(1.02, 0.2 + climb * 0.85); U.uTail.value = this.cut ? smooth(S.finishT + 0.1, S.finishT + 0.8, t) * 0.7 : 0;
      U.uErode.value = 0.16 + 0.2 * (1 - climb) + cutU * 0.65; U.uDryK.value = 0.62; U.uAlpha.value = (i % 3 === 1 ? 0.72 : 0.9) * litK;
      U.uColor.value.copy(i % 3 === 0 ? C.ink : C.gray); U.uColor2.value.copy(i % 3 === 1 ? C.paper : C.gray.clone().lerp(C.paper, 0.45));
      U.uBandY.value = this.waistY; U.uBandW.value = 0.16 * this.k; U.uCutY.value = this.waistY; U.uCut.value = cutU;
      st.mesh.visible = true;
    });
  }
  // ---------- 收刀合拢：横向银白刀光（画面宽度的 102%）、切开墨带、爆墨（深墨核心收缩再爆开、墨浪、飞白、墨点、断带、山水碎片、几点朱红）----------
  finish(S, skip = false) {
    if (this.cut) return;
    this.cut = true; this.cutT = S.t;
    const E = this.center, k = Math.min(this.k, 1.5), w = E.clone().setY(this.waistY), cam = S.fin.camera;      // 爆墨按体型放大但封顶（大型目标不把整个画面染黑）
    cam.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).normalize(), fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const away = fwd.clone().setY(0).normalize(), side = right.clone().setY(0).normalize();
    // 刀光：贯穿切口，按距离、视角、画面宽高比求两端，正好铺满画面宽度的 102%
    const rel = w.clone().sub(cam.position), depth = Math.max(0.5, rel.dot(fwd)), xc = rel.dot(right);
    const asp = Number.isFinite(cam.aspect) && cam.aspect > 0 ? cam.aspect : 16 / 9;
    const tanH = Math.tan((cam.fov * Math.PI) / 360) * asp, half = depth * tanH;
    this.slash = { t0: S.t, c: w.clone(), right, s0: -1.02 * half - xc, s1: 1.02 * half - xc, depth, tanV: Math.tan((cam.fov * Math.PI) / 360), frac: ((1.02 * half - xc) - (-1.02 * half - xc)) / (2 * half) };
    if (skip) return;
    // 1. 深墨核心：先收缩（0.08 秒）再爆开
    this.spr({ p: w.clone(), tile: 'enso', mode: 0, size: [1.5 * k, 0.45 * k], life: 0.1, color: C.deep, alpha: 0.95, fadeOut: 0.8, rot: R(0, 6) });
    const core = this.seq('burstD', 1);
    if (core) this.spr2({ p: w.clone().addScaledVector(away, 0.4), rect: core.rect, grid: core.grid, span: 0.9, size: [0.5 * k, 2.7 * k], life: 0.8, color: C.deep, alpha: 0.82, fadeOut: 0.45, rot: R(0, 6.28), delay: 0.08 });
    const b2 = this.seq('burst', 2);
    if (b2) for (let i = 0; i < 2; i++) this.spr2({ p: w.clone().addScaledVector(away, 0.8).addScaledVector(side, i ? 0.7 : -0.7).add(new THREE.Vector3(0, R(-0.2, 0.5), 0)), rect: b2.rect, grid: b2.grid, span: 0.85, size: [0.6 * k, 2.2 * k], life: 0.8, color: C.ink, alpha: 0.7, fadeOut: 0.5, rot: R(0, 6.28), delay: 0.1 + i * 0.06 });
    // 2. 笔触墨浪：向两侧与斜后方推开（不朝镜头）
    const dirs = [side, side.clone().negate(), away.clone().add(side.clone().multiplyScalar(0.7)).normalize(), away.clone().add(side.clone().multiplyScalar(-0.7)).normalize(), away.clone()];
    dirs.forEach((d, i) => {
      for (let j = 0; j < (this.q < 0.75 ? 1 : 2); j++) {
        const s = this.seq('wisp', 0);
        if (s) this.spr2({ p: w.clone().addScaledVector(d, 0.5 * k).add(new THREE.Vector3(0, R(-0.3, 0.4), 0)), v: d.clone().multiplyScalar(R(4.5, 7.5) * k), rect: s.rect, grid: s.grid, span: 0.9, mode: 2, u: d.clone(), w: UP.clone(), size: [0.8 * k, 2.8 * k], life: 0.85, drag: 2.4, color: i < 2 ? C.ink : C.gray, alpha: 0.62, fadeOut: 0.5, delay: 0.1 + j * 0.05 });
      }
    });
    const gy = this.ground(E.x, E.z, E.y + 0.5) + 0.07;
    for (let i = 0; i < 2; i++) this.spr({ p: new THREE.Vector3(E.x, gy, E.z), tile: i ? 'inkRing' : 'enso', mode: 3, size: [0.6 * k, (5 + i * 2.4) * k], life: 0.8 + i * 0.25, color: i ? C.gray : C.ink, alpha: 0.7 - i * 0.2, fadeOut: 0.55, rot: R(0, 6.28), delay: 0.1 + i * 0.07 });
    // 3. 飞白、墨点（半球偏向镜头的反方向）
    const outward = () => { const v = new THREE.Vector3(R(-1, 1), R(-0.15, 0.9), R(-1, 1)); if (v.dot(away) < 0) v.addScaledVector(away, -2 * v.dot(away) * 0.85); return v.normalize(); };
    for (let i = 0; i < this.n(28); i++) this.spr2({ p: w.clone(), v: outward().multiplyScalar(R(5, 12) * Math.sqrt(k)), rect: this.cell('fine') || undefined, tile: this.T2 ? undefined : 'streak', mode: 1, stretch: 0.08, size: [R(0.18, 0.42), R(0.05, 0.1)], life: R(0.45, 0.85), drag: 2.2, gravity: 1.5, color: i % 4 ? C.paper : C.silver, alpha: 0.72, fadeOut: 0.5, delay: 0.1 });
    for (let i = 0; i < this.n(30); i++) this.spr({ p: w.clone(), v: outward().multiplyScalar(R(4, 10) * Math.sqrt(k)), tile: 'dot', mode: 1, size: [R(0.04, 0.09), R(0.03, 0.05)], stretch: 0.06, life: R(0.5, 0.9), gravity: 8, drag: 1.6, alpha: 0.95, fadeOut: 0.6, delay: 0.1 });
    // 4. 断带（墨带的碎片）、山水碎片
    for (let i = 0; i < this.n(10); i++) this.spr2({ p: w.clone().add(new THREE.Vector3(R(-0.6, 0.6), R(0, 0.9), R(-0.6, 0.6))), v: outward().multiplyScalar(R(2.5, 5.5)), rect: this.cell('daub') || this.cell('blot'), size: [R(0.35, 0.7), R(0.2, 0.5)], life: R(0.7, 1.1), drag: 1.4, gravity: 2.5, color: i % 2 ? C.ink : C.gray, alpha: 0.7, fadeOut: 0.5, rot: R(0, 6), spin: R(-4, 4), delay: 0.12 });
    for (let i = 0; i < this.n(this.q < 0.75 ? F.budget.shards.low : F.budget.shards.n); i++) {
      const a = R(-1.4, 1.4) + Math.atan2(away.z, away.x), rr = R(5, 14), p = new THREE.Vector3(E.x + Math.cos(a) * rr, E.y + R(1, 6), E.z + Math.sin(a) * rr);
      this.spr2({ p, v: new THREE.Vector3(Math.cos(a) * R(2, 5), R(-0.5, 1.5), Math.sin(a) * R(2, 5)), rect: this.cell('daub') || this.cell('blot'), size: [R(0.5, 1.1), R(0.3, 0.7)], life: R(0.8, 1.3), drag: 1.2, gravity: 2, color: i % 3 ? C.gray : C.ink, alpha: 0.55, fadeOut: 0.5, rot: R(0, 6), spin: R(-3, 3), delay: R(0.1, 0.3) });
    }
    // 5. 几点朱红（不成字、不成印）
    for (let i = 0; i < this.n(7); i++) this.spr({ p: w.clone().add(new THREE.Vector3(R(-0.3, 0.3), R(-0.2, 0.5), R(-0.3, 0.3))), v: outward().multiplyScalar(R(3, 7)), tile: 'dot', mode: 1, size: [R(0.035, 0.06), 0.03], stretch: 0.05, life: R(0.6, 1.0), gravity: 7, drag: 1.8, color: C.red, alpha: 0.9, fadeOut: 0.5, delay: 0.12 });
    // 6. 墨雾散开（定向在后）
    for (let i = 0; i < this.n(6); i++) this.spr({ p: w.clone().addScaledVector(away, R(0.3, 1.2)).add(new THREE.Vector3(R(-0.6, 0.6), R(-0.4, 0.8), R(-0.6, 0.6))), v: outward().multiplyScalar(R(0.6, 1.4)), tile: 'mist', size: [1.6 * k, 3.6 * k], life: R(1.1, 1.6), drag: 1.1, color: C.gray, alpha: 0.36, soft: true, fadeIn: 0.08, fadeOut: 0.5, rot: R(-1, 1), spin: R(-0.4, 0.4), delay: 0.1 });
    this.light({ p: w.clone(), tile: 'glow', size: [0.25, 1.1 * k], life: 0.22, alpha: 0.55, fadeOut: 0.7 });
  }
  updateFinish(S, t, dt, cam) {
    // 横向刀光：0.035 秒自切口划向两侧，0.18 秒内淡去；银白细芯 + 少量飞白 + 几道墨裂
    const sl = this.slash;
    for (const st of this.slashS) st.hide();
    if (!sl) return;
    const a = t - sl.t0, spread = smooth(0, 0.035, a), fade = 1 - smooth(0.1, 0.18, a);
    if (fade <= 0.001) return;
    const vh = 2 * sl.depth * sl.tanV;          // 切口处画面的高（米）
    const [core, white, c1, c2, c3, edge] = this.slashS, cracks = [c1, c2, c3];
    for (const [st, wk, col, al] of [[edge, 0.022, C.ink, 0.92], [white, 0.034, C.gray, 0.5], [core, 0.008, C.silver, 1]]) {
      for (let i = 0; i <= st.n; i++) { const u = i / st.n, s = sl.s0 + (sl.s1 - sl.s0) * (0.5 + (u - 0.5) * spread); st.pts[i].copy(sl.c).addScaledVector(sl.right, s); st.w[i] = vh * wk * (1 - Math.pow(Math.abs(u - 0.5) * 2, 3) * 0.6); }
      st.build(cam);
      const U = st.U; U.uHead.value = 1; U.uTail.value = 0; U.uErode.value = st === white ? 0.3 : 0.02; U.uDryK.value = st === white ? 0.85 : 0; U.uAlpha.value = al * fade; U.uColor.value.copy(col); U.uColor2.value.copy(st === edge ? C.deep : col);
      st.mesh.visible = true;
    }
    cracks.forEach((st, k) => {
      const s0 = sl.s0 + (sl.s1 - sl.s0) * (0.3 + k * 0.2), dir = sl.right.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, k % 2 ? 0.6 : -0.6, 0)).normalize();
      for (let i = 0; i <= st.n; i++) { const u = i / st.n; st.pts[i].copy(sl.c).addScaledVector(sl.right, s0).addScaledVector(dir, u * vh * 0.07); st.w[i] = vh * 0.004 * (1 - u); }
      st.build(cam);
      const U = st.U; U.uHead.value = spread; U.uTail.value = 0; U.uErode.value = 0.05; U.uDryK.value = 0; U.uAlpha.value = 0.75 * fade; U.uColor.value.copy(C.deep); U.uColor2.value.copy(C.ink);
      st.mesh.visible = true;
    });
    void dt;
  }
  // 定格的书法「终焉」：画面右上（脸与双手之外、凤与龙之间），逐笔写出；退场随画面一起收
  updateTitle(S, t, cam) {
    const T = F.show, m = this.title.mesh, U = this.title.U;
    const t0 = T.freeze[0] - 0.1, on = t >= t0;
    if (!on) { m.visible = false; return; }
    const p1 = clamp01((t - t0) / 0.3), p2 = clamp01((t - t0 - 0.3) / 0.3);
    U.uP.value.set(p1, p2);
    U.uA.value = 1 - (S.exitFade ?? 0);
    // 摆在镜头前 D 米处：画面坐标（NDC）x ∈ [0.1, 0.38]、y ∈ [-0.05, 0.8]
    cam.updateMatrixWorld();
    const D = 2.2, tv = Math.tan((cam.fov * Math.PI) / 360), th = tv * (Number.isFinite(cam.aspect) && cam.aspect > 0 ? cam.aspect : 16 / 9);
    const nx = 0.24, ny = 0.38, hh = 0.85 * tv * D;          // 两字高占画面高度的 42%
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    m.position.copy(cam.position).addScaledVector(fwd, D).addScaledVector(right, nx * th * D).addScaledVector(up, ny * tv * D);
    m.quaternion.copy(cam.quaternion);
    m.scale.set(hh * 0.5, hh * 0.5, 1);
    m.visible = U.uA.value > 0.01;
  }
  freeze(S, on) { this.frozen = on; }
  // 退场（没开后期叠化时）：残留的粒子、笔触带立刻收掉；画卷、八卦、书法、龙凤随退场进度淡出（见 tick）
  exitQuiet() {
    if (!this.ready) return;
    this.trace.hide(); for (const s of [...this.trail, ...this.ribs, ...this.flows, ...this.slashS, ...this.pillarS, ...this.crackS]) s.hide();
    for (const s of this.pools) s?.kill?.();
    this.quiet = true;
  }
  // ---------- 结束（完成、跳过、作废都走这里；可重复调用）：临时的东西收掉 ----------
  end(S, abort = false) {
    this.S = null;
    this.clear(abort);
  }
  clear() {
    if (!this.ready) return;
    this.trace.hide(); for (const s of [...this.trail, ...this.ribs, ...this.flows, ...this.slashS, ...this.pillarS, ...this.crackS]) s.hide();
    this.quake = null; this.preDone = false;
    this.scroll.mesh.visible = this.scroll.roll.visible = false; for (const p of this.scroll.props) p.visible = false;
    this.bagua.mesh.visible = false; this.title.mesh.visible = false;
    if (this.phx) this.phx.root.visible = false;
    if (this.loong) this.loong.root.visible = false;
    for (const s of this.pools) s?.kill?.();
    this.slash = null; this.cut = false; this.birdsOn = false; this.phxHit = false; this.dgHit = false; this.reformed = false; this.frozen = false; this.quiet = false; this.trailPts = [];
  }
  // 自检：此刻在画的东西
  census() {
    const vis = (o) => !!o?.visible;
    return { scroll: vis(this.scroll.mesh), roll: vis(this.scroll.roll), knot: vis(this.scroll.knot), roller: vis(this.scroll.roller), calli: +(this.scroll.U.uCA.value).toFixed(2), calliP: this.scroll.U.uCP.value.toArray().map((v) => +v.toFixed(2)),
      bagua: vis(this.bagua.mesh), ribbons: this.ribs.filter((s) => s.mesh.visible).length, flows: this.flows.filter((s) => s.mesh.visible).length,
      trace: vis(this.trace.mesh), slash: this.slashS.some((s) => s.mesh.visible), slashFrac: this.slash ? +this.slash.frac.toFixed(3) : null, title: vis(this.title.mesh), phoenix: vis(this.phx?.root), dragon: vis(this.loong?.root),
      sprites: this.pools.reduce((n, s) => n + (s?.alive(this.now) || 0), 0), paper: this.post?.paper ?? null, stage: this.stage?.census?.() ?? null,
      quake: { hits: this.quake?.hits?.map((h) => `${h.who}@${h.t}`) ?? [], pillars: this.pillarS.filter((s) => s.mesh.visible).length, cracks: this.crackS.filter((s) => s.mesh.visible).length,
        after: this.quake?.afterN || 0, seep: this.quake?.seepN || 0, ink3: this.sp3?.alive(this.now) || 0 } };
  }
}
