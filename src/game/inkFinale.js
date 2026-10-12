// 第二十五轮起：拔刀斩的升级形态（不是另一个剑诀、不占槽：拔刀斩装备着就启用，随它的槽键、Z 与鼠标中键）；第二十七轮起显示名称统一为「墨里终焉」。
// 玩法：普攻连续有效命中 30 刀得一层墨势（最多一层）；有墨势时满蓄力为 3 秒，墨势满蓄力出刀即消耗墨势、刀身那一下伤害 ×2；
//   刀身真实命中的唯一主目标若「当前阶段」剩余生命 ≤ 10%、允许处决，确认处决、接管演出，在收刀合拢的那一刻提交终结（只此一处）。
// 第二十七轮：处决演出整套重做——普通敌人、精英、Boss 的非最终与最终阶段一律同一套 16 秒的完整演出（没有精简分支），只在结算上区分；
//   空间不够时依次收紧站位（full → near → tight），都不行就在原地的安全空间里演（local：就地化墨凝聚、就近拔刀），流程一步不少。
// 分工：
//   计数与墨势、正式出刀、主目标、处决资格与阶段比例、唯一记录、结算、作废与清理 —— InkFinale（这里）；
//   演出的时间线、站位与空间检查、镜头、人物与目标的动作、音乐 —— Show（这里）；画面（画卷、龙凤、八卦、墨带、刀光、爆墨……）—— inkFinaleFx.js；
//   山水与画中世界（原场景的替换与复原）—— inkStage.js；出刀判定与伤害仍是 moves.strike / combat.damage（只多一个技能倍率、一个「命中被接受之后、结算之前」的处决探针）。
// 时钟：墨势的 8 秒按「战斗时钟」（暂停、打开界面、Boss 过场、处决演出中都不走）；演出用自己的时钟（主循环的 dt，不受顿帧影响；暂停、失焦、后台时为 0，恢复后不补算）。
// 演出期间（单人）：其他战斗实体、投射物、预警、冷却、持续伤害、治疗、召唤物计时一律停住（main.js 按 holdWorld 给 0），恢复后不补算；玩家与目标受演出保护。
// 多人时（目前没有）：不能全局暂停——只给参与处决的两方加局部保护（finaleGuard / finaleLock），演出只在本机播放，见 docs/R27_REPORT.md。
import * as THREE from 'three';
import { FINALE as F } from './inkFinaleConfig.js';
import { hostile, SECT } from './combat.js';
import { wrapAngle } from '../core/math.js';
import { BOSS30, SIZE30 } from './boss30Config.js';

