// 第十五轮：演武场的切磋对手——剑修弟子、护法教习、演武长老，三档难度。
// 外观是金白修士的独立克隆（减面版 cultivator_lo.glb）：各自的骨架、材质（换色）、动作层、佩剑、气血与 AI 状态，互不牵连。
// 出招沿用与玩家同一套动作库的剑招：先放到「定格」那一刻停住（前摇，地面同时亮出红色预警），再出剑；出剑判定在动作的命中时刻做一次，
// 同一次挥剑只结算一次。对手只按「反应延迟之后看到的」玩家状态行事（玩家正在出招的哪一段、是否举剑、距离），不读尚未执行的输入；
// 所有招式都有前摇与调息。难度同时调整：反应快慢、前摇长短、两轮进攻之间的间隔、连招长度、收势破绽、格挡与反击的准头、
// 追击的积极程度，以及适度的气血与伤害。
import * as THREE from 'three';
import { DUEL } from './combat.js';
import { ATTACK_DEF, PLAYER_COMBAT } from './combatConfig.js';
import { wrapAngle } from '../core/math.js';

// 出招表（时刻都按动作原本的时间轴，秒）：hold 前摇定格、hit 出剑判定、to 收势末；range / arc 身前扇形（米 / 弧度）；
// aoe 以自身为圆心；dmg 基础伤害（再乘难度）；lunge [起, 止, 米] 踏进（没有根运动的动作才用；第十七轮的新动作按动作自带的根运动走）；
// knock 击退米数；down 把人掀翻；def（第十七轮）：出手的防御属性（ATTACK_DEF）——寻常剑招可挡可弹，重劈难挡（金光提示）、震地不可挡不可弹（「危」字）
export const ATTACKS = {
  slashA: { name: '斜劈', clip: 'atk1', from: 0, hold: 0.1, hit: 0.215, to: 0.62, speed: 1.0, range: 2.6, arc: 2.2, dmg: 9, def: 'blade' },
  slashB: { name: '横斩', clip: 'atk2', from: 0, hold: 0.09, hit: 0.19, to: 0.64, speed: 1.0, range: 2.7, arc: 2.6, dmg: 10, def: 'blade' },
  slashC: { name: '重劈', clip: 'atk4', from: 0, hold: 0.3, hit: 0.45, to: 1.12, speed: 1.0, range: 3.0, arc: 1.4, dmg: 15, knock: 1.4, def: 'heavy' },
  lunge: { name: '突刺', clip: 'Sword_Dash', from: 0, hold: 0.05, hit: 0.32, to: 0.95, speed: 1.1, range: 2.2, arc: 1.6, dmg: 12, lunge: [0.08, 0.34, 5.5], dash: true, def: 'blade' },
  thrust: { name: '反刺', clip: 'atk3', from: 0, hold: 0.13, hit: 0.245, to: 0.72, speed: 1.15, range: 3.2, arc: 1.0, dmg: 13, def: 'blade' },
  slam: { name: '震地', clip: 'Sword_Heavy_Combo', from: 2.2, hold: 2.36, hit: 2.56, to: 2.95, speed: 1.0, aoe: 3.2, dmg: 18, down: true, def: 'aoe' },
};

// 对手：外观（换色、佩剑）与打法
export const OPPONENTS = {
  disciple: {
    name: '剑修弟子', who: '内门弟子 · 林岫', hp: 420, sword: 'qingyu', tint: { cloth: 0xb4c8d4, trim: 0xc6ccd0 },
    desc: '基础近剑，出招节奏清楚：一两剑之后必有收势，正好练格挡与反击。',
    tags: ['近身', '节奏清楚', '收势有空档'],
    walk: 2.5, run: 3.4, range: 2.3, guard: 0.25, combos: [['slashA'], ['slashA', 'slashB'], ['slashB', 'slashA'], ['slashA', 'slashB', 'slashC']],
  },
  instructor: {
    name: '护法教习', who: '护法堂 · 罗衡', hp: 520, sword: 'zhanyao', tint: { cloth: 0x8c3e34, trim: 0xb88c48 },
    desc: '主动逼近、连番进攻；你退他就追，隔得远了会疾掠突刺，一轮打完会后撤拉开距离。',
    tags: ['逼近', '连斩', '突刺追击', '后撤'],
    walk: 3.0, run: 4.6, range: 2.4, guard: 0.35, pursue: true, lungeAt: [3.8, 7.5], retreat: 2.2,
    combos: [['slashA', 'slashB', 'slashC'], ['slashB', 'slashA', 'slashC'], ['slashA', 'slashB'], ['slashB', 'slashC']],
  },
  elder: {
    name: '演武长老', who: '执法长老 · 崔玄', hp: 600, sword: 'zijing', tint: { cloth: 0x3c4448, trim: 0x8ac4aa },
    desc: '重防守与距离：绕着你走，举剑挡你的招，挡住了随手反刺；你贴得太近，会蓄力震地。',
    tags: ['格挡', '游走', '反刺', '震地'],
    walk: 2.3, run: 3.4, range: 3.0, guard: 0.62, counter: 0.85, dodge: 0.35, circle: true, poise: true, slamEvery: 9,
    combos: [['thrust'], ['slashB', 'thrust'], ['slashA']],
  },
};

