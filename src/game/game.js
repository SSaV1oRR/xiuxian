// 宗门日常：人物与对话、互动点、委托（接取—采集—提交）、探索发现、藏经阁阅读、后山奇遇、舆图与行记
import * as THREE from 'three';
import { NPC, Fox } from '../actors/npc.js';
import { NPCS, ITEMS, BOOKS, INTERIORS } from './data.js';
import { ZONES, SITES, SECT_NAME } from '../world/layout.js';
import { drawFullMap } from '../ui/mapdraw.js';
import { damp, lerp, clamp } from '../core/math.js';
import { AbyssQuest } from './abyssQuest.js';
import { AlchemyRoom } from './alchemyRoom.js';
import { HallRoom } from './hallRoom.js';
import { TowerRoom } from './towerRoom.js';
import { PLAYER_COMBAT, PLAYER_MOVES, PHOENIX } from './combatConfig.js';
import { MEDITATE, ASCEND, LEVEL, FLIGHT } from './progressConfig.js';
import { totalNeed, realmLabel, realmOf } from './progression.js';
import { ProgressHud, cultivationPanel } from '../ui/progressHud.js';
import { HALL, levelAt } from '../world/hallSpec.js';
import { openSwordPanel } from '../ui/swordPanel.js';
import { openLoadoutPanel } from '../ui/loadoutPanel.js';

const TIERS = {
  gate: '山门 · 接引台', reception: '山门 · 接引台', wenxin: '问心阶',
  plaza: '中院 · 演武广场', lingyun: '中院 · 凌云阁', dorm: '中院 · 西翼', dining: '中院 · 西翼', alchemy: '中院 · 东翼', field: '中院 · 东翼', pond: '中院 · 东翼',
  dengyun: '登云阶', court: '上院', library: '上院 · 西', viewpoint: '上院 · 东',
  tianjie: '天阶', hall: '云顶', steles: '天阶 · 西台', teahouse: '天阶 · 东台', bell: '天阶 · 西台', pinerest: '天阶 · 东台',
  bamboo: '西支路 · 竹林溪涧', tablet: '西支路 · 竹林溪涧', backhill: '东支路 · 后山', pavilion: '东支路 · 后山', den: '东支路 · 后山',
  icedragon: '西支路 · 寒潭', firedragon: '上院 · 东 · 观云台外',
  lingxiao: '后方浮岛', qixia: '后方浮岛', lanyue: '后方浮岛', songtao: '后方浮岛', tongtian: '通天塔岛 · 塔前广场',
};
// 不在命名区域内时，按位置给出所在的进与支路
function placeOf(x, z) {
  if (x < -140 || x > 140 || z < -275 || z > 190) return ['云海', '宗门之外 · 群峰之间'];   // 第十三轮：御剑出了宗门
  if (x < -84) return ['竹林', '西支路 · 竹林溪涧'];
  if (x > 58 && z < -96) return ['后山', '东支路 · 后山'];
  if (z > 66) return ['山门', '山门 · 接引台'];
  if (z > -46) return ['中院', x < -32 ? '中院 · 西翼' : x > 32 ? '中院 · 东翼' : '中院 · 演武广场'];
  if (z > -104) return ['上院', '上院'];
  return z > -164 ? ['天阶', '天阶'] : ['云顶', '云顶'];
}
const HERB_NEED = 5;
// 请求落地却找不到安全落点时的说明（按原因）
const FLIGHT_WHY = {
  high: (f) => `离地还有约 ${Math.round(f.lastH ?? 0) || '数十'} 米——先按 C 降低高度，再按 F 落地`,
  water: () => '下方是水面，换一处平地再落',
  roof: () => '下方是屋顶、塔身或墙头，飞离建筑、到平地上方再落',
  blocked: () => '正下方有屋檐、树干或人挡着，挪开一点再落',
  steep: () => '下方太陡，换一处平地再落',
  cramped: () => '下方四面有栏杆、陡坎围着，落下去走不出来，换一处再落',
  edge: () => '离岛沿太近，往岛中间飞一些再落',
  out: () => '下方是山野深谷，不在宗门与空岛之内，不能落脚',
};

export class Game {
  constructor({ scene, camera, renderer, cw, terrain, ctx, player, cam, input, ui, state, baseMap, sky, towerIsle = null }) {
    Object.assign(this, { scene, camera, renderer, cw, terrain, ctx, player, cam, input, ui, state, baseMap, sky, towerIsle });
    this.items = [];
    this.npcs = {};
    this.zone = null;
    this.channel = null;
    this.scenic = null;
    this.labels = new Map();
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'npc-labels';
    document.querySelector('#hud').appendChild(this.labelLayer);
    this.v = new THREE.Vector3();
    this.zoneT = 0;
    this.progHud = new ProgressHud();      // 第二十一轮：境界徽记、聚气进度、凤翔天击的准星
    this.prog = null;                      // 第二十一轮：修为（main.js 接上）
    this.asc = null;                       // 第二十一轮：提升修为的演出状态
    this.flyT = 0; this.flyRest = 0;       // 第二十一轮：筑基御剑的续航与落地后的歇息
    this.trackerKey = '';
    this.world = 'surface';                 // 当前场景：surface 宗门 / abyss 幽渊秘境 / alchemy 丹房室内 / hall 问道殿室内 / tower 通天塔一层
    this.abyssQuest = new AbyssQuest(this);
    this.alchemyRoom = new AlchemyRoom(this);
    this.hallRoom = new HallRoom(this);
    this.towerRoom = new TowerRoom(this);
    this.ctx.abyssGate?.setOpen(this.abyssQuest.isOpen());
    this.createNPCs();
    this.createFox();
    this.createInteractions();
    this.bindKeys();
    this.updateTracker(true);
  }

  // ---------- 人物 ----------
  createNPCs() {
    for (const d of NPCS) {
      // 站在实际地面上（田埂、演武台等构筑物顶面）
      const gy = Math.max(this.terrain.heightAt(d.x, d.z), this.cw.ground(d.x, d.z, d.y + 0.8, 1.2));
      if (Math.abs(gy - d.y) > 0.04) d.y = +gy.toFixed(3);
      const n = new NPC(this.scene, d);
      this.npcs[d.id] = n;
      this.cw.addCyl({ x: d.x, z: d.z, y0: d.y, y1: d.y + 1.8, r: 0.38 });
      const label = document.createElement('div');
      label.className = 'npc-label';
      label.innerHTML = `<i class="mk"></i><b>${d.name}</b><em>${d.title}</em>`;
      this.labelLayer.appendChild(label);
      this.labels.set(d.id, label);
      this.add({ id: 'npc-' + d.id, x: d.x, y: d.y, z: d.z, r: 2.6, h: 2.25, label: () => (d.id === 'jiaoxi' ? `演武切磋 · ${d.name}` : `交谈 · ${d.name}`), act: () => this.talkTo(d.id), npc: d.id });
    }
  }
  createFox() {
    this.fox = new Fox(this.scene);
    if (this.state.event('fox')) {
      const d = SITES.den;
      this.fox.place(d.x - 1.6, this.terrain.heightAt(d.x - 1.6, d.z + 1.2), d.z + 1.2, 2.4);
      this.fox.root.visible = true;
      this.fox.state = 'sit';
    }
  }
  speaker(id) { const d = NPCS.find((n) => n.id === id); return { name: d.name, title: d.title }; }

  // ---------- 互动点 ----------
  add(it) { this.items.push({ r: 2.2, h: 1.9, ...it }); }

  createInteractions() {
    const A = this.ctx.anchors, S = this.state;
    if (A.guide) this.add({ id: 'guide', ...A.guide, label: () => '观看 · 宗门导览', act: () => this.openMap(true) });
    if (A.stele) this.add({ id: 'stele', ...A.stele, r: 2.4, label: () => '阅读 · 青岚宗记', act: () => this.readStele() });
    if (A.tea) this.add({ id: 'tea', ...A.tea, label: () => '饮茶 · 茶亭', act: () => {
      this.ui.toast('山茶清苦，回甘悠长。<b>精神一振</b>');
      this.ui.talk({ name: '茶亭', title: '' }, [{ who: 'narr', text: '石桌上一把粗陶壶，四只白瓷盏，亭外风炉上的铜壶还冒着热气。茶汤微黄，入口清苦，过一会儿舌根才泛起回甘。桌角压着一张字条：「来客自取，盏用毕请置于桌心。」' }]);
    } });
    if (A.notice) this.add({ id: 'notice', ...A.notice, r: 2.6, h: 2.6, label: () => '查看 · 委托告示', sub: () => (S.herb.stage === 0 ? '新委托' : ''), act: () => this.openNotice() });
    for (const hb of A.herbs || []) {
      if (S.d.picked.includes(hb.id)) hb.mesh.visible = false;
      this.add({ id: hb.id, x: hb.x, y: hb.y, z: hb.z, r: 1.35, h: 0.9, hold: 1.1, kind: 'herb',
        enabled: () => !S.d.picked.includes(hb.id),
        label: () => (S.herb.stage === 1 ? '采集 · 清露草' : '查看 · 清露草'),
        sub: () => (S.herb.stage === 1 ? '按住片刻' : ''),
        holdIf: () => S.herb.stage === 1,
        act: () => this.pickHerb(hb) });
    }
    if (A.alchemyDoor) this.add({ id: 'alchemyDoor', ...A.alchemyDoor, label: () => '入内 · 丹房', act: () => this.openInterior('alchemy') });
    if (A.dormDoor) this.add({ id: 'dormDoor', ...A.dormDoor, label: () => '入内 · 竹院寝舍', act: () => this.openInterior('dorm') });
    if (A.diningDoor) this.add({ id: 'diningDoor', ...A.diningDoor, label: () => '入内 · 膳堂', act: () => this.openInterior('dining') });
    if (A.steles) this.add({ id: 'steles', ...A.steles, r: 3.0, h: 2.2, label: () => '观碑 · 历代掌门', act: () => this.readSteles() });
    if (A.teaPav) this.add({ id: 'teaPav', ...A.teaPav, r: 2.6, h: 1.6, label: () => '歇脚 · 半山茶亭', act: () => {
      this.ui.toast('在亭中歇了口气，山风送来松香。<b>脚力恢复</b>');
      this.ui.talk({ name: '半山茶亭', title: '' }, [{ who: 'narr', text: '石桌上一只粗陶壶，壶下压着字条：「登天阶者，到此可饮一杯。」茶已微凉，却很解渴。从亭中望去，登天廊的屋瓦一层层叠向云顶。' }]);
    } });
    if (A.bell) this.add({ id: 'bell', ...A.bell, r: 2.8, h: 2.2, label: () => '撞钟 · 钟亭', act: () => this.ringBell() });
    if (A.pineRest) this.add({ id: 'pineRest', ...A.pineRest, r: 3.0, h: 1.6, label: () => '凭栏 · 松风台', act: () => this.scenicView({ free: true, pos: [30, 58, -150], at: [-5, 18, 10], pan: 0.35, text: '松风台远眺：登天廊叠落而下，上院、凌云阁与演武广场一层低过一层，云海在山门外铺开。（任意键返回）' }) });
    if (A.hallDoor) this.add({ id: 'hallDoor', ...A.hallDoor, r: 3, h: 2.6, label: () => '入殿 · 问道殿', act: () => this.openInterior('hall') });
    if (A.libraryDoor) this.add({ id: 'libraryDoor', ...A.libraryDoor, r: 2.6, label: () => '翻阅 · 藏经阁典籍', act: () => this.openLibrary() });
    if (A.well) this.add({ id: 'well', ...A.well, label: () => '汲水 · 水井', act: () => this.ui.toast('井水清冽，映着一小片天。') });
    if (A.lookout) this.add({ id: 'lookout', ...A.lookout, r: 3.0, h: 2.0, label: () => '凭栏 · 灵池观云台', act: () => this.scenicView({ free: true, pos: [60.5, 19.5, 55], at: [30, -4, 120], pan: 0.32, text: '观云台凭栏：脚下是灵池台的岩壁，谷底薄雾里立着几根石柱，山门前庭的岩台与问心阶在西边一层层叠上去。（任意键返回）' }) });
    if (A.viewRock) this.add({ id: 'viewRock', ...A.viewRock, r: 3.2, label: () => '凭栏 · 观云', act: () => this.scenicView({ yaw: 0.25, pitch: 0.34, dist: 26, text: '凭栏远眺：广场白石、凌云阁宝顶与两翼屋瓦层层叠叠，云海接天。（任意键返回）' }) });
    if (A.meditate) this.add({ id: 'meditate', ...A.meditate, r: 2.0, h: 1.4, label: () => (this.meditating ? '起身' : '打坐 · 聚灵阵'), sub: () => (this.meditating ? '' : '吐纳调息'), act: () => (this.meditating ? this.endMeditate() : this.startMeditate('array')) });
    // 灵池池心的静修台：同一套吐纳规则，灵光自池面汇聚
    if (A.meditatePool) this.add({ id: 'meditatePool', ...A.meditatePool, r: 2.2, h: 1.4, label: () => (this.meditating ? '起身' : '静修 · 灵池'), sub: () => (this.meditating ? '' : '池心静坐，引水灵之气'), act: () => (this.meditating ? this.endMeditate() : this.startMeditate('pool')) });
    if (A.lingyun) this.add({ id: 'lingyun', ...A.lingyun, r: 3.0, h: 2.6, label: () => '登阁 · 凌云阁', act: () => this.scenicView({ free: true, pos: [0, 34.5, -21.5], at: [0, 12, 40], pan: 0.42, text: '凭阁远眺：广场、回廊、钟鼓二楼与山门牌楼次第铺开。（任意键返回）' }) });
    if (A.summitView) this.add({ id: 'summitView', ...A.summitView, r: 3.0, h: 2.0, label: () => '凭栏 · 回望宗门', act: () => this.scenicView({ free: true, pos: [0, 74, -158], at: [0, 16, 20], pan: 0.3, text: '云顶回望：天阶如练，殿阁一进低过一进，直落到山门外的溪桥。（任意键返回）' }) });
    if (A.tablet) this.add({ id: 'tablet', ...A.tablet, r: 2.8, h: 2.4, label: () => (S.found('tablet') ? '细读 · 古碑' : '拨开藤蔓 · 石碑'), act: () => this.readTablet() });
    if (A.pavilion) this.add({ id: 'pavilion', ...A.pavilion, r: 3.0, h: 2.2, label: () => (S.event('fox') ? '小憩 · 听松亭' : '凭栏小憩 · 听松亭'), act: () => this.restPavilion() });
    if (A.den) this.add({ id: 'den', ...A.den, r: 3.2, h: 1.2, enabled: () => !!S.event('fox'), label: () => '轻唤 · 灵狐', act: () => this.petFox() });
    if (A.foxSign) this.add({ id: 'foxSign', ...A.foxSign, r: 2.6, h: 1.0, enabled: () => !S.event('fox'), label: () => '查看 · 雪白的毛', act: () => this.ui.talk({ name: '灌木丛', title: '' }, [{ who: 'narr', text: '灌木的枝杈上挂着几缕雪白的细毛，地上有一串小小的梅花爪印，一路延向西边的山亭。' }]) });
    // 护宗双龙（友好）：拜见时龙首转向来人，呼出一口寒气 / 火息
    if (A.dragonIce) this.add({ id: 'dragonIce', ...A.dragonIce, r: 3.4, h: 3.0, label: () => '拜见 · 冰龙', act: () => this.greetDragon('ice') });
    if (A.dragonFire) this.add({ id: 'dragonFire', ...A.dragonFire, r: 3.4, h: 3.0, label: () => '拜见 · 火龙', act: () => this.greetDragon('fire') });
    // 幽渊秘境：残碑、石门（发现前不显示在舆图上）与秘境中的出口、祭坛
    this.abyssQuest.addInteractions();
    // 丹房室内（坐标在室内场景里，同样远低于地表）
    this.alchemyRoom.addInteractions();
    // 问道殿室内（与宗门共用坐标：互动点标 world: 'hall'，只在殿内可见；殿内也不显示宗门的互动点）
    this.hallRoom.addInteractions();
    // 通天塔（第十三轮）：塔门（宗门地表）与塔内一层（标 world: 'tower'）
    this.towerRoom.addInteractions();
  }
  threatFor(d) { return this.abyssQuest.threatFor(d); }
  alertFor(d) { return this.abyssQuest.alertFor(d); }

