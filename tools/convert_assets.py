# 新素材转换（Blender 5.x 后台运行，原始素材不改动，输出到 assets/converted/）
#   blender -b --factory-startup --python tools/convert_assets.py -- dragon|temple|trees|mountain|all
# dragon  ：assets/dragon/wyvern_animated/source/Wyvern animated.fbx → converted/dragon/dragon.glb（蒙皮 + 全部动作，材质不含贴图，贴图由 prepare_textures.py 生成）
# temple  ：assets/temple/temple-usd-workflow-under-zongmen/source/p_112_engrave.fbx → converted/temple/abyss_temple.glb（贴图重新链接、缩到 2048；南侧开门洞）
# trees   ：assets/tree/stylizedtree_pack.blend → converted/trees/trees.glb（去掉底座、减面为近景 / 中景两级，贴图 1024）+ trees.json
# mountain：assets/mountain/tori_gate_enviroment.blend 中的山体网格 → converted/mountain/stamp_*.png（16 位高度，R 高位 G 低位）+ stamps.json
import bpy, bmesh, sys, os, math, json, re
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
A = os.path.join(ROOT, 'assets')
OUT = os.path.join(A, 'converted')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['all']
what = set(argv) if 'all' not in argv else {'dragon', 'temple', 'trees', 'mountain'}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def select_only(objs):
    for o in bpy.context.scene.objects: o.select_set(False)
    for o in objs: o.select_set(True)
    if objs: bpy.context.view_layer.objects.active = objs[0]


