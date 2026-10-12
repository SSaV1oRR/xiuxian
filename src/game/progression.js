// 第二十一轮：境界成长（修为）。参数见 progressConfig.js。
//   等级是唯一权威：境界、小境界、属性倍率、御剑续航都由等级与配置推导（存档里的境界名一律不认，读档时校验）。
//   修炼灵气（升级用）与战斗灵力（剑诀用）分开：灵气只在主动打坐时按「本级基础吸收 × 区域浓度 × 合法加成」吸收，另有战斗与任务奖励；
//   99 级（当前上限）起不再积累可用于升级的灵气，只记累计获得量作统计。
//   提升修为：脱战、存活、安全时才可启动；聚气演出 → 最终校验 → 一次性提交（操作锁：重复点击、错误恢复都不会多扣、多升）。
//   属性：以 21 级的基础数据为准按 k^((L−21)/78) 计算，每次从基础数据重新算（升级、换装、读档都不会叠乘）；
//   升级时把上限的增量加到当前值（已损失的仍是损失），换装保持百分比，读档直接恢复存下的当前值。
import { REALMS, DOMAINS, SUB_STAGES, CAP_TEXT, LEVEL, PACE, QI_TIERS, QI_AREAS, QI_BONUS, ASCEND, STATS, REWARDS, ENEMY_RANKS, PROG_VERSION, FLIGHT } from './progressConfig.js';
import { PLAYER_COMBAT as PC } from './combatConfig.js';
import { QI_KINDS } from './regions.js';

const LOWER = REALMS.filter((r) => r.domain === 'lower');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// =====================================================================================
// 公式（纯函数：界面、自检、报告都用这几条）
// =====================================================================================
export function baseNeed(L) { return Math.round(LEVEL.need.base * Math.pow(LEVEL.need.growth, L - 1)); }
export function isBreakthrough(L) { return LEVEL.breakthrough.levels.includes(L); }
export function breakExtra(L) { return isBreakthrough(L) ? Math.round(baseNeed(L) * LEVEL.breakthrough.extra) : 0; }
export function totalNeed(L) { return L >= LEVEL.max ? 0 : baseNeed(L) + breakExtra(L); }
// 目标时间 T(L)：在 PACE.ref 倍浓度下攒满 L 级基础需求的秒数（分段线性）
export function targetTime(L) {
  const S = PACE.segs, s = S.find((g) => L >= g.from && L <= g.to) || (L < S[0].from ? S[0] : S[S.length - 1]);
  const u = clamp((L - s.from) / Math.max(1, s.to - s.from), 0, 1);
  return s.t0 + (s.t1 - s.t0) * u;
}
// 普通区域（1 倍）每秒吸收的修炼灵气
export function baseAbsorb(L) { return L >= LEVEL.max ? 0 : baseNeed(L) / (PACE.ref * targetTime(L)); }
export function realmOf(L) {
  if (!(L >= 1)) return null;
  if (L > LEVEL.max) return REALMS.find((r) => r.domain === 'upper');
  return LOWER.find((r) => L >= r.lv[0] && L <= r.lv[1]) || LOWER[LOWER.length - 1];
}
export function subStageOf(L) {
  const r = realmOf(L);
  if (!r || !r.lv) return '';
  const [a, b] = r.lv;
  if (L >= b) return SUB_STAGES.last;
  const n = b - a, i = L - a;              // 除最后一级外 n 级，均分三段
  return SUB_STAGES.split[Math.min(SUB_STAGES.split.length - 1, Math.floor((i * SUB_STAGES.split.length) / n))];
}
// 显示：金丹初期 / 出窍（分神）大圆满（alias 只在长格式里带）
export function realmLabel(L, { alias = false } = {}) {
  const r = realmOf(L);
  if (!r) return '—';
  return (alias && r.alias ? `${r.name}（${r.alias}）` : r.name) + subStageOf(L);
}
// 属性倍率：kind = dmg / hp / mp
export function statMul(kind, L) { return Math.pow(STATS[kind], (L - STATS.ref) / STATS.span); }
export function rewardScale(enemyLv, playerLv) { const S = REWARDS.scale; return clamp(1 + S.k * (enemyLv - playerLv), S.min, S.max); }
// 大境界比较：a 的大境界低于 b？（未知的一律不算低——不触发境界克制）
export function lowerRealm(aLevel, bLevel) {
  const a = realmOf(aLevel), b = realmOf(bLevel);
  return !!(a && b && a.order < b.order);
}
// 敌人的等级与级别（未配置的返回 null：不发奖励、不触发境界克制）
export function rankOf(u) {
  if (!u) return null;
  if (u.rank) return u.rank;
  if (u.boss) return ENEMY_RANKS[u.kind] || null;
  if (u.duel) { const lv = ENEMY_RANKS.duel?.[u.diffKey]; return lv ? { level: lv, tier: 'duel' } : null; }
  if (u.dummy) return null;
  return ENEMY_RANKS[u.kind] || null;
}
// 用时核对：from 级攒到 to 级（各级总需求按 ref 倍浓度）需要多少秒——报告与自检用
export function paceSecs(from, to, k = PACE.ref) {
  let s = 0;
  for (let L = from; L < to; L++) s += totalNeed(L) / (baseAbsorb(L) * k);
  return s;
}

