// 丹房室内的程序化陈设与画布贴图：百子药柜（抽屉与药名签）、八卦炉台、青铜丹炉、煎药灶、长案、多宝格、
// 山水挂轴、对联、丹方手记、戥子、药碾、药材串、葫芦……（家具成品模型见 interior.js 中的 Poly Haven 素材）
import * as THREE from 'three';
import { C } from './arch/builder.js';
import { beam } from './arch/arch.js';

const TAU = Math.PI * 2;
const FONT = '"STXingkai","STKaiti","KaiTi","Kaiti SC","Noto Serif SC","SimSun",serif';

function canvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return [cv, cv.getContext('2d')];
}
function tex(cv, srgb = true) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------- 药名签（8 × 8 张，竖写两字） ----------
export const HERBS = ['当归', '黄芪', '甘草', '人参', '茯苓', '白术', '川芎', '熟地', '枸杞', '灵芝', '首乌', '清露', '赤阳', '紫苏', '薄荷', '陈皮',
  '半夏', '桔梗', '银花', '连翘', '菊花', '决明', '丹参', '三七', '天麻', '杜仲', '黄连', '黄芩', '柴胡', '防风', '白芷', '细辛',
  '麦冬', '五味', '山药', '莲子', '芡实', '百合', '玉竹', '石斛', '沉香', '檀香', '丁香', '肉桂', '干姜', '远志', '大黄', '玄参',
  '朱砂', '雄黄', '龙骨', '牡蛎', '琥珀', '珍珠', '冰片', '苍术', '牛黄', '雪莲', '灵草', '赤芝', '紫芝', '蝉蜕', '桑叶', '艾叶'];
let LABELS = null;
export function labelAtlas() {
  if (LABELS) return LABELS;
  const S = 128, [cv, g] = canvas(S * 8, S * 8);
  for (let i = 0; i < 64; i++) {
    const x = (i % 8) * S, y = Math.floor(i / 8) * S;
    const k = 0.9 + Math.random() * 0.1;
    g.fillStyle = `rgb(${Math.round(226 * k)},${Math.round(210 * k)},${Math.round(170 * k)})`;
    g.fillRect(x, y, S, S);
    for (let j = 0; j < 60; j++) { g.fillStyle = `rgba(110,80,40,${Math.random() * 0.08})`; g.fillRect(x + Math.random() * S, y + Math.random() * S, 2 + Math.random() * 4, 1 + Math.random() * 3); }
    g.strokeStyle = 'rgba(120,40,30,.55)'; g.lineWidth = 3; g.strokeRect(x + 7, y + 7, S - 14, S - 14);
    g.fillStyle = '#2a1c14'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold 46px ${FONT}`;
    const [a, b] = [...HERBS[i]];
    g.fillText(a, x + S / 2, y + S * 0.3); g.fillText(b, x + S / 2, y + S * 0.72);
  }
  LABELS = tex(cv);
  return LABELS;
}

// ---------- 八卦炉台（俯视贴图：太极、八卦、外圈刻字） ----------
export function baguaTexture() {
  const N = 1024, [cv, g] = canvas(N, N), c = N / 2;
  g.fillStyle = '#8d877c'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 9000; i++) { const v = 110 + Math.random() * 60; g.fillStyle = `rgba(${v},${v - 4},${v - 10},.16)`; g.fillRect(Math.random() * N, Math.random() * N, 1 + Math.random() * 3, 1 + Math.random() * 3); }
  const groove = (draw) => { g.save(); g.strokeStyle = 'rgba(40,36,30,.75)'; g.fillStyle = 'rgba(40,36,30,.75)'; draw(); g.restore(); g.save(); g.translate(-1.5, -1.5); g.strokeStyle = 'rgba(220,214,200,.35)'; g.fillStyle = 'rgba(220,214,200,.35)'; draw(); g.restore(); };
  groove(() => { g.lineWidth = 6; for (const r of [0.95, 0.83, 0.56, 0.4]) { g.beginPath(); g.arc(c, c, r * c, 0, TAU); g.stroke(); } });
  // 八卦（先天八卦：乾南坤北），卦象朝外
  const TRI = [[1, 1, 1], [0, 1, 1], [1, 0, 1], [0, 0, 1], [1, 1, 0], [0, 1, 0], [1, 0, 0], [0, 0, 0]];
  const NAMES = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU - Math.PI / 2;
    g.save(); g.translate(c + Math.cos(a) * c * 0.69, c + Math.sin(a) * c * 0.69); g.rotate(a + Math.PI / 2);
    groove(() => {
      for (let l = 0; l < 3; l++) {
        const y = -40 + l * 34, w = 130;
        if (TRI[k][l]) g.fillRect(-w / 2, y, w, 18);
        else { g.fillRect(-w / 2, y, w * 0.42, 18); g.fillRect(w * 0.08, y, w * 0.42, 18); }
      }
    });
    g.restore();
    g.save(); g.translate(c + Math.cos(a) * c * 0.895, c + Math.sin(a) * c * 0.895); g.rotate(a + Math.PI / 2);
    groove(() => { g.font = `bold 62px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(NAMES[k], 0, 0); });
    g.restore();
  }
  // 太极
  const r = c * 0.36;
  g.fillStyle = 'rgba(52,47,40,.92)'; g.beginPath(); g.arc(c, c, r, -Math.PI / 2, Math.PI / 2); g.arc(c, c + r / 2, r / 2, Math.PI / 2, -Math.PI / 2, true); g.arc(c, c - r / 2, r / 2, Math.PI / 2, -Math.PI / 2, false); g.fill();
  g.fillStyle = 'rgba(186,180,168,.9)'; g.beginPath(); g.arc(c, c, r, Math.PI / 2, -Math.PI / 2); g.arc(c, c - r / 2, r / 2, -Math.PI / 2, Math.PI / 2, false); g.arc(c, c + r / 2, r / 2, -Math.PI / 2, Math.PI / 2, true); g.fill();
  g.fillStyle = 'rgba(186,180,168,.9)'; g.beginPath(); g.arc(c, c + r / 2, r / 7, 0, TAU); g.fill();
  g.fillStyle = 'rgba(52,47,40,.92)'; g.beginPath(); g.arc(c, c - r / 2, r / 7, 0, TAU); g.fill();
  return tex(cv);
}

