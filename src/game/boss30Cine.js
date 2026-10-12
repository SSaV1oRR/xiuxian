// 第二十四轮：第三十层的四段过场——出场、阶段转换、击败、失败。
// 与第五十层同一套：镜头段（shots：起止机位，可以是随骨骼走的函数）+ 事件（events：[时刻, 函数]）+ 每帧 tick + finish
// （结束或跳过时一律执行：把 Boss、场地、玩家摆到这段过场结束时应有的样子，可重复执行）。
// 过场中：禁止一切输入（game.lock）、玩家不受伤害、镜头由 game.freeCam 接管；黑边、标题、「空格跳过」由 ui/boss30Hud.js 画。
// 跳过：重复游玩时（这段过场看过一次之后）空格 / Esc / Enter / E 可跳过（开场 0.3 秒后），直接执行 finish 提交最终状态。
import * as THREE from 'three';
import { T30 } from '../world/tower30.js';
import { BOSS30, CONFIG30, SIZE30 } from './boss30Config.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sm = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const _a = new THREE.Vector3();
function loc(base, yaw, x, y, z) { const c = Math.cos(yaw), s = Math.sin(yaw); return V(base.x + x * c + z * s, base.y + y, base.z - x * s + z * c); }
// 第二十六轮：剑尊放大到 SIZE30 倍——围着它的机位（离它多远、多高）跟着放大
const Z = SIZE30;
function bloc(base, yaw, x, y, z) { return loc(base, yaw, x * Z, y * Z, z * Z); }

