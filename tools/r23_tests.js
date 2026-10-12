// 第二十三轮自检：六槽装备、雷龙破虚（选点、校验、预览、时间轴、脉冲、目标、俯冲、伤害、清理、帧率）、普攻水墨（宽度、范围、外层、爆墨）。
// 都按真实的输入、出招、结算、特效代码推进（__qinglan.tick），不另写一套。
// 用法（预览）：const T = await import('/tools/r23_tests.js?v=' + Date.now()); await T.setup();
import * as B from './r17_combat_bot.js';
import * as G from './r21_growth.js';
import { DRAGON as DG, LOADOUT, PLAYER_COMBAT as PC, PLAYER_MOVES as PM, INK } from '/src/game/combatConfig.js';

const Q = () => window.__qinglan;
const r1 = (v) => +(+v).toFixed(1), r2 = (v) => +(+v).toFixed(2), r3 = (v) => +(+v).toFixed(3);
export const { run, foes, clearFoes, skyQuiet } = G;
// 演武广场（60 × 54 米的平地，y = 14）：人站在南侧、面朝北；雷龙的测试在这里做
export const PLAZA = { x: 0, z: 26, yaw: Math.PI };
export function plaza(yaw = PLAZA.yaw, at = PLAZA) { G.fresh(yaw, at); Q().dragon.clear('test'); return Q().player.pos.clone(); }

export async function setup() {
  await B.setup();
  const A = Q();
  B.quietDragons?.(true);
  skyQuiet(true);
  A.prog.debugSetLevel(21, { qi: 0 });
  plaza();
  run([], 0.2);
  return { level: A.prog.level, world: A.world.name, slots: A.loadout.slots.slice() };
}
// 装上要测的剑诀（不看脱战；自检专用）
export function equip(slots) { return Q().loadout.debugSet(slots); }
const WITH_DRAGON = ['qi', 'dragon', 'power', 'ult', 'seal', 'phoenix'];

// =====================================================================================
// 雷龙：放一次，推进到结束；记下时间线（预览、提交、扣费、冷却）与结算
// =====================================================================================
// list：[[种类, 前方几米, 向左几米], …]；lock：锁定第几个（null 不锁）；each(t)：每帧回调
export function dragonOnce({ list = [['shade', 14, 0], ['shade', 15, 2.5], ['shade', 13, -3]], hp = 5000, lock = 0, secs = 13.4, each = null, dt = 1 / 60, pre = null } = {}) {
  const A = Q(), M = A.moves, D = A.dragon;
  equip(WITH_DRAGON);
  const es = list.length ? foes(list, { hp }) : (clearFoes(), []);
  run([], 0.2);
  if (pre) pre(es);
  M.lock = lock != null && es[lock] ? es[lock] : null;
  M.mp = M.mpMax; M.cools.dragon = 0;
  const mp0 = M.mp, c0 = D.stats.casts;
  M.press('dragon', true);
  const tl = { commitAt: null, mpAt: null, coolAt: null };
  let t = 0;
  run([], secs, (tt) => {
    t = tt;
    if (tl.mpAt == null && M.mp < mp0 - 1) tl.mpAt = r3(tt);
    if (tl.coolAt == null && M.cools.dragon > 0) tl.coolAt = r3(tt);
    if (tl.commitAt == null && D.S) tl.commitAt = r3(D.S.t);
    if (each) return each(tt, es);
  }, dt);
  const L = D.last;
  return { cast: D.stats.casts - c0, mpSpent: r1(mp0 - M.mp + 0), tl, rec: L, hp: es.map((e) => r1(hp - e.hp)), es, t: r2(t) };
}

// 拍雷龙各时刻的画面：玩家视角（镜头略抬）与侧面全景；返回保存的文件名
export async function dragonShots(prefix = 'r23_tmp', times = [0.5, 1.0, 1.4, 1.9, 2.6, 4.03, 6.4, 9.63, 10.4, 10.95, 11.6], { side = true, pitch = 0.02, dist = 9 } = {}) {
  const A = Q(), M = A.moves, D = A.dragon;
  A.TIME.hour = 10; skyQuiet(false);
  plaza();
  equip(WITH_DRAGON);
  const es = foes([['shade', 14, 0], ['shade', 15, 2.5], ['shade', 13, -3], ['shade', 16, -1.2], ['shade', 12.5, 3.6]], { hp: 5000 });
  run([], 0.2);
  M.lock = es[0]; M.mp = M.mpMax; M.cools.dragon = 0;
  A.cam.set(Math.PI, pitch, dist);
  M.press('dragon', true);
  const out = [];
  let t = 0;
  for (const tt of times) {
    t += run([], tt - t);
    const C = D.S?.C || es[0].pos;
    const n = String(Math.round(tt * 100)).padStart(4, '0');
    await A.shot(`${prefix}_3p_${n}`, { w: 960, h: 540 });
    if (side) await A.shot(`${prefix}_sd_${n}`, { w: 960, h: 540, pos: [C.x + 24, C.y + 9, C.z + 8], at: [C.x, C.y + 5, C.z], fov: 55 });
    out.push(n);
  }
  run([], 13.6 - t);
  clearFoes(); skyQuiet(true);
  return out;
}

// =====================================================================================
// 普攻水墨：主墨带的量值（宽、外沿离人多远）与截图（正面 / 侧面 / 背后 / 夜间 / 连击）——改前、改后用同一套
// =====================================================================================
// 出一刀（light1 … light4），推进到带子铺完：width 内外沿的距离（米：判定段的最大 / 平均，全段最大），reach 外沿离人（命中那一刻的位置）水平多远，range 判定距离
export function inkMeasure(key, { target = false } = {}) {
  const A = Q(), M = A.moves, ink = A.sfx.ink, P = A.player;
  plaza();
  const es = target ? foes([['shade', 2.6, 0]], { hp: 5000 }) : (clearFoes(), []);
  run([], 0.1);
  M.start(key);
  const a = M.act, D = PM[key], h0 = D.hits[0];
  let at = null;
  run([], (D.end ?? 1) + 0.05, () => { if (!at && a.t >= h0.t) at = P.pos.clone(); });
  const r = ink.ribbons.filter((x) => x.act === a).sort((x, y) => y.n - x.n)[0];
  if (!r) return { key, none: true };
  const cfg = INK.slash[key], step = INK.ribbon.step, act = D.active;
  let wMax = 0, wAct = 0, nAct = 0, wActMax = 0, reach = 0, reachAct = 0;
  for (let i = 0; i < r.n; i++) {
    const k = i * 6, P0 = r.pos, ix = P0[k], iy = P0[k + 1], iz = P0[k + 2], ox = P0[k + 3], oy = P0[k + 4], oz = P0[k + 5];
    const w = Math.hypot(ox - ix, oy - iy, oz - iz), t = cfg.from + i * step;
    const rr = at ? Math.hypot(ox - at.x, oz - at.z) : 0;
    wMax = Math.max(wMax, w); reach = Math.max(reach, rr);
    if (t >= act[0] - 1e-6 && t <= act[1] + 1e-6) { wAct += w; nAct++; wActMax = Math.max(wActMax, w); reachAct = Math.max(reachAct, rr); }
  }
  clearFoes();
  return { key, samples: r.n, width: { activeMax: r2(wActMax), activeMean: r2(nAct ? wAct / nAct : 0), max: r2(wMax) }, reach: { active: r2(reachAct), max: r2(reach) }, range: h0.range, arc: h0.arc, hit: es.length ? r1(5000 - es[0].hp) : null };
}
export function inkMeasureAll() { return ['light1', 'light2', 'light3', 'light4'].map((k) => inkMeasure(k)); }
// 机位（相对人物朝向）：背后（常用跟随镜头）、侧面、正面
const INK_VIEWS = { back: (P, f, r) => [P.x - f.x * 6.2, P.y + 2.7, P.z - f.z * 6.2], side: (P, f, r) => [P.x + r.x * 6.5 + f.x * 1.5, P.y + 1.9, P.z + r.z * 6.5 + f.z * 1.5], front: (P, f, r) => [P.x + f.x * 7.5, P.y + 2.2, P.z + f.z * 7.5] };
// 一式一个机位一张：出刀，推进到判定段末再过 cap 秒（主墨带正完整），拍；target：身前站一个魔修（看命中的爆墨）
export async function inkShots(prefix, { keys = ['light1', 'light2', 'light3', 'light4'], views = ['back', 'side', 'front'], night = false, target = true, cap = 0.05 } = {}) {
  const A = Q(), M = A.moves, P = A.player, out = [];
  A.TIME.hour = night ? 22.5 : 10; skyQuiet(false);
  for (const key of keys) for (const v of views) {
    plaza();
    if (target) foes([['shade', 2.7, 0]], { hp: 5000 }); else clearFoes();
    run([], 0.3);
    M.start(key);
    const a = M.act, D = PM[key];
    run([], D.active[1] + cap);
    void a;
    const f = { x: Math.sin(P.heading), z: Math.cos(P.heading) }, r = { x: -Math.cos(P.heading), z: Math.sin(P.heading) };
    const pos = INK_VIEWS[v](P.pos, f, r), at = [P.pos.x + f.x * 1.6, P.pos.y + 1.1, P.pos.z + f.z * 1.6];
    const name = `${prefix}_${key}_${v}${night ? '_n' : ''}`;
    await A.shot(name, { w: 800, h: 600, pos, at, fov: 55 });
    out.push(name);
    run([], 0.8);
  }
  clearFoes(); skyQuiet(true); A.TIME.hour = 10;
  return out;
}
// 连续普攻（按住左键四式一轮再起）：每隔 every 秒拍一张背后机位——旧墨迹留多少、挡不挡敌人与预警
export async function inkChainShots(prefix, { secs = 2.6, every = 0.32, night = false } = {}) {
  const A = Q(), M = A.moves, P = A.player, out = [];
  A.TIME.hour = night ? 22.5 : 10; skyQuiet(false);
  plaza();
  const es = foes([['shade', 2.8, 0], ['shade', 3.4, 1.6], ['shade', 3.2, -1.7]], { hp: 5000, active: false });
  for (const e of es) { e.cool = 0.2; e.cfg = { ...e.cfg, speed: 0 }; }
  run([], 0.3);
  M.press('light', true);
  let t = 0, i = 0;
  while (t < secs) {
    t += run([], every);
    const f = { x: Math.sin(P.heading), z: Math.cos(P.heading) };
    const name = `${prefix}_chain_${String(i++).padStart(2, '0')}${night ? '_n' : ''}`;
    await A.shot(name, { w: 800, h: 600, pos: [P.pos.x - f.x * 6.2, P.pos.y + 2.7, P.pos.z - f.z * 6.2], at: [P.pos.x + f.x * 1.6, P.pos.y + 1.1, P.pos.z + f.z * 1.6], fov: 55 });
    out.push(name);
  }
  M.press('light', false);
  run([], 1.2);
  clearFoes(); skyQuiet(true); A.TIME.hour = 10;
  return out;
}

