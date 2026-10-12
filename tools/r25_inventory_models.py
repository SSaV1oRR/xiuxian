# 第二十五轮：凤凰 / 雷龙 / 玩家角色的动作实测 → models.json（只读素材，输出写到命令行给的路径）
#   凤凰：assets/boss/phoenix-bird/source/fly.fbx（Python 导入器 + C++ 导入器各一次）与 assets/converted/phoenix/phoenix.glb
#   雷龙：assets/boss/chinese_dragon_loong/source/RYUISM/8030/8030.fbx（两种导入器）与 assets/converted/loong/loong.glb
#   角色：assets/converted/figure/cultivator.glb
#   每个动作：名字、导入后场景 fps、帧范围、时长、关键帧采样间隔（原生帧率）、骨骼数、首尾帧差（最大局部旋转差 / 骨头位置差）、
#   根骨与身体主骨（骨盆类）的平移（净位移、最大偏离、路程；Y 向上坐标 = glTF 约定：Blender (x, y, z) → (x, z, −y)）。
#   另外直接解析文件本身：FBX 的 GlobalSettings（TimeMode / CustomFrameRate）、各 AnimationStack 的起止时间、关键帧时间间隔；
#   glb 的 JSON（动画名、通道数、采样器输入的 min / max = three.js 里的时长、关键帧数、间隔、平移通道挂在哪些节点上）。
# 用法：blender -b --factory-startup --python tools/r25_inventory_models.py -- <assets 目录> <输出 json>
import bpy, sys, os, json, math, struct, statistics
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
ASSETS, OUT = argv[0], argv[1]
SENTINEL_FPS = 7
KTIME = 46186158000
LOOP_DEG, LOOP_REL = 5.0, 0.02          # 「首尾一致」：最大局部旋转差 < 5°，且骨头位置差 < 骨架尺寸的 2%
MOVE_REL = 0.01                          # 「有平移」：最大偏离 > 骨架尺寸的 1%

# root = 最上层骨；body = 身体主骨（凤凰骨盆 / 龙身根骨 Bone308（其下分前后两半：Skinbone044 → 头 Bone318，Skinbone018 → 腿与尾）/ 角色胯骨）
# facing：静止姿态里从 a 指向 b 的水平方向 = 模型朝向；legs：左、右大腿根 → 左方向 × 上 = 前
MODELS = [
    {'key': 'phoenix', 'kind': 'fbx', 'path': 'boss/phoenix-bird/source/fly.fbx', 'root': 'b_Root', 'body': 'B_Pelvis', 'facing': ('B_Pelvis', 'b_Neck_1')},
    {'key': 'phoenix', 'kind': 'glb', 'path': 'converted/phoenix/phoenix.glb', 'root': 'b_Root', 'body': 'B_Pelvis', 'facing': ('B_Pelvis', 'b_Neck_1')},
    {'key': 'loong', 'kind': 'fbx', 'path': 'boss/chinese_dragon_loong/source/RYUISM/8030/8030.fbx', 'root': 'GameObject', 'body': 'Bone308',
     'facing': ('Bone308', 'Bone318')},
    {'key': 'loong', 'kind': 'glb', 'path': 'converted/loong/loong.glb', 'root': 'GameObject', 'body': 'Bone308', 'facing': ('Bone308', 'Bone318')},
    {'key': 'cultivator', 'kind': 'glb', 'path': 'converted/figure/cultivator.glb', 'root': 'mixamorig:Hips', 'body': 'mixamorig:Hips',
     'legs': ('mixamorig:LeftUpLeg', 'mixamorig:RightUpLeg')},
]
FBX_TIMEMODE = {0: 'default', 1: 120, 2: 100, 3: 60, 4: 50, 5: 48, 6: 30, 7: '30 drop', 8: '29.97 NTSC drop', 9: '29.97 NTSC',
                10: '25 PAL', 11: 24, 12: 1000, 13: 23.976, 14: 'custom', 15: 96, 16: 72, 17: 59.94, 18: 119.88}


def yup(v):
    return [float(v[0]), float(v[2]), float(-v[1])]


def r(v, n=4):
    if isinstance(v, (list, tuple, np.ndarray)):
        return [round(float(x), n) for x in v]
    return round(float(v), n)


