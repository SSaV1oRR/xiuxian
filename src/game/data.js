// 宗门内容：人物、物品、典籍、内景描述

export const ITEMS = {
  token: { name: '弟子腰牌', desc: '青岚宗外门弟子腰牌，正面刻「青岚」，背面刻入门年月。', kind: '信物' },
  qinglu: { name: '清露草', desc: '叶尖凝着晨露的灵草，清心安神，是养元丹的主药。', kind: '灵草' },
  yangyuan: { name: '养元丹', desc: '丹房所制的入门丹药，色如温玉，可温养元气。', kind: '丹药' },
  foxfruit: { name: '雾隐果', desc: '后山灵狐所赠的小果，果皮上似有薄雾流转，闻之神清。', kind: '灵果' },
  rubbing: { name: '古碑拓文', desc: '竹林溪畔古碑的拓文，字迹古拙，记着开山旧事。', kind: '文书' },
  mojing: { name: '幽渊魔晶', desc: '幽渊魔将溃散后留下的暗红晶屑，封印之力压住了其中的魔性，握在手里微微发冷。可交执事堂换取贡献，或留作炼器之材。', kind: '材料' },
  canjuan: { name: '镇魔残卷', desc: '核心祭坛下压着的半卷玉简，记有祖师「四象镇魔」的阵诀残篇。', kind: '功法' },
  // 第十六轮：通天塔第五十层 · 镇塔龙君·烬霄
  longlin: { name: '烬霄龙鳞', desc: '镇塔龙君身上剥落的一片暗金边的黑鳞，鳞下还有一丝紫色的灵焰不肯熄灭。可作炼器之材。', kind: '材料' },
  longyin: { name: '镇塔龙印', desc: '击败第五十层守关的凭证。巴掌大的一方玉印，印面盘着一条小龙，背刻「镇」字。', kind: '信物' },
  // 第二十四轮：通天塔第三十层 · 烬狱剑尊
  jinyu: { name: '烬狱剑印', desc: '击败第三十层守关的凭证。巴掌大的一方铁印，印面是一柄插在余烬里的直剑，边沿还留着焦痕。', kind: '信物' },
  ember: { name: '不灭余烬', desc: '剑尊碎成余烬后留下的一点火种，裹在灰里也不熄，握在手里微微发烫。可作炼器之材。', kind: '材料' },
};