// =====================================================================================
// 一、装备槽
// =====================================================================================
const key = (code, down = true) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
// 迁移只做一次：没有 loadout 的旧存档 → 建默认；再建一次不重来；合法的自定义配置原样保留；非法的（重复、未知）清掉那几格
export async function migrateRun() {
  const A = Q(), { Loadout } = await import('/src/game/loadout.js');
  const mk = (d) => ({ d: JSON.parse(JSON.stringify(d)), save() { this.saved = (this.saved || 0) + 1; } });
  const base = { ...A.state.d }; delete base.loadout;
  const s1 = mk(base), L1 = new Loadout(s1, { prog: A.prog });
  const first = { init: L1.migrated.init, slots: L1.slots.slice(), learned: L1.d.learned.slice(), levelKept: s1.d.prog?.level, swordKept: s1.d.sword === A.state.d.sword, saved: s1.saved };
  const L2 = new Loadout(s1, { prog: A.prog });
  const again = { init: L2.migrated.init, same: JSON.stringify(L2.slots) === JSON.stringify(first.slots) };
  const custom = mk({ ...base, loadout: { v: 1, init: 1, slots: ['dragon', null, 'qi', 'ult', 'dash', 'heavy'], learned: LOADOUT.skills.slice() } });
  const L3 = new Loadout(custom, { prog: A.prog });
  const bad = mk({ ...base, loadout: { v: 1, init: 1, slots: ['qi', 'qi', 'nope', 'ult', null, 'heavy'], learned: LOADOUT.skills.slice() } });
  const L4 = new Loadout(bad, { prog: A.prog });
  return { first, again, custom: { init: L3.migrated.init, slots: L3.slots.slice() }, bad: { fixed: L4.migrated.fixed, slots: L4.slots.slice() }, defaults: LOADOUT.defaults };
}
// 每个槽键按下：放出这一格的剑诀（拔刀斩按住纳刀、松开出刀）
export function keyRun(slots = ['qi', 'dragon', 'power', 'ult', 'seal', 'dash']) {
  const A = Q(), M = A.moves, out = [];
  equip(slots);
  LOADOUT.keys.forEach((code, i) => {
    plaza(); M.mp = M.mpMax; M.intent = 100;
    const id = Q().loadout.at(i);
    if (id === 'dragon') foes([['shade', 12, 0]], { hp: 5000 }); else clearFoes();
    run([], 0.1);
    M.intent = 100; M.lastCombat = M.time;          // 剑意脱战即衰减：按键那一帧先衰减就不满 100（只是自检的摆法）
    key(code, true);
    run([], 0.05);
    const k0 = M.act?.key || null;
    if (id === 'power') { run([], 0.4); key(code, false); run([], 0.05); }
    const k1 = M.act?.key || null;
    key(code, false);
    out.push({ key: LOADOUT.labels[i], id, act: k0, after: k1 });
    run([], 1.5); Q().dragon.clear('test'); clearFoes();
  });
  return out;
}
// 卸下之后：旧的槽键、别名（中键）、剑诀栏按钮、直接调用 moves.press 都放不出来；第二十二轮的 T、Z 不再是剑诀键
export function unequippedRun() {
  const A = Q(), M = A.moves, L = A.loadout, out = {};
  equip(['qi', 'heavy', 'power', 'ult', 'seal', 'phoenix']);
  plaza(); run([], 0.2);
  L.debugSet([null, 'heavy', null, 'ult', 'seal', 'phoenix']);
  const tryIt = (name, fn) => { plaza(); M.mp = M.mpMax; run([], 0.05); const n0 = M.log.length ? M.log[M.log.length - 1].id : 0; fn(); run([], 0.1); out[name] = { act: M.act?.key || null, newMoves: M.log.filter((x) => x.id > n0).map((x) => x.key) }; M.press('power', false); A.game.pointer.setHeavy(false); run([], 1.2); };
  tryIt('oldKeyQ', () => key('KeyQ'));
  tryIt('pressQi', () => M.press('qi', true));
  tryIt('hudSlot0', () => A.combat.hud.onSlot(0, true));
  tryIt('oldKeyR_power', () => key('KeyR'));
  tryIt('middleMouse', () => A.game.pointer.setHeavy(true));
  tryIt('oldKeyZ', () => key('KeyZ'));
  tryIt('oldKeyT', () => key('KeyT'));
  key('KeyQ', false); key('KeyR', false); key('KeyZ', false); key('KeyT', false);
  // 装回来：中键又能纳刀
  L.debugSet(['qi', 'heavy', 'power', 'ult', 'seal', 'phoenix']);
  tryIt('middleMouseEquipped', () => A.game.pointer.setHeavy(true));
  return out;
}
// 冷却按技能 id 保存：卸下、换槽、重新装上、存档、换场景都不刷新（这期间冷却照常走）
export function coolRun() {
  const A = Q(), M = A.moves, L = A.loadout, out = {};
  plaza(); run([], 6);
  equip(['qi', 'heavy', 'power', 'ult', 'seal', 'phoenix']);
  M.cools.qi = 2.0; M.cools.phoenix = 60; M.cools.dragon = 100;
  const at = () => ({ qi: r2(M.cools.qi), phoenix: r2(M.cools.phoenix), dragon: r2(M.cools.dragon) });
  out.start = at();
  L.unequip(0); out.unequip = at();
  L.equip('qi', 3); out.reequip = at();
  L.swap(3, 5); out.swap = at();
  L.equip('dragon', 1); out.dragonIn = at();
  A.state.save();
  out.saved = { ...A.state.d.cools };
  A.combat.setWorld('surface', { scene: A.scene, terrain: A.terrain, cw: A.cw });       // 换场景（同一个宗门场景走一遍完整的换场景流程）
  out.afterScene = at();
  run([], 0.5);
  out.after05s = at();
  equip(['qi', 'heavy', 'power', 'ult', 'seal', 'phoenix']);
  for (const k in M.cools) M.cools[k] = 0;
  return out;
}
// 调整的限制：交战中、刚交过手、施法中、技能还有召唤物 / 投射物 / 持续伤害
export function lockRun() {
  const A = Q(), M = A.moves, L = A.loadout, out = {};
  equip(['qi', 'dragon', 'power', 'ult', 'seal', 'phoenix']);
  plaza(); run([], 6);
  out.calm = L.canEdit();
  // 交战：身前一个会动的魔修
  foes([['shade', 6, 0]], { hp: 5000, active: true });
  run([], 0.5);
  out.battle = { state: A.combat.state, edit: L.canEdit(), equip: L.equip('dash', 0) };
  clearFoes(); run([], 1.0);
  out.justAfter = L.canEdit();
  run([], 5.2);
  out.calmAgain = L.canEdit();
  // 施法中（雷龙起势；准星对着身前的空地、身边没有敌人——不和「交战中」混在一起）：不许调整；提交之后龙在场——不许卸下雷龙，别的格可以调
  clearFoes(); run([], 6);
  M.lock = null; aimGround(16); M.mp = M.mpMax; M.cools.dragon = 0;
  M.press('dragon', true); run([], 0.3);
  out.casting = L.canEdit();
  run([], 1.0);
  out.dragonUp = { active: A.dragon.active, act: M.act?.key || null, edit: L.canEdit(), unequipDragon: L.unequip(1), swapOthers: L.swap(4, 5) };
  run([], 12);
  out.dragonGone = { active: A.dragon.active, unequipDragon: L.unequip(1) };
  L.debugSet(['qi', 'dragon', 'power', 'ult', 'seal', 'phoenix']);
  run([], 6);
  // 剑气还在飞（出招动作已经收了）：不许卸下剑气
  M.cools.qi = 0; M.mp = M.mpMax;
  M.press('qi', true); run([], 0.05); M.press('qi', false);
  for (let i = 0; i < 120 && M.act; i++) run([], 1 / 60);
  out.qiFlying = { act: M.act?.key || null, proj: A.combat.projectiles.filter((p) => p.kind === 'wave' && !p.short).length, unequipQi: L.unequip(0) };
  run([], 1.5);
  out.qiDone = { unequipQi: L.unequip(0) };
  L.debugSet(['qi', 'dragon', 'power', 'ult', 'seal', 'phoenix']);
  // 凤凰在场：不许卸下凤凰
  run([], 6);
  const ph = A.phoenix; ph.mode = 'strike'; M.cools.phoenix = 0; M.mp = M.mpMax;
  M.press('phoenix', true); run([], 1.4);
  out.phoenixUp = { active: ph.active, unequipPhoenix: L.unequip(5) };
  ph.clear('test'); run([], 6);
  out.phoenixGone = { unequipPhoenix: L.unequip(5) };
  L.debugSet(['qi', 'dragon', 'power', 'ult', 'seal', 'phoenix']);
  for (const k in M.cools) M.cools[k] = 0;
  return out;
}
// 4（凤凰模式）只在凤凰装备时有效
export function mode4Run() {
  const A = Q(), L = A.loadout, ph = A.phoenix, out = {};
  plaza(); run([], 6);
  L.debugSet(['qi', 'heavy', 'power', 'ult', 'seal', null]);
  const m0 = ph.mode; key('Digit4'); key('Digit4', false); run([], 0.05);
  out.unequipped = { before: m0, after: ph.mode };
  L.debugSet(['qi', 'heavy', 'power', 'ult', 'seal', 'phoenix']);
  const m1 = ph.mode; key('Digit4'); key('Digit4', false); run([], 0.05);
  out.equipped = { before: m1, after: ph.mode };
  if (ph.mode !== m0) { key('Digit4'); key('Digit4', false); }
  return out;
}

