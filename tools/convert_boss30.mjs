// 第二十四轮：export_boss30.py 的输出 → assets/converted/boss30/
//   boss30.glb        骨架 + 蒙皮身体（双面笔画已去重）+ 右手的剑 + 全部动作；去重、焊接、动作关键帧精简（resample）、量化，EXT_meshopt_compression 压缩
//   （不再生成低画质的简化版：笔画很细很碎，锁住边界后几乎减不下去，放开边界又会把大块压没——低画质也用这一份）
//   boss30_props.glb  场景笔画（场地装饰，静态）
// 运行时用 vendor/addons/libs/meshopt_decoder.module.js 解码。
// 用法（离线工具，依赖不随项目分发）：复制到装有 @gltf-transform/core|extensions|functions 3.10 与 meshoptimizer 0.20 的目录里运行
//   node convert_boss30.mjs <export 目录> <项目根目录>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, quantize, prune, dedup, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import fs from 'fs';
import path from 'path';

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const [src, root] = process.argv.slice(2);
const out = path.join(root, 'assets', 'converted', 'boss30');
fs.mkdirSync(out, { recursive: true });
const tris = (doc) => doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const verts = (doc) => doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + p.getAttribute('POSITION').getCount(), 0), 0);
const keys = (doc) => doc.getRoot().listAnimations().reduce((s, a) => s + a.listSamplers().reduce((k, sm) => k + sm.getInput().getCount(), 0), 0);
const texBytes = (doc) => doc.getRoot().listTextures().reduce((s, t) => s + (t.getImage()?.byteLength || 0), 0);

for (const [file, dst, ratio] of [['boss30_full.glb', 'boss30.glb', 1], ['boss30_props_full.glb', 'boss30_props.glb', 1]]) {
  const doc = await io.read(path.join(src, file));
  const t0 = tris(doc), v0 = verts(doc), k0 = keys(doc);
  await doc.transform(dedup(), weld({ tolerance: 0 }), resample({ tolerance: 1e-4 }));
  if (ratio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.002, lockBorder: true }));
  await doc.transform(prune(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8, quantizeWeight: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  const f = path.join(out, dst);
  await io.write(f, doc);
  console.log(dst, 'tris', t0, '→', tris(doc), '| verts', v0, '→', verts(doc), '| anim keys', k0, '→', keys(doc), '| tex', (texBytes(doc) / 1e6).toFixed(2), 'MB |', (fs.statSync(f).size / 1e6).toFixed(2), 'MB');
}
