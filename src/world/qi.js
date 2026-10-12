// 聚灵阵（第九轮依参考包 D08-01/02 重做）：与演武广场铺地齐平的石、玉、铜镶嵌阵面，不再有抬高的演武台、踏步、外圈金环与立体节点。
// 层次由内到外：阵心太极（黑石与白石，铜线勾边、铜圈阵眼）→ 卷云浮雕环 → 八卦青玉环（八格白石开光刻卦）→ 符文带（二十四字篆刻）
//   → 导流区（八道自外缘节点盘旋向内的刻槽，槽间卷云浮雕）→ 外圈青玉开光（十六格，八个节点为莲纹玉心）→ 铜边 → 放射铺石一圈。
// 贴图：漫反射（石、玉、铜、黑石的固有色，不含光影）、法线（由高度图求得：刻槽下凹、浮雕凸起、铜线略高）、
//   粗糙度/金属度（G/B 通道：玉 0.3、石 0.8、铜 0.42 且为金属）、发光遮罩（R：导流槽与节点；G：环线、卦、符文、阵眼）。
// 发光只在少数刻槽：待机时只有八道导流槽与节点玉心微亮；修炼时节点依次亮起 → 灵气沿槽汇向阵心 → 符文、卦、阵心依次转亮；停止后平滑减弱。
import * as THREE from 'three';
import { GLOBAL, FOGU, injectFog, shaderMaterial } from './shaderlib.js';
import { registerEnvMat } from './arch/builder.js';

const TAU = Math.PI * 2;
// 版面（米，阵面局部极坐标）；阵径 16 米（edge 8），外接放射铺石到 10.2 米
const L = { core: 2.3, scroll: 3.1, gua0: 3.18, gua1: 4.0, rune0: 4.08, rune1: 5.5, flow0: 5.58, cart0: 7.24, node: 7.62, edge: 8.0, out: 10.2, nodes: 8, twist: 0.6 };
const nodeAngle = (k) => (k / L.nodes) * TAU + TAU / 16;
// 导流槽：自外圈内沿 (r = cart0) 盘旋到符文带外沿 (r = flow0)；返回该半径处的角度
const chanAngle = (k, r) => nodeAngle(k) + L.twist * (L.cart0 - Math.min(r, L.cart0)) / (L.cart0 - L.flow0);