const DEG = Math.PI / 180;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (u) => u * u * (3 - 2 * u);
const tid = (e) => String(e?.id ?? e?.kind ?? '?');
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _ca = new THREE.Vector3(), _cb = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _mm = new THREE.Matrix4();
const _ja = new THREE.Vector3(), _jb = new THREE.Vector3();
// 第二十八轮：震屏的抖动按演出时刻取平滑噪声（每秒约 30 次变向，ch 为不同的分量）——同一时刻同一个偏移：
// 暂停时（dt 为 0、画面照常重画）镜头不抖，帧率不同抖法也一样
const hashN = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
const shakeN = (t, ch) => { const x = t * 30, i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hashN(i + ch * 1013) * (1 - u) + hashN(i + 1 + ch * 1013) * u; };
const UP = new THREE.Vector3(0, 1, 0);
// 动作里逐帧记下的一条量在 t 时刻的值（与 moves.js 相同）
function trackAt(T, t) {
  if (!T) return 0;
  const X = T.times, v = T.v, n = X.length;
  if (t <= X[0]) return v[0];
  if (t >= X[n - 1]) return v[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (X[m] <= t) lo = m; else hi = m; }
  return v[lo] + (v[hi] - v[lo]) * (t - X[lo]) / (X[hi] - X[lo]);
}
// 根运动 z 在 t 时刻的值
function rootZ(R, t) {
  if (!R) return 0;
  const T = R.times, n = T.length;
  if (t <= T[0]) return R.z[0];
  if (t >= T[n - 1]) return R.z[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
  return R.z[lo] + (R.z[hi] - R.z[lo]) * (t - T[lo]) / (T[hi] - T[lo]);
}

// ---------- 阶段 ----------
export function stageOf(e) { return e?.stageInfo ? e.stageInfo() : { id: tid(e), index: 0, final: true, structure: 'single' }; }
// 当前阶段的剩余生命比例：独立阶段生命条 = 阶段生命 / 阶段最大生命；共享生命条按阈值转阶段 = (生命 − 阶段结束阈值) / (阶段开始阈值 − 阶段结束阈值)，限制在 0–1
export function stageRatio(e) {
  if (!e) return 1;
  const st = stageOf(e);
  if (st.structure === 'threshold' && e.cfg?.stages) {
    const S = e.cfg.stages, i = e.stageIdx ?? 0, top = i === 0 ? 1 : S[i - 1], end = S[i] ?? 0;
    return clamp01((e.hp / e.maxHp - end) / Math.max(1e-6, top - end));
  }
  return clamp01(e.hp / Math.max(1e-6, e.stageMax ?? e.maxHp ?? 1));
}

// ---------- 目标的接口：停手、演出中的姿势、终结（走它自己现有的流程）、交还、体型、显示的根物体 ----------
const ENEMY = {
  kind: 'enemy',
  info(fin, e) { return { allow: e.cfg?.execute !== false, canEnd: e.state !== 'dormant' && !e.immune?.() }; },
  // 停止当前攻击、碰撞伤害与待执行招式（预警、危字、击退都撤掉），站住
  hold(fin, e) {
    if (e.tele) { fin.C.removeTelegraph(e.tele); e.tele = null; }
    e.clearTell?.(); e.kb = null; e.npc?.motion?.stop(0.08);
    e.state = 'hit'; e.wt = 0; e.stunT = 1e9;
  },
  // 演出中：k 0 失衡 … 1 定住（已被斩中、尚未显现）；提交之后（已倒下）走正常的倒下动作
  pose(fin, e, dt, k) {
    if (!e.alive) { if (dt > 0) e.update?.(dt); return; }
    const npc = e.npc;
    if (!npc || dt <= 0 || k >= 1) return;
    npc.anim = 'hit'; npc.update(dt * (1 - k * 0.85), fin.P.pos, false); npc.root.rotation.y = e.yaw;
  },
  finish(fin, e) {
    const from = fin.C.playerUnit;
    if (e.endStage) return !!e.endStage({ from, reason: 'finale', finale: true });
    fin.C.damage(e, e.hp + 1, { from, kind: 'heavy', big: true, execute: true, finale: true });
    return !e.alive;
  },
  release(fin, e) { if (e.alive && e.stunT > 100) { e.state = 'chase'; e.stunT = 0.28; e.wt = 0; } },
  size(e) { const s = e.cfg?.scale ?? 1; const r = Math.max(0.3, e.radius ?? 0.45); return { r, h: (e.headY ?? e.pos.y + 1.9 * s) - e.pos.y, waist: 0.98 * s, large: r > F.exec.large }; },
  root(e) { return e.npc?.root || null; },
};
// 第二十九轮：演武场的切磋对手（game/duel.js 的 Duelist）——
//   停手：AI 停在 finale 态（不出招、不走位，演出中演武场也不更新它）；演出中的姿势同魔修（失衡、慢慢定住）；
//   终结：走战斗系统的正常结算把他击倒 → 演武场判胜（胜负的字卡、结算面板等演出交还之后再出）；交还：没提交的回到交手
const DUELIST = {
  kind: 'duelist',
  info(fin, e) { return { allow: true, canEnd: !e.immune?.() }; },
  hold(fin, e) {
    e.interrupt?.(); e.ai = 'finale'; e.stunT = 0; e.vel?.set(0, 0, 0); e.shove = null; e.atkMove = null;
    e.char?.anim?.play('stagger', { from: 0, to: 1.2, speed: 0.8, hold: true, fade: 0.06 });
  },
  pose(fin, e, dt, k) {
    if (!e.char || dt <= 0) return;
    if (!e.alive) { e.char.update(dt, e.pos, e.yaw, e.pose()); return; }      // 已击倒：倒地的动作照常放
    if (k >= 1) return;
    e.char.update(dt * (1 - k * 0.85), e.pos, e.yaw, e.pose());
  },
  finish(fin, e) {
    fin.C.damage(e, e.hp + 1, { from: fin.C.playerUnit, kind: 'heavy', big: true, execute: true, finale: true });
    return !e.alive;
  },
  release(fin, e) {
    if (e.alive && e.ai === 'finale') { e.ai = 'neutral'; e.rest = Math.max(e.rest || 0, 0.6); }
    fin.g.arena?.finaleDone?.(e);
  },
  size(e) { const r = Math.max(0.3, e.radius ?? 0.45); return { r, h: (e.headY ?? e.pos.y + 1.78) - e.pos.y, waist: 0.98, large: r > F.exec.large }; },
  root(e) { return e.char?.root || null; },
};
// Boss（第三十层、第五十层）：用它自己的阶段结束流程；阶段过场（转阶段 / 胜利）延到演出交还之后再放
const bossAdapter = (B) => ({
  kind: 'boss',
  info(fin, e) { return B.finaleInfo ? B.finaleInfo() : { allow: true, canEnd: B.state === 'fight' }; },
  hold(fin, e, rec) { B.finaleHold = rec; B.finaleDefer = []; B.finaleStart?.(fin.P.pos); },
  pose(fin, e, dt, k) { B.finalePose?.(dt * (k >= 1 ? 0 : 1 - k * 0.85), k); },
  finish(fin, e) { return !!B.executeStage({ reason: 'finale', finale: true, from: fin.C.playerUnit }); },
  // 交还：延后的阶段过场（转阶段 / 胜利）这时才放；作废（没提交）的回到战斗
  release(fin, e) {
    B.finaleHold = null;
    const d = B.finaleDefer; B.finaleDefer = null;
    if (d?.length) for (const f of d) { try { f(); } catch (err) { console.error(err); } }
    else B.finaleRestore?.();
  },
  // 体型：第三十层剑尊第二十六轮起放大到人的 2.2 倍（身高约 4 米）；第五十层龙君是大型目标
  size(e) {
    if (e.kind === 'boss30') return { r: 0.6 * SIZE30, h: BOSS30.height * BOSS30.scale, waist: 1.08 * SIZE30, large: true };
    // frame：入场构图按的高度——第五十层龙君连同张开的双翼约 4.46 米（入场姿势的包围盒实测），身子仍按 3.4 米（站位、墨带、八卦、刀光的高度）
    if (e.kind === 'boss50') return { r: 2.2, h: 3.4, frame: 4.5, waist: 1.6, large: true };
    return { r: Math.max(0.5, e.radius ?? 0.6), h: 2.3, waist: 1.1, large: false };
  },
  root() { return B.rig?.root || null; },
});

// 画卷机位遇上大型目标：机位相对玩家起点 B 的水平偏移按 s 放大、高度按 √s 升高，直到 B 脚下与敌人头顶（frame 高 × 1.08）的仰角差
// 不超过竖直视角的 80%（留出这一段机位前移、升高的余量），再对准两者的正中；s 到 3 还不够就用 3
function fitTall(B, E, hf, pos0, at0, tanV) {
  const half = Math.atan(tanV), top = new THREE.Vector3(E.x, E.y + hf * 1.08, E.z), feet = new THREE.Vector3(B.x, B.y - 0.1, B.z);
  const mid = new THREE.Vector3().addVectors(B, E).multiplyScalar(0.5), off = pos0.clone().sub(B);
  for (let s = 1; s <= 3.001; s += 0.1) {
    const p = new THREE.Vector3(B.x + off.x * s, B.y + off.y * Math.sqrt(s), B.z + off.z * s);
    const el = (q) => Math.atan2(q.y - p.y, Math.hypot(q.x - p.x, q.z - p.z));
    const aT = el(top), aF = el(feet);
    if (aT - aF <= 2 * half * 0.8 || s > 2.95) {
      const dH = Math.hypot(mid.x - p.x, mid.z - p.z);
      return { pos: p, at: new THREE.Vector3(mid.x, p.y + dH * Math.tan((aT + aF) / 2), mid.z), s };
    }
  }
  return { pos: pos0, at: at0, s: 1 };
}

export class InkFinale {
  // game：Game（boss30 / boss50 / freeCam / lock）；combat、moves、player、cam（第三人称镜头）、camera；state：存档；loadout：装备槽；sound；fx：InkFinaleFx；
  // stage：InkStage（山水与画中世界）；post：后期（调色、退场叠化）；paused()：游戏是否暂停（菜单、失焦、后台）
  constructor({ game, combat, moves, player, cam, camera, state, loadout, sound = null, fx = null, stage = null, post = null, paused = null }) {
    this.g = game; this.C = combat; this.M = moves; this.P = player; this.cam = cam; this.camera = camera; this.S = state; this.L = loadout;
    this.sound = sound; this.fx = fx; this.stage = stage; this.postFx = post; this.paused = paused;      // （不叫 post：post() 是每帧的方法）
    // 墨势（只在内存里：不跨场景、刷新、读档）
    this.count = 0; this.ready = false; this.clock = 0; this.lastHit = -99; this.seen = new Map();
    this.instance = 1;                     // 战斗实例号：重试、离开战斗实例、换场景、力竭时换新（旧的处决记录作废，不向新实例提交）
    this.serial = 0;
    this.rec = null;                       // 当前（唯一）的处决记录
    this.pending = null;                   // 已确认、下一帧开演
    this.show = null;                      // 正在进行的演出
    this.blend = null;                     // 演出结束后镜头平滑回到第三人称
    this.records = [];                     // 近来的处决记录（自检）
    this.events = [];                      // 事件（自检、调试；最近 160 条）
    this.stats = { valid: 0, dup: 0, rejected: 0, overflow: 0, gained: 0, consumed: 0, enhanced: 0, normal: 0, timeouts: 0, clears: 0, probes: 0, execs: 0, commits: 0, fallbacks: 0, invalid: 0, skips: 0, ignoredAlias: 0, shows: {}, kills: 0, killSkip: 0 };
    this.world = { name: 'surface', bounds: () => true };
    this.migrated = this.migrate();
    this.hud = typeof document !== 'undefined' ? new InkHud(this) : null;
    // 失焦、切到后台：演出音乐立刻停住（这时主循环不再推帧，演出时钟本来就停着）；回来后由演出时刻接着放
    if (typeof addEventListener === 'function') {
      addEventListener('blur', () => this.show?.syncMusic(true));
      document.addEventListener?.('visibilitychange', () => { if (document.hidden) this.show?.syncMusic(true); });
    }
  }

  // =====================================================================================
  // 解锁（独立的解锁标记，存档 skillUp.power；不动等级、装备与其他存档）
  // =====================================================================================
  migrate() {
    const d = this.S.d;
    if (!d.skillUp || typeof d.skillUp !== 'object') d.skillUp = {};
    const s = d.skillUp.power;
    if (F.unlock.always && !(s && s.unlocked && s.form === F.unlock.form)) {
      d.skillUp.power = { form: F.unlock.form, unlocked: true, at: Date.now(), why: '当前无视等级直接解锁' };
      this.S.save();
      return true;
    }
    return false;
  }
  get unlocked() { const s = this.S.d.skillUp?.power; return !!(s && s.unlocked && s.form === F.unlock.form); }
  // 拔刀斩装备着时启用升级形态（卸下之后一切入口都放不出拔刀斩，见 moves.press）
  get enabled() { return this.unlocked && !!this.L?.equipped('power'); }
  get inkReady() { return this.enabled && this.ready; }
  get active() { return !!(this.show || this.pending); }
  get holdWorld() { return this.active; }
  get ownsPlayer() { return this.active; }
  // 有墨势时满蓄力的秒数（没有墨势时 null：沿用普通拔刀斩）
  chargeFull() { return this.inkReady ? F.charge.full : null; }
  setWorld(name, w = {}) { this.world = { name, bounds: w.bounds || (() => true) }; }
  logE(kind, o = {}) { this.evN = (this.evN || 0) + 1; this.events.push({ n: this.evN, kind, t: +this.clock.toFixed(3), ...o }); if (this.events.length > 160) this.events.shift(); }

  // =====================================================================================
  // 墨势：普攻一刀结算完（moves.strike）——hits：这一段对各目标的 { r 结算结果, ok 结算前存活、敌对、允许受击 }
  // 去重按「攻击实例号 + 攻击段号」：一刀命中多个目标只计一次；不同的刀分别计；空挥、友方、木人桩、已倒下、被免疫 / 格挡 / 弹反拒绝的不计
  // =====================================================================================
  onLightStrike(a, idx, hits) {
    if (!this.enabled || !F.stack.moves.includes(a.key) || this.active) return false;
    const key = `${a.id}:${idx}`;
    if (this.seen.has(key)) { this.stats.dup++; return false; }
    this.seen.set(key, this.clock);
    const valid = hits.some((h) => h.ok && F.stack.results.includes(h.r));
    if (!valid) { if (hits.length) this.stats.rejected++; return false; }
    this.stats.valid++;
    this.lastHit = this.clock;
    if (this.ready) { this.stats.overflow++; return true; }        // 已成势：不储存第二层，也不预存下一轮
    this.count = Math.min(F.stack.hits, this.count + 1);
    if (this.count >= F.stack.hits) {
      this.ready = true; this.stats.gained++;
      this.logE('ready', { key });
      this.fx?.readyBurst?.(this.P);
      this.sound?.play('inkReady', { at: this.P.pos });
    }
    return true;
  }
  // 每帧（战斗时钟）：hold 为真时不走（暂停、界面、Boss 过场；演出中本来就不走）
  tick(dt, { hold = false } = {}) {
    if (!hold && !this.active) this.clock += dt;
    if (!this.ready && this.count > 0 && this.clock - this.lastHit >= F.stack.timeout) {
      this.logE('timeout', { count: this.count }); this.count = 0; this.stats.timeouts++;
    }
    if (this.seen.size > 64) for (const [k, t] of this.seen) if (this.clock - t > 30) this.seen.delete(k);
    this.fx?.readyRing?.(this.P, this.inkReady && !this.active, dt);
    this.hud?.update();
  }
  // 清掉计数与墨势（力竭、重试、离开战斗实例、换场景）；已正式消耗的不返还
  resetStack(reason) {
    if (this.count || this.ready) { this.logE('clear', { reason, count: this.count, ready: this.ready }); this.stats.clears++; }
    this.count = 0; this.ready = false; this.lastHit = -99; this.seen.clear();
  }
  // 换新的战斗实例：清墨势、作废旧实例的处决记录（不向新实例提交）
  newInstance(reason) {
    this.invalidate(reason);
    this.instance++;
    this.resetStack(reason);
  }

  // =====================================================================================
  // 正式出刀（moves.startIaiSlash：同一个事件里确认合法、消耗墨势、提交尚未扣除的费用、启动 / 沿用冷却、建立唯一攻击实例）
  // 有墨势且蓄满 3 秒才是升级形态；否则（没有墨势、未满）照普通拔刀斩，不消耗
  // 费用与冷却：拔刀斩本身不耗灵力、没有冷却（PLAYER_COMBAT.skills.power 无 mp / cooldown，moves.release 只对 SKILLS 扣）——升级形态沿用，不另收
  // =====================================================================================
  formalDraw(I, a) {
    if (!I || !this.inkReady || !(I.charge >= F.charge.full - 1e-6) || !this.C.playerUnit.alive || this.active) { this.stats.normal++; return null; }
    this.ready = false; this.count = 0; this.lastHit = -99;           // 消耗墨势、计数从 0／30 重新积累（空挥也不返还）
    this.stats.consumed++; this.stats.enhanced++;
    const id = `${this.instance}:${++this.serial}`;
    const fin = { id, act: a.id, enhanced: true, dmgK: F.dmgK, cost: 0, cooldown: 0, charge: +I.charge.toFixed(3), primary: null, probed: false, exec: null, why: null, batch: 0 };
    this.logE('draw', { id, act: a.id, charge: fin.charge });
    this.sound?.play('inkDraw', { at: this.P.pos });
    return fin;
  }

  // =====================================================================================
  // 主目标：只在实际攻击判定接受的接触目标里选（不隔空处决锁定对象）——
  // 有效锁定且确实被这一刀命中的敌人优先；否则攻击轨迹最先接触的合法敌人（拔刀斩自左前扫到右后：相对朝向越靠左越先）；同时接触按距离、编号稳定排序
  // =====================================================================================
  primaryOf(batch, lock = null) {
    const P = this.P;
    const legal = batch.filter((e) => e && e.alive && !e.dummy && hostile(SECT, e.faction));
    if (!legal.length) return null;
    if (lock && legal.includes(lock)) return lock;
    const rows = legal.map((e) => ({ e, a: wrapAngle(Math.atan2(e.pos.x - P.pos.x, e.pos.z - P.pos.z) - P.heading), d: Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z), id: tid(e) }));
    rows.sort((x, y) => (Math.abs(x.a - y.a) > 1e-3 ? y.a - x.a : Math.abs(x.d - y.d) > 1e-3 ? x.d - y.d : x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    return rows[0].e;
  }

  // =====================================================================================
  // 处决探针（combat.damage / Boss.receive 在主目标这一下被接受之后、伤害结算之前调用）：符合条件即确认处决（这一下不再结算强化伤害）
  // =====================================================================================
  probe(a, e) {
    const fin = a?.finale;
    if (!fin || fin.exec || fin.probed) return false;
    fin.probed = true;                                  // 主目标只判这一次：不符合也不再找别的低血量目标
    this.stats.probes++;
    const ratio = stageRatio(e), st = stageOf(e);
    const why = this.whyNot(e, ratio);
    if (why) { fin.why = why; this.logE('noExec', { id: fin.id, target: tid(e), why, ratio: +ratio.toFixed(4), stage: st.id }); return false; }
    const plan = this.plan(e);
    if (!plan) {
      fin.why = 'noShow'; this.stats.fallbacks++;
      this.logE('fallback', { id: fin.id, target: tid(e), ratio: +ratio.toFixed(4) });
      console.info('[墨里终焉] 建立不了处决演出（不在地面 / 演出素材未就绪），本次按强化伤害结算');
      return false;
    }
    this.confirm(e, a, plan, ratio);
    return true;
  }
  adapter(e) {
    if (e?.kind === 'boss30' && this.g.boss30) return bossAdapter(this.g.boss30);
    if (e?.kind === 'boss50' && this.g.boss50) return bossAdapter(this.g.boss50);
    if (e?.duel) return DUELIST;
    return ENEMY;
  }
  // 不能处决的原因（null = 可以）
  whyNot(e, ratio = stageRatio(e)) {
    if (!this.C.playerUnit.alive) return 'playerDead';
    if (!e || !e.alive) return 'dead';
    if (e.dummy || !hostile(SECT, e.faction)) return 'notHostile';
    if (e.phoenix) return 'config';                                  // 友方不处决（第二十九轮起切磋对手也处决：击倒、走演武场的胜负）
    if (e.finaleLock || (this.rec && !this.rec.done && this.rec.target === tid(e))) return 'occupied';
    const info = this.adapter(e).info(this, e);
    if (!info.allow) return 'config';
    if (!info.canEnd) return 'stageLocked';
    if (!(ratio <= F.exec.ratio + 1e-9)) return 'hp';
    // 第二十九轮：与通用的终结同一条规矩——首领、分段的敌人只在最后一条命；群战里只处决最后一个
    if (!stageOf(e).final) return 'notFinal';
    if (!this.isLastFoe(e)) return 'notLast';
    return null;
  }

  // =====================================================================================
  // 第二十九轮：通用的终结——不论哪种招式（普攻、剑诀、拔刀斩、凤凰、雷龙、剑气……），玩家一方打出的致命一击，
  // 是群战里的最后一个敌人、首领的最后一条命，就交给这段演出（这一下不扣血，收刀合拢时才倒下）；不需要墨势。
  // combat.damage / Boss.receive 在这一下已被接受、确定会致命、扣血之前调用；返回 true = 已确认处决
  // =====================================================================================
  lethalProbe(e, { from = null, kind = null, dot = false } = {}) {
    if (!F.kill?.on || this.active || !this.playerSide(from)) return false;
    const why = this.whyNotKill(e);
    if (why) { this.stats.killSkip = (this.stats.killSkip || 0) + 1; this.logE('noKill', { target: tid(e), why, atk: kind }); return false; }
    const plan = this.plan(e, { air: true });
    if (!plan) { this.stats.fallbacks++; this.logE('fallback', { target: tid(e), src: 'kill', atk: kind }); return false; }
    const a = { id: 'kill', t: 0.2, finale: { id: `${this.instance}:k${++this.serial}`, exec: null, src: 'kill', kind, dot: !!dot } };
    this.stats.kills = (this.stats.kills || 0) + 1;
    this.confirm(e, a, plan, stageRatio(e));
    return true;
  }
  // 玩家一方：玩家自己，或玩家的凤凰、雷龙、剑气（护宗双龙不算）
  playerSide(from) { const U = this.C.playerUnit; return !!from && (from === U || !!from.isPlayer || !!from.ownerPlayer || from.owner === 'player'); }
  whyNotKill(e) {
    if (!this.C.playerUnit.alive) return 'playerDead';
    if (!e || !e.alive) return 'dead';
    if (e.dummy || e.phoenix || !hostile(SECT, e.faction)) return 'notHostile';
    if (e.finaleLock) return 'occupied';
    const info = this.adapter(e).info(this, e);
    if (!info.allow) return 'config';
    if (!info.canEnd) return 'stageLocked';
    if (!stageOf(e).final) return 'notFinal';
    if (!this.isLastFoe(e)) return 'notLast';
    return null;
  }
  // 群战里的最后一个：同一场景里，除了它自己，再没有活着、敌对、还在这场战斗里的敌人——
  //   首领、切磋对手都算；在交手（被打过、在追击 / 进攻 / 受击）的，在玩家 2 × kill.radius 米内算（被甩在远处的不拦着）；
  //   没交过手的，在 kill.radius 米内、没有沉睡的也算
  isLastFoe(e) {
    const P = this.P.pos, R = F.kill?.radius ?? 30;
    for (const u of this.foes()) {
      if (!u || u === e || !u.alive || u.dummy || u.phoenix || !hostile(SECT, u.faction)) continue;
      if (u.world && e.world && u.world !== e.world) continue;
      if (u.boss || u.duel) return false;
      const d = Math.hypot(u.pos.x - P.x, u.pos.z - P.z);
      if ((u.engaged || ['chase', 'attack', 'hit'].includes(u.state)) && d < R * 2) return false;
      if (u.state !== 'dormant' && d < R) return false;
    }
    return true;
  }
  foes() {
    const C = this.C, g = this.g, out = [...(C.enemies || []), ...(C.duelists || [])];
    for (const B of [g.boss30, g.boss50]) if (B?.unit && B.state === 'fight') out.push(B.unit);
    return out;
  }

  // =====================================================================================
  // 演出方案（处决判定前准备）：所有目标都是同一套完整演出——站位由宽到窄几档（full → near → tight），都不合法时在原地的安全空间里演（local）；
  // 只有根本演不了（不在地面、演出素材未就绪）才返回 null（退回强化伤害）
  // =====================================================================================
  plan(e, { air = false } = {}) {
    const P = this.P, st = stageOf(e), A = this.adapter(e), size = A.size(e);
    if (P.flying || (!P.onGround && !air) || !this.fx?.ready || !this.P.char?.clips?.iai_noto2) return null;
    if (![e.pos.x, e.pos.y, e.pos.z].every(Number.isFinite)) return null;
    const large = !!size.large || size.r > F.exec.large;
    const base = { final: !!st.final, large, size, stage: st.id, kind: A.kind };
    this.lastSpace = null;
    for (const L of F.pos.levels) {
      const lay = this.layout(e, size, L);
      if (lay) return { ...base, level: L.name, why: L.name === 'full' ? null : this.lastSpace, ...lay, cams: this.makeCams(e, size, lay, large) };
    }
    const loc = this.localLayout(e, size);
    return { ...base, level: 'local', why: this.lastSpace || 'space', ...loc, cams: this.makeCams(e, size, loc, large) };
  }
  ground(x, z, yRef) { const g = this.P.groundAt(x, z, yRef + 0.6, 0.6); return Number.isFinite(g) && g > -1e6 ? g : null; }
  // E 沿 u 离 d 米处的地面点（不合法返回 null）
  spot(E, u, d) {
    const x = E.x + u.x * d, z = E.z + u.z * d, y = this.ground(x, z, E.y);
    if (y == null) { this.lastSpace = 'noGround'; return null; }
    if (Math.abs(y - E.y) > F.pos.span) { this.lastSpace = y < E.y ? 'cliff' : 'wall'; return null; }
    const p = new THREE.Vector3(x, y, z);
    return this.inBounds(p) ? p : null;
  }
  inBounds(p) {
    const T = this.P.terrain;
    if (T?.inCore && !T.inCore(p.x, p.z, 4) && !(this.P.skyGround && this.P.skyGround(p.x, p.z, p.y + 0.6) > -1e8)) { this.lastSpace = 'bounds'; return false; }
    if (this.world.bounds(p) === false) { this.lastSpace = 'bounds'; return false; }
    if (this.g.arena?.active && this.g.arena.inRing && !this.g.arena.inRing(p)) { this.lastSpace = 'ring'; return false; }     // 第二十九轮
    return true;
  }
  // a → b 一路可走、没有墙体柱子挡住、离墙够远、没有断崖与台阶、不出场景（演出层不改任何碰撞，只检查）
  pathOK(a, b) {
    const R = F.pos, cw = this.P.cw, T = this.P.terrain;
    const L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(2, Math.ceil(L / R.sample));
    let prev = a.y, lo = a.y, hi = a.y;
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      p.set(a.x + (b.x - a.x) * k, 0, a.z + (b.z - a.z) * k);
      const g = this.ground(p.x, p.z, prev);
      if (g == null) { this.lastSpace = 'noGround'; return false; }
      if (g - prev > R.step) { this.lastSpace = 'wall'; return false; }
      if (prev - g > R.drop) { this.lastSpace = 'cliff'; return false; }
      lo = Math.min(lo, g); hi = Math.max(hi, g);
      if (hi - lo > R.span) { this.lastSpace = 'cliff'; return false; }
      p.y = g;
      if (!this.inBounds(p)) return false;
      const w = T?.waterAt?.(p.x, p.z);
      if (w != null && w - g > 0.3) { this.lastSpace = 'water'; return false; }
      if (cw?.pushCircle) { q.copy(p); cw.pushCircle(q, R.clear, 1.72, 0.46); if (Math.hypot(q.x - p.x, q.z - p.z) > 0.02) { this.lastSpace = 'wall'; return false; } }
      prev = g;
    }
    for (const h of R.eye) if (!this.lineClear(a, b, h)) { this.lastSpace = 'wall'; return false; }
    return true;
  }
  lineClear(a, b, h) {
    const cw = this.P.cw;
    if (!cw?.ray) return true;
    const o = _v.set(a.x, a.y + h, a.z), d = _w.set(b.x - a.x, (b.y + h) - o.y, b.z - a.z), L = d.length();
    if (L < 0.05) return true;
    d.divideScalar(L);
    return cw.ray(o, d, L) >= L - 0.05;
  }
  // 一档站位：沿「玩家 → 敌人」的轴线（不合法时依次换偏角）求身后起点 B（敌人身后）、拔刀处 D、身前终点 F；dir 为玩家走、拔刀穿行的方向
  layout(e, size, L) {
    const P = this.P, E = e.pos, r = size.r;
    const base = Math.atan2(E.x - P.pos.x, E.z - P.pos.z);
    for (const deg of F.pos.tryAngles) {
      const ang = base + deg * DEG, u = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), dir = u.clone().negate();
      const B = this.spot(E, u, r + L.behind), D = this.spot(E, u, r + L.start), Fp = this.spot(E, u, -(r + L.front));
      if (!B || !D || !Fp) continue;
      if (!this.pathOK(B, Fp)) continue;
      if (!this.lineClear(P.pos, B, 1.0)) { this.lastSpace = 'wall'; continue; }      // 墨痕绕到身后的那一下不穿墙
      return { u, dir, B, D, F: Fp, ang: deg, left: new THREE.Vector3(dir.z, 0, -dir.x) };
    }
    return null;
  }
  // 局部演出空间：就在玩家站的地方化墨、凝聚（站位本来就合法），朝敌人缓步、就近拔刀；穿过敌人的那一侧不合法就停在敌人身前——流程一步不少
  localLayout(e, size) {
    const P = this.P, E = e.pos, r = size.r;
    const dir = new THREE.Vector3(E.x - P.pos.x, 0, E.z - P.pos.z); if (dir.lengthSq() < 1e-6) dir.set(Math.sin(P.heading), 0, Math.cos(P.heading)); dir.normalize();
    const u = dir.clone().negate();
    const B = P.pos.clone();
    const dist = Math.hypot(E.x - B.x, E.z - B.z);
    let D = dist > r + 1.0 ? this.spot(E, u, r + 0.95) : null;
    if (!D || !this.pathOK(B, D)) D = B.clone();
    let Fp = this.spot(E, dir, r + 1.1);
    if (!Fp || !this.pathOK(D, Fp)) Fp = D.clone();
    return { u, dir, B, D, F: Fp, ang: 0, left: new THREE.Vector3(dir.z, 0, -dir.x), local: true };
  }
  // 镜头位置：沿「注视点 → 机位」检查墙体与场景空间，挡住就往注视点收（至少 min 米）；不入地
  camFix(at, pos, min = 1.3) {
    const d = _u.subVectors(pos, at), L = d.length();
    if (L < 1e-3) return pos.clone();
    d.divideScalar(L);
    let t = L;
    const cw = this.P.cw;
    if (cw?.ray) { const h = cw.ray(at, d, L); if (h < L) t = Math.max(min, h - 0.35); }
    if (this.cam.limitHook) t = Math.max(Math.min(min, L), Math.min(t, this.cam.limitHook(at, d, t)));
    const out = at.clone().addScaledVector(d, t);
    const g = this.ground(out.x, out.z, out.y + 2);
    if (g != null && out.y < g + 0.35) out.y = g + 0.35;
    return out;
  }
  // 各机位（入场、铺开、画卷、拔刀、身前四分之三、近景）；缓步跟拍按人物的实时位置算（见 Show.updateCamera）
  makeCams(e, size, lay, large) {
    const C = F.cam, E = e.pos, h = size.h, { dir, left, B } = lay, Fp = lay.F;
    const at = (p, y) => new THREE.Vector3(p.x, p.y + y, p.z);
    // 画卷起的机位：原场景已被画中世界替换（看不见），不必按原场景的墙体收镜头，只保证不低于演出处的地面
    const late = (aim, pos, min) => (this.stage?.ready ? pos.setY(Math.max(pos.y, B.y + 0.4)) : this.camFix(aim, pos, min));
    const tanV = Math.tan((C.fov * DEG) / 2);
    // 入场：敌人躯干居中，身高占画面高度的 enemyAim（35%–50% 之内）；自玩家原来那一侧、绕敌人偏 orbit 度（看得见它身后凝聚的玩家）
    const hf = size.frame ?? h;                                  // 构图按整个轮廓（翅膀、角算进去），对准的躯干仍按身高
    const dEntry = Math.min(hf / (2 * tanV * C.enemyFrac[0]), Math.max(hf / (2 * tanV * C.enemyFrac[1]), hf / (2 * tanV * C.enemyAim)));
    const side0 = lay.local ? -1 : 1;
    let best = null;
    for (const sg of [1, -1]) {
      const a = sg * (lay.local ? 55 : C.entry.orbit) * DEG, toCam = dir.clone().multiplyScalar(side0).applyAxisAngle(UP, a);
      const eAt = at(E, h * C.entry.lookUp), raw = at(E.clone().addScaledVector(toCam, dEntry), h * C.entry.up), pos = this.camFix(eAt, raw, 2.2);
      const ok = pos.distanceTo(eAt) / raw.distanceTo(eAt);
      if (!best || ok > best.ok + 0.05) best = { ok, pos, at: eAt, toCam };
    }
    const entry = { pos: best.pos, at: best.at };
    // 铺开：拉远升高，看着敌人与玩家之间
    const mid = new THREE.Vector3().addVectors(E, B).multiplyScalar(0.5);
    const far = mid.clone().addScaledVector(best.toCam, -B.distanceTo(E) * C.spread.beyond - 8);
    const sAt = at(far, C.spread.lookUp * (large ? 1.4 : 1)), sRaw = at(E.clone().addScaledVector(best.toCam, dEntry * C.spread.back), C.spread.up + h * 0.25);
    const spread = { pos: this.camFix(sAt, sRaw, 3), at: sAt };
    // 画卷：玩家身后高处，顺着画卷看向敌人（书法在画面右半边）
    // 大型目标（剑尊、龙君，高 4 米上下）：这个机位只看得到它的腿——按比例拉远（高度按平方根升），直到玩家脚下与敌人头顶都落进画面，再对准两者正中
    let bAt = at(B.clone().addScaledVector(dir, B.distanceTo(E) * C.scroll.ahead + 0.4), 0.2);
    let bPos = at(B.clone().addScaledVector(dir, -C.scroll.back).addScaledVector(left, C.scroll.side), C.scroll.up);
    if (large) ({ pos: bPos, at: bAt } = fitTall(B, E, hf, bPos, bAt, tanV));
    const scroll = { pos: late(bAt, bPos, 2.5), at: bAt };
    // 拔刀穿行：横向大景
    const dS = C.draw.side * (large ? 1.6 : 1), mAt = at(new THREE.Vector3().addVectors(lay.D, Fp).multiplyScalar(0.5), C.draw.lookUp * (large ? 1.3 : 1));
    const draw = { pos: late(mAt, at(mAt.clone().setY(E.y).addScaledVector(left, dS), C.draw.up * (large ? 1.4 : 1)), 3), at: mAt };
    // 身前四分之三：玩家在前景（腰以上）、敌人在中后景、上方留给龙凤
    const fr = C.front, fk = large ? 1.08 : 1;
    const fAt = at(Fp, fr.lookUp).lerp(at(E, Math.min(h * 0.6, 2.6)), fr.toEnemy * (large ? 1.2 : 1));
    const front = { pos: late(fAt, at(Fp.clone().addScaledVector(dir, fr.front * fk).addScaledVector(left, fr.side), fr.up), 1.6), at: fAt };
    // 近景：正脸（略偏四分之三），脸在画面中偏左，右上方留给书法「终焉」
    const cl = C.close, cAt = at(Fp, cl.lookUp).addScaledVector(left, 0.22);
    const close = { pos: late(cAt, at(Fp.clone().addScaledVector(dir, cl.front).addScaledVector(left, cl.side), cl.up), 0.9), at: cAt };
    return { entry, spread, scroll, draw, front, close };
  }

  // =====================================================================================
  // 确认处决：建立唯一记录（战斗实例、攻击实例、玩家、目标、阶段、状态、终结提交标记）——锁定目标与阶段、停手、阻止别的处决、下一帧接管演出
  // =====================================================================================
  confirm(e, a, plan, ratio) {
    const st = stageOf(e);
    const rec = this.rec = { battle: this.instance, attack: a.finale.id, act: a.id, via: a.finale.src || 'iai', player: 'player', target: tid(e), stage: st.id, final: !!st.final,
      level: plan.level, why: plan.why, ratio: +ratio.toFixed(4), state: 'confirmed', committed: false, invalid: false, done: false, t0: this.clock, src: null };
    a.finale.exec = rec;
    e.finaleLock = rec;
    this.adapter(e).hold(this, e, rec);
    this.pending = { e, a, plan, rec };
    this.stats.execs++;
    this.records.unshift(rec); if (this.records.length > 12) this.records.length = 12;
    this.logE('confirm', { id: rec.attack, via: rec.via, target: rec.target, stage: rec.stage, level: rec.level, why: rec.why, ratio: rec.ratio });
    return rec;
  }
  // 唯一终结入口（收刀合拢、跳过都走这里）：只提交一次；实例或阶段已变（作废）不提交
  commit(src = 'sheathe') {
    const rec = this.rec, e = this.show?.e ?? this.pending?.e;
    if (!rec || rec.committed || rec.invalid) return false;
    rec.committed = true; rec.src = src;
    if (rec.battle !== this.instance || !e || !e.alive || stageOf(e).id !== rec.stage) {
      rec.invalid = true; rec.state = 'stale'; this.stats.invalid++;
      if (e) e.finaleLock = null;
      this.logE('stale', { id: rec.attack, src });
      return false;
    }
    e.finaleLock = null;
    let ok = false;
    try { ok = this.adapter(e).finish(this, e, rec); } catch (err) { console.error('[墨里终焉] 终结提交失败', err); }
    rec.state = ok ? 'committed' : 'failed'; rec.at = +this.clock.toFixed(3);
    this.stats.commits++;
    this.logE('commit', { id: rec.attack, target: rec.target, src, ok, alive: !!e.alive, stage: stageOf(e).id });
    return ok;
  }
  // 作废（重试、离场、换场景、力竭）：不向新实例提交；清掉保护、暂停、镜头与临时资源；已消耗的墨势不返还。可重复调用
  invalidate(reason = 'invalid') {
    const rec = this.rec;
    if (rec && !rec.done && !rec.committed) { rec.invalid = true; rec.state = 'invalid'; rec.reason = reason; this.stats.invalid++; this.logE('invalidate', { id: rec.attack, reason }); }
    if (this.show || this.pending) this.cleanup({ reason, abort: true });
  }
  // 统一的清理（演出结束、跳过、作废都走这里；可重复调用，不会重复结算）
  cleanup({ reason = 'end', abort = false } = {}) {
    const S = this.show, pend = this.pending, e = S?.e ?? pend?.e;
    this.show = null; this.pending = null;
    const rec = this.rec;
    if (rec && !rec.done) rec.done = true;
    if (e) {
      if (e.finaleLock === rec) e.finaleLock = null;
      try { this.adapter(e).release(this, e, !!rec?.committed); } catch (err) { console.error(err); }
    }
    if (S) S.dispose(abort);
    else if (pend) this.M.handBack?.();
    this.C.playerUnit.finaleGuard = false;
    if (S || pend) this.logE('cleanup', { reason, abort });
  }

  // =====================================================================================
  // 每帧：演出（main.js 在 moves.update 的位置调 drive，在 player.update 之后调 post）
  // =====================================================================================
  drive(dt) {
    if (this.pending && !this.show) {
      const p = this.pending;
      // 开演之前的终检：实例、目标都还在（否则作废，不提交）
      if (p.rec.battle !== this.instance || !p.e.alive) { this.invalidate('stale'); return; }
      this.show = new Show(this, p);
      this.stats.shows[p.plan.level] = (this.stats.shows[p.plan.level] || 0) + 1;
      this.pending = null;
    }
    this.show?.drive(dt);
  }
  post(dt) {
    if (this.show) { this.show.syncMusic(!!this.paused?.()); this.show.post(dt); }
    else this.fx?.idle?.(dt);
    this.hud?.update();
  }
  // 有墨势时蓄满 3 秒（moves.tickIai）：满蓄力的反馈——鞘口一圈墨、一点银光、提示音
  onFullCharge() {
    this.logE('full', { charge: +(this.M.iai?.charge ?? 0).toFixed(3) });
    this.fx?.chargeFull?.(this.P);
    this.sound?.play('inkFull', { at: this.P.pos });
  }
  // 演出期间人物的 dt（定格时为 0）
  playerDt(dt) { return this.show ? this.show.playerDt(dt) : dt; }
  // 退场：第三人称镜头算出这一帧的机位之后，由演出最后的机位平滑过渡过去（震动偏移归零）
  camPost(camera, dt) {
    const B = this.blend;
    if (!B) return;
    if (this.g.freeCam) { this.blend = null; return; }                  // 别的过场（Boss 转阶段）接管了镜头：不插手
    B.t += dt;
    const k = smooth(0, B.dur, B.t);
    const qLive = _qb.copy(camera.quaternion);            // 第三人称镜头这一帧自己的朝向——先存下（slerp 的目标不能就是要写的那个四元数）
    // 绕着人走：起止两个机位都换成相对人头（pivot）的方位角、俯仰、距离，各自插值——直线插值会从人身上穿过去（正脸近景 → 身后）。
    // 绕行的方向在第一帧定下（走较短的一侧），之后第三人称机位小幅变动也不会忽左忽右
    const c = B.pivot;
    if (c) {
      _ca.subVectors(B.pos, c); _cb.subVectors(camera.position, c);
      const r0 = Math.max(_ca.length(), 1e-4), r1 = Math.max(_cb.length(), 1e-4);
      const y0 = Math.atan2(_ca.x, _ca.z), y1 = Math.atan2(_cb.x, _cb.z);
      const p0 = Math.asin(Math.max(-1, Math.min(1, _ca.y / r0))), p1 = Math.asin(Math.max(-1, Math.min(1, _cb.y / r1)));
      let dy = Math.atan2(Math.sin(y1 - y0), Math.cos(y1 - y0));
      if (B.sgn == null) B.sgn = dy < 0 ? -1 : 1;
      else if (Math.sign(dy) !== B.sgn && Math.abs(dy) > Math.PI / 2) dy += B.sgn * Math.PI * 2;
      const yaw = y0 + dy * k, pit = p0 + (p1 - p0) * k, r = r0 + (r1 - r0) * k;
      camera.position.set(c.x + Math.sin(yaw) * Math.cos(pit) * r, c.y + Math.sin(pit) * r, c.z + Math.cos(yaw) * Math.cos(pit) * r);
    } else camera.position.lerpVectors(B.pos, camera.position, k);
    if (c) {
      // 朝向：绕行时一直看着人；头 25% 由正脸近景的朝向转过去，最后 35% 转成第三人称镜头自己的朝向
      _mm.lookAt(camera.position, c, camera.up); _qa.setFromRotationMatrix(_mm);
      _qc.slerpQuaternions(B.q, _qa, smooth(0, 0.25, k));
      camera.quaternion.slerpQuaternions(_qc, qLive, smooth(0.65, 1, k));
    } else camera.quaternion.slerpQuaternions(B.q, qLive, k);
    camera.fov = B.fov + (B.fov1 - B.fov) * k; camera.updateProjectionMatrix();
    if (B.t >= B.dur) { camera.fov = B.fov1; camera.updateProjectionMatrix(); this.blend = null; }
  }
  // 跳过（空格 / E）：同一个终结入口，只结算一次；随后同一套清理、恢复合法站位与控制（非最终阶段随后照常进入阶段过场）
  skip() {
    const S = this.show;
    if (!S || S.ending) return false;
    this.stats.skips++;
    this.logE('skip', { t: +S.t.toFixed(3) });
    if (!this.rec?.committed && !this.rec?.invalid) { S.finishFx(true); this.commit('skip'); }
    S.end('skip');
    return true;
  }
  // 演出中按键：空格 / E 跳过；Esc 照常打开设置（暂停演出，不取消处决）；其余键一律不进演出
  key(code) {
    if (!this.active) return false;
    if (code === 'Space' || code === 'KeyE') { this.skip(); return true; }
    if (code === 'Escape') return false;
    return true;
  }
  // 演出中的提示（修炼灵气、掉落……）先攒着，退场之后再报（结算在演出结束之后才显示）
  wrapToast(ui) {
    if (!ui || ui.toast?.finaleWrapped) return;
    const raw = ui.toast.bind(ui);
    this.toastQ = [];
    const f = (html) => { if (this.active) { this.toastQ.push(html); return; } raw(html); };
    f.finaleWrapped = true;
    ui.toast = f;
    this.rawToast = raw;
  }
  flushToasts() {
    const q = this.toastQ || [];
    this.toastQ = [];
    q.forEach((h, i) => setTimeout(() => this.rawToast?.(h), 120 + i * 260));
  }
  // 自检 / 调试
  debugState() {
    return { unlocked: this.unlocked, enabled: this.enabled, count: this.count, ready: this.ready, clock: +this.clock.toFixed(3), lastHit: +this.lastHit.toFixed(3), instance: this.instance,
      active: this.active, show: this.show ? { level: this.show.level, t: +this.show.t.toFixed(3), finishT: this.show.finishT, endT: this.show.endT, frozen: this.show.frozen, exited: !!this.show.exited } : null,
      rec: this.rec ? { ...this.rec } : null, stats: JSON.parse(JSON.stringify(this.stats)) };
  }
  debugGive(n = F.stack.hits) { if (n >= F.stack.hits) { this.count = F.stack.hits; this.ready = true; } else { this.count = n; this.ready = false; this.lastHit = this.clock; } return this.debugState(); }
}

