// 战斗参数集中配置：玩家剑技、魔修各类敌人、护宗双龙的攻击范围、冷却、伤害与状态效果。
// 调整数值只改这里；距离单位为米，时间为秒（游戏时间：顿帧时随之放慢，与帧率无关）。
const DEG = Math.PI / 180;
export const PLAYER_COMBAT = {
  hp: 160,
  regen: 8,                 // 脱战 4 秒后每秒回复
  regenDelay: 4,
  invuln: 0.5,              // 受击后的短暂无敌
  // 第十四轮：灵力（施展剑诀消耗）与剑意（出手命中积攒，满了可施展「万剑归宗」）
  mp: 100, mpRegen: 7, mpRegenIdle: 22,
  intent: 100, intentDecay: 3, intentHold: 8,       // 脱战 8 秒后每秒消散 3 点
  // 第十七轮：输入。buffer 缓冲时长（秒，游戏时间）：只留一个、按优先级替换，过期丢弃
  input: { buffer: 0.15, prio: { dodge: 5, guard: 4, skill: 3, power: 2, light: 1 } },
  // 第十七轮：格挡与弹反（右键）。按下、真正进入格挡时开一个弹反窗口 parryWindow 秒；与上一次弹反窗口相隔不足 parryCooldown 秒的不再开窗；
  // 按住为寻常格挡；身前 arc 弧度内（以人物实际朝向为准，不看镜头）的来招才挡得住。
  // 守势（max）：每次格挡按来招扣（见 ATTACK_DEF 的 guardCost，难挡的 ×hardK），扣光即破防（breakStun 秒踉跄、breakLock 秒内举不起剑）；
  // 停手 regenDelay 秒后每秒回 regen（举着剑时只回 regenHold）。弹反成功回 parryRefund（守势上限的比例）守势、parryMp 灵力、parryIntent 剑意（最多到满）；
  // 第二十二轮：反击强化——counter 秒内，下一次近战直接命中（只有 counterMoves：普攻四式与拔刀斩）的第一个有效目标伤害 ×counterK、架势 ×counterPosture，
  // 打中即用掉（同一刀的其他目标、之后的命中都不再有）；空挥、无效命中（免疫、被闪开）不用掉，到时自然结束；不叠层，新的弹反刷新期限。
  // 剑气、万剑归宗、九霄凤焰（撞击、灼烧、凤焰弹反冲击）、破岳、惊鸿都不吃这个倍率
  // 第二十六轮：弹反手感——窗口 0.18 → 0.2 秒；开窗间隔 0.7 → 0.4 秒，且只在「上一个窗口落空」时才算（上一次弹反成功，下一次按下立刻再开：连段的每一击都能接着弹）；
  //   lateGrace：迟到的弹反——正面、可弹反、正在出手的近战来招碰到身上的那一刻玩家没在窗口里、但能举剑：这一下先挂起这么久（期间无敌），
  //   挂起中新按下右键开了窗 → 按弹反结算；到时没按 → 照原来的受击结算（补上画面与按键的延迟：看到碰到的一刻才按也来得及）
  guard: { parryWindow: 0.2, parryCooldown: 0.4, lateGrace: 0.09, arc: 120 * DEG, max: 100, regen: 30, regenHold: 2.5, regenDelay: 1.0, hardK: 2.5,
    breakStun: 0.95, breakLock: 1.25, parryRefund: 0.25, parryMp: 12, parryIntent: 8, counter: 2.0, counterK: 1.5, counterPosture: 1.6,
    counterMoves: ['light1', 'light2', 'light3', 'light4', 'iai_slash'],
    // 第十八轮：弹反成功后出手者至少僵直这么久（秒；招式的 onParry 更长时按更长的）：寻常魔修、魔将、演武场对手。
    // 第二十二轮：守关龙君被弹断（招式作废、后仰受击）一阶段 boss、二阶段 bossP2 秒——受击动作按这个时长放完，与 AI 的僵直同一段，不再另加一段受击锁定；
    // 招式配置为弹反后余下的段照常（parryEnds 为假，如双爪追猎的前一爪）只顿 bossHitch 秒（二阶段 ×0.75，动作放慢到一成半），之后照常出下一击
    parryStun: { enemy: 1.0, elite: 0.8, duel: 1.0, boss: 1.0, bossP2: 0.8, bossHitch: 0.3 },
    moveK: 0.45, cost: 16, chip: 0.15 },
  // 受击：连续受击保护（chainWindow 秒内第 chainMax 次受击反应后给 chainGuard 秒护体），霸体招式只吃轻受击的伤害、不被打断
  hurt: { chainWindow: 3.5, chainMax: 3, chainGuard: 1.0 },
  // 打击反馈：顿帧（秒）——同一时刻多个目标不叠加（取最大值），stopCap 封顶；两次顿帧的起点相隔不足 stopGap 秒时后一次减半；反击窗口里的命中按本招的档 ×1.15
  feedback: { stop: { light: 0.04, thrust: 0.045, heavy: 0.075, parry: 0.07, block: 0.022, guardBreak: 0.08, hurt: 0.045 }, stopCap: 0.09, stopGap: 0.12 },
  // 近战辅助：只在小距离、小角度内（不穿墙、不锁友方与护宗双龙），优先正前方，选定后 stick 秒内不轻易换；
  // 锁定（Tab）：显式开关，目标倒下、超出 lockRange 米或被挡住超过 lockLos 秒自动解除
  // lunge（第十八轮）：普攻的辅助目标比这一式自带的前冲更远时，前冲最多拉长到几倍（剑扫得到人，不隔空打中）
  aim: { range: 4.7, angle: 55 * DEG, stick: 0.6, switchK: 0.7, lockRange: 24, lockLos: 1.5, lunge: 1.7 },
  sheathDelay: 5,           // 最后一次出手 / 格挡后几秒收剑入鞘
  // 第十九轮：拔刀斩（Z）。按住纳刀蓄势，蓄力按按住的秒数算（闪身中照算），max 秒封顶，蓄满后再撑 grace 秒自动出刀；
  //   出刀的伤害、范围、击退、架势、剑意在 PLAYER_MOVES.iai_slash 的两端之间，按蓄力比例 k（秒数 / max）的 curve 次方插值；
  //   levels：蓄到这几秒时鞘口亮一圈光（三档提示；第二十轮起是几条墨笔一齐扫进剑柄）；wave：k 到这里出刀时多斩出一道剑气（第二十轮起墨色）；walk：蓄势中缓步的速度（米 / 秒）；
  //   turn：蓄势中每秒最多转多少弧度；lunge：出刀的前冲按 k 加长到 1 + lunge 倍
  iai: { max: 5, grace: 1, curve: 1.2, levels: [1.5, 3, 5], wave: 0.6, walk: 1.5, turn: 7, lunge: 1.2 },
  // 第十九轮：回血葫芦（2）。每次装满 base 口，一口回复气血上限的 heal；
  //   perLevel：以后随修为每级多几口（修为等级还没有，现在为 0——见 state.js 的 gourdMax）
  gourd: { base: 3, perLevel: 0, heal: 1 / 3 },
  // 第十九轮：音效对齐。slashPeak / drawPeak：普攻斩声、拔刀斩出鞘声最响的一下在录音的第几秒（放的时候跳过前面一截，让它正落在判定上）；
  //   qiFrom / bindFrom：剑气、缚灵锁在放出的那一刻放，从录音的第几秒放起；rainLead / finalLead：万剑归宗的落剑声、末了巨剑声提前几秒放（录音开头到第一下的空白）
  sfx: { slashPeak: 0.26, drawPeak: 0.24, qiFrom: 0.1, bindFrom: 0.06, rainLead: 0.1, finalLead: 0.03 },
  comboWindow: 2.4,         // 连击数在两次命中间隔超过这么久后归零
  skills: {
    // 第十三轮：F 改作御剑 / 落地；第十四轮：剑诀改由动作库驱动，键位重排（R 惊鸿、T 破岳、V 万剑归宗、C 闪身、G 服丹）；
    // 第十七轮：四段普攻、Z 蓄力重击、1 缚灵锁；灵力与冷却在「放出」的那一刻才扣（前摇里取消不扣，只留 0.4 秒的再按间隔）
    // 第十九轮：Z 改为拔刀斩（格子的键名仍叫 power）；2 回血葫芦
    slash: { key: null, name: '流云剑', glyph: '流', desc: '左键四段：斜斩、反手横斩、突刺、重劈。按住左键自动连续出手，第四式收势之后再从第一式起；松开即停。' },
    power: { key: 'KeyZ', name: '拔刀斩', glyph: '拔', desc: '按住它所在的槽键（默认 R；鼠标中键同）纳刀蓄势：剑收入鞘、沉身按柄，可缓步移动，也可闪身——闪身不断蓄力，落地时还按着就接着蓄，已松开就直接出刀。松开拔刀横斩、踏步前冲：蓄得越久，伤害（26–150）、击退、削架势越重，前冲越远（最多蓄 5 秒，蓄满再撑 1 秒自动出刀）；蓄过 3 秒出刀时多斩出一道墨色剑气。蓄势时侧身沉胯，墨点墨雾向剑柄汇聚，蓄得越久越密；出刀时一道月牙墨扫开，墨痕所到就是这一刀够得着的地方。蓄势中举剑格挡则作废这次蓄力。' },
    qi: { key: 'KeyQ', name: '剑气 · 新月', glyph: '气', mp: 15, cooldown: 2.5, desc: '以指抹剑，横斩出一道新月剑气，贯穿沿途所有魔修，撞墙即散。' },
    dash: { key: 'KeyR', name: '惊鸿掠影', glyph: '鸿', mp: 20, cooldown: 6, desc: '身化惊鸿，持剑疾掠七步，途经之敌皆受一剑；掠身时刀枪不入。' },
    heavy: { key: 'KeyT', name: '破岳', glyph: '岳', mp: 35, cooldown: 12, desc: '四连重斩，末式举剑破地，震波（地上金环即是范围）掀翻周围的魔修。出招时不为寻常攻击所动；临近破地时不能取消。' },
    seal: { key: 'Digit1', name: '缚灵锁', glyph: '缚', mp: 25, cooldown: 14, desc: '竖剑掐诀、推掌打出金色锁链，缚住身前扇形内至多三个敌人：寻常魔修定身 2.4 秒，魔将 1.2 秒，演武对手 0.9 秒；守关龙君只被锁住片刻并积累架势（同一目标再锁时间减半）。' },
    ult: { key: 'KeyV', name: '万剑归宗', glyph: '宗', intent: 100, cooldown: 2, desc: '剑意圆满时可施展：剑阵落地（金环即是范围），万剑自天而降，末了一柄巨剑镇住阵心。' },
    dodge: { key: 'KeyC', name: '闪身', glyph: '闪', cooldown: 0.6, desc: '向移动方向（未移动时向后）闪出数步，闪身瞬间不受伤害；可在各招允许的时刻取消出招。' },
    guard: { key: null, name: '格挡', glyph: '御', desc: '右键：按下的一瞬（0.2 秒）挡住可弹反的来招即「弹反」——不受伤害，对手收手、失衡或被打断，随后有一小段反击窗口；看到刀碰到身上的一刻再按（0.09 秒内）也算弹反。按住为寻常格挡，按来招扣守势、漏过少许伤害，守势耗尽即破防。弹空之后 0.4 秒内再按不开窗；弹反成功之后立刻可以再弹。' },
    pill: { key: 'KeyG', name: '服丹', glyph: '丹', cooldown: 15, desc: '服下一枚养元丹（行囊中须有；眼下的玩法里养元丹恒为 99 颗），片刻间回复气血。' },
    // 第二十一轮：九霄凤焰（3 释放，4 切换模式；金丹初期解锁）。灵力按最大战斗灵力的 30% 扣（moves.cost），参数见 PHOENIX
    // 第二十三轮：占槽的主动技能（qi、dash、heavy、power、ult、seal、phoenix、dragon）的键位不再写死——由六个装备槽决定（LOADOUT，见 game/loadout.js）；
    // 这里的 key 只是旧版的默认键，留作说明
    phoenix: { key: 'Digit3', name: '九霄凤焰', glyph: '凤', cooldown: 90, desc: '金丹初期解锁。舞刀召凤：凤凰随刀势显形、绕身一周，沿刀刃从剑尖飞出（舞刀时可缓步走动，最后一刀之前可被格挡、闪身取消，不扣费）。两种模式共用 90 秒冷却、消耗最大灵力的三成，放出那一刻才扣（起手中被格挡、闪身取消不扣）；同时最多一只。按 4 切换模式（只影响下一次召唤）。凤翔天击：凤凰离刀后飞 8 秒，按住左键它就朝准星所指的那一点飞（上下左右都可，松开保持方向；舞刀时新按下的左键离刀即生效；前方近处对准的敌人会让它加速俯冲；飞出 80 米自行折返，回到 65 米内才能再操控），人照常走、跳、闪、挡——这时左键不出剑；路过的地面留下 20 秒的火带，敌人踏入灼烧、你站在里面每 0.5 秒回复 3% 气血；撞上第一个敌人时爆开（主目标 2 倍、周围 0.75 倍伤害），撞处留一枚凤焰印，并有小概率直接斩落当前阶段。站在自己的火带或印记里真实弹反成功时，凤焰冲击震开周围 5 米（每秒至多一次）。凤灵护战：凤凰随身护战 30 秒，自行以凤焰弹、掠翼突袭、吐息攻击敌人，并吸引敌人转而攻击它；你照常出剑。对大境界低于你的敌人，凤凰的一切伤害翻倍。' },
    // 第二十三轮：雷龙破虚（金丹初期；装备槽键释放）。灵力按最大战斗灵力的 35% 扣，参数见 DRAGON
    dragon: { key: null, name: '雷龙破虚', glyph: '雷', cooldown: 120, desc: '金丹初期解锁。引雷起势 0.65 秒（这之前可被格挡、闪身取消，不扣费），随即撕开虚空，一条雷龙从裂隙里逐段游出，在选定之处上空的雷云间盘游：8 秒里每 0.8 秒一次雷击，作用半径 8 米内的每个敌人各挨一道雷（每次至多 15 个，优先锁定的目标，其余由近到远），最后俯冲撞向主要目标、爆雷震开周围。选点：先看锁定的敌人（Tab），其次准星对着的敌人，再次准星对着的地面；离你最多 30 米、看得见、有地面、上方有足够的空间，否则不放、不扣费。起势之后照常走、出剑、闪身、格挡与弹反，雷云不随你移动。消耗最大灵力的 35%，调息 120 秒；同时只能有一条。' },
    gourd: { key: 'Digit2', name: '回血葫芦', glyph: '葫', cooldown: 1.5, desc: '左手取下腰间葫芦饮一口，回复三分之一气血；饮时只能缓步走，可被闪身、格挡、受击打断（喝到嘴里之后才打断的，这一口照样算）。每次装满 3 口：打坐调息、力竭醒来、守关战重来、演武场开打时装满。' },
  },
};

