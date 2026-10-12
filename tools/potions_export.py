# 药瓶：从拆分后的 fantasy pack 里取出 8 只药瓶，各自减面到约 2400 面，原点放到瓶底中心，导出 glb（贴图随附）
import bpy, sys, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.open_mainfile(filepath=argv[0])
out = argv[1]
sc = bpy.context.scene
bottles = []
for o in list(sc.objects):
    if o.type != 'MESH':
        continue
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    if max(v.z for v in bb) < -0.45:
        bottles.append((min(v.x for v in bb), o))
    else:
        bpy.data.objects.remove(o, do_unlink=True)
bottles.sort(key=lambda t: t[0])
for i, (_, o) in enumerate(bottles):
    o.name = f'potion_{i}'
    o.data.name = f'potion_{i}'
    bpy.context.view_layer.objects.active = o
    for x in sc.objects: x.select_set(x == o)
    m = o.modifiers.new('dec', 'DECIMATE')
    m.ratio = min(1.0, 2400 / max(1, len(o.data.polygons)))
    bpy.ops.object.modifier_apply(modifier='dec')
    # 原点：瓶底中心
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    c = mathutils.Vector(((min(v.x for v in bb) + max(v.x for v in bb)) / 2, (min(v.y for v in bb) + max(v.y for v in bb)) / 2, min(v.z for v in bb)))
    sc.cursor.location = c
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    o.location = (i * 0.4, 0, 0)
    print('BOTTLE', o.name, len(o.data.polygons), [round(v, 3) for v in o.dimensions])
for x in sc.objects: x.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_image_format='AUTO', export_texcoords=True, export_normals=True, export_tangents=False, export_materials='EXPORT', export_yup=True)
print('EXPORTED', out)
