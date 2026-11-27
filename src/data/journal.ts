/**
 * The Journal: one goal at a time, walking the whole loop from a cold morning to the
 * Gloamheart. Each goal is judged by the state of the world, so doing things out of
 * order simply ticks them off when the Journal gets there.
 */
import type { Game } from '../game';
import { count } from '../state';
import { BIOMES } from './biomes';
import { FLAME, KINDLING } from './wick';
import { LOST } from './lost';

export interface Goal {
  id: string;
  /** the short line on the HUD */
  text: string;
  /** how to do it, shown in the Journal */
  how: string;
  /** [have, need] */
  progress(g: Game): [number, number];
  coins: number;
}

export interface Chapter {
  title: string;
  goals: Goal[];
}

const flag = (b: boolean): [number, number] => [b ? 1 : 0, 1];
const upTo = (have: number, need: number): [number, number] => [Math.min(have, need), need];
/** metres below the meadow where a biome begins */
const depthOf = (i: number): number => BIOMES[i].top - BIOMES[0].top;
const reach = (g: Game, i: number): [number, number] => upTo(g.p.maxDepth, depthOf(i));
/** crafted (this version) or placed (any version: the placing hint is remembered) */
const madeBench = (g: Game): boolean => !!(g.p.seen.made_workbench || g.p.seen.placeBench || g.p.seen.bench);
const flameTo = (g: Game, lvl: number): [number, number] => (g.flame >= lvl ? [1, 1] : upTo(g.p.wick.lumen, FLAME[lvl].need));

