"""Fishing icons for Deepwick: fish, junk, a cooked fish and a brass rod, 32x32 each.

Drawn pixel by pixel to sit with the other item icons: dark outline, light from the
top left, three or four tones per material. Writes public/assets/sheets/icons_fish.png
as an 8 x 2 grid. Order must match FISH_ICON in src/data/items.ts.

    python tools/gen_fish.py
"""
import math
import os

import numpy as np
from PIL import Image

S = 32
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'sheets', 'icons_fish.png')
OUTLINE = (24, 14, 22, 255)


def hexc(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def cover(fn, ss=4):
    """boolean mask of pixels at least half covered by the shape fn(x, y) -> bool"""
    m = np.zeros((S, S), bool)
    for y in range(S):
        for x in range(S):
            n = 0
            for j in range(ss):
                for i in range(ss):
                    if fn(x + (i + 0.5) / ss, y + (j + 0.5) / ss):
                        n += 1
            m[y, x] = n * 2 >= ss * ss
    return m


def outline(img, mask):
    px = img.load()
    for y in range(S):
        for x in range(S):
            if mask[y, x]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < S and 0 <= yy < S and mask[yy, xx]:
                    px[x, y] = OUTLINE
                    break


def fish(spec):
    """a side-on fish facing right"""
    cx, cy = spec.get('cx', 18.2), spec.get('cy', 16.5)
    rx, ry = spec.get('rx', 11.8) * spec.get('k', 1.0), spec.get('ry', 6.6) * spec.get('k', 1.0)
    tail = spec.get('tail', 5.4)

    def body(x, y):
        # a teardrop: blunter at the head (right), tapering to the tail
        u = (x - cx) / rx
        k = ry * (1.0 - 0.18 * max(0.0, -u))
        return u * u + ((y - cy) / k) ** 2 <= 1.0

    tx0 = cx - rx + 1.2

    def tailf(x, y):
        if x > tx0 + 0.5 or x < tx0 - tail:
            return False
        t = (tx0 - x) / tail
        half = 1.2 + t * ry * 0.95
        if abs(y - cy) > half:
            return False
        # forked
        return not (t > 0.55 and abs(y - cy) < (t - 0.55) * ry * 1.4)

    def dorsal(x, y):
        x0, x1 = cx - rx * 0.45, cx + rx * 0.25
        if not (x0 <= x <= x1):
            return False
        t = (x - x0) / (x1 - x0)
        top = cy - ry * 0.75 - spec.get('dorsal', 3.2) * math.sin(t * math.pi) ** 0.8 * (1.1 - t * 0.5)
        return top <= y <= cy - ry * 0.6

    def belly_fin(x, y):
        x0, x1 = cx - rx * 0.2, cx + rx * 0.2
        if not (x0 <= x <= x1):
            return False
        t = (x - x0) / (x1 - x0)
        return cy + ry * 0.6 <= y <= cy + ry * 0.75 + 2.2 * math.sin(t * math.pi)

    mb = cover(body)
    mfin = cover(lambda x, y: (tailf(x, y) or dorsal(x, y) or belly_fin(x, y)) and not body(x, y))
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    px = img.load()
    back, mid, belly, fin = (hexc(c) for c in spec['cols'])
    fin_dark = tuple(int(v * 0.7) for v in fin[:3]) + (255,)
    for y in range(S):
        for x in range(S):
            if mfin[y, x]:
                # fin rays: alternate stripes
                px[x, y] = fin if (x + y) % 3 else fin_dark
            if mb[y, x]:
                v = (y + 0.5 - cy) / ry  # -1 top .. 1 bottom
                c = back if v < -0.35 else (mid if v < 0.35 else belly)
                px[x, y] = c
    # pattern
    pat = spec.get('pattern')
    for y in range(S):
        for x in range(S):
            if not mb[y, x]:
                continue
            v = (y + 0.5 - cy) / ry
            u = (x + 0.5 - cx) / rx
            if pat == 'bars' and v < 0.45 and u < 0.45 and int((x - cx + 40) // 3) % 2 == 0:
                px[x, y] = hexc(spec['pat'])
            elif pat == 'spots' and v < 0.1 and (x * 7 + y * 13) % 11 == 0:
                px[x, y] = hexc(spec['pat'])
            elif pat == 'stripe' and abs(v - 0.05) < 0.17:
                px[x, y] = hexc(spec['pat'])
            elif pat == 'line' and abs(v) < 0.12 and u < 0.5:
                px[x, y] = hexc(spec['pat'])
            elif pat == 'scales' and v < 0.5 and u < 0.55 and (x + (y // 2) * 2) % 4 == 0 and y % 2 == 0:
                px[x, y] = hexc(spec['pat'])
            elif pat == 'glow' and v < 0.3 and (x * 5 + y * 3) % 9 == 0:
                px[x, y] = hexc(spec['pat'])
            elif pat == 'facets' and (abs((x - cx) - (y - cy) * 1.2) % 5 < 0.9) and u < 0.5:
                px[x, y] = hexc(spec['pat'])
    # gill line and a sheen along the back
    gx = int(cx + rx * 0.45)
    for y in range(S):
        if mb[y, gx] and abs(y + 0.5 - cy) < ry * 0.65:
            px[gx, y] = tuple(int(v * 0.75) for v in px[gx, y][:3]) + (255,)
    for x in range(S):
        col = [y for y in range(S) if mb[y, x]]
        if col and cx - rx * 0.4 < x < cx + rx * 0.5:
            y0 = col[0] + 1
            if y0 < S and mb[y0, x]:
                r, g, b, _ = px[x, y0]
                px[x, y0] = (min(255, r + 45), min(255, g + 45), min(255, b + 45), 255)
    outline(img, mb | mfin)
    # eye
    ex, ey = int(cx + rx * 0.62), int(cy - ry * 0.25)
    px[ex, ey] = (250, 250, 240, 255)
    px[ex, ey + 1] = (250, 250, 240, 255)
    px[ex + 1, ey] = (250, 250, 240, 255)
    px[ex + 1, ey + 1] = (16, 10, 16, 255)
    # mouth
    mx, my = int(cx + rx) - 1, int(cy + ry * 0.2)
    if 0 <= mx < S:
        px[mx, my] = OUTLINE
    return img, px, mb


def perch():
    img, px, _ = fish({'cols': ['#3f6a2a', '#8cb84a', '#ece2a2', '#d8642a'], 'pattern': 'bars', 'pat': '#34561f'})
    return img


def trout():
    img, px, _ = fish({'cols': ['#465a66', '#9aaaa0', '#ecece2', '#8a9a90'], 'pattern': 'stripe', 'pat': '#e0788a', 'rx': 11.6, 'ry': 6.0})
    # dark speckles on the back
    for x, y in ((10, 12), (13, 13), (16, 12), (19, 13), (12, 15), (17, 15), (8, 14)):
        if px[x, y][3] and px[x, y] != OUTLINE:
            px[x, y] = (40, 34, 40, 255)
    return img


def goldcarp():
    img, px, _ = fish({'cols': ['#b0661e', '#f0b02c', '#fff0a8', '#e8922c'], 'pattern': 'scales', 'pat': '#ffe070', 'ry': 7.6, 'dorsal': 3.6})
    # whiskers
    px[27, 18] = OUTLINE
    px[28, 19] = OUTLINE
    return img


def minnow():
    img, px, _ = fish({'cols': ['#56677a', '#a2b2c4', '#dfe8f0', '#8a9ab0'], 'pattern': 'line', 'pat': '#3a4656', 'rx': 10.0, 'ry': 4.4, 'tail': 5.0, 'dorsal': 2.4})
    return img


def glowfin():
    img, px, mask = fish({'cols': ['#0c5858', '#1aa0a0', '#7cf0d8', '#8affe8'], 'pattern': 'glow', 'pat': '#c8fff0', 'dorsal': 4.4})
    return img


def crystalcarp():
    img, px, mask = fish({'cols': ['#56389a', '#a07ae0', '#e2d4ff', '#c8b0ff'], 'pattern': 'facets', 'pat': '#c8b4ff', 'ry': 7.0, 'cy': 18.0})
    # crystal spikes along the back
    for bx, h in ((11, 4), (14, 5), (17, 4)):
        for k in range(h):
            y = 10 - k
            for x in (bx, bx + 1) if k < h - 1 else (bx,):
                if 0 <= y < S:
                    px[x, y] = (240, 230, 255, 255) if x == bx else (170, 140, 240, 255)
        px[bx - 1, 10 - h + 1] = OUTLINE
        px[bx, 10 - h] = OUTLINE
        if px[bx + 2, 10 - h + 2][3] == 0:
            px[bx + 2, 10 - h + 2] = OUTLINE
    return img


def voidangler():
    img, px, mask = fish({'cols': ['#160f2a', '#2e2452', '#4c3c78', '#3a2c66'], 'pattern': None, 'ry': 7.8, 'rx': 11.0, 'cx': 17.0, 'cy': 18.5, 'dorsal': 2.0})
    # jaw with teeth
    for x in range(21, 26):
        px[x, 20] = OUTLINE
        if x % 2 == 0:
            px[x, 19] = (240, 236, 220, 255)
    # lure: a stalk curving forward to a glowing bulb
    for (x, y) in ((16, 10), (17, 8), (18, 7), (19, 6), (21, 6), (22, 7)):
        px[x, y] = (90, 70, 130, 255)
    px[20, 5] = (90, 70, 130, 255)
    for (x, y) in ((22, 8), (23, 8), (22, 9), (23, 9)):
        px[x, y] = (255, 236, 150, 255)
    px[22, 8] = (255, 255, 230, 255)
    for (x, y) in ((21, 8), (21, 9), (24, 8), (24, 9), (22, 10), (23, 10), (22, 7), (23, 7)):
        if px[x, y][3] == 0:
            px[x, y] = (200, 150, 60, 255)
    return img


def oldboot():
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    px = img.load()
    dark, mid, light, hi = hexc('#3a2214'), hexc('#6a4024'), hexc('#8c5a32'), hexc('#ad7646')

    def shape(x, y):
        # the leg of the boot, a little wider at the cuff
        if 7.5 <= x <= 18.5 - (y - 4) * 0.05 and 3.5 <= y <= 22:
            return True
        # the foot with a rounded toe
        if 7.5 <= x <= 28.5 and 15.5 <= y <= 25.5:
            if x > 22:
                return ((x - 22) / 6.5) ** 2 + ((y - 21.5) / 4.6) ** 2 <= 1.0 or y >= 23.5 and x < 27.5
            return True
        return False

    m = cover(shape)
    for y in range(S):
        for x in range(S):
            if not m[y, x]:
                continue
            c = mid
            if x <= 9 or (y >= 17 and y <= 18 and x > 18):
                c = light
            if x >= 17 and y < 16:
                c = dark
            if y <= 5:
                c = hi if x < 17 else light
            if y >= 25:
                c = hexc('#22140c')
            px[x, y] = c
    # a heel under the back of the boot
    for x in range(7, 12):
        px[x, 26] = hexc('#22140c')
    m[26, 7:12] = True
    # creases at the ankle
    for (x, y) in ((11, 13), (12, 14), (13, 14), (14, 15), (12, 10), (13, 11), (14, 11)):
        px[x, y] = dark
    # laces up the front
    for y in range(7, 17, 3):
        px[16, y] = hexc('#e0d0a8')
        px[17, y + 1] = hexc('#e0d0a8')
    # a hole worn through the toe
    px[25, 20] = hexc('#140a06')
    px[26, 20] = hexc('#140a06')
    px[25, 21] = hexc('#140a06')
    outline(img, m)
    # pond water still dripping off it
    for (x, y) in ((29, 27), (30, 29), (5, 28)):
        px[x, y] = hexc('#62aee0')
    return img


def cookedfish():
    img, px, mask = fish({'cols': ['#7a3e16', '#c8782e', '#e8b060', '#a85a22'], 'pattern': None, 'ry': 6.4})
    # grill marks
    for k in range(3):
        x0 = 11 + k * 4
        for j in range(7):
            x, y = x0 + j // 2, 12 + j
            if mask[y, x]:
                px[x, y] = (60, 30, 14, 255)
    # a herb sprig
    for (x, y) in ((20, 11), (21, 10), (22, 11)):
        px[x, y] = (90, 160, 60, 255)
    return img


def brassrod():
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    px = img.load()
    m = np.zeros((S, S), bool)
    # the rod: a line from the handle (bottom left) to the tip (top right)
    for i in range(0, 27):
        x = 3 + i
        y = 28 - i
        w = 2 if i < 9 else 1
        for k in range(w):
            if 0 <= x + k < S:
                m[y, x + k] = True
                px[x + k, y] = hexc('#3a2418') if i < 9 else (hexc('#c89a3a') if i % 6 else hexc('#7a5a20'))
    # brass reel
    for (x, y) in ((8, 20), (9, 20), (8, 21), (9, 21), (7, 21), (10, 20), (8, 19), (9, 22)):
        m[y, x] = True
        px[x, y] = hexc('#e0b048')
    px[8, 20] = hexc('#fff0a0')
    outline(img, m)
    # the line hanging from the tip
    for y in range(4, 16):
        px[29, y] = (230, 230, 240, 200)
    px[29, 16] = hexc('#e04040')
    px[29, 17] = hexc('#f0f0f0')
    return img


ICONS = [perch, trout, goldcarp, minnow, glowfin, crystalcarp, voidangler, oldboot, cookedfish, brassrod]


def main():
    sheet = Image.new('RGBA', (S * 8, S * 2), (0, 0, 0, 0))
    for i, fn in enumerate(ICONS):
        sheet.paste(fn(), ((i % 8) * S, (i // 8) * S))
    sheet.save(OUT)
    print('wrote', os.path.abspath(OUT))


if __name__ == '__main__':
    main()
