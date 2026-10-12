# Poly Haven（CC0）室内陈设：先取缩略图拼一张联系表，再下载 1k glTF（含 bin 与贴图）与作者信息。
# 仅在离线准备素材时运行（需联网）；游戏运行时不访问网络。
# 用法：python tools/fetch_interior.py thumbs            → 联系表 interior_contact.jpg
#       python tools/fetch_interior.py dl id1,id2,... 1k → 下载到 $INTERIOR_RAW（默认 ./_raw/interior）
import json, os, sys, urllib.request
from PIL import Image, ImageDraw, ImageFont

ROOT = os.getcwd()
OUT = os.environ.get('INTERIOR_RAW') or os.path.join(ROOT, '_raw', 'interior')
os.makedirs(OUT, exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) qinglan-asset-fetch'}

IDS = ['chinese_cabinet', 'chinese_commode', 'chinese_console_table', 'chinese_screen_panels', 'chinese_sofa',
       'chinese_stool', 'chinese_tea_table', 'chinese_armchair', 'chinese_chandelier', 'lantern_chandelier_01',
       'tea_set_01', 'ceramic_vase_01', 'ceramic_vase_02', 'ceramic_vase_03', 'ceramic_vase_04', 'antique_ceramic_vase_01',
       'brass_pot_01', 'brass_pot_02', 'wooden_bowl_02', 'wicker_basket_02', 'wooden_display_shelves_01', 'painted_wooden_shelves',
       'planter_pot_clay', 'wooden_candlestick', 'food_ginger_01', 'carved_wooden_plate', 'ceramic_pot', 'painted_wooden_cabinet',
       'brass_vase_03', 'brass_vase_04', 'jug_01', 'potted_plant_04']

def get(url, out):
    if os.path.exists(out) and os.path.getsize(out) > 0:
        return out
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=180) as r:
        data = r.read()
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'wb') as f:
        f.write(data)
    return out

mode = sys.argv[1] if len(sys.argv) > 1 else 'thumbs'
if mode == 'thumbs':
    tiles = []
    for i in IDS:
        p = os.path.join(OUT, 'thumbs', i + '.png')
        try:
            get(f'https://cdn.polyhaven.com/asset_img/thumbs/{i}.png?width=256&height=256', p)
            tiles.append((i, Image.open(p).convert('RGB').resize((200, 200))))
        except Exception as e:
            print('thumb fail', i, e)
    cols = 8
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * 200, rows * 222), (40, 40, 40))
    d = ImageDraw.Draw(sheet)
    for k, (i, im) in enumerate(tiles):
        x, y = (k % cols) * 200, (k // cols) * 222
        sheet.paste(im, (x, y))
        d.text((x + 4, y + 204), i[:30], fill=(230, 230, 230))
    sheet.save(os.path.join(ROOT, 'interior_contact.jpg'), quality=88)
    print('sheet ok', len(tiles))
else:
    ids = sys.argv[2].split(',') if len(sys.argv) > 2 else IDS
    res = sys.argv[3] if len(sys.argv) > 3 else '1k'
    for i in ids:
        try:
            req = urllib.request.Request(f'https://api.polyhaven.com/files/{i}', headers=UA)
            files = json.load(urllib.request.urlopen(req, timeout=60))
            g = files['gltf'][res]['gltf']
            d = os.path.join(OUT, i)
            get(g['url'], os.path.join(d, os.path.basename(g['url'])))
            for rel, inc in g.get('include', {}).items():
                get(inc['url'], os.path.join(d, rel))
            print('ok', i, g['size'] + sum(v['size'] for v in g.get('include', {}).values()))
        except Exception as e:
            print('fail', i, e)
    # 授权与作者
    meta = {}
    for i in ids:
        try:
            req = urllib.request.Request(f'https://api.polyhaven.com/info/{i}', headers=UA)
            info = json.load(urllib.request.urlopen(req, timeout=60))
            meta[i] = {'name': info.get('name'), 'authors': list((info.get('authors') or {}).keys()), 'polycount': info.get('polycount'), 'license': 'CC0'}
        except Exception as e:
            meta[i] = {'error': str(e)}
    with open(os.path.join(OUT, 'meta.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print('meta ok')
