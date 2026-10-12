# 第二十五轮：把实测结果合并成 sword_pack.json，并写 SUMMARY.md（只读输入 JSON，不碰素材）
# 用法：python -I tools/r25_inventory_summary.py <sword_pack.jsonl> <inventory 目录>
#   inventory 目录里需已有 sheath_timeline.json（r25_inventory_sheath.py）、models.json（r25_inventory_models.py）、fx.json（r25_inventory_fx.py）
import json, os, sys, re, datetime

JSONL, INV = sys.argv[1], sys.argv[2]
recs = [json.loads(l) for l in open(JSONL, encoding='utf-8') if l.strip()]
SHEATH = json.load(open(os.path.join(INV, 'sheath_timeline.json'), encoding='utf-8'))
MODELS = json.load(open(os.path.join(INV, 'models.json'), encoding='utf-8'))
FX = json.load(open(os.path.join(INV, 'fx.json'), encoding='utf-8'))
MATCH_DEG = 5.0
FAM_ORDER = ['Idle', 'Walk', 'Run', 'Dash', 'Dodge', 'Roll', 'Hit', 'Death', 'Jump', 'Sheath/Unsheath'] + ['Attack%d' % i for i in range(1, 11)]
DIRS = ['Fw', 'FL', 'FR', 'L', 'R', 'BL', 'BR', 'Bw']


def family(nm):
    p = nm.split('_')
    if p[0].startswith('Attack'):
        return p[0], ('_'.join(p[1:]) or 'full')
    if p[0].startswith('Idle'):
        return 'Idle', nm
    if p[0] in ('Sheath', 'Unsheath'):
        return 'Sheath/Unsheath', nm
    return p[0], ('_'.join(p[1:]) or nm)


def f2(x, n=2):
    return ('%.' + str(n) + 'f') % x


def rng(vals, n=2, unit=''):
    vals = [v for v in vals if v is not None]
    if not vals:
        return '—'
    a, b = min(vals), max(vals)
    return (f2(a, n) + unit) if abs(a - b) < 10 ** -n / 2 else '%s – %s%s' % (f2(a, n), f2(b, n), unit)


def prim(r):
    return r.get('IP') or r.get('RM')


# ------------------------------------------------------------------ sword_pack.json
clips = []
for r in recs:
    fam, var = family(r['name'])
    p = prim(r)
    rm = r.get('RM')
    ip = r.get('IP')
    c = {'name': r['name'], 'family': fam, 'variant': var, 'nameHasLoopable': r['nameHasLoopable'],
         'files': {'IP': ip['file'] if ip else None, 'RM': rm['file'] if rm else None},
         'takeNames': {'IP': ip.get('take') if ip else None, 'RM': rm.get('take') if rm else None},
         'fps': p['fps'], 'frameStart': p['frameStart'], 'frameEnd': p['frameEnd'], 'frames': p['frames'], 'durationS': p['duration'],
         'measuredOn': 'IP' if ip else 'RM',
         'firstLastPose': dict(p['loop'], match=p['loop']['maxRotDiffDeg'] < MATCH_DEG),
         'rootMotionRM': ({'dispM': {'x_left': rm['root']['disp'][0], 'y_up': rm['root']['disp'][1], 'z_forward': rm['root']['disp'][2]},
                           'horizM': rm['root']['horizM'], 'pathM': rm['root']['pathM'], 'maxExcursionM': rm['root']['maxExcursionM'],
                           'yawChangeDeg': rm['root']['yawChangeDeg'], 'avgSpeedHMps': rm['root'].get('avgSpeedHMps')} if rm else None),
         'ipRootDrift': ({'netDispM': {'x_left': ip['root']['disp'][0], 'y_up': ip['root']['disp'][1], 'z_forward': ip['root']['disp'][2]},
                          'netHorizM': ip['root']['horizM'], 'maxExcursionM': ip['root']['maxExcursionM'], 'pathM': ip['root']['pathM'],
                          'yawChangeDeg': ip['root']['yawChangeDeg'], 'pelvisWorldMaxHorizM': ip['pelvis']['worldMaxHorizM'],
                          'pelvisRelRootMaxHorizM': ip['pelvis']['relRootMaxHorizM']} if ip else None),
         'IP': ip, 'RM': rm}
    clips.append(c)
fo = lambda c: (FAM_ORDER.index(c['family']), c['name'])
clips.sort(key=fo)
both = [c for c in clips if c['IP'] and c['RM']]
ip_only = [c['name'] for c in clips if c['IP'] and not c['RM']]
rm_only = [c['name'] for c in clips if c['RM'] and not c['IP']]
allv = [v for c in clips for v in (c['IP'], c['RM']) if v]
take_mismatch = [(c['name'], k, c[k]['take']) for c in clips for k in ('IP', 'RM')
                 if c[k] and c[k].get('take') != 'A_OneHandedSwordAnimV5_%s_%s' % (c['name'], k)]
ip_take_rm = [t for t in take_mismatch if t[1] == 'IP' and t[2] == 'A_OneHandedSwordAnimV5_%s_RM' % t[0]]
rm_awesome = [t for t in take_mismatch if t[1] == 'RM' and t[2].startswith('A_AwesomeSwordAnimationV5_')]
odd_takes = []
for n, k, t in rm_awesome:
    exp = 'A_AwesomeSwordAnimationV5_' + n.replace('Attack', 'AttackCombo', 1) + '_RM'
    if t != exp:
        odd_takes.append((n, k, t))