// 第十七轮：来招的防御属性（所有对玩家的出手共用：魔修、演武场的对手、第五十层的龙君；每一招 / 每一段在出手时带上，招中途不变）
//   block：true 可格挡 / 'hard' 难挡（耗守势 ×hardK、漏伤 chip，守势不够即破防）/ false 不可格挡
//   parry：可否弹反；deflect：投射物可被弹回（弹反时反飞向出手者）；guardCost：格挡一次耗多少守势；chip：格挡时漏过的伤害比例；
//   onParry：被弹反时出手者的反应（recoil 收手一顿 / stagger 失衡 / interrupt 打断这一招余下的出手 / none）；
//   parryEnds：多段出手里弹反其中一段后余下的段是否作废；posture：被弹反时（守关龙君）积累的架势；
//   tell：出手前的提示（none 寻常预警 / heavy 兵刃一道金光：可弹反但难挡 / danger 头顶红色「危」字：不可格挡也不可弹反，须闪避）
export const ATTACK_DEF = {
  claw: { block: true, parry: true, guardCost: 18, chip: 0.12, onParry: 'recoil', parryEnds: false, posture: 20, tell: 'none' },
  blade: { block: true, parry: true, guardCost: 16, chip: 0.1, onParry: 'stagger', parryEnds: true, posture: 18, tell: 'none' },
  heavy: { block: 'hard', parry: true, guardCost: 22, chip: 0.4, onParry: 'stagger', parryEnds: true, posture: 30, tell: 'heavy' },
  aoe: { block: false, parry: false, tell: 'danger' },
  thunder: { block: false, parry: false, tell: 'danger' },
  fire: { block: false, parry: false, tell: 'danger' },
  grab: { block: false, parry: false, tell: 'danger' },
  breath: { block: true, parry: false, guardCost: 7, chip: 0.35, tell: 'none' },
  bolt: { block: true, parry: true, deflect: true, guardCost: 12, chip: 0.15, onParry: 'none', posture: 8, tell: 'none' },
};

