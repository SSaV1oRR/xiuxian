// 第十八轮：镇塔龙君动作流畅度的量化检查（浏览器里 import；在第五十层守关战中运行，不渲染）。
// 用法：const T = await import('/tools/r18_boss_motion.js?v=' + Date.now()); window.__m = await T.measure();
//   measure({ moves, strafe })：逐招放一遍（玩家站在 3.6 米处不动），每帧在龙身的本地坐标里量骨盆、头、双爪、尾尖的加速度
//   （二阶差分 / dt²，米/秒²；另有双肘 forearm_stretch_*）：peak 最大值与出现的招式时刻、pops 超过 1000 的帧数（一帧里「蹦」一下的地方）、
//   switchPops 其中落在换动作后 0.25 秒内的；另量最大转身角速度（度/秒）、踩地的脚在地上的滑移
//   （两帧都在自己站姿高度 6 厘米以内、几乎不上下动时的水平挪动，米）；strafe 秒：玩家以 6 米半径绕龙走、龙按 AI 转身，量同样的指标
//   rebuild({ fps, smooth, snap })：按给定的取样率、平滑量、snap 缓动重新解一遍编排动作并换上（只用于比较参数，不改文件）
const Q = () => window.__qinglan;
const POP = 1000;

export async function measure({ moves = ['claw1', 'claw2', 'combo3', 'tailsweep', 'slam', 'charge', 'jump', 'breath', 'orbs', 'thunder'], strafe = 12, dt = 1 / 60 } = {}) {
  const A = Q(), F = A.boss50, T = A.THREE, U = A.combat.playerUnit;
  const B16 = await import('/tools/r16_boss_bot.js');
  if (F.state === 'dormant') { F.debug.start(); A.tick(dt, 30, false); F.debug.skip(); A.tick(dt, 60, false); }
  F.debug.hp('debug'); F.god = true;
  const R = F.rig;
  const parts = ['root_x', 'head_x', 'hand_l', 'hand_r', 'forearm_stretch_l', 'forearm_stretch_r', 'c_tail_06_x'];
  const inv = new T.Matrix4();
  // 站姿时两脚的高度（世界米）
  F.debug.ai(false); B16.stage({ d: 6 }); A.tick(dt, 30, false);
  const rest = ['foot_l', 'foot_r'].map((n) => R.bones[n].getWorldPosition(new T.Vector3()).y);
  const track = () => {
    const st = { n: 0, pops: 0, switchPops: 0, peak: {}, at: {}, yawMax: 0, slide: 0 };
    let p1 = null, p2 = null, py = R.yaw, pf = null, lastClip = R.name, swT = -9, t = 0;
    return {
      st,
      step() {
        t += dt;
        if (R.name !== lastClip) { lastClip = R.name; swT = t; }
        R.root.updateMatrixWorld(true); inv.copy(R.root.matrixWorld).invert();
        const cur = parts.map((n) => R.bones[n].getWorldPosition(new T.Vector3()).applyMatrix4(inv));
        if (p1 && p2) {
          let pop = false;
          cur.forEach((p, k) => {
            const a = p.clone().sub(p1[k]).sub(p1[k].clone().sub(p2[k])).length() / (dt * dt);
            if (a > (st.peak[parts[k]] || 0)) { st.peak[parts[k]] = Math.round(a); st.at[parts[k]] = `${R.name}@${R.t.toFixed(2)}`; }
            if (a > POP) pop = true;
          });
          if (pop) { st.pops++; if (t - swT < 0.25) st.switchPops++; }
        }
        p2 = p1; p1 = cur;
        const yr = Math.abs(Math.atan2(Math.sin(R.yaw - py), Math.cos(R.yaw - py))) / dt * 57.3; py = R.yaw;
        if (yr > st.yawMax) st.yawMax = Math.round(yr);
        const feet = ['foot_l', 'foot_r'].map((n) => R.bones[n].getWorldPosition(new T.Vector3()));
        // 踩地：两帧都在站姿高度 6 厘米以内、而且几乎没有上下动（每秒不到 0.6 米）——跑步时抬脚、落脚的那几帧不算
        if (pf) feet.forEach((f, k) => { if (f.y < rest[k] + 0.06 && pf[k].y < rest[k] + 0.06 && Math.abs(f.y - pf[k].y) / dt < 0.6) st.slide += Math.hypot(f.x - pf[k].x, f.z - pf[k].z); });
        pf = feet;
        st.n++;
      },
    };
  };
  const out = {};
  for (const id of moves) {
    B16.stage({ d: id === 'jump' || id === 'charge' ? 9 : id === 'breath' ? 5 : 3.6 });
    A.combat.playerUnit.invuln = 99;
    const tr = track();
    F.debug.move(id);
    let n = 0;
    while (F.M && n < 900) { A.tick(dt, 1, false); U.hp = U.maxHp; tr.step(); n++; }
    for (let i = 0; i < 40; i++) { A.tick(dt, 1, false); tr.step(); }      // 收招回到待机的一段
    const s = tr.st;
    out[id] = { frames: s.n, pops: s.pops, switchPops: s.switchPops, peak: s.peak, at: s.at, yawMax: s.yawMax, footSlide: +s.slide.toFixed(2) };
  }
  if (strafe > 0) {
    B16.stage({ d: 6 });
    F.debug.ai(true);
    const tr = track(), c = F.root.clone(), a0 = Math.atan2(A.player.pos.x - c.x, A.player.pos.z - c.z);
    let turns = 0, prev = R.name;
    for (let i = 0; i < Math.round(strafe / dt); i++) {
      const ang = a0 + i * dt * 0.45;                                       // 6 米半径、每秒 0.45 弧度（约 2.7 米 / 秒）
      A.player.place(c.x + Math.sin(ang) * 6, c.z + Math.cos(ang) * 6, 0, 0);
      F.B.gapT = 99; F.B.pending = null;                                    // 只转身、不出招
      A.tick(dt, 1, false); U.hp = U.maxHp; tr.step();
      if (R.name !== prev) { if (/^turn/.test(R.name)) turns++; prev = R.name; }
    }
    const s = tr.st, { a } = F.playerRel();
    out.strafe = { frames: s.n, pops: s.pops, peak: s.peak, yawMax: s.yawMax, footSlide: +s.slide.toFixed(2), turns, lagDeg: Math.round(Math.abs(a) * 57.3) };
    F.debug.ai(false);
  }
  A.combat.playerUnit.invuln = 0; F.god = false;
  return out;
}

