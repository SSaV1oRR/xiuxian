// 第二十八轮录像：「墨里终焉」龙凤砸入的墨震（照雷龙撞地的层次做成水墨）——
//   normal：普通敌人的完整 16 秒演出（同第二十七轮的流程与机位，换上新的墨震；文件名前缀 r28_）；
//   slow：龙凤砸入的一段 0.5 倍慢放（演出 10.15–11.9 秒，只有音效）；
//   b30p1：第三十层一阶段（大型目标：墨震按体型放大）。
// 用法（预览）：const F = await import('/tools/r28_film.js?v=' + Date.now()); await F.setup();
//   setTimeout(async () => { const r = await F.scnNormal(); const s = await F.synthStem('normal'); const n = await F.flush(); window.__film = { r, s, n }; }, 0);
// 然后：python -I tools/r28_collect.py docs/screenshots <录像目录> normal；python -I tools/r28_make_media.py <blender.exe> <录像目录> <MP4 目录（ASCII）> docs/screenshots normal
import * as F27 from './r27_film.js';

export const { setup, flush, recSub } = F27;
export const scnNormal = (o = {}) => F27.scnNormal({ ...o, pre: 'r28' });
export const scnBoss30P1 = (o = {}) => F27.scnBoss30P1({ ...o, pre: 'r28' });
export const scnSlow = (o = {}) => F27.scnSlow({ ...o, pre: 'r28' });
export const synthStem = (name) => F27.synthStem(name, 'r28stem_');