// =====================================================================================
// 修为
// =====================================================================================
let QSEQ = 0;
export class Progression {
  // state：存档（game/state.js）；hooks：{ combat, moves, game, ui, toast } 在 main.js 里接上
  constructor(state) {
    this.S = state;
    this.h = {};
    this.asc = null;                 // 提升修为进行中：{ token, t, L0, need, ... }
    this.ascSeq = 0;
    this.calmT = 0;                  // 已脱战多久（游戏时间）
    this.lastHitSeen = -99;
    this.equip = { hpMul: 1, mpMul: 1, dmgMul: 1, hpAdd: 0, mpAdd: 0 };   // 装备修正（眼下的剑没有属性——留接口；自检用 setEquip 模拟换装）
    this.log = [];                   // 最近的灵气收入（界面、自检）
    this.migrated = this.migrate();
  }
  get d() { return this.S.d.prog; }
  get level() { return this.d.level; }
  get qi() { return this.d.qi; }
  get capped() { return this.d.level >= LEVEL.max; }
  attach(h) { Object.assign(this.h, h); }

  // ---------- 存档：首次接入、迁移、校验 ----------
  // 首次接入（没有初始化标记）：21 级金丹初期、本级进度 0；已经接入或升过级的角色不再初始化。
  // 配置迁移版本（d.cfgV）单独记：参数更新时只校正，不重新初始化；境界名不存（存了的也删掉），一律由等级推导
  migrate() {
    const D = this.S.d, out = { init: false, fixed: [] };
    if (!D.prog || typeof D.prog !== 'object' || !D.prog.init) {
      const keep = D.prog && typeof D.prog === 'object' ? D.prog : {};
      D.prog = { init: Date.now(), level: LEVEL.init, qi: 0, gained: 0, capGained: 0, ledger: keep.ledger || {}, quests: keep.quests || {}, ups: [] };
      out.init = true;
    }
    const p = D.prog;
    // 校验等级与灵气（非法值修正，不做任何升级补偿）
    const L = Math.round(Number(p.level));
    if (!Number.isFinite(L) || L < LEVEL.min) { out.fixed.push(`等级 ${p.level} → ${LEVEL.init}`); p.level = LEVEL.init; }
    else if (L > LEVEL.max) { out.fixed.push(`等级 ${p.level} → ${LEVEL.max}`); p.level = LEVEL.max; }
    else if (L !== p.level) { out.fixed.push(`等级 ${p.level} → ${L}`); p.level = L; }
    for (const k of ['qi', 'gained', 'capGained']) if (!Number.isFinite(p[k]) || p[k] < 0) { if (p[k] != null) out.fixed.push(`${k} ${p[k]} → 0`); p[k] = 0; }
    if (!p.ledger || typeof p.ledger !== 'object') p.ledger = {};
    if (!p.quests || typeof p.quests !== 'object') p.quests = {};
    if (!Array.isArray(p.ups)) p.ups = [];
    // 已在当前上限：不留可用于升级的灵气（记入到顶后的累计）
    if (p.level >= LEVEL.max && p.qi > 0) { out.fixed.push(`上限时的灵气 ${Math.round(p.qi)} 记入累计`); p.capGained += p.qi; p.qi = 0; }
    for (const k of ['realm', 'realmName', 'stage']) if (k in p) { out.fixed.push(`删去存档里的境界名「${p[k]}」（由等级推导）`); delete p[k]; }
    // 旧版本的配置迁移（眼下只有第 1 版）
    if ((D.cfgV || 0) < PROG_VERSION) { out.cfgFrom = D.cfgV || 0; D.cfgV = PROG_VERSION; }
    // 已领取、进行中的宗门任务：领取时还没有等级系统，补记奖励基准（记在这一刻，之后不再变）
    if (D.quest?.herb && D.quest.herb.stage >= 1 && D.quest.herb.stage < 3 && !p.quests.herb) this.recordQuest('herb', { silent: true });
    if (out.init || out.fixed.length || out.cfgFrom != null) this.S.save();
    return out;
  }

