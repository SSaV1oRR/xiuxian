# 第二十六轮：第三组水墨素材（项目作者新放的 assets/special effects/ink/Realistic Ying Yang Spells VFX Pack1.0.unitypackage，
#   Piloto Studio「Realistic Ying Yang Spells VFX Pack」1.0，只读）→ 贴图集 assets/converted/fx/ink3/ink3.png + ink3.json。
# 包里的特效是 Unity 的 Shader Graph 粒子（网页里没有对应的运行时），这里只取贴图的形状（灰度覆盖度，0 透明 … 1 满墨；运行时按水墨色板着色），
#   与第二十三轮的 ink2 同一种用法（inkFx.js 的 Sprites：取 r 通道当覆盖度）：
#   taijiD / taijiL  yingyang_2：水墨笔意的太极（阴阳两半拆成两张：深的一半、浅的一半——各按自己的颜色画；透明度通道给外形）
#   splatF           Ink splat smudged 1：一束朝一侧喷出的墨（扇形的墨丝）
#   crack            GroundCrack_RadialPostExplody：地上放射的裂纹（中间一团）
#   leaf             bamboo_leaf_1：竹叶（2 × 2 片）
#   smudge           Liquid_smudge_pb_1：墨点溅开的四团（2 × 2）
#   stab             Fire_Stab：收向一点的一束刺线（取有内容的那一段）
#   cloud            yingyang_3：四朵云纹（2 × 2，透明度通道给外形）
#   stroke           InkStroke_Test_1：一笔干笔飞白（取有内容的那一段）
# 只用 tarfile.extractfile 按包里的 pathname 读出这几张，不解包、不写临时文件；原 .unitypackage 不改动。
# 用法：python -I tools/r26_build_ink3.py "<…/Realistic Ying Yang Spells VFX Pack1.0.unitypackage>" <输出目录（assets/converted/fx/ink3）>
import io, json, os, sys, tarfile
import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
WANT = {
    'yingyang_2.png': 'Assets/Piloto Studio/Textures/yingyang_2.png',
    'yingyang_3.png': 'Assets/Piloto Studio/Textures/yingyang_3.png',
    'splat': 'Assets/Piloto Studio/Textures/Ink splat smudged 1 or somethingidk.png',
    'crack': 'Assets/Piloto Studio/Textures/GroundCrack_RadialPostExplody.png',
    'leaf': 'Assets/Piloto Studio/Textures/bamboo_leaf_1.png',
    'smudge': 'Assets/Piloto Studio/Textures/Liquid_smudge_pb_1.png',
    'stab': 'Assets/Piloto Studio/Textures/Fire_Stab.png',
    'stroke': 'Assets/Piloto Studio/Textures/InkStroke_Test_1.png',
}


def read_package(path):
    got = {}
    with tarfile.open(path, 'r:gz') as t:
        entries = {}
        for m in t.getmembers():
            if not m.isfile():
                continue
            parts = [p for p in m.name.replace('\\', '/').split('/') if p and p != '.']
            if len(parts) == 2:
                entries.setdefault(parts[0], {})[parts[1]] = m
        want = {v: k for k, v in WANT.items()}
        for guid, e in entries.items():
            if 'pathname' not in e or 'asset' not in e:
                continue
            rel = t.extractfile(e['pathname']).read().decode('utf-8', 'replace').split('\n')[0].strip()
            if rel in want:
                got[want[rel]] = Image.open(io.BytesIO(t.extractfile(e['asset']).read()))
    missing = [k for k in WANT if k not in got]
    if missing:
        raise SystemExit('包里没找到：' + ', '.join(missing))
    return got


def f32(im, mode='RGBA'):
    return np.asarray(im.convert(mode)).astype(np.float32) / 255.0


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def fit(a, w, h):
    return np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)).astype(np.float32) / 255.0


def bbox_crop(a, thr=0.04, pad=8):
    ys, xs = np.where(a > thr)
    y0, y1, x0, x1 = max(0, ys.min() - pad), min(a.shape[0], ys.max() + pad), max(0, xs.min() - pad), min(a.shape[1], xs.max() + pad)
    return a[y0:y1, x0:x1], [int(x0), int(y0), int(x1 - x0), int(y1 - y0)]


def main():
    os.makedirs(OUT, exist_ok=True)
    I = read_package(SRC)
    W, H = 2048, 1024
    atlas = np.zeros((H, W), np.float32)
    meta = {'source': 'assets/special effects/ink/Realistic Ying Yang Spells VFX Pack1.0.unitypackage（Piloto Studio；tools/r26_build_ink3.py 取贴图的形状）', 'size': [W, H], 'sprites': {}}

    def put(name, a, x, y, w, h, grid, note):
        a = fit(a, w, h)
        atlas[y:y + h, x:x + w] = np.maximum(atlas[y:y + h, x:x + w], a)
        meta['sprites'][name] = {'rect': [x, y, w, h], 'grid': grid, 'src': note}

    ty = f32(I['yingyang_2.png']); al = ty[..., 3]; lum = ty[..., :3].mean(-1)
    put('taijiD', al * smooth(0.62, 0.22, lum), 0, 0, 512, 512, [1, 1], 'yingyang_2 深的一半与外圈（透明度 × 暗部）')
    put('taijiL', al * smooth(0.45, 0.85, lum), 512, 0, 512, 512, [1, 1], 'yingyang_2 浅的一半（透明度 × 亮部）')
    put('splatF', f32(I['splat'], 'L'), 1024, 0, 512, 512, [1, 1], 'Ink splat smudged 1（一束朝上喷出的墨丝：亮度即墨）')
    put('crack', f32(I['crack'], 'L'), 1536, 0, 512, 512, [1, 1], 'GroundCrack_RadialPostExplody（放射的裂纹：亮度即墨）')
    put('leaf', f32(I['leaf'], 'L'), 0, 512, 512, 512, [2, 2], 'bamboo_leaf_1（竹叶 2 × 2：亮度即形）')
    put('smudge', f32(I['smudge'], 'L'), 512, 512, 512, 512, [2, 2], 'Liquid_smudge_pb_1（溅开的墨点 2 × 2：亮度即墨）')
    st, sb = bbox_crop(f32(I['stab'], 'L'))
    put('stab', st, 1024, 512, 512, 256, [1, 1], f'Fire_Stab 裁到有内容的 {sb}（收向一点的刺线，尖在 +u 一端）')
    sk, kb = bbox_crop(f32(I['stroke'], 'L'))
    put('stroke', sk, 1024, 768, 512, 256, [1, 1], f'InkStroke_Test_1 裁到有内容的 {kb}（干笔飞白）')
    put('cloud', f32(I['yingyang_3.png'])[..., 3], 1536, 512, 512, 512, [2, 2], 'yingyang_3（云纹 2 × 2：透明度通道即形）')
    img = Image.fromarray(np.clip(atlas * 255 + 0.5, 0, 255).astype(np.uint8), 'L')
    img.save(os.path.join(OUT, 'ink3.png'), optimize=True)
    json.dump(meta, open(os.path.join(OUT, 'ink3.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('INK3', os.path.getsize(os.path.join(OUT, 'ink3.png')), json.dumps({k: v['rect'] for k, v in meta['sprites'].items()}))


if __name__ == '__main__':
    main()
