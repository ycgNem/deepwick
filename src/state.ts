import type { ModeId } from './data/nerve';
import { ITEMS, RELICS, ItemDef, SHOP_STOCK } from './data/items';
import { TILE, INV_SIZE, DAY_LENGTH } from './constants';
import { WickState, flameLevel } from './data/wick';

export type SkillId = 'mining' | 'combat' | 'delving' | 'fishing';
export interface Skill {
  lvl: number;
  xp: number;
}

export type BountyKind = 'deliver' | 'slay' | 'depth' | 'chests';
export interface Bounty {
  kind: BountyKind;
  target: string;
  need: number;
  have: number;
  reward: number;
  xp: number;
  text: string;
}

export interface Stack {
  id: string;
  n: number;
}
export type Slot = Stack | null;

export interface Equipment {
  armor: Slot;
  lantern: Slot;
  boots: Slot;
  charm1: Slot;
  charm2: Slot;
}
export type EquipKey = keyof Equipment;

export type BuildingKind = 'trade' | 'forge' | 'archive';
export interface Building {
  kind: BuildingKind;
  /** centre column (tiles) */
  x: number;
  /** ground row the building stands on */
  y: number;
}

export interface Progress {
  version: 2;
  seed: number;
  coins: number;
  inv: Slot[];
  sel: number;
  equip: Equipment;
  /** storage chest contents keyed by tile index */
  chests: Record<string, Slot[]>;
  buildings: Building[];
  /** the town lantern: kindled or cold, and all the Lumen it has been fed */
  wick: WickState;
  skills: Record<SkillId, Skill>;
  catalogued: string[];
  relicsDropped: string[];
  maxDepth: number;
  bounties: Bounty[];
  bountiesDone: number;
  stats: { mined: number; ores: number; kills: number; deaths: number; chests: number; time: number; earned: number; crafted: number; days: number };
  satchel: { x: number; y: number; items: Stack[] } | null;
  bossDefeated: boolean;
  /** the boss died but its reward was not handed over yet (saved so it can't be lost) */
  bossRewardPending?: boolean;
  /** you have owned a lantern before (a new one comes full, a re-equipped one does not) */
  hadLantern?: boolean;
  seen: Record<string, boolean>;
  hp: number;
  oil: number;
  food: number;
  hearts: number;
  sharpen: number;
  hone: number;
  /** how much dark you can stand, 0..100 */
  nerve: number;
  /** difficulty */
  mode: ModeId;
  /** how far through the Journal's goals you are */
  journal: number;
  /** a Gloam Tide in progress: the Wick's ward (0..100) and what you have cut down */
  tide?: { day: number; ward: number; kills: number } | null;
  /** Gloam Tides the Wick has held through */
  tidesHeld?: number;
  /** time of day 0..1 (0 = dawn) */
  clock: number;
  spawn: { x: number; y: number };
  px: number;
  py: number;
}

export function newProgress(seed: number, spawnX: number, spawnY: number): Progress {
  return {
    version: 2,
    seed,
    coins: 0,
    inv: new Array<Slot>(INV_SIZE).fill(null),
    sel: 0,
    equip: { armor: null, lantern: null, boots: null, charm1: null, charm2: null },
    chests: {},
    buildings: [],
    wick: { kindled: false, lumen: 0 },
    nerve: 100,
    mode: 'delver',
    journal: 0,
    skills: { mining: { lvl: 1, xp: 0 }, combat: { lvl: 1, xp: 0 }, delving: { lvl: 1, xp: 0 }, fishing: { lvl: 1, xp: 0 } },
    catalogued: [],
    relicsDropped: [],
    maxDepth: 0,
    bounties: [],
    bountiesDone: 0,
    stats: { mined: 0, ores: 0, kills: 0, deaths: 0, chests: 0, time: 0, earned: 0, crafted: 0, days: 1 },
    satchel: null,
    bossDefeated: false,
    seen: {},
    hp: 50,
    oil: 0,
    food: 100,
    hearts: 0,
    sharpen: 0,
    hone: 0,
    clock: 0.08,
    spawn: { x: spawnX, y: spawnY },
    px: spawnX * TILE + TILE / 2,
    py: spawnY * TILE + TILE,
  };
}

