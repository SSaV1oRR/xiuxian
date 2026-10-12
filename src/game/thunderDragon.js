// 第二十三轮：雷龙破虚（参数见 combatConfig.js 的 DRAGON；龙的模型与骨骼 actors/loong.js；特效 game/thunderFx.js）。同时最多一条。
//
// 选点：按键那一刻依次看——玩家锁定（Tab）的有效敌人 → 准星射线先碰到的有效敌人 → 准星射线碰到的地面。敌人：以它脚下的地面为雷云中心，并记作俯冲的主要目标
//   （锁定只决定初始选点与主要目标，雷云照样打范围里的所有敌人）。起势的 0.65 秒里选点跟着走（锁定 / 准星选中的敌人跟着它，准星选的地面跟着准星）；
//   锁定的目标失效时不会改去别的远处敌人——改按准星重选，预览与提示写明「改按准星」。
// 校验（按键时与 0.65 秒提交时各一次）：离主人（脚下）三维距离 ≤ 30 米、主人胸口到选点之间没有墙体与山石、选点有合法地面（不是水面、虚空）、
//   选点正上方与四周 9.5 米内、裂隙所在处都没有实心体（屋顶、岩顶、殿顶）、在当前地图的可施法范围里；提交时另查活着、已装备已习得、灵力与冷却、没有另一条龙。
//   不通过：不放、不扣灵力、不进冷却，地上留一会儿红圈与原因。预览圈的半径就是结算用的 DRAGON.radius，圆心就是结算的中心。
// 提交（0.65 秒）：扣灵力、进 120 秒冷却（moves.release）、记快照（等级成长 × 装备 × 被动 × 临时增伤；暴击率）、定下雷云中心与主要目标；
//   之后自己演完，主人照常走、出剑、闪身、格挡、弹反，雷云中心不随主人移动。
// 时间轴（从按键起算）：0.65 裂隙细裂 → 1.0 撑开 → 0.92 起龙头探出、身体逐段穿出裂隙（裁切平面：裂隙背后的部分不画）→ 2.4 起在雷云间盘游 →
//   落雷 2.4、3.2 … 9.6 共 10 次（每次：落雷前 0.35 秒选目标、起预兆，0.12 秒锁定落点，到时落雷结算）→ 10.0 蓄势（俯冲落点可有限追踪主要目标）→
//   10.6 落点定下、俯冲（连续碰撞，在实际接触处爆雷）→ 之后 1 秒雷云、裂隙、电弧渐隐。一律用战斗时钟（暂停、失焦、Boss 过场不走，不补算）。
// 目标（每次脉冲重新选）：敌方、活着、不在禁止受击的状态、离雷云中心（水平，按身体最近处）不超过作用半径、高度在范围里、头顶到云底之间没有屋顶等实心体；
//   超过 15 个时：主要目标优先，其余按离中心由近到远、同距离按稳定编号。每个目标每次脉冲至多受伤一次（施法号 + 脉冲号 + 目标号去重）。
//   雷柱跟着预兆走到锁定那一刻，之后落在锁定点：目标那时已离开落点（加身体半径 1.6 米外）就不算打中（雷落空，没有伤害、也不报命中）；
//   守关龙君转阶段：选中时记下阶段号，落雷时阶段已变的那一道作废；新的一次脉冲按当前阶段正常结算。
// 伤害（21 级、倍率 1、防御前、不暴击）：每次脉冲每个目标 60；俯冲直接命中 900（按直接攻击的暴击规则）；周围爆发 300（直接目标不重复吃）。
import * as THREE from 'three';
import { DRAGON as DG, PLAYER_COMBAT as PC } from './combatConfig.js';
import { statMul } from './progression.js';
import { LoongRig } from '../actors/loong.js';
import { ThunderFx } from './thunderFx.js';

const Y = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth01 = (x) => { const u = clamp(x, 0, 1); return u * u * (3 - 2 * u); };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _tip = new THREE.Vector3(), _base = new THREE.Vector3();
let CAST = 0, TID = 0;
const SUB = 1 / 120;                // 龙头路径、俯冲碰撞的取样步长（秒，按施法时钟的固定格子：与帧率无关）

// 线段 p0p1 与线段 q0q1 的最近距离（{ d, s 在 p 上的比例 }）
function segSeg(p0, p1, q0, q1) {
  const d1 = _a.subVectors(p1, p0), d2 = _b.subVectors(q1, q0), r = _u.subVectors(p0, q0);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) { s = t = 0; }
  else if (a <= 1e-9) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1.dot(r);
    if (e <= 1e-9) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den !== 0 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const cx = p0.x + d1.x * s - (q0.x + d2.x * t), cy = p0.y + d1.y * s - (q0.y + d2.y * t), cz = p0.z + d1.z * s - (q0.z + d2.z * t);
  return { d: Math.hypot(cx, cy, cz), s };
}
// 三次埃尔米特：p0、v0（速度 × 时长）→ p1、v1
function hermite(p0, v0, p1, v1, s, out) {
  const s2 = s * s, s3 = s2 * s, h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  return out.set(p0.x * h00 + v0.x * h10 + p1.x * h01 + v1.x * h11, p0.y * h00 + v0.y * h10 + p1.y * h01 + v1.y * h11, p0.z * h00 + v0.z * h10 + p1.z * h01 + v1.z * h11);
}

export class ThunderDragon {
  // combat / moves / player / cam / prog：现有系统；sound：音效；toast(html)；loadout：装备槽；gltf：loong.glb；bolts：lightning.glb；
  // vfx / lights：粒子与共用点光；solidAt(x, y, z)：此处是不是实心体（场景给；见 setWorld）；quality：0.5 … 1
  constructor({ combat, moves, player, cam, prog, sound, toast, loadout, gltf = null, bolts = null, vfx, lights = null, quality = 1, flash = null }) {
    Object.assign(this, { combat, moves, player, cam, prog, sound, loadout });
    this.toast = toast || (() => {});
    this.rig = gltf ? new LoongRig(gltf, { length: DG.model.length }) : null;
    const geos = [];
    bolts?.scene.traverse((o) => { if (o.isMesh) geos.push(o.geometry); });
    this.fx = new ThunderFx(combat.scene, { vfx, lights, boltGeos: geos, quality, flash });
    if (this.rig) combat.scene.add(this.rig.root);
    this.unit = { ownerPlayer: true, faction: 'sect', id: 'loong', kind: 'loong', cfg: { name: '雷龙' }, pos: new THREE.Vector3() };
    this.S = null;                 // 当前这一条龙（提交之后）
    this.pre = null;               // 起势中的选点与预览
    this.pendingSel = null;
    this.rejectT = 0;              // 不合法时红圈留到什么时候
    this.solidAt = () => false;
    this.bounds = null;            // (p) → 是否在可施法的地界里
    this.t = 0;                    // 战斗时钟
    this.rand = Math.random;
    this.crits = new Map();
    this.last = null;              // 最近一次施法的完整记录（自检、报告）
    this.stats = { casts: 0, rejects: {}, pulses: 0, strikes: 0, pulseDmg: 0, dives: 0, diveDmg: 0, burstDmg: 0, crits: 0 };
    this.label = this.makeLabel();
  }
  get active() { return !!this.S; }
  get casting() { return !!this.pre; }
  get unlocked() { return this.prog.level >= DG.unlock; }
  cost() { return (this.moves.mpMax ?? PC.mp) * DG.mpCost; }
  // 场景：实心体判断、地界（main.js 换场景时设）
  setWorld({ solidAt = null, bounds = null } = {}) { this.solidAt = solidAt || (() => false); this.bounds = bounds; }

