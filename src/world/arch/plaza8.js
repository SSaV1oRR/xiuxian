// 演武广场与凌云阁（第八轮，依「演武广场修正版」三视图）：
//   聚灵阵：石台（qi.js 的阵面 + props.trainingPlatform 的台身）外一圈青玉嵌框（方形），四角各一方灵泉（汉白玉池沿、青玉水、铜灯立于池心），
//           灵泉经斜向导流槽（两侧槽沿石、槽底青玉、槽内灵光）接到阵台；四正向以青玉嵌线接阵台踏步与方框中点的团纹。
//           待机时槽内微光缓流；修炼时灵泉转亮，一道道灵光沿槽涌向阵台，再经阵面导流槽汇向打坐的人；结束后平滑减弱。
//   回廊：单面空廊——朝广场一侧柱廊、坐凳；背面白墙，每间一方漏窗（棂格实做，可透视）；梁架（月梁、瓜柱、脊檩）、悬山屋面（鎏金脊饰）；
//         侧门：门楼（高出廊顶的悬山门罩）、门框、两扇向内开启的板门、门额小匾。
//   凌云阁：须弥台上的两层楼阁——下层五开间（前廊、隔扇门、槛窗）、腰檐、平座（斗拱托、木栏杆）、上层三开间（格栅门窗）、歇山顶（鎏金）。
//   钟亭、鼓亭：凌云阁台下两侧的矮石台上，方亭重檐，亭中悬青铜钟 / 置大鼓。
import * as THREE from 'three';
import { C } from './builder.js';
import { rail, woodRail, stairs, beam, dougong, doorLeaves, sillWindow, roofAssembly, hipRoofGeo, eaves, liftFn, goldCurl, plaqueMesh, pavilion, hangLantern, hipCornerLines, ridgeAlong } from './arch.js';
import { plankDoors, paintedBeam } from './gate8.js';
import { banner } from './halls.js';
import { columnBase } from './stone9.js';
import { GLOBAL, FOGU, injectFog, shaderMaterial, NOISE_GLSL } from '../shaderlib.js';

const TAU = Math.PI * 2;

// ---------- 铜灯：六角灯亭（铜座、灯柱、灯室透光、宝顶），s 为整体缩放 ----------
export function bronzeLamp(b, x, y, z, s = 1) {
  const B = C.bronze, G = C.gold;
  b.cyl(0.34 * s, 0.42 * s, 0.16 * s, B, x, y, z, { seg: 6, mat: 'bronze', col: false });
  b.cyl(0.22 * s, 0.3 * s, 0.22 * s, B, x, y + 0.16 * s, z, { seg: 6, mat: 'bronze', col: false });
  b.cyl(0.08 * s, 0.1 * s, 1.1 * s, B, x, y + 0.38 * s, z, { seg: 8, mat: 'bronze', col: false });
  b.add(new THREE.TorusGeometry(0.11 * s, 0.03 * s, 5, 10), G, 'gold', { x, y: y + 0.95 * s, z, rx: Math.PI / 2, col: false });
  b.cyl(0.3 * s, 0.16 * s, 0.14 * s, B, x, y + 1.48 * s, z, { seg: 6, mat: 'bronze', col: false });
  b.cyl(0.22 * s, 0.22 * s, 0.46 * s, 0xffc070, x, y + 1.62 * s, z, { seg: 6, mat: 'glow', col: false });
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; b.box(0.04 * s, 0.5 * s, 0.04 * s, B, x + Math.cos(a) * 0.24 * s, y + 1.87 * s, z + Math.sin(a) * 0.24 * s, { mat: 'bronze', col: false }); }
  b.add(new THREE.ConeGeometry(0.44 * s, 0.36 * s, 6), B, 'bronze', { x, y: y + 2.26 * s, z, col: false });
  b.sphere(0.08 * s, G, x, y + 2.5 * s, z, { mat: 'gold', seg: 8, seg2: 6 });
  b.cylCollider(x, y, y + 2.4 * s, z, 0.4 * s);
  b.emitter('light', x, y + 1.62 * s, z, { k: 1.0 });
}

// ---------- 青玉嵌线与导流槽材质（随阵法亮度；导流槽内灵光流向阵台）----------
function inlayMaterial(u) {
  const m = new THREE.MeshStandardMaterial({ color: 0x6cbfa8, roughness: 0.28, metalness: 0.04 });
  m.onBeforeCompile = (sh) => {
    injectFog(sh);
    sh.uniforms.uLevel = u.uLevel; sh.uniforms.uNight = FOGU.uNight; sh.uniforms.uTime = GLOBAL.uTime;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLevel, uNight, uTime;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(.3, .85, .72) * (.06 + uLevel * .5 + uNight * .22) * (.85 + .15 * sin(uTime * 1.6));');
  };
  m.customProgramCacheKey = () => 'plaza8-inlay';
  return m;
}
function grooveMaterial(u) {
  return shaderMaterial({
    uniforms: { uTime: GLOBAL.uTime, uLevel: u.uLevel, uSeq: u.uSeq, uNight: FOGU.uNight },
    vertexPars: 'varying vec2 vUv; varying vec3 vW;',
    vertex: 'vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;',
    fragmentPars: 'uniform float uTime, uLevel, uSeq, uNight; varying vec2 vUv; varying vec3 vW;',
    fragment: `
      // vUv.x：0 灵泉 → 1 阵台；vUv.y 横过槽宽
      float lv = uLevel, edge = smoothstep(0., .18, vUv.y) * smoothstep(1., .82, vUv.y);
      float rip = nzf(vec2(vUv.x * 6. - uTime * (.3 + lv * 1.2), vUv.y * 2. + vW.x * .1));
      vec3 water = mix(vec3(.10, .32, .30), vec3(.22, .55, .50), rip);
      float sp = vUv.x * 3.2 - uTime * (.35 + lv * 1.4);
      float dash = smoothstep(.0, .2, fract(sp)) * smoothstep(1., .55, fract(sp));
      float front = clamp(uSeq * 1.6 - vUv.x * .6, 0., 1.);
      float g = (.12 + .25 * dash) * (1. - lv) + lv * front * (.35 + 1.3 * dash);
      vec3 col = water + vec3(.35, .95, .82) * g * (.7 + uNight * .6) * edge;
      gl_FragColor = vec4(col, 1.);`,
  });
}

