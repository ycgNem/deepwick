export type Behavior = 'flyer' | 'hopper' | 'walker' | 'shooter' | 'phaser' | 'roller';

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  dmg: number;
  speed: number;
  xp: number;
  drop: string;
  dropChance: number;
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
}

export const ENEMIES: Record<string, EnemyDef> = {
  bat: { id: 'bat', name: 'Duskwing Bat', hp: 3, dmg: 4, speed: 90, xp: 4, drop: 'batwing', dropChance: 0.65, coins: [0, 2], behavior: 'flyer', size: 48, box: [24, 18], facesRight: true, fps: 14 },
  slime: { id: 'slime', name: 'Mudling', hp: 5, dmg: 5, speed: 70, xp: 5, drop: 'gel', dropChance: 0.7, coins: [0, 3], behavior: 'hopper', size: 48, box: [26, 20], facesRight: true, fps: 9 },
  beetle: { id: 'beetle', name: 'Mossback Beetle', hp: 13, dmg: 11, speed: 60, xp: 11, drop: 'shell', dropChance: 0.6, coins: [2, 6], behavior: 'walker', size: 48, box: [32, 20], facesRight: true, fps: 12 },
  toad: { id: 'toad', name: 'Glowcap Toad', hp: 16, dmg: 12, speed: 90, xp: 13, drop: 'sporecap', dropChance: 0.7, coins: [2, 7], behavior: 'hopper', size: 48, box: [30, 24], facesRight: true, fps: 8, glow: [0.05, 0.3, 0.25] },
  spider: { id: 'spider', name: 'Shardspinner', hp: 24, dmg: 16, speed: 105, xp: 19, drop: 'silk', dropChance: 0.6, coins: [4, 10], behavior: 'walker', size: 48, box: [32, 18], facesRight: true, fps: 14, glow: [0.2, 0.05, 0.3] },
  wisp: { id: 'wisp', name: 'Prism Wisp', hp: 20, dmg: 14, speed: 60, xp: 22, drop: 'essence', dropChance: 0.65, coins: [4, 12], behavior: 'shooter', size: 48, box: [24, 24], facesRight: true, fps: 10, glow: [0.35, 0.35, 0.55], shot: '#cfc8ff' },
  imp: { id: 'imp', name: 'Cinder Imp', hp: 38, dmg: 20, speed: 85, xp: 32, drop: 'horn', dropChance: 0.6, coins: [8, 18], behavior: 'shooter', size: 48, box: [24, 26], facesRight: true, fps: 12, glow: [0.5, 0.2, 0.05], shot: '#ff8a2a' },
  slug: { id: 'slug', name: 'Magma Roller', hp: 55, dmg: 24, speed: 55, xp: 34, drop: 'magmacore', dropChance: 0.6, coins: [8, 20], behavior: 'roller', size: 48, box: [32, 30], facesRight: true, fps: 10, glow: [0.45, 0.15, 0.02] },
  wraith: { id: 'wraith', name: 'Gloam Wraith', hp: 62, dmg: 28, speed: 55, xp: 46, drop: 'ecto', dropChance: 0.6, coins: [14, 30], behavior: 'phaser', size: 48, box: [24, 34], facesRight: true, fps: 9, glow: [0.15, 0.05, 0.3] },
  sentinel: { id: 'sentinel', name: 'Vault Sentinel', hp: 120, dmg: 36, speed: 45, xp: 64, drop: 'gear', dropChance: 0.7, coins: [20, 45], behavior: 'walker', size: 64, box: [34, 46], facesRight: true, fps: 8, glow: [0.05, 0.15, 0.35] },
};