// 第十七轮：玩家的招式（动作见 actors/cultivatorClips.js；时刻一律按动作自己的时间轴，秒）
// 第十八轮：普攻四式与蓄力横扫的判定距离各加 0.4–0.5 米（近战辅助的距离随之加长）
// 第十九轮：蓄力重击（charge / power）换成拔刀斩（iai / iai_slash）；新增回血葫芦（gourd）
//   end 动作末；speed 播放倍速（逐招调，不做全局加速）；windup / active 前摇与有效判定段；hits 判定 { t, dmg, range, arc（度）, kind, stun, push, knock, posture, stop（顿帧档）}；
//   chain：接下一式的窗口 [起, 止]（缓冲的左键、或按住左键，到了起点就接）；next 下一式；
//   cancel：各种取消的窗口（guard 格挡、dodge 闪身、skill 剑诀，[[起, 止], …]）；move：过了这一刻按方向键即收招走开（收势的最短时长）；
//   commit：承诺段（这段里什么都取消不了）；turn：[前摇, 出手, 收势] 每秒最多转多少弧度；assist：近战辅助的距离；armor：霸体（不被轻受击打断，伤害 ×armor）
const ANY = [[0, 99]];
export const PLAYER_MOVES = {
  light1: { clip: 'atk1', name: '斜斩', end: 0.62, speed: 1.05, windup: [0, 0.185], active: [0.185, 0.255],
    hits: [{ t: 0.215, dmg: 15, range: 3.5, arc: 130, kind: 'light', stun: 0.3, push: 0.35, posture: 4, stop: 'light' }],
    chain: [0.32, 0.56], next: 'light2', cancel: { guard: [[0, 0.17], [0.27, 99]], dodge: [[0, 0.17], [0.27, 99]], skill: [[0.27, 99]] }, move: 0.44,
    turn: [16, 2.5, 6], assist: 4.5, intent: 5 },
  light2: { clip: 'atk2', name: '反手横斩', end: 0.64, speed: 1.05, windup: [0, 0.16], active: [0.16, 0.235],
    hits: [{ t: 0.19, dmg: 17, range: 3.5, arc: 150, kind: 'light', stun: 0.3, push: 0.4, posture: 4, stop: 'light' }],
    chain: [0.29, 0.56], next: 'light3', cancel: { guard: [[0, 0.15], [0.26, 99]], dodge: [[0, 0.15], [0.26, 99]], skill: [[0.26, 99]] }, move: 0.44,
    turn: [16, 2.5, 6], assist: 4.5, intent: 5 },
  light3: { clip: 'atk3', name: '突刺', end: 0.72, speed: 1.0, windup: [0, 0.225], active: [0.225, 0.3],
    hits: [{ t: 0.245, dmg: 21, range: 4.2, arc: 46, kind: 'thrust', stun: 0.38, push: 0.6, posture: 6, stop: 'thrust' }],
    chain: [0.3, 0.6], next: 'light4', cancel: { guard: [[0, 0.2], [0.32, 99]], dodge: [[0, 0.2], [0.3, 99]], skill: [[0.32, 99]] }, move: 0.5,
    turn: [16, 1.8, 6], assist: 5.0, intent: 6 },
  light4: { clip: 'atk4', name: '重劈', end: 1.12, speed: 1.0, windup: [0, 0.4], active: [0.4, 0.47],
    hits: [{ t: 0.45, dmg: 34, range: 3.8, arc: 74, kind: 'heavy', stun: 0.85, knock: 2.2, posture: 14, stop: 'heavy', shake: 0.2 }],
    chain: [1.05, 1.12], next: 'light1', cancel: { guard: [[0, 0.28], [0.6, 99]], dodge: [[0, 0.28], [0.6, 99]], skill: [[0.86, 99]] }, move: 0.96, commit: [0.28, 0.6],
    turn: [12, 1.2, 4], assist: 4.5, intent: 10, armor: 0.75, finisher: true },
  // 拔刀斩：iai 纳刀蓄势（入势 iai_enter → 蓄势循环 iai_hold / 缓步 iai_walk，按住 Z 期间一直在这一招里，见 moves.js 的 stepIai）；
  // 松开 Z 放出 iai_slash。iai_slash 里的两元数组是 [蓄力为 0, 蓄满] 两端，按 PLAYER_COMBAT.iai 的蓄力比例插值
  iai: { clip: 'iai_enter', name: '纳刀蓄势', cancel: { guard: ANY, dodge: ANY }, turn: [7, 7, 7], assist: 5.2 },
  iai_slash: { clip: 'iai_slash', name: '拔刀斩', end: 0.88, speed: 1.0, windup: [0, 0.13], active: [0.13, 0.27],
    hits: [{ t: 0.2, dmg: [26, 150], range: [3.9, 4.8], arc: 200, kind: 'heavy', stun: [0.5, 1.4], knock: [1.0, 3.4], posture: [10, 48], stop: 'heavy', shake: [0.12, 0.36] }],
    wave: { at: 0.2, speed: 26, range: [7, 12], radius: [1.3, 1.7], dmg: [20, 48], stun: 0.4 },
    chain: [0.7, 0.88], next: 'light1', cancel: { guard: [[0.5, 99]], dodge: [[0.42, 99]], skill: [[0.6, 99]] }, move: 0.66, commit: [0, 0.42],
    turn: [14, 0.8, 4], assist: 5.2, intent: [8, 20], armor: 0.7 },
  // 剑诀：release 放出的时刻（扣灵力、冷却），之前可被格挡 / 闪身取消；之后按各自窗口
  qi: { clip: 'cast_qi', name: '剑气 · 新月', end: 0.56, speed: 1.05, windup: [0, 0.2], release: 0.2, chain: [0.3, 0.56], next: 'light1',
    wave: { speed: 30, range: 26, radius: 1.3, dmg: 30, stun: 0.35 },
    cancel: { guard: [[0, 0.18], [0.3, 99]], dodge: [[0, 0.18], [0.28, 99]], skill: [[0.34, 99]] }, move: 0.38, turn: [16, 3, 6], assist: 22, intent: 4 },
  seal: { clip: 'cast_seal', name: '缚灵锁', end: 0.85, speed: 1.0, windup: [0, 0.32], release: 0.32, chain: [0.5, 0.85], next: 'light1',
    bind: { range: 9, arc: 70, max: 3, time: { enemy: 2.4, elite: 1.2, duel: 0.9, boss: 0.7 }, posture: 12, dr: 6 },
    cancel: { guard: [[0, 0.28], [0.5, 99]], dodge: [[0, 0.28], [0.48, 99]], skill: [[0.55, 99]] }, move: 0.55, turn: [14, 3, 6], assist: 9, intent: 4 },
  dash: { clip: 'Sword_Dash', name: '惊鸿掠影', from: 0, end: 0.95, speed: 1.2, release: 0.05, move: [0.05, 0.34, 7.5], iframes: [0, 0.38],
    path: { dmg: 28, radius: 1.5, stun: 0.55 }, trail: [0.05, 0.4],
    cancel: { guard: [[0, 0.04], [0.55, 99]], dodge: [[0.5, 99]], skill: [[0.6, 99]] }, move2: 0.62, commit: [0.05, 0.4], turn: [16, 0, 4], assist: 11, intent: 6 },
  heavy: { clip: 'Sword_Heavy_Combo', name: '破岳', from: 0.18, end: 3.05, speed: 1.35, release: 0.38, armor: 0.6, gold: true,
    hits: [
      { t: 0.38, dmg: 12, range: 3.3, arc: 150, kind: 'light', push: 0.25, stun: 0.35, posture: 3, stop: 'light' },
      { t: 0.52, dmg: 12, range: 3.3, arc: 150, kind: 'light', push: 0.25, stun: 0.35, posture: 3, stop: 'light' },
      { t: 1.15, dmg: 16, range: 3.5, arc: 170, kind: 'light', push: 0.4, stun: 0.45, posture: 4, stop: 'light' },
      { t: 1.82, dmg: 18, range: 3.5, arc: 170, kind: 'light', push: 0.5, stun: 0.5, posture: 5, stop: 'light' },
      { t: 2.56, dmg: 42, aoe: 4.8, kind: 'heavy', knock: 3.2, stun: 1.1, posture: 18, stop: 'heavy', shake: 0.38, slam: true },
    ],
    ring: { at: 2.2, r: 4.8 },
    cancel: { guard: [[0, 0.32], [0.6, 2.15], [2.8, 99]], dodge: [[0, 0.32], [0.6, 2.15], [2.75, 99]], skill: [[2.85, 99]] }, move: 2.85, commit: [2.15, 2.75],
    turn: [10, 1.5, 4], assist: 4.0, intent: 6 },
  ult: { clip: 'cast_ult', name: '万剑归宗', end: 1.9, speed: 1.0, release: 0.4, iframes: [0, 1.4],
    circle: 5.8, swords: 26, rain: [0.75, 2.55], swordDmg: 20, swordR: 1.5, final: { t: 2.95, dmg: 72, r: 6.2, knock: 3.5, stun: 1.4 },
    cancel: { guard: [[0, 0.3], [1.5, 99]], dodge: [[0, 0.3], [1.45, 99]], skill: [[1.6, 99]] }, move: 1.55, commit: [0.3, 1.45], turn: [10, 0, 4], assist: 16 },
  pill: { clip: 'Consume', name: '服丹', from: 0, end: 1.25, speed: 1.3, release: 0.62, heal: 80, mask: 'upper',
    cancel: { guard: [[0, 0.5], [0.8, 99]], dodge: [[0, 0.5], [0.75, 99]], skill: [[0.9, 99]] }, move: 0.9, turn: [6, 6, 6] },
  // 第十九轮：回血葫芦——动作只盖左臂与头颈（mask drink），下身照常走，只是最快 maxSpeed 米 / 秒；
  // release 喝到嘴里（扣一口、开始回血，healOver 秒回完）；sfx：拔塞、吞咽、塞回的时刻；hand：葫芦在左手里的时段
  gourd: { clip: 'drink', name: '回血葫芦', end: 1.35, speed: 1.0, release: 0.55, healOver: 0.4, mask: 'drink', maxSpeed: 1.2, hand: [0.22, 1.1],
    sfx: { open: 0.22, gulp: 0.6, close: 1.02 },
    cancel: { guard: [[0, 0.2], [1.1, 99]], dodge: [[0, 0.2], [1.0, 99]], skill: [[1.15, 99]] }, chain: [1.15, 1.35], next: 'light1', turn: [0, 0, 0] },
  // 第二十二轮：九霄凤焰的起手换成舞刀（cast_phoenix，约 1.2 秒，时间轴见 PHOENIX.cast）：release = 离刀发射（扣灵力、进冷却、凤凰离刀），
  // 之前可被格挡、闪身取消（commit：最后一刀之中不能取消）；施法时可以走（PHOENIX.cast.walk），由 moves.stepPhoenix 推进
  phoenix: { clip: 'cast_phoenix', name: '九霄凤焰', end: 1.2, speed: 1.0, release: 1.05, commit: [0.85, 1.05],
    cancel: { guard: [[0, 0.85], [1.05, 99]], dodge: [[0, 0.85], [1.05, 99]], skill: [[1.12, 99]] }, move: 1.08, turn: [10, 14, 6], assist: 22 },
  // 第二十三轮：雷龙破虚的起势（cast_dragon：举剑引雷 → 0.65 秒剑指雷云「提交」→ 收势）。release = 提交（终检通过才扣灵力、进冷却、开演出）；
  // 之前可被格挡、闪身取消（不扣费）；提交之后马上可以走、出剑、闪身、格挡（moves.stepDragon）
  dragon: { clip: 'cast_dragon', name: '雷龙破虚', end: 0.95, speed: 1.0, release: 0.65,
    cancel: { guard: [[0, 0.62], [0.68, 99]], dodge: [[0, 0.62], [0.68, 99]], skill: [[0.72, 99]] }, chain: [0.7, 0.95], next: 'light1', move: 0.68, turn: [10, 10, 6], assist: 30 },
  dodge: { clips: { f: 'dodge_f', b: 'dodge_b', l: 'dodge_l', r: 'dodge_r' }, end: 0.45, speed: 1.0, push: [0.06, 0.24], dist: 4.4, iframes: [0.0, 0.26],
    cancel: { guard: [[0.3, 99]], skill: [[0.32, 99]] }, chain: [0.3, 0.45], next: 'light1', move: 0.34, turn: [0, 0, 8] },
};
// 第二十轮：水墨特效（src/game/inkFx.js 画；素材是项目里的 FX_Ink slash 素材包，tools/r20_* 转换）。
// 刀光的大小、时长、颜色、粒子数、汇聚速度、挂点偏移、蓄力强度都在这里调。时间单位秒（游戏时间），长度单位米；
// 两元数组 [a, b]：拔刀斩里按蓄力比例 k（0 … 1）插值，其余地方是随机范围。出处注在各项后面（Unity 预制体里的原值见第二十轮报告）。
export const INK = {
  color: { ink: 0x09090c, mist: 0x55575e, light: 0xffffff },
  // 刀光带子：沿剑的真实轨迹，从动作自己的时刻 from 铺到 to（把 PLAYER_MOVES 的 active 包在里面）；
  //   inner：内沿在剑身上的位置（0 剑根 … 1 剑尖）；reach：外沿伸出剑尖几米；thick：带子侧对镜头时朝镜头补的半宽（竖劈从背后看不会缩成一条线）；
  //   hold：铺完停多久再碎；life：墨弧碎开、淡出的时长（Unity：Slash (2) 寿命 0.5 秒、六帧序列；这里短一些，免得挡住人）；drops：沿刀势甩出的墨点；mist：散开的灰色墨雾团；
  //   stroke：突刺——不铺扫过的面，剑尖划过处一笔朝镜头的墨痕（半宽 thick）；ring：刺到头的时刻，剑尖处一圈墨环朝刺的方向张开（从背后看得见）
  slash: {
    // 第二十三轮：普攻四式重做（拔刀斩不动）——ext：判定段里沿剑身把外沿伸到这一式的判定距离（见 INK.ext）；inner 内沿提到剑身外段（剑尖往里两成），
    //   wash：靠剑一侧这一成宽是淡墨过渡，浓墨核心在外侧——按实测的判定段带宽校准，浓墨核心约为第二十轮墨带的 2 倍（斜斩 0.74 → 约 1.43 米、
    //   横斩 0.74 → 约 1.48、重劈 0.91 → 约 1.61）；突刺是一笔朝镜头的墨痕，半宽 thick 由 0.15 加到 0.3；outer：外层墨雾、飞白、墨点的多少（倍数，见 INK.outer）
    light1: { from: 0.16, to: 0.285, inner: 0.8, reach: 0.3, ext: 1, wash: 0.33, thick: 0.1, hold: 0.04, life: 0.4, drops: 9, mist: 2, outer: 1 },
    light2: { from: 0.135, to: 0.27, inner: 0.8, reach: 0.3, ext: 1, wash: 0.34, thick: 0.1, hold: 0.04, life: 0.4, drops: 9, mist: 2, outer: 1 },
    light3: { from: 0.2, to: 0.31, stroke: true, ring: 0.245, reach: 0.4, ext: 1, thick: 0.3, hold: 0.04, life: 0.36, drops: 8, mist: 1, outer: 0.8 },
    light4: { from: 0.37, to: 0.5, inner: 0.72, reach: 0.42, ext: 1, wash: 0.02, thick: 0.15, hold: 0.07, life: 0.56, drops: 14, mist: 3, outer: 1.2, slam: 0.465, cleave: true },
    iai_slash: { from: 0.135, to: 0.33, inner: 0.45, reach: [0.35, 0.6], thick: [0.12, 0.18], hold: 0.06, life: [0.5, 0.75], drops: [10, 22], mist: [2, 4] },
  },
  // 带子：池子大小、每条最多几个采样点、补点的步长（动作时间）、白光亮边（跟着剑尖的一小段：多亮、多长）、碎开时噪声溶解的强度、被取消时碎开的时长；
  //   alpha 墨的浓度（不全遮死，透得出后面的人）；frame0 铺开时用六帧里的第几帧（第 0 帧最浓最满，第 1 帧已带飞白）
  ribbon: { pool: 8, max: 72, step: 1 / 240, white: 0.95, whiteLen: 0.07, erode: 0.6, cancelLife: 0.18, alpha: 0.9, frame0: 1 },
  // 第二十三轮：普攻的主墨带（只给普攻四式；拔刀斩照旧）。
  //   color：主墨、深核心、灰墨、飞白、细亮刀锋（夜里看得见的那一线，只在剑尖刚扫过的一小段）；
  //   ext：判定段里把外沿沿剑身伸到判定距离（最多伸 max 米；判定段前 pre 秒起渐伸、后 post 秒收回；外沿不低于脚下 floor 米、不高于脚下 top 米——
  //     判定只看水平距离（竖直容差 2.6 米），剑朝上的那一段只略伸，扫到水平时才伸满，不往天上铺一大片）；
  //   alpha 浓墨核心的浓度、washA 靠剑一侧淡墨的浓度、dry 干笔飞白的强度、edge 细亮刀锋的亮度；keep 新的一刀起手时，之前还在碎开的墨带最多再留几秒
  light: { color: { ink: 0x15191f, deep: 0x080b10, gray: 0x46505a, white: 0xd8d1c4, edge: 0xeef3f8 },
    ext: { max: 2.6, pre: 0.05, post: 0.06, floor: 0.12, top: 2.4 }, alpha: 0.8, washA: 0.28, dry: 0.75, edge: 0.75, keep: 0.14 },
  // 外层（不伤人，只扩气势）：墨雾（墨雾序列帧）、飞白（干笔横刷，暖白低透明）、笔锋（一笔弧形）、墨点——沿判定段的外沿每米 per 个（× 各式的 outer），
  //   往外散 spread 米（不超出判定外沿太多：前后错层、疏密不一，不连成一道边），随挥剑的走向带出去；寿命 life 秒；alpha 各自的浓度
  outer: { per: 2.4, spread: [0.05, 0.75], life: [0.2, 0.38], mist: [0.1, 0.18], white: [0.14, 0.24], flick: [0.4, 0.6] },
  // 第二十六轮：普攻第三、四式加强——从常用的背后镜头也看得清（刺、劈都是顺着视线的方向，原来从背后看只剩一个点、一条线）。
  // pierce（突刺，刺到头的一刻）：rings 一串墨环 [起始大小, 张到多大, 寿命]——从剑尖（lead 米外）起沿刺的方向排到这一式的判定外沿再往外 over 米，
  //   由近到远依次晚出 gap 秒（一圈墨浪顺着刺的方向推出去：贴身的敌人、刺到头的敌人都套在环里）；flash 剑尖白光（起止大小）；white 白色光环 [起, 止, 寿命]；
  //   spikes 放射的墨锋几道；spear 顺着刺的方向的一支墨枪的宽；needles 往前射出的几道细白光；helix 绕剑往前钻的螺旋墨带（圈数、半径由粗到细、带宽、寿命、转速 弧度 / 秒）；drops 墨点
  // cleave（重劈）：edgeOn 竖着的墨弧侧对镜头时只淡这么多（原来 0.92：从背后几乎看不见）；light 剑尖扫过之处一串白光（寿命、粗、拉长）；
  //   劈到底（INK.slash.light4.slam 动作时刻）：blade 一道竖着的白光刀痕 [高, 寿命]（劈下的那一刀，任何角度看都是竖的）、column 刀痕后一团墨 [宽, 高, 寿命]（衬着白光）；
  //   地上：blot 一团晕墨（起止大小）、ring 一圈墨浪、wave 顺着劈的方向裂开的一路——地上一道墨裂，两侧依次翻起的墨锋（几段、间距、依次晚出、翻起多高、浓度、寿命）、
  //   cracks 放射的墨裂；flash 白光；sparks 往上溅的光点；drops 墨点；arc 半空一道竖着的白色月牙（剑势的残影，起止大小、寿命）
  //   （第一版的墨柱一路排开、又高又浓，从背后看把人和敌人都盖住了半秒：改成贴地裂开、竖着的只留一道白光与一小团墨）
  pierce: { rings: [[0.5, 1.9, 0.34], [0.7, 2.4, 0.38], [0.85, 2.8, 0.42], [1.0, 3.2, 0.46]], lead: 0.1, over: 0.5, gap: 0.03, flash: [0.9, 2.8], white: [0.5, 2.6, 0.22],
    spikes: 8, spear: 0.38, needles: 7, helix: { turns: 1.9, r: [0.62, 0.16], w: 0.2, life: 0.46, spin: 9 }, drops: 16 },
  cleave: { edgeOn: 0.3, light: { life: 0.26, w: 0.24, stretch: 2.2 }, blade: [3.6, 0.24], column: [0.9, 2.0, 0.34], blot: [2.4, 3.6], ring: [0.6, 4.4],
    wave: { n: 5, step: 0.6, delay: 0.026, h: 1.25, alpha: 0.8, life: 0.42 }, cracks: 9, flash: [1.3, 3.6], sparks: 14, drops: 20, arc: { size: [2.6, 4.2], life: 0.22 }, shake: 0.14 },
  // 第二十六轮：项目作者新放的第三组水墨（Piloto Studio「Realistic Ying Yang Spells VFX Pack」，tools/r26_build_ink3.py → fx/ink3：太极、喷墨、竹叶、裂纹、刺线）。
  //   突刺：pierceTaiji 刺穿处那一圈换成一面太极印（朝着刺的方向，旋转着张开再化开：[起始大小, 张到多大, 寿命, 转速 弧度 / 秒]）；
  //     fan 顺着刺的方向从刺穿处喷出的一束墨（两片十字交叉：[长, 宽, 寿命]）；stab 一束收向前方的白色刺线（[长, 宽, 寿命]）；pierceLeaves 被剑风带出的竹叶几片；
  //   重劈：cleaveTaiji 劈到底时地上盖的一面太极印 [起, 止, 寿命, 转速]；crack 地上放射的墨裂（起止大小）；cleaveLeaves 震起的竹叶几片；
  //   leaf 竹叶的颜色（墨里带一点青）、大小
  //   （太极印：突刺的纸白一半半透（paper），免得把敌人整个盖住；重劈的印往前挪 ahead 米——落点就在人脚前，从背后看会被人挡住——铺过敌人脚下；
  //    有太极印时地上那团晕墨淡到 blotK 倍：太极才是地上的主角）
  ink3: { pierceTaiji: [0.5, 1.8, 0.42, 5], paper: 0.7, fan: [2.4, 1.3, 0.34], stab: [3.4, 0.8, 0.16], pierceLeaves: 5,
    cleaveTaiji: [1.4, 4.4, 1.0, 1.6], ahead: 1.3, blotK: 0.55, crack: [2.6, 3.6], cleaveLeaves: 9, leaf: { color: 0x17211b, size: [0.24, 0.36] } },
  // 命中的爆墨（只在真实命中、接触点上；按招式）：slash 斜斩 / 横斩中小型飞溅，thrust 突刺向前穿出的笔锋，heavy 重劈厚重、向下与两侧展开；crit 暴击（反击强化）适度放大
  hit2: { slash: { burst: [0.85, 1.05], tendril: [1.0, 0.75], drops: [7, 10], life: 0.36 }, thrust: { burst: [0.6, 0.75], stab: [1.7, 0.55], drops: [7, 10], life: 0.3 },
    heavy: { burst: [1.4, 1.75], splat: [1.8, 2.4], tendril: [1.4, 0.9], drops: [12, 16], life: 0.5 }, crit: 1.25, flash: 0.5 },
  // 命中：实际接触点上一团墨溅（ink_03_all 四帧：Unity 里寿命 0.6、序列帧在前 44% 放完）、一朵受击墨花（Hit by flash-1）、墨点、一点白光；重击放大 heavy 倍
  hit: { size: [0.8, 1.15], life: 0.55, span: 0.5, drops: [6, 10], flash: 0.85, heavy: 1.35 },
  // 拔刀斩：出刀（动作时刻 at，剑身离开鞘口）放出月牙带——包里的月牙网格（Eric_Cylinder002）放平，外沿半径 = 这一刀的判定距离、张开 = 判定弧（200°），
  //   在动作时刻 sweep 之间自左向右扫开（判定在 0.2 秒，那一帧已扫开九成八）；判定之前跟着人走（判定按那一刻的位置算）；y 离地多高；flat 竖向压扁；
  //   life 碎开淡出；drops 向外飞散的墨点；splash 弧上的墨溅；light 扫开前沿的白光
  iai: { at: 0.14, y: 1.05, flat: 0.32, sweep: [0.14, 0.205], hold: 0.06, life: [0.55, 0.85], drops: [10, 26], splash: [2, 5], light: [0.55, 1.0], ghost: 0xd6dbe2 },
  // 拔刀斩的剑气（蓄过 3 秒）：同一个月牙网格缩到剑气的半径，墨色、前沿白光，随剑气飞行；沿途甩墨点
  wave: { scale: 1.2, arc: 150, drops: 34 },
  // 蓄力：向刀汇聚的墨点（dot）、墨雾（mist）、细小光粒（light）——每秒生几颗（[刚开始, 蓄满]，蓄满后不再加）、从多远收拢（水平半径、上下）、
  //   几秒收到（越蓄越快）、绕几圈（螺旋）、大小（越近越小，到了即没）；near：刀周围一小团打转的墨雾；
  //   swirl：弯带子（Ink_Plane001，包里 FX_InkSlash_04_Charge 的做法：一笔墨顺着带子扫进剑柄）每隔几秒一条、过一档时一齐几条；
  //   glint：鞘口一道细亮边（亮度随蓄力）；fade：取消、受击打断、力竭时已有的散去用几秒；fadeRelease：出刀时
  //   target：汇聚点在鞘中那把剑的本地坐标（+Y 朝剑尖）：hilt 剑柄（握持处往柄尾）、mouth 鞘口（护手前）——跟着手与鞘走
  charge: {
    rate: { dot: [14, 40], mist: [2, 5], light: [8, 22] },
    life: [0.95, 0.55], radius: [0.9, 1.6], height: [-0.6, 0.9], turns: [0.3, 0.75],
    size: { dot: [0.04, 0.075], mist: [0.36, 0.6], light: [0.07, 0.11] },
    near: { rate: [2.5, 5], radius: [0.1, 0.3], life: 1.2, size: [0.3, 0.5] },        // 刀周围一小团墨雾（贴着剑柄、鞘口打转）
    stretch: 0.09,                                                                       // 墨点、光粒顺着来路拉长（每米 / 秒多出几倍）
    swirl: { every: [1.2, 0.5], life: 0.34, len: [1.1, 1.6], thin: 0.6, burst: 3, pool: 6 },     // 弯带子（thin：带子宽度再收窄）
    glint: { len: 0.62, width: 0.05, shift: -0.1, gain: 1.5, pulse: 0.55, k: [0.15, 1.0] },     // 细亮边：长、宽、中心离鞘口（负 = 往剑柄一侧）、亮度、蓄满后一闪的间隔
    fade: 0.28, fadeRelease: 0.12,
    target: { hilt: -0.08, mouth: 0.07 },
  },
  // 池子（同时存在的上限；超出时挤掉最旧的）
  pools: { ink: 1024, light: 512, charge: 192, ink2: 768, ink3: 320, light3: 160 },
};

