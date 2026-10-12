# 拆出 fantasy pack 的贴图预览，并按连通块把大网格分成单件（剑 5 把、药瓶 8 只），各自导出 glb
import bpy, bmesh, sys, os, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
src, outdir = argv[0], argv[1]
os.makedirs(outdir, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=src)
for im in bpy.data.images:
    if im.packed_file:
        p = os.path.join(outdir, im.name + '.png')
        im.filepath_raw = p
        im.file_format = 'PNG'
        im.save()
        print('saved', p)
o = [x for x in bpy.context.scene.objects if x.type == 'MESH'][0]
bpy.context.view_layer.objects.active = o
o.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='LOOSE')
bpy.ops.object.mode_set(mode='OBJECT')
parts = [x for x in bpy.context.scene.objects if x.type == 'MESH']
print('parts', len(parts))
# 按包围盒中心聚类：同一件物品的松散块（瓶塞、绳子）合在一起
info = []
for p in parts:
    bb = [p.matrix_world @ mathutils.Vector(c) for c in p.bound_box]
    mn = mathutils.Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    mx = mathutils.Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    info.append((p, mn, mx))
for p, mn, mx in sorted(info, key=lambda t: (round(t[1].z, 1), t[1].x))[:400]:
    print('PART', p.name, len(p.data.polygons), 'min', tuple(round(v, 3) for v in mn), 'max', tuple(round(v, 3) for v in mx))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(outdir, 'split.blend'))
