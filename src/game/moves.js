// 修士剑诀（第十七轮重写）：四段普攻（斜斩、反手横斩、突刺、重劈）、Z 拔刀斩（第十九轮，取代蓄力重击）、剑诀（剑气 Q、惊鸿 R、破岳 T、万剑归宗 V、
// 缚灵锁 1、服丹 G）、回血葫芦（2，第十九轮）、闪身（C）、格挡与弹反（右键）、受击反应。宗门、秘境、演武场与第五十层守关战共用这一套。
//
// 时间：一律用游戏时间（dt 已含顿帧的放慢，与帧率无关）。键鼠事件只在按下的那一刻记下「游戏时刻」，下一次更新时处理——顿帧中按下的照样缓冲。
// 输入：只留一个缓冲（PC.input.buffer 秒），新的按键按优先级（闪身 > 格挡 > 剑诀 > 重击 > 普攻）替换旧的，过期丢弃；
//       左键按住 = 持续攻击：到了可接的时刻自动接下一式，第四式收完从第一式再起；松开即停（当前这一下照常打完）；
//       右键：真正进入格挡的那一刻开弹反窗口（按下后缓冲期内进入的才算；与上次开窗不足 parryCooldown 秒的不开），按住为格挡，松开退出；
//       按住右键时不出普攻；松开右键而左键仍按着，在允许的时刻恢复连续攻击。
//       Z 按住纳刀蓄势（可缓步、可闪身——闪身不断蓄力）、松开拔刀出手；Tab 锁定 / 解除。打开界面、失去焦点、过场、换场景时 clearInput 清掉一切按住与缓冲。
// 动作：每一招对应 actors/cultivatorClips.js 里编排的一段动作，招式按动作自己的时间轴推进，画面每帧 seek 到同一时刻，
//       判定在配置的时刻做一次（同一段对同一目标只结算一次）。位移只有一个来源：动作的根运动换成速度交给 player.update（照常碰撞）。
// 取消：PLAYER_MOVES 里每一招各有窗口——接招、格挡、闪身、剑诀；commit 段什么都取消不了；move 之后按方向键即收招走开。
//       剑诀在 release 那一刻才扣灵力、进冷却；前摇里被取消时未放出的判定与特效一并撤掉、不扣灵力，只留 0.4 秒的再按间隔。
// 受伤（defend，由 combat.damage 对玩家结算时调用）：闪身无敌 → 同一段来招只结算一次 → 正面且在弹反窗口里、来招可弹反且正在出手 → 弹反；
//       正面且举着剑、来招可格挡 → 格挡（扣守势、漏伤，守势耗尽破防）；否则受击（按来向、强弱演受击反应）。
import * as THREE from 'three';
import { PLAYER_COMBAT as PC, PLAYER_MOVES as PM, PLAYER_REACT as PR, ATTACK_DEF, INK, PHOENIX, DRAGON } from './combatConfig.js';
import { FINALE } from './inkFinaleConfig.js';
import { wrapAngle } from '../core/math.js';
import { SPEED } from '../actors/player.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _tip = new THREE.Vector3(), _base = new THREE.Vector3();
const DEG = Math.PI / 180;
const SKILLS = new Set(['qi', 'dash', 'heavy', 'ult', 'pill', 'seal', 'gourd', 'phoenix', 'dragon']);
const inWin = (wins, t) => !!wins && wins.some(([a, b]) => t >= a && t <= b);
const lvl = (v, i) => (Array.isArray(v) ? v[Math.min(i, v.length - 1)] : v);
const approach = (a, b, max) => { const d = wrapAngle(b - a); return Math.abs(d) <= max ? b : a + Math.sign(d) * max; };
const smooth01 = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
// 动作里逐帧记下的一条量（第十九轮：拔刀斩的鞘引き）在 t 时刻的值（线性插值；没有就是 0）
function trackAt(T, t) {
  if (!T) return 0;
  const X = T.times, v = T.v, n = X.length;
  if (t <= X[0]) return v[0];
  if (t >= X[n - 1]) return v[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (X[m] <= t) lo = m; else hi = m; }
  return v[lo] + (v[hi] - v[lo]) * (t - X[lo]) / (X[hi] - X[lo]);
}
// 根运动在 t 时刻的值（线性插值；没有根运动的动作为 0）
function rootAt(R, t, out) {
  if (!R) return out.set(0, 0, 0);
  const T = R.times, n = T.length;
  if (t <= T[0]) return out.set(R.x ? R.x[0] : 0, 0, R.z[0]);
  if (t >= T[n - 1]) return out.set(R.x ? R.x[n - 1] : 0, 0, R.z[n - 1]);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
  const u = (t - T[lo]) / (T[hi] - T[lo]);
  return out.set(R.x ? R.x[lo] + (R.x[hi] - R.x[lo]) * u : 0, 0, R.z[lo] + (R.z[hi] - R.z[lo]) * u);
}

export class Moves {
  // combat：战斗（目标、伤害、顿帧、镜头反馈）；fx：招式特效（skillfx.js）；inputDir()：当前方向键的世界方向（无则 null）；
  // usePill()：行囊里扣一枚养元丹，成功返回 true；gourd（第十九轮）：回血葫芦 { left() 还剩几口, max() 装满几口, use() 喝一口（成功返回 true）, refill() 装满 }
  constructor(combat, { player, cam, fx, inputDir, usePill, gourd }) {
    this.combat = combat; this.player = player; this.cam = cam; this.fx = fx;
    this.inputDir = inputDir || (() => null); this.usePill = usePill || (() => false);
    this.gourd = gourd || { left: () => 0, max: () => 0, use: () => false, refill: () => {} };
    this.mp = PC.mp; this.intent = 0;
    // 第二十一轮：灵力上限、出手的伤害倍率随修为等级（progression.applyStats 设定；21 级时与原来相同）
    this.mpMax = PC.mp; this.dmgK = 1;
    this.phoenix = null;                      // 第二十一轮：九霄凤焰（game/phoenix.js），main.js 接上
    this.dragon = null;                       // 第二十三轮：雷龙破虚（game/thunderDragon.js）
    this.finale = null;                       // 第二十五轮：拔刀斩的升级形态「终式·墨·终焉」（game/inkFinale.js：墨势、正式出刀、主目标、处决、演出）
    this.loadout = null;                      // 第二十三轮：主动技能的装备槽（game/loadout.js）；slotCheck 为假时不查（只给旧的自检整套用）
    this.slotCheck = true;
    this.combatHold = () => false;            // 第二十一轮：战斗时钟暂停（第五十层阶段过场）——这时冷却不走
    this.parrySeq = 0;                        // 第二十一轮：真实弹反事件的序号（凤焰弹反按它去重）
    this.cools = { qi: 0, dash: 0, heavy: 0, ult: 0, dodge: 0, pill: 0, seal: 0, gourd: 0, phoenix: 0, dragon: 0 };
    this.iai = null;                          // 拔刀斩的蓄力（纳刀起到出刀，闪身中不断）：{ charge 秒, lv 已到的档, snd 蓄力声 }
    this.tilt = 0;                            // 鞘压平的程度（0 平常 … 1 拔刀斩的角度）
    this.act = null; this.buffer = null; this.ult = null; this.seq = 0;
    this.held = { light: false, guard: false, power: false };
    this.time = 0; this.lastAction = -99; this.lastCombat = -99;
    this.iframes = 0;
    // 格挡与弹反
    this.guarding = false; this.guardT = -99; this.guardHP = PC.guard.max; this.guardUsed = -99; this.guardLock = 0;
    this.parryUntil = -99; this.parryOpenT = -99; this.counterUntil = -99;
    this.resolved = new Map();                // 已结算的来招段（id#段 → 时刻）
    this.reacts = [];                         // 近来受击反应的时刻（连续受击保护）
    this.combo = { n: 0, t: -99, best: 0 };
    this.target = null; this.targetT = -99;   // 近战辅助的目标（选定后一小段时间内不轻易换）
    this.lock = null; this.lockLost = 0;      // Tab 锁定的目标
    this.heal = null;
    this.log = [];                            // 调试：最近的招式与结算
    this.stat = { inputs: 0, parryWindows: 0, parries: 0, blocks: 0, breaks: 0, counters: 0, counterExpired: 0 };
    player.ctl = { lock: false, vx: null, vz: null, yaw: null, turn: 18, maxSpeed: null };
  }
  get anim() { return this.player.char.anim; }
  get busy() { return !!this.act; }
  get ready() { return !!this.anim; }
  get parrying() { return this.guarding && this.time <= this.parryUntil; }
  get countering() { return this.time <= this.counterUntil; }
  // 第二十二轮：这一刀能不能吃反击强化（窗口还在、是普攻或拔刀斩）
  counterFor(a) { return this.countering && PC.guard.counterMoves.includes(a.key); }
  // 打中了：用掉（不叠层；同一刀的其他目标、之后的命中都不再有），记下是哪一段打出的
  useCounter(a, e, dmg, idx = 0) {
    this.counterUntil = -99;
    a.countered = idx;
    this.stat.counters++;
    this.lastCounter = { t: this.time, key: a.key, target: e.cfg?.name || e.kind, dmg: Math.round(dmg), evt: this.counterEvt ?? null, sinceParry: +(this.time - (this.counterFrom ?? this.time)).toFixed(3) };
    this.fx.counterUsed?.(this.player, e);
  }
  cost(k) { return k === 'phoenix' ? (this.phoenix ? this.phoenix.cost() : this.mpMax * PHOENIX.mpCost) : k === 'dragon' ? this.mpMax * DRAGON.mpCost : PC.skills[k]?.mp ?? 0; }
  // HUD：每格的冷却比例（0 好了 … 1 刚用过）、灵力够不够；蓄力档位；放出之前的灵力（灵力条上的预扣）
  slot(k) {
    const S = PC.skills[k], c = this.cools[k] ?? 0;
    return { cool: S?.cooldown ? Math.min(1, c / S.cooldown) : 0, left: c, mp: this.cost(k) <= this.mp, intent: k === 'ult' ? this.intent / PC.intent : 1 };
  }
  get pendingMp() { const a = this.act; return a && SKILLS.has(a.key) && !a.released ? this.cost(a.key) : 0; }
  // 第十九轮：拔刀斩的蓄力（HUD 用）{ k 蓄力比例 0 … 1, secs 秒, lv 已到的档 }，没在蓄时 null；回血葫芦还剩几口、装满几口
  // 第二十五轮：有墨势时满蓄力为 3 秒（full），HUD 的外圈按它填；ink 为真表示这次蓄力按升级形态算
  get iaiCharge() { const I = this.iai; if (!I) return null; const f = this.finale?.chargeFull?.(), full = f ?? PC.iai.max; return { k: Math.min(1, I.charge / full), secs: I.charge, lv: I.lv, full, ink: f != null }; }
  get gourdLeft() { return this.gourd.left(); }
  get gourdMax() { return this.gourd.max(); }
  refillGourd() { this.gourd.refill(); }

