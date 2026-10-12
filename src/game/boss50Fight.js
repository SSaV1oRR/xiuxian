// 第十六轮：通天塔第五十层 · 镇龙封印殿——镇塔龙君·烬霄的挑战流程与战斗。
// 流程：一层楼层传送阵选第 50 层 → 挑战说明 → 进殿（未触发：龙君跪伏在北面封印台上沉睡）→ 踏入封印阵（半径 23.5 米内）→
//   出场过场 → 一阶段 → 阶段转换过场 → （短暂准备）二阶段 → 击败过场 → 结算（奖励只发一次）→ 再战 / 返回塔中；
//   玩家力竭：失败处决过场 → 失败界面（重试 / 返回塔中）。重试把两个阶段、架势、冷却、场地、伤害统计全部复原。
// 唯一处理：一阶段耗尽、二阶段耗尽、玩家力竭、退出各有一个只走一次的入口（标志位守着），过场、结算、奖励都不会重复触发。
// 战斗中：封印光墙圈住半径 25 米，龙心不出 23 米；寻常的气血回复停止（服丹照旧）；打开界面（设置、行囊……）时整场暂停。
// 招式见 boss50Moves.js；龙的模型与动作层见 actors/boss50.js；特效 boss50Fx.js；过场 boss50Cine.js；界面 ui/boss50Hud.js。
import * as THREE from 'three';
import { Boss50Rig, BOSS50, loadBoss50, freeBoss50Gpu } from '../actors/boss50.js';
import { Boss50Fx, C50 } from './boss50Fx.js';
import { MOVES50, CONFIG50, MOVE_ORDER } from './boss50Moves.js';
import { T50 } from '../world/tower50.js';
import { DEMON } from './combat.js';
import { PLAYER_COMBAT } from './combatConfig.js';
import { Boss50Cine } from './boss50Cine.js';
import { Boss50Hud } from '../ui/boss50Hud.js';
import { TH_SPOTS } from '../world/towerHall.js';

const CFG = CONFIG50;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const fmt50 = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const TRIGGER_R = 23.5;
// 第二十一轮：玩家在凤凰火带里连续站了 CAMP_SECS 秒以上时，这几招的权重 ×CAMP_K（都有清楚的地面预警、正常冷却）
const CAMP_MOVES = ['jump', 'thunder', 'slam'], CAMP_SECS = 2.5, CAMP_K = 3;
// 第十八轮：第五十层的背景音乐（项目自带 assets/sound effect/boss，Pixabay 授权）：出场过场放出场曲，开战转入战斗曲（循环）
const BOSS_MUSIC = {
  intro: 'assets/sound effect/boss/freesound_community-boss-intro-02-72039.mp3',
  battle: 'assets/sound effect/boss/freesound_community-lightning-tiger-god-loop-50249.mp3',
};
const DEBUG = new URLSearchParams(location.search).has('boss50debug');
const HP_DEBUG = new URLSearchParams(location.search).get('boss50hp') === 'debug';

export class Boss50Fight {
  constructor(game, { combat, moves, player, cam, input, pointer, vfx, sfx, sound, hall, quality }) {
    this.g = game; this.C = combat; this.Mv = moves; this.P = player; this.cam = cam; this.input = input; this.pointer = pointer;
    this.vfx = vfx; this.sfxSkill = sfx; this.sound = sound; this.arena = hall; this.quality = quality;
    this.state = 'off';
    this.rig = null; this.fx = null; this.M = null; this.hz = [];
    this.phase = 1; this.k = this.phaseK(1);
    this.hud = new Boss50Hud();
    this.cine = new Boss50Cine(this);
    this.onHit = (e) => this.statHit(e);
    this.aiOn = true; this.god = false; this.hpMode = HP_DEBUG ? 'debug' : 'normal';
    this.dt = 0; this.time = 0;
    this.unit = this.makeUnit();
    if (DEBUG) this.buildDebug();
  }
  get active() { return this.state !== 'off'; }
  // 第二十一轮：战斗时钟暂停——出场、阶段转换、击败、处决的过场中，凤凰与火焰的寿命、仇恨、技能冷却都停（过场后继续原来的剩余时间）
  get combatHold() { return this.active && (this.cine.active || ['intro', 'transition', 'victory', 'exec'].includes(this.state)); }
  get fighting() { return this.state === 'fight'; }
  // 入场、过场、结算、退场时：不能走动、不能出手（main.js 的 combat.blocked 与 game.update 的 moveLocked 读这两个）
  get blockMove() { return this.active && ['intro', 'transition', 'victory', 'exec', 'exiting'].includes(this.state); }
  get blockAct() { return this.active && this.state !== 'fight' && this.state !== 'dormant' && this.state !== 'result' && this.state !== 'failed'; }
  get root() { return this.rig.root.position; }
  phaseK(p) { return p === 2 ? { ...CFG.p2 } : { move: 1, anim: 1, cool: 1, dmg: 1 }; }
  hpPool(p) { const H = this.hpMode === 'debug' ? CFG.hpDebug : CFG.hp; return p === 2 ? H.p2 : H.p1; }

  // ---------- 战斗目标（给 combat.js / moves.js 用）：位置是龙身上离玩家最近的一点（每帧更新），半径是那段身体的粗细 ----------
  makeUnit() {
    const F = this;
    return {
      boss: true, id: 'boss50', kind: 'boss50', world: 'boss50', faction: DEMON, name: BOSS50.name,
      pos: new THREE.Vector3(0, 0, -14), radius: 1, hp: 1, maxHp: 1, alive: false, engaged: true, state: 'boss',
      cfg: { name: BOSS50.name, scale: 1 }, headY: 2, yaw: 0, st: { slow: 0, slowK: 1, freeze: 0, burn: 0, burnDps: 0, hits: 0 },
      part: 'body', hitPoint: new THREE.Vector3(),
      bar: { set() {}, place() {}, remove() {} },
      immune: () => F.state !== 'fight' || F.B?.mode === 'cine',
      hidden: () => F.state !== 'fight' || F.cine.active,          // 过场、结算时不作为出招的目标（锁定标记也不画）
      receive: (amount, o) => F.receive(amount, o),
      // 第二十一轮：阶段（独立的阶段气血：一阶段、二阶段各一条）、阶段结束（凤翔天击的秒杀走正常的阶段耗尽流程）、受击胶囊（凤凰的连续碰撞）
      stageInfo: () => ({ id: `b50:p${F.phase}`, index: F.phase, final: F.phase === 2, structure: 'pools' }),
      endStage: (o) => F.executeStage(o),
      capsules: () => (F.rig ? F.rig.caps.map((c) => ({ a: c.a, b: c.b, r: c.r, part: c.part })) : []),
      get stageMax() { return this.maxHp; },
      // 第十七轮：被弹反（按招式配置：积累架势、收手 / 打断、余下的段作废）、被缚灵锁锁住
      onParried: (spec, at) => F.onParried(spec, at),
      bind: (time, posture) => F.bind(time, posture),
      stagger() {},
    };
  }

