// 第十六轮：convert_boss50.py 的输出（tools/_build/boss50_full.glb、boss50_lo.glb）→ assets/converted/boss50/
//   boss50.glb     原网格 16.7 万三角形；去重、焊接、去掉多余的动作关键帧（resample）、量化，再用 EXT_meshopt_compression 压缩几何与动作
//   boss50_lo.glb  减面到约 45%（meshoptimizer，锁住 UV 接缝），其余同上——流畅画质用
// 运行时用 vendor/addons/libs/meshopt_decoder.module.js 解码（GLTFLoader.setMeshoptDecoder）。
// 用法（离线工具，依赖不随项目分发）：复制到装有 @gltf-transform/core|extensions|functions 3.10 与 meshoptimizer 0.20 的目录里运行
//   node convert_boss50.mjs <项目根目录>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, quantize, prune, dedup, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import fs from 'fs';
import path from 'path';

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const root = process.argv[2];
const build = path.join(root, 'tools', '_build');
const out = path.join(root, 'assets', 'converted', 'boss50');
fs.mkdirSync(out, { recursive: true });

const tris = (doc) => doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const keys = (doc) => doc.getRoot().listAnimations().reduce((s, a) => s + a.listSamplers().reduce((k, sm) => k + sm.getInput().getCount(), 0), 0);

for (const [src, dst, ratio] of [['boss50_full.glb', 'boss50.glb', 1], ['boss50_lo.glb', 'boss50_lo.glb', 0.45]]) {
  const doc = await io.read(path.join(build, src));
  const t0 = tris(doc), k0 = keys(doc);
  await doc.transform(dedup(), weld(), resample({ tolerance: 2e-4 }));
  if (ratio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.0012, lockBorder: false }));
  await doc.transform(prune(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 14, quantizeWeight: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  const file = path.join(out, dst);
  await io.write(file, doc);
  console.log(dst, 'tris', t0, '→', tris(doc), '| anim keys', k0, '→', keys(doc), '|', (fs.statSync(file).size / 1e6).toFixed(2), 'MB');
}
