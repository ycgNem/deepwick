"""Pack the PixelLab miner animations into one 68x68-cell sheet (one row per animation).

Rows: idle, walk, jump, hurt, swing, climb. The miner is drawn empty-handed: tools are
drawn by the game, in hand, only while they are swung (see drawPlayer in src/render.ts).

Sources (PixelLab character 18f3a3ef..., state "Empty Hands"):
- idle3 / walk3 / jump3 / hurt3 / climb3: animations of the empty-handed state
- chop: the original pickaxe "mine" animation with the pickaxe painted out (edit_animation),
  so the swing keeps the timing the game was tuned for

All frames are 68x68 with the feet on y=57. Frames listed in SKIP are left out (hurt3's
last two frames carry stray debris pixels).
"""
import glob
import os
from PIL import Image

BASE = 'art_raw/player/empty/'
ROWS = [('idle3', 'east'), ('walk3', 'east'), ('jump3', 'east'), ('hurt3', 'east'), ('chop', 'east'), ('climb3', 'north')]
SKIP = {('hurt3', 5), ('hurt3', 6)}
CELL = 68
COLS = 9


def frame_no(path: str) -> int:
    return int(os.path.basename(path)[:-4])


sheet = Image.new('RGBA', (CELL * COLS, CELL * len(ROWS)))
for r, (name, d) in enumerate(ROWS):
    files = sorted(glob.glob(f'{BASE}{name}/{d}/*.png'), key=frame_no)
    n = 0
    for f in files:
        c = frame_no(f)
        if (name, c) in SKIP or c >= COLS:
            continue
        im = Image.open(f).convert('RGBA')
        assert im.size == (CELL, CELL), (f, im.size)
        sheet.alpha_composite(im, (c * CELL, r * CELL))
        n += 1
    print(name, n)
sheet.save('public/assets/player/miner.png')
