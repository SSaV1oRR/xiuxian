// 第十六轮：镇塔龙君·烬霄的十二招与战斗参数。
// 每一招一段（或几段）独立的骨骼动作（boss50Clips.js），判定、预警、特效、音效都按动作的时刻表（clip 时间，二阶段统一放快 1.25 倍，
// 时刻随之提前）编排在 update 里：
//   · 前摇：wind 之前；可追踪（track：到哪一刻为止、每秒转多少）；可被打断的招式（interrupt）只在前摇里被重击 / 失衡打断；
//   · 出手：只在有效窗口里判定（爪：按爪尖实际扫过的角度；尾：按尾尖扫过的角度；砸地、落雷、焰柱：圆；冲撞：身体扫过的路径；
//     吐息：锥形、0.35 秒一跳；灵弹：飞行的球体）。同一下判定只结算一次（hits 集合），持续伤害有自己的间隔；
//   · 收势：rec 之后，直到动作放完，是玩家的反击窗口（counter）。
// 扇形预警的边就是判定边界（同一组半径、角度）；不可格挡的招式预警为红色、头顶亮「危」字。
// 角度：相对龙的朝向，向龙的左手边为正（弧度）。距离：米（世界）。时间：clip 秒。
import * as THREE from 'three';

const A3 = THREE.Vector3;
export const CONFIG50 = {
  hp: { p1: 2000, p2: 1300 },              // 二阶段 = 0.65 × 一阶段（按第五十层的玩家调：160 气血、流云三连 70 伤害左右）
  hpDebug: { p1: 10000, p2: 6500 },        // 调试（?boss50hp=debug）
  p2: { move: 1.35, anim: 1.25, cool: 0.8, dmg: 1.15 },
  lightReact: { p1: 0.30, p2: 0.18 },      // 轻受击（局部后仰）的时长
  staggerTime: { p1: 2.0, p2: 1.2 },       // 失衡破绽（跪地喘息的时长）
  posture: { max: 100, delay: 2.4, decay: 10, protect: 4.5 },  // 架势：满了失衡；最后一次累积后 2.4 秒开始每秒回落；失衡后 4.5 秒内不再累积
  turn: { p1: 1.6, p2: 2.1 },              // 寻常转向（弧度 / 秒）
  gap: { p1: [0.9, 1.5], p2: [0.5, 1.0] }, // 两招之间的空隙（秒）
  walk: 0.7333 * 2.8,                      // 走路速度（米 / 秒，与 walk 动作的步幅一致）
  ring: 25, keepIn: 23.0,                  // 封印圈半径；龙心不出 23 米（身体不碰光墙）
};

const D = Math.PI / 180;
const chargeV = (F) => 17 * (F.phase === 2 ? 1.12 : 1);     // 冲撞速度（米 / 秒）
// 爪的扫掠（实测：试载页按根运动取爪尖相对出手时站位的角度；见 docs/R16_REPORT.md 的招式表）
// 第十八轮：动作烘焙后做了平滑，爪比关键帧早约 0.04 秒起动——几下横扫的判定窗口跟着提前 0.04 秒，扫掠的起点仍在窗口里
const SW = {
  claw1: { side: 'r', w: [0.46, 0.66], a: [-80 * D, 42 * D], r: 5.0 },
  claw2a: { side: 'l', w: [0.58, 0.80], a: [-36 * D, 80 * D], r: 4.6 },
  claw2b: { side: 'r', w: [0.92, 1.14], a: [-45 * D, 15 * D], r: 4.6 },
  claw2x: { side: 'l', w: [1.20, 1.38], a: [-16 * D, 50 * D], r: 4.4 },
  combo1: { side: 'r', w: [0.68, 0.88], a: [-75 * D, 39 * D], r: 4.4 },
  combo2: { side: 'l', w: [1.00, 1.20], a: [-29 * D, 75 * D], r: 4.4 },
};

// 一下爪击：前摇里扇形预警跟着龙（追踪），出手窗口开始时定住，窗口内按爪尖扫过的角度判定
function clawStrike(F, M, key, o) {
  const S = SW[key], t0 = M.t0, t1 = M.t1;
  if (!M.tele[key] && t1 < S.w[1] && (o.teleFrom == null || t1 >= o.teleFrom)) F.sectorTele(M, key, { r: S.r, a0: S.a[0], a1: S.a[1], until: S.w[0] + 0.06, sweep: S.a[1] > S.a[0] ? -1 : 1, danger: false });
  if (t1 >= S.w[0] - 0.12 && t0 <= S.w[1]) F.trail(S.side, true);
  if (t1 >= S.w[0] && t0 <= S.w[1]) {
    F.sweep(M, key, () => F.rig.claw(S.side), { r: S.r, a0: S.a[0], a1: S.a[1], minD: 0.7, ...o.hit });
    if (!M.arc?.[key] && t1 >= (o.arcAt ?? S.w[0] + 0.05)) {
      (M.arc ||= {})[key] = true;
      const A = M.anchor[key] || F.root;
      F.fx.clawArc(A, M.face[key] ?? F.rig.yaw, S.r, S.a[0], S.a[1], 1.35, { big: !!o.big });
      F.sfx('claw', { at: A });
    }
  }
  if (t0 <= S.w[1] && t1 > S.w[1]) { F.trail(S.side, false); M.tele[key]?.remove(0.25); }
}

