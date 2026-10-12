// 水：山溪（沿中线的水面带，随坡度流速变化，跌水处起白沫）、听雨池（荷叶、芦苇）
import * as THREE from 'three';
import { POND, SITES } from './layout.js';
import { mulberry32 } from '../core/math.js';
import { injectFog } from './shaderlib.js';

function waterMaterial(env) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x3f6264, roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.9, envMap: env, envMapIntensity: 0.85, side: THREE.DoubleSide });
  const uniforms = { uTime: { value: 0 } };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    injectFog(sh);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFlow; varying vec4 vFlow; varying vec3 vWW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFlow = aFlow; vWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; varying vec4 vFlow; varying vec3 vWW;
        float wh(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float wn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
          return mix(mix(wh(i), wh(i + vec2(1, 0)), u.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), u.x), u.y); }
        float waves(vec2 p){
          vec2 f = vFlow.xy * uTime * (0.6 + vFlow.w * 2.5);
          return wn(p * 1.3 - f * 1.3) * .5 + wn(p * 3.1 - f * 2.6 + 3.1) * .3 + wn(p * 7.3 - f * 5. + 7.7) * .2;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 wp = mod(vWW.xz, 1024.);
        float edge = vFlow.z, sp = vFlow.w;
        float n = wn(wp * 2.2 + vFlow.xy * uTime * (1. + sp * 4.));
        float foam = clamp(smoothstep(.55, 1., edge) * .55 + smoothstep(.25, .9, sp) * .9, 0., 1.) * smoothstep(.35, .75, n);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.62, .70, .68), smoothstep(.3, 1., edge) * .35);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.92, .94, .92), foam * .8);
        diffuseColor.a *= mix(.88, .45, smoothstep(.6, 1., edge)) + foam * .3;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(.06, .5, clamp(sp * 1.5 + edge * .3, 0., 1.));')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float e = .08, h0 = waves(wp);
        vec2 g = vec2(waves(wp + vec2(e, 0.)) - h0, waves(wp + vec2(0., e)) - h0) / e;
        vec3 wN = normalize(vec3(-g.x * (.06 + sp * .2), 1., -g.y * (.06 + sp * .2)));
        normal = normalize((viewMatrix * vec4(wN, 0.)).xyz);`);
  };
  mat.customProgramCacheKey = () => 'water';
  return mat;
}

export class Water {
  constructor(scene, terrain, env) {
    this.mat = waterMaterial(env);
    this.group = new THREE.Group();
    this.group.name = 'water';
    scene.add(this.group);
    this.buildStream(terrain);
    if (POND) this.buildPond(terrain);
  }

  buildStream(T) {
    const S = T.stream, line = S.line, pts = line.pts, n = pts.length;
    const across = 4, V = across + 1;
    const pos = [], flow = [], idx = [];
    let rows = 0;
    for (let i = 0; i < n; i++) {
      const [x, z] = pts[i];
      if (z > 178 || z < -266) continue;
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1];
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const s = line.cum[i], y = S.wy[i], half = T.streamHalf(s) + 0.45;
      const yb = S.wy[Math.min(n - 1, i + 1)], ya = S.wy[Math.max(0, i - 1)];
      const slope = Math.abs(ya - yb) / ((line.cum[Math.min(n - 1, i + 1)] - line.cum[Math.max(0, i - 1)]) || 1);
      const fade = Math.min(1, (178 - z) / 14);
      for (let k = 0; k < V; k++) {
        const u = (k / across) * 2 - 1;
        pos.push(x - tz * half * u, y + (1 - u * u) * 0.02, z + tx * half * u);
        flow.push(tx, tz, Math.abs(u) * (fade < 1 ? 1 : 1), Math.min(1, slope * 2.2));
      }
      if (rows > 0) {
        const r0 = (rows - 1) * V, r1 = rows * V;
        for (let k = 0; k < across; k++) idx.push(r0 + k, r1 + k, r0 + k + 1, r0 + k + 1, r1 + k, r1 + k + 1);
      }
      rows++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 4));
    const nrm = new Float32Array(pos.length);
    for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, this.mat);
    m.receiveShadow = true;
    m.renderOrder = 1;
    this.group.add(m);
    // 跌水：竖直水帘
    const f = SITES.fall, fs = line.nearest(f.x, f.z);
    const top = T.streamY(fs.s - 2.6), bot = T.streamY(fs.s + 2.2);
    const at = line.at(fs.s);
    const curtain = new THREE.PlaneGeometry(2.6, top - bot + 0.3, 1, 6);
    const cf = new Float32Array(curtain.attributes.position.count * 4);
    for (let i = 0; i < cf.length; i += 4) { cf[i] = 0; cf[i + 1] = -1; cf[i + 2] = 0.3; cf[i + 3] = 1; }
    curtain.setAttribute('aFlow', new THREE.BufferAttribute(cf, 4));
    const cm = new THREE.Mesh(curtain, this.mat);
    cm.position.set(at.x, (top + bot) / 2, at.z);
    cm.rotation.y = Math.atan2(at.tx, at.tz);
    cm.rotation.x = -0.35;
    this.group.add(cm);
  }

  buildPond(T) {
    const P = POND, seg = 48;
    const pos = [P.x, P.y, P.z], flow = [0.3, 0.2, 0, 0];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, R = P.r * (1 + 0.1 * Math.sin(3 * a + 1) + 0.06 * Math.sin(5 * a - 2)) + 0.6;
      pos.push(P.x + Math.cos(a) * R, P.y, P.z + Math.sin(a) * R);
      flow.push(0.3, 0.2, 1, 0);
    }
    const idx = [];
    for (let i = 1; i <= seg; i++) idx.push(0, i + 1, i);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 4));
    const nrm = new Float32Array(pos.length);
    for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, this.mat);
    m.receiveShadow = true;
    m.renderOrder = 1;
    this.group.add(m);
    // 荷叶与荷花
    const rand = mulberry32(31);
    const leafG = new THREE.CircleGeometry(0.55, 14, 0.3, Math.PI * 2 - 0.3);
    leafG.rotateX(-Math.PI / 2);
    const leafM = new THREE.MeshStandardMaterial({ color: 0x5a7a4c, roughness: 0.6, side: THREE.DoubleSide });
    const leaves = new THREE.InstancedMesh(leafG, leafM, 34);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    let k = 0;
    for (let i = 0; i < 60 && k < 34; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * P.r * 0.85;
      const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
      if (x < P.x - 4 && z > P.z - 2) continue;              // 西侧留出一片水面
      const s = 0.6 + rand() * 0.9;
      leaves.setMatrixAt(k, m4.compose(new THREE.Vector3(x, P.y + 0.03, z), q.setFromAxisAngle(up, rand() * 6.28), new THREE.Vector3(s, s, s)));
      leaves.setColorAt(k, c.setHSL(0.24 + rand() * 0.04, 0.22 + rand() * 0.1, 0.32 + rand() * 0.1));
      k++;
    }
    leaves.count = k;
    leaves.receiveShadow = true;
    this.group.add(leaves);
    const flowerG = new THREE.ConeGeometry(0.16, 0.26, 7, 1, true);
    flowerG.rotateX(Math.PI);
    flowerG.translate(0, 0.25, 0);
    const flowers = new THREE.InstancedMesh(flowerG, new THREE.MeshStandardMaterial({ color: 0xe8cfd2, roughness: 0.7, side: THREE.DoubleSide }), 6);
    for (let i = 0; i < 6; i++) {
      const a = rand() * 6.28, r = 1.5 + rand() * (P.r - 2.5);
      flowers.setMatrixAt(i, m4.compose(new THREE.Vector3(P.x + Math.cos(a) * r, P.y, P.z + Math.sin(a) * r), q.identity(), new THREE.Vector3(1, 1, 1)));
    }
    this.group.add(flowers);
    // 芦苇
    const reedG = new THREE.CylinderGeometry(0.01, 0.018, 1.4, 3);
    reedG.translate(0, 0.7, 0);
    const reeds = new THREE.InstancedMesh(reedG, new THREE.MeshStandardMaterial({ color: 0x8a8a5a, roughness: 0.9 }), 90);
    for (let i = 0; i < 90; i++) {
      const a = 2.2 + rand() * 1.6, R = P.r * (1 + 0.1 * Math.sin(3 * a + 1) + 0.06 * Math.sin(5 * a - 2)) - 0.3 + rand() * 0.9;
      const x = P.x + Math.cos(a) * R, z = P.z + Math.sin(a) * R;
      reeds.setMatrixAt(i, m4.compose(new THREE.Vector3(x, T.heightAt(x, z) - 0.1, z), q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3)), new THREE.Vector3(1, 0.7 + rand() * 0.6, 1)));
    }
    reeds.castShadow = true;
    this.group.add(reeds);
  }

  update(t) { this.mat.userData.uniforms.uTime.value = t; }
  setEnv(env) { this.mat.envMap = env; }
}
