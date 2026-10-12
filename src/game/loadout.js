// 第二十三轮：主动技能的装备槽（六格）。四样东西分开管理：
//   技能定义与资源：combatConfig.js 的 PLAYER_COMBAT.skills（名字、字、消耗、冷却、说明）、SKILL_INFO（操作、特点、解锁条件）、各技能自己的配置；
//   学习与解锁：解锁条件（等级）由配置推导，学没学会记在存档 loadout.learned（达到条件即习得——读档、升级时检查）；
//   六个装备槽：存档 loadout.slots（技能 id 或 null；不重复）；
//   冷却与运行状态：仍在 moves.cools（按技能 id，卸下、换槽、重新装备、读档、换场景都不刷新）与各技能自己（凤凰、雷龙、剑阵、剑气）。
// 出招一律走 moves.press（统一入口）：槽键、鼠标中键（拔刀斩的别名）、剑诀栏与触屏的按钮都先到这里查「这一格装的是什么」；
// moves.press 自己也会拒绝没装备的主动技能（slotCheck，见 moves.js）——卸下之后旧的快捷键、别名、按钮都放不出来。
// 调整：脱战 calm 秒、且没有正在施法时才允许；某个技能还有召唤物、投射物或持续伤害时，不许卸下、移动或替换它。
import { LOADOUT as L, SKILL_INFO, PLAYER_COMBAT as PC } from './combatConfig.js';
import { FINALE } from './inkFinaleConfig.js';

const SLOT = new Set(L.skills);
const N = L.keys.length;

export class Loadout {
  // state：存档（game/state.js）；prog：修为（等级 → 解锁）
  constructor(state, { prog = null } = {}) {
    this.S = state; this.prog = prog;
    this.h = {};                         // moves、combat、phoenix、dragon、game、toast（main.js 接上）
    this.listeners = [];
    this.held = new Map();               // 按着的来源（槽号 / 'mmb'）→ 技能 id：松开时只松它按下的那一个
    this.log = [];                       // 最近的调整（自检）
    this.migrated = this.migrate();
  }
  attach(h) { Object.assign(this.h, h); }
  onChange(f) { this.listeners.push(f); }
  emit() { for (const f of this.listeners) f(this.slots); }
  get d() { return this.S.d.loadout; }
  get slots() { return this.d.slots; }
  at(i) { return this.d.slots[i] ?? null; }
  slotOf(id) { return this.d.slots.indexOf(id); }
  equipped(id) { return this.d.slots.includes(id); }
  isSlotSkill(id) { return SLOT.has(id); }
  get level() { return this.prog?.level ?? 21; }

  // ---------- 存档：首次接入（只迁移一次）、校验 ----------
  // 没有 loadout（第二十二轮以前的存档、新档）：按默认装配建一份，learned = 已达解锁条件的全部主动技能（老存档里原本就能用的照旧能用）；
  // 已有的：只校验（未知、重复、没学会的格子清空），合法的配置原样保留。等级、佩剑、任务、进度一概不动
  migrate() {
    const D = this.S.d, out = { init: false, fixed: [] };
    const okId = (id) => SLOT.has(id);
    if (!D.loadout || typeof D.loadout !== 'object' || D.loadout.v !== L.version || !Array.isArray(D.loadout.slots)) {
      const learned = L.skills.filter((id) => this.meets(id));
      D.loadout = { v: L.version, init: Date.now(), slots: L.defaults.map((id) => (learned.includes(id) ? id : null)), learned };
      out.init = true;
    }
    const d = D.loadout;
    if (!Array.isArray(d.learned)) { d.learned = L.skills.filter((id) => this.meets(id)); out.fixed.push('learned 重建'); }
    d.learned = [...new Set(d.learned.filter(okId))];
    const seen = new Set(), slots = [];
    for (let i = 0; i < N; i++) {
      let id = d.slots[i] ?? null;
      if (id != null && (!okId(id) || seen.has(id) || !d.learned.includes(id))) { out.fixed.push(`第 ${i + 1} 格「${id}」清空`); id = null; }
      if (id) seen.add(id);
      slots.push(id);
    }
    d.slots = slots;
    // 达到条件的自动习得（等级在别处变过：调试、读到更高等级的档）
    this.learnDue(true);
    if (out.init || out.fixed.length) this.S.save();
    return out;
  }
  // 解锁条件：SKILL_INFO 的 unlock.level（没有的入门即会）
  unlockOf(id) { return SKILL_INFO[id]?.unlock || null; }
  meets(id) { const u = this.unlockOf(id); return !u || this.level >= u.level; }
  learned(id) { return !!this.d?.learned?.includes(id); }
  // 等级达到时习得（升级、读档后调用）；返回新学会的
  learnDue(quiet = false) {
    const d = this.d;
    if (!d) return [];
    const got = [];
    for (const id of L.skills) if (!d.learned.includes(id) && this.meets(id)) { d.learned.push(id); got.push(id); }
    if (got.length && !quiet) {
      this.S.save();
      this.h.toast?.(`习得剑诀：${got.map((k) => `<b>${PC.skills[k].name}</b>`).join('、')}（按 <b>K</b> 打开剑诀面板装备）`);
      this.emit();
    }
    return got;
  }
  // 面板用：这个技能此刻的状态 { learned, meets, unlock, slot, busy }
  info(id) { return { learned: this.learned(id), meets: this.meets(id), unlock: this.unlockOf(id), slot: this.slotOf(id), busy: this.busyOf(id) }; }