// =====================================================================================
// 演出（统一的 16 秒时间线：时刻在 FINALE.show，收刀合拢以动作 iai_noto2 的 close 标记推出）
// =====================================================================================
class Show {
  constructor(fin, { e, a, plan, rec }) {
    this.fin = fin; this.e = e; this.plan = plan; this.rec = rec; this.level = plan.level; this.mode = 'full';
    const P = fin.P, ch = P.char, M = ch.clips.iai_noto2.data.marks, T = F.show;
    this.A = fin.adapter(e);
    this.T = T;
    this.t = 0; this.fired = new Set(); this.ending = false; this.frozen = false; this.exited = false;
    this.impulses = [];                                                 // 第二十八轮：龙凤撞入的冲击（镜头一顿、震屏、四角压暗）
    this.slashT = Math.max(0, Math.min(0.3, a?.t ?? 0.2));            // 处决确认时出刀动作的时刻（定住）
    this.close = M.close; this.notoDur = ch.clips.iai_noto2.dur;
    this.finishT = T.sheathe + this.close;                              // 刀镡与鞘口合拢的那一刻（终结只在这里）= 13.2
    this.endT = T.dur; this.freezeT = T.freeze[0]; this.exitT = T.exit[0];
    // 站位
    this.P0 = P.pos.clone(); this.h0 = P.heading;
    this.E = e.pos.clone(); this.size = plan.size;
    this.u = plan.u; this.dir = plan.dir; this.left = plan.left; this.B = plan.B; this.D = plan.D; this.Fp = plan.F;
    this.face = Math.atan2(this.dir.x, this.dir.z);
    this.cams = plan.cams;
    this.sword = ch.swordId || ch.sword?.id || null;
    // 接管：清掉普攻缓冲、蓄力与待释放动作（之后要新的按下才出手）；记下并接管镜头、鼠标与角色控制
    fin.M.handOver();
    this.camSave = { ...fin.cam.getState(), fov: fin.camera.fov };
    this.camObj = { pos: this.cams.entry.pos.clone(), at: this.cams.entry.at.clone() };
    // 第二十八轮：交给主循环的是 camView（演出机位 camObj 加上撞击的一顿与震屏）——主循环每帧最后按 freeCam 摆镜头，交 camObj 的话撞击的偏移会被盖掉
    this.camView = { pos: this.camObj.pos.clone(), at: this.camObj.at.clone() };
    fin.g.freeCam = this.camView;
    fin.C.playerUnit.finaleGuard = true;
    // 演出空间：附近不参战的同门暂时隐去（免得挡住机位）；结束复原
    this.npcHidden = [];
    for (const n of Object.values(fin.g.npcs || {})) if (n.pos && Math.hypot(n.pos.x - this.E.x, n.pos.z - this.E.z) < 20) { n.showHidden = true; n.root.visible = false; this.npcHidden.push(n); }
    document.body.classList.add('ink-show');
    fin.hud?.showOverlay(true);
    this.walkPh = 0; this.holdT = 0; this.clipName = null; this.passed = false; this.stepN = 0;
    // 画面：演出物件、画中世界（山水由玩家凝聚处向外铺开；保留玩家、目标与演出物件，其余逐步替换）
    this.fxh = fin.fx.begin(this);
    const eRoot = this.A.root(e);
    const camR = Math.max(this.cams.entry.pos.distanceTo(this.B), this.cams.spread.pos.distanceTo(this.B));
    fin.stage?.begin(this, { center: this.E, fwd: this.dir, origin: this.B, y0: this.B.y, ground: (x, z, y) => fin.ground(x, z, y),
      keep: [ch.root, eRoot, ...fin.fx.keepList()], onHide: (c, r) => fin.fx.puff(c, r), camR });
    this.replaced = !!fin.stage?.ready;                                 // 画中世界在：画卷起的机位不必躲原场景的墙（已被替换、看不见）
    // 音乐：确认处决才起（从配置的秒数处放）；场景原有的音乐压低——演出期间别处（Boss 转阶段等）要求的压低先记下，交还时再按它来
    const snd = fin.sound;
    if (snd?.duckMusic) {
      this.duck0 = snd.duckMusic; this.duckOwn = Object.prototype.hasOwnProperty.call(snd, 'duckMusic');
      snd.duckMusic = (k = 1, time = 0.6) => { this.extDuck = [k, time]; };
      this.duck0.call(snd, F.feel.duck, 0.3);
    }
    this.musicOn = false; this.musicPaused = false;                   // 第二十九轮：演出音乐在 cueAt 起（见 sounds）
    // 第一帧：出刀定在确认那一刻
    this.play('iai_slash', this.slashT, 0);
    fin.logE('show', { level: this.level, finishT: +this.finishT.toFixed(3), endT: this.endT, why: plan.why });
  }
  get player() { return this.fin.P; }
  get inkK() { return smooth(F.show.land.wave[0], F.show.land.dome[1], this.t) * (1 - (this.exitFade ?? 0)); }
  at(t0) { if (this.fired.has(t0) || this.t < t0) return false; this.fired.add(t0); return true; }
  // 第二十八轮：撞击的冲击由演出画面在撞上的一刻登记（kick 镜头往下一顿、shake 震屏、vig 四角压暗）；各次取最大的、不叠加，震屏按 feel.shake 封顶
  impulse(o) {
    this.impulses.push({ t0: this.t, ...o });
    if (o.who && o.who !== 'after') this.fin.logE('quake', { t: +this.t.toFixed(3), who: o.who });
  }
  // 此刻的冲击量：kick 往下一顿（米）、shake 震屏幅度（米，已封顶）——各次撞击取最大的、不叠加
  joltLevels(t) {
    let kick = 0, shake = 0;
    for (const I of this.impulses) {
      const a = t - I.t0;
      if (a < 0 || a > 0.6) continue;
      if (I.kick) kick = Math.max(kick, I.kick * (a < 0.05 ? smooth(0, 0.05, a) : 1 - smooth(0.05, 0.45, a)));
      if (I.shake) shake = Math.max(shake, I.shake * Math.pow(Math.max(0, 1 - a / 0.42), 2));
    }
    return { kick, shake: Math.min(shake, F.feel.shake * 0.2) };
  }
  // 此刻镜头位置与对准点的偏移（[位置, 对准点]；没有冲击、定格时为 null）。只由演出时刻决定（暂停时不抖）
  jolt(t) {
    if (this.frozen) return null;
    const { kick, shake } = this.joltLevels(t);
    if (kick <= 0 && shake <= 0) return null;
    const r = (ch) => shakeN(t, ch) * shake;
    _ja.set(r(0), r(1) - kick, r(2)); _jb.set(r(3) * 0.5, r(4) * 0.5 - kick * 0.6, r(5) * 0.5);
    return [_ja, _jb];
  }
  vigNow(t) { let v = 0; for (const I of this.impulses) { const a = t - I.t0; if (I.vig && a >= 0 && a < 0.5) v = Math.max(v, I.vig * Math.pow(1 - a / 0.5, 2)); } return v; }
  once(name, t0) { if (this.fired.has(name) || this.t < t0) return false; this.fired.add(name); return true; }
  playerDt(dt) { return this.frozen ? 0 : dt; }
  play(name, from, fade = 0.12, loop = false) {
    const A = this.player.char.anim;
    if (this.clipName === name) return;
    this.clipName = name;
    A.play(name, { from, manual: true, hold: true, fade, loop });
  }
  seek(t) { this.player.char.anim.seek(t); }

