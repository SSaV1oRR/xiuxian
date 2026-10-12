// 药瓶（项目素材 assets/sword/fantasy_magic_weapons_potions_pack.blend）：统计药瓶所用的贴图区域，裁出该区域并重排 UV，
// 底色 / 自发光缩到合适尺寸，去掉金属度贴图（玻璃瓶用常数），输出 potions.glb
// 用法：blender -b --python tools/potions_split.py -- <pack.blend> <工作目录>；blender -b --python tools/potions_export.py -- <工作目录>/split.blend <工作目录>/potions_raw.glb；
//       node tools/convert_potions.mjs <工作目录>/potions_raw.glb assets/converted/interior/potions.glb 2048
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';
import { execFileSync } from 'child_process';
import fs from 'fs';
import { fileURLToPath } from 'url';
const IMGCONV = fileURLToPath(new URL('./imgconv.py', import.meta.url));   // 贴图缩放转 JPG（PIL）
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [,, input, output, size = '1024'] = process.argv;
const doc = await io.read(input);
const root = doc.getRoot();
let u0 = 1, v0 = 1, u1 = 0, v1 = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
  const a = p.getAttribute('TEXCOORD_0'); const lo = a.getMin([]), hi = a.getMax([]);
  u0 = Math.min(u0, lo[0]); v0 = Math.min(v0, lo[1]); u1 = Math.max(u1, hi[0]); v1 = Math.max(v1, hi[1]);
}
console.log('uv bounds', u0, v0, u1, v1);
// 逐瓶统计 UV 覆盖（8x8 网格），看能否裁剪
const grid = new Uint8Array(64);
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
  const a = p.getAttribute('TEXCOORD_0'), uv = [];
  for (let i = 0; i < a.getCount(); i++) { a.getElement(i, uv); grid[Math.min(7, Math.floor(uv[1] * 8)) * 8 + Math.min(7, Math.floor(uv[0] * 8))] = 1; }
}
let s = ''; for (let j = 0; j < 8; j++) { for (let i = 0; i < 8; i++) s += grid[j * 8 + i] ? '#' : '.'; s += '\n'; }
console.log(s);
let ti = 0;
for (const mat of root.listMaterials()) {
  console.log('mat', mat.getName(), 'emissive', mat.getEmissiveFactor(), 'alpha', mat.getAlphaMode());
  const roles = [['diff', mat.getBaseColorTexture(), +size], ['emis', mat.getEmissiveTexture(), +size / 2], ['nor', mat.getNormalTexture(), +size / 2]];
  for (const [role, tex, sz] of roles) {
    if (!tex) continue;
    const src = `tmp_in_${ti}.png`, dst = `tmp_out_${ti}.jpg`;
    fs.writeFileSync(src, Buffer.from(tex.getImage()));
    execFileSync('python', [IMGCONV, src, dst, String(sz), role === 'nor' ? '90' : '86']);
    tex.setImage(new Uint8Array(fs.readFileSync(dst))).setMimeType('image/jpeg').setURI('');
    console.log(role, fs.statSync(dst).size >> 10, 'KB');
    fs.unlinkSync(src); fs.unlinkSync(dst); ti++;
  }
  const mr = mat.getMetallicRoughnessTexture();
  if (mr) { mat.setMetallicRoughnessTexture(null); mat.setRoughnessFactor(0.25).setMetallicFactor(0); }
}
for (const n of root.listNodes()) console.log('node', n.getName(), n.getTranslation());
await doc.transform(dedup(), prune());
await io.write(output, doc);
console.log('out', fs.statSync(output).size >> 10, 'KB');
