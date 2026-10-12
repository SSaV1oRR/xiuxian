// 御剑碰撞用的「分层实心柱」（第十三轮修订，取代原先只记最高面的俯视高度图）：
// 把殿阁、塔、岛上构筑物、石像香炉、山岩、崖壁的三角形按 1 米见方的格子逐列记下占据的高度区间。同一列里可以有好几段——
// 门洞上方的门楣与屋顶、檐下、廊下、桥下、拱下的空隙都保留着，低飞能穿过门洞、从檐下廊下桥下飞过；墙、柱、栏杆、殿身、
// 岩壁仍是挡人的实心段。（原来的俯视高度图一列只有一个最高面，门洞、檐下都被当成从地面一直实到屋顶，低飞会卡在门前。）
//   · 三角形先沿最长边对分到水平跨度不超过 3.5 米，再逐格做二维分离轴测试，只记真正盖到的格子；
//     墙这样的陡面取（细分后）三角形的高度范围，屋面、地面这样不陡的面取平面在格内的高度范围——墙、屋面、地面的薄壳就成了一段段区间
//   · 同一列里间隙小于 0.25 米的区间并成一段；每列最多 12 段（超过时把间隙最小的两段并起来）
//   · 殿身：素材殿阁、问道殿这些只有外壳、门窗洞里空着的模型，步行碰撞里挡人的殿身箱体所占的格从箱底实到该列构筑物的顶——
//     飞行进不了殿里（与步行一致），檐下、廊下（不在殿身箱体里）照旧飞得过
//   · 查询按身体的水平半径取覆盖到的格子：hit 与某高度范围相交的最高顶、ceil 头顶以上最近的底、floor 脚下最高的顶
export const COLS_GAP = 0.25;
const MAXN = 12;

export class SolidCols {
  constructor({ x0, x1, z0, z1, cell = 1, maxEdge = 3.5 }) {
    this.cell = cell; this.inv = 1 / cell; this.maxE = maxEdge;
    this.x0 = Math.floor(x0); this.z0 = Math.floor(z0);
    this.nx = Math.ceil((x1 - this.x0) * this.inv) + 1;
    this.nz = Math.ceil((z1 - this.z0) * this.inv) + 1;
    this.lists = new Array(this.nx * this.nz);
    this.tris = 0;
    this.ground = null;                                  // (x, z) → 地面高（岩石往下实到这里）
    this.gcache = new Float32Array(this.nx * this.nz).fill(NaN);
    this.fill = false;
    this.ready = false;
  }

