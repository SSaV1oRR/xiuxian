// 存档：任务、行囊、探索、阅读、事件，保存在浏览器本地
import { PLAYER_COMBAT } from './combatConfig.js';

const KEY = 'qinglan.save.v1';
// 第十九轮：眼下的玩法里数量恒定的物品——养元丹恒为 99 颗（服用、奖励都不改变它；要恢复按数计，删掉这一项即可）
export const FIXED_ITEMS = { yangyuan: 99 };

const fresh = () => ({
  v: 1,
  quest: { herb: { stage: 0, count: 0 } },
  inv: {},
  merit: 0,
  found: [],
  read: [],
  talked: {},
  events: {},
  picked: [],
  pos: null,
  sword: null,                 // 第十五轮：当前佩剑（swords.json 里的 id）
  arena: { last: null, records: {} },   // 第十五轮：演武场——上次的选择、各对手各难度的首胜与最佳用时
  tower50: { wins: 0, best: null, firstClear: null, firstReward: false, tries: 0 },
  tower30: { wins: 0, best: null, firstClear: null, firstReward: false, tries: 0, seen: {} },   // 第二十四轮：通天塔第三十层——通关次数、最佳用时、首通时间、首通奖励、挑战次数、看过的过场（看过的可跳过）   // 第十六轮：通天塔第五十层——通关次数、最佳用时、首通时间、首通奖励是否已领、挑战次数
  gourd: null,                 // 第十九轮：回血葫芦 { left 还剩几口 }（null = 满的）
  // 第二十一轮：修为（progression.js：首次接入的初始化标记 init、等级 level、修炼灵气 qi、累计获得、一次性奖励的 ledger、任务与遭遇的奖励基准）；
  // cfgV：配置迁移版本（与初始化标记分开）；vitals：存档时的当前气血、灵力（读档直接恢复、校验范围，不做补偿）；
  // cools：各剑诀剩余冷却（读档照旧，不免费刷新；不记离线时间）；phoenix：九霄凤焰下一次的模式
  prog: null, cfgV: 0, vitals: null, cools: null, phoenix: null,
  // 第二十三轮：主动技能的装备槽 { v 版本, init 首次建立的时刻, slots 六格（技能 id 或 null）, learned 已习得 }——game/loadout.js 负责首次迁移与校验
  loadout: null,
  // 第二十五轮：技能的升级形态（独立的永久解锁标记）{ power: { form: 'inkFinale', unlocked, at } }——拔刀斩-终式·墨·终焉；临时的墨势与计数从不存档
  skillUp: null,
});

export class GameState {
  constructor() {
    this.d = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.v === 1) this.d = Object.assign(fresh(), d, { quest: Object.assign(fresh().quest, d.quest || {}) });
      }
    } catch (e) { console.warn('存档读取失败，已使用新档', e); }
    this.fixItems();
    this.listeners = [];
    this.beforeSave = null;       // 第二十一轮：存档前收集当前的气血、灵力、冷却（main.js 接上）
  }
  // 恒定数量的物品写回定数（有的地方直接改 d.inv，存档前一并校正）
  fixItems() { for (const [id, n] of Object.entries(FIXED_ITEMS)) this.d.inv[id] = n; }
  save() {
    this.fixItems();
    try { this.beforeSave?.(this.d); } catch (e) { console.warn('存档前收集失败', e); }
    try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (e) { /* 隐私模式等 */ }
    for (const f of this.listeners) f(this.d);
  }
  onChange(f) { this.listeners.push(f); }
  reset() { this.d = fresh(); this.save(); }

  get herb() { return this.d.quest.herb; }
  setHerb(o) { Object.assign(this.d.quest.herb, o); this.save(); }

  count(id) { return FIXED_ITEMS[id] ?? (this.d.inv[id] || 0); }
  give(id, n = 1) { if (id in FIXED_ITEMS) { this.save(); return; } this.d.inv[id] = (this.d.inv[id] || 0) + n; if (this.d.inv[id] <= 0) delete this.d.inv[id]; this.save(); }

  // 第十九轮：回血葫芦。装满几口 = base + perLevel × 修为等级（修为等级以后才有，现在 level 恒为 0：只留接口）
  get level() { return this.d.level ?? 0; }
  gourdMax() { const G = PLAYER_COMBAT.gourd; return G.base + Math.floor(G.perLevel * this.level); }
  gourdLeft() { const g = this.d.gourd; return g ? Math.max(0, Math.min(g.left, this.gourdMax())) : this.gourdMax(); }
  useGourd() { const n = this.gourdLeft(); if (n < 1) return false; this.d.gourd = { left: n - 1 }; this.save(); return true; }
  // 装满；本来就满的返回 false
  refillGourd() { const full = this.gourdLeft() >= this.gourdMax(); this.d.gourd = null; if (!full) this.save(); return !full; }

  discover(id) { if (this.d.found.includes(id)) return false; this.d.found.push(id); this.save(); return true; }
  found(id) { return this.d.found.includes(id); }
  markRead(id) { if (this.d.read.includes(id)) return false; this.d.read.push(id); this.save(); return true; }
  talk(id) { this.d.talked[id] = (this.d.talked[id] || 0) + 1; this.save(); return this.d.talked[id]; }
  talked(id) { return this.d.talked[id] || 0; }
  // 第十五轮：佩剑与演武记录
  get sword() { return this.d.sword; }
  setSword(id) { if (this.d.sword === id) return; this.d.sword = id; this.save(); }
  get arena() { if (!this.d.arena || typeof this.d.arena !== 'object') this.d.arena = { last: null, records: {} }; if (!this.d.arena.records) this.d.arena.records = {}; return this.d.arena; }
  setArenaLast(o) { this.arena.last = o; this.save(); }
  // 记一场胜利：返回 { first, best }（是否首胜、是否刷新最佳用时）
  arenaWin(key, secs) {
    const R = this.arena.records, r = R[key] || (R[key] = { wins: 0, first: null, best: null });
    const first = !r.first, best = r.best == null || secs < r.best;
    r.wins++; if (first) r.first = Date.now(); if (best) r.best = Math.round(secs * 10) / 10;
    this.save();
    return { first, best, rec: r };
  }
  event(id, v) { if (v === undefined) return this.d.events[id]; this.d.events[id] = v; this.save(); return v; }
}
