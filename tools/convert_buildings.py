# 宗门建筑模型转换（第十轮）。原始素材 assets/buildings/01.fbx 不改动，输出到 assets/converted/buildings/
#   blender -b --factory-startup --python tools/convert_buildings.py -- --stage dump   --tex <目录>    导出内嵌贴图（原尺寸 PNG）
#   python tools/prepare_building_textures.py <dump 目录> assets/converted/buildings/tex 1024                 处理贴图（去招牌字、青灰瓦、朱红）
#   blender -b --factory-startup --python tools/convert_buildings.py -- --stage export [--preview <目录>]    拆分、清理、碰撞烘焙、导出
# 素材说明：3ds Max 导出的一条“古城”建筑带（3d66 模型网导出，作者提供），原单位为毫米、FBX 头记为英寸，
#   Blender 导入后每米 = 25.4 个单位；22 个网格（两个共用构件网格横跨全部建筑）、21 张 2048² 贴图（含烘焙光影的手绘贴图）。
# 输出：buildings.glb —— 每栋一个根节点 bld_<键>（米制、Y 向上、正面朝 +Z、落地基点为底面中心），共享贴图；
#       buildings.json —— 各栋尺寸、台基面高度、0.5 米碰撞网格（可走面高度 / 阻挡）
import bpy, bmesh, os, sys, json, math, base64, struct
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'assets', 'buildings', '01.fbx')
OUT = os.path.join(ROOT, 'assets', 'converted', 'buildings')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(k, d=None): return argv[argv.index(k) + 1] if k in argv else d
STAGE = arg('--stage', 'export')
K = 1 / 25.4

# 各栋：原素材中的米制范围（x0, y0, x1, y1）、绕竖轴转角（使主入口朝 -Y，即游戏里的 +Z）、说明
MODELS = {
    'D': ((-31.0, -59.4, 5.4, -23.0), 0, '大殿院（重檐攒尖正殿、前出抱厦、院前一对八角楼）'),
    'A': ((-24.6, -107.9, -0.2, -83.5), 0, '十字脊楼阁（两层、正中望楼，前后对称）'),
    'C': ((-36.0, -81.8, -15.8, -61.6), 0, '高台殿（红漆高台、前出踏道、团龙壁）'),
    'F': ((-9.3, 15.8, 11.7, 35.2), 0, '重楼配殿（踏道上二层殿、两侧挑廊）'),
    'G': ((-7.2, 36.5, 10.8, 58.7), 0, '四层楼阁（逐层平座、檐口、窗格）'),
    'H': ((-32.5, 81.6, -17.3, 102.2), -90, '高台楼（架空底层、二层回廊、屋顶双亭）'),
    'X': ((-32.6, 13.0, -17.0, 35.0), -90, '曲尺院舍（白粉墙底层、后进三层楼）'),
    'Et': ((-20.5, -21.5, -6.5, -7.5), 0, '三层望楼（取自校场门楼的中楼，四角斜出的长木刺与门楼院墙不取）'),
}
# 需剔除的杂件（原素材米制坐标的立方体 x0, y0, x1, y1, z0, z1；面的中心落在其中即删）：
#   D 院中的八只木箱（原「粮草站」的货箱）与院角招牌的立框；A 院角赌场招牌的柱头小檐。
# 原模型是逐四边形分开的“面片汤”（11 万多个互不相连的小片），无法按连通块取物件，只能按位置剔除
DROP = {
    'D': [(-22.6, -29.6, -18.8, -26, 0.91, 4.3), (-4.3, -29.6, -0.3, -25.7, 0.91, 4.3), (-28, -41.8, -24.4, -38.2, 0.91, 4.3),
          (-21.6, -43.5, -18.3, -40.2, 0.91, 4.3), (-19.4, -43.8, -16.4, -39.8, 0.91, 4.3), (-2.3, -43.8, 1.7, -39.85, 0.91, 4.3),
          (-9.8, -47.7, -7.0, -43.9, 0.91, 4.3), (-9.7, -50.1, -7.1, -46.55, 0.91, 4.3), (-1.9, -57, 2.9, -54.6, 0.95, 6.8)],
    'A': [(-4.3, -106.7, -0.7, -104.9, 0.7, 4.6)],
}
# 按高度分段的方形包络（中心 x, y；[(此高度以下, 半边宽), ...]）：包络外的面删去。
# Et 取自校场门楼：四角斜出的长木刺、门楼前的院墙与铺地都穿过塔身附近，只能按塔身各层的实际外缘（台基、墙身、腰檐、平座、顶檐）裁出
ENVELOPE = {
    'Et': (-13.0, -14.25, [(0.72, 0.0), (1.3, 5.9), (6.2, 5.6), (7.8, 6.0), (10.3, 4.4), (12.8, 6.9), (15.4, 4.6), (99, 6.0)]),
}
# 包络的西侧（木刺所在一侧）另收紧：[(此高度以下, 半边宽)]
ENVELOPE_W = {'Et': [(7.8, 5.7), (12.8, 6.45)]}
# 招牌字所在贴图矩形（原 2048 像素）：用到这些区域的小构件里，赌场立牌（001）、军机处牌（008）与立在地上的招牌整件删除；
# 挂在檐下的匾（009、006、012 的竖匾，002 的横匾）已在贴图里改写为问道殿、丹殿、青岚、凌云阁，保留
SIGN_RECTS = {
    '001': [(515, 1532, 940, 1778), (760, 1336, 905, 1500)],
    '008': [(1058, 562, 1252, 938)],
    '006': [(572, 1124, 688, 1378)],
    '009': [(312, 802, 568, 1308)],
    '012': [(1522, 922, 1708, 1328)],
}
SIGN_DELETE_ALWAYS = ('001', '008', '006', '009', '012')     # 检查结果：这几处都是院角立柱上的招牌，连柱整件删
SIGN_OBJECTS = ('6b4b3820', 'f7732ae9')      # 律师招牌与招牌框（城市街景的现代招牌）