  // =====================================================================================
  // 选点与校验
  // =====================================================================================
  // 有效的敌方目标（可被选作主要目标）
  validTarget(u) { return !!u && u.alive && !u.hidden?.() && u.state !== 'dormant' && this.combat.targets().includes(u); }
  // 单位脚下的地面中心（守关龙君：各段身体中点的平均）
  anchorOf(u, out) {
    if (u.capsules) { const cs = u.capsules(); if (cs?.length) { out.set(0, 0, 0); for (const c of cs) out.add(_v.addVectors(c.a, c.b).multiplyScalar(0.5)); out.divideScalar(cs.length); out.y = u.pos.y; } else out.copy(u.pos); }
    else out.copy(u.pos);
    out.y = this.groundUnder(out.x, out.z, out.y + 1.2);
    return out;
  }
  capsulesOf(u) {
    if (u.capsules) { const cs = u.capsules(); if (cs?.length) return cs; }
    const top = (u.headY ?? u.pos.y + 1.8) - 0.15;
    return [{ a: new THREE.Vector3(u.pos.x, u.pos.y + 0.35, u.pos.z), b: new THREE.Vector3(u.pos.x, Math.max(u.pos.y + 0.6, top), u.pos.z), r: u.radius ?? 0.45 }];
  }
  // 单位身上离点 p 最近的一处（水平距离；身体半径算进去）
  nearestPoint(u, p) {
    let best = null;
    for (const c of this.capsulesOf(u)) {
      const ab = _u.subVectors(c.b, c.a), L2 = ab.lengthSq();
      const t = L2 > 1e-9 ? clamp(_v.subVectors(p, c.a).dot(ab) / L2, 0, 1) : 0;
      const q = c.a.clone().addScaledVector(ab, t);
      const dh = Math.max(0, Math.hypot(q.x - p.x, q.z - p.z) - c.r);
      if (!best || dh < best.d) best = { d: dh, p: q, top: Math.max(c.a.y, c.b.y) + c.r, part: c.part ?? null };
    }
    return best || { d: Infinity, p: u.pos.clone(), top: u.pos.y + 1.8, part: null };
  }
  groundUnder(x, z, y) {
    const W = this.combat.world, T = W.terrain;
    let g = T.heightAt(x, z);
    const c = W.cw?.ground(x, z, y, 0.05);
    if (c > g) g = c;
    if (this.combat.worldName === 'surface' && this.player.skyGround) { const s = this.player.skyGround(x, z, y); if (s > g && s <= y + 0.05) g = s; }
    return g;
  }
  // 准星射线：先碰到的是敌人、墙、实心体还是地面。从人物那里算起（射线上离人物胸口最近的一点往回 0.5 米）：
  //   镜头与人物之间的东西不算——镜头被身后的墙、檐角挤着时，射线不会一出镜头就碰上那面墙
  aimRay() {
    const c = this.cam, o = new THREE.Vector3(), d = new THREE.Vector3(), cp = Math.cos(c.pitch);
    c.camera.getWorldPosition(o);
    d.set(Math.sin(c.yaw) * cp, -Math.sin(c.pitch), Math.cos(c.yaw) * cp).normalize();
    const max = DG.aimRay, P = this.player.pos;
    const t0 = clamp((P.x - o.x) * d.x + (P.y + 1.4 - o.y) * d.y + (P.z - o.z) * d.z - 0.5, 0, max * 0.5);
    let t = max, kind = 'none', hitU = null;
    const end = o.clone().addScaledVector(d, max);
    for (const u of this.combat.targets()) {
      if (!this.validTarget(u)) continue;
      for (const cc of this.capsulesOf(u)) { const q = segSeg(o, end, cc.a, cc.b); if (q.d <= cc.r + 0.15 && q.s * max >= t0 && q.s * max < t) { t = q.s * max; kind = 'enemy'; hitU = u; } }
    }
    const W = this.combat.world;
    if (W?.cw?.ray) { const tw = t0 + W.cw.ray(o.clone().addScaledVector(d, t0), d, t - t0); if (tw < t) { t = tw; kind = 'wall'; hitU = null; } }
    // 地面与实心体：每 0.4 米一步，碰到就二分
    const hitAt = (s) => { const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s; if (y <= this.groundUnder(x, z, y + 0.05)) return 1; if (this.solidAt(x, y, z)) return 2; return 0; };
    let prev = t0;
    for (let s = t0 + 0.4; s <= t + 1e-6; s += 0.4) {
      const h = hitAt(s);
      if (h) {
        let lo = prev, hi = s;
        for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (hitAt(m)) hi = m; else lo = m; }
        if (hi < t) { t = hi; kind = h === 1 ? 'ground' : 'solid'; hitU = null; }
        break;
      }
      prev = s;
    }
    return { o, d, t, kind, u: hitU, p: o.clone().addScaledVector(d, t) };
  }
  // 选点：{ src: lock | enemy | ground, u, point, code（不合法时）, fallback（锁定失效改按准星）}
  select({ noLock = false } = {}) {
    const L = this.moves.lock;
    if (!noLock && L && this.validTarget(L)) return { src: 'lock', u: L, point: this.anchorOf(L, new THREE.Vector3()) };
    const A = this.aimRay();
    if (A.kind === 'enemy') return { src: 'enemy', u: A.u, point: this.anchorOf(A.u, new THREE.Vector3()) };
    if (A.kind === 'ground') return { src: 'ground', u: null, point: A.p.clone().setY(this.groundUnder(A.p.x, A.p.z, A.p.y + 0.3)) };
    if (A.kind === 'wall' || A.kind === 'solid') {
      // 墙脚：碰到的地方离地不到 2.5 米，取往回 0.6 米处的地面
      const q = A.p.clone().addScaledVector(A.d, -0.6), g = this.groundUnder(q.x, q.z, q.y + 0.2);
      if (q.y - g < 2.5) return { src: 'ground', u: null, point: q.setY(g) };
      return { src: 'ground', u: null, point: null, code: 'wall', aim: A.p };
    }
    return { src: 'ground', u: null, point: null, code: 'noground', aim: A.p };
  }
  // 起势中跟着走：锁定 / 准星选中的敌人跟着它；失效时按准星重选（不改去锁定以外的远处敌人）；准星选的地面跟着准星
  track(sel) {
    if ((sel.src === 'lock' || sel.src === 'enemy') && sel.u) {
      if (this.validTarget(sel.u)) { this.anchorOf(sel.u, sel.point || (sel.point = new THREE.Vector3())); return sel; }
      const s = this.select({ noLock: true }); s.fallback = sel.src; return s;
    }
    const s = this.select({ noLock: true });
    if (sel.fallback) s.fallback = sel.fallback;
    return s;
  }
  // 两点之间没有墙体（构筑物射线）、山石与实心体
  clearLine(a, b) {
    const W = this.combat.world, d = _w.subVectors(b, a), len = d.length();
    if (len < 0.3) return true;
    d.divideScalar(len);
    if (W.cw?.ray && W.cw.ray(a, d, len) < len - 0.3) return false;
    const n = Math.ceil(len / 0.5);
    for (let i = 1; i < n; i++) {
      const p = _v.copy(a).addScaledVector(d, (len * i) / n);
      if (p.y < W.terrain.heightAt(p.x, p.z) - 0.25) return false;
      if (this.solidAt(p.x, p.y, p.z)) return false;
    }
    return true;
  }
  // 头顶 → 云底这一段竖直的空间没有屋顶等实心体（雷击不穿屋顶）
  skyClear(x, z, y0, y1) {
    const W = this.combat.world;
    if (W.cw?.ray) { const t = W.cw.ray(_v.set(x, y0, z), Y, y1 - y0); if (t < y1 - y0 - 0.05) return false; }
    for (let y = y0 + 0.3; y < y1; y += 0.5) { if (this.solidAt(x, y, z)) return false; if (y < W.terrain.heightAt(x, z) - 0.2) return false; }
    return true;
  }
  // 校验一个选点：{ ok, code, text, dist }
  validate(sel, origin = this.player.pos) {
    const fail = (code, text, extra = {}) => ({ ok: false, code, text, ...extra });
    if (!sel || !sel.point) return fail(sel?.code || 'noground', sel?.code === 'wall' ? '准星对着墙体、屋顶——没有落点' : '准星下没有可落雷的地面');
    const p = sel.point, dist = origin.distanceTo(p);
    if (dist > DG.range) return fail('far', `超出 ${DG.range} 米（${dist.toFixed(1)} 米）`, { dist });
    if (this.bounds && !this.bounds(p)) return fail('bounds', '超出可施法的地界', { dist });
    const W = this.combat.world, wa = W.terrain.waterAt?.(p.x, p.z);
    if (wa != null && wa - p.y > 0.3) return fail('water', '水面上没有落点', { dist });
    if (!(p.y > -1e8)) return fail('noground', '准星下没有可落雷的地面', { dist });
    // 主人胸口 → 选点上方 1、2.2、3.5 米三处，任一处没有墙体、山石、实心体挡着即可（站在台上打台沿下的敌人看得见头；整面墙三条都挡）
    const chest = _a.set(origin.x, origin.y + 1.4, origin.z).clone();
    if (![1.0, 2.2, 3.5].some((h) => this.clearLine(chest, new THREE.Vector3(p.x, p.y + h, p.z)))) return fail('blocked', '被墙体或山石挡住', { dist });
    if (!this.spaceOk(p, origin)) return fail('space', '上方空间不足（屋檐、岩顶、殿顶）', { dist });
    return { ok: true, dist };
  }
  // 演出空间：选点正上方 2.4–clear 米、四周 ring 米的四点在龙与雷云所在的高度（low 米以上）、裂隙所在处，都没有实心体；
  // 四周更低处的屋檐、回廊不挡（屋檐下的敌人由每次雷击的「头顶到云底」检查挡住，雷不穿屋顶）
  spaceOk(p, origin) {
    const S = DG.space, f = this.frame(p, origin);
    const pts = [[0, 0], [S.ring, 0], [-S.ring, 0], [0, S.ring], [0, -S.ring]];
    for (const [a, b] of pts) {
      const x = p.x + f.f.x * a + f.r.x * b, z = p.z + f.f.z * a + f.r.z * b;
      for (let h = a || b ? S.low : 2.4; h <= S.clear; h += 0.8) { const y = p.y + h; if (this.solidAt(x, y, z) || y < this.combat.world.terrain.heightAt(x, z) - 0.2) return false; }
    }
    const rc = this.riftPos(p, f.f, _w);
    for (const dy of [-2.5, 0, 2.5]) if (this.solidAt(rc.x, rc.y + dy, rc.z)) return false;
    return true;
  }
  // 以选点为中心的水平基：f 朝施法者，r 在它右手边
  frame(c, origin) {
    const f = new THREE.Vector3(origin.x - c.x, 0, origin.z - c.z);
    if (f.lengthSq() < 1) f.set(-Math.sin(this.player.heading), 0, -Math.cos(this.player.heading));
    f.normalize();
    return { f, r: new THREE.Vector3().crossVectors(f, Y).normalize() };
  }
  riftPos(c, f, out) { const r = _u.crossVectors(f, Y).normalize(); return out.copy(c).addScaledVector(f, -DG.rift.back).addScaledVector(r, DG.rift.side).setY(c.y + DG.rift.h); }

  // =====================================================================================
  // 起手（moves.doSkill → canCast；moves.stepDragon → castStep / commit；取消 → cancelCast）
  // =====================================================================================
  canCast() {
    if (!this.unlocked) return { ok: false, reason: 'dragonLocked' };
    if (!this.rig || !this.fx.bolts.kinds.length) return { ok: false, reason: 'dragonAsset' };
    if (this.S || this.pre) return { ok: false, reason: 'dragonOne' };
    const W = this.combat.worldName;
    if (W === 'hall' || W === 'alchemy' || W === 'tower') return { ok: false, reason: 'indoor' };
    const sel = this.select(), v = this.validate(sel);
    if (!v.ok) { this.reject(sel, v); return { ok: false, reason: 'dragonPoint', text: v.text, code: v.code }; }
    this.pendingSel = sel;
    return { ok: true };
  }
  // 不合法：地上留一会儿红圈（选点处；没有选点时取准星处）与原因
  reject(sel, v) {
    this.stats.rejects[v.code] = (this.stats.rejects[v.code] || 0) + 1;
    this.lastReject = { code: v.code, text: v.text, dist: v.dist != null ? +v.dist.toFixed(2) : null, src: sel?.src, at: sel?.point ? sel.point.toArray().map((x) => +x.toFixed(2)) : null, t: +this.t.toFixed(3) };
    const p = sel?.point || (sel?.aim ? sel.aim.clone().setY(this.groundUnder(sel.aim.x, sel.aim.z, sel.aim.y + 0.3)) : null);
    if (p && p.y > -1e8) { this.fx.area.place(p, DG.radius, (x, z, y) => this.groundUnder(x, z, y)); this.fx.area.show(false, 1); this.labelAt = p.clone(); }
    else this.labelAt = null;
    this.labelText = v.text; this.labelBad = true;
    this.rejectT = this.t + 1.4;
  }
  castStep(a, t0, t1) {
    if (a.released) return;
    let p = this.pre;
    if (!p || p.a !== a) {
      p = this.pre = { a, sel: this.pendingSel || this.select(), t: 0 };
      this.pendingSel = null;
      this.rejectT = 0;
    }
    p.t = t1;
    p.sel = this.track(p.sel);
    p.val = this.validate(p.sel);
    const pt = p.sel.point;
    if (pt) { this.fx.area.place(pt, DG.radius, (x, z, y) => this.groundUnder(x, z, y)); this.fx.area.show(p.val.ok, 1); this.labelAt = pt.clone(); }
    else { this.fx.area.hide(); this.labelAt = null; }
    this.labelBad = !p.val.ok;
    const who = p.sel.u ? (p.sel.u.cfg?.name || p.sel.u.name || '敌人') : null;
    this.labelText = p.val.ok ? `${p.sel.fallback ? '锁定目标已失效 · 改按准星 · ' : ''}${p.sel.src === 'lock' ? '锁定' : p.sel.src === 'enemy' ? '准星' : '准星处'}${who ? '：' + who : ''} · ${p.val.dist.toFixed(1)} 米` : p.val.text;
    // 剑上聚雷（越近提交越密、越亮）
    const ch = this.player.char;
    if (ch.handSword) { ch.bladeEnds(_tip, _base); this.fx.gather(_tip, _base, clamp(t1 / DG.t.commit, 0, 1)); }
    void t0;
  }
  // 起势时人朝哪里（选点的方向）
  aimYaw() {
    const p = this.pre?.sel?.point, P = this.player.pos;
    return p ? Math.atan2(p.x - P.x, p.z - P.z) : null;
  }
  // 0.65 秒：终检，通过就开演出（灵力、冷却由 moves.release 扣）
  commit(a) {
    const p = this.pre;
    this.pre = null;
    if (!p || p.a !== a) return { ok: false, reason: 'dragonPoint', text: '没有选点' };
    const M = this.moves, fail = (code, text) => { const v = { ok: false, code, text }; this.reject(p.sel, v); return { ok: false, reason: 'dragonPoint', text, code }; };
    if (!this.combat.playerUnit.alive) return fail('dead', '力竭');
    if (this.loadout && !this.loadout.equipped('dragon')) return fail('unequipped', '雷龙破虚没有装备');
    if (!this.unlocked) return fail('locked', '雷龙破虚：金丹初期解锁');
    if ((M.cools.dragon ?? 0) > 0) return fail('cool', '尚在调息');
    if (M.mp < this.cost()) return fail('mp', '灵力不足');
    if (this.S) return fail('one', '雷龙已在场');
    p.sel = this.track(p.sel);
    const v = this.validate(p.sel);
    if (!v.ok) { this.reject(p.sel, v); return { ok: false, reason: 'dragonPoint', text: v.text, code: v.code }; }
    this.begin(p.sel, v);
    return { ok: true };
  }
  cancelCast(reason, a = null) {
    if (this.pre && (!a || this.pre.a === a)) this.pre = null;
    if (this.rejectT <= this.t) { this.fx.area.hide(); this.labelAt = null; }
    this.lastCancel = { reason, t: +this.t.toFixed(3) };
  }

  // =====================================================================================
  // 演出
  // =====================================================================================
  snapshot() {
    const P = this.prog, L = P.level;
    const k = { level: statMul('dmg', L), equip: P.equip?.dmgMul ?? 1, passive: 1, temp: 1 };
    const m = k.level * k.equip * k.passive * k.temp;
    return { L, k, dmgK: m, pulse: DG.pulse.dmg * m, dive: DG.dive.dmg * m, burst: DG.dive.burst * m, crit: { ...DG.dive.crit } };
  }
  begin(sel, v) {
    const P = this.player, C = sel.point.clone(), origin = P.pos.clone(), { f, r } = this.frame(C, origin);
    const S = this.S = {
      castId: ++CAST, t: DG.t.commit, tS: DG.t.commit, origin, C, f, r, primary: sel.u && sel.u.alive ? sel.u : null, src: sel.src, dist: v.dist, snap: this.snapshot(),
      rift: this.riftPos(C, f, new THREE.Vector3()), fired: new Set(), pulses: [], hitKeys: new Set(), per: new Map(), ended: false, endT: null,
      dive: { to: null, last: null, from: null, done: false, contact: null, stage: null }, log: [], head: new THREE.Vector3(), clipOff: false, ph: 0,
    };
    this.stats.casts++;
    // 雷云、裂隙
    this.fx.buildClouds(C, f, r);
    this.fx.rift.place(S.rift, f, DG.rift.w, DG.rift.tall, 0.18);
    this.fx.rift.set({ crack: 0, open: 0, fade: 1 });
    // 剑尖一道雷直上裂隙
    const ch = P.char;
    if (ch.handSword) { ch.bladeEnds(_tip, _base); this.fx.commitBolt(_tip, S.rift); } else this.fx.commitBolt(_v.set(P.pos.x, P.pos.y + 1.8, P.pos.z), S.rift);
    this.sound?.play('riftTear', { at: S.rift });
    this.combat.flash?.(DG.colors.core, 0.12);
    // 龙：轨迹先铺在裂隙背后的虚空里（直线），头在裂隙后 1.6 米
    const rig = this.rig, p0 = this.headAt(S, DG.t.emerge, new THREE.Vector3());
    const pts = [];
    const back = rig.bodyLen + 6;
    for (let s = back; s >= 0; s -= 0.25) pts.push(p0.clone().addScaledVector(f, -s));
    rig.trail.reset(pts);
    rig.setClip(f, S.rift);
    rig.root.visible = false;
    rig.st.jaw = 0; rig.st.claw = 0;
    rig.U.uDissolve.value = 0; rig.U.uFade.value = 1;
    if (rig.root.parent !== this.combat.scene) this.combat.scene.add(rig.root);
    // 地上的范围圈：攻击期间淡淡地留着（与结算同一个圆）
    this.fx.area.place(C, DG.radius, (x, z, y) => this.groundUnder(x, z, y));
    this.fx.area.show(true, 0.32);
    this.labelAt = null;
    this.log('commit', { castId: S.castId, src: S.src, dist: +v.dist.toFixed(2), C: C.toArray().map((x) => +x.toFixed(2)), primary: S.primary ? this.tid(S.primary) : null, dmgK: +S.snap.dmgK.toFixed(4) });
  }
  // 龙头在施法时刻 t 的位置（由裂隙探出 → 冲出裂隙、越过雷云中心上空 → 回旋半圈并入盘游 → 蓄势 → 俯冲；按施法时钟算，不按帧积分，与帧率无关）
  // 盘游：从雷云左侧（入圈处）起，绕中心俯视顺时针转；入圈时较快（vIn），ease 秒内缓到巡游的角速度 w；半径、高度有起伏（入圈那一刻起伏的变化率为 0，接得平顺）
  loopAt(S, t, out) {
    const W = DG.swim, E = DG.emerge, u = t - DG.t.swim[0];
    const w0 = E.vIn / W.r, th = -Math.PI / 2 - (W.w * u + (w0 - W.w) * E.ease * (1 - Math.exp(-u / E.ease)));
    const rho = W.r + 0.8 * Math.sin(0.9 * u) * smooth01(u / 0.8);
    return out.copy(S.C).addScaledVector(S.f, Math.cos(th) * rho).addScaledVector(S.r, Math.sin(th) * rho).setY(S.C.y + W.h + W.bob * Math.cos(1.6 * u));
  }
  velAt(fn, S, t, out) { fn.call(this, S, t + 1e-3, _a); fn.call(this, S, t - 1e-3, _b); return out.subVectors(_a, _b).divideScalar(2e-3); }
  // 出场的路径（第一次用到时算好，纯几何 + 速度表）：裂隙背后 1.6 米 → 穿出裂隙、往施法者一侧抬升（Hermite）→ 雷云中心右侧 top 米高处 →
  //   向左回旋半圈（半径 turnR；回旋的圆与盘游的圆内切）→ 雷云左侧，方向、高度、速度都与盘游的起点接上。
  //   按弧长走：速度由 v0 线性变到入圈速度 v1，用时正好 swim[0] − emerge（v0 由此解出）
  emergePath(S) {
    if (S.ep) return S.ep;
    const T = DG.t, W = DG.swim, E = DG.emerge, Rt = E.turnR, cy = -(W.r - Rt), hE = W.h + W.bob;
    const at = (x, y, h) => new THREE.Vector3().copy(S.C).addScaledVector(S.f, x).addScaledVector(S.r, y).setY(S.C.y + h);
    const p0 = S.rift.clone().addScaledVector(S.f, -1.6), q0 = at(0, cy + Rt, E.top), L1 = p0.distanceTo(q0);
    const t0 = S.f.clone().addScaledVector(Y, E.rise).normalize().multiplyScalar(L1), t1 = S.f.clone().multiplyScalar(L1);
    const pts = [], N1 = 64, N2 = 96;
    for (let i = 0; i <= N1; i++) pts.push(hermite(p0, t0, q0, t1, i / N1, new THREE.Vector3()));
    for (let i = 1; i <= N2; i++) { const ph = (Math.PI * i) / N2; pts.push(at(Rt * Math.sin(ph), cy + Rt * Math.cos(ph), E.top + (hE - E.top) * smooth01(ph / Math.PI))); }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const L = cum[cum.length - 1], dur = T.swim[0] - T.emerge, v1 = this.velAt(this.loopAt, S, T.swim[0] + 2e-3, new THREE.Vector3()).length();
    const timeOf = (v0) => (Math.abs(v1 - v0) < 1e-6 ? L / v0 : (L * Math.log(v1 / v0)) / (v1 - v0));
    let lo = 0.5, hi = 80;
    for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (timeOf(m) > dur) lo = m; else hi = m; }
    const v0 = (lo + hi) / 2;
    return (S.ep = { pts, cum, L, v0, v1, kk: (v1 - v0) / L, dur });
  }
  emergeAt(S, t, out) {
    const E = this.emergePath(S), tau = clamp(t - DG.t.emerge, 0, E.dur);
    const s = Math.abs(E.kk) < 1e-9 ? E.v0 * tau : (E.v0 / E.kk) * (Math.exp(E.kk * tau) - 1), { pts, cum } = E;
    let lo = 0, hi = cum.length - 1;
    if (s >= cum[hi]) return out.copy(pts[hi]);
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    return out.lerpVectors(pts[lo], pts[hi], (s - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]));
  }
  headAt(S, t, out) {
    const T = DG.t;
    if (t <= T.emerge) return out.copy(S.rift).addScaledVector(S.f, -1.6);
    if (t < T.swim[0]) return this.emergeAt(S, t, out);
    if (t < DG.charge.from) return this.loopAt(S, t, out);
    if (t < T.dive[0] || !S.dive.curve) return this.chargeAt(S, Math.min(t, T.dive[0]), out);
    // 俯冲：接触之后停在接触处
    if (S.dive.contact) return out.copy(S.dive.contact);
    return this.diveAt(S, t, out);
  }
  // 蓄势：接着盘游转，由 charge.from 起半径收到 charge.r、高度抬到 charge.h（平滑过渡：起止处的变化率与盘游接上）——盘起身子、越收越慢；
  //   末了的方向仍是水平的盘游方向
  chargeAt(S, t, out) {
    const T = DG.t, Cg = DG.charge, k = smooth01((t - Cg.from) / (T.charge[1] - Cg.from));
    this.loopAt(S, t, out);
    const dx = out.x - S.C.x, dz = out.z - S.C.z, rho = Math.max(1e-6, Math.hypot(dx, dz)), rr = rho + (Cg.r - rho) * k;
    out.x = S.C.x + (dx / rho) * rr; out.z = S.C.z + (dz / rho) * rr;
    out.y += (S.C.y + Cg.h - out.y) * k;
    return out;
  }
  // 俯冲（10.6 起；落点此刻定下）：圆弧（顺着蓄势末的方向转向落点）+ 直线扑下；按走过的距离 d = v0·τ + ½·α·τ²（起点速度与蓄势末接上，越扑越快）；
  //   到了落点还没碰到东西，就顺着方向再冲一截（连续碰撞，在实际接触处爆雷）
  diveAt(S, t, out) {
    const K = S.dive.curve, tau = Math.max(0, t - DG.t.dive[0]);
    const d = Math.min(K.stot * DG.dive.over, K.v0 * tau + 0.5 * K.alpha * tau * tau);
    if (d <= K.sarc) { const ps = d / Math.max(1e-6, K.R); return out.copy(K.p0).addScaledVector(K.a, K.R * Math.sin(ps)).addScaledVector(K.w, K.R * (1 - Math.cos(ps))); }
    return out.copy(K.E).addScaledVector(K.dir, d - K.sarc);
  }
  // 由 p0、方向 a 出发，沿圆弧（半径 R，在 a 与落点所在的平面里）转到正对落点 p1，再走直线：{ a, w, R, φ, E 弧的终点, dir 直线方向, sarc, stot }
  divePath(p0, a, p1, R0) {
    const c = p1.clone().sub(p0), X = c.dot(a), wv = c.clone().addScaledVector(a, -X), Yp = wv.length();
    const out = { p0: p0.clone(), a: a.clone(), w: new THREE.Vector3(), R: 0, phi: 0 };
    if (Yp > 1e-3) {
      out.w.copy(wv).divideScalar(Yp);
      const R = Math.min(R0, ((X * X + Yp * Yp) / (2 * Yp)) * 0.95);
      // 弧上转过 φ 后切线正对落点：X·sinφ + (R − Yp)·cosφ = R；取向前（切线朝着落点）的最小 φ
      const M = Math.hypot(X, R - Yp), del = Math.atan2(R - Yp, X), as = Math.asin(clamp(R / M, -1, 1));
      let best = null;
      for (let phi of [as - del, Math.PI - as - del]) {
        phi = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const ex = R * Math.sin(phi), ey = R * (1 - Math.cos(phi)), fwd = (X - ex) * Math.cos(phi) + (Yp - ey) * Math.sin(phi);
        if (fwd > 0 && (best == null || phi < best)) best = phi;
      }
      if (best != null) { out.R = R; out.phi = best; }
    }
    out.sarc = out.R * out.phi;
    out.E = out.p0.clone().addScaledVector(out.a, out.R * Math.sin(out.phi)).addScaledVector(out.w, out.R * (1 - Math.cos(out.phi)));
    out.dir = p1.clone().sub(out.E);
    const Ls = out.dir.length();
    if (Ls > 1e-6) out.dir.divideScalar(Ls); else out.dir.copy(a);
    out.stot = out.sarc + Ls;
    return out;
  }
  // 蓄势时的俯冲落点：主要目标活着、离施法起点 30 米内、离雷云中心不超过半径 + track、看得见、头顶空着——就跟着它；否则用最后一个合法的位置；从来没有就是雷云中心
  trackDive(S) {
    const u = S.primary, D = S.dive;
    if (u && this.validTarget(u)) {
      const p = this.anchorOf(u, new THREE.Vector3());
      const ok = S.origin.distanceTo(p) <= DG.range && Math.hypot(p.x - S.C.x, p.z - S.C.z) <= DG.radius + DG.dive.track
        && this.clearLine(_a.copy(S.C).setY(S.C.y + DG.dive.height).clone(), _b.copy(p).setY(p.y + 1).clone()) && this.skyClear(p.x, p.z, p.y + 2, p.y + DG.dive.height);
      if (ok) { D.last = p; D.lastOk = true; return p; }
    }
    D.lastOk = false;
    return D.last || S.C;
  }

  // =====================================================================================
  // 每帧
  // =====================================================================================
  update(dt, { hold = false, camera = null } = {}) {
    const cdt = hold ? 0 : dt;
    this.t += cdt;
    if (!this.pre && this.rejectT && this.t >= this.rejectT) { this.rejectT = 0; if (!this.S) this.fx.area.hide(); else this.fx.area.show(true, 0.32); this.labelAt = null; }
    const S = this.S;
    if (S) this.step(S, cdt);
    if (this.quakeS) this.stepQuake(cdt);
    this.fx.update(cdt, camera);
    this.updateLabel(camera);
  }
  once(S, name, at, fn) { if (S.fired.has(name) || S.t < at) return; S.fired.add(name); fn(); }
  step(S, dt) {
    const T = DG.t, t0 = S.t;
    S.t += dt;
    const t = S.t;
    // ---------- 裂隙、雷云 ----------
    const endK = S.endT != null ? smooth01((t - S.endT) / T.fade) : 0;
    const Rf = DG.rift, narrow = 1 - (1 - Rf.narrow) * smooth01((t - Rf.shrink[0]) / (Rf.shrink[1] - Rf.shrink[0]));     // 龙穿出之后收成一道细缝
    this.fx.rift.set({ crack: smooth01((t - T.crack[0]) / (T.crack[1] - T.crack[0])) * (1 - endK * 0.6), open: smooth01((t - T.open[0]) / (T.open[1] - T.open[0])) * narrow * (1 - endK), fade: 1 - endK });
    this.fx.cloudFade = smooth01((t - T.clouds[0]) / (T.clouds[1] - T.clouds[0])) * (1 - endK);
    // ---------- 龙头的路径：按 1/120 秒的固定格子取样，推进轨迹；俯冲时逐段检查接触 ----------
    const rig = this.rig;
    while (S.tS + SUB <= t + 1e-9) {
      S.tS += SUB;
      if (S.tS >= T.dive[0] && !S.dive.from) this.beginDive(S);
      const prev = S.head.clone();
      this.headAt(S, S.tS, S.head);
      if (S.tS >= T.emerge) rig.trail.push(S.head);
      if (S.dive.from && !S.dive.contact && S.tS > T.dive[0]) this.diveSweep(S, prev, S.head);
    }
    // 尾巴出了裂隙：撤掉裁切
    if (!S.clipOff && t > T.emerge && rig.trail.c.length) {
      const tail = rig.trail.at(rig.bodyLen + 1, _v);
      if (_w.subVectors(tail, S.rift).dot(S.f) > 0.5) { S.clipOff = true; rig.setClip(null); S.outT = +t.toFixed(3); this.log('emerged', { t: S.outT }); }
    }
    rig.root.visible = t >= T.emerge && !S.gone;
    // 龙头探出：一声龙鸣
    this.once(S, 'roar', T.emerge + 0.22, () => { this.sound?.play('dragonRoar', { at: S.rift }); S.roarT = t; });
    // ---------- 雷击脉冲 ----------
    const Pu = DG.pulse;
    for (let k = 0; k < Pu.count; k++) {
      const ts = Pu.first + k * Pu.every;
      if (t0 < ts - Pu.omen && t >= ts - Pu.omen) this.pulseOmen(S, k);
      if (t0 < ts - Pu.lock && t >= ts - Pu.lock) this.pulseLock(S, k);
      if (t0 < ts && t >= ts) this.pulseStrike(S, k);
    }
    // 滚雷（攻击窗口里每隔 3 秒一段）
    for (const tr of [2.2, 5.4, 8.6]) this.once(S, 'rumble' + tr, tr, () => this.sound?.play('stormRumble', { at: _v.copy(S.C).setY(S.C.y + 8) }));
    // 预兆跟着目标走（锁定之前）
    for (const P of S.pulses) if (P && !P.locked) for (const e of P.list) if (e.u.alive && e.mark != null) this.fx.omenMove(e.mark, this.anchorOf(e.u, _v));
    // ---------- 蓄势、俯冲 ----------
    if (t >= T.charge[0] && t < T.dive[0]) { S.dive.to = this.trackDive(S); this.once(S, 'charge', T.charge[0], () => { this.log('charge', {}); this.sound?.play('growl', { at: S.head, gain: 0.8 }); }); }
    if (!S.dive.done && t >= T.dive[1]) this.burst(S, S.dive.to || S.C, null, 'timeout');       // 保险：到时还没碰到，就在落点爆
    // ---------- 姿势 ----------
    const charging = t >= T.charge[0] && !S.dive.done, diving = t >= T.dive[0] && !S.dive.done;
    const look = charging && !diving ? { dir: _u.copy(S.dive.to || S.C).sub(S.head).normalize().clone(), w: smooth01((t - T.charge[0]) / 0.35) * 0.8 } : null;
    const roar = S.roarT != null ? Math.max(0, 1 - Math.abs(t - S.roarT - 0.45) / 0.6) : 0;
    const strikeK = Math.max(0, 1 - (t - (S.lastStrike ?? -9)) / 0.35);
    const dis = S.dive.done ? smooth01((t - S.dive.doneT) / 0.6) : 0;
    rig.pose(dt, { swim: diving ? 1.8 : charging ? 0.6 : 1.1, jaw: Math.max(roar * 0.9, charging ? 0.85 : 0, strikeK * 0.35), claw: charging ? 0.65 : diving ? 1 : 0, look,
      arc: 0.25 + strikeK * 0.75 + (charging ? 0.7 : 0), flash: strikeK * 0.25, dissolve: dis, fade: 1 - endK * 0.999 });
    if (dis >= 1 && !S.gone) { S.gone = true; rig.root.visible = false; }
    // 身上偶尔一道电弧
    if (rig.root.visible && !S.gone && (S.arcT = (S.arcT ?? 0) - dt) <= 0) {
      S.arcT = charging ? 0.08 : 0.35;
      const i = 2 + Math.floor(this.rand() * (rig.chain.length - 6));
      const a = rig.chain[i].getWorldPosition(new THREE.Vector3()), b = rig.chain[i + 3].getWorldPosition(new THREE.Vector3());
      a.y += 0.4; b.add(_v.set(this.rand() - 0.5, this.rand() * 0.8, this.rand() - 0.5));
      this.fx.arc(a, b, charging ? 1 : 0.6);
    }
    this.unit.pos.copy(S.head);
    // ---------- 收尾 ----------
    if (S.endT != null && t >= S.endT + T.fade) this.finish('done');
  }

  // ---------- 脉冲：预兆（选目标）→ 锁定落点 → 落雷结算 ----------
  tid(u) { return u.id || (u._tid ||= 'u' + (++TID)); }
  stageOf(u) { return u?.stageInfo ? u.stageInfo() : { id: 'only' }; }
  // 这一次脉冲打谁：至多 max 个，主要目标优先，其余由近到远、同距离按稳定编号
  pickTargets(S) {
    const out = [], C = S.C, R = DG.radius, base = this.fx.clouds.baseAt(C.x, C.z, C.y + DG.cloud.base);
    for (const u of this.combat.targets()) {
      if (!u.alive || u.hidden?.() || u.state === 'dormant' || u.immune?.() || u.invuln > 0) continue;
      const near = this.nearestPoint(u, C);
      if (near.d > R) continue;
      if (u.pos.y < C.y - 3 || u.pos.y > base - 0.5) continue;
      const top = Math.min(near.top, base - 0.3);
      if (!this.skyClear(near.p.x, near.p.z, top, base)) { (S.roofed ||= new Set()).add(this.tid(u)); continue; }
      out.push({ u, d: near.d, id: this.tid(u) });
    }
    out.sort((a, b) => (a.u === S.primary ? -1 : b.u === S.primary ? 1 : 0) || a.d - b.d || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { list: out.slice(0, DG.pulse.max), total: out.length };
  }
  pulseOmen(S, k) {
    const { list, total } = this.pickTargets(S);
    const P = S.pulses[k] = { k, t: +S.t.toFixed(3), total, list: list.map((e) => ({ u: e.u, id: e.id, d: +e.d.toFixed(2), stage: this.stageOf(e.u).id, mark: this.fx.omen(this.anchorOf(e.u, _v), 1.2 + (e.u.radius ?? 0.45)) })), locked: false, hits: [], miss: [] };
    for (const e of P.list) this.fx.clouds.flash(this.fx.clouds.nearest(e.u.pos.x, e.u.pos.z), 0.45);
  }
  pulseLock(S, k) {
    const P = S.pulses[k];
    if (!P) return;
    P.locked = true;
    for (const e of P.list) { e.at = this.anchorOf(e.u, new THREE.Vector3()); if (e.mark != null) this.fx.omenMove(e.mark, e.at); }
  }
  pulseStrike(S, k) {
    const P = S.pulses[k];
    if (!P) return;
    this.stats.pulses++;
    const Pu = DG.pulse, C = S.C, base = this.fx.clouds.baseAt(C.x, C.z, C.y + DG.cloud.base);
    let sumX = 0, sumZ = 0, n = 0;
    for (const e of P.list) {
      if (e.mark != null) this.fx.omenEnd(e.mark);
      const key = `${S.castId}:${k}:${e.id}`;
      if (S.hitKeys.has(key)) continue;          // 每个目标每次脉冲至多一次
      S.hitKeys.add(key);
      const at = e.at || this.anchorOf(e.u, new THREE.Vector3());
      const top = new THREE.Vector3(at.x, this.fx.clouds.baseAt(at.x, at.z, base), at.z);
      // 打中：活着、可受击、还在落点（身体半径 + strikeR 内）、头顶不被遮、阶段没变
      const u = e.u, near = u.alive ? this.nearestPoint(u, at) : null;
      let why = null;
      if (!u.alive) why = 'dead';
      else if (u.hidden?.() || u.immune?.() || u.invuln > 0) why = 'immune';
      else if (near.d > Pu.strikeR) why = 'moved';
      else if (Math.abs(u.pos.y - at.y) > 2.5) why = 'height';
      else if (!this.skyClear(near.p.x, near.p.z, Math.min(near.top, top.y - 0.3), top.y)) why = 'roof';
      else if (this.stageOf(u).id !== e.stage) why = 'stage';
      // 先结算再画：目标自己判了无敌（过场、倒地）、阶段已变等——没有伤害就画成落空（雷落在锁定点的地上），不画成打中
      const hitP = near ? near.p.clone().setY(Math.max(at.y, Math.min(near.top - 0.2, at.y + 1.2))) : null;
      let r = null;
      if (!why) { r = this.deal(u, S.snap.pulse, { at: hitP, part: near.part, stun: Pu.stun, posture: Pu.posture, stageId: e.stage }); if (r !== 'hit' && r !== 'block') why = r || 'none'; }
      const bot = why ? at.clone() : hitP;
      this.fx.strike(top, bot, !why);
      this.fx.clouds.flash(this.fx.clouds.nearest(at.x, at.z), 1);
      sumX += at.x; sumZ += at.z; n++;
      this.stats.strikes++;
      if (why) { P.miss.push({ id: e.id, why }); continue; }
      P.hits.push({ id: e.id, r, dmg: +this.dealt.toFixed(2) }); this.stats.pulseDmg += this.dealt; this.addPer(S, e.id, 'pulse', this.dealt, u, S.snap.pulse);
      this.combat.sound?.play('hit', { at: bot, gain: 0.5 });
    }
    // 没有目标时：雷云里照样落一道（落在离所有敌人 2.5 米外的空地，细一些——一眼看得出是落空，不是打中）
    if (!P.list.length) {
      const a = this.rand() * Math.PI * 2, rr = Math.sqrt(this.rand()) * DG.radius * 0.8;
      const q = new THREE.Vector3(C.x + Math.cos(a) * rr, 0, C.z + Math.sin(a) * rr);
      q.y = this.groundUnder(q.x, q.z, C.y + 2);
      const far = this.combat.targets().every((u) => Math.hypot(u.pos.x - q.x, u.pos.z - q.z) > 2.5);
      if (far && q.y > C.y - 4) { this.fx.bolts.strike(new THREE.Vector3(q.x, this.fx.clouds.baseAt(q.x, q.z, base), q.z), q, { width: 0.2, life: 0.2, k: 0.55, coreW: 0.25, thick: 0.03 }); P.idle = true; }
    }
    // 一次脉冲只出一两声雷（不随目标数叠加）；两盏共用点光闪一下
    const at = n ? _v.set(sumX / n, C.y + 1, sumZ / n) : _v.set(C.x, C.y + 1, C.z);
    this.sound?.play('thunderStrike', { at });
    if (n >= 6) this.sound?.play('thunderStrike', { at, delay: 0.07, gain: 0.7 });
    this.fx.lights?.pulse(_w.copy(at).setY(base - 0.5), DG.colors.silver, 4 + Math.min(4, n * 0.5), 0.18);
    this.fx.rift.k.flash = 0.6;
    if (n) { S.lastStrike = S.t; this.combat.shake?.(Math.min(DG.shakeMax, 0.06 + n * 0.006)); }
    S.log.push({ k, t: +S.t.toFixed(3), sel: P.list.length, total: P.total, hits: P.hits.length, miss: P.miss.slice(), idle: !!P.idle });
  }
  // 每个目标的记录：pulse / dive / burst 是实际掉的气血（目标自己的减伤、阶段封顶之后），nominal 是快照里的名义伤害（防御前）
  addPer(S, id, part, dmg, u, nominal = dmg) {
    const o = S.per.get(id) || { id, name: u?.cfg?.name || u?.kind || id, pulse: 0, pulses: 0, dive: 0, burst: 0, nominal: 0 };
    o[part] += dmg; o.nominal += nominal; if (part === 'pulse') o.pulses++;
    S.per.set(id, o);
  }
  // 交给 combat.damage（目标自己的防御、减伤、无敌、阶段照常）；stageId：选中时的阶段号，到达时对不上就作废
  deal(u, amount, o = {}) {
    this.dealt = 0;
    if (!u.alive) return null;
    if (o.stageId != null && this.stageOf(u).id !== o.stageId) return 'stale';
    if (u.capsules && o.part !== undefined) { u.part = o.part; if (o.at && u.hitPoint) u.hitPoint.copy(o.at); }
    let got = 0;
    const L = (e) => { if (e.target === u && e.from === this.unit) got += e.amount || 0; };
    this.combat.hitListeners.add(L);
    let r;
    try { r = this.combat.damage(u, amount, { from: this.unit, kind: 'thunder', at: o.at, big: o.big, stun: o.stun, push: o.push, knock: o.knock, posture: o.posture, counter: !!o.crit }); }
    finally { this.combat.hitListeners.delete(L); }
    this.dealt = got;
    return r || null;
  }

  // ---------- 俯冲 ----------
  beginDive(S) {
    const D = S.dive, Dv = DG.dive, T = DG.t;
    D.to = this.trackDive(S).clone();
    D.from = this.chargeAt(S, T.dive[0], new THREE.Vector3());
    // 路径：圆弧 + 直线（divePath）；速度：起点 = 蓄势末的速度，匀加速到 time 秒时走完到落点的全长
    const v0 = this.velAt(this.chargeAt, S, T.dive[0] - 2e-3, new THREE.Vector3()), sp = v0.length();
    const a = sp > 1e-3 ? v0.clone().divideScalar(sp) : D.to.clone().sub(D.from).normalize();
    const K = this.divePath(D.from, a, D.to, Dv.turnR);
    K.v0 = sp; K.alpha = Math.max(0, (2 * (K.stot - sp * Dv.time)) / (Dv.time * Dv.time));
    D.curve = K;
    D.stage = S.primary ? this.stageOf(S.primary).id : null;
    D.tracked = !!(S.primary && D.lastOk);
    this.sound?.play('dragonDive', { at: D.from });
    this.log('dive', { to: D.to.toArray().map((x) => +x.toFixed(2)), tracked: D.tracked, primaryAlive: !!S.primary?.alive });
  }
  // 吻尖扫过的一段：先碰到敌人（身体胶囊）、地面、墙——在接触处爆雷
  diveSweep(S, a, b) {
    const rig = this.rig, f = _u.subVectors(b, a);
    if (f.lengthSq() < 1e-8) return;
    f.normalize();
    const sa = a.clone().addScaledVector(f, rig.snoutLen), sb = b.clone().addScaledVector(f, rig.snoutLen);
    let best = null;
    for (const u of this.combat.targets()) {
      if (!u.alive || u.hidden?.()) continue;
      for (const c of this.capsulesOf(u)) { const q = segSeg(sa, sb, c.a, c.b); if (q.d <= DG.dive.headR + c.r && (!best || q.s < best.s)) best = { s: q.s, u, part: c.part ?? null }; }
    }
    // 地面、墙
    const n = Math.max(1, Math.ceil(sa.distanceTo(sb) / 0.3));
    let ground = null;
    for (let i = 1; i <= n; i++) { const p = _v.lerpVectors(sa, sb, i / n); if (p.y <= this.groundUnder(p.x, p.z, p.y + 0.5) + 0.25 || this.solidAt(p.x, p.y, p.z)) { ground = { s: i / n }; break; } }
    const W = this.combat.world;
    if (W.cw?.ray) { const L = sa.distanceTo(sb), tw = W.cw.ray(sa, _w.subVectors(sb, sa).normalize(), L); if (tw < L && (!ground || tw / L < ground.s)) ground = { s: tw / L }; }
    if (best && (!ground || best.s <= ground.s)) this.burst(S, sa.clone().lerp(sb, best.s), best.u, 'target', best.part);
    else if (ground) { const p = sa.clone().lerp(sb, ground.s); p.y = Math.max(p.y, this.groundUnder(p.x, p.z, p.y + 0.5)); this.burst(S, p, null, 'ground'); }
  }
  burst(S, at, direct, how, part = null) {
    const D = S.dive;
    if (D.done) return;
    D.done = true; D.doneT = S.t; D.contact = at.clone();
    S.endT = S.t;
    this.stats.dives++;
    const rec = { how, t: +S.t.toFixed(3), at: at.toArray().map((x) => +x.toFixed(2)), direct: null, burst: [] }, shocked = [];
    if (direct) {
      const id = this.tid(direct), key = `${S.castId}:dive:${id}`;
      if (!this.crits.has(key)) this.crits.set(key, this.rand() < S.snap.crit.rate);
      const crit = this.crits.get(key), amount = S.snap.dive * (crit ? S.snap.crit.mult : 1);
      const r = this.deal(direct, amount, { at, part, big: true, stun: DG.dive.stun, knock: DG.dive.knock, posture: DG.dive.posture, crit, stageId: direct === S.primary ? D.stage : null });
      rec.direct = { id, primary: direct === S.primary, amount: +amount.toFixed(2), dealt: +this.dealt.toFixed(2), crit, r };
      if (crit) this.stats.crits++;
      if (r === 'hit' || r === 'block') { this.stats.diveDmg += this.dealt; this.addPer(S, id, 'dive', this.dealt, direct, amount); shocked.push({ u: direct, until: DG.quake.shock.direct }); }
    }
    for (const u of this.combat.targets()) {
      if (u === direct || !u.alive || u.hidden?.()) continue;
      const near = this.nearestPoint(u, at), d3 = Math.hypot(near.d, Math.max(0, Math.abs(near.p.y - at.y) - 1));
      if (d3 > DG.dive.burstR) continue;
      if (!this.clearLine(_a.copy(at).setY(at.y + 0.6).clone(), near.p.clone())) { rec.burst.push({ id: this.tid(u), blocked: true }); continue; }
      const r = this.deal(u, S.snap.burst, { at: near.p, part: near.part, stun: DG.dive.burstStun, push: DG.dive.burstPush, posture: DG.dive.burstPosture });
      rec.burst.push({ id: this.tid(u), amount: +S.snap.burst.toFixed(2), dealt: +this.dealt.toFixed(2), r });
      if (r === 'hit' || r === 'block') { this.stats.burstDmg += this.dealt; this.addPer(S, this.tid(u), 'burst', this.dealt, u, S.snap.burst); shocked.push({ u, until: DG.quake.shock.burst }); }
    }
    this.fx.blast(at, DG.dive.burstR);
    this.combat.hitStop?.(DG.dive.hitStop);
    this.combat.shake?.(Math.min(DG.shakeMax, DG.dive.shake));
    this.sound?.play('thunderBlast', { at });
    // 第二十六轮：撞上之后的压迫感——雷柱、气浪、电裂纹、尘、碎石（fx.quake），镜头往下一顿，叠一记往下沉的撞地闷响与残留电弧的噼啪；
    //   之后一秒多的余震、残留电弧、敌人身上的电光由 stepQuake 接着放（不改伤害、目标与时长）
    this.fx.quake(at);
    this.combat.kick?.(_v.set(0, -1, 0).clone(), DG.quake.kick);
    this.sound?.play('dragonSlam', { at });
    this.sound?.play('zapTail', { at, delay: 0.12, dur: DG.quake.arcs.secs });
    this.quakeS = { at: at.clone(), t: 0, next: 0, arcAcc: 0, unitAcc: 0, units: shocked };
    D.rec = rec;
    this.log('burst', rec);
  }

  // 第二十六轮：撞上之后一秒多——余震（再由雷云劈下几道：一半落在被撞到的敌人身上、一半落在落点四周；各自一声雷、一小下震屏）、
  //   落点四周残留的电弧（由多到少）、被撞到的敌人身上缠着的电光。只是表现：不再结算伤害
  stepQuake(dt) {
    const Z = this.quakeS, Qk = DG.quake, Af = Qk.after, Ar = Qk.arcs;
    if (!Z || !(dt > 0)) return;
    Z.t += dt;
    while (Z.next < Af.at.length && Z.t >= Af.at[Z.next]) {
      const i = Z.next++, o = Z.units.length ? Z.units[i % Z.units.length] : null;
      let p;
      if (o && o.u.alive && i % 2 === 0) p = o.u.pos.clone();
      else { const a = Math.random() * Math.PI * 2, d = Af.r[0] + Math.random() * (Af.r[1] - Af.r[0]); p = Z.at.clone().add(_v.set(Math.cos(a) * d, 0, Math.sin(a) * d)); }
      p.y = this.groundUnder(p.x, p.z, p.y + 1.5);
      if (!(p.y > -1e8)) p.y = Z.at.y;
      this.fx.afterStrike(p);
      this.sound?.play('thunderStrike', { at: p, gain: 0.8 });
      this.combat.shake?.(Af.shake);
    }
    if (Z.t < Ar.secs) {
      Z.arcAcc += (Ar.rate[0] + (Ar.rate[1] - Ar.rate[0]) * (Z.t / Ar.secs)) * dt * this.fx.q;
      while (Z.arcAcc >= 1) { Z.arcAcc -= 1; this.fx.groundArc(Z.at, Ar.r); }
    }
    Z.unitAcc += Qk.shock.rate * dt;
    while (Z.unitAcc >= 1) { Z.unitAcc -= 1; for (const o of Z.units) if (o.u.alive && Z.t < o.until) this.fx.unitArc(o.u); }
    if (Z.t >= Math.max(Ar.secs, Af.at[Af.at.length - 1] + 0.05, ...Z.units.map((o) => o.until))) this.quakeS = null;
  }

  // ---------- 结束与清理 ----------
  finish(reason) {
    const S = this.S;
    if (!S) return;
    this.last = this.record(S, reason);
    this.S = null;
    if (this.rig) { this.rig.root.visible = false; this.rig.setClip(null); }
    this.fx.rift.hide(); this.fx.clouds.hide(); this.fx.cloudFade = 0;
    if (!this.pre) this.fx.area.hide();
  }
  // 完整清理：主人倒下、重试、换场景、退出实例（龙、雷云、裂隙、预兆、雷柱、预览一并收掉；之后不再有任何结算）
  clear(reason = 'clear') {
    if (this.S) { this.last = this.record(this.S, reason); this.S = null; }
    this.pre = null; this.pendingSel = null; this.rejectT = 0; this.labelAt = null; this.quakeS = null;
    if (this.rig) { this.rig.root.visible = false; this.rig.setClip(null); }
    this.fx.clear();
    this.crits.clear();
    this.updateLabel(null);
  }
  moveTo(scene) {
    this.fx.moveTo(scene);
    if (this.rig && this.rig.root.parent !== scene) scene.add(this.rig.root);
  }
  record(S, reason) {
    const per = [...S.per.values()].map((o) => ({ ...o, pulse: +o.pulse.toFixed(2), dive: +o.dive.toFixed(2), burst: +o.burst.toFixed(2), nominal: +o.nominal.toFixed(2), total: +(o.pulse + o.dive + o.burst).toFixed(2) }));
    return { castId: S.castId, reason, src: S.src, dist: S.dist, C: S.C.toArray().map((x) => +x.toFixed(2)), origin: S.origin.toArray().map((x) => +x.toFixed(2)), snap: { L: S.snap.L, dmgK: +S.snap.dmgK.toFixed(4), pulse: +S.snap.pulse.toFixed(2), dive: +S.snap.dive.toFixed(2), burst: +S.snap.burst.toFixed(2) },
      pulses: S.log.slice(), dive: S.dive.rec || null, diveTo: S.dive.to ? S.dive.to.toArray().map((x) => +x.toFixed(2)) : null, tracked: !!S.dive.tracked, outT: S.outT ?? null, per, t: +S.t.toFixed(3), roofed: S.roofed ? [...S.roofed] : [] };
  }
  log(kind, o) { (this.events ||= []).unshift({ kind, t: +this.t.toFixed(3), ...o }); if (this.events.length > 60) this.events.length = 60; }
  // HUD：{ active, left（离结束还有几秒）}
  hudInfo() { const S = this.S; return S ? { active: true, left: Math.max(0, (S.endT != null ? S.endT + DG.t.fade : DG.t.dive[1] + DG.t.fade) - S.t) } : { active: false }; }
  // 着色器预编译（龙的蒙皮材质、裂隙、雷云、雷柱、预览）：第一次放不卡
  prewarm(renderer, camera) {
    const sc = this.combat.scene, rig = this.rig;
    if (!sc || this.S || this.pre) return;
    const list = this.fx.meshes(), keep = list.map((o) => o.visible);
    list.forEach((o) => { o.visible = true; });
    const rk = rig?.root.visible;
    if (rig) { if (rig.root.parent !== sc) sc.add(rig.root); rig.root.visible = true; }
    try {
      renderer.compile(sc, camera);
      if (rig) for (const m of rig.materials) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (m[k]) renderer.initTexture(m[k]);
    } finally { list.forEach((o, i) => { o.visible = keep[i]; }); if (rig) rig.root.visible = !!rk && !!this.S; }
  }

  // ---------- 选点的文字提示（预览圈上方；合法青白、无效红）----------
  makeLabel() {
    const el = document.createElement('div');
    el.className = 'dragon-label';
    document.querySelector('#hud')?.appendChild(el);
    return el;
  }
  updateLabel(camera) {
    const el = this.label;
    if (!el) return;
    const show = !!(this.labelAt && (this.pre || this.rejectT > this.t) && camera);
    if (!show) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
    const v = _v.copy(this.labelAt).setY(this.labelAt.y + 2.2).project(camera);
    if (v.z > 1) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.classList.toggle('bad', !!this.labelBad);
    if (el.textContent !== this.labelText) el.textContent = this.labelText || '';
    el.style.transform = `translate(${((v.x * 0.5 + 0.5) * innerWidth).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
  }
}