// ---------- 山水挂轴（绢本水墨：远山、近松、瀑布、小亭、题诗与印） ----------
export function paintingTexture() {
  const W = 512, H = 1024, [cv, g] = canvas(W, H);
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#e6dcc2'); grd.addColorStop(1, '#d8cba9');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(120,96,60,${Math.random() * 0.04})`; g.fillRect(Math.random() * W, Math.random() * H, 1, 2 + Math.random() * 6); }
  const ridge = (y0, amp, freq, seed, alpha, col) => {
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) {
      const y = y0 - amp * (0.55 * Math.sin(x * freq + seed) + 0.3 * Math.sin(x * freq * 2.7 + seed * 1.7) + 0.15 * Math.sin(x * freq * 6.1 + seed * 3.1)) - amp * 0.9 * Math.exp(-(((x - W * (0.3 + 0.4 * ((seed * 7) % 1))) / (W * 0.16)) ** 2));
      g.lineTo(x, y);
    }
    g.lineTo(W, H); g.closePath();
    const gr = g.createLinearGradient(0, y0 - amp * 2, 0, y0 + 160);
    gr.addColorStop(0, `rgba(${col},${alpha})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fill();
  };
  ridge(330, 120, 0.011, 1.3, 0.35, '70,78,82');
  ridge(470, 150, 0.014, 2.9, 0.55, '52,58,58');
  ridge(640, 110, 0.019, 4.2, 0.72, '40,44,40');
  // 瀑布：两山之间一道白练
  g.fillStyle = 'rgba(236,230,214,.85)'; g.fillRect(W * 0.62, 420, 10, 230);
  g.fillStyle = 'rgba(236,230,214,.5)'; g.beginPath(); g.ellipse(W * 0.62 + 5, 660, 40, 12, 0, 0, TAU); g.fill();
  // 近景松与小亭
  const pine = (x, y, s) => {
    g.strokeStyle = 'rgba(30,26,22,.9)'; g.lineWidth = 6 * s; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 10 * s, y - 60 * s, x - 20 * s, y - 120 * s, x + 6 * s, y - 190 * s); g.stroke();
    g.fillStyle = 'rgba(28,40,32,.82)';
    for (let k = 0; k < 6; k++) { const yy = y - 70 * s - k * 22 * s, ww = (70 - k * 8) * s; g.beginPath(); g.ellipse(x + (k % 2 ? 14 : -10) * s, yy, ww, 9 * s, (k % 2 ? 0.12 : -0.1), 0, TAU); g.fill(); }
  };
  pine(120, 860, 1.25); pine(175, 880, 0.9);
  g.fillStyle = 'rgba(36,30,26,.85)'; g.beginPath(); g.moveTo(330, 760); g.lineTo(390, 760); g.lineTo(360, 738); g.closePath(); g.fill();
  g.fillRect(340, 760, 4, 26); g.fillRect(376, 760, 4, 26);
  g.fillStyle = 'rgba(40,44,40,.65)'; g.fillRect(0, 900, W, 124);
  // 题诗（竖排）与印
  g.fillStyle = 'rgba(30,24,20,.85)'; g.font = `34px ${FONT}`; g.textAlign = 'center';
  const lines = ['炉火映丹砂', '松风过药篱', '一壶山月白', '不羡上清时'];
  lines.forEach((ln, j) => [...ln].forEach((ch, k) => g.fillText(ch, W - 48 - j * 40, 90 + k * 40)));
  g.fillStyle = 'rgba(168,40,30,.85)'; g.fillRect(W - 176, 300, 34, 34); g.fillRect(40, 950, 40, 40);
  g.fillStyle = 'rgba(240,220,200,.9)'; g.font = `bold 22px ${FONT}`; g.fillText('青', W - 159, 324); g.fillText('岚', 60, 978);
  return tex(cv);
}

// 对联 / 竖条（红纸墨字）
export function coupletTexture(text) {
  const W = 128, H = 128 * text.length + 64, [cv, g] = canvas(W, H);
  g.fillStyle = '#9b2c22'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(60,10,8,${Math.random() * 0.12})`; g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 5, 1 + Math.random() * 3); }
  g.fillStyle = '#1c1210'; g.font = `bold 92px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  [...text].forEach((ch, i) => g.fillText(ch, W / 2, 32 + 64 + i * 128));
  return tex(cv);
}

// 丹方手记（摊开的线装册）：左页丹方、右页草图
export function manuscriptTexture() {
  const W = 1024, H = 640, [cv, g] = canvas(W, H);
  g.fillStyle = '#e9dfc4'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(120,96,60,${Math.random() * 0.05})`; g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 3, 1 + Math.random() * 2); }
  g.fillStyle = 'rgba(80,60,40,.25)'; g.fillRect(W / 2 - 4, 0, 8, H);
  g.strokeStyle = 'rgba(150,50,40,.5)'; g.lineWidth = 2;
  for (let k = 0; k < 9; k++) { const x = W / 2 - 60 - k * 48; g.beginPath(); g.moveTo(x, 40); g.lineTo(x, H - 40); g.stroke(); }
  g.fillStyle = '#2a1c14'; g.font = `36px ${FONT}`; g.textAlign = 'center';
  const cols = ['养元丹方', '清露草五钱', '赤阳果三枚', '茯苓二两', '甘草一钱', '文火三时', '武火一刻', '丹成色如温玉'];
  cols.forEach((s, j) => [...s].forEach((ch, k) => g.fillText(ch, W / 2 - 36 - j * 48, 82 + k * 42)));
  g.fillStyle = 'rgba(160,40,30,.85)'; g.fillRect(W / 2 - 470, H - 110, 38, 38);
  // 右页：药草线描与丹炉草图
  g.strokeStyle = 'rgba(40,30,22,.8)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(W * 0.68, H * 0.8); g.bezierCurveTo(W * 0.66, H * 0.6, W * 0.72, H * 0.4, W * 0.7, H * 0.18); g.stroke();
  for (let k = 0; k < 7; k++) { const y = H * 0.75 - k * 60, s = k % 2 ? 1 : -1; g.beginPath(); g.ellipse(W * 0.69 + s * 46, y, 44, 14, s * 0.5, 0, TAU); g.stroke(); }
  g.beginPath(); g.arc(W * 0.86, H * 0.55, 62, 0.2, Math.PI - 0.2); g.stroke();
  g.beginPath(); g.moveTo(W * 0.86 - 60, H * 0.55 + 10); g.lineTo(W * 0.86 - 70, H * 0.55 + 100); g.moveTo(W * 0.86 + 60, H * 0.55 + 10); g.lineTo(W * 0.86 + 70, H * 0.55 + 100); g.stroke();
  g.font = `28px ${FONT}`; g.fillText('炉', W * 0.86, H * 0.55 - 80);
  return tex(cv);
}

