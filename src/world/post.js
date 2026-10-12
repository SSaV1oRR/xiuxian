// 画面后期：柔光（泛光）与轻微调色。
// 场景照常直接画到屏幕（色调映射与显示色空间的雾都在材质里完成），画完后把屏幕拷进一张贴图，
// 在 1/2 分辨率提取亮部、逐级缩小再放大（双重 Kawase 模糊），最后与原画面以「滤色」叠合：
// 天光、云边、白石、灯火、窗光、灵光与炉火周围都晕开一圈柔和的光，远景更通透。调色只做极轻的饱和度、暗部偏青与暗角。
// 流畅画质不启用（直接绘制）。
import * as THREE from 'three';

const VERT = 'varying vec2 vUv; void main(){ vUv = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0., 1.); }';

export class Post {
  constructor(renderer, { enabled = true, strength = 0.42, threshold = 0.7, knee = 0.22, levels = 5 } = {}) {
    this.r = renderer;
    this.enabled = enabled;
    this.levels = levels;
    const ext = renderer.extensions;
    this.type = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(g, null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.u = { strength: { value: strength }, threshold: { value: threshold }, knee: { value: knee } };
    const mk = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: frag, depthTest: false, depthWrite: false, ...extra });
    // 亮部提取（显示色亮度，柔和拐点）+ 2×2 降采样
    this.mBright = mk(`uniform sampler2D tSrc; uniform vec2 uTexel; uniform float threshold, knee; varying vec2 vUv;
      vec3 pick(vec2 uv){ vec3 c = texture2D(tSrc, uv).rgb; float l = max(c.r, max(c.g, c.b));
        float s = clamp(l - threshold + knee, 0., 2. * knee); s = s * s / (4. * knee + 1e-4);
        return c * max(s, l - threshold) / max(l, 1e-4); }
      void main(){ vec2 o = uTexel * .5;
        vec3 c = pick(vUv + vec2(-o.x, -o.y)) + pick(vUv + vec2(o.x, -o.y)) + pick(vUv + vec2(-o.x, o.y)) + pick(vUv + vec2(o.x, o.y));
        gl_FragColor = vec4(c * .25, 1.); }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, threshold: this.u.threshold, knee: this.u.knee });
    this.mDown = mk(`uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
      void main(){ vec2 o = uTexel;
        vec3 c = texture2D(tSrc, vUv).rgb * 4. + texture2D(tSrc, vUv - o).rgb + texture2D(tSrc, vUv + o).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv - vec2(o.x, -o.y)).rgb;
        gl_FragColor = vec4(c / 8., 1.); }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mUp = mk(`uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
      void main(){ vec2 o = uTexel;
        vec3 c = texture2D(tSrc, vUv + vec2(-o.x * 2., 0.)).rgb + texture2D(tSrc, vUv + vec2(o.x * 2., 0.)).rgb + texture2D(tSrc, vUv + vec2(0., -o.y * 2.)).rgb + texture2D(tSrc, vUv + vec2(0., o.y * 2.)).rgb
          + (texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb) * 2.;
        gl_FragColor = vec4(c / 12., 1.); }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }, { blending: THREE.AdditiveBlending, transparent: true });
    // 合成：原画面 + 柔光（滤色叠合，不会把亮处推到死白），轻微调色、暗角、抖动去色带
    // 第二十五轮：uPaper（0 … 1）——拔刀斩升级形态演出时的水墨调色：暗处偏墨（#15191F）、亮处偏宣纸（#D8D1C4），平时为 0
    // 第二十七轮（「墨里终焉」）：朱红（羽缘、爆墨里的几点朱）不被调成灰；uHold（0 … 1）——退场叠化：演出最后一帧（tHeld）按墨晕的形状一块块化开，露出回到第三人称的画面
    this.mComp = mk(`uniform sampler2D tScene, tBloom, tHeld; uniform float strength, uVig, uSat, uPaper, uHold; uniform vec3 uShadow, uPaperC, uInkC; varying vec2 vUv;
      float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hh(i), hh(i + vec2(1., 0.)), f.x), mix(hh(i + vec2(0., 1.)), hh(i + vec2(1., 1.)), f.x), f.y); }
      void main(){
        vec3 c = texture2D(tScene, vUv).rgb;
        vec3 b = texture2D(tBloom, vUv).rgb * strength;
        c = 1. - (1. - c) * (1. - min(b, vec3(1.)));
        float l = dot(c, vec3(.299, .587, .114));
        c = mix(vec3(l), c, uSat);
        if (uPaper > .001) { float red = clamp((c.r - max(c.g, c.b)) * 3.2, 0., 1.); vec3 g = mix(uInkC, uPaperC, smoothstep(.03, .82, l)) * (.82 + .3 * l); c = mix(c, g, uPaper * (1. - red * .85)); l = dot(c, vec3(.299, .587, .114)); }
        c += uShadow * (1. - l) * (1. - l);
        vec2 q = vUv - .5;
        c *= 1. - uVig * smoothstep(.35, .95, dot(q, q) * 2.2);
        c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5) / 255.;
        if (uHold > .001) {
          vec2 a = vUv * vec2(1.78, 1.);
          float n = vn(a * 4.) * .55 + vn(a * 11. + 3.1) * .3 + vn(a * 29. - 1.7) * .15;
          // th 随 uHold 由 1.075 降到 −0.075：噪声值高于 th 的地方先露出回来的画面（中间略早），uHold = 1 时整屏都是留住的那一帧、0 时整屏都是回来的画面
          float th = uHold * 1.15 - .075;
          float k = smoothstep(th - .06, th + .06, n + (1. - length(q) * 1.2) * .1);
          vec3 h = texture2D(tHeld, vUv).rgb;
          c = mix(h, c, k);
          c = mix(c, uInkC, (1. - smoothstep(0., .05, abs(n - th))) * .25 * step(.02, uHold) * step(uHold, .98));
        }
        gl_FragColor = vec4(c, 1.); }`, { tScene: { value: null }, tBloom: { value: null }, tHeld: { value: null }, strength: this.u.strength, uVig: { value: 0.22 }, uSat: { value: 1.06 }, uShadow: { value: new THREE.Vector3(-0.004, 0.004, 0.012) },
      uPaper: { value: 0 }, uHold: { value: 0 }, uPaperC: { value: new THREE.Color(0xd8d1c4) }, uInkC: { value: new THREE.Color(0x15191f) } });
    this.rts = [];
    this.w = 0; this.h = 0;
    this._v = new THREE.Vector2(); this._o = new THREE.Vector2(0, 0);
  }

  ensure(w, h) {
    if (w === this.w && h === this.h && this.fb) return;
    this.w = w; this.h = h;
    this.fb?.dispose();
    this.fb = new THREE.FramebufferTexture(w, h);
    this.fb.minFilter = THREE.LinearFilter; this.fb.magFilter = THREE.LinearFilter;
    for (const rt of this.rts) rt.dispose();
    this.rts = [];
    let rw = w, rh = h;
    for (let i = 0; i < this.levels; i++) {
      rw = Math.max(1, Math.round(rw / 2)); rh = Math.max(1, Math.round(rh / 2));
      this.rts.push(new THREE.WebGLRenderTarget(rw, rh, { type: this.type, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
    }
  }

  pass(mat, target, clear = true) {
    const r = this.r;
    this.quad.material = mat;
    r.setRenderTarget(target);
    if (clear) r.clear(true, false, false);
    r.render(this.scene, this.cam);
  }

  // 柔光随昼夜变化：白天门槛高、强度低（天光、云边、白石微微晕开）；入夜门槛降低、强度加大（灯火、窗光、灵光晕开）
  // inside：室内（炉火、灯笼）介于两者之间
  setMood(night, inside = false) {
    const n = inside ? 0.5 : night;
    // 第九轮：白天门槛提高（受光的白石、铺地不再整片泛白，只有天光、灯火与高光晕开）
    this.u.threshold.value = 0.88 - 0.46 * n;
    this.u.knee.value = 0.15 + 0.05 * n;
    this.u.strength.value = 0.42 + 0.73 * n;
    // 第二十七轮：「墨里终焉」的画中世界里（inkDim 0 … 1）柔光收住——宣纸的白不往墨上晕，山水的墨色不被冲淡
    const k = this.inkDim || 0;
    if (k > 0) { this.u.threshold.value += (0.97 - this.u.threshold.value) * k; this.u.strength.value *= 1 - 0.75 * k; }
  }

  // 第二十五轮：水墨调色的强度（0 关）
  setPaper(k) { this.mComp.uniforms.uPaper.value = Math.max(0, Math.min(1, k)); }
  // 第二十八轮：龙凤撞入时画面四角压暗一下（墨晕；k 0 … 1 加在原有的暗角 0.22 上）；演出结束归零
  setVig(k) { this.mComp.uniforms.uVig.value = 0.22 + Math.max(0, Math.min(1, k)); }
  get paper() { return this.mComp.uniforms.uPaper.value; }
  // 第二十七轮：退场叠化——captureHold() 让下一次 render 把画好的一帧留住；setHold(k) 留住的那一帧还盖着多少（1 全盖 … 0 收完）。没开后期时不支持（返回 false）
  captureHold() { if (!this.enabled) return false; this.wantHold = true; return true; }
  setHold(k) { this.mComp.uniforms.uHold.value = this.held ? Math.max(0, Math.min(1, k)) : 0; }
  get hold() { return this.mComp.uniforms.uHold.value; }
  dropHold() { this.mComp.uniforms.uHold.value = 0; this.wantHold = false; }
  // scene 也可以是一个函数（自行完成多遍绘制，如问道殿内：先画窗外的宗门、再画室内），画完后照常做柔光与调色
  render(scene, camera) {
    const r = this.r;
    if (typeof scene === 'function') scene(); else r.render(scene, camera);
    if (!this.enabled) return;
    const size = r.getDrawingBufferSize(this._v);
    if (size.x < 8 || size.y < 8) return;
    this.ensure(size.x, size.y);
    r.copyFramebufferToTexture(this._o, this.fb);
    const keepAuto = r.autoClear, keepTone = r.toneMapping;
    r.autoClear = false;
    const R = this.rts;
    this.mBright.uniforms.tSrc.value = this.fb;
    this.mBright.uniforms.uTexel.value.set(1 / this.w, 1 / this.h);
    this.pass(this.mBright, R[0]);
    for (let i = 1; i < R.length; i++) {
      this.mDown.uniforms.tSrc.value = R[i - 1].texture;
      this.mDown.uniforms.uTexel.value.set(1 / R[i - 1].width, 1 / R[i - 1].height);
      this.pass(this.mDown, R[i]);
    }
    for (let i = R.length - 2; i >= 0; i--) {
      this.mUp.uniforms.tSrc.value = R[i + 1].texture;
      this.mUp.uniforms.uTexel.value.set(0.5 / R[i + 1].width, 0.5 / R[i + 1].height);
      this.pass(this.mUp, R[i], false);                    // 叠加到上一级（该级原有的降采样内容保留）
    }
    this.mComp.uniforms.tScene.value = this.fb;
    this.mComp.uniforms.tBloom.value = R[0].texture;
    this.pass(this.mComp, null, false);
    // 退场叠化：把这一帧（已合成、已调色）留下
    if (this.wantHold) {
      this.wantHold = false;
      if (!this.held || this.held.image.width !== this.w || this.held.image.height !== this.h) { this.held?.dispose(); this.held = new THREE.FramebufferTexture(this.w, this.h); this.held.minFilter = this.held.magFilter = THREE.LinearFilter; }
      r.copyFramebufferToTexture(this._o, this.held);
      this.mComp.uniforms.tHeld.value = this.held;
      this.heldN = (this.heldN || 0) + 1;
    }
    r.autoClear = keepAuto; r.toneMapping = keepTone;
  }
}
