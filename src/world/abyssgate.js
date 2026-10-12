// 幽渊秘境的地表入口：后山岩丘西肩崖下的废弃石洞（发现前不在舆图与导航中出现）。
// 洞口：实拍扫描山石叠成的石拱，内为幽深的洞腔（着色器做出纵深与暗红魔气），外封一块刻符石门；
// 线索：听松亭北面半埋的残碑，碑文残缺，碑旁地缝渗出暗红魔气。
// 机关：读过碑文后调查石门上的三枚符纹，按碑文暗示的次序（星、月、日）触动，石门沉入地下，洞口打开。
import * as THREE from 'three';
import { Builder, C } from './arch/builder.js';
import { ABYSS_GATE, ABYSS_CLUE } from './layout.js';
import { shaderMaterial, GLOBAL, FOGU } from './shaderlib.js';
import { ASSETS } from './assets.js';
import { scannedRocks } from './models.js';

// 碑文、符纹等刻在石面上的字：画布贴图
function engraving(w, h, draw, { px = 512, color = '#5e5a52' } = {}) {
  const cv = document.createElement('canvas');
  cv.width = px; cv.height = Math.round(px * h / w);
  const g = cv.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, cv.width, cv.height);
  // 石面颗粒
  for (let i = 0; i < 2200; i++) { const v = 70 + Math.random() * 40; g.fillStyle = `rgba(${v},${v - 4},${v - 10},.25)`; g.fillRect(Math.random() * cv.width, Math.random() * cv.height, 2, 2); }
  draw(g, cv.width, cv.height);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
  m.castShadow = false; m.receiveShadow = true;
  return m;
}

// 魔气：地缝与门缝里渗出的暗红烟缕与零星红芒（size 粒子大小倍数，drift 上升时向四周飘散的幅度）
function demonQi(n, spread, height, size = 1, drift = 0.5) {
  const pos = new Float32Array(n * 3), seed = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos.set([(Math.random() - 0.5) * spread[0], 0, (Math.random() - 0.5) * spread[1]], i * 3);
    seed.set([Math.random(), Math.random(), i % 5 === 0 ? 1 : 0], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  const u = { uTime: GLOBAL.uTime, uLevel: { value: 1 }, uH: { value: height }, uSize: { value: size }, uDrift: { value: drift } };
  const mat = shaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.CustomBlending,
    vertexPars: 'attribute vec3 aSeed; uniform float uTime, uLevel, uH, uSize, uDrift; varying float vA; varying float vK; varying float vS;',
    vertex: `
      vK = aSeed.z; vS = aSeed.x;
      float f = fract(uTime * (vK > .5 ? .22 : .07 + .05 * aSeed.y) + aSeed.x);
      vec3 p = position;
      p.y = uH * f * (vK > .5 ? 1.2 : 1.);
      p.x += sin(uTime * .9 + aSeed.y * 9.) * uDrift * f; p.z += cos(uTime * .7 + aSeed.x * 9.) * uDrift * f;
      vA = smoothstep(0., .15, f) * (1. - f) * uLevel;
      vec4 mvPosition = modelViewMatrix * vec4(p, 1.);
      gl_PointSize = (vK > .5 ? 22. : 260. + 260. * f) * uSize / -mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;`,
    fragmentPars: 'varying float vA; varying float vK; varying float vS;',
    fragment: `
      vec2 q = gl_PointCoord - .5; float d = length(q);
      float a = vK > .5 ? smoothstep(.5, .05, d) : smoothstep(.5, .0, d) * (.55 + .45 * nzv(q * 3. + vS * 13.));
      vec3 c = vK > .5 ? vec3(1., .2, .12) * 1.8 : mix(vec3(.30, .03, .05), vec3(.16, .02, .08), vS);
      gl_FragColor = vec4(c * a * vA, vK > .5 ? 0. : a * vA * .5);`,
  });
  mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  pts.userData.u = u;
  return pts;
}