// 书脊 / 书衣
export function bookTexture() {
  const W = 256, H = 256, [cv, g] = canvas(W, H);
  const cols = ['#2f4a5a', '#5a3a2a', '#3e4a32', '#6a5a3a', '#4a2f3a', '#2a3a4a', '#7a6a4a', '#3a3a3a'];
  for (let i = 0; i < 8; i++) {
    g.fillStyle = cols[i]; g.fillRect(i * 32, 0, 32, H);
    g.fillStyle = 'rgba(230,220,190,.85)'; g.fillRect(i * 32 + 9, 30, 14, 70);
    g.fillStyle = 'rgba(0,0,0,.25)'; for (let k = 0; k < 4; k++) g.fillRect(i * 32, 120 + k * 30, 32, 2);
  }
  return tex(cv);
}

// ---------- 程序化陈设（Builder 构件） ----------
// 百子药柜：w 宽、h 高、d 深；cols × rows 个抽屉；返回药名签的四边形列表（世界内由同一张签纸贴图合成一个网格）
export function medicineCabinet(b, x, y, z, w, h, d, cols, rows, labels, rand) {
  b.push(x, y, z, 0);
  const base = 0.16, top = 0.1, fh = h - base - top, cw = w / cols, rh = fh / rows;
  b.slab(w + 0.06, base, d, C.woodDark, 0, 0, 0, { mat: 'wood' });                           // 柜脚
  b.slab(w + 0.12, top, d + 0.06, C.woodDark, 0, h - top, 0.03, { mat: 'wood', col: false }); // 柜顶
  b.slab(w, fh, d - 0.06, 0x2a1f18, 0, base, -0.03, { mat: 'wood', col: false });             // 柜体
  for (const s of [-1, 1]) b.slab(0.05, fh, d, C.woodDark, s * (w / 2 + 0.005), base, 0, { mat: 'wood', col: false });
  for (let r = 0; r <= rows; r++) b.box(w, 0.025, 0.03, C.woodDark, 0, base + r * rh, d / 2 - 0.005, { col: false, mat: 'wood' });
  for (let c = 0; c <= cols; c++) b.box(0.025, fh, 0.03, C.woodDark, -w / 2 + c * cw, base + fh / 2, d / 2 - 0.005, { col: false, mat: 'wood' });
  const tone = [0x6a4a34, 0x5e4230, 0x725038, 0x654632];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const cx = -w / 2 + (c + 0.5) * cw, cy = base + (r + 0.5) * rh;
    const pull = rand() < 0.04 ? 0.05 + rand() * 0.12 : 0;           // 少数抽屉没推严
    b.box(cw - 0.035, rh - 0.035, 0.03, tone[(r * 7 + c * 3) % 4], cx, cy, d / 2 + pull, { col: false, mat: 'wood', jitter: 0.12 });
    b.cyl(0.018, 0.018, 0.035, C.gold, cx, cy - rh * 0.22, d / 2 + 0.03 + pull, { rx: Math.PI / 2, col: false, mat: 'gold', seg: 8 });
    labels.push({ x: x + cx, y: y + cy + rh * 0.12, z: z + d / 2 + 0.017 + pull, w: Math.min(cw * 0.42, 0.11), h: Math.min(rh * 0.5, 0.11), i: Math.floor(rand() * 64) });
  }
  b.collider(0, 0, h, 0, w / 2 + 0.06, d / 2 + 0.04);
  b.pop();
}