export const MOVES50 = {
  // ---------------- 01 裂空龙爪 ----------------
  claw1: {
    no: '01', name: '裂空龙爪', clip: 'claw1', cd: 2.6, block: true, parry: true, interrupt: 'heavy', windEnd: 0.45, parryResult: 'recoil', parryPosture: 22,
    ai: { close: 3.0, mid: 0.2, far: 0, front: true, maxD: 6.0 },
    doc: { wind: '0.45', rec: '0.55', track: '至 0.40', hit: '右爪横扫，正面扇形 5 米（右 80° 至左 42°），19', flags: '可格挡、可弹反；前摇可被重击打断', counter: '0.60–1.15' },
    update(F, M) {
      if (M.t1 < 0.40) F.track(1.9);
      F.charge(1, M.t1 < 0.45 ? M.t1 / 0.45 : Math.max(0, 1 - (M.t1 - 0.45) / 0.15));
      if (F.at(M, 0.30)) F.sfx('snarl', { at: F.root, gain: 0.9 });          // 第十八轮：出爪前的咆哮（录音）
      clawStrike(F, M, 'claw1', { hit: { dmg: 19, react: 'flinch', block: true, parry: true } });
    },
  },
  // ---------------- 02 双爪追猎（二阶段：多一记左爪上撩追击）----------------
  claw2: {
    no: '02', name: '双爪追猎', clip: (F) => (F.phase === 2 ? 'claw2x' : 'claw2'), cd: 4.5, block: true, parry: true, interrupt: 'heavy', windEnd: 0.60, parryResult: 'recoil', parryPosture: 16, parryEnds: false,
    lastKey: (F) => (F.phase === 2 ? 'claw2x' : 'claw2b'),     // 第十八轮：弹反最后一爪时龙君僵直；弹反前面的爪只顿一下，后面那一爪照常
    ai: { close: 2.4, mid: 0.6, far: 0, front: true, maxD: 7.0 },
    doc: { wind: '0.60', rec: '0.80', track: '至 0.55；两爪之间再追 0.80–0.96（最多 35°）', hit: '左爪横抓（右 36°～左 80°，4.6 米，14）→ 0.35 秒后右爪斜抓（右 45°～左 15°，15）；二阶段再加左爪上撩（4.4 米，14，击退）', flags: '可格挡、可弹反；两次独立伤害', counter: '1.08–1.90（二阶段 1.36–2.20）' },
    update(F, M) {
      if (M.t1 < 0.55) F.track(1.9);
      else if (M.t1 > 0.80 && M.t1 < 0.96) F.track(1.6, M, 35 * D);       // 第二击有限追踪
      else if (F.phase === 2 && M.t1 > 1.14 && M.t1 < 1.22) F.track(1.4, M, 20 * D);
      F.charge(0, M.t1 < 0.6 ? M.t1 / 0.6 : Math.max(0, 1 - (M.t1 - 0.6) / 0.2));
      F.charge(1, M.t1 > 0.8 && M.t1 < 1.0 ? (M.t1 - 0.8) / 0.2 : M.t1 >= 1.0 && M.t1 < 1.15 ? 1 - (M.t1 - 1.0) / 0.15 : 0);
      if (F.at(M, 0.38)) F.sfx('snarl', { at: F.root, gain: 0.85 });          // 第十八轮：出爪前的咆哮（录音）
      clawStrike(F, M, 'claw2a', { hit: { dmg: 14, react: 'flinch', block: true, parry: true } });
      clawStrike(F, M, 'claw2b', { teleFrom: 0.78, hit: { dmg: 15, react: 'flinch', block: true, parry: true } });
      if (F.phase === 2) clawStrike(F, M, 'claw2x', { teleFrom: 1.10, hit: { dmg: 14, react: 'knockback', block: true, parry: true } });
    },
  },
  // ---------------- 03 迟发碎岳（不可格挡）----------------
  slam: {
    no: '03', name: '迟发碎岳', clip: 'slam', cd: 7.5, block: false, parry: false, interrupt: 'heavy', windEnd: 1.30, danger: true,
    ai: { close: 1.5, mid: 0.6, far: 0, front: true, maxD: 7.5 },
    doc: { wind: '1.30（双臂高举、0.25 秒停顿）', rec: '1.20', track: '至 0.90', hit: '双爪砸地：身前 2.5 米处半径 4.0 米（34，击退）＋冲击波 4.0→8.5 米（13）', flags: '不可格挡（红色预警、「危」）；前摇可被重击打断', counter: '1.52–2.75' },
    start(F, M) { F.danger(M); },
    update(F, M) {
      if (M.t1 < 0.90) F.track(1.6);
      F.charge(0, Math.min(1, Math.max(0, (M.t1 - 0.3) / 1.0)) * (M.t1 < 1.45 ? 1 : 0));
      F.charge(1, Math.min(1, Math.max(0, (M.t1 - 0.3) / 1.0)) * (M.t1 < 1.45 ? 1 : 0));
      if (M.t1 > 0.3 && M.t1 < 1.42) { F.fx.converge(F.rig.claw('l'), { n: 1, r: 0.9 }); F.fx.converge(F.rig.claw('r'), { n: 1, r: 0.9 }); }
      if (F.at(M, 0.5)) F.sfx('charge', { at: F.root, dur: 0.9 });
      const C = F.ahead(2.5);
      if (!M.tele.c && M.t1 >= 0.25) {
        M.tele.c = F.fx.tele({ shape: 'circle', pos: C, r: 4.0, danger: true, dur: F.realT(0.25, 1.45), follow: (T) => { if (M.t1 < 0.92) T.place(F.ahead(2.5)); } });
        M.tele.ring = F.fx.tele({ shape: 'ring', pos: C, r0: 4.0, r: 8.5, danger: true, dur: F.realT(0.25, 1.45), follow: (T) => { if (M.t1 < 0.92) T.place(F.ahead(2.5)); } });
        M.tele.ring.set('uA', 0.6);
      }
      if (F.at(M, 1.45)) {
        const P = M.tele.c ? M.tele.c.mesh.position.clone().setY(0) : C;
        M.tele.c?.hit(); M.tele.ring?.remove(0.4);
        F.circleHit(M, 'slam', P, 4.0, { dmg: 34, block: false, parry: false, react: 'knockback', at: P });
        F.ring(P, { r0: 4.0, r1: 8.5, dur: 0.42, w: 1.4, dmg: 13, react: 'flinch', block: false });
        F.fx.impact(P, 4.0, { rocks: 16, dust: 16, light: 60 });
        F.fx.shake(0.4); F.fx.flash(0xd8c8ff, 0.18);
        F.sfx('slam', { at: P });
        F.charge(0, 0); F.charge(1, 0);
      }
    },
  },
  // ---------------- 04 龙尾回扫 ----------------
  tailsweep: {
    no: '04', name: '龙尾回扫', clip: 'tailsweep', cd: 6.0, block: true, parry: true, interrupt: 'heavy', windEnd: 0.85, hard: true, parryResult: 'stagger', parryPosture: 30,
    ai: { close: 0.4, behind: 6.0, mid: 0, far: 0, front: false, maxD: 6.2 },
    doc: { wind: '0.85（腰身左扭、尾向右蓄）', rec: '0.90', track: '不追踪（原地转身一周）', hit: '尾尖与尾劲扫过 0.9–5.4 米环形，自身后起经两侧扫一周（22，击退）', flags: '可格挡（须面向来尾）、可弹反', counter: '1.48–2.30' },
    update(F, M) {
      if (!M.tele.r && M.t1 > 0.05) M.tele.r = F.fx.tele({ shape: 'ring', pos: F.root, r0: 0.9, r: 5.4, danger: false, dur: F.realT(0.05, 1.0) });
      if (F.at(M, 0.4)) F.sfx('growl', { at: F.root, dur: 0.6 });
      const on = M.t1 > 0.9 && M.t1 < 1.62;
      F.trail('tail', on);
      if (M.t1 >= 0.98 && M.t0 <= 1.56) {
        F.sweep(M, 'tail', () => F.rig.tailTip(), { r: 5.4, r0: 0.9, full: true, minD: 0.8, dmg: 22, react: 'knockback', block: true, parry: true, at: () => F.rig.tailTip() });
        // 尾劲：沿尾尖方向在 5.4 米处甩出的弧光
        if (Math.random() < 0.6) { const tip = F.rig.tailTip(), a = Math.atan2(tip.x - F.root.x, tip.z - F.root.z); F.fx.clawArc(F.root, a, 5.4, -0.25, 0.25, 1.0, {}); }
        if (F.at(M, 1.02)) F.sfx('whoosh', { at: F.root, dur: 0.5, pitch: 0.7 });
      }
      if (F.at(M, 1.58)) M.tele.r?.remove(0.25);
    },
  },
  // ---------------- 05 三段猎杀：快抓 → 交叉抓 → 延迟约 0.65 秒的重击（第三下不可格挡）----------------
  combo3: {
    no: '05', name: '三段猎杀', clip: 'combo3', cd: 9.0, block: true, parry: true, interrupt: 'heavy', windEnd: 0.70, parryResult: 'recoil', parryPosture: 18, parryEnds: true,
    // 二阶段：前两下随整体放快，第三下前的停顿段（1.62–2.24）保持原速，延迟仍约 0.6 秒
    ranges: (F) => (F.phase === 2 ? [[1.62, 2.24, 1.0]] : null),
    ai: { close: 1.6, mid: 0.3, far: 0, front: true, maxD: 6.0 },
    doc: { wind: '0.70', rec: '1.20', track: '至 0.62；两爪之间、高举时（至 1.90）', hit: '右爪快抓（4.4 米，12）→ 左爪交叉抓（4.4 米，14）→ 高举停顿 ≈0.65 秒 → 双爪重砸（身前 2.6 米处半径 3.4 米，32，击倒）', flags: '前两下可格挡、可弹反；第三下不可格挡，须闪避', counter: '2.44–3.50' },
    update(F, M) {
      if (M.t1 < 0.62) F.track(2.0);
      else if (M.t1 > 0.88 && M.t1 < 1.0) F.track(1.6, M, 30 * D);
      else if (M.t1 > 1.3 && M.t1 < 1.9) F.track(1.2);
      if (F.at(M, 0.40)) F.sfx('snarl', { at: F.root, gain: 0.85 });
      clawStrike(F, M, 'combo1', { hit: { dmg: 12, react: 'flinch', block: true, parry: true } });
      clawStrike(F, M, 'combo2', { teleFrom: 0.86, hit: { dmg: 14, react: 'flinch', block: true, parry: true } });
      if (F.at(M, 1.40)) F.danger(M);
      if (!M.tele.c && M.t1 >= 1.40) {
        M.tele.c = F.fx.tele({ shape: 'circle', pos: F.ahead(2.6), r: 3.4, danger: true, dur: F.realT(1.40, 2.30), follow: (T) => { if (M.t1 < 1.9) T.place(F.ahead(2.6)); } });
      }
      F.charge(0, M.t1 > 1.35 && M.t1 < 2.32 ? Math.min(1, (M.t1 - 1.35) / 0.5) : 0);
      F.charge(1, M.t1 > 1.35 && M.t1 < 2.32 ? Math.min(1, (M.t1 - 1.35) / 0.5) : 0);
      if (F.at(M, 1.62)) F.sfx('charge', { at: F.root, dur: 0.7, pitch: 1.3 });
      if (F.at(M, 2.30)) {
        const P = M.tele.c ? M.tele.c.mesh.position.clone().setY(0) : F.ahead(2.6);
        M.tele.c?.hit();
        F.circleHit(M, 'c3', P, 3.4, { dmg: 32, block: false, parry: false, react: 'knockdown', at: P });
        F.fx.impact(P, 3.4, { rocks: 12, dust: 12, light: 50 });
        F.fx.shake(0.35); F.sfx('slam', { at: P, gain: 0.85 });
      }
    },
  },
  // ---------------- 06 破阵冲撞：低身蓄力 → 锁定方向直冲 12–16 米 → 刹停 ----------------
  charge: {
    no: '06', name: '破阵冲撞', clip: 'charge_wind', cd: 10, block: true, parry: true, guardBreak: true, interrupt: 'heavy', windEnd: 0.75, multi: true, hard: true, parryResult: 'interrupt', parryPosture: 34, parryEnds: true,
    ai: { close: 0.2, mid: 2.0, far: 1.4, front: true, minD: 5, maxD: 30 },
    doc: { wind: '1.00（锁定于 0.75）', rec: '1.10（刹停）', track: '至 0.75，之后方向锁死', hit: '身体扫过的路径，宽 3.4 米（与路径预警同宽）、长 12–16 米（遇光墙提前停），28，击退', flags: '可格挡但破防（减伤后踉跄）、可弹反；冲刺中不可打断', counter: '刹停 1.10 秒' },
    update(F, M) {
      const S = M.data;
      if (!S.stage) S.stage = 'wind';
      if (S.stage === 'wind') {
        if (M.t1 < 0.75) F.track(2.2);
        if (F.at(M, 0.2)) F.sfx('growl', { at: F.root, dur: 0.8 });
        if (M.t1 >= 0.75 && !S.dir) {
          S.dir = F.rig.forward.clone(); S.from = F.root.clone();
          S.len = Math.min(16, Math.max(12, F.playerRel().d + 4), F.rayToRing(S.from, S.dir) - 1.0);
          M.tele.path = F.fx.tele({ shape: 'rect', pos: S.from, yaw: F.rig.yaw, len: S.len, w: 3.4, danger: false, dur: F.realT(0.75, 1.0) + 0.05 });
        }
        if (M.t1 > 0.2) F.fx.dust(F.root, 1, 1.5);
        // 第十八轮：跑步动作的放速按冲刺速度算（步子与地面同速，脚不在地上滑）
        if (F.rig.done) { S.stage = 'run'; S.run = 0; F.rig.play('charge_run', { fade: 0.15, speed: chargeV(F) / (F.rig.marks('charge_run').speed * F.rig.S) }); F.sfx('roar', { at: F.root, dur: 0.8, pitch: 1.3, gain: 0.5 }); M.noInterrupt = true; }
        return;
      }
      if (S.stage === 'run') {
        const v = chargeV(F), step = Math.min(v * F.dt, S.len - S.run);
        const prev = F.root.clone();
        F.moveBoss(S.dir.x * step, S.dir.z * step, true);
        S.run += step;
        M.tele.path?.set('uP', Math.min(1, S.run / S.len));
        F.pathHit(M, 'body', prev, F.root, 1.7, { dmg: 28, react: 'knockback', block: true, parry: true, guardBreak: true, at: F.root });
        F.fx.dust(F.root, 2, 1.2);
        if ((S.stepT = (S.stepT || 0) - F.dt) <= 0) { S.stepT = 0.22; F.sfx('step', { at: F.root, gain: 1.2 }); }
        if (S.run >= S.len - 1e-3 || F.blocked) {
          S.stage = 'stop'; F.rig.play('charge_stop', { fade: 0.15, speed: F.k.anim }); M.noInterrupt = false;
          M.tele.path?.remove(0.2);
          F.fx.dust(F.root, 10, 2.4); F.fx.shake(0.15); F.sfx('slam', { at: F.root, gain: 0.45 });
        }
        return;
      }
      if (S.stage === 'stop' && F.rig.done) M.finished = true;
    },
  },
  // ---------------- 07 跃空镇压：深蹲展翼 → 跃向玩家先前的位置 → 落地重砸（落点不随玩家移动）----------------
  jump: {
    no: '07', name: '跃空镇压', clip: 'jump_wind', cd: 11, block: false, parry: false, interrupt: 'heavy', windEnd: 0.90, multi: true, danger: true,
    ai: { close: 0.3, mid: 1.8, far: 1.6, front: false, minD: 6, maxD: 30 },
    doc: { wind: '1.20（落点于 0.90 锁定）', rec: '1.40（落地）', track: '至 0.90 锁定落点', hit: '落点半径 4.6 米（36，击倒）＋余波 4.6→7.0 米（10）', flags: '不可格挡；落点圈锁定后不再跟随玩家；空中不可打断', counter: '落地后 0.24–1.40' },
    start(F, M) { F.danger(M); },
    update(F, M) {
      const S = M.data;
      if (!S.stage) S.stage = 'wind';
      if (S.stage === 'wind') {
        if (M.t1 < 0.9) F.track(2.4);
        if (F.at(M, 0.3)) F.sfx('growl', { at: F.root, dur: 0.6 });
        if (F.at(M, 0.55)) F.sfx('wing', { at: F.root, gain: 0.8 });           // 第十八轮：深蹲展翼
        if (M.t1 >= 0.9 && !S.to) {
          S.to = F.clampIn(F.tgt.pos.clone().setY(0), 21.5); S.from = F.root.clone();
          S.air = (F.phase === 2 ? 0.72 : 0.88);
          M.tele.land = F.fx.tele({ shape: 'circle', pos: S.to, r: 4.6, danger: true, dur: F.realT(0.9, 1.2) + S.air });
          M.tele.wave = F.fx.tele({ shape: 'ring', pos: S.to, r0: 4.6, r: 7.0, danger: true, dur: F.realT(0.9, 1.2) + S.air }); M.tele.wave.set('uA', 0.5);
          F.rig.setYaw(Math.atan2(S.to.x - S.from.x, S.to.z - S.from.z));
        }
        if (F.rig.done) { S.stage = 'air'; S.t = 0; F.rig.play('jump_air', { fade: 0.2 }); M.noInterrupt = true; F.fx.dust(F.root, 12, 2.6); F.sfx('whoosh', { at: F.root, dur: 0.6, pitch: 0.5, gain: 1.2 }); F.sfx('wing', { at: F.root, gain: 1.1 }); }
        return;
      }
      if (S.stage === 'air') {
        S.t += F.dt;
        const u = Math.min(1, S.t / S.air), h = Math.sin(u * Math.PI) * 6.5;
        if (!S.flap && u > 0.42) { S.flap = true; F.sfx('wing', { at: F.root, pitch: 0.92, gain: 0.9 }); }
        const x = S.from.x + (S.to.x - S.from.x) * u, z = S.from.z + (S.to.z - S.from.z) * u;
        F.moveBoss(x - F.root.x, z - F.root.z, false, h);
        // 第十八轮：落地动作提前 lead 秒开始（双爪在下落的最后一段砸下，触地时正好着地）；伤害、特效仍在触地这一刻
        const lead = (F.rig.marks('jump_land').lead ?? 0) / F.k.anim;
        if (!S.landAnim && S.air - S.t <= lead) { S.landAnim = true; F.rig.play('jump_land', { fade: 0.1, speed: F.k.anim }); }
        if (u >= 1) {
          if (!S.landAnim) { S.landAnim = true; F.rig.play('jump_land', { fade: 0.08, speed: F.k.anim, from: F.rig.marks('jump_land').lead ?? 0 }); }
          S.stage = 'land'; F.root.y = 0;
          M.tele.land?.hit(); M.tele.wave?.remove(0.4);
          F.circleHit(M, 'land', S.to, 4.6, { dmg: 36, block: false, parry: false, react: 'knockdown', at: S.to });
          F.ring(S.to, { r0: 4.6, r1: 7.0, dur: 0.3, w: 1.2, dmg: 10, react: 'flinch', block: false });
          F.fx.impact(S.to, 4.6, { rocks: 20, dust: 18, light: 70 });
          F.fx.shake(0.5); F.fx.flash(0xd8c8ff, 0.2); F.sfx('slam', { at: S.to, gain: 1.1 });
          M.noInterrupt = false;
        }
        return;
      }
      if (S.stage === 'land' && F.rig.done) M.finished = true;
    },
  },
  // ---------------- 08 紫焰吐息：昂头蓄息 → 自嘴喷出约 2 秒的锥形龙焰，按有限速度转身横扫；0.35 秒一跳 ----------------
  breath: {
    no: '08', name: '紫焰吐息', clip: 'breath', cd: 13, block: true, parry: false, interrupt: 'heavy', windEnd: 1.10,
    ai: { close: 0.7, mid: 1.8, far: 0.4, front: true, maxD: 11 },
    doc: { wind: '1.10（昂头、胸口蓄光）', rec: '1.00', track: '前摇至 1.0 正常追踪；吐息中每秒最多转 26°（二阶段 32°）', hit: '自嘴前伸 11 米、半角 18° 的锥形，每 0.35 秒一跳（7）', flags: '可格挡（面向龙焰）、不可弹反', counter: '3.10–4.10' },
    update(F, M) {
      const S = M.data;
      if (M.t1 < 1.0) F.track(1.8);
      else if (M.t1 >= 1.2 && M.t1 <= 3.1) F.track(F.phase === 2 ? 32 * D : 26 * D);
      F.charge(2, M.t1 < 1.1 ? M.t1 / 1.1 : M.t1 < 3.1 ? 0.6 : 0);
      if (M.t1 < 1.15) F.fx.converge(F.rig.mouth(), { n: 2, r: 1.2, size: 0.2 });
      if (F.at(M, 0.15)) F.sfx('charge', { at: F.root, dur: 0.95, pitch: 0.8 });
      const len = 11, half = 18 * D;
      // 预警：锥的地面投影（扇形，自龙嘴下方起），跟着头的朝向
      if (!M.tele.cone && M.t1 >= 0.35) M.tele.cone = F.fx.tele({ shape: 'sector', pos: F.root, r: len + 0.8, r0: 0.8, arc: half * 2, danger: false, dur: F.realT(0.35, 1.2), follow: (T) => { const o = F.breathFrame(len); T.place(o.base, o.yaw); } });
      if (F.at(M, 1.2)) { S.h = F.fx.breath({ len, half }); S.tick = 0; F.sfxLoop('breath', 'flame', { at: F.root }); }
      if (S.h) {
        const o = F.breathFrame(len);
        const grow = Math.min(1, (M.t1 - 1.2) / 0.18), a = M.t1 < 3.1 ? 1 : Math.max(0, 1 - (M.t1 - 3.1) / 0.25);
        S.h.set(o.mouth, o.dir, a, grow);
        S.h.groundHit = o.ground;
        if (M.t1 <= 3.1) {
          S.tick -= F.dt;
          if (S.tick <= 0 && F.inCone(o.mouth, o.dir, len * grow, half)) { S.tick = 0.35; F.hit({ dmg: 7, kind: 'fire', block: true, parry: false, react: null, at: o.mouth, dot: false, key: 'breath', seg: (S.seg = (S.seg || 0) + 1) }); }   // 每一跳各算一段（seg）
          // 第二十一轮：吐息也烧得到护战的凤凰（另记一跳）
          S.tickPh = (S.tickPh ?? 0) - F.dt;
          for (const V of F.victims()) if (!V.isPlayer && S.tickPh <= 0 && F.inCone(o.mouth, o.dir, len * grow, half, V.pos)) { S.tickPh = 0.35; F.hit({ dmg: 7, kind: 'fire', at: o.mouth, key: 'breath', seg: (S.segPh = (S.segPh || 0) + 1), victim: V.unit }); }
        }
        if (M.t1 > 3.35 && !S.ended) { S.ended = true; S.h.end(); M.tele.cone?.remove(0.2); F.stopLoop('breath'); }
      }
    },
    end(F, M) { M.data.h?.end(); F.stopLoop('breath'); },
  },
  // ---------------- 09 龙息连珠：双爪交替推出灵弹（一阶段 3 枚：瞄现在、有限预判、现在；二阶段 5 枚扇形）----------------
  orbs: {
    no: '09', name: '龙息连珠', clip: (F) => (F.phase === 2 ? 'orbs5' : 'orbs3'), cd: 7, block: true, parry: true, interrupt: 'heavy', windEnd: 0.75,
    ai: { close: 0.3, mid: 1.0, far: 2.2, front: true, minD: 4, maxD: 30 },
    doc: { wind: '0.75（双爪当胸聚气）', rec: '0.85', track: '每一发出手前都转向玩家（每秒 2.2 弧度以内）', hit: '灵弹飞行速度 15 米 / 秒、半径 0.6 米（14）；一阶段 3 发（瞄当前、按速度预判 0.7 倍、当前），二阶段 5 发扇形（-22°、+11°、0°、-11°、+22°）；撞上封印光墙即碎，无无限追踪', flags: '可格挡、可弹反', counter: '1.62–2.30（二阶段 1.80–2.48）' },
    update(F, M) {
      F.track(2.2);
      const shots = F.rig.marks().shots || [];
      F.charge(0, M.t1 < 0.75 ? M.t1 / 0.75 : 0.5); F.charge(1, M.t1 < 0.75 ? M.t1 / 0.75 : 0.5);
      if (M.t1 < 0.75) { F.fx.converge(F.rig.claw('l'), { n: 1, r: 0.8 }); F.fx.converge(F.rig.claw('r'), { n: 1, r: 0.8 }); }
      shots.forEach((ts, i) => {
        if (!F.at(M, ts)) return;
        const side = i % 2 ? 'l' : 'r', from = F.rig.claw(side).clone();
        const P = F.tgt.pos, tgt = new A3(P.x, P.y + 1.1, P.z);
        let fan = 0;
        if (F.phase === 2) fan = [-22, 11, 0, -11, 22][i] * D;
        else if (i === 1) { const fly = from.distanceTo(tgt) / 15; tgt.x += F.tgt.vel.x * fly * 0.7; tgt.z += F.tgt.vel.z * fly * 0.7; }
        F.orb(from, tgt, { fan, speed: 15, r: 0.6, dmg: 14 });
      });
    },
  },
  // ---------------- 10 天罚落雷：依次在地面落下三道雷印（二阶段五道），每道约 0.9 秒预警后落下分叉雷霆；雷印一经放下不再移动 ----------------
  thunder: {
    no: '10', name: '天罚落雷', clip: 'thunder', cd: 12, block: false, parry: false, interrupt: 'heavy', windEnd: 1.0, danger: true,
    ai: { close: 0.2, mid: 0.8, far: 2.0, front: false, minD: 3, maxD: 40 },
    doc: { wind: '1.00（右爪指天）', rec: '1.00', track: '不追踪（雷印各自定点）', hit: '雷印半径 2.4 米，放下 0.9 秒后落雷（22，麻痹 0.8 秒）；一阶段 3 道（间隔 0.45 秒），二阶段 5 道（间隔 0.3 秒）', flags: '不可格挡', counter: '2.60–3.60' },
    start(F, M) { F.danger(M); },
    update(F, M) {
      const S = M.data;
      F.charge(1, M.t1 < 1.0 ? M.t1 : M.t1 < 2.6 ? 1 : 0);
      if (M.t1 < 2.6 && M.t1 > 0.6) F.fx.stunFx({ pos: F.rig.claw('r').clone().setY(F.rig.claw('r').y - 1.2) });
      if (F.at(M, 0.4)) F.sfx('crackle', { at: F.root, dur: 1.0 });
      if (F.at(M, 1.05)) { S.n = F.phase === 2 ? 5 : 3; S.gap = F.phase === 2 ? 0.3 : 0.45; S.i = 0; S.next = 0; F.sfx('thunder', { at: F.root, gain: 0.35 }); }
      if (S.n && S.i < S.n) {
        S.next -= F.dt;
        if (S.next <= 0) {
          const P = F.tgt.pos;
          // 第一道落在玩家脚下；之后按玩家现在的位置（二阶段第 4、5 道偏向玩家移动的方向）
          const p = new A3(P.x, 0, P.z);
          if (S.i >= 3) { p.x += F.tgt.vel.x * 0.5; p.z += F.tgt.vel.z * 0.5; }
          F.strike(F.clampIn(p, 23.5), { r: 2.4, warn: 0.9, dmg: 22, react: 'stun' });
          S.i++; S.next = S.gap;
        }
      }
    },
  },
  // ---------------- 11 焚灵囚阵（二阶段）：围着玩家依次爆发三根焰柱，始终留一道缺口 ----------------
  prison: {
    no: '11', name: '焚灵囚阵', clip: 'prison', cd: 12, phase: 2, block: false, parry: false, interrupt: 'heavy', windEnd: 1.2, danger: true,
    ai: { close: 0.6, mid: 1.4, far: 1.3, front: false, minD: 0, maxD: 40 },
    doc: { wind: '1.20（双臂张开托起）', rec: '1.10', track: '前摇中转向玩家', hit: '以玩家脚下为心、半径 4.5 米的囚阵；三根焰柱（半径 2.2 米，中心距玩家 2.0 米，方位 180°、+100°、-100° 相对缺口）依次在 1.0 / 1.3 / 1.6 秒后爆发（26，击退）；缺口朝向场地中心一侧', flags: '不可格挡；只在二阶段', counter: '2.20–3.30' },
    start(F, M) { F.danger(M); },
    update(F, M) {
      if (M.t1 < 1.2) F.track(1.8);
      F.charge(0, M.t1 < 1.36 ? M.t1 / 1.36 : 0); F.charge(1, M.t1 < 1.36 ? M.t1 / 1.36 : 0);
      if (F.at(M, 0.2)) F.sfx('charge', { at: F.root, dur: 1.1, pitch: 0.7 });
      if (F.at(M, 1.36)) {
        const P = F.tgt.pos, c = new A3(P.x, 0, P.z);
        // 缺口：朝场地中心（玩家已在中心附近时朝远离龙的一侧）
        let g = Math.hypot(c.x, c.z) > 4 ? Math.atan2(-c.x, -c.z) : Math.atan2(c.x - F.root.x, c.z - F.root.z);
        F.fx.runeMark(c, 4.5, 2.2);
        [[Math.PI, 1.0], [100 * D, 1.3], [-100 * D, 1.6]].forEach(([da, wait]) => {
          const a = g + da, p = new A3(c.x + Math.sin(a) * 2.0, 0, c.z + Math.cos(a) * 2.0);
          F.pillar(F.clampIn(p, 23.5), { r: 2.2, warn: wait, dmg: 26, react: 'knockback' });
        });
        F.fx.impact(F.ahead(1.6), 2.0, { rocks: 4, dust: 8, scorch: false, light: 30 });
        F.sfx('slam', { at: F.root, gain: 0.5 });
      }
    },
  },
  // ---------------- 12 灭世龙怒（二阶段）：长蓄力（可被失衡打断）→ 扩散冲击环 → 两次间隔落雷 ----------------
  apocalypse: {
    no: '12', name: '灭世龙怒', clip: 'apocalypse', cd: 26, phase: 2, block: false, parry: false, interrupt: 'break', windEnd: 2.2, danger: true, charging: [0, 2.2],
    ai: { close: 0.8, mid: 1.2, far: 1.2, front: false, minD: 0, maxD: 40, minGap: 14 },
    doc: { wind: '2.20（蓄力，期间架势累积 ×1.6，失衡即打断）', rec: '1.80', track: '不追踪', hit: '冲击环自 2 米扩至 16 米（1.1 秒，环带宽 1.8 米，30，击退；跃起或闪身可避）→ 两道落雷各自预警 0.9 秒（半径 2.6 米，28，麻痹）', flags: '不可格挡；只能被失衡打断', counter: '3.80–5.60' },
    start(F, M) { F.danger(M); },
    update(F, M) {
      const S = M.data;
      const k = Math.min(1, M.t1 / 2.2);
      if (M.t1 < 2.4) { F.charge(2, k); F.charge(0, k); F.charge(1, k); }
      else { F.charge(2, 0); F.charge(0, 0); F.charge(1, 0); }
      if (M.t1 < 2.2) { F.fx.converge(F.rig.chest(), { n: 3, r: 2.6, size: 0.24, life: 0.5 }); F.arena.setGlow(0.35 + k * 1.4); }
      if (F.at(M, 0.05)) { F.fx.bigRune(F.root, 7, F.realT(0.05, 2.45)); F.sfx('charge', { at: F.root, dur: F.realT(0.05, 2.2), pitch: 0.6 }); F.sfx('rise', { dur: 2.0 }); }
      if (!M.tele.ring && M.t1 >= 0.4) { M.tele.ring = F.fx.tele({ shape: 'ring', pos: F.root, r0: 2.0, r: 16, danger: true, dur: F.realT(0.4, 2.42) }); M.tele.ring.set('uA', 0.7); }
      if (F.at(M, 2.1)) F.strike(F.clampIn(F.tgt.pos.clone().setY(0), 23.5), { r: 2.6, warn: 0.9, dmg: 28, react: 'stun' });
      if (F.at(M, 2.42)) {
        M.tele.ring?.remove(0.3);
        F.ring(F.root.clone(), { r0: 2.0, r1: 16, dur: 1.1, w: 1.8, h: 2.4, dmg: 30, react: 'knockback', block: false, jumpable: true });
        F.fx.roarWave(F.root, { r: 10 }); F.fx.shake(0.45); F.fx.flash(0xe6d8ff, 0.3);
        F.sfx('roar', { at: F.root, dur: 1.6, pitch: 0.85 }); F.sfx('boom', { at: F.root });
        F.arena.flash(1); F.arena.setGlow(0.9);
      }
      if (F.at(M, 2.8)) F.strike(F.clampIn(F.tgt.pos.clone().setY(0), 23.5), { r: 2.6, warn: 0.9, dmg: 28, react: 'stun' });
      void S;
    },
    end(F) { F.arena.setGlow(F.phase === 2 ? 0.9 : 0.6); },
  },
};

export const MOVE_ORDER = ['claw1', 'claw2', 'slam', 'tailsweep', 'combo3', 'charge', 'jump', 'breath', 'orbs', 'thunder', 'prison', 'apocalypse'];
