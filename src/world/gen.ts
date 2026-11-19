import { World, Obj } from './world';
import { B, BLOCKS } from '../data/blocks';
import { BIOMES, BiomeDef, SURFACE_DECOR } from '../data/biomes';
import { RELICS } from '../data/items';
import { WORLD_W, WORLD_H, SURFACE_Y } from '../constants';
import { Rng, fbm, valueNoise, clamp } from '../rng';
import { propOf, propsOfKind, PROPS } from '../data/props';

/** the centre of the world, where a new delver wakes up */
export const SPAWN_X = Math.floor(WORLD_W / 2);
export const BOSS_CENTER = { x: Math.floor(WORLD_W / 2), y: 443 };

/** Is this row within the solid barrier band at the top of a biome (no caves)? */
function inBand(y: number, offs: Int8Array, x: number): boolean {
  for (let i = 1; i < BIOMES.length; i++) {
    const top = BIOMES[i].top + offs[i * WORLD_W + x];
    if (y >= top - 1 && y < top + 4) return true;
  }
  return false;
}

export function generateWorld(seed: number): World {
  const w = new World();
  w.seed = seed;
  const rng = new Rng(seed);
  const W = WORLD_W;

  // ---- surface line: rolling hills, a calm meadow where you wake up ---------------
  for (let x = 0; x < W; x++) {
    const big = (fbm(x * 0.022, 3.3, seed) - 0.5) * 22;
    const small = (fbm(x * 0.09, 9.1, seed + 3) - 0.5) * 6;
    let h = SURFACE_Y + big + small;
    const dSpawn = Math.abs(x - SPAWN_X);
    const t = clamp((dSpawn - 6) / 18, 0, 1);
    h = SURFACE_Y + (h - SURFACE_Y) * t;
    // mountains rise toward the world edges
    const edge = Math.min(x, W - 1 - x);
    if (edge < 18) h -= (18 - edge) * 0.7;
    w.surface[x] = Math.round(clamp(h, 8, SURFACE_Y + 14));
  }

  // biome boundary wobble per biome per column
  const offs = new Int8Array(BIOMES.length * W);
  for (let i = 1; i < BIOMES.length; i++) {
    for (let x = 0; x < W; x++) offs[i * W + x] = Math.round((valueNoise(x * 0.09, i * 17.3, seed) - 0.5) * 6);
  }
  const biomeIndexAt = (x: number, y: number): number => {
    for (let i = BIOMES.length - 1; i >= 1; i--) if (y >= BIOMES[i].top + offs[i * W + x]) return i;
    return 0;
  };

  // ---- base rock -----------------------------------------------------------
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const s = w.surface[x];
      if (y < s) continue;
      const bi = biomeIndexAt(x, y);
      const bm = BIOMES[bi];
      let b: B = bm.base;
      const n1 = fbm(x * 0.07, y * 0.07, seed + 11 + bi);
      const n2 = fbm(x * 0.11, y * 0.11, seed + 77 + bi);
      if (bi === 0) {
        const depth = y - s;
        const stoneChance = clamp((depth - 5) / 40, 0, 0.8);
        if (n1 < stoneChance) b = B.STONE;
        if (depth > 3 && n2 > 0.7) b = bm.pocket;
        if (depth < 14 && depth > 1 && n2 < 0.28) b = B.CLAY;
        if (depth === 0) b = B.GRASS;
      } else {
        if (n1 > 0.55) b = bm.alt;
        if (n2 > 0.73) b = bm.pocket;
      }
      w.fg[i] = b;
      w.wall[i] = y === s ? 0 : wallFor(bi, y - s, x, seed);
    }
  }

  // ---- caves -----------------------------------------------------------------
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 2; x < W - 2; x++) {
      const s = w.surface[x];
      if (y < s + 7) continue;
      if (inBand(y, offs, x)) continue;
      const bi = biomeIndexAt(x, y);
      if (bi === 5) continue;
      const bm = BIOMES[bi];
      const n = fbm(x * 0.065, y * 0.085, seed + 401, 4);
      const ridge = 1 - Math.abs(fbm(x * 0.04, y * 0.05, seed + 909, 3) * 2 - 1);
      const i = y * W + x;
      if (n > bm.caveThreshold) {
        w.fg[i] = B.AIR;
        if (n > bm.caveThreshold + 0.07) w.wall[i] = 0;
      } else if (ridge > 0.93 && bi > 0) {
        w.fg[i] = B.AIR;
      }
    }
  }
  // worm tunnels
  for (let bi = 0; bi < 5; bi++) {
    const bm = BIOMES[bi];
    const count = Math.round((bi === 0 ? 10 : 9) * (W / 112));
    for (let k = 0; k < count; k++) {
      let x = rng.range(6, W - 6);
      let y = rng.range(bm.top + 8, bm.bottom - 4);
      let ang = rng.range(0, Math.PI * 2);
      const len = rng.int(40, 110);
      const rad = rng.range(0.9, 1.6);
      for (let s = 0; s < len; s++) {
        ang += rng.range(-0.35, 0.35);
        ang = ang * 0.92 + (Math.cos(ang) > 0 ? 0 : Math.PI) * 0.08;
        x += Math.cos(ang);
        y += Math.sin(ang) * 0.6;
        y = clamp(y, bm.top + 6, bm.bottom - 2);
        x = clamp(x, 4, W - 5);
        carveCircle(w, x, y, rad, offs, false);
      }
    }
  }
  // cave mouths: a few natural openings from the hills down into the tunnels
  for (let k = 0; k < 6; k++) {
    let x = rng.chance(0.5) ? rng.range(14, SPAWN_X - 18) : rng.range(SPAWN_X + 18, W - 14);
    let y = w.surface[Math.floor(x)] - 1;
    let ang = Math.PI / 2 + rng.range(-0.7, 0.7);
    const len = rng.int(28, 55);
    for (let s = 0; s < len; s++) {
      ang += rng.range(-0.25, 0.25);
      ang = clamp(ang, 0.5, Math.PI - 0.5);
      x += Math.cos(ang) * 0.8;
      y += Math.sin(ang) * 0.9;
      const r = s < 4 ? 1.3 : rng.range(1.1, 1.8);
      for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) {
        for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
          if (!w.inside(xx, yy) || xx < 3 || xx >= W - 3) continue;
          if ((xx - x) ** 2 + (yy - y) ** 2 > r * r) continue;
          if (yy >= BIOMES[1].top - 2) continue;
          w.fg[w.idx(xx, yy)] = B.AIR;
          if (yy <= w.surface[xx]) w.wall[w.idx(xx, yy)] = 0;
        }
      }
    }
  }

  // ---- tidy the open caverns: tiny holes in the back wall read as square glitches ----
  {
    const hole = (x: number, y: number): boolean => x >= 2 && x < W - 2 && y >= 0 && y < WORLD_H && y >= w.surface[x] + 3 && w.wall[y * W + x] === 0;
    const restore = (i: number): void => {
      const x = i % W;
      const y = (i - x) / W;
      w.wall[i] = wallFor(biomeIndexAt(x, y), y - w.surface[x], x, seed);
    };
    // one smoothing pass: open tiles with few open neighbours close up
    const close: number[] = [];
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 2; x < W - 2; x++) {
        if (!hole(x, y)) continue;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && hole(x + dx, y + dy)) n++;
        if (n <= 3) close.push(y * W + x);
      }
    }
    for (const i of close) restore(i);
    // then any pocket of open wall too small to read as a cavern is walled back in
    const seen = new Uint8Array(W * WORLD_H);
    const stack: number[] = [];
    const comp: number[] = [];
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 2; x < W - 2; x++) {
        const i = y * W + x;
        if (seen[i] || !hole(x, y)) continue;
        comp.length = 0;
        stack.push(i);
        seen[i] = 1;
        while (stack.length) {
          const j = stack.pop() as number;
          comp.push(j);
          const jx = j % W;
          const jy = (j - jx) / W;
          const near = [
            [jx + 1, jy],
            [jx - 1, jy],
            [jx, jy + 1],
            [jx, jy - 1],
          ];
          for (const [nx, ny] of near) {
            if (!hole(nx, ny)) continue;
            const k = ny * W + nx;
            if (seen[k]) continue;
            seen[k] = 1;
            stack.push(k);
          }
        }
        if (comp.length < 60) for (const j of comp) restore(j);
      }
    }
  }

  // ---- ores --------------------------------------------------------------------
  for (let bi = 0; bi < 5; bi++) {
    const bm = BIOMES[bi];
    const area = W * (bm.bottom - bm.top);
    for (const rule of bm.ores) {
      let n = Math.round((rule.freq * area) / 1000);
      if (rule.block === B.FOSSIL || rule.block === B.RELIC_STONE) n = Math.max(n, 6);
      for (let k = 0; k < n; k++) {
        let x = rng.int(3, W - 4);
        let y = rng.int(bm.top + 2, bm.bottom);
        if (bi === 0) y = Math.max(y, w.surface[x] + 3);
        const size = rng.int(rule.size[0], rule.size[1]);
        for (let s = 0; s < size; s++) {
          if (isHostRock(w.get(x, y), bm)) w.set(x, y, rule.block);
          x += rng.int(-1, 1);
          y += rng.int(-1, 1);
        }
      }
    }
  }

  // ---- lava lakes in the Ember Depths -------------------------------------------
  placeLava(w, BIOMES[3], seed);

  // ---- structures ------------------------------------------------------------------
  buildMines(w, rng);
  buildGeodes(w, rng);
  buildRuins(w, rng);
  buildHeartChamber(w);

  ensureRelicSources(w, rng);

  // ---- bedrock ----------------------------------------------------------------------
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (y >= WORLD_H - 6 || ((x < 2 || x >= W - 2) && y >= w.surface[x])) {
        w.fg[i] = B.BEDROCK;
        w.wall[i] = B.BEDROCK;
      }
    }
  }

  // ---- water: ponds in the meadow, still pools in the caves ----------------------------------
  placePonds(w, rng);
  placePools(w, rng);

  // ---- surface life ----------------------------------------------------------------------
  placeSurface(w, rng);

  // ---- formations, decor, chests, heart crystals ----------------------------------------------
  placeProps(w, rng);
  placeDecor(w, rng);
  placeChests(w, rng);
  placeHeartCrystals(w, rng);

  unburyObjects(w);
  clearWater(w);
  w.updateAllSky();
  w.dirty.clear();
  return w;
}