// 第二十一轮：九霄凤焰（金丹初期解锁的大招）——两种模式共用冷却：凤翔天击（控场、续航、范围攻击与阶段斩杀）、凤灵护战（持续输出、分担敌人攻击）。
// 逻辑在 game/phoenix.js，模型与动作在 actors/phoenix.js，火带、印记、冲击环等特效在 game/phoenixFx.js；首版配置，未经实战平衡。
// 距离单位米、时间秒（统一的游戏时间：暂停、页面失焦、Boss 阶段过场时不走）。所有伤害 = D_cast × 系数（D_cast 见 dBase）
export const PHOENIX = {
  name: '九霄凤焰', glyph: '凤', key: 'Digit3', modeKey: 'Digit4',
  modes: { strike: { name: '凤翔天击', glyph: '翔' }, guard: { name: '凤灵护战', glyph: '护' } },
  unlock: 21,                // 金丹初期（按等级；境界由等级推导）
  cooldown: 90,              // 两种模式共用；释放成功（放出那一刻）才扣灵力、进冷却，起手里合法取消不扣
  mpCost: 0.3,               // 消耗最大战斗灵力的 30%
  // D_base：21 级凤凰大招的基础伤害参考，写死在这里，不在施法时反推。第二十二轮首轮测试值 360（第二十一轮为 120 = 21 级普通单击 15 × 8）。
  // D_cast = D_base × 等级成长（伤害倍率）× 适用装备 × 被动 × 临时增伤（离刀发射那一刻记下快照；之后换装、升级、增伤变化都不改已放出的凤凰与火焰）。
  // 弹反后的「反击强化」只给普攻与拔刀斩，不算进 D_cast
  dBase: 360,
  crit: { rate: 0.1, mult: 1.5 },      // 暴击：直接撞击、凤焰弹、掠翼突袭可暴击（施法时记下，同一次攻击重复碰撞不重复抽取）
  lowRealmK: 2,                        // 目标的大境界低于主人（施法快照）：伤害 ×2（治疗、生命、攻速、时长、冷却不翻倍）
  colors: { red: 0x9e2f35, gold: 0xf2a43a, edge: 0xf6d27a, core: 0xfff1c2, tail: 0xb83724, heal: 0x8fe5bc, parryA: 0xffd27a, parryB: 0xe94b35 },
  model: { url: 'assets/converted/phoenix/phoenix.glb', strikeScale: 5.2, guardScale: 3.6, flap: 1.0, glideFrame: 96 },
  // ---- 凤翔天击 ----
  strike: {
    // 第二十二轮：常规 12 米/秒；前方近处有对准、无遮挡的敌人时平滑加速俯冲到 dive.speed（时间常数 dive.tau 秒，偏离时同样平滑回落）。
    // 转向：期望方向先按时间常数 smooth 秒平滑，再按水平 turnH、垂直 turnV（度 / 秒）限幅——都按真实时间计，不按帧
    duration: 8, speed: 12, turnH: 360, turnV: 300, smooth: 0.08,
    dive: { speed: 20, tau: 0.2, range: 16, cone: 22 },        // 俯冲：敌人在 range 米内、与飞行方向夹角 cone° 内、看得见
    // 瞄准：镜头准星射线打到的世界点（地形、构筑物、敌人身体；rayMax 米内都没打到就取 rayMax 米处），凤凰从自己的位置朝它转；
    // 离瞄准点 near 米内、或已越过它（在身后）时保持当前方向，不来回翻
    aim: { rayMax: 60, near: 2.5 },
    // 轻度瞄准辅助（可关）：准星 cone° 内、离凤凰 range 米内、看得见的敌人，把期望方向往它偏 k（只微调，不拐大弯、不打友方）
    assist: { on: true, range: 15, cone: 12, k: 0.5 },
    maxDist: 80, warnDist: 68, retake: 65,        // 离主人最远；接近时提示；超过即自动折返，回到 retake 米内才准再接管（滞回）
    pitchLimit: 89, camPitch: [-80, 80],          // 凤凰飞行的俯仰限制（度）、飞行阶段镜头的俯仰范围（度）——两者分开配置
    radius: 1.1,                                  // 撞击判定的身体半径（连续检测：每帧扫过的一段）
    hit: { main: 2.0, burst: 0.75, burstR: 6, hitStop: 0.08, shake: 0.32 },     // 第二十二轮：主目标 2.0、周围 0.75（主目标不重复吃周围）
    // 秒杀（阶段斩杀）：p(L) = clamp(p0 + (p1 − p0) × (L − L0) / span, p0, p1)，低大境界目标 ×2、最高 cap；只对直接撞击的主目标判一次
    execute: { p0: 0.005, p1: 0.05, L0: 21, span: 34, cap: 0.1 },
    // 地面火带：凤凰路径下方最近的真实阻挡表面（向下 rayDown 米内；超出不投火），按落点移动距离每 spacing 米一段、宽 width；
    // 坡度超过 maxSlope 度、或最近的阻挡是树冠 / 不可承载的屋顶等无效表面时不投（不继续往下找）；两段落点相隔超过 gap 米（跨虚空、墙、无效地表）不连
    band: { spacing: 1.5, width: 3, life: 20, rayDown: 12, maxSlope: 40, minMove: 0.6, gap: 3.4 },
    seal: { radius: 4, life: 20 },                // 撞击处的凤焰印（有效地表上）
    tick: 0.5, burn: 0.01, heal: 0.03,            // 每 0.5 秒：敌人受 0.01 D_cast（低大境界 ×2），主人恢复施法时最大生命的 3%
    parry: { cooldown: 1, radius: 5, k: 0.15, hitStop: 0.05, shake: 0.14 },      // 凤焰弹反：在自己的火带 / 印记中真实弹反成功时
  },
  // ---- 凤灵护战 ----
  guard: {
    duration: 30, search: 25, follow: 12, speed: 10, height: 3.4,
    gcd: 2.5,                                     // 公共攻击间隔
    bolt: { k: 0.18, cd: 2.5, range: 20, windup: 0.42, speed: 26, radius: 0.9 },
    swoop: { k: 0.22, cd: 6, range: 15, windup: 0.5, dur: 0.75, width: 2.2 },
    breath: { k: 0.25, cd: 8, range: 9, windup: 0.6, dur: 1.2, arc: 50 },
  },
  // ---- 隐藏仇恨（每个敌人各自 0–100）----
  // blind：改打凤凰期间连续看不见（墙、柱子挡住）这么久才算失效（飞行中擦过柱子的一两帧不算）；rearm：失效之后至少隔这么久才再改打
  aggro: { max: 100, base: 25, dmg: 15, cap: 40, idle: 3, decay: 5, hold: 2, hitDrop: 30, turn: 120, chase: 25, blind: 0.25, rearm: 0.5 },
  fire: { maxUnits: 256 },                         // 同时活跃的火焰渲染单元上限（逻辑区域另存，不受此限）
  // 第二十二轮：出招时间轴（与动作 cast_phoenix 同一条，秒）——舞刀起势 → 凤凰凝聚 → 随舞刀绕身一周 → 刀刃引导 → 从刀尖飞出 → 收势。
  //   gather 起：剑上金红细光、羽状灵焰向剑汇聚；show：凤凰开始显形（灵体，spirit.scale）；orbit：绕身一周（人物局部空间，中心跟着人走）；
  //   swing：收拢刀势、挥出最后一刀，凤凰沿刀刃汇向刀尖；launch：离刀发射（扣灵力、进冷却、伤害快照、8 秒飞行起算、开碰撞投火与操控）；end：收势完。
  //   承诺段 [swing, launch]：最后一刀之中不能取消；之前可被格挡、闪身合法取消（不扣费，预演的凤凰、刀光、声音一并撤掉）。
  //   施法时可以走（正常步行速度 × walk），离刀后恢复正常
  cast: { gather: 0, show: 0.18, orbit: [0.18, 0.85], swing: 0.85, launch: 1.05, end: 1.2, walk: 0.6,
    // 灵体：显形时由剑尖处 scale0 的小灵体在 fadeIn 秒内显出、展开到 scale；绕身的半径（米，至少「半翼展 × scale + clear」，按模型的真实翼展算）、
    // 身体中心离地的高度（腰到肩之间）与起伏；lag：绕身的中段落后剑尖的角度（两端与剑尖同位）。汇聚时收成 tip 尺度贴上刀身
    spirit: { scale0: 0.6, scale: 1.6, tip: 0.6, radius: 1.9, clear: 0.95, height: 1.3, bob: 0.12, lag: 25, fadeIn: 0.25 },
    grow: 0.35,                                   // 离刀之后 grow 秒内由 tip 尺度平滑展开到正式尺度（凤翔 5.2、护战 3.6）
    // 汇向刀尖：绕身的终点 → 刀身上 slideFrom（0 护手 … 1 剑尖）处（swing 起到 launch − tipLead），再贴着刀刃滑到剑尖（最后 tipLead 秒）
    slideFrom: 0.45, tipLead: 0.08 },
};

