// 云带：云顶背后山谷、远处群山山腰、山门外谷口的云海、两侧近山外的谷地（实例化公告板）。
// 镜头靠近时淡出，不遮挡游玩视野；云色取天空云层的受光 / 背光色（显示色，随时辰变化），远处融入地平线雾色。
import * as THREE from 'three';
import { GLOBAL, NOISE_GLSL, FOGU } from './shaderlib.js';
import { mulberry32 } from '../core/math.js';

// [x, y, z, 尺寸, 团数, 扁平度]
const BANKS = [
  // 云顶背后的山谷（主殿与远峰之间）
  [-120, 40, -380, 240, 4, 0.32], [130, 46, -420, 260, 4, 0.3], [0, 58, -560, 320, 3, 0.28],
  // 主峰群的山腰云带（云腰）与谷口薄雾
  [-200, 125, -640, 420, 4, 0.2], [380, 100, -720, 380, 3, 0.2], [80, 175, -910, 460, 3, 0.18], [-560, 140, -470, 380, 3, 0.2], [690, 130, -560, 380, 3, 0.2],
  // 远处群山的山腰云带
  [-1300, 150, -900, 520, 4, 0.22], [900, 170, -1500, 560, 4, 0.22], [-500, 190, -2100, 640, 3, 0.2], [1800, 140, -300, 520, 3, 0.22], [-1900, 130, 200, 520, 3, 0.22],
  // 山门外谷口的低云海
  [-180, 2, 420, 320, 4, 0.24], [200, 0, 520, 360, 4, 0.22], [0, -4, 780, 480, 3, 0.2],
  // 两侧近山外的谷地
  [-420, 26, -120, 260, 3, 0.26], [470, 24, -40, 280, 3, 0.26], [-380, 18, 220, 240, 2, 0.26], [420, 16, 260, 260, 2, 0.26],
];

// banks：自定云团（默认为上面的云带；浮空仙岛另传岛下与瀑布下的云团）
// fade：镜头近处淡出的距离范围（远处云带 60–220 米；谷中云气 10–40 米，站在崖边也看得到谷里的云）
export function buildClouds(scene, { density = 1, lit = null, shade = null, banks = BANKS, rseed = 321, fade = [60, 220], name = 'clouds' } = {}) {
  const rand = mulberry32(rseed), list = [];
  for (const [x, y, z, s, n, fl] of banks) {
    const m = Math.max(1, Math.round(n * density));
    for (let i = 0; i < m; i++) {
      const a = rand() * Math.PI * 2, r = s * 0.4 * Math.sqrt(rand());
      list.push([x + Math.cos(a) * r, y + (rand() - 0.5) * s * 0.06, z + Math.sin(a) * r * 0.6, s * (0.6 + rand() * 0.5), rand(), fl]);
    }
  }
  const n = list.length, info = new Float32Array(n * 4), seed = new Float32Array(n * 2);
  list.forEach(([x, y, z, s, k, fl], i) => { info.set([x, y, z, s], i * 4); seed.set([k, fl], i * 2); });
  const g = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
  g.instanceCount = n;
  g.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 2));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { uTime: GLOBAL.uTime, uLit: lit || { value: new THREE.Vector3(1, 0.97, 0.92) }, uShade: shade || { value: new THREE.Vector3(0.79, 0.82, 0.85) }, uHz: FOGU.uFogAway, uFade: { value: new THREE.Vector2(...fade) } },
    vertexShader: `attribute vec4 aInfo; attribute vec2 aSeed; uniform float uTime; uniform vec2 uFade; varying vec2 vUv; varying float vA; varying float vS; varying float vFar;
      void main(){
        vUv = uv; vS = aSeed.x;
        vec3 c = aInfo.xyz; c.x += sin(uTime * .012 + aSeed.x * 9.) * 12.;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec4 mv = viewMatrix * vec4(c + right * position.x * aInfo.w * 1.7 + vec3(0., 1., 0.) * position.y * aInfo.w * aSeed.y, 1.);
        vA = smoothstep(uFade.x, uFade.y, -mv.z);
        vFar = smoothstep(600., 3200., -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `${NOISE_GLSL}
      uniform float uTime; uniform vec3 uLit, uShade, uHz; varying vec2 vUv; varying float vA; varying float vS; varying float vFar;
      void main(){
        vec2 q = vUv - .5;
        float n = nzf(vUv * vec2(3.6, 1.6) + vec2(uTime * .005 + vS * 11., vS * 5.));
        float n2 = nzf(vUv * vec2(9., 4.) + vS * 3.);
        float body = smoothstep(.5, .06, length(q * vec2(1., 1.9)) + (n - .5) * .62 + (n2 - .5) * .16);
        float a = body * vA * .5;
        if (a < .008) discard;
        vec3 col = mix(uShade, uLit, smoothstep(.2, .85, vUv.y + (n - .5) * .5));
        col = mix(col, uHz, vFar * .55);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.name = name;
  scene.add(mesh);
  return mesh;
}

