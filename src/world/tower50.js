// 第十六轮：通天塔第五十层 · 镇龙封印殿（独立场景，同塔内一层，第一次进入时搭建）。
// 塔内每一层是单独的一处天地（守塔执事语），所以殿内比塔身外观大：
//   · 中央战斗圈：半径 25 米（直径 50 米）的圆形青石地，刻着封印大阵（八卦、内外环、符文带、正中龙印），阵纹随战斗亮起；
//     圈沿一道符线即场地边界——开战后升起半透明的封印光墙，玩家与镇塔龙君都出不了圈；
//   · 外圈（25–33 米）：十二根巨柱（直径 2.6 米，没入高处的云雾；三根已断，断口与碎石堆在柱脚）、倾倒的残破石台与碎石——
//     全在战斗圈之外，不挡出招的前摇和镜头；
//   · 北面封印台（圈外，台高 2.2 米）：镇塔龙君跪伏在台上沉睡，四条锁链牵向两侧的柱子；出场时它从台上跃下，落在圈内；
//   · 南面入口：拱门，玩家从这里进殿；开战时门上的封印亮起合拢，打完才散；
//   · 四面高墙（半径 35 米、高 24 米）以上全是云雾，殿顶看不见。
// 本地原点：战斗圈圆心、地面；+Z 为南（入口），-Z 为北（封印台）。
import * as THREE from 'three';
import { Builder, C, makeMaterials } from './arch/builder.js';
import { CollisionWorld } from '../core/collision.js';
import { ASSETS } from './assets.js';

export const T50 = {
  R: 25,                                       // 战斗圈半径
  pillarR: 29.5, pillars: 12,
  wall: 35, wallH: 24,
  entry: { x: 0, z: 31.5, yaw: Math.PI },      // 进殿处（南门内），面朝北
  start: { x: 0, z: 19, yaw: Math.PI },        // 开战时玩家站位（圈内南侧）
  dais: { x: 0, z: -29.6, y: 2.2, r: 5.2 },    // 封印台
  perch: { x: 0, z: -29.2, yaw: 0 },           // 龙君在台上沉睡的位置，面朝南
  land: { x: 0, z: -14, yaw: 0 },              // 跃下封印台后的落点
  respawn: { x: 0, z: 19, yaw: Math.PI },      // 重试的复位点
  gate: { x: 0, z: 35, w: 7, h: 10 },
};
const TAU = Math.PI * 2;
// 固定种子的随机数（每次搭建碎石、断柱的样子都一样）
const rng = (s = 1) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

