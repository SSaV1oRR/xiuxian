// 第二十一轮：九霄凤焰（参数见 combatConfig.js 的 PHOENIX；模型与动作 actors/phoenix.js；特效 game/phoenixFx.js）。
// 两种模式共用冷却，同时最多一只凤凰；释放（起手放出的那一刻）才扣灵力、进冷却，之前合法取消不扣。放出后模式不能再换（切换只影响下一次）。
//
// 伤害：施法那一刻记下快照——D_cast = D_base × 等级成长 × 适用装备 × 被动 × 临时增伤，连同主人等级、境界、暴击率与倍率、最大生命（治疗用）；
//   之后换装、升级、增伤变化都不改已放出的凤凰与火焰。每次攻击 = D_cast × 系数；命中时再看目标此刻（当前阶段）的境界（低于主人的大境界 ×2）、
//   暴击（只有直接撞击、凤焰弹、掠翼突袭可暴击；同一次攻击对同一目标只抽一次）、目标自己的防御 / 减伤 / 无敌（combat.damage 里照常结算）。
//
// 凤翔天击：飞行阶段（起飞到撞击 / 到时 / 出界）接管左键——按住左键，凤凰朝镜头的瞄准方向（三维，上下左右）转去，每秒最多转 150°；松开保持方向。
//   进入时清掉未执行的普攻缓冲；之前就按着的左键要先松开再按下才算操控；飞行结束解除接管，之后新的一次按下才恢复人物连击。
//   离主人超过 80 米：退出手动操控、平滑转回主人（不瞬移），回到 68 米内可再接管；出界（不可加载的区域、地图硬边界）在边界内消散，不访问不存在的碰撞数据。
//   碰撞是连续的：每帧扫过的一段对敌人身体（胶囊）、地形、构筑物逐一检测，取最早的接触。
//   首次有效命中：主目标 1.0、周围 0.35（逐个检查距离与墙体遮挡；主目标不吃这一份），凤凰爆开、飞行结束；撞墙、撞地在真实的接触点爆开。
//   秒杀：只有直接撞击的主目标判一次（每次施法最多一次），概率 p(L)（低大境界目标 ×2，最高 10%）；无敌、已倒、剧情保护、无效命中不判。
//     原子结算：记下施法号、攻击号、目标号、命中时的阶段号——秒杀成功走目标自己的「阶段结束」流程（独立阶段气血：清空当前阶段；同一总气血按阈值：
//     推到当前阶段的结束阈值；最终阶段：死亡与整场胜利），不再追加普通伤害；失败才结算普通撞击伤害；伤害把阶段打完了，溢出的不带进下一阶段；
//     延迟的效果到达时阶段号对不上，就丢掉对主目标的那一份；周围目标各自结算。
//   火带：路径正下方最近的真实阻挡表面（向下 12 米内），按落点的移动距离每 1.5 米一段、宽 3 米、20 秒；撞击处一枚 4 米、20 秒的凤焰印。
//   火中：敌人每 0.5 秒受 0.01 D_cast；主人每 0.5 秒恢复施法时最大生命的 3%。同一次技能的火带、印记、重叠段共享每个目标的间隔（反复进出不重置）；
//   高空经过不算接触；倒下的不治疗、不复活；其他友方既不受伤也不治疗。
//   凤焰弹反：主人站在自己的火带 / 印记里、真实弹反成功时，周围 5 米一道冲击（0.15 D_cast，不暴击、不秒杀、不耗灵力）；共享 1 秒冷却（冷却中照常弹反，
//     只是不追加冲击）；按真实的弹反事件去重（敌人号 + 出手号 + 第几段 + 弹反序号）；重叠只取一处来源（D_cast 最高、同值取最新）；不生新火、不连锁。
// 凤灵护战：随身 30 秒；最大生命 = 召唤时主人的最大生命（之后独立）；优先主人锁定的目标、正在打主人的敌人、范围内最近的敌人；
//   凤焰弹 0.18、掠翼突袭 0.22、吐息完整命中 0.25（按在锥内的时间折算，总量固定）；公共间隔 2.5 秒，各自冷却 2.5 / 6 / 8 秒，统一调度；无秒杀、不留火。
// 隐藏仇恨（护战的凤凰）：每个敌人 0–100；一次完整有效攻击 +25 + min(15, 15 × 实际伤害 / 当前阶段最大生命)，每次攻击最多 +40；
//   3 秒没被凤凰打就每秒 −5；满 100 后在合法的决策时机改打凤凰（至少 2 秒，期间仍校验凤凰活着、够得着、在追击范围内）；
//   打中凤凰的那一次攻击 −30（同一次攻击只减一次）。不取消已进入命中阶段的动作，转身沿用敌人已有的参数。凤凰没了就回到原来的选敌。
// 计时：一律用战斗时钟（暂停、页面失焦、Boss 阶段过场、顿帧都随之停 / 放慢）；主人倒下、重试、换场景、退出实例时完整清理。
//
// 第二十二轮：
//   起手换成舞刀（moves.stepPhoenix 推进动作 cast_phoenix，时间轴 PHOENIX.cast）：剑上金红细光、羽焰汇聚 → 0.18 秒凤凰由剑尖显形（小灵体） →
//   随舞刀绕身一周（人物局部空间：中心跟着人走、随人转；半径按真实翼展；高度在腰与肩之间）→ 0.85 秒最后一刀，凤凰收成小灵体贴上刀身、
//   沿刀刃滑向剑尖 → 1.05 秒喙尖在剑尖的世界坐标处离刀（release）。预演中没有碰撞、伤害、投火、秒杀，不占 8 秒飞行时间；
//   离刀那一刻才扣灵力、进冷却、记快照、起算 8 秒、开碰撞投火与左键操控。最后一刀之前被格挡 / 闪身 / 受击 / 打断取消：预演的凤凰 0.15 秒散去、
//   振翅声停、不留任何判定；倒下、换场景、重试立刻清掉。
//   左键：普攻时按着的左键不算（要先松开）；舞刀中新按下并按住的，离刀即开始操控。
//   操控：镜头准星的射线打到的世界点（敌人身体、构筑物、地形；60 米内都没打到取 60 米处）为瞄准点，凤凰从自己的位置朝它转——
//   期望方向先按 smooth 秒的时间常数平滑，再按水平 360°/秒、垂直 300°/秒限幅（都按真实时间）；离瞄准点 2.5 米内、或已越过它时保持方向。
//   轻度瞄准辅助：准星 12° 内、离凤凰 15 米内、看得见、不在身后的敌人，把期望方向往它偏一半（可关）。
//   前方 16 米内、22° 内、看得见的敌人：0.2 秒的时间常数加速到 20 米/秒俯冲，明显偏离（33°）后回落到 12 米/秒。
//   离主人 80 米：自动折返（不接受左键），回到 65 米内才可再操控（左键仍按着就直接接上）。
import * as THREE from 'three';
import { PHOENIX, PLAYER_COMBAT as PC } from './combatConfig.js';
import { realmOf, lowerRealm, rankOf, statMul } from './progression.js';
import { PhoenixRig } from '../actors/phoenix.js';

const S = PHOENIX.strike, G = PHOENIX.guard, AG = PHOENIX.aggro, K = PHOENIX.cast;
const DEG = Math.PI / 180;
const smooth01 = (x) => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };
const _tip = new THREE.Vector3(), _base = new THREE.Vector3(), _d = new THREE.Vector3(), _l = new THREE.Vector3(), _o = new THREE.Vector3(), _q0x = new THREE.Vector3();
const _want = new THREE.Vector3(), _aim = new THREE.Vector3(), _co = new THREE.Vector3(), _cd = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const R = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
let CAST = 0, ATK = 0, STRIP = 0;

// 线段 p0p1 与线段 q0q1 的最近距离（返回 { d, s 在 p 上的比例, t 在 q 上的比例 }）
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
  return { d: Math.hypot(cx, cy, cz), s, t };
}
// 点到线段（XZ 平面）的距离与比例
function segXZ(p, a, b) {
  const bx = b.x - a.x, bz = b.z - a.z, L2 = bx * bx + bz * bz;
  const u = L2 > 1e-9 ? clamp(((p.x - a.x) * bx + (p.z - a.z) * bz) / L2, 0, 1) : 0;
  return { d: Math.hypot(p.x - (a.x + bx * u), p.z - (a.z + bz * u)), u };
}
// 把单位向量 v 向 want 转过不超过 maxAng 的角度（球面插值）
function turnToward(v, want, maxAng) {
  const ang = v.angleTo(want);
  if (ang < 1e-5) return v;
  if (ang <= maxAng) return v.copy(want);
  const axis = _u.crossVectors(v, want);
  if (axis.lengthSq() < 1e-10) axis.set(0, 1, 0); else axis.normalize();
  return v.applyAxisAngle(axis, maxAng).normalize();
}
// 第二十二轮：朝 want 转——水平（偏航）每步最多 maxH、垂直（俯仰）每步最多 maxV（弧度），俯仰夹在 ±lim；want 近乎竖直时只改俯仰
function turnLimited(v, want, maxH, maxV, lim) {
  const yaw = Math.atan2(v.x, v.z), pitch = Math.asin(clamp(v.y, -1, 1));
  const pw = clamp(Math.asin(clamp(want.y, -1, 1)), -lim, lim);
  const hw = Math.hypot(want.x, want.z);
  let dy = hw > 0.02 ? Math.atan2(want.x, want.z) - yaw : 0;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  const ny = yaw + clamp(dy, -maxH, maxH), np = clamp(pitch + clamp(pw - pitch, -maxV, maxV), -lim, lim);
  return v.set(Math.sin(ny) * Math.cos(np), Math.sin(np), Math.cos(ny) * Math.cos(np));
}
function clampPitch(v, lim) {
  const h = Math.hypot(v.x, v.z), p = Math.atan2(v.y, h), pc = clamp(p, -lim, lim);
  if (pc === p) return v;
  const hx = h > 1e-6 ? v.x / h : 0, hz = h > 1e-6 ? v.z / h : 1;
  return v.set(hx * Math.cos(pc), Math.sin(pc), hz * Math.cos(pc));
}
export function execChance(L, low) {
  const E = S.execute;
  const p = clamp(E.p0 + (E.p1 - E.p0) * (L - E.L0) / E.span, E.p0, E.p1);
  return Math.min(E.cap, p * (low ? 2 : 1));
}

