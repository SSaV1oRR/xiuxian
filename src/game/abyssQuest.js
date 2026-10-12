// 幽渊秘境的流程：线索（听松亭北的残碑）→ 机关（崖下石门的日、月、星三枚符纹，按碑文「星沉 月隐 日……」的次序按下）
// → 进入秘境（独立的地下场景）→ 殿中魔修两波（残魂与术士；幽渊魔将）→ 核心祭坛加固封印（按住 E）→ 奖励 → 返回宗门；
// 返回后逃逸的魔影袭山：魔影自后山松林与西岭溪谷来犯，护宗双龙警戒并协助防御。
// 进度（发现线索、石门已开、封印已固、袭山已退）写入存档；石门开启后舆图上才标出「幽渊秘境」，之后可随时从石门再次进入。
import * as THREE from 'three';
import { ABYSS_GATE } from '../world/layout.js';
import { Y0, ABYSS_EXIT } from '../world/abyss.js';
import { DRAGON_COMBAT } from './combatConfig.js';
import { surfaceQi, abyssQi, qiGrade, QI_KINDS } from './regions.js';

// 正式游玩：秘境发现前不公开（舆图、导航都不标），须先在听松亭北读残碑、再按符纹次序打开崖下石门。
// 开发调试入口：网址加 ?dev=abyss 时石门一开始就开着、舆图标「渊」，便于直接进出秘境测试（不写入存档）。
export const DIRECT_ENTRY = typeof location !== 'undefined' && new URLSearchParams(location.search).get('dev') === 'abyss';