// 药名签网格：一组小四边形，uv 指向签纸图集中的格子
export function labelMesh(list, ry = 0) {
  const pos = [], uv = [], idx = [];
  list.forEach((l, k) => {
    const u0 = (l.i % 8) / 8, v0 = 1 - (Math.floor(l.i / 8) + 1) / 8;
    const c = Math.cos(ry), s = Math.sin(ry);
    const corners = [[-l.w / 2, -l.h / 2], [l.w / 2, -l.h / 2], [l.w / 2, l.h / 2], [-l.w / 2, l.h / 2]];
    for (const [a, bb] of corners) pos.push(l.x + a * c, l.y + bb, l.z - a * s);
    uv.push(u0, v0, u0 + 1 / 8, v0, u0 + 1 / 8, v0 + 1 / 8, u0, v0 + 1 / 8);
    idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: labelAtlas(), roughness: 0.9 }));
  m.receiveShadow = true;
  return m;
}

// 八卦炉台（两级八角石台）：返回刻纹顶面网格
export function furnacePlatform(b, x, y, z, r = 1.5) {
  b.cyl(r, r + 0.05, 0.2, C.stoneWarm, x, y + 0.1, z, { seg: 8, mat: 'stoneSmooth', col: false, ry: Math.PI / 8 });
  b.cyl(r * 0.72, r * 0.74, 0.14, C.stone, x, y + 0.27, z, { seg: 8, mat: 'stoneSmooth', col: false, ry: Math.PI / 8 });
  b.cylCollider(x, y, y + 0.2, z, r * 0.95, { walk: true });            // 两级台面都可踏上
  b.cylCollider(x, y, y + 0.34, z, r * 0.7, { walk: true });
  const top = new THREE.Mesh(new THREE.CircleGeometry(r * 0.985, 8, Math.PI / 8), new THREE.MeshStandardMaterial({ map: baguaTexture(), roughness: 0.85 }));
  top.rotation.x = -Math.PI / 2; top.rotation.z = 0;
  top.position.set(x, y + 0.202, z);
  top.receiveShadow = true;
  // 圆盘 uv 自中心展开：CircleGeometry 默认 uv 即为俯视贴图
  return top;
}

