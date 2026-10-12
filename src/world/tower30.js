// 第二十四轮：通天塔第三十层 · 烬狱剑台（独立场景，第一次进入时搭建）。
//   · 战斗台：直径 36 米（半径 18 米）的圆形黑石台，悬在一片暗红的余烬深渊之上；台面刻着火纹大阵（同心环、放射的火槽、环带上一圈火字、正中「烬」字），
//     其中 15.6 米处的一道环即「焚天断界」危险区的边（场地面积的 3/4）；台面的熔岩裂纹二阶段烧红；
//   · 南面一道石桥（宽 5 米）通向拱门（玩家从这里进出），开战时拱门与台沿各升起一道火墙，胜负未分出不去；
//   · 台外八只火盆（出场时熄灭，阶段转换时重新燃起）；更远处三座浮岩上插满残剑、挂着残旗——原模型场景里的笔画（boss30_props.glb）。
// 本地原点：战斗台圆心、台面；+Z 为南（桥与拱门），−Z 为北。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CollisionWorld } from '../core/collision.js';
import { ASSETS } from './assets.js';
import { BOSS30, CONFIG30 } from '../game/boss30Config.js';

const R = CONFIG30.arena.R;
export const T30 = {
  R, ultR: R * CONFIG30.ult.zoneK,
  bridge: { w: 5, z0: R - 0.6, z1: 31 },
  gate: { z: 31, w: 5.6, h: 7.2 },
  entry: { x: 0, z: 29.2, yaw: Math.PI },     // 拱门内（桥上），面朝北
  start: { x: 0, z: 9.5, yaw: Math.PI },       // 开战时玩家站位（台上南侧）
  respawn: { x: 0, z: 11, yaw: Math.PI },      // 重试的复位点
  boss: { x: 0, z: -4.5, yaw: 0 },             // Boss 自余烬中升起的位置，面朝南
  braziers: 8, brazierR: R + 1.9,
  trigger: R - 1.2,                            // 走上台（离圆心不到这么远）即开战
};
const TAU = Math.PI * 2;
const rng = (s = 1) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

// ---------- 台面火纹（画布）：R 刻线、G 火字与火槽（发光）、B 熔岩裂纹（二阶段烧红）----------
// 画布上方为北（−Z）、右为东（+X）；覆盖 40 米见方
function runeTexture() {
  const S = 2048, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const c = S / 2, M = 40, k = S / M, X = (m) => m * k;
  const ring = (r, w, col) => { g.strokeStyle = col; g.lineWidth = X(w); g.beginPath(); g.arc(c, c, X(r), 0, TAU); g.stroke(); };
  g.globalCompositeOperation = 'lighter';
  for (const [chan, col] of [['R', '#ff0000'], ['G', '#00ff00']]) {
    ring(R - 0.25, 0.3, col); ring(R - 0.75, 0.08, col);
    ring(T30.ultR, chan === 'G' ? 0.16 : 0.26, col);                 // 焚天断界的边（外圈即安全区）
    if (chan === 'R') { ring(T30.ultR - 0.5, 0.08, col); ring(12.2, 0.16, col); ring(6.2, 0.14, col); ring(2.6, 0.2, col); }
    else { ring(6.2, 0.1, col); ring(2.6, 0.12, col); }
    // 十二道放射的火槽（圈心 → 内环）与外环之间的短槽
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + TAU / 24;
      g.save(); g.translate(c, c); g.rotate(a);
      g.fillStyle = col; g.fillRect(X(2.8), -X(0.07), X(9.2), X(0.14));
      if (chan === 'R') g.fillRect(X(12.4), -X(0.05), X(2.8), X(0.1));
      g.restore();
    }
    // 环带：两环之间一圈火字（字头朝外）
    g.save(); g.translate(c, c);
    const CH = '烬焰炎焚灼熔燹煌燎烽炽燧爝炬烨熹炀焱燔熯焮';
    const N = 48;
    g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${Math.round(X(1.0))}px "KaiTi","STKaiti","Kaiti SC",serif`;
    for (let i = 0; i < N; i++) { g.save(); g.rotate((i / N) * TAU); g.translate(0, -X(9.2)); g.fillText(CH[(i * 5) % CH.length], 0, 0); g.restore(); }
    g.restore();
    // 正中「烬」字
    g.save(); g.translate(c, c); g.fillStyle = col; g.font = `${Math.round(X(2.6))}px "KaiTi","STKaiti","Kaiti SC",serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('烬', 0, X(0.08)); g.restore();
  }
  // 熔岩裂纹（B）：自中心向外的分叉裂缝
  g.strokeStyle = '#0000ff';
  let seed = 31;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const crack = (x, y, a, len, w, depth) => {
    let px = x, py = y;
    for (let i = 0; i < len; i++) {
      a += (rnd() - 0.5) * 0.8;
      const nx = px + Math.cos(a) * X(0.8), ny = py + Math.sin(a) * X(0.8);
      g.lineWidth = Math.max(1.5, w * (1 - i / len)); g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
      px = nx; py = ny;
      if (Math.hypot(px - c, py - c) > X(R - 0.8)) break;
      if (depth < 2 && rnd() < 0.14) crack(px, py, a + (rnd() < 0.5 ? 1 : -1), Math.floor(len * 0.5), w * 0.6, depth + 1);
    }
  };
  for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU + rnd() * 0.3; crack(c + Math.cos(a) * X(3), c + Math.sin(a) * X(3), a, 24 + Math.floor(rnd() * 6), X(0.24), 0); }
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; t.generateMipmaps = true;
  return t;
}