// 难度：react 反应延迟（秒）；windup 前摇定格时长；rest 两轮进攻之间的间隔；comboMax 一轮最多几招；recover 收势后的破绽；
// guardK 格挡 / 反击 / 闪避的准头系数；turn 出招前转身追向玩家的快慢；hp、dmg 气血与伤害；speedK 移动快慢；pursue 追击积极程度；
// armor 被打得失衡（或起身）之后的霸体秒数——这段时间里寻常剑招只让他一顿、打不断他的出招（一味抢攻会被他顶着剑招还手）
export const DIFFS = {
  easy: { name: '简单', desc: '反应慢、出手前摇长、一轮只出一两剑，收势后破绽明显。', react: 0.55, windup: 0.42, rest: [1.7, 2.6], comboMax: 1, recover: 0.8, guardK: 0.45, turn: 4, hp: 0.8, dmg: 0.7, speedK: 0.85, pursue: 0.35, armor: 0.9 },
  normal: { name: '普通', desc: '标准的反应与伤害，攻守完整。', react: 0.34, windup: 0.26, rest: [1.0, 1.7], comboMax: 2, recover: 0.45, guardK: 0.8, turn: 7, hp: 1.0, dmg: 1.0, speedK: 1.0, pursue: 0.7, armor: 1.0 },
  hard: { name: '困难', desc: '反应快、连招长、追得紧，格挡与反击更准——前摇仍看得出来。', react: 0.2, windup: 0.18, rest: [0.6, 1.1], comboMax: 3, recover: 0.24, guardK: 1.12, turn: 11, hp: 1.25, dmg: 1.22, speedK: 1.12, pursue: 1.0, armor: 1.4 },
};

// 第十九轮：拔刀斩只有出刀（iai_slash）算出手；纳刀蓄势（iai）是站着蓄力，对手照常攻过来
const PLAYER_ATTACKS = new Set(['light1', 'light2', 'light3', 'light4', 'iai_slash', 'qi', 'seal', 'dash', 'heavy', 'ult']);
// 动作根运动（沿 +Z 的累计前移）在 t 时刻的值
function rootZ(R, t) {
  if (!R) return 0;
  const T = R.times, n = T.length;
  if (t <= T[0]) return R.z[0];
  if (t >= T[n - 1]) return R.z[n - 1];
  let i = 1; while (i < n - 1 && T[i] < t) i++;
  const u = (t - T[i - 1]) / (T[i] - T[i - 1]);
  return R.z[i - 1] + (R.z[i] - R.z[i - 1]) * u;
}
const _v = new THREE.Vector3();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);