def export_glb(path, objs, images='JPEG', anim=False, quality=88):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # 原始网格里残留的顶点色层（多为全黑的默认层）会被 three.js 乘到贴图上，导出前去掉
    for o in objs:
        if o.type == 'MESH':
            for a in list(o.data.color_attributes): o.data.color_attributes.remove(a)
    select_only(objs)
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
              export_texcoords=True, export_normals=True, export_materials='EXPORT', export_image_format=images,
              export_jpeg_quality=quality, export_animations=anim, export_skins=anim)
    if anim:
        kw.update(export_animation_mode='ACTIONS', export_force_sampling=True, export_optimize_animation_size=True)
    bpy.ops.export_scene.gltf(**kw)
    print('EXPORTED', path, os.path.getsize(path) // 1024, 'KB')


def relink(texdir):
    files = [os.path.join(texdir, f) for f in os.listdir(texdir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    key = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
    for im in bpy.data.images:
        if im.source != 'FILE' or im.packed_file: continue
        base = key(os.path.splitext(os.path.basename(bpy.path.abspath(im.filepath)))[0]) or key(im.name)
        best = None
        for f in files:
            k = key(os.path.splitext(os.path.basename(f))[0])
            if k == base or (len(k) >= 16 and k[:24] == base[:24]):
                if best is None or f.lower().endswith(('.jpg', '.jpeg')): best = f
        if best:
            im.filepath = best; im.reload(); print('RELINK', im.name, '->', os.path.basename(best))


def shrink_images(maxsize):
    for im in bpy.data.images:
        if im.source != 'FILE' or im.size[0] == 0: continue
        w, h = im.size
        if max(w, h) > maxsize:
            s = maxsize / max(w, h); im.scale(int(w * s), int(h * s)); print('SCALE', im.name, w, '->', int(w * s))


# ---------------- 护宗双龙（共用飞龙基础模型）----------------
def dragon():
    reset()
    bpy.ops.import_scene.fbx(filepath=os.path.join(A, 'dragon/wyvern_animated/source/Wyvern animated.fbx'), use_anim=True)
    arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    # 动作改为简短名称；同名重复的旧版动作加后缀保留，便于在引擎里对比挑选
    names = {}
    for a in list(bpy.data.actions):
        n = a.name.split('|')[-1].strip().replace(' ', '_').replace('.', '_')
        n = {'idol': 'idle', 'idol_001': 'idle_b', 'flaping': 'flap', 'take_off': 'takeoff', 'walk_001': 'walk_c'}.get(n, n)
        if a.name.count('|') == 1 and n in ('flap', 'takeoff', 'walk'): n += '_b'
        while n in names: n += '_x'
        names[n] = a.name; a.name = n
    print('ACTIONS', names)
    for o in meshes:
        print('MESH', o.name, 'parent', o.parent.name if o.parent else None, o.parent_type, o.parent_bone, 'mats', [s.material.name for s in o.material_slots if s.material])
    export_glb(os.path.join(OUT, 'dragon/dragon.glb'), [arm] + meshes, images='NONE', anim=True)
    json.dump({'actions': names}, open(os.path.join(OUT, 'dragon/dragon.json'), 'w'), ensure_ascii=False, indent=1)


# ---------------- 幽渊秘境主体（地下神殿）----------------
def temple():
    reset()
    src = os.path.join(A, 'temple/temple-usd-workflow-under-zongmen')
    bpy.ops.import_scene.fbx(filepath=os.path.join(src, 'source/p_112_engrave.fbx'))
    relink(os.path.join(src, 'textures'))
    shrink_images(2048)
    # 南侧（Blender -Y，导出后为 +Z）开门洞：外墙环（TEMPLE.009）与底部回廊环（TEMPLE.003 下半）在门洞扇区内去面
    half = math.radians(7.5)
    for name, zmax in (('TEMPLE.009', 9.0), ('TEMPLE.003', 2.2)):
        o = bpy.data.objects.get(name)
        if not o: continue
        bm = bmesh.new(); bm.from_mesh(o.data)
        kill = []
        for f in bm.faces:
            c = o.matrix_world @ f.calc_center_median()
            ang = math.atan2(c.x, -c.y)          # 0 = 正南（-Y）
            if abs(ang) < half and c.z < zmax and math.hypot(c.x, c.y) > 14: kill.append(f)
        bmesh.ops.delete(bm, geom=kill, context='FACES')
        bm.to_mesh(o.data); bm.free(); o.data.update()
        print('DOOR', name, 'removed', len(kill), 'faces')
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    monks = [o for o in objs if o.name.startswith('monk')]
    # 僧像单独导出一尊（原尺度约 0.5 米，在引擎里放大成跪坐石像）
    keep = monks[0]
    for m in monks[1:]: bpy.data.objects.remove(m, do_unlink=True)
    keep.location = (0, 0, 0); keep.rotation_euler = (0, 0, 0)
    export_glb(os.path.join(OUT, 'temple/monk.glb'), [keep])
    bpy.data.objects.remove(keep, do_unlink=True)
    export_glb(os.path.join(OUT, 'temple/abyss_temple.glb'), [o for o in bpy.context.scene.objects if o.type == 'MESH'])


# ---------------- 树木 ----------------
TREES = {   # 名称: (近景三角形, 中景三角形)
    'PineTree_03': (4200, 900), 'PineTree_04': (4200, 900), 'PineTree_06': (4200, 900), 'PineTree_01': (3600, 800), 'PineTree_02': (3600, 800),
    'OakTree_02': (4200, 900), 'OakTree_03': (4200, 900), 'OakTree_04': (4200, 900), 'OakTree_05': (3600, 800),
    'JacarandaTree_01': (4000, 900), 'JacarandaTree_02': (4000, 900), 'WillowTree_01': (5000, 1200),
    'TreeStump_01': (2400, 600), 'TreeStump_02': (2400, 600), 'TreeStump_03': (2400, 600),
}


def strip_base(o):
    # 去掉树下自带的草皮 / 石台底座：低于 0.45 米、且离树干较远的面
    me = o.data
    vs = [o.matrix_world @ v.co for v in me.vertices]
    sl = [v for v in vs if 0.9 < v.z < 1.8] or vs
    cx = sum(v.x for v in sl) / len(sl); cy = sum(v.y for v in sl) / len(sl)
    ds = sorted(math.hypot(v.x - cx, v.y - cy) for v in sl)
    r = ds[int(len(ds) * 0.8)] if ds else 0.5
    lim = max(1.7 * r, 0.9)
    bm = bmesh.new(); bm.from_mesh(me)
    kill = [f for f in bm.faces if max((o.matrix_world @ v.co).z for v in f.verts) < 0.45 and
            min(math.hypot((o.matrix_world @ v.co).x - cx, (o.matrix_world @ v.co).y - cy) for v in f.verts) > lim]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(me); bm.free(); me.update()
    return cx, cy, r, len(kill)


def decimated_copy(o, tris, suffix):
    c = o.copy(); c.data = o.data.copy(); c.name = o.name + suffix
    bpy.context.scene.collection.objects.link(c)
    n = sum(len(p.vertices) - 2 for p in c.data.polygons)
    if n > tris:
        m = c.modifiers.new('dec', 'DECIMATE'); m.ratio = tris / n; m.use_collapse_triangulate = True
        with bpy.context.temp_override(object=c, active_object=c, selected_objects=[c]):
            bpy.ops.object.modifier_apply(modifier='dec')
    return c


def trees():
    bpy.ops.wm.open_mainfile(filepath=os.path.join(A, 'tree/stylizedtree_pack.blend'))
    for im in bpy.data.images:
        if im.size[0] > 1024: im.scale(1024, 1024)
    info, out = {}, []
    for name, (t0, t1) in TREES.items():
        o = bpy.data.objects.get(name)
        if not o: print('NO TREE', name); continue
        o.location = (0, 0, 0)
        bpy.context.view_layer.update()
        cx, cy, r, k = strip_base(o)
        # 以树干为原点
        me = o.data
        for v in me.vertices: v.co.x -= cx; v.co.y -= cy
        me.update()
        lod0, lod1 = decimated_copy(o, t0, '_0'), decimated_copy(o, t1, '_1')
        vs = [v.co for v in o.data.vertices]
        h = max(v.z for v in vs)
        crown = [v for v in vs if v.z > h * 0.45] or vs
        cr = max(math.hypot(v.x, v.y) for v in crown)
        cb = min((v.z for v in vs if math.hypot(v.x, v.y) > r * 2.2), default=h * 0.4)
        info[name] = {'height': round(h, 2), 'crownR': round(cr, 2), 'crownBottom': round(cb, 2), 'trunkR': round(r, 2),
                      'tris': [sum(len(p.vertices) - 2 for p in x.data.polygons) for x in (lod0, lod1)], 'baseFacesRemoved': k}
        print('TREE', name, info[name])
        out += [lod0, lod1]
    for o in list(bpy.context.scene.objects):
        if o not in out: bpy.data.objects.remove(o, do_unlink=True)
    export_glb(os.path.join(OUT, 'trees/trees.glb'), out, quality=85)
    json.dump(info, open(os.path.join(OUT, 'trees/trees.json'), 'w'), indent=1)


# ---------------- 山体高度印章 ----------------
def mountain():
    bpy.ops.wm.open_mainfile(filepath=os.path.join(A, 'mountain/tori_gate_enviroment.blend'))
    dg = bpy.context.evaluated_depsgraph_get()
    cand = [o for o in bpy.context.scene.objects if o.type == 'MESH' and (o.name == 'mountain' or o.name.startswith('Landscape'))]
    # Landscape 由若干块拼成：只取包围盒最大的两块山体
    land = sorted([o for o in cand if o.name.startswith('Landscape')], key=lambda o: -(o.dimensions.x * o.dimensions.y * o.dimensions.z))[:2]
    picks = [o for o in cand if o.name == 'mountain'] + land
    os.makedirs(os.path.join(OUT, 'mountain'), exist_ok=True)
    meta, N = {}, 257
    for i, o in enumerate(picks):
        ev = o.evaluated_get(dg); me = ev.to_mesh()
        bm = bmesh.new(); bm.from_mesh(me); bm.transform(o.matrix_world)
        bvh = BVHTree.FromBMesh(bm)
        xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]; zs = [v.co.z for v in bm.verts]
        x0, x1, y0, y1, z0, z1 = min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)
        H = [[None] * N for _ in range(N)]
        for j in range(N):
            for k in range(N):
                p = Vector((x0 + (x1 - x0) * k / (N - 1), y0 + (y1 - y0) * j / (N - 1), z1 + 10))
                hit = bvh.ray_cast(p, Vector((0, 0, -1)))
                H[j][k] = hit[0].z if hit[0] is not None else None
        # 底面：取边缘一圈的低值作为“地面”，山体高度相对它
        edge = [H[j][k] for j in range(N) for k in range(N) if (j in (0, N - 1) or k in (0, N - 1)) and H[j][k] is not None]
        base = sorted(edge)[len(edge) // 10] if edge else z0
        top = max(v for row in H for v in row if v is not None)
        name = 'stamp_%d' % i
        img = bpy.data.images.new(name, N, N, alpha=True)
        px = [0.0] * (N * N * 4)
        for j in range(N):
            for k in range(N):
                v = H[j][k]; t = 0 if v is None else max(0.0, (v - base) / max(top - base, 1e-6))
                q = int(round(t * 65535)); idx = ((N - 1 - j) * N + k) * 4
                px[idx] = (q >> 8) / 255; px[idx + 1] = (q & 255) / 255; px[idx + 2] = 0; px[idx + 3] = 1
        img.pixels = px
        img.filepath_raw = os.path.join(OUT, 'mountain', name + '.png'); img.file_format = 'PNG'; img.save()
        meta[name] = {'source': o.name, 'sizeX': round(x1 - x0, 2), 'sizeZ': round(y1 - y0, 2), 'height': round(top - base, 2), 'n': N}
        print('STAMP', name, meta[name])
        bm.free(); ev.to_mesh_clear()
    json.dump(meta, open(os.path.join(OUT, 'mountain/stamps.json'), 'w'), indent=1)


for w in ('dragon', 'temple', 'trees', 'mountain'):
    if w in what:
        print('=== CONVERT', w); globals()[w]()
print('CONVERT_DONE')