// =====================================================================================
// 二、雷龙：选点（锁定 / 准星敌人 / 准星地面）、30 米、遮挡、地面、空间——不合法时不扣费、不进冷却
// =====================================================================================
// 镜头准星对着世界中的点 p（改镜头的偏航、俯仰；镜头在人背后）
export function aimAt(p) {
  const A = Q(), cam = A.cam, o = new A.THREE.Vector3();
  for (let i = 0; i < 4; i++) {
    A.camera.getWorldPosition(o);
    const dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z;
    cam.yaw = Math.atan2(dx, dz); cam.pitch = -Math.atan2(dy, Math.hypot(dx, dz));
    cam.update(1 / 60, A.player.pos.clone().setY(A.player.pos.y + 1.55), A.player);
  }
  return { yaw: r3(cam.yaw), pitch: r3(cam.pitch) };
}
// 准星对着身前 d 米（向左 s 米）的地面；返回那一点
export function aimGround(d = 16, s = 0) {
  const A = Q(), P = A.player, h = P.heading, l = { x: Math.cos(h), z: -Math.sin(h) };
  const g = new A.THREE.Vector3(P.pos.x + Math.sin(h) * d + l.x * s, 0, P.pos.z + Math.cos(h) * d + l.z * s);
  g.y = A.combat.groundAt(g.x, g.z, P.pos.y + 2);
  aimAt(g);
  return g;
}
// 放一次（不推进到底）：按下 → 推进 secs 秒；返回是否起手、是否提交、灵力与冷却、拒绝的原因、提交时的中心与主要目标
function tryCast(secs = 0.9, before = null) {
  const A = Q(), M = A.moves, D = A.dragon;
  M.mp = M.mpMax; M.cools.dragon = 0;
  const mp0 = M.mp, c0 = D.stats.casts, rj0 = { ...D.stats.rejects };
  if (before) before();
  M.press('dragon', true);
  run([], 0.02);
  const started = M.act?.key === 'dragon';
  let prev = M.mp, drop = 0, tCommit = null;
  run([], secs, () => { drop = Math.max(drop, prev - M.mp); prev = M.mp; if (tCommit == null && D.S) tCommit = r3(D.S.t); });
  const S = D.S;
  const rj = Object.fromEntries(Object.entries(D.stats.rejects).filter(([k, v]) => v !== (rj0[k] || 0)));
  const rejected = Object.keys(rj).length > 0;
  return { started, committed: D.stats.casts - c0, tCommit, mpDrop: r1(drop), mp35: r1(M.mpMax * DG.mpCost), mpSpent: r1(mp0 - M.mp), cool: r1(M.cools.dragon), reject: Object.keys(rj)[0] || null, text: rejected ? D.lastReject?.text : null,
    C: S ? S.C.toArray().map(r2) : null, primary: S?.primary ? D.tid(S.primary) : null, src: S?.src || null, dist: S ? r2(S.dist) : null, preview: { valid: D.fx.area.U.uValid.value, a: r2(D.fx.area.a) } };
}
export function selectRun() {
  const A = Q(), M = A.moves, D = A.dragon, P = A.player, out = {};
  equip(['qi', 'dragon', 'power', 'ult', 'seal', 'phoenix']);
  // 1. 锁定：锁最远的那个（不是准星正对、也不是最近的）→ 雷云落在它脚下、它是主要目标
  plaza(); let es = foes([['shade', 10, 0], ['shade', 14, 4], ['shade', 18, -3]], { hp: 5000 });
  run([], 0.2); aimAt(es[0].pos.clone().setY(es[0].pos.y + 1));
  M.lock = es[2];
  out.lock = { ...tryCast(), want: D.tid(es[2]), wantAt: es[2].pos.toArray().map(r2) };
  D.clear('test');
  // 2. 不锁定、准星对着一个敌人
  plaza(); es = foes([['shade', 10, 0], ['shade', 14, 4], ['shade', 18, -3]], { hp: 5000 });
  run([], 0.2); M.lock = null; aimAt(es[1].pos.clone().setY(es[1].pos.y + 1.1));
  out.aimEnemy = { ...tryCast(), want: D.tid(es[1]) };
  D.clear('test');
  // 3. 准星对着地面（身前 20 米的空地）
  plaza(); clearFoes(); run([], 0.2); M.lock = null;
  const g = aimGround(20);
  out.aimGround = { ...tryCast(), want: g.toArray().map(r2) };
  D.clear('test');
  // 4. 30 米：29 米可以，31 米不行（准星对着地面；三维距离）
  const WEST = { x: -22, z: 26 };
  for (const d of [29, 31, 40]) {
    plaza(Math.PI / 2, WEST); clearFoes(); run([], 0.2); M.lock = null;
    const q = aimGround(d);
    out['dist' + d] = { ...tryCast(), want: r2(P.pos.distanceTo(q)) };
    D.clear('test');
  }
  // 三维距离：水平 29.5 米、同一高度 → 29.5；水平 29.5 米、高 6 米 → 30.1（超距）
  plaza(Math.PI / 2, WEST); run([], 0.1);
  const V3 = A.THREE.Vector3, o = P.pos.clone();
  out.dist3d = { flat: D.validate({ src: 'ground', point: new V3(o.x + 29.5, o.y, o.z) }), raised: D.validate({ src: 'ground', point: new V3(o.x + 29.5, o.y + 6, o.z) }) };
  // 5. 准星对着天空：没有地面
  plaza(); clearFoes(); run([], 0.2); M.lock = null;
  let yawSky = null;
  for (let k = 0; k < 16 && yawSky == null; k++) {
    A.cam.yaw = P.heading + (k * Math.PI) / 8; A.cam.pitch = -0.55; A.cam.update(1 / 60, P.pos.clone().setY(P.pos.y + 1.55), P);
    if (D.aimRay().kind === 'none') yawSky = r2(A.cam.yaw);
  }
  out.sky = { ...tryCast(), yaw: yawSky };
  D.clear('test');
  return out;
}
// 遮挡、空间：锁定站在屋檐（广场南侧回廊）下的敌人 → 上方空间不足；锁定一面墙背后的敌人 → 被挡住
export function blockRun() {
  const A = Q(), M = A.moves, D = A.dragon, out = {};
  equip(['qi', 'dragon', 'power', 'ult', 'seal', 'phoenix']);
  // 屋顶下：回廊里柱间 (−18.5, 39.5)；人在广场上 (−18.5, 26)、面朝南
  plaza(0, { x: -18.5, z: 26 });
  clearFoes();
  const C = A.combat, e = C.spawn('shade', { x: -18.5, y: 14, z: 39.5 }, { yaw: Math.PI }); e.cool = 99; e.cfg = { ...e.cfg, speed: 0 };
  run([], 0.2); M.lock = e;
  out.space = { ...tryCast(), lineOk: [1.0, 2.2, 3.5].map((h) => D.clearLine(new A.THREE.Vector3(-18.5, 15.4, 26), new A.THREE.Vector3(-18.5, 14 + h, 39.5))), roofAbove: D.solidAt(-18.5, 18.6, 39.5) };
  D.clear('test'); clearFoes();
  // 墙后：从回廊南侧往北（隔着回廊的墙）找一个墙后的点——沿 x = 0 往南
  plaza(0, { x: -6, z: 30 });
  const w = C.spawn('shade', { x: -6, y: A.combat.groundAt(-6, 52, 30), z: 52 }, { yaw: 0 }); w.cool = 99; w.cfg = { ...w.cfg, speed: 0 };
  run([], 0.2); M.lock = w;
  out.wall = { ...tryCast(), lockLine: D.clearLine(new A.THREE.Vector3(-6, 15.4, 30), w.pos.clone().setY(w.pos.y + 1)), targetAt: w.pos.toArray().map(r2) };
  D.clear('test'); clearFoes();
  // 提交时的终检：起势中把锁定的敌人挪到 34 米外 → 0.65 秒提交时超距、作废（不扣费）
  plaza(); const es = foes([['shade', 14, 0]], { hp: 5000 });
  run([], 0.2); M.lock = es[0];
  plaza(); const es2 = foes([['shade', 14, 0]], { hp: 5000 });
  run([], 0.2); M.lock = es2[0]; M.mp = M.mpMax; M.cools.dragon = 0;
  const mp0 = M.mp;
  M.press('dragon', true); run([], 0.3);
  es2[0].pos.set(es2[0].pos.x, es2[0].pos.y, es2[0].pos.z - 20);          // 起势中挪到 34 米外
  run([], 0.6);
  out.commitFar = { committed: !!D.S, mpSpent: r1(mp0 - M.mp), cool: r1(M.cools.dragon), reject: D.lastReject?.code, text: D.lastReject?.text };
  D.clear('test');
  // 起势中锁定的敌人倒下 → 改按准星（不改去别的远处敌人），提示写明
  plaza(); const es3 = foes([['shade', 12, 0], ['shade', 20, 6]], { hp: 5000 });
  run([], 0.2); M.lock = es3[0]; M.mp = M.mpMax; M.cools.dragon = 0;
  const gp = A.player.pos.clone().add(new A.THREE.Vector3(Math.sin(A.player.heading) * 16, 0, Math.cos(A.player.heading) * 16)); gp.x += 2; gp.y = A.combat.groundAt(gp.x, gp.z, gp.y + 2);
  aimAt(gp);
  M.press('dragon', true); run([], 0.3);
  es3[0].hp = 1; A.combat.damage(es3[0], 10, { from: A.combat.playerUnit, kind: 'sword' });
  run([], 0.05);
  const label = D.labelText;
  run([], 0.6);
  out.lockDied = { committed: !!D.S, C: D.S ? D.S.C.toArray().map(r2) : null, aimed: gp.toArray().map(r2), primary: D.S?.primary ? D.tid(D.S.primary) : null, other: D.tid(es3[1]), label };
  D.clear('test'); clearFoes();
  return out;
}

