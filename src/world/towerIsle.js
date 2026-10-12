// 通天塔岛（第十三轮）：后山东北谷中的一座孤岛，与松涛岛隔着约 160 米，自宗门御剑向东北偏北飞约一千米即到。
// 岛体与浮空岛同一做法（顶面、岛沿崖带、倒垂的岛底），轮廓收得更圆、岛心削成平台：三层石台基、塔前广场都落在平台上，
// 塔基完整，不悬空、不穿插。岛上：
//   · 通天塔（arch/tower100.js）；
//   · 塔前广场：台基踏道之下一片汉白玉方砖，四角石灯；广场南部一座传送阵（安全到达点在阵北、面朝塔门）；
//   · 岛沿几株古松；
//   · 云：塔身中段（约 120–150 米）与高处（约 270–290 米）各有几团，偏在塔的不同方位——从不同方向看去，露出、遮住的部分
//     各不相同；塔门、部分中段塔身与塔刹的轮廓始终可辨。云团用公告板，镜头靠近时淡出，不挡飞行视线。
import * as THREE from 'three';
import { Builder, C } from './arch/builder.js';
import { stoneLanternR } from './arch/ornaments.js';
import { teleportArray } from './arch/portal.js';
import { towerOfHeaven } from './arch/tower100.js';
import { isleGeometry, IsleBody, ISLE_MAT } from './isles.js';
import { TOWER, TOTAL_H } from './towerSpec.js';
import { mulberry32 } from '../core/math.js';

export class TowerIsle {
  constructor(scene, veg) {
    const T = TOWER, I = T.isle;
    const spec = { id: 'tongtian', name: '通天塔岛', x: T.x, z: T.z + I.dz, y: I.y, r0: I.r, grow: 1, seed: I.seed, back: true };
    const rand = mulberry32(I.seed * 13);
    const shape = isleGeometry(I.r, I.seed, { D: I.depth, NA: 168, NT: 26, NU: 24, round: 0.45, plateau: I.plateau, relief: 0.5 });
    const grp = new THREE.Group();
    grp.position.set(spec.x, spec.y, spec.z);
    const mesh = new THREE.Mesh(shape.geo, ISLE_MAT.get());
    mesh.name = 'isle';
    mesh.receiveShadow = true;
    grp.add(mesh);
    scene.add(grp);
    this.group = grp;
    this.body = new IsleBody(spec, shape, 0);
    this.spec = spec;
    // 台基底面：塔心处的平台高度
    const base = spec.y + shape.surface(0, -I.dz);
    this.base = base;
    // ---------- 塔、塔前广场、传送阵、石灯 ----------
    const b = new Builder();
    const info = towerOfHeaven(b);
    const S = (x, z) => { const h = shape.surface(x, z - I.dz); return h > -Infinity ? spec.y + h - base : -Infinity; };   // 塔的本地 → 相对台基底面的岛面高
    const pz0 = info.stairFoot + 0.4, pz1 = pz0 + 24, pw = 50;
    for (let z = pz0; z < pz1; z += 2) for (let x = -pw / 2; x < pw / 2; x += 2) {
      const h = S(x + 1, z + 1);
      if (h === -Infinity) continue;
      b.slab(1.96, 0.16, 1.96, (Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? C.marble : C.marbleWarm, x + 1, h - 0.1, z + 1, { mat: 'stoneSmooth', col: false });
    }
    for (const sx of [-1, 1]) for (const z of [pz0 + 1.5, pz1 - 1.5]) stoneLanternR(b, sx * (pw / 2 - 1.5), S(sx * (pw / 2 - 1.5), z), z, 1.15);
    const az = pz1 - 8, ay = S(0, az);
    teleportArray(b, 0, ay - 0.04, az, { r: 3.6 });
    this.door = { x: T.x + info.door.x, y: base + info.door.y, z: T.z + info.door.z };
    this.array = {
      id: 'tongtian', name: '通天塔 · 塔前广场', desc: '后山东北的孤岛，百层通天塔立在三层石台基上，正门入塔即一层接引大厅。',
      x: T.x, y: base + ay + 0.34, z: T.z + az, arrive: { x: T.x, z: T.z + az - 5.4, yaw: Math.PI },
    };
    const g = b.build({ shadows: true, name: 'tower-of-heaven' });
    g.position.set(T.x, base, T.z);
    g.userData.isle = 'tongtian';
    scene.add(g);
    this.decoGroup = g;
    this.cols = b.cols;
    this.lights = b.emitters.filter((e) => e.kind === 'light').map((e) => ({ ...e, x: T.x + e.x, y: base + e.y, z: T.z + e.z }));
    this.top = base + info.top;
    this.height = info.top;
    // ---------- 岛沿古松 ----------
    for (let k = 0, n = 0; k < 120 && n < 26; k++) {
      const a = rand() * 6.28, rho = 0.8 + rand() * 0.12;
      const R = shape.R(a) * rho, lx = Math.cos(a) * R, lz = Math.sin(a) * R;
      const tx = lx, tz = lz + I.dz;                                       // 塔的本地
      if (Math.abs(tx) < pw / 2 + 4 && tz > 30 && tz < pz1 + 6) continue;   // 广场前留空
      if (Math.abs(tx) < 52 && Math.abs(tz) < 52) continue;                 // 台基四周留空
      const h = shape.surface(lx, lz);
      if (h === -Infinity) continue;
      const it = veg?.add(rand() < 0.3 ? 'pineOld' : 'pine', spec.x + lx, spec.z + lz, 1.0 + rand() * 0.5, null, spec.y + h - 0.05);
      if (it) it.reach = 'tongtian';
      n++;
    }
    // ---------- 塔身周围的云：中段一层（两叠）、高处一层；每层围着塔身一圈，留两三处缺口，各团大小、高低不一 ----------
    // （从宗门、从空中不同方向看去，露出与遮住的塔身各不相同；塔门、塔刹始终露在云外）
    const x = T.x, z = T.z, crand = mulberry32(I.seed * 101);
    this.cloudBanks = [];
    const layer = (dy, n, ring, size, flat, gaps) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + crand() * 0.5;
        if (gaps.some(([g0, g1]) => a % (Math.PI * 2) > g0 && a % (Math.PI * 2) < g1)) continue;
        const r = ring * (0.8 + crand() * 0.5);
        this.cloudBanks.push([x + Math.cos(a) * r, base + dy + (crand() - 0.5) * 18, z + Math.sin(a) * r, size * (0.75 + crand() * 0.5), 3, flat]);
      }
    };
    layer(120, 9, 58, 150, 0.36, [[0.6, 1.5], [3.6, 4.3]]);          // 中段下叠：东南、西北两处缺口
    layer(152, 6, 48, 120, 0.32, [[2.0, 2.9]]);                      // 中段上叠
    layer(276, 7, 44, 130, 0.3, [[1.2, 2.2], [4.6, 5.3]]);          // 高处
    this.cloudBanks.push([x, spec.y + shape.bottomY * 0.6, spec.z, I.r * 2.4, 3, 0.3]);    // 岛下
    void TOTAL_H;
  }
  addColliders(cw) { return cw.addLocal(this.cols, TOWER.x, this.base, TOWER.z, 0).length; }
}
