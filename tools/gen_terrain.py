"""
Seamless terrain textures for Deepwick, drawn procedurally.

Every material is a tileable SxS image (sampled in world space, so the tile grid
disappears inside solid rock). Ores are separate 32x32 transparent overlays drawn
on top of whatever rock surrounds them.

Output:
  public/assets/sheets/terrain.png   one row of S x S textures, order = MATERIALS
  public/assets/sheets/ores.png      rows = ORES, 3 variants of 32x32 each
Run:  python tools/gen_terrain.py
"""
import math
import os
import random

import numpy as np
from PIL import Image

S = 128  # texture period in pixels (4 x 4 tiles)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'assets', 'sheets')


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def pal(*hs):
    return np.stack([hexc(h) for h in hs])


# ----------------------------------------------------------------------------- noise helpers
def tor_noise(size, cells, seed, octaves=3):
    """periodic value noise in [0,1]"""
    rng = np.random.default_rng(seed)
    out = np.zeros((size, size), np.float32)
    amp, tot = 1.0, 0.0
    c = cells
    for _ in range(octaves):
        g = rng.random((c, c)).astype(np.float32)
        ys = np.arange(size) * c / size
        xs = np.arange(size) * c / size
        y0 = np.floor(ys).astype(int)
        x0 = np.floor(xs).astype(int)
        fy = (ys - y0)[:, None]
        fx = (xs - x0)[None, :]
        fy = fy * fy * (3 - 2 * fy)
        fx = fx * fx * (3 - 2 * fx)
        y1 = (y0 + 1) % c
        x1 = (x0 + 1) % c
        a = g[y0][:, x0]
        b = g[y0][:, x1]
        cc = g[y1][:, x0]
        d = g[y1][:, x1]
        v = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + cc * (1 - fx) * fy + d * fx * fy
        out += v * amp
        tot += amp
        amp *= 0.5
        c *= 2
    return out / tot


def voronoi(size, n, seed, sx=1.0, sy=1.0, jitter=1.0):
    """toroidal voronoi: nearest id, d1, d2 (anisotropic distance)"""
    rng = random.Random(seed)
    # jittered grid keeps cells evenly sized
    g = max(1, int(round(math.sqrt(n))))
    pts = []
    for j in range(g):
        for i in range(g):
            pts.append(((i + 0.5 + (rng.random() - 0.5) * jitter) * size / g, (j + 0.5 + (rng.random() - 0.5) * jitter) * size / g))
    P = np.array(pts, np.float32)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    best = np.full((size, size), 1e9, np.float32)
    second = np.full((size, size), 1e9, np.float32)
    ids = np.zeros((size, size), np.int32)
    for k, (px, py) in enumerate(P):
        dx = np.abs(xx - px)
        dy = np.abs(yy - py)
        dx = np.minimum(dx, size - dx) * sx
        dy = np.minimum(dy, size - dy) * sy
        d = np.sqrt(dx * dx + dy * dy)
        closer = d < best
        second = np.where(closer, best, np.minimum(second, d))
        ids = np.where(closer, k, ids)
        best = np.where(closer, d, best)
    return ids, best, second, len(P)


def shade_from_height(h):
    """light from the upper left: +1 lit, -1 shadowed, 0 flat"""
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1))
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0))
    return -(gx * 0.7 + gy * 0.7)


def quantize(levels, palette):
    idx = np.clip(np.round(levels), 0, len(palette) - 1).astype(int)
    return palette[idx]


def to_img(rgb, alpha=None):
    a = np.full(rgb.shape[:2], 255, np.uint8) if alpha is None else alpha.astype(np.uint8)
    arr = np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), a])
    return Image.fromarray(arr, 'RGBA')


