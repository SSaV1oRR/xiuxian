// 丹房室内陈设：Poly Haven（CC0）1k glTF → 烘焙节点变换、按材质合并、焊接、按需减面 → 贴图按用途缩小转 JPG（粗糙度/金属度可省略为常数）
// → 底面中心归零（保留真实尺寸，单位米）→ 每件一个 glb
// 用法：node tools/convert_interior.mjs <fetch_interior.py 的下载目录> assets/converted/interior [只处理的 id,id]
// 依赖（离线工具，不随项目分发）：@gltf-transform/core|extensions|functions 3.10、meshoptimizer 0.20、python + Pillow
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, transformPrimitive, join, unpartition } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { execFileSync } from 'child_process';
import fs from 'fs';
import { fileURLToPath } from 'url';
const IMGCONV = fileURLToPath(new URL('./imgconv.py', import.meta.url));   // 贴图缩放转 JPG（PIL）
import path from 'path';
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [,, srcDir, outDir, only] = process.argv;
fs.mkdirSync(outDir, { recursive: true });

// tris：目标面数；diff / nor / arm：贴图边长（arm 为 0 时改用常数粗糙度、金属度）
const SPEC = {
  chinese_cabinet: { tris: 9000, diff: 1024, nor: 512, arm: 256 },
  chinese_commode: { tris: 6000, diff: 1024, nor: 512, arm: 256 },
  chinese_console_table: { tris: 8000, err: 0.02, diff: 1024, nor: 512, arm: 256 },
  chinese_screen_panels: { tris: 2000, diff: 1024, nor: 512, arm: 256 },
  chinese_sofa: { tris: 2000, diff: 1024, nor: 512, arm: 256 },
  chinese_stool: { tris: 1500, diff: 512, nor: 256, arm: 0 },
  chinese_tea_table: { tris: 2600, diff: 1024, nor: 512, arm: 256 },
  chinese_armchair: { tris: 2800, diff: 1024, nor: 512, arm: 256 },
  chinese_chandelier: { tris: 6000, err: 0.02, diff: 1024, nor: 512, arm: 256 },
  ceramic_vase_01: { tris: 1600, diff: 512, nor: 256, arm: 0 },
  ceramic_vase_02: { tris: 1600, diff: 512, nor: 256, arm: 0 },
  ceramic_vase_04: { tris: 1600, diff: 512, nor: 256, arm: 0 },
  antique_ceramic_vase_01: { tris: 2400, diff: 1024, nor: 256, arm: 0 },
  brass_pot_01: { tris: 2400, diff: 512, nor: 256, arm: 256 },
  wooden_bowl_02: { tris: 1600, diff: 512, nor: 256, arm: 0 },
  wicker_basket_02: { tris: 5000, diff: 1024, nor: 512, arm: 0 },
  painted_wooden_shelves: { tris: 600, diff: 512, nor: 256, arm: 0 },
  planter_pot_clay: { tris: 1600, diff: 512, nor: 256, arm: 0 },
  wooden_candlestick: { tris: 1600, err: 0.03, diff: 512, nor: 256, arm: 0 },
  food_ginger_01: { tris: 1600, err: 0.03, diff: 512, nor: 256, arm: 0 },
  carved_wooden_plate: { tris: 1200, diff: 512, nor: 256, arm: 0 },
  ceramic_pot: { tris: 2400, diff: 512, nor: 256, arm: 0 },
  brass_vase_03: { tris: 2400, diff: 512, nor: 256, arm: 256 },
  potted_plant_04: { tris: 3000, err: 0.03, diff: 512, nor: 256, arm: 0 },
};

const tris = (root) => root.listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const report = {};

