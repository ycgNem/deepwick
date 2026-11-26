import { SAVE_KEY, SETTINGS_KEY } from './constants';
import type { Progress } from './state';
import { World } from './world/world';
import { generateWorld } from './world/gen';
import { B, BLOCKS } from './data/blocks';
import { farFromFlame } from './world/gas';

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

export function saveGame(p: Progress, w: World): boolean {
  const data: SaveFile = { p, fg: rle(w.fg), wall: rle(w.wall), obj: rle(w.obj), decor: rle(w.decor), explored: rle(w.explored), rail: rle(w.rail), placed: rle(w.placed), gas: rle(w.gas), water: 1 };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function hasSave(): boolean {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function loadGame(): { p: Progress; world: World } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveFile;
    if (!data.p || data.p.version !== 2) return null;
    // saves from before fishing
    const sk = data.p.skills as Partial<Progress['skills']>;
    if (!sk.fishing) sk.fishing = { lvl: 1, xp: 0 };
    const world = generateWorld(data.p.seed);
    // worlds saved before there was water get the cave pools wherever that space is still open
    const pools: number[] = [];
    if (!data.water) for (let i = 0; i < world.fg.length; i++) if (world.fg[i] === B.WATER) pools.push(i);
    const gassy: number[] = [];
    if (!data.gas) for (let i = 0; i < world.gas.length; i++) if (world.gas[i]) gassy.push(i);
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
    else {
      // a world from before firedamp: open its seams where the rock is still as it was made
      // (but never right beside a torch or fire the player has put up since, nor in their buildings)
      for (const i of gassy) {
        const x = i % world.w;
        const y = (i - x) / world.w;
        const def = BLOCKS[world.fg[i]];
        if (!farFromFlame(world, x, y, 8) || world.placed[i] || world.placed[i - world.w]) world.gas[i] = 0;
        else if (def.solid && !def.unbreakable && !world.obj[i] && !world.rail[i]) world.fg[i] = B.AIR;
        else if (def.solid || world.fg[i] === B.WATER || world.fg[i] === B.LAVA) world.gas[i] = 0;
      }
    }
    world.updateAllSky();
    world.dirty.clear();
    return { p: data.p, world };
  } catch (e) {
    console.warn('save load failed', e);
    return null;
  }
}

export function deleteSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
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
