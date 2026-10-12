// 青岚宗 · 入口：画质、载入流程、世界装配、主循环
import * as THREE from 'three';
import { Terrain, CORE } from './world/terrain.js';
import { Sky } from './world/sky.js';
import { buildDistant } from './world/distant.js';
import { buildClouds, buildCloudSea } from './world/clouds.js';
import { GLOBAL, FOGU } from './world/shaderlib.js';
import { CollisionWorld } from './core/collision.js';
import { Input } from './core/input.js';
import { Player } from './actors/player.js';
import { Cultivator } from './actors/cultivator.js';
import { buildCultivatorClips } from './actors/cultivatorClips.js';
import { CombatDebug } from './ui/combatDebug.js';
import { FollowCamera, CAM } from './actors/camera.js';
import { START, PANORAMA, SITES, ZONES } from './world/layout.js';
import { setEnvMap, installShadowProxies, batchArchitecture, setDetailDistance } from './world/arch/builder.js';
import { SectContext, buildSect, setupSway } from './world/sect.js';
import { lerp, damp } from './core/math.js';
import { Vegetation } from './world/vegetation.js';
import { Water } from './world/water.js';
import { Ambient } from './world/ambient.js';
import { UI } from './ui/ui.js';
import { Minimap } from './ui/minimap.js';
import { drawBaseMap, drawFullMap } from './ui/mapdraw.js';
import { GameState } from './game/state.js';
import { Game } from './game/game.js';
import { setupTouch } from './ui/touch.js';
import { installDebug } from './debug.js';
import { loadTowerModel, installTower } from './world/tower.js';
import { loadAssets, ASSETS } from './world/assets.js';
import { TIME, advanceTime, shichen } from './world/time.js';
import { Dragon } from './world/dragons.js';
import { Abyss } from './world/abyss.js';
import { Combat } from './game/combat.js';
import { PointerControl } from './core/pointer.js';
import { Petals } from './world/petals.js';
import { Interior } from './world/interior.js';
import { HallInterior } from './world/hallInterior.js';
import { HALL } from './world/hallSpec.js';
import { Post } from './world/post.js';
import { Isles } from './world/isles.js';
import { Lingchi } from './world/lingchi.js';
import { buildJadePillars } from './world/arch/ornaments.js';
import { waterfall } from './world/falls.js';
import { Cranes } from './world/cranes.js';
import { Motes } from './world/motes.js';
import { Lawn } from './world/lawn.js';
import { buildCliffs } from './world/cliffs.js';
import { Crags } from './world/crags.js';
import { NightLights, stairLamps } from './world/nightLights.js';
import { flightInput, FLY } from './actors/flight.js';
import { bakeSolidCols } from './world/solidCols.js';
import { TowerIsle } from './world/towerIsle.js';
import { TowerHall } from './world/towerHall.js';
import { Teleport } from './game/teleport.js';
import { teleportArray } from './world/arch/portal.js';
import { Builder } from './world/arch/builder.js';
import { Vfx, getAtlas } from './world/vfx.js';
import { SkillFx } from './game/skillfx.js';
import { InkFx } from './game/inkFx.js';
import { Moves } from './game/moves.js';
import { Armory, equipSword } from './game/swords.js';
import { buildArenaSite } from './world/arenaSite.js';
import { Arena } from './game/arena.js';
import { Tower50Hall } from './world/tower50.js';
import { Boss50Fight } from './game/boss50Fight.js';
import { Tower30Hall } from './world/tower30.js';
import { Boss30Fight } from './game/boss30Fight.js';
import { SoundFx } from './core/audio.js';
import { Progression } from './game/progression.js';
import { PhoenixSkill } from './game/phoenix.js';
import { PhoenixFx } from './game/phoenixFx.js';
import { PHOENIX, PLAYER_COMBAT, LOADOUT } from './game/combatConfig.js';
import { Loadout } from './game/loadout.js';
import { ThunderDragon } from './game/thunderDragon.js';
import { InkFinale } from './game/inkFinale.js';
import { InkFinaleFx } from './game/inkFinaleFx.js';
import { InkStage } from './game/inkStage.js';
import { FINALE } from './game/inkFinaleConfig.js';
import { MEDITATE } from './game/progressConfig.js';

const $ = (s) => document.querySelector(s);
let api_endIntro = () => {};
let api_paused = () => false;
const QUALITY = {
  low: { pr: 1, aa: false, shadow: 1024, range: 40, veg: 0.6, grass: false, particles: 0.5, treeShadows: false, far: false },
  mid: { pr: Math.min(devicePixelRatio, 1.5), aa: true, shadow: 2048, range: 56, veg: 1, grass: true, particles: 1, treeShadows: true, far: true },
  high: { pr: Math.min(devicePixelRatio, 2), aa: true, shadow: 2048, range: 70, veg: 1.25, grass: true, particles: 1, treeShadows: true, far: true },
};
const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && Math.min(innerWidth, innerHeight) < 820);
let qName = localStorage.getItem('qinglan.quality') || (isMobile ? 'low' : 'mid');
if (!QUALITY[qName]) qName = 'mid';
const Q = QUALITY[qName];

let lastStep = performance.now(), lastTxt = 'start';
const timings = [];
const step = (txt, p) => {
  const now = performance.now();
  timings.push(`${lastTxt} ${Math.round(now - lastStep)}ms`);
  lastStep = now; lastTxt = txt;
  $('#loading .txt').textContent = txt;
  $('#loading .bar i').style.width = `${Math.round(p * 100)}%`;
  return new Promise((r) => setTimeout(r, 16));
};