export class Boss30Cine {
  constructor(F) { this.F = F; this.cur = null; this.slow = 1; this.shakeK = 0; this.forceSkip = false; }
  get active() { return !!this.cur; }
  // 看过的过场可跳过（记在存档里）；测试可强制
  skippable(name) { return this.forceSkip || !!this.F.record().seen?.[name]; }
  play(name, onEnd) {
    const F = this.F;
    if (this.cur) this.stop(true);
    const def = SCENES[name](F, this);
    const skip = def.skippable !== false && this.skippable(name);
    this.cur = { name, def, t: 0, i: 0, onEnd, skip, ev: def.events.slice().sort((a, b) => a[0] - b[0]) };
    this.slow = 1; this.shakeK = 0;
    F.g.lock = true;
    F.releaseInputs();
    F.Mv.reset();
    F.C.playerUnit.invuln = 999;
    F.hud.cine(true, skip);
    F.log('cine', { name, skip });
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
    pos.y = Math.max(0.35, pos.y);
    const r = Math.hypot(pos.x, pos.z), lim = CONFIG30.arena.R + 9;
    if (r > lim && this.cur.def.clampCam !== false) { pos.x *= lim / r; pos.z *= lim / r; }
    return { pos, at: a0.clone().lerp(a1, u) };
  }
  skip() {
    const c = this.cur;
    if (!c || !c.skip || c.t < 0.3) return;
    this.F.log('cineSkip', { name: c.name, t: +c.t.toFixed(2) });
    this.end(true);
  }
  end(skipped) {
    const c = this.cur, F = this.F;
    if (!c) return;
    this.cur = null;
    try { c.def.finish?.(skipped); } catch (err) { console.warn('过场收尾出错', err); }
    const R = F.record(); (R.seen ||= {})[c.name] = true; F.g.state.save();
    this.slow = 1;
    F.g.freeCam = null;
    F.g.lock = false;
    F.hud.cine(false); F.hud.title(null);
    F.C.playerUnit.invuln = 0.6;
    F.cameraBehind?.();
    F.releaseInputs();
    F.log('cineEnd', { name: c.name, skipped });
    c.onEnd?.();
  }
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

const SCENES = {
  // ---------------- 出场（7.2 秒）：火盆一只只熄灭 → 台心的余烬翻涌、火墙升起封住出口 → 剑尊由余烬自脚下凝成 → 缓缓拔剑 → 名号 → 回到玩家 ----------------
  intro(F, D) {
    const R = F.rig, A = F.arena, P = F.P, S = F.sound;
    const B0 = V(T30.boss.x, 0, T30.boss.z), P0 = P.pos.clone();
    const toB = Math.atan2(B0.x - P0.x, B0.z - P0.z);
    P.heading = toB;
    const st = { form: null, draw: null };
    const head = () => R.head(V()), chest = () => R.chest(V()), hand = () => R.bonePos('hand_r', V());
    return {
      dur: CONFIG30.cine.intro,
      shots: [
        { t0: 0, t1: 1.4, from: { pos: loc(P0, toB, -1.2, 1.7, -3.2), at: B0.clone().add(V(0, 0.6 * Z, 0)) }, to: { pos: loc(P0, toB, -1.6, 2.3, -4.2), at: B0.clone().add(V(0, 0.8 * Z, 0)) } },
        { t0: 1.4, t1: 3.8, from: { pos: bloc(B0, 0, 2.6, 0.6, 5.2), at: B0.clone().add(V(0, 0.9 * Z, 0)) }, to: { pos: bloc(B0, 0, 2.0, 1.8, 4.4), at: () => chest() } },
        { t0: 3.8, t1: 5.6, from: { pos: bloc(B0, 0, -1.6, 1.3, 2.6), at: () => hand() }, to: { pos: bloc(B0, 0, -1.2, 1.7, 3.0), at: () => chest() } },
        { t0: 5.6, t1: 6.5, from: { pos: bloc(B0, 0, 0.5, 2.0, 3.6), at: () => head().add(V(0, -0.2 * Z, 0)) }, to: { pos: bloc(B0, 0, 0.4, 2.1, 4.2), at: () => head().add(V(0, -0.25 * Z, 0)) } },
        { t0: 6.5, t1: 7.2, from: { pos: bloc(B0, 0, 0.4, 2.1, 4.2), at: () => head().add(V(0, -0.25 * Z, 0)) }, to: { pos: () => F.gameCam().pos, at: () => F.gameCam().at } },
      ],
      events: [
        [0, () => { A.setBraziers(0); for (const f of A.fire) F.fx.brazierOut(f.pos); S.play('seal', { dur: 2.4, close: true, gain: 0.7 }); R.U.uForm.value = 0; R.play('idle_sheathed', { fade: 0 }); R.setYaw(Math.atan2(P0.x - B0.x, P0.z - B0.z)); }],
        [1.2, () => { A.setBarrier(true); A.setGate(true); F.sfx('b30Wave', { at: B0, gain: 0.8 }, 'flameBurst'); D.shake(0.12); A.setGlow(0.8); }],
        [1.5, () => { st.form = 0; S.play('rise', { dur: 2.2, gain: 0.7 }); S.play('crackle', { at: B0, dur: 2.2, gain: 0.6 }); }],
        [3.8, () => { st.form = null; R.U.uForm.value = 1; R.play('unsheath', { fade: 0.2, speed: 0.45 }); st.draw = 0; S.play('swing', { at: B0, heavy: true, gain: 0.5, pitch: 0.7 }); }],
        [5.0, () => { F.fx.bladeGlint(R.swordTip, R.swordGrip, 1.4); S.play('gong', { gain: 0.6 }); }],
        [5.2, () => { F.hud.title(BOSS30.name, BOSS30.title, 'boss'); }],
        [6.5, () => { F.hud.title(null); R.play('idle', { fade: 0.4 }); A.setGlow(0.35); }],
      ],
      tick(t, dt) {
        if (st.form != null) {
          st.form = Math.min(1, st.form + dt / 2.2);
          R.U.uForm.value = sm(st.form);
          F.fx.ashes(F.bodyPoints(), 5, true);
          if (Math.random() < 0.6) F.fx.flame(B0.clone().add(V((Math.random() - 0.5) * 1.6 * Z, 0.05, (Math.random() - 0.5) * 1.6 * Z)), { seqName: 'ember', mode: 0, size: [0.6 * Z, 0.15], life: 0.6, heat: [1, 0.4], v: V(0, 1.2 * Z, 0) });
        }
        if (st.draw != null) {
          st.draw += dt; R.U.uBlade.value = Math.min(0.6, st.draw * 0.5) * (st.draw < 1.6 ? 1 : Math.max(0, 1 - (st.draw - 1.6) / 0.8));
          // 剑尖擦地：拔剑的动作里剑尖低掠过地面，沿剑尖在地上的投影留下一道短火痕（只是画面，2 秒熄）
          const tp = R.swordTip;
          if (st.draw < 1.8 && tp.y < 0.75 * Z) {
            const g = V(tp.x, 0, tp.z);
            if (!st.scrape || st.scrape.distanceTo(g) > 0.35) { st.scrape = g; F.fx.groundFire(g, 2.0, 0.7); if (!st.scraped) { st.scraped = true; S.play('crackle', { at: g, dur: 0.8, gain: 0.6 }); } }
            if (Math.random() < 0.7) F.fx.flame(tp.clone(), { seqName: 'ember', mode: 0, size: [0.35, 0.08], life: 0.5, heat: [1, 0.4], v: V((Math.random() - 0.5) * 1.5, 1.0, (Math.random() - 0.5) * 1.5) });
          }
        }
      },
      finish() {
        A.setBarrier(true); A.setGate(true); A.setBraziers(0, true); A.setGlow(0.35);
        R.U.uForm.value = 1; R.U.uBlade.value = 0;
        R.root.position.set(B0.x, 0, B0.z); R.setYaw(Math.atan2(P.pos.x - B0.x, P.pos.z - B0.z));
        R.play('idle', { fade: 0.2 });
        F.hud.title(null);
      },
    };
  },

  // ---------------- 阶段转换（6.2 秒）：被撞开、单膝跪地 → 台面与甲缝里裂出火纹 → 起身、挥剑 → 一圈火环荡开（只是视觉）、火盆重燃、剑刃起火 → 「二阶段 · 烬火复燃」→ 回到玩家 ----------------
  phase(F, D) {
    const R = F.rig, A = F.arena, S = F.sound, P = F.P;
    const R0 = F.root.clone().setY(0), yaw = R.yaw;
    const chest = () => R.chest(V()), head = () => R.head(V());
    const st = { crack: null };
    const mp0 = F.Mv.mp;
    P.heading = Math.atan2(R0.x - P.pos.x, R0.z - P.pos.z);
    return {
      dur: CONFIG30.cine.phase,
      shots: [
        { t0: 0, t1: 1.4, from: { pos: bloc(R0, yaw, -3.4, 1.6, 2.6), at: () => chest() }, to: { pos: bloc(R0, yaw, -3.0, 1.2, 3.0), at: () => chest() } },
        { t0: 1.4, t1: 2.8, from: { pos: bloc(R0, yaw, 1.4, 0.7, 2.4), at: () => chest() }, to: { pos: bloc(R0, yaw, 1.1, 0.9, 2.0), at: () => chest() } },
        { t0: 2.8, t1: 4.6, from: { pos: bloc(R0, yaw, 2.2, 2.6, 6.2), at: () => chest() }, to: { pos: bloc(R0, yaw, 3.6, 4.6, 9.0), at: R0.clone().add(V(0, 1.2 * Z, 0)) } },
        { t0: 4.6, t1: 5.5, from: { pos: bloc(R0, yaw, -0.6, 1.9, 3.4), at: () => head() }, to: { pos: bloc(R0, yaw, -0.7, 2.0, 3.9), at: () => head() } },
        { t0: 5.5, t1: 6.2, from: { pos: bloc(R0, yaw, -0.7, 2.0, 3.9), at: () => head() }, to: { pos: () => F.gameCam().pos, at: () => F.gameCam().at } },
      ],
      events: [
        [0, () => { R.play('hit_f', { fade: 0.1 }); S.play('stagger', { at: R0 }); F.fx.flash(0xfff1c1, 0.25); D.shake(0.2); R.look.w = 0; F.lookW = 0; }],
        [0.35, () => { R.play('kneel', { fade: 0.35, loop: true }); }],
        [0.8, () => { F.fx.scorch(R0, 2.2, 8); S.play('thump', { at: R0 }); }],
        [1.2, () => { st.crack = 0; S.play('crackle', { at: R0, dur: 1.8 }); S.play('charge', { at: R0, dur: 1.8, pitch: 0.7 }); A.setHeat(1); }],
        [2.8, () => { R.play('idle_flourish', { fade: 0.4 }); }],
        [3.4, () => {
          // 火环（只是视觉）：自剑尊脚下荡开一圈火，火盆随之重燃
          for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; F.fx.flame(R0.clone().add(V(Math.sin(a) * 1.5 * Z, 0.05, Math.cos(a) * 1.5 * Z)), { seqName: 'burst', v: V(Math.sin(a) * 9, 1.5, Math.cos(a) * 9), size: [1.4 * Z, 2.4 * Z], life: 0.9, heat: [1, 0.3], drag: 1.6, gravity: -0.5 }); }
          F.fx.glow(R0.clone().setY(0.08), { tile: 'ringFire', mode: 3, size: [2, 22], life: 0.9, heat: [1, 0.6], alpha: 1 });
          st.lit = 0; R.U.uBlade.value = 1; D.shake(0.35); F.fx.flash(0xffd2a0, 0.3);
          S.play('flameBurst', { at: R0, gain: 1.1 }); S.play('boom', { at: R0, gain: 0.6 });
        }],
        [4.6, () => { F.hud.title('二阶段 · 烬火复燃', BOSS30.name, 'p2'); S.play('gong', { gain: 0.85 }); F.hud.setPhase(2, true, true); }],
        [5.5, () => F.hud.title(null)],
      ],
      tick(t, dt) {
        F.Mv.mp = Math.min(F.Mv.mp, mp0);
        if (st.crack != null && st.crack < 1) { st.crack = Math.min(1, st.crack + dt / 1.6); R.U.uIgnite.value = st.crack; R.U.uGlowK.value = 1.6 + 1.4 * st.crack; }
        if (st.crack != null) F.fx.bodyEmbers(F.bodyPoints(), 2.5);
        // 胸口的火汇入剑身：先在胸口聚成一团，2.8 秒起沿手臂汇向剑刃、胸口渐暗
        if (t >= 1.2 && t < 2.8) R.hotAt(Math.min(1.1, (t - 1.2) / 1.2));
        else if (t >= 2.8 && t < 3.4) { R.hotAt(1.1 * (1 - (t - 2.8) / 0.6)); R.U.uBlade.value = Math.max(R.U.uBlade.value, (t - 2.8) / 0.6); F.fx.converge(R.bladeAt(0.6), { n: 2, r: 1.0, life: 0.35 }); }
        else if (t >= 3.4 && st.hot !== 0) { st.hot = 0; R.hotAt(0); }
        // 火盆依次点亮（火环荡开之后，每 0.14 秒一只，绕场一周）
        if (st.lit != null && st.lit < A.fire.length && t >= 3.4 + st.lit * 0.14) { const f = A.fire[st.lit++]; f.target = 1.6; F.fx.glow(f.pos.clone(), { tile: 'glowFire', size: 2.4, life: 0.4, heat: [1, 0.6], alpha: 0.9 }); }
      },
      finish() {
        F.Mv.mp = Math.min(F.Mv.mp, mp0);
        R.hotAt(0);
        F.applyPhase(2);
        R.look.w = 0;
        R.play('idle', { fade: 0.2 });
        F.hud.title(null);
      },
    };
  },