// ---------- 火墙（台沿、拱门）：向上翻卷的火舌（噪声 + 火焰配色），uOn 升降、uNear 玩家靠近的一段更亮 ----------
const WALL_VS = 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
const WALL_FS = /* glsl */`
  uniform float uOn, uTime, uNear, uNearA, uK; uniform vec3 uCore, uGold, uMain, uDeep;
  varying vec2 vUv; varying vec3 vW;
  float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h2(i), h2(i + vec2(1., 0.)), f.x), mix(h2(i + vec2(0., 1.)), h2(i + vec2(1., 1.)), f.x), f.y); }
  vec3 ramp(float k){ k = clamp(k, 0., 1.); return k < .33 ? mix(uDeep, uMain, k / .33) : k < .7 ? mix(uMain, uGold, (k - .33) / .37) : mix(uGold, uCore, (k - .7) / .3); }
  void main(){
    float a = atan(vW.z, vW.x);
    float x = vUv.x * uK, y = vUv.y;
    float n = n2(vec2(x * 1.4, y * 2.2 - uTime * 2.4)) * .6 + n2(vec2(x * 3.1 + 7., y * 4.6 - uTime * 3.6)) * .4;
    // 一圈低矮的火舌：舌与舌之间留缝（看得见外面），只有玩家靠近的那一段烧高、烧亮
    float near = exp(-pow(mod(a - uNearA + 3.14159, 6.28318) - 3.14159, 2.) * 40.) * uNear;
    float tongues = .55 + .45 * sin(x * 6.2832 * 3. + n * 4. - uTime * 1.3);
    float top = mix(.15, .62, uOn) * (.55 + .5 * tongues) * (1. + near * .6);
    float body = smoothstep(top, top - .3, y) * smoothstep(-.02, .06, y);
    float heat = clamp(body * (.45 + .75 * n) - y * .5, 0., 1.);
    float gap = smoothstep(.15, .45, n2(vec2(x * 2.4, uTime * .35)) + near);
    vec3 c = ramp(heat * .9 + near * .25);
    gl_FragColor = vec4(c * heat * gap * uOn * (.55 + .9 * near), 1.);
  }`;

