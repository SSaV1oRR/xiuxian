// 水墨风格宗门舆图：山势晕染、林木点苔、溪池、台地、道路、屋宇与地名
import { CORE } from '../world/terrain.js';
import { PADS, PATHS, WALKS, PAVINGS, FIELD_PLOTS, ZONES, STAIRS, SECT_NAME } from '../world/layout.js';
import { clamp } from '../core/math.js';

// 世界坐标 → 底图像素（1 米 = k 像素）
export function makeProj(k) {
  return { k, w: Math.round((CORE.x1 - CORE.x0) * k), h: Math.round((CORE.z1 - CORE.z0) * k), x: (x) => (x - CORE.x0) * k, y: (z) => (z - CORE.z0) * k };
}

// 底图（不含地名）：返回 canvas
export function drawBaseMap(terrain, veg, footprints, k = 2) {
  const pr = makeProj(k);
  const cv = document.createElement('canvas');
  cv.width = pr.w; cv.height = pr.h;
  const g = cv.getContext('2d');
  // 山势：逐像素晕染（光从西北来）
  const img = g.createImageData(pr.w, pr.h), d = img.data;
  const step = 1 / k;
  const HH = new Float32Array(pr.w * pr.h);
  for (let j = 0; j < pr.h; j++) for (let i = 0; i < pr.w; i++) HH[j * pr.w + i] = terrain.heightAt(CORE.x0 + i * step, CORE.z0 + j * step);
  const at = (i, j) => HH[clamp(j, 0, pr.h - 1) * pr.w + clamp(i, 0, pr.w - 1)];
  for (let j = 0; j < pr.h; j++) {
    const z = CORE.z0 + j * step;
    for (let i = 0; i < pr.w; i++) {
      const x = CORE.x0 + i * step;
      const h = HH[j * pr.w + i];
      const hx = (at(i + k, j) - at(i - k, j)), hz = (at(i, j + k) - at(i, j - k));
      const shade = clamp(0.5 + (hx * 0.35 + hz * 0.35) * 0.5, 0, 1);
      const slope = clamp(Math.hypot(hx, hz) / 2, 0, 1.5);
      let r = 236, gg = 230, b = 214;
      const ink = clamp(slope * 0.42 + (1 - shade) * 0.22 + Math.max(0, h - 40) * 0.004, 0, 0.7);
      r -= ink * 150; gg -= ink * 146; b -= ink * 132;
      const m = terrain.maskAt(x, z);
      if (m.g > 0.4) { r = 244; gg = 240; b = 230; }
      if (m.b > 0.4) { r = 196; gg = 178; b = 140; }
      if (m.r > 0.5) { r = r * 0.9 + 18; gg = gg * 0.9 + 12; b = b * 0.9; }
      const w = terrain.waterAt(x, z);
      if (w != null && w - h > 0.15) { r = 160; gg = 188; b = 186; }
      const o = (j * pr.w + i) * 4;
      d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // 台地轮廓
  g.strokeStyle = 'rgba(70,64,54,.55)'; g.lineWidth = Math.max(1, k * 0.6);
  for (const p of PADS) {
    if (p.r != null) continue;
    g.strokeRect(pr.x(p.x0), pr.y(p.z0), (p.x1 - p.x0) * k, (p.z1 - p.z0) * k);
  }
  // 林木点苔
  if (veg) for (const [type, list] of Object.entries(veg.items)) {
    if (['grass', 'flower', 'leaves', 'bambooLeaf'].includes(type) || type.startsWith('mStump')) continue;
    for (const it of list) {
      const x = pr.x(it.x), y = pr.y(it.z);
      if (type === 'rock') { g.fillStyle = 'rgba(90,86,78,.5)'; g.fillRect(x - k * 0.5, y - k * 0.4, k * 1.1, k * 0.8); continue; }
      const r = (type === 'bamboo' ? 0.9 : type.startsWith('shrub') ? 0.7 : 1.5) * k * it.s;
      g.fillStyle = type === 'bamboo' ? 'rgba(84,104,70,.42)' : type === 'maple' ? 'rgba(150,80,56,.5)' : type === 'ginkgo' || type === 'goldTree' ? 'rgba(190,160,70,.55)'
        : type === 'sakura' ? 'rgba(206,140,160,.6)' : type === 'lilac' || type.startsWith('mJac') ? 'rgba(150,130,190,.55)' : 'rgba(52,64,54,.42)';
      g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); g.fill();
    }
  }
  // 台阶
  g.fillStyle = 'rgba(120,114,100,.85)';
  for (const s of STAIRS) {
    const z0 = Math.min(s.bottom[0], s.top[0]), z1 = Math.max(s.bottom[0], s.top[0]);
    if (s.corridor) {   // 爬山廊：深色屋顶带
      g.fillStyle = 'rgba(66,70,74,.9)'; g.fillRect(pr.x(s.x - s.w / 2 - 0.9), pr.y(z0), (s.w + 1.8) * k, (z1 - z0) * k);
      g.fillStyle = 'rgba(120,114,100,.85)';
      continue;
    }
    g.fillRect(pr.x(s.x - s.w / 2), pr.y(z0), s.w * k, (z1 - z0) * k);
    g.strokeStyle = 'rgba(244,240,230,.6)'; g.lineWidth = 1;
    for (let z = z0; z < z1; z += 1.2) { g.beginPath(); g.moveTo(pr.x(s.x - s.w / 2), pr.y(z)); g.lineTo(pr.x(s.x + s.w / 2), pr.y(z)); g.stroke(); }
  }
  // 山路
  for (const p of PATHS) {
    if (p.hidden) continue;                 // 隐秘小径（通往幽渊秘境）不画进舆图
    g.strokeStyle = p.kind === 'pave' ? 'rgba(110,102,88,.9)' : 'rgba(98,84,66,.85)';
    g.lineWidth = Math.max(1.5, (p.kind === 'pave' ? 1.1 : p.kind === 'faint' ? 0.45 : 0.7) * k * 1.4);
    g.setLineDash(p.kind === 'pave' ? [] : p.kind === 'faint' ? [k * 1.5, k * 2.5] : [k * 3, k * 1.6]);
    g.beginPath();
    p.pts.forEach(([x, z], i) => (i ? g.lineTo(pr.x(x), pr.y(z)) : g.moveTo(pr.x(x), pr.y(z))));
    g.stroke();
  }
  g.setLineDash([]);
  // 屋宇
  for (const f of footprints) {
    if (!f.w || f.kind === 'water') continue;              // 水面（灵池等）已由地形底图画出
    g.save();
    g.translate(pr.x(f.x), pr.y(f.z));
    g.rotate(-(f.ry || 0));
    const w = f.w * k, h = f.d * k;
    if (f.kind === 'bridge') { g.fillStyle = 'rgba(150,144,130,.95)'; g.fillRect(-w / 2, -h / 2, w, h); g.restore(); continue; }
    g.fillStyle = 'rgba(40,42,44,.22)'; g.fillRect(-w / 2 + k * 0.8, -h / 2 + k * 0.8, w, h);
    g.fillStyle = f.kind === 'major' ? 'rgba(66,70,74,.95)' : f.kind === 'prop' ? 'rgba(110,96,80,.85)' : 'rgba(84,88,90,.9)';
    g.fillRect(-w / 2, -h / 2, w, h);
    if (f.kind === 'major' || f.kind === 'house') { g.strokeStyle = 'rgba(230,226,214,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-w / 2 + 2, 0); g.lineTo(w / 2 - 2, 0); g.stroke(); }
    if (f.accent) { g.fillStyle = 'rgba(166,59,46,.85)'; g.fillRect(-w / 2, h / 2 - Math.max(1.5, k * 0.5), w, Math.max(1.5, k * 0.5)); }
    g.restore();
  }
  return { canvas: cv, proj: pr };
}

// 完整舆图：底图 + 题签、地名、标记
export function drawFullMap(g, W, H, base, { found = [], markers = [], player = null, title = true, guide = false } = {}) {
  const pr = base.proj;
  g.fillStyle = '#efe8d8'; g.fillRect(0, 0, W, H);
  const s = Math.min(W / pr.w, H / pr.h) * 0.96;
  const ox = (W - pr.w * s) / 2, oy = (H - pr.h * s) / 2;
  g.save();
  g.globalAlpha = 0.95;
  g.drawImage(base.canvas, ox, oy, pr.w * s, pr.h * s);
  g.restore();
  // 纸边晕
  const grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
  grad.addColorStop(0, 'rgba(239,232,216,0)'); grad.addColorStop(1, 'rgba(200,188,160,.55)');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  const X = (x) => ox + pr.x(x) * s, Y = (z) => oy + pr.y(z) * s;
  const fs = Math.max(11, Math.min(W, H) * 0.028);
  // 地名
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const zn of ZONES) {
    const known = found.includes(zn.id);
    if (zn.hidden && !known) continue;
    const x = X(zn.x), y = Y(zn.z);
    g.font = `${known ? 'bold ' : ''}${fs}px "STKaiti","KaiTi","Kaiti SC",serif`;
    const label = known || guide ? zn.name : '？？';
    const tw = g.measureText(label).width;
    g.fillStyle = 'rgba(244,239,228,.78)';
    g.fillRect(x - tw / 2 - 4, y - fs * 0.62, tw + 8, fs * 1.24);
    g.fillStyle = known || guide ? '#2b2a27' : 'rgba(43,42,39,.5)';
    g.fillText(label, x, y);
  }
  for (const m of markers) {
    const x = X(m.x), y = Y(m.z);
    g.fillStyle = m.color || '#a63b2e';
    g.beginPath(); g.arc(x, y, Math.max(5, fs * 0.42), 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = `bold ${Math.max(9, fs * 0.6)}px sans-serif`;
    g.fillText(m.icon || '!', x, y + 1);
    if (m.label) {
      g.font = `${fs * 0.85}px "STKaiti","KaiTi","Kaiti SC",serif`;
      const tw = g.measureText(m.label).width, ly = y + fs * 1.15;
      g.fillStyle = 'rgba(244,239,228,.82)'; g.fillRect(x - tw / 2 - 4, ly - fs * 0.55, tw + 8, fs * 1.1);
      g.fillStyle = m.color || '#a63b2e'; g.fillText(m.label, x, ly);
    }
  }
  if (player) {
    const x = X(player.x), y = Y(player.z);
    g.save(); g.translate(x, y); g.rotate(Math.atan2(player.dx, -player.dz));
    g.fillStyle = '#a63b2e'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    const r = Math.max(7, fs * 0.6);
    g.beginPath(); g.moveTo(0, -r * 1.3); g.lineTo(r * 0.8, r); g.lineTo(0, r * 0.5); g.lineTo(-r * 0.8, r); g.closePath(); g.fill(); g.stroke();
    g.restore();
    if (guide) {
      g.font = `bold ${fs * 0.9}px "STKaiti","KaiTi",serif`;
      g.fillStyle = '#a63b2e';
      g.fillText('此处', x + fs * 1.6, y);
    }
  }
  if (title) {
    // 题签
    const tw = fs * 1.6, th = fs * 6.2, tx = ox + fs * 0.9, ty = oy + fs * 4.6;
    g.fillStyle = 'rgba(248,244,234,.92)'; g.fillRect(tx, ty, tw, th);
    g.strokeStyle = '#2b2a27'; g.lineWidth = 1.5; g.strokeRect(tx, ty, tw, th);
    g.fillStyle = '#2b2a27'; g.font = `${fs * 1.05}px "STKaiti","KaiTi",serif`;
    [...`${SECT_NAME}全图`].forEach((c, i) => g.fillText(c, tx + tw / 2, ty + fs * 1.0 + i * fs * 1.15));
    g.fillStyle = '#a63b2e'; g.fillRect(tx + tw * 0.2, ty + th - fs * 1.2, tw * 0.6, tw * 0.6);
    // 指北
    g.save(); g.translate(ox + fs * 1.7, oy + fs * 2.6);
    g.strokeStyle = '#2b2a27'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -fs * 1.2); g.lineTo(fs * 0.45, fs * 0.5); g.lineTo(0, fs * 0.2); g.lineTo(-fs * 0.45, fs * 0.5); g.closePath(); g.stroke();
    g.fillStyle = '#2b2a27'; g.font = `${fs}px "STKaiti","KaiTi",serif`; g.fillText('北', 0, -fs * 1.9);
    g.restore();
  }
  return { X, Y, s };
}