// ---------------------------------------------------------------------------- water

/** two ponds in the meadow, a short walk either side of where you wake */
function placePonds(w: World, rng: Rng): void {
  for (const side of [-1, 1]) {
    let best = -1;
    let bestRough = 99;
    for (let t = 0; t < 40; t++) {
      const x0 = SPAWN_X + side * rng.int(16, 30);
      let lo = 1e9;
      let hi = -1e9;
      for (let x = x0 - 6; x <= x0 + 6; x++) {
        lo = Math.min(lo, w.surface[x]);
        hi = Math.max(hi, w.surface[x]);
      }
      if (hi - lo < bestRough) {
        bestRough = hi - lo;
        best = x0;
      }
    }
    if (best < 0 || bestRough > 6) continue;
    const hw = rng.int(3, 5);
    const depth = rng.int(2, 3);
    // the water line sits at the lowest ground under the pond; banks are raised to hold it
    let level = -1;
    for (let x = best - hw; x <= best + hw; x++) level = Math.max(level, w.surface[x]);
    for (const bx of [best - hw - 1, best + hw + 1]) {
      for (let y = level; y < w.surface[bx]; y++) {
        w.fg[w.idx(bx, y)] = B.DIRT;
        w.wall[w.idx(bx, y)] = 0;
      }
      if (w.surface[bx] > level) {
        w.fg[w.idx(bx, level)] = B.GRASS;
        w.surface[bx] = level;
      }
    }
    for (let x = best - hw; x <= best + hw; x++) {
      const k = (x - best) / (hw + 0.6);
      const d = Math.max(1, Math.round(depth * (1 - k * k) + 0.4));
      for (let y = w.surface[x]; y < level; y++) {
        w.fg[w.idx(x, y)] = B.AIR;
        w.wall[w.idx(x, y)] = 0;
      }
      for (let y = level; y < level + d; y++) {
        w.fg[w.idx(x, y)] = B.WATER;
        if (y === level) w.wall[w.idx(x, y)] = 0;
      }
      // a muddy bed under the water (sealing any tunnel that runs underneath)
      const bed = w.idx(x, level + d);
      if (w.fg[bed] === B.GRASS || w.fg[bed] === B.DIRT || !BLOCKS[w.fg[bed]].solid) w.fg[bed] = rng.chance(0.5) ? B.CLAY : B.DIRT;
      w.surface[x] = level;
    }
    // and banks that hold it in
    for (const bx of [best - hw - 1, best + hw + 1]) {
      for (let y = level; y <= level + depth; y++) if (!BLOCKS[w.fg[w.idx(bx, y)]].solid) w.fg[w.idx(bx, y)] = B.DIRT;
    }
  }
}

