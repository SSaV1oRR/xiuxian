// 外部素材加载：材质贴图（Poly Haven CC0，1k / 流畅画质 512）、天空关键帧与云层、远山高度图、植被贴图集、glTF 模型。
// 加载完成后放入 ASSETS，供场景装配同步取用；任一素材失败时相应部分退回程序化效果。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { AnimLib } from '../actors/anim.js';
import { loadVfxAtlas } from './vfx.js';
import { loadInkAssets } from '../game/inkFx.js';

export const ASSETS = { tex: {}, models: {}, json: {}, img: {}, lo: false, failed: [] };
const BASE = './assets/';
let maxAniso = 4;
const texLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const gltfMeshopt = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);       // 第二十七轮：EXT_meshopt_compression 压缩过的 glb（山水、画卷）

export function texture(url, { srgb = true, repeat = true, aniso = 8 } = {}) {
  return new Promise((res, rej) => texLoader.load(url, (t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(aniso, maxAniso);
    res(t);
  }, undefined, () => rej(new Error('贴图加载失败：' + url))));
}

// 幽渊秘境的素材（地下神殿、僧像）只在第一次进入秘境时加载，不占用宗门的载入时间
let abyssJob = null;
export function loadAbyssAssets() {
  abyssJob ||= Promise.all([
    gltfLoader.loadAsync(BASE + 'converted/temple/abyss_temple.glb'),
    gltfLoader.loadAsync(BASE + 'converted/temple/monk.glb'),
  ]).then(([temple, monk]) => { ASSETS.models.abyss_temple = temple; ASSETS.models.monk = monk; return ASSETS; });
  return abyssJob;
}

// 读取 16 位高度图（R 高位、G 低位）为 Float32 数组
async function heightmap(url, meta) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const cv = document.createElement('canvas');
  cv.width = bmp.width; cv.height = bmp.height;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, bmp.width, bmp.height).data, n = bmp.width * bmp.height;
  const h = new Float32Array(n);
  for (let i = 0; i < n; i++) h[i] = (d[i * 4] * 256 + d[i * 4 + 1]) * meta.scale + meta.offset;
  return { h, n: bmp.width, half: meta.half };
}

// 材质贴图：名称 → 是否有法线贴图
// mside：第十轮由扫描岩壁（Poly Haven Mountainside）正投影烘焙、裁成的四方连续岩面（程序化崖壁与地形陡坡用，见 tools/prepare_mountainside_textures.py）
const MAT_TEX = { paving: 1, block: 1, wallstone: 1, plaster: 1, redplaster: 0, roof: 1, wood: 1, rock: 1, mossrock: 1, grass: 0, grass2: 1, grassfar: 0, barkpine: 1, barkbroad: 1, cliff: 1, strata: 1, mside: 1 };
const SKY_KEYS = ['dawn', 'sunrise', 'morning', 'noon', 'late', 'sunset', 'dusk', 'night'];

