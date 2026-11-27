/**
 * Meals. Anything cooked leaves you Well Fed for a few minutes, and each dish does something of its
 * own: meat fills you out, stew keeps the winter out, bread keeps hunger off, and a Miner's Pasty in
 * your pocket keeps the dark off your back. Only the last meal you ate counts, so what you eat before
 * you go down is part of packing for the trip. The plain dishes cook on any fire; the best of them
 * need a kitchen (a Stone Hearth or an Iron Stove), which is one more reason to keep a home.
 */

export type MealFx = 'hearty' | 'dig' | 'warm' | 'full' | 'mend' | 'lunch' | 'glow' | 'swift';

export interface MealDef {
  fx: MealFx;
  /** the Well Fed chip's name for it */
  name: string;
  /** how long it lasts */
  secs: number;
  /** more health, for the hearty ones */
  hp?: number;
  /** what it does, as the end of a sentence */
  does: string;
}

export const MEALS: Record<string, MealDef> = {
  steak: { fx: 'hearty', name: 'Hearty', secs: 180, hp: 10, does: '10 more health' },
  roastshroom: { fx: 'dig', name: 'Strong Arms', secs: 150, does: 'you mine 15% faster' },
  grilledfish: { fx: 'mend', name: 'Mending', secs: 180, does: 'you heal faster' },
  bread: { fx: 'full', name: 'Full', secs: 300, does: 'hunger comes on 40% slower' },
  stew: { fx: 'warm', name: 'Warm Belly', secs: 240, does: 'the cold and the chill of being wet bite half as hard' },
  pasty: { fx: 'lunch', name: "Delver's Lunch", secs: 420, does: 'the dark frays you 20% slower' },
  chowder: { fx: 'glow', name: 'Inner Glow', secs: 300, does: 'you shed a soft light of your own to see by' },
  tart: { fx: 'swift', name: 'Sugar Rush', secs: 240, does: 'you move 12% faster' },
  fishpie: { fx: 'hearty', name: 'Well Stuffed', secs: 360, hp: 25, does: '25 more health' },
};

export const MEAL_IDS = Object.keys(MEALS);

/** the line an item's description ends with */
export function mealNote(id: string): string {
  const m = MEALS[id];
  if (!m) return '';
  const mins = m.secs / 60;
  return ` Well Fed (${m.name}): ${m.does} for ${Number.isInteger(mins) ? mins : mins.toFixed(1)} minutes.`;
}
