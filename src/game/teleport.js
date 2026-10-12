// 传送阵（第十三轮）：宗门一座（接引院西侧空地，近山门、不在甬道与殿门之前，也不在魔影袭山的路线上），
// 后方四座浮岛与通天塔岛各一座。走到阵上按 E 打开传送菜单（打开时释放鼠标锁定、角色停步），选目的地：
//   淡出 → 确认目标岛已就绪、到达点可站（岛面 / 地面取得到高度，不在碰撞体里，不在水里，周围平整）→
//   把人放在目标阵北侧的地面上（面朝岛上主景、塔门；到宗门时面朝问心阶）→ 镜头随之对齐 → 淡入。
// 同一时间只处理一次传送，抵达后 1.2 秒内不再启动（重复按键、连续点选都不会连传）；菜单关闭后回到原来的操作。
// 抵达点在阵台之外，不会一落地又站在阵上。传送阵不能把人送进塔内——塔门在塔前广场，按 E 入塔。
import * as THREE from 'three';
import { CAM } from '../actors/camera.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Teleport {
  // arrays：[{ id, name, desc, x, y, z, arrive: { x, z, yaw } }]，第一个是宗门
  constructor(game, arrays, { ground, veg = null } = {}) {
    this.g = game; this.ui = game.ui;
    this.arrays = arrays;
    this.ground = ground;           // (x, z, yTop) → 可站立面高度
    this.veg = veg;
    this.busy = false;
    this.coolUntil = 0;
    this.here = null;
  }

  addInteractions() {
    for (const a of this.arrays) {
      this.g.add({ id: 'portal-' + a.id, x: a.x, y: a.y, z: a.z, r: 4.2, h: 1.5,
        label: () => '启动 · 传送阵', sub: () => a.name, act: () => this.open(a.id) });
    }
  }

  open(fromId) {
    const g = this.g, ui = this.ui;
    if (this.busy) return;
    if (g.abyssQuest?.inv) { ui.toast('魔影袭山之时，传送阵灵光暂闭——先退敌。'); return; }
    this.here = fromId;
    const here = this.arrays.find((a) => a.id === fromId);
    const box = document.createElement('div');
    box.className = 'tp-menu';
    this.arrays.forEach((a, i) => {
      const b = document.createElement('button');
      b.className = 'tp' + (a.id === fromId ? ' here' : '');
      b.innerHTML = `<kbd>${i + 1}</kbd><span><strong>${a.name}</strong><small>${a.desc || ''}</small></span><em>${a.id === fromId ? '此处' : '传送'}</em>`;
      b.disabled = a.id === fromId;
      b.addEventListener('click', () => this.go(a.id));
      box.appendChild(b);
    });
    const note = document.createElement('p');
    note.className = 'tp-note';
    note.textContent = '选定后即传送，抵达后站在目的地传送阵北侧。数字键可直接选择；Esc 关闭。';
    box.appendChild(note);
    g.panelKind = 'teleport';
    ui.openPanel('传送阵', here ? here.name : '', box, { width: 620, onClose: () => { if (g.panelKind === 'teleport') g.panelKind = null; } });
  }

  // 菜单里按数字键
  pick(n) { const a = this.arrays[n - 1]; if (a && a.id !== this.here) this.go(a.id); }

  // 目标阵旁可站立的一点：先试到达点，再在 1.5、3 米的两圈上找
  safeSpot(dest) {
    const P = this.g.player, cw = this.g.cw, T = this.g.terrain;
    const { x: ax, z: az, yaw } = dest.arrive;
    const cands = [[0, 0]];
    for (const r of [1.5, 3]) for (let k = 0; k < 8; k++) cands.push([Math.cos((k / 8) * Math.PI * 2) * r, Math.sin((k / 8) * Math.PI * 2) * r]);
    const probe = new THREE.Vector3();
    for (const [dx, dz] of cands) {
      const x = ax + dx, z = az + dz;
      const g = this.ground(x, z, dest.y + 6);
      if (!(g > -1e8)) continue;
      const w = T.waterAt?.(x, z);
      if (w != null && w - g > 0.2) continue;
      let flat = true;
      for (const [ox, oz] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) if (!(Math.abs(this.ground(x + ox, z + oz, g + 1) - g) < 0.4)) { flat = false; break; }
      if (!flat) continue;
      probe.set(x, g, z);
      cw.pushCircle(probe, 0.36, 1.72, 0.46);
      if (Math.hypot(probe.x - x, probe.z - z) > 0.05) continue;     // 站在构件里
      void P;
      return { x, y: g, z, yaw };
    }
    return null;
  }

  async go(toId) {
    const g = this.g, ui = this.ui;
    if (this.busy || performance.now() < this.coolUntil || toId === this.here) return;
    const dest = this.arrays.find((a) => a.id === toId);
    if (!dest) return;
    this.busy = true;
    ui.closePanel();
    g.lock = true;
    if (g.meditating) g.endMeditate(true);
    if (g.channel) { g.channel = null; ui.hideChannel(); }
    const fade = document.querySelector('#fade');
    fade.classList.add('on');
    await wait(560);
    let ok = false;
    try {
      const spot = this.safeSpot(dest);
      if (spot) {
        g.player.place(spot.x, spot.z, spot.yaw, spot.y);
        g.player.strike = null;
        g.moves?.reset();                 // 正在出的剑招就此收住（免得拖尾从原处拉到目的地、踏步速度带过去）
        g.cam.set(spot.yaw, CAM.pitch, CAM.dist);
        g.cam.snap(new THREE.Vector3(spot.x, spot.y + 1.35, spot.z));
        this.veg?.update(g.player.pos, true);
        g.zone = { stale: true };
        g.updateZone();
        ok = true;
      }
    } catch (e) { console.error(e); }
    await wait(220);
    fade.classList.remove('on');
    g.lock = false;
    this.busy = false;
    this.here = null;
    this.coolUntil = performance.now() + 1200;
    if (ok) {
      ui.toast(`传送阵灵光一闪 · 抵达<b>${dest.name}</b>`);
      g.state.event('tp-' + dest.id, true);
    } else ui.toast('传送阵灵光不稳——目标阵台没有感应到落脚之处，未能传送');
  }
}
