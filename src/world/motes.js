// 灵光与萤火：角色周围的空中飘着点点灵光——白天是淡青、淡金的细小光点，缓缓上浮、明灭；
// 入夜后变成萤火（黄绿，贴着草丛与水边低飞，一闪一闪），配合柔光后期晕开。只在角色附近生成，数量很少。
import * as THREE from 'three';

export class Motes {
  constructor(scene, terrain, { count = 160 } = {}) {
    this.T = terrain; this.n = count;
    this.p = new Float32Array(count * 3);
    this.seed = new Float32Array(count);
    for (let i = 0; i < count; i++) this.seed[i] = Math.random() * 100;
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.p, 3);
    g.setAttribute('position', this.attr);
    g.setAttribute('seed', new THREE.BufferAttribute(this.seed, 1));
    this.u = { uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 400 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: `attribute float seed; uniform float uTime, uNight, uScale; varying float vA; varying vec3 vC;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.);
          float blink = uNight > .5 ? .15 + .85 * pow(max(0., sin(uTime * (1.1 + fract(seed) * 1.4) + seed * 7.)), 2.) : .55 + .45 * sin(uTime * 1.7 + seed * 5.);
          float d = -mv.z;
          vA = blink * smoothstep(40., 12., d) * smoothstep(.6, 2., d);
          vC = uNight > .5 ? vec3(.75, 1., .35) : mix(vec3(.6, .95, 1.), vec3(1., .9, .6), fract(seed * 3.7));
          gl_PointSize = (uNight > .5 ? 4.2 : 1.8 + fract(seed * 1.3)) * uScale / max(d, 1.) * .06 + 1.5;
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; varying vec3 vC;
        void main(){ vec2 q = gl_PointCoord - .5; float r = length(q); float a = (smoothstep(.5, .0, r) * .6 + smoothstep(.18, .0, r) * .8) * vA; if (a < .01) discard; gl_FragColor = vec4(vC * a * 2., 1.); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    scene.add(this.points);
    this.ready = false;
  }

  spawn(i, focus, night, near = false) {
    const a = Math.random() * Math.PI * 2, r = (near ? 4 : 2) + Math.sqrt(Math.random()) * (night > 0.5 ? 17 : 26);   // 夜里的萤火聚在近处
    const x = focus.x + Math.cos(a) * r, z = focus.z + Math.sin(a) * r;
    const g = this.T.heightAt(x, z);
    this.p[i * 3] = x; this.p[i * 3 + 2] = z;
    this.p[i * 3 + 1] = g + (night > 0.5 ? 0.3 + Math.random() * 1.6 : 0.6 + Math.random() * 5);
  }

  update(dt, t, focus, night) {
    const N = this.n;
    this.u.uTime.value = t; this.u.uNight.value = night;
    if (!this.ready) { for (let i = 0; i < N; i++) this.spawn(i, focus, night); this.ready = true; }
    const rise = night > 0.5 ? 0.02 : 0.18;
    for (let i = 0; i < N; i++) {
      const k = i * 3, s = this.seed[i];
      // 缓慢的流动：各自的正弦漂移，白天上浮，夜里绕圈低飞
      this.p[k] += Math.sin(t * 0.4 + s) * 0.25 * dt;
      this.p[k + 2] += Math.cos(t * 0.33 + s * 1.3) * 0.25 * dt;
      this.p[k + 1] += (rise + Math.sin(t * 0.8 + s * 2) * 0.12) * dt;
      const dx = this.p[k] - focus.x, dz = this.p[k + 2] - focus.z;
      const g = this.T.heightAt(this.p[k], this.p[k + 2]);
      if (dx * dx + dz * dz > (night > 0.5 ? 21 * 21 : 30 * 30) || this.p[k + 1] > g + (night > 0.5 ? 3 : 9) || this.p[k + 1] < g + 0.1) this.spawn(i, focus, night, true);
    }
    this.attr.needsUpdate = true;
  }
}
