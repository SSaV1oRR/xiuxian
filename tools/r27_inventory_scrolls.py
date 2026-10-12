# 第二十七轮：清点 assets/skill/molizhongyan 下的两个 FBX（Blender 后台导入后实测：物体、网格、包围盒、UV、材质与贴图、骨架与动作、形态键）。
# 用法：blender -b --factory-startup --python tools/r27_inventory_scrolls.py -- <fbx> [<fbx> …]
import bpy, sys, json
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out = {}
for path in args:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=path)
    info = {'objects': [], 'actions': [], 'images': []}
    for o in bpy.data.objects:
        e = {'name': o.name, 'type': o.type, 'parent': o.parent.name if o.parent else None,
             'loc': [round(v, 4) for v in o.location], 'rot': [round(v, 4) for v in o.rotation_euler], 'scale': [round(v, 4) for v in o.scale]}
        if o.type == 'MESH':
            me = o.data
            ws = [o.matrix_world @ Vector(c) for c in o.bound_box]
            mn = [min(p[i] for p in ws) for i in range(3)]; mx = [max(p[i] for p in ws) for i in range(3)]
            e.update({'verts': len(me.vertices), 'faces': len(me.polygons), 'tris': sum(len(p.vertices) - 2 for p in me.polygons),
                      'bbox_min': [round(v, 4) for v in mn], 'bbox_max': [round(v, 4) for v in mx], 'size': [round(mx[i] - mn[i], 4) for i in range(3)],
                      'uv_layers': [l.name for l in me.uv_layers], 'materials': [m.name if m else None for m in me.materials],
                      'shape_keys': [k.name for k in me.shape_keys.key_blocks] if me.shape_keys else [],
                      'vertex_groups': len(o.vertex_groups), 'modifiers': [m.type for m in o.modifiers]})
            if me.uv_layers:
                uv = me.uv_layers[0].data
                us = [d.uv[0] for d in uv]; vs = [d.uv[1] for d in uv]
                e['uv_range'] = [round(min(us), 4), round(max(us), 4), round(min(vs), 4), round(max(vs), 4)]
        if o.type == 'ARMATURE':
            e['bones'] = len(o.data.bones); e['bone_names'] = [b.name for b in o.data.bones][:40]
        if o.animation_data and o.animation_data.action:
            e['action'] = o.animation_data.action.name
        info['objects'].append(e)
    for a in bpy.data.actions:
        info['actions'].append({'name': a.name, 'range': [round(a.frame_range[0], 2), round(a.frame_range[1], 2)], 'slots': len(getattr(a, 'slots', [])), 'layers': len(getattr(a, 'layers', []))})      # Blender 5：分层动作，没有 a.fcurves
    for m in bpy.data.materials:
        tex = []
        if m.use_nodes:
            for n in m.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image:
                    links = [l.to_socket.name + '@' + l.to_node.name for l in n.outputs[0].links] + [l.to_socket.name + '@' + l.to_node.name for l in n.outputs[1].links]
                    tex.append({'image': n.image.name, 'file': n.image.filepath, 'size': list(n.image.size), 'to': links})
        info.setdefault('materials', []).append({'name': m.name, 'blend': getattr(m, 'blend_method', None), 'textures': tex})
    for im in bpy.data.images:
        info['images'].append({'name': im.name, 'file': im.filepath, 'size': list(im.size)})
    info['scene_fps'] = bpy.context.scene.render.fps
    out[path] = info
print('INVENTORY', json.dumps(out, ensure_ascii=False))
