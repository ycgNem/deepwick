import { B } from './blocks';
import { Obj } from '../world/world';

/** i16/i32 = original icon sheets, n32 = survival icon sheet, blk = a block's own texture, cv = drawn at load */
export type IconRef = { sheet: 'i16' | 'i32' | 'n32' | 'f32' | 'blk' | 'cv'; idx: number };

export type ItemKind =
  | 'block'
  | 'wall'
  | 'place'
  | 'pick'
  | 'hammer'
  | 'sword'
  | 'bow'
  | 'ammo'
  | 'food'
  | 'use'
  | 'armor'
  | 'lantern'
  | 'boots'
  | 'charm'
  | 'material'
  | 'rod'
  | 'relic';

export type EquipSlot = 'armor' | 'lantern' | 'boots' | 'charm';

export interface CharmFx {
  speed?: number;
  mine?: number;
  hp?: number;
  light?: number;
  reduce?: number;
  heat?: boolean;
  lens?: boolean;
  /** sheds the rain */
  dry?: boolean;
}

export interface ItemDef {
  id: string;
  name: string;
  icon: IconRef;
  kind: ItemKind;
  value: number;
  desc: string;
  stack: number;
  glow?: string;
  block?: B;
  wall?: B;
  obj?: Obj;
  tier?: number;
  power?: number;
  dmg?: number;
  /** seconds between shots / swings */
  cd?: number;
  food?: number;
  heal?: number;
  hp?: number;
  reduce?: number;
  radius?: number;
  oil?: number;
  speed?: number;
  jumps?: number;
  fallSafe?: number;
  fx?: CharmFx;
  /** fishing rods: how much quicker the bites, how wide the catch zone, how good the odds */
  rod?: number;
}

const i16 = (idx: number): IconRef => ({ sheet: 'i16', idx });
const i32 = (idx: number): IconRef => ({ sheet: 'i32', idx });
const n32 = (idx: number): IconRef => ({ sheet: 'n32', idx });
/** fishing icons (tools/gen_fish.py) */
const f32 = (idx: number): IconRef => ({ sheet: 'f32', idx });
const blk = (b: B): IconRef => ({ sheet: 'blk', idx: b });
/** icons drawn at load time: 0 rail, 1 minecart, 2 mine lamp, 3 wickpost */
const cv = (idx: number): IconRef => ({ sheet: 'cv', idx });

