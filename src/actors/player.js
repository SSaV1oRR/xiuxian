// 玩家：镜头相对的 WASD 移动、Shift 疾行；与建筑/树干/山石碰撞，台阶与平台可走，
// 自然陡坡、深水、高处断崖不可通行；驱动角色骨骼动画
// 第十三轮：御剑飞行（flight.js）；浮空岛与塔岛的岛面也可行走（skyGround：岛面高度，岛沿以外为断崖）
import * as THREE from 'three';
import { clamp, lerp, damp, lerpAngle, wrapAngle } from '../core/math.js';
import { Character } from './character.js';
import { Cultivator } from './cultivator.js';
import { CORE } from '../world/terrain.js';
import { Flight } from './flight.js';

export const SPEED = { walk: 4.3, run: 7.6 };
const STEP = 0.46, RADIUS = 0.34, HEIGHT = 1.72;
const JUMP_V = 7.6, GRAVITY = 24;          // 起跳初速与重力：约 1.2 米高、0.65 秒落地
const SLIDE = [0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4];   // 沿边滑动时依次尝试的偏转角（弧度）

export class Player {
  // figure（第十五轮）：{ gltf, meta } 金白修士；没有（载入失败）时仍用程序化的人物
  constructor(scene, terrain, cw, { figure = null } = {}) {
    this.terrain = terrain;
    this.cw = cw;
    this.char = figure ? new Cultivator(scene, figure.gltf, figure.meta, { name: 'player' }) : new Character(scene);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = Math.PI;
    this.onGround = true;
    this.running = false;
    this.notice = null;
    this.lastTurn = 0;
    this.faceTarget = null;
    this.stuckT = 0;
    this._p = new THREE.Vector3();
    this.skyGround = null;          // (x, z, footY) → 浮空岛岛面高度（不高于 footY + 0.6 的那一面），岛外为 -Infinity
    this.skyPush = null;            // (球心, 半径) → 被浮空岛实心体推开时修改球心并返回 true（飞行碰撞）
    this.cols = null;               // 分层实心柱（构筑物占据的高度区间，飞行碰撞，见 solidCols.js）
    this.flight = new Flight(this, scene);
    this.drawn = false;             // 第十四轮：佩剑在手（出剑、格挡与收势后几秒）
    this.bladeGlow = 0;             // 剑身灵光（出招时亮起）
  }

  get flying() { return this.flight.active; }

  groundAt(x, z, footY, step = STEP) {
    const sg = this.skyGround ? this.skyGround(x, z, footY + step) : -Infinity;
    return Math.max(this.terrain.heightAt(x, z), this.cw.ground(x, z, footY, step), sg);
  }

  // 跳跃：只在落地时起跳（打坐、出剑、御剑时不跳）
  jump() {
    if (!this.onGround || this.meditate || this.strike || this.flying || this.ctl?.lock || this.ctl?.maxSpeed != null) return false;
    this.vel.y = JUMP_V;
    this.onGround = false;
    this.jumping = true;
    return true;
  }

  place(x, z, heading = this.heading, y = null) {
    const t = this.terrain.heightAt(x, z);
    if (y == null) {
      // 浮空岛上：落在岛面（及岛上构筑物的顶面）
      const sg = this.skyGround ? this.skyGround(x, z, Infinity) : -Infinity;
      y = sg > -1e8 ? Math.max(sg, this.cw.ground(x, z, sg + 2.5, 0.1)) : this.groundAt(x, z, t + 2.5, 0.1);
    }
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.heading = heading;
    this.jumping = false;
    this.onGround = true;
    this.flight.cancel();
  }

  // 尝试移到 (x, z)：可走且经碰撞推挤后仍落在可走处才接受
  tryMove(x, z) {
    if (!this.canEnter(x, z)) return false;
    const p = this._p.set(x, this.pos.y, z);
    this.cw.pushCircle(p, RADIUS, HEIGHT, STEP);
    if ((p.x !== x || p.z !== z) && !this.canEnter(p.x, p.z)) return false;
    this.pos.x = p.x; this.pos.z = p.z;
    return true;
  }

