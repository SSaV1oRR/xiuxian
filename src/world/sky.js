// 天空与天光：天空照片关键帧（Poly Haven qwantani 系列，同一地点黎明→夜晚，CC0）按时辰交替过渡，
// 叠加从多云天空照片（kloofendal_48d，CC0）提取的云层；太阳、月亮与日晕按游戏时刻的实际方位绘制。
// 同步更新：日光 / 月光（方向、颜色、强度、阴影）、天光与补光、雾色（显示色，与天空地平线衔接）、曝光、夜色系数。
import * as THREE from 'three';
import { FOGU } from './shaderlib.js';
import { TIME, skyState } from './time.js';
import { ASSETS } from './assets.js';

export const FOG_COLOR = new THREE.Color(0xc2cbd1);
export const SUN_DIR = new THREE.Vector3(0.66, 0.5, 0.56).normalize();   // 当前主光方向（每帧更新）
// 夜空光：月低或已落时，主光改为自天顶斜照（不随月落整片变黑）；月光、夜空光与补光取 #AFC6E6（线性、按亮度归一）
const NIGHT_DIR = new THREE.Vector3(-0.35, 0.86, 0.38).normalize();
const MOON_COL = [0.54, 0.71, 1.0], _moonCol = new THREE.Color(...MOON_COL);

// 关键帧时刻（游戏小时）；night 在 19.7 之后保持到次日 4.4
const KEY_T = { dawn: 5.0, sunrise: 5.7, morning: 7.4, noon: 11.0, noonHold: 13.6, late: 16.6, sunset: 17.95, dusk: 18.75, night: 19.7, nightEnd: 4.4 };
// 各关键帧的云色（显示色：受光、背光）、云量、天光、曝光、近处薄霭色（显示色）
const LOOK = {
  // 第十三轮：夜里提亮天光（偏 #AFC6E6 的月夜冷蓝），地面反光略增，曝光略升——建筑轮廓、地面高差、台阶始终辨得清，仍是夜色
  night:   { lit: [0.16, 0.18, 0.24], shade: [0.07, 0.08, 0.11], cloud: 0.45, hemiSky: [0.30, 0.38, 0.54], hemiGnd: [0.10, 0.10, 0.12], hemi: 0.58, exp: 1.32, near: [0.12, 0.14, 0.19] },
  dawn:    { lit: [0.62, 0.50, 0.50], shade: [0.30, 0.30, 0.38], cloud: 0.7, hemiSky: [0.45, 0.48, 0.62], hemiGnd: [0.22, 0.2, 0.2], hemi: 0.6, exp: 1.12, near: [0.42, 0.42, 0.46] },
  sunrise: { lit: [1.0, 0.78, 0.60], shade: [0.50, 0.46, 0.54], cloud: 0.85, hemiSky: [0.62, 0.62, 0.70], hemiGnd: [0.34, 0.3, 0.26], hemi: 0.78, exp: 1.06, near: [0.72, 0.66, 0.6] },
  morning: { lit: [1.0, 0.965, 0.9], shade: [0.66, 0.70, 0.78], cloud: 1.0, hemiSky: [0.72, 0.77, 0.85], hemiGnd: [0.46, 0.43, 0.36], hemi: 1.0, exp: 1.0, near: [0.86, 0.85, 0.82] },
  noon:    { lit: [1.0, 0.975, 0.93], shade: [0.70, 0.74, 0.82], cloud: 1.0, hemiSky: [0.74, 0.79, 0.88], hemiGnd: [0.48, 0.45, 0.37], hemi: 1.05, exp: 0.98, near: [0.86, 0.87, 0.86] },
  late:    { lit: [1.0, 0.94, 0.84], shade: [0.64, 0.66, 0.74], cloud: 1.0, hemiSky: [0.72, 0.75, 0.82], hemiGnd: [0.48, 0.43, 0.35], hemi: 1.0, exp: 1.0, near: [0.86, 0.83, 0.78] },
  sunset:  { lit: [1.0, 0.70, 0.46], shade: [0.48, 0.42, 0.50], cloud: 0.95, hemiSky: [0.62, 0.60, 0.68], hemiGnd: [0.36, 0.30, 0.24], hemi: 0.78, exp: 1.04, near: [0.78, 0.68, 0.58] },
  dusk:    { lit: [0.52, 0.36, 0.40], shade: [0.20, 0.20, 0.28], cloud: 0.75, hemiSky: [0.36, 0.36, 0.52], hemiGnd: [0.14, 0.12, 0.14], hemi: 0.55, exp: 1.15, near: [0.30, 0.27, 0.32] },
};