// =====================================================================================
// 三、演出：区域固定、出场（裁切逐段穿出）、游动、雷云层次
// =====================================================================================
export function showRun() {
  const A = Q(), M = A.moves, D = A.dragon, P = A.player, out = { emerge: [], swim: [] };
  equip(['qi', 'dragon', 'power', 'ult', 'seal', 'phoenix']);
  plaza(); const es = foes([['shade', 14, 0]], { hp: 5000 });
  run([], 0.2); M.lock = es[0]; M.mp = M.mpMax; M.cools.dragon = 0;
  M.press('dragon', true);
  const V = A.THREE.Vector3;
  let C0 = null, clouds0 = null;
  const hist = [], legQ = [], deg = (x) => Math.round((x * 180) / Math.PI);
  run([], 12.6, (t) => {
    const S = D.S, rig = D.rig;
    if (!S) return;
    if (!C0) { C0 = S.C.clone(); clouds0 = D.fx.clouds.masses.map((m) => m.p.clone()); }
    if (S.t >= DG.t.emerge) hist.push([S.t, S.head.clone()]);
    if (S.t >= 3 && S.t <= 10 && rig.legs[0]) legQ.push(rig.legs[0].quaternion.clone());
    // 主人走开 10 米（瞬移）：雷云中心不动
    if (Math.abs(t - 3.0) < 0.009) P.place(P.pos.x + 10, P.pos.z, P.heading);
    const st = r2(S.t);
    if (S.t >= 0.85 && S.t <= 2.8 && Math.round(S.t * 60) % 6 === 0) {
      const n = rig.chain.length;
      let out1 = 0;
      for (const b of rig.chain) { const w = b.getWorldPosition(new V()); if (w.clone().sub(S.rift).dot(S.f) > 0) out1++; }
      out.emerge.push([st, r2(out1 / n), S.clipOff ? 'off' : 'clip', rig.root.visible]);
    }
    if (S.t >= 3 && S.t <= 10 && Math.round(S.t * 60) % 60 === 0) {
      // 每秒一行：[时刻, 相邻脊段夹角的最大值°, 头尾两段的夹角°, 尾梢离「头走过的路」最近多远（米）, 尾梢在头几秒前的位置上（秒）, 最大侧倾°, 头离地多高]
      const Pp = rig.chain.map((b) => b.getWorldPosition(new V())), F = [];
      for (let i = 1; i < Pp.length; i++) F.push(Pp[i - 1].clone().sub(Pp[i]).normalize());
      let maxBend = 0; for (let i = 1; i < F.length; i++) maxBend = Math.max(maxBend, F[i].angleTo(F[i - 1]));
      const tail = Pp[Pp.length - 1];
      let best = Infinity, bt = 0; for (const [th, hp] of hist) { const d = hp.distanceTo(tail); if (d < best) { best = d; bt = th; } }
      let bank = 0;
      rig.ups.forEach((up, i) => { const f = F[Math.min(i, F.length - 1)], yo = new V(0, 1, 0).addScaledVector(f, -f.y).normalize(); bank = Math.max(bank, up.angleTo(yo)); });
      out.swim.push([st, deg(maxBend), deg(F[0].angleTo(F[F.length - 1])), r2(best), r2(S.t - bt), deg(bank), r2(S.head.y - S.C.y)]);
    }
  });
  const S = D.last;
  out.centerFixed = { C0: C0?.toArray().map(r2), Clast: S?.C, moved: P.pos.toArray().map(r2) };
  out.cloudsFixed = clouds0 ? clouds0.every((p, i) => !D.fx.clouds.masses[i] || p.distanceTo(D.fx.clouds.masses[i].p) < 1e-6) : null;
  out.outT = S?.outT;
  // 前腿（左前）在盘游时的本地旋转摆幅（度）：四爪随游动划动
  let swing = 0; for (const q of legQ) swing = Math.max(swing, q.angleTo(legQ[0]));
  out.legSwing = deg(swing);
  out.bodyLen = r2(D.rig.bodyLen);
  clearFoes();
  return out;
}
// 雷云的层次：十团的离地高度、大小、到中心的距离
export function cloudLayout() {
  const A = Q(), D = A.dragon, M = A.moves;
  plaza(); const es = foes([['shade', 14, 0]], { hp: 5000 });
  run([], 0.2); M.lock = es[0]; M.mp = M.mpMax; M.cools.dragon = 0;
  M.press('dragon', true); run([], 2.5);
  const S = D.S, ms = D.fx.clouds.masses.map((m) => ({ h: r2(m.p.y - S.C.y), size: r2(m.size), r: r2(Math.hypot(m.p.x - S.C.x, m.p.z - S.C.z)) }));
  const out = { n: ms.length, puffs: D.fx.clouds.puffs.length, masses: ms, h: [Math.min(...ms.map((m) => m.h)), Math.max(...ms.map((m) => m.h))], size: [Math.min(...ms.map((m) => m.size)), Math.max(...ms.map((m) => m.size))] };
  run([], 11); clearFoes();
  return out;
}

