// 第二十一轮：境界成长——等级与境界、修炼灵气（升级需求、吸收效率、地图浓度）、战斗与任务奖励、属性成长、提升修为的流程。
// 参数都在这里（公式在 progression.js）；首版配置，未经实战平衡。时间单位秒（统一的游戏时间：暂停、页面失焦时不走），长度单位米。
// 与战斗灵力分开：这里的「修炼灵气」只用于等级成长；战斗灵力（剑诀消耗）见 combatConfig.js 的 PLAYER_COMBAT.mp。

// 配置迁移版本：改了公式或参数时加一（读档时据此校正存档）。与「首次接入等级系统」的初始化标记分开存——更新参数不会重新初始化角色
export const PROG_VERSION = 1;

// ---------- 境界 ----------
// 下界九境（当前开放 1–99 级），上界五境（100 级起预留，本次不开放）。id 稳定：存档、调试只认 id，名字只是显示。
// order 是全序：任意上界境界都高于下界。lv [起, 止]：止级就是该境的「大圆满」，也是跨大境界的那一级（由它升下一级时有突破额外消耗）。
// life：寿元说明（只作说明，不开发自然老死）；fly：御剑——none 不能、short 短续航、long 长续航（见 FLIGHT）
// 「出窍与分神是同一境界」：名为出窍，又称分神
export const REALMS = [
  { id: 'lianqi', name: '练气', domain: 'lower', order: 1, lv: [1, 10], life: '寿元约百岁', fly: 'none' },
  { id: 'zhuji', name: '筑基', domain: 'lower', order: 2, lv: [11, 20], life: '寿元约二至三百年', fly: 'short' },
  { id: 'jindan', name: '金丹', domain: 'lower', order: 3, lv: [21, 32], life: '寿元约五百年', fly: 'long' },
  { id: 'yuanying', name: '元婴', domain: 'lower', order: 4, lv: [33, 44], life: '寿元约一千年', fly: 'long' },
  { id: 'chuqiao', name: '出窍', alias: '分神', domain: 'lower', order: 5, lv: [45, 55], fly: 'long' },
  { id: 'huashen', name: '化神', domain: 'lower', order: 6, lv: [56, 66], fly: 'long' },
  { id: 'heti', name: '合体', domain: 'lower', order: 7, lv: [67, 77], fly: 'long' },
  { id: 'dujie', name: '渡劫', domain: 'lower', order: 8, lv: [78, 88], fly: 'long' },
  { id: 'dacheng', name: '大乘', domain: 'lower', order: 9, lv: [89, 99], fly: 'long' },
  // 上界：飞升之后（后续开放；金仙为最终境界，最终数字等级以后确定）
  { id: 'tianxian', name: '天仙', domain: 'upper', order: 10, lv: null, fly: 'long' },
  { id: 'zhenxian', name: '真仙', domain: 'upper', order: 11, lv: null, fly: 'long' },
  { id: 'xuanxian', name: '玄仙', domain: 'upper', order: 12, lv: null, fly: 'long' },
  { id: 'taiyi', name: '太乙玄仙', domain: 'upper', order: 13, lv: null, fly: 'long' },
  { id: 'jinxian', name: '金仙', domain: 'upper', order: 14, lv: null, fly: 'long', final: true },
];
export const DOMAINS = { lower: '下界', upper: '上界' };
// 小境界：境内除最后一级外均分为初期 / 中期 / 后期，最后一级（突破的那一级）为大圆满。例：金丹 21–24 初期、25–28 中期、29–31 后期、32 大圆满
export const SUB_STAGES = { split: ['初期', '中期', '后期'], last: '大圆满' };
// 99 级（当前版本上限）的显示
export const CAP_TEXT = { line1: '大乘大圆满 · 已达当前版本上限', line2: '飞升上界：后续开放' };

// ---------- 等级与升级需求 ----------
// 基础需求（由 L 级升到 L+1 级）：baseNeed(L) = round(base × growth^(L−1))
// 跨大境界：breakthrough.levels 这些级升下一级时额外消耗 round(baseNeed(L) × extra)，其余等级额外消耗为 0；总需求 = 基础 + 额外
// 「基础需求递增，大境界突破额外消耗 80%。」——突破之后总需求允许回落，不保证每一级总需求都严格递增
export const LEVEL = {
  min: 1, max: 99,
  init: 21,                                  // 角色首次接入等级系统：21 级金丹初期、本级进度 0、九霄凤焰已解锁，其余进度与战斗实力不变
  need: { base: 2000, growth: 1.10 },
  breakthrough: { levels: [10, 20, 32, 44, 55, 66, 77, 88], extra: 0.8 },
};

// ---------- 修炼效率（按目标节奏反推）----------
// 在 ref 倍浓度（4 倍灵脉）、不含其他加成时，攒满 L 级基础需求的目标时间 T(L)（秒），分段线性：
//   1–21 级：T = 45 + 75 × (L−1)/20；21–98 级：T = 120 + 180 × (L−21)/77
// 普通区域（1 倍）的基础吸收速度 baseAbsorb(L) = baseNeed(L) / (ref × T(L))（每秒），实际速度 = baseAbsorb × 区域浓度 × 合法修炼加成。
// 不逐级取整，保证用时贴合目标：21→22 约 2 分钟、55→56（含突破额外 80%）约 6 分钟、98→99 约 5 分钟、21→99 纯打坐约 4.8 小时（都按 4 倍灵脉）
export const PACE = {
  ref: 4,
  segs: [{ from: 1, to: 21, t0: 45, t1: 120 }, { from: 21, to: 98, t0: 120, t1: 300 }],
};

