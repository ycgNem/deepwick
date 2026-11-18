"""Pack the survival-update art from art_raw/v2 into public/assets.

usage: python tools/pack_v2.py   (run from the deepwick folder)
"""
import os
import shutil

from PIL import Image

RAW = 'art_raw/v2'
OUT = 'public/assets'


def sheet(folder: str, out: str) -> None:
    s = Image.new('RGBA', (16 * 32, 32))
    for i in range(16):
        s.paste(Image.open(f'{RAW}/{folder}/tile_{i}.png').convert('RGBA'), (i * 32, 0))
    s.save(out)


sheet('rock32', f'{OUT}/sheets/rock32.png')
sheet('ore32', f'{OUT}/sheets/ore32.png')
shutil.copy(f'{RAW}/icons_n32.png', f'{OUT}/sheets/icons_n32.png')

# the oak came standing on a little floating island: keep only the grass lip
oak = Image.open(f'{RAW}/oak.png').convert('RGBA')
oak.crop((0, 0, oak.width, 107)).save(f'{OUT}/camp/oak.png')
for name in ('birch', 'bed'):
    im = Image.open(f'{RAW}/{name}.png').convert('RGBA')
    bb = im.getbbox()
    if bb:
        im = im.crop((0, 0, im.width, bb[3]))
    im.save(f'{OUT}/camp/{name}.png')

for name in ('rabbit', 'boar', 'hollow'):
    p = f'{RAW}/{name}_strip.png'
    if os.path.exists(p):
        shutil.copy(p, f'{OUT}/enemies/{name}.png')

if os.path.exists(f'{RAW}/daysky2.png'):
    shutil.copy(f'{RAW}/daysky2.png', f'{OUT}/bg/day.png')
print('packed')
