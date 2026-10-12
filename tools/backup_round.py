# 每轮改动前的备份：代码与文档（不含 assets/、backups/、docs 下的录像与截图）打成一个 zip。
# 内容与以前各轮的备份一致：根目录文件、.claude/、chinese_tower/、src/、tools/（去掉 __pycache__）、vendor/、docs/*.md
# 用法：python -I tools/backup_round.py <项目根> <输出.zip>
import sys, os, zipfile

root, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
dirs = ['.claude', 'chinese_tower', 'src', 'tools', 'vendor']
files = ['.gitignore', 'README.md', 'index.html', 'serve.py', 'style.css']
n = size = 0
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for f in files:
        p = os.path.join(root, f)
        if os.path.isfile(p):
            z.write(p, f); n += 1; size += os.path.getsize(p)
    for d in dirs:
        for base, subs, names in os.walk(os.path.join(root, d)):
            subs[:] = [s for s in subs if s != '__pycache__']
            for name in names:
                p = os.path.join(base, name)
                z.write(p, os.path.relpath(p, root)); n += 1; size += os.path.getsize(p)
    for name in sorted(os.listdir(os.path.join(root, 'docs'))):
        p = os.path.join(root, 'docs', name)
        if os.path.isfile(p) and name.endswith('.md'):
            z.write(p, 'docs/' + name); n += 1; size += os.path.getsize(p)
print('BACKUP', out, n, 'files', round(size / 1e6, 1), 'MB before compression', round(os.path.getsize(out) / 1e6, 1), 'MB zip')
