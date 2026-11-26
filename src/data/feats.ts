/**
 * Feats: the things a delver can be proud of, beyond the Journal's story. They give the long game
 * goals of its own (a full creel, every relic, a fortnight survived, a storm weathered) and a
 * little coin each. Shown on their own page in the Journal, each with its progress.
 */
import type { Game } from '../game';
import { MAX_FLAME } from './wick';
import { RELICS } from './items';
import { MINERS } from './lampless';

export interface Feat {
  id: string;
  name: string;
  desc: string;
  coins: number;
  /** how far along: [have, need] */
  progress(g: Game): [number, number];
}

/** every kind of fish there is to catch */
export const FISH = ['perch', 'trout', 'minnow', 'glowfin', 'goldcarp', 'crystalcarp', 'voidangler'];

const t = (g: Game, k: string): number => g.p.tally?.[k] ?? 0;
const yes = (b: boolean): [number, number] => [b ? 1 : 0, 1];
const home = (g: Game): number => ['forge', 'archive', 'stillroom'].filter((k) => g.p.buildings.some((b) => b.kind === k)).length;

export const FEATS: Feat[] = [
  { id: 'kindle', name: 'First Light', desc: 'Kindle the Wick.', coins: 25, progress: (g) => yes(g.p.wick.kindled) },
  { id: 'night1', name: 'Made It to Morning', desc: 'Live through your first night.', coins: 20, progress: (g) => [Math.min(1, g.p.stats.days - 1), 1] },
  { id: 'depth50', name: 'Into the Dark', desc: 'Go 50m down.', coins: 25, progress: (g) => [Math.min(50, g.p.maxDepth), 50] },
  { id: 'soaked', name: 'Soaked to the Bone', desc: 'Get soaked right through, in the rain or a swim.', coins: 15, progress: (g) => [t(g, 'soaked'), 1] },
  { id: 'gasp', name: 'Came Up Gasping', desc: 'Surface on your very last breath.', coins: 15, progress: (g) => [t(g, 'gasp'), 1] },
  { id: 'bolt', name: 'Struck Close', desc: 'See lightning come down right in front of you.', coins: 25, progress: (g) => [Math.min(1, t(g, 'bolt')), 1] },
  { id: 'unbroken', name: 'Frayed, Not Broken', desc: 'Be shaken by the dark, then steady your nerve all the way back.', coins: 40, progress: (g) => yes(t(g, 'shaken') > 0 && g.p.nerve >= 99.5) },
  { id: 'angler', name: 'Angler', desc: 'Catch 10 fish.', coins: 30, progress: (g) => [Math.min(10, t(g, 'fish')), 10] },
  { id: 'lamplighter', name: 'Lamplighter', desc: 'Place 50 torches.', coins: 40, progress: (g) => [Math.min(50, t(g, 'placed_torch')), 50] },
  { id: 'props', name: 'Shored Up', desc: 'Stand 10 Timber Props.', coins: 40, progress: (g) => [Math.min(10, t(g, 'placed_prop')), 10] },
  { id: 'tide', name: 'Hold the Line', desc: 'Hold the Wick through a Gloam Tide.', coins: 60, progress: (g) => [Math.min(1, g.p.tidesHeld ?? 0), 1] },
  { id: 'wickposts', name: 'The Lit Road', desc: 'Plant 5 Wickposts.', coins: 60, progress: (g) => [Math.min(5, t(g, 'placed_wickpost')), 5] },
  { id: 'pearls', name: 'Pearl Diver', desc: 'Wash 10 Cave Pearls out of the rock.', coins: 60, progress: (g) => [Math.min(10, t(g, 'pearls')), 10] },
  { id: 'names', name: 'Say Their Names', desc: 'Bring 5 Cold Lamps home to the Wick.', coins: 60, progress: (g) => [Math.min(5, g.p.lampsHome ?? 0), 5] },
  { id: 'ember', name: 'Ember-Walker', desc: 'Reach the Ember Depths.', coins: 80, progress: (g) => yes(g.maxBiome() >= 3) },
  { id: 'steady', name: 'Steady Hands', desc: 'Reach the Crystal Hollows without a single blackout.', coins: 100, progress: (g) => yes(g.p.stats.deaths === 0 && g.maxBiome() >= 2) },
  { id: 'relics', name: 'Curator', desc: 'Catalogue 10 relics at the Lantern Archive.', coins: 80, progress: (g) => [Math.min(10, g.p.catalogued.length), 10] },
  { id: 'bounties', name: 'Bounty Hunter', desc: 'Complete 10 bounties.', coins: 80, progress: (g) => [Math.min(10, g.p.bountiesDone), 10] },
  { id: 'fortnight', name: 'A Fortnight Down', desc: 'Survive 14 days.', coins: 100, progress: (g) => [Math.min(14, g.p.stats.days), 14] },
  { id: 'sunless', name: 'Sunless', desc: 'Reach the Sunless Vault.', coins: 120, progress: (g) => yes(g.maxBiome() >= 4) },
  { id: 'home', name: 'Homecoming', desc: 'Bring Brannoc, Wren and Hesper home.', coins: 150, progress: (g) => [home(g), 3] },
  { id: 'radiant', name: 'Radiant', desc: 'Raise the Wick to its fullest flame.', coins: 150, progress: (g) => [Math.min(MAX_FLAME, g.flame), MAX_FLAME] },
  { id: 'tides3', name: 'Tide Turner', desc: 'Hold the Wick through three Gloam Tides.', coins: 150, progress: (g) => [Math.min(3, g.p.tidesHeld ?? 0), 3] },
  { id: 'root', name: "The Mountain's Root", desc: 'Go 400m down.', coins: 200, progress: (g) => [Math.min(400, g.p.maxDepth), 400] },
  { id: 'allfish', name: 'Master Angler', desc: 'Catch every kind of fish in the mountain.', coins: 200, progress: (g) => [FISH.filter((f) => t(g, 'fish_' + f) > 0).length, FISH.length] },
  { id: 'alllamps', name: 'Every Name Said', desc: `Bring all ${MINERS.length} lost miners' lamps home.`, coins: 250, progress: (g) => [Math.min(MINERS.length, g.p.lampsHome ?? 0), MINERS.length] },
  { id: 'allrelics', name: 'Every Relic', desc: 'Catalogue every relic in the mountain.', coins: 300, progress: (g) => [g.p.catalogued.length, RELICS.length] },
  { id: 'stilled', name: 'Dawn over Deepwick', desc: 'Still the Gloamheart.', coins: 500, progress: (g) => yes(g.p.bossDefeated) },
  { id: 'lightbringer', name: 'Lightbringer', desc: 'Still the Gloamheart on Gloam difficulty.', coins: 1000, progress: (g) => yes(g.p.bossDefeated && g.p.mode === 'gloam') },
];
