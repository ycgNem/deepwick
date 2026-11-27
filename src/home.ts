/**
 * Hearth and home. A bed in a closed room (walls all round, a roof, the door shut; built on the
 * meadow or dug into the mountain) with a fire burning in it is a home, and a night slept there
 * leaves you Rested through the next day: the dark frays you slower, you heal faster, and hunger
 * and the winter cold bite less. How long it lasts is the room's comfort: a hearth or a stove, a
 * seat, a table, shelves, something green, a picture on the wall, a rug, a bed for the dog (better
 * with the dog in it), a chest for your things, and walls behind you. One of each kind counts.
 */
import { Obj, type World } from './world/world';
import { FURN, HOME_FIRE, type ComfortKind } from './data/furniture';

/** the most tiles a room can have (more than that is a cave, not a room) */
export const ROOM_MAX = 240;
/** the most comfort a home can have: a hearth (2), eight other kinds, walls behind, and the dog asleep in his bed */
export const COMFORT_MAX = 12;
/** seconds of Rested for a home with no comfort but its fire, and for each point more */
const REST_BASE = 110;
const REST_PER = 30;

export function restFor(comfort: number): number {
  return REST_BASE + REST_PER * comfort;
}

const WANT: [ComfortKind | 'chest', string][] = [
  ['seat', 'somewhere to sit'],
  ['table', 'a table'],
  ['shelf', 'shelves or a cupboard'],
  ['green', 'something green'],
  ['art', 'something on the walls'],
  ['rug', 'a rug'],
  ['chest', 'a chest for your things'],
  ['dog', 'a bed for the dog'],
];

export interface Home {
  /** comfort, not counting the dog asleep in his bed (the game adds that) */
  comfort: number;
  /** 0: no fire (not a home); 1: a campfire or furnace; 2: a hearth or stove */
  fire: number;
  walled: boolean;
  dogBed: { x: number; y: number } | null;
  /** what the room still lacks, cheapest wins first */
  missing: string[];
  tiles: number;
}

/** the closed room a tile is in, as tile indices: null if it is open to the sky or runs on into the dark */
export function roomAt(w: World, x: number, y: number): number[] | null {
  if (!w.inside(x, y) || w.solid(x, y)) return null;
  const start = w.idx(x, y);
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    const tx = i % w.w;
    const ty = (i / w.w) | 0;
    // nothing over it but sky
    if (ty < w.skyline[tx]) return null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (!w.inside(nx, ny)) return null;
      if (w.solid(nx, ny)) continue;
      const j = w.idx(nx, ny);
      if (seen.has(j)) continue;
      seen.add(j);
      if (seen.size > ROOM_MAX) return null;
      stack.push(j);
    }
  }
  return [...seen];
}

/** how homely a room is */
export function judgeRoom(w: World, room: number[]): Home {
  const has = new Set<string>();
  let fire = 0;
  let backed = 0;
  let dogBed: { x: number; y: number } | null = null;
  for (const i of room) {
    if (w.wall[i]) backed++;
    const o = w.obj[i];
    if (!o) continue;
    const hf = HOME_FIRE[o];
    if (hf) fire = Math.max(fire, hf);
    if (o === Obj.STORAGE) has.add('chest');
    const f = FURN.get(o);
    if (f && f.kind !== 'fire') has.add(f.kind);
    if (o === Obj.DOGBED && !dogBed) dogBed = { x: i % w.w, y: (i / w.w) | 0 };
  }
  const walled = backed >= room.length * 0.7;
  let comfort = fire + (walled ? 1 : 0);
  const missing: string[] = [];
  if (fire === 1) missing.push('a proper hearth or stove');
  for (const [k, name] of WANT) {
    if (has.has(k)) comfort++;
    else missing.push(name);
  }
  if (!walled) missing.push('walls behind you (Wood Wall)');
  return { comfort: fire ? comfort : 0, fire, walled, dogBed, missing, tiles: room.length };
}
