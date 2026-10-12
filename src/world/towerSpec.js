// 通天塔（第十三轮）：位置、尺寸与楼层配置——外观（arch/tower100.js）、塔岛（towerIsle.js）、一层接引大厅（towerHall.js）
// 与守塔执事、楼层传送装置（game/towerRoom.js）都从这里取数。
//
// 尺度依据（宗门实测）：问道殿台基面到宝顶 54 米，五层；后山主峰约 480 米（海拔）；宗门后方浮岛岛面 170–225 米。
// 通天塔立在后山东北谷中的一座孤岛上（岛面约 260 米），自岛面到塔刹顶约 395 米，塔顶海拔约 655 米，高出主峰，
// 是宗门后方最高的地标；位置偏在中轴东侧约 21°，不挡山门、广场望向问道殿与主峰的视线。
// 塔身百层逐段收分：一层（接引大厅）八角对边宽 60 米、高 10.5 米；二层以上每层 3.4 米，到第一百层对边宽 22 米；
// 每十层一道出檐深远的大檐（出檐 6 米到 4 米，越高越短）与平座，把塔身分成十段——远看是一层层叠起的十级塔，不是一根柱子。外观用分段塔身、重复的楼层模块（墙身、腰檐、封檐板），近处才画的细部（斗拱、
// 栏杆望柱）交给建筑的细部显示距离，控制面数。
export const TOWER = {
  x: 380, z: -950,                                   // 塔心（世界坐标）；塔岛岛心在塔心以南 6 米
  isle: { dz: 8, y: 255, r: 115, depth: 132, seed: 21, plateau: 0.78 },  // 岛顶面半径参数、岛体厚度；岛心削平（台基与广场都在平台上）
  podium: [{ w: 92, h: 2.7 }, { w: 80, h: 2.7 }, { w: 70, h: 2.7 }],   // 三层石台基（方形边长、高），共 8.1 米；每层前出一道 15 级踏道
  floors: 100,
  f1: { h: 10.5, w: 60 },                            // 一层：八角形，对边宽 60 米
  floorH: 3.4,                                       // 二层以上每层层高
  wTop: 22,                                          // 第一百层对边宽
  seg: 10,                                           // 每十层一道大檐、平座
  roofH: 9, crown: 32,                               // 顶层攒尖屋面、塔刹
  door: { w: 5.6, h: 7.4 },                          // 正门（南面）
  porch: { w: 20, d: 4.6, col: 7.8 },                // 正门抱厦（落在第三层台基上）
};

const P = TOWER;
export const PODIUM_H = P.podium.reduce((s, t) => s + t.h, 0);
// 第 f 层（1–100）楼面高度（相对台基底面）与对边宽
export const floorBase = (f) => PODIUM_H + (f <= 1 ? 0 : P.f1.h + (f - 2) * P.floorH);
export const floorHeight = (f) => (f <= 1 ? P.f1.h : P.floorH);
export const floorWidth = (f) => P.wTop + (P.f1.w - P.wTop) * Math.pow(1 - (Math.min(Math.max(f, 1), P.floors) - 1) / (P.floors - 1), 1.15);
export const BODY_TOP = floorBase(P.floors) + P.floorH;            // 第一百层檐口
export const TOTAL_H = BODY_TOP + P.roofH + P.crown;                // 台基底面到塔刹顶

// 楼层配置：floor 楼层号；name 名称；open 是否开放；scene 目标场景（一层为接引大厅；二层以上为独立挑战场景）；
// kind 用途（trial 挑战 / rest 休整 / boss 守关）。
// 第十六轮：开放第五十层守关（镇龙封印殿，镇塔龙君·烬霄；scene 'boss50'，见 world/tower50.js、game/boss50Fight.js）。
// 塔里还没有逐层通关的规矩（二至四十九层尚未制作），第一版在一层的楼层传送阵上直接提供「第 50 层 Boss 挑战」入口。
export const TOWER_FLOORS = Array.from({ length: P.floors }, (_, i) => {
  const f = i + 1;
  if (f === 1) return { floor: 1, name: '一层 · 接引大厅', open: true, scene: 'towerHall', kind: 'hall' };
  if (f === 50) return { floor: 50, name: '第 50 层 · 镇龙封印殿', open: true, scene: 'boss50', kind: 'boss', boss: '镇塔龙君·烬霄' };
  if (f === 30) return { floor: 30, name: '第 30 层 · 烬狱剑台', open: true, scene: 'boss30', kind: 'boss', boss: '烬狱剑尊' };     // 第二十四轮
  const kind = f % 10 === 0 ? 'boss' : f % 10 === 5 ? 'rest' : 'trial';
  return { floor: f, name: `第 ${f} 层`, open: false, scene: `towerTrial-${f}`, kind };
});