/** still pools in cave hollows: fill a basin row by row while rock holds the water on both sides */
function placePools(w: World, rng: Rng): void {
  const per = [16, 16, 12, 0, 8];
  for (let bi = 0; bi < per.length; bi++) {
    const bm = BIOMES[bi];
    let made = 0;
    for (let t = 0; t < per[bi] * 40 && made < per[bi]; t++) {
      let x = rng.int(6, w.w - 7);
      let y = rng.int(bm.top + 6, bm.bottom - 4);
      if (w.fg[w.idx(x, y)] !== B.AIR) continue;
      // roll downhill like a drop of water until it settles in a hollow
      for (let step = 0; step < 80; step++) {
        if (y + 1 < bm.bottom && w.fg[w.idx(x, y + 1)] === B.AIR) y++;
        else if (w.fg[w.idx(x - 1, y)] === B.AIR && w.fg[w.idx(x - 1, y + 1)] === B.AIR) x--;
        else if (w.fg[w.idx(x + 1, y)] === B.AIR && w.fg[w.idx(x + 1, y + 1)] === B.AIR) x++;
        else break;
        if (x < 5 || x > w.w - 6) break;
      }
      if (x < 5 || x > w.w - 6 || y >= bm.bottom - 1 || !BLOCKS[w.fg[w.idx(x, y + 1)]].solid) continue;
      if (fillBasin(w, x, y, rng.int(2, 4), 18) > 0) made++;
    }
  }
}

