"""Download a PixelLab animate_image job's frames and pack them into a horizontal strip.

usage: python tools/fetch_anim.py <job_id> <out_strip.png> [frame_count]
Frame 0 is the original input frame; the generated frames follow it.
"""
import io
import sys
import time
import urllib.request

from PIL import Image

job, out = sys.argv[1], sys.argv[2]
count = int(sys.argv[3]) if len(sys.argv) > 3 else 9
frames = []
for i in range(count):
    url = f'https://api.pixellab.ai/mcp/images/{job}/download?index={i}'
    for attempt in range(20):
        try:
            with urllib.request.urlopen(url) as r:
                frames.append(Image.open(io.BytesIO(r.read())).convert('RGBA'))
            break
        except urllib.error.HTTPError as e:
            if e.code == 423:
                time.sleep(5)
                continue
            raise
w, h = frames[0].size
strip = Image.new('RGBA', (w * len(frames), h))
for i, f in enumerate(frames):
    strip.paste(f, (i * w, 0))
strip.save(out)
print(out, len(frames), (w, h))
