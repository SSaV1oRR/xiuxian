// 第二十九轮录像：通用的终结（不论哪种招式的致命一击，群战的最后一个、首领的最后一条命都放这段演出；不需要墨势）——
//   arena：演武场正式切磋，普攻打死对手 → 演出 → 收刀时击倒 → 交还之后判胜；
//   group：群战，三个魔修各剩一点气血，前两个照常倒下，最后一个放演出；
//   b30kill：第三十层二阶段（最后一条命），普攻打空 → 演出 → 整场胜利 → 胜利过场 → 结算。
// 用法（预览）：const F = await import('/tools/r29_film.js?v=' + Date.now()); await F.setup();
//   setTimeout(async () => { const r = await F.scnArena(); const s = await F.synthStem('arena'); const n = await F.flush(); window.__film = { r, s, n }; }, 0);
// 然后：python -I tools/r29_collect.py docs/screenshots <录像目录> arena；python -I tools/r29_make_media.py <blender.exe> <录像目录> <MP4 目录（ASCII）> docs/screenshots arena
import * as F27 from './r27_film.js';

export const { setup, flush, recSub } = F27;
export const scnArena = (o = {}) => F27.scnArena({ ...o, pre: 'r29' });
export const scnGroup = (o = {}) => F27.scnGroup({ ...o, pre: 'r29' });
export const scnBoss30Kill = (o = {}) => F27.scnBoss30Kill({ ...o, pre: 'r29' });
export const synthStem = (name) => F27.synthStem(name, 'r29stem_');