  // =====================================================================================
  // 入口：挑战说明 → 进殿
  // =====================================================================================
  openChallenge() {
    const g = this.g, ui = g.ui, R = this.record();
    const el = document.createElement('div');
    el.className = 'b50-panel';
    el.innerHTML = `
      <div class="b50-intro"><i class="seal">龙</i><div><b>镇塔龙君 · 烬霄</b><small>通天塔第五十层守关 · 镇龙封印殿</small></div></div>
      <p>北面封印台上锁着一头黑鳞金甲的古龙，周身灵纹泛着紫光。踏入殿心的封印阵，它便会醒来。封印光墙升起之后，<b>胜负未分不能出阵</b>（按 <b>退格</b> 可放弃挑战）。</p>
      <div class="kv">
        <b>两个阶段</b><span>一阶段气血 ${this.hpPool(1)}；耗尽后封印崩裂，二阶段气血 ${this.hpPool(2)}（另起一条）、更快更狠，多出「焚灵囚阵」「灭世龙怒」两招</span>
        <b>预警</b><span>地面<span style="color:#ffb347">橙色</span>为可格挡的出手范围，<span style="color:#ff5a4e">红色</span>与龙首上的「危」字为不可格挡，须闪避（C）</span>
        <b>架势</b><span>连击、重击、弹反、打中低下的龙首都会积累架势；架势满了龙君失衡跪地，受到的伤害提高</span>
        <b>注意</b><span>殿中灵压沉重：不能御剑；寻常的气血回复停止，养元丹（G）照常可服</span>
        <b>记录</b><span>${R.wins ? `已通关 ${R.wins} 次 · 最佳用时 ${fmt50(R.best)}` : '尚未通关'}${R.firstReward ? ' · 首通奖励已领取' : ''}</span>
        <b>修炼灵气</b><span>${this.g.prog?.granted('boss50.first') ? '已领取；重复通关不再给（贡献与龙鳞照旧）' : '修为系统开放后的第一次通关：本级基础需求的 20%（按开战时的等级记下，按龙君 32 级修正）；之后重复通关不再给'}</span>
      </div>
      <div class="ar-act"><button class="act" data-go>进入第五十层</button><button class="act ghost" data-cancel>暂且不去</button></div>`;
    let go = false;
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-go]')) { go = true; ui.closePanel(); }
      else if (e.target.closest('[data-cancel]')) ui.closePanel();
    });
    g.panelKind = 'boss50';
    ui.openPanel('通天塔 · 第五十层', '守关 · 镇塔龙君·烬霄', el, { width: 640, onClose: () => { if (g.panelKind === 'boss50') g.panelKind = null; if (go) this.enter(); else this.relock(); } });
  }
  record() {
    const S = this.g.state.d;
    if (!S.tower50 || typeof S.tower50 !== 'object') S.tower50 = { wins: 0, best: null, firstClear: null, firstReward: false, tries: 0 };
    return S.tower50;
  }

  async prepare() {
    const lo = this.quality === 'low';
    this.T = await loadBoss50(lo);
    return this.T;
  }

  async enter() {
    const g = this.g, ui = g.ui;
    if (this.state !== 'off' || this.busy) return;
    this.busy = true; g.lock = true;
    const fade = $('#fade');
    fade.classList.add('dark', 'on');
    await sleep(550);
    try {
      ui.toast('封印殿开启中……');
      await this.prepare();
      await g.switchWorld('boss50');
      this.enterScene();
    } catch (e) {
      console.error(e);
      ui.toast('第五十层的禁制未能开启（' + (e.message || e) + '）');
      try { if (g.world !== 'tower') await g.switchWorld('tower'); } catch (e2) { /* 已在塔内 */ }
      this.teardown();
      fade.classList.remove('on'); setTimeout(() => fade.classList.remove('dark'), 1200);
      g.lock = false; this.busy = false;
      return;
    }
    await sleep(150);
    fade.classList.remove('on'); setTimeout(() => fade.classList.remove('dark'), 1200);
    g.lock = false; this.busy = false;
    ui.banner('通天塔 · 第五十层', '镇龙封印殿 · 踏入殿心的封印阵，龙君便会醒来');
    setTimeout(() => this.state === 'dormant' && ui.toast('南门内按 <b>E</b> 可回到一层；进阵之后按 <b>退格</b> 放弃挑战'), 2600);
  }

  // 场景已切到第五十层：建龙、特效、界面，龙君在封印台上沉睡
  enterScene() {
    const C = this.C, scene = this.arena.scene;
    this.rig = new Boss50Rig(this.T, scene);
    this.fx = new Boss50Fx(this.vfx, scene, { quality: this.quality === 'low' ? 0.5 : 1 });
    this.fx.shakeHook = (v) => C.shake(v);
    this.fx.flashHook = (c, k) => this.sfxSkill?.flash(c, k);
    C.hitListeners.add(this.onHit);
    if (!C.extraTargets.includes(this.unit)) C.extraTargets.push(this.unit);
    this.camSave = this.cam.getState();
    this.cam.set(null, 0.2, 7.2);
    this.hud.mount();
    this.resetFight(false);
    this.record().tries = this.record().tries || 0;
    this.debugEl?.classList.remove('hidden');
  }

  // 一切复原到「未触发」：龙在台上沉睡、场地封印熄灭、双方气血灵力复原、冷却清零
  resetFight(placePlayer = true) {
    this.g.finale?.newInstance('retry');              // 第二十五轮：重试——作废旧的处决记录、清掉墨势（新的战斗实例）
    this.finaleHold = null; this.finaleDefer = null;
    this.g.phoenix?.clear('retry');                   // 第二十一轮：重试 / 进殿时把凤凰、火焰、印记、仇恨一并清掉
    this.g.dragon?.clear('retry');                    // 第二十三轮：雷龙、雷云、裂隙一并清掉
    this.cine.stop(true);
    this.musicTo('off', 0.8);
    this.cancelMove(true);
    this.clearHazards();
    this.fx?.clear();
    const R = this.rig, Pp = T50.perch;
    R.root.position.set(Pp.x, T50.dais.y, Pp.z);
    R.setYaw(Pp.yaw);
    R.speed = 1; R.sway.w = 1; R.look.w = 0; R.look.yaw = R.look.pitch = 0;
    R.flinchK = { k: 90, c: 13 };
    const U = R.U;
    U.uEnergy.value.set(C50.p1); U.uHotCol.value.set(C50.p1); U.uRimCol.value.set(C50.p1);
    U.uPhase.value = 0; U.uCrack.value = 0; U.uDissolve.value = 0; U.uEmK.value = 0.7; U.uRim.value = 0.12; U.uFlash.value = 0;
    for (const h of R.hot) h.k = 0;
    R.mesh.visible = true; R.mesh.castShadow = true;
    R.play('dormant', { fade: 0 });
    this.fx.setPhase(false);
    this.arena.reset(); this.arena.restoreChains?.();
    this.phase = 1; this.k = this.phaseK(1); R.speed = 1;
    this.unit.maxHp = this.unit.hp = this.hpPool(1); this.unit.alive = true;
    this.posture = 0; this.postureT = 0; this.protectT = 0; this.pendingBreak = false; this.heavyCool = 0; this.boundT = 0; this.hitchT = 0; this.parryStunUntil = 0;
    this.B = { mode: 'dormant', gapT: 1.0, cools: {}, last: [], pending: null, approachT: 0, turnLeft: 0, st: null };
    this.p1Done = false; this.p2Done = false; this.downDone = false; this.rewarded = false; this.debugUsed = false; this.god = false; this.aiOn = true;
    this.chain = [];
    this.stats = { t: 0, dealt: 0, taken: 0, blocks: 0, parries: 0, dodges: 0, staggers: 0, hits: 0, combo: 0, p1t: 0 };
    this.fightT = 0;
    this.noDmg = false;
    this.C.noRegen = false; this.C.bossFight = false; this.C.forceHud = false;
    this.hud.show(false); this.hud.setPhase(1, false); this.hud.danger(false);
    if (placePlayer) this.placePlayer(T50.respawn);
    this.restorePlayer();
    this.state = 'dormant';
  }
  placePlayer(p) {
    this.P.place(p.x, p.z, p.yaw, 0);
    this.P.vel.set(0, 0, 0);
    this.cam.set(p.yaw, 0.2, 7.2);
    this.cam.snap(new THREE.Vector3(p.x, 1.55, p.z));
  }
  restorePlayer() {
    const U = this.C.playerUnit, M = this.Mv;
    U.hp = U.maxHp; U.alive = true; U.invuln = 0;
    M.reset(); M.mp = M.mpMax ?? PLAYER_COMBAT.mp;
    M.refillGourd();                                   // 第十九轮：回血葫芦装满（开战、重来、结算）
    for (const k in M.cools) M.cools[k] = 0;
    this.C.hud.setHp(U.hp, U.maxHp);
    this.P.char.anim.stop(0.1);
  }

  // =====================================================================================
  // 每帧
  // =====================================================================================
  update(dt) {
    if (!this.active || !this.rig) return;
    // 第十七轮：场景已不在第五十层（别的流程切走了场景，而不是经由 exit）——收掉这一场，不再把人拦回封印阵、也不再占着守关战的状态
    if (this.g.world && this.g.world !== 'boss50' && this.state !== 'exiting' && !this.busy) { this.teardown(); return; }
    const ui = this.g.ui;
    // 打开界面（设置、行囊……）时整场暂停；过场中不会打开界面
    if (ui.busy && !this.cine.active) { this.hud.pause(true); if (!this.musicPaused) { this.musicPaused = true; this.sound?.duckMusic?.(0.4, 0.4); } return; }
    this.hud.pause(false);
    if (this.musicPaused) { this.musicPaused = false; this.sound?.duckMusic?.(1, 0.6); }
    // 第二十五轮：被终式处决接管——不出招、不走、危险物停住（姿势由演出给，见 finalePose）
    if (this.finaleHold) return;
    this.dt = dt; this.time += dt;
    const R = this.rig, P = this.P;
    if (this.cine.active) this.cine.update(dt);
    // 未触发：踏入封印阵即开战
    if (this.state === 'dormant' && !this.busy) {
      const r = Math.hypot(P.pos.x, P.pos.z);
      if (r < TRIGGER_R && P.pos.y < 1) this.startIntro();
    }
    if (this.state === 'fight') { this.fightT += dt; this.stats.t = this.fightT; }
    // 第十七轮：缚灵锁锁住时，龙的动作、转身、根运动都放慢到一成多（招式的时刻表随之放慢）
    let bk = this.boundT > 0 && this.state === 'fight' ? 0.12 : 1;
    if (this.hitchT > 0) { this.hitchT -= dt; if (this.state === 'fight') bk = Math.min(bk, 0.15); }      // 第十八轮：被弹反时顿一下
    if (this.boundT > 0) { this.boundT -= dt; if (this.boundT <= 0) this.fx.bindEnd?.(); }
    if (bk < 1) this.dt = dt * bk;
    // 龙：推进动作 → 根运动 → 摆姿势 → 挂点
    const mo = R.advance(dt * bk * (this.cine.slow ?? 1));
    if (!this.M?.def?.multi || this.M?.data?.stage === 'wind' || this.M?.data?.stage === 'stop') this.moveBoss(mo.x, mo.z, this.state === 'fight');
    if (this.state === 'fight') this.locomotion(dt);
    R.look.w += ((this.lookW ?? 0) - R.look.w) * Math.min(1, dt * 4);
    R.pose(dt * (this.cine.slow ?? 1), { lookAt: _w.set(P.pos.x, P.pos.y + 1.4, P.pos.z) });
    R.finish(this.time, dt);
    // 招式与 AI（挂点已是本帧的姿势）
    if (this.state === 'fight') { this.updateAI(dt); this.updatePosture(dt); }
    this.updateHazards(dt);
    this.updateProxy();
    if (this.state === 'fight' || this.state === 'dormant') this.pushPlayer();
    if (this.state === 'fight') this.keepPlayerIn();
    // 二阶段：贴着龙身升起的紫焰
    if (this.phase === 2 && this.state !== 'victory' && R.U.uDissolve.value < 0.01 && Math.random() < 0.85) this.fx.embers(this.bodyPoints(), 1);
    if (this.B.mode === 'stagger') this.fx.staggerFx(R.bonePos('head_x', _v));
    this.fx.update(dt);
    this.hud.update(dt, this);
    if (this.sound.listener == null) this.sound.listener = { pos: new THREE.Vector3(), right: { x: 1, z: 0 } };
    const cp = this.g.camera.position, f = this.cam.forward();
    this.sound.listener.pos.copy(cp); this.sound.listener.right.x = -f.z; this.sound.listener.right.z = f.x;
  }
  bodyPoints() { const R = this.rig; return R.caps.filter((c) => c.part !== 'leg').map((c) => c.a); }

  // ---------- 过场用：游戏镜头（玩家身后、朝向龙君）、玩家胸口 ----------
  bossName() { return BOSS50.name; }
  gameCam() {
    const P = this.P.pos, r = this.rig ? this.root : new THREE.Vector3(0, 0, -14);
    const yaw = Math.atan2(r.x - P.x, r.z - P.z), d = 7.2, pitch = 0.2;
    const pos = new THREE.Vector3(P.x - Math.sin(yaw) * d * Math.cos(pitch), P.y + 1.55 + Math.sin(pitch) * d, P.z - Math.cos(yaw) * d * Math.cos(pitch));
    return { pos, at: new THREE.Vector3(P.x, P.y + 1.55, P.z) };
  }
  cameraBehind() {
    const P = this.P.pos;
    if (!this.rig) return;
    const yaw = Math.atan2(this.root.x - P.x, this.root.z - P.z);
    this.cam.set(yaw, 0.2, 7.2);
    this.cam.snap(new THREE.Vector3(P.x, P.y + 1.55, P.z));
  }
  playerChest() {
    if (!this.chestBone) this.P.char.root.traverse((o) => { if (!this.chestBone && o.isBone && /Spine2$/.test(o.name)) this.chestBone = o; });
    const v = new THREE.Vector3();
    if (this.chestBone) { this.chestBone.getWorldPosition(v); return v; }
    return v.copy(this.P.pos).add(new THREE.Vector3(0, 0.3, 0));
  }

  // ---------- 开战：出场过场 ----------
  startIntro() {
    if (this.state !== 'dormant') return;
    this.state = 'intro';
    this.record().tries = (this.record().tries || 0) + 1; this.g.state.save();
    this.releaseInputs();
    this.B.mode = 'cine';
    this.musicTo('intro');
    this.cine.play('intro', () => this.beginFight());
  }
  beginFight() {
    if (this.state === 'off' || this.state === 'exiting') return;
    // 第二十一轮：整场首次通关的修炼灵气按开战时记下的基准（重试、重来不改这份基准）
    if (!this.g.prog?.granted('boss50.first')) this.g.prog?.recordEvent('boss50', 32);
    this.state = 'fight';
    this.B.mode = 'idle'; this.B.gapT = 0.9;
    this.C.noRegen = true; this.C.bossFight = true; this.C.forceHud = true;
    this.hud.show(true); this.hud.setPhase(1, true);
    this.lookW = 1;
    this.rig.play('idle', { fade: 0.25 });
    this.musicTo('battle');
    this.releaseInputs();
    this.relock();
  }
  // 第十八轮：背景音乐。intro 出场曲；battle 战斗曲（循环，出场曲 3 秒内淡出）；off 全部淡出
  musicTo(which, fade = 1.5) {
    const S = this.sound;
    if (!S?.music) return;
    S.duckMusic(1, 0.3);
    if (which === 'intro') { S.stopMusic('b50battle', 0.8); S.music('b50intro', BOSS_MUSIC.intro, { gain: 0.85, fade: 0.6 }); }
    else if (which === 'battle') { S.music('b50battle', BOSS_MUSIC.battle, { loop: true, gain: 0.7, fade: 2.5 }); S.stopMusic('b50intro', 3); }
    else S.stopMusic(null, fade);
  }

  // =====================================================================================
  // AI 与招式
  // =====================================================================================
  // 第二十一轮：此刻打谁——玩家，或隐藏仇恨满了的护战凤凰（tgt：{ pos, vel }，招式里的瞄准、追踪都按它；this.T 是龙的模型素材，不要混用）
  get tgt() {
    if (this.aimPh) { const u = this.C.allies.find((a) => a.phoenix && a.alive && a.world === 'boss50'); if (u) return (this._ph ||= { pos: new THREE.Vector3(), vel: new THREE.Vector3() }, this._ph.pos.copy(u.pos), this._ph); this.aimPh = false; }
    return this.P;
  }
  // 会被招式打到的：玩家，与在场的护战凤凰（凤凰另记一段，不与玩家共用「已打中」）
  victims() {
    const out = [{ pos: this.P.pos, unit: this.C.playerUnit, tag: '', isPlayer: true }];
    for (const u of this.C.allies) if (u.alive && u.world === 'boss50') out.push({ pos: u.pos, unit: u, tag: '#ph', isPlayer: false });
    return out;
  }
  playerRel(p = this.tgt.pos) {
    const r = this.root, dx = p.x - r.x, dz = p.z - r.z;
    return { d: Math.hypot(dx, dz), a: wrap(Math.atan2(dx, dz) - this.rig.yaw) };
  }
  updateAI(dt) {
    const B = this.B;
    for (const k in B.cools) B.cools[k] = Math.max(0, B.cools[k] - dt);
    this.heavyCool = Math.max(0, this.heavyCool - dt);
    if (B.mode === 'move') { this.updateMove(dt); return; }
    if (B.mode === 'hitH') { if (this.rig.done && this.fightT >= (this.parryStunUntil ?? 0)) { B.mode = 'idle'; B.gapT = Math.max(B.gapT, 0.35); this.rig.play('idle', { fade: 0.25 }); } return; }
    if (B.mode === 'stagger') { this.updateStagger(dt); return; }
    if (B.mode === 'cine' || B.mode === 'dormant') return;
    // 寻常状态：idle / walk / turn
    if (this.pendingBreak) { this.pendingBreak = false; this.postureBreak(); return; }
    B.gapT -= dt;
    const { d, a } = this.playerRel();
    if (B.mode === 'turn') {
      // 第十八轮：第二步已经落地、大致朝着玩家，又到了出招的时候——不等收脚，回待机接招（淡入接得住）
      const late = B.gapT <= 0 && Math.abs(a) < 0.45 && this.rig.t >= this.rig.cur.dur * 0.8;
      if (this.rig.done || late) { B.mode = 'idle'; this.rig.play('idle', { fade: 0.2 }); }
      return;
    }
    if (!this.aiOn) { this.idleFace(dt, a); return; }
    // 待出的招：先走近 / 先转身（第二十一轮：选招的这一刻决定打谁）
    if (!B.pending && B.gapT <= 0) { this.aimPh = !!this.C.targetFor?.(this.unit); B.pending = this.choose(d, a); }
    const pend = B.pending;
    if (pend) {
      const ai = pend.ai;
      const far = d > (ai.maxD ?? 99) - 0.3;
      if (far && B.approachT < 4.5) { B.approachT += dt; this.walkToward(dt, a); return; }
      if (ai.front && Math.abs(a) > 0.5) { this.turnToward(a); return; }
      B.pending = null; B.approachT = 0;
      this.startMove(pend);
      return;
    }
    // 空隙里：远了慢慢逼近，否则原地转向玩家
    if (d > 10) this.walkToward(dt, a);
    else this.idleFace(dt, a);
  }
  choose(d, a) {
    const B = this.B, behind = Math.abs(a) > 1.9 && d < 7.5;
    const zone = d < 6.5 ? 'close' : d < 13 ? 'mid' : 'far';
    const list = [];
    let sum = 0;
    for (const id of MOVE_ORDER) {
      const def = MOVES50[id];
      if (def.phase === 2 && this.phase !== 2) continue;
      if ((B.cools[id] || 0) > 0) continue;
      const ai = def.ai;
      if (d < (ai.minD ?? 0)) continue;
      let w = behind && ai.behind ? ai.behind : (ai[zone] || 0);
      if (behind && ai.front) w *= 0.3;
      if (d > (ai.maxD ?? 99)) w *= 0.45;
      if (B.last[0] === id) w *= 0.1; else if (B.last.includes(id)) w *= 0.55;
      // 第二十一轮：玩家在凤凰火带里站久了（≥ campSecs 秒），更常出有清楚预警的逼退招式（落点、雷印、碎岳）——仍按冷却与预警，刚站进去时不会立刻放
      if (CAMP_MOVES.includes(id) && (this.g.phoenix?.campSecs?.() ?? 0) >= CAMP_SECS) w *= CAMP_K;
      if (ai.minGap && this.fightT - (B.usedAt?.[id] ?? -99) < ai.minGap) continue;
      if (w > 0.01) { list.push([def, w]); sum += w; }
    }
    if (!list.length) return null;
    let r = Math.random() * sum;
    for (const [def, w] of list) { r -= w; if (r <= 0) return def; }
    return list[list.length - 1][0];
  }
  walkToward(dt, a) {
    const R = this.rig, B = this.B;
    if (B.mode !== 'walk') { B.mode = 'walk'; R.play('walk', { fade: 0.25, speed: this.k.move }); }
    const turn = Math.sign(a) * Math.min(Math.abs(a), (this.phase === 2 ? CFG.turn.p2 : CFG.turn.p1) * dt);
    R.turn(turn);
    B.walking = true;
  }
  // 第十八轮：待机时不再原地匀速转身（四只脚踩在地上、身子却在转，脚跟着在地上打滑）——偏得不多（≤ 0.42 弧度，约 24°）
  // 只用头颈看向玩家，再多就踏步转身：按要转的角度挑 30° / 60° / 90° 一档，转角倍数限在 0.75–1.3
  idleFace(dt, a) {
    const R = this.rig, B = this.B;
    if (Math.abs(a) > 0.42) { this.turnToward(a); return; }
    if (B.mode !== 'idle') { B.mode = 'idle'; R.play('idle', { fade: 0.25 }); }
  }
  turnToward(a) {
    const R = this.rig, B = this.B, deg = Math.abs(a) * 180 / Math.PI;
    const D = deg < 45 ? 30 : deg < 76 ? 60 : 90, side = a > 0 ? 'L' : 'R';
    B.mode = 'turn';
    R.play(D === 60 ? `turn${side}` : `turn${side}${D}`, { fade: 0.2, speed: this.k.move, yawK: THREE.MathUtils.clamp(deg / D, 0.75, 1.3) });
  }
  // 走路：按步幅推着走（在 advance 的根运动之外）
  locomotion(dt) {
    const B = this.B;
    if (B.mode === 'walk' && this.rig.name === 'walk') {
      const f = this.rig.forward, v = CFG.walk * this.k.move;
      this.moveBoss(f.x * v * dt, f.z * v * dt, true);
      if ((this.stepT = (this.stepT ?? 0) - dt) <= 0) { this.stepT = 0.6 / this.k.move; this.sound.play('step', { at: this.root }); }
    }
  }

  startMove(def) {
    const R = this.rig, B = this.B;
    const clip = typeof def.clip === 'function' ? def.clip(this) : def.clip;
    const M = this.M = { def, uid: (this.moveSeq = (this.moveSeq || 0) + 1), id: Object.keys(MOVES50).find((k) => MOVES50[k] === def), clip, t0: 0, t1: 0, hits: new Set(), tele: {}, sw: {}, anchor: {}, face: {}, tracked: {}, data: {}, cur: null, startT: this.fightT };
    R.play(clip, { fade: 0.22, speed: this.k.anim, ranges: def.ranges?.(this) || null });
    M.cur = R.cur;
    B.mode = 'move';
    B.last.unshift(M.id); B.last.length = Math.min(B.last.length, 3);
    (B.usedAt ||= {})[M.id] = this.fightT;
    (this.stats.moves ||= {})[M.id] = (this.stats.moves[M.id] || 0) + 1;
    this.lookW = 0.35;
    this.hud.move(`${def.no} · ${def.name}`, !!def.danger);
    def.start?.(this, M);
  }
  updateMove(dt) {
    const M = this.M, R = this.rig;
    if (!M) return;
    if (R.cur !== M.cur) { M.cur = R.cur; M.t0 = 0; M.t1 = R.t; }
    else { M.t0 = M.t1; M.t1 = R.t; }
    M.def.update(this, M, dt);
    if (this.M !== M) return;
    if (M.finished || (!M.def.multi && R.done)) this.endMove(false);
  }
  endMove(interrupted) {
    const M = this.M;
    if (!M) return;
    this.M = null;
    try { M.def.end?.(this, M, interrupted); } catch (e) { console.warn(e); }
    for (const t of Object.values(M.tele)) t?.remove?.(0.15);
    for (const k of ['l', 'r', 'tail']) this.trail(k, false);
    for (let i = 0; i < 3; i++) this.charge(i, 0);
    this.stopLoop('breath');
    this.hud.danger(false); this.hud.move(null);
    const B = this.B;
    B.cools[M.id] = M.def.cd * this.k.cool;
    const g = this.phase === 2 ? CFG.gap.p2 : CFG.gap.p1;
    B.gapT = g[0] + Math.random() * (g[1] - g[0]) + (['charge', 'jump', 'apocalypse', 'breath'].includes(M.id) ? 0.4 : 0);
    if (this.root.y > 0.01) this.root.y = 0;
    this.lookW = 1;
    if (!interrupted) { B.mode = 'idle'; this.rig.play('idle', { fade: 0.3 }); }
  }
  cancelMove(silent = false) {
    if (!this.M) return;
    const M = this.M;
    if (M.data?.h) M.data.h.end?.();
    this.endMove(true);
    if (!silent) this.B.mode = 'idle';
  }

  // ---------- 招式用的小工具 ----------
  at(M, t) { return M.t0 < t && M.t1 >= t; }
  realT(a, b) { return this.rig.realSpan(a, b); }
  ahead(dist, out = new THREE.Vector3()) { const f = this.rig.forward; return out.set(this.root.x + f.x * dist, 0, this.root.z + f.z * dist); }
  track(rate, M = null, maxTotal = Infinity) {
    const { a } = this.playerRel();
    let step = rate * (this.phase === 2 ? 1.25 : 1) * this.dt;
    if (M) { const used = M.tracked._ ?? 0; step = Math.min(step, Math.max(0, maxTotal - used)); }
    const d = Math.sign(a) * Math.min(Math.abs(a), step);
    this.rig.turn(d);
    if (M) M.tracked._ = (M.tracked._ ?? 0) + Math.abs(d);
  }
  charge(i, k) { if (this.rig) this.rig.hot[i].k = Math.max(0, Math.min(1.2, k)); }
  trail(key, on) { const T = this.fx?.trails[key]; if (T) T.on = on; }
  danger(M) { M.danger = true; this.hud.danger(true); }
  sfx(name, o = {}) { this.sound.play(name, o); }
  sfxLoop(id, kind, o) { this.sound.loop(id, kind, o); }
  stopLoop(id) { this.sound.stopLoop(id); }
  clampIn(p, R) { const r = Math.hypot(p.x, p.z); if (r > R) { p.x *= R / r; p.z *= R / r; } return p; }
  rayToRing(from, dir, R = CFG.keepIn) {
    // from + t·dir 与半径 R 的圆的交点（t > 0）
    const b = from.x * dir.x + from.z * dir.z, c = from.x * from.x + from.z * from.z - R * R;
    return -b + Math.sqrt(Math.max(0, b * b - c));
  }
  // 移动龙（根运动、走路、冲撞、跃起）：龙心不出 keepIn；被挡住时 this.blocked 为真
  moveBoss(dx, dz, collide = true, y = null) {
    const r = this.root;
    r.x += dx; r.z += dz;
    this.blocked = false;
    if (collide) { const d = Math.hypot(r.x, r.z); if (d > CFG.keepIn) { r.x *= CFG.keepIn / d; r.z *= CFG.keepIn / d; this.blocked = true; } }
    if (y != null) r.y = y;
  }
  // 扇形预警：前摇里跟着龙（位置、朝向），until 之后定住；与 sweep 的判定共用一组锚点
  sectorTele(M, key, { r, a0, a1, r0 = 0, until, sweep = 0, danger = false }) {
    const c = (a0 + a1) / 2, arc = Math.abs(a1 - a0);
    const T = this.fx.tele({ shape: 'sector', pos: this.root, yaw: this.rig.yaw + c, r, r0, arc, danger, sweep, dur: Math.max(0.15, this.realT(M.t1, until)),
      follow: (T2) => { if (!M.anchor[key]) T2.place(this.root, this.rig.yaw + c); } });
    T.center = c;
    M.tele[key] = T;
    return T;
  }
  // 扫掠判定：src() 给出爪尖 / 尾尖的世界位置；以出手时的站位为圆心，按它这一帧扫过的角度是否经过玩家判定
  sweep(M, key, src, o) {
    if (M.hits.has(key) && !this.C.allies.length) return;
    const T = M.tele[key];
    if (!M.anchor[key]) {
      M.anchor[key] = T ? new THREE.Vector3(T.mesh.position.x, 0, T.mesh.position.z) : this.root.clone().setY(0);
      M.face[key] = T ? T.yaw - (T.center ?? 0) : this.rig.yaw;
    }
    const A = M.anchor[key], f = M.face[key];
    const s = src(), sd = Math.hypot(s.x - A.x, s.z - A.z);
    if (sd < (o.minD ?? 0.5)) return;                                 // 贴着身体的一段角度不稳，跳过
    const ang = Math.atan2(s.x - A.x, s.z - A.z);
    const prev = M.sw[key];
    M.sw[key] = ang;
    if (prev == null) return;
    for (const V of this.victims()) {
      const k = key + V.tag;
      if (M.hits.has(k)) continue;
      const P = V.pos, dp = Math.hypot(P.x - A.x, P.z - A.z);
      if (dp > o.r + 0.25 || dp < (o.r0 ?? 0) - 0.3) continue;
      if (P.y > 2.4) continue;
      const pa = Math.atan2(P.x - A.x, P.z - A.z);
      if (!o.full) { const rel = wrap(pa - f); if (rel < Math.min(o.a0, o.a1) - 0.03 || rel > Math.max(o.a0, o.a1) + 0.03) continue; }
      const d1 = wrap(pa - prev), d2 = wrap(ang - prev);
      if (Math.abs(d2) < 1e-4) continue;
      if (Math.sign(d1) === Math.sign(d2) && Math.abs(d1) <= Math.abs(d2) + 0.04) {
        M.hits.add(k);
        if (V.isPlayer) T?.hit();
        // 第十七轮：接触点取玩家身前、朝出手站位那一侧（爪 / 尾扫过玩家的那一点）——格挡的正面判定与火星都按它；
        // 不用爪尖本身（爪尖此刻可能在玩家身侧一米开外，按它判正面会忽左忽右）
        const tip = typeof o.at === 'function' ? o.at() : s;
        const at = new THREE.Vector3(P.x + ((A.x - P.x) / dp) * 0.55, Math.max(0.9, Math.min(1.7, tip.y)), P.z + ((A.z - P.z) / dp) * 0.55);
        this.hit({ ...o, key, at, victim: V.isPlayer ? null : V.unit });
      }
    }
  }
  // 圆形判定（一次）
  circleHit(M, key, c, r, o) {
    let res;
    for (const V of this.victims()) {
      const k = (key ?? o.key) + V.tag;
      if (M && M.hits.has(k)) continue;
      const P = V.pos;
      if (Math.hypot(P.x - c.x, P.z - c.z) > r + 0.2 || P.y > 2.6) continue;
      M?.hits.add(k);
      const r0 = this.hit({ ...o, key: key ?? o.key, at: o.at || c, victim: V.isPlayer ? null : V.unit });
      if (V.isPlayer) res = r0;
    }
    return res;
  }
  // 路径判定（冲撞）：这一帧身体扫过的线段
  pathHit(M, key, a, b, r, o) {
    for (const V of this.victims()) {
      const k = key + V.tag;
      if (M.hits.has(k)) continue;
      const P = V.pos, abx = b.x - a.x, abz = b.z - a.z, L2 = abx * abx + abz * abz || 1e-6;
      const u = Math.max(0, Math.min(1, ((P.x - a.x) * abx + (P.z - a.z) * abz) / L2));
      const d = Math.hypot(P.x - (a.x + abx * u), P.z - (a.z + abz * u));
      if (d > r + 0.25 || P.y > 2.4) continue;                        // r 与路径预警的半宽一致，0.25 为玩家身体
      M.hits.add(k);
      this.hit({ ...o, key, at: o.at || a, victim: V.isPlayer ? null : V.unit });
    }
  }
  // 吐息：锥形判定
  breathFrame(len) {
    const R = this.rig, mouth = R.mouth(new THREE.Vector3());
    // 锥自真实的嘴部发出；水平方向随龙身朝向（吐息中按有限速度转身即是横扫），俯角对准约 0.85 倍锥长处的地面
    const fx = Math.sin(R.yaw), fz = Math.cos(R.yaw);
    const reach = len * 0.85, drop = Math.max(0.3, mouth.y - 0.6);
    const dir = new THREE.Vector3(fx, -drop / reach, fz).normalize();
    const base = new THREE.Vector3(mouth.x - fx * 0.8, 0, mouth.z - fz * 0.8);
    const tg = mouth.y / Math.max(0.05, -dir.y);
    const ground = new THREE.Vector3(mouth.x + dir.x * tg, 0.05, mouth.z + dir.z * tg);
    return { mouth, dir, yaw: R.yaw, base, ground };
  }
  inCone(m, dir, len, half, P = this.P.pos) {
    // 玩家身体取胸口一点；锥轴到这一点的夹角与距离
    const px = P.x - m.x, py = P.y + 1.0 - m.y, pz = P.z - m.z, d = Math.hypot(px, py, pz);
    if (d > len + 0.3) return false;
    // 地面投影的扇形与预警一致：水平夹角 ≤ 半角，且在锥长之内
    const ha = Math.abs(wrap(Math.atan2(px, pz) - Math.atan2(dir.x, dir.z)));
    const hd = Math.hypot(px, pz);
    return ha <= half + Math.atan2(0.25, Math.max(1, hd)) && hd <= len + 0.25;     // 与地面扇形预警同一组锥长、半角（0.25 为玩家身体）
  }

  // ---------- 伤害玩家（统一入口）：阶段倍率、防御 / 弹反 / 破防 / 受击反应都交给 combat.damage ----------
  // 第十七轮：来招的防御属性按招式定——def 显式给出，否则按旧开关推断（不可挡又不可弹：落雷 thunder / 焰 fire / 其余 aoe；
  // 吐息 breath；可挡可弹且破防：heavy 难挡；其余 claw），id + 段名标识这一段（同一段只结算一次）；
  // 招式的 parryEnds 为真时，被弹反之后这一招余下的段作废
  specFor(o) {
    const M = this.M, D = M?.def || {};
    const def = o.def || (o.kind === 'fire' ? (o.block === false ? 'fire' : 'breath') : o.block === false ? (o.react === 'stun' ? 'thunder' : 'aoe') : o.guardBreak || D.hard ? 'heavy' : 'claw');
    // 没有段名的（落雷、火柱、冲击环这类危险物）每一次各算一段：同一招的几道落雷、几根火柱各自结算，不被当成重复
    const s = { def, id: `b50:${M?.uid ?? 'hz'}:${o.key ?? 'n' + (this.hitN = (this.hitN || 0) + 1)}`, seg: o.seg ?? 0, active: true };
    if (D.parryResult) s.onParry = D.parryResult;
    if (D.parryEnds != null) s.parryEnds = D.parryEnds;
    if (D.parryPosture != null) s.posture = D.parryPosture;
    if (o.block === false) s.block = false;
    if (o.parry === false) s.parry = false;
    return s;
  }
  hit(o) {
    if (this.state !== 'fight' || this.noDmg) return null;
    // 第二十一轮：打到护战的凤凰——只结算伤害（凤凰自己的气血与仇恨），不套用玩家的受击保护、处决与统计
    if (o.victim) {
      if (!o.victim.alive || (this.M?.parryEnded && !o.hazard)) return null;
      const sp = this.specFor(o);
      return this.C.damage(o.victim, o.dmg * this.k.dmg, { from: this.unit, kind: o.kind || 'phys', at: o.at?.clone ? o.at.clone() : o.at, spec: { ...sp, id: sp.id + '#ph' } });
    }
    const U = this.C.playerUnit;
    if (!U.alive) return null;
    if (this.M?.parryEnded && !o.hazard) return null;                       // 这一招已被弹反：余下的段作废
    if (this.god) { this.C.popNumber(U, '无伤', 'block'); return 'immune'; }
    const at = o.at ? (o.at.clone ? o.at.clone() : o.at) : this.root.clone();
    // 受击后的无敌只给 0.22 秒（两爪、三段之间相隔 0.33 秒以上，每一下都单独结算；连续受击另有护体保护）
    // 第二十六轮：迟到的弹反挂起时（'pending'）结果晚一点才定——受击声、连续受击保护等到那时再做（after）
    const res = this.C.damage(U, o.dmg * this.k.dmg, { from: this.unit, kind: o.kind || 'phys', at, spec: this.specFor(o), react: 'react' in o ? o.react : 'flinch', invuln: 0.22, after: (r) => this.afterHit(r) });
    if (res !== 'pending') this.afterHit(res);
    return res;
  }
  afterHit(res) {
    if (res !== 'hit') return;
    const U = this.C.playerUnit;
    this.sound.play('hurt', { at: this.P.pos });
    // 连续受击保护：3.5 秒内第三次被打中，给 1.3 秒护体（不会被一套寻常连击锁死）
    const t = this.fightT;
    this.chain = this.chain.filter((x) => t - x < 3.5); this.chain.push(t);
    if (this.chain.length >= 3) { this.chain.length = 0; this.Mv.iframes = Math.max(this.Mv.iframes, 1.3); this.fx.guardBreak(this.P); this.C.popNumber(U, '护体', 'parry'); }
  }
  statHit(e) {
    if (!this.fighting) return;
    if (e.target === this.C.playerUnit) {
      if (e.result === 'hit') { this.stats.taken += e.amount; this.stats.hits++; }
      else if (e.result === 'block') { this.stats.blocks++; this.stats.taken += e.amount; }
      else if (e.result === 'parry') this.stats.parries++;
      else if (e.result === 'dodge') this.stats.dodges++;
    }
    this.stats.combo = Math.max(this.stats.combo, this.Mv.combo?.n || 0);
  }

  // ---------- 龙受击：轻 / 重 / 失衡，架势，阶段耗尽 ----------
  receive(amount, o = {}) {
    const C = this.C, U = this.unit;
    if (!U.alive || this.state !== 'fight' || this.B.mode === 'cine' || this.noDmg) { C.emitHit({ target: U, from: o.from, amount: 0, kind: o.kind, result: 'immune' }); return 'immune'; }
    // 第二十五轮：拔刀斩「终式」的处决探针——这一下已被接受，结算之前问一次；确认处决就不扣血，交给演出
    if (o.execProbe && !o.dot && o.execProbe(U)) { C.emitHit({ target: U, from: o.from, amount: 0, kind: o.kind, result: 'exec' }); return 'exec'; }
    const heavy = !!(o.big || o.kind === 'heavy' || (o.stun ?? 0) >= 0.7 || (o.knock ?? 0) > 0);
    const stag = this.B.mode === 'stagger';
    const headY = this.rig.bonePos('head_x', _v).y;
    const weak = (U.part === 'head' || U.part === 'neck') && headY < 2.9;
    let k = 1;
    if (stag) k *= 1.3;
    if (weak) k *= 1.2;
    const dmg = amount * k, hp0 = U.hp;
    // 第二十九轮：通用的终结——玩家一方把最后一条命打到见底（不论哪种招式），交给墨里终焉（这一下不扣血，演出收刀合拢时才结束这一阶段）
    if (dmg >= U.hp && C.lethalProbe?.(U, { from: o.from, kind: o.kind, dot: !!o.dot })) { C.emitHit({ target: U, from: o.from, amount: 0, kind: o.kind, result: 'exec' }); this.log?.('finaleKill', { phase: this.phase, hp: Math.round(U.hp) }); return 'exec'; }
    U.hp = Math.max(0, U.hp - dmg);
    this.stats.dealt += hp0 - U.hp;
    C.emitHit({ target: U, from: o.from, amount: hp0 - U.hp, kind: o.kind, result: 'hit' });
    if (!o.dot) {
      C.popNumber(U, `${Math.round(dmg)}`, heavy || stag ? 'heavy' : o.kind);
      if (weak) C.popNumber(U, '要害', 'parry');
      const away = _w.set(U.hitPoint.x - this.P.pos.x, 0, U.hitPoint.z - this.P.pos.z).normalize();
      this.fx.sparks(U.hitPoint.clone(), { big: heavy, away: away.clone() });
      this.sound.play('hit', { at: U.hitPoint, big: heavy });
      this.rig.U.uFlash.value = heavy ? 0.45 : 0.25;
    }
    // 架势（第十七轮：玩家的招式给出 posture，按招式定；没有时按轻重估）
    if (!o.dot) {
      let pk = o.posture > 0 ? o.posture * 0.85 : heavy ? 7 : o.kind === 'gold' ? 2.6 : 3.4;
      if (weak) pk *= 1.6;
      if (this.M?.def.charging && this.M.t1 <= this.M.def.charging[1]) pk *= 1.6;      // 灭世龙怒的蓄力中
      this.addPosture(pk);
    }
    if (U.hp <= 0) { this.depleted(); return 'hit'; }
    if (o.dot) return 'hit';
    if (stag) { this.rig.hitFlinch(this.side(o.at), 0.5); return 'hit'; }        // 失衡中：只有局部受击，不会重新失衡
    if (this.posture >= CFG.posture.max) { this.postureBreak(); return 'hit'; }
    if (heavy) this.heavyHit(o.at);
    else this.lightHit(o.at);
    return 'hit';
  }
  side(at) {
    if (!at) return 0;
    const a = wrap(Math.atan2(at.x - this.root.x, at.z - this.root.z) - this.rig.yaw);
    return a > 0 ? 1 : -1;
  }
  lightHit(at) { this.rig.hitFlinch(this.side(at), this.phase === 2 ? 0.55 : 0.75); }
  heavyHit(at) {
    const M = this.M, B = this.B;
    const canInt = M && M.def.interrupt === 'heavy' && M.t1 < (M.def.windEnd ?? 0) && !M.noInterrupt && (!M.data.stage || M.data.stage === 'wind');
    if ((canInt || (!M && (B.mode === 'idle' || B.mode === 'walk' || B.mode === 'turn'))) && this.heavyCool <= 0) {
      this.heavyCool = this.phase === 2 ? 4.5 : 3.2;
      if (M) { this.cancelMove(true); this.hud.toast50('打断'); }
      B.mode = 'hitH'; B.pending = null;
      this.rig.play('hitH', { fade: 0.12, speed: this.phase === 2 ? 1.5 : 1.1 });
      this.sound.play('growl', { at: this.root, dur: 0.5 });
      return;
    }
    this.rig.hitFlinch(this.side(at), 1.25);
  }
  // 第十七轮：被弹反——按招式配置：积累架势（只有架势耗尽才长时间失衡），收手一晃；可打断的招式被弹开即打断（短暂受击）；
  // parryEnds 的多段招式余下的段作废
  onParried(spec, at) {
    if (!this.fighting) return;
    const M = this.M;
    this.addPosture((spec?.posture ?? 20) * (this.phase === 2 ? 0.85 : 1), true);
    this.rig.U.uFlash.value = 0.32;                 // 一闪即可（再亮整条龙就发白）
    this.stats.parryStag = (this.stats.parryStag || 0) + 1;
    if (M && spec?.parryEnds) M.parryEnded = true;
    if (this.posture >= CFG.posture.max && this.B.mode !== 'stagger') { this.hud.toast50('弹反'); this.rig.hitFlinch(this.side(at), 1.3); this.postureBreak(); return; }
    // 第二十二轮：被弹断的僵直——一阶段 parryStun.boss、二阶段 bossP2 秒（受击动作按这个时长放完，与 AI 的僵直同一段）；只有架势攒满才长时间失衡。
    // 前一爪被弹开、余下的段照常的（parryEnds 为假）只顿 bossHitch 秒（二阶段 ×0.75），不吃完整的僵直
    const PS = PLAYER_COMBAT.guard.parryStun, stun = this.phase === 2 ? PS.bossP2 : PS.boss, hitch = PS.bossHitch * (this.phase === 2 ? 0.75 : 1);
    // 招式配置为余下的段照常（招式自己的 parryEnds 为假，如双爪追猎）：只顿一下（动作放慢到一成半），随后照常出下一击，不把后面那一爪的路线带偏。
    // 按招式本身的配置判断——来招的 spec 里还混着 ATTACK_DEF.claw 的缺省（parryEnds: false），按它判断的话，只有一爪的裂空龙爪被弹反也只是顿一下、不僵直
    const key = String(spec?.id ?? '').split(':')[2];
    if (M?.def?.parryEnds === false && key !== M.def.lastKey?.(this)) {
      this.rig.hitFlinch(this.side(at), 0.5);
      this.hitchT = Math.max(this.hitchT || 0, hitch);
      this.hud.toast50('弹反 · 一顿');
      return;
    }
    // 冲刺、腾空这类不能中途停下的段：只后仰一晃
    if (M && M.noInterrupt) { this.rig.hitFlinch(this.side(at), 1.3); this.hud.toast50('弹反'); return; }
    // 其余：这一招作废，后仰退一步（重受击动作），僵直期间不出招、不转身
    if (M) this.cancelMove(true);
    this.B.mode = 'hitH'; this.B.pending = null;
    this.parryStunUntil = this.fightT + stun;
    // 受击动作（0.75 秒）放慢到正好 stun 秒放完——动作与僵直一起结束，不在僵直之后再加一段受击锁定
    this.rig.play('hitH', { fade: 0.12, speed: (this.rig.dur('hitH') || 0.75) / stun });
    this.stats.parryStun = { at: +this.fightT.toFixed(3), stun, phase: this.phase };
    this.rig.hitFlinch(this.side(at), 0.6);
    this.sound.play('growl', { at: this.root, dur: 0.6 });
    this.hud.toast50('弹反 · 僵直');
  }
  parried() { this.onParried({ posture: 20 }, null); }
  // 第十七轮：缚灵锁——锁住片刻（动作、转身、根运动放慢），积累架势；锁链特效由 skillfx 挂在龙身上
  bind(time, posture = 0) {
    if (!this.fighting || this.B.mode === 'cine') return;
    this.boundT = Math.max(this.boundT || 0, time);
    if (posture > 0) this.addPosture(posture);
    this.hud.toast50('缚灵锁');
    if (this.posture >= CFG.posture.max && this.B.mode !== 'stagger') this.postureBreak();
  }
  addPosture(v, parry = false) {
    if (this.protectT > 0 || this.B.mode === 'stagger') return;
    this.posture = Math.min(CFG.posture.max, this.posture + v);
    this.postureT = 0;
    void parry;
  }
  updatePosture(dt) {
    if (this.protectT > 0) this.protectT -= dt;
    this.postureT += dt;
    if (this.postureT > CFG.posture.delay && this.B.mode !== 'stagger') this.posture = Math.max(0, this.posture - CFG.posture.decay * (this.phase === 2 ? 0.8 : 1) * dt);
  }
  // 架势崩：打断当前招式（空中、冲刺中则等落地 / 刹停），跪地喘息，期间受到的伤害 ×1.3
  postureBreak() {
    if (this.B.mode === 'stagger') return;
    const M = this.M;
    if (M && M.noInterrupt) { this.pendingBreak = true; return; }
    if (M) this.cancelMove(true);
    const B = this.B;
    B.mode = 'stagger'; B.pending = null;
    B.st = { stage: 'in', t: 0, hold: this.phase === 2 ? CFG.staggerTime.p2 : CFG.staggerTime.p1 };
    this.rig.play('stagger_in', { fade: 0.14, speed: this.phase === 2 ? 1.25 : 1 });
    this.posture = CFG.posture.max;
    this.stats.staggers++;
    this.lookW = 0;
    this.sound.play('stagger', { at: this.root });
    this.fx.flash(0xfff1c8, 0.2); this.fx.shake(0.15);
    this.hud.toast50('失衡 · 破绽');
    this.fx.dust(this.root, 10, 2.2);
  }
  updateStagger(dt) {
    const B = this.B, S = B.st, R = this.rig;
    S.t += dt;
    if (S.stage === 'in' && R.done) { S.stage = 'loop'; S.t = 0; R.play('stagger_loop', { fade: 0.2 }); }
    else if (S.stage === 'loop' && S.t >= S.hold) { S.stage = 'out'; R.play('stagger_out', { fade: 0.15, speed: this.phase === 2 ? 1.3 : 1 }); this.posture = 0; this.protectT = CFG.posture.protect; }
    else if (S.stage === 'out' && R.done) { B.mode = 'idle'; B.gapT = 0.35; R.play('idle', { fade: 0.2 }); this.lookW = 1; }
  }

  // 第二十一轮：凤翔天击的秒杀——清空当前阶段的气血，调用正常的阶段耗尽流程（不另造绕过过场的死亡入口）；
  // 非战斗中、过场中、无伤保护时不成立
  executeStage(o = {}) {
    const U = this.unit;
    if (!U.alive || this.state !== 'fight' || this.B?.mode === 'cine' || this.noDmg) return false;
    const hp0 = U.hp;
    U.hp = 0;
    this.stats.dealt += hp0;
    this.C.emitHit({ target: U, from: o.from, amount: hp0, kind: o.finale ? 'finale' : 'phoenix', result: 'hit', execute: true });
    this.depleted();
    return true;
  }
  // ---------- 第二十五轮：拔刀斩「终式」的处决（game/inkFinale.js 调用；龙君是大型目标：只做原地精简演出）----------
  finaleInfo() { return { allow: true, canEnd: this.state === 'fight' && this.B?.mode !== 'cine' && !this.noDmg }; }
  finaleStart(at) {
    this.cancelMove(true); this.hitchT = 0; this.pendingBreak = false; this.boundT = 0;
    this.rig.play('hitH', { fade: 0.12, speed: 0.85 });
    this.rig.hitFlinch(this.side(at), 1.25);
  }
  finalePose(dt) {
    if (!this.rig) return;
    const R = this.rig, P = this.P;
    this.finaleT = (this.finaleT || 0) + dt;
    R.advance(dt);
    R.pose(dt, { lookAt: _w.set(P.pos.x, P.pos.y + 1.4, P.pos.z) });
    R.finish(this.time + this.finaleT, dt);
    this.updateProxy();
  }
  finaleRestore() { if (this.state === 'fight') { this.B.mode = 'idle'; this.B.gapT = 0.5; this.rig.play('idle', { fade: 0.25 }); } }
  deferCine(f) { if (this.finaleDefer) this.finaleDefer.push(f); else f(); }
  // ---------- 阶段耗尽（各只处理一次）----------
  depleted() {
    if (this.phase === 1) this.onP1Depleted();
    else this.onP2Depleted();
  }
  onP1Depleted() {
    if (this.p1Done) return;
    this.p1Done = true;
    this.state = 'transition';
    this.stats.p1t = this.fightT;
    this.cancelMove(true); this.clearHazards(); this.fx.clear();
    this.B.mode = 'cine'; this.pendingBreak = false;
    this.noDmg = true;
    this.releaseInputs();
    this.sound?.duckMusic?.(0.35, 0.8);
    this.deferCine(() => this.cine.play('phase', () => this.beginPhase2()));
  }
  beginPhase2() {
    if (this.state === 'off' || this.state === 'exiting') return;
    this.applyPhase(2);
    this.unit.maxHp = this.unit.hp = this.hpPool(2);
    this.posture = 0; this.protectT = 1.5;
    for (const k in this.B.cools) this.B.cools[k] = Math.min(this.B.cools[k], 2);
    this.noDmg = false;
    this.state = 'fight';
    this.B.mode = 'idle'; this.B.gapT = 1.2;           // 二阶段开始前的短暂准备
    this.rig.play('idle', { fade: 0.25 });
    this.hud.setPhase(2, true);
    this.lookW = 1;
    this.sound?.duckMusic?.(1, 1.5);
    this.releaseInputs(); this.relock();
  }
  // 阶段外观与速度：二阶段裂纹、眼光、紫焰色，动作 × 1.25、移动 × 1.35、受击更短
  applyPhase(p) {
    this.phase = p; this.k = this.phaseK(p);
    const R = this.rig, U = R.U;
    R.speed = 1;
    if (p === 2) {
      U.uEnergy.value.set(C50.p2); U.uHotCol.value.set(C50.p2); U.uRimCol.value.set(C50.p2);
      U.uPhase.value = 1; U.uCrack.value = 1; U.uEmK.value = 1.8; U.uRim.value = 0.45;
      R.flinchK = { k: 200, c: 20 };
      this.fx.setPhase(true);
      this.arena.setGlow(0.45, C50.p2); this.arena.setCrack(1);
    } else {
      U.uEnergy.value.set(C50.p1); U.uPhase.value = 0; U.uCrack.value = 0; U.uEmK.value = 1.4; U.uRim.value = 0.18;
      R.flinchK = { k: 90, c: 13 };
      this.fx.setPhase(false);
    }
  }
  onP2Depleted() {
    if (this.p2Done) return;
    this.p2Done = true;
    this.unit.alive = false;
    this.state = 'victory';
    this.cancelMove(true); this.clearHazards();
    for (const t of [...this.fx.teles]) t.remove(0.2);
    this.B.mode = 'cine';
    this.noDmg = true;
    this.releaseInputs();
    this.C.noRegen = false; this.C.forceHud = false;
    this.musicTo('off', 3);
    this.deferCine(() => this.cine.play('victory', () => this.showResult(true)));
  }
  // combat.onPlayerDown 先问这里：返回 true 表示已处理
  onPlayerDown() {
    if (!this.active) return false;
    if (this.state === 'fight' && !this.downDone) {
      this.downDone = true;
      this.state = 'exec';
      this.cancelMove(true); this.clearHazards();
      for (const t of [...this.fx.teles]) t.remove(0.2);
      this.B.mode = 'cine';
      this.noDmg = true;
      this.releaseInputs();
      this.musicTo('off', 2);
      this.cine.play('exec', () => this.showResult(false));
      return true;
    }
    // 其他时刻（理论上不会受伤）：原地复原
    this.restorePlayer();
    return true;
  }

  // ---------- 奖励（只发一次）与存档 ----------
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
    // 第二十一轮：修炼灵气——修为系统开放后的第一次有效通关发一次（本级基础需求 20%，按开战时记下的基准；阶段结束不发；调试入口打的不计）。
    // 与原有的首通奖励分开记（ledger），在修为系统之前就通关过的角色，下一次通关时照样领这一份；之后重复通关不再给
    const P = this.g.prog;
    let qiLine = null;
    if (P && !P.granted('boss50.first')) { const got = P.grantOnce('boss50.first', 0.2, P.d.events?.boss50 || P.recordEvent('boss50', 32), '通天塔第五十层 · 首次通关'); qiLine = got > 0 ? `修炼灵气 +${Math.round(got)}` : '修炼灵气（已达当前上限，不再积累）'; }
    else if (P) qiLine = '修炼灵气：重复通关不再给（已领过）';
    if (first) {
      R.firstReward = true;
      st.d.merit += 120; st.d.inv.longyin = (st.d.inv.longyin || 0) + 1; st.d.inv.longlin = (st.d.inv.longlin || 0) + 2; st.d.inv.yangyuan = (st.d.inv.yangyuan || 0) + 3;
      items.push('宗门贡献 +120', '镇塔龙印 ×1', '烬霄龙鳞 ×2', '养元丹 ×3');
    } else {
      st.d.merit += 20; st.d.inv.longlin = (st.d.inv.longlin || 0) + 1;
      items.push('宗门贡献 +20', '烬霄龙鳞 ×1');
    }
    if (qiLine) items.push(qiLine);
    st.event('tower50', true);
    st.save();
    this.rewardInfo = { first, best, items, secs };
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
    el.className = 'ar-result b50-result';
    const boss = this.unit;
    el.innerHTML = win ? `
      <div class="ar-verdict win"><b>胜</b><span>镇塔龙君·烬霄伏诛 · 第五十层通关</span></div>
      <div class="kv">
        <b>用时</b><span>${fmt50(info.secs)}（${info.secs.toFixed(1)} 秒）${info.best ? ' · 新的最佳' : R.best != null ? ` · 最佳 ${fmt50(R.best)}` : ''}</span>
        <b>承受伤害</b><span>${Math.round(st.taken)}（被打中 ${st.hits} 次）</span>
        <b>造成伤害</b><span>${Math.round(st.dealt)}</span>
        <b>格挡 / 弹反 / 闪身</b><span>${st.blocks} / ${st.parries} / ${st.dodges}</span>
        <b>使其失衡</b><span>${st.staggers} 次</span>
        <b>奖励</b><span>${info.items.join('、')}${info.first ? '（首通）' : ''}</span>
      </div>
      <p class="muted">${info.debug ? '调试结果不写入存档。' : '奖励已收入行囊（只发一次）。'}</p>
      <div class="ar-act"><button class="act" data-again>再战</button><button class="act ghost" data-leave>返回塔中</button></div>`
      : `
      <div class="ar-verdict lose"><b>败</b><span>倒在龙焰之下</span></div>
      <div class="kv">
        <b>坚持</b><span>${fmt50(st.t)}（${this.phase === 2 ? `已入二阶段，龙君余下气血 ${Math.ceil(boss.hp)} / ${boss.maxHp}` : `一阶段，龙君余下气血 ${Math.ceil(boss.hp)} / ${boss.maxHp}`}）</span>
        <b>承受伤害</b><span>${Math.round(st.taken)}（被打中 ${st.hits} 次）</span>
        <b>造成伤害</b><span>${Math.round(st.dealt)}</span>
        <b>格挡 / 弹反 / 闪身</b><span>${st.blocks} / ${st.parries} / ${st.dodges}</span>
        <b>使其失衡</b><span>${st.staggers} 次</span>
      </div>
      <p class="muted">提示：红色预警不可格挡，看准落点闪身；收势是反击的时机；龙首低下时打中要害，架势涨得更快。</p>
      <div class="ar-act"><button class="act" data-again>重试</button><button class="act ghost" data-leave>返回塔中</button></div>`;
    let chosen = null;
    el.addEventListener('click', (e) => {
      chosen = e.target.closest('[data-again]') ? 'again' : e.target.closest('[data-leave]') ? 'leave' : null;
      if (!chosen) return;
      ui.closePanel();
    });
    g.panelKind = 'boss50Result';
    ui.openPanel(win ? '第五十层 · 通关' : '第五十层 · 挑战失败', BOSS50.name, el, {
      width: 640,
      onClose: () => {
        if (g.panelKind === 'boss50Result') g.panelKind = null;
        if (chosen === 'again') this.retry();
        else if (chosen === 'leave') this.exit();
        // 关掉（Esc、点空白）：留在殿中——胜后可在殿里走走，从南门离开；败后自动重置到「未触发」
        else if (!win) this.retry(true, true);           // 关掉失败界面：复原后站到南门内（不自动再开战）
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
    if (atEntry) this.placePlayer(T50.entry);
    fade.classList.remove('on'); setTimeout(() => fade.classList.remove('dark'), 900);
    this.busy = false;
    this.relock();
    if (!quiet) this.g.ui.toast('重整旗鼓——封印殿复原如初');
  }

  // 放弃挑战（第二十三轮起为退格键；X 是剑诀槽键）：确认后按失败处理，回到「未触发」
  abandon() {
    const ui = this.g.ui;
    if (this.state !== 'fight') return;
    const el = document.createElement('div');
    el.innerHTML = '<p>放弃这次挑战？龙君会回到封印台上，你从南门重新进阵即可再战。</p><div class="ar-act"><button class="act danger" data-yes>放弃</button><button class="act ghost" data-no>继续战斗</button></div>';
    let yes = false;
    el.addEventListener('click', (e) => { if (e.target.closest('[data-yes]')) { yes = true; ui.closePanel(); } else if (e.target.closest('[data-no]')) ui.closePanel(); });
    this.g.panelKind = 'boss50Quit';
    ui.openPanel('放弃挑战', '第五十层', el, { width: 420, onClose: () => { if (this.g.panelKind === 'boss50Quit') this.g.panelKind = null; if (yes) this.retry(true, true); else this.relock(); } });
  }

  // 离开第五十层：回到一层楼层传送阵前
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
    g.ui.toast(msg || '踏出传送阵，回到通天塔一层。');
    this.relock();
  }
  // 拆除：龙、特效、预警、危险物、界面、监听、战斗目标、音效；镜头与输入复原
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
    freeBoss50Gpu();
    this.state = 'off';
  }

  // 清掉鼠标、键盘的按住状态（开打、过场、结算、退出时）：不会自己走、自己出剑或一直举着剑
  releaseInputs() {
    const I = this.input;
    I.keys.clear(); I.pressed.clear(); I.touch = { x: 0, y: 0, active: false };
    this.pointer?.releaseAll();
    this.C.setGuard(false);
    this.Mv.clearInput();                 // 第十七轮：左键连续攻击、蓄力、缓冲的输入一并清掉（过场开始、结算、重试）
  }
  relock() { const p = this.pointer; if (p && !p.locked && p.canLock?.()) p.lock(); }

  // 按键：退格放弃挑战；过场中 空格 / Esc / Enter / E 跳过。返回 true 表示已处理
  key(code) {
    if (!this.active) return false;
    if (this.cine.active) { if (['Space', 'Escape', 'Enter', 'KeyE'].includes(code)) this.cine.skip(); return true; }
    if (code === 'Backspace' && this.state === 'fight') { this.abandon(); return true; }
    return false;
  }

  // =====================================================================================
  // 危险物：灵弹、雷印、焰柱、冲击环（实时推进，不随动作快慢）
  // =====================================================================================
  orb(from, to, { fan = 0, speed = 15, r = 0.6, dmg = 16 } = {}) {
    const dir = to.clone().sub(from);
    if (fan) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), fan);
    dir.normalize();
    const h = this.fx.orb(from, { size: r });
    const len = Math.min(30, this.rayToRing(new THREE.Vector3(from.x, 0, from.z), new THREE.Vector3(dir.x, 0, dir.z).normalize(), CFG.ring) + 1);
    const tele = this.fx.tele({ shape: 'rect', pos: new THREE.Vector3(from.x, 0, from.z), yaw: Math.atan2(dir.x, dir.z), len, w: r * 2 + 0.4, danger: false, dur: 0.35 });
    tele.set('uA', 0.55);
    this.sound.play('orb', { at: from });
    this.hz.push({ kind: 'orb', pos: from.clone(), vel: dir.multiplyScalar(speed * (this.phase === 2 ? 1.1 : 1)), r, dmg, t: 0, h, tele,
      update: (o, dt) => {
        o.t += dt; o.pos.addScaledVector(o.vel, dt); o.h.move(o.pos, dt);
        if (o.tele && o.t > 0.38) { o.tele.remove(0.25); o.tele = null; }       // 弹道预警只亮一下（按游戏时间，暂停时不走）
        const P = this.P.pos;
        const end = (burst) => { if (burst) { this.fx.orbBurst(o.pos.clone()); this.sound.play('pop', { at: o.pos }); } o.h.end(); return false; };
        // 被弹回的灵弹撞到龙身：架势 + 伤害
        if (o.back) {
          const Rn = this.rig.nearest(o.pos.x, o.pos.z, o.pos.y - 0.2, o.pos.y + 0.2);
          if (Rn && Rn.dd < o.r + 0.25) { this.receive(o.dmg * 0.8, { from: this.C.playerUnit, kind: 'gold', at: o.pos.clone(), posture: 14, big: true }); this.fx.orbBurst(o.pos.clone()); this.sound.play('pop', { at: o.pos }); o.h.end(); return false; }
        } else if (this.C.allies.some((u) => u.alive && u.world === 'boss50' && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < o.r + 1.0 && o.pos.y > u.pos.y && o.pos.y < u.pos.y + 2.2)) {
          const u = this.C.allies.find((q) => q.alive && Math.hypot(o.pos.x - q.pos.x, o.pos.z - q.pos.z) < o.r + 1.0);
          this.hit({ dmg: o.dmg, def: 'bolt', key: 'orb' + (this.orbN = (this.orbN || 0) + 1), hazard: true, at: o.pos.clone(), victim: u });
          return end(true);
        } else if (Math.hypot(o.pos.x - P.x, o.pos.z - P.z) < o.r + 0.38 && o.pos.y > P.y - 0.2 && o.pos.y < P.y + 2.1) {
          const r = this.hit({ dmg: o.dmg, def: 'bolt', key: 'orb' + (this.orbN = (this.orbN || 0) + 1), hazard: true, react: 'flinch', at: o.pos.clone().addScaledVector(o.vel, -0.1) });
          // 弹反：灵弹反飞向龙首
          if (r === 'parry') { const to = this.rig.bonePos('head_x', new THREE.Vector3()); o.vel.copy(to.sub(o.pos).normalize().multiplyScalar(o.vel.length() * 1.3)); o.back = true; o.t = 0; this.sfxSkill?.deflect?.(o.pos.clone()); return true; }
          return end(true);
        }
        const rr = Math.hypot(o.pos.x, o.pos.z);
        if (rr > CFG.ring - 0.2) { this.fx.barrierHit(o.pos.clone()); this.arena.flash(0.25); return end(true); }
        if (o.pos.y < 0.15) { this.fx.impact(o.pos.clone().setY(0), 1.2, { rocks: 2, dust: 3, light: 0 }); return end(true); }
        if (o.t > 3) return end(false);
        return true;
      } });
  }
  strike(pos, { r = 2.4, warn = 0.9, dmg = 26, react = 'stun' } = {}) {
    const tele = this.fx.tele({ shape: 'circle', pos, r, danger: true, dur: warn });
    this.fx.runeMark(pos, r, warn + 0.2);
    this.sound.play('crackle', { at: pos, dur: warn * 0.8, gain: 0.6 });
    this.hz.push({ kind: 'strike', pos: pos.clone(), r, warn, t: 0, tele, done: false,
      update: (o, dt) => {
        o.t += dt;
        if (!o.done && o.t >= o.warn) {
          o.done = true;
          this.fx.lightning(o.pos, { r: o.r });
          tele.hit();
          this.sound.play('thunder', { at: o.pos });
          this.fx.shake(0.18); this.arena.flash(0.5);
          this.circleHit(null, null, o.pos, o.r, { dmg, block: false, parry: false, react, at: o.pos });
        }
        return o.t < o.warn + 0.4;
      } });
  }
  pillar(pos, { r = 2.2, warn = 1.0, dmg = 30, react = 'knockback' } = {}) {
    const tele = this.fx.tele({ shape: 'circle', pos, r, danger: true, dur: warn });
    this.hz.push({ kind: 'pillar', pos: pos.clone(), r, warn, t: 0, tele, fired: false, hitDone: false,
      update: (o, dt) => {
        o.t += dt;
        if (!o.fired && o.t >= o.warn) { o.fired = true; this.fx.flamePillar(o.pos, { r: o.r }); tele.hit(); this.sound.play('flameBurst', { at: o.pos }); this.fx.shake(0.12); }
        if (o.fired && !o.hitDone && o.t <= o.warn + 0.35) {
          const P = this.P.pos;
          if (Math.hypot(P.x - o.pos.x, P.z - o.pos.z) <= o.r + 0.2) { o.hitDone = true; this.hit({ dmg, block: false, parry: false, react, at: o.pos }); }
        }
        if (o.fired && !o.phDone && o.t <= o.warn + 0.35) for (const V of this.victims()) if (!V.isPlayer && Math.hypot(V.pos.x - o.pos.x, V.pos.z - o.pos.z) <= o.r + 0.6 && V.pos.y < 2.6) { o.phDone = true; this.hit({ dmg, block: false, parry: false, hazard: true, at: o.pos, victim: V.unit }); }
        return o.t < o.warn + 1.0;
      } });
  }
  // 冲击环：半径随时间扩张（视觉与判定同一个半径）；环带扫过玩家时结算一次；jumpable 时跃起高过 0.9 米可避
  ring(c, { r0 = 2, r1 = 10, dur = 0.5, w = 1.4, h = 1.6, dmg = 16, react = 'flinch', block = false, jumpable = false } = {}) {
    const fh = this.fx.shockRing(c, { maxR: r1, w, h });
    this.hz.push({ kind: 'ring', c: c.clone(), t: 0, done: false, fh,
      update: (o, dt) => {
        o.t += dt;
        const u = Math.min(1, o.t / dur), e = 1 - (1 - u) * (1 - u), r = r0 + (r1 - r0) * e;
        o.fh.set(r, u < 0.8 ? 1 : Math.max(0, 1 - (u - 0.8) / 0.35));
        if (!o.done && u < 1) {
          const P = this.P.pos, d = Math.hypot(P.x - o.c.x, P.z - o.c.z);
          // 环带扫过玩家时结算；不超出预警环的内外边（r0 … r1，0.2 为玩家身体）
          if (Math.abs(d - r) <= w / 2 + 0.2 && d <= r1 + 0.2 && d >= r0 - 0.2 && !(jumpable && P.y > 0.9)) { o.done = true; this.hit({ dmg, block, parry: false, react, at: o.c }); }
        }
        if (!o.phDone && u < 1) for (const V of this.victims()) {
          if (V.isPlayer) continue;
          const dv = Math.hypot(V.pos.x - o.c.x, V.pos.z - o.c.z);
          if (Math.abs(dv - r) <= w / 2 + 0.6 && V.pos.y < h + 0.6) { o.phDone = true; this.hit({ dmg, block, parry: false, hazard: true, at: o.c, victim: V.unit }); }
        }
        if (o.t > dur + 0.35) { o.fh.end(); return false; }
        return true;
      } });
  }
  updateHazards(dt) {
    if (!this.hz.length) return;
    this.hz = this.hz.filter((o) => { const keep = o.update(o, dt); if (!keep) { o.tele?.remove?.(0.2); } return keep; });
  }
  clearHazards() {
    for (const o of this.hz) { o.h?.end?.(); o.fh?.end?.(); o.tele?.remove?.(0.1); }
    this.hz.length = 0;
  }

  // ---------- 战斗目标的位置（龙身上离玩家最近的一点）与身体碰撞 ----------
  updateProxy() {
    const U = this.unit, P = this.P.pos, R = this.rig;
    const n = R.nearest(P.x, P.z, P.y + 0.15, P.y + 2.5);
    if (!n) return;
    U.pos.set(n.p.x, this.root.y, n.p.z);
    U.radius = Math.max(0.15, n.r - n.gap * 1.2);
    U.part = n.part; U.hitPoint.copy(n.p);
    U.headY = this.root.y + Math.max(1.4, Math.min(3.6, n.p.y + 0.4));
    U.yaw = R.yaw;
  }
  pushPlayer() {
    const P = this.P.pos, R = this.rig;
    if (this.root.y > 1.5) return;
    for (const c of R.caps) {
      if (c.part !== 'body' && c.part !== 'leg') continue;
      const lo = Math.min(c.a.y, c.b.y) - c.r, hi = Math.max(c.a.y, c.b.y) + c.r;
      if (hi < P.y + 0.1 || lo > P.y + 1.8) continue;
      // 线段的水平投影上离玩家最近的点
      const ax = c.a.x, az = c.a.z, bx = c.b.x - ax, bz = c.b.z - az, L2 = bx * bx + bz * bz;
      const u = L2 > 1e-6 ? Math.max(0, Math.min(1, ((P.x - ax) * bx + (P.z - az) * bz) / L2)) : 0;
      const qx = ax + bx * u, qz = az + bz * u, dx = P.x - qx, dz = P.z - qz, d = Math.hypot(dx, dz), need = c.r * 0.85 + 0.34;
      if (d < need) {
        const k = d > 1e-4 ? need / d : 0;
        if (d > 1e-4) { P.x = qx + dx * k; P.z = qz + dz * k; }
        else { const f = R.forward; P.x = qx + f.x * need; P.z = qz + f.z * need; }
      }
    }
  }
  keepPlayerIn() {
    const P = this.P.pos, r = Math.hypot(P.x, P.z), lim = CFG.ring - 0.45;
    if (r > lim) {
      P.x *= lim / r; P.z *= lim / r;
      if ((this.wallT = (this.wallT ?? 0) - this.dt) <= 0) { this.wallT = 0.35; this.fx.barrierHit(new THREE.Vector3(P.x * 1.02, P.y + 1.2, P.z * 1.02)); }
    }
  }

  // =====================================================================================
  // 调试入口（地址加 ?boss50debug=1 才显示；控制台 __qinglan.boss50.debug 随时可用）
  // =====================================================================================
  get debug() {
    const F = this;
    const mark = () => { F.debugUsed = true; };        // 动过调试的这一场：不计入记录、不发奖励
    return {
      move(id) { mark(); if (!F.fighting || !MOVES50[id]) return false; if (MOVES50[id].phase === 2 && F.phase !== 2) F.debug.phase(2); F.cancelMove(true); F.B.mode = 'idle'; F.B.pending = null; F.startMove(MOVES50[id]); return true; },
      phase(n) {
        if (!F.active) return;
        mark();
        if (n === 2 && F.phase !== 2) { F.cancelMove(true); F.clearHazards(); F.p1Done = true; F.applyPhase(2); F.unit.maxHp = F.unit.hp = F.hpPool(2); F.hud.setPhase(2, true); }
        else if (n === 1 && F.phase !== 1) { F.applyPhase(1); F.p1Done = false; F.unit.maxHp = F.unit.hp = F.hpPool(1); F.hud.setPhase(1, true); F.arena.setCrack(0); F.arena.setGlow(0.6, C50.p1); }
      },
      cine(name) { if (!F.active || F.cine.active) return; mark(); F.cancelMove(true); F.clearHazards(); const prev = F.state; F.state = name === 'intro' ? 'intro' : name === 'phase' ? 'transition' : name === 'victory' ? 'victory' : 'exec'; F.B.mode = 'cine'; F.noDmg = true;
        F.cine.play(name, () => { if (name === 'phase') F.beginPhase2(); else if (name === 'intro') F.beginFight(); else if (name === 'victory') F.showResult(true); else F.showResult(false); }); void prev; },
      hp(mode) { mark(); F.hpMode = mode; F.unit.maxHp = F.hpPool(F.phase); F.unit.hp = Math.min(F.unit.hp, F.unit.maxHp); if (mode === 'debug') F.unit.hp = F.unit.maxHp; },
      god(v = !F.god) { mark(); F.god = v; return v; },
      ai(v = !F.aiOn) { if (!v) mark(); F.aiOn = v; return v; },
      breakPosture() { mark(); if (F.fighting) { F.posture = CFG.posture.max; F.postureBreak(); } },
      kill() { mark(); if (F.fighting) { F.unit.hp = 0; F.depleted(); } },
      start() { if (F.state === 'dormant') F.startIntro(); },
      skip() { F.cine.skip(); },
      info() { return { state: F.state, phase: F.phase, hp: Math.round(F.unit.hp), max: F.unit.maxHp, posture: Math.round(F.posture), mode: F.B?.mode, move: F.M?.id || null, t: +F.fightT.toFixed(1), boss: F.rig ? F.root.toArray().map((v) => +v.toFixed(2)) : null, yaw: F.rig ? +F.rig.yaw.toFixed(2) : null, clip: F.rig?.name, ct: F.rig ? +F.rig.t.toFixed(2) : null, hz: F.hz.length, teles: F.fx?.teles.size }; },
    };
  }
  buildDebug() {
    const el = this.debugEl = document.createElement('div');
    el.id = 'b50-debug'; el.className = 'hidden';
    const btn = (t, f) => { const b = document.createElement('button'); b.textContent = t; b.addEventListener('click', (e) => { e.stopPropagation(); f(); }); return b; };
    const row = (title, items) => { const r = document.createElement('div'); r.className = 'row'; const s = document.createElement('b'); s.textContent = title; r.appendChild(s); items.forEach((x) => r.appendChild(x)); el.appendChild(r); };
    const h = document.createElement('div'); h.className = 'hd'; h.textContent = '第五十层 · 调试（?boss50debug=1）'; el.appendChild(h);
    row('招式', MOVE_ORDER.map((id) => btn(`${MOVES50[id].no}${MOVES50[id].name}`, () => this.debug.move(id))));
    row('阶段', [btn('一阶段', () => this.debug.phase(1)), btn('二阶段', () => this.debug.phase(2)), btn('失衡', () => this.debug.breakPosture()), btn('耗尽本阶段', () => this.debug.kill())]);
    row('过场', [btn('出场', () => this.debug.cine('intro')), btn('转阶段', () => this.debug.cine('phase')), btn('击败', () => this.debug.cine('victory')), btn('处决', () => this.debug.cine('exec'))]);
    row('其他', [btn('开战', () => this.debug.start()), btn('无敌', () => { this.g.ui.toast('无敌：' + (this.debug.god() ? '开' : '关')); }), btn('AI', () => { this.g.ui.toast('AI：' + (this.debug.ai() ? '开' : '关')); }), btn('血量 1万/6500', () => this.debug.hp('debug')), btn('血量 正式', () => this.debug.hp('normal'))]);
    document.body.appendChild(el);
  }
}
