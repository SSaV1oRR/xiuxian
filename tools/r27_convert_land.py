# 第二十七轮：「墨里终焉」演出的三维水墨山水——由 assets/skill/molizhongyan/mountain-and-river-scroll-black-and-white（Sketchfab 素材，只读）转换。
# 原素材是一整块「山水立体画卷」（约 104 × 94 × 26 单位）：Base（地面 + 全部山体，一个网格，黑白贴图集）、Outline（四圈描边壳，顶点色）、
# Rest（屋舍、船、桥、山石等 586 块，黑白贴图集）、Trees（16415 棵伞松，顶点色，共 49 万三角面）、BrushStrokes.001（521 片地面笔触，带透明的笔触贴图）。
# 转换：
#   1. Base 去掉平地（各顶点 z 都低于 GROUND 的面）→ 剩下四座山岛（左侧长岭、右下大岭、上方中岭、中间小岭；更小的碎块丢掉）；
#   2. Outline / Rest / Trees / BrushStrokes 的每个连通块按中心落在哪座山岛（XY 包围盒外扩 MARGIN 内）归到那座岛；远离山岛的（水面上的船、桥）丢掉；
#   3. Trees 只留 TREE_KEEP 比例（按块随机、固定种子；大树优先）——游戏里近、中两圈才放树；
#   4. 每座岛一个节点 isl<i>（原点在岛的包围盒底面中心），下面 mtn / line / rest / tree / brush 五个网格（没有的就不出）；
#   5. 只导出几何（位置、法线、UV、顶点色）——材质在游戏里另做（水墨色板、按距离入雾、由玩家处逐层显现）；
#   6. 贴图：BlackAndWhiteVersion.jpg 8192² → 4096² 灰度 JPEG；BrushStrokes.png 照原样（1024² RGBA）拷贝。
# 用法：blender -b --factory-startup --python tools/r27_convert_land.py -- <素材目录 mountain-and-river-scroll-black-and-white> <输出目录 assets/converted/molizhongyan>
import bpy, bmesh, sys, os, json, random, shutil
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
GROUND = 0.8          # 平地的高度门槛（单位）
MARGIN = 3.0          # 归属山岛时包围盒外扩
TREE_KEEP = 0.2       # 伞松留下的比例
MIN_ISLAND = 500      # 山岛最少三角面（更小的碎块丢掉）
os.makedirs(OUT, exist_ok=True)
random.seed(27)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=os.path.join(SRC, 'source', 'MountainAndRiverScroll.fbx'))
objs = {o.name: o for o in bpy.data.objects if o.type == 'MESH'}
print('OBJS', list(objs))


def islands_of(bm):
    # 面的连通块：[[face, …], …]
    bm.faces.ensure_lookup_table()
    seen, out = set(), []
    for f0 in bm.faces:
        if f0.index in seen:
            continue
        stack, fs = [f0], []
        seen.add(f0.index)
        while stack:
            f = stack.pop(); fs.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in seen:
                        seen.add(g.index); stack.append(g)
        out.append(fs)
    return out


def bbox(fs):
    vs = {v for f in fs for v in f.verts}
    mn = Vector((min(v.co.x for v in vs), min(v.co.y for v in vs), min(v.co.z for v in vs)))
    mx = Vector((max(v.co.x for v in vs), max(v.co.y for v in vs), max(v.co.z for v in vs)))
    return mn, mx


def world_bm(o):
    bm = bmesh.new(); bm.from_mesh(o.data); bm.transform(o.matrix_world)
    return bm


# ---------- 1. 山岛 ----------
bmB = world_bm(objs['Base'])
flat = [f for f in bmB.faces if max(v.co.z for v in f.verts) < GROUND]
bmesh.ops.delete(bmB, geom=flat, context='FACES')
isl = [fs for fs in islands_of(bmB) if sum(len(f.verts) - 2 for f in fs) >= MIN_ISLAND]
isl.sort(key=lambda fs: -sum(len(f.verts) - 2 for f in fs))
ISL = []
for i, fs in enumerate(isl):
    mn, mx = bbox(fs)
    ISL.append({'i': i, 'min': mn, 'max': mx, 'center': Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, 0.0)), 'faces': {f.index for f in fs}})
    print('ISLAND', i, [round(v, 1) for v in mn], [round(v, 1) for v in mx], sum(len(f.verts) - 2 for f in fs))