def load():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=SRC)
    for o in list(bpy.data.objects):
        if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)


def tex_key(mat):
    if mat and mat.node_tree:
        for n in mat.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image: return n.image.name[-3:]
    return None


if STAGE == 'dump':
    outd = arg('--tex')
    os.makedirs(outd, exist_ok=True)
    load()
    for im in bpy.data.images:
        if im.size[0] == 0: continue
        im.filepath_raw = os.path.join(outd, im.name[-3:] + '.png'); im.file_format = 'PNG'; im.save()
        print('DUMP', im.name[-3:])
    sys.exit(0)

# ---------------- export ----------------
load()
TEXDIR = arg('--tex', os.path.join(OUT, 'tex'))
PREVIEW = arg('--preview')
# 合并为一个网格（世界坐标、米制、最低点为 0）；面的材质改为按贴图编号命名的新材质
objs = list(bpy.data.objects)
src_mat_key = {}
for o in objs:
    for s in o.material_slots:
        src_mat_key[s.material.name] = (tex_key(s.material), o.name[:8])
# 招牌对象：直接删
for o in list(objs):
    if o.name[:8] in SIGN_OBJECTS: bpy.data.objects.remove(o, do_unlink=True)
objs = list(bpy.data.objects)
# 每个对象各自的材质 → 新材质
newmats = {}
DUP = {'004': '003', '021': '015'}          # 同一张图的两份（见 prepare_building_textures.py），面并到前者的材质
def get_mat(key):
    key = DUP.get(key, key)
    if key in newmats: return newmats[key]
    m = bpy.data.materials.new('bt_' + (key or 'plain'))
    m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.82
    if key and os.path.exists(os.path.join(TEXDIR, key + '.jpg')):     # 未用到的几张（B 栋、招牌）没有处理后的贴图，这些面也不会导出
        img = bpy.data.images.load(os.path.join(TEXDIR, key + '.jpg'))
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img
        nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = (0.24, 0.12, 0.12, 1)
    newmats[key] = m
    return m
for o in objs:
    for s in o.material_slots:
        s.material = get_mat(src_mat_key[s.material.name][0])
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
ob.data.transform(ob.matrix_world); ob.matrix_world = Matrix.Identity(4)
ob.data.transform(Matrix.Scale(K, 4))
zmin = min(v.co.z for v in ob.data.vertices)
ob.data.transform(Matrix.Translation((0, 0, -zmin)))
me = ob.data
mat_keys = [m.name[3:] if m else None for m in me.materials]

