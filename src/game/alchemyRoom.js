// 丹房室内的玩法：推门进屋 / 出门（淡出淡入切换场景；走到门口即出门）、屋里各处的互动与描写
import { IY, ALCHEMY_SPOTS as SP } from '../world/interior.js';
import { HERBS } from '../world/interiorProps.js';
import { SITES } from '../world/layout.js';
import { TIME } from '../world/time.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// 抽屉里的药材（其余按通用描写）
const HERB_TEXT = {
  当归: '切成薄片的当归，断面黄白，油润有菊花心，甜里带一点辛。',
  人参: '几支老参用红绳捆着，芦头上的节密密匝匝——少说也有五六十年。抽屉底垫着一层青苔，保着潮气。',
  灵芝: '一朵赤芝，伞面像上了漆，一圈圈云纹。旁边压着竹签：「后山松下所得，勿轻用。」',
  清露: '晒干的清露草叶子卷成细条，颜色仍是青的，凑近还闻得到一点露水的清气。',
  赤阳: '赤阳果晒成了红褐色，皱缩得像小枣。苏木在签上补了一句：「性燥，须配清露。」',
  朱砂: '一小包朱砂，用油纸裹了三层，颜色红得刺眼。签上写着「炼丹用，忌入口」。',
  雪莲: '一朵干雪莲，花瓣半透明，像薄绢。说是从北边极寒之地换来的，宝贝得很。',
  首乌: '何首乌切成厚片，断面有一圈圈云锦似的花纹。',
};

export class AlchemyRoom {
  constructor(game) {
    this.g = game; this.ui = game.ui; this.S = game.state;
    this.busy = false;
  }

  addInteractions() {
    const g = this.g, at = (k) => ({ x: SP[k].x, y: IY + SP[k].y, z: SP[k].z, r: SP[k].r });
    g.add({ id: 'alcExit', ...at('exit'), h: 2.0, label: () => '出门 · 回到庭院', act: () => this.exit() });
    g.add({ id: 'alcFurnace', ...at('furnace'), h: 2.2, label: () => '观火 · 青铜丹炉', act: () => this.furnace() });
    g.add({ id: 'alcCabinet', ...at('cabinet'), h: 1.6, label: () => '拉开抽屉 · 百子药柜', act: () => this.cabinet() });
    g.add({ id: 'alcCabinet2', ...at('cabinet2'), h: 1.6, label: () => '拉开抽屉 · 百子药柜', act: () => this.cabinet() });
    g.add({ id: 'alcNotes', ...at('notes'), h: 1.2, label: () => '翻阅 · 丹方手记', act: () => this.notes() });
    g.add({ id: 'alcShelf', ...at('shelf'), h: 1.6, label: () => '端详 · 多宝格', act: () => this.shelf() });
    g.add({ id: 'alcStove', ...at('stove'), h: 1.2, label: () => '看火 · 煎药灶', act: () => this.stove() });
    g.add({ id: 'alcBed', ...at('bed'), h: 1.2, label: () => '小憩 · 罗汉床', act: () => this.rest() });
    g.add({ id: 'alcPainting', ...at('painting'), h: 2.0, label: () => '观画 · 山水挂轴', act: () => this.painting() });
  }

  // 出门后站在门前台基上，面朝庭院
  surfaceSpawn() {
    // 第十轮：丹殿换成高台殿后，门前站处取殿门互动点（台上门前）
    const D = this.g.ctx?.anchors?.alchemyDoor;
    if (D) return { x: D.x, z: D.z + 0.6, yaw: 0 };
    const S = SITES.alchemy;
    return { x: S.x, z: S.z + 5.4, yaw: 0 };
  }

  async enter() {
    const g = this.g;
    if (this.busy || g.world !== 'surface') return;
    if (g.abyssQuest?.inv) { this.ui.toast('魔影正在宗门里作乱——先退敌，再进屋不迟。'); return; }
    this.busy = true; g.lock = true;
    const fade = document.querySelector('#fade');
    fade.classList.add('dark', 'on');
    await wait(700);
    try {
      await g.switchWorld('alchemy');
    } catch (e) {
      console.error(e);
      this.ui.toast('门从里面闩上了（室内陈设未能载入）');
      fade.classList.remove('on');
      setTimeout(() => fade.classList.remove('dark'), 1200);
      g.lock = false; this.busy = false;
      return;
    }
    await wait(150);
    fade.classList.remove('on');
    setTimeout(() => fade.classList.remove('dark'), 1200);
    g.lock = false; this.busy = false;
    if (!this.S.event('alchemyIn')) {
      this.S.event('alchemyIn', true);
      setTimeout(() => this.ui.banner('丹房', '炉火常年不熄 · 屋里比屋外暖得多'), 400);
    } else this.ui.toast('推门进来，一股温热的药香扑面而来。');
  }

  async exit() {
    const g = this.g;
    if (this.busy || g.world !== 'alchemy') return;
    this.busy = true; g.lock = true;
    if (g.channel) { g.channel = null; this.ui.hideChannel(); }
    const fade = document.querySelector('#fade');
    fade.classList.add('dark', 'on');
    await wait(600);
    await g.switchWorld('surface');
    await wait(150);
    fade.classList.remove('on');
    setTimeout(() => fade.classList.remove('dark'), 1200);
    g.lock = false; this.busy = false;
    this.ui.toast(TIME.hour < 5.4 || TIME.hour > 18.9 ? '掩上门，夜风凉丝丝的，屋檐下的药匾轻轻晃着。' : '掩上门，日光一下子亮得晃眼。');
  }

