export enum B {
  AIR = 0,
  DIRT,
  CLAY,
  STONE,
  GRAVEL,
  MOSS_STONE,
  GROTTO_ROCK,
  CRYSTAL_ROCK,
  GEODE,
  BASALT,
  MAGMA_ROCK,
  OBSIDIAN,
  LAVA,
  ABYSS_STONE,
  RUIN_BRICK,
  PLANKS,
  BEDROCK,
  COAL,
  COPPER,
  IRON,
  JADE,
  SILVER,
  AMETHYST,
  GOLD,
  RUBY,
  VOIDSTEEL,
  LUMENITE,
  DIAMOND,
  FOSSIL,
  RELIC_STONE,
  GLOWMOSS,
  HEARTSTONE,
  GRASS,
  COUNT,
}

export interface BlockDef {
  name: string;
  /** texture sheet + index: 'r' = rock sheet, 'o' = ore sheet */
  tex: ['r' | 'o', number] | null;
  solid: boolean;
  tier: number;
  hp: number;
  /** item dropped when mined, if any */
  drop?: string;
  xp: number;
  light?: [number, number, number];
  /** colour used for debris particles + minimap */
  color: string;
  ore?: boolean;
  unbreakable?: boolean;
  liquid?: boolean;
}

const D: Partial<Record<B, BlockDef>> = {
  [B.AIR]: { name: 'Air', tex: null, solid: false, tier: 0, hp: 0, xp: 0, color: '#000' },
  [B.DIRT]: { name: 'Dirt', tex: ['r', 0], solid: true, tier: 1, hp: 2, xp: 1, color: '#7a4a2a' },
  [B.CLAY]: { name: 'Clay', tex: ['r', 1], solid: true, tier: 1, hp: 2.6, xp: 1, color: '#6a2c22' },
  [B.STONE]: { name: 'Stone', tex: ['r', 2], solid: true, tier: 1, hp: 3.2, xp: 1, color: '#77777a' },
  [B.GRAVEL]: { name: 'Gravel', tex: ['r', 3], solid: true, tier: 1, hp: 2.4, xp: 1, color: '#3d4a5a' },
  [B.MOSS_STONE]: { name: 'Mossy Stone', tex: ['r', 4], solid: true, tier: 2, hp: 5, xp: 2, color: '#56692a' },
  [B.GROTTO_ROCK]: { name: 'Grotto Rock', tex: ['r', 5], solid: true, tier: 2, hp: 5.6, xp: 2, color: '#1d4a52' },
  [B.CRYSTAL_ROCK]: { name: 'Crystal Rock', tex: ['r', 6], solid: true, tier: 3, hp: 8, xp: 3, color: '#a99ac9' },
  [B.GEODE]: { name: 'Geode Stone', tex: ['r', 7], solid: true, tier: 3, hp: 9, xp: 3, color: '#5a2a8a' },
  [B.BASALT]: { name: 'Basalt', tex: ['r', 8], solid: true, tier: 4, hp: 12, xp: 4, color: '#2c2c30' },
  [B.MAGMA_ROCK]: { name: 'Magma Rock', tex: ['r', 9], solid: true, tier: 4, hp: 13, xp: 4, color: '#5a2010', light: [0.35, 0.12, 0.02] },
  [B.OBSIDIAN]: { name: 'Obsidian', tex: ['r', 10], solid: true, tier: 5, hp: 20, xp: 6, color: '#141428' },
  [B.LAVA]: { name: 'Lava', tex: ['r', 11], solid: false, tier: 99, hp: 0, xp: 0, color: '#ff7a10', light: [1.0, 0.5, 0.12], liquid: true, unbreakable: true },
  [B.ABYSS_STONE]: { name: 'Abyss Stone', tex: ['r', 12], solid: true, tier: 5, hp: 18, xp: 5, color: '#2a1838' },
  [B.RUIN_BRICK]: { name: 'Ruin Brick', tex: ['r', 13], solid: true, tier: 5, hp: 22, xp: 5, color: '#b0905a' },
  [B.PLANKS]: { name: 'Planks', tex: ['r', 14], solid: true, tier: 1, hp: 1.6, xp: 0, color: '#8a5a32' },
  [B.BEDROCK]: { name: 'Bedrock', tex: ['r', 15], solid: true, tier: 99, hp: 9999, xp: 0, color: '#0e1424', unbreakable: true },
  [B.COAL]: { name: 'Coal Ore', tex: ['o', 0], solid: true, tier: 1, hp: 3.6, xp: 3, drop: 'coal', color: '#222', ore: true },
  [B.COPPER]: { name: 'Copper Ore', tex: ['o', 1], solid: true, tier: 1, hp: 4.4, xp: 4, drop: 'copper', color: '#d2742a', ore: true },
  [B.IRON]: { name: 'Iron Ore', tex: ['o', 2], solid: true, tier: 2, hp: 7, xp: 7, drop: 'iron', color: '#c49a6a', ore: true },
  [B.JADE]: { name: 'Jade Vein', tex: ['o', 3], solid: true, tier: 2, hp: 8, xp: 9, drop: 'jade', color: '#3ac26a', ore: true, light: [0.03, 0.12, 0.06] },
  [B.SILVER]: { name: 'Silver Ore', tex: ['o', 4], solid: true, tier: 3, hp: 11, xp: 12, drop: 'silver', color: '#dfe3f0', ore: true },
  [B.AMETHYST]: { name: 'Amethyst Vein', tex: ['o', 5], solid: true, tier: 3, hp: 12, xp: 15, drop: 'amethyst', color: '#9a4ae0', ore: true, light: [0.14, 0.04, 0.22] },
  [B.GOLD]: { name: 'Gold Ore', tex: ['o', 6], solid: true, tier: 4, hp: 16, xp: 20, drop: 'gold', color: '#f2c03a', ore: true },
  [B.RUBY]: { name: 'Ruby Vein', tex: ['o', 7], solid: true, tier: 4, hp: 17, xp: 26, drop: 'ruby', color: '#e0203a', ore: true, light: [0.22, 0.02, 0.05] },
  [B.VOIDSTEEL]: { name: 'Voidsteel Ore', tex: ['o', 8], solid: true, tier: 5, hp: 24, xp: 34, drop: 'voidsteel', color: '#3a3a9a', ore: true },
  [B.LUMENITE]: { name: 'Lumenite', tex: ['o', 9], solid: true, tier: 5, hp: 26, xp: 44, drop: 'lumenite', color: '#bff8ff', ore: true, light: [0.25, 0.7, 0.85] },
  [B.DIAMOND]: { name: 'Diamond', tex: ['o', 10], solid: true, tier: 4, hp: 22, xp: 60, drop: 'diamond', color: '#cff0ff', ore: true, light: [0.08, 0.12, 0.16] },
  [B.FOSSIL]: { name: 'Fossil Bed', tex: ['o', 11], solid: true, tier: 1, hp: 4, xp: 12, drop: '@relic', color: '#e8dcc0', ore: true },
  [B.RELIC_STONE]: { name: 'Relic Stone', tex: ['o', 12], solid: true, tier: 3, hp: 12, xp: 30, drop: '@relic', color: '#e8c050', ore: true, light: [0.4, 0.32, 0.08] },
  [B.GLOWMOSS]: { name: 'Glowmoss', tex: ['o', 13], solid: true, tier: 2, hp: 3, xp: 2, drop: 'sporecap', color: '#2ad0b0', light: [0.08, 0.42, 0.36] },
  [B.HEARTSTONE]: { name: 'Heartstone', tex: ['o', 14], solid: true, tier: 6, hp: 30, xp: 20, color: '#7a1020', light: [0.28, 0.02, 0.06] },
  [B.GRASS]: { name: 'Grassy Dirt', tex: ['o', 15], solid: true, tier: 1, hp: 2, xp: 1, color: '#4a8a2a' },
};

export const BLOCKS: BlockDef[] = [];
for (let i = 0; i < B.COUNT; i++) {
  const d = D[i as B];
  if (!d) throw new Error('missing block def ' + i);
  BLOCKS.push(d);
}

export function isSolid(b: number): boolean {
  return BLOCKS[b].solid;
}
