/**
 * Floodwater: pockets of water sealed in the rock, most of all in the wet Mossroot Grotto.
 * The rock around any water weeps (it looks dark and wet, and drips from its underside), so
 * a careful delver can tell. Break into a pocket and it bursts out and runs down into
 * whatever you dug below it; a tunnel can fill over your head, and underwater you hold your
 * breath (see Game.updateBreath).
 */
import { B, BLOCKS } from '../data/blocks';
import { BIOMES } from '../data/biomes';
import { WICK_X } from '../data/wick';
import type { World } from './world';
import { Rng } from '../rng';

/** seconds of air in one breath */
export const BREATH_MAX = 10;

/** this rock has water close behind it (within two tiles): it weeps */
export function dampAt(w: World, x: number, y: number): boolean {
  for (let dy = -2; dy <= 2; dy++) {
    const r = 2 - Math.abs(dy);
    for (let dx = -r; dx <= r; dx++) {
      if ((dx || dy) && w.get(x + dx, y + dy) === B.WATER) return true;
    }
  }
  return false;
}

/**
 * Sealed water pockets at world creation (their own random stream, so nothing else moves).
 * Returns every tile that was filled, so an older save can be given the same pockets.
 */
export function seedAquifers(w: World, seed: number): number[] {
  const rng = new Rng((seed ^ 0x2f10d) >>> 0);
  const filled: number[] = [];
  const plan: { bi: number; n: number; minDepth: number }[] = [
    { bi: 0, n: 7, minDepth: 22 },
    { bi: 1, n: 16, minDepth: 0 },
    { bi: 2, n: 8, minDepth: 0 },
  ];
  for (const p of plan) {
    const bm = BIOMES[p.bi];
    let made = 0;
    for (let tries = 0; tries < p.n * 120 && made < p.n; tries++) {
      const x = rng.int(9, w.w - 10);
      const y = rng.int(bm.top + 4, bm.bottom - 5);
      if (y - w.surface[x] < Math.max(p.minDepth, 10)) continue;
      if (Math.abs(x - WICK_X) < 18 && y - w.surface[x] < 40) continue;
      const rx = rng.int(3, 5);
      const ry = rng.int(2, 3);
      // a shell of plain rock all round (a tile thick at least), nothing built in it, no gas
      let ok = true;
      for (let dy = -ry - 1; dy <= ry + 1 && ok; dy++) {
        for (let dx = -rx - 1; dx <= rx + 1 && ok; dx++) {
          if (!w.inside(x + dx, y + dy)) {
            ok = false;
            break;
          }
          const i = w.idx(x + dx, y + dy);
          const def = BLOCKS[w.fg[i]];
          if (!def.solid || def.unbreakable || def.liquid || w.obj[i] || w.rail[i] || w.gas[i]) ok = false;
        }
      }
      if (!ok) continue;
      for (let dy = -ry; dy <= ry; dy++) {
        for (let dx = -rx; dx <= rx; dx++) {
          if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) > 1.05) continue;
          const i = w.idx(x + dx, y + dy);
          w.fg[i] = B.WATER;
          w.decor[i] = 0;
          if (!w.wall[i]) w.wall[i] = bm.base;
          filled.push(i);
        }
      }
      made++;
    }
  }
  return filled;
}
