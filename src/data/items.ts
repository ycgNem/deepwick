export type IconRef = { sheet: 'i16' | 'i32'; idx: number };
export type ItemKind = 'ore' | 'gem' | 'drop' | 'consumable' | 'relic';

export interface ItemDef {
  id: string;
  name: string;
  icon: IconRef;
  value: number;
  kind: ItemKind;
  desc: string;
  /** colour of the sparkle when it drops */
  glow?: string;
}

const i16 = (idx: number): IconRef => ({ sheet: 'i16', idx });
const i32 = (idx: number): IconRef => ({ sheet: 'i32', idx });

const LIST: ItemDef[] = [
  { id: 'coal', name: 'Coal', icon: i16(0), value: 2, kind: 'ore', desc: 'Fuel for every forge in Deepwick.' },
  { id: 'copper', name: 'Copper Ore', icon: i16(1), value: 4, kind: 'ore', desc: 'Soft, orange and everywhere near the surface.' },
  { id: 'iron', name: 'Iron Ore', icon: i16(2), value: 10, kind: 'ore', desc: 'The backbone of any honest pickaxe.' },
  { id: 'jade', name: 'Jade', icon: i16(3), value: 18, kind: 'gem', desc: 'Grows in the damp of the grotto.', glow: '#5af08a' },
  { id: 'silver', name: 'Silver Ore', icon: i16(4), value: 24, kind: 'ore', desc: 'Rings like a bell when struck.' },
  { id: 'amethyst', name: 'Amethyst', icon: i16(5), value: 38, kind: 'gem', desc: 'Hums faintly in the dark.', glow: '#c27aff' },
  { id: 'gold', name: 'Gold Ore', icon: i16(6), value: 55, kind: 'ore', desc: 'Warm to the touch, even this deep.', glow: '#ffd75a' },
  { id: 'ruby', name: 'Ruby', icon: i16(7), value: 85, kind: 'gem', desc: 'Formed where the magma sleeps.', glow: '#ff4a5a' },
  { id: 'voidsteel', name: 'Voidsteel Ore', icon: i16(8), value: 120, kind: 'ore', desc: 'Drinks the light around it.', glow: '#7a6aff' },
  { id: 'lumenite', name: 'Lumenite', icon: i16(9), value: 190, kind: 'gem', desc: 'A shard of trapped starlight.', glow: '#bff8ff' },
  { id: 'diamond', name: 'Diamond', icon: i16(10), value: 320, kind: 'gem', desc: 'The rarest thing in the mountain.', glow: '#e8faff' },

  { id: 'batwing', name: 'Bat Wing', icon: i16(11), value: 3, kind: 'drop', desc: 'Leathery. Smells of guano.' },
  { id: 'gel', name: 'Mud Gel', icon: i16(12), value: 3, kind: 'drop', desc: 'Sticky, useful for waterproofing packs.' },
  { id: 'shell', name: 'Mossback Shell', icon: i16(13), value: 9, kind: 'drop', desc: 'Light and tough as boot leather.' },
  { id: 'sporecap', name: 'Glowcap', icon: i16(14), value: 6, kind: 'drop', desc: 'A mushroom that never stops glowing.', glow: '#4af0d0' },
  { id: 'silk', name: 'Crystal Silk', icon: i16(15), value: 16, kind: 'drop', desc: 'Spun by shardspinners. Stronger than rope.' },
  { id: 'essence', name: 'Wisp Essence', icon: i16(16), value: 22, kind: 'drop', desc: 'A wisp\'s last flicker, bottled.', glow: '#9ad8ff' },
  { id: 'horn', name: 'Imp Horn', icon: i16(17), value: 30, kind: 'drop', desc: 'Still warm.' },
  { id: 'magmacore', name: 'Magma Core', icon: i16(18), value: 40, kind: 'drop', desc: 'The molten heart of a cinder roller.', glow: '#ff8a2a' },
  { id: 'ecto', name: 'Gloam Ectoplasm', icon: i16(19), value: 55, kind: 'drop', desc: 'Darkness, thickened.', glow: '#a05aff' },
  { id: 'gear', name: 'Sentinel Gear', icon: i16(20), value: 70, kind: 'drop', desc: 'Bronze, older than the town.' },

  { id: 'torch', name: 'Torch', icon: i16(21), value: 1, kind: 'consumable', desc: 'Right-click to mount on rock. Lights the dark and keeps creatures away.' },
  { id: 'ladder', name: 'Ladder', icon: i16(22), value: 1, kind: 'consumable', desc: 'Right-click to place. Climb with W / S.' },
  { id: 'bomb', name: 'Blast Charge', icon: i16(23), value: 10, kind: 'consumable', desc: 'Thrown toward the cursor. Breaks rock up to one tier above your pick.' },
  { id: 'oil', name: 'Lamp Oil', icon: i16(24), value: 8, kind: 'consumable', desc: 'Refills 60% of your lantern.' },
  { id: 'tonic', name: 'Red Tonic', icon: i16(25), value: 8, kind: 'consumable', desc: 'Restores half your health.' },
  { id: 'recall', name: 'Recall Charm', icon: i16(26), value: 15, kind: 'consumable', desc: 'Returns you to camp after a short channel.' },
];