  // 能否从当前位置走到 (x, z)
  canEnter(x, z) {
    const T = this.terrain, y = this.pos.y;
    // 浮空岛：岛面（含岛上构筑物顶面）可走，岛沿以外是断崖
    if (this.skyGround) {
      const here = this.skyGround(this.pos.x, this.pos.z, y + STEP);
      const sg = this.skyGround(x, z, y + STEP);
      if (sg > -1e8 || (here > -1e8 && Math.abs(here - y) < 2.5)) {
        if (!(sg > -1e8)) return false;                                // 走出岛沿
        const g = Math.max(sg, this.cw.ground(x, z, y, STEP));
        if (g - y > STEP) return false;
        if (y - g > 2.2) return false;
        const dx = x - this.pos.x, dz = z - this.pos.z, dl = Math.hypot(dx, dz);
        if (dl > 1e-5) {
          const ax = x + (dx / dl) * 0.6, az = z + (dz / dl) * 0.6, ga = this.skyGround(ax, az, y + 1.5);
          if (!(ga > -1e8)) return false;                              // 前方 0.6 米已是岛沿
          if (Math.abs(Math.max(ga, this.cw.ground(ax, az, y, STEP)) - g) / 0.6 > 1.05) return false;
        }
        return true;
      }
    }
    if (!T.inCore(x, z, 4)) return false;
    const cg = this.cw.ground(x, z, y, STEP);
    const tg = T.heightAt(x, z);
    if (cg > -Infinity && cg >= tg - 0.01) return y - cg <= 2.2;    // 落脚在台阶、平台等构筑物上
    if (tg - y > STEP) return false;                                 // 骤然升高（墙脚、崖壁）
    if (y - tg > 2.2) return false;                                  // 断崖
    // 自然坡面：沿行进方向前探 0.6 米，坡度过陡则不可通行（上下对称，避免走下去回不来）
    const dx = x - this.pos.x, dz = z - this.pos.z, dl = Math.hypot(dx, dz);
    if (dl > 1e-5) {
      const ax = x + (dx / dl) * 0.6, az = z + (dz / dl) * 0.6;
      const ahead = Math.max(T.heightAt(ax, az), this.cw.ground(ax, az, y, STEP));   // 前方若是台阶等构筑物，以其顶面为准
      if (Math.abs(ahead - tg) / 0.6 > 1.05) return false;
    }
    const w = T.waterAt(x, z);
    if (w != null && w - tg > 0.3) return false;                     // 水深没过脚踝则不可涉水（溪上走汀步）
    return true;
  }