// =====================================================================================
// 四、脉冲：时刻与次数、每次至多 15 个、每目标每脉冲一次；1 / 15 / 20 个敌人、中途倒下、中途进入
// =====================================================================================
// 敌人铺成一片（离 C 不超过 maxR 米）：n 个；第一个正在 C 上（锁定它：雷云中心就是 C）
function ring(n, C, maxR = 7, yaw = 0, first = true) {
  const A = Q(), out = [];
  for (let i = 0; i < n; i++) {
    const a = yaw + (i / n) * Math.PI * 2 * 1.618, rr = first && i === 0 ? 0 : 1.2 + (maxR - 1.2) * Math.sqrt((i + 0.5) / n);
    const x = C.x + Math.cos(a) * rr, z = C.z + Math.sin(a) * rr;
    const e = A.combat.spawn('shade', { x, y: A.combat.groundAt(x, z, C.y + 2), z }, { yaw: 0 });
    e.cool = 99; e.slamCool = 99; e.cfg = { ...e.cfg, speed: 0 }; e.state = 'chase';
    out.push(e);
  }
  return out;
}
export function pulseRun({ n = 20, hp = 5000, kill = 0, enter = 0, dt = 1 / 60 } = {}) {
  const A = Q(), M = A.moves, D = A.dragon, P = A.player, C = A.combat;
  equip(['qi', 'dragon', 'power', 'ult', 'seal', 'phoenix']);
  plaza(); clearFoes();
  const center = P.pos.clone().add(new A.THREE.Vector3(Math.sin(P.heading) * 14, 0, Math.cos(P.heading) * 14)); center.y = C.groundAt(center.x, center.z, center.y + 2);
  const es = ring(n, center, 7);
  for (const e of es) { e.hp = e.maxHp = hp; e.bar.set(1); }
  run([], 0.2);
  M.lock = es[0]; M.mp = M.mpMax; M.cools.dragon = 0;
  // 每个目标每次脉冲受了几次伤（按伤害事件，来自雷龙）
  const hits = [];
  const fn = (ev) => { if (ev.from === D.unit && ev.kind === 'thunder') hits.push({ t: r3(D.S?.t ?? -1), id: D.tid(ev.target), amount: r2(ev.amount), result: ev.result }); };
  C.hitListeners.add(fn);
  M.press('dragon', true);
  let entered = [];
  const order = [], killed = [];
  run([], 13.0, (t) => {
    const S = D.S;
    if (!S) return;
    // 第 4 次脉冲之后：被选中的前 kill 个直接倒下
    if (kill && !S._killed && S.t > 4.9) { S._killed = true; const sel = (S.pulses[3]?.list || []).filter((e) => e.u !== es[0]).slice(0, kill); for (const e of sel) { killed.push(e.id); e.u.hp = 1; C.damage(e.u, 5, { from: C.playerUnit, kind: 'sword' }); } }
    // 第 5 秒：新的 enter 个敌人走进雷云范围（离中心 2 米内——比原来那些都近）
    if (enter && !S._entered && S.t > 5.0) { S._entered = true; entered = ring(enter, S.C, 2, 0.7, false); for (const e of entered) { e.hp = e.maxHp = hp; } }
    // 每次脉冲选中的（预兆那一刻）：与独立算的「主要目标 + 离中心最近的」对照
    for (const Pk of S.pulses) if (Pk && !Pk._chk) {
      Pk._chk = true;
      const alive = C.targets().filter((u) => u.alive && Math.hypot(u.pos.x - S.C.x, u.pos.z - S.C.z) - (u.radius ?? 0.45) <= DG.radius);
      const want = alive.map((u) => ({ id: D.tid(u), p: u === S.primary, d: Math.max(0, Math.hypot(u.pos.x - S.C.x, u.pos.z - S.C.z) - (u.radius ?? 0.45)) }))
        .sort((a, b) => (a.p ? -1 : b.p ? 1 : 0) || a.d - b.d || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, DG.pulse.max).map((x) => x.id);
      const got = Pk.list.map((x) => x.id);
      order.push({ k: Pk.k, same: want.length === got.length && want.every((id, i) => id === got[i]), primaryFirst: got[0] === D.tid(S.primary), n: got.length, eligible: alive.length });
    }
  }, dt);
  C.hitListeners.delete(fn);
  const L = D.last;
  // 每次脉冲：时刻、选中几个、打中几个；有没有同一目标同一脉冲挨两次
  const per = new Map();
  for (const h of hits) { const k = h.t.toFixed(2) + ':' + h.id; per.set(k, (per.get(k) || 0) + 1); }
  const dup = [...per.values()].filter((v) => v > 1).length;
  const ids = (k) => new Set(hits.filter((h) => Math.abs(h.t - (DG.pulse.first + k * DG.pulse.every)) < 0.05).map((h) => h.id));
  const enteredIds = entered.map((e) => D.tid(e));
  const out = { n, pulses: L?.pulses.map((p) => [p.k, p.t, p.sel, p.total, p.hits]), maxSel: Math.max(...(L?.pulses.map((p) => p.sel) || [0])), dupPerPulse: dup,
    pulseTimes: L?.pulses.map((p) => p.t), damageEvents: hits.length, primaryHits: hits.filter((h) => h.id === D.tid(es[0])).length,
    enteredHitsAfter: enteredIds.length ? [...Array(10).keys()].map((k) => enteredIds.filter((id) => ids(k).has(id)).length) : null,
    dive: L?.dive ? { how: L.dive.how, direct: L.dive.direct?.id, crit: L.dive.direct?.crit, burst: L.dive.burst.length } : null, total: L?.per.reduce((s, o) => s + o.total, 0),
    order: order.every((o) => o.same && o.primaryFirst) ? 'ok' : order, perPulseSelEligible: order.map((o) => [o.n, o.eligible]),
    killedHitsAfter: killed.length ? [...Array(10).keys()].map((k) => killed.filter((id) => ids(k).has(id)).length) : null };
  clearFoes();
  return out;
}