// 云团（画布）：白色、边缘柔和、带几层噪声的团块，作云雾精灵的贴图
function puffTexture() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), R = rng(29);
  for (let i = 0; i < 26; i++) {
    const a = R() * TAU, r = R() * S * 0.22, x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r * 0.7, rad = S * (0.12 + R() * 0.16);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- 封印大阵纹样（画布）：R 刻线、G 发光符文、B 二阶段的裂纹 ----------
// 画布上方为北（-Z）、右为东（+X），自南门进殿面朝北时「镇」字是正的
function sealTexture() {
  const S = 2048, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const c = S / 2, M = 66, k = S / M, R = (m) => m * k;        // 画布覆盖 66 米见方（外圈到 33 米）
  const ring = (r, w, col) => { g.strokeStyle = col; g.lineWidth = R(w); g.beginPath(); g.arc(c, c, R(r), 0, TAU); g.stroke(); };
  // 刻线（R）与发光（G）分两遍画：发光只取一部分线
  const draw = (chan) => {
    const col = chan === 'R' ? '#ff0000' : '#00ff00';
    g.globalCompositeOperation = 'lighter';
    // 圈沿：场地边界（双线）
    ring(25, 0.32, col); ring(24.35, 0.1, col);
    if (chan === 'R') { ring(23.2, 0.12, col); ring(16.5, 0.18, col); ring(15.8, 0.08, col); ring(9.2, 0.14, col); ring(3.4, 0.18, col); }
    else { ring(16.5, 0.12, col); ring(3.4, 0.12, col); }
    // 八卦（自正北顺时针），符文带
    const TRI = ['111', '011', '101', '001', '110', '010', '100', '000'];
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 4;
      g.save(); g.translate(c + Math.cos(a) * R(20), c + Math.sin(a) * R(20)); g.rotate(a + Math.PI / 2);
      g.fillStyle = col;
      TRI[i].split('').forEach((bit, j) => {
        const y = (j - 1) * R(0.9), w = R(4.2), h = R(0.42);
        if (bit === '1') g.fillRect(-w / 2, y - h / 2, w, h);
        else { g.fillRect(-w / 2, y - h / 2, w * 0.42, h); g.fillRect(w * 0.08, y - h / 2, w * 0.42, h); }
      });
      g.restore();
      // 八道放射符线（圈心 → 符文带）
      g.save(); g.translate(c, c); g.rotate(a + Math.PI / 8);
      g.fillStyle = col; g.fillRect(R(3.6), -R(0.06), R(12.6), R(0.12));
      g.restore();
    }
    // 符文带：两环之间一圈镇龙符字（楷体，字头朝圈心外）
    g.save(); g.translate(c, c);
    const CH = '乾兑离震巽坎艮坤镇封禁伏锁龙天罡地煞雷霆风火山泽日月星辰阴阳五行敕令';
    const N = 64;
    g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${Math.round(R(1.05))}px "KaiTi","STKaiti","Kaiti SC",serif`;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      g.save(); g.rotate(a); g.translate(0, -R(12.6));
      g.fillText(CH[(i * 7) % CH.length], 0, 0);
      g.restore();
    }
    g.restore();
    // 正中龙印：圆中一道盘龙似的螺旋与「镇」字
    if (chan === 'R' || chan === 'G') {
      g.save(); g.translate(c, c);
      g.strokeStyle = col; g.lineWidth = R(0.16);
      g.beginPath();
      for (let t = 0; t < 1; t += 0.004) { const a = t * TAU * 2.25, r = R(0.6 + t * 2.4); const x = Math.cos(a) * r, y = Math.sin(a) * r; if (t === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
      g.fillStyle = col; g.font = `${Math.round(R(2.2))}px "KaiTi","STKaiti","Kaiti SC",serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('镇', 0, R(0.05));
      g.restore();
    }
    g.globalCompositeOperation = 'source-over';
  };
  draw('R'); draw('G');
  // 裂纹（B）：自圈心向外的分叉裂缝（二阶段沿这些裂缝透出紫焰）
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = '#0000ff';
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const crack = (x, y, a, len, w, depth) => {
    let px = x, py = y;
    for (let i = 0; i < len; i++) {
      a += (rnd() - 0.5) * 0.7;
      const nx = px + Math.cos(a) * R(0.9), ny = py + Math.sin(a) * R(0.9);
      g.lineWidth = Math.max(1, w * (1 - i / len)); g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
      px = nx; py = ny;
      if (depth < 2 && rnd() < 0.12) crack(px, py, a + (rnd() < 0.5 ? 0.9 : -0.9), Math.floor(len * 0.5), w * 0.6, depth + 1);
    }
  };
  for (let i = 0; i < 11; i++) { const a = (i / 11) * TAU + rnd() * 0.4; crack(c + Math.cos(a) * R(3.6), c + Math.sin(a) * R(3.6), a, 22 + Math.floor(rnd() * 8), R(0.22), 0); }
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; t.generateMipmaps = true;
  return t;
}

export class Tower50Hall {
  constructor(renderer, { quality = 'mid', shadow = 2048 } = {}) {
    this.renderer = renderer; this.quality = quality; this.shadowSize = shadow;
    this.ready = false;
    this.cw = new CollisionWorld(8);
    this.bounds = { x0: -T50.wall - 4, x1: T50.wall + 4, z0: -T50.wall - 4, z1: T50.wall + 10 };
    this.exposure = 1.12;
    this.U = {
      uGlow: { value: 0.35 }, uGlowCol: { value: new THREE.Color(0x7c68e8) }, uCrack: { value: 0 }, uCrackCol: { value: new THREE.Color(0xb65cff) },
      uTime: { value: 0 }, uFlash: { value: 0 },
      uReveal: { value: -1 }, uRevC: { value: new THREE.Vector2() },     // 出场时封印纹自玩家脚下向外亮开（-1：全亮）
    };
    this.barrierOn = 0; this.barrierT = 0;
  }

