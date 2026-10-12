// 第十六轮：第五十层的四段过场——出场（A）、阶段转换（B）、击败（C）、失败处决（D）。
// 每段由「镜头段」（shots：起止机位，机位可以是随骨骼走的函数；两段之间即切镜）与「事件」（events：[时刻, 函数]）组成，另有 tick（每帧）
// 与 finish（结束或跳过时一律执行：把龙、场地、玩家摆到这段过场结束时应有的样子，可重复执行）。
// 过场中：禁止一切输入（game.lock）、玩家不受伤害、镜头由 game.freeCam 接管；黑边、标题、「空格跳过」由 ui/boss50Hud.js 画。
// 跳过：空格 / Esc / Enter / E（开场 0.3 秒后）——直接执行 finish，再接回游戏镜头与操作。
import * as THREE from 'three';
import { T50 } from '../world/tower50.js';
import { C50 } from './boss50Fx.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sm = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class Boss50Cine {
  constructor(F) { this.F = F; this.cur = null; this.slow = 1; this.shakeK = 0; }
  get active() { return !!this.cur; }

  play(name, onEnd) {
    const F = this.F;
    if (this.cur) this.stop(true);
    const def = SCENES[name](F, this);
    this.cur = { name, def, t: 0, i: 0, onEnd, ev: def.events.slice().sort((a, b) => a[0] - b[0]) };
    this.slow = 1; this.shakeK = 0;
    F.g.lock = true;
    F.releaseInputs();
    F.Mv.reset();
    F.C.playerUnit.invuln = 999;
    F.hud.cine(true, def.skippable !== false);
    this.update(0);
  }
  update(dt) {
    const c = this.cur;
    if (!c) return;
    c.t += dt;
    while (c.i < c.ev.length && c.ev[c.i][0] <= c.t) { const e = c.ev[c.i++]; try { e[1](); } catch (err) { console.warn('过场事件出错', err); } }
    try { c.def.tick?.(c.t, dt); } catch (err) { console.warn(err); }
    this.shakeK = Math.max(0, this.shakeK - dt * 2.2);
    const cam = this.camAt(c.t);
    if (cam) {
      if (this.shakeK > 0.001) cam.pos.add(_a.set((Math.random() - 0.5) * this.shakeK, (Math.random() - 0.5) * this.shakeK, (Math.random() - 0.5) * this.shakeK));
      this.F.g.freeCam = cam;
    }
    if (c.t >= c.def.dur) this.end(false);
  }
  shake(k) { this.shakeK = Math.max(this.shakeK, k * (this.F.fx?.fxk ?? 1)); }
  camAt(t) {
    const S = this.cur.def.shots;
    let s = S[S.length - 1];
    for (const x of S) if (t >= x.t0 && t < x.t1) { s = x; break; }
    const u = (s.ease || sm)(clamp01((t - s.t0) / Math.max(1e-3, s.t1 - s.t0)));
    const ev = (p) => (typeof p === 'function' ? p() : p);
    const p0 = ev(s.from.pos), p1 = ev(s.to?.pos ?? s.from.pos), a0 = ev(s.from.at), a1 = ev(s.to?.at ?? s.from.at);
    const pos = p0.clone().lerp(p1, u);
    // 随龙、随玩家定的机位（阶段转换、击败、处决发生在场上任何地方）：不出战斗圈，免得落进柱子、石台后面
    if (this.cur.def.clampCam !== false) { const r = Math.hypot(pos.x, pos.z), lim = 23.6; if (r > lim) { pos.x *= lim / r; pos.z *= lim / r; } pos.y = Math.max(0.4, pos.y); }
    return { pos, at: a0.clone().lerp(a1, u) };
  }
  skip() {
    const c = this.cur;
    if (!c || c.def.skippable === false || c.t < 0.3) return;
    this.end(true);
  }
  end(skipped) {
    const c = this.cur, F = this.F;
    if (!c) return;
    this.cur = null;
    try { c.def.finish?.(skipped); } catch (err) { console.warn('过场收尾出错', err); }
    this.slow = 1;
    F.g.freeCam = null;
    F.g.lock = false;
    F.hud.cine(false); F.hud.title(null);
    F.C.playerUnit.invuln = 0.6;
    F.cameraBehind?.();
    F.releaseInputs();
    c.onEnd?.();
  }
  // 中止（重试、退出时）：不回调
  stop(silent = true) {
    const c = this.cur, F = this.F;
    if (!c) return;
    this.cur = null;
    if (!silent) { try { c.def.finish?.(true); } catch (e) { /* 忽略 */ } }
    this.slow = 1;
    F.g.freeCam = null; F.g.lock = false;
    F.hud.cine(false); F.hud.title(null);
    F.C.playerUnit.invuln = 0;
  }
}

