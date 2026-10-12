// 第二十四轮：通天塔第三十层 · 烬狱剑尊的挑战流程与战斗。
// 流程：一层楼层传送阵选第 30 层 → 挑战说明 → 进入烬狱剑台（未触发：台心一堆暗红的余烬）→ 走上台 → 出场过场 → 一阶段（剑式为主、少量火焰）→
//   阶段转换过场 → 0.8 秒后二阶段（剑式照旧，火焰更多、场地升温，「焚天断界」秒杀）→ 击败过场 → 结算（奖励只发一次）→ 再次挑战 / 返回通天塔一层；
//   玩家力竭：失败过场 → 重新挑战 / 返回。重试把两个阶段、架势、冷却、场地、危险物、伤害统计全部复原。
// 统一状态管理（B.mode）：dormant / cine / idle / walk / turn / move（出招）/ recoil（被弹反的完整收势）/ break（架势崩溃）/ guard（截锋架势）/ react（受击）；
//   切换一律经 setMode（清掉上一个状态的计时，不叠加）。被弹反在连段中途：时间轴暂停 0.15 秒（hitchT，期间动作、判定、转身一起停，不追帧）。
// 判定：剑式按剑的真实轨迹（握点 → 剑尖，每帧扫过的面细分几步）对玩家身体（竖直胶囊）连续检测，一段对同一目标只命中一次；
//   火浪、火纹、火柱、火痕、焚天断界都是独立的危险物，与刀身分别判定，都不可格挡也不可弹反（闪身无敌或离开范围可避）。
// 参数都在 boss30Config.js；招式数据在 boss30Moves.js；模型与动作层 actors/boss30.js；特效 boss30Fx.js；过场 boss30Cine.js；界面 ui/boss30Hud.js；场地 world/tower30.js。
// 第二十六轮：剑尊放大到约 4 米（距离类参数按 SIZE30 放大）；出招时按每一击的 lean 俯身（leanTarget → rig.lean）；
//   慢刀：举剑那一段放快、停顿缩短、停顿之后的一刀更快（nextSeg 的 raise / snap 区段）；
//   打击感：刀落到玩家身上（命中 / 被挡）加重顿帧、剑尊自己顿一下、震屏、暖白一闪、重击声；劈到地上炸开尘浪与发光的裂纹（groundHit）。
import * as THREE from 'three';
import { Boss30Rig, loadBoss30, freeBoss30Gpu, segSeg } from '../actors/boss30.js';
import { Boss30Fx } from './boss30Fx.js';
import { BOSS30, CONFIG30, COMBO_ORDER, COMBO_AI, FIRE30, FIRE_ORDER, SIZE30 } from './boss30Config.js';
import { comboMove, specialMove, fireMove, ultMove } from './boss30Moves.js';
import { T30 } from '../world/tower30.js';
import { DEMON } from './combat.js';
import { PLAYER_COMBAT, PLAYER_MOVES } from './combatConfig.js';
import { Boss30Cine } from './boss30Cine.js';
import { Boss30Hud } from '../ui/boss30Hud.js';
import { TH_SPOTS } from '../world/towerHall.js';

const CFG = CONFIG30;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const fmt30 = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _g = new THREE.Vector3(), _t = new THREE.Vector3();
const FREE = new Set(['idle', 'walk', 'turn']);
const SKILL_KEYS = new Set(['qi', 'seal', 'phoenix', 'dragon', 'ult', 'heavy', 'dash', 'power', 'iai']);
const BOSS_MUSIC = {
  intro: 'assets/sound effect/boss/freesound_community-boss-intro-02-72039.mp3',
  battle: 'assets/sound effect/boss/freesound_community-lightning-tiger-god-loop-50249.mp3',
};
const QS = new URLSearchParams(location.search);
const DEBUG = QS.has(CFG.debugKey);

export class Boss30Fight {
  constructor(game, { combat, moves, player, cam, input, pointer, sfx, sound, hall, quality }) {
    this.g = game; this.C = combat; this.Mv = moves; this.P = player; this.cam = cam; this.input = input; this.pointer = pointer;
    this.sfxSkill = sfx; this.sound = sound; this.arena = hall; this.quality = quality;
    this.state = 'off';
    this.rig = null; this.fx = null; this.M = null; this.hz = []; this.zones = [];
    this.phase = 1;
    this.hud = new Boss30Hud();
    this.cine = new Boss30Cine(this);
    this.onHit = (e) => this.statHit(e);
    this.aiOn = true; this.god = false; this.hpMode = QS.get('boss30hp') === 'debug' ? 'debug' : 'normal';
    this.dt = 0; this.time = 0;
    this.unit = this.makeUnit();
    this.trace = [];                 // 测试用：出手、判定、弹反、状态切换的时间线（只留最近 400 条）
    if (DEBUG) this.buildDebug();
  }
  get active() { return this.state !== 'off'; }
  get combatHold() { return this.active && (this.cine.active || ['intro', 'transition', 'victory', 'exec'].includes(this.state)); }
  get fighting() { return this.state === 'fight'; }
  get blockMove() { return this.active && ['intro', 'transition', 'victory', 'exec', 'exiting'].includes(this.state); }
  get blockAct() { return this.active && this.state !== 'fight' && this.state !== 'dormant' && this.state !== 'result' && this.state !== 'failed'; }
  get root() { return this.rig.root.position; }
  get k() { return this.phase === 2 ? CFG.p2 : { move: 1, recover: 1, dmg: 1 }; }
  hpPool(p) { const H = this.hpMode === 'debug' ? CFG.hpDebug : CFG.hp; return p === 2 ? H.p2 : H.p1; }
  log(type, o = {}) { this.trace.push({ n: (this.traceN = (this.traceN || 0) + 1), t: +this.time.toFixed(3), ft: +(this.fightT ?? 0).toFixed(3), type, ...o }); if (this.trace.length > 400) this.trace.shift(); }
  since(n) { return this.trace.filter((e) => e.n > n); }

  // ---------- 战斗目标（给 combat / moves / 凤凰 / 雷龙用）：位置是 Boss 身上离玩家最近的一点 ----------
  makeUnit() {
    const F = this;
    return {
      boss: true, id: 'boss30', kind: 'boss30', world: 'boss30', faction: DEMON, name: BOSS30.name, level: BOSS30.level, realm: BOSS30.realm,
      pos: new THREE.Vector3(0, 0, -5), radius: 0.6, hp: 1, maxHp: 1, alive: false, engaged: true, state: 'boss',
      cfg: { name: BOSS30.name, scale: 1 }, headY: BOSS30.height * BOSS30.scale, yaw: 0, st: { slow: 0, slowK: 1, freeze: 0, burn: 0, burnDps: 0, hits: 0 },
      part: 'body', hitPoint: new THREE.Vector3(),
      bar: { set() {}, place() {}, remove() {} },
      immune: () => F.state !== 'fight' || F.B?.mode === 'cine' || F.noDmg,
      hidden: () => F.state !== 'fight' || F.cine.active,
      // 凤翔天击的阶段斩杀：只能由一阶段进入二阶段（走 Boss 自己的阶段结束流程，不追加冲击伤害）；二阶段不吃秒杀
      protected: () => F.phase !== 1,
      receive: (amount, o) => F.receive(amount, o),
      stageInfo: () => ({ id: `b30:p${F.phase}`, index: F.phase, final: F.phase === 2, structure: 'pools', target: 'boss30' }),
      endStage: (o) => F.executeStage(o),
      capsules: () => (F.rig ? F.rig.caps.map((c) => ({ a: c.a, b: c.b, r: c.r, part: c.part })) : []),
      get stageMax() { return this.maxHp; },
      onParried: (spec, at) => F.onParried(spec, at),
      bind: (time, posture) => F.bind(time, posture),
      stagger() {},
    };
  }