# 连通块
bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
uvl = bm.loops.layers.uv.active
comp_of = [-1] * len(bm.faces); comps = []
for f0 in bm.faces:
    if comp_of[f0.index] >= 0: continue
    cid = len(comps); stack = [f0]; comp_of[f0.index] = cid; fl = []
    while stack:
        f = stack.pop(); fl.append(f.index)
        for e in f.edges:
            for g in e.link_faces:
                if comp_of[g.index] < 0: comp_of[g.index] = cid; stack.append(g)
    comps.append(fl)
print('COMPONENTS', len(comps))
def in_rect(key, u, v):
    for (x0, y0, x1, y1) in SIGN_RECTS.get(key, []):
        px, py = (u % 1.0) * 2048, (1 - (v % 1.0)) * 2048
        if x0 <= px <= x1 and y0 <= py <= y1: return True
    return False
cinfo = []
for fl in comps:
    lo = [1e9] * 3; hi = [-1e9] * 3; c = [0, 0, 0]; A = 0; sign = False
    for fi in fl:
        f = bm.faces[fi]; a = f.calc_area(); cc = f.calc_center_median(); A += a
        for k in range(3): c[k] += cc[k] * a
        for v in f.verts:
            for k in range(3): lo[k] = min(lo[k], v.co[k]); hi[k] = max(hi[k], v.co[k])
        key = mat_keys[f.material_index]
        if key in SIGN_RECTS and not sign:
            uu = sum(l[uvl].uv.x for l in f.loops) / len(f.loops); vv = sum(l[uvl].uv.y for l in f.loops) / len(f.loops)
            if in_rect(key, uu, vv): sign = True
    c = [x / max(A, 1e-9) for x in c]
    diag = math.dist(lo, hi)
    ground = (hi[2] - lo[2] < 0.12 and lo[2] < 0.3)
    skey = None
    if sign:
        skey = next((mat_keys[bm.faces[fi].material_index] for fi in fl if mat_keys[bm.faces[fi].material_index] in SIGN_RECTS), None)
    # 立在地上的招牌（立牌、招幌）：整件删；挂在檐下的匾（贴图已改写）保留
    standing = lo[2] < 0.6 and hi[2] - lo[2] > 1.2
    kill = sign and diag < 7.0 and (skey in SIGN_DELETE_ALWAYS or standing)
    if sign and diag < 7.0:
        print('SIGNCOMP', skey, 'c', [round(x, 1) for x in c], 'lo z', round(lo[2], 2), 'hi z', round(hi[2], 2), 'size', [round(hi[k] - lo[k], 2) for k in range(3)], 'DELETE' if kill else 'keep')
    cinfo.append({'lo': lo, 'hi': hi, 'c': c, 'diag': diag, 'ground': ground, 'sign': kill})
# 招牌的立柱、底座：整件落在招牌投影（外扩 0.5 米）之内、顶不高过招牌的小构件
zones = [(i['lo'][0] - 0.5, i['lo'][1] - 0.5, i['hi'][0] + 0.5, i['hi'][1] + 0.5, i['hi'][2] + 0.6) for i in cinfo if i['sign']]
posts = 0
for i in cinfo:
    if i['sign'] or i['ground'] or i['diag'] > 8: continue
    for (zx0, zy0, zx1, zy1, ztop) in zones:
        if zx0 <= i['lo'][0] and i['hi'][0] <= zx1 and zy0 <= i['lo'][1] and i['hi'][1] <= zy1 and i['hi'][2] <= ztop:
            i['sign'] = True; posts += 1; break
print('SIGNS deleted', sum(1 for i in cinfo if i['sign']), '(posts', posts, ') GROUND', sum(1 for i in cinfo if i['ground']))