  // =====================================================================================
  // 输入（键鼠事件 → 缓冲；实际出招在 update 里）
  // =====================================================================================
  // kind：light | guard | power（Z 拔刀斩）| dodge | qi | dash | heavy | ult | pill | seal | gourd | lock；down：按下 / 松开
  press(kind, down = true) {
    // 第二十五轮：处决演出接管期间——普攻、技能、蓄力、格挡的输入一律不进来（按下不记、松开只清按住的状态）；恢复后要新的按下才出手
    if (this.finale?.active) { if (kind in this.held) this.held[kind] = false; return; }
    // 第二十三轮：占槽的主动技能只有装备着才放得出来（槽键、中键、剑诀栏与触屏的按钮都先经装备槽；这里再挡一次——卸下之后任何旧的入口都放不出来）
    if (down && this.loadout && this.slotCheck && this.loadout.isSlotSkill(kind) && !this.loadout.equipped(kind)) { this.fx.deny?.(kind, 'unequipped'); if (kind === 'power') this.held.power = false; return; }
    if (kind === 'light') this.held.light = down;
    else if (kind === 'guard') { this.held.guard = down; if (!down) { this.releaseGuard(); return; } }
    else if (kind === 'power') { this.held.power = down; if (!down) return; }
    if (!down) return;
    if (kind === 'lock') { this.toggleLock(); return; }
    // 第二十一轮：打坐、聚气时出手——先收功起身 / 中断聚气（这一下只起身，不出剑）
    if (this.player.meditate && this.onStillPress && !this.combat.ui.busy && !this.combat.ui.panelOpen && this.combat.playerUnit.alive) {
      this.onStillPress(kind);
      if (kind === 'light' || kind === 'power') this.held[kind] = false;
      return;
    }
    if (!this.inputOk()) { if (kind !== 'light') this.held[kind] = false; return; }
    const cat = SKILLS.has(kind) ? 'skill' : kind, P = PC.input.prio, b = this.buffer;
    if (b && this.time - b.t <= PC.input.buffer && P[b.cat] > P[cat]) return;     // 已缓冲的更要紧：留着它
    this.buffer = { kind, cat, t: this.time };
    this.stat.inputs++;
    // 第二十六轮：右键能举剑就在按下的这一刻举（不等下一帧处理缓冲）——弹反窗口从按下起算
    if (kind === 'guard' && !this.legacyParry && !this.guarding && this.canStart('guard')) { this.buffer = null; this.enterGuard(true); }
  }
  // 兼容旧的调用（触屏、剑诀栏的点击）
  input(kind) { if (kind === 'guard') return; this.press(kind, true); if (kind === 'light') this.held.light = false; return true; }
  inputOk() { return this.ready && this.combat.canAct() && !this.player.flying && !this.player.meditate; }
  // 清掉一切按住与缓冲（打开界面、失去焦点、过场、换场景、结算）
  clearInput() {
    this.buffer = null;
    this.held.light = this.held.power = false;
    if (this.held.guard) { this.held.guard = false; this.releaseGuard(); }
    if (this.act?.key === 'iai') this.endAct('cancel');             // 蓄势中失焦 / 打开界面：作废这次蓄力（不当作松开 Z 出刀）
    this.dropIai();                                                   // 闪身中（蓄力未断）也一样
  }
  setGuard(v) { this.press('guard', !!v); }

  // =====================================================================================
  // 每帧（player.update 之前）
  // =====================================================================================
  update(dt) {
    this.time += dt;
    this.combat.tickLateParry?.();                // 第二十六轮：挂起的来招到时没弹 → 照原来的受击结算
    // 第二十一轮：冷却按战斗时钟走（第五十层阶段过场中暂停，过场后继续原来的剩余时间）
    const cdt = this.combatHold() ? 0 : dt;
    for (const k in this.cools) this.cools[k] = Math.max(0, this.cools[k] - cdt);
    this.iframes = Math.max(0, this.iframes - dt);
    const P = this.player, ctl = P.ctl, G = PC.guard;
    const inBattle = this.combat.state === 'battle';
    this.mp = Math.min(this.mpMax, this.mp + (inBattle ? PC.mpRegen : PC.mpRegenIdle) * dt);
    if (this.time - this.lastCombat > PC.intentHold && !inBattle) this.intent = Math.max(0, this.intent - PC.intentDecay * dt);
    if (this.time - this.combo.t > PC.comboWindow) this.combo.n = 0;
    // 守势：停手一会儿开始回（举着剑回得慢）；破防的锁定结束时先回到三成半
    if (this.guardBroken && this.time >= this.guardLock) { this.guardBroken = false; this.guardHP = Math.max(this.guardHP, G.max * 0.35); }
    if (this.time - this.guardUsed > G.regenDelay && this.time >= this.guardLock) this.guardHP = Math.min(G.max, this.guardHP + (this.guarding ? G.regenHold : G.regen) * dt);
    if (this.heal) { const k = Math.min(dt, this.heal.left); this.heal.left -= k; this.combat.healPlayer(this.heal.rate * k); if (this.heal.left <= 0) this.heal = null; }
    for (const [k, t] of this.resolved) if (this.time - t > 4) this.resolved.delete(k);
    if (this.iai) this.tickIai(dt);
    this.updateUlt(dt);
    this.updateLock(dt);
    // 不能出手（对话、界面、过场、御剑、打坐、力竭）：收招、放下剑、清掉输入
    if (!this.inputOk()) {
      if (this.act && this.act.key !== 'knockdown') this.endAct('blocked');
      if (this.guarding) this.exitGuard();
      this.buffer = null; this.held.light = this.held.power = false;
    }
    // 缓冲过期
    if (this.buffer && this.time - this.buffer.t > PC.input.buffer) this.buffer = null;
    if (this.buffer) this.tryBuffer();
    // 右键一直按着：允许时举剑（这时不再开弹反窗口——要弹反须重新按下）
    if (this.held.guard && !this.guarding && this.canStart('guard')) this.enterGuard(false);
    // 左键一直按着：到了可接的时刻自动接下一式（举着剑时不出）
    if (this.held.light && !this.held.guard && !this.guarding && !this.buffer && this.canStart('light')) this.doLight(true);
    // 推进当前招式
    ctl.vx = ctl.vz = null;
    if (this.act) this.step(dt);
    if (!this.act) { ctl.lock = false; ctl.yaw = null; }
    this.guardAnimTick();
    this.combat.syncGuard?.();
    const a = this.act;
    // 佩剑在手：出招、举剑、刚出过手、交战中（含切磋、守关战）。由平常站姿转为交战时演一下拔剑入势（站着、没在出招时）；
    // 拔剑动作里握住剑柄的那一刻剑才出鞘
    const fight = inBattle || !!this.combat.duelBoss || this.combat.bossFight;
    const want = !!(a && a.key !== 'pill' && a.key !== 'gourd' && a.key !== 'knockdown') || this.guarding || this.time - this.lastAction < PC.sheathDelay || !!this.ult || fight;
    if (want && !this.wasDrawn && !a && !this.guarding && !this.inputDir() && P.onGround && fight && this.inputOk()) { this.start('draw'); }
    const a2 = this.act;
    P.drawn = a2?.key === 'draw' ? a2.t >= PM.draw.grab : want;
    this.wasDrawn = want;
    this.iaiLook(a2, dt);
    // 葫芦：取下（hand[0] 前后 0.1 秒）由腰间渐渐换到手中，放回时反过来；喝到一半被打断的，0.12 秒内收回腰间
    const gk = a2?.key === 'gourd' ? smooth01((a2.t - PM.gourd.hand[0] + 0.04) / 0.1) * (1 - smooth01((a2.t - PM.gourd.hand[1] + 0.06) / 0.1)) : 0;
    this.gourdK = (this.gourdK ?? 0) + Math.max(-dt / 0.12, Math.min(dt / 0.06, gk - (this.gourdK ?? 0)));
    P.char.gourdInHand = this.gourdK;
    P.bladeGlow = a && !a.react && !['dodge', 'pill', 'gourd', 'iai'].includes(a.key) ? 1 : this.guarding ? 0.4 : 0;
    P.action = a ? a.key : this.guarding ? 'guard' : null;
    // 举剑时朝锁定的目标（没有锁定时朝镜头方向，见 player.update）
    P.aimYaw = this.lock?.alive ? Math.atan2(this.lock.pos.x - P.pos.x, this.lock.pos.z - P.pos.z) : null;
  }

  // 处理缓冲的输入：能做就做并清掉，做不了就留着（直到过期）
  tryBuffer() {
    const b = this.buffer, k = b.kind;
    if (k === 'dodge') { if (this.canStart('dodge') && this.cools.dodge <= 0) { this.buffer = null; this.doDodge(); } return; }
    if (k === 'guard') { if (this.canStart('guard')) { this.buffer = null; this.enterGuard(true); } return; }
    if (this.held.guard || this.guarding) return;                       // 举着剑：先不出招（缓冲照常倒数）
    if (k === 'light') { if (this.canStart('light')) { this.buffer = null; this.doLight(false); } return; }
    if (k === 'power') { if (this.canStart('power')) { this.buffer = null; this.startIai(); } return; }
    if (SKILLS.has(k) && this.canStart('skill')) { this.buffer = null; this.doSkill(k); }
  }

  // 此刻能不能做 cat（light / power / skill / dodge / guard）
  canStart(cat) {
    const a = this.act;
    if (cat === 'guard' && (this.time < this.guardLock || this.player.flying)) return false;
    if (!a) return true;
    const D = a.def, t = a.t;
    if (a.react) {
      const R = a.R;
      if (cat === 'dodge') return R.dodgeAfter != null && t >= R.dodgeAfter;
      if (cat === 'guard') return R.guardAfter != null && t >= R.guardAfter && this.time >= this.guardLock;
      return false;
    }
    if (a.key === 'knockdown') return false;
    if (D.commit && t >= D.commit[0] && t < D.commit[1]) return false;
    if (cat === 'light') return !!D.chain && t >= D.chain[0] && t <= D.chain[1] + 0.05;
    if (cat === 'power' || cat === 'skill') return inWin(D.cancel?.skill, t) || (!!D.chain && t >= D.chain[0]);
    if (cat === 'dodge') return inWin(D.cancel?.dodge, t);
    if (cat === 'guard') return inWin(D.cancel?.guard, t);
    return false;
  }

  // =====================================================================================
  // 出招
  // =====================================================================================
  doLight() {
    const a = this.act, D = a && a.def;
    const key = a && D.next && D.chain && a.t >= D.chain[0] ? D.next : 'light1';
    this.start(key);
  }
  // 剑诀：冷却、灵力、剑意不够时提示（这一下作废）；够就起手（灵力与冷却到放出时才扣）
  doSkill(kind) {
    const S = PC.skills[kind];
    const W = this.combat.worldName;
    if ((W === 'alchemy' || W === 'hall' || W === 'tower') && ['qi', 'dash', 'heavy', 'ult', 'seal', 'phoenix', 'dragon'].includes(kind)) { this.fx.deny?.(kind, 'indoor'); return false; }
    // 第二十三轮：雷龙破虚——冷却、灵力先查（免得调息中按一下也亮出红圈）；再查解锁、素材、只能一条、选点（不合法：地上红圈与原因，不起手、不扣费）
    if (kind === 'dragon') {
      if ((this.cools.dragon ?? 0) > 0) { this.fx.deny?.(kind, 'cool'); return false; }
      if (this.mp < this.cost('dragon')) { this.fx.deny?.(kind, 'mp'); return false; }
      const c = this.dragon ? this.dragon.canCast() : { ok: false, reason: 'dragonAsset' };
      if (!c.ok) { this.fx.deny?.(kind, c.reason, c.text); return false; }
    }
    // 第二十一轮：九霄凤焰——未解锁（金丹初期）、素材没载入、已有一只凤凰时不起手
    if (kind === 'phoenix') { const c = this.phoenix ? this.phoenix.canCast() : { ok: false, reason: 'asset' }; if (!c.ok) { this.fx.deny?.(kind, c.reason); return false; } }
    if ((this.cools[kind] ?? 0) > 0) { this.fx.deny?.(kind, 'cool'); return false; }
    if (this.cost(kind) && this.mp < this.cost(kind)) { this.fx.deny?.(kind, 'mp'); return false; }
    if (kind === 'ult' && this.intent < PC.intent) { this.fx.deny?.(kind, 'intent'); return false; }
    if (kind === 'pill') {
      const U = this.combat.playerUnit;
      if (U.hp >= U.maxHp - 0.5) { this.fx.deny?.(kind, 'full'); return false; }
      if (!this.combat.pillCount?.()) { this.fx.deny?.(kind, 'none'); return false; }
    }
    if (kind === 'gourd') {
      const U = this.combat.playerUnit;
      if (U.hp >= U.maxHp - 0.5) { this.fx.deny?.(kind, 'sated'); return false; }
      if (this.gourd.left() < 1) { this.fx.deny?.(kind, 'empty'); return false; }
    }
    return this.start(kind);
  }

