/**
 * The lost: when the Wick grows bright enough to be seen from below, the townsfolk who fled
 * into the mountain answer it. Each is holed up by a dying fire somewhere in the dark; you go
 * down, find them, and lead them home into the Wick's light, where they reopen their trade.
 */
import type { BuildingKind } from '../state';

export type LostKind = Extract<BuildingKind, 'forge' | 'archive'>;

export interface LostDef {
  name: string;
  /** still sprite (camp) and 8-frame walk sheet (camp) */
  sprite: string;
  walk: string;
  /** metres below the meadow their fire burns */
  depth: [number, number];
  /** heard when the flame calls them (title card under the flame level) */
  call: string;
  /** what they say when you find them */
  found: string;
  /** chatter on the way home */
  lines: string[];
  /** when it is dark around you both */
  dark: string[];
  /** calling out from their fire when you are close */
  calls: string[];
  /** under the title card when they are home */
  home: string;
  /** said on the meadow, walking to their door */
  arrive: string;
}

export const LOST: Record<LostKind, LostDef> = {
  forge: {
    name: 'Brannoc',
    sprite: 'npc_smith',
    walk: 'walk_smith',
    depth: [34, 44],
    call: 'A hammer rings far below. Brannoc the smith is alive down there.',
    found: "A light! Ha! I've been striking sparks off the wall to keep the dark honest. Lead on, delver. I'll keep to your heels.",
    lines: [
      'Mind your footing. These old tunnels shift.',
      'Is the Wick truly burning? I had given up on it.',
      'Copper down here, if you have the arm for it.',
      'My forge will want a week of bellows after this.',
      "Don't lose that light on my account.",
      'Smells like coal smoke. Smells like home.',
      'I can hear them in the walls. Keep moving.',
    ],
    dark: ['Dark as a cold forge. Light something, quick.', "Stay close. I don't fancy being left down here again."],
    calls: ['Hello? Is that a light?', 'Over here! Down here!', '*clang* ... anyone?'],
    home: 'His forge roars again: picks sharpened, blades honed.',
    arrive: "Sky! Real sky! Give me an hour and that forge'll be roaring.",
  },
  archive: {
    name: 'Wren',
    sprite: 'npc_archivist',
    walk: 'walk_archivist',
    depth: [72, 86],
    call: 'A lantern answers from the Grotto. Wren the archivist is waiting to be found.',
    found: "You came! I've been reading by the last of my oil. Every page of this mountain is in my satchel. Take me home?",
    lines: [
      'The Grotto was a garden once. The old maps say so.',
      'Gloamlings hate a steady flame. Remember that.',
      "I've counted every step. We're nearly there. I think.",
      'If you find relics down here, I want to see them first.',
      'Your lantern is the nicest thing I have seen in weeks.',
      'Mind the moss. It is slippery and it judges you.',
    ],
    dark: ["Oh, I don't like this. Light, please. Light.", "It's watching us. I know how that sounds."],
    calls: ['Hello? Please be real.', 'Here! By the fire!', 'Is someone there? I can hear digging!'],
    home: "The Lantern Archive is open: relics, bounties and the delver's log.",
    arrive: 'Oh, the Wick! It is so much bigger than I remembered. Thank you.',
  },
};

export function isLostKind(k: BuildingKind | undefined): k is LostKind {
  return k === 'forge' || k === 'archive';
}

/** someone waiting by a fire in the dark (x, y: the tile they stand on), or following you home */
export interface LostSoul {
  kind: LostKind;
  x: number;
  y: number;
  following: boolean;
}