type Partial2 = Omit<ItemDef, 'id' | 'stack'> & { stack?: number };
const LIST: Record<string, Partial2> = {
  // ---- blocks
  dirt: { name: 'Dirt', icon: blk(B.DIRT), kind: 'block', block: B.DIRT, value: 0, desc: 'Soft earth. Good for a first shelter.' },
  clay: { name: 'Clay', icon: blk(B.CLAY), kind: 'block', block: B.CLAY, value: 0, desc: 'Dense red earth.' },
  stone: { name: 'Stone', icon: blk(B.STONE), kind: 'block', block: B.STONE, value: 0, desc: 'Plain grey stone. Needs a pickaxe to dig.' },
  gravel: { name: 'Gravel', icon: blk(B.GRAVEL), kind: 'block', block: B.GRAVEL, value: 0, desc: 'Loose crushed rock.' },
  wood: { name: 'Wood', icon: n32(0), kind: 'block', block: B.PLANKS, value: 0, desc: 'Chopped from trees. Builds planks, tools and almost everything else.' },
  stonebrick: { name: 'Stone Brick', icon: n32(30), kind: 'block', block: B.STONE_BRICK, value: 0, desc: 'Neatly cut stone for sturdy walls.' },
  mossstone: { name: 'Mossy Stone', icon: blk(B.MOSS_STONE), kind: 'block', block: B.MOSS_STONE, value: 0, desc: 'Stone from the grotto, still damp.' },
  grottorock: { name: 'Grotto Rock', icon: blk(B.GROTTO_ROCK), kind: 'block', block: B.GROTTO_ROCK, value: 0, desc: 'Cold teal rock.' },
  crystalrock: { name: 'Crystal Rock', icon: blk(B.CRYSTAL_ROCK), kind: 'block', block: B.CRYSTAL_ROCK, value: 0, desc: 'Pale rock that catches the light.' },
  geodestone: { name: 'Geode Stone', icon: blk(B.GEODE), kind: 'block', block: B.GEODE, value: 0, desc: 'Purple stone full of tiny crystals.' },
  basalt: { name: 'Basalt', icon: blk(B.BASALT), kind: 'block', block: B.BASALT, value: 0, desc: 'Cooled lava rock.' },
  magmarock: { name: 'Magma Rock', icon: blk(B.MAGMA_ROCK), kind: 'block', block: B.MAGMA_ROCK, value: 1, desc: 'Still glowing inside.' },
  obsidian: { name: 'Obsidian', icon: blk(B.OBSIDIAN), kind: 'block', block: B.OBSIDIAN, value: 2, desc: 'Glassy black stone.' },
  abyssstone: { name: 'Abyss Stone', icon: blk(B.ABYSS_STONE), kind: 'block', block: B.ABYSS_STONE, value: 1, desc: 'Rock from the Sunless Vault.' },
  ruinbrick: { name: 'Ruin Brick', icon: blk(B.RUIN_BRICK), kind: 'block', block: B.RUIN_BRICK, value: 2, desc: 'Masonry from halls built by no one living.' },
  // ---- walls
  woodwall: { name: 'Wood Wall', icon: n32(29), kind: 'wall', wall: B.PLANKS, value: 0, desc: 'A background wall. Place it behind you to make a room.' },
  stonewall: { name: 'Stone Wall', icon: n32(31), kind: 'wall', wall: B.STONE_BRICK, value: 0, desc: 'A sturdy background wall.' },

  // ---- ores, gems, bars
  coal: { name: 'Coal', icon: i16(0), kind: 'material', value: 2, desc: 'Fuel for torches and furnaces.' },
  copper: { name: 'Copper Ore', icon: i16(1), kind: 'material', value: 3, desc: 'Smelt it into bars at a furnace.' },
  iron: { name: 'Iron Ore', icon: i16(2), kind: 'material', value: 8, desc: 'Smelt with coal for iron bars.' },
  coldlamp: { name: 'Cold Lamp', icon: { sheet: 'f32', idx: 16 }, kind: 'material', value: 25, desc: 'The dead head-lamp of a miner who went down and never came back, left behind when a Lampless was laid to rest. The glass is cracked and the wick is ash. Bring it home: the Wick lights it again.', stack: 99 },
  pearl: { name: 'Cave Pearl', icon: { sheet: 'f32', idx: 15 }, kind: 'material', value: 30, desc: 'Grows layer on layer in still water sealed in the rock, and holds a soft light. It washes out when you break into the pocket. The Wick takes it gladly.', glow: '#cfe8ff', stack: 99 },
  jade: { name: 'Jade', icon: i16(3), kind: 'material', value: 18, desc: 'Grows in the damp of the grotto.', glow: '#5af08a' },
  silver: { name: 'Silver Ore', icon: i16(4), kind: 'material', value: 20, desc: 'Rings like a bell when struck.' },
  amethyst: { name: 'Amethyst', icon: i16(5), kind: 'material', value: 38, desc: 'Hums faintly in the dark.', glow: '#c27aff' },
  gold: { name: 'Gold Ore', icon: i16(6), kind: 'material', value: 45, desc: 'Warm to the touch, even this deep.', glow: '#ffd75a' },
  ruby: { name: 'Ruby', icon: i16(7), kind: 'material', value: 85, desc: 'Formed where the magma sleeps.', glow: '#ff4a5a' },
  voidsteel: { name: 'Voidsteel Ore', icon: i16(8), kind: 'material', value: 100, desc: 'Drinks the light around it.', glow: '#7a6aff' },
  lumenite: { name: 'Lumenite', icon: i16(9), kind: 'material', value: 190, desc: 'A shard of trapped starlight.', glow: '#bff8ff' },
  diamond: { name: 'Diamond', icon: i16(10), kind: 'material', value: 320, desc: 'The rarest thing in the mountain.', glow: '#e8faff' },
  copperbar: { name: 'Copper Bar', icon: n32(10), kind: 'material', value: 9, desc: 'For copper tools, lanterns and an anvil.' },
  ironbar: { name: 'Iron Bar', icon: n32(11), kind: 'material', value: 24, desc: 'For iron tools and armor.' },
  silverbar: { name: 'Silver Bar', icon: n32(12), kind: 'material', value: 60, desc: 'For silver tools.' },
  goldbar: { name: 'Gold Bar', icon: n32(13), kind: 'material', value: 130, desc: 'For goldforged tools.' },
  voidbar: { name: 'Voidsteel Bar', icon: n32(14), kind: 'material', value: 300, desc: 'The strongest metal in Deepwick.', glow: '#7a6aff' },

  // ---- creature drops
  batwing: { name: 'Bat Wing', icon: i16(11), kind: 'material', value: 3, desc: 'Leathery. Smells of guano.' },
  gel: { name: 'Mud Gel', icon: i16(12), kind: 'material', value: 2, desc: 'Sticky and flammable. Makes torches and lamp oil.' },
  shell: { name: 'Mossback Shell', icon: i16(13), kind: 'material', value: 9, desc: 'Light and tough as boot leather.' },
  silk: { name: 'Crystal Silk', icon: i16(15), kind: 'material', value: 16, desc: 'Spun by shardspinners. Stronger than rope.' },
  essence: { name: 'Wisp Essence', icon: i16(16), kind: 'material', value: 22, desc: "A wisp's last flicker, bottled.", glow: '#9ad8ff' },
  horn: { name: 'Imp Horn', icon: i16(17), kind: 'material', value: 30, desc: 'Still warm.' },
  magmacore: { name: 'Magma Core', icon: i16(18), kind: 'material', value: 40, desc: 'The molten heart of a cinder roller.', glow: '#ff8a2a' },
  ecto: { name: 'Gloam Ectoplasm', icon: i16(19), kind: 'material', value: 55, desc: 'Darkness, thickened.', glow: '#a05aff' },
  gear: { name: 'Sentinel Gear', icon: i16(20), kind: 'material', value: 70, desc: 'Bronze, older than the town.' },
  hide: { name: 'Animal Hide', icon: n32(28), kind: 'material', value: 3, desc: 'From rabbits and boars. Beds, bows and leather.' },
  gloammote: { name: 'Gloam Mote', icon: cv(4), kind: 'material', value: 4, desc: 'A scrap of living dark, still twitching. The Wick burns it clean.', glow: '#b48aff' },
  ash: { name: 'Hollow Ash', icon: n32(44), kind: 'material', value: 6, desc: 'What is left of a Hollow at dawn.' },
  wheat: { name: 'Wheat', icon: n32(51), kind: 'material', value: 1, desc: 'Bake three into bread.' },

  // ---- tools and weapons
  woodpick: { name: 'Wooden Pickaxe', icon: n32(1), kind: 'pick', tier: 1, power: 0.8, value: 4, desc: 'Breaks stone, coal and copper. Barely.' },
  stonepick: { name: 'Stone Pickaxe', icon: n32(2), kind: 'pick', tier: 1, power: 1.25, value: 8, desc: 'A real tool. Breaks stone, coal and copper.' },
  copperpick: { name: 'Copper Pickaxe', icon: i32(1), kind: 'pick', tier: 2, power: 1.7, value: 40, desc: 'Bites through Mossroot Grotto rock and iron.' },
  ironpick: { name: 'Iron Pickaxe', icon: i32(2), kind: 'pick', tier: 3, power: 2.8, value: 120, desc: 'Cracks the Crystal Hollows: silver and amethyst.' },
  silverpick: { name: 'Silver Pickaxe', icon: i32(3), kind: 'pick', tier: 4, power: 4.4, value: 400, desc: 'Cuts Ember Depths basalt, gold, rubies and diamond.' },
  goldpick: { name: 'Goldforged Pickaxe', icon: i32(4), kind: 'pick', tier: 5, power: 6.8, value: 1200, desc: 'Breaks Sunless Vault stone, obsidian and voidsteel.' },
  voidpick: { name: 'Voidsteel Pickaxe', icon: i32(5), kind: 'pick', tier: 6, power: 10.5, value: 3500, desc: 'The only tool that can open the Heart Chamber.' },
  hammer: { name: 'Stone Hammer', icon: n32(47), kind: 'hammer', value: 6, desc: 'Knocks down background walls. Opens caves to the sky.' },
  woodsword: { name: 'Wooden Sword', icon: n32(3), kind: 'sword', dmg: 5, cd: 0.34, value: 3, desc: 'Better than fists.' },
  stonesword: { name: 'Stone Sword', icon: n32(4), kind: 'sword', dmg: 7, cd: 0.34, value: 6, desc: 'Heavy and blunt.' },
  coppersword: { name: 'Copper Sword', icon: n32(5), kind: 'sword', dmg: 11, cd: 0.32, value: 40, desc: 'A proper blade.' },
  ironsword: { name: 'Iron Sword', icon: n32(6), kind: 'sword', dmg: 17, cd: 0.3, value: 120, desc: 'Reliable steel.' },
  silversword: { name: 'Silver Sword', icon: n32(7), kind: 'sword', dmg: 26, cd: 0.28, value: 400, desc: 'Wraiths fear it.' },
  goldsword: { name: 'Goldforged Sword', icon: n32(8), kind: 'sword', dmg: 40, cd: 0.27, value: 1200, desc: 'Heavy, bright and very sharp.' },
  voidsword: { name: 'Voidsteel Blade', icon: n32(9), kind: 'sword', dmg: 60, cd: 0.25, value: 3500, desc: 'It hums a note only the dark can hear.', glow: '#7a6aff' },
  woodbow: { name: 'Wooden Bow', icon: n32(40), kind: 'bow', dmg: 7, cd: 0.6, value: 10, desc: 'Fires arrows at the cursor.' },
  crystalbow: { name: 'Crystal Bow', icon: n32(42), kind: 'bow', dmg: 22, cd: 0.38, value: 600, desc: 'Arrows fly fast and true.', glow: '#c27aff' },
  arrows: { name: 'Arrows', icon: n32(41), kind: 'ammo', dmg: 4, value: 1, desc: 'Ammunition for bows.', stack: 250 },

  // ---- food
  berries: { name: 'Wild Berries', icon: n32(21), kind: 'food', food: 8, heal: 2, value: 1, desc: 'Sweet and sharp. Picked from berry bushes.' },
  mushroom: { name: 'Cave Mushroom', icon: i16(43), kind: 'food', food: 6, heal: 0, value: 1, desc: 'Edible. Mostly.' },
  sporecap: { name: 'Glowcap', icon: i16(14), kind: 'food', food: 7, heal: 3, value: 5, desc: 'A mushroom that never stops glowing. Edible, oddly minty.', glow: '#4af0d0' },
  rawmeat: { name: 'Raw Meat', icon: n32(24), kind: 'food', food: 10, heal: 0, value: 2, desc: 'Cook it on a campfire or furnace.' },
  steak: { name: 'Cooked Meat', icon: n32(25), kind: 'food', food: 32, heal: 10, value: 6, desc: 'Hot, filling and smells wonderful.' },
  roastshroom: { name: 'Roasted Mushrooms', icon: n32(27), kind: 'food', food: 20, heal: 4, value: 4, desc: 'Smoky and chewy.' },
  stew: { name: 'Mushroom Stew', icon: n32(26), kind: 'food', food: 42, heal: 8, value: 10, desc: 'A whole meal in a bowl.' },
  perch: { name: 'Meadow Perch', icon: f32(0), kind: 'food', food: 6, heal: 0, value: 5, desc: 'A pond fish. Cook it on a campfire or furnace.' },
  trout: { name: 'Speckled Trout', icon: f32(1), kind: 'food', food: 7, heal: 0, value: 12, desc: 'Quick and speckled. Lovely grilled.' },
  minnow: { name: 'Cave Minnow', icon: f32(3), kind: 'food', food: 4, heal: 0, value: 3, desc: 'A pale little fish from the underground pools.' },
  glowfin: { name: 'Glowfin', icon: f32(4), kind: 'food', food: 8, heal: 4, value: 24, desc: 'Its fins never stop glowing. Lives in the grotto pools.', glow: '#4af0d0' },
  goldcarp: { name: 'Golden Carp', icon: f32(2), kind: 'material', value: 70, desc: 'A rare gleam in the meadow ponds. Pell pays well for one.', glow: '#ffd75a' },
  crystalcarp: { name: 'Crystal Carp', icon: f32(5), kind: 'material', value: 110, desc: 'Scales like cut amethyst. Only the Crystal Hollows pools have them.', glow: '#c27aff' },
  voidangler: { name: 'Void Angler', icon: f32(6), kind: 'material', value: 320, desc: 'Hunts by its own little lamp in the pools of the Sunless Vault.', glow: '#ffe08a' },
  oldboot: { name: 'Old Boot', icon: f32(7), kind: 'material', value: 1, desc: "Somebody's lost boot. Still soggy." },
  grilledfish: { name: 'Grilled Fish', icon: f32(8), kind: 'food', food: 30, heal: 12, value: 10, desc: 'Flaky, smoky and filling.' },
  bread: { name: 'Bread', icon: n32(50), kind: 'food', food: 30, heal: 6, value: 5, desc: 'Baked from wheat.' },

  // ---- usable
  tonic: { name: 'Red Tonic', icon: i16(25), kind: 'use', value: 12, desc: 'Restores half your health.', stack: 20 },
  steadydraught: { name: 'Steady Draught', icon: { sheet: 'f32', idx: 10 }, kind: 'use', value: 10, desc: 'Hesper\u2019s calming brew. Restores 60 nerve at once.', stack: 10 },
  nightglass: { name: 'Nightglass Tonic', icon: { sheet: 'f32', idx: 11 }, kind: 'use', value: 16, desc: 'For three minutes you see further in the dark, and it frays you half as fast.', stack: 10 },
  gloamward: { name: 'Gloamward Salve', icon: { sheet: 'f32', idx: 12 }, kind: 'use', value: 20, desc: 'For three minutes Gloamlings will not hunt you or rise near you, and the tide-born pass you by.', stack: 10 },
  oil: { name: 'Lamp Oil', icon: i16(24), kind: 'use', value: 8, desc: 'Refills 60% of your lantern.', stack: 20 },
  recall: { name: 'Recall Charm', icon: i16(26), kind: 'use', value: 15, desc: 'Returns you to your bed after a short channel.', stack: 10 },
  bomb: { name: 'Blast Charge', icon: i16(23), kind: 'use', value: 10, desc: 'Thrown toward the cursor. Breaks rock up to one tier above your pick.', stack: 30 },
  fishingrod: { name: 'Fishing Rod', icon: n32(46), kind: 'rod', rod: 1, value: 10, stack: 1, desc: 'Click on water to cast. When the bobber dips, click to hook the fish, then click as the needle crosses the green.' },
  brassrod: { name: 'Brass Rod', icon: f32(9), kind: 'rod', rod: 1.5, value: 90, stack: 1, desc: 'Quicker bites, a wider catch zone and better odds of something rare.' },
  canary: { name: 'Canary', icon: { sheet: 'f32', idx: 13 }, kind: 'use', value: 30, stack: 1, desc: 'A songbird in a brass cage. Anywhere in your pack, it smells firedamp before you can see it, even through rock: it sings in clean air, chirps when gas is near and panics when it is close. Click while holding it to listen.' },
  grapple: { name: 'Grappling Hook', icon: n32(48), kind: 'use', value: 40, stack: 1, desc: 'Press G, or click while holding it, to throw it at the cursor. It bites into rock and hauls you up. W and S climb the rope, Space jumps off.' },
  heartcrystal: { name: 'Heart Crystal', icon: n32(43), kind: 'use', value: 50, desc: 'Use it to raise your max health by 10 (up to +100).', glow: '#ff6a9a', stack: 10 },

  // ---- placeables
  torch: { name: 'Torch', icon: i16(21), kind: 'place', obj: Obj.TORCH, value: 1, desc: 'Lights the dark. Holding one lights your way. Creatures will not spawn in its glow.', stack: 250 },
  prop: { name: 'Timber Prop', icon: { sheet: 'f32', idx: 14 }, kind: 'place', obj: Obj.BEAM, value: 2, desc: 'A pit prop and its cap board. Stand it on a floor under loose rock and it holds the roof up for two tiles either side. The old mine frames are props too: pull one down and whatever it held comes with it.', stack: 99 },
  ladder: { name: 'Ladder', icon: i16(22), kind: 'place', obj: Obj.LADDER, value: 1, desc: 'Climb with W / S.', stack: 250 },
  rail: { name: 'Rail', icon: cv(0), kind: 'place', value: 1, desc: 'Lay track along a floor. Minecarts ride it.', stack: 250 },
  minecart: { name: 'Minecart', icon: cv(1), kind: 'place', obj: Obj.MINECART, value: 14, desc: 'Set it on a rail, then press E to climb in. A / D to roll, Space to jump out.', stack: 5 },
  lamp: { name: 'Mine Lamp', icon: cv(2), kind: 'place', obj: Obj.LAMP, value: 3, desc: 'An oil lamp that hangs from a ceiling and lights a wide area.', stack: 50 },
  workbench: { name: 'Workbench', icon: n32(15), kind: 'place', obj: Obj.WORKBENCH, value: 4, desc: 'Craft tools, furniture and building parts nearby.', stack: 10 },
  furnace: { name: 'Furnace', icon: n32(16), kind: 'place', obj: Obj.FURNACE, value: 8, desc: 'Smelts ore into bars and cooks food.', stack: 10 },
  anvil: { name: 'Anvil', icon: i32(51), kind: 'place', obj: Obj.ANVIL, value: 30, desc: 'Forge metal tools, weapons, armor and lanterns.', stack: 10 },
  alchemy: { name: 'Alchemy Table', icon: n32(18), kind: 'place', obj: Obj.ALCHEMY, value: 20, desc: 'Brew tonics, lamp oil, bombs and charms.', stack: 10 },
  campfire: { name: 'Campfire', icon: i32(50), kind: 'place', obj: Obj.CAMPFIRE, value: 3, desc: 'Cook food, keep warm. Heals you slowly while you rest beside it.', stack: 10 },
  chest: { name: 'Storage Chest', icon: i32(46), kind: 'place', obj: Obj.STORAGE, value: 4, desc: 'Holds 20 stacks. Right-click to open.', stack: 10 },
  bed: { name: 'Bed', icon: n32(17), kind: 'place', obj: Obj.BED, value: 8, desc: 'Sets your spawn point. Sleep through the night.', stack: 5 },
  door: { name: 'Wooden Door', icon: n32(19), kind: 'place', obj: Obj.DOOR, value: 3, desc: 'Keeps Hollows out at night. Right-click to open or close.', stack: 20 },
  sapling: { name: 'Sapling', icon: n32(20), kind: 'place', obj: Obj.SAPLING, value: 1, desc: 'Plant on grass or dirt. Grows into a tree.' },
  seeds: { name: 'Wheat Seeds', icon: n32(52), kind: 'place', obj: Obj.CROP0, value: 1, desc: 'Plant on dirt or grass. Grows into wheat.' },

  wickpost: { name: 'Wickpost', icon: cv(3), kind: 'place', obj: Obj.WICKPOST, value: 6, desc: 'A little lantern on a post, lit from the Wick. Nothing spawns in its glow, and from any Wickpost you can travel home to the Wick and back down to the others.', stack: 20 },

  // ---- equipment
  leathercoat: { name: 'Leather Coat', icon: i32(17), kind: 'armor', hp: 15, reduce: 0.06, value: 20, desc: '+15 health, 6% less damage.' },
  ironarmor: { name: 'Iron Harness', icon: n32(56), kind: 'armor', hp: 35, reduce: 0.15, value: 200, desc: '+35 health, 15% less damage.' },
  crystalmail: { name: 'Crystal Mail', icon: i32(19), kind: 'armor', hp: 70, reduce: 0.25, value: 900, desc: '+70 health, 25% less damage.' },
  gloamplate: { name: 'Gloamward Plate', icon: i32(18), kind: 'armor', hp: 110, reduce: 0.35, value: 3000, desc: '+110 health, 35% less damage.' },
  copperlantern: { name: 'Copper Lantern', icon: i32(6), kind: 'lantern', radius: 5.2, oil: 160, value: 30, desc: 'A steady light that burns lamp oil underground.' },
  ironlantern: { name: 'Brass Lantern', icon: i32(7), kind: 'lantern', radius: 6.2, oil: 230, value: 120, desc: 'Brighter flame, deeper tank.' },
  silverlantern: { name: 'Silver Lantern', icon: i32(8), kind: 'lantern', radius: 7.3, oil: 320, value: 400, desc: 'Cold blue light that carries far.' },
  rubylantern: { name: 'Ruby Lantern', icon: i32(9), kind: 'lantern', radius: 8.5, oil: 430, value: 1100, desc: 'Burns warm through the deepest dark.' },
  crystallantern: { name: 'Crystal Lantern', icon: i32(10), kind: 'lantern', radius: 10, oil: 580, value: 2800, desc: 'Captured starlight. Barely needs oil.' },
  springboots: { name: 'Spring Boots', icon: i32(15), kind: 'boots', speed: 1.08, jumps: 2, fallSafe: 11, value: 150, desc: 'Double jump. Safe falls up to 11 tiles.' },
  wingboots: { name: 'Gilded Wingboots', icon: i32(16), kind: 'boots', speed: 1.2, jumps: 3, fallSafe: 999, value: 1500, desc: 'Triple jump, faster stride, no fall damage.' },
  rabbitfoot: { name: "Rabbit's Foot", icon: n32(36), kind: 'charm', fx: { speed: 0.1 }, value: 25, desc: 'Charm: +10% move speed.' },
  coppershield: { name: 'Copper Buckler', icon: n32(57), kind: 'charm', fx: { reduce: 0.08 }, value: 40, desc: 'Charm: 8% less damage.' },
  jadering: { name: "Miner's Ring", icon: n32(37), kind: 'charm', fx: { mine: 0.18 }, value: 120, desc: 'Charm: +18% mining speed.' },
  locket: { name: 'Heart Locket', icon: n32(38), kind: 'charm', fx: { hp: 25 }, value: 400, desc: 'Charm: +25 max health.' },
  amulet: { name: 'Starlight Amulet', icon: n32(39), kind: 'charm', fx: { light: 2 }, value: 900, desc: 'Charm: +2 light radius, even without a lantern.', glow: '#bff8ff' },
  emberward: { name: 'Emberward Talisman', icon: i32(20), kind: 'charm', fx: { heat: true }, value: 900, desc: 'Charm: protects you from the heat of the Ember Depths.' },
  oilskin: { name: "Oilskin Sou'wester", icon: { sheet: 'f32', idx: 17 }, kind: 'charm', fx: { dry: true }, value: 30, desc: 'Charm: a fisherman\'s hat of waxed, tarred cloth with a long brim down the back. Rain soaks you four times slower, and you dry out twice as fast.' },
  sunlens: { name: 'Sunglass Lens', icon: i32(21), kind: 'charm', fx: { lens: true }, value: 1600, desc: 'Charm: stops the Sunless Vault from swallowing your light.' },
};