export class PhoenixSkill {
  // combat / moves / player / cam：现有系统；prog：修为（progression.js）；fx：PhoenixFx；gltf：凤凰模型（ASSETS.models.phoenix）；
  // sound：音效；toast(html)：提示；rand()：随机数（自检可换成固定序列）
  constructor({ combat, moves, player, cam, prog, fx, gltf, sound, toast }) {
    Object.assign(this, { combat, moves, player, cam, prog, fx, sound });
    this.toast = toast || (() => {});
    this.rig = gltf ? new PhoenixRig(gltf) : null;
    this.mode = 'strike';
    this.bird = null;              // 当前的凤凰（同时最多一只）
    this.zones = [];               // 火带段与凤焰印（逻辑区域：伤害、治疗、弹反都只按它算）
    this.ticks = new Map();        // 施法号 → Map(目标 → 下一跳的时刻)（同一次技能共享间隔）
    this.t = 0;                    // 战斗时钟
    this.parryReady = 0;           // 弹反冲击的冷却到哪一刻
    this.parrySeen = new Map();
    this.crits = new Map();        // 「攻击号:目标号」→ 是否暴击（同一次攻击只抽一次）
    this.rand = Math.random;
    this.allowRoofs = new Set();   // 允许投火的屋顶（按构筑物的 tag；眼下没有）
    this.unit = this.makeUnit();
    this.stats = this.freshStats();
    this.events = [];              // 最近的结算（自检与调试面板）
    this.inFireT = 0;
    // 第二十二轮：舞刀起手的预演（离刀前的凤凰；离刀时转成 bird）、最近一次施法与飞行的记录（自检、诊断）、瞄准辅助的开关
    this.pre = null;
    this.lastCast = null; this.lastFlight = null;
    { const v = typeof localStorage !== 'undefined' ? localStorage.getItem('qinglan.phoenixAssist') : null; this.assist = v == null ? S.assist.on : v === '1'; }     // 设置里可关
    this.rt = 0; this._rt0 = 0;                   // 真实帧时（毫秒，诊断用）
    combat.hitListeners.add((e) => this.onHitEvent(e));
  }
  freshStats() {
    return { casts: 0, strike: 0, guard: 0, impacts: 0, execRolls: 0, execs: 0, mainDmg: 0, burstDmg: 0, burstHits: 0, burnDmg: 0, burnTicks: 0,
      healTheory: 0, healEff: 0, healOver: 0, healTicks: 0, fireStay: 0, fireTaken: 0, parryTriggers: 0, parryDmg: 0, parryHits: 0, parryCdSkip: 0,
      guardAtk: { bolt: 0, swoop: 0, breath: 0 }, guardDmg: 0, guardTaken: 0, guardDrawT: 0, crits: 0, bands: 0, seals: 0, strips: 0 };
  }
  // 护战凤凰的战斗单位（敌人的目标、投射物、伤害结算都认它）：pos 按「脚下」（身体中心往下 1 米），与其他单位一致
  makeUnit() {
    const F = this;
    return { phoenix: true, ownerPlayer: true, id: 'phoenix', faction: 'sect', pos: new THREE.Vector3(), radius: 1.0, hp: 1, maxHp: 1, alive: false, headY: 0,
      cfg: { name: '凤灵' }, world: null, receive: (amount, o) => F.receiveHit(amount, o) };
  }
  get world() { return this.combat.worldName; }
  get active() { return !!this.bird; }
  // 自检用：清零统计
  resetStats() { this.stats = this.freshStats(); this.events.length = 0; }