// 青铜丹炉：三足、圆腹、双立耳、炉盖与宝顶；炉门与炉底的火光另行添加（见 interior.js）
export function bronzeFurnace(b, x, y, z) {
  b.push(x, y, z, 0);
  const bz = C.bronze;
  // 三足（兽足，略外撇）
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + Math.PI / 2 + Math.PI / 3;
    const fx = Math.cos(a), fz = Math.sin(a);
    beam(b, fx * 0.42, 0.98, fz * 0.42, fx * 0.56, 0.12, fz * 0.56, 0.17, bz, 'bronze');
    b.sphere(0.13, bz, fx * 0.58, 0.1, fz * 0.58, { mat: 'bronze', sy: 0.7 });
  }
  // 炉腹（旋转体）
  const prof = [[0.0, 0.72], [0.3, 0.74], [0.56, 0.86], [0.74, 1.06], [0.8, 1.3], [0.76, 1.55], [0.64, 1.76], [0.56, 1.86], [0.56, 1.93], [0.66, 1.98], [0.66, 2.04], [0.5, 2.04]];
  b.add(new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), 28), bz, 'bronze', { col: false });
  // 腹部纹带（饕餮纹以凸棱示意）与炉口
  b.add(new THREE.TorusGeometry(0.795, 0.03, 6, 40), 0x8a8460, 'bronze', { y: 1.38, rx: Math.PI / 2, col: false });
  b.add(new THREE.TorusGeometry(0.775, 0.025, 6, 40), 0x8a8460, 'bronze', { y: 1.2, rx: Math.PI / 2, col: false });
  for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; b.box(0.09, 0.14, 0.03, 0x7c7856, Math.cos(a) * 0.79, 1.29, Math.sin(a) * 0.79, { ry: -a + Math.PI / 2, col: false, mat: 'bronze' }); }
  // 双立耳
  for (const s of [-1, 1]) {
    b.box(0.06, 0.34, 0.07, bz, s * 0.6, 2.18, 0.12, { col: false, mat: 'bronze' });
    b.box(0.06, 0.34, 0.07, bz, s * 0.6, 2.18, -0.12, { col: false, mat: 'bronze' });
    b.box(0.07, 0.07, 0.31, bz, s * 0.6, 2.36, 0, { col: false, mat: 'bronze' });
  }
  // 炉盖（镂空盖以两层旋转体示意）与宝顶
  const lid = [[0.62, 2.04], [0.6, 2.12], [0.5, 2.26], [0.34, 2.4], [0.18, 2.48], [0.1, 2.52], [0.0, 2.53]];
  b.add(new THREE.LatheGeometry(lid.map(([r, h]) => new THREE.Vector2(r, h)), 24), 0x5f6650, 'bronze', { col: false });
  b.cyl(0.08, 0.1, 0.12, bz, 0, 2.58, 0, { col: false, mat: 'bronze', seg: 10 });
  b.sphere(0.12, C.gold, 0, 2.72, 0, { mat: 'gold', seg: 12, seg2: 8 });
  b.add(new THREE.ConeGeometry(0.06, 0.18, 8), C.gold, 'gold', { y: 2.9, col: false });
  // 炉底炭盆（三足之间）
  b.cyl(0.42, 0.34, 0.12, 0x3a3630, 0, 0.4, 0, { col: false, mat: 'stone', seg: 16 });
  b.pop();
}