// 只比较参数用：按 { fps, smooth, snap（指数）} 重新解编排动作，换到现有的龙身上（关卡里的模板片段一并替换）
export async function rebuild({ fps = 60, smooth = 0.03, snap = null } = {}) {
  const A = Q(), F = A.boss50, R = F.rig, T = R.T, v = Date.now();
  const P = await import('/src/actors/boss50Pose.js?v=' + v), C = await import('/src/actors/boss50Clips.js?v=' + v);
  P.BAKE.fps = fps; P.BAKE.smooth = smooth;
  if (snap != null) P.EASE.snap = (u) => 1 - Math.pow(1 - u, snap);
  const rest = []; T.scene.traverse((o) => { if (o.isBone) rest.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); });
  const temp = T.gltf.animations.find((c) => c.name === 'TempMotion');
  const t0 = performance.now();
  const clips = C.buildBossClips(new P.PoseSpace(T.scene, temp));
  const ms = Math.round(performance.now() - t0);
  for (const [o, p, q, s] of rest) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }
  Object.assign(T.clips, clips);
  R.mixer.stopAllAction(); R.blend = []; R.alt = {}; R.cur = null;
  R.play('idle', { fade: 0 });
  let keys = 0; for (const c of Object.values(clips)) for (const tr of c.tracks) keys += tr.times.length;
  return { ms, clips: Object.keys(clips).length, keys };
}

