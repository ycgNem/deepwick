import { Obj } from '../world/world';

export type Station = 'hand' | 'workbench' | 'furnace' | 'anvil' | 'alchemy' | 'fire';

export const STATION_NAME: Record<Station, string> = {
  hand: 'By hand',
  workbench: 'Workbench',
  furnace: 'Furnace',
  anvil: 'Anvil',
  alchemy: 'Alchemy Table',
  fire: 'A fire',
};

/** which placed objects count as which station */
export const STATION_OBJS: Record<Station, Obj[]> = {
  hand: [],
  workbench: [Obj.WORKBENCH],
  furnace: [Obj.FURNACE],
  anvil: [Obj.ANVIL],
  alchemy: [Obj.ALCHEMY],
  fire: [Obj.CAMPFIRE, Obj.FURNACE, Obj.HEARTH, Obj.STOVE],
};

export interface Recipe {
  out: string;
  n: number;
  need: Record<string, number>;
  at: Station;
  /** the Wick's flame level this recipe needs (Wickposts are lit from it) */
  flame?: number;
}

const r = (out: string, n: number, at: Station, need: Record<string, number>, flame?: number): Recipe => ({ out, n, at, need, flame });

export const RECIPES: Recipe[] = [
  // by hand
  r('workbench', 1, 'hand', { wood: 10 }),
  r('torch', 3, 'hand', { wood: 1, gel: 1 }),
  r('torch', 4, 'hand', { wood: 1, coal: 1 }),
  r('campfire', 1, 'hand', { wood: 6, stone: 4 }),
  r('prop', 2, 'hand', { wood: 3 }),

  // workbench
  r('woodpick', 1, 'workbench', { wood: 8 }),
  r('woodsword', 1, 'workbench', { wood: 7 }),
  r('stonepick', 1, 'workbench', { wood: 4, stone: 10 }),
  r('stonesword', 1, 'workbench', { wood: 3, stone: 8 }),
  r('hammer', 1, 'workbench', { wood: 3, stone: 6 }),
  r('ladder', 4, 'workbench', { wood: 3 }),
  r('woodwall', 4, 'workbench', { wood: 1 }),
  r('stonebrick', 1, 'workbench', { stone: 2 }),
  r('stonewall', 4, 'workbench', { stone: 1 }),
  r('door', 1, 'workbench', { wood: 6 }),
  r('chest', 1, 'workbench', { wood: 10 }),
  r('bed', 1, 'workbench', { wood: 14, hide: 3 }),
  // furniture for a home
  r('hearth', 1, 'workbench', { stone: 20, clay: 6, coal: 2 }),
  r('chair', 1, 'workbench', { wood: 5 }),
  r('stool', 1, 'workbench', { wood: 3 }),
  r('rocker', 1, 'workbench', { wood: 8, hide: 2 }),
  r('table', 1, 'workbench', { wood: 8 }),
  r('desk', 1, 'workbench', { wood: 10, hide: 1 }),
  r('bookshelf', 1, 'workbench', { wood: 12, hide: 2 }),
  r('cupboard', 1, 'workbench', { wood: 10, clay: 2 }),
  r('dresser', 1, 'workbench', { wood: 12 }),
  r('geranium', 1, 'workbench', { clay: 4, seeds: 1 }),
  r('fern', 1, 'workbench', { clay: 4, mossstone: 2 }),
  r('herbs', 1, 'workbench', { wood: 1, berries: 3 }),
  r('rug', 1, 'workbench', { hide: 4 }),
  r('dogbed', 1, 'workbench', { wood: 4, hide: 2 }),
  r('painting', 1, 'workbench', { wood: 4, hide: 1, berries: 2 }),
  r('banner', 1, 'workbench', { hide: 3, copperbar: 1 }),
  r('antlers', 1, 'workbench', { wood: 3, hide: 2 }),
  r('clock', 1, 'workbench', { wood: 6, copperbar: 2 }),
  r('furnace', 1, 'workbench', { stone: 16, wood: 4, torch: 3 }),
  r('anvil', 1, 'workbench', { copperbar: 8, stone: 10 }),
  r('alchemy', 1, 'workbench', { wood: 12, sporecap: 3, gel: 4 }),
  r('woodbow', 1, 'workbench', { wood: 10, hide: 1 }),
  r('fishingrod', 1, 'workbench', { wood: 8, hide: 1 }),
  r('arrows', 10, 'workbench', { wood: 1, stone: 1 }),
  r('leathercoat', 1, 'workbench', { hide: 8, batwing: 4 }),
  r('oilskin', 1, 'workbench', { hide: 4, coal: 2 }),
  r('wickpost', 2, 'workbench', { wood: 4, copperbar: 1, sporecap: 2 }, 2),

  // furnace
  r('copperbar', 1, 'furnace', { copper: 2 }),
  r('ironbar', 1, 'furnace', { iron: 2, coal: 1 }),
  r('silverbar', 1, 'furnace', { silver: 2, coal: 1 }),
  r('goldbar', 1, 'furnace', { gold: 2, coal: 1 }),
  r('voidbar', 1, 'furnace', { voidsteel: 2, magmacore: 1 }),

  // cooking (campfire or furnace)
  r('steak', 1, 'fire', { rawmeat: 1 }),
  r('roastshroom', 1, 'fire', { mushroom: 2 }),
  r('stew', 1, 'fire', { mushroom: 2, sporecap: 1, wood: 1 }),
  r('bread', 1, 'fire', { wheat: 3 }),
  r('grilledfish', 1, 'fire', { perch: 1 }),
  r('grilledfish', 1, 'fire', { trout: 1 }),
  r('grilledfish', 1, 'fire', { minnow: 2 }),
  r('grilledfish', 1, 'fire', { glowfin: 1 }),

  // anvil
  r('copperpick', 1, 'anvil', { copperbar: 10, wood: 4 }),
  r('stove', 1, 'anvil', { ironbar: 6, coal: 2 }),
  r('coppersword', 1, 'anvil', { copperbar: 8, wood: 2 }),
  r('copperlantern', 1, 'anvil', { copperbar: 4, torch: 2 }),
  r('rail', 12, 'anvil', { copperbar: 1, wood: 1 }),
  r('minecart', 1, 'anvil', { copperbar: 6, wood: 8 }),
  r('lamp', 2, 'anvil', { copperbar: 1, torch: 2 }),
  r('grapple', 1, 'anvil', { ironbar: 3, hide: 3 }),
  r('brassrod', 1, 'anvil', { ironbar: 3, copperbar: 2, wood: 4 }),
  r('coppershield', 1, 'anvil', { copperbar: 7 }),
  r('springboots', 1, 'anvil', { copperbar: 4, gel: 6, shell: 4 }),
  r('ironpick', 1, 'anvil', { ironbar: 12, wood: 4 }),
  r('ironsword', 1, 'anvil', { ironbar: 10 }),
  r('ironarmor', 1, 'anvil', { ironbar: 14, shell: 6 }),
  r('ironlantern', 1, 'anvil', { ironbar: 4, jade: 2 }),
  r('jadering', 1, 'anvil', { ironbar: 4, jade: 3 }),
  r('silverpick', 1, 'anvil', { silverbar: 14, amethyst: 4 }),
  r('silversword', 1, 'anvil', { silverbar: 12, amethyst: 2 }),
  r('silverlantern', 1, 'anvil', { silverbar: 5, sporecap: 4 }),
  r('crystalmail', 1, 'anvil', { silverbar: 10, amethyst: 8, silk: 8 }),
  r('crystalbow', 1, 'anvil', { silverbar: 8, amethyst: 6, silk: 4 }),
  r('goldpick', 1, 'anvil', { goldbar: 16, ruby: 4, diamond: 1 }),
  r('goldsword', 1, 'anvil', { goldbar: 14, ruby: 3 }),
  r('rubylantern', 1, 'anvil', { goldbar: 4, ruby: 4 }),
  r('locket', 1, 'anvil', { goldbar: 3, ruby: 2 }),
  r('emberward', 1, 'anvil', { magmacore: 5, horn: 4, ruby: 2 }),
  r('wingboots', 1, 'anvil', { goldbar: 6, essence: 6, batwing: 12 }),
  r('sunlens', 1, 'anvil', { goldbar: 6, ruby: 4, essence: 6 }),
  r('voidpick', 1, 'anvil', { voidbar: 18, lumenite: 6, diamond: 2 }),
  r('voidsword', 1, 'anvil', { voidbar: 15, lumenite: 5, diamond: 1 }),
  r('gloamplate', 1, 'anvil', { voidbar: 12, gear: 8, magmacore: 6 }),
  r('crystallantern', 1, 'anvil', { lumenite: 6, essence: 6 }),
  r('amulet', 1, 'anvil', { lumenite: 4, silverbar: 2 }),

  // alchemy
  r('tonic', 1, 'alchemy', { mushroom: 2, berries: 2, gel: 1 }),
  r('oil', 2, 'alchemy', { gel: 3, coal: 1 }),
  r('bomb', 3, 'alchemy', { coal: 3, gel: 2 }),
  r('recall', 1, 'alchemy', { batwing: 2, sporecap: 2, jade: 1 }),
  r('heartcrystal', 1, 'alchemy', { ash: 10, ruby: 1, essence: 2 }),
];
