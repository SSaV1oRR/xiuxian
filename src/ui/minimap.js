// 小地图：随镜头旋转（镜头前方朝上），显示人物、委托目标与玩家朝向
export class Minimap {
  constructor(base, el) {
    this.base = base;
    this.cv = el.querySelector('canvas');
    this.g = this.cv.getContext('2d');
    this.north = el.querySelector('.mm-n');
    this.el = el;
    this.range = 70;    // 半径（米）
  }
  draw(player, camFwd, npcs, targets) {
    const g = this.g, W = this.cv.width, H = this.cv.height, cx = W / 2, cy = H / 2;
    const pr = this.base.proj, k = pr.k;
    const scale = (W / 2) / this.range;               // 像素/米
    const rot = -Math.PI / 2 - Math.atan2(camFwd.z, camFwd.x);
    g.save();
    g.fillStyle = '#e9e2d0'; g.fillRect(0, 0, W, H);
    g.beginPath(); g.arc(cx, cy, W / 2, 0, Math.PI * 2); g.clip();
    g.translate(cx, cy);
    g.rotate(rot);
    g.scale(scale / k, scale / k);
    g.drawImage(this.base.canvas, -pr.x(player.x), -pr.y(player.z));
    g.restore();
    const toS = (x, z) => {
      const dx = (x - player.x) * scale, dz = (z - player.z) * scale;
      const c = Math.cos(rot), s = Math.sin(rot);
      return [cx + dx * c - dz * s, cy + dx * s + dz * c];
    };
    // 人物
    for (const n of npcs) {
      const [x, y] = toS(n.x, n.z);
      if ((x - cx) ** 2 + (y - cy) ** 2 > (W / 2 - 8) ** 2) continue;
      g.fillStyle = n.mark ? '#a63b2e' : 'rgba(43,42,39,.75)';
      g.beginPath(); g.arc(x, y, n.mark ? 7 : 4.5, 0, Math.PI * 2); g.fill();
      if (n.mark) { g.fillStyle = '#fff'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n.mark, x, y + 0.5); }
    }
    // 目标（超出范围则贴边）
    for (const t of targets) {
      let [x, y] = toS(t.x, t.z);
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), R = W / 2 - 14;
      if (d > R) { x = cx + (dx / d) * R; y = cy + (dy / d) * R; }
      g.fillStyle = t.color || '#a63b2e';
      g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold 12px "KaiTi",serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t.icon, x, y + 0.5);
    }
    // 玩家（朝向相对镜头）
    const ph = player.heading - Math.atan2(camFwd.x, camFwd.z);
    g.save(); g.translate(cx, cy); g.rotate(-ph);
    g.fillStyle = '#a63b2e'; g.strokeStyle = '#fff'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, -13); g.lineTo(9, 10); g.lineTo(0, 5); g.lineTo(-9, 10); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // 外圈
    g.strokeStyle = 'rgba(43,42,39,.35)'; g.lineWidth = 3;
    g.beginPath(); g.arc(cx, cy, W / 2 - 2, 0, Math.PI * 2); g.stroke();
    // 指北
    const na = rot - Math.PI / 2, R = this.el.clientWidth / 2 - 11;
    this.north.style.left = `${this.el.clientWidth / 2 + Math.cos(na) * R}px`;
    this.north.style.top = `${this.el.clientWidth / 2 + Math.sin(na) * R - 9}px`;
  }
}
