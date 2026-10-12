// 着色器公共片段：GLSL 噪声、雾（距离雾 + 低处山岚）、建筑淡化（有序抖动）、角色前方遮挡镂空
import * as THREE from 'three';

export const NOISE_GLSL = /* glsl */ `
  float nzh(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float nzv(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
    return mix(mix(nzh(i), nzh(i + vec2(1., 0.)), u.x), mix(nzh(i + vec2(0., 1.)), nzh(i + vec2(1., 1.)), u.x), u.y); }
  float nzf(vec2 p){ return nzv(p) * .5 + nzv(p * 2.03 + 17.1) * .25 + nzv(p * 4.07 - 9.3) * .125 + nzv(p * 8.1 + 3.7) * .0625; }
`;

const BAYER = /* glsl */ `
  float bayer2(vec2 a){ a = floor(a); return fract(a.x / 2. + a.y * a.y * .75); }
  float bayer4(vec2 a){ return bayer2(.5 * a) * .25 + bayer2(a); }
`;

// 全局 uniform：时间、角色屏幕位置（镂空用）
export const GLOBAL = {
  uTime: { value: 0 },
  uCut: { value: new THREE.Vector4(-9999, -9999, 0, 1) },   // 像素 x, y, 角色视深, 半径（像素）
  uCutFoot: { value: -1e9 },                                 // 只镂空高于脚下此高度的部分
};

// 雾（大气透视）：按视距增长、高处变薄；低处另有谷中云雾（随视距渐浓）。
// 雾色在色调映射之后按显示色混合：近处为暖白薄霭，远处为地平线天色，且朝太阳一侧更亮更暖——与天空照片的地平线衔接。
// 额外 uniform 由 injectFog 注入（所有材质都会经过 Material.prototype.onBeforeCompile 或各自的钩子）。
// scene.fog 仍用 FogExp2，fogDensity 作为整体雾强倍数（1 为正常）。
export const FOGU = {
  uFogSun: { value: new THREE.Vector3(0.78, 0.78, 0.76) },    // 朝太阳一侧的地平线色（显示色）
  uFogAway: { value: new THREE.Vector3(0.62, 0.66, 0.7) },    // 背向太阳一侧
  uFogNear: { value: new THREE.Vector3(0.8, 0.8, 0.78) },     // 近处薄霭
  uFogSunXZ: { value: new THREE.Vector2(0, 1) },              // 太阳水平方向
  uFogP: { value: new THREE.Vector4(1 / 1050, 4, 0, 420) },   // x 大气消光（1/米），y 谷雾顶高，z 参考高度，w 雾随高度变薄的尺度
  uNight: { value: 0 },                                        // 夜色系数（灯火、窗光）
  uFogQ: { value: new THREE.Vector4(90, 140, 520, 0) },       // x 大气雾起始距离，y 谷雾起始距离，z 谷雾增长尺度（地下场景改为近处起雾）
};
export function injectFog(sh) { Object.assign(sh.uniforms, FOGU); }
THREE.Material.prototype.onBeforeCompile = function (sh) { injectFog(sh); };

THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
 varying float vFogDepth; varying vec3 vFogWorld; varying vec3 vFogDir;
#endif`;
THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  { mat3 fogR = transpose(mat3(viewMatrix));
    vFogDir = fogR * mvPosition.xyz;
    vFogWorld = fogR * (mvPosition.xyz - viewMatrix[3].xyz); }
#endif`;
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor; varying float vFogDepth; varying vec3 vFogWorld; varying vec3 vFogDir;
  uniform vec3 uFogSun, uFogAway, uFogNear; uniform vec2 uFogSunXZ; uniform vec4 uFogP, uFogQ;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear; uniform float fogFar;
  #endif
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  {
    float fd = length(vFogDir);
    vec3 fdir = vFogDir / max(fd, 1e-3);
    float aer = 1.0 - exp(-max(fd - uFogQ.x, 0.0) * uFogP.x);
    aer *= mix(0.86, 1.0, exp(-max(vFogWorld.y - uFogP.z, 0.0) / uFogP.w));
    float mistH = clamp((uFogP.y - vFogWorld.y) / 36.0, 0.0, 1.0);
    float mist = (1.0 - exp(-max(fd - uFogQ.y, 0.0) / uFogQ.z)) * mistH * mistH;
    float fogFactor = clamp(aer + mist * (1.0 - aer), 0.0, 1.0);
    #ifdef FOG_EXP2
      fogFactor = clamp(fogFactor * fogDensity, 0.0, 1.0);
    #endif
    vec2 fxz = fdir.xz / max(length(fdir.xz), 1e-4);
    float sunSide = max(dot(fxz, uFogSunXZ), 0.0); sunSide *= sunSide;
    vec3 hz = mix(uFogAway, uFogSun, sunSide);
    vec3 fcol = mix(uFogNear, hz, smoothstep(120.0, 1600.0, fd));
    fcol = mix(fcol, fcol * vec3(0.86, 0.94, 1.09), smoothstep(450.0, 2600.0, fd) * (1.0 - sunSide * 0.5));   // 中远山偏蓝灰
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fcol, fogFactor);
  }
