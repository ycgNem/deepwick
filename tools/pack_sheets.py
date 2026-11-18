"""Pack raw PixelLab tiles and icon candidates into game sheets.

rock.png / ore.png : 16 tiles of 16px in one row
icons16.png        : 64 icons, 8 per row
icons32.png        : 64 icons, 8 per row
"""
from PIL import Image
import os

os.makedirs('public/assets/sheets', exist_ok=True)


def row(src_dir, prefix, n, size, out):
    sheet = Image.new('RGBA', (size * n, size))
    for i in range(n):
        im = Image.open(f'{src_dir}/{prefix}{i}.png').convert('RGBA')
        sheet.paste(im, (i * size, 0))
    sheet.save(out)


def grid(src_dir, prefix, n, size, cols, out):
    rows = (n + cols - 1) // cols
    sheet = Image.new('RGBA', (size * cols, size * rows))
    for i in range(n):
        im = Image.open(f'{src_dir}/{prefix}{i}.png').convert('RGBA')
        r, c = divmod(i, cols)
        sheet.paste(im, (c * size, r * size))
    sheet.save(out)


row('art_raw/tiles_rock', 'tile_', 16, 16, 'public/assets/sheets/rock.png')
row('art_raw/tiles_ore', 'tile_', 16, 16, 'public/assets/sheets/ore.png')
grid('art_raw/icons16', 'frame_', 64, 16, 8, 'public/assets/sheets/icons16.png')
grid('art_raw/icons32', 'frame_', 64, 32, 8, 'public/assets/sheets/icons32.png')
print('ok')
