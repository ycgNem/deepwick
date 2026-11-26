/**
 * The Wick: the great lantern in the middle of Deepwick. You kindle it, then feed it the
 * glowing things you bring up from the mountain. Its flame level is the spine of the game:
 * it brings the settlers home, keeps the night back, and unlocks Wickposts.
 */
import { WORLD_W, SURFACE_Y } from '../constants';
import type { BuildingKind } from '../state';

/** the Wick stands in the spawn meadow, a few steps right of where a new delver wakes */
export const WICK_X = Math.floor(WORLD_W / 2) + 4;
/** the grass row its plinth stands on (the spawn meadow is always flat at this height) */
export const WICK_Y = SURFACE_Y;

export interface WickState {
  kindled: boolean;
  /** all the Lumen ever offered to it */
  lumen: number;
}

export interface FlameLevel {
  name: string;
  /** Lumen needed to reach this level (level 1 is reached by kindling) */
  need: number;
  /** how far its light reaches, in tiles: no Hollow survives inside it */
  radius: number;
  settler?: BuildingKind;
  /** what reaching this level gives you, for the panel and the toast */
  perk: string;
}

export const FLAME: FlameLevel[] = [
  { name: 'Cold', need: 0, radius: 0, perk: '' },
  { name: 'Kindled', need: 0, radius: 9, settler: 'trade', perk: 'Old Pell comes home and opens his Trading Post. At night, nothing from the dark survives inside the flame.' },
  { name: 'Glowing', need: 80, radius: 12, settler: 'forge', perk: 'A hammer answers from the tunnels: find Brannoc the smith and lead him home to relight his forge. You can build Wickposts to light the way down and travel home.' },
  { name: 'Bright', need: 260, radius: 15, settler: 'archive', perk: 'A lantern answers from the Grotto: bring Wren home to reopen the Lantern Archive (relics, bounties and the delver’s log).' },
  { name: 'Blazing', need: 650, radius: 18, settler: 'stillroom', perk: 'The Wick’s warmth stays with you: +20 max health. A voice answers from the Crystal Hollows: bring Hesper the apothecary home to open her Stillroom.' },
  { name: 'Radiant', need: 1500, radius: 22, perk: 'Its light reaches the deep: your lantern burns half as much oil.' },
];
export const MAX_FLAME = FLAME.length - 1;

/** what it takes to kindle the cold Wick */
export const KINDLING: Record<string, number> = { wood: 15, coal: 3 };

/** Lumen each glowing thing gives when offered: anything that holds light feeds the flame */
export const LUMEN: Record<string, number> = {
  sporecap: 5,
  gloammote: 6,
  glowfin: 12,
  jade: 12,
  gold: 10,
  essence: 18,
  amethyst: 18,
  magmacore: 22,
  ecto: 25,
  goldcarp: 30,
  ruby: 30,
  voidsteel: 35,
  crystalcarp: 40,
  lumenite: 80,
  diamond: 80,
  voidangler: 80,
};

export function flameLevel(w: WickState | undefined): number {
  if (!w || !w.kindled) return 0;
  let lvl = 1;
  for (let i = 2; i <= MAX_FLAME; i++) if (w.lumen >= FLAME[i].need) lvl = i;
  return lvl;
}

/** Lumen still needed for the next level, or 0 at full flame */
export function lumenToNext(w: WickState): number {
  const lvl = flameLevel(w);
  if (lvl === 0 || lvl >= MAX_FLAME) return 0;
  return FLAME[lvl + 1].need - w.lumen;
}

/** the Wick's light: centre of the glass, in tiles */
export const WICK_GLOW = { x: WICK_X + 0.5, y: WICK_Y - 3.6 };