// 洞腔：看似幽深的洞内（越往中心越暗，深处一点暗红光与缓缓涌动的雾）
function recessMaterial() {
  return shaderMaterial({
    uniforms: { uTime: GLOBAL.uTime, uOpen: { value: 0 } },
    vertexPars: 'varying vec2 vUv;',
    vertex: 'vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mvPosition;',
    fragmentPars: 'uniform float uTime, uOpen; varying vec2 vUv;',
    fragment: `
      vec2 q = (vUv - vec2(.5, .42)) * vec2(1., 1.25);
      float r = length(q);
      float depth = smoothstep(.62, .0, r);
      float mist = nzf(vec2(q.x * 3. + uTime * .05, q.y * 3. - uTime * .08)) * smoothstep(.55, .1, r);
      // 线性色：0.01 量级才是近黑（输出前会转为 sRGB）
      vec3 c = mix(vec3(.010, .010, .012), vec3(.0), depth);
      c += vec3(.16, .012, .018) * pow(smoothstep(.34, .0, r), 1.5) * (.6 + .4 * sin(uTime * 1.3)) * (.25 + uOpen * .75);
      c += vec3(.035, .004, .010) * mist * .6;
      gl_FragColor = vec4(c, 1.);`,
    fog: true,
  });
}

// 石门：刻着日、月、星三枚符纹；符纹在暗处透出暗红光
function doorMesh(w, h, d) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 576;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 576);
  g.strokeStyle = '#fff'; g.lineWidth = 9; g.lineCap = 'round';
  const glyph = (cx, cy, k) => {
    g.beginPath(); g.arc(cx, cy, 46, 0, Math.PI * 2); g.stroke();
    if (k === 0) { g.beginPath(); g.arc(cx, cy, 20, 0, Math.PI * 2); g.stroke(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26); g.lineTo(cx + Math.cos(a) * 38, cy + Math.sin(a) * 38); g.stroke(); } }
    if (k === 1) { g.beginPath(); g.arc(cx + 8, cy, 26, Math.PI * 0.6, Math.PI * 1.4, true); g.stroke(); }
    if (k === 2) { for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 0.8; g.lineTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26); } g.closePath(); g.stroke(); }
  };
  glyph(256, 150, 0); glyph(150, 330, 1); glyph(362, 330, 2);
  g.lineWidth = 5; g.strokeRect(40, 40, 432, 496);
  g.beginPath(); g.moveTo(256, 230); g.lineTo(256, 480); g.stroke();
  const tex = new THREE.CanvasTexture(cv);
  const T = ASSETS.tex;
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a847a, map: T.rock_d || null, normalMap: T.rock_n || null, roughness: 0.92, emissive: new THREE.Color(0xc0281c), emissiveMap: tex, emissiveIntensity: 0.6 });
  const u = { uRune: { value: 1 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FOGU);
    sh.uniforms.uRune = u.uRune; sh.uniforms.uTime = GLOBAL.uTime;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRune, uTime;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= uRune * (.55 + .45 * sin(uTime * 1.7));');
  };
  mat.customProgramCacheKey = () => 'abyss-door';
  const geo = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  m.userData.u = u;
  return m;
}