  // ---------- 能不能调整 ----------
  // 全局：活着、脱战 calm 秒（交战、切磋、守关战中不行）、没有正在施法
  canEdit() {
    const M = this.h.moves, C = this.h.combat, g = this.h.game;
    if (C && !C.playerUnit.alive) return { ok: false, reason: '力竭之中，不能调整剑诀' };
    if (C && (C.state === 'battle' || C.duelBoss || C.bossFight) || g?.arena?.active) return { ok: false, reason: `交战之中——脱战 ${L.calm} 秒后才能调整` };
    const calm = this.prog ? this.prog.calmT : Infinity;
    if (calm < L.calm) return { ok: false, reason: `刚刚交过手——再过 ${(L.calm - calm).toFixed(1)} 秒才能调整`, wait: L.calm - calm };
    const a = M?.act;
    if (a && (SLOT.has(a.key) || a.key === 'iai' || a.key === 'iai_slash')) return { ok: false, reason: `正在施展「${a.def?.name || PC.skills[a.key]?.name || a.key}」` };
    if (M?.iai) return { ok: false, reason: '正在纳刀蓄势' };
    if (this.h.finale?.active) return { ok: false, reason: `正在施展「${FINALE.name}」` };     // 第二十五轮：处决演出中不许换装
    if (this.h.phoenix?.pre && !this.h.phoenix.pre.cancel) return { ok: false, reason: '正在舞刀召凤' };
    if (this.h.dragon?.casting) return { ok: false, reason: '正在引雷起势' };
    return { ok: true };
  }
  // 某个技能还有召唤物、投射物或持续伤害：不许卸下、移动或替换它
  busyOf(id) {
    const M = this.h.moves, C = this.h.combat;
    if (id === 'phoenix') { const P = this.h.phoenix; if (P?.active) return '凤凰还在场'; if (P?.zones?.length) return '凤焰火带、印记还在'; return null; }
    if (id === 'dragon') return this.h.dragon?.active ? '雷龙还在场' : null;
    if (id === 'ult') return M?.ult ? '剑阵还没散' : null;
    if (id === 'qi') return C?.projectiles?.some((p) => p.kind === 'wave' && !p.short) ? '剑气还在飞' : null;
    if (id === 'power') return C?.projectiles?.some((p) => p.kind === 'wave' && p.short) ? '拔刀斩的剑气还在飞' : null;
    return null;
  }