  // ---------- 推导 ----------
  get realm() { return realmOf(this.level); }
  label(o) { return realmLabel(this.level, o); }
  info(L = this.level) {
    const r = realmOf(L);
    return {
      level: L, realm: r, domain: DOMAINS[r?.domain] || '', stage: subStageOf(L), label: realmLabel(L), labelLong: realmLabel(L, { alias: true }),
      base: L >= LEVEL.max ? 0 : baseNeed(L), extra: breakExtra(L), total: totalNeed(L), breakthrough: isBreakthrough(L), capped: L >= LEVEL.max,
      capText: L >= LEVEL.max ? CAP_TEXT : null, next: L < LEVEL.max ? realmOf(L + 1) : null, absorb: baseAbsorb(L), T: targetTime(L),
    };
  }
  // 境界 id（伤害快照、境界克制、御剑）
  get realmId() { return this.realm?.id; }
  flightClass() { return this.realm?.fly || 'long'; }
  flightRule() { const c = this.flightClass(); return c === 'short' ? FLIGHT.short : null; }

  // ---------- 属性 ----------
  mul(kind, L = this.level) { return statMul(kind, L); }
  maxHpAt(L = this.level) { return PC.hp * this.mul('hp', L) * this.equip.hpMul + this.equip.hpAdd; }
  maxMpAt(L = this.level) { return PC.mp * this.mul('mp', L) * this.equip.mpMul + this.equip.mpAdd; }
  dmgK(L = this.level) { return this.mul('dmg', L) * this.equip.dmgMul; }
  // 把当前等级的上限与伤害倍率交给战斗（mode：levelup 加上限增量 / equip 保持百分比 / load 恢复存下的当前值 / init 只设上限）
  applyStats(mode = 'init', saved = null) {
    const C = this.h.combat, M = this.h.moves;
    if (!C || !M) return;
    const U = C.playerUnit, hp1 = this.maxHpAt(), mp1 = this.maxMpAt();
    const hp0 = U.maxHp, mp0 = M.mpMax ?? PC.mp;
    if (mode === 'levelup') { U.hp = U.hp + (hp1 - hp0); M.mp = M.mp + (mp1 - mp0); }
    else if (mode === 'equip') { U.hp = hp0 > 0 ? (U.hp / hp0) * hp1 : hp1; M.mp = mp0 > 0 ? (M.mp / mp0) * mp1 : mp1; }
    else if (mode === 'load' && saved) {
      if (Number.isFinite(saved.hp)) U.hp = saved.hp;
      if (Number.isFinite(saved.mp)) M.mp = saved.mp;
    }
    U.maxHp = hp1; M.mpMax = mp1; M.dmgK = this.dmgK();
    // 合法范围（存活的不低于 1——读档读到 0 气血不当场倒下，由醒来流程处理）
    U.hp = clamp(U.hp, U.alive ? Math.min(1, hp1) : 0, hp1);
    M.mp = clamp(M.mp, 0, mp1);
    C.hud?.setHp(U.hp, U.maxHp);
  }
  // 自检：模拟换装（保持百分比；不触发升级补偿）
  setEquip(o) { Object.assign(this.equip, { hpMul: 1, mpMul: 1, dmgMul: 1, hpAdd: 0, mpAdd: 0 }, o || {}); this.applyStats('equip'); }

