import { SAVE_KEY, SETTINGS_KEY } from './constants';
import type { Progress } from './state';
import { World } from './world/world';
import { generateWorld } from './world/gen';

interface SaveFile {
  p: Progress;
  fg: string;
  obj: string;
  decor: string;
  explored: string;
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
  const data: SaveFile = { p, fg: rle(w.fg), obj: rle(w.obj), decor: rle(w.decor), explored: rle(w.explored) };
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
    if (!data.p || data.p.version !== 1) return null;
    const world = generateWorld(data.p.seed);
    unrle(data.fg, world.fg);
    unrle(data.obj, world.obj);
    unrle(data.decor, world.decor);
    unrle(data.explored, world.explored);
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
}
export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>;
    return { music: s.music ?? 0.45, sfx: s.sfx ?? 0.7 };
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
