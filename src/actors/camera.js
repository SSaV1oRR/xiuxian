// 第三人称跟随镜头（角色背后）。四样状态分开管理，互不覆盖：
//   yaw / pitch：只由鼠标（锁定后的移动量）、触屏拖动或明确的镜头指令改变——行走、上下台阶、地形与碰撞都不会改它们；
//   dist：滚轮缩放的期望距离；
//   碰撞距离：沿“跟随点 → 镜头”的方向检查地形、构筑物与场景边界，只缩短距离（立即），障碍解除后平滑恢复；
//   跟随点：角色头部，水平紧跟，竖直平滑过渡台阶与坡（保持玩家选定的观察角度）。
// 俯仰范围约 -31°（抬头）～ 66°（俯视），不会进入垂直俯视、倒置；镜头不入地。
import * as THREE from 'three';
import { clamp, lerp, damp, wrapAngle } from '../core/math.js';
import { GLOBAL } from '../world/shaderlib.js';

export const CAM = { pitchMin: -0.55, pitchMax: 1.15, distMin: 2.2, distMax: 22, pitch: 0.3, dist: 8, near: 0.75 };
const _dir = new THREE.Vector3(), _v = new THREE.Vector3(), _la = new THREE.Vector3();

export class FollowCamera {
  constructor(camera, dom, terrain) {
    this.camera = camera;
    this.dom = dom;
    this.terrain = terrain;
    this.yaw = Math.PI; this.pitch = CAM.pitch; this.dist = CAM.dist;
    this.zoomDist = this.dist;         // 缩放的平滑值
    this.colDist = this.dist;          // 实际使用的距离（碰撞后）
    this.focus = new THREE.Vector3();  // 跟随点（平滑后）
    this.enabled = true;
    this.sens = 1;
    this.shake = 0;
    this.kickP = new THREE.Vector3(); this.kickV = new THREE.Vector3();   // 第十七轮：打击的短位移（弹簧）
    this.blockRay = null;              // (o, d, maxT) → 构筑物命中距离
    this.limitHook = null;             // (o, d, maxT) → 场景空间允许的距离（如秘境洞壁）
    this.solidHook = null;             // (x, y, z) → 是否在实心体内（第十三轮：浮空岛、塔岛的岛体）
    this.pitchRange = null;            // 第二十一轮：[下限, 上限]（弧度）——凤翔天击的飞行阶段放宽到 ±80°；为 null 时用 CAM 的范围（超出的部分平滑收回）
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.enabled) this.zoom(e.deltaY * (e.deltaMode === 1 ? 30 : 1));
    }, { passive: false });
  }

  // 鼠标锁定下的移动量（像素）：水平转身，竖直俯仰；单次异常的大跳变直接丢弃（锁定瞬间偶发），不做加速与累积
  look(dx, dy) {
    if (!this.enabled) return;
    if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return;
    dy = clamp(dy, -150, 150);                      // 单次事件的俯仰改变量有上限：不会一下子翻到俯视
    const k = 0.0021 * this.sens, [lo, hi] = this.range();
    this.yaw = wrapAngle(this.yaw - dx * k);
    const np = this.pitch + dy * k;
    // 范围内照常夹住；刚撤掉放宽的范围、还在范围外时：只许往回转（由 update 平滑收回）
    if (this.pitch >= lo && this.pitch <= hi) this.pitch = clamp(np, lo, hi);
    else if (this.pitch < lo) { if (dy > 0) this.pitch = Math.min(np, hi); }
    else if (dy < 0) this.pitch = Math.max(np, lo);
  }
  range() { return this.pitchRange || [CAM.pitchMin, CAM.pitchMax]; }
  // 第二十一轮：镜头的瞄准方向（画面中心，三维单位向量）
  aimDir(out) { const cp = Math.cos(this.pitch); return out.set(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp); }
  // 触屏拖动
  rotate(dx, dy) {
    if (!this.enabled) return;
    const [lo, hi] = this.range();
    this.yaw = wrapAngle(this.yaw - dx * 0.0052 * this.sens);
    this.pitch = clamp(this.pitch + dy * 0.0042 * this.sens, Math.min(lo, this.pitch), Math.max(hi, this.pitch));
  }
  zoom(delta) {
    this.dist = clamp(this.dist * Math.exp(clamp(delta, -400, 400) * 0.0011), CAM.distMin, CAM.distMax);
  }
  // 水平朝向（移动以此为前方）
  forward() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }
  set(yaw, pitch, dist) {
    if (yaw != null) this.yaw = wrapAngle(yaw);
    if (pitch != null) { const [lo, hi] = this.range(); this.pitch = clamp(pitch, lo, hi); }
    if (dist != null) this.dist = clamp(dist, CAM.distMin, CAM.distMax);
  }
  // 特殊镜头（远眺、打坐、场景切换）前后保存与恢复第三人称状态
  getState() { return { yaw: this.yaw, pitch: this.pitch, dist: this.dist }; }
  setState(s) { if (s) this.set(s.yaw, s.pitch, s.dist); }
  // 打击：沿 dir（世界方向）推镜头 k 米左右的一下（立即给速度，弹簧拉回）
  kick(dir, k) { if (k > 0) this.kickV.addScaledVector(dir, k * 33); }        // 峰值约 0.4·k 米，1/30 秒到顶
  // 瞬移后立即对齐（不从旧位置滑过来）
  snap(target) {
    this.kickP.set(0, 0, 0); this.kickV.set(0, 0, 0);
    this.focus.copy(target);
    this.zoomDist = this.dist;
    this.colDist = this.limit(this.focus, this.dirOf(_dir), this.dist);
  }
  dirOf(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  // 沿跟随点 → 镜头方向允许的最大距离：地形（射线步进）、构筑物（碰撞世界的射线）、场景空间
  limit(o, dir, d) {
    let best = d;
    const T = this.terrain, n = Math.ceil(d / 0.3);
    for (let i = 1; i <= n; i++) {
      const s = (d * i) / n, x = o.x + dir.x * s, y = o.y + dir.y * s, z = o.z + dir.z * s;
      if (y < T.heightAt(x, z) + 0.35 || (this.solidHook && this.solidHook(x, y, z))) { best = s - 0.3; break; }
    }
    if (this.blockRay) best = Math.min(best, this.blockRay(o, dir, best) - 0.3);
    if (this.limitHook) best = Math.min(best, this.limitHook(o, dir, best));
    return Math.max(CAM.near, best);
  }

  update(dt, target, player) {
    // 跟随点：水平紧跟；竖直平滑（台阶一级 0.2 米不颠簸，大的高差也在半秒左右跟上）。
    // 御剑时竖直也紧跟（升降连续，不做大落差的瞬间对齐，免得镜头跳变）
    const flying = !!player?.flying;
    const kh = damp(16, dt), kv = damp(flying ? 14 : 7, dt);
    // 第二十一轮：放宽的俯仰范围撤掉后，超出常规范围的部分平滑收回（约 0.3 秒）
    if (!this.pitchRange) {
      if (this.pitch < CAM.pitchMin) this.pitch = Math.min(CAM.pitchMin, this.pitch + Math.max((CAM.pitchMin - this.pitch) * damp(8, dt), 0.3 * dt));
      else if (this.pitch > CAM.pitchMax) this.pitch = Math.max(CAM.pitchMax, this.pitch - Math.max((this.pitch - CAM.pitchMax) * damp(8, dt), 0.3 * dt));
    }
    this.focus.x = lerp(this.focus.x, target.x, kh);
    this.focus.z = lerp(this.focus.z, target.z, kh);
    this.focus.y = lerp(this.focus.y, target.y, kv);
    if (!flying && Math.abs(this.focus.y - target.y) > 6) this.focus.y = target.y;     // 跳下高处等大落差：不长时间拖在半空
    this.zoomDist = lerp(this.zoomDist, this.dist, damp(8, dt));
    // 碰撞：只改距离。挡住时快速缩近（约 0.2 秒，避免越过山脊、檐角时一帧跳变），障碍解除后平滑拉回；
    // 缩近途中镜头仍不低于地面（下方的保险）
    const dir = this.dirOf(_dir);
    const allow = this.limit(this.focus, dir, this.zoomDist);
    this.colDist = lerp(this.colDist, allow, damp(allow < this.colDist ? 10 : 2.6, dt));
    let d = this.colDist;
    const pos = this.camera.position.copy(this.focus).addScaledVector(dir, d);
    // 镜头低于地面（缩近的过渡途中、下坡下台阶时身后的坡面）：沿视线向角色拉近，而不是把镜头往上抬——
    // 往上抬会改变观察角度，看起来就像突然切成了俯视。俯仰始终是玩家自己定的角度
    const below = (p) => p.y < this.terrain.heightAt(p.x, p.z) + 0.25 || (this.solidHook ? this.solidHook(p.x, p.y, p.z) : false);
    if (below(pos)) {
      let lo = CAM.near, hi = d;
      for (let i = 0; i < 10; i++) {
        const m = (lo + hi) / 2;
        _v.copy(this.focus).addScaledVector(dir, m);
        if (below(_v)) hi = m; else lo = m;
      }
      d = lo; this.colDist = Math.min(this.colDist, d);
      pos.copy(this.focus).addScaledVector(dir, d);
      const gy = this.terrain.heightAt(pos.x, pos.z) + 0.25;
      if (pos.y < gy) pos.y = gy;                    // 最后的保险（只在贴着陡壁、拉到最近仍入地时才会用到）
    }
    // 实际的观察俯仰（供自检：应始终等于 this.pitch）
    this.effPitch = Math.asin(clamp((pos.y - this.focus.y) / Math.max(1e-3, pos.distanceTo(this.focus)), -1, 1));
    // 视线落在跟随点略上方：角色位于画面中下部；抬头时自然看向天空
    _la.set(this.focus.x, this.focus.y + 0.3, this.focus.z);
    this.camera.lookAt(_la);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const k = this.shake * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * k; this.camera.position.y += (Math.random() - 0.5) * k;
    }
    // 第十七轮：打击的短位移——沿打击方向推一下，弹簧（临界阻尼）约 0.12 秒归零；只平移镜头，不改观察方向、不累积倾斜
    const KP = this.kickP, KV = this.kickV;
    if (KP.lengthSq() > 1e-8 || KV.lengthSq() > 1e-8) {
      // 临界阻尼弹簧的精确解：p(t) = (p0 + (v0 + ω p0) t) e^{-ωt}
      const w = 30, h = dt, e = Math.exp(-w * h);
      _v.copy(KV).addScaledVector(KP, w);
      KP.addScaledVector(_v, h).multiplyScalar(e);
      KV.addScaledVector(_v, -w * h).multiplyScalar(e);
      if (KP.length() > 0.28) KP.setLength(0.28);
      if (KP.lengthSq() < 1e-8 && KV.lengthSq() < 1e-6) { KP.set(0, 0, 0); KV.set(0, 0, 0); }
      this.camera.position.add(KP);
    }
    // 镜头贴得太近时隐去角色，免得挡住视线（只在状态变化时切换）
    const hide = d < 0.95;
    if (player && hide !== !!this._hid) { this._hid = hide; player.char.setVisible(!hide); }
    this.curDist = d;

    // 角色屏幕位置与视深（树冠、墙体遮挡镂空）
    if (player) {
      const v = _v.set(player.pos.x, player.pos.y + 1.0, player.pos.z);
      this.camera.updateMatrixWorld();
      const depth = v.clone().applyMatrix4(this.camera.matrixWorldInverse).z * -1;
      v.project(this.camera);
      const size = this.sizeCache || (this.sizeCache = new THREE.Vector2());
      this.renderer?.getDrawingBufferSize(size);
      const r = (2.2 / (Math.max(depth, 0.1) * Math.tan((this.camera.fov * Math.PI) / 360))) * (size.y / 2);
      GLOBAL.uCut.value.set((v.x * 0.5 + 0.5) * size.x, (v.y * 0.5 + 0.5) * size.y, depth, Math.max(24, r));
      GLOBAL.uCutFoot.value = player.pos.y + 0.35;
    }
  }
}
