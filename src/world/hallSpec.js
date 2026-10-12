// 问道殿（第十一轮）：五层楼阁的统一尺寸表。外观（arch/tower11.js）与室内（hallInterior.js）都从这里取数，
// 门窗洞、楼面高、楼梯与楼板开洞一一对应。本地坐标：原点为殿身中心、一层楼面；+X 东，+Z 南（正面），Y 向上。
//
// 现状（第十轮的问道殿，素材模型 D ×0.94）：殿身（外墙与檐柱围合）主体 20.7 × 8.5 米 + 抱厦 6.6 × 6.1 米，占地约 216 平方米；
//   屋面投影 33.3 × 20.3 米；台基面到宝顶 22.3 米；外观重檐、室内一层。
// 「扩大 10 倍」按首层占地面积计：216 → 约 2,160 平方米（平面尺寸各约 √10 ≈ 3.16 倍）。长宽高各放大 10 倍会是 207 × 85 × 223 米，
//   比整个宗门核心区还大，不采用。高度不按比例放大，按五层的实际层高营造；门窗、瓦、斗拱、楼梯都用真实尺度的构件重新搭建。
// 本轮：首层 46 × 44 米（柱轴线，2,024 平方米）+ 抱厦 15.3 × 7 米（107 平方米）= 2,131 平方米，为原来的 9.9 倍；台基面到宝顶 53.9 米。
export const HALL = {
  x: 0, z: -216.5,                 // 殿身中心（世界坐标）
  ground: 58,                      // 云顶台地面
  y: 61,                           // 一层楼面（两层台基共 3 米）
  wallT: 0.5,                      // 外墙厚（以柱轴线为中线）
  slabT: 0.6,                      // 楼板（含梁）厚
  // 两层汉白玉台基：x 半宽，z0 / z1 为本地前后沿
  podium: [{ h: 1.5, x: 28.8, z0: -28.5, z1: 36.5 }, { h: 1.5, x: 25.6, z0: -25, z1: 33 }],
  // 五层：w 面阔、d 进深（柱轴线）、nb / nd 开间数、y 楼面（相对一层）、H 层高、col 檐柱高、win 窗台与窗顶
  levels: [
    { w: 46, d: 44, nb: 9, nd: 9, y: 0, H: 8, col: 5.6, win: [1.0, 4.6], name: '一层 · 问道大殿' },
    { w: 43, d: 41, nb: 9, nd: 9, y: 8, H: 7, col: 4.6, win: [0.9, 3.8], name: '二层 · 藏经阁' },
    { w: 40, d: 38, nb: 7, nd: 7, y: 15, H: 7, col: 4.6, win: [0.9, 3.8], name: '三层 · 法器阁' },
    { w: 37, d: 35, nb: 7, nd: 7, y: 22, H: 7, col: 4.6, win: [0.9, 3.8], name: '四层 · 静修堂' },
    { w: 34, d: 32, nb: 5, nd: 5, y: 29, H: 6.6, col: 5.2, win: [0.9, 4.2], name: '五层 · 观云阁' },
  ],
  // 各层四面每一开间的做法：wall 实墙、paper 糊纸槛窗、open 开启的窗（看得到窗外）、door 关着的隔扇门、main 正门（开启）
  bays: [
    { S: ['wall', 'open', 'paper', 'door', 'main', 'door', 'paper', 'open', 'wall'], N: ['wall', 'open', 'paper', 'wall', 'wall', 'wall', 'paper', 'open', 'wall'],
      E: ['wall', 'open', 'paper', 'paper', 'open', 'paper', 'paper', 'open', 'wall'], W: ['wall', 'open', 'paper', 'paper', 'open', 'paper', 'paper', 'open', 'wall'] },
    { all: ['wall', 'open', 'paper', 'paper', 'open', 'paper', 'paper', 'open', 'wall'] },
    { all: ['wall', 'open', 'paper', 'open', 'paper', 'open', 'wall'] },
    { all: ['wall', 'open', 'paper', 'open', 'paper', 'open', 'wall'] },
    { all: ['open', 'open', 'open', 'open', 'open'] },
  ],
  // 抱厦：正面居中三间（与一层开间对齐），进深 7 米
  porch: { d: 7, col: 5.0 },
  door: { w: 3.6, h: 4.6 },        // 正门洞（一层正面明间）
  // 楼梯间：东西各一座，叠放的双跑楼梯（第一跑向北、休息平台、第二跑向南回到楼梯口）；x0 / x1 为东侧一座的范围（西侧对称），
  // zs 为楼梯口（南端），flightW 梯段宽，gap 两跑之间的隔墙，landing 休息平台进深，rise / tread 踏步高与宽
  stairs: { x0: 11.0, x1: 16.2, zs: -5.5, flightW: 2.4, gap: 0.4, landing: 2.6, rise: 0.175, tread: 0.29 },
  // 中庭：二、三层楼板在殿心开洞（四层楼板封顶），一层仰望可见悬在中庭的浑天仪
  atrium: { x: 7.5, z0: -13, z1: 2, floors: [1, 2] },
};

