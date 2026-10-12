# 第二十五轮：把上传到 docs/screenshots 的录像帧、音效记录、合成音轨搬到录像工作目录（每段一个文件夹）。
# 用法：python -I tools/r25_collect.py <docs/screenshots> <rec 目录> name1 [name2 …]
#   r25_<name>_00000.jpg … → <rec>/<name>/；r25_<name>_events.jpg → <rec>/aux/<name>_events.json；r25stem_<name>.jpg → <rec>/aux/<name>_stem.wav
# 已有的同名文件夹先改名为 <name>_old<n>（不删）。
import sys, os, re, shutil

src, rec = sys.argv[1], sys.argv[2]
names = sys.argv[3:]
os.makedirs(os.path.join(rec, 'aux'), exist_ok=True)
for n in names:
    d = os.path.join(rec, n)
    if os.path.exists(d):
        k = 1
        while os.path.exists(f'{d}_old{k}'):
            k += 1
        os.rename(d, f'{d}_old{k}')
        for suf in ('events.json', 'stem.wav', 'mix.wav'):
            f = os.path.join(rec, 'aux', f'{n}_{suf}')
            if os.path.exists(f):
                os.rename(f, os.path.join(rec, 'aux', f'{n}_old{k}_{suf}'))
    os.makedirs(d)
    pat = re.compile(rf'^r25_{re.escape(n)}_(\d+)\.jpg$')
    cnt = 0
    for f in sorted(os.listdir(src)):
        if pat.match(f):
            shutil.move(os.path.join(src, f), os.path.join(d, f)); cnt += 1
    ev = os.path.join(src, f'r25_{n}_events.jpg')
    if os.path.exists(ev):
        shutil.move(ev, os.path.join(rec, 'aux', f'{n}_events.json'))
    st = os.path.join(src, f'r25stem_{n}.jpg')
    if os.path.exists(st):
        shutil.move(st, os.path.join(rec, 'aux', f'{n}_stem.wav'))
    print(n, cnt, 'frames', 'events' if os.path.exists(os.path.join(rec, 'aux', f'{n}_events.json')) else 'NO events', 'stem' if os.path.exists(os.path.join(rec, 'aux', f'{n}_stem.wav')) else 'no stem')
