// 第二十四轮：通天塔第三十层 · 烬狱剑尊——全部参数集中在这一个文件（首版配置值，未经实战平衡）。
// 时间单位秒（统一的战斗时钟：暂停、页面失焦、过场时不走），距离单位米，角度用弧度（注释里写度数）。
// 动作的时刻一律按「动作自己的时间轴」（素材的帧 / 30），由 tools 外的轨迹分析脚本按剑尖的真实轨迹量出（见 docs/R24_REPORT.md 的映射表）：
//   举剑最高的一刻（慢刀在这里停顿）、出手段（剑尖速度高的那一段，判定只在这一段里开）。
// 第二十四轮要求的节奏（实际时长，见测试 r24 rhythm）：快刀首段前摇 0.35–0.5，慢刀首段前摇 1.0–1.5；快速间隔 0.25–0.4，迟滞间隔 0.75–1.2；
// 长连段收招 0.8–1.0（五段连招 1.0）。快慢靠举剑 / 蓄势处的停顿（hold）做出来，不整段放慢动作。
// 第二十六轮：慢刀不再拖——举剑停顿短了约 45%，举剑那一段放快（rhythm.raise）、停顿之后到这一击打完更快（rhythm.snap）：慢刀首段前摇约 0.6–1.0、迟滞间隔约 0.45–0.8
//   （见测试 r26 rhythm）；快刀不变。剑尊放大到约 4 米（玩家的 2.3 倍），近身距离、走跑速度、出招距离等跟着体型放大（size = scale / scale0），
//   每一击另有俯身角度 lean（见 CONFIG30.lean）。

const DEG = Math.PI / 180;

export const BOSS30 = {
  name: '烬狱剑尊',
  title: '通天塔第三十层 · 烬狱剑尊',
  floor: 30,
  level: 27, realm: 'jindan', realmText: '金丹中期',      // 等级与境界显式配置（progressConfig.js 的 ENEMY_RANKS.boss30 同值）
  // 第二十六轮：笔刷贴图换回原素材的 1024 像素（tools/r26_boss30_tex.py；网格、骨架、动作与 boss30.glb 逐字节相同）
  url: 'assets/converted/boss30/boss30_hd.glb',
  anim: 'assets/converted/boss30/boss30_anim.json',
  props: 'assets/converted/boss30/boss30_props.glb',
  fx: 'assets/converted/boss30/fx/',
  src: 'assets/boss/boss30/soul_of_cinder_-_dark_souls_3_boss_tilt_brush.glb',
  height: 2.4,                                           // 模型里头盔顶离地（模型米）
  // 游戏里整体缩放。第二十四轮 0.875（头盔顶约 2.1 米，与玩家 1.72 同身量）；第二十六轮 1.65：头盔顶约 3.96 米，玩家的 2.3 倍。
  //   动作包按同身量的对手做：放大之后横斩、突刺会从玩家头顶掠过——出招时按每一击的 lean 把上身往前压（剑长，压十几度剑尖就落到玩家胸口）
  scale: 1.65,
  scale0: 0.875,                                         // 第二十四轮的缩放：各处按 size = scale / scale0 放大的基准
  sword: { tip: 1.277, pommel: -0.242, width: 0.06 },   // 原装的剑（右手骨上的「boss30_sword」节点）：剑尖、剑首离握点的距离（模型米）——求握点、剑轴用
  // 第二十六轮：手里的剑换成 assets/sword/sword3（荆棘，第十五轮转出的 swords/jingji.glb：本地 +Y 指剑尖、原点在握持处、+X 刃口、+Z 剑面法线）。
  //   握点、剑轴对齐原装的剑（动作按它做），剑面朝向对齐原装剑身的宽面；len：握点到剑尖相对原装剑的长短（1 = 一样长，动作的够远不变）
  swordModel: { file: 'assets/converted/swords/jingji.glb', tip: 1.037, pommel: -0.203, len: 1.0 },
  colors: { core: 0xfff1c1, gold: 0xffb247, main: 0xf05a28, deep: 0x8d241d, char: 0x171416 },
};
// 体型相对第二十四轮放大了几倍（近身距离、出招距离、过场机位、走跑速度按它放大）
export const SIZE30 = BOSS30.scale / BOSS30.scale0;
const Z = SIZE30;