export class Duelist {
  // ctx：{ combat, player, hud, ring: { cx, cz, r, y }, sfx }；char：Cultivator 克隆；o：{ type, diff, mode }
  constructor(ctx, char, o) {
    this.C = ctx.combat; this.P = ctx.player; this.ring = ctx.ring; this.sfx = ctx.sfx;
    this.char = char;
    this.type = o.type; this.diffKey = o.diff; this.mode = o.mode;
    this.def = OPPONENTS[o.type]; this.D = DIFFS[o.diff];
    // 战斗系统要的字段
    this.duel = true; this.isPlayer = false; this.faction = DUEL; this.alive = true; this.world = 'surface';
    this.kind = 'duelist'; this.state = 'duel'; this.aggro = 30;
    this.cfg = { name: this.def.name, scale: 1, poise: !!this.def.poise };
    this.maxHp = this.hp = Math.round(this.def.hp * this.D.hp);
    this.pos = new THREE.Vector3(); this.yaw = 0; this.radius = 0.45;
    this.st = { slow: 0, slowK: 1, freeze: 0, burn: 0, burnDps: 0, hits: 0 };
    this.bar = ctx.hud.bar(this.def.name, true);
    this.tele = null;
    // AI
    this.ai = 'idle'; this.t = 0; this.aiT = 0; this.rest = 1.2;
    this.combo = null; this.step = 0; this.atk = null;
    this.guarding = false; this.guardT = 0; this.counterReady = 0;
    this.vel = new THREE.Vector3(); this.speed = 0; this.back = false;
    this.seen = [];                       // 看到的玩家状态（按时间），反应延迟之后才取用
    this.lungeCool = 0; this.slamCool = 4; this.dodgeCool = 0;
    this.downT = 0; this.stunT = 0; this.armorUntil = 0;
    this.practiceAttack = false; this.practiceT = 2.5;
    this.active = false;                  // 倒计时结束后才出手
  }
  get heading() { return this.yaw; }
  get headY() { return this.pos.y + 1.78; }

  place(x, z, yaw) {
    this.pos.set(x, this.ring.y, z); this.yaw = yaw; this.vel.set(0, 0, 0);
    this.char.update(0, this.pos, this.yaw, this.pose(0));
  }