  // 起一招：上一招就此收住（未放出的判定与特效撤掉），动作切到这一招（交叉淡化很短，接招时首尾姿势本就相接）
  // o：{ clip 换一段动作, fade 淡入秒数, loop 循环（第十九轮：拔刀斩闪身后接回蓄势）, level }
  start(key, o = {}) {
    const D = PM[key];
    if (!D) return false;
    const P = this.player, prev = this.act, lmb0 = this.held.light;
    if (prev) this.endAct(prev.key.startsWith('light') && key.startsWith('light') ? 'chain' : 'cancel', key);
    if (this.guarding) this.exitGuard();
    // 第二十二轮：九霄凤焰的舞刀——普攻持续按住的左键、还没出的普攻缓冲都不带进来（施法中重新按下的左键由凤凰记作操控意图）
    if (key === 'phoenix') { this.held.light = false; if (this.buffer?.kind === 'light') this.buffer = null; }
    const from = D.from ?? 0;
    const clip = o.clip || D.clip;
    // 交叉淡化：接招很短（首尾姿势本就相接）；由平常站姿（左脚在前）直接出招时略长，换步不显得一下跳过去
    const relaxed = !prev && !this.player.drawn;
    this.anim.play(clip, { from, to: D.end ?? undefined, speed: D.speed ?? 1, manual: true, hold: true, fade: o.fade ?? (prev ? 0.07 : relaxed ? 0.16 : 0.1), mask: D.mask || 'full', loop: o.loop ?? D.loop ?? false });
    const a = this.act = { key, def: D, clip, t: from, t0: this.time, id: ++this.seq, hitDone: new Set(), hitSet: new Set(), released: D.release == null,
      level: o.level ?? 0, hold: 0, rootPrev: new THREE.Vector3(), aimT: null, swung: false, wallDone: false, results: [] };
    if (key === 'phoenix') a.lmbHeld = lmb0;             // 第二十二轮：起手时左键原本就按着（普攻连按）——不算凤凰的操控，要先松开
    rootAt(this.player.char.clips[clip]?.data?.root, from, a.rootPrev);
    // 近战辅助：小距离、小角度内挑一个（选定的不轻易换）；锁定的目标在辅助距离内时以它为准
    a.target = this.pickAssist(D.assist ?? PC.aim.range);
    // 第十八轮：普攻判定加长后，目标若在这一式自带的前冲够不着的地方，前冲按需要拉长（最多 aim.lunge 倍），
    // 剑真的扫到人身上，而不是隔空打中；仍停在目标身前 0.75 米（applyRoot）
    a.lungeK = 1;
    if (a.target && D.hits?.length && key.startsWith('light')) {
      const R = P.char.clips[clip]?.data?.root, T = a.target;
      if (R) {
        const fw = rootAt(R, D.hits[0].t, new THREE.Vector3()).z - a.rootPrev.z;
        const need = Math.hypot(T.pos.x - P.pos.x, T.pos.z - P.pos.z) - T.radius - 0.75;
        if (fw > 0.1 && need > fw) a.lungeK = Math.min(PC.aim.lunge ?? 1, need / fw);
      }
    }
    this.lastAction = this.time;
    this.fx.moveStart?.(key, a);
    this.logAct(a);
    void P;
    return true;
  }

  // 收招：done 放完 / chain 接下一式 / cancel 被取消 / move 走开 / blocked 不能出手 / react 被打断；next：接着起的那一招（start 传进来）
  endAct(reason = 'done', next = null) {
    const a = this.act;
    if (!a) return;
    this.act = null;
    const ctl = this.player.ctl;
    ctl.lock = false; ctl.vx = ctl.vz = null; ctl.yaw = null; ctl.maxSpeed = null;
    // 前摇里被取消：未放出的不扣灵力，留 0.4 秒再按间隔；未出手的判定、延迟伤害、未放出的特效一并撤掉
    // 第二十三轮：雷龙破虚提交前取消或终检不通过——不扣灵力、不进冷却，也不加这 0.4 秒（选点不合法不是乱按）
    if (!a.released && SKILLS.has(a.key) && a.key !== 'dragon') this.cools[a.key] = Math.max(this.cools[a.key] ?? 0, 0.4);
    // 第十九轮：拔刀斩的蓄势被闪身接过去、闪身后接回蓄势时蓄力不断；出刀（startIaiSlash 先收走了蓄力）以外的一切收招都作废这次蓄力
    if (this.iai && (a.key === 'iai' || a.key === 'dodge') && next !== 'dodge' && next !== 'iai' && next !== 'iai_slash') this.dropIai();

    if (a.key === 'phoenix') { this.anim.free = 0; if (!a.released) this.phoenix?.cancelCast?.(reason, a); }
    if (a.key === 'dragon' && !a.released) this.dragon?.cancelCast?.(reason, a);        // 第二十三轮：起势中取消——撤掉预览（不扣费）
    this.fx.moveEnd?.(a.key, a, reason);
    a.endReason = reason; a.endT = this.time;
    if (reason !== 'chain') this.anim.stop(reason === 'done' ? 0.22 : reason === 'move' ? 0.2 : 0.1);
  }

  // =====================================================================================
  // 第十九轮：拔刀斩（居合）。按住 Z：纳刀（剑收入鞘，0.18 秒入鞘）→ 蓄势（沉身按柄、左手把鞘压平；可缓步、可闪身）；松开 Z：拔刀横斩。
  // 蓄力 = 按住的秒数（闪身中照算，max 封顶）；蓄满再撑 grace 秒自动出刀；伤害等按蓄力比例插值（iaiVal）
  // =====================================================================================
  // resume：闪身之后接着蓄（不再演纳刀，直接淡回蓄势）
  startIai(resume = false) {
    const P = this.player, wasDrawn = P.char.drawn > 0.5;
    if (!this.start('iai', resume ? { clip: 'iai_hold', fade: 0.14, loop: true } : {})) return false;
    const a = this.act;
    a.phase = resume ? 'hold' : 'enter'; a.wasDrawn = !resume && wasDrawn;
    a.vel = new THREE.Vector3(P.vel.x, 0, P.vel.z); a.walking = false; a.walkPh = 0; a.holdT = 0;
    if (!resume) {
      this.iai = { charge: 0, lv: 0, t0: this.time };
      this.iai.snd = this.combat.sound?.play('iaiCharge', { at: P.pos });
      this.fx.iaiBegin?.(P);
    }
    this.logEvent(a, resume ? 'resume' : 'sheathe');
    return true;
  }
  // 蓄力：纳刀起一直累积（闪身中照算）；过一档鞘口亮一圈光
  // 第二十五轮：有墨势时只有两档（1.5、3 秒），3 秒即满蓄力（满蓄力反馈：墨笔一齐扫进剑柄、鞘口一道亮边，另有终式的提示音与鞘口墨环）
  tickIai(dt) {
    const I = this.iai, C = PC.iai, full = this.finale?.chargeFull?.() ?? null;
    I.charge += dt;
    const levels = full != null ? FINALE.charge.levels : C.levels;
    const lv = levels.filter((x) => I.charge >= x).length;
    if (lv > I.lv) {
      I.lv = lv; this.fx.iaiLevel?.(this.player, lv, lv >= levels.length);
      if (full != null && lv >= levels.length && !I.inkFull) { I.inkFull = true; this.finale?.onFullCharge?.(); this.logEvent(this.act || {}, 'inkFull', { charge: +I.charge.toFixed(3) }); }
    }
    this.fx.iaiTick?.(this.player, Math.min(1, I.charge / (full ?? C.max)), dt);
  }
  // 作废这次蓄力：蓄力声淡出，特效收掉
  dropIai() {
    const I = this.iai;
    if (!I) return;
    this.iai = null;
    I.snd?.stop(0.15);
    this.fx.iaiEnd?.(this.player, false);
  }
  // 蓄势中：纳刀演完换成蓄势循环；方向键缓步（缓起缓停，走时朝走的方向、站着时朝对手 / 镜头方向）；松开 Z（剑已入鞘）或撑到头即出刀
  stepIai(dt) {
    const a = this.act, P = this.player, ctl = P.ctl, C = PC.iai, ch = P.char;
    a.t += dt;
    ctl.lock = true;
    if (a.phase === 'enter' && a.t >= ch.clips.iai_enter.dur) {
      a.phase = 'hold';
      this.anim.play('iai_hold', { from: 0, loop: true, manual: true, hold: true, fade: 0.12 });
    }
    const dir = a.phase === 'enter' ? null : this.inputDir();
    const k = 1 - Math.exp(-8 * dt);
    a.vel.x += ((dir ? dir.x * C.walk : 0) - a.vel.x) * k; a.vel.z += ((dir ? dir.z * C.walk : 0) - a.vel.z) * k;
    ctl.vx = a.vel.x; ctl.vz = a.vel.z;
    const sp = Math.hypot(a.vel.x, a.vel.z);
    if (dir && sp > 0.2) P.heading = approach(P.heading, Math.atan2(a.vel.x, a.vel.z), C.turn * dt);
    else this.faceAim(a, C.turn, dt);
    // 动作：纳刀按时刻；之后站着放蓄势循环、走着放缓步循环（按实际速度推进步子，脚不在地上滑）
    if (a.phase === 'enter') this.anim.seek(a.t);
    else {
      const walking = a.walking ? sp > 0.15 : sp > 0.4;
      if (walking !== a.walking) {
        a.walking = walking;
        this.anim.play(walking ? 'iai_walk' : 'iai_hold', { from: walking ? a.walkPh : a.holdT, loop: true, manual: true, hold: true, fade: 0.18 });
      }
      if (walking) { a.walkPh = (a.walkPh + dt * sp / (ch.clips.iai_walk.data.marks?.speed ?? 1.2)) % 1; this.anim.seek(a.walkPh); }
      else { a.holdT = (a.holdT + dt) % ch.clips.iai_hold.dur; this.anim.seek(a.holdT); }
    }
    // 出刀：剑入鞘之后才拔得出来。第二十五轮：有墨势时蓄满之后保持就绪、不自动出刀（没有墨势时照旧：蓄满再撑 grace 秒自动出刀）
    const ready = a.phase !== 'enter' || a.t >= ch.clips.iai_enter.data.marks.sheathed;
    const auto = this.finale?.chargeFull?.() == null && this.iai.charge >= C.max + C.grace;
    if (ready && (!this.held.power || auto)) this.startIaiSlash();
  }
  // 出刀：收走蓄力，按蓄力比例 k 定这一刀的伤害、范围、前冲；出鞘声的最响处对上判定
  startIaiSlash() {
    const I = this.iai, P = this.player, C = PC.iai;
    if (!I) return false;
    const k = Math.min(1, I.charge / C.max), fromStance = this.act?.key === 'iai';
    this.iai = null;
    I.snd?.stop(0.1);
    this.fx.iaiEnd?.(P, true);
    if (!this.start('iai_slash', { fade: fromStance ? 0.03 : 0.08 })) return false;       // 第二十轮：由蓄势出刀几乎不淡（出刀第一帧就是蓄势的姿势）
    const a = this.act, D = a.def;
    // 第二十五轮：正式出刀事件——有墨势且蓄满 3 秒即升级形态（同一事件里消耗墨势、建立唯一的攻击实例；费用与冷却沿用拔刀斩：都没有），
    // 这一刀按满蓄力（k = 1）取范围、失衡、击退、架势、前冲、剑气；刀身伤害另乘技能倍率（strike）
    const fin = this.finale?.formalDraw?.(I, a) || null;
    a.finale = fin;
    const kk = fin ? 1 : k;
    a.iaiK = kk; a.iaiPow = Math.pow(kk, C.curve); a.charge = I.charge;
    a.lungeK = 1 + C.lunge * kk;
    this.combat.sound?.play('iaiDraw', { at: P.pos, offset: Math.max(0, PC.sfx.drawPeak - D.hits[0].t / (D.speed ?? 1)) });
    this.fx.iaiDraw?.(P, kk);
    this.logEvent(a, 'draw', { ratio: +k.toFixed(3), charge: +I.charge.toFixed(2), ink: fin ? fin.id : null });
    return true;
  }
  // 第二十五轮：处决演出接管——清掉普攻缓冲、按住、蓄力与当前这一招（这一招的判定早已结算，不再放出任何东西）；角色站住，由演出驱动
  handOver() {
    this.buffer = null;
    this.held.light = this.held.power = false;
    if (this.held.guard) { this.held.guard = false; this.releaseGuard(); }
    if (this.guarding) this.exitGuard();
    this.dropIai();
    const a = this.act;
    if (a) { this.act = null; a.endReason = 'finale'; a.endT = this.time; this.fx.moveEnd?.(a.key, a, 'finale'); }
    const ctl = this.player.ctl;
    ctl.lock = true; ctl.vx = ctl.vz = 0; ctl.yaw = null; ctl.maxSpeed = null;
    this.anim.free = 0;
  }
  // 演出结束：交还控制——一切按住与缓冲清空（按着的左键不续打，要新的按下）；剑已收入鞘（不立刻再拔），鞘由演出最后的角度平滑转回
  handBack(tilt = 0) {
    this.buffer = null;
    this.held.light = this.held.power = this.held.guard = false;
    const ctl = this.player.ctl;
    ctl.lock = false; ctl.vx = ctl.vz = null; ctl.yaw = null; ctl.maxSpeed = null;
    this.tilt = tilt;
    this.lastAction = -99; this.wasDrawn = false;
    this.player.drawn = false;
    this.anim.stop(0.25);
  }
  // 两元数组 [蓄力为 0, 蓄满] 按这一刀的蓄力插值（不是数组的照原样）
  iaiVal(a, v) { return Array.isArray(v) ? v[0] + (v[1] - v[0]) * (a.iaiPow ?? 0) : v; }
  intentOf(a) { return this.iaiVal(a, a.def.intent ?? 4); }
  // 拔刀斩的佩剑与鞘：纳刀（0.18 秒剑入鞘）、蓄势、闪身（蓄力未断）时剑在鞘中，左手把鞘压平（sheathTilt → 1）；出刀的那一刻剑出鞘。
  // 这几段换手不淡入淡出（drawnSnap）：入鞘、出鞘那一帧手中的剑与鞘中的剑重合，淡过去反而会看见两把剑
  // 第二十轮：鞘还在蓄势的位置（sheathPose 0）与出刀的位置（1）之间转——纳刀、出刀按动作里记下的，蓄势、缓步、闪身中是蓄势的位置
  iaiLook(a, dt) {
    const P = this.player, ch = P.char;
    let tilt = 0, snap = false, pull = 0, sp = 1;
    if (a?.key === 'iai') {
      snap = true;
      if (a.phase === 'enter') { const M = ch.clips.iai_enter.data.marks; P.drawn = a.wasDrawn && a.t < M.sheathed; tilt = smooth01(a.t / M.tilt); this.tilt = tilt; sp = ch.clips.iai_enter.data.sheathPose ? trackAt(ch.clips.iai_enter.data.sheathPose, a.t) : 1; }
      else { P.drawn = false; tilt = 1; sp = 0; }
    } else if (a?.key === 'dodge' && this.iai) { snap = true; P.drawn = false; sp = 0; }
    else if (a?.key === 'iai_slash') {
      snap = true;
      P.drawn = a.t >= ch.clips.iai_slash.data.marks.draw && (this.anim.cur?.w ?? 1) >= 0.85;
      tilt = 1 - smooth01((a.t - 0.22) / 0.28);
      pull = trackAt(ch.clips.iai_slash.data.pull, a.t);              // 鞘引き：左手把鞘往后拉，与动作同步
      sp = ch.clips.iai_slash.data.sheathPose ? trackAt(ch.clips.iai_slash.data.sheathPose, a.t) : 1;
    }
    const step = dt / 0.08;
    this.tilt += Math.max(-step, Math.min(step, tilt - this.tilt));
    if (ch.clips) { ch.drawnSnap = snap; ch.sheathTilt = this.tilt; ch.sheathPull = pull; ch.sheathPose = sp; }
  }
  // 回血：与还没回完的（服丹、上一口葫芦）合在一起，按两者里较长的时长回完
  addHeal(amount, secs) {
    const H = this.heal;
    if (H) { const T = Math.max(H.left, secs); this.heal = { rate: (H.rate * H.left + amount) / T, left: T }; } else this.heal = { rate: amount / secs, left: secs };
  }

