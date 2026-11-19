import { B } from './blocks';
import { SURFACE_Y } from '../constants';
import { PROPS, PropKind } from './props';

export interface OreRule {
  block: B;
  /** veins per 1000 tiles of biome */
  freq: number;
  size: [number, number];
}

export interface BiomeDef {
  id: number;
  name: string;
  top: number;
  bottom: number;
  tier: number;
  base: B;
  alt: B;
  /** third rock used in occasional pockets */
  pocket: B;
  ores: OreRule[];
  enemies: string[];
  /** max enemies alive near the player */
  enemyCap: number;
  /** ambient tint for remembered (explored but unlit) tiles */
  memory: [number, number, number];
  /** fog colour behind open caverns */
  sky: [string, string];
  caveThreshold: number;
  floorDecor: number[];
  ceilDecor: number[];
  bigDecor: number[];
  bigCeilDecor: number[];
  music: 'cave' | 'deep';
  flavor: string;
  /** big cave formations: which kinds grow here and how often (per eligible tile) */
  props: { floor: PropKind[]; ceil: PropKind[]; floorChance: number; ceilChance: number };
}

// decor codes: <100 = 16px icon index, >=100 = 32px icon index + 100
export const BIOMES: BiomeDef[] = [
  {
    id: 0,
    name: 'Topsoil Tunnels',
    top: SURFACE_Y,
    bottom: 89,
    tier: 1,
    base: B.DIRT,
    alt: B.STONE,
    pocket: B.GRAVEL,
    ores: [
      { block: B.COAL, freq: 9, size: [3, 7] },
      { block: B.COPPER, freq: 8, size: [3, 6] },
      { block: B.FOSSIL, freq: 0.5, size: [1, 1] },
    ],
    enemies: ['bat', 'slime'],
    enemyCap: 3,
    memory: [0.17, 0.14, 0.12],
    sky: ['#1a120c', '#0a0605'],
    caveThreshold: 0.6,
    floorDecor: [35, 38, 40, 41, 43, 48, 50, 52, 53],
    ceilDecor: [36, 42, 42, 47],
    bigDecor: [137, 142, 143, 144, 145, 152, 153],
    bigCeilDecor: [138],
    music: 'cave',
    flavor: 'Old tunnels, older bones. Coal and copper for the taking.',
    props: { floor: ['stalagmite'], ceil: ['stalactite', 'roots'], floorChance: 0.05, ceilChance: 0.06 },
  },
  {
    id: 1,
    name: 'Mossroot Grotto',
    top: 90,
    bottom: 169,
    tier: 2,
    base: B.MOSS_STONE,
    alt: B.GROTTO_ROCK,
    pocket: B.CLAY,
    ores: [
      { block: B.IRON, freq: 8, size: [3, 6] },
      { block: B.JADE, freq: 3.5, size: [2, 4] },
      { block: B.COAL, freq: 3, size: [2, 5] },
      { block: B.GLOWMOSS, freq: 3, size: [3, 8] },
      { block: B.FOSSIL, freq: 0.35, size: [1, 1] },
    ],
    enemies: ['beetle', 'toad', 'bat'],
    enemyCap: 5,
    memory: [0.09, 0.16, 0.15],
    sky: ['#0a1a18', '#030a09'],
    caveThreshold: 0.56,
    floorDecor: [37, 37, 38, 44, 50, 43],
    ceilDecor: [42, 49, 49, 36],
    bigDecor: [139, 139, 160, 152, 137],
    bigCeilDecor: [159, 159, 138],
    music: 'cave',
    flavor: 'Damp, green and humming with spores. Iron sleeps under the moss.',
    props: { floor: ['mushroom', 'mushroom', 'stalagmite'], ceil: ['roots', 'roots', 'stalactite'], floorChance: 0.08, ceilChance: 0.1 },
  },
  {
    id: 2,
    name: 'Crystal Hollows',
    top: 170,
    bottom: 259,
    tier: 3,
    base: B.CRYSTAL_ROCK,
    alt: B.GEODE,
    pocket: B.STONE,
    ores: [
      { block: B.SILVER, freq: 7, size: [3, 6] },
      { block: B.AMETHYST, freq: 3.5, size: [2, 5] },
      { block: B.IRON, freq: 2, size: [2, 4] },
      { block: B.DIAMOND, freq: 0.18, size: [1, 2] },
      { block: B.RELIC_STONE, freq: 0.2, size: [1, 1] },
    ],
    enemies: ['spider', 'wisp'],
    enemyCap: 5,
    memory: [0.14, 0.12, 0.2],
    sky: ['#160c24', '#06030c'],
    caveThreshold: 0.55,
    floorDecor: [39, 39, 40, 44, 35],
    ceilDecor: [36, 47, 39],
    bigDecor: [140, 141, 140, 137, 156],
    bigCeilDecor: [138],
    music: 'cave',
    flavor: 'Everything here glitters and something is always watching.',
    props: { floor: ['crystal', 'crystal', 'stalagmite'], ceil: ['stalactite'], floorChance: 0.08, ceilChance: 0.05 },
  },
  {
    id: 3,
    name: 'Ember Depths',
    top: 260,
    bottom: 349,
    tier: 4,
    base: B.BASALT,
    alt: B.MAGMA_ROCK,
    pocket: B.OBSIDIAN,
    ores: [
      { block: B.GOLD, freq: 6, size: [3, 6] },
      { block: B.RUBY, freq: 3, size: [2, 4] },
      { block: B.SILVER, freq: 1.5, size: [2, 4] },
      { block: B.DIAMOND, freq: 0.22, size: [1, 2] },
      { block: B.RELIC_STONE, freq: 0.2, size: [1, 1] },
    ],
    enemies: ['imp', 'slug'],
    enemyCap: 6,
    memory: [0.2, 0.11, 0.07],
    sky: ['#2a0c04', '#0c0301'],
    caveThreshold: 0.57,
    floorDecor: [45, 45, 46, 40, 41],
    ceilDecor: [36, 36],
    bigDecor: [157, 158, 157, 142],
    bigCeilDecor: [138],
    music: 'deep',
    flavor: 'The rock breathes heat. Without a ward, it will cook you slowly.',
    props: { floor: ['magma'], ceil: ['stalactite'], floorChance: 0.07, ceilChance: 0.03 },
  },
  {
    id: 4,
    name: 'Sunless Vault',
    top: 350,
    bottom: 432,
    tier: 5,
    base: B.ABYSS_STONE,
    alt: B.OBSIDIAN,
    pocket: B.BASALT,
    ores: [
      { block: B.VOIDSTEEL, freq: 6, size: [3, 5] },
      { block: B.LUMENITE, freq: 2.5, size: [1, 3] },
      { block: B.GOLD, freq: 1.5, size: [2, 4] },
      { block: B.DIAMOND, freq: 0.3, size: [1, 2] },
      { block: B.RELIC_STONE, freq: 0.22, size: [1, 1] },
    ],
    enemies: ['wraith', 'sentinel'],
    enemyCap: 6,
    memory: [0.1, 0.09, 0.17],
    sky: ['#0c0618', '#020106'],
    caveThreshold: 0.58,
    floorDecor: [53, 48, 54, 46, 41],
    ceilDecor: [47, 36],
    bigDecor: [154, 155, 156, 154, 163],
    bigCeilDecor: [],
    music: 'deep',
    flavor: 'Halls built by no one living. The dark here eats lantern light.',
    props: { floor: ['ruin', 'stalagmite'], ceil: [], floorChance: 0.05, ceilChance: 0 },
  },
  {
    id: 5,
    name: 'The Heart Chamber',
    top: 433,
    bottom: 459,
    tier: 6,
    base: B.HEARTSTONE,
    alt: B.OBSIDIAN,
    pocket: B.HEARTSTONE,
    ores: [],
    enemies: [],
    enemyCap: 0,
    memory: [0.19, 0.06, 0.09],
    sky: ['#2a040c', '#0a0103'],
    caveThreshold: 1,
    floorDecor: [],
    ceilDecor: [],
    bigDecor: [],
    bigCeilDecor: [],
    music: 'deep',
    flavor: 'Something vast is beating down here.',
    props: { floor: [], ceil: [], floorChance: 0, ceilChance: 0 },
  },
];