// =====================================================================================
// 五、雷击不穿屋顶：广场南侧回廊——雷云中心在开阔处，范围里有几个敌人站在回廊的屋檐下
// =====================================================================================
export function roofRun() {
  const A = Q(), M = A.moves, D = A.dragon, C = A.combat, out = {};
  equip(['qi', 'dragon', 'power', 'ult', 'seal', 'phoenix']);
  // 主人在东边 (−6, 33)、朝西；雷云中心 (−18.5, 33) 在开阔处（裂隙在中心西侧、广场上空）
  plaza(-Math.PI / 2, { x: -6, z: 33 });
  clearFoes();
  const mk = (x, z) => { const e = C.spawn('shade', { x, y: C.groundAt(x, z, 15), z }, { yaw: 0 }); e.cool = 99; e.slamCool = 99; e.cfg = { ...e.cfg, speed: 0 }; e.state = 'chase'; e.hp = e.maxHp = 5000; e.bar.set(1); return e; };
  const open = [mk(-18.5, 33), mk(-15, 31), mk(-21, 34)], roofed = [mk(-22, 39.5), mk(-18.5, 39.5), mk(-15.5, 39.5)];
  run([], 0.2);
  out.roofCheck = roofed.map((e) => !D.skyClear(e.pos.x, e.pos.z, e.pos.y + 1.9, e.pos.y + DG.cloud.base + 1));
  out.openCheck = open.map((e) => D.skyClear(e.pos.x, e.pos.z, e.pos.y + 1.9, e.pos.y + DG.cloud.base + 1));
  out.inRange = roofed.map((e) => r2(Math.hypot(e.pos.x + 18.5, e.pos.z - 33)));
  M.lock = open[0]; M.mp = M.mpMax; M.cools.dragon = 0;
  M.press('dragon', true);
  run([], 13.2);
  const L = D.last;
  out.committed = !!L; out.reject = D.lastReject;
  out.open = open.map((e) => r1(5000 - e.hp)); out.roofed = roofed.map((e) => r1(5000 - e.hp));
  out.roofedIds = L?.roofed || [];
  clearFoes();
  return out;
}

// =====================================================================================
// 六、俯冲：追踪的限制与回退
// =====================================================================================
// how：follow（主要目标在限内挪动）/ far（挪到雷云中心 radius + track 之外）/ dead（蓄势前倒下）/ none（没有主要目标：准星选的地面）
export function diveRun(how = 'follow') {
  const A = Q(), M = A.moves, D = A.dragon, P = A.player, C = A.combat;
  equip(['qi', 'dragon', 'power', 'ult', 'seal', 'phoenix']);
  if (how === 'range') plaza(Math.PI / 2, { x: -22, z: 26 }); else plaza();         // range 在广场西侧朝东（东西向的平地够长）
  // range：主要目标在 20 米外；蓄势中被挪到离施法起点 32 米处（离雷云中心 12 米，在 radius + track 之内，但超出 30 米）
  const es = foes(how === 'range' ? [['shade', 20, 0], ['shade', 21, 3]] : [['shade', 14, 0], ['shade', 15, 3]], { hp: 50000 });
  run([], 0.2);
  // none：准星对着身前 16 米、往右 6 米的空地（离两个魔修都远，不会先碰到魔修）
  if (how === 'none') { M.lock = null; aimGround(16, -6); }
  else M.lock = es[0];
  M.mp = M.mpMax; M.cools.dragon = 0;
  M.press('dragon', true);
  const moved = [];
  run([], 13.2, () => {
    const S = D.S;
    if (!S) return;
    const u = es[0], C0 = S.C;
    // 蓄势（10.0）一开始先挪 3 米（合法，落点跟过去）；far / dead：10.3 再挪到雷云中心 16 米外 / 倒下 → 落点留在最后一个合法处（挪过去的那 3 米处）
    if (how !== 'none' && !S._m1 && S.t > 10.02) { S._m1 = true; u.pos.x += 3; moved.push(['+3', r2(S.t), u.pos.toArray().map(r2)]); }
    if (!S._m2 && S.t > 10.3) {
      S._m2 = true;
      if (how === 'far') { u.pos.x = C0.x + 16; moved.push(['far', r2(S.t), u.pos.toArray().map(r2)]); }
      if (how === 'dead') { u.hp = 1; C.damage(u, 5, { from: C.playerUnit, kind: 'sword' }); moved.push(['dead', r2(S.t)]); }
      if (how === 'range') { u.pos.x += Math.sin(P.heading) * 8; u.pos.z += Math.cos(P.heading) * 8; moved.push(['range', r2(S.t), u.pos.toArray().map(r2), r2(S.origin.distanceTo(u.pos)), r2(Math.hypot(u.pos.x - C0.x, u.pos.z - C0.z))]); }
    }
  });
  const L = D.last;
  const out = { how, C: L?.C, src: L?.src, diveTo: L?.diveTo, tracked: L?.tracked, moved, dive: L?.dive && { how: L.dive.how, at: L.dive.at, direct: L.dive.direct, burst: L.dive.burst.map((b) => b.id) }, primary: D.tid(es[0]), events: D.events.filter((x) => x.kind === 'dive').slice(0, 1) };
  clearFoes();
  return out;
}

// =====================================================================================
// 七、伤害：21 级标准全命中参考 1500（理论）与实测；暴击、等级成长
// =====================================================================================
export function damageRun() {
  const A = Q(), D = A.dragon, out = {};
  const keep = D.rand;
  // 单个目标、不暴击：10 × 60 + 900 = 1500
  D.rand = () => 0.99;
  const one = dragonOnce({ list: [['shade', 14, 0]], hp: 50000 });
  out.single = { hp: one.hp, per: one.rec?.per, dive: one.rec?.dive?.direct };
  // 暴击（直接命中按直接攻击的暴击规则）：900 × 1.5
  D.rand = () => 0.0;
  const cr = dragonOnce({ list: [['shade', 14, 0], ['shade', 14.5, 2]], hp: 50000 });
  out.crit = { hp: cr.hp, direct: cr.rec?.dive?.direct, burst: cr.rec?.dive?.burst };
  D.rand = keep;
  // 等级成长：30 级的快照
  A.prog.debugSetLevel(30, { qi: 0 });
  D.rand = () => 0.99;
  const l30 = dragonOnce({ list: [['shade', 14, 0]], hp: 50000 });
  out.level30 = { snap: l30.rec?.snap, hp: l30.hp };
  A.prog.debugSetLevel(21, { qi: 0 });
  D.rand = keep;
  out.theory = { pulse: DG.pulse.dmg, pulses: DG.pulse.count, dive: DG.dive.dmg, burst: DG.dive.burst, primaryFull: DG.pulse.dmg * DG.pulse.count + DG.dive.dmg, other: DG.pulse.dmg * DG.pulse.count + DG.dive.burst };
  return out;
}

