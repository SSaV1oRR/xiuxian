// 通天塔（第十三轮）的玩法：自塔前抱厦下的正门入塔 / 出塔（淡出淡入切换场景；从正门走出门槛、或在门内按 E 即出塔，回到抱厦下），
// 塔内：守塔执事的对话（通天塔的来历、日后的挑战与楼层传送阵的用法——二层以上一律「尚未开放」，不假装已经做好）、
// 楼层传送阵（列出百层与各层的开放状态；目前只有一层开放）、百层碑。
// 楼层配置在 towerSpec.js 的 TOWER_FLOORS：楼层号、名称、开放状态、目标场景（预留）、用途；日后开放某层只需改那里的 open
// 并接上对应的挑战场景。
import { TOWER_FLOORS } from '../world/towerSpec.js';
import { TH_SPOTS } from '../world/towerHall.js';
import { TIME } from '../world/time.js';
import { T50 } from '../world/tower50.js';
import { T30 } from '../world/tower30.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const KIND = { trial: '试炼', rest: '休整', boss: '守关', hall: '接引' };

export class TowerRoom {
  constructor(game) {
    this.g = game; this.ui = game.ui; this.S = game.state;
    this.busy = false;
  }

  addInteractions() {
    const g = this.g, D = g.towerIsle?.door;
    if (D) g.add({ id: 'towerDoor', x: D.x, y: D.y, z: D.z, r: 3.4, h: 2.6, label: () => '入塔 · 通天塔一层', sub: () => '接引大厅', act: () => this.enter() });
    const at = (k) => ({ x: TH_SPOTS[k].x, y: 0, z: TH_SPOTS[k].z, r: TH_SPOTS[k].r, world: 'tower' });
    g.add({ id: 'towerExit', ...at('exit'), h: 2.4, label: () => '出塔 · 回到塔前广场', act: () => this.exit() });
    g.add({ id: 'towerSteward', ...at('steward'), h: 2.4, label: () => '交谈 · 守塔执事', act: () => this.talk(), npc: 'steward' });
    g.add({ id: 'towerDais', ...at('dais'), h: 1.3, label: () => '启动 · 楼层传送阵', act: () => this.floors() });
    g.add({ id: 'towerStele', ...at('stele'), h: 2.6, label: () => '细看 · 百层碑', act: () => this.stele() });
    // 第十六轮：第五十层 · 镇龙封印殿（坐标在第五十层的独立场景里）：南门内离开、通关 / 失败后在殿心重启封印再战
    const B = () => g.boss50;
    g.add({ id: 'b50Exit', x: 0, y: 0, z: T50.entry.z + 0.6, r: 3.6, h: 2.4, world: 'boss50', enabled: () => !!B()?.active && !B().fighting && !B().blockMove,
      label: () => '离开 · 回到通天塔一层', sub: () => '楼层传送阵', act: () => B()?.exit() });
    g.add({ id: 'b50Again', x: 0, y: 0, z: 0, r: 4.0, h: 1.6, world: 'boss50', enabled: () => !!B() && (B().state === 'result' || B().state === 'failed'),
      label: () => '重启封印 · 再战镇塔龙君', act: () => B()?.retry() });
    // 第二十四轮：第三十层 · 烬狱剑台：桥头拱门下离开、通关 / 失败后在台心再战
    const B3 = () => g.boss30;
    g.add({ id: 'b30Exit', x: 0, y: 0, z: T30.entry.z + 0.4, r: 3.0, h: 2.4, world: 'boss30', enabled: () => !!B3()?.active && !B3().fighting && !B3().blockMove,
      label: () => '离开 · 回到通天塔一层', sub: () => '楼层传送阵', act: () => B3()?.exit() });
    g.add({ id: 'b30Again', x: 0, y: 0, z: 0, r: 4.0, h: 1.6, world: 'boss30', enabled: () => !!B3() && (B3().state === 'result' || B3().state === 'failed'),
      label: () => '再次挑战 · 烬狱剑尊', act: () => B3()?.retry() });
  }

  // 出塔后站在正门外的抱厦下，面朝塔前广场
  surfaceSpawn() { const D = this.g.towerIsle.door; return { x: D.x, y: D.y, z: D.z + 1.0, yaw: 0 }; }

  async enter() {
    const g = this.g;
    if (this.busy || g.world !== 'surface') return;
    if (g.abyssQuest?.inv) { this.ui.toast('魔影正在宗门里作乱——先退敌，再入塔不迟。'); return; }
    this.busy = true; g.lock = true;
    const fade = document.querySelector('#fade');
    fade.classList.add('dark', 'on');
    await wait(600);
    try {
      await g.switchWorld('tower');
    } catch (e) {
      console.error(e);
      this.ui.toast('塔门紧闭（塔内未能载入）');
      fade.classList.remove('on');
      setTimeout(() => fade.classList.remove('dark'), 1200);
      g.lock = false; this.busy = false;
      return;
    }
    await wait(120);
    fade.classList.remove('on');
    setTimeout(() => fade.classList.remove('dark'), 1200);
    g.lock = false; this.busy = false;
    if (!this.S.event('towerIn')) {
      this.S.event('towerIn', true);
      setTimeout(() => this.ui.banner('通天塔 · 一层', '接引大厅 · 厅心楼层传送阵 · 北面守塔执事'), 400);
    } else this.ui.toast('跨进塔门，大厅里宫灯长明。');
  }

  async exit() {
    const g = this.g;
    if (this.busy || g.world !== 'tower') return;
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
    this.ui.toast(TIME.hour < 5.4 || TIME.hour > 18.9 ? '出得塔来，山风凛冽，塔身的灯一层层亮到云里。' : '出得塔来，塔前广场一片天光，塔身直入云中。');
  }