function fillBasin(w: World, sx: number, sy: number, maxDepth: number, maxW: number): number {
  const filled: number[] = [];
  let y = sy;
  let seed = sx;
  for (let depth = 0; depth < maxDepth; depth++) {
    if (w.fg[w.idx(seed, y)] !== B.AIR) break;
    let a = seed;
    let b = seed;
    while (a > 3 && w.fg[w.idx(a - 1, y)] === B.AIR) a--;
    while (b < w.w - 4 && w.fg[w.idx(b + 1, y)] === B.AIR) b++;
    if (b - a + 1 > maxW) break;
    if (!BLOCKS[w.fg[w.idx(a - 1, y)]].solid || !BLOCKS[w.fg[w.idx(b + 1, y)]].solid) break;
    let ok = true;
    let airAbove = 0;
    for (let x = a; x <= b && ok; x++) {
      const i = w.idx(x, y);
      const below = w.fg[i + w.w];
      if (!(BLOCKS[below].solid || below === B.WATER) || below === B.LAVA) ok = false;
      if (w.obj[i] || w.rail[i] || w.obj[i - w.w] || propOf(w.decor[i])) ok = false;
      if (w.fg[i - 1] === B.LAVA || w.fg[i + 1] === B.LAVA) ok = false;
      if (w.fg[i - w.w] === B.AIR) airAbove++;
    }
    // keep a breathing gap under the roof so there is a surface to fish from
    if (!ok || airAbove === 0) break;
    for (let x = a; x <= b; x++) {
      const i = w.idx(x, y);
      w.fg[i] = B.WATER;
      filled.push(i);
    }
    // the next row up starts wherever there is open air over this one
    let next = -1;
    for (let x = a; x <= b && next < 0; x++) if (w.fg[w.idx(x, y - 1)] === B.AIR) next = x;
    if (next < 0) break;
    seed = next;
    y--;
  }
  if (filled.length < 4) {
    for (const i of filled) w.fg[i] = B.AIR;
    return 0;
  }
  return filled.length;
}

/** nothing sits or grows under water */
function clearWater(w: World): void {
  for (let i = 0; i < w.fg.length; i++) {
    if (w.fg[i] !== B.WATER) continue;
    if (w.obj[i]) w.obj[i] = Obj.NONE;
    if (w.decor[i]) w.decor[i] = 0;
  }
}

/** every biome gets more relic-bearing rock than it has relics, so none can be missed */
function ensureRelicSources(w: World, rng: Rng): void {
  for (let bi = 0; bi < 5; bi++) {
    const bm = BIOMES[bi];
    const want = RELICS.filter((r) => r.biome === bi).length + 3;
    let have = 0;
    for (let y = bm.top; y <= bm.bottom; y++) {
      for (let x = 0; x < w.w; x++) {
        const b = w.fg[y * w.w + x];
        if (b === B.FOSSIL || b === B.RELIC_STONE) have++;
      }
    }
    const block = bi === 0 || bi === 1 ? B.FOSSIL : B.RELIC_STONE;
    for (let tries = 0; have < want && tries < 20000; tries++) {
      const x = rng.int(4, w.w - 5);
      const y = rng.int(bm.top + 3, bm.bottom - 1);
      if (bi === 0 && y < w.surface[x] + 6) continue;
      if (!isHostRock(w.get(x, y), bm)) continue;
      w.fg[w.idx(x, y)] = block;
      have++;
    }
  }
}

/** structures built later can bury things placed earlier: dig chests out, drop anything else */
function unburyObjects(w: World): void {
  for (let i = 0; i < w.fg.length; i++) {
    const o = w.obj[i];
    if (!o || !BLOCKS[w.fg[i]].solid) continue;
    if (o === Obj.CHEST) {
      w.fg[i] = B.AIR;
      w.decor[i] = 0;
      const below = i + w.w;
      if (below < w.fg.length && !BLOCKS[w.fg[below]].solid) {
        w.fg[below] = B.STONE;
        w.decor[below] = 0;
        w.obj[below] = 0;
      }
    } else w.obj[i] = 0;
  }
}

/** back walls are one rock per layer (soil near the top), so they read as a single surface */
function wallFor(bi: number, depth: number, x: number, seed: number): number {
  switch (bi) {
    case 0:
      return depth < 8 + valueNoise(x * 0.11, 3.7, seed) * 9 ? B.DIRT : B.STONE;
    case 1:
      return B.GROTTO_ROCK;
    case 2:
      return B.CRYSTAL_ROCK;
    case 3:
      return B.BASALT;
    case 4:
      return B.ABYSS_STONE;
    default:
      return B.HEARTSTONE;
  }
}

/** the first solid row of a column, as the world is now */
export function groundAt(w: World, x: number): number {
  for (let y = 0; y < w.h; y++) if (w.rock(x, y)) return y;
  return w.h - 1;
}

/** spawn point in tiles: standing on the ground at the centre of the world */
export function worldSpawn(w: World): { x: number; y: number } {
  return { x: SPAWN_X, y: groundAt(w, SPAWN_X) - 1 };
}

function placeSurface(w: World, rng: Rng): void {
  let lastTree = -10;
  for (let x = 4; x < w.w - 4; x++) {
    const s = w.surface[x];
    if (w.get(x, s) !== B.GRASS) continue;
    const above = w.idx(x, s - 1);
    if (w.fg[above] !== B.AIR || w.obj[above]) continue;
    const nearSpawn = Math.abs(x - SPAWN_X) <= 3;
    const flat = Math.abs(w.surface[x - 1] - s) <= 1 && Math.abs(w.surface[x + 1] - s) <= 1;
    if (!nearSpawn && flat && x - lastTree >= 3 && rng.chance(0.3)) {
      w.obj[above] = Obj.TREE;
      lastTree = x;
      continue;
    }
    if (!nearSpawn && rng.chance(0.07)) {
      w.obj[above] = rng.chance(0.75) ? Obj.BUSH_BERRY : Obj.BUSH;
      continue;
    }
    if (rng.chance(0.3)) w.decor[above] = rng.pick(SURFACE_DECOR);
  }
}