# ------------------------------------------------------------------ raw file parsing
def fbx_raw(path):
    from io_scene_fbx import parse_fbx
    root, version = parse_fbx.parse(path, use_namedtuple=True)
    info = {'fbxVersion': version}

    def find(e, name):
        return [c for c in e.elems if c.id == name]

    def props70(e):
        out = {}
        for p70 in find(e, b'Properties70'):
            for p in p70.elems:
                if p.id == b'P' and p.props:
                    k = p.props[0].decode('utf-8', 'replace')
                    vals = list(p.props[4:])
                    out[k] = [v.decode('utf-8', 'replace') if isinstance(v, bytes) else v for v in vals]
        return out
    gs = [e for e in root.elems if e.id == b'GlobalSettings']
    if gs:
        P = props70(gs[0])
        tm = P.get('TimeMode', [None])[0]
        info['globalSettings'] = {
            'TimeMode': tm, 'TimeModeMeaning': FBX_TIMEMODE.get(tm, '?'),
            'CustomFrameRate': P.get('CustomFrameRate', [None])[0],
            'TimeSpanStartS': (P['TimeSpanStart'][0] / KTIME) if 'TimeSpanStart' in P else None,
            'TimeSpanStopS': (P['TimeSpanStop'][0] / KTIME) if 'TimeSpanStop' in P else None,
            'UnitScaleFactor': P.get('UnitScaleFactor', [None])[0],
            'UpAxis': P.get('UpAxis', [None])[0], 'FrontAxis': P.get('FrontAxis', [None])[0]}
    stacks, deltas, ncurves = [], [], 0
    objs = [e for e in root.elems if e.id == b'Objects']
    stack_uid, layer_uid, cnode_uid, curve_times = {}, set(), set(), {}
    for ob in objs:
        for e in ob.elems:
            if e.id == b'AnimationStack':
                nm = e.props[1].split(b'\x00\x01')[0].decode('utf-8', 'replace')
                P = props70(e)
                st = {'name': nm}
                for k in ('LocalStart', 'LocalStop', 'ReferenceStart', 'ReferenceStop'):
                    if k in P:
                        st[k + 'S'] = round(P[k][0] / KTIME, 5)
                stacks.append(st)
                stack_uid[e.props[0]] = st
            elif e.id == b'AnimationLayer':
                layer_uid.add(e.props[0])
            elif e.id == b'AnimationCurveNode':
                cnode_uid.add(e.props[0])
            elif e.id == b'AnimationCurve':
                ncurves += 1
                kt = [c for c in e.elems if c.id == b'KeyTime']
                t = list(kt[0].props[0]) if kt else []
                curve_times[e.props[0]] = t
                for a, b in zip(t, t[1:]):
                    deltas.append(b - a)
    # connections: curve -> curve node -> layer -> stack (count what each stack really contains)
    parent = {}
    for con in [e for e in root.elems if e.id == b'Connections']:
        for c in con.elems:
            if c.id == b'C' and len(c.props) >= 3:
                parent.setdefault(c.props[1], []).append(c.props[2])
    per_stack = {u: {'layers': set(), 'curveNodes': set(), 'curves': 0, 'tmin': None, 'tmax': None, 'deltas': []} for u in stack_uid}
    def stacks_of(uid, depth=0):
        if uid in stack_uid:
            return {uid}
        if depth > 4:
            return set()
        s = set()
        for p in parent.get(uid, []):
            s |= stacks_of(p, depth + 1)
        return s
    for lu in layer_uid:
        for su in stacks_of(lu):
            per_stack[su]['layers'].add(lu)
    for cu in cnode_uid:
        for su in stacks_of(cu):
            per_stack[su]['curveNodes'].add(cu)
    for cid, t in curve_times.items():
        for su in stacks_of(cid):
            ps = per_stack[su]
            ps['curves'] += 1
            if t:
                ps['tmin'] = t[0] if ps['tmin'] is None else min(ps['tmin'], t[0])
                ps['tmax'] = t[-1] if ps['tmax'] is None else max(ps['tmax'], t[-1])
                ps['deltas'].extend(b - a for a, b in zip(t, t[1:]))
    for su, st in stack_uid.items():
        ps = per_stack[su]
        st['layers'] = len(ps['layers']); st['curveNodes'] = len(ps['curveNodes']); st['curves'] = ps['curves']
        if ps['tmin'] is not None:
            st['keyStartS'] = round(ps['tmin'] / KTIME, 5); st['keyEndS'] = round(ps['tmax'] / KTIME, 5)
        if ps['deltas']:
            st['keyRateFps'] = round(KTIME / statistics.mode(ps['deltas']), 3)
    info['animationStacks'] = stacks
    info['animationCurves'] = ncurves
    if deltas:
        md = min(deltas)
        info['keyTimeMinDeltaS'] = md / KTIME
        info['keyTimeMinDeltaFps'] = round(KTIME / md, 3)
        common = statistics.mode(deltas)
        info['keyTimeModeDeltaFps'] = round(KTIME / common, 3)
    takes = [e for e in root.elems if e.id == b'Takes']
    if takes:
        tl = []
        for t in takes[0].elems:
            if t.id == b'Take':
                d = {'name': t.props[0].decode('utf-8', 'replace')}
                for c in t.elems:
                    if c.id in (b'LocalTime', b'ReferenceTime'):
                        d[c.id.decode() + 'S'] = [round(x / KTIME, 5) for x in c.props]
                tl.append(d)
        info['takes'] = tl
    return info


