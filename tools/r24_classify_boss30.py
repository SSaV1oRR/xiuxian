# 第二十四轮：把人物的笔画分成 身体 / 黑剑（Boss 的武器）/ 火焰大剑（不用）/ 零散笔画（不用），按类别着色渲染，核对分得对不对
# 用法：blender -b --factory-startup --python classify_boss.py -- <glb> <figure_sel.json> <输出目录>
import bpy, sys, os, json, math
import bmesh
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, SEL, OUT = argv[0], argv[1], argv[2]
sel = json.load(open(SEL))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = {o.name: o for o in bpy.data.objects if o.type == 'MESH'}
coords = {n: np.array([tuple(o.matrix_world @ v.co) for v in o.data.vertices]) for n, o in meshes.items()}
# 每块：顶点下标
comps = []
for name, v0, n, ce, mn, mx in sel['sel']:
    o = meshes[name]
    comps.append({'mesh': name, 'v0': v0})
bms = {}
for n, o in meshes.items():
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table(); bms[n] = bm
for c in comps:
    bm = bms[c['mesh']]; ids = {c['v0']}; stack = [bm.verts[c['v0']]]
    while stack:
        x = stack.pop()
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in ids: ids.add(y.index); stack.append(y)
    c['ids'] = np.array(sorted(ids)); p = coords[c['mesh']][c['ids']]
    c['p'] = p; c['ce'] = p.mean(0); c['mn'] = p.min(0); c['mx'] = p.max(0)

def pca_line(P):
    m = P.mean(0); u, s, vt = np.linalg.svd(P - m, full_matrices=False); return m, vt[0]
def dist_line(P, m, d):
    v = P - m; t = v @ d; return np.linalg.norm(v - np.outer(t, d), axis=1), t

FIST_L = np.array([-440.0, -80.0, 950.0])
# 火焰大剑：质心高于 1650、离头部（x≈0, y≈−60）水平远于 380 的块，拟合一条轴线
gs_seed = [c for c in comps if c['ce'][2] > 1650 and math.hypot(c['ce'][0], c['ce'][1] + 60) > 380]
GP = np.concatenate([c['p'] for c in gs_seed]); gm, gd = pca_line(GP)
# 黑剑：质心低于 800、x < −450 的块（剑身下段）+ 左拳附近，拟合轴线
bs_seed = [c for c in comps if c['ce'][2] < 800 and c['ce'][0] < -450]
BP = np.concatenate([c['p'] for c in bs_seed]); bm_, bd = pca_line(BP)
if bd @ (bm_ - FIST_L) < 0: bd = -bd                  # 方向：拳 → 剑尖
print('GS axis', gm.round(0), gd.round(3), 'BS axis', bm_.round(0), bd.round(3))
cls = {'body': [], 'black': [], 'great': [], 'stray': []}
for c in comps:
    P = c['p']
    dg, tg = dist_line(P, gm, gd)
    db, tb = dist_line(P, bm_, bd)
    tfist = (P - FIST_L) @ bd
    horiz = math.hypot(c['ce'][0], c['ce'][1] + 100)
    near_b = ((db < 75) & (tfist > -80)).mean()
    if dg.max() < 140 and P[:, 2].min() > 1550: cls['great'].append(c)
    elif dg.mean() < 220 and c['ce'][2] > 1700 and 220 < c['ce'][0] < 480: cls['great'].append(c)      # 大剑的护手与握柄（右拳上方）
    elif c['mesh'].startswith('All_Fire') and dg.max() < 330 and c['ce'][2] > 1600 and math.hypot(c['ce'][0], c['ce'][1] + 60) > 300: cls['great'].append(c)
    elif near_b > 0.9 and (P @ bd).max() - (P @ bd).min() > 40 and c['ce'][2] < 1000: cls['black'].append(c)
    elif db.max() < 150 and abs(float(np.linalg.svd(P - P.mean(0), full_matrices=False)[2][0] @ bd)) > 0.95 and np.ptp(P @ bd) > 100 and tfist.max() > 0 and tfist.min() > -300:
        cls['black'].append(c)                                                                   # 沿剑轴的长笔画：剑脊、握柄、握柄上的光线（伸到拳后面）
    elif horiz > 950 or (c['ce'][1] < -700 and c['ce'][2] < 1600): cls['stray'].append(c)
    else: cls['body'].append(c)
for k, v in cls.items(): print('CLASS', k, len(v), 'verts', int(sum(len(c['ids']) for c in v)))
# 黑剑的范围：沿轴的最小 / 最大（拳 → 剑尖），粗细
if cls['black']:
    P = np.concatenate([c['p'] for c in cls['black']]); t = (P - FIST_L) @ bd; d, _ = dist_line(P, bm_, bd)
    print('BLACK along', round(float(t.min()), 1), round(float(t.max()), 1), 'radius p95', round(float(np.percentile(d, 95)), 1))
json.dump({k: [[c['mesh'], int(c['v0'])] for c in v] for k, v in cls.items()} | {'gs': [gm.tolist(), gd.tolist()], 'bs': [bm_.tolist(), bd.tolist()], 'fist': FIST_L.tolist()},
          open(os.path.join(OUT, 'classes.json'), 'w'))
# 按类别着色：给每个网格加一个顶点颜色层（身体保留原色，黑剑绿、大剑蓝、零散红）
col = {'black': (0.1, 0.9, 0.2, 1), 'great': (0.2, 0.4, 1, 1), 'stray': (1, 0.1, 0.1, 1)}
keepids = {n: set() for n in meshes}
for k, v in cls.items():
    for c in v: keepids[c['mesh']].update(c['ids'].tolist())
for n, o in meshes.items():
    me = o.data
    attr = me.color_attributes.active_color
    if attr is None: continue
    for k, v in cls.items():
        if k == 'body': continue
        for c in v:
            if c['mesh'] != n: continue
            ids = set(c['ids'].tolist())
            if attr.domain == 'POINT':
                for i in ids: attr.data[i].color = col[k]
            else:
                for li, l in enumerate(me.loops):
                    if l.vertex_index in ids: attr.data[li].color = col[k]
for n, o in meshes.items():
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keepids[n]], context='VERTS')
    bm.to_mesh(o.data); bm.free()
scn = bpy.context.scene
scn.render.engine = 'BLENDER_WORKBENCH'
scn.display.shading.light = 'STUDIO'; scn.display.shading.color_type = 'VERTEX'
scn.render.resolution_x = 1000; scn.render.resolution_y = 1200
c0 = Vector((sel['center'][0], sel['center'][1], 1100))
cam_data = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_data); scn.collection.objects.link(cam); scn.camera = cam
cam_data.type = 'ORTHO'; cam_data.ortho_scale = 2600; cam_data.clip_start = 10; cam_data.clip_end = 100000
for name, d in {'front': Vector((0, 1, 0)), 'side': Vector((1, 0, 0)), 'top': Vector((0, 0, 1))}.items():
    cam.location = c0 + d * 6000
    cam.rotation_euler = (c0 - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scn.render.filepath = os.path.join(OUT, f'cls_{name}.png')
    bpy.ops.render.render(write_still=True)
print('DONE')