export const CONFIG30 = {
  // ---------- 气血：两个独立阶段（一阶段 H、二阶段 0.8H），每阶段约 90–150 秒（按 21 级玩家实际输出约 16–27 每秒估） ----------
  hp: { p1: 2400, p2: 1920 },
  hpDebug: { p1: 12000, p2: 9600 },
  // ---------- 场地：圆形平台直径 36 米 ----------
  arena: { R: 18, keepIn: 16.4, playerIn: 17.45 },      // 平台半径；Boss 根不出 keepIn；玩家不出 playerIn（火墙内沿）
  // ---------- 二阶段：移动 +15%、常规恢复 −15%（招与招之间的空隙、连段收招的尾段）；慢刀的举剑停顿不变 ----------
  p2: { move: 1.15, recover: 0.85, dmg: 1.1 },
  // 走路、跑（米 / 秒，与动作的步幅相当：体型放大，步幅跟着放大）；跑的动作按 runAnim 倍速放（巨人跑得没那么快，脚下不打滑）
  walk: { p1: 1.55 * Z, p2: 1.55 * Z * 1.15 },
  run: { p1: 5.2 * Z * 0.8, p2: 5.2 * Z * 0.8 * 1.15 }, runAnim: 0.8,
  turn: { idle: 2.4, combo: 2.0, p2K: 1.15 },           // 转身：寻常（弧度 / 秒）、连段之间（有限转向）
  gap: { p1: [0.65, 1.1], p2: [0.5, 0.9] },             // 两招之间的空隙（二阶段已含 −15%）；第二十六轮略短（原 0.75–1.25 / 0.6–1.05）
  melee: 3.4 * Z,                                        // 近身距离（剑能扫到）
  // 选招的距离档（close / mid）、空闲时走近、改跑的距离、举剑停顿里踏步逼近的距离、推开玩家的半径（米）
  zone: { close: 3.6 * Z, mid: 12, walk: 6.5 * Z, run: 9 * Z, chase: 2.4 * Z, push: 0.85 * Z },
  // ---------- 判定 ----------
  hit: {
    blade: 0.15, extend: 0.3,                           // 剑身判定的半粗、剑尖外多算的一段（与剑光拖尾的外沿一致）；第二十六轮按荆棘剑放大后的刃宽（原 0.12 / 0.25）
    player: { r: 0.38, y0: 0.15, y1: 1.95 },            // 玩家身体：竖直胶囊（含头与发冠）
    gap: 1.5 * Z,                                        // 出招的根运动不把剑尊推到离目标这么近（间距修正：剑扫得到人，不贴身穿过去）；第二十六轮 1.15 → 1.5 再按体型放大（约 2.8 米：巨人用长剑的远端打人，剑落在胸口）
    lockBefore: 0.15,                                    // 出手前 0.15 秒锁定方向（之后不再追踪）
    sub: 6,                                              // 连续检测：每帧剑身扫过的面按几步细分
    invuln: 0.22,                                        // 被打中后的短暂无敌（多段之间各自结算）
  },
  // ---------- 弹反与架势（统一状态管理） ----------
  parry: {
    hitch: 0.15,                                        // 连段中途被弹反：时间轴暂停 0.15 秒（不追帧），之后接下一击
    recover: { p1: 1.0, p2: 0.8 },                      // 被弹在收招的一击（或该招规定弹反即收）：完整收势
  },
  posture: { max: 100, parry: 20, light: 3, heavy: 6, delay: 6, decay: 5, break: { p1: 2.4, p2: 2.0 }, breakDmgK: 1.25 },
  // ---------- 截锋架势（Boss 的格挡 / 弹反）----------
  // 条件：Boss 空闲、玩家在正面近战距离、玩家不在出手 / 受击 / 失衡 / 演出中、冷却好了。架势里只认玩家真实的近战剑击（普攻、拔刀斩的刀身），
  // 不挡背后，不挡凤凰、雷云、地火、万剑归宗、剑气这类非近战。成功后接一记实打的反击（0.45 秒准备，出手前锁方向），可闪可挡可弹
  bossParry: { prep: 0.35, window: 0.18, arc: 120 * DEG, cooldown: 8, whiff: 0.6, range: 3.8 * 1.4, counter: 0.45, playerReact: 'flinch' },
  // ---------- 留锋突刺：玩家真实的后撤闪身（远离 Boss）且在 3–10 米、路径合法、冷却好了、Boss 空闲 → 必定触发（不排队、不打断 Boss 当前动作）----------
  rollPunish: { min: 4.5, max: 13, cooldown: 7, prep: 0.8, lock: 0.15, recover: 0.9, away: 60 * DEG, stopShort: 1.1 * Z, maxDash: 15, dashTime: 0.3, trailP2: true },
  // ---------- 选招 ----------
  weights: {
    p1: { sword: 0.75, fire: 0.25 }, p2: { sword: 0.55, fire: 0.45 },
    // 玩家的习惯只调整权重：连续正面攻击 → 截锋架势；远处施法 → 火浪；站着不动 → 地火
    frontHits: { window: 4, count: 3, k: 3.5 }, farCast: { dist: 12, window: 5, k: 2.5 }, still: { secs: 2.5, k: 2.5 },
  },
  // ---------- 伤害（二阶段 ×p2.dmg）----------
  dmg: { blade: 19, heavy: 28, counter: 22, roll: 24, wave: 20, stomp: 22, ring: 24, pillar: 26, impact: 22, trail: 4, trailTick: 0.5, ult: 99999 },
  // ---------- 火焰招式 ----------
  fire: {
    maxZones: 4,                                         // 同时存在的持续火域（燃刃留痕、突刺火迹）上限：超出时最早的先熄
    F01: { prep: 0.8, width: 2.4, speed: 16, len: 22 },                 // 烬刃波：挥砍后 0.8 秒准备，沿地火浪，不穿墙
    F02: { r: 5, delay: 1.0 },                                          // 踏火震：5 米火纹（第二十六轮随体型由 4 米放大），1.0 秒后爆发
    F03: { life: 4, width: 1.3, step: 0.7, below: 1.7 },                // 燃刃留痕：重击 / 终结击的剑尖低于 1.7 米（第二十六轮随体型由 1.3 放宽：巨人的劈砍停在玩家胸口的高度）时沿地面留下 4 秒火痕（每 0.7 米一块；不延长刀身判定）
    F04: { preps: [0.5, 0.6, 0.45], width: 2.4, speed: 17, len: 22 },   // 三叠炎浪：快—慢—快（三道火浪起步间隔约 1.2 / 0.5 秒：第二刀举剑停顿后才出、第三刀紧跟）
    F05: { r0: 3.4, r1: 8.6, delay: 1.2 },                              // 焚环裂地：环纹 1.2 秒后爆发，内外留安全区
    F06: { n: 3, r: 2.2, delay: 1.1, spread: 40 * DEG },                // 落烬火柱：三根，1.1 秒后爆发，位置定下就不动
    F07: { r: 4.3, air: [0.45, 0.85], maxDist: 12, delay: 0.45, h: 3.6 }, // 炎刃重坠：跃起（h 米高）重劈（刀可弹）；落地时地上亮出火纹（半径随体型由 3.4 放大），0.45 秒后炸开
  },
  // ---------- 焚天断界（二阶段专属秒杀）----------
  // 蓄力 5.5 秒（允许 5–6）、冷却 40 秒（35–45，恢复结束后才开始计）、恢复 4 秒、二阶段开始 12 秒后才可能第一次放；
  // 危险区：以场地中心为圆心、面积为场地 3/4 的圆（半径 √0.75·R ≈ 0.866R），蓄力开始时定下；安全区是外圈，正常移动能走到、不被挡。
  // 判定一次：在区内且不在闪身无敌里——经统一的伤害入口按致死结算；格挡、弹反挡不住。蓄力中架势打满即中断（照样进冷却）
  ult: { charge: 5.5, cooldown: 40, recover: 4, firstAfter: 12, zoneK: Math.sqrt(0.75), leap: 1.1, leapH: 4.4,
    stages: [1, 3, 5, 5.5] },                          // 0–1 举剑出地纹；1–3 火焰汇聚；3–5 增强；5–5.5 最终前摇
  // ---------- 过场 ----------
  cine: { prep: 0.8, intro: 7.2, phase: 6.2, victory: 5.8, defeat: 5.0 },
  // ---------- 第二十六轮：俯身 ----------
  // 每一击（COMBOS30 / SPECIAL30 / FIRE30 的 hits[].lean，度）出手前 pre 秒（动作时间）起把上身往前压、出手段里压满、打完 post 秒收回；
  //   压在 spine_01 / spine_02 两节（bones 各分多少），弹簧跟随（freq 弧度 / 秒）。角度由 tools/r26_tests.js bladeProfile + leanTable 按剑的真实轨迹量出：
  //   放大到 scale 之后、玩家站在 2.8 米处时，剑身经过玩家的高度落在胸口（约 1.15 米）；最多压 max 度（再多就像鞠躬：最高的两记横扫扫在肩头）
  lean: { pre: 0.5, post: 0.38, bones: [['spine_01', 0.55], ['spine_02', 0.45]], freq: 26, max: 30 },
  // ---------- 第二十六轮：节奏 ----------
  // 有举剑停顿（hold）的段：起放到停顿处按 raise 倍速放（举剑更利落）、停顿之后到这一击打完按 snap 倍速放（蓄满就劈）
  rhythm: { raise: 1.25, snap: 1.3 },
  // ---------- 第二十六轮：打击感 ----------
  // 剑尊的刀落到玩家身上：hit 命中 / block 被挡——stop 顿帧（全局，秒；与玩家受击的顿帧取大）、boss 剑尊自己的时间轴顿一下（刀「咬」进去）、
  //   shake 震屏、flash 暖白一闪；ground：出手段里剑尖低于 y 米（劈到地上），或重击（heavy）劈到底时剑尖低于 heavyY 米（剑压砸到地上）——
  //   剑尖下方的地上炸开尘浪、发光的裂纹、焦痕、余烬、一声砸地、震屏（每一击只一次）；
  //   swing 挥剑声的音高（巨人的刀风更沉）
  feel: {
    hit: { blade: { stop: 0.07, boss: 0.05, shake: 0.24, flash: 0.1 }, heavy: { stop: 0.09, boss: 0.07, shake: 0.38, flash: 0.16 } },
    block: { blade: { stop: 0.045, boss: 0.04, shake: 0.14 }, heavy: { stop: 0.06, boss: 0.05, shake: 0.24 } },
    ground: { y: 0.5, heavyY: 2.4, shake: [0.14, 0.26] }, swing: 0.8,
  },
  // 调试与测试
  debugKey: 'boss30debug',
};