  // 第十九轮：喝葫芦——动作只盖左臂与头颈，人照常走（只是慢：maxSpeed）；不锁朝向、不给强制速度
  stepGourd(dt) {
    const a = this.act, D = a.def, P = this.player, ctl = P.ctl, S = D.sfx, snd = this.combat.sound;
    const t0 = a.t;
    a.t += dt * (D.speed ?? 1);
    const t1 = a.t;
    ctl.lock = false; ctl.vx = ctl.vz = null; ctl.yaw = null; ctl.maxSpeed = D.maxSpeed;
    if (!a.released && t1 >= D.release) this.release(a);
    if (t0 < S.open && t1 >= S.open) snd?.play('gourdOpen', { at: P.pos });
    if (t0 < S.gulp && t1 >= S.gulp && a.drank) snd?.play('gulp', { at: P.pos });
    if (t0 < S.close && t1 >= S.close) snd?.play('gourdClose', { at: P.pos });
    this.anim.seek(a.t);
    if (t1 >= D.end) this.endAct('done');
  }

  // 第二十二轮：九霄凤焰的舞刀起手（cast_phoenix，时间轴见 PHOENIX.cast）。
  // 可以走：离刀前限速为步行速度 × cast.walk，下身让给走路的动作（anim.free），上身照舞；没在走、或到了最后一刀，朝瞄准方向。
  // 时间轴上的事件（显形、绕完、汇向刀尖、离刀发射、收势）都按这一招的时刻跨过时触发一次——暂停时不走、顿帧时放慢，不会重复；
  // 离刀（release）：扣灵力、进冷却、凤凰离刀（快照、飞行计时、碰撞、投火、操控都从这一刻起，见 phoenix.release）
  stepPhoenix(dt) {
    const a = this.act, D = a.def, P = this.player, ctl = P.ctl, K = PHOENIX.cast;
    const t0 = a.t;
    a.t += dt * (D.speed ?? 1);
    const t1 = a.t;
    const moving = !!this.inputDir(), launched = a.released;
    ctl.lock = false; ctl.vx = ctl.vz = null;
    ctl.maxSpeed = launched ? null : SPEED.walk * K.walk;
    const swing = t1 >= K.swing && !launched;
    ctl.yaw = !moving || swing ? this.aimYaw(a) : null;
    ctl.turn = swing ? 16 : 10;
    a.walked = (a.walked || 0) + (moving && !launched ? dt : 0);
    // 下身：走的时候让给走路的动作（离刀后照常走，收势里不再压着腿）
    const freeW = moving || launched ? 1 : 0;
    this.anim.free += (freeW - this.anim.free) * (1 - Math.exp(-dt * 12));
    if (!a.released) this.phoenix?.castStep?.(a, t0, t1, dt);       // 离刀之前：时间轴上的事件（离刀之后凤凰自己飞）
    if (!a.released && t1 >= D.release) this.release(a);
    this.anim.seek(a.t);
    if (!this.act) return;
    if (a.released && t1 >= D.move && moving) { this.endAct('move'); return; }
    if (t1 >= D.end) this.endAct('done');
  }

  // 第二十三轮：雷龙破虚的起势（cast_dragon）。0.65 秒之前每帧更新选点与预览（锁定的敌人走动、准星移动），人朝选点转；可被格挡、闪身取消（不扣费）。
  // 0.65 秒提交：终检（活着、已装备已习得、灵力冷却、30 米、无遮挡、有地面、上方空间、地图内）通过才扣灵力、进冷却、开演出（release）；
  // 不通过就作废这一招（不扣费；地上的红圈与原因由 dragon 留一会儿）。提交之后马上可以走、出剑、闪身、格挡
  stepDragon(dt) {
    const a = this.act, D = a.def, P = this.player, ctl = P.ctl;
    const t0 = a.t;
    a.t += dt * (D.speed ?? 1);
    const t1 = a.t;
    ctl.lock = true;
    if (!a.released) {
      this.dragon?.castStep?.(a, t0, t1, dt);
      const yaw = this.dragon?.aimYaw?.();
      if (yaw != null) P.heading = approach(P.heading, yaw, (D.turn?.[0] ?? 10) * dt);
      if (t1 >= D.release) {
        const r = this.dragon ? this.dragon.commit(a) : { ok: false, text: '雷龙素材没载入' };
        if (!r.ok) { a.commitFail = r; this.fx.deny?.('dragon', r.reason || 'dragonPoint', r.text); this.endAct('cancel'); return; }
        this.release(a);
      }
    }
    if (ctl.vx == null) { ctl.vx = 0; ctl.vz = 0; }
    this.anim.seek(a.t);
    if (!this.act) return;
    const mv = this.inputDir();
    if (a.released && t1 >= D.move && mv) { this.endAct('move'); return; }
    if (t1 >= D.end) this.endAct('done');
  }

