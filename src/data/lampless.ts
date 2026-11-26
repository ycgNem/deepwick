/**
 * The Lampless: miners who went down and never came back, their lamps long dead. Light holds
 * one rooted to the spot, cowering, its arm over its eyes; in the dark it comes for you, and
 * where it walks your own flame gutters. Torches set on the wall do not gutter, so a torch
 * pins one where it stands.
 */

/** light (0..1+) that holds a Lampless still: your lantern or a torch clears it near you, your eyes' own glow does not */
export const HELD = 0.46;
/** within this many tiles of a Lampless your flame starts to gutter */
export const GUTTER_NEAR = 12;
/** seconds of sputtering before the flame drops */
export const GUTTER_WARN = 0.7;
/** seconds the flame stays low */
export const GUTTER_LEN = 0.75;
/** how far your light reaches while it is low (a share of its usual reach) */
export const GUTTER_DIM = 0.3;
/** seconds between one gutter and the next */
export const gutterGap = (): number => 4 + Math.random() * 3;
/** how many may walk near you at once, by biome (none above the Crystal Hollows) */
export const LAMPLESS_CAP = [0, 0, 1, 1, 2, 0];
/** whose lamps they were, in the order the Wick names them */
export const MINERS = [
  'Tamsin Hale',
  'Old Corran',
  "Pell's brother Arno",
  'Bryn Ashby',
  'Jory Penhale',
  'Mags Trelawn',
  'Idris Moyle',
  "Brannoc's apprentice Fenn",
  'Nan Treloar',
  'Wil Carrow',
  'Lowen Pascoe',
  'Edda Kemp',
  'Davy Kneebone',
  'Gwen Rowse',
  'Hob Strand',
  'Elowen Spargo',
  'Tobias Nance',
  'Kerra Vose',
  'Cador Bray',
  'Morwenna Dunstan',
  'Ned Hosking',
  'Ysolde Kitto',
  'Silas Opie',
  'Merryn Tregear',
];