  // =====================================================================================
  // 释放
  // =====================================================================================
  get unlocked() { return this.prog.level >= PHOENIX.unlock; }
  cost() { return (this.moves.mpMax ?? PC.mp) * PHOENIX.mpCost; }
  // 能否起手（moves.doSkill 先问这里）：返回 { ok, reason }
  canCast() {
    if (!this.rig) return { ok: false, reason: 'asset' };
    if (!this.unlocked) return { ok: false, reason: 'locked' };
    if (this.bird || (this.pre && !this.pre.cancel)) return { ok: false, reason: 'one' };
    const W = this.world;
    if (W === 'hall' || W === 'alchemy' || W === 'tower') return { ok: false, reason: 'indoor' };
    return { ok: true };
  }
  switchMode() {
    this.mode = this.mode === 'strike' ? 'guard' : 'strike';
    return this.mode;
  }
  // 施法快照
  snapshot(mode = this.mode) {
    const P = this.prog, L = P.level, r = realmOf(L), U = this.combat.playerUnit, M = this.moves;
    // 第二十二轮：弹反后的反击强化只给普攻与拔刀斩，不进凤凰的快照（临时增伤眼下没有别的来源，为 1）
    const k = { base: PHOENIX.dBase, level: statMul('dmg', L), equip: P.equip?.dmgMul ?? 1, passive: 1, temp: 1 };
    void M;
    return { castId: ++CAST, mode, t: this.t, L, realm: r?.id, order: r?.order, dCast: k.base * k.level * k.equip * k.passive * k.temp, k,
      crit: { ...PHOENIX.crit }, maxHp: U.maxHp, world: this.world };
  }
  // moves.release 里调用（舞刀 1.05 秒，喙尖到了剑尖）：离刀发射（灵力、冷却已由 moves 扣过）——预演的凤凰转成真正的凤凰：
  //   快照、8 秒飞行计时、碰撞、投火、左键操控都从这一刻起；位置在本帧人物摆好姿势之后（update 里 fresh）按此刻的剑尖再对一次
  release(a = null) {
    if (this.bird || !this.rig) return false;
    const p = this.pre && (!a || this.pre.a === a) && !this.pre.cancel ? this.pre : null;
    const snap = this.snapshot(p ? p.mode : this.mode);
    this.stats.casts++; this.stats[snap.mode]++;
    this.ticks.set(snap.castId, new Map());
    const rig = this.rig;
    if (!rig.root.parent || rig.root.parent !== this.combat.scene) this.combat.scene.add(rig.root);
    rig.root.visible = true;
    const s0 = p ? p.scale : K.spirit.tip, s1 = snap.mode === 'strike' ? PHOENIX.model.strikeScale : PHOENIX.model.guardScale;
    const b = this.bird = { snap, kind: snap.mode, rig, t: 0, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), phase: 'fly', dissolve: 0, bank: p ? p.bank : 0, turnRate: p ? p.turnRate : 0,
      scale: s0, grow: { s0, s1, t: 0 }, fresh: true };
    rig.setScale(s0);
    this.tipPose(b);
    if (b.kind === 'strike') this.beginStrike(b, p); else this.beginGuard(b);
    this.fx.launch(_tip.clone(), b.dir.clone(), b.kind === 'strike' ? 1 : 0.8);
    this.sound?.play('phoenixCry', { at: _tip, gain: 0.9 });
    if (p) {
      p.ev.add('launch');
      p.events.push({ name: 'launch', at: K.launch, t: +p.a.t.toFixed(3), clock: +this.t.toFixed(3) });
      this.lastCast = { ...this.castRecord(p), launched: true, castId: snap.castId };
      this.pre = null;
    }
    this.log('cast', { castId: snap.castId, mode: snap.mode, dCast: +snap.dCast.toFixed(2), L: snap.L, from: p ? 'tip' : 'direct' });
    return true;
  }
  // 喙尖放在此刻的剑尖、身体沿刀刃方向（没佩剑时取身前 1.2 米、胸口高度，朝向人物所对的方向）
  tipPose(b) {
    const P = this.player, ch = P.char;
    if (ch.sword && ch.handSword) { ch.bladeEnds(_tip, _base); _d.subVectors(_tip, _base); }
    else { _d.set(Math.sin(P.heading), 0, Math.cos(P.heading)); _tip.set(P.pos.x + _d.x * 1.2, P.pos.y + 1.35, P.pos.z + _d.z * 1.2); }
    if (_d.lengthSq() < 1e-8) _d.set(Math.sin(P.heading), 0, Math.cos(P.heading));
    b.dir.copy(_d.normalize());
    clampPitch(b.dir, S.pitchLimit * DEG);
    b.rig.setScale(b.scale);
    b.rig.place(_tip, b.dir, b.bank);
    b.pos.copy(_tip).sub(b.rig.offset(b.rig.dims.beak, _o));
    b.rig.place(b.pos, b.dir, b.bank);
    b.tipAt = _tip.toArray().map((v) => +v.toFixed(3));
    b.snapErr = +b.rig.offset(b.rig.dims.beak, _o).add(b.pos).distanceTo(_tip).toFixed(4);      // 喙尖与剑尖（同一帧）的距离：自检用
  }

  // =====================================================================================
  // 第二十二轮：舞刀起手的预演（离刀之前）
  // =====================================================================================
  // moves.stepPhoenix 每帧调用（人物摆姿势之前）：只推进时间轴、按时刻触发事件（每个只一次）；凤凰的位置在 update 里按这一帧真实的剑求
  castStep(a, t0, t1) {
    if (a.released || this.bird) return;
    let p = this.pre;
    if (p && p.a !== a) { this.dropPreview('stale'); p = null; }
    if (!p) p = this.beginPreview(a);
    if (p.cancel) return;
    p.t = t1;
    const fire = (name, at) => { if (p.ev.has(name) || t1 < at) return; p.ev.add(name); this.castEvent(p, name, at); };
    fire('gather', K.gather); fire('show', K.show); fire('orbitDone', K.orbit[1]); fire('swing', K.swing);
    void t0;
  }
  beginPreview(a) {
    const p = this.pre = { a, mode: this.mode, t: a.t, ev: new Set(), events: [], armed: !a.lmbHeld, intent: false, cancel: null,
      vis: false, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), scale: K.spirit.scale0, dissolve: 1, bank: 0, turnRate: 0, snd: null,
      R: Math.max(K.spirit.radius, (this.rig?.dims.half ?? 0.5) * K.spirit.scale + K.spirit.clear), phi0: -45 * DEG, r0: 1.1, h0: 1.75, conv: null,
      stat: { travel: 0, minClear: Infinity, maxStep: 0, maxTurn: 0, lastPhi: null, prevPos: null, frames: 0, rt: [] } };
    this.log('castBegin', { mode: p.mode, lmbHeld: !!a.lmbHeld, R: +p.R.toFixed(2) });
    return p;
  }
  castEvent(p, name, at) {
    p.events.push({ name, at, t: +p.t.toFixed(3), clock: +this.t.toFixed(3) });
    const P = this.player;
    if (name === 'show') {
      // 显形：灵体由剑尖处显出（之后 update 里才摆放、显示——这一帧人物的姿势还没更新）
      p.showPending = true;
      p.snd = this.sound?.play('phoenixWing', { at: P.pos, gain: 0.5 }) || null;
    }
    if (name === 'swing') this.sound?.play('swing', { at: P.pos, heavy: true, gain: 0.85 });
    this.log(`cast:${name}`, { t: +p.t.toFixed(3) });
  }
  // 人物局部坐标（+X 人物的左手、+Y 上、+Z 前；原点在脚下）⇄ 世界
  toWorld(l, out) {
    const P = this.player, c = Math.cos(P.heading), s = Math.sin(P.heading);
    return out.set(P.pos.x + l.x * c + l.z * s, P.pos.y + l.y, P.pos.z - l.x * s + l.z * c);
  }
  dirToWorld(l, out) { const h = this.player.heading, c = Math.cos(h), s = Math.sin(h); return out.set(l.x * c + l.z * s, l.y, -l.x * s + l.z * c); }
  toLocal(w, out) {
    const P = this.player, c = Math.cos(P.heading), s = Math.sin(P.heading), dx = w.x - P.pos.x, dz = w.z - P.pos.z;
    return out.set(dx * c - dz * s, w.y - P.pos.y, dx * s + dz * c);
  }
  // 绕身一周（人物局部，身体中心）：显形时在剑尖（半径 r0、高度 h0、方位 phi0），0.3 内散开到半径 R、高度 spirit.height；
  // 方位角一周 360°（中段落后剑尖 lag°，两端与剑尖同位）
  orbitLocal(p, t, out) {
    const Sp = K.spirit, u = clamp((t - K.show) / (K.orbit[1] - K.show), 0, 1), e = smooth01(u / 0.3);
    const phi = p.phi0 + 2 * Math.PI * u - Sp.lag * DEG * Math.sin(Math.PI * u);
    const r = p.r0 + (p.R - p.r0) * e, h = p.h0 + (Sp.height - p.h0) * e + Sp.bob * Math.sin(4 * Math.PI * u) * e;
    return out.set(Math.sin(phi) * r, h, Math.cos(phi) * r);
  }
  // 每帧（人物已摆好姿势）：剑上的金红细光与汇聚的羽焰；显形之后按时间轴摆放灵体——绕身、汇向刀身、沿刀刃滑到剑尖
  updatePreview(dt) {
    const p = this.pre, a = p.a, t = a.t, P = this.player, ch = P.char, rig = this.rig;
    if (p.cancel) { this.fadePreview(p, dt); return; }
    if (this.moves.act !== a) { this.cancelCast('lost', a); return; }
    if (!ch.sword || !ch.handSword) { this.cancelCast('nosword', a); return; }
    ch.bladeEnds(_tip, _base);
    p.stat.frames++; p.stat.rt.push(+this.rt.toFixed(2));
    // 剑上的灵焰：起势时渐亮，绕身中稳定，最后一刀最亮；起势到显形后一小段，羽焰向刀身汇聚
    const kBlade = t < K.show ? 0.35 + 0.65 * smooth01(t / K.show) : t < K.swing ? 0.75 : 1.1;
    this.fx.castBlade(_tip, _base, kBlade);
    if (t < K.show + 0.15) this.fx.castGather(_tip, _base, P.pos, dt, 1 - smooth01((t - K.show) / 0.15));
    if (t < K.show && !p.showPending) return;
    const lt = this.toLocal(_tip, new THREE.Vector3()), lb = this.toLocal(_base, new THREE.Vector3());
    if (p.showPending) {
      // 显形的这一帧：从此刻剑尖所在的方位、半径、高度起绕
      p.showPending = false; p.vis = true;
      p.phi0 = Math.atan2(lt.x, lt.z); p.r0 = Math.hypot(lt.x, lt.z); p.h0 = lt.y;
      if (!rig.root.parent || rig.root.parent !== this.combat.scene) this.combat.scene.add(rig.root);
      rig.root.visible = true;
      this.fx.materialize(_tip.clone(), K.spirit.scale0);
    }
    const Sp = K.spirit, anchor = _l, dirL = _d;
    let fold = 0, flap = 1.6, glide = 0.25, scale, local;
    if (t <= K.swing) {
      // 绕身一周（身体中心）
      local = this.orbitLocal(p, t, new THREE.Vector3());
      const nx = this.orbitLocal(p, Math.min(t + 1 / 120, K.swing), new THREE.Vector3()), pv = this.orbitLocal(p, Math.max(t - 1 / 120, K.show), new THREE.Vector3());
      dirL.subVectors(nx, pv);
      anchor.copy(this.rig.dims.center);
      scale = Sp.scale0 + (Sp.scale - Sp.scale0) * smooth01((t - K.show) / 0.25);
    } else {
      const T0 = K.swing, T1 = K.launch - K.tipLead;
      if (!p.conv) {
        // 绕完的终点与那一刻的速度（人物局部）：汇向刀身的起点
        const e0 = this.orbitLocal(p, T0, new THREE.Vector3()), e1 = this.orbitLocal(p, T0 - 1 / 120, new THREE.Vector3());
        p.conv = { P0: e0, V0: e0.clone().sub(e1).multiplyScalar(120), s0: p.scale };
      }
      const bl = lt.clone().sub(lb), len = bl.length(), bd = bl.clone().divideScalar(len || 1);
      if (t < T1) {
        // 汇向刀身：三次埃尔米特曲线，由绕身的终点（沿绕行的速度）到刀身上 slideFrom 处（沿刀刃的速度）；锚点由身体中心渐渐换成喙尖
        const T = T1 - T0, u = clamp((t - T0) / T, 0, 1), C = p.conv;
        const P1 = lb.clone().addScaledVector(bl, K.slideFrom), V1 = bd.clone().multiplyScalar((len * (1 - K.slideFrom)) / K.tipLead);
        const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
        local = new THREE.Vector3().addScaledVector(C.P0, h00).addScaledVector(C.V0, h10 * T).addScaledVector(P1, h01).addScaledVector(V1, h11 * T);
        const d00 = 6 * u2 - 6 * u, d10 = 3 * u2 - 4 * u + 1, d01 = -6 * u2 + 6 * u, d11 = 3 * u2 - 2 * u;
        dirL.set(0, 0, 0).addScaledVector(C.P0, d00).addScaledVector(C.V0, d10 * T).addScaledVector(P1, d01).addScaledVector(V1, d11 * T);
        anchor.lerpVectors(this.rig.dims.center, this.rig.dims.beak, smooth01(u));
        scale = C.s0 + (Sp.tip - C.s0) * smooth01(u);
        fold = 0.6 * smooth01(u); flap = 1.3; glide = 0.4;
      } else {
        // 贴着刀刃滑向剑尖（喙尖在刀身上）
        const u = clamp((t - T1) / K.tipLead, 0, 1);
        local = lb.clone().addScaledVector(bl, K.slideFrom + (1 - K.slideFrom) * u);
        dirL.copy(bd);
        anchor.copy(this.rig.dims.beak);
        scale = Sp.tip; fold = 0.8; flap = 1.2; glide = 0.5;
      }
    }
    // 局部 → 世界：方向、侧倾（按偏航角速度，与飞行时同一算法）、根节点 = 锚点 − 偏移
    const world = this.toWorld(local, new THREE.Vector3());
    if (dirL.lengthSq() > 1e-10) p.dir.copy(this.dirToWorld(dirL.normalize(), _q0x)).normalize();
    const yaw1 = Math.atan2(p.dir.x, p.dir.z);
    if (p.yawPrev != null && dt > 0) {
      const dyaw = Math.atan2(Math.sin(p.yawPrev - yaw1), Math.cos(p.yawPrev - yaw1));
      p.turnRate += (dyaw / dt - p.turnRate) * Math.min(1, dt * 8);
    }
    p.yawPrev = yaw1;
    const tr = clamp(p.turnRate / (120 * DEG), -1, 1);
    p.bank = tr * 0.7 * (t < K.swing ? 1 : 1 - smooth01((t - K.swing) / 0.12));
    p.scale = scale;
    rig.setScale(scale);
    rig.place(world, p.dir, p.bank);
    const root = world.clone().sub(rig.offset(anchor, _o));
    rig.place(root, p.dir, p.bank);
    // 显形：由消散态在 fadeIn 秒内显出
    p.dissolve = 1 - smooth01((t - K.show) / Sp.fadeIn);
    rig.update(dt, { flap, glide, fold, turn: tr * 0.8, dissolve: p.dissolve, glow: 1.25 + 0.5 * p.dissolve, recolor: 1 });
    if (p.dissolve < 0.6) this.fx.trail(rig, p.dir, (scale / PHOENIX.model.strikeScale) * 1.6);
    // 记录：绕身走过的方位角、离人物身体最近的距离（绕身段）、每帧的位移（不应有跳变）
    const st = p.stat, phi = Math.atan2(local.x, local.z);
    if (st.lastPhi != null) st.travel += Math.atan2(Math.sin(phi - st.lastPhi), Math.cos(phi - st.lastPhi));
    st.lastPhi = phi;
    if (st.prevPos) { const step = st.prevPos.distanceTo(root); st.maxStep = Math.max(st.maxStep, step); if (dt > 0) st.maxSpeed = Math.max(st.maxSpeed || 0, step / dt); }
    st.prevPos = root.clone();
    if (t > K.show + 0.05 && t <= K.swing) st.minClear = Math.min(st.minClear, this.bodyClear(rig));
    p.pos.copy(root);
  }
  // 凤凰身上几处（翼尖、尾梢、头、身体）离人物身体（脚上 0.1 米到头顶的竖直胶囊，半径 0.3）的最近距离
  bodyClear(rig) {
    const P = this.player.pos, top = P.y + 1.8, bot = P.y + 0.1;
    let m = Infinity;
    for (const n of ['B_Left_Wing_8', 'B_Right_Wing_8', 'B_Left_Wing_5', 'B_Right_Wing_5', 'B_Tail_5', 'B_Tail_3', 'b_Head', 'B_Pelvis']) {
      if (!rig.bones[n]) continue;
      rig.bonePos(n, _o);
      const y = clamp(_o.y, bot, top);
      m = Math.min(m, Math.hypot(_o.x - P.x, _o.y - y, _o.z - P.z) - 0.3);
    }
    return m;
  }
  // 取消（最后一刀之前：格挡、闪身、受击、打断）：振翅声停、灵体 0.15 秒散去——只是画面，没有任何判定；倒下、换场景（clear）立即清掉
  cancelCast(reason, a = null) {
    const p = this.pre;
    if (!p || p.cancel || (a && p.a !== a)) return;
    p.snd?.stop?.(0.12); p.snd = null;
    this.lastCast = { ...this.castRecord(p), launched: false, cancel: reason };
    this.log('castCancel', { reason, t: +p.t.toFixed(3), shown: p.vis });
    if (!p.vis) { this.dropPreview(reason); return; }
    p.cancel = { reason, t: 0, d0: p.dissolve };
    this.fx.castFade(p.pos.clone(), p.scale);
  }
  fadePreview(p, dt) {
    p.cancel.t += dt;
    const k = Math.min(1, p.cancel.t / 0.15);
    this.rig.update(dt, { flap: 0.8, glide: 0.6, dissolve: p.cancel.d0 + (1 - p.cancel.d0) * k, glow: 1.5 });
    if (k >= 1) this.dropPreview(p.cancel.reason);
  }
  dropPreview(reason = 'drop') {
    const p = this.pre;
    if (!p) return;
    p.snd?.stop?.(0.08);
    if (!this.bird) { this.rig.root.visible = false; this.rig.update(0, { dissolve: 0 }); }
    this.pre = null;
    void reason;
  }
  // 自检 / 诊断：这一次舞刀的事件时刻与绕身的统计
  castRecord(p) {
    const st = p.stat, rt = [...st.rt].sort((x, y) => x - y), q = (f) => (rt.length ? rt[Math.min(rt.length - 1, Math.floor(f * rt.length))] : null);
    return { mode: p.mode, events: p.events.map((e) => ({ ...e })), travelDeg: +(st.travel / DEG).toFixed(1), minClear: Number.isFinite(st.minClear) ? +st.minClear.toFixed(3) : null,
      maxStep: +st.maxStep.toFixed(3), maxSpeed: +(st.maxSpeed || 0).toFixed(2), R: +p.R.toFixed(3), frames: st.frames, intent: p.intent, armed: p.armed,
      rt: { median: q(0.5), p95: q(0.95), max: rt.length ? rt[rt.length - 1] : null } };
  }
  castInfo() {
    const p = this.pre;
    if (!p) return null;
    return { t: +p.t.toFixed(3), mode: p.mode, vis: p.vis, cancel: p.cancel?.reason || null, scale: +p.scale.toFixed(3), dissolve: +p.dissolve.toFixed(3), events: p.events.map((e) => e.name),
      pos: p.pos.toArray().map((v) => +v.toFixed(3)), intent: p.intent, armed: p.armed };
  }

  // =====================================================================================
  // 凤翔天击：飞行、左键接管
  // =====================================================================================
  // p：舞刀的预演（左键：起手时原本按着的要先松开；舞刀中新按下、仍按着的，离刀即开始操控）
  beginStrike(b, p = null) {
    b.armed = p ? p.armed : !this.moves.held.light;
    b.held = !!(p && p.intent);
    b.steering = b.held;
    b.returning = false; b.warned = false; b.execRolled = false; b.lastG = null; b.strip = 0;
    b.speed = S.speed; b.diving = false; b.wantS = b.dir.clone(); b.aimSrc = 'hold';
    b.diag = { frames: [], press: [], resp: [], retake: [], returns: 0, dives: 0, aimMiss: 0 };
    if (b.steering) b.diag.press.push({ t: 0, dir0: b.dir.clone(), fromCast: true });
    // 进入凤翔天击：清掉尚未执行的普攻缓冲与按住
    const M = this.moves;
    if (M.buffer?.kind === 'light') M.buffer = null;
    M.held.light = false;
    this.cam.pitchRange = [S.camPitch[0] * DEG, S.camPitch[1] * DEG];
    b.reticle = true;
  }
  // 接管左键：凤翔天击的飞行阶段；第二十二轮起舞刀（凤翔天击的起手）中也接管——记下操控意图，不出剑
  ownsLMB() {
    const b = this.bird;
    if (b && b.kind === 'strike' && b.phase === 'fly') return true;
    const p = this.pre;
    return !!(p && !p.cancel && p.mode === 'strike');
  }
  // 左键按下 / 松开（pointer 在接管时转到这里）
  steer(down) {
    if (!this.ownsLMB()) return false;
    const b = this.bird && this.bird.kind === 'strike' && this.bird.phase === 'fly' ? this.bird : null;
    if (!b) {
      const p = this.pre;
      if (!down) { p.intent = false; p.armed = true; } else if (p.armed) p.intent = true;
      return true;
    }
    if (!down) { b.held = false; b.steering = false; b.armed = true; return true; }
    if (!b.armed) return true;                       // 起手前就按着的那一下：不算
    b.held = true;
    if (!b.returning) { b.steering = true; b.diag.press.push({ t: b.t, dir0: b.dir.clone() }); }
    return true;
  }
  // 镜头准星的射线打到的世界点：敌人身体（胶囊）、构筑物、地形；rayMax 内都没打到就取 rayMax 处。返回 { p, t, kind }
  // 射线的方向直接按镜头此刻的偏航 / 俯仰（鼠标一动就变；不等镜头对象在这一帧末尾才更新的朝向——少一帧延迟），起点是镜头的位置
  aimPoint() {
    const c = this.cam, o = _co, d = _cd, cp = Math.cos(c.pitch);
    c.camera.getWorldPosition(o);
    d.set(Math.sin(c.yaw) * cp, -Math.sin(c.pitch), Math.cos(c.yaw) * cp).normalize();
    let t = S.aim.rayMax, kind = 'far';
    const end = _aim.copy(o).addScaledVector(d, t);
    for (const u of this.combat.targets()) {
      if (!u.alive || u.hidden?.()) continue;
      for (const c of this.capsulesOf(u)) {
        const q = segSeg(o, end, c.a, c.b);
        if (q.d <= c.r + 0.15 && q.s * S.aim.rayMax < t) { t = q.s * S.aim.rayMax; kind = 'enemy'; }
      }
    }
    const W = this.combat.world;
    if (W?.cw?.ray) { const tw = W.cw.ray(o, d, t); if (tw < t) { t = tw; kind = 'wall'; } }
    const T = W?.terrain;
    if (T) {
      // 地形：每 1.5 米一步，穿进地面就二分
      const below = (s) => o.y + d.y * s < T.heightAt(o.x + d.x * s, o.z + d.z * s);
      let prev = 0;
      for (let s = 1.5; s <= t + 1e-6; s += 1.5) {
        if (below(s)) { let lo = prev, hi = s; for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (below(m)) hi = m; else lo = m; } if (hi < t) { t = hi; kind = 'ground'; } break; }
        prev = s;
      }
    }
    return { p: _aim.copy(o).addScaledVector(d, t), t, kind, o, d };
  }
  // 按住左键时的期望方向：从凤凰的位置朝准星所指的那一点；离它 near 米内、或已越过它（在凤凰身后，且凤凰沿准星射线已过了它）时为 null（保持当前方向）
  steerWant(b, out) {
    const A = this.aimPoint(), to = out.subVectors(A.p, b.pos), dist = to.length();
    b.aimKind = A.kind; b.aimT = A.t;
    if (dist < S.aim.near) return null;
    to.divideScalar(dist);
    const along = _l.subVectors(b.pos, A.o).dot(A.d);
    if (to.dot(b.dir) < 0 && along > A.t - S.aim.near) return null;
    // 轻度瞄准辅助：准星 cone° 内、离凤凰 range 米内、看得见、不在凤凰身后（转向不超过 75°）的敌人——把期望方向往它偏 k
    b.assistT = null;
    if (this.assist) {
      const AS = S.assist;
      let best = null, bestA = AS.cone * DEG;
      for (const u of this.combat.targets()) {
        if (!u.alive || u.hidden?.()) continue;
        const c = _o.set(u.pos.x, ((u.headY ?? u.pos.y + 1.8) + u.pos.y) / 2, u.pos.z);
        const ac = _d.subVectors(c, A.o).normalize().angleTo(A.d);
        if (ac > bestA) continue;
        const dB = c.distanceTo(b.pos);
        if (dB > AS.range || dB < 0.5) continue;
        const tu = _d.subVectors(c, b.pos).divideScalar(dB);
        if (tu.dot(b.dir) < Math.cos(75 * DEG)) continue;
        if (!this.clearLine(b.pos, c)) continue;
        bestA = ac; best = { u, dir: tu.clone() };
      }
      if (best) { out.lerp(best.dir, AS.k).normalize(); b.assistT = best.u; }
    }
    return out;
  }
  // 俯冲：前方 range 米内、与飞行方向夹角 cone° 内（已在俯冲时放宽到 1.5 倍，偏离明显才回落）、看得见的敌人
  diveCheck(b) {
    const D = S.dive, lim = (b.diving ? D.cone * 1.5 : D.cone) * DEG;
    for (const u of this.combat.targets()) {
      if (!u.alive || u.hidden?.()) continue;
      const c = _o.set(u.pos.x, ((u.headY ?? u.pos.y + 1.8) + u.pos.y) / 2, u.pos.z), dd = c.distanceTo(b.pos);
      if (dd - (u.radius ?? 0.45) > D.range + (b.diving ? 3 : 0)) continue;
      if (_d.subVectors(c, b.pos).normalize().angleTo(b.dir) > lim) continue;
      if (!this.clearLine(b.pos, c)) continue;
      return u;
    }
    return null;
  }
  // 离刀之后 grow 秒内由灵体尺度平滑展开到正式尺度
  growStep(b, dt) {
    if (!b.grow) return;
    b.grow.t += dt;
    const k = smooth01(b.grow.t / K.grow);
    b.scale = b.grow.s0 + (b.grow.s1 - b.grow.s0) * k;
    b.rig.setScale(b.scale);
    if (k >= 1) b.grow = null;
  }
  updateStrike(b, dt) {
    const P = this.player, owner = _w.set(P.pos.x, P.pos.y + 1.4, P.pos.z);
    b.t += dt;
    this.growStep(b, dt);
    // 折返（滞回）：超过 maxDist 自动折返、不接受左键；回到 retake 米内才可再操控（左键仍按着就直接接上）
    const dist = b.pos.distanceTo(owner);
    if (b.returning) {
      if (dist < S.retake) {
        b.returning = false; b.diag.retake.push(+b.t.toFixed(3));
        this.toast(`凤凰已回到 ${S.retake} 米内 · 按住左键可再操控`);
        this.log('retake', { dist: +dist.toFixed(1) });
        if (b.held && b.armed) { b.steering = true; b.diag.press.push({ t: b.t, dir0: b.dir.clone(), retake: true }); }
      }
    } else if (dist > S.maxDist) {
      b.returning = true; b.steering = false; b.diag.returns++;
      this.toast(`凤凰折返 · 回到 ${S.retake} 米内可再操控`);
      this.log('return', { dist: +dist.toFixed(1) });
    }
    if (!b.returning && dist > S.warnDist && !b.warned) { b.warned = true; this.toast(`凤凰将飞出 ${S.maxDist} 米之外`); }
    if (dist < S.warnDist - 6) b.warned = false;
    // 期望方向：折返时朝主人；按住左键时朝准星所指的点（越过 / 太近时保持）；松开保持
    let want = null;
    if (b.returning) { want = _want.subVectors(owner, b.pos).normalize(); b.aimSrc = 'return'; }
    else if (b.steering) { want = this.steerWant(b, _want); b.aimSrc = want ? 'aim' : 'hold'; if (!want) b.diag.aimMiss++; }
    else b.aimSrc = 'hold';
    // 平滑（时间常数 smooth 秒）：期望方向往 want 转过 1 − e^(−dt/τ) 的角度；保持时期望方向就是当前方向
    if (want) {
      _qa.setFromUnitVectors(b.wantS, want);
      _qb.identity().slerp(_qa, 1 - Math.exp(-dt / S.smooth));
      b.wantS.applyQuaternion(_qb).normalize();
    } else b.wantS.copy(b.dir);
    const d0 = b.dir.clone();
    turnLimited(b.dir, b.wantS, S.turnH * DEG * dt, S.turnV * DEG * dt, S.pitchLimit * DEG);
    // 转向角速度（侧倾、尾羽用）：水平面上的转角 / dt，正为右转
    const yaw0 = Math.atan2(d0.x, d0.z), yaw1 = Math.atan2(b.dir.x, b.dir.z);
    const dyaw = Math.atan2(Math.sin(yaw0 - yaw1), Math.cos(yaw0 - yaw1));
    b.turnRate += ((dt > 0 ? dyaw / dt : 0) - b.turnRate) * Math.min(1, dt * 8);
    // 俯冲：时间常数 dive.tau 加速 / 回落
    const dv = this.diveCheck(b);
    if (!!dv !== b.diving) { b.diving = !!dv; if (dv) b.diag.dives++; this.log(dv ? 'dive' : 'diveOff', { target: dv ? dv.id || dv.kind : null }); }
    b.speed += ((b.diving ? S.dive.speed : S.speed) - b.speed) * (1 - Math.exp(-dt / S.dive.tau));
    // 诊断：按下左键之后方向第一次明显改变（> 0.3°）的时刻
    for (const pr of b.diag.press) if (pr.resp == null && b.dir.angleTo(pr.dir0) > 0.3 * DEG) { pr.resp = +(b.t - pr.t).toFixed(4); b.diag.resp.push(pr.resp); }
    const ang = dt > 0 ? d0.angleTo(b.dir) / dt / DEG : 0;
    if (b.diag.frames.length < 1200) b.diag.frames.push([+b.t.toFixed(3), +this.rt.toFixed(1), +(b.wantS.angleTo(b.dir) / DEG).toFixed(2), +ang.toFixed(1), +b.speed.toFixed(2), b.diving ? 1 : 0, b.returning ? 1 : 0, b.steering ? 1 : 0, b.aimSrc]);
    // 前进（连续检测；展开中的判定半径随尺度）
    const from = b.pos.clone(), to = from.clone().addScaledVector(b.dir, b.speed * dt);
    const edge = this.boundsCut(from, to);
    const rad = S.radius * Math.max(0.35, b.scale / PHOENIX.model.strikeScale);
    const hit = this.sweepTargets(from, edge.p, rad), env = this.sweepEnv(from, edge.p);
    const first = [hit, env].filter(Boolean).sort((a, c) => a.f - c.f)[0];
    if (first) { b.pos.copy(first.point); this.sampleFire(b); this.impact(b, first); return; }
    b.pos.copy(edge.p);
    this.sampleFire(b);
    if (edge.cut) { this.log('bounds', { at: b.pos.toArray().map((v) => +v.toFixed(1)) }); this.endBird('bounds'); return; }
    if (b.t >= S.duration) { this.endBird('timeout'); return; }
    this.poseStrike(b, dt, 1);
  }
  poseStrike(b, dt, k) {
    const pitch = Math.asin(clamp(b.dir.y, -1, 1));
    const diving = Math.max(clamp(-pitch / (50 * DEG), 0, 1), b.diving ? 0.55 : 0), climbing = clamp(pitch / (40 * DEG), 0, 1), tr = clamp(b.turnRate / (120 * DEG), -1, 1);
    b.bank = tr * 0.7;
    b.rig.place(b.pos, b.dir, b.bank);
    // 离刀的头 0.3 秒展翅（由汇聚时的收翅舒展开）
    const spread = b.t < 0.3 ? 1 - b.t / 0.3 : 0;
    b.rig.update(dt, { flap: 1.15 + climbing * 0.6 - diving * 0.5 + spread * 0.5, glide: (1 - climbing) * (1 - diving) * 0.55 * k, fold: diving * 0.85, turn: tr, glow: 1.0 + spread * 0.3 });
    if (k) this.fx.trail(b.rig, b.dir, Math.max(0.35, b.scale / PHOENIX.model.strikeScale));
  }
  // 地图硬边界：from → to 这一段出了可加载的范围，就截在边界内
  inBounds(p) {
    const W = this.world, T = this.combat.world?.terrain;
    if (p.y > 420) return false;
    if (W === 'boss50') return Math.hypot(p.x, p.z) < 24;
    if (W === 'boss30') return Math.hypot(p.x, p.z) < 18;            // 第二十四轮：第三十层（火墙以内）
    if (T?.inCore) return T.inCore(p.x, p.z, 2);
    return true;
  }
  boundsCut(from, to) {
    if (this.inBounds(to)) return { p: to, cut: false };
    let lo = 0, hi = 1;
    for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (this.inBounds(_v.lerpVectors(from, to, m))) lo = m; else hi = m; }
    return { p: from.clone().lerp(to, lo), cut: true };
  }
  // 扫过的一段对敌人身体（胶囊）：返回最早的接触 { f 比例, point, u }
  sweepTargets(from, to, r) {
    let best = null;
    for (const u of this.combat.targets()) {
      if (!u.alive || u.hidden?.()) continue;
      const caps = this.capsulesOf(u);
      for (const c of caps) {
        const q = segSeg(from, to, c.a, c.b);
        if (q.d <= r + c.r && (!best || q.s < best.f)) best = { f: q.s, point: from.clone().lerp(to, q.s), u, part: c.part };
      }
    }
    return best;
  }
  capsulesOf(u) {
    if (u.capsules) { const cs = u.capsules(); if (cs?.length) return cs; }
    const top = (u.headY ?? u.pos.y + 1.8) - 0.15;
    return [{ a: new THREE.Vector3(u.pos.x, u.pos.y + 0.35, u.pos.z), b: new THREE.Vector3(u.pos.x, Math.max(u.pos.y + 0.6, top), u.pos.z), r: u.radius ?? 0.45 }];
  }
  // 扫过的一段对地形、构筑物（每 0.4 米一步；墙用碰撞世界的射线）
  sweepEnv(from, to) {
    const W = this.combat.world, T = W?.terrain;
    if (!T) return null;
    const len = from.distanceTo(to);
    if (len < 1e-6) return null;
    const n = Math.max(1, Math.ceil(len / 0.4));
    for (let i = 1; i <= n; i++) {
      const p = _v.lerpVectors(from, to, i / n);
      const g = this.groundUnder(p.x, p.z, p.y);
      if (p.y <= g + 0.25) {
        // 二分出接触点
        let lo = (i - 1) / n, hi = i / n;
        for (let k = 0; k < 8; k++) { const m = (lo + hi) / 2, q = _w.lerpVectors(from, to, m); if (q.y <= this.groundUnder(q.x, q.z, q.y) + 0.25) hi = m; else lo = m; }
        const q = from.clone().lerp(to, hi);
        q.y = Math.max(q.y, this.groundUnder(q.x, q.z, q.y + 0.5) + 0.05);
        return { f: hi, point: q, ground: true };
      }
    }
    if (W.cw?.ray) {
      const d = _w.subVectors(to, from).normalize();
      const t = W.cw.ray(from, d, len + 0.05);
      if (t < len) return { f: t / len, point: from.clone().addScaledVector(d, Math.max(0, t - 0.1)), wall: true };
    }
    return null;
  }
  // 此处地面（地形、可站的构筑物顶、浮空岛）的最高点，不高于 y
  groundUnder(x, z, y) {
    const W = this.combat.world, T = W.terrain;
    let g = T.heightAt(x, z);
    const c = W.cw?.ground(x, z, y, 0.05);
    if (c > g) g = c;
    if (this.world === 'surface' && this.player.skyGround) { const s = this.player.skyGround(x, z, y); if (s > g && s <= y + 0.05) g = s; }
    return g;
  }
  // 路径正下方最近的真实阻挡表面：{ y, valid, why }（maxD 内没有 → null）
  surfaceBelow(x, y, z, maxD) {
    const W = this.combat.world, T = W.terrain;
    let best = -Infinity, kind = null, col = null, inside = false;
    const th = T.heightAt(x, z);
    if (th <= y + 0.01) { best = th; kind = 'terrain'; }
    if (this.world === 'surface' && this.player.skyGround) { const s = this.player.skyGround(x, z, y); if (s > best && s <= y + 0.01) { best = s; kind = 'isle'; } }
    W.cw?.query(x, z, x, z, (c) => {
      const inXZ = c.type === 0 ? (() => { const dx = x - c.x, dz = z - c.z, lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos; return Math.abs(lx) <= c.hx && Math.abs(lz) <= c.hz; })()
        : (x - c.x) ** 2 + (z - c.z) ** 2 <= c.r * c.r;
      if (!inXZ) return;
      if (c.y0 < y && c.y1 > y) inside = true;
      if (c.y1 <= y + 0.01 && c.y1 > best) { best = c.y1; kind = 'collider'; col = c; }
    });
    if (inside || !kind || y - best > maxD) return null;
    let valid = true, why = '';
    if (kind === 'collider') {
      // 殿阁屋顶、屋身：只有单独配置为可投火的（allowRoofs，按构筑物的 tag）才算有效；其余不可承载的（树干、柱子、栏杆）一律无效
      if (col.kind === 'eave' || col.kind === 'body') { if (!this.allowRoofs.has(col.tag)) { valid = false; why = '殿阁屋顶（未配置为可投火）'; } }
      else if (!col.walk) { valid = false; why = '不可承载（树干、柱子）'; }
    } else {
      const h = (dx, dz) => (kind === 'isle' ? this.player.skyGround(x + dx, z + dz, y) : T.heightAt(x + dx, z + dz));
      const sx = (h(0.6, 0) - h(-0.6, 0)) / 1.2, sz = (h(0, 0.6) - h(0, -0.6)) / 1.2;
      if (Math.atan(Math.hypot(sx, sz)) > S.band.maxSlope * DEG) { valid = false; why = '坡太陡'; }
      const wa = kind === 'terrain' ? T.waterAt?.(x, z) : null;
      if (wa != null && wa - th > 0.3) { valid = false; why = '水面'; }
    }
    return { y: best, valid, why, kind };
  }
  // 火带采样：按地面落点的移动距离每 spacing 一段；落点基本不动不堆积；跨虚空、墙、无效地表不连
  sampleFire(b) {
    if (b.kind !== 'strike') return;
    const B = S.band, s = this.surfaceBelow(b.pos.x, b.pos.y, b.pos.z, B.rayDown);
    if (!s || !s.valid) { if (b.lastG) this.stats.strips++; b.lastG = null; return; }
    const g = new THREE.Vector3(b.pos.x, s.y, b.pos.z);
    if (!b.lastG) { b.lastG = g; b.strip = ++STRIP; return; }
    const d = Math.hypot(g.x - b.lastG.x, g.z - b.lastG.z);
    if (d < B.minMove && Math.abs(g.y - b.lastG.y) < 0.5) return;                          // 垂直上升、悬停：落点不变，不重复堆
    if (d > B.gap || Math.abs(g.y - b.lastG.y) > 1.6) { b.lastG = g; b.strip = ++STRIP; this.stats.strips++; return; }   // 断开（不跨墙、虚空）
    // 补齐：每 spacing 一段，中间点重新探一次地面（无效就断开）
    let prev = b.lastG;
    while (Math.hypot(g.x - prev.x, g.z - prev.z) >= B.spacing) {
      const dx = g.x - prev.x, dz = g.z - prev.z, l = Math.hypot(dx, dz);
      const nx = prev.x + (dx / l) * B.spacing, nz = prev.z + (dz / l) * B.spacing;
      const q = this.surfaceBelow(nx, b.pos.y, nz, B.rayDown);
      if (!q || !q.valid || Math.abs(q.y - prev.y) > 1.6) { b.lastG = g; b.strip = ++STRIP; return; }
      const next = new THREE.Vector3(nx, q.y, nz);
      this.addBand(b, prev, next);
      prev = next;
    }
    b.lastG = prev;
  }
  addBand(b, a, c) {
    const now = this.t, z = { kind: 'band', castId: b.snap.castId, snap: b.snap, a: a.clone(), b: c.clone(), width: S.band.width, born: now, die: now + S.band.life, strip: b.strip, id: ++ATK };
    this.zones.push(z);
    this.stats.bands++;
    this.fx.addBand({ a: z.a, b: z.b, width: z.width, born: z.born, die: z.die, strip: z.strip, id: z.id }, (x, zz, y) => this.groundUnder(x, zz, y));
  }
  addSeal(b, p) {
    const s = this.surfaceBelow(p.x, p.y + 0.6, p.z, S.band.rayDown);
    if (!s || !s.valid) { this.log('seal', { skipped: s ? s.why : '无地面' }); return null; }
    const now = this.t, z = { kind: 'seal', castId: b.snap.castId, snap: b.snap, c: new THREE.Vector3(p.x, s.y, p.z), r: S.seal.radius, born: now, die: now + S.seal.life, id: ++ATK };
    this.zones.push(z);
    this.stats.seals++;
    this.fx.addSeal({ c: z.c, r: z.r, born: z.born, die: z.die }, (x, zz, y) => this.groundUnder(x, zz, y));
    return z;
  }

  // =====================================================================================
  // 撞击：原子结算
  // =====================================================================================
  stageOf(u) { return u?.stageInfo ? u.stageInfo() : { id: 'only', final: true, structure: 'single' }; }
  // 能否判秒杀：活着、不在无敌 / 剧情保护、是有效命中（训练木人、切磋倒地等不算）
  execEligible(u) {
    if (!u || !u.alive || u.dummy) return false;
    if (u.immune?.() || u.invuln > 0 || u.protected?.() || u.state === 'dormant' || u.finaleLock) return false;     // 第二十五轮：被终式处决占用的目标不再进别的处决
    if (u.duel && u.downed) return false;
    return true;
  }
  impact(b, first) {
    const snap = b.snap, at = first.point.clone(), main = first.u || null;
    this.stats.impacts++;
    const rec = { castId: snap.castId, attackId: `${snap.castId}:impact`, target: main ? main.id || main.kind : null, stage: main ? this.stageOf(main).id : null, at: at.toArray().map((v) => +v.toFixed(2)), hit: main ? 'target' : first.ground ? 'ground' : 'wall' };
    if (main) {
      let executed = false;
      if (!b.execRolled && this.execEligible(main)) {
        b.execRolled = true;
        const rk = rankOf(main), low = rk ? lowerRealm(rk.level, snap.L) : false;
        const p = execChance(snap.L, low), roll = this.rand();
        rec.exec = { p: +p.toFixed(4), roll: +roll.toFixed(4), low };
        this.stats.execRolls++;
        if (roll < p) executed = this.executeStage(main, snap, rec);
      }
      if (!executed) {
        const D = this.dmgFor(snap, S.hit.main, main, true, rec.attackId);
        const r = this.deal(main, D.amount, { kind: 'phoenix', at, big: true, stun: 0.9, knock: 2.6, posture: 26, stageId: rec.stage, crit: D.crit });
        rec.main = { amount: +D.amount.toFixed(2), crit: D.crit, low: D.low, result: r };
        this.stats.mainDmg += r === 'hit' ? D.amount : 0;
      }
    }
    // 周围爆发：逐个检查距离与墙体遮挡；主目标不吃这一份；不暴击、不秒杀
    rec.burst = [];
    for (const u of this.combat.targets()) {
      if (u === main || !u.alive || u.hidden?.()) continue;
      const near = this.nearestPoint(u, at);
      if (near.d > S.hit.burstR) continue;
      if (!this.clearLine(at, near.p)) { rec.burst.push({ target: u.id || u.kind, blocked: true }); continue; }
      const D = this.dmgFor(snap, S.hit.burst, u, false);
      const r = this.deal(u, D.amount, { kind: 'phoenix', at: near.p, stun: 0.45, push: 1.4, posture: 8 });
      rec.burst.push({ target: u.id || u.kind, amount: +D.amount.toFixed(2), low: D.low, result: r });
      if (r === 'hit') { this.stats.burstDmg += D.amount; this.stats.burstHits++; }
    }
    // 凤焰印（有效地表上）
    const seal = this.addSeal(b, at);
    rec.seal = !!seal;
    this.fx.impact(at, S.hit.burstR);
    this.combat.hitStop(S.hit.hitStop);
    this.combat.shake(S.hit.shake);
    this.sound?.play('phoenixBlast', { at, gain: 1 });
    this.log('impact', rec);
    this.endBird('impact', true);
  }
  // 秒杀：走目标自己的「阶段结束」流程（不另造死亡入口）；最终阶段即死亡与整场胜利结算
  executeStage(u, snap, rec) {
    const st = this.stageOf(u);
    let ok = false;
    if (u.endStage) ok = u.endStage({ reason: 'phoenix', castId: snap.castId, from: this.unit });
    else if (u.alive) { this.combat.damage(u, u.hp + 1, { from: this.unit, kind: 'phoenix', big: true, execute: true }); ok = !u.alive; }
    rec.executed = { ok, stage: st.id, final: !!st.final, structure: st.structure };
    if (ok) {
      this.stats.execs++;
      this.combat.popNumber(u, st.final ? '凤 · 斩' : '凤 · 断阶', 'crit');
    }
    return ok;
  }
  // 伤害数值：D_cast × 系数 × 境界克制 × 暴击（canCrit 时，同一次攻击对同一目标只抽一次）
  dmgFor(snap, coef, u, canCrit, attackId = null) {
    let amount = snap.dCast * coef;
    const rk = rankOf(u), low = rk ? lowerRealm(rk.level, snap.L) : false;
    if (!rk && !u.dummy) this.unranked(u);
    if (low) amount *= PHOENIX.lowRealmK;
    let crit = false;
    if (canCrit && attackId) {
      const key = `${attackId}:${u.id || u.kind}`;
      if (!this.crits.has(key)) this.crits.set(key, this.rand() < snap.crit.rate);
      crit = this.crits.get(key);
      if (crit) { amount *= snap.crit.mult; this.stats.crits++; }
    }
    return { amount, low, crit };
  }
  unranked(u) { const k = u.kind || u.id; if (!(this._unr ||= new Set()).has(k)) { this._unr.add(k); console.info(`[九霄凤焰] ${u.cfg?.name || k} 没有配置境界：不触发境界克制`); } }
  // 交给 combat.damage（目标自己的防御、减伤、无敌照常）；stageId：延迟效果到达时阶段号对不上就丢掉（主目标）
  deal(u, amount, o = {}) {
    if (!u.alive) return null;
    if (o.stageId != null && this.stageOf(u).id !== o.stageId) { this.log('stale', { target: u.id || u.kind, was: o.stageId, now: this.stageOf(u).id }); return 'stale'; }
    const r = this.combat.damage(u, amount, { from: this.unit, kind: o.kind || 'phoenix', at: o.at, big: o.big, stun: o.stun, push: o.push, knock: o.knock, posture: o.posture, dot: o.dot, counter: o.crit });
    return r || null;
  }
  // 单位身上离 p 最近的一点（范围伤害、遮挡检查用）
  nearestPoint(u, p) {
    let best = null;
    for (const c of this.capsulesOf(u)) {
      const ab = _u.subVectors(c.b, c.a), L2 = ab.lengthSq();
      const t = L2 > 1e-9 ? clamp(_v.subVectors(p, c.a).dot(ab) / L2, 0, 1) : 0;
      const q = c.a.clone().addScaledVector(ab, t), d = Math.max(0, q.distanceTo(p) - c.r);
      if (!best || d < best.d) best = { d, p: q };
    }
    return best || { d: Infinity, p: u.pos.clone() };
  }
  // 两点之间没有墙（构筑物射线）与山体
  clearLine(a, b) {
    const W = this.combat.world, d = _w.subVectors(b, a), len = d.length();
    if (len < 0.3) return true;
    d.divideScalar(len);
    if (W.cw?.ray && W.cw.ray(a, d, len) < len - 0.35) return false;
    const n = Math.ceil(len / 1.5);
    for (let i = 1; i < n; i++) { const p = _v.copy(a).addScaledVector(d, (len * i) / n); if (p.y < W.terrain.heightAt(p.x, p.z) - 0.2) return false; }
    return true;
  }

  // =====================================================================================
  // 火带与凤焰印：接触、共享间隔、灼烧与治疗
  // =====================================================================================
  // 单位 u 此刻接触着哪些区域（地面接触：脚离区域表面 1 米内）
  zonesTouching(u, out = []) {
    out.length = 0;
    const p = u.pos, t = this.t, r = (u.radius ?? 0.4) * 0.5;
    for (const z of this.zones) {
      if (t < z.born || t > z.die) continue;
      if (z.kind === 'band') {
        const q = segXZ(p, z.a, z.b);
        if (q.d > z.width / 2 + r) continue;
        const gy = z.a.y + (z.b.y - z.a.y) * q.u;
        if (Math.abs(p.y - gy) > 1.0) continue;
      } else {
        if (Math.hypot(p.x - z.c.x, p.z - z.c.z) > z.r + r) continue;
        if (Math.abs(p.y - z.c.y) > 1.0) continue;
      }
      out.push(z);
    }
    return out;
  }
  updateZones(dt) {
    const t = this.t;
    if (this.zones.length) {
      const U = this.combat.playerUnit, touch = [];
      // 主人：治疗（同一次技能共享间隔）
      this.zonesTouching(U, touch);
      const inFire = touch.length > 0 && U.alive;
      if (inFire) { this.stats.fireStay += dt; this.inFireT = t; }
      this.campT = inFire ? (this.campT || 0) + dt : 0;
      if (inFire) for (const castId of new Set(touch.map((z) => z.castId))) {
        const tk = this.ticks.get(castId) || this.ticks.set(castId, new Map()).get(castId);
        const next = tk.get(U) ?? -1;
        if (t + 1e-6 < next) continue;
        tk.set(U, t + S.tick);
        const z = touch.find((q) => q.castId === castId), amount = z.snap.maxHp * S.heal;
        const before = U.hp;
        this.combat.healPlayer(amount);
        const eff = U.hp - before;
        this.stats.healTheory += amount; this.stats.healEff += eff; this.stats.healOver += amount - eff; this.stats.healTicks++;
        this.fx.heal(this.player.pos);
      }
      // 敌人：灼烧
      for (const u of this.combat.targets()) {
        if (!u.alive || u.dummy || u.hidden?.()) continue;
        this.zonesTouching(u, touch);
        if (!touch.length) continue;
        for (const castId of new Set(touch.map((z) => z.castId))) {
          const tk = this.ticks.get(castId) || this.ticks.set(castId, new Map()).get(castId);
          if (t + 1e-6 < (tk.get(u) ?? -1)) continue;
          tk.set(u, t + S.tick);
          const z = touch.find((q) => q.castId === castId);
          const D = this.dmgFor(z.snap, S.burn, u, false);
          const r = this.deal(u, D.amount, { kind: 'fire', dot: true, at: u.pos });
          if (r === 'hit') { this.stats.burnDmg += D.amount; this.stats.burnTicks++; }
          this.fx.burn(u.pos);
        }
      }
      // 过期的区域（渲染单元由 fx 自己按到期时刻回收）
      for (let i = this.zones.length - 1; i >= 0; i--) if (t > this.zones[i].die) this.zones.splice(i, 1);
    }
    for (const [castId] of this.ticks) if (!this.zones.some((z) => z.castId === castId) && this.bird?.snap.castId !== castId) this.ticks.delete(castId);
  }
  // 主人已在自己的火里连续站了多久（第五十层龙君据此更常出逼退招式）
  campSecs() { return this.zones.length ? this.campT || 0 : 0; }
  // 主人站在哪个来源里（弹反冲击用）：D_cast 最高者，同值取最新
  sourceForOwner() {
    const touch = this.zonesTouching(this.combat.playerUnit, []);
    if (!touch.length) return null;
    touch.sort((a, b) => b.snap.dCast - a.snap.dCast || b.born - a.born);
    return touch[0];
  }
  // 受伤记录：站在火里时承受的伤害
  onHitEvent(e) {
    if (e.target === this.combat.playerUnit && e.amount > 0 && (e.result === 'hit' || e.result === 'block' || e.result === 'guardbreak')) {
      if (this.t - this.inFireT < 0.05) this.stats.fireTaken += e.amount;
    }
    if (e.target === this.unit && e.amount > 0) this.stats.guardTaken += e.amount;
  }

  // =====================================================================================
  // 凤焰弹反
  // =====================================================================================
  // evt：{ seq（这一次弹反的序号）, specId, seg, from, at } —— moves.onParry 在真实弹反成功时调用
  onParry(evt) {
    const key = `${evt.from?.id ?? evt.specId?.split(':')[0] ?? '?'}|${evt.specId}|${evt.seg ?? 0}|${evt.seq}`;
    if (this.parrySeen.has(key)) return null;
    this.parrySeen.set(key, this.t);
    for (const [k, t] of this.parrySeen) if (this.t - t > 30) this.parrySeen.delete(k);
    const src = this.sourceForOwner();
    if (!src) return null;
    if (this.t < this.parryReady) { this.stats.parryCdSkip++; this.log('parrySkip', { key, left: +(this.parryReady - this.t).toFixed(2) }); return null; }
    this.parryReady = this.t + S.parry.cooldown;
    const P = this.player.pos, at = new THREE.Vector3(P.x, P.y + 1.0, P.z), rec = { key, castId: src.castId, hits: [] };
    for (const u of this.combat.targets()) {
      if (!u.alive || u.hidden?.()) continue;
      const near = this.nearestPoint(u, at);
      if (near.d > S.parry.radius) continue;
      if (!this.clearLine(at, near.p)) continue;
      const D = this.dmgFor(src.snap, S.parry.k, u, false);
      const r = this.deal(u, D.amount, { kind: 'phoenix', at: near.p, stun: u.boss ? undefined : 0.4, push: u.boss ? 0 : 1.6, posture: 10 });
      if (r === 'hit') { this.stats.parryDmg += D.amount; this.stats.parryHits++; rec.hits.push({ target: u.id || u.kind, amount: +D.amount.toFixed(2), low: D.low }); }
    }
    this.stats.parryTriggers++;
    this.fx.parryShock(new THREE.Vector3(P.x, P.y, P.z), S.parry.radius);
    this.combat.hitStop(S.parry.hitStop);
    this.combat.shake(S.parry.shake);
    this.sound?.play('phoenixParry', { at, gain: 0.9 });
    this.log('parryShock', rec);
    return rec;
  }

  // =====================================================================================
  // 凤灵护战
  // =====================================================================================
  beginGuard(b) {
    b.rig.setScale(PHOENIX.model.guardScale);
    const U = this.unit;
    U.maxHp = U.hp = b.snap.maxHp; U.alive = true; U.world = this.world;
    b.phase = 'guard'; b.target = null; b.act = null; b.gcd = 1.0; b.cds = { bolt: 0, swoop: 0, breath: 0 }; b.vel = new THREE.Vector3(); b.hurtT = 0;
    // 第二十二轮：由剑尖离刀，随后飞到护战的位置（不再一下跳到主人头顶）
    this.syncUnit(b);
    this.combat.allies = [U];
  }
  syncUnit(b) {
    const U = this.unit;
    U.pos.set(b.pos.x, b.pos.y - 1.0, b.pos.z); U.headY = b.pos.y + 0.8; U.world = this.world;
  }
  // 敌人的攻击打中护战的凤凰（combat.damage 转到这里）
  receiveHit(amount, o = {}) {
    const b = this.bird, U = this.unit;
    if (!b || b.kind !== 'guard' || !U.alive || b.phase === 'dissolve') return 'immune';
    U.hp = Math.max(0, U.hp - amount);
    b.hurtT = 0.35;
    b.rig.hitFlash(0.9);
    this.fx.hurt(b.pos.clone());
    this.combat.popNumber(U, `${Math.round(amount)}`, 'hurt');
    this.combat.emitHit({ target: U, from: o.from, amount, kind: o.kind, result: 'hit' });
    // 仇恨：这一次攻击打中了凤凰 −30（同一次攻击只减一次）
    const e = o.from;
    if (e && e._ph) { const id = o.spec?.id ?? `${e.id}:${e.atkSeq}`; if (!e._ph.drops.has(id)) { e._ph.drops.add(id); e._ph.v = Math.max(0, e._ph.v - AG.hitDrop); } }
    if (U.hp <= 0) { U.alive = false; this.log('guardDown', {}); this.endBird('slain'); }
    return 'hit';
  }
  updateGuard(b, dt) {
    b.t += dt;
    this.growStep(b, dt);
    if (b.t >= G.duration) { this.endBird('timeout'); return; }
    b.gcd -= dt; for (const k in b.cds) b.cds[k] -= dt;
    b.hurtT = Math.max(0, b.hurtT - dt);
    const P = this.player.pos;
    // 选目标：主人锁定的 → 正在打主人的 → 范围内最近的（看得见、在可加载范围内）
    if (!b.act) b.target = this.pickGuardTarget(b);
    const T = b.target;
    // 移动：交战时贴近到攻击距离、略低（敌人够得着它）；否则回到主人身边上方
    let goal, h = G.height;
    if (T && !b.act) {
      const tp = T.pos, d = Math.hypot(tp.x - b.pos.x, tp.z - b.pos.z), want = b.cds.breath <= 0 ? G.breath.range * 0.7 : b.cds.swoop <= 0 ? G.swoop.range * 0.7 : G.bolt.range * 0.5;
      const dir = _v.set(b.pos.x - tp.x, 0, b.pos.z - tp.z); if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0); dir.normalize();
      goal = new THREE.Vector3(tp.x + dir.x * Math.min(want, Math.max(3, d)), 0, tp.z + dir.z * Math.min(want, Math.max(3, d)));
      h = 2.0;
    } else if (!b.act) {
      const f = this.cam.forward();
      goal = new THREE.Vector3(P.x - f.z * 2.2 - f.x * 1.5, 0, P.z + f.x * 2.2 - f.z * 1.5);
    }
    if (goal) {
      goal.y = this.groundUnder(goal.x, goal.z, b.pos.y + 3) + h;
      // 跟随距离：超出又没有合法目标就回来
      if (!T && Math.hypot(b.pos.x - P.x, b.pos.z - P.z) > G.follow) goal.set(P.x, P.y + G.height, P.z);
      const to = _w.subVectors(goal, b.pos), dl = to.length();
      const sp = Math.min(G.speed, dl * 2.2);
      if (dl > 0.05) {
        const step = to.multiplyScalar(Math.min(1, (sp * dt) / dl));
        const np = b.pos.clone().add(step);
        if (this.inBounds(np) && this.clearLine(b.pos, np)) b.pos.copy(np);
        b.vel.copy(step).divideScalar(Math.max(dt, 1e-4));
      } else b.vel.set(0, 0, 0);
    }
    // 攻击：统一调度（公共间隔 + 各自冷却），一次只出一招
    if (b.act) this.stepGuardAttack(b, dt);
    else if (T && b.gcd <= 0) this.pickGuardAttack(b, T);
    // 朝向与动作
    const face = b.act?.dir || (T ? _u.set(T.pos.x - b.pos.x, 0, T.pos.z - b.pos.z) : b.vel.lengthSq() > 0.1 ? _u.set(b.vel.x, 0, b.vel.z) : _u.set(Math.sin(this.player.heading), 0, Math.cos(this.player.heading)));
    if (face.lengthSq() > 1e-6) { face.normalize(); b.dir.lerp(face, Math.min(1, dt * 6)).normalize(); }
    const atk = b.act ? (b.act.stage === 'wind' ? 0.6 : b.act.stage === 'hit' ? 1 : 0.3) : 0;
    const swooping = b.act?.kind === 'swoop' && b.act.stage === 'hit';
    b.rig.place(b.pos, swooping ? b.act.dir : b.dir, 0);
    b.rig.update(dt, { flap: b.vel.lengthSq() > 4 ? 1.3 : 0.9, glide: swooping ? 0.2 : 0.35, fold: swooping ? 0.7 : 0, attack: atk, hit: b.hurtT > 0 ? 1 : 0, glow: 0.95 });
    this.syncUnit(b);
    if (Math.random() < 0.5) this.fx.trail(b.rig, b.dir, 0.55);
  }
  pickGuardTarget(b) {
    const P = this.player.pos, M = this.moves, list = this.combat.targets().filter((u) => u.alive && !u.dummy && !u.hidden?.());
    const ok = (u) => Math.hypot(u.pos.x - P.x, u.pos.z - P.z) <= G.search && this.inBounds(u.pos) && this.clearLine(b.pos, _v.set(u.pos.x, u.pos.y + 1, u.pos.z));
    if (M.lock?.alive && list.includes(M.lock) && ok(M.lock)) return M.lock;
    const atkMe = list.filter((u) => (u.state === 'windup' || u.state === 'strike' || u.boss) && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) < 9 && ok(u));
    const pool = atkMe.length ? atkMe : list.filter(ok);
    let best = null, bd = Infinity;
    for (const u of pool) { const d = Math.hypot(u.pos.x - P.x, u.pos.z - P.z); if (d < bd) { bd = d; best = u; } }
    return best;
  }
  pickGuardAttack(b, T) {
    const d = Math.hypot(T.pos.x - b.pos.x, T.pos.z - b.pos.z);
    let kind = null;
    if (b.cds.breath <= 0 && d <= G.breath.range) kind = 'breath';
    else if (b.cds.swoop <= 0 && d <= G.swoop.range) kind = 'swoop';
    else if (b.cds.bolt <= 0 && d <= G.bolt.range) kind = 'bolt';
    if (!kind) return;
    const A = G[kind];
    b.act = { kind, id: `${b.snap.castId}:${kind}:${++ATK}`, stage: 'wind', t: 0, target: T, stageId: this.stageOf(T).id, dir: _v.set(T.pos.x - b.pos.x, 0, T.pos.z - b.pos.z).normalize().clone(), hits: new Set(), exp: new Map() };
    b.cds[kind] = A.cd; b.gcd = G.gcd;
    this.stats.guardAtk[kind]++;
    this.sound?.play(kind === 'bolt' ? 'phoenixBolt' : kind === 'breath' ? 'phoenixBreath' : 'phoenixSwoop', { at: b.pos, gain: 0.7 });
  }
  stepGuardAttack(b, dt) {
    const a = b.act, A = G[a.kind], T = a.target;
    a.t += dt;
    if (a.stage === 'wind') {
      if (T?.alive) a.dir.set(T.pos.x - b.pos.x, 0, T.pos.z - b.pos.z).normalize();
      if (a.t >= A.windup) { a.stage = 'hit'; a.t = 0; this.guardStrike(b, a); }
      return;
    }
    if (a.stage === 'hit') {
      if (a.kind === 'swoop') {
        // 掠翼突袭：沿出手时的方向贴地掠过，路过的敌人各结算一次
        const from = b.pos.clone(), to = from.clone().addScaledVector(a.dir, (A.range / A.dur) * dt);
        to.y = this.groundUnder(to.x, to.z, to.y + 2) + 1.4;
        if (this.inBounds(to) && this.clearLine(from, to)) b.pos.copy(to);
        for (const u of this.combat.targets()) {
          if (!u.alive || u.dummy || a.hits.has(u) || u.hidden?.()) continue;
          const q = segXZ(u.pos, from, to);
          if (q.d > A.width / 2 + (u.radius ?? 0.45)) continue;
          a.hits.add(u);
          const D = this.dmgFor(b.snap, A.k, u, true, a.id);
          const r = this.deal(u, D.amount, { kind: 'phoenix', at: b.pos.clone(), stun: 0.4, push: 1.2, posture: 6, stageId: u === T ? a.stageId : undefined, crit: D.crit });
          this.afterGuardHit(u, a, D, r);
        }
        this.fx.swoop(b.pos, a.dir);
        if (a.t >= A.dur) this.endGuardAttack(b);
      } else if (a.kind === 'breath') {
        // 吐息：锥内的时间折算伤害，总量固定（完整命中 = k × D_cast），不按帧重复结算
        const mouth = b.rig.bonePos('b_Head', new THREE.Vector3());
        if (T?.alive) a.dir.lerp(_v.set(T.pos.x - b.pos.x, 0, T.pos.z - b.pos.z).normalize(), Math.min(1, dt * 1.5)).normalize();
        this.fx.breath(mouth, a.dir, A.range, A.arc * DEG);
        const step = Math.min(dt, Math.max(0, A.dur - (a.t - dt)));
        for (const u of this.combat.targets()) {
          if (!u.alive || u.dummy || u.hidden?.()) continue;
          const near = this.nearestPoint(u, mouth);
          const dx = near.p.x - mouth.x, dz = near.p.z - mouth.z, d = Math.hypot(dx, dz);
          if (d > A.range) continue;
          const ang = Math.abs(Math.atan2(dx * a.dir.z - dz * a.dir.x, dx * a.dir.x + dz * a.dir.z));
          if (ang > (A.arc * DEG) / 2 + Math.atan2(u.radius ?? 0.45, Math.max(1, d))) continue;
          if (!this.clearLine(mouth, near.p)) continue;
          a.exp.set(u, (a.exp.get(u) || 0) + step);
          // 每 0.3 秒把这段时间对应的份额结算出去
          const due = a.exp.get(u) - (a.paid?.get(u) || 0);
          if (due >= 0.3 || a.t >= A.dur) {
            (a.paid ||= new Map()).set(u, a.exp.get(u));
            const D = this.dmgFor(b.snap, A.k * (due / A.dur), u, false);
            const r = this.deal(u, D.amount, { kind: 'fire', at: near.p, dot: true, stageId: u === T ? a.stageId : undefined });
            this.afterGuardHit(u, a, D, r, true);
          }
        }
        if (a.t >= A.dur) this.endGuardAttack(b);
      } else if (a.t >= 0.3) this.endGuardAttack(b);
      return;
    }
  }
  // 凤焰弹在出手的一刻发出（飞行由 updateBolts 推进；命中时校验阶段号）
  guardStrike(b, a) {
    if (a.kind !== 'bolt') return;
    const A = G.bolt, from = b.rig.bonePos('b_Head', new THREE.Vector3()), T = a.target;
    const to = T ? _v.set(T.pos.x, (T.headY ?? T.pos.y + 1.8) - 0.6, T.pos.z) : from.clone().addScaledVector(a.dir, A.range);
    (this.bolts ||= []).push({ id: a.id, snap: b.snap, pos: from.clone(), dir: to.clone().sub(from).normalize(), left: A.range * 1.3, target: T, stageId: a.stageId, a });
  }
  updateBolts(dt) {
    if (!this.bolts?.length) return;
    const A = G.bolt;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const o = this.bolts[i];
      if (o.target?.alive) o.dir.lerp(_v.set(o.target.pos.x - o.pos.x, (o.target.headY ?? o.target.pos.y + 1.8) - 0.6 - o.pos.y, o.target.pos.z - o.pos.z).normalize(), Math.min(1, dt * 3)).normalize();
      const from = o.pos.clone(), step = A.speed * dt;
      o.pos.addScaledVector(o.dir, step); o.left -= step;
      this.fx.bolt(o.pos, o.dir);
      const hit = this.sweepTargets(from, o.pos, A.radius), env = this.sweepEnv(from, o.pos);
      const first = [hit, env].filter(Boolean).sort((p, q) => p.f - q.f)[0];
      if (!first && o.left > 0) continue;
      this.bolts.splice(i, 1);
      if (first?.u) {
        const u = first.u, D = this.dmgFor(o.snap, A.k, u, true, o.id);
        const r = this.deal(u, D.amount, { kind: 'phoenix', at: first.point, stun: 0.3, push: 0.6, posture: 5, stageId: u === o.target ? o.stageId : undefined, crit: D.crit });
        this.afterGuardHit(u, o.a, D, r);
      }
      this.fx.boltHit(first ? first.point : o.pos);
      this.sound?.play('phoenixBoltHit', { at: o.pos, gain: 0.6 });
    }
  }
  afterGuardHit(u, a, D, r, partial = false) {
    if (r !== 'hit') return;
    this.stats.guardDmg += D.amount;
    this.addAggro(u, a.id, D.amount, partial);
    this.log('guardHit', { atk: a.kind, target: u.id || u.kind, amount: +D.amount.toFixed(2), crit: D.crit, low: D.low });
  }
  endGuardAttack(b) { b.act = null; }

  // =====================================================================================
  // 隐藏仇恨
  // =====================================================================================
  aggro(e) { return e._ph ||= { v: 0, last: -99, hold: -99, on: false, atk: new Map(), drops: new Set() }; }
  // 一次完整有效攻击：+25 固定（每次攻击一次）+ 伤害贡献（按整次攻击汇总），每次攻击最多 +40
  addAggro(e, attackId, dmg, partial = false) {
    const A = this.aggro(e), stageMax = e.boss ? e.maxHp : e.stageMax ?? e.maxHp ?? 1;
    const rec = A.atk.get(attackId) || { base: false, dmg: 0, added: 0 };
    if (!rec.base) { rec.base = true; rec.added += AG.base; A.v += AG.base; }
    rec.dmg += dmg;
    const contrib = Math.min(AG.dmg, (AG.dmg * rec.dmg) / Math.max(1, stageMax));
    const add = Math.max(0, Math.min(AG.cap - rec.added, contrib - (rec.contrib || 0)));
    rec.contrib = (rec.contrib || 0) + add; rec.added += add; A.v += add;
    A.v = Math.min(AG.max, A.v);
    A.last = this.t;
    A.atk.set(attackId, rec);
    if (A.atk.size > 12) A.atk.delete(A.atk.keys().next().value);
    void partial;
  }
  updateAggro(dt) {
    for (const e of this.combat.enemies.concat(this.combat.extraTargets || [])) {
      const A = e._ph;
      if (!A) continue;
      if (this.t - A.last > AG.idle) A.v = Math.max(0, A.v - AG.decay * dt);
    }
  }
  // 敌人此刻该打谁（combat.js 的敌人与守关龙君在决策时机问这里）：凤凰（仇恨满、仍合法）或 null（照旧打主人）
  // 合法：凤凰活着、在同一场景、在追击范围内（不满足立即失效）；看得见（墙、柱子挡住连续 blind 秒才算失效——飞行中擦过柱子的一两帧不来回切换）。
  // 改打之后至少 hold 秒（期间照样校验）；仇恨仍满就续 0.5 秒；失效之后至少隔 rearm 秒才再改打
  targetFor(e) {
    const b = this.bird, A = e._ph;
    if (!A || !b || b.kind !== 'guard' || !this.unit.alive) { if (A && A.on) { A.on = false; A.offT = this.t; } return null; }
    const U = this.unit;
    const hard = U.world === this.world && Math.hypot(U.pos.x - e.pos.x, U.pos.z - e.pos.z) <= AG.chase;
    const seen = hard && this.clearLine(_a.set(e.pos.x, e.pos.y + 1.2, e.pos.z), _b.set(b.pos.x, b.pos.y, b.pos.z));
    if (A.chkT !== this.t) { A.blindT = seen ? 0 : (A.blindT || 0) + Math.max(0, this.t - (A.chkT ?? this.t)); A.chkT = this.t; }
    else if (seen) A.blindT = 0;
    if (A.on) {
      if (hard && A.blindT < AG.blind && (this.t < A.hold || A.v >= AG.max)) { if (this.t >= A.hold) A.hold = this.t + 0.5; return U; }
      A.on = false; A.offT = this.t;
      this.log('aggroDrop', { enemy: e.id || e.kind, why: !hard ? 'range' : A.blindT >= AG.blind ? 'sight' : 'aggro' });
      return null;
    }
    if (A.v >= AG.max && seen && this.t - (A.offT ?? -99) >= AG.rearm) {
      A.on = true; A.hold = this.t + AG.hold; A.blindT = 0;
      this.log('aggroSwitch', { enemy: e.id || e.kind });
      return U;
    }
    return null;
  }

  // =====================================================================================
  // 每帧
  // =====================================================================================
  // dt：游戏时间（已含顿帧）；hold：Boss 阶段过场等「战斗时钟暂停」时为真（这时只画、不走）
  update(dt, { hold = false } = {}) {
    const cdt = hold ? 0 : dt;
    this.t += cdt;
    const now = performance.now();
    this.rt = this._rt0 ? now - this._rt0 : 0; this._rt0 = now;
    if (this.pre) this.updatePreview(cdt);
    const b = this.bird;
    if (b) {
      // 离刀的这一帧：人物已按这一刻摆好姿势，喙尖再对准此刻的剑尖（之后照常飞）
      if (b.fresh) { b.fresh = false; this.tipPose(b); }
      if (b.phase === 'dissolve') this.updateDissolve(b, cdt);
      else if (b.kind === 'strike') this.updateStrike(b, cdt);
      else this.updateGuard(b, cdt);
      // 振翅声：一段录音约 1.2 秒、里面两三下扇翅——飞行中每 1.2 秒接一段（护战悬停时 1.5 秒），跟着凤凰的位置（音量随距离衰减；audio.js 另有限频）
      if (this.bird === b && b.phase !== 'dissolve' && (b.wingT = (b.wingT ?? 0.6) - cdt) <= 0) {
        b.wingT = b.kind === 'strike' ? 1.2 : 1.5;
        this.sound?.play('phoenixWing', { at: b.pos, gain: b.kind === 'strike' ? 0.55 : 0.4 });
      }
      if (b.kind === 'guard') this.stats.guardDrawT += this.combat.enemies.some((e) => e._ph?.on) ? cdt : 0;
    }
    this.updateBolts(cdt);
    this.updateZones(cdt);
    this.updateAggro(cdt);
    this.fx.update(cdt, this.t);
    if (this.crits.size > 200) this.crits.clear();
  }
  // 结束：impact 撞击后立即收起；其余（到时、出界、被打落）消散 0.6 秒
  endBird(reason, instant = false) {
    const b = this.bird;
    if (!b || b.phase === 'dissolve') return;
    this.log('end', { reason, castId: b.snap.castId, life: +b.t.toFixed(2) });
    if (b.kind === 'strike') { this.cam.pitchRange = null; b.steering = false; this.lastFlight = this.flightRecord(b, reason); }
    if (b.kind === 'guard') { this.unit.alive = false; this.combat.allies = []; for (const e of this.combat.enemies) if (e._ph) e._ph.on = false; }
    this.bolts && (this.bolts.length = 0);
    if (instant) { this.finishBird(); return; }
    b.phase = 'dissolve'; b.dt0 = 0;
    this.fx.dissolveBurst(b.pos.clone(), b.kind === 'strike' ? 1.2 : 0.9);
  }
  updateDissolve(b, dt) {
    b.dt0 += dt;
    b.dissolve = Math.min(1, b.dt0 / 0.6);
    b.pos.y += dt * 0.6;
    b.rig.place(b.pos, b.dir, 0);
    b.rig.update(dt, { flap: 0.6, glide: 0.8, dissolve: b.dissolve, glow: 1.4 });
    if (b.dissolve >= 1) this.finishBird();
  }
  finishBird() {
    const b = this.bird;
    if (!b) return;
    b.rig.root.visible = false;
    b.rig.update(0, { dissolve: 0 });
    this.bird = null;
  }
  // 完整清理：主人倒下、重试、换场景、退出实例（凤凰、火焰、印记、仇恨、事件、左键接管一并清掉）
  clear(reason = 'clear') {
    if (this.pre) { this.cancelCast(reason); this.dropPreview(reason); }
    if (this.bird) { this.log('clear', { reason }); if (this.bird.kind === 'strike') { this.cam.pitchRange = null; this.lastFlight = this.flightRecord(this.bird, reason); } this.finishBird(); }
    this.unit.alive = false; this.combat.allies = [];
    this.zones.length = 0; this.ticks.clear(); this.crits.clear(); this.parrySeen.clear();
    if (this.bolts) this.bolts.length = 0;
    for (const e of this.combat.enemies.concat(this.combat.extraTargets || [])) delete e._ph;
    this.fx.clear();
  }
  moveTo(scene) {
    this.fx.moveTo(scene);
    if (this.rig && this.rig.root.parent !== scene) scene.add(this.rig.root);
  }
  // 调试 / 自检：最近的结算
  log(kind, o) { this.events.unshift({ ...o, kind, t: +this.t.toFixed(3) }); if (this.events.length > 80) this.events.length = 80; }
  // 第二十二轮：一次飞行的诊断——按下左键到方向第一次改变的时间、期望与实际方向之差、转向角速度、速度与俯冲、折返、真实帧时（中位 / p95 / 最大）
  flightRecord(b, reason) {
    const D = b.diag;
    if (!D) return null;
    const F = D.frames, col = (i) => F.map((f) => f[i]), stat = (arr) => { const s = arr.filter((v) => v > 0).sort((x, y) => x - y); return s.length ? { median: s[Math.floor(s.length / 2)], p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))], max: s[s.length - 1], n: s.length } : null; };
    const err = col(2), turn = col(3), sp = col(4);
    return { reason, life: +b.t.toFixed(3), frames: F.length, rt: stat(col(1)), resp: D.resp.slice(), press: D.press.length, retake: D.retake.slice(), returns: D.returns, dives: D.dives,
      errMax: err.length ? Math.max(...err) : 0, errMedian: err.length ? [...err].sort((x, y) => x - y)[Math.floor(err.length / 2)] : 0, turnMax: turn.length ? Math.max(...turn) : 0,
      speedMax: sp.length ? Math.max(...sp) : 0, speedMin: sp.length ? Math.min(...sp) : 0, aimMiss: D.aimMiss, tipAt: b.tipAt || null, raw: F };
  }
  // 第二十二轮：凤凰的着色器在载入（换场景）时先编好、贴图先传上显卡，第一次舞刀显形不卡一下
  //（实测第一次舞刀那一帧的 70 多毫秒其实是第一次出声时建音频上下文——已改到「入山」那一下点击里建，见 main.js）
  prewarm(renderer, camera) {
    const rig = this.rig, sc = this.combat.scene, P = this.player.pos;
    if (!rig || !sc || this.bird || this.pre) return;
    const keep = rig.root.visible, par = rig.root.parent, s0 = rig.root.scale.x;
    if (par !== sc) sc.add(rig.root);
    rig.root.visible = true;
    rig.root.position.set(P.x, P.y - 3, P.z); rig.setScale(1.5);
    rig.update(0, { dissolve: 0.3, glow: 1 });
    try {
      renderer.compile(sc, camera);
      for (const m of rig.materials) for (const k of ['map', 'emissiveMap']) if (m[k]) renderer.initTexture(m[k]);
    } finally { rig.root.visible = keep && !!this.bird; rig.setScale(s0); rig.update(0, { dissolve: 0 }); if (par && par !== sc) par.add(rig.root); }
  }
  // HUD：{ mode, active, kind, left（剩余秒数）, steering, dist, warn }
  hudInfo() {
    const b = this.bird;
    if (!b) return { mode: this.mode, active: false };
    const left = b.kind === 'strike' ? S.duration - b.t : G.duration - b.t;
    return { mode: this.mode, active: true, kind: b.kind, left: Math.max(0, left), steering: !!b.steering, returning: !!b.returning,
      dist: b.pos.distanceTo(_w.set(this.player.pos.x, this.player.pos.y + 1.4, this.player.pos.z)), hp: b.kind === 'guard' ? this.unit.hp / this.unit.maxHp : null };
  }
}