  // ---------- 每帧（player.update 之前）：人物的动作、站位、朝向、剑与鞘；声音；关键事件 ----------
  drive(rdt) {
    if (this.ending) return;
    this.t += rdt;                                                       // 演出时钟照走（定格只停画面与人物，不停时钟）
    const dt = this.frozen ? 0 : rdt, t = this.t, T = this.T, P = this.player, ctl = P.ctl;
    ctl.lock = true; ctl.yaw = null; ctl.maxSpeed = null; ctl.vx = 0; ctl.vz = 0;
    this.motion(t, dt);
    this.sounds(t);
    // 收刀合拢：唯一的终结事件（收刀清响、横向刀光、提交同一刻）
    if (!this.fired.has('finish') && t >= this.finishT) { this.fired.add('finish'); this.finish(); }
    if (!this.fired.has('freeze') && t >= this.freezeT) { this.fired.add('freeze'); this.frozen = true; this.fin.fx.freeze?.(this, true); this.fin.logE('freeze', { t: +t.toFixed(3) }); }
    if (!this.fired.has('exit') && t >= this.exitT) { this.fired.add('exit'); this.exitBegin(); }
    if (!this.fired.has('inkTarget') && this.fired.has('finish') && t >= this.finishT + 0.24) { this.fired.add('inkTarget'); this.hideTarget(true); }
    if (t >= this.endT) this.end('done');
  }
  // 出刀动作（iai_slash）里的鞘：与 moves.iaiLook 相同
  slashLook(ct) {
    const ch = this.player.char, D = ch.clips.iai_slash.data;
    ch.drawnSnap = true;
    ch.sheathTilt = 1 - smooth(0.22, 0.5, ct);
    ch.sheathPull = trackAt(D.pull, ct);
    ch.sheathPose = D.sheathPose ? trackAt(D.sheathPose, ct) : 1;
    this.player.drawn = ct >= D.marks.draw;
  }
  // 收刀动作（iai_noto2）里的鞘：左手回到鞘口（handOn）时由腰间转到蓄势的角度；合拢之前剑在手中（与鞘中的剑重合时才换）——刀、手、鞘对齐，只有一把剑
  notoLook(ct) {
    const ch = this.player.char, D = ch.clips.iai_noto2.data, H = D.marks.handOn;
    ch.drawnSnap = true;
    ch.sheathTilt = smooth(H[0], H[1], ct);
    ch.sheathPull = trackAt(D.pull, ct);
    ch.sheathPose = D.sheathPose ? trackAt(D.sheathPose, ct) : 1;
    this.player.drawn = ct < this.close;
  }
  // 蓄势站姿（iai_hold / iai_walk）：剑在鞘中、鞘压平；一手扶鞘、一手按柄
  holdLook() {
    const ch = this.player.char;
    ch.drawnSnap = true; ch.sheathTilt = 1; ch.sheathPull = 0; ch.sheathPose = 0; this.player.drawn = false;
  }
  setPos(p) {
    const P = this.player;
    P.pos.x = p.x; P.pos.z = p.z;
    const g = this.fin.ground(p.x, p.z, P.pos.y);
    P.pos.y = g ?? p.y;
    P.vel.set(0, 0, 0); P.onGround = true;
  }
  // 朝着 p 走（player.update 照常碰撞；演出路径事先查过可走，只由这一个系统给位移——动作的根运动不用）
  steer(p, dt) {
    const P = this.player;
    if (dt <= 0) return;
    P.ctl.vx = (p.x - P.pos.x) / dt; P.ctl.vz = (p.z - P.pos.z) / dt;
  }
  motion(t, dt) {
    const T = this.T, P = this.player, ch = P.char, fx = this.fin.fx;
    // 0 – 0.6：化墨、墨痕绕到身后、在合法位置重新凝聚（局部演出空间：就地化墨、就地凝聚）
    const dk = smooth(T.dissolve[0], T.dissolve[1], t) * (1 - smooth(T.reform[0], T.reform[1], t));
    ch.inkK = dk;
    ch.inkHide = dk > 0.55;
    if (t < T.trace[0] + 0.08) {
      this.play('iai_slash', this.slashT, 0); this.seek(this.slashT); this.slashLook(this.slashT);
      P.heading = this.h0;
    } else if (!this.fired.has('teleport')) {
      this.fired.add('teleport');
      this.setPos(this.B); P.heading = this.face;
      this.play('iai_hold', 0, 0, true); this.holdLook();
      fx.event?.('teleport', this);
    }
    // 凝聚之后：蓄势站着（呼吸起伏），山水由脚下铺开、画卷展开
    if (this.fired.has('teleport') && t < T.walk[0]) {
      this.holdT = (this.holdT + dt) % ch.clips.iai_hold.dur;
      this.play('iai_hold', this.holdT, 0, true); this.seek(this.holdT); this.holdLook();
      P.heading = this.face;
    }
    // 4 – 6：缓步接近（真实的步伐：脚不在地上滑、重心随步子起伏）
    if (t >= T.walk[0] && t < T.draw[0]) {
      const W = T.walk, u = clamp01((t - W[0]) / (W[1] - W[0])), k = smooth(W[0], W[1], t), want = _v.lerpVectors(this.B, this.D, k);
      const L = this.B.distanceTo(this.D), speed = (L / (W[1] - W[0])) * 1.5 * Math.sin(Math.PI * u);
      this.steer(want, dt);
      this.play('iai_walk', this.walkPh, 0.2, true);
      const ph0 = this.walkPh;
      this.walkPh = (this.walkPh + dt * Math.max(0.12, speed) / (ch.clips.iai_walk.data.marks?.speed ?? 1.2)) % 1;
      if ((ph0 < 0.5 && this.walkPh >= 0.5) || this.walkPh < ph0) { this.stepN++; this.fin.sound?.play('step', { at: P.pos, gain: 0.6, pitch: 0.9 }); this.fin.logE('step', { t: +t.toFixed(3) }); }
      this.seek(this.walkPh); this.holdLook();
      P.heading = this.face;
    }
    // 6 – 6.5：快速拔刀穿行（判定之类都不放——这一刀只是演出），位移按动作根运动的快慢分布在 D → F 上
    if (t >= T.draw[0] && t < T.sheathe) {
      const ct = Math.min(0.5, t - T.draw[0]);
      const R = ch.clips.iai_slash.data.root, z1 = rootZ(R, 0.5) || 1, k = clamp01(rootZ(R, ct) / z1);
      this.steer(_v.lerpVectors(this.D, this.Fp, k), dt);
      this.play('iai_slash', 0, 0.04); this.seek(ct); this.slashLook(ct);
      P.heading = this.face;
      if (this.once('dash', T.draw[0] + 0.05)) fx.event?.('dash', this);
      if (!this.passed && (P.pos.x - this.E.x) * this.dir.x + (P.pos.z - this.E.z) * this.dir.z > 0) { this.passed = true; this.passT = t; fx.event?.('pass', this); this.fin.logE('pass', { t: +t.toFixed(3) }); }
    }
    // 6.5 起：缓慢收刀（背对敌人；手、刀、鞘连续运动），13.2 合拢，之后残心、定格
    if (t >= T.sheathe) {
      const ct = Math.min(this.notoDur, t - T.sheathe);
      if (!this.fired.has('noto0')) { this.fired.add('noto0'); this.setPos(this.Fp); if (!this.passed) { this.passed = true; this.passT = t; } }
      this.play('iai_noto2', ct, 0.1); this.seek(ct); this.notoLook(ct);
      P.heading = this.face;
    }
    // 目标：失衡 → 一直保持失衡（被斩中、尚未显现），等收刀合拢才爆开
    const k = this.passed ? 1 : smooth(T.stagger[1], T.stagger[1] + 0.6, t) * 0.7;
    this.A.pose(this.fin, this.e, dt, k);
    if (this.at(T.stagger[0])) fx.event?.('stagger', this);
  }
  // 声音（与事件对齐）：墨风 → 山水铺开 → 画卷纸声 → 脚步（见 motion）→ 短促拔刀 → 龙凤鸣叫与撞入 → 八卦共鸣 → 收刀清响 → 爆墨
  sounds(t) {
    const S = F.sfx, snd = this.fin.sound, P = this.player, E = this.E, log = (name) => this.fin.logE('sfx', { name, t: +t.toFixed(3) });
    // 第二十九轮：演出音乐在山水铺开之前 0.1 秒进（从原曲 start 秒处放）
    if (this.once('music', F.music.cueAt)) {
      snd?.cue?.('ml', F.music.url, { at: F.music.start, gain: F.music.gain, fadeIn: F.music.fadeIn });
      this.musicOn = true; this.musicPaused = false;
      this.fin.logE('music', { at: F.music.start, t: +t.toFixed(3) });
    }
    if (!snd) return;
    if (this.at(S.whoosh)) { snd.play('inkWhoosh', { at: P.pos }); log('inkWhoosh'); }
    if (this.at(S.reform)) { snd.play('inkDraw', { at: this.B, gain: 0.8 }); log('inkDraw'); }
    if (this.at(S.swell)) { snd.play('inkSwell', { gain: 0.9 }); log('inkSwell'); }
    if (this.at(S.unfold)) { snd.play('mlUnfold', { at: this.B, gain: 1.0 }); log('mlUnfold'); }
    if (this.at(S.paper)) { snd.play('paper', { at: this.B, gain: 0.7 }); log('paper'); }
    if (this.at(S.draw)) { snd.play('iaiDraw', { at: P.pos, offset: 0.12 }); log('iaiDraw'); }
    if (this.at(S.cryP)) { snd.play('mlCry', { at: E, gain: 0.85 }); log('mlCry'); }
    if (this.at(S.cryD)) { snd.play('mlRoar', { at: E, gain: 0.8 }); log('mlRoar'); }
    if (this.at(S.hitP)) { snd.play('inkHit', { at: E, gain: 0.75 }); log('inkHit'); }
    if (this.at(S.gong)) { snd.play('mlGong', { gain: 0.75 }); this.drone = snd.loop?.('inkDrone', 'drone', { at: E, gain: 0.42 }); log('mlGong'); }
    if (this.at(S.hitD)) { snd.play('inkHit', { at: E, gain: 0.85, pitch: 0.85 }); log('inkHit'); }
    if (this.at(S.droneOff)) { snd.stopLoop?.('inkDrone', 0.14); log('droneOff'); }
    // 第二十八轮：龙凤撞地的墨震——各一记往下沉的闷响（凤轻、龙重）；龙撞上之后几声余震（与画面上的余震同一时刻）
    const Qk = F.quake;
    if (this.once('slamP', S.hitP)) { snd.play('inkSlam', { at: E, gain: Qk.gain.slam * Qk.phoenix, pitch: 1.15 }); log('inkSlamP'); }
    if (this.once('slamD', S.hitD)) { snd.play('inkSlam', { at: E, gain: Qk.gain.slam }); log('inkSlam'); }
    Qk.after.at.forEach((a, i) => { if (this.once('after' + i, S.hitD + a)) { snd.play('inkHit', { at: E, gain: Qk.gain.after, pitch: 0.7 + 0.05 * (i % 3) }); log(i ? 'inkAfter' + i : 'inkAfter'); } });
    // 砸入前后演出音乐让开一下（音乐与墨震同过一道总线压缩：音乐不让，闷响只会让压缩压得更深）；收刀合拢前的让开见下
    const Dq = Qk.duck;
    if (Dq && this.musicOn) {
      if (this.once('qDuck', Dq.at)) { snd.cueGain?.('ml', Dq.k, Dq.down); this.fin.logE('musicDip', { t: +t.toFixed(3), k: Dq.k, why: 'quake' }); }
      if (this.once('qBack', Dq.back)) { snd.cueGain?.('ml', 1, Dq.rise); this.fin.logE('musicDip', { t: +t.toFixed(3), k: 1, why: 'quake' }); }
    }
    // 收刀合拢前后：演出音乐让开（压到 dip.k），合拢之后回升——收刀清响清清楚楚
    const D = F.music.dip;
    if (D && this.musicOn) {
      if (this.at(D.at)) { snd.cueGain?.('ml', D.k, D.down); this.fin.logE('musicDip', { t: +t.toFixed(3), k: D.k }); }
      if (this.at(D.back)) { snd.cueGain?.('ml', 1, D.rise); this.fin.logE('musicDip', { t: +t.toFixed(3), k: 1 }); }
    }
  }
  // ---------- 收刀合拢：刀镡与鞘口合拢的那一刻——收刀清响、横向银白刀光、提交终结、爆墨 ----------
  finish() {
    const fin = this.fin;
    fin.sound?.stopLoop?.('inkDrone', 0.06);
    fin.sound?.play('noto', { at: this.player.pos, gain: 1.3 }); fin.logE('sfx', { name: 'noto', t: +this.t.toFixed(3) });
    this.finishFx(false);
    fin.commit('sheathe');
    fin.sound?.play('inkBurst', { at: this.E, delay: 0.07, gain: 1 }); fin.logE('sfx', { name: 'inkBurst', t: +(this.t + 0.07).toFixed(3) });
    this.shakeT = 0;
  }
  finishFx(skip) { if (this.fxFinished) return; this.fxFinished = true; this.fin.fx.event?.('finish', this, { skip }); }
  // 目标在爆墨里化去（只是不画：挪到镜头不画的层；它的动作、状态、结算照常）；交还时复原
  hideTarget(on) {
    const root = this.A.root(this.e);
    if (on) {
      if (!root || this.targetMasks) return;
      this.targetMasks = [];
      root.traverse((x) => { this.targetMasks.push([x, x.layers.mask]); x.layers.mask = 1 << 30; });
      this.fin.logE('inkTarget', { t: +this.t.toFixed(3) });
    } else if (this.targetMasks) {
      for (const [x, m] of this.targetMasks) x.layers.mask = m;
      this.targetMasks = null;
    }
  }
  // 音乐跟着暂停：菜单、失焦、后台时停住；恢复时由演出时刻对应的位置接着放（不补算）
  syncMusic(paused) {
    if (!this.musicOn || this.exited) return;
    const snd = this.fin.sound;
    if (paused && !this.musicPaused) { this.musicPaused = true; snd?.cuePause?.('ml'); this.fin.logE('musicPause', { t: +this.t.toFixed(3) }); }
    else if (!paused && this.musicPaused) { this.musicPaused = false; snd?.cueResume?.('ml', F.music.start + (this.t - F.music.cueAt)); this.fin.logE('musicResume', { t: +this.t.toFixed(3) }); }
  }