// 第二十三轮：主动技能的装备槽（六格，game/loadout.js）。
//   keys / labels：六个槽的固定按键（Q、X、R、V、1、3）；defaults：首次（存档里还没有合法配置时）的默认装配——Q 剑气、X 破岳、R 拔刀斩（鼠标中键同）、V 万剑归宗、1 缚灵锁、3 九霄凤焰；
//   skills：占槽的主动技能（技能库）——不占槽的：普攻、闪身（C）、格挡与弹反、反击强化、移动、跳跃、御剑、交互、葫芦（2）、服丹（G）；
//   calm：脱战几秒、且没有正在施法时才能调整；version：存档迁移的版本（只迁移一次）
export const LOADOUT = {
  keys: ['KeyQ', 'KeyX', 'KeyR', 'KeyV', 'Digit1', 'Digit3'], labels: ['Q', 'X', 'R', 'V', '1', '3'],
  defaults: ['qi', 'heavy', 'power', 'ult', 'seal', 'phoenix'],
  skills: ['qi', 'dash', 'heavy', 'power', 'ult', 'seal', 'phoenix', 'dragon'],
  calm: 5, version: 1,
};
// 剑诀面板（K）里的说明：操作、特点、解锁条件（消耗与冷却读各自的配置，不在这里重复）。unlock：{ level, text }，没有的入门即会
export const SKILL_INFO = {
  qi: { op: '按下：横斩出一道新月剑气（26 米）', tags: ['远程', '贯穿', '撞墙即散'] },
  dash: { op: '按下：沿朝向疾掠七步', tags: ['位移', '掠身无敌', '途经之敌各受一剑'] },
  heavy: { op: '按下：四连重斩，末式举剑破地', tags: ['霸体', '范围震波', '掀翻'] },
  power: { op: '按住纳刀蓄势、松开出刀（鼠标中键同）', tags: ['蓄力', '可缓步、可闪身', '蓄过 3 秒多一道剑气'] },
  ult: { op: '剑意圆满时按下', tags: ['剑阵', '范围', '巨剑镇阵'] },
  seal: { op: '按下：金链缚住身前至多三个敌人', tags: ['控制', '扇形 9 米'] },
  phoenix: { op: '按下舞刀召凤；按 4 切换下一次的模式', tags: ['召唤', '凤翔天击 / 凤灵护战', '共用冷却'], unlock: { level: 21, text: '金丹初期（21 级）' } },
  dragon: { op: '按下：落在锁定的敌人 / 准星对着的敌人 / 准星对着的地面', tags: ['召唤', '8 米范围持续雷击', '最后俯冲'], unlock: { level: 21, text: '金丹初期（21 级）' } },
};

