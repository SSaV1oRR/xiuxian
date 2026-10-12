// 战斗：阵营（宗门 / 魔修）、魔修敌人（沿用同门弟子的人物骨架与姿态框架，换上魔修装束；第十四轮起出手用动作库的动作）、
// 投射物（剑气·新月、魔弹、护宗双龙的寒息与火球）、地面预警圈（出手前把攻击范围画在地上）、状态效果（减速、冻结、灼烧、失衡）、
// 伤害数字与血条，以及战斗状态（平和 / 交战 / 入侵）——护宗双龙据此进入警戒并协助防御，只打魔修，不伤宗门中人。
// 第十四轮：玩家的剑诀移到 moves.js（招式）与 skillfx.js（特效），这里负责结算——失衡与击退、闪身无敌、霸体、格挡与弹反、
// 顿帧（hitStop）、演武广场的木人桩（只记伤害、不还手）。数值统一在 combatConfig.js。
import * as THREE from 'three';
import { NPC } from '../actors/npc.js';
import { PLAYER_COMBAT, ENEMIES, DRAGON_COMBAT, ATTACK_DEF } from './combatConfig.js';
import { shaderMaterial, GLOBAL, injectFog } from '../world/shaderlib.js';
import { clamp, wrapAngle } from '../core/math.js';
import { CombatHud } from '../ui/combatHud.js';

export const SECT = 'sect', DEMON = 'demon', DUEL = 'duel';
// 第十五轮：DUEL 是演武场的切磋对手——只与宗门一方（玩家）互为敌对；护宗双龙只在 enemies 里找魔修，看不到切磋对手
export const hostile = (a, b) => a !== b && (a === DEMON || b === DEMON || ((a === DUEL || b === DUEL) && (a === SECT || b === SECT)));

