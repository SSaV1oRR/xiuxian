# 第二十四轮：检查 boss30 的 glb（Blender 后台）：网格、材质、包围盒、连通块、骨骼与动作；渲染四个方向的预览
# 用法：blender -b --factory-startup --python inspect_boss.py -- <glb> <输出目录>
import bpy, sys, os, json, math
import bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
objs = list(bpy.data.objects)
info = {'objects': [], 'materials': {}, 'armatures': [], 'actions': [a.name for a in bpy.data.actions]}
mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9))
tot_v = tot_f = 0
for o in objs:
    rec = {'name': o.name, 'type': o.type, 'parent': o.parent.name if o.parent else None, 'loc': [round(x, 3) for x in o.matrix_world.translation], 'scale': [round(x, 4) for x in o.matrix_world.to_scale()]}
    if o.type == 'MESH':
        me = o.data
        rec['verts'] = len(me.vertices); rec['faces'] = len(me.polygons)
        rec['mats'] = [m.name if m else None for m in me.materials]
        rec['uv'] = [l.name for l in me.uv_layers]
        rec['colors'] = [a.name for a in me.color_attributes]
        tot_v += len(me.vertices); tot_f += len(me.polygons)
        for v in o.bound_box:
            w = o.matrix_world @ Vector(v)
            mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z))); mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
        # 连通块数
        bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
        seen = set(); comps = 0
        for v in bm.verts:
            if v.index in seen: continue
            comps += 1; stack = [v]; seen.add(v.index)
            while stack:
                x = stack.pop()
                for e in x.link_edges:
                    y = e.other_vert(x)
                    if y.index not in seen: seen.add(y.index); stack.append(y)
        rec['components'] = comps
        bm.free()
    if o.type == 'ARMATURE':
        info['armatures'].append({'name': o.name, 'bones': [b.name for b in o.data.bones]})
    info['objects'].append(rec)
for m in bpy.data.materials:
    nodes = [n.type + (':' + n.image.name if getattr(n, 'image', None) else '') for n in (m.node_tree.nodes if m.use_nodes else [])]
    info['materials'][m.name] = {'blend': getattr(m, 'blend_method', None), 'nodes': nodes[:12]}
info['bbox'] = {'min': [round(x, 3) for x in mn], 'max': [round(x, 3) for x in mx], 'size': [round(x, 3) for x in (mx - mn)]}
info['total'] = {'verts': tot_v, 'faces': tot_f, 'images': [(i.name, list(i.size)) for i in bpy.data.images]}
json.dump(info, open(os.path.join(OUT, 'boss30_inspect.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('OBJECTS', len(objs), 'MESHES', sum(1 for o in objs if o.type == 'MESH'), 'VERTS', tot_v, 'FACES', tot_f, 'BBOX', info['bbox'])

# 预览：正、侧、背、俯视四张（Workbench，材质色）
scn = bpy.context.scene
scn.render.engine = 'BLENDER_WORKBENCH'
scn.display.shading.light = 'STUDIO'
scn.display.shading.color_type = 'VERTEX'
scn.render.resolution_x = 640; scn.render.resolution_y = 800
c = (mn + mx) / 2; size = (mx - mn).length
cam_data = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_data); scn.collection.objects.link(cam); scn.camera = cam
cam_data.type = 'ORTHO'; cam_data.ortho_scale = size * 0.75; cam_data.clip_start = size * 0.01; cam_data.clip_end = size * 10
for name, d in [('front', Vector((0, -1, 0))), ('side', Vector((1, 0, 0))), ('back', Vector((0, 1, 0))), ('top', Vector((0, 0, 1)))]:
    cam.location = c + d * size * 2
    look = c - cam.location
    cam.rotation_euler = look.to_track_quat('-Z', 'Y' if name != 'top' else 'Y').to_euler()
    scn.render.filepath = os.path.join(OUT, f'boss30_{name}.png')
    bpy.ops.render.render(write_still=True)
print('DONE')