  update(dt, move, camFwd, camPos, fin = null) {
    // 御剑：飞行中由 Flight 推进与碰撞，这里只驱动角色的御剑姿态
    if (this.flight.update(dt, fin || { x: 0, y: 0, up: 0, down: 0, boost: false, yaw: this.heading }, camPos)) {
      const sp = this.vel.length();
      this.onGround = false;
      this.char.update(dt, this.pos, this.heading, {
        mode: 'fly', onGround: false, speed: sp, vel: this.vel, boost: this.flight.boost, dun: 0,
        meditate: false, camPos, sprint: false, turn: this.flight.turn, strike: null, guard: false,
      });
      this.flight.pose(dt, camPos);
      return;
    }
    const fx = camFwd.x, fz = camFwd.z;
    // 第十四轮：出招时由剑诀（game/moves.js）接管——ctl.lock 不受方向键，ctl.vx / vz 为踏步、疾掠的强制速度，ctl.yaw 为朝向；ctl.maxSpeed 限速（第十九轮）
    const ctl = this.ctl;
    if (this.meditate || ctl?.lock) move = { x: 0, y: 0, run: false };            // 打坐、出招时不受方向键
    let mx = fx * move.y - fz * move.x, mz = fz * move.y + fx * move.x;
    const ml = Math.hypot(mx, mz);
    const moving = ml > 0.05;
    if (ml > 1) { mx /= ml; mz /= ml; }
    this.running = moving && move.run;
    let sp = (this.running && !this.guard ? SPEED.run : SPEED.walk) * (this.strike ? 0.35 : 1) * (this.guard ? 0.45 : 1) * (this.speedMul ?? 1);
    if (ctl?.maxSpeed != null) sp = Math.min(sp, ctl.maxSpeed);           // 第十九轮：喝葫芦时只能缓步（也跳不起来）
    const k = damp(this.onGround ? 11 : 3, dt);
    if (ctl && ctl.vx != null) { this.vel.x = ctl.vx; this.vel.z = ctl.vz; }
    else {
      this.vel.x = lerp(this.vel.x, mx * sp, ctl?.lock ? damp(18, dt) : k);
      this.vel.z = lerp(this.vel.z, mz * sp, ctl?.lock ? damp(18, dt) : k);
    }

    // 水平移动：先试原方向；走不通时在两侧逐步偏转（20°～80°）找可走的方向，沿墙、崖边、水边与窄步道顺滑地滑过去，
    // 不在斜向的边界上卡死。每次尝试都连同碰撞推挤一起检查（被柱子推进水里的那一步不接受）
    const prevHeading = this.heading;
    const dx = this.vel.x * dt, dz = this.vel.z * dt;
    if (Math.hypot(dx, dz) > 1e-6 && !this.tryMove(this.pos.x + dx, this.pos.z + dz)) {
      let ok = false;
      for (const da of SLIDE) {
        const c = Math.cos(da), sn = Math.sin(da), k = Math.max(0.35, c);
        if (this.tryMove(this.pos.x + (dx * c - dz * sn) * k, this.pos.z + (dx * sn + dz * c) * k)) { ok = true; break; }
      }
      if (!ok) { this.vel.x *= 0.2; this.vel.z *= 0.2; }
    }
    // 静止时也推出碰撞体（被同门挡住等）；推挤后若落入不可行区域则退回
    const bx = this.pos.x, bz = this.pos.z;
    this.cw.pushCircle(this.pos, RADIUS, HEIGHT, STEP);
    if (!this.canEnter(this.pos.x, this.pos.z)) { this.pos.x = bx; this.pos.z = bz; }

    // 竖直：贴地 / 下落
    const g = this.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.05, STEP);
    // 走下台阶时 0.65 米内直接贴地；起跳后则落到地面才算着地（不在半空吸附）
    if (this.pos.y - g < (this.jumping ? 0.02 : 0.65) && this.vel.y <= 0.01) {
      this.pos.y = g; this.vel.y = 0; this.onGround = true; this.jumping = false;
    } else {
      this.vel.y -= GRAVITY * dt;
      this.pos.y += this.vel.y * dt;
      // 起跳撞到屋檐、门楣等底面
      if (this.vel.y > 0) {
        const c = this.cw.ceiling(this.pos.x, this.pos.z, this.pos.y + HEIGHT);
        if (this.pos.y + HEIGHT > c) { this.pos.y = c - HEIGHT; this.vel.y = 0; }
      }
      if (this.pos.y <= g) { this.pos.y = g; this.vel.y = 0; this.onGround = true; this.jumping = false; }
      else this.onGround = false;
    }
    const B = this.terrain.bounds || CORE;        // 当前所在场景（宗门 / 幽渊秘境）的边界；浮空岛上不夹取
    const onIsle = this.skyGround && this.skyGround(this.pos.x, this.pos.z, this.pos.y + 0.6) > -1e8;
    if (!onIsle) {
      this.pos.x = clamp(this.pos.x, B.x0 + 4, B.x1 - 4);
      this.pos.z = clamp(this.pos.z, B.z0 + 4, B.z1 - 4);
    }

    // 朝向：防御时始终面向镜头所对的方向（可边防边挪步）；否则朝移动方向
    if (ctl && ctl.yaw != null) this.heading = lerpAngle(this.heading, ctl.yaw, damp(ctl.turn ?? 18, dt));
    else if (ctl?.lock) { /* 出招中：朝向由招式定 */ }
    else if (this.guard && this.aimYaw != null) this.heading = lerpAngle(this.heading, this.aimYaw, damp(14, dt));
    else if (moving) this.heading = lerpAngle(this.heading, Math.atan2(mx, mz), damp(10, dt));
    else if (this.faceTarget) {
      const a = Math.atan2(this.faceTarget.x - this.pos.x, this.faceTarget.z - this.pos.z);
      this.heading = lerpAngle(this.heading, a, damp(6, dt));
    }
    const turn = wrapAngle(this.heading - prevHeading) / Math.max(dt, 1e-3);
    this.lastTurn = lerp(this.lastTurn, turn, 0.2);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.char.update(dt, this.pos, this.heading, {
      mode: 'walk', onGround: this.onGround, speed: hs, vel: this.vel, boost: 0, dun: 0,
      meditate: !!this.meditate, camPos, sprint: this.running && hs > 5.5, turn: this.lastTurn, strike: this.strike || null, guard: !!this.guard,
      drawn: this.drawn && !this.meditate, bladeGlow: this.bladeGlow, gather: !!this.gathering,
    });
    this.flight.pose(dt, camPos);
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  setVisible(v) { this.char.setVisible(v); }
}