// ---------- 阵面贴图（演武场聚灵阵与灵池修炼岛共用；L 为版面，opt 为格数、字数、是否有导流槽等）----------
export function arrayTextures(L, { S = 2048, cart = 16, glyphs: NG = 24, chans = true, glyphFont = 0.9, cartGap = 0.48 } = {}) {
  const R = L.out, c = S / 2, k = S / 2 / R, sd = (S / 2048) * (S / 2048);
  const mk = (n) => { const cv = document.createElement('canvas'); cv.width = cv.height = n; return cv; };
  const cA = mk(S), cH = mk(S), cO = mk(1024), cG = mk(1024);
  const A = cA.getContext('2d'), H = cH.getContext('2d'), O = cO.getContext('2d'), G = cG.getContext('2d');
  O.scale(1024 / S, 1024 / S); G.scale(1024 / S, 1024 / S);
  const nodeAngle = (k2) => (k2 / L.nodes) * TAU + TAU / 16;
  const chanAngle = (k2, r) => nodeAngle(k2) + L.twist * (L.cart0 - Math.min(r, L.cart0)) / (L.cart0 - L.flow0);
  A.fillStyle = '#d0cbbd'; A.fillRect(0, 0, S, S);
  H.fillStyle = 'rgb(128,128,128)'; H.fillRect(0, 0, S, S);
  O.fillStyle = 'rgb(255,204,0)'; O.fillRect(0, 0, S, S);
  G.fillStyle = '#000'; G.fillRect(0, 0, S, S); G.globalCompositeOperation = 'lighter';
  const P = (r, a) => [c + Math.cos(a) * r * k, c - Math.sin(a) * r * k];
  const gray = (v) => `rgb(${v},${v},${v})`;
  // 路径（世界角 a 逆时针；画布 y 向下，故画布角为 -a）
  const annulus = (r0, r1) => (g) => { g.beginPath(); g.arc(c, c, r1 * k, 0, TAU); if (r0 > 0) g.arc(c, c, r0 * k, 0, TAU, true); };
  const sector = (r0, r1, a0, a1) => (g) => { g.beginPath(); g.arc(c, c, r1 * k, -a1, -a0); g.arc(c, c, r0 * k, -a0, -a1, true); g.closePath(); };
  const circle = (r) => (g) => { g.beginPath(); g.arc(c, c, r * k, 0, TAU); };
  const disc = (x, y, r) => (g) => { g.beginPath(); g.arc(x, y, r * k, 0, TAU); };
  const MAT = {
    marble: { a: '#d0cbbd', h: 128, ro: 0.8, me: 0 },
    marbleW: { a: '#cdc8ba', h: 128, ro: 0.82, me: 0 },
    jade: { a: '#7ea99e', h: 128, ro: 0.3, me: 0 },
    bronze: { a: '#a48a55', h: 156, ro: 0.4, me: 1 },
    dark: { a: '#3b3e3d', h: 128, ro: 0.5, me: 0 },
  };
  const orm = (m) => `rgb(255,${Math.round(m.ro * 255)},${Math.round(m.me * 255)})`;
  const fill = (path, m, { h = m.h, a = m.a, glow = null } = {}) => {
    path(A); A.fillStyle = a; A.fill();
    path(H); H.fillStyle = gray(h); H.fill();
    path(O); O.fillStyle = orm(m); O.fill();
    if (glow) { path(G); G.fillStyle = glow; G.fill(); }
  };
  const line = (path, w, m, { h = m.h, a = m.a, glow = null, ormOn = true } = {}) => {
    const L2 = [[A, a], [H, gray(h)]];
    if (ormOn) L2.push([O, orm(m)]);
    if (glow) L2.push([G, glow]);
    for (const [g, st] of L2) { path(g); g.lineWidth = w * k; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = st; g.stroke(); }
  };
  // 只刻高度（与少量积尘色）：凹槽 h < 128，浮雕 h > 128
  const carve = (path, w, h, { a = null, glow = null } = {}) => {
    const L2 = [[H, gray(h)]];
    if (a) L2.push([A, a]);
    if (glow) L2.push([G, glow]);
    for (const [g, st] of L2) { path(g); g.lineWidth = w * k; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = st; g.stroke(); }
  };
  // 浮雕：先在四周描一圈积尘（固有色略暗、略宽），再描凸起的纹样
  const relief = (path, w, h, a) => { carve(path, w * 2.2, 112, { a: 'rgba(120,116,104,.28)' }); carve(path, w, h, { a }); };
  // 卷云纹（如意云头）：本地单位约 ±1，s 为米
  const cloud = (x, y, s, rot, mir = 1) => (g) => {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(s * k * mir, s * k);
    g.beginPath();
    g.moveTo(-1, 0.3); g.bezierCurveTo(-1.05, -0.5, -0.22, -0.62, -0.18, -0.08); g.bezierCurveTo(-0.15, 0.2, -0.52, 0.22, -0.56, -0.04);
    g.moveTo(1, 0.3); g.bezierCurveTo(1.05, -0.5, 0.22, -0.62, 0.18, -0.08); g.bezierCurveTo(0.15, 0.2, 0.52, 0.22, 0.56, -0.04);
    g.moveTo(-0.7, 0.46); g.bezierCurveTo(-0.32, 0.86, 0.32, 0.86, 0.7, 0.46);
    g.restore();
  };
  const jadeVeins = (path, n) => {
    A.save(); path(A); A.clip();
    for (let i = 0; i < n; i++) {
      const x = Math.random() * S, y = Math.random() * S, L3 = 40 + Math.random() * 160, a = Math.random() * TAU;
      A.strokeStyle = Math.random() < 0.5 ? 'rgba(186,220,208,.35)' : 'rgba(92,140,128,.28)'; A.lineWidth = 1 + Math.random() * 3;
      A.beginPath(); A.moveTo(x, y); A.bezierCurveTo(x + Math.cos(a) * L3 * 0.4 + (Math.random() - 0.5) * 40, y + Math.sin(a) * L3 * 0.4, x + Math.cos(a) * L3 * 0.7, y + Math.sin(a) * L3 * 0.7 + (Math.random() - 0.5) * 40, x + Math.cos(a) * L3, y + Math.sin(a) * L3); A.stroke();
    }
    A.restore();
  };

  // 1) 放射铺石圈（edge → out）：24 × 2 块，块色略有差异；接缝
  const rMid = (L.edge + L.out) / 2;
  for (let i = 0; i < 24; i++) for (const [r0, r1] of [[L.edge, rMid], [rMid, L.out + 0.1]]) {
    const a0 = (i / 24) * TAU + (r0 > L.edge ? TAU / 48 : 0), a1 = a0 + TAU / 24, v = Math.round(206 + (Math.random() - 0.5) * 18);
    fill(sector(r0, r1, a0, a1), MAT.marble, { a: `rgb(${v},${v - 4},${v - 15})` });
    carve(sector(r0, r1, a0, a1), 0.014, 96, { a: '#a3a79f' });
  }
  // 2) 外圈青玉开光（cart0 → edge）：十六格玉板（玉板四周白石框、浮雕卷云），八个节点为白石圆座 + 莲纹玉心，另八处为小团花白石块
  fill(annulus(L.cart0, L.edge), MAT.marbleW);
  const cloudS = Math.min(0.2, (L.edge - L.cart0) * 0.27);
  for (let i = 0; i < cart; i++) {
    const am = (i / cart) * TAU + TAU / (2 * cart), half = TAU / (2 * cart) - cartGap / ((L.cart0 + L.edge) / 2);     // 让出节点 / 团花块
    const p = sector(L.cart0 + 0.07, L.edge - 0.07, am - half, am + half);
    fill(p, MAT.jade); jadeVeins(p, 26);
    carve(p, 0.03, 100);
    const [x, y] = P((L.cart0 + L.edge) / 2, am);
    relief(cloud(x, y, cloudS, -am + Math.PI / 2), 0.03 * cloudS / 0.2, 176, 'rgba(160,200,188,.95)');
  }
  for (let n = 0; n < L.nodes; n++) {
    const [x, y] = P(L.node, nodeAngle(n));
    fill(disc(x, y, 0.4), MAT.marble);
    line(disc(x, y, 0.36), 0.035, MAT.bronze);
    fill(disc(x, y, 0.31), MAT.jade, { glow: 'rgb(255,0,0)' }); jadeVeins(disc(x, y, 0.31), 10);
    for (let p = 0; p < 8; p++) {
      const a = (p / 8) * TAU, ex = x + Math.cos(a) * 0.16 * k, ey = y + Math.sin(a) * 0.16 * k;
      carve((g) => { g.beginPath(); g.ellipse(ex, ey, 0.12 * k, 0.05 * k, a, 0, TAU); }, 0.014, 165, { a: 'rgba(176,212,200,.9)' });
    }
    carve(disc(x, y, 0.05), 0.02, 165);
    const [mx, my] = P(L.node, nodeAngle(n) + TAU / 16);
    carve(disc(mx, my, 0.16), 0.022, 160);
    for (let p = 0; p < 6; p++) { const a = (p / 6) * TAU; carve(disc(mx + Math.cos(a) * 0.09 * k, my + Math.sin(a) * 0.09 * k, 0.035), 0.012, 160); }
  }
  line(circle(L.edge), 0.1, MAT.bronze);
  line(circle(L.cart0), 0.07, MAT.bronze);
  // 3) 导流区（flow0 → cart0）：白石，八道盘旋刻槽，槽间卷云浮雕；分块接缝
  if (L.cart0 - L.flow0 > 0.3) for (let i = 0; i < 16; i++) carve(sector(L.flow0 + 0.04, L.cart0 - 0.04, (i / 16) * TAU, ((i + 1) / 16) * TAU), 0.01, 100, { a: 'rgba(168,170,160,.8)' });
  for (let n = 0; n < (chans ? L.nodes : 0); n++) {
    const chan = (g) => { g.beginPath(); for (let i = 0; i <= 90; i++) { const r = L.node - 0.32 - (L.node - 0.32 - L.flow0) * (i / 90), [x, y] = P(r, chanAngle(n, r)); if (i) g.lineTo(x, y); else g.moveTo(x, y); } };
    carve(chan, 0.13, 150);                                       // 槽沿略高
    carve(chan, 0.085, 62, { a: '#8b8d86', glow: 'rgb(255,0,0)' });   // 槽底
    for (const t of [0.35, 0.72]) {
      const r = L.flow0 + (L.cart0 - L.flow0) * t, am = chanAngle(n, r) + (TAU / L.nodes) * 0.5, [x, y] = P(r, am);
      relief(cloud(x, y, 0.3 - t * 0.06, -am + Math.PI / 2, t > 0.5 ? -1 : 1), 0.05, 180, 'rgba(214,210,198,.95)');
    }
  }
  line(circle(L.flow0), 0.07, MAT.bronze, { glow: 'rgb(0,90,0)' });
  // 4) 符文带（rune0 → rune1）：二十四块，每块篆刻一字
  const glyphs = '乾坤震巽坎离艮兑天地风雷水火山泽青岚聚灵纳气归元';
  for (let i = 0; i < NG; i++) carve(sector(L.rune0 + 0.03, L.rune1 - 0.03, (i / NG) * TAU + TAU / (2 * NG), ((i + 1) / NG) * TAU + TAU / (2 * NG)), 0.01, 100, { a: 'rgba(168,170,160,.8)' });
  const glyph = (g, ch, x, y, a, fs) => { g.save(); g.translate(x, y); g.rotate(-a + Math.PI / 2); g.font = `bold ${fs}px "STKaiti","KaiTi","Kaiti SC",serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 0, 0); g.restore(); };
  for (let i = 0; i < NG; i++) {
    const a = (i / NG) * TAU, [x, y] = P((L.rune0 + L.rune1) / 2, a), fs = Math.round(glyphFont * k);
    H.fillStyle = gray(72); glyph(H, glyphs[i], x, y, a, fs);
    A.fillStyle = 'rgba(92,90,82,.72)'; glyph(A, glyphs[i], x, y, a, fs);
    G.fillStyle = 'rgb(0,255,0)'; G.save(); G.scale(1, 1); glyph(G, glyphs[i], x, y, a, fs); G.restore();
  }
  line(circle(L.rune0), 0.06, MAT.bronze, { glow: 'rgb(0,90,0)' });
  // 5) 八卦青玉环（gua0 → gua1）：玉环上八格白石开光，开光内刻卦
  fill(annulus(L.gua0, L.gua1), MAT.jade); jadeVeins(annulus(L.gua0, L.gua1), 160);
  const tri = ['111', '110', '101', '100', '011', '010', '001', '000'];
  const gs = (L.gua1 - L.gua0) / 0.82;
  tri.forEach((t, n) => {
    const a = (n / 8) * TAU + Math.PI / 2, half = 0.2;
    const p = sector(L.gua0 + 0.1, L.gua1 - 0.1, a - half, a + half);
    fill(p, MAT.marble); carve(p, 0.025, 160);
    const [x, y] = P((L.gua0 + L.gua1) / 2, a);
    const bars = (g) => {
      g.save(); g.translate(x, y); g.rotate(-a + Math.PI / 2);
      for (let l = 0; l < 3; l++) {
        const yy = (-0.18 + l * 0.18) * gs * k, w = 0.6 * gs * k, h = 0.08 * gs * k;
        if (t[l] === '1') g.rect(-w / 2, yy - h / 2, w, h); else { g.rect(-w / 2, yy - h / 2, w * 0.42, h); g.rect(w * 0.08, yy - h / 2, w * 0.42, h); }
      }
      g.restore();
    };
    H.beginPath(); bars(H); H.fillStyle = gray(70); H.fill();
    A.beginPath(); bars(A); A.fillStyle = '#3f4744'; A.fill();
    G.beginPath(); bars(G); G.fillStyle = 'rgb(0,255,0)'; G.fill();
    // 开光之间：玉环上的小卷云
    const am = a + TAU / 16, [cx2, cy2] = P((L.gua0 + L.gua1) / 2, am);
    relief(cloud(cx2, cy2, 0.17 * gs, -am + Math.PI / 2), 0.026 * gs, 172, 'rgba(160,200,188,.95)');
  });
  line(circle(L.gua1 + 0.02), 0.06, MAT.bronze);
  line(circle(L.gua0 - 0.02), 0.06, MAT.bronze);
  // 6) 卷云浮雕环（core → scroll）：白石八块，连续卷云
  fill(annulus(L.core, L.scroll), MAT.marble);
  for (let i = 0; i < 8; i++) carve(sector(L.core + 0.03, L.scroll - 0.03, (i / 8) * TAU, ((i + 1) / 8) * TAU), 0.01, 100, { a: 'rgba(168,170,160,.8)' });
  for (let i = 0; i < 16; i++) {
    const am = (i / 16) * TAU + TAU / 32, [x, y] = P((L.core + L.scroll) / 2, am);
    const cs = (L.scroll - L.core) * 0.33;
    relief(cloud(x, y, cs, -am + Math.PI / 2, i % 2 ? -1 : 1), 0.05 * cs / 0.26, 182, 'rgba(214,210,198,.95)');
  }
  // 7) 阵心太极：黑石与白石（S 形分界刻线），阵眼铜圈
  const Rt = L.core - 0.08;
  fill(circle(Rt), MAT.marble);
  const yinPath = (g) => { g.beginPath(); g.arc(c, c, Rt * k, -Math.PI / 2, Math.PI / 2); g.arc(c, c + Rt * k / 2, Rt * k / 2, Math.PI / 2, -Math.PI / 2, true); g.arc(c, c - Rt * k / 2, Rt * k / 2, Math.PI / 2, -Math.PI / 2, false); g.closePath(); };
  fill(yinPath, MAT.dark);
  A.save(); yinPath(A); A.clip();
  for (let i = 0; i < 5000 * sd; i++) { const v = 60 + Math.random() * 60; A.fillStyle = `rgba(${v},${v + 3},${v + 2},${0.15 + Math.random() * 0.3})`; A.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  A.restore();
  carve(yinPath, 0.02, 104);
  fill(disc(c, c + Rt * k / 2, Rt / 6.5), MAT.dark);
  fill(disc(c, c - Rt * k / 2, Rt / 6.5), MAT.marble);
  line(disc(c, c + Rt * k / 2, Rt / 6.5 + 0.02), 0.03, MAT.bronze, { glow: 'rgb(0,200,0)' });
  line(disc(c, c - Rt * k / 2, Rt / 6.5 + 0.02), 0.03, MAT.bronze, { glow: 'rgb(0,200,0)' });
  line(circle(L.core), 0.1, MAT.bronze, { glow: 'rgb(0,255,0)' });
  line(circle(L.scroll + 0.02), 0.06, MAT.bronze);

  // 石面颗粒、斑驳（固有色的细微差异，不画光影）
  // 不裁剪（阵面网格本身就是圆形，贴图四角用不到；在大画布上逐笔裁剪极慢）
  A.save();
  for (let i = 0; i < 24000 * sd; i++) { const v = 150 + Math.random() * 90; A.fillStyle = `rgba(${v},${v - 3},${v - 10},${Math.random() * 0.1})`; const s = 1 + Math.random() * 3.5; A.fillRect(Math.random() * S, Math.random() * S, s, s); }
  for (let i = 0; i < 360; i++) { const v = 120 + Math.random() * 70; A.fillStyle = `rgba(${v},${v},${v - 8},.03)`; A.beginPath(); A.arc(Math.random() * S, Math.random() * S, 20 + Math.random() * 110, 0, TAU); A.fill(); }
  A.restore();
  H.save();
  for (let i = 0; i < 9000 * sd; i++) { const v = 118 + Math.random() * 20; H.fillStyle = `rgba(${v},${v},${v},.5)`; H.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
  H.restore();

  // 法线：高度图缩到一半（2 厘米一格仍够刻槽与浮雕）、略模糊后求梯度——载入时少算四分之三
  const NS = S >= 2048 ? S / 2 : S, hb = mk(NS), hbg = hb.getContext('2d');
  hbg.filter = `blur(${(1.6 * NS / S).toFixed(2)}px)`; hbg.drawImage(cH, 0, 0, NS, NS);
  const hd = hbg.getImageData(0, 0, NS, NS).data;
  const nCv = mk(NS), ng = nCv.getContext('2d'), img = ng.createImageData(NS, NS), od = img.data, st = 0.032 * S / NS;
  for (let y = 0; y < NS; y++) {
    const yu = y > 0 ? -NS : 0, yd = y < NS - 1 ? NS : 0;
    for (let x = 0; x < NS; x++) {
      const i = y * NS + x, xl = x > 0 ? -1 : 0, xr = x < NS - 1 ? 1 : 0;
      const dx = (hd[(i + xr) * 4] - hd[(i + xl) * 4]) * st, dy = (hd[(i + yu) * 4] - hd[(i + yd) * 4]) * st;
      const l = 1 / Math.sqrt(dx * dx + dy * dy + 1), o = i * 4;
      od[o] = (-dx * l * 0.5 + 0.5) * 255; od[o + 1] = (-dy * l * 0.5 + 0.5) * 255; od[o + 2] = (l * 0.5 + 0.5) * 255; od[o + 3] = 255;
    }
  }
  ng.putImageData(img, 0, 0);
  const tex = (cv, srgb, an = 8) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = an; return t; };
  return { map: tex(cA, true), normal: tex(nCv, false), orm: tex(cO, false, 4), glow: tex(cG, false, 4) };
}

// 着色器公共：极坐标下的阵纹发光（与贴图同一套版面）
const ARRAY_GLSL = /* glsl */ `
  #define TAU 6.2831853
  float ringLine(float r, float R, float w) { return smoothstep(w, 0., abs(r - R)); }
  float wrapA(float a) { return a - TAU * floor(a / TAU + .5); }
`;

export class QiVortex {
  constructor(scene, { x, y, z }) {
    this.level = 0.2; this.target = 0.2;   // 0.2 待机 → 1 修炼
    this.seq = 0; this.seqT = 0;           // 修炼开始后的节点次序（0 → 1，约 1.6 秒）
    this.on = false;
    const T = arrayTextures(L);
    this.u = { uTime: GLOBAL.uTime, uLevel: { value: this.level }, uSeq: { value: 0 }, uNight: FOGU.uNight, tGlow: { value: T.glow } };
    // 阵面：与铺地齐平的薄片（多边形偏移防闪烁），石 / 玉 / 铜分材质参数
    const mat = new THREE.MeshStandardMaterial({ map: T.map, normalMap: T.normal, normalScale: new THREE.Vector2(2.4, 2.4), roughnessMap: T.orm, metalnessMap: T.orm, roughness: 1, metalness: 1,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    registerEnvMat(mat);
    mat.onBeforeCompile = (sh) => {
      injectFog(sh);
      Object.assign(sh.uniforms, this.u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vP; varying vec2 vU0;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position.xy; vU0 = uv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uTime, uLevel, uSeq, uNight; uniform sampler2D tGlow; varying vec2 vP; varying vec2 vU0;
          ${ARRAY_GLSL}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            vec2 gm = texture2D(tGlow, vU0).rg;          // r：导流槽与节点玉心；g：环线、卦、符文、阵眼
            float r = length(vP), a = atan(vP.y, vP.x);
            float lv = uLevel, idle = .22;
            float nodes = 0., chans = 0.;
            for (int k = 0; k < ${L.nodes}; k++) {
              float fk = float(k);
              float na = fk / ${L.nodes}. * TAU + TAU / 16.;
              float lit = smoothstep(fk / ${L.nodes}. * .55, fk / ${L.nodes}. * .55 + .12, uSeq);
              vec2 np = vec2(cos(na), sin(na)) * ${L.node.toFixed(2)};
              float dn = length(vP - np);
              nodes += step(dn, .34) * (idle * .5 + lit * lv * 1.4);
              // 导流槽：盘旋向内；修炼时一道道光沿槽流向阵心
              if (r > ${L.flow0.toFixed(2)} - .05 && r < ${L.node.toFixed(2)} - .25) {
                float rc = min(r, ${L.cart0.toFixed(2)});
                float ca = na + ${L.twist.toFixed(2)} * (${L.cart0.toFixed(2)} - rc) / ${(L.cart0 - L.flow0).toFixed(2)};
                float d = abs(wrapA(a - ca)) * r;
                float p = (${(L.node - 0.32).toFixed(2)} - r) / ${(L.node - 0.32 - L.flow0).toFixed(2)};          // 0 节点 → 1 内端
                float front = clamp((uSeq - fk / ${L.nodes}. * .55 - .1) * 2.2, 0., 1.);       // 节点亮起后光向内推进
                float dash = smoothstep(.0, .25, fract(p * 2.5 - uTime * (.25 + lv * .9))) * smoothstep(1., .55, fract(p * 2.5 - uTime * (.25 + lv * .9)));
                chans += step(d, .2) * (idle * (.3 + .7 * dash) + lv * step(p, front) * (.45 + 1.1 * dash));
              }
            }
            float inner = smoothstep(.45, .85, uSeq);
            float pulse = .75 + .25 * sin(uTime * 1.6 - r * .9);
            float act = max(0., lv - .22) * 1.3;
            float glow = (nodes + chans) * gm.r + gm.g * act * inner * pulse;
            vec3 jade = mix(vec3(.30, .78, .66), vec3(.62, .95, .92), clamp(lv - .2, 0., 1.));
            totalEmissiveRadiance += jade * glow * (.5 + uNight * .7);
          }`);
    };
    mat.customProgramCacheKey = () => 'qi-array9';
    const top = new THREE.Mesh(new THREE.CircleGeometry(L.out, 160), mat);
    top.rotation.x = -Math.PI / 2;
    top.position.set(x, y + 0.012, z);
    top.receiveShadow = true;
    top.name = 'qi-array';
    scene.add(top);
    this.top = top;
    this._c = new THREE.Color();

    // 灵气流：沿导流槽向内汇聚，再自阵心盘旋升起（流入打坐者）；每道槽六粒，平时只剩微光
    const per = 6, n = L.nodes * per, seed = new Float32Array(n * 2), pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) seed.set([Math.floor(i / per), (i % per) / per + Math.random() * 0.08], i * 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
    this.flow = new THREE.Points(g, shaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexPars: `attribute vec2 aSeed; uniform float uTime, uLevel, uSeq; varying float vA; ${ARRAY_GLSL}`,
      vertex: `
        float k = aSeed.x;
        float na = k / ${L.nodes}. * TAU + TAU / 16.;
        float f = fract(aSeed.y + uTime * (.05 + uLevel * .16));
        vec3 p;
        if (f < .72) {                                   // 沿导流槽向内，再经符文带、八卦环到阵心
          float q = f / .72;
          float r = mix(${L.node.toFixed(2)}, .9, q);
          float rr = max(r, ${L.flow0.toFixed(2)});
          float a = na + ${L.twist.toFixed(2)} * (${L.node.toFixed(2)} - rr) / ${(L.node - L.flow0).toFixed(2)} + max(0., ${L.flow0.toFixed(2)} - r) * .35;
          p = vec3(cos(a) * r, .06, -sin(a) * r);
        } else {                                         // 自阵心盘旋升起，收向打坐者的丹田
          float q = (f - .72) / .28;
          float a = na + q * 5.5;
          float r = mix(.9, .25, q);
          p = vec3(cos(a) * r, .1 + q * 1.15, -sin(a) * r);
        }
        float lit = smoothstep(k / ${L.nodes}. * .55, k / ${L.nodes}. * .55 + .15, uSeq);
        vA = (.12 + .88 * uLevel * lit) * smoothstep(0., .05, f) * smoothstep(1., .9, f);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.);
        gl_PointSize = (3. + 3. * uLevel) * 16. / -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;`,
      fragmentPars: 'varying float vA;',
      fragment: 'float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(vec3(.45, .95, .82) * vA * .8 * pow(smoothstep(.5, .0, d), 1.6), 1.);',
    }));
    this.flow.position.set(x, y, z);
    this.flow.frustumCulled = false;
    this.flow.renderOrder = 4;
    scene.add(this.flow);

    // 阵心灵光：修炼时自台面升起的一圈柔光（低矮，不挡人）
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 1.3, 32, 1, true), shaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexPars: 'varying vec2 vUv;',
      vertex: 'vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mvPosition;',
      fragmentPars: 'uniform float uTime, uLevel, uSeq; varying vec2 vUv;',
      fragment: `
        float h = vUv.y;
        float k = smoothstep(1., .0, h) * smoothstep(0., .08, h) * (.6 + .4 * sin(vUv.x * 6.2832 * 3. + uTime * 2. - h * 6.));
        float a = k * uLevel * smoothstep(.75, 1., uSeq) * .055;
        gl_FragColor = vec4(vec3(.6, 1., .9) * a, 1.);`,
    }));
    col.position.set(x, y + 0.65, z);
    col.renderOrder = 5;
    scene.add(col);
    this.col = col;
  }

  boost(v) {
    this.on = !!v;
    this.target = v ? 1 : 0.2;
  }
  update(dt) {
    // 节点次序：修炼时约 1.6 秒推满，停止时约 1 秒退回；整体亮度平滑过渡
    this.seq = Math.min(1, Math.max(0, this.seq + (this.on ? dt / 1.6 : -dt / 1.0)));
    this.level += (this.target - this.level) * Math.min(1, dt * (this.on ? 2.2 : 1.2));
    this.u.uLevel.value = this.level;
    this.u.uSeq.value = this.seq;
    this.col.visible = this.level > 0.25;
    // 第十三轮：入夜后阵面的铜、玉少映一些天光（月下整片阵面泛白会盖过阵纹的灵光）
    this.top.material.envMapIntensity = 1 - 0.5 * FOGU.uNight.value;
  }
}
