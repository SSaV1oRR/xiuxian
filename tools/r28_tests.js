// 第二十八轮自检：「墨里终焉」龙凤砸入的墨震（照雷龙撞地的层次做成水墨；只是表现）——
//   撞上的时刻与次数、墨柱 / 墨裂 / 余震 / 渗墨、声音与音乐让开、镜头一顿与震屏（统一封顶；量画面实际用的镜头）、四角压暗、不伤人、暂停时不抖、不同帧率、流畅画质、清理；
//   第二十七轮的整套自检照常跑（T27.runAll，结果在 window.__r27all）。
// 都按真实的输入、出招、演出代码推进（__qinglan.tick）。
// 用法：const T = await import('/tools/r28_tests.js?v=' + Date.now()); await T.setup(); T.runAll()  → window.__r28all
//   性能另跑（较慢）：T.perf28Run()——第一次演出（刚载入）与之后各跑一次
import * as T27 from './r27_tests.js';
import { FINALE as F } from '/src/game/inkFinaleConfig.js';

const Q = () => window.__qinglan;
const r2 = (v) => +(+v).toFixed(2), r3 = (v) => +(+v).toFixed(3);
export const { startShow, to, foes, fresh, charge, skyQuiet } = T27;
export async function setup() { return T27.setup(); }

// 一次演出由 from 推到 until 秒（只推进不画；dt 为帧长），每帧记下墨震的状态、镜头相对机位的偏移、四角压暗
function stepShow(from, until, dt = 1 / 60, each = null) {
  const A = Q(), Fn = A.finale;
  let n = 0;
  while (Fn.show && Fn.show.t < until - 1e-6 && n++ < 8000) {
    A.tick(dt, 1, false);
    each?.(Fn.show);
  }
}

// =====================================================================================
// 1. 撞上的时刻与次数：凤 10.5、龙 10.7 各一次；墨柱 3 道、墨裂 9 道（流畅画质 5 道）、余震 4 次、渗墨约 secs × rate × 画质系数 缕；墨震的声音与画面同一时刻
// =====================================================================================
export function quakeRun(dt = 1 / 60) {
  const A = Q(), Fn = A.finale, X = A.finFx, out = {};
  const n0 = Fn.evN || 0;
  // 演出音乐的让开（cueGain）：记下演出时刻与参数
  const snd = A.game.sound, gains = [], cg0 = Object.prototype.hasOwnProperty.call(snd, 'cueGain') ? snd.cueGain : null;
  snd.cueGain = function (name, k, time) { gains.push([r3(Fn.show?.t ?? -1), name, k, time]); return Object.getPrototypeOf(snd).cueGain.call(this, name, k, time); };
  const { S } = startShow();
  if (!S) { if (cg0) snd.cueGain = cg0; else delete snd.cueGain; return { err: 'no show' }; }
  let maxPillars = 0, maxCracks = 0, kickMax = 0, shakeMax = 0, vigMax = 0, firstPillar = null, firstCrack = null;
  stepShow(0, 12.8, dt, (Sh) => {
    const c = X.census().quake;
    if (c.pillars > maxPillars) { maxPillars = c.pillars; if (firstPillar == null) firstPillar = r3(Sh.t); }
    if (c.cracks > maxCracks) { maxCracks = c.cracks; if (firstCrack == null) firstCrack = r3(Sh.t); }
    const L = Sh.joltLevels(Sh.t);
    kickMax = Math.max(kickMax, L.kick); shakeMax = Math.max(shakeMax, L.shake);
    vigMax = Math.max(vigMax, Sh.vigNow(Sh.t));
  });
  const c = X.census().quake;
  const ev = Fn.events.filter((e) => e.n > n0);
  out.hits = c.hits; out.after = c.after; out.seep = c.seep;
  out.pillars = { max: maxPillars, first: firstPillar }; out.cracks = { max: maxCracks, first: firstCrack };
  out.quakeEvents = ev.filter((e) => e.kind === 'quake').map((e) => `${e.who}@${e.t}`);
  out.sounds = ev.filter((e) => e.kind === 'sfx' && /^inkSlam|^inkAfter/.test(e.name)).map((e) => `${e.name}@${e.t}`);
  out.jolt = { kickMax: r3(kickMax), shakeMax: r3(shakeMax), cap: r3(F.feel.shake * 0.2), vigMax: r2(vigMax) };
  while (Fn.active) A.tick(1 / 60, 1, false);
  if (cg0) snd.cueGain = cg0; else delete snd.cueGain;
  const Qk = F.quake, nC = X.crackS.length, hitT = (who) => +(out.hits.find((h) => h.startsWith(who))?.split('@')[1] ?? NaN);
  // 砸入前后的让开：Dq.at 压到 k、Dq.back 回升到 1（收刀合拢前后的那次另由 r27 的 musicRun 核对）
  const Dq = Qk.duck, qd = gains.filter((g) => g[1] === 'ml' && g[0] < F.music.dip.at - 0.3);
  out.duck = qd.map((g) => [g[0], g[2], g[3]]);
  const duckOk = qd.length === 2 && Math.abs(qd[0][0] - Dq.at) <= dt + 1e-3 && qd[0][2] === Dq.k && Math.abs(qd[1][0] - Dq.back) <= dt + 1e-3 && qd[1][2] === 1;
  const near = (a, b, tol = dt + 1e-3) => Math.abs(a - b) <= tol;
  const sAt = (name) => +(out.sounds.find((s) => s.startsWith(name + '@'))?.split('@')[1] ?? NaN);
  out.ok = out.hits.length === 2 && near(hitT('phoenix'), F.show.birds.phoenix[1]) && near(hitT('dragon'), F.show.birds.dragon[1])
    && maxPillars === Qk.pillars.n && maxCracks === nC && out.after === Qk.after.at.length && out.seep >= Math.floor(Qk.seep.secs * Qk.seep.rate * X.q * 0.8)
    && near(sAt('inkSlamP'), F.sfx.hitP) && near(sAt('inkSlam'), F.sfx.hitD) && near(sAt('inkAfter'), F.sfx.hitD + Qk.after.at[0], dt * 2 + 1e-3)
    && out.quakeEvents.length === 2 && kickMax > Qk.kick * 0.8 && kickMax <= Qk.kick + 1e-6 && shakeMax <= F.feel.shake * 0.2 + 1e-6 && vigMax > Qk.vig * 0.8 && duckOk;
  return out;
}

