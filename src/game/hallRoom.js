// 问道殿室内的玩法（第十一轮）：自正门入殿 / 出殿（淡出淡入切换场景；从正门走出门槛即出殿，回到殿前抱厦）、
// 五层各处的互动与描写。室内与宗门共用世界坐标，互动点按 hallSpec 的楼层高度换算
import { HALL, floorY, levelAt } from '../world/hallSpec.js';
import { HALL_SPOTS as SP } from '../world/hallInterior.js';
import { TIME } from '../world/time.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class HallRoom {
  constructor(game) {
    this.g = game; this.ui = game.ui; this.S = game.state;
    this.busy = false;
  }

  addInteractions() {
    const g = this.g, at = (k) => ({ x: HALL.x + SP[k].x, y: floorY(SP[k].l), z: HALL.z + SP[k].z, r: SP[k].r, world: 'hall' });
    g.add({ id: 'hallExit', ...at('exit'), h: 2.2, label: () => '出殿 · 回到云顶', act: () => this.exit() });
    g.add({ id: 'hallAltar', ...at('altar'), h: 2.6, label: () => '上香 · 祖师牌位', act: () => this.altar() });
    g.add({ id: 'hallArmillary', ...at('armillary'), h: 2.2, label: () => '仰观 · 浑天仪', act: () => this.armillary() });
    for (const k of ['booksW', 'booksE']) g.add({ id: 'hall-' + k, ...at(k), h: 1.9, label: () => '翻阅 · 藏经阁典籍', act: () => g.openLibrary() });
    g.add({ id: 'hallRelics', ...at('relics'), h: 1.4, label: () => '端详 · 丹瓶', act: () => this.relics() });
    g.add({ id: 'hallSwords', ...at('swords'), h: 1.7, label: () => '端详 · 青玉剑架', act: () => this.swords() });
    g.add({ id: 'hallMeditate', ...at('meditate'), h: 1.4, label: () => '静坐 · 静修堂', act: () => this.meditate() });
    g.add({ id: 'hallMap', ...at('map'), h: 1.4, label: () => '展阅 · 宗门舆图', act: () => g.openMap() });
    g.add({ id: 'hallView', ...at('view'), h: 1.9, label: () => '凭窗 · 观云阁', act: () => this.view() });
  }

  // 出殿后站在正门外的抱厦里，面朝殿前月台
  surfaceSpawn() {
    const D = this.g.ctx?.anchors?.hallDoor;
    return D ? { x: D.x, y: D.y, z: D.z + 1.4, yaw: 0 } : { x: HALL.x, y: HALL.y, z: HALL.z + HALL.levels[0].d / 2 + 2.8, yaw: 0 };
  }

  async enter() {
    const g = this.g;
    if (this.busy || g.world !== 'surface') return;
    if (g.abyssQuest?.inv) { this.ui.toast('魔影正在宗门里作乱——先退敌，再入殿不迟。'); return; }
    this.busy = true; g.lock = true;
    const fade = document.querySelector('#fade');
    fade.classList.add('dark', 'on');
    await wait(600);
    try {
      await g.switchWorld('hall');
    } catch (e) {
      console.error(e);
      this.ui.toast('殿门紧闭（殿内陈设未能载入）');
      fade.classList.remove('on');
      setTimeout(() => fade.classList.remove('dark'), 1200);
      g.lock = false; this.busy = false;
      return;
    }
    await wait(120);
    fade.classList.remove('on');
    setTimeout(() => fade.classList.remove('dark'), 1200);
    g.lock = false; this.busy = false;
    if (!this.S.event('hallIn')) {
      this.S.event('hallIn', true);
      setTimeout(() => this.ui.banner('问道殿', '五层楼阁 · 东西两座楼梯直上观云阁'), 400);
    } else this.ui.toast('跨过门槛，殿里比殿外静得多。');
  }

  async exit() {
    const g = this.g;
    if (this.busy || g.world !== 'hall') return;
    this.busy = true; g.lock = true;
    if (g.channel) { g.channel = null; this.ui.hideChannel(); }
    if (g.scenic) g.endScenic();
    const fade = document.querySelector('#fade');
    fade.classList.add('dark', 'on');
    await wait(500);
    await g.switchWorld('surface');
    await wait(120);
    fade.classList.remove('on');
    setTimeout(() => fade.classList.remove('dark'), 1200);
    g.lock = false; this.busy = false;
    this.ui.toast(TIME.hour < 5.4 || TIME.hour > 18.9 ? '出得殿来，夜风满袖，檐下宫灯一盏盏亮着。' : '出得殿来，天光一下子亮得晃眼，天阶直落山下。');
  }

  // 自一层正门走出门槛（向南）即出殿
  update() {
    const g = this.g;
    if (g.world !== 'hall' || this.busy || g.lock || this.ui.busy) return;
    const p = g.player.pos;
    if (levelAt(p.y) === 0 && g.hall?.inDoorway(p.x, p.z) && g.player.vel.z > 0.5) this.exit();
  }

  altar() {
    const first = !this.S.event('hallIncense');
    this.S.event('hallIncense', true);
    this.ui.talk({ name: '祖师牌位', title: '问道殿 · 一层' }, [
      { who: 'narr', text: '北墙正中一座须弥座供台，前出五级汉白玉踏步。香案上一只小铜炉、两支红烛，青烟笔直。案后立着朱漆牌位：「开山祖师云岫子之位」。' },
      { who: 'narr', text: '牌位后悬一幅巨大的立轴，水墨远山，上书「问道」二字，落款「云岫子书」，钤一方「青岚」朱印。' },
      { who: 'narr', text: '回身望去，正门内上方一块匾写着「问道在心」——据说是祖师的原话：「问道在心，不在山高。」' },
    ], { onEnd: () => { if (first) this.ui.toast('在祖师牌位前上了一炷香'); } });
  }

  armillary() {
    this.ui.talk({ name: '浑天仪', title: '问道殿 · 中庭' }, [
      { who: 'narr', text: '殿心的中庭直通三层，一架青铜浑天仪悬在半空，由一根铜链挂在四层楼板下。外重是地平环与子午环，刻着一圈细细的度数；内重的赤道环、黄道环与四游环绕着一根斜轴缓缓转动。' },
      { who: 'narr', text: '正中一颗青玉珠，白天温润，入夜透出淡淡的青光。脚下的圆台刻着先天八卦与太极，台前三排蒲团，朝着北墙的祖师牌位。' },
    ]);
  }

  relics() {
    this.ui.talk({ name: '法器阁', title: '问道殿 · 三层' }, [
      { who: 'narr', text: '长案上排着八只丹瓶，瓶里的丹液各有颜色，在灯下微微发亮。两侧的多宝格里是封口的药罐，罐口压着朱红的符纸。' },
      { who: 'narr', text: '案头一张字条：「法器阁所藏，皆历代掌门所遗。外门弟子可观，不可动。」' },
    ]);
  }

  swords() {
    this.ui.talk({ name: '青玉剑架', title: '问道殿 · 三层' }, [
      { who: 'narr', text: '三座剑架各横着三柄长剑，剑身是半透明的青玉，剑格包金。走近了，剑身里仿佛有一缕极淡的雾气在流转。' },
      { who: 'narr', text: '架下刻着小字：「剑在鞘中，道在心中。」' },
    ]);
  }

  meditate() {
    this.ui.talk({ name: '静修堂', title: '问道殿 · 四层' }, [
      { who: 'narr', text: '一圈十二只蒲团围着青铜香炉，四面屏风挡住了穿堂风。北壁四幅条幅：「静」「心」「守」「一」。' },
      { who: 'narr', text: '你在蒲团上坐了一会儿。殿外的风声隔着窗纸，远得像在山下；香炉里的烟一丝不乱。' },
    ]);
  }

  // 观云阁南窗：凭窗远眺（自由机位，自窗内向南俯瞰中轴）
  view() {
    const y = floorY(4) + 1.7, z = HALL.z + HALL.levels[4].d / 2 - 0.9;
    this.g.scenicView({ free: true, pos: [HALL.x, y, z], at: [0, 22, -40], pan: 0.3, text: '观云阁凭窗：天阶如练，上院、凌云阁、演武广场一层层落在脚下，山门外的云海接着天。（任意键返回）' });
  }
}