# ----------------------------------------------------------------------------- rock family
def rock(seed, palette, cells, crack=1.2, bevel=3.0, sx=1.0, sy=1.0, grit=0.05, base_lo=1.4, base_hi=3.4, macro=0.6, merge=0.38):
    """cobbled rock: voronoi plates with dark crevices and bevelled edges; some cracks fade
    out (merge) so plates fuse into irregular chunks instead of reading as paving"""
    n = len(palette)
    ids, d1, d2, npts = voronoi(S, cells, seed, sx, sy, jitter=1.6)
    rng = np.random.default_rng(seed + 1)
    tone = rng.uniform(base_lo, base_hi, npts).astype(np.float32)
    lv = tone[ids]
    edge = d2 - d1
    keep = tor_noise(S, 5, seed + 7, 2) > merge
    # where a crack fades the two plates share a tone, so they read as one chunk
    nb = np.roll(ids, 1, 1)
    edge = np.where(keep, edge, edge + 6)
    lv = np.where(~keep, (tone[ids] + tone[nb]) * 0.5, lv)
    h = np.clip(edge / bevel, 0, 1)
    lv = lv + shade_from_height(h) * 1.6
    lv += (tor_noise(S, 4, seed + 2, 2) - 0.5) * macro
    # grit
    gr = rng.random((S, S))
    lv = np.where(gr < grit, lv - 1, lv)
    lv = np.where(gr > 1 - grit * 0.6, lv + 1, lv)
    crev = edge < crack
    lv = np.where(crev, 0, lv)
    return quantize(np.clip(lv, 0, n - 1), palette), crev


def dirt(seed):
    P = pal('#20130a', '#311d0e', '#432914', '#56361b', '#6a4423', '#80542c')
    n = tor_noise(S, 6, seed, 3)
    m = tor_noise(S, 18, seed + 1, 2)
    lv = 2.6 + (n - 0.5) * 3.2 + (m - 0.5) * 1.6
    rngn = np.random.default_rng(seed)
    gr = rngn.random((S, S))
    lv = np.where(gr < 0.07, lv - 1, lv)
    lv = np.where(gr > 0.965, lv + 1, lv)
    # small dark clods
    ids, d1, d2, npts = voronoi(S, 220, seed + 2, 1, 1)
    clod = (rngn.random(npts) < 0.22)[ids] & ((d2 - d1) > 1.2) & (d1 < 2.2)
    lv = np.where(clod, lv - 1.2, lv)
    rgb = quantize(np.clip(lv, 0, 5), P)
    rng = random.Random(seed)
    img = rgb.copy()
    # pebbles
    stone = pal('#3a3430', '#5a524c', '#7c726a', '#9a9088')
    for _ in range(26):
        x, y = rng.randrange(S), rng.randrange(S)
        w, hgt = rng.choice([(3, 2), (2, 2), (4, 3), (3, 3)])
        for j in range(hgt):
            for i in range(w):
                c = 2 if (i == 0 or j == 0) else 1
                if i == w - 1 or j == hgt - 1:
                    c = 0
                if (i, j) in ((0, 0), (w - 1, 0), (0, hgt - 1), (w - 1, hgt - 1)) and w > 2:
                    continue
                img[(y + j) % S, (x + i) % S] = stone[c]
        img[y % S, (x + 1) % S] = stone[3]
    # roots
    root = hexc('#1c110a')
    for _ in range(5):
        x, y = rng.randrange(S), rng.randrange(S)
        ang = rng.uniform(0.6, 2.5)
        for s in range(rng.randint(8, 18)):
            img[int(y) % S, int(x) % S] = root
            x += math.cos(ang)
            y += math.sin(ang)
            ang += rng.uniform(-0.5, 0.5)
    return img


def clay(seed):
    P = pal('#2c1711', '#3e2118', '#522c1f', '#663827', '#7a4530', '#8f553b')
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    n = tor_noise(S, 4, seed, 3)
    band = np.sin((yy / S) * math.pi * 2 * 6 + n * 6) * 0.9
    lv = 2.6 + band + (tor_noise(S, 16, seed + 1, 2) - 0.5) * 1.2
    rng = np.random.default_rng(seed)
    lv = np.where(rng.random((S, S)) < 0.04, lv - 1, lv)
    return quantize(np.clip(lv, 0, 5), P)