export function biomeAt(row: number): BiomeDef {
  for (let i = BIOMES.length - 1; i >= 0; i--) if (row >= BIOMES[i].top) return BIOMES[i];
  return BIOMES[0];
}

export interface DecorDrop {
  id: string;
  chance: number;
  n?: [number, number];
}

/** what each kind of big cave formation leaves behind when broken */
const PROP_DROPS: Record<PropKind, DecorDrop> = {
  stalactite: { id: 'stone', chance: 1, n: [1, 2] },
  stalagmite: { id: 'stone', chance: 1, n: [1, 2] },
  mushroom: { id: 'sporecap', chance: 1, n: [2, 3] },
  roots: { id: 'wood', chance: 0.8, n: [1, 2] },
  crystal: { id: 'amethyst', chance: 0.5, n: [1, 1] },
  magma: { id: 'magmarock', chance: 1, n: [1, 2] },
  ruin: { id: 'ruinbrick', chance: 1, n: [1, 2] },
  cart: { id: 'wood', chance: 1, n: [3, 5] },
};

/** decor codes that can be harvested, and what they drop */
export const DECOR_DROPS: Record<number, DecorDrop> = {
  43: { id: 'mushroom', chance: 1 },
  37: { id: 'sporecap', chance: 1 },
  139: { id: 'sporecap', chance: 1 },
  159: { id: 'sporecap', chance: 1 },
  49: { id: 'seeds', chance: 0.35 },
  50: { id: 'seeds', chance: 0.35 },
  44: { id: 'seeds', chance: 0.15 },
  51: { id: 'seeds', chance: 0.15 },
};

for (const p of PROPS) DECOR_DROPS[p.code] = PROP_DROPS[p.kind];

/** small surface plants scattered on grass */
export const SURFACE_DECOR = [49, 49, 50, 50, 44, 51, 43];