// ---------- 小工具 ----------
// 以 base 为原点、yaw 为朝向的局部坐标（x 向左、y 向上、z 向前）
function loc(base, yaw, x, y, z) { const c = Math.cos(yaw), s = Math.sin(yaw); return V(base.x + x * c + z * s, base.y + y, base.z - x * s + z * c); }
const lerpTo = (u, o, k) => o + (k - o) * u;

// =====================================================================================
const SCENES = {
  // ---------------- A 出场（≈11.8 秒）：封印亮起 → 镜头掠过巨柱与封印台 → 龙君抬头、握爪、展尾、起身展翼、挣断锁链 → 跃下封印台落地扬尘 →
  //                    面部与灵纹特写、名号 → 回到游戏镜头，一阶段血条 ----------------
  intro(F, D) {
    const R = F.rig, A = F.arena, P = F.P, S = F.sound;
    const P0 = P.pos.clone(), perch = V(T50.perch.x, T50.dais.y, T50.perch.z), land = V(T50.land.x, 0, T50.land.z);
    const head = () => R.bonePos('head_x', V(0, 0, 0)), chest = () => R.chest(V(0, 0, 0));
    const jump = { t: 0, on: false };
    P.heading = Math.atan2(-P0.x, -P0.z - 14);
    const behindP = (back, up, side) => { const yaw = Math.atan2(land.x - P0.x, land.z - P0.z); return loc(P0, yaw, side, up, -back); };
    return {
      dur: 11.8, clampCam: false,           // 出场的机位是固定的（南门、柱间、封印台前），都已核过
      shots: [
        { t0: 0, t1: 2.2, from: { pos: behindP(3.2, 1.5, -1.4), at: loc(P0, Math.atan2(-P0.x, -P0.z), 0, 0.4, 8) }, to: { pos: behindP(4.8, 4.6, -2.2), at: V(0, 0.4, -3) } },
        { t0: 2.2, t1: 4.2, from: { pos: V(-22, 6.5, 7), at: V(-8, 3.0, -20) }, to: { pos: V(-11.5, 5.4, -15), at: V(0, 3.6, -29) } },
        { t0: 4.2, t1: 5.45, from: { pos: V(0.6, 3.5, -19.2), at: V(0, 3.4, -28.6) }, to: { pos: V(0.4, 3.7, -20.0), at: () => head() } },
        { t0: 5.45, t1: 6.05, from: { pos: () => R.claw('r', V()).add(V(-1.3, 0.7, 1.9)), at: () => R.claw('r', V()) } },
        { t0: 6.05, t1: 7.4, from: { pos: V(0.4, 3.8, -20.2), at: () => head() }, to: { pos: V(-0.6, 4.4, -21.6), at: () => chest().add(V(0, 0.8, 0)) } },
        { t0: 7.4, t1: 8.9, from: { pos: V(14.5, 4.2, -17), at: () => chest() }, to: { pos: V(13, 3.4, -11.5), at: () => chest() } },
        { t0: 8.9, t1: 11.0, from: { pos: () => loc(land, R.yaw, 2.2, 3.9, 6.8), at: () => head().add(_b.set(0, -0.35, 0)) }, to: { pos: () => loc(land, R.yaw, 1.5, 4.2, 5.7), at: () => head().add(_b.set(0, -0.25, 0)) } },
        { t0: 11.0, t1: 11.8, from: { pos: () => loc(land, R.yaw, 1.5, 4.2, 5.7), at: () => head().add(_b.set(0, -0.25, 0)) }, to: { pos: () => F.gameCam().pos, at: () => F.gameCam().at } },
      ],
      events: [
        [0, () => { A.setGate(true); A.reveal(P0, 26); A.setGlow(1.2); S.play('seal', { dur: 3 }); S.play('rise', { dur: 2.2, gain: 0.6 }); R.U.uEmK.value = 0.7; }],
        [1.2, () => { A.setBarrier(true); }],
        [2.6, () => S.play('growl', { at: perch, dur: 1.2, gain: 0.7 })],
        [4.2, () => { R.play('awaken', { fade: 0.2, speed: 1.25 }); R.look.w = 0; }],
        [4.2 + 0.8, () => { S.play('growl', { at: perch, dur: 0.8 }); R.U.uEmK.value = 1.2; }],
        [4.2 + 1.28, () => { S.play('chains', { at: perch, gain: 0.5 }); F.fx.converge(R.claw('r'), { n: 8, r: 1.2 }); R.hot[1].k = 0.8; }],
        [4.2 + 1.84, () => { S.play('whoosh', { at: perch, dur: 0.6, pitch: 0.6 }); R.hot[1].k = 0; }],
        [7.4, () => { A.breakChains(F.fx); S.play('chains', { at: perch, gain: 1.2 }); S.play('roar', { at: perch, dur: 1.0, pitch: 1.2, gain: 0.5 }); D.shake(0.15); }],
        [7.45, () => R.play('jump_wind', { fade: 0.15, from: 0.75, speed: 1.3 })],
        [7.95, () => { R.play('jump_air', { fade: 0.2 }); jump.on = true; jump.t = 0; R.setYaw(0); F.fx.dust(perch, 10, 2.4); S.play('whoosh', { at: perch, dur: 0.7, pitch: 0.5, gain: 1.2 }); }],
        [8.6 - (R.marks('jump_land').lead ?? 0), () => R.play('jump_land', { fade: 0.1 })],     // 第十八轮：触地前开始砸爪
        [8.6, () => {
          jump.on = false; R.root.position.copy(land);
          F.fx.impact(land, 4.2, { rocks: 18, dust: 20, light: 60 }); D.shake(0.5); S.play('slam', { at: land, gain: 1.1 }); A.flash(0.8);
        }],
        [9.25, () => R.play('roar', { fade: 0.2, speed: 1.1 })],
        [9.25 + 0.64, () => {
          F.fx.roarWave(land, { r: 10 }); D.shake(0.35); S.play('roar', { at: land, dur: 2.0 }); R.U.uEmK.value = 2.6; R.U.uRim.value = 0.4;
          F.hud.title(F.bossName(), '通天塔 · 第五十层守关', 'boss'); S.play('gong', { gain: 0.8 });
        }],
        [11.0, () => { F.hud.title(null); R.U.uEmK.value = 1.4; R.U.uRim.value = 0.18; }],
      ],
      tick(t, dt) {
        if (jump.on) {
          jump.t += dt;
          const u = clamp01(jump.t / 0.65), h = Math.sin(u * Math.PI) * 4.0;
          R.root.position.set(lerpTo(u, perch.x, land.x), lerpTo(u, perch.y, 0) + h, lerpTo(u, perch.z, land.z));
        }
        // 二次方：发光遮罩从刚才的高值慢慢落回
        if (t > 9.9 && t < 11) R.U.uEmK.value += (1.6 - R.U.uEmK.value) * Math.min(1, dt * 1.5);
      },
      finish() {
        A.setGate(true); A.setBarrier(true); A.reveal(null); A.setGlow(0.6); A.breakChains(null, true);
        R.root.position.copy(land); R.setYaw(Math.atan2(P.pos.x - land.x, P.pos.z - land.z));
        R.U.uEmK.value = 1.4; R.U.uRim.value = 0.18; R.hot.forEach((h) => { h.k = 0; });
        F.hud.title(null);
      },
    };
  },

  // ---------------- B 阶段转换（≈7.3 秒）：踉跄单膝跪地 → 封印纹裂开、紫焰涌出（爪、胸腹、头三处特写）→ 怒吼起身吹散尘土 →
  //                    「二阶段 · 龙怒觉醒」与二阶段血条 → 回到玩家 ----------------
  phase(F, D) {
    const R = F.rig, A = F.arena, S = F.sound, P = F.P;
    const R0 = F.root.clone().setY(0);
    const yaw = R.yaw;
    const chest = () => R.chest(V()), head = () => R.bonePos('head_x', V()), clawL = () => R.claw('l', V());
    const ramp = { crack: null, col: null };
    const mp0 = F.Mv.mp;                         // 转阶段期间玩家的灵力（与气血）都不回复
    P.heading = Math.atan2(R0.x - P.pos.x, R0.z - P.pos.z);
    return {
      dur: 7.3,
      shots: [
        { t0: 0, t1: 1.1, from: { pos: loc(R0, yaw, -5.6, 2.4, 2.4), at: () => chest() }, to: { pos: loc(R0, yaw, -5.0, 2.0, 3.0), at: () => chest() } },
        { t0: 1.1, t1: 1.75, from: { pos: () => clawL().add(_b.set(0, 0.6, 0)).add(loc(V(0, 0, 0), yaw, 1.3, 0, 1.6)), at: () => clawL() } },
        { t0: 1.75, t1: 2.4, from: { pos: () => chest().add(loc(V(0, 0, 0), yaw, 0.9, 0.2, 2.8)), at: () => chest() } },
        { t0: 2.4, t1: 3.1, from: { pos: () => head().add(loc(V(0, 0, 0), yaw, -0.7, 0.1, 2.3)), at: () => head() } },
        { t0: 3.1, t1: 4.3, from: { pos: loc(R0, yaw, 1.5, 2.4, 5.5), at: () => chest() }, to: { pos: loc(R0, yaw, 2.4, 3.2, 9.0), at: () => chest() } },
        { t0: 4.3, t1: 6.6, from: { pos: loc(R0, yaw, -1.6, 1.3, 7.6), at: () => head() }, to: { pos: loc(R0, yaw, -1.9, 1.1, 8.4), at: () => head() } },
        { t0: 6.6, t1: 7.3, from: { pos: loc(R0, yaw, -1.9, 1.1, 8.4), at: () => head() }, to: { pos: () => F.gameCam().pos, at: () => F.gameCam().at } },
      ],
      events: [
        [0, () => { R.play('p2_kneel', { fade: 0.14 }); S.play('stagger', { at: R0 }); F.fx.flash(0xfff1c8, 0.25); A.flash(1); D.shake(0.2); R.look.w = 0; R.sway.w = 0.4; }],
        [0.9, () => { F.fx.dust(R0, 12, 2.6); S.play('thump', { at: R0 }); }],
        [1.1, () => { ramp.crack = 0; S.play('crackle', { at: R0, dur: 1.9 }); S.play('charge', { at: R0, dur: 1.9, pitch: 0.7 }); A.setCrack(1); A.setGlow(1.2, C50.p2); }],
        [3.1, () => { R.play('p2_rise', { fade: 0.15 }); ramp.col = 0; }],
        [4.3, () => R.play('roar', { fade: 0.15 })],
        [5.0, () => {
          F.fx.roarWave(R0, { r: 12, color: C50.p2 }); D.shake(0.45); F.fx.flash(0xe6d8ff, 0.3); S.play('roar', { at: R0, dur: 2.2, pitch: 0.9 }); S.play('boom', { at: R0, gain: 0.6 });
          F.hud.title('二阶段 · 龙怒觉醒', F.bossName(), 'p2'); S.play('gong', { gain: 0.9 }); F.hud.setPhase(2, true, true);
        }],
        [6.6, () => F.hud.title(null)],
      ],
      tick(t, dt) {
        F.Mv.mp = Math.min(F.Mv.mp, mp0);
        if (ramp.crack != null) {
          ramp.crack = Math.min(1, ramp.crack + dt / 1.8);
          R.U.uCrack.value = ramp.crack; R.U.uEmK.value = 1.4 + ramp.crack * 0.8;
          if (Math.random() < 0.9) F.fx.embers(F.bodyPoints(), 2.5);
        }
        if (ramp.col != null) {
          ramp.col = Math.min(1, ramp.col + dt / 0.8);
          R.U.uEnergy.value.copy(new THREE.Color(C50.p1).lerp(new THREE.Color(C50.p2), ramp.col)); R.U.uPhase.value = ramp.col; R.U.uRim.value = 0.18 + 0.27 * ramp.col;
        }
      },
      finish() {
        F.Mv.mp = Math.min(F.Mv.mp, mp0);
        F.applyPhase(2);
        R.sway.w = 1; R.look.w = 0;
        R.play('idle', { fade: 0.2 });
        F.hud.title(null);
      },
    };
  },

  // ---------------- C 击败（≈9.6 秒）：最后一击放慢 → 踉跄后退、跪地、侧倒，尾渐渐不动 → 灵光褪去、封印合拢（光墙落下、南门开）→
  //                    龙身化作灵光点散去，聚成三颗奖励灵珠 → 灵珠飞入玩家（奖励在此入账，只一次）→ 结算 ----------------
  victory(F, D) {
    const R = F.rig, A = F.arena, S = F.sound, P = F.P;
    const R0 = F.root.clone().setY(0), yaw0 = R.yaw;
    const toP = Math.atan2(P.pos.x - R0.x, P.pos.z - R0.z);
    const chest = () => R.chest(V()), G = R0.clone().add(V(0, 3.4, 0));
    const st = { fade: null, dis: null, orbs: [], fly: null, credited: false };
    const orbit = (t) => { const a = toP + 0.5 + (t - 0.7) * 0.12; return V(R0.x + Math.sin(a) * 11, 4.2, R0.z + Math.cos(a) * 11); };
    const pChest = () => P.pos.clone().add(V(0, 1.3, 0));
    return {
      dur: 9.6,
      shots: [
        { t0: 0, t1: 0.7, from: { pos: () => P.pos.clone().add(loc(V(0, 0, 0), toP, 1.1, 1.8, -1.8)), at: () => chest() } },
        { t0: 0.7, t1: 3.9, from: { pos: () => orbit(0.7), at: () => chest() }, to: { pos: () => orbit(3.9), at: () => chest() } },
        { t0: 3.9, t1: 5.8, from: { pos: loc(R0, yaw0, -6.2, 1.1, 3.2), at: R0.clone().add(V(0, 0.8, 0)) }, to: { pos: loc(R0, yaw0, -6.8, 1.6, 4.4), at: R0.clone().add(V(0, 0.9, 0)) } },
        { t0: 5.8, t1: 8.2, from: { pos: loc(R0, yaw0, -8, 2.2, 2), at: G }, to: { pos: loc(R0, yaw0, -7, 6.2, 5.5), at: G } },
        { t0: 8.2, t1: 9.6, from: { pos: () => P.pos.clone().add(loc(V(0, 0, 0), toP, -1.4, 2.0, -3.6)), at: () => G.clone().lerp(pChest(), 0.5) }, to: { pos: () => P.pos.clone().add(loc(V(0, 0, 0), toP, -1.6, 2.2, -4.2)), at: () => pChest() } },
      ],
      events: [
        [0, () => { D.slow = 0.25; F.fx.flash(0xf4ecff, 0.4); D.shake(0.3); S.play('hit', { at: R0, big: true }); R.U.uFlash.value = 1; R.look.w = 0; }],
        [0.3, () => S.play('roar', { at: R0, dur: 1.5, pitch: 0.72, gain: 0.8 })],
        [0.7, () => { D.slow = 1; R.play('death', { fade: 0.12 }); }],
        [0.7 + 0.8, () => { F.fx.dust(R0, 8, 2); S.play('thump', { at: R0 }); }],
        [0.7 + 2.3, () => { F.fx.dust(R0, 16, 3.2); D.shake(0.3); S.play('slam', { at: R0, gain: 0.7 }); }],
        [3.9, () => { st.fade = 0; S.play('seal', { dur: 2.6, close: true }); A.setGlow(1.6); A.setCrack(0); }],
        [5.0, () => { A.setBarrier(false); A.setGlow(0.5, C50.p1); }],
        [5.4, () => A.setGate(false)],
        [5.8, () => { st.dis = 0; R.mesh.castShadow = false; S.play('rise', { dur: 2.4 }); }],
        [6.8, () => { for (let i = 0; i < 3; i++) st.orbs.push(F.fx.rewardOrb(G.clone().add(V((i - 1) * 1.1, Math.abs(i - 1) * -0.3, 0)))); S.play('chime', { notes: [784, 988, 1175], step: 0.12 }); }],
        [8.2, () => { st.fly = 0; st.from = st.orbs.map((o) => o.m.position.clone()); }],
        [9.0, () => { st.credited = true; const info = F.grantRewards(); S.play('chime', {}); F.hud.toast50(info.debug ? '调试：不计入记录' : info.first ? '首通奖励已入行囊' : '奖励已入行囊'); for (const o of st.orbs) o.end(); st.orbs.length = 0; }],
      ],
      tick(t, dt) {
        if (st.fade != null && st.fade < 1) {
          st.fade = Math.min(1, st.fade + dt / 1.6);
          const k = 1 - st.fade;
          R.U.uPhase.value = Math.min(R.U.uPhase.value, k); R.U.uCrack.value = Math.min(R.U.uCrack.value, k); R.U.uEmK.value = 1.4 * k; R.U.uRim.value = 0.2 * k;
          R.sway.w = k;
        }
        if (st.dis != null && st.dis < 1) {
          st.dis = Math.min(1, st.dis + dt / 2.4);
          R.U.uDissolve.value = st.dis;
          F.fx.motes(F.bodyPoints(), 4, C50.p1, G);
          if (st.dis >= 1) R.mesh.visible = false;
        }
        if (st.fly != null && st.orbs.length) {
          st.fly = Math.min(1, st.fly + dt / 0.8);
          const u = sm(st.fly), dst = pChest();
          st.orbs.forEach((o, i) => { const a = st.from[i]; o.m.position.set(lerpTo(u, a.x, dst.x), lerpTo(u, a.y, dst.y) + Math.sin(u * Math.PI) * 1.4, lerpTo(u, a.z, dst.z)); });
        }
      },
      finish() {
        R.U.uDissolve.value = 1; R.mesh.visible = false; R.sway.w = 0;
        A.setBarrier(false); A.setGate(false); A.setCrack(0); A.setGlow(0.5, C50.p1);
        for (const o of st.orbs) o.end();
        st.orbs.length = 0;
        if (!st.credited) F.grantRewards();
        F.hud.title(null);
      },
    };
  },

  // ---------------- D 失败处决（≈6.6 秒）：玩家倒地 → 龙君逼近、俯身以右爪按住（玩家挣扎、渐弱）→ 仰头蓄息 → 俯首吐息 → 震屏、淡出 → 失败界面 ----------------
  exec(F, D) {
    const R = F.rig, S = F.sound, P = F.P, A = F.arena;
    const st = { walk: null, pinRoot: null, yaw: 0, struggle: 0, lying: false };
    const pChest = () => { const b = F.playerChest(); return b; };
    const head = () => R.bonePos('head_x', V());
    const CLAW = V(-0.33, 0.30, 1.66);           // 按住时右爪尖在龙的本地坐标（x 向左、z 向前；试载页按 exec 0.9 秒实测）
    return {
      dur: 6.6,
      shots: [
        { t0: 0, t1: 0.9, from: { pos: () => P.pos.clone().add(loc(V(0, 0, 0), P.heading, 2.6, 1.3, 0.6)), at: () => P.pos.clone().add(V(0, 0.5, 0)) } },
        { t0: 0.9, t1: 2.3, from: { pos: () => st.camLow, at: () => head() }, to: { pos: () => st.camLow2, at: () => head() } },
        { t0: 2.3, t1: 4.2, from: { pos: () => st.side, at: () => st.mid }, to: { pos: () => st.side2, at: () => st.mid } },
        { t0: 4.2, t1: 5.6, from: { pos: () => st.pov, at: () => head() }, to: { pos: () => st.pov2, at: () => head() } },
        { t0: 5.6, t1: 6.6, from: { pos: () => st.top, at: () => st.chest0 }, to: { pos: () => st.top2, at: () => st.chest0 } },
      ],
      events: [
        [0, () => {
          P.heading = Math.atan2(F.root.x - P.pos.x, F.root.z - P.pos.z);       // 面朝龙君向后倒（龙自脚边逼近）
          P.char.anim.play('Hit_Knockback', { from: 0, to: 0.83, speed: 0.9, hold: true, fade: 0.05 });
          S.play('hurt', { at: P.pos }); S.play('defeat', {}); R.look.w = 0;
          A.setGlow(0.9);
        }],
        [0.9, () => {
          // 龙君走到按住玩家的位置：右爪尖落在玩家胸口
          const c = pChest();
          st.chest0 = c.clone();
          const fromDir = Math.atan2(F.root.x - c.x, F.root.z - c.z);
          st.yaw = fromDir + Math.PI;                                   // 面朝玩家
          // 根 = 胸口 − R(yaw)·CLAW
          const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
          const ox = CLAW.x * cy + CLAW.z * sy, oz = -CLAW.x * sy + CLAW.z * cy;
          st.pinRoot = F.clampIn(V(c.x - ox, 0, c.z - oz), 23);
          const fwd = V(Math.sin(st.yaw), 0, Math.cos(st.yaw));
          st.walkFrom = st.pinRoot.clone().addScaledVector(fwd, -3.0);
          R.root.position.copy(st.walkFrom); R.setYaw(st.yaw);
          R.play('walk', { fade: 0.2, speed: 1.1 });
          st.walk = 0;
          const away = fwd.clone();                                 // 自龙经玩家再往外（镜头放在玩家这一侧，不进龙身）
          const side = V(Math.cos(st.yaw), 0, -Math.sin(st.yaw));   // 龙的左手边（负为右手边：按住玩家的是右爪）
          st.camLow = c.clone().addScaledVector(away, 3.6).addScaledVector(side, -1.4).add(V(0, 1.0, 0)); st.camLow2 = c.clone().addScaledVector(away, 3.9).addScaledVector(side, -1.6).add(V(0, 0.9, 0));
          const mid = st.pinRoot.clone().lerp(c, 0.5); st.mid = mid.clone().add(V(0, 1.0, 0));
          st.side = mid.clone().addScaledVector(side, -5.2).addScaledVector(fwd, 2.6).add(V(0, 3.2, 0)); st.side2 = mid.clone().addScaledVector(side, -4.6).addScaledVector(fwd, 2.2).add(V(0, 2.8, 0));
          // 仰拍龙首：在玩家脚边偏龙的右前方，躲开右臂与翼
          st.pov = c.clone().addScaledVector(away, 2.4).addScaledVector(side, -2.2).add(V(0, 0.8, 0)); st.pov2 = st.pov.clone().addScaledVector(away, 0.3).add(V(0, 0.2, 0));
          st.top = c.clone().addScaledVector(away, 2.2).add(V(0, 7.5, 0)).addScaledVector(side, -1.5); st.top2 = st.top.clone().add(V(0, 2.0, 0));
          S.play('step', { at: st.walkFrom });
        }],
        [2.2, () => { st.walk = null; R.root.position.copy(st.pinRoot); R.play('exec', { fade: 0.2 }); }],
        [2.2 + 0.9, () => { D.shake(0.3); S.play('slam', { at: st.chest0, gain: 0.55 }); S.play('growl', { at: st.pinRoot, dur: 1.0 }); F.fx.dust(st.chest0, 8, 1.2); st.struggle = 1; }],
        [2.2 + 2.8, () => { R.hot[2].k = 1; S.play('charge', { at: st.pinRoot, dur: 0.75, pitch: 0.9 }); st.struggle = 0; }],
        [2.2 + 3.55, () => {
          R.hot[2].k = 0;
          F.fx.flamePillar(st.chest0.clone().setY(0), { r: 1.7, h: 4.5, life: 0.9 });
          F.fx.impact(st.chest0.clone().setY(0), 2.2, { rocks: 8, dust: 12, light: 80 });
          F.fx.flash(0xf0e0ff, 0.55); D.shake(0.6); S.play('flameBurst', { at: st.chest0 }); S.play('boom', { at: st.chest0 });
        }],
        [5.8, () => { const f = document.querySelector('#fade'); f.classList.add('dark', 'on'); }],
      ],
      tick(t, dt) {
        if (st.walk != null) {
          st.walk += dt;
          const u = clamp01(st.walk / 1.3);
          R.root.position.lerpVectors(st.walkFrom, st.pinRoot, u);
          if (u >= 1) { st.walk = null; R.play('idle', { fade: 0.2 }); }
        }
        if (st.struggle && t > 3.1 && t < 4.6) {
          // 挣扎：起身的前一小段与倒下的末一小段来回切换，越来越弱
          st.sT = (st.sT ?? 0) - dt;
          if (st.sT <= 0) {
            st.sT = 0.42 + (t - 3.1) * 0.15;
            st.up = !st.up;
            if (st.up) P.char.anim.play('LayToIdle', { from: 0, to: 0.24 - (t - 3.1) * 0.08, speed: 0.75, hold: true, fade: 0.18 });
            else P.char.anim.play('Hit_Knockback', { from: 0.72, to: 0.83, speed: 0.6, hold: true, fade: 0.18 });
          }
        }
        if (t > 2.2 + 2.8 && t < 2.2 + 3.55) F.fx.converge(R.mouth(V()), { n: 3, r: 1.4, size: 0.22 });
      },
      finish() {
        R.hot.forEach((h) => { h.k = 0; });
        F.hud.title(null);
        const f = document.querySelector('#fade'); f.classList.add('dark', 'on');
      },
    };
  },
};