export class Tower30Hall {
  constructor(renderer, { quality = 'mid', shadow = 2048 } = {}) {
    this.renderer = renderer; this.quality = quality; this.shadowSize = shadow;
    this.ready = false;
    this.cw = new CollisionWorld(8);
    this.exposure = 1.08;
    const C = BOSS30.colors;
    this.U = {
      uGlow: { value: 0.35 }, uHeat: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }, uUlt: { value: 0 },
      uCore: { value: new THREE.Color(C.core) }, uGold: { value: new THREE.Color(C.gold) }, uMain: { value: new THREE.Color(C.main) }, uDeep: { value: new THREE.Color(C.deep) },
    };
    this.fire = [];          // 火盆：{ pos, k（0–1 火势）, target, light }
  }

  async ensure() {
    if (this.ready) return this;
    await this.build();
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 500);
    cam.position.set(0, 4, 26); cam.lookAt(0, 2, 0);
    try { await this.renderer.compileAsync?.(this.scene, cam); } catch (e) { /* 第一帧再编译 */ }
    this.ready = true;
    return this;
  }

  async build() {
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x120a08);
    const U = this.U, tx = ASSETS.tex;
    const mapOf = (name, rep) => { const t = tx[name]?.clone(); if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.needsUpdate = true; } return t || null; };
    // ---------- 台面 ----------
    const rune = this.runeTex = runeTexture();
    const lava = await new THREE.TextureLoader().loadAsync(BOSS30.fx + 'lava.png').catch(() => null);
    if (lava) { lava.wrapS = lava.wrapT = THREE.RepeatWrapping; lava.colorSpace = THREE.NoColorSpace; }
    const fm = new THREE.MeshStandardMaterial({ color: 0x4a423e, map: mapOf('paving_d', 22), normalMap: mapOf('paving_n', 22), roughness: 0.9, metalness: 0.0 });
    fm.normalScale.set(0.9, 0.9);
    fm.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, { uRune: { value: rune }, uLava: { value: lava } });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vRune; varying vec2 vWXZ;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvRune = position.xy / 40.0 + 0.5; vWXZ = vec2(position.x, -position.y);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          varying vec2 vRune; varying vec2 vWXZ; uniform sampler2D uRune, uLava; uniform float uGlow, uHeat, uTime, uFlash, uUlt; uniform vec3 uCore, uGold, uMain, uDeep;
          vec3 rampF(float k){ k = clamp(k, 0., 1.); return k < .33 ? mix(uDeep, uMain, k / .33) : k < .7 ? mix(uMain, uGold, (k - .33) / .37) : mix(uGold, uCore, (k - .7) / .3); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec3 runeM = texture2D(uRune, vRune).rgb;
          float rr = length(vWXZ);
          diffuseColor.rgb *= 1.0 - runeM.r * 0.6;
          float lv = texture2D(uLava, vWXZ / 7.0).r;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.09, .07, .065), smoothstep(.55, .9, lv) * .5);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            float pulse = .8 + .2 * sin(uTime * 1.6 - rr * .4);
            totalEmissiveRadiance += rampF(.45) * runeM.g * (uGlow * pulse * 1.3 + uFlash * 2.2);
            // 熔岩裂纹（二阶段烧红）：画布的裂缝 + 熔岩纹理的亮线——只烧到深红 / 橙（不到金白），地上的金白预警才压得住
            float lv2 = texture2D(uLava, vWXZ / 7.0 + vec2(uTime * .004, 0.)).r;
            float crk = max(runeM.b, smoothstep(.62, .9, lv2) * .55 * step(rr, ${(R - 0.6).toFixed(2)}));
            totalEmissiveRadiance += rampF(.12 + .33 * crk) * crk * uHeat * (.7 + .3 * sin(uTime * 2.4 + rr * .7)) * 1.0;
            // 焚天断界蓄力：危险区那道边越来越亮
            totalEmissiveRadiance += rampF(.8) * runeM.g * smoothstep(${(T30.ultR - 0.8).toFixed(2)}, ${T30.ultR.toFixed(2)}, rr) * (1. - smoothstep(${T30.ultR.toFixed(2)}, ${(T30.ultR + 0.6).toFixed(2)}, rr)) * uUlt * 3.;
          }`);
    };
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 128), fm);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.name = 't30-floor';
    scene.add(floor);
    this.floorMat = fm;
    // 台身：一圈石壁向下收成岩底
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a3330, map: mapOf('rock_d', 6), normalMap: mapOf('rock_n', 6), roughness: 0.95 });
    const side = new THREE.Mesh(new THREE.CylinderGeometry(R, R - 0.3, 2.4, 128, 1, true), rockMat);
    side.position.y = -1.2; side.receiveShadow = true; scene.add(side);
    const under = new THREE.Mesh(new THREE.ConeGeometry(R - 0.3, 16, 48, 1, true), rockMat);
    under.rotation.x = Math.PI; under.position.y = -2.4 - 8; scene.add(under);
    // 台沿：一道铁箍
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x2c2522, metalness: 0.6, roughness: 0.45 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.05, 0.12, 8, 160), rimMat);
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.04; scene.add(rim);
    // ---------- 南桥与拱门 ----------
    const B = T30.bridge, bw = B.w;
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x433b37, map: mapOf('block_d', 3), normalMap: mapOf('block_n', 3), roughness: 0.9 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(bw, 1.2, B.z1 - B.z0 + 1.5), bridgeMat);
    deck.position.set(0, -0.6, (B.z0 + B.z1) / 2 + 0.6); deck.receiveShadow = true; deck.castShadow = true; scene.add(deck);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.75, B.z1 - B.z0), bridgeMat);
      rail.position.set(s * (bw / 2 - 0.22), 0.37, (B.z0 + B.z1) / 2); rail.castShadow = true; scene.add(rail);
      this.cw.addLocal([{ type: 'box', x: s * (bw / 2 - 0.22), z: (B.z0 + B.z1) / 2, hx: 0.3, hz: (B.z1 - B.z0) / 2, y0: 0, y1: 3, ry: 0 }], 0, 0, 0, 0);
    }
    const G = T30.gate, gateMat = new THREE.MeshStandardMaterial({ color: 0x3b3431, map: mapOf('wallstone_d', 2), normalMap: mapOf('wallstone_n', 2), roughness: 0.92 });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, G.h, 1.6), gateMat);
      p.position.set(s * (G.w / 2 + 0.7), G.h / 2, G.z); p.castShadow = true; scene.add(p);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(G.w + 3.4, 1.2, 1.9), gateMat);
    lintel.position.set(0, G.h + 0.6, G.z); lintel.castShadow = true; scene.add(lintel);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(G.w + 0.2, G.h), new THREE.MeshBasicMaterial({ color: 0x050303 }));
    back.position.set(0, G.h / 2, G.z + 0.85); back.rotation.y = Math.PI; scene.add(back);
    this.cw.addLocal([{ type: 'box', x: 0, z: G.z + 0.9, hx: G.w, hz: 0.4, y0: 0, y1: 20, ry: 0 }], 0, 0, 0, 0);
    // ---------- 台沿的挡（不让人走下台；桥口留出）----------
    const cols = [];
    const N = 72;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, x = Math.sin(a) * (R + 0.3), z = Math.cos(a) * (R + 0.3);
      if (z > 0 && Math.abs(x) < bw / 2 + 0.2) continue;
      cols.push({ type: 'box', x, z, hx: (TAU * (R + 0.3)) / N / 2 + 0.05, hz: 0.35, y0: -1, y1: 4, ry: a });          // 本地 x 沿切向、z 沿半径
    }
    this.cw.addLocal(cols, 0, 0, 0, 0);
    // ---------- 火墙（台沿、拱门）----------
    const C = BOSS30.colors;
    const wallU = (k) => ({ uOn: { value: 0 }, uTime: U.uTime, uNear: { value: 0 }, uNearA: { value: 0 }, uK: { value: k }, uCore: U.uCore, uGold: U.uGold, uMain: U.uMain, uDeep: U.uDeep });
    this.barrier = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.05, R + 0.05, 3.0, 160, 1, true),
      new THREE.ShaderMaterial({ uniforms: wallU(64), vertexShader: WALL_VS, fragmentShader: WALL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.barrier.position.y = 1.5; this.barrier.visible = false; this.barrier.renderOrder = 4; scene.add(this.barrier);
    this.gateWall = new THREE.Mesh(new THREE.PlaneGeometry(G.w + 0.2, G.h), new THREE.ShaderMaterial({ uniforms: wallU(3), vertexShader: WALL_VS, fragmentShader: WALL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.gateWall.position.set(0, G.h / 2, G.z - 0.5); this.gateWall.visible = false; scene.add(this.gateWall);
    void C;
    // ---------- 火盆：八只，台外石柱上 ----------
    const bowlMat = new THREE.MeshStandardMaterial({ color: 0x2a2320, metalness: 0.55, roughness: 0.5 });
    const pillarMat = rockMat;
    this.fireLights = [];
    for (let i = 0; i < T30.braziers; i++) {
      const a = (i / T30.braziers) * TAU + TAU / 16, x = Math.sin(a) * T30.brazierR, z = Math.cos(a) * T30.brazierR;
      if (z > R - 2 && Math.abs(x) < 4) continue;                 // 桥口不放
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 14, 10), pillarMat);
      col.position.set(x, -6.2, z); col.castShadow = true; scene.add(col);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.45, 0.6, 16, 1, true), bowlMat);
      bowl.position.set(x, 1.1, z); bowl.material.side = THREE.DoubleSide; bowl.castShadow = true; scene.add(bowl);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.3, 12), bowlMat);
      base.position.set(x, 0.75, z); scene.add(base);
      this.fire.push({ pos: new THREE.Vector3(x, 1.45, z), k: 1, target: 1 });
    }
    // 点光：四盏（数目固定，不随火盆熄灭增减——免得材质重编）
    for (let i = 0; i < 4; i++) { const L = new THREE.PointLight(0xff8a3a, 0, 26, 1.8); scene.add(L); this.fireLights.push(L); }
    // ---------- 深渊：远处暗红的余烬海、渐隐的雾 ----------
    const abyss = new THREE.Mesh(new THREE.CircleGeometry(220, 64), new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uLava: { value: lava }, uCore: U.uCore, uMain: U.uMain, uDeep: U.uDeep },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform float uTime; uniform sampler2D uLava; uniform vec3 uCore, uMain, uDeep; varying vec2 vP;
        void main(){ float l = texture2D(uLava, vP / 26. + vec2(uTime * .003, uTime * .002)).r; float l2 = texture2D(uLava, vP / 61. - vec2(uTime * .002, 0.)).r;
          float k = smoothstep(.5, .95, l * .6 + l2 * .5); float fall = 1. - smoothstep(30., 210., length(vP));
          gl_FragColor = vec4((uDeep * .35 + mix(uDeep, uMain, k) * k * .9) * (.35 + .65 * fall), 1.); }`,
    }));
    abyss.rotation.x = -Math.PI / 2; abyss.position.y = -70; scene.add(abyss);
    // 穹顶：自上而下由烟黑渐到暗红
    const dome = new THREE.Mesh(new THREE.SphereGeometry(240, 32, 18), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
      uniforms: { uDeep: U.uDeep },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: 'uniform vec3 uDeep; varying vec3 vD; void main(){ float h = vD.y; vec3 c = mix(uDeep * .55, vec3(.05, .035, .035), smoothstep(-.3, .45, h)); c = mix(c, vec3(.02, .015, .016), smoothstep(.45, 1., h)); gl_FragColor = vec4(c, 1.); }' }));
    scene.add(dome);
    // ---------- 浮岩与残剑（原模型场景里的笔画）----------
    this.props = new THREE.Group(); scene.add(this.props);
    try {
      const g = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(BOSS30.props);
      g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; for (const m of [].concat(o.material)) { m.side = THREE.DoubleSide; m.emissive?.set(0x000000); m.emissiveMap = null; m.metalnessMap = null; m.metalness = 0.2; m.roughness = 0.75; if (/Fire|Light/.test(m.name)) { m.emissive.set(0xff7a30); m.emissiveIntensity = 1.4; } } } });
      const R2 = rng(7);
      for (const [ang, dist, sc, ry] of [[0.95, 27, 1.6, 0.4], [2.25, 29, 1.7, 2.6], [3.85, 28, 1.6, 4.2], [5.3, 27.5, 1.5, 1.2]]) {
        const x = Math.sin(ang) * dist, z = Math.cos(ang) * dist;
        const isle = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 3.2, 6, 9), rockMat);
        isle.position.set(x, -3.6 - R2() * 1.5, z); isle.rotation.y = R2() * 3; isle.receiveShadow = true; this.props.add(isle);
        const p = g.scene.clone(true); p.scale.setScalar(sc); p.position.set(x - 0.6 * sc, isle.position.y + 3, z - 0.8 * sc); p.rotation.y = ry;
        this.props.add(p);
      }
    } catch (e) { console.warn('第三十层的场景笔画未能载入', e); }
    // ---------- 光 ----------
    scene.add(new THREE.HemisphereLight(0x9a7a6a, 0x2a1410, 1.15));
    const key = this.key = new THREE.DirectionalLight(0xffd2a8, 2.1);
    key.position.set(-14, 34, 18); key.target.position.set(0, 0, -2);
    key.castShadow = true; key.shadow.mapSize.set(this.shadowSize, this.shadowSize);
    Object.assign(key.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 5, far: 90 });
    key.shadow.bias = -0.0005; key.shadow.normalBias = 0.04;
    scene.add(key); scene.add(key.target);
    const rimL = new THREE.DirectionalLight(0xff5a28, 0.7); rimL.position.set(16, 6, -24); scene.add(rimL);
    const fill = new THREE.DirectionalLight(0xffc49a, 0.75); fill.position.set(9, 7, 22); scene.add(fill);          // 自南桥一侧的暖色补光：剑尊正面不至于全黑
    this.fightLight = new THREE.PointLight(0xff7a30, 0, 36, 1.6); this.fightLight.position.set(0, 7, 0); scene.add(this.fightLight);
    this.gateLight = new THREE.PointLight(0xffb070, 14, 16, 2); this.gateLight.position.set(0, 5, G.z - 3); scene.add(this.gateLight);
    this.reset();
  }

  // ---------- 场地变化 ----------
  setBarrier(on) { this.barrierTarget = on ? 1 : 0; if (on) this.barrier.visible = true; }
  setGate(on) { this.gateTarget = on ? 1 : 0; if (on) this.gateWall.visible = true; }
  // 火盆：level 0 熄灭 … 1 寻常 … 1.6 二阶段的旺火；instant 立刻到位（跳过过场时）
  setBraziers(level, instant = false) { for (const f of this.fire) { f.target = level; if (instant) f.k = level; } }
  setHeat(level) { this.heatTarget = level; }
  setGlow(level) { this.glowTarget = level; }
  setUlt(k) { this.U.uUlt.value = k; }
  flash(k = 1) { this.U.uFlash.value = Math.max(this.U.uFlash.value, k); }
  reset() {
    this.barrierTarget = 0; this.gateTarget = 0; this.heatTarget = 0; this.glowTarget = 0.35;
    if (this.barrier) { this.barrier.material.uniforms.uOn.value = 0; this.barrier.visible = false; this.gateWall.material.uniforms.uOn.value = 0; this.gateWall.visible = false; }
    this.U.uHeat.value = 0; this.U.uGlow.value = 0.35; this.U.uFlash.value = 0; this.U.uUlt.value = 0;
    this.setBraziers(1, true);
    if (this.fightLight) this.fightLight.intensity = 0;
  }

  // ---------- 行走与镜头 ----------
  heightAt() { return 0; }
  waterAt() { return null; }
  normalAt() { return new THREE.Vector3(0, 1, 0); }
  inCore(x, z) { const r = Math.hypot(x, z); return r < R + 0.2 || (Math.abs(x) < T30.bridge.w / 2 && z > 0 && z < T30.gate.z + 0.5); }
  camInside(x, y, z) {
    if (y < 0.25 || y > 46) return false;
    const r = Math.hypot(x, z);
    if (r < R + 14) return true;                                      // 台上与四周的空中：没有遮挡
    if (Math.abs(x) < T30.gate.w / 2 && z > 0 && z < T30.gate.z) return y < T30.gate.h;
    return r < 34;
  }
  camLimit(o, dir, d) {
    const n = Math.ceil(d / 0.25);
    for (let i = 1; i <= n; i++) {
      const s = (d * i) / n;
      if (!this.camInside(o.x + dir.x * s, o.y + dir.y * s, o.z + dir.z * s)) return Math.max(0.6, s - 0.3);
    }
    return d;
  }
  get entry() { return { x: T30.entry.x, y: 0, z: T30.entry.z, yaw: T30.entry.yaw }; }

  update(dt, t, player) {
    if (!this.ready) return;
    const U = this.U;
    U.uTime.value = t;
    const ease = (cur, tgt, k) => cur + (tgt - cur) * Math.min(1, dt * k);
    U.uGlow.value = ease(U.uGlow.value, this.glowTarget ?? 0.35, 2.5);
    U.uHeat.value = ease(U.uHeat.value, this.heatTarget ?? 0, 0.9);
    U.uFlash.value = Math.max(0, U.uFlash.value - dt * 2.5);
    const bu = this.barrier.material.uniforms;
    bu.uOn.value = ease(bu.uOn.value, this.barrierTarget ?? 0, 2.6);
    if (bu.uOn.value < 0.01 && !this.barrierTarget) this.barrier.visible = false;
    if (player) {
      const r = Math.hypot(player.pos.x, player.pos.z);
      bu.uNear.value = Math.max(0, Math.min(1, (r - (R - 4)) / 3.5));
      bu.uNearA.value = Math.atan2(player.pos.z, player.pos.x);
    }
    const gu = this.gateWall.material.uniforms;
    gu.uOn.value = ease(gu.uOn.value, this.gateTarget ?? 0, 2.4);
    if (gu.uOn.value < 0.01 && !this.gateTarget) this.gateWall.visible = false;
    // 火盆：火势缓缓变化（熄灭 1.2 秒内、点燃 0.8 秒内）；四盏点光跟着最近的几只火盆的火势
    for (const f of this.fire) f.k += (f.target - f.k) * Math.min(1, dt * (f.target < f.k ? 1.6 : 2.4));
    const n = this.fire.length;
    this.fireLights.forEach((L, i) => {
      const f = this.fire[Math.round((i * n) / 4) % n];
      L.position.copy(f.pos).add(new THREE.Vector3(0, 0.6, 0));
      L.intensity = f.k * (16 + 3 * Math.sin(t * 11 + i * 2.3) + 2 * Math.sin(t * 17 + i));
    });
    this.fightLight.intensity = U.uHeat.value * 22 + U.uUlt.value * 60;
  }
}
