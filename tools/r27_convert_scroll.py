# 第二十七轮：「墨里终焉」的画卷——由 assets/skill/molizhongyan/long_paper_scroll_knot_tied.fbx（只读）取轴与绳结。
# 原素材是一幅挂轴（宽约 1.65 米、展开约 3.7 米）：卷着、绳结系在中间（第 1–20 帧）→ 绳结解开（约 20–50 帧，形态键逐帧）→ 下轴带着纸往下展开（50–160 帧）→ 再卷回。
# 游戏里画卷平铺在地上、比原物大得多（长 ≥ 8 个人高、宽 2.5–3.5 个人高）：纸面另按运行时的地形逐段生成（卷边、纸纹、墨线、画中山水、书法），
# 这里只取三样实物：
#   roller —— 下轴（bottom_rod：轴身 + 两端深色轴头），原点挪到轴心、轴沿 X；
#   topRod —— 上沿的细杆（rod_string），原点挪到轴心、轴沿 X；
#   knot   —— 系在卷上的绳结（WideKnot），取第 KNOT_FRAMES 各帧的形状做成形态键（morph target），游戏里按时间在相邻两帧之间插值：解开、松落；
#             原点挪到卷轴的轴心（与 roller 同一处，卷着时绳结正好套在卷上）。
# 坐标：原素材 Z 朝上、纸往 −Z 展开、Y 是纸的厚度方向；导出时不转换——游戏里按「轴沿 X、纸往 −Z 走、厚度朝 +Y」自己摆。
# 用法：blender -b --factory-startup --python tools/r27_convert_scroll.py -- <fbx> <输出目录 assets/converted/molizhongyan>
import bpy, sys, os, json
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
FBX, OUT = argv[0], argv[1]
KNOT_FRAMES = [1, 22, 26, 30, 34, 38, 42, 46, 50, 56, 64, 74]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX)
sc = bpy.context.scene
src = {o.name: o for o in bpy.data.objects}
dg = bpy.context.evaluated_depsgraph_get


def frame_mesh(o, f):
    sc.frame_set(f)
    oe = o.evaluated_get(dg())
    me = oe.to_mesh()
    pts = [oe.matrix_world @ v.co for v in me.vertices]
    oe.to_mesh_clear()
    return pts


def bounds(pts):
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx


# 卷着时（第 1 帧）的轴心：下轴的包围盒中心
rod1 = frame_mesh(src['bottom_rod'], 1)
mn, mx = bounds(rod1)
axis = (mn + mx) / 2
radius = max(mx.y - mn.y, mx.z - mn.z) / 2
print('ROD', [round(v, 4) for v in mn], [round(v, 4) for v in mx], 'axis', [round(v, 4) for v in axis], 'r', round(radius, 4))
top1 = frame_mesh(src['rod_string'], 1)
tmn, tmx = bounds(top1)
taxis = (tmn + tmx) / 2
print('TOP', [round(v, 4) for v in tmn], [round(v, 4) for v in tmx])
paper1 = frame_mesh(src['Scroll'], 1)
pmn, pmx = bounds(paper1)
print('PAPER1', [round(v, 4) for v in pmn], [round(v, 4) for v in pmx])
paper160 = frame_mesh(src['Scroll'], 160)
qmn, qmx = bounds(paper160)
print('PAPER160', [round(v, 4) for v in qmn], [round(v, 4) for v in qmx])


def bake(name, o, f, origin):
    # 取第 f 帧的形状做一个新网格（顶点、面、UV、材质），原点挪到 origin
    sc.frame_set(f)
    oe = o.evaluated_get(dg())
    me = bpy.data.meshes.new_from_object(oe)
    me.transform(oe.matrix_world)
    me.transform(Matrix.Translation(-origin))
    for k in list(me.attributes):
        pass
    ob = bpy.data.objects.new(name, me)
    sc.collection.objects.link(ob)
    return ob


roller = bake('roller', src['bottom_rod'], 1, axis)
toprod = bake('topRod', src['rod_string'], 1, taxis)
knot = bake('knot', src['WideKnot'], KNOT_FRAMES[0], axis)
# 绳结的形态键：各帧形状（顶点数不变时才加）
base_n = len(knot.data.vertices)
knot.shape_key_add(name='Basis', from_mix=False)
for f in KNOT_FRAMES[1:]:
    pts = frame_mesh(src['WideKnot'], f)
    if len(pts) != base_n:
        print('KNOT frame', f, 'vertex count differs', len(pts), base_n); continue
    sk = knot.shape_key_add(name=f'f{f:03d}', from_mix=False)
    for i, p in enumerate(pts):
        sk.data[i].co = p - axis
for n in list(src):
    bpy.data.objects.remove(src[n], do_unlink=True)
for o in (roller, toprod, knot):
    for p in o.data.polygons:
        p.use_smooth = True
meta = {'axis_src': [round(v, 4) for v in axis], 'roller_r': round(radius, 4), 'roller_len': round(mx.x - mn.x, 4), 'paper_w': round(pmx.x - pmn.x, 4),
        'paper_len_open': round(-(qmn.z - pmx.z), 4), 'top_axis_src': [round(v, 4) for v in taxis], 'knot_frames': KNOT_FRAMES, 'fps': sc.render.fps,
        'materials': {o.name: [m.name for m in o.data.materials] for o in (roller, toprod, knot)}}
print('META', json.dumps(meta))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'scroll_raw.glb'), export_format='GLB', export_materials='EXPORT', export_normals=True, export_texcoords=True,
                          export_morph=True, export_morph_normal=False, export_yup=False, export_apply=False, use_selection=False, export_animations=False)
with open(os.path.join(OUT, 'scroll.json'), 'w', encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=False, indent=1)
print('DONE')
