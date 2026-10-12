// 第十五轮：convert_cultivator.py 的输出（tools/_build/cultivator_full.glb、cultivator_lo.glb）→ assets/converted/figure/
//   cultivator.glb     原网格（12.1 万顶点）量化（法线、UV、权重；位置 14 位），贴图 2048
//   cultivator_lo.glb  减面到约三分之一（meshoptimizer，保留 UV 接缝与蒙皮），量化，贴图 1024——演武场的对手与流畅画质用
// 用法（离线工具，依赖不随项目分发）：把本文件复制到装有 @gltf-transform/core|extensions|functions 3.10 与 meshoptimizer 0.20 的目录里运行
//   node convert_cultivator.mjs <项目根目录>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, quantize, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'fs';
import path from 'path';

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const root = process.argv[2];
const build = path.join(root, 'tools', '_build');
const out = path.join(root, 'assets', 'converted', 'figure');
fs.mkdirSync(out, { recursive: true });

const Q = { quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8, quantizeGeneric: 12 };
const tris = (doc) => doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);

for (const [src, dst, ratio] of [['cultivator_full.glb', 'cultivator.glb', 1], ['cultivator_lo.glb', 'cultivator_lo.glb', 0.34]]) {
  const doc = await io.read(path.join(build, src));
  const t0 = tris(doc);
  await doc.transform(dedup(), weld());
  if (ratio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.0015, lockBorder: false }));
  await doc.transform(quantize(Q), prune());
  const file = path.join(out, dst);
  await io.write(file, doc);
  console.log(dst, 'tris', t0, '→', tris(doc), (fs.statSync(file).size / 1e6).toFixed(2), 'MB');
}
