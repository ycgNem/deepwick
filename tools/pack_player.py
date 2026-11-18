"""Pack the PixelLab miner animations into one 68x68-cell sheet (one row per animation).

Rows: idle, walk, jump, hurt, mine, climb. 48px frames are centred into the 68px cell
(+10,+10) and nudged so the feet sit on the same baseline (y=57).
"""
import glob
from PIL import Image

BASE = 'art_raw/player/char/Idle/animations/'
ROWS = [('idle2', 'east', 0), ('walk2', 'east', 0), ('jump2', 'east', 0), ('hurt', 'east', 2), ('mine', 'east', 0), ('climb2', 'north', 0)]
CELL = 68
cols = 9
sheet = Image.new('RGBA', (CELL * cols, CELL * len(ROWS)))
for r, (name, d, dy) in enumerate(ROWS):
    files = sorted(glob.glob(f'{BASE}{name}/{d}/*.png'))
    for c, f in enumerate(files):
        im = Image.open(f).convert('RGBA')
        if im.width == 48:
            ox, oy = 10, 10 + dy
        else:
            ox, oy = 0, 0
        sheet.alpha_composite(im, (c * CELL + ox, r * CELL + oy))
    print(name, len(files))
sheet.save('public/assets/player/miner.png')