def glb_raw(path):
    data = open(path, 'rb').read()
    magic, ver, length = struct.unpack_from('<III', data, 0)
    off, js, bin_ = 12, None, None
    while off < length:
        clen, ctype = struct.unpack_from('<II', data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode('utf-8'))
        elif ctype == 0x004E4942:
            bin_ = chunk
        off += 8 + clen
    info = {'generator': js.get('asset', {}).get('generator'), 'extensionsUsed': js.get('extensionsUsed', []),
            'nodes': len(js.get('nodes', [])), 'meshes': len(js.get('meshes', [])),
            'skins': [{'name': s.get('name'), 'joints': len(s['joints'])} for s in js.get('skins', [])]}
    acc, bvs, nodes = js.get('accessors', []), js.get('bufferViews', []), js.get('nodes', [])

    def read_times(ai):
        a = acc[ai]
        bv = bvs[a['bufferView']]
        if 'extensions' in bv or bin_ is None:
            return None
        o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        return struct.unpack_from('<%df' % a['count'], bin_, o)
    anims = []
    for an in js.get('animations', []):
        tmin, tmax, counts, paths, deltas, interp = 1e9, -1e9, set(), {}, [], set()
        trans_nodes = set()
        rates = {}
        for ch in an['channels']:
            s = an['samplers'][ch['sampler']]
            a = acc[s['input']]
            tmin = min(tmin, a['min'][0]); tmax = max(tmax, a['max'][0])
            counts.add(a['count'])
            interp.add(s.get('interpolation', 'LINEAR'))
            p = ch['target']['path']
            paths[p] = paths.get(p, 0) + 1
            if p == 'translation' and 'node' in ch['target']:
                trans_nodes.add(nodes[ch['target']['node']].get('name', str(ch['target']['node'])))
            t = read_times(s['input'])
            if t and len(t) > 2:
                dl = [b - c for c, b in zip(t, t[1:])]
                deltas.extend(dl)
                rk = '%.2f' % (1 / statistics.median(dl))          # sampling rate of this channel
                rates[rk] = rates.get(rk, 0) + 1
            elif t:
                rates['2-key (constant)' if len(t) == 2 else '1-key'] = rates.get('2-key (constant)' if len(t) == 2 else '1-key', 0) + 1
        d = {'name': an.get('name'), 'channels': len(an['channels']), 'samplers': len(an['samplers']),
             'firstKeyS': round(tmin, 5), 'lastKeyS': round(tmax, 5), 'spanS': round(tmax - tmin, 5),
             'threeDurationS': round(tmax, 5), 'keyCounts': sorted(counts), 'interpolation': sorted(interp), 'targetPaths': paths,
             'translationNodes': sorted(trans_nodes), 'channelRatesFps': rates}
        if deltas:
            dd = [round(x, 5) for x in deltas]
            d['keyDeltaMinS'] = min(dd); d['keyDeltaMaxS'] = max(dd); d['keyDeltaModeS'] = statistics.mode(dd)
            d['keyRateFps'] = round(1 / statistics.mode(dd), 2)
        anims.append(d)
    info['animations'] = anims
    return info


# ------------------------------------------------------------------ Blender import + evaluation
def do_import(path, which):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    scn.render.fps = SENTINEL_FPS
    scn.render.fps_base = 1.0
    if which == 'py':
        bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    elif which == 'cpp':
        bpy.ops.wm.fbx_import(filepath=path)
    else:
        bpy.ops.import_scene.gltf(filepath=path)
    return scn


def channelbag_for(act, slot):
    for L in act.layers:
        for st in L.strips:
            try:
                cb = st.channelbag(slot)
            except Exception:
                cb = None
            if cb is not None:
                return cb
    return None