  // 一份几何体的全部三角形（m：世界矩阵的 elements，单位矩阵可传 null）；fill：岩石（山岩、崖壁、叠石）是只有外皮的壳，
  // 每格从岩面一直实到地面（ground(x, z)），岩檐下、岩壳背后不留空
  addGeometry(geo, m = null, fill = false) {
    this.fill = fill;
    const P = geo.attributes.position, I = geo.index;
    if (!P) return;
    const inter = !!P.isInterleavedBufferAttribute;
    const pa = inter ? P.data.array : P.array, stride = inter ? P.data.stride : P.itemSize, off = inter ? P.offset : 0;
    const ia = I ? I.array : null, total = ia ? ia.length : P.count;
    const start = geo.drawRange.start, end = Math.min(total, start + geo.drawRange.count);
    const e = m;
    const v = this._v || (this._v = new Float64Array(9));
    for (let k = start; k + 2 < end; k += 3) {
      for (let j = 0; j < 3; j++) {
        const o = (ia ? ia[k + j] : k + j) * stride + off;
        const x = pa[o], y = pa[o + 1], z = pa[o + 2];
        if (e) { v[j * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; v[j * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; v[j * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]; }
        else { v[j * 3] = x; v[j * 3 + 1] = y; v[j * 3 + 2] = z; }
      }
      this.tri(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], 0);
    }
  }

  tri(ax, ay, az, bx, by, bz, cx, cy, cz, depth) {
    let minx = ax, maxx = ax, minz = az, maxz = az;
    if (bx < minx) minx = bx; else if (bx > maxx) maxx = bx;
    if (cx < minx) minx = cx; else if (cx > maxx) maxx = cx;
    if (bz < minz) minz = bz; else if (bz > maxz) maxz = bz;
    if (cz < minz) minz = cz; else if (cz > maxz) maxz = cz;
    const c = this.cell, x0 = this.x0, z0 = this.z0, nx = this.nx, nz = this.nz;
    if (maxx < x0 || minx > x0 + nx * c || maxz < z0 || minz > z0 + nz * c) return;
    if ((maxx - minx > this.maxE || maxz - minz > this.maxE) && depth < 16) {
      const lab = (ax - bx) * (ax - bx) + (az - bz) * (az - bz), lbc = (bx - cx) * (bx - cx) + (bz - cz) * (bz - cz), lca = (cx - ax) * (cx - ax) + (cz - az) * (cz - az);
      if (lab >= lbc && lab >= lca) {
        const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5, mz = (az + bz) * 0.5;
        this.tri(ax, ay, az, mx, my, mz, cx, cy, cz, depth + 1); this.tri(mx, my, mz, bx, by, bz, cx, cy, cz, depth + 1);
      } else if (lbc >= lca) {
        const mx = (bx + cx) * 0.5, my = (by + cy) * 0.5, mz = (bz + cz) * 0.5;
        this.tri(ax, ay, az, bx, by, bz, mx, my, mz, depth + 1); this.tri(ax, ay, az, mx, my, mz, cx, cy, cz, depth + 1);
      } else {
        const mx = (cx + ax) * 0.5, my = (cy + ay) * 0.5, mz = (cz + az) * 0.5;
        this.tri(ax, ay, az, bx, by, bz, mx, my, mz, depth + 1); this.tri(mx, my, mz, bx, by, bz, cx, cy, cz, depth + 1);
      }
      return;
    }
    this.tris++;
    let y0 = ay, y1 = ay;
    if (by < y0) y0 = by; else if (by > y1) y1 = by;
    if (cy < y0) y0 = cy; else if (cy > y1) y1 = cy;
    const inv = this.inv;
    let i0 = Math.floor((minx - x0) * inv), i1 = Math.floor((maxx - x0) * inv), j0 = Math.floor((minz - z0) * inv), j1 = Math.floor((maxz - z0) * inv);
    if (i0 < 0) i0 = 0; if (j0 < 0) j0 = 0; if (i1 >= nx) i1 = nx - 1; if (j1 >= nz) j1 = nz - 1;
    if (i0 === i1 && j0 === j1) { this.ins(j0 * nx + i0, y0, y1); return; }
    // 不陡的面（屋面、坡道、地面）：每格按平面在格内的高度范围记，而不是整片三角形的高度范围（檐下的空隙才不会被填掉）
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const pnx = uy * vz - uz * vy, pny = uz * vx - ux * vz, pnz = ux * vy - uy * vx;
    const pl = Math.sqrt(pnx * pnx + pny * pny + pnz * pnz);
    const plane = pl > 1e-12 && Math.abs(pny) > 0.35 * pl;
    const gx = plane ? -pnx / pny : 0, gz = plane ? -pnz / pny : 0, spread = (Math.abs(gx) + Math.abs(gz)) * c * 0.5;
    // 三条边的法向（分离轴）：只算一次
    const n1x = az - bz, n1z = bx - ax, n2x = bz - cz, n2z = cx - bx, n3x = cz - az, n3z = ax - cx;
    const d1a = n1x * ax + n1z * az, d1c = n1x * cx + n1z * cz, d2b = n2x * bx + n2z * bz, d2a = n2x * ax + n2z * az, d3c = n3x * cx + n3z * cz, d3b = n3x * bx + n3z * bz;
    const h = c * 0.5, e1 = (Math.abs(n1x) + Math.abs(n1z)) * h, e2 = (Math.abs(n2x) + Math.abs(n2z)) * h, e3 = (Math.abs(n3x) + Math.abs(n3z)) * h;
    const lo1 = d1a < d1c ? d1a : d1c, hi1 = d1a < d1c ? d1c : d1a, lo2 = d2b < d2a ? d2b : d2a, hi2 = d2b < d2a ? d2a : d2b, lo3 = d3c < d3b ? d3c : d3b, hi3 = d3c < d3b ? d3b : d3c;
    for (let j = j0; j <= j1; j++) {
      const hz = z0 + j * c + h;
      for (let i = i0; i <= i1; i++) {
        const hx = x0 + i * c + h;
        if (e1 > 1e-9) { const b = n1x * hx + n1z * hz; if (b + e1 < lo1 - 1e-9 || b - e1 > hi1 + 1e-9) continue; }
        if (e2 > 1e-9) { const b = n2x * hx + n2z * hz; if (b + e2 < lo2 - 1e-9 || b - e2 > hi2 + 1e-9) continue; }
        if (e3 > 1e-9) { const b = n3x * hx + n3z * hz; if (b + e3 < lo3 - 1e-9 || b - e3 > hi3 + 1e-9) continue; }
        if (plane) {
          const yc = ay + gx * (hx - ax) + gz * (hz - az);
          const lo = yc - spread > y0 ? yc - spread : y0, hi = yc + spread < y1 ? yc + spread : y1;
          this.ins(j * nx + i, lo < hi ? lo : hi, hi > lo ? hi : lo);
        } else this.ins(j * nx + i, y0, y1);
      }
    }
  }

  ins(ci, a, b) {
    if (this.fill && this.ground) {
      let g = this.gcache[ci];
      if (g !== g) { const i = ci % this.nx, j = (ci - i) / this.nx; g = this.gcache[ci] = this.ground(this.x0 + (i + 0.5) * this.cell, this.z0 + (j + 0.5) * this.cell); }
      if (g - 0.3 < a) a = g - 0.3;
      if (b < a) b = a;
    }
    const L = this.lists[ci];
    if (!L) { this.lists[ci] = [a, b]; return; }
    for (let k = 0; k < L.length; k += 2) {
      if (a <= L[k + 1] + COLS_GAP && b >= L[k] - COLS_GAP) {
        if (a < L[k]) L[k] = a;
        if (b > L[k + 1]) L[k + 1] = b;
        return;
      }
    }
    L.push(a, b);
    if (L.length > MAXN * 4) tidy(L, MAXN * 2);
  }

  // 步行碰撞的一个长方体（带偏航）当实心：格心落在箱内、且已有构筑物的格，从箱底实到 toTop ? 该列最高的顶 : min(箱顶, 该列最高的顶)
  fillBox(c, toTop) {
    const inv = this.inv, h = this.cell * 0.5;
    const ex = Math.abs(c.cos) * c.hx + Math.abs(c.sin) * c.hz, ez = Math.abs(c.sin) * c.hx + Math.abs(c.cos) * c.hz;
    const i0 = Math.max(0, Math.floor((c.x - ex - this.x0) * inv)), i1 = Math.min(this.nx - 1, Math.floor((c.x + ex - this.x0) * inv));
    const j0 = Math.max(0, Math.floor((c.z - ez - this.z0) * inv)), j1 = Math.min(this.nz - 1, Math.floor((c.z + ez - this.z0) * inv));
    this.fill = false;
    let n = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = this.x0 + i * this.cell + h - c.x, dz = this.z0 + j * this.cell + h - c.z;
      if (Math.abs(dx * c.cos - dz * c.sin) > c.hx || Math.abs(dx * c.sin + dz * c.cos) > c.hz) continue;
      const ci = j * this.nx + i, L = this.lists[ci];
      if (!L) continue;
      let t = -Infinity;
      for (let k = 1; k < L.length; k += 2) if (L[k] > t) t = L[k];
      if (!toTop && t > c.y1) t = c.y1;
      if (t > c.y0 + 0.3) { this.ins(ci, c.y0, t); n++; }
    }
    return n;
  }

