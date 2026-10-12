// 第十六轮：镇塔龙君的编排动作——每一段都是按关键姿势解出的真实骨骼动作（躯干、颈、头、双臂 IK、双腿 IK、手爪、尾、翼），
// 不是整体旋转模型。时间（秒）是一阶段的原速；二阶段由游戏统一放快（动作、判定时刻、特效同步缩放）。
// marks：招式要对齐的时刻——wind 前摇结束（出手前的最后一刻）、hit / hit2 / hit3 命中时刻（判定以它为中心取有效窗口）、rec 收势开始。
// 坐标（米，模型空间，未乘游戏里的 2.6 倍）：龙面朝 +Z，+X 为龙的左手边；底姿势见 boss50Pose.js。
//   肩关节 左 (0.20, 1.12, 0.12) 右 (-0.24, 1.11, 0.15)；手臂伸直约 0.43；骨盆高 0.75；头 1.33；左脚 (0.12, 0.11, 0.17)、右脚 (-0.15, 0.16, -0.21)。

const L = 'l', R = 'r';
// 双爪在身前的戒备位置
const GUARD = { handL: [0.30, 0.92, 0.36], handR: [-0.32, 0.92, 0.40], elbowL: [1, -0.3, -0.4], elbowR: [-1, -0.3, -0.4], clawL: 'half', clawR: 'half', wing: 'half' };
// 底姿势（不动手臂）
const STANCE = { clawL: 'relax', clawR: 'relax', wing: 'half' };
const FOOT_L = [0.117, 0.107, 0.172], FOOT_R = [-0.154, 0.157, -0.21];
const add = (a, b) => a.map((v, i) => v + b[i]);