def gravel(seed):
    P = pal('#16181e', '#262a32', '#3a3f4a', '#525866', '#6c7382', '#8a92a2')
    rgb, _ = rock(seed, P, 900, crack=0.9, bevel=1.4, base_lo=1.5, base_hi=4.2, grit=0.02, macro=0.4)
    # a few warm pebbles
    rng = np.random.default_rng(seed + 5)
    warm = pal('#3a2a20', '#5a4232', '#7a5c46')
    ids, d1, d2, npts = voronoi(S, 900, seed, 1, 1)
    pick = rng.random(npts) < 0.18
    m = pick[ids] & (d2 - d1 > 0.9)
    shade = np.clip(1 + shade_from_height(np.clip((d2 - d1) / 1.4, 0, 1)) * 1.5, 0, 2).round().astype(int)
    rgb = np.where(m[..., None], warm[shade], rgb)
    return rgb


def stone(seed):
    P = pal('#16161c', '#26262e', '#383842', '#4b4b56', '#61616d', '#7a7a86', '#9696a2')
    rgb, _ = rock(seed, P, 110, crack=1.1, bevel=3.2, base_lo=2.4, base_hi=4.4, grit=0.04)
    return rgb


def moss_stone(seed):
    P = pal('#121a14', '#1e2a20', '#2c3a2c', '#3c4a38', '#4e5c46', '#646e54', '#7c8466')
    rgb, crev = rock(seed, P, 100, crack=1.1, bevel=3.0, base_lo=2.2, base_hi=4.0, grit=0.04)
    moss = pal('#16301a', '#24481f', '#346424', '#4a822c', '#66a034')
    n = tor_noise(S, 6, seed + 9, 3)
    fine = tor_noise(S, 32, seed + 10, 1)
    m = (n + fine * 0.35) > 0.72
    yy = np.mgrid[0:S, 0:S][0]
    lv = np.clip(((n - 0.55) * 9 + fine * 2).round(), 0, 4).astype(int)
    out = np.where((m & ~crev)[..., None], moss[lv], rgb)
    return out


def grotto(seed):
    P = pal('#081418', '#0d2026', '#132e36', '#1a3e48', '#22505c', '#2e6672', '#3e7e88')
    rgb, crev = rock(seed, P, 60, crack=1.0, bevel=3.4, sx=0.7, sy=1.4, base_lo=2.0, base_hi=4.2, grit=0.03)
    # wet streaks
    rng = random.Random(seed)
    hi = hexc('#5aa0a6')
    for _ in range(10):
        x, y = rng.randrange(S), rng.randrange(S)
        for k in range(rng.randint(2, 4)):
            rgb[(y + k) % S, x] = hi if k == 0 else hexc('#3e7e88')
    return rgb


def crystal_rock(seed):
    P = pal('#1c1830', '#2a2446', '#3a325e', '#4c4478', '#605892', '#7a72ac', '#968fc6')
    rgb, crev = rock(seed, P, 70, crack=1.0, bevel=3.4, base_lo=2.3, base_hi=4.6, grit=0.03)
    rng = random.Random(seed)
    shard = pal('#6a3aa8', '#9a62e0', '#d0a8ff', '#f4e8ff')
    for _ in range(18):
        x, y = rng.randrange(S), rng.randrange(S)
        hgt = rng.randint(3, 6)
        for j in range(hgt):
            w = 1 if j < hgt - 2 else 2
            for i in range(w):
                c = 3 if j == 0 else (2 if i == 0 else 1)
                rgb[(y + j) % S, (x + i) % S] = shard[c]
        rgb[(y + hgt) % S, x % S] = shard[0]
    return rgb


def geode(seed):
    P = pal('#12061e', '#1e0c30', '#2c1244', '#3c1a5c', '#4e2276', '#642c92', '#7e3cb0')
    rgb, crev = rock(seed, P, 160, crack=0.9, bevel=2.2, base_lo=2.0, base_hi=4.4, grit=0.05)
    rng = np.random.default_rng(seed + 3)
    sp = rng.random((S, S)) < 0.012
    rgb[sp] = hexc('#e8c8ff')
    return rgb


def basalt(seed):
    P = pal('#0c0c10', '#15151b', '#1e1e26', '#282832', '#33333f', '#40404e', '#50505e')
    rgb, _ = rock(seed, P, 48, crack=1.2, bevel=3.0, sx=1.0, sy=0.35, base_lo=2.0, base_hi=4.6, grit=0.03)
    return rgb