  // ---------- 推进当前这一招 ----------
  step(dt) {
    const a = this.act, D = a.def, P = this.player, ctl = P.ctl;
    if (a.react) return this.stepReact(dt);
    if (a.key === 'knockdown') return this.stepKnockdown(dt);
    if (a.key === 'iai') return this.stepIai(dt);
    if (a.key === 'gourd') return this.stepGourd(dt);
    if (a.key === 'phoenix') return this.stepPhoenix(dt);
    if (a.key === 'dragon') return this.stepDragon(dt);
    const t0 = a.t;
    a.t += dt * (D.speed ?? 1);
    const t1 = a.t;
    ctl.lock = true;
    // 转身：前摇里追着目标 / 镜头方向，出手中只许慢慢转，收势中略快
    const ph = D.active ? (t1 < D.active[0] ? 0 : t1 <= D.active[1] ? 1 : 2) : D.release != null ? (t1 < D.release ? 0 : 2) : 2;
    if (a.key !== 'dodge') this.faceAim(a, (D.turn || [12, 3, 6])[ph], dt);
    // 根运动 → 速度（贴近目标时不再往里挤）
    this.applyRoot(a, dt);
    // 放出（剑诀）：扣灵力、进冷却、放特效
    if (!a.released && D.release != null && t1 >= D.release) this.release(a);
    // 挥剑声：发力的一瞬（空挥也有）。第十九轮：普攻换成斩击的录音，跳过开头一截，让最响的一下正落在判定上；拔刀斩的出鞘声在出刀时就放了
    if (D.active && !a.swung && t1 >= D.active[0] - 0.05) {
      a.swung = true;
      if (a.key.startsWith('light')) {
        const lead = ((D.hits?.[0]?.t ?? t1) - t1) / (D.speed ?? 1);
        this.combat.sound?.play('lightSlash', { at: P.pos, offset: Math.max(0, PC.sfx.slashPeak - lead), pitch: a.key === 'light4' ? 0.88 : a.key === 'light3' ? 1.1 : 1, gain: a.key === 'light4' ? 1.15 : 1 });
      }
      this.fx.swing?.(a);
    }
    // 出剑判定
    (D.hits || []).forEach((h, i) => { if (!a.hitDone.has(i) && t1 >= h.t && t0 < h.t + 0.2) { a.hitDone.add(i); this.strike(a, h, i); } });
    // 有效段里剑身撞墙：迸火星、一声金石（一招一次）
    if (D.active && !a.wallDone && t1 >= D.active[0] && t1 <= D.active[1]) this.wallCheck(a);
    // 各招的特别之处
    if (a.key === 'qi' && a.released && !a.waved) { a.waved = true; this.releaseWave(a, D.wave); }
    // 第二十轮：拔刀斩剑身离开鞘口的那一刻放出水墨月牙（外沿 = 这一刀的判定距离、张开 = 判定弧）
    if (a.key === 'iai_slash' && !a.inked && t1 >= INK.iai.at) { a.inked = true; const h0 = D.hits[0]; this.fx.iaiSlash?.(P, a, { range: this.iaiVal(a, h0.range), arc: h0.arc, hitT: h0.t }); }
    // 第二十五轮：确认处决的那一刀不再放剑气（演出不延长拔刀斩的攻击判定）
    if (a.key === 'iai_slash' && a.iaiK >= PC.iai.wave && !a.waved && t1 >= D.wave.at && !a.finale?.exec) {
      a.waved = true;
      const W = D.wave;
      this.releaseWave(a, { ...W, range: this.iaiVal(a, W.range), radius: this.iaiVal(a, W.radius), dmg: this.iaiVal(a, W.dmg) }, true);
    }
    if (a.key === 'dash') this.updateDash(a, t0, t1, dt);
    if (a.key === 'heavy' && D.ring && !a.ringShown && t1 >= D.ring.at) { a.ringShown = true; this.fx.slamRing?.(this.slamCenter(), D.ring.r, (D.hits[4].t - D.ring.at) / D.speed); }
    if (a.key === 'dodge') this.updateDodge(a, dt);
    // 招式自己不给位移的时候人站住（不留走、跑、闪身剩下的速度——脚是踩在地上的，留着就是滑步）
    if (ctl.vx == null) { ctl.vx = 0; ctl.vz = 0; }
    this.anim.seek(a.t);
    if (!this.act) return;
    // 第十九轮：闪身之前在蓄拔刀斩——落地时还按着 Z 就接着蓄，已经松开就直接出刀
    if (a.key === 'dodge' && this.iai && t1 >= PM.dodge.chain[0]) {
      // 第二十五轮：有墨势时蓄满也不自动出刀（还按着就接着蓄）
      if (this.held.power && (this.finale?.chargeFull?.() != null || this.iai.charge < PC.iai.max + PC.iai.grace)) this.startIai(true); else this.startIaiSlash();
      return;
    }
    // 收势里按方向键：过了最短收势就走开
    const mv = D.move ?? D.move2;
    if (mv != null && t1 >= mv && this.inputDir()) { this.endAct('move'); return; }
    if (t1 >= D.end) this.endAct('done');
  }

  // 根运动：动作在这一帧走过的距离（模型空间）→ 按朝向换成世界速度；有辅助目标时停在它身前
  applyRoot(a, dt) {
    const P = this.player, ctl = P.ctl;
    const R = P.char.clips[a.clip]?.data?.root;
    if (!R || dt <= 0) return;
    const cur = rootAt(R, a.t, _v), dz = cur.z - a.rootPrev.z, dx = cur.x - a.rootPrev.x;
    a.rootPrev.copy(cur);
    let fwd = dz;
    const T = a.target;
    if (T?.alive && fwd > 0) {
      fwd *= a.lungeK ?? 1;
      const d = Math.hypot(T.pos.x - P.pos.x, T.pos.z - P.pos.z) - T.radius - 0.75;
      if (d < 0.05) fwd = 0; else fwd = Math.min(fwd, d);
    } else if (a.key === 'iai_slash' && fwd > 0) fwd *= a.lungeK ?? 1;       // 第十九轮：拔刀斩没有目标时也按蓄力前冲得远
    const s = Math.sin(P.heading), c = Math.cos(P.heading);
    ctl.vx = (s * fwd + c * dx) / dt; ctl.vz = (c * fwd - s * dx) / dt;
  }

  // 朝向：锁定 / 辅助目标，否则镜头所对的方向；每秒最多转 rate 弧度
  aimYaw(a) {
    const P = this.player, T = a?.target || (this.lock?.alive ? this.lock : null);
    if (T?.alive) return Math.atan2(T.pos.x - P.pos.x, T.pos.z - P.pos.z);
    const f = this.cam.forward();
    return Math.atan2(f.x, f.z);
  }
  faceAim(a, rate, dt) {
    if (!rate) return;
    const P = this.player;
    P.heading = approach(P.heading, this.aimYaw(a), rate * dt);
    P.ctl.yaw = null;
  }

  // ---------- 放出：扣灵力与冷却，放出剑诀本身 ----------
  release(a) {
    a.released = true;
    const S = PC.skills[a.key], D = a.def, P = this.player;
    const c = this.cost(a.key);
    if (c) this.mp = Math.max(0, this.mp - c);
    if (S?.cooldown) this.cools[a.key] = S.cooldown;
    // 第二十一轮：九霄凤焰放出（快照、召出凤凰在 phoenix.release；灵力、冷却已在上面扣过）
    if (a.key === 'phoenix') { this.phoenix?.release(a); this.combat.saveSoon?.(); }
    if (a.key === 'dragon') this.combat.saveSoon?.();                  // 第二十三轮：雷龙已在 dragon.commit 里开演（灵力、冷却在上面扣过）
    if (a.key === 'ult') { this.intent = 0; this.beginUlt(a.target); this.iframes = Math.max(this.iframes, (D.iframes[1] - D.release) / D.speed); }
    if (a.key === 'pill') { if (this.usePill()) { this.addHeal(D.heal, 1.6); this.fx.pill?.(P); } }
    // 第十九轮：葫芦喝到嘴里——扣一口，回复气血上限的三分之一（healOver 秒回完）
    if (a.key === 'gourd') { if (this.gourd.use()) { a.drank = true; this.addHeal(this.combat.playerUnit.maxHp * PC.gourd.heal, D.healOver); this.fx.gourd?.(P); } }
    if (a.key === 'qi') this.combat.sound?.play('qi', { at: P.pos, offset: PC.sfx.qiFrom });
    if (a.key === 'seal') this.releaseSeal(a);
    if (a.key === 'dash') { /* 位移与沿途判定见 updateDash */ }
    if (a.key === 'heavy') this.combat.sound?.play('swing', { at: P.pos, heavy: true });
    this.logEvent(a, 'release');
  }

