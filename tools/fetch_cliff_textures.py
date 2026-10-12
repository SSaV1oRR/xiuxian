# 崖壁贴图（第八轮）：从 Poly Haven 下载 CC0 岩面贴图（1k 漫反射 + OpenGL 法线），另存流畅画质用的 512 版本
#   python tools/fetch_cliff_textures.py        （需联网，仅离线准备素材时运行）
# marble_cliff_01（Amal Kumar）：竖向节理分明的岩壁，用作崖面主体（只取明暗与法线，颜色在着色器里统一成灰白、青灰、暖灰）
# cliff_side（James Ray Cock、Dario Barresi 摄影，Jenelle van Heerden 处理）：水平岩层，用作岩层带与岩台侧面
import io
import json
import os
import urllib.request

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'assets', 'tex')
LO = os.path.join(OUT, 'lo')
ITEMS = {'cliff': 'marble_cliff_01', 'strata': 'cliff_side'}


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'qinglan-sect-asset-prep'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


credits = {}
for name, pid in ITEMS.items():
    files = json.loads(get(f'https://api.polyhaven.com/files/{pid}'))
    info = json.loads(get(f'https://api.polyhaven.com/info/{pid}'))
    credits[name] = {'id': pid, 'authors': info.get('authors'), 'license': 'CC0', 'url': f'https://polyhaven.com/a/{pid}'}
    for key, suffix in (('Diffuse', 'd'), ('nor_gl', 'n')):
        im = Image.open(io.BytesIO(get(files[key]['1k']['jpg']['url']))).convert('RGB')
        im.save(os.path.join(OUT, f'{name}_{suffix}.jpg'), quality=90, optimize=True)
        im.resize((512, 512), Image.LANCZOS).save(os.path.join(LO, f'{name}_{suffix}.jpg'), quality=86, optimize=True)
        print('saved', name, suffix, im.size)
print(json.dumps(credits, ensure_ascii=False, indent=1))