  async ensure() {
    if (this.ready) return this;
    this.build();
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 400);
    cam.position.set(0, 3, 30); cam.lookAt(0, 3, 0);
    try { await this.renderer.compileAsync?.(this.scene, cam); } catch (e) { /* 第一帧再编译 */ }
    this.ready = true;
    return this;
  }

  build() {
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0b14);
    scene.fog = null;
    this.mats = makeMaterials(null);
    const b = new Builder();
    const P = T50, DARK = 0x3a3b42, STONE = 0x6c6a66, GOLD = 0xb88a46;
    // ---------- 地面：圆形条石地（贴图），刻着封印大阵（画布：刻线压暗、符线发光、二阶段裂纹透光）----------
    const floorGeo = new THREE.CircleGeometry(P.wall + 0.4, 96);
    const tx = ASSETS.tex;
    const dmap = tx.paving_d ? tx.paving_d.clone() : null, nmap = tx.paving_n ? tx.paving_n.clone() : null;
    for (const t of [dmap, nmap]) if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(24, 24); t.needsUpdate = true; }
    const seal = this.sealTex = sealTexture();
    const fm = new THREE.MeshStandardMaterial({ color: 0x8a8790, map: dmap, normalMap: nmap, roughness: 0.86, metalness: 0.0 });
    fm.normalScale.set(0.8, 0.8);
    const U = this.U;
    fm.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uSeal: { value: seal }, uGlow: U.uGlow, uGlowCol: U.uGlowCol, uCrack: U.uCrack, uCrackCol: U.uCrackCol, uTime: U.uTime, uFlash: U.uFlash, uReveal: U.uReveal, uRevC: U.uRevC });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSeal; varying vec2 vWXZ;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvSeal = position.xy / 66.0 + 0.5; vWXZ = vec2(position.x, -position.y);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vSeal; varying vec2 vWXZ; uniform sampler2D uSeal; uniform float uGlow, uCrack, uTime, uFlash, uReveal; uniform vec2 uRevC; uniform vec3 uGlowCol, uCrackCol;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec3 sealM = texture2D(uSeal, vSeal).rgb;
          float rr = length(vSeal - 0.5) * 66.0;
          diffuseColor.rgb *= 1.0 - sealM.r * 0.55;                     // 刻线：凹下去的暗线
          diffuseColor.rgb *= mix(1.0, 0.78, smoothstep(25.2, 25.8, rr));     // 圈外地面略暗`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            float pulse = 0.82 + 0.18 * sin(uTime * 1.7 - rr * 0.35);
            float rv = uReveal < 0. ? 1. : 1. - smoothstep(uReveal - 4., uReveal, distance(vWXZ, uRevC));
            float edge = uReveal < 0. ? 0. : (1. - smoothstep(0., 2.5, abs(distance(vWXZ, uRevC) - uReveal + 1.5))) * 2.;
            totalEmissiveRadiance += uGlowCol * sealM.g * (uGlow * rv * pulse * 1.6 + edge);
            float cr = sealM.b * uCrack * smoothstep(uCrack * 26.0, uCrack * 26.0 - 6.0, rr);
            totalEmissiveRadiance += uCrackCol * cr * (0.75 + 0.3 * sin(uTime * 3.0 + rr * 0.6));
            totalEmissiveRadiance += uGlowCol * sealM.g * uFlash * 3.0;
          }`);
    };
    const floor = new THREE.Mesh(floorGeo, fm);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.name = 't50-floor';
    scene.add(floor);
    // ---------- 圈沿：一圈矮石沿（不挡人，只是地面上的一道棱）与 24 个铜钉 ----------
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU, x = Math.cos(a) * (P.R + 0.35), z = Math.sin(a) * (P.R + 0.35);
      b.cyl(0.22, 0.28, 0.12, C.bronze, x, 0.06, z, { seg: 10, mat: 'bronze', col: false });
    }
    // ---------- 十二根巨柱（三根已断）----------
    // 自 15° 起每 30° 一根：南门两侧（75°、105°）与封印台两侧（255°、285°）都留出通道
    this.pillarPos = [];
    const broken = new Set([2, 7, 10]), R = rng(11);
    for (let k = 0; k < P.pillars; k++) {
      const a = (k / P.pillars) * TAU + TAU / 24, x = Math.cos(a) * P.pillarR, z = Math.sin(a) * P.pillarR;
      this.pillarPos.push([x, z]);
      const H = broken.has(k) ? 7 + (k % 3) * 2.6 : 44;
      b.slab(3.6, 1.1, 3.6, DARK, x, 0, z, { mat: 'stone', ry: -a });                 // 柱础
      b.slab(3.0, 0.5, 3.0, STONE, x, 1.1, z, { mat: 'stoneSmooth', col: false, ry: -a });
      b.cyl(1.3, 1.36, H, 0x55545a, x, 1.6 + H / 2, z, { seg: 20, mat: 'stone', col: false });
      for (let i = 0; i < (broken.has(k) ? 1 : 5); i++) b.cyl(1.42, 1.42, 0.42, GOLD, x, 4.2 + i * 6.5, z, { seg: 20, mat: 'gold', col: false });   // 箍金
      // 符纸：柱身朝圈心的一面贴三道黄符
      const nx = -Math.cos(a), nz = -Math.sin(a), ry = Math.atan2(nx, nz);
      for (let i = 0; i < (broken.has(k) ? 1 : 3); i++) b.box(0.42, 1.3, 0.02, 0xc9a24e, x + nx * 1.33 + Math.cos(a + Math.PI / 2) * (i - 1) * 0.55, 2.6 + (i % 2) * 0.3, z + nz * 1.33 + Math.sin(a + Math.PI / 2) * (i - 1) * 0.55, { ry, mat: 'cloth', col: false });
      if (broken.has(k)) {
        // 断口：几块斜插的碎块，柱脚碎石
        for (let i = 0; i < 5; i++) {
          const ox = (R() - 0.5) * 1.6, oz = (R() - 0.5) * 1.6;
          b.box(0.6 + R() * 0.7, 0.5 + R() * 0.9, 0.6 + R() * 0.6, 0x5a595e, x + ox, 1.6 + H + 0.2, z + oz, { rx: R() - 0.5, ry: R() * 3, rz: R() - 0.5, mat: 'stone', col: false });
        }
        // 柱脚碎石：都在 27 米以外（圈沿外两米），大块的挡人（可以踩上去）
        for (let i = 0; i < 9; i++) {
          const ang = a + (R() - 0.5) * 0.5, rr = Math.max(27.2, P.pillarR + (R() - 0.5) * 4);
          const w = 0.5 + R() * 1.1, h = 0.35 + R() * 0.6, d = 0.5 + R() * 1.0, ry = R() * 3, cx = Math.cos(ang) * rr, cz = Math.sin(ang) * rr;
          b.box(w, h, d, 0x58575c, cx, h / 2 - 0.05, cz, { ry, rx: (R() - 0.5) * 0.3, mat: 'stone', col: false });
          if (w > 0.9) b.collider(cx, 0, h - 0.1, cz, w / 2, d / 2, ry);
        }
      }
      b.cylCollider(x, 0, 60, z, 1.45);
      b.collider(x, 0, 1.6, z, 1.8, 1.8, -a);
    }
    // ---------- 外圈：倾倒的残破石台、碎石（都在 26.5 米以外）----------
    const slabs = [[0.55, 27.8, 0.18], [1.95, 27.4, -0.22], [2.55, 28.0, 0.12], [3.65, 27.5, -0.16], [4.2, 27.9, 0.2], [5.2, 27.4, -0.12]];
    this.slabPos = [];
    for (const [a, r, tilt] of slabs) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      this.slabPos.push([x, z]);
      b.push(x, 0, z, Math.PI / 2 - a);                               // 石台长边顺着圈沿
      b.slab(3.4, 0.7, 2.2, 0x6a6966, 0, -0.15, 0, { rz: tilt, rx: tilt * 0.5, mat: 'stoneSmooth', col: false });
      b.slab(1.6, 0.6, 1.4, 0x5d5c60, 1.2, 0.45, 0.4, { rz: -tilt * 1.6, ry: 0.4, mat: 'stone', col: false });
      b.collider(0, 0, 0.55, 0, 1.75, 1.15);
      b.pop();
    }
    // ---------- 北面封印台（龙君沉睡处）：八角台、台面封印、四角镇柱与锁链 ----------
    {
      const D = P.dais;
      b.push(D.x, 0, D.z, 0);
      b.cyl(D.r, D.r + 0.4, D.y, 0x47474e, 0, D.y / 2, 0, { seg: 8, mat: 'stone' });
      b.cyl(D.r + 0.25, D.r + 0.25, 0.25, GOLD, 0, D.y - 0.1, 0, { seg: 8, mat: 'gold', col: false });
      for (let i = 0; i < 4; i++) {
        const a = TAU / 8 + (i * TAU) / 4, x = Math.cos(a) * (D.r - 0.6), z = Math.sin(a) * (D.r - 0.6);
        b.cyl(0.32, 0.38, 3.2, 0x3a3a40, x, D.y + 1.6, z, { seg: 8, mat: 'stone', col: false });
        b.cyl(0.42, 0.42, 0.3, GOLD, x, D.y + 3.25, z, { seg: 8, mat: 'gold', col: false });
      }
      b.pop();
      // 台阶（南沿一段，让玩家看得出台的高度；战斗中用不上）
      b.slab(5, D.y * 0.33, 1.4, 0x4f4e55, D.x, 0, D.z + D.r + 0.55, { mat: 'stone' });
      b.slab(5, D.y * 0.66, 1.0, 0x4f4e55, D.x, 0, D.z + D.r - 0.1, { mat: 'stone', col: false });
      b.cylCollider(D.x, 0, D.y, D.z, D.r + 0.2);
    }
    // ---------- 高墙：二十四边形、壁柱、檐线；南面拱门 ----------
    // 二十四边形，第 6 段正对南方（段心在 90°），即南门所在
    const NW = 24, off = -TAU / (2 * NW), GATE_SEG = NW / 4;
    for (let i = 0; i < NW; i++) {
      const a0 = (i / NW) * TAU + off, a1 = ((i + 1) / NW) * TAU + off, am = (a0 + a1) / 2;
      const x0 = Math.cos(a0) * P.wall, z0 = Math.sin(a0) * P.wall, x1 = Math.cos(a1) * P.wall, z1 = Math.sin(a1) * P.wall;
      const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
      const cx = (x0 + x1) / 2 + Math.cos(am) * 0.8, cz = (z0 + z1) / 2 + Math.sin(am) * 0.8;       // 墙心（墙内皮落在弦上）
      const tx = Math.cos(ry), tz = -Math.sin(ry);                                                  // 沿墙方向
      if (i === GATE_SEG) {
        const side = (L - P.gate.w) / 2, o = P.gate.w / 2 + side / 2;
        for (const s of [-1, 1]) b.box(side + 0.05, P.wallH, 1.6, 0x45454c, cx + s * o * tx, P.wallH / 2, cz + s * o * tz, { ry, mat: 'stone' });
        b.box(P.gate.w, P.wallH - P.gate.h, 1.6, 0x45454c, cx, P.gate.h + (P.wallH - P.gate.h) / 2, cz, { ry, mat: 'stone', col: false });
        b.box(P.gate.w + 1.2, 0.8, 2.0, GOLD, cx, P.gate.h + 0.4, cz, { ry, mat: 'gold', col: false });
        for (const s of [-1, 1]) b.box(0.7, P.gate.h, 2.0, 0x34343a, cx + s * (P.gate.w / 2 + 0.35) * tx, P.gate.h / 2, cz + s * (P.gate.w / 2 + 0.35) * tz, { ry, mat: 'stone', col: false });   // 门框
      } else {
        b.box(L + 0.05, P.wallH, 1.6, 0x45454c, cx, P.wallH / 2, cz, { ry, mat: 'stone', col: false });
        b.collider(cx, 0, 60, cz, L / 2 + 0.4, 0.9, ry);
      }
      // 壁柱（在多边形的角上）、两道檐线（门所在的一段只留上面一道）
      b.box(1.6, P.wallH, 1.0, 0x3c3c43, x0 - Math.cos(a0) * 0.3, P.wallH / 2, z0 - Math.sin(a0) * 0.3, { ry: -a0, mat: 'stone', col: false });
      for (const y of i === GATE_SEG ? [P.wallH - 0.6] : [6.5, P.wallH - 0.6]) b.box(L + 0.3, 0.7, 0.6, 0x34343a, cx - Math.cos(am) * 0.95, y, cz - Math.sin(am) * 0.95, { ry, mat: 'stone', col: false });
    }
    // 南门外：门洞后一段幽暗的甬道（看得出是从塔里走进来的）
    b.slab(P.gate.w, 0.2, 6, 0x3a3940, 0, -0.2, P.wall + 3, { mat: 'stone', col: false });
    b.box(P.gate.w + 2, P.gate.h + 1, 0.5, 0x101014, 0, (P.gate.h + 1) / 2, P.wall + 6, { mat: 'stone', col: false });
    for (const s of [-1, 1]) b.box(0.5, P.gate.h + 1, 6, 0x2a2a30, s * (P.gate.w / 2 + 0.25), (P.gate.h + 1) / 2, P.wall + 3, { mat: 'stone' });
    b.collider(0, 0, 20, P.wall + 6.2, P.gate.w / 2 + 1, 0.4);
    const g = b.build({ shadows: true, name: 'tower50', mats: this.mats });
    scene.add(g);
    this.cw.addLocal(b.cols, 0, 0, 0, 0);
    // ---------- 锁链：封印台四角镇柱 → 两侧柱子（细链环串）----------
    this.chains = new THREE.Group();
    const linkGeo = new THREE.TorusGeometry(0.16, 0.045, 6, 12), linkMat = new THREE.MeshStandardMaterial({ color: 0x5a5560, metalness: 0.9, roughness: 0.45 });
    const D = P.dais, posts = [];
    for (let i = 0; i < 4; i++) { const a = TAU / 8 + (i * TAU) / 4; posts.push(new THREE.Vector3(D.x + Math.cos(a) * (D.r - 0.6), D.y + 3.0, D.z + Math.sin(a) * (D.r - 0.6))); }
    const anchors = this.pillarPos.filter(([x, z]) => z < -12).sort((a, b2) => a[0] - b2[0]);
    const pairs = anchors.length >= 2 ? [[posts[1], anchors[0]], [posts[2], anchors[0]], [posts[0], anchors[anchors.length - 1]], [posts[3], anchors[anchors.length - 1]]] : [];
    let nLinks = 0;
    const links = [];
    for (const [p0, [ax, az]] of pairs) {
      const p1 = new THREE.Vector3(ax - Math.sign(ax) * 1.4, 9, az);
      const n = Math.round(p0.distanceTo(p1) / 0.27);
      for (let i = 0; i <= n; i++) {
        const t = i / n, p = p0.clone().lerp(p1, t); p.y -= Math.sin(t * Math.PI) * 1.6;
        links.push({ p, dir: p1.clone().sub(p0).normalize(), i });
      }
    }
    const inst = new THREE.InstancedMesh(linkGeo, linkMat, links.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    for (const L of links) {
      q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), L.dir);
      if (L.i % 2) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
      m4.compose(L.p, q, sc); inst.setMatrixAt(nLinks++, m4);
    }
    inst.castShadow = true; this.chains.add(inst); scene.add(this.chains);
    this.chainPts = links.filter((L, i) => i % 6 === 0).map((L) => L.p.clone());
    this.chainPosts = posts;
    // ---------- 封印光墙（圈沿，开战后升起）与南门封印 ----------
    const barMat = new THREE.ShaderMaterial({
      uniforms: { uOn: { value: 0 }, uTime: U.uTime, uCol: { value: new THREE.Color(0x9a7cff) }, uNear: { value: 0 }, uNearA: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uOn, uTime, uNear, uNearA; uniform vec3 uCol; varying vec2 vUv; varying vec3 vW;
        void main(){
          float h = vUv.y;
          float a = atan(vW.z, vW.x);
          float band = smoothstep(0.0, 0.06, h) * smoothstep(1.0, 0.4, h);
          float runes = 0.5 + 0.5 * sin(a * 96.0 + h * 12.0 - uTime * 2.0) * sin(a * 31.0 - uTime * 1.3);
          float near = exp(-pow(mod(a - uNearA + 3.14159, 6.28318) - 3.14159, 2.0) * 60.0) * uNear;   // 玩家靠近的一段更亮
          float al = band * (0.10 + 0.10 * runes + near * 0.55) * uOn;
          gl_FragColor = vec4(uCol * (1.0 + near), al);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.barrier = new THREE.Mesh(new THREE.CylinderGeometry(P.R + 0.15, P.R + 0.15, 4.2, 128, 1, true), barMat);
    this.barrier.position.y = 2.1; this.barrier.visible = false; this.barrier.renderOrder = 4;
    scene.add(this.barrier);
    const gateMat = new THREE.ShaderMaterial({
      uniforms: { uOn: { value: 0 }, uTime: U.uTime, uCol: { value: new THREE.Color(0xb08cff) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform float uOn, uTime; uniform vec3 uCol; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5; float r = length(p * vec2(1.0, 1.35));
          float rings = smoothstep(0.03, 0.0, abs(r - 0.32)) + smoothstep(0.02, 0.0, abs(r - 0.22)) + smoothstep(0.015, 0.0, abs(r - 0.42));
          float a = atan(p.y, p.x);
          float spokes = smoothstep(0.02, 0.0, abs(sin(a * 4.0 + uTime * 0.6)) * r) * step(r, 0.42);
          float fill = 0.12 + 0.06 * sin(uTime * 3.0 + r * 20.0);
          gl_FragColor = vec4(uCol, (fill + rings * 0.9 + spokes * 0.5) * uOn);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.gateSeal = new THREE.Mesh(new THREE.PlaneGeometry(P.gate.w, P.gate.h), gateMat);
    this.gateSeal.position.set(0, P.gate.h / 2, P.wall - 0.6); this.gateSeal.visible = false;
    scene.add(this.gateSeal);
    // ---------- 高处云雾：一层层缓慢漂移的云片（加色、远处淡去）----------
    // 高处：殿顶一层层云（22–44 米）；低处：圈外贴地的薄雾（只在 27 米以外，不遮战斗圈里的预警与出招）
    this.clouds = new THREE.Group();
    const ctex = this.puffTex = puffTexture(), CR = rng(5);
    const cmat = new THREE.SpriteMaterial({ map: ctex, color: 0x4a4262, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
    const mmat = new THREE.SpriteMaterial({ map: ctex, color: 0x8a80a8, transparent: true, opacity: 0.32, depthWrite: false, fog: false });
    for (let i = 0; i < 56; i++) {
      const s = new THREE.Sprite(cmat);
      const a = CR() * TAU, r = Math.sqrt(CR()) * 36, y = 21 + CR() * 24;
      const sz = 18 + CR() * 24; s.scale.set(sz, sz * 0.5, 1);
      s.userData = { a, r, y, w: (CR() - 0.5) * 0.02 };
      this.clouds.add(s);
    }
    for (let i = 0; i < 30; i++) {
      const s = new THREE.Sprite(mmat);
      const a = CR() * TAU, r = 27.5 + CR() * 6, y = 0.7 + CR() * 1.2;
      const sz = 7 + CR() * 6; s.scale.set(sz, sz * 0.32, 1);
      s.userData = { a, r, y, w: (CR() - 0.5) * 0.012 };
      this.clouds.add(s);
    }
    for (const s of this.clouds.children) { const d = s.userData; s.position.set(Math.cos(d.a) * d.r, d.y, Math.sin(d.a) * d.r); }
    scene.add(this.clouds);
    // 殿顶：一张深色穹顶（云层之上什么也看不见）
    const dome = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 16, 0, TAU, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b0a12, side: THREE.BackSide, fog: false }));
    dome.position.y = 6; scene.add(dome);
    // ---------- 光：冷紫天光、一盏投影的主光（自殿顶云隙斜照）、封印台与南门的点光 ----------
    scene.add(new THREE.HemisphereLight(0x9896b0, 0x2a2730, 0.9));
    const key = this.key = new THREE.DirectionalLight(0xe4e0f2, 1.9);
    key.position.set(18, 46, 22); key.target.position.set(0, 0, -4);
    key.castShadow = true;
    key.shadow.mapSize.set(this.shadowSize, this.shadowSize);
    Object.assign(key.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 5, far: 120 });
    key.shadow.bias = -0.0005; key.shadow.normalBias = 0.04;
    scene.add(key); scene.add(key.target);
    const rim = new THREE.DirectionalLight(0x8a70ff, 0.55); rim.position.set(-20, 18, -30); scene.add(rim);
    this.daisLight = new THREE.PointLight(0x9a7cff, 40, 26, 2); this.daisLight.position.set(P.dais.x, P.dais.y + 4, P.dais.z + 2); scene.add(this.daisLight);
    this.gateLight = new THREE.PointLight(0xffd8a0, 26, 22, 2); this.gateLight.position.set(0, 6, P.wall - 4); scene.add(this.gateLight);
    this.fightLight = new THREE.PointLight(0x9a7cff, 0, 40, 2); this.fightLight.position.set(0, 9, 0); scene.add(this.fightLight);
    this.tris = 0;
    g.traverse((o) => { if (o.isMesh) { const G = o.geometry; this.tris += Math.round((G.index ? G.index.count : G.attributes.position.count) / 3); } });
  }

  // ---------- 战斗中的场地变化 ----------
  setBarrier(on) { this.barrierTarget = on ? 1 : 0; if (on) this.barrier.visible = true; }
  setGate(on) { this.gateTarget = on ? 1 : 0; if (on) this.gateSeal.visible = true; }
  setGlow(level, color = null) { this.glowTarget = level; if (color != null) this.U.uGlowCol.value.set(color); }
  setCrack(level) { this.crackTarget = level; }
  flash(k = 1) { this.U.uFlash.value = Math.max(this.U.uFlash.value, k); }
  reset() {
    this.barrierTarget = 0; this.gateTarget = 0; this.glowTarget = 0.35; this.crackTarget = 0;
    this.barrier.material.uniforms.uOn.value = 0; this.barrier.visible = false;
    this.gateSeal.material.uniforms.uOn.value = 0; this.gateSeal.visible = false;
    this.U.uGlow.value = 0.35; this.U.uCrack.value = 0; this.U.uFlash.value = 0; this.U.uGlowCol.value.set(0x7c68e8); this.U.uReveal.value = -1;
    this.fightLight.intensity = 0;
  }

  // 出场：封印纹自 center 起向外亮开（每秒 speed 米）；center 为 null 时全亮
  reveal(center, speed = 24) {
    if (!center) { this.U.uReveal.value = -1; return; }
    this.U.uRevC.value.set(center.x, center.z); this.U.uReveal.value = 0; this.revealSpeed = speed;
  }
  // 锁链：龙君起身时挣断（四串链环一齐消失，迸出碎光与碎石）；重试时复原
  breakChains(fx = null, instant = false) {
    if (!this.chains.visible) return;
    this.chains.visible = false;
    if (fx && !instant) {
      for (const p of this.chainPts) fx.sparks(p.clone(), { n: 3, color: 0xd9c9a0 });
      for (const p of this.chainPosts) { fx.sparks(p.clone(), { n: 8, big: true, color: 0xd9c9a0 }); fx.rocksBurst(p, 3, 0.6); }
    }
  }
  restoreChains() { this.chains.visible = true; }

  // ---------- 行走与镜头 ----------
  heightAt() { return 0; }
  waterAt() { return null; }
  normalAt() { return new THREE.Vector3(0, 1, 0); }
  inCore(x, z) { const r = Math.hypot(x, z); return r < T50.wall - 0.9 || (Math.abs(x) < T50.gate.w / 2 - 0.4 && z > 0 && z < T50.wall + 5.5); }
  camInside(x, y, z) {
    if (y < 0.25 || y > 30) return false;
    const r = Math.hypot(x, z);
    if (r < T50.R + 1) return true;                                  // 战斗圈里没有遮挡物
    // 圈外：巨柱（连柱础）、倾倒的石台、封印台都不让镜头穿进去
    for (const [px, pz] of this.pillarPos) if ((x - px) ** 2 + (z - pz) ** 2 < 2.0 * 2.0) return false;
    for (const [sx, sz] of this.slabPos) if ((x - sx) ** 2 + (z - sz) ** 2 < 2.2 * 2.2 && y < 1.8) return false;
    const D = T50.dais;
    if ((x - D.x) ** 2 + (z - D.z) ** 2 < (D.r + 0.7) ** 2 && y < D.y + 3.8) return false;
    if (r < T50.wall - 1.2) return true;
    return Math.abs(x) < T50.gate.w / 2 - 0.3 && z > 0 && z < T50.wall + 5.5 && y < T50.gate.h - 0.3;
  }
  camLimit(o, dir, d) {
    const n = Math.ceil(d / 0.25);
    for (let i = 1; i <= n; i++) {
      const s = (d * i) / n;
      if (!this.camInside(o.x + dir.x * s, o.y + dir.y * s, o.z + dir.z * s)) return Math.max(0.6, s - 0.3);
    }
    return d;
  }
  get entry() { return { x: T50.entry.x, y: 0, z: T50.entry.z, yaw: T50.entry.yaw }; }

  update(dt, t, player) {
    if (!this.ready) return;
    const U = this.U;
    U.uTime.value = t;
    const ease = (cur, tgt, k) => cur + (tgt - cur) * Math.min(1, dt * k);
    U.uGlow.value = ease(U.uGlow.value, this.glowTarget ?? 0.35, 2.5);
    U.uCrack.value = ease(U.uCrack.value, this.crackTarget ?? 0, 0.8);
    U.uFlash.value = Math.max(0, U.uFlash.value - dt * 2.5);
    if (U.uReveal.value >= 0) { U.uReveal.value += (this.revealSpeed || 24) * dt; if (U.uReveal.value > 80) U.uReveal.value = -1; }
    const bu = this.barrier.material.uniforms;
    bu.uOn.value = ease(bu.uOn.value, this.barrierTarget ?? 0, 3);
    if (bu.uOn.value < 0.01 && !this.barrierTarget) this.barrier.visible = false;
    if (player) {
      const r = Math.hypot(player.pos.x, player.pos.z);
      bu.uNear.value = Math.max(0, Math.min(1, (r - (T50.R - 4.5)) / 4));
      bu.uNearA.value = Math.atan2(player.pos.z, player.pos.x);
    }
    const gu = this.gateSeal.material.uniforms;
    gu.uOn.value = ease(gu.uOn.value, this.gateTarget ?? 0, 2.4);
    if (gu.uOn.value < 0.01 && !this.gateTarget) this.gateSeal.visible = false;
    this.fightLight.intensity = U.uGlow.value * 30 + U.uCrack.value * 40;
    this.daisLight.intensity = 30 + 10 * Math.sin(t * 1.3);
    for (const s of this.clouds.children) {
      const d = s.userData; d.a += d.w * dt;
      s.position.set(Math.cos(d.a) * d.r, d.y + Math.sin(t * 0.2 + d.r) * (d.y > 10 ? 0.6 : 0.1), Math.sin(d.a) * d.r);
    }
  }
}