  // =====================================================================================
  // 出剑判定：扇形（或以自身为圆心）里的目标，看得见（不隔墙）的才算；同一段对同一目标只结算一次。
  // 接触点取剑身与目标身体轴线最近的那一点（火星从那里迸出）
  // =====================================================================================
  strike(a, h, idx) {
    const P = this.player, C = this.combat, lv = Math.max(0, (a.level || 1) - 1);
    // 第十九轮：拔刀斩的两元数组按蓄力插值；其他招式的数组按档位取
    const V = (v) => (a.iaiPow != null ? this.iaiVal(a, v) : lvl(v, lv));
    if (h.slam) this.fx.slam?.(P, this.slamCenter(), h.aoe);
    if (!h.dmg) return;
    const dmg0 = V(h.dmg), range = V(h.range ?? 0), arc = (h.arc ?? 120) * DEG;
    const center = h.aoe ? this.slamCenter() : P.pos;
    P.char.bladeEnds(_tip, _base);
    let n = 0, best = null;
    const done = (a.hitSets ||= [])[idx] ||= new Set();            // 这一段已结算过的目标
    // 这一段实际接触到的目标（判定照旧：扇形 / 圆、高差、看得见；同一段对同一目标只结算一次）——第二十五轮先收齐这一批，再挑主目标
    const batch = [];
    for (const e of C.targets()) {
      if (done.has(e)) continue;
      const dx = e.pos.x - center.x, dz = e.pos.z - center.z, d = Math.hypot(dx, dz);
      if (Math.abs(e.pos.y - P.pos.y) > 2.6) continue;
      if (h.aoe) { if (d > h.aoe + e.radius) continue; }
      else {
        if (d > range + e.radius) continue;
        if (d > 0.6 && Math.abs(wrapAngle(Math.atan2(dx, dz) - P.heading)) > arc / 2) continue;
        if (!this.visible(e)) continue;
      }
      done.add(e);
      batch.push(e);
    }
    // 第二十五轮：终式（墨势满蓄力出刀）——刀身这一下乘一次技能倍率（之后照常乘等级成长、反击强化、目标的防御与减伤）；
    //   主目标只在这一批真实接触的目标里挑一次（有效锁定且被命中的优先，否则轨迹最先接触的），处决只对它探一次（combat.damage 在接受之后、结算之前问）
    const fin = a.key === 'iai_slash' ? a.finale : null, skillK = fin ? fin.dmgK : 1;
    if (fin && !fin.primary && batch.length) { fin.primary = this.finale.primaryOf(batch, this.lock?.alive ? this.lock : null); fin.batch = batch.length; }
    const hits = [];                                                // 这一段对各目标的结算（普攻的墨势计数用）
    for (const e of batch) {
      const ok = e.alive && !e.dummy && !e.phoenix && e.faction !== 'sect';
      const at = this.contactPoint(e, h.aoe ? center : null);
      // 第二十二轮：反击强化——弹反后 counter 秒内，普攻与拔刀斩的近战直接命中：第一个有效目标 ×counterK，打中即用掉（同一刀的其他目标不再有）
      //   倍率在结算里乘（combat.damage 的 counterK）：被格挡住的那一下不吃、也不用掉
      const counter = this.counterFor(a);
      const dmgB = dmg0 * skillK * this.dmgK;                                        // 第二十一轮：× 等级成长的伤害倍率（第二十五轮：终式另 × 技能倍率）
      const big = h.kind === 'heavy';
      const probe = fin && e === fin.primary && !fin.probed ? (u) => this.finale.probe(a, u) : null;
      const r = C.damage(e, dmgB, { from: C.playerUnit, kind: big ? 'heavy' : a.def.gold ? 'gold' : 'sword', stun: V(h.stun), push: h.push, knock: V(h.knock ?? 0), big, at,
        posture: V(h.posture ?? 0) * (counter ? PC.guard.counterPosture : 1), counter, counterK: PC.guard.counterK, hitKind: h.kind, execProbe: probe });
      // 第二十五轮：确认处决——这一下不再结算强化伤害（目标留给演出，收刀合拢时由它自己的流程结束）；画面交给演出
      if (r === 'exec') { a.results.push({ i: idx, t: +a.t.toFixed(3), target: e.cfg?.name || e.kind, r: 'exec', dmg: 0 }); n++; best = 'hit'; continue; }
      hits.push({ r, ok });
      // 有效命中（真正打进去：hit / 破防）才用掉强化；被格挡、免疫、闪开、已倒下的都不算——留给下一个目标或下一刀
      const landed = counter && (r === 'hit' || r === 'guardbreak');
      const dmg = dmgB * (landed ? PC.guard.counterK : 1);
      if (landed) this.useCounter(a, e, dmg, idx);
      a.results.push({ i: idx, t: +a.t.toFixed(3), target: e.cfg?.name || e.kind, r: r || 'hit', dmg: Math.round(dmg), counter: landed || undefined });
      // 火星迸在接触点（守关龙君自己出受击火星与声音）；第二十轮：普攻、拔刀斩命中处是一团墨（龙君身上也补一团，落在它被砍中的那段身体上）
      const inked = a.key.startsWith('light') || a.key === 'iai_slash', hd = _w.set(Math.sin(P.heading), 0, Math.cos(P.heading));
      if (!e.boss) this.fx.hitFx?.(e, at, { kind: h.kind, result: r || 'hit', gold: !!a.def.gold, counter: landed, dir: hd, ink: inked, ik: a.iaiK ?? 0, key: a.key });
      else if (inked && r !== 'immune') this.fx.inkHit?.(e.hitPoint || at, hd, { heavy: h.kind === 'heavy', thrust: h.kind === 'thrust', k: a.iaiK ?? 0, key: a.key, crit: landed });
      if (!e.boss && r !== 'immune') this.combat.sound?.play(r === 'block' ? 'block' : h.kind === 'heavy' ? 'hitHeavy' : 'hit', { at, gain: r === 'block' ? 0.7 : 1 });
      if (r !== 'immune') { n++; if (!best || big) best = r || 'hit'; }
      if (landed) C.popNumber(e, `反击 ×${PC.guard.counterK}`, 'parry');
    }
    if (n) {
      this.scored(n, this.intentOf(a));
      // 确认处决的那一刀：顿帧、镜头的推一下交给演出（统一封顶，不叠加）
      if (!fin?.exec) {
        C.hitStop(PC.feedback.stop[h.stop || 'light'] * (a.countered === idx ? 1.15 : 1));
        C.kick(_w.set(Math.sin(P.heading), 0, Math.cos(P.heading)), V(h.shake ?? (h.kind === 'heavy' ? 0.16 : 0.07)));
      }
    } else if (h.slam) C.shake(V(h.shake) * 0.6);
    // 主目标这一下没被接受（无敌、格挡、截锋、剧情保护）：不探处决，也不改找别的目标
    if (fin && fin.primary && !fin.probed && !fin.why) fin.why = 'rejected';
    // 第二十五轮：普攻一刀结算完——墨势计数（按「攻击实例号 + 段号」去重：一刀打中几个也只算一次）
    if (a.key.startsWith('light')) this.finale?.onLightStrike?.(a, idx, hits);
    this.logEvent(a, 'hit', fin ? { i: idx, n, ink: fin.id, batch: fin.batch, primary: fin.primary ? (fin.primary.id ?? fin.primary.kind) : null, exec: !!fin.exec, why: fin.why } : { i: idx, n });
  }
  // 看得见：胸口到胸口之间没有墙
  visible(e) {
    const W = this.combat.world, P = this.player;
    if (!W?.cw?.ray) return true;
    const o = _v.set(P.pos.x, P.pos.y + 1.1, P.pos.z), dx = e.pos.x - o.x, dz = e.pos.z - o.z, dy = (e.pos.y + 1.0) - o.y, d = Math.hypot(dx, dy, dz);
    if (d < 0.8) return true;
    const t = W.cw.ray(o, { x: dx / d, y: dy / d, z: dz / d }, d);
    return t >= d - (e.radius || 0.4) - 0.1;
  }
  // 接触点：剑身线段（护手上沿 → 剑尖）与目标身体轴（脚上 0.4 米 → 头下）之间最近的一点，落在目标体表
  contactPoint(e, center = null) {
    const top = (e.headY ?? e.pos.y + 1.8) - 0.15, bot = e.pos.y + 0.4;
    if (center) return new THREE.Vector3(e.pos.x - (e.pos.x - center.x) * 0.15, e.pos.y + 0.5, e.pos.z - (e.pos.z - center.z) * 0.15);
    let best = null, bd = Infinity;
    for (let i = 0; i <= 8; i++) {
      const p = _v.lerpVectors(_base, _tip, i / 8);
      const y = Math.max(bot, Math.min(top, p.y));
      const d = Math.hypot(p.x - e.pos.x, p.y - y, p.z - e.pos.z);
      if (d < bd) { bd = d; best = { x: p.x, y, z: p.z }; }
    }
    const ax = best.x - e.pos.x, az = best.z - e.pos.z, l = Math.hypot(ax, az) || 1, r = Math.min(e.radius ?? 0.4, l);
    return new THREE.Vector3(e.pos.x + (ax / l) * r, best.y, e.pos.z + (az / l) * r);
  }
  slamCenter() { const P = this.player; return new THREE.Vector3(P.pos.x + Math.sin(P.heading) * 1.0, P.pos.y, P.pos.z + Math.cos(P.heading) * 1.0); }
  // 剑身扫进墙里：沿剑身打一条射线
  wallCheck(a) {
    const W = this.combat.world;
    if (!W?.cw?.ray) return;
    this.player.char.bladeEnds(_tip, _base);
    const d = _v.subVectors(_tip, _base), L = d.length();
    if (L < 0.2) return;
    d.divideScalar(L);
    const t = W.cw.ray(_base, d, L);
    if (t < L - 0.02) {
      a.wallDone = true;
      const p = _base.clone().addScaledVector(d, t);
      this.fx.wallHit?.(p, d);
      this.combat.sound?.play('wall', { at: p });
      this.combat.hitStop(PC.feedback.stop.block);
      this.logEvent(a, 'wall');
    }
  }
  // 命中计数：连击、剑意
  scored(n, intent) {
    if (this.time - this.combo.t > PC.comboWindow) this.combo.n = 0;
    this.combo.n += n; this.combo.t = this.time; this.combo.best = Math.max(this.combo.best, this.combo.n);
    this.gainIntent(intent * Math.min(n, 3));
    this.lastCombat = this.time;
  }
  gainIntent(k) { this.intent = Math.min(PC.intent, this.intent + k); }