// 云海：谷中平铺的几层云（俯看是一团团翻涌的云头，斜看是一片白茫），宗门所在山台浮在其上。
// sheets：[中心 x, 高度 y, 中心 z, 半径 rx, 半径 rz]；同一组云海合成一个网格（每片一个圆盘），着色器里以世界坐标的分形噪声
// 决定云头的浓淡，边缘与镜头近处淡出（镜头穿入云层时不糊屏）；颜色取天空的云受光 / 背光色（显示色，随时辰变化）
export function buildCloudSea(scene, { sheets, lit = null, shade = null, name = 'cloud-sea', opacity = 0.9 } = {}) {
  const pos = [], loc = [], idx = [];
  const SEG = 40;
  for (const [x, y, z, rx, rz] of sheets) {
    const base = pos.length / 3;
    pos.push(x, y, z); loc.push(0, 0);
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      pos.push(x + Math.cos(a) * rx, y, z + Math.sin(a) * rz); loc.push(Math.cos(a), Math.sin(a));
    }
    for (let i = 1; i <= SEG; i++) idx.push(base, base + i + 1, base + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aLoc', new THREE.Float32BufferAttribute(loc, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide,
    uniforms: { uTime: GLOBAL.uTime, uLit: lit || { value: new THREE.Vector3(1, 0.97, 0.92) }, uShade: shade || { value: new THREE.Vector3(0.79, 0.82, 0.85) }, uHz: FOGU.uFogAway, uOp: { value: opacity } },
    vertexShader: `attribute vec2 aLoc; varying vec2 vLoc; varying vec3 vW; varying float vD;
      void main(){ vLoc = aLoc; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `${NOISE_GLSL}
      uniform float uTime, uOp; uniform vec3 uLit, uShade, uHz; varying vec2 vLoc; varying vec3 vW; varying float vD;
      void main(){
        // 云头：大团（低频）上叠小团（高频），按局部高低假定受光——团顶亮、团间沟暗
        vec2 p = vW.xz * .016 + vec2(uTime * .005, uTime * .0025);
        float big = nzf(p), small = nzf(p * 3.1 + 11. - vec2(uTime * .004, 0.));
        float n = big * .62 + small * .38;
        vec2 e = vec2(.03, 0.);
        float gx = (nzf(p + e.xy) * .62 + nzf((p + e.xy) * 3.1 + 11. - vec2(uTime * .004, 0.)) * .38) - n;
        float gz = (nzf(p + e.yx) * .62 + nzf((p + e.yx) * 3.1 + 11. - vec2(uTime * .004, 0.)) * .38) - n;
        float lit = clamp(.62 - (gx * .8 + gz * .5) * 22., 0., 1.);
        float rim = 1. - smoothstep(.5, 1., length(vLoc));
        float dens = smoothstep(.36, .6, n + (rim - .62) * .4) * rim;
        float a = dens * uOp * smoothstep(6., 26., vD) * (.78 + .22 * smoothstep(.4, .7, n));
        if (a < .01) discard;
        vec3 col = mix(uShade * .9, uLit, clamp(lit * .7 + smoothstep(.4, .8, n) * .45, 0., 1.));
        col = mix(col, uHz, smoothstep(500., 2400., vD) * .55);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = name;
  mesh.renderOrder = 5;
  scene.add(mesh);
  return mesh;
}
