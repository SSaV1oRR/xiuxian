# 第十九轮：回血葫芦的模型（项目作者放进 assets/figure/accessories/gourd_bottle.glb，Fab 导出的 FBX 转换件）→ 游戏用的小件。
# 原件 30,064 个三角形、14 张 4096² PNG（38.9 MB；贴图全部解开要占近 900 MB 显存）。葫芦在人身上只有约 20 厘米高，所以：
#   · 葫芦身高缩到 0.19 米（与程序生成的那只一样：腰在口下约 9.5 厘米，左手正好握在腰上）；
#   · 原点放在葫芦口（瓶颈顶面的中心），+Y 由葫芦底指向葫芦口——腰间、手中两个挂点按这个约定挂；
#   · 各件按面数减面（葫芦身保留原样，木塞、绳子是密的圆柱，减到一两成）；
#   · 贴图缩到 1024²、JPEG（底色、粗糙度 / 金属度、法线），在约 20 厘米的物件上看不出差别。
# 原件不改动。用法：blender -b --factory-startup --python tools/r19_convert_gourd.py -- <原 glb> <输出 glb> [贴图边长=1024] [葫芦身高=0.19]
import bpy, sys, mathutils

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
TEX = int(argv[2]) if len(argv) > 2 else 1024
BODY_H = float(argv[3]) if len(argv) > 3 else 0.19
# 各件保留的面数比例（按网格名里的关键字）
KEEP = {'goard main': 1.0, 'cork': 0.15, 'top string': 0.2, 'bot string': 0.2, 'string guard': 1.0}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
sc = bpy.context.scene
meshes = [o for o in sc.objects if o.type == 'MESH']
# 拍平层级：清父级、保持世界变换，再把变换写进网格
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.make_single_user(object=True, obdata=True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in [o for o in sc.objects if o.type != 'MESH']:
    bpy.data.objects.remove(o, do_unlink=True)

# 葫芦身：量底、口与瓶颈中心（顶上 3% 高度内的顶点）
body = next(o for o in meshes if 'goard main' in o.name)
ws = [v.co.copy() for v in body.data.vertices]
z0, z1 = min(w.z for w in ws), max(w.z for w in ws)
top = [w for w in ws if w.z > z1 - (z1 - z0) * 0.03]
cx, cy = sum(w.x for w in top) / len(top), sum(w.y for w in top) / len(top)
k = BODY_H / (z1 - z0)
print('BODY', round(z1 - z0, 4), 'mouth center', round(cx, 4), round(cy, 4), 'scale', round(k, 4))
M = mathutils.Matrix.Scale(k, 4) @ mathutils.Matrix.Translation((-cx, -cy, -z1))
tris0 = tris1 = 0
for o in meshes:
    o.data.transform(M)
    o.data.update()
    o.data.calc_loop_triangles(); n0 = len(o.data.loop_triangles); tris0 += n0
    r = next((v for key, v in KEEP.items() if key in o.name), 0.3)
    if r < 1:
        mod = o.modifiers.new('dec', 'DECIMATE'); mod.ratio = r
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
    o.data.calc_loop_triangles(); n1 = len(o.data.loop_triangles); tris1 += n1
    print('MESH', o.name, n0, '->', n1)
print('TRIS', tris0, '->', tris1)

# 贴图缩小
for im in bpy.data.images:
    if im.size[0] > TEX or im.size[1] > TEX:
        im.scale(TEX, TEX)
print('IMAGES', len(bpy.data.images), 'at', TEX)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_image_format='JPEG', export_jpeg_quality=90, export_materials='EXPORT')
print('WROTE', OUT)