  // ---------------- 击败（5.8 秒）：剑上的火熄灭 → 单膝跪地 → 长剑脱手落地 → 身体自上而下碎成余烬 → 火墙落下、出口打开 → 奖励入账（只一次）→ 结算 ----------------
  victory(F, D) {
    const R = F.rig, A = F.arena, S = F.sound, P = F.P;
    const R0 = F.root.clone().setY(0), yaw0 = R.yaw;
    const toP = Math.atan2(P.pos.x - R0.x, P.pos.z - R0.z);
    const chest = () => R.chest(V());
    const st = { fade: 0, ash: null, sword: null, credited: false };
    return {
      dur: CONFIG30.cine.victory,
      shots: [
        { t0: 0, t1: 1.5, from: { pos: () => P.pos.clone().add(loc(V(0, 0, 0), toP, 1.2, 1.8 * Z, -1.6 * Z)), at: () => chest() } },
        { t0: 1.5, t1: 3.4, from: { pos: bloc(R0, yaw0, -2.8, 1.0, 2.2), at: R0.clone().add(V(0, 0.7 * Z, 0)) }, to: { pos: bloc(R0, yaw0, -3.2, 1.3, 2.8), at: R0.clone().add(V(0, 0.8 * Z, 0)) } },
        { t0: 3.4, t1: 5.0, from: { pos: bloc(R0, yaw0, 0.5, 2.2, 5.5), at: R0.clone().add(V(0, 1.0 * Z, 0)) }, to: { pos: bloc(R0, yaw0, 1.4, 3.6, 7.6), at: R0.clone().add(V(0, 1.2 * Z, 0)) } },
        { t0: 5.0, t1: 5.8, from: { pos: bloc(R0, yaw0, 1.4, 3.6, 7.6), at: R0.clone().add(V(0, 1.2 * Z, 0)) }, to: { pos: () => F.gameCam().pos, at: () => F.gameCam().at } },
      ],
      events: [
        [0, () => { D.slow = 0.3; F.fx.flash(0xfff1c1, 0.4); D.shake(0.3); S.play('hit', { at: R0, big: true }); R.U.uFlash.value = 1; R.look.w = 0; F.lookW = 0; R.play('hit_f', { fade: 0.08 }); }],
        [0.5, () => { D.slow = 1; R.play('kneel_slump', { fade: 0.4, loop: true }); S.play('growl', { at: R0, dur: 1.0, gain: 0.6 }); }],
        [1.5, () => { st.sword = { o: R.dropSword(A.scene), t: 0, v: V(0.6, 0.5, 0.3), spin: V(1.4, 0.4, 2.2) }; }],
        [2.3, () => { st.ash = 0; S.play('rise', { dur: 2.2, gain: 0.6 }); S.play('crackle', { at: R0, dur: 2.0, gain: 0.5 }); }],
        [3.6, () => { A.setBarrier(false); A.setGate(false); A.setBraziers(1); A.setHeat(0); S.play('seal', { dur: 2.2, close: false, gain: 0.5 }); }],
        [4.4, () => { st.credited = true; const info = F.grantRewards(); S.play('chime', {}); F.hud.toast30(info.debug ? '调试：不计入记录' : info.first ? '首通奖励已入行囊' : '奖励已入行囊'); }],
      ],
      tick(t, dt) {
        if (st.fade < 1) { st.fade = Math.min(1, st.fade + dt / 1.0); const k = 1 - st.fade; R.U.uBlade.value = Math.min(R.U.uBlade.value, k); R.U.uIgnite.value = Math.min(R.U.uIgnite.value, k); R.U.uGlowK.value = 0.6 + 2.4 * k; }
        const W = st.sword;
        if (W?.o && W.t < 3) {
          W.t += dt;
          W.v.y -= 9.8 * dt;
          W.o.position.addScaledVector(W.v, dt);
          if (W.o.position.y < 0.08) { W.o.position.y = 0.08; W.v.multiplyScalar(0.25); W.v.y = Math.abs(W.v.y) * 0.3; W.spin.multiplyScalar(0.3); if (!W.clank) { W.clank = true; S.play('block', { at: W.o.position, hard: true, gain: 0.6 }); F.fx.sparks(W.o.position.clone(), { n: 6, kind: 'block' }); } }
          W.o.rotation.x += W.spin.x * dt; W.o.rotation.y += W.spin.y * dt; W.o.rotation.z += W.spin.z * dt;
        }
        if (st.ash != null && st.ash < 1) {
          st.ash = Math.min(1, st.ash + dt / 2.2);
          R.U.uAsh.value = st.ash;
          F.fx.ashes(F.bodyPoints(), 6, false);
          if (st.ash >= 1) R.root.visible = false;
        }
      },
      finish() {
        R.U.uAsh.value = 1; R.root.visible = false; R.U.uBlade.value = 0; R.U.uIgnite.value = 0;
        if (R.swordAttached) R.dropSword(A.scene);
        const W = R.sword; if (W) { W.position.y = Math.max(0.08, Math.min(W.position.y, 0.08)); W.rotation.set(Math.PI / 2, W.rotation.y, 0); }
        A.setBarrier(false); A.setGate(false); A.setBraziers(1); A.setHeat(0);
        if (!st.credited) F.grantRewards();
        F.hud.title(null);
      },
    };
  },