def magma_rock(seed):
    P = pal('#120604', '#1e0a06', '#2c1008', '#3a160c', '#4a1e10', '#5c2814')
    rgb, crev = rock(seed, P, 70, crack=1.3, bevel=2.6, base_lo=1.6, base_hi=4.2, grit=0.03)
    glow = pal('#a83a08', '#ff7a1a', '#ffc04a')
    n = tor_noise(S, 8, seed + 4, 2)
    lv = np.clip((n * 3).astype(int), 0, 2)
    rgb = np.where(crev[..., None], glow[lv], rgb)
    return rgb


def obsidian(seed):
    P = pal('#05030a', '#0b0714', '#130d20', '#1c142e', '#281e40', '#3a2c5c', '#5a4a8a')
    rgb, crev = rock(seed, P, 40, crack=0.8, bevel=4.0, base_lo=1.5, base_hi=3.6, grit=0.02)
    # glassy diagonal glints
    rng = random.Random(seed)
    # a few short sparks on the facets, not streaks (lots of long ones read as rain)
    for _ in range(5):
        x, y = rng.randrange(S), rng.randrange(S)
        n = rng.randint(2, 3)
        for s in range(n):
            rgb[(y + s) % S, (x + s) % S] = hexc('#c8b8ff') if s == n // 2 else hexc('#6a5a9a')
    return rgb


def abyss(seed):
    P = pal('#08040e', '#110a1a', '#1a1028', '#241636', '#301e46', '#3e285a', '#503472')
    rgb, _ = rock(seed, P, 90, crack=1.0, bevel=3.0, base_lo=2.0, base_hi=4.4, grit=0.04)
    return rgb