  // 整理并压成定长数组（之后只读）
  finish() {
    const N = this.nx * this.nz;
    this.start = new Int32Array(N).fill(-1);
    this.count = new Uint8Array(N);
    let total = 0;
    for (let i = 0; i < N; i++) { const L = this.lists[i]; if (L) { tidy(L, MAXN); total += L.length; } }
    this.data = new Float32Array(total);
    let p = 0;
    for (let i = 0; i < N; i++) {
      const L = this.lists[i];
      if (!L) continue;
      this.start[i] = p; this.count[i] = L.length / 2;
      for (let k = 0; k < L.length; k++) this.data[p++] = L[k];
    }
    this.columns = this.start.reduce((s, v) => s + (v >= 0 ? 1 : 0), 0);
    this.lists = null; this.gcache = null;
    this.ready = true;
    return this;
  }

  _range(x, z, r) {
    const inv = this.inv;
    const i0 = Math.max(0, Math.floor((x - r - this.x0) * inv)), i1 = Math.min(this.nx - 1, Math.floor((x + r - this.x0) * inv));
    const j0 = Math.max(0, Math.floor((z - r - this.z0) * inv)), j1 = Math.min(this.nz - 1, Math.floor((z + r - this.z0) * inv));
    return [i0, i1, j0, j1];
  }

