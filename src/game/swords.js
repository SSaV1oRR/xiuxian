// 第十五轮：剑器（assets/converted/swords/swords.json 与各剑的 glb，由 tools/convert_swords.py 从 assets/sword 转出）。
// 清单里每把剑：名称、说明、文件、尺寸（剑尖 tip、护手 guard、剑首 pommel，剑的本地坐标、米）、握持参数 grip、腰间挂接 hip、御剑长度 flight；
// 素材自带刀鞘的（蟠龙）另有 sheath（鞘的 glb，与剑同一套本地坐标）。
// 第一版所有剑器共用同一套基础战斗数值（见 combatConfig.js），只是外观与持握不同。
// 只在用到时载入：开局载入当前佩剑；打开佩剑面板时逐把载入预览；演武场的对手各持一把。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Armory {
  constructor(base = 'assets/converted/') {
    this.base = base;
    this.list = []; this.byId = new Map(); this.defaultId = null;
    this.cache = new Map();
    this.users = new Map();            // 每把剑正被几处用着（玩家、演武场的对手）
    this.loader = new GLTFLoader();
  }
  setList(json) {
    this.list = json?.swords || [];
    this.defaultId = json?.default || this.list[0]?.id || null;
    this.byId = new Map(this.list.map((s) => [s.id, s]));
  }
  has(id) { return this.byId.has(id); }
  // 引用计数：佩上一把剑时 acquire，换下、拆除时 release。没人用的剑释放显存（贴图、几何体）——模板仍留在内存里，
  // 再佩上时由渲染器重新上传；不然把十把剑挨个试一遍，显存里就一直留着十把剑的贴图
  acquire(id) { this.users.set(id, (this.users.get(id) || 0) + 1); }
  release(id) {
    const n = (this.users.get(id) || 0) - 1;
    if (n > 0) { this.users.set(id, n); return; }
    this.users.delete(id);
    this.cache.get(id)?.then(({ scene, sheath }) => { if (!this.users.get(id)) { freeGpu(scene); freeGpu(sheath); } }).catch(() => {});
  }
  get(id) { return this.byId.get(id) || this.byId.get(this.defaultId) || null; }
  // 载入（缓存）一把剑：返回 { def, scene, sheath }，scene 是模板，挂到人物身上时各自克隆；
  // sheath 是这把剑原装的鞘（素材里与剑一起的，如蟠龙），没有或载入失败时为 null（人物按剑身截面生成剑鞘）
  load(id) {
    const def = this.get(id);
    if (!def) return Promise.reject(new Error('剑器清单里没有可用的剑'));
    if (!this.cache.has(def.id)) {
      const prep = (g) => {
        const s = g.scene;
        s.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          const m = o.material;
          if (m.map) m.map.anisotropy = 4;
          m.envMapIntensity = 1.0;
        });
        return s;
      };
      const p = Promise.all([
        this.loader.loadAsync(this.base + def.file).then(prep),
        def.sheath?.file ? this.loader.loadAsync(this.base + def.sheath.file).then(prep).catch((e) => { console.warn('剑鞘载入失败，改用生成的剑鞘', e); return null; }) : null,
      ]).then(([scene, sheath]) => ({ scene, sheath }));
      p.catch(() => this.cache.delete(def.id));        // 载入失败下次重试
      this.cache.set(def.id, p);
    }
    return this.cache.get(def.id).then(({ scene, sheath }) => ({ def, scene, sheath }));
  }
}

// 释放一个模板在渲染器里的显存（几何体缓冲、贴图）；对象本身不动，下次画到时自动重新上传
export function freeGpu(root) {
  root?.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) m[k]?.dispose();
  });
}

// 给人物（与御剑的飞剑）换上一把剑；返回 { def, scene, sheath }。换下的那把若没人再用，释放它的显存
export async function equipSword(armory, id, char, flight = null) {
  const r = await armory.load(id);
  const prev = char.swordId;
  char.setSword?.(r.def, r.scene, r.sheath);
  flight?.setSwordModel?.(r.scene, r.def);
  armory.acquire(r.def.id); char.swordId = r.def.id;
  if (prev) armory.release(prev);
  return r;
}

// 佩剑面板的预览：离屏小画布上转着看一把剑（每次打开面板建一个，关掉即释放）
export class SwordPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });   // 保留画面：界面截图时读得到
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.05, 20);
    this.scene.add(new THREE.HemisphereLight(0xeef2f6, 0x6a6058, 1.4));
    const d = new THREE.DirectionalLight(0xfff2e0, 2.2); d.position.set(2, 3, 4); this.scene.add(d);
    const r = new THREE.DirectionalLight(0xbfd8ff, 0.8); r.position.set(-3, 1, -2); this.scene.add(r);
    // 简单的环境反射：金属剑身要有东西可映
    const pm = new THREE.PMREMGenerator(this.renderer);
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(5, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide,
      vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: 'varying vec3 v; void main(){ vec3 c = mix(vec3(.30,.28,.26), vec3(.85,.88,.92), smoothstep(-.3, .7, v.y)); c += vec3(1.) * pow(max(0., dot(v, normalize(vec3(.4,.8,.5)))), 30.) * 2.; gl_FragColor = vec4(c, 1.); }' })));
    this.envTex = pm.fromScene(env, 0.03).texture;
    this.scene.environment = this.envTex;
    pm.dispose();
    this.holder = new THREE.Group(); this.scene.add(this.holder);
    this.obj = null; this.t = 0; this.raf = 0;
    this.resize();
  }
  resize() {
    const w = this.canvas.clientWidth || 260, h = this.canvas.clientHeight || 320;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  show(scene, def) {
    if (this.obj) this.holder.remove(this.obj);
    this.obj = scene.clone(true);
    // 剑身竖直、居中；镜头按全长取景
    const mid = (def.tip + def.pommel) / 2;
    this.obj.position.y = -mid;
    this.holder.add(this.obj);
    const L = def.length;
    this.camera.position.set(0, 0, L * 2.35);
    this.camera.lookAt(0, 0, 0);
    this.draw();                                       // 先画一帧（页面不可见时 requestAnimationFrame 不走，免得空白）
  }
  draw() {
    this.holder.rotation.y = Math.sin(this.t * 0.6) * 0.9 + 0.3;
    this.holder.rotation.z = -0.12;
    this.renderer.render(this.scene, this.camera);
  }
  start() {
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.t += 1 / 60;
      this.draw();
    };
    loop();
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    this.envTex.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}