def bricks(seed, palette, bw, bh, mortar):
    n = len(palette)
    yy, xx = np.mgrid[0:S, 0:S]
    row = yy // bh
    off = (row % 2) * (bw // 2)
    bx = (xx + off) % bw
    by = yy % bh
    bid = (row * 97 + (xx + off) // bw * 31) % 1000
    rng = np.random.default_rng(seed)
    tone = rng.uniform(n * 0.35, n * 0.7, 1000)
    lv = tone[bid].astype(np.float32)
    lv = np.where(by == 1, lv + 1, lv)
    lv = np.where(bx == 1, lv + 0.6, lv)
    lv = np.where(by == bh - 2, lv - 0.8, lv)
    lv += (tor_noise(S, 16, seed + 1, 2) - 0.5) * 1.0
    gr = rng.random((S, S))
    lv = np.where(gr < 0.04, lv - 1, lv)
    lv = np.where((by == 0) | (bx == 0), 0, lv)
    return quantize(np.clip(lv, 0, n - 1), palette)


def ruin_brick(seed):
    return bricks(seed, pal('#2a1e10', '#4a3820', '#6a522e', '#86693c', '#a0824e', '#b89a62', '#ccb27a'), 16, 8, 1)


def stone_brick(seed):
    return bricks(seed, pal('#1e1e26', '#383842', '#4e4e5a', '#646470', '#7c7c88', '#9696a2'), 16, 16, 1)


def planks(seed):
    P = pal('#2a170a', '#432612', '#5c361a', '#744622', '#8c582c', '#a66c38')
    yy, xx = np.mgrid[0:S, 0:S]
    ph = 8
    row = yy // ph
    rng = np.random.default_rng(seed)
    tone = rng.uniform(2.2, 3.6, S)
    lv = tone[row].astype(np.float32)
    grain = tor_noise(S, 4, seed + 2, 3)
    lv += np.sin((xx / S) * math.pi * 2 * 3 + grain * 10 + row) * 0.45
    by = yy % ph
    lv = np.where(by == 1, lv + 0.8, lv)
    lv = np.where(by == ph - 1, 0.6, lv)
    # plank ends + nails
    for r in range(S // ph):
        ex = rng.integers(0, S)
        for j in range(ph - 1):
            lv[r * ph + j, ex] = 0.5
        lv[r * ph + 3, (ex + 3) % S] = 5
    return quantize(np.clip(lv, 0, 5), P)


def bedrock(seed):
    P = pal('#020308', '#06080f', '#0c1018', '#131824', '#1c2232', '#283044')
    rgb, _ = rock(seed, P, 90, crack=1.4, bevel=2.4, base_lo=1.6, base_hi=3.6, grit=0.06)
    return rgb


def heartstone(seed):
    P = pal('#12030a', '#220610', '#360a18', '#4c1022', '#64182e', '#80243c')
    rgb, crev = rock(seed, P, 60, crack=1.2, bevel=3.2, base_lo=1.8, base_hi=4.2, grit=0.03)
    vein = pal('#a0102a', '#e0304a', '#ff8090')
    n = tor_noise(S, 6, seed + 3, 2)
    rgb = np.where(crev[..., None], vein[np.clip((n * 3).astype(int), 0, 2)], rgb)
    return rgb


def lava(seed):
    P = pal('#5a1404', '#a02a06', '#e05a10', '#ff8a1a', '#ffc040', '#fff0a0')
    n = tor_noise(S, 4, seed, 4)
    m = tor_noise(S, 8, seed + 7, 3)
    lv = 2.2 + (n - 0.5) * 5 + (m - 0.5) * 2
    ids, d1, d2, npts = voronoi(S, 40, seed + 3)
    crust = (d2 - d1) > 5.5
    lv = np.where(crust & (n < 0.5), lv - 2, lv)
    return quantize(np.clip(lv, 0, 5), P)


def water(seed):
    P = pal('#0a2a5a', '#103a74', '#18508e', '#2468a8', '#3a86c4', '#62aee0')
    n = tor_noise(S, 4, seed, 3)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    lv = 2.0 + np.sin(xx / S * math.pi * 2 * 4 + n * 7) * 0.7 + (n - 0.5) * 1.5
    return quantize(np.clip(lv, 0, 5), P)


# order must match MATERIALS in src/assets.ts
MATERIALS = [
    ('dirt', dirt), ('clay', clay), ('stone', stone), ('gravel', gravel), ('moss', moss_stone),
    ('grotto', grotto), ('crystal', crystal_rock), ('geode', geode), ('basalt', basalt), ('magma', magma_rock),
    ('obsidian', obsidian), ('lava', lava), ('abyss', abyss), ('ruin', ruin_brick), ('planks', planks),
    ('bedrock', bedrock), ('heart', heartstone), ('stonebrick', stone_brick), ('water', water),
]


# ----------------------------------------------------------------------------- ores
def blob(img, cx, cy, rx, ry, cols, rng, outline):
    """shaded nugget: outline, 3 tones, specular pixel"""
    H, W = img.shape[:2]
    pts = []
    for y in range(int(cy - ry - 1), int(cy + ry + 2)):
        for x in range(int(cx - rx - 1), int(cx + rx + 2)):
            dx = (x + 0.5 - cx) / rx
            dy = (y + 0.5 - cy) / ry
            wob = 1 + (rng.random() - 0.5) * 0.25
            if dx * dx + dy * dy <= wob:
                pts.append((x, y, dx, dy))
    filled = {(x, y) for x, y, _, _ in pts}
    for x, y, dx, dy in pts:
        if not (0 <= x < W and 0 <= y < H):
            continue
        l = -(dx * 0.7 + dy * 0.8)
        c = 2 if l > 0.35 else 1 if l > -0.25 else 0
        img[y, x] = list(cols[c]) + [255]
    for x, y in list(filled):
        for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + ox, y + oy)
            if q not in filled and 0 <= q[0] < W and 0 <= q[1] < H and img[q[1], q[0], 3] == 0:
                img[q[1], q[0]] = list(outline) + [255]
    sx, sy = int(cx - rx * 0.35), int(cy - ry * 0.45)
    if 0 <= sx < W and 0 <= sy < H and (sx, sy) in filled:
        img[sy, sx] = list(cols[3]) + [255]


def shard(img, x, y, h, w, cols, outline, lean=0):
    """upright crystal shard"""
    H, W = img.shape[:2]
    cells = []
    for j in range(h):
        # j counts up from the root; the top two rows taper to a point
        ww = w if j < h - 2 else (max(1, w - 1) if j == h - 2 else 1)
        x0 = x + int(round(lean * j / h)) + (w - ww) // 2
        for i in range(ww):
            cells.append((x0 + i, y - j, i, j, ww))
    cs = {(a, b) for a, b, _, _, _ in cells}
    for a, b, i, j, ww in cells:
        if 0 <= a < W and 0 <= b < H:
            c = 3 if j == h - 1 else 2 if i == 0 else 1 if i < ww - 1 else 0
            img[b, a] = list(cols[c]) + [255]
    for a, b in list(cs):
        for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (a + ox, b + oy)
            if q not in cs and 0 <= q[0] < W and 0 <= q[1] < H and img[q[1], q[0], 3] == 0:
                img[q[1], q[0]] = list(outline) + [255]


def ore_tile(kind, v):
    rng = random.Random(hash((kind, v)) & 0xffffff)
    img = np.zeros((32, 32, 4), np.uint8)
    O = hexc('#0a0608').astype(int)
    nug = {
        'coal': ([hexc('#0a0a0e'), hexc('#1a1a22'), hexc('#363642'), hexc('#a0a0b8')], 4, 4.4),
        'copper': ([hexc('#7a3410'), hexc('#c0601e'), hexc('#ec9a48'), hexc('#ffe0b0')], 4, 4.0),
        'iron': ([hexc('#5a3422'), hexc('#a06a46'), hexc('#d8a882'), hexc('#fff0dc')], 4, 3.9),
        'silver': ([hexc('#4a5266'), hexc('#a4b0c8'), hexc('#dfe6f4'), hexc('#ffffff')], 4, 3.8),
        'gold': ([hexc('#8a5a08'), hexc('#d8a018'), hexc('#ffd84a'), hexc('#fffbe0')], 4, 3.8),
        'voidsteel': ([hexc('#120c3a'), hexc('#2c2478'), hexc('#5a4ac0'), hexc('#c8bcff')], 4, 4.1),
    }
    gems = {
        'jade': [hexc('#0e4a26'), hexc('#1e8a46'), hexc('#4ad07a'), hexc('#c8ffd8')],
        'amethyst': [hexc('#3a145e'), hexc('#7a3ab8'), hexc('#b47aee'), hexc('#f0dcff')],
        'ruby': [hexc('#5a0610'), hexc('#b81428'), hexc('#ff4a5a'), hexc('#ffd0d4')],
        'lumenite': [hexc('#0a4a5a'), hexc('#1aa8c0'), hexc('#7af0ff'), hexc('#f0ffff')],
        'diamond': [hexc('#3a6a8a'), hexc('#8ad0f0'), hexc('#d8f6ff'), hexc('#ffffff')],
    }
    if kind in nug:
        cols, count, size = nug[kind]
        placed = []
        for _ in range(count + rng.randint(0, 1)):
            for _t in range(40):
                cx, cy = rng.uniform(7, 25), rng.uniform(7, 25)
                if all((cx - a) ** 2 + (cy - b) ** 2 > (size * 1.75) ** 2 for a, b in placed):
                    break
            placed.append((cx, cy))
            r = size * rng.uniform(0.75, 1.15)
            blob(img, cx, cy, r * rng.uniform(0.9, 1.3), r * rng.uniform(0.7, 1.0), cols, rng, O)
    elif kind in gems:
        cols = gems[kind]
        # two or three clusters, each a fan of chunky shards from one root
        for c in range(2 + rng.randint(0, 1)):
            bx = rng.randint(7, 22)
            by = rng.randint(17, 28)
            for k, lean in enumerate(rng.sample([-3, -2, 0, 2, 3], rng.randint(2, 3))):
                shard(img, bx + k * 2 - 2, by, rng.randint(7, 13), rng.randint(3, 4), cols, O, lean=lean)
    elif kind == 'fossil':
        bone = [hexc('#8a7a5a'), hexc('#cabb92'), hexc('#efe4c4'), hexc('#ffffff')]
        # ammonite spiral + a couple of bones
        cx, cy = rng.uniform(11, 21), rng.uniform(11, 21)
        for t in np.linspace(0, 5.5 * math.pi, 140):
            r = 1.0 + t * 0.62
            x = int(cx + math.cos(t) * r)
            y = int(cy + math.sin(t) * r * 0.9)
            if 0 <= x < 32 and 0 <= y < 32:
                img[y, x] = list(bone[2 if (t % 1.0) < 0.6 else 1]) + [255]
        for _ in range(2):
            x0, y0 = rng.randint(3, 22), rng.randint(3, 28)
            for s in range(7):
                if 0 <= x0 + s < 32:
                    img[y0, x0 + s] = list(bone[2]) + [255]
            for e in (x0, x0 + 6):
                for oy in (-1, 1):
                    if 0 <= y0 + oy < 32 and 0 <= e < 32:
                        img[y0 + oy, e] = list(bone[1]) + [255]
        # outline
        a = img[..., 3] > 0
        for y in range(32):
            for x in range(32):
                if not a[y, x] and any(0 <= x + ox < 32 and 0 <= y + oy < 32 and a[y + oy, x + ox] for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    img[y, x] = list(bone[0] * 0.5) + [255]
    elif kind == 'relic':
        gold = [hexc('#6a4a08'), hexc('#c8941c'), hexc('#ffd24a'), hexc('#fff4c0')]
        # a carved glowing glyph framed by a chipped tablet edge
        g = [(0, 0), (1, 0), (2, 0), (1, 1), (1, 2), (0, 3), (2, 3), (1, 4), (0, 5), (1, 5), (2, 5)]
        ox, oy = 12 + rng.randint(-2, 2), 8 + rng.randint(-2, 2)
        for (x, y) in g:
            for sx in range(3):
                for sy in range(2):
                    px, py = ox + x * 3 + sx, oy + y * 3 + sy
                    if 0 <= px < 32 and 0 <= py < 32:
                        img[py, px] = list(gold[2 if sy == 0 else 1]) + [255]
        a = img[..., 3] > 0
        for y in range(32):
            for x in range(32):
                if not a[y, x] and any(0 <= x + q < 32 and 0 <= y + r < 32 and a[y + r, x + q] for q, r in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    img[y, x] = list(gold[0]) + [255]
        for _ in range(5):
            x, y = rng.randint(2, 29), rng.randint(2, 29)
            img[y, x] = list(gold[3]) + [255]
    elif kind == 'glowmoss':
        cols = [hexc('#0a4a40'), hexc('#18907a'), hexc('#3ad8b4'), hexc('#c0fff0')]
        for _ in range(7):
            cx, cy = rng.uniform(4, 28), rng.uniform(4, 28)
            blob(img, cx, cy, rng.uniform(2.5, 4.5), rng.uniform(1.8, 3.0), cols, rng, hexc('#04201c'))
    return img


def socket(img):
    """a soft dark ring around the overlay so it sits in the rock instead of on it"""
    a = img[..., 3] > 0
    ring = np.zeros_like(a)
    for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, 1)):
        ring |= np.roll(np.roll(a, oy, 0), ox, 1)
    ring &= ~a
    img[ring] = [0, 0, 0, 90]
    return img


ORES = ['coal', 'copper', 'iron', 'jade', 'silver', 'amethyst', 'gold', 'ruby', 'voidsteel', 'lumenite', 'diamond', 'fossil', 'relic', 'glowmoss']


def main():
    os.makedirs(OUT, exist_ok=True)
    sheet = Image.new('RGBA', (S * len(MATERIALS), S))
    for i, (name, fn) in enumerate(MATERIALS):
        rgb = fn(1000 + i * 17)
        sheet.paste(to_img(rgb), (i * S, 0))
    sheet.save(os.path.join(OUT, 'terrain.png'), optimize=True)
    ores = Image.new('RGBA', (32 * 3, 32 * len(ORES)))
    for r, k in enumerate(ORES):
        for v in range(3):
            ores.paste(Image.fromarray(socket(ore_tile(k, v)), 'RGBA'), (v * 32, r * 32))
    ores.save(os.path.join(OUT, 'ores.png'), optimize=True)
    print('terrain', sheet.size, 'ores', ores.size)


if __name__ == '__main__':
    main()
