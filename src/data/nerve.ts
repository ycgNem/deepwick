/**
 * Nerve: how much dark you can stand. Light steadies it, the dark wears it down, and a delver
 * with no nerve left is fair game for the things that live in the black.
 */
export const NERVE_MAX = 100;
/** below this the screen closes in and the whispering starts */
export const NERVE_FRAYED = 60;
/** below this the Gloamlings stop watching and start hunting */
export const NERVE_SHAKEN = 35;
/** light (0..1+) that counts as standing in the light: a held torch or a lit lantern clears it, the eye's own glow does not */
export const LIT = 0.6;
/** light bright enough to steady you */
export const STEADY = 0.8;

export const WHISPERS = [
  'turn back',
  'it sees you',
  'so dark down here',
  'the light is going',
  'behind you',
  'stay with us',
  'we were miners once',
  'it is hungry',
  'deeper',
  'your lamp is dying',
  'no one is coming',
  'listen',
];

export type ModeId = 'hearth' | 'delver' | 'gloam';

export interface ModeDef {
  id: ModeId;
  name: string;
  blurb: string;
  /** nerve drain */
  nerve: number;
  /** damage taken */
  dmg: number;
  hunger: number;
  /** share of coins lost on blacking out */
  coinLoss: number;
  /** blacking out leaves your pack in a satchel where you fell */
  dropOnDeath: boolean;
  /** how many Gloamlings the dark sends */
  gloam: number;
}

export const MODES: Record<ModeId, ModeDef> = {
  hearth: {
    id: 'hearth',
    name: 'Hearth',
    blurb: 'A gentler dark. Hits land softer, hunger is slow, and you keep your pack when you black out.',
    nerve: 0.5,
    dmg: 0.6,
    hunger: 0.6,
    coinLoss: 0,
    dropOnDeath: false,
    gloam: 0.5,
  },
  delver: {
    id: 'delver',
    name: 'Delver',
    blurb: 'The journey as intended. Black out and your pack waits where you fell, minus a tenth of your coin.',
    nerve: 1,
    dmg: 1,
    hunger: 1,
    coinLoss: 0.1,
    dropOnDeath: true,
    gloam: 1,
  },
  gloam: {
    id: 'gloam',
    name: 'Gloam',
    blurb: 'For the brave. The dark frays you faster, everything hits harder, more things hunt you, and blacking out costs a quarter of your coin.',
    nerve: 1.5,
    dmg: 1.35,
    hunger: 1.25,
    coinLoss: 0.25,
    dropOnDeath: true,
    gloam: 1.7,
  },
};

export const MODE_IDS: ModeId[] = ['hearth', 'delver', 'gloam'];
