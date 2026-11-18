import { World, Obj } from './world';
import { B, BLOCKS } from '../data/blocks';
import { BIOMES, BiomeDef, LIFT_ROWS } from '../data/biomes';
import { WORLD_W, WORLD_H, SURFACE_Y, CAMP_X0, CAMP_X1, SHAFT_X } from '../constants';
import { Rng, fbm, valueNoise, clamp } from '../rng';

export const MINE_ENTRANCE_X = SHAFT_X - 7;
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

  // ---- surface line ------------------------------------------------------
  for (let x = 0; x < W; x++) {
    let h = SURFACE_Y + Math.round((fbm(x * 0.045, 3.3, seed) - 0.5) * 14);
    const dCamp = x < CAMP_X0 ? CAMP_X0 - x : x > CAMP_X1 ? x - CAMP_X1 : 0;
    const t = clamp(dCamp / 10, 0, 1);
    h = Math.round(SURFACE_Y + (h - SURFACE_Y) * t);
    // hills rise toward the world edges
    const edge = Math.min(x, W - 1 - x);
    if (edge < 14) h -= Math.round((14 - edge) * 0.5);
    w.surface[x] = h;
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
        const stoneChance = clamp((depth - 6) / 50, 0, 0.75);
        if (n1 < stoneChance) b = B.STONE;
        if (depth > 3 && n2 > 0.7) b = bm.pocket;
        if (depth < 14 && n2 < 0.28) b = B.CLAY;
        if (depth === 0) b = B.GRASS;
      } else {
        if (n1 > 0.55) b = bm.alt;
        if (n2 > 0.73) b = bm.pocket;
      }
      w.fg[i] = b;
      w.wall[i] = b === B.GRASS ? B.DIRT : b;
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
    const count = bi === 0 ? 7 : 6;
    for (let k = 0; k < count; k++) {
      let x = rng.range(6, W - 6);
      let y = rng.range(bm.top + 8, bm.bottom - 4);
      let ang = rng.range(0, Math.PI * 2);
      const len = rng.int(40, 110);
      const rad = rng.range(0.9, 1.6);
      for (let s = 0; s < len; s++) {
        ang += rng.range(-0.35, 0.35);
        // keep tunnels mostly horizontal
        ang = ang * 0.92 + (Math.cos(ang) > 0 ? 0 : Math.PI) * 0.08;
        x += Math.cos(ang);
        y += Math.sin(ang) * 0.6;
        y = clamp(y, bm.top + 6, bm.bottom - 2);
        x = clamp(x, 4, W - 5);
        carveCircle(w, x, y, rad, offs, false);
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
  buildMineshafts(w, rng);
  buildGeodes(w, rng);
  buildRuins(w, rng);
  buildHeartChamber(w);

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

  // ---- camp: entrance shaft + lifts ---------------------------------------------------
  buildCampEntrance(w);
  for (let s = 1; s < LIFT_ROWS.length; s++) buildLiftStation(w, LIFT_ROWS[s]);

  // ---- decor + chests ------------------------------------------------------------------
  placeDecor(w, rng);
  placeChests(w, rng);

  w.dirty.clear();
  return w;
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

function buildMineshafts(w: World, rng: Rng): void {
  const bm = BIOMES[0];
  for (let k = 0; k < 5; k++) {
    const len = rng.int(14, 28);
    const x0 = rng.int(4, w.w - 5 - len);
    const y = rng.int(bm.top + 16, bm.bottom - 6);
    for (let x = x0; x < x0 + len; x++) {
      for (let dy = -2; dy <= 0; dy++) {
        const i = w.idx(x, y + dy);
        if (w.fg[i] === B.BEDROCK) continue;
        w.fg[i] = B.AIR;
        if (w.wall[i] === 0) w.wall[i] = B.STONE;
      }
      w.fg[w.idx(x, y + 1)] = B.PLANKS;
      if ((x - x0) % 5 === 2) w.obj[w.idx(x, y)] = Obj.BEAM;
    }
    w.obj[w.idx(x0 + len - 2, y)] = Obj.CHEST;
    w.obj[w.idx(x0 + 1, y - 1)] = Obj.TORCH;
    w.decor[w.idx(x0 + 4, y)] = rng.pick([143, 144, 145]);
    w.decor[w.idx(x0 + len - 6, y)] = rng.pick([152, 144, 143]);
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

function buildCampEntrance(w: World): void {
  // a wooden-framed shaft leading down from camp into the first tunnels
  const x0 = MINE_ENTRANCE_X;
  const top = SURFACE_Y;
  const bottom = SURFACE_Y + 16;
  for (let y = top; y <= bottom + 1; y++) {
    const i = w.idx(x0, y);
    w.fg[i] = B.AIR;
    w.wall[i] = B.PLANKS;
    w.obj[i] = Obj.LADDER;
  }
  // landing tunnel heading east
  for (let x = x0 - 3; x <= x0 + 14; x++) {
    for (let y = bottom - 1; y <= bottom + 1; y++) {
      const i = w.idx(x, y);
      w.fg[i] = B.AIR;
      if (w.wall[i] === 0) w.wall[i] = B.DIRT;
    }
    w.fg[w.idx(x, bottom + 2)] = B.PLANKS;
    if ((x - x0) % 5 === 3) w.obj[w.idx(x, bottom + 1)] = Obj.BEAM;
  }
  w.obj[w.idx(x0 + 2, bottom)] = Obj.TORCH;
  w.obj[w.idx(x0 + 10, bottom)] = Obj.TORCH;
  // frame beams at the mouth
  w.fg[w.idx(x0 - 1, top)] = B.PLANKS;
  w.fg[w.idx(x0 + 1, top)] = B.PLANKS;
}

function buildLiftStation(w: World, row: number): void {
  const cx = SHAFT_X;
  for (let y = row - 3; y <= row; y++) {
    for (let x = cx - 4; x <= cx + 4; x++) {
      const i = w.idx(x, y);
      w.fg[i] = B.AIR;
      w.decor[i] = 0;
      if (w.wall[i] === 0) w.wall[i] = B.STONE;
    }
  }
  for (let x = cx - 5; x <= cx + 5; x++) w.fg[w.idx(x, row + 1)] = B.PLANKS;
  w.obj[w.idx(cx, row)] = Obj.LIFT;
  w.obj[w.idx(cx - 3, row - 2)] = Obj.TORCH;
  w.obj[w.idx(cx + 3, row - 2)] = Obj.TORCH;
}

const LIGHT_DECOR = new Set([37, 39, 44, 45, 54, 139, 140, 141, 156, 157]);
export function decorLight(code: number): [number, number, number] | null {
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
      if (!BLOCKS[w.fg[i + w.w]].solid || w.fg[i + w.w] === B.LAVA) continue;
      if (Math.abs(x - SHAFT_X) < 6) continue;
      w.obj[i] = Obj.CHEST;
      w.decor[i] = 0;
      placed++;
    }
  }
}

/** The surface camp is solid ground with no decor; return the spawn point in tiles. */
export function campSpawn(): { x: number; y: number } {
  return { x: SHAFT_X - 3, y: SURFACE_Y - 1 };
}
