import { SAVE_KEY, SETTINGS_KEY } from './constants';
import type { Progress } from './state';
import { World } from './world/world';
import { generateWorld } from './world/gen';
import { B, BLOCKS } from './data/blocks';
import { farFromFlame } from './world/gas';
import { settleLoose } from './world/cavein';
import { FLAME, flameLevel } from './data/wick';

/**
 * Three worlds side by side. World 1 keeps the key the single save always had, so a save from
 * before slots is simply World 1. Each world has a small card of its own (day, flame, depth, a
 * strip of its map) so the title can show them without reading whole worlds.
 */
export const SLOTS = 3;
const LAST_KEY = 'deepwick-slot';
let active = 1;
export function slotKey(n: number): string {
  return n <= 1 ? SAVE_KEY : `${SAVE_KEY}-${n}`;
}
function metaKey(n: number): string {
  return `${slotKey(n)}-meta`;
}
/** play in this world from now on (and remember it as the last one played) */
export function useSlot(n: number): void {
  active = Math.max(1, Math.min(SLOTS, Math.round(n)));
  try {
    localStorage.setItem(LAST_KEY, String(active));
  } catch {
    // ignore
  }
}
export function currentSlot(): number {
  return active;
}
/** the world played last, or the first one there is */
export function lastSlot(): number {
  let n = 1;
  try {
    n = Number(localStorage.getItem(LAST_KEY)) || 1;
  } catch {
    // ignore
  }
  if (n >= 1 && n <= SLOTS && hasSave(n)) return n;
  for (let k = 1; k <= SLOTS; k++) if (hasSave(k)) return k;
  return 1;
}
export function anySave(): boolean {
  for (let k = 1; k <= SLOTS; k++) if (hasSave(k)) return true;
  return false;
}

/** what a world's card on the title shows */
export interface SlotMeta {
  day: number;
  /** the Wick's flame by name ('Cold' before it is kindled) */
  flame: string;
  deepest: number;
  /** seconds played */
  time: number;
  mode: string;
  stilled: boolean;
  /** when it was last saved (ms), 0 if not known */
  at: number;
  /** a strip of its map as a data URL */
  map?: string;
}
export function slotMeta(n: number): SlotMeta | null {
  try {
    const raw = localStorage.getItem(metaKey(n));
    if (raw) return JSON.parse(raw) as SlotMeta;
    const save = localStorage.getItem(slotKey(n));
    if (!save) return null;
    // a save from before there were slots: read its card out of it once
    const p = (JSON.parse(save) as SaveFile).p;
    const lvl = flameLevel(p.wick);
    const m: SlotMeta = { day: p.stats?.days ?? 1, flame: p.bossDefeated ? 'Dawn' : lvl > 0 ? FLAME[lvl].name : 'Cold', deepest: p.maxDepth ?? 0, time: p.stats?.time ?? 0, mode: p.mode ?? 'delver', stilled: !!p.bossDefeated, at: 0 };
    localStorage.setItem(metaKey(n), JSON.stringify(m));
    return m;
  } catch {
    return null;
  }
}

interface SaveFile {
  p: Progress;
  fg: string;
  wall: string;
  obj: string;
  decor: string;
  explored: string;
  rail?: string;
  placed?: string;
  /** firedamp; saves from before it have their seams carved where the rock is still whole */
  gas?: string;
  /** loose rock (bad ground), from cycle 13 */
  loose?: string;
  /** set once the world has its sealed water pockets (cycle 14) */
  flood?: number;
  /** set once worlds had water in them */
  water?: number;
}

/** run-length encode a byte array as (value, run) pairs, then base64 */
function rle(a: Uint8Array): string {
  const out: number[] = [];
  let i = 0;
  while (i < a.length) {
    const v = a[i];
    let run = 1;
    while (i + run < a.length && a[i + run] === v && run < 255) run++;
    out.push(v, run);
    i += run;
  }
  let s = '';
  const bytes = new Uint8Array(out);
  for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return btoa(s);
}

function unrle(b64: string, target: Uint8Array): void {
  const s = atob(b64);
  let o = 0;
  for (let k = 0; k + 1 < s.length; k += 2) {
    const v = s.charCodeAt(k);
    const run = s.charCodeAt(k + 1);
    target.fill(v, o, Math.min(target.length, o + run));
    o += run;
  }
}

