// 第十五轮：演武场的布置。台地本身（天阶东侧、后山小径起头的草坡上开出的方台，东西 36 米、南北 24 米，台面 y 34）、
// 南沿石阶与改道的山径都在 layout.js（PADS.arena、SMALL_STEPS.toArena、PATHS.backhill），由地形与 sect.js 统一挖填、砌墙、设栏。
// 这里只放台上的东西：
//   台口牌坊（与天阶牌坊同一形制；正面「演武场」朝山径，背面「点到为止」朝场内）；
//   中央青石比试圈（贴地的画布纹样：外圈墨石带、内圈玉线、八卦、正中「武」字、双方站位）——切磋时双方都在圈内；
//   四角石灯（夜里自动登记为光源）、西侧兵器架与石锁、东侧战鼓、北沿两杆旗与石凳。比试圈以内不放任何东西，台沿陈设不挡打斗。
import * as THREE from 'three';
import { Builder, C } from './arch/builder.js';
import { gatePailou } from './arch/buildings.js';
import { stoneLanternR } from './arch/ornaments.js';
import * as P from './arch/props.js';
import { SITES } from './layout.js';

// 比试圈：圆心、半径；双方站位（圈心南北各 4.5 米，面对面）
export const ARENA = {
  cx: 56, cz: -115, r: 9.5, y: 34,
  spawnP: { x: 56, z: -110.5, yaw: Math.PI },          // 玩家：圈南，面朝北
  spawnO: { x: 56, z: -119.5, yaw: 0 },                 // 对手：圈北，面朝南
  gate: { x: 56, z: -104.2 },
};