// 第二十三轮：雷龙破虚（金丹初期解锁的召唤技：多目标持续雷击 + 最后俯冲爆发）。
// 逻辑在 game/thunderDragon.js，龙的模型与骨骼在 actors/loong.js，裂隙、雷云、雷柱、预兆、选点预览在 game/thunderFx.js；首版测试配置，未经实战平衡。
// 距离单位米（项目单位实测即米：人物身高约 1.8），时间秒——都按统一的战斗时钟（暂停、页面失焦、Boss 阶段过场时不走，恢复后不补算）。
// 伤害 = 各自的 21 级基础值 × 等级成长（伤害倍率）× 适用装备 × 被动 × 临时增伤（提交那一刻记下快照）；不继承凤凰的低境界翻倍与秒杀。
export const DRAGON = {
  name: '雷龙破虚', glyph: '雷',
  unlock: 21,                // 金丹初期（按等级）
  mpCost: 0.35, cooldown: 120,
  range: 30,                 // 选点离主人最多 30 米（三维距离：主人脚下 → 选点的地面）
  radius: 8,                 // 雷云的作用半径（选点预览与结算是同一个值）
  aimRay: 70,                // 准星射线最远找这么远（找不到地面、敌人就是「准星处没有地面」）
  // 时间轴（从按键起算，与动作 cast_dragon 同一条）：0–0.65 引雷起势；0.65 提交；裂隙 crack 段细裂、open 段撑开；龙 emerge 段由裂隙逐段穿出；
  //   swim 段在雷云间盘游；charge 段蓄势（俯冲落点在其末尾定下）；dive 段俯冲、接触爆雷；之后 fade 秒雷云、裂隙、电弧渐隐。
  //   emerge：龙头开始由裂隙探出的时刻——裂隙这时还只是一道细缝（crack 段），被它撑开（open 段）；身体随后逐段穿出，约 2.5 秒尾巴离开裂隙
  t: { commit: 0.65, crack: [0.65, 0.95], open: [0.95, 1.5], emerge: 0.85, swim: [2.4, 10.0], charge: [10.0, 10.6], dive: [10.6, 11.6], fade: 1.0, clouds: [0.75, 2.0] },
  // 雷击脉冲：first 起每 every 秒一次，共 count 次；每次各自结算范围内的敌人，至多 max 个（优先主要目标，其余按离中心由近到远，同距离按稳定编号）。
  //   omen：落雷前几秒在选中的目标脚下起蓝白预兆（跟着目标走）；lock：落雷前几秒锁定落点（之后不再追）；strikeR：落点附近多远（加目标半径）算打中；
  //   dmg：21 级每次每个目标的基础伤害；stun / posture：雷击的轻僵直与架势
  pulse: { first: 2.4, every: 0.8, count: 10, max: 15, omen: 0.35, lock: 0.12, strikeR: 1.6, dmg: 60, stun: 0.25, posture: 4 },
  // 俯冲：dmg 直接命中、burst 周围爆发（半径 burstR，直接目标不重复吃）；track：蓄势时落点可随主要目标移动，但离雷云中心不超过 radius + track、
  //   离施法起点不超过 range、无遮挡（由雷云中心上方 height 米看得见、头顶空着）；time：由蓄势末到落点的时长（越扑越快）；
  //   俯冲的路径：顺着蓄势末的方向沿半径 turnR 的圆弧转向落点（不急拐；落点太近时半径自动收小），再直线扑下；起点速度与蓄势末一样、
  //   匀加速到 time 秒时正好到落点，还没碰到就顺着方向再冲（总长的 over 倍为止）；headR：接触检测的龙头半径；crit：直接命中按直接攻击的暴击规则（每次攻击对每个目标只抽一次）
  dive: { dmg: 900, burst: 300, burstR: 5, track: 6, time: 0.45, headR: 1.1, crit: { rate: 0.1, mult: 1.5 }, stun: 1.0, knock: 2.4, posture: 24,
    burstStun: 0.5, burstPush: 1.4, burstPosture: 8, hitStop: 0.08, shake: 0.6, height: 9.5, turnR: 4, over: 1.35 },
  // 第二十六轮：俯冲撞上之后的压迫感（只是表现，不改伤害、目标与时长）。撞上的一刻（ThunderFx.quake）：pillars 天上同时劈下的几道雷柱；
  //   wave 一圈深色气浪（白天白地面上也看得见；外缘一线电光）张到 r 米、寿命；cracks 地上放射的电裂纹（半径 r 米、留 life 秒：前一半缝芯电光闪烁，之后只剩焦黑的缝）；
  //   dust 贴地往外推的尘团几团；debris 崩起的碎石几块；kick 镜头往下一顿（米 ×）；flash 白闪（原 0.22）；震屏见 dive.shake（0.35 → 0.6，上限 shakeMax）。
  //   after：余震——撞上之后 at 各时刻再由雷云劈下一道（一半落在被撞到的敌人身上、一半落在落点四周 r 米内），各自一声雷、一小下震屏；
  //   arcs：落点四周 r 米内残留的电弧（持续 secs 秒，每秒几道：由多到少）；shock：被撞到的敌人身上缠着的电光（直接撞中 / 被爆到的留几秒、每秒几道）
  quake: { pillars: 3, wave: { r: 11, life: 0.8 }, cracks: { r: 5.5, life: 2.6 }, dust: 14, debris: 22, kick: 0.6, flash: 0.38,
    after: { at: [0.16, 0.36, 0.58, 0.84], r: [1.2, 4.2], shake: 0.2 }, arcs: { secs: 1.6, rate: [18, 3], r: 3.6 }, shock: { direct: 1.2, burst: 0.7, rate: 9 } },
  // 蓄势：接着盘游的方向往里收、往上抬——半径收到 r 米、龙头抬到离地 h 米（盘起身子，越收越慢）；末了仍是顺着盘游的水平方向（俯冲由此顺势扑出）。
  //   from：由几秒起开始收（比蓄势段 t.charge 早一些，免得半秒里急升急收、身子折出硬角；到 t.charge[1] 收完）
  charge: { r: 4, h: 11.5, from: 9.2 },
  // 演出空间：选点正上方 2.4–clear 米、四周 ring 米处四点的 low–clear 米（龙与雷云所在的高度）、裂隙所在处都不能有实心体（屋顶、岩体、殿顶）；
  // 四周更低的屋檐、回廊不挡（檐下的敌人不挨雷）；地图边界由场景给
  space: { clear: 9.5, ring: 4, low: 6.0 },
  // 雷云：count 团（中央厚、外围错落），底 base 米、顶 top 米（离选点地面）；low：流畅画质时每团几片（不影响伤害、目标与次数）
  cloud: { count: 10, base: 7.2, top: 10.6, puffs: 8, low: 5 },
  // 龙：模型总长 length 米；盘游的半径、离地高度、起伏、巡游角速度（俯视顺时针）；
  //   出场 emerge：穿出裂隙（往施法者一侧、抬头 rise）→ 越过雷云中心右侧 top 米高的上空 → 向左回旋半圈（半径 turnR，与盘游的圆内切）→
  //   在雷云左侧顺势并入盘游（方向一致，不折回）；入圈速度 vIn 米 / 秒，ease 秒内缓到巡游速度；出场一段按弧长走、速度线性变到入圈速度；裂隙在雷云中心之后 back 米、往右偏 side 米、离地 h 米，宽 w、高 tall；
  //   龙穿出之后裂隙收成一道细缝（narrow：撑开程度降到这么多，在 shrink 时段里收），收尾时合上
  model: { url: 'assets/converted/loong/loong.glb', length: 20 },
  swim: { r: 6.5, h: 7.2, bob: 0.9, w: 1.2 },
  emerge: { rise: 0.15, top: 11, turnR: 3.8, vIn: 12, ease: 0.9 },
  rift: { back: 8.5, side: 3.0, h: 8.0, w: 2.6, tall: 6.4, narrow: 0.3, shrink: [2.7, 3.5] },
  colors: { silver: 0xa8d9ed, deep: 0x426086, cloud: 0x273044, core: 0xeaf8ff, arc: 0x8fadff, rift: 0x101426, deny: 0xff4b3a },
  shakeMax: 0.65,            // 震屏上限（再乘设置里的「震屏与闪光」）；第二十六轮 0.4 → 0.65（俯冲撞地）
};