// 煎药灶（砖砌，两眼灶，灶门朝南）：返回两只药罐的放置位置
export function brickStove(b, x, y, z, w = 1.7, d = 1.0, h = 0.82) {
  b.push(x, y, z, 0);
  b.slab(w, h, d, C.brickWarm, 0, 0, 0, { mat: 'stone' });
  b.slab(w + 0.08, 0.08, d + 0.08, C.stoneDark, 0, h, 0, { mat: 'stoneSmooth', col: false });
  const holes = [];
  for (const s of [-1, 1]) {
    const hx = s * w * 0.25;
    b.cyl(0.24, 0.24, 0.02, 0x1e1a16, hx, h + 0.085, 0, { col: false, seg: 14 });
    // 灶门（拱形以叠块示意）
    b.slab(0.36, 0.3, 0.04, 0x2a2420, hx, 0.12, d / 2 + 0.005, { col: false, mat: 'stone' });
    b.slab(0.44, 0.06, 0.08, C.stoneDark, hx, 0.42, d / 2 + 0.02, { col: false, mat: 'stoneSmooth' });
    holes.push({ x: x + hx, y: y + h + 0.09, z, mouth: { x: x + hx, y: y + 0.26, z: z + d / 2 + 0.03 } });
  }
  b.collider(0, 0, h + 0.1, 0, w / 2 + 0.04, d / 2 + 0.04);
  b.pop();
  return holes;
}

