# 第二十九轮（照第二十八轮的同名脚本，只换了文件名前缀 r29_）：把录下的帧做成带配音的 MP4 与联系表；配音里另有录像记下的音乐（演出音乐从 33 秒处起、场景音乐的压低、收刀前后的让开）。
# 每段：<rec>/<name>/r29_<name>_*.jpg（帧）、<rec>/aux/<name>_events.json（音效记录）、<rec>/aux/<name>_stem.wav（页面里离线渲染的合成音轨）
#   1) Blender 跑 tools/r19_mix_audio.py：音效库的录音 + stem= 合成音 → <rec>/aux/<name>_mix.wav
#   2) Blender 跑 tools/r16_encode.py：帧 + 配音 → <out>/r29_<name>.mp4（绝对路径、ASCII 目录；见记忆：相对路径会写不出来）
#   3) tools/r16_frames_sheet.py：等距取 n 帧 → <sheets>/r29_<name>_sheet.jpg
#   4) tools/r25_audio_check.py：各段声音的峰值与 RMS（看收刀清响是否突出）
# 用法：python -I tools/r29_make_media.py <blender.exe> <rec 目录> <mp4 输出目录（ASCII）> <联系表目录> name1 [name2 …]
import sys, os, subprocess, json

sys.stdout.reconfigure(encoding='utf-8', errors='replace')      # 控制台是 GBK 时，子进程输出里的替换字符也能打印

BL, REC, OUT, SHEETS = sys.argv[1:5]
names = sys.argv[5:]
HERE = os.path.dirname(os.path.abspath(__file__))
BANK = os.path.join(os.path.dirname(HERE), 'assets', 'converted', 'sfx')


def run(args, tag):
    p = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', errors='replace')
    lines = [l for l in (p.stdout + p.stderr).splitlines() if any(k in l for k in ('MIXED', 'ENCODED', 'Error', 'Traceback', 'frames ->'))]
    print(f'[{tag}]', ' | '.join(lines) if lines else f'(exit {p.returncode})')
    return p.returncode


for n in names:
    frames = os.path.join(REC, n)
    ev = os.path.join(REC, 'aux', f'{n}_events.json')
    stem = os.path.join(REC, 'aux', f'{n}_stem.wav')
    mix = os.path.join(REC, 'aux', f'{n}_mix.wav')
    mp4 = os.path.join(OUT, f'r29_{n}.mp4')
    cnt = len([f for f in os.listdir(frames) if f.startswith(f'r29_{n}_') and f.endswith('.jpg')])
    rec = json.load(open(ev, encoding='utf-8'))
    print(f'== {n}: {cnt} frames (recorded {rec["frames"]}), {rec["secs"]} s')
    if cnt != rec['frames']:
        print('   frame count mismatch — skipped'); continue
    args = [BL, '-b', '--factory-startup', '--python', os.path.join(HERE, 'r19_mix_audio.py'), '--', ev, BANK, mix]
    if os.path.exists(stem):
        args.append('stem=' + stem)
    run(args, 'mix')
    run([BL, '-b', '--factory-startup', '--python', os.path.join(HERE, 'r16_encode.py'), '--', frames, f'r29_{n}_', mp4, str(rec['fps']), '960', '540', 'audio=' + mix], 'encode')
    k = 20 if rec['secs'] > 20 else 16
    run([sys.executable, '-I', os.path.join(HERE, 'r16_frames_sheet.py'), frames, f'r29_{n}_', os.path.join(SHEETS, f'r29_{n}_sheet.jpg'), str(k), '4', '480', str(rec['fps'])], 'sheet')
    subprocess.run([sys.executable, '-I', os.path.join(HERE, 'r25_audio_check.py'), mix, ev])