export interface RelicDef extends ItemDef {
  biome: number;
  bonus: string;
}

const RELIC_LIST: Omit<RelicDef, 'kind' | 'value' | 'stack'>[] = [
  { id: 'r_ammonite', name: 'Ammonite Fossil', icon: i32(22), biome: 0, bonus: '+10% Mining XP', desc: 'A spiral sea creature, a mile under the hills.' },
  { id: 'r_coin', name: "Prospector's Coin", icon: i32(23), biome: 0, bonus: '+5% sell prices', desc: 'The first coin ever minted in Deepwick.' },
  { id: 'r_compass', name: 'Brass Compass', icon: i32(24), biome: 0, bonus: 'Chests show on the map', desc: 'Its needle points at treasure, not north.' },
  { id: 'r_rootheart', name: 'Rootheart', icon: i32(25), biome: 1, bonus: '+15 max health', desc: 'Petrified roots that still beat, slowly.' },
  { id: 'r_scarab', name: 'Jade Scarab', icon: i32(26), biome: 1, bonus: '+4% double ore chance', desc: 'A charm of the old grotto folk.' },
  { id: 'r_glowcap', name: 'Glowcap Lantern', icon: i32(27), biome: 1, bonus: '+1 light radius', desc: 'A lantern grown, not made.' },
  { id: 'r_skull', name: 'Crystal Skull', icon: i32(28), biome: 2, bonus: '+10% damage', desc: 'It watches you from the shelf.' },
  { id: 'r_geode', name: 'Geode Egg', icon: i32(29), biome: 2, bonus: '+25% lantern oil', desc: 'Something inside it is still growing.' },
  { id: 'r_prism', name: 'Singing Prism', icon: i32(30), biome: 2, bonus: '+8% mining speed', desc: 'Sings a different note for every rock.' },
  { id: 'r_idol', name: 'Ember Idol', icon: i32(31), biome: 3, bonus: '+15% Combat XP', desc: 'Carved by something with too many fingers.' },
  { id: 'r_tooth', name: 'Salamander Tooth', icon: i32(32), biome: 3, bonus: 'Halves heat and lava damage', desc: 'From a lizard the size of a barn.' },
  { id: 'r_crown', name: 'Molten Crown', icon: i32(33), biome: 3, bonus: '+10% sell prices', desc: 'It never quite cools.' },
  { id: 'r_starmap', name: 'Star Map Tablet', icon: i32(34), biome: 4, bonus: 'Relic stones show on the map', desc: 'A map of a sky nobody down here has seen.' },
  { id: 'r_mirror', name: 'Void Mirror', icon: i32(35), biome: 4, bonus: '+1 tile reach', desc: 'Your reflection is a little late.' },
  { id: 'r_heart', name: 'Heart of Deepwick', icon: i32(36), biome: 5, bonus: '+25% all XP', desc: 'The light that the Gloamheart swallowed.', glow: '#ffd75a' },
];