  // =====================================================================================
  // 近战辅助与锁定
  // =====================================================================================
  // 候选：可攻击的目标（魔修、木人桩、切磋对手、守关龙君——不含同门与护宗双龙），range 米、镜头方向 ±aim.angle 内、看得见
  pickAssist(range) {
    const P = this.player, A = PC.aim;
    const L = this.lock?.alive ? this.lock : null;
    if (L && Math.hypot(L.pos.x - P.pos.x, L.pos.z - P.pos.z) <= range + L.radius && this.visible(L)) return L;
    const f = this.cam.forward(), fy = Math.atan2(f.x, f.z);
    const score = (e) => {
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d > range + e.radius || Math.abs(e.pos.y - P.pos.y) > 2.5) return Infinity;
      const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - fy));
      if (ang > A.angle && d > 1.6) return Infinity;
      if (!this.visible(e)) return Infinity;
      return ang * 1.6 + d * 0.22;
    };
    let best = null, bs = Infinity;
    for (const e of this.combat.targets()) { const s = score(e); if (s < bs) { bs = s; best = e; } }
    // 粘住上一次的目标：仍有效、且不比最好的差太多，就不换
    const T = this.target;
    if (T?.alive && T !== best && this.time - this.targetT < 3) { const s = score(T); if (s < Infinity && (s <= bs + A.switchK || this.time - this.targetT < A.stick)) best = T; }
    if (best && best !== this.target) this.targetT = this.time;
    if (best) this.target = best;
    return best;
  }
  // 标记用：此刻出招的话辅助会选谁（不改粘住的目标；每 0.15 秒算一次）
  previewTarget() {
    if (this.time - (this._pvT ?? -9) < 0.15) return this._pv?.alive ? this._pv : null;
    this._pvT = this.time;
    const keep = this.target, keepT = this.targetT;
    this._pv = this.pickAssist(PC.aim.range + 1.5);
    this.target = keep; this.targetT = keepT;
    return this._pv;
  }
  toggleLock() {
    if (this.lock) { this.lock = null; this.fx.lockOn?.(null); this.combat.sound?.play('lockOff', {}); return; }
    if (!this.inputOk()) return;
    const P = this.player, f = this.cam.forward(), fy = Math.atan2(f.x, f.z);
    let best = null, bs = Infinity;
    for (const e of this.combat.targets()) {
      if (e.dummy) continue;
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d > PC.aim.lockRange - 4) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - fy));
      if (ang > 0.9 || !this.visible(e)) continue;
      const s = ang * 6 + d * 0.15;
      if (s < bs) { bs = s; best = e; }
    }
    if (!best) { this.fx.deny?.('lock', 'nolock'); return; }
    this.lock = best; this.lockLost = 0;
    this.fx.lockOn?.(best);
    this.combat.sound?.play('lockOn', {});
  }
  updateLock(dt) {
    const L = this.lock;
    if (!L) return;
    const P = this.player;
    const far = Math.hypot(L.pos.x - P.pos.x, L.pos.z - P.pos.z) > PC.aim.lockRange;
    this.lockLost = this.visible(L) ? 0 : this.lockLost + dt;
    if (!L.alive || L.hidden?.() || far || this.lockLost > PC.aim.lockLos || !this.combat.targets().includes(L)) { this.lock = null; this.fx.lockOn?.(null); }
  }

  // =====================================================================================
  // 闪身
  // =====================================================================================
  doDodge() {
    if (this.cools.dodge > 0 || this.player.flying) return false;
    const P = this.player;
    let dir = this.inputDir();
    if (!dir) dir = _w.set(-Math.sin(P.heading), 0, -Math.cos(P.heading));      // 没按方向：向后撤
    dir = dir.clone().normalize();
    // 动作按相对朝向挑（前 / 后 / 左 / 右）；人物朝向不变（闪身时仍看着对手）
    const rel = wrapAngle(Math.atan2(dir.x, dir.z) - P.heading);
    const side = Math.abs(rel) < 0.8 ? 'f' : Math.abs(rel) > 2.35 ? 'b' : rel > 0 ? 'l' : 'r';
    if (!this.start('dodge', { clip: PM.dodge.clips[side] })) return false;
    const D = PM.dodge;
    this.act.dir = dir;
    this.iframes = Math.max(this.iframes, D.iframes[1] - D.iframes[0]);
    this.cools.dodge = PC.skills.dodge.cooldown;
    this.fx.dodge?.(P, dir);
    this.combat.sound?.play('dodge', { at: P.pos });
    // 第二十四轮：真实的闪身事件（方向、起点、距离）——第三十层的留锋突刺按它判断「远离 Boss 的后撤」
    this.onDodge?.({ dir: dir.clone(), from: P.pos.clone(), dist: D.dist, side, t: this.time });
    return true;
  }
  // 闪身的位移只在双脚离地的那一段（push）里给：速度按半个正弦起落，总距离 dist（落地前后不动，脚不在地上滑）
  updateDodge(a, dt) {
    const ctl = this.player.ctl, D = PM.dodge, [s0, s1] = D.push, T = s1 - s0, u = (a.t - s0) / T;
    if (u > 0 && u < 1) {
      const v = D.dist * (Math.PI / 2) / T * Math.sin(Math.PI * u) * (D.speed ?? 1);
      ctl.vx = a.dir.x * v; ctl.vz = a.dir.z * v;
      a.ghostT = (a.ghostT ?? 0) - dt;
      if (a.ghostT <= 0) { a.ghostT = 0.05; this.fx.ghost?.(); }
    }
  }


  // =====================================================================================
  // 格挡与弹反
  // =====================================================================================
  // fresh：这次举剑来自刚按下的右键（缓冲期内）——只有这样才开弹反窗口
  enterGuard(fresh) {
    if (this.act) this.endAct('cancel');
    const G = PC.guard;
    this.guarding = true; this.guardT = this.time;
    // 第二十六轮：开窗间隔只罚「弹空」——上一个窗口弹反成功了，这一次按下立刻再开
    if (fresh && this.time - this.parryOpenT >= (this.parryHit && !this.legacyParry ? 0 : G.parryCooldown)) {
      this.parryOpenT = this.time; this.parryUntil = this.time + G.parryWindow; this.parryHit = false;
      this.stat.parryWindows++;
      this.fx.parryReady?.(this.player);
      this.combat.lateParry?.();                  // 第二十六轮：刚碰到身上、还挂着的来招 → 按弹反结算
    }
    this.anim.play('guard', { from: 0, to: 1.7, speed: 1, loop: [0.08, 1.7], hold: true, mask: 'upper', fade: 0.06 });
    this.lastAction = this.time;
  }
  releaseGuard() { if (this.guarding) this.exitGuard(); }
  exitGuard() {
    this.guarding = false;
    this.parryUntil = Math.min(this.parryUntil, this.time);
    if (!this.act) this.anim.stop(0.16);
    this.combat.syncGuard?.();
  }

  // 受伤的结算（combat.damage 对玩家调用）：info { spec（来招的防御属性，见 combat.resolveSpec）, at（接触点）, from, dot }
  // 返回 { result: dodge | dup | parry | block | guardbreak | hit, amount }
  defend(amount, info) {
    const spec = info.spec || ATTACK_DEF.claw, G = PC.guard, P = this.player;
    if (!info.dot && this.iframes > 0) return { result: 'dodge', amount: 0 };
    // 同一段来招只结算一次
    if (spec.id != null) {
      const key = spec.id + '#' + (spec.seg ?? 0);
      if (this.resolved.has(key)) return { result: 'dup', amount: 0 };
      this.resolved.set(key, this.time);
    }
    this.lastCombat = this.time;
    if (info.dot) return { result: 'hit', amount };
    const src = info.at || info.from?.pos;
    const front = !!src && Math.abs(wrapAngle(Math.atan2(src.x - P.pos.x, src.z - P.pos.z) - P.heading)) <= G.arc / 2;
    // 弹反：窗口里、正面、来招可弹反、正在出手、实际碰到了（能走到这里就是碰到了）
    if (this.guarding && front && this.parrying && spec.parry && spec.active !== false) return { result: 'parry', amount: 0 };
    // 格挡：举着剑、正面、可格挡
    if (this.guarding && front && spec.block) {
      const hard = spec.block === 'hard';
      const cost = (spec.guardCost ?? G.cost) * (hard ? G.hardK : 1);
      this.guardHP -= cost; this.guardUsed = this.time;
      const chip = spec.chip ?? G.chip;
      if (this.guardHP <= 0) { this.guardHP = 0; return { result: 'guardbreak', amount: amount * Math.max(chip, 0.35) }; }
      return { result: 'block', amount: amount * chip };
    }
    // 霸体：伤害打折
    const D = this.act?.def;
    if (D?.armor && this.act && !this.act.react) amount *= D.armor;
    // 第二十六轮：迟到的弹反——正面、可弹反、正在出手的近战来招（弹得回的魔弹不算），没举着剑而此刻能举剑：交给 combat 挂起 lateGrace 秒
    // legacyParry：自检用——换回第二十五轮的规则（不在按下时立刻举剑、成功后照样等开窗间隔、没有迟到弹反），做改前改后的对照
    const late = !this.legacyParry && G.lateGrace > 0 && front && !!spec.parry && spec.active !== false && !spec.deflect && !this.guarding && this.canStart('guard') && this.inputOk();
    return { result: 'hit', amount, late };
  }
  // 弹反成功之后（combat.damage 已判定）：回资源、开反击窗口、演拨剑、出手者的反应由 combat 处理
  // info（第二十一轮）：{ spec 来招（id 出手号、seg 第几段）, from 出手者 }——真实弹反成功的事件，带上序号交给九霄凤焰（凤焰弹反按它去重）
  onParry(at, info = {}) {
    const G = PC.guard;
    this.mp = Math.min(this.mpMax, this.mp + G.parryMp);
    const seq = ++this.parrySeq;
    this.lastParryEvt = { seq, specId: info.spec?.id ?? null, seg: info.spec?.seg ?? 0, from: info.from || null, at, t: this.time };
    this.gainIntent(G.parryIntent);                                      // 第二十二轮：+8，最多到满
    this.guardHP = Math.min(G.max, this.guardHP + G.max * G.parryRefund);    // 第二十二轮：守势上限的 25%
    // 反击强化：不叠层，新的弹反把期限刷新为 counter 秒（上一份没用掉的、到时没用的都只是过期）
    if (this.countering) this.stat.counterRefresh = (this.stat.counterRefresh || 0) + 1;
    this.counterUntil = this.time + G.counter; this.counterFrom = this.time; this.counterEvt = seq;
    this.parryUntil = this.time;                 // 一次开窗只弹反一次
    this.parryHit = true;                        // 第二十六轮：成功了——下一次按下不受开窗间隔限制
    this.stat.parries++;
    this.anim.play('parry', { from: 0, to: 0.42, speed: 1, hold: true, mask: 'upper', fade: 0.04 });
    this.parryAnimT = this.time;
    this.fx.parry?.(this.player, at);
    this.phoenix?.onParry(this.lastParryEvt);
  }
  onBlock(at, hard) {
    this.stat.blocks++;
    this.anim.play('block', { from: 0, to: 0.28, speed: hard ? 0.8 : 1, hold: true, mask: 'upper', fade: 0.03 });
    this.blockAnimT = this.time;
    this.fx.block?.(this.player, at, hard);
  }
  onGuardBreak(src) {
    this.stat.breaks++;
    this.guardLock = this.time + PC.guard.breakLock; this.guardBroken = true;
    this.exitGuard();
    this.react('guardbreak', src);
    this.fx.guardBreak?.(this.player);
  }
  // 格挡中的顶架、弹反动作放完：回到格挡循环（还举着剑时）
  guardAnimTick() {
    const A = this.anim;
    if (this.guarding && !this.act && (A.name === 'block' || A.name === 'parry') && A.cur?.done) this.anim.play('guard', { from: 0.08, to: 1.7, loop: [0.08, 1.7], hold: true, mask: 'upper', fade: 0.12 });
    if (!this.guarding && !this.act && A.name === 'parry' && A.cur?.done) this.anim.stop(0.2);
  }

  // =====================================================================================
  // 受击反应（按来向挑动作）：flinch 轻受击 / knockback 重击退 / knockdown 击倒 / stun 麻痹 / stagger 失衡 / guardbreak 破防
  // =====================================================================================
  react(kind, from) {
    if (!this.ready || this.player.flying || !kind || kind === 'none') return;
    if (kind === 'knockdown') { this.knockdown(from); return; }
    const a0 = this.act;
    if (a0 && (a0.key === 'knockdown' || a0.key === 'dodge')) return;
    if (kind === 'flinch' && a0 && a0.def.armor && !a0.react) return;          // 霸体：不演轻受击
    // 连续受击保护
    const H = PC.hurt;
    this.reacts = this.reacts.filter((t) => this.time - t < H.chainWindow);
    this.reacts.push(this.time);
    if (this.reacts.length >= H.chainMax) { this.reacts.length = 0; this.iframes = Math.max(this.iframes, H.chainGuard); this.combat.popNumber(this.combat.playerUnit, '护体', 'parry'); this.fx.guardBreak?.(this.player, true); }
    const R = PR[kind];
    if (!R) return;
    if (this.guarding) this.exitGuard();
    if (a0) this.endAct('react');
    const P = this.player;
    let clip = R.clip;
    if (R.clips) {
      const rel = from ? wrapAngle(Math.atan2(from.x - P.pos.x, from.z - P.pos.z) - P.heading) : 0;
      clip = R.clips[Math.abs(rel) < 0.8 ? 'f' : Math.abs(rel) > 2.35 ? 'b' : rel > 0 ? 'l' : 'r'];
    } else if (from && (kind === 'knockback' || kind === 'guardbreak')) P.heading = Math.atan2(from.x - P.pos.x, from.z - P.pos.z);      // 面朝来袭方向向后退
    const sp = R.speed ?? 1;
    const end = R.dur ?? this.player.char.clips[clip]?.dur ?? 0.5;
    this.anim.play(clip, { from: 0, to: end * sp, speed: sp, manual: true, hold: true, fade: 0.05 });
    this.act = { key: 'react', react: true, kind, R, def: { hits: [] }, clip, t: 0, t0: this.time, id: ++this.seq, rootPrev: new THREE.Vector3(), hitSet: new Set(), hitDone: new Set(), sp, end: end * sp };
    if (R.iframes) this.iframes = Math.max(this.iframes, R.iframes);
    this.fx.react?.(kind, P);
  }
  stepReact(dt) {
    const a = this.act, ctl = this.player.ctl;
    a.t += dt * a.sp;
    ctl.lock = true;
    this.applyRoot(a, dt);
    if (ctl.vx == null) { ctl.vx = 0; ctl.vz = 0; }
    if (a.R.spark) { a.sparkT = (a.sparkT ?? 0) - dt; if (a.sparkT <= 0) { a.sparkT = 0.08; this.fx.stun?.(this.player); } }
    this.anim.seek(a.t);
    if (a.t >= a.end) this.endAct('done');
  }
  // 被掀翻：倒地再起身（期间不受伤害）；位移由代码给（动作本身原地）
  knockdown(from) {
    if (!this.ready || this.act?.key === 'knockdown' || this.player.flying) return;
    const P = this.player, D = PR.knockdown;
    if (this.guarding) this.exitGuard();
    if (this.act) this.endAct('react');
    this.anim.play(D.clip, { from: 0, to: D.to, speed: D.speed, hold: true, fade: 0.05 });
    const dx = P.pos.x - (from?.x ?? P.pos.x - Math.sin(P.heading)), dz = P.pos.z - (from?.z ?? P.pos.z - Math.cos(P.heading)), l = Math.hypot(dx, dz) || 1;
    P.heading = Math.atan2(-dx / l, -dz / l);                    // 面朝来袭方向向后倒
    this.act = { key: 'knockdown', def: D, t: 0, phase: 'main', hitSet: new Set(), hitDone: new Set(), dir: new THREE.Vector3(dx / l, 0, dz / l), t0: this.time, id: ++this.seq };
    this.iframes = Math.max(this.iframes, D.iframes);
  }
  stepKnockdown(dt) {
    const a = this.act, D = a.def, ctl = this.player.ctl;
    a.t += dt * D.speed;
    ctl.lock = true;
    if (a.t < 0.32) { const v = 4.5 * (1 - a.t / 0.32); ctl.vx = a.dir.x * v; ctl.vz = a.dir.z * v; }
    if (!a.up && a.t >= D.to) { a.up = true; this.anim.play(D.getUp.clip, { from: 0, speed: D.getUp.speed, hold: true, fade: 0.1 }); a.upT = 0; }
    if (a.up) { a.upT += dt; if (a.upT * D.getUp.speed >= this.player.char.anim.lib.dur(D.getUp.clip) - 0.05) this.endAct('done'); }
  }

  // =====================================================================================
  // 剑诀
  // =====================================================================================
  releaseWave(a, W, short = false) {
    const P = this.player;
    const dir = new THREE.Vector3(Math.sin(P.heading), 0, Math.cos(P.heading));
    const from = new THREE.Vector3(P.pos.x + dir.x * 0.8, P.pos.y + 1.05, P.pos.z + dir.z * 0.8);
    let to = from.clone().addScaledVector(dir, W.range);
    const T = a.target;
    if (T?.alive) { to = new THREE.Vector3(T.pos.x, T.pos.y + 1.0, T.pos.z); const dd = to.clone().sub(from); dd.y = Math.max(-0.4, Math.min(0.4, dd.y)); to = from.clone().addScaledVector(dd.normalize(), W.range); }
    this.combat.shoot({ from, to, speed: W.speed, radius: W.radius, damage: W.dmg * this.dmgK, faction: 'sect', kind: 'wave', range: W.range, pierce: true, owner: 'player', stun: W.stun ?? 0.3, short,
      onHit: () => this.scored(1, this.intentOf(a)) });
    this.logEvent(a, 'wave');
  }

  // 缚灵锁：身前扇形内（看得见的）至多 max 个目标，按角度、距离排；锁链从左手打出
  releaseSeal(a) {
    const P = this.player, B = a.def.bind, C = this.combat;
    const yaw = P.heading, list = [];
    for (const e of C.targets()) {
      if (e.dummy && !e.alive) continue;
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d > B.range + e.radius || Math.abs(e.pos.y - P.pos.y) > 3) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - yaw));
      if (ang > (B.arc * DEG) / 2 && d > 1.5) continue;
      if (!this.visible(e)) continue;
      list.push({ e, s: ang * 2 + d * 0.15 });
    }
    list.sort((x, y) => x.s - y.s);
    const hit = list.slice(0, B.max).map((x) => x.e);
    const hand = new THREE.Vector3();
    P.char.bones?.[9]?.getWorldPosition?.(hand);
    if (!hand.lengthSq()) hand.set(P.pos.x, P.pos.y + 1.3, P.pos.z);
    this.fx.sealCast?.(P, hand, hit, B);
    this.combat.sound?.play('bind', { at: P.pos, offset: PC.sfx.bindFrom });
    for (const e of hit) {
      const r = C.bind(e, B, P.pos);
      a.results.push({ i: 0, t: +a.t.toFixed(3), target: e.cfg?.name || e.kind, r: r ? 'bind' : 'immune' });
    }
    if (hit.length) this.scored(hit.length, a.def.intent ?? 4);
    this.logEvent(a, 'seal', { n: hit.length });
  }

  // ---------- 惊鸿掠影：位移由代码给（动作是原地的冲刺姿势）；掠过的敌人各受一剑 ----------
  updateDash(a, t0, t1, dt) {
    const D = a.def, P = this.player, ctl = P.ctl;
    const [s, e, m] = D.move;
    if (t1 > s && t0 < e) {
      if (!a.dashStarted) { a.dashStarted = true; this.fx.dashStart?.(P); this.combat.sound?.play('dash', { at: P.pos }); }
      let v = (m / (e - s)) * D.speed;
      if (a.target?.alive) { const d = Math.hypot(a.target.pos.x - P.pos.x, a.target.pos.z - P.pos.z); if (d < a.target.radius + 1.3) v = 0; }
      ctl.vx = Math.sin(P.heading) * v; ctl.vz = Math.cos(P.heading) * v;
      a.ghostT = (a.ghostT ?? 0) - dt;
      if (a.ghostT <= 0) { a.ghostT = 0.04; this.fx.ghost?.(); }
      this.fx.dashTick?.(P);
    }
    if (t1 >= D.iframes[0] && t0 <= D.iframes[1]) this.iframes = Math.max(this.iframes, 0.05);
    if (t1 > s && t0 < e + 0.04) {
      for (const en of this.combat.targets()) {
        if (a.hitSet.has(en)) continue;
        const d = Math.hypot(en.pos.x - P.pos.x, en.pos.z - P.pos.z);
        if (d > D.path.radius + en.radius || Math.abs(en.pos.y - P.pos.y) > 2.6) continue;
        a.hitSet.add(en);
        P.char.bladeEnds(_tip, _base);
        const at = this.contactPoint(en);
        const r = this.combat.damage(en, D.path.dmg * this.dmgK, { from: this.combat.playerUnit, kind: 'sword', stun: D.path.stun, push: 0.6, at, posture: 6 });
        this.fx.hitFx?.(en, at, { kind: 'light', result: r || 'hit', dir: _w.set(Math.sin(P.heading), 0, Math.cos(P.heading)) });
        a.results.push({ i: 0, t: +a.t.toFixed(3), target: en.cfg?.name || en.kind, r: r || 'hit', dmg: D.path.dmg });
        this.scored(1, D.intent ?? 6);
        this.combat.hitStop(PC.feedback.stop.light);
      }
    }
    if (a.dashStarted && !a.dashEnded && t1 >= e) { a.dashEnded = true; this.fx.dashEnd?.(P); }
  }

  // ---------- 万剑归宗 ----------
  beginUlt(lock) {
    const P = this.player, D = PM.ult;
    const f = lock?.alive ? _v.set(lock.pos.x, lock.pos.y, lock.pos.z) : _v.set(P.pos.x + Math.sin(P.heading) * 6.5, P.pos.y, P.pos.z + Math.cos(P.heading) * 6.5);
    const center = f.clone();
    center.y = this.combat.groundAt(center.x, center.z, P.pos.y + 3);
    const swords = [];
    const foes = this.combat.targets().filter((e) => Math.hypot(e.pos.x - center.x, e.pos.z - center.z) < D.circle + 1);
    for (let i = 0; i < D.swords; i++) {
      const u = i / D.swords, t = D.rain[0] + (D.rain[1] - D.rain[0]) * (u + (Math.random() - 0.5) / D.swords);
      let x, z;
      if (foes.length && i % 2 === 0) { const e = foes[(i / 2) % foes.length | 0]; x = e.pos.x + (Math.random() - 0.5) * 1.2; z = e.pos.z + (Math.random() - 0.5) * 1.2; }
      else { const r = Math.sqrt(Math.random()) * D.circle * 0.92, an = Math.random() * Math.PI * 2; x = center.x + Math.cos(an) * r; z = center.z + Math.sin(an) * r; }
      swords.push({ i, x, z, t, landed: false });
    }
    // 第二十二轮：飞剑与巨剑用此刻手中的这把剑（fx.ultBegin 记下；之后换剑不改这一次）
    this.ult = { t: 0, center, swords, finalDone: false, handle: this.fx.ultBegin?.(center, D, swords), sword: this.player.char.swordId || null };
    this.combat.flash?.(0xfff1c8, 0.18);
  }
  updateUlt(dt) {
    const U = this.ult, D = PM.ult;
    if (!U) return;
    U.t += dt;
    this.fx.ultTick?.(U.t);
    // 第十九轮：落剑声（录音全段，第一下对上第一柄飞剑落地）、末了巨剑落下的一声
    if (!U.rainSnd && U.t >= D.rain[0] - PC.sfx.rainLead) { U.rainSnd = true; this.combat.sound?.play('ultRain', { at: U.center }); }
    if (!U.finalSnd && U.t >= D.final.t - PC.sfx.finalLead) { U.finalSnd = true; this.combat.sound?.play('ultFinal', { at: U.center }); }
    for (const s of U.swords) {
      if (!s.spawned && U.t >= s.t - 0.42) { s.spawned = true; s.y = this.combat.groundAt(s.x, s.z, U.center.y + 4); s.h = this.fx.ultSword?.(s); }
      if (!s.landed && U.t >= s.t) {
        s.landed = true;
        this.fx.ultLand?.(s);
        let n = 0;
        for (const e of this.combat.targets()) {
          if (Math.hypot(e.pos.x - s.x, e.pos.z - s.z) > D.swordR + e.radius) continue;
          this.combat.damage(e, D.swordDmg * this.dmgK, { from: this.combat.playerUnit, kind: 'gold', stun: 0.35, at: new THREE.Vector3(s.x, s.y + 0.6, s.z), push: 0.3, posture: 2 });
          n++;
        }
        if (n) this.scored(n, 2);
      }
    }
    const F = D.final;
    if (!U.finalDone && U.t >= F.t - 0.5 && !U.finalSpawned) { U.finalSpawned = true; this.fx.ultFinalSword?.(U.center); }
    if (!U.finalDone && U.t >= F.t) {
      U.finalDone = true;
      let n = 0;
      for (const e of this.combat.targets()) {
        if (Math.hypot(e.pos.x - U.center.x, e.pos.z - U.center.z) > F.r + e.radius) continue;
        this.combat.damage(e, F.dmg * this.dmgK, { from: this.combat.playerUnit, kind: 'gold', stun: F.stun, knock: F.knock, at: U.center.clone().setY(U.center.y + 0.8), big: true, posture: 20 });
        n++;
      }
      if (n) this.scored(n, 0);
      this.fx.ultFinal?.(U.center, F.r);
      this.combat.shake(0.45); this.combat.hitStop(PC.feedback.stop.heavy); this.combat.flash?.(0xfff6dc, 0.28);
    }
    if (U.t > F.t + 1.2) { this.fx.ultEnd?.(U.handle); this.ult = null; }
  }

  // ---------- 调试：最近的招式与各段的结算 ----------
  logAct(a) { this.log.push({ id: a.id, key: a.key, t0: +this.time.toFixed(2), events: [], results: a.results, act: a }); if (this.log.length > 24) this.log.shift(); }
  logEvent(a, kind, o = {}) { const L = this.log.find((x) => x.id === a.id); if (L) L.events.push({ k: kind, t: +a.t.toFixed(3), ...o }); }

  // 换场景、力竭、再战、过场：一切归位（招式、举剑、缓冲与按住、蓄力、锁定、守势、反击窗口、无敌）
  reset() {
    if (this.act) this.endAct('blocked');
    if (this.guarding) this.exitGuard();
    this.clearInput();
    this.dropIai();
    this.tilt = 0;
    const ch = this.player.char;
    if (ch.clips) { ch.drawnSnap = false; ch.sheathTilt = 0; ch.sheathPull = 0; ch.sheathPose = 1; ch.gourdInHand = 0; }
    this.gourdK = 0;
    if (this.ult) { this.fx.ultEnd?.(this.ult.handle, true); this.ult = null; }
    this.iframes = 0; this.heal = null;
    this.guardHP = PC.guard.max; this.guardLock = 0; this.guardUsed = -99;
    this.parryUntil = -99; this.parryOpenT = -99; this.counterUntil = -99; this.parryHit = false;
    this.resolved.clear(); this.reacts.length = 0;
    this.combat.clearLateParry?.();
    this.target = null;
    if (this.lock) { this.lock = null; this.fx.lockOn?.(null); }
    this.player.ctl.lock = false; this.player.ctl.vx = this.player.ctl.vz = null; this.player.ctl.yaw = null; this.player.ctl.maxSpeed = null;
    this.combat.stopT = 0;                       // 顿帧不带进下一场
    this.fx.clearCombat?.();                     // 锁链、金环、月牙、地面圈、提示、点光一并收掉
    this.anim.stop?.(0.05);
  }
}
