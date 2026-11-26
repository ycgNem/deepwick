/**
 * Bad ground: cracked, loose rock that stays where it is only while something holds it up.
 * Dig out the tile under it (or pull down the timber that props it) and it starts to give:
 * it creaks, dust trickles, and a moment later it drops as a falling rock that lands as rubble.
 * Loose rock sits in patches through the upper layers, around the rich ore, and over the old
 * mine drifts, whose timber frames are what hold their roofs up.
 *
 * Loose is a flag per tile (any natural rock can be loose), saved with the world.
 */
import { B, BLOCKS } from '../data/blocks';
import { BIOMES } from '../data/biomes';
import { WICK_X } from '../data/wick';
import { Obj, objSolid, type World } from './world';
import { Rng } from '../rng';

/** how far to either side a timber prop's cap board holds the roof */
export const PROP_REACH = 2;
/** the tallest opening a prop can stand in */
export const PROP_MAX = 5;

/** the roof row over a prop standing at (x,y): the first rock above it, or -1 if it is too far up */
export function propRoof(w: World, x: number, y: number): number {
  for (let k = 1; k <= PROP_MAX; k++) if (w.rock(x, y - k)) return y - k;
  return -1;
}

/** a prop's cap board, somewhere within reach below, holds this roof tile up */
export function propHeld(w: World, x: number, y: number): boolean {
  for (let dx = -PROP_REACH; dx <= PROP_REACH; dx++) {
    const cx = x + dx;
    for (let k = 1; k <= PROP_MAX; k++) {
      const cy = y + k;
      if (!w.inside(cx, cy) || w.rock(cx, cy)) break;
      if (w.obj[w.idx(cx, cy)] === Obj.BEAM) {
        if (propRoof(w, cx, cy) === y) return true;
        break;
      }
    }
  }
  return false;
}

/** something holds this tile up: rock (not liquid) under it, a closed door, or a prop's cap board */
export function supported(w: World, x: number, y: number): boolean {
  if (y + 1 >= w.h) return true;
  const below = BLOCKS[w.get(x, y + 1)];
  if (below.solid && !below.liquid) return true;
  if (objSolid(w.getObj(x, y + 1))) return true;
  return propHeld(w, x, y);
}

/** rock that can be bad ground: natural and breakable, not built, nothing fixed in it */
function canLoosen(w: World, i: number): boolean {
  const b = w.fg[i];
  const def = BLOCKS[b];
  if (!def.solid || def.unbreakable || def.liquid) return false;
  if (b === B.PLANKS || b === B.STONE_BRICK || b === B.RUIN_BRICK || b === B.GRAVEL || b === B.HEARTSTONE || b === B.RELIC_STONE) return false;
  return !w.placed[i] && !w.obj[i] && !w.rail[i];
}

/** where the town stands, the ground is sound */
function nearTown(w: World, x: number, y: number): boolean {
  return Math.abs(x - WICK_X) < 18 && y - w.surface[x] < 30;
}

/** rich ore lies in bad ground */
const RICH = new Set<number>([B.SILVER, B.AMETHYST, B.GOLD, B.RUBY, B.JADE]);

/** lay out the bad ground at world creation (its own random stream, so nothing else moves) */
export function seedLoose(w: World, seed: number): void {
  const rng = new Rng((seed ^ 0x10053ed) >>> 0);
  const L = w.loose;
  const plan: { bi: number; patches: number; minDepth: number }[] = [
    { bi: 0, patches: 30, minDepth: 14 },
    { bi: 1, patches: 38, minDepth: 0 },
    { bi: 2, patches: 24, minDepth: 0 },
    { bi: 3, patches: 18, minDepth: 0 },
  ];
  // ---- patches of cracked rock
  for (const p of plan) {
    const bm = BIOMES[p.bi];
    let made = 0;
    for (let tries = 0; tries < p.patches * 30 && made < p.patches; tries++) {
      const x = rng.int(6, w.w - 7);
      const y = rng.int(bm.top + 2, bm.bottom - 3);
      if (y - w.surface[x] < Math.max(p.minDepth, 8) || nearTown(w, x, y)) continue;
      // a patch wants open space near it (a cave roof or wall), or it would never matter
      let open = 0;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -6; dx <= 6; dx++) if (w.inside(x + dx, y + dy) && !w.rock(x + dx, y + dy)) open++;
      if (open < 6) continue;
      const rx = rng.int(2, 5);
      const ry = rng.int(1, 3);
      for (let dy = -ry; dy <= ry; dy++) {
        for (let dx = -rx; dx <= rx; dx++) {
          if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) > 1.1 || !rng.chance(0.82)) continue;
          if (!w.inside(x + dx, y + dy)) continue;
          const i = w.idx(x + dx, y + dy);
          if (canLoosen(w, i)) L[i] = 1;
        }
      }
      made++;
    }
  }
  // ---- rich ore lies in bad ground
  for (let y = 20; y < w.h - 1; y++) {
    for (let x = 1; x < w.w - 1; x++) {
      if (!RICH.has(w.fg[w.idx(x, y)]) || nearTown(w, x, y)) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = w.idx(x + dx, y + dy);
          if (canLoosen(w, i) && !RICH.has(w.fg[i]) && rng.chance(0.3)) L[i] = 1;
        }
      }
    }
  }
  // ---- the old drifts: their frames hold up bad roofs
  for (let y = 1; y < w.h - 1; y++) {
    for (let x = 1; x < w.w - 1; x++) {
      if (w.obj[w.idx(x, y)] !== Obj.BEAM) continue;
      const roof = propRoof(w, x, y);
      if (roof < 0 || y - w.surface[x] < 6 || nearTown(w, x, y)) continue;
      for (let dx = -PROP_REACH; dx <= PROP_REACH; dx++) {
        for (let dy = 0; dy <= 1; dy++) {
          if (!w.inside(x + dx, roof - dy)) continue;
          const i = w.idx(x + dx, roof - dy);
          if (canLoosen(w, i) && rng.chance(dy === 0 ? 0.8 : 0.5)) L[i] = 1;
        }
      }
    }
  }
  settleLoose(w);
}

/** nothing starts out falling: bad ground with nothing under it is sound after all */
export function settleLoose(w: World): void {
  const L = w.loose;
  for (let i = 0; i < L.length; i++) {
    if (!L[i]) continue;
    const x = i % w.w;
    const y = (i - x) / w.w;
    if (!w.rock(x, y) || !supported(w, x, y)) L[i] = 0;
  }
}

/** how hard a falling rock hits at this depth */
export function rockDamage(biome: number): number {
  return 9 + biome * 3;
}