// =====================================================================================
// 十套剑式连招。每段（seg）：clip 动作、from 起放时刻、to 放到哪一刻接下一段（缺省放完）、speed 速度、fade 交叉淡入秒数、
//   hold [时刻, 停顿秒数]（举剑 / 蓄势处的停顿：这一小段按极慢的速度过，期间剑在颤、火在聚）、
//   hits 出手：{ key, t: [起, 止]（动作时间，判定只在这一段）, dmg 伤害档（blade / heavy）, def 防御属性, trail 燃刃留痕 }、
//   tail 收招尾段的速度（二阶段另乘 1 / p2.recover）。
// parry：被弹反时 'last' 只有最后一击被弹才收招（其余各击只顿 0.15 秒）；'any' 任一击被弹即收招。
// rhythm：快（F）慢（S），测试按它核对前摇与间隔。range：开招距离（米）
// =====================================================================================
// 第二十六轮：range（开招距离）按体型放大（× SIZE30）；hold 停顿缩短约 45%（括号里是第二十四轮的值）；lean：这一击的俯身（度，见 CONFIG30.lean）
export const COMBOS30 = {
  A01: { name: '疾锋横斩', rhythm: 'F', parry: 'last', range: [0, 3.6 * Z], use: '近身快斩：贴身时一记横扫，逼玩家挡或闪',
    segs: [{ clip: 'a8s2c', from: 0.06, fade: 0.12, hits: [{ key: 'h1', t: [0.53, 0.7], dmg: 'blade', def: 'blade', lean: 30 }] }] },
  A02: { name: '悬锋重劈', rhythm: 'S', parry: 'last', range: [0, 3.8 * Z], use: '高举悬停再劈：专打贪刀与站桩，劈下留火痕',
    segs: [{ clip: 'a8s1c', from: 0, fade: 0.15, hold: [0.81, 0.26 /* 0.45 */], hits: [{ key: 'h1', t: [0.87, 1.03], dmg: 'heavy', def: 'heavy', trail: true, lean: 12 }] }] },
  A03: { name: '逆锋双斩', rhythm: 'FF', parry: 'last', range: [0, 3.8 * Z], use: '斜劈接反手横扫：左右两侧都罩住，追打躲向一侧的人',
    segs: [
      { clip: 'a7s1', from: 0, to: 0.6, fade: 0.12, hits: [{ key: 'h1', t: [0.4, 0.6], dmg: 'blade', def: 'blade', lean: 0 }] },
      { clip: 'a7s2', from: 0, to: 0.7, fade: 0.06, hits: [{ key: 'h2', t: [0.33, 0.57], dmg: 'blade', def: 'blade', lean: 10 }] },
      { clip: 'a7s2b', from: 0, fade: 0.1 }] },
  A04: { name: '留锋追斩', rhythm: 'FS', parry: 'last', range: [0, 4.4 * Z], use: '快劈之后留一刀：举剑停住诱人出手或过早闪身，再踏步追斩',
    segs: [
      { clip: 'a6s1', from: 0, to: 0.667, fade: 0.12, hits: [{ key: 'h1', t: [0.4, 0.63], dmg: 'blade', def: 'blade', lean: 0 }] },
      { clip: 'a6s2', from: 0, to: 1.033, fade: 0.08, hold: [0.1, 0.42 /* 0.8 */], chase: true, hits: [{ key: 'h2', t: [0.2, 0.55], dmg: 'heavy', def: 'heavy', lean: 10 }] },
      { clip: 'a6s2b', from: 0, speed: 1.15, fade: 0.12 }] },
  A05: { name: '沉锋双落', rhythm: 'SS', parry: 'any', range: [0, 4.0 * Z], use: '两记举剑直劈：慢而沉，任一击被弹即收招；第二劈留火痕',
    segs: [
      { clip: 'a9s2c', from: 0, to: 0.6, fade: 0.15, hold: [0.26, 0.42 /* 0.8 */], hits: [{ key: 'h1', t: [0.36, 0.52], dmg: 'heavy', def: 'heavy', lean: 4 }] },
      { clip: 'a8s1', from: 0.55, to: 1.033, fade: 0.15, hold: [0.81, 0.26 /* 0.45 */], hits: [{ key: 'h2', t: [0.87, 1.03], dmg: 'heavy', def: 'heavy', trail: true, lean: 11 }] },
      { clip: 'a8s1b', from: 0, fade: 0.12 }] },
  A06: { name: '流影三式', rhythm: 'FFF', parry: 'last', range: [2 * Z, 5.5 * Z], use: '旋身突进横斩、回身上挑、收剑直刺：一气呵成的三连快剑',
    // 第三击直刺：动作包里没有直刺，用制作的 thrust_dash（拉剑 → 直刺 → 收势）从拉剑处接上，刺出时程序给一小步滑进（slide：[起, 止, 米]，受间距修正）
    segs: [
      { clip: 'a9s1', from: 0.15, to: 0.833, speed: 1.15, fade: 0.12, hits: [{ key: 'h1', t: [0.667, 0.833], dmg: 'blade', def: 'blade', lean: 22 }] },
      { clip: 'a7s3', from: 0.45, to: 0.95, fade: 0.1, hits: [{ key: 'h2', t: [0.74, 0.94], dmg: 'blade', def: 'blade', lean: 16 }] },
      { clip: 'thrust_dash', from: 0.6, fade: 0.08, slide: [0.8, 1.05, 1.2 * Z], hits: [{ key: 'h3', t: [0.84, 1.12], dmg: 'blade', def: 'blade', lean: 21 }] }] },
  A07: { name: '迟刃三绝', rhythm: 'SFS', parry: 'last', range: [0, 4.4 * Z], use: '伏身蓄势上撩、过肩快劈、旋身横斩：快慢交错打乱闪身的节拍',
    segs: [
      { clip: 'a2s1', from: 0, to: 1.333, fade: 0.15, hold: [0.62, 0.1 /* 0.15 */], hits: [{ key: 'h1', t: [1.07, 1.3], dmg: 'heavy', def: 'heavy', lean: 27 }] },
      { clip: 'a2s2', from: 0.25, to: 0.667, fade: 0.08, hits: [{ key: 'h2', t: [0.55, 0.667], dmg: 'blade', def: 'blade', lean: 30 }] },
      { clip: 'a4', from: 0.45, fade: 0.12, hold: [0.9, 0.2 /* 0.35 */], hits: [{ key: 'h3', t: [1.03, 1.25], dmg: 'heavy', def: 'heavy', trail: true, lean: 30 }] }] },
  A08: { name: '四象错锋', rhythm: 'FFSF', parry: 'last', range: [0, 3.0 * Z], use: '刺、劈、横扫、斜斩四个方向错开，第三击停顿换拍',
    segs: [
      { clip: 'a5s1', from: 0.42, to: 1.7, fade: 0.12, hits: [{ key: 'h1', t: [0.77, 0.93], dmg: 'blade', def: 'blade', lean: 6 }, { key: 'h2', t: [1.3, 1.63], dmg: 'blade', def: 'blade', lean: 0 }] },
      { clip: 'a5s2', from: 0, to: 0.5, fade: 0.1, hold: [0.03, 0.4 /* 0.75 */], hits: [{ key: 'h3', t: [0.17, 0.43], dmg: 'heavy', def: 'heavy', lean: 11 }] },
      { clip: 'a7s1', from: 0.12, to: 0.6, fade: 0.1, hits: [{ key: 'h4', t: [0.4, 0.6], dmg: 'blade', def: 'blade', lean: 0 }] },
      { clip: 'a7s1b', from: 0, speed: 0.75, fade: 0.1 }] },
  A09: { name: '逐影四斩', rhythm: 'FSFS', parry: 'last', range: [2 * Z, 6 * Z], use: '一路逼近的四斩：伏身旋斩、背剑横扫、旋身斩、竖举下劈',
    segs: [
      { clip: 'a10s1', from: 0.3, to: 1.3, fade: 0.12, hits: [{ key: 'h1', t: [0.7, 1.23], dmg: 'blade', def: 'blade', lean: 9 }] },
      { clip: 'a10s2', from: 0, to: 0.55, fade: 0.08, hold: [0.13, 0.38 /* 0.7 */], chase: true, hits: [{ key: 'h2', t: [0.3, 0.5], dmg: 'heavy', def: 'heavy', lean: 19 }] },
      { clip: 'a3s2', from: 0.3, to: 0.85, fade: 0.1, hits: [{ key: 'h3', t: [0.57, 0.8], dmg: 'blade', def: 'blade', lean: 18 }] },
      { clip: 'a9s2', from: 0, fade: 0.12, hold: [0.24, 0.4 /* 0.75 */], hits: [{ key: 'h4', t: [0.33, 0.47], dmg: 'heavy', def: 'heavy', trail: true, lean: 5 }] }] },
  A10: { name: '五叠断魂', rhythm: 'FFSFS', parry: 'last', range: [0, 3.0 * Z], use: '五叠的大连段：两记快斩、蓄势上挑、突刺、悬停重劈，收招整整一秒',
    segs: [
      { clip: 'a1', from: 1.05, to: 2.55, speed: 1.15, fade: 0.12, hits: [{ key: 'h1', t: [1.47, 1.73], dmg: 'blade', def: 'blade', lean: 12 }, { key: 'h2', t: [2.17, 2.53], dmg: 'blade', def: 'blade', lean: 10 }] },
      { clip: 'a7s3', from: 0.3, to: 0.98, fade: 0.12, hold: [0.68, 0.38 /* 0.7 */], hits: [{ key: 'h3', t: [0.74, 0.94], dmg: 'heavy', def: 'heavy', lean: 16 }] },
      { clip: 'a2s3', from: 0.15, to: 0.75, fade: 0.08, hits: [{ key: 'h4', t: [0.4, 0.64], dmg: 'blade', def: 'blade', lean: 22 }] },
      { clip: 'a8s1', from: 0.55, to: 1.033, fade: 0.12, hold: [0.81, 0.28 /* 0.5 */], hits: [{ key: 'h5', t: [0.87, 1.03], dmg: 'heavy', def: 'heavy', trail: true, lean: 12 }] },
      { clip: 'a8s1b', from: 0, speed: 0.77, fade: 0.1 }] },
};
export const COMBO_ORDER = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10'];
// 各套的选招权重（按距离档：close < 3.6 米、mid < 8、far）——同一套刚用过的降权，见 boss30Fight.choose
export const COMBO_AI = {
  A01: { close: 1.2, mid: 0.2 }, A02: { close: 1.0, mid: 0.4 }, A03: { close: 1.1, mid: 0.4 }, A04: { close: 0.9, mid: 0.7 }, A05: { close: 0.8, mid: 0.4 },
  A06: { close: 0.5, mid: 1.2, far: 0.3 }, A07: { close: 0.9, mid: 0.6 }, A08: { close: 0.8, mid: 0.6 }, A09: { close: 0.3, mid: 1.1, far: 0.6 }, A10: { close: 0.7, mid: 0.5 },
};

