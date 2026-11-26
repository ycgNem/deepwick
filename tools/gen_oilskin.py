"""The Oilskin Sou'wester icon (32x32), drawn pixel by pixel like the other hand-made icons:
dark outline, light from the top left, a four-tone waxed-yellow ramp, rain beading on it.
Pastes it into public/assets/sheets/icons_fish.png at slot 17 (row 2, column 1).

    python tools/gen_oilskin.py
"""
import math
import os

from PIL import Image

S = 32
SHEET = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'sheets', 'icons_fish.png')
SLOT = 17
OUTLINE = (24, 14, 22, 255)
RAMP = [(122, 70, 18, 255), (192, 120, 26, 255), (238, 180, 44, 255), (255, 226, 120, 255)]
INNER = (86, 48, 16, 255)
DROP = (190, 226, 255, 255)
GLINT = (255, 255, 255, 255)


def crown(x, y):
    """the dome: an upright half-ellipse sitting on the brim"""
    cx, cy, rx, ry = 15.5, 15.0, 7.2, 8.0
    if y > 17.2:
        return None
    d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
    if d > 1:
        return None
    nx = (x - cx) / rx
    ny = (y - cy) / ry
    return -(nx * 0.65 + ny * 0.75)


def brim(x, y):
    """a wide brim, short at the front (left) and long and drooping at the back (right)"""
    cx, cy = 16.0, 19.0
    rx = 11.0 if x < cx else 13.5
    droop = max(0.0, (x - cx)) * 0.16
    ry = 2.9 + max(0.0, (x - cx)) * 0.05
    d = ((x - cx) / rx) ** 2 + ((y - cy - droop) / ry) ** 2
    if d > 1:
        return None
    # the top of the brim catches the light, the underside is in shadow
    t = (y - (cy + droop)) / ry
    return -t * 0.9 - (x - cx) / rx * 0.25


def main():
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    px = img.load()
    mask = [[False] * S for _ in range(S)]
    ss = 4
    for y in range(S):
        for x in range(S):
            hits_c, hits_b, lc, lb = 0, 0, 0.0, 0.0
            for j in range(ss):
                for i in range(ss):
                    fx = x + (i + 0.5) / ss
                    fy = y + (j + 0.5) / ss
                    c = crown(fx, fy)
                    if c is not None:
                        hits_c += 1
                        lc += c
                        continue
                    b = brim(fx, fy)
                    if b is not None:
                        hits_b += 1
                        lb += b
            n = ss * ss
            if hits_c + hits_b < n * 0.45:
                continue
            mask[y][x] = True
            if hits_c >= hits_b:
                lv = lc / max(1, hits_c)
            else:
                lv = lb / max(1, hits_b) - 0.15
            k = 0 if lv < -0.45 else 1 if lv < 0.05 else 2 if lv < 0.5 else 3
            px[x, y] = RAMP[k]
    # the underside of the brim where it meets the crown, in deep shadow
    for x in range(9, 23):
        for y in range(19, 23):
            if mask[y][x] and not mask[y - 1][x] is False and brim(x + 0.5, y + 0.5) is not None and crown(x + 0.5, y - 2.5) is not None and y >= 20:
                px[x, y] = INNER
    # the band round the crown, and a seam up its middle
    for x in range(S):
        for y in (16,):
            if mask[y][x] and crown(x + 0.5, y + 0.5) is not None:
                px[x, y] = RAMP[1]
    for y in range(9, 16):
        if mask[y][15]:
            px[15, y] = RAMP[1] if y > 10 else RAMP[2]
    # chin tie hanging from the front of the brim
    for y in range(22, 27):
        x = 10 - (y - 22) // 3
        mask[y][x] = True
        px[x, y] = RAMP[1]
    # outline
    out = img.copy()
    opx = out.load()
    for y in range(S):
        for x in range(S):
            if mask[y][x]:
                continue
            if any(0 <= x + dx < S and 0 <= y + dy < S and mask[y + dy][x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                opx[x, y] = OUTLINE
    # rain beading on it, and a drop running off the back of the brim
    for (x, y) in ((12, 11), (18, 13), (21, 18), (7, 18)):
        if mask[y][x]:
            opx[x, y] = DROP
            if mask[y - 1][x]:
                opx[x, y - 1] = GLINT
    for (x, y, c) in ((27, 25, DROP), (27, 26, DROP), (27, 27, GLINT), (28, 29, DROP)):
        opx[x, y] = c
    sheet = Image.open(SHEET).convert('RGBA')
    sx, sy = (SLOT % 8) * S, (SLOT // 8) * S
    sheet.paste((0, 0, 0, 0), (sx, sy, sx + S, sy + S))
    sheet.paste(out, (sx, sy), out)
    sheet.save(SHEET)
    out.resize((S * 8, S * 8), Image.NEAREST).save(os.path.join(os.environ.get('PREVIEW_DIR', '.'), 'oilskin_preview.png'))
    print('wrote slot', SLOT)


if __name__ == '__main__':
    main()