def pick_slot(act, arm):
    if len(act.slots) == 1:
        return act.slots[0]
    for s in act.slots:
        if s.name_display == arm.name:
            return s
    for s in act.slots:
        if s.target_id_type == 'OBJECT':
            cb = channelbag_for(act, s)
            if cb and any(fc.data_path.startswith('pose.bones[') for fc in cb.fcurves):
                return s
    return None


def angles(Qa, Qb):
    return np.degrees(2 * np.arccos(np.clip(np.abs(np.sum(Qa * Qb, axis=-1)), -1, 1)))


def measure_action(scn, arm, act, spec, fps, is_gltf):
    slot = pick_slot(act, arm)
    ad = arm.animation_data or arm.animation_data_create()
    for t in ad.nla_tracks:
        t.mute = True
    try:
        ad.use_nla = False
    except Exception:
        pass
    ad.action = act
    if slot is not None:
        ad.action_slot = slot
    cb = channelbag_for(act, slot) if slot is not None else None
    keys, objch, groups = set(), [], {}
    for fc in (cb.fcurves if cb else []):
        xs = [k.co[0] for k in fc.keyframe_points]
        for x in xs:
            keys.add(round(x, 6))
        g = groups.setdefault(len(xs), [0, []])
        g[0] += 1
        if len(xs) > 2:
            g[1].append(fps / statistics.median(np.diff(xs)))
        if not fc.data_path.startswith('pose.bones['):
            v = [k.co[1] for k in fc.keyframe_points]
            if v and max(v) - min(v) > 1e-6:
                objch.append(fc.data_path + '[%d]' % fc.array_index)
    samples = sorted(keys)
    f0, f1 = samples[0], samples[-1]
    # curves grouped by key count: [number of curves, keys per curve, median key rate (fps) or None]; densest group first
    grp = sorted(([c, k, (round(statistics.median(v), 2) if v else None)] for k, (c, v) in groups.items()), key=lambda g: -g[1])
    dense = grp[0] if grp else None
    rec = {'action': act.name, 'slot': slot.name_display if slot else None, 'frameStart': r(f0), 'frameEnd': r(f1),
           'durationS': r((f1 - f0) / fps), 'samples': len(samples),
           'curves': sum(g[0] for g in grp), 'densestCurves': dense,
           'curveGroupsTop': sorted(grp, key=lambda g: -g[0])[:4], 'curveKeyCountGroups': len(grp),
           'animatedObjectChannels': objch}
    if is_gltf:      # glTF stores seconds; the importer placed keys at frame = t * scene fps
        rec['firstKeyS'] = r(f0 / fps, 5); rec['lastKeyS'] = r(f1 / fps, 5)
    pbs = arm.pose.bones
    names = [p.name for p in pbs]
    mw0 = arm.matrix_world.copy()
    Q, H = [], []
    rootW, bodyW, cen = [], [], []
    for f in samples:
        fi = math.floor(f)
        scn.frame_set(fi, subframe=f - fi)
        mw = arm.matrix_world
        Q.append([tuple(p.matrix_basis.to_quaternion()) for p in pbs])
        Hk = np.array([tuple(mw @ p.head) for p in pbs])
        H.append(Hk)
        rootW.append(np.array(mw @ pbs[spec['root']].head))
        bodyW.append(np.array(mw @ pbs[spec['body']].head))
        cen.append(Hk.mean(axis=0))
    Q = np.array(Q); H = np.array(H)
    rootW, bodyW, cen = np.array(rootW), np.array(bodyW), np.array(cen)
    size = spec['_size']
    n = len(samples)
    if n > 2:
        wrap = angles(Q[0], Q[-1])                               # per bone, first vs last key
        s_first, s_last = angles(Q[0], Q[1]), angles(Q[-2], Q[-1])
        neigh = np.maximum(s_first, s_last)
        steps = [float(angles(Q[k], Q[k + 1]).max()) for k in range(n - 1)]
        # bone positions relative to the root bone (travel of the whole body is reported separately)
        R = H - rootW[:, None, :]
        pd = np.linalg.norm(R[0] - R[-1], axis=1)
        pneigh = np.maximum(np.linalg.norm(R[1] - R[0], axis=1), np.linalg.norm(R[-1] - R[-2], axis=1))
        ib, jb = int(np.argmax(wrap)), int(np.argmax(pd))
        seamless = bool(np.all(wrap <= 1.5 * neigh + 1.0) and np.all(pd <= 1.5 * pneigh + 0.005 * size))
        if wrap.max() < 1.0 and pd.max() / size < 0.005:
            verdict = 'closed: last key = first key'
        elif wrap.max() < LOOP_DEG and pd.max() / size < LOOP_REL:
            verdict = 'nearly closed (< %g deg)' % LOOP_DEG
        elif seamless:
            verdict = 'wraps like one ordinary frame step (no pose jump)'
        else:
            verdict = 'does not loop (pose jump at the wrap)'
        def chain(nm, k=5):
            b, out_ = arm.data.bones[nm].parent, []
            while b is not None and len(out_) < k:
                out_.append(b.name); b = b.parent
            return out_
        rec['loop'] = {'maxRotDiffDeg': r(wrap.max(), 3), 'maxRotBone': names[ib], 'maxRotBoneAncestors': chain(names[ib]),
                       'bonesOver5Deg': int((wrap > 5).sum()), 'meanRotDiffDeg': r(wrap.mean(), 3),
                       'worstBoneFirstStepDeg': r(s_first[ib], 3), 'worstBoneLastStepDeg': r(s_last[ib], 3),
                       'maxPosDiffRelRootM': r(pd.max(), 5), 'maxPosBone': names[jb], 'maxPosDiffRelSize': r(pd.max() / size, 4),
                       'medianStepDeg': r(statistics.median(steps), 3), 'maxStepDeg': r(max(steps), 3),
                       'firstLastMatch': bool(wrap.max() < LOOP_DEG and pd.max() / size < LOOP_REL),
                       'wrapsWithoutJump': seamless, 'verdict': verdict}

    def motion(P):
        rel = P - P[0]
        hor = rel.copy(); hor[:, 2] = 0                        # Blender Z up -> horizontal = XY
        path = float(np.linalg.norm(np.diff(P, axis=0), axis=1).sum()) if len(P) > 1 else 0.0
        Y = np.array([yup(v) for v in rel])
        m = {'netDispYup': r(Y[-1], 5), 'netM': r(np.linalg.norm(rel[-1]), 5), 'netHorizM': r(np.linalg.norm(hor[-1]), 5),
             'maxExcursionM': r(np.linalg.norm(rel, axis=1).max(), 5), 'maxHorizExcursionM': r(np.linalg.norm(hor, axis=1).max(), 5),
             'pathM': r(path, 5), 'rangeYup': [[r(Y[:, i].min(), 5), r(Y[:, i].max(), 5)] for i in range(3)],
             'netRelSize': r(np.linalg.norm(rel[-1]) / size, 4), 'maxExcursionRelSize': r(np.linalg.norm(rel, axis=1).max() / size, 4),
             'maxHorizExcursionRelSize': r(np.linalg.norm(hor, axis=1).max() / size, 4)}
        m['translates'] = bool(np.linalg.norm(rel, axis=1).max() / size > MOVE_REL)
        return m
    rec['rootBone'] = dict(bone=spec['root'], **motion(rootW))
    if spec['body'] != spec['root']:
        b = dict(bone=spec['body'], **motion(bodyW))
        b['offsetFromRootStartYup'] = r(yup(bodyW[0] - rootW[0]), 5)
        b['offsetFromRootEndYup'] = r(yup(bodyW[-1] - rootW[-1]), 5)
        rec['bodyBone'] = b
    rec['skeletonCentroid'] = motion(cen)
    return rec