// ---------- 聚灵阵外围：方框、灵泉、导流槽、正向嵌线 ----------
// c：阵台中心 { x, z, r }，y 广场面；u：QiVortex 的 uniform（uLevel、uSeq）
export function plazaArray8(ctx, b, c, y, u) {
  const F = 13.5, BW = 0.9, inlay = inlayMaterial(u), scene = ctx.scene;
  // 方框：深色条石底（略低于铺地的嵌带）+ 两道青玉嵌线 + 外沿白石压边
  const band = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    b.box(L + BW, 0.04, BW, 0x8c8a82, cx, y + 0.012, cz, { mat: 'stoneSmooth', ry, col: false });
    for (const o of [-0.26, 0.26]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(L + BW - 0.5, 0.12), inlay);
      m.rotation.set(-Math.PI / 2, 0, ry); m.position.set(cx + Math.sin(ry) * o, y + 0.036, cz + Math.cos(ry) * o);
      scene.add(m);
    }
  };
  const X0 = c.x - F, X1 = c.x + F, Z0 = c.z - F, Z1 = c.z + F;
  band(X0 + 2, Z0, X1 - 2, Z0); band(X0 + 2, Z1, X1 - 2, Z1); band(X0, Z0 + 2, X0, Z1 - 2); band(X1, Z0 + 2, X1, Z1 - 2);
  // 四正向：阵台踏步脚下到方框中点的青玉嵌线 + 方框中点团纹（白石圆、青玉心）
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU, sx = Math.sin(a), sz = Math.cos(a);
    const r0 = c.r + 1.05, r1 = F - BW / 2;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.14, r1 - r0), inlay);
    m.rotation.set(-Math.PI / 2, 0, a); m.position.set(c.x + sx * (r0 + r1) / 2, y + 0.03, c.z + sz * (r0 + r1) / 2);
    scene.add(m);
    b.cyl(0.78, 0.82, 0.05, C.marble, c.x + sx * F, y, c.z + sz * F, { seg: 24, mat: 'stoneSmooth', col: false });
    const md = new THREE.Mesh(new THREE.CircleGeometry(0.36, 24), inlay);
    md.rotation.x = -Math.PI / 2; md.position.set(c.x + sx * F, y + 0.056, c.z + sz * F);
    scene.add(md);
  }
  // 四角灵泉：汉白玉池沿（两层）、青玉池底、水面、池心铜灯；斜向导流槽通到阵台
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x1f8a7c, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.86, emissive: 0x0b3a33 });
  waterMat.onBeforeCompile = (sh) => {
    injectFog(sh); sh.uniforms.uLevel = u.uLevel; sh.uniforms.uTime = GLOBAL.uTime;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLevel, uTime;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(.2, .7, .6) * uLevel * (.35 + .15 * sin(uTime * 2.));');
  };
  waterMat.customProgramCacheKey = () => 'plaza8-spring';
  const gMat = grooveMaterial(u), grooves = [];
  for (let k = 0; k < 4; k++) {
    const a = TAU / 8 + (k / 4) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const px = c.x + Math.sign(ca) * F, pz = c.z + Math.sign(sa) * F, S = 3.2, t = 0.32, h = 0.42;
    b.push(px, y, pz, 0);
    for (const [sx, sz, w, d] of [[0, S / 2 - t / 2, S, t], [0, -S / 2 + t / 2, S, t], [S / 2 - t / 2, 0, t, S - 2 * t], [-S / 2 + t / 2, 0, t, S - 2 * t]]) {
      b.slab(w + 0.12, 0.14, d + 0.12, C.marbleShade, sx, 0, sz, { mat: 'stoneSmooth', col: false });
      b.slab(w, h - 0.14, d, C.marble, sx, 0.14, sz, { mat: 'stoneSmooth', col: false });
    }
    b.slab(S - 2 * t, 0.05, S - 2 * t, 0x7fb8a8, 0, 0.0, 0, { mat: 'jade', col: false });
    b.collider(0, 0, 0.7, 0, S / 2, S / 2, 0, { walk: false, cam: false });
    b.pop();
    bronzeLamp(b, px, y + 0.05, pz, 0.92);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(S - 2 * t, S - 2 * t), waterMat);
    w.rotation.x = -Math.PI / 2; w.position.set(px, y + h - 0.1, pz);
    scene.add(w);
    // 导流槽：自灵泉内角到阵台外沿（槽宽 0.56，两侧槽沿石高出铺地 6 厘米，槽底低 6 厘米）
    const dx = c.x - px, dz = c.z - pz, D = Math.hypot(dx, dz), ux = dx / D, uz = dz / D;
    const s0 = Math.hypot(S / 2, S / 2) + 0.05, s1 = D - (c.r + 0.25), Lg = s1 - s0, mx = px + ux * (s0 + s1) / 2, mz = pz + uz * (s0 + s1) / 2, ry = Math.atan2(-uz, ux);
    for (const o of [-1, 1]) b.box(Lg, 0.12, 0.2, C.marbleWarm, mx - Math.sin(ry) * o * 0.38, y + 0.0, mz - Math.cos(ry) * o * 0.38, { mat: 'stoneSmooth', ry, col: false });
    b.box(Lg, 0.04, 0.56, 0x55605a, mx, y - 0.04, mz, { mat: 'stoneSmooth', ry, col: false });
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(Lg, 0.56), gMat);
    gm.rotation.set(-Math.PI / 2, 0, ry); gm.position.set(mx, y - 0.005, mz);
    scene.add(gm);
    grooves.push({ x0: px + ux * s0, z0: pz + uz * s0, x1: px + ux * s1, z1: pz + uz * s1 });
  }
  // 灵气顺槽而行：每道槽十粒，修炼时自灵泉涌向阵台（与阵面上的灵气流相接）
  const per = 10, n = grooves.length * per, seed = new Float32Array(n * 2), start = new Float32Array(n * 3), end = new Float32Array(n * 3);
  grooves.forEach((g, k) => { for (let i = 0; i < per; i++) { const q = k * per + i; seed.set([i / per + Math.random() * 0.05, Math.random()], q * 2); start.set([g.x0, y + 0.12, g.z0], q * 3); end.set([g.x1, y + 0.12, g.z1], q * 3); } });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(start.slice(), 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
  const pts = new THREE.Points(geo, shaderMaterial({
    uniforms: { uTime: GLOBAL.uTime, uLevel: u.uLevel, uSeq: u.uSeq }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexPars: 'attribute vec3 aEnd; attribute vec2 aSeed; uniform float uTime, uLevel, uSeq; varying float vA;',
    vertex: `
      float f = fract(aSeed.x + uTime * (.12 + uLevel * .35));
      vec3 p = mix(position, aEnd, f); p.y += .06 + .12 * sin(f * 3.1416) + .05 * sin(uTime * 3. + aSeed.y * 9.);
      vA = (.08 + .92 * uLevel * smoothstep(.0, .4, uSeq)) * smoothstep(0., .08, f) * smoothstep(1., .85, f);
      vec4 mvPosition = viewMatrix * vec4(p, 1.);
      gl_PointSize = (3. + 3.5 * uLevel) * 16. / -mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;`,
    fragmentPars: 'varying float vA;',
    fragment: 'float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(vec3(.45, .95, .82) * vA * .9 * pow(smoothstep(.5, .0, d), 1.6), 1.);',
  }));
  pts.frustumCulled = false; pts.renderOrder = 4; pts.name = 'plaza-groove-qi';
  scene.add(pts);
  return { F, grooves };
}