function ringTexture() {
  const S = 1024, M = 22, k = S / M;                   // 22 米见方
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const c = S / 2, R = (m) => m * k;
  // 外圈墨石带
  g.lineWidth = R(0.5); g.strokeStyle = 'rgba(52, 58, 62, 0.92)';
  g.beginPath(); g.arc(c, c, R(9.5), 0, Math.PI * 2); g.stroke();
  g.lineWidth = R(0.07); g.strokeStyle = 'rgba(214, 196, 148, 0.9)';
  for (const r of [9.22, 9.78]) { g.beginPath(); g.arc(c, c, R(r), 0, Math.PI * 2); g.stroke(); }
  // 内圈玉线
  g.lineWidth = R(0.1); g.strokeStyle = 'rgba(96, 160, 140, 0.85)';
  g.beginPath(); g.arc(c, c, R(8.7), 0, Math.PI * 2); g.stroke();
  // 八卦（自正北顺时针：坎在北……按先天八卦摆放，只取形）
  const TRI = ['111', '011', '101', '001', '110', '010', '100', '000'];
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 4;
    g.save(); g.translate(c + Math.cos(a) * R(7.6), c + Math.sin(a) * R(7.6)); g.rotate(a + Math.PI / 2);
    g.fillStyle = 'rgba(58, 66, 70, 0.85)';
    TRI[i].split('').forEach((bit, j) => {
      const y = (j - 1) * R(0.32), w = R(1.5), h = R(0.16);
      if (bit === '1') g.fillRect(-w / 2, y - h / 2, w, h);
      else { g.fillRect(-w / 2, y - h / 2, w * 0.42, h); g.fillRect(w * 0.08, y - h / 2, w * 0.42, h); }
    });
    g.restore();
  }
  // 正中「武」字（圆框）
  g.lineWidth = R(0.08); g.strokeStyle = 'rgba(58, 66, 70, 0.8)';
  g.beginPath(); g.arc(c, c, R(1.75), 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(52, 58, 62, 0.82)';
  g.font = `${Math.round(R(2.2))}px "KaiTi","STKaiti","Kaiti SC",serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('武', c, c + R(0.08));
  // 双方站位：圈心南北各 4.5 米（画布向下为 +Z，即南）
  for (const dz of [4.5, -4.5]) {
    g.lineWidth = R(0.09); g.strokeStyle = 'rgba(96, 160, 140, 0.9)';
    g.beginPath(); g.arc(c, c + R(dz), R(0.55), 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(96, 160, 140, 0.35)';
    g.beginPath(); g.arc(c, c + R(dz), R(0.42), 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// 战鼓：朱红鼓身、牛皮鼓面、木架与两根鼓槌
function warDrum(b, x, y, z, ry) {
  b.push(x, y, z, ry);
  for (const s of [-1, 1]) {
    b.slab(0.12, 1.5, 0.12, C.woodDark, s * 0.62, 0, -0.3, { mat: 'wood' });
    b.slab(0.12, 1.5, 0.12, C.woodDark, s * 0.62, 0, 0.3, { mat: 'wood' });
    b.slab(0.12, 0.1, 0.72, C.woodDark, s * 0.62, 0.55, 0, { mat: 'wood', col: false });
  }
  b.slab(1.36, 0.1, 0.12, C.woodDark, 0, 0.2, -0.3, { mat: 'wood', col: false });
  b.slab(1.36, 0.1, 0.12, C.woodDark, 0, 0.2, 0.3, { mat: 'wood', col: false });
  b.cyl(0.62, 0.62, 0.95, C.vermilion, 0, 1.45, 0, { seg: 24, rz: Math.PI / 2, mat: 'wood' });
  for (const s of [-1, 1]) {
    b.cyl(0.6, 0.6, 0.03, 0xe6d8b8, s * 0.49, 1.45, 0, { seg: 24, rz: Math.PI / 2, col: false });
    b.cyl(0.645, 0.645, 0.05, C.gold, s * 0.43, 1.45, 0, { seg: 24, rz: Math.PI / 2, col: false, mat: 'gold' });
  }
  for (const s of [-1, 1]) b.cyl(0.025, 0.03, 0.62, C.woodLight, s * 0.18, 0.95, 0.42, { col: false, rx: 0.5, rz: s * 0.2, mat: 'wood' });
  b.collider(0, 0, 2.1, 0, 0.75, 0.5);
  b.pop();
}

export function buildArenaSite(ctx) {
  const y = SITES.arena.y, A = ARENA;
  const b = new Builder();
  // 台口牌坊：正面朝南（山径来的人），背面朝场内
  b.push(A.gate.x, y, A.gate.z, 0);
  gatePailou(b, { front: '演武场', back: '点到为止' });
  b.pop();
  // 四角石灯
  for (const [x, z] of [[39.8, -103.8], [72.2, -103.8], [39.8, -124.2], [72.2, -124.2]]) stoneLanternR(b, x, y, z, 1, 0);
  // 西侧兵器架、石锁（面朝场内）
  P.weaponRack(b, 40.9, y, -111.5, Math.PI / 2);
  P.weaponRack(b, 40.9, y, -118.5, Math.PI / 2);
  P.stoneWeights(b, 41.4, y, -115);
  // 东侧战鼓（面朝场内）
  warDrum(b, 71.4, y, -115, Math.PI / 2);
  // 北沿两杆旗、两条石凳（观战）
  P.flagpole(b, 42.5, y, -124.6, 0, '演武', 8.5);
  P.flagpole(b, 69.5, y, -124.6, 0, '青岚', 8.5);
  P.bench(b, 50.5, y, -124.4, 0, 2.6);
  P.bench(b, 61.5, y, -124.4, 0, 2.6);
  // 比试圈纹样（贴地，略高于铺地，不投影）
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshStandardMaterial({
    map: ringTexture(), transparent: true, depthWrite: false, roughness: 0.82, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(A.cx, y + 0.012, A.cz);
  ring.receiveShadow = true; ring.renderOrder = 1; ring.name = 'arena-ring';
  ctx.scene.add(ring);
  ctx.place(b, { name: '演武场' });
  ctx.anchors.arena = { ...A, y };
  return ring;
}
