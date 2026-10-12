# 第二十七轮：山水素材的分块（每个网格按连通块拆开，统计各块的包围盒与三角面数），决定怎么分成近、中、远几组摆放。
# 用法：blender -b --factory-startup --python tools/r27_land_parts.py -- <MountainAndRiverScroll.fbx>
import bpy, sys, bmesh, json
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=args[0])
out = {}
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    bm = bmesh.new(); bm.from_mesh(o.data); bm.transform(o.matrix_world)
    bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    seen = set(); parts = []
    for f0 in bm.faces:
        if f0.index in seen: continue
        stack = [f0]; seen.add(f0.index); fs = []
        while stack:
            f = stack.pop(); fs.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in seen: seen.add(g.index); stack.append(g)
        vs = {v for f in fs for v in f.verts}
        mn = [min(v.co[i] for v in vs) for i in range(3)]; mx = [max(v.co[i] for v in vs) for i in range(3)]
        tris = sum(len(f.verts) - 2 for f in fs)
        parts.append({'tris': tris, 'min': [round(x, 1) for x in mn], 'max': [round(x, 1) for x in mx]})
    parts.sort(key=lambda p: -p['tris'])
    big = [p for p in parts if p['tris'] >= 200]
    out[o.name] = {'parts': len(parts), 'tris': sum(p['tris'] for p in parts), 'big': big[:40], 'small_tris': sum(p['tris'] for p in parts if p['tris'] < 200),
                   'color_attrs': [a.name for a in o.data.color_attributes], 'uv': [l.name for l in o.data.uv_layers]}
    bm.free()
print('PARTS', json.dumps(out))