export const RELICS: RelicDef[] = RELIC_LIST.map((r) => ({ ...r, kind: 'relic', value: 0, stack: 1 }));

const ONE: ItemKind[] = ['pick', 'hammer', 'sword', 'bow', 'armor', 'lantern', 'boots', 'charm', 'relic'];

export const ITEMS: Record<string, ItemDef> = {};
for (const [id, d] of Object.entries(LIST)) {
  ITEMS[id] = { ...d, id, stack: d.stack ?? (ONE.includes(d.kind) ? 1 : d.kind === 'block' || d.kind === 'wall' ? 250 : 99) };
}
for (const r of RELICS) ITEMS[r.id] = r;

export function equipSlotOf(def: ItemDef): EquipSlot | null {
  if (def.kind === 'armor' || def.kind === 'lantern' || def.kind === 'boots' || def.kind === 'charm') return def.kind;
  return null;
}

/** what Pell will pay attention to */
export function sellable(def: ItemDef): boolean {
  return def.value > 0 && def.kind !== 'relic' && def.kind !== 'ammo';
}

export const SHOP_STOCK: { id: string; price: number; n: number }[] = [
  { id: 'torch', price: 3, n: 10 },
  { id: 'arrows', price: 1, n: 20 },
  { id: 'oil', price: 20, n: 1 },
  { id: 'tonic', price: 28, n: 1 },
  { id: 'prop', price: 5, n: 2 },
  { id: 'bomb', price: 30, n: 1 },
  { id: 'canary', price: 60, n: 1 },
  { id: 'oilskin', price: 45, n: 1 },
  { id: 'recall', price: 45, n: 1 },
  { id: 'seeds', price: 4, n: 3 },
  { id: 'fishingrod', price: 30, n: 1 },
  { id: 'steak', price: 14, n: 1 },
  { id: 'copperlantern', price: 220, n: 1 },
  { id: 'heartcrystal', price: 900, n: 1 },
];

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
  food: n32(25),
};