  // ---------- 战斗系统的接口 ----------
  // 格挡：举剑时正面来的攻击只受一成半（重击两成半），格挡住不失衡；背后、或掀翻、失衡中照常挨打
  absorb(amount, from, info, o = {}) {
    if (!this.guarding || this.ai === 'down' || this.ai === 'stagger') return amount;
    const src = o.at || from?.pos;
    if (!src) return amount;
    const a = Math.abs(wrapAngle(Math.atan2(src.x - this.pos.x, src.z - this.pos.z) - this.yaw));
    if (a > 1.35) return amount;
    info.blocked = true;
    this.char.shield.material.uniforms.uFlash.value = 0.6;
    this.char.anim.play('block', { from: 0, to: 0.28, speed: 1, hold: true, mask: 'upper', fade: 0.03 });
    this.blockAnimT = this.t;
    this.blockedAt = this.t;
    if (this.def.counter) this.counterReady = this.def.counter * this.D.guardK;   // 长老：挡住之后随手反刺
    return amount * (o.big ? 0.25 : 0.15);
  }
  // 失衡（玩家剑诀给出 stun / push / knock；弹反给 1.4 秒）：
  //   倒地、起身时不再受（点到为止，不打倒地的人）；出剑的那一下与霸体期间，寻常剑招只让他一顿；
  //   长老有架势，寻常剑招也只一顿；重击（断水、破岳末式）与弹反才打断他——霸体中只打断、不掀翻
  stagger(time, from, push = 0) {
    if (!this.alive || this.immune()) return;
    const big = time >= 0.7 || push >= 2;
    const armored = this.t < this.armorUntil || (this.ai === 'attack' && this.atk?.phase === 'strike');
    if (!big && (this.def.poise || armored)) { this.flinch(); return; }
    if (!armored && (push >= 2.4 || time >= 1.0)) { this.knockdown(from); return; }
    this.interrupt();
    this.ai = 'stagger'; this.stunT = clamp((armored ? Math.min(time, 0.6) : time) * (this.diffKey === 'hard' ? 0.75 : 1), 0.25, 1.2);
    this.char.anim.play(this.hitClip(from), { from: 0, to: 0.38, speed: 1.0, hold: true, fade: 0.05 });
    if (from && push > 0) { _v.set(this.pos.x - from.x, 0, this.pos.z - from.z); if (_v.lengthSq() > 1e-6) this.shove = _v.normalize().multiplyScalar(Math.min(push, 1.6)); }
  }
  // 按来向挑受击动作（前 / 后 / 左 / 右）
  hitClip(from) {
    if (!from) return 'hit_f';
    const rel = wrapAngle(Math.atan2(from.x - this.pos.x, from.z - this.pos.z) - this.yaw);
    return Math.abs(rel) < 0.8 ? 'hit_f' : Math.abs(rel) > 2.35 ? 'hit_b' : rel > 0 ? 'hit_l' : 'hit_r';
  }
  // 第十七轮：被玩家弹反——不论是否霸体，这一轮进攻作废；寻常剑招失衡，重劈被弹开后踉跄更久（给玩家反击的空当）
  onParried(spec, at) {
    if (!this.alive || this.immune()) return;
    const heavy = spec?.block === 'hard';
    this.interrupt();
    this.armorUntil = 0;
    // 第十八轮：至少僵直 parryStun.duel 秒（困难难度也不短于它）
    this.ai = 'stagger'; this.stunT = Math.max(PLAYER_COMBAT.guard.parryStun.duel, (heavy ? 1.5 : 1.15) * (this.diffKey === 'hard' ? 0.85 : 1));
    this.char.anim.play('guard_break', { from: 0, to: 0.62, speed: 1.1, hold: true, fade: 0.04 });
    this.char.flash?.(0xffd890, 0.2);
    this.C.popNumber(this, '僵直', 'parry');
    void at;
  }
  // 第十七轮：缚灵锁——定住片刻（打断这一轮进攻）
  bind(time) {
    if (!this.alive || this.immune()) return;
    this.interrupt();
    this.ai = 'stagger'; this.stunT = time;
    this.char.anim.play('stagger', { from: 0, to: 1.2, speed: 1.2 / Math.max(0.3, time), hold: true, fade: 0.06 });
  }
  // 倒地、起身、已败：不受伤害、不受失衡（combat.damage 先问这里）
  immune() { return this.ai === 'down' || this.ai === 'getup' || this.ai === 'defeated'; }
  // 一顿：上身晃一下；出招（前摇定格、出剑）与举剑时不放，免得盖掉出招、格挡的姿势
  flinch() { if (this.ai !== 'attack' && !this.guarding) this.char.anim.play('hit_f', { from: 0, to: 0.3, speed: 1.2, hold: false, fade: 0.05, mask: 'upper', weight: 0.6 }); }
  knockdown(from) {
    this.interrupt();
    this.ai = 'down'; this.downT = 1.3;
    this.char.anim.play('Hit_Knockback', { from: 0, to: 0.83, speed: 1.0, hold: true, fade: 0.05 });
    if (from) { _v.set(this.pos.x - from.x, 0, this.pos.z - from.z); if (_v.lengthSq() > 1e-6) this.shove = _v.normalize().multiplyScalar(1.4); }
  }
  interrupt() {
    this.combo = null; this.atk = null; this.setGuard(false);
    if (this.tele) { this.C.removeTelegraph(this.tele); this.tele = null; }
    this.clearTell();
  }
  clearTell() { if (this.tell) { this.sfx?.tellEnd?.(this.tell); this.tell = null; } }
  setGuard(v) {
    if (this.guarding === v) return;
    this.guarding = v;
    if (v) this.char.anim.play('guard', { from: 0, to: 1.7, loop: [0.08, 1.7], speed: 1.3, hold: true, mask: 'upper', fade: 0.08 });
    else if (this.char.anim.name === 'guard' || this.char.anim.name === 'block') this.char.anim.stop(0.18);
  }
  defeat() {
    this.interrupt();
    this.alive = false; this.ai = 'defeated';
    this.char.anim.play('Hit_Knockback', { from: 0, to: 0.83, speed: 0.9, hold: true, fade: 0.08 });
  }
  revive() {
    this.alive = true; this.hp = this.maxHp; this.ai = 'getup'; this.aiT = 0;
    this.char.anim.play('LayToIdle', { from: 0, speed: 1.4, hold: false, fade: 0.1 });
    this.bar.set(1);
  }

  // ---------- 看玩家：每帧记下看得见的状态，反应延迟之后才取用 ----------
  observe() {
    const P = this.P, M = this.C.moves, a = M?.act;
    const D = a?.def;
    const atk = !!(a && PLAYER_ATTACKS.has(a.key) && !a.react);
    const id = atk ? a.key + ':' + a.id : null;
    const firstHit = atk ? (D.active?.[0] ?? D.release ?? (D.from ?? 0) + 0.2) : 0;
    this.seen.push({
      t: this.t, id, x: P.pos.x, z: P.pos.z, attacking: atk, windup: atk && a.t < firstHit + 0.05, recovering: !!(atk && D.active && a.t > D.active[1]),
      guarding: !!P.guard, down: a?.key === 'knockdown', heavy: atk && ['heavy', 'light4', 'iai_slash', 'ult'].includes(a.key),
    });
    while (this.seen.length > 2 && this.seen[1].t <= this.t - this.D.react) this.seen.shift();
  }
  perceived() { return this.seen[0]; }