// 编排动作的手臂 IK 体检：逐段按 1/200 秒取样解一遍（不平滑），列出手目标离肩最近的距离（米，模型）、
// 肩→手方向与肘朝向的最大转速（度/秒）——肘一帧甩半圈（翻肘）、手贴着肩膀直穿，都在这里冒出来
export async function ikScan({ clips = null, step = 0.005, snap = null } = {}) {
  const A = Q(), R = A.boss50.rig, T = R.T, v = Date.now();
  const P = await import('/src/actors/boss50Pose.js?v=' + v);
  if (snap != null) P.EASE.snap = (u) => 1 - Math.pow(1 - u, snap);
  const rest = []; T.scene.traverse((o) => { if (o.isBone) rest.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); });
  const ps = new P.PoseSpace(T.scene, T.gltf.animations.find((c) => c.name === 'TempMotion'));
  for (const [o, p, q, s] of rest) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }
  const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 57.2958;
  const names = clips || Object.keys(R.clips).filter((n) => R.clips[n].userData?.keys);
  const out = {};
  for (const nm of names) {
    const full = P.inheritKeys(R.clips[nm].userData.keys), dur = R.clips[nm].duration;
    for (const s of ['l', 'r']) {
      const st = { minWant: 9, minT: 0, dirRate: 0, dirT: 0, sideRate: 0, sideT: 0 };
      let prev = null;
      ps.elbowMemo = { step: P.BAKE.elbowRate * Math.PI / 180 * step };       // 与烘焙时一样限制肘的转速
      for (let t = 0; t <= dur + 1e-9; t += step) {
        ps.dbg = []; ps.solve(ps.specAt(full, t));
        const e = ps.dbg.find((x) => x.a === 'arm_stretch_' + s);
        if (!e) break;
        if (e.want < st.minWant) { st.minWant = e.want; st.minT = t; }
        if (prev) {
          const dr = ang(prev.dir, e.dir) / step, sr = ang(prev.side, e.side) / step;
          if (dr > st.dirRate) { st.dirRate = dr; st.dirT = t; }
          if (sr > st.sideRate) { st.sideRate = sr; st.sideT = t; }
        }
        prev = e;
      }
      out[`${nm}.${s}`] = `minWant ${st.minWant.toFixed(3)}@${st.minT.toFixed(3)} dir ${Math.round(st.dirRate)}°/s@${st.dirT.toFixed(3)} elbow ${Math.round(st.sideRate)}°/s@${st.sideT.toFixed(3)}`;
    }
  }
  ps.dbg = null;
  return out;
}

// 某一段的手臂 IK 逐帧明细（手目标离肩的距离、朝向提示的垂直分量 pp、肩→手方向、肘朝向）
export async function ikTrace(clip, side, t0, t1, step = 0.005) {
  const A = Q(), R = A.boss50.rig, T = R.T, v = Date.now();
  const P = await import('/src/actors/boss50Pose.js?v=' + v);
  const rest = []; T.scene.traverse((o) => { if (o.isBone) rest.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); });
  const ps = new P.PoseSpace(T.scene, T.gltf.animations.find((c) => c.name === 'TempMotion'));
  for (const [o, p, q, s] of rest) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }
  const full = P.inheritKeys(R.clips[clip].userData.keys), f = (a) => a.map((x) => x.toFixed(2)).join(',');
  const rows = [];
  ps.elbowMemo = { step: P.BAKE.elbowRate * Math.PI / 180 * step };
  for (let t = t0; t <= t1 + 1e-9; t += step) {
    ps.dbg = []; const sp = ps.specAt(full, t); ps.solve(sp);
    const e = ps.dbg.find((x) => x.a === 'arm_stretch_' + side);
    rows.push(`${t.toFixed(3)} want ${e.want.toFixed(3)} pp ${e.pp.toFixed(2)} dir ${f(e.dir)} side ${f(e.side)} tgt ${f(sp['hand' + side.toUpperCase()] || [])} pole ${f(sp['elbow' + side.toUpperCase()] || [])}`);
  }
  return rows.join('\n');
}