  // =====================================================================================
  // 入口：挑战说明 → 进入第三十层
  // =====================================================================================
  openChallenge() {
    const g = this.g, ui = g.ui, R = this.record();
    const el = document.createElement('div');
    el.className = 'b30-panel';
    el.innerHTML = `
      <div class="b30-intro"><i class="seal">烬</i><div><b>${BOSS30.name}</b><small>通天塔第三十层守关 · ${BOSS30.realmText}（${BOSS30.level} 级）</small></div></div>
      <p>剑台中央积着一堆不灭的余烬。走上剑台，余烬便会凝成一位持剑的骑士。火墙升起之后，<b>胜负未分不能离台</b>（按 <b>退格</b> 可放弃挑战）。</p>
      <div class="kv">
        <b>两个阶段</b><span>一阶段气血 ${this.hpPool(1)}；耗尽后余烬复燃，二阶段气血 ${this.hpPool(2)}（另起一条）：剑式照旧，火焰更多，并有一记蓄力的「焚天断界」</span>
        <b>剑式</b><span>十套连招，快刀前摇短、慢刀会举剑停顿；所有刀身都能格挡与弹反。连段中途被弹反只顿一下，收招的一击被弹反才会完整收势</span>
        <b>火焰</b><span>地上的火纹、火浪、火柱、火痕都不可格挡、不可弹反：看清图案与边线，闪身或离开范围</span>
        <b>焚天断界</b><span>剑尊跃到台心举剑蓄力 5.5 秒，台面 3/4 化作火阵（亮边以内）：跑到亮边以外的外圈，或在爆发的一刻闪身</span>
        <b>架势</b><span>弹反、重击都会积累架势；架势满了剑尊单膝跪地，片刻不能出手</span>
        <b>注意</b><span>剑尊会架剑截击正面的近战（看到举剑横档就别硬砍），也会追击远远后撤的闪身</span>
        <b>记录</b><span>${R.wins ? `已通关 ${R.wins} 次 · 最佳用时 ${fmt30(R.best)}` : '尚未通关'}${R.firstReward ? ' · 首通奖励已领取' : ''}</span>
      </div>
      <div class="ar-act"><button class="act" data-go>进入第三十层</button><button class="act ghost" data-cancel>暂且不去</button></div>`;
    let go = false;
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-go]')) { go = true; ui.closePanel(); }
      else if (e.target.closest('[data-cancel]')) ui.closePanel();
    });
    g.panelKind = 'boss30';
    ui.openPanel('通天塔 · 第三十层', '守关 · ' + BOSS30.name, el, { width: 660, onClose: () => { if (g.panelKind === 'boss30') g.panelKind = null; if (go) this.enter(); else this.relock(); } });
  }
  record() {
    const S = this.g.state.d;
    if (!S.tower30 || typeof S.tower30 !== 'object') S.tower30 = { wins: 0, best: null, firstClear: null, firstReward: false, tries: 0 };
    return S.tower30;
  }
  async prepare() { this.T = await loadBoss30(); return this.T; }

  async enter() {
    const g = this.g, ui = g.ui;
    if (this.state !== 'off' || this.busy) return;
    this.busy = true; g.lock = true;
    const fade = $('#fade');
    fade.classList.add('dark', 'on');
    await sleep(550);
    try {
      ui.toast('剑台的火门开启中……');
      await this.prepare();
      await g.switchWorld('boss30');
      await this.enterScene();
    } catch (e) {
      console.error(e);
      ui.toast('第三十层的火门未能开启（' + (e.message || e) + '）');
      try { if (g.world !== 'tower') await g.switchWorld('tower'); } catch (e2) { /* 已在塔内 */ }
      this.teardown();
      fade.classList.remove('on'); setTimeout(() => fade.classList.remove('dark'), 1200);
      g.lock = false; this.busy = false;
      return;
    }
    await sleep(150);
    fade.classList.remove('on'); setTimeout(() => fade.classList.remove('dark'), 1200);
    g.lock = false; this.busy = false;
    ui.banner('通天塔 · 第三十层', '烬狱剑台 · 走上剑台，余烬便会凝形');
    setTimeout(() => this.state === 'dormant' && ui.toast('桥头拱门下按 <b>E</b> 可回到一层；开战之后按 <b>退格</b> 放弃挑战'), 2600);
  }

  async enterScene() {
    const C = this.C, scene = this.arena.scene;
    this.rig = new Boss30Rig(this.T, scene);
    this.fx = new Boss30Fx(scene, { quality: this.quality === 'low' ? 0.5 : 1 });
    this.fx.sz = Math.sqrt(SIZE30);                  // 第二十六轮：剑上的火、闪光随剑的大小
    await this.fx.load();
    this.fx.shakeHook = (v) => C.shake(v);
    this.fx.flashHook = (c, k) => this.sfxSkill?.flash(c, k);
    C.hitListeners.add(this.onHit);
    if (!C.extraTargets.includes(this.unit)) C.extraTargets.push(this.unit);
    this.Mv.onDodge = (e) => this.onDodge(e);
    this.camSave = this.cam.getState();
    this.cam.set(null, 0.2, 6.6);
    this.hud.mount();
    this.resetFight(false);
    this.debugEl?.classList.remove('hidden');
  }

  // 一切复原到「未触发」：台心一堆余烬（Boss 未凝形），火墙落下、火盆燃着，双方气血灵力复原、冷却清零
  resetFight(placePlayer = true) {
    this.g.finale?.newInstance('retry');              // 第二十五轮：重试——作废旧的处决记录、清掉墨势（新的战斗实例）
    this.finaleHold = null; this.finaleDefer = null;
    this.g.phoenix?.clear('retry');
    this.g.dragon?.clear('retry');
    this.cine.stop(true);
    this.musicTo('off', 0.8);
    this.cancelMove(true);
    this.clearHazards();
    this.fx?.clear();
    const R = this.rig;
    R.restoreSword();
    R.root.position.set(T30.boss.x, 0, T30.boss.z); R.setYaw(T30.boss.yaw); R.root.rotation.y = R.yaw;
    R.look.w = 0; R.look.yaw = R.look.pitch = 0; R.tremble = 0;
    const U = R.U;
    U.uIgnite.value = 0; U.uAsh.value = 0; U.uForm.value = 0; U.uGlowK.value = 1.6; U.uBlade.value = 0; U.uFlash.value = 0; U.uHot.value.w = 0;
    R.root.visible = true;
    R.play('idle_sheathed', { fade: 0 });
    this.arena.reset();
    this.phase = 1;
    this.unit.maxHp = this.unit.hp = this.hpPool(1); this.unit.alive = true;
    this.posture = 0; this.postureT = 0; this.pendingBreak = false; this.hitchT = 0; this.boundT = 0;
    this.B = { mode: 'dormant', t: 0, data: {}, gapT: 1.0, pending: null, approachT: 0, last: [], usedAt: {} };
    this.cd = { guard: 3, roll: 0, ult: 0, react: 0, fire: {} };
    this.p1Done = false; this.p2Done = false; this.downDone = false; this.rewarded = false; this.debugUsed = false; this.god = false; this.aiOn = true;
    this.habit = { front: [], farCast: -99, stillT: 0, lastPos: new THREE.Vector3(), lastAct: null };
    this.stats = { t: 0, dealt: 0, taken: 0, blocks: 0, parries: 0, dodges: 0, staggers: 0, hits: 0, combo: 0, p1t: 0, moves: {}, guards: 0, deflects: 0, rolls: 0, ults: 0 };
    this.fightT = 0; this.phaseT = 0; this.noDmg = false; this.chain = [];
    this.C.noRegen = false; this.C.bossFight = false; this.C.forceHud = false;
    this.hud.show(false); this.hud.setPhase(1, false); this.hud.ult(null);
    if (placePlayer) this.placePlayer(T30.respawn);
    this.restorePlayer();
    this.state = 'dormant';
    this.log('reset');
  }
  placePlayer(p) {
    this.P.place(p.x, p.z, p.yaw, 0);
    this.P.vel.set(0, 0, 0);
    this.cam.set(p.yaw, 0.2, 6.6);
    this.cam.snap(new THREE.Vector3(p.x, 1.55, p.z));
  }
  restorePlayer() {
    const U = this.C.playerUnit, M = this.Mv;
    U.hp = U.maxHp; U.alive = true; U.invuln = 0;
    M.reset(); M.mp = M.mpMax ?? PLAYER_COMBAT.mp;
    M.refillGourd();
    for (const k in M.cools) M.cools[k] = 0;
    this.C.hud.setHp(U.hp, U.maxHp);
    this.P.char.anim.stop(0.1);
  }

  // =====================================================================================
  // 每帧
  // =====================================================================================
  update(dt) {
    if (!this.active || !this.rig) return;
    if (this.g.world && this.g.world !== 'boss30' && this.state !== 'exiting' && !this.busy) { this.teardown(); return; }
    const ui = this.g.ui;
    if (ui.busy && !this.cine.active) { this.hud.pause(true); if (!this.musicPaused) { this.musicPaused = true; this.sound?.duckMusic?.(0.4, 0.4); } return; }
    this.hud.pause(false);
    if (this.musicPaused) { this.musicPaused = false; this.sound?.duckMusic?.(1, 0.6); }
    // 第二十五轮：被终式处决接管——不出招、不走、火焰与危险物停住（姿势由演出按它自己的时钟给，见 finalePose）
    if (this.finaleHold) return;
    this.dt = dt; this.time += dt;
    const R = this.rig, P = this.P;
    if (this.cine.active) this.cine.update(dt);
    if (this.state === 'dormant' && !this.busy) {
      const r = Math.hypot(P.pos.x, P.pos.z);
      if (r < T30.trigger && P.pos.y < 1) this.startIntro();
    }
    if (this.state === 'fight') { this.fightT += dt; this.phaseT += dt; this.stats.t = this.fightT; }
    // 连段中途被弹反：时间轴整体暂停（动作、判定、转身、根运动），不追帧
    let rdt = dt;
    if (this.hitchT > 0) { this.hitchT -= dt; rdt = 0; }
    if (this.boundT > 0) { this.boundT -= dt; rdt *= 0.15; }
    const slow = this.cine.slow ?? 1;
    const mo = R.advance(rdt * slow);
    if (!this.M?.noRoot) { if (this.M) this.spacing(mo); this.moveBoss(mo.x, mo.z); }
    if (this.state === 'fight') this.locomotion(dt);
    R.look.w += ((this.lookW ?? 0) - R.look.w) * Math.min(1, dt * 4);
    R.lean.target = this.state === 'fight' ? this.leanTarget() : 0;
    R.pose(dt * slow, { lookAt: _w.set(P.pos.x, P.pos.y + 1.4, P.pos.z) });
    R.finish(this.time, dt);
    if (this.state === 'fight') { this.updateAI(dt, rdt); this.updatePosture(dt); this.updateHabits(dt); }
    this.updateHazards(dt);
    this.updateProxy();
    if (this.state === 'fight' || this.state === 'dormant') this.pushPlayer();
    if (this.state === 'fight') this.keepPlayerIn();
    this.ambient(dt);
    this.fx.update(dt);
    this.hud.update(dt, this);
  }
  // 火盆、二阶段身上的余烬、剑上的火
  ambient(dt) {
    const A = this.arena, R = this.rig;
    for (const f of A.fire) this.fx.brazier(f.pos, f.k);
    if (this.state === 'dormant') { if (Math.random() < 0.5) this.fx.ashes([_v.set(T30.boss.x, 0.15, T30.boss.z).clone()], 1, false); return; }
    if (this.phase === 2 && R.U.uAsh.value < 0.01 && R.U.uForm.value > 0.99) this.fx.bodyEmbers(this.bodyPoints(), 1);
    if (R.U.uBlade.value > 0.2 && R.swordAttached && Math.random() < 0.5 * R.U.uBlade.value) this.fx.bladeCharge(R.swordTip, R.swordGrip, 0.35 * R.U.uBlade.value);
    void dt;
  }
  bodyPoints() { const R = this.rig; return [R.chest(new THREE.Vector3()), R.bonePos('clavicle_l', new THREE.Vector3()), R.bonePos('clavicle_r', new THREE.Vector3()), R.bonePos('spine_03', new THREE.Vector3()), R.bonePos('head', new THREE.Vector3())]; }

  // ---------- 过场用 ----------
  bossName() { return BOSS30.name; }
  gameCam() {
    const P = this.P.pos, r = this.rig ? this.root : new THREE.Vector3(0, 0, -5);
    const yaw = Math.atan2(r.x - P.x, r.z - P.z), d = 7.8, pitch = 0.24;
    const pos = new THREE.Vector3(P.x - Math.sin(yaw) * d * Math.cos(pitch), P.y + 1.55 + Math.sin(pitch) * d, P.z - Math.cos(yaw) * d * Math.cos(pitch));
    return { pos, at: new THREE.Vector3(P.x, P.y + 1.55, P.z) };
  }
  cameraBehind() {
    const P = this.P.pos;
    if (!this.rig) return;
    const yaw = Math.atan2(this.root.x - P.x, this.root.z - P.z);
    this.cam.set(yaw, 0.24, 7.8);
    this.cam.snap(new THREE.Vector3(P.x, P.y + 1.55, P.z));
  }
  playerChest() {
    if (!this.chestBone) this.P.char.root.traverse((o) => { if (!this.chestBone && o.isBone && /Spine2$/.test(o.name)) this.chestBone = o; });
    const v = new THREE.Vector3();
    if (this.chestBone) { this.chestBone.getWorldPosition(v); return v; }
    return v.copy(this.P.pos).add(new THREE.Vector3(0, 1.2, 0));
  }

  // ---------- 开战 ----------
  startIntro() {
    if (this.state !== 'dormant') return;
    this.state = 'intro';
    this.record().tries = (this.record().tries || 0) + 1; this.g.state.save();
    this.releaseInputs();
    this.setMode('cine');
    this.musicTo('intro');
    this.log('intro');
    this.cine.play('intro', () => this.beginFight());
  }
  beginFight() {
    if (this.state === 'off' || this.state === 'exiting') return;
    if (!this.g.prog?.granted('boss30.first')) this.g.prog?.recordEvent('boss30', BOSS30.level);
    this.state = 'fight';
    this.setMode('idle'); this.B.gapT = CFG.cine.prep;           // 镜头回到玩家后再准备 0.8 秒
    this.C.noRegen = true; this.C.bossFight = true; this.C.forceHud = true;
    this.hud.show(true); this.hud.setPhase(1, true);
    this.lookW = 1;
    this.rig.play('idle', { fade: 0.25 });
    this.musicTo('battle');
    this.releaseInputs();
    this.relock();
    this.log('fight');
  }
  musicTo(which, fade = 1.5) {
    const S = this.sound;
    if (!S?.music) return;
    S.duckMusic(1, 0.3);
    if (which === 'intro') { S.stopMusic('b30battle', 0.8); S.music('b30intro', BOSS_MUSIC.intro, { gain: 0.8, fade: 0.6 }); }
    else if (which === 'battle') { S.music('b30battle', BOSS_MUSIC.battle, { loop: true, gain: 0.62, fade: 2.5 }); S.stopMusic('b30intro', 3); }
    else S.stopMusic(null, fade);
  }

  // =====================================================================================
  // 统一状态管理
  // =====================================================================================
  setMode(mode, data = {}) {
    const B = this.B;
    if (B.mode === mode && mode !== 'move') { B.data = { ...B.data, ...data }; return; }
    if (B.mode === 'guard' && mode !== 'guard') this.hud.move(null);
    B.mode = mode; B.t = 0; B.data = data;
    if (mode !== 'move') this.rig.tremble = 0;
    this.log('mode', { mode });
  }
  toIdle(gap = null) {
    this.setMode('idle');
    this.B.gapT = gap ?? this.gapTime();
    this.lookW = 1;
    this.rig.play('idle', { fade: 0.3 });
  }
  gapTime() { const g = this.phase === 2 ? CFG.gap.p2 : CFG.gap.p1; return g[0] + Math.random() * (g[1] - g[0]); }

  // =====================================================================================
  // AI
  // =====================================================================================
  get tgt() {
    if (this.aimPh) { const u = this.C.allies.find((a) => a.phoenix && a.alive && a.world === 'boss30'); if (u) return (this._ph ||= { pos: new THREE.Vector3(), vel: new THREE.Vector3() }, this._ph.pos.copy(u.pos), this._ph); this.aimPh = false; }
    return this.P;
  }
  victims() {
    const out = [{ pos: this.P.pos, unit: this.C.playerUnit, tag: '', isPlayer: true, r: CFG.hit.player.r, y0: CFG.hit.player.y0, y1: CFG.hit.player.y1 }];
    for (const u of this.C.allies) if (u.alive && u.world === 'boss30') out.push({ pos: u.pos, unit: u, tag: '#ph', isPlayer: false, r: Math.max(0.6, u.radius ?? 0.8), y0: -0.6, y1: 0.8 });
    return out;
  }
  playerRel(p = this.tgt.pos) {
    const r = this.root, dx = p.x - r.x, dz = p.z - r.z;
    return { d: Math.hypot(dx, dz), a: wrap(Math.atan2(dx, dz) - this.rig.yaw) };
  }
  aimDir() { const p = this.tgt.pos, r = this.root; return _a.set(p.x - r.x, 0, p.z - r.z).normalize().clone(); }
  updateAI(dt, rdt) {
    const B = this.B;
    B.t += dt;
    for (const k of ['guard', 'roll', 'ult', 'react']) this.cd[k] = Math.max(0, this.cd[k] - dt);
    for (const k in this.cd.fire) this.cd.fire[k] = Math.max(0, this.cd.fire[k] - dt);
    if (B.mode === 'move') { this.runMove(rdt, dt); return; }
    if (B.mode === 'recoil') { if (B.t >= B.data.dur) this.toIdle(0.35); return; }
    if (B.mode === 'break') { this.updateBreak(dt); return; }
    if (B.mode === 'guard') { this.updateGuard(dt); return; }
    if (B.mode === 'react') { if (B.t >= B.data.dur) this.toIdle(Math.max(0.2, B.gapT)); return; }
    if (B.mode === 'cine' || B.mode === 'dormant') return;
    if (this.pendingBreak) { this.pendingBreak = false; this.postureBreak(); return; }
    B.gapT -= dt;
    const { d, a } = this.playerRel();
    if (!this.aiOn) { this.idleFace(dt, a); return; }
    if (this.tryGuard(d, a)) return;
    if (!B.pending && B.gapT <= 0) { this.aimPh = !!this.C.targetFor?.(this.unit); B.pending = this.choose(d, a); B.approachT = 0; }
    const pend = B.pending;
    if (pend) {
      const rng = pend.range || [0, 99];
      if (d > rng[1] && B.approachT < 3.2) { B.approachT += dt; this.walkToward(dt, a, d); return; }
      if (Math.abs(a) > 0.32 && !pend.anyFacing) { this.turnToward(dt, a); return; }
      B.pending = null; B.approachT = 0;
      this.startMove(pend.build());
      return;
    }
    if (d > CFG.zone.walk) this.walkToward(dt, a, d);
    else this.idleFace(dt, a);
  }
  // 选招：剑 / 火两族按阶段比例（一阶段 75 / 25，二阶段 55 / 45）；族内按距离档与习惯加权，刚用过的降权；焚天断界好了优先
  choose(d, a) {
    const B = this.B, zone = d < CFG.zone.close ? 'close' : d < CFG.zone.mid ? 'mid' : 'far', W = CFG.weights, H = this.habit, t = this.fightT;
    void a;
    if (this.phase === 2 && this.cd.ult <= 0 && this.phaseT >= CFG.ult.firstAfter && Math.random() < 0.75) return { id: 'ult', range: [0, 99], anyFacing: true, build: () => ultMove() };
    const fresh = (id) => (B.last[0] === id ? 0.08 : B.last.includes(id) ? 0.5 : 1);
    const sword = [], fire = [];
    for (const id of COMBO_ORDER) { const w = (COMBO_AI[id][zone] || 0.05) * fresh(id); sword.push([id, w]); }
    const still = H.stillT >= W.still.secs, far = t - H.farCast < W.farCast.window;
    for (const id of FIRE_ORDER) {
      const D = FIRE30[id];
      if (D.p === 2 && this.phase !== 2) continue;
      if ((this.cd.fire[id] || 0) > 0) continue;
      let w = (D.ai[zone] || 0.05) * fresh(id);
      if (far && (id === 'F01' || id === 'F04')) w *= W.farCast.k;
      if (still && (id === 'F02' || id === 'F05')) w *= W.still.k;
      fire.push([id, w]);
    }
    const ratio = this.phase === 2 ? W.p2 : W.p1;
    let fireK = ratio.fire;
    if (far || still) fireK = Math.min(0.85, fireK * 1.6);           // 习惯只调权重：远处施法、站着不动时多出火
    const fam = fire.length && Math.random() < fireK ? fire : sword;
    const sum = fam.reduce((s, x) => s + x[1], 0);
    let r = Math.random() * sum, pick = fam[fam.length - 1][0];
    for (const [id, w] of fam) { r -= w; if (r <= 0) { pick = id; break; } }
    if (fam === fire) return { id: pick, range: pick === 'F02' || pick === 'F05' ? [0, 6 * SIZE30] : [0, 14], build: () => fireMove(pick, this) };
    const D = comboMove(pick);
    return { id: pick, range: D.def.range, build: () => D };
  }
  walkToward(dt, a, d) {
    const R = this.rig, B = this.B;
    const run = d > CFG.zone.run;
    if (B.mode !== 'walk' || B.data.run !== run) { this.setMode('walk', { run }); R.play(run ? 'run_f' : 'walk_f', { fade: 0.25, loop: true, speed: run ? CFG.runAnim : 1 }); }
    const rate = CFG.turn.idle * (this.phase === 2 ? CFG.turn.p2K : 1);
    R.turn(Math.sign(a) * Math.min(Math.abs(a), rate * dt));
  }
  // 原地转身：踏侧步（walk_l / walk_r）同时转向，脚不在地上打滑
  turnToward(dt, a) {
    const R = this.rig, B = this.B, side = a > 0 ? 'l' : 'r';
    if (B.mode !== 'turn' || B.data.side !== side) { this.setMode('turn', { side }); R.play('walk_' + side, { fade: 0.2, loop: true, speed: 1.2 }); }
    const rate = CFG.turn.idle * (this.phase === 2 ? CFG.turn.p2K : 1);
    R.turn(Math.sign(a) * Math.min(Math.abs(a), rate * dt));
  }
  idleFace(dt, a) {
    if (Math.abs(a) > 0.45) { this.turnToward(dt, a); return; }
    const B = this.B, R = this.rig;
    if (B.mode !== 'idle') { this.setMode('idle'); R.play('idle', { fade: 0.25 }); }
    R.turn(Math.sign(a) * Math.min(Math.abs(a), 0.6 * dt));
  }
  // 走路、跑：按速度推着走（动作的根运动不取）
  locomotion(dt) {
    const B = this.B;
    if (B.mode === 'walk') {
      const f = this.rig.forward, v = (B.data.run ? CFG.run : CFG.walk)[this.phase === 2 ? 'p2' : 'p1'];
      this.moveBoss(f.x * v * dt, f.z * v * dt);
      if ((this.stepT = (this.stepT ?? 0) - dt) <= 0) { this.stepT = B.data.run ? 0.32 / CFG.runAnim : 0.48; this.sfx('step', { at: this.root, gain: 1.0, pitch: 0.7 }); this.C.shake(0.03); }
    }
  }
  // 间距修正：出招的根运动不把剑尊推到离目标 hit.gap 米以内（只去掉朝着目标的那一部分，横移、后撤照旧）
  spacing(mo) {
    const p = this.tgt.pos, r = this.root, dx = p.x - r.x, dz = p.z - r.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) return;
    const ux = dx / d, uz = dz / d, along = mo.x * ux + mo.z * uz, room = d - CFG.hit.gap;
    if (along > 0 && along > room) { const cut = along - Math.max(0, room); mo.x -= ux * cut; mo.z -= uz * cut; }
  }
  moveBoss(dx, dz) {
    const r = this.root;
    r.x += dx; r.z += dz;
    const d = Math.hypot(r.x, r.z), K = CFG.arena.keepIn;
    this.blocked = false;
    if (d > K) { r.x *= K / d; r.z *= K / d; this.blocked = true; }
  }

  // =====================================================================================
  // 招的执行器
  // =====================================================================================
  startMove(M) {
    const B = this.B;
    M.uid = (this.moveSeq = (this.moveSeq || 0) + 1);
    M.si = -1; M.hits = new Set(); M.logs = []; M.t0 = this.time; M.data = {}; M.ev = new Set();
    // 最后一击（被弹反即完整收势的那一击）
    const keys = M.segs.flatMap((s) => (s.hits || []).map((h) => h.key));
    M.lastKey = keys[keys.length - 1] || null;
    M.lastSeg = M.segs.reduce((k, s, i) => ((s.hits || []).length ? i : k), -1);
    this.M = M;
    this.setMode('move');
    B.last.unshift(M.id); B.last.length = Math.min(B.last.length, 3);
    B.usedAt[M.id] = this.fightT;
    this.stats.moves[M.id] = (this.stats.moves[M.id] || 0) + 1;
    if (M.kind === 'fire') this.cd.fire[M.id] = FIRE30[M.id].cd;
    this.lookW = 0.3;
    this.hud.move(`${M.no} · ${M.name}`, M.kind === 'fire' || M.kind === 'ult');
    this.log('move', { id: M.id, uid: M.uid });
    if (M.kind === 'ult') { this.ultStart(M); return; }
    this.nextSeg(M);
  }
  nextSeg(M) {
    for (const L of M.logs || []) if (L.on != null && L.off == null) L.off = this.time;      // 段末还开着的出手段：记下收手的时刻
    M.si++;
    if (M.si >= M.segs.length) { this.endMove(false); return; }
    const S = M.seg = M.segs[M.si], R = this.rig;
    const ranges = [];
    if (S.hold) {
      ranges.push([S.hold[0], S.hold[0] + 0.05, 0.05 / Math.max(0.05, S.hold[1])]);
      // 第二十六轮：举剑那一段放快（raise）；停顿之后到这一击打完更快（snap）——蓄满就劈
      const RH = CFG.rhythm, sp0 = S.speed ?? 1, after = (S.hits || []).find((h) => h.t[1] > S.hold[0] + 0.05);
      if (S.hold[0] > (S.from ?? 0) + 0.02) ranges.push([S.from ?? 0, S.hold[0], RH.raise * sp0]);
      if (after) ranges.push([S.hold[0] + 0.05, after.t[1], RH.snap * sp0]);
    }
    // 二阶段：常规恢复缩短 15%——最后一击之后的收招尾段、纯收招段放快（举剑停顿不变）
    const rec = this.phase === 2 ? 1 / CFG.p2.recover : 1;
    let speed = S.speed ?? 1;
    if (M.si > M.lastSeg && M.lastSeg >= 0) speed *= rec;
    if (M.si === M.lastSeg) { const last = S.hits[S.hits.length - 1]; ranges.push([last.t[1], 99, (S.tail ?? 1) * (S.speed ?? 1) * rec]); }
    else if (S.tail) { const last = (S.hits || [])[S.hits.length - 1]; if (last) ranges.push([last.t[1], 99, S.tail * (S.speed ?? 1)]); }
    ranges.sort((a, b) => a[0] - b[0]);
    if (S.leap) {                                       // 跃起：空中段的时长按距离定
      const tgt = this.leapTarget(S.leap);
      const AR = CFG.fire.F07.air, air = S.leap.airTime ?? THREE.MathUtils.clamp(AR[0] + tgt.dist / 22, AR[0], AR[1]);
      ranges.push([S.leap.air[0], S.leap.air[1], (S.leap.air[1] - S.leap.air[0]) / air]);
      M.leap = { from: this.root.clone(), to: tgt.p, h: S.leap.h, a0: S.leap.air[0], a1: S.leap.air[1] };
      M.noRoot = true;
    } else M.noRoot = false;
    R.play(S.clip, { from: S.from ?? 0, fade: S.fade ?? 0.15, speed, ranges: ranges.length ? ranges : null, root: !S.leap });
    M.segT0 = this.time; M.prevBlade = null;
    if (S.hits?.length && M.si === 0) this.tell(M, S.hits[0], S.hold);
  }
  // 出手前的提示：快刀——起手时剑上一闪；慢刀——举剑停顿时剑上的火越聚越亮（每帧在 runMove 里）
  tell(M, h, hold) {
    const R = this.rig;
    if (!hold) { this.fx.bladeGlint(R.swordTip, R.swordGrip, 1); this.sfx('swing', { at: this.root, gain: 0.35, pitch: 1.3 * CFG.feel.swing }); }
  }
  runMove(rdt, dt) {
    const M = this.M, R = this.rig, c = R.cur;
    if (!M || !c) return;
    const S = M.seg;
    if (M.kind === 'ult' && M.stage !== 'leap') { this.ultUpdate(M, dt); return; }
    // 段上的事件（放出火浪、火纹……）
    if (S.events) for (let i = 0; i < S.events.length; i++) { const key = M.si + ':' + i; if (!M.ev.has(key) && c.t >= S.events[i][0]) { M.ev.add(key); try { S.events[i][1](this, M); } catch (e) { console.warn(e); } } }
    // 举剑停顿：颤动、剑上聚火（慢刀的前摇）
    const inHold = !!S.hold && c.t >= S.hold[0] - 0.08 && c.t < S.hold[0] + 0.05;
    R.tremble += ((inHold ? 1 : 0) - R.tremble) * Math.min(1, dt * 8);
    if (inHold) { this.fx.bladeCharge(R.swordTip, R.swordGrip, 0.8); R.U.uBlade.value = Math.max(R.U.uBlade.value, Math.min(1, (this.time - (M.holdT ??= this.time)) / 0.6) * 0.7); if (!M.holdSnd) { M.holdSnd = true; this.sfx('b30Gather', { at: this.root, gain: 0.5, dur: S.hold[1] + 0.2 }, 'charge'); } }
    else if (M.holdT != null && !inHold) { M.holdT = null; }
    // 跃起（重坠、焚天断界）：空中段按抛物线把 Boss 送到落点
    if (M.leap) {
      const L = M.leap, u = THREE.MathUtils.clamp((c.t - L.a0) / (L.a1 - L.a0), 0, 1), e = u * u * (3 - 2 * u);
      this.root.x = L.from.x + (L.to.x - L.from.x) * e; this.root.z = L.from.z + (L.to.z - L.from.z) * e;
      this.root.y = Math.sin(u * Math.PI) * L.h;
      if (u > 0 && u < 1) { const dir = _a.set(L.to.x - L.from.x, 0, L.to.z - L.from.z); if (dir.lengthSq() > 0.01) R.setYaw(Math.atan2(dir.x, dir.z)); }
      M.airborne = u > 0 && u < 1;
      if (u >= 1 && !M.landed) {
        M.landed = true; M.airborne = false; this.root.y = 0; this.fx.scorch(this.root, 1.6, 5); this.sfx('slam', { at: this.root, gain: 0.7 }); this.C.shake(0.2);
        if (this.pendingBreak) { this.pendingBreak = false; this.postureBreak(); return; }
        if (M.kind === 'ult') { this.ultCharge(M); return; }
      }
    }
    if (M.id === 'roll') this.rollUpdate(M, c, rdt);
    // 追踪：出手前 0.15 秒锁定方向；连段之间有限转向；举剑停顿里追得快一些（chase 的段还会踏步逼近）
    const next = (S.hits || []).find((h) => c.t < h.t[1]);
    if (next && !M.leap && M.id !== 'roll') {
      const locked = c.t >= next.t[0] - 1e-4 || R.realSpan(c.t, next.t[0]) <= CFG.hit.lockBefore;
      if (!locked && rdt > 0) {
        const { a, d } = this.playerRel();
        const rate = (inHold ? 3.0 : M.si === 0 && !M.hitAny ? 3.4 : CFG.turn.combo) * (this.phase === 2 ? CFG.turn.p2K : 1);
        R.turn(Math.sign(a) * Math.min(Math.abs(a), rate * rdt));
        if (S.chase && inHold && d > CFG.zone.chase) { const f = R.forward, v = CFG.walk[this.phase === 2 ? 'p2' : 'p1'] * 1.4; this.moveBoss(f.x * v * rdt, f.z * v * rdt); }
      }
    }
    // 段上的程序位移（流影三式第三击直刺时的一小步滑进；不把剑尊推到离目标 hit.gap 米以内）
    if (S.slide && rdt > 0) {
      const [s0, s1, len] = S.slide, e = (t) => { const u = THREE.MathUtils.clamp((t - s0) / (s1 - s0), 0, 1); return 1 - (1 - u) * (1 - u); };
      const ds = (e(c.t) - e(c.prevT)) * len;
      if (ds > 0) { const fw = R.forward, mo = { x: fw.x * ds, z: fw.z * ds }; this.spacing(mo); this.moveBoss(mo.x, mo.z); }
    }
    // 出手段：剑的真实轨迹判定 + 剑光、剑上的火
    let swinging = false;
    for (const h of S.hits || []) {
      if (c.t >= h.t[0] - 0.04 && c.prevT <= h.t[1] + 0.04) swinging = true;
      if (!M.logs.find((l) => l.key === h.key && l.on != null) && c.t >= h.t[0]) { M.logs.push({ key: h.key, on: this.time, seg: M.si }); M.hitAny = true; this.sfx('swing', { at: this.root, heavy: h.def === 'heavy', gain: h.def === 'heavy' ? 1.1 : 0.9, pitch: CFG.feel.swing }); }
      const L = M.logs.find((l) => l.key === h.key);
      if (L && L.off == null && c.t >= h.t[1]) L.off = this.time;
      if (c.t >= h.t[0] && c.prevT <= h.t[1] && rdt > 0) { this.bladeSweep(M, h); this.groundHit(M, h, c); }
      if (h.trail && c.t >= h.t[0] && c.prevT <= h.t[1]) this.trailFire(M, h);
    }
    if (swinging && R.swordAttached) {
      this.fx.trail.on = true; this.fx.trailPush(R.swordTip, R.bladeAt(0.3, _b));
      if (this.phase === 2 || M.kind === 'fire') this.fx.bladeFire(R.swordTip, R.swordGrip, this.phase === 2 ? 1 : 0.6);
    } else this.fx.trail.on = false;
    if (!inHold && this.phase !== 2 && M.kind !== 'fire') R.U.uBlade.value = Math.max(0, R.U.uBlade.value - dt * 1.5);
    // 段末
    if (c.done || (S.to != null && c.t >= S.to - 1e-4)) this.nextSeg(M);          // 段末：放到 to，或动作已放完（to 比动作略长时不卡住）
  }
  // 留锋突刺：0–0.8 前摇（先对着预判的翻滚落点，玩家落地后改对玩家；出手前 0.15 秒锁定）→ 0.8–1.1 冲刺突刺 → 收势 0.9 秒
  rollUpdate(M, c, rdt) {
    const RP = CFG.rollPunish, R = this.rig, D = M.data, dash = [0.8, 1.1];
    if (rdt <= 0) return;
    const aimP = this.time - M.t0 < 0.45 && D.pred ? D.pred : this.tgt.pos;
    if (c.t < dash[0] - RP.lock) {
      const a = wrap(Math.atan2(aimP.x - this.root.x, aimP.z - this.root.z) - R.yaw);
      R.turn(Math.sign(a) * Math.min(Math.abs(a), 6 * rdt));
      D.aim = aimP.clone();
    } else if (!D.locked) { D.locked = true; D.dir = R.forward.clone(); this.log('rollLock', { yaw: +R.yaw.toFixed(3) }); }
    if (c.t >= dash[0] && !D.dash) {
      const tgt = D.aim || aimP, dist = Math.hypot(tgt.x - this.root.x, tgt.z - this.root.z);
      D.dash = { from: this.root.clone(), len: Math.max(0, Math.min(RP.maxDash, dist - RP.stopShort)), dir: (D.dir || R.forward).clone(), last: 0 };
      this.sfx('dash', { at: this.root, gain: 1 }); this.sfx('b30Wave', { at: this.root, gain: 0.5 }, 'whoosh');
      if (this.phase === 2 && RP.trailP2) D.zone = this.addZone({ life: 3, kind: 'rollTrail', id: 'roll' + M.uid });
      this.log('rollDash', { len: +D.dash.len.toFixed(2) });
    }
    if (D.dash && c.t <= dash[1] + 0.02) {
      const u = THREE.MathUtils.clamp((c.t - dash[0]) / (dash[1] - dash[0]), 0, 1), e = 1 - (1 - u) * (1 - u), s = D.dash.len * e;
      this.moveBoss(D.dash.from.x + D.dash.dir.x * s - this.root.x, D.dash.from.z + D.dash.dir.z * s - this.root.z);
      if (D.zone && s - D.dash.last >= 1.4) { D.dash.last = s; const p = this.root.clone().setY(0); D.zone.patches.push({ p, r: 0.7 }); D.zone.fx.push(this.fx.groundFire(p, 3, 1.4)); }
      if (u < 1) this.fx.flame(this.rig.swordTip.clone(), { seqName: 'ember', mode: 0, size: [0.5, 0.1], life: 0.25, heat: [1, 0.4] });
    }
  }
  endMove(interrupted) {
    const M = this.M;
    if (!M) return;
    this.M = null;
    this.fx.trail.on = false;
    this.rig.tremble = 0;
    if (M.kind === 'ult') this.ultEnd(M, interrupted);
    if (M.leap && this.root.y > 0) this.root.y = 0;
    this.hud.move(null);
    M.t1 = this.time;
    this.lastMove = M;
    (this.moveLog ||= []).push({ id: M.id, uid: M.uid, t0: M.t0, t1: M.t1, logs: M.logs, interrupted: !!interrupted, phase: this.phase });
    if (this.moveLog.length > 60) this.moveLog.shift();
    this.log('end', { id: M.id, uid: M.uid, interrupted: !!interrupted });
    if (!interrupted) this.toIdle(this.gapTime() * (M.kind === 'ult' ? 0.5 : 1));
  }
  cancelMove(silent = false) {
    if (!this.M) return;
    this.endMove(true);
    if (!silent) this.toIdle(0.4);
  }
  // 第二十六轮：俯身的目标（弧度）——这一段里各击的 lean：出手前 pre 秒（动作时间）起渐压、出手段里压满、打完 post 秒收回（取最大的那一个）
  leanTarget() {
    const M = this.M, c = this.rig.cur, S = M?.seg, Lc = CFG.lean;
    if (!M || !c || !S?.hits?.length || M.kind === 'ult') return 0;
    const sm = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
    let v = 0;
    for (const h of S.hits) {
      const lean = Math.min(Lc.max, h.lean || 0) * Math.PI / 180;
      if (!lean) continue;
      const t = c.t, a = h.t[0] - Lc.pre, z = h.t[1] + Lc.post;
      const w = t < h.t[0] ? sm((t - a) / Lc.pre) : t <= h.t[1] ? 1 : 1 - sm((t - h.t[1]) / Lc.post);
      if (t > a && t < z) v = Math.max(v, lean * w);
    }
    return v;
  }
  leapTarget(L) {
    let p;
    if (L.center) p = new THREE.Vector3(0, 0, 0);
    else {
      const t = this.tgt.pos, r = this.root, dx = t.x - r.x, dz = t.z - r.z, d = Math.hypot(dx, dz), want = Math.max(0, Math.min(L.max ?? 12, d - 1.6 * SIZE30));
      p = new THREE.Vector3(r.x + (dx / (d || 1)) * want, 0, r.z + (dz / (d || 1)) * want);
    }
    const K = CFG.arena.keepIn, d0 = Math.hypot(p.x, p.z);
    if (d0 > K) { p.x *= K / d0; p.z *= K / d0; }
    return { p, dist: Math.hypot(p.x - this.root.x, p.z - this.root.z) };
  }

  // ---------- 剑身对身体的连续检测（一段对同一目标只命中一次；被闪开的不算用掉）----------
  bladeSweep(M, h) {
    const R = this.rig;
    if (!R.swordAttached) return;
    const g1 = R.swordGrip, t1 = R.swordTip;
    const prev = M.prevBlade;
    M.prevBlade = { g: g1.clone(), t: t1.clone(), at: this.time };
    if (!prev) return;
    const Hc = CFG.hit, n = Hc.sub;
    for (const V of this.victims()) {
      const key = h.key + V.tag;
      if (M.hits.has(key)) continue;
      const a = _a.set(V.pos.x, V.pos.y + V.y0, V.pos.z), b = _b.set(V.pos.x, V.pos.y + V.y1, V.pos.z);
      let hitAt = null;
      for (let k = 0; k <= n && !hitAt; k++) {
        const u = k / n;
        _g.lerpVectors(prev.g, g1, u); _t.lerpVectors(prev.t, t1, u);
        _v.subVectors(_t, _g).setLength(Hc.extend); _t.add(_v);
        const q = segSeg(_g, _t, a, b);
        if (q.d <= Hc.blade + V.r) hitAt = _g.clone().lerp(_t, q.s);
      }
      if (!hitAt) continue;
      // 格挡 / 弹反的正面判定按「玩家身前、朝剑尊那一侧」的一点（与第五十层一致）：剑身先碰到的是身侧时，按接触点判正面会忽左忽右；
      // 火花仍迸在剑身真正碰到的那一点
      const toB = _v.set(this.root.x - V.pos.x, 0, this.root.z - V.pos.z); const dB = toB.length() || 1;
      const at = new THREE.Vector3(V.pos.x + (toB.x / dB) * 0.55, V.pos.y + Math.max(0.9, Math.min(1.7, hitAt.y - V.pos.y)), V.pos.z + (toB.z / dB) * 0.55);
      const o = { key: h.key, dmg: h.dmg, def: h.def, at, fxAt: hitAt, victim: V.isPlayer ? null : V.unit, uid: M.uid };
      const res = this.hit(o);
      this.log('hit', { id: M.id, key: h.key, res: res || 'none', ph: !V.isPlayer, rel: V.isPlayer ? Math.round(wrap(Math.atan2(hitAt.x - V.pos.x, hitAt.z - V.pos.z) - this.P.heading) * 57.3) : null, y: +hitAt.y.toFixed(2) });
      if (res !== 'dodge') M.hits.add(key);
      const L = M.logs.find((l) => l.key === h.key); if (L) L.res = res;
      // 第二十六轮：迟到的弹反挂起（'pending'）——结果出来后回写进时间线与这一击的记录
      if (res === 'pending') { const E = this.trace[this.trace.length - 1]; o.settle = (r) => { if (E) { E.res = r; E.late = true; } if (L) L.res = r; }; }
    }
  }
  // 第二十六轮：出手段里剑尖劈到地上（低于 feel.ground.y）：地上炸开尘浪、发光的裂纹、焦痕与余烬，一声砸地、震屏（每一击只一次；只是表现，不另判定）
  groundHit(M, h, c) {
    const R = this.rig, tip = R.swordTip, G = CFG.feel.ground, low = tip.y - this.root.y;
    if (!R.swordAttached || M.ground?.has(h.key)) return;
    // 劈到地上；或重击劈到底（出手段的最后一帧）剑尖已经压得够低：剑压砸到地上
    if (!(low <= G.y || (h.def === 'heavy' && c && c.t >= h.t[1] - 1e-4 && low <= G.heavyY))) return;
    if (Math.hypot(tip.x, tip.z) > CFG.arena.R - 0.4) return;
    (M.ground ||= new Set()).add(h.key);
    const heavy = h.def === 'heavy', p = new THREE.Vector3(tip.x, 0, tip.z);
    this.fx.groundImpact(p, { heavy, dir: _v.set(tip.x - this.root.x, 0, tip.z - this.root.z).normalize().clone() });
    this.sfx('slam', { at: p, gain: heavy ? 0.85 : 0.55 }, 'thump');
    this.C.shake(G.shake[heavy ? 1 : 0]);
    this.log('ground', { id: M.id, key: h.key, heavy });
  }
  // 燃刃留痕：出手段里剑尖贴近地面时，沿剑尖的地面投影留下一串 4 秒的火痕（只是地上的火，不延长刀身判定）
  trailFire(M, h) {
    const R = this.rig, F3 = CFG.fire.F03, tip = R.swordTip;
    if (tip.y > F3.below) return;
    const p = new THREE.Vector3(tip.x, 0, tip.z);
    if (Math.hypot(p.x, p.z) > CFG.arena.R - 0.8) return;
    const Z = M.data.trailZone || (M.data.trailZone = this.addZone({ life: F3.life, kind: 'trail', id: M.id + ':' + h.key }));
    const last = Z.patches[Z.patches.length - 1];
    if (!last || last.p.distanceTo(p) >= F3.step) { Z.patches.push({ p, r: F3.width / 2 }); Z.fx.push(this.fx.groundFire(p, F3.life, F3.width)); if (Z.patches.length === 1) this.sfx('crackle', { at: p, dur: 0.6, gain: 0.5 }); }
  }

  // ---------- 伤害玩家（统一入口）：阶段倍率；防御 / 弹反 / 闪身 / 受击反应交给 combat.damage ----------
  specFor(o) {
    const fire = o.def === 'fire';
    const s = { def: fire ? 'fire' : o.def || 'blade', id: `b30:${o.uid ?? this.M?.uid ?? 'hz'}:${o.key ?? 'n' + (this.hitN = (this.hitN || 0) + 1)}`, seg: 0, active: true, posture: CFG.posture.parry };
    if (fire) { s.block = false; s.parry = false; }
    return s;
  }
  hit(o) {
    if (this.state !== 'fight' || this.noDmg) return null;
    const base = typeof o.dmg === 'number' ? o.dmg : CFG.dmg[o.dmg] ?? 20, dmg = base * (this.phase === 2 ? CFG.p2.dmg : 1);
    if (o.victim) {
      if (!o.victim.alive) return null;
      const sp = this.specFor(o);
      return this.C.damage(o.victim, dmg, { from: this.unit, kind: o.def === 'fire' ? 'fire' : 'phys', at: o.at?.clone ? o.at.clone() : o.at, spec: { ...sp, id: sp.id + '#ph' } });
    }
    const U = this.C.playerUnit;
    if (!U.alive) return null;
    if (this.god) { this.C.popNumber(U, '无伤', 'block'); return 'immune'; }
    const at = o.at ? (o.at.clone ? o.at.clone() : o.at) : this.root.clone();
    this.lastFxAt = o.fxAt ? o.fxAt.clone() : null;
    const react = 'react' in o ? o.react : o.def === 'heavy' ? 'knockback' : o.def === 'fire' ? 'knockback' : 'flinch';
    // 第二十六轮：迟到的弹反挂起时（'pending'）结果晚一点才定——火星、连续受击保护等到那时再做（after）
    const res = this.C.damage(U, dmg, { from: this.unit, kind: o.def === 'fire' ? 'fire' : 'phys', at, spec: this.specFor(o), react, invuln: CFG.hit.invuln, after: (r) => this.afterHit(r, o, at) });
    if (res !== 'pending') this.afterHit(res, o, at);
    return res;
  }
  afterHit(res, o, at) {
    const U = this.C.playerUnit;
    o.settle?.(res);
    if (res === 'hit') {
      if (o.def !== 'fire') { const fp = o.fxAt || at; this.fx.sparks(fp, { n: 16, big: o.def === 'heavy', kind: 'hit', away: _v.set(fp.x - this.root.x, 0, fp.z - this.root.z).normalize().clone() }); }
      this.feel('hit', o, at);
      const t = this.fightT;
      this.chain = this.chain.filter((x) => t - x < 3.5); this.chain.push(t);
      if (this.chain.length >= 3) { this.chain.length = 0; this.Mv.iframes = Math.max(this.Mv.iframes, 1.3); this.C.popNumber(U, '护体', 'parry'); }
    } else if (res === 'block' || res === 'guardbreak') { this.fx.sparks(o.fxAt || at, { n: 12, big: o.def === 'heavy', kind: 'block' }); this.feel('block', o, at); }
  }
  // 第二十六轮：刀落到玩家身上的打击感（CONFIG30.feel）：顿帧（与玩家受击的顿帧取大）、剑尊自己的时间轴顿一下、震屏、暖白一闪、重击声
  feel(kind, o, at) {
    if (o.def === 'fire' || o.victim) return;
    const heavy = o.def === 'heavy', F = CFG.feel[kind][heavy ? 'heavy' : 'blade'];
    this.C.hitStop(F.stop);
    this.hitchT = Math.max(this.hitchT || 0, F.boss);
    this.C.shake(F.shake);
    if (F.flash) this.C.flash(0xffd8a8, F.flash);
    if (kind === 'hit') this.sound.play('hit', { at: o.fxAt || at, big: true, gain: heavy ? 1.1 : 0.85 });
    if (heavy) this.sfx('slam', { at: o.fxAt || at, gain: kind === 'hit' ? 0.5 : 0.35 }, 'thump');
  }
  statHit(e) {
    if (!this.fighting) return;
    if (e.target === this.C.playerUnit) {
      if (e.result === 'hit') { this.stats.taken += e.amount; this.stats.hits++; }
      else if (e.result === 'block' || e.result === 'guardbreak') { this.stats.blocks++; this.stats.taken += e.amount; }
      else if (e.result === 'parry') this.stats.parries++;
      else if (e.result === 'dodge') this.stats.dodges++;
    }
    this.stats.combo = Math.max(this.stats.combo, this.Mv.combo?.n || 0);
  }

  // =====================================================================================
  // Boss 受击、架势、被弹反、截锋架势
  // =====================================================================================
  // 真实的近战剑击：玩家普攻四式、拔刀斩的刀身（moves.strike 带 hitKind）；剑气、惊鸿掠影的沿途、万剑归宗、凤凰、雷龙、地火都不算
  realMelee(o) { return o.from === this.C.playerUnit && !o.dot && (o.hitKind === 'light' || o.hitKind === 'thrust' || o.hitKind === 'heavy') && (o.kind === 'sword' || o.kind === 'heavy'); }
  frontOf(p) { if (!p) return false; return Math.abs(wrap(Math.atan2(p.x - this.root.x, p.z - this.root.z) - this.rig.yaw)) <= CFG.bossParry.arc / 2; }
  receive(amount, o = {}) {
    const C = this.C, U = this.unit, B = this.B;
    if (!U.alive || this.state !== 'fight' || B.mode === 'cine' || this.noDmg) { C.emitHit({ target: U, from: o.from, amount: 0, kind: o.kind, result: 'immune' }); return 'immune'; }
    // 截锋架势的窗口里：正面的真实近战剑击被截住（不掉血），随后一记反击
    if (B.mode === 'guard' && B.data.open && !B.data.used && this.realMelee(o) && this.frontOf(this.P.pos)) { this.deflect(o); C.emitHit({ target: U, from: o.from, amount: 0, kind: o.kind, result: 'block' }); return 'block'; }
    // 第二十五轮：拔刀斩「终式」的处决探针——这一下已被接受（没被截锋、无敌拒绝），结算之前问一次；确认处决就不扣血，交给演出
    if (o.execProbe && !o.dot && o.execProbe(U)) { C.emitHit({ target: U, from: o.from, amount: 0, kind: o.kind, result: 'exec' }); this.log('finaleExec', { phase: this.phase, hp: Math.round(U.hp) }); return 'exec'; }
    const heavy = !!(o.big || o.kind === 'heavy' || (o.stun ?? 0) >= 0.7 || (o.knock ?? 0) > 0);
    const brk = B.mode === 'break';
    const dmg = amount * (brk ? CFG.posture.breakDmgK : 1), hp0 = U.hp;
    // 第二十九轮：通用的终结——玩家一方把最后一条命打到见底（不论哪种招式），交给墨里终焉（这一下不扣血，演出收刀合拢时才结束这一阶段）
    if (dmg >= U.hp && C.lethalProbe?.(U, { from: o.from, kind: o.kind, dot: !!o.dot })) { C.emitHit({ target: U, from: o.from, amount: 0, kind: o.kind, result: 'exec' }); this.log?.('finaleKill', { phase: this.phase, hp: Math.round(U.hp) }); return 'exec'; }
    U.hp = Math.max(0, U.hp - dmg);
    this.stats.dealt += hp0 - U.hp;
    C.emitHit({ target: U, from: o.from, amount: hp0 - U.hp, kind: o.kind, result: 'hit' });
    if (o.from === C.playerUnit && this.realMelee(o) && this.frontOf(this.P.pos)) this.habit.front.push(this.fightT);
    if (!o.dot) {
      C.popNumber(U, `${Math.round(dmg)}`, heavy || brk ? 'heavy' : o.kind);
      const away = _w.set(U.hitPoint.x - this.P.pos.x, 0, U.hitPoint.z - this.P.pos.z).normalize();
      this.fx.sparks(U.hitPoint.clone(), { big: heavy, away: away.clone(), n: heavy ? 14 : 9 });
      this.sound.play('hit', { at: U.hitPoint, big: heavy });
      this.rig.U.uFlash.value = heavy ? 0.5 : 0.3;
      // 架势：玩家招式自带的架势值（普攻、拔刀斩、剑诀、凤凰、雷龙都有）；没有时轻 3、重 6；持续伤害不加
      this.addPosture(o.posture > 0 ? o.posture : heavy ? CFG.posture.heavy : CFG.posture.light);
    }
    if (U.hp <= 0) { this.depleted(); return 'hit'; }
    if (o.dot) return 'hit';
    if (this.posture >= CFG.posture.max && !brk) { this.postureBreak(); return 'hit'; }
    // 受击反应：空闲时（走、站、转身）重击或隔一阵的轻击演一下受击动作；出招中只有上身后仰（不打断）
    if (FREE.has(B.mode) && this.cd.react <= 0 && (heavy || Math.random() < 0.35)) this.hitReact(o.at || this.P.pos, heavy);
    else this.rig.hitFlinch(this.side(o.at), brk ? 0.5 : heavy ? 1.1 : 0.6);
    return 'hit';
  }
  side(at) { if (!at) return 0; return wrap(Math.atan2(at.x - this.root.x, at.z - this.root.z) - this.rig.yaw) > 0 ? 1 : -1; }
  hitReact(at, heavy) {
    const rel = wrap(Math.atan2(at.x - this.root.x, at.z - this.root.z) - this.rig.yaw);
    const clip = Math.abs(rel) < 0.8 ? 'hit_f' : Math.abs(rel) > 2.35 ? 'hit_b' : rel > 0 ? 'hit_l' : 'hit_r';
    this.setMode('react', { dur: heavy ? 0.6 : 0.42 });
    this.rig.play(clip, { fade: 0.08, speed: heavy ? 1 : 1.4 });
    this.cd.react = heavy ? 1.6 : 2.2;
    this.B.gapT = Math.max(this.B.gapT, 0.25);
  }
  addPosture(v) {
    if (!(v > 0) || this.B?.mode === 'break') return;
    this.posture = Math.min(CFG.posture.max, this.posture + v);
    this.postureT = 0;
  }
  updatePosture(dt) {
    this.postureT += dt;
    if (this.postureT > CFG.posture.delay && this.B.mode !== 'break') this.posture = Math.max(0, this.posture - CFG.posture.decay * dt);
  }
  // 被玩家弹反（combat.parryReaction 调来）：+20 架势；连段中途的一击 → 顿 0.15 秒接下一击；收招的一击（或该招规定弹反即收）→ 完整收势
  onParried(spec, at) {
    if (!this.fighting) return;
    const M = this.M, id = String(spec?.id ?? ''), parts = id.split(':'), uid = +parts[1], key = parts[2];
    this.addPosture(CFG.posture.parry);
    this.fx.sparks(this.lastFxAt || at || this.rig.swordTip.clone(), { kind: 'parry', big: true, n: 16 });
    this.rig.U.uFlash.value = 0.35;
    this.stats.parried = (this.stats.parried || 0) + 1;
    this.log('parried', { uid, key, posture: Math.round(this.posture) });
    if (!M || M.uid !== uid) return;                                       // 过时的出手：只记架势
    if (this.posture >= CFG.posture.max) { this.postureBreak(); return; }
    if (M.parry === 'any' || key === M.lastKey || M.kind === 'special') { this.parryEnd(at); return; }
    // 中途：时间轴暂停 0.15 秒（不追帧），上身被震一下
    this.hitchT = CFG.parry.hitch;
    this.rig.hitFlinch(this.side(at), 0.8);
    this.hud.toast30('弹反 · 一顿');
    this.log('hitch', { uid, key });
  }
  parryEnd(at) {
    const dur = this.phase === 2 ? CFG.parry.recover.p2 : CFG.parry.recover.p1;
    this.cancelMove(true);
    this.setMode('recoil', { dur });
    this.rig.play('parry_recoil', { fade: 0.08, speed: this.rig.dur('parry_recoil') / dur });
    this.rig.hitFlinch(this.side(at), 1.2);
    this.sfx('growl', { at: this.root, dur: 0.5, gain: 0.7 });
    this.hud.toast30('弹反 · 收势');
    this.lookW = 0.2;
  }
  // 架势崩溃：一阶段 2.4 秒、二阶段 2.0 秒（明显的被撞开 → 单膝跪地 → 起身），期间不能弹反、不出手；受到的伤害 ×1.25
  postureBreak() {
    if (this.B.mode === 'break') return;
    const M = this.M;
    if (M && M.airborne) { this.pendingBreak = true; return; }
    if (M) this.cancelMove(true);
    const hold = this.phase === 2 ? CFG.posture.break.p2 : CFG.posture.break.p1;
    this.setMode('break', { hold, stage: 'in' });
    this.B.pending = null;
    this.rig.play('hit_f', { fade: 0.08, speed: 1.15 });
    this.posture = CFG.posture.max;
    this.stats.staggers++;
    this.lookW = 0;
    this.sound.play('stagger', { at: this.root });
    this.fx.postureBreak(this.rig.chest(new THREE.Vector3()));
    this.C.hitStop(0.08); this.fx.shake(0.28); this.fx.flash(0xfff1c1, 0.18);
    this.hud.toast30('失衡 · 破绽');
    this.log('break', { hold });
  }
  updateBreak(dt) {
    const B = this.B, S = B.data, R = this.rig;
    void dt;
    if (S.stage === 'in' && B.t >= 0.3) { S.stage = 'kneel'; R.play('kneel', { fade: 0.3, loop: true }); this.fx.scorch(this.root, 1.2, 4); this.sfx('thump', { at: this.root }); }
    else if (S.stage === 'kneel' && B.t >= S.hold - 0.6) { S.stage = 'out'; R.play('idle', { fade: 0.6 }); }
    else if (S.stage === 'out' && B.t >= S.hold) { this.posture = 0; this.postureT = 0; this.toIdle(0.3); }
  }
  bind(time, posture = 0) {
    if (!this.fighting || this.B.mode === 'cine') return;
    this.boundT = Math.max(this.boundT || 0, time);
    if (posture > 0) this.addPosture(posture);
    this.hud.toast30('缚灵锁');
    if (this.posture >= CFG.posture.max && this.B.mode !== 'break') this.postureBreak();
  }

  // ---------- 截锋架势：准备 0.35 → 窗口 0.18 → 空架收势 0.6；截住了就接一记反击（0.45 秒准备，出手前锁方向）----------
  tryGuard(d, a) {
    const BP = CFG.bossParry, H = this.habit;
    if (this.cd.guard > 0 || !FREE.has(this.B.mode) || d > BP.range || Math.abs(a) > BP.arc / 2) return false;
    const Mv = this.Mv, PU = this.C.playerUnit;
    if (Mv.act || !PU.alive || this.C.t - PU.lastHit < 0.4 || this.cine.active) return false;
    if (this.time < (this.guardCheckT ?? 0)) return false;
    this.guardCheckT = this.time + 0.4;
    const recent = H.front.filter((t) => this.fightT - t < CFG.weights.frontHits.window).length;
    let p = this.phase === 2 ? 0.3 : 0.22;
    if (recent >= CFG.weights.frontHits.count) p = Math.min(0.9, p * CFG.weights.frontHits.k);
    if (Math.random() > p) return false;
    this.startGuard();
    return true;
  }
  startGuard() {
    const BP = CFG.bossParry;
    this.B.pending = null;
    this.setMode('guard', { open: false, used: false });
    this.rig.play('guard', { fade: BP.prep, loop: true });
    this.cd.guard = BP.cooldown;
    this.stats.guards++;
    this.hud.move('截锋 · 架势', false);
    this.sfx('block', { at: this.root, gain: 0.35, hard: true });
    this.lookW = 1;
    this.log('guard');
  }
  updateGuard(dt) {
    const B = this.B, BP = CFG.bossParry, S = B.data;
    void dt;
    const { a } = this.playerRel();
    if (!S.open && B.t < BP.prep) this.rig.turn(Math.sign(a) * Math.min(Math.abs(a), 2.4 * this.dt));
    S.open = B.t >= BP.prep && B.t < BP.prep + BP.window && !S.used;
    if (S.used) return;
    if (B.t >= BP.prep + BP.window + BP.whiff) { this.log('guardWhiff'); this.toIdle(0.25); }
  }
  deflect(o) {
    const B = this.B, BP = CFG.bossParry;
    B.data.used = true; B.data.open = false;
    const at = o.at ? o.at.clone() : this.rig.swordTip.clone();
    this.fx.sparks(at, { kind: 'parry', big: true, n: 18 });
    this.sound.play('parry', { at }); this.sfx('b30Deflect', { at, gain: 0.9 }, 'block');
    this.C.hitStop(PLAYER_COMBAT.feedback.stop.parry);
    this.C.popNumber(this.unit, '截锋', 'parry');
    this.stats.deflects++;
    this.Mv.react?.(BP.playerReact, this.root.clone());
    this.log('deflect', { kind: o.hitKind });
    // 反击：一记实打（准备 0.45 秒 = 反击动作到出手的时长，出手前 0.15 秒锁方向）
    const M = specialMove('counter');
    this.startMove(M);
  }

  // ---------- 留锋突刺：玩家真实的后撤闪身 ----------
  onDodge(e) {
    if (!this.fighting || !e || !this.rig) return;
    const RP = CFG.rollPunish, B = this.B;
    const P0 = e.from || this.P.pos, r = this.root, dx = P0.x - r.x, dz = P0.z - r.z, d = Math.hypot(dx, dz);
    const away = d > 1e-3 ? (e.dir.x * dx + e.dir.z * dz) / d : 0;
    const why = this.cd.roll > 0 ? 'cooldown' : !FREE.has(B.mode) ? 'busy:' + B.mode : d < RP.min || d > RP.max ? 'range' : away < Math.cos(RP.away) ? 'notAway' : null;
    // 路径：Boss → 预判落点的直线留在场内（场上没有墙；落点出了火墙就按火墙内沿截住）
    const end = new THREE.Vector3(P0.x + e.dir.x * (e.dist ?? 4.4), 0, P0.z + e.dir.z * (e.dist ?? 4.4));
    const lim = CFG.arena.playerIn - 0.2, el = Math.hypot(end.x, end.z);
    if (el > lim) { end.x *= lim / el; end.z *= lim / el; }
    this.log('dodgeEvt', { d: +d.toFixed(2), away: +away.toFixed(2), why: why || 'ok' });
    if (why) return;
    this.cd.roll = RP.cooldown;
    this.stats.rolls++;
    const M = specialMove('roll');
    M.data = {};
    this.startMove(M);
    M.data.pred = end; M.data.dash = null;
    M.noRoot = true;
    this.log('roll', { pred: end.toArray().map((v) => +v.toFixed(2)) });
  }

  // =====================================================================================
  // 危险物：火浪、火纹、环、火柱、火痕、焚天断界
  // =====================================================================================
  launchWave(origin, dir, { prep, w, speed, len, tag = '' }) {
    const o = origin.clone().setY(0), d = dir.clone().setY(0).normalize();
    // 不穿墙：火浪走到火墙为止
    const b = o.x * d.x + o.z * d.z, c = o.x * o.x + o.z * o.z - (CFG.arena.R - 0.4) ** 2;
    const toEdge = -b + Math.sqrt(Math.max(0, b * b - c));
    const L = Math.max(2, Math.min(len, toEdge));
    const tele = this.fx.tele({ shape: 'lane', pos: o, yaw: Math.atan2(d.x, d.z), len: L, w, dur: prep });
    this.sfx('crackle', { at: o, dur: prep, gain: 0.5 });
    const H = { kind: 'wave', t: 0, s: 0, prevS: 0, hitP: false, hitPh: false, wave: null, tele, o, d, L,
      update: (h, dt) => {
        h.t += dt;
        if (h.t < prep) return true;
        if (!h.wave) { h.wave = this.fx.wave({ w }); h.tele.hit(); this.sfx('b30Wave', { at: o, gain: 0.9 }, 'flameBurst'); }
        h.prevS = h.s; h.s = Math.min(L, h.s + speed * dt);
        const front = _v.copy(o).addScaledVector(d, h.s);
        h.wave.set(front, d, h.s >= L ? Math.max(0, 1 - (h.t - prep - L / speed) / 0.25) : 1);
        for (const V of this.victims()) {
          if (V.isPlayer ? h.hitP : h.hitPh) continue;
          const px = V.pos.x - o.x, pz = V.pos.z - o.z, along = px * d.x + pz * d.z, lat = Math.abs(px * d.z - pz * d.x);
          if (lat <= w / 2 + V.r && along >= h.prevS - V.r && along <= h.s + V.r && V.pos.y < 2.2 && along > -0.5) {
            const res = this.hit({ key: 'wave' + tag + (this.waveN = (this.waveN || 0) + 1), dmg: 'wave', def: 'fire', at: front.clone().setY(1), victim: V.isPlayer ? null : V.unit, react: 'knockback' });
            if (res !== 'dodge') { if (V.isPlayer) h.hitP = true; else h.hitPh = true; }
          }
        }
        if (h.s >= L && h.t > prep + L / speed + 0.3) { h.wave.end(); return false; }
        return true;
      },
      end: (h) => { h.wave?.end(); } };
    this.hz.push(H);
    return H;
  }
  // 圆形火纹（踏火震 4 米，1.0 秒后爆发）
  stomp(c, r, delay) {
    this.fx.scorch(c, 1.4, 4); this.sfx('slam', { at: c, gain: 0.8 }); this.C.shake(0.15);
    return this.circleBurst(c, r, delay, 'stomp', { big: false });
  }
  circleBurst(c, r, delay, dmg, o = {}) {
    const tele = this.fx.tele({ shape: 'circle', pos: c, r, dur: delay, spin: 0.6 });
    this.sfx('crackle', { at: c, dur: delay, gain: 0.55 });
    const H = { kind: 'circle', t: 0, done: false, tele, c, r, delay,
      update: (h, dt) => {
        h.t += dt;
        if (!h.done && h.t >= delay) {
          h.done = true; tele.hit();
          this.fx.eruption(c, { r, n: 28, big: o.big });
          this.sfx('b30Erupt', { at: c, gain: 1 }, 'flameBurst'); this.sfx('boom', { at: c, gain: 0.5 });
          for (const V of this.victims()) if (Math.hypot(V.pos.x - c.x, V.pos.z - c.z) <= r + V.r * 0.8 && V.pos.y < 2.4) this.hit({ key: 'circle' + (this.circN = (this.circN || 0) + 1), dmg, def: 'fire', at: c.clone().setY(0.8), victim: V.isPlayer ? null : V.unit, react: 'knockback' });
        }
        return h.t < delay + 0.4;
      } };
    this.hz.push(H);
    return H;
  }
  // 环形火纹（焚环裂地）：r0…r1 的环带 1.2 秒后爆发；内外两侧是安全区（预警里另画平静的虚线环）
  ringBurst(c, r0, r1, delay) {
    const tele = this.fx.tele({ shape: 'ring', pos: c, r: r1, r0, dur: delay });
    this.sfx('b30Plant', { at: c, gain: 0.8 }, 'slam'); this.sfx('crackle', { at: c, dur: delay, gain: 0.6 });
    const H = { kind: 'ring', t: 0, done: false, tele, c, r0, r1, delay,
      update: (h, dt) => {
        h.t += dt;
        if (!h.done && h.t >= delay) {
          h.done = true; tele.hit();
          this.fx.eruption(c, { r: r1, r0, n: 26 });
          this.sfx('b30Erupt', { at: c, gain: 1 }, 'flameBurst');
          for (const V of this.victims()) { const d = Math.hypot(V.pos.x - c.x, V.pos.z - c.z); if (d >= r0 - V.r * 0.6 && d <= r1 + V.r * 0.6 && V.pos.y < 2.4) this.hit({ key: 'ring' + (this.ringN = (this.ringN || 0) + 1), dmg: 'ring', def: 'fire', at: new THREE.Vector3(V.pos.x, 0.8, V.pos.z), victim: V.isPlayer ? null : V.unit, react: 'knockback' }); }
        }
        return h.t < delay + 0.4;
      } };
    this.hz.push(H);
    return H;
  }
  // 落烬火柱：三根，位置在放招的一刻定下（玩家脚下 + 绕 Boss 左右各偏 40°），1.1 秒后爆发
  pillars(P6) {
    const t = this.tgt.pos, r = this.root, base = Math.atan2(t.x - r.x, t.z - r.z), dist = Math.max(3, Math.hypot(t.x - r.x, t.z - r.z));
    const spots = [new THREE.Vector3(t.x, 0, t.z)];
    for (const s of [-1, 1]) spots.push(new THREE.Vector3(r.x + Math.sin(base + s * P6.spread) * dist, 0, r.z + Math.cos(base + s * P6.spread) * dist));
    const lim = CFG.arena.R - P6.r - 0.3;
    for (const p of spots) { const l = Math.hypot(p.x, p.z); if (l > lim) { p.x *= lim / l; p.z *= lim / l; } }
    this.sfx('b30Gather', { at: r, gain: 0.6, dur: P6.delay }, 'charge');
    for (const p of spots) {
      const tele = this.fx.tele({ shape: 'circle', pos: p, r: P6.r, dur: P6.delay, spin: -0.9 });
      this.hz.push({ kind: 'pillar', t: 0, done: false, tele, p, r: P6.r, delay: P6.delay,
        update: (h, dt) => {
          h.t += dt;
          if (!h.done && h.t >= P6.delay) {
            h.done = true; tele.hit();
            this.fx.pillar(p, { r: P6.r, h: 8, life: 1.0 });
            this.sfx('flameBurst', { at: p, gain: 0.9 });
            for (const V of this.victims()) if (Math.hypot(V.pos.x - p.x, V.pos.z - p.z) <= P6.r + V.r * 0.7 && V.pos.y < 4) this.hit({ key: 'pillar' + (this.pilN = (this.pilN || 0) + 1), dmg: 'pillar', def: 'fire', at: p.clone().setY(1), victim: V.isPlayer ? null : V.unit, react: 'knockback' });
          }
          return h.t < P6.delay + 1.0;
        } });
    }
  }
  // 炎刃重坠的落地冲击（不可弹反；刀身另按剑的轨迹判定）
  // 落地的一刻（落地的焦痕、震地声在跃起的落地处已经放过）：地上亮出火纹，刀身先劈下（可弹反），delay 秒后火纹炸开（不可弹反——弹完刀再闪身或走出圈外）
  impact(c, r) { return this.circleBurst(c, r, CFG.fire.F07.delay, 'impact', { big: true }); }
  // 持续火域（燃刃留痕、突刺火迹）：同时最多 maxZones 组，多了最早的先熄；站在里面每 0.5 秒灼一下（不可格挡）
  addZone({ life, kind, id }) {
    const Z = { kind, id, t: 0, life, patches: [], fx: [], tick: 0 };
    this.zones.push(Z);
    while (this.zones.length > CFG.fire.maxZones) { const old = this.zones.shift(); for (const f of old.fx) f.end?.(); }
    return Z;
  }
  updateZones(dt) {
    const P = this.P.pos, D = CFG.dmg;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const Z = this.zones[i];
      Z.t += dt;
      if (Z.t >= Z.life) { for (const f of Z.fx) f.end?.(); this.zones.splice(i, 1); continue; }
      Z.tick -= dt;
      if (Z.tick <= 0 && this.state === 'fight' && P.y < 1.2 && Z.patches.some((q) => Math.hypot(P.x - q.p.x, P.z - q.p.z) <= q.r + 0.3)) {
        Z.tick = D.trailTick;
        this.hit({ key: 'burn' + (this.burnN = (this.burnN || 0) + 1), dmg: D.trail, def: 'fire', at: P.clone().setY(0.5), react: null });
      }
    }
  }
  updateHazards(dt) {
    if (this.hz.length) this.hz = this.hz.filter((o) => { const keep = o.update(o, dt); if (!keep) { o.tele?.remove?.(0.25); o.end?.(o); } return keep; });
    this.updateZones(dt);
  }
  clearHazards() {
    for (const o of this.hz) { o.end?.(o); o.tele?.remove?.(0.1); }
    this.hz.length = 0;
    for (const Z of this.zones) for (const f of Z.fx) f.end?.();
    this.zones.length = 0;
    this.ultTele?.remove?.(0.1); this.ultTele = null;
    this.arena?.setUlt?.(0);
    this.hud?.ult(null);
  }

  // ---------- 焚天断界 ----------
  ultStart(M) {
    M.stage = 'leap';
    this.stats.ults++;
    this.clearHazards();                                         // 不与火柱、火痕组合：先熄掉场上的持续火
    this.hud.move('断界 · 焚天断界', true);
    this.sfx('roar', { at: this.root, dur: 1.2, gain: 0.6 });
    this.nextSeg(M);
  }
  ultUpdate(M, dt) {
    const U = CFG.ult, R = this.rig, A = this.arena;
    if (M.stage === 'charge') {
      M.ct += dt;
      const t = M.ct;
      // 0–1 举剑出地纹；1–3 火聚；3–5 增强；5–5.5 最终前摇
      const k = t < 1 ? t * 0.25 : t < 3 ? 0.25 + (t - 1) * 0.15 : t < 5 ? 0.55 + (t - 3) * 0.15 : 0.85 + (t - 5) * 0.3;
      A.setUlt(Math.min(1, k));
      R.U.uBlade.value = Math.min(1, 0.3 + k); R.U.uGlowK.value = 3 + 3 * k; R.hotAt(Math.min(1.4, k * 1.4));
      R.tremble = Math.min(1.6, 0.3 + k * 1.3);
      if (t > 1) this.fx.converge(R.swordTip.clone(), { n: t > 3 ? 4 : 2, r: 3.2 - k, life: 0.5 });
      if (t > 3 && Math.random() < 0.4) this.fx.bladeCharge(R.swordTip, R.swordGrip, 1);
      if (!M.s1 && t >= 1) { M.s1 = true; this.sfx('b30Gather', { at: this.root, gain: 0.8, dur: 2.2 }, 'charge'); }
      if (!M.s3 && t >= 3) { M.s3 = true; this.sfx('charge', { at: this.root, dur: 2.0, pitch: 1.3, gain: 1 }); this.arena.setBraziers(1.8); }
      if (!M.s5 && t >= 5) { M.s5 = true; this.sfx('roar', { at: this.root, dur: 0.8, pitch: 1.1, gain: 0.8 }); this.fx.flash(0xffe2b0, 0.2); this.ultTele?.set('uSpin', 0.6); }
      this.hud.ult(Math.max(0, U.charge - t), U.charge);
      if (t >= U.charge) this.ultBurst(M);
      return;
    }
    if (M.stage === 'recover') {
      M.rt += dt;
      if (!M.knelt && M.rt >= 0.5) { M.knelt = true; R.play('kneel', { fade: 0.4, loop: true }); }
      if (!M.rose && M.rt >= U.recover - 0.7) { M.rose = true; R.play('idle', { fade: 0.6 }); }
      if (M.rt >= U.recover) this.endMove(false);
    }
  }
  // 落地：危险区在蓄力开始时定下（场地中心、半径 √0.75·R）
  ultCharge(M) {
    const U = CFG.ult, R = this.rig;
    M.stage = 'charge'; M.ct = 0; M.noRoot = true;
    this.root.set(0, 0, 0);
    M.zone = { c: new THREE.Vector3(0, 0, 0), r: T30.ultR };
    this.ultTele = this.fx.tele({ shape: 'zone', pos: M.zone.c, r: M.zone.r, safeR: CFG.arena.R, dur: U.charge, spin: 0.12 });
    // 举剑并停住：动作放到举剑最高（0.24）后按极慢的速度过一小段，正好在 5.5 秒时斩下
    const hold = U.charge - 0.24 - 0.11;
    R.play('a9s2', { from: 0, fade: 0.2, ranges: [[0.24, 0.29, 0.05 / hold]], root: false });
    this.sfx('b30Plant', { at: this.root, gain: 0.8 }, 'slam');
    this.log('ultCharge', { r: +M.zone.r.toFixed(2) });
  }
  ultBurst(M) {
    const U = CFG.ult, R = this.rig;
    M.stage = 'recover'; M.rt = 0;
    this.ultTele?.hit(); this.ultTele = null;
    this.arena.setUlt(0); this.hud.ult(null); R.hotAt(0); R.tremble = 0; R.U.uGlowK.value = this.phase === 2 ? 3 : 1.6;
    this.fx.ultBurst(M.zone.c, M.zone.r);
    this.sfx('b30UltBurst', { at: this.root, gain: 1.2 }, 'boom'); this.sfx('flameBurst', { at: this.root, gain: 1.2 });
    this.C.hitStop(0.09);
    // 判定一次：在区内（不在闪身无敌里）→ 经统一的伤害入口按致死结算；格挡、弹反挡不住
    const P = this.P.pos, inZone = Math.hypot(P.x - M.zone.c.x, P.z - M.zone.c.z) < M.zone.r;
    let res = 'outside';
    if (inZone && this.C.playerUnit.alive) res = this.hit({ key: 'ult', dmg: 'ult', def: 'fire', at: P.clone().setY(1), uid: M.uid, react: 'knockdown' }) || 'none';
    for (const V of this.victims()) if (!V.isPlayer && Math.hypot(V.pos.x, V.pos.z) < M.zone.r) this.hit({ key: 'ult#ph', dmg: 600, def: 'fire', at: V.pos.clone(), victim: V.unit, uid: M.uid });
    this.log('ultBurst', { inZone, res, d: +Math.hypot(P.x, P.z).toFixed(2) });
    this.lastUlt = { inZone, res, d: Math.hypot(P.x, P.z), r: M.zone.r, at: this.fightT };
    this.arena.setBraziers(this.phase === 2 ? 1.6 : 1);
  }
  ultEnd(M, interrupted) {
    this.ultTele?.remove?.(0.2); this.ultTele = null;
    this.arena.setUlt(0); this.hud.ult(null);
    const R = this.rig; R.hotAt(0); R.tremble = 0; R.U.uGlowK.value = this.phase === 2 ? 3 : 1.6;
    this.cd.ult = CFG.ult.cooldown;                              // 冷却在恢复结束后（或中断时）才开始计
    this.log('ultEnd', { interrupted: !!interrupted, stage: M.stage });
  }

  // =====================================================================================
  // 阶段、处决、结算
  // =====================================================================================
  // 阶段结束（秒杀 / 处决）：走 Boss 自己的阶段耗尽流程。凤翔天击只能由一阶段进入二阶段；第二十五轮：终式的处决（o.finale）在最终阶段即整场胜利
  executeStage(o = {}) {
    const U = this.unit;
    if (!U.alive || this.state !== 'fight' || this.B?.mode === 'cine' || this.noDmg || (this.phase !== 1 && !o.finale)) return false;
    const hp0 = U.hp;
    U.hp = 0;
    this.stats.dealt += hp0;
    this.C.emitHit({ target: U, from: o.from, amount: hp0, kind: o.finale ? 'finale' : 'phoenix', result: 'hit', execute: true });
    this.log('execute', { reason: o.reason, castId: o.castId, stage: `b30:p${this.phase}` });
    this.depleted();
    return true;
  }
  // ---------- 第二十五轮：拔刀斩「终式」的处决（game/inkFinale.js 调用）----------
  // 能不能结束当前阶段：开战中、不在过场、没有无伤保护
  finaleInfo() { return { allow: true, canEnd: this.state === 'fight' && this.B?.mode !== 'cine' && !this.noDmg }; }
  // 确认处决：停止当前招式（未出的判定作废）、危险物停在原处（演出期间世界暂停），失衡一下
  finaleStart(at) {
    this.cancelMove(true); this.hitchT = 0; this.pendingBreak = false; this.boundT = 0;
    const R = this.rig, rel = at ? wrap(Math.atan2(at.x - this.root.x, at.z - this.root.z) - R.yaw) : 0;
    R.play(Math.abs(rel) < 0.8 ? 'hit_f' : Math.abs(rel) > 2.35 ? 'hit_b' : rel > 0 ? 'hit_l' : 'hit_r', { fade: 0.08, speed: 0.75 });
    R.hitFlinch(this.side(at), 1.2);
    this.lookW = 0.2;
    this.log('finaleHold');
  }
  // 演出中的姿势：只推进模型（动作、看向、颤动），不出招、不走；dt 为 0 即定住
  finalePose(dt) {
    if (!this.rig) return;
    const R = this.rig, P = this.P;
    this.finaleT = (this.finaleT || 0) + dt;
    R.advance(dt);
    R.look.w += ((this.lookW ?? 0) - R.look.w) * Math.min(1, dt * 4);
    R.pose(dt, { lookAt: _w.set(P.pos.x, P.pos.y + 1.4, P.pos.z) });
    R.finish(this.time + this.finaleT, dt);
    this.updateProxy();
  }
  // 演出交还：作废（没提交）时回到战斗，不卡在受击里
  finaleRestore() { if (this.state === 'fight') { this.toIdle(0.3); this.lookW = 1; } }
  // 阶段过场：被终式处决接管时延到演出交还之后再放（finaleDefer 由 inkFinale 设、交还时逐个调用）
  deferCine(f) { if (this.finaleDefer) this.finaleDefer.push(f); else f(); }
  depleted() { if (this.phase === 1) this.onP1Depleted(); else this.onP2Depleted(); }
  onP1Depleted() {
    if (this.p1Done) return;
    this.p1Done = true;
    this.state = 'transition';
    this.stats.p1t = this.fightT;
    this.cancelMove(true); this.clearHazards(); this.fx.clear();
    this.setMode('cine'); this.pendingBreak = false; this.hitchT = 0;
    this.noDmg = true;
    this.releaseInputs();
    this.sound?.duckMusic?.(0.35, 0.8);
    this.log('p1Done');
    this.deferCine(() => this.cine.play('phase', () => this.beginPhase2()));
  }
  beginPhase2() {
    if (this.state === 'off' || this.state === 'exiting') return;
    this.applyPhase(2);
    this.unit.maxHp = this.unit.hp = this.hpPool(2);
    this.posture = 0; this.postureT = 0;
    this.noDmg = false;
    this.state = 'fight';
    this.phaseT = 0;
    this.toIdle(CFG.cine.prep);                                   // 二阶段开始前 0.8 秒不做决策
    this.hud.setPhase(2, true);
    this.lookW = 1;
    this.sound?.duckMusic?.(1, 1.5);
    this.releaseInputs(); this.relock();
    this.log('p2');
  }
  // 二阶段的样子：胸口、甲缝与剑刃燃起，火盆旺火，台面熔岩裂纹烧红
  applyPhase(p) {
    this.phase = p;
    const R = this.rig, U = R.U, A = this.arena;
    if (p === 2) { U.uIgnite.value = 1; U.uGlowK.value = 3; U.uBlade.value = 1; A.setHeat(1); A.setBraziers(1.6); A.setGlow(0.5); }
    else { U.uIgnite.value = 0; U.uGlowK.value = 1.6; U.uBlade.value = 0; A.setHeat(0); A.setBraziers(1); A.setGlow(0.35); }
  }
  onP2Depleted() {
    if (this.p2Done) return;
    this.p2Done = true;
    this.unit.alive = false;
    this.state = 'victory';
    this.cancelMove(true); this.clearHazards();
    this.setMode('cine');
    this.noDmg = true;
    this.releaseInputs();
    this.C.noRegen = false; this.C.forceHud = false;
    this.musicTo('off', 3);
    this.log('p2Done');
    this.deferCine(() => this.cine.play('victory', () => this.showResult(true)));
  }
  onPlayerDown() {
    if (!this.active) return false;
    if (this.state === 'fight' && !this.downDone) {
      this.downDone = true;
      this.state = 'exec';
      this.cancelMove(true); this.clearHazards();
      this.setMode('cine');
      this.noDmg = true;
      this.releaseInputs();
      this.musicTo('off', 2);
      this.log('down');
      this.cine.play('defeat', () => this.showResult(false));
      return true;
    }
    this.restorePlayer();
    return true;
  }
  grantRewards() {
    if (this.rewarded) return this.rewardInfo;
    this.rewarded = true;
    if (this.debugUsed || this.hpMode === 'debug') { this.rewardInfo = { first: false, best: false, items: ['（这一场用过调试入口：不计入记录，也不发奖励）'], secs: this.fightT, debug: true }; return this.rewardInfo; }
    const st = this.g.state, R = this.record(), secs = this.fightT;
    const first = !R.firstReward;
    R.wins = (R.wins || 0) + 1;
    const best = R.best == null || secs < R.best;
    if (best) R.best = Math.round(secs * 10) / 10;
    if (!R.firstClear) R.firstClear = Date.now();
    const items = [];
    const P = this.g.prog;
    let qiLine = null;
    if (P && !P.granted('boss30.first')) { const got = P.grantOnce('boss30.first', 0.2, P.d.events?.boss30 || P.recordEvent('boss30', BOSS30.level), '通天塔第三十层 · 首次通关'); qiLine = got > 0 ? `修炼灵气 +${Math.round(got)}` : '修炼灵气（已达当前上限，不再积累）'; }
    else if (P) qiLine = '修炼灵气：重复通关不再给（已领过）';
    if (first) {
      R.firstReward = true;
      st.d.merit += 80; st.d.inv.jinyu = (st.d.inv.jinyu || 0) + 1; st.d.inv.ember = (st.d.inv.ember || 0) + 2;     // 养元丹自第十九轮起恒为 99，不再作奖励
      items.push('宗门贡献 +80', '烬狱剑印 ×1', '不灭余烬 ×2');
    } else {
      st.d.merit += 15; st.d.inv.ember = (st.d.inv.ember || 0) + 1;
      items.push('宗门贡献 +15', '不灭余烬 ×1');
    }
    if (qiLine) items.push(qiLine);
    st.event('tower30', true);
    st.save();
    this.rewardInfo = { first, best, items, secs };
    this.log('reward', { first, items: items.length });
    return this.rewardInfo;
  }
  showResult(win) {
    if (this.state === 'off' || this.state === 'exiting') return;
    const g = this.g, ui = g.ui, st = this.stats, R = this.record();
    this.state = win ? 'result' : 'failed';
    this.hud.show(false);
    this.releaseInputs();
    if (!win) { this.restorePlayer(); this.P.char.anim.stop(0.2); }
    const info = win ? this.grantRewards() : null;
    const el = document.createElement('div');
    el.className = 'ar-result b30-result';
    const boss = this.unit;
    el.innerHTML = win ? `
      <div class="ar-verdict win"><b>胜</b><span>${BOSS30.name}化作余烬 · 第三十层通关</span></div>
      <div class="kv">
        <b>用时</b><span>${fmt30(info.secs)}（${info.secs.toFixed(1)} 秒）${info.best ? ' · 新的最佳' : R.best != null ? ` · 最佳 ${fmt30(R.best)}` : ''}</span>
        <b>承受伤害</b><span>${Math.round(st.taken)}（被打中 ${st.hits} 次）</span>
        <b>造成伤害</b><span>${Math.round(st.dealt)}</span>
        <b>格挡 / 弹反 / 闪身</b><span>${st.blocks} / ${st.parries} / ${st.dodges}</span>
        <b>使其失衡</b><span>${st.staggers} 次</span>
        <b>奖励</b><span>${info.items.join('、')}${info.first ? '（首通）' : ''}</span>
      </div>
      <p class="muted">${info.debug ? '调试结果不写入存档。' : '奖励已收入行囊（只发一次）。'}</p>
      <div class="ar-act"><button class="act" data-again>再次挑战</button><button class="act ghost" data-leave>返回通天塔一层</button></div>`
      : `
      <div class="ar-verdict lose"><b>败</b><span>倒在烬火之中</span></div>
      <div class="kv">
        <b>坚持</b><span>${fmt30(st.t)}（${this.phase === 2 ? `已入二阶段，剑尊余下气血 ${Math.ceil(boss.hp)} / ${boss.maxHp}` : `一阶段，剑尊余下气血 ${Math.ceil(boss.hp)} / ${boss.maxHp}`}）</span>
        <b>承受伤害</b><span>${Math.round(st.taken)}（被打中 ${st.hits} 次）</span>
        <b>造成伤害</b><span>${Math.round(st.dealt)}</span>
        <b>格挡 / 弹反 / 闪身</b><span>${st.blocks} / ${st.parries} / ${st.dodges}</span>
        <b>使其失衡</b><span>${st.staggers} 次</span>
      </div>
      <p class="muted">提示：慢刀举剑停顿时别急着闪；连段中途弹反只能让它一顿，收招的一击弹反才有破绽；焚天断界的亮边以外是安全的。</p>
      <div class="ar-act"><button class="act" data-again>重新挑战</button><button class="act ghost" data-leave>返回</button></div>`;
    let chosen = null;
    el.addEventListener('click', (e) => {
      chosen = e.target.closest('[data-again]') ? 'again' : e.target.closest('[data-leave]') ? 'leave' : null;
      if (!chosen) return;
      ui.closePanel();
    });
    g.panelKind = 'boss30Result';
    ui.openPanel(win ? '第三十层 · 通关' : '第三十层 · 挑战失败', BOSS30.name, el, {
      width: 640,
      onClose: () => {
        if (g.panelKind === 'boss30Result') g.panelKind = null;
        if (chosen === 'again') this.retry();
        else if (chosen === 'leave') this.exit();
        else if (!win) this.retry(true, true);
        else this.relock();
      },
    });
    $('#fade').classList.remove('on');
    setTimeout(() => $('#fade').classList.remove('dark'), 900);
  }
  async retry(quiet = false, atEntry = false) {
    if (!this.active || this.state === 'exiting' || this.busy) return;
    this.busy = true;
    const fade = $('#fade');
    fade.classList.add('dark', 'on');
    await sleep(420);
    this.resetFight(true);
    if (atEntry) this.placePlayer(T30.entry);
    fade.classList.remove('on'); setTimeout(() => fade.classList.remove('dark'), 900);
    this.busy = false;
    this.relock();
    if (!quiet) this.g.ui.toast('余烬重聚——剑台复原如初');
  }
  abandon() {
    const ui = this.g.ui;
    if (this.state !== 'fight') return;
    const el = document.createElement('div');
    el.innerHTML = '<p>放弃这次挑战？剑尊会化回余烬，你从桥头重新走上剑台即可再战。</p><div class="ar-act"><button class="act danger" data-yes>放弃</button><button class="act ghost" data-no>继续战斗</button></div>';
    let yes = false;
    el.addEventListener('click', (e) => { if (e.target.closest('[data-yes]')) { yes = true; ui.closePanel(); } else if (e.target.closest('[data-no]')) ui.closePanel(); });
    this.g.panelKind = 'boss30Quit';
    ui.openPanel('放弃挑战', '第三十层', el, { width: 420, onClose: () => { if (this.g.panelKind === 'boss30Quit') this.g.panelKind = null; if (yes) this.retry(true, true); else this.relock(); } });
  }
  async exit(msg = null) {
    const g = this.g;
    if (!this.active || this.state === 'exiting') return;
    this.state = 'exiting';
    this.releaseInputs();
    g.lock = true;
    const fade = $('#fade');
    fade.classList.add('dark', 'on');
    await sleep(480);
    this.teardown();
    try { await g.switchWorld('tower'); } catch (e) { console.error(e); }
    const D = TH_SPOTS.dais;
    this.P.place(D.x, D.z + 4.2, Math.PI, 0);
    this.cam.set(Math.PI, 0.14, 5.6); this.cam.snap(new THREE.Vector3(D.x, 1.55, D.z + 4.2));
    this.C.revive();
    await sleep(120);
    fade.classList.remove('on'); setTimeout(() => fade.classList.remove('dark'), 1200);
    g.lock = false;
    g.ui.toast(msg || '走出火门，回到通天塔一层。');
    this.relock();
  }
  teardown() {
    const C = this.C;
    this.cine.stop(true);
    this.cancelMove(true);
    this.clearHazards();
    this.fx?.dispose(); this.fx = null;
    this.rig?.dispose(); this.rig = null;
    C.hitListeners.delete(this.onHit);
    C.extraTargets = C.extraTargets.filter((u) => u !== this.unit);
    C.noRegen = false; C.bossFight = false; C.forceHud = false; C.stopT = 0;
    if (this.Mv.onDodge) this.Mv.onDodge = null;
    this.unit.alive = false;
    this.sound.stopAll();
    this.sound.stopMusic?.(null, 0.6); this.sound.duckMusic?.(1, 0.1);
    this.hud.unmount();
    this.g.freeCam = null;
    if (this.camSave) this.cam.setState(this.camSave);
    this.releaseInputs();
    this.Mv.reset();
    this.P.char.anim.stop(0.1);
    this.P.setVisible(true);
    this.debugEl?.classList.add('hidden');
    freeBoss30Gpu();
    this.state = 'off';
  }
  releaseInputs() {
    const I = this.input;
    I.keys.clear(); I.pressed.clear(); I.touch = { x: 0, y: 0, active: false };
    this.pointer?.releaseAll();
    this.C.setGuard(false);
    this.Mv.clearInput();
  }
  relock() { const p = this.pointer; if (p && !p.locked && p.canLock?.()) p.lock(); }
  key(code) {
    if (!this.active) return false;
    if (this.cine.active) { if (['Space', 'Escape', 'Enter', 'KeyE'].includes(code)) this.cine.skip(); return true; }
    if (code === 'Backspace' && this.state === 'fight') { this.abandon(); return true; }
    return false;
  }
  sfx(name, o = {}, fallback = null) {
    const S = this.sound;
    if (fallback && !S.bank?.[name] && !S['s_' + name]) name = fallback;
    S.play(name, o);
  }

  // ---------- 习惯（只调选招权重）：远处施法、站着不动 ----------
  updateHabits(dt) {
    const H = this.habit, P = this.P.pos, Mv = this.Mv;
    const a = Mv.act?.key;
    if (a && a !== H.lastAct && SKILL_KEYS.has(a) && this.playerRel(P).d > CFG.weights.farCast.dist) H.farCast = this.fightT;
    H.lastAct = a || null;
    if (H.lastPos.distanceTo(P) > 0.6) { H.lastPos.copy(P); H.stillT = 0; } else H.stillT += dt;
    H.front = H.front.filter((t) => this.fightT - t < 8);
  }

  // ---------- 战斗目标的位置（Boss 身上离玩家最近的一点）与身体碰撞 ----------
  updateProxy() {
    const U = this.unit, P = this.P.pos, R = this.rig;
    const n = R.nearest(P.x, P.z, P.y + 0.15, P.y + 2.4);
    if (!n) return;
    U.pos.set(n.p.x, this.root.y, n.p.z);
    U.radius = Math.max(0.15, n.r - n.gap * 1.2);
    U.part = n.part; U.hitPoint.copy(n.p);
    U.headY = this.root.y + BOSS30.height * BOSS30.scale;
    U.yaw = R.yaw;
  }
  pushPlayer() {
    const P = this.P.pos, r = this.root;
    if (r.y > 1.2 || !this.rig?.root.visible || this.rig.U.uForm.value < 0.5) return;
    const dx = P.x - r.x, dz = P.z - r.z, d = Math.hypot(dx, dz), need = CFG.zone.push;
    if (d < need) {
      if (d > 1e-4) { P.x = r.x + (dx / d) * need; P.z = r.z + (dz / d) * need; }
      else { const f = this.rig.forward; P.x = r.x + f.x * need; P.z = r.z + f.z * need; }
    }
  }
  keepPlayerIn() {
    const P = this.P.pos, r = Math.hypot(P.x, P.z), lim = CFG.arena.playerIn;
    if (r > lim) {
      P.x *= lim / r; P.z *= lim / r;
      if ((this.wallT = (this.wallT ?? 0) - this.dt) <= 0) { this.wallT = 0.35; this.fx.glow(new THREE.Vector3(P.x * 1.02, P.y + 1.2, P.z * 1.02), { tile: 'glowFire', size: 2.2, life: 0.3, heat: [1, 0.6], alpha: 0.9 }); }
    }
  }

  // =====================================================================================
  // 调试（地址加 ?boss30debug=1 才显示；控制台 __qinglan.boss30.debug 随时可用）
  // =====================================================================================
  get debug() {
    const F = this;
    const mark = () => { F.debugUsed = true; };
    return {
      move(id) {
        mark(); if (!F.fighting) return false;
        if ((FIRE30[id]?.p === 2 || id === 'ult') && F.phase !== 2) F.debug.phase(2);
        F.cancelMove(true); F.setMode('idle'); F.B.pending = null;
        if (id === 'ult') F.startMove(ultMove());
        else if (id.startsWith('F')) F.startMove(fireMove(id, F));
        else if (id === 'counter' || id === 'roll') { if (id === 'roll') { F.onDodge({ dir: F.aimDir().negate(), from: F.P.pos.clone(), dist: PLAYER_MOVES.dodge.dist }); } else F.startMove(specialMove(id)); }
        else F.startMove(comboMove(id));
        return true;
      },
      guard() { mark(); if (!F.fighting) return false; F.cancelMove(true); F.setMode('idle'); F.startGuard(); return true; },
      phase(n) {
        if (!F.active) return;
        mark();
        if (n === 2 && F.phase !== 2) { F.cancelMove(true); F.clearHazards(); F.p1Done = true; F.applyPhase(2); F.unit.maxHp = F.unit.hp = F.hpPool(2); F.hud.setPhase(2, true); F.phaseT = 0; }
        else if (n === 1 && F.phase !== 1) { F.applyPhase(1); F.p1Done = false; F.unit.maxHp = F.unit.hp = F.hpPool(1); F.hud.setPhase(1, true); }
      },
      cine(name) {
        if (!F.active || F.cine.active) return; mark(); F.cancelMove(true); F.clearHazards();
        F.state = name === 'intro' ? 'intro' : name === 'phase' ? 'transition' : name === 'victory' ? 'victory' : 'exec'; F.setMode('cine'); F.noDmg = true;
        F.cine.play(name, () => { if (name === 'phase') F.beginPhase2(); else if (name === 'intro') F.beginFight(); else if (name === 'victory') F.showResult(true); else F.showResult(false); });
      },
      hp(mode) { mark(); F.hpMode = mode; F.unit.maxHp = F.hpPool(F.phase); F.unit.hp = Math.min(F.unit.hp, F.unit.maxHp); if (mode === 'debug') F.unit.hp = F.unit.maxHp; },
      god(v = !F.god) { mark(); F.god = v; return v; },
      ai(v = !F.aiOn) { if (!v) mark(); F.aiOn = v; return v; },
      breakPosture() { mark(); if (F.fighting) { F.posture = CFG.posture.max; F.postureBreak(); } },
      kill() { mark(); if (F.fighting) { F.unit.hp = 0; F.depleted(); } },
      start() { if (F.state === 'dormant') F.startIntro(); },
      skip() { F.cine.skip(); },
      info() { return { state: F.state, phase: F.phase, hp: Math.round(F.unit.hp), max: F.unit.maxHp, posture: Math.round(F.posture), mode: F.B?.mode, move: F.M?.id || null, seg: F.M?.si ?? null, t: +F.fightT.toFixed(2), boss: F.rig ? F.root.toArray().map((v) => +v.toFixed(2)) : null, yaw: F.rig ? +F.rig.yaw.toFixed(2) : null, clip: F.rig?.name, ct: F.rig ? +F.rig.t.toFixed(3) : null, hz: F.hz.length, zones: F.zones.length, teles: F.fx?.teles.size, cd: { ...F.cd, fire: { ...F.cd.fire } } }; },
    };
  }
  buildDebug() {
    const el = this.debugEl = document.createElement('div');
    el.id = 'b30-debug'; el.className = 'hidden';
    const btn = (t, f) => { const b = document.createElement('button'); b.textContent = t; b.addEventListener('click', (e) => { e.stopPropagation(); f(); }); return b; };
    const row = (title, items) => { const r = document.createElement('div'); r.className = 'row'; const s = document.createElement('b'); s.textContent = title; r.appendChild(s); items.forEach((x) => r.appendChild(x)); el.appendChild(r); };
    const h = document.createElement('div'); h.className = 'hd'; h.textContent = '第三十层 · 调试（?boss30debug=1）'; el.appendChild(h);
    row('剑式', COMBO_ORDER.map((id) => btn(id, () => this.debug.move(id))));
    row('火焰', [...FIRE_ORDER, 'ult'].map((id) => btn(id === 'ult' ? '断界' : id, () => this.debug.move(id))));
    row('其他', [btn('截锋', () => this.debug.guard()), btn('突刺', () => this.debug.move('roll')), btn('失衡', () => this.debug.breakPosture()), btn('二阶段', () => this.debug.phase(2)), btn('耗尽本阶段', () => this.debug.kill())]);
    row('过场', [btn('出场', () => this.debug.cine('intro')), btn('转阶段', () => this.debug.cine('phase')), btn('击败', () => this.debug.cine('victory')), btn('失败', () => this.debug.cine('defeat'))]);
    row('开关', [btn('开战', () => this.debug.start()), btn('无敌', () => this.g.ui.toast('无敌：' + (this.debug.god() ? '开' : '关'))), btn('AI', () => this.g.ui.toast('AI：' + (this.debug.ai() ? '开' : '关')))]);
    document.body.appendChild(el);
  }
}