export const N_LEVELS = HALL.levels.length;
// 本地 → 世界
export const hallWorld = (x, y, z) => ({ x: HALL.x + x, y: HALL.y + y, z: HALL.z + z });
// 第 l 层楼面的世界高度
export const floorY = (l) => HALL.y + HALL.levels[Math.max(0, Math.min(N_LEVELS - 1, l))].y;
// 世界高度 → 所在层（楼面以下 0.3 米内仍算本层）
export function levelAt(yWorld) {
  const y = yWorld - HALL.y;
  let l = 0;
  for (let i = 0; i < N_LEVELS; i++) if (y >= HALL.levels[i].y - 0.3) l = i;
  return l;
}
// 第 l 层顶板（上一层楼板）底面的本地高度；顶层为天花
export const ceilY = (l) => (l < N_LEVELS - 1 ? HALL.levels[l + 1].y - HALL.slabT : HALL.levels[l].y + HALL.levels[l].col + 0.4);

// 某层某面的开间做法表
export function bayKinds(l, side) {
  const B = HALL.bays[l];
  return B[side] || B.all;
}
// 某层某面各开间的中心（沿该面的本地坐标）与开间宽
export function bayCenters(l, side) {
  const L = HALL.levels[l], along = side === 'S' || side === 'N';
  const len = along ? L.w : L.d, n = along ? L.nb : L.nd, bw = len / n;
  return Array.from({ length: n }, (_, i) => ({ u: -len / 2 + (i + 0.5) * bw, bw }));
}

// 门窗洞：{ l, side, bay, kind, u（沿墙中心）, w（洞宽）, y0, y1（本地，相对一层楼面）, plane（墙轴线：南北面为 z，东西面为 x）, n（外法线） }
export function openings(l) {
  const L = HALL.levels[l], out = [];
  for (const side of ['S', 'N', 'E', 'W']) {
    const kinds = bayKinds(l, side), cs = bayCenters(l, side);
    const along = side === 'S' || side === 'N';
    const plane = side === 'S' ? L.d / 2 : side === 'N' ? -L.d / 2 : side === 'E' ? L.w / 2 : -L.w / 2;
    const n = side === 'S' ? [0, 1] : side === 'N' ? [0, -1] : side === 'E' ? [1, 0] : [-1, 0];
    kinds.forEach((kind, i) => {
      if (kind === 'wall') return;
      const { u, bw } = cs[i];
      let w, y0, y1;
      if (kind === 'main' || kind === 'door') { w = Math.min(HALL.door.w, bw - 1.0); y0 = 0; y1 = HALL.door.h; }
      else { w = Math.min(4.6, bw - 1.2); [y0, y1] = L.win; }
      out.push({ l, side, bay: i, kind, u, w, bw, y0: L.y + y0, y1: L.y + y1, plane, along, n });
    });
  }
  return out;
}
// 洞口四角（世界坐标），供视锥与屏幕投影
export function openingCorners(o) {
  const pts = [];
  for (const [a, b] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
    const u = o.u + a * o.w / 2, y = b ? o.y1 : o.y0;
    pts.push(o.along ? hallWorld(u, y, o.plane) : hallWorld(o.plane, y, u));
  }
  return pts;
}

// 第 l 层到 l+1 层的楼梯：两跑的踏步数、梯段长、休息平台位置、楼梯间范围（东侧；西侧取 x 的相反数）。
// 各层楼梯间取同一范围（按最长的一跑定进深，层高小的那几层休息平台相应加深），上下楼板的开洞因此完全重合
const flightRun = (l) => { const S = HALL.stairs, n = Math.round(HALL.levels[l].H / 2 / S.rise); return n * S.tread; };
const MAX_RUN = Math.max(...HALL.levels.slice(0, -1).map((_, l) => flightRun(l)));
export function stairGeom(l) {
  const S = HALL.stairs, H = HALL.levels[l].H;
  const n = Math.round(H / 2 / S.rise), rise = H / 2 / n, run = n * S.tread;
  const zTop = S.zs, zMid = S.zs - run, zN = S.zs - MAX_RUN - S.landing;
  return {
    n, rise, run, H, y0: HALL.levels[l].y,
    A: { x0: S.x0, x1: S.x0 + S.flightW },                               // 第一跑（自楼梯口向北上行）
    B: { x0: S.x0 + S.flightW + S.gap, x1: S.x1 },                       // 第二跑（自平台向南上行回到楼梯口）
    landing: { z0: zN, z1: zMid },
    box: { x0: S.x0, x1: S.x1, z0: zN, z1: zTop },                        // 楼梯间（上一层楼板在此开洞）
  };
}
// 第 l 层楼板的开洞（本地矩形 [x0, x1, z0, z1]）：下一层上来的两座楼梯间、中庭
export function slabHoles(l) {
  if (l === 0) return [];
  const g = stairGeom(l - 1), holes = [[g.box.x0, g.box.x1, g.box.z0, g.box.z1], [-g.box.x1, -g.box.x0, g.box.z0, g.box.z1]];
  const A = HALL.atrium;
  if (A.floors.includes(l)) holes.push([-A.x, A.x, A.z0, A.z1]);
  return holes;
}