function placeHeartCrystals(w: World, rng: Rng): void {
  for (let bi = 0; bi < 5; bi++) {
    const bm = BIOMES[bi];
    let placed = 0;
    let tries = 0;
    while (placed < 4 && tries++ < 5000) {
      const x = rng.int(4, w.w - 5);
      const y = rng.int(bm.top + 10, bm.bottom - 2);
      const i = w.idx(x, y);
      if (w.fg[i] !== B.AIR || w.obj[i] || w.fg[i - w.w] !== B.AIR) continue;
      if (!BLOCKS[w.fg[i + w.w]].solid) continue;
      w.obj[i] = Obj.HEART_CRYSTAL;
      w.decor[i] = 0;
      placed++;
    }
  }
}


function isHostRock(b: number, bm: BiomeDef): boolean {
  return b === bm.base || b === bm.alt || b === bm.pocket || (bm.id === 0 && (b === B.STONE || b === B.CLAY));
}

function carveCircle(w: World, cx: number, cy: number, r: number, offs: Int8Array, clearWall: boolean): void {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (!w.inside(x, y) || x < 2 || x >= w.w - 2) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 > r2) continue;
      if (y < w.surface[x] + 7) continue;
      if (inBand(y, offs, x)) continue;
      const i = w.idx(x, y);
      if (BLOCKS[w.fg[i]].unbreakable) continue;
      w.fg[i] = B.AIR;
      if (clearWall) w.wall[i] = 0;
    }
  }
}

function placeLava(w: World, bm: BiomeDef, seed: number): void {
  const cand = new Uint8Array(w.w * w.h);
  for (let y = bm.bottom; y >= bm.top + 6; y--) {
    for (let x = 2; x < w.w - 2; x++) {
      const i = w.idx(x, y);
      if (w.fg[i] !== B.AIR) continue;
      const below = w.fg[i + w.w];
      const belowOk = BLOCKS[below].solid || cand[i + w.w] === 1;
      if (!belowOk) continue;
      if (fbm(x * 0.05, y * 0.05, seed + 555) < 0.52) continue;
      // at most 3 layers deep
      if (cand[i + w.w] && cand[i + 2 * w.w] && cand[i + 3 * w.w]) continue;
      cand[i] = 1;
    }
  }
  // remove candidates that would spill sideways into open air
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = bm.top; y <= bm.bottom; y++) {
      for (let x = 2; x < w.w - 2; x++) {
        const i = w.idx(x, y);
        if (!cand[i]) continue;
        const l = i - 1;
        const r = i + 1;
        const lOk = BLOCKS[w.fg[l]].solid || cand[l];
        const rOk = BLOCKS[w.fg[r]].solid || cand[r];
        const bOk = BLOCKS[w.fg[i + w.w]].solid || cand[i + w.w];
        if (!lOk || !rOk || !bOk) {
          cand[i] = 0;
          changed = true;
        }
      }
    }
  }
  for (let i = 0; i < cand.length; i++) if (cand[i]) w.fg[i] = B.LAVA;
}

/** clear one tile of the old mine: open air with timber behind it */
function carveMine(w: World, x: number, y: number): void {
  if (!w.inside(x, y) || x < 3 || x >= w.w - 3) return;
  const i = w.idx(x, y);
  if (BLOCKS[w.fg[i]].unbreakable) return;
  w.fg[i] = B.AIR;
  w.wall[i] = B.PLANKS;
  w.decor[i] = 0;
  w.obj[i] = 0;
}

/**
 * The old Deepwick mines: a few abandoned workings away from where you wake up.
 * Each is a timbered shaft with a ladder, drifts branching off it with rail lines,
 * support frames and hanging lamps, store rooms at the ends, a parked cart or two
 * and the odd collapse. One of them still opens onto the hills.
 */