export const MAX_LEVEL = 60;
export function xpToNext(lvl: number): number {
  return Math.round(30 * Math.pow(lvl, 1.65));
}
export const DAY_SECONDS = DAY_LENGTH;

// ---------------------------------------------------------------------------- inventory

export function count(p: Progress, id: string): number {
  let n = 0;
  for (const s of p.inv) if (s && s.id === id) n += s.n;
  return n;
}

/** add items; returns how many did not fit */
export function give(slots: Slot[], id: string, n: number): number {
  const def = ITEMS[id];
  if (!def) return 0;
  const max = def.stack;
  for (let i = 0; i < slots.length && n > 0; i++) {
    const s = slots[i];
    if (s && s.id === id && s.n < max) {
      const k = Math.min(n, max - s.n);
      s.n += k;
      n -= k;
    }
  }
  for (let i = 0; i < slots.length && n > 0; i++) {
    if (!slots[i]) {
      const k = Math.min(n, max);
      slots[i] = { id, n: k };
      n -= k;
    }
  }
  return n;
}

export function roomFor(slots: Slot[], id: string): number {
  const def = ITEMS[id];
  if (!def) return 0;
  let r = 0;
  for (const s of slots) {
    if (!s) r += def.stack;
    else if (s.id === id) r += def.stack - s.n;
  }
  return r;
}

/** remove items from anywhere in the inventory; returns how many were removed */
export function takeItems(p: Progress, id: string, n: number): number {
  let removed = 0;
  for (let i = p.inv.length - 1; i >= 0 && removed < n; i--) {
    const s = p.inv[i];
    if (!s || s.id !== id) continue;
    const k = Math.min(s.n, n - removed);
    s.n -= k;
    removed += k;
    if (s.n <= 0) p.inv[i] = null;
  }
  return removed;
}

export function hasAll(p: Progress, need: Record<string, number>): boolean {
  for (const [id, n] of Object.entries(need)) if (count(p, id) < n) return false;
  return true;
}

export function held(p: Progress): Stack | null {
  return p.inv[p.sel] ?? null;
}

export function heldDef(p: Progress): ItemDef | null {
  const s = p.inv[p.sel];
  return s ? ITEMS[s.id] ?? null : null;
}

// ---------------------------------------------------------------------------- stats

export interface Stats {
  maxHp: number;
  reduce: number;
  pickTier: number;
  pickPower: number;
  mineSpeed: number;
  attack: number;
  light: number;
  oilMax: number;
  speed: number;
  jumps: number;
  fallSafe: number;
  reach: number;
  sellMult: number;
  doubleChance: number;
  xpMult: Record<SkillId, number>;
  heatResist: number;
  heatWard: boolean;
  lens: boolean;
}

export function has(p: Progress, relic: string): boolean {
  return p.catalogued.includes(relic);
}

function eq(p: Progress, k: EquipKey): ItemDef | null {
  const s = p.equip[k];
  return s ? ITEMS[s.id] ?? null : null;
}

/** best pickaxe anywhere in the inventory decides the tier you can mine */
export function bestPick(p: Progress): ItemDef | null {
  let best: ItemDef | null = null;
  for (const s of p.inv) {
    if (!s) continue;
    const d = ITEMS[s.id];
    if (d?.kind === 'pick' && (!best || (d.power ?? 0) > (best.power ?? 0))) best = d;
  }
  return best;
}

/** the strongest pickaxe in the ten hotbar slots */
export function bestHotbarPick(p: Progress): ItemDef | null {
  let best: ItemDef | null = null;
  for (let i = 0; i < 10; i++) {
    const s = p.inv[i];
    if (!s) continue;
    const d = ITEMS[s.id];
    if (d?.kind === 'pick' && (!best || (d.tier ?? 0) > (best.tier ?? 0) || ((d.tier ?? 0) === (best.tier ?? 0) && (d.power ?? 0) > (best.power ?? 0)))) best = d;
  }
  return best;
}