  // 半径 r 内与高度范围 [y0, y1] 相交的区间里最高的顶（没有相交则 -Infinity）
  hit(x, z, r, y0, y1) {
    if (!this.ready) return -Infinity;
    const [i0, i1, j0, j1] = this._range(x, z, r), D = this.data;
    let top = -Infinity;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const ci = j * this.nx + i, s = this.start[ci];
      if (s < 0) continue;
      for (let k = s, e = s + this.count[ci] * 2; k < e; k += 2) if (D[k + 1] > y0 && D[k] < y1 && D[k + 1] > top) top = D[k + 1];
    }
    return top;
  }

  // 半径 r 内、底不低于 y 的区间里最低的底（头顶的天花；没有则 Infinity）
  ceil(x, z, r, y) {
    if (!this.ready) return Infinity;
    const [i0, i1, j0, j1] = this._range(x, z, r), D = this.data;
    let c = Infinity;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const ci = j * this.nx + i, s = this.start[ci];
      if (s < 0) continue;
      for (let k = s, e = s + this.count[ci] * 2; k < e; k += 2) if (D[k] >= y && D[k] < c) c = D[k];
    }
    return c;
  }

  // 半径 r 内、顶不高于 y 的区间里最高的顶（脚下构筑物的顶面；没有则 -Infinity）
  floor(x, z, r, y) {
    if (!this.ready) return -Infinity;
    const [i0, i1, j0, j1] = this._range(x, z, r), D = this.data;
    let f = -Infinity;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const ci = j * this.nx + i, s = this.start[ci];
      if (s < 0) continue;
      for (let k = s, e = s + this.count[ci] * 2; k < e; k += 2) if (D[k + 1] <= y && D[k + 1] > f) f = D[k + 1];
    }
    return f;
  }

  // 点是否落在某段实心区间里（镜头避让用）
  inside(x, y, z) {
    if (!this.ready) return false;
    const i = Math.floor((x - this.x0) * this.inv), j = Math.floor((z - this.z0) * this.inv);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return false;
    const ci = j * this.nx + i, s = this.start[ci];
    if (s < 0) return false;
    const D = this.data;
    for (let k = s, e = s + this.count[ci] * 2; k < e; k += 2) if (y >= D[k] && y <= D[k + 1]) return true;
    return false;
  }

  // 该列最高的顶（没有则 -Infinity）
  top(x, z) {
    if (!this.ready) return -Infinity;
    const i = Math.floor((x - this.x0) * this.inv), j = Math.floor((z - this.z0) * this.inv);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -Infinity;
    const ci = j * this.nx + i, s = this.start[ci];
    if (s < 0) return -Infinity;
    let t = -Infinity;
    for (let k = s, e = s + this.count[ci] * 2; k < e; k += 2) if (this.data[k + 1] > t) t = this.data[k + 1];
    return t;
  }
}

// 排序、合并相交与相近（间隙 < COLS_GAP）的区间（原地，数组是 [a0, b0, a1, b1, …]）；超过 max 段时逐次并掉间隙最小的两段
function tidy(L, max) {
  const n = L.length >> 1;
  for (let i = 1; i < n; i++) {
    const a = L[i * 2], b = L[i * 2 + 1];
    let j = i - 1;
    while (j >= 0 && L[j * 2] > a) { L[(j + 1) * 2] = L[j * 2]; L[(j + 1) * 2 + 1] = L[j * 2 + 1]; j--; }
    L[(j + 1) * 2] = a; L[(j + 1) * 2 + 1] = b;
  }
  let w = 0;
  for (let i = 0; i < n; i++) {
    const a = L[i * 2], b = L[i * 2 + 1];
    if (w > 0 && a <= L[w * 2 - 1] + COLS_GAP) { if (b > L[w * 2 - 1]) L[w * 2 - 1] = b; }
    else { L[w * 2] = a; L[w * 2 + 1] = b; w++; }
  }
  while (w > max) {
    let bi = 0, bg = Infinity;
    for (let k = 0; k + 1 < w; k++) { const g = L[(k + 1) * 2] - L[k * 2 + 1]; if (g < bg) { bg = g; bi = k; } }
    if (L[(bi + 1) * 2 + 1] > L[bi * 2 + 1]) L[bi * 2 + 1] = L[(bi + 1) * 2 + 1];
    for (let k = bi + 1; k + 1 < w; k++) { L[k * 2] = L[(k + 1) * 2]; L[k * 2 + 1] = L[(k + 1) * 2 + 1]; }
    w--;
  }
  L.length = w * 2;
}