for (const [id, S] of Object.entries(SPEC)) {
  if (only && !only.split(',').includes(id)) continue;
  const dir = path.join(srcDir, id);
  const file = fs.readdirSync(dir).find((f) => f.endsWith('.gltf') || f.endsWith('.glb'));
  const doc = await io.read(path.join(dir, file));
  const root = doc.getRoot(), scene = root.listScenes()[0];
  // 1. 烘焙世界变换，全部网格挂到场景根下后合并
  const meshNodes = root.listNodes().filter((n) => n.getMesh());
  const seen = new Set();
  for (const n of meshNodes) {
    const m = n.getWorldMatrix();
    for (const p of n.getMesh().listPrimitives()) { if (seen.has(p)) continue; seen.add(p); transformPrimitive(p, m); }
  }
  for (const n of root.listNodes()) n.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  for (const n of meshNodes) { const par = n.getParentNode(); if (par) par.removeChild(n); scene.addChild(n); }
  const keep = meshNodes[0];
  for (const n of meshNodes.slice(1)) {
    for (const p of n.getMesh().listPrimitives()) keep.getMesh().addPrimitive(p);
    n.getMesh().dispose(); n.dispose();
  }
  for (const n of root.listNodes()) if (!n.getMesh() && n.listChildren().length === 0) n.dispose();
  keep.setName(id); keep.getMesh().setName(id);
  await doc.transform(dedup(), join({ keepNamed: false }), weld({ tolerance: 0.0001 }));
  const t0 = tris(root);
  if (t0 > S.tris) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: S.tris / t0, error: S.err ?? 0.004, lockBorder: false }));
  const t1 = tris(root);
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) for (const s of p.listSemantics()) if (!['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(s)) p.setAttribute(s, null);
  // 2. 贴图：按用途缩小；arm 为 0 时取平均粗糙度 / 金属度为常数
  let ti = 0;
  const kb = {};
  for (const mat of root.listMaterials()) {
    const roles = [['diff', mat.getBaseColorTexture()], ['nor', mat.getNormalTexture()], ['arm', mat.getMetallicRoughnessTexture()]];
    for (const [role, tex] of roles) {
      if (!tex) continue;
      const size = S[role];
      const src = `tmp_in_${ti}.${tex.getMimeType() === 'image/png' ? 'png' : 'jpg'}`;
      fs.writeFileSync(src, Buffer.from(tex.getImage()));
      if (role === 'arm' && !size) {
        const avg = execFileSync('python', ['-c', `from PIL import Image,ImageStat;im=Image.open('${src}').convert('RGB');s=ImageStat.Stat(im).mean;print(s[1]/255,s[2]/255)`]).toString().trim().split(/\s+/).map(Number);
        mat.setRoughnessFactor(+avg[0].toFixed(3)).setMetallicFactor(+avg[1].toFixed(3));
        mat.setMetallicRoughnessTexture(null);
        if (mat.getOcclusionTexture() === tex) mat.setOcclusionTexture(null);
        kb.arm = `const r ${avg[0].toFixed(2)} m ${avg[1].toFixed(2)}`;
        fs.unlinkSync(src); ti++;
        continue;
      }
      const dst = `tmp_out_${ti}.jpg`;
      execFileSync('python', [IMGCONV, src, dst, String(size), String(role === 'nor' ? 90 : 84)]);
      tex.setImage(new Uint8Array(fs.readFileSync(dst))).setMimeType('image/jpeg').setURI('');
      kb[role] = (fs.statSync(dst).size >> 10) + 'KB@' + size;
      fs.unlinkSync(src); fs.unlinkSync(dst); ti++;
    }
  }
  // 3. 底面中心归零（保留真实尺寸）
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { const a = p.getAttribute('POSITION'); const lo = a.getMin([]), hi = a.getMax([]); for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], lo[i]); mx[i] = Math.max(mx[i], hi[i]); } }
  const M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -(mn[0] + mx[0]) / 2, -mn[1], -(mn[2] + mx[2]) / 2, 1];
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) transformPrimitive(p, M);
  await doc.transform(prune(), unpartition());
  const out = path.join(outDir, id + '.glb');
  await io.write(out, doc);
  report[id] = { tris: [t0, t1], size: mx.map((v, i) => +(v - mn[i]).toFixed(3)), kb: fs.statSync(out).size >> 10, tex: kb, mats: root.listMaterials().length };
  console.log(id, JSON.stringify(report[id]));
}
fs.writeFileSync(path.join(outDir, '_report.json'), JSON.stringify(report, null, 1));