export function computeStats(p: Progress): Stats {
  const arm = eq(p, 'armor');
  const lan = eq(p, 'lantern');
  const boot = eq(p, 'boots');
  const charms = [eq(p, 'charm1'), eq(p, 'charm2')].filter((c): c is ItemDef => !!c);
  const fx = (k: 'speed' | 'mine' | 'hp' | 'light' | 'reduce'): number => charms.reduce((a, c) => a + (c.fx?.[k] ?? 0), 0);
  const m = p.skills.mining.lvl;
  const c = p.skills.combat.lvl;
  const d = p.skills.delving.lvl;
  const all = has(p, 'r_heart') ? 0.25 : 0;
  const hd = heldDef(p);
  // holding a pick uses it; holding anything that is not a weapon or hammer borrows the
  // best pickaxe on the hotbar, so torches and blocks in hand never stop you digging
  const pick = hd?.kind === 'pick' ? hd : hd?.kind === 'sword' || hd?.kind === 'hammer' || hd?.kind === 'bow' ? null : bestHotbarPick(p);
  const pickPower = (pick?.power ?? 0.55) * (1 + p.sharpen * 0.08);
  let attack = 2.5;
  if (hd?.kind === 'sword') attack = (hd.dmg ?? 1) * (1 + p.hone * 0.08);
  else if (pick) attack = pickPower * 2.2;
  attack *= (1 + (c - 1) * 0.03) * (has(p, 'r_skull') ? 1.1 : 1);
  return {
    maxHp: 50 + p.hearts * 10 + (arm?.hp ?? 0) + (c - 1) * 2 + (has(p, 'r_rootheart') ? 15 : 0) + fx('hp') + (flameLevel(p.wick) >= 4 ? 20 : 0),
    reduce: Math.min(0.7, (arm?.reduce ?? 0) + fx('reduce')),
    pickTier: pick?.tier ?? 0,
    pickPower,
    mineSpeed: (1 + (m - 1) * 0.02 + fx('mine')) * (has(p, 'r_prism') ? 1.08 : 1),
    attack,
    light: (lan?.radius ?? 0) + (has(p, 'r_glowcap') ? 1 : 0) + fx('light'),
    oilMax: (lan?.oil ?? 0) * (has(p, 'r_geode') ? 1.25 : 1),
    speed: (boot?.speed ?? 1) * (1 + fx('speed')),
    jumps: boot?.jumps ?? 1,
    fallSafe: boot?.fallSafe ?? 7,
    reach: 4.2 + (has(p, 'r_mirror') ? 1 : 0),
    sellMult: (1 + (d - 1) * 0.01) * (has(p, 'r_coin') ? 1.05 : 1) * (has(p, 'r_crown') ? 1.1 : 1),
    doubleChance: (m - 1) * 0.006 + (has(p, 'r_scarab') ? 0.04 : 0),
    xpMult: {
      mining: (1 + all) * (has(p, 'r_ammonite') ? 1.1 : 1),
      combat: (1 + all) * (has(p, 'r_idol') ? 1.15 : 1),
      delving: (1 + all) * (has(p, 'r_starmap') ? 1.25 : 1),
      fishing: 1 + all,
    },
    heatResist: has(p, 'r_tooth') ? 0.5 : 1,
    heatWard: charms.some((ch) => ch.fx?.heat),
    lens: charms.some((ch) => ch.fx?.lens),
  };
}

export function itemValue(id: string, st: Stats): number {
  const def = ITEMS[id];
  if (!def || def.value <= 0 || def.kind === 'ammo') return 0;
  const v = Math.max(1, Math.round(def.value * st.sellMult));
  // anything Pell stocks sells back for well under what it costs, so the shop can't print money
  const stock = SHOP_STOCK.find((s) => s.id === id);
  return stock ? Math.min(v, Math.floor((stock.price / stock.n) * 0.4)) : v;
}

/** the next relic of a biome that has not dropped yet */
export function nextRelic(p: Progress, biome: number): string | null {
  for (const r of RELICS) if (r.biome === biome && !p.relicsDropped.includes(r.id)) return r.id;
  return null;
}