// 拔剑入势（交战开始、切磋开打时由平常站姿换成中段架势；随时可被任何操作接过去）
PLAYER_MOVES.draw = { clip: 'draw', name: '拔剑', end: 0.32, speed: 1.0, grab: 0.1, chain: [0, 0.32], next: 'light1', cancel: { guard: ANY, dodge: ANY, skill: ANY }, move: 0, turn: [0, 0, 0] };
// 受击、破防、失衡、倒地（动作与时长；armor 招式只吃 flinch 的伤害、不演受击）
export const PLAYER_REACT = {
  flinch: { clips: { f: 'hit_f', b: 'hit_b', l: 'hit_l', r: 'hit_r' }, dur: 0.38, dodgeAfter: 0.14, guardAfter: 0.2 },
  knockback: { clip: 'hit_heavy', dur: 0.8, dodgeAfter: 0.45, iframes: 0.35 },
  stun: { clip: 'stagger', dur: 0.85, speed: 1.4, spark: true },
  stagger: { clip: 'stagger', dur: 1.2 },
  guardbreak: { clip: 'guard_break', dur: 0.95, dodgeAfter: 0.5 },
  knockdown: { clip: 'Hit_Knockback', to: 0.8, speed: 1.0, getUp: { clip: 'LayToIdle', speed: 1.5 }, iframes: 2.2 },
};

