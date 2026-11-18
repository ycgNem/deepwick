import type { IconRef } from './items';

export type Cost = { coins: number; items: Record<string, number> };

export interface Tier {
  name: string;
  icon: IconRef;
  desc: string;
  cost: Cost;
}

const i32 = (idx: number): IconRef => ({ sheet: 'i32', idx });

export interface PickTier extends Tier {
  tier: number;
  dmg: number;
}
export const PICKS: PickTier[] = [
  { name: 'Rusty Pick', icon: i32(0), tier: 1, dmg: 1, desc: 'Breaks dirt, stone, coal and copper.', cost: { coins: 0, items: {} } },
  { name: 'Copper Pick', icon: i32(1), tier: 2, dmg: 1.7, desc: 'Bites through Mossroot Grotto rock and iron.', cost: { coins: 120, items: { copper: 14, coal: 6 } } },
  { name: 'Iron Pick', icon: i32(2), tier: 3, dmg: 2.8, desc: 'Cracks the Crystal Hollows: silver and amethyst.', cost: { coins: 650, items: { iron: 16, jade: 4, coal: 10 } } },
  { name: 'Silver Pick', icon: i32(3), tier: 4, dmg: 4.4, desc: 'Cuts Ember Depths basalt, gold, rubies and diamond.', cost: { coins: 2200, items: { silver: 18, amethyst: 6 } } },
  { name: 'Goldforged Pick', icon: i32(4), tier: 5, dmg: 6.8, desc: 'Breaks Sunless Vault stone, obsidian and voidsteel.', cost: { coins: 6500, items: { gold: 20, ruby: 6, diamond: 1 } } },
  { name: 'Voidsteel Pick', icon: i32(5), tier: 6, dmg: 10.5, desc: 'The only tool that can open the Heart Chamber.', cost: { coins: 16000, items: { voidsteel: 20, lumenite: 8, diamond: 2 } } },
];

export interface LanternTier extends Tier {
  radius: number;
  oil: number;
}
export const LANTERNS: LanternTier[] = [
  { name: 'Tin Lantern', icon: i32(6), radius: 5, oil: 150, desc: 'Dim, but it is yours.', cost: { coins: 0, items: {} } },
  { name: 'Brass Lantern', icon: i32(7), radius: 6, oil: 220, desc: 'Brighter flame, deeper tank.', cost: { coins: 110, items: { copper: 8, coal: 4 } } },
  { name: 'Silver Lantern', icon: i32(8), radius: 7.2, oil: 310, desc: 'Cold blue light that carries far.', cost: { coins: 900, items: { silver: 6, sporecap: 4 } } },
  { name: 'Ruby Lantern', icon: i32(9), radius: 8.4, oil: 420, desc: 'Burns warm through the deepest dark.', cost: { coins: 3200, items: { gold: 8, ruby: 4 } } },
  { name: 'Crystal Lantern', icon: i32(10), radius: 10, oil: 560, desc: 'Captured starlight. Barely needs oil.', cost: { coins: 9000, items: { lumenite: 6, essence: 6 } } },
];

export interface PackTier extends Tier {
  cap: number;
}
export const PACKS: PackTier[] = [
  { name: 'Old Satchel', icon: i32(11), cap: 20, desc: 'Holds 20 finds.', cost: { coins: 0, items: {} } },
  { name: 'Sturdy Satchel', icon: i32(11), cap: 35, desc: 'Holds 35 finds.', cost: { coins: 80, items: { batwing: 3, gel: 3 } } },
  { name: 'Large Backpack', icon: i32(12), cap: 55, desc: 'Holds 55 finds.', cost: { coins: 450, items: { shell: 5, iron: 5 } } },
  { name: 'Miner\'s Pack', icon: i32(12), cap: 80, desc: 'Holds 80 finds.', cost: { coins: 1500, items: { silk: 8, silver: 5 } } },
  { name: 'Delver\'s Pack', icon: i32(13), cap: 120, desc: 'Holds 120 finds.', cost: { coins: 5000, items: { horn: 8, gold: 6 } } },
  { name: 'Bottomless Pack', icon: i32(13), cap: 180, desc: 'Holds 180 finds.', cost: { coins: 12000, items: { ecto: 8, voidsteel: 6 } } },
];

export interface BootTier extends Tier {
  speed: number;
  jumps: number;
  fallSafe: number;
}
export const BOOTS: BootTier[] = [
  { name: 'Worn Boots', icon: i32(14), speed: 1, jumps: 1, fallSafe: 7, desc: 'Falls over 7 tiles hurt.', cost: { coins: 0, items: {} } },
  { name: 'Spring Boots', icon: i32(15), speed: 1.08, jumps: 2, fallSafe: 11, desc: 'Double jump. Safe falls up to 11 tiles.', cost: { coins: 350, items: { shell: 4, copper: 10, gel: 6 } } },
  { name: 'Gilded Wingboots', icon: i32(16), speed: 1.2, jumps: 3, fallSafe: 999, desc: 'Triple jump, faster stride, no fall damage.', cost: { coins: 4200, items: { essence: 6, gold: 6, batwing: 12 } } },
];

export interface ArmorTier extends Tier {
  hp: number;
  reduce: number;
}
export const ARMORS: ArmorTier[] = [
  { name: 'Work Clothes', icon: i32(17), hp: 60, reduce: 0, desc: '60 health.', cost: { coins: 0, items: {} } },
  { name: 'Leather Coat', icon: i32(17), hp: 85, reduce: 0.1, desc: '85 health, 10% less damage.', cost: { coins: 220, items: { batwing: 6, gel: 4 } } },
  { name: 'Iron Harness', icon: i32(18), hp: 120, reduce: 0.2, desc: '120 health, 20% less damage.', cost: { coins: 1300, items: { iron: 14, shell: 6 } } },
  { name: 'Crystal Mail', icon: i32(19), hp: 165, reduce: 0.3, desc: '165 health, 30% less damage.', cost: { coins: 4600, items: { amethyst: 8, silk: 8, silver: 6 } } },
  { name: 'Gloamward Plate', icon: i32(19), hp: 220, reduce: 0.4, desc: '220 health, 40% less damage.', cost: { coins: 12500, items: { gear: 8, voidsteel: 8, magmacore: 6 } } },
];

export const CHARMS: Record<'ember' | 'lens', Tier> = {
  ember: { name: 'Emberward Talisman', icon: i32(20), desc: 'Protects you from the heat of the Ember Depths.', cost: { coins: 2600, items: { magmacore: 5, horn: 4, ruby: 2 } } },
  lens: { name: 'Sunglass Lens', icon: i32(21), desc: 'Stops the Sunless Vault from swallowing your lantern light.', cost: { coins: 7000, items: { gold: 10, ruby: 4, essence: 6 } } },
};

export function sharpenCost(level: number): number {
  return Math.round(60 * Math.pow(1.75, level));
}
export const SHARPEN_MAX = 10;