  // 自正门走出门槛（向南）即出塔
  update() {
    const g = this.g;
    if (g.world !== 'tower' || this.busy || g.lock || this.ui.busy) return;
    const p = g.player.pos;
    if (g.towerHall?.inDoorway(p.x, p.z) && g.player.vel.z > 0.5) this.exit();
  }

  talk() {
    const ui = this.ui, S = this.S, sp = { name: '守塔执事', title: '通天塔' };
    const npc = this.g.towerHall?.steward;
    if (npc) npc.talking = true;
    const first = !S.event('stewardMet');
    S.event('stewardMet', true);
    const menu = () => ({
      text: '还有什么想问的？',
      opts: [
        { label: '通天塔是什么来历？', then: () => [
          { text: '通天塔共一百层，是开山祖师云岫子当年在这座孤岛上立的。塔身一层一层往上收，越往上灵气越烈，塔顶直入罡风。' },
          { text: '每一层原本都封着一处试炼——有的考剑法，有的考心性，十层一关有守关的灵兽。祖师说：「登一层，见一层的天地。」' },
          menu(),
        ] },
        { label: '我现在能上去试炼吗？', main: true, then: () => [
          { text: '大多还不能。二层往上的试炼都还封着——宗门还没议定登塔的章程，各层的禁制也还没重新布好。' },
          { text: '只有<b>第五十层</b>的门户先亮了：那一层叫镇龙封印殿，封着守关的<b>镇塔龙君·烬霄</b>。楼层传送阵上点第 50 层就能过去。' },
          { text: '先说清楚：那头龙不是木人桩。地上红光标出的那几招挡不住，只能躲；它蓄力的时候打乱它的架势，才有机会。进去觉得撑不住，按退格键退出来，不丢人。' },
          menu(),
        ] },
        { label: '厅心那座阵台是做什么的？', then: () => [
          { text: '那是楼层传送阵。阵眼刻着百层的符纹，日后各层的试炼场都由它送人进去——每一层都是单独的一处天地，不在这塔身里头走楼梯。' },
          { text: '现在除了这一层，其余的门户都暗着。你站上去也只看得到一张楼层名册：哪层开了、哪层还封着，一目了然。' },
          menu(),
        ] },
        { label: '告辞。', then: 'end' },
      ],
    });
    ui.talk(sp, [
      { text: first ? '青岚宗的弟子？难得有人御剑飞到这儿来。这里是通天塔一层，接引大厅。我是守塔执事，看着这座塔已经有些年头了。' : this.S.d.tower50?.wins ? '又来了。听说你把第五十层那头龙打服了——了不起。别的楼层还封着。' : '又来了。第五十层的门户还亮着，别的楼层都还封着。' },
      menu(),
    ], { onEnd: () => { if (npc) npc.talking = false; } });
  }

  // 楼层传送阵：百层名册（一层与第五十层开放；第五十层点选即进入挑战说明，其余只提示尚未开放）
  floors() {
    const ui = this.ui, g = this.g;
    const box = document.createElement('div');
    box.className = 'tower-floors';
    const head = document.createElement('p');
    head.className = 'tf-note';
    head.innerHTML = '阵眼刻着百层符纹。二层以上各是一处独立的挑战场景：<b>第三十层（守关 · 烬狱剑尊）、第五十层（守关 · 镇塔龙君·烬霄）已经开放</b>，点它即可前往挑战；其余楼层<b>尚未开放</b>。';
    box.appendChild(head);
    const grid = document.createElement('div');
    grid.className = 'tf-grid';
    for (const F of TOWER_FLOORS) {
      const b = document.createElement('button');
      b.className = 'tf' + (F.open ? ' open' : '') + (F.kind === 'boss' ? ' boss' : '') + (F.floor === 1 ? ' here' : '');
      b.innerHTML = `<b>${F.floor}</b><small>${F.floor === 1 ? '此处' : F.kind === 'boss' && F.open ? '守关' : F.open ? '已开放' : '未开放'}</small>`;
      b.title = `${F.name} · ${KIND[F.kind] || ''} · ${F.open ? '已开放' : '尚未开放'}（场景：${F.scene}）`;
      b.addEventListener('click', () => {
        if (F.floor === 1) ui.toast('你就在一层 · 接引大厅');
        else if (!F.open) ui.toast(`第 ${F.floor} 层（${KIND[F.kind]}）<b>尚未开放</b>——挑战场景还在筹备`);
        else if (F.scene === 'boss50') { ui.closePanel(); setTimeout(() => g.boss50?.openChallenge(), 60); }
        else if (F.scene === 'boss30') { ui.closePanel(); setTimeout(() => g.boss30?.openChallenge(), 60); }
      });
      grid.appendChild(b);
    }
    box.appendChild(grid);
    g.panelKind = 'towerFloors';
    ui.openPanel('楼层传送阵', '通天塔 · 一百层', box, { width: 720, onClose: () => { if (g.panelKind === 'towerFloors') g.panelKind = null; } });
  }

  stele() {
    this.ui.talk({ name: '百层碑', title: '通天塔 · 一层' }, [
      { who: 'narr', text: '青石碑上阴刻「通天百层」四个大字，下面密密排着一百个小格，一层一格。只有最底下那一格填了朱砂，写着「接引」二字。' },
      { who: 'narr', text: this.S.d.tower50?.wins ? '第五十格新近填了金粉，刻着「镇龙」二字——那是你击败镇塔龙君·烬霄留下的。其余的格子都还空着，每十格的边上刻着一道粗线，是守关的楼层。' : '其余九十九格都还空着，只在每十格的边上刻了一道粗线——听说那是守关的楼层。第五十格的粗线泛着一点紫光。' },
    ]);
  }
}