export function buildAbyssGate(ctx) {
  const G = ABYSS_GATE, fx = Math.sin(G.face), fz = Math.cos(G.face);
  const rx = fz, rz = -fx;                     // 洞口的右手方向（面向洞外时）
  const y = G.apron;
  const at = (along, lat, dy = 0) => new THREE.Vector3(G.x + fx * along + rx * lat, y + dy, G.z + fz * along + rz * lat);
  const group = new THREE.Group();
  group.name = 'abyss-gate';
  // 洞腔（崖面内 0.4 米）
  const W = 3.4, H = 3.9;
  const recess = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.6, H + 0.4), recessMaterial());
  recess.position.copy(at(-0.45, 0, (H + 0.4) / 2 - 0.05));
  recess.rotation.y = G.face;
  group.add(recess);
  // 洞腔两侧与顶部的岩壁（向内收，给出深度）
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6d6a64, map: ASSETS.tex.rock_d || null, normalMap: ASSETS.tex.rock_n || null, roughness: 0.95 });
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(1.6, H + 0.3), rockMat);
    side.position.copy(at(-0.1, s * (W / 2 + 0.05), (H + 0.3) / 2 - 0.05));
    side.rotation.y = G.face + s * Math.PI / 2 * 0.86 + Math.PI;
    side.receiveShadow = true;
    group.add(side);
  }
  // 石门
  const door = doorMesh(W + 0.2, H + 0.1, 0.5);
  door.position.copy(at(0.05, 0, (H + 0.1) / 2));
  door.rotation.y = G.face;
  group.add(door);
  // 石拱：两侧门柱般的巨石、顶上横卧的岩块、洞前散落的山石
  const rocks = [];
  const R = (along, lat, dy, s, ry) => { const p = at(along, lat, dy); rocks.push([p.x, p.y, p.z, s, ry]); };
  R(0.2, -W / 2 - 1.3, 0.2, 1.7, 0.3); R(0.0, -W / 2 - 1.1, 2.4, 1.45, 1.4); R(0.4, W / 2 + 1.4, 0.1, 1.8, 2.1); R(0.1, W / 2 + 1.2, 2.5, 1.4, 0.7);
  R(0.2, -0.6, H + 0.9, 2.2, 0.2); R(0.0, 1.4, H + 0.6, 1.9, 2.6);
  R(4.6, -4.2, -0.2, 1.6, 1.1); R(5.6, 3.9, -0.3, 2.0, 0.4); R(3.0, 5.6, -0.2, 1.2, 2.2); R(7.5, -2.6, -0.4, 1.3, 1.9);
  const stones = scannedRocks(rocks, [0.72, 0.7, 0.66]);
  group.add(stones);
  for (const [x, yy, z, s] of rocks) ctx.cw.addCyl({ x, z, y0: yy - 1, y1: yy + s * 1.2, r: s * 0.8, walk: false });
  // 门前与门缝里的魔气
  const qiDoor = demonQi(36, [2.8, 0.6], 3.8);
  qiDoor.position.copy(at(0.45, 0, 0));
  qiDoor.rotation.y = G.face;
  qiDoor.userData.u.uLevel.value = 0.55;
  group.add(qiDoor);
  // 遮掩：洞口两侧的老松与灌木、一截枯树桩（种进植被系统）
  const P = (along, lat) => { const p = at(along, lat); return [p.x, p.z]; };
  (ctx.extraVeg ||= []).push(['mPine03', ...P(6.5, -6.2), 1.35], ['mPine04', ...P(9, 5.6), 1.4], ['mOak05', ...P(11.5, -1.5), 1.0],
    ['mStump1', ...P(4.4, 2.8), 1.1], ['mStump3', ...P(7.2, -4.4), 1.0],
    ['shrub', ...P(4.2, 3.2), 1.2], ['shrub', ...P(5.0, -2.6), 1.1], ['shrubDry', ...P(3.6, -4.8), 1.0], ['fern', ...P(2.2, 2.6), 1.2], ['fern', ...P(2.0, -2.4), 1.1]);
  ctx.scene.add(group);

  // 线索：残碑（碑身断去上半截，斜插土中；断片落在一旁），碑旁地缝渗出魔气
  const Cl = ABYSS_CLUE, cy = ctx.terrain.heightAt(Cl.x, Cl.z);
  const b = new Builder();
  b.push(Cl.x, cy, Cl.z, Cl.ry);
  b.slab(1.5, 0.45, 0.7, C.stoneDark, 0, -0.15, 0, { mat: 'stone', rx: 0.05 });
  b.add(new THREE.BoxGeometry(1.15, 1.25, 0.32), 0x7d7870, 'stone', { x: 0.05, y: 0.75, z: 0, rz: 0.13, rx: -0.08 });
  b.add(new THREE.BoxGeometry(1.0, 0.7, 0.3), 0x74706a, 'stone', { x: 1.1, y: 0.18, z: 0.5, rz: 1.35, ry: 0.4, col: false });
  b.collider(0, 0, 1.4, 0, 0.8, 0.4);
  b.pop();
  ctx.place(b, { name: '残碑' });
  const ins = engraving(0.95, 1.0, (g, w, h) => {
    g.fillStyle = 'rgba(30,28,24,.85)'; g.font = `${Math.round(w * 0.13)}px "KaiTi","STKaiti",serif`; g.textAlign = 'center';
    const cols = ['…封', '幽渊', '于此', '下…', '星沉', '月隐'];
    cols.forEach((t, i) => { const x = w * (0.84 - i * 0.135); g.fillText(t[0], x, h * 0.3); if (t[1]) g.fillText(t[1], x, h * 0.5); });
    g.fillStyle = 'rgba(120,20,16,.5)'; g.fillRect(w * 0.1, h * 0.62, w * 0.8, h * 0.02);
  }, { color: '#77736b' });
  ins.position.set(Cl.x + Math.sin(Cl.ry) * 0.17 + Math.cos(Cl.ry) * 0.12, cy + 0.82, Cl.z + Math.cos(Cl.ry) * 0.17 - Math.sin(Cl.ry) * 0.12);
  ins.rotation.set(-0.08, Cl.ry, 0.13, 'YXZ');
  ctx.scene.add(ins);
  const qiCrack = demonQi(44, [1.6, 1.0], 2.6);
  qiCrack.position.set(Cl.x - Math.cos(Cl.ry) * 1.2, cy - 0.05, Cl.z + Math.sin(Cl.ry) * 1.2);
  ctx.scene.add(qiCrack);
  // 碑脚升起的一道暗红烟柱（约 12 米高、缓缓飘散）：从后山小径与听松亭都能望见，是寻找残碑的主要线索
  const plume = demonQi(80, [1.4, 1.4], 12, 2.6, 1.6);
  plume.position.copy(qiCrack.position);
  plume.userData.u.uLevel.value = 0.9;
  ctx.scene.add(plume);

  ctx.anchors.abyssClue = { x: Cl.x + Math.sin(Cl.ry) * 1.6, y: cy, z: Cl.z + Math.cos(Cl.ry) * 1.6 };
  const front = at(2.6, 0);
  ctx.anchors.abyssDoor = { x: front.x, y, z: front.z };

  // 机关开启：石门沉入地下（约 2.6 秒），门缝魔气涌出后渐稳，洞腔深处的红光变亮
  const state = { open: false, t: 0, anim: false, door, recess, qiDoor, qiCrack, plume };
  // 封印加固之后，碑脚渗出的魔气变淡
  state.setCalm = (v) => { plume.userData.u.uLevel.value = v ? 0.25 : 0.9; qiCrack.userData.u.uLevel.value = v ? 0.35 : 1; };
  state.setOpen = (v, animate = false) => {
    state.open = v;
    if (!animate) { door.position.y = v ? y - (H + 0.1) / 2 - 0.15 : y + (H + 0.1) / 2; door.userData.u.uRune.value = v ? 0.15 : 1; recess.material.uniforms.uOpen.value = v ? 1 : 0; door.visible = !v; return; }
    state.anim = true; state.t = 0; door.visible = true;
  };
  state.update = (dt) => {
    if (!state.anim) return;
    state.t += dt;
    const k = Math.min(1, state.t / 2.6), e = k * k * (3 - 2 * k);
    door.position.y = y + (H + 0.1) / 2 - e * (H + 0.25);
    door.position.x = at(0.05, 0).x + (Math.random() - 0.5) * 0.04 * (1 - k);
    door.userData.u.uRune.value = 1 - 0.85 * e;
    recess.material.uniforms.uOpen.value = e;
    qiDoor.userData.u.uLevel.value = 0.55 + Math.sin(k * Math.PI) * 1.4;
    if (k >= 1) { state.anim = false; door.visible = false; }
  };
  ctx.abyssGate = state;
  return state;
}