  // 力竭：宗门中回到上院香炉前（同门已料理伤势），秘境中回到入口洞室（殿中之战重来）
  playerDown() {
    const fade = document.querySelector('#fade');
    this.lock = true;
    if (this.channel) { this.channel = null; this.ui.hideChannel(); }
    this.ui.toast('气血耗尽，眼前一黑……');
    fade.classList.add('dark', 'on');
    setTimeout(async () => {
      if (this.world === 'alchemy' || this.world === 'hall') await this.switchWorld('surface');
      if (this.world === 'abyss') {
        this.abyssQuest.resetTrial();
        const e = this.abyss.entry;
        this.player.place(e.x, e.z, e.yaw, e.y);
      } else this.player.place(0, -78.5, 0);
      this.player.strike = null;
      this.cam.set(this.player.heading, null, null);
      this.combat.revive();
      this.moves?.refillGourd();                          // 第十九轮：回血葫芦装满
      fade.classList.remove('on');
      setTimeout(() => fade.classList.remove('dark'), 1500);
      this.lock = false;
      this.ui.toast(this.world === 'abyss' ? '……魔气退去，你在入口洞室里醒来。殿中的魔修又聚了起来。' : '……醒来时，伤势已被同门料理妥当。');
      this.updateTracker(true);
    }, 1600);
  }