def owner(c):
    best, bd = None, 1e9
    for I in ISL:
        if I['min'].x - MARGIN <= c.x <= I['max'].x + MARGIN and I['min'].y - MARGIN <= c.y <= I['max'].y + MARGIN:
            d = (Vector((c.x, c.y, 0)) - I['center']).length
            if d < bd:
                best, bd = I['i'], d
    return best


# 新建一个网格物体：由某个源网格（世界坐标的 bmesh）里选中的面复制而来，原点挪到岛的底面中心
def make_obj(name, src_obj, bm_src, faces, center):
    keep = {f.index for f in faces}
    bm = bm_src.copy()
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.transform(__import__('mathutils').Matrix.Translation(-center))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    # 源网格的 UV / 顶点色图层名照旧（bmesh 复制时已带上）
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


roots = []
for I in ISL:
    e = bpy.data.objects.new(f"isl{I['i']}", None)
    bpy.context.scene.collection.objects.link(e)
    I['root'] = e
    roots.append(e)

# Base 的山体：就从去掉平地之后的那份网格里取（面的编号与找山岛时同一份——不能拿未删平地的原网格按编号取）
bmB.faces.ensure_lookup_table()
for I in ISL:
    o = make_obj(f"isl{I['i']}_mtn", objs['Base'], bmB, [bmB.faces[k] for k in I['faces']], I['center'])
    o.parent = I['root']
bmB.free()

# 其余几样：按连通块归属
stats = {}
for src, tag in [('Outline', 'line'), ('Rest', 'rest'), ('Trees', 'tree'), ('BrushStrokes.001', 'brush')]:
    if src not in objs:
        continue
    bm = world_bm(objs[src])
    parts = islands_of(bm)
    per = {I['i']: [] for I in ISL}
    dropped = 0
    for fs in parts:
        mn, mx = bbox(fs)
        c = (mn + mx) / 2
        k = owner(c)
        if k is None:
            dropped += 1; continue
        if tag == 'tree':
            tri = sum(len(f.verts) - 2 for f in fs)
            # 大树优先：面多的留下的机会高一点
            if random.random() > TREE_KEEP * (1.6 if tri > 40 else 1.0):
                dropped += 1; continue
        per[k].extend(fs)
    for I in ISL:
        fs = per[I['i']]
        if not fs:
            continue
        o = make_obj(f"isl{I['i']}_{tag}", objs[src], bm, fs, I['center'])
        o.parent = I['root']
    stats[tag] = {'parts': len(parts), 'dropped': dropped, 'kept_tris': {I['i']: sum(len(f.verts) - 2 for f in per[I['i']]) for I in ISL}}
    bm.free()
print('STATS', json.dumps(stats))

# 删掉原物体，只留新建的
for o in list(objs.values()):
    bpy.data.objects.remove(o, do_unlink=True)
# 法线：平滑着色（原素材的山体是平滑的低模）
for o in bpy.data.objects:
    if o.type == 'MESH':
        for p in o.data.polygons:
            p.use_smooth = True
        # 顶点色设成活动的（导出 ACTIVE）
        if o.data.color_attributes:
            o.data.color_attributes.active_color = o.data.color_attributes[0]

meta = {'islands': [], 'unit': 'model units (≈ m at scale 1)', 'ground_cut': GROUND, 'tree_keep': TREE_KEEP}
for I in ISL:
    meta['islands'].append({'name': f"isl{I['i']}", 'size': [round(I['max'].x - I['min'].x, 2), round(I['max'].y - I['min'].y, 2), round(I['max'].z, 2)],
                            'center_src': [round(I['center'].x, 2), round(I['center'].y, 2)],
                            'tris': {o.name.split('_', 1)[1]: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in I['root'].children}})
print('META', json.dumps(meta))

bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'land.glb'), export_format='GLB', export_materials='NONE', export_vertex_color='ACTIVE',
                          export_normals=True, export_texcoords=True, export_apply=False, export_yup=True, use_selection=False)
with open(os.path.join(OUT, 'land.json'), 'w', encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=False, indent=1)

# 贴图
img = bpy.data.images.load(os.path.join(SRC, 'textures', 'BlackAndWhiteVersion.jpg'))
img.scale(4096, 4096)
img.filepath_raw = os.path.join(OUT, 'land_bw.jpg')
img.file_format = 'JPEG'
sc = bpy.context.scene
sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 90; sc.render.image_settings.color_mode = 'BW'
img.save_render(os.path.join(OUT, 'land_bw.jpg'), scene=sc)
shutil.copyfile(os.path.join(SRC, 'textures', 'BrushStrokes.png'), os.path.join(OUT, 'land_brush.png'))
print('DONE')