export function buildBossClips(ps) {
  const C = {};
  const clip = (name, keys, opts = {}) => { C[name] = ps.clip(name, keys, opts); return C[name]; };

  // ---------------- 待机：呼吸（胸口起伏、双爪微动），双翼半张；尾的摆动由运行时的尾部动作层给出 ----------------
  clip('idle', [
    { t: 0, ...GUARD, spine3: { b: 0 }, neck: { b: 0 }, hips: [0, 0, 0] },
    { t: 1.5, ...GUARD, handL: add(GUARD.handL, [0.01, 0.025, 0]), handR: add(GUARD.handR, [-0.01, 0.025, 0]), spine3: { b: -3 }, neck: { b: 2 }, hips: [0, 0.012, 0], ease: 'inout' },
    { t: 3.0, ...GUARD, spine3: { b: 0 }, neck: { b: 0 }, hips: [0, 0, 0], ease: 'inout' },
  ], { loop: true });

  // ---------------- 原地转身（踏两步），左 / 右：60°（turnL / turnR）；第十八轮加 30°（turnL30…）与 90°（turnL90…）两档 ----------------
  // 游戏按要转的角度挑最近的一档，根运动的转角倍数只在 0.75–1.3 之间，踩着的脚不会明显打滑（原先只有 60° 一档，小角度时倍数低到 0.4）
  const rot = (p, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
  for (const [D, dur] of [[30, 0.7], [60, 0.9], [90, 1.1]]) for (const [side, sgn] of [['L', 1], ['R', -1]]) {
    const lead = sgn > 0 ? 'footL' : 'footR', trail = sgn > 0 ? 'footR' : 'footL';
    const fl = sgn > 0 ? FOOT_L : FOOT_R, ft = sgn > 0 ? FOOT_R : FOOT_L;
    const k = dur / 0.9, y = sgn * D / 60;
    clip(D === 60 ? `turn${side}` : `turn${side}${D}`, [
      { t: 0, ...GUARD, yaw: 0, [lead]: fl, [trail]: ft },
      { t: 0.25 * k, ...GUARD, yaw: 25 * y, spine2: { t: 8 * y }, neck: { t: 6 * y }, [lead]: add(rot(fl, sgn * D / 2), [0, 0.12, 0]), [trail]: ft, hips: [0, -0.02, 0], ease: 'inout' },
      { t: 0.45 * k, ...GUARD, yaw: 40 * y, [lead]: rot(fl, sgn * D), [trail]: ft, hips: [0, -0.035, 0], ease: 'out' },
      { t: 0.7 * k, ...GUARD, yaw: 55 * y, spine2: { t: 3 * y }, neck: { t: 2 * y }, [lead]: rot(fl, sgn * D), [trail]: add(rot(ft, sgn * D * 0.75), [0, 0.12, 0]), hips: [0, -0.01, 0], ease: 'inout' },
      { t: dur, ...GUARD, yaw: 60 * y, spine2: { t: 0 }, neck: { t: 0 }, [lead]: rot(fl, sgn * D), [trail]: rot(ft, sgn * D), hips: [0, 0, 0], ease: 'out' },
    ], { marks: { end: dur } });
  }

  // ---------------- 行走（循环 1.2 秒）：沉重的踏步，双爪戒备在身前，尾随步子摆动 ----------------
  // 脚以身体为参照：着地的脚在半个周期（0.6 秒）里匀速后移 0.44 米（模型），身体前进 0.73 米 / 秒（模型）× 2.8 ≈ 2.05 米 / 秒；
  // 游戏按这个速度推着龙走（marks.speed），二阶段整体放快
  {
    const WL = [0.14, 0.135, 0.0], WR = [-0.15, 0.135, 0.0], ST = 0.22, LF = 0.13;
    const W = (t, fl, fr, hy, tw, wave) => ({ t, ...GUARD, footFrame: 'model', footL: fl, footR: fr, hips: [0, hy, 0], spine2: { t: tw }, tail: { wave, waveAmp: 6 }, ease: 'linear' });
    clip('walk', [
      W(0, add(WL, [0, 0, ST]), add(WR, [0, 0, -ST]), -0.035, -5, 0),
      W(0.3, WL, add(WR, [0, LF, 0]), 0, 0, 0.25),
      W(0.6, add(WL, [0, 0, -ST]), add(WR, [0, 0, ST]), -0.035, 5, 0.5),
      W(0.9, add(WL, [0, LF, 0]), WR, 0, 0, 0.75),
      W(1.2, add(WL, [0, 0, ST]), add(WR, [0, 0, -ST]), -0.035, -5, 1),
    ], { loop: true, marks: { speed: (2 * ST) / 0.6 } });
  }

  // ---------------- 01 裂空龙爪：右爪后撤蓄力（0.45 秒）→ 横扫身前 → 收势（0.55 秒）----------------
  clip('claw1', [
    { t: 0, ...GUARD },
    { t: 0.40, ...GUARD, spine1: { t: -12 }, spine2: { t: -28, b: 6 }, neck: { t: 18 }, head: { t: 10 }, hips: [0, -0.06, -0.02], handR: [-0.62, 1.08, -0.12], elbowR: [-1, 0.3, -0.5], clawR: 'spread',
      handL: [0.28, 0.98, 0.40], tail: { yaw: -22 }, ease: 'out' },
    { t: 0.45, spine2: { t: -31, b: 7 }, handR: [-0.64, 1.10, -0.14], ease: 'out' },
    { t: 0.52, spine1: { t: 2, b: 14 }, spine2: { t: 6, b: 22 }, neck: { t: 4, b: -8 }, head: { t: 0, b: -6 }, hips: [0, -0.14, 0.04], handR: [-0.34, 0.58, 0.70], elbowR: [-1, 0.2, -0.3], root: [0, 0.22], footL: add(FOOT_L, [0, 0.0, 0.30]), ease: 'in' },
    { t: 0.60, spine1: { t: 18, b: 16 }, spine2: { t: 38, b: 24 }, neck: { t: -14, b: -8 }, handR: [0.56, 0.52, 0.32], elbowR: [-0.4, 0.6, -0.2], hips: [0, -0.16, 0.05], root: [0, 0.34], tail: { yaw: 30 }, ease: 'snap' },
    { t: 0.85, spine1: { t: 8, b: 8 }, spine2: { t: 20, b: 12 }, neck: { t: -6, b: -4 }, head: { b: -2 }, handR: [0.24, 0.62, 0.40], hips: [0, -0.08, 0.02], footR: add(FOOT_R, [0, 0.10, 0.17]), tail: { yaw: 10 }, ease: 'out' },
    { t: 1.15, ...GUARD, spine1: { t: 0, b: 0 }, spine2: { t: 0, b: 0 }, neck: { t: 0, b: 0 }, head: { t: 0, b: 0 }, hips: [0, 0, 0], tail: { yaw: 0 }, root: [0, 0.34], footL: add(FOOT_L, [0, 0, 0.34]), footR: add(FOOT_R, [0, 0, 0.34]), ease: 'inout' },
  ], { marks: { wind: 0.45, hit: 0.56, rec: 0.60 } });

  // ---------------- 02 双爪追猎：左爪横抓 → 0.35 秒后右爪斜抓（第二击前踏进、有限追踪）----------------
  const claw2 = [
    { t: 0, ...GUARD },
    { t: 0.55, ...GUARD, spine1: { t: 12 }, spine2: { t: 28, b: 6 }, neck: { t: -16 }, hips: [0, -0.07, 0], handL: [0.62, 1.10, -0.10], elbowL: [1, 0.3, -0.5], clawL: 'spread', handR: [-0.40, 0.88, 0.56], tail: { yaw: 20 }, ease: 'out' },
    { t: 0.60, spine2: { t: 31 }, handL: [0.64, 1.12, -0.12], ease: 'out' },
    { t: 0.66, spine1: { t: -2, b: 14 }, spine2: { t: -6, b: 22 }, neck: { t: 0, b: -8 }, hips: [0, -0.13, 0.03], handL: [0.34, 0.60, 0.68], elbowL: [1, 0.2, -0.3], root: [0, 0.14], ease: 'in' },
    { t: 0.74, spine1: { t: -14, b: 14 }, spine2: { t: -30, b: 22 }, neck: { t: 12, b: -8 }, handL: [-0.30, 0.52, 0.56], elbowL: [0.6, 0.6, -0.2], handR: [-0.50, 1.32, 0.04], elbowR: [-1, 0.4, -0.4], clawR: 'spread', tail: { yaw: -24 }, root: [0, 0.20], ease: 'snap' },
    { t: 0.92, spine1: { b: 6 }, spine2: { t: -34, b: 8 }, neck: { b: 0 }, handR: [-0.44, 1.40, 0.14], handL: [-0.10, 0.80, 0.30], hips: [0, -0.06, 0], root: [0, 0.24], footR: add(FOOT_R, [0.02, 0, 0.24]), ease: 'out' },
    { t: 1.00, spine1: { t: 0, b: 10 }, spine2: { t: 0, b: 18 }, neck: { t: 0, b: 0 }, handR: [-0.10, 0.95, 0.68], elbowR: [-1, 0.2, -0.2], root: [0, 0.34], ease: 'in' },
    { t: 1.08, spine1: { t: 14, b: 14 }, spine2: { t: 26, b: 26 }, neck: { t: -10, b: -8 }, handR: [0.30, 0.40, 0.54], elbowR: [-0.5, 0.7, 0], hips: [0, -0.15, 0.05], tail: { yaw: 24 }, root: [0, 0.42], ease: 'snap' },
    { t: 1.13, ease: 'linear' },                                                       // 第十八轮：第二爪到头停一下
  ];
  clip('claw2', [...claw2,
    { t: 1.40, spine1: { t: 8, b: 6 }, spine2: { t: 14, b: 12 }, neck: { b: -4 }, handR: [0.20, 0.62, 0.38], hips: [0, -0.09, 0.02], tail: { yaw: 8 }, ease: 'out' },
    { t: 1.90, ...GUARD, spine1: { t: 0, b: 0 }, spine2: { t: 0, b: 0 }, neck: { t: 0, b: 0 }, hips: [0, 0, 0], tail: { yaw: 0 }, root: [0, 0.42], footR: add(FOOT_R, [0.02, 0, 0.42]), footL: add(FOOT_L, [0, 0, 0.42]), ease: 'inout' },
  ], { marks: { wind: 0.60, hit: 0.70, hit2: 1.04, rec: 1.08 } });
  // 二阶段：第二击后再踏进一步，左爪上撩追击
  clip('claw2x', [...claw2,
    { t: 1.20, spine1: { t: 10, b: 16 }, spine2: { t: 30, b: 22 }, hips: [0, -0.16, 0.04], handL: [0.42, 0.28, 0.50], elbowL: [1, -0.2, -0.4], clawL: 'spread', handR: [-0.30, 0.66, 0.62], root: [0, 0.52], footL: add(FOOT_L, [0, 0.10, 0.36]), ease: 'out' },
    { t: 1.30, spine1: { t: -10, b: 4 }, spine2: { t: -20, b: 0 }, neck: { t: 10, b: -6 }, handL: [-0.06, 0.80, 0.66], elbowL: [1, 0, -0.2], root: [0, 0.80], hips: [0, -0.04, 0.06], footL: add(FOOT_L, [0, 0, 0.66]), tail: { yaw: -26 }, ease: 'in' },
    { t: 1.36, spine2: { t: -26, b: -10 }, handL: [-0.22, 1.30, 0.46], root: [0, 0.84], ease: 'snap' },
    { t: 1.70, spine1: { t: -4, b: 0 }, spine2: { t: -8, b: 0 }, handL: [0.10, 1.05, 0.36], hips: [0, -0.04, 0], ease: 'out' },
    { t: 2.20, ...GUARD, spine1: { t: 0, b: 0 }, spine2: { t: 0, b: 0 }, neck: { t: 0, b: 0 }, hips: [0, 0, 0], tail: { yaw: 0 }, root: [0, 0.84], footR: add(FOOT_R, [0.02, 0, 0.84]), footL: add(FOOT_L, [0, 0, 0.84]), ease: 'inout' },
  ], { marks: { wind: 0.60, hit: 0.70, hit2: 1.04, hit3: 1.29, rec: 1.36 } });

  // ---------------- 03 迟发碎岳：双臂高举、后仰蓄力，停顿，再双爪重砸身前地面 ----------------
  clip('slam', [
    { t: 0, ...GUARD },
    { t: 0.55, ...GUARD, handL: [0.30, 1.36, 0.16], handR: [-0.30, 1.36, 0.18], viaL: [0.34, 1.16, 0.40], viaR: [-0.34, 1.16, 0.42], elbowL: [1, 0.2, -0.4], elbowR: [-1, 0.2, -0.4], spine2: { b: -10 }, neck: { b: -8 }, head: { b: -8 }, hips: [0, -0.04, 0], wing: { half: 0.6, spread: 0.4 }, tail: { lift: 12 }, clawL: 'curl', clawR: 'curl', ease: 'out' },
    { t: 1.05, handL: [0.16, 1.66, -0.06], handR: [-0.18, 1.66, -0.04], elbowL: [1, 0.6, 0], elbowR: [-1, 0.6, 0], spine1: { b: -8 }, spine2: { b: -16 }, neck: { b: -10 }, head: { b: -10 }, hips: [0, 0.03, -0.03], wing: { half: 0.3, spread: 0.7 }, tail: { lift: 22 }, ease: 'out' },
    { t: 1.30, handL: [0.15, 1.69, -0.09], handR: [-0.17, 1.69, -0.07], spine2: { b: -18 }, hips: [0, 0.035, -0.04], ease: 'inout' },
    { t: 1.42, handL: [0.20, 0.20, 0.80], handR: [-0.20, 0.20, 0.82], viaL: [0.20, 1.30, 0.62], viaR: [-0.20, 1.30, 0.64], elbowL: [1, 0.4, 0.2], elbowR: [-1, 0.4, 0.2], spine1: { b: 22 }, spine2: { b: 30 }, neck: { b: 8 }, head: { b: 4 }, hips: [0, -0.28, 0.06], root: [0, 0.08], wing: { half: 0.8, fold: 0.2 }, tail: { lift: 4 }, clawL: 'spread', clawR: 'spread', ease: 'in' },
    { t: 1.52, handL: [0.21, 0.15, 0.82], handR: [-0.21, 0.15, 0.84], hips: [0, -0.30, 0.07], ease: 'snap' },
    { t: 1.95, spine1: { b: 18 }, spine2: { b: 22 }, neck: { b: -4 }, head: { b: -6 }, handL: [0.24, 0.24, 0.72], handR: [-0.24, 0.24, 0.74], hips: [0, -0.24, 0.04], ease: 'out' },
    { t: 2.75, ...GUARD, spine1: { b: 0 }, spine2: { b: 0 }, neck: { b: 0 }, head: { b: 0 }, hips: [0, 0, 0], tail: { lift: 0 }, root: [0, 0.08], ease: 'inout' },
  ], { marks: { wind: 1.30, hit: 1.45, rec: 1.52 } });

  // ---------------- 04 龙尾回扫：上身向左扭、尾向右蓄，转身一周以尾横扫身后与两侧 ----------------
  clip('tailsweep', [
    { t: 0, ...GUARD, yaw: 0, footFrame: 'model' },
    { t: 0.80, ...GUARD, yaw: 35, spine1: { t: 14 }, spine2: { t: 22 }, neck: { t: -30 }, head: { t: -12 }, hips: [0, -0.09, 0], handL: [0.42, 0.90, -0.05], handR: [-0.10, 0.95, 0.38], tail: { yaw: -55, lift: 10 }, wing: 'fold', ease: 'out' },
    // 第十八轮：转身一周改成「起转 → 匀速 → 收住」，各段接缝处转速相同（约 760°/秒）；原先 1.08 秒处由每秒近 1900° 骤降到 640°，看着一顿
    { t: 0.85, yaw: 37, tail: { yaw: -58, lift: 10 }, ease: 'out' },
    // 转身时双脚离地（跳着转），不再整个身子带着脚在地上打转滑动；1.62 收住时落地
    { t: 1.08, yaw: -21, spine1: { t: -10 }, spine2: { t: -16, s: -8 }, neck: { t: 20 }, hips: [0, -0.04, 0], tail: { yaw: 70, lift: 14 }, handL: [0.45, 1.05, 0.10], handR: [-0.52, 0.90, 0.30], footL: add(FOOT_L, [0, 0.10, 0]), footR: add(FOOT_R, [0, 0.10, 0]), ease: 'in' },
    { t: 1.30, yaw: -188, spine2: { t: -10, s: -6 }, tail: { yaw: 62, lift: 10 }, ease: 'linear' },
    { t: 1.48, yaw: -325, spine1: { t: 0 }, spine2: { t: 0, s: 0 }, neck: { t: 6 }, tail: { yaw: 20 }, hips: [0, -0.07, 0], footL: add(FOOT_L, [0, 0.05, 0]), footR: add(FOOT_R, [0, 0.05, 0]), ease: 'linear' },
    { t: 1.62, yaw: -360, tail: { yaw: -26, lift: 2 }, footL: FOOT_L, footR: FOOT_R, ease: 'out' },
    { t: 2.30, ...GUARD, yaw: -360, spine1: { t: 0 }, spine2: { t: 0 }, neck: { t: 0 }, head: { t: 0 }, hips: [0, 0, 0], tail: { yaw: 0, lift: 0 }, ease: 'inout' },
  ], { marks: { wind: 0.85, hit: 1.10, hitEnd: 1.42, rec: 1.48 } });

  // ---------------- 05 三段猎杀：快抓 → 交叉抓 → 高举停顿约 0.65 秒的延迟重击 ----------------
  clip('combo3', [
    { t: 0, ...GUARD },
    { t: 0.62, ...GUARD, spine2: { t: -26 }, neck: { t: 14 }, hips: [0, -0.06, 0], handR: [-0.60, 1.06, -0.08], clawR: 'spread', tail: { yaw: -20 }, ease: 'out' },
    { t: 0.70, spine2: { t: -29 }, handR: [-0.62, 1.08, -0.10], ease: 'out' },
    { t: 0.78, spine1: { t: 12, b: 14 }, spine2: { t: 30, b: 22 }, neck: { t: -10, b: -8 }, hips: [0, -0.14, 0.03], handR: [0.50, 0.48, 0.44], viaR: [-0.12, 0.80, 0.62], root: [0, 0.14], tail: { yaw: 22 }, ease: 'in' },
    { t: 0.82, ease: 'linear' },                                                       // 第十八轮：出爪到头停一下（平滑后爪仍扫得到原来的范围）
    { t: 0.96, spine1: { b: 8 }, spine2: { t: 30, b: 12 }, neck: { b: -4 }, hips: [0, -0.08, 0.02], handR: [0.20, 0.66, 0.40], handL: [0.60, 1.20, -0.02], clawL: 'spread', ease: 'out' },
    { t: 1.12, spine1: { t: -12, b: 14 }, spine2: { t: -26, b: 22 }, neck: { t: 10, b: -8 }, hips: [0, -0.14, 0.04], handL: [-0.44, 0.52, 0.52], viaL: [0.12, 0.80, 0.62], handR: [-0.20, 0.80, 0.30], root: [0, 0.28], footL: add(FOOT_L, [0, 0, 0.28]), tail: { yaw: -20 }, ease: 'in' },
    { t: 1.17, ease: 'linear' },
    { t: 1.38, spine1: { t: 0, b: -6 }, spine2: { t: 0, b: -12 }, neck: { t: 0, b: -8 }, head: { b: -10 }, handL: [0.22, 1.42, 0.10], handR: [-0.22, 1.42, 0.12], viaL: [0.24, 1.15, 0.55], viaR: [-0.26, 1.15, 0.57], clawL: 'curl', clawR: 'curl', wing: { half: 0.4, spread: 0.6 }, tail: { yaw: 0, lift: 18 }, hips: [0, 0.0, 0], ease: 'out' },
    { t: 1.62, handL: [0.15, 1.70, -0.06], handR: [-0.16, 1.70, -0.04], elbowL: [1, 0.6, 0], elbowR: [-1, 0.6, 0], spine2: { b: -18 }, hips: [0, 0.03, -0.02], ease: 'out' },
    { t: 2.24, handL: [0.15, 1.72, -0.08], handR: [-0.16, 1.72, -0.06], spine2: { b: -19 }, hips: [0, 0.035, -0.03], ease: 'linear' },
    { t: 2.34, handL: [0.20, 0.20, 0.86], handR: [-0.20, 0.20, 0.88], viaL: [0.20, 1.30, 0.62], viaR: [-0.20, 1.30, 0.64], elbowL: [1, 0.4, 0.2], elbowR: [-1, 0.4, 0.2], spine1: { b: 24 }, spine2: { b: 32 }, neck: { b: 8 }, head: { b: 2 }, hips: [0, -0.30, 0.08], root: [0, 0.46], footR: add(FOOT_R, [0, 0, 0.46]), wing: { half: 0.8, fold: 0.2 }, tail: { lift: 4 }, clawL: 'spread', clawR: 'spread', ease: 'in' },
    { t: 2.44, hips: [0, -0.32, 0.09], ease: 'snap' },
    { t: 2.90, spine1: { b: 16 }, spine2: { b: 20 }, neck: { b: -4 }, handL: [0.24, 0.26, 0.74], handR: [-0.24, 0.26, 0.76], hips: [0, -0.22, 0.05], ease: 'out' },
    { t: 3.50, ...GUARD, spine1: { t: 0, b: 0 }, spine2: { t: 0, b: 0 }, neck: { t: 0, b: 0 }, head: { b: 0 }, hips: [0, 0, 0], tail: { yaw: 0, lift: 0 }, root: [0, 0.46], footL: add(FOOT_L, [0, 0, 0.46]), ease: 'inout' },
  ], { marks: { wind: 0.70, hit: 0.78, hit2: 1.11, hold: 1.62, hit3: 2.30, rec: 2.44 } });

  // ---------------- 06 破阵冲撞：低身蓄力（1.0 秒）→ 冲刺（循环，由游戏推着走）→ 刹停收势（1.1 秒）----------------
  const CHARGE = { hips: [0, -0.22, -0.06], spine1: { b: 26 }, spine2: { b: 24 }, neck: { b: -28 }, head: { b: -16 }, handL: [0.40, 0.70, -0.30], handR: [-0.42, 0.70, -0.28], elbowL: [0.6, 0.5, -0.6], elbowR: [-0.6, 0.5, -0.6], wing: 'fold', clawL: 'curl', clawR: 'curl', tail: { lift: 10 } };
  clip('charge_wind', [
    { t: 0, ...GUARD },
    { t: 0.70, ...CHARGE, footR: add(FOOT_R, [0, 0, -0.12]), viaL: [0.50, 0.74, 0.14], viaR: [-0.52, 0.74, 0.16], ease: 'out' },
    { t: 1.00, ...CHARGE, hips: [0, -0.25, -0.08], spine1: { b: 28 }, ease: 'inout' },
  ], { marks: { wind: 1.0 } });
  // 第十八轮：重写成真正的跑步周期——着地的半个周期脚贴地匀速后移（0.72 米 / 0.22 秒），另半个周期抬起前摆（最高 0.32 米）；
  // 原先两只脚都沿同一条斜线来回（后移时下降、前摆时上升），没有着地段也没有抬脚段，看着像在地上蹭
  const RL = (z, y) => [0.13, y, z], RR = (z, y) => [-0.14, y, z], G = 0.135, UP = 0.32, ST = 0.36;
  clip('charge_run', [
    { t: 0, ...CHARGE, plant: true, footFrame: 'model', footL: RL(ST, G), footR: RR(-ST, G), hips: [0, -0.16, 0], tail: { lift: 14, yaw: 6 } },
    { t: 0.11, footL: RL(0, G), footR: RR(0, UP), hips: [0, -0.20, 0], ease: 'linear' },
    { t: 0.22, footL: RL(-ST, G), footR: RR(ST, G), hips: [0, -0.16, 0], tail: { lift: 12, yaw: -6 }, ease: 'linear' },
    { t: 0.33, footL: RL(0, UP), footR: RR(0, G), hips: [0, -0.20, 0], ease: 'linear' },
    { t: 0.44, footL: RL(ST, G), footR: RR(-ST, G), hips: [0, -0.16, 0], tail: { lift: 14, yaw: 6 }, ease: 'linear' },
  ], { loop: true, marks: { speed: (2 * ST) / 0.22 } });      // 着地的脚每秒后移 3.27 米（模型）——游戏按冲刺速度调放速，脚不打滑
  clip('charge_stop', [
    { t: 0, ...CHARGE, footFrame: 'model', footL: [0.13, 0.13, 0.42], footR: [-0.14, 0.135, -0.20], hips: [0, -0.18, 0] },
    { t: 0.25, ...CHARGE, footFrame: 'model', footL: [0.14, 0.125, 0.48], footR: [-0.16, 0.135, -0.10], hips: [0, -0.26, -0.10], spine1: { b: 6 }, spine2: { b: 0 }, neck: { b: -10 }, handL: [0.42, 0.90, 0.20], handR: [-0.44, 0.90, 0.22], elbowL: [1, -0.3, -0.4], elbowR: [-1, -0.3, -0.4], ease: 'smooth' },
    { t: 1.10, ...GUARD, footFrame: 'model', footL: FOOT_L, footR: FOOT_R, hips: [0, 0, 0], spine1: { b: 0 }, spine2: { b: 0 }, neck: { b: 0 }, head: { b: 0 }, tail: { lift: 0 }, ease: 'inout' },
  ], { marks: { rec: 0 } });

  // ---------------- 07 跃空镇压：深蹲展翼（1.2 秒）→ 腾空（游戏给出抛物线）→ 落地双爪重砸（1.4 秒）----------------
  clip('jump_wind', [
    { t: 0, ...GUARD },
    { t: 0.85, ...GUARD, hips: [0, -0.30, -0.04], spine1: { b: 20 }, spine2: { b: 18 }, neck: { b: -18 }, head: { b: -12 }, handL: [0.40, 0.55, -0.10], handR: [-0.42, 0.55, -0.08], viaL: [0.48, 0.70, 0.18], viaR: [-0.50, 0.70, 0.20], clawL: 'spread', clawR: 'spread', wing: 'spread', tail: { lift: 4 }, ease: 'out' },
    { t: 1.20, hips: [0, -0.33, -0.05], wing: { spread: 0.6, up: 0.4 }, ease: 'inout' },
  ], { marks: { wind: 1.2 } });
  clip('jump_air', [
    { t: 0, ...GUARD, plant: true, footFrame: 'model', footL: [0.14, 0.32, 0.22], footR: [-0.15, 0.36, 0.0], hips: [0, 0.04, 0], spine1: { b: -10 }, spine2: { b: -14 }, neck: { b: -6 }, handL: [0.20, 1.62, 0.02], handR: [-0.20, 1.62, 0.04], elbowL: [1, 0.6, 0], elbowR: [-1, 0.6, 0], clawL: 'curl', clawR: 'curl', wing: { up: 1 }, tail: { lift: -18 } },
    { t: 0.30, footFrame: 'model', wing: { spread: 1 }, hips: [0, 0.03, 0], ease: 'inout' },
    { t: 0.60, footFrame: 'model', wing: { up: 1 }, hips: [0, 0.04, 0], ease: 'inout' },
  ], { loop: true });
  // 第十八轮：落地一段由游戏在触地前 0.14 秒（marks.lead）开始放——双爪在最后的下落里砸下去、正好在触地时着地；
  // 原先触地才开始放，0.1 秒里双爪从头顶砸到地面（每秒近百米），一下就「闪」到地上
  clip('jump_land', [
    { t: 0, ...GUARD, plant: true, footFrame: 'model', footL: [0.14, 0.30, 0.22], footR: [-0.15, 0.34, 0.0], hips: [0, 0.0, 0], spine1: { b: 8 }, spine2: { b: 10 }, handL: [0.18, 1.30, 0.40], handR: [-0.18, 1.30, 0.42], clawL: 'curl', clawR: 'curl', wing: 'spread' },
    { t: 0.14, footFrame: 'model', footL: [0.14, 0.115, 0.22], footR: [-0.16, 0.14, -0.08], hips: [0, -0.34, 0.06], spine1: { b: 26 }, spine2: { b: 32 }, neck: { b: 6 }, handL: [0.22, 0.16, 0.80], handR: [-0.22, 0.16, 0.82], elbowL: [1, 0.4, 0.2], elbowR: [-1, 0.4, 0.2], clawL: 'spread', clawR: 'spread', wing: { half: 0.6, fold: 0.4 }, tail: { lift: 8 }, ease: 'in' },
    { t: 0.28, footFrame: 'model', hips: [0, -0.36, 0.07], ease: 'snap' },
    { t: 0.84, footFrame: 'model', spine1: { b: 18 }, spine2: { b: 20 }, neck: { b: -6 }, head: { b: -6 }, handL: [0.26, 0.30, 0.66], handR: [-0.26, 0.30, 0.68], hips: [0, -0.24, 0.04], ease: 'out' },
    { t: 1.54, ...GUARD, footFrame: 'model', footL: FOOT_L, footR: FOOT_R, spine1: { b: 0 }, spine2: { b: 0 }, neck: { b: 0 }, head: { b: 0 }, hips: [0, 0, 0], tail: { lift: 0 }, ease: 'inout' },
  ], { marks: { lead: 0.14, hit: 0.14, rec: 0.28 } });

  // ---------------- 08 紫焰吐息：昂头后仰、胸口蓄光（1.1 秒）→ 俯首前探吐息 2 秒（游戏按有限速度转身横扫）→ 收势（1.0 秒）----------------
  clip('breath', [
    { t: 0, ...GUARD },
    { t: 0.90, ...GUARD, spine1: { b: -8 }, spine2: { b: -14 }, neck: { b: -24 }, head: { b: -22 }, hips: [0, 0.02, -0.04], handL: [0.44, 1.00, 0.06], handR: [-0.46, 1.00, 0.08], clawL: 'spread', clawR: 'spread', wing: { half: 0.4, spread: 0.6 }, tail: { lift: 16 }, ease: 'out' },
    { t: 1.10, spine2: { b: -16 }, neck: { b: -26 }, head: { b: -24 }, ease: 'out' },
    { t: 1.24, spine1: { b: 10 }, spine2: { b: 14 }, neck: { b: 24 }, head: { b: 14 }, hips: [0, -0.10, 0.06], handL: [0.40, 0.70, 0.20], handR: [-0.42, 0.70, 0.22], tail: { lift: -6 }, ease: 'snap' },
    { t: 2.20, spine2: { b: 16 }, neck: { b: 26 }, head: { b: 12 }, hips: [0, -0.11, 0.07], ease: 'inout' },
    { t: 3.10, spine2: { b: 14 }, neck: { b: 24 }, head: { b: 14 }, hips: [0, -0.10, 0.06], ease: 'inout' },
    { t: 4.10, ...GUARD, spine1: { b: 0 }, spine2: { b: 0 }, neck: { b: 0 }, head: { b: 0 }, hips: [0, 0, 0], tail: { lift: 0 }, ease: 'inout' },
  ], { marks: { wind: 1.10, hit: 1.20, hitEnd: 3.10, rec: 3.10 } });

  // ---------------- 09 龙息连珠：双爪当胸聚气（0.75 秒）→ 左右交替推掌放出灵弹 3 枚（二阶段 5 枚扇形）→ 收势 ----------------
  // back：推出后收回所用的时间。五连发两掌相隔 0.2 秒，收回只给 0.1 秒——原先一律 0.18 秒，下一掌只剩 0.02 秒推出去（一帧甩出半米）
  const push = (side, t, k, back = 0.18) => {
    const S = side === L ? 'L' : 'R', sx = side === L ? 1 : -1;
    return [
      { t, ['hand' + S]: [0.10 * sx, 1.05, 0.62], ['elbow' + S]: [sx, -0.2, -0.3], ['claw' + S]: 'spread', spine2: { t: -12 * sx }, neck: { t: 6 * sx }, root: [0, 0.03 * k], ease: 'snap' },
      { t: t + back, ['hand' + S]: [0.24 * sx, 1.00, 0.30], spine2: { t: 0 }, ease: 'out' },
    ];
  };
  const orbStart = [
    { t: 0, ...GUARD },
    { t: 0.60, ...GUARD, handL: [0.12, 1.08, 0.32], handR: [-0.12, 1.08, 0.33], clawL: 'half', clawR: 'half', spine2: { b: -6 }, neck: { b: -4 }, hips: [0, -0.04, 0], wing: { half: 0.5, spread: 0.5 }, ease: 'out' },
    { t: 0.75, handL: [0.10, 1.10, 0.30], handR: [-0.10, 1.10, 0.31], ease: 'out' },
  ];
  clip('orbs3', [...orbStart, ...push(R, 0.84, 1), ...push(L, 1.14, 2), ...push(R, 1.44, 3),
    { t: 2.30, ...GUARD, spine2: { t: 0, b: 0 }, neck: { t: 0, b: 0 }, hips: [0, 0, 0], root: [0, 0.09], ease: 'inout' },
  ], { marks: { wind: 0.75, shots: [0.84, 1.14, 1.44], rec: 1.62 } });
  clip('orbs5', [...orbStart, ...push(R, 0.82, 1, 0.1), ...push(L, 1.02, 2, 0.1), ...push(R, 1.22, 3, 0.1), ...push(L, 1.42, 4, 0.1), ...push(R, 1.62, 5),
    { t: 2.48, ...GUARD, spine2: { t: 0, b: 0 }, neck: { t: 0, b: 0 }, hips: [0, 0, 0], root: [0, 0.15], ease: 'inout' },
  ], { marks: { wind: 0.75, shots: [0.82, 1.02, 1.22, 1.42, 1.62], rec: 1.80 } });

  // ---------------- 10 天罚落雷：右爪指天（1.0 秒）→ 举着引雷（落雷由游戏按预警依次落下）→ 收势（1.0 秒）----------------
  clip('thunder', [
    { t: 0, ...GUARD },
    { t: 0.80, ...GUARD, handR: [-0.20, 1.72, 0.18], elbowR: [-1, 0.3, -0.2], clawR: 'spread', handL: [0.46, 0.88, 0.18], clawL: 'curl', spine1: { b: -6, s: 6 }, spine2: { b: -10, s: 8 }, neck: { b: -18 }, head: { b: -18 }, wing: 'spread', tail: { lift: 20 }, hips: [0, 0.02, 0], ease: 'out' },
    { t: 1.00, handR: [-0.19, 1.76, 0.17], ease: 'out' },
    { t: 1.20, handR: [-0.18, 1.74, 0.20], spine2: { b: -8, s: 6 }, ease: 'snap' },
    { t: 2.40, handR: [-0.20, 1.74, 0.22], neck: { b: -12 }, head: { b: -8 }, ease: 'inout' },
    { t: 2.60, handR: [-0.30, 1.20, 0.50], spine2: { b: 6, s: 0 }, neck: { b: 6 }, head: { b: 4 }, ease: 'in' },
    { t: 3.60, ...GUARD, spine1: { b: 0, s: 0 }, spine2: { b: 0, s: 0 }, neck: { b: 0 }, head: { b: 0 }, hips: [0, 0, 0], tail: { lift: 0 }, ease: 'inout' },
  ], { marks: { wind: 1.0, cast: 1.05, rec: 2.6 } });

  // ---------------- 11 焚灵囚阵（二阶段）：双臂张开托起（1.2 秒）→ 双掌按地放出灵焰柱 → 收势（1.1 秒）----------------
  clip('prison', [
    { t: 0, ...GUARD },
    { t: 0.90, ...GUARD, handL: [0.60, 1.30, 0.20], handR: [-0.62, 1.30, 0.22], elbowL: [1, -0.4, -0.3], elbowR: [-1, -0.4, -0.3], clawL: 'spread', clawR: 'spread', spine2: { b: -10 }, neck: { b: -14 }, head: { b: -10 }, hips: [0, 0.03, 0], wing: 'spread', tail: { lift: 16 }, ease: 'out' },
    { t: 1.20, handL: [0.62, 1.40, 0.18], handR: [-0.64, 1.40, 0.20], ease: 'out' },
    { t: 1.32, handL: [0.46, 0.16, 0.50], handR: [-0.48, 0.16, 0.52], elbowL: [0.6, 0.2, -0.8], elbowR: [-0.6, 0.2, -0.8], spine1: { b: 20 }, spine2: { b: 24 }, neck: { b: 8 }, head: { b: 0 }, hips: [0, -0.30, 0.04], wing: { half: 0.7, spread: 0.3 }, tail: { lift: 4 }, ease: 'in' },
    { t: 1.42, hips: [0, -0.32, 0.05], ease: 'snap' },
    { t: 2.20, handL: [0.44, 0.20, 0.46], handR: [-0.46, 0.20, 0.48], hips: [0, -0.30, 0.04], neck: { b: -4 }, head: { b: -6 }, ease: 'inout' },
    { t: 3.30, ...GUARD, spine1: { b: 0 }, spine2: { b: 0 }, neck: { b: 0 }, head: { b: 0 }, hips: [0, 0, 0], tail: { lift: 0 }, ease: 'inout' },
  ], { marks: { wind: 1.2, cast: 1.36, rec: 2.2 } });

  // ---------------- 12 灭世龙怒（二阶段）：长蓄力（2.2 秒，可被失衡打断）→ 怒吼放出冲击环 → 两次间隔落雷 → 收势（1.8 秒）----------------
  clip('apocalypse', [
    { t: 0, ...GUARD },
    { t: 0.70, ...GUARD, hips: [0, -0.26, 0], spine1: { b: 18 }, spine2: { b: 22 }, neck: { b: 14 }, head: { b: 10 }, handL: [-0.06, 1.02, 0.30], handR: [0.06, 1.02, 0.32], elbowL: [1, -0.4, -0.2], elbowR: [-1, -0.4, -0.2], clawL: 'curl', clawR: 'curl', wing: 'fold', tail: { lift: -6, curl: 10 }, ease: 'out' },
    { t: 1.60, hips: [0, -0.22, 0], spine1: { b: 10 }, spine2: { b: 12 }, neck: { b: 4 }, head: { b: 0 }, handL: [0.30, 1.06, 0.20], handR: [-0.30, 1.06, 0.22], wing: { half: 0.6, spread: 0.4 }, tail: { lift: 6, curl: 0 }, ease: 'inout' },
    { t: 2.20, hips: [0, -0.24, -0.02], spine1: { b: 14 }, spine2: { b: 16 }, neck: { b: 10 }, handL: [0.26, 0.90, 0.36], handR: [-0.26, 0.90, 0.38], wing: { half: 0.4, spread: 0.6 }, ease: 'inout' },
    { t: 2.40, hips: [0, 0.04, -0.04], spine1: { b: -10 }, spine2: { b: -18 }, neck: { b: -26 }, head: { b: -22 }, handL: [0.62, 1.26, 0.06], handR: [-0.64, 1.26, 0.08], elbowL: [1, -0.4, -0.4], elbowR: [-1, -0.4, -0.4], clawL: 'spread', clawR: 'spread', wing: 'spread', tail: { lift: 26 }, ease: 'snap' },
    { t: 3.40, hips: [0, 0.03, -0.03], spine2: { b: -16 }, neck: { b: -22 }, head: { b: -18 }, handL: [0.58, 1.20, 0.10], handR: [-0.60, 1.20, 0.12], ease: 'inout' },
    { t: 3.80, handR: [-0.20, 1.70, 0.20], elbowR: [-1, 0.3, -0.2], neck: { b: -18 }, ease: 'out' },
    { t: 4.20, handR: [-0.22, 1.72, 0.22], ease: 'inout' },
    { t: 5.60, ...GUARD, spine1: { b: 0 }, spine2: { b: 0 }, neck: { b: 0 }, head: { b: 0 }, hips: [0, 0, 0], tail: { lift: 0, curl: 0 }, ease: 'inout' },
  ], { marks: { wind: 2.2, ring: 2.42, strike1: 3.0, strike2: 3.7, rec: 3.8 } });

  // ---------------- 受击：重受击（后仰、退一步）----------------
  clip('hitH', [
    { t: 0, ...GUARD },
    { t: 0.12, ...GUARD, spine1: { b: -10 }, spine2: { b: -14 }, neck: { b: -16 }, head: { b: -14 }, hips: [0, -0.02, -0.06], handL: [0.44, 1.02, 0.10], handR: [-0.46, 1.02, 0.12], clawL: 'spread', clawR: 'spread', footR: add(FOOT_R, [0, 0.10, -0.06]), root: [0, -0.06], tail: { lift: 14 }, ease: 'snap' },
    { t: 0.30, footR: add(FOOT_R, [0, 0, -0.16]), root: [0, -0.12], hips: [0, -0.06, -0.06], spine2: { b: -6 }, neck: { b: -6 }, ease: 'out' },
    { t: 0.75, ...GUARD, spine1: { b: 0 }, spine2: { b: 0 }, neck: { b: 0 }, head: { b: 0 }, hips: [0, 0, 0], footR: add(FOOT_R, [0, 0, -0.16]), root: [0, -0.12], tail: { lift: 0 }, ease: 'inout' },
  ], { marks: { rec: 0.3 } });

  // ---------------- 失衡：踉跄 → 单膝跪地、右爪撑地（循环喘息）→ 起身 ----------------
  const KNEEL = { hips: [0.02, -0.37, -0.02], spine1: { b: 22 }, spine2: { b: 18 }, neck: { b: 14 }, head: { b: 10 }, footL: [0.13, 0.11, 0.40], kneeL: [0.2, 0, 1], footR: [-0.16, 0.09, -0.40], footRotR: { b: -45 }, kneeR: [-0.2, -1, 0.6],
    handR: [-0.30, 0.10, 0.52], elbowR: [-1, 0.3, 0], clawR: 'spread', handL: [0.30, 0.56, 0.42], elbowL: [1, -0.2, -0.2], clawL: 'half', wing: { fold: 0.7, half: 0.3 }, tail: { lift: 12 } };
  clip('stagger_in', [
    { t: 0, ...GUARD },
    { t: 0.18, ...GUARD, spine2: { b: -10 }, neck: { b: -12 }, hips: [0, -0.06, -0.06], handL: [0.46, 1.0, 0.10], handR: [-0.48, 1.0, 0.12], root: [0, -0.08], ease: 'snap' },
    { t: 0.62, ...KNEEL, root: [0, -0.08], ease: 'in' },
    { t: 0.75, ...KNEEL, hips: [0.02, -0.385, -0.02], root: [0, -0.08], ease: 'snap' },
  ], { marks: { down: 0.62 } });
  clip('stagger_loop', [
    { t: 0, ...KNEEL },
    { t: 0.6, ...KNEEL, spine2: { b: 21 }, neck: { b: 17 }, hips: [0.02, -0.38, -0.02], ease: 'inout' },
    { t: 1.2, ...KNEEL, ease: 'inout' },
  ], { loop: true });
  clip('stagger_out', [
    { t: 0, ...KNEEL },
    { t: 0.45, ...KNEEL, hips: [0.02, -0.26, 0], handR: [-0.34, 0.5, 0.44], spine1: { b: 12 }, spine2: { b: 10 }, footR: add(FOOT_R, [0, 0.10, -0.12]), ease: 'inout' },
    { t: 0.90, ...GUARD, hips: [0, 0, 0], spine1: { b: 0 }, spine2: { b: 0 }, neck: { b: 0 }, head: { b: 0 }, footL: FOOT_L, footR: FOOT_R, tail: { lift: 0 }, ease: 'inout' },
  ]);

  // ---------------- 倒下（击败）：踉跄后退 → 双膝跪地 → 双爪撑地 → 侧倒伏地，尾渐渐不动 ----------------
  clip('death', [
    { t: 0, ...GUARD },
    { t: 0.30, ...GUARD, spine1: { b: -12 }, spine2: { b: -16 }, neck: { b: -20 }, head: { b: -16 }, hips: [0, -0.02, -0.08], handL: [0.50, 1.0, 0.0], handR: [-0.52, 1.0, 0.02], clawL: 'spread', clawR: 'spread', footR: add(FOOT_R, [0, 0.08, -0.10]), root: [0, -0.10], tail: { lift: 16 }, ease: 'snap' },
    { t: 0.80, ...KNEEL, footL: [0.14, 0.09, -0.32], footRotL: { b: -45 }, kneeL: [0.2, -1, 0.6], hips: [0, -0.37, -0.10], spine1: { b: 6 }, spine2: { b: 2 }, neck: { b: -8 }, head: { b: -10 }, handL: [0.38, 0.62, 0.30], handR: [-0.40, 0.62, 0.32], root: [0, -0.16], ease: 'in' },
    { t: 1.40, hips: [0, -0.38, -0.06], spine1: { b: 26 }, spine2: { b: 26 }, neck: { b: 20 }, head: { b: 14 }, handL: [0.30, 0.17, 0.50], handR: [-0.32, 0.17, 0.52], elbowL: [1, 0.3, 0], elbowR: [-1, 0.3, 0], root: [0, -0.16], wing: { fold: 0.5, half: 0.5 }, tail: { lift: 12 }, ease: 'out' },
    { t: 2.30, hips: [0.10, -0.50, 0.10], body: { s: 28, b: 20 }, spine1: { b: 30, s: 10 }, spine2: { b: 26 }, neck: { b: 22, t: 20 }, head: { b: 10 }, handL: [0.52, 0.20, 0.40], handR: [-0.12, 0.14, 0.70], root: [0, -0.16], wing: { spread: 0.5, half: 0.5 }, tail: { lift: 16, yaw: 20 }, kneeL: [0.8, 0.3, 0.6], clawL: 'relax', clawR: 'relax', ease: 'in' },
    { t: 3.20, hips: [0.12, -0.52, 0.12], body: { s: 30, b: 22 }, spine1: { b: 32, s: 12 }, neck: { b: 26, t: 24 }, head: { b: 14 }, root: [0, -0.16], tail: { lift: 18, yaw: 24 }, clawL: 'half', clawR: 'half', ease: 'out' },
  ], { marks: { knees: 0.8, fall: 2.3 } });

  // ---------------- 出场：沉睡（跪伏、垂首、双翼收拢）→ 抬头、握爪、展尾、起身展翼 ----------------
  const DORMANT = { ...KNEEL, hips: [0, -0.375, 0.02], spine1: { b: 30 }, spine2: { b: 26 }, neck: { b: 30 }, head: { b: 26 }, handR: [-0.24, 0.12, 0.56], handL: [0.26, 0.12, 0.54], elbowL: [1, 0.3, 0], clawL: 'half', clawR: 'half', wing: 'fold', tail: { lift: 18, yaw: -30, curl: -12 } };
  clip('dormant', [
    { t: 0, ...DORMANT },
    { t: 1.6, ...DORMANT, spine2: { b: 28 }, hips: [0, -0.365, 0.02], ease: 'inout' },
    { t: 3.2, ...DORMANT, ease: 'inout' },
  ], { loop: true });
  clip('awaken', [
    { t: 0, ...DORMANT },
    { t: 1.0, ...DORMANT, neck: { b: 6 }, head: { b: -10 }, ease: 'inout' },                                     // 抬头
    { t: 1.6, ...DORMANT, neck: { b: 2 }, head: { b: -14 }, clawL: 'curl', clawR: 'curl', ease: 'out' },          // 握爪
    { t: 2.3, ...DORMANT, neck: { b: 0 }, head: { b: -12 }, clawL: 'curl', clawR: 'curl', tail: { lift: 16, yaw: 30, curl: 0 }, ease: 'inout' },   // 展尾
    { t: 3.3, ...GUARD, hips: [0, 0.02, 0], spine1: { b: -4 }, spine2: { b: -8 }, neck: { b: -10 }, head: { b: -10 }, footL: FOOT_L, footR: FOOT_R, clawL: 'curl', clawR: 'curl', wing: 'half', tail: { lift: 10, yaw: 0 }, ease: 'inout' },   // 起身
    { t: 4.0, ...GUARD, hips: [0, 0.02, 0], spine2: { b: -10 }, neck: { b: -12 }, wing: 'spread', tail: { lift: 14 }, clawL: 'spread', clawR: 'spread', ease: 'out' },   // 展翼
  ], { marks: { look: 1.0, fist: 1.6, tail: 2.3, rise: 3.3, wings: 4.0 } });

  // ---------------- 怒吼（出场、二阶段觉醒）----------------
  clip('roar', [
    { t: 0, ...GUARD },
    { t: 0.45, ...GUARD, hips: [0, -0.12, 0], spine1: { b: 14 }, spine2: { b: 16 }, neck: { b: 18 }, head: { b: 12 }, handL: [0.20, 0.86, 0.48], handR: [-0.20, 0.86, 0.50], clawL: 'curl', clawR: 'curl', wing: 'fold', ease: 'out' },
    { t: 0.70, hips: [0, 0.04, -0.03], spine1: { b: -10 }, spine2: { b: -18 }, neck: { b: -28 }, head: { b: -26 }, handL: [0.64, 1.22, 0.06], handR: [-0.66, 1.22, 0.08], elbowL: [1, -0.4, -0.4], elbowR: [-1, -0.4, -0.4], clawL: 'spread', clawR: 'spread', wing: 'spread', tail: { lift: 26 }, ease: 'snap' },
    { t: 1.90, hips: [0, 0.03, -0.03], spine2: { b: -16 }, neck: { b: -24 }, head: { b: -22 }, handL: [0.60, 1.18, 0.10], handR: [-0.62, 1.18, 0.12], tail: { lift: 22 }, ease: 'inout' },
    { t: 2.40, ...GUARD, hips: [0, 0, 0], spine1: { b: 0 }, spine2: { b: 0 }, neck: { b: 0 }, head: { b: 0 }, tail: { lift: 0 }, wing: { half: 0.7, spread: 0.3 }, ease: 'inout' },
  ], { marks: { roar: 0.7 } });

  // ---------------- 二阶段过场：踉跄单膝跪地、撑地（循环，裂纹涌出紫焰）→ 起身（接怒吼）----------------
  clip('p2_kneel', [
    { t: 0, ...GUARD },
    { t: 0.25, ...GUARD, spine2: { b: -12 }, neck: { b: -14 }, hips: [0, -0.06, -0.08], handL: [0.48, 1.0, 0.08], handR: [-0.50, 1.0, 0.10], root: [0, -0.10], ease: 'snap' },
    { t: 0.90, ...KNEEL, handL: [0.30, 0.10, 0.50], elbowL: [1, 0.3, 0], clawL: 'spread', root: [0, -0.10], ease: 'in' },
    { t: 1.05, ...KNEEL, handL: [0.30, 0.10, 0.50], clawL: 'spread', hips: [0.02, -0.385, -0.02], root: [0, -0.10], ease: 'snap' },
  ], { marks: { down: 0.9 } });
  clip('p2_rise', [
    { t: 0, ...KNEEL, handL: [0.30, 0.10, 0.50], clawL: 'spread' },
    { t: 0.6, ...KNEEL, hips: [0.02, -0.30, 0], spine1: { b: 10 }, spine2: { b: 6 }, neck: { b: -6 }, head: { b: -10 }, handL: [0.34, 0.42, 0.40], handR: [-0.34, 0.42, 0.42], clawL: 'curl', clawR: 'curl', ease: 'inout' },
    { t: 1.2, ...GUARD, hips: [0, 0, 0], spine1: { b: 0 }, spine2: { b: 0 }, neck: { b: 0 }, head: { b: 0 }, footL: FOOT_L, footR: FOOT_R, tail: { lift: 0 }, clawL: 'curl', clawR: 'curl', ease: 'inout' },
  ]);

  // ---------------- 失败处决：俯身以右爪按住倒地的玩家（爪落点在身前 0.9 米、地面）→ 仰头蓄息 → 俯首吐息 ----------------
  const PIN = { hips: [0, -0.38, 0.08], spine1: { b: 38 }, spine2: { b: 38 }, neck: { b: 0 }, head: { b: -4 }, handR: [-0.08, 0.08, 0.64], elbowR: [-1, 0.4, 0.2], clawR: 'grip', handL: [0.40, 0.50, 0.36], clawL: 'half', footL: add(FOOT_L, [0, 0, 0.10]), wing: { half: 0.5, spread: 0.5 }, tail: { lift: 8 } };
  clip('exec', [
    { t: 0, ...GUARD },
    { t: 0.70, ...PIN, handR: [-0.08, 0.30, 0.66], clawR: 'spread', ease: 'inout' },
    { t: 0.90, ...PIN, ease: 'in' },                                                   // 按住
    { t: 2.00, ...PIN, hips: [0, -0.39, 0.09], spine2: { b: 40 }, ease: 'inout' },
    { t: 2.80, ...PIN, neck: { b: -36 }, head: { b: -26 }, spine2: { b: 28 }, spine1: { b: 36 }, hips: [0, -0.35, 0.07], wing: 'spread', tail: { lift: 20 }, ease: 'out' },     // 仰头蓄息（爪不松）
    { t: 3.40, ...PIN, neck: { b: -38 }, head: { b: -28 }, spine2: { b: 26 }, spine1: { b: 36 }, hips: [0, -0.35, 0.07], ease: 'inout' },
    { t: 3.55, ...PIN, neck: { b: 30 }, head: { b: 22 }, spine2: { b: 44 }, spine1: { b: 40 }, hips: [0, -0.40, 0.09], wing: { half: 0.6, spread: 0.4 }, tail: { lift: 6 }, ease: 'snap' },  // 俯首吐息
    { t: 5.00, ...PIN, neck: { b: 26 }, head: { b: 18 }, spine2: { b: 42 }, ease: 'inout' },
  ], { marks: { pin: 0.9, charge: 2.8, blast: 3.55 } });

  return C;
}