// 魔修（敌对阵营）：aggro 发现距离，attackRange 出手距离，windup 出手前摇（地面有红色预警），cooldown 两次出手间隔
// anim（第十四轮）：出手动作 { clip, hold（前摇时停在这一刻）, hit（出手的那一刻）, to, rec }
// def（第十七轮）：出手的防御属性（ATTACK_DEF）——残魂、魔影的爪可挡可弹；术士的魔弹可挡、弹反时弹回；魔将的剑可挡可弹，震地不可挡不可弹
export const ENEMIES = {
  shade: { name: '魔修残魂', hp: 70, speed: 3.4, aggro: 16, attackRange: 1.9, damage: 11, windup: 0.55, cooldown: 1.7, radius: 0.45, look: 'shade', def: 'claw',
    anim: { melee: { clip: 'Zombie_Scratch', hold: 0.38, hit: 0.55, to: 1.1 } } },
  caster: { name: '魔修术士', hp: 55, speed: 3.0, aggro: 22, attackRange: 13, damage: 13, windup: 0.85, cooldown: 2.8, projSpeed: 13, radius: 0.45, look: 'caster', ranged: true, def: 'bolt',
    anim: { cast: { clip: 'OverhandThrow', hold: 0.26, hit: 0.38, to: 0.9 } } },
  elite: { name: '幽渊魔将', hp: 300, speed: 2.9, aggro: 26, attackRange: 2.7, damage: 18, windup: 0.9, cooldown: 2.1, radius: 0.75, look: 'elite', scale: 1.35, poise: true, def: 'blade',
    slam: { radius: 4.6, damage: 24, windup: 1.3, cooldown: 7.5, def: 'aoe' },
    anim: { melee: { clip: 'Sword_Regular_B', hold: 0.1, hit: 0.25, to: 0.53 }, slam: { clip: 'Sword_Heavy_Combo', from: 2.2, hold: 2.36, hit: 2.56, to: 2.95 } } },
  // 第二十一轮：试炼魔将——与魔将相同，只是同一条总气血按阈值分两段（stages：剩余比例到这里转入下一段，转段时短暂无敌）。
  // 验证「同一总生命条按阈值转阶段」这种 Boss 气血结构用（第五十层龙君是另一种：每阶段一条独立的气血）；眼下只在自检里召出
  eliteStaged: { name: '试炼魔将', hp: 520, speed: 2.9, aggro: 26, attackRange: 2.7, damage: 18, windup: 0.9, cooldown: 2.1, radius: 0.75, look: 'elite', scale: 1.35, poise: true, def: 'blade',
    stages: [0.5], stageShift: 1.4,
    slam: { radius: 4.6, damage: 24, windup: 1.3, cooldown: 7.5, def: 'aoe' },
    anim: { melee: { clip: 'Sword_Regular_B', hold: 0.1, hit: 0.25, to: 0.53 }, slam: { clip: 'Sword_Heavy_Combo', from: 2.2, hold: 2.36, hit: 2.56, to: 2.95 } } },
  // 袭山的魔影（宗门地表）
  invader: { name: '魔影', hp: 90, speed: 4.4, aggro: 30, attackRange: 1.9, damage: 9, windup: 0.5, cooldown: 1.6, radius: 0.45, look: 'shade', def: 'claw',
    anim: { melee: { clip: 'Melee_Hook', hold: 0.12, hit: 0.25, to: 0.47 } } },
  invCaster: { name: '魔影术士', hp: 75, speed: 3.4, aggro: 30, attackRange: 13, damage: 12, windup: 0.85, cooldown: 2.8, projSpeed: 13, radius: 0.45, look: 'caster', ranged: true, def: 'bolt',
    anim: { cast: { clip: 'OverhandThrow', hold: 0.26, hit: 0.38, to: 0.9 } } },
};

// 护宗双龙：只攻击敌对阵营；冰龙侧重减速与冻结，火龙侧重范围火焰伤害
export const DRAGON_COMBAT = {
  ice: {
    range: 82,              // 以龙首为圆心的攻击半径
    cooldown: 3.6,
    damage: 16,
    projSpeed: 46,          // 寒息飞行速度
    splash: 4.5,            // 落点溅射半径
    slow: 0.45,             // 移速降为原来的 45%
    slowTime: 4.5,
    freezeEvery: 2,         // 同一目标每被命中两次冻结一次
    freezeTime: 1.8,
  },
  fire: {
    range: 88,
    cooldown: 6.5,
    damage: 22,
    projSpeed: 38,
    splash: 6.5,            // 火焰范围伤害半径（落地有预警圈）
    burnDps: 6,
    burnTime: 3.5,
  },
  alertRadius: 120,         // 敌人进入此范围（距龙）即进入警戒
  calmDelay: 6,             // 威胁解除后恢复驻守的延迟
};