// 当前时刻落在哪两个关键帧之间：返回 [a, b, w]
function keyPair(h) {
  const T = KEY_T;
  if (h < T.nightEnd || h >= T.night) return ['night', 'night', 0];
  const seq = [['night', T.nightEnd], ['dawn', T.dawn], ['sunrise', T.sunrise], ['morning', T.morning], ['noon', T.noon], ['noon', T.noonHold], ['late', T.late], ['sunset', T.sunset], ['dusk', T.dusk], ['night', T.night]];
  for (let i = 0; i < seq.length - 1; i++) {
    const [a, ta] = seq[i], [b, tb] = seq[i + 1];
    if (h >= ta && h < tb) { const u = (h - ta) / (tb - ta); return [a, b, u * u * (3 - 2 * u)]; }
  }
  return ['night', 'night', 0];
}

const V = `varying vec3 vDir;
  void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const F = `#include <common>
  uniform sampler2D uKeyA, uKeyB, uCloudA, uCloudL, uMoonTex;
  uniform float uKeyW, uYaw, uCloudRot, uCloudAmt, uSunVis, uMoonVis, uHasTex, uStarVis, uTime, uHasMoon;
  uniform vec3 uSunDir, uSunCol, uMoonDir, uCloudLit, uCloudShade, uFogSun, uFogAway, uTop, uHor;
  uniform vec4 uMeteor;          // xyz 流星起点方向，w 进度（<0 无流星）
  uniform vec3 uMeteorEnd;
  uniform vec2 uFogSunXZ;
  varying vec3 vDir;
  vec3 dec(vec3 c){ return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), step(.04045, c)); }
  float h31(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
  vec3 h33(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
  float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1., 0., 0.)), f.x), mix(h31(i + vec3(0., 1., 0.)), h31(i + vec3(1., 1., 0.)), f.x), f.y),
               mix(mix(h31(i + vec3(0., 0., 1.)), h31(i + vec3(1., 0., 1.)), f.x), mix(h31(i + vec3(0., 1., 1.)), h31(i + vec3(1., 1., 1.)), f.x), f.y), f.z); }
  // 星：方向按三维网格分格，每格至多一颗，亮度按幂分布（亮星少），微微闪烁；按屏幕导数抗锯齿
  vec3 starLayer(vec3 d, float scale, float density, float sizeK){
    vec3 p = d * scale, c = floor(p);
    vec3 r = h33(c);
    if (r.x > density) return vec3(0.);
    vec3 sp = c + .25 + .5 * h33(c + 7.1);
    float dist = length(p - sp);
    float w = fwidth(p.x) + fwidth(p.y);
    float b = pow(r.y, 7.) * 2.6 + .12;
    float tw = .65 + .35 * sin(uTime * (1.5 + r.z * 4.) + r.x * 40.);
    float s = smoothstep(sizeK * (.5 + b * .7) + w, 0., dist);
    vec3 tint = mix(vec3(.75, .85, 1.15), vec3(1.15, .95, .78), r.z);
    return tint * s * b * tw;
  }
  void main(){
    vec3 d = normalize(vDir);
    float el = asin(clamp(d.y, -1., 1.));
    float az = atan(d.x, -d.z);
    vec3 col;
    if (uHasTex > .5) {
      vec2 uv = vec2(fract((az + uYaw) / 6.2831853), clamp(.5 + el / 3.1415927, .002, .998));
      col = mix(texture2D(uKeyA, uv).rgb, texture2D(uKeyB, uv).rgb, uKeyW);
    } else col = mix(dec(uHor), dec(uTop), pow(clamp(d.y, 0., 1.), .6));
    float cs = dot(d, uSunDir);
    // 日晕（照片中已去掉，这里按实际太阳位置补回）
    col += uSunCol * (pow(max(cs, 0.), 6.) * .14 + pow(max(cs, 0.), 48.) * .3 + pow(max(cs, 0.), 600.) * .6) * uSunVis;
    col = mix(col, uSunCol * 1.6 + .25, smoothstep(.99975, .9999, cs) * uSunVis * step(-.02, el));
    // 星空与银河（入夜渐显，近地平线消光，月旁被月光冲淡）
    float cm = dot(d, uMoonDir);
    if (uStarVis > .01 && el > -.02) {
      float ext = smoothstep(-.02, .35, el) * uStarVis * (1. - .7 * pow(max(cm, 0.), 18.));
      vec3 st = starLayer(d, 300., .22, .05) * .55 + starLayer(d, 130., .07, .045) * 1.3;
      // 银河：一条斜贯天顶的光带，带中有暗尘带与星团的明暗
      vec3 mwN = normalize(vec3(.62, .18, .76));
      float band = exp(-pow(dot(d, mwN) / .2, 2.));
      float dust = vn(d * 9.) * .6 + vn(d * 23.) * .4;
      float mw = band * (.5 + .9 * vn(d * 5.)) * smoothstep(.25, .75, dust);
      vec3 mwc = mix(vec3(.18, .2, .34), vec3(.34, .28, .3), vn(d * 3. + 2.)) * mw * .55;
      col += (st + mwc + starLayer(d, 560., .55 * band, .06) * .5 * band) * ext;
      // 流星：一道自起点划向终点的细光，尾部渐隐
      if (uMeteor.w >= 0.) {
        vec3 A = normalize(uMeteor.xyz), B = normalize(uMeteorEnd);
        float t = uMeteor.w;
        vec3 head = normalize(mix(A, B, t)), tail = normalize(mix(A, B, max(0., t - .28)));
        vec3 ab = head - tail; float L2 = max(dot(ab, ab), 1e-8);
        float u = clamp(dot(d - tail, ab) / L2, 0., 1.);
        float dd = length(d - (tail + ab * u));
        float m = smoothstep(.0028, .0, dd) * u * u * smoothstep(1., .8, t) * smoothstep(0., .08, t);
        col += vec3(1., .95, .85) * m * 2.2 * ext;
      }
    }
    // 月：带月面纹理的月盘（NASA 月面图）、柔和的月光晕与一圈淡淡的月晕
    if (uMoonVis > .001) {
      float ang = acos(clamp(cm, -1., 1.));
      const float R = .046;                       // 月盘角半径（仙境的大月亮，约为真实的十倍）
      col += vec3(.52, .6, .78) * (exp(-ang / .045) * .35 + exp(-ang / .22) * .08) * uMoonVis;
      col += vec3(.5, .55, .7) * smoothstep(.03, .0, abs(ang - .38)) * .035 * uMoonVis;    // 月晕
      if (ang < R * 1.05) {
        vec3 up = abs(uMoonDir.y) > .95 ? vec3(1., 0., 0.) : vec3(0., 1., 0.);
        vec3 e1 = normalize(cross(up, uMoonDir)), e2 = cross(uMoonDir, e1);
        vec2 q = vec2(dot(d, e1), dot(d, e2)) / sin(R);
        float r2 = dot(q, q);
        float z = sqrt(max(0., 1. - r2));
        vec3 mc = vec3(.82, .84, .86);
        if (uHasMoon > .5) {
          vec2 muv = vec2(.5 + atan(q.x, z) / 6.2831853 + .25, .5 + asin(clamp(q.y, -1., 1.)) / 3.1415927);
          mc = texture2D(uMoonTex, muv).rgb;
          mc = mix(vec3(dot(mc, vec3(.3, .59, .11))), mc, .35) * 1.55;
        }
        mc *= (.62 + .38 * z) * vec3(.98, 1., 1.06);
        float edge = smoothstep(1., .965, sqrt(r2));
        col = mix(col, mc * 1.35, edge * uMoonVis);
      }
    }
    // 云层
    if (uHasTex > .5 && el > 0.) {
      vec2 cuv = vec2(fract((az + uCloudRot) / 6.2831853), clamp(el / 1.5707963, 0., .999));
      float a = texture2D(uCloudA, cuv).r * uCloudAmt * smoothstep(0., .07, el);
      float l = texture2D(uCloudL, cuv).r;
      vec3 cc = mix(dec(uCloudShade), dec(uCloudLit), smoothstep(.15, .95, l));
      cc += uSunCol * pow(max(cs, 0.), 5.) * .22 * uSunVis;
      col = mix(col, cc, a);
    }
    // 地平线化入雾色（与地表雾一致，显示色）
    vec2 fxz = d.xz / max(length(d.xz), 1e-4);
    float sunSide = max(dot(fxz, uFogSunXZ), 0.); sunSide *= sunSide;
    vec3 hz = dec(mix(uFogAway, uFogSun, sunSide));
    col = mix(col, hz, 1. - smoothstep(-.03, .085, el));
    gl_FragColor = vec4(col, 1.);
    #include <colorspace_fragment>
  }`;

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

export class Sky {
  constructor(renderer, scene, { shadowMap = 2048, shadowRange = 60, shadows = true } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    const T = ASSETS.tex;
    this.keys = ASSETS.json.sky ? Object.fromEntries(ASSETS.json.sky.keys.map((k) => [k.name, k])) : null;
    const has = !!(T.sky_noon && T.sky_night && T.cloudA && T.cloudL && this.keys);
    this.u = {
      uKeyA: { value: T.sky_morning || null }, uKeyB: { value: T.sky_noon || null }, uKeyW: { value: 0 }, uYaw: { value: 0 }, uHasTex: { value: has ? 1 : 0 },
      uCloudA: { value: T.cloudA || null }, uCloudL: { value: T.cloudL || null }, uCloudRot: { value: 1.3 }, uCloudAmt: { value: 1 },
      uCloudLit: { value: new THREE.Vector3(1, 1, 1) }, uCloudShade: { value: new THREE.Vector3(0.7, 0.72, 0.8) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Vector3(1, 0.9, 0.7) }, uSunVis: { value: 1 },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) }, uMoonVis: { value: 0 },
      uMoonTex: { value: T.moon || null }, uHasMoon: { value: T.moon ? 1 : 0 }, uStarVis: { value: 0 }, uTime: { value: 0 },
      uMeteor: { value: new THREE.Vector4(0, 1, 0, -1) }, uMeteorEnd: { value: new THREE.Vector3(0, 1, 0) },
      uFogSun: FOGU.uFogSun, uFogAway: FOGU.uFogAway, uFogSunXZ: FOGU.uFogSunXZ,
      uTop: { value: new THREE.Vector3(0.53, 0.63, 0.73) }, uHor: { value: new THREE.Vector3(0.86, 0.86, 0.83) },
    };
    const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false, uniforms: this.u, vertexShader: V, fragmentShader: F });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -100;
    scene.add(this.dome);

    // 环境贴图（琉璃、铜、水面的反光）：定时从天空重绘
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat));
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.onEnv = [];
    this.envT = 0;

    // 日光（夜里改为月光），阴影随角色移动并按纹素对齐
    const sun = this.sun = new THREE.DirectionalLight(0xffe0b8, 2.9);
    sun.castShadow = shadows;
    this.range = this.baseRange = shadowRange;
    this.baseMap = shadowMap;
    if (shadows) {
      sun.shadow.mapSize.set(shadowMap, shadowMap);
      const c = sun.shadow.camera;
      // 阴影柱：向阳一侧 170 米（低日时远处高处的投影体仍在内），背阳一侧只留 120 米，减少投影绘制
      this.sunDist = 170;
      Object.assign(c, { left: -shadowRange, right: shadowRange, top: shadowRange, bottom: -shadowRange, near: 1, far: this.sunDist + 120 });
      c.updateProjectionMatrix();
      sun.shadow.bias = -0.18 / c.far;                   // 深度偏移按世界距离约 0.18 米折算
      sun.shadow.normalBias = 0.045;
    }
    scene.add(sun, sun.target);
    // 冷色补光：从主光的背面斜照，背光立面不至于死黑
    this.fill = new THREE.DirectionalLight(0xb9c8da, 0.32);
    scene.add(this.fill, this.fill.target);
    this.hemi = new THREE.HemisphereLight(0xbccbdc, 0x6b6250, 0.9);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(FOG_COLOR.clone(), 1);
    scene.background = null;
    this.lightDir = new THREE.Vector3().copy(SUN_DIR);
    this.state = null;
    this.applyTime();
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
    this.envMap = this.envRT.texture;
  }

  setShadowRange(range, mapSize = this.sun.shadow.mapSize.x) {
    if (this.baseRange == null) { this.baseRange = this.range; this.baseMap = this.sun.shadow.mapSize.x; }
    this.range = range;
    const sh = this.sun.shadow, c = sh.camera;
    if (sh.mapSize.x !== mapSize) {
      sh.mapSize.set(mapSize, mapSize);
      if (sh.map) { sh.map.dispose(); sh.map = null; }
    }
    const wide = range > this.baseRange + 1;
    this.sunDist = wide ? 260 : 170;
    Object.assign(c, { left: -range, right: range, top: range, bottom: -range, far: wide ? Math.max(520, 280 + range * 1.6) : this.sunDist + 120 });
    sh.bias = -0.18 / c.far;
    c.updateProjectionMatrix();
  }

  // 按当前游戏时刻更新天空、光照与雾
  applyTime() {
    const st = this.state = skyState(TIME.hour), u = this.u;
    const [ka, kb, w] = keyPair(TIME.hour);
    const T = ASSETS.tex;
    if (T['sky_' + ka] && T['sky_' + kb]) { u.uKeyA.value = T['sky_' + ka]; u.uKeyB.value = T['sky_' + kb]; }
    u.uKeyW.value = w;
    const la = LOOK[ka], lb = LOOK[kb], L = (k) => lerp3(la[k], lb[k], w), Ls = (k) => la[k] + (lb[k] - la[k]) * w;
    // 关键帧照片的太阳方位统一在 216°，旋转到当前太阳（夜里随月）方位
    const sinE = Math.sin(st.sunEl);
    const refAz = sinE > -0.25 ? st.sunAz : st.moonAz;
    u.uYaw.value = (216 / 180) * Math.PI - refAz;
    u.uSunDir.value.copy(st.sunDir);
    u.uMoonDir.value.copy(st.moonDir);
    // 太阳色：低角度偏橙，高处近白（线性）
    const warm = THREE.MathUtils.smoothstep(sinE, -0.05, 0.45);
    const sunCol = [1.0, 0.52 + 0.43 * warm, 0.26 + 0.6 * warm];
    u.uSunCol.value.set(sunCol[0], sunCol[1], sunCol[2]);
    u.uSunVis.value = THREE.MathUtils.smoothstep(sinE, -0.08, 0.02);
    u.uMoonVis.value = THREE.MathUtils.smoothstep(Math.sin(st.moonEl), -0.02, 0.1) * (1 - THREE.MathUtils.smoothstep(sinE, -0.2, -0.02));
    u.uStarVis.value = 1 - THREE.MathUtils.smoothstep(sinE, -0.2, -0.04);
    u.uCloudLit.value.set(...L('lit')); u.uCloudShade.value.set(...L('shade'));
    u.uCloudAmt.value = Ls('cloud');
    // 雾色：取关键帧照片的地平线显示色（朝阳 / 背阳），近处薄霭
    const K = this.keys;
    if (K) {
      const hs = lerp3(K[ka].hzSunDisp, K[kb].hzSunDisp, w), ha = lerp3(K[ka].hzAwayDisp, K[kb].hzAwayDisp, w);
      FOGU.uFogSun.value.set(...hs); FOGU.uFogAway.value.set(...ha);
    }
    FOGU.uFogNear.value.set(...L('near'));
    const sxz = new THREE.Vector2(st.sunDir.x, st.sunDir.z);
    if (sinE < -0.25) sxz.set(st.moonDir.x, st.moonDir.z);
    FOGU.uFogSunXZ.value.copy(sxz.lengthSq() > 1e-6 ? sxz.normalize() : sxz.set(0, 1));
    const hz = FOGU.uFogAway.value;
    this.scene.fog.color.setRGB(srgbToLin(hz.x), srgbToLin(hz.y), srgbToLin(hz.z));
    FOG_COLOR.copy(this.scene.fog.color);
    // 主光：白天为日光，入夜后渐变为月光（交替时两者强度都接近零，避免跳变）
    const dayK = THREE.MathUtils.smoothstep(sinE, -0.02, 0.14);
    const moonK = THREE.MathUtils.smoothstep(Math.sin(st.moonEl), 0.02, 0.25) * (1 - THREE.MathUtils.smoothstep(sinE, -0.12, 0.0));
    if (sinE > -0.06) {
      this.lightDir.copy(st.sunDir);
      this.sun.color.setRGB(sunCol[0], sunCol[1], sunCol[2]);
      this.sun.intensity = 2.75 * dayK;          // 第九轮：略降（白石、汉白玉铺地在正午不再发白），日光略暖
    } else {
      // 第十三轮：月光 + 不随月相、月落而消失的夜空光（入夜后渐起，与日光交替处两者都近于零）
      const nightF = 1 - THREE.MathUtils.smoothstep(sinE, -0.16, -0.04);
      const mk = Math.max(moonK, 0.05);
      this.lightDir.copy(NIGHT_DIR).lerp(st.moonDir, moonK * THREE.MathUtils.smoothstep(st.moonDir.y, 0.08, 0.3)).normalize();
      this.sun.color.setRGB(...MOON_COL);
      this.sun.intensity = 1.05 * (0.42 * nightF * (1 - mk) + mk);
    }
    if (this.lightDir.y < 0.06) { this.lightDir.y = 0.06; this.lightDir.normalize(); }
    SUN_DIR.copy(this.lightDir);
    const nightFill = 1 - THREE.MathUtils.smoothstep(sinE, -0.16, -0.02);
    this.fill.color.setRGB(0.72, 0.8, 0.92).lerp(_moonCol, nightFill);
    this.fill.intensity = 0.44 * Math.max(dayK, 0.3) + 0.12 * nightFill;
    this.hemi.color.setRGB(...L('hemiSky'));
    this.hemi.groundColor.setRGB(...L('hemiGnd'));
    this.hemi.intensity = Ls('hemi');
    this.renderer.toneMappingExposure = Ls('exp');
    FOGU.uNight.value = 1 - THREE.MathUtils.smoothstep(sinE, -0.12, 0.06);
    // 云随风缓慢转动
    u.uCloudRot.value = 1.3 + TIME.day * 0.9 + TIME.hour * 0.035;
  }

  update(camera, focus, dt = 0) {
    this.applyTime();
    // 流星：夜里每隔十来秒（现实时间）随机划过一颗
    const u = this.u;
    u.uTime.value += dt;
    if (u.uStarVis.value > 0.6) {
      const m = u.uMeteor.value;
      if (m.w >= 0) { m.w += dt / 0.9; if (m.w > 1) m.w = -1; }
      else if (Math.random() < dt / 9) {
        const az = Math.random() * Math.PI * 2, el = 0.5 + Math.random() * 0.6;
        m.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az), 0);
        const az2 = az + (Math.random() < 0.5 ? 1 : -1) * (0.25 + Math.random() * 0.3), el2 = el - 0.18 - Math.random() * 0.2;
        u.uMeteorEnd.value.set(Math.cos(el2) * Math.sin(az2), Math.sin(el2), -Math.cos(el2) * Math.cos(az2));
      }
    } else u.uMeteor.value.w = -1;
    this.dome.position.copy(camera.position);
    const r = this.range, texel = (2 * r) / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx, focus.y, fz).addScaledVector(this.lightDir, this.sunDist || 260);
    this.sun.target.updateMatrixWorld();
    this.fill.target.position.set(fx, focus.y, fz);
    this.fill.position.set(fx - this.lightDir.x * 100, focus.y + 60, fz - this.lightDir.z * 100);
    this.fill.target.updateMatrixWorld();
    // 约每 20 秒（现实时间）重绘一次环境贴图；时辰一下子跳过半个多时辰（调时辰、自检取图）时立即重绘，
    // 免得入夜后琉璃、铜面、水面还映着白天的天光
    this.envT += dt;
    const jump = this.envHour == null ? 0 : Math.abs(((TIME.hour - this.envHour + 36) % 24) - 12);      // 与上次重绘相差几小时（环形，0–12）
    if (this.envT > 20 || jump > 0.6) { this.envT = 0; this.refreshEnv(); }
  }

  refreshEnv() {
    this.envHour = TIME.hour;
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
    this.envMap = this.envRT.texture;
    for (const f of this.onEnv) f(this.envMap);
    old.dispose();
  }
}