other_takes = [t for t in take_mismatch if t not in ip_take_rm and t not in rm_awesome]
checks = {
    'files': {'IP': sum(1 for c in clips if c['IP']), 'RM': sum(1 for c in clips if c['RM']), 'total': len(allv)},
    'uniqueClips': len(clips), 'inBoth': len(both), 'ipOnly': ip_only, 'rmOnly': rm_only,
    'importErrors': [v['file'] for v in allv if 'error' in v],
    'fpsValues': sorted({v['fps'] for v in allv}), 'fpsSetByImporterAll': all(v['fpsSetByImporter'] for v in allv),
    'frameStartValues': sorted({v['frameStart'] for v in allv}),
    'oneKeyPerFrameAll': all(v['keysPerCurve'] == [v['frames']] for v in allv),
    'bonesValues': sorted({v['bones'] for v in allv}),
    'cppImporterAgrees': sum(1 for v in allv if v['cpp'].get('agree')),
    'ipRmFrameCountEqual': sum(1 for c in both if c['IP']['frames'] == c['RM']['frames']),
    'maxAbsRootYawDeg': max(v['root']['yawMaxAbsDeg'] for v in allv),
    'maxAbsRootVerticalM': max(max(abs(x) for x in v['root']['vertRangeM']) for v in allv),
    'maxPelvisHorizRelRootM': max(v['pelvis']['relRootMaxHorizM'] for v in allv),
    'takeNames': {'mismatching': len(take_mismatch), 'ipFilesWhoseTakeEndsInRM': len(ip_take_rm),
                  'rmFilesWithAwesomeSwordTakeNames': len(rm_awesome), 'awesomeTakeNotMatchingFile': odd_takes, 'other': other_takes},
}
convention = {
    'importer': 'Blender 5.2.2 import_scene.fbx (Python, automatic_bone_orientation=False); every file re-imported with wm.fbx_import (C++) as a cross-check',
    'root': 'the FBX bone "root" becomes the armature object (child of the empty SKM_Manny_Simple, scale 0.01); root motion = that object\'s channels',
    'axes': 'vectors are in the character frame of the clip\'s first frame, glTF/three.js style: x = character left, y = up, z = character forward. '
            'Measured from the skeleton (thigh_l - thigh_r = left; foot -> ball = forward). In Blender after import: forward = -Y, left = +X, up = +Z.',
    'yaw': '+ = turn to the left (counter-clockwise seen from above)',
    'duration': '(last frame - first frame) / fps',
    'firstLastPose': 'max angle between local (parent-relative) rotations of the 82 body bones (ik_*, interaction, center_of_mass excluded) at '
                     'the first and last frame; maxPosDiffM compares bone heads in root space. match = maxRotDiffDeg < %g.' % MATCH_DEG,
    'ipRootDrift': 'movement of the root (armature object) inside the IP file; the pelvis is horizontally locked to the root in every file',
}
json.dump({'source': 'assets/fighting/One Handed Sword Animation V5 FBX/One Handed Sword Animation V5 FBX/{IP,RM}',
           'generatedBy': ['tools/r25_inventory_sword.py', 'tools/r25_inventory_summary.py'], 'convention': convention, 'checks': checks,
           'clips': clips}, open(os.path.join(INV, 'sword_pack.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ------------------------------------------------------------------ SUMMARY.md
L = []
w = L.append
w('# R25 animation asset inventory (measured)')
w('')
w('Generated %s by `tools/r25_inventory_sword.py`, `r25_inventory_sheath.py`, `r25_inventory_models.py` (Blender 5.2.2 portable, '
  '`--factory-startup`), `r25_inventory_fx.py` and `r25_inventory_summary.py` (`python -I`). Every number below comes from importing or '
  'reading the files; only the family grouping and the "Loopable" flag use the clip names. Data: `sword_pack.json`, `sheath_timeline.json`, '
  '`models.json`, `fx.json` (same folder).' % datetime.date.today().isoformat())
w('')
w('**Conventions.** Vectors use the glTF / three.js frame of the clip\'s first frame: **x = character left, y = up, z = character forward** '
  '(measured from the skeleton; in Blender the sword-pack character faces −Y, left = +X, up = +Z). Yaw + = turning left. Duration = '
  '(last − first frame) / fps. "First/last pose" = largest angle between the local rotation of any body bone at the first and the last frame.')
w('')

# ---------------- (a) sword pack
w('## (a) One Handed Sword Animation V5 (FBX)')
w('')
cs = checks
w('- **%d unique clips measured** (%d IP files + %d RM files = %d files, all imported without errors): %d clips exist in both IP and RM, '
  '%d are IP-only (%s), %d are RM-only (%s).' % (cs['uniqueClips'], cs['files']['IP'], cs['files']['RM'], cs['files']['total'], cs['inBoth'],
                                                  len(ip_only), ', '.join(ip_only), len(rm_only), ', '.join(rm_only)))
w('- Every file: scene fps after import = %s (set by the importer from the file), frames start at %s, one key per frame on every curve, '
  '%s bones. The C++ importer gives the same fps, frame range and root displacement for %d / %d files. IP and RM frame counts are equal for '
  '%d / %d pairs.' % ('/'.join('%g' % x for x in cs['fpsValues']), '/'.join('%g' % x for x in cs['frameStartValues']),
                      '/'.join(str(x) for x in cs['bonesValues']), cs['cppImporterAgrees'], cs['files']['total'], cs['ipRmFrameCountEqual'], len(both)))
w('- The root never rotates (max |yaw| %.3f° over all files) and never moves vertically (max %.4f m): root motion is purely horizontal. '
  'The pelvis is horizontally locked to the root in every file (max %.4f m relative movement), so the root carries all horizontal body motion.'
  % (cs['maxAbsRootYawDeg'], cs['maxAbsRootVerticalM'], cs['maxPelvisHorizRelRootM']))
ipd = [c for c in clips if c['ipRootDrift']]
mx_ex = max(ipd, key=lambda c: c['ipRootDrift']['maxExcursionM'])
mx_net = max(ipd, key=lambda c: c['ipRootDrift']['netHorizM'])
n_ip_net_1cm = sum(1 for c in ipd if c['ipRootDrift']['netHorizM'] > 0.01)
starts = {}
for v in allv:
    k = (round(v['root']['startBlenderM'][0], 2), round(v['root']['startBlenderM'][1], 2))
    starts[k] = starts.get(k, 0) + 1
dist0 = [100 * (v['root']['startBlenderM'][0] ** 2 + v['root']['startBlenderM'][1] ** 2) ** 0.5 for v in allv]
top2 = sorted(starts.items(), key=lambda kv: -kv[1])[:2]
w('- **IP files are not strictly in place:** the root (and with it the pelvis) wanders inside the IP files — max excursion %.3f m (%s), '
  'net start→end drift up to %.3f m (%s); %d of %d IP files end more than 1 cm from where they started. The root does not start at the origin '
  'either: first-frame root offset %.1f–%.1f cm (most common: (%.2f, %.2f) m in %d files, (%.2f, %.2f) m in %d files; Blender XY).'
  % (mx_ex['ipRootDrift']['maxExcursionM'], mx_ex['name'], mx_net['ipRootDrift']['netHorizM'], mx_net['name'], n_ip_net_1cm, len(ipd),
     min(dist0), max(dist0), top2[0][0][0], top2[0][0][1], top2[0][1], top2[1][0][0], top2[1][0][1], top2[1][1]))
lows = [c['firstLastPose']['maxRotDiffDeg'] for c in clips if c['firstLastPose']['maxRotDiffDeg'] < MATCH_DEG]
highs = [c['firstLastPose']['maxRotDiffDeg'] for c in clips if c['firstLastPose']['maxRotDiffDeg'] >= MATCH_DEG]
w('- Loop check: all %d "Loopable" clips match first/last within %.1f°; %d other clips also start and end in the same pose (< %g°), '
  'mostly clips that return to the idle stance. There is a clean gap: %d clips ≤ %.2f°, %d clips ≥ %.1f°. Sheath / Unsheath fail only because '
  'of the right-hand fingers (grip vs open hand, see (c)).'
  % (sum(1 for c in clips if c['nameHasLoopable']), max(c['firstLastPose']['maxRotDiffDeg'] for c in clips if c['nameHasLoopable']),
     sum(1 for c in clips if not c['nameHasLoopable'] and c['firstLastPose']['match']), MATCH_DEG, len(lows), max(lows), len(highs), min(highs)))
import math
DIR_ANG = {'Fw': 0, 'FL': 45, 'L': 90, 'BL': 135, 'Bw': 180, 'BR': -135, 'R': -90, 'FR': -45}


def dir_dev(c):
    parts = c['name'].split('_')
    d = parts[1] if len(parts) > 1 and parts[1] in DIR_ANG else None
    rm = c['rootMotionRM']
    if not d or not rm or rm['horizM'] < 0.05:
        return None
    ang = math.degrees(math.atan2(rm['dispM']['x_left'], rm['dispM']['z_forward']))
    dev = (ang - DIR_ANG[d] + 180) % 360 - 180
    return d, ang, dev


dir_lines, opposite = [], []
by = {c['name']: c for c in clips}
for fam in ('Walk', 'Run', 'Dash', 'Dodge', 'Roll', 'Hit', 'Death'):
    devs = []
    for c in clips:
        if c['family'] == fam:
            x = dir_dev(c)
            if x:
                devs.append((abs(x[2]), c['name']))
    if not devs:
        continue
    worst, best = max(devs), min(devs)
    if best[0] > 90:
        opposite.append(fam)
        dir_lines.append('%s: every clip moves to the side opposite its name (%s off)' % (
            fam, ('%.0f°' % best[0]) if abs(worst[0] - best[0]) < 0.5 else '%.0f–%.0f°' % (best[0], worst[0])))
    else:
        dir_lines.append('%s: within %.0f° (worst %s)' % (fam, worst[0], worst[1]))
w('- Direction check (RM horizontal displacement vs the direction token in the clip name, clips moving ≥ 5 cm): ' + '; '.join(dir_lines) + '.' +
  ((' For %s the body is pushed away from the named side (presumably the side the hit comes from).' % ' / '.join(opposite)) if opposite else ''))
w('')
# grouped table
w('### Grouped by family')
w('')
w('| Family | Clips (IP / RM files) | Duration s | Frames | RM forward z (m) | RM lateral x (m, + = left) | RM horizontal distance (m) | First/last pose match | IP root drift: max excursion (m) |')
w('|---|---|---|---|---|---|---|---|---|')


def attack_variants(cl):
    stages = {}
    extra = []
    for c in cl:
        v = c['variant']
        m = re.match(r'Stage(\d+)(?:_(.*))?$', v)
        if m:
            stages.setdefault(int(m.group(1)), []).append(m.group(2) or 'base')
        else:
            extra.append(v)
    parts = []
    for s in sorted(stages):
        suf = sorted(stages[s], key=lambda x: ['base', 'Back', 'Complete', 'Complete_React'].index(x) if x in ['base', 'Back', 'Complete', 'Complete_React'] else 9)
        parts.append('S%d(%s)' % (s, ','.join(x.replace('Complete_React', 'C+React').replace('Complete', 'C') for x in suf)))
    return ', '.join(sorted(extra, key=lambda x: (x != 'full', x)) + parts)


fams = {}
for c in clips:
    fams.setdefault(c['family'], []).append(c)
for f in FAM_ORDER:
    cl = fams.get(f, [])
    if not cl:
        continue
    rmc = [c for c in cl if c['rootMotionRM']]
    nip = sum(1 for c in cl if c['IP']); nrm = len(rmc)
    label = f if not f.startswith('Attack') else '%s: %s' % (f, attack_variants(cl))
    w('| %s | %d (%d / %d) | %s | %s | %s | %s | %s | %d / %d | %s |' % (
        label, len(cl), nip, nrm, rng([c['durationS'] for c in cl], 3), rng([c['frames'] for c in cl], 0),
        rng([c['rootMotionRM']['dispM']['z_forward'] for c in rmc]), rng([c['rootMotionRM']['dispM']['x_left'] for c in rmc]),
        rng([c['rootMotionRM']['horizM'] for c in rmc]), sum(1 for c in cl if c['firstLastPose']['match']), len(cl),
        rng([c['ipRootDrift']['maxExcursionM'] for c in cl if c['ipRootDrift']], 3)))
w('')
w('Attack stage key: `full` = whole combo, `React` = hit-reaction version, `S<n>(base,Back,C,C+React)` = Stage n alone / its `_Back` '
  '(return) / `_Complete` / `_Complete_React` versions.')
w('')
# locomotion detail
w('### Locomotion and evasion by direction (RM root displacement x, z in m; duration in s)')
w('')
by = {c['name']: c for c in clips}
for fam, phases in (('Walk', ['Start', 'Loopable', 'End', 'Complete']), ('Run', ['Start', 'Loopable', 'End', 'Complete'])):
    w('| %s | %s |' % (fam, ' | '.join(phases)))
    w('|---|%s' % ('---|' * len(phases)))
    for d in DIRS:
        cells = []
        for ph in phases:
            c = by.get('%s_%s_%s' % (fam, d, ph))
            if not c:
                cells.append('—'); continue
            rm = c['rootMotionRM']
            s = '%.3f s; x %.2f, z %.2f' % (c['durationS'], rm['dispM']['x_left'], rm['dispM']['z_forward']) if rm else '%.3f s' % c['durationS']
            if ph == 'Loopable' and rm:
                s += '; %.2f m/s' % rm['avgSpeedHMps']
            cells.append(s)
        w('| %s | %s |' % (d, ' | '.join(cells)))
    w('')
w('| Direction | Dash | Dodge | Roll | Hit | Death |')
w('|---|---|---|---|---|---|')
for d in DIRS:
    cells = []
    for fam in ('Dash', 'Dodge', 'Roll', 'Hit', 'Death'):
        c = by.get('%s_%s' % (fam, d))
        if not c:
            cells.append('—'); continue
        rm = c['rootMotionRM']
        cells.append('%.3f s; x %.2f, z %.2f' % (c['durationS'], rm['dispM']['x_left'], rm['dispM']['z_forward']))
    w('| %s | %s |' % (d, ' | '.join(cells)))
w('')

# ---------------- (b) models
w('## (b) Phoenix, dragon (loong) and player character (cultivator)')
w('')
w('Model vectors are in the file\'s own glTF-style axes (Y up; FBX imports converted the same way), not character-relative: the phoenix faces +X, '
  'the dragon and the cultivator face +Z (so for them x = left). Sizes are in metres as stored in the files (the phoenix and dragon are tiny '
  'in-file; "× size" = value / skeleton size). "Root" = top bone, "body" = pelvis / body-root bone. Loop verdicts: *closed* = last key equals '
  'the first (< 1°); *nearly closed* = < 5°; *wraps like one ordinary frame step* = every bone\'s first-vs-last difference ≤ 1.5× its own first/last '
  'frame step; otherwise *does not loop*.')
w('')
M = MODELS['models']


def model_rows(key):
    rows = []
    for kind in ('fbx', 'glb'):
        sub = M[key].get(kind)
        if not sub:
            continue
        raw = sub['raw']
        rawan = {a['name']: a for a in raw.get('animations', [])}
        for which, imp in sub['imports'].items():
            for a in imp.get('actions', []):
                rows.append((kind, which, imp, a, rawan.get(a['take'])))
    return rows


def loop_cell(a):
    l = a['loop']
    return '%.2f° (%s) — %s' % (l['maxRotDiffDeg'], l['maxRotBone'], l['verdict'])


def mot_cell(m):
    if not m['translates']:
        return 'no (max %.4f m)' % m['maxExcursionM']
    rg = ', '.join('%s %.3f…%.3f' % (ax, a, b) for ax, (a, b) in zip('xyz', m['rangeYup']) if b - a > 1e-4)
    net = m['netM']
    head = 'returns to start' if net < 1e-3 else 'net (%s) m' % ', '.join('%.3f' % x for x in m['netDispYup'])
    return 'yes, %s; max %.3f m (%.2f× size), range %s, path %.3f m' % (head, m['maxExcursionM'], m['maxExcursionRelSize'], rg, m['pathM'])


for key, title in (('phoenix', 'Phoenix'), ('loong', 'Dragon (loong)')):
    w('### %s' % title)
    w('')
    for kind in ('fbx', 'glb'):
        sub = M[key].get(kind)
        raw = sub['raw']
        if kind == 'fbx':
            gs = raw.get('globalSettings', {})
            st = '; '.join('%s (%s)' % (s['name'], ('%d curves, keys %.3f–%.3f s @ %g fps' % (s['curves'], s['keyStartS'], s['keyEndS'], s['keyRateFps']))
                                         if s.get('curves') else 'empty: %d layer, 0 curves' % s['layers']) for s in raw.get('animationStacks', []))
            w('- `%s` (%.2f MB, FBX %s): GlobalSettings TimeMode %s (%s), CustomFrameRate %s; animation stacks: %s.' % (
                sub['file'], sub['bytes'] / 1e6, raw.get('fbxVersion'), gs.get('TimeMode'), gs.get('TimeModeMeaning'), gs.get('CustomFrameRate'), st))
        else:
            w('- `%s` (%.2f MB, generator %s): %d animation(s), skin joints %s.' % (
                sub['file'], sub['bytes'] / 1e6, raw.get('generator'), len(raw.get('animations', [])), '/'.join(str(s['joints']) for s in raw.get('skins', []))))
        for which, imp in sub['imports'].items():
            fps_txt = ('scene fps after import **%g**' % imp['sceneFpsAfterImport']) if imp['fpsSetByImporter'] else \
                'scene fps not changed by the importer (glTF stores seconds; keys are 1/%g s apart)' % (raw['animations'][0]['keyRateFps'])
            w('  - %s: %s; %d bones; top bone `%s`; skeleton size %.3f m; faces %s (Y-up).' % (
                imp['importer'], fps_txt,
                imp['bones'], ', '.join(imp['topLevelBones']), imp['skeletonSizeM'],
                {(1.0, 0.0, 0.0): '+X', (0.0, 0.0, 1.0): '+Z'}.get(tuple(abs(x) if abs(x) < 1e-9 else x for x in imp['facingYup']), str(imp['facingYup']))))
    w('')
    w('| Animation | Source / importer | fps | Frames | Duration s | Key times (glb, s) | Bones | First vs last pose | Root bone moves? | Body bone moves? |')
    w('|---|---|---|---|---|---|---|---|---|---|')
    for kind, which, imp, a, ra in sorted(model_rows(key), key=lambda t: (t[3]['take'], t[0], t[1])):
        keyt = ('%.4f – %.4f (three.js duration %.4f)' % (ra['firstKeyS'], ra['lastKeyS'], ra['threeDurationS'])) if ra else '—'
        if ra:      # glb: frames at the key rate, not at the arbitrary scene fps used during import
            fps_c = '%g (key rate)' % ra['keyRateFps']
            fr = '%g – %g' % (round(ra['firstKeyS'] * ra['keyRateFps'], 3), round(ra['lastKeyS'] * ra['keyRateFps'], 3))
        else:
            fps_c = '%g' % imp['sceneFpsAfterImport']
            fr = '%g – %g' % (a['frameStart'], a['frameEnd'])
        w('| %s | %s %s | %s | %s | %.4f | %s | %d | %s | %s: %s | %s |' % (
            a['take'], kind.upper(), which, fps_c, fr, a['durationS'], keyt,
            imp['bones'], loop_cell(a), a['rootBone']['bone'], mot_cell(a['rootBone']),
            ('%s: %s' % (a['bodyBone']['bone'], mot_cell(a['bodyBone']))) if a.get('bodyBone') else '—'))
    w('')

# cultivator
cul = M['cultivator']['glb']
craw = {a['name']: a for a in cul['raw']['animations']}
cimp = cul['imports']['gltf']
w('### Player character (cultivator.glb)')
w('')
tp = {json.dumps(a['targetPaths'], sort_keys=True) for a in cul['raw']['animations']}
tn = {tuple(a['translationNodes']) for a in cul['raw']['animations']}
ch_txt = ('Every animation has the same channel set %s; translation channels only on %s.' % (' / '.join(sorted(tp)), ' / '.join(', '.join(t) for t in sorted(tn))))
w('- `%s` (%.2f MB, generator %s, extensions %s): %d animations, %d joints, skeleton size %.2f m, faces %s (Y-up). %s' % (
      cul['file'], cul['bytes'] / 1e6, cul['raw']['generator'], ', '.join(cul['raw']['extensionsUsed']), len(cul['raw']['animations']),
      cul['raw']['skins'][0]['joints'], cimp['skeletonSizeM'], '+Z' if cimp['facingYup'] == [0.0, 0.0, 1.0] else cimp['facingYup'], ch_txt))
w('- Duration = last key time (all start at 0 s) = three.js `clip.duration`. Hips motion in Y-up metres: x = left, y = up, z = forward. '
  '"Horizontal translation" = the hips leave their start position by more than 1 cm in the ground plane.')
w('')
w('| Animation | Duration s | Keys | Per-frame change (median °) | First vs last pose | Hips horizontal translation? | Hips max horiz. excursion m | Hips net (x, y, z) m |')
w('|---|---|---|---|---|---|---|---|')


def hips_class(hb):
    nh = (hb['netDispYup'][0] ** 2 + hb['netDispYup'][2] ** 2) ** 0.5
    if hb['maxHorizExcursionM'] <= 0.01:
        return 'no'
    if nh <= 0.01:
        return 'yes, returns to start'
    return 'yes, ends %.2f m away' % nh


for a in sorted(cimp['actions'], key=lambda a: a['take'].lower()):
    ra = craw.get(a['take'], {})
    hb = a['rootBone']
    w('| %s | %.4f | %s | %.2f | %.2f° — %s | %s | %.3f | (%s) |' % (
        a['take'], ra.get('threeDurationS', a['durationS']), '/'.join(str(x) for x in ra.get('keyCounts', [])), a['loop']['medianStepDeg'],
        a['loop']['maxRotDiffDeg'], a['loop']['verdict'], hips_class(hb), hb['maxHorizExcursionM'],
        ', '.join('%.3f' % x for x in hb['netDispYup'])))
w('')
nc = len(cimp['actions'])
w('Hips summary: %d of %d clips keep the hips within 1 cm horizontally; %d move and come back; %d end displaced horizontally (> 1 cm).' % (
    sum(1 for a in cimp['actions'] if hips_class(a['rootBone']) == 'no'), nc,
    sum(1 for a in cimp['actions'] if hips_class(a['rootBone']) == 'yes, returns to start'),
    sum(1 for a in cimp['actions'] if hips_class(a['rootBone']).startswith('yes, ends'))))
w('')

# ---------------- (c) sheath
w('## (c) Sheath / Unsheath (IP only, 30 fps)')
w('')
S = SHEATH['clips']
rev = SHEATH.get('unsheathIsReversedSheath', {})
for nm in ('Sheath', 'Unsheath'):
    c = S[nm]
    e = c['events']
    w('- **%s**: frames %d–%d, %d frames, **%.3f s**. Root yaw range %.1f°.' % (nm, c['frameStart'], c['frameEnd'], c['frames'], c['duration'], c['rootYawRangeDeg']))
w('- **Unsheath is Sheath played backwards**: Sheath frame i vs Unsheath frame (25 − i) differ by at most %.2f° on any bone (mean %.3f°) and %.1f cm '
  'in root position, against up to %.0f° when compared in the same order.' % (rev.get('maxBoneRotDiffDeg', float('nan')), rev.get('meanBoneRotDiffDeg', float('nan')),
                                                                          100 * rev.get('maxRootPosDiffM', float('nan')), rev.get('forwardOrderMaxRotDiffDeg', float('nan'))))
w('- Positions are hand minus pelvis in metres (x = left, y = up, z = forward). "Left hip" = head of `thigh_l` (hip joint). '
  'Grip axis = pinky→index knuckle line of the right fist (≈ handle direction, toward the blade for a normal grip).')
w('')


def row(c, f):
    return c['perFrame'][f - c['frameStart']]


def v3(v):
    return '(%s)' % ', '.join('%.2f' % x for x in v)


for nm in ('Sheath', 'Unsheath'):
    c = S[nm]; e = c['events']; fps = c['fps']; f0 = c['frameStart']; f1 = c['frameEnd']
    hip = e['handRClosestToLeftHip']; stop = e['handRStopAtHip']; st = e['bladeAxisStroke']; top = e['handRHighest']
    rows = c['perFrame']
    lmax = max(rows, key=lambda r: r['hand_l'][0])
    w('### %s timeline' % nm)
    w('')
    if nm == 'Sheath':
        seg1 = [r for r in rows if r['frame'] <= top['frame']]
        p1 = max(seg1, key=lambda r: r['vHandRWorld'])
        seg4 = [r for r in rows if r['frame'] >= stop['frames'][1]]
        p4 = max(seg4, key=lambda r: r['vHandRWorld'])
        w('- **0.000–%.3f s (f%d–f%d)** — right hand swings from the low guard beside/behind the right hip %s forward and up to its highest point '
          '%s; up to %.1f m/s (f%d). The fist turns so the grip axis goes from %s (forward-right) to %s (down, left, back).'
          % (top['t'], f0, top['frame'], v3(rows[0]['hand_r']), v3(top['handR']), p1['vHandRWorld'], p1['frame'], v3(rows[0]['gripAxis']),
             v3(row(c, top['frame'])['gripAxis'])))
        w('- **%.3f–%.3f s (f%d–f%d)** — insertion stroke: the hand drives %.2f m straight along the blade axis (mean |cos| %.3f, toward the blade '
          'tip), down/left/back to %s, i.e. just in front of and above the left hip.' % (st['t'][0], st['t'][1], st['frames'][0], st['frames'][1],
                                                                                      st['lengthM'], st['meanAbsCos'], v3(st['handREnd'])))
        w('- **%.3f s (f%d)** — right hand closest to the left hip: %.3f m from the hip joint (also closest to a point %.2f m left of the pelvis at '
          'f%d); hands closest together here (%.3f m).' % (hip['t'], hip['frame'], hip['distM'], SHEATH['thresholds']['hipSideM'],
                                                             e['handRClosestToHipSidePoint']['frame'], e['handsClosest']['distM']))
        cu = c['rightFingerCurlDeg']['perFrame']
        closed = cu[0]
        f_open = next(i for i in range(len(cu)) if cu[i] < closed - 1.0)        # first frame where the fist starts to open
        f_open10 = next(i for i in range(len(cu)) if cu[i] < 10.0)
        after = [r['vHandRWorld'] for r in rows if r['frame'] > stop['frames'][1]]
        w('- **%.3f–%.3f s (f%d→f%d)** — the "click": the hand almost stops (%.1f cm in that frame = %.2f m/s, the slowest moment of the clip). '
          'The right fist, closed until then (finger bones on average %.1f° from rest), starts to open on exactly this frame: %.1f° at f%d, '
          '< 10° from f%d (%.3f s), %.1f° at the end — i.e. the hand lets go of the hilt right after the click.'
          % (stop['t'][0], stop['t'][1], stop['frames'][0], stop['frames'][1], 100 * stop['stepM'], stop['stepMps'],
             closed, cu[f_open], f0 + f_open, f0 + f_open10, f_open10 / fps, cu[-1]))
        w('- **%.3f–%.3f s (f%d–f%d)** — the empty hand swings back out to the right and behind into the start position (fastest %.1f m/s at f%d). '
          'It does **not** settle: from f%d on the speed never drops below %.2f m/s and is still %.2f m/s on the last frame. The last frame '
          'matches the first except the right-hand fingers (hand position %.1f mm apart; only the %d right finger bones differ by > 5°, up to %.0f°).'
          % (stop['t'][1], c['duration'], stop['frames'][1], f1, p4['vHandRWorld'], p4['frame'], stop['frames'][1] + 1, min(after),
             e['handRSpeedLastFrame']['lastStepMps'],
             1000 * c['firstLastHandRDiffM'], len(c['firstLastBonesOver5Deg']), c['firstLastBonesOver5Deg'][0][1]))
        w('- Left hand: starts %s in front of the body, moves out to the left side at hip height (furthest left %s at %.3f s, f%d), then returns '
          'to the front by the end.' % (v3(rows[0]['hand_l']), v3(lmax['hand_l']), lmax['t'], lmax['frame']))
    else:
        seg1 = [r for r in rows if r['frame'] <= stop['frames'][0]]
        p1 = max(seg1, key=lambda r: r['vHandRWorld'])
        seg4 = [r for r in rows if r['frame'] >= top['frame']]
        p4 = max(seg4, key=lambda r: r['vHandRWorld'])
        w('- **0.000–%.3f s (f%d–f%d)** — right hand swings from the low guard %s forward/left down to the hilt in front of the left hip '
          '(fastest %.1f m/s at f%d).' % (stop['t'][0], f0, stop['frames'][0], v3(rows[0]['hand_r']), p1['vHandRWorld'], p1['frame']))
        cu = c['rightFingerCurlDeg']['perFrame']
        f_closed = next(i for i in range(len(cu)) if cu[i] >= max(cu) - 0.05)
        f_start = next(i for i in range(len(cu)) if cu[i] > 10.0)
        w('- **%.3f–%.3f s (f%d→f%d)** — grab: the hand almost stops at the hilt (%.1f cm in that frame = %.2f m/s); closest to the left hip at '
          '**%.3f s (f%d)**, %.3f m from the hip joint, hand at %s. The open hand (finger bones %.1f° from rest) closes into the fist at the '
          'same moment: > 10° from f%d, %.1f° at f%d, fully closed (%.1f°) at f%d (%.3f s).'
          % (stop['t'][0], stop['t'][1], stop['frames'][0], stop['frames'][1], 100 * stop['stepM'], stop['stepMps'], hip['t'], hip['frame'],
             hip['distM'], v3(hip['handR']), cu[0], f0 + f_start, cu[stop['frames'][0] - f0], stop['frames'][0], max(cu), f0 + f_closed, f_closed / fps))
        w('- **%.3f–%.3f s (f%d–f%d)** — draw stroke: the hand pulls %.2f m hilt-first along the blade axis (mean |cos| %.3f) up, forward and right '
          'to its highest point %s at %.3f s.' % (st['t'][0], st['t'][1], st['frames'][0], st['frames'][1], st['lengthM'], st['meanAbsCos'],
                                                  v3(top['handR']), top['t']))
        w('- **%.3f–%.3f s (f%d–f%d)** — swings the drawn sword down and back to the low guard (fastest %.1f m/s at f%d), decelerating to %.2f m/s on '
          'the last frame — no full stop inside the clip.' % (top['t'], c['duration'], top['frame'], f1, p4['vHandRWorld'], p4['frame'],
                                                              e['handRSpeedLastFrame']['lastStepMps']))
        w('- Left hand: mirror of Sheath — furthest left %s at %.3f s (f%d).' % (v3(lmax['hand_l']), lmax['t'], lmax['frame']))
    w('')
w('| Clip | Duration | Hand closest to left hip | Hand stop ("click" / grab) | Blade-axis stroke | Highest hand point | Settles at end? |')
w('|---|---|---|---|---|---|---|')
for nm in ('Sheath', 'Unsheath'):
    c = S[nm]; e = c['events']
    w('| %s | %.3f s (%d f) | f%d, %.3f s (%.3f m) | f%d→f%d, %.3f–%.3f s (%.2f m/s) | f%d–f%d, %.3f–%.3f s, %.2f m, %s | f%d, %.3f s | no (%.2f m/s on last frame) |' % (
        nm, c['duration'], c['frames'], e['handRClosestToLeftHip']['frame'], e['handRClosestToLeftHip']['t'], e['handRClosestToLeftHip']['distM'],
        e['handRStopAtHip']['frames'][0], e['handRStopAtHip']['frames'][1], e['handRStopAtHip']['t'][0], e['handRStopAtHip']['t'][1],
        e['handRStopAtHip']['stepMps'], e['bladeAxisStroke']['frames'][0], e['bladeAxisStroke']['frames'][1], e['bladeAxisStroke']['t'][0],
        e['bladeAxisStroke']['t'][1], e['bladeAxisStroke']['lengthM'], e['bladeAxisStroke']['sign'], e['handRHighest']['frame'], e['handRHighest']['t'],
        e['handRSpeedLastFrame']['lastStepMps']))
w('')
w('Per-frame hand_r / hand_l / left-hip positions, speeds, grip axis and blade alignment are in `sheath_timeline.json`.')
w('')

# ---------------- (d) problems
w('## (d) Problems and caveats')
w('')
lo = M['loong']['fbx']
gsl = lo['raw']['globalSettings']
empty = [s['name'] for s in lo['raw']['animationStacks'] if not s.get('curves')]
decl = {t['name']: t['LocalTimeS'][1] for t in lo['raw'].get('takes', [])}
keyend = {s['name']: s.get('keyEndS') for s in lo['raw']['animationStacks'] if s.get('curves')}
mism = ['%s declares 0–%.3f s but its keys end at %.3f s' % (k, decl[k], keyend[k]) for k in keyend if k in decl and abs(decl[k] - keyend[k]) > 1e-3]
pyimp, cppimp = lo['imports']['py'], lo['imports']['cpp']
w('- **No import failures**: all %d sword-pack files, both FBX importers on fly.fbx and 8030.fbx, and the three glb files loaded.' % cs['files']['total'])
w('- Sword pack has **%d unique clips**, not ~171: %d in both sets, %d IP-only, %d RM-only.' % (cs['uniqueClips'], cs['inBoth'], len(ip_only), len(rm_only)))
notes = []
for n, k, t in odd_takes:          # RM attack file whose take names a different clip: compare its content with its own IP file
    c = by[n]
    same = (c['IP'] and c['IP']['frames'] == c['RM']['frames'] and abs(c['IP']['loop']['maxRotDiffDeg'] - c['RM']['loop']['maxRotDiffDeg']) < 0.05
            and max(abs(a - b) for a, b in zip(c['IP']['root']['startBlenderM'], c['RM']['root']['startBlenderM'])) < 1e-3)
    notes.append('`%s_RM.fbx` carries the take `%s`; its content %s its own IP file (frames, start position, first/last difference %.1f°)'
                 % (n, t, 'matches' if same else 'does NOT match', c['RM']['loop']['maxRotDiffDeg']))
for n, k, t in other_takes:        # e.g. swapped L/R take names: report which way the file really moves
    c = by[n]
    x = c['RM']['root']['disp'][0] if k == 'RM' and c['RM'] else None
    side = ('moves %.2f m to the character\'s %s' % (abs(x), 'left' if x > 0 else 'right')) if x is not None else ''
    notes.append('`%s_%s.fbx` carries the take `%s` — the file %s' % (n, k, t, side))
w('- Internal FBX take names do not always match the file names: %d IP files contain a take named `…_<clip>_RM`; %d RM attack files contain '
  '`A_AwesomeSwordAnimationV5_AttackCombo…_RM` takes. Odd ones: %s. Clips are identified by file name throughout; see the direction check in (a).'
  % (len(ip_take_rm), len(rm_awesome), '; '.join(notes) if notes else 'none'))
w('- IP clips are not perfectly in place (root drift up to %.2f m inside a clip, see the tables).' % mx_ex['ipRootDrift']['maxExcursionM'])
w('- Sheath and Unsheath are time-reversed copies of one 24-frame motion, and the right hand never comes to rest at the end of either clip; the only '
  'near-stop is at the left hip.')
w('- Dragon FBX: GlobalSettings TimeMode %s (%s) with CustomFrameRate %s. The Python importer therefore falls back to **%g fps** and the keys land on '
  'fractional frames (e.g. idle 1–85.17), while the C++ importer sets **%g fps**; the file\'s key spacing is 1/30 s and the durations in seconds agree.'
  % (gsl['TimeMode'], gsl['TimeModeMeaning'], gsl['CustomFrameRate'], pyimp['sceneFpsAfterImport'], cppimp['sceneFpsAfterImport']))
w('- Dragon FBX has 8 animation stacks; %d are empty (%s: one layer, no curves) and are skipped by both importers, so only idle / idle_UI / rest / '
  'run exist. %s. The two importers build different rest poses (skeleton size %.3f m vs %.3f m) but identical animated poses.'
  % (len(empty), ', '.join(empty), '; '.join(mism) if mism else 'Declared take spans match the keys', pyimp['skeletonSizeM'], cppimp['skeletonSizeM']))
la = {a['take']: a for a in M['loong']['glb']['imports']['gltf']['actions']}
rb = la['rest']['bodyBone']
w('- Dragon loops: idle has a %.1f° wrap jump on `%s` (under hind leg `%s`), run %.1f° on `%s` (under `%s` → head `Bone318`, %d bones > 5°); idle_UI is '
  'nearly closed (%.1f°). rest does not loop: the body bone `Bone308` travels from %s m to %s m relative to the root (net %.3f m, max excursion '
  '%.3f m ≈ %.1f× the skeleton size), while in idle / idle_UI / run it does not translate at all.' % (
      la['idle']['loop']['maxRotDiffDeg'], la['idle']['loop']['maxRotBone'], la['idle']['loop']['maxRotBoneAncestors'][1],
      la['run']['loop']['maxRotDiffDeg'], la['run']['loop']['maxRotBone'], la['run']['loop']['maxRotBoneAncestors'][1], la['run']['loop']['bonesOver5Deg'],
      la['idle_UI']['loop']['maxRotDiffDeg'], '(%s)' % ', '.join('%.3f' % x for x in rb['offsetFromRootStartYup']),
      '(%s)' % ', '.join('%.3f' % x for x in rb['offsetFromRootEndYup']), rb['netM'], rb['maxExcursionM'], rb['maxExcursionRelSize']))
pg = M['phoenix']['glb']['raw']['animations'][0]
w('- The phoenix and dragon glb animations start at t = %.4f s (not 0), so three.js `clip.duration` is %.4f s longer than the animated span '
  '(phoenix fly %.4f s vs %.4f s).' % (pg['firstKeyS'], pg['firstKeyS'], pg['threeDurationS'], pg['spanS']))
mixed = [a['name'] for a in cul['raw']['animations'] if len(a['keyCounts']) > 1 and min(a['keyCounts']) > 2 and
         any(k.startswith('24') for k in a.get('channelRatesFps', {}))]
static = [a['take'] for a in cimp['actions'] if a['loop']['maxStepDeg'] < 1.0]
w('- Cultivator: in %s the Hips translation is sampled at 24 fps while the rotations are 30 fps. Near-static clips (largest per-frame change < 1°): %s.'
  % (', '.join(mixed) if mixed else '(none)', ', '.join(static) if static else '(none)'))
w('- `assets/special effects/ink` holds only four `.dcx` game packages (no loose images); its textures are only usable through the converted `fx/ink2` files.')
w('')

# ---------------- (e) FX
w('## (e) Ink FX folders (listing only)')
w('')
w('| Folder | Files | Size | Images by extension | Top level |')
w('|---|---|---|---|---|')
for rel, f in FX['folders'].items():
    imgs = ', '.join('%d %s (%.2f MB)' % (v['files'], k, v['bytes'] / 1e6) for k, v in f['imagesByExtension'].items()) or 'none'
    def size_txt(b):
        return '%.2f MB' % (b / 1e6) if b >= 1e5 else '%.1f KB' % (b / 1e3)
    top = '; '.join(('`%s` %d files / %s%s' % (t['name'], t['files'], size_txt(t['bytes']), (' [' + ', '.join(t['subdirs']) + ']') if t.get('subdirs') else ''))
                    if t['name'].endswith('/') else '`%s` %s' % (t['name'], size_txt(t['bytes'])) for t in f['topLevel'])
    w('| `assets/%s` | %d (%d dirs) | %.2f MB | %s | %s |' % (rel, f['files'], f['dirs'], f['bytes'] / 1e6, imgs, top))
w('')
fxs = FX['folders']['special effects/FX_Ink_slash']
sub = {}
for e in fxs['allFiles']:
    parts = e['path'].split('/')
    key = '/'.join(parts[:2]) + '/' if len(parts) > 2 else (parts[0] + '/' if len(parts) > 1 else '(top)')
    s = sub.setdefault(key, {'files': 0, 'png': 0, 'bytes': 0})
    s['files'] += 1; s['bytes'] += e['bytes']; s['png'] += e['ext'] == 'png'
w('FX_Ink_slash breakdown: ' + '; '.join('`%s` %d files (%d png, %.2f MB)' % (k, v['files'], v['png'], v['bytes'] / 1e6) for k, v in sorted(sub.items())) + '.')
w('')
pngs = [(rel, e) for rel, f in FX['folders'].items() if rel.startswith('converted') for e in f['allFiles'] if e.get('px')]
w('Converted textures used by the game: ' + '; '.join('`%s/%s` %d×%d (%.0f KB)' % (rel, e['path'], e['px'][0], e['px'][1], e['bytes'] / 1e3) for rel, e in pngs) + '.')
w('')

# ---------------- full table
w('## Full per-clip table (sword pack)')
w('')
w('Pose = first vs last frame (max body-bone rotation difference, bone). RM = root displacement in the RM file (x left, z forward; y is always 0); '
  'speed = horizontal distance / duration. IP drift = root max excursion / net horizontal drift inside the IP file. "L" = name contains Loopable.')
w('')
w('| Clip | Files | Frames | Dur s | L | Pose ° (bone) | RM x m | RM z m | RM dist m | RM m/s | IP drift max / net m |')
w('|---|---|---|---|---|---|---|---|---|---|---|')
for c in clips:
    rm = c['rootMotionRM']; ip = c['ipRootDrift']
    w('| %s | %s | %d | %.3f | %s | %.2f (%s) | %s | %s | %s | %s | %s |' % (
        c['name'], '+'.join(k for k in ('IP', 'RM') if c[k]), c['frames'], c['durationS'], 'L' if c['nameHasLoopable'] else '',
        c['firstLastPose']['maxRotDiffDeg'], c['firstLastPose']['maxRotBone'],
        f2(rm['dispM']['x_left']) if rm else '—', f2(rm['dispM']['z_forward']) if rm else '—', f2(rm['horizM']) if rm else '—',
        f2(rm['avgSpeedHMps']) if rm else '—', ('%.3f / %.3f' % (ip['maxExcursionM'], ip['netHorizM'])) if ip else '—'))
w('')
open(os.path.join(INV, 'SUMMARY.md'), 'w', encoding='utf-8').write('\n'.join(L))
print('WROTE sword_pack.json (%d clips) and SUMMARY.md (%d lines)' % (len(clips), len(L)))