#endif`;

// 给 onBeforeCompile 的 shader 注入：
//   fade：每材质一个 uniform（{ value }），<1 时按有序抖动丢弃像素（整栋建筑淡化，阴影保留）
//   cut：角色前方、高于脚下的像素在屏幕圆内抖动镂空（树冠、墙体遮挡时可见角色）；贴近镜头的枝叶也淡出
//   fadeArr：合批后的建筑——每个顶点带建筑序号 aBid，淡化值在 uFadeV（vec4 数组，每元素 4 栋）中查表
export function applyFade(sh, { fade = null, cut = false, fadeArr = null } = {}) {
  injectFog(sh);
  if (!fade && !cut && !fadeArr) return;
  if (fadeArr) {
    sh.uniforms.uFadeV = fadeArr;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aBid; varying float vBid;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBid = aBid;');
  }
  if (cut) {
    sh.uniforms.uCut = GLOBAL.uCut;
    sh.uniforms.uCutFoot = GLOBAL.uCutFoot;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vCutY; varying float vCutD;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 cw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            cw = instanceMatrix * cw;
          #endif
          cw = modelMatrix * cw; vCutY = cw.y; vCutD = -mvPosition.z; }`);
  }
  if (fade) sh.uniforms.uFade = fade;
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
      ${BAYER}
      ${fade ? 'uniform float uFade;' : ''}
      ${fadeArr ? `uniform vec4 uFadeV[${fadeArr.value.length}]; varying float vBid;` : ''}
      ${cut ? 'uniform vec4 uCut; uniform float uCutFoot; varying float vCutY; varying float vCutD;' : ''}`)
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      ${fade ? 'if (uFade < .995 && bayer4(gl_FragCoord.xy) >= uFade) discard;' : ''}
      ${fadeArr ? `{ int bi = int(vBid + .5), bq = bi / 4, bc = bi - bq * 4; vec4 fv = uFadeV[bq];
          float fdv = bc == 0 ? fv.x : bc == 1 ? fv.y : bc == 2 ? fv.z : fv.w;
          if (fdv < .995 && bayer4(gl_FragCoord.xy) >= fdv) discard; }` : ''}
      ${cut ? `{ if (vCutD < 4.5 && bayer4(gl_FragCoord.xy) > smoothstep(2.6, 4.5, vCutD)) discard;   // fade foliage right in front of the lens
          float cr = length(gl_FragCoord.xy - uCut.xy) / uCut.w;
          if (cr < 1. && vCutD < uCut.z - .6 && vCutY > uCutFoot) {
            float k = smoothstep(1., .5, cr) * smoothstep(0., 1.2, vCutY - uCutFoot);
            if (bayer4(gl_FragCoord.xy) < k * .9) discard;
          } }` : ''}`);
}

// 自定义 ShaderMaterial（含雾）：vertex 中需写 mvPosition 与 gl_Position，fragment 中写 gl_FragColor
const V_HEAD = '#include <common>\n#include <fog_pars_vertex>\n';
const V_TAIL = '\n#include <fog_vertex>\n';
const F_HEAD = '#include <common>\n#include <fog_pars_fragment>\n';
const F_TAIL = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n#include <fog_fragment>\n';
export function shaderMaterial({ uniforms = {}, vertexPars = '', vertex, fragmentPars = '', fragment, fog = true, ...opts }) {
  const u = fog ? Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), FOGU, uniforms) : uniforms;
  return new THREE.ShaderMaterial({
    uniforms: u,
    fog,
    vertexShader: `${V_HEAD}${vertexPars}\nvoid main(){\n${vertex}\n${fog ? V_TAIL : ''}}`,
    fragmentShader: `${F_HEAD}${NOISE_GLSL}${fragmentPars}\nvoid main(){\n${fragment}\n${F_TAIL}}`,
    ...opts,
  });
}