  // ---------------- 失败（5.0 秒）：玩家倒地 → 剑尊走近 → 收剑立定（收势）——不再对倒地的玩家出手 → 淡出 → 失败界面 ----------------
  defeat(F, D) {
    const R = F.rig, S = F.sound, P = F.P, A = F.arena;
    const st = { walk: null };
    void D;
    return {
      dur: CONFIG30.cine.defeat,
      shots: [
        { t0: 0, t1: 1.2, from: { pos: () => P.pos.clone().add(loc(V(0, 0, 0), P.heading, 2.2, 1.2, 0.8)), at: () => P.pos.clone().add(V(0, 0.4, 0)) } },
        { t0: 1.2, t1: 3.0, from: { pos: () => st.camA, at: () => R.chest(V()) }, to: { pos: () => st.camB, at: () => R.chest(V()) } },
        { t0: 3.0, t1: 5.0, from: { pos: () => st.camC, at: () => st.mid }, to: { pos: () => st.camD, at: () => st.mid } },
      ],
      events: [
        [0, () => {
          P.heading = Math.atan2(F.root.x - P.pos.x, F.root.z - P.pos.z);
          P.char.anim.play('Hit_Knockback', { from: 0, to: 0.83, speed: 0.9, hold: true, fade: 0.05 });
          S.play('hurt', { at: P.pos }); S.play('defeat', {}); R.look.w = 0; F.lookW = 0;
          // 剑尊走到玩家身前 2.6 米处（第二十六轮按体型放远）
          const dx = P.pos.x - F.root.x, dz = P.pos.z - F.root.z, d = Math.hypot(dx, dz) || 1;
          st.from = F.root.clone().setY(0); st.to = V(P.pos.x - (dx / d) * 2.6 * Z, 0, P.pos.z - (dz / d) * 2.6 * Z);
          const K = CONFIG30.arena.keepIn, l = Math.hypot(st.to.x, st.to.z); if (l > K) { st.to.x *= K / l; st.to.z *= K / l; }
          st.yaw = Math.atan2(dx, dz);
          const side = V(Math.cos(st.yaw), 0, -Math.sin(st.yaw));
          st.mid = st.to.clone().lerp(P.pos, 0.5).add(V(0, 1.0 * Z, 0));
          st.camA = st.to.clone().addScaledVector(side, 3.2 * Z).add(V(0, 1.4 * Z, 0)).addScaledVector(V(Math.sin(st.yaw), 0, Math.cos(st.yaw)), 1.6 * Z);
          st.camB = st.camA.clone().add(V(0, 0.3 * Z, 0));
          st.camC = st.mid.clone().addScaledVector(side, -4.6 * Z).add(V(0, 1.6 * Z, 0)); st.camD = st.camC.clone().add(V(0, 0.8 * Z, 0)).addScaledVector(side, -0.6 * Z);
        }],
        [0.6, () => { if (Math.hypot(st.to.x - st.from.x, st.to.z - st.from.z) > 0.4) { R.setYaw(st.yaw); R.play('walk_f', { fade: 0.25, loop: true }); st.walk = 0; } }],
        [2.4, () => { st.walk = null; R.root.position.copy(st.to); R.setYaw(st.yaw); R.play('a6s3c', { fade: 0.25, root: false }); S.play('swing', { at: st.to, gain: 0.5 }); }],
        [3.6, () => { S.play('gong', { gain: 0.4 }); }],
        [4.4, () => { const f = document.querySelector('#fade'); f.classList.add('dark', 'on'); }],
      ],
      tick(t, dt) {
        // 余烬遮过镜头：3.3 秒起在镜头前一米多处横着飘过一阵（黑场之前）
        if (t >= 3.3 && t < 4.6) {
          const cam = F.g.freeCam;
          if (cam) {
            const fw = cam.at.clone().sub(cam.pos).normalize(), side = V(fw.z, 0, -fw.x).normalize();
            for (let i = 0; i < 6; i++) {
              const p = cam.pos.clone().addScaledVector(fw, 1.0 + Math.random() * 1.6).addScaledVector(side, -1.6 - Math.random() * 0.8).add(V(0, (Math.random() - 0.5) * 1.4, 0));
              F.fx.flame(p, { seqName: 'ember', mode: 0, size: [0.18 + Math.random() * 0.26, 0.05], life: 0.9, heat: [1, 0.35], v: side.clone().multiplyScalar(3.2 + Math.random() * 1.5).add(V(0, 0.4, 0)), gravity: -0.3 });
            }
          }
        }
        if (st.walk != null) {
          st.walk += dt;
          const u = clamp01(st.walk / 1.8);
          R.root.position.lerpVectors(st.from, st.to, u);
          if ((st.stepT = (st.stepT ?? 0) - dt) <= 0) { st.stepT = 0.48; S.play('step', { at: R.root.position, gain: 0.9, pitch: 0.7 }); }
        }
        void A;
      },
      finish(skipped) {
        F.hud.title(null);
        // 跳过：剑尊直接落在玩家身前、收剑的终结姿势（与看完一致）
        if (skipped && st.to) { st.walk = null; R.root.position.copy(st.to); R.setYaw(st.yaw); R.play('a6s3c', { fade: 0, root: false, from: Math.max(0, R.dur('a6s3c') - 0.02) }); }
        const f = document.querySelector('#fade'); f.classList.add('dark', 'on');
      },
    };
  },
};
