// 第二十二轮自检工具：九霄凤焰的舞刀（cast_phoenix）——按候选关键姿势逐帧求解，看前臂扭转、腕屈、剑身离身体的距离，
// 不改文件、不重载页面就能比较几种编排；装进人物的动作表之后可用 r17_combat_bot.js 的 views / snapClip 拍姿势。
// 用法：const D = await import('/tools/r22_dance.js?v=' + Date.now());
//   await D.trial(keys)              逐帧：[t, 扭转°, 腕屈°, 腕截住, 剑离身体（米）, 剑偏°, 够不着（米）]，以及整段的最大值
//   await D.install('cast_phoenix_try', keys)   装进人物的动作表（之后 B.views('cast_phoenix_try', [...])）
const Q = () => window.__qinglan;

async function pose() {
  const v = Date.now();
  const [{ CultivatorPose }, C] = await Promise.all([import('/src/actors/cultivatorPose.js?v=' + v), import('/src/actors/cultivatorClips.js?v=' + v)]);
  return { CultivatorPose, C };
}

export async function defs() { const { C } = await pose(); return C.CLIP_DEFS; }

export async function trial(keys, { fps = 60, every = 1 } = {}) {
  const { CultivatorPose } = await pose();
  const S = new CultivatorPose(Q().player.char);
  const full = S.prepare(keys), dur = full[full.length - 1].t, n = Math.round(dur * fps);
  S.armPrev = {};
  const rows = [], max = { twist: 0, wrist: 0, clamp: 0, clear: 9, off: 0 };
  for (let i = 0; i <= n; i++) {
    const t = Math.min(dur, i / fps);
    S.stats = { t, reach: 0, wrist: 0, twist: 0, bladeOff: 0, toeY: 9, wristClamp: new Set(), clear: 9, clearAt: -1, blade: [] };
    const r = S.solve(S.specAt(full, t));
    const clr = r.swordQ ? S.clearance(r.W, r.grip, r.swordQ) : null;
    const row = [+t.toFixed(3), Math.round(S.stats.twist), Math.round(S.stats.wrist), S.stats.wristClamp.size, clr == null ? null : +clr.toFixed(3), Math.round(S.stats.bladeOff), +S.stats.reach.toFixed(3)];
    if (i % every === 0) rows.push(row);
    if (row[1] > max.twist) { max.twist = row[1]; max.twistAt = row[0]; }
    if (row[2] > max.wrist) { max.wrist = row[2]; max.wristAt = row[0]; }
    max.clamp += row[3];
    if (clr != null && clr < max.clear) { max.clear = row[4]; max.clearAt = row[0]; }
    if (row[5] > max.off) { max.off = row[5]; max.offAt = row[0]; }
    if (row[6] > (max.reach || 0)) { max.reach = row[6]; max.reachAt = row[0]; }
  }
  S.stats = null;
  return { max, rows };
}

export async function install(name, keys, { fps = 60, marks = {} } = {}) {
  const { CultivatorPose } = await pose();
  const { Cultivator } = await import('/src/actors/cultivator.js');
  const S = new CultivatorPose(Q().player.char);
  const c = S.clip(name, keys, { fps, marks });
  Cultivator.addClips([c], Q().player.char);
  return c.userData.check;
}
