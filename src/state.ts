import { CONSUMABLES, ConsumableId, ITEMS, RELICS } from './data/items';
import { PICKS, LANTERNS, PACKS, BOOTS, ARMORS, Cost } from './data/upgrades';
import { TILE } from './constants';

export type SkillId = 'mining' | 'combat' | 'delving';
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

export interface Progress {
  version: 1;
  seed: number;
  coins: number;
  pack: Record<string, number>;
  stash: Record<string, number>;
  cons: Record<ConsumableId, number>;
  hotbar: number;
  up: { pick: number; lantern: number; pack: number; boots: number; armor: number; sharpen: number; ember: boolean; lens: boolean };
  skills: Record<SkillId, Skill>;
  catalogued: string[];
  /** relics already dropped in the world (so each drops once) */
  relicsDropped: string[];
  lifts: boolean[];
  maxDepth: number;
  bounties: Bounty[];
  bountiesDone: number;
  stats: { mined: number; ores: number; kills: number; deaths: number; chests: number; time: number; earned: number };
  satchel: { x: number; y: number; items: Record<string, number> } | null;
  bossDefeated: boolean;
  seen: Record<string, boolean>;
  hp: number;
  oil: number;
  px: number;
  py: number;
}

export function newProgress(seed: number, spawnX: number, spawnY: number): Progress {
  const cons = {} as Record<ConsumableId, number>;
  for (const c of CONSUMABLES) cons[c] = 0;
  cons.torch = 12;
  cons.ladder = 12;
  cons.tonic = 1;
  cons.oil = 1;
  cons.recall = 1;
  return {
    version: 1,
    seed,
    coins: 40,
    pack: {},
    stash: {},
    cons,
    hotbar: 0,
    up: { pick: 0, lantern: 0, pack: 0, boots: 0, armor: 0, sharpen: 0, ember: false, lens: false },
    skills: { mining: { lvl: 1, xp: 0 }, combat: { lvl: 1, xp: 0 }, delving: { lvl: 1, xp: 0 } },
    catalogued: [],
    relicsDropped: [],
    lifts: [true, false, false, false, false],
    maxDepth: 0,
    bounties: [],
    bountiesDone: 0,
    stats: { mined: 0, ores: 0, kills: 0, deaths: 0, chests: 0, time: 0, earned: 0 },
    satchel: null,
    bossDefeated: false,
    seen: {},
    hp: ARMORS[0].hp,
    oil: LANTERNS[0].oil,
    px: spawnX * TILE + TILE / 2,
    py: spawnY * TILE + TILE,
  };
}

export const MAX_LEVEL = 60;
export function xpToNext(lvl: number): number {
  return Math.round(30 * Math.pow(lvl, 1.65));
}

export interface Stats {
  maxHp: number;
  reduce: number;
  pickTier: number;
  pickDmg: number;
  mineSpeed: number;
  attack: number;
  light: number;
  oilMax: number;
  oilDrain: number;
  packCap: number;
  speed: number;
  jumps: number;
  fallSafe: number;
  reach: number;
  sellMult: number;
  doubleChance: number;
  xpMult: Record<SkillId, number>;
  heatResist: number;
}

export function has(p: Progress, relic: string): boolean {
  return p.catalogued.includes(relic);
}

export function computeStats(p: Progress): Stats {
  const pick = PICKS[p.up.pick];
  const lan = LANTERNS[p.up.lantern];
  const boot = BOOTS[p.up.boots];
  const arm = ARMORS[p.up.armor];
  const m = p.skills.mining.lvl;
  const c = p.skills.combat.lvl;
  const d = p.skills.delving.lvl;
  const all = has(p, 'r_heart') ? 0.25 : 0;
  const pickDmg = pick.dmg * (1 + p.up.sharpen * 0.08);
  return {
    maxHp: arm.hp + (c - 1) * 2 + (has(p, 'r_rootheart') ? 15 : 0),
    reduce: arm.reduce,
    pickTier: pick.tier,
    pickDmg,
    mineSpeed: (1 + (m - 1) * 0.02) * (has(p, 'r_prism') ? 1.08 : 1),
    attack: pickDmg * 3 * (1 + (c - 1) * 0.03) * (has(p, 'r_skull') ? 1.1 : 1),
    light: lan.radius + (has(p, 'r_glowcap') ? 1 : 0),
    oilMax: lan.oil * (has(p, 'r_geode') ? 1.25 : 1),
    oilDrain: 1 / (1 + (d - 1) * 0.01),
    packCap: PACKS[p.up.pack].cap,
    speed: boot.speed,
    jumps: boot.jumps,
    fallSafe: boot.fallSafe,
    reach: 3.4 + (has(p, 'r_mirror') ? 1 : 0),
    sellMult: (1 + (d - 1) * 0.01) * (has(p, 'r_coin') ? 1.05 : 1) * (has(p, 'r_crown') ? 1.1 : 1),
    doubleChance: (m - 1) * 0.006 + (has(p, 'r_scarab') ? 0.04 : 0),
    xpMult: {
      mining: (1 + all) * (has(p, 'r_ammonite') ? 1.1 : 1),
      combat: (1 + all) * (has(p, 'r_idol') ? 1.15 : 1),
      delving: (1 + all) * (has(p, 'r_starmap') ? 1.25 : 1),
    },
    heatResist: has(p, 'r_tooth') ? 0.5 : 1,
  };
}

export function packCount(p: Progress): number {
  let n = 0;
  for (const k in p.pack) n += p.pack[k];
  return n;
}

export function owned(p: Progress, id: string): number {
  return (p.pack[id] ?? 0) + (p.stash[id] ?? 0);
}

export function canAfford(p: Progress, cost: Cost): boolean {
  if (p.coins < cost.coins) return false;
  for (const [id, n] of Object.entries(cost.items)) if (owned(p, id) < n) return false;
  return true;
}

export function pay(p: Progress, cost: Cost): void {
  p.coins -= cost.coins;
  for (const [id, n0] of Object.entries(cost.items)) {
    let n = n0;
    const fromStash = Math.min(n, p.stash[id] ?? 0);
    take(p.stash, id, fromStash);
    n -= fromStash;
    take(p.pack, id, n);
  }
}

export function add(bag: Record<string, number>, id: string, n: number): void {
  bag[id] = (bag[id] ?? 0) + n;
}
export function take(bag: Record<string, number>, id: string, n: number): void {
  if (n <= 0) return;
  bag[id] = (bag[id] ?? 0) - n;
  if (bag[id] <= 0) delete bag[id];
}

export function itemValue(id: string, st: Stats): number {
  const def = ITEMS[id];
  if (!def) return 0;
  return Math.max(1, Math.round(def.value * st.sellMult));
}

/** the next relic of a biome that has not dropped yet */
export function nextRelic(p: Progress, biome: number): string | null {
  for (const r of RELICS) if (r.biome === biome && !p.relicsDropped.includes(r.id)) return r.id;
  return null;
}