// look: robe 外袍色, inner 中衣, trim 缘边, sash 腰带, hair 发色, hairStyle, hat, apron, short, tight, sword, scale
export const NPCS = [
  {
    id: 'lin', name: '林清竹', title: '接引弟子', x: 5.0, y: 2, z: 93.8, ry: -0.42, anim: 'ledger', prop: 'ledger', propHand: 1,
    look: { robe: 0xa2b6c4, inner: 0xeeebe4, trim: 0x3b5266, sash: 0x2f4256, hairStyle: 'ponytail', ribbon: 0xf0efe9, scale: 0.96 },
  },
  {
    id: 'zhou', name: '周明远', title: '执事堂执事', x: 19.7, y: 14, z: 33.6, ry: -1.25, anim: 'ledger', prop: 'ledger', propHand: 1,
    look: { robe: 0x3f526a, inner: 0xe2ded4, trim: 0x22303e, sash: 0x1e2833, hairStyle: 'cap', scale: 1.02 },
  },
  {
    id: 'he', name: '禾小满', title: '灵田弟子', x: -52.8, y: 57, z: -173.6, ry: 1.6, anim: 'hoe', prop: 'hoe',
    look: { robe: 0x8a8768, inner: 0xdcd4c0, trim: 0x5a5640, sash: 0x4a4636, hairStyle: 'bun', hat: true, short: true, tight: true, scale: 0.93 },
  },
  {
    id: 'su', name: '苏木', title: '丹殿丹师', x: 57.6, y: 18, z: -6.3, ry: 2.2, anim: 'pound', prop: 'pestle',
    look: { robe: 0x6e6c4e, inner: 0xe0dbcc, trim: 0x3e3c2a, sash: 0x3a3426, apron: 0x8c7a5c, hairStyle: 'bun', pin: 0x8a6c50, tight: true },
  },
  {
    id: 'gu', name: '顾长卿', title: '藏经阁守阁长老', x: -52.4, y: 30, z: -75.6, ry: 0.6, anim: 'behind',
    look: { robe: 0x30363a, inner: 0xe4e0d6, trim: 0xd8d2c4, sash: 0x1f2326, hair: 0xe2dfd8, hairStyle: 'elder', pin: 0x9fd8c4, scale: 1.0 },
  },
  {
    id: 'qin', name: '秦岳', title: '内门师兄', x: 2.5, y: 14, z: 14.2, ry: 2.7, anim: 'sword', prop: 'sword',
    look: { robe: 0xe4e2da, inner: 0xf0eee8, trim: 0x2f4e66, sash: 0x2f4e66, hairStyle: 'crown', crown: 0x9fd8c4, scale: 1.04 },
  },
  {
    id: 'shen', name: '沈墨', title: '画痴 · 外门弟子', x: 42.9, y: 28, z: -55.2, ry: 0.15, anim: 'paint', prop: 'brush',
    look: { robe: 0xb2c2ae, inner: 0xf0eee6, trim: 0x5d6e58, sash: 0x4a5a46, hairStyle: 'ponytail', ribbon: 0x8a5a4a, scale: 0.95 },
  },
  {
    id: 'shitou', name: '小石头', title: '杂役弟子', x: 2.6, y: 6, z: 64.1, ry: 1.4, anim: 'sweep', prop: 'broom',
    look: { robe: 0x8a8478, inner: 0xdcd6c8, trim: 0x5a5448, sash: 0x4a4438, hairStyle: 'twin', ribbon: 0x6a5a48, short: true, tight: true, scale: 0.84 },
  },
  {
    id: 'aning', name: '阿宁', title: '外门弟子', x: -4.6, y: 14, z: 21.6, ry: 0.35, anim: 'taiji',
    look: { robe: 0xa9bac6, inner: 0xeeebe4, trim: 0x3b5266, sash: 0x2f4256, hairStyle: 'bun', scale: 0.95 },
  },
  {
    id: 'luchuan', name: '陆川', title: '外门弟子', x: 5.2, y: 14, z: 22.6, ry: -0.3, anim: 'taiji',
    look: { robe: 0x9fb1bd, inner: 0xeeebe4, trim: 0x34495a, sash: 0x2c3c4a, hairStyle: 'bun', scale: 1.0 },
  },
  // 第十五轮：演武场台口的教习（交互即打开演武选择）
  {
    id: 'jiaoxi', name: '韩铮', title: '演武教习', x: 46.0, y: 34, z: -106.8, ry: 1.32, anim: 'behind', prop: 'sword',
    look: { robe: 0x5b2b25, inner: 0xe8e2d6, trim: 0x2a2220, sash: 0x1d1a18, hairStyle: 'crown', crown: 0x3a3a3a, scale: 1.06 },
  },
  {
    id: 'yu', name: '陈小鱼', title: '外门弟子', x: -53.6, y: 17, z: 31.6, ry: 3.0, anim: 'idle', prop: 'basket',
    look: { robe: 0xb7c3c9, inner: 0xf0ede6, trim: 0x52646e, sash: 0x3e4e58, hairStyle: 'twin', ribbon: 0x9fb1bd, scale: 0.9, tight: true },
  },
];