  // ---------- 区域浓度 ----------
  // ctx：{ world, pos, anchors, terrain, qiHere(), onIsle }；返回 { ok, tier, k, name, source, reason }
  zoneAt(ctx) {
    const { world, pos } = ctx;
    if (world === 'boss50') return { ok: false, reason: '封印殿中灵压沉重，不能打坐' };
    if (world === 'boss30') return { ok: false, reason: '剑台上烬火灼人，不能打坐' };
    const q = ctx.qiHere ? ctx.qiHere() : { kind: 'spirit', level: 1, source: '' };
    if (!QI_KINDS[q.kind]?.cultivate) return { ok: false, reason: QI_KINDS[q.kind]?.warn || '此处不宜吐纳', kind: q.kind };
    const cands = [];
    let base = 'normal';
    if (world === 'surface') {
      const A = ctx.anchors || {}, d = (a) => (a ? Math.hypot(pos.x - a.x, pos.z - a.z) : Infinity);
      const inCore = ctx.terrain?.inCore ? ctx.terrain.inCore(pos.x, pos.z) : true;
      if (!inCore && !ctx.onIsle) base = 'thin';
      if (d(A.meditate) <= QI_AREAS.array) cands.push(['array', '聚灵阵']);
      if (d(A.meditatePool) <= QI_AREAS.vein) cands.push(['vein', '灵池池底灵脉']);
      if (d(A.meditatePool) <= QI_AREAS.pool) cands.push(['sect', '灵池']);
      if (d(A.meditate) <= QI_AREAS.plaza) cands.push(['sect', '演武广场']);
      if (inCore && pos.z < QI_AREAS.backhillZ) cands.push(['sect', '后山']);
    } else if (world === 'hall') cands.push(['sect', '问道殿']);
    let best = [base, base === 'thin' ? '宗门之外，灵气稀薄' : q.source || ''];
    for (const c of cands) if (QI_TIERS[c[0]].k > QI_TIERS[best[0]].k) best = c;        // 重叠取最高的一档，不叠乘
    const T = QI_TIERS[best[0]];
    return { ok: true, tier: best[0], k: T.k, name: T.name, source: best[1] };
  }
  // 此刻的吸收速度（每秒）
  rateAt(zone, L = this.level) { return zone?.ok ? baseAbsorb(L) * zone.k * QI_BONUS.base : 0; }