// 判定对照：每招在几处站位各放一次（玩家不动、不闪），记下受到的结算（结果、伤害、招式时刻）——改动作前后跑同一组，比对命中没变
export const HIT_CASES = [
  ['claw1', { d: 3.2 }], ['claw1', { d: 3.0, side: 2.0 }], ['claw1', { d: 3.0, side: -2.0 }], ['claw2', { d: 3.2 }], ['claw2', { d: 3.0, side: 1.8 }],
  ['combo3', { d: 3.2 }], ['combo3', { d: 2.8, side: -1.6 }], ['slam', { d: 3.0 }], ['tailsweep', { d: 3.0, behind: true }], ['tailsweep', { d: 3.2, side: 3.0 }],
  ['tailsweep', { d: 4.5 }], ['charge', { d: 9 }], ['jump', { d: 9 }], ['breath', { d: 5 }], ['orbs', { d: 8 }], ['thunder', { d: 6 }],
];
export async function hitTable(cases = HIT_CASES) {
  const B16 = await import('/tools/r16_boss_bot.js');
  const F = Q().boss50;
  if (F.state === 'dormant') { F.debug.start(); Q().tick(1 / 60, 30, false); F.debug.skip(); Q().tick(1 / 60, 60, false); }
  F.debug.hp('debug');
  const out = [];
  for (const [id, o] of cases) {
    const r = B16.runMove(id, { ...o, keepAlive: true });
    out.push(`${id} ${JSON.stringify(o)} → ${r.hits.map((h) => `${h.r}:${h.a}@${h.t}`).join(' ') || '无'}`);
  }
  return out;
}

// 爪的扫掠覆盖：每一下爪击在判定窗口里，爪尖相对出手朝向扫过的角度范围（度；正为龙的左边）。与 boss50Moves.js 的 SW 扇形对照
export async function sweepCover({ phase = 1 } = {}) {
  const B16 = await import('/tools/r16_boss_bot.js');
  const A = Q(), F = A.boss50, R = F.rig, T = A.THREE, U = A.combat.playerUnit;
  F.debug.phase(phase);
  const W = { claw1: [['claw1', 'r', 0.46, 0.66]], claw2: [['claw2a', 'l', 0.58, 0.80], ['claw2b', 'r', 0.92, 1.14]], combo3: [['combo1', 'r', 0.68, 0.88], ['combo2', 'l', 1.00, 1.20]] };      // 第十八轮的判定窗口（第十七轮为 0.62 / 0.96 / 0.72 / 1.04 起）
  if (phase === 2) W.claw2.push(['claw2x', 'l', 1.20, 1.38]);
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const out = {};
  for (const [id, list] of Object.entries(W)) {
    F.debug.ai(false); B16.stage({ d: 6 }); U.invuln = 99;
    F.debug.move(id);
    const st = {}; let n = 0;
    while (F.M && n < 400) {
      A.tick(1 / 60, 1, false); U.hp = U.maxHp; n++;
      const t = F.M?.t1 ?? 0;
      for (const [key, side, w0, w1] of list) {
        if (t < w0 || t > w1) continue;
        const S = st[key] ||= { yaw: R.yaw, lo: 999, hi: -999 };
        const c = R.claw(side, new T.Vector3()), a = wrap(Math.atan2(c.x - F.root.x, c.z - F.root.z) - S.yaw) * 57.3;
        if (Math.hypot(c.x - F.root.x, c.z - F.root.z) < 0.7) continue;
        S.lo = Math.min(S.lo, a); S.hi = Math.max(S.hi, a);
      }
    }
    for (const [k, S] of Object.entries(st)) out[k] = `${Math.round(S.lo)}° … ${Math.round(S.hi)}°`;
  }
  U.invuln = 0;
  if (phase === 2) F.debug.phase(1);
  return out;
}