  // ---------- 每帧（player.update 之后）：镜头、画面、画中世界、调色、退场叠化 ----------
  post(dt) {
    const fin = this.fin, t = this.t, T = this.T;
    if (!this.exited) {
      this.updateCamera(dt);
      const cam = fin.camera;
      const J = this.jolt(t), V = this.camView;                         // 第二十八轮：龙凤撞入时镜头往下一顿、震屏
      V.pos.copy(this.camObj.pos); V.at.copy(this.camObj.at);
      if (J) { V.pos.add(J[0]); V.at.add(J[1]); }
      cam.position.copy(V.pos); cam.lookAt(V.at);
      cam.updateMatrixWorld();
    }
    // 退场：后期留住了最后一帧之后才替换回原场景（叠化由后期做）；没开后期（或只推进不渲染的自检）就直接淡出
    if (this.exited && !this.exitApplied) {
      const post = fin.postFx;
      if (!this.exitCross || (post?.heldN ?? 0) > this.heldN0 || t - this.exitT > 0.06) this.applyExit(this.exitCross && (post?.heldN ?? 0) > this.heldN0);
    }
    if (this.exited) {
      const k = smooth(this.exitT, this.endT, t);
      this.exitFade = k;
      if (this.exitApplied && this.crossOK) fin.postFx?.setHold?.(1 - k); else fin.stage?.exitTick?.(k);
    }
    if (!(this.exitApplied && this.crossOK)) fin.fx.tick(this, dt);     // 叠化退场之后演出物已收掉（fx.end），不再按演出时刻重新摆出来（墨带会在露出的画面里重现）
    fin.stage?.tick(t, dt, fin.camera);
    const ink = smooth(T.land.wave[0], T.land.dome[1], t) * (1 - (this.exitFade ?? 0));
    fin.postFx?.setPaper?.(0.34 * ink);
    if (fin.postFx) fin.postFx.inkDim = ink;                            // 画中世界里柔光收住（见 post.setMood）
    fin.postFx?.setVig?.(this.vigNow(t));                               // 第二十八轮：龙凤撞入时四角压暗一下
  }
  updateCamera(dt) {
    const t = this.t, T = this.T, C = this.camObj, K = this.cams, P = this.player, Fc = F.cam;
    const lerpCam = (a, b, k) => { C.pos.lerpVectors(a.pos, b.pos, k); C.at.lerpVectors(a.at, b.at, k); };
    if (t < T.land.wave[0]) {                                            // 0–0.6：敌人躯干居中，轻推
      const k = smooth(0, T.land.wave[0], t);
      C.pos.copy(K.entry.pos).lerp(K.entry.at, Fc.entry.push * k); C.at.copy(K.entry.at);
    } else if (t < T.scroll.knot[0]) {                                   // 0.6–2.4：拉远升高，看山水由玩家处铺开
      lerpCam(K.entry, K.spread, ease(smooth(T.land.wave[0], T.scroll.knot[0] - 0.15, t)));
    } else if (t < T.walk[0]) {                                          // 2.4–4：画卷由脚下展开、书法逐笔写出
      const k = smooth(T.scroll.knot[0], T.walk[0], t);
      C.pos.copy(K.scroll.pos).addScaledVector(this.dir, 0.8 * k); C.pos.y += Fc.scroll.rise * k; C.at.copy(K.scroll.at);
    } else if (t < T.draw[0]) {                                          // 4–6：侧面跟拍缓步（剑柄、鞘口这一侧）
      const W = Fc.walk, tgt = _v.set(P.pos.x, P.pos.y + W.lookUp, P.pos.z).lerp(_u.set(this.E.x, this.E.y + Math.min(this.size.h * 0.55, 2.2), this.E.z), W.toEnemy);
      const want = _w.copy(P.pos).addScaledVector(this.left, W.side).addScaledVector(this.dir, W.ahead); want.y = P.pos.y + W.up;
      const pos = this.replaced ? want.clone() : this.fin.camFix(tgt, want, 1.4);
      if (this.lastShot !== 'walk') { C.pos.copy(pos); C.at.copy(tgt); } else { C.pos.lerp(pos, Math.min(1, dt * 8)); C.at.lerp(tgt, Math.min(1, dt * 10)); }
    } else if (t < T.sheathe) {                                          // 6–6.5：横向大景，拔刀穿行
      C.pos.copy(K.draw.pos); C.at.copy(K.draw.at);
    } else if (t < T.cam34[1]) {                                         // 6.5–8：绕到玩家身前四分之三（沿弧线，不穿过人）
      const k = ease(smooth(T.cam34[0], T.cam34[1], t)), c = this.Fp;
      const a0 = Math.atan2(K.draw.pos.x - c.x, K.draw.pos.z - c.z), a1 = Math.atan2(K.front.pos.x - c.x, K.front.pos.z - c.z);
      const da = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)), a = a0 + da * k;
      const r0 = Math.hypot(K.draw.pos.x - c.x, K.draw.pos.z - c.z), r1 = Math.hypot(K.front.pos.x - c.x, K.front.pos.z - c.z), r = r0 + (r1 - r0) * k;
      C.pos.set(c.x + Math.sin(a) * r, K.draw.pos.y + (K.front.pos.y - K.draw.pos.y) * k, c.z + Math.cos(a) * r);
      C.at.lerpVectors(K.draw.at, K.front.at, k);
    } else if (t < this.freezeT) {                                       // 8–14.8：身前四分之三，极慢地推近；收刀合拢那一下轻震
      const k = smooth(T.cam34[1], this.freezeT, t), d = K.front.pos.distanceTo(K.front.at);
      C.pos.copy(K.front.pos).lerp(K.front.at, (Fc.front.push * k) / Math.max(1, d)); C.at.copy(K.front.at);
    } else {                                                             // 14.8–15.6：正脸近景（定格）——按头骨的实际位置对准正脸（残心时身子沉、头微低）
      if (!this.closeFixed) {
        this.closeFixed = true;
        const hb = P.char.bones?.[5];
        if (hb) {
          const head = hb.getWorldPosition(new THREE.Vector3()), cl = Fc.close;
          K.close.at = head.clone().add(new THREE.Vector3(0, -0.06, 0)).addScaledVector(this.left, 0.24);
          K.close.pos = head.clone().addScaledVector(this.dir, cl.front).addScaledVector(this.left, cl.side).add(new THREE.Vector3(0, -0.02, 0));
        }
      }
      C.pos.copy(K.close.pos); C.at.copy(K.close.at);
    }
    // 收刀合拢：一下封顶的轻震（不按特效数量叠加）
    if (this.shakeT != null && this.shakeT < 0.35 && !this.frozen) {
      this.shakeT += dt;
      const a = Fc.shake * (1 - this.shakeT / 0.35) * 0.05;
      C.pos.x += (Math.random() - 0.5) * a; C.pos.y += (Math.random() - 0.5) * a; C.at.x += (Math.random() - 0.5) * a * 0.5;
    }
    this.lastShot = t < T.draw[0] && t >= T.walk[0] ? 'walk' : 'other';
    this.setFov(Fc.fov);
  }
  setFov(v) { const cam = this.fin.camera; if (Math.abs(cam.fov - v) > 0.01) { cam.fov = v; cam.updateProjectionMatrix(); } }

  // ---------- 15.6：退场开始——书法、画卷、山水收走（后期叠化：演出最后一帧化开），镜头平滑回到第三人称，音乐 0.5 秒淡出 ----------
  exitBegin() {
    if (this.exited) return;
    this.exited = true;
    const fin = this.fin, post = fin.postFx;
    this.heldN0 = post?.heldN ?? 0;
    this.exitCross = !!post?.captureHold?.();
    fin.sound?.cueStop?.('ml', F.music.fadeOut); this.musicOn = false;
    fin.logE('exit', { t: +this.t.toFixed(3), cross: this.exitCross });
  }
  applyExit(cross) {
    if (this.exitApplied) return;
    this.exitApplied = true; this.crossOK = !!cross;
    const fin = this.fin, P = this.player, cam = fin.cam, camera = fin.camera;
    fin.stage?.exitStart?.(this.crossOK);
    if (this.crossOK) { fin.fx.end(this, false); fin.postFx?.setHold?.(1); } else fin.fx.exitQuiet?.();
    // 镜头：记下演出最后的机位，第三人称照常算、平滑过渡过去（震动偏移归零）
    if (fin.g.freeCam === this.camView) fin.g.freeCam = null;
    cam.shake = 0; cam.kickP?.set(0, 0, 0); cam.kickV?.set(0, 0, 0);
    cam.set(P.heading, this.camSave.pitch, this.camSave.dist);
    cam.snap(new THREE.Vector3(P.pos.x, P.pos.y + 1.55, P.pos.z));
    fin.blend = { t: 0, dur: Math.max(F.cam.blendBack, this.endT - this.t), pos: camera.position.clone(), q: camera.quaternion.clone(), fov: camera.fov, fov1: this.camSave.fov,
      pivot: new THREE.Vector3(P.pos.x, P.pos.y + 1.45, P.pos.z) };
  }

  // ---------- 结束：交还镜头、控制；非最终阶段随后由 Boss 放正常的阶段过场 ----------
  end(reason) {
    if (this.ending) return;
    this.ending = true;
    const fin = this.fin;
    // 跳过：恢复合法站位（身前终点）
    if (reason === 'skip') { this.setPos(this.Fp); this.player.heading = this.face; }
    fin.logE('end', { reason, t: +this.t.toFixed(3) });
    fin.cleanup({ reason });
  }
  dispose(abort) {
    const fin = this.fin, P = this.player, ch = P.char, cam = fin.cam;
    this.hideTarget(false);
    fin.sound?.stopLoop?.('inkDrone', 0.1);
    if (this.musicOn) fin.sound?.cueStop?.('ml', abort ? 0.2 : F.music.fadeOut);
    this.musicOn = false;
    fin.fx.end(this, abort);
    fin.stage?.restore();
    fin.postFx?.setPaper?.(0); fin.postFx?.dropHold?.(); fin.postFx?.setVig?.(0); if (fin.postFx) fin.postFx.inkDim = 0;
    ch.inkK = 0; ch.inkHide = false;
    for (const n of this.npcHidden || []) n.showHidden = false;
    document.body.classList.remove('ink-show');
    fin.hud?.showOverlay(false);
    // 镜头：没走到退场（跳过、作废）——由此刻的机位平滑回到第三人称
    const camera = fin.camera;
    if (fin.g.freeCam === this.camView) fin.g.freeCam = null;
    if (!this.exitApplied) {
      cam.shake = 0; cam.kickP?.set(0, 0, 0); cam.kickV?.set(0, 0, 0);
      cam.set(P.heading, this.camSave.pitch, this.camSave.dist);
      cam.snap(new THREE.Vector3(P.pos.x, P.pos.y + 1.55, P.pos.z));
      fin.blend = { t: 0, dur: F.cam.blendBack, pos: camera.position.clone(), q: camera.quaternion.clone(), fov: camera.fov, fov1: this.camSave.fov,
        pivot: new THREE.Vector3(P.pos.x, P.pos.y + 1.45, P.pos.z) };
    }
    // 角色控制：要新的按下事件才出手（按着的左键不续打）
    fin.M.handBack(ch.sheathTilt);
    // 场景音乐：演出期间别处要求过压低（Boss 转阶段）就按它，否则还原
    if (this.duck0) { const snd = fin.sound; if (this.duckOwn) snd.duckMusic = this.duck0; else delete snd.duckMusic; const [k, tm] = this.extDuck || [1, 0.8]; this.duck0.call(snd, k, tm); this.duck0 = null; }
    fin.flushToasts?.();
  }
}