  // ---------- 修炼灵气的收入 ----------
  // 打坐：dt 秒、区域 zone（由 game.js 每帧给）
  absorb(dt, zone) {
    const v = this.rateAt(zone) * dt;
    if (v > 0) this.add(v, { src: 'meditate', quiet: true });
    return v;
  }
  // 加灵气：99 级起不再积累可用于升级的部分，只记累计获得量
  add(v, { src = '', label = '', quiet = false, id = null } = {}) {
    if (!(v > 0)) return 0;
    const p = this.d;
    p.gained += v;
    if (this.capped) { p.capGained += v; if (!quiet) this.note(v, src, label, true); return 0; }
    p.qi += v;
    if (!quiet) this.note(v, src, label, false);
    if (src !== 'meditate') this.S.save();
    void id;
    return v;
  }
  note(v, src, label, capped) {
    this.log.unshift({ v: +v.toFixed(1), src, label, capped, at: Date.now() });
    if (this.log.length > 20) this.log.length = 20;
    this.h.toast?.(capped ? `修炼灵气 +${Math.round(v)}（${label || src}）——已达当前上限，不再积累` : `修炼灵气 <b>+${Math.round(v)}</b>（${label || src}）`);
  }
  // 遭遇开始：记下奖励基准（玩家等级、本级基础需求、敌人等级）；之后升级也不改这一份
  recordEncounter(u) {
    if (!u || u._rw) return u?._rw;
    const r = rankOf(u), L = this.level;
    u._rw = r && !u.duel && !u.dummy && !u.noReward ? { need: baseNeed(Math.min(L, LEVEL.max - 1)), pl: L, el: r.level, tier: r.tier, t: Date.now() } : { none: true, why: !r ? 'unranked' : 'training' };
    return u._rw;
  }
  // 敌人倒下：玩家一方打过（engaged）的才发；每个敌人只结算一次；Boss 不按这里（整场结算另算）
  onKill(u) {
    const R = u?._rw;
    if (!R || R.none || R.paid || !R.engaged || u.boss) return 0;
    R.paid = true;
    const frac = REWARDS.kill[R.tier] ?? 0;
    if (!frac) return 0;
    const v = frac * R.need * rewardScale(R.el, R.pl);
    return this.add(v, { src: 'kill', label: `降妖 · ${u.cfg?.name || u.kind}` });
  }
  // 一次性的完成事件（Boss 首通、宗门任务、秘境完成）：ledger 去重，同一事件只发一次
  grantOnce(eventId, frac, rec, label) {
    const p = this.d;
    if (p.ledger[eventId] != null) return 0;
    if (!rec || !(frac > 0)) { p.ledger[eventId] = 0; this.S.save(); return 0; }
    const v = frac * rec.need * rewardScale(rec.el ?? rec.pl, rec.pl);
    p.ledger[eventId] = Math.round(v * 10) / 10;
    const got = this.add(v, { src: 'event', label });
    this.S.save();
    return got || (this.capped ? 0 : v);
  }
  granted(eventId) { return this.d.ledger[eventId] != null; }
  // 宗门任务：领取时记下基准（按任务自身的等级修正）
  recordQuest(id, { silent = false } = {}) {
    const Q = REWARDS.quests[id], p = this.d;
    if (!Q || p.quests[id]) return p.quests[id];
    const L = this.level;
    p.quests[id] = { need: baseNeed(Math.min(L, LEVEL.max - 1)), pl: L, el: Q.level, diff: Q.diff, at: Date.now() };
    if (!silent) this.S.save();
    return p.quests[id];
  }
  completeQuest(id) {
    const Q = REWARDS.quests[id];
    if (!Q) return 0;
    const rec = this.d.quests[id] || this.recordQuest(id);
    return this.grantOnce(`quest.${id}`, REWARDS.quest[Q.diff], rec, `宗门任务 · ${Q.name}`);
  }
  // 遭遇基准（Boss 整场、秘境）：record(key, level) 记下，grant 时用
  recordEvent(key, enemyLevel) {
    const p = this.d;
    (p.events ||= {});
    if (!p.events[key]) { const L = this.level; p.events[key] = { need: baseNeed(Math.min(L, LEVEL.max - 1)), pl: L, el: enemyLevel ?? L, at: Date.now() }; this.S.save(); }
    return p.events[key];
  }
  clearEvent(key) { if (this.d.events) delete this.d.events[key]; }