// ---------- 演武场南门（第九轮，问心阶顶；参考 B 图前景的门殿）----------
// 三间通透门殿：明间单檐歇山（鎏金宝珠、略高），次间庑殿低檐；前后檐柱、旋子彩画额枋、斗拱各一排；
// 三间都不设门扇与门槛，与问心阶同宽、平地通行。本地原点为门殿中心地面，+Z 朝问心阶（南）
export function plazaGate9(b, { front = '演武', back = '聚灵' } = {}) {
  const XI = 2.4, XS = 7.2, D = 4.0, zc = D / 2, HC = 5.4, HS = 4.2;
  b.slab(2 * XS + 1.2, 0.03, D + 1.2, C.marbleWarm, 0, -0.015, 0, { mat: 'stoneSmooth', col: false });
  const col = (x, z, h, r, bronze) => { columnBase(b, x, 0, z, r, { bronze }); b.cyl(r, r + 0.02, h, C.vermilion, x, h / 2, z, { seg: 14, mat: 'wood' }); };
  for (const z of [zc, -zc]) for (const s of [-1, 1]) { col(s * XI, z, HC, 0.28, true); col(s * XS, z, HS, 0.24, false); }
  for (const z of [zc, -zc]) {
    paintedBeam(b, -XI - 0.3, XI + 0.3, HC - 0.56, z, 0.42, 0.34);
    b.slab(2 * XI + 0.8, 0.14, 0.44, C.woodRed, 0, HC - 0.14, z, { mat: 'wood', col: false });
    for (const s of [-1, 1]) {
      paintedBeam(b, s < 0 ? -XS - 0.3 : XI, s < 0 ? -XI : XS + 0.3, HS - 0.5, z, 0.36, 0.3);
      b.slab(XS - XI + 0.4, 0.12, 0.4, C.woodRed, s * (XI + XS) / 2, HS - 0.12, z, { mat: 'wood', col: false });
      for (let i = 1; i <= 5; i++) dougong(b, s * (XI + (i * (XS - XI)) / 6), HS, z, 0.28, z > 0 ? 0 : Math.PI, true);
    }
    for (let i = 0; i <= 6; i++) dougong(b, -XI + (i * 2 * XI) / 6, HC, z, 0.34, z > 0 ? 0 : Math.PI, true);
  }
  for (const s of [-1, 1]) {
    b.slab(0.34, 0.42, D + 0.34, C.paintBlue, s * XI, HC - 0.56, 0, { col: false });
    b.slab(0.3, 0.36, D + 0.3, C.paintBlue, s * XS, HS - 0.5, 0, { col: false });
    for (let i = 1; i < 4; i++) dougong(b, s * XS, HS, -zc + (i * D) / 4, 0.28, s * Math.PI / 2, true);
  }
  // 屋顶：明间歇山（鎏金），次间庑殿；明间顶下的天花
  const yT = HC + 0.3, W1 = 2 * XI + 3.4, D1 = D + 2.8, H1 = D1 * 0.42;
  roofAssembly(b, 'xieshan', W1, D1, H1, yT, C.tileDark, 'glaze', { gold: true, goldK: 0.8, fish: true });
  b.slab(W1 - 0.4, 0.14, D1 - 0.4, C.woodDark, 0, yT - 0.18, 0, { mat: 'wood', col: false });
  b.slab(2 * XI - 0.3, 0.06, D - 0.3, C.woodRed, 0, HC - 0.62, 0, { mat: 'wood', col: false });
  const yS = HS + 0.24, W2 = XS - XI + 1.9, D2 = D + 2.2;
  for (const s of [-1, 1]) {
    b.push(s * ((XI + XS) / 2 + 0.45), 0, 0, 0);
    roofAssembly(b, 'hip', W2, D2, D2 * 0.3, yS, C.tileDark, 'glaze', { gold: false });
    b.pop();
  }
  // 门匾：正面（朝问心阶）与背面（朝广场）；檐下宫灯
  const p1 = plaqueMesh(front, 2.2, 0.86, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
  p1.position.set(0, HC - 1.06, zc + 0.3); b.addMesh(p1);
  const p2 = plaqueMesh(back, 2.2, 0.86, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
  p2.position.set(0, HC - 1.06, -zc - 0.3); p2.rotation.y = Math.PI; b.addMesh(p2);
  for (const z of [zc + 0.35, -zc - 0.35]) for (const s of [-1, 1]) hangLantern(b, s * (XI - 0.75), HC - 0.72, z, 0.8, true);
  b.collider(0, yT - 0.2, yT + H1 * 0.6, 0, (W1 / 2) * 0.9, (D1 / 2) * 0.9);
  for (const s of [-1, 1]) b.collider(s * ((XI + XS) / 2 + 0.45), yS - 0.2, yS + D2 * 0.2, 0, (W2 / 2) * 0.9, (D2 / 2) * 0.9);
}

// ---------- 回廊（单面空廊）----------
// 本地 X 沿回廊 0..L，内侧（+Z）朝广场；gaps：侧门 [a, b]（本地 X），labels：各侧门门额
export function colonnade8(b, L, o = {}) {
  const w = o.w ?? 3.6, h = o.h ?? 3.1, base = o.base ?? 0.3, gaps = o.gaps ?? [], labels = o.labels ?? [];
  const n = Math.max(1, Math.round(L / (o.bay ?? 3.3))), bw = L / n;
  const zi = w / 2 - 0.35, zo = -(w / 2 - 0.35);
  const pillar = C.vermilion;
  const inGap = (x) => gaps.some(([a, c]) => x > a - 0.3 && x < c + 0.3);
  // 台明（可走）、阶条石、土衬
  b.slab(L + 0.7, base, w + 0.5, C.stone, L / 2, -0.05, 0, { mat: 'stone' });
  b.slab(L + 0.8, 0.07, w + 0.6, C.marbleWarm, L / 2, base - 0.07, 0, { mat: 'stoneSmooth', col: false });
  b.slab(L + 1.0, 0.1, w + 0.8, C.stoneDark, L / 2, -0.12, 0, { mat: 'stone', col: false });
  // 柱与柱础（覆盆 + 鼓镜）
  for (let i = 0; i <= n; i++) {
    const x = i * bw;
    for (const z of [zi, zo]) {
      columnBase(b, x, base, z, 0.155);
      b.cyl(0.14, 0.155, h, pillar, x, base + h / 2, z, { seg: 10, mat: 'wood' });
    }
    // 梁架：抱头梁（月梁）+ 瓜柱 + 脊檩下的叉手
    b.add(new THREE.BoxGeometry(0.2, 0.3, w - 0.5), C.woodRed, 'wood', { x, y: base + h - 0.12, z: 0, col: false });
    b.box(0.16, 0.62, 0.16, C.woodRed, x, base + h + 0.34, 0, { mat: 'wood', col: false });
    for (const s of [-1, 1]) beam(b, x, base + h + 0.05, s * (w / 2 - 0.5), x, base + h + 0.62, s * 0.1, 0.1, C.woodRed, 'wood');
  }
  // 檐檩、额枋（旋子彩画）、脊檩；挂落
  for (const z of [zi, zo]) {
    b.slab(L + 0.36, 0.3, 0.22, C.paintBlue, L / 2, base + h - 0.32, z, { col: false });
    b.panel(L + 0.3, 0.26, 0xffffff, L / 2, base + h - 0.19, z + (z > 0 ? 0.115 : -0.115), { mat: 'caihua', uvScale: [L + 0.3, 1], ry: z > 0 ? 0 : Math.PI });
    b.slab(L + 0.3, 0.13, 0.17, C.paintGreen, L / 2, base + h - 0.56, z, { col: false });
  }
  b.slab(L + 0.4, 0.2, 0.22, C.woodRed, L / 2, base + h + 0.6, 0, { mat: 'wood', col: false });
  for (let i = 0; i < n; i++) {
    const xm = (i + 0.5) * bw;
    b.slab(bw * 0.26, 0.2, 0.24, C.gold, xm, base + h - 0.27, zi, { col: false, mat: 'gold' });
    if (inGap(xm)) continue;
    b.box(bw - 0.34, 0.05, 0.05, C.woodRed, xm, base + h - 0.92, zi, { col: false, mat: 'wood' });
    for (let k = 1; k < 8; k++) b.box(0.035, 0.32, 0.035, C.woodRed, i * bw + 0.17 + (k * (bw - 0.34)) / 8, base + h - 0.76, zi, { col: false, mat: 'wood' });
    // 内侧坐凳（朝广场）
    b.slab(bw - 0.34, 0.08, 0.4, C.woodRed, xm, base + 0.42, zi - 0.05, { col: false, mat: 'wood' });
    b.slab(bw - 0.34, 0.42, 0.06, C.woodRed, xm, base, zi + 0.12, { col: false, mat: 'wood' });
    b.collider(xm, base, base + 0.6, zi, (bw - 0.3) / 2, 0.22, 0, { walk: false, cam: false });
  }
  // 背墙：每间白墙、漏窗（棂格实做，透得见墙外）、墙裙
  const wallT = 0.3, wz = zo - 0.12, wTop = base + h;
  for (let i = 0; i < n; i++) {
    const xa = i * bw + 0.15, xb = (i + 1) * bw - 0.15, xm = (xa + xb) / 2, lw = xb - xa;
    if (inGap(xm)) continue;
    const ow = Math.min(1.5, lw - 0.8), oy0 = base + 1.05, oy1 = base + 2.25;
    b.slab(lw, 0.55, wallT + 0.06, C.marbleShade, xm, base, wz, { mat: 'stone' });                         // 墙裙
    b.slab(lw, oy0 - base - 0.55, wallT, C.plaster, xm, base + 0.55, wz, { mat: 'std' });
    b.slab(lw, wTop - oy1, wallT, C.plaster, xm, oy1, wz, { mat: 'std', col: false });
    for (const s of [-1, 1]) b.slab((lw - ow) / 2, oy1 - oy0, wallT, C.plaster, xm + s * (ow / 2 + (lw - ow) / 4), oy0, wz, { mat: 'std', col: false });
    // 漏窗：灰砖框 + 万字棂格
    for (const s of [-1, 1]) b.box(ow + 0.12, 0.08, wallT + 0.04, C.stoneGrey, xm, s > 0 ? oy1 - 0.04 : oy0 + 0.04, wz, { mat: 'stoneSmooth', col: false });
    for (const s of [-1, 1]) b.box(0.08, oy1 - oy0, wallT + 0.04, C.stoneGrey, xm + s * (ow / 2 + 0.02), (oy0 + oy1) / 2, wz, { mat: 'stoneSmooth', col: false });
    const gx = 5, gy = 4;
    for (let k = 1; k < gx; k++) b.box(0.045, oy1 - oy0, 0.06, C.stoneGrey, xm - ow / 2 + (k * ow) / gx, (oy0 + oy1) / 2, wz, { mat: 'stoneSmooth', col: false });
    for (let k = 1; k < gy; k++) b.box(ow, 0.045, 0.06, C.stoneGrey, xm, oy0 + (k * (oy1 - oy0)) / gy, wz, { mat: 'stoneSmooth', col: false });
    b.collider(xm, base, wTop, wz, lw / 2 + 0.02, wallT / 2 + 0.05, 0, { walk: false, cam: false });
  }
  // 悬山屋面（鎏金脊端），两端博风
  const RW = L + 1.3, RD = w + 2.1, rh = RD * 0.3;
  b.push(L / 2, base + h + 0.1, 0, 0);
  roofAssembly(b, 'gable', RW, RD, rh, 0, C.tileDark, 'glaze', {});
  for (const s of [-1, 1]) goldCurl(b, s * (RW / 2 - 0.2), rh + 0.42, 0, 0.8);
  b.pop();
  b.collider(L / 2, base + h, base + h + rh, 0, RW / 2, (RD / 2) * 0.9);
  // 侧门：门楼（高出廊顶的悬山门罩，垂直于回廊）、门框、两扇向内开启的板门、门额小匾
  gaps.forEach(([a, c], gi) => {
    const m = (a + c) / 2, gw = c - a, dw = Math.min(2.6, gw - 1.0);
    // 门两侧墙垛（白墙）、门上走马板
    const DH = 2.45;
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? a - 0.15 : m + dw / 2 + 0.24, x1 = s < 0 ? m - dw / 2 - 0.24 : c + 0.15;
      if (x1 - x0 > 0.1) b.slab(x1 - x0, h, wallT + 0.1, C.plaster, (x0 + x1) / 2, base, wz, { mat: 'std' });
    }
    b.slab(dw + 0.5, h - DH - 0.24, wallT + 0.1, C.plaster, m, base + DH + 0.24, wz, { mat: 'std', col: false });
    b.push(m, base, wz, Math.PI);
    plankDoors(b, 0, 0, 0, dw, DH, { open: 1.25, rows: 6, cols: 5 });
    b.pop();
    // 门罩：两坡、鎏金脊端，比廊顶高
    // 门罩：门两侧各一对短柱托起额枋，其上一座垂直于回廊的悬山（比廊顶高出一截），山面朝广场与墙外
    const gy = base + h + rh * 0.55;
    for (const s of [-1, 1]) for (const zz of [zi, wz]) b.cyl(0.13, 0.14, gy - base - h + 0.2, C.vermilion, m + s * (gw / 2 - 0.2), base + h - 0.1 + (gy - base - h + 0.2) / 2, zz, { seg: 10, mat: 'wood', col: false });
    for (const zz of [zi, wz]) { b.slab(gw + 0.2, 0.36, 0.26, C.woodRed, m, gy - 0.1, zz, { mat: 'wood', col: false }); b.panel(gw, 0.32, 0xffffff, m, gy + 0.08, zz + (zz > 0 ? 0.135 : -0.135), { mat: 'caihua', uvScale: [gw, 1], ry: zz > 0 ? 0 : Math.PI }); }
    for (let i = 0; i <= 4; i++) for (const zz of [zi, wz]) dougong(b, m - gw / 2 + 0.3 + (i * (gw - 0.6)) / 4, gy + 0.26, zz, 0.3, zz > 0 ? 0 : Math.PI, true);
    b.push(m, gy + 0.5, (zi + wz) / 2, Math.PI / 2);
    roofAssembly(b, 'gable', w + 2.4, gw + 1.0, (gw + 1.0) * 0.34, 0, C.tileDark, 'glaze', {});
    for (const s of [-1, 1]) goldCurl(b, s * ((w + 2.4) / 2 - 0.2), (gw + 1.0) * 0.34 + 0.42, 0, 0.75);
    b.pop();
    b.collider(m, base + h, gy + 0.5 + (gw + 1.0) * 0.34, (zi + wz) / 2, gw / 2 + 0.5, ((w + 2.4) / 2) * 0.9);
    if (labels[gi]) {
      const pm = plaqueMesh(labels[gi], 1.5, 0.55, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
      pm.position.set(m, base + DH + 0.62, wz + wallT / 2 + 0.12);
      b.addMesh(pm);
      const pm2 = plaqueMesh(labels[gi], 1.5, 0.55, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
      pm2.position.set(m, base + DH + 0.62, wz - wallT / 2 - 0.12); pm2.rotation.y = Math.PI;
      b.addMesh(pm2);
    }
  });
  return { top: base + h + rh };
}

// ---------- 凌云阁：两层楼阁（本地原点为台基中心地面，正面 +Z）----------
export function lingyunHall(b, o = {}) {
  const base = 1.2, bays = [3.4, 3.8, 4.6, 3.8, 3.4], W1 = bays.reduce((s, v) => s + v, 0), D1 = 11.2, H1 = 5.4, porch = 2.4;
  const xs = [-W1 / 2]; for (const v of bays) xs.push(xs[xs.length - 1] + v);
  const zf = D1 / 2 - porch, zb = -D1 / 2;
  // 台基（四沿汉白玉栏杆，前后踏步口）
  const BW = W1 + 4.6, BD = D1 + 4.6, sw = 6.4;
  b.slab(BW, base - 0.2, BD, C.marbleShade, 0, 0, 0, { mat: 'stone' });
  b.slab(BW + 0.3, 0.2, BD + 0.3, C.marble, 0, base - 0.2, 0, { mat: 'stoneSmooth' });
  b.slab(BW + 0.16, 0.14, BD + 0.16, C.marbleWarm, 0, 0, 0, { mat: 'stoneSmooth', col: false });
  const nS = Math.round(base / 0.17), run = 0.32;
  stairs(b, 0, 0, BD / 2 + nS * run, sw, base, { run, stepH: base / nS, color: C.marble, cheekW: 0.4 });
  stairs(b, 0, 0, -(BD / 2 + nS * run), 4.2, base, { run, stepH: base / nS, color: C.marble, cheekW: 0.36, ry: Math.PI });
  // 台基两侧不设踏步：台下东西两条绕行通道（约 6 米宽）直通阁后的登云阶
  {
    const X = BW / 2 - 0.2, Z = BD / 2 - 0.2, g = sw / 2 + 0.4, gb = 2.5;
    rail(b, [[-g, Z], [-X, Z], [-X, -Z], [-gb, -Z]], base, { h: 0.85, color: C.marble, spacing: 1.7 });
    rail(b, [[gb, -Z], [X, -Z], [X, Z], [g, Z]], base, { h: 0.85, color: C.marble, spacing: 1.7 });
  }
  let y = base;
  // 下层柱网：外檐柱一周、前廊金柱一排（门窗所在）
  const col = (x, z, h, r) => {
    columnBase(b, x, y, z, r, { bronze: true });
    b.cyl(r, r + 0.02, h, C.vermilion, x, y + h / 2, z, { seg: 14, mat: 'wood' });
  };
  for (const x of xs) { col(x, D1 / 2, H1, 0.27); col(x, zb, H1, 0.27); col(x, zf, H1, 0.25); }
  for (const z of [zf - (zf - zb) / 2]) for (const x of [xs[0], xs[5]]) col(x, z, H1, 0.27);
  // 前檐（金柱一线）：中三间隔扇门、两梢间槛窗；横披窗
  const wh = H1 - 0.62;
  for (let i = 0; i < 5; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2, iw = bays[i] - 0.5, top = wh - 0.75;
    b.panel(iw - 0.1, 0.58, C.paper, cx, y + wh - 0.38, zf + 0.03);
    b.panel(iw - 0.1, 0.58, C.paper, cx, y + wh - 0.38, zf - 0.03, { ry: Math.PI });
    b.box(iw, 0.1, 0.14, C.vermilion, cx, y + top, zf, { col: false, mat: 'wood' });
    b.box(iw, 0.1, 0.14, C.vermilion, cx, y + wh - 0.05, zf, { col: false, mat: 'wood' });
    if (i >= 1 && i <= 3) {
      b.slab(iw, 0.2, 0.2, C.vermilion, cx, y, zf, { col: false, mat: 'wood' });
      doorLeaves(b, cx, y + 0.2, zf, iw, top - 0.2, { frame: C.vermilion, leaves: 4 });
    } else sillWindow(b, cx, y, zf, iw, top, { frame: C.vermilion, wall: C.red, wallMat: 'std', sill: 0.9 });
    b.collider(cx, y, y + wh, zf, bays[i] / 2, 0.2);
  }
  // 山墙与后檐：红墙、槛窗
  for (const s of [-1, 1]) {
    b.push(s * W1 / 2, 0, (zf + zb) / 2, s * Math.PI / 2);
    const L = zf - zb, ww = L / 2 - 0.6, top = wh - 0.75;
    for (const q of [-1, 1]) sillWindow(b, q * L / 4, y, 0, ww, top, { frame: C.vermilion, wall: C.red, wallMat: 'std', sill: 1.0 });
    b.slab(0.6, top, 0.36, C.red, 0, y, -0.06, { mat: 'std', col: false });
    for (const q of [-1, 1]) b.slab(0.3, top, 0.36, C.red, q * (L / 2 - 0.15), y, -0.06, { mat: 'std', col: false });
    b.slab(L, wh - top, 0.36, C.red, 0, y + top, -0.06, { mat: 'std', col: false });
    b.collider(0, y, y + wh, -0.06, L / 2, 0.2);
    b.pop();
  }
  b.slab(W1 - 0.4, wh, 0.38, C.red, 0, y, zb, { mat: 'std' });
  for (let i = 0; i < 5; i++) b.panel(bays[i] - 1.2, 1.2, C.paper, (xs[i] + xs[i + 1]) / 2, y + wh - 1.4, zb - 0.2, { ry: Math.PI });
  // 额枋（旋子彩画）、平板枋、斗拱一周
  for (const z of [D1 / 2, zb]) { b.slab(W1 + 0.6, 0.5, 0.4, C.woodRed, 0, y + H1 - 0.6, z, { mat: 'wood', col: false }); b.panel(W1 + 0.5, 0.46, 0xffffff, 0, y + H1 - 0.35, z + (z > 0 ? 0.205 : -0.205), { mat: 'caihua', uvScale: [W1 + 0.5, 1], ry: z > 0 ? 0 : Math.PI }); }
  for (const s of [-1, 1]) { b.slab(0.4, 0.5, D1 + 0.6, C.woodRed, s * W1 / 2, y + H1 - 0.6, 0, { mat: 'wood', col: false }); b.panel(D1 + 0.5, 0.46, 0xffffff, s * (W1 / 2 + 0.205), y + H1 - 0.35, 0, { mat: 'caihua', uvScale: [D1 + 0.5, 1], ry: s * Math.PI / 2 }); }
  b.slab(W1 * 0.18, 0.36, 0.44, C.gold, 0, y + H1 - 0.55, D1 / 2, { mat: 'gold', col: false });
  b.slab(W1 + 0.9, 0.16, D1 + 0.9, C.woodRed, 0, y + H1, 0, { mat: 'wood', col: false });
  const yd = y + H1 + 0.16;
  for (let i = 0; i <= 10; i++) for (const s of [-1, 1]) dougong(b, -W1 / 2 + (i * W1) / 10, yd, s * D1 / 2, 0.5, s > 0 ? 0 : Math.PI, true);
  for (let j = 1; j < 6; j++) for (const s of [-1, 1]) dougong(b, s * W1 / 2, yd, -D1 / 2 + (j * D1) / 6, 0.5, s * Math.PI / 2, true);
  // 腰檐（下檐一周，庑殿截顶）+ 角脊
  const Wr = W1 + 5.2, Dr = D1 + 5.2, Hr = Dr * 0.36, tM = 0.34, ye = yd + 0.36;
  b.add(hipRoofGeo(Wr, Dr, Hr, { tMax: tM, lift: 0.18 }), C.tileDark, 'glaze', { y: ye, col: false });
  b.add(hipRoofGeo(Wr, Dr, Hr, { tMax: tM, lift: 0.18 }), C.paintTeal, 'under', { y: ye - 0.12, col: false });
  eaves(b, 'hip', Wr, Dr, Hr, ye, { lift: 0.18 });
  for (const ln of hipCornerLines(Wr, Dr, Hr, ye, { tMax: tM, lift: 0.18, n: 6 })) {
    ridgeAlong(b, ln.pts, 0.28, C.ridge, 'glaze', 0.13);
    const [ex, ey, ez] = ln.pts[0];
    goldCurl(b, ex * 0.985, ey + 0.2, ez * 0.985, 1.0);
    hangLantern(b, ex * 0.94, ey - 0.25, ez * 0.94, 0.9, true);
  }
  b.collider(0, ye - 0.2, ye + Hr * Math.pow(tM, 1.7) + 0.3, 0, Wr / 2 * 0.95, Dr / 2 * 0.92);
  // 平座：腰檐之上，斗拱托出，木栏杆一周（正面正中出挑）
  const W2 = 13.2, D2 = 7.6, yp = ye + Hr * Math.pow(tM, 1.7) + 0.05, PW = W2 + 2.4, PD = D2 + 2.4;
  for (let i = 0; i <= 8; i++) for (const s of [-1, 1]) dougong(b, -PW / 2 + 0.4 + (i * (PW - 0.8)) / 8, yp - 0.42, s * (PD / 2 - 0.3), 0.32, s > 0 ? 0 : Math.PI, true);
  b.slab(PW, 0.24, PD, C.woodRed, 0, yp, 0, { mat: 'wood' });
  b.slab(PW + 0.1, 0.06, PD + 0.1, C.woodDark, 0, yp + 0.24, 0, { mat: 'wood', col: false });
  woodRail(b, [[-PW / 2 + 0.1, PD / 2 - 0.1], [PW / 2 - 0.1, PD / 2 - 0.1], [PW / 2 - 0.1, -PD / 2 + 0.1], [-PW / 2 + 0.1, -PD / 2 + 0.1]], yp + 0.3, { color: C.vermilion, closed: true, h: 0.9, spacing: 0.22 });
  // 上层：三开间，四面格栅门窗（正面三樘隔扇、两山与背面槛窗），彩画、斗拱
  const y2 = yp + 0.3, H2 = 3.9, bx = [-W2 / 2, -W2 / 6, W2 / 6, W2 / 2];
  for (const x of bx) for (const z of [D2 / 2, -D2 / 2]) b.cyl(0.2, 0.22, H2, C.vermilion, x, y2 + H2 / 2, z, { seg: 12, mat: 'wood', col: false });
  for (const z of [-D2 / 6, D2 / 6]) for (const x of [bx[0], bx[3]]) b.cyl(0.2, 0.22, H2, C.vermilion, x, y2 + H2 / 2, z, { seg: 12, mat: 'wood', col: false });
  for (let i = 0; i < 3; i++) {
    const cx = (bx[i] + bx[i + 1]) / 2, iw = W2 / 3 - 0.44;
    doorLeaves(b, cx, y2, D2 / 2, iw, H2 - 0.7, { frame: C.vermilion, leaves: 4 });
    b.panel(iw - 0.1, 0.5, C.paper, cx, y2 + H2 - 0.42, D2 / 2 + 0.03);
    sillWindow(b, cx, y2, -D2 / 2, iw, H2 - 0.7, { frame: C.vermilion, wall: C.red, wallMat: 'std', sill: 0.8 });
  }
  for (const s of [-1, 1]) {
    b.push(s * W2 / 2, 0, 0, s * Math.PI / 2);
    for (const q of [-1, 0, 1]) sillWindow(b, q * D2 / 3, y2, 0, D2 / 3 - 0.44, H2 - 0.7, { frame: C.vermilion, wall: C.red, wallMat: 'std', sill: 0.8 });
    b.pop();
  }
  b.slab(W2 - 0.3, H2 - 0.1, D2 - 0.3, C.red, 0, y2, 0, { mat: 'std' });
  for (const z of [D2 / 2, -D2 / 2]) { b.slab(W2 + 0.5, 0.42, 0.34, C.woodRed, 0, y2 + H2 - 0.5, z, { mat: 'wood', col: false }); b.panel(W2 + 0.4, 0.4, 0xffffff, 0, y2 + H2 - 0.29, z + (z > 0 ? 0.18 : -0.18), { mat: 'caihua', uvScale: [W2 + 0.4, 1], ry: z > 0 ? 0 : Math.PI }); }
  for (const s of [-1, 1]) b.slab(0.34, 0.42, D2 + 0.5, C.paintBlue, s * W2 / 2, y2 + H2 - 0.5, 0, { col: false });
  b.slab(W2 + 0.8, 0.14, D2 + 0.8, C.woodRed, 0, y2 + H2, 0, { mat: 'wood', col: false });
  for (let i = 0; i <= 8; i++) for (const s of [-1, 1]) dougong(b, -W2 / 2 + (i * W2) / 8, y2 + H2 + 0.14, s * D2 / 2, 0.42, s > 0 ? 0 : Math.PI, true);
  for (let j = 1; j < 4; j++) for (const s of [-1, 1]) dougong(b, s * W2 / 2, y2 + H2 + 0.14, -D2 / 2 + (j * D2) / 4, 0.42, s * Math.PI / 2, true);
  // 顶：歇山（鎏金鸱吻、宝珠、卷草）
  const yR = y2 + H2 + 0.14 + 0.3, RW = W2 + 4.6, RD = D2 + 4.6, RH = RD * 0.46;
  roofAssembly(b, 'xieshan', RW, RD, RH, yR, C.tileDark, 'glaze', { gold: true, goldK: 1.1, fish: true });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) hangLantern(b, sx * (RW / 2 - 0.6), yR + 0.1, sz * (RD / 2 - 0.6), 0.9, true);
  b.collider(0, y2, yR + RH * 0.7, 0, RW / 2 * 0.9, RD / 2 * 0.9);
  // 匾额：上层正面「凌云阁」，下层前廊「聚灵」
  const p1 = plaqueMesh(o.plaque || '凌云阁', 3.4, 1.15, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
  p1.position.set(0, y2 + H2 - 1.0, D2 / 2 + 0.34); b.addMesh(p1);
  const p2 = plaqueMesh('聚灵', 2.4, 0.9, { bg: '#1f3a44', fg: '#e6c77e', frame: '#7d5a2c' });
  p2.position.set(0, y + H1 - 1.28, D1 / 2 + 0.32); b.addMesh(p2);
  return { top: yR + RH, floor: base, porchZ: D1 / 2, front: BD / 2 + nS * run, lanterns: [[-xs[1] - 0.6, y + H1 - 0.7, D1 / 2 + 0.2], [xs[1] + 0.6 - 0, y + H1 - 0.7, D1 / 2 + 0.2]] };
}

// ---------- 钟亭 / 鼓亭：矮石台（正面踏步、三面栏杆）+ 方亭重檐 + 青铜钟 / 大鼓（本地原点为石台中心地面，踏步朝 +Z）----------
const BELL_PROFILE = [[0.0, 0.02], [0.86, 0.02], [0.96, 0.0], [1.0, 0.02], [0.94, 0.12], [0.82, 0.4], [0.74, 0.8], [0.7, 1.3], [0.68, 1.7], [0.6, 1.92], [0.42, 2.02], [0.0, 2.05]];
const bellR = (h) => { for (let i = 4; i < BELL_PROFILE.length - 1; i++) { const [r0, y0] = BELL_PROFILE[i], [r1, y1] = BELL_PROFILE[i + 1]; if (h >= y0 && h <= y1) return r0 + (r1 - r0) * (h - y0) / (y1 - y0); } return 0.7; };
let bellGeo = null;
export function bellDrumPavilion(b, kind = 'bell', { platformOnly = false } = {}) {
  const H = 2.2, S = 8.6;
  // 石台：须弥式线脚、台沿栏杆（正面留口）、正面踏步
  b.slab(S, H - 0.2, S, C.marbleShade, 0, 0, 0, { mat: 'stone' });
  b.slab(S + 0.3, 0.2, S + 0.3, C.marble, 0, H - 0.2, 0, { mat: 'stoneSmooth' });
  b.slab(S + 0.2, 0.16, S + 0.2, C.marbleWarm, 0, 0, 0, { mat: 'stoneSmooth', col: false });
  b.slab(S + 0.06, 0.12, S + 0.06, C.marbleWarm, 0, H * 0.55, 0, { mat: 'stoneSmooth', col: false });
  const n = Math.round(H / 0.18), run = 0.32;
  stairs(b, 0, 0, S / 2 + n * run, 3.2, H, { run, stepH: H / n, color: C.marble, cheekW: 0.38 });
  const R = S / 2 - 0.22, g = 2.1;
  rail(b, [[-g, R], [-R, R], [-R, -R], [R, -R], [R, R], [g, R]], H, { h: 0.85, color: C.marble, spacing: 1.6 });
  // 第十轮：石台上改立素材模型的钟楼 / 鼓楼（buildings10.js），石台只留台身、栏杆、踏步
  if (platformOnly) { b.collider(0, 0, H, 0, S / 2, S / 2, 0, { walk: true }); return { top: H }; }
  // 方亭（重檐攒尖，鎏金宝顶）
  b.push(0, H, 0, 0);
  pavilion(b, { n: 4, r: 2.9, h: 4.0, base: 0.24, benches: false, eaves: 2, glaze: true, roofColor: C.tileDark, pillar: C.vermilion, beam: C.paintBlue });
  if (kind === 'bell') {
    // 钟架横梁 + 青铜钟（蒲牢钮、乳钉、带纹、撞钟木）
    b.slab(4.0, 0.3, 0.34, C.woodRed, 0, 3.6, 0, { mat: 'wood', col: false });
    if (!bellGeo) bellGeo = new THREE.LatheGeometry(BELL_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 28);
    b.add(bellGeo, 0x5b6550, 'bronze', { x: 0, y: 1.0, z: 0, s: 1.05, col: false });
    for (const h of [0.3, 0.62, 1.15, 1.62]) b.add(new THREE.TorusGeometry(bellR(h) * 1.05 + 0.012, 0.035, 5, 28), 0x6c745c, 'bronze', { x: 0, y: 1.0 + h * 1.05, z: 0, rx: Math.PI / 2, col: false });
    b.add(new THREE.TorusGeometry(0.18, 0.06, 6, 12), 0x5b6550, 'bronze', { x: 0, y: 3.32, z: 0, col: false });
    for (let k = 0; k < 4; k++) for (let r = 0; r < 3; r++) for (let c2 = -1; c2 <= 1; c2++) { const a = (k / 4) * TAU + 0.4 + c2 * 0.16, h = 1.5 - r * 0.15, rr = bellR(h) * 1.05 + 0.01; b.sphere(0.045, 0x7a8466, Math.cos(a) * rr, 1.0 + h * 1.05, Math.sin(a) * rr, { mat: 'bronze', seg: 6, seg2: 4 }); }
    b.cyl(0.11, 0.11, 2.2, C.wood, 0, 1.75, 1.3, { rz: Math.PI / 2, seg: 8, mat: 'wood', col: false });
    for (const s of [-1, 1]) b.cyl(0.015, 0.015, 1.9, C.black, s * 0.9, 2.75, 1.3, { seg: 4, col: false });
    b.cylCollider(0, 1.0, 3.2, 0, 1.1);
  } else {
    // 鼓架 + 大鼓（朱漆鼓身、鎏金鼓钉两圈、鼓皮）
    for (const s of [-1, 1]) {
      b.slab(0.2, 1.7, 0.2, C.woodRed, s * 1.05, 0, -0.55, { mat: 'wood', col: false });
      b.slab(0.2, 1.7, 0.2, C.woodRed, s * 1.05, 0, 0.55, { mat: 'wood', col: false });
      b.slab(0.2, 0.16, 1.3, C.woodRed, s * 1.05, 1.0, 0, { mat: 'wood', col: false });
    }
    b.cyl(1.0, 1.0, 1.05, 0xa63d2c, 0, 1.75, 0, { rx: Math.PI / 2, seg: 28, mat: 'wood', col: false });
    for (const s of [-1, 1]) {
      b.cyl(0.92, 0.92, 0.02, 0xd8c8a2, 0, 1.75, s * 0.53, { rx: Math.PI / 2, seg: 28, col: false });
      b.cyl(0.18, 0.18, 0.025, C.gold, 0, 1.75, s * 0.545, { rx: Math.PI / 2, seg: 16, mat: 'gold', col: false });
      for (let k = 0; k < 18; k++) { const a = (k / 18) * TAU; b.sphere(0.045, C.gold, Math.cos(a) * 0.98, 1.75 + Math.sin(a) * 0.98, s * 0.47, { mat: 'gold', seg: 5, seg2: 4 }); }
    }
    b.add(new THREE.TorusGeometry(1.01, 0.04, 5, 28), C.gold, 'gold', { x: 0, y: 1.75, z: 0, col: false });
    for (const s of [-1, 1]) b.cyl(0.04, 0.05, 0.9, C.woodDark, 1.35, 1.0, s * 0.2, { rz: 0.5, seg: 6, mat: 'wood', col: false });
    b.collider(0, 0, 2.8, 0, 1.2, 0.9);
  }
  b.pop();
  b.collider(0, 0, H, 0, S / 2, S / 2, 0, { walk: true });
  return { top: H };
}

// ---------- 凌云阁台壁的青玉浮雕板（云龙团纹）----------
let RELIEF = null;
export function reliefTexture() {
  if (RELIEF) return RELIEF;
  const W = 1024, Hh = 480, cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
  const g = cv.getContext('2d');
  g.fillStyle = '#ddd6c7'; g.fillRect(0, 0, W, Hh);
  for (let i = 0; i < 2600; i++) { const v = 200 + Math.random() * 40; g.fillStyle = `rgba(${v},${v - 4},${v - 14},${Math.random() * 0.08})`; g.fillRect(Math.random() * W, Math.random() * Hh, 3, 3); }
  g.strokeStyle = '#a69e8c'; g.lineWidth = 10; g.strokeRect(14, 14, W - 28, Hh - 28);
  g.lineWidth = 3; g.strokeRect(34, 34, W - 68, Hh - 68);
  const jade = '#5fa592', jadeD = '#3f7a6a', jadeL = '#9fd2c0';
  // 卷云（左右）
  const cloud = (cx, cy, s, flip) => {
    g.save(); g.translate(cx, cy); g.scale(flip ? -s : s, s);
    g.lineCap = 'round';
    for (const [col, lw, dx] of [[jadeD, 16, 3], [jade, 11, 0], [jadeL, 3, -2]]) {
      g.strokeStyle = col; g.lineWidth = lw;
      g.beginPath(); g.arc(dx, dx, 46, Math.PI * 0.2, Math.PI * 1.9); g.stroke();
      g.beginPath(); g.arc(dx + 30, dx + 4, 22, Math.PI * 1.1, Math.PI * 2.7); g.stroke();
      g.beginPath(); g.moveTo(dx - 40, dx + 30); g.bezierCurveTo(dx - 120, dx + 60, dx - 170, dx + 10, dx - 220, dx + 30); g.stroke();
    }
    g.restore();
  };
  cloud(220, 200, 1.1, false); cloud(250, 330, 0.75, true); cloud(W - 220, 200, 1.1, true); cloud(W - 250, 330, 0.75, false);
  // 正中团龙（简化：圆环内一条盘曲的龙身与龙首、火珠）
  const cx = W / 2, cy = Hh / 2;
  g.fillStyle = 'rgba(95,165,146,.18)'; g.beginPath(); g.arc(cx, cy, 160, 0, TAU); g.fill();
  for (const [col, lw] of [[jadeD, 18], [jade, 12], [jadeL, 3]]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.arc(cx, cy, 160, 0, TAU); g.stroke(); }
  for (const [col, lw, o] of [[jadeD, 30, 3], [jade, 22, 0], [jadeL, 4, -4]]) {
    g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - 90 + o, cy + 70 + o);
    g.bezierCurveTo(cx - 150, cy - 20, cx - 40, cy - 120, cx + 30, cy - 70);
    g.bezierCurveTo(cx + 110, cy - 20, cx + 40, cy + 90, cx - 20, cy + 40);
    g.bezierCurveTo(cx - 60, cy + 10, cx - 10, cy - 30, cx + 40, cy - 10);
    g.stroke();
  }
  g.fillStyle = jade; g.beginPath(); g.ellipse(cx + 60, cy - 18, 34, 24, -0.3, 0, TAU); g.fill();       // 龙首
  g.fillStyle = jadeL; g.beginPath(); g.arc(cx + 70, cy - 26, 6, 0, TAU); g.fill();
  g.strokeStyle = jadeD; g.lineWidth = 6; g.beginPath(); g.moveTo(cx + 80, cy - 40); g.lineTo(cx + 116, cy - 74); g.moveTo(cx + 66, cy - 44); g.lineTo(cx + 84, cy - 86); g.stroke();
  g.fillStyle = '#d8b25a'; g.beginPath(); g.arc(cx + 120, cy + 70, 18, 0, TAU); g.fill();        // 火珠
  g.strokeStyle = '#d8b25a'; g.lineWidth = 4; for (let k = 0; k < 5; k++) { const a = -1.2 + k * 0.6; g.beginPath(); g.moveTo(cx + 120 + Math.cos(a) * 22, cy + 70 + Math.sin(a) * 22); g.lineTo(cx + 120 + Math.cos(a) * 34, cy + 70 + Math.sin(a) * 34); g.stroke(); }
  // 刻纹阴影（凸起的一侧亮、另一侧暗）
  RELIEF = new THREE.CanvasTexture(cv); RELIEF.colorSpace = THREE.SRGBColorSpace; RELIEF.anisotropy = 8;
  return RELIEF;
}