// =====================================================================================
// 2. 只是表现：墨震不伤人——落点 2 米处的另一个魔修、玩家的气血在墨震前后不变（被处决的目标照常到 13.2 秒才结算）
// =====================================================================================
export function harmlessRun() {
  const A = Q(), Fn = A.finale, C = A.combat, out = {};
  fresh(); Fn.debugGive();
  // 第二个魔修：气血很高，在落点 2.6 米处——比较墨震前后（10.3 → 12.6 秒）的气血。
  // 第二十九轮：群战里只有最后一个放演出——第二个设成沉睡（不算这场战斗里的），这一下只打第一个（普通的致命一击，走通用的终结）
  const es = foes([['shade', 3.2, 0], ['shade', 5.6, 1.2]], { hp: 100000 }); es[0].hp = 8; A.moves.lock = es[0];
  es[1].state = 'dormant'; es[1].engaged = false;
  C.damage(es[0], 50, { from: C.playerUnit, kind: 'sword' });
  for (let i = 0; i < 120 && !Fn.show; i++) A.tick(1 / 60, 1, false);
  if (!Fn.show) return { err: 'no show' };
  to(10.3);
  const hp0 = { other: es[1].hp, player: C.playerUnit.hp, target: es[0].hp };
  to(12.6);
  const hp1 = { other: es[1].hp, player: C.playerUnit.hp, target: es[0].hp, alive: es[0].alive };
  while (Fn.active) A.tick(1 / 60, 1, false);
  A.moves.lock = null;
  out.before = hp0; out.after = hp1;
  out.otherDist = r2(Math.hypot(es[1].pos.x - es[0].pos.x, es[1].pos.z - es[0].pos.z));
  out.ok = hp0.other > 0 && hp0.other === hp1.other && hp0.player === hp1.player && hp0.target === hp1.target && hp1.alive && out.otherDist < F.quake.wave.r;
  return out;
}