export interface RelicDef extends ItemDef {
  biome: number;
  bonus: string;
}

export const RELICS: RelicDef[] = [
  { id: 'r_ammonite', name: 'Ammonite Fossil', icon: i32(22), value: 0, kind: 'relic', biome: 0, bonus: '+10% Mining XP', desc: 'A spiral sea creature, a mile under the hills.' },
  { id: 'r_coin', name: 'Prospector\'s Coin', icon: i32(23), value: 0, kind: 'relic', biome: 0, bonus: '+5% sell prices', desc: 'The first coin ever minted in Deepwick.' },
  { id: 'r_compass', name: 'Brass Compass', icon: i32(24), value: 0, kind: 'relic', biome: 0, bonus: 'Chests show on the map', desc: 'Its needle points at treasure, not north.' },
  { id: 'r_rootheart', name: 'Rootheart', icon: i32(25), value: 0, kind: 'relic', biome: 1, bonus: '+15 max health', desc: 'Petrified roots that still beat, slowly.' },
  { id: 'r_scarab', name: 'Jade Scarab', icon: i32(26), value: 0, kind: 'relic', biome: 1, bonus: '+4% double ore chance', desc: 'A charm of the old grotto folk.' },
  { id: 'r_glowcap', name: 'Glowcap Lantern', icon: i32(27), value: 0, kind: 'relic', biome: 1, bonus: '+1 light radius', desc: 'A lantern grown, not made.' },
  { id: 'r_skull', name: 'Crystal Skull', icon: i32(28), value: 0, kind: 'relic', biome: 2, bonus: '+10% damage', desc: 'It watches you from the shelf.' },
  { id: 'r_geode', name: 'Geode Egg', icon: i32(29), value: 0, kind: 'relic', biome: 2, bonus: '+25% lantern oil', desc: 'Something inside it is still growing.' },
  { id: 'r_prism', name: 'Singing Prism', icon: i32(30), value: 0, kind: 'relic', biome: 2, bonus: '+8% mining speed', desc: 'Sings a different note for every rock.' },
  { id: 'r_idol', name: 'Ember Idol', icon: i32(31), value: 0, kind: 'relic', biome: 3, bonus: '+15% Combat XP', desc: 'Carved by something with too many fingers.' },
  { id: 'r_tooth', name: 'Salamander Tooth', icon: i32(32), value: 0, kind: 'relic', biome: 3, bonus: 'Halves heat and lava damage', desc: 'From a lizard the size of a barn.' },
  { id: 'r_crown', name: 'Molten Crown', icon: i32(33), value: 0, kind: 'relic', biome: 3, bonus: '+10% sell prices', desc: 'It never quite cools.' },
  { id: 'r_starmap', name: 'Star Map Tablet', icon: i32(34), value: 0, kind: 'relic', biome: 4, bonus: 'Relic stones show on the map', desc: 'A map of a sky nobody down here has seen.' },
  { id: 'r_mirror', name: 'Void Mirror', icon: i32(35), value: 0, kind: 'relic', biome: 4, bonus: '+1 tile reach', desc: 'Your reflection is a little late.' },
  { id: 'r_heart', name: 'Heart of Deepwick', icon: i32(36), value: 0, kind: 'relic', biome: 5, bonus: '+25% all XP', desc: 'The light that the Gloamheart swallowed.', glow: '#ffd75a' },
];

export const ITEMS: Record<string, ItemDef> = {};
for (const it of LIST) ITEMS[it.id] = it;
for (const r of RELICS) ITEMS[r.id] = r;

export const CONSUMABLES = ['torch', 'ladder', 'bomb', 'oil', 'tonic', 'recall'] as const;
export type ConsumableId = (typeof CONSUMABLES)[number];

export const SHOP_PRICES: Record<ConsumableId, number> = {
  torch: 4,
  ladder: 3,
  bomb: 35,
  oil: 22,
  tonic: 30,
  recall: 50,
};
export const STACK_MAX: Record<ConsumableId, number> = {
  torch: 99,
  ladder: 99,
  bomb: 20,
  oil: 10,
  tonic: 10,
  recall: 5,
};

/** Icons used by the UI that are not items. */
export const UI_ICON = {
  coin: i16(27),
  heart: i16(28),
  oil: i16(29),
  pack: i16(30),
  skull: i16(31),
  star: i16(32),
  chest: i16(33),
  relic: i16(34),
  scroll: i16(58),
  hourglass: i16(59),
  compass: i16(60),
  anvil: i16(61),
  pick: i16(62),
  map: i16(63),
  heartCrystal: i16(57),
  lantern: i16(56),
  rope: i16(55),
};