// 头的朝向对照：龙待机、玩家站在正前方 6 米（之后挪到左前方 35°），在 0.5 / 3 / 6 / 9 秒各截一张头部特写；同时量吻端方向
// 相对龙身正前方的偏角（度，正为左）——第十七轮的头会歪着并越转越多，这一轮应稳定朝着玩家
export async function headShots(tag, { w = 960, h = 540 } = {}) {
  const B16 = await import('/tools/r16_boss_bot.js');
  const A = Q(), F = A.boss50, R = F.rig, T = A.THREE;
  F.debug.ai(false); B16.stage({ d: 6 });
  const out = []; let tNow = 0;
  for (const [i, secs, side] of [[0, 0.5, 0], [1, 3, 0], [2, 6, 0], [3, 9, 3.6]]) {
    if (side) { const f = R.forward, l = { x: f.z, z: -f.x }; A.player.place(F.root.x + f.x * 5.2 + l.x * side, F.root.z + f.z * 5.2 + l.z * side, 0, 0); }
    A.tick(1 / 60, Math.round((secs - tNow) * 60), false); tNow = secs;
    R.root.updateMatrixWorld(true);
    const hd = R.bonePos('head_x', new T.Vector3()), mo = R.mouth(new T.Vector3()), f = R.forward;
    const snout = Math.atan2(mo.x - hd.x, mo.z - hd.z) - Math.atan2(f.x, f.z), tilt = Math.atan2(mo.y - hd.y, Math.hypot(mo.x - hd.x, mo.z - hd.z));
    const toP = Math.atan2(A.player.pos.x - hd.x, A.player.pos.z - hd.z) - Math.atan2(f.x, f.z);
    const wrapD = (a) => Math.round(Math.atan2(Math.sin(a), Math.cos(a)) * 57.3);
    const l = { x: f.z, z: -f.x }, pos = [hd.x + f.x * 5.5 + l.x * 2.6, hd.y + 0.9, hd.z + f.z * 5.5 + l.z * 2.6];
    const s = await A.shot(`r18_tmp_headcmp_${tag}_${i}`, { w, h, pos, at: [hd.x, hd.y - 0.2, hd.z], fov: 38 });
    out.push({ t: secs, snoutYaw: wrapD(snout), snoutPitch: wrapD(tilt), playerAt: wrapD(toP), shot: s.status });
  }
  return out;
}