  // ---------- 每帧 ----------
  update(dt) {
    this.t += dt;
    this.observe();
    // 挡住一下的顶架放完：还举着剑就回到格挡架势
    if (this.guarding && this.char.anim.name === 'block' && this.char.anim.cur?.done) this.char.anim.play('guard', { from: 0.08, to: 1.7, loop: [0.08, 1.7], hold: true, mask: 'upper', fade: 0.1 });
    const P = this.P, S = this.perceived();
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    const faceP = Math.atan2(dx, dz);
    let want = null, spd = 0, face = faceP, turn = this.D.turn, back = false;
    this.lungeCool -= dt; this.slamCool -= dt; this.dodgeCool -= dt; this.counterReady = Math.max(0, this.counterReady - dt * 0.8);
    switch (this.ai) {
      case 'idle': turn = 6; break;                                    // 就位、倒计时
      case 'defeated': spd = 0; turn = 0; break;
      case 'finale': spd = 0; turn = 0; break;                         // 第二十九轮：墨里终焉的演出里（姿势由演出摆；演武场这时本也不更新他）
      case 'getup': this.aiT += dt; turn = 2; if (this.aiT > 1.1) { this.ai = 'neutral'; this.armorUntil = this.t + this.D.armor; this.rest = Math.max(this.rest, this.D.recover * 0.5); } break;
      case 'down':
        this.downT -= dt; turn = 0;
        if (this.downT <= 0) { this.ai = 'getup'; this.aiT = 0; this.char.anim.play('LayToIdle', { from: 0, speed: 1.5, hold: false, fade: 0.1 }); }
        break;
      case 'stagger':
        this.stunT -= dt; turn = 0;
        if (this.stunT <= 0) { this.ai = 'neutral'; this.rest = Math.max(0.15, this.D.recover * 0.5); this.armorUntil = this.t + this.D.armor; this.char.anim.stop(0.15); }
        break;
      case 'guard': {
        this.guardT -= dt;
        // 举剑挡着：玩家这一轮出完（或等得太久）就放下；长老挡住之后随手反刺
        if (this.counterReady > 0.4 && d < this.def.range + 0.6 && this.t - (this.blockedAt ?? -9) < 0.6) { this.setGuard(false); this.startCombo(['thrust'], { quick: true }); this.counterReady = 0; break; }
        if (this.guardT <= 0 || (!S.attacking && this.t - (this.blockedAt ?? -9) > 0.35)) { this.setGuard(false); this.ai = 'neutral'; this.rest = Math.min(this.rest, 0.35); }
        break;
      }
      case 'attack': { const r = this.updateAttack(dt, d, faceP); spd = r.spd; face = r.face; turn = r.turn; break; }
      case 'recover': {                                                // 收势破绽：站定（这段就是给玩家反击的空档），然后（护法）后撤
        this.aiT -= dt; turn = this.D.turn * 0.4;
        if (this.aiT <= 0) {
          if (this.afterRecover === 'retreat') { this.ai = 'retreat'; this.aiT = 1.4; }
          else this.ai = 'neutral';
          this.afterRecover = null;
        }
        break;
      }
      case 'retreat': {                                                // 护法：一轮打完倒退着拉开到 range + retreat 米（之后多半疾掠突刺回来）
        this.aiT -= dt; back = true; spd = this.def.walk * 1.1 * this.D.speedK; want = -1;
        if (this.aiT <= 0 || d > this.def.range + (this.def.retreat || 1.5) || this.edgeDist() < 1.2) { this.ai = 'neutral'; }
        break;
      }
      case 'dodge': {
        this.aiT -= dt; back = true; spd = 4.2; want = -1; turn = 12;
        if (this.aiT <= 0) { this.ai = 'neutral'; this.rest = Math.min(this.rest, 0.5); }
        break;
      }
      default: {                                                         // neutral：走位、伺机出手、举剑、闪避
        this.ai = 'neutral';
        this.rest -= dt;
        const r = this.decide(dt, d, S);
        spd = r.spd; want = r.want; back = r.back; face = r.face ?? faceP;
      }
    }
    // 移动：want 为 1 朝玩家、-1 背离、'circle' 绕行；碰到圈边沿圈走，不与玩家重叠
    let mx = 0, mz = 0;
    if (spd > 0 && d > 1e-3) {
      const ux = dx / d, uz = dz / d;
      if (want === 1) { mx = ux; mz = uz; }
      else if (want === -1) { mx = -ux; mz = -uz; }
      else if (want === 'circle') { const s = this.circleDir || 1; mx = -uz * s + ux * 0.15 * Math.sign(d - this.def.range - 0.6); mz = ux * s + uz * 0.15 * Math.sign(d - this.def.range - 0.6); const l = Math.hypot(mx, mz); mx /= l; mz /= l; }
    }
    if (this.atkMove) { mx = this.atkMove.x; mz = this.atkMove.z; spd = this.atkMove.v; this.atkMove = null; }
    this.vel.x += (mx * spd - this.vel.x) * Math.min(1, dt * 10);
    this.vel.z += (mz * spd - this.vel.z) * Math.min(1, dt * 10);
    if (this.shove) { this.vel.x += this.shove.x * 6; this.vel.z += this.shove.z * 6; this.shove = null; }
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    // 不与玩家重叠
    const nd = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z), minD = 1.05;
    if (nd < minD && nd > 1e-4) { const k = (minD - nd) / nd; this.pos.x -= (P.pos.x - this.pos.x) * k; this.pos.z -= (P.pos.z - this.pos.z) * k; }
    this.clampRing();
    this.pos.y = this.ring.y;
    // 转身：出招前追着玩家转（难度越高越快），出剑那一下锁定方向
    if (turn > 0) this.yaw += wrapAngle(face - this.yaw) * Math.min(1, dt * turn);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.back = back;
    this.char.update(dt, this.pos, this.yaw, this.pose(dt));
  }
  pose() {
    return { mode: 'walk', onGround: true, speed: this.ai === 'down' || this.ai === 'defeated' ? 0 : this.speed, vel: this.vel, boost: 0, meditate: false,
      sprint: false, turn: 0, guard: this.guarding, drawn: true, gather: false, back: this.back, camPos: this.P.pos };
  }
  clampRing() {
    const R = this.ring, rx = this.pos.x - R.cx, rz = this.pos.z - R.cz, rr = Math.hypot(rx, rz), max = R.r - 0.55;
    if (rr > max) { this.pos.x = R.cx + rx / rr * max; this.pos.z = R.cz + rz / rr * max; }
  }
  edgeDist() { return this.ring.r - 0.55 - Math.hypot(this.pos.x - this.ring.cx, this.pos.z - this.ring.cz); }

  // 走位与出手的决定
  decide(dt, d, S) {
    const def = this.def, D = this.D, out = { spd: 0, want: null, back: false };
    // 自由练习：不主动出手；开了「陪练出招」才隔一阵出一剑（前摇更长），够不着时慢慢走近
    if (this.mode === 'free') {
      if (!this.practiceAttack) return out;
      this.practiceT -= dt;
      if (d > 2.4) { out.spd = def.walk * 0.7; out.want = 1; return out; }
      if (this.practiceT <= 0) { this.practiceT = { easy: 3.6, normal: 2.9, hard: 2.3 }[this.diffKey]; this.startCombo([Math.random() < 0.5 ? 'slashA' : 'slashB'], { slow: true }); }
      return out;
    }
    const pd = Math.hypot(S.x - this.pos.x, S.z - this.pos.z);       // 看到的玩家距离（延迟后）
    // 举剑 / 闪开：看到（反应延迟之后）玩家在身前不远处起手——每一招只判一次
    if (S.attacking && S.windup && pd < 3.8 && S.id !== this.reactId) {
      this.reactId = S.id;
      const pGuard = Math.min(0.95, def.guard * D.guardK);
      if (def.dodge && pd < 2.2 && this.dodgeCool <= 0 && Math.random() < def.dodge * D.guardK) { this.ai = 'dodge'; this.aiT = 0.32; this.dodgeCool = 2.2; return out; }
      if (Math.random() < pGuard) { this.setGuard(true); this.ai = 'guard'; this.guardT = 1.1; return out; }
    }
    // 护法：你退他追；远了疾掠突刺
    if (def.lungeAt && this.lungeCool <= 0 && d > def.lungeAt[0] && d < def.lungeAt[1] && this.rest <= 0) { this.lungeCool = { easy: 7, normal: 5, hard: 3.5 }[this.diffKey]; this.startCombo(['lunge', ...(this.diffKey === 'hard' ? ['slashB'] : [])]); return out; }
    // 长老：贴得太近又举着剑，蓄力震地
    if (def.slamEvery && this.slamCool <= 0 && d < 2.6 && (S.guarding || Math.random() < 0.3) && this.rest <= 0) { this.slamCool = def.slamEvery / Math.max(0.7, D.guardK); this.startCombo(['slam']); return out; }
    // 够得着、调息够了：出一轮
    if (d < def.range + 0.35 && this.rest <= 0 && !S.down) {
      const pool = def.combos;
      let c = pool[Math.floor(Math.random() * pool.length)];
      const max = D.comboMax + (def.pursue ? 1 : 0);
      c = c.slice(0, Math.max(1, Math.min(c.length, max)));
      this.startCombo(c);
      return out;
    }
    // 走位
    if (d > def.range + 0.3) {
      const run = d > 5 && (def.pursue ? Math.random() < 0.9 * D.pursue + 0.1 : D.pursue > 0.6);
      out.spd = (run ? def.run : def.walk) * D.speedK; out.want = 1;
      if (def.circle && d < def.range + 2.2) { out.want = 'circle'; out.spd = def.walk * 0.75 * D.speedK; if (Math.random() < dt * 0.4) this.circleDir = -(this.circleDir || 1); }
    } else if (d < def.range - 0.9) { out.spd = def.walk * 0.7 * D.speedK; out.want = -1; out.back = true; }
    else if (def.circle) { out.spd = def.walk * 0.6 * D.speedK; out.want = 'circle'; }
    return out;
  }

  // 一轮进攻：依次放 combo 里的招式
  startCombo(list, o = {}) {
    this.ai = 'attack'; this.combo = list.slice(); this.step = 0; this.comboOpt = o;
    this.beginAttack(this.combo[0]);
  }
  beginAttack(key) {
    const A = ATTACKS[key], D = this.D;
    const quick = this.comboOpt?.quick, slow = this.comboOpt?.slow;
    // 前摇：先放到 hold 那一刻停住，定格 wind 秒（连招里的后几招只停一半），反刺随手一点但仍看得出来
    let wind = (this.step > 0 ? D.windup * 0.45 : D.windup) * (A.dash ? 1.25 : 1) * (A.down ? 2.4 : 1) * (A.def === 'heavy' ? 1.3 : 1);
    if (quick) wind = Math.max(0.14, D.windup * 0.5);
    if (slow) wind += 0.35;
    this.atkSeq = (this.atkSeq || 0) + 1;
    const root = this.char.clips[A.clip]?.data?.root || null;
    this.atk = { key, A, phase: 'wind', t: A.from, wind, done: false, lunged: 0, root, rootPrev: rootZ(root, A.from), id: `duel:${this.atkSeq}` };
    this.char.anim.play(A.clip, { from: A.from, to: A.hold, speed: A.speed, hold: true, fade: this.step > 0 ? 0.06 : 0.1 });
    // 地面预警：扇形 / 圆形；不可挡的头顶亮「危」字，难挡的出剑前剑上一道金光
    if (this.tele) this.C.removeTelegraph(this.tele);
    const danger = ATTACK_DEF[A.def]?.tell;
    this.tele = A.aoe ? this.C.telegraph(this.pos, A.aoe, Math.PI * 2, danger === 'danger' ? 0xd0101a : 0xff5a2a) : this.C.telegraph(this.pos, A.range + 0.3, A.arc, 0xff3a24);
    if (this.tele) { this.tele.userData.follow = A.aoe ? null : this; this.tele.userData.dur = Math.max(0.05, (A.hold - A.from) / A.speed + wind); this.tele.userData.t = 0; }
    this.clearTell();
    if (danger === 'danger' || danger === 'heavy') this.tell = this.sfx?.tellBegin?.(this, danger, (A.hold - A.from) / A.speed + wind);
  }
  updateAttack(dt, d, faceP) {
    const k = this.atk;
    if (!k) { this.ai = 'neutral'; return { spd: 0, face: faceP, turn: this.D.turn }; }
    const A = k.A;
    let turn = this.D.turn;
    if (k.phase === 'wind') {
      const t0 = k.t;
      k.t = Math.min(A.hold, k.t + dt * A.speed);
      this.rootStep(k, t0, k.t, d, dt);
      if (k.t >= A.hold) { k.wind -= dt; if (k.wind <= 0) { k.phase = 'strike'; this.char.anim.play(A.clip, { from: A.hold, to: A.to, speed: A.speed, hold: true, fade: 0.04 }); } }
    } else {
      turn = 0;                                                      // 出剑：方向锁定（可以侧闪躲开）
      const t0 = k.t; k.t += dt * A.speed;
      if (this.tele && k.t >= A.hit) { this.C.removeTelegraph(this.tele); this.tele = null; this.clearTell(); }
      // 踏进 / 突刺：没有根运动的动作按 lunge 给速度；有根运动的按动作自己走（不穿过玩家）
      if (A.lunge && k.t > A.lunge[0] && t0 < A.lunge[1]) {
        const span = (A.lunge[1] - A.lunge[0]) / A.speed, v = A.lunge[2] / span;
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        if (d > 1.2) this.atkMove = { x: fx, z: fz, v };
      } else this.rootStep(k, t0, k.t, d, dt);
      // 出剑判定（一次挥剑只结算一次）
      if (!k.done && t0 < A.hit && k.t >= A.hit) { k.done = true; this.strike(A, k); }
      if (k.t >= A.to) {
        this.step++;
        if (this.combo && this.step < this.combo.length) this.beginAttack(this.combo[this.step]);
        else this.endCombo();
      }
    }
    return { spd: 0, face: faceP, turn };
  }
  // 根运动（第十七轮的新动作）：这一帧动作走过的距离换成速度；离玩家 1.2 米以内不再往前
  rootStep(k, t0, t1, d, dt) {
    if (!k.root || dt <= 0) return;
    const z = rootZ(k.root, t1), dz = z - k.rootPrev;
    k.rootPrev = z;
    if (dz <= 0 || d < 1.2) return;
    this.atkMove = { x: Math.sin(this.yaw), z: Math.cos(this.yaw), v: Math.min(dz, d - 1.2) / dt };
  }
  strike(A, k) {
    const P = this.P, U = this.C.playerUnit;
    if (!U.alive) return;
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    let hit;
    if (A.aoe) hit = d < A.aoe + 0.35;
    else hit = d < A.range + 0.35 && Math.abs(wrapAngle(Math.atan2(dx, dz) - this.yaw)) < A.arc / 2;
    this.sfx?.enemyStrike?.(this);
    this.C.sound?.play(A.aoe ? 'slam' : 'swing', { at: this.pos, gain: A.aoe ? 0.7 : 0.6, heavy: A.def === 'heavy' });
    if (A.aoe) { this.C.fx(this.pos, 0xff6a3a, 50, 0.9, 6, 0.7); this.C.shake(0.25); }
    if (!hit) return;
    const dmg = A.dmg * this.D.dmg;
    // 接触点：对手身前、胸口高处（玩家格挡的正面判定、火星都按它）
    const l = Math.max(d, 1e-3), at = A.aoe ? this.pos.clone() : new THREE.Vector3(this.pos.x + (dx / l) * Math.min(d, 0.9), this.pos.y + 1.15, this.pos.z + (dz / l) * Math.min(d, 0.9));
    // 第二十六轮：迟到的弹反挂起时（'pending'）等结果出来再击退（after）
    const knock = (r) => { if (A.knock && U.alive && r === 'hit') { _v.set(dx, 0, dz).normalize().multiplyScalar(A.knock); P.vel.x += _v.x * 6; P.vel.z += _v.z * 6; } };
    const r = this.C.damage(U, dmg, { from: this, kind: 'phys', at, knockdown: !!A.down, spec: { def: A.def, id: k?.id ?? `duel:${this.atkSeq}`, seg: 0, active: true }, after: knock });
    if (r !== 'pending') knock(r);
  }
  endCombo() {
    this.atk = null; this.combo = null;
    this.char.anim.stop(0.2);
    const D = this.D;
    this.rest = rnd(D.rest[0], D.rest[1]);
    this.ai = 'recover'; this.aiT = D.recover;               // 收势破绽
    this.afterRecover = this.def.retreat && Math.random() < 0.75 ? 'retreat' : null;
  }
  dispose() {
    if (this.tele) { this.C.removeTelegraph(this.tele); this.tele = null; }
    this.clearTell();
    this.bar.remove();
    this.char.dispose();
  }
}
