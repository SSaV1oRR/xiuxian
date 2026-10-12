# 第十六轮：把录下的帧编码成 MP4（Blender 序列编辑器 + FFMPEG H.264；无须单独安装 ffmpeg）
# 用法：blender -b --factory-startup --python tools/r16_encode.py -- 帧目录 帧前缀 输出.mp4 [帧率=20] [宽=960 高=540]（第十八轮加了宽高，前后对照的拼接帧用）
#       第十九轮：末尾可再加 audio=配音.wav（tools/r19_mix_audio.py 混出的），合成 AAC 音轨
import bpy, sys, os, glob

argv = sys.argv[sys.argv.index('--') + 1:]
audio = next((a[6:] for a in argv if a.startswith('audio=')), None)
argv = [a for a in argv if not a.startswith('audio=')]
src, prefix, out = argv[0], argv[1], argv[2]
fps = int(argv[3]) if len(argv) > 3 else 20
W, H = (int(argv[4]), int(argv[5])) if len(argv) > 5 else (960, 540)
files = sorted(glob.glob(os.path.join(src, prefix + '*.jpg')))
assert files, 'no frames'
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
sc.render.fps = fps
sc.sequence_editor_create()
ed = sc.sequence_editor
strips = ed.strips if hasattr(ed, 'strips') else ed.sequences
st = strips.new_image(name='frames', filepath=files[0], channel=1, frame_start=1)
for f in files[1:]:
    st.elements.append(os.path.basename(f))
sc.frame_start, sc.frame_end = 1, len(files)
if audio:
    snd = strips.new_sound(name='audio', filepath=audio, channel=2, frame_start=1)
r = sc.render
r.image_settings.media_type = 'VIDEO'          # Blender 5：先选视频，file_format 才有 FFMPEG
r.image_settings.file_format = 'FFMPEG'
r.ffmpeg.format = 'MPEG4'
r.ffmpeg.codec = 'H264'
r.ffmpeg.constant_rate_factor = 'HIGH'
r.ffmpeg.ffmpeg_preset = 'GOOD'
r.ffmpeg.gopsize = fps * 2
if audio:
    r.ffmpeg.audio_codec = 'AAC'
    r.ffmpeg.audio_bitrate = 192
    r.ffmpeg.audio_channels = 'STEREO'
    r.ffmpeg.audio_mixrate = 44100
else:
    r.ffmpeg.audio_codec = 'NONE'
r.filepath = out
bpy.ops.render.render(animation=True)
print('ENCODED', out, len(files), 'frames', 'with audio ' + audio if audio else '')