def measure_import(spec, which):
    path = os.path.join(ASSETS, spec['path'])
    scn = do_import(path, which)
    fps_after = scn.render.fps / scn.render.fps_base
    set_by = not (scn.render.fps == SENTINEL_FPS and scn.render.fps_base == 1.0)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    bones = arm.data.bones
    rest = np.array([tuple(arm.matrix_world @ b.head_local) for b in bones])
    size = float(np.linalg.norm(rest.max(axis=0) - rest.min(axis=0)))
    spec = dict(spec); spec['_size'] = size
    imp = {'importer': {'py': 'import_scene.fbx (Python, automatic_bone_orientation=False)', 'cpp': 'wm.fbx_import (C++)',
                        'gltf': 'import_scene.gltf'}[which],
           'sceneFpsAfterImport': fps_after, 'fpsSetByImporter': set_by,
           'objects': sorted('%s:%s' % (o.type, o.name) for o in bpy.data.objects),
           'armature': arm.name, 'armatureScale': r(list(arm.matrix_world.to_scale()), 6),
           'bones': len(bones), 'topLevelBones': [b.name for b in bones if b.parent is None],
           'skeletonSizeM': r(size, 5), 'skeletonSizeNote': 'diagonal of the bounding box of all rest bone heads, world units after import'}
    W = lambda n: np.array(arm.matrix_world @ bones[n].head_local)
    if 'facing' in spec:
        v = W(spec['facing'][1]) - W(spec['facing'][0])
        imp['facingFrom'] = '%s -> %s (rest pose, horizontal)' % spec['facing']
    else:
        left = W(spec['legs'][0]) - W(spec['legs'][1]); left[2] = 0
        v = np.cross(left, [0, 0, 1])                     # left x up = forward (Z up)
        imp['facingFrom'] = 'left/right upper legs: (left x up), rest pose'
    v[2] = 0
    imp['facingYup'] = r(yup(v / np.linalg.norm(v)), 3)
    # which actions belong to the armature
    if which == 'py':
        acts = [a for a in bpy.data.actions if a.name.startswith(arm.name + '|')]
        imp['otherObjectActions'] = sorted(a.name for a in bpy.data.actions if not a.name.startswith(arm.name + '|'))
    elif which == 'cpp':
        acts = [a for a in bpy.data.actions if pick_slot(a, arm) is not None]
    else:
        ad = arm.animation_data
        acts = []
        if ad:
            for t in ad.nla_tracks:
                for s in t.strips:
                    if s.action and s.action not in acts:
                        acts.append(s.action)
            if ad.action and ad.action not in acts:
                acts.append(ad.action)
    fps = fps_after
    imp['actions'] = []
    for a in sorted(acts, key=lambda a: a.name):
        try:
            rec = measure_action(scn, arm, a, spec, fps, which == 'gltf')
            if which == 'py':
                parts = a.name.split('|')
                rec['take'] = parts[1] if len(parts) >= 3 else a.name
            else:
                rec['take'] = a.name
            imp['actions'].append(rec)
            print('  ACTION', which, a.name, rec['frameStart'], rec['frameEnd'], rec['durationS'], rec['densestCurves'], rec['curveGroupsTop'],
                  (rec.get('loop') or {}).get('maxRotDiffDeg'), (rec.get('loop') or {}).get('verdict'), rec['rootBone']['maxExcursionRelSize'])
        except Exception as e:
            import traceback
            imp['actions'].append({'action': a.name, 'error': repr(e), 'trace': traceback.format_exc()})
            print('  ERROR', a.name, e)
    return imp