function buildMines(w: World, rng: Rng): void {
  const sites: number[] = [];
  const count = 3;
  for (let k = 0; k < count; k++) {
    let sx = -1;
    for (let t = 0; t < 80; t++) {
      const x = rng.int(16, w.w - 18);
      if (Math.abs(x - SPAWN_X) < 28) continue;
      if (sites.some((o) => Math.abs(o - x) < 36)) continue;
      sx = x;
      break;
    }
    if (sx < 0) continue;
    sites.push(sx);
    const surf = Math.min(w.surface[sx], w.surface[sx + 1]);
    const entrance = k === 0;
    const top = entrance ? surf - 2 : surf + rng.int(9, 15);
    const bottom = Math.min(BIOMES[1].top + 26, surf + rng.int(52, 76));
    // the shaft: two wide, a ladder all the way down
    for (let y = top; y <= bottom; y++) {
      carveMine(w, sx, y);
      carveMine(w, sx + 1, y);
      if (y >= surf - 1) w.obj[w.idx(sx, y)] = Obj.LADDER;
      if (entrance && y < surf) {
        // no timber against the open sky
        w.wall[w.idx(sx, y)] = 0;
        w.wall[w.idx(sx + 1, y)] = 0;
      }
    }
    // a sump at the bottom so the shaft has a floor
    for (const x of [sx, sx + 1]) {
      const i = w.idx(x, bottom + 1);
      if (!BLOCKS[w.fg[i]].solid) w.fg[i] = B.PLANKS;
    }
    if (entrance) {
      // a timber headframe over the hole and a sign
      w.obj[w.idx(sx - 1, surf - 1)] = Obj.BEAM;
      w.obj[w.idx(sx + 2, surf - 1)] = Obj.BEAM;
      w.obj[w.idx(sx - 2, surf - 1)] = Obj.LAMP;
      const signX = sx + 4;
      if (w.fg[w.idx(signX, surf - 1)] === B.AIR) w.decor[w.idx(signX, surf - 1)] = 148;
    }
    // drifts off the shaft
    let y = Math.max(top + 6, surf + 6);
    let side = rng.chance(0.5) ? -1 : 1;
    while (y < bottom - 2) {
      const both = rng.chance(0.3);
      buildDrift(w, rng, side < 0 ? sx - 1 : sx + 2, y, side);
      if (both) buildDrift(w, rng, side < 0 ? sx + 2 : sx - 1, y, -side);
      side = -side;
      y += rng.int(9, 13);
    }
    buildDrift(w, rng, side < 0 ? sx - 1 : sx + 2, bottom, side);
  }
}

function buildDrift(w: World, rng: Rng, x0: number, floorY: number, dir: number): void {
  const len = rng.int(16, 34);
  const xs: number[] = [];
  let x = x0;
  for (let k = 0; k < len; k++) {
    if (x < 5 || x > w.w - 6) break;
    for (let yy = floorY - 2; yy <= floorY; yy++) carveMine(w, x, yy);
    // keep a floor under the rails: plank bridges over gaps
    const fi = w.idx(x, floorY + 1);
    if (!BLOCKS[w.fg[fi]].solid || w.fg[fi] === B.LAVA) w.fg[fi] = B.PLANKS;
    xs.push(x);
    x += dir;
  }
  if (xs.length < 6) return;
  // rails along the floor
  for (let k = 1; k < xs.length; k++) w.rail[w.idx(xs[k], floorY)] = 1;
  // support frames, some with a lamp still burning
  for (let k = 3; k < xs.length - 1; k += rng.int(4, 6)) {
    w.obj[w.idx(xs[k], floorY)] = Obj.BEAM;
    if (rng.chance(0.4)) w.obj[w.idx(xs[k] + dir, floorY - 2)] = Obj.LAMP;
  }
  // a parked cart, sometimes a dead one tipped over as scenery
  if (rng.chance(0.6)) {
    const k = rng.int(4, xs.length - 2);
    const i = w.idx(xs[k], floorY);
    if (!w.obj[i]) w.obj[i] = Obj.MINECART;
  } else if (rng.chance(0.5)) {
    const k = rng.int(4, xs.length - 2);
    const i = w.idx(xs[k], floorY);
    if (!w.obj[i]) w.decor[i] = rng.pick(propsOfKind('cart'));
  }
  const end = xs[xs.length - 1];
  // a store room at the far end
  if (rng.chance(0.55)) {
    const rw = rng.int(5, 7);
    for (let k = 1; k <= rw; k++) {
      const rx = end + dir * k;
      for (let yy = floorY - 3; yy <= floorY; yy++) carveMine(w, rx, yy);
      const fi = w.idx(rx, floorY + 1);
      if (!BLOCKS[w.fg[fi]].solid) w.fg[fi] = B.PLANKS;
    }
    const mid = end + dir * Math.ceil(rw / 2);
    w.obj[w.idx(mid, floorY)] = Obj.CHEST;
    w.decor[w.idx(end + dir * 2, floorY)] = rng.pick([144, 145]);
    w.decor[w.idx(end + dir * rw, floorY)] = rng.pick([144, 145, 152, 153]);
    w.obj[w.idx(mid, floorY - 3)] = Obj.LAMP;
  } else if (rng.chance(0.5)) {
    // the far end caved in
    for (let k = 0; k < 3; k++) {
      const rx = end - dir * k;
      for (let yy = floorY - 2; yy <= floorY; yy++) if (rng.chance(0.8)) w.fg[w.idx(rx, yy)] = B.GRAVEL;
      w.rail[w.idx(rx, floorY)] = 0;
      w.obj[w.idx(rx, floorY)] = 0;
    }
  }
}