const RUNES = ['日', '月', '星'];
const ORDER = ['星', '月', '日'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 袭山魔影的来路：东路自残碑旁的地缝涌出，沿草径下到听松亭，再循后山小径扑向上院（下山途中进入火龙射程）；
// 西路自西岭溪谷而下，在古碑空地集结（处在冰龙射程之内，被寒息减速、冻结）
const ROUTE_EAST = [[96.4, -164.8], [96, -161.2], [95.2, -157.4], [93.8, -153.6], [91.6, -150.4], [88.4, -148.9], [88.6, -146], [87, -141], [83, -136], [77, -132], [70, -129], [64, -124], [61, -117], [60, -110], [56, -105], [50, -100], [42, -98], [34, -97.5], [20, -97.5], [8, -92]];
const ROUTE_WEST = [[-112.4, -72], [-112.6, -60], [-111, -52]];

export class AbyssQuest {
  constructor(game) {
    this.g = game;
    this.seq = [];
    this.trial = 'idle';       // idle 未触发 / fight 殿中交战 / cleared 魔修已除 / sealed 已封
    this.wave = 0;
    this.inv = null;
    this.invT = 0;
    this.busy = false;
    if (this.S.event('abyssSealed')) this.trial = 'sealed';
    if (this.S.event('invasion') === 'pending') this.invT = 8;
    // 旧存档（曾由直接进入的版本进过秘境）：已进入、已封印或已经历袭山的，视为已发现，保留探索进度
    const S = this.S;
    if (!S.event('abyssOpen') && (S.event('abyssEntered') || S.event('abyssSealed') || S.event('invasion'))) {
      S.event('abyssOpen', true);
      S.discover('abyss');
    }
  }
  get S() { return this.g.state; }
  isOpen() { return DIRECT_ENTRY || !!this.S.event('abyssOpen'); }
  get ui() { return this.g.ui; }
  get combat() { return this.g.combat; }

  // ---------- 互动点 ----------
  addInteractions() {
    const g = this.g, A = g.ctx.anchors, S = this.S;
    if (A.abyssClue) g.add({ id: 'abyssClue', ...A.abyssClue, r: 2.6, h: 1.5, label: () => (S.event('abyssClue') ? '细看 · 残碑' : '查看 · 半埋的残碑'), act: () => this.readClue() });
    if (A.abyssDoor) g.add({ id: 'abyssDoor', ...A.abyssDoor, r: 3.6, h: 2.8,
      label: () => (this.isOpen() ? '进入 · 幽渊秘境' : '查看 · 崖下石门'),
      sub: () => (this.isOpen() ? (S.event('abyssSealed') ? '封印已固' : '魔气未散') : ''),
      act: () => (this.isOpen() ? this.enter() : this.inspectDoor()) });
    // 秘境中（坐标在地下场景里，高度远低于地表，不会与地表互动点混淆）
    const ex = { x: ABYSS_EXIT.x, y: Y0 + ABYSS_EXIT.y, z: ABYSS_EXIT.z }, al = { x: 0, y: Y0 - 0.17, z: 3.3 }, rc = { x: 0, y: Y0 - 0.17, z: 6.4 };
    g.add({ id: 'abyssExit', ...ex, r: 2.8, h: 2.2, label: () => '返回 · 后山石洞', act: () => this.exit() });
    g.add({ id: 'abyssAltar', ...al, r: 2.6, h: 2.6, enabled: () => this.trial === 'cleared' || this.trial === 'sealed',
      label: () => (this.trial === 'sealed' ? '凝视 · 镇魔祭坛' : '加固封印 · 核心祭坛'), sub: () => (this.trial === 'sealed' ? '' : '按住 E'),
      hold: 3, holdIf: () => this.trial === 'cleared', holdText: '引灵气入阵……', breakText: '封印中断',
      act: () => (this.trial === 'sealed' ? this.altarLore() : this.seal()) });
    g.add({ id: 'abyssCircle', ...rc, r: 1.8, h: 1.2, enabled: () => this.trial === 'sealed', label: () => '传送 · 回到后山', act: () => this.exit() });
  }

  readClue() {
    const S = this.S, first = !S.event('abyssClue');
    S.event('abyssClue', true);
    this.ui.talk({ name: '残碑', title: '听松亭北' }, [
      { who: 'narr', text: '半截石碑斜插在土里，碑首断落在一旁，断口长满青苔。碑脚的地缝里渗出一缕缕暗红的雾气，贴着地面缓缓流动——草叶碰到它，便蜷缩发黑。' },
      { who: 'narr', text: '残存的碑文依稀可辨：「……封<b>幽渊</b>于此下……<b>星沉　月隐　日</b>……」再往下的字被人凿去了。' },
      { who: 'narr', text: first ? '暗红的雾气顺着地缝向北延伸，没入崖下一片乱石与老松之后。' : '地缝里的魔气仍在丝丝渗出，指向北面崖下。' },
    ], { onEnd: () => { if (first) { this.ui.toast('线索：碑文「星沉　月隐　日……」'); this.g.updateTracker(true); } } });
  }

  inspectDoor() {
    const S = this.S;
    if (!S.event('abyssClue')) {
      this.ui.talk({ name: '崖下石门', title: '' }, [
        { who: 'narr', text: '乱石与老松后面，崖壁上嵌着一扇石门，门缝里透出丝丝寒气。门上刻着三枚符纹——日、月、星，纹路里积着暗红的垢。' },
        { who: 'narr', text: '你推了推，石门纹丝不动。三枚符纹似乎都能按下去，却不知该按哪一枚。听松亭北面好像有块残碑，碑脚也冒着这样的红雾……' },
      ]);
      return;
    }
    this.seq = [];
    this.ui.talk({ name: '崖下石门', title: '机关' }, [
      { who: 'narr', text: '石门上的三枚符纹与残碑上的字遥相呼应。碑文说：「星沉　月隐　日……」' },
      this.runeStep(),
    ]);
  }
  runeStep() {
    return { who: 'narr', text: () => (this.seq.length ? `已按下：${this.seq.join(' → ')}` : '三枚符纹微微凸起，可以按下去。'),
      opts: () => [...RUNES.map((r) => ({ label: `按下「${r}」纹`, then: () => this.press(r) })), { label: '暂且离开', then: 'end' }] };
  }
  press(r) {
    this.seq.push(r);
    const ok = this.seq.every((x, i) => x === ORDER[i]);
    if (!ok) { this.seq = []; return [{ who: 'narr', text: `「${r}」纹一沉，三枚符纹同时暗了下去，石门深处传来一声闷响。次序不对。` }, this.runeStep()]; }
    if (this.seq.length < 3) return [{ who: 'narr', text: `「${r}」纹沉入石中，纹路里亮起一线暗红的光。` }, this.runeStep()];
    return [{ who: 'narr', text: '最后一枚「日」纹沉下，三道红光沿着门缝连成一线——石门轰然下沉。', do: () => this.openGate() }];
  }
  openGate() {
    const S = this.S, g = this.g;
    S.event('abyssOpen', true);
    S.discover('abyss');
    g.ctx.abyssGate?.setOpen(true, true);
    g.cam.shake = 0.7;
    setTimeout(() => { this.ui.banner('幽渊秘境', '后山崖下的石洞已开，石阶向地底延伸'); g.updateTracker(true); }, 2400);
  }

  // ---------- 进出秘境 ----------
  async enter() {
    if (this.busy) return;
    const g = this.g;
    this.busy = true; g.lock = true;
    const fade = document.querySelector('#fade');
    fade.classList.add('dark', 'on');
    this.ui.toast('沿石阶下行，寒意一阶重过一阶……');
    await wait(900);
    try {
      await g.switchWorld('abyss');
    } catch (e) {
      console.error(e);
      this.ui.toast('石阶尽头一片漆黑，什么也看不清（秘境素材未能载入）');
      fade.classList.remove('on');
      g.lock = false; this.busy = false;
      return;
    }
    await wait(200);
    fade.classList.remove('on');
    setTimeout(() => fade.classList.remove('dark'), 1500);
    g.lock = false; this.busy = false;
    if (!this.S.event('abyssEntered')) {
      this.S.event('abyssEntered', true);
      setTimeout(() => this.ui.banner('幽渊秘境', '宗门地底 · 封存多年的魔修遗迹'), 600);
    }
    g.updateTracker(true);
  }
  async exit() {
    if (this.busy) return;
    const g = this.g;
    this.busy = true; g.lock = true;
    if (g.channel) { g.channel = null; this.ui.hideChannel(); }
    const fade = document.querySelector('#fade');
    fade.classList.add('dark', 'on');
    await wait(900);
    this.resetTrial();
    await g.switchWorld('surface');
    await wait(200);
    fade.classList.remove('on');
    setTimeout(() => fade.classList.remove('dark'), 1500);
    g.lock = false; this.busy = false;
    this.ui.toast(this.trial === 'sealed' ? '重见天日。山风里还带着一丝腥甜的魔气……' : '重见天日，松风扑面。');
    if (this.trial === 'sealed' && !this.S.event('invasion')) { this.S.event('invasion', 'pending'); this.invT = 5; }
    g.updateTracker(true);
  }
  // 回到地表时的落脚点：石门外的平台，背对洞口
  surfaceSpawn() {
    const G = ABYSS_GATE, fx = Math.sin(G.face), fz = Math.cos(G.face);
    return { x: G.x + fx * 3.6, z: G.z + fz * 3.6, yaw: G.face };
  }

  // ---------- 殿中之战 ----------
  startTrial() {
    this.g.prog?.recordEvent('abyss', 22);              // 第二十一轮：秘境的完成奖励按进殿交战时记下的基准（之后升级也不变）
    const ab = this.g.abyss, cb = this.combat;
    this.trial = 'fight'; this.wave = 1;
    this.ui.toast('殿中魔气骤然翻涌——');
    this.g.cam.shake = 0.35;
    const P = this.g.player.pos;
    // 第一波：残魂从外环两侧与对面围来，术士在对面外环远远施法
    const list = [['shade', 0.95, 16.8], ['shade', -0.95, 16.8], ['shade', Math.PI, 16.8], ['caster', 2.2, 16.8]];
    this.waveN = list.length; this.spawned = 0;
    list.forEach(([kind, a, r], i) => setTimeout(() => {
      if (this.trial !== 'fight' || this.g.world !== 'abyss') return;
      const s = ab.spot(a, r);
      const e = cb.spawn(kind, new THREE.Vector3(s.x, s.y, s.z), { yaw: Math.atan2(P.x - s.x, P.z - s.z), aggro: 60 });
      e.state = 'chase';
      this.spawned++;
      cb.fx(e.pos, 0x8a1020, 50, 1.0, 4, 1.0);
    }, 300 + i * 450));
    this.g.updateTracker(true);
  }
  spawnElite() {
    const ab = this.g.abyss, cb = this.combat;
    this.ui.toast('祭坛上的魔晶裂开一道缝，一个高大的身影从红光里走了出来——');
    this.g.cam.shake = 0.5;
    const s = ab.spot(0, 3.75), P = this.g.player.pos;
    const e = cb.spawn('elite', new THREE.Vector3(s.x, s.y, s.z), { yaw: Math.atan2(P.x - s.x, P.z - s.z), aggro: 60 });
    e.state = 'chase';
    cb.fx(e.pos, 0xff2a14, 90, 1.4, 6, 1.2);
    for (const [a, r] of [[1.6, 16.8], [-1.6, 16.8]]) {
      const q = ab.spot(a, r);
      const m = cb.spawn('shade', new THREE.Vector3(q.x, q.y, q.z), { yaw: Math.atan2(P.x - q.x, P.z - q.z), aggro: 60 });
      m.state = 'chase';
      cb.fx(m.pos, 0x8a1020, 40, 1.0, 4, 1.0);
    }
    this.waveN = 3; this.spawned = 3;
    this.g.abyss.crack(1);
  }
  clearAbyssEnemies() {
    const cb = this.combat;
    for (const e of [...cb.enemies]) if (e.world === 'abyss') { e.dispose(); cb.enemies.splice(cb.enemies.indexOf(e), 1); }
  }
  // 力竭：在秘境中则回到入口洞室，殿中之战重来
  resetTrial() {
    this.clearAbyssEnemies();
    this.pending = false;
    if (this.trial === 'fight') { this.trial = 'idle'; this.wave = 0; this.g.abyss.crack(0); }
  }

  seal() {
    const S = this.S, g = this.g;
    this.trial = 'sealed';
    S.event('abyssSealed', true);
    g.abyss.setSealed(true);
    S.give('mojing', 1); S.give('canjuan', 1);
    S.d.merit += 30; S.save();
    g.cam.shake = 0.3;
    this.ui.banner('封印重固', '四象镇魔阵复明，幽渊魔气渐散');
    this.ui.toast('获得 <b>幽渊魔晶</b> ×1、<b>镇魔残卷</b> ×1，<b>宗门贡献</b> +30');
    // 第二十一轮：秘境有独立的完成目标（加固封印）——追加修炼灵气（本级基础需求的 10%，只发一次；击杀另按降妖结算，不重复）
    const P = this.g.prog;
    if (P) setTimeout(() => P.grantOnce('abyss.seal', 0.1, P.d.events?.abyss || P.recordEvent('abyss', 22), '秘境 · 幽渊封印'), 900);
    setTimeout(() => this.ui.talk({ name: '核心祭坛', title: '幽渊秘境' }, [
      { who: 'narr', text: '四尊石像手中的锁链由红转青，绷得笔直。魔晶的裂缝一点点合拢，殿中翻涌的红雾被吸回阵心，水面重新映出天窗漏下的冷光。' },
      { who: 'narr', text: '祭坛基座下压着半卷玉简，题着「四象镇魔」。你把它收进怀里。' },
      { who: 'narr', text: '就在封印合拢的一刹，几缕黑影贴着岩壁窜进了天窗——那是宗门的方向。' },
    ], { onEnd: () => g.updateTracker(true) }), 1200);
    g.updateTracker(true);
  }
  altarLore() {
    this.ui.talk({ name: '镇魔祭坛', title: '幽渊秘境' }, [
      { who: 'narr', text: '魔晶悬在阵心缓缓转动，青色的光链把它牢牢锁住。石像低垂的眼睑下，似乎也带着一丝倦意。' },
    ]);
  }

  // ---------- 袭山 ----------
  startInvasion() {
    const cb = this.combat, T = this.g.terrain;
    this.inv = { total: 0, t: 0 };
    cb.invasion = true;
    this.S.event('invasion', 'pending');
    this.g.prog?.recordQuest('invasion');               // 第二十一轮：宗门任务（魔影袭山，中等）的奖励基准
    this.ui.banner('魔影袭山', '幽渊逃出的魔影自后山与西岭来犯，护宗双龙已警戒');
    const spawnRoute = (route, n, kinds) => {
      for (let i = 0; i < n; i++) setTimeout(() => {
        if (!this.inv || this.g.world !== 'surface') return;
        const [x, z] = route[0], ox = (i % 2 ? 0.3 : -0.3), oz = 0;
        const p = new THREE.Vector3(x + ox, T.heightAt(x + ox, z + oz), z + oz);
        const rt = route.slice(1).map(([a, b]) => ({ x: a, z: b }));
        const e = cb.spawn(kinds[i % kinds.length], p, { route: rt, yaw: Math.atan2(rt[0].x - p.x, rt[0].z - p.z) });
        cb.fx(e.pos, 0x6a1020, 40, 1.0, 3.5, 1.0);
      }, i * 1100);
      this.inv.total += n;
    };
    spawnRoute(ROUTE_EAST, 4, ['invader', 'invader', 'invCaster', 'invader']);
    spawnRoute(ROUTE_WEST, 3, ['invader', 'invCaster', 'invader']);
    this.g.updateTracker(true);
  }
  endInvasion() {
    const S = this.S;
    this.inv = null;
    this.combat.invasion = false;
    S.event('invasion', 'done');
    S.give('yangyuan', 1); S.d.merit += 20; S.save();
    this.ui.banner('魔影尽退', '护宗双龙收敛锋芒，重归驻守');
    this.ui.toast('护山有功：获得 <b>养元丹</b> ×1，<b>宗门贡献</b> +20');
    setTimeout(() => this.g.prog?.completeQuest('invasion'), 900);      // 第二十一轮：宗门任务的修炼灵气（中等 10%，只发一次）
    this.g.updateTracker(true);
  }

  // 护宗双龙的目标：宗门场景里离龙最近的魔修（只看敌对阵营，不会选中玩家与同门）
  threatFor(d) {
    if (this.g.world !== 'surface') return null;
    return this.combat.nearestHostile(d.base, DRAGON_COMBAT.alertRadius);
  }
  alertFor() { return this.g.world === 'surface' && this.combat.invasion; }

  // ---------- 每帧 ----------
  update(dt) {
    const g = this.g, cb = this.combat;
    if (g.world === 'abyss') {
      const p = g.player.pos;
      if (this.trial === 'idle' && Math.hypot(p.x, p.z) < 16.5 && Math.abs(p.y - Y0) < 3 && cb.playerUnit.alive) this.startTrial();
      if (this.trial === 'fight') {
        const alive = cb.alive('abyss').length;
        if (alive === 0 && !this.pending && this.spawned >= this.waveN) {
          if (this.wave === 1) { this.wave = 2; this.pending = true; setTimeout(() => { this.pending = false; if (this.trial === 'fight' && g.world === 'abyss') this.spawnElite(); }, 1600); }
          else if (this.wave === 2) {
            this.trial = 'cleared';
            g.abyss.crack(0.6);
            this.ui.toast('魔将溃散。祭坛上的封印裂痕清晰可见——登上祭坛，<b>按住 E</b> 加固封印');
            g.updateTracker(true);
          }
        }
      }
    } else {
      g.ctx.abyssGate?.update(dt);
      // 第一次走近残碑：提示一下北面的异样
      const A = g.ctx.anchors.abyssClue, p = g.player.pos;
      if (A && !this.noticed && !this.S.event('abyssClue') && Math.hypot(p.x - A.x, p.z - A.z) < 24 && Math.abs(p.y - A.y) < 10) {
        this.noticed = true;
        this.ui.toast('北面的草丛里升起一缕暗红的雾气，草叶都发黑了……');
      }
      const calm = !!this.S.event('abyssSealed');
      if (this._calm !== calm) { this._calm = calm; g.ctx.abyssGate?.setCalm?.(calm); }
      if (g.world === 'surface' && this.invT > 0 && (this.invT -= dt) <= 0 && !this.inv && this.S.event('invasion') === 'pending') this.startInvasion();
      if (this.inv && g.world === 'surface') {
        this.inv.t += dt;
        if (this.inv.t > 8 && cb.alive('surface').length === 0) this.endInvasion();
      }
    }
  }
  // ---------- 界面 ----------
  qiHere() {
    const g = this.g, p = g.player.pos;
    return g.world === 'abyss' ? abyssQi(p.x, p.z, this.trial === 'sealed') : surfaceQi(p.x, p.z, { anchors: g.ctx.anchors, sealed: !!this.S.event('abyssSealed') });
  }
  qiLabel() {
    const q = this.qiHere();
    return { kind: q.kind, text: `${qiGrade(q.level)}${QI_KINDS[q.kind].name}`, title: q.source || '' };
  }

  tracker() {
    const S = this.S, g = this.g;
    if (this.inv) {
      const left = this.combat.alive('surface').length, done = Math.max(0, this.inv.total - left);
      return { title: '护山退魔', tag: '入侵', progress: done / this.inv.total, lines: [{ text: `击退来犯魔影 ${done}/${this.inv.total}` }, { text: '护宗双龙已警戒：冰龙寒息减速、冻结，火龙火球焚烧一片' }] };
    }
    if (DIRECT_ENTRY && this.trial !== 'sealed' && g.world !== 'abyss') {
      return { title: '幽渊秘境', tag: '秘境', lines: [{ text: '后山听松亭北面的崖下石洞（舆图上标「渊」）' }, { text: '从上院东南的「后山」牌坊上山，过听松亭向北，走到石门前按 E 进入' }] };
    }
    if (!S.event('abyssClue') && !DIRECT_ENTRY) {
      // 只给出线索（残碑）的去处，不标出秘境本身
      if (!S.event('abyssHint')) return null;
      return { title: '传闻 · 后山断碑', tag: '传闻', lines: [{ text: '听说后山听松亭北面有块冒红雾的断碑' }, { text: '从上院东南的「后山」牌坊上山，到听松亭后往北找' }] };
    }
    if (!this.isOpen()) return { title: '残碑魔气', tag: '奇遇', lines: [{ text: '读过听松亭北的残碑：「星沉　月隐　日……」', done: true }, { text: '循着地缝里的魔气，找到北面崖下的石门' }] };
    if (this.trial !== 'sealed') {
      if (g.world !== 'abyss') return { title: '幽渊秘境', tag: '秘境', lines: [{ text: '后山崖下的石门已开', done: true }, { text: '进入幽渊秘境，查明魔气的来源' }] };
      const lines = [{ text: '沿石阶下行，进入地下殿堂', done: this.trial !== 'idle' }];
      if (this.trial === 'fight') {
        const left = this.combat.alive('abyss').length;
        lines.push(this.wave === 1 ? { text: `击退殿中魔修 ${Math.max(0, this.spawned - left)}/${this.waveN}` } : { text: `击败幽渊魔将${left > 1 ? `（尚余 ${left}）` : ''}` });
      }
      if (this.trial === 'cleared') lines.push({ text: '殿中魔修已除', done: true }, { text: '登上核心祭坛，按住 E 加固封印' });
      return { title: '幽渊秘境', tag: '秘境', lines };
    }
    if (S.event('invasion') !== 'done') return { title: '幽渊秘境', tag: '已封印', lines: [{ text: '核心祭坛的封印已加固', done: true }, { text: g.world === 'abyss' ? '返回宗门（祭坛前的传送阵，或来时的石阶）' : '几缕魔影逃出了秘境……' }] };
    return null;
  }
  mapMarkers() {
    if (!this.isOpen()) return [];
    return [{ x: ABYSS_GATE.x, z: ABYSS_GATE.z, icon: '渊', color: '#5a2433', label: '幽渊秘境' }];
  }
  journal() {
    const S = this.S, out = [];
    if (S.event('abyssClue')) out.push(`<span class="tag ${S.event('abyssOpen') ? 'jade' : ''}">后山残碑 · 星沉月隐</span>`);
    if (S.event('abyssEntered')) out.push(`<span class="tag ${this.trial === 'sealed' ? 'jade' : 'red'}">幽渊秘境 · ${this.trial === 'sealed' ? '封印重固' : '魔气未散'}</span>`);
    if (S.event('invasion') === 'done') out.push('<span class="tag jade">护山退魔 · 双龙御敌</span>');
    return out.join('');
  }
}