export const CHAPTERS: Chapter[] = [
  {
    title: 'The Cold Wick',
    goals: [
      {
        id: 'wood',
        text: 'Gather 10 Wood',
        how: 'Hold the left mouse button on a tree trunk. Bare hands are slow, but they work.',
        progress: (g) => (madeBench(g) || g.st.pickTier >= 1 || g.p.wick.kindled ? [10, 10] : upTo(count(g.p, 'wood'), 10)),
        coins: 10,
      },
      {
        id: 'bench',
        text: 'Craft a Workbench',
        how: 'Press Tab to open your pack: the Workbench is in the crafting list. Select it in the hotbar and click the ground to set it down.',
        progress: (g) => flag(madeBench(g) || g.st.pickTier >= 1 || g.p.wick.kindled),
        coins: 15,
      },
      {
        id: 'pick',
        text: 'Make a pickaxe',
        how: 'Stand by the Workbench and craft a Wooden Pickaxe (8 Wood). Click rock with anything in hand and you dig with your best pickaxe.',
        progress: (g) => flag(g.st.pickTier >= 1),
        coins: 20,
      },
      {
        id: 'coal',
        text: `Dig up ${KINDLING.coal} Coal`,
        how: 'Dig down from the meadow. Coal shows as black flecks in the stone not far below the grass.',
        progress: (g) => (g.p.wick.kindled ? [KINDLING.coal, KINDLING.coal] : upTo(count(g.p, 'coal'), KINDLING.coal)),
        coins: 20,
      },
      {
        id: 'kindle',
        text: 'Kindle the Wick',
        how: `Bring ${KINDLING.wood} Wood and ${KINDLING.coal} Coal to the great lantern in the meadow and press E. Nothing from the dark survives in its light.`,
        progress: (g) => flag(g.p.wick.kindled),
        coins: 40,
      },
    ],
  },
  {
    title: 'Into the Dark',
    goals: [
      {
        id: 'torches',
        text: 'Carry 6 Torches',
        how: 'Craft them by hand from Wood and Coal (or Gel). A torch in hand holds the dark, and your nerve, at bay. Set them on walls to light the way home.',
        progress: (g) => (g.flame >= 2 ? [6, 6] : upTo(count(g.p, 'torch'), 6)),
        coins: 25,
      },
      {
        id: 'depth30',
        text: 'Go 30m down',
        how: 'The dark frays your nerve (the purple bar). Keep light about you and it holds; let it run out and things come looking.',
        progress: (g) => upTo(g.p.maxDepth, 30),
        coins: 30,
      },
      {
        id: 'canary',
        text: 'Carry a canary',
        how: 'Below about 22m, firedamp (mine gas) waits sealed in the rock, and an open flame sets it off. Old Pell sells a canary: in your pack it smells gas through rock and sings faster the closer it is. Your lantern never lights the gas; a torch does.',
        progress: (g) => flag(!!g.p.seen.had_canary || count(g.p, 'canary') > 0),
        coins: 40,
      },
      {
        id: 'offer',
        text: 'Feed the Wick something that glows',
        how: 'Glowcaps, jade, amethyst, glowfin and Gloam Motes all hold light. Press E at the Wick to offer them.',
        progress: (g) => flag(g.p.wick.lumen > 0 || g.flame >= 2),
        coins: 30,
      },
      {
        id: 'night',
        text: 'Live through your first night',
        how: 'When the sun sets the Hollows climb out. Stay inside the Wick’s light, or build a bed and sleep through it.',
        progress: (g) => flag(g.p.stats.days >= 2),
        coins: 40,
      },
      {
        id: 'home',
        text: 'Sleep a night at home',
        how: 'A home is a closed room: walls all round, a roof over it and the door shut, built on the meadow or dug into the hill. Put a bed and a fire in it (a campfire will do; a Stone Hearth is better). Sleep there and you wake Rested: the dark frays you slower, you heal faster, and hunger and the cold bite less. Tables, seats, rugs and the like make it comfier, and the comfier it is, the longer Rested lasts.',
        progress: (g) => flag((g.p.tally?.rested ?? 0) >= 1),
        coins: 60,
      },
      {
        id: 'glowing',
        text: 'Raise the Wick to Glowing',
        how: `Offer ${FLAME[2].need} Lumen in all. Its light will be seen from deep below, and the Wick lets you build Wickposts.`,
        progress: (g) => flameTo(g, 2),
        coins: 60,
      },
      {
        id: 'brannoc',
        text: 'Bring Brannoc home',
        how: `Brannoc the smith is holed up by a fire in the tunnels, ${LOST.forge.depth[0]}-${LOST.forge.depth[1]}m down (the marker under your Journal and on the map points the way). Talk to him, then lead him back into the Wick's light: he keeps to your heels, and Wickposts and recall bring him along.`,
        progress: (g) => flag(g.p.buildings.some((b) => b.kind === 'forge')),
        coins: 80,
      },
    ],
  },
  {
    title: 'The Long Descent',
    goals: [
      {
        id: 'copper',
        text: 'Smelt a Copper Bar',
        how: 'A Furnace (16 Stone, 4 Wood, 3 Torches at a Workbench) turns 2 Copper ore into a bar. Copper is the orange-flecked rock.',
        progress: (g) => flag(!!g.p.seen.made_copperbar || count(g.p, 'copperbar') > 0 || g.st.pickTier >= 2),
        coins: 50,
      },
      {
        id: 'prop',
        text: 'Shore up bad ground',
        how: 'Cracked rock is loose: dig out what holds it up and it comes down on you. Make Timber Props by hand (3 Wood makes 2) and stand one under a bad roof; its cap board holds two tiles either side. Wet, weeping rock means water behind it.',
        progress: (g) => flag(!!g.p.seen.prop_placed),
        coins: 35,
      },
      {
        id: 'lantern',
        text: 'Equip a Lantern',
        how: 'Forge a Copper Lantern at an Anvil, or buy one from Pell. It lights the way hands-free while its oil lasts; F tops it up.',
        progress: (g) => flag(!!g.p.equip.lantern || !!g.p.hadLantern),
        coins: 60,
      },
      {
        id: 'wickpost',
        text: 'Plant a Wickpost',
        how: 'Wickposts (Workbench, once the Wick is Glowing) are lit waypoints: nothing spawns in their glow, and from any of them you can travel to the Wick and back.',
        progress: (g) => flag(!!g.p.seen.wickpost),
        coins: 60,
      },
      {
        id: 'pasty',
        text: "Bake a Miner's Pasty",
        how: "A hearth or a stove is a kitchen: stand by one and the pack shows what it can cook (a Stone Hearth is 20 Stone, 6 Clay and 2 Coal at a Workbench). A pasty takes raw meat, a Cave Mushroom and two wheat (Old Pell sells wheat) and makes two. It fills you up, and while you are Well Fed the dark frays you slower. Every dish feeds you something of its own: try them all.",
        progress: (g) => flag(!!g.p.seen.made_pasty || (g.p.tally?.meal_pasty ?? 0) > 0),
        coins: 60,
      },
      {
        id: 'grotto',
        text: `Reach the ${BIOMES[1].name}`,
        how: `It begins about ${depthOf(1)}m down: damp, green and full of glowcaps.`,
        progress: (g) => reach(g, 1),
        coins: 80,
      },
      {
        id: 'bright',
        text: 'Raise the Wick to Bright',
        how: `Offer ${FLAME[3].need} Lumen in all. The light will reach the Grotto, where someone is still waiting.`,
        progress: (g) => flameTo(g, 3),
        coins: 100,
      },
      {
        id: 'wren',
        text: 'Bring Wren home',
        how: `Wren the archivist is waiting by a fire in the ${BIOMES[1].name}, ${LOST.archive.depth[0]}-${LOST.archive.depth[1]}m down. Find her and lead her home into the Wick's light to reopen the Lantern Archive.`,
        progress: (g) => flag(g.p.buildings.some((b) => b.kind === 'archive')),
        coins: 120,
      },
    ],
  },
  {
    title: 'The Deep Places',
    goals: [
      {
        id: 'hollows',
        text: `Reach the ${BIOMES[2].name}`,
        how: `About ${depthOf(2)}m down, where the rock turns to crystal. The dark frays you faster the deeper you go.`,
        progress: (g) => reach(g, 2),
        coins: 120,
      },
      {
        id: 'lampless',
        text: 'Lay a Lampless to rest',
        how: 'From the Crystal Hollows down, the Lampless walk: lost miners who move only in the dark. Light holds one where it stands; near one, your own flame gutters and it lurches closer. Pin it with a torch on the wall and strike it while it cowers, then take its Cold Lamp home to the Wick.',
        progress: (g) => flag(!!g.p.seen.kill_lampless),
        coins: 60,
      },
      {
        id: 'blazing',
        text: 'Raise the Wick to Blazing',
        how: `Offer ${FLAME[4].need} Lumen in all. A Blazing Wick hardens you (+20 health), and its light reaches the ${BIOMES[2].name}.`,
        progress: (g) => flameTo(g, 4),
        coins: 150,
      },
      {
        id: 'hesper',
        text: 'Bring Hesper home',
        how: `Hesper the apothecary is singing by a fire in the ${BIOMES[2].name}, ${LOST.stillroom.depth[0]}-${LOST.stillroom.depth[1]}m down. Bring her home and she brews draughts for your nerve, tonics for your eyes and salve against the Gloam.`,
        progress: (g) => flag(g.p.buildings.some((b) => b.kind === 'stillroom')),
        coins: 180,
      },
      {
        id: 'ember',
        text: `Reach the ${BIOMES[3].name}`,
        how: `About ${depthOf(3)}m down, and scorching. An Emberward Talisman from the Anvil keeps the heat off.`,
        progress: (g) => reach(g, 3),
        coins: 180,
      },
      {
        id: 'vault',
        text: `Reach the ${BIOMES[4].name}`,
        how: `About ${depthOf(4)}m down. It drinks light and frays nerve twice as fast; a Sunglass Lens helps.`,
        progress: (g) => reach(g, 4),
        coins: 220,
      },
      {
        id: 'radiant',
        text: 'Raise the Wick to Radiant',
        how: `Offer ${FLAME[5].need} Lumen in all. A Radiant Wick makes lamp oil last twice as long.`,
        progress: (g) => flameTo(g, 5),
        coins: 260,
      },
      {
        id: 'tide',
        text: 'Hold the Wick through a Gloam Tide',
        how: 'Every fourth night from the third (once the Wick is Glowing) the dark rises against the town. Be there at nightfall, keep the Gloamlings off the flame, and ring the Wick with torches: light burns them.',
        progress: (g) => flag((g.p.tidesHeld ?? 0) > 0),
        coins: 200,
      },
      {
        id: 'heart',
        text: 'Still the Gloamheart',
        how: 'It beats at the bottom of the world, drinking the light. Go down ready.',
        progress: (g) => flag(g.p.bossDefeated),
        coins: 500,
      },
    ],
  },
];

/** the goal order saves were written with before goals were tracked by id */
export const OLD_GOAL_IDS = ['wood', 'bench', 'pick', 'coal', 'kindle', 'torches', 'depth30', 'offer', 'night', 'glowing', 'copper', 'lantern', 'wickpost', 'grotto', 'bright', 'hollows', 'blazing', 'ember', 'vault', 'radiant', 'tide', 'heart'];

/** every goal in order, with the chapter it belongs to */
export const GOALS: { goal: Goal; chapter: number }[] = CHAPTERS.flatMap((c, ci) => c.goals.map((goal) => ({ goal, chapter: ci })));

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

export function goalDone(g: Game, goal: Goal): boolean {
  const [have, need] = goal.progress(g);
  return have >= need;
}
