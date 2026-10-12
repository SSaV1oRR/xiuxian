// 第二十七轮：r27_convert_land.py / r27_convert_scroll.py 的输出就地压缩——去重、焊接、量化、EXT_meshopt_compression（运行时 vendor/addons/libs/meshopt_decoder.module.js 解码）。
// 用法（离线工具，依赖不随项目分发）：复制到装有 @gltf-transform/core|extensions|functions 3.10 与 meshoptimizer 0.20 的目录里运行
//   node r27_compress_glb.mjs <in.glb> <out.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, quantize, prune, dedup, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import fs from 'fs';

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const [src, dst] = process.argv.slice(2);
const doc = await io.read(src);
const stat = (d) => d.getRoot().listMeshes().reduce((s, m) => { for (const p of m.listPrimitives()) { s.v += p.getAttribute('POSITION').getCount(); s.t += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; } return s; }, { v: 0, t: 0 });
const s0 = stat(doc), b0 = fs.statSync(src).size;
await doc.transform(dedup(), weld({ tolerance: 0.0001 }), prune(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(dst, doc);
const s1 = stat(doc), b1 = fs.statSync(dst).size;
console.log(JSON.stringify({ src, dst, verts: [s0.v, s1.v], tris: [s0.t, s1.t], bytes: [b0, b1] }));