out = {'convention': {
    'vectors': 'Y-up glTF / three.js axes: Blender world (x, y, z) -> (x, z, -y). Units = metres in the file after import (the phoenix and '
               'dragon skeletons are small in-file; see skeletonSizeM, and the *RelSize fields = value / skeleton size).',
    'loop': 'first vs last key: max angle between local (parent-relative) bone rotations over all bones; bone-head positions are '
            'compared relative to the root bone. firstLastMatch = maxRotDiffDeg < %g and maxPosDiffRelSize < %g. wrapsWithoutJump = for '
            'every bone the first-vs-last difference is <= 1.5 x the larger of its first and last frame steps (+1 deg / +0.5%% of the '
            'skeleton size), i.e. jumping from the last key back to the first looks like an ordinary frame step.' % (LOOP_DEG, LOOP_REL),
    'rootMotion': 'world positions of the named root bone / body bone / centroid of all bone heads at every key; translates = max '
                  'excursion from the first key > %g x skeleton size.' % MOVE_REL,
    'duration': '(last key frame - first key frame) / scene fps; threeDurationS (glb) = last key time, which is what three.js '
                'AnimationClip.duration reports for clips from GLTFLoader.'}, 'models': {}}
for spec in MODELS:
    path = os.path.join(ASSETS, spec['path'])
    entry = out['models'].setdefault(spec['key'], {})
    sub = {'file': 'assets/' + spec['path'], 'bytes': os.path.getsize(path)}
    print('MODEL', spec['key'], spec['kind'], path)
    try:
        sub['raw'] = fbx_raw(path) if spec['kind'] == 'fbx' else glb_raw(path)
    except Exception as e:
        sub['raw'] = {'error': repr(e)}
    sub['imports'] = {}
    for which in (('py', 'cpp') if spec['kind'] == 'fbx' else ('gltf',)):
        try:
            sub['imports'][which] = measure_import(spec, which)
        except Exception as e:
            import traceback
            sub['imports'][which] = {'error': repr(e), 'trace': traceback.format_exc()}
            print('  IMPORT ERROR', which, e)
    entry[spec['kind']] = sub
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('WROTE', OUT)