function buildGeodes(w: World, rng: Rng): void {
  const bm = BIOMES[2];
  for (let k = 0; k < 5; k++) {
    const cx = rng.int(10, w.w - 11);
    const cy = rng.int(bm.top + 12, bm.bottom - 8);
    const r = rng.range(3.5, 5.5);
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        const d = Math.hypot(x - cx, (y - cy) * 1.15);
        if (!w.inside(x, y)) continue;
        const i = w.idx(x, y);
        if (d < r - 1.2) {
          w.fg[i] = B.AIR;
          w.wall[i] = B.GEODE;
        } else if (d < r - 0.2) {
          w.fg[i] = rng.chance(0.35) ? B.AMETHYST : B.GEODE;
          w.wall[i] = B.GEODE;
        } else if (d < r + 0.8) {
          w.fg[i] = B.GEODE;
        }
      }
    }
    if (rng.chance(0.6)) w.fg[w.idx(cx, Math.floor(cy - r + 0.5))] = B.RELIC_STONE;
    w.obj[w.idx(cx, Math.floor(cy + r - 1.6))] = Obj.CHEST;
  }
}

function buildRuins(w: World, rng: Rng): void {
  const bm = BIOMES[4];
  for (let k = 0; k < 5; k++) {
    const rw = rng.int(12, 20);
    const rh = rng.int(5, 7);
    const x0 = rng.int(4, w.w - 5 - rw);
    const y0 = rng.int(bm.top + 10, bm.bottom - rh - 4);
    for (let y = y0; y <= y0 + rh; y++) {
      for (let x = x0; x <= x0 + rw; x++) {
        const i = w.idx(x, y);
        const edge = y === y0 || y === y0 + rh || x === x0 || x === x0 + rw;
        w.wall[i] = B.RUIN_BRICK;
        w.fg[i] = edge ? B.RUIN_BRICK : B.AIR;
      }
    }
    // doorways
    for (let dy = 1; dy <= 2; dy++) {
      w.fg[w.idx(x0, y0 + rh - dy)] = B.AIR;
      w.fg[w.idx(x0 + rw, y0 + rh - dy)] = B.AIR;
    }
    const floorY = y0 + rh - 1;
    w.obj[w.idx(x0 + Math.floor(rw / 2), floorY)] = Obj.CHEST;
    w.decor[w.idx(x0 + 2, floorY)] = 155;
    w.decor[w.idx(x0 + rw - 2, floorY)] = rng.pick([154, 156]);
    w.obj[w.idx(x0 + 4, y0 + 2)] = Obj.TORCH;
    w.obj[w.idx(x0 + rw - 4, y0 + 2)] = Obj.TORCH;
    if (rng.chance(0.7)) w.fg[w.idx(x0 + Math.floor(rw / 2), y0)] = B.RELIC_STONE;
  }
}

function buildHeartChamber(w: World): void {
  const { x: cx, y: cy } = BOSS_CENTER;
  const top = BIOMES[5].top;
  for (let y = top; y < w.h; y++) {
    for (let x = 0; x < w.w; x++) {
      const i = w.idx(x, y);
      w.fg[i] = B.HEARTSTONE;
      w.wall[i] = B.HEARTSTONE;
    }
  }
  for (let y = cy - 9; y <= cy + 7; y++) {
    for (let x = cx - 24; x <= cx + 24; x++) {
      const d = ((x - cx) / 24) ** 2 + ((y - cy) / 9) ** 2;
      if (d < 1 && y <= cy + 6) w.fg[w.idx(x, y)] = B.AIR;
    }
  }
  // flat floor + side ledges
  for (let x = cx - 22; x <= cx + 22; x++) w.fg[w.idx(x, cy + 6)] = B.OBSIDIAN;
  // braziers along the walls so the fight can be read
  for (const [tx, ty] of [
    [cx - 21, cy + 3],
    [cx + 21, cy + 3],
    [cx - 14, cy - 4],
    [cx + 14, cy - 4],
    [cx - 7, cy + 4],
    [cx + 7, cy + 4],
    [cx, cy - 7],
  ]) {
    if (w.fg[w.idx(tx, ty)] === B.AIR) w.obj[w.idx(tx, ty)] = Obj.TORCH;
  }
  for (const [lx, ly] of [
    [cx - 15, cy + 2],
    [cx + 12, cy + 2],
    [cx - 4, cy - 2],
  ]) {
    for (let x = lx; x < lx + 4; x++) w.fg[w.idx(x, ly)] = B.OBSIDIAN;
  }
}

const LIGHT_DECOR = new Set([37, 39, 44, 45, 54, 139, 140, 141, 156, 157]);
const PROP_LIGHT: Record<string, [number, number, number]> = {
  mushroom: [0.1, 0.55, 0.5],
  crystal: [0.42, 0.14, 0.62],
  magma: [0.9, 0.38, 0.08],
  ruin: [0.1, 0.28, 0.62],
  roots: [0.03, 0.2, 0.18],
};
export function decorLight(code: number): [number, number, number] | null {
  const prop = propOf(code);
  if (prop) return PROP_LIGHT[prop.kind] ?? null;
  if (!LIGHT_DECOR.has(code)) return null;
  switch (code) {
    case 37:
    case 139:
      return [0.05, 0.45, 0.4];
    case 39:
    case 140:
      return [0.35, 0.1, 0.5];
    case 141:
      return [0.1, 0.45, 0.55];
    case 44:
      return [0.1, 0.25, 0.55];
    case 45:
      return [0.5, 0.2, 0.05];
    case 157:
      return [0.9, 0.4, 0.1];
    case 54:
      return [0.6, 0.45, 0.2];
    case 156:
      return [0.15, 0.35, 0.7];
  }
  return null;
}

