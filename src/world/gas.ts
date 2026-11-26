/**
 * Firedamp: the mine gas that collects in sealed seams beside the coal and pools along cave
 * roofs. It is lighter than air, so it creeps upward and spreads along ceilings. An open
 * flame in it (a torch in hand or on the wall, a campfire, a lamp, lava) sets the whole
 * connected cloud off in a rushing flash. The lantern is a safety lamp and never lights it.
 *
 * One byte per tile (0-255) lives on the World. Only a window around the player is
 * simulated, a few times a second; sealed pockets far away keep until you come near.
 */
import { WORLD_W, WORLD_H } from '../constants';
import { BLOCKS, B } from '../data/blocks';
import { BIOMES } from '../data/biomes';
import { WICK_X } from '../data/wick';
import type { World } from './world';
import { Obj } from './world';
import type { Rng } from '../rng';

/** thick enough to see as haze in the light */
export const GAS_SEEN = 12;
/** an open flame in gas this thick sets it off */
export const GAS_IGNITE = 28;
/** a flash carries through gas at least this thick */
export const GAS_BURN = 12;
/** thick enough that its flash blows the soft rock around it apart */
export const GAS_DENSE = 110;

/** objects that are an open flame */
export function isFlameObj(o: number): boolean {
  return o === Obj.TORCH || o === Obj.CAMPFIRE || o === Obj.LAMP || o === Obj.WICKPOST || o === Obj.FURNACE;
}

/** gas can be in this tile (open air: not rock, not water or lava) */
export function gasOpen(w: World, i: number): boolean {
  const b = w.fg[i];
  return !BLOCKS[b].solid && b !== B.WATER && b !== B.LAVA;
}

let cur = new Int16Array(0);
let nxt = new Int16Array(0);
let open = new Uint8Array(0);

/**
 * One step of the gas over the window [x0,x1) x [y0,y1): it rises fast, spreads sideways
 * slowly, sinks hardly at all, and thin haze fades. Gas over open sky blows away.
 * Returns how many tiles in the window still hold gas.
 */
export function stepGas(w: World, x0: number, y0: number, x1: number, y1: number, rnd: () => number): number {
  x0 = Math.max(1, x0);
  y0 = Math.max(1, y0);
  x1 = Math.min(WORLD_W - 1, x1);
  y1 = Math.min(WORLD_H - 1, y1);
  const ww = x1 - x0;
  const hh = y1 - y0;
  if (ww <= 0 || hh <= 0) return 0;
  const n = ww * hh;
  if (cur.length < n) {
    cur = new Int16Array(n);
    nxt = new Int16Array(n);
    open = new Uint8Array(n);
  }
  const g = w.gas;
  let any = 0;
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < ww; x++) {
      const wi = (y + y0) * WORLD_W + x + x0;
      const k = y * ww + x;
      const o = gasOpen(w, wi) ? 1 : 0;
      open[k] = o;
      const v = o ? g[wi] : 0;
      if (!o && g[wi]) g[wi] = 0; // a block placed into it pushes it out
      cur[k] = v;
      nxt[k] = v;
      any |= v;
    }
  }
  if (!any) return 0;
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < ww; x++) {
      const k = y * ww + x;
      if (!open[k]) continue;
      const v = cur[k];
      // with the tile above: gas rises
      if (y > 0 && open[k - ww]) {
        const u = cur[k - ww];
        let f = 0;
        if (v > u) f = Math.floor((v - u) * 0.4);
        else if (u > v) f = -Math.floor((u - v) * 0.04);
        if (f) {
          nxt[k] -= f;
          nxt[k - ww] += f;
        }
      }
      // with the tile to the right: it spreads
      if (x < ww - 1 && open[k + 1]) {
        const r = cur[k + 1];
        const f = Math.trunc((v - r) * 0.16);
        if (f) {
          nxt[k] -= f;
          nxt[k + 1] += f;
        }
      }
    }
  }
  let count = 0;
  for (let y = 0; y < hh; y++) {
    const wy = y + y0;
    for (let x = 0; x < ww; x++) {
      const k = y * ww + x;
      if (!open[k]) continue;
      let v = nxt[k];
      if (v > 0) {
        const wx = x + x0;
        // under open sky the wind takes it
        if (wy < w.skyline[wx]) v = Math.floor(v * 0.6);
        // thin haze thins away
        else if (v < 26 && rnd() < 0.22) v -= 1;
        if (v < 3) v = 0;
      }
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      g[wy * WORLD_W + x + x0] = v;
      if (v) count++;
    }
  }
  return count;
}