// =====================================================================================
// 墨势界面：剑诀栏右上的一枚小签（不挡画面中央的敌人动作与攻击预警）；演出时只有上下两道黑边与「跳过」提示（演出里的字只在画卷与定格的书法里）
// =====================================================================================
class InkHud {
  constructor(fin) {
    this.fin = fin;
    const root = document.querySelector('#combat-hud') || document.querySelector('#hud') || document.body;
    const el = this.el = document.createElement('div');
    el.className = 'ink-tip';
    el.innerHTML = `<i class="seal">墨</i><span class="ct"></span><em class="rd">${F.text.ready}</em><i class="bar"><i></i></i>`;
    root.appendChild(el);
    this.ct = el.querySelector('.ct'); this.bar = el.querySelector('.bar i');
    const ov = this.ov = document.createElement('div');
    ov.className = 'ink-ov';
    ov.innerHTML = `<i class="lb t"></i><i class="lb b"></i><div class="skip">${F.text.skip}</div>`;
    (document.querySelector('#hud') || document.body).appendChild(ov);
    this.last = '';
  }
  update() {
    const f = this.fin, I = f.M?.iai;
    let cls = 'ink-tip', text = '', w = 0;
    if (f.active) cls += ' hide';
    else if (!f.enabled) cls += ' off';
    else if (I && f.ready) {
      const full = F.charge.full, k = Math.min(1, I.charge / full);
      cls += k >= 1 ? ' charge full' : ' charge';
      text = k >= 1 ? F.text.full : `${F.text.charging} ${I.charge.toFixed(1)}／${full.toFixed(1)} 秒`;
      w = k;
    } else if (f.ready) cls += ' ready';
    else text = `墨势：${f.count}／${F.stack.hits}`;
    const key = `${cls}|${text}|${Math.round(w * 100)}`;
    if (key === this.last) return;
    this.last = key;
    this.el.className = cls;
    this.ct.textContent = text;
    this.bar.style.width = `${(w * 100).toFixed(0)}%`;
  }
  showOverlay(on) {
    this.ov.className = on ? 'ink-ov on' : 'ink-ov';
  }
}