// 场景里哪些网格进分层实心柱：殿阁（合批后的、素材殿阁、问道殿等）、塔与岛上构筑物、石像香炉等摆件、崖壁、玉柱；
// 不收地形（取高另有地形函数）、水、云雾、植被、人物、龙、鹤、花瓣灵光、贴地光晕、浮空岛岛体（岛体另有实心判定）、
// 半透明与加色的东西、只在近处画的细部（斗拱、门钉这类小件，都贴在大构件上）。山岩（实例化、按距离分细节）另按实例矩阵加入。
const SKIP = /^(terrain|veg-|vegetation|water|clouds?$|cloud-sea|valley-|mist|dragon-|cranes?$|lotus|flames|petals?|motes?|lawn|night-light|shadow-proxy|sky|stars|moon|qi-array|lingchi-water|plunge-pool|palace-lanterns|crags|tower-clouds|falls?$|waterfall|trail|isle$)/i;
export function collectSolidMeshes(scene) {
  const out = [];
  const visit = (o, skip) => {
    if (o.isPoints || o.isLine || o.isSprite || o.isSkinnedMesh) return;
    const name = o.name || '';
    if (skip || SKIP.test(name) || o.userData?.npc || o.userData?.noSolid) return;
    if (o.isMesh && !o.userData?.detail) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      const opaque = ms.some((m) => m && !m.transparent && m.blending === 1 && m.visible !== false && !m.isShaderMaterial);
      if (opaque) out.push(o);
    }
    for (const ch of o.children) visit(ch, false);
  };
  for (const ch of scene.children) visit(ch, false);
  return out;
}

export function bakeSolidCols(scene, { bounds, crags = null, maxEdge = 3.5, ground = null, cw = null } = {}) {
  const t0 = performance.now();
  const meshes = collectSolidMeshes(scene);
  // 覆盖范围：收进来的网格与山岩的世界包围盒之并，再夹到 bounds（飞行范围）以内
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const grow = (bb, m) => {
    for (const cx of [bb.min.x, bb.max.x]) for (const cy of [bb.min.y, bb.max.y]) for (const cz of [bb.min.z, bb.max.z]) {
      const e = m.elements, x = e[0] * cx + e[4] * cy + e[8] * cz + e[12], z = e[2] * cx + e[6] * cy + e[10] * cz + e[14];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
  };
  for (const o of meshes) {
    o.updateWorldMatrix(true, false);
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    if (o.isInstancedMesh) { if (!o.boundingBox) o.computeBoundingBox(); grow(o.boundingBox, o.matrixWorld); } else grow(o.geometry.boundingBox, o.matrixWorld);
  }
  const cg = crags?.geos?.[3];
  if (cg && crags.items?.length) { if (!cg.boundingBox) cg.computeBoundingBox(); for (const it of crags.items) grow(cg.boundingBox, it.m); }
  const S = new SolidCols({ x0: Math.max(bounds.x0, x0 - 2), x1: Math.min(bounds.x1, x1 + 2), z0: Math.max(bounds.z0, z0 - 2), z1: Math.min(bounds.z1, z1 + 2), maxEdge });
  const ident = (e) => e[0] === 1 && e[5] === 1 && e[10] === 1 && e[15] === 1 && !e[1] && !e[2] && !e[4] && !e[6] && !e[8] && !e[9] && !e[12] && !e[13] && !e[14];
  S.ground = ground;
  const ROCK = /^(cliff|lingchi-rockery|rockery)/i;
  const im = new (meshes[0]?.matrixWorld.constructor || Object)();
  for (const o of meshes) {
    const fill = ROCK.test(o.name || '');
    if (o.isInstancedMesh) {
      for (let k = 0; k < o.count; k++) {
        o.getMatrixAt(k, im);
        im.premultiply(o.matrixWorld);
        S.addGeometry(o.geometry, im.elements, fill);
      }
    } else S.addGeometry(o.geometry, ident(o.matrixWorld.elements) ? null : o.matrixWorld.elements, fill);
  }
  // 山岩：每块按最粗一级的细节（形体一致、面数最少），从岩面实到地面
  if (crags?.items?.length && crags.geos) {
    const g = crags.geos[3] || crags.geos[crags.geos.length - 1];
    for (const it of crags.items) S.addGeometry(g, it.m.elements, true);
  }
  // 殿身：步行碰撞里挡人又遮镜头的箱体（素材殿阁的墙柱殿内、问道殿各层殿身与檐下挡板、塔身、栏杆……）；素材殿阁的檐（kind 'eave'）不算。
  // 素材殿阁的殿身实到该列的屋顶（上层望楼也进不去），其余的实到箱顶为止（箱顶以上仍按几何）
  let bodies = 0;
  if (cw) {
    const seen = new Set();
    for (const a of cw.grid.values()) for (const c of a) {
      if (seen.has(c)) continue;
      seen.add(c);
      if (c.type !== 0 || c.walk || !c.cam || c.kind === 'eave') continue;
      if (S.fillBox(c, c.kind === 'body')) bodies++;
    }
  }
  S.finish();
  S.ms = Math.round(performance.now() - t0);
  S.meshes = meshes.length;
  S.bodies = bodies;
  return S;
}