/** the strongest whiff of gas within r tiles, through rock too (what a canary smells), fading with distance */
export function sniff(w: World, tx: number, ty: number, r: number): number {
  let best = 0;
  const g = w.gas;
  for (let y = Math.max(0, ty - r); y <= Math.min(WORLD_H - 1, ty + r); y++) {
    for (let x = Math.max(0, tx - r); x <= Math.min(WORLD_W - 1, tx + r); x++) {
      const v = g[y * WORLD_W + x];
      if (!v) continue;
      const d = Math.hypot(x - tx, y - ty);
      if (d > r) continue;
      const s = v * (1 - d / (r + 1));
      if (s > best) best = s;
    }
  }
  return best;
}

/** nothing that burns within r tiles: no lava, no flame */
export function farFromFlame(w: World, x: number, y: number, r: number): boolean {
  for (let yy = y - r; yy <= y + r; yy++) {
    for (let xx = x - r; xx <= x + r; xx++) {
      if (!w.inside(xx, yy)) continue;
      const i = w.idx(xx, yy);
      if (w.fg[i] === B.LAVA || isFlameObj(w.obj[i])) return false;
    }
  }
  return true;
}

/**
 * Firedamp at world creation: sealed seams in the rock (often ringed with coal) and gas
 * hanging under the roofs of some caves. Kept clear of the meadow, the Wick and any flame.
 */
export function seedGas(w: World, rng: Rng): void {
  const plan: { bi: number; seams: number; pools: number; minDepth: number }[] = [
    { bi: 0, seams: 14, pools: 3, minDepth: 22 },
    { bi: 1, seams: 18, pools: 7, minDepth: 0 },
    { bi: 2, seams: 12, pools: 5, minDepth: 0 },
    { bi: 3, seams: 5, pools: 0, minDepth: 0 },
  ];
  for (const p of plan) {
    const bm = BIOMES[p.bi];
    // ---- sealed seams: a hollow in solid rock, thick with gas
    let made = 0;
    for (let tries = 0; tries < p.seams * 40 && made < p.seams; tries++) {
      const x = rng.int(8, WORLD_W - 9);
      const y = rng.int(bm.top + 3, bm.bottom - 4);
      if (y - w.surface[x] < Math.max(p.minDepth, 8)) continue;
      if (Math.abs(x - WICK_X) < 14 && y - w.surface[x] < 40) continue;
      const rx = rng.int(2, 4);
      const ry = rng.int(1, 2);
      let ok = true;
      for (let dy = -ry - 1; dy <= ry + 1 && ok; dy++) {
        for (let dx = -rx - 1; dx <= rx + 1 && ok; dx++) {
          const i = w.idx(x + dx, y + dy);
          const def = BLOCKS[w.fg[i]];
          if (!def.solid || def.unbreakable || w.obj[i] || w.rail[i]) ok = false;
        }
      }
      if (!ok || !farFromFlame(w, x, y, 7)) continue;
      for (let dy = -ry - 1; dy <= ry + 1; dy++) {
        for (let dx = -rx - 1; dx <= rx + 1; dx++) {
          const inside = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1.05;
          const i = w.idx(x + dx, y + dy);
          if (inside) {
            w.fg[i] = B.AIR;
            if (!w.wall[i]) w.wall[i] = bm.base;
            // denser up under its roof
            w.gas[i] = Math.min(255, 175 + rng.int(0, 50) + (ry - dy) * 10);
          } else if (p.bi <= 1 && rng.chance(0.3) && BLOCKS[w.fg[i]].tier <= 1) w.fg[i] = B.COAL;
        }
      }
      made++;
    }
    // ---- gas hanging under cave roofs
    made = 0;
    for (let tries = 0; tries < p.pools * 60 && made < p.pools; tries++) {
      const x = rng.int(8, WORLD_W - 9);
      const y = rng.int(bm.top + 2, bm.bottom - 3);
      if (y - w.surface[x] < Math.max(p.minDepth, 10)) continue;
      const i0 = w.idx(x, y);
      if (!gasOpen(w, i0) || !w.rock(x, y - 1)) continue;
      if (!farFromFlame(w, x, y, 10)) continue;
      // flood the cave air near the roof
      const q = [i0];
      const seen = new Set<number>([i0]);
      let filled = 0;
      while (q.length && filled < 70) {
        const i = q.shift() as number;
        const tx = i % WORLD_W;
        const ty = (i - tx) / WORLD_W;
        let roof = 0;
        while (roof < 4 && !w.rock(tx, ty - roof - 1)) roof++;
        if (roof >= 4) continue;
        w.gas[i] = Math.max(w.gas[i], 140 - roof * 34);
        filled++;
        for (const j of [i - 1, i + 1, i - WORLD_W, i + WORLD_W]) {
          if (seen.has(j)) continue;
          seen.add(j);
          if (gasOpen(w, j)) q.push(j);
        }
      }
      if (filled > 12) made++;
    }
  }
}