export async function loadAssets(renderer, { lo = false, onProgress = () => {} } = {}) {
  ASSETS.lo = lo;
  maxAniso = renderer.capabilities.getMaxAnisotropy();
  const jobs = [];
  const add = (key, p) => jobs.push(p.then((v) => { key(v); }).catch((e) => { ASSETS.failed.push(e.message); console.info(e.message); }));
  const td = lo ? 'tex/lo/' : 'tex/';
  for (const [name, nrm] of Object.entries(MAT_TEX)) {
    add((t) => { ASSETS.tex[name + '_d'] = t; }, texture(BASE + td + name + '_d.jpg', { srgb: true }));
    if (nrm && !lo) add((t) => { ASSETS.tex[name + '_n'] = t; }, texture(BASE + td + name + '_n.jpg', { srgb: false }));
  }
  // 天空
  add((j) => { ASSETS.json.sky = j; }, fetch(BASE + 'sky/sky.json').then((r) => r.json()));
  for (const k of SKY_KEYS) add((t) => { t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; ASSETS.tex['sky_' + k] = t; }, texture(BASE + 'sky/sky_' + k + '.jpg', { aniso: 1 }));
  add((t) => { t.wrapT = THREE.ClampToEdgeWrapping; ASSETS.tex.cloudA = t; }, texture(BASE + 'sky/cloud_a.jpg', { srgb: false, aniso: 4 }));
  add((t) => { t.wrapT = THREE.ClampToEdgeWrapping; ASSETS.tex.cloudL = t; }, texture(BASE + 'sky/cloud_l.jpg', { srgb: false, aniso: 4 }));
  // 月面：NASA Scientific Visualization Studio「CGI Moon Kit」的 LRO 彩色月面图（公有领域），缩为 1024×512
  add((t) => { t.wrapT = THREE.ClampToEdgeWrapping; ASSETS.tex.moon = t; }, texture(BASE + 'sky/moon/moon_1k.jpg', { srgb: true, aniso: 4 }));
  // 远山高度图
  add((hm) => { ASSETS.dem = hm; }, fetch(BASE + 'terrain/dem_far.json').then((r) => r.json()).then((m) => heightmap(BASE + 'terrain/dem_far.png', m)));
  // 植被贴图集
  add((j) => { ASSETS.json.foliage = j; }, fetch(BASE + 'veg/foliage.json').then((r) => r.json()));
  add((t) => { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; ASSETS.tex.foliage = t; }, texture(BASE + (lo ? 'veg/foliage_lo.webp' : 'veg/foliage.webp'), { srgb: true, repeat: false, aniso: 4 }));
  // 模型
  // （第七轮起香炉改为依参照图营造的掐丝珐琅香炉，burner.glb 不再载入，文件保留在 assets/models/）
  for (const m of ['lion', 'rocks_a', 'rocks_b', 'palace_lantern']) add((g) => { ASSETS.models[m] = g; }, gltfLoader.loadAsync(BASE + 'models/' + m + '.glb'));
  // 实物陈设（Poly Haven，CC0；原用于丹房室内）：第九轮起也用于西院廊下、膳堂、丹殿作业廊的户外陈设（室内直接复用，不重复载入）
  for (const m of ['chinese_armchair', 'chinese_stool', 'ceramic_vase_01', 'ceramic_vase_02', 'antique_ceramic_vase_01', 'wicker_basket_02', 'ceramic_pot', 'brass_pot_01', 'wooden_bowl_02', 'planter_pot_clay'])
    add((g) => { ASSETS.models[m] = g; }, gltfLoader.loadAsync(BASE + 'converted/interior/' + m + '.glb'));
  // 新素材（tools/convert_assets.py 与 tools/prepare_textures.py 由 assets/dragon、tree、mountain 原始文件转换而来）
  // 护宗双龙：共用的飞龙骨骼模型与动作 + 冰 / 火两套贴图；glTF 贴图坐标不翻转
  add((g) => { ASSETS.models.dragon = g; }, gltfLoader.loadAsync(BASE + 'converted/dragon/dragon.glb'));
  for (const [k, srgb] of [['dragon_ice', 1], ['dragon_fire', 1], ['dragon_glow_ice', 0], ['dragon_glow_fire', 0], ['dragon_eye', 1], ['dragon_n', 0], ['dragon_r', 0]]) {
    add((t) => { t.flipY = false; ASSETS.tex[k] = t; }, texture(BASE + 'converted/dragon/' + k + '.jpg', { srgb: !!srgb, repeat: false }));
  }
  // 树木（减面后的近景 / 中景两级）与山体高度印章
  add((g) => { ASSETS.models.trees = g; }, gltfLoader.loadAsync(BASE + 'converted/trees/trees.glb'));
  add((j) => { ASSETS.json.trees = j; }, fetch(BASE + 'converted/trees/trees.json').then((r) => r.json()));
  // 花树贴图集（樱花、淡紫花簇、金黄叶簇、树皮；tools/make_blossom_atlas.py）
  add((t) => { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; ASSETS.tex.blossom = t; }, texture(BASE + 'converted/trees/blossom.png', { srgb: true, repeat: false, aniso: 8 }));
  // 第十轮：扫描岩壁（assets/mountain/mountainside_4k.blend，Poly Haven「Mountainside」，CC0；tools/convert_mountainside.py）——
  // 三级细节网格 + 2K 漫反射（已调成宗门岩色）、法线、1K 粗糙度；glTF 贴图坐标不翻转
  add((g) => { ASSETS.models.mountainside = g; }, gltfLoader.loadAsync(BASE + 'converted/mountainside/mountainside.glb'));
  for (const [k, srgb] of [['ms_d', 1], ['ms_n', 0], ['ms_r', 0]]) add((t) => { t.flipY = false; ASSETS.tex[k] = t; }, texture(BASE + 'converted/mountainside/' + k + '.jpg', { srgb: !!srgb }));
  // 第十轮：宗门建筑（assets/buildings/01.fbx 拆分、去招牌、调色后的各栋模型，贴图内嵌；tools/convert_buildings.py）与碰撞网格
  add((g) => { ASSETS.models.buildings = g; }, gltfLoader.loadAsync(BASE + 'converted/buildings/buildings.glb'));
  add((j) => { ASSETS.json.buildings = j; }, fetch(BASE + 'converted/buildings/buildings.json').then((r) => r.json()));
  // 第十四轮：战斗动作（assets/fighting 的 Quaternius 通用动作库，CC0；tools/convert_ual2.py 重定向到修士骨架）
  add((lib) => { ASSETS.anim = lib; }, AnimLib.load(BASE + 'converted/anim/ual2_combat'));
  // 第十五轮：玩家外观（金白修士，tools/convert_cultivator.py）与剑器清单（tools/convert_swords.py）；剑本身按需载入（game/swords.js）
  add((g) => { ASSETS.models.cultivator = g; }, gltfLoader.loadAsync(BASE + 'converted/figure/' + (lo ? 'cultivator_lo.glb' : 'cultivator.glb')));
  add((j) => { ASSETS.json.cultivator = j; }, fetch(BASE + 'converted/figure/cultivator.json').then((r) => r.json()));
  add((j) => { ASSETS.json.swords = j; }, fetch(BASE + 'converted/swords/swords.json').then((r) => r.json()));
  // 第十九轮：回血葫芦（项目作者提供的 assets/figure/accessories/gourd_bottle.glb，tools/r19_convert_gourd.py 减面、缩贴图；载入失败时用程序生成的葫芦）
  add((g) => { ASSETS.models.gourd = g; }, gltfLoader.loadAsync(BASE + 'converted/figure/gourd.glb'));
  // 第二十一轮：九霄凤焰的凤凰（assets/boss/phoenix-bird/source/fly.fbx，tools/r21_convert_phoenix.py 修正贴图路径后转成 glb；1.3 MB，开局预载）
  add((g) => { ASSETS.models.phoenix = g; }, gltfLoader.loadAsync(BASE + 'converted/phoenix/phoenix.glb'));
  // 第二十三轮：雷龙破虚的龙（assets/boss/chinese_dragon_loong/source/RYUISM/8030/8030.fbx）与分叉雷枝（skill/lighting_pack_2_forked_lightning.glb），
  // tools/r23_convert_loong.py 转成 glb（原文件不动）：龙 4.3 MB（骨架、四段动作、底色 / 法线 / 金属粗糙度贴图）、雷枝 1.1 MB（五条，减面后约 3.1 万顶点）
  add((g) => { ASSETS.models.loong = g; }, gltfLoader.loadAsync(BASE + 'converted/loong/loong.glb'));
  add((g) => { ASSETS.models.lightning = g; }, gltfLoader.loadAsync(BASE + 'converted/loong/lightning.glb'));
  // 第十四轮：技能特效贴图集（assets/special effects 的 Kenney Particle Pack，CC0；tools/make_vfx_atlas.py）
  add((a) => { ASSETS.vfx = a; }, loadVfxAtlas(BASE + 'converted/vfx/'));
  // 第二十轮：水墨特效（项目里的 FX_Ink slash 素材包：tools/r20_unpack_unitypackage.py 解包，r20_build_ink.py 做贴图，r20_convert_ink_meshes.py 转网格）；
  // 载入失败时普攻、拔刀斩退回第十七轮的剑光拖尾
  add((a) => { ASSETS.ink = a; }, loadInkAssets(BASE + 'converted/fx/ink/', gltfLoader));
  // 第二十七轮：「墨里终焉」的三维水墨山水（Sketchfab「Mountain and River Scroll」黑白版，tools/r27_convert_land.py 拆成四座山岛、减树，3.3 MB）、
  // 山水贴图集（8192² → 4096² 灰度）与地面笔触、画卷的轴与绳结（tools/r27_convert_scroll.py）、书法「墨里终焉」（tools/r27_calligraphy.py）——开局预载，第一次处决不卡
  add((g) => { ASSETS.models.inkLand = g; }, gltfMeshopt.loadAsync(BASE + 'converted/molizhongyan/land.glb'));
  add((t) => { t.flipY = false; t.needsUpdate = true; ASSETS.tex.inkLandBW = t; }, texture(BASE + 'converted/molizhongyan/land_bw.jpg', { srgb: false, repeat: false, aniso: 8 }));
  add((t) => { t.flipY = false; t.needsUpdate = true; ASSETS.tex.inkLandBrush = t; }, texture(BASE + 'converted/molizhongyan/land_brush.png', { srgb: false, repeat: false, aniso: 4 }));
  add((g) => { ASSETS.models.inkScroll = g; }, gltfMeshopt.loadAsync(BASE + 'converted/molizhongyan/scroll.glb'));
  add((j) => { ASSETS.json.inkScroll = j; }, fetch(BASE + 'converted/molizhongyan/scroll.json').then((r) => r.json()));
  add((t) => { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; ASSETS.tex.inkCalli = t; }, texture(BASE + 'converted/molizhongyan/calligraphy.png', { srgb: false, repeat: false, aniso: 8 }));
  add((j) => { ASSETS.json.inkCalli = j; }, fetch(BASE + 'converted/molizhongyan/calligraphy.json').then((r) => r.json()));
  add((st) => { ASSETS.stamps = st; }, fetch(BASE + 'converted/mountain/stamps.json').then((r) => r.json()).then((meta) =>
    Promise.all(Object.entries(meta).map(([name, m]) => heightmap(BASE + 'converted/mountain/' + name + '.png', { scale: 1 / 65535, offset: 0, half: 0 }).then((hm) => ({ name, ...m, h: hm.h, n: hm.n }))))));
  let done = 0;
  jobs.forEach((j) => j.then(() => onProgress(++done / jobs.length)));
  await Promise.all(jobs);
  return ASSETS;
}
