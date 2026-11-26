export type Behavior = 'flyer' | 'hopper' | 'walker' | 'shooter' | 'phaser' | 'roller' | 'critter' | 'charger' | 'lurker' | 'still';

export interface DropRule {
  id: string;
  chance: number;
  n: [number, number];
}

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  dmg: number;
  speed: number;
  xp: number;
  drops: DropRule[];
  coins: [number, number];
  behavior: Behavior;
  /** sprite frame size */
  size: number;
  /** collision box (w,h) in world px */
  box: [number, number];
  /** source sprite faces right */
  facesRight: boolean;
  fps: number;
  glow?: [number, number, number];
  /** projectile colour for shooters */
  shot?: string;
  /** never hurts the player on touch */
  passive?: boolean;
  /** burns away in daylight */
  nocturnal?: boolean;
  /** a creature of the dark itself: no sprite, drawn as living shadow, burned by any light */
  shade?: boolean;
}

const d = (id: string, chance: number, a = 1, b = a): DropRule => ({ id, chance, n: [a, b] });

export const ENEMIES: Record<string, EnemyDef> = {
  rabbit: { id: 'rabbit', name: 'Hill Rabbit', hp: 4, dmg: 0, speed: 120, xp: 2, drops: [d('rawmeat', 0.8), d('hide', 0.5), d('rabbitfoot', 0.04)], coins: [0, 0], behavior: 'critter', size: 32, box: [20, 18], facesRight: true, fps: 12, passive: true },
  boar: { id: 'boar', name: 'Tusked Boar', hp: 16, dmg: 8, speed: 85, xp: 8, drops: [d('rawmeat', 1, 1, 2), d('hide', 0.8, 1, 2)], coins: [0, 2], behavior: 'charger', size: 48, box: [34, 26], facesRight: true, fps: 10 },
  hollow: { id: 'hollow', name: 'Hollow', hp: 22, dmg: 9, speed: 52, xp: 10, drops: [d('ash', 0.75, 1, 2), d('torch', 0.2, 1, 3), d('coppershield', 0.01)], coins: [1, 5], behavior: 'walker', size: 48, box: [20, 40], facesRight: true, fps: 8, nocturnal: true, glow: [0.15, 0.05, 0.25] },
  bat: { id: 'bat', name: 'Duskwing Bat', hp: 3, dmg: 4, speed: 90, xp: 4, drops: [d('batwing', 0.65)], coins: [0, 2], behavior: 'flyer', size: 48, box: [24, 18], facesRight: true, fps: 14 },
  slime: { id: 'slime', name: 'Mudling', hp: 5, dmg: 5, speed: 70, xp: 5, drops: [d('gel', 0.9, 1, 2)], coins: [0, 3], behavior: 'hopper', size: 48, box: [26, 20], facesRight: true, fps: 9 },
  beetle: { id: 'beetle', name: 'Mossback Beetle', hp: 13, dmg: 11, speed: 60, xp: 11, drops: [d('shell', 0.6)], coins: [2, 6], behavior: 'walker', size: 48, box: [32, 20], facesRight: true, fps: 12 },
  toad: { id: 'toad', name: 'Glowcap Toad', hp: 16, dmg: 12, speed: 90, xp: 13, drops: [d('sporecap', 0.7, 1, 2)], coins: [2, 7], behavior: 'hopper', size: 48, box: [30, 24], facesRight: true, fps: 8, glow: [0.05, 0.3, 0.25] },
  spider: { id: 'spider', name: 'Shardspinner', hp: 24, dmg: 16, speed: 105, xp: 19, drops: [d('silk', 0.6, 1, 2)], coins: [4, 10], behavior: 'walker', size: 48, box: [32, 18], facesRight: true, fps: 14, glow: [0.2, 0.05, 0.3] },
  wisp: { id: 'wisp', name: 'Prism Wisp', hp: 20, dmg: 14, speed: 60, xp: 22, drops: [d('essence', 0.65)], coins: [4, 12], behavior: 'shooter', size: 48, box: [24, 24], facesRight: true, fps: 10, glow: [0.35, 0.35, 0.55], shot: '#cfc8ff' },
  imp: { id: 'imp', name: 'Cinder Imp', hp: 38, dmg: 20, speed: 85, xp: 32, drops: [d('horn', 0.6)], coins: [8, 18], behavior: 'shooter', size: 48, box: [24, 26], facesRight: true, fps: 12, glow: [0.5, 0.2, 0.05], shot: '#ff8a2a' },
  slug: { id: 'slug', name: 'Magma Roller', hp: 55, dmg: 24, speed: 55, xp: 34, drops: [d('magmacore', 0.6)], coins: [8, 20], behavior: 'roller', size: 48, box: [32, 30], facesRight: true, fps: 10, glow: [0.45, 0.15, 0.02] },
  wraith: { id: 'wraith', name: 'Gloam Wraith', hp: 62, dmg: 28, speed: 55, xp: 46, drops: [d('ecto', 0.6)], coins: [14, 30], behavior: 'phaser', size: 48, box: [24, 34], facesRight: true, fps: 9, glow: [0.15, 0.05, 0.3] },
  gloamling: { id: 'gloamling', name: 'Gloamling', hp: 9, dmg: 6, speed: 74, xp: 6, drops: [d('gloammote', 0.6)], coins: [0, 2], behavior: 'lurker', size: 32, box: [18, 18], facesRight: true, fps: 8, shade: true },
  lampless: { id: 'lampless', name: 'Lampless', hp: 56, dmg: 24, speed: 120, xp: 38, drops: [d('coldlamp', 1)], coins: [5, 14], behavior: 'still', size: 64, box: [20, 54], facesRight: true, fps: 10 },
  sentinel: { id: 'sentinel', name: 'Vault Sentinel', hp: 120, dmg: 36, speed: 45, xp: 64, drops: [d('gear', 0.7)], coins: [20, 45], behavior: 'walker', size: 64, box: [34, 46], facesRight: true, fps: 8, glow: [0.05, 0.15, 0.35] },
};

/** surface spawns */
export const DAY_SURFACE = ['rabbit', 'rabbit', 'boar'];
export const NIGHT_SURFACE = ['hollow', 'hollow', 'bat'];