// 魔修装束：暗色衣袍、血色镶边；眼睛用纯红顶点色，由材质点亮
const LOOKS = {
  shade: { robe: 0x2b2228, inner: 0x3d151a, trim: 0x6e1616, sash: 0x160f12, hair: 0x0b0a0a, hairStyle: 'ponytail', ribbon: 0x5a1212, eye: 0xff1e10, tight: true },
  caster: { robe: 0x2e2238, inner: 0x2a1020, trim: 0x8c1d26, sash: 0x140c16, hair: 0x0b0a0a, hairStyle: 'elder', eye: 0xff1e10 },
  elite: { robe: 0x1d1a1e, inner: 0x3a0f12, trim: 0x9a1f1a, sash: 0x0e0a0c, hair: 0x080707, hairStyle: 'crown', crown: 0x2a0f0f, eye: 0xff2410, vest: 0x2a1515, sword: true },
};
// 第十七轮：每个魔修一份材质（共用同一个着色器程序），带自己的受击闪光 uFlash
function enemyMaterial(flash) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
  m.onBeforeCompile = (sh) => {
    injectFog(sh);
    sh.uniforms.uFlash = flash;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFlash;').replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += vColor * smoothstep(.55, .9, vColor.r - vColor.g) * 4.;
      { float rim = pow(1. - abs(dot(normal, normalize(vViewPosition))), 3.); totalEmissiveRadiance += vec3(.45, .04, .05) * rim * .9 + vec3(1., .9, .8) * uFlash * (.12 + rim * .7); }`);
  };
  m.customProgramCacheKey = () => 'enemy-robe';
  return m;
}

// ---------- 发光贴图（投射物与命中闪光共用）----------
let GLOW = null;
function glowTexture() {
  if (GLOW) return GLOW;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.75)'); gr.addColorStop(0.6, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  GLOW = new THREE.CanvasTexture(cv);
  return GLOW;
}
const sprite = (color, size) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size); s.renderOrder = 6;
  return s;
};

// ---------- 地面预警圈：环 + 由内向外的填充（填满即出手）----------
function telegraphMaterial() {
  return shaderMaterial({
    uniforms: { uP: { value: 0 }, uColor: { value: new THREE.Color(1, 0.15, 0.1) }, uArc: { value: Math.PI * 2 } },
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, fog: false,
    vertexPars: 'varying vec2 vP;',
    vertex: 'vP = position.xy; vec4 mvPosition = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mvPosition;',
    fragmentPars: 'uniform float uP, uArc; uniform vec3 uColor; varying vec2 vP;',
    fragment: `
      float r = length(vP), a = abs(atan(vP.x, vP.y));
      if (a > uArc * .5) discard;
      float ring = smoothstep(.06, .0, abs(r - .97)) + smoothstep(.04, .0, abs(a - uArc * .5)) * step(uArc, 6.2);
      float fill = step(r, uP) * .28 + smoothstep(.04, .0, abs(r - uP)) * .5;
      gl_FragColor = vec4(uColor, clamp(ring * .9 + fill, 0., 1.) * smoothstep(1.02, .96, r));`,
  });
}

// 爆散的粒子（命中、冰爆、火爆、魔修消散）：一次性 Points
function burst(color, n, size, speed, life) {
  const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2 - 0.2, v = speed * (0.4 + Math.random() * 0.8);
    vel.set([Math.cos(a) * Math.cos(e) * v, Math.sin(e) * v + speed * 0.3, Math.sin(a) * Math.cos(e) * v], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
  const m = shaderMaterial({
    uniforms: { uT: { value: 0 }, uLife: { value: life }, uColor: { value: new THREE.Color(color) }, uSize: { value: size } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexPars: 'attribute vec3 aVel; uniform float uT, uLife, uSize; varying float vA;',
    vertex: `
      float t = uT; vec3 p = position + aVel * t - vec3(0., 2.5, 0.) * t * t;
      vA = 1. - t / uLife;
      vec4 mvPosition = modelViewMatrix * vec4(p, 1.);
      gl_PointSize = uSize * 300. * (0.5 + vA * 0.5) / -mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;`,
    fragmentPars: 'uniform vec3 uColor; varying float vA;',
    fragment: 'float d = length(gl_PointCoord - .5); gl_FragColor = vec4(uColor * smoothstep(.5, .0, d) * max(vA, 0.) * 1.5, 1.);',
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 7;
  return pts;
}

const _kv = new THREE.Vector3();

// 行走判定（与玩家一致）：构筑物顶面可站；自然坡过陡、骤升、断崖、深水不可通行
function canStep(T, cw, from, x, z) {
  if (!T.inCore(x, z, 4)) return false;
  const y = from.y, cg = cw.ground(x, z, y, 0.46), tg = T.heightAt(x, z);
  if (cg > -Infinity && cg >= tg - 0.01) return y - cg <= 2.2;
  if (tg - y > 0.46 || y - tg > 2.2) return false;
  const w = T.waterAt?.(x, z);
  if (w != null && w - tg > 0.3) return false;
  return true;
}

let EID = 0;
class Enemy {
  constructor(combat, kind, pos, opts = {}) {
    const C = ENEMIES[kind];
    this.combat = combat; this.kind = kind; this.cfg = C;
    this.id = 'e' + (++EID);
    this.world = combat.worldName;
    this.faction = DEMON;
    this.maxHp = this.hp = C.hp;
    this.radius = C.radius;
    this.alive = true;
    this.flash = { value: 0 }; this.flashK = 0;
    this.mat = enemyMaterial(this.flash);
    this.bound = 0; this.atkSeq = 0;
    this.npc = new NPC(combat.scene, { id: this.id, name: C.name, title: '', x: pos.x, y: pos.y, z: pos.z, ry: opts.yaw || 0,
      look: { ...LOOKS[C.look], scale: C.scale ?? 1 }, anim: 'idle', material: this.mat });
    this.pos = this.npc.root.position;
    this.yaw = opts.yaw || 0;
    // 行军路线（袭山魔影沿山路前进）：依次走过 route 中的各点
    this.route = opts.route ? opts.route.slice() : null;
    this.goal = opts.goal || (this.route ? this.route.shift() : null);
    this.state = opts.dormant ? 'dormant' : this.goal ? 'march' : 'idle';
    this.aggro = opts.aggro ?? C.aggro;
    this.onDeath = opts.onDeath || null;
    this.cool = 0.6 + Math.random() * 0.8;
    this.slamCool = 4;
    this.st = { slow: 0, slowK: 1, freeze: 0, burn: 0, burnDps: 0, hits: 0 };
    // 第二十一轮：分段气血（cfg.stages：剩余比例到这里转入下一段，转段时 stageShift 秒无敌；Boss 的「同一总生命条按阈值转阶段」）
    this.stageIdx = 0; this.shiftT = 0;
    this.atkTarget = null;              // 这一次出手的目标（出手中不换）：玩家或护战的凤凰
    this.aura = sprite(kind === 'elite' ? 0xff3020 : 0xb01818, kind === 'elite' ? 3.2 : 1.9);
    this.aura.material.opacity = 0.32;
    combat.scene.add(this.aura);
    this.ice = null;
    this.bar = combat.hud.bar(C.name, kind === 'elite');
    this.t = 0;
    this.stunT = 0.28;                  // 失衡时长（受击时按招式设定）
    this.kb = null;                     // 击退：{ x, z（米 / 秒）, t（剩余秒数）}
    if (combat.animLib) this.npc.setAnimLib(combat.animLib);
  }

  // 出手动作（动作库）：begin 时前摇停在出手前一刻，临近出手时接上出手的那一段，使出手的一刻正好落在结算时
  animFor(act) { const A = this.cfg.anim; return A ? A[act === 'slam' ? 'slam' : this.cfg.ranged ? 'cast' : 'melee'] : null; }

  // 第十七轮：缚灵锁——定身（打断前摇、不走不出手），time 秒
  bind(time) {
    if (!this.alive || this.state === 'dormant') return;
    this.bound = Math.max(this.bound, time);
    if (this.state === 'windup') { if (this.tele) { this.combat.removeTelegraph(this.tele); this.tele = null; } this.clearTell(); this.state = 'chase'; this.npc.motion?.stop(0.08); }
    this.cool = Math.max(this.cool, 0.5);
  }
  clearTell() { if (this.tell) { this.combat.sfx?.tellEnd?.(this.tell); this.tell = null; } }
  // 失衡：打断前摇，按 time 秒僵直，从 from 处被推开 push 米。魔将（poise）只在重击（≥ 0.7 秒）下失衡
  stagger(time, from = null, push = 0) {
    if (!this.alive || this.state === 'dormant') return;
    const heavy = time >= 0.7;
    if (from && push > 0) {
      const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1, k = this.cfg.poise && !heavy ? 0.35 : 1;
      const T = 0.22 + push * 0.04;
      this.kb = { x: (dx / d) * push * k / T, z: (dz / d) * push * k / T, t: T };
    }
    if (this.cfg.poise && !heavy) return;
    if (this.tele) { this.combat.removeTelegraph(this.tele); this.tele = null; }
    this.clearTell();
    const left = this.state === 'hit' ? Math.max(0, this.stunT - this.wt) : 0;
    this.state = 'hit'; this.wt = 0; this.stunT = Math.max(time, left);
    this.npc.motion?.stop(0.08);
  }

  get headY() { return this.pos.y + 1.9 * (this.cfg.scale ?? 1); }
  // ---------- 第二十一轮：阶段（凤翔天击的秒杀走这里，不另造死亡入口）----------
  // 当前阶段的结束阈值（气血值；最终阶段为 0）
  stageFloor() { const S = this.cfg.stages; return S && this.stageIdx < S.length ? S[this.stageIdx] * this.maxHp : 0; }
  get stageMax() { const S = this.cfg.stages; if (!S) return this.maxHp; const top = this.stageIdx === 0 ? 1 : S[this.stageIdx - 1]; return (top - (S[this.stageIdx] ?? 0)) * this.maxHp; }
  stageInfo() { const S = this.cfg.stages; return S ? { id: `${this.id}:s${this.stageIdx}`, index: this.stageIdx, final: this.stageIdx >= S.length, structure: 'threshold' } : { id: this.id, index: 0, final: true, structure: 'single' }; }
  immune() { return this.shiftT > 0; }
  // 转入下一段：打断出手、短暂无敌（站定怒吼），伤害不带进下一段
  beginShift() {
    if (this.tele) { this.combat.removeTelegraph(this.tele); this.tele = null; }
    this.clearTell();
    this.stageIdx++; this.shiftT = this.cfg.stageShift ?? 1.2;
    this.state = 'hit'; this.wt = 0; this.stunT = this.shiftT;
    this.combat.popNumber(this, '转阶段', 'parry');
    this.combat.fx(this.pos, 0xff3018, 40, 0.8, 5, 0.8);
    this.combat.onStage?.(this);
  }
  // 阶段结束（凤翔天击秒杀）：最终阶段即正常的死亡流程；否则气血推到本段的结束阈值并转段（不清空整条气血）
  endStage(o = {}) {
    if (!this.alive || this.state === 'dormant') return false;
    const info = this.stageInfo();
    if (info.final) { this.combat.damage(this, this.hp + 1, { from: o.from, kind: o.finale ? 'heavy' : 'phoenix', big: true, execute: true, finale: !!o.finale }); return !this.alive; }
    const floor = this.stageFloor();
    this.hp = floor; this.bar.set(this.hp / this.maxHp);
    this.beginShift();
    return true;
  }
  // 此刻该打谁：出手中不换；平时问九霄凤焰的仇恨（满了、合法时改打凤凰），否则玩家
  pickTarget() {
    const cb = this.combat;
    if ((this.state === 'windup' || this.state === 'strike') && this.atkTarget) return this.atkTarget.alive ? this.atkTarget : cb.playerUnit;
    return (this.state === 'chase' && cb.targetFor?.(this)) || cb.playerUnit;
  }

  wake() { if (this.state === 'dormant' || this.state === 'idle') this.state = 'chase'; }

  update(dt) {
    const C = this.cfg, S = this.st, npc = this.npc, cb = this.combat;
    // 第二十五轮：被终式处决锁定（演出接管：不走、不出手、不受持续伤害；姿势由演出给）
    if (this.finaleLock && this.alive) return true;
    this.t += dt;
    // 第二十一轮：目标可能是护战的凤凰（隐藏仇恨满时）；发现、行军、回防仍按玩家
    const PL = cb.playerUnit, P = this.pickTarget(), tp = P.pos;
    if (!this.alive) {
      this.deadT += dt;
      npc.anim = 'die'; npc.ct = Math.min(1, this.deadT / 0.7);
      npc.motion?.stop(0.1);
      npc.update(dt, tp, false);
      npc.root.rotation.y = this.yaw;
      if (this.deadT > 0.9) this.pos.y -= dt * 1.4;
      this.aura.material.opacity = Math.max(0, 0.32 - this.deadT * 0.25);
      return this.deadT < 2.4;
    }
    // 状态效果
    if (S.burn > 0) { S.burn -= dt; cb.damage(this, S.burnDps * dt, { kind: 'fire', dot: true }); if (!this.alive) return true; }
    if (S.slow > 0) S.slow -= dt; else S.slowK = 1;
    if (this.bound > 0) this.bound -= dt;
    this.flash.value = this.flashK; this.flashK = Math.max(0, this.flashK - dt * 6);
    const frozen = S.freeze > 0 || this.bound > 0;
    if (S.freeze > 0) S.freeze -= dt;
    if (this.ice) { this.ice.visible = frozen || S.slow > 0; this.ice.material.opacity = frozen ? 0.55 : 0.18; }
    this.cool -= dt * (frozen ? 0 : 1); this.slamCool -= dt;
    if (this.shiftT > 0) this.shiftT -= dt;
    const dx = tp.x - this.pos.x, dz = tp.z - this.pos.z, d = Math.hypot(dx, dz);
    const pdx = PL.pos.x - this.pos.x, pdz = PL.pos.z - this.pos.z, pd = Math.hypot(pdx, pdz);
    const sameLevel = Math.abs(PL.pos.y - this.pos.y) < 4;
    let move = null, anim = 'idle';
    if (this.state === 'dormant') { anim = 'behind'; }
    else if (frozen) { anim = this.state === 'windup' ? 'windup' : 'hit'; }
    else if (this.state === 'march') {
      if (PL.alive && pd < this.aggro && sameLevel) this.state = 'chase';
      else if (this.goal) { move = this.goal; anim = 'run'; if (Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z) < 2.2) this.goal = this.route?.length ? this.route.shift() : null; }
    } else if (this.state === 'idle') {
      if (PL.alive && pd < this.aggro && sameLevel) this.state = 'chase';
    } else if (this.state === 'chase') {
      if (!PL.alive || (pd > this.aggro * 2.5 && this.goal)) this.state = this.goal ? 'march' : 'idle';     // 玩家倒下或远去：回到行军路线
      else if (C.slam && this.slamCool <= 0 && d < C.slam.radius + 0.5) this.begin('slam');
      else if (d > C.attackRange * 0.85) { move = tp; anim = 'run'; }
      else if (this.cool <= 0) this.begin(C.ranged ? 'cast' : 'melee');
    }
    if (this.state === 'windup') {
      this.wt += dt;
      const dur = this.act === 'slam' ? C.slam.windup : C.windup;
      npc.ct = this.wt / dur; anim = this.act === 'cast' ? 'cast' : 'windup';
      if (this.tele) this.tele.material.uniforms.uP.value = Math.min(1, this.wt / dur);
      if (this.act !== 'slam') this.faceTo(tp, dt, 6);
      const A = this.animFor(this.act);
      if (A && npc.motion && !this.struck && this.wt >= dur - (A.hit - A.hold)) {
        this.struck = true;
        npc.motion.play(A.clip, { from: A.hold, to: A.to, speed: 1, hold: true, mask: 'upper', fade: 0.04 });
      }
      if (this.wt >= dur) this.release();
    } else if (this.state === 'strike') {
      this.wt += dt; npc.ct = this.wt / 0.22; anim = 'strike';
      if (this.wt >= 0.4) { this.state = 'chase'; npc.motion?.stop(0.25); }
    } else if (this.state === 'hit') {
      this.wt += dt; anim = 'hit';
      if (this.wt > this.stunT) { this.state = 'chase'; this.stunT = 0.28; }
    }
    // 击退：顺着被推开的方向滑出，碰到构筑物或不可走处停下
    if (this.kb) {
      const W = cb.world, k = Math.min(dt, this.kb.t);
      const nx = this.pos.x + this.kb.x * k, nz = this.pos.z + this.kb.z * k;
      if (canStep(W.terrain, W.cw, this.pos, nx, nz)) { this.pos.x = nx; this.pos.z = nz; W.cw.pushCircle(this.pos, Math.min(this.radius, 0.36), 1.8, 0.46); }
      else this.kb.t = 0;
      this.kb.t -= dt;
      if (this.kb.t <= 0) this.kb = null;
    }
    // 移动：朝目标直行，碰到构筑物被推开，不可通行处停下；场景提供寻路时（秘境殿中的步道、甬道）先走到中间点
    if (move && !frozen && cb.world.terrain.navTarget) move = cb.world.terrain.navTarget(this.pos, move) || move;
    if (move && !frozen) {
      const ddx = move.x - this.pos.x, ddz = move.z - this.pos.z, dl = Math.hypot(ddx, ddz) || 1;
      const sp = C.speed * S.slowK * dt;
      const W = cb.world, nx = this.pos.x + (ddx / dl) * sp, nz = this.pos.z + (ddz / dl) * sp;
      if (canStep(W.terrain, W.cw, this.pos, nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
      else if (canStep(W.terrain, W.cw, this.pos, nx, this.pos.z)) this.pos.x = nx;
      else if (canStep(W.terrain, W.cw, this.pos, this.pos.x, nz)) this.pos.z = nz;
      W.cw.pushCircle(this.pos, Math.min(this.radius, 0.36), 1.8, 0.46);      // 体型大的魔将也能从柱间穿过（受击判定仍用原半径）
      this.faceTo(move, dt, 8);
    }
    // 互相推开，免得叠在一起
    for (const o of cb.enemies) {
      if (o === this || !o.alive) continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z, od = Math.hypot(ox, oz), R = this.radius + o.radius + 0.2;
      if (od > 1e-3 && od < R) { this.pos.x += (ox / od) * (R - od) * 0.5; this.pos.z += (oz / od) * (R - od) * 0.5; }
    }
    const W = cb.world, gy = Math.max(W.terrain.heightAt(this.pos.x, this.pos.z), W.cw.ground(this.pos.x, this.pos.z, this.pos.y + 0.5, 0.46));
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 12);
    npc.anim = anim;
    npc.update(dt, tp, false);
    npc.root.rotation.y = this.yaw;
    this.aura.position.set(this.pos.x, this.pos.y + 1.0 * (C.scale ?? 1), this.pos.z);
    this.aura.material.opacity = 0.22 + 0.1 * Math.sin(this.t * 3) + (this.state === 'windup' ? 0.25 : 0);
    if (this.ice) this.ice.position.set(this.pos.x, this.pos.y + 0.9, this.pos.z);
    return true;
  }

  faceTo(p, dt, rate) {
    const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.yaw += wrapAngle(want - this.yaw) * Math.min(1, dt * rate);
  }

  // 出手的防御属性（第十七轮）：每次出手一个编号，招中途不变
  specFor(act) {
    const C = this.cfg, def = act === 'slam' ? C.slam.def : C.def;
    return { def, id: `${this.id}:${this.atkSeq}`, seg: 0, active: true };
  }
  begin(act) {
    const C = this.cfg, cb = this.combat;
    this.atkTarget = this.pickTarget();              // 第二十一轮：这一次出手打谁（出手中不换）
    this.state = 'windup'; this.act = act; this.wt = 0; this.struck = false; this.atkSeq++;
    const A = this.animFor(act);
    const dur = act === 'slam' ? C.slam.windup : C.windup;
    if (A && this.npc.motion) {
      const lead = A.hit - A.hold, from = A.from ?? 0;
      this.npc.motion.play(A.clip, { from, to: A.hold, speed: (A.hold - from) / Math.max(0.12, dur - lead), hold: true, mask: 'upper', fade: 0.12 });
    }
    // 预警：寻常为红圈 / 红扇；不可格挡的（震地）头顶亮「危」字、地上深红；难挡的出手前兵刃一道金光
    const tell = ATTACK_DEF[act === 'slam' ? C.slam.def : C.def]?.tell;
    if (act === 'slam') this.tele = cb.telegraph(this.pos, C.slam.radius, Math.PI * 2, 0xd0101a);
    else if (act === 'melee') { this.tele = cb.telegraph(this.pos, C.attackRange + 0.5, 2.2, 0xff3a20); this.tele.userData.follow = this; }
    else this.tele = null;
    if (this.tele && act === 'slam') this.tele.userData.follow = null;
    this.clearTell();
    if (tell === 'danger' || tell === 'heavy') this.tell = cb.sfx?.tellBegin?.(this, tell, dur);
  }

  release() {
    const C = this.cfg, cb = this.combat, PL = cb.playerUnit, P = this.atkTarget?.alive ? this.atkTarget : PL;
    if (this.tele) { cb.removeTelegraph(this.tele); this.tele = null; }
    this.clearTell();
    const spec = this.specFor(this.act), s = C.scale ?? 1;
    if (this.act === 'slam') {
      this.slamCool = C.slam.cooldown;
      if (PL.alive && Math.hypot(PL.pos.x - this.pos.x, PL.pos.z - this.pos.z) < C.slam.radius) cb.damage(PL, C.slam.damage, { from: this, kind: 'demonic', knockdown: true, spec, at: this.pos.clone() });
      // 第二十一轮：震地也砸得到身边的护战凤凰（贴地低飞时）
      for (const u of cb.allies) if (u.alive && Math.hypot(u.pos.x - this.pos.x, u.pos.z - this.pos.z) < C.slam.radius && u.pos.y - this.pos.y < 2.4) cb.damage(u, C.slam.damage, { from: this, kind: 'demonic', spec, at: this.pos.clone() });
      cb.fx(this.pos, 0xff3018, 60, 0.9, 7, 0.7);
      cb.sfx?.enemyStrike(this);
      cb.sound?.play('slam', { at: this.pos, gain: 0.6 });
      cb.shake(0.25);
    } else if (this.act === 'melee') {
      const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      const a = Math.abs(wrapAngle(Math.atan2(dx, dz) - this.yaw));
      // 接触点：出手者身前、胸口高处（格挡的正面判定、弹反火星都按它）
      const at = new THREE.Vector3(this.pos.x + (dx / (d || 1)) * Math.min(d, this.radius + 0.6), this.pos.y + 1.1 * s, this.pos.z + (dz / (d || 1)) * Math.min(d, this.radius + 0.6));
      // 第二十一轮：打护战的凤凰时还要够得着高度（它低飞交战时才够得着）
      const reach = !P.phoenix || Math.abs(P.pos.y - this.pos.y) < 2.2 * s;
      if (P.alive && reach && d < C.attackRange + 0.6 + (P.phoenix ? P.radius * 0.5 : 0) && a < 1.25) cb.damage(P, C.damage, { from: this, kind: 'demonic', spec, at, react: C.react ?? undefined });
      cb.fx(new THREE.Vector3(this.pos.x + Math.sin(this.yaw) * 1.2, this.pos.y + 1, this.pos.z + Math.cos(this.yaw) * 1.2), 0xff3a20, 14, 0.4, 3, 0.35);
      cb.sfx?.enemyStrike(this);
      cb.sound?.play('claw', { at: this.pos, gain: 0.5 });
    } else {
      const from = new THREE.Vector3(this.pos.x + Math.sin(this.yaw) * 0.6, this.pos.y + 1.4, this.pos.z + Math.cos(this.yaw) * 0.6);
      const to = new THREE.Vector3(P.pos.x, P.pos.y + 1.0, P.pos.z);
      cb.shoot({ from, to, speed: C.projSpeed, radius: 0.8, damage: C.damage, faction: DEMON, kind: 'demonic', range: C.attackRange * 1.6, spec, ownerUnit: this });
      void PL;
      cb.sound?.play('orb', { at: from, gain: 0.4 });
    }
    // 第十八轮：这一击被弹反时，cb.damage 里已让它僵直（state 'hit'）——不再改回出手收势，否则僵直被吞掉，0.8 秒后又出手
    if (this.state !== 'hit') { this.state = 'strike'; this.wt = 0; }
    this.cool = C.cooldown * (0.85 + Math.random() * 0.3);
  }

  dispose() {
    this.clearTell();
    this.mat.dispose();
    // 第十七轮：魔修的网格（每人一份合并的蒙皮网格）与骨骼贴图、寒冰罩、光晕一并释放（之前每来一个魔修就留下一份）
    this.npc.root.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); if (o.isSkinnedMesh) o.skeleton?.dispose(); } });
    this.aura.material.dispose();
    if (this.ice) { this.ice.geometry.dispose(); this.ice.material.dispose(); }
    this.npc.root.parent?.remove(this.npc.root);
    this.aura.parent?.remove(this.aura);
    if (this.ice) this.ice.parent?.remove(this.ice);
    if (this.tele) this.combat.removeTelegraph(this.tele);
    this.bar.remove();
  }
}

export class Combat {
  constructor({ player, camera, ui, input, cam }) {
    this.player = player; this.camera = camera; this.ui = ui; this.input = input; this.cam = cam;
    this.enemies = [];
    this.projectiles = [];
    this.lateHits = []; this.lateStat = { held: 0, parried: 0, expired: 0 };      // 第二十六轮：挂起等迟到弹反的来招
    this.telegraphs = [];
    this.effects = [];
    this.numbers = [];
    // 战斗界面（第十四轮重做，见 ui/combatHud.js）：技能格的点击、触屏按住格挡都转给剑诀
    this.hud = new CombatHud({ onSkill: (k) => this.moves?.input(k === 'slash' ? 'light' : k), onGuard: (v) => this.setGuard(v), onHold: (k, v) => { if (!v || this.canAct()) this.moves?.press(k, v); } });
    const PC = PLAYER_COMBAT;
    this.playerUnit = { faction: SECT, isPlayer: true, hp: PC.hp, maxHp: PC.hp, pos: player.pos, radius: 0.35, alive: true, invuln: 0, lastHit: -99 };
    this.state = 'peace';      // peace 平和 / battle 交战
    this.invasion = false;     // 宗门遭魔修入侵（护宗双龙协助防御）
    this.t = 0;
    this.onPlayerDown = null;
    this.onEnemyDeath = null;
    this.world = null; this.scene = null; this.worldName = 'surface';
    this.moves = null; this.sfx = null; this.animLib = null;
    this.dummies = [];         // 演武广场的木人桩（只记伤害）
    this.duelists = [];        // 第十五轮：演武场的切磋对手（game/duel.js）；由 arena.js 更新与拆除
    this.duelBoss = null;      // 切磋中：魔将血条显示对手
    this.hitListeners = new Set();   // 第十五轮：伤害结算事件（演武统计用）：f({ target, from, amount, kind, result })
    this.extraTargets = [];          // 第十六轮：独立场景里的守关首领（镇塔龙君·烬霄），按 world 过滤
    this.allies = [];                // 第二十一轮：护战的凤凰（敌人可以打它、魔弹可以打中它）
    this.targetFor = null;           // 第二十一轮：(敌人) → 该打的单位（隐藏仇恨满时为凤凰），由九霄凤焰接上
    this.onEngage = null;            // 第二十一轮：玩家一方（含凤凰）打中了某个敌人——记下遭遇的奖励基准
    this.onWorldChange = null;       // 第二十一轮：换场景（九霄凤焰完整清理）
    this.noRegen = false;            // 第十六轮：守关战中停止寻常的气血回复（服丹照常）
    this.bossFight = false;          // 第十六轮：守关战进行中（算作交战：灵力按交战回复、剑诀栏常显）
    this.stopT = 0;            // 顿帧剩余（现实秒）
    this.stopClock = 0; this.stopCount = 0;
    this.sound = null;         // 第十七轮：合成音效（core/audio.js），玩家的挥剑、命中、格挡、弹反……
    this._healAcc = 0;
    this.hud.setHp(PC.hp, PC.hp);
  }

  // 第十四轮：剑诀与特效在 main.js 里建好后接上
  attach({ moves, sfx, animLib }) {
    this.moves = moves; this.sfx = sfx; this.animLib = animLib;
    for (const e of this.enemies) if (animLib && !e.npc.motion) e.npc.setAnimLib(animLib);
  }
  // 木人桩：pts 为桩脚的位置（宗门场景）
  addDummies(pts) {
    for (const p of pts) {
      this.dummies.push({ dummy: true, faction: 'dummy', pos: new THREE.Vector3(p.x, p.y, p.z), radius: 0.32, alive: true, hp: 1, maxHp: 1, world: 'surface',
        cfg: { scale: 1, name: '木人桩' }, headY: p.y + 2.0, yaw: 0, stagger() {}, total: 0, lastT: -99 });
    }
  }
  // 玩家剑诀的目标：活着的魔修与（宗门里的）木人桩
  targets() {
    const out = this.alive();
    if (this.worldName === 'surface') { for (const d of this.dummies) out.push(d); for (const d of this.duelists) if (d.alive) out.push(d); }
    for (const u of this.extraTargets) if (u.alive && u.world === this.worldName && !u.hidden?.()) out.push(u);
    return out;
  }
  emitHit(e) { for (const f of this.hitListeners) f(e); }
  // 地面高度（剑阵、落剑、冲击波的落点）
  groundAt(x, z, footY) {
    const W = this.world;
    let g = W.terrain.heightAt(x, z);
    g = Math.max(g, W.cw.ground(x, z, footY, 0.5));
    if (this.worldName === 'surface' && this.player.skyGround) { const sg = this.player.skyGround(x, z, footY); if (sg > g) g = sg; }
    return g;
  }
  // 顿帧：命中的一瞬间整个画面放慢（一切计时一起放慢，输入照常缓冲）。同一时刻多个目标不叠加（取最大值）、封顶 stopCap；
  // 两次顿帧的起点相隔太近时后一次减半（连续命中不会一直卡着）
  hitStop(sec) {
    const F = PLAYER_COMBAT.feedback;
    if (!(sec > 0)) return;
    if (this.stopT > 0) { this.stopT = Math.max(this.stopT, Math.min(sec, F.stopCap)); return; }
    if (this.stopClock - (this.stopStart ?? -9) < F.stopGap) sec *= 0.5;
    this.stopStart = this.stopClock;
    this.stopT = Math.min(sec, F.stopCap);
    this.stopCount++;
  }
  timeScale(realDt) { this.stopClock += realDt; if (this.stopT <= 0) return 1; this.stopT -= realDt; return 0.06; }
  // 震屏、镜头短位移、闪光：按设置里的「震屏与闪光」缩放（关 / 弱 / 标准）
  get fxk() { return this._fxk ?? (this._fxk = Math.min(1, Math.max(0, +(localStorage.getItem('qinglan.fxk') ?? 1)))); }
  setFxk(v) { this._fxk = v; }
  flash(color, k) { if (this.fxk > 0) this.sfx?.flash(color, k * this.fxk); }
  kick(dir, k) { if (this.fxk > 0) this.cam?.kick?.(dir, k * this.fxk); }
  healPlayer(v) {
    const P = this.playerUnit;
    if (!P.alive || v <= 0) return;
    const before = P.hp;
    P.hp = Math.min(P.maxHp, P.hp + v);
    this._healAcc += P.hp - before;
    if (this._healAcc >= 8) { this.popNumber(P, `+${Math.round(this._healAcc)}`, 'heal'); this._healAcc = 0; }
    this.hud.setHp(P.hp, P.maxHp);
  }

  // 当前所在场景（宗门 / 幽渊秘境）：敌人、投射物与特效都放进该场景，行走判定用该场景的地面与碰撞
  setWorld(name, { scene, terrain, cw }) {
    this.worldName = name; this.scene = scene; this.world = { terrain, cw };
    this.onWorldChange?.(name, scene);
    this.setGuard(false);
    this.moves?.reset();
    this.sfx?.vfx.moveTo(scene); this.sfx?.moveTo(scene);
    for (const e of [...this.enemies]) if (e.world !== name) { e.dispose(); this.enemies.splice(this.enemies.indexOf(e), 1); }
    for (const p of this.projectiles) { if (p.kind === 'wave') this.sfx?.waveEnd(p); this.freeProjObj(p); }
    this.projectiles.length = 0;
    for (const t of [...this.telegraphs]) this.removeTelegraph(t);
    for (const f of this.effects) f.obj.parent?.remove(f.obj);
    this.effects.length = 0;
  }

  canAct() { return !this.ui.busy && !this.ui.panelOpen && this.playerUnit.alive && !this.blocked?.(); }

  spawn(kind, pos, opts) {
    const e = new Enemy(this, kind, pos, opts);
    this.enemies.push(e);
    return e;
  }
  alive(world = this.worldName) { return this.enemies.filter((e) => e.alive && e.world === world); }

  // 离某点最近、在半径内的敌对单位（护宗双龙选择目标用；只看宗门场景里的魔修）
  nearestHostile(p, radius, world = 'surface') {
    let best = null, bd = radius;
    for (const e of this.enemies) {
      if (!e.alive || e.world !== world || !hostile(SECT, e.faction)) continue;
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // 第十七轮：来招的防御属性——def（ATTACK_DEF 的名字）为底，spec 里的项覆盖；旧的开关（unblockable / noParry / guardBreak）照样认
  resolveSpec(o) {
    const base = ATTACK_DEF[o.spec?.def || o.def || (o.kind === 'fire' ? 'fire' : 'claw')] || ATTACK_DEF.claw;
    const s = { ...base, ...(o.spec || {}) };
    if (o.unblockable) s.block = false;
    if (o.noParry) s.parry = false;
    if (o.guardBreak && s.block === true) s.block = 'hard';
    if (s.active == null) s.active = true;
    return s;
  }

  // 伤害：只在敌对阵营之间结算
  // 第十六轮：unblockable / noParry / guardBreak / react（flinch / knockback / knockdown / stun）；
  // 第十七轮：对玩家的出手带 spec（来招的防御属性，见 combatConfig.js 的 ATTACK_DEF）：id + seg 标识「哪一招的哪一段」（同一段只结算一次）、
  //           active（正在出手的有效段）、block / parry / deflect / guardCost / chip / onParry / parryEnds。玩家一方返回结算结果
  //           （hit / block / parry / guardbreak / dodge / immune / dup）；出手的是玩家时 posture（架势）、counter（反击）、hitKind 交给目标
  // 第二十二轮：counterK——反击强化的伤害倍率，只乘在真正打进去的那一下（被格挡住的照常结算、不吃倍率，返回 block，强化留着）
  // 第二十五轮：execProbe——拔刀斩「终式」对主目标的处决探针：这一下被接受（没被无敌、格挡拒绝）之后、伤害结算之前问一次，确认处决就返回 'exec'（不扣血）；
  //   finale——终式的终结提交走的正常死亡（不另放血雾、终结音与顿帧，演出自己有收刀清响与爆墨）；被处决锁定、等着演出收尾的目标不受别的伤害
  damage(target, amount, { from = null, kind = 'phys', dot = false, at = null, stun = null, push = 0, knock = 0, big = false, knockdown = false, unblockable = false, noParry = false, guardBreak = false, react = null, invuln = null,
    spec = null, def = null, posture = 0, counter = false, counterK = 1, hitKind = null, execProbe = null, finale = false, after = null } = {}) {
    if (!target.alive) return;
    if (target.finaleLock) { this.emitHit({ target, from, amount: 0, kind, result: 'immune' }); return 'immune'; }
    // 木人桩：只记伤害数字
    if (target.dummy) {
      if (counter) amount *= counterK;
      if (from !== this.playerUnit && !from?.isPlayer && !from?.ownerPlayer) return;
      target.total += amount; target.lastT = this.t;
      this.popNumber(target, `${Math.round(amount)}`, kind === 'heavy' || big ? 'heavy' : kind);
      target.flash = 1;
      return 'hit';
    }
    if (from && !hostile(from.faction ?? SECT, target.faction)) return;
    // 第二十一轮：护战的凤凰自己结算（独立的气血、受击、仇恨）
    if (target.phoenix) return target.receive(amount, { from, kind, at, spec: dot ? null : this.resolveSpec({ spec, def, kind, unblockable, noParry, guardBreak }), dot });
    // 第二十一轮：玩家一方打中了敌人——遭遇开始（记下奖励基准）
    if ((from?.isPlayer || from?.ownerPlayer) && !target.isPlayer) this.onEngage?.(target);
    if (target.isPlayer) return this.damagePlayer(target, amount, { from, kind, dot, at, knockdown, react, invuln, after, spec: dot ? null : this.resolveSpec({ spec, def, kind, unblockable, noParry, guardBreak }) });
    // 第十六轮：守关首领自己结算（分阶段的气血、架势、轻 / 重受击、失衡、阶段耗尽）
    if (target.boss) return target.receive(counter ? amount * counterK : amount, { from, kind, dot, at, stun, push, knock, big, posture, counter, hitKind, execProbe: dot ? null : execProbe });
    // 第十五轮：切磋对手倒地、起身时不受伤害（点到为止）；自己判格挡（正面、举剑时只受一成半到两成半），格挡住时不失衡
    if (target.immune?.()) {
      this.emitHit({ target, from, amount: 0, kind, result: 'immune' });
      if (from?.isPlayer && this.t - (target._immNum ?? -9) > 0.5) { target._immNum = this.t; this.popNumber(target, '免疫', 'immune'); }
      return 'immune';
    }
    let result = 'hit';
    if (target.absorb && !dot) {
      const info = {};
      amount = target.absorb(amount, from, info, { at, kind, big, stun, knock, posture });
      if (info.blocked) { result = 'block'; this.popNumber(target, '格挡', 'block'); stun = null; knock = 0; push = Math.min(push, 0.25); }
    }
    // 第二十五轮：终式的处决探针（主目标这一下已被接受）——确认处决就不扣血，交给演出
    if (execProbe && result === 'hit' && !dot && execProbe(target)) { this.emitHit({ target, from, amount: 0, kind, result: 'exec' }); return 'exec'; }
    if (counter) { if (result === 'hit') amount *= counterK; else counter = false; }
    // 第二十九轮：通用的终结——玩家一方的致命一击（不论哪种招式）：群战里的最后一个、最后一条命，交给墨里终焉（这一下不扣血，演出收刀合拢时才倒下）
    if (!finale && amount >= target.hp && this.lethalProbe?.(target, { from, kind, dot })) { this.emitHit({ target, from, amount: 0, kind, result: 'exec' }); return 'exec'; }
    const hp0 = target.hp;
    target.hp -= amount;
    target.engaged = true;
    // 第二十一轮：分段气血——打到本段的结束阈值就停在阈值、转入下一段（溢出的不带进下一段）
    if (target.cfg?.stages && target.alive) { const floor = target.stageFloor(); if (floor > 0 && target.hp <= floor) { amount = hp0 - floor; target.hp = floor; target.beginShift(); } }
    target.flashK = big ? 0.5 : 0.32;
    if (!dot && result !== 'block') target.char?.flash?.(counter ? 0xffd890 : 0xfff2e2, big ? 0.3 : 0.2);
    this.emitHit({ target, from, amount: Math.min(amount, Math.max(0, hp0)), kind, result });
    // 被玩家打中，或玩家就在附近，才转而追击玩家；被护宗双龙击中的魔影继续沿原路行进（切磋对手的 AI 自己管）
    const pd = Math.hypot(this.playerUnit.pos.x - target.pos.x, this.playerUnit.pos.z - target.pos.z);
    if (!target.duel && (target.state === 'idle' || target.state === 'march' || target.state === 'dormant') && (from?.isPlayer || pd < target.aggro * 1.3)) target.state = 'chase';
    if (!dot) {
      if (result !== 'block') this.popNumber(target, `${Math.round(amount)}`, counter ? 'crit' : big ? 'heavy' : kind);
      // 失衡与击退：剑诀给出 stun / push / knock；其余（护宗双龙）照旧偶尔一顿；被缚住时只掉血不失衡
      if (target.bound > 0) { /* 缚灵锁中 */ }
      else if (stun != null) target.stagger(stun, at || from?.pos || this.player.pos, knock || push, { counter, big });
      else if (!target.duel && target.state === 'chase' && target.kind !== 'elite' && Math.random() < 0.35) { target.state = 'hit'; target.wt = 0; }
    } else if ((target._dotAcc = (target._dotAcc || 0) + amount) > 4) { this.popNumber(target, `${Math.round(target._dotAcc)}`, 'burn'); target._dotAcc = 0; }
    target.bar.set(target.hp / target.maxHp);
    if (target.hp <= 0) {
      target.alive = false; target.deadT = 0; target.hp = 0;
      if (target.tele) { this.removeTelegraph(target.tele); target.tele = null; }
      target.clearTell?.();
      // 魔修溃散的血雾；切磋对手只是被击倒（由 arena.js 收尾）；最后一击加重
      if (!target.duel && !finale) { this.fx(target.pos, 0x7a1018, 40, 0.8, 3.5, 1.2); this.sfx?.death(target); }
      if (from?.isPlayer && !finale) { this.hitStop(PLAYER_COMBAT.feedback.stop.heavy); this.sound?.play('finish', { at: target.pos }); }
      target.onDeath?.(target);
      this.onEnemyDeath?.(target);
    }
    return result;
  }

  // ---------- 第十七轮：玩家受伤——闪身 → 同段去重 → 弹反 / 格挡 / 破防 / 受击（判定在 moves.defend），各有各的反馈 ----------
  // 第二十六轮：after（可选）——这一下被挂起等迟到的弹反时（返回 'pending'），最终结果出来后回调 after(结果)
  damagePlayer(U, amount, { from, kind, dot, at, knockdown, react, invuln, spec, after = null }) {
    if (U.finaleGuard) { this.emitHit({ target: U, from, amount: 0, kind, result: 'immune', spec }); return 'immune'; }     // 第二十五轮：处决演出中玩家受保护
    if (U.invuln > 0 && !dot) { this.emitHit({ target: U, from, amount: 0, kind, result: 'immune', spec }); return 'immune'; }
    const M = this.moves, src = at || from?.pos || null;
    const r = M ? M.defend(amount, { spec, at: src, from, dot }) : { result: 'hit', amount };
    if (r.result === 'dup') return 'dup';
    const o = { from, kind, dot, at, knockdown, react, invuln, spec, after };
    // 第二十六轮：迟到的弹反——这一下先挂起 lateGrace 秒（期间无敌，不让别的一下趁机打进来）：挂起中新开了弹反窗口 → lateParry 按弹反结算；
    //   到时没按 → tickLateParry 照原来的结果结算。玩家的时钟（moves.time）计时：顿帧、暂停时一样停
    if (r.late && r.result === 'hit' && !dot && M && U.alive) {
      const G = PLAYER_COMBAT.guard;
      this.lateHits.push({ U, r, o, src: src?.clone ? src.clone() : src, t: M.time, until: M.time + G.lateGrace });
      U.invuln = Math.max(U.invuln, G.lateGrace + 0.05);
      this.lateStat.held++;
      return 'pending';
    }
    return this.settlePlayer(U, r, o, src);
  }
  // 弹反窗口刚开（moves.enterGuard）：还挂着、没过期的来招按弹反结算
  lateParry() {
    if (!this.lateHits.length || !this.moves) return;
    for (const h of this.lateHits.splice(0)) {
      const ok = h.U.alive && this.moves.time <= h.until + 1e-6;
      const res = this.settlePlayer(h.U, ok ? { result: 'parry', amount: 0 } : h.r, h.o, h.src);
      if (ok) this.lateStat.parried++;
      h.o.after?.(res);
    }
  }
  // 每帧（moves.update 开头）：挂到时的照原来的结果结算
  tickLateParry() {
    if (!this.lateHits.length || !this.moves) return;
    for (let i = this.lateHits.length - 1; i >= 0; i--) {
      const h = this.lateHits[i];
      if (h.U.alive && this.moves.time <= h.until) continue;
      this.lateHits.splice(i, 1);
      if (!h.U.alive) continue;
      const res = this.settlePlayer(h.U, h.r, h.o, h.src);
      this.lateStat.expired++;
      h.o.after?.(res);
    }
  }
  clearLateParry() { this.lateHits.length = 0; }
  // 玩家这一下的结算（弹反 / 格挡 / 破防 / 受击各自的反馈）
  settlePlayer(U, r, { from, kind, dot, at, knockdown, react, invuln, spec }, src) {
    const P = this.player, M = this.moves, FB = PLAYER_COMBAT.feedback.stop;
    const res = r.result;
    const away = src ? _kv.set(P.pos.x - src.x, 0, P.pos.z - src.z) : _kv.set(-Math.sin(P.heading), 0, -Math.cos(P.heading));
    if (away.lengthSq() < 1e-6) away.set(-Math.sin(P.heading), 0, -Math.cos(P.heading));
    away.normalize();
    if (res === 'dodge') {
      if (this.t - (this._dodgeNum ?? -9) > 0.4) { this._dodgeNum = this.t; this.popNumber(U, '闪', 'dodge'); }
      this.emitHit({ target: U, from, amount: 0, kind, result: 'dodge', spec });
      return 'dodge';
    }
    if (res === 'parry') {
      U.invuln = Math.max(U.invuln, 0.12);
      this.popNumber(U, '弹反', 'parry');
      M.onParry(src, { spec, from });
      this.parryReaction(from, spec, src);
      this.sound?.play('parry', { at: src || P.pos });
      this.hitStop(FB.parry); this.kick(away, 0.08); this.flash(0xffe2a0, 0.12);
      if (P.char.shield) P.char.shield.material.uniforms.uFlash.value = 1;
      this.emitHit({ target: U, from, amount: 0, kind, result: 'parry', spec });
      return 'parry';
    }
    const hp0 = U.hp;
    const amount = r.amount;
    U.hp -= amount; U.lastHit = this.t;
    if (res === 'block' || res === 'guardbreak') {
      U.invuln = invuln ?? PLAYER_COMBAT.invuln * 0.5;
      if (P.char.shield) P.char.shield.material.uniforms.uFlash.value = res === 'guardbreak' ? 0.7 : spec?.block === 'hard' ? 0.8 : 0.55;
      this.emitHit({ target: U, from, amount: Math.min(amount, Math.max(0, hp0)), kind, result: res, spec });     // 统计按实际掉的气血（不计溢出）
      if (res === 'guardbreak') {
        this.popNumber(U, '破防', 'heavy');
        this.sound?.play('guardBreak', { at: P.pos });
        this.hitStop(FB.guardBreak); this.kick(away, 0.2); this.flash(0xff6a50, 0.1);
        if (U.hp > 0) M.onGuardBreak(src);
      } else {
        this.popNumber(U, amount >= 0.5 ? `挡 -${Math.round(amount)}` : '挡', 'block');
        this.sound?.play('block', { at: src || P.pos, hard: spec?.block === 'hard' });
        this.hitStop(FB.block); this.kick(away, spec?.block === 'hard' ? 0.1 : 0.045);
        M.onBlock(src, spec?.block === 'hard');
      }
      if (U.hp <= 0) this.playerDown(U);
      this.hud.setHp(U.hp, U.maxHp);
      return res;
    }
    this.emitHit({ target: U, from, amount: Math.min(amount, Math.max(0, hp0)), kind, result: 'hit', spec });
    if (!dot) {
      U.invuln = invuln ?? PLAYER_COMBAT.invuln;
      this.hud.hurt(src ? Math.atan2(src.x - P.pos.x, src.z - P.pos.z) - (this.cam ? Math.atan2(this.cam.forward().x, this.cam.forward().z) : 0) : null);
      this.popNumber(U, `-${Math.round(amount)}`, 'hurt');
      this.sound?.play('hurt', { at: P.pos });
      this.hitStop(FB.hurt); this.kick(away, react === 'knockback' || knockdown ? 0.22 : 0.1);
      this.sfx?.playerHurt(P, src);
      P.char.flash?.(0xff3020, 0.36);
      const rk = react !== null ? react || (spec?.block === 'hard' ? 'knockback' : 'flinch') : null;
      if (knockdown && U.hp > 0 && amount >= 12) M?.knockdown(src);
      else if (rk && U.hp > 0) M?.react?.(rk, src);
    }
    if (U.hp <= 0) this.playerDown(U);
    this.hud.setHp(U.hp, U.maxHp);
    return 'hit';
  }
  playerDown(U) { U.hp = 0; U.alive = false; this.setGuard(false); this.moves?.reset(); this.phoenix?.clear('death'); this.dragon?.clear('death'); this.onPlayerDown?.(); }
  // 被弹反的出手者：自己有 onParried（切磋对手、守关龙君）就交给它；魔修按来招的 onParry 收手 / 失衡 / 打断
  parryReaction(from, spec, at) {
    if (!from) return;
    if (from.onParried) { from.onParried(spec, at); return; }
    // 第十八轮：被弹反的出手者至少僵直 parryStun（魔将另算）；onParry 给的更长就按更长的（弹回的魔弹不让远处的术士僵直）
    const base = spec?.onParry === 'none' ? 0 : PLAYER_COMBAT.guard.parryStun[from.kind === 'elite' ? 'elite' : 'enemy'];
    const t = Math.max(base, { stagger: 1.4, interrupt: 1.0, recoil: 0.6 }[spec?.onParry] ?? 0);
    if (t > 0 && from.stagger && Math.hypot(from.pos.x - this.player.pos.x, from.pos.z - this.player.pos.z) < 6) {
      from.stagger(t, this.player.pos, 0.8);
      if (from.alive) this.popNumber(from, '僵直', 'parry');
    }
  }
  // 缚灵锁：寻常魔修定身、魔将短一些、切磋对手失衡片刻、守关龙君只锁住片刻并积累架势；同一目标 dr 秒内再锁时间减半
  bind(target, B, from) {
    if (!target.alive || target.immune?.()) return false;
    if (target.dummy) { this.popNumber(target, '缚', 'ice'); target.flash = 1; this.sfx?.bindMark?.(target, 1.2); return true; }
    const k = this.t - (target._bindT ?? -99) < B.dr ? 0.5 : 1;
    target._bindT = this.t;
    let time;
    if (target.boss) { time = B.time.boss * k; target.bind?.(time, B.posture * k); }
    else if (target.duel) { time = B.time.duel * k; target.bind?.(time); }
    else { time = (target.kind === 'elite' ? B.time.elite : B.time.enemy) * k; target.bind?.(time); }
    this.popNumber(target, k < 1 ? '缚 · 减半' : '缚', 'ice');
    this.sfx?.bindMark?.(target, time);
    void from;
    return true;
  }

  applyStatus(target, kind, p) {
    if (!target.alive || target.isPlayer) return;
    const S = target.st;
    if (kind === 'slow') { S.slow = Math.max(S.slow, p.time); S.slowK = Math.min(S.slowK, p.k); }
    if (kind === 'freeze') { S.freeze = Math.max(S.freeze, p.time); this.popNumber(target, '冻结', 'ice'); }
    if (kind === 'burn') { S.burn = Math.max(S.burn, p.time); S.burnDps = Math.max(S.burnDps, p.dps); }
    if ((kind === 'slow' || kind === 'freeze') && !target.ice) {
      target.ice = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.25, depthWrite: false }));
      target.ice.scale.set(1, 1.35, 1);
      this.scene.add(target.ice);
    }
  }

  // ---------- 玩家：格挡（右键按住）只在可操作时生效；打开界面、失去焦点、力竭、切换场景时一律解除 ----------
  setGuard(v) {
    v = !!v && this.canAct() && !this.player.meditate && !this.player.flying;
    this.guardHeld = v;                    // 右键（触屏的格挡键）按着
    this.moves?.setGuard(v);
    this.syncGuard();
  }
  // 第十五轮：实际是否在格挡以剑诀为准（出剑的那一段举不起剑；闪身、倒地、换场景时放下）——减伤、弹反、移动减速、对手看到的都按这个
  syncGuard() {
    const g = this.moves ? this.moves.guarding : this.guardHeld;
    this.playerUnit.guarding = g; this.player.guard = g;
  }
  nearestEnemy(p, r) {
    let best = null, bd = r;
    for (const e of this.alive()) { const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  // ---------- 投射物 ----------
  // o：{ from, to, speed, radius, damage, faction, kind（sword 剑气 / demonic 魔弹 / ice 寒息 / fire 火球）, range, aoe, onImpact }
  // 第十七轮：投射物的光团（头 + 拖尾的几个精灵）按种类循环取用，不在每次出手时新建
  takeProjObj(kind) {
    const pool = (this.projPool ||= {})[kind] ||= [];
    let obj = pool.pop();
    if (!obj) {
      obj = new THREE.Group();
      const head = null, trail = [];
      obj.userData = { kind, head, trail, color: 0xffffff };
      // 剑气·新月（第十四轮起）：月牙是立体的（skillfx.waveSpawn），这里只有判定
      if (kind !== 'wave') {
        const color = { sword: 0xbff0ff, demonic: 0xff3020, ice: 0xbfe8ff, fire: 0xff8a30 }[kind];
        const size = { sword: 1.6, demonic: 1.3, ice: 2.4, fire: 3.6 }[kind];
        obj.userData.color = color;
        obj.userData.head = sprite(color, size);
        obj.add(obj.userData.head);
        for (let i = 0; i < (kind === 'fire' || kind === 'ice' ? 7 : 4); i++) { const sp = sprite(color, size * (0.8 - i * 0.09)); sp.material.opacity = 0.55 - i * 0.07; obj.add(sp); trail.push(sp); }
      }
    }
    for (const sp of obj.children) sp.material.color.set(obj.userData.color);
    return obj;
  }
  freeProjObj(p) {
    p.obj.parent?.remove(p.obj);
    const k = p.obj.userData?.kind;
    if (k) { const pool = (this.projPool ||= {})[k] ||= []; if (pool.length < 16) pool.push(p.obj); }
  }
  shoot(o) {
    const dir = new THREE.Vector3().subVectors(o.to, o.from);
    const dist = dir.length(); dir.normalize();
    const obj = this.takeProjObj(o.kind);
    const head = obj.userData.head, trail = obj.userData.trail;
    obj.position.copy(o.from);
    for (const sp of obj.children) sp.position.set(0, 0, 0);
    this.scene.add(obj);
    const p = { ...o, obj, head, trail, dir, pos: o.from.clone(), travelled: 0, maxDist: o.aoe ? dist : o.range || dist + 4, hist: [], hitSet: o.pierce ? new Set() : null };
    this.projectiles.push(p);
    if (o.kind === 'wave') this.sfx?.waveSpawn(p);
    return p;
  }
  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const step = p.speed * dt;
      p.hist.unshift(p.pos.clone()); if (p.hist.length > 12) p.hist.pop();
      p.pos.addScaledVector(p.dir, step);
      if (p.kind === 'fire' && p.aoe) p.pos.y += Math.sin(Math.min(1, p.travelled / p.maxDist) * Math.PI) * dt * 6;   // 火球略带弧线
      p.travelled += step;
      if (p.head) {
        p.head.position.copy(p.pos).sub(p.obj.position);
        p.trail.forEach((sp, k) => { const h = p.hist[Math.min(p.hist.length - 1, k + 1)] || p.pos; sp.position.copy(h).sub(p.obj.position); });
      }
      if (p.kind === 'wave') this.sfx?.waveTick(p, dt);
      let hit = null;
      // 贯穿（剑气·新月）：沿途每个目标各结算一次，不停下；接触点取剑气与目标身体相交处
      if (p.pierce) {
        for (const u of this.targets()) {
          if (p.hitSet.has(u)) continue;
          const dy = (u.pos.y + 1.0) - p.pos.y;
          if (Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < p.radius + u.radius && Math.abs(dy) < 1.8) {
            p.hitSet.add(u);
            const at = new THREE.Vector3(u.pos.x - p.dir.x * (u.radius || 0.4), Math.max(u.pos.y + 0.5, Math.min(p.pos.y, (u.headY ?? u.pos.y + 1.8) - 0.2)), u.pos.z - p.dir.z * (u.radius || 0.4));
            const r = this.damage(u, p.damage, { from: this.playerUnit, kind: 'sword', stun: p.stun ?? 0.3, push: 0.4, at, posture: 5 });
            this.sfx?.hitFx?.(u, at, { kind: 'light', result: r || 'hit', dir: p.dir, ink: !!p.short });          // 第二十轮：拔刀斩的剑气命中处是墨
            this.sound?.play('hit', { at });
            p.onHit?.(u);
          }
        }
      } else if (!p.aoe) {
        for (const u of [this.playerUnit, ...this.allies, ...this.enemies, ...(p.reflected ? this.targets().filter((x) => !this.enemies.includes(x) && !x.dummy) : [])]) {
          if (!u.alive || !hostile(p.faction, u.faction) || (u.world && u.world !== this.worldName)) continue;
          const dy = (u.pos.y + 1.0) - p.pos.y;
          if (Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < p.radius + u.radius && Math.abs(dy) < 1.6) { hit = u; break; }
        }
      }
      const W = this.world, ground = W.terrain.heightAt(p.pos.x, p.pos.z);
      // 撞墙：沿这一帧走过的一段打射线（剑气、魔弹都在墙上散开）
      let wall = false;
      if (!hit && W.cw?.ray && p.kind !== 'fire') { const t = W.cw.ray(p.prevPos || p.pos, p.dir, step + 0.05); if (t < step + 0.04) { wall = true; p.pos.copy(p.prevPos || p.pos).addScaledVector(p.dir, t); } }
      (p.prevPos ||= new THREE.Vector3()).copy(p.pos);
      const done = hit || wall || p.travelled >= p.maxDist || p.pos.y < ground - 0.2;
      if (!done) continue;
      // 第十七轮：魔弹打到玩家——带着来招的防御属性结算；弹反成功且可弹回的反飞向出手者
      // 第二十一轮：魔弹打中护战的凤凰
      if (hit && hit.phoenix) { this.damage(hit, p.damage, { from: p.ownerUnit || { faction: p.faction, pos: p.from, owner: p.owner }, kind: p.kind, spec: p.spec, at: p.pos.clone() }); this.fx(p.pos, 0xff3020, 18, 0.5, 4, 0.4); this.freeProjObj(p); this.projectiles.splice(i, 1); continue; }
      if (hit && hit.isPlayer && p.spec) {
        const r = this.damage(hit, p.damage, { from: p.ownerUnit || { faction: p.faction, pos: p.from, owner: p.owner }, kind: p.kind, spec: p.spec, at: p.pos.clone() });     // 第二十九轮：带上 owner（玩家的剑气算玩家一方）
        if (r === 'parry' && (p.spec.deflect ?? ATTACK_DEF[p.spec.def]?.deflect) && this.deflect(p)) continue;
        this.fx(p.pos, 0xff3020, 22, 0.5, 4, 0.45);
        this.freeProjObj(p); this.projectiles.splice(i, 1);
        continue;
      }
      if (p.kind === 'wave') { if (wall) this.sfx?.waveWall?.(p); this.sfx?.waveEnd(p); this.freeProjObj(p); this.projectiles.splice(i, 1); continue; }
      if (wall && p.kind !== 'ice') { this.sfx?.wallHit?.(p.pos.clone(), p.dir); this.fx(p.pos, p.faction === SECT ? 0xcff4ff : 0xff3020, 16, 0.45, 3, 0.4); this.freeProjObj(p); this.projectiles.splice(i, 1); continue; }
      this.impact(p, hit);
      this.freeProjObj(p);
      this.projectiles.splice(i, 1);
    }
  }
  // 弹回：反飞向出手者（变成宗门一方的），伤害加五成
  deflect(p) {
    const o = p.ownerUnit;
    if (!o || !o.alive) return false;
    const to = new THREE.Vector3(o.pos.x, o.pos.y + 1.0, o.pos.z);
    p.dir.subVectors(to, p.pos).normalize();
    p.faction = SECT; p.owner = 'player'; p.spec = null; p.reflected = true;
    p.travelled = 0; p.maxDist = p.pos.distanceTo(to) + 4; p.damage *= 1.5; p.speed *= 1.25;
    for (const s of [p.head, ...p.trail]) s?.material.color.set(0xffe2a0);
    this.sfx?.deflect?.(p.pos.clone());
    return true;
  }
  impact(p, hit) {
    const at = p.pos;
    const src = { faction: p.faction, isPlayer: p.owner === 'player' };
    if (p.kind === 'fire') {
      // 火龙：落点范围火焰伤害 + 灼烧
      const D = DRAGON_COMBAT.fire;
      for (const e of this.alive()) if (Math.hypot(e.pos.x - at.x, e.pos.z - at.z) < D.splash) { this.damage(e, D.damage, { from: src, kind: 'fire' }); this.applyStatus(e, 'burn', { time: D.burnTime, dps: D.burnDps }); }
      this.fx(at, 0xff7a24, 90, 1.1, 9, 0.9); this.fx(at, 0x3a2a24, 30, 1.6, 3, 1.6);
      if (p.tele) this.removeTelegraph(p.tele);
      this.shake(Math.max(0, 0.25 - this.player.pos.distanceTo(at) / 160));
      return;
    }
    if (p.kind === 'ice') {
      // 冰龙：命中减速，同一目标每两次命中冻结一次；落点小范围减速
      const D = DRAGON_COMBAT.ice;
      if (hit) {
        this.damage(hit, D.damage, { from: src, kind: 'ice' });
        hit.st.hits++;
        if (hit.st.hits % D.freezeEvery === 0) this.applyStatus(hit, 'freeze', { time: D.freezeTime });
      }
      for (const e of this.alive()) if (Math.hypot(e.pos.x - at.x, e.pos.z - at.z) < D.splash) this.applyStatus(e, 'slow', { time: D.slowTime, k: D.slow });
      this.fx(at, 0xcff2ff, 70, 0.8, 7, 0.9);
      if (p.tele) this.removeTelegraph(p.tele);
      return;
    }
    if (hit) {
      const r = this.damage(hit, p.damage, { from: p.reflected ? this.playerUnit : src, kind: p.kind, at: p.pos.clone(), stun: p.reflected ? 0.8 : null, posture: p.reflected ? 10 : 0 });
      if (p.reflected) this.sfx?.hitFx?.(hit, p.pos.clone(), { kind: 'light', result: r || 'hit', dir: p.dir, gold: true });
    }
    this.fx(at, p.kind === 'sword' || p.reflected ? 0xffe8b0 : 0xff3020, 22, 0.5, 4, 0.45);
  }

  // 护宗双龙出手：冰龙吐寒息（直射，减速 / 冻结），火龙吐火球（落点画出橙色范围圈）
  dragonAttack(dragon, target) {
    const from = dragon.mouth();
    const lead = target.pos.clone();
    if (target.alive && target.st && target.st.freeze <= 0) {
      const D = DRAGON_COMBAT[dragon.kind], tFly = from.distanceTo(lead) / D.projSpeed;
      lead.x += Math.sin(target.yaw) * target.cfg.speed * target.st.slowK * tFly * 0.6;
      lead.z += Math.cos(target.yaw) * target.cfg.speed * target.st.slowK * tFly * 0.6;
    }
    lead.y += 1.0;
    if (dragon.kind === 'fire') {
      const D = DRAGON_COMBAT.fire;
      const ground = this.world.terrain.heightAt(lead.x, lead.z);
      const tele = this.telegraph(new THREE.Vector3(lead.x, ground, lead.z), D.splash, Math.PI * 2, 0xff8a28);
      tele.userData.dur = from.distanceTo(lead) / D.projSpeed;
      this.shoot({ from, to: new THREE.Vector3(lead.x, ground + 0.3, lead.z), speed: D.projSpeed, radius: 1, damage: D.damage, faction: SECT, kind: 'fire', aoe: true, tele });
    } else {
      const D = DRAGON_COMBAT.ice;
      this.shoot({ from, to: lead, speed: D.projSpeed, radius: 1.4, damage: D.damage, faction: SECT, kind: 'ice', range: from.distanceTo(lead) + 6 });
    }
  }

  // ---------- 预警圈与特效 ----------
  telegraph(pos, radius, arc, color) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 48), telegraphMaterial());
    m.material.uniforms.uColor.value.set(color);
    m.material.uniforms.uArc.value = arc;
    m.scale.setScalar(radius);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, pos.y + 0.08, pos.z);
    m.renderOrder = 11;            // 第二十三轮：画在水墨刀光（8–10）之后——普攻的墨带、墨雾盖在前面时，地上的预警仍透得出来（人、物体照样按深度挡住它）
    m.userData.t = 0;
    this.scene.add(m);
    this.telegraphs.push(m);
    return m;
  }
  // 每个预警圈各有自己的几何体与材质：移除时一并释放（不然每次出手都留下一份）
  removeTelegraph(m) { m.parent?.remove(m); const i = this.telegraphs.indexOf(m); if (i >= 0) this.telegraphs.splice(i, 1); m.geometry.dispose(); m.material.dispose(); }
  fx(pos, color, n, size, speed, life) {
    const b = burst(color, n, size, speed, life);
    b.position.set(pos.x, pos.y + 1.0, pos.z);
    this.scene.add(b);
    this.effects.push({ obj: b, t: 0, life });
  }
  shake(v) { if (this.cam && this.fxk > 0) this.cam.shake = Math.max(this.cam.shake || 0, v * this.fxk); }
  popNumber(unit, text, kind) {
    const el = this.hud.number(text, kind);
    this.numbers.push({ el, pos: new THREE.Vector3(unit.pos.x + (Math.random() - 0.5) * 0.6, (unit.headY ?? unit.pos.y + 1.9) + 0.2, unit.pos.z), t: 0 });
  }

  // ---------- 每帧 ----------
  update(dt) {
    this.t += dt;
    const P = this.playerUnit;
    if ((this.guardHeld || P.guarding) && !this.canAct()) this.setGuard(false);
    if (this.cam) { const f = this.cam.forward(); this.player.aimYaw = Math.atan2(f.x, f.z); }
    P.invuln = Math.max(0, P.invuln - dt);
    if (P.alive && !this.noRegen && this.t - P.lastHit > PLAYER_COMBAT.regenDelay && P.hp < P.maxHp) { P.hp = Math.min(P.maxHp, P.hp + PLAYER_COMBAT.regen * dt); this.hud.setHp(P.hp, P.maxHp); }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.world !== this.worldName) continue;
      if (!e.update(dt)) { e.dispose(); this.enemies.splice(i, 1); }
    }
    this.updateProjectiles(dt);
    for (const t of this.telegraphs) {
      if (t.userData.follow) { const f = t.userData.follow; t.position.set(f.pos.x, f.pos.y + 0.08, f.pos.z); t.rotation.z = f.yaw + Math.PI; }   // 扇形朝向敌人正面
      if (t.userData.dur) { t.userData.t += dt; t.material.uniforms.uP.value = Math.min(1, t.userData.t / t.userData.dur); }
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const f = this.effects[i]; f.t += dt; f.obj.material.uniforms.uT.value = f.t;
      if (f.t > f.life) { f.obj.parent?.remove(f.obj); f.obj.geometry.dispose(); this.effects.splice(i, 1); }
    }
    // 交战状态：附近有醒着的魔修，或宗门遭入侵
    const near = this.alive().some((e) => e.state !== 'dormant' && Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) < 45);
    this.state = near || this.invasion || this.bossFight ? 'battle' : 'peace';
    const M = this.moves;
    // 木人桩跟前也亮出剑诀栏（触屏上要靠它出剑）
    const practice = this.worldName === 'surface' && !this.player.flying && this.dummies.some((d) => Math.hypot(d.pos.x - P.pos.x, d.pos.z - P.pos.z) < 7);
    this.hud.show(this.state === 'battle' || practice || P.hp < P.maxHp - 0.5 || this.forceHud || !!(M && (M.busy || this.player.drawn || M.mp < (M.mpMax ?? PLAYER_COMBAT.mp) - 0.5 || M.intent > 0.5 || M.phoenix?.active)));
    if (M) this.hud.update(dt, { moves: M, unit: P, boss: this.bossTarget(), pills: this.pillCount ? this.pillCount() : 0 });
    this.updateOverlay(dt);
  }

  // 敌人血条、伤害数字跟随屏幕位置
  updateOverlay(dt) {
    const cam = this.camera, v = new THREE.Vector3(), W = innerWidth, H = innerHeight;
    for (const e of this.enemies.concat(this.duelists)) {
      if (e.world !== this.worldName || !e.alive || e.state === 'dormant') { e.bar.place(0, 0, false); continue; }
      v.set(e.pos.x, e.headY + 0.35, e.pos.z).project(cam);
      const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && cam.position.distanceTo(e.pos) < 60;
      e.bar.place((v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H, vis);
    }
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i]; n.t += dt;
      v.copy(n.pos); v.y += n.t * 1.4; v.project(cam);
      n.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * W}px, ${(-v.y * 0.5 + 0.5) * H}px)`;
      n.el.style.opacity = String(Math.max(0, 1 - n.t / 0.9));
      if (n.t > 0.9 || v.z > 1) { this.hud.freeNumber(n.el); this.numbers.splice(i, 1); }
    }
  }

  // 魔将血条：附近交上手的魔将
  bossTarget() {
    if (this.duelBoss) return this.duelBoss;                     // 第十五轮：切磋中显示对手
    for (const e of this.enemies) if (e.alive && e.kind === 'elite' && e.world === this.worldName && e.state !== 'dormant' && Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z) < 40) return e;
    return null;
  }

  // 复活（力竭后）：气血回满，清掉附近的投射物与预警
  revive() {
    const P = this.playerUnit;
    P.hp = P.maxHp; P.alive = true; P.invuln = 2;
    if (this.moves) { this.moves.reset(); this.moves.mp = this.moves.mpMax ?? PLAYER_COMBAT.mp; }
    this.hud.setHp(P.hp, P.maxHp);
    for (const p of this.projectiles) { if (p.kind === 'wave') this.sfx?.waveEnd(p); this.freeProjObj(p); }
    this.projectiles.length = 0;
    for (const e of this.enemies) if (e.alive && e.state !== 'dormant') { e.state = e.goal ? 'march' : 'idle'; e.engaged = false; }
  }
}