export const BOOKS = [
  {
    id: 'tuna', title: '青岚吐纳诀', tag: '心法 · 入门', author: '开山祖师 云岫子',
    body: [
      '凡入青岚者，先修吐纳。晨起面东，背倚山势，舌抵上颚，意守丹田。',
      '一吸如山岚入谷，绵绵不绝；一呼如松风出林，徐徐而散。吸为三，呼为七，十息为一周。',
      '初学者勿求气感，但求心静。心静则气自至，气至则神自明。此诀分三层：调息、凝气、归元。外门弟子修至凝气，即可入内门试炼。',
    ],
    verse: '山岚入我怀，松风过我身。一息一天地，不负此晨昏。',
  },
  {
    id: 'liuyun', title: '流云剑式', tag: '剑法 · 基础', author: '青岚剑堂',
    body: [
      '流云剑式凡七式：起云、拂柳、穿林、回峰、听泉、落霞、归岫。',
      '此剑不重力而重势，剑随身转，身随步移，步随心定。起式如云出岫，收式如鸟归林，中间五式连绵如水，不可断续。',
      '修习须于晨间演武台，先行三遍吐纳，再演剑式。秦岳师兄有言：「七式练到第三式，才知前两式是错的。」',
    ],
  },
  {
    id: 'baicao', title: '百草辨识录 · 卷一', tag: '丹道 · 草木', author: '丹房历代丹师',
    body: [
      '【清露草】叶细而长，叶尖常凝露珠，日出前采之最佳。性凉，清心安神，为养元丹主药。采时掐取上半截，留根再生。',
      '【凝霜花】生于后山阴处，花瓣如覆薄霜，入冬方开。可退热，入宁神散。',
      '【赤阳果】果色朱红，喜阳，灵田东畦有植。性温，能补气，须与清露草相佐，以免燥烈。',
      '凡采灵草，须得执事堂委托，登记在册，以免竭泽而渔。',
    ],
  },
  {
    id: 'tayun', title: '踏云步', tag: '身法 · 入门', author: '青岚宗',
    body: [
      '踏云步者，轻身之法也。足尖点地，气沉涌泉，身如浮云，借地势而行。',
      '外门弟子每日往返问心阶、天阶各一遍，即是踏云步的根基。阶不在多，在于每一步都踏得实。',
    ],
  },
  {
    id: 'zongzhi', title: '青岚宗志', tag: '史志', author: '藏经阁',
    body: [
      '青岚宗开山于三百年前。祖师云岫子游历至此，见山中岚气终日不散，遂结庐而居，引泉为池，开田种药。',
      '其后弟子渐多，依山逐级筑台：下为接引，中为演武，上为传功，云顶为问道。又于后山置听松亭，祖师晚年常独坐其中，与一白狐为伴。',
      '祖师羽化前，于竹林溪畔立碑一方，碑文至今无人尽解。阁中旧档言：「碑在竹深处，字在水声里。」',
    ],
  },
  { id: 'taiqing', title: '太清玄章', tag: '内门典籍', locked: true, body: ['此卷存于二层，须持内门令方可借阅。'] },
];

// （问道殿第十一轮起可以走进去，殿内的描写在 hallRoom.js；这里只留仍以图文面板呈现的屋子）
export const INTERIORS = {
  alchemy: {
    title: '丹房', sub: '炉火常年不熄',
    body: [
      '屋内比屋外暖得多。北墙是一整面药柜，百余个小抽屉上贴着手写的药名；墙角码着成摞的陶罐，封口处压着朱红的符纸。',
      '靠窗的长案上摊着苏木的丹方手记，墨迹未干，旁边一只铜秤、一把药碾。屋梁上吊着一串串晒干的草药，气味微苦而清。',
    ],
    items: ['百子药柜', '丹方手记', '铜秤与药碾', '封坛的丹药'],
  },
  dorm: {
    title: '弟子居所 · 竹院', sub: '外门弟子寝舍',
    body: [
      '一间屋住两人。靠墙两张木榻，被褥叠得方正；窗下一张小书案，摆着《青岚吐纳诀》的抄本和一盏油灯。',
      '门后挂着两套换洗的道袍，墙上贴着一张手写的作息：卯时吐纳，辰时演武，巳时听讲，午后各司其职。',
    ],
    items: ['木榻', '书案与抄本', '作息单'],
  },
  dining: {
    title: '膳堂', sub: '弟子一日三餐之所',
    body: [
      '堂内摆着六张长桌，桌面被擦得发亮。北墙一溜灶台，最大的那口铁锅里正熬着粟米粥，蒸汽顺着屋梁飘到窗外。',
      '墙上的木牌写着今日菜色：清炒灵蔬、腌笋、山菌汤。角落里堆着从灵田挑来的新菜，叶上还带着土。掌勺的老师傅说，饭要趁热吃，修行也要趁年轻。',
    ],
    items: ['长桌条凳', '灶台铁锅', '今日菜牌', '灵田新菜'],
  },
  library: {
    title: '藏经阁 · 一层', sub: '外门弟子可阅',
    body: ['书架高至梁下，以竹签标着部类。阁内极静，只听得见窗外松风。'],
  },
};