// 录像（第十八轮前后对照用）：龙待在场地中央、玩家站在身前，按同一顺序放一组招式，固定机位（龙的右前方 45°、11 米外、高 3.2 米）
// 每 every 帧录一帧（60 / every 帧每秒），帧上写版本与招式名；最后一段让玩家绕龙走（看转身）。
// 隐藏的预览页里每个 await 都会被节流到约 1 秒一次，所以先同步录完存在内存里（JPEG 的 data URL），最后再成批并行上传到
// docs/screenshots/r18_tmp_mv_<tag>_<序号>.jpg；moves 可分几次录（start 为起始序号）
export function recMoves(tag, { moves = ['claw1', 'combo3', 'tailsweep', 'slam', 'claw2', 'charge', 'jump'], w = 960, h = 540, every = 2, label = '', circle = 0 } = {}) {
  const A = Q(), F = A.boss50, R = A.renderer, T = A.THREE, U = A.combat.playerUnit, cam = A.camera;
  const scene = A.tower50.scene, present = A.present || ((s, c) => R.render(s, c));
  const NAMES = { claw1: '01 裂空龙爪', claw2: '02 双爪追猎', slam: '03 迟发碎岳', tailsweep: '04 龙尾回扫', combo3: '05 三段猎杀', charge: '06 破阵冲撞', jump: '07 跃空镇压', turn: '转身（玩家绕着龙走）' };
  const B16 = window.__B16;
  const keep = { s: R.getSize(new T.Vector2()), pr: R.getPixelRatio(), fov: cam.fov, aspect: cam.aspect, pos: cam.position.clone(), q: cam.quaternion.clone() };
  R.setPixelRatio(1); R.setSize(w, h, false); cam.aspect = w / h; cam.fov = 46; cam.updateProjectionMatrix();
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
  const frames = (window.__recFrames ||= []);
  let k = 0;
  const c0 = new T.Vector3(0, 0, -6);
  const shoot = (cap) => {
    cam.position.set(c0.x + Math.sin(0.8) * 11, 3.2, c0.z + Math.cos(0.8) * 11);
    cam.lookAt(c0.x, 2.2, c0.z);
    present(scene, cam);
    g.drawImage(R.domElement, 0, 0, w, h);
    g.fillStyle = 'rgba(8,6,14,.55)'; g.fillRect(0, 0, w, 34);
    g.font = '20px "Microsoft YaHei",sans-serif'; g.fillStyle = '#efe8ff'; g.textBaseline = 'middle';
    g.fillText(`${label}  ·  ${cap}`, 12, 17);
    frames.push(cv.toDataURL('image/jpeg', 0.9));
  };
  try {
    F.debug.hp('debug'); F.god = true;
    for (const id of moves) {
      F.debug.ai(false);
      B16.stage({ bx: 0, bz: -6, yaw: 0, d: id === 'jump' || id === 'charge' ? 9 : 3.6 });
      U.invuln = 99;
      for (let i = 0; i < 20; i++) { A.tick(1 / 60, 1, false); if (++k % every === 0) shoot(NAMES[id]); }
      F.debug.move(id);
      let i = 0;
      while (F.M && i < 600) { A.tick(1 / 60, 1, false); U.hp = U.maxHp; i++; if (++k % every === 0) shoot(NAMES[id]); }
      for (let j = 0; j < 40; j++) { A.tick(1 / 60, 1, false); if (++k % every === 0) shoot(NAMES[id]); }
    }
    if (circle > 0) {
      B16.stage({ bx: 0, bz: -6, yaw: 0, d: 6 });
      F.debug.ai(true);
      const a0 = Math.atan2(A.player.pos.x - c0.x, A.player.pos.z - c0.z);
      for (let i = 0; i < Math.round(circle * 60); i++) {
        const ang = a0 + i / 60 * 0.6;
        A.player.place(c0.x + Math.sin(ang) * 6, c0.z + Math.cos(ang) * 6, Math.atan2(c0.x - A.player.pos.x, c0.z - A.player.pos.z), 0);
        F.B.gapT = 99; F.B.pending = null;
        A.tick(1 / 60, 1, false); U.hp = U.maxHp;
        if (++k % every === 0) shoot(NAMES.turn);
      }
      F.debug.ai(false);
    }
  } finally {
    U.invuln = 0; F.god = false;
    R.setPixelRatio(keep.pr); R.setSize(keep.s.x, keep.s.y, false); cam.fov = keep.fov; cam.aspect = keep.aspect; cam.updateProjectionMatrix(); cam.position.copy(keep.pos); cam.quaternion.copy(keep.q);
  }
  return frames.length;
}
// 把内存里录好的帧成批并行上传（每批 batch 张），上传完清空
export async function flushFrames(tag, { batch = 40, start = 0 } = {}) {
  const frames = window.__recFrames || [];
  let n = start;
  for (let i = 0; i < frames.length; i += batch) {
    await Promise.all(frames.slice(i, i + batch).map(async (u, j) => {
      const blob = await (await fetch(u)).blob();
      await fetch(`/__shot/r18_tmp_mv_${tag}_${String(n + i + j).padStart(4, '0')}`, { method: 'POST', body: blob });
    }));
  }
  const total = frames.length;
  window.__recFrames = [];
  return n + total;
}

// 几场整局对照（r16 的自动打法）：每个种子一场，失败 / 通关后关掉结算界面、复原、重新开战。返回每场的时长、阶段、伤害、受击、龙出了几招
export async function botSeries(seeds = [3, 11, 23], { secs = 150 } = {}) {
  const A = Q(), F = A.boss50, B = await import('/tools/r16_boss_bot.js');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  for (const seed of seeds) {
    if (A.ui.busy) A.ui.closePanel();
    for (let i = 0; i < 20 && F.busy; i++) await sleep(200);
    if (F.state !== 'dormant') { await F.retry(true); }
    A.tick(1 / 60, 5, false);
    B.stage({ d: 6 }); F.debug.start(); A.tick(1 / 60, 30, false); F.debug.skip(); A.tick(1 / 60, 60, false);
    F.debug.ai(true); F.debug.hp('normal');
    const r = await B.bot({ secs, skill: 1, seed });
    out.push({ seed, t: r.t, state: r.state, phase: r.phase, bossHp: r.bossHp, dealt: r.dealt, hits: r.hits, attacks: r.attacks, moves: Object.values(r.moves || {}).reduce((a, b) => a + b, 0), fightT: r.fightT });
  }
  if (A.ui.busy) A.ui.closePanel();
  return out;
}