// 截锋架势的反击（一记实打）与留锋突刺：同样按剑的真实轨迹判定
export const SPECIAL30 = {
  counter: { name: '截锋反击', segs: [{ clip: 'a6s1c', from: 0, fade: 0.15, hits: [{ key: 'c1', t: [0.3, 0.63], dmg: 'counter', def: 'blade', lean: 0 }] }] },
  // thrust_dash：0–0.8 沉身拉剑蓄刺（前摇，记下预判的落点；0.65 起锁定方向）→ 0.8–1.1 冲刺突刺（位移由程序给）→ 1.1–2.0 收势 0.9 秒
  roll: { name: '留锋突刺', segs: [{ clip: 'thrust_dash', from: 0, fade: 0.12, hits: [{ key: 'r1', t: [0.84, 1.1], dmg: 'roll', def: 'blade', lean: 21 }] }], dash: [0.8, 1.1] },
};

// 火焰招式（权重：一阶段剑 75% / 火 25%，二阶段 55% / 45%）：p 出现的阶段；ai 距离档权重；clip 与时刻
export const FIRE30 = {
  F01: { name: '烬刃波', p: 1, ai: { mid: 1.0, far: 1.4, close: 0.4 }, cd: 9, clip: 'a9s2c', hold: [0.26, 0.15 /* 0.25 */], blade: { key: 'b', t: [0.36, 0.52], lean: 4 }, launch: 0.48 },
  F02: { name: '踏火震', p: 1, ai: { close: 1.2, mid: 0.5 }, cd: 10, clip: 'jump', land: 0.78 },
  F04: { name: '三叠炎浪', p: 2, ai: { mid: 1.0, far: 1.3, close: 0.3 }, cd: 14,
    segs: [{ clip: 'a8s2c', from: 0.06, to: 0.95, fade: 0.12, launch: 0.62 }, { clip: 'a10s2', from: 0, to: 0.7, fade: 0.1, hold: [0.13, 0.5 /* 0.9 */], launch: 0.4 }, { clip: 'a7s1', from: 0.1, fade: 0.1, launch: 0.55 }] },
  F05: { name: '焚环裂地', p: 2, ai: { close: 1.1, mid: 0.9 }, cd: 13, clip: 'a6s3c', plant: 1.15 },
  F06: { name: '落烬火柱', p: 2, ai: { mid: 1.0, far: 1.2, close: 0.5 }, cd: 12, clip: 'a9s2', hold: [0.24, 0.7 /* 1.25 */], call: 0.24, blade: { key: 'b', t: [0.33, 0.47], lean: 4 } },
  F07: { name: '炎刃重坠', p: 2, ai: { mid: 1.0, far: 1.4 }, cd: 11, clip: 'leap_chop', air: [0.4, 1.0], blade: { key: 'b', t: [1.03, 1.22], lean: 10 }, impact: 1.0 },
};
export const FIRE_ORDER = ['F01', 'F02', 'F04', 'F05', 'F06', 'F07'];