async function init() {
  const renderer = new THREE.WebGLRenderer({ antialias: Q.aa, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Q.pr);
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;        // 第二十三轮：雷龙由裂隙逐段穿出（只有带裁切平面的材质受影响）
  installShadowProxies(renderer);
  $('#app').appendChild(renderer.domElement);
  // 柔光与轻微调色（流畅画质不启用）
  const post = new Post(renderer, { enabled: qName !== 'low' });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.3, 6000);

  await step('收集素材……', 0.03);
  await loadAssets(renderer, { lo: qName === 'low', onProgress: (k) => { $('#loading .bar i').style.width = `${Math.round(3 + k * 14)}%`; } });
  if (ASSETS.failed.length) console.info('部分素材未能载入，相应部分改用程序化效果：', ASSETS.failed);
  await step('勘定山势……', 0.18);
  const terrain = new Terrain({ quality: qName });
  await step('铺展地表……', 0.3);
  terrain.build(scene);
  const sky = new Sky(renderer, scene, { shadowMap: Q.shadow, shadowRange: Q.range });
  setEnvMap(sky.envMap);
  sky.onEnv.push((env) => setEnvMap(env));
  buildDistant(scene);
  buildClouds(scene, { density: qName === 'low' ? 0.5 : 1, lit: sky.u.uCloudLit, shade: sky.u.uCloudShade });
  // 谷中云气：西涧、山门前深涧、东谷与山门外谷地（宗门所在山台浮在云上）
  buildClouds(scene, { density: qName === 'low' ? 0.6 : 1, lit: sky.u.uCloudLit, shade: sky.u.uCloudShade, rseed: 91, fade: [12, 42], name: 'valley-mist', banks: [
    [-100, 7, -18, 22, 2, 0.35], [-99, 5, 12, 22, 2, 0.35], [-94, 2, 44, 24, 2, 0.35], [-80, -1, 76, 26, 2, 0.35], [-55, -4, 106, 28, 2, 0.35],
    [-25, -6, 128, 26, 2, 0.35], [20, -8, 150, 30, 2, 0.35], [55, -9, 166, 36, 2, 0.3],
    [98, -4, -64, 26, 2, 0.3], [104, -8, -24, 34, 3, 0.28], [108, -10, 14, 36, 3, 0.28], [104, -10, 52, 38, 3, 0.28], [92, -10, 92, 36, 3, 0.28], [70, -10, 126, 32, 2, 0.3],
    [150, -6, 14, 62, 3, 0.26], [150, -6, 62, 62, 3, 0.26],
    [0, -8, 236, 120, 3, 0.22], [-120, -6, 214, 110, 3, 0.22], [132, -10, 236, 120, 3, 0.22],
  ] });
  // 云海：东谷、山门前深涧与山门外谷地、西涧（两层，上层稀疏）
  // 第十轮：谷底下切后云层随之下移（比谷底高十到二十米），台沿以下四五十米的岩壁露在云上
  buildCloudSea(scene, { lit: sky.u.uCloudLit, shade: sky.u.uCloudShade, sheets: [
    [96, -24, -66, 12, 22], [103, -30, -28, 18, 30], [107, -34, 12, 20, 34], [104, -36, 52, 22, 34], [94, -36, 90, 22, 30], [72, -33, 124, 20, 24],
    [190, -28, 30, 70, 110], [0, -30, 236, 170, 90], [-150, -28, 220, 120, 90], [150, -30, 226, 120, 90],
    [-20, -24, 140, 30, 16], [30, -26, 156, 34, 18],
    [-100, -8, -14, 9, 26], [-98, -12, 22, 10, 26], [-88, -16, 60, 12, 24], [-64, -20, 96, 16, 22],
  ] });
  buildCloudSea(scene, { lit: sky.u.uCloudLit, shade: sky.u.uCloudShade, name: 'cloud-sea-2', opacity: 0.55, sheets: [
    [106, -26, 0, 16, 34], [102, -28, 64, 18, 34], [84, -26, 108, 18, 24], [0, -24, 250, 140, 80], [-140, -22, 230, 100, 70],
    [-99, -5, 6, 7, 22], [-80, -12, 76, 12, 20],
  ] });
  // 五区岩台之下深谷里的薄雾（两层，下浓上淡：谷底若隐若现，崖脚落石与树丛透出来，岩壁上半截清楚可辨）
  buildCloudSea(scene, { lit: sky.u.uCloudLit, shade: sky.u.uCloudShade, name: 'valley-sea', opacity: 0.5, sheets: [
    [48, -26, 78, 26, 30], [26, -27, 108, 12, 14], [72, -34, 70, 14, 22],
    [-48, -18, 76, 24, 28], [-28, -24, 108, 12, 14], [-88, -12, 18, 8, 22],
  ] });
  buildCloudSea(scene, { lit: sky.u.uCloudLit, shade: sky.u.uCloudShade, name: 'valley-sea-2', opacity: 0.28, sheets: [
    [50, -22, 82, 22, 26], [-48, -14, 80, 20, 24], [92, -36, 20, 7, 30],
  ] });
  // 西涧源头的飞瀑（古碑旁跌水之下，溪水自此落入深涧）
  {
    const L = terrain.stream.line, s0 = terrain.gorgeS - 3.9, at = L.at(s0);
    const top = terrain.streamY(s0) + 0.12, bot = terrain.streamY(terrain.gorgeS + 0.6);
    waterfall(scene, { x: at.x, y: top, z: at.z, ry: Math.atan2(at.tx, at.tz), len: top - bot, w: 3.4, spread: 0.9, out: 0.28, lit: sky.u.uCloudLit, shade: sky.u.uCloudShade });
  }
  const cw = new CollisionWorld(16);

  await step('营建山门与院落……', 0.4);
  setDetailDistance(qName === 'low' ? 45 : qName === 'high' ? 110 : 75);       // 细部构件（瓦当、净瓶、柱础莲瓣等）的显示距离
  const ctx = new SectContext(scene, cw, terrain);
  ctx.skyU = sky.u;                       // 瀑布、云气用天空的受光色
  ctx.lowShadows = qName === 'low';
  buildSect(ctx);
  // 灵池（东翼临崖的池台）与玉柱（各处的玉柱身统一实例化）
  ctx.lingchi = new Lingchi(ctx, { env: sky.envMap, lit: sky.u.uCloudLit, shade: sky.u.uCloudShade, quality: qName });
  sky.onEnv.push((env) => { ctx.lingchi.waterMat.envMap = env; });
  buildJadePillars(ctx);
  stairLamps(ctx);                        // 第十三轮：登云阶平台、问心阶阶脚补石灯（问心阶、天阶平台原有石灯，夜间照明）
  buildArenaSite(ctx);                    // 第十五轮：演武场（天阶东侧的台地）上的牌坊、比试圈、石灯、兵器架、战鼓、旗与石凳
  // 宗门传送阵（第十三轮）：接引院西侧的空地——近山门，不在中轴甬道、殿门之前，也不在魔影袭山的路线上
  const sectPortal = { id: 'sect', name: '青岚宗 · 接引台', desc: '山门内接引院西侧，北上问心阶即入宗门。', x: -10.5, y: 2.0, z: 87.5 };
  { const b = new Builder(); teleportArray(b, 0, 0, 0, { r: 3.4 }); ctx.place(b, { x: sectPortal.x, y: sectPortal.y - 0.02, z: sectPortal.z, name: '宗门传送阵' }); }
  sectPortal.y += 0.36; sectPortal.arrive = { x: -7.4, z: 83.2, yaw: Math.PI };
  setupSway(ctx.sway);
  // 护宗双龙：共用飞龙素材，各自克隆骨骼、材质与动画
  const dragons = ASSETS.models.dragon ? { ice: new Dragon(ctx, 'ice'), fire: new Dragon(ctx, 'fire') } : {};
  ctx.dragons = dragons;
  await step('迎藏经阁……', 0.52);
  // （第七轮起藏经阁依参照图营造为三层方阁，原 chinese_tower 圆形塔楼模型不再加载；tower.js 保留以便回退）
  void loadTowerModel; void installTower;
  // 全部建筑就位后按材质分块合批（减少绘制调用）
  const tb = performance.now();
  const batchInfo = batchArchitecture(scene);
  if (batchInfo) batchInfo.ms = Math.round(performance.now() - tb);
  await step('引溪入池……', 0.6);
  const water = new Water(scene, terrain, sky.envMap);
  sky.onEnv.push((env) => water.setEnv(env));
  // 崖壁（第八轮）：五区台地之下的岩壁网格，崖脚落石、岩台灌木与崖口孤松交给植被一并实例化
  const tc = performance.now();
  const cliffs = buildCliffs(ctx, { quality: qName });
  (ctx.extraVeg ||= []).push(...cliffs.veg);
  timings.push(`崖壁 ${Math.round(performance.now() - tc)}ms ${cliffs.tris} tris`);
  // 山岩（第十轮）：扫描岩壁实例化成台地绝壁、外谷谷壁与山脊崖面的大岩体
  const tk = performance.now();
  const crags = new Crags(ctx, { quality: qName });
  const ci = crags.build(scene);
  ci.cols = crags.addColliders(cw);
  timings.push(`山岩 ${Math.round(performance.now() - tk)}ms ${ci.count} 块（崖线 ${ci.cliff ?? 0}，陡坡 ${ci.slope ?? 0}，${ci.chunks ?? 0} 区，${ci.cols} 块设碰撞）`);
  await step('植松栽竹……', 0.7);
  const veg = new Vegetation(scene, terrain, cw, ctx.footprints, { density: Q.veg, grass: Q.grass });
  veg.treeShadows = Q.treeShadows;
  if (qName === 'low') veg.maxVariants = 1;
  veg.scatter(ctx.extraVeg || []);
  veg.bakeForestMask(terrain.material);
  // 浮空仙岛（第十三轮扩建）：岛面、岛体、亭塔殿阁、传送阵、石灯；岛上的树交给植被系统种（所以在 veg.build() 之前）
  const isles = new Isles(scene, veg, terrain, { lit: sky.u.uCloudLit, shade: sky.u.uCloudShade });
  // 通天塔岛（第十三轮）：岛体、百层塔、塔前广场与传送阵；岛体、传送阵、灯并入浮空岛的同一套取高、实心体与光源
  const towerIsle = new TowerIsle(scene, veg);
  isles.bodies.push(towerIsle.body);
  isles.arrays.push(towerIsle.array);
  isles.lights.push(...towerIsle.lights);
  isles.decoGroups.push(towerIsle.decoGroup);
  const isleCols = isles.addColliders(cw) + towerIsle.addColliders(cw);
  veg.build();
  veg.lodR = qName === 'high' ? 110 : qName === 'low' ? 64 : 88;
  veg.lodR2 = qName === 'high' ? 240 : qName === 'low' ? 150 : 200;
  if (Q.far) veg.buildFar(qName === 'high' ? 3200 : 2200);
  // 分层实心柱（第十三轮，御剑碰撞与御剑时的镜头）：殿阁、塔、岛上构筑物、石像香炉、山岩、崖壁按 1 米格逐列记下占据的高度区间，
  // 门洞、檐下、廊下、桥下的空隙都留着；步行进不去的殿内当实心（见 solidCols.js）
  const solidCols = bakeSolidCols(scene, { bounds: FLY.bounds, crags, ground: (x, z) => terrain.heightAt(x, z), cw });
  timings.push(`分层实心柱 ${solidCols.ms}ms（${solidCols.meshes} 件网格、${solidCols.columns} 列、${solidCols.bodies} 块殿身），岛上碰撞体 ${isleCols} 个`);
  // 通天塔塔身中段与高处的云（镜头 70 米内淡去，260 米外全显）
  buildClouds(scene, { density: qName === 'low' ? 0.7 : 1, lit: sky.u.uCloudLit, shade: sky.u.uCloudShade, banks: towerIsle.cloudBanks, rseed: 133, fade: [70, 260], name: 'tower-clouds' });
  // 岛下、瀑布下的云团
  buildClouds(scene, { density: qName === 'low' ? 0.6 : 1, lit: sky.u.uCloudLit, shade: sky.u.uCloudShade, banks: isles.cloudBanks, rseed: 77 });
  // 夜间照明（第十三轮）：各处灯具是光源锚点——近处分到实时点光（不投影），灯下平地铺一圈光晕
  const nightLights = new NightLights(scene, { count: qName === 'low' ? 3 : qName === 'high' ? 8 : 6,
    ground: (x, z, y) => Math.max(terrain.heightAt(x, z), cw.ground(x, z, y, 0.1)) });
  for (const e of [...ctx.lights, ...isles.lights]) nightLights.add(e.x, e.y, e.z, { tone: e.tone || 'warm', k: e.k ?? 1, pri: e.pri ?? 1 });
  for (const [x, yTop, z, s] of ctx.palaceLanterns || []) nightLights.add(x, yTop - 0.75 * s, z, { k: 0.9 * Math.min(1.3, s), pri: 1.15 });
  // 灵阵冷光：演武广场聚灵阵、灵池池心静修台
  nightLights.add(SITES.plazaCenter.x, SITES.plazaCenter.y + 2.2, SITES.plazaCenter.z, { tone: 'cold', k: 0.8, pri: 1.2, range: 20, glow: false });
  nightLights.add(SITES.lingchi.x, SITES.lingchi.y + 2.4, SITES.lingchi.z, { tone: 'cold', k: 0.8, pri: 1.1, range: 20, glow: false });
  const cranes = new Cranes(scene, GLOBAL);          // 仙鹤
  const motes = new Motes(scene, terrain, { count: qName === 'low' ? 80 : 160 });   // 灵光与萤火
  const lawn = Q.grass ? new Lawn(scene, terrain, veg, { radius: qName === 'high' ? 30 : 26, density: qName === 'high' ? 3.6 : 3.0 }) : null;   // 近处的茵茵草地与野花
  const ambient = new Ambient(scene, ctx.emitters, veg, { density: Q.particles });
  // 樱花飘落、树下与水面的落花（第十二轮加多：花瓣池按平均每片约占 10 秒算，中档每秒新生上限约 200 片）
  const petals = new Petals(scene, veg, terrain, { count: qName === 'low' ? 900 : qName === 'high' ? 3000 : 2000, groundPer: qName === 'low' ? 80 : 140, floatPer: qName === 'low' ? 35 : 70,
    ground: (x, z, y) => Math.max(terrain.heightAt(x, z), isles.groundAt(x, z, y)) });
  ambient.setHerbs(ctx.anchors.herbs || []);
  nightLights.build();

  await step('绘制舆图……', 0.85);
  const baseMap = drawBaseMap(terrain, veg, ctx.footprints, 2);
  const state = new GameState();
  // 第二十一轮：修为（等级、境界、修炼灵气）——首次接入时初始化为 21 级金丹初期，之后只校验、不再初始化
  const prog = new Progression(state);
  // 第二十三轮：主动技能的装备槽（六格；存档迁移只做一次，保留等级、佩剑、任务与进度）
  const loadout = new Loadout(state, { prog });
  prog.onLevel = () => loadout.learnDue();
  // 导览牌与告示的画面
  ctx.boards.guide?.userData.redraw((g, w, h) => drawFullMap(g, w, h, baseMap, { found: state.d.found.concat(['gate', 'reception']), guide: true, player: { x: 0, z: 90, dx: 0, dz: -1 } }));
  ctx.redrawNotice?.(state);

  await step('唤醒弟子……', 0.92);
  const ui = new UI();
  let started = false;                      // 点击「入山」之后为真（鼠标锁定、跳跃等以此为前提）
  // 第十五轮：玩家外观换成金白修士（assets/converted/figure/cultivator.glb）；载入失败时仍用程序化的人物
  const figure = ASSETS.models.cultivator && ASSETS.json.cultivator ? { gltf: ASSETS.models.cultivator, meta: ASSETS.json.cultivator } : null;
  const player = new Player(scene, terrain, cw, { figure });
  if (ASSETS.anim) player.char.setAnimLib(ASSETS.anim);      // 第十四轮：剑招、格挡、受击用动作库的动作（程序化人物用）
  // 第十七轮：在修士骨架上按关键姿势编排新动作（四段普攻、蓄力重击——第十九轮换成拔刀斩、格挡弹反、受击、闪身、施法、战斗待机、喝葫芦），载入时一次生成，
  // 玩家与演武场的对手共用（不在第一次出手时现算，免得卡一下）
  if (figure) {
    const t0 = performance.now();
    const { clips } = buildCultivatorClips(player.char);
    Cultivator.addClips(clips, player.char);
    timings.push(`修士动作编排 ${clips.length} 段 ${Math.round(performance.now() - t0)}ms`);
    player.char.addGourd(ASSETS.models.gourd?.scene || null);       // 第十九轮：腰间的回血葫芦（只有玩家带；模型没载入时程序生成）
  }
  // 第十五轮：剑器清单与当前佩剑（存档里记着 id；没有时用清单的默认剑）
  const armory = new Armory();
  armory.setList(ASSETS.json.swords);
  const swordReady = figure && armory.list.length
    ? equipSword(armory, state.sword && armory.has(state.sword) ? state.sword : armory.defaultId, player.char, player.flight).catch((e) => { console.warn('佩剑载入失败', e); return null; })
    : Promise.resolve(null);
  // 第十三轮：分层实心柱（飞行碰撞）、浮空岛岛面（行走、降落）与岛体（飞行碰撞）
  player.cols = solidCols;
  player.skyGround = (x, z, footY) => isles.groundAt(x, z, footY);
  player.skyPush = (c, r) => isles.push(c, r);
  const input = new Input();
  const cam = new FollowCamera(camera, renderer.domElement, terrain);
  cam.renderer = renderer;
  cam.blockRay = (o, d, m) => cw.ray(o, d, m);          // 镜头碰撞：墙体、屋顶、台基（只缩短距离）
  // 浮空岛岛体（镜头不进岩体）；御剑时再加上分层实心柱——屋顶、檐口没有镜头碰撞体，贴着屋面低飞时
  // 身后的屋脊会挡住角色，这时镜头同撞墙一样缩到屋脊前（步行时不用，免得檐下、廊下镜头被拉近）
  const camSolid = (x, y, z) => isles.solidAt(x, y, z) || (player.flying && solidCols.inside(x, y, z));
  cam.solidHook = camSolid;
  cam.sens = +(localStorage.getItem('qinglan.sens') || 1);
  player.place(START.x, START.z, START.yaw);
  cam.set(START.yaw, CAM.pitch, CAM.dist);
  cam.snap(new THREE.Vector3(player.pos.x, player.pos.y + 1.35, player.pos.z));
  const game = new Game({ scene, camera, renderer, cw, terrain, ctx, player, cam, input, ui, state, baseMap, sky, towerIsle });
  game.prog = prog;
  game.armory = armory;
  game.equipSword = async (id) => {                  // 佩剑面板、演武场用：换剑并存档
    const r = await equipSword(armory, id, player.char, player.flight);
    state.setSword(r.def.id);
    sfx.prewarm(renderer, camera);                   // 第二十二轮：新佩剑的剑阵套件先建好、着色器编好（第一次万剑归宗不卡）
    return r;
  };
  // 传送阵（第十三轮）：宗门一座，后方四座浮岛与通天塔岛各一座
  const teleport = new Teleport(game, [sectPortal, ...isles.arrays], { veg,
    ground: (x, z, y) => { const s = isles.groundAt(x, z, y); return s > -1e8 ? Math.max(s, cw.ground(x, z, y, 0.1)) : Math.max(terrain.inCore(x, z) ? terrain.heightAt(x, z) : -Infinity, cw.ground(x, z, y, 0.1)); } });
  teleport.addInteractions();
  game.teleport = teleport;
  game.quality = qName;
  // 战斗：宗门与秘境共用一套（敌人、投射物、预警圈放在当前场景里）
  const combat = new Combat({ player, camera, ui, input, cam });
  combat.setWorld('surface', { scene, terrain, cw });
  combat.blocked = () => !!(game.lock || game.scenic || game.meditating || game.intro || player.flying || $('#hud').classList.contains('hidden') || game.arena?.blockAct || game.boss50?.blockAct || game.boss30?.blockAct || game.finale?.active);
  // 第十五轮：演武场切磋中气血耗尽只判负（arena.js 处理），其余照旧「力竭醒来」
  // 第十六轮：第五十层守关战中力竭走失败处决过场（boss50Fight.js）
  // 第二十五轮：力竭——作废未完成的终式处决、清掉墨势（新的战斗实例）
  combat.onPlayerDown = () => { game.finale?.newInstance('death'); if (game.arena?.onPlayerDown()) return; if (game.boss50?.onPlayerDown()) return; if (game.boss30?.onPlayerDown()) return; game.playerDown(); };
  game.combat = combat;
  // 第十四轮：剑诀（game/moves.js）、特效（world/vfx.js + game/skillfx.js）；演武广场的木人桩作练功靶
  const vfx = new Vfx(scene, { quality: Q.particles, char: player.char });
  // 第二十轮：普攻、拔刀斩的水墨特效（game/inkFx.js）
  const ink = ASSETS.ink ? new InkFx(scene, ASSETS.ink, { player, groundAt: (x, z, y) => combat.groundAt(x, z, y), quality: Q.particles }) : null;
  if (ink) ink.onSlam = (p, k) => combat.shake(k);                 // 第二十六轮：重劈劈到底——轻轻一震（空劈也有）
  const sfx = new SkillFx(vfx, { player, hud: combat.hud, groundAt: (x, z, y) => combat.groundAt(x, z, y), scene, ink });
  sfx.armory = armory;                       // 第二十二轮：万剑归宗的剑阵用手中的佩剑（引用计数，施法中换剑不释放它的显存）
  if (getAtlas()) sfx.setAtlas(getAtlas());
  const moveDir = new THREE.Vector3();
  const moves = new Moves(combat, {
    player, cam, fx: sfx,
    // 当前方向键的世界方向（闪身方向、收势中想走就走）
    inputDir: () => {
      const mv = input.move();
      if (!mv.x && !mv.y) return null;
      const f = cam.forward(), mx = f.x * mv.y - f.z * mv.x, mz = f.z * mv.y + f.x * mv.x, l = Math.hypot(mx, mz);
      return l > 0.1 ? moveDir.set(mx / l, 0, mz / l) : null;
    },
    usePill: () => { if (state.count('yangyuan') < 1) return false; state.give('yangyuan', -1); return true; },
    // 第十九轮：回血葫芦的口数记在存档里（打坐、力竭醒来、守关战重来、演武场开打时装满）
    gourd: { left: () => state.gourdLeft(), max: () => state.gourdMax(), use: () => state.useGourd(), refill: () => state.refillGourd() },
  });
  combat.attach({ moves, sfx, animLib: ASSETS.anim || null });
  moves.loadout = loadout; game.loadout = loadout;
  loadout.attach({ moves, combat, game, toast: (h) => ui.toast(h) });
  // 剑诀栏：六个槽按装备显示；点格子（触屏、鼠标解锁时）与按槽键同一个入口
  combat.hud.setLoadout(loadout);
  loadout.onChange(() => combat.hud.setLoadout(loadout));
  combat.hud.onSlot = (i, down) => { if (!down || combat.canAct() || player.meditate) loadout.pressSlot(i, down); };
  combat.pillCount = () => state.count('yangyuan');
  combat.addDummies(ctx.anchors.dummies || []);
  game.moves = moves;
  game.vfx = vfx;                            // 第二十一轮：提升修为的聚气灵光
  // 鼠标锁定：点击画面进入；移动鼠标转动视角，左键攻击，右键按住防御；Esc 或打开界面时释放
  const touchOnly = isMobile || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);
  const lockHint = $('#lock-hint');
  // 第十七轮：左键按下 / 松开（按住连续出手）、右键按住格挡、中键按住蓄力（与 Z 相同）；失焦、释放锁定时一律松开
  const pointer = new PointerControl(renderer.domElement, {
    cam,
    canLock: () => started && !ui.busy && !touchOnly,
    // 第二十一轮：凤翔天击的飞行阶段，左键操控凤凰（这时不出剑）；其余时候照旧
    // 第二十五轮：终式的处决演出接管期间，左键、右键、中键一律不进来（恢复后要新的按下才出手）
    onAttack: (v) => { if (game.finale?.active) return; if (game.phoenix?.ownsLMB()) { if (!v || combat.canAct()) game.phoenix.steer(v); return; } if (!v || combat.canAct() || player.meditate) moves.press('light', v); },
    onGuard: (v) => { if (game.finale?.active && v) return; combat.setGuard(v); },
    // 第二十三轮：中键是拔刀斩的别名——只在拔刀斩装备时有效，与它所在的槽键共用同一个动作状态
    onHeavy: (v) => { if (game.finale?.active && v) return; if (!v || combat.canAct() || player.meditate) loadout.alias('power', v); },
    onRelease: () => { loadout.held.clear(); moves.clearInput(); },
  });
  game.pointer = pointer;
  // 第十五轮：演武场（与教习韩铮交互开始；场地在 world/arenaSite.js，对手在 game/duel.js）
  const arena = new Arena(game, { combat, moves, player, cam, input, pointer, sfx });
  game.arena = arena;
  // 第十七轮：战斗调试面板（?combatdebug=1；正式界面不显示）
  const combatDebug = new URLSearchParams(location.search).get('combatdebug') === '1' ? new CombatDebug(game, { combat, moves, player, scene }) : null;
  // 第十六轮：程序合成的音效（WebAudio）、通天塔第五十层 · 镇龙封印殿（独立场景，第一次进入时搭建）与守关战
  const sound = new SoundFx();
  game.sound = sound;
  combat.sound = sound;                      // 第十七轮：玩家的挥剑、命中、格挡、弹反、破防、受击也用合成音效
  sound.loadBank();                          // 第十八轮：采样音效（约 0.9 MB，后台解码；载入前仍用合成音）
  const tower50 = new Tower50Hall(renderer, { quality: qName, shadow: Q.shadow });
  game.tower50 = tower50;
  const boss50 = new Boss50Fight(game, { combat, moves, player, cam, input, pointer, vfx, sfx, sound, hall: tower50, quality: qName });
  game.boss50 = boss50;
  // 第二十四轮：通天塔第三十层 · 烬狱剑台（独立场景，第一次进入时搭建）与守关战（烬狱剑尊）
  const tower30 = new Tower30Hall(renderer, { quality: qName, shadow: Q.shadow });
  game.tower30 = tower30;
  const boss30 = new Boss30Fight(game, { combat, moves, player, cam, input, pointer, sfx, sound, hall: tower30, quality: qName });
  game.boss30 = boss30;
  // ---------- 第二十一轮：修为与九霄凤焰 ----------
  // 属性：从 21 级的基础数据按等级重新算（不叠乘）；读档直接恢复存下的当前气血、灵力（校验范围，不做升级或换装补偿）
  prog.attach({ combat, moves, toast: (h) => ui.toast(h) });
  prog.applyStats('load', state.d.vitals || null);
  // 剩余冷却：读档照旧（不免费刷新，也不计离线时间）
  if (state.d.cools && typeof state.d.cools === 'object') for (const k in moves.cools) { const v = +state.d.cools[k]; if (Number.isFinite(v) && v > 0) moves.cools[k] = Math.min(v, PLAYER_COMBAT.skills[k]?.cooldown ?? 99); }
  const phoenixFx = new PhoenixFx(scene, vfx, { quality: Q.particles, flash: (c, k) => combat.flash(c, k) });
  const phoenix = new PhoenixSkill({ combat, moves, player, cam, prog, fx: phoenixFx, gltf: ASSETS.models.phoenix || null, sound, toast: (h) => ui.toast(h) });
  if (state.d.phoenix?.mode === 'guard') phoenix.mode = 'guard';
  moves.phoenix = phoenix; combat.phoenix = phoenix; game.phoenix = phoenix;
  combat.targetFor = (e) => phoenix.targetFor(e);
  // 第二十三轮：雷龙破虚（装备槽键释放；素材 assets/converted/loong）
  const dragon = new ThunderDragon({ combat, moves, player, cam, prog, sound, loadout, toast: (h) => ui.toast(h), gltf: ASSETS.models.loong || null, bolts: ASSETS.models.lightning || null,
    vfx, lights: sfx.lights, quality: Q.particles, flash: (c, k) => combat.flash(c, k) });
  moves.dragon = dragon; combat.dragon = dragon; game.dragon = dragon;
  loadout.attach({ phoenix, dragon });
  loadout.learnDue();
  // 第二十五轮：拔刀斩的升级形态——墨势、墨势满蓄力出刀（伤害 ×2）、处决与水墨龙凤演出（game/inkFinale.js、inkFinaleFx.js）。
  // 第二十七轮：显示名称「墨里终焉」；16 秒的统一演出——画中世界（山水由玩家处铺开、原场景逐步替换：game/inkStage.js）、地上的长卷与书法、龙凤、八卦、爆墨、音乐。
  // 演出的龙凤是九霄凤焰、雷龙破虚两份素材的独立实例（开局建好、着色器预编译）；墨势与计数只在内存里，解锁标记存档
  const inkStage = new InkStage(scene, { assets: { land: ASSETS.models.inkLand || null, bw: ASSETS.tex.inkLandBW || null, brush: ASSETS.tex.inkLandBrush || null, noise: ASSETS.ink?.noise || null }, quality: Q.particles });
  const finFx = new InkFinaleFx(scene, { ink: ASSETS.ink, models: { phoenix: ASSETS.models.phoenix || null, loong: ASSETS.models.loong || null, scroll: ASSETS.models.inkScroll || null, scrollMeta: ASSETS.json.inkScroll || null },
    calli: ASSETS.tex.inkCalli && ASSETS.json.inkCalli ? { tex: ASSETS.tex.inkCalli, meta: ASSETS.json.inkCalli } : null, stage: inkStage, quality: Q.particles, post, lit: () => 1 - FOGU.uNight.value });
  const finale = new InkFinale({ game, combat, moves, player, cam, camera, state, loadout, sound, fx: finFx, stage: inkStage, post, paused: () => api_paused() });
  moves.finale = finale; game.finale = finale; game.finFx = finFx; game.inkStage = inkStage;
  loadout.attach({ finale });
  finale.wrapToast(ui);                                    // 演出中的提示（修炼灵气、掉落）攒到退场之后再报
  sound.cuePreload?.('ml', FINALE.music.url, FINALE.music.start);      // 演出音乐：先取回、解码好原曲 start 秒起的一段（第二十九轮），演出时立刻能放
  combat.lethalProbe = (e, o) => finale.lethalProbe(e, o);           // 第二十九轮：通用的终结——玩家一方任何招式的致命一击（群战的最后一个、最后一条命）交给演出
  // 各场景的实心体（屋顶、岩体、殿顶）与可施法的地界：雷龙选点、雷击不穿屋顶、俯冲不穿墙都按它
  const dragonWorld = (name) => name === 'surface' ? { solidAt: (x, y, z) => solidCols.inside(x, y, z) || isles.solidAt(x, y, z), bounds: (p) => terrain.inCore(p.x, p.z, 2) }
    : name === 'boss50' ? { solidAt: (x, y, z) => !tower50.camInside(x, y, z), bounds: (p) => Math.hypot(p.x, p.z) < 23 }
    : name === 'boss30' ? { solidAt: (x, y, z) => !tower30.camInside(x, y, z), bounds: (p) => Math.hypot(p.x, p.z) < 17 }
    : name === 'abyss' ? { solidAt: (x, y, z) => !abyss.camInside(x, y, z), bounds: (p) => abyss.camInside(p.x, p.y + 1, p.z) }
    : { solidAt: () => true, bounds: () => false };
  // 第二十五轮：终式演出的站位按场景的地界查（第三十层剑台留出 0.8 米边、第五十层封印殿 1.5 米）；换场景即新的战斗实例
  const finaleBounds = (name) => name === 'boss30' ? (p) => Math.hypot(p.x, p.z) < 16.2 : name === 'boss50' ? (p) => Math.hypot(p.x, p.z) < 21.5 : dragonWorld(name).bounds;
  finale.setWorld('surface', { bounds: finaleBounds('surface') });
  combat.onWorldChange = (name, sc) => { finale.newInstance('scene'); finFx.moveTo(sc); inkStage.moveTo(sc); finale.setWorld(name, { bounds: finaleBounds(name) }); phoenix.clear('scene'); phoenix.moveTo(sc); dragon.clear('scene'); dragon.moveTo(sc); dragon.setWorld(dragonWorld(name)); game.cancelAscend?.('换场景'); };
  // 遭遇开始（玩家一方打中敌人）：记下奖励基准；敌人倒下：发降妖的修炼灵气（每个只结算一次）
  combat.onEngage = (u) => { const r = prog.recordEncounter(u); if (r && !r.none) r.engaged = true; };
  combat.onEnemyDeath = (e) => prog.onKill(e);
  combat.saveSoon = () => state.save();
  moves.combatHold = () => !!boss50.combatHold || !!boss30.combatHold;
  moves.onStillPress = () => game.stillBroken();
  // 存档：当前气血、灵力、剩余冷却、凤凰的模式
  state.beforeSave = (d) => {
    const U = combat.playerUnit;
    d.vitals = { hp: Math.round(U.hp * 1000) / 1000, mp: Math.round(moves.mp * 1000) / 1000 };
    d.cools = {}; for (const k in moves.cools) if (moves.cools[k] > 0) d.cools[k] = Math.round(moves.cools[k] * 100) / 100;
    d.phoenix = { mode: phoenix.mode };
  };
  addEventListener('pagehide', () => state.save());
  document.addEventListener('visibilitychange', () => { if (document.hidden) state.save(); });
  // 幽渊秘境：独立的地下场景，第一次进入时才载入素材并搭建；进入后只渲染与更新地下场景
  const abyss = new Abyss();
  abyss.sealed = !!state.event('abyssSealed');
  game.abyss = abyss;
  // 丹房室内：同样是独立场景，第一次推门时搭建
  const interior = new Interior(renderer, { quality: qName });
  game.interior = interior;
  // 问道殿室内（第十一轮）：与宗门共用世界坐标，第一次入殿时搭建；陈设模型与丹房共用一份。
  // 地址加 ?hallStage=1 时只开放一层、五层南面各一扇窗（分步验证窗景的朝向、高度、视差与昼夜）
  const hallStage = new URLSearchParams(location.search).get('hallStage');
  const hallMap = document.createElement('canvas');
  hallMap.width = hallMap.height = 1024;
  drawFullMap(hallMap.getContext('2d'), 1024, 1024, baseMap, { found: ZONES.filter((z) => !z.hidden).map((z) => z.id), guide: true, player: { x: HALL.x, z: HALL.z, dx: 0, dz: 1 } });
  // 通天塔一层 · 接引大厅（第十三轮）：独立场景，第一次入塔时搭建
  const towerHall = new TowerHall(renderer, { quality: qName });
  game.towerHall = towerHall;
  const hall = new HallInterior(renderer, { quality: qName, sky, mapCanvas: hallMap, models: interior.models,
    only: hallStage === '1' ? [{ l: 0, side: 'S', bay: 1 }, { l: 4, side: 'S', bay: 1 }] : null });
  game.hall = hall;
  const hallFocus = new THREE.Vector3(HALL.x, HALL.y, HALL.z);
  const world = { name: 'surface' };
  const fogSave = {};
  // 丹房门外的景色从殿门口向南拍（第十轮：丹殿换成高台殿，门口取殿门互动点，略往门里收）
  const alchDoorView = () => {
    const D = ctx.anchors.alchemyDoor, S = SITES.alchemy;
    return D ? { x: D.x, y: D.y, z: D.z - 0.6 } : { x: S.x, y: S.y + 1.0, z: S.z + 4.5 };
  };
  game.switchWorld = async (name) => {
    if (name === world.name) return;
    if (name === 'abyss') await abyss.ensure();
    if (name === 'hall') await hall.ensure();
    if (name === 'boss50') await tower50.ensure();
    if (name === 'boss30') await tower30.ensure();
    if (name === 'tower') {
      await towerHall.ensure();
      // 门外的景色：在宗门场景里自塔门向外拍一张（角色不入画）
      if (world.name === 'surface') towerHall.captureView(renderer, scene, towerIsle.door, [player.char.root]);
    }
    if (name === 'alchemy') {
      await interior.ensure();
      // 门外的景色：在宗门场景里从丹房门口向南拍一张（角色不入画）
      if (world.name === 'surface') interior.captureView(renderer, scene, alchDoorView(), [player.char.root], TIME.hour);
    }
    const from = world.name;
    const W = name === 'abyss' ? { scene: abyss.scene, terrain: abyss, cw: abyss.cw } : name === 'alchemy' ? { scene: interior.scene, terrain: interior, cw: interior.cw }
      : name === 'hall' ? { scene: hall.scene, terrain: hall, cw: hall.cw } : name === 'tower' ? { scene: towerHall.scene, terrain: towerHall, cw: towerHall.cw }
      : name === 'boss50' ? { scene: tower50.scene, terrain: tower50, cw: tower50.cw } : name === 'boss30' ? { scene: tower30.scene, terrain: tower30, cw: tower30.cw } : { scene, terrain, cw };
    if (game.meditating) game.endMeditate(true);
    player.strike = null;
    player.char.moveTo(W.scene);
    player.terrain = W.terrain; player.cw = W.cw;
    cam.terrain = W.terrain;
    cam.blockRay = (o, d, m) => W.cw.ray(o, d, m);
    cam.limitHook = name === 'abyss' ? (o, d, m) => abyss.camLimit(o, d, m) : name === 'alchemy' ? (o, d, m) => interior.camLimit(o, d, m)
      : name === 'hall' ? (o, d, m) => hall.camLimit(o, d, m) : name === 'tower' ? (o, d, m) => towerHall.camLimit(o, d, m) : name === 'boss50' ? (o, d, m) => tower50.camLimit(o, d, m) : name === 'boss30' ? (o, d, m) => tower30.camLimit(o, d, m) : null;   // 秘境：洞壁、殿顶、甬道；室内：四壁与梁下；问道殿：各层墙内、顶层天花下；塔内：八角厅内
    cam.solidHook = name === 'surface' || name === 'hall' ? camSolid : null;
    combat.setWorld(name, W);
    combatDebug?.moveTo(W.scene);
    sfx.prewarm(renderer, camera);             // 第十七轮：新场景的灯光不同，受光的特效材质（锁链）在这里先编好
    game.phoenix?.prewarm(renderer, camera);   // 第二十二轮：凤凰（受光的蒙皮材质）同样先编好，第一次舞刀召凤不卡
    game.dragon?.prewarm(renderer, camera);    // 第二十三轮：雷龙、裂隙、雷云、雷柱
    game.finFx?.prewarm(renderer, camera);     // 第二十五轮：升级形态的演出（画卷、八卦、墨带、水墨龙凤）
    game.inkStage?.prewarm(renderer, camera);  // 第二十七轮：画中世界（山岛、纸地、天幕、墨雾幕、云气）
    if (name === 'abyss') {
      // 地下的雾：近处起雾、冷黑色，远处的殿顶与洞壁沉入暗中
      fogSave.p = FOGU.uFogP.value.clone(); fogSave.q = FOGU.uFogQ.value.clone(); fogSave.night = FOGU.uNight.value; fogSave.cam = cam.getState();
      FOGU.uFogSun.value.set(0.03, 0.04, 0.055); FOGU.uFogAway.value.set(0.03, 0.04, 0.055); FOGU.uFogNear.value.set(0.035, 0.045, 0.06);
      FOGU.uFogP.value.set(1 / 48, -1e4, 0, 420); FOGU.uFogQ.value.set(7, 1e4, 520, 0); FOGU.uNight.value = 0;
      renderer.toneMappingExposure = 1.12;
      const e = abyss.entry;
      player.place(e.x, e.z, e.yaw, e.y);
      cam.set(e.yaw, 0.22, 6);
    } else if (name === 'alchemy') {
      fogSave.cam = cam.getState();
      const e = interior.entry;
      player.place(e.x, e.z, e.yaw, e.y);
      cam.set(e.yaw, 0.16, 4.2);
    } else if (name === 'hall') {
      // 殿内：宗门照常更新、照常画（只画窗洞、门洞框住的部分）；外观窗洞里的暗色内壁隐去，外观保持不淡化
      fogSave.cam = cam.getState();
      ctx.hallDark.visible = false;
      const f = ctx.fadeables.get('hall');
      if (f) { f.cur = f.target = 1; f.u.value = 1; }
      const e = hall.entry;
      player.place(e.x, e.z, e.yaw, e.y);
      cam.set(e.yaw, 0.12, 5.0);
      hall.setFloor(0); hall.updateSky();
    } else if (name === 'tower') {
      if (from !== 'boss50' && from !== 'boss30') fogSave.cam = cam.getState();
      const e = towerHall.entry;
      player.place(e.x, e.z, e.yaw, e.y);
      cam.set(e.yaw, 0.14, 5.6);
      renderer.toneMappingExposure = towerHall.exposure;
    } else if (name === 'boss50') {
      // 第五十层：自南门进殿，面朝北面封印台
      const e = tower50.entry;
      player.place(e.x, e.z, e.yaw, e.y);
      cam.set(e.yaw, 0.2, 7.2);
      renderer.toneMappingExposure = tower50.exposure;
    } else if (name === 'boss30') {
      // 第三十层：自南桥的拱门下进入，面朝北面的剑台
      const e = tower30.entry;
      player.place(e.x, e.z, e.yaw, e.y);
      cam.set(e.yaw, 0.2, 6.6);
      renderer.toneMappingExposure = tower30.exposure;
    } else {
      if (from === 'abyss') { FOGU.uFogP.value.copy(fogSave.p); FOGU.uFogQ.value.copy(fogSave.q); FOGU.uNight.value = fogSave.night; }
      if (from === 'hall') ctx.hallDark.visible = true;
      renderer.toneMappingExposure = 1.02;
      const s = from === 'alchemy' ? game.alchemyRoom.surfaceSpawn() : from === 'hall' ? game.hallRoom.surfaceSpawn() : from === 'tower' ? game.towerRoom.surfaceSpawn() : game.abyssQuest.surfaceSpawn();
      player.place(s.x, s.z, s.yaw, s.y);
      cam.set(s.yaw, fogSave.cam?.pitch ?? CAM.pitch, fogSave.cam?.dist ?? CAM.dist);
    }
    world.name = name; game.world = name;
    cam.snap(new THREE.Vector3(player.pos.x, player.pos.y + 1.35, player.pos.z));
    $('#minimap').classList.toggle('hidden', name !== 'surface');
    game.zone = { stale: true };          // 让地名栏按新场景重新显示
    game.updateZone();
  };
  const minimap = new Minimap(baseMap, $('#minimap'));
  if (isMobile || navigator.maxTouchPoints > 0) setupTouch(input, cam, game, ui);

  // 竖屏时加大纵向视角，避免横向视野过窄
  const fit = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.fov = camera.aspect < 1 ? 46 + (1 - camera.aspect) * 26 : 46;
    camera.updateProjectionMatrix();
  };
  fit();
  addEventListener('resize', fit);

  // 第十七轮：剑招特效（月牙、锁链、金环、提示、地面圈、拖尾）的着色器预先编好，第一次出招时不卡
  { const t0 = performance.now(); sfx.prewarm(renderer, camera); timings.push(`剑招特效预编译 ${Math.round(performance.now() - t0)}ms`); }
  { const t0 = performance.now(); phoenix.prewarm(renderer, camera); timings.push(`凤凰着色器预编译 ${Math.round(performance.now() - t0)}ms`); }
  dragon.setWorld(dragonWorld('surface'));
  { const t0 = performance.now(); dragon.prewarm(renderer, camera); timings.push(`雷龙着色器预编译 ${Math.round(performance.now() - t0)}ms`); }
  { const t0 = performance.now(); finFx.prewarm(renderer, camera); inkStage.prewarm(renderer, camera); timings.push(`墨里终焉演出着色器预编译 ${Math.round(performance.now() - t0)}ms`); }
  // 第二十二轮：佩剑载入之后，万剑归宗的剑阵套件（实例化的佩剑）也先编好
  swordReady.then(() => { const t1 = performance.now(); sfx.prewarm(renderer, camera); timings.push(`剑阵套件预编译 ${Math.round(performance.now() - t1)}ms`); });
  // 入夜的着色器变体（多出几盏点光）在后台预先编好，第一次天黑时不卡
  const tw = performance.now();
  nightLights.prewarm(renderer, camera).then(() => timings.push(`夜间着色器预编译 ${Math.round(performance.now() - tw)}ms（后台）`));
  await step('入山', 1);
  $('#enter').classList.remove('hidden');
  $('#loading .txt').textContent = '晨钟已过，山门已开';
  started = false;
  const start = () => {
    if (started) return;
    started = true;
    if (!touchOnly) pointer.lock();          // 「入山」这一下点击同时锁定鼠标
    // 第二十二轮：音频上下文（连同混响的冲激响应）在这一下用户操作里建好——不留到第一次出声（实测约 70 毫秒，会落在第一次出招的那一帧）
    try { sound.ensure(); if (sound.ctx?.state === 'suspended') sound.ctx.resume(); } catch (e) { /* 不支持 WebAudio 的浏览器：静默 */ }
    $('#loading').classList.add('out');
    $('#hud').classList.remove('hidden');
    // 开场：自山门外高处俯瞰全景（前景山门溪谷，中景广场、凌云阁与云顶问道殿，远景主峰群与云带），玩家开始走动或数秒后缓缓落到身后
    game.intro = { t: 0, hold: 9 };
    setTimeout(() => ui.toast('沿中轴拾级而上：演武广场、凌云阁、上院，云顶重檐便是问道殿'), 1400);
    setTimeout(() => interior.preload(true), 12000);          // 丹房陈设在后台慢慢取回，推门时不必久等（问道殿的陈设与之共用）
  };
  // 开场全景机位（可在 __qinglan.INTRO 中调整）
  // focus：开场时阴影与环境光照的中心（宗门中部，而不是远处的注视点）
  const INTRO = { pos: new THREE.Vector3(...PANORAMA.pos), at: new THREE.Vector3(...PANORAMA.at), focus: new THREE.Vector3(0, 14, -40), drift: 10 };
  const introQ = new THREE.Quaternion(), followP = new THREE.Vector3(), followQ = new THREE.Quaternion(), m4 = new THREE.Matrix4();
  // 开场机位与跟随镜头之间按 e（0 全景 → 1 跟随）插值
  const introBlend = (e, t) => {
    followP.copy(camera.position); followQ.copy(camera.quaternion);
    const p = INTRO.pos.clone(); p.x += Math.sin(t * 0.07) * INTRO.drift;
    m4.lookAt(p, INTRO.at, camera.up); introQ.setFromRotationMatrix(m4);
    const k = e * e * (3 - 2 * e);
    camera.position.lerpVectors(p, followP, k);
    camera.quaternion.slerpQuaternions(introQ, followQ, k);
  };
  const endIntro = () => { if (!game.intro || game.intro.leave != null) return; game.intro.leave = 0; cam.set(null, CAM.pitch, CAM.dist); };
  api_endIntro = endIntro;
  $('#enter').onclick = start;
  // 剑诀键位（第十四轮起陆续：Q 剑气、R 惊鸿、T 破岳、V 万剑归宗、Z 拔刀斩、1 缚灵锁、3 九霄凤焰……）
  // 第二十三轮：主动技能改由六个装备槽决定——槽键固定为 Q、X、R、V、1、3（LOADOUT.keys），按下的是这一格装的剑诀（拔刀斩按住蓄势、松开出刀）；
  // 不占槽的照旧：C 闪身（御剑时 C 是下降）、G 服丹、2 回血葫芦、Tab 锁定；T、Z 不再是剑诀键（卸下 / 换槽之后旧键一律放不出来）
  const BASIC_KEYS = { KeyC: 'dodge', KeyG: 'pill', Digit2: 'gourd', Tab: 'lock' };
  // 第二十五轮：Z 恢复为拔刀斩的别名（与鼠标中键一样：只在拔刀斩装备时有效，与它的槽键同一个技能入口与蓄力状态；同一次蓄力只认发起的那一个键）
  addEventListener('keydown', (e) => {
    if (e.repeat || !started || ui.busy || game.lock || game.scenic || finale.active) return;
    if (e.code === 'KeyZ') { if (game.intro) api_endIntro(); if (combat.canAct() || player.meditate) loadout.alias('power', true, 'z'); return; }
    const k = BASIC_KEYS[e.code], i = loadout.keyIndex(e.code);
    if (!k && i < 0) return;
    if (k === 'dodge' && player.flying) return;
    if (game.intro) api_endIntro();
    if (k) moves.press(k, true); else loadout.pressSlot(i, true);
  });
  addEventListener('keyup', (e) => { if (e.code === 'KeyZ') { loadout.alias('power', false, 'z'); return; } const i = loadout.keyIndex(e.code); if (i >= 0) loadout.pressSlot(i, false); });
  addEventListener('keydown', (e) => {
    if (e.repeat || !started || ui.busy || game.lock || game.scenic) return;
    // 4：切换凤凰模式——只在九霄凤焰装备着时有效
    if (e.code === PHOENIX.modeKey) { if (!loadout.equipped('phoenix')) { combat.hud.deny('phoenix', 'unequipped'); return; } const m = phoenix.switchMode(); state.save(); ui.toast(`九霄凤焰 · 下一次召唤：<b>${PHOENIX.modes[m].name}</b>${phoenix.active ? '（已放出的凤凰不变）' : ''}`); }
    else if (e.code === MEDITATE.key) game.toggleMeditate?.();
  });
  addEventListener('blur', () => { loadout.held.clear(); moves.clearInput(); });
  addEventListener('keydown', (e) => { if (!started && e.code === 'Enter' && !$('#enter').classList.contains('hidden')) start(); });

  const clock = new THREE.Clock();
  const clockEl = $('#clock');
  const target = new THREE.Vector3();
  const ocl = new Set(), ro = new THREE.Vector3(), rd = new THREE.Vector3();
  let t = 0, frameN = 0, fpsT = 0, fpsN = 0;
  function occlusion(dt) {
    ocl.clear();
    for (const yo of [1.55, 0.85]) {
      ro.set(player.pos.x, player.pos.y + yo, player.pos.z);
      rd.subVectors(camera.position, ro);
      const len = rd.length();
      rd.divideScalar(len);
      cw.rayAll(ro, rd, len, (c) => { if (c.tag) ocl.add(c.tag); });
    }
    // 镜头本身处在某栋建筑体内（如站在殿廊下拉近镜头）：该建筑完全隐去，只保留投影
    const cp = camera.position;
    let inside = null;
    cw.query(cp.x, cp.z, cp.x, cp.z, (c) => {
      if (!c.tag || c.type !== 0 || cp.y < c.y0 || cp.y > c.y1 + 0.3) return;
      const dx = cp.x - c.x, dz = cp.z - c.z, lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
      if (Math.abs(lx) <= c.hx + 0.3 && Math.abs(lz) <= c.hz + 0.3) inside = c.tag;
    });
    for (const [id, f] of ctx.fadeables) {
      f.target = id === inside ? 0 : ocl.has(id) ? 0.12 : 1;
      f.cur = lerp(f.cur, f.target, damp(f.target < f.cur ? 9 : 4, dt));
      f.u.value = f.cur < 0.02 ? 0 : f.cur > 0.99 ? 1 : f.cur;
    }
  }
  // 殿内一帧：先画宗门——只画各可见层的窗洞、门洞在屏幕上框住的那一块（视锥按此收窄，框外的物体不画），
  // 再清深度、把室内画在上面（室内曝光略高，如人眼进屋后的适应）。宗门的日光阴影隔帧更新（殿内看出去的只是一角）
  const hallSize = new THREE.Vector2();
  let hallFrame = 0;
  const drawHall = () => {
    const r = renderer, sm = r.shadowMap;
    r.getSize(hallSize);
    camera.updateMatrixWorld();                       // 本帧的机位（render 才会更新 matrixWorldInverse，洞口投影要用当帧的）
    const W = hallSize.x, H = hallSize.y, rect = hall.portalRect(camera, W, H);
    const exp = r.toneMappingExposure, keepAuto = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(null);
    r.clear(true, true, true);
    sm.autoUpdate = false;
    api.hallRect = rect;
    try {
      if (rect) {
        camera.setViewOffset(W, H, rect.x, rect.y, rect.w, rect.h);
        r.setViewport(rect.x, H - rect.y - rect.h, rect.w, rect.h);
        r.setScissor(rect.x, H - rect.y - rect.h, rect.w, rect.h);
        r.setScissorTest(true);
        sm.needsUpdate = hallFrame++ % 2 === 0;
        r.render(scene, camera);
      }
    } finally {
      // 无论这一遍是否出错，都恢复视口、裁剪与镜头投影（否则下一帧整屏只剩一角）
      r.setScissorTest(false);
      r.setViewport(0, 0, W, H);
      if (camera.view?.enabled) camera.clearViewOffset();
    }
    r.clearDepth();
    sm.needsUpdate = true;
    r.toneMappingExposure = exp * hall.exposureK;
    try { r.render(hall.scene, camera); } finally {
      r.toneMappingExposure = exp;
      sm.autoUpdate = true;
      r.autoClear = keepAuto;
    }
  };
  const api = window.__qinglan = { THREE, scene, camera, renderer, terrain, player, cam, cw, sky, input, ctx, veg, game, state, ui, water, quality: qName,
    timings, INTRO, TIME, ASSETS, batchInfo, dragons, combat, abyss, interior, hall, world, ambient, petals, post, isles, cranes, motes, lawn, crags, nightLights, towerIsle, towerHall, teleport,
    moves, vfx, sfx, armory, swordReady, arena, boss50, tower50, boss30, tower30, sound,
    prog, phoenix, phoenixFx, loadout, dragon, finale, finFx, inkStage, paused: () => api_paused(),
    present: (sc, cam) => post.render(sc, cam), drawHall,
    invade: () => game.abyssQuest.startInvasion() };
  installDebug(api);
  // 第二十一轮：暂停——设置（暂停菜单）打开、页面失去焦点或隐藏时，整个游戏时间不走（修炼、凤凰、火焰、治疗、灼烧、仇恨、冷却、突破演出、Boss 过场）；
  // 恢复后不补算暂停期间的任何东西（时钟跳过这一段）
  const pauseFlags = { blur: !document.hasFocus() };
  addEventListener('blur', () => { pauseFlags.blur = true; });
  addEventListener('focus', () => { pauseFlags.blur = false; });
  api_paused = () => (started && (pauseFlags.blur || document.hidden)) || (game.panelKind === 'settings' && ui.panelOpen);
  const pauseEl = $('#pause-hint');
  function frame() {
    requestAnimationFrame(frame);
    let dt = Math.min(clock.getDelta(), 0.05);
    const paused = api_paused();
    if (pauseEl && pauseEl.classList.contains('on') !== (paused && started && !ui.panelOpen)) pauseEl.classList.toggle('on', paused && started && !ui.panelOpen);
    if (paused) dt = 0;
    if (api.timeScale) dt *= api.timeScale;
    tick(dt, true);
  }
  // 一帧的全部逻辑（自检时可通过 __qinglan.tick(dt, n) 在后台标签页中手动推进）
  api.tick = (dt = 1 / 60, n = 1, draw = true) => { for (let i = 0; i < n; i++) tick(dt, draw && i === n - 1); };
  function tick(dt, draw) {
    const rdt = dt;                          // 第二十五轮：终式处决演出的时钟（不受顿帧影响；暂停、失焦、后台时已为 0）
    dt *= combat.timeScale(dt);             // 顿帧：重击命中的一瞬间放慢
    t += dt; frameN++;
    const under = world.name === 'abyss', inside = world.name === 'alchemy', inHall = world.name === 'hall', inTower = world.name === 'tower', inBoss = world.name === 'boss50', inBoss30 = world.name === 'boss30';
    GLOBAL.uTime.value = t;
    if (api.autopilot) api.autopilot(dt);
    const mv = input.move();
    // 跳跃（空格）：对话、面板、过场、远眺时不跳
    if (input.take('Space') && started && !ui.busy && !game.lock && !game.scenic && !arena.blockMove && !boss50.blockMove && !boss30.blockMove) { if (game.intro) api_endIntro(); player.jump(); }
    // 御剑（第十三轮）：F 起飞 / 请求落地
    if (input.take('KeyF') && started && !ui.busy && !game.lock && !game.scenic) { if (game.intro) api_endIntro(); game.toggleFlight(); }
    if (game.intro) {
      game.intro.t += dt;
      if (mv.x || mv.y || game.intro.t > game.intro.hold) api_endIntro();
      if (game.intro.leave != null && (game.intro.leave += dt) > 2.4) game.intro = null;
    }
    // 第二十五轮：终式的处决演出接管——人物由演出驱动（不走剑诀）；其他战斗实体、投射物、预警、冷却、持续伤害、治疗、召唤物计时一律停住（给 0），恢复后不补算
    const hold = finale.holdWorld, cdt = hold ? 0 : dt;
    if (finale.ownsPlayer) finale.drive(rdt); else moves.update(dt);                       // 剑诀先定本帧放到哪一刻、出不出剑，角色随后按同一时刻摆姿势
    player.update(finale.ownsPlayer ? finale.playerDt(rdt) : dt, mv, cam.forward(), camera.position, flightInput(input, mv, cam.yaw));
    arena.update(cdt);                      // 演武场：对手的 AI 与出剑、比试圈边界（在战斗系统结算之前）
    boss50.update(cdt);                     // 第十六轮：第五十层守关战（龙君的动作、AI、招式判定、过场；在战斗系统结算之前）
    boss30.update(cdt);                     // 第二十四轮：第三十层守关战（剑尊的动作、AI、剑的轨迹判定、火焰、过场）
    if (player.flight.notice) { ui.toast(player.flight.notice); player.flight.notice = null; }
    if (player.flying !== document.body.classList.contains('flying')) document.body.classList.toggle('flying', player.flying);
    game.update(dt);
    if (!hold) combat.update(dt); else combat.updateOverlay(0);
    // 第二十一轮：九霄凤焰（第五十层阶段过场中战斗时钟停住）、脱战计时（提升修为要脱战 5 秒）
    phoenix.update(cdt, { hold: boss50.combatHold || boss30.combatHold });
    dragon.update(cdt, { hold: boss50.combatHold || boss30.combatHold, camera });          // 第二十三轮：雷龙破虚（同一个战斗时钟）
    prog.tickCalm(cdt, combat.state === 'battle' || !!combat.duelBoss || !!game.arena?.active, combat.t - combat.playerUnit.lastHit);
    // 第二十五轮：墨势的 8 秒按战斗时钟（暂停、打开界面、Boss 过场、处决演出中不走）；演出的画面与镜头
    finale.tick(dt, { hold: hold || ui.busy || !!boss50.combatHold || !!boss30.combatHold });
    finale.post(rdt);
    target.set(player.pos.x, player.pos.y + 1.55, player.pos.z);
    // 打开对话、行囊、舆图、设置时释放鼠标并暂停视角控制（第二十五轮：处决演出中镜头由演出接管，鼠标不转视角）
    if (ui.busy && pointer.locked) pointer.unlock();
    cam.enabled = !ui.busy && !finale.active;
    if (lockHint) lockHint.classList.toggle('hidden', !started || pointer.locked || ui.busy || touchOnly || !!game.lock);
    const fc = api.freeCam || game.freeCam;
    if (fc) { camera.position.copy(fc.pos); camera.lookAt(fc.at); } else cam.update(dt, target, player);
    finale.camPost(camera, rdt);            // 第二十五轮：演出结束后由演出的最后机位平滑回到第三人称
    // 第十七轮：音效的听点跟着镜头（命中、格挡、挥剑按方位分声像、按距离衰减）
    if (!sound.listener) sound.listener = { pos: new THREE.Vector3(), right: { x: 1, z: 0 } };
    { const cf = cam.forward(); sound.listener.pos.copy(camera.position); sound.listener.right.x = -cf.z; sound.listener.right.z = cf.x; }
    if (game.intro && !fc) introBlend(game.intro.leave != null ? Math.min(1, game.intro.leave / 2.4) : 0, game.intro.t);
    // 特效：Tab 锁定的目标（显眼的锁定标记）；否则当前出招的辅助目标、交战或佩剑在手时会被辅助选中的那个
    const lockT = finale.active ? null : moves.lock?.alive ? moves.lock : moves.act?.target?.alive ? moves.act.target : (combat.state === 'battle' || player.drawn) && !player.flying ? moves.previewTarget() : null;
    sfx.update(dt, { target: lockT, locked: !!moves.lock, camera });
    vfx.update(dt);
    combatDebug?.update(dt);
    if (!under && !inside && !inTower && !inBoss && !inBoss30) { if (!inHall) occlusion(dt); ctx.qi?.update(dt); ctx.lingchi?.update(dt); }
    advanceTime(dt);
    if (frameN % 30 === 0) {
      const sc = shichen(TIME.hour), el = clockEl;
      if (el.dataset.t !== sc.text) { el.dataset.t = sc.text; el.querySelector('b').textContent = sc.name; el.querySelector('small').textContent = sc.ke; }
      el.classList.toggle('night', TIME.hour < 5.4 || TIME.hour > 18.9);
    }
    if (under) abyss.update(dt, t);
    else if (inTower) towerHall.update(dt, t, player);
    else if (inBoss) tower50.update(dt, t, player);
    else if (inBoss30) tower30.update(dt, t, player);
    else if (inside) {
      interior.update(dt, t, camera);
      // 在屋里待久了，屋外天色已变（超过半个时辰）：按当前时辰更新宗门的天光，重拍门外景色
      if (interior.backdropStale(TIME.hour)) {
        const door = alchDoorView();
        const eye = new THREE.Vector3(door.x, door.y + 1.6, door.z + 0.3);
        sky.update({ position: eye }, eye, 0);
        interior.captureView(renderer, scene, door, [], TIME.hour);
        interior.updateSky();
      }
    }
    else {
      // 宗门（殿内时也照常更新：窗外的天色、云、龙、鹤、水、同门与殿外所见一致；阴影中心定在殿心）
      sky.update(camera, inHall ? hallFocus : game.intro && game.intro.leave == null ? INTRO.focus : player.pos, dt);
      veg.update(player.pos);
      crags.update(camera.position);
      for (const d of Object.values(dragons)) d.update(dt, { player, camera, threat: game.threatFor(d), alert: game.alertFor(d), combat });
      water.update(t);
      ambient.update(dt, camera, player.pos, t);
      nightLights.update(dt, player.pos, cam.forward());
      petals.update(dt, player.pos, t, inHall ? null : camera);     // 殿内不在镜头前生成花瓣（那是殿里）
      isles.update(t);
      cranes.update(dt, t, FOGU.uNight.value);
      motes.update(dt, t, player.pos, FOGU.uNight.value);
      lawn?.update(player.pos);
      if (inHall) hall.update(dt, t, camera, player);
    }
    if (frameN % 2 === 0 && started && !under && !inside && !inHall && !inTower && !inBoss && !inBoss30) {
      const n = Object.values(game.npcs).map((n) => ({ x: n.pos.x, z: n.pos.z, mark: game.questMarks()[n.def.id] }));
      minimap.draw({ x: player.pos.x, z: player.pos.z, heading: player.heading }, cam.forward(), n, game.mapTargets());
    }
    inkStage.lateLights();                    // 第二十七轮：「墨里终焉」画中世界的中性天光（天空、场地的灯每帧会改，这里在它们之后套上）
    if (draw) {
      post.setMood(under ? 0.42 : FOGU.uNight.value, inside || inTower || inBoss || inBoss30);
      if (inHall) post.render(drawHall, camera);
      else post.render(under ? abyss.scene : inside ? interior.scene : inTower ? towerHall.scene : inBoss ? tower50.scene : inBoss30 ? tower30.scene : scene, camera);
    }
    input.endFrame();
    fpsT += dt; fpsN++;
    if (fpsT > 1) { api.fps = Math.round(fpsN / fpsT); fpsT = 0; fpsN = 0; }
  }
  frame();
}

init().catch((e) => {
  console.error(e);
  $('#loading .txt').textContent = '载入失败：' + e.message;
});
