// 谷中薄雾：远处山谷里缓慢飘移的大片柔边雾带（公告板，数量少、透明度低）。
// 远山本身由地形远景环带（真实高程）与雾完成，不再用画片式山脊。雾色取当前地平线雾色（显示色），随时辰变化。
import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';
import { GLOBAL, NOISE_GLSL, FOGU } from './shaderlib.js';

export function buildDistant(scene) {
  const rand = mulberry32(99);
  const n = 10;
  const geo = new THREE.PlaneGeometry(1, 1);
  const mistMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { uTime: GLOBAL.uTime, uA: FOGU.uFogAway, uN: FOGU.uFogNear },
    vertexShader: `attribute vec4 aInfo; varying vec2 vUv; varying float vA; varying float vS; uniform float uTime;
      void main(){
        vUv = uv; vS = aInfo.w;
        vec3 c = aInfo.xyz; c.x += sin(uTime * .02 + aInfo.w * 6.) * 40.;
        float sz = 300. + aInfo.w * 520.;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec4 mv = viewMatrix * vec4(c + right * position.x * sz + vec3(0., 1., 0.) * position.y * sz * .22, 1.);
        vA = smoothstep(420., 900., -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `${NOISE_GLSL}
      uniform float uTime; uniform vec3 uA, uN; varying vec2 vUv; varying float vA; varying float vS;
      void main(){
        vec2 q = vUv - .5;
        float n = nzf(vUv * vec2(3., 1.5) + vec2(uTime * .01 + vS * 9., vS * 4.));
        float a = smoothstep(.5, .05, length(q * vec2(1., 1.8)) + (n - .5) * .35) * vA * .2;
        if (a < .01) discard;
        gl_FragColor = vec4(mix(uA, uN, .35) * 1.04, a);
      }`,
  });
  const info = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    // 山谷：南面谷口、东西两侧谷地、云顶背后的北谷
    const a = rand() * Math.PI * 2, r = 700 + rand() * 1300;
    info.set([Math.cos(a) * r, -14 + rand() * 18, Math.sin(a) * r - 40, rand()], i * 4);
  }
  const ig = new THREE.InstancedBufferGeometry().copy(geo);
  ig.instanceCount = n;
  ig.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
  const mist = new THREE.Mesh(ig, mistMat);
  mist.frustumCulled = false;
  mist.renderOrder = 2;
  scene.add(mist);
  return { mist };
}