  // 走到门口（跨出门槛）即出门
  update() {
    const g = this.g;
    if (g.world !== 'alchemy' || this.busy || g.lock || this.ui.busy) return;
    const p = g.player.pos;
    if (g.interior?.inDoorway(p.x, p.z) && g.player.vel.z > 0.5) this.exit();
  }

  furnace() {
    const done = this.S.herb.stage === 3;
    this.ui.talk({ name: '青铜丹炉', title: '丹房' }, [
      { who: 'narr', text: '丹炉三足两耳，比人还高。腹上一道饕餮纹带，炉盖镂着云气，宝顶是一枚鎏金的圆珠。炉门里的火压得很低，橙里透青——苏木说这叫「文火」。' },
      { who: 'narr', text: '炉台是两级八角石台，台面刻着先天八卦与太极，卦象朝外。炉前一只蒲团，坐得中间都凹了下去。' },
      { who: 'narr', text: done ? '炉里正炼着你送来的清露草，药香微苦，压住了赤阳果的燥气。再过两个时辰便能开炉。' : '炉口飘出的青烟一缕缕升到梁下，绕着挂满的药串散开。炉膛里的炭火「噼」地爆了一声，溅出几点火星。' },
    ]);
  }

  cabinet() {
    const name = HERBS[Math.floor(Math.random() * HERBS.length)];
    const text = HERB_TEXT[name] || `抽屉里是${name}，切得齐齐整整，码在竹纸上，气味${Math.random() < 0.5 ? '清苦' : '微辛'}。`;
    this.ui.talk({ name: '百子药柜', title: '丹房 · 北墙' }, [
      { who: 'narr', text: '北墙三组药柜，一组八列七行，满满一墙小抽屉，每只上贴着手写的药名签，铜拉手被摸得锃亮。少数几只没推严，露出一线药香。' },
      { who: 'narr', text: `你拉开一只写着「${name}」的抽屉——${text}` },
    ]);
  }

  notes() {
    const first = !this.S.event('alchemyNotes');
    this.S.event('alchemyNotes', true);
    this.ui.talk({ name: '丹方手记', title: '苏木手书' }, [
      { who: 'narr', text: '长案上摊着一册线装手记，墨迹还新。左页写着一张丹方：' },
      { who: 'narr', text: '「<b>养元丹</b>：清露草五钱、赤阳果三枚、茯苓二两、甘草一钱。文火三时，武火一刻。丹成色如温玉。」' },
      { who: 'narr', text: '右页是几笔线描：一株清露草，叶子对生；旁边画着丹炉，炉门处注着小字「火候七分」。手记旁压着一杆戥子、一方砚台。' },
    ], { onEnd: () => { if (first) this.ui.toast('记下了 <b>养元丹方</b>'); } });
  }

  shelf() {
    this.ui.talk({ name: '多宝格', title: '丹房 · 东墙' }, [
      { who: 'narr', text: '东墙一架多宝格，格子有大有小。小格里立着一排排药瓶，瓶塞是软木的，瓶颈缠着细绳；瓶里的丹液各有颜色——赤的、碧的、紫的、青的，在炉火里微微发亮。' },
      { who: 'narr', text: '大格里是封口的瓷罐和铜罐，罐口压着朱红的符纸。最上层摆着几只陶盆，盆里种着药苗。' },
    ]);
  }

  stove() {
    this.ui.talk({ name: '煎药灶', title: '丹房 · 东北角' }, [
      { who: 'narr', text: '砖砌的两眼灶连着屋后的烟囱，灶上各坐一只药罐，咕嘟咕嘟地煎着，白汽一阵一阵往上冒。灶门里的柴火烧得正旺，柴垛就码在烟囱后面。' },
      { who: 'narr', text: '灶边一口水缸，缸沿搭着一只葫芦瓢。' },
    ]);
  }

  async rest() {
    const g = this.g;
    if (this.busy) return;
    this.busy = true; g.lock = true;
    const fade = document.querySelector('#fade');
    fade.classList.add('dark', 'on');
    this.ui.toast('在罗汉床上靠了一会儿，炉火噼啪，药香暖融融的……');
    await wait(1400);
    TIME.hour = (TIME.hour + 1) % 24;
    await wait(300);
    fade.classList.remove('on');
    setTimeout(() => fade.classList.remove('dark'), 1200);
    g.lock = false; this.busy = false;
    this.ui.toast('小憩了半个时辰，<b>精神饱满</b>');
  }

  painting() {
    this.ui.talk({ name: '山水挂轴', title: '丹房 · 西墙' }, [
      { who: 'narr', text: '一幅绢本水墨：远山叠了三层，一层淡过一层；两山之间挂一道白练似的瀑布，近处两株古松，松下一座小亭。' },
      { who: 'narr', text: '右上题着四句：「炉火映丹砂，松风过药篱。一壶山月白，不羡上清时。」落款处钤一方小印，是「青岚」二字。两旁的对联写着：丹砂九转，松月一壶。' },
    ]);
  }
}