  nearest() {
    const p = this.player.pos;
    if (this.player.flying) return null;            // 御剑时不交互（先落地）
    let best = null, bs = Infinity;
    // 互动点所属的场景：标了 world 的（问道殿、通天塔室内）只在该场景里可见；其余在宗门地表（丹房、秘境的互动点坐标本就远离地表）
    const own = this.world === 'hall' || this.world === 'tower' || this.world === 'boss50' || this.world === 'boss30';
    for (const it of this.items) {
      if (it.world ? it.world !== this.world : own) continue;
      if (it.enabled && !it.enabled()) continue;
      const dx = it.x - p.x, dz = it.z - p.z, d = Math.hypot(dx, dz);
      if (d > it.r || Math.abs(it.y - p.y) > 2.6) continue;
      const a = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - this.player.heading), Math.cos(Math.atan2(dx, dz) - this.player.heading)));
      const s = d + (a > 1.4 ? 1.2 : 0) + (it.npc ? -0.2 : 0);
      if (s < bs) { bs = s; best = it; }
    }
    return best;
  }

  screen(x, y, z) {
    const v = this.v.set(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
  }

  // ---------- 御剑（第十三轮）----------
  // 地上：起飞（只在宗门地表、开阔处）；空中：找安全落点降落，找不到则继续飞并说明原因
  toggleFlight() {
    const P = this.player, ui = this.ui;
    if (this.world !== 'surface') { ui.toast(this.world === 'hall' || this.world === 'alchemy' || this.world === 'tower' ? '屋里施展不开，出门再御剑' : this.world === 'boss50' ? '封印殿中灵压沉重，御剑之术施展不出（回到宗门自会复原）' : this.world === 'boss30' ? '剑台四下是余烬深渊，烬火的热浪托不住飞剑（回到宗门自会复原）' : '此处灵气紊乱，不能御剑'); return; }
    if (this.meditating) { ui.toast('正在打坐——先起身（E）再御剑'); return; }
    if (this.arena?.active) { ui.toast('切磋之中不能御剑——按 <b>退格</b> 退出切磋'); return; }
    if (this.channel) return;
    // 第二十一轮：御剑按境界——练气不能；筑基短续航（落地后歇一会儿才能再起）；金丹以上长续航（照旧）
    const fc = this.prog?.flightClass?.() || 'long';
    if (!P.flying && fc === 'none') { ui.toast(`练气修士尚不能御剑（${realmLabel(this.prog.level)}；筑基之后可以）`); return; }
    if (!P.flying && fc === 'short' && this.flyRest > 0) { ui.toast(`真元未复，${Math.ceil(this.flyRest)} 秒后可再御剑（筑基短续航）`); return; }
    if (P.flying) {
      const why = P.flight.land();
      if (why) ui.toast(FLIGHT_WHY[why]?.(P.flight) || '这里不能落地');
      else ui.toast('寻得落点 · 收剑下落（空格可取消）');
      return;
    }
    const why = P.flight.takeoff();
    if (why) { ui.toast(why); return; }
    this.flyT = 0;
    if (fc === 'short') ui.toast(`御剑而起 · 筑基短续航：每次至多 ${FLIGHT.short.secs} 秒`);
    if (!this.state.event('flight')) {
      this.state.event('flight', true);
      ui.banner('御剑', '空格上升 · C 下降 · Shift 加速 · F 落地');
    } else ui.toast('御剑而起');
  }

  // ---------- 按键 ----------
  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat && e.code !== 'KeyE') return;
      const ui = this.ui;
      if (this.scenic && (e.code !== 'KeyE' || !e.repeat)) { this.endScenic(); return; }
      if (ui.dlg) { ui.key(e.code); this.input.pressed.delete(e.code); e.preventDefault(); return; }
      if (ui.panelOpen) {
        if (this.panelKind === 'teleport' && /^Digit[1-9]$/.test(e.code)) { this.teleport?.pick(+e.code.slice(5)); return; }
        if (e.code === 'Escape' || (e.code === 'KeyM' && this.panelKind === 'map') || (e.code === 'KeyJ' && this.panelKind === 'journal') || (e.code === 'KeyB' && this.panelKind === 'bag') || (e.code === 'KeyK' && this.panelKind === 'skills') || (e.code === 'KeyP' && this.panelKind === 'swords') || (e.code === 'KeyL' && this.panelKind === 'cultivation')) ui.closePanel();
        return;
      }
      // 第二十五轮：终式的处决演出中——空格 / E 跳过（同一个终结入口）；Esc 照常打开设置（暂停演出）；其余键（剑诀面板、行囊、舆图、退格放弃……）一律不进
      if (this.finale?.active && this.finale.key(e.code)) return;
      if (this.boss50?.active && this.boss50.key(e.code)) return;
      if (this.boss30?.active && this.boss30.key(e.code)) return;    // 第二十四轮：第三十层——看过的过场可跳过；战斗中退格放弃挑战    // 第十六轮：第五十层——过场中空格 / Esc / E 跳过；战斗中退格放弃挑战（第二十三轮起，X 是剑诀槽键）
      if (this.lock) return;
      if (this.arena?.active && this.arena.key(e.code)) return;      // 切磋中：退格退出；自由练习 H、U
      if (e.code === 'KeyE') { if (!e.repeat) this.interact(); }
      else if (e.code === 'KeyM') this.openMap();
      else if (e.code === 'KeyJ') this.openJournal();
      else if (e.code === 'KeyB') this.openBag();
      else if (e.code === 'KeyK') this.openSkills();
      else if (e.code === 'KeyP') this.openSwords();
      else if (e.code === 'KeyL') this.openCultivation();
      else if (e.code === 'Escape') { if (!document.pointerLockElement && !this.pointer?.justUnlocked()) this.openSettings(); }
    });
    window.addEventListener('keyup', (e) => { if (e.code === 'KeyE' && this.channel) this.channel.release = true; });
    document.querySelectorAll('#menu-btns button').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.open;
      if (this.finale?.active && k !== 'settings') return;           // 第二十五轮：处决演出中不开面板（不许换装）；设置照常（暂停演出）
      if (this.ui.panelOpen) this.ui.closePanel();
      if (k === 'map') this.openMap(); else if (k === 'journal') this.openJournal(); else if (k === 'bag') this.openBag(); else if (k === 'skills') this.openSkills(); else if (k === 'cultivation') this.openCultivation(); else this.openSettings();
    }));
    document.querySelector('#minimap').addEventListener('click', () => this.openMap());
    document.querySelector('#tracker').addEventListener('click', () => this.openJournal());
    const act = document.querySelector('#touch .act');
    act && act.addEventListener('click', () => { if (this.ui.dlg) this.ui.advance(); else this.interact(); });
  }

  interact() {
    if (this.scenic) { this.endScenic(); return; }
    if (this.channel) return;
    if (this.player.flying) { this.ui.toast('御剑之中——先按 <b>F</b> 落地，再交谈、开门或启动阵法'); return; }
    if (this.arena?.active) { this.ui.toast('切磋之中——按 <b>退格</b> 退出后再交谈'); return; }
    if (this.boss50?.fighting || this.boss30?.fighting) return;
    const it = this.nearest();
    if (!it) return;
    if (it.hold && (!it.holdIf || it.holdIf())) { this.channel = { it, t: 0 }; return; }
    it.act();
  }

  // ---------- 每帧 ----------
  update(dt) {
    const p = this.player.pos, cp = this.camera.position, surface = this.world === 'surface' || this.world === 'hall';   // 殿内看得见窗外的同门
    for (const id in this.npcs) {
      if (!surface) break;
      const n = this.npcs[id];
      // 离镜头 70 米以外的弟子不绘制，也不推进动作；35 米以外不投影
      const dc = Math.hypot(cp.x - n.pos.x, cp.z - n.pos.z);
      n.root.visible = dc < 70 && !n.showHidden;          // 第二十五轮：终式的处决演出中，演出空间里的同门暂时隐去（不挡机位；结束复原）
      if (!n.root.visible) continue;
      if (n.castsShadow !== dc < 35) { n.castsShadow = dc < 35; n.root.traverse((o) => { if (o.isMesh) o.castShadow = n.castsShadow; }); }
      const near = Math.hypot(p.x - n.pos.x, p.z - n.pos.z) < 6;
      n.update(dt, p, near);
    }
    if (surface) this.fox.update(dt, (x, z) => Math.max(this.terrain.heightAt(x, z), this.cw.ground(x, z, this.terrain.heightAt(x, z) + 1.5, 2)));
    this.abyssQuest.update(dt);
    this.alchemyRoom.update(dt);
    this.hallRoom.update(dt);
    this.towerRoom.update(dt);
    if (this.meditating) this.updateMeditate(dt);
    if (this.asc) this.updateAscend(dt);
    this.updateFlightRule(dt);
    this.updateProgHud();
    this.input.moveLocked = this.ui.busy || !!this.lock || !!this.scenic || !!this.arena?.blockMove || !!this.boss50?.blockMove || !!this.boss30?.blockMove;
    this.player.faceTarget = this.ui.dlg && this.talkNPC ? this.npcs[this.talkNPC]?.pos : null;
    // 互动提示 / 采集读条
    const it = this.ui.busy || this.lock || this.scenic ? null : this.nearest();
    if (this.channel) {
      const c = this.channel, h = c.it;
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d > h.r + 0.4 || this.player.speed > 1.2) { this.channel = null; this.ui.hideChannel(); this.ui.toast(h.breakText || '采集中断'); }
      else {
        c.t += dt;
        const s = this.screen(h.x, h.y + h.h, h.z);
        if (s) this.ui.showChannel(s[0], s[1] - 30, c.t / h.hold, h.holdText || '采集中……');
        if (c.t >= h.hold) { this.channel = null; this.ui.hideChannel(); h.act(); }
      }
      this.ui.hidePrompt();
    } else if (it) {
      const s = this.screen(it.x, it.y + it.h, it.z);
      if (s) this.ui.showPrompt(s[0], s[1], it.label(), it.sub ? it.sub() : '');
      else this.ui.hidePrompt();
    } else this.ui.hidePrompt();
    this.updateLabels();
    this.zoneT -= dt;
    if (this.zoneT <= 0) { this.zoneT = 0.25; this.updateZone(); }
    if (this.scenic) this.updateScenic(dt);
  }

  updateLabels() {
    const p = this.player.pos, S = this.state;
    if (this.world !== 'surface') { for (const el of this.labels.values()) el.style.display = 'none'; return; }
    const marks = this.questMarks();
    for (const [id, el] of this.labels) {
      const n = this.npcs[id];
      const d = Math.hypot(p.x - n.pos.x, p.z - n.pos.z);
      const show = d < 18 && !(this.ui.dlg && this.talkNPC === id);
      const s = show ? this.screen(n.pos.x, n.pos.y + 2.05 * (n.def.look?.scale ?? 1), n.pos.z) : null;
      if (!s) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.transform = `translate(${Math.round(s[0])}px, ${Math.round(s[1])}px) translate(-50%, -100%)`;
      el.style.opacity = d < 12 ? 1 : 1 - (d - 12) / 6;
      const mk = marks[id] || '';
      if (el.dataset.mk !== mk) { el.dataset.mk = mk; el.querySelector('.mk').textContent = mk; el.classList.toggle('has-mk', !!mk); }
    }
    void S;
  }

  npcDef(id) { return NPCS.find((n) => n.id === id); }
  // 清露草所在畦的中心
  herbCenter() {
    const hs = this.ctx.anchors.herbs || [];
    if (!hs.length) return { x: 0, z: 0 };
    return { x: hs.reduce((a, h) => a + h.x, 0) / hs.length, z: hs.reduce((a, h) => a + h.z, 0) / hs.length };
  }
  mapTargets() {
    const S = this.state, h = S.herb.stage, lin = this.npcDef('lin'), su = this.npcDef('su');
    if (h === 0) return S.talked('lin') ? [{ x: SITES.notice.x, z: SITES.notice.z, icon: '!' }] : [{ x: lin.x, z: lin.z, icon: '!' }];
    if (h === 1) return [{ ...this.herbCenter(), icon: '采', color: '#4f7f72' }];
    if (h === 2) return [{ x: su.x, z: su.z, icon: '?' }];
    // 袭山：标出来犯的魔影
    if (this.abyssQuest.inv) return this.combat.alive('surface').map((e) => ({ x: e.pos.x, z: e.pos.z, icon: '魔', color: '#7a1f24' }));
    const AQ = this.abyssQuest;
    if (AQ.isOpen() && AQ.trial !== 'sealed') return AQ.mapMarkers();
    return [];
  }

  questMarks() {
    const S = this.state, st = S.herb.stage, m = {};
    if (!S.talked('lin')) m.lin = '!';
    if (st === 1 && S.herb.count === 0 && !S.talked('he')) m.he = '…';
    if (st === 2) m.su = '?';
    return m;
  }

  updateZone() {
    const p = this.player.pos;
    this.updateQi();
    if (this.abyssQuest.inv) this.updateTracker();
    if (this.world === 'alchemy') {
      if (this.zone !== 'alchemyRoom') { this.zone = 'alchemyRoom'; this.ui.setPlace('丹房 · 室内', '中院 · 东翼'); }
      return;
    }
    if (this.world === 'tower') {
      if (this.zone !== 'towerHall') { this.zone = 'towerHall'; this.ui.setPlace('接引大厅', '通天塔 · 一层'); }
      return;
    }
    if (this.world === 'boss50') {
      if (this.zone !== 'tower50') { this.zone = 'tower50'; this.ui.setPlace('镇龙封印殿', '通天塔 · 第五十层'); }
      return;
    }
    if (this.world === 'boss30') {
      if (this.zone !== 'tower30') { this.zone = 'tower30'; this.ui.setPlace('烬狱剑台', '通天塔 · 第三十层'); }
      return;
    }
    if (this.world === 'hall') {
      const L = HALL.levels[levelAt(p.y)], key = 'hall-' + L.name;
      if (this.zone !== key) { this.zone = key; const [a, b] = L.name.split(' · '); this.ui.setPlace(b, '问道殿 · ' + a); }
      return;
    }
    if (this.world === 'abyss') {
      const r = this.abyss.regionAt(p.x, p.z);
      if (this.zone !== r) { this.zone = r; const [a, b] = r.name.split(' · '); this.ui.setPlace(b, a); }
      this.updateTracker();
      return;
    }
    let best = null, bs = Infinity;
    for (const z of ZONES) {
      const d = Math.hypot(p.x - z.x, p.z - z.z) / z.r;
      if (d < 1 && d < bs) { bs = d; best = z; }
    }
    if (best && best !== this.zone) {
      this.zone = best;
      this.ui.setPlace(best.name, TIERS[best.id] || '');
      if (this.state.discover(best.id)) {
        this.ui.banner(best.name, best.desc);
        this.updateTracker(true);
      }
    } else if (!best && this.zone) {
      // 离开命名区域时显示所在的进与支路
      this.zone = null;
      const [name, tier] = placeOf(p.x, p.z);
      this.ui.setPlace(name, tier);
    }
  }

  // 所在之处的灵气：普通灵气 / 魔气（地名下方的小签）
  updateQi() {
    const q = this.abyssQuest.qiLabel(), el = document.querySelector('#qi-chip');
    if (!el) return;
    if (el.dataset.k !== q.text + q.title) { el.dataset.k = q.text + q.title; el.textContent = q.text; el.title = q.title; el.className = q.kind; }
  }

  updateTracker(flash = false) {
    const S = this.state, h = S.herb, list = [];
    const aq = this.abyssQuest.tracker();
    if (aq) list.push(aq);
    if (h.stage === 0) {
      list.push({ title: '初入山门', tag: '指引', lines: S.talked('lin')
        ? [{ text: '与接引弟子林清竹交谈', done: true }, { text: '去演武广场东侧的告示栏看看委托' }]
        : [{ text: '沿石阶入山门，与接引弟子林清竹交谈' }] });
    } else if (h.stage === 1 || h.stage === 2) {
      list.push({ title: '丹房求药', tag: '委托', progress: Math.min(1, h.count / HERB_NEED), lines: [
        { text: `在灵田采集清露草 ${Math.min(h.count, HERB_NEED)}/${HERB_NEED}`, done: h.count >= HERB_NEED },
        ...(h.stage === 2 ? [{ text: '前往丹殿（广场东侧台地），将清露草交给苏木' }] : [{ text: '灵田在云顶问道殿西侧：登上云顶向西，下几级石阶便是' }]),
      ] });
    } else if (h.stage === 3 && this.justDone) {
      list.push({ title: '丹房求药', tag: '已完成', lines: [{ text: '获得 养元丹 ×1、宗门贡献 +10', done: true }] });
    }
    const total = ZONES.length, n = ZONES.filter((z) => S.found(z.id)).length;
    list.push({ title: '游历宗门', tag: `${n}/${total}`, lines: [{ text: n >= total ? '宗门各处均已探访' : '探访各院落与两条山间支路' }], progress: n / total });
    const key = JSON.stringify(list);
    if (key === this.trackerKey) return;
    this.trackerKey = key;
    if (flash) list[0].flash = true;
    this.ui.setTracker(list);
  }

  // ---------- 对话 ----------
  talkTo(id) {
    const S = this.state, ui = this.ui, n = this.npcs[id];
    // 第十五轮：演武教习——直接打开演武选择界面（对手、难度、方式、佩剑）
    if (id === 'jiaoxi' && this.arena) { S.talk(id); this.arena.openMenu(); return; }
    const sp = this.speaker(id);
    const first = S.talked(id) === 0;
    this.talkNPC = id;
    n.talking = true;
    const end = () => { n.talking = false; this.talkNPC = null; S.talk(id); this.updateTracker(); };
    const st = S.herb.stage;
    let steps;
    switch (id) {
      case 'lin': steps = this.linSteps(first); break;
      case 'zhou': steps = st === 0 ? [
        { text: '今日执事堂的委托都贴在告示栏上了。丹房的苏木师兄一早就来催，说养元丹缺一味清露草。' },
        { text: '你若得闲，揭了那张告示便是。办好了，贡献记在你名下。', opts: [{ label: '这就去看看告示', main: true, fn: () => this.openNotice(), then: 'end' }, { label: '执事堂管些什么？', then: [{ text: '宗门大小杂务：灵田分畦、丹房用料、新弟子的居所……凡是要登记造册的，都归执事堂。' }, { text: '说是杂务，宗门一日也离不得。' }] }, { label: '告辞', then: 'end' }] },
      ] : st === 1 ? [
        { text: `清露草长在灵田最靠近问道殿的那一畦，叶尖带露的才算上品。${S.herb.count ? `已采了 ${S.herb.count} 株？` : ''}` },
        { text: '采时手要轻，留着根，过几日还能再长。' },
      ] : st === 2 ? [{ text: '采够了？那就趁新鲜送到丹房去，苏师兄在炉边。丹殿在广场东边的台地上，从东回廊北头的门口上去，门前晒着药匾、东院立着大丹炉的那处便是。' }]
        : [{ text: '委托办得利落，贡献已记在你名下了。' }, { text: '明日若还有新委托，我照旧贴在这里。' }];
        break;
      case 'he': steps = st === 0 ? [
        { text: first ? '咦，新来的师兄？小心脚下，田埂窄。我是看灵田的禾小满。' : '灵田的东西可不能乱采哦。' },
        { text: '这里的灵草都是登记过的，得有执事堂的委托才能采。告示栏就在广场东边。' },
      ] : st === 1 ? [
        { text: '是来采清露草的吧？就在这第一畦，叶尖亮晶晶、挂着露珠的那些就是。' },
        { text: '掐上半截就好，根留着，过几日还能再长。采够五株就行，多了苏师兄也用不完。', do: () => S.event('heTip', true) },
      ] : [{ text: '苏师兄的丹炉又冒青烟了，准是在炼养元丹。' }, { text: '等赤阳果熟了，我再托你帮忙。' }];
        break;
      case 'su': steps = this.suSteps(first); break;
      case 'gu': steps = [
        { text: first ? '入阁须静心。老朽顾长卿，守这藏经阁四十年了。' : '又来了？好，好。' },
        { text: '一层的典籍外门弟子皆可翻阅。书在架上，心在书里。', opts: [{ label: '翻阅典籍', main: true, fn: () => this.openLibrary(), then: 'end' }, { label: '请教长老', then: [{ text: '你问修行之要？……先把《青岚吐纳诀》读熟。读熟了，再去演武台站一个时辰。' }, { text: `读过的书若有不解，不必急着问。${S.d.read.length >= 3 ? '你已读了好几卷，倒是难得。' : '多读几卷再说。'}` }] },
          { label: '后山的断碑', then: () => [{ text: '……你也听说了？那是开山祖师立的镇碑。宗门地底封着一处魔修旧窟，名曰「幽渊」。' }, { text: S.event('abyssSealed') ? '封印已由你加固，碑下的魔气也淡了。难为你了。' : '碑在听松亭北面，碑下若有红雾渗出，便是封印松动了。碑文残缺，可也正是开门的次序——你若要去，切记量力而行。', do: () => { if (!S.event('abyssHint')) { S.event('abyssHint', true); this.updateTracker(true); } } }] },
          { label: '告辞', then: 'end' }] },
      ];
        break;
      case 'qin': steps = [
        { text: first ? '剑要稳，心更要稳。——你是新来的？我是秦岳，内门弟子，每日在这演武台带外门的师弟师妹晨练。' : '来练剑？先站桩一炷香。' },
        { text: '流云剑式七式，藏经阁里有剑谱。看懂了再来，我给你喂招。' },
        { text: '对了，后山听松亭风大，我常去那儿练剑。听说那里有灵狐出没，只是我从没见过——兴许它只肯见心静的人。', do: () => S.event('foxHint', true) },
      ];
        break;
      case 'shen': steps = [
        { text: '嘘——云要散了。……啊，抱歉，我在画下院的屋瓦。我叫沈墨，大家都叫我画痴。' },
        { text: '从这里看下去，广场的白石、凌云阁的宝顶、两翼的屋瓦一层层叠在山腰上，像不像一卷没收拢的画轴？' },
        { text: '竹林深处溪边有块老碑，我画过它，字却一个也认不全。你若去，留心水声——碑就在跌水旁边。', do: () => S.event('tabletHint', true) },
      ];
        break;
      case 'shitou': steps = [
        { text: first ? '师兄好！我是小石头，杂役弟子。这问心阶一百二十级，我每天扫一遍！' : '今天的落叶比昨天多！' },
        { text: '往上就是演武广场，北头高台上那座两层楼阁是凌云阁。再往上过了上院就是天阶，一口气爬到云顶，问道殿就在那儿。殿前那只大香炉，我也负责擦。' },
        ...(S.event('abyssClue') ? [] : [{ text: '对了师兄——后山听松亭北边有块断碑，碑脚的草全是黑的，还往上冒红雾。师父说那儿镇着东西，不许我们靠近。从上院东南的「后山」牌坊上去就是。', do: () => { if (!S.event('abyssHint')) { S.event('abyssHint', true); this.updateTracker(true); } } }]),
      ];
        break;
      case 'aning': steps = [{ text: '吸为三，呼为七……啊，乱了。秦师兄说我总想着下一式，所以这一式总打不好。' }];
        break;
      case 'luchuan': steps = [{ text: '每天卯时就要来站桩。不过从这里看日出，倒也值得。' }, { text: '听说藏经阁的顾长老，年轻时在后山见过白狐。' }];
        break;
      case 'yu': steps = [{ text: '今天日头好，把师兄们的道袍都晒出来啦。' }, { text: '竹院南屋是我和师姐的寝舍，进去坐坐也行，就是有点挤。' }];
        break;
      default: steps = [{ text: '……' }];
    }
    ui.talk(sp, steps, { onEnd: end });
  }

  linSteps(first) {
    const S = this.state;
    const intro = [
      { text: '青岚宗依山而建，一进高过一进：这里是山门与接引台；问心阶上去是演武广场，广场北头高台上是凌云阁，两翼是弟子居所、丹殿与灵池；灵田在云顶问道殿的西侧。' },
      { text: '凌云阁后登云阶上去是上院，藏经阁在上院西边；再沿天阶直上云顶，便是问道殿。另有两条小路：西边下到竹林溪涧，东边从上院绕去后山。' },
      { text: '执事堂的委托都贴在演武广场东侧的告示栏上，新弟子不妨从那里做起。演武台中央的聚灵阵，也可以去坐一坐。' },
    ];
    // 选项在显示时才生成（领取腰牌后的下一层菜单里不再出现“领取”）
    const menu = () => [
      { label: '宗门简介', then: () => [...intro, { text: '还有什么想问的？', opts: menu }] },
      { label: '看看舆图', fn: () => this.openMap(true), then: 'end' },
      ...(S.count('token') ? [] : [{ label: '领取弟子腰牌', main: true, then: () => [{ text: '这是你的腰牌，收好。凭它可进藏经阁一层，也可在执事堂接委托。', do: () => { S.give('token', 1); this.ui.toast('获得 <b>弟子腰牌</b>'); } }, { text: '还有什么想问的？', opts: menu }] }]),
      { label: '告辞', then: 'end' },
    ];
    if (first) return [
      { text: '这位师弟，可是今日新上山的？我是接引弟子林清竹。山路走得累了吧，先到院子东北角的茶亭喝口茶。' },
      { text: '我先给你说说宗门的格局——' },
      ...intro,
      { text: '这块导览牌上画着全图，随时可以来看。', opts: menu },
    ];
    const h = S.herb.stage;
    return [{ text: h === 3 ? '听说你替丹房采了清露草？头一回就办得这样妥帖，执事堂该记你一笔。' : h > 0 ? '委托接了？灵田在云顶问道殿西侧，登上云顶往西走，下几级石阶便是。' : '有什么不明白的，尽管来问我。', opts: menu }];
  }

  suSteps(first) {
    const S = this.state, h = S.herb;
    if (h.stage === 0) return [
      { text: first ? '小心炉火。我是丹房的苏木。' : '炉火还旺着。' },
      { text: '养元丹缺一味清露草，我这炉火都快等凉了。执事堂的委托贴出去了，也不知谁肯接。', opts: [{ label: '看看丹房', fn: () => this.openInterior('alchemy'), then: 'end' }, { label: '告辞', then: 'end' }] },
    ];
    if (h.stage === 1) return [{ text: `还差 ${HERB_NEED - h.count} 株？不急，露水未干之前采的药性最好。` }];
    if (h.stage === 2) return [
      { text: '这气味……是清露草！快拿来我看看。', opts: [
        { label: `交付清露草 ×${HERB_NEED}`, main: true, then: () => [
          { text: '叶尖还带着露，根也留得齐整——正是这个成色。', do: () => this.completeHerb() },
          { who: 'narr', text: '苏木把清露草铺在竹匾上，挑出最嫩的几片投进丹炉。炉口青烟一转，香气顿时浓了几分。' },
          { text: '丹成三分，火候七分。这一炉还得守两个时辰。这枚养元丹是上一炉的，你收着，算是谢礼。' },
          { text: '下次执事堂再有我的委托，就托给你了。' },
        ] },
        { label: '稍后再来', then: 'end' },
      ] },
    ];
    return [
      { text: '这一炉养元丹快成了，闻得到吗？清露草的苦，正好压住赤阳果的燥。' },
      { text: '丹道急不得。火大了焦，火小了生，人也一样。', opts: [{ label: '看看丹房', fn: () => this.openInterior('alchemy'), then: 'end' }, { label: '告辞', then: 'end' }] },
    ];
  }

  // ---------- 委托 ----------
  openNotice() {
    const S = this.state, h = S.herb;
    const status = h.stage === 0 ? '<span class="tag red">可接取</span>' : h.stage === 3 ? '<span class="tag jade">已完成</span>' : '<span class="tag">进行中</span>';
    const el = document.createElement('div');
    el.innerHTML = `<div class="scroll"><div class="seal-m">执事堂</div>
      <h3>丹房求药</h3><div class="meta">执事堂 · 今日委托　${status}</div>
      <p>丹房炼制养元丹，缺主药清露草。今委托外门弟子一名，往灵田第一级梯田最东一畦（紧挨问道殿）采集新鲜清露草<b>五株</b>，送交丹房苏木。</p>
      <p>采时须掐取上半截，留根再生；叶尖带露者为上品。</p>
      <div class="kv" style="margin-top:12px"><b>地点</b><span>灵田（云顶问道殿西侧梯田）→ 丹殿（广场东侧台地）</span><b>酬谢</b><span>养元丹 ×1，宗门贡献 +10</span>
      <b>进度</b><span>${h.stage === 0 ? '尚未接取' : h.stage === 3 ? '已交付' : `清露草 ${Math.min(h.count, HERB_NEED)}/${HERB_NEED}`}</span></div>
      <div style="margin-top:16px;text-align:right">${h.stage === 0 ? '<button class="act danger" id="accept">揭下告示，接取委托</button>' : '<button class="act" id="ok">知道了</button>'}</div>
      </div><p class="muted" style="margin-top:10px">另有「赤阳果待熟，暂缓」「藏经阁晒书，需人手」两张旧告示，已被划去。</p>`;
    this.panelKind = 'notice';
    this.ui.openPanel('委托告示', '演武广场 · 东侧', el, { width: 720 });
    el.querySelector('#accept')?.addEventListener('click', () => {
      S.setHerb({ stage: 1, count: 0 });
      this.prog?.recordQuest('herb');                 // 第二十一轮：奖励基准在领取时记下
      this.ui.closePanel();
      this.ui.toast('接取委托 <b>丹房求药</b>');
      this.ctx.redrawNotice?.(S);
      this.updateTracker(true);
    });
    el.querySelector('#ok')?.addEventListener('click', () => this.ui.closePanel());
  }

  pickHerb(hb) {
    const S = this.state, h = S.herb;
    if (h.stage !== 1) {
      this.ui.talk({ name: '清露草', title: '' }, [{ who: 'narr', text: h.stage === 0 ? '细长的叶片上挂着晨露，在日光下一闪一闪。田埂边插着木牌：「灵田作物，凭执事堂委托采摘。」' : '叶尖的露珠还没干。委托所需已经采够了。' }]);
      return;
    }
    S.d.picked.push(hb.id);
    hb.mesh.visible = false;
    if (hb.onPick) hb.onPick();
    S.give('qinglu', 1);
    const count = h.count + 1;
    S.setHerb({ count, stage: count >= HERB_NEED ? 2 : 1 });
    this.ui.toast(`获得 <b>清露草</b>　${Math.min(count, HERB_NEED)}/${HERB_NEED}`);
    if (count >= HERB_NEED) setTimeout(() => this.ui.toast('清露草已采足，前往<b>丹房</b>交给苏木'), 900);
    this.updateTracker(true);
  }

  completeHerb() {
    const S = this.state;
    S.give('qinglu', -HERB_NEED);
    S.give('yangyuan', 1);
    S.d.merit += 10;
    S.setHerb({ stage: 3 });
    this.ui.toast('委托完成：获得 <b>养元丹</b> ×1，<b>宗门贡献</b> +10');
    setTimeout(() => this.prog?.completeQuest('herb'), 700);      // 第二十一轮：宗门任务的修炼灵气（简单 5%，按领取时的基准；只发一次）
    this.ctx.redrawNotice?.(S);
    this.ctx.onAlchemyBrew?.();
    this.justDone = true;
    this.updateTracker(true);
    setTimeout(() => { this.justDone = false; this.updateTracker(); }, 20000);
  }

  // ---------- 面板 ----------
  openMap(guide = false) {
    const el = document.createElement('div');
    el.className = 'map-wrap';
    const cv = document.createElement('canvas');
    const W = 900, H = Math.round(900 * (this.baseMap.proj.h / this.baseMap.proj.w));
    cv.width = W; cv.height = H;
    cv.style.maxHeight = 'calc(100vh - 210px)';
    cv.style.width = 'auto';
    cv.style.margin = '0 auto';
    el.appendChild(cv);
    const S = this.state, h = S.herb.stage;
    const markers = [];
    if (h === 0) markers.push({ x: SITES.notice.x, z: SITES.notice.z, icon: '!' });
    if (h === 1) markers.push({ ...this.herbCenter(), icon: '采', color: '#4f7f72' });
    if (h === 2) markers.push({ x: SITES.alchemy.x, z: SITES.alchemy.z + 6, icon: '?' });
    markers.push(...this.abyssQuest.mapMarkers());
    const f = this.cam.forward();
    drawFullMap(cv.getContext('2d'), W, H, this.baseMap, { found: S.d.found, markers, player: { x: this.player.pos.x, z: this.player.pos.z, dx: f.x, dz: f.z }, guide });
    const leg = document.createElement('div');
    leg.className = 'map-legend';
    leg.innerHTML = '<span>━ 中轴主路（石阶）</span><span>┅ 山间支路</span><span>■ 屋宇</span><span style="color:#a63b2e">▲ 你的位置</span><span>● 委托目标</span><span class="muted">未至之处以「？？」标出，隐秘之所不显示</span>';
    el.appendChild(leg);
    this.panelKind = 'map';
    this.ui.openPanel(guide ? '宗门导览' : `${SECT_NAME}舆图`, guide ? '接引台 · 导览牌' : '按 M 关闭', el, { width: 760 });
  }

  openJournal() {
    const S = this.state, h = S.herb;
    const zones = ZONES.map((z) => S.found(z.id) ? `<button class="on-lite"><b>${z.name}</b><small>${z.desc}</small></button>` : `<button class="locked"><b>${z.hidden ? '？？？' : z.name}</b><small>${z.hidden ? '尚未发现的隐秘之所' : '尚未探访'}</small></button>`).join('');
    const quest = h.stage === 0 ? '<p class="muted">尚未接取委托。演武广场东侧的告示栏上有执事堂的今日委托。</p>'
      : `<div class="item-card"><b>丹房求药</b><span class="n">${h.stage === 3 ? '已完成' : '进行中'}</span><p>${h.stage === 1 ? `在灵田采集清露草（${h.count}/${HERB_NEED}）` : h.stage === 2 ? '清露草已采足，交给丹房苏木' : '已将清露草交给丹房苏木，获得养元丹与宗门贡献。'}</p></div>`;
    const books = BOOKS.filter((b) => S.d.read.includes(b.id)).map((b) => `<span class="tag">${b.title}</span>`).join('') || '<span class="muted">尚未阅读</span>';
    const ev = [S.event('fox') ? '<span class="tag jade">听松亭 · 灵狐赠果</span>' : '', S.found('tablet') ? '<span class="tag jade">溪畔古碑</span>' : '', this.abyssQuest.journal()].join('') || '<span class="muted">山中似乎还藏着些什么……</span>';
    const cult = S.d.cult ? `<p>于聚灵阵吐纳 <b>${S.d.cult}</b> 周天${S.d.cult >= 9 ? '，气息渐稳' : ''}。</p>` : '<p class="muted">尚未打坐。演武台中央的聚灵阵可以吐纳调息。</p>';
    this.panelKind = 'journal';
    this.ui.openPanel('行记', `已探访 ${ZONES.filter((z) => S.found(z.id)).length}/${ZONES.length}`, `<div class="panel-cols"><div><h3 style="margin:0 0 8px;font-weight:400;font-family:var(--kai)">委托</h3>${quest}<h3 style="margin:16px 0 8px;font-weight:400;font-family:var(--kai)">阅览</h3><div>${books}</div><h3 style="margin:16px 0 8px;font-weight:400;font-family:var(--kai)">修行</h3>${cult}<h3 style="margin:16px 0 8px;font-weight:400;font-family:var(--kai)">奇遇</h3><div>${ev}</div></div><div><h3 style="margin:0 0 8px;font-weight:400;font-family:var(--kai)">足迹</h3><div class="list">${zones}</div></div></div>`, { width: 900 });
  }

  openBag() {
    const S = this.state;
    const cards = Object.entries(S.d.inv).map(([id, n]) => `<div class="item-card"><b>${ITEMS[id]?.name || id}</b><span class="n">×${n}</span><p><span class="tag">${ITEMS[id]?.kind || ''}</span>${ITEMS[id]?.desc || ''}</p></div>`).join('');
    // 第十五轮：当前佩剑（可在这里换剑）
    const sw = this.player.char.sword || this.armory?.get(S.sword);
    const swordCard = sw ? `<div class="item-card sw-card"><img src="assets/converted/${sw.thumb}" alt=""><div><b>佩剑 · ${sw.name}</b><span class="n">${sw.length.toFixed(2)} 米</span><p>${sw.desc}</p><button class="act" data-swords>更换佩剑（P）</button></div></div>` : '';
    this.panelKind = 'bag';
    const body = this.ui.openPanel('行囊', `宗门贡献 ${S.d.merit}`, `${swordCard}<div class="grid-items">${cards || '<p class="muted">行囊空空。去接引台找林清竹领取弟子腰牌吧。</p>'}</div>`, { width: 720 });
    body.querySelector('[data-swords]')?.addEventListener('click', () => { this.ui.closePanel(); this.openSwords(); });
  }

  // 第十五轮：佩剑面板（back：从演武选择界面打开时，「返回演武」回到那里）
  openSwords(opts = {}) {
    if (this.arena?.active) { this.ui.toast('切磋之中不能换剑——按 <b>退格</b> 退出后再换'); return; }
    if (this.ui.panelOpen) this.ui.closePanel();
    openSwordPanel(this, opts);
  }

  // 剑诀（第十四轮；第十七轮重写；第二十三轮起为六槽装备面板：六个槽、技能库、不占槽的基本操作、要领——见 ui/loadoutPanel.js）
  openSkills() {
    if (this.ui.panelOpen) this.ui.closePanel();
    openLoadoutPanel(this);
  }

  openSettings() {
    const q = localStorage.getItem('qinglan.quality') || this.quality;
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="set-row"><span>画质</span><div class="seg" id="sq">${[['low', '流畅'], ['mid', '均衡'], ['high', '精美']].map(([k, l]) => `<button data-q="${k}" class="${k === q ? 'on' : ''}">${l}</button>`).join('')}</div><small class="muted">切换后重新载入</small></div>
      <div class="set-row"><span>鼠标灵敏度</span><input id="ss" type="range" min="0.3" max="2.5" step="0.05" value="${this.cam.sens}"><small class="muted" id="ssv">${(+this.cam.sens).toFixed(2)}</small></div>
      <div class="set-row"><span>音效音量</span><input id="sv" type="range" min="0" max="1" step="0.05" value="${this.sound?.vol ?? 0.7}"><small class="muted" id="svv">${Math.round((this.sound?.vol ?? 0.7) * 100)}</small></div>
      <div class="set-row"><span>音乐音量</span><input id="smv" type="range" min="0" max="1" step="0.05" value="${this.sound?.musicVol ?? 0.6}"><small class="muted" id="smvv">${Math.round((this.sound?.musicVol ?? 0.6) * 100)}</small></div>
      <div class="set-row"><span>震屏与闪光</span><div class="seg" id="sfk">${[['0', '关'], ['0.5', '弱'], ['1', '标准']].map(([k, l]) => `<button data-k="${k}" class="${String(+(localStorage.getItem('qinglan.fxk') ?? 1)) === k ? 'on' : ''}">${l}</button>`).join('')}</div><small class="muted">打击的镜头位移、震屏与闪光（切磋、守关战、宗门里的战斗都按这一档）</small></div>
      <div class="set-row"><span>凤凰瞄准辅助</span><div class="seg" id="spa">${[['1', '开'], ['0', '关']].map(([k, l]) => `<button data-k="${k}" class="${(this.phoenix?.assist ?? true) === (k === '1') ? 'on' : ''}">${l}</button>`).join('')}</div><small class="muted">凤翔天击操控时，准星 12° 内、15 米内看得见的敌人把凤凰的方向往它轻轻偏一点（不追墙、不硬拐）</small></div>
      <div class="set-row"><span>存档</span><button class="act danger" id="reset">重置存档并重新开始</button></div>
      <h3 style="font-weight:400;font-family:var(--kai);margin:18px 0 6px">操作</h3>
      <div class="kv"><b>W A S D</b><span>行走（以镜头方向为前）</span><b>Shift</b><span>疾行</span><b>空格</b><span>跳跃</span><b>移动鼠标</b><span>转动视角（点击画面锁定鼠标，Esc 释放）</span><b>鼠标左键</b><span>点一下出一剑；按住连续出手（斜斩 → 反手横斩 → 突刺 → 重劈，收势后再起）</span><b>鼠标右键</b><span>按下的一瞬挡住可弹反的来招即弹反；按住格挡（扣守势），松开放下</span><b>Q / X / R / V / 1 / 3</b><span>六个剑诀槽（第二十三轮起；按 K 在剑诀面板里装备、替换、卸下）。默认：Q 剑气、X 破岳、R 拔刀斩、V 万剑归宗、1 缚灵锁、3 九霄凤焰；惊鸿掠影、雷龙破虚在技能库里</span><b>鼠标中键</b><span>拔刀斩的别名（只在拔刀斩装备着时有效）：按住纳刀蓄势（可缓步、可闪身，最多蓄 5 秒），松开拔刀横斩</span><b>2</b><span>回血葫芦：饮一口回复三分之一气血（每次装满 3 口，打坐调息时装满）</span><b>Tab</b><span>锁定 / 解除锁定身前的对手</span><b>滚轮</b><span>拉近 / 拉远</span><b>E</b><span>与人物、物件交互；对话中继续；按住可采集、加固封印</span><b>预警</b><span>地面红圈为魔修出手范围，头顶「危」字为不可格挡，兵刃金光为难挡的重击；橙圈为火龙火球落点。雷龙破虚的选点圈：蓝白可放，红色不可（写明原因）</span><b>C</b><span>闪身（御剑时为下降）</span><b>G</b><span>服丹（养元丹；眼下恒为 99 颗）</span><b>4</b><span>切换九霄凤焰下一次召唤的模式（只在凤焰装备着时有效）</span><b>K</b><span>剑诀面板：六个槽、技能库、各招的消耗、调息、操作与解锁条件</span><b>P</b><span>佩剑：查看、更换手中的剑</span><b>退格 / H / U</b><span>演武场切磋中：退出切磋；自由练习时复原双方气血 / 开关陪练出招。通天塔第五十层守关战中退格放弃挑战，过场中空格跳过（第二十三轮起 X 是剑诀槽键）</span><b>F</b><span>御剑起飞 / 请求落地（找不到安全落点时继续飞行并提示原因）；御剑时 WASD 平飞、空格上升、C 下降、Shift 加速</span><b>1–4</b><span>对话中选选项（战斗中 1、3 为剑诀槽，2 为回血葫芦，4 切换凤凰模式）</span><b>M / J / B</b><span>舆图 / 行记 / 行囊</span><b>Esc</b><span>关闭面板、离开对话</span></div>
      <h3 style="font-weight:400;font-family:var(--kai);margin:18px 0 6px">时辰</h3>
      <p class="muted" style="margin:0">山中时间流速为现实的 100 倍：游戏一刻钟约现实 9 秒，一昼夜约现实 14 分钟。日光、天色、灯火随时辰变化。</p>
      <h3 style="font-weight:400;font-family:var(--kai);margin:18px 0 6px">素材来源</h3>
      <div class="kv" style="font-size:12.5px">
        <b>石狮</b><span>Lion Guardian（黄大仙祠石狮扫描）· yoko3d · CC BY 4.0 · doi:10.5281/zenodo.10240557</span>
        <b>贴图、天空、宫灯、山石</b><span>Poly Haven（CC0）</span>
        <b>崖壁岩面</b><span>Poly Haven（CC0）：marble_cliff_01（Amal Kumar）、cliff_side（James Ray Cock、Dario Barresi 摄影，Jenelle van Heerden 处理）</span>
        <b>山岩、崖壁岩面（第十轮）</b><span>Poly Haven（CC0）：Mountainside（Dario Barresi 摄影，Rico Cilliers 处理）</span>
        <b>宗门殿阁楼塔（第十轮）</b><span>项目作者提供的古建模型（assets/buildings/01.fbx，3d66 模型网导出）；第十二轮起问道殿外观也取用其中的手绘贴图</span>
        <b>叶片</b><span>ambientCG（CC0）、Poly Haven（CC0）</span>
        <b>远山地形</b><span>AWS Terrain Tiles（Mapzen / SRTM 等公开高程数据），黄山一带</span>
        <b>丹房、西院与丹殿陈设</b><span>Poly Haven（CC0）：Kirill Sannikov（中式家具、宫灯、木架）、James Ray Cock（瓷瓶、青花罐、盆栽）、Rico Cilliers（铜罐、铜瓶）、Kuutti Siitonen（木碗、竹篮）、Aron Łyczek（陶罐）、Amal Kumar（陶盆）、Josh Dean（烛台）、Oliver Harries（姜根）、Jan Martens（木盘）</span>
        <b>月面</b><span>NASA Scientific Visualization Studio · CGI Moon Kit（公有领域）</span>
        <b>双龙、地下神殿、素材树、山体、药瓶</b><span>项目作者提供的素材（assets/）</span>
        <b>剑招动作（第十四轮）</b><span>Quaternius · Universal Animation Library 2 [Standard]（CC0，assets/fighting），重定向到修士骨架</span>
        <b>技能特效贴图（第十四轮）</b><span>Kenney · Particle Pack 1.1（CC0，assets/special effects，www.kenney.nl）</span>
        <b>金白修士（第十五轮）</b><span>项目作者提供的人物模型（assets/figure/gold_cultivator_v1_model_only）；剑招、受击等动作另由 Quaternius · Universal Animation Library 2（CC0）重定向</span>
        <b>镇塔龙君·烬霄（第十六轮）</b><span>「Dragon Character 3d」· Oscar Creativo（项目作者提供的素材，assets/boss/boss50/source，原 FBX 保留）；贴图集、减面、动作重定向与编排为本项目所做。补充动作重定向自 Quaternius · Universal Animation Library 2（CC0）与金白修士素材自带的 Mixamo 动作</span>
        <b>音效与音乐（第十八轮）</b><span>项目作者提供的 assets/sound effect（文件名为 Pixabay 格式）：audiopapkin、dragon-studio 的吼声 / 龙焰 / 剑击，freesound_community 的「boss intro 02」「lightning tiger god loop」（第五十层音乐）。OpenGameArt（CC0）：rubberduck、Darsycho、JaggedStone、VishwaJai、AntumDeluge；Kenney · Impact Sounds（CC0）。剪辑与混合为本项目所做，没有录音的音效仍为程序合成</span>
        <b>音效（第十九轮）</b><span>项目作者提供的 assets/sound effect：skill/ 下的缚灵锁、剑气、拔刀斩蓄力与出鞘、万剑归宗（落剑与末了的巨剑）各一段录音；普攻、成功弹反改用 sword/ 下 dragon-studio 的「sword slice」「sword clash/hit」原录音。回血葫芦的拔塞、吞咽、塞回：qubodup「Liquid Bottle Drink Set」（OpenGameArt，CC0）。回血葫芦的模型：项目作者提供的素材（assets/figure/accessories/gourd_bottle.glb），缩放、减面、缩贴图为本项目所做</span>
        <b>水墨刀光（第二十轮）</b><span>「FX_Ink slash」水墨刀光特效包（项目作者提供的 Unity 素材包，assets/special effects/FX_Ink_slash）。包里没有署名与授权文件；按六个预制体、内置管线材质与公开的商品说明比对，应是 itch.io 作者 wangray0110 的「FX Ink sword slash」（付费素材，作者说明可用于商业项目）。取用其中的水墨贴图、月牙与弯带子两个网格和粒子参数，材质、粒子、动画与时序在网页里重建</span>
        <b>九霄凤焰的凤凰（第二十一轮）</b><span>项目作者提供的素材（assets/boss/phoenix-bird，原 FBX 与贴图保留）。包里没有署名与授权文件；按贴图名（Tex_Ride_FengHuang_01a / 01b）、88 根骨骼的骨架与 3.33 秒的「Take 001」飞行动作比对，应是 Sketchfab 上 NORBERTO-3D 的「phoenix bird」（CC BY 4.0，sketchfab.com/3d-models/phoenix-bird-844ba0cf144a413ea92c779f18912042）。转成 GLB（修正贴图路径，保留骨架与动作）、红金配色、溶解与收翅、俯冲、受击等姿态为本项目所做</span>
        <b>音效（第二十一轮）</b><span>项目作者提供的 assets/boss/phoenix-bird/sound：展翼——tommy_mooney「wings flapping.wav」（Freesound 386706，CC0）；凤鸣——slugzilla「phoenixscreech1」（Pixabay 107784，Pixabay 内容许可）；凤焰的爆裂、火球、吐息、掠翼——Sample Kingdom「Fire Magic: Sound Effects Pack」（itch.io 付费素材，包里没有授权文件）。聚气、突破：JaggedStone「magic spell sfx」（OpenGameArt，CC0）。剪辑与混合为本项目所做</span>
        <b>雷龙破虚（第二十三轮）</b><span>龙：项目作者提供的素材（assets/boss/chinese_dragon_loong，原 FBX 与贴图保留），文件里是某个游戏的坐骑模型「F1_zuoqi24_jinlong」（目录名 RYUISM / 8030），没有署名与授权文件；转成 GLB、贴图改接、游动、出场裁切与电纹为本项目所做。雷枝：同目录 skill/ 下的「lighting_pack_2_forked_lightning」（Sketchfab 模型经 Fab 转换，文件里没有作者与授权）。音效：Freesound——frasbr「Dragon Roar」（CC0）、cognito perceptu「thunder crack.wav」（CC0）、EminYILDIRIM「Magic Whoosh ( Air, Fire, Earth )」（CC BY 4.0，freesound.org/s/634365）；rubberduck「100 CC0 SFX」（OpenGameArt，CC0）。剪辑与混合为本项目所做</span>
        <b>普攻水墨 · 第三组（第二十六轮）</b><span>项目作者提供的 assets/special effects/ink：Piloto Studio「Realistic Ying Yang Spells VFX Pack」1.0（Unity 特效包，包里没有单独的授权文件）。只取太极、喷墨、竹叶、裂纹、刺线等贴图的形状，运行时按水墨色板着色；突刺的太极印、重劈落地的地面太极印与竹叶用的就是它</span>
        <b>墨里终焉（第二十七轮）</b><span>三维水墨山水与画卷：项目作者提供的 assets/skill/molizhongyan（山水是 Sketchfab 下载包的格式，挂轴是 FBX；都没有作者与授权说明，原文件保留），转换、水墨材质、纸面与展开为本项目所做。音乐与音效：同目录的 sound effect（文件名为 Pixabay 格式，Pixabay 内容许可）——Tunetank「china epic background music」、Dragon Studio「epic dragon roar」、freesound_community「phoenixscreech1」（slugzilla 的录音）、kontraa「gong cinematic fx」，另有来源不明的 unfold.mp3。书法「墨里终焉」的笔画：Make Me a Hanzi（Arphic Public License）。凤凰、雷龙与水墨贴图沿用前几轮的素材（署名见上）。</span>
        <b>普攻水墨（第二十三轮）</b><span>第二组水墨贴图：项目作者提供的 assets/special effects/ink——《只狼：影逝二度》（FromSoftware）一个水墨风格模组的封包（包里没有授权说明），只取其中的笔刷、墨团、墨雾、甩墨等贴图的形状，运行时按水墨色板着色；与第二十轮的 FX_Ink slash 按用途组合</span>
        <b>烬狱剑尊（第二十四轮）</b><span>模型：「Soul Of Cinder - Dark Souls 3 Boss Tilt Brush」· vrhuman · CC BY 4.0（sketchfab.com/3d-models/soul-of-cinder-dark-souls-3-boss-tilt-brush-b1e1b1ef899a40a2b04934d51f3d4ad3；《黑暗之魂 III》角色的同人笔画作品，assets/boss/boss30，原文件保留）——拆出人物与剑、套 UE5 Manny 骨架绑定蒙皮；动作：「One Handed Sword Animation V5」（项目作者提供的 UE5 Manny 单手剑动作包，assets/fighting，目录内没有署名与授权文件）；火焰贴图：「FX_FireSkill」与「Elemental Fire Spell VFX」（FlexUnit）两个 Unity 特效包（项目作者提供，assets/special effects/fire，只取贴图转成单通道强度）。第二十六轮起剑尊手中的剑为剑器荆棘（assets/sword/sword3，项目作者提供）</span>
        <b>剑器（第十五轮）</b><span>赤霄、斩妖、荆棘与五把晶剑：项目作者提供的素材（assets/sword）。秋水：「Katana」· saltyrecuirt · CC BY 4.0（sketchfab.com/3d-models/katana-0a96ef6872cc444598119600cc620d6f）。蟠龙及其刀鞘：「Dragon katana "Oni koroshi"」· Sky_Hunter · CC BY 4.0（sketchfab.com/3d-models/dragon-katana-oni-koroshi-778d3dfe4cc549dd93c9bdc5ad78a420）。均经缩放、减面、贴图压缩</span>
      </div>`;
    this.panelKind = 'settings';
    this.ui.openPanel('设置', '', el, { width: 640 });
    el.querySelectorAll('#sq button').forEach((b) => b.addEventListener('click', () => { localStorage.setItem('qinglan.quality', b.dataset.q); location.reload(); }));
    el.querySelector('#ss').addEventListener('input', (e) => { this.cam.sens = +e.target.value; localStorage.setItem('qinglan.sens', e.target.value); el.querySelector('#ssv').textContent = (+e.target.value).toFixed(2); });
    el.querySelector('#sv').addEventListener('input', (e) => { this.sound?.setVolume(+e.target.value); el.querySelector('#svv').textContent = Math.round(+e.target.value * 100); this.sound?.play('block', {}); });
    el.querySelector('#smv').addEventListener('input', (e) => { this.sound?.setMusicVolume(+e.target.value); el.querySelector('#smvv').textContent = Math.round(+e.target.value * 100); });      // 第十八轮：第五十层的背景音乐
    el.querySelectorAll('#sfk button').forEach((b) => b.addEventListener('click', () => { localStorage.setItem('qinglan.fxk', b.dataset.k); el.querySelectorAll('#sfk button').forEach((x) => x.classList.toggle('on', x === b)); if (this.boss50?.fx) this.boss50.fx.fxk = +b.dataset.k; if (this.boss30?.fx) this.boss30.fx.fxk = +b.dataset.k; this.combat?.setFxk(+b.dataset.k); }));
    el.querySelectorAll('#spa button').forEach((b) => b.addEventListener('click', () => { localStorage.setItem('qinglan.phoenixAssist', b.dataset.k); el.querySelectorAll('#spa button').forEach((x) => x.classList.toggle('on', x === b)); if (this.phoenix) this.phoenix.assist = b.dataset.k === '1'; }));     // 第二十二轮
    el.querySelector('#reset').addEventListener('click', () => { if (confirm('确定要清除所有进度吗？')) { this.state.reset(); localStorage.removeItem('qinglan.save.v1'); location.reload(); } });
  }

  openLibrary() {
    const S = this.state;
    const el = document.createElement('div');
    el.className = 'panel-cols';
    const list = document.createElement('div');
    list.className = 'list';
    const page = document.createElement('div');
    const show = (b) => {
      list.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.id === b.id));
      if (b.locked) { page.innerHTML = `<div class="scroll"><h3>${b.title}</h3><div class="meta">${b.tag}</div><p>${b.body[0]}</p><p class="muted">书架二层的铜锁上积了薄灰。</p></div>`; return; }
      page.innerHTML = `<div class="scroll"><div class="seal-m">藏经阁</div><h3>${b.title}</h3><div class="meta">${b.tag}　·　${b.author}</div>${b.body.map((p) => `<p>${p}</p>`).join('')}${b.verse ? `<p class="verse">${b.verse}</p>` : ''}</div>`;
      if (S.markRead(b.id)) {
        this.ui.toast(`研读《<b>${b.title}</b>》`);
        list.querySelector(`[data-id="${b.id}"] .read`).textContent = '已读';
      }
    };
    for (const b of BOOKS) {
      const bt = document.createElement('button');
      bt.dataset.id = b.id;
      if (b.locked) bt.classList.add('locked');
      bt.innerHTML = `<span class="read">${S.d.read.includes(b.id) ? '已读' : ''}</span>《${b.title}》<small>${b.tag}</small>`;
      bt.addEventListener('click', () => show(b));
      list.appendChild(bt);
    }
    el.append(list, page);
    this.panelKind = 'library';
    this.ui.openPanel('藏经阁', '一层 · 外门弟子可阅', el, { width: 960 });
    show(BOOKS[0]);
    S.discover('library');
  }

  openInterior(key) {
    if (key === 'alchemy') { this.alchemyRoom.enter(); return; }     // 丹房：真的推门进屋
    if (key === 'hall') { this.hallRoom.enter(); return; }           // 问道殿（第十一轮）：入殿，五层皆可登临
    const I = INTERIORS[key];
    const el = document.createElement('div');
    el.innerHTML = `<div class="scroll"><div class="seal-m">${I.title.slice(0, 2)}</div><h3>${I.title}</h3><div class="meta">${I.sub}</div>${I.body.map((p) => `<p>${p}</p>`).join('')}<div style="margin-top:12px">${(I.items || []).map((t) => `<span class="tag">${t}</span>`).join('')}</div></div>`;
    this.panelKind = 'interior';
    this.ui.openPanel(I.title, '内景', el, { width: 720 });
  }

  readStele() {
    this.ui.talk({ name: '青岚宗记', title: '石碑' }, [
      { who: 'narr', text: '碑高丈余，龟趺负之。碑首题「青岚宗记」四个大字，下面的小字已被风雨磨得圆润：' },
      { who: 'narr', text: '「开山于云岫之阳，引泉为池种灵田。三阶以问心，一殿以问道。后世弟子，毋忘初心。」' },
      { who: 'narr', text: '碑侧刻着一行更小的字：「碑之余文，在竹深处。」' },
    ]);
  }

  readTablet() {
    const S = this.state;
    const first = S.discover('tablet');
    if (first) this.ui.banner('古碑', '跌水旁的苔碑，字迹半没，少有人至。');
    if (!S.count('rubbing')) { S.give('rubbing', 1); this.ui.toast('获得 <b>古碑拓文</b>'); }
    const el = document.createElement('div');
    el.innerHTML = `<div class="scroll"><div class="seal-m">云岫</div><h3>溪畔古碑</h3><div class="meta">开山祖师云岫子所立 · 碑文漫漶，依稀可辨</div>
      <p class="verse">岚起于谷　不择其高<br>泉出于石　不辞其劳<br>吾来此山　结庐种药<br>白狐为邻　松风为號</p>
      <p>碑阴有小字数行：「后山之亭，吾常独坐。心静则狐至，心躁则雾深。后来者若遇之，善待之。」</p>
      <p class="muted">拓文已收入行囊。宗门碑侧所言「碑之余文，在竹深处」，大约就是指这里。</p></div>`;
    this.panelKind = 'tablet';
    this.ui.openPanel('古碑', '竹林溪涧 · 跌水旁', el, { width: 720 });
    this.updateTracker(true);
  }

  readSteles() {
    this.state.discover('steles');
    this.ui.talk({ name: '功德碑', title: '碑林' }, [
      { who: 'narr', text: '三通石碑并立，碑首分刻「功」「德」「碑」三字，记着青岚第三、第五、第七代掌门的事迹。' },
      { who: 'narr', text: '第三代掌门开灵田三级，引听雨池水灌溉；第五代掌门重修凌云阁，增筑须弥座高台；第七代掌门修登天廊，「使后来者登阶不畏风雨」。' },
      { who: 'narr', text: '碑阴刻着一行小字：「山不在高，阶不在多。」' },
    ]);
  }
  ringBell() {
    this.state.discover('bell');
    this.ui.toast('「咚——」钟声在山谷间回荡，惊起一群白鹭。');
    this.cam.shake = 0.35;
  }

  // ---------- 远眺 ----------
  // o.free：镜头移到指定机位（如凌云阁平座、云顶殿前）缓缓左右摇；否则沿用跟随镜头拉远并缓转
  scenicView(o) {
    if (this.meditating) this.endMeditate(true);
    const cam = this.camera, fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    this.scenic = { t: 0, o, saved: { yaw: this.cam.yaw, pitch: this.cam.pitch, dist: this.cam.dist },
      from: cam.position.clone(), fromAt: cam.position.clone().addScaledVector(fwd, 30) };
    if (!o.free) this.cam.set(o.yaw, o.pitch, o.dist);
    this.ui.toast(o.text);
  }
  updateScenic(dt) {
    const sc = this.scenic, o = sc.o;
    sc.t += dt;
    if (!o.free) { this.cam.yaw += dt * 0.05; return; }
    const k = Math.min(1, sc.t / 1.6), e = k * k * (3 - 2 * k);
    const pos = new THREE.Vector3(...o.pos), at = new THREE.Vector3(...o.at);
    // 以机位为轴缓缓左右摇
    const a = Math.sin(sc.t * 0.12) * (o.pan || 0), d = at.clone().sub(pos);
    at.copy(pos).add(d.applyAxisAngle(new THREE.Vector3(0, 1, 0), a));
    this.freeCam = { pos: sc.from.clone().lerp(pos, e), at: sc.fromAt.clone().lerp(at, e) };
  }
  endScenic() {
    const s = this.scenic.saved;
    if (!this.scenic.o.free) this.cam.set(s.yaw, s.pitch, s.dist);
    this.freeCam = null;
    this.scenic = null;
  }

  // ---------- 打坐修炼 ----------
  // 第二十一轮：随处打坐（Y）或在聚灵阵、灵池静修台（E）；修炼灵气按「本级基础吸收 × 区域浓度 × 合法加成」吸收（progression.js），
  // 只在主动打坐时吸收；移动、出手、受击、力竭、换场景即中断（周天的计数照旧，作行记里的说法）
  zoneHere() {
    const P = this.player.pos, sg = this.world === 'surface' && this.player.skyGround ? this.player.skyGround(P.x, P.z, P.y + 0.5) : -Infinity;
    return this.prog.zoneAt({ world: this.world, pos: P, anchors: this.ctx.anchors, terrain: this.terrain, qiHere: () => this.abyssQuest.qiHere(), onIsle: sg > -1e8 && Math.abs(sg - P.y) < 0.6 });
  }
  toggleMeditate() { if (this.meditating) this.endMeditate(); else this.startMeditate('free'); }
  meditateBlock() {
    const P = this.player, M = this.moves;
    if (P.flying) return '御剑之中不能打坐——先按 F 落地';
    if (this.asc) return '正在聚气';
    if (!this.combat?.playerUnit.alive || this.lock || this.scenic) return '此刻不能打坐';
    if (this.arena?.active) return '切磋之中不能打坐';
    if (this.world === 'boss50') return '封印殿中灵压沉重，不能打坐';
    if (this.world === 'boss30') return '剑台上烬火灼人，不能打坐';
    if (this.combat?.state === 'battle') return '魔修在侧，静不下心打坐';
    if (M?.act || M?.guarding) return '收招之后再打坐';
    if (!P.onGround) return '脚下不稳，落地再打坐';
    return null;
  }
  startMeditate(spot = 'array') {
    if (!this.prog) return;
    const why = this.meditateBlock();
    if (why) { this.ui.toast(why); return; }
    const pool = spot === 'pool', anchor = spot === 'free' ? null : pool ? this.ctx.anchors.meditatePool : this.ctx.anchors.meditate;
    const fx = spot === 'free' ? null : pool ? this.ctx.lingchi : this.ctx.qi;
    if (anchor) this.player.place(anchor.x, anchor.z, this.player.heading);
    const zone = this.zoneHere();
    if (!zone.ok) { this.ui.toast(zone.reason); return; }
    this.player.meditate = true;
    this.meditating = { t: 0, ct: 0, n: 0, saved: this.cam.getState(), fx, spot, zone, zt: 0, hit0: this.combat.playerUnit.lastHit, world: this.world, gained: 0, toastT: 0, readyNoted: false, capNoted: false };
    this.combat?.setGuard(false);
    this.cam.set(null, pool ? 0.42 : 0.5, pool ? 9 : spot === 'free' ? 7.5 : 10);
    fx?.boost(1);
    const refilled = this.moves?.gourd.refill();          // 第十九轮：打坐调息时回血葫芦装满
    const where = `${zone.name}（×${zone.k}）${zone.source ? ' · ' + zone.source : ''}`;
    const gain = this.prog.capped ? '已达当前版本上限，修炼灵气不再积累' : `每秒 +${this.prog.rateAt(zone).toFixed(2)} 修炼灵气`;
    this.ui.toast((pool ? '于池心静修台盘膝坐定，池中水灵之气缓缓浮起……' : '盘膝坐定，引灵气入体……') + `<br>${where} · ${gain}（移动即可起身）` + (refilled ? '<br>腰间的葫芦也灌满了。' : ''));
  }
  updateMeditate(dt) {
    const m = this.meditating, mv = this.input.move(), U = this.combat.playerUnit, M = this.moves;
    if (Math.abs(mv.x) + Math.abs(mv.y) > 0.1 || this.ui.busy || this.scenic) { this.endMeditate(); return; }
    if (U.lastHit !== m.hit0) { this.endMeditate(false, '受击，内息一乱，收功起身'); return; }
    if (!U.alive) { this.endMeditate(true); return; }
    if (this.world !== m.world || this.player.flying) { this.endMeditate(true); return; }
    if (M && (M.held.light || M.held.power || M.held.guard || M.act)) { this.endMeditate(false, '出手，收功起身'); return; }
    m.t += dt; m.ct += dt;
    // 浓度每秒重算一次（位置不动，但秘境封印、区域可能变）
    if ((m.zt -= dt) <= 0) { m.zt = 1; m.zone = this.zoneHere(); if (!m.zone.ok) { this.endMeditate(false, m.zone.reason); return; } }
    m.gained += this.prog.absorb(dt, m.zone);
    this.cam.yaw += dt * 0.06;
    // 周天（行记里的说法）：聚灵阵约 7 秒一周天，浓度越高越快
    if (m.ct > 7 * 3 / Math.max(0.5, m.zone.k)) {
      m.ct = 0; m.n++;
      const S = this.state;
      S.d.cult = (S.d.cult || 0) + 1;
      S.save();
      if (S.d.cult === 9) setTimeout(() => this.ui.banner('气息渐稳', m.spot === 'pool' ? '灵池静修，吐纳九周天' : m.spot === 'array' ? '聚灵阵中吐纳九周天' : '吐纳九周天'), 600);
    }
    const P = this.prog, need = totalNeed(P.level);
    if (P.capped && !m.capNoted) { m.capNoted = true; this.ui.toast('已达当前版本上限（大乘大圆满）：灵气不再积累'); }
    else if (!P.capped && P.qi >= need && !m.readyNoted) { m.readyNoted = true; this.ui.toast('灵气已足——按 <b>L</b> 打开修为，提升修为'); }
    if ((m.toastT += dt) >= MEDITATE.toastEvery) { m.toastT = 0; this.ui.toast(`吐纳不辍 · 修炼灵气 ${Math.floor(P.qi)} / ${need}（本次 +${Math.round(m.gained)}）`); }
  }
  endMeditate(silent = false, why = null) {
    const m = this.meditating;
    if (!m) return;
    this.player.meditate = false;
    this.meditating = null;
    this.cam.setState(m.saved);
    m.fx?.boost(0);
    this.prog?.S.save();
    if (!silent) this.ui.toast(why || `缓缓收功，起身。${m.gained >= 1 ? `本次吐纳得修炼灵气 ${Math.round(m.gained)}` : ''}`);
  }

  // ---------- 修为面板（L）与提升修为 ----------
  // 此刻不安全的原因（null 为安全）：提升修为前后都校验一次
  unsafeReason() {
    const P = this.player;
    if (P.flying) return '御剑之中';
    if (this.arena?.active) return '切磋之中';
    if (this.boss50?.active && this.world === 'boss50') return '守关战中';
    if (this.boss30?.active && this.world === 'boss30') return '守关战中';
    if (this.lock || this.scenic || this.intro) return '此刻不能';
    if (this.ui.dlg) return '对话之中';
    if (!P.onGround) return '脚下不稳';
    const z = this.zoneHere();
    if (!z.ok && z.kind === 'demonic') return '魔气侵扰';
    return null;
  }
  openCultivation() {
    const P = this.prog;
    if (!P) return;
    const zone = this.zoneHere();
    const can = P.canAscend({ unsafe: this.unsafeReason() });
    const el = document.createElement('div');
    el.innerHTML = cultivationPanel(P, { zone, rate: P.rateAt(zone), can, phoenixMode: this.phoenix?.mode || 'strike', eqNote: '各把佩剑数值相同，换剑不改属性。' });
    this.panelKind = 'cultivation';
    this.ui.openPanel('修为', `${realmLabel(P.level)} · 第 ${P.level} 级（按 L 关闭）`, el, { width: 860 });
    el.querySelector('#ascend')?.addEventListener('click', () => { this.ui.closePanel(); setTimeout(() => this.startAscend(), 50); });
  }
  // 启动：加锁（重复点击不会启动两次），聚气演出；最终校验与一次性提交在 progression.commitAscend
  startAscend() {
    if (this.asc) return;
    if (this.meditating) this.endMeditate(true);
    const r = this.prog.beginAscend({ unsafe: this.unsafeReason(), world: this.world });
    if (!r.ok) { if (!r.dup) this.ui.toast(`暂不能提升修为：${r.reason}`); return; }
    this.asc = { t: 0, saved: this.cam.getState(), token: r.token, from: this.prog.level };
    this.player.meditate = true;
    this.combat?.setGuard(false);
    this.cam.set(null, 0.32, 6.5);
    this.sfxAscend?.('begin');
    this.ui.toast(`聚气 · 冲击 ${realmLabel(this.prog.level + 1)}——${ASCEND.gather} 秒内不要移动`);
  }
  updateAscend(dt) {
    const mv = this.input.move();
    const res = this.prog.tickAscend(dt, { moved: Math.abs(mv.x) + Math.abs(mv.y) > 0.1 || (this.moves && (this.moves.held.light || this.moves.act)), world: this.world, inCombat: this.combat.state === 'battle', unsafe: this.unsafeReason() });
    if (!res) { this.endAscendView(); return; }
    if (res.stage === 'gather') {
      this.progHud.ascend(res.k, `冲击 ${realmLabel(this.prog.level + 1)}`);
      this.cam.yaw += dt * 0.25;
      this.sfxAscend?.('gather', res.k);
      return;
    }
    this.endAscendView();
    if (res.stage === 'done') {
      const r1 = realmOf(res.from), r2 = realmOf(res.to);
      this.ui.banner(res.realmUp ? '突破' : '修为精进', `${realmLabel(res.to)} · 第 ${res.to} 级${res.realmUp ? `（${r1.name} → ${r2.name}）` : ''}`);
      this.ui.toast(`提升修为：扣除灵气 ${res.need}，${res.capLeft ? `剩余 ${Math.floor(res.capLeft)} 记入累计（已到上限，不再积累）` : `余 ${Math.floor(res.left)}`}。气血上限 ${Math.round(this.combat.playerUnit.maxHp)}，灵力上限 ${Math.round(this.moves.mpMax)}${res.to >= LEVEL.max ? '<br>已达当前版本上限：飞升上界，后续开放' : ''}`);
      this.sfxAscend?.('done', res);
    } else if (res.stage === 'cancel') this.ui.toast(`聚气中断（${res.reason}）——灵气、等级都未变`);
  }
  // 打坐、聚气时按了出手键（moves.press 转来）：收功起身 / 中断聚气（这一下不出剑）
  stillBroken() {
    if (this.asc) this.cancelAscend('出手');
    else if (this.meditating) this.endMeditate(false, '出手，收功起身');
  }
  cancelAscend(reason = '中断') { if (!this.asc) return; this.prog.cancelAscend(reason); this.endAscendView(); this.ui.toast(`聚气中断（${reason}）——灵气、等级都未变`); }
  endAscendView() {
    const a = this.asc;
    if (!a) return;
    this.asc = null;
    this.player.meditate = false;
    this.cam.setState(a.saved);
    this.progHud.ascend(null);
    this.sfxAscend?.('end');
  }
  // 聚气的声音与灵光（四周的灵光沿螺旋收进丹田，越到后面越密；提交时一圈金光）
  sfxAscend(stage, k = 0) {
    const P = this.player.pos, V = this.vfx;
    if (stage === 'begin') this.sound?.play('ascendGather', { at: P });
    if (stage === 'gather' && V) {
      const n = Math.random() < 0.35 + k * 0.6 ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = 2.6 + Math.random() * 1.6, h = 0.3 + Math.random() * 2.2;
        const p = new THREE.Vector3(P.x + Math.cos(a) * r, P.y + h, P.z + Math.sin(a) * r);
        const v = new THREE.Vector3(P.x - p.x, P.y + 1.0 - p.y, P.z - p.z).multiplyScalar(1.6).add(new THREE.Vector3(-Math.sin(a) * 1.4, 0, Math.cos(a) * 1.4));
        V.spawn({ p, v, tile: 'light', size: [0.22, 0.05], life: 0.62, color: Math.random() < 0.5 ? 0xf6d27a : 0x8fe5bc, alpha: 0.9, drag: 0.4 });
      }
    }
    if (stage === 'done') {
      this.sound?.play('ascendDone', { at: P });
      if (V) {
        V.spawn({ p: new THREE.Vector3(P.x, P.y + 0.1, P.z), tile: 'ringWide', mode: 3, size: [0.6, 7], life: 0.7, color: 0xf6d27a, alpha: 0.9 });
        V.spawn({ p: new THREE.Vector3(P.x, P.y + 1.1, P.z), tile: 'glow', size: [1, 5], life: 0.5, color: 0xfff1c2, alpha: 0.9 });
        for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2; V.spawn({ p: new THREE.Vector3(P.x, P.y + 1.0, P.z), v: new THREE.Vector3(Math.cos(a) * 4, 2 + Math.random() * 2, Math.sin(a) * 4), tile: 'light', size: [0.25, 0.05], life: 0.9, color: 0xf6d27a, alpha: 0.9, drag: 1.2 }); }
      }
    }
  }
  // 筑基短续航：到时提示、自行缓降；落地后歇一会儿才能再起
  updateFlightRule(dt) {
    const P = this.player, rule = this.prog?.flightRule?.();
    if (this.flyRest > 0 && !P.flying) this.flyRest -= dt;
    if (!P.flying) { if (this.flyT > 0 && rule) this.flyRest = rule.rest; this.flyT = 0; this.input.forceDown = false; return; }
    if (!rule) { this.input.forceDown = false; return; }
    const t0 = this.flyT;
    this.flyT += dt;
    if (t0 < rule.warn && this.flyT >= rule.warn) this.ui.toast(`真元将尽：${Math.round(rule.secs - rule.warn)} 秒后须落地（筑基短续航）`);
    if (this.flyT >= rule.secs) {
      if (!this.input.forceDown) { const why = P.flight.land(); this.ui.toast(why ? '真元已尽 · 缓缓降下' : '真元已尽 · 收剑下落'); }
      this.input.forceDown = true;
    }
  }
  // 徽记与准星（每帧；只在内容变了时改 DOM）
  updateProgHud() {
    const P = this.prog;
    if (!P) return;
    const m = this.meditating, ready = !P.capped && P.qi >= totalNeed(P.level);
    this.progHud.update(P, { show: !this.intro && !document.querySelector('#hud')?.classList.contains('hidden'), meditating: !!m, zone: m?.zone, rate: m ? P.rateAt(m.zone) : 0, ready });
    this.progHud.steer(this.phoenix?.hudInfo());
  }

  // ---------- 后山奇遇 ----------
  restPavilion() {
    const S = this.state;
    if (S.event('fox')) {
      this.ui.talk({ name: '听松亭', title: '' }, [{ who: 'narr', text: '松涛一阵阵从谷底涌上来。亭柱上有人用指甲刻了一只小小的狐狸，刻痕已经很旧了。' }]);
      return;
    }
    S.discover('pavilion');
    const fade = document.querySelector('#fade');
    this.lock = true;
    fade.classList.add('on');
    this.ui.toast('你倚着亭栏坐下，闭目听松……');
    setTimeout(() => {
      // 灵狐出现在亭阶前
      const a = SITES.pavilion, p = this.player.pos;
      const dx = p.x - a.x, dz = p.z - a.z, d = Math.hypot(dx, dz) || 1;
      const fx = p.x - (dx / d) * 2.2, fz = p.z - (dz / d) * 2.2;
      this.fox.place(fx + 1.2, this.terrain.heightAt(fx + 1.2, fz), fz, Math.atan2(p.x - fx, p.z - fz));
      this.fox.root.visible = true;
      this.fox.state = 'sit';
      this.player.faceTarget = this.fox.root.position;
      fade.classList.remove('on');
      this.lock = false;
      this.ui.talk({ name: '听松亭', title: '奇遇' }, [
        { who: 'narr', text: '松风渐起，山岚从谷底漫上来，亭外的一切都隐进白茫茫的雾里。' },
        { who: 'narr', text: '等雾气稍散，亭阶下多了一只通体雪白的小狐。它的尾尖泛着淡淡的青光，正歪着头打量你。' },
        { who: 'narr', text: '你没有动。它试探着走近两步，把嘴里叼着的一枚小果轻轻放在你脚边。', opts: [
          { label: '收下灵果，轻声道谢', main: true, then: [
            { who: 'narr', text: '果子入手微凉，果皮上似有薄雾流转。', do: () => { S.give('foxfruit', 1); this.ui.toast('获得 <b>雾隐果</b>'); } },
            { who: 'narr', text: '灵狐轻轻蹭了蹭你的衣角，转身钻进东边的灌木丛，只留下一串梅花似的爪印。' },
          ] },
          { label: '伸手想摸摸它', then: [
            { who: 'narr', text: '灵狐往后一缩，却没有逃走。它把小果往你脚边又推了推，这才扭头钻进东边的灌木丛。', do: () => { S.give('foxfruit', 1); this.ui.toast('获得 <b>雾隐果</b>'); } },
          ] },
        ] },
      ], { onEnd: () => {
        S.event('fox', true);
        const den = SITES.den;
        this.fox.walkTo(den.x - 1.6, den.z + 1.2, 3.0, () => { this.fox.state = 'sit'; this.fox.root.rotation.y = 2.4; });
        this.ui.banner('灵狐赠果', '后山奇遇 · 东边灌木丛后，似乎就是它的住处');
        this.updateTracker(true);
      } });
    }, 1900);
  }

  greetDragon(kind) {
    const S = this.state, d = this.ctx.dragons?.[kind];
    if (d) { d.puffT = 0.8; }
    const first = S.discover('greet-' + kind);
    const lines = kind === 'ice' ? [
      { who: 'narr', text: '冰龙缓缓低下头，青白的鳞片上凝着一层细霜。它的目光落在你身上，呼出的气息在空中结成细碎的冰晶。' },
      { who: 'narr', text: first ? '台边石碑记着：「开山之初，寒潭有龙，与祖师立约，守宗门西岭。」此后数百年，西岭的山火、雪崩与外敌，都止于寒玉台前。' : '冰龙轻轻摆了摆尾，又把视线投回宗门。' },
    ] : [
      { who: 'narr', text: '火龙抬起头，赤铜色的鳞片间透出暗红的光。它从鼻端喷出一缕火星，在你面前散成点点余烬，算是打过招呼。' },
      { who: 'narr', text: first ? '台下刻着一行字：「赤岩之龙，与寒潭之龙并为护宗神龙。东守后山，凡魔祟近山门者，焚之。」' : '火龙低低地哼了一声，热浪拂过台面。' },
    ];
    this.ui.talk({ name: kind === 'ice' ? '冰龙' : '火龙', title: '护宗神龙' }, lines);
  }

  petFox() {
    const S = this.state;
    S.discover('den');
    const n = S.event('foxPet') || 0;
    S.event('foxPet', n + 1);
    this.fox.state = 'idle';
    setTimeout(() => { this.fox.state = 'sit'; }, 2500);
    const lines = ['灵狐眯起眼睛，任你挠了挠它的下巴。', '它绕着你转了一圈，尾巴扫过你的手背，凉丝丝的。', '灵狐打了个哈欠，在石下的小洞口趴了下来。'];
    this.ui.talk({ name: '灵狐', title: '后山' }, [{ who: 'narr', text: lines[n % lines.length] }]);
  }
}