// 长案（条桌）：桌面、四腿、牙板
export function longTable(b, x, y, z, ry, w = 2.4, d = 0.72, h = 0.82, color = C.woodRed) {
  b.push(x, y, z, ry);
  b.slab(w, 0.06, d, color, 0, h - 0.06, 0, { mat: 'wood' });
  b.slab(w + 0.04, 0.02, d + 0.04, C.woodDark, 0, h - 0.08, 0, { mat: 'wood', col: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.07, h - 0.08, 0.07, color, sx * (w / 2 - 0.12), (h - 0.08) / 2, sz * (d / 2 - 0.08), { mat: 'wood', col: false });
  for (const sz of [-1, 1]) b.box(w - 0.3, 0.08, 0.025, color, 0, h - 0.13, sz * (d / 2 - 0.08), { mat: 'wood', col: false });
  for (const sx of [-1, 1]) b.box(0.025, 0.06, d - 0.2, color, sx * (w / 2 - 0.12), 0.18, 0, { mat: 'wood', col: false });
  b.collider(0, 0, h, 0, w / 2, d / 2);
  b.pop();
}

// 多宝格（靠墙的格架）：返回各格的放置面（供摆放药瓶、罐、葫芦）
export function curioShelf(b, x, y, z, ry, w = 2.6, h = 2.2, d = 0.42) {
  b.push(x, y, z, ry);
  const col = C.woodRed, t = 0.04;
  b.slab(w, 0.1, d, C.woodDark, 0, 0, 0, { mat: 'wood' });
  b.slab(w, h - 0.1, 0.03, 0x3a2a20, 0, 0.1, -d / 2 + 0.015, { mat: 'wood', col: false });
  for (const s of [-1, 1]) b.slab(t, h - 0.1, d, col, s * (w / 2 - t / 2), 0.1, 0, { mat: 'wood', col: false });
  b.slab(w + 0.06, 0.06, d + 0.04, col, 0, h, 0, { mat: 'wood', col: false });
  // 不规则的格子：四层，每层的竖隔板位置错开
  const levels = [0.1, 0.62, 1.12, 1.66, h];
  const divs = [[0.36, 0.7], [0.22, 0.55, 0.8], [0.42], [0.3, 0.64]];
  const spots = [];
  for (let l = 0; l < 4; l++) {
    const y0 = levels[l], y1 = levels[l + 1];
    if (l > 0) b.slab(w - 2 * t, t, d - 0.04, col, 0, y0 - t, 0.01, { mat: 'wood', col: false });
    const cuts = [0, ...divs[l], 1];
    for (let k = 1; k < cuts.length - 1; k++) b.slab(t, y1 - y0 - (l < 3 ? t : 0), d - 0.04, col, -w / 2 + cuts[k] * w, y0, 0.01, { mat: 'wood', col: false });
    for (let k = 0; k < cuts.length - 1; k++) {
      const a = -w / 2 + cuts[k] * w + t, bb = -w / 2 + cuts[k + 1] * w - t;
      spots.push({ x0: a, x1: bb, y: y0, h: y1 - y0 - t, level: l });
    }
  }
  b.collider(0, 0, h, 0, w / 2, d / 2);
  b.pop();
  // 转为世界坐标（沿本地 x 的线段）
  const c = Math.cos(ry), s = Math.sin(ry);
  return spots.map((p) => ({ ...p, y: y + p.y, at: (u) => { const lx = p.x0 + (p.x1 - p.x0) * u; return { x: x + lx * c, z: z - lx * s }; } }));
}

// 吊挂的药材串
const STEM = new THREE.CylinderGeometry(0.004, 0.009, 1, 4, 1);
const LEAF = new THREE.PlaneGeometry(0.035, 0.07);
export function herbBundle(b, x, y, z, len, rand) {
  const tones = [0x6e6440, 0x66703e, 0x7a5a3a, 0x8a7a4c, 0x5a6440, 0x725040];
  const tone = tones[Math.floor(rand() * tones.length)];
  b.cyl(0.005, 0.005, len, 0x3a2a1a, x, y - len / 2, z, { col: false, seg: 3 });
  const ty = y - len;
  b.cyl(0.022, 0.018, 0.04, 0xa8302a, x, ty - 0.02, z, { col: false, seg: 6, mat: 'cloth' });      // 红绳扎口
  const n = 7 + Math.floor(rand() * 5), L = 0.32 + rand() * 0.18;
  for (let k = 0; k < n; k++) {
    const a = rand() * TAU, tilt = 0.08 + rand() * 0.22, l = L * (0.75 + rand() * 0.3);
    const dx = Math.sin(tilt) * Math.cos(a), dz = Math.sin(tilt) * Math.sin(a);
    const c = tone + (rand() < 0.3 ? 0x080604 : 0);
    // 细枝：自扎口向下、略向外散
    b.add(STEM, c, 'leaf', { x: x + dx * l / 2, y: ty - 0.03 - Math.cos(tilt) * l / 2, z: z + dz * l / 2, sy: l, rx: -Math.asin(dz), rz: Math.asin(dx), col: false });
    // 枝上几片干叶
    for (let j = 0; j < 3; j++) {
      const u = 0.35 + j * 0.25;
      b.add(LEAF, c, 'leaf', { x: x + dx * l * u + (rand() - 0.5) * 0.03, y: ty - 0.03 - Math.cos(tilt) * l * u, z: z + dz * l * u + (rand() - 0.5) * 0.03, rx: (rand() - 0.5) * 1.2, ry: rand() * TAU, rz: (rand() - 0.5) * 0.8, col: false });
    }
  }
}

// 葫芦（两球一颈，系红绳）
export function gourd(b, x, y, z, s = 1, hang = false) {
  const col = 0xb08a48;
  b.sphere(0.1 * s, col, x, y + 0.09 * s, z, { mat: 'glaze', seg: 12, seg2: 8, sy: 0.95 });
  b.sphere(0.065 * s, col, x, y + 0.24 * s, z, { mat: 'glaze', seg: 10, seg2: 8 });
  b.cyl(0.03 * s, 0.04 * s, 0.06 * s, col, x, y + 0.165 * s, z, { col: false, mat: 'glaze', seg: 8 });
  b.cyl(0.012 * s, 0.015 * s, 0.05 * s, 0x5a3a20, x, y + 0.32 * s, z, { col: false, mat: 'wood', seg: 5 });
  b.add(new THREE.TorusGeometry(0.035 * s, 0.008 * s, 4, 10), 0xa8302a, 'cloth', { x, y: y + 0.165 * s, z, rx: Math.PI / 2, col: false });
  if (hang) b.cyl(0.004, 0.004, hang, 0xa8302a, x, y + 0.34 * s + hang / 2, z, { col: false, seg: 3 });
}

// 戥子（小杆秤）：秤杆、秤盘、秤砣
export function steelyard(b, x, y, z, ry) {
  b.push(x, y, z, ry);
  b.cyl(0.006, 0.004, 0.42, 0x3a2a1c, 0, 0.008, 0, { rz: Math.PI / 2, col: false, seg: 5, mat: 'wood' });
  b.cyl(0.05, 0.045, 0.012, C.gold, -0.24, 0.006, 0, { col: false, seg: 14, mat: 'gold' });
  b.cyl(0.012, 0.016, 0.022, 0x5a5448, 0.12, 0.011, 0.01, { col: false, seg: 6, mat: 'bronze' });
  b.pop();
}

// 药碾子（船形碾槽与碾轮）
export function grinder(b, x, y, z, ry) {
  b.push(x, y, z, ry);
  b.add(new THREE.CylinderGeometry(0.14, 0.09, 0.78, 12, 1, false, 0, Math.PI), 0x4a4640, 'bronze', { y: 0.16, rz: Math.PI / 2, rx: Math.PI, col: false });
  b.slab(0.62, 0.05, 0.16, 0x3e3a34, 0, 0, 0, { mat: 'bronze', col: false });
  b.cyl(0.13, 0.13, 0.035, 0x55504a, 0.08, 0.15, 0, { rx: Math.PI / 2, col: false, seg: 18, mat: 'bronze' });
  b.cyl(0.012, 0.012, 0.42, C.woodLight, 0.08, 0.15, 0, { rx: Math.PI / 2, col: false, seg: 6, mat: 'wood' });
  b.collider(0, 0, 0.3, 0, 0.42, 0.12);
  b.pop();
}

// 书册与卷轴（一摞）
export function bookStack(b, x, y, z, ry, n, rand) {
  const cols = [0x2f4a5a, 0x5a3a2a, 0x3e4a32, 0x6a5a3a, 0x4a2f3a];
  let yy = y;
  for (let k = 0; k < n; k++) {
    const t = 0.025 + rand() * 0.015;
    b.slab(0.19, t, 0.27, cols[Math.floor(rand() * cols.length)], x, yy, z, { ry: ry + (rand() - 0.5) * 0.3, col: false, mat: 'cloth' });
    b.slab(0.18, t - 0.006, 0.255, 0xe2d8bc, x + 0.004, yy + 0.003, z, { ry: ry + (rand() - 0.5) * 0.05, col: false, mat: 'cloth' });
    yy += t;
  }
  return yy;
}
export function scrollRoll(b, x, y, z, ry, len = 0.42) {
  b.cyl(0.03, 0.03, len, 0xe2d8bc, x, y + 0.03, z, { rz: Math.PI / 2, ry, col: false, seg: 10, mat: 'cloth' });
  for (const s of [-1, 1]) b.cyl(0.012, 0.012, 0.05, 0x3a2a1c, x + Math.cos(ry) * s * (len / 2 + 0.02), y + 0.03, z - Math.sin(ry) * s * (len / 2 + 0.02), { rz: Math.PI / 2, ry, col: false, seg: 6, mat: 'wood' });
}

// 竹匾（晒药的圆竹盘），可倚墙立放
export function bambooTray(b, x, y, z, r, tilt = 0, ry = 0, fill = 0x7a6a40) {
  b.push(x, y, z, ry);
  b.cyl(r, r, 0.04, C.bamboo, 0, r * Math.sin(tilt) + 0.02, 0, { rx: tilt, col: false, seg: 18, mat: 'thatch' });
  b.add(new THREE.TorusGeometry(r, 0.018, 4, 24), C.bambooDry, 'wood', { y: r * Math.sin(tilt) + 0.04, rx: Math.PI / 2 + tilt, col: false });
  if (fill) b.cyl(r * 0.85, r * 0.85, 0.02, fill, 0, r * Math.sin(tilt) + 0.045, 0.004, { rx: tilt, col: false, seg: 14, mat: 'leaf' });
  b.pop();
}

// 蒲团
export function prayerCushion(b, x, y, z) {
  b.cyl(0.3, 0.33, 0.12, 0xa8843e, x, y + 0.06, z, { col: false, seg: 18, mat: 'thatch' });
  b.add(new THREE.TorusGeometry(0.3, 0.035, 5, 20), 0x8a6a30, 'thatch', { x, y: y + 0.11, z, rx: Math.PI / 2, col: false });
}