  // ---------- 调整（面板调用；每次成功都存档、通知剑诀栏）----------
  // 装到第 slot 格：已在别的格里就是移动（与那一格互换）；这一格原有的被替换下来
  equip(id, slot) {
    const r = this.check(slot);
    if (!r.ok) return r;
    if (!SLOT.has(id)) return { ok: false, reason: '不是可装备的主动技能' };
    if (!this.learned(id)) { const u = this.unlockOf(id); return { ok: false, reason: u ? `尚未习得：${u.text}` : '尚未习得' }; }
    const s = this.d.slots, from = s.indexOf(id), old = s[slot];
    if (from === slot) return { ok: true, same: true };
    for (const k of [id, old]) { const b = k && this.busyOf(k); if (b) return { ok: false, reason: `${PC.skills[k].name}：${b}，暂不能调整` }; }
    if (from >= 0) s[from] = old ?? null;
    s[slot] = id;
    return this.done('equip', { id, slot, from, replaced: from >= 0 ? null : old ?? null, moved: from >= 0 ? old ?? null : null });
  }
  unequip(slot) {
    const r = this.check(slot);
    if (!r.ok) return r;
    const id = this.d.slots[slot];
    if (!id) return { ok: true, same: true };
    const b = this.busyOf(id);
    if (b) return { ok: false, reason: `${PC.skills[id].name}：${b}，暂不能卸下` };
    this.d.slots[slot] = null;
    this.releaseHeld(id);
    return this.done('unequip', { id, slot });
  }
  swap(i, j) {
    const r = this.check(i), r2 = this.check(j);
    if (!r.ok) return r;
    if (!r2.ok) return r2;
    if (i === j) return { ok: true, same: true };
    const s = this.d.slots;
    for (const k of [s[i], s[j]]) { const b = k && this.busyOf(k); if (b) return { ok: false, reason: `${PC.skills[k].name}：${b}，暂不能调整` }; }
    [s[i], s[j]] = [s[j], s[i]];
    return this.done('swap', { i, j });
  }
  // 第一个空格（没有就是 -1：面板要求选替换的位置）
  firstEmpty() { return this.d.slots.indexOf(null); }
  check(slot) {
    if (!(slot >= 0 && slot < N)) return { ok: false, reason: '没有这一格' };
    return this.canEdit();
  }
  done(kind, o) {
    // 按着的槽键所对应的技能变了：当作松开（拔刀斩的蓄势不会卡在按住）
    for (const [src, id] of [...this.held]) if (typeof src === 'number' && this.d.slots[src] !== id) this.releaseSrc(src);
    this.log.unshift({ kind, ...o, slots: this.d.slots.slice(), t: Date.now() });
    if (this.log.length > 30) this.log.length = 30;
    this.S.save();
    this.emit();
    return { ok: true, ...o };
  }
  // 自检：直接装配（不看脱战、施法；仍校验 id、去重、学会）
  debugSet(slots) {
    const s = [], seen = new Set();
    for (let i = 0; i < N; i++) { const id = slots[i] ?? null; s.push(id && SLOT.has(id) && !seen.has(id) && this.learned(id) ? (seen.add(id), id) : null); }
    this.d.slots = s;
    this.held.clear();
    this.S.save(); this.emit();
    return s.slice();
  }

  // ---------- 输入 ----------
  // 槽键（Q X R V 1 3）、剑诀栏 / 触屏的槽按钮：i 槽号，down 按下 / 松开。空格提示；拔刀斩按住蓄势、松开出刀
  pressSlot(i, down) {
    if (!down) { this.releaseSrc(i); return true; }
    const id = this.at(i);
    if (!id) { this.h.moves?.fx?.deny?.(null, 'empty'); return true; }
    if (id === 'power' && !this.claimPower(i)) return true;
    this.held.set(i, id);
    this.h.moves?.press(id, true);
    return true;
  }
  // 别名：鼠标中键（'mmb'）、Z（'z'，第二十五轮恢复）= 拔刀斩——只在拔刀斩装备时有效；与槽键共用同一个技能入口、蓄力状态（拔刀斩本身没有冷却）
  alias(id, down, src = 'mmb') {
    if (!down) { this.releaseSrc(src); return true; }
    if (!this.equipped(id)) { this.h.moves?.fx?.deny?.(id, 'unequipped'); return false; }
    if (id === 'power' && !this.claimPower(src)) return false;
    this.held.set(src, id);
    this.h.moves?.press(id, true);
    return true;
  }
  // 第二十五轮：同一次蓄力只认一个发起者——蓄力（或已按下、待开始的蓄力）进行中，别的槽键、别名按下一律不理：
  // 不重复启动、不重复收费、不重复出刀；松开也只认发起的那一个（见 releaseSrc）
  claimPower(src) {
    const M = this.h.moves;
    const busy = !!(M && (M.iai || M.act?.key === 'iai' || M.buffer?.kind === 'power' || M.held?.power));
    if (busy && this.powerOwner != null && this.powerOwner !== src && this.held.has(this.powerOwner)) {
      this.ignoredAlias = (this.ignoredAlias || 0) + 1;
      if (this.h.finale) this.h.finale.stats.ignoredAlias++;
      return false;
    }
    this.powerOwner = src;
    return true;
  }
  releaseSrc(src) {
    const id = this.held.get(src);
    if (id == null) return;
    this.held.delete(src);
    // 拔刀斩：只有发起这次蓄力的来源松开才算松开（第二十五轮：不再是「还有别的来源按着就不松」）
    if (id === 'power' && (this.powerOwner === src || this.powerOwner == null || !this.held.has(this.powerOwner))) { this.powerOwner = null; this.h.moves?.press('power', false); }
  }
  releaseHeld(id) { for (const [src, k] of [...this.held]) if (k === id) this.releaseSrc(src); }
  releaseAll() { for (const src of [...this.held.keys()]) this.releaseSrc(src); }
  // 剑诀栏、面板：第 i 格的键名
  label(i) { return L.labels[i]; }
  keyIndex(code) { return L.keys.indexOf(code); }
}
