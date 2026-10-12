// 区域灵气：区分普通灵气（spirit）与魔气（demonic），修炼规则据此扩展。
// 现行规则：灵气所在可以吐纳（聚灵阵处最浓）；魔气所在不能吐纳，界面上标出魔气及浓度；
// 幽渊秘境全境为魔气，浓度随封印加固而减弱；后山石洞与残碑一带有地底渗出的魔气（封印加固后变淡）。
import { ABYSS_GATE, ABYSS_CLUE } from '../world/layout.js';
import { ABYSS_REGIONS } from '../world/abyss.js';

export const QI_KINDS = {
  spirit: { name: '灵气', cultivate: true },
  demonic: { name: '魔气', cultivate: false, warn: '魔气侵扰，不宜吐纳' },
};

// 浓度分档（显示用）
export function qiGrade(level) { return level >= 1.8 ? '浓' : level >= 0.9 ? '' : level >= 0.45 ? '淡' : '微'; }

// 宗门地表
export function surfaceQi(x, z, { anchors = {}, sealed = false } = {}) {
  const G = ABYSS_GATE, Cl = ABYSS_CLUE;
  const leak = Math.max(0, 1 - Math.hypot(x - G.x, z - G.z) / 16, 1 - Math.hypot(x - Cl.x, z - Cl.z) / 7) * (sealed ? 0.4 : 1);
  if (leak > 0.3) return { kind: 'demonic', level: +(leak * 0.7).toFixed(2), source: '地底渗出的魔气' };
  const m = anchors.meditate, dm = m ? Math.hypot(x - m.x, z - m.z) : Infinity;
  if (dm < 6) return { kind: 'spirit', level: 2.2, source: '聚灵阵' };
  const lp = anchors.meditatePool, dp = lp ? Math.hypot(x - lp.x, z - lp.z) : Infinity;
  if (dp < 5) return { kind: 'spirit', level: 2.0, source: '灵池' };
  if (dp < 18) return { kind: 'spirit', level: 1.5, source: '灵池' };
  return { kind: 'spirit', level: z < -164 ? 1.4 : 1, source: '' };
}

// 幽渊秘境（坐标与秘境场景一致）
export function abyssQi(x, z, sealed = false) {
  const r = ABYSS_REGIONS.find((g) => g.test(x, z));
  return { kind: r.qi, level: sealed ? r.sealedLevel : r.level, source: r.name, id: r.id };
}
