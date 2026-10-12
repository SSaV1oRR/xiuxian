# 第二十七轮：山水素材的地面（Base 里 z 近 0 的平地）去掉之后，剩下的山体分成几个岛；统计各岛的范围、高度、面数。
# 用法：blender -b --factory-startup --python tools/r27_land_islands.py -- <MountainAndRiverScroll.fbx> [ground_z]
import bpy, sys, bmesh, json

args = sys.argv[sys.argv.index('--') + 1:]
gz = float(args[1]) if len(args) > 1 else 0.25
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=args[0])
o = bpy.data.objects['Base']
bm = bmesh.new(); bm.from_mesh(o.data); bm.transform(o.matrix_world)
flat = [f for f in bm.faces if max(v.co.z for v in f.verts) < gz]
print('FLAT', len(flat), 'of', len(bm.faces))
bmesh.ops.delete(bm, geom=flat, context='FACES')
bm.faces.ensure_lookup_table()
seen = set(); isl = []
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
    isl.append({'tris': sum(len(f.verts) - 2 for f in fs), 'min': [round(x, 1) for x in mn], 'max': [round(x, 1) for x in mx]})
isl.sort(key=lambda p: -p['tris'])
print('ISLANDS', len(isl), json.dumps(isl[:30]))
print('SMALL', sum(1 for p in isl if p['tris'] < 50), sum(p['tris'] for p in isl if p['tris'] < 50))