meta = {'source': 'assets/buildings/01.fbx', 'unit': 'm', 'up': '+Y', 'front': '+Z', 'models': {}}
model_objs = []
for key, (box, rot, desc) in MODELS.items():
    x0, y0, x1, y1 = box
    keep = set()
    for cid, ci in enumerate(cinfo):
        if ci['ground'] or ci['sign'] or ci['diag'] > 60: continue
        if x0 <= ci['c'][0] <= x1 and y0 <= ci['c'][1] <= y1: keep.update(comps[cid])
    dropped = 0
    # 剔除杂件：面的全部顶点都在剔除框内才删（大块铺地三角面跨出框外，不会被误删）
    for (dx0, dy0, dx1, dy1, dz0, dz1) in DROP.get(key, []):
        for fi in list(keep):
            if all(dx0 <= v.co.x <= dx1 and dy0 <= v.co.y <= dy1 and dz0 <= v.co.z <= dz1 for v in bm.faces[fi].verts): keep.discard(fi); dropped += 1
    if key in ENVELOPE:
        ecx, ecy, bands = ENVELOPE[key]
        for fi in list(keep):
            cc = bm.faces[fi].calc_center_median()
            half = next(h for (zt, h) in bands if cc.z < zt)
            if cc.x < ecx and key in ENVELOPE_W:
                hw = next((h for (zt, h) in ENVELOPE_W[key] if cc.z < zt), None)
                if hw is not None: half = min(half, hw)
            if max(abs(cc.x - ecx), abs(cc.y - ecy)) > half: keep.discard(fi); dropped += 1
    if dropped: print('DROP', key, dropped)
    nb = bm.copy(); nb.faces.ensure_lookup_table()
    kill = [f for f in nb.faces if f.index not in keep]
    bmesh.ops.delete(nb, geom=kill, context='FACES')
    loose = [v for v in nb.verts if not v.link_faces]
    bmesh.ops.delete(nb, geom=loose, context='VERTS')
    # 只留用到的材质槽：先在 bmesh 里改面的材质序号再写网格（不能用 materials.clear()——它会把所有面的材质序号清零）
    used = sorted({f.material_index for f in nb.faces})
    remap = {old: new for new, old in enumerate(used)}
    for f in nb.faces: f.material_index = remap[f.material_index]
    nm = bpy.data.meshes.new('bld_' + key)
    nb.to_mesh(nm); nb.free()
    for i in used: nm.materials.append(me.materials[i])
    o = bpy.data.objects.new('bld_' + key, nm); bpy.context.scene.collection.objects.link(o)
    # 居中、转向、落地
    vs = [v.co for v in nm.vertices]
    cx = (min(v.x for v in vs) + max(v.x for v in vs)) / 2; cy = (min(v.y for v in vs) + max(v.y for v in vs)) / 2
    nm.transform(Matrix.Translation((-cx, -cy, 0)))
    if rot: nm.transform(Matrix.Rotation(math.radians(rot), 4, 'Z'))
    z0 = min(v.co.z for v in nm.vertices)
    nm.transform(Matrix.Translation((0, 0, -z0)))
    nm.validate(); nm.update()
    model_objs.append(o)
    vs = [v.co for v in nm.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))); hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    # ---------- 碰撞网格：0.5 米一格。每格自上而下取全部交点；可站的面 = 近水平（|法线 z| > 0.5）、上方净空 ≥ 1.9 米。
    #   从网格外圈的地面（0 米）出发逐格扩展（每步高差 ≤ 0.45 米，略低于角色的抬步上限 0.46），只有走得到的面才算地面：
    #   踏道逐级可上，台基侧壁上不去，楼上的平座、屋顶走不到。扩展到的面若在其上 0.45 / 0.95 / 1.45 米处 0.2 米内有构件
    #   （墙、柱、栏杆、门扇）即为阻挡格，不再向外扩展；走不到的格（殿内、墙心、高台内部）也算阻挡
    bb = bmesh.new(); bb.from_mesh(nm); bvh = BVHTree.FromBMesh(bb)
    R = 0.5
    gx0, gy0 = math.floor(lo.x / R) * R - R, math.floor(lo.y / R) * R - R
    nx, ny = int(math.ceil((hi.x - gx0) / R)) + 2, int(math.ceil((hi.y - gy0) / R)) + 2
    N = nx * ny
    down = Vector((0, 0, -1))
    cands = [None] * N
    for j in range(ny):
        for i in range(nx):
            cx, cy = gx0 + (i + 0.5) * R, gy0 + (j + 0.5) * R
            hits = []; o0 = Vector((cx, cy, hi.z + 1))
            for _ in range(120):
                loc, nrm, idx, dist = bvh.ray_cast(o0, down)
                if loc is None: break
                hits.append((loc.z, abs(nrm.z))); o0 = loc + down * 0.003
            hits.append((0.0, 1.0))
            cs = []
            for z, nz in hits:
                if nz <= 0.5 or z > 12.0: continue
                above = [hz for hz, _ in hits if hz > z + 0.02]
                if not above or min(above) - z >= 1.9: cs.append(z)
            cands[j * nx + i] = sorted(set(round(z, 3) for z in cs))
    def obstructed(i, j, z):
        # 0.55 米以下的高差是台阶（角色可一步跨上），从 0.7 米查起
        cx, cy = gx0 + (i + 0.5) * R, gy0 + (j + 0.5) * R
        for hh in (0.7, 1.1, 1.5):
            loc, nrm, idx, dist = bvh.find_nearest(Vector((cx, cy, z + hh)), 0.2)
            if loc is not None: return True
        return False
    from collections import deque
    def blocked_between(i, j, a, b, z):
        p0 = Vector((gx0 + (i + 0.5) * R, gy0 + (j + 0.5) * R, 0)); d = Vector(((a - i) * R, (b - j) * R, 0))
        L = d.length; d.normalize()
        for hh in (0.7, 1.1, 1.5):
            p0.z = z + hh
            loc, nrm, idx, dist = bvh.ray_cast(p0, d, L)
            if loc is not None: return True
        return False
    # 自带底座的面高（游戏里底座面与台地齐平，底座以下埋入）：外缘一圈（距包围盒 1.5 米内）≤ 1.5 米的最高可站面的中位数
    ring = []
    for j in range(ny):
        for i in range(nx):
            x_, y_ = gx0 + (i + 0.5) * R, gy0 + (j + 0.5) * R
            if lo.x + 1.5 < x_ < hi.x - 1.5 and lo.y + 1.5 < y_ < hi.y - 1.5: continue
            if not (lo.x - 0.01 <= x_ <= hi.x + 0.01 and lo.y - 0.01 <= y_ <= hi.y + 0.01): continue
            cs = [c for c in cands[j * nx + i] if c <= 1.5]
            if cs: ring.append(cs[-1])
    ring.sort()
    base = ring[len(ring) // 2] if ring else 0.0
    if base < 0.08: base = 0.0
    # 起点：外缘一圈中，与底座面或地面同高的格
    F = [None] * N; Bk = [1] * N
    q = deque()
    for j in range(ny):
        for i in range(nx):
            x_, y_ = gx0 + (i + 0.5) * R, gy0 + (j + 0.5) * R
            if lo.x + 1.5 < x_ < hi.x - 1.5 and lo.y + 1.5 < y_ < hi.y - 1.5: continue
            k = j * nx + i
            ok = [c for c in cands[k] if abs(c - base) <= 0.15 or c <= 0.05]
            if not ok: continue
            c = max(ok)
            if not obstructed(i, j, c): F[k] = c; Bk[k] = 0; q.append((i, j))
    while q:
        i, j = q.popleft(); z = F[j * nx + i]
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            a, b = i + di, j + dj
            if not (0 <= a < nx and 0 <= b < ny): continue
            k = b * nx + a
            if F[k] is not None: continue
            ok = [c for c in cands[k] if abs(c - z) <= 0.45]
            if not ok: continue
            c = min(ok, key=lambda c: abs(c - z))
            # 两格中心之间在身高范围内有构件（墙板、门扇、窗格——薄墙正落在两格之间时近旁检查查不到）则不通
            if blocked_between(i, j, a, b, max(z, c)): continue
            F[k] = c
            if obstructed(a, b, c): Bk[k] = 1; continue
            Bk[k] = 0; q.append((a, b))
    # 阻挡的高矮：走得到的阻挡格在其面上 2.2 / 3.0 米处仍有构件为高（墙、柱、门扇），否则为矮（栏杆、矮墙、台沿）；走不到的格为高
    Tall = [0] * N
    for j in range(ny):
        for i in range(nx):
            k = j * nx + i
            if not Bk[k]: continue
            if F[k] is None: Tall[k] = 2; continue
            cx, cy = gx0 + (i + 0.5) * R, gy0 + (j + 0.5) * R
            Tall[k] = 1
            for hh in (2.2, 3.0):
                loc, nrm, idx, dist = bvh.find_nearest(Vector((cx, cy, F[k] + hh)), 0.3)
                if loc is not None: Tall[k] = 2; break
    # 走不到的格：记最高的可站面（供相机与落脚参考），阻挡
    for k in range(N):
        if F[k] is None: F[k] = cands[k][-1] if cands[k] else 0.0
    bb.free()
    F = [int(round(z * 100)) for z in F]
    plinth = base
    tris = sum(len(p.vertices) - 2 for p in nm.polygons)
    # 写进 JSON：网格坐标换成游戏坐标（X = x，Z = -y）
    meta['models'][key] = {
        'desc': desc, 'tris': tris,
        'size': [round(hi.x - lo.x, 2), round(hi.z - lo.z, 2), round(hi.y - lo.y, 2)],
        'bbox': [round(lo.x, 2), 0, round(-hi.y, 2), round(hi.x, 2), round(hi.z, 2), round(-lo.y, 2)],
        'plinth': round(plinth, 2),          # 自带底座面高：放置时底座面对齐台地面（模型下沉这么多）
        'grid': {'x0': round(gx0, 3), 'z0': round(-(gy0 + ny * R), 3), 'res': R, 'nx': nx, 'nz': ny,
                 # 行按游戏 Z 由小到大（Blender y 由大到小）；f 为可走面高度（厘米，int16）
                 'f': base64.b64encode(struct.pack('<%dh' % (nx * ny), *[F[(ny - 1 - jj) * nx + i] for jj in range(ny) for i in range(nx)])).decode(),
                 # b：0 可走、1 矮阻挡（栏杆、矮墙）、2 高阻挡（墙、柱、门扇、室内）
                 'b': base64.b64encode(bytes(Tall[(ny - 1 - jj) * nx + i] if Bk[(ny - 1 - jj) * nx + i] else 0 for jj in range(ny) for i in range(nx))).decode()},
    }
    print('MODEL', key, 'tris', tris, 'size', meta['models'][key]['size'], 'plinth', plinth, 'grid', nx, ny, 'blocked', sum(Bk))
bm.free()
bpy.data.objects.remove(ob, do_unlink=True)

# 预览渲染（检查拆分、招牌、贴图）
if PREVIEW:
    import mathutils
    os.makedirs(PREVIEW, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x, sc.render.resolution_y = 900, 640
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.78, 0.82, 0.86, 1)
    sun = bpy.data.objects.new('psun', bpy.data.lights.new('psun', 'SUN')); sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(50), 0, math.radians(30)); sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('pcam', bpy.data.cameras.new('pcam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.clip_end = 1000
    for o in model_objs:
        for p in model_objs: p.hide_render = (p != o)
        vs = [v.co for v in o.data.vertices]
        ext = max(max(v.x for v in vs) - min(v.x for v in vs), max(v.y for v in vs) - min(v.y for v in vs), max(v.z for v in vs))
        for nmv, (dx, dy, dz) in {'front': (0.55, -1.25, 0.45), 'back': (-0.6, 1.2, 0.5)}.items():
            cam.location = (dx * ext, dy * ext, dz * ext + 2)
            d = Vector((0, 0, ext * 0.3)) - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
            sc.render.filepath = os.path.join(PREVIEW, o.name + '_' + nmv + '.png'); bpy.ops.render.render(write_still=True)

# 导出
os.makedirs(OUT, exist_ok=True)
for o in bpy.data.objects: o.select_set(o in model_objs)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'buildings.glb'), export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_texcoords=True, export_normals=True, export_materials='EXPORT', export_image_format='AUTO', export_animations=False)
json.dump(meta, open(os.path.join(OUT, 'buildings.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('EXPORTED', os.path.getsize(os.path.join(OUT, 'buildings.glb')) // 1024, 'KB')
