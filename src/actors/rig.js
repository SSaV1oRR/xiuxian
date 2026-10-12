// 刚体蒙皮合并：把挂在各关节（Group）上的静态网格按材质类别合成少数几个蒙皮网格，
// 每个顶点 100% 绑定到它原来所在的关节，关节仍是原来的 Group，动作代码不变；每个类别只需一次绘制、一次投影
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// classOf(mesh) → 类别名（返回假值则保留原网格不合并）；materials[类别] 为合并后的材质（应开启 vertexColors）；
// 没有顶点色的网格以其材质颜色写入顶点色；extra(mesh, geo, n) 可为几何追加逐顶点属性（每个类别内须一致）
export function skinRig(root, { skip = new Set(), classOf = () => 'all', materials, shadow = () => true, extra = null, cull = true } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), M = new THREE.Matrix4();
  const bones = [], boneIdx = new Map(), byClass = new Map(), merged = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || skip.has(o)) return;
    const cls = classOf(o);
    if (!cls) return;
    const joint = o.parent;
    if (!boneIdx.has(joint)) { boneIdx.set(joint, bones.length); bones.push(joint); }
    const bi = boneIdx.get(joint);
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(M.multiplyMatrices(inv, o.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    const n = g.attributes.position.count;
    if (!g.attributes.color) {
      const c = o.material.color, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    if (extra) extra(o, g, n);
    if (!byClass.has(cls)) byClass.set(cls, []);
    byClass.get(cls).push(g);
    merged.push(o);
  });
  if (!merged.length) return [];
  const skeleton = new THREE.Skeleton(bones), out = [];
  for (const [cls, list] of byClass) {
    const sm = new THREE.SkinnedMesh(mergeGeometries(list), materials[cls]);
    sm.castShadow = shadow(cls);
    sm.receiveShadow = true;
    sm.frustumCulled = cull;
    sm.name = 'rig-' + cls;
    root.add(sm);
    sm.bind(skeleton);
    // 包围球按绑定姿态计算并留出动作余量
    sm.computeBoundingSphere();
    sm.boundingSphere.radius += 0.4;
    out.push(sm);
  }
  for (const o of merged) o.parent.remove(o);
  return out;
}
