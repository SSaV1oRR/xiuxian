// 静态碰撞世界（沿用 demo/src/core/collision.js，新增 rayAll 用于镜头遮挡判断）：带偏航角的长方体（墙、房屋、台基、台阶、屋顶）与竖直圆柱（柱子、树干）
// 空间哈希加速；支持行走（台阶可跨、顶面可站立）、飞行（球体推挤）、相机射线。
// 约定与 three.js rotation.y 一致：本地 (lx, lz) → 世界 (lx·cos + lz·sin, -lx·sin + lz·cos)

const OFF = 32768;

export class CollisionWorld {
  constructor(cell = 24) {
    this.cell = cell;
    this.grid = new Map();
    this.stamp = 0;
    this.count = 0;
  }

  _keys(x0, z0, x1, z1) {
    const c = this.cell, out = [];
    const i0 = Math.floor(x0 / c), i1 = Math.floor(x1 / c), j0 = Math.floor(z0 / c), j1 = Math.floor(z1 / c);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push((i + OFF) * 65536 + (j + OFF));
    return out;
  }

  _insert(c, x0, z0, x1, z1) {
    c.cells = this._keys(x0, z0, x1, z1);
    for (const k of c.cells) {
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, (a = []));
      a.push(c);
    }
    this.count++;
    return c;
  }

  // o: { x, z, y0, y1, hx, hz, ry, walk=true, cam=true, tag, kind }；kind：素材殿阁的 'body'（墙、柱、殿内）/ 'eave'（檐），御剑碰撞用（见 solidCols.js）
  addBox(o) {
    const cos = Math.cos(o.ry || 0), sin = Math.sin(o.ry || 0);
    const c = { type: 0, x: o.x, z: o.z, y0: o.y0, y1: o.y1, hx: o.hx, hz: o.hz, cos, sin,
      walk: o.walk !== false, cam: o.cam !== false, tag: o.tag, kind: o.kind, stamp: 0 };
    const ex = Math.abs(cos) * o.hx + Math.abs(sin) * o.hz, ez = Math.abs(sin) * o.hx + Math.abs(cos) * o.hz;
    return this._insert(c, o.x - ex, o.z - ez, o.x + ex, o.z + ez);
  }

  // o: { x, z, y0, y1, r, walk=false, cam=false, tag }
  addCyl(o) {
    const c = { type: 1, x: o.x, z: o.z, y0: o.y0, y1: o.y1, r: o.r, walk: !!o.walk, cam: !!o.cam, tag: o.tag, stamp: 0 };
    return this._insert(c, o.x - o.r, o.z - o.r, o.x + o.r, o.z + o.r);
  }

  remove(c) {
    for (const k of c.cells) {
      const a = this.grid.get(k);
      if (!a) continue;
      const i = a.indexOf(c);
      if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); }
      if (!a.length) this.grid.delete(k);
    }
    c.cells = [];
    this.count--;
  }

  query(x0, z0, x1, z1, fn) {
    const s = ++this.stamp, cs = this.cell;
    const i0 = Math.floor(x0 / cs), i1 = Math.floor(x1 / cs), j0 = Math.floor(z0 / cs), j1 = Math.floor(z1 / cs);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const a = this.grid.get((i + OFF) * 65536 + (j + OFF));
        if (!a) continue;
        for (let n = 0; n < a.length; n++) {
          const c = a[n];
          if (c.stamp === s) continue;
          c.stamp = s;
          fn(c);
        }
      }
    }
  }

  // 脚下可站立的最高顶面（不高于 footY + step），没有则返回 -Infinity
  ground(x, z, footY, step = 0.55) {
    let g = -Infinity;
    this.query(x, z, x, z, (c) => {
      if (!c.walk || c.y1 > footY + step || c.y1 <= g) return;
      if (c.type === 0) {
        const dx = x - c.x, dz = z - c.z;
        const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
        if (Math.abs(lx) <= c.hx && Math.abs(lz) <= c.hz) g = c.y1;
      } else if ((x - c.x) ** 2 + (z - c.z) ** 2 <= c.r * c.r) g = c.y1;
    });
    return g;
  }

  // (x, z) 处可遮挡镜头的构筑物最高顶面（镜头避让用），没有则 -Infinity
  topAt(x, z) {
    let g = -Infinity;
    this.query(x, z, x, z, (c) => {
      if (!c.cam || c.type !== 0 || c.y1 <= g) return;
      const dx = x - c.x, dz = z - c.z;
      const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
      if (Math.abs(lx) <= c.hx + 0.3 && Math.abs(lz) <= c.hz + 0.3) g = c.y1;
    });
    return g;
  }

  // 头顶上方最近的底面（跳跃撞头）
  ceiling(x, z, headY) {
    let g = Infinity;
    this.query(x, z, x, z, (c) => {
      if (c.y0 < headY - 0.3 || c.y0 >= g) return;
      if (c.type === 0) {
        const dx = x - c.x, dz = z - c.z;
        const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
        if (Math.abs(lx) <= c.hx && Math.abs(lz) <= c.hz) g = c.y0;
      }
    });
    return g;
  }

  // 行走：圆柱形身体（半径 r、身高 h）水平推出障碍；低于 step 的台阶不算障碍
  pushCircle(p, r, h, step = 0.55) {
    let hit = false;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      this.query(p.x - r, p.z - r, p.x + r, p.z + r, (c) => {
        if (c.y1 <= p.y + step || c.y0 >= p.y + h) return;
        if (c.type === 0) {
          const dx = p.x - c.x, dz = p.z - c.z;
          const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
          const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
          let ox = lx - qx, oz = lz - qz;
          const d2 = ox * ox + oz * oz;
          if (d2 >= r * r) return;
          let px, pz;
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2), k = (r - d) / d;
            px = ox * k; pz = oz * k;
          } else {
            const penX = c.hx - Math.abs(lx), penZ = c.hz - Math.abs(lz);
            if (penX < penZ) { px = Math.sign(lx || 1) * (penX + r); pz = 0; } else { px = 0; pz = Math.sign(lz || 1) * (penZ + r); }
          }
          p.x += px * c.cos + pz * c.sin;
          p.z += -px * c.sin + pz * c.cos;
        } else {
          const dx = p.x - c.x, dz = p.z - c.z, R = r + c.r, d2 = dx * dx + dz * dz;
          if (d2 >= R * R) return;
          const d = Math.sqrt(d2) || 1e-4;
          p.x += (dx / d) * (R - d);
          p.z += (dz / d) * (R - d);
        }
        moved = hit = true;
      });
      if (!moved) break;
    }
    return hit;
  }

  // 飞行：球体推挤（c 为球心，会被修改）
  pushSphere(cpos, r) {
    let hit = false;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      this.query(cpos.x - r, cpos.z - r, cpos.x + r, cpos.z + r, (c) => {
        if (c.y1 <= cpos.y - r || c.y0 >= cpos.y + r) return;
        if (c.type === 0) {
          const dx = cpos.x - c.x, dz = cpos.z - c.z;
          const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
          const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
          const qy = Math.max(c.y0, Math.min(c.y1, cpos.y));
          const ox = lx - qx, oy = cpos.y - qy, oz = lz - qz;
          const d2 = ox * ox + oy * oy + oz * oz;
          if (d2 >= r * r) return;
          let px = 0, py = 0, pz = 0;
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2), k = (r - d) / d;
            px = ox * k; py = oy * k; pz = oz * k;
          } else {
            const pens = [c.hx - Math.abs(lx), c.hz - Math.abs(lz), c.y1 - cpos.y, cpos.y - c.y0];
            const m = pens.indexOf(Math.min(...pens));
            if (m === 0) px = Math.sign(lx || 1) * (pens[0] + r);
            else if (m === 1) pz = Math.sign(lz || 1) * (pens[1] + r);
            else if (m === 2) py = pens[2] + r;
            else py = -(pens[3] + r);
          }
          cpos.x += px * c.cos + pz * c.sin;
          cpos.z += -px * c.sin + pz * c.cos;
          cpos.y += py;
        } else {
          const dx = cpos.x - c.x, dz = cpos.z - c.z, R = r + c.r, d2 = dx * dx + dz * dz;
          if (d2 >= R * R) return;
          const d = Math.sqrt(d2) || 1e-4;
          cpos.x += (dx / d) * (R - d);
          cpos.z += (dz / d) * (R - d);
        }
        moved = hit = true;
      });
      if (!moved) break;
    }
    return hit;
  }

  // 射线（相机避让），返回最近命中距离；o/d 为 {x,y,z}，d 需归一化
  ray(o, d, maxT) {
    let best = maxT;
    const ex = o.x + d.x * maxT, ez = o.z + d.z * maxT;
    this.query(Math.min(o.x, ex), Math.min(o.z, ez), Math.max(o.x, ex), Math.max(o.z, ez), (c) => {
      if (!c.cam || c.type !== 0) return;
      const dx = o.x - c.x, dz = o.z - c.z;
      const lox = dx * c.cos - dz * c.sin, loz = dx * c.sin + dz * c.cos;
      const ldx = d.x * c.cos - d.z * c.sin, ldz = d.x * c.sin + d.z * c.cos;
      let t0 = -Infinity, t1 = Infinity;
      const slab = (oo, dd, lo, hi) => {
        if (Math.abs(dd) < 1e-9) return oo >= lo && oo <= hi;
        let a = (lo - oo) / dd, b = (hi - oo) / dd;
        if (a > b) { const t = a; a = b; b = t; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        return t0 <= t1;
      };
      if (!slab(lox, ldx, -c.hx, c.hx) || !slab(loz, ldz, -c.hz, c.hz) || !slab(o.y, d.y, c.y0, c.y1)) return;
      if (t0 > 0 && t0 < best) best = t0;   // 起点在体内（t0<0）时忽略
    });
    return best;
  }

  // 射线穿过的所有可遮挡长方体（cam=true），回调 (collider, t)
  rayAll(o, d, maxT, fn) {
    const ex = o.x + d.x * maxT, ez = o.z + d.z * maxT;
    this.query(Math.min(o.x, ex), Math.min(o.z, ez), Math.max(o.x, ex), Math.max(o.z, ez), (c) => {
      if (!c.cam || c.type !== 0) return;
      const dx = o.x - c.x, dz = o.z - c.z;
      const lox = dx * c.cos - dz * c.sin, loz = dx * c.sin + dz * c.cos;
      const ldx = d.x * c.cos - d.z * c.sin, ldz = d.x * c.sin + d.z * c.cos;
      let t0 = 0, t1 = maxT;
      const slab = (oo, dd, lo, hi) => {
        if (Math.abs(dd) < 1e-9) return oo >= lo && oo <= hi;
        let a = (lo - oo) / dd, b = (hi - oo) / dd;
        if (a > b) { const t = a; a = b; b = t; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        return t0 <= t1;
      };
      if (!slab(lox, ldx, -c.hx, c.hx) || !slab(loz, ldz, -c.hz, c.hz) || !slab(o.y, d.y, c.y0, c.y1)) return;
      fn(c, t0);
    });
  }
  // 把建筑本地碰撞体（相对建筑原点、未旋转）变换到世界并注册
  addLocal(list, px, py, pz, ry = 0, tag) {
    const c = Math.cos(ry), s = Math.sin(ry), out = [];
    for (const b of list) {
      const x = px + b.x * c + b.z * s, z = pz - b.x * s + b.z * c;
      if (b.type === 'cyl') out.push(this.addCyl({ x, z, y0: py + b.y0, y1: py + b.y1, r: b.r, walk: b.walk, cam: b.cam, tag }));
      else out.push(this.addBox({ x, z, y0: py + b.y0, y1: py + b.y1, hx: b.hx, hz: b.hz, ry: (b.ry || 0) + ry, walk: b.walk, cam: b.cam, tag, kind: b.kind }));
    }
    return out;
  }
}