// =====================================================================================
// 八、帧率：30 / 60 / 144 帧每秒——脉冲次数、时刻、每个目标的伤害、俯冲接触、结束时刻一样
// =====================================================================================
export function fpsRun() {
  const out = {};
  for (const fps of [30, 60, 144]) {
    const r = pulseRun({ n: 6, dt: 1 / fps });
    const L = Q().dragon.last;
    out[fps] = { pulses: r.pulses.length, times: r.pulseTimes, total: r.total, dive: L?.dive?.t, end: L?.t, events: r.damageEvents };
  }
  return out;
}

// =====================================================================================
// 九、清理：倒下、换场景、重试——龙、雷云、裂隙、预兆、雷柱都收掉，之后不再结算
// =====================================================================================
export function cleanupRun() {
  const A = Q(), M = A.moves, D = A.dragon, C = A.combat, out = {};
  equip(['qi', 'dragon', 'power', 'ult', 'seal', 'phoenix']);
  const census = () => ({ S: !!D.S, pre: !!D.pre, rig: D.rig.root.visible, clouds: D.fx.clouds.mesh.visible, rift: D.fx.rift.g.visible, bolts: D.fx.bolts.alive(), area: r2(D.fx.area.a) });
  // 倒下
  plaza(); let es = foes([['shade', 14, 0]], { hp: 5000 });
  run([], 0.2); M.lock = es[0]; M.mp = M.mpMax; M.cools.dragon = 0;
  M.press('dragon', true); run([], 4.0);
  const hp0 = es[0].hp;
  const keepDown = C.onPlayerDown; C.onPlayerDown = () => {};       // 不走黑屏、送回山门的界面流程（那是 1.6 秒的计时器）；combat.playerDown 本身照旧
  C.playerUnit.invuln = 0; C.playerUnit.hp = 1; C.damage(C.playerUnit, 50, { from: es[0], kind: 'demonic', spec: { def: 'aoe', id: 'test', seg: 0 } });
  run([], 0.1);
  out.death = { ...census(), playerAlive: C.playerUnit.alive, last: D.last?.reason };
  run([], 3.0);
  out.deathAfter3s = { dmgSince: r1(hp0 - es[0].hp), ...census() };
  C.onPlayerDown = keepDown; C.revive(); C.playerUnit.invuln = 0;
  // 重试（守关战里重来）见 retryRun（要进第五十层）
  // 换场景
  plaza(); es = foes([['shade', 14, 0]], { hp: 5000 });
  run([], 0.2); M.lock = es[0]; M.mp = M.mpMax; M.cools.dragon = 0;
  M.press('dragon', true); run([], 4.0);
  C.setWorld('surface', { scene: A.scene, terrain: A.terrain, cw: A.cw });
  run([], 0.1);
  out.scene = { ...census(), last: D.last?.reason };
  // 起势中取消（闪身）：不扣费、预览撤掉
  plaza(); es = foes([['shade', 14, 0]], { hp: 5000 });
  run([], 0.2); M.lock = es[0]; M.mp = M.mpMax; M.cools.dragon = 0;
  const mp0 = M.mp;
  M.press('dragon', true); run([], 0.3);
  M.press('dodge', true); run([], 0.6);
  out.dodgeCancel = { ...census(), mpSpent: r1(mp0 - M.mp), cool: r1(M.cools.dragon), cancel: D.lastCancel };
  clearFoes();
  return out;
}

// =====================================================================================
// 十、水墨：主墨核心贴合攻击（外沿 = 判定距离）、外层只扩气势、爆墨只在真实命中；两组素材都在用
// =====================================================================================
export function inkRun() {
  const A = Q(), M = A.moves, ink = A.sfx.ink, out = {};
  out.measure = inkMeasureAll();
  // 外层：一刀撒了多少（第二组贴图集的粒子），离人最远到哪（不画出比判定更远的清晰边界：只有低透明的墨雾、飞白）
  const n0 = ink.ink2.head;
  plaza(); clearFoes(); run([], 0.2);
  M.start('light1'); run([], 0.7);
  out.outerPerSwing = (ink.ink2.head - n0 + ink.ink2.cap) % ink.ink2.cap;
  // 爆墨只在真实命中：空挥 0；打中一个 1；同一刀重复碰撞不重复
  const h0 = ink.stat.hits;
  plaza(); clearFoes(); run([], 0.2); M.start('light2'); run([], 0.8);
  out.whiffHits = ink.stat.hits - h0;
  const h1 = ink.stat.hits;
  plaza(); foes([['shade', 2.4, 0]], { hp: 5000 }); run([], 0.2); M.start('light2'); run([], 0.8);
  out.oneTargetHits = ink.stat.hits - h1;
  const h2 = ink.stat.hits;
  plaza(); foes([['shade', 2.4, 0], ['shade', 2.6, 1.0], ['shade', 2.5, -1.0]], { hp: 5000 }); run([], 0.2); M.start('light2'); run([], 0.8);
  out.threeTargetsHits = ink.stat.hits - h2;
  // 连续普攻：同时还看得见的墨带最多几条
  plaza(); foes([['shade', 2.6, 0]], { hp: 50000 }); run([], 0.2);
  M.press('light', true);
  let maxRib = 0;
  run([], 3.0, () => { maxRib = Math.max(maxRib, ink.ribbons.filter((r) => r.state !== 'off').length); });
  M.press('light', false); run([], 1.2);
  out.chainMaxRibbons = maxRib;
  // 拔刀斩照旧（不用新笔触）
  plaza(); clearFoes(); run([], 0.2);
  M.mp = M.mpMax; equip(['qi', 'dragon', 'power', 'ult', 'seal', 'phoenix']);
  M.press('power', true); run([], 1.2); M.press('power', false); run([], 0.12);
  const rib = ink.ribbons.find((r) => r.act?.key === 'iai_slash');
  out.iai = { ribbonNew: rib ? rib.mat.uniforms.uNew.value : null, inkColor: rib ? '#' + rib.mat.uniforms.uInk.value.getHexString() : null, bands: ink.bands.filter((b) => b.state !== 'off').length };
  run([], 1.2); clearFoes();
  out.atlas = { ink2: !!ink.ink2, tiles: ink.T2 ? Object.keys(ink.T2) : [] };
  return out;
}