  // ---------- 提升修为 ----------
  // 脱战计时：每帧由 main.js 调用（交战中清零；受伤从挨打的那一刻起算——sinceHit：距上次受伤的战斗时间）
  tickCalm(dt, inCombat, sinceHit = Infinity) { this.calmT = inCombat ? 0 : Math.max(0, Math.min(this.calmT + dt, Number.isFinite(sinceHit) ? sinceHit : Infinity)); }
  // 能不能提升：返回 { ok, reason }
  canAscend(ctx = {}) {
    const L = this.level, need = totalNeed(L);
    if (this.asc) return { ok: false, reason: '正在聚气' };
    if (L >= LEVEL.max) return { ok: false, reason: CAP_TEXT.line1 };
    if (this.d.qi < need) return { ok: false, reason: `修炼灵气不足（${Math.floor(this.d.qi)} / ${need}）` };
    const S = this.safety(ctx);
    if (!S.ok) return S;
    return { ok: true };
  }
  safety(ctx = {}) {
    const C = this.h.combat, U = C?.playerUnit;
    if (U && !U.alive) return { ok: false, reason: '力竭之中' };
    if (this.calmT < ASCEND.calm) return { ok: false, reason: `须脱战 ${ASCEND.calm} 秒（还差 ${Math.max(0, ASCEND.calm - this.calmT).toFixed(1)} 秒）` };
    if (ctx.unsafe) return { ok: false, reason: ctx.unsafe };
    return { ok: true };
  }
  // 启动：加锁；聚气演出由 game.js 画。返回 { ok, reason, token }
  beginAscend(ctx = {}) {
    if (this.asc) return { ok: false, reason: '正在聚气', dup: true };          // 操作锁：重复点击不会启动第二次
    const c = this.canAscend(ctx);
    if (!c.ok) return c;
    const L = this.level;
    this.asc = { token: ++this.ascSeq, t: 0, L0: L, need: totalNeed(L), base: baseNeed(L), extra: breakExtra(L), qi0: this.d.qi, hit0: this.h.combat?.playerUnit.lastHit ?? -99, world: ctx.world };
    return { ok: true, token: this.asc.token };
  }
  // 每帧：中断条件（移动、受击、力竭、换场景、开战）由 ctx 给出；到时间做最终校验并一次性提交
  tickAscend(dt, ctx = {}) {
    const A = this.asc;
    if (!A) return null;
    const U = this.h.combat?.playerUnit;
    const why = ctx.moved ? '移动' : U && !U.alive ? '力竭' : U && U.lastHit !== A.hit0 ? '受击' : ctx.world !== A.world ? '换场景' : ctx.inCombat ? '开战' : ctx.unsafe ? ctx.unsafe : null;
    if (why) return this.cancelAscend(why);
    A.t += dt;
    if (A.t < ASCEND.gather) return { stage: 'gather', k: A.t / ASCEND.gather };
    return this.commitAscend(A.token, ctx);
  }
  cancelAscend(reason) {
    const A = this.asc;
    if (!A) return null;
    this.asc = null;
    return { stage: 'cancel', reason, from: A.L0 };
  }
  // 一次性提交：先校验、再把新值一起算好、最后一起写——中途任何一步不成立都不改等级与灵气
  commitAscend(token, ctx = {}) {
    const A = this.asc;
    if (!A || A.token !== token) return { stage: 'stale' };                       // 过期的提交（已取消或已提交过）
    this.asc = null;                                                                // 先解锁：之后的异常也不会留下「提交了一半」
    const p = this.d, L = p.level, need = totalNeed(L);
    if (L !== A.L0) return { stage: 'cancel', reason: '等级已变' };
    if (p.qi < need) return { stage: 'cancel', reason: '灵气不足' };
    const S = this.safety(ctx);
    if (!S.ok) return { stage: 'cancel', reason: S.reason };
    const next = { level: L + 1, qi: p.qi - need };
    // 升到当前上限：剩余的灵气不再留作升级之用，记入到顶后的累计（其余等级之间照常结转）
    const capLeft = next.level >= LEVEL.max ? next.qi : 0;
    if (capLeft) next.qi = 0;
    p.level = next.level; p.qi = next.qi; p.capGained += capLeft;
    p.ups.push({ from: L, to: next.level, need, at: Date.now() });
    if (p.ups.length > 40) p.ups.splice(0, p.ups.length - 40);
    this.applyStats('levelup');
    this.S.save();
    this.onLevel?.(next.level);                     // 第二十三轮：达到解锁等级的剑诀即习得（装备槽）
    return { stage: 'done', from: L, to: next.level, need, left: next.qi, capLeft, realmUp: realmOf(L)?.id !== realmOf(next.level)?.id };
  }

  // 调试：直接设等级（只在自检里用；不发奖励、不做升级补偿以外的事）
  debugSetLevel(L, { qi = 0 } = {}) {
    const p = this.d;
    p.level = clamp(Math.round(L), LEVEL.min, LEVEL.max); p.qi = qi;
    this.applyStats('equip');
    this.S.save();
    this.onLevel?.(p.level);
  }
  static seq() { return ++QSEQ; }
}