const solidFloor = (w: World, x: number, y: number): boolean => {
  const b = w.get(x, y);
  return BLOCKS[b].solid && b !== B.BEDROCK;
};
const open = (w: World, x: number, y: number): boolean => w.inside(x, y) && w.get(x, y) === B.AIR && !w.obj[w.idx(x, y)];

function propNear(w: World, x: number, y: number): boolean {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (w.inside(x + dx, y + dy) && propOf(w.decor[w.idx(x + dx, y + dy)])) return true;
    }
  }
  return false;
}

/** big formations: stalagmites, glowing mushrooms, crystals, roots... chosen per biome */
function placeProps(w: World, rng: Rng): void {
  for (let y = SURFACE_Y + 4; y < w.h - 7; y++) {
    for (let x = 4; x < w.w - 4; x++) {
      const i = w.idx(x, y);
      if (!open(w, x, y) || w.decor[i]) continue;
      if (y < w.surface[x] + 3) continue;
      // keep the old mine workings tidy
      if (w.wall[i] === B.PLANKS) continue;
      const cfg = BIOMES[biomeIdx(y)].props;
      // a floor at least three tiles wide with headroom above
      const floor = solidFloor(w, x - 1, y + 1) && solidFloor(w, x, y + 1) && solidFloor(w, x + 1, y + 1) && open(w, x - 1, y) && open(w, x + 1, y);
      if (floor && cfg.floor.length && rng.chance(cfg.floorChance)) {
        let head = 0;
        while (head < 3 && open(w, x, y - 1 - head) && open(w, x - 1, y - 1 - head) && open(w, x + 1, y - 1 - head)) head++;
        if (head >= 1 && !propNear(w, x, y)) {
          const options = propsOfKind(rng.pick(cfg.floor)).filter((c) => PROPS[c - PROPS[0].code].h <= 32 * (head + 1) - 4);
          if (options.length) {
            w.decor[i] = rng.pick(options);
            continue;
          }
        }
      }
      const ceil = solidFloor(w, x - 1, y - 1) && solidFloor(w, x, y - 1) && solidFloor(w, x + 1, y - 1) && open(w, x - 1, y) && open(w, x + 1, y);
      if (ceil && cfg.ceil.length && rng.chance(cfg.ceilChance)) {
        let room = 0;
        while (room < 4 && open(w, x, y + 1 + room)) room++;
        if (room >= 2 && !propNear(w, x, y)) {
          const options = propsOfKind(rng.pick(cfg.ceil)).filter((c) => PROPS[c - PROPS[0].code].h <= 32 * room);
          if (options.length) w.decor[i] = rng.pick(options);
        }
      }
    }
  }
}

function placeDecor(w: World, rng: Rng): void {
  for (let y = SURFACE_Y + 3; y < w.h - 7; y++) {
    for (let x = 3; x < w.w - 3; x++) {
      const i = w.idx(x, y);
      if (w.fg[i] !== B.AIR || w.obj[i] || w.decor[i]) continue;
      if (y < w.surface[x] + 2) continue;
      const bm = BIOMES[biomeIdx(y)];
      const below = w.fg[i + w.w];
      const above = w.fg[i - w.w];
      if (BLOCKS[below].solid && below !== B.PLANKS) {
        if (bm.bigDecor.length && w.fg[i - w.w] === B.AIR && rng.chance(0.035)) w.decor[i] = rng.pick(bm.bigDecor);
        else if (bm.floorDecor.length && rng.chance(0.13)) w.decor[i] = rng.pick(bm.floorDecor);
      } else if (BLOCKS[above].solid) {
        if (bm.bigCeilDecor.length && w.fg[i + w.w] === B.AIR && rng.chance(0.03)) w.decor[i] = rng.pick(bm.bigCeilDecor);
        else if (bm.ceilDecor.length && rng.chance(0.1)) w.decor[i] = rng.pick(bm.ceilDecor);
      }
    }
  }
}

function biomeIdx(y: number): number {
  for (let i = BIOMES.length - 1; i >= 0; i--) if (y >= BIOMES[i].top) return i;
  return 0;
}

function placeChests(w: World, rng: Rng): void {
  for (let bi = 0; bi < 5; bi++) {
    const bm = BIOMES[bi];
    let placed = 0;
    let tries = 0;
    while (placed < 7 && tries++ < 4000) {
      const x = rng.int(4, w.w - 5);
      const y = rng.int(bm.top + 6, bm.bottom - 2);
      const i = w.idx(x, y);
      if (w.fg[i] !== B.AIR || w.obj[i]) continue;
      if (y < w.surface[x] + 8) continue;
      if (!BLOCKS[w.fg[i + w.w]].solid || w.fg[i + w.w] === B.LAVA) continue;
      if (Math.abs(x - SPAWN_X) < 8 && y < BIOMES[1].top) continue;
      w.obj[i] = Obj.CHEST;
      w.decor[i] = 0;
      placed++;
    }
  }
}