// =====================================================================================
// 十一、性能：15 个目标的雷击 + 连续普攻同屏，一帧一帧画（每帧读回一个像素等显卡画完）
// =====================================================================================
export function perfRun({ n = 15, frames = 720 } = {}) {
  const A = Q(), M = A.moves, D = A.dragon, P = A.player, C = A.combat, R0 = A.renderer, gl = R0.getContext(), px = new Uint8Array(4);
  equip(['qi', 'dragon', 'power', 'ult', 'seal', 'phoenix']);
  skyQuiet(true);
  const keep = R0.getSize(new A.THREE.Vector2());
  R0.setSize(1280, 720, false);
  plaza(); clearFoes();
  const center = P.pos.clone().add(new A.THREE.Vector3(Math.sin(P.heading) * 10, 0, Math.cos(P.heading) * 10)); center.y = C.groundAt(center.x, center.z, center.y + 2);
  const es = ring(n, center, 6.5);
  for (const e of es) { e.hp = e.maxHp = 50000; }
  A.cam.set(Math.PI, 0.08, 9);
  const times = [], tag = (t) => (t < 0.9 ? 'cast' : t < 10.6 ? 'storm' : t < 12 ? 'dive' : 'after');
  for (let i = 0; i < 30; i++) { const t0 = performance.now(); A.tick(1 / 60, 1, true); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  M.lock = es[0]; M.mp = M.mpMax; M.cools.dragon = 0;
  M.press('dragon', true);
  let t = 0, peak = { calls: 0, tris: 0 }, prog0 = R0.info.programs?.length ?? 0;
  const slow = [];
  R0.info.autoReset = false;
  for (let i = 0; i < frames; i++) {
    if (i === 60) M.press('light', true);
    R0.info.reset();
    const p0 = R0.info.programs?.length ?? 0;
    const t0 = performance.now(); A.tick(1 / 60, 1, true); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const ms = performance.now() - t0, st = D.S ? D.S.t : t;
    times.push([tag(st), ms]); t += 1 / 60;
    if (R0.info.render.calls > peak.calls) peak = { calls: R0.info.render.calls, tris: R0.info.render.triangles, t: r2(st) };
    slow.push([r3(st), r1(ms), (R0.info.programs?.length ?? 0) - p0]);
  }
  R0.info.autoReset = true;
  M.press('light', false);
  const info = R0.info.render;
  const stat = (tg) => { const v = times.filter((x) => x[0] === tg).map((x) => x[1]).sort((a, b) => a - b); return v.length ? { n: v.length, median: r1(v[Math.floor(v.length / 2)]), p95: r1(v[Math.min(v.length - 1, Math.floor(v.length * 0.95))]), max: r1(v[v.length - 1]) } : null; };
  const out = { cast: stat('cast'), storm: stat('storm'), dive: stat('dive'), after: stat('after'), peak, newPrograms: (R0.info.programs?.length ?? 0) - prog0, slowest: slow.sort((a, b) => b[1] - a[1]).slice(0, 6), bolts: D.fx.bolts.count };
  void info;
  R0.setSize(keep.x, keep.y, false);
  run([], 2); clearFoes();
  return out;
}

// =====================================================================================
// 七b、分段气血（试炼魔将：同一条气血按阈值转阶段，转阶段时 1.4 秒无敌）——实际伤害与名义伤害分开：到阈值封顶、无敌时不选它
// =====================================================================================
export function stagedRun() {
  const A = Q(), D = A.dragon, keep = D.rand;
  D.rand = () => 0.99;
  const r = dragonOnce({ list: [['eliteStaged', 14, 0]], hp: 5200, pre: (es) => { const e = es[0]; e.maxHp = 5200; e.hp = 2630; e.bar.set(e.hp / e.maxHp); } });
  D.rand = keep;
  const e = r.es[0], L = r.rec;
  return { stageIdx: e.stageIdx, hpLeft: r1(e.hp), lost: r1(2630 - e.hp), per: L?.per, pulses: L?.pulses.map((p) => [p.k, p.sel, p.hits, p.miss.map((m) => m.why).join(',')]), theory: DG.pulse.dmg * DG.pulse.count + DG.dive.dmg };
}

// =====================================================================================
// 十二、第五十层守关龙君：雷龙照常打（龙君自己的受击规则）；预兆选中之后、落雷之前一阶段耗尽 → 那一道作废；过场时雷龙的时钟停住（不补算）；
//   二阶段开始后新的一次脉冲按当前阶段正常结算
// =====================================================================================
export async function dragonBossRun() {
  const A = Q(), M = A.moves, D = A.dragon, C = A.combat, out = {};
  const R22 = await import('./r22_tests.js'), B16 = await import('./r16_boss_bot.js');
  if (A.ui.panelOpen) A.ui.closePanel();          // 上一次胜利的结算面板还开着时，整场守关战是暂停的
  const F = await R22.toBoss();
  if (A.ui.panelOpen) A.ui.closePanel();
  // 每次都从头开一场（上一次留下的战斗状态不带过来）：复原 → 开战 → 跳过入场过场
  F.resetFight(false); F.debug.start(); B.tick(30, 1 / 60, false); F.debug.skip(); B.tick(90, 1 / 60, false);
  A.prog.debugSetLevel(21, { qi: 0 });
  equip(WITH_DRAGON);
  F.debug.ai(false);
  B16.stage({ d: 14 });
  run([], 0.3);
  const U = F.unit, c0 = D.stats.casts;
  out.anchor = D.anchorOf(U, new A.THREE.Vector3()).toArray().map(r2); out.player = A.player.pos.toArray().map(r2); out.fight = [F.state, F.phase];
  U.hp = 4000;
  M.lock = U; M.mp = M.mpMax; M.cools.dragon = 0;
  const ev = [];
  const fn = (e) => { if (e.target === U && e.from === D.unit) ev.push({ t: r3(D.S?.t ?? -1), amount: r2(e.amount), result: e.result, phase: F.phase }); };
  C.hitListeners.add(fn);
  M.press('dragon', true);
  let ended = null, holdT = [], cineFrames = 0, maxHold = 0, holdRun = 0, wasHold = false, gameT = 0;
  const holds = [];
  run([], 45, () => {
    const S = D.S;
    gameT += 1 / 60;
    if (!!F.combatHold !== wasHold) { wasHold = !!F.combatHold; holds.push([wasHold ? 'on' : 'off', r2(gameT), S ? r3(S.t) : null, F.phase, F.state]); }
    if (F.combatHold) { cineFrames++; holdRun++; maxHold = Math.max(maxHold, holdRun); if (S) holdT.push(S.t); } else holdRun = 0;
    if (S && !ended && S.t >= 2.9 && F.phase === 1) { ended = { t: r3(S.t), sel: S.pulses[1]?.list.map((x) => x.stage) }; C.damage(U, U.hp + 10, { from: C.playerUnit, kind: 'sword' }); }
    if (!S && D.last && ended && !F.combatHold) return false;
  });
  C.hitListeners.delete(fn);
  const L = D.stats.casts > c0 ? D.last : null;
  out.committed = !!L; out.reject = L ? null : D.lastReject;
  out.ended = ended;
  out.holdFrames = cineFrames; out.holdClock = holdT.length ? [r3(Math.min(...holdT)), r3(Math.max(...holdT))] : null;
  out.pulses = L?.pulses.map((p) => [p.k, p.t, p.sel, p.hits, p.miss.map((m) => m.why).join(',')]);
  out.events = ev;
  out.phaseNow = F.phase; out.bossState = F.state; out.pools = [F.hpPool(1), F.hpPool(2)]; out.holds = holds; out.dive = L?.dive && { how: L.dive.how, direct: L.dive.direct };
  out.per = L?.per;
  F.debug.ai(true);
  for (let i = 0; i < 400 && (F.combatHold || F.cine.active); i++) A.tick(1 / 60, 1, false);    // 胜利过场放完
  if (A.ui.panelOpen) A.ui.closePanel();
  await A.game.switchWorld('surface'); B.tick(10, 1 / 60, false);
  if (A.ui.panelOpen) A.ui.closePanel();
  plaza(); run([], 0.2);
  return out;
}

// 守关战里重来（第五十层的「再战」：boss50Fight.retry → resetFight）：雷龙、雷云、裂隙、预兆、雷柱一并收掉，之后不再结算
export async function retryRun() {
  const A = Q(), M = A.moves, D = A.dragon, C = A.combat, out = {};
  const R22 = await import('./r22_tests.js'), B16 = await import('./r16_boss_bot.js');
  if (A.ui.panelOpen) A.ui.closePanel();
  const F = await R22.toBoss();
  if (A.ui.panelOpen) A.ui.closePanel();
  F.resetFight(false); F.debug.start(); B.tick(30, 1 / 60, false); F.debug.skip(); B.tick(90, 1 / 60, false);
  A.prog.debugSetLevel(21, { qi: 0 });
  equip(WITH_DRAGON);
  F.debug.ai(false);
  B16.stage({ d: 14 });
  run([], 0.3);
  const U = F.unit;
  U.hp = 1900;
  M.lock = U; M.mp = M.mpMax; M.cools.dragon = 0;
  const census = () => ({ S: !!D.S, pre: !!D.pre, rig: D.rig.root.visible, clouds: D.fx.clouds.mesh.visible, rift: D.fx.rift.g.visible, bolts: D.fx.bolts.alive(), marks: D.fx.marks.mesh.visible, area: r2(D.fx.area.a) });
  M.press('dragon', true); run([], 4.0);
  out.before = { ...census(), t: r2(D.S?.t ?? -1) };
  let n = 0;
  const fn = (e) => { if (e.from === D.unit) n++; };
  C.hitListeners.add(fn);
  await F.retry(true);
  run([], 0.1);
  out.after = { ...census(), last: D.last?.reason, fight: F.state };
  run([], 8.0);
  out.after8s = { ...census(), dragonHits: n };
  C.hitListeners.delete(fn);
  F.debug.ai(true);
  if (A.ui.panelOpen) A.ui.closePanel();
  await A.game.switchWorld('surface'); B.tick(10, 1 / 60, false);
  if (A.ui.panelOpen) A.ui.closePanel();
  plaza(); run([], 0.2);
  return out;
}
