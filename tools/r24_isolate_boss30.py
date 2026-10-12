# 第二十四轮：把 boss30 里的人物（灰烬之魂）与场景笔画分开——按连通块（一笔一块）的中心与包围盒聚类；渲染人物的正 / 侧 / 背
# 用法：blender -b --factory-startup --python isolate_boss.py -- <glb> <输出目录> [半径] [高度上限]
import bpy, sys, os, json, math
import bmesh
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
R = float(argv[2]) if len(argv) > 2 else 1100
ZMAX = float(argv[3]) if len(argv) > 3 else 2900
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
comps = []          # (obj, verts idx list, centroid, bbmin, bbmax, nverts)
for o in meshes:
    me = o.data
    mw = o.matrix_world
    co = np.array([tuple(mw @ v.co) for v in me.vertices])
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    seen = np.zeros(len(bm.verts), bool)
    for v in bm.verts:
        if seen[v.index]: continue
        stack = [v]; seen[v.index] = True; ids = []
        while stack:
            x = stack.pop(); ids.append(x.index)
            for e in x.link_edges:
                y = e.other_vert(x)
                if not seen[y.index]: seen[y.index] = True; stack.append(y)
        p = co[ids]
        comps.append((o.name, ids, p.mean(0), p.min(0), p.max(0), len(ids)))
    bm.free()
print('COMPONENTS', len(comps))
# 人物中心：按顶点数加权的 (x, y) 直方图里最密的格子（格宽 250）
cent = np.array([c[2] for c in comps]); w = np.array([c[5] for c in comps], float)
H, xe, ye = np.histogram2d(cent[:, 0], cent[:, 1], bins=[np.arange(-6000, 5000, 250), np.arange(-6000, 5000, 250)], weights=w)
i, j = np.unravel_index(H.argmax(), H.shape)
cx, cy = (xe[i] + xe[i + 1]) / 2, (ye[j] + ye[j + 1]) / 2
# 细化：取离 (cx, cy) 600 内的加权平均
d = np.hypot(cent[:, 0] - cx, cent[:, 1] - cy)
m = d < 600
cx, cy = float((cent[m, 0] * w[m]).sum() / w[m].sum()), float((cent[m, 1] * w[m]).sum() / w[m].sum())
print('CENTER', round(cx, 1), round(cy, 1))
# 选：中心离轴 R 内、且整块的水平包围盒离轴不超过 R*1.6、最高不超过 ZMAX
sel = []
for k, c in enumerate(comps):
    _, ids, ce, mn, mx, n = c
    dc = math.hypot(ce[0] - cx, ce[1] - cy)
    far = max(math.hypot(mn[0] - cx, mn[1] - cy), math.hypot(mx[0] - cx, mx[1] - cy), math.hypot(mn[0] - cx, mx[1] - cy), math.hypot(mx[0] - cx, mn[1] - cy))
    if dc < R and far < R * 1.8 and mx[2] < ZMAX:
        sel.append(k)
selv = sum(comps[k][5] for k in sel)
allp = np.concatenate([np.array([comps[k][3], comps[k][4]]) for k in sel])
print('SELECTED', len(sel), 'of', len(comps), 'verts', selv, 'bbox', allp.min(0).round(1).tolist(), allp.max(0).round(1).tolist())
# 各材质里选中多少
from collections import Counter
print('BY_MESH', Counter(comps[k][0] for k in sel))
json.dump({'center': [cx, cy], 'R': R, 'ZMAX': ZMAX, 'sel': [[comps[k][0], comps[k][1][0], comps[k][5], [round(x, 1) for x in comps[k][2]], [round(x, 1) for x in comps[k][3]], [round(x, 1) for x in comps[k][4]]] for k in sel]},
          open(os.path.join(OUT, 'figure_sel.json'), 'w'), indent=0)
# 删掉没选中的顶点，渲染人物
keep = {}
for k in sel: keep.setdefault(comps[k][0], set()).update(comps[k][1])
for o in meshes:
    ks = keep.get(o.name, set())
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    dele = [v for v in bm.verts if v.index not in ks]
    bmesh.ops.delete(bm, geom=dele, context='VERTS')
    bm.to_mesh(o.data); bm.free()
scn = bpy.context.scene
scn.render.engine = 'BLENDER_WORKBENCH'
scn.display.shading.light = 'STUDIO'; scn.display.shading.color_type = 'VERTEX'
scn.render.resolution_x = 700; scn.render.resolution_y = 900
mn = allp.min(0); mx = allp.max(0)
c = Vector(((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2)); size = float(np.linalg.norm(mx - mn))
cam_data = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_data); scn.collection.objects.link(cam); scn.camera = cam
cam_data.type = 'ORTHO'; cam_data.ortho_scale = size * 0.85; cam_data.clip_start = size * 0.01; cam_data.clip_end = size * 10
for name, dv in [('front', Vector((0, -1, 0))), ('left', Vector((1, 0, 0))), ('back', Vector((0, 1, 0))), ('right', Vector((-1, 0, 0))), ('top', Vector((0, 0, 1)))]:
    cam.location = c + dv * size * 2
    cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scn.render.filepath = os.path.join(OUT, f'figure_{name}.png')
    bpy.ops.render.render(write_still=True)
print('DONE')