// =====================================================================================
// 2b. 暂停时不抖：龙撞上之后 0.05 秒（震屏正大）暂停——游戏照常每帧重画、只是时钟给 0（菜单、失焦）；
//     这几帧演出时刻不走、镜头位置与朝向一点不动；同一时刻算两次偏移相同（震屏只由演出时刻决定），恢复后照常抖、照常演完
// =====================================================================================
export function pauseShakeRun() {
  const A = Q(), Fn = A.finale, cam = A.camera, out = {};
  const { S } = startShow();
  if (!S) return { err: 'no show' };
  to(F.show.birds.dragon[1] + 0.05);
  const Sh = Fn.show, t0 = Sh.t, L = Sh.joltLevels(t0);
  out.t = r3(t0); out.levels = { kick: r3(L.kick), shake: r3(L.shake) };
  const j1 = Sh.jolt(t0)?.map((v) => v.toArray().map(r3)), j2 = Sh.jolt(t0)?.map((v) => v.toArray().map(r3));
  out.same = JSON.stringify(j1) === JSON.stringify(j2);
  const poses = [];
  for (let i = 0; i < 12; i++) { A.tick(0, 1, false); poses.push([...cam.position.toArray(), ...cam.quaternion.toArray()].map((v) => +v.toFixed(6)).join(',')); }
  out.tAfter = r3(Fn.show.t); out.distinct = new Set(poses).size;
  // 恢复：照常推进，镜头在震屏期间仍在动
  const moving = [];
  for (let i = 0; i < 6; i++) { A.tick(1 / 60, 1, false); moving.push(cam.position.toArray().map((v) => +v.toFixed(5)).join(',')); }
  out.resumeDistinct = new Set(moving).size;
  while (Fn.active) A.tick(1 / 60, 1, false);
  out.ok = L.shake > 0 && out.same && out.tAfter === out.t && out.distinct === 1 && out.resumeDistinct > 1;
  return out;
}

// =====================================================================================
// 2c. 镜头真的动了：主循环每帧最后按 game.freeCam 摆镜头——量画面实际用的镜头（不是算出来的量）相对演出机位 camObj 的偏移：
//     撞上之前为 0；龙撞上之后 0.05 秒往下沉约 kick；余震都过去之后（12.3 秒）回到 0
// =====================================================================================
export function joltCamRun() {
  const A = Q(), Fn = A.finale, cam = A.camera, out = {};
  const { S } = startShow();
  if (!S) return { err: 'no show' };
  const off = () => { const C = Fn.show.camObj.pos; return { d: r3(cam.position.distanceTo(C)), dy: r3(cam.position.y - C.y) }; };
  to(10.3); out.before = off();
  to(F.show.birds.dragon[1] + 0.05); out.hit = off();
  to(12.3); out.after = off();
  out.freeCamIsView = A.game.freeCam === Fn.show.camView;
  while (Fn.active) A.tick(1 / 60, 1, false);
  out.freeCamAfter = !!A.game.freeCam;
  out.ok = out.before.d < 1e-3 && out.hit.dy < -F.quake.kick * 0.6 && out.after.d < 1e-3 && out.freeCamIsView && !out.freeCamAfter;
  return out;
}

// =====================================================================================
// 3. 不同帧率：30 / 60 / 144 帧下撞上的时刻相差不超过一帧，墨柱、墨裂、余震、渗墨的次数一致（渗墨按时间累积，允许 ±1）
// =====================================================================================
export function fps28Run(rates = [30, 60, 144]) {
  const out = {};
  for (const fps of rates) { const r = quakeRun(1 / fps); out[fps] = { hits: r.hits, after: r.after, seep: r.seep, pillars: r.pillars.max, cracks: r.cracks.max, sounds: r.sounds, ok: r.ok }; }
  const v = Object.values(out), hd = (r, who) => +(r.hits.find((h) => h.startsWith(who))?.split('@')[1] ?? NaN);
  out.ok = v.every((r) => r.ok) && v.every((r) => Math.abs(hd(r, 'dragon') - hd(v[0], 'dragon')) <= 1 / 30 + 1e-3) && v.every((r) => r.after === v[0].after && r.pillars === v[0].pillars && Math.abs(r.seep - v[0].seep) <= 1);
  return out;
}