// ---------- 地图浓度 ----------
// 档位：稀薄 0.5、普通 1、宗门修炼区 1.5、聚灵阵 3、高浓度灵脉 4。重叠的区域取最高的一档（不叠乘）。魔气所在不能吐纳（regions.js）
export const QI_TIERS = {
  thin: { k: 0.5, name: '稀薄' },
  normal: { k: 1, name: '普通' },
  sect: { k: 1.5, name: '宗门修炼区' },
  array: { k: 3, name: '聚灵阵' },
  vein: { k: 4, name: '高浓度灵脉' },
};
// 宗门地表的划分（复用 regions.js 已有的锚点与范围：聚灵阵 6 米、灵池 5 / 18 米、后山 z < −164）：
//   聚灵阵（演武台中央）6 米内 → array；灵池池心静修台 5 米内 → vein（池底灵脉）；灵池 18 米内、演武广场 22 米内、后山 → sect；
//   宗门核心范围（terrain.js 的 CORE）以外的山谷、远山 → thin（浮空仙岛上为 normal）；问道殿殿内 → sect；丹房、通天塔一层 → normal；
//   幽渊秘境按其区域（魔气不可吐纳）；第五十层封印殿不可打坐
export const QI_AREAS = { array: 6, vein: 5, pool: 18, plaza: 22, backhillZ: -164 };
// 合法修炼加成（丹药、功法等，眼下没有——留接口，全部为 1）
export const QI_BONUS = { base: 1 };

// ---------- 打坐 ----------
// key：随处打坐 / 起身（聚灵阵、灵池静修台仍可按 E）。移动、出手、受击、力竭、换场景、开战即中断
export const MEDITATE = { key: 'KeyY', toastEvery: 30 };

// ---------- 提升修为 ----------
// 条件：存活、脱战至少 calm 秒、安全状态（在地上、不在对话 / 过场 / 切磋 / 守关战 / 御剑 / 魔气之中）；修炼灵气 ≥ 总需求。
// 过程：聚气演出 gather 秒 → 最终校验 → 一次性提交（扣需求、升一级、更新境界与属性、保留剩余灵气、存档）。演出中移动、受击、力竭、换场景即取消，不扣不升
export const ASCEND = { calm: 5, gather: 3.4 };

// ---------- 属性成长 ----------
// 以 21 级现有角色的稳定基础数据为基准（PLAYER_COMBAT.hp / mp 与各招式的伤害）：倍率 = k^((L−21)/78)
export const STATS = { ref: 21, span: 78, dmg: 8, hp: 3.2, mp: 2.6 };

// ---------- 战斗与任务奖励（修炼灵气）----------
// 都按本级基础需求的比例给；基准（玩家等级与本级基础需求）在遭遇开始或任务领取时记下，临近升级也不变。
// 敌我等级差：rewardScale = clamp(1 + k × (敌人等级 − 玩家等级), min, max)；任务按任务自身的等级同样修正。
// 敌人奖励只结算一次；Boss 阶段结束不发整场奖励；演武场切磋、自由练习、训练木人不发；同一个完成事件只发一次（ledger 记在存档里）
export const REWARDS = {
  kill: { normal: 0.01, elite: 0.05 },
  boss: 0.20,                                 // Boss 整场首次有效通关
  bossRepeat: 0,                              // 重复通关：现有玩法另有贡献与龙鳞，修炼灵气不再给（首通已领）——挑战说明里写明
  quest: { easy: 0.05, mid: 0.10, hard: 0.15 },
  abyss: 0.10,                                // 秘境有独立的完成目标（加固封印）时追加
  scale: { k: 0.05, min: 0.1, max: 1.5 },
  // 宗门任务：难度与任务等级
  quests: {
    herb: { name: '丹房求药', diff: 'easy', level: 20 },
    invasion: { name: '魔影袭山', diff: 'mid', level: 21 },
  },
};
// 敌人的等级与级别（境界由等级推导）。未配置的敌人不发奖励、不触发境界克制（调试面板里提示）
export const ENEMY_RANKS = {
  shade: { level: 20, tier: 'normal' },        // 魔修残魂：筑基大圆满
  caster: { level: 21, tier: 'normal' },       // 魔修术士：金丹初期
  invader: { level: 19, tier: 'normal' },      // 魔影：筑基后期
  invCaster: { level: 20, tier: 'normal' },    // 魔影术士
  elite: { level: 24, tier: 'elite' },         // 幽渊魔将：金丹初期
  eliteStaged: { level: 26, tier: 'elite' },   // 试炼魔将（同一总气血按阈值分两段，验证另一种 Boss 气血结构用）
  boss50: { level: 32, tier: 'boss' },         // 镇塔龙君·烬霄：金丹大圆满
  boss30: { level: 27, tier: 'boss' },         // 第二十四轮：烬狱剑尊（通天塔第三十层）：金丹中期（与 boss30Config.js 的 BOSS30.level 同值）
  duel: { easy: 18, normal: 21, hard: 24 },    // 演武场的同门（只用于境界克制；切磋不发修炼灵气）
};

// ---------- 御剑（按境界）----------
// none：练气不能御剑；short：筑基每次最多 secs 秒（warn 秒时提示，到时自行缓降），落地 rest 秒后才能再起；long：金丹以上不限
export const FLIGHT = { short: { secs: 40, warn: 30, rest: 12 } };