export function saveGame(p: Progress, w: World, meta?: SlotMeta): boolean {
  const data: SaveFile = { p, fg: rle(w.fg), wall: rle(w.wall), obj: rle(w.obj), decor: rle(w.decor), explored: rle(w.explored), rail: rle(w.rail), placed: rle(w.placed), gas: rle(w.gas), loose: rle(w.loose), water: 1, flood: 1 };
  try {
    localStorage.setItem(slotKey(active), JSON.stringify(data));
    if (meta) {
      try {
        localStorage.setItem(metaKey(active), JSON.stringify(meta));
      } catch {
        // the card is a nicety: never let it cost the save
        delete meta.map;
        localStorage.setItem(metaKey(active), JSON.stringify(meta));
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function hasSave(n = active): boolean {
  try {
    return !!localStorage.getItem(slotKey(n));
  } catch {
    return false;
  }
}

export function loadGame(n = active): { p: Progress; world: World } | null {
  try {
    const raw = localStorage.getItem(slotKey(n));
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveFile;
    if (!data.p || data.p.version !== 2) return null;
    // saves from before fishing
    const sk = data.p.skills as Partial<Progress['skills']>;
    if (!sk.fishing) sk.fishing = { lvl: 1, xp: 0 };
    const world = generateWorld(data.p.seed);
    const aquifers = data.flood ? [] : world.aquifers;
    const pocketTile = new Set(world.aquifers);
    // worlds saved before there was water get the cave pools wherever that space is still open
    // (pools only: the sealed pockets are handled on their own below)
    const pools: number[] = [];
    if (!data.water) for (let i = 0; i < world.fg.length; i++) if (world.fg[i] === B.WATER && !pocketTile.has(i)) pools.push(i);
    const gassy: number[] = [];
    if (!data.gas) for (let i = 0; i < world.gas.length; i++) if (world.gas[i]) gassy.push(i);
    // the world as it was made, for the migrations that ask "is this still untouched?"
    const made = data.loose && data.gas ? null : world.fg.slice();
    const genFg = data.loose ? null : made;
    unrle(data.fg, world.fg);
    if (data.wall) unrle(data.wall, world.wall);
    unrle(data.obj, world.obj);
    unrle(data.decor, world.decor);
    unrle(data.explored, world.explored);
    if (data.rail) unrle(data.rail, world.rail);
    else world.rail.fill(0);
    if (data.placed) unrle(data.placed, world.placed);
    for (const i of pools) if (world.fg[i] === B.AIR && !world.obj[i] && !world.rail[i]) world.fg[i] = B.WATER;
    if (data.gas) unrle(data.gas, world.gas);
    else if (made) {
      // a world from before firedamp, one cloud at a time. A sealed seam opens only if it and the
      // rock all round it are still as they were made; gas under a cave roof stays only where that
      // air is still open, away from any fire you have lit, your buildings and where you stood.
      for (const cloud of groups(gassy, world.w)) {
        const set = new Set(cloud);
        const seam = cloud.every((i) => ring4(i, world.w).every((j) => set.has(j) || BLOCKS[made[j]].solid));
        if (seam) {
          const whole = cloud.every((i) => untouchedRock(world, i)) && cloud.every((i) => ring8(i, world.w).every((j) => set.has(j) || untouchedRock(world, j)));
          for (const i of cloud) {
            if (whole) world.fg[i] = B.AIR;
            else world.gas[i] = 0;
          }
          continue;
        }
        for (const i of cloud) {
          const x = i % world.w;
          const y = (i - x) / world.w;
          const nearYou = Math.abs(x * 32 - data.p.px) < 12 * 32 && Math.abs(y * 32 - data.p.py) < 10 * 32;
          if (world.fg[i] !== B.AIR || world.placed[i] || world.placed[i - world.w] || nearYou || !farFromFlame(world, x, y, 8)) world.gas[i] = 0;
        }
      }
    }
    if (aquifers.length) {
      // a world from before floodwater: fill a pocket only if it and the rock all round it are
      // still whole (never into a tunnel you have dug, never onto where you stand)
      for (const pocket of groups(aquifers, world.w)) {
        const set = new Set(pocket);
        const whole = pocket.every((i) => untouchedRock(world, i)) && pocket.every((i) => ring8(i, world.w).every((j) => set.has(j) || untouchedRock(world, j)));
        if (!whole) continue;
        for (const i of pocket) {
          world.fg[i] = B.WATER;
          world.gas[i] = 0;
        }
      }
    }
    if (data.loose) unrle(data.loose, world.loose);
    else if (genFg) {
      for (let i = 0; i < world.loose.length; i++) if (world.loose[i] && (world.fg[i] !== genFg[i] || world.placed[i] || world.obj[i])) world.loose[i] = 0;
      settleLoose(world);
    }
    // nothing loose may hang over water that came in above
    if (aquifers.length) settleLoose(world);
    world.updateAllSky();
    world.dirty.clear();
    return { p: data.p, world };
  } catch (e) {
    console.warn('save load failed', e);
    return null;
  }
}

/** the given tiles, in 4-connected groups */
function groups(tiles: number[], W: number): number[][] {
  const set = new Set(tiles);
  const seen = new Set<number>();
  const out: number[][] = [];
  for (const s of tiles) {
    if (seen.has(s)) continue;
    const g: number[] = [];
    const q = [s];
    seen.add(s);
    while (q.length) {
      const i = q.pop() as number;
      g.push(i);
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (set.has(j) && !seen.has(j)) {
          seen.add(j);
          q.push(j);
        }
      }
    }
    out.push(g);
  }
  return out;
}

const ring4 = (i: number, W: number): number[] => [i - 1, i + 1, i - W, i + W];
const ring8 = (i: number, W: number): number[] => [i - 1, i + 1, i - W, i + W, i - W - 1, i - W + 1, i + W - 1, i + W + 1];

/** natural rock nobody has touched: solid, not built, nothing standing in it */
function untouchedRock(w: World, i: number): boolean {
  if (i < 0 || i >= w.fg.length) return false;
  const def = BLOCKS[w.fg[i]];
  return def.solid && !def.liquid && !def.unbreakable && !w.placed[i] && !w.obj[i] && !w.rail[i];
}

export function deleteSave(n = active): void {
  try {
    localStorage.removeItem(slotKey(n));
    localStorage.removeItem(metaKey(n));
  } catch {
    // ignore
  }
}

export interface Settings {
  music: number;
  sfx: number;
  shake?: boolean;
  hints?: boolean;
  hud?: number;
}
export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>;
    return { music: s.music ?? 0.45, sfx: s.sfx ?? 0.7, shake: s.shake ?? true, hints: s.hints ?? true, hud: s.hud ?? 1 };
  } catch {
    return { music: 0.45, sfx: 0.7 };
  }
}
export function storeSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}