// =====================================================================================
// 4. 清理：演出结束后墨震的笔触都收起、第三组水墨的粒子清空、四角压暗回到原来的 0.22；连续两次不累积
// =====================================================================================
export function cleanup28Run(n = 2) {
  const A = Q(), Fn = A.finale, X = A.finFx, Rr = A.renderer, out = { runs: [] };
  const g0 = Rr.info.memory.geometries, x0 = Rr.info.memory.textures;
  for (let k = 0; k < n; k++) {
    startShow(); while (Fn.active) A.tick(1 / 60, 1, false); A.tick(1 / 60, 1, false);
    const c = X.census().quake;
    out.runs.push({ pillars: c.pillars, cracks: c.cracks, ink3: c.ink3, vig: r3(A.post.mComp.uniforms.uVig.value), impulses: Fn.show?.impulses?.length ?? 0, quake: X.quake });
  }
  out.geos = Rr.info.memory.geometries - g0; out.texs = Rr.info.memory.textures - x0;
  out.ok = out.runs.every((r) => r.pillars === 0 && r.cracks === 0 && r.ink3 === 0 && Math.abs(r.vig - 0.22) < 1e-3 && r.quake === null) && out.geos <= 1 && out.texs <= 1;
  for (const r of out.runs) delete r.quake;
  return out;
}

// =====================================================================================
// 5. 流畅画质：墨裂的笔触少几道（cracks.low），粒子数按画质减；载入时就定（看当前画质下的数量）
// =====================================================================================
export function lowInfo() {
  const A = Q(), X = A.finFx;
  return { quality: A.quality, q: X.q, crackStrokes: X.crackS.length, expect: X.q < 0.75 ? F.quake.cracks.low : F.quake.cracks.n, ink3Cap: X.sp3?.cap ?? null, ok: X.crackS.length === (X.q < 0.75 ? F.quake.cracks.low : F.quake.cracks.n) && !!X.sp3 };
}

// =====================================================================================
// 6. 性能：第二十七轮的 perf27Run（1280×720，各段与第二十七轮可比），另把龙凤砸入前后细分——
//    龙凤同框、落下前的阴影与压线、凤砸入、龙砸入（墨柱、墨浪、墨裂）、余震、渗墨与墨裂淡去
// =====================================================================================
const QSEG = [['birds', 8.0, 10.18], ['pre', 10.18, 10.5], ['slamP', 10.5, 10.7], ['slamD', 10.7, 11.0], ['after', 11.0, 11.6], ['seep', 11.6, 12.9]];
export function perf28Run(o = {}) {
  const r = T27.perf27Run({ ...o, raw: true });
  if (!r.raw) return r;
  const stat = (v) => { v = v.slice().sort((a, b) => a - b); return v.length ? { n: v.length, median: r2(v[Math.floor(v.length / 2)]), p95: r2(v[Math.min(v.length - 1, Math.floor(v.length * 0.95))]), max: r2(v[v.length - 1]) } : null; };
  r.quakeSegs = Object.fromEntries(QSEG.map(([k, a, b]) => [k, stat(r.raw.filter(([t]) => t >= a && t < b).map(([, ms]) => ms))]));
  delete r.raw;
  return r;
}

// =====================================================================================
// 全部（放进 setTimeout 里跑，结果在 window.__r28all）
// =====================================================================================
export function runAll() {
  window.__r28all = { running: true };
  setTimeout(async () => {
    const out = {}, t0 = performance.now();
    const steps = [['quake', () => quakeRun()], ['harmless', harmlessRun], ['joltCam', joltCamRun], ['pauseShake', pauseShakeRun], ['fps', () => fps28Run()], ['cleanup', () => cleanup28Run(2)], ['low', lowInfo]];
    for (const [k, f] of steps) {
      const s0 = performance.now();
      try { out[k] = await f(); } catch (e) { out[k] = { err: String(e), stack: String(e.stack).slice(0, 400) }; }
      out[k].ms = Math.round(performance.now() - s0);
      window.__r28all = { running: true, at: k, out };
      await new Promise((r) => setTimeout(r, 30));
    }
    out.summary = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v?.ok ?? (v?.err ? 'ERR' : null)]));
    out.totalMs = Math.round(performance.now() - t0);
    window.__r28all = { running: false, out };
  }, 0);
  return 'started';
}
